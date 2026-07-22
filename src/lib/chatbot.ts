import { LUGARES, Lugar, Categoria, Presupuesto } from '../data/lugares';

// Catálogo activo del motor: empieza con los lugares estáticos y se puede
// extender con prestadores aprobados (desde IndexedDB). Mantener este
// estado al nivel del módulo permite que TODO el motor — recomendaciones,
// rutas, búsquedas por texto libre — incluya a los prestadores sin tener
// que pasar listas como parámetros por todos lados.
let catalogoActivo: Lugar[] = [...LUGARES];

// Llamar al iniciar la app (después de cargar prestadores aprobados) o
// cada vez que cambie la lista de prestadores aprobados.
export function setCatalogoExtendido(prestadoresAprobados: Lugar[]): void {
  catalogoActivo = [...LUGARES, ...prestadoresAprobados];
}

// Acceso de solo lectura al catálogo actual (lugares + prestadores).
export function getCatalogoActivo(): Lugar[] {
  return catalogoActivo;
}

import { buscarConocimiento } from './conocimiento';
import { tokenizar, contieneClave, palabraCoincide } from './pln';
import { vectorizar, similitudCoseno, embeddingsListo } from './embeddings';
// ============================================================
// MOTOR DE ASISTENTE CONVERSACIONAL — 100% OFFLINE
// ============================================================
// Sistema de IA basado en reglas (sistema experto con PLN local).
// No usa LLM ni conexión a internet. Funciona así:
//
//   1. PROCESAMIENTO DE LENGUAJE NATURAL: normaliza el texto del
//      usuario y detecta su intención (intent) y entidades
//      (municipios, categorías) mediante reconocimiento de
//      patrones léxicos.
//
//   2. MOTOR DE INFERENCIA: cruza las preferencias del usuario
//      con la base de datos de lugares mediante un algoritmo de
//      scoring ponderado, y consulta la base de conocimiento
//      general para preguntas prácticas.
//
//   3. GENERACIÓN DE RESPUESTA: arma rutas optimizadas por
//      geografía y explica su razonamiento (IA explicable).
//
// Toda la "inteligencia" vive en el dispositivo. Esto garantiza
// que la app funcione en las zonas sin señal de Los Tuxtlas.
// ============================================================

export type GrupoViaje = 'solo' | 'pareja' | 'familia' | 'amigos';
export type Dias = 1 | 2 | 3;

export interface PreferenciasUsuario {
  intereses: Categoria[];
  presupuesto: Presupuesto;
  grupo: GrupoViaje;
  dias: Dias;
  // Opcional: si el turista mencionó un municipio específico en texto
  // libre ("quiero una ruta en Catemaco"), la ruta se queda SOLO ahí
  // en vez de repartirse entre varios municipios para dar variedad
  // (comportamiento por default cuando esto no viene). El flujo
  // guiado por botones nunca lo pide, así que en ese camino siempre
  // queda undefined — sin cambios ahí.
  municipio?: string;
}

export interface MensajeChat {
  id: string;
  role: 'user' | 'bot';
  texto: string;
  opciones?: { label: string; valor: string }[];
  lugares?: Lugar[];
  rutaDia?: { dia: number; lugares: Lugar[]; resumen: string };
  timestamp: number;
}

export type EstadoChat =
  | 'inicio'
  | 'preguntando_dias'
  | 'preguntando_intereses'
  | 'preguntando_presupuesto'
  | 'preguntando_grupo'
  | 'generando'
  | 'libre';

