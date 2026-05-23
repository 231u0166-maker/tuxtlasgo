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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const pool = getPool();
  try {
    const rows = await pool.query(`
      SELECT s.id, s.nombre, s.categoria, s.municipio, s.descripcion,
             s.precio, s.contacto, s.lat, s.lng, s.codigo_seguimiento,
             u.nombre AS propietario
      FROM servicios s
      JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.estado = 'aprobado'
      ORDER BY s.actualizado_en DESC
    `);

    // Convertir a formato Lugar compatible con la app
    const lugares = rows.rows.map((s: any) => ({
      id: `neon-${s.id}`,
      nombre: s.nombre,
      categoria: s.categoria,
      municipio: s.municipio,
      descripcionCorta: s.descripcion.substring(0, 80) + (s.descripcion.length > 80 ? '…' : ''),
      descripcion: s.descripcion,
      coords: [
        s.lat ? parseFloat(s.lat) : 18.417,
        s.lng ? parseFloat(s.lng) : -95.110,
      ],
      rating: 4.0,
      precio: 'medio',
      precioMxn: s.precio || 'Consultar precio',
      duracionSugerida: '1-2 horas',
      imagen: '/logo-tuxtlasgo.png',
      tags: [s.categoria.toLowerCase(), s.municipio.toLowerCase()],
      ideal: ['familia', 'pareja', 'amigos', 'solo'],
      abierto: { dias: 'Consultar horario', horario: 'Consultar' },
      verificado: false,
      contacto: s.contacto || '',
      esPrestador: true,
      codigoSeguimiento: s.codigo_seguimiento,
    }));

    return res.status(200).json({ ok: true, lugares, total: lugares.length });
  } catch (err) {
    console.error('[aprobados]', err);
    return res.status(500).json({ ok: false, lugares: [], error: String(err) });
  } finally {
    await pool.end();
  }
}