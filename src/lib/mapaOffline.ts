// ============================================================
// MAPAS OFFLINE POR ZONA — una sola descarga para todo
// ============================================================
// El turista elige una zona (en cualquier parte de México) y se guarda de una
// vez, sin pasos separados:
//   · Calles y edificios (OpenFreeMap): estilo, sprites, letras y todos los
//     mosaicos vectoriales de la zona hasta z14 (el máximo real de la fuente).
//   · Satélite (Mapbox, o Esri sin token): vista general de la zona y detalle
//     hasta donde alcanza el tope de tamaño.
//   · Red de calles y senderos para calcular rutas sin internet: se arma en el
//     teléfono con los mosaicos recién bajados (ver grafoDesdeMosaicos.ts).
//
// Todo va a Cache Storage ('mapa-offline-v1'; el service worker sirve desde
// ahí, ver vite.config.ts) y no expira solo. La lista de zonas descargadas
// vive en localStorage.
// ============================================================

import { LOS_TUXTLAS_BOUNDS } from '../data/lugares';
import { construirGrafoDeMosaicos } from './grafoDesdeMosaicos';

export const CACHE_MAPA = 'mapa-offline-v1';
export const CACHE_GRAFOS = 'grafo-zonas-v1';
export const ESTILO_MAPA_URL = 'https://tiles.openfreemap.org/styles/liberty';
const MANIFIESTO = 'https://tiles.openfreemap.org/planet';
const SPRITE_BASE = 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm';
const FUENTES = ['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic'];
const RANGOS_LETRAS = ['0-255', '256-511', '8192-8447']; // latín, latín ext., puntuación (— “ ”)
const ZOOM_CALLES_MAX = 14;

export const urlGrafoZona = (id: string) => `/grafo-zona/${id}.json`;

export const TOKEN_MAPBOX = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined)?.trim();
export const PLANTILLA_SATELITE = TOKEN_MAPBOX
  ? `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${TOKEN_MAPBOX}`
  : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
// Zoom más fino que se intenta descargar (la fuente llega a 17 con Mapbox, 15 con Esri)
export const ZOOM_SATELITE_DESCARGA = TOKEN_MAPBOX ? 16 : 15;
const KB_POR_MOSAICO_SAT = TOKEN_MAPBOX ? 75 : 28;
const KB_POR_MOSAICO_CALLES = 55; // promedio ciudad/campo en z10–14
const MAX_MOSAICOS_DETALLE_SAT = 800;

export type Caja = [number, number, number, number]; // [oeste, sur, este, norte]
export type Progreso = (porcentaje: number, etapa: string) => void;

// ---------- zonas guardadas ----------
export interface ZonaOffline {
  id: string;
  nombre: string;
  caja: Caja;
  fecha: number;
  snapshot: string | null; // carpeta de mosaicos de OpenFreeMap usada al bajar
  mosaicosCalles: number;
  satelite: { zoomMax: number; mosaicos: number } | null;
  grafo: boolean; // red de calles/senderos lista para rutas sin internet
}
const CLAVE_ZONAS = 'mapa-offline-zonas-v1';

export function leerZonas(): ZonaOffline[] {
  try {
    const z = JSON.parse(localStorage.getItem(CLAVE_ZONAS) || '[]');
    return Array.isArray(z) ? z : [];
  } catch {
    return [];
  }
}
function guardarZonas(z: ZonaOffline[]) {
  try { localStorage.setItem(CLAVE_ZONAS, JSON.stringify(z)); } catch { /* sin localStorage */ }
}
export const hayMapaOffline = () => leerZonas().length > 0;