// ─────────────── DETECCIÓN DE INTENCIONES (PLN local) ───────────────
// Vocabulario de cada intención. Incluye sinónimos, conjugaciones
// y formas coloquiales de hablar — entre más amplio, mejor entiende
// el motor. El módulo PLN se encarga aparte de los errores de dedo,
// así que aquí basta con escribir las palabras bien.
const INTENT_KEYWORDS: { intent: string; words: string[] }[] = [
  {
    intent: 'comida',
    words: [
      'comer', 'comida', 'comemos', 'hambre', 'hambriento', 'restaurante',
      'restaurant', 'fonda', 'cocina', 'pescado', 'mariscos', 'marisco',
      'gastronomia', 'tegogolo', 'tegogolos', 'mojarra', 'anguila', 'antojo',
      'antojito', 'garnacha', 'picada', 'empanada', 'desayunar', 'desayuno',
      'almorzar', 'almuerzo', 'cenar', 'cena', 'platillo', 'probar', 'degustar',
      'rico', 'sabroso', 'tipica',
    ],
  },
  {
    intent: 'hospedaje',
    words: [
      'dormir', 'hotel', 'posada', 'hospedaje', 'hospedar', 'hospedarme',
      'hospedo', 'quedarme', 'quedar', 'alojarme', 'alojar', 'alojamiento',
      'cabaña', 'cabana', 'habitacion', 'cuarto', 'noche', 'pernoctar',
      'hostal', 'motel',
    ],
  },
  {
    intent: 'naturaleza',
    words: [
      'naturaleza', 'natural', 'cascada', 'cascadas', 'salto', 'laguna',
      'lagunas', 'lago', 'rio', 'rios', 'verde', 'selva', 'aire libre',
      'paisaje', 'bosque', 'manantial', 'agua', 'ecoturismo', 'ecologico',
      'vegetacion',
    ],
  },
  {
    intent: 'aventura',
    words: [
      'aventura', 'aventurero', 'extremo', 'senderismo', 'sendero', 'volcan',
      'caminata', 'caminar', 'adrenalina', 'kayak', 'temazcal', 'mirador',
      'miradores', 'escalada', 'rappel', 'ciclismo', 'montaña', 'montana',
      'trekking', 'excursion', 'deportes', 'activo',
    ],
  },
  {
    intent: 'monos',
    words: [
      'mono', 'monos', 'chango', 'changos', 'mico', 'fauna', 'macaco',
      'macacos', 'animales', 'animal', 'primate', 'silvestre',
    ],
  },
  {
    intent: 'saludo',
    words: [
      'hola', 'holi', 'buenas', 'hey', 'hi', 'hello', 'que tal', 'que onda',
      'ke onda', 'buenos dias', 'buen dia', 'buenas tardes', 'buenas noches',
      'saludos',
    ],
  },
  {
    intent: 'agradecimiento',
    words: [
      'gracias', 'gracia', 'thank', 'genial', 'perfecto', 'excelente',
      'muy bien', 'mil gracias', 'chido', 'padre', 'increible', 'super',
      'buenisimo', 'te pasaste',
    ],
  },
];

export function detectarIntent(texto: string): string {
  // Tokeniza el texto y compara contra las palabras clave de cada
  // intención TOLERANDO errores ortográficos (vía el módulo PLN).
  const tokens = tokenizar(texto);

  // 'saludo' y 'agradecimiento' disparan una respuesta de plantilla fija
  // ("¡Con gusto! Para eso estoy...", etc.). Un saludo o agradecimiento
  // real suele ser una frase corta. Si el mensaje es largo o lleva una
  // negación, es más probable que sea una queja o instrucción compleja
  // que de casualidad contiene la palabra "gracias" o "hola" en medio
  // (ej. "no funcionas como deberia gracias") — en ese caso NO
  // queremos responder con un "¡de nada!" fuera de lugar.
  const esCorto = tokens.length <= 6;
  const tieneNegacion = ['no', 'nunca', 'nada', 'mal'].some((n) =>
    tokens.includes(n)
  );

  for (const { intent, words } of INTENT_KEYWORDS) {
    if ((intent === 'saludo' || intent === 'agradecimiento') && (!esCorto || tieneNegacion)) {
      continue;
    }
    if (words.some((w) => contieneClave(tokens, w))) return intent;
  }
  return 'desconocido';
}

// Detecta menciones de municipios en texto libre
export function detectarMunicipio(texto: string): string | null {
  // Detecta el municipio mencionado, tolerando errores de escritura
  // ("catemco" -> Catemaco) gracias al módulo PLN.
  const tokens = tokenizar(texto);
  if (contieneClave(tokens, 'catemaco')) return 'Catemaco';
  if (contieneClave(tokens, 'san andres')) return 'San Andrés Tuxtla';
  if (contieneClave(tokens, 'santiago')) return 'Santiago Tuxtla';
  return null;
}

// Palabras que aparecen en muchos nombres de lugares pero no
// distinguen a NINGUNO en particular ("Restaurante X", "Cabañas Y") —
// se ignoran al comparar, para que coincidir con ellas solas no cuente
// como haber nombrado un lugar específico.
const PALABRAS_GENERICAS_LUGAR = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'y', 'restaurante', 'restaurant',
  'bar', 'cabañas', 'cabana', 'cabanas', 'reserva', 'ecologica', 'ecológica',
  'lanchas', 'cafe', 'café', 'hotel', 'hospedaje', 'tours', 'servicio',
  'salto', 'balneario', 'nueva', 'sucursal',
]);

function palabrasDistintivas(nombre: string): string[] {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !PALABRAS_GENERICAS_LUGAR.has(p));
}

// Busca si el turista mencionó el NOMBRE de un lugar específico del
// catálogo — a diferencia de buscarSemantico (que compara SIGNIFICADO
// general con embeddings), esto es para resolver "está hablando de
// ESTE lugar en particular", así se puede mostrar su tarjeta
// (imagen + descripción) en vez de una respuesta genérica en texto.
// Funciona sin internet ni GPU — es comparación de texto simple.
//
// Ej: "Restaurante Margiros" tiene una sola palabra distintiva
// ("margiros") — basta con que el turista escriba esa. "Reserva
// Ecológica Nanciyaga" también reduce a una sola ("nanciyaga"). Para
// nombres con VARIAS palabras distintivas reales, exige que coincida
// al menos la mitad, para no confundir un lugar con otro por una sola
// palabra suelta compartida.
export function buscarLugarPorNombre(texto: string, catalogo: Lugar[]): Lugar | null {
  const tokens = tokenizar(texto);
  let mejor: { lugar: Lugar; coincidencias: number; totalDistintivas: number } | null = null;

  for (const lugar of catalogo) {
    const distintivas = palabrasDistintivas(lugar.nombre);
    if (distintivas.length === 0) continue;

    const coincidencias = distintivas.filter((p) =>
      tokens.some((t) => palabraCoincide(t, p))
    ).length;

    const umbralMinimo = Math.max(1, Math.ceil(distintivas.length / 2));
    if (coincidencias < umbralMinimo) continue;

    if (!mejor || coincidencias > mejor.coincidencias) {
      mejor = { lugar, coincidencias, totalDistintivas: distintivas.length };
    }
  }

  return mejor ? mejor.lugar : null;
}


