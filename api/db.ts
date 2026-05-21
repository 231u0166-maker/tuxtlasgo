import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export type { VercelRequest, VercelResponse };

// Crear conexión dentro de la función para asegurar que DATABASE_URL esté disponible
export function getSQL() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no configurada');
  return neon(url);
}

export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  tipo: 'turista' | 'prestador' | 'admin';
  foto_url?: string;
}

export function generarCodigo(prefijo = 'TGO'): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `${prefijo}-${code}`;
}

export function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Admin-Password');
}

export async function verificarSesion(token: string): Promise<Usuario | null> {
  try {
    const sql = getSQL();
    const rows = await sql`
      SELECT u.id, u.nombre, u.correo, u.tipo, u.foto_url
      FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token = ${token} AND s.expira_en > NOW()
    `;
    return (rows[0] as Usuario) ?? null;
  } catch { return null; }
}

export function getToken(req: VercelRequest): string | null {
  const auth = req.headers['authorization'] ?? '';
  return typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : null;
}
