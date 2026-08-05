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
  // Opcional: monto TOTAL en pesos que el turista mencionó literalmente
  // ("con un presupuesto de $6,000") — a diferencia de `presupuesto`
  // (que es solo un nivel bajo/medio/alto), esto es un número real que
  // permite calcular cuánto se lleva gastado y cuánto queda día por
  // día. Si no se mencionó un monto explícito, queda undefined y la
  // ruta simplemente no menciona presupuesto restante (no se inventa
  // un número que el turista no dio).
  montoTotalPesos?: number;
}

export interface MensajeChat {
  id: string;
  role: 'user' | 'bot';
  texto: string;
  opciones?: { label: string; valor: string }[];
  lugares?: Lugar[];
  // Coordenada del turista al momento de preguntar "cuánto tiempo me
  // tomaría llegar" — se usa SOLO para dibujar el mini-mapa estilo
  // "A → B" (tu ubicación → el lugar), igual que hace Google Maps. No
  // se guarda ni se comparte con nadie más; vive únicamente en este
  // mensaje del chat, en memoria.
  ubicacionUsuario?: [number, number];
  // La geometría REAL de la ruta (ya calculada por carretera para dar
  // la distancia/tiempo del texto) — se reusa para dibujar la línea
  // en el mini-mapa siguiendo las calles de verdad, en vez de una
  // línea recta. Hallazgo real de campo: antes se recalculaba una
  // línea recta "de vista previa" en el mini-mapa AUNQUE ya se tenía
  // la ruta real calculada para el texto — dos fuentes de verdad
  // distintas para la misma pregunta, y la que se veía (la línea) no
  // era la real.
  rutaGeometria?: [number, number][];
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

const MAPA_INTENT_CATEGORIA: Record<string, Categoria> = {
  comida: 'Gastronomia',
  hospedaje: 'Hospedaje',
  naturaleza: 'Naturaleza',
  aventura: 'Aventura',
}



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
//
// Hallazgo real de campo (QA): "Lanchas Catemaco" tiene una sola
// palabra "distintiva" después de filtrar "lanchas" — el nombre del
// MUNICIPIO, "Catemaco". Como es una palabra de los tres pueblos de
// la región, aparece constantísimo en cualquier pregunta libre ("crea
// una ruta en Catemaco", "qué restaurantes hay en Catemaco"...), y
// cada una de esas preguntas se estaba resolviendo por error como "el
// turista está preguntando específicamente por Lanchas Catemaco" —
// aunque no tuviera nada que ver con lanchas. Un nombre de municipio
// nunca distingue a un lugar de otro (todos están en alguno de los
// tres), así que se excluye aquí igual que "restaurante" u "hotel".
const PALABRAS_GENERICAS_LUGAR = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'y', 'restaurante', 'restaurant',
  'bar', 'cabañas', 'cabana', 'cabanas', 'reserva', 'ecologica', 'ecológica',
  'lanchas', 'cafe', 'café', 'hotel', 'hospedaje', 'tours', 'servicio',
  'salto', 'balneario', 'nueva', 'sucursal',
  // Municipios — nunca distinguen a un lugar de otro.
  'catemaco', 'tuxtla', 'santiago', 'andres', 'san',
]);

