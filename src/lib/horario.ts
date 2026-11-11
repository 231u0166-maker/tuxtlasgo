// ============================================================
// HORARIO SEMANAL — cada día con sus propios horarios
// ============================================================
// Formato interno: `Semana` = 7 días (0 = lunes … 6 = domingo), cada día es una
// lista de tramos [inicio, fin] en minutos desde la medianoche (fin hasta 1440).
// Un día sin tramos está cerrado.
//
// Para que las fichas, el asistente y todo lo que ya leía `horario` y `dias_abierto`
// como TEXTO siga funcionando, al guardar también se arman esos dos textos
// (ver `textosDeSemana`).
// ============================================================

export type Tramo = [number, number];
export type Semana = Tramo[][]; // 7 días

export const DIAS_NOMBRE = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DIAS_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const semanaVacia = (): Semana => [[], [], [], [], [], [], []];

/** Une tramos que se tocan o se encimen, ordenados, dentro de 0–1440. */
export function unirTramos(tramos: Tramo[]): Tramo[] {
  const ordenados = tramos
    .map(([a, b]) => [Math.max(0, a), Math.min(1440, b)] as Tramo)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const salida: Tramo[] = [];
  for (const t of ordenados) {
    const ult = salida[salida.length - 1];
    if (ult && t[0] <= ult[1]) ult[1] = Math.max(ult[1], t[1]);
    else salida.push([t[0], t[1]]);
  }
  return salida;
}

/** "9:00 a. m." para mostrar en pantalla. */
export function horaUI(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** "9:00 am" para el texto que se guarda (mismo formato que ya usaba el sistema). */
export function hora12(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

const firma = (t: Tramo[]) => t.map((x) => x.join('-')).join('|');

/** Días consecutivos con exactamente los mismos horarios. */
export function gruposDeSemana(semana: Semana): { ini: number; fin: number; tramos: Tramo[] }[] {
  const grupos: { ini: number; fin: number; tramos: Tramo[]; f: string }[] = [];
  semana.forEach((tramos, i) => {
    const f = firma(tramos);
    const ult = grupos[grupos.length - 1];
    if (ult && ult.f === f) ult.fin = i;
    else grupos.push({ ini: i, fin: i, tramos, f });
  });
  return grupos;
}

export const etiquetaDias = (ini: number, fin: number) => (ini === fin ? DIAS_CORTO[ini] : `${DIAS_CORTO[ini]}–${DIAS_CORTO[fin]}`);
const textoTramos = (t: Tramo[], f: (m: number) => string, sep: string) => t.map(([a, b]) => `${f(a)}${sep}${f(b)}`).join(' y ');

/**
 * Los dos textos de siempre a partir de la semana.
 * - Si todos los días abiertos tienen el mismo horario: "Lunes, Martes…" / "9:00 am - 6:00 pm".
 * - Si no: dias = "Horario por día", horario = "Lun–Mar 9:00 am - 10:00 pm; Mié 7:00 am - 8:00 pm; Jue–Dom cerrado".
 */
export function textosDeSemana(semana: Semana): { dias_abierto: string; horario: string } {
  const abiertos = semana.map((t, i) => (t.length ? i : -1)).filter((i) => i >= 0);
  if (abiertos.length === 0) return { dias_abierto: '', horario: '' };

  const distintos = new Set(abiertos.map((i) => firma(semana[i])));
  if (distintos.size === 1) {
    const dias = abiertos.length === 7 ? 'Todos los días' : abiertos.map((i) => DIAS_NOMBRE[i]).join(', ');
    return { dias_abierto: dias, horario: textoTramos(semana[abiertos[0]], hora12, ' - ') };
  }

  const partes = gruposDeSemana(semana).map((g) =>
    g.tramos.length ? `${etiquetaDias(g.ini, g.fin)} ${textoTramos(g.tramos, hora12, ' - ')}` : `${etiquetaDias(g.ini, g.fin)} cerrado`
  );
  return { dias_abierto: 'Horario por día', horario: partes.join('; ') };
}

function aMinutos(txt: string): number | null {
  const m = txt.match(/(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (m[3].toLowerCase() === 'p') h += 12;
  return h * 60 + parseInt(m[2], 10);
}

/** Lee los textos viejos ("9:00 am - 6:00 pm" + "Lunes, Martes…") para precargar el calendario. */
export function semanaDesdeTextos(horario?: string | null, dias?: string | null): Semana {
  const semana = semanaVacia();
  if (!horario) return semana;
  const partes = horario.split(/\s[-–]\s/);
  if (partes.length < 2) return semana;
  const a = aMinutos(partes[0]);
  let b = aMinutos(partes[1]);
  if (a === null || b === null) return semana;
  if (b <= a) b = 1440;
  const texto = dias ?? '';
  const abiertos = /todos/i.test(texto)
    ? [0, 1, 2, 3, 4, 5, 6]
    : DIAS_NOMBRE.map((n, i) => (new RegExp(n, 'i').test(texto) ? i : -1)).filter((i) => i >= 0);
  abiertos.forEach((i) => { semana[i] = [[a, b]]; });
  return semana;
}

/** Valida lo que llega del servidor/JSON: devuelve una semana limpia o null. */
export function semanaValida(raw: unknown): Semana | null {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  if (!Array.isArray(v) || v.length !== 7) return null;
  const salida: Semana = [];
  for (const dia of v) {
    if (!Array.isArray(dia) || dia.length > 4) return null;
    const tramos: Tramo[] = [];
    for (const t of dia) {
      if (!Array.isArray(t) || t.length !== 2) return null;
      const [a, b] = t.map(Number);
      if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b > 1440 || b <= a) return null;
      tramos.push([a, b]);
    }
    salida.push(unirTramos(tramos));
  }
  return salida;
}
