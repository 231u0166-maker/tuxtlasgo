import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, cors, getToken, verificarSesion, generarCodigo } from '../_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const codigo = req.query.codigo as string;
    if (!codigo) return res.status(400).json({ error: 'Se requiere código' });
    const rows = await sql`SELECT nombre, categoria, municipio, estado, codigo_seguimiento, motivo_rechazo, creado_en FROM servicios WHERE codigo_seguimiento = ${codigo.toUpperCase().trim()}`;
    if (rows.length === 0) return res.status(404).json({ error: 'Código no encontrado' });
    return res.status(200).json({ ok: true, servicio: rows[0] });
  }

  if (req.method === 'POST') {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'No autenticado' });
    const usuario = await verificarSesion(token);
    if (!usuario) return res.status(401).json({ error: 'Sesión inválida' });
    if (usuario.tipo !== 'prestador') return res.status(403).json({ error: 'Solo prestadores pueden registrar servicios' });

    const { nombre, categoria, municipio, descripcion, precio, contacto, lat, lng } = req.body;
    if (!nombre?.trim() || nombre.trim().length < 3) return res.status(400).json({ error: 'Nombre muy corto' });
    if (!descripcion?.trim() || descripcion.trim().length < 20) return res.status(400).json({ error: 'Descripción muy corta (mín. 20 caracteres)' });
    if (!['Naturaleza','Aventura','Gastronomia','Hospedaje'].includes(categoria)) return res.status(400).json({ error: 'Categoría inválida' });

    const yaExiste = await sql`SELECT id FROM servicios WHERE usuario_id = ${usuario.id} AND estado != 'rechazado'`;
    if (yaExiste.length > 0) return res.status(409).json({ error: 'Ya tienes un servicio activo' });

    const codigo = generarCodigo('TGO');
    const rows = await sql`
      INSERT INTO servicios (usuario_id, nombre, categoria, municipio, descripcion, precio, contacto, lat, lng, codigo_seguimiento)
      VALUES (${usuario.id}, ${nombre.trim()}, ${categoria}, ${municipio}, ${descripcion.trim()}, ${precio ?? null}, ${contacto ?? null}, ${lat ?? null}, ${lng ?? null}, ${codigo})
      RETURNING id, nombre, categoria, municipio, estado, codigo_seguimiento, creado_en
    `;
    return res.status(200).json({ ok: true, servicio: rows[0], mensaje: `Servicio registrado. Tu código: ${codigo}` });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
