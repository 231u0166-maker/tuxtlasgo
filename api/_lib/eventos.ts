// api/_lib/eventos.ts — se sirve desde api/comunidad/publicaciones.ts con ?recurso=eventos
// ============================================================
// AGENDA DE EVENTOS — calendario público de Los Tuxtlas
// ============================================================
// (El plan Hobby de Vercel limita a 12 funciones serverless: por eso esto NO es un
// archivo suelto en api/ sino un módulo en _lib/ que despacha publicaciones.ts.)
//
//   GET    /api/comunidad/publicaciones?recurso=eventos            → público: eventos PUBLICADOS que aún no terminan
//   GET    ...?recurso=eventos&historial=1 → público: eventos PUBLICADOS que ya terminaron (historial)
//   GET    ...?recurso=eventos&admin=1  → admin: todos (borrador, publicado, archivado)
//   POST   ...?recurso=eventos     → admin: crear
//   PATCH  ...?recurso=eventos     → admin: editar / cambiar estado   { id, ...campos }
//   DELETE ...?recurso=eventos     → admin: eliminar                  { id }
//
// NO confundir con `eventos_servicio` (api/_lib/db.ts): esa tabla cuenta vistas,
// likes y recomendaciones de IA para las estadísticas del prestador. Esto es la
// agenda de actividades (fiestas, ferias, conciertos…) que ve el turista.
//
// COBRO — todavía NO se cobra nada. Las columnas `origen`, `usuario_id`,
// `monto_publicacion` y `pago_estado` ya existen para que, cuando la plataforma
// tenga tráfico y se abra la publicación de anuncios al público, el flujo
// "enviar → admin aprueba → pago con Mercado Pago → publicado" se agregue sin
// migrar datos. Hoy todo es origen='admin' y pago_estado='sin_cobro'.
//
// Fechas: se guardan como DATE + hora en texto ("18:30"), sin zona horaria, porque
// un evento es "el sábado a las 6 pm" en Los Tuxtlas, no un instante UTC. Las
// columnas DATE se devuelven con to_char para que el driver no las convierta a
// Date de JS (eso las corre un día según la zona del servidor).
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Pool } from 'pg';
import { getPool } from './db.js';

const CATEGORIAS = ['Fiesta tradicional', 'Música', 'Gastronomía', 'Cultural', 'Naturaleza', 'Deportivo', 'Feria', 'Otro'] as const;
const ESTADOS = ['borrador', 'publicado', 'archivado'] as const;

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Admin-Password');
}

