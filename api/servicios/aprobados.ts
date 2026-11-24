// api/servicios/aprobados.ts
// GET /api/servicios/aprobados
// Devuelve los servicios aprobados como objetos Lugar para la app
// Endpoint público — solo muestra info validada

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'crypto';
import { getPool, asegurarTablaEventosServicio, asegurarTablaVisitasSitio, asegurarColumnasServicio } from '../_lib/db.js';
import { esAdmin, ipDe } from '../_lib/seguridad.js';

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function parseFotos(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

function parsePies(raw: any): Record<string, string> | undefined {
  let o = raw;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch { return undefined; } }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined;
  const limpio: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) if (typeof v === 'string' && v.trim()) limpio[k] = v.trim();
  return Object.keys(limpio).length ? limpio : undefined;
}

function parseIdeal(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

function parseEnlaces(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

function parseArrayGenerico(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const pool = getPool();

  // ── POST ?recurso=visita — una visita al sitio (cualquier dominio). Público y
  // fire-and-forget. Una visita por visitante+IP cada 30 min (evita contar recargas).
  if (req.method === 'POST' && req.query.recurso === 'visita') {
    try {
      const { ruta, visitante } = req.body ?? {};
      const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim().toLowerCase().slice(0, 100);
      const rutaLimpia = typeof ruta === 'string' ? ruta.slice(0, 120) : '';
      const vis = typeof visitante === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(visitante) ? visitante : null;
      const ipHash = createHash('sha256').update(ipDe(req) + (process.env.EVENTOS_SAL ?? 'tuxtlasgo')).digest('hex').slice(0, 32);
      await asegurarTablaVisitasSitio(pool);
      const ip = ipDe(req).slice(0, 64);
      // Si trae sesión, la visita se liga a la cuenta (para el registro del admin).
      let usuarioId: number | null = null;
      const auth = req.headers['authorization'];
      if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
        const u = await pool.query('SELECT usuario_id FROM sesiones WHERE token = $1 AND expira_en > NOW() LIMIT 1', [auth.slice(7)]);
        usuarioId = u.rows[0]?.usuario_id ?? null;
      }
      const reciente = await pool.query(
        `SELECT 1 FROM visitas_sitio WHERE ip_hash = $1 AND host = $2 AND COALESCE(visitante,'') = COALESCE($3,'')
           AND creado_en > NOW() - INTERVAL '30 minutes' LIMIT 1`,
        [ipHash, host, vis]
      );
      if (reciente.rows.length === 0) {
        const pais = String(req.headers['x-vercel-ip-country'] ?? '').slice(0, 2) || null;
        let ciudad: string | null = null;
        try { ciudad = decodeURIComponent(String(req.headers['x-vercel-ip-city'] ?? '')).slice(0, 80) || null; } catch { /* cabecera mal codificada */ }
        const ua = String(req.headers['user-agent'] ?? '');
        const dispositivo = (/Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iPhone/iPad'
          : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Otro')
          + (/Mobile/i.test(ua) ? ' (móvil)' : '');
        await pool.query(
          'INSERT INTO visitas_sitio (host, ruta, visitante, ip_hash, pais, ip, ciudad, dispositivo, usuario_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [host, rutaLimpia, vis, ipHash, pais, ip, ciudad, dispositivo, usuarioId]
        );
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) });
    } finally {
      await pool.end();
    }
  }

  // ── GET ?recurso=visitantes_sitio — solo admin: registro de cada IP que ha entrado
  // (desde que existe el registro), con primera/última visita y cuenta si inició sesión.
  if (req.method === 'GET' && req.query.recurso === 'visitantes_sitio') {
    try {
      if (!esAdmin(req)) return res.status(401).json({ ok: false, error: 'No autorizado' });
      await asegurarTablaVisitasSitio(pool);
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 64) : '';
      const limite = 100;
      const pagina = Math.max(0, Number(req.query.pagina) || 0);
      const filas = await pool.query(
        `SELECT v.ip, COUNT(*) AS visitas, MIN(v.creado_en) AS primera, MAX(v.creado_en) AS ultima,
                (ARRAY_AGG(v.host ORDER BY v.creado_en DESC))[1] AS host,
                (ARRAY_AGG(v.pais ORDER BY v.creado_en DESC))[1] AS pais,
                (ARRAY_AGG(v.ciudad ORDER BY v.creado_en DESC))[1] AS ciudad,
                (ARRAY_AGG(v.dispositivo ORDER BY v.creado_en DESC))[1] AS dispositivo,
                MAX(u.nombre) AS cuenta, MAX(u.correo) AS correo,
                COUNT(*) OVER () AS total
         FROM visitas_sitio v LEFT JOIN usuarios u ON u.id = v.usuario_id
         WHERE v.ip IS NOT NULL AND ($1 = '' OR v.ip ILIKE '%' || $1 || '%')
         GROUP BY v.ip ORDER BY MAX(v.creado_en) DESC LIMIT $2 OFFSET $3`,
        [q, limite, pagina * limite]
      );
      return res.status(200).json({
        ok: true, total: Number(filas.rows[0]?.total ?? 0), pagina, limite,
        visitantes: filas.rows.map((f: any) => ({
          ip: f.ip, visitas: Number(f.visitas), primera: f.primera, ultima: f.ultima, host: f.host,
          pais: f.pais, ciudad: f.ciudad, dispositivo: f.dispositivo, cuenta: f.cuenta ?? null, correo: f.correo ?? null,
        })),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) });
    } finally {
      await pool.end();
    }
  }

  // ── GET ?recurso=visitas_sitio — solo admin: IPs distintas, por dominio, día y país.
  if (req.method === 'GET' && req.query.recurso === 'visitas_sitio') {
    try {
      if (!esAdmin(req)) return res.status(401).json({ ok: false, error: 'No autorizado' });
      await asegurarTablaVisitasSitio(pool);
      const dias = Math.min(90, Math.max(1, Number(req.query.dias) || 30));
      const [tot, porHost, porDia, porPais] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS visitas, COUNT(DISTINCT ip_hash) AS ips, COUNT(DISTINCT visitante) AS visitantes,
                  COUNT(DISTINCT ip_hash) FILTER (WHERE creado_en > NOW() - INTERVAL '24 hours') AS ips_24h
           FROM visitas_sitio WHERE creado_en > NOW() - make_interval(days => $1)`, [dias]),
        pool.query(
          `SELECT host, COUNT(*) AS visitas, COUNT(DISTINCT ip_hash) AS ips FROM visitas_sitio
           WHERE creado_en > NOW() - make_interval(days => $1) GROUP BY host ORDER BY ips DESC`, [dias]),
        pool.query(
          `SELECT to_char(creado_en::date,'YYYY-MM-DD') AS dia, COUNT(*) AS visitas, COUNT(DISTINCT ip_hash) AS ips
           FROM visitas_sitio WHERE creado_en > NOW() - make_interval(days => $1) GROUP BY 1 ORDER BY 1`, [dias]),
        pool.query(
          `SELECT COALESCE(pais,'?') AS pais, COUNT(DISTINCT ip_hash) AS ips FROM visitas_sitio
           WHERE creado_en > NOW() - make_interval(days => $1) GROUP BY 1 ORDER BY ips DESC LIMIT 10`, [dias]),
      ]);
      const n = (v: any) => Number(v ?? 0);
      return res.status(200).json({
        ok: true, dias,
        visitas: n(tot.rows[0].visitas), ipsDistintas: n(tot.rows[0].ips),
        visitantesDistintos: n(tot.rows[0].visitantes), ipsUltimas24h: n(tot.rows[0].ips_24h),
        porDominio: porHost.rows.map((f: any) => ({ host: f.host, visitas: n(f.visitas), ips: n(f.ips) })),
        porDia: porDia.rows.map((f: any) => ({ dia: f.dia, visitas: n(f.visitas), ips: n(f.ips) })),
        porPais: porPais.rows.map((f: any) => ({ pais: f.pais, ips: n(f.ips) })),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) });
    } finally {
      await pool.end();
    }
  }

  // ── POST ?recurso=evento — tracking público (sin sesión) de vistas,
  // likes y recomendaciones de IA. Público a propósito: la mayoría de
  // quienes ven un servicio son turistas navegando sin cuenta. No
  // devuelve nunca un error visible al usuario — es fire-and-forget
  // desde el frontend, perder un evento ocasional no es grave.
  if (req.method === 'POST' && req.query.recurso === 'evento') {
    try {
      const { servicio_id, tipo, visitante } = req.body ?? {};
      const tiposValidos = ['vista', 'like', 'unlike', 'ia_recomendacion'];
      const servicioId = Number(servicio_id);
      if (!servicioId || !tiposValidos.includes(tipo)) {
        return res.status(400).json({ ok: false, error: 'Datos inválidos' });
      }
      // Sin id de visitante no se puede saber si es la misma persona de
      // antes (versiones viejas de la app en caché): se ignora el evento
      // en vez de contarlo sin control.
      if (typeof visitante !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(visitante)) {
        return res.status(200).json({ ok: true, omitido: 'sin visitante' });
      }
      await asegurarTablaEventosServicio(pool);

      // El dueño del servicio viendo o dándole like a su propio negocio no
      // cuenta (solo se detecta si manda su sesión).
      const auth = req.headers['authorization'];
      if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
        const dueno = await pool.query(
          `SELECT 1 FROM sesiones ss JOIN servicios s ON s.usuario_id = ss.usuario_id
           WHERE ss.token = $1 AND ss.expira_en > NOW() AND s.id = $2 LIMIT 1`,
          [auth.slice(7), servicioId]
        );
        if (dueno.rows.length > 0) return res.status(200).json({ ok: true, omitido: 'es el dueño' });
      }

      // Quitar el favorito resta el like de ese visitante.
      if (tipo === 'unlike') {
        await pool.query(
          `DELETE FROM eventos_servicio WHERE servicio_id = $1 AND tipo = 'like' AND visitante = $2`,
          [servicioId, visitante]
        );
        return res.status(200).json({ ok: true });
      }

      // Un mismo visitante cuenta: 1 like por servicio (mientras lo conserve);
      // 1 vista y 1 recomendación de IA por servicio cada 24 horas.
      const repetido = await pool.query(
        tipo === 'like'
          ? `SELECT 1 FROM eventos_servicio WHERE servicio_id = $1 AND tipo = $2 AND visitante = $3 LIMIT 1`
          : `SELECT 1 FROM eventos_servicio WHERE servicio_id = $1 AND tipo = $2 AND visitante = $3
               AND creado_en > NOW() - INTERVAL '24 hours' LIMIT 1`,
        [servicioId, tipo, visitante]
      );
      if (repetido.rows.length > 0) return res.status(200).json({ ok: true, omitido: 'repetido' });

      // Tope por IP: inventar ids de visitante no basta para inflar. Es
      // holgado (5 por tipo y servicio al día) para no castigar a varios
      // turistas reales detrás del mismo Wi-Fi.
      const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '').split(',')[0].trim();
      const ipHash = createHash('sha256').update(ip + (process.env.EVENTOS_SAL ?? 'tuxtlasgo')).digest('hex').slice(0, 32);
      const porIp = await pool.query(
        `SELECT COUNT(*) AS n FROM eventos_servicio WHERE servicio_id = $1 AND tipo = $2 AND ip_hash = $3
           AND creado_en > NOW() - INTERVAL '24 hours'`,
        [servicioId, tipo, ipHash]
      );
      if (Number(porIp.rows[0].n) >= 5) return res.status(200).json({ ok: true, omitido: 'tope por IP' });

      await pool.query(
        'INSERT INTO eventos_servicio (servicio_id, tipo, visitante, ip_hash) VALUES ($1, $2, $3, $4)',
        [servicioId, tipo, visitante, ipHash]
      );
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) });
    } finally {
      await pool.end();
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    await asegurarColumnasServicio(pool);
    await asegurarTablaEventosServicio(pool);
    const rows = await pool.query(`
      SELECT s.id, s.nombre, s.categoria, s.municipio, s.descripcion,
             s.precio, s.contacto, s.lat, s.lng, s.codigo_seguimiento, s.fotos, s.fotos_pies,
             s.horario, s.dias_abierto, s.duracion, s.como_llegar, s.tip, s.ideal_para,
             s.mascotas, s.enlaces, s.acepta_reservaciones, s.monto_minimo, s.mostrar_usd_reservacion,
             s.fechas_bloqueadas, s.premium, s.premium_hasta,
             u.nombre AS propietario,
             COALESCE(v.n, 0) AS vistas
      FROM servicios s
      JOIN usuarios u ON u.id = s.usuario_id
      LEFT JOIN (SELECT servicio_id, COUNT(*) AS n FROM eventos_servicio WHERE tipo = 'vista' GROUP BY servicio_id) v
        ON v.servicio_id = s.id
      WHERE s.estado = 'aprobado'
      ORDER BY s.actualizado_en DESC NULLS LAST
    `);

    const lugares = rows.rows.map((s: any) => {
      const fotos = parseFotos(s.fotos);
      const ideal = parseIdeal(s.ideal_para);

      return {
        // ── ID unificado: 'prestador-X' igual que servicioComoLugar() ──
        // Así recargarCatalogo() puede deduplicar correctamente.
        id: `prestador-${s.id}`,
        nombre: s.nombre,
        categoria: s.categoria,
        municipio: s.municipio,
        descripcionCorta: s.descripcion.substring(0, 80) + (s.descripcion.length > 80 ? '…' : ''),
        descripcion: s.descripcion,
        coords: [
          s.lat ? parseFloat(s.lat) : 18.417,
          s.lng ? parseFloat(s.lng) : -95.110,
        ],
        rating: 0,
        precio: 'medio',
        precioMxn: s.precio || 'Consultar precio',
        // ── Campos nuevos (Módulo 1) ──────────────────────────────
        duracionSugerida: s.duracion || 'Variable',
        imagen: fotos.length > 0 ? fotos[0] : '/logo-tuxtlasgo.png',
        imagenesExtra: fotos.length > 1 ? fotos.slice(1) : [],
        // Texto debajo de cada foto (solo las que tienen), por URL.
        pies: parsePies(s.fotos_pies),
        tags: [s.categoria.toLowerCase(), s.municipio.toLowerCase()],
        ideal: ideal.length > 0 ? ideal : ['familia', 'pareja', 'amigos', 'solo'],
        abierto: {
          dias: s.dias_abierto || 'Consultar disponibilidad',
          horario: s.horario || 'Consultar horario',
        },
        comoLlegar: s.como_llegar || `En ${s.municipio}. Contacto: ${s.contacto}`,
        tip: s.tip || undefined,
        verificado: true,
        contacto: s.contacto || '',
        mascotas: s.mascotas || undefined,
        // Bug real de producción (encontrado en QA): esta consulta no
        // traía `premium`/`premium_hasta` de la base — un prestador
        // podía pagar el Plan Premium ($89 MXN/mes), la tabla
        // `servicios` se actualizaba bien (ver api/pagos/mercadopago.ts),
        // pero el catálogo que consume la IA nunca se enteraba, así que
        // el bono de posicionamiento (chatbot.ts, filtrarLugaresConRazones)
        // no aplicaba nunca en producción. Mismo criterio de vigencia
        // que ya usa el catálogo local offline (db.ts: listarServiciosAprobadosComoLugares).
        premium: !!s.premium && (!s.premium_hasta || new Date(s.premium_hasta) > new Date()),
        esPrestador: true,
        codigoSeguimiento: s.codigo_seguimiento,
        enlaces: parseEnlaces(s.enlaces).length > 0 ? parseEnlaces(s.enlaces) : undefined,
        aceptaReservaciones: !!s.acepta_reservaciones,
        servicioId: s.id,
        // Veces que se ha visto la ficha (1 por visitante cada 24 h; no cuenta al dueño).
        vistas: Number(s.vistas) || 0,
        montoMinimo: s.monto_minimo != null ? Number(s.monto_minimo) : null,
        mostrarUsdReservacion: !!s.mostrar_usd_reservacion,
        // Público a propósito — son solo fechas ya ocupadas, el
        // calendario grande del turista las necesita para pintarlas
        // bloqueadas sin tener que consultarlas una por una.
        fechasBloqueadas: parseArrayGenerico(s.fechas_bloqueadas ?? '[]'),
      };
    });

    return res.status(200).json({ ok: true, lugares, total: lugares.length });
  } catch (err) {
    console.error('[aprobados]', err);
    return res.status(500).json({ ok: false, lugares: [], error: String(err) });
  } finally {
    await pool.end();
  }
}