// Utilidades de seguridad compartidas por los endpoints de /api.
//  - tokenSesion / codigoAleatorio: aleatoriedad criptográfica (crypto), no Math.random.
//  - esAdmin: compara en tiempo constante y NO tiene contraseña por defecto.
//  - intentosAgotados / registrarIntento: límite de intentos fallidos guardado en
//    Postgres (las funciones serverless no comparten memoria, así que no sirve un contador en RAM).
import { randomBytes, randomInt, timingSafeEqual, createHash } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import type { Pool } from 'pg';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código legible (ej. REC-K7M2QX9P) con aleatoriedad criptográfica. */
export function codigoAleatorio(prefijo: string, largo = 8): string {
  let s = '';
  for (let i = 0; i < largo; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return `${prefijo}-${s}`;
}

/** Token de sesión: 256 bits aleatorios, imposible de adivinar. */
export function tokenSesion(): string {
  return 'SES-' + randomBytes(32).toString('hex');
}

/**
 * ¿La petición trae la contraseña de admin correcta?
 * Si ADMIN_PASSWORD no está definida en el entorno, NADIE es admin
 * (antes caía a un valor por defecto escrito en el repositorio).
 */
export function esAdmin(req: VercelRequest): boolean {
  const esperada = process.env.ADMIN_PASSWORD;
  if (!esperada) return false;
  const recibida = req.headers['x-admin-password'];
  if (typeof recibida !== 'string') return false;
  // Se comparan hashes para que ambos buffers midan lo mismo (timingSafeEqual lo exige).
  const a = createHash('sha256').update(recibida).digest();
  const b = createHash('sha256').update(esperada).digest();
  return timingSafeEqual(a, b);
}

/** IP del cliente (Vercel la pone en x-forwarded-for). */
export function ipDe(req: VercelRequest): string {
  const xff = req.headers['x-forwarded-for'];
  const primera = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  return primera || req.socket?.remoteAddress || 'desconocida';
}

let tablaLista = false;
async function asegurarTabla(pool: Pool) {
  if (tablaLista) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS intentos_auth (
      id        BIGSERIAL PRIMARY KEY,
      clave     TEXT NOT NULL,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_intentos_auth_clave ON intentos_auth (clave, creado_en)');
  tablaLista = true;
}

/** ¿Esta clave ya llegó al máximo de intentos fallidos en la ventana? */
export async function intentosAgotados(pool: Pool, claves: string[], max: number, ventanaMin: number): Promise<boolean> {
  await asegurarTabla(pool);
  for (const clave of claves) {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM intentos_auth WHERE clave = $1 AND creado_en > NOW() - ($2 || ' minutes')::interval`,
      [clave, String(ventanaMin)]
    );
    if (r.rows[0].n >= max) return true;
  }
  return false;
}

/** Anota un intento fallido (y limpia los viejos de paso). */
export async function registrarIntento(pool: Pool, claves: string[]) {
  await asegurarTabla(pool);
  for (const clave of claves) await pool.query('INSERT INTO intentos_auth (clave) VALUES ($1)', [clave]);
  await pool.query(`DELETE FROM intentos_auth WHERE creado_en < NOW() - INTERVAL '1 day'`);
}

/** Tras un acceso correcto se perdonan los intentos previos de esas claves. */
export async function limpiarIntentos(pool: Pool, claves: string[]) {
  await asegurarTabla(pool);
  await pool.query('DELETE FROM intentos_auth WHERE clave = ANY($1)', [claves]);
}
