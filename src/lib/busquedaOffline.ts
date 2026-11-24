// ============================================================
// BÚSQUEDA SIN INTERNET en los paquetes de mapa descargados
// ============================================================
// Cada paquete regional (Puebla, Tabasco, Veracruz) trae un índice de nombres
// (scripts/paquetes/construir-indice.mjs): localidades, colonias, negocios y lugares, calles,
// lagos y cerros con su posición, sacados de los mismos datos de OpenStreetMap del mapa.
// Se baja junto con el paquete, se guarda en Cache Storage y se busca en memoria.
//
// Sin internet NO hay dirección exacta ni números de casa (el paquete no los trae): se
// encuentra el lugar, la calle (un punto sobre ella) o la colonia.
// ============================================================

import type { Coord } from './routing';
import { describirOsm, type ResultadoBusqueda } from './buscarLugares';

const CACHE_BUSQUEDA = 'tuxtlasgo-busqueda-v1';
const urlIndice = (id: string) => `/__busqueda__/${id}.json`;

interface Serializado { v: 1; tipos: string[]; nombres: string; t: number[]; la: number[]; ln: number[] }
interface Indice {
  id: string;
  n: number;
  nombres: string[];
  norm: string[]; // sin acentos y en minúsculas
  tipos: string[];
  t: Uint8Array | Uint16Array;
  la: Float32Array;
  ln: Float32Array;
  lugares: number[]; // posiciones de ciudades/pueblos/colonias (para decir «cerca de X»)
  cerca: Int32Array;  // por cada nombre: la localidad (cualquier tipo) más próxima, o -1
  ciudad: Int32Array; // por cada nombre: la ciudad/pueblo (no colonia) más próximo, o -1
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- guardar / borrar ----------
export async function indiceGuardado(id: string): Promise<boolean> {
  try { return !!(await (await caches.open(CACHE_BUSQUEDA)).match(urlIndice(id))); } catch { return false; }
}
export async function descargarIndice(id: string, url: string, senal?: AbortSignal): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: senal });
    if (!r.ok) return false;
    await (await caches.open(CACHE_BUSQUEDA)).put(
      urlIndice(id), new Response(await r.text(), { headers: { 'Content-Type': 'application/json' } })
    );
    memoria.delete(id);
    return true;
  } catch { return false; }
}
export async function borrarIndice(id: string): Promise<void> {
  memoria.delete(id);
  try { await (await caches.open(CACHE_BUSQUEDA)).delete(urlIndice(id)); } catch { /* ya no estaba */ }
}

// ---------- cargar en memoria ----------
const memoria = new Map<string, Promise<Indice | null>>();
function cargarIndice(id: string): Promise<Indice | null> {
  let p = memoria.get(id);
  if (!p) {
    p = (async () => {
      try {
        const r = await (await caches.open(CACHE_BUSQUEDA)).match(urlIndice(id));
        if (!r) return null;
        const d: Serializado = await r.json();
        const nombres = d.nombres.split('\n');
        const n = nombres.length;
        const lugares: number[] = [];
        const esLugar = d.tipos.map((x) => /^lugar:(city|town|village|suburb|neighbourhood|quarter)$/.test(x));
        const esCiudad = d.tipos.map((x) => /^lugar:(city|town|village)$/.test(x));
        for (let i = 0; i < n; i++) if (esLugar[d.t[i]]) lugares.push(i);
        const la = Float32Array.from(d.la, (v) => v / 1e5), ln = Float32Array.from(d.ln, (v) => v / 1e5);
        // Cuadrícula de 0.1° (~11 km) para encontrar rápido la localidad más próxima de cada nombre
        const celda = (a: number, o: number) => Math.floor(a * 10) * 10000 + Math.floor(o * 10);
        const rejilla = new Map<number, number[]>();
        for (const i of lugares) { const k = celda(la[i], ln[i]); const c = rejilla.get(k); if (c) c.push(i); else rejilla.set(k, [i]); }
        const cerca = new Int32Array(n).fill(-1), ciudad = new Int32Array(n).fill(-1);
        for (let i = 0; i < n; i++) {
          let mejorA = -1, dA = 1e9, mejorC = -1, dC = 1e9;
          const fa = Math.floor(la[i] * 10), fo = Math.floor(ln[i] * 10);
          for (let da = -1; da <= 1; da++) for (let dob = -1; dob <= 1; dob++) {
            const c = rejilla.get((fa + da) * 10000 + (fo + dob));
            if (!c) continue;
            for (const j of c) {
              if (j === i) continue;
              const dx = (ln[j] - ln[i]) * 0.945, dy = la[j] - la[i], dd = dx * dx + dy * dy; // ~cos(19°)
              if (dd < dA) { dA = dd; mejorA = j; }
              if (esCiudad[d.t[j]] && dd < dC) { dC = dd; mejorC = j; }
            }
          }
          cerca[i] = mejorA; ciudad[i] = mejorC;
        }
        return {
          id, n, nombres, norm: nombres.map(normalizar), tipos: d.tipos,
          t: d.tipos.length < 256 ? Uint8Array.from(d.t) : Uint16Array.from(d.t),
          la, ln, lugares, cerca, ciudad,
        };
      } catch { return null; }
    })();
    memoria.set(id, p);
    // El resultado nulo (aún sin índice) no se recuerda: podría descargarse después
    p.then((v) => { if (!v) memoria.delete(id); });
  }
  return p;
}

