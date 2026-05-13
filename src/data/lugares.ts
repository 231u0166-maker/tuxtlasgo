// Catálogo de lugares de Los Tuxtlas, Veracruz.
// Coordenadas aproximadas verificadas para que el mapa se vea correcto.
// Para producción se enriquecerían con datos validados con los prestadores locales.

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
  duracionSugerida: string; // "2-3 horas"
  imagen: string;
  tags: string[]; // intereses que matchea
  ideal: ('solo' | 'pareja' | 'familia' | 'amigos')[];
  abierto: { dias: string; horario: string };
  destacado?: boolean;
  contactoLocal?: string;
}

export const LUGARES: Lugar[] = [
  {
    id: 'laguna-catemaco',
    nombre: 'Laguna de Catemaco',
    categoria: 'Naturaleza',
    municipio: 'Catemaco',
    descripcionCorta: 'La joya azul de Los Tuxtlas, rodeada de selva y volcanes.',
    descripcion:
      'Laguna de origen volcánico de 7 km de diámetro. Recorridos en lancha al Tegal, isla de los monos y manantial del Coyolapan. Punto de partida para casi cualquier ruta en la región.',
    coords: [18.4178, -95.1006],
    rating: 4.8,
    precio: 'bajo',
    precioMxn: 'Gratis (lanchas desde $150 MXN/persona)',
    duracionSugerida: '2-4 horas',
    imagen:
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
    tags: ['agua', 'paseo', 'lancha', 'foto', 'tranquilo', 'pareja', 'familia'],
    ideal: ['solo', 'pareja', 'familia', 'amigos'],
    abierto: { dias: 'Todos los días', horario: '06:00 - 19:00' },
    destacado: true,
  },
  {
    id: 'eyipantla',
    nombre: 'Salto de Eyipantla',
    categoria: 'Naturaleza',
    municipio: 'San Andrés Tuxtla',
    descripcionCorta: 'Cascada de 50 metros, escenario natural emblemático.',
    descripcion:
      'Una de las cascadas más imponentes de México, con 50 m de altura y 40 m de ancho. Escenario de películas como Apocalypto. Cuenta con 244 escalones para bajar al mirador inferior.',
    coords: [18.5497, -95.1183],
    rating: 4.7,
    precio: 'bajo',
    precioMxn: '$30 MXN entrada',
    duracionSugerida: '1-2 horas',
    imagen:
      'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=800&q=80',
    tags: ['cascada', 'foto', 'aventura', 'caminata', 'familia'],
    ideal: ['solo', 'pareja', 'familia', 'amigos'],
    abierto: { dias: 'Todos los días', horario: '08:00 - 18:00' },
    destacado: true,
  },
  {
    id: 'nanciyaga',
    nombre: 'Reserva Ecológica Nanciyaga',
    categoria: 'Aventura',
    municipio: 'Catemaco',
    descripcionCorta: 'Temazcal, manantiales y selva nativa.',
    descripcion:
      'Reserva privada de selva alta perennifolia. Ofrece temazcal prehispánico, manantiales de agua mineral, ritual de limpia, kayak y cabañas ecológicas. Escenario de "Medicine Man".',
    coords: [18.4319, -95.0875],
    rating: 4.9,
    precio: 'medio',
    precioMxn: '$150 MXN entrada · paquetes desde $450',
    duracionSugerida: 'Medio día',
    imagen:
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80',
    tags: ['selva', 'spa', 'temazcal', 'pareja', 'experiencia', 'wellness'],
    ideal: ['pareja', 'amigos', 'familia'],
    abierto: { dias: 'Todos los días', horario: '09:00 - 18:00' },
    destacado: true,
  },
  {
    id: 'isla-monos',
    nombre: 'Isla de los Monos (Tanaxpillo)',
    categoria: 'Naturaleza',
    municipio: 'Catemaco',
    descripcionCorta: 'Isla con monos macacos en plena laguna.',
    descripcion:
      'Pequeña isla habitada por una colonia de macacos cola de muñón introducidos por la UV en los años 70. Se visita en lancha desde el malecón de Catemaco.',
    coords: [18.4225, -95.0941],
    rating: 4.5,
    precio: 'bajo',
    precioMxn: 'Incluido en tour de lancha ($200 MXN aprox)',
    duracionSugerida: '45 min',
    imagen:
      'https://images.unsplash.com/photo-1540206395-68808572332f?w=800&q=80',
    tags: ['fauna', 'monos', 'familia', 'foto', 'lancha'],
    ideal: ['familia', 'pareja', 'amigos'],
    abierto: { dias: 'Todos los días', horario: '07:00 - 17:00' },
  },
  {
    id: 'volcan-san-martin',
    nombre: 'Volcán San Martín Tuxtla',
    categoria: 'Aventura',
    municipio: 'San Andrés Tuxtla',
    descripcionCorta: 'Cráter activo de 1,650 m con vistas al Golfo.',
    descripcion:
      'Ascenso al cráter de uno de los volcanes activos de México. Senderismo de 4-6 horas a través de selva tropical. Recomendado con guía local.',
    coords: [18.5667, -95.2],
    rating: 4.6,
    precio: 'medio',
    precioMxn: 'Guía local $500-800 MXN',
    duracionSugerida: 'Día completo',
    imagen:
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
    tags: ['senderismo', 'aventura', 'volcán', 'extremo', 'amigos'],
    ideal: ['amigos', 'solo'],
    abierto: { dias: 'Todos los días', horario: '06:00 - 14:00' },
  },
  {
    id: 'sontecomapan',
    nombre: 'Laguna de Sontecomapan',
    categoria: 'Naturaleza',
    municipio: 'Catemaco',
    descripcionCorta: 'Manglar costero donde laguna y mar se encuentran.',
    descripcion:
      'Sistema lagunar conectado al Golfo de México. Recorridos en lancha por los manglares hasta La Barra, donde se puede nadar. Avistamiento de aves y, con suerte, manatíes.',
    coords: [18.5217, -95.0383],
    rating: 4.7,
    precio: 'bajo',
    precioMxn: 'Lancha desde $200 MXN',
    duracionSugerida: '3-4 horas',
    imagen:
      'https://images.unsplash.com/photo-1502780402662-acc01917cf9b?w=800&q=80',
    tags: ['manglar', 'aves', 'lancha', 'naturaleza', 'tranquilo'],
    ideal: ['solo', 'pareja', 'familia'],
    abierto: { dias: 'Todos los días', horario: '07:00 - 17:00' },
  },
  {
    id: 'playa-escondida',
    nombre: 'Playa Escondida',
    categoria: 'Playa',
    municipio: 'San Andrés Tuxtla',
    descripcionCorta: 'Playa virgen entre acantilados de selva.',
    descripcion:
      'Una de las playas más vírgenes de Veracruz. Arena oscura volcánica, oleaje moderado y selva hasta la orilla. Acceso por terracería desde Montepío.',
    coords: [18.6589, -95.0792],
    rating: 4.6,
    precio: 'bajo',
    precioMxn: 'Gratis',
    duracionSugerida: 'Medio día',
    imagen:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
    tags: ['playa', 'mar', 'virgen', 'pareja', 'tranquilo'],
    ideal: ['pareja', 'amigos', 'solo'],
    abierto: { dias: 'Todos los días', horario: 'Sin restricción' },
  },
  {
    id: 'playa-montepio',
    nombre: 'Playa de Montepío',
    categoria: 'Playa',
    municipio: 'San Andrés Tuxtla',
    descripcionCorta: 'Pueblo costero con palapas y mariscos frescos.',
    descripcion:
      'Comunidad pesquera con playa de arena oscura. Excelentes mariscos en palapas a pie de mar. Buena base para visitar Playa Escondida y Salto de Eyipantla.',
    coords: [18.6353, -95.1058],
    rating: 4.4,
    precio: 'medio',
    precioMxn: 'Comida $150-250 MXN',
    duracionSugerida: '4-6 horas',
    imagen:
      'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800&q=80',
    tags: ['playa', 'mariscos', 'familia', 'comida', 'mar'],
    ideal: ['familia', 'pareja', 'amigos'],
    abierto: { dias: 'Todos los días', horario: 'Sin restricción' },
  },
  {
    id: 'cabeza-cobata',
    nombre: 'Cabeza Colosal de Cobata',
    categoria: 'Cultura',
    municipio: 'Santiago Tuxtla',
    descripcionCorta: 'La cabeza olmeca más grande, en el centro de Santiago.',
    descripcion:
      'Réplica monumental de la cabeza olmeca encontrada en el cerro Cobata, expuesta en la plaza central de Santiago Tuxtla. Junto al Museo Tuxteco.',
    coords: [18.4683, -95.3],
    rating: 4.3,
    precio: 'bajo',
    precioMxn: 'Gratis',
    duracionSugerida: '30 min',
    imagen:
      'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&q=80',
    tags: ['arqueología', 'olmeca', 'cultura', 'historia', 'foto'],
    ideal: ['solo', 'pareja', 'familia', 'amigos'],
    abierto: { dias: 'Todos los días', horario: '24 horas' },
  },
  {
    id: 'museo-tuxteco',
    nombre: 'Museo Tuxteco',
    categoria: 'Cultura',
    municipio: 'Santiago Tuxtla',
    descripcionCorta: 'Piezas olmecas originales en el corazón de Santiago.',
    descripcion:
      'Museo regional con piezas olmecas auténticas, incluyendo "El Negro de Santiago", monolito de 2.5 m. Una visita obligada para entender la historia profunda de la región.',
    coords: [18.467, -95.2987],
    rating: 4.5,
    precio: 'bajo',
    precioMxn: '$60 MXN',
    duracionSugerida: '1-2 horas',
    imagen:
      'https://images.unsplash.com/photo-1564399579883-451a5d44ec08?w=800&q=80',
    tags: ['museo', 'olmeca', 'cultura', 'historia', 'educativo'],
    ideal: ['solo', 'pareja', 'familia'],
    abierto: { dias: 'Mar-Dom', horario: '09:00 - 17:00' },
  },
  {
    id: 'basilica-catemaco',
    nombre: 'Basílica de la Virgen del Carmen',
    categoria: 'Cultura',
    municipio: 'Catemaco',
    descripcionCorta: 'Centro religioso de Catemaco, mira al lago.',
    descripcion:
      'Santuario dedicado a la Virgen del Carmen, patrona de Catemaco. Su festividad del 16 de julio reúne a miles de peregrinos. Vista directa al malecón.',
    coords: [18.4196, -95.1175],
    rating: 4.5,
    precio: 'bajo',
    precioMxn: 'Gratis',
    duracionSugerida: '30 min',
    imagen:
      'https://images.unsplash.com/photo-1548270361-d2e6e2db5f5e?w=800&q=80',
    tags: ['religión', 'arquitectura', 'cultura', 'foto'],
    ideal: ['solo', 'pareja', 'familia'],
    abierto: { dias: 'Todos los días', horario: '07:00 - 20:00' },
  },
  {
    id: 'laguna-encantada',
    nombre: 'Laguna Encantada',
    categoria: 'Naturaleza',
    municipio: 'San Andrés Tuxtla',
    descripcionCorta: 'Laguna que sube en sequía y baja en lluvias.',
    descripcion:
      'Fenómeno hidrológico único: el nivel del agua sube en temporada seca y baja en lluvias, por su conexión con cavidades subterráneas. Sendero corto y tranquilo.',
    coords: [18.4856, -95.1928],
    rating: 4.4,
    precio: 'bajo',
    precioMxn: '$20 MXN',
    duracionSugerida: '1-2 horas',
    imagen:
      'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80',
    tags: ['laguna', 'misterio', 'naturaleza', 'caminata', 'pareja'],
    ideal: ['pareja', 'familia', 'solo'],
    abierto: { dias: 'Todos los días', horario: '08:00 - 17:00' },
  },
  {
    id: 'malecon-catemaco',
    nombre: 'Malecón de Catemaco',
    categoria: 'Cultura',
    municipio: 'Catemaco',
    descripcionCorta: 'Punto de encuentro junto al lago y los lancheros.',
    descripcion:
      'Paseo peatonal frente a la laguna. Punto donde se contratan recorridos en lancha, se prueba el mojarra al ajillo y se ve el atardecer. Mercado de artesanías y curanderos.',
    coords: [18.42, -95.1175],
    rating: 4.5,
    precio: 'bajo',
    precioMxn: 'Gratis',
    duracionSugerida: '1-3 horas',
    imagen:
      'https://images.unsplash.com/photo-1530541930197-ff16ac917b0e?w=800&q=80',
    tags: ['malecón', 'paseo', 'atardecer', 'comida', 'centro'],
    ideal: ['solo', 'pareja', 'familia', 'amigos'],
    abierto: { dias: 'Todos los días', horario: '24 horas' },
  },
  {
    id: 'restaurante-7brujas',
    nombre: 'Restaurante Las 7 Brujas',
    categoria: 'Gastronomia',
    municipio: 'Catemaco',
    descripcionCorta: 'Mojarra fresca, tegogolo y vista al lago.',
    descripcion:
      'Restaurante familiar especializado en pescado de la laguna: mojarra al mojo, tegogolo en salsa, topote ahumado y caldo de mariscos. Terraza con vista a la laguna.',
    coords: [18.4205, -95.119],
    rating: 4.6,
    precio: 'medio',
    precioMxn: '$150-300 MXN por persona',
    duracionSugerida: '1-2 horas',
    imagen:
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    tags: ['mariscos', 'pescado', 'regional', 'vista', 'familia'],
    ideal: ['pareja', 'familia', 'amigos'],
    abierto: { dias: 'Todos los días', horario: '08:00 - 22:00' },
  },
  {
    id: 'restaurante-ola',
    nombre: 'Restaurante La Ola',
    categoria: 'Gastronomia',
    municipio: 'Catemaco',
    descripcionCorta: 'Cocina veracruzana frente al agua.',
    descripcion:
      'Comida regional veracruzana en terraza palapa. Especialidad: filete a la diabla, camarones al coco y tlatonile (mole tuxteco).',
    coords: [18.421, -95.1166],
    rating: 4.5,
    precio: 'medio',
    precioMxn: '$180-280 MXN por persona',
    duracionSugerida: '1-2 horas',
    imagen:
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80',
    tags: ['veracruzano', 'mariscos', 'palapa', 'familia'],
    ideal: ['pareja', 'familia'],
    abierto: { dias: 'Todos los días', horario: '12:00 - 22:00' },
  },
  {
    id: 'hotel-finca',
    nombre: 'Hotel La Finca',
    categoria: 'Hospedaje',
    municipio: 'Catemaco',
    descripcionCorta: 'Hotel boutique frente a la laguna.',
    descripcion:
      'Hotel con alberca infinita, vista directa al lago y desayuno incluido. Habitaciones con balcón. A 5 min del centro.',
    coords: [18.4115, -95.1212],
    rating: 4.5,
    precio: 'alto',
    precioMxn: '$1,400 - $2,200 MXN/noche',
    duracionSugerida: 'Estancia',
    imagen:
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80',
    tags: ['hotel', 'lujo', 'alberca', 'vista', 'pareja'],
    ideal: ['pareja', 'familia'],
    abierto: { dias: 'Todos los días', horario: 'Check-in 15:00' },
    contactoLocal: 'reservas@lafinca.mx',
  },
  {
    id: 'posada-tropical',
    nombre: 'Posada Don Miguel',
    categoria: 'Hospedaje',
    municipio: 'Catemaco',
    descripcionCorta: 'Posada familiar, económica y acogedora.',
    descripcion:
      'Posada de manejo familiar en el centro de Catemaco. Habitaciones limpias, ventilador, desayuno opcional. Ideal para mochileros y familias con presupuesto.',
    coords: [18.4188, -95.1196],
    rating: 4.2,
    precio: 'bajo',
    precioMxn: '$450 - $700 MXN/noche',
    duracionSugerida: 'Estancia',
    imagen:
      'https://images.unsplash.com/photo-1455587734955-081b22074882?w=800&q=80',
    tags: ['posada', 'económico', 'centro', 'familia', 'mochilero'],
    ideal: ['solo', 'amigos', 'familia'],
    abierto: { dias: 'Todos los días', horario: 'Check-in 14:00' },
  },
  {
    id: 'sendero-cerro-mono-blanco',
    nombre: 'Sendero Cerro Mono Blanco',
    categoria: 'Aventura',
    municipio: 'Catemaco',
    descripcionCorta: 'Caminata con vista panorámica al lago.',
    descripcion:
      'Sendero de dificultad media (2 km, 1.5 h). Conduce a un mirador con la mejor vista panorámica de la laguna de Catemaco al amanecer.',
    coords: [18.4051, -95.0935],
    rating: 4.7,
    precio: 'bajo',
    precioMxn: 'Guía $200 MXN',
    duracionSugerida: '2-3 horas',
    imagen:
      'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&q=80',
    tags: ['senderismo', 'mirador', 'amanecer', 'vista', 'amigos'],
    ideal: ['amigos', 'pareja', 'solo'],
    abierto: { dias: 'Todos los días', horario: '05:30 - 18:00' },
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
  [18.35, -95.4], // SW
  [18.7, -94.95], // NE
];
export const LOS_TUXTLAS_CENTER: [number, number] = [18.45, -95.15];
