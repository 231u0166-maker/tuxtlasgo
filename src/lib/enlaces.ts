// ============================================================
// ENLACES DEL PRESTADOR — Centro de Prestador (shell, Módulo 2)
// ============================================================
// Redes sociales / sitio del prestador. Sin lógica de pagos —
// solo enlaces que el turista puede abrir desde su ficha.
// ============================================================

export type TipoEnlace = 'instagram' | 'facebook' | 'whatsapp' | 'tiktok' | 'sitio' | 'otro';

export interface EnlaceServicio {
  id: string;
  tipo: TipoEnlace;
  url: string;
}

export const TIPOS_ENLACE: { tipo: TipoEnlace; etiqueta: string; placeholder: string }[] = [
  { tipo: 'instagram', etiqueta: 'Instagram',        placeholder: 'https://instagram.com/tu_negocio' },
  { tipo: 'facebook',  etiqueta: 'Facebook',          placeholder: 'https://facebook.com/tu_negocio' },
  { tipo: 'whatsapp',  etiqueta: 'WhatsApp Business', placeholder: 'https://wa.me/529211234567' },
  { tipo: 'tiktok',    etiqueta: 'TikTok',            placeholder: 'https://tiktok.com/@tu_negocio' },
  { tipo: 'sitio',     etiqueta: 'Sitio web',         placeholder: 'https://tunegocio.com' },
  { tipo: 'otro',      etiqueta: 'Otro enlace',       placeholder: 'https://…' },
];

export function nuevoEnlaceId(): string {
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function parseEnlaces(raw: unknown): EnlaceServicio[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as EnlaceServicio[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
