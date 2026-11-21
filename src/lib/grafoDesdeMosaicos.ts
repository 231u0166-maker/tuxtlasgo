// ============================================================
// RED DE CALLES Y SENDEROS A PARTIR DE LOS MOSAICOS DEL MAPA
// ============================================================
// En vez de llevar la red vial de todo México dentro de la app (serían
// gigas), al descargar una zona el teléfono lee los mosaicos vectoriales z14
// que ya bajó (capa "transportation" de OpenFreeMap, datos de OpenStreetMap)
// y arma el grafo para calcular rutas sin internet — en auto y a pie, esto
// último incluyendo senderos, caminos peatonales y ciclovías.
//
// Detalle técnico: cada mosaico trae las líneas recortadas con un margen
// (buffer). Aquí cada tramo se recorta EXACTAMENTE al cuadro del mosaico, así
// no hay duplicados, y los puntos de corte de mosaicos vecinos coinciden (±1 m)
// y se unen por cercanía.
//
// Formato de salida = el mismo de public/grafo-vial.json:
//   aristas: [a, b, metros, kmh, sentido, forma]
//   kmh = velocidad estimada en auto; 0 = solo peatonal (sendero, andador)
//   sentido: 0 doble, 1 solo a→b, 2 solo b→a
// ============================================================

import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';

export interface GrafoSerializado {
  v: 1;
  nodos: [number, number][];
  aristas: [number, number, number, number, number, string][];
}

const E = 4096; // extensión de los mosaicos de OpenFreeMap
const KMH: Record<string, number> = {
  motorway: 90, trunk: 70, primary: 60, secondary: 50, tertiary: 40, minor: 25, service: 15, track: 15,
};
const TOL = 1.5; // unidades de 1e-5° (~1.6 m) para unir puntos de mosaicos vecinos
const CELDA = 2;

const rad = (g: number) => (g * Math.PI) / 180;
function metros(la1: number, ln1: number, la2: number, ln2: number): number {
  const h = Math.sin(rad(la2 - la1) / 2) ** 2 +
    Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(ln2 - ln1) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}

// Recorta el segmento al cuadrado [0,E]² (Liang–Barsky). null si queda fuera.
function recortar(x0: number, y0: number, x1: number, y1: number): [number, number, number, number] | null {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0, E - x0, y0, E - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

function codificar(pts: [number, number][]): string {
  let pl = 0, pn = 0, out = '';
  const num = (v: number) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    return s + String.fromCharCode(v + 63);
  };
  for (const [la, ln] of pts) { out += num(la - pl) + num(ln - pn); pl = la; pn = ln; }
  return out;
}

const cede = () => new Promise<void>((r) => setTimeout(r, 0));

