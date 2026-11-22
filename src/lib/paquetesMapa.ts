// ============================================================
// MAPA DESDE LOS PAQUETES INSTALADOS
// ============================================================
// Registra en MapLibre el protocolo "paquete://z/x/y". Cada mosaico se busca
// primero en los paquetes instalados (archivo PMTiles en OPFS, sin internet ni
// espera); si ningún paquete lo tiene y hay internet, se pide a OpenFreeMap
// como siempre; sin internet y sin paquete, queda vacío (no truena).
// ============================================================

import maplibregl from 'maplibre-gl';
import { PMTiles, type Source, type RangeResponse } from 'pmtiles';
import { ESTILO_MAPA_URL, PLANTILLA_SATELITE, TOKEN_MAPBOX, ajustarUrlSinConexion } from './mapaOffline';
import { abrirArchivoPaquete, leerInstalados, type PaqueteInstalado } from './paquetes';

class FuenteOpfs implements Source {
  constructor(private id: string) { }
  getKey() { return `opfs:${this.id}`; }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const f = await abrirArchivoPaquete(this.id);
    if (!f) throw new Error('Paquete no encontrado');
    return { data: await f.slice(offset, offset + length).arrayBuffer() };
  }
}

const abiertos = new Map<string, PMTiles>();
function abrir(id: string): PMTiles {
  let p = abiertos.get(id);
  if (!p) { p = new PMTiles(new FuenteOpfs(id)); abiertos.set(id, p); }
  return p;
}
export function olvidarPaquetesAbiertos() { abiertos.clear(); }

const lng2x = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

// Paquetes cuyo recuadro toca el mosaico z/x/y
function paquetesDelMosaico(z: number, x: number, y: number): PaqueteInstalado[] {
  const n = 2 ** z;
  return leerInstalados().filter((p) => {
    const [o, s, e, no] = p.bbox;
    return x >= lng2x(o, z) && x <= lng2x(e, z) && y >= lat2y(no, z) && y <= lat2y(s, z) && x < n;
  });
}

async function descomprimirSiGzip(b: Uint8Array): Promise<Uint8Array> {
  if (b.length > 2 && b[0] === 0x1f && b[1] === 0x8b) {
    const flujo = new Blob([b as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }
  return b;
}

async function plantillaRed(): Promise<string | null> {
  try {
    const guardada = localStorage.getItem('openfreemap-plantilla');
    if (guardada) return guardada;
  } catch { /* nada */ }
  try {
    const j = await (await fetch('https://tiles.openfreemap.org/planet')).json();
    const t: string = j.tiles[0];
    try { localStorage.setItem('openfreemap-plantilla', t); } catch { /* nada */ }
    return t;
  } catch { return null; }
}

let registrado = false;
export function registrarProtocoloPaquetes() {
  if (registrado) return;
  registrado = true;
  maplibregl.addProtocol('paquete', async (params, abort) => {
    const m = params.url.match(/paquete:\/\/(\d+)\/(\d+)\/(\d+)/);
    if (!m) throw new Error('URL de mosaico inválida');
    const z = +m[1], x = +m[2], y = +m[3];

    // 1) paquetes instalados
    for (const pk of paquetesDelMosaico(z, x, y)) {
      try {
        const r = await abrir(pk.id).getZxy(z, x, y, abort.signal);
        if (r) return { data: (await descomprimirSiGzip(new Uint8Array(r.data))).slice().buffer };
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
      }
    }
    // 2) red (también pasa por el service worker, que guarda en el caché de zonas)
    const plantilla = await plantillaRed();
    if (plantilla) {
      const url = ajustarUrlSinConexion(
        plantilla.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
      );
      try {
        const r = await fetch(url, { signal: abort.signal });
        if (r.ok) return { data: await r.arrayBuffer() };
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
      }
    }
    // 3) sin paquete y sin red: mosaico vacío
    return { data: new ArrayBuffer(0) };
  });
}

// Estilo "liberty" de OpenFreeMap, pero leyendo los mosaicos por el protocolo de
// paquetes. El estilo se toma del caché cuando no hay internet.
export async function estiloConPaquetes(): Promise<maplibregl.StyleSpecification | null> {
  registrarProtocoloPaquetes();
  try {
    const r = await fetch(ESTILO_MAPA_URL);
    if (!r.ok) return null;
    const estilo = await r.json();
    const atribucion = estilo.sources?.openmaptiles?.attribution
      ?? '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
    estilo.sources.openmaptiles = {
      type: 'vector',
      tiles: ['paquete://{z}/{x}/{y}'],
      minzoom: 0,
      maxzoom: 14,
      attribution: atribucion,
    };
    return estilo as maplibregl.StyleSpecification;
  } catch { return null; }
}

// Satélite CON nombres: la imagen de satélite abajo y, encima, solo las etiquetas
// del mapa de calles (calles, colonias, lugares, agua), en blanco con contorno
// oscuro para que se lean sobre la foto. Las etiquetas salen de los mismos
// mosaicos del mapa (paquete instalado, zona descargada o internet), así que
// también funcionan sin internet dentro de lo descargado.
const CAPAS_CON_ETIQUETA = new Set(['transportation_name', 'place', 'water_name', 'poi', 'mountain_peak', 'park', 'aerodrome_label']);

export async function estiloHibrido(maxzoomSat: number): Promise<maplibregl.StyleSpecification | null> {
  registrarProtocoloPaquetes();
  try {
    const r = await fetch(ESTILO_MAPA_URL);
    if (!r.ok) return null;
    const base = await r.json();
    const conPaquetes = leerInstalados().length > 0;
    const vectorial = conPaquetes
      ? { type: 'vector', tiles: ['paquete://{z}/{x}/{y}'], minzoom: 0, maxzoom: 14, attribution: base.sources?.openmaptiles?.attribution ?? '' }
      : base.sources.openmaptiles;
    const etiquetas = (base.layers as Array<Record<string, any>>)
      .filter((l) => l.type === 'symbol' && l.source === 'openmaptiles' && CAPAS_CON_ETIQUETA.has(l['source-layer']) && !/transit|bus/.test(String(l.id)))
      .map((l) => ({
        ...l,
        paint: { ...(l.paint ?? {}), 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.6, 'text-halo-blur': 0.4 },
      }));
    return {
      version: 8,
      glyphs: base.glyphs,
      sprite: base.sprite,
      sources: {
        satelite: {
          type: 'raster',
          tiles: [PLANTILLA_SATELITE],
          tileSize: 256,
          maxzoom: maxzoomSat,
          attribution: TOKEN_MAPBOX ? '© Mapbox © Maxar © OpenStreetMap' : 'Imágenes © Esri, Maxar, Earthstar Geographics',
        },
        openmaptiles: vectorial,
      },
      layers: [{ id: 'satelite-capa', type: 'raster', source: 'satelite' }, ...etiquetas],
    } as unknown as maplibregl.StyleSpecification;
  } catch { return null; }
}