// ─────────────── MENSAJES DEL FLUJO GUIADO ───────────────
export function mensajeBienvenida(): MensajeChat {
  return {
    id: crypto.randomUUID(),
    role: 'bot',
    texto:
      '¡Hola! Soy tu guía de TuxtlasGO 🌿 Conozco los rincones de Catemaco, San Andrés y Santiago Tuxtla, y funciono aunque no tengas internet. Puedo armarte una ruta a tu medida o responder dudas sobre la región. Para empezar con tu ruta: ¿cuántos días vas a estar por Los Tuxtlas?',
    opciones: [
      { label: '1 día (vengo de paso)', valor: '1' },
      { label: '2 días (fin de semana)', valor: '2' },
      { label: '3 días o más', valor: '3' },
    ],
    timestamp: Date.now(),
  };
}

export function mensajeIntereses(): MensajeChat {
  return {
    id: crypto.randomUUID(),
    role: 'bot',
    texto:
      'Perfecto. Ahora cuéntame qué te mueve cuando viajas. Puedes elegir varios — toca todos los que te interesen y luego dale a "Listo".',
    opciones: [
      { label: '🌳 Naturaleza', valor: 'Naturaleza' },
      { label: '🥾 Aventura', valor: 'Aventura' },
      { label: '🍤 Gastronomía', valor: 'Gastronomia' },
      { label: '🛏️ Hospedaje', valor: 'Hospedaje' },
      { label: '✅ Listo, ya escogí', valor: '__done__' },
    ],
    timestamp: Date.now(),
  };
}

export function mensajePresupuesto(): MensajeChat {
  return {
    id: crypto.randomUUID(),
    role: 'bot',
    texto: '¿Cómo anda el presupuesto para este viaje? Así te recomiendo cosas que te acomoden.',
    opciones: [
      { label: '💸 Ajustado (lo gratis y económico)', valor: 'bajo' },
      { label: '💳 Normal (sin gastar de más)', valor: 'medio' },
      { label: '💎 Holgado (quiero lo mejor)', valor: 'alto' },
    ],
    timestamp: Date.now(),
  };
}

export function mensajeGrupo(): MensajeChat {
  return {
    id: crypto.randomUUID(),
    role: 'bot',
    texto: 'Última pregunta y armo tu ruta: ¿con quién vienes?',
    opciones: [
      { label: '🧍 Solo / sola', valor: 'solo' },
      { label: '💕 En pareja', valor: 'pareja' },
      { label: '👨‍👩‍👧 En familia con niños', valor: 'familia' },
      { label: '🎉 Con amigos', valor: 'amigos' },
    ],
    timestamp: Date.now(),
  };
}

// ─────────────── NÚCLEO: FILTRADO Y RANKING (motor de inferencia) ───────────────
interface LugarConScore {
  lugar: Lugar;
  score: number;
  razones: string[]; // por qué se recomienda — IA explicable
}

