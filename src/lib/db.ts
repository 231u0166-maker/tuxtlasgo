import Dexie, { Table } from 'dexie';
import type { Lugar } from '../data/lugares';

// ============================================================
// BASE DE DATOS LOCAL (IndexedDB vía Dexie)
// ============================================================
// Persiste entre sesiones y funciona 100% offline.
// 3 tablas: favoritos, rutas guardadas, y servicios de prestadores.
// ============================================================

export interface Favorito {
  id: string; // mismo id que el lugar
  agregadoEn: number;
}

export interface RutaGuardada {
  id?: number;
  nombre: string;
  creadaEn: number;
  dias: { dia: number; lugaresIds: string[]; resumen: string }[];
  prefsJson: string;
}

// Estados posibles de un servicio registrado por un prestador
export type EstadoServicio = 'pendiente' | 'aprobado' | 'rechazado';

export interface ServicioPrestador {
  id?: number;
  nombreNegocio: string;
  categoria: string;
  municipio: string;
  descripcion: string;
  precio: string;
  contacto: string;
  ubicacionLat: number;
  ubicacionLng: number;
  creadoEn: number;
  estado: EstadoServicio;
  motivoRechazo?: string;
  // Código de seguimiento para que el prestador consulte su estado
  codigoSeguimiento?: string;
  foto?: string;
  // ── Campos para PlaceCard completa (Módulo 1) ──────────────
  // Sin estos, servicioComoLugar() rellena con "Consultar" genérico
  horario?: string;       // ej: "9:00 am – 6:00 pm"
  diasAbierto?: string;  // ej: "Todos los días"
  duracion?: string;      // ej: "2-3 horas"
  comoLlegar?: string;   // Indicaciones de cómo llegar
  tip?: string;           // Consejo insider para el turista
  idealPara?: string[];  // ej: ['pareja', 'familia', 'grupos', 'solo']
  // ── Plan Premium $89 MXN/mes (Módulo 2 — monetización) ─────
  // Beneficio contratado: posicionamiento prioritario en el
  // algoritmo de recomendación de la IA. Se factura aparte del
  // 6% de comisión por reservación (ver Etp_Reg_Plan_Neg).
  premium?: boolean;
  premiumDesde?: number;
  premiumHasta?: number; // permite manejar vencimiento/renovación
}

// Geometría de una ruta calculada por OSRM, cacheada para uso offline
export interface RutaCacheada {
  clave: string; // identificador único basado en los puntos
  geometria: [number, number][]; // polyline decodificada
  distanciaMetros: number;
  duracionSegundos: number;
  calculadaEn: number;
}

// Vector semántico cacheado de un lugar/prestador (memoria vectorizada
// offline — ver src/lib/embeddings.ts). Se recalcula solo si `texto`
// cambia, así que registrar/editar un prestador lo re-indexa solo.
export interface VectorLugar {
  id: string; // mismo id que Lugar.id
  texto: string; // snapshot del texto usado para generar el vector
  vector: number[]; // 384 dimensiones (Xenova/all-MiniLM-L6-v2)
  actualizadoEn: number;
}

// Ficha de conocimiento dinámica cacheada offline (agregada desde el
// panel de admin, ver api/conocimiento/admin.ts). Misma forma que
// EntradaConocimiento en conocimiento.ts, pero con id numérico real
// de la base de datos para poder actualizarla/limpiarla.
export interface ConocimientoCacheado {
  id: number;
  claves: string; // separadas por coma, tal como se guardan en Neon
  titulo: string;
  respuesta: string;
  prioridad: number;
}

class TuxtlasDB extends Dexie {
  favoritos!: Table<Favorito, string>;
  rutas!: Table<RutaGuardada, number>;
  prestadores!: Table<ServicioPrestador, number>;
  rutasCache!: Table<RutaCacheada, string>;
  vectores!: Table<VectorLugar, string>;
  conocimientoCache!: Table<ConocimientoCacheado, number>;

