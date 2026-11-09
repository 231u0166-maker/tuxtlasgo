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
// GET/POST/DELETE /api/comunidad/publicaciones?recurso=resenas → reseñas de lugares: calificar, comentar, responder, "útil" (ver más abajo)
// PATCH  /api/comunidad/publicaciones                       → admin: restaurar publicación oculta
// DELETE /api/comunidad/publicaciones                       → borrar propia, o cualquiera con admin
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Pool } from 'pg';
import { getPool } from '../_lib/db.js';

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

// ── Reseñas: tablas auto-provisionadas (igual que el resto del proyecto) ──
async function asegurarTablasResenas(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resenas (
      id SERIAL PRIMARY KEY,
      lugar_id TEXT NOT NULL,
      lugar_nombre TEXT NOT NULL DEFAULT '',
      usuario_id INT NOT NULL,
      calificacion INT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
      texto TEXT NOT NULL,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (lugar_id, usuario_id)
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resenas_comentarios (
      id SERIAL PRIMARY KEY,
      resena_id INT NOT NULL REFERENCES resenas(id) ON DELETE CASCADE,
      usuario_id INT NOT NULL,
      respuesta_a INT,
      texto TEXT NOT NULL,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resenas_utiles (
      resena_id INT NOT NULL REFERENCES resenas(id) ON DELETE CASCADE,
      usuario_id INT NOT NULL,
      PRIMARY KEY (resena_id, usuario_id)
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS resenas_lugar ON resenas (lugar_id, creado_en DESC)`);
  // La campana lee de esta misma tabla (ver api/reservaciones.ts)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notificaciones (
      id SERIAL PRIMARY KEY,
      usuario_id INT NOT NULL,
      reservacion_id INT,
      tipo TEXT NOT NULL DEFAULT 'info',
      titulo TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      leida BOOLEAN NOT NULL DEFAULT FALSE,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
}

// Aviso en la campana; nunca a uno mismo.
async function avisar(pool: Pool, destino: number | null | undefined, origen: number, tipo: string, titulo: string, mensaje: string) {
  if (!destino || destino === origen) return;
  await pool.query(
    'INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje) VALUES ($1, $2, $3, $4)',
    [destino, tipo, titulo, mensaje]
  );
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

    // ══ RESEÑAS DE LUGARES (?recurso=resenas) ═══════════════════════
    // Flujo: A publica una reseña (calificación + texto) → B la comenta →
    // A (o cualquiera) responde → los demás marcan "útil". Solo con sesión
    // se escribe; leer es público. Cada aviso llega a la campana.
    if (recurso === 'resenas') {
      await asegurarTablasResenas(pool);
      const token = getToken(req);
      const yo = token ? await usuarioDeSesion(pool, token) : null;

      // GET ?lugar_id=X — reseñas + comentarios + resumen
      if (req.method === 'GET') {
        const lugarId = typeof req.query.lugar_id === 'string' ? req.query.lugar_id.slice(0, 80) : '';
        if (!lugarId) return res.status(400).json({ error: 'Falta lugar_id' });
        const filas = await pool.query(
          `SELECT r.id, r.usuario_id, r.calificacion, r.texto, r.creado_en,
                  u.nombre AS autor_nombre, u.foto_url AS autor_foto,
                  (SELECT COUNT(*)::int FROM resenas_utiles x WHERE x.resena_id = r.id) AS utiles,
                  EXISTS (SELECT 1 FROM resenas_utiles x WHERE x.resena_id = r.id AND x.usuario_id = $2) AS le_di_util
           FROM resenas r JOIN usuarios u ON u.id = r.usuario_id
           WHERE r.lugar_id = $1
           ORDER BY r.creado_en DESC LIMIT 100`,
          [lugarId, yo ?? 0]
        );
        const ids = filas.rows.map((r: any) => r.id);
        const coms = ids.length
          ? await pool.query(
              `SELECT c.id, c.resena_id, c.usuario_id, c.respuesta_a, c.texto, c.creado_en,
                      u.nombre AS autor_nombre, u.foto_url AS autor_foto
               FROM resenas_comentarios c JOIN usuarios u ON u.id = c.usuario_id
               WHERE c.resena_id = ANY($1::int[])
               ORDER BY c.creado_en ASC`,
              [ids]
            )
          : { rows: [] as any[] };
        const resenas = filas.rows.map((r: any) => ({
          ...r,
          comentarios: coms.rows.filter((c: any) => c.resena_id === r.id),
        }));
        const total = resenas.length;
        const promedio = total ? resenas.reduce((a: number, r: any) => a + r.calificacion, 0) / total : 0;
        const distribucion = [5, 4, 3, 2, 1].map((n) => resenas.filter((r: any) => r.calificacion === n).length);
        return res.status(200).json({
          ok: true,
          resumen: { total, promedio: Math.round(promedio * 10) / 10, distribucion },
          resenas,
        });
      }

      // DELETE ?tipo=resena|comentario&id=N — solo lo propio
      if (req.method === 'DELETE') {
        if (!yo) return res.status(401).json({ error: 'Inicia sesión' });
        const id = Number(req.query.id);
        if (!id) return res.status(400).json({ error: 'Falta id' });
        const tabla = req.query.tipo === 'comentario' ? 'resenas_comentarios' : 'resenas';
        const r = await pool.query(`DELETE FROM ${tabla} WHERE id = $1 AND usuario_id = $2`, [id, yo]);
        if (r.rowCount === 0) return res.status(403).json({ error: 'Solo puedes borrar lo tuyo' });
        return res.status(200).json({ ok: true });
      }

      if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
      if (!yo) return res.status(401).json({ error: 'Inicia sesión para participar' });
      const quien = await pool.query('SELECT nombre FROM usuarios WHERE id = $1', [yo]);
      const miNombre: string = quien.rows[0]?.nombre ?? 'Alguien';
      const b = req.body ?? {};

      // POST accion=resena — crea o actualiza MI reseña de un lugar
      if (b.accion === 'resena') {
        const lugarId = typeof b.lugar_id === 'string' ? b.lugar_id.slice(0, 80) : '';
        const lugarNombre = typeof b.lugar_nombre === 'string' ? b.lugar_nombre.slice(0, 120) : 'un lugar';
        const cal = Math.round(Number(b.calificacion));
        const texto = typeof b.texto === 'string' ? b.texto.trim().slice(0, 1000) : '';
        if (!lugarId || !(cal >= 1 && cal <= 5)) return res.status(400).json({ error: 'Elige de 1 a 5 estrellas' });
        if (texto.length < 3) return res.status(400).json({ error: 'Cuéntanos tu experiencia (mínimo unas palabras)' });
        const previa = await pool.query('SELECT id FROM resenas WHERE lugar_id = $1 AND usuario_id = $2', [lugarId, yo]);
        const r = await pool.query(
          `INSERT INTO resenas (lugar_id, lugar_nombre, usuario_id, calificacion, texto)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (lugar_id, usuario_id)
           DO UPDATE SET calificacion = EXCLUDED.calificacion, texto = EXCLUDED.texto, lugar_nombre = EXCLUDED.lugar_nombre
           RETURNING id`,
          [lugarId, lugarNombre, yo, cal, texto]
        );
        // Aviso al dueño del servicio (solo si es un servicio de prestador y es reseña nueva)
        const m = /^prestador-(\d+)$/.exec(lugarId);
        if (m && previa.rows.length === 0) {
          const dueno = await pool.query('SELECT usuario_id FROM servicios WHERE id = $1', [Number(m[1])]);
          await avisar(pool, dueno.rows[0]?.usuario_id, yo, 'resena', `Nueva reseña en ${lugarNombre}`, `${miNombre} calificó con ${cal} ★: "${texto.slice(0, 80)}"`);
        }
        return res.status(200).json({ ok: true, id: r.rows[0].id });
      }

      // POST accion=comentar — comenta una reseña o responde a un comentario
      if (b.accion === 'comentar') {
        const resenaId = Number(b.resena_id);
        const texto = typeof b.texto === 'string' ? b.texto.trim().slice(0, 500) : '';
        const respuestaA = b.respuesta_a ? Number(b.respuesta_a) : null;
        if (!resenaId || !texto) return res.status(400).json({ error: 'Falta el texto' });
        const rs = await pool.query('SELECT usuario_id, lugar_nombre FROM resenas WHERE id = $1', [resenaId]);
        if (rs.rows.length === 0) return res.status(404).json({ error: 'La reseña ya no existe' });
        const ins = await pool.query(
          `INSERT INTO resenas_comentarios (resena_id, usuario_id, respuesta_a, texto)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [resenaId, yo, respuestaA, texto]
        );
        const lugar = rs.rows[0].lugar_nombre;
        const resumen = `${miNombre}: "${texto.slice(0, 80)}"`;
        if (respuestaA) {
          const cm = await pool.query('SELECT usuario_id FROM resenas_comentarios WHERE id = $1 AND resena_id = $2', [respuestaA, resenaId]);
          const destino = cm.rows[0]?.usuario_id;
          await avisar(pool, destino, yo, 'resena_respuesta', `Respondieron tu comentario en ${lugar}`, resumen);
          // Si quien recibe la respuesta no es el autor de la reseña, este también se entera
          if (rs.rows[0].usuario_id !== destino) {
            await avisar(pool, rs.rows[0].usuario_id, yo, 'resena_comentario', `Nueva respuesta en tu reseña de ${lugar}`, resumen);
          }
        } else {
          await avisar(pool, rs.rows[0].usuario_id, yo, 'resena_comentario', `Comentaron tu reseña de ${lugar}`, resumen);
        }
        return res.status(200).json({ ok: true, id: ins.rows[0].id });
      }

      // POST accion=util — marca/quita "útil" en una reseña ajena
      if (b.accion === 'util') {
        const resenaId = Number(b.resena_id);
        if (!resenaId) return res.status(400).json({ error: 'Falta resena_id' });
        const rs = await pool.query('SELECT usuario_id, lugar_nombre FROM resenas WHERE id = $1', [resenaId]);
        if (rs.rows.length === 0) return res.status(404).json({ error: 'La reseña ya no existe' });
        if (rs.rows[0].usuario_id === yo) return res.status(400).json({ error: 'No puedes votar tu propia reseña' });
        const ya = await pool.query('SELECT 1 FROM resenas_utiles WHERE resena_id = $1 AND usuario_id = $2', [resenaId, yo]);
        let leDiUtil: boolean;
        if (ya.rows.length) {
          await pool.query('DELETE FROM resenas_utiles WHERE resena_id = $1 AND usuario_id = $2', [resenaId, yo]);
          leDiUtil = false;
        } else {
          await pool.query('INSERT INTO resenas_utiles (resena_id, usuario_id) VALUES ($1, $2)', [resenaId, yo]);
          leDiUtil = true;
          await avisar(pool, rs.rows[0].usuario_id, yo, 'resena_util', 'Tu reseña le sirvió a alguien', `${miNombre} marcó útil tu reseña de ${rs.rows[0].lugar_nombre}`);
        }
        const c = await pool.query('SELECT COUNT(*)::int AS n FROM resenas_utiles WHERE resena_id = $1', [resenaId]);
        return res.status(200).json({ ok: true, leDiUtil, utiles: c.rows[0].n });
      }

      return res.status(400).json({ error: 'Acción no válida' });
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