export function filtrarLugaresConRazones(
  prefs: PreferenciasUsuario
): LugarConScore[] {
  const ordenPresup: Presupuesto[] = ['bajo', 'medio', 'alto'];
  const maxPresup = ordenPresup.indexOf(prefs.presupuesto);

  const scored: LugarConScore[] = catalogoActivo.map((lugar) => {
    let score = 0;
    const razones: string[] = [];

    // Match de categoría con intereses
    if (prefs.intereses.includes(lugar.categoria)) {
      score += 5;
      razones.push(`te interesa ${lugar.categoria.toLowerCase()}`);
    }
    // Match con tags de intereses (parcial)
    const interesesLower = prefs.intereses.map((i) => i.toLowerCase());
    const tagMatch = lugar.tags.some((t) => interesesLower.includes(t));
    if (tagMatch) score += 1.5;

    // Match de grupo
    if (lugar.ideal.includes(prefs.grupo)) {
      score += 3;
      const grupoTexto =
        prefs.grupo === 'pareja'
          ? 'es ideal para parejas'
          : prefs.grupo === 'familia'
            ? 'funciona bien en familia'
            : prefs.grupo === 'amigos'
              ? 'es buen plan con amigos'
              : 'se disfruta viajando solo';
      razones.push(grupoTexto);
    }

    // Bonus rating
    score += lugar.rating;
    if (lugar.rating >= 4.6) {
      razones.push('tiene de las mejores valoraciones de la zona');
    }

    // Bonus destacado
    if (lugar.destacado) {
      score += 1.5;
      razones.push('es un imperdible de Los Tuxtlas');
    }

    // Bonus Premium: prestadores con plan activo ($89 MXN/mes) ganan
    // posicionamiento prioritario. Es un empate-rompedor deliberadamente
    // moderado (menor que rating o match de interés/grupo): sube en el
    // orden entre opciones ya relevantes, pero nunca hace que la IA
    // recomiende algo que no le sirve al turista solo porque pagó.
    // Ese balance es lo que hace la recomendación defendible ante el
    // usuario y es la base del "algoritmo de recomendaciones por cada
    // prestador que pague 89 pesos" del módulo de Prestador de Servicios.
    if (lugar.premium) {
      score += 2;
    }

    // Penalización por presupuesto
    const presupLugar = ordenPresup.indexOf(lugar.precio);
    if (presupLugar > maxPresup) {
      score -= 4;
    } else if (prefs.presupuesto === 'bajo' && lugar.precio === 'bajo') {
      razones.push('es económico o gratis');
    }

    return { lugar, score, razones };
  });

  const tieneIntereses = prefs.intereses.length > 0;
  const sorted = scored.sort((a, b) => b.score - a.score);

  if (!tieneIntereses) {
    return sorted.filter((s) => s.score > 3);
  }

  // Con intereses específicos: SOLO incluir lugares que coincidan
  // exactamente con los intereses elegidos. No mezclar categorías.
  // Excepción: si el usuario eligió Gastronomía, ya está incluida.
  return sorted.filter((s) => {
    if (s.score <= 0) return false;
    return prefs.intereses.includes(s.lugar.categoria);
  });
}

// Versión simple (solo lugares, sin razones)
export function filtrarLugares(prefs: PreferenciasUsuario): Lugar[] {
  return filtrarLugaresConRazones(prefs).map((s) => s.lugar);
}

// ─────────────── GENERADOR DE RUTAS POR DÍA ───────────────
export interface DiaRuta {
  dia: number;
  lugares: Lugar[];
  resumen: string;
  razonamiento: string; // explicación de por qué se armó así
}


// ============================================================
// EXTRACCIÓN DE PREFERENCIAS DE TEXTO LIBRE
// ============================================================
// Objetivo: cuando alguien escribe "quiero un fin de semana tranquilo,
// gastando poco, con mi pareja" en vez de tocar los botones del flujo
// guiado, sacar de ahí días/presupuesto/grupo/intereses directamente.
//
// Nota honesta: la idea original era usar OpenNLP — pero OpenNLP es
// una librería de Java, y esta app es una PWA en TypeScript/navegador;
// no se puede importar ahí sin un runtime de Java completo (WASM),
// que sería mucho más pesado que lo que ya tienes cargado. Esto logra
// el mismo resultado con una técnica distinta ("clasificación
// zero-shot"): en vez de reglas por palabra clave, se compara el
// texto del turista contra frases de ejemplo ya escritas para cada
// opción, usando el MISMO modelo de embeddings (~30MB) que ya corre
// para el banco de respuestas — cero dependencias nuevas.
//
// El umbral (0.5) es más bajo que el del banco de respuestas (0.82)
// A PROPÓSITO: aquí un acierto equivocado solo cambia ligeramente una
// recomendación de ruta, no muestra un dato falso con aparente
// autoridad — el costo de una alucinación es mucho menor que el que
// corregimos antes, así que toleramos más falsos positivos a cambio
// de reconocer más frases reales. Si en pruebas reales resulta
// demasiado permisivo o demasiado estricto, es cuestión de ajustar
// este único número — igual que calibramos el del banco de respuestas
// tras encontrar el caso real de "capital de España".
interface EjemploCategoria<T> {
  valor: T;
  frases: string[];
}

const EJEMPLOS_DIAS: EjemploCategoria<Dias>[] = [
  { valor: 1, frases: ['vengo de paso', 'solo tengo hoy', 'nada más un día', 'de pasada por aquí', 'ando solo hoy por la zona'] },
  { valor: 2, frases: ['un fin de semana', 'sábado y domingo', 'un fin de semana largo aquí', 'viernes y sábado'] },
  { valor: 3, frases: ['varios días', 'toda la semana', 'unas vacaciones completas', 'una semana entera aquí'] },
];

const EJEMPLOS_PRESUPUESTO: EjemploCategoria<Presupuesto>[] = [
  { valor: 'bajo', frases: ['gastando poco', 'no traigo mucho dinero', 'algo económico', 'lo más barato posible', 'ando bien ajustado de dinero'] },
  { valor: 'medio', frases: ['sin gastar de más', 'un presupuesto normal', 'ni muy caro ni muy barato', 'algo de precio intermedio'] },
  { valor: 'alto', frases: ['quiero lo mejor', 'no me importa el precio', 'algo de lujo', 'presupuesto amplio', 'quiero consentirme un poco'] },
];

