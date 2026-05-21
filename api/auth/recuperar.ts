import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';

function getPool() { return new Pool({ connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 }); }
function cors(res: VercelResponse){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const pool = getPool();
  try {
    const { correo, codigoRecuperacion, nuevaPassword } = req.body;
    if (!correo || !codigoRecuperacion || !nuevaPassword) return res.status(400).json({ error: 'Faltan datos' });
    if (nuevaPassword.length < 6) return res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });
    const r = await pool.query('SELECT id FROM usuarios WHERE correo = $1 AND codigo_recuperacion = $2', [correo.toLowerCase().trim(), codigoRecuperacion.toUpperCase().trim()]);
    if (r.rows.length === 0) return res.status(401).json({ error: 'Correo o código incorrectos' });
    const hash = await bcrypt.hash(nuevaPassword, 10);
    await pool.query('UPDATE usuarios SET password = $1, actualizado_en = NOW() WHERE id = $2', [hash, r.rows[0].id]);
    await pool.query('DELETE FROM sesiones WHERE usuario_id = $1', [r.rows[0].id]);
    return res.status(200).json({ ok: true, mensaje: 'Contraseña actualizada. Inicia sesión.' });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + String(err) });
  } finally { await pool.end(); }
}