// ---------- buscar ----------
const km = (la1: number, ln1: number, la2: number, ln2: number) => {
  const x = (ln2 - ln1) * Math.cos(((la1 + la2) / 2) * Math.PI / 180);
  const y = la2 - la1;
  return Math.hypot(x, y) * 111.32;
};

// Prioridad por tipo: localidades y lugares primero, calles al final
function pesoTipo(tipo: string): number {
  if (tipo.startsWith('lugar:')) return /city|town/.test(tipo) ? -1.5 : -0.5;
  if (tipo.startsWith('poi:') || tipo === 'agua' || tipo === 'cerro') return 0;
  return 0.75; // calle
}

function describirTipo(tipo: string): { etiqueta: string; emoji: string } {
  if (tipo === 'calle') return { etiqueta: 'Calle', emoji: '🛣️' };
  if (tipo === 'agua') return { etiqueta: 'Agua', emoji: '🌊' };
  if (tipo === 'cerro') return { etiqueta: 'Cerro', emoji: '⛰️' };
  const [grupo, sub] = tipo.split(':');
  if (grupo === 'lugar' && sub === 'island') return { etiqueta: 'Isla', emoji: '🏝️' };
  if (grupo === 'lugar' && sub === 'hamlet') return { etiqueta: 'Localidad', emoji: '🏘️' };
  return describirOsm(grupo === 'lugar' ? 'place' : 'amenity', sub);
}

/** Busca en los paquetes con índice guardado. `refs` ordena por cercanía al más próximo de esos puntos
 *  (p. ej. donde estás Y lo que miras en el mapa): estando en Puebla, «centro de convenciones» trae primero el de Puebla. */
export async function buscarSinInternet(texto: string, idsPaquetes: string[], refs: Coord[], max = 8): Promise<ResultadoBusqueda[]> {
  const q = normalizar(texto).trim();
  if (q.length < 2) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const candidatos: { r: ResultadoBusqueda; puntos: number }[] = [];

  for (const id of idsPaquetes) {
    const ix = await cargarIndice(id);
    if (!ix) continue;
    let tomados = 0;
    for (let i = 0; i < ix.n && tomados < 20000; i++) {
      const nm = ix.norm[i];
      // Cada palabra debe estar en el nombre o en la localidad donde queda («palacio municipal catemaco»),
      // pero al menos una tiene que ser del nombre mismo (si no, «catemaco» devolvería media región).
      let enNombre = 0, ok = true, loc: string | null = null;
      for (const tk of tokens) {
        if (nm.includes(tk)) { enNombre++; continue; }
        if (loc === null) loc = (ix.ciudad[i] >= 0 ? ix.norm[ix.ciudad[i]] : '') + ' ' + (ix.cerca[i] >= 0 ? ix.norm[ix.cerca[i]] : '');
        if (!loc.includes(tk)) { ok = false; break; }
      }
      if (!ok || enNombre === 0) continue;
      tomados++;
      const tipo = ix.tipos[ix.t[i]];
      // 0 = igual, 1 = empieza con, 2 = una palabra empieza con, 3 = lo contiene
      const base = nm === q ? 0 : nm.startsWith(q) ? 1 : nm.includes(' ' + q) ? 2 : 3;
      let d = 0;
      if (refs.length) { d = Infinity; for (const r of refs) d = Math.min(d, km(r[0], r[1], ix.la[i], ix.ln[i])); }
      // La distancia pesa poco frente al tipo/coincidencia, pero ordena entre iguales (la «Calle Juárez» de tu ciudad)
      // Cada palabra que solo coincide por la localidad resta un poco de relevancia
      const puntos = base + pesoTipo(tipo) + Math.min(d, 400) / 80 + (tokens.length - enNombre) * 0.25;
      candidatos.push({
        puntos,
        r: {
          id: `off-${id}-${i}`, coord: [ix.la[i], ix.ln[i]], nombre: ix.nombres[i], detalle: '',
          ...describirTipo(tipo), origen: 'offline',
        },
      });
    }
  }
  candidatos.sort((a, b) => a.puntos - b.puntos);

  // Sin repetidos (los paquetes de Puebla y Veracruz se traslapan): mismo nombre a menos de ~300 m
  const out: ResultadoBusqueda[] = [];
  for (const { r } of candidatos) {
    if (out.some((o) => o.nombre === r.nombre && Math.abs(o.coord[0] - r.coord[0]) < 0.003 && Math.abs(o.coord[1] - r.coord[1]) < 0.003)) continue;
    out.push(r);
    if (out.length >= max) break;
  }

  // «Cerca de X»: la localidad conocida más próxima a cada resultado
  const indices = (await Promise.all(idsPaquetes.map(cargarIndice))).filter((x): x is Indice => !!x);
  for (const r of out) {
    let mejor = '', mejorD = 25; // más lejos de 25 km no se dice
    for (const ix of indices) {
      for (const i of ix.lugares) {
        const d = km(r.coord[0], r.coord[1], ix.la[i], ix.ln[i]);
        if (d < mejorD && ix.nombres[i] !== r.nombre) { mejorD = d; mejor = ix.nombres[i]; }
      }
    }
    r.detalle = mejor ? `Cerca de ${mejor}` : '';
  }
  return out;
}
