// SOLO PARA PRUEBAS: arma un paquete chiquito (zona de Catemaco) en el MISMO
// formato que los paquetes reales (PMTiles v3, mosaicos con gzip + grafo.json),
// bajando unos cientos de mosaicos de OpenFreeMap. Sirve para probar la app y el
// servidor de paquetes sin correr Planetiler. NO es el proceso de producción
// (ese es construir-paquete.mjs).
//
//   node scripts/paquetes/crear-paquete-de-prueba.mjs

import { gzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zxyToTileId } from 'pmtiles';
import { DIR_PAQUETES, construirGrafoDePmtiles, mosaicosDeCaja, sha256, tamano, actualizarCatalogo } from './lib-paquete.mjs';

const ID = 'prueba-catemaco';
const BBOX = [-95.20, 18.38, -95.02, 18.50];
const MARGEN_BAJO = 1.2; // z0-9 con margen, como la app

const manifiesto = await (await fetch('https://tiles.openfreemap.org/planet')).json();
const plantilla = manifiesto.tiles[0];

// ---- mosaicos a incluir ----
const lista = [];
for (let z = 0; z <= 14; z++) {
  const caja = z <= 9 ? [BBOX[0] - MARGEN_BAJO, BBOX[1] - MARGEN_BAJO, BBOX[2] + MARGEN_BAJO, BBOX[3] + MARGEN_BAJO] : BBOX;
  for (const [x, y] of mosaicosDeCaja(caja, z)) lista.push([z, x, y]);
}
console.log(`Bajando ${lista.length} mosaicos…`);
const mosaicos = new Map(); // tileId → Buffer gzip
let hechos = 0;
async function uno([z, x, y]) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(plantilla.replace('{z}', z).replace('{x}', x).replace('{y}', y));
      if (!r.ok) return;
      const raw = Buffer.from(await r.arrayBuffer());
      if (raw.length === 0) return;
      mosaicos.set(zxyToTileId(z, x, y), gzipSync(raw)); // Planetiler también guarda con gzip
      return;
    } catch { await new Promise((res) => setTimeout(res, 500)); }
  }
}
for (let i = 0; i < lista.length; i += 8) {
  await Promise.all(lista.slice(i, i + 8).map(uno));
  hechos = Math.min(lista.length, i + 8);
  if ((i / 8) % 20 === 0) console.log(`  ${hechos}/${lista.length}`);
}

// ---- escribir PMTiles v3 ----
function varint(n) {
  const b = [];
  while (n >= 0x80) { b.push((n % 0x80) | 0x80); n = Math.floor(n / 0x80); }
  b.push(n);
  return b;
}
const ids = [...mosaicos.keys()].sort((a, b) => a - b);
let off = 0;
const entradas = ids.map((id) => { const e = { id, offset: off, length: mosaicos.get(id).length }; off += e.length; return e; });
const dir = [...varint(entradas.length)];
let previo = 0;
for (const e of entradas) { dir.push(...varint(e.id - previo)); previo = e.id; }
for (let i = 0; i < entradas.length; i++) dir.push(...varint(1));            // run lengths
for (const e of entradas) dir.push(...varint(e.length));                       // lengths
entradas.forEach((e, i) => {                                                    // offsets
  const sigue = i > 0 && e.offset === entradas[i - 1].offset + entradas[i - 1].length;
  dir.push(...varint(sigue ? 0 : e.offset + 1));
});
const dirGz = gzipSync(Buffer.from(dir));
const meta = gzipSync(Buffer.from(JSON.stringify({ name: ID, format: 'pbf', type: 'baselayer', generator: 'crear-paquete-de-prueba' })));
if (dirGz.length > 16384 - 127) throw new Error('El directorio raíz no cabe en 16 KB: reduce la zona de prueba.');

const datos = Buffer.concat(ids.map((id) => mosaicos.get(id)));
const cab = Buffer.alloc(127);
cab.write('PMTiles', 0, 'latin1'); cab.writeUInt8(3, 7);
const rootOff = 127, metaOff = rootOff + dirGz.length, leafOff = metaOff + meta.length, dataOff = leafOff;
cab.writeBigUInt64LE(BigInt(rootOff), 8); cab.writeBigUInt64LE(BigInt(dirGz.length), 16);
cab.writeBigUInt64LE(BigInt(metaOff), 24); cab.writeBigUInt64LE(BigInt(meta.length), 32);
cab.writeBigUInt64LE(BigInt(leafOff), 40); cab.writeBigUInt64LE(0n, 48);
cab.writeBigUInt64LE(BigInt(dataOff), 56); cab.writeBigUInt64LE(BigInt(datos.length), 64);
cab.writeBigUInt64LE(BigInt(ids.length), 72); cab.writeBigUInt64LE(BigInt(ids.length), 80); cab.writeBigUInt64LE(BigInt(ids.length), 88);
cab.writeUInt8(1, 96); cab.writeUInt8(2, 97); cab.writeUInt8(2, 98); cab.writeUInt8(1, 99);
cab.writeUInt8(0, 100); cab.writeUInt8(14, 101);
cab.writeInt32LE(Math.round(BBOX[0] * 1e7), 102); cab.writeInt32LE(Math.round(BBOX[1] * 1e7), 106);
cab.writeInt32LE(Math.round(BBOX[2] * 1e7), 110); cab.writeInt32LE(Math.round(BBOX[3] * 1e7), 114);
cab.writeUInt8(11, 118);
cab.writeInt32LE(Math.round(((BBOX[0] + BBOX[2]) / 2) * 1e7), 119); cab.writeInt32LE(Math.round(((BBOX[1] + BBOX[3]) / 2) * 1e7), 123);

const dirOut = join(DIR_PAQUETES, ID);
await mkdir(dirOut, { recursive: true });
const rutaMapa = join(dirOut, 'mapa.pmtiles');
await writeFile(rutaMapa, Buffer.concat([cab, dirGz, meta, datos]));
console.log(`mapa.pmtiles: ${(await tamano(rutaMapa) / 1048576).toFixed(1)} MB, ${ids.length} mosaicos`);

// ---- grafo (mismo código que usa el teléfono) ----
const grafo = await construirGrafoDePmtiles(rutaMapa, BBOX);
const rutaGrafo = join(dirOut, 'grafo.json');
await writeFile(rutaGrafo, JSON.stringify(grafo));
console.log(`grafo.json: ${grafo.nodos.length} cruces, ${grafo.aristas.length} tramos`);

await actualizarCatalogo({
  id: ID, nombre: 'Prueba: Catemaco (solo pruebas)', descripcion: 'Paquete de prueba, no es una región real', bbox: BBOX,
  version: new Date().toISOString().slice(0, 10),
  archivoMapa: `${ID}/mapa.pmtiles`, archivoGrafo: `${ID}/grafo.json`,
  bytesMapa: await tamano(rutaMapa), bytesGrafo: await tamano(rutaGrafo), sha256Mapa: await sha256(rutaMapa),
});
console.log('Listo. Sirve con: node scripts/paquetes/servir-paquetes.mjs');
