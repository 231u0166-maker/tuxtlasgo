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
import { leerZonas, CACHE_GRAFOS, urlGrafoZona, type Caja } from './mapaOffline';
import { LOS_TUXTLAS_BOUNDS } from '../data/lugares';

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
  // Índice espacial por modo: casillas de 0.01° → nodos con salida en ese modo
  celdas: Record<ModoRuta, Map<number, number[]>>;
}
type Arista = [number, number, number, number, number, string];
const VEL_PIE = 5 / 3.6; // m/s

function construirCsr(n: number, aristas: Arista[], modo: ModoRuta): Csr {
  // Auto: respeta sentidos únicos. A pie: todo en ambos sentidos, sin autopistas.
  const usable = (kmh: number) => (modo === 'auto' ? kmh > 0 : kmh < 90);
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

// Componentes fuertemente conexas (Tarjan iterativo). Devuelve el id de cada nodo.
function componentesFuertes(n: number, csr: Csr): Int32Array {
  const { ini, dest } = csr;
  const indice = new Int32Array(n).fill(-1);
  const bajo = new Int32Array(n);
  const enPila = new Uint8Array(n);
  const comp = new Int32Array(n).fill(-1);
  const pila: number[] = [];
  const llamadas: number[] = [];
  const sig = new Int32Array(n);
  let contador = 0, nComp = 0;
  for (let raiz = 0; raiz < n; raiz++) {
    if (indice[raiz] !== -1) continue;
    llamadas.push(raiz);
    indice[raiz] = bajo[raiz] = contador++;
    pila.push(raiz); enPila[raiz] = 1; sig[raiz] = ini[raiz];
    while (llamadas.length) {
      const u = llamadas[llamadas.length - 1];
      if (sig[u] < ini[u + 1]) {
        const v = dest[sig[u]++];
        if (indice[v] === -1) {
          indice[v] = bajo[v] = contador++;
          pila.push(v); enPila[v] = 1; sig[v] = ini[v];
          llamadas.push(v);
        } else if (enPila[v]) {
          if (indice[v] < bajo[u]) bajo[u] = indice[v];
        }
      } else {
        llamadas.pop();
        if (llamadas.length) {
          const padre = llamadas[llamadas.length - 1];
          if (bajo[u] < bajo[padre]) bajo[padre] = bajo[u];
        }
        if (bajo[u] === indice[u]) {
          let w: number;
          do { w = pila.pop()!; enPila[w] = 0; comp[w] = nComp; } while (w !== u);
          nComp++;
        }
      }
    }
  }
  return comp;
}

function grafoDesdeDatos(datos: { nodos: [number, number][]; aristas: Arista[] }): Grafo {
  const n = datos.nodos.length;
  const lat = new Float32Array(n);
  const lng = new Float32Array(n);
  datos.nodos.forEach(([la, ln], i) => { lat[i] = la / 1e5; lng[i] = ln / 1e5; });
  const csr = { auto: construirCsr(n, datos.aristas, 'auto'), pie: construirCsr(n, datos.aristas, 'pie') };
  // Solo se puede "pegar" un punto a nodos de la componente fuertemente
  // conexa (se puede entrar y salir): con calles de un solo sentido, un nodo
  // suelto puede tener salida pero no llegada, y la ruta nunca lo alcanzaría.
  const celdas = { auto: new Map<number, number[]>(), pie: new Map<number, number[]>() };
  for (const modo of ['auto', 'pie'] as const) {
    const comp = componentesFuertes(n, csr[modo]);
    const tam = new Map<number, number>();
    for (let i = 0; i < n; i++) tam.set(comp[i], (tam.get(comp[i]) ?? 0) + 1);
    for (let i = 0; i < n; i++) {
      if ((tam.get(comp[i]) ?? 0) < 30) continue;
      const k = claveCelda(lat[i], lng[i]);
      const c = celdas[modo].get(k);
      if (c) c.push(i); else celdas[modo].set(k, [i]);
    }
  }
  return { n, lat, lng, csr, celdas };
}

async function construirGrafo(): Promise<Grafo | null> {
  try {
    const r = await fetch(URL_GRAFO);
    if (!r.ok) return null;
    return grafoDesdeDatos(await r.json());
  } catch {
    return null;
  }
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
function nodoCercano(g: Grafo, p: Coord, modo: ModoRuta): { nodo: number; metros: number } | null {
  let mejor = -1;
  let mejorD = Infinity;
  const ci = Math.floor(p[0] / CELDA);
  const cj = Math.floor(p[1] / CELDA);
  for (let radio = 0; radio <= 4; radio++) {
    for (let di = -radio; di <= radio; di++) {
      for (let dj = -radio; dj <= radio; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== radio) continue;
        const c = g.celdas[modo].get((ci + di) * 100000 + (cj + dj));
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
function enCaja(c: Caja, p: Coord, margen = 0.02): boolean {
  return p[1] >= c[0] - margen && p[1] <= c[2] + margen && p[0] >= c[1] - margen && p[0] <= c[3] + margen;
}

// Grafos de zonas descargadas en memoria (máx. 2 a la vez para cuidar la RAM)
const grafosZona = new Map<string, Promise<Grafo | null>>();
function cargarGrafoZona(id: string): Promise<Grafo | null> {
  let p = grafosZona.get(id);
  if (!p) {
    p = (async () => {
      try {
        const cache = await caches.open(CACHE_GRAFOS);
        const r = await cache.match(urlGrafoZona(id));
        return r ? grafoDesdeDatos(await r.json()) : null;
      } catch { return null; }
    })();
    grafosZona.set(id, p);
    if (grafosZona.size > 2) grafosZona.delete(grafosZona.keys().next().value as string);
  }
  return p;
}
export function olvidarGrafosZona(): void { grafosZona.clear(); }

// Ruta más rápida usando las zonas descargadas que cubren ambos puntos
// (y la región base de Los Tuxtlas que viene con la app).
async function grafoConRuta(a: Coord, b: Coord, modo: ModoRuta): Promise<{ g: Grafo; principal: RutaConAristas } | null> {
  const zonas = leerZonas()
    .filter((z) => z.grafo && enCaja(z.caja, a) && enCaja(z.caja, b))
    .sort((x, y) => y.fecha - x.fecha);
  for (const z of zonas) {
    const g = await cargarGrafoZona(z.id);
    const r = g ? calcularRuta(g, a, b, modo) : null;
    if (g && r) return { g, principal: r };
  }
  const [[s0, w0], [n0, e0]] = LOS_TUXTLAS_BOUNDS;
  if (enCaja([w0, s0, e0, n0], a, 0.1) && enCaja([w0, s0, e0, n0], b, 0.1)) {
    const base = await cargarGrafoVial();
    const r = base ? calcularRuta(base, a, b, modo) : null;
    if (base && r) return { g: base, principal: r };
  }
  return null;
}

export async function rutaPorCallesOffline(a: Coord, b: Coord, modo: ModoRuta = 'auto'): Promise<RutaOffline | null> {
  const sel = await grafoConRuta(a, b, modo);
  if (!sel) return null;
  const { aristas: _aristas, ...ruta } = sel.principal;
  void _aristas;
  return ruta;
}

// Rutas alternas sin internet (método de penalización): se vuelve a calcular la
// ruta haciendo "más caras" las calles que ya usa la principal, así aparece otro
// camino real. Solo se aceptan las que se parecen poco a las anteriores y no son
// absurdamente más lentas.
export async function rutasAlternativasOffline(a: Coord, b: Coord, modo: ModoRuta = 'auto', max = 2): Promise<RutaOffline[]> {
  const sel = await grafoConRuta(a, b, modo);
  if (!sel) return [];
  return alternativasEnGrafo(sel.g, sel.principal, a, b, modo, max);
}

function alternativasEnGrafo(g: Grafo, principal: RutaConAristas, a: Coord, b: Coord, modo: ModoRuta, max: number): RutaOffline[] {
  const { metros } = g.csr[modo];
  const penalizadas = new Set(principal.aristas);
  const previas: Set<number>[] = [new Set(principal.aristas)];
  const salida: RutaOffline[] = [];
  const parecido = (aristas: number[], contra: Set<number>) => {
    let comun = 0, total = 0;
    for (const e of aristas) { total += metros[e]; if (contra.has(e)) comun += metros[e]; }
    return total > 0 ? comun / total : 1;
  };
  for (let k = 0; k < max + 1 && salida.length < max; k++) {
    const alt = calcularRuta(g, a, b, modo, { aristas: penalizadas, factor: 2.2 });
    if (!alt) break;
    const repetida = previas.some((p) => parecido(alt.aristas, p) > 0.7);
    const muyLenta = alt.duracionSegundos > principal.duracionSegundos * 1.7 + 60;
    for (const e of alt.aristas) penalizadas.add(e); // la siguiente intenta otro camino distinto
    if (repetida || muyLenta) continue;
    previas.push(new Set(alt.aristas));
    const { aristas: _a, ...ruta } = alt;
    void _a;
    salida.push(ruta);
  }
  return salida;
}

// Para pruebas: alternas sobre datos de grafo ya cargados
export function alternativasEnDatos(
  datos: { nodos: [number, number][]; aristas: [number, number, number, number, number, string][] },
  a: Coord, b: Coord, modo: ModoRuta = 'auto', max = 2
): RutaOffline[] {
  const g = grafoDesdeDatos(datos);
  const principal = calcularRuta(g, a, b, modo);
  return principal ? alternativasEnGrafo(g, principal, a, b, modo, max) : [];
}

interface Penalizacion { aristas: Set<number>; factor: number }
type RutaConAristas = RutaOffline & { aristas: number[] };

function calcularRuta(g: Grafo, a: Coord, b: Coord, modo: ModoRuta, penal?: Penalizacion): RutaConAristas | null {
  const sa = nodoCercano(g, a, modo);
  const sb = nodoCercano(g, b, modo);
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
      const c = costo[u] + seg[e] * (penal && penal.aristas.has(e) ? penal.factor : 1);
      if (c < costo[v]) {
        costo[v] = c; previo[v] = u; aristaPrevia[v] = e;
        cola.push(c + h(v), v);
      }
    }
  }
  if (!isFinite(costo[sb.nodo])) return null;

  // Reconstruir de atrás hacia adelante
  const tramos: Coord[][] = [];
  const usadas: number[] = [];
  let metrosRuta = 0;
  let segReal = 0; // tiempo SIN penalización (el de verdad)
  for (let v = sb.nodo; previo[v] !== -1; v = previo[v]) {
    const e = aristaPrevia[v];
    usadas.push(e);
    segReal += seg[e];
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
  const duracion = segReal + (sa.metros + sb.metros) / (modo === 'pie' ? VEL_PIE : 25 / 3.6);
  return { geometria, distanciaMetros: metrosRuta, duracionSegundos: duracion, aristas: usadas };
}

// Para pruebas y herramientas: ruta sobre datos de grafo ya cargados
export function rutaEnDatos(
  datos: { nodos: [number, number][]; aristas: [number, number, number, number, number, string][] },
  a: Coord, b: Coord, modo: ModoRuta = 'auto'
): RutaOffline | null {
  const r = calcularRuta(grafoDesdeDatos(datos), a, b, modo);
  if (!r) return null;
  const { aristas: _a, ...ruta } = r;
  void _a;
  return ruta;
}
