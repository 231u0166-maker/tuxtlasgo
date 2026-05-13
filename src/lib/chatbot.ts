import { LUGARES, Lugar, Categoria, Presupuesto } from '../data/lugares';

// Motor de recomendación 100% offline.
// Flujo conversacional guiado: el usuario navega un árbol de preguntas con
// botones o texto libre. El motor cruza sus respuestas con el catálogo de
// lugares y arma una ruta optimizada.
//
// Esto es lo que la memoria técnica llama "PLN local": no usa un LLM, sino
// reglas determinísticas sobre tags semánticos. Ventaja: corre 100% offline,
// es predecible para el demo y rapidísimo.

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
  // Botones de respuesta rápida que el bot ofrece
  opciones?: { label: string; valor: string }[];
  // Lista de lugares que el bot recomienda en este mensaje
  lugares?: Lugar[];
  // Ruta ordenada para un día específico
  rutaDia?: { dia: number; lugares: Lugar[]; resumen: string };
  timestamp: number;
}

// === Diálogo guiado: estados de la conversación ===
export type EstadoChat =
  | 'inicio'
  | 'preguntando_dias'
  | 'preguntando_intereses'
  | 'preguntando_presupuesto'
  | 'preguntando_grupo'
  | 'generando'
  | 'libre';

// Detección simple de intenciones en texto libre (para cuando ya pasó el flujo)
const INTENT_KEYWORDS: { intent: string; words: string[] }[] = [
  { intent: 'comida', words: ['comer', 'hambre', 'restaurante', 'comida', 'pescado', 'mariscos', 'gastronomia'] },
  { intent: 'hospedaje', words: ['dormir', 'hotel', 'posada', 'hospedaje', 'donde quedarme', 'alojarme'] },
  { intent: 'naturaleza', words: ['naturaleza', 'cascada', 'laguna', 'rio', 'verde', 'selva'] },
  { intent: 'aventura', words: ['aventura', 'extremo', 'caminar', 'senderismo', 'volcan', 'caminata'] },
  { intent: 'cultura', words: ['museo', 'historia', 'olmeca', 'cultura', 'arqueologia', 'iglesia'] },
  { intent: 'playa', words: ['playa', 'mar', 'arena', 'oleaje'] },
  { intent: 'precio', words: ['cuanto cuesta', 'precio', 'barato', 'gratis', 'economico'] },
  { intent: 'saludo', words: ['hola', 'buenas', 'hey', 'que tal', 'ayuda'] },
];

export function detectarIntent(texto: string): string {
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const { intent, words } of INTENT_KEYWORDS) {
    if (words.some((w) => t.includes(w))) return intent;
  }
  return 'desconocido';
}

