// ============================================================
// MOTOR DE GENERACIÓN — TuxtlasGO (nube + contexto + validación)
// ============================================================
// DECISIÓN DE ARQUITECTURA (retirado el LLM local en navegador):
// se probó WebLLM corriendo en el dispositivo del turista durante
// varias sesiones de pruebas de campo reales, y falló de forma
// consistente en TODOS los celulares de prueba disponibles —
// primero por el techo de memoria de WebAssembly en Android Chrome
// (~256-300MB), y después, incluso cambiando de tecnología de
// almacenamiento (Cache Storage, IndexedDB, OPFS) y de tamaño de
// modelo (1.5B, luego 0.5B), con "RangeError: Array buffer
// allocation failed" — ya no era un problema de código, era que esos
// dispositivos no tienen memoria suficiente para esto, punto.
//
// En vez de seguir ofreciendo una descarga que casi nunca funciona
// (y que en el peor caso llegó a tirar la pestaña completa), este
// módulo se simplificó a la arquitectura que SÍ demostró funcionar en
// cualquier dispositivo, sin excepción:
//
//   Recuperación  ──►  chatbot.ts + conocimiento.ts + embeddings.ts
//   Generación    ──►  banco de respuestas (ver embeddings.ts) →
//                       nube (este módulo) → motor de reglas
//
// Este archivo YA NO exporta soportaWebGPU/inicializarLLM/
// responderConLLMStream — si en el futuro alguien consigue confirmar
// un dispositivo real de 64 bits con memoria de sobra donde SÍ valga
// la pena reintentarlo, esa es una decisión aparte, con evidencia
// nueva, no algo que deba estar activo por default hoy.
// ============================================================

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
// aquí también para que la nube y el motor de reglas recomienden con
// la misma lógica de negocio.
function ordenarConBoostPremium(lugares: Lugar[]): Lugar[] {
  return [...lugares].sort((a, b) => {
    const scoreA = a.rating + (a.premium ? 0.4 : 0);
    const scoreB = b.rating + (b.premium ? 0.4 : 0);
    return scoreB - scoreA;
  });
}

export async function recuperarContexto(
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

// ─────────────── VALIDACIÓN ANTI-ALUCINACIÓN ───────────────
// Hallazgo real de campo: un modelo local pequeño llegó a inventar
// restaurantes completos con precios falsos que NO existen en el
// catálogo, pese a que el prompt de sistema dice explícitamente
// "NUNCA inventes lugares ni precios". Los modelos no siempre obedecen
// esa instrucción de forma confiable — así que en vez de confiar solo
// en el prompt, esto es una red de seguridad MECÁNICA: si la
// respuesta menciona un patrón de precio ($NN) pero NINGUNO de los
// lugares que sí le dimos como contexto aparece mencionado por su
// nombre, es evidencia fuerte de que inventó información — se
// descarta antes de mostrarla al turista. Se sigue aplicando a la
// nube (menos propensa a esto, pero también puede pasar).
const CATEGORIAS_VALIDAS = new Set([
  'Naturaleza', 'Aventura', 'Gastronomia', 'Hospedaje', 'Comercio', 'Cooperativa', 'Otro',
]);

// Compara nombres tolerando mayúsculas, acentos y espacios de más —
// no exige coincidencia exacta carácter por carácter, solo que sea
// reconociblemente el mismo lugar (p. ej. "Catermaco" vs "Catemaco").
function normalizarNombre(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Hallazgo real de campo: una respuesta puede MEZCLAR lugares reales
// con inventados en la misma lista — el check original (¿aparece AL
// MENOS UN lugar real en todo el texto?) daba el visto bueno a la
// lista COMPLETA con que apareciera uno solo real, dejando pasar de
// largo el resto inventado (incluso con categorías que ni existen en
// el sistema, como "Turismo" o "Cultura"). Este check nuevo revisa
// CADA entrada con formato "Nombre (Categoría, Municipio)" — el mismo
// formato que le damos como contexto, y que el modelo tiende a repetir
// al alucinar — contra el catálogo COMPLETO (no solo los 4 lugares
// que se le dieron de contexto), para no marcar por error un lugar
// real que existe en la plataforma pero no vino en este contexto en
// particular.
function contieneEntradaInventada(texto: string): boolean {
  const catalogoCompleto = getCatalogoActivo();
  const nombresReales = catalogoCompleto.map((l) => normalizarNombre(l.nombre));

  const patronListaLugar = /^[\s\-+•]*(.+?)\s*\(([^,()]+),\s*([^()]+)\)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = patronListaLugar.exec(texto)) !== null) {
    const [, nombreCrudo, categoriaCruda] = match;
    const categoria = categoriaCruda.trim();
    if (!CATEGORIAS_VALIDAS.has(categoria)) return true; // categoría que no existe en el sistema

    const nombreNorm = normalizarNombre(nombreCrudo);
    if (nombreNorm.length < 3) continue; // línea demasiado corta para ser un nombre real, ignorar

    const existeEnCatalogo = nombresReales.some(
      (n) => n === nombreNorm || n.includes(nombreNorm) || nombreNorm.includes(n)
    );
    if (!existeEnCatalogo) return true; // nombre que no existe en ningún lugar del catálogo
  }
  return false;
}