const EJEMPLOS_GRUPO: EjemploCategoria<GrupoViaje>[] = [
  { valor: 'solo', frases: ['voy solo', 'ando sola', 'viajo solo', 'nomás yo'] },
  { valor: 'pareja', frases: ['con mi pareja', 'con mi novio', 'con mi novia', 'en pareja', 'de luna de miel'] },
  { valor: 'familia', frases: ['con mi familia', 'con niños', 'vamos en familia', 'con mis papás', 'con mis hijos'] },
  { valor: 'amigos', frases: ['con mis amigos', 'en grupo de amigos', 'vamos varios amigos'] },
];

// Hallazgo real de campo: alguien escribió "quiero una ruta, con
// gastronomía" y NO se detectó — porque ninguna frase de ejemplo
// tenía la palabra "gastronomía" en sí, solo paráfrasis ("comer
// bien", "buena comida"). Si el turista usa el nombre de la categoría
// tal cual (lo más natural del mundo), hace falta que esté aquí
// literal, no solo su paráfrasis.
const EJEMPLOS_INTERESES: EjemploCategoria<Categoria>[] = [
  { valor: 'Naturaleza', frases: ['algo tranquilo', 'en la naturaleza', 'naturaleza', 'selva', 'cascadas', 'aire libre', 'desconectarme un rato'] },
  { valor: 'Aventura', frases: ['adrenalina', 'aventura', 'algo extremo', 'actividades de aventura'] },
  { valor: 'Gastronomia', frases: ['gastronomía', 'gastronomia', 'comer bien', 'buena comida', 'restaurantes', 'probar platillos locales'] },
  { valor: 'Hospedaje', frases: ['hospedaje', 'dónde quedarme', 'un buen hotel', 'dónde dormir'] },
];



// Caché de vectores de los ejemplos — se calculan una sola vez por
// sesión (son pocas frases fijas, no vale la pena persistirlas en
// Dexie como el catálogo o el banco de respuestas).
let vectoresEjemplo: {
  dias: { valor: Dias; vector: number[] }[];
  presupuesto: { valor: Presupuesto; vector: number[] }[];
  grupo: { valor: GrupoViaje; vector: number[] }[];
  intereses: { valor: Categoria; vector: number[] }[];
} | null = null;

async function prepararEjemplos() {
  if (vectoresEjemplo) return vectoresEjemplo;
  const vectorizarLista = async <T,>(lista: EjemploCategoria<T>[]) => {
    const out: { valor: T; vector: number[] }[] = [];
    for (const item of lista) {
      for (const frase of item.frases) {
        out.push({ valor: item.valor, vector: await vectorizar(frase) });
      }
    }
    return out;
  };
  vectoresEjemplo = {
    dias: await vectorizarLista(EJEMPLOS_DIAS),
    presupuesto: await vectorizarLista(EJEMPLOS_PRESUPUESTO),
    grupo: await vectorizarLista(EJEMPLOS_GRUPO),
    intereses: await vectorizarLista(EJEMPLOS_INTERESES),
  };
  return vectoresEjemplo;
}

// Para cada VALOR posible, se queda con su mejor coincidencia (no la
// mejor frase de ejemplo suelta) — así una categoría con 6 frases de
// ejemplo no le "gana" injustamente a una con 3 solo por tener más
// oportunidades de acertar.
function mejoresPorValor<T>(
  vectorConsulta: number[],
  ejemplos: { valor: T; vector: number[] }[],
  umbral: number
): T[] {
  const mejorPorValor = new Map<string, { valor: T; sim: number }>();
  for (const e of ejemplos) {
    const sim = similitudCoseno(vectorConsulta, e.vector);
    const clave = String(e.valor);
    const actual = mejorPorValor.get(clave);
    if (!actual || sim > actual.sim) mejorPorValor.set(clave, { valor: e.valor, sim });
  }
  return [...mejorPorValor.values()]
    .filter((v) => v.sim >= umbral)
    .sort((a, b) => b.sim - a.sim)
    .map((v) => v.valor);
}

// Degrada con gracia si los embeddings aún no están listos (devuelve
// un objeto vacío) — quien llama debe rellenar con valores por
// default en vez de bloquear la conversación esperando el modelo.
export async function extraerPreferenciasLibres(
  texto: string
): Promise<Partial<PreferenciasUsuario>> {
  if (!embeddingsListo()) return {};

  const ejemplos = await prepararEjemplos();
  const vectorConsulta = await vectorizar(texto);
  const UMBRAL = 0.5;

  const resultado: Partial<PreferenciasUsuario> = {};

  const dias = mejoresPorValor(vectorConsulta, ejemplos.dias, UMBRAL);
  if (dias.length > 0) resultado.dias = dias[0];

  const presupuesto = mejoresPorValor(vectorConsulta, ejemplos.presupuesto, UMBRAL);
  if (presupuesto.length > 0) resultado.presupuesto = presupuesto[0];

  const grupo = mejoresPorValor(vectorConsulta, ejemplos.grupo, UMBRAL);
  if (grupo.length > 0) resultado.grupo = grupo[0];

  // Intereses SÍ es multi-etiqueta: un turista puede querer
  // "naturaleza y buena comida" en la misma frase — se incluyen
  // TODAS las categorías que superen el umbral, no solo la mejor.
  const intereses = mejoresPorValor(vectorConsulta, ejemplos.intereses, UMBRAL);
  if (intereses.length > 0) resultado.intereses = intereses;

  return resultado;
}

