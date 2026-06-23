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
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,DELETE,OPTIONS');
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
      `SELECT u.id, u.nombre, u.correo, u.tipo, u.foto_url, u.bio
       FROM sesiones s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token = $1 AND s.expira_en > NOW()`,
      [token]
    );
    if (sess.rows.length === 0)
      return res.status(401).json({ error: 'Sesión inválida' });
    const usuario = sess.rows[0];

    // ─── GET: obtener perfil completo ───────────────────────
    if (req.method === 'GET') {
      let servicio = null;
      if (usuario.tipo === 'prestador') {
        const sr = await pool.query(
          `SELECT id, nombre, categoria, municipio, descripcion, precio,
                  contacto, lat, lng, estado, codigo_seguimiento,
                  motivo_rechazo, fotos,
                  horario, dias_abierto, duracion, como_llegar, tip, ideal_para,
                  creado_en, actualizado_en
           FROM servicios
           WHERE usuario_id = $1
           ORDER BY creado_en DESC
           LIMIT 1`,
          [usuario.id]
        );
        servicio = sr.rows[0] ?? null;
        if (
          servicio &&
          !servicio.notificado &&
          servicio.estado !== 'pendiente'
        )
          await pool.query(
            'UPDATE servicios SET notificado = TRUE WHERE id = $1',
            [servicio.id]
          );
      }
      return res.status(200).json({ ok: true, usuario, servicio });
    }

    // ─── PATCH: actualizar perfil del usuario (nombre, bio, foto_url) ──
    if (req.method === 'PATCH') {
      const { nombre, bio, foto_url } = req.body ?? {};
      const campos: string[] = [];
      const valores: unknown[] = [];
      let idx = 1;

      if (nombre?.trim()?.length >= 2) {
        campos.push(`nombre = $${idx++}`);
        valores.push(nombre.trim());
      }
      if (typeof bio === 'string') {
        campos.push(`bio = $${idx++}`);
        valores.push(bio.slice(0, 300)); // máx 300 chars
      }
      if (foto_url?.startsWith('https://')) {
        campos.push(`foto_url = $${idx++}`);
        valores.push(foto_url);
      }

      if (campos.length === 0)
        return res.status(400).json({ error: 'Sin campos para actualizar' });

      valores.push(usuario.id);
      await pool.query(
        `UPDATE usuarios SET ${campos.join(', ')} WHERE id = $${idx}`,
        valores
      );

      const actualizado = await pool.query(
        'SELECT id, nombre, correo, tipo, foto_url, bio FROM usuarios WHERE id = $1',
        [usuario.id]
      );
      return res
        .status(200)
        .json({ ok: true, usuario: actualizado.rows[0] });
    }

    // ─── DELETE: cerrar sesión ───────────────────────────────
    if (req.method === 'DELETE') {
      await pool.query('DELETE FROM sesiones WHERE token = $1', [token]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + String(err) });
  } finally {
    await pool.end();
  }
}