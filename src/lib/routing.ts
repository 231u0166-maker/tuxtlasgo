// ============================================================
// ROUTING POR CARRETERA — con caché offline
// ============================================================
// Calcula rutas que siguen carreteras reales (no líneas rectas)
// usando OSRM público (router.project-osrm.org). Es gratuito,
// no requiere API key, y devuelve la geometría completa de la
// ruta como lista de coordenadas (polyline).
//
// La pieza clave es el caché: cada ruta calculada se guarda en
// IndexedDB, así que la próxima vez está disponible offline.
// Esto encaja con la filosofía del proyecto: armas la ruta con
// internet en casa, la usas sin señal en la sierra.
// ============================================================

import { db } from './db';
import { rutaPorCallesOffline, rutasAlternativasOffline, precargarGrafoVial, type ModoRuta } from './rutasOffline';

export type { ModoRuta };

// Con internet, el grafo de calles local se baja en segundo plano para que
// ya esté guardado cuando se pierda la señal.
if (typeof window !== 'undefined') {
  window.setTimeout(precargarGrafoVial, 4000);
}

// Coordenada en formato Leaflet: [latitud, longitud]
export type Coord = [number, number];

// Resultado de un cálculo de ruta entre N puntos
export interface RutaCalculada {
  // Geometría: lista de coordenadas que dibuja la ruta sobre el mapa
  geometria: Coord[];
  // Distancia total en metros
  distanciaMetros: number;
  // Duración total estimada en segundos (en carro)
  duracionSegundos: number;
  // Si vino del caché (offline) o se acaba de calcular
  desdeCache: boolean;
  // De dónde salió el trazado:
  //  'osrm'    → servidor en línea (calles reales)
  //  'cache'   → una ruta ya calculada antes (calles reales)
  //  'offline' → calculada en el teléfono con las calles guardadas
  //  'recta'   → NO hay ruta por calles: es solo una línea recta aproximada
  fuente: 'osrm' | 'cache' | 'offline' | 'recta';
}

// Genera una clave única para el caché basada en los puntos.
// Redondeamos a 4 decimales (~10 metros de precisión) para que
// pequeñas variaciones no rompan el cache.
function claveCache(puntos: Coord[], modo: ModoRuta = 'auto'): string {
  return (modo === 'pie' ? 'pie:' : '') + puntos
    .map(([lat, lng]) => `${lat.toFixed(4)},${lng.toFixed(4)}`)
    .join('|');
}

// Decodifica la geometría que devuelve OSRM (polyline5: precisión 1e-5)
// a una lista de coordenadas [lat, lng]. Implementación estándar del
// algoritmo "encoded polyline" de Google, usado también por OSRM.
function decodificarPolyline(encoded: string, precision = 5): Coord[] {
  const factor = Math.pow(10, precision);
  const coords: Coord[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coords.push([lat / factor, lng / factor]);
  }

  return coords;
}

// Endpoints públicos de OSRM, en orden de preferencia. Si el primero
// falla (p.ej. está caído, throttled, o bloqueado por red corporativa),
// se intenta el siguiente. Todos son gratuitos y no requieren API key.
const ENDPOINTS_OSRM: Record<ModoRuta, { base: string; perfil: string }[]> = {
  auto: [
    { base: 'https://router.project-osrm.org', perfil: 'driving' },
    { base: 'https://routing.openstreetmap.de/routed-car', perfil: 'driving' },
  ],
  pie: [{ base: 'https://routing.openstreetmap.de/routed-foot', perfil: 'driving' }],
};

// Llama a OSRM para calcular la ruta en carro siguiendo las carreteras.
// Intenta los endpoints en orden hasta que alguno responda.
async function llamarOsrm(puntos: Coord[], modo: ModoRuta): Promise<RutaCalculada> {
  // OSRM recibe los puntos como lng,lat (al revés de Leaflet)
  const coordsStr = puntos.map(([lat, lng]) => `${lng},${lat}`).join(';');
  let ultimoError: unknown = null;

  for (const { base, perfil } of ENDPOINTS_OSRM[modo]) {
    const url = `${base}/route/v1/${perfil}/${coordsStr}?overview=full&geometries=polyline`;
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) {
        ultimoError = new Error(`${base} respondió ${resp.status}`);
        continue;
      }
      const data = await resp.json();
      if (data.code !== 'Ok' || !data.routes?.length) {
        ultimoError = new Error(`${base} no encontró ruta: ${data.code}`);
        continue;
      }
      const ruta = data.routes[0];
      return {
        geometria: decodificarPolyline(ruta.geometry),
        distanciaMetros: ruta.distance,
        duracionSegundos: ruta.duration,
        desdeCache: false,
        fuente: 'osrm',
      };
    } catch (e) {
      ultimoError = e;
      // continúa al siguiente endpoint
    }
  }
  throw ultimoError ?? new Error('Ningún endpoint de OSRM respondió');
}

