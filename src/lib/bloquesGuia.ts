// ============================================================
// BLOQUES DE CONTENIDO — Guía del prestador (Módulo 2)
// ============================================================
// Reemplaza el "editar = formulario duplicado" (ver MEJORAS DISEÑO
// PANEL PRESTADOR, sección "Congruencia en información") por un
// editor de bloques estilo Centro de Creadores de Mindtrip.
//
// Adaptación consciente vs. la referencia de Mindtrip:
// - Sin "Elige tu diseño" (pantalla dividida/completa) ni plantilla
//   de itinerario por días — un servicio no es un viaje de varios
//   días, es una sola ficha. Se guarda directo al elegir método.
// - Sin bloques "Día" / "Guía" (son para itinerarios multi-día).
// - Con bloques: títulos (3 tamaños), texto, imagen/video, enlace,
//   separador, cita, actividad y lugar — los que sí aplican a
//   describir un servicio turístico.
// ============================================================

export type TipoBloque =
  | 'titulo_grande'
  | 'titulo_mediano'
  | 'titulo_normal'
  | 'texto'
  | 'imagen'
  | 'separador'
  | 'enlace'
  | 'cita'
  | 'actividad'
  | 'lugar';

export interface BloqueContenido {
  id: string;
  tipo: TipoBloque;
  // Título/Texto/Cita usan `texto`. Actividad/Lugar usan `texto`
  // como nombre y `detalle` como descripción corta. Enlace usa
  // `texto` como etiqueta visible y `url` como destino.
  texto?: string;
  detalle?: string;
  url?: string;
}

export type EstadoGuia = 'borrador' | 'publicado';

export interface InfoTipoBloque {
  tipo: TipoBloque;
  etiqueta: string;
  placeholder: string;
}

// Orden y textos exactamente como los pide el documento de mejoras,
// menos "Día"/"Guía" (ver nota arriba).
export const TIPOS_BLOQUE: InfoTipoBloque[] = [
  { tipo: 'cita',           etiqueta: 'Cita',           placeholder: '"Una experiencia inolvidable..."' },
  { tipo: 'imagen',         etiqueta: 'Imagen/Video',   placeholder: '' },
  { tipo: 'enlace',         etiqueta: 'Enlace',         placeholder: 'https://instagram.com/tu_negocio' },
  { tipo: 'separador',      etiqueta: 'Separador',      placeholder: '' },
  { tipo: 'titulo_normal',  etiqueta: 'Título normal',  placeholder: 'Escribe un título' },
  { tipo: 'titulo_mediano', etiqueta: 'Título mediano', placeholder: 'Escribe un título' },
  { tipo: 'titulo_grande',  etiqueta: 'Título grande',  placeholder: 'Escribe un título' },
  { tipo: 'texto',          etiqueta: 'Texto del cuerpo', placeholder: 'Cuéntale al visitante más sobre esto…' },
  { tipo: 'actividad',      etiqueta: 'Actividad',      placeholder: 'ej: Paseo en lancha por la laguna' },
  { tipo: 'lugar',          etiqueta: 'Lugar',          placeholder: 'ej: Muelle de Catemaco' },
];

export function nuevoBloqueId(): string {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function bloqueVacio(tipo: TipoBloque): BloqueContenido {
  return { id: nuevoBloqueId(), tipo };
}

export function parseBloques(raw: unknown): BloqueContenido[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as BloqueContenido[];
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
