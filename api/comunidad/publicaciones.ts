// Todo Comunidad vive en UN solo archivo a propósito — el plan
// Hobby de Vercel limita a 12 funciones serverless por deployment.
// Se diferencian por método + ?accion= / ?recurso=.
//
// GET    /api/comunidad/publicaciones                       → feed público (oculto=false), incluye likes/comentarios por post
// GET    /api/comunidad/publicaciones?admin=1               → todas (requiere X-Admin-Password)
// GET    /api/comunidad/publicaciones?accion=cupo           → cupo de video del mes
// POST   /api/comunidad/publicaciones                       → crear (requiere sesión)
// POST   /api/comunidad/publicaciones?accion=reportar       → reportar (requiere sesión)
// POST   /api/comunidad/publicaciones?accion=vista          → registrar reproducción de video
// POST   /api/comunidad/publicaciones?recurso=like          → dar/quitar like (requiere sesión)
// GET    /api/comunidad/publicaciones?recurso=comentarios&post_id=X → comentarios de un post (público)
// POST   /api/comunidad/publicaciones?recurso=comentarios   → comentar o responder (requiere sesión)
// PATCH  /api/comunidad/publicaciones                       → admin: restaurar publicación oculta
// DELETE /api/comunidad/publicaciones                       → borrar propia, o cualquiera con admin
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

