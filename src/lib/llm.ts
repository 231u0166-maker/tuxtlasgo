// ============================================================
// MOTOR LLM OFFLINE — TuxtlasGO (capa de GENERACIÓN del RAG)
// ============================================================
// Corre un LLM cuantizado 100% en el dispositivo vía WebLLM
// (WebGPU con fallback a WASM). El modelo SOLO redacta: los datos
// (lugares, precios, horarios) los aporta tu motor de reglas ya
// existente, que actúa como capa de RECUPERACIÓN. Así el LLM nunca
// inventa precios ni horarios de prestadores reales.
//
//   Recuperación  ──►  tu motor (scoring + conocimiento + catálogo)
//   Generación    ──►  este módulo (LLM redacta en español natural)
//
// Instalación:
//   npm i @mlc-ai/web-llm
// ============================================================

import * as webllm from '@mlc-ai/web-llm';
import { Lugar } from '../data/lugares';
import {
  getCatalogoActivo,
  detectarIntent,
  detectarMunicipio,
  type MensajeChat,
  type PreferenciasUsuario,
} from './chatbot';
import { buscarConocimiento } from './conocimiento';
import { buscarSemantico, embeddingsListo } from './embeddings';

// ─────────────── CONFIGURACIÓN DE MODELO ───────────────
// Default: ligero y rápido en gama media (~0.8 GB).
// Upgrade para mejor español si el dispositivo aguanta:
//   'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'  (~1.0 GB)
//   'Llama-3.2-3B-Instruct-q4f16_1-MLC'  (~1.7 GB, mejor calidad)
// NO usar modelos de razonamiento (R1-Distill / modos "thinking").
export const MODELO_DEFECTO = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

let engine: webllm.MLCEngineInterface | null = null;
let modeloCargado: string | null = null;

// ─────────────── DETECCIÓN DE CAPACIDAD ───────────────
// `'gpu' in navigator` NO es suficiente: en muchas laptops (sobre todo
// con gráficos Intel integrados en Windows) el objeto navigator.gpu
// existe, pero requestAdapter() devuelve null porque el driver está
// en la lista de bloqueo de Chrome. Si solo revisas la presencia del
// objeto, la app cree que sí hay soporte, intenta cargar el modelo,
// truena, y cae al motor de reglas SIN avisar por qué — que es
// exactamente el síntoma de "en PC no arranca" que se reportó en
// campo. Por eso este chequeo es real: pide el adaptador de verdad.
let cacheSoporte: boolean | null = null;

export async function soportaWebGPU(): Promise<boolean> {
  if (cacheSoporte !== null) return cacheSoporte;
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    cacheSoporte = false;
    return false;
  }
  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    cacheSoporte = adapter !== null;
    return cacheSoporte;
  } catch {
    cacheSoporte = false;
    return false;
  }
}

export function llmListo(): boolean {
  return engine !== null;
}

// ─────────────── CARGA DEL MODELO ───────────────
// Llamar una sola vez (idealmente con WiFi). WebLLM cachea el
// modelo en Cache Storage, así que las siguientes veces es
// instantáneo y funciona offline.
export async function inicializarLLM(
  onProgress?: (info: { progreso: number; texto: string }) => void,
  modelo: string = MODELO_DEFECTO
): Promise<void> {
  if (engine && modeloCargado === modelo) return;

  if (!(await soportaWebGPU())) {
    throw new Error('SIN_WEBGPU');
  }

  try {
    engine = await webllm.CreateMLCEngine(modelo, {
      initProgressCallback: (rep: webllm.InitProgressReport) => {
        onProgress?.({ progreso: rep.progress ?? 0, texto: rep.text ?? '' });
      },
    });
    modeloCargado = modelo;
  } catch (e) {
    // No tragarse el error real: esto es lo que hay que ver en consola
    // para diagnosticar por qué falló en un dispositivo específico
    // (memoria insuficiente, adaptador perdido a medio arranque, etc.)
    console.error('[TuxtlasGO IA] CreateMLCEngine falló:', e);
    throw e;
  }
}

