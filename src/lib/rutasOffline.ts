// ============================================================
// RUTAS SIN INTERNET — enrutador propio sobre calles de OpenStreetMap
// ============================================================
// OSRM necesita internet. Para que "Ir a este sitio" y las rutas del
// asistente funcionen sin señal, la app lleva la red de calles de Los
// Tuxtlas (public/grafo-vial.json, generado con
// scripts/construir-grafo-vial.mjs) y calcula la ruta más rápida en el
// propio teléfono (Dijkstra/A* sobre ese grafo). El archivo se baja una
// vez y queda en el caché del service worker.
//
// Límite honesto: solo cubre la región del grafo. Fuera de ella (o si el
// archivo nunca se alcanzó a bajar) no hay ruta por calles y quien llama
// decide qué mostrar — nunca se inventa una ruta.
// ============================================================

import type { Coord } from './routing';

export type ModoRuta = 'auto' | 'pie';

// Aristas dirigidas en formato CSR: las de nodo u van de ini[u] a ini[u+1]
interface Csr {
  ini: Int32Array;
  dest: Int32Array;
  metros: Float32Array;
  seg: Float32Array; // segundos de recorrido
  forma: (string | undefined)[]; // polyline de puntos intermedios
  formaInversa: boolean[]; // la forma está guardada de b→a (hay que invertirla)
}
interface Grafo {
  n: number;
  lat: Float32Array;
  lng: Float32Array;
  csr: Record<ModoRuta, Csr>;
  // Índice espacial: casillas de 0.01° → nodos
  celdas: Map<number, number[]>;
}
type Arista = [number, number, number, number, number, string];
const VEL_PIE = 5 / 3.6; // m/s

function construirCsr(n: number, aristas: Arista[], modo: ModoRuta): Csr {
  // Auto: respeta sentidos únicos. A pie: todo en ambos sentidos, sin autopistas.
  const usable = (kmh: number) => modo === 'auto' || kmh < 90;
  const sentido = (dir: number) => (modo === 'pie' ? 0 : dir);
  const grado = new Int32Array(n + 1);
  for (const [a, b, , kmh, dir] of aristas) {
    if (!usable(kmh)) continue;
    const d = sentido(dir);
    if (d !== 2) grado[a]++;
    if (d !== 1) grado[b]++;
  }
  const ini = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) ini[i + 1] = ini[i] + grado[i];
  const total = ini[n];
  const dest = new Int32Array(total);
  const metros = new Float32Array(total);
  const seg = new Float32Array(total);
  const forma: (string | undefined)[] = new Array(total);
  const formaInversa: boolean[] = new Array(total).fill(false);
  const pos = ini.slice(0, n);
  for (const [a, b, m, kmh, dir, f] of aristas) {
    if (!usable(kmh)) continue;
    const d = sentido(dir);
    const s = modo === 'pie' ? m / VEL_PIE : m / (kmh / 3.6);
    if (d !== 2) {
      const p = pos[a]++;
      dest[p] = b; metros[p] = m; seg[p] = s; forma[p] = f || undefined;
    }
    if (d !== 1) {
      const p = pos[b]++;
      dest[p] = a; metros[p] = m; seg[p] = s; forma[p] = f || undefined; formaInversa[p] = true;
    }
  }
  return { ini, dest, metros, seg, forma, formaInversa };
}

const URL_GRAFO = '/grafo-vial.json';
const CELDA = 0.01;
const MAX_SNAP_M = 3500; // más lejos que esto de una calle → fuera de cobertura

let promesaGrafo: Promise<Grafo | null> | null = null;

const claveCelda = (lat: number, lng: number) =>
  Math.floor(lat / CELDA) * 100000 + Math.floor(lng / CELDA);

function decodificar(enc: string): Coord[] {
  const out: Coord[] = [];
  let i = 0, la = 0, ln = 0;
  while (i < enc.length) {
    for (let k = 0; k < 2; k++) {
      let b, sh = 0, r = 0;
      do { b = enc.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
      const d = r & 1 ? ~(r >> 1) : r >> 1;
      if (k === 0) la += d; else ln += d;
    }
    out.push([la / 1e5, ln / 1e5]);
  }
  return out;
}

async function construirGrafo(): Promise<Grafo | null> {
  let datos: { nodos: [number, number][]; aristas: [number, number, number, number, number, string][] };
  try {
    const r = await fetch(URL_GRAFO);
    if (!r.ok) return null;
    datos = await r.json();
  } catch {
    return null;
  }
  const n = datos.nodos.length;
  const lat = new Float32Array(n);
  const lng = new Float32Array(n);
  const celdas = new Map<number, number[]>();
  datos.nodos.forEach(([a, b], i) => {
    lat[i] = a / 1e5;
    lng[i] = b / 1e5;
    const k = claveCelda(lat[i], lng[i]);
    const c = celdas.get(k);
    if (c) c.push(i); else celdas.set(k, [i]);
  });

  const aristas = datos.aristas as Arista[];
  const csr = { auto: construirCsr(n, aristas, 'auto'), pie: construirCsr(n, aristas, 'pie') };
  return { n, lat, lng, csr, celdas };
}

export function cargarGrafoVial(): Promise<Grafo | null> {
  if (!promesaGrafo) {
    promesaGrafo = construirGrafo().then((g) => {
      if (!g) promesaGrafo = null; // permite reintentar si no se pudo bajar
      return g;
    });
  }
  return promesaGrafo;
}

// Pide el archivo con anticipación (con internet) para que ya esté en el
// caché del service worker cuando haga falta sin señal.
export function precargarGrafoVial(): void {
  cargarGrafoVial().catch(() => { });
}

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}

