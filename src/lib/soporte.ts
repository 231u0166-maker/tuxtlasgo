// Contacto de soporte de TuxtlasGO — a dónde escribe un prestador cuando su
// solicitud fue rechazada o tiene dudas.
//
// PON AQUÍ EL NÚMERO REAL (solo dígitos, con lada de país: 52 + 10 dígitos),
// por ejemplo '5219211234567'. Mientras esté vacío, el botón de contacto cae
// al mensaje directo de Instagram de TuxtlasGO, que sí existe.
export const WHATSAPP_SOPORTE = '';

const INSTAGRAM_MENSAJE = 'https://ig.me/m/tuxtlas_go';

/** Número en formato legible ("+52 921 123 4567") o null si no hay uno configurado. */
export function numeroSoporteLegible(): string | null {
  const d = WHATSAPP_SOPORTE.replace(/\D/g, '');
  if (d.length < 10) return null;
  const local = d.slice(-10);
  const lada = d.length > 10 ? `+${d.slice(0, d.length - 10)} ` : '';
  return `${lada}${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** Enlace para escribirle a soporte con un mensaje ya redactado. */
export function enlaceSoporte(mensaje: string): { href: string; etiqueta: string } {
  const d = WHATSAPP_SOPORTE.replace(/\D/g, '');
  if (d.length >= 10) {
    return { href: `https://wa.me/${d}?text=${encodeURIComponent(mensaje)}`, etiqueta: 'Escríbenos por WhatsApp' };
  }
  return { href: INSTAGRAM_MENSAJE, etiqueta: 'Escríbenos por Instagram' };
}
