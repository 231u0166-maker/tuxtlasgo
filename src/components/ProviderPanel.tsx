import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Map, type MapRef } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Search, Sparkles, Building2, MapPin, Navigation, CheckCircle2, Loader2, Copy,
  ShieldCheck, X, Layers, Camera,
} from 'lucide-react';
import { getUsuarioLocal, getToken, setUsuarioLocal, type UsuarioSesion } from '../lib/auth';
import { subirFotoVerificacion, type ProgresoSubida } from '../lib/cloudinary';
import { obtenerUbicacionGPS } from '../lib/routing';
import OfflineIndicator from './OfflineIndicator';
import AuthModal from './AuthModal';
import GestorFotos from './GestorFotos';
import { ESTILO_MAPA, ESTILO_SATELITE, ZOOM_SATELITE_MAX } from './MapScreen';
import { ESTADOS_MEXICO, MUNICIPIOS_TUXTLAS, componerMunicipio } from '../data/estados';
// Se descarga solo al llegar al paso de precio (mismo componente que usa Mi Perfil).
const SelectorRangoPrecio = lazy(() => import('./SelectorRangoPrecio'));
import { NIVELES_PRECIO, formatearPrecio, type NivelPrecio } from '../lib/precio';

// ============================================================
// PANEL DEL PRESTADOR — v3 (ver MEJORAS DISEÑO PANEL PRESTADOR)
// ============================================================
// Hallazgo real de campo IMPORTANTE: el formulario de negocio vivía
// ANTES dentro del modal de crear cuenta — un "formulario dentro de
// otro formulario", confuso y chico. Ahora el registro de CUENTA es
// simple y genérico (AuthModal, igual para cualquiera), y el
// formulario de NEGOCIO vive aquí, como su propia pantalla completa,
// para quien ya tiene sesión iniciada.
//
// Flujo:
//  1. Sin sesión  → botón para crear cuenta (AuthModal, simple)
//  2. Con sesión, no es prestador → "¿Quieres registrar tu servicio?"
//     → pantalla de registro de negocio completa
//  3. Ya es prestador → mensaje de "gestiona desde Mi Perfil"
//  + Consultar estado, disponible siempre
// ============================================================

type Vista = 'inicio' | 'registrar';

const TUXTLAS_CENTER: [number, number] = [18.45, -95.18];
// Animación vertical entre las preguntas de un mismo paso.
const VARIANTES_SUB = {
  entra: (d: 1 | -1) => ({ y: d > 0 ? 40 : -40, opacity: 0 }),
  centro: { y: 0, opacity: 1 },
  sale: (d: 1 | -1) => ({ y: d > 0 ? -40 : 40, opacity: 0 }),
};
// Mismo criterio que api/servicios/registro.ts — validado en los dos
// lados por la misma razón de siempre: el cliente da el error al
// instante, el servidor es el que de verdad protege los datos.
const NOMBRE_NEGOCIO_VALIDO = /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/;
const TELEFONO_VALIDO = /^\+?[\d\s-]{10,15}$/;

export default function ProviderPanel() {
  const [vista, setVista] = useState<Vista>('inicio');
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(getUsuarioLocal());
  const [mostrarAuth, setMostrarAuth] = useState(false);
  const esPrestador = usuario?.tipo === 'prestador';

  return (
    <div className="min-h-screen bg-amate-50 flex flex-col">
      <OfflineIndicator />

      {vista === 'inicio' ? (
        <PantallaInicio
          onRegistrar={() => setVista('registrar')}
          usuario={usuario}
          esPrestador={esPrestador}
          onPedirCuenta={() => setMostrarAuth(true)}
        />
      ) : (
        <>
          <header className="bg-white/80 backdrop-blur-md border-b border-obsidiana-900/5">
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-jungle-700 hover:text-jungle-900 text-sm font-medium mb-4"
              >
                <ArrowLeft size={16} /> Inicio
              </Link>
              <div className="inline-flex items-center gap-1.5 bg-sun-50 text-sun-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide mb-3">
                <Sparkles size={12} />
                Prestadores
              </div>
              <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-obsidiana-900">
                Tu negocio en TuxtlasGO
              </h1>
              <p className="text-sm text-obsidiana-800/60 mt-1.5 leading-relaxed">
                Da a conocerte a quien ya viene por acá. Sin intermediarios, sin comisiones.
              </p>
            </div>
          </header>

          <main className="max-w-2xl w-full mx-auto px-4 sm:px-6 py-6 pb-14">
            <RegistrarNegocio
              onVolver={() => setVista('inicio')}
              onExito={() => {
                const actualizado = getUsuarioLocal();
                setUsuario(actualizado);
                setVista('inicio');
              }}
            />
          </main>
        </>
      )}

      {mostrarAuth && (
        <AuthModal
          vistaInicial="registro"
          onClose={() => setMostrarAuth(false)}
          onSuccess={(u) => {
            setUsuario(u);
            setMostrarAuth(false);
            setVista('registrar');
          }}
        />
      )}
    </div>
  );
}

// ─────────────── PANTALLA DE INICIO ───────────────
// Minimalista y centrada, sin fotos: titular, una sola acción y el camino en
// tres pasos. El estado de la solicitud (aprobada / rechazada) ya no se
// consulta con un código: le llega como notificación.
const PASOS_PRESTADOR = [
  { titulo: 'Cuéntanos de tu negocio', texto: 'Nombre, tipo, precio y ubicación. Toma unos minutos.' },
  { titulo: 'Lo revisamos', texto: 'Confirmamos que sea real y te avisamos por notificación.' },
  { titulo: 'Apareces en el mapa', texto: 'Los turistas te encuentran, incluso sin internet.' },
];

