// ============================================================
// NAVEGACIÓN PASO A PASO (sin internet)
// ============================================================
// Todo se calcula en el teléfono a partir de la geometría de la ruta y del
// GPS: no hace falta servidor. Las indicaciones ("gira a la izquierda en
// 40 m") salen de los cambios de dirección de la línea de la ruta.
// No se inventan nombres de calle: el grafo guardado no los lleva.
// ============================================================

import type { Coord } from './routing';

export interface Maniobra {
  // Distancia desde el inicio de la ruta hasta el punto del giro (m)
  distancia: number;
  tipo: 'izquierda' | 'derecha' | 'ligera-izquierda' | 'ligera-derecha' | 'vuelta' | 'llegada';
  coord: Coord;
}

const R = 6371000;
const rad = (g: number) => (g * Math.PI) / 180;

export function distancia(a: Coord, b: Coord): number {
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Rumbo de a hacia b en grados (0 = norte, 90 = este)
export function rumbo(a: Coord, b: Coord): number {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) -
    Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const difAngulo = (a: number, b: number) => {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d; // + = giro a la derecha, − = a la izquierda
};

// Quita puntos consecutivos casi pegados (ruido del trazado)
function sinRuido(ruta: Coord[]): Coord[] {
  const out: Coord[] = [];
  for (const p of ruta) {
    if (!out.length || distancia(out[out.length - 1], p) > 3) out.push(p);
  }
  return out;
}

export interface RutaNavegable {
  puntos: Coord[];
  acumulada: number[]; // metros desde el inicio hasta cada punto
  total: number;
  maniobras: Maniobra[];
}

export function prepararRuta(geometria: Coord[]): RutaNavegable {
  const puntos = sinRuido(geometria);
  const acumulada = [0];
  for (let i = 1; i < puntos.length; i++) acumulada.push(acumulada[i - 1] + distancia(puntos[i - 1], puntos[i]));
  const total = acumulada[acumulada.length - 1] ?? 0;

  const maniobras: Maniobra[] = [];
  // El rumbo se mide con una ventana de ~25 m antes y después de cada punto,
  // para no reaccionar a las curvitas del trazado.
  const ventana = 25;
  const puntoA = (idx: number, dir: -1 | 1): Coord => {
    let j = idx;
    while (j + dir >= 0 && j + dir < puntos.length && Math.abs(acumulada[j] - acumulada[idx]) < ventana) j += dir;
    return puntos[j];
  };
  let ultimo = -Infinity;
  for (let i = 1; i < puntos.length - 1; i++) {
    const antes = puntoA(i, -1);
    const despues = puntoA(i, 1);
    if (antes === puntos[i] || despues === puntos[i]) continue;
    const giro = difAngulo(rumbo(antes, puntos[i]), rumbo(puntos[i], despues));
    const abs = Math.abs(giro);
    if (abs < 30 || acumulada[i] - ultimo < 20) continue;
    // Quedarse con el punto de mayor giro dentro del mismo cruce
    let tipo: Maniobra['tipo'];
    if (abs > 150) tipo = 'vuelta';
    else if (abs >= 60) tipo = giro > 0 ? 'derecha' : 'izquierda';
    else tipo = giro > 0 ? 'ligera-derecha' : 'ligera-izquierda';
    maniobras.push({ distancia: acumulada[i], tipo, coord: puntos[i] });
    ultimo = acumulada[i];
  }
  maniobras.push({ distancia: total, tipo: 'llegada', coord: puntos[puntos.length - 1] });
  return { puntos, acumulada, total, maniobras };
}

export interface PosicionEnRuta {
  recorrido: number; // metros avanzados sobre la ruta
  desvio: number; // metros que está separado de la ruta
}

// Proyecta la posición GPS sobre la ruta (búsqueda cerca del último avance
// para que no "salte" a otro tramo que pasa por el mismo lugar).
export function proyectar(ruta: RutaNavegable, pos: Coord, desdeRecorrido = 0): PosicionEnRuta {
  let mejor = Infinity;
  let rec = 0;
  const cosLat = Math.cos(rad(pos[0]));
  for (let i = 0; i < ruta.puntos.length - 1; i++) {
    if (ruta.acumulada[i + 1] < desdeRecorrido - 80) continue;
    const a = ruta.puntos[i], b = ruta.puntos[i + 1];
    // plano local en metros
    const ax = (a[1] - pos[1]) * cosLat * 111320, ay = (a[0] - pos[0]) * 111320;
    const bx = (b[1] - pos[1]) * cosLat * 111320, by = (b[0] - pos[0]) * 111320;
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < mejor) {
      mejor = d;
      rec = ruta.acumulada[i] + t * (ruta.acumulada[i + 1] - ruta.acumulada[i]);
    }
  }
  return { recorrido: rec, desvio: mejor };
}

export function textoManiobra(tipo: Maniobra['tipo']): string {
  switch (tipo) {
    case 'izquierda': return 'Gira a la izquierda';
    case 'derecha': return 'Gira a la derecha';
    case 'ligera-izquierda': return 'Gira ligeramente a la izquierda';
    case 'ligera-derecha': return 'Gira ligeramente a la derecha';
    case 'vuelta': return 'Da la vuelta';
    case 'llegada': return 'Llegas a tu destino';
  }
}

export function formatoDistanciaCorta(m: number): string {
  if (m < 1000) return `${Math.max(5, Math.round(m / 5) * 5)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// ¿Qué parte de la ruta A va por las MISMAS calles que la ruta B? (0 a 1).
// Un punto de A cuenta como compartido si hay un punto de B a menos de umbralM.
export function fraccionCompartida(a: Coord[], b: Coord[], umbralM = 30): number {
  if (a.length === 0 || b.length === 0) return 0;
  const celda = 0.0004; // ~44 m
  const clave = (lat: number, lng: number) => Math.floor(lat / celda) * 1e6 + Math.floor(lng / celda);
  const rejilla = new Map<number, Coord[]>();
  for (const p of b) {
    const k = clave(p[0], p[1]);
    const c = rejilla.get(k);
    if (c) c.push(p); else rejilla.set(k, [p]);
  }
  let comunes = 0;
  for (const p of a) {
    let cerca = false;
    const ci = Math.floor(p[0] / celda), cj = Math.floor(p[1] / celda);
    for (let di = -1; di <= 1 && !cerca; di++) {
      for (let dj = -1; dj <= 1 && !cerca; dj++) {
        const c = rejilla.get((ci + di) * 1e6 + (cj + dj));
        if (c) for (const q of c) if (distancia(p, q) <= umbralM) { cerca = true; break; }
      }
    }
    if (cerca) comunes++;
  }
  return comunes / a.length;
}
