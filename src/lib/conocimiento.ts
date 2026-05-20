// ============================================================
// BASE DE CONOCIMIENTO — Motor de PLN de TuxtlasGO
// ============================================================
// Información verificada directamente con los 10 establecimientos
// de Los Tuxtlas. La IA responde con estos datos cuando el turista
// pregunta sobre precios, horarios, cómo llegar, qué comer, etc.
// 100% offline — no consulta ninguna API en tiempo real.
// ============================================================

import { tokenizar, contarCoincidencias } from './pln';

export interface EntradaConocimiento {
  claves: string[];
  titulo: string;
  respuesta: string;
}

export const BASE_CONOCIMIENTO: EntradaConocimiento[] = [
  // ─── PRECIOS POR LUGAR ────────────────────────────────────
  {
    claves: ['margiros', 'precio margiros', 'cuesta margiros', 'cuanto margiros'],
    titulo: 'Precios Restaurante Margiros',
    respuesta:
      'Restaurante Margiros tiene precios de $100 a $300 por persona. Abre todos los días de 8 am a 8 pm. Ambiente relajado, ideal para desayunos, almuerzos y cenas. Acepta familias con niños.',
  },
  {
    claves: ['palapas gorel', 'gorel', 'precio gorel', 'cuanto gorel'],
    titulo: 'Precios Palapas Gorel',
    respuesta:
      'Palapas Gorel tiene precios de $100 a $200 por persona. Abre de 9 am a 6 pm. Tiene espacios al aire libre, buen café, cócteles y acepta tarjetas. Accesible para personas en silla de ruedas.',
  },
  {
    claves: ['bicicleta cafe', 'bicicleta', 'precio bicicleta', 'cafe san andres'],
    titulo: 'Precios La Bicicleta Café',
    respuesta:
      'La Bicicleta Café tiene precios de $100 a $200 por persona. Abre de 7 am a 11 pm, con servicio hasta la madrugada. Tiene Wi-Fi gratis, postres, vinos y cervezas. También hace entregas a domicilio.',
  },
  {
    claves: ['moyotera', 'precio moyotera', 'cuanto moyotera', 'restaurant bar'],
    titulo: 'Precios La Moyotera',
    respuesta:
      'La Moyotera tiene precios de $200 a $300 por persona. Abre de 9 am a 9 pm. Especialidades: pulpo a la parrilla, mojarra al chilpaya y la Torta Moyotera. Vistas al atardecer sobre la laguna de Catemaco desde sus terrazas.',
  },
  {
    claves: ['hechizo', 'hechizo de amor', 'precio hechizo', 'rooftop', 'bar catemaco'],
    titulo: 'Precios Hechizo de Amor',
    respuesta:
      'Hechizo de Amor tiene precios de $200 a $300 por persona. Abre de 12 pm a 11 pm. Es un rooftop bar con vistas al lago de Catemaco. Hacen licores artesanales con chagalapoli, un fruto endémico de Los Tuxtlas. Perfecto para parejas al atardecer.',
  },
  {
    claves: ['nanciyaga', 'precio nanciyaga', 'cuanto nanciyaga', 'reserva ecologica'],
    titulo: 'Precios Nanciyaga',
    respuesta:
      'Nanciyaga: entrada general $80 por persona. Hospedaje desde $1,600 hasta $2,200 por noche. Abre de 9 am a 7 pm. Incluye senderos de selva, kayak hacia islas con monos, aplicación de barro mineral y rituales con chamanes. Fue escenario de la película Apocalypto.',
  },
  {
    claves: ['sirena olmeca', 'sirena', 'cabanas catemaco', 'precio sirena'],
    titulo: 'Precios Sirena Olmeca',
    respuesta:
      'Sirena Olmeca: restaurante $150 a $350 por persona. Hospedaje $800 a $1,200 por noche. Abre de 9 am a 6 pm. Está a 45 minutos de Catemaco, donde el mar abierto se junta con la laguna. Ideal para desconectarse totalmente.',
  },
  {
    claves: ['jungla', 'balneario', 'la jungla', 'precio jungla', 'alberca'],
    titulo: 'Precios La Jungla Balneario',
    respuesta:
      'La Jungla Balneario: entrada $60 por persona. Camping desde $100 por noche. Abre de 8 am a 6 pm todos los días. Tiene albercas de agua de manantial natural (muy fría), tobogán entre los árboles, muelle al lago y vistas panorámicas. Perfecto para familias.',
  },
  {
    claves: ['eyipantla', 'cascada', 'salto', 'precio eyipantla', 'entrada cascada'],
    titulo: 'Precio Eyipantla',
    respuesta:
      'La Cascada El Salto de Eyipantla tiene una entrada de aproximadamente $50 por persona. Abre de 7 am a 7 pm. Es una de las cascadas más impresionantes de Veracruz, rodeada de selva tropical. Ideal para fotos y caminatas.',
  },
  {
    claves: ['cerro venado', 'cerro del venado', 'precio cerro', 'caminata'],
    titulo: 'Cerro del Venado',
    respuesta:
      'El Cerro del Venado tiene acceso libre (gratuito). Ofrece vistas panorámicas únicas de San Andrés Tuxtla. Ideal para caminatas y fotografías. Lleva agua y calzado cómodo. El ascenso toma aproximadamente 1 hora.',
  },

  // ─── DÓNDE COMER ─────────────────────────────────────────
  {
    claves: ['donde comer', 'que comer', 'restaurante', 'comida', 'cenar', 'desayunar', 'almorzar'],
    titulo: 'Dónde comer en Los Tuxtlas',
    respuesta:
      'En Catemaco tienes varias opciones: La Moyotera (mariscos y vistas a la laguna, $200-300), Palapas Gorel (ambiente al aire libre, $100-200), Restaurante Margiros (cocina variada, $100-300) y Hechizo de Amor (rooftop bar, $200-300). En San Andrés Tuxtla está La Bicicleta Café (café y cenas hasta la madrugada, $100-200). ¿Buscas algo específico o tienes un presupuesto en mente?',
  },
  {
    claves: ['mariscos', 'pescado', 'mojarra', 'pulpo', 'camarones'],
    titulo: 'Mariscos en Los Tuxtlas',
    respuesta:
      'Para mariscos la mejor opción es La Moyotera en Catemaco — especialistas en pulpo a la parrilla, mojarra al chilpaya y tienen vistas al lago ($200-300). También puedes encontrar mariscos frescos en Palapas Gorel ($100-200).',
  },
  {
    claves: ['cafe', 'cafetería', 'postres', 'desayuno'],
    titulo: 'Cafeterías y desayunos',
    respuesta:
      'La Bicicleta Café en San Andrés Tuxtla es la mejor opción para café de especialidad, postres y desayunos ($100-200, abre 7am). En Catemaco, Palapas Gorel y Restaurante Margiros también sirven buenos desayunos desde las 8-9 am.',
  },

  // ─── HOSPEDAJE ───────────────────────────────────────────
  {
    claves: ['donde dormir', 'hotel', 'hospedaje', 'cabaña', 'cabana', 'pernoctar', 'donde quedarme'],
    titulo: 'Hospedaje en Los Tuxtlas',
    respuesta:
      'Para hospedarte tienes dos opciones naturales: Nanciyaga ($1,600-$2,200/noche), reserva ecológica con cabañas en plena selva, kayak y ritales con chamanes. O Sirena Olmeca ($800-$1,200/noche), complejo rústico donde el mar se junta con la laguna, ideal para desconectarse. La Jungla Balneario también tiene camping desde $100/noche.',
  },
  {
    claves: ['camping', 'acampar', 'tienda', 'carpa'],
    titulo: 'Camping en Los Tuxtlas',
    respuesta:
      'La Jungla Balneario tiene área de camping desde $100 por noche, con acceso a sus albercas naturales, muelle y vistas al lago. Es la opción más económica para quedarte en la naturaleza de Catemaco.',
  },

  // ─── NATURALEZA Y AVENTURA ───────────────────────────────
  {
    claves: ['naturaleza', 'selva', 'aventura', 'ecoturismo', 'senderismo', 'sendero'],
    titulo: 'Naturaleza y aventura en Los Tuxtlas',
    respuesta:
      'Para naturaleza y aventura tienes: La Cascada de Eyipantla (50 metros de caída, $50 entrada), Nanciyaga (4 hectáreas de selva, kayak, monos, $80 entrada), La Jungla Balneario (albercas de manantial, tobogán en selva, $60 entrada) y el Cerro del Venado (vistas panorámicas, acceso libre). Todos están en los alrededores de Catemaco y San Andrés Tuxtla.',
  },
  {
    claves: ['monos', 'macacos', 'kayak', 'lancha', 'laguna'],
    titulo: 'Monos y actividades en la laguna',
    respuesta:
      'Para ver los monos macacos en la laguna de Catemaco, lo mejor es ir a Nanciyaga — hacen paseos en kayak hacia las islas donde viven los monos (incluido en la entrada de $80). También puedes contratar lanchas desde el malecón de Catemaco.',
  },
  {
    claves: ['cascada', 'waterfall', 'salto de agua'],
    titulo: 'La cascada de Eyipantla',
    respuesta:
      'El Salto de Eyipantla es la cascada más impresionante de la región — 50 metros de caída libre en plena selva. Entrada ~$50, abre de 7am a 7pm. A 14 km de San Andrés Tuxtla. Ve en la mañana para mejor luz en las fotos.',
  },

  // ─── HORARIOS ────────────────────────────────────────────
  {
    claves: ['horario', 'a que hora', 'cuando abre', 'cuando cierra', 'que hora'],
    titulo: 'Horarios en Los Tuxtlas',
    respuesta:
      'Horarios de los principales lugares: Margiros 8am-8pm • Palapas Gorel 9am-6pm • Bicicleta Café 7am-11pm • Moyotera 9am-9pm • Hechizo de Amor 12pm-11pm • Nanciyaga 9am-7pm • Jungla Balneario 8am-6pm • Sirena Olmeca 9am-6pm • Eyipantla 7am-7pm. ¿De cuál quieres saber más?',
  },

  // ─── CÓMO LLEGAR ─────────────────────────────────────────
  {
    claves: ['como llegar', 'como llego', 'transporte', 'autobus', 'desde veracruz', 'desde cdmx'],
    titulo: 'Cómo llegar a Los Tuxtlas',
    respuesta:
      'Desde el puerto de Veracruz son unas 2.5 horas por la carretera federal 180 hacia San Andrés Tuxtla y Catemaco. Hay autobuses ADO que salen seguido. Desde la CDMX son unas 7-8 horas en auto o puedes volar a Veracruz/Minatitlán y luego tomar carretera.',
  },

  // ─── CLIMA ───────────────────────────────────────────────
  {
    claves: ['clima', 'calor', 'lluvia', 'temperatura', 'frio', 'cuando ir'],
    titulo: 'Clima de Los Tuxtlas',
    respuesta:
      'Los Tuxtlas tiene clima tropical húmedo, caluroso casi todo el año (22-32°C). Llueve más de junio a octubre. La mejor época para visitar es de noviembre a abril — menos lluvia, caminos en mejor estado y cascadas con buen caudal. Lleva siempre repelente de insectos.',
  },

  // ─── QUÉ LLEVAR ──────────────────────────────────────────
  {
    claves: ['que llevar', 'que traer', 'que empacar', 'ropa', 'equipaje'],
    titulo: 'Qué llevar a Los Tuxtlas',
    respuesta:
      'Lleva ropa ligera, calzado cómodo para caminar, gorra o sombrero, bloqueador solar y repelente de insectos (la selva tiene moscos). Para la cascada de Eyipantla y la Jungla Balneario lleva ropa de baño y toalla. Para Nanciyaga puedes ir en ropa cómoda — te prestarán lo necesario para el barro mineral.',
  },

  // ─── RESERVACIONES ───────────────────────────────────────
  {
    claves: ['reservar', 'reservacion', 'apartar', 'mesa', 'cupo', 'disponibilidad'],
    titulo: 'Cómo reservar en Los Tuxtlas',
    respuesta:
      'Para reservar puedes contactar directamente a los establecimientos. Nanciyaga y Sirena Olmeca convienen reservarlos con anticipación si quieres hospedarte. Hechizo de Amor es recomendable llegar antes de las 6pm para asegurar mesa en el atardecer. Los demás restaurantes generalmente no requieren reservación previa.',
  },

  // ─── BEBIDAS ARTESANALES ─────────────────────────────────
  {
    claves: ['licor', 'gin', 'artesanal', 'bebida', 'chagalapoli', 'vermut', 'coctel'],
    titulo: 'Bebidas artesanales',
    respuesta:
      'Hechizo de Amor en Catemaco es famoso por sus licores artesanales — ginebras, vermuts y cócteles saborizados con frutas de la región, incluyendo el chagalapoli, un fruto silvestre endémico de Los Tuxtlas parecido al arándano. Es el lugar ideal para probar algo único que no encontrarás en otro lado.',
  },

  // ─── CHAMANES Y RITUALES ─────────────────────────────────
  {
    claves: ['chaman', 'ritual', 'limpia', 'brujo', 'magia', 'espiritual'],
    titulo: 'Chamanes y rituales',
    respuesta:
      'Para experiencias con chamanes y rituales de sanación, Nanciyaga es el lugar indicado — tienen chamanes locales y rituales auténticos incluidos en la visita. También ofrecen la aplicación de barro mineral, que es una experiencia única de bienestar. La reserva está a 7 km de Catemaco.',
  },
];

// Busca la entrada más relevante de la base de conocimiento
// usando el módulo PLN para tolerar errores ortográficos.
export function buscarConocimiento(texto: string): EntradaConocimiento | null {
  const tokens = tokenizar(texto);
  let mejorEntrada: EntradaConocimiento | null = null;
  let mejorPuntaje = 0;

  for (const entrada of BASE_CONOCIMIENTO) {
    const puntaje = contarCoincidencias(tokens, entrada.claves);
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejorEntrada = entrada;
    }
  }

  return mejorPuntaje > 0 ? mejorEntrada : null;
}
