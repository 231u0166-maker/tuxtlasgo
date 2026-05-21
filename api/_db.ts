// ============================================================
// CLIENTE DE BASE DE DATOS — Neon PostgreSQL
// ============================================================
// Archivo: api/_db.ts
// Usado por todas las funciones serverless de Vercel.
// La URL de conexión viene de la variable de entorno DATABASE_URL
// que se configura en el dashboard de Vercel.
// ============================================================

import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL no está configurada en las variables de entorno');
}

// Conexión reutilizable — neon() crea una función sql tag
export const sql = neon(process.env.DATABASE_URL);

// Tipos que comparten todas las funciones
export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  tipo: 'turista' | 'prestador' | 'admin';
  foto_url?: string;
  creado_en: string;
}

export interface Servicio {
  id: number;
  usuario_id: number;
  nombre: string;
  categoria: string;
  municipio: string;
  descripcion: string;
  precio?: string;
  contacto?: string;
  lat?: number;
  lng?: number;
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  codigo_seguimiento: string;
  motivo_rechazo?: string;
  notificado: boolean;
  creado_en: string;
}

// Genera un código de seguimiento único tipo TGO-XXXXXXXX
export function generarCodigo(prefijo = 'TGO'): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefijo}-${code}`;
}

// Extrae el token de la cabecera Authorization
export function extraerToken(req: Request): string | null {
  const auth = req.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// Verifica que el token sea válido y devuelve el usuario
export async function verificarSesion(token: string): Promise<Usuario | null> {
  try {
    const rows = await sql`
      SELECT u.id, u.nombre, u.correo, u.tipo, u.foto_url, u.creado_en
      FROM sesiones s
      JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token = ${token}
        AND s.expira_en > NOW()
    `;
    return (rows[0] as Usuario) ?? null;
  } catch {
    return null;
  }
}

// Respuesta JSON estándar
export function jsonRes(data: object, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
  });
}
