import Dexie, { Table } from 'dexie';
import type { Lugar } from '../data/lugares';

// IndexedDB local: persiste entre sesiones, funciona offline.
// 3 tablas: favoritos del usuario, rutas guardadas, y servicios registrados
// por prestadores locales (la otra mitad del modelo de negocio).

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
  imagenBase64?: string;
  creadoEn: number;
  estado: 'pendiente' | 'aprobado';
}

class TuxtlasDB extends Dexie {
  favoritos!: Table<Favorito, string>;
  rutas!: Table<RutaGuardada, number>;
  prestadores!: Table<ServicioPrestador, number>;

  constructor() {
    super('tuxtlasgo-db');
    this.version(1).stores({
      favoritos: 'id, agregadoEn',
      rutas: '++id, creadaEn',
      prestadores: '++id, municipio, creadoEn, estado',
    });
  }
}

export const db = new TuxtlasDB();

// Helpers para favoritos
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

// Convertir datos del catálogo + favoritos en lista de Lugares favoritos
export async function listarFavoritos(catalogo: Lugar[]): Promise<Lugar[]> {
  const favs = await db.favoritos.toArray();
  const ids = new Set(favs.map((f) => f.id));
  return catalogo.filter((l) => ids.has(l.id));
}

// Seed inicial: si la BD está vacía, agregar 2 prestadores demo
// para que el panel de admin no se vea vacío en la primera carga
export async function seedDemoSiVacio() {
  const count = await db.prestadores.count();
  if (count > 0) return;
  await db.prestadores.bulkAdd([
    {
      nombreNegocio: 'Lanchas Don Cheve',
      categoria: 'Aventura',
      municipio: 'Catemaco',
      descripcion:
        'Recorridos en lancha por la laguna de Catemaco. 7 personas máximo. 25 años de experiencia.',
      precio: '$200 MXN por persona',
      contacto: 'WhatsApp: 294-100-0001',
      ubicacionLat: 18.42,
      ubicacionLng: -95.118,
      creadoEn: Date.now() - 86400000 * 3,
      estado: 'aprobado',
    },
    {
      nombreNegocio: 'Cabañas El Mirador',
      categoria: 'Hospedaje',
      municipio: 'San Andrés Tuxtla',
      descripcion:
        'Cabañas familiares con vista al volcán. Desayuno tradicional incluido. Capacidad hasta 6 personas.',
      precio: '$850 MXN/noche',
      contacto: 'cabanas.mirador@gmail.com',
      ubicacionLat: 18.45,
      ubicacionLng: -95.21,
      creadoEn: Date.now() - 86400000 * 5,
      estado: 'aprobado',
    },
  ]);
}
