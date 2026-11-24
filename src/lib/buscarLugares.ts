// ============================================================
// BUSCADOR DE LUGARES DEL MAPA (estilo Google Maps)
// ============================================================
// Dos fuentes:
//  - Catálogo de TuxtlasGO (lugares y servicios de prestadores): local, instantáneo,
//    funciona sin internet.
//  - OpenStreetMap vía Nominatim: calles, colonias, negocios y localidades de
//    Puebla, Tabasco y Veracruz (incluye Los Tuxtlas). Solo con internet.
//
// Política de uso de Nominatim (https://operations.osmfoundation.org/policies/nominatim/):
// máximo 1 petición por segundo y NADA de autocompletado mientras se escribe, por eso la
// búsqueda en OpenStreetMap se hace al enviar (Enter / botón), no en cada tecla. El navegador
// ya manda el Referer de la app; no se envía ningún dato personal.
// ============================================================

import { CATEGORIAS, type Lugar } from '../data/lugares';
import type { Coord } from './routing';

// Zona de búsqueda = las de los paquetes de mapa: Puebla, Tabasco y Veracruz [oeste, sur, este, norte].
export const CAJA_BUSQUEDA: [number, number, number, number] = [-99.1, 17.1, -90.9, 22.5];
const ESTADOS_PERMITIDOS = ['puebla', 'veracruz', 'tabasco'];

