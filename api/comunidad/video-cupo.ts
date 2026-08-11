// GET /api/comunidad/video-cupo — cuánto video queda disponible este
// mes. Público (no requiere sesión) — el frontend lo consulta antes
// de siquiera mostrar el botón "Video" en el composer.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

// Cupo propio y conservador — deliberadamente por debajo de lo que
// ofrece el plan gratuito de Cloudinary (créditos compartidos con
// fotos + un tope aparte de ancho de banda de video, más chico que
// el de imágenes). Ajustable por variable de entorno una vez que
// haya datos reales de uso en el dashboard de Cloudinary.
const LIMITE_MB_SUBIDOS = Number(process.env.LIMITE_VIDEO_MB_MES ?? 500);
const LIMITE_REPRODUCCIONES = Number(process.env.LIMITE_VIDEO_REPRODUCCIONES_MES ?? 800);

function getPool() {
  return new Pool({ connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
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
    const fila = await pool.query(
      `SELECT video_bytes_subidos, video_reproducciones
       FROM comunidad_metricas
       WHERE mes = date_trunc('month', NOW())::date`
    );
    const bytesSubidos = Number(fila.rows[0]?.video_bytes_subidos ?? 0);
    const reproducciones = Number(fila.rows[0]?.video_reproducciones ?? 0);
    const mbSubidos = bytesSubidos / (1024 * 1024);

    const disponible = mbSubidos < LIMITE_MB_SUBIDOS && reproducciones < LIMITE_REPRODUCCIONES;

    return res.status(200).json({
      ok: true,
      disponible,
      mbSubidos: Math.round(mbSubidos * 10) / 10,
      limiteMb: LIMITE_MB_SUBIDOS,
      reproducciones,
      limiteReproducciones: LIMITE_REPRODUCCIONES,
    });
  } catch (err) {
    // Si algo falla al consultar el cupo, más vale no ofrecer video
    // (falla segura) que arriesgarnos a rebasar el límite real.
    return res.status(200).json({ ok: true, disponible: false, error: String(err) });
  } finally {
    await pool.end();
  }
}
