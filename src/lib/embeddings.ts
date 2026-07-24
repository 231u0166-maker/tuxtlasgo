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

import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import { db } from './db';
import type { Lugar } from '../data/lugares';

const MODELO_EMBEDDINGS = 'Xenova/all-MiniLM-L6-v2';

let extractor: FeatureExtractionPipeline | null = null;
let cargando: Promise<FeatureExtractionPipeline> | null = null;

// ─────────────── CARGA DEL MODELO (lazy, una sola vez) ───────────────
export async function inicializarEmbeddings(
  onProgress?: (info: { progreso: number; texto: string }) => void
): Promise<void> {
  if (extractor) return;
  if (!cargando) {
    cargando = pipeline('feature-extraction', MODELO_EMBEDDINGS, {
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
  extractor = await cargando;
}

export function embeddingsListo(): boolean {
  return extractor !== null;
}

// ─────────────── VECTORIZACIÓN DE TEXTO ───────────────
// Exportada a propósito: conocimiento.ts la reutiliza para el "banco
// de respuestas" (búsqueda semántica sobre fichas ya redactadas) —
// mismo modelo, mismo costo (~30MB), sin duplicar nada.
export async function vectorizar(texto: string): Promise<number[]> {
  if (!extractor) throw new Error('EMBEDDINGS_NO_INICIALIZADO');
  const salida = await extractor(texto, { pooling: 'mean', normalize: true });
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
    const texto = textoDeLugar(lugar);
    const existente = await db.vectores.get(lugar.id);

    if (!existente || existente.texto !== texto) {
      const vector = await vectorizar(texto);
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
  umbralMinimo = 0.25
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
export async function indexarConocimiento(
  entradas: { clave: string; texto: string }[]
): Promise<void> {
  if (!extractor) throw new Error('EMBEDDINGS_NO_INICIALIZADO');

  for (const entrada of entradas) {
    const existente = await db.vectoresConocimiento.get(entrada.clave);
    if (existente && existente.texto === entrada.texto) continue; // sin cambios, no recalcular

    const vector = await vectorizar(entrada.texto);
    await db.vectoresConocimiento.put({
      clave: entrada.clave,
      texto: entrada.texto,
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
  umbralMinimo = 0.68
): Promise<RespuestaVerificada | null> {
  if (!extractor) return null; // degrada con gracia, igual que buscarSemantico

  const vectorConsulta = await vectorizar(query);
  const vectores = await db.vectoresConocimiento.toArray();

  let mejor: RespuestaVerificada | null = null;
  for (const v of vectores) {
    const sim = similitudCoseno(vectorConsulta, v.vector);
    if (sim >= umbralMinimo && (!mejor || sim > mejor.similitud)) {
      mejor = { titulo: v.clave, texto: v.texto, similitud: sim };
    }
  }
  return mejor;
}