// ---------- matemática de mosaicos ----------
const lngToX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
const latToY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const xToLng = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const yToLat = (y: number, z: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

function mosaicosDeCaja(caja: Caja, z: number): [number, number][] {
  const max = 2 ** z - 1;
  const x0 = Math.max(0, lngToX(caja[0], z));
  const x1 = Math.min(max, lngToX(caja[2], z));
  const y0 = Math.max(0, latToY(caja[3], z));
  const y1 = Math.min(max, latToY(caja[1], z));
  const out: [number, number][] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([x, y]);
  return out;
}
const conMargen = (c: Caja, m: number): Caja => [c[0] - m, c[1] - m, c[2] + m, c[3] + m];

const urlMosaico = (plantilla: string, z: number, x: number, y: number) =>
  plantilla.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

// El snapshot de OpenFreeMap (carpeta con fecha) cambia cada pocos días y cada
// zona se bajó con el suyo. Sin internet, MapLibre pediría el que le quedó en
// el manifiesto: se reescribe con el de la zona que contiene ese mosaico.
export function ajustarUrlSinConexion(url: string): string {
  if (typeof navigator === 'undefined' || navigator.onLine) return url;
  const m = url.match(/tiles\.openfreemap\.org\/planet\/\d{8}_\d{6}_pt\/(\d+)\/(\d+)\/(\d+)\.pbf/);
  if (!m) return url;
  const z = +m[1], x = +m[2], y = +m[3];
  const lat = yToLat(y + 0.5, z), lng = xToLng(x + 0.5, z);
  const zonas = leerZonas().filter((c) => c.snapshot).sort((a, b) => b.fecha - a.fecha);
  const margen = z <= 9 ? 1.5 : 0.05;
  const dueña = zonas.find((c) => lng >= c.caja[0] - margen && lng <= c.caja[2] + margen &&
    lat >= c.caja[1] - margen && lat <= c.caja[3] + margen) ?? zonas[0];
  if (!dueña?.snapshot) return url;
  return url.replace(/(tiles\.openfreemap\.org\/planet\/)\d{8}_\d{6}_pt\//, `$1${dueña.snapshot}/`);
}

// ---------- tamaños de zona y estimaciones ----------
export type TamanoZona = 'pequena' | 'ciudad' | 'region' | 'tuxtlas';
export const TAMANOS: { id: TamanoZona; nombre: string; detalle: string }[] = [
  { id: 'pequena', nombre: 'Cerca de aquí', detalle: '~6 km a la redonda' },
  { id: 'ciudad', nombre: 'Ciudad', detalle: '~15 km a la redonda' },
  { id: 'region', nombre: 'Región', detalle: '~30 km a la redonda' },
  { id: 'tuxtlas', nombre: 'Los Tuxtlas completo', detalle: 'toda la región' },
];
const RADIO_KM: Record<Exclude<TamanoZona, 'tuxtlas'>, number> = { pequena: 6, ciudad: 15, region: 30 };

export function cajaDeZona(tamano: TamanoZona, centro: [number, number] /* [lat, lng] */): Caja {
  if (tamano === 'tuxtlas') {
    const [[s, w], [n, e]] = LOS_TUXTLAS_BOUNDS;
    return [w, s, e, n];
  }
  const km = RADIO_KM[tamano];
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((centro[0] * Math.PI) / 180));
  return [centro[1] - dLng, centro[0] - dLat, centro[1] + dLng, centro[0] + dLat];
}

export interface PlanZona {
  mosaicosCalles: number;
  mbCalles: number;
  satelite: { zoomMax: number; mosaicos: number; mb: number };
  mbTotal: number;
}

function mosaicosCallesZona(caja: Caja): number {
  let n = 0;
  for (let z = 0; z <= 9; z++) n += mosaicosDeCaja(conMargen(caja, 1.5), z).length;
  for (let z = 10; z <= ZOOM_CALLES_MAX; z++) n += mosaicosDeCaja(caja, z).length;
  return n;
}

function urlsSatelite(caja: Caja, zoomMax: number): string[] {
  const urls: string[] = [];
  for (let z = 8; z <= 13; z++) {
    for (const [x, y] of mosaicosDeCaja(caja, z)) urls.push(urlMosaico(PLANTILLA_SATELITE, z, x, y));
  }
  for (let z = 14; z <= zoomMax; z++) {
    for (const [x, y] of mosaicosDeCaja(caja, z)) urls.push(urlMosaico(PLANTILLA_SATELITE, z, x, y));
  }
  return urls;
}

// Elige el zoom de satélite más fino que cabe en el tope de mosaicos
function zoomSateliteParaCaja(caja: Caja): number {
  let zoomMax = ZOOM_SATELITE_DESCARGA;
  const detalle = (zm: number) => {
    let n = 0;
    for (let z = 14; z <= zm; z++) n += mosaicosDeCaja(caja, z).length;
    return n;
  };
  while (zoomMax > 13 && detalle(zoomMax) > MAX_MOSAICOS_DETALLE_SAT) zoomMax--;
  return zoomMax;
}

export function planearZona(caja: Caja, conSatelite: boolean): PlanZona {
  const mosaicosCalles = mosaicosCallesZona(caja);
  const mbCalles = Math.round((mosaicosCalles * KB_POR_MOSAICO_CALLES) / 1024) + 1;
  const zoomMax = zoomSateliteParaCaja(caja);
  const sat = conSatelite ? urlsSatelite(caja, zoomMax).length : 0;
  const mbSat = Math.round((sat * KB_POR_MOSAICO_SAT) / 1024);
  return {
    mosaicosCalles,
    mbCalles,
    satelite: { zoomMax, mosaicos: sat, mb: mbSat },
    mbTotal: mbCalles + mbSat + 2,
  };
}

// ---------- descarga con reintentos ----------
async function guardarUrl(cache: Cache, url: string, senal?: AbortSignal): Promise<'ok' | 'error'> {
  if (await cache.match(url)) return 'ok';
  for (let intento = 0; intento < 3; intento++) {
    if (senal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    try {
      const r = await fetch(url, { signal: senal });
      if (r.ok) {
        await cache.put(url, r);
        return 'ok';
      }
      if (r.status === 404 || r.status === 403) return 'error'; // no existe: no se reintenta
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
    }
    await new Promise((res) => setTimeout(res, 400 * (intento + 1)));
  }
  return 'error';
}

async function descargarLista(
  cache: Cache,
  urls: string[],
  alAvanzar: (hechas: number, total: number) => void,
  senal?: AbortSignal
): Promise<{ ok: number; errores: number }> {
  let ok = 0, errores = 0, hechas = 0, cursor = 0;
  const trabajador = async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      const r = await guardarUrl(cache, url, senal);
      if (r === 'error') errores++; else ok++;
      alAvanzar(++hechas, urls.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, trabajador));
  return { ok, errores };
}

async function pedirAlmacenamientoPersistente() {
  // Evita que el navegador borre el mapa "por falta de espacio" más adelante.
  try { await navigator.storage?.persist?.(); } catch { /* opcional */ }
}

// ---------- DESCARGA UNIFICADA ----------
export async function descargarZona(
  caja: Caja,
  conSatelite: boolean,
  nombre: string,
  onProgreso: Progreso,
  senal?: AbortSignal
): Promise<ZonaOffline> {
  if (typeof caches === 'undefined') throw new Error('Este navegador no permite guardar mapas sin conexión.');
  await pedirAlmacenamientoPersistente();
  const cache = await caches.open(CACHE_MAPA);

  // Tramos de la barra: calles 0–55 %, satélite 55–85 % (o nada), rutas 85–100 %
  const finCalles = conSatelite ? 55 : 80;
  const finSat = conSatelite ? 85 : 80;

  onProgreso(1, 'Preparando…');
  // El manifiesto manda: dice cuál es el snapshot vigente de los mosaicos.
  const rm = await fetch(MANIFIESTO, { cache: 'no-store', signal: senal });
  if (!rm.ok) throw new Error('No se pudo consultar el mapa base.');
  await cache.put(MANIFIESTO, rm.clone());
  const plantilla: string = (await rm.json()).tiles[0];
  const snapshot = plantilla.match(/planet\/(\d{8}_\d{6}_pt)\//)?.[1] ?? null;

  // Estilo + sprites + tipos de letra (sin ellos no hay colores, íconos ni nombres)
  const fijas = [
    ESTILO_MAPA_URL,
    `${SPRITE_BASE}.json`, `${SPRITE_BASE}.png`, `${SPRITE_BASE}@2x.json`, `${SPRITE_BASE}@2x.png`,
    ...FUENTES.flatMap((f) =>
      RANGOS_LETRAS.map((r) => `https://tiles.openfreemap.org/fonts/${encodeURIComponent(f)}/${r}.pbf`)
    ),
  ];
  const rf = await descargarLista(cache, fijas, () => { }, senal);
  if (rf.errores > 0 && rf.ok === 0) throw new Error('No se pudo descargar el estilo del mapa.');

  // --- calles y edificios ---
  const urlsCalles: string[] = [];
  for (let z = 0; z <= 9; z++) {
    for (const [x, y] of mosaicosDeCaja(conMargen(caja, 1.5), z)) urlsCalles.push(urlMosaico(plantilla, z, x, y));
  }
  const mosaicosZ14 = mosaicosDeCaja(caja, ZOOM_CALLES_MAX);
  for (let z = 10; z <= ZOOM_CALLES_MAX; z++) {
    for (const [x, y] of mosaicosDeCaja(caja, z)) urlsCalles.push(urlMosaico(plantilla, z, x, y));
  }
  const rc = await descargarLista(
    cache, urlsCalles,
    (h, t) => onProgreso(3 + Math.round((h / t) * (finCalles - 3)), 'Descargando calles y edificios…'),
    senal
  );
  // Si falta más del 3% el mapa quedaría con huecos: no se marca como listo.
  if (rc.errores > urlsCalles.length * 0.03) {
    throw new Error(`Faltaron ${rc.errores} mosaicos del mapa; revisa tu conexión e inténtalo de nuevo.`);
  }

  // --- satélite ---
  let satelite: ZonaOffline['satelite'] = null;
  if (conSatelite) {
    const zoomMax = zoomSateliteParaCaja(caja);
    const urls = urlsSatelite(caja, zoomMax);
    const rs = await descargarLista(
      cache, urls,
      (h, t) => onProgreso(finCalles + Math.round((h / t) * (finSat - finCalles)), 'Descargando imágenes de satélite…'),
      senal
    );
    if (rs.errores > urls.length * 0.05) {
      throw new Error(`Faltaron ${rs.errores} imágenes de satélite; revisa tu conexión e inténtalo de nuevo.`);
    }
    satelite = { zoomMax, mosaicos: rs.ok };
  }

  // --- red de calles y senderos para rutas sin internet ---
  onProgreso(finSat, 'Preparando rutas y senderos sin internet…');
  const id = `z${Date.now().toString(36)}`;
  let grafo = false;
  try {
    const g = await construirGrafoDeMosaicos(
      cache,
      (x, y) => urlMosaico(plantilla, ZOOM_CALLES_MAX, x, y),
      mosaicosZ14,
      ZOOM_CALLES_MAX,
      (f) => onProgreso(finSat + Math.round(f * (99 - finSat)), 'Preparando rutas y senderos sin internet…')
    );
    if (g.aristas.length > 0) {
      const cg = await caches.open(CACHE_GRAFOS);
      await cg.put(urlGrafoZona(id), new Response(JSON.stringify(g), { headers: { 'Content-Type': 'application/json' } }));
      grafo = true;
    }
  } catch (e) {
    console.warn('[TuxtlasGO] No se pudo armar la red de rutas de la zona:', e);
  }

  const zona: ZonaOffline = {
    id, nombre, caja, fecha: Date.now(), snapshot,
    mosaicosCalles: rc.ok, satelite, grafo,
  };
  guardarZonas([...leerZonas(), zona]);
  onProgreso(100, 'Listo');
  return zona;
}

// Coordenadas z/x/y de una URL de mosaico (calles o satélite), o null
function mosaicoDeUrl(url: string): { z: number; x: number; y: number } | null {
  let m = url.match(/openfreemap\.org\/planet\/\d{8}_\d{6}_pt\/(\d+)\/(\d+)\/(\d+)\.pbf/);
  if (m) return { z: +m[1], x: +m[2], y: +m[3] };
  m = url.match(/mapbox\.satellite\/(\d+)\/(\d+)\/(\d+)@/);
  if (m) return { z: +m[1], x: +m[2], y: +m[3] };
  m = url.match(/World_Imagery\/MapServer\/tile\/(\d+)\/(\d+)\/(\d+)/); // z/y/x
  if (m) return { z: +m[1], y: +m[2], x: +m[3] };
  return null;
}

// Quita una zona y su red de rutas. Los mosaicos que otra zona descargada
// también cubre se conservan; el resto se borra para liberar el espacio.
export async function borrarZona(id: string): Promise<void> {
  const restantes = leerZonas().filter((z) => z.id !== id);
  guardarZonas(restantes);
  try { await (await caches.open(CACHE_GRAFOS)).delete(urlGrafoZona(id)); } catch { /* nada */ }
  try {
    const cache = await caches.open(CACHE_MAPA);
    for (const req of await cache.keys()) {
      const t = mosaicoDeUrl(req.url);
      if (!t) continue; // estilo, sprites y letras se quedan (ocupan poco)
      const lat = yToLat(t.y + 0.5, t.z), lng = xToLng(t.x + 0.5, t.z);
      const margen = t.z <= 9 ? 1.5 : 0.05;
      const loUsaOtra = restantes.some((z) => lng >= z.caja[0] - margen && lng <= z.caja[2] + margen &&
        lat >= z.caja[1] - margen && lat <= z.caja[3] + margen);
      if (!loUsaOtra) await cache.delete(req);
    }
  } catch { /* nada */ }
}

export async function borrarMapaOffline(): Promise<void> {
  try { await caches.delete(CACHE_MAPA); } catch { /* nada */ }
  try { await caches.delete(CACHE_GRAFOS); } catch { /* nada */ }
  try {
    localStorage.removeItem(CLAVE_ZONAS);
    localStorage.removeItem('mapa-offline-estado-v2');
    localStorage.removeItem('tiles-precargados');
  } catch { /* nada */ }
}
