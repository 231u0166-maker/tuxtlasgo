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
    verificado: true,
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
    verificado: true,
  },
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
    verificado: true,
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
  }
];


// ─── Configuración geográfica ───────────────────────────────────
export const LOS_TUXTLAS_CENTER: [number, number] = [18.45, -95.18];
export const LOS_TUXTLAS_BOUNDS: [[number, number], [number, number]] = [
  [18.35, -95.5],
  [18.7, -94.95],
];

// ─── Categorías con color y emoji ───────────────────────────────
export const CATEGORIAS: {
  id: Categoria;
  emoji: string;
  color: string;
}[] = [
  { id: 'Naturaleza', emoji: '🌿', color: 'bg-jungle-100 text-jungle-800' },
  { id: 'Aventura',   emoji: '🥾', color: 'bg-amber-100 text-amber-800' },
  { id: 'Cultura',    emoji: '🏛️',  color: 'bg-purple-100 text-purple-800' },
  { id: 'Gastronomia', emoji: '🍽️', color: 'bg-red-100 text-red-800' },
  { id: 'Hospedaje',  emoji: '🛏️',  color: 'bg-blue-100 text-blue-800' },
  { id: 'Playa',      emoji: '🏖️',  color: 'bg-sky-100 text-sky-800' },
];