// PATCH /api/servicios/editar                    → el prestador edita su propio servicio
// GET/POST/DELETE /api/servicios/editar?recurso=fotos → gestión de fotos (fusionado
// aquí para no pasarnos del límite de 12 funciones serverless del plan Hobby de Vercel)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? 'din6nzl1s',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function getPool() {
  return new Pool({
    connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
}
function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}
function getToken(req: VercelRequest) {
  const a = req.headers['authorization'] ?? '';
  return typeof a === 'string' && a.startsWith('Bearer ') ? a.slice(7) : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  const pool = getPool();
  try {
    const sess = await pool.query(
      `SELECT u.id FROM sesiones s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token = $1 AND s.expira_en > NOW() AND u.tipo = 'prestador'`,
      [token]
    );
    if (sess.rows.length === 0)
      return res.status(401).json({ error: 'Sesión inválida' });
    const usuarioId = sess.rows[0].id;

    // ── ?recurso=fotos — gestión de fotos (antes api/servicios/fotos.ts) ──
    if (req.query.recurso === 'fotos') {
      const srv = await pool.query(
        `SELECT id, fotos FROM servicios WHERE usuario_id=$1 ORDER BY creado_en DESC LIMIT 1`,
        [usuarioId]
      );
      if (srv.rows.length === 0) return res.status(404).json({ error: 'Sin servicio registrado' });
      const servicio = srv.rows[0];
      const fotosActuales: string[] = servicio.fotos ?? [];

      if (req.method === 'GET') {
        return res.status(200).json({ ok: true, fotos: fotosActuales });
      }

      if (req.method === 'POST') {
        const { url } = req.body;
        if (!url?.startsWith('https://')) return res.status(400).json({ error: 'URL inválida' });
        if (fotosActuales.length >= 8) return res.status(400).json({ error: 'Máximo 8 fotos' });
        if (fotosActuales.includes(url)) return res.status(400).json({ error: 'Foto ya existe' });
        const nuevas = [...fotosActuales, url];
        await pool.query(`UPDATE servicios SET fotos=$1, actualizado_en=NOW() WHERE id=$2`, [JSON.stringify(nuevas), servicio.id]);
        return res.status(200).json({ ok: true, fotos: nuevas });
      }

      if (req.method === 'DELETE') {
        const { url, publicId } = req.body;
        if (publicId) {
          try { await cloudinary.uploader.destroy(publicId); } catch (e) { console.warn('Cloudinary delete:', e); }
        }
        const nuevas = fotosActuales.filter((f: string) => f !== url);
        await pool.query(`UPDATE servicios SET fotos=$1, actualizado_en=NOW() WHERE id=$2`, [JSON.stringify(nuevas), servicio.id]);
        return res.status(200).json({ ok: true, fotos: nuevas });
      }

      return res.status(405).json({ error: 'Método no permitido' });
    }

    // ── PATCH normal — editar campos del servicio ──────────────
    if (req.method !== 'PATCH')
      return res.status(405).json({ error: 'Método no permitido' });

    const srv = await pool.query(
      `SELECT id FROM servicios WHERE usuario_id = $1
       ORDER BY creado_en DESC LIMIT 1`,
      [usuarioId]
    );
    if (srv.rows.length === 0)
      return res.status(404).json({ error: 'Sin servicio registrado' });
    const servicioId = srv.rows[0].id;

    const {
      // Campos originales
      nombre, categoria, municipio, descripcion, precio, contacto,
      // Campos nuevos (Módulo 1 — consistencia PlaceCard)
      horario, dias_abierto, duracion, como_llegar, tip, ideal_para,
      // Política de mascotas — texto libre corto, ej. "Sí, aceptamos
      // perros" / "No se permiten mascotas". Sin dato = no se sabe,
      // el chat nunca debe inventarlo.
      mascotas,
      // Centro de Prestador — pestaña Enlaces (shell, sin pagos reales).
      enlaces,
      // Cuenta de cobro — a dónde le llega su parte cuando exista el
      // reparto 94%/6% de reservaciones (ver PDF de plan de negocio).
      // Por ahora solo se guarda el dato, sin lógica de reparto real.
      cuenta_cobro,
      // Reservaciones (Módulo 2 — pieza 2) — el prestador decide si
      // acepta, qué política de cancelación usa, y qué fechas bloquea.
      acepta_reservaciones, politica_cancelacion, fechas_bloqueadas,
    } = req.body ?? {};

    const campos: string[] = [];
    const valores: unknown[] = [];
    let idx = 1;

    // ── Campos originales ────────────────────────────────────
    if (nombre?.trim()?.length >= 3) {
      campos.push(`nombre = $${idx++}`);
      valores.push(nombre.trim());
    }
    if (categoria) {
      campos.push(`categoria = $${idx++}`);
      valores.push(categoria);
    }
    if (municipio) {
      campos.push(`municipio = $${idx++}`);
      valores.push(municipio);
    }
    if (descripcion?.trim()?.length >= 20) {
      campos.push(`descripcion = $${idx++}`);
      valores.push(descripcion.trim());
    }
    if (precio?.trim()) {
      campos.push(`precio = $${idx++}`);
      valores.push(precio.trim());
    }
    if (contacto?.trim()) {
      campos.push(`contacto = $${idx++}`);
      valores.push(contacto.trim());
    }

    // ── Campos nuevos para PlaceCard completa ────────────────
    if (typeof horario === 'string') {
      campos.push(`horario = $${idx++}`);
      valores.push(horario.trim() || null);
    }
    if (typeof dias_abierto === 'string') {
      campos.push(`dias_abierto = $${idx++}`);
      valores.push(dias_abierto.trim() || null);
    }
    if (typeof duracion === 'string') {
      campos.push(`duracion = $${idx++}`);
      valores.push(duracion.trim() || null);
    }
    if (typeof como_llegar === 'string') {
      campos.push(`como_llegar = $${idx++}`);
      valores.push(como_llegar.trim() || null);
    }
    if (typeof tip === 'string') {
      campos.push(`tip = $${idx++}`);
      valores.push(tip.trim() || null);
    }
    if (typeof mascotas === 'string') {
      campos.push(`mascotas = $${idx++}`);
      valores.push(mascotas.trim() || null);
    }
    if (Array.isArray(ideal_para)) {
      campos.push(`ideal_para = $${idx++}`);
      valores.push(JSON.stringify(ideal_para));
    }
    if (Array.isArray(enlaces)) {
      campos.push(`enlaces = $${idx++}`);
      valores.push(JSON.stringify(enlaces));
    }
    if (cuenta_cobro && typeof cuenta_cobro === 'object') {
      campos.push(`cuenta_cobro = $${idx++}`);
      valores.push(JSON.stringify(cuenta_cobro));
    }
    if (typeof acepta_reservaciones === 'boolean') {
      // Premium y Reservaciones son independientes (visibilidad vs.
      // comisión por reservación — ver plan de negocio: "cada peso
      // corresponde a un beneficio recibido"). Lo único que de
      // verdad hace falta para activar reservaciones es tener
      // Mercado Pago conectado — sin eso no hay a dónde depositarle
      // su parte cuando se pague una reserva. Se revalida aquí
      // porque el frontend puede mentir, la base de datos no.
      if (acepta_reservaciones) {
        const mpRow = await pool.query(
          `SELECT mp_conectado FROM servicios WHERE id = $1`,
          [servicioId]
        );
        if (!mpRow.rows[0]?.mp_conectado) {
          return res.status(403).json({ error: 'Conecta tu cuenta de Mercado Pago antes de aceptar reservaciones' });
        }
      }
      campos.push(`acepta_reservaciones = $${idx++}`);
      valores.push(acepta_reservaciones);
    }
    if (politica_cancelacion === 'flexible' || politica_cancelacion === 'no_reembolsable') {
      campos.push(`politica_cancelacion = $${idx++}`);
      valores.push(politica_cancelacion);
    }
    if (Array.isArray(fechas_bloqueadas)) {
      campos.push(`fechas_bloqueadas = $${idx++}`);
      valores.push(JSON.stringify(fechas_bloqueadas));
    }

    if (campos.length === 0)
      return res.status(400).json({ error: 'Sin campos para actualizar' });

    campos.push(`actualizado_en = NOW()`);
    valores.push(servicioId);

    await pool.query(
      `UPDATE servicios SET ${campos.join(', ')} WHERE id = $${idx}`,
      valores
    );

    // Devolver el servicio actualizado completo
    const updated = await pool.query(
      `SELECT id, nombre, categoria, municipio, descripcion, precio,
              contacto, lat, lng, estado, codigo_seguimiento,
              motivo_rechazo, fotos,
              horario, dias_abierto, duracion, como_llegar, tip, ideal_para,
              mascotas, enlaces, premium, premium_desde, premium_hasta, cuenta_cobro, mp_conectado, mp_user_id,
              acepta_reservaciones, politica_cancelacion, fechas_bloqueadas,
              creado_en, actualizado_en
       FROM servicios WHERE id = $1`,
      [servicioId]
    );

    return res.status(200).json({ ok: true, servicio: updated.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + String(err) });
  } finally {
    await pool.end();
  }
}