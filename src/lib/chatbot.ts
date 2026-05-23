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
import { tokenizar, contieneClave } from './pln';

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
  for (const { intent, words } of INTENT_KEYWORDS) {
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
      { label: '🏛️ Cultura e historia', valor: 'Cultura' },
      { label: '🍤 Gastronomía', valor: 'Gastronomia' },
      { label: '🏖️ Playa', valor: 'Playa' },
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

export function generarRuta(prefs: PreferenciasUsuario): DiaRuta[] {
  const recomendadosConScore = filtrarLugaresConRazones(prefs);
  if (recomendadosConScore.length === 0) return [];

  const recomendados = recomendadosConScore.map((s) => s.lugar);
  const seleccion = recomendados.slice(0, prefs.dias * 4);

  // Agrupar por municipio (para minimizar traslados)
  const porMunicipio: Record<string, Lugar[]> = {};
  seleccion.forEach((l) => {
    if (!porMunicipio[l.municipio]) porMunicipio[l.municipio] = [];
    porMunicipio[l.municipio].push(l);
  });

  const municipios = Object.keys(porMunicipio).sort(
    (a, b) => porMunicipio[b].length - porMunicipio[a].length
  );

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
    `Te puse ${primero.nombre} para empezar porque ${
      primero.categoria === 'Aventura' || primero.categoria === 'Naturaleza'
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
    return {
      id: crypto.randomUUID(),
      role: 'bot',
      texto:
        '¡Hola de nuevo! Pregúntame lo que necesites. Puedo recomendarte lugares, decirte dónde comer, cómo llegar, qué llevar, cuál es la mejor época para visitar, o armarte una ruta nueva. ¿Qué buscas?',
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
        texto: `No tengo registrado nada de ${cat.toLowerCase()}${
          municipioMencionado ? ` en ${municipioMencionado}` : ''
        } por ahora. Prueba con otra categoría o municipio.`,
        timestamp: Date.now(),
      };
    }

    // Si además había un dato de conocimiento (ej: "dónde comer comida típica"),
    // lo anteponemos al listado de lugares.
    let textoIntro = municipioMencionado
      ? `Esto es lo que te recomiendo de ${cat.toLowerCase()} en ${municipioMencionado}:`
      : `Mira estas opciones de ${cat.toLowerCase()} en Los Tuxtlas:`;
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
    return {
      id: crypto.randomUUID(),
      role: 'bot',
      texto: `Esto es lo más destacado de ${municipioMencionado}:`,
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

  // Default — no entendió
  return {
    id: crypto.randomUUID(),
    role: 'bot',
    texto:
      'No estoy seguro de haber entendido. Puedo ayudarte con: lugares qué visitar, dónde comer, cómo llegar y moverte, qué llevar, mejor época para visitar, seguridad, o info de un municipio (Catemaco, San Andrés, Santiago). También puedo armarte una ruta nueva.',
    opciones: [{ label: '🔄 Armar nueva ruta', valor: '__restart__' }],
    timestamp: Date.now(),
  };
}