// Nodo del grafo más cercano al punto (null si no hay calle a ≤ MAX_SNAP_M).
function nodoCercano(g: Grafo, p: Coord): { nodo: number; metros: number } | null {
  let mejor = -1;
  let mejorD = Infinity;
  const ci = Math.floor(p[0] / CELDA);
  const cj = Math.floor(p[1] / CELDA);
  for (let radio = 0; radio <= 4; radio++) {
    for (let di = -radio; di <= radio; di++) {
      for (let dj = -radio; dj <= radio; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== radio) continue;
        const c = g.celdas.get((ci + di) * 100000 + (cj + dj));
        if (!c) continue;
        for (const i of c) {
          const d = haversine(p[0], p[1], g.lat[i], g.lng[i]);
          if (d < mejorD) { mejorD = d; mejor = i; }
        }
      }
    }
    // Ya hay candidato y el siguiente anillo no puede mejorarlo
    if (mejor >= 0 && mejorD < radio * CELDA * 100000) break;
  }
  if (mejor < 0 || mejorD > MAX_SNAP_M) return null;
  return { nodo: mejor, metros: mejorD };
}

// Montículo binario mínimo para Dijkstra/A*
class Monticulo {
  private k: number[] = [];
  private v: number[] = [];
  get tam() { return this.k.length; }
  push(clave: number, valor: number) {
    let i = this.k.length;
    this.k.push(clave); this.v.push(valor);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      [this.k[p], this.k[i]] = [this.k[i], this.k[p]];
      [this.v[p], this.v[i]] = [this.v[i], this.v[p]];
      i = p;
    }
  }
  pop(): number {
    const top = this.v[0];
    const kl = this.k.pop()!;
    const vl = this.v.pop()!;
    if (this.k.length) {
      this.k[0] = kl; this.v[0] = vl;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.k.length && this.k[l] < this.k[m]) m = l;
        if (r < this.k.length && this.k[r] < this.k[m]) m = r;
        if (m === i) break;
        [this.k[m], this.k[i]] = [this.k[i], this.k[m]];
        [this.v[m], this.v[i]] = [this.v[i], this.v[m]];
        i = m;
      }
    }
    return top;
  }
}

export interface RutaOffline {
  geometria: Coord[];
  distanciaMetros: number;
  duracionSegundos: number;
}

// Ruta más rápida en carro entre dos puntos usando solo el grafo local.
// Devuelve null si algún extremo queda fuera de la cobertura o no hay
// camino entre ambos.
export async function rutaPorCallesOffline(a: Coord, b: Coord, modo: ModoRuta = 'auto'): Promise<RutaOffline | null> {
  const g = await cargarGrafoVial();
  if (!g) return null;
  const sa = nodoCercano(g, a);
  const sb = nodoCercano(g, b);
  if (!sa || !sb) return null;
  const { ini, dest, seg, metros, forma, formaInversa } = g.csr[modo];

  const VMAX = modo === 'pie' ? VEL_PIE : 90 / 3.6; // m/s, para que la heurística nunca sobreestime
  const costo = new Float32Array(g.n).fill(Infinity);
  const previo = new Int32Array(g.n).fill(-1);
  const aristaPrevia = new Int32Array(g.n).fill(-1);
  const hecho = new Uint8Array(g.n);
  const cola = new Monticulo();
  const h = (i: number) => haversine(g.lat[i], g.lng[i], g.lat[sb.nodo], g.lng[sb.nodo]) / VMAX;
  costo[sa.nodo] = 0;
  cola.push(h(sa.nodo), sa.nodo);

  while (cola.tam) {
    const u = cola.pop();
    if (hecho[u]) continue;
    hecho[u] = 1;
    if (u === sb.nodo) break;
    for (let e = ini[u]; e < ini[u + 1]; e++) {
      const v = dest[e];
      const c = costo[u] + seg[e];
      if (c < costo[v]) {
        costo[v] = c; previo[v] = u; aristaPrevia[v] = e;
        cola.push(c + h(v), v);
      }
    }
  }
  if (!isFinite(costo[sb.nodo])) return null;

  // Reconstruir de atrás hacia adelante
  const tramos: Coord[][] = [];
  let metrosRuta = 0;
  for (let v = sb.nodo; previo[v] !== -1; v = previo[v]) {
    const e = aristaPrevia[v];
    const u = previo[v];
    const interm = forma[e] ? decodificar(forma[e]!) : [];
    if (formaInversa[e]) interm.reverse();
    tramos.push([[g.lat[u], g.lng[u]], ...interm, [g.lat[v], g.lng[v]]]);
    metrosRuta += metros[e];
  }
  tramos.reverse();
  const geometria: Coord[] = [a];
  for (const t of tramos) for (const p of t) geometria.push(p);
  geometria.push(b);

  // El trayecto del punto a la calle (inicio/fin) se hace a ~25 km/h
  metrosRuta += sa.metros + sb.metros;
  const duracion = costo[sb.nodo] + (sa.metros + sb.metros) / (modo === 'pie' ? VEL_PIE : 25 / 3.6);
  return { geometria, distanciaMetros: metrosRuta, duracionSegundos: duracion };
}
