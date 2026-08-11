// POST /api/comunidad/video-vista — registra que alguien le dio play
// a un video de la comunidad. Público (cualquiera que vea el feed
// puede reproducir) — solo suma +1 al contador del mes, es la señal
// que usa video-cupo.ts para saber cuándo dejar de ofrecer video.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

function getPool() {
  return new Pool({ connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
}
function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO comunidad_metricas (mes, video_reproducciones)
       VALUES (date_trunc('month', NOW())::date, 1)
       ON CONFLICT (mes) DO UPDATE
       SET video_reproducciones = comunidad_metricas.video_reproducciones + 1`
    );
    return res.status(200).json({ ok: true });
  } catch {
    // No crítico — si falla, en el peor caso el contador se atrasa
    // un poco, no vale la pena que el usuario vea un error por esto.
    return res.status(200).json({ ok: false });
  } finally {
    await pool.end();
  }
}
