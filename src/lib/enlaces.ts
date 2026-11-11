// ============================================================
// ENLACES DEL PRESTADOR — Centro de Prestador (shell, Módulo 2)
// ============================================================
// Redes sociales / sitio / contacto del prestador. Sin lógica de pagos —
// solo enlaces que el turista puede abrir desde su ficha.
// ============================================================

export type TipoEnlace = 'instagram' | 'facebook' | 'whatsapp' | 'tiktok' | 'youtube' | 'sitio' | 'correo' | 'otro';

export interface EnlaceServicio {
  id: string;
  tipo: TipoEnlace;
  url: string;
}

// "entrada" = lo que se le pide a la persona (no hace falta que pegue la URL completa).
export const TIPOS_ENLACE: { tipo: TipoEnlace; etiqueta: string; entrada: string; teclado?: 'tel' | 'email' | 'url' }[] = [
  { tipo: 'instagram', etiqueta: 'Instagram', entrada: '@tu_negocio' },
  { tipo: 'facebook',  etiqueta: 'Facebook',  entrada: 'facebook.com/tu_negocio', teclado: 'url' },
  { tipo: 'tiktok',    etiqueta: 'TikTok',    entrada: '@tu_negocio' },
  { tipo: 'whatsapp',  etiqueta: 'WhatsApp',  entrada: '294 125 0703', teclado: 'tel' },
  { tipo: 'youtube',   etiqueta: 'YouTube',   entrada: '@tu_canal' },
  { tipo: 'sitio',     etiqueta: 'Sitio web', entrada: 'tunegocio.com', teclado: 'url' },
  { tipo: 'correo',    etiqueta: 'Correo',    entrada: 'contacto@tunegocio.com', teclado: 'email' },
  { tipo: 'otro',      etiqueta: 'Otro enlace', entrada: 'https://…', teclado: 'url' },
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

const esUrl = (t: string) => /^https?:\/\//i.test(t);
const sinArroba = (t: string) => t.trim().replace(/^@/, '');

/** Convierte lo que escribió la persona ("@tuxtlas_go", "294 125 0703"…) en el enlace real. */
export function normalizarEnlace(tipo: TipoEnlace, texto: string): string {
  const t = texto.trim();
  if (!t) return '';
  if (tipo === 'correo') return /^mailto:/i.test(t) ? t : `mailto:${t}`;
  if (tipo === 'whatsapp') {
    if (esUrl(t)) return t;
    const d = t.replace(/\D/g, '');
    return d ? `https://wa.me/${d.length === 10 ? '52' + d : d}` : '';
  }
  if (esUrl(t)) return t;
  const quitar = (re: RegExp) => t.replace(re, '').replace(/^\/+|\/+$/g, '');
  if (tipo === 'instagram') return `https://instagram.com/${sinArroba(quitar(/^(www\.)?instagram\.com\//i))}`;
  if (tipo === 'tiktok') return `https://tiktok.com/@${sinArroba(quitar(/^(www\.)?tiktok\.com\/(@)?/i))}`;
  if (tipo === 'youtube') {
    const r = quitar(/^(www\.)?youtube\.com\//i);
    return `https://youtube.com/${r.startsWith('@') || r.includes('/') ? r : '@' + r}`;
  }
  if (tipo === 'facebook') return `https://facebook.com/${quitar(/^(www\.)?facebook\.com\//i)}`;
  return `https://${t.replace(/^\/+/, '')}`; // sitio / otro
}

/** Texto corto para mostrar en la lista ("@tuxtlas_go", "+52 294 125 0703", "tunegocio.com"). */
export function textoCortoEnlace(tipo: TipoEnlace, url: string): string {
  if (tipo === 'correo') return url.replace(/^mailto:/i, '');
  if (tipo === 'whatsapp') {
    const d = (url.match(/wa\.me\/(\d+)/)?.[1] ?? '').trim();
    if (d.length >= 10) {
      const local = d.slice(-10);
      const lada = d.length > 10 ? `+${d.slice(0, d.length - 10)} ` : '';
      return `${lada}${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
    }
  }
  const limpio = url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '');
  if (tipo === 'instagram' || tipo === 'tiktok') return '@' + limpio.replace(/^[^/]+\/@?/, '');
  if (tipo === 'youtube') return limpio.replace(/^[^/]+\//, '');
  return limpio;
}

/** Los que se crean desde "Precio y contacto" (no se editan aquí). */
export const ID_ENLACE_AUTOMATICO = ['wa-contacto', 'correo-contacto'];

