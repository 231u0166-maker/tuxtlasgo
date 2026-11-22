// ============================================================
// PERFIL DE ELEVACIÓN DE UNA RUTA
// ============================================================
// Las alturas salen de los mosaicos "terrarium" públicos de AWS (datos SRTM,
// ~30 m de resolución): cada píxel codifica la altura en metros en sus canales
// R, G y B. Se pide un puñado de mosaicos (los que cubren la ruta) y se muestrea
// la altura cada cierta distancia.
//
// Sin internet solo se puede dibujar el perfil si esos mosaicos ya se guardaron:
// el service worker los conserva al verlos con internet (ver vite.config.ts) y las
// descargas de zona/ruta los incluyen (mapaOffline.ts). Si no hay, devuelve null
// y la pantalla simplemente no muestra la gráfica — nunca se inventa.
// ============================================================

import type { Coord } from './routing';

const BASE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
export const urlTerreno = (z: number, x: number, y: number) => `${BASE}/${z}/${x}/${y}.png`;

export interface PerfilElevacion {
  distancias: number[]; // metros desde el inicio
  alturas: number[]; // metros sobre el nivel del mar
  min: number;
  max: number;
  total: number; // metros totales de la ruta
}

const rad = (g: number) => (g * Math.PI) / 180;
function haversine(a: Coord, b: Coord): number {
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}

function aMosaico(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  const xf = ((lng + 180) / 360) * n;
  const yf = ((1 - Math.log(Math.tan(rad(lat)) + 1 / Math.cos(rad(lat))) / Math.PI) / 2) * n;
  const x = Math.floor(xf), y = Math.floor(yf);
  return { x, y, px: Math.min(255, Math.floor((xf - x) * 256)), py: Math.min(255, Math.floor((yf - y) * 256)) };
}

// Mosaicos ya decodificados en memoria (se descartan los más viejos)
const memoria = new Map<string, Uint8ClampedArray | null>();
function recordar(k: string, v: Uint8ClampedArray | null) {
  memoria.set(k, v);
  if (memoria.size > 48) memoria.delete(memoria.keys().next().value as string);
}

async function decodificar(resp: Response): Promise<Uint8ClampedArray | null> {
  try {
    const bmp = await createImageBitmap(await resp.blob());
    const lienzo: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
    const ctx = lienzo.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, 256, 256).data;
  } catch {
    return null;
  }
}

async function obtenerMosaico(z: number, x: number, y: number, soloCache: boolean): Promise<Uint8ClampedArray | null> {
  const clave = `${z}/${x}/${y}`;
  if (memoria.has(clave) && memoria.get(clave)) return memoria.get(clave)!;
  const url = urlTerreno(z, x, y);
  try {
    let resp: Response | undefined;
    if (soloCache) resp = await caches.match(url);
    else resp = await fetch(url);
    if (!resp || !resp.ok) return null;
    const datos = await decodificar(resp);
    if (datos) recordar(clave, datos);
    return datos;
  } catch {
    return null;
  }
}

const alturaDe = (d: Uint8ClampedArray, px: number, py: number) => {
  const i = (py * 256 + px) * 4;
  return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
};

// Zoom de partida según el largo de la ruta (más largo → mosaicos más grandes, menos descargas)
function zoomInicial(totalM: number): number {
  if (totalM < 8_000) return 13;
  if (totalM < 30_000) return 12;
  if (totalM < 120_000) return 11;
  return 10;
}

export async function perfilElevacion(geometria: Coord[], muestras = 56): Promise<PerfilElevacion | null> {
  if (geometria.length < 2) return null;
  // distancias acumuladas
  const acumulada = [0];
  for (let i = 1; i < geometria.length; i++) acumulada.push(acumulada[i - 1] + haversine(geometria[i - 1], geometria[i]));
  const total = acumulada[acumulada.length - 1];
  if (total < 20) return null;

  // puntos de muestreo repartidos por distancia
  const puntos: { lat: number; lng: number; d: number }[] = [];
  let seg = 0;
  for (let k = 0; k < muestras; k++) {
    const d = (total * k) / (muestras - 1);
    while (seg < acumulada.length - 2 && acumulada[seg + 1] < d) seg++;
    const span = acumulada[seg + 1] - acumulada[seg] || 1;
    const t = Math.min(1, Math.max(0, (d - acumulada[seg]) / span));
    puntos.push({
      lat: geometria[seg][0] + (geometria[seg + 1][0] - geometria[seg][0]) * t,
      lng: geometria[seg][1] + (geometria[seg + 1][1] - geometria[seg][1]) * t,
      d,
    });
  }

  const soloCache = typeof navigator !== 'undefined' && navigator.onLine === false;
  const z0 = zoomInicial(total);
  // Con internet se usa el zoom de partida; sin internet se busca el que esté guardado
  const candidatos = soloCache
    ? [z0, z0 + 1, z0 + 2, z0 + 3, z0 - 1, z0 - 2, z0 - 3].filter((z) => z >= 8 && z <= 14)
    : [z0];

  for (const z of candidatos) {
    const necesarios = new Map<string, { x: number; y: number }>();
    const info = puntos.map((p) => {
      const m = aMosaico(p.lat, p.lng, z);
      necesarios.set(`${m.x}/${m.y}`, { x: m.x, y: m.y });
      return m;
    });
    if (necesarios.size > 24) continue; // demasiados mosaicos para este zoom
    const mosaicos = new Map<string, Uint8ClampedArray>();
    let completo = true;
    for (const [k, { x, y }] of necesarios) {
      const d = await obtenerMosaico(z, x, y, soloCache);
      if (!d) { completo = false; break; }
      mosaicos.set(k, d);
    }
    if (!completo) continue;

    const crudas = info.map((m) => alturaDe(mosaicos.get(`${m.x}/${m.y}`)!, m.px, m.py));
    // suavizado ligero (promedio móvil de 5) para quitar el ruido del píxel
    const alturas = crudas.map((_, i) => {
      let s = 0, n = 0;
      for (let j = Math.max(0, i - 2); j <= Math.min(crudas.length - 1, i + 2); j++) { s += crudas[j]; n++; }
      return s / n;
    });
    return {
      distancias: puntos.map((p) => p.d),
      alturas,
      min: Math.min(...alturas),
      max: Math.max(...alturas),
      total,
    };
  }
  return null;
}
