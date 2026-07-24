// ============================================================
// PALETA DE COLORES POR TRAMO DE RUTA
// ============================================================
// Antes, TODA ruta (sin importar cuántas paradas tuviera) se
// dibujaba en un solo verde — hallazgo real de campo: con 2+
// paradas se volvía difícil distinguir "por dónde me muevo de la
// parada 1 a la 2" de "por dónde me muevo de la 2 a la 3", porque
// visualmente era la misma línea continua de un solo color.
//
// Esta paleta asigna un color distinto a cada TRAMO (el trayecto
// entre una parada y la siguiente) por POSICIÓN en la ruta — tramo
// 1 siempre es verde, tramo 2 siempre es azul, etc. — nunca por el
// nombre o tipo de lugar. Esto es a propósito: como el color se
// calcula solo con el índice del tramo, funciona igual de bien para
// cualquier lugar o prestador nuevo que se registre y aparezca en
// una ruta generada por el chat, sin tener que tocar este archivo
// ni el motor de recomendación.
//
// Si una ruta tiene más tramos que colores en la lista, se rota
// (colorTramo usa módulo) — nunca se rompe ni deja tramos sin color.
export const PALETA_TRAMOS: string[] = [
  '#15803d', // verde (jungle) — tramo 1
  '#2563eb', // azul — tramo 2
  '#d97706', // ámbar — tramo 3
  '#db2777', // rosa — tramo 4
  '#7c3aed', // violeta — tramo 5
  '#0891b2', // cian — tramo 6
];

export function colorTramo(indice: number): string {
  return PALETA_TRAMOS[indice % PALETA_TRAMOS.length];
}