// Los mosaicos de un archivo PMTiles vienen comprimidos con gzip
async function descomprimirSiGzip(b: Uint8Array): Promise<Uint8Array> {
  if (b.length > 2 && b[0] === 0x1f && b[1] === 0x8b) {
    const flujo = new Blob([b as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }
  return b;
}

// Variante para mosaicos guardados en Cache Storage (descarga por zona)
export function construirGrafoDeMosaicos(
  cache: Cache,
  urlDe: (x: number, y: number) => string,
  mosaicos: [number, number][],
  zoom: number,
  alAvanzar?: (fraccion: number) => void
): Promise<GrafoSerializado> {
  return construirGrafoDeLector(
    async (x, y) => {
      const resp = await cache.match(urlDe(x, y));
      return resp ? new Uint8Array(await resp.arrayBuffer()) : null;
    },
    mosaicos, zoom, alAvanzar
  );
}

// Núcleo: lee los mosaicos z14 con cualquier lector (Cache Storage en el
// teléfono, archivo PMTiles al preparar un paquete regional en el servidor).
export async function construirGrafoDeLector(
  leer: (x: number, y: number) => Promise<Uint8Array | null>,
  mosaicos: [number, number][],
  zoom: number,
  alAvanzar?: (fraccion: number) => void
): Promise<GrafoSerializado> {
  // ---- nodos con unión por cercanía ----
  const nLa: number[] = [];
  const nLn: number[] = [];
  const rejilla = new Map<number, number[]>();
  const clave = (cy: number, cx: number) => cy * 2e7 + (cx + 7e6);
  function nodo(la: number, ln: number): number {
    const cy = Math.floor(la / CELDA), cx = Math.floor(ln / CELDA);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = rejilla.get(clave(cy + dy, cx + dx));
        if (!c) continue;
        for (const i of c) if (Math.abs(nLa[i] - la) <= TOL && Math.abs(nLn[i] - ln) <= TOL) return i;
      }
    }
    const i = nLa.length;
    nLa.push(la); nLn.push(ln);
    const k = clave(cy, cx);
    const c = rejilla.get(k);
    if (c) c.push(i); else rejilla.set(k, [i]);
    return i;
  }

  // ---- segmentos ----
  const sa: number[] = [], sb: number[] = [], sk: number[] = [], sd: number[] = [];
  const vistos = new Set<number>();
  const n2 = 2 ** zoom;

  for (let m = 0; m < mosaicos.length; m++) {
    const [tx, ty] = mosaicos[m];
    const bytes = await leer(tx, ty);
    if (bytes && bytes.length > 0) {
      let capa;
      try {
        capa = new VectorTile(new Pbf(await descomprimirSiGzip(bytes))).layers.transportation;
      } catch { capa = undefined; }
      if (capa) {
        const aLngLat = (px: number, py: number): [number, number] => {
          const lng = ((tx + px / E) / n2) * 360 - 180;
          const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + py / E)) / n2))) * 180) / Math.PI;
          return [Math.round(lat * 1e5), Math.round(lng * 1e5)];
        };
        for (let i = 0; i < capa.length; i++) {
          const f = capa.feature(i);
          if (f.type !== 2) continue;
          const pr = f.properties as Record<string, string | number>;
          const cls = String(pr.class);
          let kmh = KMH[cls];
          if (kmh === undefined) {
            if ((cls === 'path' || cls === 'pedestrian') && pr.subclass !== 'platform') kmh = 0;
            else continue; // vías de tren, transbordador, solo autobús, etc.
          }
          const ow = Number(pr.oneway) || 0;
          const dir = kmh === 0 ? 0 : ow === 1 ? 1 : ow === -1 ? 2 : 0;
          for (const linea of f.loadGeometry()) {
            for (let k = 1; k < linea.length; k++) {
              const c = recortar(linea[k - 1].x, linea[k - 1].y, linea[k].x, linea[k].y);
              if (!c) continue;
              const [la0, ln0] = aLngLat(c[0], c[1]);
              const [la1, ln1] = aLngLat(c[2], c[3]);
              const a = nodo(la0, ln0), b = nodo(la1, ln1);
              if (a === b) continue;
              const par = a < b ? a * 1e7 + b : b * 1e7 + a;
              if (vistos.has(par)) continue;
              vistos.add(par);
              sa.push(a); sb.push(b); sk.push(kmh); sd.push(dir);
            }
          }
        }
      }
    }
    if (m % 8 === 7) { alAvanzar?.((m + 1) / mosaicos.length * 0.7); await cede(); }
  }

  // ---- adyacencia (CSR de incidencias) ----
  const nn = nLa.length, ns = sa.length;
  const deg = new Int32Array(nn + 1);
  for (let s = 0; s < ns; s++) { deg[sa[s]]++; deg[sb[s]]++; }
  const off = new Int32Array(nn + 1);
  for (let i = 0; i < nn; i++) off[i + 1] = off[i] + deg[i];
  const inc = new Int32Array(off[nn]);
  const pos = off.slice(0, nn);
  for (let s = 0; s < ns; s++) { inc[pos[sa[s]]++] = s; inc[pos[sb[s]]++] = s; }

  const otro = (s: number, n: number) => (sa[s] === n ? sb[s] : sa[s]);
  const dirDesde = (s: number, n: number) => (sa[s] === n ? sd[s] : sd[s] === 0 ? 0 : sd[s] === 1 ? 2 : 1);
  const vuelta = (d: number) => (d === 0 ? 0 : d === 1 ? 2 : 1);
  const mantener = (n: number): boolean => {
    if (deg[n] !== 2) return true;
    const s1 = inc[off[n]], s2 = inc[off[n] + 1];
    if (sk[s1] !== sk[s2]) return true;
    return vuelta(dirDesde(s1, n)) !== dirDesde(s2, n);
  };

  // ---- colapsar cadenas de nodos de grado 2 en aristas con forma ----
  type A = [number, number, number, number, number, string];
  const aristas: A[] = [];
  const usado = new Uint8Array(ns);
  for (let k = 0; k < nn; k++) {
    if (!mantener(k)) continue;
    for (let q = off[k]; q < off[k + 1]; q++) {
      let s = inc[q];
      if (usado[s]) continue;
      let cur = k, total = 0;
      const kmh = sk[s], dir0 = dirDesde(s, k);
      const interm: [number, number][] = [];
      let fin = -1;
      for (let guard = 0; guard < 100000; guard++) {
        usado[s] = 1;
        const nxt = otro(s, cur);
        total += metros(nLa[cur] / 1e5, nLn[cur] / 1e5, nLa[nxt] / 1e5, nLn[nxt] / 1e5);
        if (mantener(nxt)) { fin = nxt; break; }
        interm.push([nLa[nxt], nLn[nxt]]);
        const s2 = inc[off[nxt]] === s ? inc[off[nxt] + 1] : inc[off[nxt]];
        if (usado[s2]) break;
        cur = nxt; s = s2;
      }
      if (fin >= 0 && fin !== k) aristas.push([k, fin, Math.round(total), kmh, dir0, codificar(interm)]);
    }
  }

  // ---- quitar islas pequeñas (< 40 cruces) y reindexar ----
  const padre = new Int32Array(nn).map((_, i) => i);
  const raiz = (x: number): number => { while (padre[x] !== x) { padre[x] = padre[padre[x]]; x = padre[x]; } return x; };
  for (const [a, b] of aristas) padre[raiz(a)] = raiz(b);
  const tam = new Int32Array(nn);
  const usadoNodo = new Uint8Array(nn);
  for (const [a, b] of aristas) { usadoNodo[a] = usadoNodo[b] = 1; }
  for (let i = 0; i < nn; i++) if (usadoNodo[i]) tam[raiz(i)]++;
  const remap = new Int32Array(nn).fill(-1);
  const nodos: [number, number][] = [];
  const salida: A[] = [];
  for (const e of aristas) {
    if (tam[raiz(e[0])] < 40) continue;
    for (const idx of [0, 1] as const) {
      if (remap[e[idx]] === -1) { remap[e[idx]] = nodos.length; nodos.push([nLa[e[idx]], nLn[e[idx]]]); }
    }
    salida.push([remap[e[0]], remap[e[1]], e[2], e[3], e[4], e[5]]);
  }
  alAvanzar?.(1);
  return { v: 1, nodos, aristas: salida };
}
