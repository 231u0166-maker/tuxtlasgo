// ============================================================
// CATÁLOGO DE LUGARES — LOS TUXTLAS, VERACRUZ
// ============================================================
// Información verificada con fuentes públicas (gobierno municipal
// de San Andrés Tuxtla, México Desconocido, El Universal, INAH,
// sitios oficiales de turismo) a mayo 2026.
//
// IMPORTANTE para el equipo: los campos `precioMxn`, `abierto` y
// `verificado` deben corroborarse en campo antes de la versión
// final. Los marcados con verificado:true tienen fuente pública;
// los verificado:false son estimaciones a confirmar.
// ============================================================

export type Categoria =
  | 'Naturaleza'
  | 'Aventura'
  | 'Cultura'
  | 'Gastronomia'
  | 'Hospedaje'
  | 'Playa';

export type Presupuesto = 'bajo' | 'medio' | 'alto';

export interface Lugar {
  id: string;
  nombre: string;
  categoria: Categoria;
  municipio: 'Catemaco' | 'San Andrés Tuxtla' | 'Santiago Tuxtla';
  descripcion: string;
  descripcionCorta: string;
  coords: [number, number]; // [lat, lng]
  rating: number;
  precio: Presupuesto;
  precioMxn: string;
  duracionSugerida: string;
  imagen: string;
  tags: string[];
  ideal: ('solo' | 'pareja' | 'familia' | 'amigos')[];
  abierto: { dias: string; horario: string };
  comoLlegar: string;
  tip?: string; // consejo práctico para el turista
  destacado?: boolean;
  verificado: boolean; // true = info con fuente pública
}

