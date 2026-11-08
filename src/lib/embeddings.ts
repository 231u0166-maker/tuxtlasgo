// ============================================================
// MOTOR DE MEMORIA VECTORIZADA — TuxtlasGO (100% OFFLINE)
// ============================================================
// Esto es lo que en tus notas llamabas "sqlite-vec" / "memoria
// vectorizada", pero implementado sin agregar una base de datos
// nueva: usamos el mismo IndexedDB (Dexie) que ya tiene la app,
// guardando el VECTOR de cada lugar/prestador como un campo más.
//
// ¿Por qué no sqlite-vec ni una BD nueva?
//   - Tu catálogo son decenas/cientos de prestadores, no millones
//     de filas. Un recorrido lineal calculando similitud coseno
//     sobre ese tamaño toma milisegundos — no necesitas un índice
//     ANN especializado. Agregar sqlite-wasm + una extensión nativa
//     compilada a WASM es una dependencia frágil  y pesada para lo
//     que ganarías en este tamaño de catálogo.
//   - Dexie ya persiste offline, ya está integrado, y así evitas
//     mantener DOS bases de datos locales en paralelo.
//   - Si algún día el catálogo crece a miles de prestadores (varias
//     regiones), esta capa se puede migrar a sqlite-vec sin tocar
//     el resto del motor: solo cambia dónde vive el vector.
//
// Modelo de embeddings: Xenova/all-MiniLM-L6-v2 (384 dimensiones,
// ~30MB cuantizado), corre 100% en el dispositivo vía Transformers.js
// (WASM). Se descarga una vez y Cache Storage lo deja disponible
// offline — mismo patrón que ya usas con WebLLM en llm.ts.
//
// Instalación:
//   npm i @xenova/transformers
// ============================================================

import { pipeline, env, type FeatureExtractionPipeline } from '@xenova/transformers';
import { db } from './db';
import type { Lugar } from '../data/lugares';

// Hallazgo de la prueba offline (2026-11-07): por defecto Transformers.js
// busca PRIMERO el modelo en /models/... de nuestro propio sitio. Como
// vercel.json (y Vite en local) responden index.html con código 200 a
// cualquier ruta desconocida, la librería recibía HTML, fallaba al leerlo
// como JSON, y el modelo real nunca se descargaba — dejando apagada la
// búsqueda semántica y el banco de respuestas. No alojamos el modelo
// nosotros, así que se desactiva la búsqueda local y se baja de su CDN.
env.allowLocalModels = false;

// Modelo MULTILINGÜE: multilingual-e5-small (384 dimensiones, ~113 MB
// cuantizado). Se cambió desde all-MiniLM-L6-v2, entrenado casi solo en
// inglés: en una prueba con 63 preguntas en español acertaba la ficha
// correcta 19 de 52 veces (37 %); este acierta 42-46 de 52 (81-88 %), y al
// exigir cero fichas equivocadas, 37 de 52 contra 7 de 52 (validación
// cruzada). Costo: ~5 veces más pesado que el anterior (22 MB).
// e5 pide un prefijo: "query: " para lo que escribe el turista y
// "passage: " para los textos guardados (fichas y lugares).
const MODELO_EMBEDDINGS = 'Xenova/multilingual-e5-small';

// Súbela cada vez que cambie el modelo o la forma de armar el texto que
// se vectoriza: así los vectores viejos guardados en Dexie (hechos con otro
// modelo, incompatibles) se recalculan solos en vez de compararse mal.
const VERSION_VECTORES = 'e5s-1';

// Reglas del banco de respuestas (calibradas con la prueba de 63 preguntas):
// la ficha se muestra TAL CUAL solo si es lo bastante parecida Y le gana
// con claridad a la segunda mejor. Con e5 las similitudes van de ~0.75 a
// ~0.95 (no de 0 a 1 como MiniLM), por eso el umbral es tan alto.
export const UMBRAL_BANCO = 0.84;
export const MARGEN_BANCO = 0.01;

// Este modelo pesa ~113 MB: en un teléfono con poca memoria o con "ahorro
// de datos" activado no se descarga — la app sigue con su motor de reglas.
function motivoParaNoCargarModelo(): string | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return 'EMBEDDINGS_MEMORIA_INSUFICIENTE';
  if (nav.connection?.saveData) return 'EMBEDDINGS_AHORRO_DE_DATOS';
  return null;
}

let extractor: FeatureExtractionPipeline | null = null;
let cargando: Promise<FeatureExtractionPipeline> | null = null;

