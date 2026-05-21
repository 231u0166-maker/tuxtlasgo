// api/servicios/registro.ts
// POST /api/servicios/registro  → registra un nuevo servicio
// GET  /api/servicios/registro  → consulta el servicio del prestador autenticado

import { sql, extraerToken, verificarSesion, generarCodigo, jsonRes } from '../_db';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return jsonRes({});

  // GET sin auth: consulta por código de seguimiento
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const codigo = url.searchParams.get('codigo');
    if (codigo) {
      const rows = await sql`
        SELECT nombre, categoria, municipio, estado,
               codigo_seguimiento, motivo_rechazo, creado_en
        FROM servicios
        WHERE codigo_seguimiento = ${codigo.toUpperCase().trim()}
      `;
      if (rows.length === 0) {
        return jsonRes({ error: 'Código no encontrado' }, 404);
      }
      return jsonRes({ ok: true, servicio: rows[0] });
    }
    return jsonRes({ error: 'Se requiere código de seguimiento' }, 400);
  }

  // POST — registrar servicio (requiere auth de prestador)
  if (req.method === 'POST') {
    const token = extraerToken(req);
    if (!token) return jsonRes({ error: 'No autenticado' }, 401);

    const usuario = await verificarSesion(token);
    if (!usuario) return jsonRes({ error: 'Sesión inválida' }, 401);
    if (usuario.tipo !== 'prestador') {
      return jsonRes({ error: 'Solo los prestadores pueden registrar servicios' }, 403);
    }

    const { nombre, categoria, municipio, descripcion, precio, contacto, lat, lng } =
      await req.json();

    // Validaciones
    if (!nombre?.trim() || nombre.trim().length < 3) {
      return jsonRes({ error: 'El nombre debe tener al menos 3 caracteres' }, 400);
    }
    if (!descripcion?.trim() || descripcion.trim().length < 20) {
      return jsonRes({ error: 'La descripción debe tener al menos 20 caracteres' }, 400);
    }
    if (!['Naturaleza', 'Aventura', 'Gastronomia', 'Hospedaje'].includes(categoria)) {
      return jsonRes({ error: 'Categoría inválida' }, 400);
    }
    if (!['Catemaco', 'San Andrés Tuxtla', 'Santiago Tuxtla'].includes(municipio)) {
      return jsonRes({ error: 'Municipio inválido' }, 400);
    }

    // Verificar que no tenga ya un servicio activo
    const yaExiste = await sql`
      SELECT id FROM servicios
      WHERE usuario_id = ${usuario.id}
        AND estado != 'rechazado'
    `;
    if (yaExiste.length > 0) {
      return jsonRes({
        error: 'Ya tienes un servicio registrado. Solo se permite uno a la vez.',
      }, 409);
    }

    const codigo = generarCodigo('TGO');

    const rows = await sql`
      INSERT INTO servicios
        (usuario_id, nombre, categoria, municipio, descripcion,
         precio, contacto, lat, lng, codigo_seguimiento)
      VALUES
        (${usuario.id}, ${nombre.trim()}, ${categoria}, ${municipio},
         ${descripcion.trim()}, ${precio ?? null}, ${contacto ?? null},
         ${lat ?? null}, ${lng ?? null}, ${codigo})
      RETURNING id, nombre, categoria, municipio, estado, codigo_seguimiento, creado_en
    `;

    return jsonRes({
      ok: true,
      servicio: rows[0],
      mensaje: `Servicio registrado. Tu código de seguimiento es ${codigo}. Lo revisaremos en 24-72 horas.`,
    });
  }

  return jsonRes({ error: 'Método no permitido' }, 405);
}
