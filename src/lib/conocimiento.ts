// ============================================================
// BASE DE CONOCIMIENTO GENERAL — LOS TUXTLAS
// ============================================================
// Información verificada sobre la región que NO es un "lugar"
// sino conocimiento práctico: clima, transporte, comida típica,
// seguridad, mejor época para visitar.
//
// El motor del asistente (chatbot.ts) consulta esta base para
// responder preguntas más allá de "¿qué lugares hay?". Esto es
// lo que le da profundidad al asistente offline.
//
// Fuentes: gobierno municipal de San Andrés Tuxtla, INAH,
// El Universal, México Desconocido, datos climáticos de la
// estación Los Tuxtlas (UNAM), operadoras de autobús ADO.
// ============================================================

import { tokenizar, contarCoincidencias } from './pln';

export interface EntradaConocimiento {
  // Palabras/frases que disparan esta entrada
  claves: string[];
  // Título corto del tema
  titulo: string;
  // Respuesta que da el asistente
  respuesta: string;
}

export const BASE_CONOCIMIENTO: EntradaConocimiento[] = [
  // ─────────────── CLIMA Y MEJOR ÉPOCA ───────────────
  {
    claves: [
      'clima',
      'temperatura',
      'calor',
      'frio',
      'tiempo',
      'lluvia',
      'lluvias',
      'llueve',
      'que tan caluroso',
      'hace calor',
    ],
    titulo: 'Clima de Los Tuxtlas',
    respuesta:
      'Los Tuxtlas tiene clima tropical húmedo. La temperatura suele ir de 16 °C a 31 °C durante el año, con calor y humedad casi siempre. Llueve buena parte del año, pero la temporada de lluvias fuertes va de junio a febrero, siendo agosto, septiembre y octubre los meses más lluviosos. La temporada seca va de marzo a mayo, y mayo es el mes más seco.',
  },
  {
    claves: [
      'mejor epoca',
      'cuando ir',
      'cuando visitar',
      'mejor mes',
      'que mes',
      'temporada',
      'cuando es bueno',
      'mejor temporada',
    ],
    titulo: 'Mejor época para visitar',
    respuesta:
      'La mejor época para visitar Los Tuxtlas es la temporada seca, de diciembre a mayo: hay menos lluvia y se disfrutan mejor las cascadas, la laguna y las playas. Si vienes en temporada de lluvias (junio a noviembre), el paisaje está más verde y exuberante, pero conviene llevar impermeable y revisar el clima del día. Evita planear actividades al aire libre con tormenta.',
  },
  {
    claves: [
      'que llevar',
      'que empacar',
      'que ropa',
      'que necesito llevar',
      'recomendaciones de viaje',
      'que meter a la maleta',
      'equipaje',
    ],
    titulo: 'Qué llevar a Los Tuxtlas',
    respuesta:
      'Para Los Tuxtlas te recomiendo: ropa ligera y fresca, calzado cómodo (hay caminatas y escalones, sobre todo en Eyipantla), bloqueador solar, repelente de insectos, gorra o sombrero, y un impermeable o poncho ligero por si llueve. Si vas a la sierra o a los miradores, lleva un suéter porque arriba refresca. No olvides traer efectivo: en muchos lugares pequeños no aceptan tarjeta.',
  },

  // ─────────────── TRANSPORTE Y CÓMO LLEGAR ───────────────
  {
    claves: [
      'como llegar',
      'como llego',
      'desde veracruz',
      'desde cdmx',
      'desde mexico',
      'autobus',
      'ado',
      'camion',
      'transporte',
      'llegar a los tuxtlas',
      'llegar a catemaco',
    ],
    titulo: 'Cómo llegar a Los Tuxtlas',
    respuesta:
      'Desde el puerto de Veracruz son unas 2.5 horas en auto por la carretera federal 180. En autobús, ADO y AU tienen salidas frecuentes a San Andrés Tuxtla y Catemaco. Desde la Ciudad de México son unas 7-8 horas en auto, o autobús directo desde la TAPO. El aeropuerto más cercano es el de Veracruz (unos 140 km); de ahí se sigue en autobús o auto.',
  },
  {
    claves: [
      'moverse',
      'transporte local',
      'entre municipios',
      'de catemaco a san andres',
      'de san andres a catemaco',
      'como me muevo',
      'taxi',
      'distancia entre',
    ],
    titulo: 'Cómo moverse entre los municipios',
    respuesta:
      'Los tres municipios están conectados por la carretera federal 180. San Andrés Tuxtla y Catemaco están a solo unos 12 km (15-20 min); hay autobuses ADO entre ellos con varias salidas al día por unos $12-$55. Santiago Tuxtla está al oeste de San Andrés. Dentro de los pueblos te mueves en taxi o a pie. Si quieres llegar a playas o la sierra, conviene auto propio o tour, porque el transporte público es limitado.',
  },

  // ─────────────── COMIDA TÍPICA ───────────────
  {
    claves: [
      'comida tipica',
      'que comer',
      'platillo tipico',
      'gastronomia',
      'comida tradicional',
      'antojito',
      'especialidad',
      'que se come',
      'tegogolo',
      'tegogolos',
    ],
    titulo: 'Comida típica de Los Tuxtlas',
    respuesta:
      'La estrella de la región son los tegogolos, un caracol de agua dulce de la laguna de Catemaco, que se prepara en coctel o ceviche con chile, jitomate y limón. Otro platillo curioso es la carne de chango: no es mono, es cerdo ahumado con hojas de olor. Prueba también la mojarra en tachogobi (asada a las brasas con salsa de tomate de monte), la anguila ahumada y el arroz a la tumbada. De antojitos: garnachas, picadas y empanadas. De dulce, el pan de marquesote y los dulces de coco de Santiago Tuxtla. El malecón de Catemaco y el mercado municipal son los mejores lugares para probar todo esto.',
  },
  {
    claves: [
      'donde comer',
      'restaurante',
      'donde como',
      'lugar para comer',
      'recomienda restaurante',
      'comer rico',
    ],
    titulo: 'Dónde comer',
    respuesta:
      'En Catemaco, los restaurantes del malecón tienen vista a la laguna y sirven la comida típica: tegogolos, mojarra y pescado a la veracruzana. En las playas de Montepío hay palapas con mariscos frescos a pie de mar. En general, pregunta el precio antes de sentarte porque varía por lugar. Te puedo mostrar los lugares de gastronomía registrados en la app si quieres.',
  },

  // ─────────────── SEGURIDAD ───────────────
  {
    claves: [
      'seguridad',
      'es seguro',
      'es peligroso',
      'peligro',
      'tranquilo',
      'cuidado',
      'precaucion',
      'riesgo',
    ],
    titulo: 'Seguridad para el turista',
    respuesta:
      'Los Tuxtlas es una zona turística tranquila. Las recomendaciones son las normales de cualquier viaje: cuida tus pertenencias, usa lanchas y guías certificados (en el malecón de Catemaco los hay), acuerda precios antes de contratar cualquier servicio para evitar cobros excesivos, y en cascadas y playas respeta las indicaciones de seguridad. En la laguna y el mar, no te alejes si no conoces las corrientes. Lleva efectivo en cantidades moderadas.',
  },
  {
    claves: [
      'brujos',
      'brujeria',
      'chaman',
      'limpia',
      'magia',
      'hechiceria',
    ],
    titulo: 'Los brujos de Catemaco',
    respuesta:
      'Catemaco es famoso por su tradición de brujos y chamanes; cada marzo se realiza un encuentro de brujería. Si te interesa una limpia espiritual, hazla en un lugar establecido como la reserva de Nanciyaga, o busca en el mercado cerca de la iglesia. Un consejo de los visitantes: acuerda el precio antes y desconfía de los lancheros que te quieran llevar con "su" brujo, porque suelen cobrar de más.',
  },

  // ─────────────── PRÁCTICOS ───────────────
  {
    claves: [
      'cuantos dias',
      'cuanto tiempo quedarme',
      'cuanto dura el viaje',
      'cuantos dias necesito',
      'cuanto me quedo',
    ],
    titulo: 'Cuántos días quedarse',
    respuesta:
      'Con 1 día alcanzas a ver lo esencial de un municipio (por ejemplo, la laguna de Catemaco y Nanciyaga). Con 2 días cubres bien Catemaco y San Andrés, incluyendo el Salto de Eyipantla. Con 3 días o más puedes sumar Santiago Tuxtla, las playas de la costa y la zona de la sierra sin prisa. Te puedo armar una ruta para los días que tengas; solo dime cuántos son.',
  },
  {
    claves: [
      'dinero',
      'efectivo',
      'tarjeta',
      'cajero',
      'pago',
      'aceptan tarjeta',
      'cuanto dinero llevar',
    ],
    titulo: 'Dinero y pagos',
    respuesta:
      'Lleva efectivo. En los pueblos hay cajeros, pero muchos servicios turísticos —lanchas, entradas a cascadas, palapas, mercados de artesanías— solo aceptan efectivo. Los hoteles y restaurantes más grandes sí toman tarjeta, pero no cuentes con ello en lugares pequeños o en la costa.',
  },
  {
    claves: [
      'internet',
      'señal',
      'wifi',
      'telefono',
      'datos',
      'cobertura',
    ],
    titulo: 'Internet y señal',
    respuesta:
      'En los centros de Catemaco, San Andrés y Santiago Tuxtla hay señal de celular e internet sin problema. Pero en las cascadas, la sierra, las playas alejadas y partes de la laguna la señal es débil o nula. Por eso esta app funciona sin conexión: descarga el mapa y guarda tus rutas antes de salir a explorar.',
  },
  {
    claves: [
      'reserva de la biosfera',
      'biosfera',
      'reserva los tuxtlas',
      'naturaleza protegida',
      'area natural',
    ],
    titulo: 'Reserva de la Biósfera Los Tuxtlas',
    respuesta:
      'Los Tuxtlas es una Reserva de la Biósfera: alberga la selva tropical húmeda más septentrional de América, con enorme diversidad de flora y fauna. Eso incluye los volcanes San Martín y Santa Marta, la selva, las lagunas y la costa. Al visitarla, ayuda a conservarla: no dejes basura, no alimentes a la fauna y respeta los senderos.',
  },
];

// Busca en la base de conocimiento la entrada que mejor coincide
// con el texto del usuario. Devuelve null si no hay match claro.
export function buscarConocimiento(texto: string): EntradaConocimiento | null {
  // Tokeniza la pregunta del usuario una sola vez.
  const tokens = tokenizar(texto);

  let mejorEntrada: EntradaConocimiento | null = null;
  let mejorPuntaje = 0;

  // Recorre la base y elige la entrada con más coincidencias.
  // El conteo TOLERA errores ortográficos gracias al módulo PLN,
  // así que "qe me yebo" o "transportr" igual encuentran respuesta.
  for (const entrada of BASE_CONOCIMIENTO) {
    const puntaje = contarCoincidencias(tokens, entrada.claves);
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejorEntrada = entrada;
    }
  }

  return mejorPuntaje > 0 ? mejorEntrada : null;
}
