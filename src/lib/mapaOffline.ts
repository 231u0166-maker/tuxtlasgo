// ============================================================
// MAPAS OFFLINE — descarga de calles y satélite al teléfono
// ============================================================
// Todo se guarda en Cache Storage ('mapa-offline-v1'), el MISMO caché desde
// el que el service worker sirve estas URLs (ver runtimeCaching en
// vite.config.ts). Sin expiración: lo descargado no se borra solo.
//
//  · Calles (OpenFreeMap): estilo, sprites, tipos de letra y TODOS los
//    mosaicos vectoriales de la región hasta z14 (el máximo real de la
//    fuente; más cerca solo se amplía el z14, así que no falta nada).
//  · Satélite: vista general de la región (z8–13) + detalle (z14–16) de la
//    zona que el turista elija (como "descargar zona" de AllTrails). Un
//    mosaico que no se descargó se ve en blanco sin internet, por eso el
//    mapa limita el acercamiento al nivel realmente guardado.
// ============================================================

import { LOS_TUXTLAS_BOUNDS } from '../data/lugares';

export const CACHE_MAPA = 'mapa-offline-v1';
export const ESTILO_MAPA_URL = 'https://tiles.openfreemap.org/styles/liberty';
const MANIFIESTO = 'https://tiles.openfreemap.org/planet';
const SPRITE_BASE = 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm';
const FUENTES = ['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic'];
const RANGOS_LETRAS = ['0-255', '256-511', '8192-8447']; // latín, latín ext., puntuación (— “ ”)
const ZOOM_CALLES_MAX = 14;

export const TOKEN_MAPBOX = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined)?.trim();
export const PLANTILLA_SATELITE = TOKEN_MAPBOX
  ? `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${TOKEN_MAPBOX}`
  : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
// Zoom más fino que se descarga (la fuente llega a 17 con Mapbox, 15 con Esri)
export const ZOOM_SATELITE_DESCARGA = TOKEN_MAPBOX ? 16 : 15;
const KB_POR_MOSAICO_SAT = TOKEN_MAPBOX ? 75 : 28;
const MAX_MOSAICOS_DETALLE_SAT = 700;

export type Caja = [number, number, number, number]; // [oeste, sur, este, norte]
export type Progreso = (porcentaje: number, etapa: string) => void;

// ---------- estado guardado (para mostrarlo en la interfaz) ----------
export interface EstadoOffline {
  calles?: { fecha: number; mosaicos: number; snapshot: string | null };
  satelite?: { fecha: number; mosaicos: number; zoomMax: number; cajas: Caja[] };
}
const CLAVE_ESTADO = 'mapa-offline-estado-v2';

export function leerEstadoOffline(): EstadoOffline {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_ESTADO) || '{}');
  } catch {
    return {};
  }
}
function guardarEstado(e: EstadoOffline) {
  try { localStorage.setItem(CLAVE_ESTADO, JSON.stringify(e)); } catch { /* sin localStorage */ }
}