  constructor() {
    super('tuxtlasgo-db');
    this.version(1).stores({
      favoritos: 'id, agregadoEn',
      rutas: '++id, creadaEn',
      prestadores: '++id, municipio, creadoEn, estado',
    });
    // v2: índice nuevo por codigoSeguimiento
    this.version(2).stores({
      favoritos: 'id, agregadoEn',
      rutas: '++id, creadaEn',
      prestadores: '++id, municipio, creadoEn, estado, codigoSeguimiento',
    });
    // v3: tabla nueva rutasCache para guardar rutas calculadas
    // por OSRM y poder reutilizarlas sin internet.
    this.version(3).stores({
      favoritos: 'id, agregadoEn',
      rutas: '++id, creadaEn',
      prestadores: '++id, municipio, creadoEn, estado, codigoSeguimiento',
      rutasCache: 'clave, calculadaEn',
    });
    // v4: tabla vectores (memoria semántica offline) + índice por
    // `premium` para poder listar/filtrar suscriptores del plan $89.
    this.version(4).stores({
      favoritos: 'id, agregadoEn',
      rutas: '++id, creadaEn',
      prestadores: '++id, municipio, creadoEn, estado, codigoSeguimiento, premium',
      rutasCache: 'clave, calculadaEn',
      vectores: 'id, actualizadoEn',
    });
    // v5: caché offline de la base de conocimiento dinámica agregada
    // desde el panel de admin (ver api/conocimiento/admin.ts). Se
    // descarga una vez con internet y queda disponible sin conexión.
    this.version(5).stores({
      favoritos: 'id, agregadoEn',
      rutas: '++id, creadaEn',
      prestadores: '++id, municipio, creadoEn, estado, codigoSeguimiento, premium',
      rutasCache: 'clave, calculadaEn',
      vectores: 'id, actualizadoEn',
      conocimientoCache: 'id',
    });
  }
}

export const db = new TuxtlasDB();

// ─────────────── FAVORITOS ───────────────
export async function toggleFavorito(lugarId: string): Promise<boolean> {
  const existente = await db.favoritos.get(lugarId);
  if (existente) {
    await db.favoritos.delete(lugarId);
    return false;
  }
  await db.favoritos.put({ id: lugarId, agregadoEn: Date.now() });
  return true;
}

export async function esFavorito(lugarId: string): Promise<boolean> {
  return !!(await db.favoritos.get(lugarId));
}

export async function listarFavoritos(catalogo: Lugar[]): Promise<Lugar[]> {
  const favs = await db.favoritos.toArray();
  const ids = new Set(favs.map((f) => f.id));
  return catalogo.filter((l) => ids.has(l.id));
}

// ─────────────── PRESTADORES ───────────────

// Genera un código corto y legible (ej: "TGO-A7B2")
export function generarCodigoSeguimiento(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres confusos
  let codigo = '';
  for (let i = 0; i < 4; i++) {
    codigo += chars[Math.floor(Math.random() * chars.length)];
  }
  return `TGO-${codigo}`;
}

// Registra un nuevo servicio (siempre entra como "pendiente")
export async function registrarServicio(
  datos: Omit<ServicioPrestador, 'id' | 'creadoEn' | 'estado' | 'codigoSeguimiento'>
): Promise<{ id: number; codigo: string }> {
  const codigo = generarCodigoSeguimiento();
  const id = (await db.prestadores.add({
    ...datos,
    creadoEn: Date.now(),
    estado: 'pendiente',
    codigoSeguimiento: codigo,
  })) as number;
  return { id, codigo };
}

// Busca un servicio por su código de seguimiento
export async function buscarPorCodigo(
  codigo: string
): Promise<ServicioPrestador | undefined> {
  const limpio = codigo.trim().toUpperCase();
  return db.prestadores.where('codigoSeguimiento').equals(limpio).first();
}

// Cambia el estado de un servicio (acción de administrador)
export async function cambiarEstadoServicio(
  id: number,
  estado: EstadoServicio,
  motivoRechazo?: string
): Promise<void> {
  await db.prestadores.update(id, {
    estado,
    motivoRechazo: motivoRechazo || undefined,
  });
}

