// Mosaico de la cabecera de Explorar (ver ExploreScreen → HeroMedia).
//
// Las tarjetas salen de los lugares DESTACADOS del catálogo (foto y nombre
// reales — nunca un rótulo que no corresponda a la imagen). Para que una
// tarjeta sea un VIDEO (se reproduce solo, en silencio y en bucle):
//   1. copia el .mp4 (corto, ≤ 8 s, ≤ 2 MB, 720p) a  public/videos/
//   2. agrega aquí el id del lugar → su ruta, por ejemplo:
//        'prestador-12': '/videos/cascada.mp4',
// Si el archivo no carga, la tarjeta cae sola a la foto del lugar.
export const VIDEOS_HERO: Record<string, string> = {};

export interface TarjetaHero {
  id: string;
  titulo: string;
  imagen: string;
  video?: string;
}
