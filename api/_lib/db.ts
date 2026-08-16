// Conexión compartida a Neon Postgres — antes cada archivo bajo /api
// tenía su propia copia de getPool(); ahora todos importan de aquí.
// Un solo lugar para arreglar, un solo lugar para revisar.
//
// IMPORTANTE — revisa esto en Vercel antes de confiar en que aguanta
// tráfico concurrente (ej: muchos prestadores conectando/desconectando
// Mercado Pago al mismo tiempo):
//
// NEON_DATABASE_URL (o DATABASE_URL) debe apuntar al host que tiene
// "-pooler" en el nombre, ej:
//   ep-cool-darkness-123456-pooler.us-east-2.aws.neon.tech
// y NO al host directo:
//   ep-cool-darkness-123456.us-east-2.aws.neon.tech
//
// El host directo tiene un límite bajo de conexiones simultáneas a
// Postgres (ronda ~100 en un compute pequeño de Neon). El host
// "-pooler" pasa por PgBouncer y aguanta miles de conexiones de
// cliente multiplexándolas en menos conexiones reales — pensado
// exactamente para funciones serverless que abren/cierran conexión
// en cada petición, como hacemos aquí.
//
// Revisa el valor en: Vercel → tu proyecto → Settings →
// Environment Variables.
import { Pool } from 'pg';

export function getPool() {
  const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '';
  // ── DIAGNÓSTICO TEMPORAL — bórrala en cuanto confirmes el resultado
  // en Vercel → tu proyecto → Logs. No expone la contraseña, solo
  // dice si el host de conexión trae "-pooler" (true) o no (false).
  console.log('[db] usa conexión con pooler:', connectionString.includes('-pooler'));
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
}

// ── eventos_servicio — tracking ligero para "Ganancias y
// estadísticas" del prestador (Bug: el módulo mostraba $0.00 fijo y
// no había ninguna gráfica real). Un evento por cada vez que:
//   - se abre la ficha completa de un servicio     → tipo 'vista'
//   - alguien lo agrega a favoritos                → tipo 'like'
//   - el asistente de IA lo recomienda en el chat   → tipo 'ia_recomendacion'
// Se auto-provisiona igual que las demás tablas del proyecto (ver
// api/ia/chat.ts) — nada de migración manual aparte.
export async function asegurarTablaEventosServicio(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS eventos_servicio (
      id SERIAL PRIMARY KEY,
      servicio_id INT NOT NULL,
      tipo TEXT NOT NULL,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS eventos_servicio_lookup
      ON eventos_servicio (servicio_id, tipo, creado_en)
  `);
}
