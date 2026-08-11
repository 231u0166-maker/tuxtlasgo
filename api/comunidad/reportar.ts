// POST /api/comunidad/reportar — reporta una publicación (requiere sesión)
// Moderación mínima pero real: un usuario solo puede reportar la
// misma publicación una vez (índice único), y al llegar a 3 reportes
// distintos se oculta sola del feed público — sin depender de que un
// administrador esté viendo la plataforma en ese momento.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

const UMBRAL_OCULTAR = 3;

function getPool() {
  return new Pool({ connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
}
function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}
function getToken(req: VercelRequest) {
  const a = req.headers['authorization'] ?? '';
  return typeof a === 'string' && a.startsWith('Bearer ') ? a.slice(7) : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'Inicia sesión para reportar' });

  const { id } = req.body ?? {};
  if (!id) return res.status(400).json({ error: 'Falta id de la publicación' });

  const pool = getPool();
  try {
    const sess = await pool.query(
      `SELECT u.id FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token = $1 AND s.expira_en > NOW()`,
      [token]
    );
    if (sess.rows.length === 0) return res.status(401).json({ error: 'Sesión inválida' });
    const usuarioId = sess.rows[0].id;

    try {
      await pool.query(
        'INSERT INTO comunidad_reportes (publicacion_id, usuario_id) VALUES ($1, $2)',
        [id, usuarioId]
      );
    } catch {
      // Índice único violado = ya lo había reportado antes
      return res.status(200).json({ ok: true, yaReportado: true });
    }

    const conteo = await pool.query(
      'SELECT COUNT(*)::int AS total FROM comunidad_reportes WHERE publicacion_id = $1',
      [id]
    );
    const total = conteo.rows[0].total;

    if (total >= UMBRAL_OCULTAR) {
      await pool.query('UPDATE comunidad_posts SET reportes = $1, oculto = TRUE WHERE id = $2', [total, id]);
    } else {
      await pool.query('UPDATE comunidad_posts SET reportes = $1 WHERE id = $2', [total, id]);
    }

    return res.status(200).json({ ok: true, reportes: total, oculto: total >= UMBRAL_OCULTAR });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  } finally {
    await pool.end();
  }
}
