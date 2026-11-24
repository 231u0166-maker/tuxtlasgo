// Utilidades comunes de los scripts de paquetes regionales.
import { createServer } from 'vite';
import { open, readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { PMTiles } from 'pmtiles';

export const RAIZ = process.cwd();
export const DIR_PAQUETES = join(RAIZ, 'paquetes');

// Fuente PMTiles que lee un archivo local (Node)
class FuenteArchivo {
  constructor(ruta) { this.ruta = ruta; this.fh = null; }
  getKey() { return this.ruta; }
  async getBytes(offset, length) {
    this.fh ??= await open(this.ruta, 'r');
    const buf = Buffer.alloc(length);
    const { bytesRead } = await this.fh.read(buf, 0, length, offset);
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead) };
  }
  async cerrar() { await this.fh?.close(); }
}

const lngToX = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const latToY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
export function mosaicosDeCaja(caja, z) {
  const out = [];
  for (let x = lngToX(caja[0], z); x <= lngToX(caja[2], z); x++)
    for (let y = latToY(caja[3], z); y <= latToY(caja[1], z); y++) out.push([x, y]);
  return out;
}

// Arma la red de calles y senderos leyendo los mosaicos z14 del paquete
// (el MISMO código que usa el teléfono: src/lib/grafoDesdeMosaicos.ts).
export async function construirGrafoDePmtiles(rutaPmtiles, bbox, registrar = console.log) {
  const servidor = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', plugins: [] });
  const fuente = new FuenteArchivo(rutaPmtiles);
  try {
    const { construirGrafoDeLector } = await servidor.ssrLoadModule('/src/lib/grafoDesdeMosaicos.ts');
    const pm = new PMTiles(fuente);
    const mosaicos = mosaicosDeCaja(bbox, 14);
    registrar(`Leyendo ${mosaicos.length} mosaicos z14 para la red de rutas…`);
    let ultimo = -1;
    return await construirGrafoDeLector(
      async (x, y) => {
        const r = await pm.getZxy(14, x, y);
        return r ? new Uint8Array(r.data) : null;
      },
      mosaicos, 14,
      (f) => { const p = Math.floor(f * 20); if (p !== ultimo) { ultimo = p; registrar(`  red de rutas ${p * 5}%`); } }
    );
  } finally {
    await fuente.cerrar();
    await servidor.close();
  }
}

export async function sha256(ruta) {
  const h = createHash('sha256');
  for await (const trozo of createReadStream(ruta)) h.update(trozo);
  return h.digest('hex');
}

// Agrega/actualiza un paquete en paquetes/paquetes.json (el catálogo que lee la app)
export async function actualizarCatalogo(entrada) {
  const ruta = join(DIR_PAQUETES, 'paquetes.json');
  let lista = [];
  try { lista = JSON.parse(await readFile(ruta, 'utf8')).paquetes ?? []; } catch { /* primera vez */ }
  lista = [...lista.filter((p) => p.id !== entrada.id), entrada].sort((a, b) => a.nombre.localeCompare(b.nombre));
  await mkdir(dirname(ruta), { recursive: true });
  await writeFile(ruta, JSON.stringify({ generado: new Date().toISOString(), paquetes: lista }, null, 2));
  return ruta;
}

export async function tamano(ruta) { return (await stat(ruta)).size; }

