// ============================================================
// BLOQUES — Información adicional del servicio (Módulo 2)
// ============================================================
// Contenido libre y reordenable que el prestador agrega más allá
// de los campos fijos de Mi Servicio: fotos, citas, actividades
// cercanas, enlaces, texto libre. Se llama "Información adicional"
// en la interfaz (no "guía") para no confundir con un itinerario
// de varios días — aquí es contenido de UN servicio.
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

export type EstadoInfoAdicional = 'borrador' | 'publicado';

export interface InfoTipoBloque {
  tipo: TipoBloque;
  etiqueta: string;
  placeholder: string;
  grupo: 'texto' | 'medio' | 'estructura' | 'referencia';
}

export const TIPOS_BLOQUE: InfoTipoBloque[] = [
  { tipo: 'titulo_grande',  etiqueta: 'Título grande',    placeholder: 'Escribe un título',                  grupo: 'texto' },
  { tipo: 'titulo_mediano', etiqueta: 'Título mediano',   placeholder: 'Escribe un título',                  grupo: 'texto' },
  { tipo: 'titulo_normal',  etiqueta: 'Título normal',    placeholder: 'Escribe un título',                  grupo: 'texto' },
  { tipo: 'texto',          etiqueta: 'Texto',            placeholder: 'Cuéntale al visitante más sobre esto…', grupo: 'texto' },
  { tipo: 'cita',           etiqueta: 'Cita',             placeholder: '"Una experiencia inolvidable..."',   grupo: 'texto' },
  { tipo: 'imagen',         etiqueta: 'Foto',             placeholder: '',                                   grupo: 'medio' },
  { tipo: 'enlace',         etiqueta: 'Enlace',           placeholder: 'https://instagram.com/tu_negocio',   grupo: 'medio' },
  { tipo: 'separador',      etiqueta: 'Separador',        placeholder: '',                                   grupo: 'estructura' },
  { tipo: 'actividad',      etiqueta: 'Actividad',        placeholder: 'ej: Paseo en lancha por la laguna',  grupo: 'referencia' },
  { tipo: 'lugar',          etiqueta: 'Lugar cercano',    placeholder: 'ej: Muelle de Catemaco',             grupo: 'referencia' },
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