// Detección simple (por palabra clave, sin IA) de si el mensaje suena
// a "arma/recomiéndame una ruta" — sirve para decidir SI vale la pena
// llamar a extraerPreferenciasLibres, no para extraer nada en sí.
export function pareceSolicitudDeRuta(texto: string): boolean {
  const tokens = tokenizar(texto);
  const palabrasClave = [
    'ruta', 'rutas', 'itinerario', 'plan', 'planea', 'recomiendame',
    'recomiéndame', 'arma', 'armame', 'ármame', 'organiza', 'organizame',
    'que hacer', 'qué hacer', 'viaje', 'visitar', 'recorrido',
  ];
  return palabrasClave.some((p) => contieneClave(tokens, p));
}


export function generarRuta(prefs: PreferenciasUsuario): DiaRuta[] {
  const recomendadosConScore = filtrarLugaresConRazones(prefs);
  if (recomendadosConScore.length === 0) return [];

  // Agrupar por score — respetar categoría/precio del usuario
  // Solo barajar entre lugares con el MISMO score (empates)
  // Así siempre salen los que corresponden al perfil del usuario
  const porScore: Record<number, typeof recomendadosConScore> = {};
  for (const s of recomendadosConScore) {
    const key = Math.round(s.score * 10); // agrupar con 1 decimal de precisión
    if (!porScore[key]) porScore[key] = [];
    porScore[key].push(s);
  }
  // Barajar dentro de cada grupo de score igual
  for (const grupo of Object.values(porScore)) {
    for (let i = grupo.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [grupo[i], grupo[j]] = [grupo[j], grupo[i]];
    }
  }
  // Reconstruir lista ordenada por score (de mayor a menor)
  const recomendados = Object.keys(porScore)
    .map(Number)
    .sort((a, b) => b - a)
    .flatMap(k => porScore[k])
    .map(s => s.lugar);

  // Si el turista pidió un municipio específico ("una ruta en
  // Catemaco"), la ruta se queda SOLO ahí — hallazgo real de campo:
  // antes esto se ignoraba por completo y la ruta repartía días entre
  // municipios distintos aunque se hubiera pedido uno solo. Si no hay
  // NADA que cumpla el perfil en ese municipio, cae al comportamiento
  // normal (todos los municipios) en vez de dar una ruta vacía —
  // mejor algo útil que nada.
  let recomendadosFiltrados = recomendados;
  if (prefs.municipio) {
    const soloEseMunicipio = recomendados.filter((l) => l.municipio === prefs.municipio);
    if (soloEseMunicipio.length > 0) recomendadosFiltrados = soloEseMunicipio;
  }

  // Agrupar por municipio (para minimizar traslados)
  const seleccion = recomendadosFiltrados.slice(0, prefs.dias * 5);

  const porMunicipio: Record<string, Lugar[]> = {};
  seleccion.forEach((l) => {
    if (!porMunicipio[l.municipio]) porMunicipio[l.municipio] = [];
    porMunicipio[l.municipio].push(l);
  });

  // Distribuir municipios equitativamente — no siempre Catemaco primero
  // Ordenar por variedad: el municipio con menos días asignados va primero
  const todosMunicipios = Object.keys(porMunicipio);
  // Si hay varios municipios, rotar empezando por el que no sea Catemaco
  // para dar variedad al turista
  const municipios = todosMunicipios.sort((a, b) => {
    // Priorizar municipios con más lugares disponibles pero rotar
    const diff = porMunicipio[b].length - porMunicipio[a].length;
    // Si la diferencia es pequeña (<=1), mezclar para no siempre Catemaco
    if (Math.abs(diff) <= 1) {
      return Math.random() > 0.5 ? 1 : -1;
    }
    return diff;
  });

  const dias: DiaRuta[] = [];
  const lugaresPorDia = 3;

  for (let i = 0; i < prefs.dias; i++) {
    const municipio = municipios[i % municipios.length];
    const lugaresMuni = porMunicipio[municipio] || [];

    const dia: Lugar[] = [];
    const usados = new Set<string>();
    const yaSeleccionados = new Set(
      dias.flatMap((d) => d.lugares.map((l) => l.id))
    );

    // Prioridad 1: del municipio del día
    for (const l of lugaresMuni) {
      if (dia.length >= lugaresPorDia) break;
      if (yaSeleccionados.has(l.id) || usados.has(l.id)) continue;
      if (
        dia.some((d) => d.categoria === l.categoria) &&
        l.categoria !== 'Gastronomia'
      )
        continue;
      dia.push(l);
      usados.add(l.id);
    }

    // Rellenar de otros municipios
    for (const l of seleccion) {
      if (dia.length >= lugaresPorDia) break;
      if (yaSeleccionados.has(l.id) || usados.has(l.id)) continue;
      if (
        dia.some((d) => d.categoria === l.categoria) &&
        l.categoria !== 'Gastronomia'
      )
        continue;
      dia.push(l);
      usados.add(l.id);
    }

    // Ordenar el día por momento ideal
    dia.sort((a, b) => {
      const orden: Record<Categoria, number> = {
        Aventura: 1,
        Naturaleza: 2,
        Gastronomia: 3,
        Hospedaje: 4,
        Comercio: 5,
        Cooperativa: 6,
        Otro: 7,
      };
      return orden[a.categoria] - orden[b.categoria];
    });

    if (dia.length > 0) {
      dias.push({
        dia: i + 1,
        lugares: dia,
        resumen: armarResumen(i + 1, municipio, dia, prefs),
        razonamiento: armarRazonamiento(dia, prefs),
      });
    }
  }

  return dias;
}