// ============================================================
// RECUPERACIÓN — reutiliza tu motor de reglas como "retriever"
// ============================================================
interface ContextoRecuperado {
  lugares: Lugar[];
  conocimiento: string | null;
}

const MAPA_INTENT_CAT: Record<string, Lugar['categoria']> = {
  comida: 'Gastronomia',
  hospedaje: 'Hospedaje',
  naturaleza: 'Naturaleza',
  aventura: 'Aventura',
};

// Orden final de candidatos: rating + pequeño empate a favor de Premium.
// Mismo criterio que chatbot.ts (filtrarLugaresConRazones), aplicado
// aquí también para que el modo LLM y el modo sin-LLM recomienden con
// la misma lógica de negocio.
function ordenarConBoostPremium(lugares: Lugar[]): Lugar[] {
  return [...lugares].sort((a, b) => {
    const scoreA = a.rating + (a.premium ? 0.4 : 0);
    const scoreB = b.rating + (b.premium ? 0.4 : 0);
    return scoreB - scoreA;
  });
}

async function recuperarContexto(
  texto: string,
  prefs?: Partial<PreferenciasUsuario>,
  k = 4
): Promise<ContextoRecuperado> {
  const catalogo = getCatalogoActivo();
  const intent = detectarIntent(texto);
  const municipio = detectarMunicipio(texto);
  const cat = MAPA_INTENT_CAT[intent];

  let candidatos = catalogo;

  // 1) Filtro por categoría detectada en la pregunta
  if (cat) {
    candidatos = candidatos.filter((l) => l.categoria === cat);
  }
  // 2) Si no hubo categoría en la pregunta pero el turista declaró
  //    intereses en el flujo guiado, úsalos para acotar.
  else if (prefs?.intereses && prefs.intereses.length > 0) {
    const enIntereses = candidatos.filter((l) =>
      prefs.intereses!.includes(l.categoria)
    );
    if (enIntereses.length > 0) candidatos = enIntereses;
  }

  // 3) Filtro por municipio si lo mencionó y hay resultados
  if (municipio) {
    const enMuni = candidatos.filter((l) => l.municipio === municipio);
    if (enMuni.length > 0) candidatos = enMuni;
  }

  // 4) HÍBRIDO — si el filtro por palabras clave se quedó corto (o el
  //    turista escribió algo que no matchea ningún intent/keyword,
  //    p. ej. "algo tranquilo y barato para el fin de semana"), se
  //    complementa con búsqueda SEMÁNTICA sobre el texto libre. Esto
  //    es lo que hace que el motor "no siempre diga lo mismo" y
  //    escale automáticamente con prestadores nuevos sin necesidad de
  //    curar palabras clave a mano por cada registro.
  if (candidatos.length < k && embeddingsListo()) {
    const semanticos = await buscarSemantico(texto, catalogo, k * 2);
    const idsYaIncluidos = new Set(candidatos.map((l) => l.id));
    for (const { lugar } of semanticos) {
      if (!idsYaIncluidos.has(lugar.id)) {
        candidatos = [...candidatos, lugar];
        idsYaIncluidos.add(lugar.id);
      }
    }
  }

  // 5) Si aun así quedó vacío, cae a lo destacado / mejor valorado
  if (candidatos.length === 0) {
    candidatos = catalogo.filter((l) => l.destacado || l.rating >= 4.5);
  }

  const lugares = ordenarConBoostPremium(candidatos).slice(0, k);

  const hit = buscarConocimiento(texto);
  const conocimiento = hit ? hit.respuesta : null;

  return { lugares, conocimiento };
}

// ─────────────── ARMADO DEL CONTEXTO PARA EL PROMPT ───────────────
function lugarAFicha(l: Lugar): string {
  const partes = [
    `- ${l.nombre}${l.premium ? ' [Socio Premium TuxtlasGO]' : ''} (${l.categoria}, ${l.municipio})`,
    `  ${l.descripcionCorta}`,
    `  Precio: ${l.precioMxn} · Horario: ${l.abierto.dias} ${l.abierto.horario}`,
    l.tip ? `  Tip: ${l.tip}` : '',
    l.comoLlegar ? `  Cómo llegar: ${l.comoLlegar}` : '',
  ];
  return partes.filter(Boolean).join('\n');
}