// Rutas alternas ("atajos") entre dos puntos, además de la principal.
export interface RutaAlternativa {
  geometria: Coord[];
  distanciaMetros: number;
  duracionSegundos: number;
}
export async function obtenerAlternativas(puntos: Coord[], modo: ModoRuta = 'auto'): Promise<RutaAlternativa[]> {
  if (puntos.length !== 2) return [];
  // Con internet: OSRM entrega alternas reales de su red completa
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    const coordsStr = puntos.map(([lat, lng]) => `${lng},${lat}`).join(';');
    for (const { base, perfil } of ENDPOINTS_OSRM[modo]) {
      try {
        const resp = await fetch(`${base}/route/v1/${perfil}/${coordsStr}?overview=full&geometries=polyline&alternatives=true`, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) continue;
        const data = await resp.json();
        if (data.code !== 'Ok' || !data.routes?.length) continue;
        return (data.routes as { geometry: string; distance: number; duration: number }[])
          .slice(1, 3)
          .map((r) => ({ geometria: decodificarPolyline(r.geometry), distanciaMetros: r.distance, duracionSegundos: r.duration }));
      } catch { /* prueba el siguiente servidor */ }
    }
  }
  // Sin internet (o sin respuesta): con las calles guardadas en el teléfono
  try {
    return await rutasAlternativasOffline(puntos[0], puntos[1], modo, 2);
  } catch {
    return [];
  }
}

// Función principal: pide la ruta entre N puntos siguiendo carreteras.
// Primero busca en el caché local; si no está y hay internet, llama a
// OSRM y guarda el resultado. Si no hay internet ni caché, lanza error.
export async function obtenerRutaPorCarretera(
  puntos: Coord[],
  modo: ModoRuta = 'auto'
): Promise<RutaCalculada> {
  if (puntos.length < 2) {
    throw new Error('Se necesitan al menos 2 puntos para calcular ruta');
  }

  const clave = claveCache(puntos, modo);

  // 1. Intentar caché primero
  try {
    const cacheado = await db.rutasCache.get(clave);
    if (cacheado) {
      return {
        geometria: cacheado.geometria,
        distanciaMetros: cacheado.distanciaMetros,
        duracionSegundos: cacheado.duracionSegundos,
        desdeCache: true,
        fuente: 'cache',
      };
    }
  } catch {
    // si Dexie falla por alguna razón, seguimos al cálculo en línea
  }

  // 2. Sin caché: OSRM si hay conexión; si no hay (o falla), el enrutador
  // local sobre las calles guardadas en el teléfono (solo puntos A→B).
  let resultado: RutaCalculada;
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('Sin conexión');
    }
    resultado = await llamarOsrm(puntos, modo);
  } catch (errRed) {
    if (puntos.length === 2) {
      const local = await rutaPorCallesOffline(puntos[0], puntos[1], modo).catch(() => null);
      if (local) {
        return {
          geometria: local.geometria,
          distanciaMetros: local.distanciaMetros,
          duracionSegundos: local.duracionSegundos,
          desdeCache: false,
          fuente: 'offline',
        };
      }
    }
    throw errRed;
  }

  // 3. Guardar en caché para uso offline futuro
  try {
    await db.rutasCache.put({
      clave,
      geometria: resultado.geometria,
      distanciaMetros: resultado.distanciaMetros,
      duracionSegundos: resultado.duracionSegundos,
      calculadaEn: Date.now(),
    });
  } catch {
    // si no se puede guardar, no es crítico — la ruta se devuelve igual
  }

  return resultado;
}

// Resultado de calcular una ruta de varias paradas TRAMO por TRAMO
// (en vez de un solo trazo continuo) — cada tramo es el trayecto
// entre una parada y la siguiente. Se usa para poder pintar cada
// tramo de un color distinto en el mapa (ver src/lib/colores.ts),
// en vez de una sola línea verde de punta a punta.
export interface RutaPorTramos {
  tramos: RutaCalculada[];
  // true si algún tramo no pudo calcularse por calles (queda en línea recta)
  hayTramosRectos: boolean;
  distanciaTotalMetros: number;
  duracionTotalSegundos: number;
}