function armarResumen(
  numDia: number,
  municipio: string,
  lugares: Lugar[],
  prefs: PreferenciasUsuario
): string {
  const tipos = [...new Set(lugares.map((l) => l.categoria.toLowerCase()))];
  const tiposTexto =
    tipos.length > 1
      ? `${tipos.slice(0, -1).join(', ')} y ${tipos[tipos.length - 1]}`
      : tipos[0];
  const conQuien =
    prefs.grupo === 'pareja'
      ? 'pensado para disfrutarse en pareja'
      : prefs.grupo === 'familia'
        ? 'diseñado para un día en familia'
        : prefs.grupo === 'amigos'
          ? 'ideal para un día con amigos'
          : 'a tu propio ritmo';
  return `Día ${numDia} · ${municipio} — ${tiposTexto}, ${conQuien}.`;
}

function armarRazonamiento(lugares: Lugar[], prefs: PreferenciasUsuario): string {
  const primero = lugares[0];
  const partes: string[] = [];
  partes.push(
    `Te puse ${primero.nombre} para empezar porque ${primero.categoria === 'Aventura' || primero.categoria === 'Naturaleza'
      ? 'conviene aprovechar la mañana para actividad al aire libre'
      : 'es un buen arranque de día'
    }.`
  );
  const tieneGastronomia = lugares.some((l) => l.categoria === 'Gastronomia');
  if (tieneGastronomia) {
    partes.push('Dejé la comida para media tarde, cuando ya tengas hambre.');
  }
  if (prefs.presupuesto === 'bajo') {
    partes.push('Prioricé lugares económicos o gratuitos según tu presupuesto.');
  }
  const municipiosUnicos = [...new Set(lugares.map((l) => l.municipio))];
  if (municipiosUnicos.length === 1) {
    partes.push(
      `Todo el día es en ${municipiosUnicos[0]} para que no pierdas tiempo en traslados.`
    );
  }
  return partes.join(' ');
}

