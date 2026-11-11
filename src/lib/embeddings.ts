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

// Import dinámico (ver crearPipeline): la librería pesa cientos de KiB y solo se
// necesita cuando el modelo arranca, no al abrir la app.
import type { FeatureExtractionPipeline } from '@xenova/transformers';
import { db } from './db';
import vectoresPrecalculados from '../data/vectoresFichas.json';
import type { Lugar } from '../data/lugares';

// Hallazgo de la prueba offline (2026-11-07): por defecto Transformers.js
// busca PRIMERO el modelo en /models/... de nuestro propio sitio. Como
// vercel.json (y Vite en local) responden index.html con código 200 a
// cualquier ruta desconocida, la librería recibía HTML, fallaba al leerlo
// como JSON, y el modelo real nunca se descargaba — dejando apagada la
// búsqueda semántica y el banco de respuestas. No alojamos el modelo
// nosotros, así que se desactiva la búsqueda local y se baja de su CDN.

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

// Reglas del banco de respuestas: la ficha se muestra TAL CUAL solo si es lo
// bastante parecida Y le gana con claridad a la segunda mejor. Calibradas con
// 93 preguntas (74 con ficha + 19 fuera de tema, escritas por el equipo, no por
// turistas reales): con esta regla 43 de 74 se contestan bien y 0 mal; con
// validación cruzada, ~60 % bien y ~1 respuesta equivocada por cada 100
// preguntas. Lo que no pasa la regla NO se pierde: cae al motor de reglas.
// Con e5 las similitudes van de ~0.75 a ~0.95 (no de 0 a 1 como MiniLM), y pesa
// más el MARGEN contra la segunda ficha que la similitud absoluta (la regla
// anterior, 0.84 y 0.01, dejó pasar "¿qué hora es en Tokio?" como horarios).
export const UMBRAL_BANCO = 0.82;
export const MARGEN_BANCO = 0.02;

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

