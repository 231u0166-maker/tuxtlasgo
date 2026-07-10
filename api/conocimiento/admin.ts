import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

// ============================================================
// BASE DE CONOCIMIENTO DINÁMICA — administrable sin tocar código
// ============================================================
// Antes, agregar una ficha de conocimiento (precio confirmado,
// horario, dato de seguridad) significaba editar conocimiento.ts y
// volver a desplegar. Eso es fricción real para algo que el equipo
// va a querer actualizar seguido conforme se registran prestadores.
//
// Este endpoint mueve esas fichas a una tabla en Neon, administrable
// desde el panel de admin (ver AdminPanel.tsx). SIGUE siendo curado
// por una persona — a propósito: son datos que alguien debe verificar
// antes de que la IA los repita como verdad (ver la nota larga sobre
// esto en src/lib/conocimiento.ts). Lo que cambia es que ahora es un
// campo de formulario, no una tarea de programador.
//
// Variables de entorno:
//   NEON_DATABASE_URL / DATABASE_URL  (ya existente)
//   ADMIN_PASSWORD                    (ya existente, mismo patrón que
//                                      api/servicios/admin.ts)
// ============================================================

function getPool() {
  return new Pool({
    connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
}

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Admin-Password');
}

async function asegurarTabla(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conocimiento_dinamico (
      id SERIAL PRIMARY KEY,
      claves TEXT NOT NULL,        -- separadas por coma: "gorel, palapas gorel"
      titulo TEXT NOT NULL,
      respuesta TEXT NOT NULL,
      prioridad INT NOT NULL DEFAULT 0,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      creado_por TEXT,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const pool = getPool();
  try {
    await asegurarTabla(pool);

    // GET es público a propósito: la PWA necesita poder descargar estas
    // fichas para responder offline, sin pedirle contraseña al turista.
    if (req.method === 'GET') {
      const r = await pool.query(
        'SELECT id, claves, titulo, respuesta, prioridad FROM conocimiento_dinamico WHERE activo = TRUE ORDER BY id DESC'
      );
      return res.status(200).json({ ok: true, entradas: r.rows });
    }

    // POST (agregar) y PATCH (desactivar) sí requieren la contraseña
    // de admin — mismo patrón que api/servicios/admin.ts.
    const adminPwd = process.env.ADMIN_PASSWORD ?? 'tuxtlasgo2026';
    if (req.headers['x-admin-password'] !== adminPwd) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    if (req.method === 'POST') {
      const { claves, titulo, respuesta, prioridad, creadoPor } = req.body as {
        claves?: string;
        titulo?: string;
        respuesta?: string;
        prioridad?: number;
        creadoPor?: string;
      };
      if (!claves?.trim() || !titulo?.trim() || !respuesta?.trim()) {
        return res.status(400).json({ error: 'Faltan claves, título o respuesta' });
      }
      const r = await pool.query(
        `INSERT INTO conocimiento_dinamico (claves, titulo, respuesta, prioridad, creado_por)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [claves.trim(), titulo.trim(), respuesta.trim(), prioridad ?? 0, creadoPor ?? null]
      );
      return res.status(200).json({ ok: true, id: r.rows[0].id });
    }

    if (req.method === 'PATCH') {
      const { id, activo } = req.body as { id?: number; activo?: boolean };
      if (!id) return res.status(400).json({ error: 'Falta id' });
      await pool.query('UPDATE conocimiento_dinamico SET activo = $1 WHERE id = $2', [
        activo ?? false,
        id,
      ]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + String(err) });
  } finally {
    await pool.end();
  }
}