// ─────────────── RESPUESTAS A TEXTO LIBRE ───────────────
export function responderTextoLibre(
  texto: string,
  _prefs: PreferenciasUsuario | null
): MensajeChat {
  const intent = detectarIntent(texto);
  const municipioMencionado = detectarMunicipio(texto);

  // Saludo
  if (intent === 'saludo') {
    const saludos = [
      '¡Hola! ¿En qué te puedo ayudar? Pregúntame por lugares, comida, hospedaje, cómo moverte o pídeme una ruta a tu medida.',
      '¡Buenas! Estoy aquí. Puedo recomendarte qué ver, dónde comer, cómo llegar a cualquier lugar de Los Tuxtlas, o armarte una ruta completa.',
      '¡Hola de nuevo! ¿Qué necesitas saber de Los Tuxtlas?',
    ];
    return {
      id: crypto.randomUUID(),
      role: 'bot',
      texto: saludos[Math.floor(Math.random() * saludos.length)],
      timestamp: Date.now(),
    };
  }

  // Agradecimiento
  if (intent === 'agradecimiento') {
    return {
      id: crypto.randomUUID(),
      role: 'bot',
      texto:
        '¡Con gusto! Para eso estoy. Si quieres te armo otra ruta o te recomiendo más lugares. Disfruta Los Tuxtlas 🌿',
      opciones: [{ label: '🔄 Armar otra ruta', valor: '__restart__' }],
      timestamp: Date.now(),
    };
  }

  // PASO 1: ¿es una pregunta de conocimiento general?
  // (clima, transporte, comida típica, seguridad, qué llevar, etc.)
  const conocimiento = buscarConocimiento(texto);

  // Intents que mapean a categoría de lugar
  const mapaIntentCat: Record<string, Categoria> = {
    comida: 'Gastronomia',
    hospedaje: 'Hospedaje',
    naturaleza: 'Naturaleza',
    aventura: 'Aventura',
  };
  const cat = mapaIntentCat[intent];

  // Si hay conocimiento general Y NO hay una categoría de lugar clara,
  // responde con el conocimiento. Si hay categoría, los lugares ganan
  // (pero igual añadimos el dato de conocimiento si aplica).
  if (conocimiento && !cat && intent !== 'monos') {
    return {
      id: crypto.randomUUID(),
      role: 'bot',
      texto: conocimiento.respuesta,
      timestamp: Date.now(),
    };
  }

  // PASO 2: intents que mapean a categoría de lugar
  if (cat) {
    let candidatos = catalogoActivo.filter((l) => l.categoria === cat);
    if (municipioMencionado) {
      const enMunicipio = candidatos.filter(
        (l) => l.municipio === municipioMencionado
      );
      if (enMunicipio.length > 0) candidatos = enMunicipio;
    }
    const sugerencias = candidatos
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 3);

    if (sugerencias.length === 0) {
      return {
        id: crypto.randomUUID(),
        role: 'bot',
        texto: `No tengo registrado nada de ${cat.toLowerCase()}${municipioMencionado ? ` en ${municipioMencionado}` : ''
          } por ahora. Prueba con otra categoría o municipio.`,
        timestamp: Date.now(),
      };
    }

    // Si además había un dato de conocimiento (ej: "dónde comer comida típica"),
    // lo anteponemos al listado de lugares.
    const introsMunicipio = [
      `Estas son mis recomendaciones de ${cat.toLowerCase()} en ${municipioMencionado}:`,
      `En ${municipioMencionado} hay buenas opciones de ${cat.toLowerCase()}, mira:`,
      `Para ${cat.toLowerCase()} en ${municipioMencionado} te sugiero esto:`,
    ];
    const introsGeneral = [
      `Mira estas opciones de ${cat.toLowerCase()} en Los Tuxtlas:`,
      `Para ${cat.toLowerCase()} en la región te recomiendo:`,
      `Estas son mis sugerencias de ${cat.toLowerCase()}:`,
    ];
    let textoIntro = municipioMencionado
      ? introsMunicipio[Math.floor(Math.random() * introsMunicipio.length)]
      : introsGeneral[Math.floor(Math.random() * introsGeneral.length)];
    if (conocimiento) {
      textoIntro = `${conocimiento.respuesta}\n\n${textoIntro}`;
    }

    return {
      id: crypto.randomUUID(),
      role: 'bot',
      texto: textoIntro,
      lugares: sugerencias,
      timestamp: Date.now(),
    };
  }

  // PASO 3: caso especial monos / fauna
  if (intent === 'monos') {
    const fauna = catalogoActivo.filter(
      (l) => l.tags.includes('fauna') || l.tags.includes('monos')
    ).slice(0, 3);
    return {
      id: crypto.randomUUID(),
      role: 'bot',
      texto:
        'Si quieres ver monos y fauna, el clásico es el paseo en lancha por la laguna de Catemaco, que pasa por las islas de los monos:',
      lugares: fauna.length > 0 ? fauna : [catalogoActivo[0]],
      timestamp: Date.now(),
    };
  }

  // PASO 4: solo un municipio mencionado, sin categoría clara
  if (municipioMencionado) {
    const delMunicipio = catalogoActivo.filter(
      (l) => l.municipio === municipioMencionado
    )
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 3);
    const introsMuni = [
      `Lo más destacado de ${municipioMencionado}:`,
      `En ${municipioMencionado} no te puedes perder esto:`,
      `Mis recomendaciones para ${municipioMencionado}:`,
    ];
    return {
      id: crypto.randomUUID(),
      role: 'bot',
      texto: introsMuni[Math.floor(Math.random() * introsMuni.length)],
      lugares: delMunicipio,
      timestamp: Date.now(),
    };
  }

  // PASO 5: si quedó algún conocimiento suelto, úsalo
  if (conocimiento) {
    return {
      id: crypto.randomUUID(),
      role: 'bot',
      texto: conocimiento.respuesta,
      timestamp: Date.now(),
    };
  }

  // Default — no entendió — respuesta variada
  const defaultRespuestas = [
    '¿Qué tienes en mente? Puedo recomendarte lugares, decirte dónde comer, qué ver en Catemaco, San Andrés o Santiago, cómo moverte, o armarte una ruta completa.',
    'Cuéntame más. ¿Buscas algo de naturaleza, comida típica, aventura, hospedaje? O si quieres te armo una ruta personalizada.',
    'No te entendí del todo. Prueba preguntándome: "¿dónde comer en Catemaco?", "qué hacer en San Andrés", "lugares de naturaleza" o simplemente dime qué día llegas.',
  ];
  return {
    id: crypto.randomUUID(),
    role: 'bot',
    texto: defaultRespuestas[Math.floor(Math.random() * defaultRespuestas.length)],
    opciones: [{ label: '🔄 Armar nueva ruta', valor: '__restart__' }],
    timestamp: Date.now(),
  };
}