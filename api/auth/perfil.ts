import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

function getSQL() { return neon(process.env.DATABASE_URL!); }
function cors(res: VercelResponse){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');}
function getToken(req: VercelRequest){const a=req.headers['authorization']??'';return typeof a==='string'&&a.startsWith('Bearer ')?a.slice(7):null;}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const sql = getSQL();
    const sess = await sql`SELECT u.id, u.nombre, u.correo, u.tipo, u.foto_url FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token=${token} AND s.expira_en>NOW()`;
    if (sess.length === 0) return res.status(401).json({ error: 'Sesión inválida' });
    const usuario = sess[0];
    if (req.method === 'GET') {
      let servicio = null;
      if ((usuario as any).tipo === 'prestador') {
        const sr = await sql`SELECT * FROM servicios WHERE usuario_id=${(usuario as any).id} ORDER BY creado_en DESC LIMIT 1`;
        servicio = sr[0] ?? null;
        if (servicio && !(servicio as any).notificado && (servicio as any).estado !== 'pendiente')
          await sql`UPDATE servicios SET notificado=TRUE WHERE id=${(servicio as any).id}`;
      }
      return res.status(200).json({ ok: true, usuario, servicio });
    }
    if (req.method === 'DELETE') {
      await sql`DELETE FROM sesiones WHERE token=${token}`;
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + String(err) });
  }
}