// El snapshot de OpenFreeMap (carpeta con fecha) cambia cada pocos días. Sin
// internet, el mapa pediría el snapshot que le quedó en caché, que puede no
// ser el de la descarga: MapLibre lo reescribe con esta función.
export function ajustarUrlSinConexion(url: string): string {
  if (typeof navigator === 'undefined' || navigator.onLine) return url;
  const snap = leerEstadoOffline().calles?.snapshot;
  if (!snap) return url;
  return url.replace(/(tiles\.openfreemap\.org\/planet\/)\d{8}_\d{6}_pt\//, `$1${snap}/`);
}

// ---------- matemática de mosaicos ----------
const lngToX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
const latToY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

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

const cajaRegion = (margen: number): Caja => {
  const [[s, w], [n, e]] = LOS_TUXTLAS_BOUNDS;
  return [w - margen, s - margen, e + margen, n + margen];
};

const urlMosaico = (plantilla: string, z: number, x: number, y: number) =>
  plantilla.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

// ---------- descarga con reintentos ----------
async function guardarUrl(cache: Cache, url: string, senal?: AbortSignal): Promise<'ok' | 'ya' | 'error'> {
  if (await cache.match(url)) return 'ya';
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
  let ok = 0;
  let errores = 0;
  let hechas = 0;
  let cursor = 0;
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

function comprobarEspacio() {
  if (typeof caches === 'undefined') {
    throw new Error('Este navegador no permite guardar mapas sin conexión.');
  }
}

async function pedirAlmacenamientoPersistente() {
  // Evita que el navegador borre el mapa "por falta de espacio" más adelante.
  try { await navigator.storage?.persist?.(); } catch { /* opcional */ }
}

// ---------- CALLES ----------
export function estimarCalles(): { mosaicos: number; mb: number } {
  let n = 0;
  for (let z = 0; z <= 9; z++) n += mosaicosDeCaja(cajaRegion(1.5), z).length;
  for (let z = 10; z <= ZOOM_CALLES_MAX; z++) n += mosaicosDeCaja(cajaRegion(0.05), z).length;
  return { mosaicos: n, mb: Math.round(n * 0.03 + 1) }; // ~30 KB por mosaico en promedio
}

export async function descargarCalles(onProgreso: Progreso, senal?: AbortSignal): Promise<void> {
  comprobarEspacio();
  await pedirAlmacenamientoPersistente();
  const cache = await caches.open(CACHE_MAPA);

  onProgreso(2, 'Preparando…');
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
  onProgreso(6, 'Descargando calles y edificios…');

  const urls: string[] = [];
  for (let z = 0; z <= 9; z++) {
    for (const [x, y] of mosaicosDeCaja(cajaRegion(1.5), z)) urls.push(urlMosaico(plantilla, z, x, y));
  }
  for (let z = 10; z <= ZOOM_CALLES_MAX; z++) {
    for (const [x, y] of mosaicosDeCaja(cajaRegion(0.05), z)) urls.push(urlMosaico(plantilla, z, x, y));
  }
  const r = await descargarLista(
    cache, urls,
    (h, t) => onProgreso(6 + Math.round((h / t) * 90), 'Descargando calles y edificios…'),
    senal
  );
  // Si falta más del 3% el mapa quedaría con huecos: no se marca como listo.
  if (r.errores > urls.length * 0.03) {
    throw new Error(`Faltaron ${r.errores} mosaicos; revisa tu conexión e inténtalo de nuevo.`);
  }

  // También el enrutador sin internet
  try { await fetch('/grafo-vial.json'); } catch { /* ya se reintenta al calcular rutas */ }

  onProgreso(100, 'Listo');
  guardarEstado({
    ...leerEstadoOffline(),
    calles: { fecha: Date.now(), mosaicos: r.ok, snapshot },
  });
}

// ---------- SATÉLITE ----------
function urlsSatelite(zona: Caja, zoomDetalle: number): string[] {
  const urls: string[] = [];
  for (let z = 8; z <= 13; z++) {
    for (const [x, y] of mosaicosDeCaja(cajaRegion(0.05), z)) urls.push(urlMosaico(PLANTILLA_SATELITE, z, x, y));
  }
  for (let z = 14; z <= zoomDetalle; z++) {
    for (const [x, y] of mosaicosDeCaja(zona, z)) urls.push(urlMosaico(PLANTILLA_SATELITE, z, x, y));
  }
  return urls;
}

// Elige el zoom de detalle más fino que cabe dentro del tope de mosaicos
export function planearSatelite(zona: Caja): { zoomMax: number; mosaicos: number; mb: number } {
  let zoomMax = ZOOM_SATELITE_DESCARGA;
  const detalle = (zm: number) => {
    let n = 0;
    for (let z = 14; z <= zm; z++) n += mosaicosDeCaja(zona, z).length;
    return n;
  };
  while (zoomMax > 13 && detalle(zoomMax) > MAX_MOSAICOS_DETALLE_SAT) zoomMax--;
  const total = urlsSatelite(zona, zoomMax).length;
  return { zoomMax, mosaicos: total, mb: Math.round((total * KB_POR_MOSAICO_SAT) / 1024) };
}

export async function descargarSatelite(zona: Caja, onProgreso: Progreso, senal?: AbortSignal): Promise<void> {
  comprobarEspacio();
  await pedirAlmacenamientoPersistente();
  const cache = await caches.open(CACHE_MAPA);
  const { zoomMax } = planearSatelite(zona);
  const urls = urlsSatelite(zona, zoomMax);
  onProgreso(2, 'Descargando imágenes de satélite…');
  const r = await descargarLista(
    cache, urls,
    (h, t) => onProgreso(2 + Math.round((h / t) * 97), 'Descargando imágenes de satélite…'),
    senal
  );
  if (r.errores > urls.length * 0.05) {
    throw new Error(`Faltaron ${r.errores} imágenes; revisa tu conexión e inténtalo de nuevo.`);
  }
  const previo = leerEstadoOffline().satelite;
  onProgreso(100, 'Listo');
  guardarEstado({
    ...leerEstadoOffline(),
    satelite: {
      fecha: Date.now(),
      mosaicos: (previo?.mosaicos ?? 0) + r.ok,
      zoomMax: Math.max(previo?.zoomMax ?? 0, zoomMax),
      cajas: [...(previo?.cajas ?? []), zona].slice(-12),
    },
  });
}

// Borra todo lo descargado (para liberar espacio)
export async function borrarMapaOffline(): Promise<void> {
  try { await caches.delete(CACHE_MAPA); } catch { /* nada */ }
  try { localStorage.removeItem(CLAVE_ESTADO); localStorage.removeItem('tiles-precargados'); } catch { /* nada */ }
}
