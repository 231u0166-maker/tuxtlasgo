// ============================================================
// IMÁGENES OPTIMIZADAS — Cloudinary entrega la versión del tamaño justo
// ============================================================
// Las fotos de los prestadores se suben a Cloudinary tal cual salen del
// celular (3–5 MB, ~4000px) y las tarjetas las muestran a ~250px. En una
// PC eso pasa desapercibido, pero en un teléfono cada tarjeta descarga,
// decodifica y guarda en memoria de GPU varios MB — justo mientras se
// arrastra la hoja de Explorar. Medido con fotos reales: una de 3,370 KB
// baja a 71 KB con w_640.
//
// Se inserta una transformación en la URL (f_auto = WebP/AVIF según el
// navegador, q_auto = calidad automática, c_limit = nunca agranda). Solo
// toca URLs de Cloudinary sin transformación previa; las fotos locales
// (/lugares/...) y de otros orígenes se devuelven intactas.
// ============================================================

const PATRON_SIN_TRANSFORMACION = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.*)$/;

// Anchos usados por la UI — el precache offline (App.tsx) guarda
// exactamente estas variantes para que coincidan con lo que se pide.
export const ANCHO_TARJETA = 640;
export const ANCHO_DETALLE = 1000;
export const ANCHO_MINIATURA = 200;

export function optimizarImagen(url: string, ancho: number = ANCHO_TARJETA): string {
  const m = PATRON_SIN_TRANSFORMACION.exec(url);
  if (!m) return url;
  return `${m[1]}f_auto,q_auto,w_${ancho},c_limit/${m[2]}`;
}
