import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { getSQL, generarCodigo, cors } from '../_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const sql = getSQL();
    const { correo, password } = req.body;
    if (!correo || !password) return res.status(400).json({ error: 'Correo y contraseña requeridos' });

    const rows = await sql`SELECT id, nombre, correo, password, tipo, foto_url FROM usuarios WHERE correo = ${correo.toLowerCase().trim()}`;
    if (rows.length === 0) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });

    const usuario = rows[0] as any;
    const ok = await bcrypt.compare(password, usuario.password);
    if (!ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });

    const token = generarCodigo('SES') + '-' + Date.now().toString(36);
    const expira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await sql`INSERT INTO sesiones (usuario_id, token, expira_en) VALUES (${usuario.id}, ${token}, ${expira.toISOString()})`;

    return res.status(200).json({
      ok: true, token,
      usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, tipo: usuario.tipo, foto_url: usuario.foto_url },
    });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Error interno: ' + String(err) });
  }
}
