import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

function getSQL() { return neon(process.env.DATABASE_URL!); }
function cors(res: VercelResponse){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Admin-Password');}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const adminPwd = process.env.ADMIN_PASSWORD ?? 'tuxtlasgo2026';
  if (req.headers['x-admin-password'] !== adminPwd) return res.status(401).json({ error: 'Contraseña incorrecta' });
  try {
    const sql = getSQL();
    if (req.method === 'GET') {
      const estado = (req.query.estado as string) ?? 'pendiente';
      const rows = await sql`SELECT s.*, u.nombre AS usuario_nombre, u.correo AS usuario_correo FROM servicios s JOIN usuarios u ON u.id=s.usuario_id WHERE s.estado=${estado} ORDER BY s.creado_en DESC`;
      return res.status(200).json({ ok: true, servicios: rows, total: rows.length });
    }
    if (req.method === 'POST') {
      const { servicioId, accion, motivoRechazo } = req.body;
      if (!servicioId || !['aprobar','rechazar'].includes(accion)) return res.status(400).json({ error: 'Datos inválidos' });
      const estado = accion === 'aprobar' ? 'aprobado' : 'rechazado';
      await sql`UPDATE servicios SET estado=${estado}, motivo_rechazo=${accion==='rechazar'?motivoRechazo:null}, notificado=FALSE, actualizado_en=NOW() WHERE id=${servicioId}`;
      return res.status(200).json({ ok: true, mensaje: `Servicio ${estado}` });
    }
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + String(err) });
  }
}
