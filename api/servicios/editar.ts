// PATCH /api/servicios/editar — el prestador edita su propio servicio
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

function getPool() {
  return new Pool({
    connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
}
function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}
function getToken(req: VercelRequest) {
  const a = req.headers['authorization'] ?? '';
  return typeof a === 'string' && a.startsWith('Bearer ') ? a.slice(7) : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH')
    return res.status(405).json({ error: 'Método no permitido' });

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
    if (Array.isArray(ideal_para)) {
      campos.push(`ideal_para = $${idx++}`);
      valores.push(JSON.stringify(ideal_para));
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