// === Generador de mensaje inicial ===
export function mensajeBienvenida(): MensajeChat {
  return {
    id: crypto.randomUUID(),
    role: 'bot',
    texto:
      '¡Hola! Soy tu guía de TuxtlasGO 🌿. Te voy a armar una ruta personalizada en Los Tuxtlas. Primero dime: ¿cuántos días vas a estar?',
    opciones: [
      { label: '1 día (solo de paso)', valor: '1' },
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
      '¡Perfecto! Ahora dime, ¿qué te gusta más? Puedes elegir varios. Toca los que más te llamen la atención.',
    opciones: [
      { label: '🌳 Naturaleza', valor: 'Naturaleza' },
      { label: '🥾 Aventura', valor: 'Aventura' },
      { label: '🏛️ Cultura e historia', valor: 'Cultura' },
      { label: '🍤 Gastronomía', valor: 'Gastronomia' },
      { label: '🏖️ Playa', valor: 'Playa' },
      { label: '✅ Listo, ya escogí', valor: '__done__' },
    ],
    timestamp: Date.now(),
  };
}

export function mensajePresupuesto(): MensajeChat {
  return {
    id: crypto.randomUUID(),
    role: 'bot',
    texto: '¿Cómo va tu presupuesto?',
    opciones: [
      { label: '💸 Bajo (gratis y económicos)', valor: 'bajo' },
      { label: '💳 Medio (precios normales)', valor: 'medio' },
      { label: '💎 Alto (sin restricciones)', valor: 'alto' },
    ],
    timestamp: Date.now(),
  };
}

export function mensajeGrupo(): MensajeChat {
  return {
    id: crypto.randomUUID(),
    role: 'bot',
    texto: '¿Con quién viajas?',
    opciones: [
      { label: '🧍 Solo / sola', valor: 'solo' },
      { label: '💕 En pareja', valor: 'pareja' },
      { label: '👨‍👩‍👧 Familia con niños', valor: 'familia' },
      { label: '🎉 Con amigos', valor: 'amigos' },
    ],
    timestamp: Date.now(),
  };
}

// === Núcleo: filtrado y ranking de lugares ===
export function filtrarLugares(prefs: PreferenciasUsuario): Lugar[] {
  // 1. Filtro duro por presupuesto
  const ordenPresup: Presupuesto[] = ['bajo', 'medio', 'alto'];
  const maxPresup = ordenPresup.indexOf(prefs.presupuesto);

  // 2. Calcular score: matches de intereses + grupo
  const scored = LUGARES.map((lugar) => {
    let score = 0;
    // Match categoría
    if (prefs.intereses.includes(lugar.categoria)) score += 5;
    // Match grupo
    if (lugar.ideal.includes(prefs.grupo)) score += 3;
    // Bonus rating
    score += lugar.rating;
    // Bonus destacado
    if (lugar.destacado) score += 1.5;
    // Penalización si excede presupuesto
    const presupLugar = ordenPresup.indexOf(lugar.precio);
    if (presupLugar > maxPresup) score -= 4;
    return { lugar, score };
  });

  // 3. Ordenar y filtrar
  return scored
    .sort((a, b) => b.score - a.score)
    .filter((s) => s.score > 3)
    .map((s) => s.lugar);
}

// === Generador de rutas por día ===
// Distribuye lugares en N días agrupándolos por proximidad geográfica
// (mismo municipio = mismo día siempre que sea posible) y mezclando categorías.
export function generarRuta(
  prefs: PreferenciasUsuario
): { dia: number; lugares: Lugar[]; resumen: string }[] {
  const recomendados = filtrarLugares(prefs);
  if (recomendados.length === 0) return [];

  // Tomar más lugares que días*4 para tener margen
  const seleccion = recomendados.slice(0, prefs.dias * 4);

  // Agrupar por municipio
  const porMunicipio: Record<string, Lugar[]> = {};
  seleccion.forEach((l) => {
    if (!porMunicipio[l.municipio]) porMunicipio[l.municipio] = [];
    porMunicipio[l.municipio].push(l);
  });

  // Distribuir: cada día prioriza un municipio
  const municipios = Object.keys(porMunicipio).sort(
    (a, b) => porMunicipio[b].length - porMunicipio[a].length
  );

  const dias: { dia: number; lugares: Lugar[]; resumen: string }[] = [];
  const lugaresPorDia = prefs.dias === 1 ? 3 : prefs.dias === 2 ? 3 : 3;

  for (let i = 0; i < prefs.dias; i++) {
    const municipio = municipios[i % municipios.length];
    const lugaresMuni = porMunicipio[municipio] || [];

    // Mezclar categorías: 1 naturaleza/aventura + 1 cultura/comida + 1 hospedaje
    const dia: Lugar[] = [];
    const usados = new Set<string>();
    const yaSeleccionados = new Set(dias.flatMap((d) => d.lugares.map((l) => l.id)));

    // Prioridad 1: del municipio del día
    for (const l of lugaresMuni) {
      if (dia.length >= lugaresPorDia) break;
      if (yaSeleccionados.has(l.id) || usados.has(l.id)) continue;
      // Evitar repetir misma categoría
      if (dia.some((d) => d.categoria === l.categoria) && l.categoria !== 'Gastronomia') continue;
      dia.push(l);
      usados.add(l.id);
    }

    // Rellenar de otros municipios si falta
    for (const l of seleccion) {
      if (dia.length >= lugaresPorDia) break;
      if (yaSeleccionados.has(l.id) || usados.has(l.id)) continue;
      if (dia.some((d) => d.categoria === l.categoria) && l.categoria !== 'Gastronomia') continue;
      dia.push(l);
      usados.add(l.id);
    }

    // Ordenar el día: naturaleza/aventura primero (mañana), gastronomía a media tarde
    dia.sort((a, b) => {
      const orden: Record<Categoria, number> = {
        Aventura: 1,
        Naturaleza: 2,
        Cultura: 3,
        Playa: 4,
        Gastronomia: 5,
        Hospedaje: 6,
      };
      return orden[a.categoria] - orden[b.categoria];
    });

    if (dia.length > 0) {
      dias.push({
        dia: i + 1,
        lugares: dia,
        resumen: armarResumen(i + 1, municipio, dia, prefs),
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
  const tipos = [...new Set(lugares.map((l) => l.categoria.toLowerCase()))].join(', ');
  const conQuien =
    prefs.grupo === 'pareja'
      ? 'una experiencia romántica'
      : prefs.grupo === 'familia'
      ? 'un día familiar'
      : prefs.grupo === 'amigos'
      ? 'una aventura con amigos'
      : 'un recorrido a tu ritmo';
  return `Día ${numDia} · ${municipio}. Pensado como ${conQuien}, mezcla ${tipos}.`;
}

// === Respuestas a texto libre (modo "ya terminó el flujo guiado") ===
export function responderTextoLibre(
  texto: string,
  prefs: PreferenciasUsuario | null
): MensajeChat {
  const intent = detectarIntent(texto);

  if (intent === 'saludo') {
    return {
      id: crypto.randomUUID(),
      role: 'bot',
      texto: '¡Hola! ¿Qué buscas hoy? Puedes pedirme "donde comer", "playas cerca", "qué hacer un día" o "hotel económico".',
      timestamp: Date.now(),
    };
  }

  const mapaIntentCat: Record<string, Categoria> = {
    comida: 'Gastronomia',
    hospedaje: 'Hospedaje',
    naturaleza: 'Naturaleza',
    aventura: 'Aventura',
    cultura: 'Cultura',
    playa: 'Playa',
  };
  const cat = mapaIntentCat[intent];
  if (cat) {
    const sugerencias = LUGARES.filter((l) => l.categoria === cat)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 3);
    return {
      id: crypto.randomUUID(),
      role: 'bot',
      texto: `Mira lo que tengo en ${cat.toLowerCase()}:`,
      lugares: sugerencias,
      timestamp: Date.now(),
    };
  }

  // Default: ofrecer rearmar ruta
  return {
    id: crypto.randomUUID(),
    role: 'bot',
    texto:
      'No estoy seguro de entender. ¿Quieres que te arme una ruta nueva? Puedes preguntarme también por: comida, hospedaje, naturaleza, aventura, cultura o playa.',
    opciones: [{ label: '🔄 Armar nueva ruta', valor: '__restart__' }],
    timestamp: Date.now(),
  };
}
