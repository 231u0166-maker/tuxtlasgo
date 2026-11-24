// Construye el índice de búsqueda sin internet de un paquete: nombres de localidades, colonias,
// negocios/lugares, calles, lagos y cerros con su posición, leídos de los mosaicos z14 del
// mapa.pmtiles (los mismos datos de OpenStreetMap que ya se ven en el mapa).
//
//   node scripts/paquetes/construir-indice.mjs tabasco
//   node scripts/paquetes/construir-indice.mjs all
//
// Resultado: paquetes/<id>/buscar.json y su entrada (archivoBusqueda, bytesBusqueda) en
// paquetes/paquetes.json. NO hace falta Planetiler: solo lee el mapa ya generado.
// (construir-paquete.mjs también lo corre como último paso.)
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, DIR_PAQUETES, construirIndiceDePmtiles, actualizarCatalogo, tamano } from './lib-paquete.mjs';
import { construirIndiceDePbf } from './lib-osm-pbf.mjs';

export async function indexarPaquete(entrada) {
  const dir = join(DIR_PAQUETES, entrada.id);
  // Con el extracto original de OpenStreetMap (data/sources/<id>.osm.pbf) el índice sale COMPLETO (plazas, iglesias,
  // edificios, parques, ríos…). Si no está, se lee de los mosaicos del mapa (trae menos cosas).
  const pbf = join(RAIZ, 'data', 'sources', `${entrada.id}.osm.pbf`);
  const indice = existsSync(pbf)
    ? await construirIndiceDePbf(pbf, entrada.bbox)
    : await construirIndiceDePmtiles(join(dir, 'mapa.pmtiles'), entrada.bbox);
  const ruta = join(dir, 'buscar.json');
  await writeFile(ruta, JSON.stringify(indice));
  const bytes = await tamano(ruta);
  await actualizarCatalogo({ ...entrada, archivoBusqueda: `${entrada.id}/buscar.json`, bytesBusqueda: bytes });
  console.log(`  ${indice.t.length} nombres → ${(bytes / 1048576).toFixed(1)} MB (${ruta})`);
  return bytes;
}

// Solo se ejecuta como script (no al importarlo desde construir-paquete.mjs)
if (process.argv[1] && process.argv[1].endsWith('construir-indice.mjs')) {
  const pedido = process.argv[2];
  const { paquetes } = JSON.parse(await readFile(join(DIR_PAQUETES, 'paquetes.json'), 'utf8'));
  const lista = pedido === 'all' ? paquetes : paquetes.filter((p) => p.id === pedido);
  if (!pedido || lista.length === 0) {
    console.error('Uso: node scripts/paquetes/construir-indice.mjs <id|all>\nPaquetes: ' + paquetes.map((p) => p.id).join(', '));
    process.exit(1);
  }
  for (const p of lista) { console.log(`\n=== Índice de ${p.nombre} ===`); await indexarPaquete(p); }
}
