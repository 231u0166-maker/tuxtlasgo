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
}

const CLAVE_CACHE = 'tuxtlasgo:agenda-eventos';

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

function vigentes(lista: EventoAgenda[]): EventoAgenda[] {
  const hoy = hoyISO();
  return lista.filter((e) => finEvento(e) >= hoy);
}

function leerCache(): EventoAgenda[] | null {
  try {
    const raw = localStorage.getItem(CLAVE_CACHE);
    if (!raw) return null;
    const lista = JSON.parse(raw);
    return Array.isArray(lista) ? (lista as EventoAgenda[]) : null;
  } catch { return null; }
}

export async function cargarAgenda(): Promise<ResultadoAgenda> {
  try {
    const r = await fetch('/api/comunidad/publicaciones?recurso=eventos');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (!data?.ok || !Array.isArray(data.eventos)) throw new Error('Respuesta inesperada');
    try { localStorage.setItem(CLAVE_CACHE, JSON.stringify(data.eventos)); } catch { /* cuota / modo privado */ }
    return { eventos: vigentes(data.eventos), desdeCache: false, fallo: false };
  } catch {
    const guardada = leerCache();
    if (guardada) return { eventos: vigentes(guardada), desdeCache: true, fallo: false };
    return { eventos: [], desdeCache: false, fallo: true };
  }
}

/** Solo el enlace si es https (defensa extra: el servidor ya lo valida). */
export function enlaceSeguro(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch { return null; }
}
