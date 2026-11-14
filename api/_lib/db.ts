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

// Columnas JSON de servicios que se agregaron después (se crean la primera vez que se
// necesitan, con el mismo estilo de auto-provisión del resto del proyecto; la bandera
// evita repetir el ALTER en cada petición de una misma instancia):
//  - horario_semanal: horario por día.
//  - fotos_pies: texto debajo de cada foto, { "<url>": "texto" }.
let columnasServicioListas = false;
export async function asegurarColumnasServicio(pool: Pool) {
  if (columnasServicioListas) return;
  await pool.query('ALTER TABLE servicios ADD COLUMN IF NOT EXISTS horario_semanal JSONB');
  await pool.query('ALTER TABLE servicios ADD COLUMN IF NOT EXISTS fotos_pies JSONB');
  columnasServicioListas = true;
}

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

// ── pagos_reservacion — un registro por cada intento de pago de anticipo.
// Se auto-provisiona para que una base nueva no rompa el primer pago.
export async function asegurarTablaPagosReservacion(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pagos_reservacion (
      id SERIAL PRIMARY KEY,
      reservacion_id INT NOT NULL,
      mp_preference_id TEXT,
      mp_payment_id TEXT,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      monto NUMERIC(10,2),
      marketplace_fee NUMERIC(10,2),
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
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
  // Anti-inflado: quién generó el evento (id anónimo del navegador) y un
  // hash de su IP. Los eventos anteriores a esto quedan con NULL.
  await pool.query('ALTER TABLE eventos_servicio ADD COLUMN IF NOT EXISTS visitante TEXT');
  await pool.query('ALTER TABLE eventos_servicio ADD COLUMN IF NOT EXISTS ip_hash TEXT');
  await pool.query(`
    CREATE INDEX IF NOT EXISTS eventos_servicio_visitante
      ON eventos_servicio (servicio_id, tipo, visitante)
  `);
}