function prefsATexto(prefs?: Partial<PreferenciasUsuario>): string | null {
  if (!prefs) return null;
  const p: string[] = [];
  if (prefs.dias) p.push(`${prefs.dias} día(s) de viaje`);
  if (prefs.intereses?.length) p.push(`intereses: ${prefs.intereses.join(', ')}`);
  if (prefs.presupuesto) p.push(`presupuesto ${prefs.presupuesto}`);
  if (prefs.grupo) p.push(`viaja: ${prefs.grupo}`);
  return p.length ? p.join(' · ') : null;
}

function construirContextoTexto(
  ctx: ContextoRecuperado,
  prefs?: Partial<PreferenciasUsuario>
): string {
  const bloques: string[] = [];

  const prefsTxt = prefsATexto(prefs);
  if (prefsTxt) bloques.push('PERFIL DEL TURISTA:\n' + prefsTxt);

  if (ctx.lugares.length > 0) {
    bloques.push(
      'LUGARES DISPONIBLES (usa SOLO estos):\n' +
        ctx.lugares.map(lugarAFicha).join('\n\n')
    );
  }
  if (ctx.conocimiento) {
    bloques.push('DATO VERIFICADO:\n' + ctx.conocimiento);
  }
  return (
    bloques.join('\n\n') || 'No hay lugares que coincidan con la consulta.'
  );
}

// ─────────────── PROMPT DEL SISTEMA (la "correa corta") ───────────────
const SYSTEM_PROMPT = `Eres la guía local de TuxtlasGO, una app turística de la región de Los Tuxtlas, Veracruz (Catemaco, San Andrés Tuxtla y Santiago Tuxtla).

REGLAS ESTRICTAS:
- Responde SIEMPRE en español, cálido y breve (máximo 4-5 frases).
- Escribe en texto plano. NO uses markdown, ni asteriscos, ni almohadillas, ni viñetas con símbolos.
- Usa ÚNICAMENTE la información del CONTEXTO. NUNCA inventes lugares, precios, horarios ni contactos.
- Si mencionas lugares, usa su nombre EXACTO tal como aparece en el contexto.
- Si el turista pide algo que no está en el contexto, dilo con honestidad y ofrece lo que sí hay.
- No des información médica, legal ni de seguridad que no esté en el contexto.`;