// ─────────────── CARGA DEL MODELO (lazy, una sola vez) ───────────────
export async function inicializarEmbeddings(
  onProgress?: (info: { progreso: number; texto: string }) => void
): Promise<void> {
  if (extractor) return;
  const motivo = motivoParaNoCargarModelo();
  if (motivo) throw new Error(motivo);
  if (!cargando) {
    // Pide al navegador que NO borre el modelo guardado (~113 MB) cuando
    // falte espacio. Es solo una petición: puede decir que no.
    try { void navigator.storage?.persist?.(); } catch { /* no crítico */ }
    cargando = crearExtractor(onProgress).catch((e) => {
      // Hallazgo de la prueba en un Galaxy A13 (4 GB): tras recargar la
      // página, el modelo falló con "Can't create a session". Antes la
      // promesa fallida se quedaba guardada aquí y NO se volvía a intentar
      // hasta recargar de nuevo. Ahora se libera para poder reintentar.
      cargando = null;
      throw e;
    });
  }
  extractor = await cargando;
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function crearPipeline(onProgress?: (info: { progreso: number; texto: string }) => void) {
  return pipeline('feature-extraction', MODELO_EMBEDDINGS, {
    progress_callback: (p: any) => {
      if (p?.status === 'progress') {
        onProgress?.({
          progreso: (p.loaded ?? 0) / (p.total || 1),
          texto: `Descargando motor de significado… ${p.file ?? ''}`,
        });
      }
    },
  }) as unknown as Promise<FeatureExtractionPipeline>;
}

// "Can't create a session" = el runtime no pudo armar el modelo en memoria
// (poca memoria libre en ese momento) o el archivo guardado quedó dañado.
// Intento 1 normal; intento 2 tras una pausa (la memoria suele liberarse);
// intento 3 solo si hay internet: borra el modelo guardado y lo baja de
// nuevo (nunca se borra sin conexión: sería perder un modelo que podría
// estar bien).
async function crearExtractor(
  onProgress?: (info: { progreso: number; texto: string }) => void
): Promise<FeatureExtractionPipeline> {
  try {
    return await crearPipeline(onProgress);
  } catch (e1) {
    console.warn('[TuxtlasGO] Modelo: intento 1 falló, reintentando…', e1);
    fijarEstadoEmbeddings({ fase: 'descargando', detalle: 'reintentando tras un fallo (intento 2)…' });
    await esperar(2500);
    try {
      return await crearPipeline(onProgress);
    } catch (e2) {
      console.warn('[TuxtlasGO] Modelo: intento 2 falló.', e2);
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw e2;
      fijarEstadoEmbeddings({ fase: 'descargando', detalle: 'borrando el modelo guardado y descargándolo de nuevo (intento 3)…' });
      try {
        const cache = await caches.open('transformers-cache');
        for (const req of await cache.keys()) {
          if (req.url.includes('multilingual-e5-small')) await cache.delete(req);
        }
      } catch { /* sin Cache Storage: se intenta igual */ }
      await esperar(1000);
      return await crearPipeline(onProgress);
    }
  }
}

// ── Estado observable ──
// Para el panel de diagnóstico (?diag=1, ver DiagnosticoIA.tsx): permite
// saber en un celular real si el modelo se descargó, cuánto tardó o por qué
// se omitió, sin necesitar la consola del navegador.
export interface EstadoEmbeddings {
  fase: 'inactivo' | 'descargando' | 'indexando' | 'listo' | 'omitido' | 'error';
  detalle?: string;
  progreso?: number; // 0..1, solo mientras descarga
  ms?: number; // tiempo total hasta quedar listo
}
let estadoActual: EstadoEmbeddings = { fase: 'inactivo' };
const oyentes = new Set<(e: EstadoEmbeddings) => void>();
export function estadoEmbeddings(): EstadoEmbeddings {
  return estadoActual;
}
export function fijarEstadoEmbeddings(e: EstadoEmbeddings): void {
  estadoActual = e;
  oyentes.forEach((fn) => fn(e));
}
export function suscribirEstadoEmbeddings(fn: (e: EstadoEmbeddings) => void): () => void {
  oyentes.add(fn);
  return () => { oyentes.delete(fn); };
}

export function embeddingsListo(): boolean {
  return extractor !== null;
}

// ─────────────── VECTORIZACIÓN DE TEXTO ───────────────
// Exportada a propósito: conocimiento.ts la reutiliza para el "banco
// de respuestas" (búsqueda semántica sobre fichas ya redactadas) —
// mismo modelo, mismo costo (~30MB), sin duplicar nada.
export async function vectorizar(
  texto: string,
  tipo: 'consulta' | 'pasaje' = 'consulta'
): Promise<number[]> {
  if (!extractor) throw new Error('EMBEDDINGS_NO_INICIALIZADO');
  const prefijo = tipo === 'pasaje' ? 'passage: ' : 'query: ';
  const salida = await extractor(prefijo + texto, { pooling: 'mean', normalize: true });
  return Array.from(salida.data as Float32Array);
}

// ─────────────── SIMILITUD COSENO ───────────────
export function similitudCoseno(a: number[], b: number[]): number {
  let punto = 0;
  for (let i = 0; i < a.length; i++) punto += a[i] * b[i];
  return punto; // ambos vectores ya vienen normalizados (norm=1)
}

// ─────────────── TEXTO REPRESENTATIVO DE UN LUGAR ───────────────
// Entre más rico este texto, mejor entiende el motor consultas libres
// como "algo tranquilo y barato para ir con mi pareja" sin que el
// turista tenga que usar las palabras exactas del catálogo.
function textoDeLugar(l: Lugar): string {
  return [
    l.nombre,
    l.categoria,
    l.municipio,
    l.descripcion,
    l.tags.join(' '),
    l.ideal.join(' '),
  ]
    .filter(Boolean)
    .join('. ');
}

// ─────────────── INDEXADO / CACHÉ EN DEXIE ───────────────
// Recalcula el vector SOLO si el lugar es nuevo o su texto cambió
// (comparando contra el snapshot guardado). Esto es lo que resuelve
// tu queja de "la base de datos no crece": cada prestador nuevo que
// se aprueba se indexa automáticamente la próxima vez que se llama
// esta función (llámala tras aprobar un prestador y al iniciar la app).
export async function indexarCatalogo(
  catalogo: Lugar[],
  onProgress?: (hechos: number, total: number) => void
): Promise<void> {
  if (!extractor) throw new Error('EMBEDDINGS_NO_INICIALIZADO');

  let hechos = 0;
  for (const lugar of catalogo) {
    // La versión va pegada al texto guardado: si cambia el modelo, el
    // texto "cambia" y el vector se recalcula.
    const texto = `${VERSION_VECTORES}|${textoDeLugar(lugar)}`;
    const existente = await db.vectores.get(lugar.id);

    if (!existente || existente.texto !== texto) {
      const vector = await vectorizar(textoDeLugar(lugar), 'pasaje');
      await db.vectores.put({
        id: lugar.id,
        texto,
        vector,
        actualizadoEn: Date.now(),
      });
    }
    hechos++;
    onProgress?.(hechos, catalogo.length);
  }

  // Limpieza: borra vectores de lugares que ya no existen en el catálogo
  // (p. ej. un prestador rechazado o eliminado).
  const idsVigentes = new Set(catalogo.map((l) => l.id));
  const todos = await db.vectores.toArray();
  const obsoletos = todos.filter((v) => !idsVigentes.has(v.id));
  if (obsoletos.length > 0) {
    await db.vectores.bulkDelete(obsoletos.map((v) => v.id));
  }
}

// ─────────────── BÚSQUEDA SEMÁNTICA ───────────────
export interface ResultadoSemantico {
  lugar: Lugar;
  similitud: number; // 0..1, más alto = más parecido
}

// Devuelve los k lugares más parecidos EN SIGNIFICADO a la consulta,
// aunque no compartan ni una sola palabra literal con el catálogo.
// Esto complementa (no reemplaza) el motor de reglas por palabras
// clave: úsalos juntos — ver mezclarRecuperacion() en llm.ts.
export async function buscarSemantico(
  query: string,
  catalogo: Lugar[],
  k = 6,
  // Con e5 las similitudes nunca bajan de ~0.75, así que el 0.25 de
  // MiniLM ya no filtraba nada. 0.80 es un valor prudente, pero NO está
  // calibrado con una prueba propia (solo el banco de respuestas y las
  // preferencias lo están) — aquí solo arma candidatos para el generador.
  umbralMinimo = 0.8
): Promise<ResultadoSemantico[]> {
  if (!extractor) return []; // degrada con gracia si el modelo no cargó

  const vectorConsulta = await vectorizar(query);
  const mapaLugares = new Map(catalogo.map((l) => [l.id, l]));

  const vectores = await db.vectores.toArray();
  const resultados: ResultadoSemantico[] = [];

  for (const v of vectores) {
    const lugar = mapaLugares.get(v.id);
    if (!lugar) continue; // vector huérfano (no está en el catálogo activo)
    const sim = similitudCoseno(vectorConsulta, v.vector);
    if (sim >= umbralMinimo) resultados.push({ lugar, similitud: sim });
  }

  return resultados.sort((a, b) => b.similitud - a.similitud).slice(0, k);
}

// ============================================================
// BANCO DE RESPUESTAS — búsqueda semántica sobre conocimiento.ts
// ============================================================
// Mismo mecanismo exacto que buscarSemantico() de arriba, pero sobre
// las fichas ya redactadas del banco de conocimiento (estáticas +
// dinámicas del panel de admin) en vez de los lugares del catálogo.
// Esto es lo que permite responder con texto YA VERIFICADO por una
// persona, sin generar nada — cero riesgo de alucinación, y funciona
// en cualquier dispositivo (32 o 64 bits) porque es el mismo modelo
// de 30MB que ya corre para el catálogo.
//
// El umbral aquí es MÁS ALTO que en buscarSemantico (0.68 vs 0.25) a
// propósito: ahí solo se arman candidatos para dárselos de contexto a
// un generador (que igual puede descartarlos). Aquí, si se supera el
// umbral, la respuesta se muestra TAL CUAL al turista sin pasar por
// ningún generador — hace falta más confianza para eso.
export interface RespuestaVerificada {
  titulo: string;
  texto: string;
  similitud: number;
}

// Recalcula el vector de cada ficha SOLO si es nueva o su texto de
// respuesta cambió — mismo patrón de caché que indexarCatalogo().
// Llamar al iniciar la app y cada vez que se agregue una ficha nueva
// desde el panel de admin (ver agregarConocimientoDinamico en
// conocimiento.ts, que ya recarga la copia local — falta encadenar
// esta reindexación ahí).
// `texto` es lo que se le MUESTRA al turista (la respuesta); `indexado` es lo
// que se VECTORIZA (título + palabras clave + respuesta). Vectorizar solo la
// respuesta acertaba bastante menos: con el modelo anterior 26 vs 19 de 52,
// con el actual 46 vs 42 de 52 (las palabras clave ayudan a casar preguntas
// escritas de otra forma). Sin `indexado` se vectoriza `texto`.
export async function indexarConocimiento(
  entradas: { clave: string; texto: string; indexado?: string }[]
): Promise<void> {
  if (!extractor) throw new Error('EMBEDDINGS_NO_INICIALIZADO');

  for (const entrada of entradas) {
    const paraVectorizar = entrada.indexado ?? entrada.texto;
    const huella = `${VERSION_VECTORES}|${paraVectorizar}`;
    const existente = await db.vectoresConocimiento.get(entrada.clave);
    if (existente && existente.huella === huella && existente.texto === entrada.texto) continue; // sin cambios

    const vector = await vectorizar(paraVectorizar, 'pasaje');
    await db.vectoresConocimiento.put({
      clave: entrada.clave,
      texto: entrada.texto,
      huella,
      vector,
      actualizadoEn: Date.now(),
    });
  }

  // Limpieza: borra vectores de fichas que ya no existen (se
  // desactivó una ficha dinámica, o se quitó una estática).
  const clavesVigentes = new Set(entradas.map((e) => e.clave));
  const todos = await db.vectoresConocimiento.toArray();
  const obsoletos = todos.filter((v) => !clavesVigentes.has(v.clave));
  if (obsoletos.length > 0) {
    await db.vectoresConocimiento.bulkDelete(obsoletos.map((v) => v.clave));
  }
}

// Busca la ficha del banco de respuestas más parecida EN SIGNIFICADO
// a la pregunta del turista. Devuelve null si no hay ninguna con
// suficiente confianza (umbral 0.68 por default) — en ese caso, quien
// llama debe caer al generador normal (local/nube/reglas), no inventar
// nada aquí.
export async function buscarRespuestaVerificada(
  query: string,
  umbralMinimo = UMBRAL_BANCO,
  margenMinimo = MARGEN_BANCO
): Promise<RespuestaVerificada | null> {
  if (!extractor) return null; // degrada con gracia, igual que buscarSemantico

  const vectorConsulta = await vectorizar(query);
  const vectores = await db.vectoresConocimiento.toArray();

  let mejor: RespuestaVerificada | null = null;
  let segundaSim = -1;
  for (const v of vectores) {
    const sim = similitudCoseno(vectorConsulta, v.vector);
    if (!mejor || sim > mejor.similitud) {
      if (mejor) segundaSim = Math.max(segundaSim, mejor.similitud);
      mejor = { titulo: v.clave, texto: v.texto, similitud: sim };
    } else {
      segundaSim = Math.max(segundaSim, sim);
    }
  }
  if (!mejor || mejor.similitud < umbralMinimo) return null;
  // Si la segunda ficha casi empata, no hay confianza de cuál es la buena.
  if (segundaSim >= 0 && mejor.similitud - segundaSim < margenMinimo) return null;
  return mejor;
}