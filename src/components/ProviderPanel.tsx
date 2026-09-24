import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Map, Marker } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Search, Sparkles, Building2, MapPin, Navigation, CheckCircle2, Loader2, Copy,
  ShieldCheck, ImagePlus, X,
} from 'lucide-react';
import { buscarPorCodigo } from '../lib/db';
import { getUsuarioLocal, getToken, setUsuarioLocal, type UsuarioSesion } from '../lib/auth';
import { subirFotoVerificacion, type ProgresoSubida } from '../lib/cloudinary';
import { obtenerUbicacionGPS } from '../lib/routing';
import OfflineIndicator from './OfflineIndicator';
import AuthModal from './AuthModal';
import GestorFotos from './GestorFotos';
import { ESTILO_MAPA } from './MapScreen';

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

type Vista = 'inicio' | 'consultar' | 'registrar';

const TUXTLAS_CENTER: [number, number] = [18.45, -95.18];
type NivelPrecio = 'limitado' | 'razonable' | 'lujo' | 'muy_lujo';
const NIVELES_PRECIO: { id: NivelPrecio; simbolo: string; label: string }[] = [
  { id: 'limitado', simbolo: '$', label: 'Presupuesto limitado' },
  { id: 'razonable', simbolo: '$$', label: 'Precio razonable' },
  { id: 'lujo', simbolo: '$$$', label: 'De lujo' },
  { id: 'muy_lujo', simbolo: '$$$$', label: 'Muy lujo' },
];
// Tasa de referencia MXN → USD, solo para dar una idea aproximada —
// NO es una tasa en vivo (eso necesitaría una API externa nueva).
// Verificada al escribir esto (~17.1 MXN/USD); revisar de vez en
// cuando si se nota muy desfasada.
const TASA_USD_REFERENCIA = 17.1;

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
    <div className="min-h-screen bg-amate-50">
      <OfflineIndicator />
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

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-14">
        {vista === 'inicio' && (
          <PantallaInicio
            onElegir={setVista}
            usuario={usuario}
            esPrestador={esPrestador}
            onPedirCuenta={() => setMostrarAuth(true)}
          />
        )}
        {vista === 'consultar' && <ConsultarEstado onVolver={() => setVista('inicio')} />}
        {vista === 'registrar' && (
          <RegistrarNegocio
            onVolver={() => setVista('inicio')}
            onExito={() => {
              const actualizado = getUsuarioLocal();
              setUsuario(actualizado);
              setVista('inicio');
            }}
          />
        )}
      </main>

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
function PantallaInicio({
  onElegir,
  usuario,
  esPrestador,
  onPedirCuenta,
}: {
  onElegir: (v: Vista) => void;
  usuario: UsuarioSesion | null;
  esPrestador: boolean;
  onPedirCuenta: () => void;
}) {
  return (
    <div className="space-y-4">
      {esPrestador ? (
        <div className="bg-jungle-50 border border-jungle-200 text-jungle-800 p-5 rounded-2xl flex items-start gap-3">
          <span className="text-xl flex-shrink-0">📋</span>
          <div>
            <p className="font-display font-bold text-sm mb-1">Gestiona tu servicio desde Mi Perfil</p>
            <p className="text-sm text-jungle-700/70 leading-relaxed">
              Edita tu información, horarios, fotos y previsualiza tu tarjeta desde{' '}
              <strong>Mi Perfil</strong> dentro de la app.
            </p>
          </div>
        </div>
      ) : usuario ? (
        <div className="bg-white border border-obsidiana-900/8 rounded-2xl p-6 text-center">
          <p className="font-display font-bold text-obsidiana-900 mb-1.5">
            ¿Quieres registrar tu servicio?
          </p>
          <p className="text-sm text-obsidiana-800/60 mb-5 leading-relaxed">
            Llena tu información — toma unos minutos y tu solicitud queda en revisión.
          </p>
          <button
            onClick={() => onElegir('registrar')}
            className="inline-flex items-center gap-2 bg-jungle-700 hover:bg-jungle-800 text-white px-6 py-3 rounded-full font-semibold text-sm transition-colors"
          >
            Más información
          </button>
        </div>
      ) : (
        <div className="bg-white border border-obsidiana-900/8 rounded-2xl p-6 text-center">
          <p className="font-display font-bold text-obsidiana-900 mb-1.5">
            ¿Quieres registrar tu servicio?
          </p>
          <p className="text-sm text-obsidiana-800/60 mb-5 leading-relaxed">
            Primero crea una cuenta gratis — es rápido, luego llenas la información de tu negocio.
          </p>
          <button
            onClick={onPedirCuenta}
            className="inline-flex items-center gap-2 bg-jungle-700 hover:bg-jungle-800 text-white px-6 py-3 rounded-full font-semibold text-sm transition-colors"
          >
            Crear cuenta
          </button>
        </div>
      )}

      <button
        onClick={() => onElegir('consultar')}
        className="w-full bg-white hover:border-jungle-300 border border-obsidiana-900/8 text-obsidiana-900 p-5 rounded-2xl text-left flex items-center gap-4 transition-colors"
      >
        <div className="w-11 h-11 rounded-xl bg-jungle-50 flex items-center justify-center flex-shrink-0">
          <Search size={20} className="text-jungle-700" />
        </div>
        <div>
          <div className="font-display font-bold text-base">Consultar estado de mi servicio</div>
          <div className="text-sm text-obsidiana-800/55">
            ¿Ya registraste tu negocio? Revisa si fue aprobado con tu código.
          </div>
        </div>
      </button>
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
  // guardando esto perdería la única forma de consultar el estado de
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
  const [descripcion, setDescripcion] = useState(() => borradorInicial?.descripcion ?? '');
  const [generandoDescripcion, setGenerandoDescripcion] = useState(false);
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
    setPaso('info'); setDireccion(1);
    setNombreNegocio(''); setCategoria('Gastronomia'); setMunicipio('Catemaco');
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
    if (paso !== 'contacto') return;
    if (ubicacion || intentoAutoUbicacionHecho.current) return;
    intentoAutoUbicacionHecho.current = true;
    let explicada = false;
    try { explicada = localStorage.getItem('ubicacion-explicada') === 'true'; } catch { /* no crítico */ }
    if (explicada) intentarUbicarme();
    else setMostrarExplicacionUbicacion(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso]);

  // Guarda el progreso en cada cambio relevante — incluye 'fotos' y
  // 'listo' a propósito (ver BorradorRegistro arriba). Solo se borra
  // en completarRegistro() o empezarDeNuevo().
  useEffect(() => {
    if (!usuarioId) return;
    guardarBorrador(usuarioId, {
      paso, nombreNegocio, categoria, municipio, descripcion, nivelPrecio,
      precioMin, precioMax, contacto, ubicacion, ubicacionGuardada, terminos,
      fotoVerificacion, codigo, fotosSubidas,
    });
  }, [
    usuarioId, paso, nombreNegocio, categoria, municipio, descripcion, nivelPrecio,
    precioMin, precioMax, contacto, ubicacion, ubicacionGuardada, terminos,
    fotoVerificacion, codigo, fotosSubidas,
  ]);

  function precioFinal(): string {
    const nivel = NIVELES_PRECIO.find((n) => n.id === nivelPrecio)!;
    const min = parseFloat(precioMin);
    const max = parseFloat(precioMax);
    if (Number.isNaN(min) || Number.isNaN(max) || min <= 0 || max <= 0) return 'A consultar';
    const usdMin = Math.round(min / TASA_USD_REFERENCIA);
    const usdMax = Math.round(max / TASA_USD_REFERENCIA);
    return `${nivel.simbolo} $${min.toLocaleString('es-MX')} – $${max.toLocaleString('es-MX')} MXN (aprox. $${usdMin} – $${usdMax} USD)`;
  }

  async function generarDescripcionIA() {
    if (!nombreNegocio.trim()) {
      setError('Escribe primero el nombre de tu negocio para poder generar la descripción.');
      return;
    }
    setGenerandoDescripcion(true);
    setError('');
    try {
      const r = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt:
            'Eres un redactor de descripciones cortas para negocios turísticos de Los Tuxtlas, Veracruz. Con los datos que te den (nombre, categoría, municipio), escribe una descripción de 2 a 3 frases, cálida y profesional, en español. NUNCA inventes detalles específicos que no te dieron (no inventes platillos, actividades ni servicios concretos que no mencionaron) — describe de forma genérica pero atractiva según su categoría. Responde solo con la descripción, sin comillas ni texto extra.',
          mensajes: [{ role: 'user', content: `Nombre: ${nombreNegocio.trim()}. Categoría: ${categoria}. Municipio: ${municipio}. Escribe la descripción.` }],
        }),
      });
      const data = await r.json();
      if (r.ok && data.texto) setDescripcion(data.texto.trim());
      else setError('No se pudo generar la descripción ahora mismo — escríbela tú, no hay problema.');
    } catch {
      setError('Necesitas internet para generar la descripción con IA.');
    } finally {
      setGenerandoDescripcion(false);
    }
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
          municipio,
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

  function siguiente() {
    if (paso === 'info' && (!nombreNegocio.trim() || nombreNegocio.trim().length < 3 || !NOMBRE_NEGOCIO_VALIDO.test(nombreNegocio.trim()))) {
      return setError('Escribe el nombre real de tu negocio (no solo números o símbolos).');
    }
    if (paso === 'descripcion' && (!descripcion.trim() || descripcion.trim().length < 20)) return setError('La descripción debe tener al menos 20 caracteres.');
    if (paso === 'contacto') {
      if (contacto.trim() && !TELEFONO_VALIDO.test(contacto.trim())) {
        return setError('El contacto debe ser un número de teléfono (10 dígitos).');
      }
      if (!ubicacionGuardada) return setError('Marca tu ubicación en el mapa antes de continuar.');
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
    { id: 'Gastronomia', emoji: '🍤' },
    { id: 'Naturaleza', emoji: '🌿' },
    { id: 'Aventura', emoji: '🥾' },
    { id: 'Hospedaje', emoji: '🛏️' },
    { id: 'Comercio', emoji: '🛍️' },
    { id: 'Cooperativa', emoji: '🤝' },
    { id: 'Otro', emoji: '⭐' },
  ];
  const MUNICIPIOS_OPCIONES = ['Catemaco', 'San Andrés Tuxtla', 'Santiago Tuxtla'];

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
            <div className="space-y-10 max-w-xl">
              <div>
                <h2 className="font-display font-bold text-2xl sm:text-3xl text-obsidiana-900 mb-5">
                  ¿Cómo se llama tu negocio?
                </h2>
                <input
                  type="text" value={nombreNegocio} onChange={(e) => setNombreNegocio(e.target.value)}
                  placeholder="Ej: Hotel Lago Encantado" autoFocus
                  className="w-full bg-transparent border-0 border-b-2 border-jungle-200 focus:border-jungle-600 px-0 py-3 text-2xl sm:text-3xl font-display text-obsidiana-900 placeholder:text-jungle-300 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <h3 className="font-display font-bold text-xl text-obsidiana-900 mb-4">¿Qué tipo de negocio es?</h3>
                <div className="flex flex-wrap gap-2.5">
                  {CATEGORIAS_OPCIONES.map((c) => (
                    <motion.button key={c.id} whileTap={{ scale: 0.94 }} type="button" onClick={() => setCategoria(c.id)}
                      className={`px-4 py-3 rounded-2xl border-2 font-semibold text-sm flex items-center gap-2 transition-colors ${categoria === c.id ? 'border-jungle-600 bg-jungle-600 text-white' : 'border-jungle-100 bg-white text-obsidiana-800'}`}>
                      <span>{c.emoji}</span> {c.id}
                    </motion.button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-display font-bold text-xl text-obsidiana-900 mb-4">¿En qué municipio está?</h3>
                <div className="flex flex-wrap gap-2.5">
                  {MUNICIPIOS_OPCIONES.map((m) => (
                    <motion.button key={m} whileTap={{ scale: 0.94 }} type="button" onClick={() => setMunicipio(m)}
                      className={`px-5 py-3 rounded-2xl border-2 font-semibold text-sm transition-colors ${municipio === m ? 'border-jungle-600 bg-jungle-600 text-white' : 'border-jungle-100 bg-white text-obsidiana-800'}`}>
                      {m}
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {paso === 'descripcion' && (
            <div className="max-w-xl">
              <div className="flex items-start justify-between gap-4 mb-5">
                <h2 className="font-display font-bold text-2xl sm:text-3xl text-obsidiana-900">
                  Describe tu negocio
                </h2>
                <motion.button whileTap={{ scale: 0.94 }} type="button" onClick={generarDescripcionIA} disabled={generandoDescripcion}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 bg-sun-50 text-sun-700 px-3.5 py-2 rounded-full text-xs font-bold disabled:opacity-50">
                  {generandoDescripcion ? <Loader2 size={13} className="animate-spin" /> : <span>✨</span>}
                  Generar con IA
                </motion.button>
              </div>
              <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                placeholder="¿Qué ofreces? ¿Qué te hace especial?" rows={7}
                className="w-full bg-transparent border-0 border-b-2 border-jungle-200 focus:border-jungle-600 px-0 py-3 text-lg sm:text-xl text-obsidiana-900 placeholder:text-jungle-300 focus:outline-none resize-none transition-colors" />
              <p className="text-xs text-jungle-500 mt-3">Mínimo 20 caracteres — es lo primero que va a leer la gente de tu servicio.</p>
            </div>
          )}

          {paso === 'precio' && (
            <div className="max-w-xl">
              <h2 className="font-display font-bold text-2xl sm:text-3xl text-obsidiana-900 mb-6">
                ¿Cuál es tu rango de precios?
              </h2>
              <div className="flex flex-wrap gap-2.5 mb-2">
                {NIVELES_PRECIO.map((n) => (
                  <motion.button key={n.id} whileTap={{ scale: 0.94 }} type="button" onClick={() => setNivelPrecio(n.id)}
                    className={`px-5 py-3.5 rounded-2xl border-2 font-display font-bold text-lg transition-colors ${nivelPrecio === n.id ? 'border-jungle-600 bg-jungle-600 text-white' : 'border-jungle-100 bg-white text-jungle-800'}`}>
                    {n.simbolo}
                  </motion.button>
                ))}
              </div>
              <p className="text-sm text-jungle-500 mb-8">{NIVELES_PRECIO.find((n) => n.id === nivelPrecio)?.label}</p>
              <div className="flex items-center gap-4">
                <input type="number" min={0} value={precioMin} onChange={(e) => setPrecioMin(e.target.value)} placeholder="Desde"
                  className="w-full bg-transparent border-0 border-b-2 border-jungle-200 focus:border-jungle-600 px-0 py-2 text-2xl font-display text-obsidiana-900 placeholder:text-jungle-300 focus:outline-none transition-colors" />
                <span className="text-jungle-300 text-2xl">—</span>
                <input type="number" min={0} value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} placeholder="Hasta"
                  className="w-full bg-transparent border-0 border-b-2 border-jungle-200 focus:border-jungle-600 px-0 py-2 text-2xl font-display text-obsidiana-900 placeholder:text-jungle-300 focus:outline-none transition-colors" />
              </div>
              {precioMin && precioMax && !Number.isNaN(parseFloat(precioMin)) && !Number.isNaN(parseFloat(precioMax)) && (
                <p className="text-sm text-jungle-500 mt-4">
                  ≈ ${Math.round(parseFloat(precioMin) / TASA_USD_REFERENCIA)} – ${Math.round(parseFloat(precioMax) / TASA_USD_REFERENCIA)} USD (tasa de referencia, no en vivo)
                </p>
              )}
            </div>
          )}

          {/* Antes este paso mezclaba teléfono + mapa + verificación
              de identidad + términos — 4 tareas distintas en una sola
              pantalla, el único que rompía el patrón de "una
              pregunta a la vez" del resto del asistente. Se queda
              solo con lo que ubica al negocio (teléfono + mapa); la
              verificación pasa a su propio paso, ver abajo. */}
          {paso === 'contacto' && (
            <div className="max-w-2xl space-y-10">
              <div>
                <h2 className="font-display font-bold text-2xl sm:text-3xl text-obsidiana-900 mb-5">
                  ¿A qué número te marcamos?
                </h2>
                <input type="tel" inputMode="tel" value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="9521234567"
                  className="w-full bg-transparent border-0 border-b-2 border-jungle-200 focus:border-jungle-600 px-0 py-3 text-2xl sm:text-3xl font-display text-obsidiana-900 placeholder:text-jungle-300 focus:outline-none transition-colors" />
              </div>

              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h2 className="font-display font-bold text-2xl sm:text-3xl text-obsidiana-900">
                    ¿Dónde está?
                  </h2>
                  {/* Reintento manual — además del intento automático
                      al entrar al paso (ver el useEffect de arriba),
                      por si falló, la persona lo descartó, o se movió
                      de lugar mientras llenaba el formulario. */}
                  <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={intentarUbicarme} disabled={buscandoUbicacion}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 bg-jungle-50 hover:bg-jungle-100 text-jungle-700 px-3 py-2 rounded-full text-xs font-bold disabled:opacity-60 transition-colors">
                    {buscandoUbicacion ? <Loader2 size={13} className="animate-spin" /> : <Navigation size={13} />}
                    {buscandoUbicacion ? 'Ubicándote…' : 'Usar mi ubicación actual'}
                  </motion.button>
                </div>
                <p className="text-sm text-jungle-500 mb-1">Toca el mapa donde está tu negocio para colocar el marcador.</p>
                {ubicacionAutoFallo && !ubicacion && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3 mt-2">
                    No pudimos ubicarte automáticamente — márcalo tocando el mapa, o inténtalo de nuevo con el botón de arriba.
                  </p>
                )}
                <div className="rounded-3xl overflow-hidden border-2 border-jungle-200 mt-3" style={{ height: '340px' }}>
                  <Map
                    initialViewState={{ longitude: TUXTLAS_CENTER[1], latitude: TUXTLAS_CENTER[0], zoom: 11 }}
                    minZoom={8}
                    maxZoom={17}
                    mapStyle={ESTILO_MAPA}
                    style={{ width: '100%', height: '100%' }}
                    onClick={(e) => { setUbicacion([e.lngLat.lat, e.lngLat.lng]); setUbicacionGuardada(false); setPrecisionUbicacion(null); }}
                  >
                    {ubicacion && (
                      <Marker longitude={ubicacion[1]} latitude={ubicacion[0]} anchor="bottom">
                        <div className="w-8 h-8 rounded-full bg-jungle-700 border-[3px] border-white shadow-lg flex items-center justify-center text-white text-sm">📍</div>
                      </Marker>
                    )}
                  </Map>
                </div>
                {ubicacion && !ubicacionGuardada && (
                  <motion.button whileTap={{ scale: 0.97 }} type="button" onClick={() => setUbicacionGuardada(true)}
                    className="w-full mt-3 bg-jungle-600 hover:bg-jungle-700 text-white text-sm font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors">
                    <Navigation size={15} /> Guardar ubicación
                  </motion.button>
                )}
                {ubicacionGuardada && (
                  <div className="mt-3 flex items-center gap-2 bg-jungle-50 border border-jungle-200 rounded-2xl px-4 py-3">
                    <CheckCircle2 size={16} className="text-jungle-600 flex-shrink-0" />
                    <p className="text-sm text-jungle-700 font-medium">
                      Ubicación guardada ({ubicacion![0].toFixed(4)}, {ubicacion![1].toFixed(4)})
                      {precisionUbicacion != null && ` · precisión aprox. ±${Math.round(precisionUbicacion)} m`}
                    </p>
                    <button type="button" onClick={() => { setUbicacionGuardada(false); setUbicacion(null); setPrecisionUbicacion(null); }} className="ml-auto text-xs text-jungle-500 underline">cambiar</button>
                  </div>
                )}
              </div>
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
                ) : (
                  <label className="flex items-center justify-center gap-2 border border-dashed border-jungle-300 hover:border-jungle-500 rounded-xl py-4 cursor-pointer text-jungle-600 text-sm font-semibold transition-colors">
                    {subiendoVerificacion ? (
                      <><Loader2 size={16} className="animate-spin" /> Subiendo… {progresoVerificacion}%</>
                    ) : (
                      <><ImagePlus size={16} /> Subir foto de identificación</>
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      disabled={subiendoVerificacion}
                      className="hidden"
                      onChange={(e) => { if (e.target.files?.[0]) subirVerificacion(e.target.files[0]); e.target.value = ''; }}
                    />
                  </label>
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
              <p className="text-sm text-obsidiana-800/60 mb-6 leading-relaxed">
                Nuestro equipo va a validar tu negocio. Guarda este código para consultar el estado:
              </p>
              <div className="inline-flex items-center justify-center gap-2 bg-amate-50 rounded-2xl px-5 py-4 mb-8">
                <span className="font-mono font-bold text-xl tracking-wider text-jungle-800">{codigo}</span>
                <button onClick={() => { navigator.clipboard.writeText(codigo).catch(() => {}); setCopiado(true); }} className="text-jungle-600 hover:text-jungle-800">
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
            {indicePaso > 0 && (
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => irA(ORDEN_PASOS[indicePaso - 1], -1)}
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

// ─────────────── CONSULTAR ESTADO (IndexedDB + Neon) ───────────────
function ConsultarEstado({ onVolver }: { onVolver: () => void }) {
  const [codigoBusqueda, setCodigoBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<any | null | 'no-encontrado'>(null);

  async function buscar() {
    if (codigoBusqueda.trim().length < 4) return;
    setBuscando(true);
    try {
      const local = await buscarPorCodigo(codigoBusqueda.trim().toUpperCase());
      if (local) { setResultado(local); return; }
      try {
        const res = await fetch(`/api/servicios/registro?codigo=${encodeURIComponent(codigoBusqueda.trim().toUpperCase())}`);
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.servicio) {
            setResultado({
              nombreNegocio: data.servicio.nombre,
              categoria: data.servicio.categoria,
              municipio: data.servicio.municipio,
              estado: data.servicio.estado,
              motivoRechazo: data.servicio.motivo_rechazo,
              codigoSeguimiento: data.servicio.codigo_seguimiento,
            });
            return;
          }
        }
      } catch { /* sin internet */ }
      setResultado('no-encontrado');
    } finally {
      setBuscando(false);
    }
  }

  const colores: Record<string, string> = {
    pendiente: 'bg-sun-50 text-sun-700',
    aprobado: 'bg-jungle-50 text-jungle-700',
    rechazado: 'bg-red-50 text-red-700',
  };

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="inline-flex items-center gap-1.5 text-jungle-700 hover:text-jungle-900 text-sm font-medium">
        <ArrowLeft size={16} /> Volver
      </button>

      <div className="bg-white border border-obsidiana-900/8 rounded-2xl p-6">
        <h2 className="font-display font-bold text-lg text-obsidiana-900 mb-1">Consultar mi servicio</h2>
        <p className="text-sm text-obsidiana-800/60 mb-4">Escribe el código de seguimiento que recibiste al registrar tu servicio.</p>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={codigoBusqueda}
            onChange={(e) => setCodigoBusqueda(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="TGO-XXXX"
            className="flex-1 bg-amate-50 rounded-xl px-4 py-3 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-jungle-400 border-0"
            maxLength={8}
          />
          <button onClick={buscar} disabled={buscando || codigoBusqueda.trim().length < 4}
            className="bg-jungle-700 hover:bg-jungle-800 disabled:opacity-40 text-white px-5 rounded-xl font-semibold text-sm transition-colors">
            Buscar
          </button>
        </div>

        {resultado === 'no-encontrado' && (
          <div className="bg-sun-50 border border-sun-200 rounded-xl p-4 text-sm text-sun-800">
            No encontramos ningún servicio con ese código. Revisa que esté bien escrito (ejemplo: TGO-A7B2).
          </div>
        )}

        {resultado && resultado !== 'no-encontrado' && (
          <div className="border border-obsidiana-900/8 rounded-xl p-4">
            <div className="font-display font-bold text-obsidiana-900 mb-1">{resultado.nombreNegocio}</div>
            <div className="text-xs text-obsidiana-800/55 mb-3">{resultado.categoria} · {resultado.municipio}</div>
            <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${colores[resultado.estado] || 'bg-gray-100'}`}>
              {resultado.estado === 'pendiente' ? '⏳ Pendiente' : resultado.estado === 'aprobado' ? '✅ Aprobado' : '❌ Rechazado'}
            </span>
            {resultado.estado === 'pendiente' && <p className="text-sm text-obsidiana-800/60 mt-3">Tu servicio está en revisión. El equipo de TuxtlasGO lo validará pronto.</p>}
            {resultado.estado === 'aprobado' && <p className="text-sm text-jungle-700 mt-3">¡Felicidades! Tu servicio ya está visible en el mapa y en Explorar.</p>}
            {resultado.estado === 'rechazado' && (
              <div className="text-sm text-red-700 mt-3">
                <p>Tu servicio no fue aprobado en esta ocasión.</p>
                {resultado.motivoRechazo && <p className="mt-1"><strong>Motivo:</strong> {resultado.motivoRechazo}</p>}
                <p className="mt-1">Puedes registrarlo de nuevo corrigiendo lo indicado.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}