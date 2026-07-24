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
}

// Genera una clave única para el caché basada en los puntos.
// Redondeamos a 4 decimales (~10 metros de precisión) para que
// pequeñas variaciones no rompan el cache.
function claveCache(puntos: Coord[]): string {
  return puntos
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
const ENDPOINTS_OSRM = [
  'https://router.project-osrm.org',
  'https://routing.openstreetmap.de/routed-car',
];

// Llama a OSRM para calcular la ruta en carro siguiendo las carreteras.
// Intenta los endpoints en orden hasta que alguno responda.
async function llamarOsrm(puntos: Coord[]): Promise<RutaCalculada> {
  // OSRM recibe los puntos como lng,lat (al revés de Leaflet)
  const coordsStr = puntos.map(([lat, lng]) => `${lng},${lat}`).join(';');
  let ultimoError: unknown = null;

  for (const base of ENDPOINTS_OSRM) {
    const url = `${base}/route/v1/driving/${coordsStr}?overview=full&geometries=polyline`;
    try {
      const resp = await fetch(url);
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
      };
    } catch (e) {
      ultimoError = e;
      // continúa al siguiente endpoint
    }
  }
  throw ultimoError ?? new Error('Ningún endpoint de OSRM respondió');
}

// Función principal: pide la ruta entre N puntos siguiendo carreteras.
// Primero busca en el caché local; si no está y hay internet, llama a
// OSRM y guarda el resultado. Si no hay internet ni caché, lanza error.
export async function obtenerRutaPorCarretera(
  puntos: Coord[]
): Promise<RutaCalculada> {
  if (puntos.length < 2) {
    throw new Error('Se necesitan al menos 2 puntos para calcular ruta');
  }

  const clave = claveCache(puntos);

  // 1. Intentar caché primero
  try {
    const cacheado = await db.rutasCache.get(clave);
    if (cacheado) {
      return {
        geometria: cacheado.geometria,
        distanciaMetros: cacheado.distanciaMetros,
        duracionSegundos: cacheado.duracionSegundos,
        desdeCache: true,
      };
    }
  } catch {
    // si Dexie falla por alguna razón, seguimos al cálculo en línea
  }

  // 2. Si no hay caché, llamar a OSRM
  const resultado = await llamarOsrm(puntos);

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
  distanciaTotalMetros: number;
  duracionTotalSegundos: number;
}

// Distancia en línea recta (fórmula haversine) — solo se usa como
// respaldo para UN tramo puntual cuando OSRM no responde para ese
// tramo en particular (sin internet y sin caché para ese segmento),
// sin tumbar los demás tramos que sí se pudieron calcular.
function distanciaHaversine(a: Coord, b: Coord): number {
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
  puntos: Coord[]
): Promise<RutaPorTramos> {
  if (puntos.length < 2) {
    throw new Error('Se necesitan al menos 2 puntos para calcular ruta');
  }

  const tramos = await Promise.all(
    Array.from({ length: puntos.length - 1 }, async (_, i) => {
      const a = puntos[i];
      const b = puntos[i + 1];
      try {
        return await obtenerRutaPorCarretera([a, b]);
      } catch {
        return {
          geometria: [a, b],
          distanciaMetros: distanciaHaversine(a, b),
          duracionSegundos: 0,
          desdeCache: false,
        } as RutaCalculada;
      }
    })
  );

  return {
    tramos,
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
