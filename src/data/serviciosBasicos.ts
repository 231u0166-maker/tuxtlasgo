// ============================================================
// SERVICIOS BÁSICOS — hospitales, farmacias y comisarías
// ============================================================
// Retroalimentación real de campo: turistas preguntan "¿hay un
// hospital/farmacia/comisaría cerca de [lugar]?" — sobre todo por
// seguridad y salud, no por interés turístico. A propósito estos
// registros NO viven en `LUGARES` (data/lugares.ts): no deben
// aparecer en Explorar, en el Mapa por defecto, ni en ninguna
// categoría visible de la plataforma. Es una base de consulta
// oculta que SOLO el motor del chat lee, bajo demanda, cuando el
// turista pregunta explícitamente por uno de estos servicios (ver
// detectarTipoServicioBasico/buscarServicioBasicoCercano en
// chatbot.ts). Funciona igual en línea o sin conexión: es
// información estática empaquetada con la app, no depende de red.
//
// Reutiliza el tipo `Lugar` tal cual (categoria: 'Otro', la misma
// que ya existe) para poder mostrar la tarjeta + mini-mapa del chat
// sin tocar ningún componente de UI — el campo extra `tipo` es lo
// único que se agrega, y el resto del código lo ignora sin problema.
//
// Datos reunidos por nombre público conocido (no verificados uno a
// uno con cada institución) — si algún dato queda desactualizado o
// el lugar ya no existe, se corrige aquí mismo, sin afectar nada
// más de la plataforma.
// ============================================================

import type { Lugar } from './lugares';
import { placeholderLugar } from '../lib/imagenLugar';

export type TipoServicioBasico = 'salud' | 'farmacia' | 'seguridad';

export interface ServicioBasico extends Lugar {
  tipo: TipoServicioBasico;
}

// Centro aproximado de cada municipio (zócalo/palacio municipal) —
// respaldo para cuando el turista pregunta por un servicio básico
// sin nombrar un lugar específico, solo el municipio ("hay una
// farmacia en Santiago Tuxtla").
export const CENTRO_MUNICIPIO: Record<string, [number, number]> = {
  Catemaco: [18.4189516, -95.1099758],
  'San Andrés Tuxtla': [18.4486428, -95.2125805],
  'Santiago Tuxtla': [18.4655533, -95.2996679],
};

function crearServicio(datos: {
  id: string;
  nombre: string;
  tipo: TipoServicioBasico;
  municipio: string;
  coords: [number, number];
  direccion?: string;
  telefono?: string;
  horario?: string;
}): ServicioBasico {
  const descripcionTipo =
    datos.tipo === 'salud'
      ? 'Servicio de salud'
      : datos.tipo === 'farmacia'
        ? 'Farmacia'
        : 'Seguridad pública';

  return {
    id: datos.id,
    nombre: datos.nombre,
    categoria: 'Otro',
    municipio: datos.municipio,
    descripcionCorta: `${descripcionTipo} en ${datos.municipio}.`,
    descripcion: datos.direccion
      ? `${descripcionTipo} en ${datos.municipio}. Dirección aproximada: ${datos.direccion}.`
      : `${descripcionTipo} en ${datos.municipio}.`,
    coords: datos.coords,
    rating: 0,
    precio: 'bajo',
    precioMxn: datos.tipo === 'salud' ? 'Según el servicio' : 'Consulta precios en sitio',
    duracionSugerida: '—',
    imagen: placeholderLugar('Otro', datos.nombre),
    tags: [datos.tipo, 'servicio basico'],
    ideal: ['familia', 'pareja', 'amigos', 'solo'],
    abierto: {
      dias: 'Todos los días',
      horario: datos.horario ?? (datos.tipo === 'salud' ? 'Urgencias 24 horas' : 'Consultar horario'),
    },
    comoLlegar: datos.direccion,
    verificado: false,
    contacto: datos.telefono,
    tipo: datos.tipo,
  };
}