async function crearPipeline(onProgress?: (info: { progreso: number; texto: string }) => void) {
  const { pipeline, env } = await import('@xenova/transformers');
  // Sin esto la librería busca el modelo en nuestro servidor y recibe el index.html del SPA (ver nota arriba).
  env.allowLocalModels = false;
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

// ─────────── Carga robusta del modelo ───────────
// Hallazgo de la prueba en un Galaxy A13 (4 GB): al RECARGAR la página el modelo
// a veces falla con "Can't create a session", de forma intermitente (con y sin
// internet, con 10 pestañas y con 1). Esa frase significa que el runtime no pudo
// armar el modelo en memoria. Causas posibles: (a) poca memoria en ese instante
// — por ejemplo la página anterior todavía liberando la suya — o (b) el archivo
// guardado dañado. NO es un problema de red: el archivo ya se leyó.
//
// Mi versión anterior, ante cualquier fallo con internet, BORRABA el modelo y lo
// descargaba otra vez (113 MB). Si la causa es memoria eso no arregla nada y
// gasta los datos del turista en cada recarga fallida. Ahora solo se vuelve a
// descargar con evidencia de archivo dañado, y cada intento queda anotado en el
// panel de diagnóstico (`registroCarga`).
export const registroCarga: string[] = [];
function anotar(mensaje: string): void {
  const hora = new Date().toLocaleTimeString('es-MX', { hour12: false });
  registroCarga.push(`${hora} ${mensaje}`);
  while (registroCarga.length > 14) registroCarga.shift();
  fijarEstadoEmbeddings({ ...estadoActual }); // para que el panel se redibuje
}

// Para que App.tsx deje constancia en el panel de diagnóstico de decisiones suyas
// (por ejemplo, haber diferido el arranque por ser una recarga).
export function anotarCarga(mensaje: string): void {
  anotar(mensaje);
}

const CLAVE_TAM_MODELO = 'tuxtlasgo-modelo-bytes';

// Tamaño (bytes) del .onnx guardado, leído del encabezado — sin cargar los 113 MB.
export async function tamanoModeloEnCache(): Promise<number | null> {
  try {
    const cache = await caches.open('transformers-cache');
    for (const req of await cache.keys()) {
      if (req.url.includes('multilingual-e5-small') && req.url.includes('.onnx')) {
        const longitud = (await cache.match(req))?.headers.get('content-length');
        return longitud ? parseInt(longitud, 10) : null;
      }
    }
  } catch { /* sin Cache Storage */ }
  return null;
}
export function tamanoModeloEsperado(): number | null {
  try {
    const v = localStorage.getItem(CLAVE_TAM_MODELO);
    return v ? parseInt(v, 10) : null;
  } catch { return null; }
}
async function recordarTamanoModelo(): Promise<void> {
  const t = await tamanoModeloEnCache();
  if (t) { try { localStorage.setItem(CLAVE_TAM_MODELO, String(t)); } catch { /* no crítico */ } }
}

// SOLO para pruebas, y solo con el panel de diagnóstico activo (?diag=1):
// localStorage 'tuxtlasgo-diag-forzar-fallo' = 'memoria:2' o 'modelo:2' hace que
// los próximos 2 intentos fallen como si fueran de ese tipo. Sirve para probar
// la lógica de reintento sin esperar a que el teléfono falle solo.
function falloForzado(): 'memoria' | 'modelo' | null {
  try {
    if (localStorage.getItem('tuxtlasgo-diag') !== '1') return null;
    const v = localStorage.getItem('tuxtlasgo-diag-forzar-fallo');
    if (!v) return null;
    const [tipo, n] = v.split(':');
    const restantes = parseInt(n, 10);
    if (!(restantes > 0)) { localStorage.removeItem('tuxtlasgo-diag-forzar-fallo'); return null; }
    if (restantes > 1) localStorage.setItem('tuxtlasgo-diag-forzar-fallo', `${tipo}:${restantes - 1}`);
    else localStorage.removeItem('tuxtlasgo-diag-forzar-fallo');
    return tipo === 'modelo' ? 'modelo' : 'memoria';
  } catch { return null; }
}

type IntentoFallido = { ok: false; error: unknown; mensajes: string[] };
type Intento = { ok: true; extractor: FeatureExtractionPipeline } | IntentoFallido;

// Un intento, capturando los mensajes que el runtime imprime en consola
// (ahí aparece la causa real: "bad_alloc", "protobuf parsing failed"…).
async function intentarCrear(
  onProgress?: (info: { progreso: number; texto: string }) => void
): Promise<Intento> {
  const mensajes: string[] = [];
  const errorOriginal = console.error;
  const avisoOriginal = console.warn;
  const capturar = (args: unknown[]) => {
    const t = args.map((a) => String(a)).join(' ');
    if (/onnx|alloc|memory|protobuf|session|wasm|model/i.test(t)) mensajes.push(t.slice(0, 200));
  };
  console.error = (...a: unknown[]) => { capturar(a); errorOriginal(...a); };
  console.warn = (...a: unknown[]) => { capturar(a); avisoOriginal(...a); };
  try {
    const forzado = falloForzado();
    if (forzado) {
      mensajes.push(forzado === 'memoria' ? 'simulado: std::bad_alloc' : 'simulado: Protobuf parsing failed');
      throw new Error("Can't create a session");
    }
    return { ok: true, extractor: await crearPipeline(onProgress) };
  } catch (error) {
    return { ok: false, error, mensajes };
  } finally {
    console.error = errorOriginal;
    console.warn = avisoOriginal;
  }
}

function clasificarFallo(r: IntentoFallido): 'memoria' | 'modelo' | 'desconocido' {
  const t = `${String((r.error as Error)?.message ?? r.error)} ${r.mensajes.join(' ')}`.toLowerCase();
  if (/bad_alloc|out of memory|alloc|memoria/.test(t)) return 'memoria';
  if (/protobuf|parsing|corrupt|invalid|not a valid|failed to load model/.test(t)) return 'modelo';
  return 'desconocido';
}

function mensajeDe(r: IntentoFallido): string {
  return (r.mensajes[r.mensajes.length - 1] ?? String((r.error as Error)?.message ?? r.error)).slice(0, 110);
}

async function crearExtractor(
  onProgress?: (info: { progreso: number; texto: string }) => void
): Promise<FeatureExtractionPipeline> {
  let ultimo: IntentoFallido | null = null;
  // Prueba en un Galaxy A13: el primer intento falló con "std::bad_alloc" (falta
  // de memoria) y el segundo, 4 s después, con el mensaje genérico — la memoria
  // aún no se había liberado. Se espera más entre intentos (10 s y 30 s) y hay un
  // tercero: son segundos en segundo plano; el chat sigue con las reglas.
  const ESPERA_ANTES_DEL_INTENTO = [0, 10_000, 30_000];
  for (let n = 1; n <= ESPERA_ANTES_DEL_INTENTO.length; n++) {
    if (n > 1) {
      fijarEstadoEmbeddings({ fase: 'descargando', detalle: `reintentando (intento ${n}) en ${ESPERA_ANTES_DEL_INTENTO[n - 1] / 1000} s…` });
      await esperar(ESPERA_ANTES_DEL_INTENTO[n - 1]); // da tiempo a liberar memoria
    }
    const r = await intentarCrear(onProgress);
    if (r.ok) {
      await recordarTamanoModelo();
      if (n > 1) anotar(`modelo listo en el intento ${n}`);
      return r.extractor;
    }
    ultimo = r;
    anotar(`intento ${n} falló (${clasificarFallo(r)}): ${mensajeDe(r)}`);
  }

  // Los dos intentos fallaron. ¿Hay evidencia de que el archivo guardado está dañado?
  const tipo = clasificarFallo(ultimo!);
  const esperado = tamanoModeloEsperado();
  const actual = await tamanoModeloEnCache();
  const tamanoRaro = esperado !== null && actual !== null && esperado !== actual;
  const enLinea = typeof navigator === 'undefined' || navigator.onLine !== false;

  if (enLinea && (tipo === 'modelo' || tamanoRaro)) {
    anotar(tamanoRaro ? 'el modelo guardado mide distinto al instalado → se descarga de nuevo' : 'el modelo guardado parece dañado → se descarga de nuevo');
    fijarEstadoEmbeddings({ fase: 'descargando', detalle: 'el modelo guardado parece dañado: descargándolo de nuevo…' });
    try {
      const cache = await caches.open('transformers-cache');
      for (const req of await cache.keys()) {
        if (req.url.includes('multilingual-e5-small')) await cache.delete(req);
      }
    } catch { /* sin Cache Storage: se intenta igual */ }
    await esperar(1000);
    const r = await intentarCrear(onProgress);
    if (r.ok) {
      await recordarTamanoModelo();
      anotar('modelo listo tras descargarlo de nuevo');
      return r.extractor;
    }
    ultimo = r;
    anotar(`falló también tras descargarlo de nuevo: ${mensajeDe(r)}`);
  } else {
    anotar(
      tipo === 'memoria'
        ? 'parece falta de memoria: NO se vuelve a descargar (no ayudaría y gastaría datos); se reintentará más tarde'
        : 'sin evidencia de archivo dañado: no se vuelve a descargar; se reintentará más tarde'
    );
  }
  const resumen = `${String((ultimo!.error as Error)?.message ?? ultimo!.error)} [${clasificarFallo(ultimo!)}]`;
  throw new Error(resumen.slice(0, 200));
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
// Cuántas fichas usaron su vector precalculado (instantáneo) y cuántas hubo
// que calcular en este dispositivo (lento en teléfonos de gama baja).
export const conteoFichas = { precalculadas: 0, calculadasAqui: 0 };

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
    .join('. ')
    // Tope: las descripciones de algunos prestadores son larguísimas y en un
    // teléfono de gama baja cada vector cuesta segundos. Lo que distingue a un
    // lugar está al principio (nombre, categoría, municipio, descripción).
    .slice(0, 500);
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

  const precalculadas = (vectoresPrecalculados as { fichas: Record<string, { huella: string; vector: number[] }> }).fichas;
  for (const entrada of entradas) {
    const paraVectorizar = entrada.indexado ?? entrada.texto;
    const huella = `${VERSION_VECTORES}|${paraVectorizar}`;
    const existente = await db.vectoresConocimiento.get(entrada.clave);
    if (existente && existente.huella === huella && existente.texto === entrada.texto) continue; // sin cambios

    // Vector ya calculado al desplegar (npm run vectores): solo se usa si su
    // huella coincide con ESTA ficha tal como está hoy; si alguien editó la
    // ficha y no regeneró el archivo, se recalcula aquí (más lento, correcto).
    const pre = precalculadas[entrada.clave];
    let vector: number[];
    if (pre && pre.huella === huella) {
      vector = pre.vector;
      conteoFichas.precalculadas++;
    } else {
      vector = await vectorizar(paraVectorizar, 'pasaje');
      conteoFichas.calculadasAqui++;
    }
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