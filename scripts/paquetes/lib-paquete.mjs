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