function getPool() {
  return new Pool({ connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
}
function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
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
async function usuarioDeSesion(pool: Pool, token: string): Promise<number | null> {
  const sess = await pool.query(
    `SELECT u.id FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token = $1 AND s.expira_en > NOW()`,
    [token]
  );
  return sess.rows.length > 0 ? sess.rows[0].id : null;
}

const LIMITE_MB_SUBIDOS = Number(process.env.LIMITE_VIDEO_MB_MES ?? 500);
const LIMITE_REPRODUCCIONES = Number(process.env.LIMITE_VIDEO_REPRODUCCIONES_MES ?? 800);
const DURACION_MAX_SEG = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const accion = typeof req.query.accion === 'string' ? req.query.accion : null;
  const recurso = typeof req.query.recurso === 'string' ? req.query.recurso : null;
  const pool = getPool();
  try {
    // ── GET ?accion=cupo — cupo de video disponible este mes ──────
    if (req.method === 'GET' && accion === 'cupo') {
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
    }

    // ── GET ?recurso=comentarios — comentarios de un post (público) ──
    if (req.method === 'GET' && recurso === 'comentarios') {
      const postId = Number(req.query.post_id);
      if (!postId) return res.status(400).json({ error: 'Falta post_id' });
      const filas = await pool.query(
        `SELECT c.id, c.texto, c.respuesta_a, c.creado_en, c.usuario_id,
                u.nombre AS autor_nombre, u.foto_url AS autor_foto
         FROM comunidad_comentarios c JOIN usuarios u ON u.id = c.usuario_id
         WHERE c.publicacion_id = $1
         ORDER BY c.creado_en ASC
         LIMIT 200`,
        [postId]
      );
      return res.status(200).json({ ok: true, comentarios: filas.rows });
    }

    // ── POST ?recurso=like — dar/quitar like (toggle) ─────────────
    if (req.method === 'POST' && recurso === 'like') {
      const token = getToken(req);
      if (!token) return res.status(401).json({ error: 'Inicia sesión para dar like' });
      const usuarioId = await usuarioDeSesion(pool, token);
      if (!usuarioId) return res.status(401).json({ error: 'Sesión inválida' });

      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'Falta id de la publicación' });

      const existente = await pool.query(
        'SELECT id FROM comunidad_likes WHERE publicacion_id = $1 AND usuario_id = $2',
        [id, usuarioId]
      );
      let leDiLike: boolean;
      if (existente.rows.length > 0) {
        await pool.query('DELETE FROM comunidad_likes WHERE id = $1', [existente.rows[0].id]);
        leDiLike = false;
      } else {
        await pool.query('INSERT INTO comunidad_likes (publicacion_id, usuario_id) VALUES ($1, $2)', [id, usuarioId]);
        leDiLike = true;
      }
      const conteo = await pool.query('SELECT COUNT(*)::int AS total FROM comunidad_likes WHERE publicacion_id = $1', [id]);
      return res.status(200).json({ ok: true, leDiLike, likes: conteo.rows[0].total });
    }

    // ── POST ?recurso=comentarios — comentar o responder ──────────
    if (req.method === 'POST' && recurso === 'comentarios') {
      const token = getToken(req);
      if (!token) return res.status(401).json({ error: 'Inicia sesión para comentar' });
      const usuarioId = await usuarioDeSesion(pool, token);
      if (!usuarioId) return res.status(401).json({ error: 'Sesión inválida' });

      const { publicacion_id, texto, respuesta_a } = req.body ?? {};
      const textoLimpio = typeof texto === 'string' ? texto.trim().slice(0, 500) : '';
      if (!publicacion_id || !textoLimpio) return res.status(400).json({ error: 'Falta el texto del comentario' });

      const insertado = await pool.query(
        `INSERT INTO comunidad_comentarios (publicacion_id, usuario_id, respuesta_a, texto)
         VALUES ($1, $2, $3, $4)
         RETURNING id, texto, respuesta_a, creado_en, usuario_id`,
        [publicacion_id, usuarioId, respuesta_a || null, textoLimpio]
      );
      const u = await pool.query('SELECT nombre, foto_url FROM usuarios WHERE id = $1', [usuarioId]);
      return res.status(200).json({
        ok: true,
        comentario: { ...insertado.rows[0], autor_nombre: u.rows[0].nombre, autor_foto: u.rows[0].foto_url },
      });
    }

    if (req.method === 'GET') {
      const soloAdmin = req.query.admin === '1';
      if (soloAdmin && !esAdmin(req)) return res.status(403).json({ error: 'No autorizado' });

      // Si viene un token válido, marcamos qué posts ya le dio like
      // este usuario — sin token, solo se ven los conteos.
      const token = getToken(req);
      const usuarioId = token ? await usuarioDeSesion(pool, token) : null;

      const filas = await pool.query(
        `SELECT p.id, p.texto, p.imagen_url, p.video_url, p.video_duracion_seg,
                p.creado_en, p.reportes, p.oculto,
                p.usuario_id, u.nombre AS autor_nombre, u.foto_url AS autor_foto,
                (SELECT COUNT(*)::int FROM comunidad_likes l WHERE l.publicacion_id = p.id) AS likes,
                (SELECT COUNT(*)::int FROM comunidad_comentarios c WHERE c.publicacion_id = p.id) AS comentarios_count,
                ${usuarioId ? `(SELECT COUNT(*)::int FROM comunidad_likes l WHERE l.publicacion_id = p.id AND l.usuario_id = ${Number(usuarioId)}) > 0` : 'FALSE'} AS le_di_like
         FROM comunidad_posts p
         JOIN usuarios u ON u.id = p.usuario_id
         ${soloAdmin ? '' : 'WHERE p.oculto = FALSE'}
         ORDER BY p.creado_en DESC
         LIMIT 60`
      );
      return res.status(200).json({ ok: true, publicaciones: filas.rows });
    }

    // ── POST ?accion=reportar — reportar una publicación ──────────
    if (req.method === 'POST' && accion === 'reportar') {
      const token = getToken(req);
      if (!token) return res.status(401).json({ error: 'Inicia sesión para reportar' });
      const usuarioId = await usuarioDeSesion(pool, token);
      if (!usuarioId) return res.status(401).json({ error: 'Sesión inválida' });

      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'Falta id de la publicación' });

      try {
        await pool.query(
          'INSERT INTO comunidad_reportes (publicacion_id, usuario_id) VALUES ($1, $2)',
          [id, usuarioId]
        );
      } catch {
        return res.status(200).json({ ok: true, yaReportado: true });
      }

      const conteo = await pool.query(
        'SELECT COUNT(*)::int AS total FROM comunidad_reportes WHERE publicacion_id = $1',
        [id]
      );
      const total = conteo.rows[0].total;
      const UMBRAL_OCULTAR = 3;

      if (total >= UMBRAL_OCULTAR) {
        await pool.query('UPDATE comunidad_posts SET reportes = $1, oculto = TRUE WHERE id = $2', [total, id]);
      } else {
        await pool.query('UPDATE comunidad_posts SET reportes = $1 WHERE id = $2', [total, id]);
      }

      return res.status(200).json({ ok: true, reportes: total, oculto: total >= UMBRAL_OCULTAR });
    }

    // ── POST ?accion=vista — registrar reproducción de un video ───
    if (req.method === 'POST' && accion === 'vista') {
      await pool.query(
        `INSERT INTO comunidad_metricas (mes, video_reproducciones)
         VALUES (date_trunc('month', NOW())::date, 1)
         ON CONFLICT (mes) DO UPDATE
         SET video_reproducciones = comunidad_metricas.video_reproducciones + 1`
      );
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'POST') {
      const token = getToken(req);
      if (!token) return res.status(401).json({ error: 'Inicia sesión para publicar' });
      const usuarioId = await usuarioDeSesion(pool, token);
      if (!usuarioId) return res.status(401).json({ error: 'Sesión inválida' });

      const { texto, imagen_url, video_url, video_bytes, video_duracion_seg } = req.body ?? {};
      const textoLimpio = typeof texto === 'string' ? texto.trim().slice(0, 500) : '';
      if (!textoLimpio && !imagen_url && !video_url) {
        return res.status(400).json({ error: 'Escribe algo, sube una foto o un video' });
      }

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
      const usuarioId = await usuarioDeSesion(pool, token);
      if (!usuarioId) return res.status(401).json({ error: 'Sesión inválida' });

      const r = await pool.query('DELETE FROM comunidad_posts WHERE id = $1 AND usuario_id = $2', [id, usuarioId]);
      if (r.rowCount === 0) return res.status(403).json({ error: 'Solo puedes borrar tus propias publicaciones' });
      return res.status(200).json({ ok: true });
    }

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