// ---------- Índice de búsqueda sin internet ----------
// Lee los mosaicos z14 y junta los NOMBRES con su posición. Formato compacto en columnas:
//   { v:1, tipos:[...], nombres:"a\nb\n…", t:[tipo de cada nombre], la:[lat·1e5], ln:[lng·1e5] }
// Solo se toma lo que cae DENTRO de cada mosaico (los bordes se repiten en el vecino).
const E_MOSAICO = 4096;
const KM_CALLE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service']);
export async function construirIndiceDePmtiles(rutaPmtiles, bbox, registrar = console.log) {
  const { VectorTile } = await import('@mapbox/vector-tile');
  const { default: Pbf } = await import('pbf');
  const fuente = new FuenteArchivo(rutaPmtiles);
  const pm = new PMTiles(fuente);
  const mosaicos = mosaicosDeCaja(bbox, 14);
  registrar(`Leyendo ${mosaicos.length} mosaicos z14 para el índice de búsqueda…`);
  const tipos = [], idTipo = new Map();
  const tipoId = (k) => { let i = idTipo.get(k); if (i === undefined) { i = tipos.length; tipos.push(k); idTipo.set(k, i); } return i; };
  const nombres = [], T = [], LA = [], LN = [];
  const vistos = new Set();
  const agregar = (nombre, tipo, lat, lng, celda) => {
    nombre = nombre.replace(/\s+/g, ' ').trim();
    if (nombre.length < 2) return;
    const clave = `${nombre}|${tipo}|${Math.floor(lat * celda)}|${Math.floor(lng * celda)}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    nombres.push(nombre); T.push(tipoId(tipo)); LA.push(Math.round(lat * 1e5)); LN.push(Math.round(lng * 1e5));
  };
  let hecho = 0, ultimo = -1;
  try {
    for (const [x, y] of mosaicos) {
      const r = await pm.getZxy(14, x, y);
      if (++hecho % 500 === 0) { const p = Math.floor((hecho / mosaicos.length) * 20); if (p !== ultimo) { ultimo = p; registrar(`  índice ${p * 5}%`); } }
      if (!r) continue;
      const vt = new VectorTile(new Pbf(new Uint8Array(r.data)));
      const aLngLat = (px, py) => {
        const n = 2 ** 14;
        const lng = ((x + px / E_MOSAICO) / n) * 360 - 180;
        const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / E_MOSAICO)) / n))) * 180) / Math.PI;
        return [lat, lng];
      };
      const dentro = (px, py) => px >= 0 && px < E_MOSAICO && py >= 0 && py < E_MOSAICO;
      for (const [capa, tipoDe, celda] of [
        ['place', (p) => `lugar:${p.class ?? ''}`, 400],
        ['poi', (p) => `poi:${p.subclass || p.class || ''}`, 4000],
        ['water_name', () => 'agua', 100],
        ['mountain_peak', () => 'cerro', 400],
      ]) {
        const c = vt.layers[capa];
        if (!c) continue;
        for (let i = 0; i < c.length; i++) {
          const f = c.feature(i);
          const nombre = f.properties['name:es'] || f.properties.name;
          if (!nombre || f.type !== 1) continue; // puntos
          const [p] = f.loadGeometry()[0] ?? [];
          if (!p || !dentro(p.x, p.y)) continue;
          const [lat, lng] = aLngLat(p.x, p.y);
          agregar(String(nombre), tipoDe(f.properties), lat, lng, celda);
        }
      }
      // Calles: un punto (la mitad del trazo) por nombre y por cuadrícula de ~2 km
      const calles = vt.layers.transportation_name;
      if (calles) {
        for (let i = 0; i < calles.length; i++) {
          const f = calles.feature(i);
          const nombre = f.properties['name:es'] || f.properties.name;
          if (!nombre || f.type !== 2 || !KM_CALLE.has(f.properties.class)) continue;
          const partes = f.loadGeometry();
          const linea = partes.reduce((a, b) => (b.length > a.length ? b : a), partes[0] ?? []);
          const m = linea[Math.floor(linea.length / 2)];
          if (!m || !dentro(m.x, m.y)) continue;
          const [lat, lng] = aLngLat(m.x, m.y);
          agregar(String(nombre), 'calle', lat, lng, 50);
        }
      }
    }
  } finally { await fuente.cerrar(); }
  return { v: 1, tipos, nombres: nombres.join('\n'), t: T, la: LA, ln: LN };
}