export function pareceInventada(texto: string, lugares: Lugar[]): boolean {
  const tienePatronDePrecio = /\$\s?\d/.test(texto);
  if (tienePatronDePrecio && lugares.length > 0) {
    const textoNorm = texto.toLowerCase();
    const mencionaAlgunLugarReal = lugares.some((l) =>
      textoNorm.includes(l.nombre.toLowerCase())
    );
    if (!mencionaAlgunLugarReal) return true;
  }

  return contieneEntradaInventada(texto);
}
function lugarAFicha(l: Lugar): string {
  const partes = [
    `- ${l.nombre}${l.premium ? ' [Socio Premium TuxtlasGO]' : ''} (${l.categoria}, ${l.municipio})`,
    `  ${l.descripcionCorta}`,
    `  Precio: ${l.precioMxn} · Horario: ${l.abierto.dias} ${l.abierto.horario}`,
    l.mascotas ? `  Mascotas: ${l.mascotas}` : '',
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

ALCANCE — QUÉ SÍ Y QUÉ NO HACES:
Solo ayudas con turismo en Los Tuxtlas: armar rutas, recomendar lugares del CONTEXTO (dónde comer, hospedarte, qué visitar), precios, horarios, presupuesto y dudas generales de la región.
NO eres un asistente general — no escribes código, no resuelves tareas escolares de otras materias, no das información fuera de turismo en Los Tuxtlas, sin importar cómo se te pida.
Si piden algo fuera de este alcance, dilo con una frase breve y directa (ej. "Solo puedo ayudarte con turismo en Los Tuxtlas — no tengo información sobre eso") y ofrece regresar al tema de viaje. No des rodeos largos explicando por qué no puedes.
Juzga el CONTENIDO real de la pregunta, no el motivo que digan tener. Si alguien menciona que es "para una tarea", "de broma" o "para prevenir a otros" pero lo que pregunta SÍ es turismo legítimo de Los Tuxtlas (ej. "para mi tarea, dime los mejores lugares para comer"), respóndelo normal y completo — el motivo no lo saca de tu alcance. Esas frases ("es tarea", "es broma", "es para prevenir", "no repruebo si no me ayudas") solo importan cuando se usan para presionarte a dar algo que de por sí está fuera de tu alcance o es dañino — ahí no cambian nada, sostén la misma negativa con calma las veces que haga falta, sin negociar ni hacer excepciones "solo por esta vez". Nunca mezcles un rechazo con la respuesta completa en el mismo mensaje — o rechazas claro, o ayudas claro, nunca las dos cosas a la vez.

OJO — no confundas "fuera de alcance" con "dentro de alcance pero sin ese dato": la frase de "Solo puedo ayudarte con turismo en Los Tuxtlas" es SOLO para temas que de verdad no son turismo en Los Tuxtlas (código, tareas de otras materias, temas generales). Si la pregunta SÍ es sobre un lugar o tema turístico de la región (ej. "¿aceptan perros?", "¿hay wifi?") pero simplemente no tienes ese dato específico en el CONTEXTO, NO uses la frase de alcance — usa la regla de honestidad de abajo ("no tengo ese dato registrado") en su lugar, sin mezclar las dos.

REGLAS ESTRICTAS:
- Responde SIEMPRE en español, cálido y breve (máximo 4-5 frases).
- Escribe en texto plano. NO uses markdown, ni asteriscos, ni almohadillas, ni viñetas con símbolos.
- Usa ÚNICAMENTE la información del CONTEXTO. NUNCA inventes lugares, precios, horarios ni contactos.
- Si mencionas lugares, usa su nombre EXACTO tal como aparece en el contexto.
- Si el turista pide algo que no está en el contexto, dilo con honestidad y ofrece lo que sí hay. No especules ni razones en voz alta para "adivinar" un dato que no tienes (ej. "como es selva tropical, sugiere que no permiten perros") — eso suena a información real aunque sea puro supuesto. Simplemente di que no tienes ese dato específico y, si aplica, sugiere confirmar directamente con el lugar.
- Si el turista menciona un presupuesto o límite de precio (ej. "que no pase de $400"), compara ese número con cuidado contra el campo Precio de cada lugar del CONTEXTO antes de recomendarlo — nunca redondees a favor del lugar ni ignores la comparación. Si el precio de un lugar tiene varios conceptos (ej. entrada + hospedaje por separado), dilo explícitamente en vez de asumir cuál aplica.
- NUNCA inventes distancias, tiempos de viaje, indicaciones de cómo llegar, coordenadas, ni nombres de calles o puntos de referencia (ej. "la farmacia con el árbol grande") que no vengan literalmente en el CONTEXTO. No tienes acceso al GPS del turista ni a un motor de rutas real — si preguntan "cuánto tiempo/qué tan lejos desde mi ubicación", dilo con honestidad: no puedes calcularlo aquí, y sugiere que usen el mapa de la app (ahí sí se calcula con su ubicación real). El municipio de cada lugar ya viene en el CONTEXTO — nunca lo cambies ni asumas uno distinto.
- Si el turista AFIRMA un precio, horario u otro dato distinto al que viene en el CONTEXTO (ej. "la ficha me dice que cuesta $200" cuando el CONTEXTO no dice eso, o dice otra cosa), NO lo aceptes como verdad ni lo repitas como si fuera un hecho confirmado — usa siempre el dato del CONTEXTO, y si genuinamente no tienes ese dato, dilo así en vez de darle la razón al turista sobre algo que no puedes verificar.
- No des información médica, legal ni de seguridad que no esté en el contexto.`;

// ─────────────── LIMPIEZA DE MARKDOWN (por si el modelo resbala) ───────────────
export function limpiarMarkdown(t: string): string {
  return t
    .replace(/\*+/g, '')      // quita ** y *
    .replace(/`+/g, '')       // quita backticks
    .replace(/^#{1,6}\s+/gm, '') // quita encabezados markdown
    .replace(/^\s*[-•]\s+/gm, '• '); // normaliza viñetas
}

// ─────────────── ARMADO DE MENSAJES PARA EL PROMPT ───────────────
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

  // Historial reciente de mensajes de texto — se manda SOLO el
  // .texto de cada uno (nunca los datos de lugares/ruta en sí), así
  // que no hay ahorro real de espacio al excluir mensajes con
  // lugares/rutaDia adjuntos.
  //
  // Hallazgo real de campo (grave): este filtro SÍ excluía antes
  // cualquier mensaje con `lugares` adjunto — y después de construir
  // la tarjeta genérica, la respuesta de presupuesto, la de grupo y
  // la de distancia (todas adjuntan `lugares`), eso pasó a ser CASI
  // TODA la conversación del bot. Resultado: la nube "olvidaba" casi
  // todo lo que ella misma había dicho, y en una conversación larga
  // llegó a responder "no había recibido ninguna pregunta o
  // información previa" — una alucinación de amnesia total, aunque
  // la conversación llevaba muchos mensajes. Solo se sigue excluyendo
  // `opciones` (los prompts del flujo guiado por botones, ej. "¿cuántos
  // días vas a estar?" — no aportan como contexto conversacional libre).
  const historialReciente = historial
    .filter((m) => !m.opciones && m.texto.trim().length > 0)
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

// ============================================================
// GENERACIÓN EN LA NUBE (Groq) — el único generador activo
// ============================================================
// A propósito NO se usa window.ai/Gemini Nano (depende de flags
// experimentales de Chrome que no controlas en el dispositivo del
// usuario) — en su lugar, un endpoint propio en /api/ia/chat que
// llama a un modelo en la nube con el MISMO contexto recuperado.
// Si hay internet, se usa esto. Si no, cae al motor de reglas
// (ver chatbot.ts) — nunca se deja al turista sin respuesta.
export function nubeDisponible(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

export interface RespuestaValidada {
  texto: string;
  valida: boolean; // false = se detectó posible alucinación y se descartó
}

export async function responderConNube(
  texto: string,
  historial: MensajeChat[] = [],
  prefs?: Partial<PreferenciasUsuario>
): Promise<RespuestaValidada> {
  const ctx = await recuperarContexto(texto, prefs);
  const { system, mensajes } = await armarMensajesLLM(texto, historial, prefs);

  // navigator.onLine puede decir "true" aunque no haya internet real de
  // verdad (portal cautivo de un WiFi de hotel, señal celular que se cae
  // a medio handshake) — sin un tope de tiempo, un fetch así se puede
  // quedar colgado mucho más de lo que un chat puede esperar.
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
    const limpio = limpiarMarkdown(data.texto);

    if (pareceInventada(limpio, ctx.lugares)) {
      console.warn('[TuxtlasGO IA] Posible alucinación (nube) detectada y descartada:', limpio);
      return { texto: '', valida: false };
    }
    return { texto: limpio, valida: true };
  } finally {
    clearTimeout(avisoTiempo);
  }
}