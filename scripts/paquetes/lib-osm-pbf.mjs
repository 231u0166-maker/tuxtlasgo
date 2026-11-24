// Lector mínimo de archivos OpenStreetMap .osm.pbf + constructor del índice de búsqueda COMPLETO.
//
// Por qué: los mosaicos del mapa (mapa.pmtiles) solo traen una parte de lo que tiene nombre en OpenStreetMap
// (p. ej. NO traen el Zócalo ni la Catedral de Puebla). El extracto .osm.pbf original sí trae todo:
// plazas, iglesias, edificios, parques, ríos, tiendas, escuelas… Aquí se lee ese archivo (3 pasadas) y se arma
// el mismo formato de índice que usa la app (src/lib/busquedaOffline.ts).
//
// Formato PBF (https://wiki.openstreetmap.org/wiki/PBF_Format): [4 bytes largo][BlobHeader][Blob zlib] repetido;
// cada bloque trae una tabla de textos y grupos de nodos (densos), caminos y relaciones.
import { open } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import Pbf from 'pbf';

// ---------- Lector PBF ----------
function leerEncabezado(buf) {
  return new Pbf(buf).readFields((tag, r, p) => {
    if (tag === 1) r.tipo = p.readString();
    else if (tag === 3) r.tam = p.readVarint();
  }, { tipo: '', tam: 0 });
}
function leerBlob(buf) {
  const b = new Pbf(buf).readFields((tag, r, p) => {
    if (tag === 1) r.crudo = p.readBytes();
    else if (tag === 3) r.zlib = p.readBytes();
  }, {});
  return b.zlib ? inflateSync(Buffer.from(b.zlib.buffer, b.zlib.byteOffset, b.zlib.byteLength)) : Buffer.from(b.crudo);
}
const etiquetas = (st, keys, vals) => {
  if (!keys || keys.length === 0) return null;
  const t = {};
  for (let i = 0; i < keys.length; i++) t[st[keys[i]]] = st[vals[i]];
  return t;
};
const deltas = (arr) => { let a = 0; return arr.map((d) => (a += d)); };

// Devuelve { nodos:[{id,lat,lon,tags}], caminos:[{id,tags,refs}], relaciones:[{id,tags,miembros:[{id,tipo,rol}]}] }
function leerBloque(buf) {
  const st = [];
  const grupos = [];
  let gran = 100, latOff = 0, lonOff = 0;
  new Pbf(buf).readFields((tag, _, p) => {
    if (tag === 1) p.readMessage((t, s, pp) => { if (t === 1) st.push(pp.readString()); }, st);
    else if (tag === 2) grupos.push(p.readMessage(leerGrupo, { nodos: [], denso: null, caminos: [], rels: [] }));
    else if (tag === 17) gran = p.readVarint();
    else if (tag === 19) latOff = p.readVarint();
    else if (tag === 20) lonOff = p.readVarint();
  }, null);
  const out = { nodos: [], caminos: [], relaciones: [] };
  const aGrados = (v, off) => 1e-9 * (off + gran * v);
  for (const g of grupos) {
    for (const n of g.nodos) out.nodos.push({ id: n.id, lat: aGrados(n.lat, latOff), lon: aGrados(n.lon, lonOff), tags: etiquetas(st, n.keys, n.vals) });
    if (g.denso) {
      const ids = deltas(g.denso.id), lats = deltas(g.denso.lat), lons = deltas(g.denso.lon), kv = g.denso.kv;
      let k = 0;
      for (let i = 0; i < ids.length; i++) {
        let tags = null;
        if (kv.length) {
          while (kv[k] !== 0 && k < kv.length) { (tags ??= {})[st[kv[k]]] = st[kv[k + 1]]; k += 2; }
          k++; // el 0 que separa a este nodo del siguiente
        }
        out.nodos.push({ id: ids[i], lat: aGrados(lats[i], latOff), lon: aGrados(lons[i], lonOff), tags });
      }
    }
    for (const w of g.caminos) out.caminos.push({ id: w.id, tags: etiquetas(st, w.keys, w.vals), refs: deltas(w.refs) });
    for (const r of g.rels) {
      const ids = deltas(r.memids);
      out.relaciones.push({
        id: r.id, tags: etiquetas(st, r.keys, r.vals),
        miembros: ids.map((id, i) => ({ id, tipo: r.types[i], rol: st[r.roles[i]] })), // tipo: 0 nodo, 1 camino, 2 relación
      });
    }
  }
  return out;
}
function leerGrupo(tag, g, p) {
  if (tag === 1) g.nodos.push(p.readMessage((t, n, pp) => {
    if (t === 1) n.id = pp.readSVarint(); else if (t === 2) n.keys = pp.readPackedVarint(); else if (t === 3) n.vals = pp.readPackedVarint();
    else if (t === 8) n.lat = pp.readSVarint(); else if (t === 9) n.lon = pp.readSVarint();
  }, { id: 0, keys: [], vals: [], lat: 0, lon: 0 }));
  else if (tag === 2) g.denso = p.readMessage((t, d, pp) => {
    if (t === 1) d.id = pp.readPackedSVarint(); else if (t === 8) d.lat = pp.readPackedSVarint();
    else if (t === 9) d.lon = pp.readPackedSVarint(); else if (t === 10) d.kv = pp.readPackedVarint();
  }, { id: [], lat: [], lon: [], kv: [] });
  else if (tag === 3) g.caminos.push(p.readMessage((t, w, pp) => {
    if (t === 1) w.id = pp.readVarint(); else if (t === 2) w.keys = pp.readPackedVarint(); else if (t === 3) w.vals = pp.readPackedVarint();
    else if (t === 8) w.refs = pp.readPackedSVarint();
  }, { id: 0, keys: [], vals: [], refs: [] }));
  else if (tag === 4) g.rels.push(p.readMessage((t, r, pp) => {
    if (t === 1) r.id = pp.readVarint(); else if (t === 2) r.keys = pp.readPackedVarint(); else if (t === 3) r.vals = pp.readPackedVarint();
    else if (t === 8) r.roles = pp.readPackedVarint(); else if (t === 9) r.memids = pp.readPackedSVarint(); else if (t === 10) r.types = pp.readPackedVarint();
  }, { id: 0, keys: [], vals: [], roles: [], memids: [], types: [] }));
}