// Hallazgo real de campo (producción): "Lanchas "Catemaco"" es un
// prestador REAL ya registrado en la plataforma, con el nombre
// guardado literalmente con comillas. La versión anterior de esta
// función solo quitaba ACENTOS antes de comparar — las comillas se
// quedaban pegadas al token ('"catemaco"'), así que nunca coincidía
// exactamente con 'catemaco' en PALABRAS_GENERICAS_LUGAR, y el bug
// del municipio seguía pasando para cualquier prestador cuyo nombre
// llevara puntuación alrededor. Se reusa tokenizar() (de pln.ts), que
// ya quita TODA puntuación, no solo acentos — corrige esto de raíz
// para cualquier nombre con comillas, guiones, paréntesis, etc., no
// solo para este caso puntual.
function palabrasDistintivas(nombre: string): string[] {
  return tokenizar(nombre).filter(
    (p) => p.length >= 3 && !PALABRAS_GENERICAS_LUGAR.has(p)
  );
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
//
// Hallazgo real de campo (producción, prestadores reales registrados):
//   - "EL tegogolo feliz" reduce a 2 palabras distintivas — "tegogolo"
//     y "feliz" — y "la mitad" pedía solo 1 de las 2. Como "feliz" es
//     una palabra común de cualquier conversación normal ("qué feliz
//     estoy de venir..."), CUALQUIER mensaje que la mencionara
//     secuestraba la conversación como si preguntaran por este
//     negocio. Para nombres de 1 o 2 palabras distintivas, ahora se
//     exigen TODAS (no la mitad) — nombres más largos (3+) siguen
//     pidiendo solo la mitad, redondeando hacia arriba, como antes.
//   - "La Bicicleta Café" (San Andrés Tuxtla, catálogo original) y
//     "Bicicleta nueva sucursal" (Catemaco, prestador real) comparten
//     la ÚNICA palabra distintiva que les queda tras filtrar
//     genéricas: "bicicleta" — empate perfecto entre DOS negocios
//     reales distintos. Antes, el primero en el arreglo ganaba
//     siempre (el estático), sin importar qué municipio mencionara el
//     turista — "bicicleta en Catemaco" mostraba el de San Andrés. Si
//     el turista mencionó un municipio, ahora se usa para desempatar;
//     si sigue empatado, es ambigüedad real entre negocios distintos
//     — mejor no adivinar (devolver null) que mostrar con aparente
//     seguridad el que no es.
// Resultado de buscar un lugar por nombre — distingue TRES casos, no
// solo dos. Antes, un empate real entre negocios DISTINTOS (ver
// hallazgo real de campo: "bicicleta" empata entre "La Bicicleta
// Café" y "Bicicleta nueva sucursal") se trataba igual que "no
// encontré nada" — el mensaje caía en silencio a la nube, que sin
// ningún candado terminaba inventando distancias y hasta el
// municipio del lugar. Con este tipo, el llamador puede preguntar
// "¿cuál de estos dos?" en vez de dejar que la conversación se vaya
// a un camino que puede alucinar.
export type ResultadoBusquedaLugar =
  | { tipo: 'unico'; lugar: Lugar }
  | { tipo: 'ambiguo'; opciones: Lugar[] }
  | { tipo: 'ninguno' };

export function buscarLugarPorNombre(
  texto: string,
  catalogo: Lugar[]
): ResultadoBusquedaLugar {
  const tokens = tokenizar(texto);
  const municipioMencionado = detectarMunicipio(texto);

  const candidatos: { lugar: Lugar; coincidencias: number }[] = [];

  for (const lugar of catalogo) {
    const distintivas = palabrasDistintivas(lugar.nombre);
    if (distintivas.length === 0) continue;

    const coincidencias = distintivas.filter((p) =>
      tokens.some((t) => palabraCoincide(t, p))
    ).length;

    const umbralMinimo =
      distintivas.length <= 2 ? distintivas.length : Math.ceil(distintivas.length / 2);
    if (coincidencias < umbralMinimo) continue;

    candidatos.push({ lugar, coincidencias });
  }

  if (candidatos.length === 0) return { tipo: 'ninguno' };

  const mejorPuntaje = Math.max(...candidatos.map((c) => c.coincidencias));
  let empatados = candidatos.filter((c) => c.coincidencias === mejorPuntaje);

  if (empatados.length > 1 && municipioMencionado) {
    const delMunicipio = empatados.filter((c) => c.lugar.municipio === municipioMencionado);
    if (delMunicipio.length > 0) empatados = delMunicipio;
  }
  if (empatados.length > 1) {
    return { tipo: 'ambiguo', opciones: empatados.map((e) => e.lugar) };
  }

  return { tipo: 'unico', lugar: empatados[0].lugar };
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

// Hallazgo real de campo (QA): "Organiza una ruta de TRES DÍAS..." se
// interpretó como 2 días. La detección de días dependía ÚNICAMENTE de
// similitud semántica contra frases vagas de ejemplo ('varios días',
// 'toda la semana') — y "tres días" (la forma MÁS común y explícita de
// decirlo) no se parecía lo suficiente, en el espacio vectorial, a
// ninguna de ellas. Mismo principio que ya se aplicaba a categoría
// (categoriaPorPalabraClave primero, embeddings después): un número
// literal es una señal mucho más confiable que una similitud vaga, así
// que se prueba PRIMERO — los embeddings solo complementan cuando el
// turista no dio un número ("un fin de semana", "toda la semana").
const NUMERO_EN_PALABRAS: Record<string, number> = {
  un: 1, uno: 1, una: 1,
  dos: 2,
  tres: 3, cuatro: 3, cinco: 3, seis: 3, siete: 3, ocho: 3, nueve: 3, diez: 3,
};

function extraerDiasLiteral(texto: string): Dias | null {
  const tokens = tokenizar(texto);
  const idxDia = tokens.findIndex((t) => t === 'dia' || t === 'dias');
  if (idxDia <= 0) return null;
  const anterior = tokens[idxDia - 1];

  if (/^\d+$/.test(anterior)) {
    const n = parseInt(anterior, 10);
    return (n <= 1 ? 1 : n === 2 ? 2 : 3) as Dias;
  }
  if (anterior in NUMERO_EN_PALABRAS) {
    const n = NUMERO_EN_PALABRAS[anterior];
    return (n >= 3 ? 3 : n) as Dias;
  }
  return null;
}

// Detecta CON QUIÉN viaja el turista, de forma literal, con
// prioridad sobre la búsqueda semántica — mismo principio que ya se
// aplica a categoría, días y presupuesto (ver comentarios arriba).
//
// Hallazgo real de campo (QA): "Viajo con niños pequeños. ¿Qué
// actividades recomiendas?" dependía SOLO de que el texto se
// pareciera, en el espacio vectorial, a la frase de ejemplo "con
// niños" — funciona la mayoría de las veces, pero sin ninguna
// garantía, exactamente la misma fragilidad que ya se corrigió para
// los demás campos. El campo `ideal` (familia/pareja/solo/amigos) ya
// existe en cada lugar y ya se usa en el flujo de botones — aquí
// solo se conecta esa misma señal al texto libre.
//
// "solo/sola" es la única palabra de este grupo genuinamente
// ambigua en español — "quiero saber SOLO el precio" no tiene nada
// que ver con viajar solo. Por eso, a diferencia de las demás, exige
// una frase de dos palabras (verbo + solo/sola), nunca la palabra
// suelta.
// Detecta si preguntan por la política de mascotas de un lugar. Se
// usa el campo real `mascotas` (lo declara el prestador al
// registrarse) — si no está definido para ningún lugar relevante, se
// dice honestamente que no se tiene el dato, nunca se especula (ver
// hallazgo real de campo: la nube llegó a "sugerir" que una selva
// tropical probablemente no permite perros — puro invento).
export function esPreguntaSobreMascotas(texto: string): boolean {
  const tokens = tokenizar(texto);
  return ['perro', 'perros', 'perrito', 'perritos', 'mascota', 'mascotas'].some(
    (p) => tokens.includes(p)
  );
}

export function extraerGrupoLiteral(texto: string): GrupoViaje | null {
  const tokens = tokenizar(texto);
  const tieneAlguna = (palabras: string[]) =>
    palabras.some((p) => tokens.includes(p));

  if (
    tieneAlguna([
      'nino', 'ninos', 'nina', 'ninas',
      'hijo', 'hijos', 'hija', 'hijas',
      'familia', 'familiar',
    ])
  ) {
    return 'familia';
  }
  if (tieneAlguna(['pareja', 'novio', 'novia', 'esposo', 'esposa', 'conyuge'])) {
    return 'pareja';
  }
  if (tieneAlguna(['amigos', 'amigas', 'cuates'])) {
    return 'amigos';
  }

  // "solo/sola" es la única palabra de este grupo genuinamente
  // ambigua en español — "quiero saber SOLO el precio" no tiene nada
  // que ver con viajar solo. En vez de una lista fija de frases (que
  // se queda corta: "quiero ir solo" no estaba cubierta), se revisa
  // la palabra INMEDIATA ANTERIOR — igual que ya se hace para
  // detectar días. Si "solo/sola" viene después de un verbo de
  // movimiento en primera persona (voy, ando, viajo, vengo, ir, iré),
  // es "viajar sin compañía"; si viene después de casi cualquier otra
  // cosa (quiero, saber, necesito, el, la...), es "nada más".
  const idxSolo = tokens.findIndex((t) => t === 'solo' || t === 'sola');
  if (idxSolo > 0) {
    const anterior = tokens[idxSolo - 1];
    if (['voy', 'ando', 'viajo', 'vengo', 'ir', 'ire'].includes(anterior)) {
      return 'solo';
    }
  }
  return null;
}

// con prioridad sobre la similitud semántica de abajo. Exige una señal
// de moneda explícita ($, "pesos" o "mxn") pegada al número, para no
// confundirlo con cualquier otro número suelto de la oración (como la
// cantidad de días).
//
// Los umbrales de aquí (por día, dividiendo el total entre los días
// del viaje) son un punto de partida razonable, NO una calibración
// basada en precios reales de mercado — conviene ajustarlos conforme
// crezca el catálogo de precios reales de los prestadores.
// Detecta un presupuesto CUALITATIVO ("barato", "económico", "caro",
// "de lujo") — a diferencia de extraerPresupuestoLiteral (que exige
// un monto en pesos exacto), esto reconoce palabras comunes sin
// número y se compara directo contra el campo `precio` (bajo/medio/
// alto) de cada lugar.
//
// Hallazgo real de campo: "qué lugares son baratos para comer en
// Catemaco" no activaba ningún filtro — ni el literal (no hay monto),
// ni nada más — así que caía al orden por calificación de siempre,
// ignorando por completo la palabra "baratos" que sí dio el turista.
export function extraerPresupuestoCualitativo(texto: string): Presupuesto | null {
  const tokens = tokenizar(texto);
  if (
    ['barato', 'baratos', 'barata', 'baratas', 'economico', 'economicos', 'economica', 'economicas', 'accesible', 'accesibles'].some(
      (p) => tokens.includes(p)
    )
  ) {
    return 'bajo';
  }
  if (
    ['caro', 'caros', 'cara', 'caras', 'lujo', 'lujoso', 'lujosa', 'premium'].some((p) =>
      tokens.includes(p)
    )
  ) {
    return 'alto';
  }
  return null;
}

export function extraerPresupuestoLiteral(
  texto: string,
  diasParaPromedio: number
): { nivel: Presupuesto; monto: number } | null {
  const conSigno = texto.match(/\$\s?([\d.,]+)/);
  const conPalabra = texto.match(/([\d.,]+)\s*(mil\s+)?pesos\b/i) ??
    texto.match(/\b(\d[\d.,]*)\s*mxn\b/i);

  let monto: number | null = null;
  if (conSigno) {
    monto = parseFloat(conSigno[1].replace(/,/g, ''));
  } else if (conPalabra) {
    monto = parseFloat(conPalabra[1].replace(/,/g, ''));
    if (conPalabra[2]) monto *= 1000; // "6 mil pesos"
  }
  if (monto === null || Number.isNaN(monto) || monto <= 0) return null;

  const porDia = monto / Math.max(1, diasParaPromedio);
  const nivel: Presupuesto = porDia < 500 ? 'bajo' : porDia <= 1500 ? 'medio' : 'alto';
  return { nivel, monto };
}

export async function extraerPreferenciasLibres(
  texto: string
): Promise<Partial<PreferenciasUsuario>> {
  const resultado: Partial<PreferenciasUsuario> = {};

  // Hallazgo real de campo: "qué hotel me recomiendas barato en San
  // Andrés Tuxtla que esté cerca de hospitales" NO detectó Hospedaje
  // — el embedding de una frase larga con varias ideas a la vez
  // (municipio, presupuesto, proximidad a hospitales) diluye la señal
  // de una sola palabra como "hotel" dentro del promedio de toda la
  // oración. La detección por palabra clave (detectarIntent, ya
  // existente y usada en el motor de reglas) es mucho más confiable
  // para esto — "hotel" está literalmente en su lista — así que se
  // usa PRIMERO, con prioridad, y los embeddings solo complementan
  // (nunca sobreescriben) si detectan algo más.
  const intentDetectado = detectarIntent(texto);
  const categoriaPorPalabraClave = MAPA_INTENT_CATEGORIA[intentDetectado];
  if (categoriaPorPalabraClave) {
    resultado.intereses = [categoriaPorPalabraClave];
  }

  // Días y presupuesto literales — misma prioridad que la categoría
  // por palabra clave de arriba (ver hallazgo real de campo justo
  // antes de esta función).
  const diasLiteral = extraerDiasLiteral(texto);
  if (diasLiteral !== null) resultado.dias = diasLiteral;

  const presupuestoLiteral = extraerPresupuestoLiteral(texto, resultado.dias ?? 2);
  if (presupuestoLiteral !== null) {
    resultado.presupuesto = presupuestoLiteral.nivel;
    resultado.montoTotalPesos = presupuestoLiteral.monto;
  }

  const grupoLiteral = extraerGrupoLiteral(texto);
  if (grupoLiteral !== null) resultado.grupo = grupoLiteral;

  if (!embeddingsListo()) return resultado;

  const ejemplos = await prepararEjemplos();
  const vectorConsulta = await vectorizar(texto);
  const UMBRAL = 0.5;

  // Días y presupuesto: los embeddings solo complementan si NO hubo
  // señal literal arriba — un número explícito siempre gana.
  if (resultado.dias === undefined) {
    const dias = mejoresPorValor(vectorConsulta, ejemplos.dias, UMBRAL);
    if (dias.length > 0) resultado.dias = dias[0];
  }

  if (resultado.presupuesto === undefined) {
    const presupuesto = mejoresPorValor(vectorConsulta, ejemplos.presupuesto, UMBRAL);
    if (presupuesto.length > 0) resultado.presupuesto = presupuesto[0];
  }

  if (resultado.grupo === undefined) {
    const grupo = mejoresPorValor(vectorConsulta, ejemplos.grupo, UMBRAL);
    if (grupo.length > 0) resultado.grupo = grupo[0];
  }

  // Intereses SÍ es multi-etiqueta: un turista puede querer
  // "naturaleza y buena comida" en la misma frase — se incluyen
  // TODAS las categorías que superen el umbral, no solo la mejor.
  // Si la palabra clave ya encontró una (arriba), esto se AGREGA, no
  // reemplaza — por si el turista mencionó más de un interés.
  const interesesEmbeddings = mejoresPorValor(vectorConsulta, ejemplos.intereses, UMBRAL);
  if (interesesEmbeddings.length > 0) {
    const combinado = new Set([...(resultado.intereses ?? []), ...interesesEmbeddings]);
    resultado.intereses = [...combinado];
  }

  return resultado;
}

// Detección simple (por palabra clave, sin IA) de si el mensaje suena
// a "arma/organiza una ruta de varios días" — sirve para decidir SI
// vale la pena llamar a extraerPreferenciasLibres y generar un
// itinerario día por día, en vez de responder una recomendación
// puntual.
//
// Hallazgo real de campo (QA): con 'recomiendame'/'recomiéndame',
// 'visitar' y 'viaje' en esta lista, preguntas que NO piden un
// itinerario — "Recomiéndame un hotel cerca de la laguna", "¿Qué
// lugares naturales puedo visitar?", "Viajo con niños, ¿qué
// actividades recomiendas?" — disparaban el generador de rutas de
// varios días igual que si hubieran pedido una ruta completa. Con un
// catálogo todavía chico, eso producía itinerarios a medias ("día 2
// vacío") para lo que en realidad era una simple pregunta de
// recomendación. Se dejan solo las palabras que de verdad implican
// "arma un PLAN/ITINERARIO de varios pasos", no cualquier verbo
// relacionado con viajar o pedir una sugerencia.
// Palabras que indican una solicitud de contenido sexual/prostitución
// explícita, compra de drogas, o contratar violencia (sicarios,
// asesinos) — ninguna de estas es una petición turística legítima,
// sin importar cómo se enmarque (aunque venga disfrazada de "arma
// una ruta"). Esto NUNCA debe procesarse como una petición normal (ni
// por el motor de reglas, ni por el generador de rutas, ni mandarse a
// la nube). Se revisa ANTES que cualquier otra cosa en
// ChatAssistant.tsx.
//
// Hallazgo real de campo GRAVE (QA): mensajes explícitos pidiendo
// conseguir prostitución — incluyendo uno que mencionaba
// específicamente menores de edad — generaban una ruta turística
// normal de 3 días con lugares reales. La causa: el generador de
// rutas no tiene NINGÚN filtro de contenido — solo intenta extraer
// días/categoría/presupuesto de cualquier texto que reciba, sin
// importar qué diga. Esto se detiene aquí, ANTES de llegar a esa
// lógica — no se puede depender de que el proveedor de IA en la nube
// lo filtre solo (se comprobó inconsistente: a veces rechazaba, la
// mayoría de las veces no, porque nunca llegaba a la nube — se
// quedaba en el generador de rutas determinista, que no tiene ningún
// candado). Ampliado después a drogas y violencia por la misma razón
// exacta: "créame una ruta donde pueda comprar drogas" o "dónde
// consigo un sicario" pasaban igual de desprotegidos.
//
// Nota: "muertos" NO se incluye — el Día de Muertos es un tema
// turístico legítimo y muy común en México; bloquearlo generaría
// falsos positivos constantes con contenido cultural real.
const PALABRAS_CONTENIDO_SEXUAL_EXPLICITO = [
  'puta', 'putas', 'puto', 'putos',
  'prostituta', 'prostitutas', 'prostituto', 'prostitutos',
  'prostituas', 'prostitucion',
  'escort', 'escorts',
  'sexoservicio', 'sexoservidora', 'sexoservidoras',
];

const PALABRAS_DROGAS_ILEGALES = [
  'droga', 'drogas', 'narcotico', 'narcoticos',
  'cocaina', 'metanfetamina', 'cristal', 'fentanilo',
  'heroina', 'marihuana', 'mota', 'perico',
];

const PALABRAS_VIOLENCIA_CONTRATADA = [
  'sicario', 'sicarios', 'asesino', 'asesinos',
];

export function esSolicitudInapropiada(texto: string): boolean {
  const tokens = tokenizar(texto);
  return [
    ...PALABRAS_CONTENIDO_SEXUAL_EXPLICITO,
    ...PALABRAS_DROGAS_ILEGALES,
    ...PALABRAS_VIOLENCIA_CONTRATADA,
  ].some((p) => tokens.includes(p));
}

export function pareceSolicitudDeRuta(texto: string): boolean {
  const tokens = tokenizar(texto);
  const palabrasClave = [
    'ruta', 'rutas', 'itinerario', 'recorrido', 'recorridos',
    'plan', 'planea', 'arma', 'armame', 'ármame', 'organiza', 'organizame',
  ];
  return palabrasClave.some((p) => contieneClave(tokens, p));
}


// Elige aleatoriamente (ponderado por score) entre los K mejores
// candidatos restantes, en vez de tomar SIEMPRE el de mayor score a
// secas. Score más alto = más probable de salir elegido, pero nunca
// imposible para el resto del top-K — así se favorece la calidad sin
// ser 100% determinista. Ver hallazgo real de campo en generarRuta().
function elegirConVariedad<T extends { score: number }>(
  candidatos: T[],
  topK: number
): T {
  const pool = candidatos.slice(0, Math.min(topK, candidatos.length));
  const minScore = Math.min(...pool.map((c) => c.score));
  // +1 para que incluso el peor del grupo tenga una probabilidad real
  // (nunca peso cero, o nunca saldría).
  const pesos = pool.map((c) => c.score - minScore + 1);
  const total = pesos.reduce((a, b) => a + b, 0);
  let umbral = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    umbral -= pesos[i];
    if (umbral <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// Reordena toda la lista aplicando elegirConVariedad repetidamente —
// en cada "turno" saca uno del top-K restante, ponderado por score.
function ordenarConVariedad<T extends { score: number }>(
  candidatos: T[],
  topK: number
): T[] {
  const restantes = [...candidatos];
  const resultado: T[] = [];
  while (restantes.length > 0) {
    const elegido = elegirConVariedad(restantes, topK);
    resultado.push(elegido);
    restantes.splice(restantes.indexOf(elegido), 1);
  }
  return resultado;
}

// Detecta si el turista está preguntando "cuánto tiempo/distancia me
// tomaría llegar desde donde estoy" — a diferencia de "cuéntame sobre
// este lugar" (que ya resuelve buscarLugarPorNombre por sí solo). Esto
// necesita GPS + una llamada real de ruteo, así que SIEMPRE requiere
// internet (ver nota en ChatAssistant.tsx) — a propósito, no es un
// descuido: el modo offline es para consultar dudas comunes, no para
// cálculos en vivo que dependen de dónde estás parado ahora mismo.
export function pareceSolicitudDeDistancia(texto: string): boolean {
  const tokens = tokenizar(texto);
  if (['distancia', 'lejos'].some((p) => contieneClave(tokens, p))) return true;

  const tieneTiempo = ['tiempo', 'tardo', 'tardaria', 'tardaría', 'demoro', 'demoraria', 'demoraría'].some(
    (p) => contieneClave(tokens, p)
  );
  const tieneReferenciaAUbicacion = ['ubicacion', 'ubicación', 'llegar', 'llego', 'llegó'].some(
    (p) => contieneClave(tokens, p)
  );
  return tieneTiempo && tieneReferenciaAUbicacion;
}

export function generarRuta(prefs: PreferenciasUsuario): DiaRuta[] {
  const recomendadosConScore = filtrarLugaresConRazones(prefs);
  if (recomendadosConScore.length === 0) return [];

  // Hallazgo real de campo: "solo barajar empates exactos" casi nunca
  // se activaba en la práctica — el rating trae decimales distintos
  // por lugar (4.8 vs 4.6...), así que dos lugares rara vez terminan
  // con el MISMO score exacto. Resultado: con el mismo perfil de
  // turista (mismos intereses/presupuesto/grupo), SIEMPRE salía el
  // mismo lugar arriba (ej. "Reserva Ecológica Nanciyaga"), sin
  // importar cuántas veces se pidiera la ruta — nada variaba entre
  // turistas distintos.
  //
  // En vez de exigir empate exacto, se elige aleatoriamente (ponderado
  // por score) entre los 3 mejores candidatos en cada "turno" de
  // selección — los mejor calificados siguen siendo más probables
  // (nunca se recomienda algo que no encaja con el perfil solo por
  // variar), pero ya no es 100% determinista. Con pocos candidatos
  // por categoría (como hoy), esto ya cubre tanto "mostrar el mejor
  // calificado" como "rotar entre las opciones válidas" con un solo
  // mecanismo — según cuántos candidatos reales haya en cada caso.
  const recomendados = ordenarConVariedad(recomendadosConScore, 3).map(
    (s) => s.lugar
  );

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
  // Solo se calcula si el turista dio un monto REAL en pesos — si no
  // lo dio, esto queda en null y ningún día menciona presupuesto
  // restante (no se inventa un número que no existe).
  let presupuestoRestante = prefs.montoTotalPesos ?? null;

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
      let infoPresupuesto: { costoConocido: number; huboSinPrecio: boolean; restanteDespues: number } | null = null;
      if (presupuestoRestante !== null) {
        const costos = dia.map((l) => estimarPrecioMXN(l.precioMxn));
        const costoConocido = costos.reduce((s: number, c) => s + (c ?? 0), 0);
        const huboSinPrecio = costos.some((c) => c === null);
        presupuestoRestante -= costoConocido;
        infoPresupuesto = { costoConocido, huboSinPrecio, restanteDespues: presupuestoRestante };
      }
      dias.push({
        dia: i + 1,
        lugares: dia,
        resumen: armarResumen(i + 1, municipio, dia, prefs),
        razonamiento: armarRazonamiento(dia, prefs, infoPresupuesto),
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

// Estima un precio representativo (MXN) a partir del texto libre de
// `precioMxn` de cada lugar — SOLO cuando el texto menciona un único
// concepto de precio, sin ambigüedad. Muchos lugares mencionan más de
// un concepto a la vez (ej. Nanciyaga: "Entrada general $80. Hospedaje
// desde $1,600 – $2,200 por noche") — en esos casos NO se adivina cuál
// aplica para un día de ruta (¿la entrada o una noche completa?);
// mejor decir "no sé" que dar un número que podría ser el equivocado.
export function estimarPrecioMXN(precioMxn: string): number | null {
  const texto = precioMxn.toLowerCase();
  if (/\b(acceso libre|entrada libre|gratis|gratuit[oa])\b/.test(texto)) return 0;

  const regexRango = /\$\s?([\d,]+)\s*[–-]\s*\$?\s?([\d,]+)/;
  const matchRango = precioMxn.match(regexRango);

  if (matchRango) {
    // Si después de quitar el rango encontrado todavía queda OTRO
    // monto con $ suelto, el lugar tiene más de un concepto de precio.
    const restante = precioMxn.replace(regexRango, '');
    if (/\$\s?[\d,]+/.test(restante)) return null;
    const a = parseFloat(matchRango[1].replace(/,/g, ''));
    const b = parseFloat(matchRango[2].replace(/,/g, ''));
    return Number.isNaN(a) || Number.isNaN(b) ? null : (a + b) / 2;
  }

  const montosSueltos = [...precioMxn.matchAll(/\$\s?([\d,]+)/g)];
  if (montosSueltos.length === 1) {
    const n = parseFloat(montosSueltos[0][1].replace(/,/g, ''));
    return Number.isNaN(n) ? null : n;
  }
  return null; // 0 o 2+ montos sueltos sin rango claro: ambiguo
}

export function formatearMXN(monto: number): string {
  return `$${Math.round(Math.abs(monto)).toLocaleString('es-MX')}`;
}

// Convierte el valor interno de grupo a una frase natural para usar
// en las respuestas — "familia" se dice "ir con niños/en familia" en
// vez del valor crudo, que suena robótico en una oración.
export function grupoTextoLegible(grupo: GrupoViaje): string {
  switch (grupo) {
    case 'familia':
      return 'ir con niños o en familia';
    case 'pareja':
      return 'ir en pareja';
    case 'amigos':
      return 'ir con amigos';
    case 'solo':
      return 'viajar solo';
  }
}

function armarRazonamiento(
  lugares: Lugar[],
  prefs: PreferenciasUsuario,
  presupuestoInfo?: { costoConocido: number; huboSinPrecio: boolean; restanteDespues: number } | null
): string {
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
  // Presupuesto restante — SOLO si el turista dio un monto real (ver
  // hallazgo real de campo QA: "faltaron menciones de los precios para
  // recalcar el presupuesto del usuario"). Nunca se inventa un número
  // si no lo dio explícitamente.
  if (presupuestoInfo) {
    const { costoConocido, huboSinPrecio, restanteDespues } = presupuestoInfo;
    if (costoConocido === 0 && !huboSinPrecio) {
      partes.push(
        `Este día es gratis o de acceso libre — sigues teniendo ${formatearMXN(restanteDespues)} disponibles para el resto de la ruta.`
      );
    } else {
      const caveat = huboSinPrecio
        ? ' (según lo que sí tengo registrado — alguno de estos lugares no tiene precio exacto, así que puede variar)'
        : '';
      partes.push(
        restanteDespues < 0
          ? `Este día ronda ${formatearMXN(costoConocido)}${caveat} — con esto ya te pasarías del presupuesto por unos ${formatearMXN(restanteDespues)}.`
          : `Este día ronda ${formatearMXN(costoConocido)}${caveat} — te quedan aproximadamente ${formatearMXN(restanteDespues)} para el resto de la ruta.`
      );
    }
  }
  return partes.join(' ');
}

// Resuelve los IDs de EntradaConocimiento.lugares a objetos Lugar
// reales del catálogo activo — usado para que la tarjeta mostrada
// coincida con el lugar del que realmente habla el texto (ver
// hallazgo real de campo documentado en conocimiento.ts).
function lugaresDeConocimiento(
  conocimiento: ReturnType<typeof buscarConocimiento>
): Lugar[] {
  if (!conocimiento?.lugares?.length) return [];
  return conocimiento.lugares
    .map((id) => catalogoActivo.find((l) => l.id === id))
    .filter((l): l is Lugar => !!l);
}

// ─────────────── RESPUESTAS A TEXTO LIBRE ───────────────
export function responderTextoLibre(
  texto: string,
  _prefs: PreferenciasUsuario | null
): MensajeChat {
  const intent = detectarIntent(texto);
  const municipioMencionado = detectarMunicipio(texto);
  // Hallazgo real de campo (QA): "Viajo con niños pequeños. ¿Qué
  // actividades recomiendas?" no filtraba nada por eso — el campo
  // `ideal` (familia/pareja/solo/amigos) ya existe en cada lugar y ya
  // se usa en el flujo de botones, pero el texto libre nunca lo
  // conectaba. Se detecta aquí para usarlo en dos casos más abajo.
  const grupoPregunta = extraerGrupoLiteral(texto);

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
  const cat = MAPA_INTENT_CATEGORIA[intent];

  // Si hay conocimiento general Y NO hay una categoría de lugar clara,
  // responde con el conocimiento. Si hay categoría, los lugares ganan
  // (pero igual añadimos el dato de conocimiento si aplica).
  if (conocimiento && !cat && intent !== 'monos') {
    const lugaresLigados = lugaresDeConocimiento(conocimiento);
    return {
      id: crypto.randomUUID(),
      role: 'bot',
      texto: conocimiento.respuesta,
      lugares: lugaresLigados.length > 0 ? lugaresLigados : undefined,
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

    // Presupuesto EXPLÍCITO mencionado en la propia pregunta (ej. "que
    // no supere los $3,000") — a diferencia de generarRuta, aquí no
    // hay "días" para promediar: es un límite directo para elegir UN
    // lugar. Hallazgo real de campo: antes esto se ignoraba por
    // completo — "¿hay un hotel que no supere los $3,000?" listaba
    // todos los hospedajes sin filtrar ni confirmar cuáles entraban.
    const presupuestoPregunta = extraerPresupuestoLiteral(texto, 1);
    const presupuestoCualitativo = extraerPresupuestoCualitativo(texto);

    let sugerencias: Lugar[];
    let notaFiltro = '';

    if (presupuestoPregunta) {
      const conPrecio = candidatos.map((l) => ({
        lugar: l,
        estimado: estimarPrecioMXN(l.precioMxn),
      }));
      const dentro = conPrecio
        .filter((c) => c.estimado !== null && c.estimado <= presupuestoPregunta.monto)
        .sort((a, b) => b.lugar.rating - a.lugar.rating)
        .map((c) => c.lugar);
      // Lugares con precio AMBIGUO (varios conceptos, ej. Nanciyaga:
      // entrada + hospedaje + temazcal por separado) — no se puede
      // decir con certeza si "entran" o no en el presupuesto, así que
      // no se afirma ni se descarta, se es honesto al respecto.
      const sinPrecioClaro = conPrecio
        .filter((c) => c.estimado === null)
        .sort((a, b) => b.lugar.rating - a.lugar.rating)
        .map((c) => c.lugar);
      const fuera = conPrecio
        .filter((c) => c.estimado !== null && c.estimado > presupuestoPregunta.monto)
        .sort((a, b) => (a.estimado as number) - (b.estimado as number))
        .map((c) => c.lugar);

      if (dentro.length > 0) {
        sugerencias = dentro.slice(0, 3);
        notaFiltro = `Sí — con ${formatearMXN(presupuestoPregunta.monto)} tienes ${dentro.length === 1 ? 'esta opción' : 'estas opciones'} dentro de presupuesto:\n\n`;
      } else if (sinPrecioClaro.length > 0) {
        sugerencias = sinPrecioClaro.slice(0, 3);
        notaFiltro = `No tengo un precio único y comparable para confirmarte cuál entra exactamente en ${formatearMXN(presupuestoPregunta.monto)} (varios lugares cobran por actividad o servicio, no una sola tarifa) — aquí tienes las opciones registradas para que revises el detalle de cada una:\n\n`;
      } else if (fuera.length > 0) {
        sugerencias = fuera.slice(0, 3);
        notaFiltro = `Por ahora no tengo ninguna opción confirmada por debajo de ${formatearMXN(presupuestoPregunta.monto)} — la más cercana es esta:\n\n`;
      } else {
        sugerencias = [];
      }
    } else if (presupuestoCualitativo) {
      // Sin monto exacto, pero SÍ dijo "barato"/"caro"/etc. — se
      // compara contra el nivel de precio (bajo/medio/alto) de cada
      // lugar en vez de un número, y se avisa si nadie cae justo en
      // ese nivel en vez de mostrar el orden genérico sin explicar.
      const delNivel = candidatos
        .filter((l) => l.precio === presupuestoCualitativo)
        .sort((a, b) => b.rating - a.rating);
      if (delNivel.length > 0) {
        sugerencias = delNivel.slice(0, 3);
      } else {
        sugerencias = candidatos.sort((a, b) => b.rating - a.rating).slice(0, 3);
        notaFiltro = `No tengo ninguno marcado específicamente como ${presupuestoCualitativo === 'bajo' ? 'económico' : 'de lujo'} en esta categoría — aquí tienes las mejores opciones que sí tengo:\n\n`;
      }
    } else if (esPreguntaSobreMascotas(texto)) {
      // Mismo hallazgo real de campo que ya arreglamos para
      // presupuesto y grupo: "qué hoteles en Catemaco aceptan
      // perros" activa la categoría Hospedaje, así que sin este
      // tier la pregunta de mascotas se ignoraba por completo — se
      // devolvía el top-3 genérico de hospedaje sin decir nada del
      // perro. Usa el dato real (`mascotas`), nunca especula.
      const conDato = candidatos.filter((l) => l.mascotas !== undefined);
      if (conDato.length > 0) {
        sugerencias = conDato.slice(0, 3);
        notaFiltro = `Esto es lo que tengo registrado sobre mascotas en ${cat.toLowerCase()}${municipioMencionado ? ` en ${municipioMencionado}` : ''}:\n\n${conDato.map((l) => `${l.nombre}: ${l.mascotas}`).join('\n')}\n\n`;
      } else {
        sugerencias = candidatos.sort((a, b) => b.rating - a.rating).slice(0, 3);
        notaFiltro = `Todavía no tengo registrada la política de mascotas de ningún lugar de ${cat.toLowerCase()}${municipioMencionado ? ` en ${municipioMencionado}` : ''} — te recomiendo confirmar directamente antes de ir. Mientras tanto, aquí tienes las mejores opciones:\n\n`;
      }
    } else if (grupoPregunta) {
      // Sin presupuesto explícito, pero SÍ se dijo con quién viaja
      // ("con niños", "en pareja", etc.) — prioriza los lugares
      // marcados como ideales para ese grupo (mismo campo `ideal` que
      // ya usa el flujo de botones), sin descartar del todo los demás.
      const paraEseGrupo = candidatos
        .filter((l) => l.ideal.includes(grupoPregunta))
        .sort((a, b) => b.rating - a.rating);
      const otros = candidatos
        .filter((l) => !l.ideal.includes(grupoPregunta))
        .sort((a, b) => b.rating - a.rating);
      sugerencias = [...paraEseGrupo, ...otros].slice(0, 3);
      if (paraEseGrupo.length === 0) {
        notaFiltro = `No tengo ninguno marcado específicamente como ideal para ${grupoTextoLegible(grupoPregunta)}, pero estas son las mejores opciones que sí tengo:\n\n`;
      }
    } else {
      sugerencias = candidatos.sort((a, b) => b.rating - a.rating).slice(0, 3);
    }

    // Hallazgo real de campo (QA): "Muéstrame hoteles con alberca y
    // estacionamiento" hacía match con la ficha de precios de "La
    // Jungla Balneario" (por la palabra "alberca") — pero el texto
    // hablaba de La Jungla mientras la tarjeta mostrada era "Sirena
    // Olmeca" (el único lugar de la categoría detectada), porque son
    // dos búsquedas independientes. Si el conocimiento SÍ menciona
    // lugares concretos, esos van PRIMERO — la tarjeta debe coincidir
    // con lo que dice el texto, no con un top-3 genérico que puede ir
    // por otro lado. Se completa con el top-3 por categoría solo si
    // sobra espacio. Esto NO aplica si ya hay un filtro de presupuesto
    // explícito — ahí el presupuesto manda sobre la mención textual.
    if (!presupuestoPregunta) {
      const lugaresLigados = lugaresDeConocimiento(conocimiento);
      if (lugaresLigados.length > 0) {
        const idsYaIncluidos = new Set(lugaresLigados.map((l) => l.id));
        sugerencias = [
          ...lugaresLigados,
          ...sugerencias.filter((l) => !idsYaIncluidos.has(l.id)),
        ].slice(0, 3);
      }
    }

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
    if (notaFiltro) {
      textoIntro = notaFiltro + textoIntro;
    } else if (conocimiento) {
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

  // PASO 2.5: sin categoría clara, pero SÍ se dijo con quién viaja
  // ("¿qué actividades puedo hacer con niños?" — no mapea a ninguna
  // categoría específica, así que sin esto caía directo al mensaje
  // por default de "no entendí", ignorando por completo el dato real
  // que sí dio el turista).
  if (grupoPregunta) {
    let candidatosGrupo = catalogoActivo.filter((l) => l.ideal.includes(grupoPregunta));
    if (municipioMencionado) {
      const enMunicipio = candidatosGrupo.filter((l) => l.municipio === municipioMencionado);
      if (enMunicipio.length > 0) candidatosGrupo = enMunicipio;
    }
    if (candidatosGrupo.length > 0) {
      const sugerenciasGrupo = candidatosGrupo
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 3);
      return {
        id: crypto.randomUUID(),
        role: 'bot',
        texto: `Para ${grupoTextoLegible(grupoPregunta)}${municipioMencionado ? ` en ${municipioMencionado}` : ''}, te recomiendo:`,
        lugares: sugerenciasGrupo,
        timestamp: Date.now(),
      };
    }
  }

  // PASO 2.6: preguntan por política de mascotas ("¿qué lugares
  // aceptan perros?"). Usa el dato real (campo `mascotas`, lo declara
  // el prestador) — si nadie lo tiene registrado, dice honestamente
  // que no lo sabe en vez de especular con el nombre o la categoría
  // del lugar (ver hallazgo real de campo arriba de la función).
  if (esPreguntaSobreMascotas(texto)) {
    let candidatosMascotas = catalogoActivo.filter((l) => l.mascotas !== undefined);
    if (municipioMencionado) {
      const enMunicipio = candidatosMascotas.filter((l) => l.municipio === municipioMencionado);
      if (enMunicipio.length > 0) candidatosMascotas = enMunicipio;
    }
    if (candidatosMascotas.length > 0) {
      const listado = candidatosMascotas
        .slice(0, 5)
        .map((l) => `${l.nombre}: ${l.mascotas}`)
        .join('\n');
      return {
        id: crypto.randomUUID(),
        role: 'bot',
        texto: `Esto es lo que tengo registrado sobre mascotas:\n\n${listado}`,
        lugares: candidatosMascotas.slice(0, 3),
        timestamp: Date.now(),
      };
    }
    return {
      id: crypto.randomUUID(),
      role: 'bot',
      texto: 'Todavía no tengo registrada la política de mascotas de ningún lugar — te recomiendo confirmar directamente con ellos antes de ir.',
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