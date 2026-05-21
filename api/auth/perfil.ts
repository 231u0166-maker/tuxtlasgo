import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, cors, getToken, verificarSesion } from '../_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  const usuario = await verificarSesion(token);
  if (!usuario) return res.status(401).json({ error: 'Sesión inválida' });

  if (req.method === 'GET') {
    let servicio = null;
    if (usuario.tipo === 'prestador') {
      const rows = await sql`SELECT * FROM servicios WHERE usuario_id = ${usuario.id} ORDER BY creado_en DESC LIMIT 1`;
      servicio = rows[0] ?? null;
      if (servicio && !(servicio as any).notificado && (servicio as any).estado !== 'pendiente') {
        await sql`UPDATE servicios SET notificado = TRUE WHERE id = ${(servicio as any).id}`;
      }
    }
    return res.status(200).json({ ok: true, usuario, servicio });
  }

  if (req.method === 'DELETE') {
    await sql`DELETE FROM sesiones WHERE token = ${token}`;
    return res.status(200).json({ ok: true, mensaje: 'Sesión cerrada' });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
