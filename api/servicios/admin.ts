// api/servicios/admin.ts
// GET  /api/servicios/admin          → lista servicios pendientes
// POST /api/servicios/admin          → aprobar o rechazar un servicio
// Requiere header: X-Admin-Password: tuxtlasgo2026

import { sql, jsonRes } from '../_db';

export const config = { runtime: 'edge' };

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'tuxtlasgo2026';

function verificarAdmin(req: Request): boolean {
  return req.headers.get('x-admin-password') === ADMIN_PASSWORD;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return jsonRes({});

  if (!verificarAdmin(req)) {
    return jsonRes({ error: 'Contraseña de administrador incorrecta' }, 401);
  }

  // GET — listar todos los servicios con info del usuario
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const estado = url.searchParams.get('estado') ?? 'pendiente';

    const rows = await sql`
      SELECT
        s.id, s.nombre, s.categoria, s.municipio, s.descripcion,
        s.precio, s.contacto, s.lat, s.lng,
        s.estado, s.codigo_seguimiento, s.motivo_rechazo,
        s.creado_en,
        u.nombre AS usuario_nombre,
        u.correo AS usuario_correo
      FROM servicios s
      JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.estado = ${estado}
      ORDER BY s.creado_en DESC
    `;

    return jsonRes({ ok: true, servicios: rows, total: rows.length });
  }

  // POST — aprobar o rechazar
  if (req.method === 'POST') {
    const { servicioId, accion, motivoRechazo } = await req.json();

    if (!servicioId || !['aprobar', 'rechazar'].includes(accion)) {
      return jsonRes({ error: 'Datos inválidos' }, 400);
    }
    if (accion === 'rechazar' && !motivoRechazo?.trim()) {
      return jsonRes({ error: 'El motivo de rechazo es requerido' }, 400);
    }

    const nuevoEstado = accion === 'aprobar' ? 'aprobado' : 'rechazado';

    await sql`
      UPDATE servicios
      SET
        estado = ${nuevoEstado},
        motivo_rechazo = ${accion === 'rechazar' ? motivoRechazo.trim() : null},
        notificado = FALSE,
        actualizado_en = NOW()
      WHERE id = ${servicioId}
    `;

    // Obtener el servicio actualizado para confirmar
    const rows = await sql`
      SELECT s.nombre, s.estado, s.codigo_seguimiento, u.nombre AS usuario
      FROM servicios s
      JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.id = ${servicioId}
    `;

    return jsonRes({
      ok: true,
      servicio: rows[0],
      mensaje: `Servicio "${rows[0]?.nombre}" ${nuevoEstado} correctamente.`,
    });
  }

  return jsonRes({ error: 'Método no permitido' }, 405);
}
