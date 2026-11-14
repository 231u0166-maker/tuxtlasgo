// api/servicios/aprobados.ts
// GET /api/servicios/aprobados
// Devuelve los servicios aprobados como objetos Lugar para la app
// Endpoint público — solo muestra info validada

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'crypto';
import { getPool, asegurarTablaEventosServicio, asegurarColumnasServicio } from '../_lib/db.js';

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
    const rows = await pool.query(`
      SELECT s.id, s.nombre, s.categoria, s.municipio, s.descripcion,
             s.precio, s.contacto, s.lat, s.lng, s.codigo_seguimiento, s.fotos, s.fotos_pies,
             s.horario, s.dias_abierto, s.duracion, s.como_llegar, s.tip, s.ideal_para,
             s.mascotas, s.enlaces, s.acepta_reservaciones, s.monto_minimo, s.mostrar_usd_reservacion,
             s.fechas_bloqueadas, s.premium, s.premium_hasta,
             u.nombre AS propietario
      FROM servicios s
      JOIN usuarios u ON u.id = s.usuario_id
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