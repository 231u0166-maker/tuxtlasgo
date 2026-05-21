import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

function getSQL() { return neon(process.env.DATABASE_URL!); }
function generarCodigo(p='TGO'){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<8;i++)s+=c[Math.floor(Math.random()*c.length)];return `${p}-${s}`;}
function cors(res: VercelResponse){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');}
function getToken(req: VercelRequest){const a=req.headers['authorization']??'';return typeof a==='string'&&a.startsWith('Bearer ')?a.slice(7):null;}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const sql = getSQL();
    if (req.method === 'GET') {
      const codigo = req.query.codigo as string;
      if (!codigo) return res.status(400).json({ error: 'Se requiere código' });
      const rows = await sql`SELECT nombre, categoria, municipio, estado, codigo_seguimiento, motivo_rechazo, creado_en FROM servicios WHERE codigo_seguimiento=${codigo.toUpperCase().trim()}`;
      if (rows.length === 0) return res.status(404).json({ error: 'Código no encontrado' });
      return res.status(200).json({ ok: true, servicio: rows[0] });
    }
    if (req.method === 'POST') {
      const token = getToken(req);
      if (!token) return res.status(401).json({ error: 'No autenticado' });
      const sess = await sql`SELECT u.id, u.tipo FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token=${token} AND s.expira_en>NOW()`;
      if (sess.length === 0) return res.status(401).json({ error: 'Sesión inválida' });
      const usuario = sess[0] as any;
      if (usuario.tipo !== 'prestador') return res.status(403).json({ error: 'Solo prestadores' });
      const { nombre, categoria, municipio, descripcion, precio, contacto, lat, lng } = req.body;
      if (!nombre?.trim() || nombre.trim().length < 3) return res.status(400).json({ error: 'Nombre muy corto' });
      if (!descripcion?.trim() || descripcion.trim().length < 20) return res.status(400).json({ error: 'Descripción mínimo 20 caracteres' });
      const ya = await sql`SELECT id FROM servicios WHERE usuario_id=${usuario.id} AND estado!='rechazado'`;
      if (ya.length > 0) return res.status(409).json({ error: 'Ya tienes un servicio activo' });
      const codigo = generarCodigo('TGO');
      const rows = await sql`INSERT INTO servicios (usuario_id,nombre,categoria,municipio,descripcion,precio,contacto,lat,lng,codigo_seguimiento) VALUES (${usuario.id},${nombre.trim()},${categoria},${municipio},${descripcion.trim()},${precio??null},${contacto??null},${lat??null},${lng??null},${codigo}) RETURNING id,nombre,categoria,municipio,estado,codigo_seguimiento,creado_en`;
      return res.status(200).json({ ok: true, servicio: rows[0], mensaje: `Tu código: ${codigo}` });
    }
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + String(err) });
  }
}
