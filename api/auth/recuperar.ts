import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';

function getSQL() { return neon(process.env.DATABASE_URL!); }
function cors(res: VercelResponse){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const sql = getSQL();
    const { correo, codigoRecuperacion, nuevaPassword } = req.body;
    if (!correo || !codigoRecuperacion || !nuevaPassword) return res.status(400).json({ error: 'Faltan datos' });
    if (nuevaPassword.length < 6) return res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });
    const rows = await sql`SELECT id FROM usuarios WHERE correo = ${correo.toLowerCase().trim()} AND codigo_recuperacion = ${codigoRecuperacion.toUpperCase().trim()}`;
    if (rows.length === 0) return res.status(401).json({ error: 'Correo o código incorrectos' });
    const hash = await bcrypt.hash(nuevaPassword, 10);
    await sql`UPDATE usuarios SET password = ${hash}, actualizado_en = NOW() WHERE id = ${(rows[0] as any).id}`;
    await sql`DELETE FROM sesiones WHERE usuario_id = ${(rows[0] as any).id}`;
    return res.status(200).json({ ok: true, mensaje: 'Contraseña actualizada. Inicia sesión.' });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + String(err) });
  }
}
