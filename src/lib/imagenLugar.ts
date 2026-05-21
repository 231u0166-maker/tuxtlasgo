// ============================================================
// PLACEHOLDER DE IMÁGENES — generador 100% offline
// ============================================================
// Cuando una imagen externa falla (por 404, por falta de internet
// en la primera carga, o porque el proveedor la tumbó), esta
// función genera al vuelo un placeholder SVG bonito basado en la
// categoría y el nombre del lugar.
//
// Es un data URI: la imagen vive dentro de la propia URL, no
// requiere ninguna petición de red. Por eso funciona en modo
// avión desde el primer momento.
//
// Cuando el equipo de TuxtlasGO consiga las fotos reales de los
// lugares, basta con actualizar el campo `imagen` en lugares.ts:
// si la URL real carga, se ve la foto; si falla, este placeholder
// la sustituye automáticamente. Nada se rompe en ningún caso.
// ============================================================

import type { Categoria } from '../data/lugares';

interface EstiloCategoria {
  colorInicio: string;
  colorFin: string;
  icono: string;
}

// Paleta visual por categoría (alineada con el tema "jungle/sun"
// que ya usa la app). Cada categoría tiene su personalidad.
const ESTILOS: Record<Categoria, EstiloCategoria> = {
  Naturaleza:  { colorInicio: '#047857', colorFin: '#064e3b', icono: '🌿' },
  Aventura:    { colorInicio: '#d97706', colorFin: '#92400e', icono: '⛰️' },
  Gastronomia: { colorInicio: '#dc2626', colorFin: '#991b1b', icono: '🍽️' },
  Hospedaje:   { colorInicio: '#475569', colorFin: '#1e293b', icono: '🛏️' },
  Comercio:    { colorInicio: '#ea580c', colorFin: '#9a3412', icono: '🛍️' },
  Cooperativa: { colorInicio: '#0d9488', colorFin: '#134e4a', icono: '🤝' },
  Otro:        { colorInicio: '#6b7280', colorFin: '#1f2937', icono: '⭐' },
};

// Acorta nombres largos para que quepan en el placeholder.
function ajustarNombre(nombre: string, maxCaracteres = 28): string {
  if (nombre.length <= maxCaracteres) return nombre;
  return nombre.slice(0, maxCaracteres - 1).trim() + '…';
}

// Escapa caracteres especiales de XML en el nombre del lugar
// (por si llega a tener '&' o '<', muy poco común pero defensivo).
function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Genera el data URI SVG. Se llama solo cuando una imagen falla,
// así que el costo es despreciable.
export function placeholderLugar(
  categoria: Categoria,
  nombre: string
): string {
  const estilo = ESTILOS[categoria] ?? ESTILOS.Naturaleza;
  const nombreSeguro = escaparXml(ajustarNombre(nombre));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${estilo.colorInicio}"/>
      <stop offset="100%" stop-color="${estilo.colorFin}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <circle cx="650" cy="120" r="80" fill="rgba(255,255,255,0.08)"/>
  <circle cx="120" cy="500" r="120" fill="rgba(255,255,255,0.06)"/>
  <text x="400" y="290" font-size="180" text-anchor="middle" dominant-baseline="central">${estilo.icono}</text>
  <text x="400" y="420" font-size="34" font-weight="700" fill="white" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">${nombreSeguro}</text>
  <text x="400" y="465" font-size="22" fill="rgba(255,255,255,0.75)" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">${categoria}</text>
</svg>`;

  // data URI con SVG codificado. Más compacto que base64 para SVG.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Handler listo para usar en <img onError={...}>. Reemplaza la
// fuente de la imagen con el placeholder generado, una sola vez
// (para evitar bucles si el placeholder mismo fallara, que no debe).
export function manejarErrorImagen(
  categoria: Categoria,
  nombre: string
): (e: React.SyntheticEvent<HTMLImageElement>) => void {
  return (e) => {
    const img = e.currentTarget;
    if (img.dataset.placeholderAplicado === '1') return;
    img.dataset.placeholderAplicado = '1';
    img.src = placeholderLugar(categoria, nombre);
  };
}