import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';

function getSQL() { return neon(process.env.DATABASE_URL!); }
function generarCodigo(p='SES'){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<8;i++)s+=c[Math.floor(Math.random()*c.length)];return `${p}-${s}`;}
function cors(res: VercelResponse){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');}

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
    const u = rows[0] as any;
    if (!await bcrypt.compare(password, u.password)) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    const token = generarCodigo('SES') + '-' + Date.now().toString(36);
    const expira = new Date(Date.now() + 30*24*60*60*1000);
    await sql`INSERT INTO sesiones (usuario_id, token, expira_en) VALUES (${u.id}, ${token}, ${expira.toISOString()})`;
    return res.status(200).json({ ok: true, token, usuario: { id: u.id, nombre: u.nombre, correo: u.correo, tipo: u.tipo, foto_url: u.foto_url } });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Error: ' + String(err) });
  }
}
