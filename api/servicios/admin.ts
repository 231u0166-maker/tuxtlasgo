import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../_lib/db.js';

function cors(res: VercelResponse) { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Admin-Password'); }

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
      if (!servicioId || !['aprobar', 'rechazar', 'dar_de_baja'].includes(accion)) return res.status(400).json({ error: 'Datos inválidos' });
      // 'baja' es un estado DISTINTO de 'rechazado' a propósito: un
      // rechazo es para una solicitud que nunca llegó a aprobarse
      // (incompleta, fraudulenta, etc.); una baja es para un servicio
      // que SÍ estuvo funcionando y aprobado, pero ya cerró o cambió
      // de información — mezclar ambos bajo "rechazado" confundía al
      // equipo sobre qué pasó realmente con cada uno.
      const estado = accion === 'aprobar' ? 'aprobado' : accion === 'dar_de_baja' ? 'baja' : 'rechazado';
      await pool.query('UPDATE servicios SET estado=$1, motivo_rechazo=$2, notificado=FALSE, actualizado_en=NOW() WHERE id=$3', [estado, accion !== 'aprobar' ? motivoRechazo : null, servicioId]);
      // Aviso en la campana del prestador (ya no hay "consultar estado" con código).
      // Si el aviso falla no se tumba la acción del admin: el estado ya quedó guardado.
      try {
        const dueno = await pool.query('SELECT usuario_id, nombre FROM servicios WHERE id=$1', [servicioId]);
        if (dueno.rows[0]) {
          const { usuario_id, nombre } = dueno.rows[0];
          const motivo = (motivoRechazo ?? '').toString().trim();
          const aviso =
            accion === 'aprobar'
              ? { tipo: 'servicio_aprobado', titulo: '¡Tu servicio fue aprobado!', mensaje: `"${nombre}" ya está visible en el mapa y en Explorar.` }
              : accion === 'rechazar'
                ? { tipo: 'servicio_rechazado', titulo: 'Tu solicitud no fue aprobada', mensaje: `"${nombre}"${motivo ? `: ${motivo}` : ''}. Entra a Mi Perfil para corregirla y volver a enviarla.` }
                : { tipo: 'servicio_baja', titulo: 'Tu servicio fue dado de baja', mensaje: `"${nombre}"${motivo ? `: ${motivo}` : ''}. Escríbenos si crees que es un error.` };
          await pool.query(`
            CREATE TABLE IF NOT EXISTS notificaciones (
              id SERIAL PRIMARY KEY,
              usuario_id INT NOT NULL,
              reservacion_id INT,
              tipo TEXT NOT NULL DEFAULT 'info',
              titulo TEXT NOT NULL,
              mensaje TEXT NOT NULL,
              leida BOOLEAN NOT NULL DEFAULT FALSE,
              creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`);
          await pool.query(
            'INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje) VALUES ($1, $2, $3, $4)',
            [usuario_id, aviso.tipo, aviso.titulo, aviso.mensaje]
          );
        }
      } catch (e) {
        console.warn('No se pudo crear la notificación del servicio:', e);
      }
      return res.status(200).json({ ok: true, mensaje: `Servicio ${estado}` });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + String(err) });
  } finally { await pool.end(); }
}