function PantallaInicio({
  onRegistrar,
  usuario,
  esPrestador,
  onPedirCuenta,
}: {
  onRegistrar: () => void;
  usuario: UsuarioSesion | null;
  esPrestador: boolean;
  onPedirCuenta: () => void;
}) {
  const clasesBoton =
    'inline-flex items-center justify-center gap-2 bg-jungle-700 hover:bg-jungle-800 text-white px-8 py-4 rounded-full font-bold text-base shadow-lg shadow-jungle-700/20 transition-colors';
  const aparece = (i: number) => ({
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.08 * i, duration: 0.5, ease: 'easeOut' as const },
  });

  return (
    <div className="flex-1 flex flex-col">
      <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 pt-5">
        <Link to="/" className="inline-flex items-center gap-1.5 text-jungle-700 hover:text-jungle-900 text-sm font-medium">
          <ArrowLeft size={16} /> Inicio
        </Link>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-4 sm:px-6 pb-16">
        <motion.p {...aparece(0)} className="text-xs font-bold uppercase tracking-[0.2em] text-sun-700 mb-4">
          Para prestadores
        </motion.p>
        <motion.h1 {...aparece(1)} className="font-display font-extrabold text-4xl sm:text-6xl text-obsidiana-900 leading-[1.05] max-w-2xl">
          Tu negocio en TuxtlasGO
        </motion.h1>
        <motion.p {...aparece(2)} className="text-base sm:text-lg text-obsidiana-800/60 mt-4 max-w-md leading-relaxed">
          Da a conocerte a quien ya viene por acá. Sin intermediarios, sin comisiones.
        </motion.p>

        <motion.div {...aparece(3)} className="mt-9 flex flex-col items-center gap-3">
          {esPrestador ? (
            <>
              <Link to="/app?tab=perfil" className={clasesBoton}>Ir a mi perfil</Link>
              <p className="text-sm text-obsidiana-800/55 max-w-xs">
                Ahí gestionas tu servicio. Si te aprueban o necesitas corregir algo, te avisamos en las notificaciones 🔔
              </p>
            </>
          ) : usuario ? (
            <button type="button" onClick={onRegistrar} className={clasesBoton}>Registrar mi negocio</button>
          ) : (
            <>
              <button type="button" onClick={onPedirCuenta} className={clasesBoton}>Crear cuenta gratis</button>
              <p className="text-sm text-obsidiana-800/55">Es rápido; después cuentas de tu negocio.</p>
            </>
          )}
        </motion.div>

        <ol className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-6 max-w-3xl w-full">
          {PASOS_PRESTADOR.map((p, i) => (
            <motion.li key={p.titulo} {...aparece(4 + i)} className="flex flex-col items-center">
              <span className="h-10 w-10 rounded-full border-2 border-jungle-300 text-jungle-700 font-display font-bold flex items-center justify-center mb-3">
                {i + 1}
              </span>
              <p className="font-display font-bold text-obsidiana-900">{p.titulo}</p>
              <p className="text-sm text-obsidiana-800/55 mt-1 max-w-[16rem] leading-relaxed">{p.texto}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ─────────────── REGISTRAR NEGOCIO (asistente por pasos) ───────────────
// Hallazgo real de campo: el formulario largo de una sola pantalla
// "no convencía" — se pidió por secciones, más interactivo, y sobre
// todo que la foto fuera parte de ENVIAR LA SOLICITUD, no algo que
// solo aparece después en Mi Perfil. La foto se sube DESPUÉS de que
// el servicio ya existe en la base (GestorFotos necesita un servicio
// real al que asociarla vía el token) — por eso "Fotos" es el paso
// que sigue justo después de enviar los datos, antes de la
// confirmación final, no antes.
// El paso "Contacto y ubicación" original metía 4 tareas distintas
// (teléfono, mapa, foto de identidad, términos) — el único que
// rompía el patrón de "una pregunta por pantalla" que sí respetan
// los demás, y el sospechoso número 1 de abandono a mitad del
// registro. Se parte en dos: 'contacto' se queda con teléfono + mapa
// (ligado entre sí porque ambos ubican al negocio), y 'verificacion'
// (nuevo) se lleva identidad + términos — lo último que se confirma
// justo antes de enviar.
type PasoRegistro = 'info' | 'descripcion' | 'precio' | 'contacto' | 'verificacion' | 'fotos' | 'listo';
const ORDEN_PASOS: PasoRegistro[] = ['info', 'descripcion', 'precio', 'contacto', 'verificacion', 'fotos', 'listo'];
const TITULO_PASO: Record<PasoRegistro, string> = {
  info: 'Información básica',
  descripcion: 'Descripción',
  precio: 'Precio',
  contacto: 'Contacto y ubicación',
  // Mismo título para 'verificacion' y 'fotos' a propósito — ver
  // INDICE_VISUAL abajo: para quien llena el formulario ambas se
  // sienten como "sube una foto", así que se presentan como un solo
  // paso numerado aunque sigan siendo 2 pantallas y 2 estados
  // separados por dentro (GestorFotos necesita el "codigo" que recién
  // se genera al enviar 'verificacion' — no se pueden fusionar en una
  // sola pantalla real, el negocio todavía no existe en Neon hasta
  // ese envío).
  verificacion: 'Fotos y verificación',
  fotos: 'Fotos y verificación',
  listo: '¡Listo!',
};

// Índice de paso VISIBLE (el que ve la persona en "Paso X de Y" y en
// la barra de progreso) — distinto del índice real en ORDEN_PASOS
// (el que usan siguiente()/irA() para navegar). 'verificacion' y
// 'fotos' comparten el mismo número: 6 segmentos visibles en vez de
// 7, aunque internamente sigan siendo 2 pasos con un submit real
// entre ambos.
const INDICE_VISUAL: Record<PasoRegistro, number> = {
  info: 0,
  descripcion: 1,
  precio: 2,
  contacto: 3,
  verificacion: 4,
  fotos: 4,
  listo: 5,
};
const TOTAL_PASOS_VISIBLES = 6;

// ─────────────── Borrador local ───────────────
// Antes nada de este formulario se guardaba — todo vivía en useState.
// Si alguien llegaba al paso 4-5 y perdía señal o cerraba la pestaña
// sin querer, perdía nombre, categoría, descripción, precio, todo.
// La clave incluye el id del usuario logueado para no mezclar
// borradores de distintas cuentas en el mismo teléfono/compu.
interface BorradorRegistro {
  paso: PasoRegistro;
  nombreNegocio: string;
  categoria: string;
  municipio: string;
  // Opcional: los borradores guardados antes de existir el selector de
  // estado no lo tienen, y se asumen de Veracruz.
  estado?: string;
  descripcion: string;
  nivelPrecio: NivelPrecio;
  precioMin: string;
  precioMax: string;
  contacto: string;
  ubicacion: [number, number] | null;
  ubicacionGuardada: boolean;
  terminos: boolean;
  fotoVerificacion: string;
  // Código de seguimiento y fotos ya subidas: el negocio puede quedar
  // YA CREADO en Neon (estado "pendiente", con su código de
  // seguimiento) antes de que la persona termine de verlo/copiarlo o
  // de subir fotos — si cierra la pestaña justo ahí, sin seguir
  // guardando esto perdería el código de seguimiento de
  // una solicitud que sí quedó registrada. Por eso el borrador se
  // sigue guardando durante 'fotos' y 'listo', y solo se borra cuando
  // la persona toca "Entendido" (ver completarRegistro).
  codigo: string;
  fotosSubidas: string[];
}

function claveBorrador(usuarioId: number): string {
  return `tuxtlasgo-registro-borrador-${usuarioId}`;
}

function cargarBorrador(usuarioId: number): BorradorRegistro | null {
  try {
    const json = localStorage.getItem(claveBorrador(usuarioId));
    return json ? JSON.parse(json) : null;
  } catch { return null; }
}

function guardarBorrador(usuarioId: number, borrador: BorradorRegistro): void {
  try { localStorage.setItem(claveBorrador(usuarioId), JSON.stringify(borrador)); } catch { /* no crítico */ }
}

function borrarBorrador(usuarioId: number): void {
  try { localStorage.removeItem(claveBorrador(usuarioId)); } catch { /* no crítico */ }
}

// ─────────────── REGISTRAR NEGOCIO (asistente por pasos, con mapa
// MapLibre consistente con el resto de la app, y animado) ──────────
function RegistrarNegocio({ onVolver, onExito }: { onVolver: () => void; onExito: () => void }) {
  // Se calculan una sola vez al montar (lazy init de useState) — el
  // id de usuario no cambia durante el registro, y así solo se lee
  // localStorage una vez en vez de en cada render.
  const [usuarioId] = useState(() => getUsuarioLocal()?.id ?? null);
  const [borradorInicial] = useState<BorradorRegistro | null>(() => (usuarioId ? cargarBorrador(usuarioId) : null));
  // Aviso de "retomamos tu borrador" — solo si de verdad había algo
  // que retomar (no cuando el borrador está vacío/default), y con
  // salida explícita por si el borrador no es de quien está mirando
  // ahora la pantalla (cuenta compartida en el mismo dispositivo).
  const [mostrarAvisoBorrador, setMostrarAvisoBorrador] = useState(
    () => !!borradorInicial && (borradorInicial.paso !== 'info' || !!borradorInicial.nombreNegocio.trim())
  );

  const [paso, setPaso] = useState<PasoRegistro>(() => borradorInicial?.paso ?? 'info');
  const [direccion, setDireccion] = useState<1 | -1>(1);
  const [nombreNegocio, setNombreNegocio] = useState(() => borradorInicial?.nombreNegocio ?? '');
  const [categoria, setCategoria] = useState(() => borradorInicial?.categoria ?? 'Gastronomia');
  const [municipio, setMunicipio] = useState(() => borradorInicial?.municipio ?? 'Catemaco');
  // El tipo se muestra sin elegir hasta que la persona toque uno (la categoría
  // por defecto no cuenta); con borrador ya cargado se da por elegido.
  const [tipoElegido, setTipoElegido] = useState(() => !!borradorInicial && !!borradorInicial.nombreNegocio.trim());
  // Pregunta actual dentro del paso 'info' (0 nombre, 1 tipo, 2 dónde).
  const [sub, setSub] = useState<0 | 1 | 2>(() => (borradorInicial?.nombreNegocio.trim() ? 2 : 0));
  const [subDir, setSubDir] = useState<1 | -1>(1);
  // Pregunta actual dentro de 'contacto' (0 teléfono, 1 mapa).
  const [subC, setSubC] = useState<0 | 1>(() => (borradorInicial?.ubicacion ? 1 : 0));
  const [vistaSatelite, setVistaSatelite] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [buscandoDireccion, setBuscandoDireccion] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const mapaRef = useRef<MapRef>(null);
  const [estado, setEstado] = useState(() => borradorInicial?.estado ?? 'Veracruz');
  // Lo que se guarda y se envía: los municipios de Los Tuxtlas tal cual
  // (como siempre), y cualquier otro lugar como "Municipio, Estado".
  const municipioFinal = componerMunicipio(estado, municipio.trim());
  const [descripcion, setDescripcion] = useState(() => borradorInicial?.descripcion ?? '');
  const [nivelPrecio, setNivelPrecio] = useState<NivelPrecio>(() => borradorInicial?.nivelPrecio ?? 'razonable');
  const [precioMin, setPrecioMin] = useState(() => borradorInicial?.precioMin ?? '');
  const [precioMax, setPrecioMax] = useState(() => borradorInicial?.precioMax ?? '');
  const [contacto, setContacto] = useState(() => borradorInicial?.contacto ?? '');
  const [ubicacion, setUbicacion] = useState<[number, number] | null>(() => borradorInicial?.ubicacion ?? null);
  const [ubicacionGuardada, setUbicacionGuardada] = useState(() => borradorInicial?.ubicacionGuardada ?? false);
  const [terminos, setTerminos] = useState(() => borradorInicial?.terminos ?? false);
  const [fotoVerificacion, setFotoVerificacion] = useState(() => borradorInicial?.fotoVerificacion ?? '');
  const [subiendoVerificacion, setSubiendoVerificacion] = useState(false);
  const [progresoVerificacion, setProgresoVerificacion] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [codigo, setCodigo] = useState(() => borradorInicial?.codigo ?? '');
  const [copiado, setCopiado] = useState(false);
  const [fotosSubidas, setFotosSubidas] = useState<string[]>(() => borradorInicial?.fotosSubidas ?? []);

  // Ubicación automática por GPS (ver obtenerUbicacionGPS en
  // lib/routing.ts) — precisionUbicacion solo se llena cuando el pin
  // vino del GPS (se limpia si la persona lo mueve a mano, ver el
  // onClick del mapa más abajo), para no mostrar una "precisión" que
  // ya no aplica a un punto ajustado manualmente.
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);
  const [ubicacionAutoFallo, setUbicacionAutoFallo] = useState(false);
  const [precisionUbicacion, setPrecisionUbicacion] = useState<number | null>(null);
  const [mostrarExplicacionUbicacion, setMostrarExplicacionUbicacion] = useState(false);
  const intentoAutoUbicacionHecho = useRef(false);

  const indicePaso = ORDEN_PASOS.indexOf(paso);
  // El que se muestra en pantalla (barra + "Paso X de Y") — ver
  // INDICE_VISUAL. La navegación real (siguiente()/irA()) sigue
  // usando indicePaso/ORDEN_PASOS tal cual, sin tocar.
  const indiceVisual = INDICE_VISUAL[paso];

  function irA(p: PasoRegistro, dir: 1 | -1) {
    setDireccion(dir);
    setPaso(p);
  }

  // Borra el borrador y reinicia todo a sus valores por default — la
  // salida explícita del aviso "retomamos tu borrador" (por ejemplo,
  // si no es tuyo: mismo dispositivo, cuenta distinta a la que dejó
  // el borrador a medias).
  function empezarDeNuevo() {
    if (usuarioId) borrarBorrador(usuarioId);
    setMostrarAvisoBorrador(false);
    setPaso('info'); setDireccion(1); setSub(0); setSubC(0); setTipoElegido(false);
    setNombreNegocio(''); setCategoria('Gastronomia'); setMunicipio('Catemaco'); setEstado('Veracruz');
    setDescripcion(''); setNivelPrecio('razonable'); setPrecioMin(''); setPrecioMax('');
    setContacto(''); setUbicacion(null); setUbicacionGuardada(false); setTerminos(false);
    setFotoVerificacion(''); setCodigo(''); setFotosSubidas([]); setError('');
    setPrecisionUbicacion(null); setUbicacionAutoFallo(false);
  }

  // Se llama cuando la persona toca "Entendido" en el paso final —
  // recién ahí se borra el borrador. Hasta ese momento el negocio
  // puede ya existir en Neon (con código de seguimiento) sin que la
  // persona haya terminado de verlo, así que seguir guardando el
  // borrador es lo que evita perder ese código si cierra antes.
  function completarRegistro() {
    if (usuarioId) borrarBorrador(usuarioId);
    onExito();
  }

  // Intenta ubicar al prestador por GPS — nunca auto-confirma
  // ubicacionGuardada: solo coloca el pin para que la persona lo
  // revise (o lo arrastre/ajuste tocando el mapa) y confirme ella
  // misma con "Guardar ubicación", igual que si lo hubiera marcado a
  // mano desde el inicio.
  async function intentarUbicarme() {
    setBuscandoUbicacion(true);
    setUbicacionAutoFallo(false);
    const gps = await obtenerUbicacionGPS();
    setBuscandoUbicacion(false);
    if (gps) {
      setUbicacion(gps.coord);
      setUbicacionGuardada(false);
      setPrecisionUbicacion(gps.precisionMetros);
      mapaRef.current?.flyTo({ center: [gps.coord[1], gps.coord[0]], zoom: 18, duration: 1200 });
    } else {
      setUbicacionAutoFallo(true);
    }
  }

  // Al entrar al paso de teléfono+mapa, intenta ubicar automáticamente
  // — con la misma explicación amigable que ya usa AppShell.tsx antes
  // de disparar el permiso nativo del navegador (mismo localStorage
  // "ubicacion-explicada": si ya se explicó una vez en el mapa de la
  // app, aquí no se repite). Como mucho un intento automático por
  // visita al asistente — si falla o la persona lo descarta, el botón
  // "Usar mi ubicación actual" junto al mapa sigue disponible para
  // reintentar cuando quiera.
  useEffect(() => {
    if (paso !== 'contacto' || subC !== 1) return;
    if (ubicacion || intentoAutoUbicacionHecho.current) return;
    intentoAutoUbicacionHecho.current = true;
    let explicada = false;
    try { explicada = localStorage.getItem('ubicacion-explicada') === 'true'; } catch { /* no crítico */ }
    if (explicada) intentarUbicarme();
    else setMostrarExplicacionUbicacion(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, subC]);

  // Al entrar al precio sin valores, se precarga el rango del nivel elegido
  // (lo que se ve en pantalla es lo que se guarda).
  useEffect(() => {
    if (paso === 'precio' && !precioMin && !precioMax) {
      setPrecioMin(String(nivelActual.min));
      setPrecioMax(String(nivelActual.max));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso]);

  // Guarda el progreso en cada cambio relevante — incluye 'fotos' y
  // 'listo' a propósito (ver BorradorRegistro arriba). Solo se borra
  // en completarRegistro() o empezarDeNuevo().
  useEffect(() => {
    if (!usuarioId) return;
    guardarBorrador(usuarioId, {
      paso, nombreNegocio, categoria, municipio, estado, descripcion, nivelPrecio,
      precioMin, precioMax, contacto, ubicacion, ubicacionGuardada, terminos,
      fotoVerificacion, codigo, fotosSubidas,
    });
  }, [
    usuarioId, paso, nombreNegocio, categoria, municipio, estado, descripcion, nivelPrecio,
    precioMin, precioMax, contacto, ubicacion, ubicacionGuardada, terminos,
    fotoVerificacion, codigo, fotosSubidas,
  ]);

  function precioFinal(): string {
    return formatearPrecio(nivelPrecio, parseFloat(precioMin), parseFloat(precioMax));
  }

  function subirVerificacion(file: File) {
    const usuario = getUsuarioLocal();
    setSubiendoVerificacion(true);
    setProgresoVerificacion(0);
    subirFotoVerificacion(file, `usuario-${usuario?.id ?? Date.now()}`, (p: ProgresoSubida) => {
      if (p.porcentaje) setProgresoVerificacion(p.porcentaje);
      if (p.url) { setFotoVerificacion(p.url); setSubiendoVerificacion(false); }
      if (p.error) { setError(p.error); setSubiendoVerificacion(false); }
    });
  }

  // Se dispara desde el paso 'verificacion' (el último con datos
  // antes de 'fotos') — teléfono y ubicación ya se validaron al
  // avanzar desde 'contacto', en siguiente().
  async function enviarYContinuar() {
    setError('');
    if (!terminos) return setError('Debes aceptar los términos y condiciones.');
    if (!fotoVerificacion) return setError('Sube una foto de verificación de identidad antes de continuar.');
    const token = getToken();
    if (!token) return setError('Tu sesión expiró — vuelve a iniciar sesión.');

    setCargando(true);
    try {
      const r = await fetch('/api/servicios/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nombre: nombreNegocio.trim(),
          categoria,
          municipio: municipioFinal,
          descripcion: descripcion.trim(),
          precio: precioFinal(),
          contacto: contacto.trim(),
          lat: ubicacion![0],
          lng: ubicacion![1],
          foto_verificacion: fotoVerificacion,
        }),
      });
      const data = await r.json();
      if (r.ok && data.ok) {
        const actual = getUsuarioLocal();
        if (actual) setUsuarioLocal({ ...actual, tipo: 'prestador' });
        setCodigo(data.servicio?.codigo_seguimiento ?? '');
        irA('fotos', 1);
      } else {
        setError(data.error ?? 'No se pudo enviar tu solicitud.');
      }
    } catch {
      setError('Necesitas internet para enviar tu solicitud.');
    } finally {
      setCargando(false);
    }
  }

  function irSubC(n: 0 | 1, dir: 1 | -1) {
    setError('');
    setSubDir(dir);
    setSubC(n);
  }

  // Tocar un municipio de la lista lo elige y pasa solo a la siguiente pregunta.
  function elegirLugar(m: string) {
    setEstado('Veracruz');
    setMunicipio(m);
    setError('');
    setTimeout(() => irA('descripcion', 1), 280);
  }

  // Precio: los niveles precargan un rango razonable; los sliders lo afinan.
  const nivelActual = NIVELES_PRECIO.find((n) => n.id === nivelPrecio)!;
  const pMin = parseFloat(precioMin);
  const pMax = parseFloat(precioMax);
  const precioMinNum = Number.isNaN(pMin) ? nivelActual.min : pMin;
  const precioMaxNum = Number.isNaN(pMax) ? nivelActual.max : pMax;

  // Busca una calle/colonia/negocio cerca del municipio ya elegido y
  // mueve el mapa hasta ahí (Nominatim de OpenStreetMap).
  async function buscarDireccion(e: React.FormEvent) {
    e.preventDefault();
    const q = busqueda.trim();
    if (!q) return;
    setBuscandoDireccion(true);
    setErrorBusqueda('');
    try {
      const lugar = municipioFinal ? `${q}, ${municipioFinal}` : q;
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=mx&q=${encodeURIComponent(lugar)}`);
      const datos = await r.json();
      if (!Array.isArray(datos) || datos.length === 0) {
        setErrorBusqueda('No encontramos ese lugar. Prueba con otra calle o mueve el mapa a mano.');
      } else {
        const lat = parseFloat(datos[0].lat);
        const lng = parseFloat(datos[0].lon);
        mapaRef.current?.flyTo({ center: [lng, lat], zoom: 17, duration: 1200 });
        setUbicacion([lat, lng]);
        setUbicacionGuardada(false);
        setPrecisionUbicacion(null);
      }
    } catch {
      setErrorBusqueda('Necesitas internet para buscar. Puedes mover el mapa a mano.');
    } finally {
      setBuscandoDireccion(false);
    }
  }

  function irSub(n: 0 | 1 | 2, dir: 1 | -1) {
    setError('');
    setSubDir(dir);
    setSub(n);
  }

  // Tocar un tipo lo elige y pasa solo a la siguiente pregunta.
  function elegirTipo(id: string) {
    setCategoria(id);
    setTipoElegido(true);
    setError('');
    setTimeout(() => irSub(2, 1), 280);
  }

  function siguiente() {
    if (paso === 'info' && sub === 0) {
      if (nombreNegocio.trim().length < 3 || !NOMBRE_NEGOCIO_VALIDO.test(nombreNegocio.trim())) {
        return setError('Escribe el nombre real de tu negocio (no solo números o símbolos).');
      }
      return irSub(1, 1);
    }
    if (paso === 'info' && sub === 1) {
      if (!tipoElegido) return setError('Elige qué tipo de negocio es.');
      return irSub(2, 1);
    }
    if (paso === 'info' && municipio.trim().length < 2) {
      return setError('Escribe el municipio o ciudad donde está tu negocio.');
    }
    if (paso === 'descripcion' && (!descripcion.trim() || descripcion.trim().length < 20)) return setError('La descripción debe tener al menos 20 caracteres.');
    if (paso === 'contacto') {
      if (subC === 0) {
        if (contacto.trim() && !TELEFONO_VALIDO.test(contacto.trim())) {
          return setError('El contacto debe ser un número de teléfono (10 dígitos).');
        }
        return irSubC(1, 1);
      }
      if (!ubicacion) return setError('Usa tu ubicación actual o mueve el mapa hasta tu negocio.');
      setUbicacionGuardada(true);
    }
    setError('');
    irA(ORDEN_PASOS[indicePaso + 1], 1);
  }

  const variantesPaso = {
    entra: (dir: 1 | -1) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
    centro: { x: 0, opacity: 1 },
    sale: (dir: 1 | -1) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
  };

  const CATEGORIAS_OPCIONES = [
    { id: 'Gastronomia', desc: 'Restaurantes, cafés y antojitos', emoji: '🍤', foto: '/lugares/hechizo-amor_1.webp' },
    { id: 'Naturaleza', desc: 'Cascadas, selva, lago y reservas', emoji: '🌿', foto: '/lugares/eyipantla_1.webp' },
    { id: 'Aventura', desc: 'Tirolesa, senderismo, kayak', emoji: '🥾', foto: '/lugares/cerro-venado_1.webp' },
    { id: 'Hospedaje', desc: 'Hoteles, cabañas y hostales', emoji: '🛏️', foto: '/lugares/sirena-olmeca_1.webp' },
    { id: 'Comercio', desc: 'Tiendas, artesanías y mercados', emoji: '🛍️', foto: '/imgPrestadores/Prestador_img.jpg', pos: 'left center' },
    { id: 'Cooperativa', desc: 'Lancheros, guías y grupos locales', emoji: '🤝', foto: '/img/slide_17.webp', pos: 'center 80%' },
    { id: 'Otro', desc: 'Otro tipo de servicio', emoji: '⭐', foto: '/img/slide_15.webp', pos: 'center 85%' },
  ];
  const esOtroMunicipio = estado !== 'Veracruz' || !MUNICIPIOS_TUXTLAS.includes(municipio);

  return (
    // -mx-4 sm:-mx-6 rompe el padding del <main> del panel para que
    // cada paso pueda ocupar TODO el ancho — hallazgo real de campo:
    // con el padding normal, cada sección se seguía viendo como un
    // bloque de formulario metido en una columna angosta, sin
    // importar que ya no tuviera caja ni borde.
    <div className="-mx-4 sm:-mx-6">
      <div className="px-4 sm:px-6">
        <button onClick={onVolver} className="inline-flex items-center gap-1.5 text-jungle-700 hover:text-jungle-900 text-sm font-medium mb-2">
          <ArrowLeft size={16} /> Volver
        </button>

        {/* Antes cerrar la pestaña a medias perdía todo el progreso
            sin aviso — ahora se restaura solo, pero se avisa (en vez
            de que la información simplemente "reaparezca" sin
            explicación) y se deja una salida explícita por si el
            borrador no es de quien está mirando ahora. */}
        {mostrarAvisoBorrador && (
          <div className="flex items-center justify-between gap-3 bg-sun-50 border border-sun-200 text-sun-800 text-xs sm:text-sm px-4 py-2.5 rounded-xl mb-3">
            <span>Retomamos tu solicitud donde te quedaste.</span>
            <button onClick={empezarDeNuevo} className="font-bold underline underline-offset-2 flex-shrink-0">
              Empezar de nuevo
            </button>
          </div>
        )}

        <div className="flex gap-1.5 mb-2 mt-4">
          {Array.from({ length: TOTAL_PASOS_VISIBLES }, (_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full bg-jungle-100 overflow-hidden">
              <motion.div
                className="h-full bg-jungle-600"
                initial={false}
                animate={{ width: i <= indiceVisual ? '100%' : '0%' }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              />
            </div>
          ))}
        </div>
        <p className="text-xs font-semibold text-jungle-600 uppercase tracking-wide">
          Paso {indiceVisual + 1} de {TOTAL_PASOS_VISIBLES} · {TITULO_PASO[paso]}
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mt-4">{error}</div>
        )}
      </div>

      {/* Cada paso ocupa la mayor parte de la pantalla, centrado —
          nada de "etiqueta chica + caja de input" apilado como
          formulario típico. La pregunta ES el título grande. */}
      <AnimatePresence mode="wait" custom={direccion}>
        <motion.div
          key={paso}
          custom={direccion}
          variants={variantesPaso}
          initial="entra"
          animate="centro"
          exit="sale"
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="min-h-[62vh] sm:min-h-[68vh] flex flex-col justify-center px-4 sm:px-6 py-8"
        >
          {paso === 'info' && (
            <div className="max-w-xl w-full">
              {/* Una pregunta a la vez, grande y sola en pantalla: la
                  siguiente entra deslizándose desde abajo. */}
              <AnimatePresence mode="wait" initial={false} custom={subDir}>
                <motion.div
                  key={sub}
                  custom={subDir}
                  variants={VARIANTES_SUB}
                  initial="entra" animate="centro" exit="sale"
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                >
                  {sub === 0 && (
                    <>
                      <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-obsidiana-900 leading-tight mb-6">
                        ¿Cómo se llama tu negocio?
                      </h2>
                      <input
                        type="text" value={nombreNegocio} onChange={(e) => setNombreNegocio(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') siguiente(); }}
                        placeholder="Ej: Hotel Lago Encantado" autoFocus maxLength={80}
                        className="w-full bg-transparent border-0 border-b-2 border-jungle-200 focus:border-jungle-600 px-0 py-3 text-2xl sm:text-3xl font-display text-obsidiana-900 placeholder:text-jungle-300 focus:outline-none transition-colors"
                      />
                    </>
                  )}

                  {sub === 1 && (
                    <>
                      <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-obsidiana-900 leading-tight mb-6">
                        ¿Qué tipo de negocio es?
                      </h2>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {CATEGORIAS_OPCIONES.map((c, i) => {
                          const activa = tipoElegido && categoria === c.id;
                          const ultima = i === CATEGORIAS_OPCIONES.length - 1;
                          return (
                            <motion.button
                              key={c.id} type="button"
                              initial={{ opacity: 0, y: 28, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              transition={{ delay: 0.05 * i, duration: 0.4, ease: 'easeOut' }}
                              whileHover={{ y: -4 }} whileTap={{ scale: 0.97 }}
                              onClick={() => elegirTipo(c.id)}
                              aria-pressed={activa}
                              className={`group relative overflow-hidden rounded-3xl text-left shadow-sm ${ultima ? 'col-span-2 aspect-[2/1] sm:col-span-1 sm:aspect-[3/4]' : 'aspect-[3/4]'} ${activa ? 'ring-4 ring-jungle-500' : ''}`}
                            >
                              <img src={c.foto} alt="" loading="lazy"
                                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                                style={{ objectPosition: c.pos ?? 'center' }} />
                              <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                              {activa && <span className="absolute inset-0 bg-jungle-900/40" />}
                              <span className="absolute inset-x-0 bottom-0 p-4 text-white">
                                <span className="block text-2xl mb-1">{c.emoji}</span>
                                <span className="block font-display font-extrabold text-lg leading-tight">{c.id}</span>
                                <span className="block text-xs text-white/80 mt-0.5 leading-snug">{c.desc}</span>
                              </span>
                              {activa && (
                                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                                  className="absolute top-3 right-3 h-8 w-8 rounded-full bg-jungle-500 text-white flex items-center justify-center shadow-lg">
                                  <CheckCircle2 size={20} />
                                </motion.span>
                              )}
                            </motion.button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {sub === 2 && (
                    <>
                      <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-obsidiana-900 leading-tight mb-6">
                        ¿En qué municipio está?
                      </h2>
                      <div className="space-y-3">
                        {MUNICIPIOS_TUXTLAS.map((m, i) => {
                          const activo = estado === 'Veracruz' && municipio === m;
                          return (
                            <motion.button
                              key={m} type="button"
                              initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.06 * i, duration: 0.3 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => elegirLugar(m)}
                              className={`w-full flex items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-colors ${activo ? 'border-jungle-600 bg-jungle-50' : 'border-jungle-100 bg-white hover:border-jungle-300'}`}
                            >
                              <span className={`h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0 ${activo ? 'bg-jungle-600 text-white' : 'bg-jungle-50 text-jungle-700'}`}>
                                <MapPin size={20} />
                              </span>
                              <span className="flex-1">
                                <span className="block font-display font-bold text-lg text-obsidiana-900 leading-tight">{m}</span>
                                <span className="block text-xs text-obsidiana-600">Veracruz</span>
                              </span>
                              {activo && <CheckCircle2 size={22} className="text-jungle-600" />}
                            </motion.button>
                          );
                        })}
                        <motion.button
                          type="button"
                          initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.06 * MUNICIPIOS_TUXTLAS.length, duration: 0.3 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setMunicipio('')}
                          className={`w-full flex items-center gap-4 rounded-2xl border-2 border-dashed px-5 py-4 text-left transition-colors ${esOtroMunicipio ? 'border-jungle-600 bg-jungle-50' : 'border-jungle-200 bg-white hover:border-jungle-300'}`}
                        >
                          <span className={`h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0 ${esOtroMunicipio ? 'bg-jungle-600 text-white' : 'bg-jungle-50 text-jungle-700'}`}>
                            <Search size={20} />
                          </span>
                          <span className="flex-1">
                            <span className="block font-display font-bold text-lg text-obsidiana-900 leading-tight">Otro lugar</span>
                            <span className="block text-xs text-obsidiana-600">Otro municipio o estado</span>
                          </span>
                        </motion.button>
                      </div>

                      <AnimatePresence initial={false}>
                        {esOtroMunicipio && (
                          <motion.div
                            key="otro" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-5 space-y-4">
                              <input
                                type="text" value={municipio} onChange={(e) => setMunicipio(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') siguiente(); }}
                                placeholder="Municipio o ciudad. Ej: Xalapa" maxLength={60} autoFocus
                                className="w-full bg-transparent border-0 border-b-2 border-jungle-200 focus:border-jungle-600 px-0 py-3 text-2xl font-display text-obsidiana-900 placeholder:text-jungle-300 focus:outline-none transition-colors"
                              />
                              <label className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-obsidiana-600">Estado</span>
                                <select
                                  value={estado} onChange={(e) => setEstado(e.target.value)}
                                  className="flex-1 bg-white border-2 border-jungle-100 focus:border-jungle-600 rounded-2xl px-4 py-3 font-semibold text-base text-obsidiana-800 focus:outline-none transition-colors"
                                >
                                  {ESTADOS_MEXICO.map((e) => (<option key={e} value={e}>{e}</option>))}
                                </select>
                              </label>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          )}

          {paso === 'descripcion' && (
            <div className="max-w-xl">
              <h2 className="font-display font-bold text-2xl sm:text-3xl text-obsidiana-900 mb-5">
                Describe tu negocio
              </h2>
              <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                placeholder="¿Qué ofreces? ¿Qué te hace especial?" rows={7}
                className="w-full bg-transparent border-0 border-b-2 border-jungle-200 focus:border-jungle-600 px-0 py-3 text-lg sm:text-xl text-obsidiana-900 placeholder:text-jungle-300 focus:outline-none resize-none transition-colors" />
              <p className="text-xs text-jungle-500 mt-3">Mínimo 20 caracteres — es lo primero que va a leer la gente de tu servicio.</p>
            </div>
          )}

          {paso === 'precio' && (
            <div className="max-w-xl w-full">
              <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-obsidiana-900 leading-tight mb-2">
                ¿Cuánto cuesta, más o menos?
              </h2>
              <p className="text-sm text-obsidiana-800/60 mb-6">
                Un aproximado {categoria === 'Hospedaje' ? 'por noche' : 'por persona'}. No tiene que ser exacto.
              </p>
              <Suspense fallback={<div className="h-64 rounded-2xl bg-jungle-50 animate-pulse" aria-hidden="true" />}>
                <SelectorRangoPrecio
                nivel={nivelPrecio}
                min={precioMinNum}
                max={precioMaxNum}
                onChange={(v) => { setNivelPrecio(v.nivel); setPrecioMin(String(v.min)); setPrecioMax(String(v.max)); }}
              />
              </Suspense>
            </div>
          )}

          {/* Antes este paso mezclaba teléfono + mapa + verificación
              de identidad + términos — 4 tareas distintas en una sola
              pantalla, el único que rompía el patrón de "una
              pregunta a la vez" del resto del asistente. Se queda
              solo con lo que ubica al negocio (teléfono + mapa); la
              verificación pasa a su propio paso, ver abajo. */}
          {paso === 'contacto' && (
            <div className="max-w-2xl w-full">
              <AnimatePresence mode="wait" initial={false} custom={subDir}>
                <motion.div
                  key={subC}
                  custom={subDir}
                  variants={VARIANTES_SUB}
                  initial="entra" animate="centro" exit="sale"
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                >
                  {subC === 0 && (
                    <>
                      <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-obsidiana-900 leading-tight mb-6">
                        ¿A qué número te marcamos?
                      </h2>
                      <input type="tel" inputMode="tel" value={contacto} onChange={(e) => setContacto(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') siguiente(); }}
                        placeholder="9521234567" autoFocus
                        className="w-full bg-transparent border-0 border-b-2 border-jungle-200 focus:border-jungle-600 px-0 py-3 text-2xl sm:text-3xl font-display text-obsidiana-900 placeholder:text-jungle-300 focus:outline-none transition-colors" />
                    </>
                  )}

                  {subC === 1 && (
                    <>
                      <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-obsidiana-900 leading-tight mb-1">
                        Pon el pin en tu negocio
                      </h2>
                      <p className="text-sm text-obsidiana-800/60 mb-3">
                        Mueve el mapa hasta que el pin quede justo en la puerta. Lo más preciso es que estés ahí y uses tu ubicación.
                      </p>

                      <form onSubmit={buscarDireccion} className="flex gap-2 mb-3">
                        <input
                          type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                          placeholder="Busca tu calle, colonia o negocio"
                          className="flex-1 min-w-0 bg-white border-2 border-jungle-100 focus:border-jungle-600 rounded-2xl px-4 py-3 text-base text-obsidiana-900 placeholder:text-jungle-300 focus:outline-none transition-colors"
                        />
                        <button type="submit" disabled={buscandoDireccion || !busqueda.trim()} aria-label="Buscar"
                          className="h-12 w-12 flex-shrink-0 rounded-2xl bg-jungle-700 text-white flex items-center justify-center disabled:opacity-50">
                          {buscandoDireccion ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                        </button>
                      </form>
                      {errorBusqueda && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">{errorBusqueda}</p>}

                      <div className="relative rounded-3xl overflow-hidden border-2 border-jungle-200 h-[56vh] min-h-[360px] sm:h-[480px]">
                        <Map
                          ref={mapaRef}
                          initialViewState={{
                            longitude: ubicacion ? ubicacion[1] : TUXTLAS_CENTER[1],
                            latitude: ubicacion ? ubicacion[0] : TUXTLAS_CENTER[0],
                            zoom: ubicacion ? 17 : 11,
                          }}
                          minZoom={8}
                          maxZoom={vistaSatelite ? ZOOM_SATELITE_MAX : 19}
                          mapStyle={vistaSatelite ? (ESTILO_SATELITE as any) : ESTILO_MAPA}
                          style={{ width: '100%', height: '100%' }}
                          onMoveEnd={(e) => {
                            // Solo cuando la persona mueve el mapa con el dedo/mouse
                            // (los vuelos automáticos ya fijan su propia ubicación).
                            if (!e.originalEvent) return;
                            setUbicacion([e.viewState.latitude, e.viewState.longitude]);
                            setUbicacionGuardada(false);
                            setPrecisionUbicacion(null);
                          }}
                        />
                        {/* Pin fijo al centro: el mapa se mueve debajo de él. */}
                        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full flex flex-col items-center">
                          <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}>
                            <MapPin size={48} className="text-red-600 drop-shadow-lg" fill="currentColor" stroke="white" strokeWidth={1.5} />
                          </motion.div>
                        </div>
                        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-black/50" />

                        <div className="absolute top-3 right-3 flex flex-col gap-2">
                          <button type="button" onClick={() => setVistaSatelite((v) => !v)} aria-label="Cambiar vista del mapa"
                            className="h-11 px-3 rounded-full bg-white shadow-lg text-jungle-800 text-xs font-bold flex items-center gap-1.5">
                            <Layers size={16} /> {vistaSatelite ? 'Mapa' : 'Satélite'}
                          </button>
                        </div>
                        <button type="button" onClick={intentarUbicarme} disabled={buscandoUbicacion}
                          className="absolute bottom-3 left-3 right-3 sm:right-auto h-12 px-5 rounded-full bg-white shadow-lg text-jungle-800 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-70">
                          {buscandoUbicacion ? <Loader2 size={17} className="animate-spin" /> : <Navigation size={17} />}
                          {buscandoUbicacion ? 'Ubicándote…' : 'Usar mi ubicación actual'}
                        </button>
                      </div>

                      {ubicacionAutoFallo && !ubicacion && (
                        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
                          No pudimos ubicarte. Activa la ubicación del teléfono y vuelve a intentar, o busca tu calle y mueve el mapa.
                        </p>
                      )}
                      {ubicacion && (
                        <p className="flex items-center gap-2 text-sm text-jungle-700 font-medium mt-3">
                          <CheckCircle2 size={16} className="text-jungle-600 flex-shrink-0" />
                          Pin colocado{precisionUbicacion != null ? ` · precisión aprox. ±${Math.round(precisionUbicacion)} m` : ''}. Si es correcto, toca Siguiente.
                        </p>
                      )}
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          )}

          {paso === 'verificacion' && (
            <div className="max-w-2xl space-y-8">
              <h2 className="font-display font-bold text-2xl sm:text-3xl text-obsidiana-900">
                Confirma que eres tú
              </h2>

              {/* Foto de verificación — sin esto el admin no tiene
                  forma de confirmar que quien se registra es una
                  persona real antes de aprobar. Nunca se muestra
                  públicamente, solo la ve el admin al revisar. */}
              <div className="bg-white border border-jungle-100 rounded-2xl p-4">
                <div className="flex items-start gap-2.5 mb-3">
                  <ShieldCheck size={18} className="text-jungle-700 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-jungle-900">Verificación de identidad</p>
                    <p className="text-xs text-jungle-500 mt-0.5">
                      Sube una foto de tu identificación oficial (INE, licencia, etc.) o una selfie sosteniéndola.
                      Es privada — solo la revisa el equipo de TuxtlasGO para aprobar tu solicitud, nunca se muestra en tu perfil público.
                    </p>
                  </div>
                </div>

                {fotoVerificacion ? (
                  <div className="relative inline-block">
                    <img src={fotoVerificacion} alt="Verificación" className="h-32 rounded-xl object-cover border border-jungle-100" />
                    <button type="button" onClick={() => setFotoVerificacion('')}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-obsidiana-900 text-white flex items-center justify-center">
                      <X size={13} />
                    </button>
                  </div>
                ) : subiendoVerificacion ? (
                  <div className="flex items-center justify-center gap-2 border border-dashed border-jungle-300 rounded-xl py-6 text-jungle-600 text-sm font-semibold">
                    <Loader2 size={16} className="animate-spin" /> Subiendo… {progresoVerificacion}%
                  </div>
                ) : (
                  <>
                    {/* Un solo botón: en el teléfono el sistema abre su selector
                        nativo (Tomar foto / Fototeca o Galería / Archivos). Sin
                        "capture" a propósito: con capture solo abría la cámara. */}
                    <label className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-jungle-700 hover:bg-jungle-800 text-white py-8 cursor-pointer font-bold transition-colors">
                      <Camera size={30} />
                      <span className="text-base">Subir foto</span>
                      <span className="text-xs font-medium text-white/75">Toma una foto o elige una de tu galería</span>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => { if (e.target.files?.[0]) subirVerificacion(e.target.files[0]); e.target.value = ''; }} />
                    </label>
                  </>
                )}
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={terminos} onChange={(e) => setTerminos(e.target.checked)} className="mt-0.5 w-5 h-5 rounded border-jungle-300 text-jungle-600" />
                <span className="text-sm text-jungle-600">
                  Acepto los{' '}
                  <a href="/terminos" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                    className="text-jungle-800 underline font-semibold hover:text-jungle-950">
                    términos y condiciones
                  </a>{' '}
                  del sistema
                </span>
              </label>
            </div>
          )}

          {paso === 'fotos' && (
            <div className="max-w-2xl">
              <h2 className="font-display font-bold text-2xl sm:text-3xl text-obsidiana-900 mb-2">
                Sube fotos de tu negocio
              </h2>
              <p className="text-sm text-obsidiana-800/60 mb-6">
                Al menos <strong>una foto</strong> real — es lo primero que va a ver la gente.
              </p>
              {/* fotosIniciales viene del borrador restaurado — sin
                  esto, si la persona recargaba a mitad de este paso,
                  GestorFotos arrancaba vacío en pantalla aunque las
                  fotos ya estuvieran guardadas en el servicio (que ya
                  existe en Neon desde 'contacto'/'verificacion'). */}
              <GestorFotos codigoSeguimiento={codigo} fotosIniciales={fotosSubidas} onFotosActualizadas={setFotosSubidas} />
            </div>
          )}

          {paso === 'listo' && (
            <div className="text-center max-w-md mx-auto">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-jungle-700 flex items-center justify-center"
              >
                <CheckCircle2 className="text-white" size={28} />
              </motion.div>
              <h2 className="font-display font-bold text-2xl sm:text-3xl text-obsidiana-900 mb-2">¡Solicitud enviada!</h2>
              <p className="text-sm text-obsidiana-800/60 mb-6 leading-relaxed max-w-sm mx-auto">
                Nuestro equipo va a validar tu negocio. Te avisamos por <strong>notificación 🔔</strong> cuando lo aprobemos o si hay algo que corregir.
              </p>
              <p className="text-xs text-obsidiana-800/50 mb-2">Tu código de seguimiento</p>
              <div className="inline-flex items-center justify-center gap-2 bg-amate-50 rounded-2xl px-5 py-4 mb-8">
                <span className="font-mono font-bold text-xl tracking-wider text-jungle-800">{codigo}</span>
                <button onClick={() => { navigator.clipboard.writeText(codigo).catch(() => {}); setCopiado(true); }} className="text-jungle-600 hover:text-jungle-800" aria-label="Copiar código">
                  {copiado ? <CheckCircle2 size={20} /> : <Copy size={20} />}
                </button>
              </div>
              <div>
                <button onClick={completarRegistro} className="text-sm font-semibold text-jungle-700 underline">Entendido</button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navegación entre pasos — fija abajo, fuera del área animada */}
      <div className="px-4 sm:px-6">
        {paso !== 'listo' && paso !== 'fotos' && (
          <div className="flex items-center gap-3 pb-6">
            {(indicePaso > 0 || sub > 0) && (
              <motion.button whileTap={{ scale: 0.95 }} aria-label="Atrás"
                onClick={() => (paso === 'info' ? irSub((sub - 1) as 0 | 1, -1) : paso === 'contacto' && subC > 0 ? irSubC(0, -1) : irA(ORDEN_PASOS[indicePaso - 1], -1))}
                className="w-14 h-14 rounded-2xl border-2 border-jungle-100 flex items-center justify-center text-jungle-800 flex-shrink-0">
                <ArrowLeft size={20} />
              </motion.button>
            )}
            {paso === 'verificacion' ? (
              <motion.button whileTap={{ scale: 0.98 }} onClick={enviarYContinuar} disabled={cargando}
                className="flex-1 bg-jungle-700 hover:bg-jungle-800 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 transition-colors">
                {cargando && <Loader2 size={18} className="animate-spin" />}
                Enviar solicitud de registro
              </motion.button>
            ) : (
              <motion.button whileTap={{ scale: 0.98 }} onClick={siguiente}
                className="flex-1 bg-jungle-700 hover:bg-jungle-800 text-white font-bold py-4 rounded-2xl transition-colors">
                Siguiente
              </motion.button>
            )}
          </div>
        )}

        {paso === 'fotos' && (
          <motion.button whileTap={{ scale: 0.98 }}
            onClick={() => irA('listo', 1)}
            disabled={fotosSubidas.length === 0}
            className="w-full pb-6 mt-0 bg-jungle-700 hover:bg-jungle-800 text-white font-bold py-4 rounded-2xl disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {fotosSubidas.length === 0 ? 'Sube al menos una foto para continuar' : 'Finalizar registro'}
          </motion.button>
        )}
      </div>

      {/* Explicación propia antes del permiso nativo de ubicación —
          mismo patrón y mismo localStorage "ubicacion-explicada" que
          ya usa AppShell.tsx para el mapa: si la persona ya lo vio
          ahí, no se le repite aquí (y viceversa). Se dispara al
          entrar al paso 'contacto' si todavía no hay un pin — ver el
          useEffect de arriba. */}
      {mostrarExplicacionUbicacion && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-jungle-100 flex items-center justify-center mb-3">
              <Navigation size={22} className="text-jungle-700" />
            </div>
            <h3 className="font-display font-bold text-lg text-jungle-950 mb-1">
              TuxtlasGO quiere ubicarte
            </h3>
            <p className="text-sm text-jungle-700 mb-4">
              Así marcamos el pin automáticamente si estás parado en tu
              negocio ahora mismo — no se comparte con nadie más. Tu
              navegador te va a preguntar a continuación; elige{' '}
              <strong>"Permitir"</strong>. Si no cae exacto, puedes
              tocar el mapa para ajustarlo tú mismo.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setMostrarExplicacionUbicacion(false);
                  try { localStorage.setItem('ubicacion-explicada', 'true'); } catch { /* no crítico */ }
                  setUbicacionAutoFallo(true);
                }}
                className="flex-1 border-2 border-jungle-200 text-jungle-800 py-2.5 rounded-xl font-semibold text-sm"
              >
                Marcar a mano
              </button>
              <button
                onClick={() => {
                  setMostrarExplicacionUbicacion(false);
                  try { localStorage.setItem('ubicacion-explicada', 'true'); } catch { /* no crítico */ }
                  intentarUbicarme();
                }}
                className="flex-1 bg-jungle-700 text-white py-2.5 rounded-xl font-semibold text-sm"
              >
                Permitir ubicación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
