// GET    /api/comunidad/publicaciones            → feed público (oculto=false)
// GET    /api/comunidad/publicaciones?admin=1     → todas (requiere X-Admin-Password)
// POST   /api/comunidad/publicaciones             → crear (requiere sesión)
// DELETE /api/comunidad/publicaciones             → borrar propia, o cualquiera con admin
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

function getPool() {
  return new Pool({ connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
}
function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Admin-Password');
}
function getToken(req: VercelRequest) {
  const a = req.headers['authorization'] ?? '';
  return typeof a === 'string' && a.startsWith('Bearer ') ? a.slice(7) : null;
}
function esAdmin(req: VercelRequest) {
  const pwd = req.headers['x-admin-password'];
  return pwd === (process.env.ADMIN_PASSWORD ?? 'tuxtlasgo2026');
}

const LIMITE_MB_SUBIDOS = Number(process.env.LIMITE_VIDEO_MB_MES ?? 500);
const LIMITE_REPRODUCCIONES = Number(process.env.LIMITE_VIDEO_REPRODUCCIONES_MES ?? 800);
const DURACION_MAX_SEG = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const pool = getPool();
  try {
    if (req.method === 'GET') {
      const soloAdmin = req.query.admin === '1';
      if (soloAdmin && !esAdmin(req)) return res.status(403).json({ error: 'No autorizado' });

      const filas = await pool.query(
        `SELECT p.id, p.texto, p.imagen_url, p.video_url, p.video_duracion_seg,
                p.creado_en, p.reportes, p.oculto,
                p.usuario_id, u.nombre AS autor_nombre, u.foto_url AS autor_foto
         FROM comunidad_posts p
         JOIN usuarios u ON u.id = p.usuario_id
         ${soloAdmin ? '' : 'WHERE p.oculto = FALSE'}
         ORDER BY p.creado_en DESC
         LIMIT 60`
      );
      return res.status(200).json({ ok: true, publicaciones: filas.rows });
    }

    if (req.method === 'POST') {
      const token = getToken(req);
      if (!token) return res.status(401).json({ error: 'Inicia sesión para publicar' });
      const sess = await pool.query(
        `SELECT u.id FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
         WHERE s.token = $1 AND s.expira_en > NOW()`,
        [token]
      );
      if (sess.rows.length === 0) return res.status(401).json({ error: 'Sesión inválida' });
      const usuarioId = sess.rows[0].id;

      const { texto, imagen_url, video_url, video_bytes, video_duracion_seg } = req.body ?? {};
      const textoLimpio = typeof texto === 'string' ? texto.trim().slice(0, 500) : '';
      if (!textoLimpio && !imagen_url && !video_url) {
        return res.status(400).json({ error: 'Escribe algo, sube una foto o un video' });
      }

      // Un post trae foto O video, nunca los dos — mantiene el
      // composer simple y evita subidas pesadas innecesarias.
      if (imagen_url && video_url) {
        return res.status(400).json({ error: 'Elige foto o video, no ambos en la misma publicación' });
      }

      if (video_url) {
        const duracion = Number(video_duracion_seg) || 0;
        const bytes = Number(video_bytes) || 0;
        if (duracion > DURACION_MAX_SEG) {
          return res.status(400).json({ error: `El video debe durar máximo ${DURACION_MAX_SEG} segundos` });
        }
        if (!bytes || bytes <= 0) {
          return res.status(400).json({ error: 'No se pudo confirmar el tamaño del video' });
        }

        // Revalidar el cupo del lado del servidor — nunca confiar
        // solo en que el frontend ya lo checó antes de subir.
        const metricas = await pool.query(
          `SELECT video_bytes_subidos, video_reproducciones FROM comunidad_metricas
           WHERE mes = date_trunc('month', NOW())::date`
        );
        const mbSubidosActual = Number(metricas.rows[0]?.video_bytes_subidos ?? 0) / (1024 * 1024);
        const reproduccionesActual = Number(metricas.rows[0]?.video_reproducciones ?? 0);
        const mbNuevo = bytes / (1024 * 1024);

        if (mbSubidosActual + mbNuevo > LIMITE_MB_SUBIDOS || reproduccionesActual >= LIMITE_REPRODUCCIONES) {
          return res.status(409).json({
            error: 'limite_video',
            mensaje: 'Se alcanzó el límite de video de este mes. Sube una foto en su lugar — el próximo mes se reinicia el cupo.',
          });
        }
      }

      const insertado = await pool.query(
        `INSERT INTO comunidad_posts (usuario_id, texto, imagen_url, video_url, video_bytes, video_duracion_seg)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, texto, imagen_url, video_url, video_duracion_seg, creado_en, reportes, oculto, usuario_id`,
        [usuarioId, textoLimpio || null, imagen_url || null, video_url || null, video_url ? video_bytes : null, video_url ? video_duracion_seg : null]
      );

      if (video_url) {
        await pool.query(
          `INSERT INTO comunidad_metricas (mes, video_bytes_subidos)
           VALUES (date_trunc('month', NOW())::date, $1)
           ON CONFLICT (mes) DO UPDATE
           SET video_bytes_subidos = comunidad_metricas.video_bytes_subidos + $1`,
          [video_bytes]
        );
      }

      return res.status(200).json({ ok: true, publicacion: insertado.rows[0] });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'Falta id' });

      if (esAdmin(req)) {
        await pool.query('DELETE FROM comunidad_posts WHERE id = $1', [id]);
        return res.status(200).json({ ok: true });
      }

      const token = getToken(req);
      if (!token) return res.status(401).json({ error: 'No autenticado' });
      const sess = await pool.query(
        `SELECT u.id FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
         WHERE s.token = $1 AND s.expira_en > NOW()`,
        [token]
      );
      if (sess.rows.length === 0) return res.status(401).json({ error: 'Sesión inválida' });
      const usuarioId = sess.rows[0].id;

      const r = await pool.query('DELETE FROM comunidad_posts WHERE id = $1 AND usuario_id = $2', [id, usuarioId]);
      if (r.rowCount === 0) return res.status(403).json({ error: 'Solo puedes borrar tus propias publicaciones' });
      return res.status(200).json({ ok: true });
    }

    // PATCH — admin: restaurar una publicación oculta por reportes
    if (req.method === 'PATCH') {
      if (!esAdmin(req)) return res.status(403).json({ error: 'No autorizado' });
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'Falta id' });
      await pool.query('UPDATE comunidad_posts SET oculto = FALSE, reportes = 0 WHERE id = $1', [id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  } finally {
    await pool.end();
  }
}
