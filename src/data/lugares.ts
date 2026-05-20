// ============================================================
// BASE DE DATOS DE LUGARES — Los Tuxtlas, Veracruz
// Información verificada directamente con los establecimientos.
// Imágenes reales proporcionadas por cada lugar.
// ============================================================

export type Categoria =
  | 'Naturaleza'
  | 'Aventura'
  | 'Gastronomia'
  | 'Hospedaje'
;

export type Presupuesto = 'bajo' | 'medio' | 'alto';

export interface Lugar {
  id: string;
  nombre: string;
  categoria: Categoria;
  municipio: string;
  descripcionCorta: string;
  descripcion: string;
  coords: [number, number];
  rating: number;
  precio: Presupuesto;
  precioMxn: string;
  duracionSugerida: string;
  imagen: string;
  imagenesExtra?: string[];
  tags: string[];
  ideal: string[];
  abierto: { dias: string; horario: string };
  comoLlegar?: string;
  tip?: string;
  verificado: boolean;
  contacto?: string;
  destacado?: boolean;
}

export const LUGARES: Lugar[] = [
  {
    id: 'margiros',
    nombre: 'Restaurante Margiros',
    categoria: 'Gastronomia',
    municipio: 'Catemaco',
    descripcionCorta: 'Desayunos, almuerzos y postres en ambiente relajado y a la moda.',
    descripcion:
      'Ven y disfruta de deliciosos desayunos, almuerzos, cenas y exquisitos postres en un ambiente relajado, agradable y a la moda. El espacio es ideal para compartir con familia, amigos o grupos, además de ser perfecto para venir con niños. Cocina variada con opciones para todos los gustos.',
    coords: [18.417520483844594, -95.1106156249393],
    rating: 4.3,
    precio: 'medio',
    precioMxn: '$100 – $300 por persona',
    duracionSugerida: '1-2 horas',
    imagen: '/lugares/margiros_1.jpg',
    imagenesExtra: ['/lugares/margiros_2.jpg', '/lugares/margiros_3.jpg', '/lugares/margiros_4.jpg'],
    tags: ['restaurante', 'desayunos', 'postres', 'familiar', 'cafe', 'niños'],
    ideal: ['familia', 'pareja', 'amigos', 'solo'],
    abierto: { dias: 'Todos los días', horario: '8:00 am – 8:00 pm' },
    comoLlegar: 'Ubicado en el centro de Catemaco. A unas cuadras del malecón principal.',
    tip: 'Ideal para iniciar el día con un buen desayuno antes de explorar la laguna.',
    verificado: true,
  },
  {
    id: 'palapas-gorel',
    nombre: 'Palapas Gorel',
    categoria: 'Gastronomia',
    municipio: 'Catemaco',
    descripcionCorta: 'Ambiente moderno al aire libre con café, cócteles y vista al lago.',
    descripcion:
      'Disfruta de deliciosos desayunos, brunch, almuerzos, cenas y postres en un ambiente moderno, agradable e informal. Contamos con espacios al aire libre, servicio a la mesa y opciones para llevar, ideales para cualquier ocasión. Gran selección de cervezas, cócteles y bebidas. Espacio accesible para personas en silla de ruedas. Aceptamos tarjetas de débito y crédito.',
    coords: [18.416796367952177, -95.1168500723642],
    rating: 4.2,
    precio: 'medio',
    precioMxn: '$100 – $200 por persona',
    duracionSugerida: '1-2 horas',
    imagen: '/lugares/palapas-gorel_1.jpg',
    imagenesExtra: ['/lugares/palapas-gorel_2.jpg', '/lugares/palapas-gorel_3.jpg', '/lugares/palapas-gorel_4.jpg'],
    tags: ['restaurante', 'cafe', 'brunch', 'cocteles', 'aire libre', 'accesible', 'tarjetas'],
    ideal: ['pareja', 'amigos', 'familia', 'solo'],
    abierto: { dias: 'Todos los días', horario: '9:00 am – 6:00 pm' },
    comoLlegar: 'Sobre el malecón de Catemaco, con vista a la laguna.',
    tip: 'Pide un coctel mientras ves el atardecer sobre la laguna de Catemaco.',
    verificado: true,
  },
  {
    id: 'bicicleta-cafe',
    nombre: 'La Bicicleta Café',
    categoria: 'Gastronomia',
    municipio: 'San Andrés Tuxtla',
    descripcionCorta: 'Café de especialidad, postres y cenas en ambiente moderno hasta la madrugada.',
    descripcion:
      'Vive una experiencia única en un ambiente moderno, relajado y acogedor, perfecto para desayunar, almorzar, cenar o simplemente disfrutar un delicioso café y postres irresistibles. Excelente café y gran selección de tés, barra de ensaladas y bocadillos, vinos, cervezas y bebidas. Servicio de comidas hasta la madrugada. Espacios al aire libre, Wi-Fi gratis, atención a la mesa, entrega a domicilio y pedidos desde el automóvil.',
    coords: [18.447271893129827, -95.21339306274265],
    rating: 4.5,
    precio: 'medio',
    precioMxn: '$100 – $200 por persona',
    duracionSugerida: '1-2 horas',
    imagen: '/lugares/bicicleta-cafe_1.jpg',
    imagenesExtra: ['/lugares/bicicleta-cafe_2.jpg', '/lugares/bicicleta-cafe_3.jpg', '/lugares/bicicleta-cafe_4.jpg'],
    tags: ['cafe', 'postres', 'wifi', 'nocturno', 'moderno', 'domicilio', 'aire libre'],
    ideal: ['pareja', 'amigos', 'solo'],
    abierto: { dias: 'Todos los días', horario: '7:00 am – 11:00 pm' },
    comoLlegar: 'En el centro de San Andrés Tuxtla. Con estacionamiento cercano.',
    tip: 'Ideal para trabajar con Wi-Fi o para una cena tardía después de explorar la región.',
    verificado: true,
  },
  {
    id: 'eyipantla',
    destacado: true,
    nombre: 'Cascada El Salto de Eyipantla',
    categoria: 'Naturaleza',
    municipio: 'San Andrés Tuxtla',
    descripcionCorta: 'Una de las cascadas más impresionantes de Veracruz, en plena selva tropical.',
    descripcion:
      'Déjate sorprender por una de las cascadas más impresionantes de Veracruz, rodeada de naturaleza, aire puro y paisajes espectaculares. El Salto de Eyipantla es el destino perfecto para vivir una aventura inolvidable, tomar fotografías increíbles y disfrutar de la tranquilidad de la selva tropical de Los Tuxtlas. Cascada majestuosa con 50 metros de caída libre, ideal para paseos y exploración, con ambiente relajante lleno de vida.',
    coords: [18.384366685863235, -95.2067848675075],
    rating: 4.8,
    precio: 'bajo',
    precioMxn: 'Entrada ~$50 por persona',
    duracionSugerida: '2-3 horas',
    imagen: '/lugares/eyipantla_1.jpg',
    imagenesExtra: ['/lugares/eyipantla_2.jpg', '/lugares/eyipantla_3.jpg'],
    tags: ['cascada', 'naturaleza', 'selva', 'fotografía', 'aventura', 'caminata'],
    ideal: ['familia', 'pareja', 'amigos', 'solo'],
    abierto: { dias: 'Todos los días', horario: '7:00 am – 7:00 pm' },
    comoLlegar: 'A 14 km de San Andrés Tuxtla por la carretera a Catemaco. Hay colectivos y taxis.',
    tip: 'Ve en la mañana para evitar las nubes y aprovechar la mejor luz para fotos.',
    verificado: true,
  },
  {
    id: 'cerro-venado',
    nombre: 'Cerro del Venado',
    categoria: 'Aventura',
    municipio: 'San Andrés Tuxtla',
    descripcionCorta: 'Caminatas y vistas panorámicas únicas de San Andrés Tuxtla y la región.',
    descripcion:
      'Vive una experiencia increíble rodeado de naturaleza, paisajes espectaculares y aire fresco en uno de los lugares más especiales de la región de Los Tuxtlas. El Cerro del Venado es perfecto para quienes buscan aventura, tranquilidad y vistas impresionantes de San Andrés Tuxtla y sus alrededores. Ideal para caminatas y exploración, contacto directo con la naturaleza, paisajes increíbles para fotografías y vistas panorámicas únicas.',
    coords: [18.466474605234186, -95.19529216639516],
    rating: 4.4,
    precio: 'bajo',
    precioMxn: 'Acceso libre',
    duracionSugerida: '2-4 horas',
    imagen: '/lugares/cerro-venado_1.jpg',
    imagenesExtra: ['/lugares/cerro-venado_2.jpg', '/lugares/cerro-venado_3.jpg'],
    tags: ['senderismo', 'aventura', 'vistas', 'naturaleza', 'fotografía', 'gratuito'],
    ideal: ['amigos', 'pareja', 'solo'],
    abierto: { dias: 'Todos los días', horario: 'Recomendado de 7:00 am – 4:00 pm' },
    comoLlegar: 'Al norte de San Andrés Tuxtla. Consulta con lugareños para llegar al sendero de acceso.',
    tip: 'Lleva agua, calzado cómodo y protector solar. El ascenso toma aproximadamente 1 hora.',
    verificado: true,
  },
  {
    id: 'moyotera',
    nombre: 'La Moyotera Restaurant-Bar',
    categoria: 'Gastronomia',
    municipio: 'Catemaco',
    descripcionCorta: 'Mariscos, cortes y atardeceres sobre la laguna de Catemaco.',
    descripcion:
      'Establecimiento moderno y familiar ubicado a las orillas de la icónica Laguna de Catemaco. Destaca por ofrecer una propuesta culinaria de sazón casero enfocada en pescados, mariscos y cortes de carne. Especialidades de la casa: pulpo a la parrilla, mojarra al chilpaya y la tradicional "Torta Moyotera" de pierna horneada. Principal atractivo: vistas panorámicas a los atardeceres de la laguna desde sus terrazas, ambiente con música en vivo frecuente y servicio accesible para personas con movilidad reducida.',
    coords: [18.417465227339232, -95.09915892735273],
    rating: 4.6,
    precio: 'medio',
    precioMxn: '$200 – $300 por persona',
    duracionSugerida: '1-2 horas',
    imagen: '/lugares/moyotera_1.jpg',
    imagenesExtra: ['/lugares/moyotera_2.jpg', '/lugares/moyotera_3.jpg', '/lugares/moyotera_4.jpg'],
    tags: ['mariscos', 'cortes', 'laguna', 'atardecer', 'música en vivo', 'accesible', 'terraza'],
    ideal: ['pareja', 'familia', 'amigos'],
    abierto: { dias: 'Todos los días', horario: '9:00 am – 9:00 pm' },
    comoLlegar: 'A orillas de la Laguna de Catemaco, sobre el boulevard principal.',
    tip: 'Pide mesa en la terraza para ver el atardecer sobre la laguna. Los viernes hay música en vivo.',
    verificado: true,
  },
  {
    id: 'nanciyaga',
    destacado: true,
    nombre: 'Reserva Ecológica Nanciyaga',
    categoria: 'Naturaleza',
    municipio: 'Catemaco',
    descripcionCorta: 'Santuario de selva tropical, kayak, monos y rituales prehispánicos.',
    descripcion:
      'Santuario natural de 4 hectáreas que resguarda el fragmento de selva tropical húmeda más al norte del continente americano. Combina educación ambiental, misticismo prehispánico y turismo sustentable. Sus senderos de madera guían entre árboles centenarios, esculturas prehispánicas réplica y un manantial de agua mineral potable. Principales atractivos: paseos en kayak hacia islas habitadas por monos, aplicación de barro mineral en la piel y contacto con chamanes locales para rituales de sanación. Escenario de las películas Apocalypto y El Curandero de la Selva.',
    coords: [18.447322230653032, -95.06840705458495],
    rating: 4.7,
    precio: 'medio',
    precioMxn: 'Entrada general $80. Hospedaje desde $1,600 – $2,200 por noche',
    duracionSugerida: '3-4 horas (o pernocta)',
    imagen: '/lugares/nanciyaga_1.jpg',
    imagenesExtra: ['/lugares/nanciyaga_2.jpg', '/lugares/nanciyaga_3.jpg', '/lugares/nanciyaga_4.jpg'],
    tags: ['selva', 'naturaleza', 'kayak', 'monos', 'ritual', 'chamán', 'barro mineral', 'hospedaje'],
    ideal: ['pareja', 'familia', 'amigos', 'solo'],
    abierto: { dias: 'Todos los días', horario: '9:00 am – 7:00 pm' },
    comoLlegar: 'A 7 km de Catemaco por la carretera hacia Sontecomapan. Se puede llegar en taxi o lancha.',
    tip: 'Reserva el temazcal con anticipación. Si te hospedas, la experiencia al amanecer en la selva es única.',
    verificado: true,
  },
  {
    id: 'sirena-olmeca',
    nombre: 'Sirena Olmeca Restaurant-Cabañas',
    categoria: 'Hospedaje',
    municipio: 'Catemaco',
    descripcionCorta: 'Complejo rústico donde el mar abierto se encuentra con la laguna.',
    descripcion:
      'Complejo rústico-turístico ubicado en un punto geográfico privilegiado donde el mar abierto se encuentra con la laguna. Diseñado para el descanso y la desconexión total, a unos 45 minutos de la cabecera municipal de Catemaco. Ideal para quienes buscan alejarse del ruido y conectar con la naturaleza costera de Los Tuxtlas. Combina restaurante con cocina regional y cabañas para pernoctar.',
    coords: [18.55679693485654, -94.98990925409747],
    rating: 4.4,
    precio: 'medio',
    precioMxn: 'Restaurante: $150 – $350 por persona. Hospedaje: $800 – $1,200 por noche',
    duracionSugerida: 'Día completo o pernocta',
    imagen: '/lugares/sirena-olmeca_1.jpg',
    imagenesExtra: ['/lugares/sirena-olmeca_2.jpg', '/lugares/sirena-olmeca_3.jpg', '/lugares/sirena-olmeca_4.jpg'],
    tags: ['hospedaje', 'cabañas', 'restaurante', 'mar', 'laguna', 'desconexión', 'rústico'],
    ideal: ['pareja', 'familia', 'amigos'],
    abierto: { dias: 'Todos los días', horario: '9:00 am – 6:00 pm' },
    comoLlegar: 'A 45 minutos de Catemaco por carretera costera. Consulta la ruta antes de salir, es camino rural.',
    tip: 'Lleva provisiones adicionales. El paisaje donde se juntan el mar y la laguna es único en la región.',
    verificado: true,
  },
  {
    id: 'hechizo-amor',
    destacado: true,
    nombre: 'Hechizo de Amor',
    categoria: 'Gastronomia',
    municipio: 'Catemaco',
    descripcionCorta: 'Rooftop bar con licores artesanales y los mejores atardeceres del lago.',
    descripcion:
      'Exclusivo y acogedor bar-restaurante de concepto rooftop (terraza elevada) con una de las vistas más románticas y espectaculares hacia los atardeceres del Lago de Catemaco. Principal distintivo: elaboración de ginebras, vermuts y licores artesanales saborizados con frutas e ingredientes de la región. Destaca su emblemática combinación preparada con chagalapoli, un fruto silvestre endémico de Los Tuxtlas similar al arándano.',
    coords: [18.416833541065614, -95.10844901405396],
    rating: 4.6,
    precio: 'medio',
    precioMxn: '$200 – $300 por persona',
    duracionSugerida: '1-2 horas',
    imagen: '/lugares/hechizo-amor_1.jpg',
    imagenesExtra: ['/lugares/hechizo-amor_2.jpg', '/lugares/hechizo-amor_3.jpg', '/lugares/hechizo-amor_4.jpg'],
    tags: ['bar', 'rooftop', 'cocteles', 'artesanal', 'atardecer', 'romántico', 'laguna', 'gin'],
    ideal: ['pareja', 'amigos'],
    abierto: { dias: 'Lunes a domingo', horario: '12:00 pm – 11:00 pm' },
    comoLlegar: 'En el centro de Catemaco, cerca del malecón. Busca la entrada al rooftop.',
    tip: 'Llega antes de las 6 pm para conseguir la mejor mesa con vista al atardecer. Prueba el coctel de chagalapoli.',
    verificado: true,
  },
  {
    id: 'jungla-balneario',
    destacado: true,
    nombre: 'La Jungla Balneario',
    categoria: 'Naturaleza',
    municipio: 'Catemaco',
    descripcionCorta: 'Balneario natural con albercas de manantial, tobogán y vista al lago.',
    descripcion:
      'Paradisíaco balneario rústico y sustentable rodeado por la selva tropical húmeda. Gran atractivo: sistema de albercas alimentadas con agua fría y cristalina que brota directamente de nacimientos y manantiales naturales. Cuenta con un gran tobogán que desciende entre los árboles, columpios, palapas, un muelle con acceso directo al lago y área de chapoteaderos en los niveles inferiores que regalan majestuosas vistas panorámicas del agua. Camping disponible.',
    coords: [18.445602822737182, -95.06774472891604],
    rating: 4.5,
    precio: 'bajo',
    precioMxn: 'Entrada general $60 por persona. Camping desde $100 por noche',
    duracionSugerida: '3-5 horas',
    imagen: '/lugares/jungla-balneario_1.jpg',
    imagenesExtra: ['/lugares/jungla-balneario_2.jpg', '/lugares/jungla-balneario_3.jpg', '/lugares/jungla-balneario_4.jpg'],
    tags: ['balneario', 'alberca', 'manantial', 'tobogán', 'selva', 'camping', 'lago', 'familias', 'niños'],
    ideal: ['familia', 'amigos', 'pareja'],
    abierto: { dias: 'Lunes a domingo', horario: '8:00 am – 6:00 pm' },
    comoLlegar: 'A pocos kilómetros de Catemaco en dirección a Nanciyaga. Hay señalización en la carretera.',
    tip: 'El agua de los manantiales es muy fría — perfecta para el calor. Llega temprano los fines de semana.',
    verificado: true,
  },
];

// ─── Configuración geográfica ────────────────────────────────
export const LOS_TUXTLAS_CENTER: [number, number] = [18.45, -95.18];
export const LOS_TUXTLAS_BOUNDS: [[number, number], [number, number]] = [
  [18.35, -95.5],
  [18.7, -94.95],
];

// ─── Categorías con color y emoji ────────────────────────────
export const CATEGORIAS: { id: Categoria; emoji: string; color: string }[] = [
  { id: 'Naturaleza',  emoji: '🌿', color: 'bg-jungle-100 text-jungle-800' },
  { id: 'Aventura',   emoji: '🥾', color: 'bg-amber-100 text-amber-800' },
  { id: 'Gastronomia',emoji: '🍽️', color: 'bg-red-100 text-red-800' },
  { id: 'Hospedaje',  emoji: '🛏️',  color: 'bg-blue-100 text-blue-800' },
];