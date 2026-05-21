import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

function getPool() { return new Pool({ connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 }); }
function cors(res: VercelResponse){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Admin-Password');}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const adminPwd = process.env.ADMIN_PASSWORD ?? 'tuxtlasgo2026';
  if (req.headers['x-admin-password'] !== adminPwd) return res.status(401).json({ error: 'Contraseña incorrecta' });
  const pool = getPool();
  try {
    if (req.method === 'GET') {
      const estado = (req.query.estado as string) ?? 'pendiente';
      const r = await pool.query('SELECT s.*, u.nombre AS usuario_nombre, u.correo AS usuario_correo FROM servicios s JOIN usuarios u ON u.id=s.usuario_id WHERE s.estado=$1 ORDER BY s.creado_en DESC', [estado]);
      return res.status(200).json({ ok: true, servicios: r.rows, total: r.rows.length });
    }
    if (req.method === 'POST') {
      const { servicioId, accion, motivoRechazo } = req.body;
      if (!servicioId || !['aprobar','rechazar'].includes(accion)) return res.status(400).json({ error: 'Datos inválidos' });
      const estado = accion === 'aprobar' ? 'aprobado' : 'rechazado';
      await pool.query('UPDATE servicios SET estado=$1, motivo_rechazo=$2, notificado=FALSE, actualizado_en=NOW() WHERE id=$3', [estado, accion==='rechazar'?motivoRechazo:null, servicioId]);
      return res.status(200).json({ ok: true, mensaje: `Servicio ${estado}` });
    }
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + String(err) });
  } finally { await pool.end(); }
}