// Coordenadas obtenidas por geocodificación (OpenStreetMap Nominatim)
// a partir de nombre + dirección pública. Cuando no se pudo ubicar la
// calle exacta, se aproximó al centro del municipio (puede quedar
// unos cientos de metros a ~2 km desplazado de la dirección real) —
// las 3 comisarías se aproximaron al Palacio Municipal de cada pueblo
// por no encontrarse una dirección separada y confirmada para la
// comandancia de policía, y las farmacias de Catemaco y Santiago
// Tuxtla también cayeron cerca del centro por la misma limitación.
//
// Corregido (QA de campo): el hospital de Santiago Tuxtla SÍ tenía
// coords idénticas al centro del municipio a pesar de que su
// dirección real ("Carretera Santiago Tuxtla–Isla Km 1.5") NO es el
// zócalo — eso le habría dicho a un turista en una emergencia real
// que el hospital está "a 0 metros" cuando está a ~1.2-1.5 km por
// carretera. Ya se geocodificó por separado (amenity=hospital real en
// OSM sobre la carretera de salida del pueblo). Corregir aquí si
// algún dato cambia.
export const SERVICIOS_BASICOS: ServicioBasico[] = [
  // ── Catemaco ──
  crearServicio({
    id: 'servicio-salud-catemaco',
    nombre: 'UMF 34 IMSS Catemaco',
    tipo: 'salud',
    municipio: 'Catemaco',
    coords: [18.4233681, -95.1139786],
    direccion: 'Calle Venustiano Carranza s/n, Col. El Rodeo, Catemaco, C.P. 95870',
  }),
  crearServicio({
    id: 'servicio-farmacia-catemaco',
    nombre: 'Farmacias Similares Catemaco',
    tipo: 'farmacia',
    municipio: 'Catemaco',
    coords: [18.4189516, -95.1099758],
    direccion: 'Calle Genaro García Mantilla s/n, Catemaco',
  }),
  crearServicio({
    id: 'servicio-seguridad-catemaco',
    nombre: 'Comisaría / Palacio Municipal de Catemaco',
    tipo: 'seguridad',
    municipio: 'Catemaco',
    coords: [18.4189516, -95.1099758],
    direccion: 'Palacio Municipal, Catemaco, Ver.',
  }),

  // ── San Andrés Tuxtla ──
  crearServicio({
    id: 'servicio-salud-san-andres',
    nombre: 'Hospital General de San Andrés Tuxtla "Dr. Bernardo Peña"',
    tipo: 'salud',
    municipio: 'San Andrés Tuxtla',
    coords: [18.444258, -95.209534],
    direccion: 'Teniente Juan de la Barrera 54, Belén Grande, 95786 San Andrés Tuxtla, Ver.',
    telefono: '294 942 0447',
  }),
  crearServicio({
    id: 'servicio-farmacia-san-andres',
    nombre: 'Farmacias del Ahorro (Venustiano Carranza)',
    tipo: 'farmacia',
    municipio: 'San Andrés Tuxtla',
    coords: [18.4495545, -95.2135716],
    direccion: 'Calle Venustiano Carranza No. 11, San Andrés Tuxtla, Ver.',
  }),
  crearServicio({
    id: 'servicio-seguridad-san-andres',
    nombre: 'Comisaría / Palacio Municipal de San Andrés Tuxtla',
    tipo: 'seguridad',
    municipio: 'San Andrés Tuxtla',
    coords: [18.4486428, -95.2125805],
    direccion: 'Francisco I. Madero No. 1, Col. Centro, C.P. 95700',
  }),

  // ── Santiago Tuxtla ──
  crearServicio({
    id: 'servicio-salud-santiago',
    nombre: 'Hospital General de Santiago Tuxtla (IMSS-Bienestar)',
    tipo: 'salud',
    municipio: 'Santiago Tuxtla',
    coords: [18.4583447, -95.3080988],
    direccion: 'Carretera Santiago Tuxtla–Isla Km 1.5, Santiago Tuxtla, Ver.',
    telefono: '294 947 1352',
  }),
  crearServicio({
    id: 'servicio-farmacia-santiago',
    nombre: 'Farmapronto Santiago Tuxtla',
    tipo: 'farmacia',
    municipio: 'Santiago Tuxtla',
    coords: [18.4655533, -95.2996679],
    direccion: 'Calle Morelos #1 Local 2, Col. Centro, C.P. 95830',
    telefono: '294 947 1109',
  }),
  crearServicio({
    id: 'servicio-seguridad-santiago',
    nombre: 'Comisaría / Palacio Municipal de Santiago Tuxtla',
    tipo: 'seguridad',
    municipio: 'Santiago Tuxtla',
    coords: [18.4655533, -95.2996679],
    direccion: 'Plaza Principal / Calle Zaragoza, Barrio Alcaldía, Santiago Tuxtla, Ver.',
    telefono: '294 947 0283',
  }),
];
