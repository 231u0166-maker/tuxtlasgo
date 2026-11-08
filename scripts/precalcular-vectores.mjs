// ============================================================
// PRECALCULAR LOS VECTORES DE LAS FICHAS DEL BANCO DE RESPUESTAS
// ============================================================
// Uso:  npm run vectores
// Corre el MISMO modelo que usa la app (multilingual-e5-small, cuantizado) sobre
// cada ficha ESTÁTICA de src/lib/conocimiento.ts y guarda los vectores en
// src/data/vectoresFichas.json. La app los usa tal cual en lugar de
// calcularlos en el teléfono: en un Galaxy A13 de 4 GB, calcular los vectores
// la primera vez sumaba varios minutos.
//
// CUÁNDO volver a correrlo: cada vez que cambies el modelo, VERSION_VECTORES
// (src/lib/embeddings.ts), o el texto/palabras clave de una ficha estática.
// Si se te olvida NO se rompe nada: cada vector lleva una "huella" del texto con
// el que se calculó; si no coincide con la ficha actual, la app lo recalcula en
// el dispositivo (más lento, pero correcto).
//
// Las fichas dinámicas (las que se agregan desde el panel de administración) no
// están aquí: esas siempre se calculan en el dispositivo.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(raiz, 'package.json'));
const tf = await import(pathToFileURL(require.resolve('@xenova/transformers')).href);
const { pipeline, env } = tf;
env.allowLocalModels = false;

const leer = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');

// Una sola fuente de verdad: modelo y versión salen de embeddings.ts.
const embeddingsSrc = leer('src/lib/embeddings.ts');
const MODELO = embeddingsSrc.match(/const MODELO_EMBEDDINGS = '([^']+)'/)?.[1];
const VERSION = embeddingsSrc.match(/const VERSION_VECTORES = '([^']+)'/)?.[1];
if (!MODELO || !VERSION) throw new Error('No pude leer MODELO_EMBEDDINGS / VERSION_VECTORES de embeddings.ts');

// Fichas estáticas: mismo análisis de texto que usa la evaluación de modelos.
const src = leer('src/lib/conocimiento.ts');
const cuerpo = src.slice(src.indexOf('export const BASE_CONOCIMIENTO'));
const fin = cuerpo.indexOf('\n];');
const trozos = cuerpo.slice(0, fin).split(/\n\s*\{\s*\n\s*claves:/).slice(1);
const fichas = trozos
  .map((t) => {
    const clavesTxt = t.match(/^\s*\[([\s\S]*?)\]\s*,\s*\n/)?.[1] ?? '';
    const claves = [...clavesTxt.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => Function(`return '${m[1]}'`)());
    const titulo = t.match(/titulo:\s*'((?:[^'\\]|\\.)*)'/)?.[1];
    const lit = t.match(/respuesta:\s*((?:\s*(?:'(?:[^'\\]|\\.)*'|`[^`]*`)\s*\+?)+)/)?.[1] ?? '';
    const respuesta = lit ? Function('return (' + lit.replace(/\+\s*$/, '') + ')')() : '';
    return { claves, titulo: titulo ? Function(`return '${titulo}'`)() : undefined, respuesta };
  })
  .filter((f) => f.titulo && f.respuesta);

console.log(`Modelo: ${MODELO}  ·  versión: ${VERSION}  ·  fichas estáticas: ${fichas.length}`);
const extractor = await pipeline('feature-extraction', MODELO, { quantized: true });

const salida = { modelo: MODELO, version: VERSION, generado: new Date().toISOString(), fichas: {} };
for (const f of fichas) {
  // MISMO texto que arma obtenerFichasParaIndexar() + indexarConocimiento().
  const indexado = `${f.titulo}. ${f.claves.join(', ')}. ${f.respuesta}`;
  const huella = `${VERSION}|${indexado}`;
  const out = await extractor('passage: ' + indexado, { pooling: 'mean', normalize: true });
  salida.fichas[f.titulo] = { huella, vector: Array.from(out.data, (x) => Math.round(x * 1e5) / 1e5) };
  console.log('  ✓', f.titulo);
}

const destino = path.join(raiz, 'src', 'data', 'vectoresFichas.json');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, JSON.stringify(salida));
console.log(`\nEscrito ${path.relative(raiz, destino)} (${(fs.statSync(destino).size / 1024).toFixed(0)} KB)`);
