// ============================================================
// AGENDA DE EVENTOS — tipos, carga con caché y utilidades de fecha
// ============================================================
// NO confundir con src/lib/eventos.ts (conteo de vistas/likes del prestador).
// Aquí vive la agenda pública de actividades de Los Tuxtlas (api/_lib/eventos.ts).
//
// Offline: la app presume funcionar sin internet, así que la última lista que
// se pudo descargar se guarda en localStorage y se muestra si no hay red,
// avisando que puede estar desactualizada. Nunca se inventan eventos.
// ============================================================

export const CATEGORIAS_EVENTO = [
  'Fiesta tradicional', 'Música', 'Gastronomía', 'Cultural', 'Naturaleza', 'Deportivo', 'Feria', 'Otro',
] as const;
export type CategoriaEvento = (typeof CATEGORIAS_EVENTO)[number];

export interface EventoAgenda {
  id: number;
  titulo: string;
  descripcion: string;
  categoria: string;
  /** 'AAAA-MM-DD' (sin zona horaria: es "el sábado", no un instante UTC). */
  fecha: string;
  hora_inicio: string | null;
  fecha_fin: string | null;
  hora_fin: string | null;
  lugar: string;
  municipio: string;
  precio_entrada: string;
  organizador: string;
  contacto: string;
  enlace: string;
  imagen: string;
  /** Actividades por día (Festival del Globo: 12 sep 19:00 inauguración, 13 sep 16:00 suelta…). */
  programa: ItemPrograma[];
}

export interface ItemPrograma {
  /** 'AAAA-MM-DD' */
  dia: string;
  /** 'HH:MM' o '' si no tiene hora fija. */
  hora: string;
  descripcion: string;
  lugar: string;
  imagen: string;
  video: string;
}

const CLAVE_CACHE = 'tuxtlasgo:agenda-eventos';
const CLAVE_CACHE_HISTORIAL = 'tuxtlasgo:agenda-historial';

// ── Fechas ──────────────────────────────────────────────────
/** 'AAAA-MM-DD' → Date a medianoche LOCAL (new Date('2030-03-10') sería UTC y se correría un día). */
export function fechaLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function aISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function hoyISO(): string {
  return aISO(new Date());
}

/** Último día en que el evento sigue "vivo". */
export function finEvento(e: EventoAgenda): string {
  return e.fecha_fin && e.fecha_fin >= e.fecha ? e.fecha_fin : e.fecha;
}

export function ocurreEn(e: EventoAgenda, iso: string): boolean {
  return e.fecha <= iso && iso <= finEvento(e);
}

/** Solo la primera letra en mayúscula (el `capitalize` de CSS pondría "10 De Marzo"). */
export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function localeDe(idioma: string): string {
  return idioma === 'en' ? 'en-US' : 'es-MX';
}

export function formatearHora(hhmm: string | null, idioma: string): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(localeDe(idioma), { hour: 'numeric', minute: '2-digit' });
}

export function formatearRango(e: EventoAgenda, idioma: string): string {
  const loc = localeDe(idioma);
  const corto: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  const ini = fechaLocal(e.fecha).toLocaleDateString(loc, corto);
  const fin = e.fecha_fin && e.fecha_fin > e.fecha ? fechaLocal(e.fecha_fin).toLocaleDateString(loc, corto) : '';
  return fin ? `${ini} – ${fin}` : ini;
}

// ── Carga ───────────────────────────────────────────────────
export interface ResultadoAgenda {
  eventos: EventoAgenda[];
  /** true = no hubo red y se muestra la última lista guardada. */
  desdeCache: boolean;
  /** true = sin red y sin nada guardado: no sabemos qué eventos hay. */
  fallo: boolean;
}

/** Una respuesta vieja guardada puede no traer `programa`: se normaliza. */
function normalizar(lista: EventoAgenda[]): EventoAgenda[] {
  return lista.map((e) => ({ ...e, programa: Array.isArray(e.programa) ? e.programa : [] }));
}

// Un evento sigue "próximo" hasta que pasa su último día; después es historial.
const vigentes = (lista: EventoAgenda[]) => lista.filter((e) => finEvento(e) >= hoyISO());
const terminados = (lista: EventoAgenda[]) =>
  lista.filter((e) => finEvento(e) < hoyISO()).sort((a, b) => (finEvento(a) < finEvento(b) ? 1 : -1));

function leerCache(clave: string): EventoAgenda[] | null {
  try {
    const raw = localStorage.getItem(clave);
    if (!raw) return null;
    const lista = JSON.parse(raw);
    return Array.isArray(lista) ? normalizar(lista as EventoAgenda[]) : null;
  } catch { return null; }
}

async function cargarLista(historial: boolean): Promise<ResultadoAgenda> {
  const clave = historial ? CLAVE_CACHE_HISTORIAL : CLAVE_CACHE;
  const filtrar = historial ? terminados : vigentes;
  try {
    const r = await fetch('/api/comunidad/publicaciones?recurso=eventos' + (historial ? '&historial=1' : ''));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (!data?.ok || !Array.isArray(data.eventos)) throw new Error('Respuesta inesperada');
    try { localStorage.setItem(clave, JSON.stringify(data.eventos)); } catch { /* cuota / modo privado */ }
    return { eventos: filtrar(normalizar(data.eventos)), desdeCache: false, fallo: false };
  } catch {
    const guardada = leerCache(clave);
    if (guardada) return { eventos: filtrar(guardada), desdeCache: true, fallo: false };
    return { eventos: [], desdeCache: false, fallo: true };
  }
}

/** Eventos que aún no terminan. */
export const cargarAgenda = () => cargarLista(false);
/** Eventos que ya terminaron (historial), el más reciente primero. */
export const cargarHistorial = () => cargarLista(true);

/** Agrupa las actividades por día (ya vienen ordenadas del servidor, aquí se asegura). */
export function agruparPorDia(programa: ItemPrograma[]): { dia: string; items: ItemPrograma[] }[] {
  const orden = [...programa].sort((a, b) => (a.dia === b.dia ? a.hora.localeCompare(b.hora) : a.dia.localeCompare(b.dia)));
  const grupos: { dia: string; items: ItemPrograma[] }[] = [];
  for (const it of orden) {
    const g = grupos[grupos.length - 1];
    if (g && g.dia === it.dia) g.items.push(it);
    else grupos.push({ dia: it.dia, items: [it] });
  }
  return grupos;
}

/** ¿El enlace de video es un archivo reproducible directo (no YouTube/Facebook)? */
export function esVideoDirecto(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url) || /res\.cloudinary\.com\/[^/]+\/video\/upload\//i.test(url);
}

/** Solo el enlace si es https (defensa extra: el servidor ya lo valida). */
export function enlaceSeguro(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch { return null; }
}