/** Recorre el archivo y llama a `alBloque(bloque)` por cada bloque de datos. */
export async function recorrerPbf(ruta, alBloque) {
  const fh = await open(ruta, 'r');
  try {
    const total = (await fh.stat()).size;
    let pos = 0;
    const leer = async (n) => {
      const b = Buffer.allocUnsafe(n);
      const { bytesRead } = await fh.read(b, 0, n, pos);
      pos += bytesRead;
      return b.subarray(0, bytesRead);
    };
    while (pos < total) {
      const largo = (await leer(4)).readUInt32BE(0);
      const enc = leerEncabezado(await leer(largo));
      const blob = await leer(enc.tam);
      if (enc.tipo === 'OSMData') await alBloque(leerBloque(leerBlob(blob)));
    }
  } finally { await fh.close(); }
}

// ---------- Qué se indexa y cómo se clasifica ----------
const LUGARES = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'quarter', 'island', 'islet', 'locality', 'isolated_dwelling']);
const CALLES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'pedestrian', 'road', 'footway', 'path', 'cycleway']);
const AMENIDAD_OMITIDA = new Set(['parking', 'parking_space', 'parking_entrance', 'bench', 'waste_basket', 'shelter', 'toilets', 'recycling', 'drinking_water',
  'bicycle_parking', 'post_box', 'vending_machine', 'telephone', 'waste_disposal', 'clock', 'lounger', 'give_box', 'loading_dock', 'grave_yard']);
const TURISMO_OMITIDO = new Set(['information', 'picnic_site', 'yes']);
const OCIO_OMITIDO = new Set(['pitch', 'swimming_pool', 'picnic_table', 'fitness_station', 'slipway', 'track', 'bleachers']);
const TEMPLOS = new Set(['cathedral', 'church', 'chapel', 'mosque', 'temple', 'synagogue', 'monastery', 'shrine']);

function nombresDe(t) {
  const nm = t.name || t['name:es'];
  if (!nm) return null;
  const extra = ['alt_name', 'short_name', 'old_name', 'official_name', 'name:es']
    .flatMap((k) => (t[k] ? String(t[k]).split(';') : [])).map((s) => s.trim()).filter((s) => s.length >= 3 && s !== nm);
  return [String(nm), ...new Set(extra)];
}

