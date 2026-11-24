// ============================================================
// PAQUETES POR REGIÓN (estilo MAPS.ME)
// ============================================================
// El turista elige "Veracruz" y baja UN archivo con todas las calles,
// edificios y nombres de la región, más la red de calles y senderos ya armada
// para calcular rutas sin internet. Los paquetes los prepara el equipo con
// scripts/paquetes/ y se alojan en un servidor propio (VITE_PAQUETES_URL).
//
// Almacenamiento: el mapa (cientos de MB) va al sistema de archivos privado del
// navegador (OPFS) y se lee por pedazos; la red de rutas va a Cache Storage como
// las zonas. La descarga se reanuda sola desde donde se quedó.
// ============================================================

import {
  CACHE_MAPA, CACHE_GRAFOS, urlGrafoZona, descargarBase, leerZonas, guardarZonas,
  type Caja, type Progreso, type ZonaOffline,
} from './mapaOffline';

// Dirección pública del bucket de R2 (no es secreta: la descarga es pública).
// Si VITE_PAQUETES_URL existe y no está vacía, esa tiene prioridad.
const URL_PAQUETES_DEFECTO = 'https://pub-692c6db091f44bbea826698c33a6544f.r2.dev';
export const URL_PAQUETES = ((import.meta.env.VITE_PAQUETES_URL as string | undefined)?.trim() || URL_PAQUETES_DEFECTO).replace(/\/$/, '');
export const hayServidorDePaquetes = () => URL_PAQUETES.length > 0;

export interface PaqueteCatalogo {
  id: string;
  nombre: string;
  descripcion?: string;
  bbox: Caja;
  version: string; // fecha de los datos de OpenStreetMap, p. ej. "2026-11-15"
  archivoMapa: string; // relativo a URL_PAQUETES
  archivoGrafo: string;
  bytesMapa: number;
  bytesGrafo: number;
}

export interface PaqueteInstalado {
  id: string;
  nombre: string;
  bbox: Caja;
  version: string;
  bytes: number;
  fecha: number;
}

const CLAVE_INSTALADOS = 'paquetes-instalados-v1';
const CLAVE_CATALOGO = 'paquetes-catalogo-v1';
const CLAVE_PENDIENTE_PAQUETE = 'paquete-pendiente-v1';
// Solo estos estados se ofrecen (decisión del equipo: por ahora Puebla, Tabasco y Veracruz).
export const PAQUETES_PERMITIDOS = ['puebla', 'tabasco', 'veracruz'];
const soloPermitidos = (l: PaqueteCatalogo[]) => l.filter((p) => PAQUETES_PERMITIDOS.includes(p.id));

// Paquetes cuya caja contiene la ubicación [lat, lng], del más cercano (por centro) al más lejano.
// Las cajas de Puebla y Veracruz se traslapan, así que puede haber más de uno.
export function paquetesParaUbicacion(coord: [number, number], catalogo: PaqueteCatalogo[]): PaqueteCatalogo[] {
  const [lat, lng] = coord;
  const dentro = soloPermitidos(catalogo).filter((p) => lng >= p.bbox[0] && lng <= p.bbox[2] && lat >= p.bbox[1] && lat <= p.bbox[3]);
  const dist = (p: PaqueteCatalogo) => Math.hypot(lng - (p.bbox[0] + p.bbox[2]) / 2, lat - (p.bbox[1] + p.bbox[3]) / 2);
  return dentro.sort((a, b) => dist(a) - dist(b));
}

// Punto de referencia de Los Tuxtlas (Catemaco) para saber qué paquete cubre la región.
export const PUNTO_TUXTLAS: [number, number] = [18.42, -95.11];

