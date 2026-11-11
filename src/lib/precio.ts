// Rango de precios del negocio — UNA sola definición para el registro de
// prestador y para "Precio y contacto" de Mi Perfil (antes cada uno tenía la suya).

export type NivelPrecio = 'limitado' | 'razonable' | 'lujo' | 'muy_lujo';

export const NIVELES_PRECIO: { id: NivelPrecio; simbolo: string; label: string; ejemplo: string; min: number; max: number }[] = [
  { id: 'limitado', simbolo: '$', label: 'Económico', ejemplo: 'Menos de $150', min: 50, max: 150 },
  { id: 'razonable', simbolo: '$$', label: 'Moderado', ejemplo: 'De $150 a $400', min: 150, max: 400 },
  { id: 'lujo', simbolo: '$$$', label: 'Alto', ejemplo: 'De $400 a $900', min: 400, max: 900 },
  { id: 'muy_lujo', simbolo: '$$$$', label: 'Premium', ejemplo: 'Más de $900', min: 900, max: 2000 },
];
export const PRECIO_TOPE = 5000;
export const PRECIO_PASO = 50;

// Tasa de referencia MXN → USD, solo para dar una idea aproximada (NO es en vivo).
export const TASA_USD_REFERENCIA = 17.1;

/** "$$ $150 – $400 MXN (aprox. $9 – $23 USD)", o 'A consultar' si no hay rango válido. */
export function formatearPrecio(nivel: NivelPrecio, min: number, max: number): string {
  if (Number.isNaN(min) || Number.isNaN(max) || min < 0 || max <= 0) return 'A consultar';
  const simbolo = NIVELES_PRECIO.find((n) => n.id === nivel)!.simbolo;
  const usdMin = Math.round(min / TASA_USD_REFERENCIA);
  const usdMax = Math.round(max / TASA_USD_REFERENCIA);
  return `${simbolo} $${min.toLocaleString('es-MX')} – $${max.toLocaleString('es-MX')} MXN (aprox. $${usdMin} – $${usdMax} USD)`;
}

/** Inverso de formatearPrecio; null si el texto no tiene ese formato. */
export function parsearPrecio(texto: string): { nivel: NivelPrecio; min: number; max: number } | null {
  const m = texto.match(/^(\${1,4})\s*\$([\d,]+)\s*[–-]\s*\$([\d,]+)\s*MXN/);
  if (!m) return null;
  const nivel = NIVELES_PRECIO.find((n) => n.simbolo === m[1])?.id;
  if (!nivel) return null;
  return { nivel, min: Number(m[2].replace(/,/g, '')), max: Number(m[3].replace(/,/g, '')) };
}