/** Devuelve el tipo de lugar (el mismo vocabulario que usa la app) o null si no vale la pena indexarlo. */
export function clasificar(t, esNodo) {
  if (t.place) {
    if (t.place === 'square') return 'poi:square';
    return LUGARES.has(t.place) ? `lugar:${t.place}` : null;
  }
  if (t.highway) {
    if (esNodo) return null;
    if (t.highway === 'pedestrian' && t.area === 'yes') return 'poi:square';
    return CALLES.has(t.highway) ? 'calle' : null;
  }
  if (t.waterway) return ['river', 'stream', 'canal'].includes(t.waterway) ? 'agua' : null;
  if (t.natural) {
    if (['peak', 'volcano', 'hill', 'ridge'].includes(t.natural)) return 'cerro';
    if (['water', 'bay', 'wetland', 'spring', 'hot_spring', 'strait'].includes(t.natural)) return 'agua';
    if (['beach', 'waterfall', 'cave_entrance', 'cliff', 'valley'].includes(t.natural)) return `poi:${t.natural}`;
    return null;
  }
  if (t.amenity) {
    if (AMENIDAD_OMITIDA.has(t.amenity)) return null;
    return `poi:${t.amenity}`;
  }
  if (t.tourism) return TURISMO_OMITIDO.has(t.tourism) ? null : `poi:${t.tourism}`;
  if (t.historic) return t.historic === 'yes' ? 'poi:monument' : `poi:${t.historic}`;
  if (t.leisure) return OCIO_OMITIDO.has(t.leisure) ? null : `poi:${t.leisure}`;
  if (t.shop) return `poi:${t.shop === 'yes' ? 'shop' : t.shop}`;
  if (t.building) {
    if (TEMPLOS.has(t.building)) return 'poi:place_of_worship';
    if (['hospital', 'school', 'university', 'college', 'kindergarten', 'civic', 'government', 'stadium', 'train_station', 'hotel', 'museum'].includes(t.building)) return `poi:${t.building === 'civic' || t.building === 'government' ? 'townhall' : t.building}`;
    return 'poi:building';
  }
  if (t.office === 'government') return 'poi:townhall';
  if (t.man_made && ['tower', 'lighthouse', 'windmill', 'pier'].includes(t.man_made)) return `poi:${t.man_made}`;
  if (t.landuse === 'cemetery') return 'poi:cemetery';
  if (t.aeroway && ['aerodrome', 'terminal'].includes(t.aeroway)) return 'poi:aerodrome';
  if (t.railway && ['station', 'halt'].includes(t.railway)) return 'poi:railway_station';
  return null;
}

