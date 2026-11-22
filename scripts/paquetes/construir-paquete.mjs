// Construye un paquete regional: mapa (PMTiles) + red de rutas (grafo.json).
//
//   node --max-old-space-size=8192 scripts/paquetes/construir-paquete.mjs veracruz
//   node --max-old-space-size=8192 scripts/paquetes/construir-paquete.mjs all
//
// Requisitos (una sola vez, ver scripts/paquetes/README.md):
//   · Java 21+      · tools/planetiler.jar (programa de código abierto que genera
//     los mosaicos del mapa a partir de OpenStreetMap, con el mismo esquema que
//     OpenFreeMap, así que el estilo y la red de rutas son los mismos que ya usa la app)
//
// Resultado en paquetes/<id>/: mapa.pmtiles y grafo.json, y la entrada en
// paquetes/paquetes.json (el catálogo). Todo eso se sube al servidor de paquetes.

import { spawn } from 'node:child_process';
import { existsSync, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RAIZ, DIR_PAQUETES, construirGrafoDePmtiles, sha256, tamano, actualizarCatalogo } from './lib-paquete.mjs';

const JAR = join(RAIZ, 'tools', 'planetiler.jar');
const XMX = process.env.JAVA_XMX || '8g';
// Extractos de OpenStreetMap POR ESTADO (OpenStreetMap France; ~10–50 MB cada uno y
// descargan rápido). Se bajan una vez a data/sources/<id>.osm.pbf.
// (Geofabrik solo ofrece México completo, 650 MB, y desde aquí bajaba a ~16 KB/s;
// tampoco se usa --area de Planetiler: su lector del índice de Geofabrik falla.)
const URL_BASE_PBF = process.env.PAQUETES_PBF_BASE || 'https://download.openstreetmap.fr/extracts/north-america/mexico';

async function asegurarPbf(region) {
  const ruta = join(RAIZ, 'data', 'sources', `${region.id}.osm.pbf`);
  if (existsSync(ruta)) return ruta;
  await mkdir(join(RAIZ, 'data', 'sources'), { recursive: true });
  const url = region.pbf || `${URL_BASE_PBF}/${region.id}.osm.pbf`;
  console.log(`Bajando OpenStreetMap de ${region.nombre} (${url})…`);
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok || !r.body) throw new Error(`No se pudo bajar el extracto de ${region.nombre} (HTTP ${r.status})`);
  const parcial = ruta + '.parcial';
  await pipeline(Readable.fromWeb(r.body), createWriteStream(parcial));
  const { rename } = await import('node:fs/promises');
  await rename(parcial, ruta);
  console.log('  listo.');
  return ruta;
}

const { regiones } = JSON.parse(await readFile(join(RAIZ, 'scripts', 'paquetes', 'regiones.json'), 'utf8'));
const pedido = process.argv[2];
if (!pedido) {
  console.error('Uso: node scripts/paquetes/construir-paquete.mjs <id|all>\nRegiones: ' + regiones.map((r) => r.id).join(', '));
  process.exit(1);
}
const lista = pedido === 'all' ? regiones : regiones.filter((r) => r.id === pedido);
if (lista.length === 0) { console.error(`No existe la región "${pedido}".`); process.exit(1); }
if (!existsSync(JAR)) {
  console.error(`Falta ${JAR}\nDescarga planetiler.jar (ver scripts/paquetes/README.md, paso 1) y vuelve a correr esto.`);
  process.exit(1);
}

function correr(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`${cmd} terminó con código ${c}`))));
    p.on('error', rej);
  });
}

for (const r of lista) {
  const dir = join(DIR_PAQUETES, r.id);
  await mkdir(dir, { recursive: true });
  const mapa = join(dir, 'mapa.pmtiles');
  const rutaPbf = await asegurarPbf(r);
  console.log(`\n=== ${r.nombre} ===\n1/3 Generando el mapa con Planetiler (puede tardar un buen rato)…`);
  await correr('java', [
    `-Xmx${XMX}`, '-jar', JAR,
    `--osm-path=${rutaPbf}`, '--download',
    `--bounds=${r.bbox.join(',')}`,
    `--output=${mapa}`,
    '--maxzoom=14',
    '--exclude-layers=housenumber', // números de casa: mucho peso, poco valor para el turista
    '--force',
    '--storage=mmap',
  ]);

  console.log('2/3 Armando la red de calles y senderos para rutas sin internet…');
  const grafo = await construirGrafoDePmtiles(mapa, r.bbox);
  const rutaGrafo = join(dir, 'grafo.json');
  await writeFile(rutaGrafo, JSON.stringify(grafo));
  console.log(`  ${grafo.nodos.length} cruces, ${grafo.aristas.length} tramos`);

  console.log('3/3 Registrando en el catálogo…');
  const bytesMapa = await tamano(mapa), bytesGrafo = await tamano(rutaGrafo);
  const ruta = await actualizarCatalogo({
    id: r.id, nombre: r.nombre, descripcion: r.descripcion, bbox: r.bbox,
    version: new Date().toISOString().slice(0, 10),
    archivoMapa: `${r.id}/mapa.pmtiles`, archivoGrafo: `${r.id}/grafo.json`,
    bytesMapa, bytesGrafo, sha256Mapa: await sha256(mapa),
  });
  console.log(`Listo: ${(bytesMapa / 1048576).toFixed(0)} MB de mapa + ${(bytesGrafo / 1048576).toFixed(1)} MB de rutas → ${ruta}`);
}
console.log('\nSube la carpeta paquetes/ completa al servidor de paquetes (ver README).');
