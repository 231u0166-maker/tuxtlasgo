// api/auth/login.ts
// POST /api/auth/login

import bcrypt from 'bcryptjs';
import { sql, generarCodigo, jsonRes } from '../_db';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return jsonRes({});
  if (req.method !== 'POST') return jsonRes({ error: 'Método no permitido' }, 405);

  try {
    const { correo, password } = await req.json();

    if (!correo || !password) {
      return jsonRes({ error: 'Correo y contraseña son requeridos' }, 400);
    }

    // Buscar usuario
    const rows = await sql`
      SELECT id, nombre, correo, password, tipo, foto_url
      FROM usuarios
      WHERE correo = ${correo.toLowerCase().trim()}
    `;

    if (rows.length === 0) {
      return jsonRes({ error: 'Correo o contraseña incorrectos' }, 401);
    }

    const usuario = rows[0] as any;
    const passwordOk = await bcrypt.compare(password, usuario.password);

    if (!passwordOk) {
      return jsonRes({ error: 'Correo o contraseña incorrectos' }, 401);
    }

    // Crear sesión — token único, expira en 30 días
    const token = generarCodigo('SES') + '-' + Date.now().toString(36);
    const expira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await sql`
      INSERT INTO sesiones (usuario_id, token, expira_en)
      VALUES (${usuario.id}, ${token}, ${expira.toISOString()})
    `;

    // Limpiar sesiones viejas del mismo usuario (máx 5 activas)
    await sql`
      DELETE FROM sesiones
      WHERE usuario_id = ${usuario.id}
        AND id NOT IN (
          SELECT id FROM sesiones
          WHERE usuario_id = ${usuario.id}
          ORDER BY creado_en DESC
          LIMIT 5
        )
    `;

    return jsonRes({
      ok: true,
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        tipo: usuario.tipo,
        foto_url: usuario.foto_url,
      },
    });

  } catch (err) {
    console.error('[login]', err);
    return jsonRes({ error: 'Error interno del servidor' }, 500);
  }
}