// Distancia en línea recta (fórmula haversine) — solo se usa como
// respaldo para UN tramo puntual cuando OSRM no responde para ese
// tramo en particular (sin internet y sin caché para ese segmento),
// sin tumbar los demás tramos que sí se pudieron calcular.
export function distanciaHaversine(a: Coord, b: Coord): number {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Calcula la ruta de N puntos como N-1 tramos independientes (parada
// 1→2, 2→3, ...), cada uno con su propia geometría — en vez de un
// solo overview=full continuo donde se pierde la frontera entre
// tramos. Reusa obtenerRutaPorCarretera por cada par consecutivo, así
// que el caché offline sigue funcionando igual (incluso se comparte
// entre rutas distintas que tengan un tramo en común).
//
// Si un tramo puntual falla (sin internet y sin caché SOLO para ese
// segmento), cae a línea recta silenciosa PARA ESE TRAMO nada más —
// los demás tramos que sí se calcularon se quedan con su trazado real
// por carretera, en vez de tirar toda la ruta a líneas rectas.
export async function obtenerRutaPorTramos(
  puntos: Coord[],
  modo: ModoRuta = 'auto'
): Promise<RutaPorTramos> {
  if (puntos.length < 2) {
    throw new Error('Se necesitan al menos 2 puntos para calcular ruta');
  }

  const tramos = await Promise.all(
    Array.from({ length: puntos.length - 1 }, async (_, i) => {
      const a = puntos[i];
      const b = puntos[i + 1];
      try {
        return await obtenerRutaPorCarretera([a, b], modo);
      } catch {
        return {
          geometria: [a, b],
          distanciaMetros: distanciaHaversine(a, b),
          duracionSegundos: 0,
          desdeCache: false,
          fuente: 'recta',
        } as RutaCalculada;
      }
    })
  );

  return {
    tramos,
    hayTramosRectos: tramos.some((t) => t.fuente === 'recta'),
    distanciaTotalMetros: tramos.reduce((s, t) => s + t.distanciaMetros, 0),
    duracionTotalSegundos: tramos.reduce((s, t) => s + t.duracionSegundos, 0),
  };
}

// Indica si una ruta ya está disponible offline (en caché). Útil para
// mostrar un indicador en la UI tipo "ruta guardada para offline".
export async function rutaEnCache(puntos: Coord[]): Promise<boolean> {
  if (puntos.length < 2) return false;
  try {
    const c = await db.rutasCache.get(claveCache(puntos));
    return !!c;
  } catch {
    return false;
  }
}

// Formatea la duración (segundos) en algo legible: "1 h 25 min" o "20 min"
export interface UbicacionGPS {
  coord: Coord;
  precisionMetros: number;
}

// Envuelve navigator.geolocation.getCurrentPosition en una Promise —
// pura, SIN efectos secundarios de UI (eso lo maneja quien la llama:
// AppShell.tsx actualiza su punto azul en el mapa; ChatAssistant.tsx
// la usa para responder "cuánto tiempo me tomaría llegar"). Antes esta
// lógica vivía duplicada solo dentro de AppShell.tsx — se extrae aquí
// para que el chat también pueda usarla, con el mismo diagnóstico de
// permisos/HTTPS en un solo lugar.
// Motivo del último fallo del GPS, para decirle al usuario QUÉ pasó:
//  'denegado' → bloqueó el permiso (hay que activarlo en el navegador);
//  'sin-https' → la página no es https/localhost, el navegador lo bloquea siempre;
//  'no-disponible' / 'tiempo' → el dispositivo no pudo fijar la posición (típico en PC sin GPS).
export type ErrorGPS = 'denegado' | 'sin-https' | 'no-disponible' | 'tiempo' | 'sin-soporte';
export let ultimoErrorGPS: ErrorGPS | null = null;

function pedirPosicion(opciones: PositionOptions): Promise<GeolocationPosition | GeolocationPositionError> {
  return new Promise((res) => navigator.geolocation.getCurrentPosition(res, res, opciones));
}

export async function obtenerUbicacionGPS(): Promise<UbicacionGPS | null> {
  ultimoErrorGPS = null;
  if (!navigator.geolocation) {
    console.warn('[TuxtlasGO] navigator.geolocation no existe en este navegador.');
    ultimoErrorGPS = 'sin-soporte';
    return null;
  }
  // Diagnóstico: si el origen no es https ni localhost, el GPS se
  // bloquea SIEMPRE por regla del navegador (no es un bug) — esto se
  // ve seguido al probar desde una IP local (ej. http://192.168.x.x:5173)
  // en vez de la URL https desplegada.
  const origenSeguro = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  if (!origenSeguro) {
    console.warn(
      `[TuxtlasGO] GPS bloqueado: estás en "${window.location.origin}" — el navegador solo permite geolocalización en https:// o localhost.`
    );
  }
  // 1.er intento: GPS preciso (celular). Si no logra fijar la posición (en PC no hay GPS y
  // la alta precisión suele fallar o tardar), 2.º intento con la ubicación aproximada del
  // sistema (Wi-Fi/red), más lenta de caducar. Si el permiso está denegado no se reintenta.
  let r = await pedirPosicion({ timeout: 8000, enableHighAccuracy: true, maximumAge: 0 });
  if ('code' in r && r.code !== 1) {
    console.warn(`[TuxtlasGO] GPS preciso falló (código ${r.code}); se reintenta con ubicación aproximada.`);
    r = await pedirPosicion({ timeout: 15000, enableHighAccuracy: false, maximumAge: 300000 });
  }
  if ('code' in r) {
    console.warn(`[TuxtlasGO] No se pudo obtener el GPS — código ${r.code}: ${r.message}`);
    ultimoErrorGPS = !origenSeguro ? 'sin-https' : r.code === 1 ? 'denegado' : r.code === 3 ? 'tiempo' : 'no-disponible';
    return null;
  }
  return { coord: [r.coords.latitude, r.coords.longitude], precisionMetros: r.coords.accuracy };
}

export function formatearDuracion(segundos: number): string {
  const totalMin = Math.round(segundos / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

// Formatea distancia en km
export function formatearDistancia(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(1)} km`;
}
