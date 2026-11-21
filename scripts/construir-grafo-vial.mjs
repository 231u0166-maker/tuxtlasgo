// Construye public/grafo-vial.json: la red de calles transitables en carro de
// Los Tuxtlas (OpenStreetMap vía Overpass) en un formato compacto, para que la
// app calcule rutas SIN internet (src/lib/rutasOffline.ts).
//
// Uso:  node scripts/construir-grafo-vial.mjs
// Se corre a mano, rara vez (las calles cambian poco). Overpass a veces está
// saturado: el script reintenta con espera creciente y baja por cuadrantes.

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [S, W, N, E] = [18.25, -95.6, 18.8, -94.85]; // región + margen
const FILAS = 4;
const COLS = 5;
const CLASES =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track|' +
  'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';
// km/h estimados de circulación real en la zona (no el límite legal).
const VEL = {
  motorway: 90, trunk: 70, primary: 60, secondary: 50, tertiary: 40, unclassified: 35,
  residential: 25, living_street: 15, service: 15, track: 15,
  motorway_link: 50, trunk_link: 45, primary_link: 40, secondary_link: 35, tertiary_link: 30,
};
const ENDPOINTS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function bajarCuadrante(s, w, n, e) {
  const q = `[out:json][timeout:180];way["highway"~"^(${CLASES})$"]["access"!~"^(private|no)$"](${s},${w},${n},${e});out geom;`;
  for (let intento = 0; intento < 8; intento++) {
    for (const url of ENDPOINTS) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': 'grafo-vial-build/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(q),
          signal: AbortSignal.timeout(200000),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json(); // lanza si la respuesta vino truncada
        if (j.remark && /error|timed out/i.test(j.remark)) throw new Error(j.remark);
        return j.elements;
      } catch (err) {
        console.log(`  reintento (${err.message})`);
      }
    }
    await espera(5000 * (intento + 1));
  }
  throw new Error(`No se pudo bajar el cuadrante ${s},${w}`);
}

const vias = new Map();
const dLat = (N - S) / FILAS;
const dLng = (E - W) / COLS;
for (let i = 0; i < FILAS; i++) {
  for (let j = 0; j < COLS; j++) {
    const s = S + i * dLat, w = W + j * dLng;
    console.log(`Cuadrante ${i * COLS + j + 1}/${FILAS * COLS}`);
    // Cada cuadrante bajado se guarda en disco: si el script se corta, al
    // volver a correrlo retoma donde se quedó.
    const archivo = join(tmpdir(), `grafo-vial-q${i}-${j}.json`);
    let els;
    if (existsSync(archivo)) els = JSON.parse(readFileSync(archivo, 'utf8'));
    else {
      els = await bajarCuadrante(s, w, s + dLat, w + dLng);
      writeFileSync(archivo, JSON.stringify(els));
    }
    for (const el of els) if (el.type === 'way' && el.geometry && el.nodes) vias.set(el.id, el);
    await espera(1500);
  }
}
console.log('Vías únicas:', vias.size);

// 1) Cuántas vías toca cada nodo → los que tocan ≥2 (o son extremos) son cruces.
const usos = new Map();
for (const v of vias.values()) {
  v.nodes.forEach((id, k) => {
    const extremo = k === 0 || k === v.nodes.length - 1;
    usos.set(id, (usos.get(id) || 0) + (extremo ? 2 : 1));
  });
}
const esCruce = (id) => usos.get(id) >= 2;

// 2) Índice de nodos del grafo (solo cruces) y aristas con su forma.
const indice = new Map();
const nodos = []; // [lat1e5, lng1e5]
const aristas = []; // [a, b, metros, kmh, forma]
const idx = (id, p) => {
  let k = indice.get(id);
  if (k === undefined) { k = nodos.length; indice.set(id, k); nodos.push([Math.round(p.lat * 1e5), Math.round(p.lon * 1e5)]); }
  return k;
};
const metros = (a, b) => {
  const R = 6371000, r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
// Polyline codificada (precisión 1e-5) de los puntos intermedios, relativa al primer cruce.
function codif(pts) {
  let pl = 0, pn = 0, out = '';
  const num = (v) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    return s + String.fromCharCode(v + 63);
  };
  for (const p of pts) {
    const la = Math.round(p.lat * 1e5), ln = Math.round(p.lon * 1e5);
    out += num(la - pl) + num(ln - pn); pl = la; pn = ln;
  }
  return out;
}

for (const v of vias.values()) {
  const t = v.tags;
  const vel = VEL[t.highway];
  if (!vel) continue;
  // oneway: 1 = solo ida, -1 = solo vuelta, 0 = doble sentido
  let uno = 0;
  if (t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' || t.highway === 'motorway') uno = 1;
  else if (t.oneway === '-1') uno = -1;

  let ini = 0;
  for (let k = 1; k < v.nodes.length; k++) {
    if (!esCruce(v.nodes[k]) && k !== v.nodes.length - 1) continue;
    const tramo = v.geometry.slice(ini, k + 1);
    let m = 0;
    for (let q = 1; q < tramo.length; q++) m += metros(tramo[q - 1], tramo[q]);
    const a = idx(v.nodes[ini], v.geometry[ini]);
    const b = idx(v.nodes[k], v.geometry[k]);
    if (a !== b) {
      const forma = codif(tramo.slice(1, -1));
      // dirección: 0 doble, 1 solo a→b, 2 solo b→a
      aristas.push([a, b, Math.round(m), vel, uno === 0 ? 0 : uno === 1 ? 1 : 2, forma]);
    }
    ini = k;
  }
}

// 3) Solo la componente conexa más grande (descarta caminitos aislados).
const ady = nodos.map(() => []);
aristas.forEach(([a, b], i) => { ady[a].push(b); ady[b].push(a); });
const comp = new Int32Array(nodos.length).fill(-1);
let mejor = -1, mejorTam = 0, nc = 0;
for (let s = 0; s < nodos.length; s++) {
  if (comp[s] !== -1) continue;
  const pila = [s]; comp[s] = nc; let tam = 0;
  while (pila.length) { const u = pila.pop(); tam++; for (const x of ady[u]) if (comp[x] === -1) { comp[x] = nc; pila.push(x); } }
  if (tam > mejorTam) { mejorTam = tam; mejor = nc; }
  nc++;
}
const remap = new Int32Array(nodos.length).fill(-1);
const nodosF = [];
nodos.forEach((p, i) => { if (comp[i] === mejor) { remap[i] = nodosF.length; nodosF.push(p); } });
const aristasF = aristas
  .filter(([a]) => comp[a] === mejor)
  .map(([a, b, m, v, d, f]) => [remap[a], remap[b], m, v, d, f]);

const salida = { v: 1, generado: new Date().toISOString().slice(0, 10), nodos: nodosF, aristas: aristasF };
writeFileSync('public/grafo-vial.json', JSON.stringify(salida));
console.log(`Listo: ${nodosF.length} cruces, ${aristasF.length} tramos (componente principal de ${nc}).`);
