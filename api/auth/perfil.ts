// api/auth/perfil.ts
// GET  /api/auth/perfil  → devuelve el perfil del usuario autenticado
// DELETE /api/auth/perfil → cierra la sesión actual

import { sql, extraerToken, verificarSesion, jsonRes } from '../_db';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return jsonRes({});

  const token = extraerToken(req);
  if (!token) return jsonRes({ error: 'No autenticado' }, 401);

  const usuario = await verificarSesion(token);
  if (!usuario) return jsonRes({ error: 'Sesión inválida o expirada' }, 401);

  // GET — devolver perfil
  if (req.method === 'GET') {
    // Si es prestador, incluir su servicio
    let servicio = null;
    if (usuario.tipo === 'prestador') {
      const rows = await sql`
        SELECT id, nombre, categoria, municipio, descripcion, precio,
               contacto, lat, lng, estado, codigo_seguimiento,
               motivo_rechazo, notificado, creado_en
        FROM servicios
        WHERE usuario_id = ${usuario.id}
        ORDER BY creado_en DESC
        LIMIT 1
      `;
      servicio = rows[0] ?? null;

      // Marcar notificación como vista
      if (servicio && !servicio.notificado && servicio.estado !== 'pendiente') {
        await sql`
          UPDATE servicios SET notificado = TRUE
          WHERE id = ${(servicio as any).id}
        `;
      }
    }

    return jsonRes({ ok: true, usuario, servicio });
  }

  // DELETE — cerrar sesión
  if (req.method === 'DELETE') {
    await sql`DELETE FROM sesiones WHERE token = ${token}`;
    return jsonRes({ ok: true, mensaje: 'Sesión cerrada' });
  }

  return jsonRes({ error: 'Método no permitido' }, 405);
}