// ─────────────── LIMPIEZA DE MARKDOWN (por si el modelo resbala) ───────────────
export function limpiarMarkdown(t: string): string {
  return t
    .replace(/\*+/g, '')      // quita ** y *
    .replace(/`+/g, '')       // quita backticks
    .replace(/^#{1,6}\s+/gm, '') // quita encabezados markdown
    .replace(/^\s*[-•]\s+/gm, '• '); // normaliza viñetas
}

// ─────────────── ARMADO COMPARTIDO DE MENSAJES ───────────────
// Tanto el LLM local (WebLLM) como el de respaldo en la nube parten
// del MISMO retriever y del MISMO prompt de sistema — lo único que
// cambia entre uno y otro es quién redacta la respuesta final. Esto
// garantiza que las reglas de negocio (boost Premium, "no inventes
// datos", tono) sean idénticas sin importar qué generador responda.
interface MensajesLLM {
  system: string;
  mensajes: { role: 'user' | 'assistant'; content: string }[];
}

async function armarMensajesLLM(
  texto: string,
  historial: MensajeChat[],
  prefs?: Partial<PreferenciasUsuario>
): Promise<MensajesLLM> {
  const ctx = await recuperarContexto(texto, prefs);
  const contextoTexto = construirContextoTexto(ctx, prefs);

  // Historial reciente SOLO de mensajes de texto (sin bloques de
  // ruta/lugares/opciones, que saturan el contexto de un modelo chico)
  const historialReciente = historial
    .filter(
      (m) => !m.rutaDia && !m.lugares && !m.opciones && m.texto.trim().length > 0
    )
    .slice(-6)
    .map((m) => ({
      role: (m.role === 'bot' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.texto,
    }));

  return {
    system: SYSTEM_PROMPT,
    mensajes: [
      ...historialReciente,
      {
        role: 'user' as const,
        content: `CONTEXTO:\n${contextoTexto}\n\nPREGUNTA DEL TURISTA: ${texto}`,
      },
    ],
  };
}

// ─────────────── GENERACIÓN (streaming, offline) ───────────────
export async function* responderConLLMStream(
  texto: string,
  historial: MensajeChat[] = [],
  prefs?: Partial<PreferenciasUsuario>
): AsyncGenerator<string, void, unknown> {
  if (!engine) throw new Error('LLM_NO_INICIALIZADO');

  const { system, mensajes } = await armarMensajesLLM(texto, historial, prefs);

  const messages: webllm.ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
    ...mensajes,
  ];

  const stream = await engine.chat.completions.create({
    messages,
    temperature: 0.3, // bajo = se apega al contexto, menos alucinación
    max_tokens: 350,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (delta) yield delta;
  }
}

// ─────────────── VERSIÓN NO-STREAMING (conveniencia) ───────────────
export async function responderConLLM(
  texto: string,
  historial: MensajeChat[] = [],
  prefs?: Partial<PreferenciasUsuario>
): Promise<string> {
  let salida = '';
  for await (const frag of responderConLLMStream(texto, historial, prefs)) {
    salida += frag;
  }
  return limpiarMarkdown(salida);
}

// ============================================================
// GENERACIÓN EN LA NUBE — respaldo cuando NO hay WebGPU usable
// ============================================================
// Se activa cuando soportaWebGPU() da false pero hay conexión a
// internet: exactamente el caso de una PC de escritorio con GPU
// bloqueada por Chrome (el que se detectó en pruebas de campo).
// A propósito NO se usa window.ai/Gemini Nano (depende de flags
// experimentales de Chrome que no controlas en el dispositivo del
// usuario) — en su lugar, un endpoint propio en /api/ia/chat que
// llama a un modelo en la nube con el MISMO contexto recuperado.
// Así "cualquier dispositivo" deja de depender de tener WebGPU:
// WebGPU → offline local. Sin WebGPU + internet → nube. Ninguno
// de los dos → motor de reglas (ver chatbot.ts).
export function nubeDisponible(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

export async function responderConNube(
  texto: string,
  historial: MensajeChat[] = [],
  prefs?: Partial<PreferenciasUsuario>
): Promise<string> {
  const { system, mensajes } = await armarMensajesLLM(texto, historial, prefs);

  // navigator.onLine puede decir "true" aunque no haya internet real de
  // verdad (portal cautivo de un WiFi de hotel, señal celular que se cae
  // a medio handshake) — sin un tope de tiempo, un fetch así se puede
  // quedar colgado mucho más de lo que un chat puede esperar. Mismo
  // principio que el timeout del LLM local: mejor caer rápido a reglas
  // que dejar al usuario esperando una conexión que no va a llegar.
  const control = new AbortController();
  const avisoTiempo = setTimeout(() => control.abort(), 15_000);

  try {
    const r = await fetch('/api/ia/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt: system, mensajes }),
      signal: control.signal,
    });

    if (!r.ok) {
      const detalle = await r.text().catch(() => '');
      throw new Error(`IA_NUBE_ERROR ${r.status}: ${detalle}`);
    }
    const data = await r.json();
    if (!data.texto) throw new Error('IA_NUBE_RESPUESTA_VACIA');
    return limpiarMarkdown(data.texto);
  } finally {
    clearTimeout(avisoTiempo);
  }
}

// ─────────────── LIMPIEZA ───────────────
export async function descargarLLM(): Promise<void> {
  if (engine) {
    await engine.unload();
    engine = null;
    modeloCargado = null;
  }
}
