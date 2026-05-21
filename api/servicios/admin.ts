import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSQL, cors } from '../db';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'tuxtlasgo2026';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.headers['x-admin-password'] !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Contraseña incorrecta' });

  const sql = getSQL();

  if (req.method === 'GET') {
    const estado = (req.query.estado as string) ?? 'pendiente';
    const rows = await sql`
      SELECT s.*, u.nombre AS usuario_nombre, u.correo AS usuario_correo
      FROM servicios s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.estado = ${estado} ORDER BY s.creado_en DESC
    `;
    return res.status(200).json({ ok: true, servicios: rows, total: rows.length });
  }

  if (req.method === 'POST') {
    const { servicioId, accion, motivoRechazo } = req.body;
    if (!servicioId || !['aprobar','rechazar'].includes(accion)) return res.status(400).json({ error: 'Datos inválidos' });
    const nuevoEstado = accion === 'aprobar' ? 'aprobado' : 'rechazado';
    await sql`UPDATE servicios SET estado = ${nuevoEstado}, motivo_rechazo = ${accion === 'rechazar' ? motivoRechazo : null}, notificado = FALSE, actualizado_en = NOW() WHERE id = ${servicioId}`;
    return res.status(200).json({ ok: true, mensaje: `Servicio ${nuevoEstado}` });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
