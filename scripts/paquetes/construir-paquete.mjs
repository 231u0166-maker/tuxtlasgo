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
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RAIZ, DIR_PAQUETES, construirGrafoDePmtiles, sha256, tamano, actualizarCatalogo } from './lib-paquete.mjs';

const JAR = join(RAIZ, 'tools', 'planetiler.jar');
const XMX = process.env.JAVA_XMX || '8g';
const AREA = process.env.PAQUETES_AREA || 'mexico'; // área de Geofabrik

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
  console.log(`\n=== ${r.nombre} ===\n1/3 Generando el mapa con Planetiler (puede tardar un buen rato)…`);
  await correr('java', [
    `-Xmx${XMX}`, '-jar', JAR,
    `--area=${AREA}`, '--download',
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