export const LUGARES: Lugar[] = [
  // ─────────────── CATEMACO ───────────────
  {
    id: 'laguna-catemaco',
    nombre: 'Laguna de Catemaco',
    categoria: 'Naturaleza',
    municipio: 'Catemaco',
    descripcionCorta: 'El tercer cuerpo de agua más grande de México, rodeado de selva.',
    descripcion:
      'Laguna de origen volcánico de unos 73 km². Es el corazón turístico de Los Tuxtlas. Desde el malecón salen los paseos en lancha que recorren las islas, los manantiales y la reserva de Nanciyaga. Sus aguas albergan especies endémicas y son famosas por los tegogolos, un caracol de río que se come guisado.',
    coords: [18.4178, -95.1006],
    rating: 4.7,
    precio: 'bajo',
    precioMxn: 'Acceso gratuito. Paseo en lancha colectivo desde $50/persona; lancha privada $700–$1,200.',
    duracionSugerida: '2-4 horas',
    imagen:
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
    tags: ['agua', 'paseo', 'lancha', 'foto', 'tranquilo', 'naturaleza', 'islas'],
    ideal: ['solo', 'pareja', 'familia', 'amigos'],
    abierto: { dias: 'Todos los días', horario: '06:00 - 19:00' },
    comoLlegar: 'En el centro de Catemaco. El malecón es el punto de partida de las lanchas.',
    tip: 'Contrata la lancha directamente con los lancheros certificados del malecón y acuerda el precio antes de subir. Todos hacen el mismo recorrido.',
    destacado: true,
    verificado: true,
  },
  {
    id: 'nanciyaga',
    nombre: 'Reserva Ecológica Nanciyaga',
    categoria: 'Aventura',
    municipio: 'Catemaco',
    descripcionCorta: 'Selva tropical, temazcal prehispánico y manantiales minerales.',
    descripcion:
      'Reserva privada de 35 hectáreas a orillas de la laguna, pionera del ecoturismo en México. Ofrece recorrido guiado por la selva con réplicas de esculturas olmecas, baño de barro mineral, manantial de agua cristalina, kayak, temazcal prehispánico y limpia espiritual con chamán. Fue escenario de la película "Medicine Man" con Sean Connery.',
    coords: [18.4319, -95.0875],
    rating: 4.6,
    precio: 'medio',
    precioMxn: 'Entrada y recorrido guiado ~$150/persona. Temazcal desde $550. Limpia con chamán ~$150.',
    duracionSugerida: '2-3 horas',
    imagen:
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80',
    tags: ['selva', 'spa', 'temazcal', 'experiencia', 'wellness', 'naturaleza', 'cultura'],
    ideal: ['pareja', 'amigos', 'familia'],
    abierto: { dias: 'Todos los días', horario: '09:00 - 17:00' },
    comoLlegar: 'Carretera Catemaco–Coyame km 7, unos 15 min del centro. Se llega en auto o en lancha desde el malecón.',
    tip: 'La entrada a Nanciyaga NO está incluida en el paseo de lancha; se paga aparte. El lanchero te espera mientras haces el recorrido.',
    destacado: true,
    verificado: true,
  },
  {
    id: 'isla-monos',
    nombre: 'Isla de los Monos',
    categoria: 'Naturaleza',
    municipio: 'Catemaco',
    descripcionCorta: 'Colonia de monos macacos en una isla de la laguna.',
    descripcion:
      'Pequeña isla habitada por una colonia de monos macacos introducidos por la Universidad Veracruzana con fines de investigación. Se observa desde la lancha durante el recorrido por la laguna. También se visitan la Isla de los Monos Araña y la Isla de las Garzas.',
    coords: [18.4225, -95.0941],
    rating: 4.3,
    precio: 'bajo',
    precioMxn: 'Incluido en el paseo de lancha por la laguna.',
    duracionSugerida: '30-45 min',
    imagen:
      'https://images.unsplash.com/photo-1540206395-68808572332f?w=800&q=80',
    tags: ['fauna', 'monos', 'familia', 'foto', 'lancha', 'naturaleza'],
    ideal: ['familia', 'pareja', 'amigos'],
    abierto: { dias: 'Todos los días', horario: '07:00 - 17:00' },
    comoLlegar: 'Solo se accede en lancha desde el malecón de Catemaco, como parte del recorrido por la laguna.',
    tip: 'No se recomienda llevar fruta para los monos: altera sus hábitos alimenticios. Obsérvalos sin hacer ruido.',
    verificado: true,
  },
  {
    id: 'malecon-catemaco',
    nombre: 'Malecón de Catemaco',
    categoria: 'Cultura',
    municipio: 'Catemaco',
    descripcionCorta: 'El paseo junto a la laguna, corazón social del pueblo.',
    descripcion:
      'Paseo peatonal frente a la laguna. Es donde se contratan los recorridos en lancha, se prueban los tegogolos y la mojarra, y se ve el atardecer. Hay mercado de artesanías, restaurantes y la presencia de los famosos brujos y chamanes de Catemaco.',
    coords: [18.42, -95.1175],
    rating: 4.4,
    precio: 'bajo',
    precioMxn: 'Acceso gratuito.',
    duracionSugerida: '1-2 horas',
    imagen:
      'https://images.unsplash.com/photo-1530541930197-ff16ac917b0e?w=800&q=80',
    tags: ['malecón', 'paseo', 'atardecer', 'comida', 'centro', 'cultura', 'artesanías'],
    ideal: ['solo', 'pareja', 'familia', 'amigos'],
    abierto: { dias: 'Todos los días', horario: 'Abierto las 24 horas' },
    comoLlegar: 'En pleno centro de Catemaco, frente a la laguna.',
    tip: 'Si te interesa una limpia, espera a hacerla en Nanciyaga o busca en el mercado cerca de la iglesia. Evita a quienes cobran de más a los turistas.',
    verificado: true,
  },
  {
    id: 'basilica-catemaco',
    nombre: 'Basílica del Carmen',
    categoria: 'Cultura',
    municipio: 'Catemaco',
    descripcionCorta: 'Santuario de fachada blanca y azul frente a la laguna.',
    descripcion:
      'Santuario dedicado a la Virgen del Carmen, patrona de Catemaco. Su inconfundible fachada blanca con detalles azules es uno de los símbolos del pueblo. Su festividad, el 16 de julio, reúne a miles de peregrinos.',
    coords: [18.4196, -95.1175],
    rating: 4.5,
    precio: 'bajo',
    precioMxn: 'Acceso gratuito.',
    duracionSugerida: '30 min',
    imagen:
      'https://images.unsplash.com/photo-1548270361-d2e6e2db5f5e?w=800&q=80',
    tags: ['religión', 'arquitectura', 'cultura', 'foto', 'centro'],
    ideal: ['solo', 'pareja', 'familia'],
    abierto: { dias: 'Todos los días', horario: '07:00 - 20:00' },
    comoLlegar: 'En el centro de Catemaco, a unos pasos del malecón.',
    verificado: true,
  },
  {
    id: 'playa-hermosa-catemaco',
    nombre: 'Playa Hermosa',
    categoria: 'Naturaleza',
    municipio: 'Catemaco',
    descripcionCorta: 'Orilla tranquila de la laguna para nadar y descansar.',
    descripcion:
      'Zona de la ribera de la laguna de Catemaco acondicionada como balneario. Tiene aguas tranquilas, palapas y vendedores de comida. Es una opción accesible para pasar el día junto al agua sin tomar lancha.',
    coords: [18.4083, -95.0908],
    rating: 4.0,
    precio: 'bajo',
    precioMxn: 'Acceso gratuito o cuota baja según la zona. Renta de palapa aparte.',
    duracionSugerida: '2-3 horas',
    imagen:
      'https://images.unsplash.com/photo-1473116763249-2faaef81ccda?w=800&q=80',
    tags: ['agua', 'familia', 'tranquilo', 'naturaleza', 'descanso'],
    ideal: ['familia', 'amigos'],
    abierto: { dias: 'Todos los días', horario: '08:00 - 18:00' },
    comoLlegar: 'Sobre la ribera de la laguna, a pocos minutos del centro de Catemaco.',
    verificado: false,
  },
  {
    id: 'hotel-finca',
    nombre: 'Hotel La Finca',
    categoria: 'Hospedaje',
    municipio: 'Catemaco',
    descripcionCorta: 'Hotel con vista a la laguna y renta de kayaks.',
    descripcion:
      'Hotel a orillas de la laguna de Catemaco, con vista panorámica al agua, alberca, jardín para eventos, masajes y renta de kayaks para explorar la laguna por cuenta propia. A pocos minutos del centro.',
    coords: [18.4115, -95.1212],
    rating: 4.4,
    precio: 'alto',
    precioMxn: 'Habitación desde ~$1,400/noche (confirmar temporada).',
    duracionSugerida: 'Estancia',
    imagen:
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80',
    tags: ['hotel', 'alberca', 'vista', 'pareja', 'kayak', 'hospedaje'],
    ideal: ['pareja', 'familia'],
    abierto: { dias: 'Todos los días', horario: 'Check-in 15:00 / Check-out 12:00' },
    comoLlegar: 'Sobre la ribera de la laguna, a unos minutos del centro de Catemaco.',
    verificado: false,
  },
  {
    id: 'restaurantes-malecon',
    nombre: 'Cocina tradicional del Malecón',
    categoria: 'Gastronomia',
    municipio: 'Catemaco',
    descripcionCorta: 'Tegogolos, mojarra y pescado a la veracruzana frente a la laguna.',
    descripcion:
      'La hilera de restaurantes del malecón de Catemaco es el mejor lugar para probar la cocina típica de la laguna: tegogolos (caracol de río en pico de gallo), mojarra frita, anguila y el pescado a la veracruzana. Varios tienen terraza con vista al agua.',
    coords: [18.4205, -95.1168],
    rating: 4.3,
    precio: 'medio',
    precioMxn: 'Platillo fuerte ~$120–$250 por persona.',
    duracionSugerida: '1-2 horas',
    imagen:
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    tags: ['comida', 'mariscos', 'tegogolo', 'mojarra', 'gastronomia', 'vista'],
    ideal: ['pareja', 'familia', 'amigos', 'solo'],
    abierto: { dias: 'Todos los días', horario: '08:00 - 21:00' },
    comoLlegar: 'A lo largo del malecón de Catemaco, en el centro.',
    tip: 'Pregunta el precio antes de sentarte; varía por restaurante. Los tegogolos son el platillo emblemático de la laguna.',
    verificado: true,
  },

  // ─────────────── SAN ANDRÉS TUXTLA ───────────────
  {
    id: 'eyipantla',
    nombre: 'Salto de Eyipantla',
    categoria: 'Naturaleza',
    municipio: 'San Andrés Tuxtla',
    descripcionCorta: 'Cascada imponente de unos 50 m, escenario de cine.',
    descripcion:
      'Una de las cascadas más espectaculares de Veracruz, de aproximadamente 40 m de ancho por 50 m de alto, alimentada por el Río Grande de Catemaco. Su nombre significa "salto de tres chorros" en náhuatl. Fue escenario de la película Apocalypto. Cuenta con miradores, puente colgante y un camino de 244 escalones para bajar a la base.',
    coords: [18.5497, -95.1183],
    rating: 4.7,
    precio: 'bajo',
    precioMxn: 'Entrada principal ~$50/persona. Acceso a la base de la cascada ~$5. Estacionamiento ~$20.',
    duracionSugerida: '1-2 horas',
    imagen:
      'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=800&q=80',
    tags: ['cascada', 'foto', 'aventura', 'caminata', 'familia', 'naturaleza'],
    ideal: ['solo', 'pareja', 'familia', 'amigos'],
    abierto: { dias: 'Lunes a domingo', horario: '07:00 - 19:00' },
    comoLlegar: 'En la localidad de Eyipantla, a unos 6 km al norte de San Andrés Tuxtla. Se llega por la carretera que cruza el pueblo de Comoapan.',
    tip: 'Lleva calzado cómodo, gorra, bloqueador y repelente. Hay guías locales que trabajan por propina.',
    destacado: true,
    verificado: true,
  },
  {
    id: 'laguna-encantada',
    nombre: 'Laguna Encantada',
    categoria: 'Naturaleza',
    municipio: 'San Andrés Tuxtla',
    descripcionCorta: 'Laguna que sube en sequía y baja en lluvias.',
    descripcion:
      'Laguna de origen volcánico conocida por un fenómeno inusual: su nivel de agua sube en temporada de secas y baja en temporada de lluvias, por su conexión con cavidades subterráneas. Está rodeada de selva y tiene un sendero corto y tranquilo, ideal para caminar y observar aves.',
    coords: [18.4856, -95.1928],
    rating: 4.3,
    precio: 'bajo',
    precioMxn: 'Entrada económica (~$20, confirmar en campo).',
    duracionSugerida: '1-2 horas',
    imagen:
      'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80',
    tags: ['laguna', 'misterio', 'naturaleza', 'caminata', 'tranquilo', 'aves'],
    ideal: ['pareja', 'familia', 'solo'],
    abierto: { dias: 'Todos los días', horario: '08:00 - 17:00' },
    comoLlegar: 'A unos 10 min del centro de San Andrés Tuxtla, por la carretera hacia Sontecomapan.',
    verificado: false,
  },
  {
    id: 'museo-tabaco',
    nombre: 'San Andrés Tuxtla y sus fábricas de puros',
    categoria: 'Cultura',
    municipio: 'San Andrés Tuxtla',
    descripcionCorta: 'La capital del puro: tabaco artesanal de fama mundial.',
    descripcion:
      'San Andrés Tuxtla es famosa por su tradición tabacalera. En el centro de la ciudad se pueden visitar fábricas de puros donde se observa el proceso artesanal de elaboración, desde la hoja hasta el puro terminado. El tabaco de la región es reconocido internacionalmente.',
    coords: [18.4475, -95.2131],
    rating: 4.4,
    precio: 'bajo',
    precioMxn: 'Las visitas a fábricas suelen ser gratuitas o de bajo costo.',
    duracionSugerida: '1 hora',
    imagen:
      'https://images.unsplash.com/photo-1527795631526-7e7c0c2cefb8?w=800&q=80',
    tags: ['cultura', 'tabaco', 'puros', 'artesanal', 'tradición', 'centro'],
    ideal: ['solo', 'pareja', 'amigos'],
    abierto: { dias: 'Lunes a sábado', horario: '09:00 - 18:00 (varía por fábrica)' },
    comoLlegar: 'En el centro de San Andrés Tuxtla. Varias fábricas están en el primer cuadro de la ciudad.',
    tip: 'Pregunta en el centro por las fábricas que ofrecen recorrido; algunas permiten ver el proceso completo.',
    verificado: false,
  },
  {
    id: 'playa-escondida',
    nombre: 'Playa Escondida',
    categoria: 'Playa',
    municipio: 'San Andrés Tuxtla',
    descripcionCorta: 'Playa virgen entre acantilados de selva.',
    descripcion:
      'Una de las playas más vírgenes de Veracruz, de arena oscura volcánica y oleaje moderado, con la selva llegando casi hasta la orilla. El acceso es por terracería desde la zona de Montepío, lo que la mantiene poco concurrida.',
    coords: [18.6589, -95.0792],
    rating: 4.5,
    precio: 'bajo',
    precioMxn: 'Acceso gratuito.',
    duracionSugerida: 'Medio día',
    imagen:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
    tags: ['playa', 'mar', 'virgen', 'tranquilo', 'naturaleza'],
    ideal: ['pareja', 'amigos', 'solo'],
    abierto: { dias: 'Todos los días', horario: 'Sin horario fijo' },
    comoLlegar: 'Por la costa norte del municipio, cerca de Montepío. El último tramo es de terracería; conviene ir en auto alto o con guía.',
    verificado: false,
  },
  {
    id: 'playa-montepio',
    nombre: 'Playa de Montepío',
    categoria: 'Playa',
    municipio: 'San Andrés Tuxtla',
    descripcionCorta: 'Pueblo costero con palapas y mariscos frescos.',
    descripcion:
      'Comunidad pesquera con playa de arena oscura y oleaje tranquilo en su zona de río. Tiene palapas que sirven mariscos frescos a pie de playa. Es buena base para visitar Playa Escondida y la zona costera de la reserva.',
    coords: [18.6353, -95.1058],
    rating: 4.3,
    precio: 'medio',
    precioMxn: 'Comida en palapas ~$150–$250/persona.',
    duracionSugerida: '4-6 horas',
    imagen:
      'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800&q=80',
    tags: ['playa', 'mariscos', 'familia', 'comida', 'mar', 'gastronomia'],
    ideal: ['familia', 'pareja', 'amigos'],
    abierto: { dias: 'Todos los días', horario: 'Sin horario fijo' },
    comoLlegar: 'En la costa norte de San Andrés Tuxtla, por la carretera que va de Sontecomapan hacia la costa.',
    verificado: false,
  },
  {
    id: 'sontecomapan',
    nombre: 'Laguna de Sontecomapan',
    categoria: 'Naturaleza',
    municipio: 'San Andrés Tuxtla',
    descripcionCorta: 'Manglar costero donde la laguna se encuentra con el mar.',
    descripcion:
      'Sistema lagunar conectado al Golfo de México a través de una barra. Se recorre en lancha entre manglares hasta La Barra, donde el agua se vuelve apta para nadar. Es zona de avistamiento de aves y de una rica biodiversidad costera.',
    coords: [18.5217, -95.0383],
    rating: 4.5,
    precio: 'bajo',
    precioMxn: 'Paseo en lancha desde ~$200 (varía por recorrido y grupo).',
    duracionSugerida: '3-4 horas',
    imagen:
      'https://images.unsplash.com/photo-1502780402662-acc01917cf9b?w=800&q=80',
    tags: ['manglar', 'aves', 'lancha', 'naturaleza', 'tranquilo', 'agua'],
    ideal: ['solo', 'pareja', 'familia'],
    abierto: { dias: 'Todos los días', horario: '07:00 - 17:00' },
    comoLlegar: 'Pueblo de Sontecomapan, a unos 18 km de Catemaco rumbo a la costa.',
    verificado: false,
  },
  {
    id: 'mirador-tuxtlas',
    nombre: 'Miradores de la Sierra de San Martín',
    categoria: 'Aventura',
    municipio: 'San Andrés Tuxtla',
    descripcionCorta: 'Vistas panorámicas de la selva y los volcanes de Los Tuxtlas.',
    descripcion:
      'La carretera que sube por la Sierra de San Martín ofrece varios puntos con vistas panorámicas de la selva tropical, los volcanes y, en días despejados, la laguna y el Golfo. Es zona de la Reserva de la Biósfera Los Tuxtlas, ideal para senderismo y avistamiento de aves.',
    coords: [18.5667, -95.2],
    rating: 4.2,
    precio: 'bajo',
    precioMxn: 'Acceso libre por carretera. Tours guiados de senderismo aparte.',
    duracionSugerida: '2-4 horas',
    imagen:
      'https://images.unsplash.com/photo-1454942901704-3c44c11b2ad1?w=800&q=80',
    tags: ['mirador', 'senderismo', 'aventura', 'naturaleza', 'foto', 'volcan'],
    ideal: ['amigos', 'pareja', 'solo'],
    abierto: { dias: 'Todos los días', horario: 'Horas de luz' },
    comoLlegar: 'Por la carretera que sube de San Andrés Tuxtla hacia la sierra y la costa.',
    tip: 'Ve temprano: las nubes suelen cubrir la sierra después del mediodía. Lleva suéter, arriba refresca.',
    verificado: false,
  },

  // ─────────────── SANTIAGO TUXTLA ───────────────
  {
    id: 'cabeza-cobata',
    nombre: 'Cabeza Olmeca de Cobata',
    categoria: 'Cultura',
    municipio: 'Santiago Tuxtla',
    descripcionCorta: 'La cabeza olmeca más grande conocida, en la plaza central.',
    descripcion:
      'Monumental cabeza olmeca encontrada en el cerro Cobata, considerada la más grande de las cabezas olmecas conocidas. Está expuesta en la plaza central de Santiago Tuxtla, junto al quiosco, y es el símbolo del pueblo.',
    coords: [18.4683, -95.3],
    rating: 4.4,
    precio: 'bajo',
    precioMxn: 'Acceso gratuito.',
    duracionSugerida: '30 min',
    imagen:
      'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&q=80',
    tags: ['arqueología', 'olmeca', 'cultura', 'historia', 'foto', 'centro'],
    ideal: ['solo', 'pareja', 'familia', 'amigos'],
    abierto: { dias: 'Todos los días', horario: 'Abierto las 24 horas' },
    comoLlegar: 'En la plaza central de Santiago Tuxtla, frente al Museo Tuxteco.',
    destacado: true,
    verificado: true,
  },
  {
    id: 'museo-tuxteco',
    nombre: 'Museo Tuxteco',
    categoria: 'Cultura',
    municipio: 'Santiago Tuxtla',
    descripcionCorta: 'Piezas olmecas originales en el centro de Santiago.',
    descripcion:
      'Museo regional con piezas arqueológicas auténticas de las culturas olmeca y de la región. Entre sus piezas más destacadas está el "Señor de Matacapan". También expone sobre la historia del tabaco y la caña de azúcar en la región.',
    coords: [18.467, -95.2987],
    rating: 4.4,
    precio: 'bajo',
    precioMxn: 'Entrada ~$60/persona (confirmar en campo).',
    duracionSugerida: '1 hora',
    imagen:
      'https://images.unsplash.com/photo-1564399579883-451a5d44ec08?w=800&q=80',
    tags: ['museo', 'olmeca', 'cultura', 'historia', 'educativo', 'centro'],
    ideal: ['solo', 'pareja', 'familia'],
    abierto: { dias: 'Martes a domingo', horario: '09:00 - 17:00' },
    comoLlegar: 'En la plaza central de Santiago Tuxtla, junto a la Cabeza Olmeca de Cobata.',
    verificado: false,
  },
  {
    id: 'tres-zapotes',
    nombre: 'Zona Arqueológica Tres Zapotes',
    categoria: 'Cultura',
    municipio: 'Santiago Tuxtla',
    descripcionCorta: 'Sitio olmeca tardío con museo de sitio, en el campo tuxteco.',
    descripcion:
      'Sitio arqueológico que fue un importante centro olmeca tardío y epi-olmeca, contemporáneo de La Venta. Cuenta con un museo de sitio que resguarda estelas, una cabeza colosal y la famosa Estela C, con uno de los registros de cuenta larga más antiguos de Mesoamérica.',
    coords: [18.4683, -95.4408],
    rating: 4.2,
    precio: 'bajo',
    precioMxn: 'Entrada $145. Nacionales y residentes en México: $80.',
    duracionSugerida: '1-2 horas',
    imagen:
      'https://images.unsplash.com/photo-1583425423320-0b6f1d2c2c1f?w=800&q=80',
    tags: ['arqueología', 'olmeca', 'historia', 'cultura', 'museo', 'educativo'],
    ideal: ['solo', 'pareja', 'familia'],
    abierto: { dias: 'Martes a domingo', horario: '09:00 - 17:00' },
    comoLlegar: 'En la localidad de Tres Zapotes, al oeste de Santiago Tuxtla. Se llega por carretera estatal desde el centro.',
    tip: 'Es el sitio más alejado de la región; conviene combinarlo con la visita al centro de Santiago Tuxtla el mismo día.',
    verificado: true,
  },
  {
    id: 'centro-santiago',
    nombre: 'Centro histórico de Santiago Tuxtla',
    categoria: 'Cultura',
    municipio: 'Santiago Tuxtla',
    descripcionCorta: 'El más antiguo de los tres pueblos, esencia colonial.',
    descripcion:
      'Santiago Tuxtla es la más antigua de las tres ciudades de Los Tuxtlas. Su centro conserva la parroquia, el quiosco y el ambiente de pueblo tradicional veracruzano. Es punto de partida para conocer la herencia olmeca de la región.',
    coords: [18.4658, -95.2986],
    rating: 4.2,
    precio: 'bajo',
    precioMxn: 'Acceso gratuito.',
    duracionSugerida: '1-2 horas',
    imagen:
      'https://images.unsplash.com/photo-1512813195386-6cf811ad3542?w=800&q=80',
    tags: ['centro', 'colonial', 'cultura', 'historia', 'paseo', 'tradición'],
    ideal: ['solo', 'pareja', 'familia', 'amigos'],
    abierto: { dias: 'Todos los días', horario: 'Abierto las 24 horas' },
    comoLlegar: 'Centro de Santiago Tuxtla, sobre la carretera federal 180.',
    verificado: false,
  },
];

export const CATEGORIAS: { id: Categoria; emoji: string; color: string }[] = [
  { id: 'Naturaleza', emoji: '🌳', color: 'bg-jungle-100 text-jungle-800' },
  { id: 'Aventura', emoji: '🥾', color: 'bg-orange-100 text-orange-800' },
  { id: 'Cultura', emoji: '🏛️', color: 'bg-amber-100 text-amber-800' },
  { id: 'Gastronomia', emoji: '🍤', color: 'bg-red-100 text-red-800' },
  { id: 'Hospedaje', emoji: '🛏️', color: 'bg-blue-100 text-blue-800' },
  { id: 'Playa', emoji: '🏖️', color: 'bg-cyan-100 text-cyan-800' },
];

// Bounding box de Los Tuxtlas (para pre-cache de tiles del mapa)
export const LOS_TUXTLAS_BOUNDS: [[number, number], [number, number]] = [
  [18.35, -95.5],
  [18.7, -94.95],
];
export const LOS_TUXTLAS_CENTER: [number, number] = [18.45, -95.18];