// Qué paquetes bajar para visitar Los Tuxtlas desde donde está el turista:
// su estado + el que cubre Los Tuxtlas (Veracruz). El trazado sin internet entre los dos
// lo resuelve rutasOffline.ts (los une por su zona de traslape).
export function planVisitaTuxtlas(coord: [number, number] | null, catalogo: PaqueteCatalogo[]): PaqueteCatalogo[] {
  const deTuxtlas = paquetesParaUbicacion(PUNTO_TUXTLAS, catalogo)[0];
  if (!deTuxtlas) return [];
  const suyo = coord ? paquetesParaUbicacion(coord, catalogo)[0] : undefined;
  if (!suyo || suyo.id === deTuxtlas.id) return [deTuxtlas];
  return [suyo, deTuxtlas];
}

export const idZonaDePaquete = (id: string) => `pk-${id}`;

// ---------- almacenamiento OPFS ----------
export function opfsDisponible(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory;
}
async function carpetaPaquetes(): Promise<FileSystemDirectoryHandle> {
  const raiz = await navigator.storage.getDirectory();
  return raiz.getDirectoryHandle('paquetes', { create: true });
}
export async function abrirArchivoPaquete(id: string): Promise<File | null> {
  try {
    const dir = await carpetaPaquetes();
    return await (await dir.getFileHandle(`${id}.pmtiles`)).getFile();
  } catch { return null; }
}
async function bytesGuardados(id: string): Promise<number> {
  return (await abrirArchivoPaquete(id))?.size ?? 0;
}

// ---------- estado en localStorage ----------
export function leerInstalados(): PaqueteInstalado[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_INSTALADOS) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function guardarInstalados(v: PaqueteInstalado[]) {
  try { localStorage.setItem(CLAVE_INSTALADOS, JSON.stringify(v)); } catch { /* nada */ }
}
export function leerPaquetePendiente(): string | null {
  try { return localStorage.getItem(CLAVE_PENDIENTE_PAQUETE); } catch { return null; }
}
export function limpiarPaquetePendiente() {
  try { localStorage.removeItem(CLAVE_PENDIENTE_PAQUETE); } catch { /* nada */ }
}

