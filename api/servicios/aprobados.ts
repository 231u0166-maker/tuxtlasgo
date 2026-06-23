// api/servicios/aprobados.ts
// GET /api/servicios/aprobados
// Devuelve los servicios aprobados como objetos Lugar para la app
// Endpoint público — solo muestra info validada

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

function getPool() {
  return new Pool({
    connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
}

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseFotos(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

function parseIdeal(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const pool = getPool();
  try {
    const rows = await pool.query(`
      SELECT s.id, s.nombre, s.categoria, s.municipio, s.descripcion,
             s.precio, s.contacto, s.lat, s.lng, s.codigo_seguimiento, s.fotos,
             s.horario, s.dias_abierto, s.duracion, s.como_llegar, s.tip, s.ideal_para,
             u.nombre AS propietario
      FROM servicios s
      JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.estado = 'aprobado'
      ORDER BY s.actualizado_en DESC NULLS LAST
    `);

    const lugares = rows.rows.map((s: any) => {
      const fotos = parseFotos(s.fotos);
      const ideal = parseIdeal(s.ideal_para);

      return {
        // ── ID unificado: 'prestador-X' igual que servicioComoLugar() ──
        // Así recargarCatalogo() puede deduplicar correctamente.
        id: `prestador-${s.id}`,
        nombre: s.nombre,
        categoria: s.categoria,
        municipio: s.municipio,
        descripcionCorta: s.descripcion.substring(0, 80) + (s.descripcion.length > 80 ? '…' : ''),
        descripcion: s.descripcion,
        coords: [
          s.lat ? parseFloat(s.lat) : 18.417,
          s.lng ? parseFloat(s.lng) : -95.110,
        ],
        rating: 0,
        precio: 'medio',
        precioMxn:       s.precio     || 'Consultar precio',
        // ── Campos nuevos (Módulo 1) ──────────────────────────────
        duracionSugerida: s.duracion   || 'Variable',
        imagen: fotos.length > 0 ? fotos[0] : '/logo-tuxtlasgo.png',
        imagenesExtra: fotos.length > 1 ? fotos.slice(1) : [],
        tags: [s.categoria.toLowerCase(), s.municipio.toLowerCase()],
        ideal: ideal.length > 0 ? ideal : ['familia', 'pareja', 'amigos', 'solo'],
        abierto: {
          dias:    s.dias_abierto || 'Consultar disponibilidad',
          horario: s.horario      || 'Consultar horario',
        },
        comoLlegar: s.como_llegar || `En ${s.municipio}. Contacto: ${s.contacto}`,
        tip:        s.tip         || undefined,
        verificado: true,
        contacto:   s.contacto   || '',
        esPrestador: true,
        codigoSeguimiento: s.codigo_seguimiento,
      };
    });

    return res.status(200).json({ ok: true, lugares, total: lugares.length });
  } catch (err) {
    console.error('[aprobados]', err);
    return res.status(500).json({ ok: false, lugares: [], error: String(err) });
  } finally {
    await pool.end();
  }
}