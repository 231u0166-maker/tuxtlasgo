// api/auth/registro.ts
// POST /api/auth/registro
// Registra un nuevo usuario (turista o prestador)

import bcrypt from 'bcryptjs';
import { sql, generarCodigo, jsonRes } from '../_db';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return jsonRes({});
  if (req.method !== 'POST') return jsonRes({ error: 'Método no permitido' }, 405);

  try {
    const { nombre, correo, password, tipo = 'turista' } = await req.json();

    // Validaciones
    if (!nombre?.trim() || nombre.trim().length < 2) {
      return jsonRes({ error: 'El nombre debe tener al menos 2 caracteres' }, 400);
    }
    if (!correo?.includes('@')) {
      return jsonRes({ error: 'Correo inválido' }, 400);
    }
    if (!password || password.length < 6) {
      return jsonRes({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
    }
    if (!['turista', 'prestador'].includes(tipo)) {
      return jsonRes({ error: 'Tipo de usuario inválido' }, 400);
    }

    // Verificar que el correo no exista
    const existe = await sql`
      SELECT id FROM usuarios WHERE correo = ${correo.toLowerCase().trim()}
    `;
    if (existe.length > 0) {
      return jsonRes({ error: 'Este correo ya está registrado' }, 409);
    }

    // Hash de contraseña y código de recuperación
    const hash = await bcrypt.hash(password, 10);
    const codigoRecuperacion = generarCodigo('REC');

    // Crear usuario
    const rows = await sql`
      INSERT INTO usuarios (nombre, correo, password, tipo, codigo_recuperacion)
      VALUES (
        ${nombre.trim()},
        ${correo.toLowerCase().trim()},
        ${hash},
        ${tipo},
        ${codigoRecuperacion}
      )
      RETURNING id, nombre, correo, tipo, creado_en
    `;

    const usuario = rows[0];

    return jsonRes({
      ok: true,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        tipo: usuario.tipo,
      },
      // Se muestra UNA SOLA VEZ — el usuario debe guardarlo
      codigoRecuperacion,
      mensaje: `Bienvenido a TuxtlasGO, ${nombre.trim().split(' ')[0]}`,
    });

  } catch (err) {
    console.error('[registro]', err);
    return jsonRes({ error: 'Error interno del servidor' }, 500);
  }
}