// ---------- Índice desde el .osm.pbf (3 pasadas) ----------
export async function construirIndiceDePbf(rutaPbf, bbox, registrar = console.log) {
  const dentroCaja = (lat, lon) => lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];

  // Pasada 1: relaciones (multipolígonos con nombre: plazas, parques, campus…) → qué caminos son sus miembros
  registrar('1/3 relaciones…');
  const relaciones = []; // { nombres, tipo, caminos:[ids outer] }
  const miembros = new Set();
  await recorrerPbf(rutaPbf, (b) => {
    for (const r of b.relaciones) {
      if (!r.tags || (r.tags.type !== 'multipolygon' && r.tags.type !== 'site')) continue;
      const nombres = nombresDe(r.tags), tipo = nombres && clasificar(r.tags, false);
      if (!nombres || !tipo || tipo === 'calle') continue;
      const ids = r.miembros.filter((m) => m.tipo === 1 && (m.rol === 'outer' || m.rol === '' || m.rol === 'perimeter')).map((m) => m.id);
      if (!ids.length) continue;
      relaciones.push({ nombres, tipo, caminos: ids });
      ids.forEach((i) => miembros.add(i));
    }
  });

  // Pasada 2: caminos con nombre (calles, edificios, plazas, parques, ríos…) y los miembros de las relaciones
  registrar(`2/3 caminos… (${relaciones.length} relaciones con nombre)`);
  const entidades = []; // { nombres, tipo, refs:[ids de nodo] | null, lat, lon }
  const refsDeCamino = new Map(); // id -> refs muestreadas (solo miembros de relaciones)
  const muestreo = (refs, max) => {
    if (refs.length <= max) return refs;
    const paso = refs.length / max;
    return Array.from({ length: max }, (_, i) => refs[Math.floor(i * paso)]);
  };
  await recorrerPbf(rutaPbf, (b) => {
    for (const w of b.caminos) {
      if (miembros.has(w.id)) refsDeCamino.set(w.id, muestreo(w.refs, 60));
      if (!w.tags) continue;
      const nombres = nombresDe(w.tags), tipo = nombres && clasificar(w.tags, false);
      if (!nombres || !tipo || w.refs.length === 0) continue;
      // Calles y ríos: un punto (el de en medio); lo demás: el centro de todos sus puntos
      const refs = tipo === 'calle' || tipo === 'agua' ? [w.refs[Math.floor(w.refs.length / 2)]] : muestreo(w.refs, 60);
      entidades.push({ nombres: tipo === 'calle' ? [nombres[0]] : nombres, tipo, refs });
    }
  });

  // Pasada 3: nodos — coordenadas de lo que se necesita + lugares/negocios que son un punto
  registrar('3/3 nodos…');
  const necesarios = new Map();
  for (const e of entidades) for (const id of e.refs) if (!necesarios.has(id)) necesarios.set(id, necesarios.size);
  for (const refs of refsDeCamino.values()) for (const id of refs) if (!necesarios.has(id)) necesarios.set(id, necesarios.size);
  const LA = new Float64Array(necesarios.size), LN = new Float64Array(necesarios.size);
  const tengo = new Uint8Array(necesarios.size);
  await recorrerPbf(rutaPbf, (b) => {
    for (const n of b.nodos) {
      const i = necesarios.get(n.id);
      if (i !== undefined) { LA[i] = n.lat; LN[i] = n.lon; tengo[i] = 1; }
      if (n.tags) {
        const nombres = nombresDe(n.tags), tipo = nombres && clasificar(n.tags, true);
        if (nombres && tipo) entidades.push({ nombres, tipo, refs: null, lat: n.lat, lon: n.lon });
      }
    }
  });

  // Centro de una lista de nodos
  const centro = (refs) => {
    let sa = 0, so = 0, k = 0;
    for (const id of refs) { const i = necesarios.get(id); if (i !== undefined && tengo[i]) { sa += LA[i]; so += LN[i]; k++; } }
    return k ? [sa / k, so / k] : null;
  };
  for (const e of entidades) if (e.refs) { const c = centro(e.refs); if (c) { e.lat = c[0]; e.lon = c[1]; } }
  for (const r of relaciones) {
    const todos = r.caminos.flatMap((id) => refsDeCamino.get(id) ?? []);
    const c = todos.length ? centro(todos) : null;
    if (c) entidades.push({ nombres: r.nombres, tipo: r.tipo, refs: null, lat: c[0], lon: c[1] });
  }

  // Armado en columnas, sin repetidos
  const tipos = [], idTipo = new Map();
  const tipoId = (k) => { let i = idTipo.get(k); if (i === undefined) { i = tipos.length; tipos.push(k); idTipo.set(k, i); } return i; };
  const celdaDe = (tipo) => (tipo === 'calle' ? 50 : tipo === 'agua' || tipo === 'cerro' ? 100 : tipo.startsWith('lugar:') ? 400 : 2000);
  const nombresOut = [], T = [], LAo = [], LNo = [];
  const vistos = new Set();
  for (const e of entidades) {
    if (e.lat === undefined || !dentroCaja(e.lat, e.lon)) continue;
    const celda = celdaDe(e.tipo);
    for (const nm of e.nombres) {
      const nombre = nm.replace(/\s+/g, ' ').trim();
      if (nombre.length < 2) continue;
      const clave = `${nombre}|${e.tipo}|${Math.floor(e.lat * celda)}|${Math.floor(e.lon * celda)}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      nombresOut.push(nombre); T.push(tipoId(e.tipo)); LAo.push(Math.round(e.lat * 1e5)); LNo.push(Math.round(e.lon * 1e5));
    }
  }
  return { v: 1, tipos, nombres: nombresOut.join('\n'), t: T, la: LAo, ln: LNo };
}