export interface ResultadoBusqueda {
  id: string;
  coord: Coord;
  nombre: string;
  detalle: string;
  etiqueta: string;
  emoji: string;
  origen: 'catalogo' | 'osm' | 'offline';
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ---------- Catálogo local ----------
export function buscarEnCatalogo(texto: string, lugares: Lugar[], max = 5): ResultadoBusqueda[] {
  const q = normalizar(texto);
  if (q.length < 2) return [];
  const vistos = new Set<string>();
  const puntuados: { l: Lugar; p: number }[] = [];
  for (const l of lugares) {
    if (vistos.has(l.id) || !l.coords) continue;
    vistos.add(l.id);
    const nombre = normalizar(l.nombre);
    // 0 = empieza igual, 1 = lo contiene, 2 = coincide en municipio/categoría/etiquetas
    const p = nombre.startsWith(q) ? 0 : nombre.includes(q) ? 1
      : [l.municipio, l.categoria, ...(l.tags ?? [])].some((x) => normalizar(String(x)).includes(q)) ? 2 : -1;
    if (p >= 0) puntuados.push({ l, p });
  }
  puntuados.sort((a, b) => a.p - b.p);
  return puntuados.slice(0, max).map(({ l }) => ({
    id: `cat-${l.id}`,
    coord: l.coords as Coord,
    nombre: l.nombre,
    detalle: l.municipio,
    etiqueta: l.categoria,
    emoji: CATEGORIAS.find((c) => c.id === l.categoria)?.emoji ?? '📍',
    origen: 'catalogo',
  }));
}

// ---------- OpenStreetMap (Nominatim) ----------
interface FilaNominatim {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category?: string;
  type?: string;
  addresstype?: string;
  address?: Record<string, string>;
}

// Etiqueta y emoji según lo que devuelve Nominatim (categoría + tipo de OSM)
export function describirOsm(categoria = '', tipo = ''): { etiqueta: string; emoji: string } {
  const t = tipo.toLowerCase();
  const mapa: Record<string, [string, string]> = {
    restaurant: ['Restaurante', '🍽️'], fast_food: ['Comida rápida', '🍔'], cafe: ['Café', '☕'], bar: ['Bar', '🍺'],
    hotel: ['Hotel', '🛏️'], hostel: ['Hostal', '🛏️'], guest_house: ['Hospedaje', '🛏️'], motel: ['Motel', '🛏️'], camp_site: ['Campamento', '⛺'],
    hospital: ['Hospital', '🏥'], clinic: ['Clínica', '🏥'], pharmacy: ['Farmacia', '💊'], police: ['Policía', '🚓'],
    fuel: ['Gasolinera', '⛽'], bank: ['Banco', '🏦'], atm: ['Cajero', '🏧'], bus_station: ['Autobuses', '🚌'],
    school: ['Escuela', '🏫'], university: ['Universidad', '🎓'], place_of_worship: ['Iglesia / templo', '⛪'],
    park: ['Parque', '🌳'], beach: ['Playa', '🏖️'], waterfall: ['Cascada', '💧'], peak: ['Cerro', '⛰️'], volcano: ['Volcán', '🌋'],
    viewpoint: ['Mirador', '🔭'], museum: ['Museo', '🏛️'], attraction: ['Atracción', '📍'], marketplace: ['Mercado', '🧺'],
    supermarket: ['Supermercado', '🛒'], city: ['Ciudad', '🏙️'], town: ['Pueblo', '🏘️'], village: ['Localidad', '🏘️'],
    hamlet: ['Localidad', '🏘️'], suburb: ['Colonia', '🏘️'], neighbourhood: ['Colonia', '🏘️'], quarter: ['Colonia', '🏘️'],
    residential: ['Calle', '🛣️'], primary: ['Carretera', '🛣️'], secondary: ['Carretera', '🛣️'], tertiary: ['Calle', '🛣️'],
    lake: ['Laguna / lago', '🌊'], water: ['Agua', '🌊'], nature_reserve: ['Reserva natural', '🌿'],
    // Tipos que salen del índice de los paquetes (extracto completo de OpenStreetMap)
    square: ['Plaza', '🏛️'], townhall: ['Ayuntamiento', '🏛️'], theme_park: ['Parque temático', '🎢'], mall: ['Plaza comercial', '🛍️'],
    cemetery: ['Panteón', '🪦'], bakery: ['Panadería', '🥖'], butcher: ['Carnicería', '🥩'], convenience: ['Tienda', '🛒'],
    clothes: ['Ropa', '👕'], hairdresser: ['Estética', '💇'], dentist: ['Dentista', '🦷'], doctors: ['Consultorio', '🩺'],
    veterinary: ['Veterinaria', '🐾'], taxi: ['Taxis', '🚕'], kindergarten: ['Escuela', '🏫'], college: ['Escuela', '🏫'],
    library: ['Biblioteca', '📚'], cinema: ['Cine', '🎬'], theatre: ['Teatro', '🎭'], stadium: ['Estadio', '🏟️'],
    sports_centre: ['Deportivo', '🏟️'], fitness_centre: ['Gimnasio', '🏋️'], garden: ['Jardín', '🌷'], monument: ['Monumento', '🗿'],
    memorial: ['Memorial', '🗿'], ruins: ['Ruinas', '🏚️'], archaeological_site: ['Zona arqueológica', '🏺'], castle: ['Castillo', '🏰'],
    building: ['Edificio', '🏢'], shop: ['Tienda', '🛍️'], tower: ['Torre', '🗼'], lighthouse: ['Faro', '🗼'],
    aerodrome: ['Aeropuerto', '✈️'], railway_station: ['Estación de tren', '🚉'], post_office: ['Correos', '📮'],
    fire_station: ['Bomberos', '🚒'], courthouse: ['Juzgado', '⚖️'], community_centre: ['Centro comunitario', '🏘️'],
    nightclub: ['Antro', '🎶'], ice_cream: ['Helados', '🍦'], hospital_: ['Hospital', '🏥'], beach_resort: ['Balneario', '🏖️'],
    resort: ['Resort', '🏖️'], apartment: ['Departamentos', '🏢'], gallery: ['Galería', '🖼️'], zoo: ['Zoológico', '🦁'],
    theme: ['Parque temático', '🎢'],
    conference_centre: ['Centro de convenciones', '🏢'], conference_center: ['Centro de convenciones', '🏢'],
    exhibition_centre: ['Centro de exposiciones', '🏢'], events_venue: ['Salón de eventos', '🎉'], arts_centre: ['Centro cultural', '🎭'],
    social_centre: ['Centro social', '🏘️'], social_facility: ['Servicio social', '🤝'], clinic_: ['Clínica', '🏥'],
  };
  if (mapa[t]) return { etiqueta: mapa[t][0], emoji: mapa[t][1] };
  if (categoria === 'highway') return { etiqueta: 'Calle', emoji: '🛣️' };
  if (categoria === 'boundary' || categoria === 'place') return { etiqueta: 'Localidad', emoji: '🏘️' };
  return { etiqueta: 'Lugar', emoji: '📍' };
}

export async function buscarEnOsm(texto: string, senal?: AbortSignal): Promise<ResultadoBusqueda[]> {
  const q = texto.trim();
  if (q.length < 3) return [];
  const [o, s, e, n] = CAJA_BUSQUEDA;
  const params = new URLSearchParams({
    format: 'jsonv2', q, limit: '20', addressdetails: '1', 'accept-language': 'es', countrycodes: 'mx',
    viewbox: `${o},${n},${e},${s}`, bounded: '1', dedupe: '1',
  });
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal: senal });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const filas: FilaNominatim[] = await r.json();
  const vistos = new Set<string>();
  const out: ResultadoBusqueda[] = [];
  for (const f of filas) {
    // La caja de búsqueda también abarca trozos de Oaxaca, Chiapas, Hidalgo…: solo los 3 estados.
    const estado = normalizar(f.address?.state ?? '');
    if (!ESTADOS_PERMITIDOS.some((x) => estado.startsWith(x))) continue;
    const a = f.address ?? {};
    const lugar = a.city || a.town || a.village || a.municipality || a.county || '';
    const nombre = f.name || f.display_name.split(',')[0].trim();
    const estadoCorto = /veracruz/i.test(a.state) ? 'Veracruz' : a.state;
    const detalle = [a.road && a.road !== nombre ? a.road : '', a.suburb && a.suburb !== nombre ? a.suburb : '', lugar, estadoCorto]
      .filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i).join(', ');
    const clave = `${normalizar(nombre)}|${detalle}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const { etiqueta, emoji } = describirOsm(f.category, f.type);
    out.push({
      id: `osm-${f.place_id}`, coord: [parseFloat(f.lat), parseFloat(f.lon)], nombre, detalle, etiqueta, emoji, origen: 'osm',
    });
    if (out.length >= 8) break;
  }
  return out;
}