// Convierte un servicio aprobado en objeto Lugar (para mapa/explorar)
export function servicioComoLugar(s: ServicioPrestador): Lugar {
  // Imagen principal: primero la foto de perfil del servicio, luego placeholder
  const imagenPrincipal = s.foto
    ?? 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80';

  return {
    id: `prestador-${s.id}`,
    nombre: s.nombreNegocio,
    categoria: (s.categoria as Lugar['categoria']) || 'Gastronomia',
    municipio: (s.municipio as Lugar['municipio']) || 'Catemaco',
    descripcion: s.descripcion,
    descripcionCorta:
      s.descripcion.slice(0, 90) + (s.descripcion.length > 90 ? '…' : ''),
    coords: [s.ubicacionLat, s.ubicacionLng],
    rating: 0,
    precio: 'medio',
    precioMxn: s.precio || 'Consultar precio',
    // ── Campos enriquecidos (Módulo 1) ───────────────────────
    duracionSugerida: s.duracion     || 'Variable',
    imagen: imagenPrincipal,
    tags: ['prestador local', s.categoria.toLowerCase()],
    ideal: s.idealPara              || ['solo', 'pareja', 'familia', 'amigos'],
    abierto: {
      dias:    s.diasAbierto || 'Consultar disponibilidad',
      horario: s.horario     || 'Consultar horario',
    },
    comoLlegar: s.comoLlegar || `En ${s.municipio}. Contacto: ${s.contacto}`,
    tip: s.tip,
    verificado: s.estado === 'aprobado',
    contacto: s.contacto,
    premium: !!s.premium && (!s.premiumHasta || s.premiumHasta > Date.now()),
  };
}

// Lista los servicios aprobados como Lugares
export async function listarServiciosAprobadosComoLugares(): Promise<Lugar[]> {
  const aprobados = await db.prestadores
    .where('estado')
    .equals('aprobado')
    .toArray();
  return aprobados.map(servicioComoLugar);
}

// Seed inicial: si la BD está vacía, agrega prestadores demo
export async function seedDemoSiVacio() {
  const count = await db.prestadores.count();
  if (count > 0) return;
  await db.prestadores.bulkAdd([
    {
      nombreNegocio: 'Lanchas Don Cheve',
      categoria: 'Aventura',
      municipio: 'Catemaco',
      descripcion:
        'Recorridos en lancha por la laguna de Catemaco. Capacidad para 7 personas. 25 años de experiencia mostrando las islas y la reserva.',
      precio: '$200 MXN por persona',
      contacto: 'WhatsApp: 294-100-0001',
      ubicacionLat: 18.42,
      ubicacionLng: -95.118,
      creadoEn: Date.now() - 86400000 * 3,
      estado: 'aprobado',
      codigoSeguimiento: 'TGO-DEMO',
    },
    {
      nombreNegocio: 'Cabañas El Mirador',
      categoria: 'Hospedaje',
      municipio: 'San Andrés Tuxtla',
      descripcion:
        'Cabañas familiares con vista al volcán San Martín. Desayuno tradicional incluido. Capacidad hasta 6 personas por cabaña.',
      precio: '$850 MXN/noche',
      contacto: 'cabanas.mirador@correo.com',
      ubicacionLat: 18.45,
      ubicacionLng: -95.21,
      creadoEn: Date.now() - 86400000 * 1,
      estado: 'pendiente',
      codigoSeguimiento: 'TGO-DEM2',
    },
    {
      nombreNegocio: 'Restaurante & Tours Pedro Hernández',
      categoria: 'Gastronomia',
      municipio: 'Catemaco',
      descripcion:
        'Pedro Hernández, guía turístico local con 40 años de experiencia en la región de Los Tuxtlas y propietario de restaurante familiar en Catemaco. Ofrece recorridos personalizados por la laguna, la selva y sitios arqueológicos, además de cocina regional auténtica. Microempresa con raíces locales y atención personalizada.',
      precio: 'Tours desde $300 MXN · Menú del día $120 MXN',
      contacto: 'WhatsApp: 294-100-0003',
      ubicacionLat: 18.4174,
      ubicacionLng: -95.1096,
      creadoEn: Date.now() - 86400000 * 0,
      estado: 'aprobado',
      codigoSeguimiento: 'TGO-DEM3',
      foto: '/imgPrestadores/Prestador_img.jpg',
    },
  ]);
}

// Guarda una ruta generada por la IA en el dispositivo del usuario.
// Los IDs de los lugares se guardan (no los objetos completos) para
// que la ruta ocupe poco espacio y funcione offline.
export async function guardarRuta(
  nombre: string,
  dias: { dia: number; lugaresIds: string[]; resumen: string }[],
  prefs: object
): Promise<number> {
  return db.rutas.add({
    nombre,
    creadaEn: Date.now(),
    dias,
    prefsJson: JSON.stringify(prefs),
  }); 
}

// Verifica si el mapa ya fue descargado para uso offline.
export function mapaDescargado(): boolean {
  try {
    return localStorage.getItem('tiles-precargados') === 'true';
  } catch {
    return false;
  }
}