let tablaLista = false;
async function asegurarTablaEventos(pool: Pool) {
  if (tablaLista) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS eventos_turisticos (
      id SERIAL PRIMARY KEY,
      titulo TEXT NOT NULL,
      descripcion TEXT NOT NULL DEFAULT '',
      categoria TEXT NOT NULL DEFAULT 'Otro',
      fecha DATE NOT NULL,
      hora_inicio TEXT,
      fecha_fin DATE,
      hora_fin TEXT,
      lugar TEXT NOT NULL DEFAULT '',
      municipio TEXT NOT NULL DEFAULT '',
      precio_entrada TEXT NOT NULL DEFAULT '',
      organizador TEXT NOT NULL DEFAULT '',
      contacto TEXT NOT NULL DEFAULT '',
      enlace TEXT NOT NULL DEFAULT '',
      imagen TEXT NOT NULL DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'borrador',
      origen TEXT NOT NULL DEFAULT 'admin',
      usuario_id INT,
      monto_publicacion NUMERIC(10,2) NOT NULL DEFAULT 0,
      pago_estado TEXT NOT NULL DEFAULT 'sin_cobro',
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  // Programa de actividades: [{ dia, hora, descripcion, lugar, imagen, video }], ordenado por día y hora.
  await pool.query("ALTER TABLE eventos_turisticos ADD COLUMN IF NOT EXISTS programa JSONB NOT NULL DEFAULT '[]'::jsonb");
  await pool.query('CREATE INDEX IF NOT EXISTS idx_eventos_turisticos_fecha ON eventos_turisticos (estado, fecha)');
  tablaLista = true;
}

// Columnas que se devuelven (fechas como texto 'YYYY-MM-DD').
const COLUMNAS = `
  id, titulo, descripcion, categoria,
  to_char(fecha, 'YYYY-MM-DD') AS fecha, hora_inicio,
  to_char(fecha_fin, 'YYYY-MM-DD') AS fecha_fin, hora_fin,
  lugar, municipio, precio_entrada, organizador, contacto, enlace, imagen, programa,
  estado, origen, monto_publicacion, pago_estado, creado_en, actualizado_en`;

// "Hoy" en Los Tuxtlas (America/Mexico_City), no en la zona del servidor (UTC):
// de lo contrario un evento de hoy por la noche desaparecería a las 6 pm.
const HOY_MX = `(NOW() AT TIME ZONE 'America/Mexico_City')::date`;

// ── Validación ───────────────────────────────────────────────
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function fechaValida(s: unknown): s is string {
  if (typeof s !== 'string' || !RE_FECHA.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Solo https: evita `javascript:` y contenido mixto en los enlaces/imágenes.
function urlHttps(s: unknown): string | null {
  if (typeof s !== 'string' || !s.trim()) return '';
  try {
    const u = new URL(s.trim());
    return u.protocol === 'https:' ? u.toString() : null;
  } catch { return null; }
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export type ItemPrograma = { dia: string; hora: string; descripcion: string; lugar: string; imagen: string; video: string };

const MAX_ACTIVIDADES = 60;

function validarPrograma(v: unknown): { error?: string; items?: ItemPrograma[] } {
  if (v == null || v === '') return { items: [] };
  if (!Array.isArray(v)) return { error: 'El programa debe ser una lista de actividades.' };
  if (v.length > MAX_ACTIVIDADES) return { error: `Máximo ${MAX_ACTIVIDADES} actividades por evento.` };
  const items: ItemPrograma[] = [];
  for (let i = 0; i < v.length; i++) {
    const a = v[i] as Record<string, unknown> | null;
    const n = i + 1;
    if (!a || typeof a !== 'object' || Array.isArray(a)) return { error: `Actividad ${n}: formato no válido.` };
    if (!fechaValida(a.dia)) return { error: `Actividad ${n}: el día no es válido.` };
    const hora = typeof a.hora === 'string' ? a.hora.trim() : '';
    if (hora && !RE_HORA.test(hora)) return { error: `Actividad ${n}: la hora debe tener el formato HH:MM.` };
    const descripcion = texto(a.descripcion, 600);
    if (!descripcion) return { error: `Actividad ${n}: falta la descripción.` };
    const imagen = urlHttps(a.imagen);
    if (imagen === null) return { error: `Actividad ${n}: la foto debe ser un enlace https:// válido.` };
    const video = urlHttps(a.video);
    if (video === null) return { error: `Actividad ${n}: el video debe ser un enlace https:// válido.` };
    items.push({ dia: a.dia as string, hora, descripcion, lugar: texto(a.lugar, 140), imagen, video });
  }
  // Por día y, dentro del día, por hora (las que no tienen hora van primero).
  items.sort((x, y) => (x.dia === y.dia ? x.hora.localeCompare(y.hora) : x.dia.localeCompare(y.dia)));
  return { items };
}

type Campos = {
  titulo: string; descripcion: string; categoria: string;
  fecha: string; hora_inicio: string | null; fecha_fin: string | null; hora_fin: string | null;
  lugar: string; municipio: string; precio_entrada: string; organizador: string;
  contacto: string; enlace: string; imagen: string; estado: string; programa: ItemPrograma[];
};

// `parcial`: en PATCH solo se validan los campos que llegaron.
function validar(body: Record<string, unknown>, parcial: boolean): { error?: string; campos: Partial<Campos> } {
  const c: Partial<Campos> = {};
  const tiene = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  if (!parcial || tiene('titulo')) {
    const t = texto(body.titulo, 120);
    if (t.length < 3) return { error: 'El título debe tener al menos 3 caracteres.', campos: c };
    c.titulo = t;
  }
  if (!parcial || tiene('descripcion')) c.descripcion = texto(body.descripcion, 2000);
  if (!parcial || tiene('categoria')) {
    const cat = texto(body.categoria, 40) || 'Otro';
    if (!(CATEGORIAS as readonly string[]).includes(cat)) return { error: 'Categoría no válida.', campos: c };
    c.categoria = cat;
  }
  if (!parcial || tiene('fecha')) {
    if (!fechaValida(body.fecha)) return { error: 'La fecha de inicio no es válida (AAAA-MM-DD).', campos: c };
    c.fecha = body.fecha as string;
  }
  if (!parcial || tiene('fecha_fin')) {
    const f = body.fecha_fin;
    if (f === '' || f == null) c.fecha_fin = null;
    else if (!fechaValida(f)) return { error: 'La fecha de fin no es válida (AAAA-MM-DD).', campos: c };
    else c.fecha_fin = f as string;
  }
  for (const k of ['hora_inicio', 'hora_fin'] as const) {
    if (!parcial || tiene(k)) {
      const h = body[k];
      if (h === '' || h == null) c[k] = null;
      else if (typeof h !== 'string' || !RE_HORA.test(h)) return { error: 'La hora debe tener el formato HH:MM.', campos: c };
      else c[k] = h;
    }
  }
  if (!parcial || tiene('lugar')) c.lugar = texto(body.lugar, 140);
  if (!parcial || tiene('municipio')) c.municipio = texto(body.municipio, 60);
  if (!parcial || tiene('precio_entrada')) c.precio_entrada = texto(body.precio_entrada, 60);
  if (!parcial || tiene('organizador')) c.organizador = texto(body.organizador, 100);
  if (!parcial || tiene('contacto')) c.contacto = texto(body.contacto, 100);
  for (const k of ['enlace', 'imagen'] as const) {
    if (!parcial || tiene(k)) {
      const u = urlHttps(body[k]);
      if (u === null) return { error: `El campo "${k}" debe ser un enlace https:// válido.`, campos: c };
      c[k] = u;
    }
  }
  if (!parcial || tiene('programa')) {
    const r = validarPrograma(body.programa);
    if (r.error) return { error: r.error, campos: c };
    c.programa = r.items;
  }
  if (!parcial || tiene('estado')) {
    const e = texto(body.estado, 20) || 'borrador';
    if (!(ESTADOS as readonly string[]).includes(e)) return { error: 'Estado no válido.', campos: c };
    c.estado = e;
  }
  if (c.fecha && c.fecha_fin && c.fecha_fin < c.fecha) return { error: 'La fecha de fin no puede ser anterior a la de inicio.', campos: c };
  return { campos: c };
}

export async function manejarEventos(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const esAdmin = req.headers['x-admin-password'] === (process.env.ADMIN_PASSWORD ?? 'tuxtlasgo2026');
  const pedidoAdmin = req.method !== 'GET' || req.query.admin === '1';
  if (pedidoAdmin && !esAdmin) return res.status(401).json({ error: 'Contraseña incorrecta' });

  const pool = getPool();
  try {
    await asegurarTablaEventos(pool);

    // ── Público: solo publicados y vigentes ─────────────────────
    if (req.method === 'GET' && !pedidoAdmin) {
      // Un evento se queda en "próximos" hasta que pasa su ÚLTIMO día; ese mismo día ya no
      // cuenta como terminado. Después pasa solo al historial (más reciente primero).
      const historial = req.query.historial === '1';
      const r = await pool.query(
        historial
          ? `SELECT ${COLUMNAS} FROM eventos_turisticos
             WHERE estado = 'publicado' AND COALESCE(fecha_fin, fecha) < ${HOY_MX}
             ORDER BY COALESCE(fecha_fin, fecha) DESC, id DESC
             LIMIT 100`
          : `SELECT ${COLUMNAS} FROM eventos_turisticos
             WHERE estado = 'publicado' AND COALESCE(fecha_fin, fecha) >= ${HOY_MX}
             ORDER BY fecha ASC, hora_inicio ASC NULLS FIRST, id ASC
             LIMIT 200`,
      );
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      // Lo que no es público (cobro, origen) no se expone al turista.
      const eventos = r.rows.map(({ origen: _o, monto_publicacion: _m, pago_estado: _p, estado: _e, creado_en: _c, actualizado_en: _a, ...pub }) => pub);
      return res.status(200).json({ ok: true, eventos });
    }

    // ── Admin: todos ────────────────────────────────────────────
    if (req.method === 'GET') {
      const r = await pool.query(`SELECT ${COLUMNAS} FROM eventos_turisticos ORDER BY fecha DESC, id DESC LIMIT 500`);
      return res.status(200).json({ ok: true, eventos: r.rows });
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

    if (req.method === 'POST') {
      const { error, campos } = validar(body, false);
      if (error) return res.status(400).json({ error });
      const c = campos as Campos;
      const r = await pool.query(
        `INSERT INTO eventos_turisticos
           (titulo, descripcion, categoria, fecha, hora_inicio, fecha_fin, hora_fin, lugar, municipio,
            precio_entrada, organizador, contacto, enlace, imagen, estado, programa)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
         RETURNING ${COLUMNAS}`,
        [c.titulo, c.descripcion, c.categoria, c.fecha, c.hora_inicio, c.fecha_fin, c.hora_fin, c.lugar, c.municipio,
         c.precio_entrada, c.organizador, c.contacto, c.enlace, c.imagen, c.estado, JSON.stringify(c.programa ?? [])],
      );
      return res.status(201).json({ ok: true, evento: r.rows[0] });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Falta el id del evento.' });

    if (req.method === 'PATCH') {
      const { error, campos } = validar(body, true);
      if (error) return res.status(400).json({ error });
      const claves = Object.keys(campos);
      if (claves.length === 0) return res.status(400).json({ error: 'No hay cambios que guardar.' });
      // Las claves vienen de `validar` (lista fija), nunca del cliente: seguro armar el SET.
      const set = claves.map((k, i) => `${k} = $${i + 2}${k === 'programa' ? '::jsonb' : ''}`).join(', ');
      // Si el cruce de fechas depende de una columna que no vino, se revisa contra la guardada.
      if ((campos.fecha || campos.fecha_fin) && !(campos.fecha && campos.fecha_fin !== undefined)) {
        const act = await pool.query(`SELECT to_char(fecha,'YYYY-MM-DD') AS fecha, to_char(fecha_fin,'YYYY-MM-DD') AS fecha_fin FROM eventos_turisticos WHERE id = $1`, [id]);
        if (!act.rows[0]) return res.status(404).json({ error: 'Evento no encontrado.' });
        const ini = campos.fecha ?? act.rows[0].fecha;
        const fin = campos.fecha_fin !== undefined ? campos.fecha_fin : act.rows[0].fecha_fin;
        if (fin && fin < ini) return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la de inicio.' });
      }
      const r = await pool.query(
        `UPDATE eventos_turisticos SET ${set}, actualizado_en = NOW() WHERE id = $1 RETURNING ${COLUMNAS}`,
        [id, ...claves.map((k) => (k === 'programa' ? JSON.stringify(campos.programa) : (campos as Record<string, unknown>)[k]))],
      );
      if (!r.rows[0]) return res.status(404).json({ error: 'Evento no encontrado.' });
      return res.status(200).json({ ok: true, evento: r.rows[0] });
    }

    if (req.method === 'DELETE') {
      const r = await pool.query('DELETE FROM eventos_turisticos WHERE id = $1', [id]);
      if (r.rowCount === 0) return res.status(404).json({ error: 'Evento no encontrado.' });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[eventos]', err);
    return res.status(500).json({ error: 'Error del servidor' });
  } finally {
    await pool.end();
  }
}
