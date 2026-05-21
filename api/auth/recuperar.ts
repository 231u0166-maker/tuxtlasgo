// api/auth/recuperar.ts
// POST /api/auth/recuperar
// Recupera la contraseña usando el código de recuperación

import bcrypt from 'bcryptjs';
import { sql, jsonRes } from '../_db';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return jsonRes({});
  if (req.method !== 'POST') return jsonRes({ error: 'Método no permitido' }, 405);

  try {
    const { correo, codigoRecuperacion, nuevaPassword } = await req.json();

    if (!correo || !codigoRecuperacion || !nuevaPassword) {
      return jsonRes({ error: 'Faltan datos requeridos' }, 400);
    }
    if (nuevaPassword.length < 6) {
      return jsonRes({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
    }

    // Verificar que el código corresponda al correo
    const rows = await sql`
      SELECT id FROM usuarios
      WHERE correo = ${correo.toLowerCase().trim()}
        AND codigo_recuperacion = ${codigoRecuperacion.toUpperCase().trim()}
    `;

    if (rows.length === 0) {
      return jsonRes({ error: 'Correo o código de recuperación incorrectos' }, 401);
    }

    const usuarioId = (rows[0] as any).id;
    const hash = await bcrypt.hash(nuevaPassword, 10);

    // Actualizar contraseña
    await sql`
      UPDATE usuarios
      SET password = ${hash}, actualizado_en = NOW()
      WHERE id = ${usuarioId}
    `;

    // Cerrar todas las sesiones activas por seguridad
    await sql`DELETE FROM sesiones WHERE usuario_id = ${usuarioId}`;

    return jsonRes({
      ok: true,
      mensaje: 'Contraseña actualizada correctamente. Inicia sesión con tu nueva contraseña.',
    });

  } catch (err) {
    console.error('[recuperar]', err);
    return jsonRes({ error: 'Error interno del servidor' }, 500);
  }
}