// ---------- catálogo ----------
export function leerCatalogoGuardado(): PaqueteCatalogo[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_CATALOGO) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
// Con internet baja el catálogo vigente; sin internet (o sin servidor) usa el último guardado.
export async function cargarCatalogo(): Promise<PaqueteCatalogo[]> {
  if (!hayServidorDePaquetes()) return [];
  try {
    const r = await fetch(`${URL_PAQUETES}/paquetes.json`, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const lista: PaqueteCatalogo[] = soloPermitidos(Array.isArray(j) ? j : j.paquetes ?? []);
    try { localStorage.setItem(CLAVE_CATALOGO, JSON.stringify(lista)); } catch { /* nada */ }
    return lista;
  } catch {
    return leerCatalogoGuardado();
  }
}

// ---------- instalar ----------
// Descarga reanudable por rangos (Range). Si el servidor no soporta rangos, empieza de cero.
async function descargarArchivo(
  url: string,
  id: string,
  total: number,
  alAvanzar: (bajados: number) => void,
  senal?: AbortSignal
): Promise<void> {
  const dir = await carpetaPaquetes();
  const fh = await dir.getFileHandle(`${id}.pmtiles`, { create: true });
  let tam = (await fh.getFile()).size;
  if (tam > total) tam = 0; // archivo de otra versión: empezar de nuevo
  if (tam === total) { alAvanzar(total); return; }

  for (let intento = 0; ; intento++) {
    if (senal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    // Sin internet: esperar a que vuelva, sin perder lo ya escrito
    if (!navigator.onLine) {
      await new Promise<void>((res, rej) => {
        const ok = () => { limpiar(); res(); };
        const ab = () => { limpiar(); rej(new DOMException('Cancelado', 'AbortError')); };
        const limpiar = () => { window.removeEventListener('online', ok); senal?.removeEventListener('abort', ab); };
        window.addEventListener('online', ok);
        senal?.addEventListener('abort', ab);
      });
    }
    try {
      const r = await fetch(url, { headers: tam > 0 ? { Range: `bytes=${tam}-` } : {}, signal: senal });
      if (r.status === 200 && tam > 0) tam = 0; // el servidor ignoró el rango: reescribir
      if (!r.ok && r.status !== 206) throw new Error(`El servidor respondió ${r.status}`);
      if (!r.body) throw new Error('El navegador no permite descargar por partes.');
      const w = await fh.createWritable({ keepExistingData: tam > 0 });
      await w.seek(tam);
      const lector = r.body.getReader();
      try {
        for (;;) {
          const { done, value } = await lector.read();
          if (done) break;
          await w.write(value as unknown as FileSystemWriteChunkType);
          tam += value.length;
          alAvanzar(Math.min(tam, total));
        }
      } finally {
        await w.close(); // lo escrito hasta aquí queda guardado aunque la descarga se haya cortado
      }
      if (tam >= total) return;
      // terminó antes de tiempo: se reintenta desde donde quedó
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      if (navigator.onLine && intento > 8) throw e;
      await new Promise((res) => setTimeout(res, 1500));
    }
  }
}

export async function instalarPaquete(
  p: PaqueteCatalogo,
  onProgreso: Progreso,
  senal?: AbortSignal
): Promise<void> {
  if (!opfsDisponible()) {
    throw new Error('Este navegador no puede guardar paquetes grandes. Usa Chrome en Android o descarga una zona.');
  }
  try { localStorage.setItem(CLAVE_PENDIENTE_PAQUETE, p.id); } catch { /* nada */ }
  try { await navigator.storage.persist?.(); } catch { /* opcional */ }

  const total = p.bytesMapa;
  onProgreso(1, 'Preparando…');
  const cache = await caches.open(CACHE_MAPA);
  await descargarBase(cache, senal); // estilo, íconos y letras (pocos KB)

  await descargarArchivo(
    `${URL_PAQUETES}/${p.archivoMapa}`,
    p.id,
    total,
    (b) => onProgreso(2 + Math.round((b / total) * 92), 'Descargando el mapa de la región…'),
    senal
  );

  onProgreso(95, 'Guardando la red de rutas…');
  const rg = await fetch(`${URL_PAQUETES}/${p.archivoGrafo}`, { signal: senal });
  if (!rg.ok) throw new Error('No se pudo descargar la red de rutas del paquete.');
  await (await caches.open(CACHE_GRAFOS)).put(
    urlGrafoZona(idZonaDePaquete(p.id)),
    new Response(await rg.text(), { headers: { 'Content-Type': 'application/json' } })
  );

  // El paquete cuenta como zona descargada: así la cobertura y las rutas lo usan igual
  const zona: ZonaOffline = {
    id: idZonaDePaquete(p.id), nombre: p.nombre, caja: p.bbox, fecha: Date.now(),
    snapshot: null, mosaicosCalles: 0, satelite: null, grafo: true, paquete: p.id,
  };
  guardarZonas([...leerZonas().filter((z) => z.id !== zona.id), zona]);
  guardarInstalados([
    ...leerInstalados().filter((i) => i.id !== p.id),
    { id: p.id, nombre: p.nombre, bbox: p.bbox, version: p.version, bytes: p.bytesMapa + p.bytesGrafo, fecha: Date.now() },
  ]);
  limpiarPaquetePendiente();
  onProgreso(100, 'Listo');
}

export async function borrarPaquete(id: string): Promise<void> {
  try { await (await carpetaPaquetes()).removeEntry(`${id}.pmtiles`); } catch { /* ya no estaba */ }
  try { await (await caches.open(CACHE_GRAFOS)).delete(urlGrafoZona(idZonaDePaquete(id))); } catch { /* nada */ }
  guardarZonas(leerZonas().filter((z) => z.id !== idZonaDePaquete(id)));
  guardarInstalados(leerInstalados().filter((i) => i.id !== id));
  if (leerPaquetePendiente() === id) limpiarPaquetePendiente();
}

// ¿Hay una versión más nueva de lo instalado? (para sugerir actualizar)
export function hayActualizacion(inst: PaqueteInstalado, catalogo: PaqueteCatalogo[]): PaqueteCatalogo | null {
  const c = catalogo.find((x) => x.id === inst.id);
  return c && c.version > inst.version ? c : null;
}

export { bytesGuardados };
