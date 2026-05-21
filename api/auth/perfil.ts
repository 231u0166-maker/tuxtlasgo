import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

function getPool() { return new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 }); }
function cors(res: VercelResponse){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');}
function getToken(req: VercelRequest){const a=req.headers['authorization']??'';return typeof a==='string'&&a.startsWith('Bearer ')?a.slice(7):null;}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  const pool = getPool();
  try {
    const sess = await pool.query('SELECT u.id, u.nombre, u.correo, u.tipo, u.foto_url FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token=$1 AND s.expira_en>NOW()', [token]);
    if (sess.rows.length === 0) return res.status(401).json({ error: 'Sesión inválida' });
    const usuario = sess.rows[0];
    if (req.method === 'GET') {
      let servicio = null;
      if (usuario.tipo === 'prestador') {
        const sr = await pool.query('SELECT * FROM servicios WHERE usuario_id=$1 ORDER BY creado_en DESC LIMIT 1', [usuario.id]);
        servicio = sr.rows[0] ?? null;
        if (servicio && !servicio.notificado && servicio.estado !== 'pendiente')
          await pool.query('UPDATE servicios SET notificado=TRUE WHERE id=$1', [servicio.id]);
      }
      return res.status(200).json({ ok: true, usuario, servicio });
    }
    if (req.method === 'DELETE') {
      await pool.query('DELETE FROM sesiones WHERE token=$1', [token]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + String(err) });
  } finally { await pool.end(); }
}
