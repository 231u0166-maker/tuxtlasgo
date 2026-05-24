// POST   /api/servicios/fotos  → guarda URL en Neon
// GET    /api/servicios/fotos  → regresa fotos del prestador logueado
// DELETE /api/servicios/fotos  → elimina URL de Neon + borra de Cloudinary
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? 'din6nzl1s',
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function getPool() {
  return new Pool({ connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
}
function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
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
      `SELECT u.id FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id
       WHERE s.token=$1 AND s.expira_en>NOW() AND u.tipo='prestador'`,
      [token]
    );
    if (sess.rows.length === 0) return res.status(401).json({ error: 'Sesión inválida' });
    const usuarioId = sess.rows[0].id;

    const srv = await pool.query(
      `SELECT id, fotos FROM servicios WHERE usuario_id=$1 ORDER BY creado_en DESC LIMIT 1`,
      [usuarioId]
    );
    if (srv.rows.length === 0) return res.status(404).json({ error: 'Sin servicio registrado' });

    const servicio = srv.rows[0];
    // Solo prestadores aprobados pueden subir fotos
    const aprobado = await pool.query(
      `SELECT id FROM servicios WHERE usuario_id=$1 AND estado='aprobado' LIMIT 1`,
      [usuarioId]
    );

    const fotosActuales: string[] = servicio.fotos ?? [];

    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, fotos: fotosActuales });
    }

    if (req.method === 'POST') {
      if (aprobado.rows.length === 0) return res.status(403).json({ error: 'Servicio aún no aprobado' });
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
      // Borrar de Cloudinary si viene el publicId
      if (publicId) {
        try { await cloudinary.uploader.destroy(publicId); } catch (e) { console.warn('Cloudinary delete:', e); }
      }
      const nuevas = fotosActuales.filter((f: string) => f !== url);
      await pool.query(`UPDATE servicios SET fotos=$1, actualizado_en=NOW() WHERE id=$2`, [JSON.stringify(nuevas), servicio.id]);
      return res.status(200).json({ ok: true, fotos: nuevas });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  } finally {
    await pool.end();
  }
}
