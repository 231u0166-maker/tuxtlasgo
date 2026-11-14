// ============================================================
// PERFIL DE USUARIO — TuxtlasGO (Módulo 1)
// ============================================================
// Turista:   foto de perfil · nombre · bio · álbum de fotos
// Prestador: foto · todos los campos del servicio (horario,
//            comoLlegar, tip, idealPara) · galería · preview
//
// Favoritos y Rutas NO están aquí — viven en el tab
// "Mis lugares" de AppShell (sin duplicidad).
// Ruta: tab 'perfil' en AppShell  (+ /perfil como URL directa)
// ============================================================

import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Camera, Edit3, Save, Clock, Phone,
  Loader2, CheckCircle2, Store, RefreshCw, ImagePlus, X,
  Link2, DollarSign, BarChart3, Plus, Trash2, Instagram, Facebook,
  MessageCircle, Globe, Calendar, ChevronRight, Search, Share2, Users, Eye, CalendarDays, Utensils, Leaf, Mountain, BedDouble, ShoppingBag, Handshake, Star, MapPin, FileText, Mail, Timer, Route, Lightbulb, PawPrint, Heart, PartyPopper, Compass, Pencil, Check, ShieldCheck, History, Coins, Lock, type LucideIcon } from 'lucide-react';
import { getToken, getUsuarioLocal, setUsuarioLocal, type UsuarioSesion } from '../lib/auth';
import { subirFoto, type ProgresoSubida } from '../lib/cloudinary';
import { servicioComoLugar } from '../lib/db';
import GestorFotos from './GestorFotos';
import GraficaMini from './GraficaMini';
import type { Lugar } from '../data/lugares';
import { CATEGORIAS } from '../data/lugares';
import { recargarCatalogo } from '../arranque';
import { useT } from '../lib/i18n';
import { optimizarImagen, ANCHO_TARJETA } from '../lib/imagenOptimizada';
import SelectorIdioma from './SelectorIdioma';
import { TIPOS_ENLACE, ID_ENLACE_AUTOMATICO, nuevoEnlaceId, parseEnlaces, normalizarEnlace, textoCortoEnlace, type EnlaceServicio, type TipoEnlace } from '../lib/enlaces';
import LogoRed from './LogoRed';
import PlaceDetail from './PlaceDetail';
import { useHojaArrastrable } from '../lib/useHojaArrastrable';
import ChatReservacion from './ChatReservacion';
import TarjetaRechazo from './TarjetaRechazo';
import ResumenHorario from './ResumenHorario';

// Pesados o poco usados: se cargan solo cuando se abre su formulario (code splitting).
const EditorDescripcion = lazy(() => import('./EditorDescripcion'));
const SelectorRangoPrecio = lazy(() => import('./SelectorRangoPrecio'));
const EditorHorarioSemanal = lazy(() => import('./EditorHorarioSemanal'));
const CalendarioReservas = lazy(() => import('./CalendarioReservas'));
// Bloc de notas en versión baja: cómo llegar, consejo, mascotas.
function NotaCompacta({ titulo, value, onChange, max, placeholder }: { titulo: string; value: string; onChange: (v: string) => void; max: number; placeholder: string }) {
  return (
    <Suspense fallback={<CargandoCampo alto={176} />}>
      <EditorDescripcion compacto titulo={titulo} value={value} onChange={onChange} max={max} placeholder={placeholder} />
    </Suspense>
  );
}
const CargandoCampo = ({ alto = 160 }: { alto?: number }) => (
  <div className="flex-1 rounded-2xl bg-jungle-50 animate-pulse" style={{ minHeight: alto }} aria-hidden="true" />
);
import { semanaDesdeTextos, semanaValida, textosDeSemana, semanaVacia, type Semana } from '../lib/horario';
import { formatearPrecio, parsearPrecio, type NivelPrecio } from '../lib/precio';
import { motion, AnimatePresence } from 'motion/react';
import { ESTADOS_MEXICO, MUNICIPIOS_TUXTLAS, componerMunicipio, separarMunicipio } from '../data/estados';

// ─────────────── TIPOS ───────────────
interface ServicioAPI {
  id: number;
  nombre: string;
  categoria: string;
  municipio: string;
  descripcion: string;
  precio: string;
  contacto: string;
  lat: number;
  lng: number;
  estado: string;
  codigo_seguimiento: string;
  motivo_rechazo?: string;
  fotos?: string[] | string;
  horario?: string;
  dias_abierto?: string;
  horario_semanal?: unknown; // JSON: 7 días con tramos [inicio, fin] en minutos
  fotos_pies?: unknown;      // JSON: texto debajo de cada foto, { url: texto }
  duracion?: string;
  como_llegar?: string;
  tip?: string;
  mascotas?: string;
  ideal_para?: string[] | string;
  enlaces?: EnlaceServicio[] | string;
  creado_en?: string;
  premium?: boolean;
  premium_desde?: string;
  premium_hasta?: string;
  cuenta_cobro?: { tipo: 'mercadopago' | 'paypal'; correo: string } | null;
  mp_conectado?: boolean;
  mp_user_id?: string;
  acepta_reservaciones?: boolean;
  politica_cancelacion?: 'flexible' | 'no_reembolsable';
  fechas_bloqueadas?: string[];
  monto_minimo?: number | null;
  mostrar_usd_reservacion?: boolean;
}

// Respuesta de GET /api/servicios/editar?recurso=estadisticas —
// Bug: "Ganancias y estadísticas" mostraba un $0.00 fijo y ninguna
// gráfica. Ahora viene de eventos_servicio + pagos_reservacion reales.
interface EstadisticasServicio {
  ganancias: number;
  reservasPagadas: number;
  vistas: number;
  likes: number;
  iaRecomendaciones: number;
  porcentajeLike: number;
  serie: { dia: string; vistas: number; likes: number; ia_recomendaciones: number }[];
}

// Formato de moneda completo (con centavos) para Ganancias —
// separado de formatearMXN() de chatbot.ts, que redondea para el
// chat; aquí sí importa el detalle exacto de a cuánto asciende.
function formatearMXNCompleto(monto: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto) + ' MXN';
}

interface ReservacionPrestador {
  id: number;
  fecha: string;
  nombre_viajero: string;
  numero_personas: number;
  presupuesto?: string;
  notas?: string;
  estado: 'pendiente' | 'confirmada' | 'rechazada' | 'cancelada';
  politica: string;
  pago_estado?: 'sin_pagar' | 'pendiente' | 'pagado';
  pago_vencimiento?: string | null;
  creado_en: string;
  turista_nombre: string;
  turista_correo: string;
  servicio_nombre: string;
  mensajes_no_leidos?: number;
}

interface FormServicio {
  nombre: string;
  categoria: string;
  municipio: string;
  descripcion: string;
  precio: string;
  contacto: string;
  horario: string;
  dias_abierto: string;
  horario_semanal: Semana; // horario por día (el calendario); horario/dias_abierto son sus textos
  duracion: string;
  como_llegar: string;
  tip: string;
  mascotas: string;
  ideal_para: string[];
}

interface FormUsuario {
  nombre: string;
  bio: string;
}

const IDEAL_OPCIONES = [
  { id: 'pareja',  label: '💕 Parejas' },
  { id: 'familia', label: '👨‍👩‍👧 Familias' },
  { id: 'grupos',  label: '🎉 Grupos' },
  { id: 'solo',    label: '🧭 Viajeros solos' },
];

const COLORES_ESTADO: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-800',
  aprobado:  'bg-green-100 text-green-800',
  rechazado: 'bg-red-100   text-red-700',
};

function parseFotos(raw: string[] | string | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

function parseIdeal(raw: string[] | string | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

// Deriva el form editable a partir del servicio guardado — se usa al
// cargar Y cada vez que se abre un modal de edición, para que "Editar"
// siempre parta de los datos reales (nunca de un borrador abandonado
// de otro modal que se haya cancelado).
function formDesdeServicio(srv: ServicioAPI): FormServicio {
  return {
    nombre:      srv.nombre      ?? '',
    categoria:   srv.categoria   ?? '',
    municipio:   srv.municipio   ?? '',
    descripcion: srv.descripcion ?? '',
    precio:      srv.precio      ?? '',
    contacto:    srv.contacto    ?? '',
    horario:     srv.horario     ?? '',
    dias_abierto: srv.dias_abierto ?? '',
    horario_semanal: semanaValida(srv.horario_semanal) ?? semanaDesdeTextos(srv.horario, srv.dias_abierto),
    duracion:    srv.duracion    ?? '',
    como_llegar: srv.como_llegar ?? '',
    tip:         srv.tip         ?? '',
    mascotas:    srv.mascotas    ?? '',
    ideal_para:  parseIdeal(srv.ideal_para),
  };
}

// ─────────────── ENTRADA ───────────────
interface Props {
  onVolver: () => void;
  // Antes, iniciar/cerrar sesión en móvil solo vivía en el menú "⋮"
  // flotante de arriba (ver AppShell.tsx) — al quitar ese menú para
  // simplificar, esta pantalla necesita poder hacerlo por su cuenta,
  // si no, no habría ninguna forma de entrar/salir de la cuenta
  // desde el teléfono.
  onIniciarSesion?: () => void;
  onCerrarSesion?: () => void;
}

export default function PerfilScreen({ onVolver, onIniciarSesion, onCerrarSesion }: Props) {
  const t = useT();
  const usuario = getUsuarioLocal();

  if (!usuario) {
    return (
      <div className="min-h-screen bg-jungle-50 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-jungle-600 mb-4 font-medium">
            {t('Inicia sesión para ver tu perfil.')}
          </p>
          <button
            onClick={onIniciarSesion ?? onVolver}
            className="bg-jungle-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold"
          >
            {t('Iniciar sesión')}
          </button>
          <Link
            to="/prestador"
            className="block mt-3 text-sm font-semibold text-jungle-700 underline underline-offset-2"
          >
            {t('Soy prestador')}
          </Link>
          <div className="mt-6 flex justify-center">
            <SelectorIdioma />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Cerrar sesión — solo móvil (en escritorio ya vive en el
          riel lateral, duplicarlo ahí no aporta). */}
      {onCerrarSesion && (
        <button
          onClick={onCerrarSesion}
          className="lg:hidden absolute top-3 right-3 z-20 bg-white/90 backdrop-blur shadow-sm rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-100"
        >
          {t('Cerrar sesión')}
        </button>
      )}
      {usuario.tipo === 'prestador'
        ? <PerfilPrestador usuario={usuario} onVolver={onVolver} />
        : <PerfilTurista usuario={usuario} onVolver={onVolver} />}
    </div>
  );
}

// ============================================================
// PERFIL TURISTA — simplificado
// Tiene: foto de perfil · nombre · bio · álbum de fotos
// ============================================================
function PerfilTurista({
  usuario,
  onVolver,
}: {
  usuario: UsuarioSesion;
  onVolver: () => void;
}) {
  const t = useT();
  const [editando, setEditando]     = useState(false);
  const [guardando, setGuardando]   = useState(false);
  const [form, setForm]             = useState<FormUsuario>({ nombre: usuario.nombre, bio: '' });
  const [fotoSubiendo, setFotoSubiendo] = useState(false);
  const [fotoPerfil, setFotoPerfil] = useState(usuario.foto_url ?? '');
  // Álbum de fotos del turista
  const [album, setAlbum]           = useState<string[]>([]);
  const [subiendoAlbum, setSubiendoAlbum] = useState(false);
  const inputFotoRef    = useRef<HTMLInputElement>(null);
  const inputAlbumRef   = useRef<HTMLInputElement>(null);
  // Enlace con Comunidad — antes lo que subías aquí se quedaba solo
  // en tu perfil, sin ninguna forma de que apareciera también en el
  // feed de Comunidad. Ahora das la opción al subir, o desde cada
  // foto ya subida.
  const [compartirEnComunidad, setCompartirEnComunidad] = useState(true);
  const [fotosCompartidas, setFotosCompartidas] = useState<Set<string>>(new Set());
  const [compartiendoUrl, setCompartiendoUrl] = useState<string | null>(null);

  // Cargar bio y fotos desde el servidor
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch('/api/auth/perfil', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setForm({ nombre: d.usuario.nombre, bio: d.usuario.bio ?? '' });
          setAlbum(parseFotos(d.usuario.fotos));
          if (d.usuario.foto_url) setFotoPerfil(d.usuario.foto_url);
        }
      })
      .catch(() => {});
  }, []);

  // Guarda nombre y bio
  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch('/api/auth/perfil', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        setUsuarioLocal({ ...usuario, nombre: data.usuario.nombre });
        setEditando(false);
      }
    } catch { /* sin conexión */ }
    setGuardando(false);
  }

  // Sube foto de perfil
  async function cambiarFotoPerfil(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoSubiendo(true);
    try {
      const url = await new Promise<string>((resolve, reject) => {
        subirFoto(file, `turista-${usuario.id}`, (p: ProgresoSubida) => {
          if (p.url) resolve(p.url);
          if (p.error) reject(new Error(p.error));
        });
      });
      await fetch('/api/auth/perfil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ foto_url: url }),
      });
      setFotoPerfil(url);
      setUsuarioLocal({ ...usuario, foto_url: url });
    } catch { /* error subida */ }
    setFotoSubiendo(false);
    e.target.value = '';
  }

  // Publica una foto del álbum en el feed de Comunidad (POST directo
  // a comunidad_posts) — es el enlace que faltaba entre "Mis fotos"
  // del perfil y el feed público de Comunidad.
  async function compartirFotoEnComunidad(url: string) {
    setCompartiendoUrl(url);
    try {
      const res = await fetch('/api/comunidad/publicaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ imagen_url: url }),
      });
      const data = await res.json();
      if (data.ok) setFotosCompartidas((s) => new Set(s).add(url));
    } catch { /* sin conexión — se puede reintentar desde el botón */ }
    setCompartiendoUrl(null);
  }

  // Sube foto al álbum
  async function agregarAlAlbum(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoAlbum(true);
    try {
      const url = await new Promise<string>((resolve, reject) => {
        subirFoto(file, `album-${usuario.id}`, (p: ProgresoSubida) => {
          if (p.url) resolve(p.url);
          if (p.error) reject(new Error(p.error));
        });
      });
      const nuevasfotos = [...album, url];
      setAlbum(nuevasfotos);
      // Guarda en el servidor
      await fetch('/api/auth/perfil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ fotos: JSON.stringify(nuevasfotos) }),
      });
      // Con la casilla activada, la misma foto queda enlazada también
      // en Comunidad — sin subirla dos veces.
      if (compartirEnComunidad) await compartirFotoEnComunidad(url);
    } catch { /* error subida */ }
    setSubiendoAlbum(false);
    e.target.value = '';
  }

  // Elimina foto del álbum
  async function eliminarFotoAlbum(url: string) {
    const nuevasfotos = album.filter(f => f !== url);
    setAlbum(nuevasfotos);
    await fetch('/api/auth/perfil', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ fotos: JSON.stringify(nuevasfotos) }),
    }).catch(() => {});
  }

  const iniciales = usuario.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-jungle-50 pb-10">
      {/* Header */}
      <div className="bg-gradient-to-br from-jungle-800 to-jungle-950 px-4 pt-5 pb-24">
        <div className="flex items-center justify-between">
          <button onClick={onVolver} className="flex items-center gap-1 text-jungle-200 hover:text-white text-sm">
            <ArrowLeft size={16} /> {t('Inicio')}
          </button>
          <span className="text-xs bg-jungle-700 text-jungle-200 px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide">
            {t('Turista')}
          </span>
        </div>
      </div>

      {/* Avatar centrado flotante */}
      <div className="flex flex-col items-center -mt-16 mb-5 px-4">
        <div className="relative mb-3">
          {fotoPerfil ? (
            <img
              src={fotoPerfil}
              alt={usuario.nombre}
              className="w-24 h-24 rounded-full border-4 border-white object-cover shadow-lg"
            />
          ) : (
            <div className="w-24 h-24 rounded-full border-4 border-white bg-jungle-600 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-2xl">{iniciales}</span>
            </div>
          )}
          <button
            onClick={() => inputFotoRef.current?.click()}
            disabled={fotoSubiendo}
            className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full shadow flex items-center justify-center border border-jungle-100"
          >
            {fotoSubiendo
              ? <Loader2 size={14} className="animate-spin text-jungle-600" />
              : <Camera size={14} className="text-jungle-700" />
            }
          </button>
          <input ref={inputFotoRef} type="file" accept="image/*" className="hidden" onChange={cambiarFotoPerfil} />
        </div>

        {/* Nombre — centrado, wrapping correcto */}
        {editando ? (
          <input
            value={form.nombre}
            onChange={e => setForm({ ...form, nombre: e.target.value })}
            className="font-display font-bold text-xl text-jungle-950 border-b-2 border-jungle-400 bg-transparent focus:outline-none text-center w-full max-w-xs"
          />
        ) : (
          <h1 className="font-display font-bold text-xl text-jungle-950 text-center leading-snug max-w-xs">
            {form.nombre}
          </h1>
        )}
        <p className="text-sm text-jungle-500 mt-0.5">{usuario.correo}</p>
      </div>

      {/* Bio + editar */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-2xl border border-jungle-100 p-4">
          {editando ? (
            <>
              <label className="text-xs font-semibold text-jungle-600 mb-1.5 block">{t('Sobre mí')}</label>
              <textarea
                value={form.bio}
                onChange={e => setForm({ ...form, bio: e.target.value })}
                placeholder={t('Cuéntales a los demás sobre ti…')}
                rows={3}
                maxLength={300}
                className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 resize-none"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={guardar}
                  disabled={guardando}
                  className="flex-1 bg-jungle-700 hover:bg-jungle-800 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                >
                  {guardando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  {t('Guardar')}
                </button>
                <button
                  onClick={() => setEditando(false)}
                  className="px-4 bg-jungle-100 hover:bg-jungle-200 text-jungle-700 py-2.5 rounded-xl text-sm font-semibold"
                >
                  {t('Cancelar')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-jungle-700 leading-relaxed">
                {form.bio || (
                  <span className="text-jungle-400 italic">{t('Sin descripción todavía. ¡Cuéntanos sobre ti!')}</span>
                )}
              </p>
              <button
                onClick={() => setEditando(true)}
                className="mt-3 flex items-center gap-1.5 text-xs text-jungle-600 hover:text-jungle-900 font-semibold"
              >
                <Edit3 size={12} /> {t('Editar perfil')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Idioma — el único lugar en móvil para cambiarlo sin salir de la app */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-2xl border border-jungle-100 p-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-jungle-900">{t('Idioma')}</span>
          <SelectorIdioma />
        </div>
      </div>

      {/* Álbum de fotos */}
      <div className="px-4">
        <div className="bg-white rounded-2xl border border-jungle-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-jungle-900 text-sm">{t('📷 Mis fotos')}</h2>
            <button
              onClick={() => inputAlbumRef.current?.click()}
              disabled={subiendoAlbum}
              className="flex items-center gap-1.5 text-xs font-semibold text-jungle-600 hover:text-jungle-900 bg-jungle-50 px-3 py-1.5 rounded-full border border-jungle-100"
            >
              {subiendoAlbum
                ? <Loader2 size={13} className="animate-spin" />
                : <ImagePlus size={13} />
              }
              {subiendoAlbum ? t('Subiendo…') : t('Agregar')}
            </button>
            <input ref={inputAlbumRef} type="file" accept="image/*" className="hidden" onChange={agregarAlAlbum} />
          </div>

          {/* Enlace con Comunidad — se puede desactivar si alguna foto
              quieres que quede solo en tu perfil. */}
          <label className="flex items-center gap-2 mb-3 text-xs text-jungle-600 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={compartirEnComunidad}
              onChange={(e) => setCompartirEnComunidad(e.target.checked)}
              className="rounded border-jungle-300 text-jungle-700 focus:ring-jungle-400"
            />
            <Users size={13} className="text-jungle-400" />
            {t('Compartir también en la Comunidad al subir')}
          </label>

          {album.length === 0 ? (
            <div className="text-center py-8 text-jungle-300">
              <ImagePlus size={32} className="mx-auto mb-2" />
              <p className="text-sm text-jungle-400">{t('Aún no tienes fotos. ¡Comparte tu experiencia en Los Tuxtlas!')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {album.map((url, i) => {
                const compartida = fotosCompartidas.has(url);
                return (
                  <div key={i} className="relative aspect-square group">
                    <img src={url} alt="" className="w-full h-full object-cover rounded-xl" />
                    <button
                      onClick={() => eliminarFotoAlbum(url)}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center"
                      aria-label={t('Eliminar foto')}
                    >
                      <X size={12} className="text-white" />
                    </button>
                    {/* Publicar (o confirmar que ya está) en Comunidad
                        directo desde una foto que ya subiste antes. */}
                    <button
                      onClick={() => !compartida && compartirFotoEnComunidad(url)}
                      disabled={compartida || compartiendoUrl === url}
                      className={`absolute bottom-1 left-1 flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full ${
                        compartida ? 'bg-jungle-700 text-white' : 'bg-black/50 text-white hover:bg-black/70'
                      }`}
                      title={compartida ? t('Ya está en la Comunidad') : t('Compartir en la Comunidad')}
                    >
                      {compartiendoUrl === url
                        ? <Loader2 size={11} className="animate-spin" />
                        : compartida
                          ? <CheckCircle2 size={11} />
                          : <Share2 size={11} />
                      }
                      {compartida ? t('En Comunidad') : t('Compartir')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PERFIL PRESTADOR
// ============================================================
// Centro de Prestador: 4 secciones (shell — Servicio ya funciona
// igual que antes; Enlaces guarda de verdad; Ganancias y
// Estadísticas muestran solo datos reales, nada de lógica de pagos
// todavía — ver MEJORAS DISEÑO PANEL PRESTADOR).
// Antes eran 2 niveles (Servicio/Información externa arriba, y Mi
// Servicio/Fotos/Preview/Reservaciones debajo, solo bajo "Servicio")
// — redundante y confuso ("Servicio" y "Mi Servicio" a la vez). Ahora
// es una sola fila con las 5 secciones.
type TabPrincipal = 'servicio' | 'fotos' | 'reservaciones' | 'externa';

function PerfilPrestador({
  usuario,
  onVolver,
}: {
  usuario: UsuarioSesion;
  onVolver: () => void;
}) {
  const [tab, setTab] = useState<TabPrincipal>('servicio');
  // En celular el perfil abre en un menú de tarjetas y cada una abre su sección
  // sola (abierta = true). En PC (lg) el menú es una columna lateral y esto no aplica.
  const [abierta, setAbierta] = useState(false);
  const zonaSeccionRef = useRef<HTMLDivElement>(null);
  const [servicio, setServicio]   = useState<ServicioAPI | null>(null);
  const [fotos, setFotos]         = useState<string[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState('');
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito]         = useState(false);
  const [enlaces, setEnlaces]     = useState<EnlaceServicio[]>([]);
  // Contacto estructurado de "Precio y contacto": teléfono (marca desde el celular),
  // si ese número también tiene WhatsApp, y correo. WhatsApp y correo se guardan como
  // enlaces con id fijo (wa-contacto / correo-contacto) para no tocar la base de datos.
  const [contactoForm, setContactoForm] = useState({ telefono: '', whatsapp: false, correo: '' });
  const [guardandoEnlaces, setGuardandoEnlaces] = useState(false);
  const [nuevoTipoEnlace, setNuevoTipoEnlace] = useState<TipoEnlace | null>(null);
  const [nuevaUrlEnlace, setNuevaUrlEnlace] = useState('');
  const [editandoEnlace, setEditandoEnlace] = useState<string | null>(null);
  const [textoEditando, setTextoEditando] = useState('');
  // Vista previa: la ficha REAL (PlaceDetail) tal como la ve el turista.
  const [vistaPrevia, setVistaPrevia] = useState<Lugar | null>(null);
  const [mostrarResumen, setMostrarResumen] = useState(false);
  const [mensajePremium, setMensajePremium] = useState<{ tipo: 'exito' | 'error' | 'pendiente'; texto: string } | null>(null);
  // Ganancias totales — solo el monto, para la tarjeta resumen de
  // arriba (antes era un $0.00 fijo). El detalle completo con
  // gráficas vive en PanelResumenPrestador cuando se abre el modal.
  const [gananciasTotales, setGananciasTotales] = useState<number | null>(null);
  const [form, setForm]           = useState<FormServicio>({
    nombre: '', categoria: '', municipio: '', descripcion: '',
    precio: '', contacto: '', horario: '', dias_abierto: '', horario_semanal: semanaVacia(),
    duracion: '', como_llegar: '', tip: '', mascotas: '', ideal_para: [],
  });
  // Qué modal de edición está abierto — antes era un solo booleano
  // ("editando") que revelaba TODO el formulario de golpe (12+ campos
  // de una sola pasada, ver captura del usuario). Ahora cada sección
  // se edita en su propio modal, como el de "Iniciar sesión".
  const [modalEditar, setModalEditar] = useState<'basica' | 'precio' | 'detalles' | null>(null);

  async function cargar() {
    setCargando(true);
    setError('');
    const token = getToken();
    if (!token) { setError('Sin sesión activa.'); setCargando(false); return; }
    try {
      const res = await fetch('/api/auth/perfil', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok && data.servicio) {
        const srv = {
          ...data.servicio,
          estado: (data.servicio.estado ?? '').trim().toLowerCase(),
        };
        setServicio(srv);
        setFotos(parseFotos(srv.fotos));
        setEnlaces(parseEnlaces(srv.enlaces));
        setForm(formDesdeServicio(srv));
      } else {
        setServicio(null);
      }
    } catch {
      setError('Sin conexión. Verifica tu internet.');
    }
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  // Carga ligera solo del monto de ganancias, para la tarjeta
  // resumen — se pide una vez que ya sabemos que hay un servicio
  // (antes de eso no tiene sentido pedir estadísticas de nada).
  useEffect(() => {
    if (!servicio) return;
    let cancelado = false;
    fetch('/api/servicios/editar?recurso=estadisticas', { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(d => { if (!cancelado && d.ok) setGananciasTotales(d.ganancias); })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [servicio?.id]);

  useEffect(() => {
    if (tab !== 'reservaciones') return;
    cargarReservacionesEntrantes();
    const intervalo = setInterval(() => cargarReservacionesEntrantes(true), 8000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Regreso del checkout de Mercado Pago (?premium=exito|error|pendiente).
  // El webhook es quien realmente activa Premium, no esto — esto solo
  // muestra el mensaje correcto y refresca por si el webhook ya llegó.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resultado = params.get('premium');
    if (!resultado) return;
    if (resultado === 'exito') setMensajePremium({ tipo: 'exito', texto: 'Pago recibido — activando tu Premium…' });
    else if (resultado === 'pendiente') setMensajePremium({ tipo: 'pendiente', texto: 'Tu pago está pendiente de confirmación (normal con SPEI/OXXO). Se activará solo cuando se confirme.' });
    else if (resultado === 'error') setMensajePremium({ tipo: 'error', texto: 'El pago no se completó. Puedes intentarlo de nuevo cuando quieras.' });
    params.delete('premium');
    window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`);
    if (resultado === 'exito') setTimeout(cargar, 2500); // le da tiempo al webhook de llegar
  }, []);

  // Regreso de la autorización OAuth de Mercado Pago (?mp_conectado=exito|error).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resultado = params.get('mp_conectado');
    if (!resultado) return;
    if (resultado === 'exito') setMensajePremium({ tipo: 'exito', texto: 'Tu cuenta de Mercado Pago quedó conectada.' });
    else setMensajePremium({ tipo: 'error', texto: 'No se pudo conectar tu cuenta de Mercado Pago. Intenta de nuevo.' });
    params.delete('mp_conectado');
    window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`);
    // Regresa a la pestaña desde la que se inició la conexión (ver
    // conectarMercadoPago) en vez de dejar al prestador siempre en
    // "Mi Servicio" sin importar de dónde vino.
    const tabRetorno = sessionStorage.getItem('tuxtlasgo_prestador_tab_retorno');
    if (tabRetorno) {
      sessionStorage.removeItem('tuxtlasgo_prestador_tab_retorno');
      setTab(tabRetorno as TabPrincipal);
      setAbierta(true);
    }
    cargar();
  }, []);

  const [reenviando, setReenviando] = useState(false);
  async function reenviarARevision() {
    setReenviando(true);
    try {
      const res = await fetch('/api/servicios/editar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ reenviar_revision: true }),
      });
      const data = await res.json();
      if (data.ok) setServicio((s) => (s ? { ...s, ...data.servicio } : s));
      else alert(data.error ?? 'No se pudo reenviar');
    } catch {
      alert('Sin conexión. Verifica tu internet.');
    }
    setReenviando(false);
  }

  function guardar() { return guardarCon(); }

  async function guardarCon(extra: Record<string, unknown> = {}) {
    const { estado: estadoForm, municipio: muniForm } = separarMunicipio(form.municipio);
    if (form.municipio && muniForm.trim().length < 2) {
      alert('Escribe el municipio o ciudad donde está tu negocio.');
      return;
    }
    setGuardando(true);
    setExito(false);
    try {
      const res = await fetch('/api/servicios/editar', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          ...form,
          municipio: form.municipio ? componerMunicipio(estadoForm, muniForm.trim()) : form.municipio,
          ...extra,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const srv = {
          ...data.servicio,
          estado: (data.servicio.estado ?? servicio?.estado ?? '').trim().toLowerCase(),
        };
        setServicio(srv);
        if (Array.isArray(extra.enlaces)) setEnlaces(extra.enlaces as EnlaceServicio[]);
        setModalEditar(null);
        setExito(true);
        setTimeout(() => setExito(false), 9000);
        // Actualiza el catálogo en tiempo real — el turista ve los cambios de inmediato
        recargarCatalogo().catch(() => {});
      } else {
        alert(data.error ?? 'Error al guardar');
      }
    } catch {
      alert('Sin conexión. Verifica tu internet.');
    }
    setGuardando(false);
  }

  // Refresca el form desde el servicio real antes de abrir cualquier
  // modal — así "Cancelar" nunca deja un campo a medio escribir de
  // una sección filtrándose al guardar otra (el PATCH manda el form
  // completo, aunque solo se haya tocado una sección).
  function abrirModal(seccion: 'basica' | 'precio' | 'detalles') {
    if (servicio) {
      setForm(formDesdeServicio(servicio));
      const actual = servicio.contacto ?? '';
      const eraCorreo = actual.includes('@');
      const correoGuardado = enlaces.find((e) => e.id === 'correo-contacto')?.url.replace(/^mailto:/i, '') ?? '';
      setContactoForm({
        telefono: eraCorreo ? '' : actual,
        whatsapp: enlaces.some((e) => e.id === 'wa-contacto'),
        correo: correoGuardado || (eraCorreo ? actual : ''),
      });
    }
    setModalEditar(seccion);
  }

  function guardarPrecioContacto() {
    const tel = contactoForm.telefono.trim();
    const correo = contactoForm.correo.trim();
    const digitos = tel.replace(/\D/g, '');
    if (!tel && !correo) { alert('Deja un teléfono o un correo para que te contacten.'); return; }
    if (tel && !/^\+?[\d\s-]{10,15}$/.test(tel)) { alert('El teléfono debe tener 10 dígitos.'); return; }
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { alert('Revisa el correo electrónico.'); return; }
    if (contactoForm.whatsapp && !tel) { alert('Para ligar WhatsApp escribe tu teléfono.'); return; }
    const wa = digitos.length === 10 ? '52' + digitos : digitos;
    const nuevos: EnlaceServicio[] = enlaces.filter((e) => e.id !== 'wa-contacto' && e.id !== 'correo-contacto');
    if (contactoForm.whatsapp) nuevos.push({ id: 'wa-contacto', tipo: 'whatsapp', url: `https://wa.me/${wa}` });
    if (correo) nuevos.push({ id: 'correo-contacto', tipo: 'correo', url: `mailto:${correo}` });
    return guardarCon({ contacto: tel || correo, enlaces: nuevos });
  }

  // Guarda el horario por día y, junto, los dos textos de siempre (horario / dias_abierto)
  // para que fichas, asistente y todo lo que ya los leía como texto sigan igual.
  function guardarDetalles() {
    const textos = textosDeSemana(form.horario_semanal);
    setForm((f) => ({ ...f, ...textos }));
    return guardarCon({ ...textos, horario_semanal: form.horario_semanal });
  }

  function toggleIdeal(id: string) {
    setForm(f => ({
      ...f,
      ideal_para: f.ideal_para.includes(id)
        ? f.ideal_para.filter(x => x !== id)
        : [...f.ideal_para, id],
    }));
  }

  async function guardarEnlaces() {
    setGuardandoEnlaces(true);
    try {
      const res = await fetch('/api/servicios/editar', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ enlaces }),
      });
      const data = await res.json();
      if (data.ok) {
        setServicio(s => (s ? { ...s, enlaces: data.servicio.enlaces } : s));
        recargarCatalogo().catch(() => {});
      } else {
        alert(data.error ?? 'Error al guardar');
      }
    } catch {
      alert('Sin conexión. Verifica tu internet.');
    }
    setGuardandoEnlaces(false);
  }

  const [conectandoMp, setConectandoMp] = useState(false);
  async function conectarMercadoPago() {
    setConectandoMp(true);
    try {
      const res = await fetch('/api/pagos/mercadopago?accion=conectar', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.ok && data.url) {
        // Recuerda desde qué pestaña salió — Mercado Pago ahora
        // también se puede conectar desde Reservaciones (ver abajo),
        // no solo desde Enlaces y pagos, y sin esto el regreso del
        // OAuth siempre aterrizaba en "Mi Servicio" (la pestaña por
        // default), perdiendo el hilo de lo que se estaba haciendo.
        sessionStorage.setItem('tuxtlasgo_prestador_tab_retorno', tab);
        window.location.href = data.url; // a la pantalla de autorización de Mercado Pago
      } else {
        alert(data.error ?? 'No se pudo iniciar la conexión con Mercado Pago');
        setConectandoMp(false);
      }
    } catch {
      alert('Sin conexión. Verifica tu internet.');
      setConectandoMp(false);
    }
  }

  async function desconectarMercadoPago() {
    if (!confirm('¿Desconectar tu cuenta de Mercado Pago? Ya no podrás recibir el reparto automático de reservaciones hasta que la conectes de nuevo.')) return;
    try {
      const res = await fetch('/api/pagos/mercadopago?accion=desconectar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.ok) setServicio(s => (s ? { ...s, mp_conectado: false, mp_user_id: undefined } : s));
      else alert(data.error ?? 'No se pudo desconectar');
    } catch {
      alert('Sin conexión. Verifica tu internet.');
    }
  }

  // ── Reservaciones (pieza 2) ──────────────────────────────────
  const [reservacionesEntrantes, setReservacionesEntrantes] = useState<ReservacionPrestador[] | null>(null);
  const [cargandoReservaciones, setCargandoReservaciones] = useState(false);
  const [guardandoReservConfig, setGuardandoReservConfig] = useState(false);
  const [nuevaFechaBloqueada, setNuevaFechaBloqueada] = useState('');
  const [chatAbierto, setChatAbierto] = useState<{ id: number; nombre: string } | null>(null);

  // `background = true` en los refrescos automáticos del polling: no
  // vuelve a mostrar el loader ni desmonta la lista de Solicitudes —
  // antes cada refresco de 8s ponía cargando=true, la lista entera
  // desaparecía y volvía a aparecer, y eso era el "cambio cambio"
  // molesto que se reportó (no un problema de datos, solo del loader
  // parpadeando en cada poll).
  async function cargarReservacionesEntrantes(background = false) {
    if (!background) setCargandoReservaciones(true);
    try {
      const res = await fetch('/api/reservaciones', { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.ok) setReservacionesEntrantes(data.reservaciones);
    } catch { /* sin conexión */ }
    if (!background) setCargandoReservaciones(false);
  }

  async function actualizarConfigReservaciones(cambios: {
    acepta_reservaciones?: boolean;
    politica_cancelacion?: string;
    fechas_bloqueadas?: string[];
    monto_minimo?: number | null;
    mostrar_usd_reservacion?: boolean;
    eliminar_reservaciones?: boolean;
  }): Promise<boolean> {
    setGuardandoReservConfig(true);
    let exito = false;
    try {
      const res = await fetch('/api/servicios/editar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(cambios),
      });
      const data = await res.json();
      if (data.ok) {
        setServicio(s => (s ? { ...s, ...data.servicio } : s));
        recargarCatalogo().catch(() => {}); // el turista debe ver el cambio sin recargar la app
        exito = true;
      } else {
        alert(data.error ?? 'No se pudo guardar');
      }
    } catch {
      alert('Sin conexión. Verifica tu internet.');
    }
    setGuardandoReservConfig(false);
    return exito;
  }

  // Acepta una fecha directa (click en el calendario) o usa el input
  // de texto si no se pasa ninguna — así sirve para ambos flujos.
  function agregarFechaBloqueada(fechaDirecta?: string) {
    const objetivo = fechaDirecta ?? nuevaFechaBloqueada;
    if (!objetivo || !servicio) return;
    const actuales = servicio.fechas_bloqueadas ?? [];
    if (actuales.includes(objetivo)) { if (!fechaDirecta) setNuevaFechaBloqueada(''); return; }
    const nuevas = [...actuales, objetivo].sort();
    actualizarConfigReservaciones({ fechas_bloqueadas: nuevas });
    if (!fechaDirecta) setNuevaFechaBloqueada('');
  }

  function quitarFechaBloqueada(fecha: string) {
    if (!servicio) return;
    const nuevas = (servicio.fechas_bloqueadas ?? []).filter(f => f !== fecha);
    actualizarConfigReservaciones({ fechas_bloqueadas: nuevas });
  }

  async function responderReservacion(id: number, accion: 'confirmar' | 'rechazar') {
    try {
      const res = await fetch('/api/reservaciones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ id, accion }),
      });
      const data = await res.json();
      if (data.ok) {
        setReservacionesEntrantes(prev => prev?.map(r => r.id === id ? { ...r, estado: data.estado } : r) ?? null);
        if (accion === 'confirmar') {
          // Al confirmar se bloqueó la fecha en automático del lado
          // del servidor — recarga el servicio para reflejar
          // fechas_bloqueadas actualizado, y el catálogo para que el
          // turista no vea esa fecha como disponible.
          cargar();
          recargarCatalogo().catch(() => {});
        }
      } else {
        alert(data.error ?? 'No se pudo procesar');
      }
    } catch {
      alert('Sin conexión. Verifica tu internet.');
    }
  }

  function agregarEnlace() {
    if (!nuevoTipoEnlace) return;
    const url = normalizarEnlace(nuevoTipoEnlace, nuevaUrlEnlace);
    if (!url) return;
    setEnlaces(e => [...e, { id: nuevoEnlaceId(), tipo: nuevoTipoEnlace, url }]);
    setNuevaUrlEnlace('');
    setNuevoTipoEnlace(null);
  }

  function aplicarEdicionEnlace() {
    if (!editandoEnlace) return;
    setEnlaces(e => e.map(x => (x.id === editandoEnlace ? { ...x, url: normalizarEnlace(x.tipo, textoEditando) || x.url } : x)));
    setEditandoEnlace(null);
  }

  function abrirVistaPrevia() {
    if (!servicio) return;
    const pies = servicio.fotos_pies && typeof servicio.fotos_pies === 'object' && !Array.isArray(servicio.fotos_pies)
      ? (servicio.fotos_pies as Record<string, string>) : undefined;
    setVistaPrevia({
      ...buildPreview(),
      imagenesExtra: fotos.slice(1),
      pies,
      verificado: servicio.estado === 'aprobado',
      aceptaReservaciones: !!servicio.acepta_reservaciones,
      servicioId: servicio.id,
      montoMinimo: servicio.monto_minimo != null ? Number(servicio.monto_minimo) : null,
      mostrarUsdReservacion: !!servicio.mostrar_usd_reservacion,
      fechasBloqueadas: servicio.fechas_bloqueadas ?? [],
    });
  }

  function eliminarEnlace(id: string) {
    setEnlaces(e => e.filter(x => x.id !== id));
  }

  function buildPreview(): Lugar {
    return servicioComoLugar({
      id: servicio?.id,
      nombreNegocio: form.nombre  || servicio?.nombre  || 'Mi Negocio',
      categoria:     form.categoria || 'Gastronomia',
      municipio:     form.municipio || 'Catemaco',
      descripcion:   form.descripcion || 'Descripción del servicio.',
      precio:        form.precio   || '',
      contacto:      form.contacto || '',
      ubicacionLat:  servicio?.lat ?? 18.42,
      ubicacionLng:  servicio?.lng ?? -95.11,
      creadoEn:      Date.now(),
      estado:        (servicio?.estado ?? 'pendiente') as any,
      horario:       form.horario      || undefined,
      diasAbierto:   form.dias_abierto || undefined,
      duracion:      form.duracion     || undefined,
      comoLlegar:    form.como_llegar  || undefined,
      tip:           form.tip          || undefined,
      mascotas:      form.mascotas     || undefined,
      idealPara:     form.ideal_para.length ? form.ideal_para : undefined,
      foto:          fotos[0]          || undefined,
      // Antes faltaba aquí — por eso "Guardar enlaces" sí guardaba en
      // la bd (sin error) pero el Preview / PlaceCard nunca los
      // mostraba, sin importar cuántas veces se reintentara.
      enlaces:       enlaces.length    ? enlaces : undefined,
    });
  }

  const fotoUrl    = usuario.foto_url;
  const iniciales  = usuario.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const colorEstado = servicio ? (COLORES_ESTADO[servicio.estado] ?? 'bg-gray-100 text-gray-600') : '';
  const labelEstado = servicio?.estado === 'pendiente' ? '⏳ En revisión'
                    : servicio?.estado === 'aprobado'  ? '✅ Aprobado'
                    : '❌ Rechazado';
  const premiumActivo = !!servicio?.premium && (!servicio?.premium_hasta || new Date(servicio.premium_hasta) > new Date());

  const porResponder = (reservacionesEntrantes ?? []).filter((r: any) => r.estado === 'pendiente').length;
  const SECCIONES: { id: TabPrincipal; Icono: LucideIcon; titulo: string; estado: string; tono: 'ok' | 'aviso' | 'malo' }[] = [
    {
      id: 'servicio', Icono: Store, titulo: 'Mi servicio',
      estado: servicio?.estado === 'rechazado' ? 'Rechazado · toca para ver razones'
            : servicio?.estado === 'pendiente' ? 'En revisión'
            : 'Información, precio y contacto',
      tono: servicio?.estado === 'rechazado' ? 'malo' : servicio?.estado === 'pendiente' ? 'aviso' : 'ok',
    },
    { id: 'fotos', Icono: Camera, titulo: 'Fotos', estado: fotos.length === 1 ? '1 foto' : `${fotos.length} fotos`, tono: fotos.length === 0 ? 'aviso' : 'ok' },
    { id: 'reservaciones', Icono: CalendarDays, titulo: 'Reservaciones', estado: porResponder > 0 ? `${porResponder} por responder` : 'Sin pendientes', tono: porResponder > 0 ? 'aviso' : 'ok' },
    { id: 'externa', Icono: Link2, titulo: 'Enlaces y pagos', estado: servicio?.mp_conectado ? 'Mercado Pago conectado' : 'Conecta Mercado Pago', tono: servicio?.mp_conectado ? 'ok' : 'aviso' },
  ];
  const colorPunto = { ok: 'bg-jungle-500', aviso: 'bg-amber-400', malo: 'bg-red-500' } as const;

  function abrirSeccion(id: TabPrincipal) {
    setTab(id);
    setAbierta(true);
    requestAnimationFrame(() => zonaSeccionRef.current?.scrollIntoView({ block: 'start' }));
  }

  return (
    <div className="min-h-screen bg-jungle-50 pb-10">
      <div className={abierta ? 'hidden lg:block' : ''}>
      {/* Header con portada */}
      <div
        className="h-36 bg-gradient-to-br from-jungle-800 to-jungle-950 relative"
        style={fotos[0] ? { backgroundImage: `url(${fotos[0]})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
      >
        <div className="absolute inset-0 bg-jungle-950/40" />
        <div className="relative z-10 px-4 pt-5 flex items-center justify-between">
          <button onClick={onVolver} className="flex items-center gap-1 text-white/80 hover:text-white text-sm">
            <ArrowLeft size={16} /> Inicio
          </button>
          <button onClick={cargar} className="text-white/70 hover:text-white">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Avatar centrado + nombre + estado */}
      <div className="flex flex-col items-center -mt-14 mb-5 px-4">
        <div className="relative mb-3">
          {fotoUrl ? (
            <img src={fotoUrl} alt={usuario.nombre} className="w-24 h-24 rounded-full border-4 border-white object-cover shadow-lg" />
          ) : (
            <div className="w-24 h-24 rounded-full border-4 border-white bg-jungle-600 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-2xl">{iniciales}</span>
            </div>
          )}
        </div>
        <h1 className="font-display font-bold text-xl text-jungle-950 text-center leading-snug max-w-xs break-words">
          {servicio?.nombre ?? usuario.nombre}
        </h1>
        <div className="flex items-center gap-2 mt-1 flex-wrap justify-center">
          <span className="text-xs text-jungle-500">
            {servicio?.categoria ?? 'Prestador de servicio'}
          </span>
          {servicio && (
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${colorEstado}`}>
              {labelEstado}
            </span>
          )}
        </div>
        {servicio?.creado_en && (
          <p className="text-[11px] text-jungle-400 mt-1 flex items-center gap-1">
            <Calendar size={11} /> Prestador desde {formatearMes(servicio.creado_en)}
          </p>
        )}
      </div>

      {/* Tarjeta de Ganancias — visible directamente (no escondida en
          un badge), como el "Centro de creadores" de referencia.
          Tocarla abre el resumen completo con Estadísticas también. */}
      {servicio && (
        <div className="px-4 mb-5">
          {mensajePremium && (
            <div className={`rounded-xl p-3 mb-3 text-sm flex items-start gap-2 ${
              mensajePremium.tipo === 'exito' ? 'bg-green-50 text-green-800 border border-green-200'
              : mensajePremium.tipo === 'pendiente' ? 'bg-amber-50 text-amber-800 border border-amber-200'
              : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <span className="flex-1">{mensajePremium.texto}</span>
              <button onClick={() => setMensajePremium(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
            </div>
          )}
          <button
            onClick={() => setMostrarResumen(true)}
            className="w-full text-left bg-gradient-to-br from-jungle-900 to-jungle-950 hover:from-jungle-800 hover:to-jungle-900 rounded-2xl p-5 text-white relative overflow-hidden transition-colors"
          >
            <DollarSign size={80} className="absolute -right-3 -bottom-4 text-white/5" />
            <p className="text-xs text-jungle-300 uppercase tracking-wide font-semibold mb-1">Ganancias totales</p>
            <p className="font-display font-extrabold text-3xl">
              {gananciasTotales === null ? '···' : formatearMXNCompleto(gananciasTotales)}
            </p>
            <p className="text-xs text-jungle-300 mt-2 relative flex items-center gap-1">
              Ver estadísticas y Plan Premium <ChevronRight size={13} />
            </p>
          </button>
        </div>
      )}

      </div>

      {cargando && (
        <div className="px-4">
          <div className="bg-white rounded-2xl p-8 text-center text-jungle-500">
            <Loader2 size={28} className="animate-spin mx-auto mb-2" />
            <p className="text-sm">Cargando tu perfil…</p>
          </div>
        </div>
      )}

      {!cargando && error && (
        <div className="px-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{error}</div>
        </div>
      )}

      {!cargando && !error && !servicio && (
        <div className="px-4">
          <div className="bg-white rounded-2xl border border-jungle-100 p-8 text-center">
            <Store size={36} className="mx-auto text-jungle-200 mb-3" />
            <p className="text-jungle-600 font-medium mb-1">Aún no tienes un servicio registrado.</p>
            <p className="text-sm text-jungle-400 mb-4">Ve al Portal de Prestadores para registrar tu negocio.</p>
          </div>
        </div>
      )}

      {!cargando && !error && servicio && (
        <>
          {/* ── Centro de Prestador — una sola fila, ya no dos
              niveles (antes "Servicio" arriba y "Mi Servicio" abajo
              eran confusos y redundantes). Ganancias y Estadísticas
              viven en el contador junto a la foto (ver arriba). */}
          {/* flex-1 + flex-shrink-0 juntas eran contradictorias (una
              pide crecer, la otra pide no encogerse) y con 5 etiquetas
              largas + emoji el resultado eran pestañas de ancho
              desigual, apretadas, difíciles de leer en un teléfono
              angosto. Ahora cada pestaña mide lo que necesita su
              texto y la fila entera se desplaza (overflow-x-auto) —
              más legible y ya no se "pelean" por espacio.
              "Información externa" además renombrada a "Enlaces y
              pagos": ahí vive también Mercado Pago, no solo redes
              sociales, y el nombre viejo lo escondía. */}
          <div className="lg:flex lg:gap-6 lg:px-6 lg:max-w-6xl lg:mx-auto lg:items-start">
            {/* PC: columna lateral con las secciones */}
            <nav className="hidden lg:flex flex-col gap-0.5 w-64 flex-shrink-0 sticky top-4 bg-white/85 border border-white/70 shadow-[0_8px_30px_rgba(20,83,45,0.07)] rounded-2xl p-2" aria-label="Secciones del perfil">
              {SECCIONES.map((sec) => {
                const activa = tab === sec.id;
                return (
                  <button
                    key={sec.id}
                    onClick={() => setTab(sec.id)}
                    aria-current={activa ? 'page' : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[13.5px] font-medium tracking-[-0.005em] transition-colors ${activa ? 'text-jungle-950' : 'text-jungle-700/80 hover:text-jungle-900'}`}
                  >
                    {activa && (
                      <motion.span layoutId="pill-seccion" className="absolute inset-0 rounded-xl bg-jungle-600/10 ring-1 ring-jungle-600/15" transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
                        <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-jungle-600" />
                      </motion.span>
                    )}
                    <sec.Icono size={18} strokeWidth={1.75} className={`relative flex-shrink-0 transition-colors ${activa ? 'text-jungle-700' : 'text-jungle-500 group-hover:text-jungle-700'}`} />
                    <span className="relative flex-1">{sec.titulo}</span>
                    {sec.tono !== 'ok' && <span className={`relative h-1.5 w-1.5 rounded-full ${colorPunto[sec.tono]}`} />}
                  </button>
                );
              })}
              <div className="mt-1 pt-2 border-t border-jungle-100/80">
                <button type="button" onClick={abrirVistaPrevia}
                  className="w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[13.5px] font-semibold text-jungle-700/90 hover:bg-jungle-50 hover:text-jungle-900 transition-colors">
                  <Eye size={18} strokeWidth={1.75} className="text-jungle-500 flex-shrink-0" />
                  <span className="flex-1">Ver cómo te ven</span>
                  <ChevronRight size={15} className="text-jungle-300" />
                </button>
              </div>
            </nav>

            <div className="flex-1 min-w-0">
              {/* Celular: menú de tarjetas grandes */}
              <AnimatePresence mode="popLayout" initial>
                {!abierta && (
                  <motion.div
                    key="menu-movil"
                    className="lg:hidden px-4 pb-2"
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -28, transition: { duration: 0.18 } }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  >
                    <div className="bg-white/85 border border-white/80 rounded-2xl shadow-[0_8px_30px_rgba(20,83,45,0.07)] divide-y divide-jungle-100/80 overflow-hidden">
                      {SECCIONES.map((sec, k) => (
                        <motion.button
                          key={sec.id}
                          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.04 * k, duration: 0.3, ease: 'easeOut' }}
                          onClick={() => abrirSeccion(sec.id)}
                          className="w-full flex items-center gap-3.5 px-4 py-4 text-left active:bg-jungle-50/80 transition-colors"
                        >
                          <span className="h-10 w-10 rounded-xl bg-jungle-50 ring-1 ring-jungle-100 text-jungle-700 flex items-center justify-center flex-shrink-0">
                            <sec.Icono size={19} strokeWidth={1.75} />
                          </span>
                          <span className="flex flex-col min-w-0 flex-1">
                            <span className="font-display font-semibold text-jungle-950 text-[15px] leading-tight">{sec.titulo}</span>
                            <span className="flex items-center gap-1.5 text-xs text-jungle-500 mt-0.5 leading-snug">
                              <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${colorPunto[sec.tono]}`} />
                              <span className="truncate">{sec.estado}</span>
                            </span>
                          </span>
                          <ChevronRight size={18} strokeWidth={1.75} className="text-jungle-300 flex-shrink-0" />
                        </motion.button>
                      ))}
                    </div>
                    <button type="button" onClick={abrirVistaPrevia}
                      className="mt-3 w-full flex items-center gap-3.5 px-4 py-4 rounded-2xl bg-white/85 border border-white/80 shadow-[0_8px_30px_rgba(20,83,45,0.07)] text-left active:bg-jungle-50/80 transition-colors">
                      <span className="h-10 w-10 rounded-xl bg-jungle-700 text-white flex items-center justify-center flex-shrink-0"><Eye size={19} strokeWidth={1.75} /></span>
                      <span className="flex flex-col min-w-0 flex-1">
                        <span className="font-display font-semibold text-jungle-950 text-[15px] leading-tight">Ver cómo te ven</span>
                        <span className="text-xs text-jungle-500 mt-0.5">Tu ficha tal como la ve el turista</span>
                      </span>
                      <ChevronRight size={18} strokeWidth={1.75} className="text-jungle-300 flex-shrink-0" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Sección abierta (siempre visible en PC) */}
              <div ref={zonaSeccionRef} className={abierta ? '' : 'hidden lg:block'}>
                <div className="lg:hidden sticky top-0 z-20 bg-white/70 backdrop-blur-xl border-b border-white/70 px-3 py-2.5 mb-4 flex items-center gap-1">
                  <button onClick={() => setAbierta(false)} className="h-11 pl-2 pr-4 rounded-2xl flex items-center gap-1 text-jungle-700 font-bold text-sm active:bg-jungle-50">
                    <ArrowLeft size={18} /> Mi perfil
                  </button>
                  <p className="font-display font-bold text-jungle-950 text-base absolute left-1/2 -translate-x-1/2 pointer-events-none">
                    {SECCIONES.find((x) => x.id === tab)?.titulo}
                  </p>
                </div>
                <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${tab}-${abierta}`}
                  initial={{ opacity: 0, x: 22 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14, transition: { duration: 0.14 } }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
          <div className="px-4 lg:px-0">
                {/* ── TAB: Mi Servicio ── */}
                {tab === 'servicio' && (
              <div className="bg-white rounded-2xl border border-jungle-100 p-4 space-y-4">
                {exito && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2.5 text-sm text-green-800">
                    <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                    <span className="flex-1">Cambios guardados.</span>
                    <button type="button" onClick={abrirVistaPrevia} className="flex-shrink-0 h-9 px-3 rounded-lg bg-white border border-green-200 text-green-800 text-xs font-bold flex items-center gap-1.5 hover:bg-green-100">
                      <Eye size={14} /> Ver cómo se ve
                    </button>
                  </div>
                )}
                {servicio.estado === 'rechazado' && (
                  <TarjetaRechazo
                    motivo={servicio.motivo_rechazo}
                    nombreNegocio={servicio.nombre}
                    codigo={servicio.codigo_seguimiento}
                    onReenviar={reenviarARevision}
                    reenviando={reenviando}
                    pista="Corrige lo que se indica con el lápiz ✏️ de cada sección (información, precio, fotos) y toca “Volver a enviar a revisión”."
                  />
                )}

                {/* Antes el "% de perfil completo" solo vivía dentro
                    del modal de Ganancias — si el prestador nunca lo
                    abría, nunca se enteraba de qué le faltaba para
                    tener la ficha lista. Ahora se ve justo aquí,
                    donde de verdad está editando los campos. */}
                <div className="bg-jungle-50 rounded-xl p-3.5">
                  <p className="text-xs font-semibold text-jungle-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <BarChart3 size={12} /> Perfil completo
                  </p>
                  <BarraPerfilCompleto servicio={servicio} fotos={fotos} />
                </div>

                {/* Antes "Editar" revelaba un solo formulario con las
                    12+ cosas de golpe (nombre, precio, horario, cómo
                    llegar, mascotas...) en una sola pared de campos —
                    saturaba, sobre todo en móvil. Ahora cada sección
                    es una tarjeta de solo lectura con su propio lápiz,
                    que abre un modal enfocado nada más en esa sección
                    (mismo patrón que el modal de "Iniciar sesión"). */}
                <div className="space-y-3">
                  <SeccionServicio titulo="Información básica" onEditar={() => abrirModal('basica')}>
                    <InfoFila icono={<Store size={14} />} label="Categoría" valor={servicio.categoria} />
                    <InfoFila icono={null} label="Municipio" valor={servicio.municipio} />
                    <div className="bg-jungle-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-jungle-500 mb-1">Descripción</p>
                      <p className="text-sm text-jungle-800">{servicio.descripcion}</p>
                    </div>
                  </SeccionServicio>

                  <SeccionServicio titulo="Precio y contacto" onEditar={() => abrirModal('precio')}>
                    <InfoFila icono={null} label="Precio" valor={servicio.precio} />
                    <InfoFila icono={<Phone size={14} />} label="Contacto" valor={servicio.contacto} />
                  </SeccionServicio>

                  <SeccionServicio titulo="Detalles para el turista" onEditar={() => abrirModal('detalles')}>
                    <InfoFila icono={<Clock size={14} />} label="Horario"
                      valor={servicio.horario ? (servicio.dias_abierto && servicio.dias_abierto !== 'Horario por día' ? `${servicio.horario} · ${servicio.dias_abierto}` : servicio.horario) : undefined} />
                    <InfoFila icono={null} label="Duración" valor={servicio.duracion} />
                    <InfoFila icono={null} label="Cómo llegar" valor={servicio.como_llegar} />
                    <InfoFila icono={null} label="Consejo" valor={servicio.tip} />
                    <InfoFila icono={null} label="🐾 Mascotas" valor={servicio.mascotas} />
                    {parseIdeal(servicio.ideal_para).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-jungle-500 mb-1.5">Ideal para</p>
                        <div className="flex flex-wrap gap-2">
                          {parseIdeal(servicio.ideal_para).map(id => {
                            const op = IDEAL_OPCIONES.find(o => o.id === id);
                            return op ? (
                              <span key={id} className="text-xs px-2.5 py-1 bg-jungle-100 text-jungle-700 rounded-full font-medium">{op.label}</span>
                            ) : null;
                          })}
                        </div>
                      </div>
                    )}
                  </SeccionServicio>

                  <div className="bg-jungle-50 rounded-xl p-3 flex items-center gap-3">
                    <div>
                      <p className="text-[10px] text-jungle-500 uppercase tracking-wide font-semibold">Código de seguimiento</p>
                      <p className="font-display font-bold text-lg text-jungle-900 tracking-wider">{servicio.codigo_seguimiento}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB: Fotos ── */}
            {tab === 'fotos' && (
              <div className="bg-white rounded-2xl border border-jungle-100 p-4">
                {servicio.estado === 'aprobado' ? (
                  <GestorFotos codigoSeguimiento={servicio.codigo_seguimiento} fotosIniciales={fotos} onFotosActualizadas={setFotos}
                    piesIniciales={servicio.fotos_pies && typeof servicio.fotos_pies === 'object' && !Array.isArray(servicio.fotos_pies) ? (servicio.fotos_pies as Record<string, string>) : {}}
                    nombreNegocio={servicio.nombre} />
                ) : (
                  <div className="text-center py-8 text-jungle-400">
                    <p className="text-sm font-medium mb-1">Fotos disponibles cuando el servicio sea aprobado.</p>
                    <p className="text-xs">Estado actual: <strong>{labelEstado}</strong></p>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: Reservaciones (pieza 2 — sin pagos todavía) ── */}
            {tab === 'reservaciones' && (
              <PanelReservacionesPrestador
                servicio={servicio}
                mpConectado={!!servicio.mp_conectado}
                conectandoMp={conectandoMp}
                onConectarMp={conectarMercadoPago}
                reservaciones={reservacionesEntrantes}
                cargando={cargandoReservaciones}
                guardandoConfig={guardandoReservConfig}
                onGuardarConfig={(cfg) => actualizarConfigReservaciones({
                  acepta_reservaciones: cfg.activar,
                  politica_cancelacion: cfg.politica_cancelacion,
                  monto_minimo: cfg.monto_minimo,
                  mostrar_usd_reservacion: cfg.mostrar_usd_reservacion,
                })}
                onEliminar={() => actualizarConfigReservaciones({ eliminar_reservaciones: true })}
                onGuardarFechas={(fechas) => actualizarConfigReservaciones({ fechas_bloqueadas: fechas })}
                onResponder={responderReservacion}
                onAbrirChat={(id, nombre) => setChatAbierto({ id, nombre })}
              />
            )}
          </div>

          {/* ── TAB: Enlaces y pagos ── */}
          {tab === 'externa' && (() => {
            const guardados = parseEnlaces(servicio.enlaces);
            const firma = (l: EnlaceServicio[]) => JSON.stringify(l.map((x) => [x.id, x.tipo, x.url]));
            const sucioEnlaces = firma(enlaces) !== firma(guardados);
            const usados = new Set(enlaces.map((x) => x.tipo));
            const disponibles = TIPOS_ENLACE.filter((t) => t.tipo === 'sitio' || t.tipo === 'otro' || !usados.has(t.tipo));
            const tipoNuevo = TIPOS_ENLACE.find((t) => t.tipo === nuevoTipoEnlace);
            const campoTxt = 'w-full h-12 rounded-xl border-[1.5px] border-jungle-100 bg-white/90 px-4 text-[16px] font-medium text-jungle-950 placeholder:text-jungle-300 focus:outline-none focus:border-jungle-600 focus:ring-4 focus:ring-jungle-600/10';
            const modo = (t?: 'tel' | 'email' | 'url') => (t === 'tel' ? 'tel' : t === 'email' ? 'email' : t === 'url' ? 'url' : 'text');
            return (
              <div className="px-4 lg:px-0 space-y-4">
                <TarjetaFormulario Icono={Share2} titulo="Redes y contacto" ayuda="Lo que el turista puede tocar en tu ficha" orden={0}>
                  {enlaces.length > 0 ? (
                    <ul className="divide-y divide-jungle-100/80 mb-4">
                      {enlaces.map((en) => {
                        const auto = ID_ENLACE_AUTOMATICO.includes(en.id);
                        const editando = editandoEnlace === en.id;
                        const t = TIPOS_ENLACE.find((x) => x.tipo === en.tipo);
                        return (
                          <li key={en.id} className="py-3 first:pt-0">
                            <div className="flex items-center gap-3">
                              <LogoRed tipo={en.tipo} size={42} />
                              <div className="min-w-0 flex-1">
                                <p className="font-display font-bold text-[14.5px] text-jungle-950 leading-tight">{t?.etiqueta ?? 'Enlace'}</p>
                                <p className="text-[13px] text-jungle-600 truncate">{auto ? 'Desde tu contacto · ' : ''}{textoCortoEnlace(en.tipo, en.url)}</p>
                              </div>
                              {!auto && (
                                <>
                                  <button type="button" aria-label={editando ? 'Listo' : `Editar ${t?.etiqueta}`}
                                    onClick={() => (editando ? aplicarEdicionEnlace() : (setEditandoEnlace(en.id), setTextoEditando(textoCortoEnlace(en.tipo, en.url))))}
                                    className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${editando ? 'bg-jungle-700 text-white' : 'bg-jungle-50 text-jungle-700 ring-1 ring-jungle-100 hover:bg-jungle-100'}`}>
                                    {editando ? <Check size={17} /> : <Pencil size={16} />}
                                  </button>
                                  <button type="button" aria-label={`Quitar ${t?.etiqueta}`} onClick={() => eliminarEnlace(en.id)}
                                    className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 text-jungle-300 hover:bg-red-50 hover:text-red-600 transition-colors">
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              )}
                            </div>
                            {editando && (
                              <input value={textoEditando} onChange={(e) => setTextoEditando(e.target.value)} autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') aplicarEdicionEnlace(); }}
                                inputMode={modo(t?.teclado)} placeholder={t?.entrada} className={campoTxt + ' mt-3'} />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-jungle-500 mb-4">Aún no tienes redes agregadas. Elige una para empezar.</p>
                  )}

                  <p className="text-[13px] font-semibold text-jungle-700 mb-2.5">Agregar</p>
                  <div className="grid grid-cols-4 gap-2">
                    {disponibles.map((t) => {
                      const activo = nuevoTipoEnlace === t.tipo;
                      return (
                        <button key={t.tipo} type="button" aria-pressed={activo}
                          onClick={() => { setNuevoTipoEnlace(activo ? null : t.tipo); setNuevaUrlEnlace(''); }}
                          className={`flex flex-col items-center gap-1.5 rounded-2xl border-[1.5px] py-2.5 px-1 transition-all ${activo ? 'border-jungle-600 bg-jungle-50 ring-[3px] ring-jungle-600/10' : 'border-jungle-100 bg-white/80 hover:border-jungle-300'}`}>
                          <LogoRed tipo={t.tipo} size={40} />
                          <span className="text-[11.5px] font-semibold text-jungle-800 leading-tight text-center">{t.etiqueta}</span>
                        </button>
                      );
                    })}
                  </div>
                  {tipoNuevo && (
                    <div className="mt-3.5 flex gap-2">
                      <input value={nuevaUrlEnlace} onChange={(e) => setNuevaUrlEnlace(e.target.value)} autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') agregarEnlace(); }}
                        inputMode={modo(tipoNuevo.teclado)} placeholder={tipoNuevo.entrada} aria-label={`${tipoNuevo.etiqueta}: usuario, número o enlace`}
                        className={campoTxt + ' flex-1 min-w-0'} />
                      <button type="button" onClick={agregarEnlace} disabled={!nuevaUrlEnlace.trim()}
                        className="h-12 px-5 rounded-xl bg-jungle-700 hover:bg-jungle-800 disabled:opacity-40 text-white text-sm font-bold flex items-center gap-1.5">
                        <Plus size={16} /> Agregar
                      </button>
                    </div>
                  )}
                </TarjetaFormulario>

                {/* Cuenta de cobro — a dónde le llega su parte al prestador. Mercado Pago es una
                    conexión real (OAuth). */}
                <TarjetaFormulario Icono={DollarSign} titulo="Pagos" ayuda="Dónde recibes tu parte de cada reservación" orden={1}>
                  <div className="flex items-center gap-3">
                    <span className="h-[42px] w-[42px] rounded-[12px] bg-[#009EE3] text-white flex items-center justify-center flex-shrink-0 font-black text-[13px] shadow-sm">MP</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-bold text-[14.5px] text-jungle-950 leading-tight">Mercado Pago</p>
                      <p className="text-[13px] text-jungle-600 truncate">{servicio.mp_conectado ? (servicio.mp_user_id ? `Cuenta #${servicio.mp_user_id}` : 'Cuenta conectada') : 'Aún sin conectar'}</p>
                    </div>
                    <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full flex-shrink-0 ${servicio.mp_conectado ? 'bg-jungle-100 text-jungle-800' : 'bg-amber-100 text-amber-800'}`}>
                      {servicio.mp_conectado ? 'Conectada' : 'Sin conectar'}
                    </span>
                  </div>
                  {servicio.mp_conectado ? (
                    <button type="button" onClick={desconectarMercadoPago} className="mt-3.5 text-[13px] font-bold text-jungle-500 hover:text-red-600">
                      Desconectar cuenta
                    </button>
                  ) : (
                    <button type="button" onClick={conectarMercadoPago} disabled={conectandoMp}
                      className="mt-3.5 w-full h-12 rounded-xl bg-[#009EE3] hover:bg-[#0089C7] disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                      {conectandoMp ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      Conectar con Mercado Pago
                    </button>
                  )}
                  <p className="text-xs text-jungle-500 mt-3 leading-snug">TuxtlasGO retiene 15 % por reservación pagada; tú recibes 85 % directo a tu cuenta.</p>
                </TarjetaFormulario>

                {sucioEnlaces && (
                  <div className="sticky bottom-[84px] lg:bottom-4 z-30 flex items-center gap-2.5 rounded-2xl bg-jungle-950 text-white pl-4 pr-2.5 py-2.5 shadow-2xl animate-fade-in" role="status">
                    <span className="flex-1 text-[13.5px] font-semibold">Tienes cambios sin guardar</span>
                    <button type="button" onClick={() => { setEnlaces(guardados); setEditandoEnlace(null); setNuevoTipoEnlace(null); }} className="h-10 px-3 text-sm font-bold text-jungle-200">Descartar</button>
                    <button type="button" onClick={guardarEnlaces} disabled={guardandoEnlaces}
                      className="h-10 px-5 rounded-xl bg-jungle-400 text-jungle-950 text-sm font-bold flex items-center gap-1.5 disabled:opacity-60">
                      {guardandoEnlaces && <Loader2 size={15} className="animate-spin" />} Guardar
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
                </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </>
      )}

      {vistaPrevia && (
        <>
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[10000] pointer-events-none rounded-full bg-jungle-950/90 text-white text-[11px] font-bold px-3 py-1.5 shadow-lg">
            Vista previa
          </div>
          <PlaceDetail lugar={vistaPrevia} onClose={() => setVistaPrevia(null)} onVerEnMapa={() => setVistaPrevia(null)} />
        </>
      )}

      {mostrarResumen && servicio && (
        <PanelResumenPrestador
          servicio={servicio}
          fotos={fotos}
          enlaces={enlaces}
          labelEstado={labelEstado}
          onCerrar={() => setMostrarResumen(false)}
        />
      )}

      {chatAbierto && (
        <ChatReservacion
          reservacionId={chatAbierto.id}
          nombreOtro={chatAbierto.nombre}
          onCerrar={() => { setChatAbierto(null); cargarReservacionesEntrantes(); }}
        />
      )}



      {modalEditar === 'basica' && (() => {
        const { estado: estadoForm, municipio: muniForm } = separarMunicipio(form.municipio);
        const esOtro = estadoForm !== 'Veracruz' || !MUNICIPIOS_TUXTLAS.includes(muniForm);
        const CATS: { id: string; nombre: string; Icono: LucideIcon }[] = [
          { id: 'Gastronomia', nombre: 'Gastronomía', Icono: Utensils },
          { id: 'Naturaleza', nombre: 'Naturaleza', Icono: Leaf },
          { id: 'Aventura', nombre: 'Aventura', Icono: Mountain },
          { id: 'Hospedaje', nombre: 'Hospedaje', Icono: BedDouble },
          { id: 'Comercio', nombre: 'Comercio', Icono: ShoppingBag },
          { id: 'Cooperativa', nombre: 'Cooperativa', Icono: Handshake },
          { id: 'Otro', nombre: 'Otro', Icono: Star },
        ];
        const etiqueta = 'text-[13px] font-semibold text-jungle-700 mb-2 block';
        const campo = 'w-full rounded-xl border-[1.5px] border-jungle-100 bg-white/90 px-4 py-3.5 text-[17px] font-medium text-jungle-950 focus:outline-none focus:border-jungle-600 focus:ring-4 focus:ring-jungle-600/10 transition-shadow';
        return (
          <ModalEditarSeccion formulario titulo="Información básica" subtitulo="Así te ven los turistas" onClose={() => setModalEditar(null)} onGuardar={guardar} guardando={guardando}>
            <div className="flex flex-col gap-4 lg:gap-5 min-w-0 lg:min-h-0 lg:h-full lg:overflow-y-auto lg:-m-2 lg:p-2">
              <TarjetaFormulario Icono={Store} titulo="Tu negocio" ayuda="El nombre y el tipo con los que apareces" orden={0}>
                <div className="space-y-5">
                  <div>
                    <label className={etiqueta}>Nombre del negocio <span className="text-red-500">*</span></label>
                    <input value={form.nombre} maxLength={80} onChange={e => setForm({ ...form, nombre: e.target.value })} className={campo} />
                  </div>
                  <div>
                    <label className={etiqueta}>Tipo de negocio</label>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                      {CATS.map(({ id, nombre, Icono }) => {
                        const activa = form.categoria === id;
                        return (
                          <button key={id} type="button" onClick={() => setForm({ ...form, categoria: id })} aria-pressed={activa}
                            className={`flex items-center lg:flex-col lg:justify-center gap-2.5 lg:gap-1.5 rounded-xl border-[1.5px] px-3 py-3 lg:px-1.5 min-h-[48px] lg:min-h-[68px] text-sm lg:text-[13px] font-semibold text-left lg:text-center transition-all ${activa ? 'border-jungle-600 bg-jungle-50 text-jungle-950 ring-[3px] ring-jungle-600/10' : 'border-jungle-100 bg-white/80 text-jungle-800 hover:border-jungle-300'}`}>
                            <Icono size={18} strokeWidth={1.75} className={activa ? 'text-jungle-700' : 'text-jungle-500'} />
                            {nombre}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </TarjetaFormulario>

              <TarjetaFormulario Icono={MapPin} titulo="Ubicación" ayuda="Dónde te encuentran" orden={1}>
                <div className="space-y-5">
                  <div>
                    <label className={etiqueta}>Estado</label>
                    <select value={estadoForm}
                      onChange={e => {
                        const nuevo = e.target.value;
                        setForm({ ...form, municipio: componerMunicipio(nuevo, nuevo === 'Veracruz' ? 'Catemaco' : '') });
                      }}
                      className={campo + ' !text-[15px] !font-semibold'}>
                      {ESTADOS_MEXICO.map(est => (<option key={est} value={est}>{est}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className={etiqueta}>Municipio</label>
                    {estadoForm === 'Veracruz' && (
                      <div className="flex flex-wrap gap-2">
                        {MUNICIPIOS_TUXTLAS.map(m => {
                          const activo = !esOtro && muniForm === m;
                          return (
                            <button key={m} type="button" onClick={() => setForm({ ...form, municipio: componerMunicipio('Veracruz', m) })}
                              className={`min-h-[44px] px-4 rounded-full border-[1.5px] text-sm font-semibold transition-colors ${activo ? 'bg-jungle-700 border-jungle-700 text-white' : 'bg-white/80 border-jungle-100 text-jungle-800 hover:border-jungle-300'}`}>
                              {m}
                            </button>
                          );
                        })}
                        <button type="button" onClick={() => setForm({ ...form, municipio: componerMunicipio('Veracruz', '') })}
                          className={`min-h-[44px] px-4 rounded-full border-[1.5px] text-sm font-semibold transition-colors ${esOtro ? 'bg-jungle-700 border-jungle-700 text-white' : 'bg-white/80 border-jungle-100 text-jungle-800 hover:border-jungle-300'}`}>
                          Otro municipio…
                        </button>
                      </div>
                    )}
                    {esOtro && (
                      <input value={muniForm} maxLength={60}
                        onChange={e => setForm({ ...form, municipio: componerMunicipio(estadoForm, e.target.value) })}
                        placeholder={estadoForm === 'Veracruz' ? 'Municipio. Ej: Xalapa' : 'Municipio o ciudad. Ej: Villahermosa'}
                        className={campo + (estadoForm === 'Veracruz' ? ' mt-3' : '')} />
                    )}
                  </div>
                </div>
              </TarjetaFormulario>
            </div>

            <TarjetaFormulario Icono={FileText} titulo="Descripción" ayuda="Qué ofreces, precios, qué te hace especial" orden={2} className="flex flex-col min-h-[440px] lg:min-h-0 lg:h-full lg:m-0">
              <Suspense fallback={<CargandoCampo alto={340} />}>
                <EditorDescripcion value={form.descripcion} onChange={(v) => setForm({ ...form, descripcion: v })} />
              </Suspense>
            </TarjetaFormulario>
          </ModalEditarSeccion>
        );
      })()}

      {modalEditar === 'precio' && (() => {
        const pp = parsearPrecio(form.precio) ?? { nivel: 'razonable' as NivelPrecio, min: 150, max: 400 };
        const etiqueta = 'text-[13px] font-semibold text-jungle-700 mb-2 block';
        const campo = 'w-full rounded-xl border-[1.5px] border-jungle-100 bg-white/90 px-4 py-3.5 text-[17px] font-medium text-jungle-950 focus:outline-none focus:border-jungle-600 focus:ring-4 focus:ring-jungle-600/10 transition-shadow placeholder:text-jungle-300';
        return (
          <ModalEditarSeccion formulario titulo="Precio y contacto" subtitulo="Para que decidan y te encuentren" onClose={() => setModalEditar(null)} onGuardar={guardarPrecioContacto} guardando={guardando}>
            <TarjetaFormulario Icono={Phone} titulo="Contacto" ayuda="Cómo te llaman o te escriben" orden={1}
              className="order-2 lg:order-1 lg:self-start">
              <div className="space-y-5">
                <div>
                  <label className={etiqueta}>Teléfono</label>
                  <input type="tel" inputMode="tel" autoComplete="tel" value={contactoForm.telefono} maxLength={20}
                    onChange={(e) => setContactoForm({ ...contactoForm, telefono: e.target.value })}
                    placeholder="294 125 0703" className={campo} />
                  <p className="text-xs text-jungle-500 mt-1.5">En el celular, quien te vea podrá tocarlo para llamarte.</p>
                </div>

                <button type="button" role="switch" aria-checked={contactoForm.whatsapp}
                  onClick={() => setContactoForm({ ...contactoForm, whatsapp: !contactoForm.whatsapp })}
                  className={`w-full flex items-center gap-3 rounded-xl border-[1.5px] px-4 py-3.5 text-left transition-colors ${contactoForm.whatsapp ? 'border-jungle-600 bg-jungle-50' : 'border-jungle-100 bg-white/80'}`}>
                  <MessageCircle size={20} strokeWidth={1.75} className={contactoForm.whatsapp ? 'text-jungle-700' : 'text-jungle-500'} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-jungle-950">Este número también tiene WhatsApp</span>
                    <span className="block text-xs text-jungle-500 mt-0.5">Podrán escribirte o llamarte por WhatsApp</span>
                  </span>
                  <span className={`relative h-6 w-11 rounded-full flex-shrink-0 transition-colors ${contactoForm.whatsapp ? 'bg-jungle-600' : 'bg-jungle-200'}`}>
                    <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${contactoForm.whatsapp ? 'right-0.5' : 'left-0.5'}`} />
                  </span>
                </button>

                <div>
                  <label className={etiqueta}>Correo <span className="font-normal text-jungle-400">(opcional)</span></label>
                  <div className="relative">
                    <Mail size={18} strokeWidth={1.75} className="absolute left-4 top-1/2 -translate-y-1/2 text-jungle-400 pointer-events-none" />
                    <input type="email" inputMode="email" autoComplete="email" value={contactoForm.correo} maxLength={80}
                      onChange={(e) => setContactoForm({ ...contactoForm, correo: e.target.value })}
                      placeholder="contacto@tunegocio.com" className={campo + ' !pl-11'} />
                  </div>
                </div>
              </div>
            </TarjetaFormulario>

            <TarjetaFormulario Icono={DollarSign} titulo="Precio" ayuda={`Un aproximado ${form.categoria === 'Hospedaje' ? 'por noche' : 'por persona'}`} orden={0}
              className="order-1 lg:order-2 lg:min-h-0 lg:overflow-y-auto">
              <Suspense fallback={<CargandoCampo alto={320} />}>
                <SelectorRangoPrecio nivel={pp.nivel} min={pp.min} max={pp.max}
                onChange={(v) => setForm({ ...form, precio: formatearPrecio(v.nivel, v.min, v.max) })} />
              </Suspense>
            </TarjetaFormulario>
          </ModalEditarSeccion>
        );
      })()}

      {modalEditar === 'detalles' && (
        <ModalEditarSeccion formulario titulo="Detalles para el turista" subtitulo="Horario y datos útiles para la visita" onClose={() => setModalEditar(null)} onGuardar={guardarDetalles} guardando={guardando}>
          <div className="flex flex-col gap-4 lg:gap-5 min-w-0 order-2 lg:order-1 lg:min-h-0 lg:h-full lg:overflow-y-auto lg:-m-2 lg:p-2">
            <TarjetaFormulario Icono={Eye} titulo="Así lo verá el turista" ayuda="Se arma solo con lo que marcaste" orden={1}>
              <ResumenHorario value={form.horario_semanal} />
            </TarjetaFormulario>
            <TarjetaFormulario Icono={Timer} titulo="Duración de la visita" ayuda="Cuánto tiempo suele quedarse la gente" orden={2}>
              <SelectorDuracion valor={form.duracion} onCambiar={(v) => setForm({ ...form, duracion: v })} />
            </TarjetaFormulario>

            <TarjetaFormulario Icono={Route} titulo="Cómo llegar" ayuda="Referencias para encontrarte fácil" orden={3}>
              <NotaCompacta titulo="Cómo llegar" max={600} value={form.como_llegar} onChange={(v) => setForm({ ...form, como_llegar: v })}
                placeholder="Ej: Frente a la farmacia, rumbo al malecón, sobre la calle Democracia." />
            </TarjetaFormulario>

            <TarjetaFormulario Icono={Lightbulb} titulo="Consejo para el visitante" ayuda="Algo que les sirva saber antes de ir" orden={4}>
              <NotaCompacta titulo="Consejo para el visitante" max={400} value={form.tip} onChange={(v) => setForm({ ...form, tip: v })}
                placeholder="Ej: Lleva efectivo, no siempre hay señal." />
            </TarjetaFormulario>

            <TarjetaFormulario Icono={PawPrint} titulo="¿Aceptan mascotas?" ayuda="Tu política, con tus palabras" orden={5}>
              <NotaCompacta titulo="¿Aceptan mascotas?" max={300} value={form.mascotas} onChange={(v) => setForm({ ...form, mascotas: v })}
                placeholder="Ej: Sí, aceptamos perros / No se permiten mascotas / Solo en la terraza." />
              <p className="text-xs text-jungle-500 mt-2 leading-snug">Si lo dejas vacío, el asistente dirá honestamente que no tiene ese dato — nunca lo inventa.</p>
            </TarjetaFormulario>

            <TarjetaFormulario Icono={Users} titulo="Ideal para" ayuda="Elige todos los que apliquen" orden={6}>
              <div className="flex flex-wrap gap-2">
                {([
                  { id: 'pareja', texto: 'Parejas', Icono: Heart },
                  { id: 'familia', texto: 'Familias', Icono: Users },
                  { id: 'grupos', texto: 'Grupos', Icono: PartyPopper },
                  { id: 'solo', texto: 'Viajeros solos', Icono: Compass },
                ] as const).map(({ id, texto, Icono }) => {
                  const activo = form.ideal_para.includes(id);
                  return (
                    <button key={id} type="button" onClick={() => toggleIdeal(id)} aria-pressed={activo}
                      className={`flex items-center gap-2 min-h-[44px] px-4 rounded-full border-[1.5px] text-sm font-semibold transition-colors ${activo ? 'bg-jungle-700 border-jungle-700 text-white' : 'bg-white/80 border-jungle-100 text-jungle-800 hover:border-jungle-300'}`}>
                      <Icono size={16} strokeWidth={1.75} /> {texto}
                    </button>
                  );
                })}
              </div>
            </TarjetaFormulario>
          </div>

          <TarjetaFormulario Icono={Clock} titulo="Horario" ayuda="Marca cuándo abres, cada día con su hora" orden={0}
            className="order-1 lg:order-2 flex flex-col lg:min-h-0 lg:h-full">
            <Suspense fallback={<CargandoCampo alto={300} />}>
              <EditorHorarioSemanal value={form.horario_semanal} onChange={(sem) => setForm({ ...form, horario_semanal: sem })} />
            </Suspense>
          </TarjetaFormulario>
        </ModalEditarSeccion>
      )}
    </div>
  );
}

// ─────────────── AUXILIARES ───────────────
function formatearMes(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  } catch {
    return '—';
  }
}

// Panel resumen — Ganancias + Estadísticas juntas, antes eran 2 tabs
// aparte; ahora se abren desde el contador junto a la foto de
// perfil. Mismo contenido de antes, solo un lugar distinto.
// Panel de Reservaciones — pieza 2, a propósito sin nada de pagos.
// El prestador decide si acepta, qué política usa, y qué fechas
// bloquea; y responde a las solicitudes que le lleguen.
function PanelReservacionesPrestador({
  servicio, mpConectado, conectandoMp, onConectarMp, reservaciones, cargando, guardandoConfig,
  onGuardarConfig, onEliminar, onGuardarFechas, onResponder, onAbrirChat,
}: {
  servicio: ServicioAPI;
  mpConectado: boolean;
  conectandoMp: boolean;
  onConectarMp: () => void;
  reservaciones: ReservacionPrestador[] | null;
  cargando: boolean;
  guardandoConfig: boolean;
  onGuardarConfig: (cfg: { politica_cancelacion: 'flexible' | 'no_reembolsable'; monto_minimo: number | null; mostrar_usd_reservacion: boolean; activar: boolean }) => Promise<boolean>;
  onEliminar: () => void;
  onGuardarFechas: (fechas: string[]) => Promise<boolean>;
  onResponder: (id: number, accion: 'confirmar' | 'rechazar') => void;
  onAbrirChat: (id: number, nombreViajero: string) => void;
}) {
  const acepta = !!servicio.acepta_reservaciones;
  const bloqueadas = servicio.fechas_bloqueadas ?? [];
  const pendientes = reservaciones?.filter(r => r.estado === 'pendiente') ?? [];
  const resueltas = reservaciones?.filter(r => r.estado !== 'pendiente') ?? [];
  const hoy = new Date().toISOString().slice(0, 10);

  // Buscador + "Limpiar solicitudes" — esto último solo oculta de la
  // vista (rechazadas/canceladas viejas), nunca borra nada de la
  // base de datos.
  const [mostrarBusquedaSolicitudes, setMostrarBusquedaSolicitudes] = useState(false);
  const [busquedaSolicitudes, setBusquedaSolicitudes] = useState('');
  const [ocultarResueltasAntiguas, setOcultarResueltasAntiguas] = useState(false);

  const filtrarPorNombre = (lista: ReservacionPrestador[]) =>
    busquedaSolicitudes.trim()
      ? lista.filter(r => r.nombre_viajero.toLowerCase().includes(busquedaSolicitudes.trim().toLowerCase()))
      : lista;

  const pendientesFiltradas = filtrarPorNombre(pendientes);
  const resueltasFiltradas = filtrarPorNombre(
    ocultarResueltasAntiguas ? resueltas.filter(r => r.estado === 'confirmada') : resueltas
  );

  // Borrador local — no se guarda campo por campo, se guarda todo
  // junto con "Publicar" o "Guardar cambios" (como se pidió).
  const [politicaDraft, setPoliticaDraft] = useState<'flexible' | 'no_reembolsable'>(servicio.politica_cancelacion ?? 'flexible');
  const [montoDraft, setMontoDraft] = useState(servicio.monto_minimo != null ? String(servicio.monto_minimo) : '');
  const [mostrarUsdDraft, setMostrarUsdDraft] = useState(!!servicio.mostrar_usd_reservacion);

  // Misma tasa de referencia que usa el registro (ProviderPanel.tsx)
  // — no se inventa una tasa nueva aparte.
  const TASA_USD_REFERENCIA = 17.1;
  const montoNum = parseFloat(montoDraft);
  const montoUsd = Number.isFinite(montoNum) && montoNum > 0 ? Math.round(montoNum / TASA_USD_REFERENCIA) : null;

  async function publicar() {
    if (!mpConectado) return;
    // "Lo único que tiene que aceptar" antes de activar: el reparto
    // 6% TuxtlasGO / 94% prestador en cada reservación pagada.
    const confirmado = confirm(
      'Al publicar reservaciones, aceptas que TuxtlasGO retenga automáticamente el 6% de comisión de cada reservación pagada dentro de la app. El 94% restante se deposita directo a tu cuenta de Mercado Pago conectada.\n\n¿Aceptas y quieres publicar?'
    );
    if (!confirmado) return;
    const ok = await onGuardarConfig({
      politica_cancelacion: politicaDraft,
      monto_minimo: montoDraft.trim() ? montoNum : null,
      mostrar_usd_reservacion: mostrarUsdDraft,
      activar: true,
    });
    if (ok) setAbierta({ pol: false, ant: false, usd: false });
  }

  async function guardarCambios() {
    const ok = await onGuardarConfig({
      politica_cancelacion: politicaDraft,
      monto_minimo: montoDraft.trim() ? montoNum : null,
      mostrar_usd_reservacion: mostrarUsdDraft,
      activar: true,
    });
    if (ok) setAbierta({ pol: false, ant: false, usd: false });
  }

  function eliminar() {
    if (!confirm('¿Eliminar reservaciones de este servicio? Ya no se mostrará "Reservar" a los turistas, y se borra la configuración (política, monto mínimo, fechas bloqueadas). Las reservaciones ya confirmadas no se cancelan solas.')) return;
    onEliminar();
  }

  // ── Reglas: cada sección muestra su resumen y se edita con su lápiz ──
  const [abierta, setAbierta] = useState({ pol: false, ant: false, usd: false });
  const alternar = (k: 'pol' | 'ant' | 'usd') => setAbierta((a) => ({ ...a, [k]: !a[k] }));
  const ANTICIPOS = [100, 150, 200, 300];
  const guardadaPol = servicio.politica_cancelacion ?? 'flexible';
  const guardadoMonto = servicio.monto_minimo != null ? Number(servicio.monto_minimo) : null;
  const montoDraftNum = montoDraft.trim() ? montoNum : null;
  const [otroMonto, setOtroMonto] = useState(guardadoMonto != null && guardadoMonto > 0 && !ANTICIPOS.includes(guardadoMonto));
  const sucio = acepta && (
    politicaDraft !== guardadaPol ||
    (montoDraftNum ?? null) !== guardadoMonto ||
    mostrarUsdDraft !== !!servicio.mostrar_usd_reservacion
  );
  const horarioSemana = useMemo(
    () => semanaValida(servicio.horario_semanal) ?? semanaDesdeTextos(servicio.horario, servicio.dias_abierto),
    [servicio.horario_semanal, servicio.horario, servicio.dias_abierto]
  );

  function descartar() {
    setPoliticaDraft(guardadaPol);
    setMontoDraft(guardadoMonto != null ? String(guardadoMonto) : '');
    setMostrarUsdDraft(!!servicio.mostrar_usd_reservacion);
    setOtroMonto(guardadoMonto != null && guardadoMonto > 0 && !ANTICIPOS.includes(guardadoMonto));
  }

  // Pausar = dejar de recibir reservaciones SIN borrar nada (a diferencia de "Eliminar").
  async function pausar() {
    await onGuardarConfig({
      politica_cancelacion: guardadaPol,
      monto_minimo: guardadoMonto,
      mostrar_usd_reservacion: !!servicio.mostrar_usd_reservacion,
      activar: false,
    });
  }

  const resumenPol = politicaDraft === 'flexible' ? 'Flexible · gratis hasta 24–48 h antes' : 'No reembolsable · sin cancelación';
  const resumenAnt = montoDraftNum && montoDraftNum > 0 ? `$${montoDraftNum.toLocaleString('es-MX')} MXN al reservar` : 'Sin anticipo · se paga todo al llegar';
  const resumenUsd = mostrarUsdDraft ? (montoUsd !== null ? `Sí · se verá ≈ $${montoUsd} USD` : 'Sí · en dólares') : 'No · solo en pesos';
  const chipMonto = (activo: boolean) => `min-h-[42px] px-4 rounded-full border-[1.5px] text-[13.5px] font-bold transition-colors ${activo ? 'bg-jungle-700 border-jungle-700 text-white' : 'bg-white border-jungle-100 text-jungle-800 hover:border-jungle-300'}`;
  const opcionPol = (v: 'flexible' | 'no_reembolsable', Icono: LucideIcon, titulo: string, texto: string) => {
    const activa = politicaDraft === v;
    return (
      <button key={v} type="button" onClick={() => setPoliticaDraft(v)} aria-pressed={activa}
        className={`relative text-left p-3.5 rounded-2xl border-[1.5px] flex flex-col gap-0.5 transition-all ${activa ? 'border-jungle-600 bg-jungle-50 ring-[3px] ring-jungle-600/10' : 'border-jungle-100 bg-white hover:border-jungle-300'}`}>
        <span className={`absolute top-2.5 right-2.5 h-[22px] w-[22px] rounded-full bg-jungle-600 text-white flex items-center justify-center transition-transform ${activa ? 'scale-100' : 'scale-0'}`}><Check size={13} /></span>
        <Icono size={22} strokeWidth={1.75} className="text-jungle-600 mb-1.5" />
        <b className="text-sm text-jungle-950">{titulo}</b>
        <small className="text-xs text-jungle-500 leading-snug">{texto}</small>
      </button>
    );
  };

  return (
    <div className="px-4 space-y-3">
      {/* Reservaciones es independiente de Premium; lo único que hace
          falta es tener Mercado Pago conectado, para saber a dónde
          depositarle su parte. */}
      <TarjetaFormulario Icono={CalendarDays} titulo="Recibir reservaciones" orden={0}
        ayuda={!mpConectado ? 'Conecta Mercado Pago para empezar' : acepta ? 'Tus clientes reservan desde la app' : 'Pausado: nadie puede reservar'}
        derecha={mpConectado ? (
          <button type="button" role="switch" aria-checked={acepta} aria-label="Recibir reservaciones" disabled={guardandoConfig}
            onClick={() => (acepta ? pausar() : publicar())}
            className={`relative h-[28px] w-[50px] rounded-full transition-colors disabled:opacity-60 ${acepta ? 'bg-jungle-600' : 'bg-jungle-200'}`}>
            <span className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-all duration-200 ${acepta ? 'left-[25px]' : 'left-[3px]'}`} />
          </button>
        ) : undefined}>
        {!mpConectado ? (
          // La cuenta conectada se sigue pudiendo ver/desconectar desde Enlaces y pagos.
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
            <p className="text-xs text-amber-700 mb-2">
              Conecta tu cuenta de Mercado Pago — es a donde te va a llegar tu parte de cada reservación.
            </p>
            <button
              onClick={onConectarMp}
              disabled={conectandoMp}
              className="w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white py-2.5 rounded-xl text-xs font-semibold transition-colors"
            >
              {conectandoMp ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Conectar con Mercado Pago
            </button>
          </div>
        ) : (
          <p className="text-xs text-jungle-500 leading-relaxed">
            Mercado Pago conectado · TuxtlasGO retiene 15 % por reservación pagada; tú recibes 85 % directo a tu cuenta.
          </p>
        )}
      </TarjetaFormulario>

      {mpConectado && (
        <TarjetaFormulario Icono={ShieldCheck} titulo="Reglas" ayuda="Cómo funcionan tus reservaciones" orden={1}>
          <SeccionRegla Icono={History} titulo="Si el cliente cancela" resumen={resumenPol} abierta={abierta.pol} onAlternar={() => alternar('pol')}>
            <div className="grid grid-cols-2 gap-2.5">
              {opcionPol('flexible', CheckCircle2, 'Flexible', 'Gratis hasta 24–48 h antes')}
              {opcionPol('no_reembolsable', Lock, 'No reembolsable', 'Sin cancelación ni reembolso')}
            </div>
            <p className="text-xs text-jungle-500 mt-2.5 leading-snug">
              {politicaDraft === 'flexible' ? 'El cliente se siente más seguro y suele reservar más.' : 'Más barata para el cliente y proteges tu agenda de huecos.'}
            </p>
          </SeccionRegla>

          <SeccionRegla Icono={Coins} titulo="Anticipo para confirmar" resumen={resumenAnt} abierta={abierta.ant} onAlternar={() => alternar('ant')}>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chipMonto(!otroMonto && !montoDraft.trim())} onClick={() => { setOtroMonto(false); setMontoDraft(''); }}>Sin anticipo</button>
              {ANTICIPOS.map((v) => (
                <button key={v} type="button" className={chipMonto(!otroMonto && montoDraftNum === v)} onClick={() => { setOtroMonto(false); setMontoDraft(String(v)); }}>${v}</button>
              ))}
              <button type="button" className={chipMonto(otroMonto)} onClick={() => setOtroMonto(true)}>Otro monto</button>
            </div>
            {otroMonto && (
              <div className="relative mt-3">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-jungle-400 font-bold">$</span>
                <input type="number" min={0} inputMode="numeric" value={montoDraft} onChange={(e) => setMontoDraft(e.target.value)} placeholder="Monto en MXN" autoFocus
                  className="w-full h-12 rounded-xl border-[1.5px] border-jungle-100 bg-white pl-8 pr-16 text-lg font-bold text-jungle-950 focus:outline-none focus:border-jungle-600 focus:ring-4 focus:ring-jungle-600/10" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-jungle-400 text-xs font-bold">MXN</span>
              </div>
            )}
            <p className="text-xs text-jungle-500 mt-2.5 leading-snug">Es lo que el cliente paga al reservar para asegurar su lugar (10–20 % es lo usual). Es opcional.</p>
          </SeccionRegla>

          <SeccionRegla Icono={Globe} titulo="Turistas extranjeros" resumen={resumenUsd} abierta={abierta.usd} onAlternar={() => alternar('usd')}>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-jungle-950">Mostrar el anticipo también en dólares</p>
                {mostrarUsdDraft && montoUsd !== null && <p className="text-xs text-jungle-500 mt-0.5">≈ ${montoUsd} USD (tasa de referencia, no en vivo)</p>}
              </div>
              <button type="button" role="switch" aria-checked={mostrarUsdDraft} aria-label="Mostrar en dólares" onClick={() => setMostrarUsdDraft((v) => !v)}
                className={`relative h-[28px] w-[50px] rounded-full flex-shrink-0 transition-colors ${mostrarUsdDraft ? 'bg-jungle-600' : 'bg-jungle-200'}`}>
                <span className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-all duration-200 ${mostrarUsdDraft ? 'left-[25px]' : 'left-[3px]'}`} />
              </button>
            </div>
          </SeccionRegla>

          {!acepta && (
            <p className="text-xs text-jungle-500 pt-3 border-t border-jungle-100 leading-snug">
              Cuando estén a tu gusto, activa “Recibir reservaciones” arriba para publicarlas.
            </p>
          )}
        </TarjetaFormulario>
      )}

      {/* Solicitudes entrantes */}
      <div className="bg-white rounded-2xl border border-jungle-100 p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <p className="text-sm font-semibold text-jungle-900 flex-shrink-0">Solicitudes</p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMostrarBusquedaSolicitudes(v => !v)}
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${mostrarBusquedaSolicitudes ? 'bg-jungle-700 text-white' : 'bg-jungle-50 text-jungle-600 hover:bg-jungle-100'}`}
              title="Buscar solicitudes"
              aria-label="Buscar solicitudes"
            >
              <Search size={14} />
            </button>
            <button
              onClick={() => setOcultarResueltasAntiguas(v => !v)}
              className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-full flex-shrink-0 whitespace-nowrap ${ocultarResueltasAntiguas ? 'bg-jungle-700 text-white' : 'bg-jungle-50 text-jungle-600 hover:bg-jungle-100'}`}
              title="Ocultar rechazadas y canceladas"
            >
              {ocultarResueltasAntiguas ? 'Mostrar todo' : 'Limpiar solicitudes'}
            </button>
          </div>
        </div>
        {mostrarBusquedaSolicitudes && (
          <input
            value={busquedaSolicitudes}
            onChange={(e) => setBusquedaSolicitudes(e.target.value)}
            placeholder="Buscar por nombre del viajero…"
            autoFocus
            className="w-full bg-jungle-50 rounded-xl px-3.5 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-jungle-400"
          />
        )}
        {cargando && (
          <div className="text-center py-6 text-jungle-400">
            <Loader2 size={22} className="animate-spin mx-auto mb-2" />
            <p className="text-xs">Cargando…</p>
          </div>
        )}
        {!cargando && pendientesFiltradas.length === 0 && resueltasFiltradas.length === 0 && (
          <p className="text-xs text-jungle-400 text-center py-4">
            {busquedaSolicitudes ? 'Nadie coincide con esa búsqueda.' : 'Todavía no tienes solicitudes de reservación.'}
          </p>
        )}
        {!cargando && pendientesFiltradas.length > 0 && (
          <div className="space-y-2.5 mb-3">
            {pendientesFiltradas.map(r => (
              <div key={r.id} className="border border-amber-200 bg-amber-50 rounded-xl p-3">
                <div className="flex items-start justify-between mb-1">
                  <p className="text-sm font-semibold text-jungle-900">{r.nombre_viajero}</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">Pendiente</span>
                </div>
                <p className="text-xs text-jungle-600">
                  {new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })} · {r.numero_personas} persona{r.numero_personas > 1 ? 's' : ''}
                </p>
                {r.presupuesto && <p className="text-xs text-jungle-500 mt-0.5">Presupuesto: {r.presupuesto}</p>}
                {r.notas && <p className="text-xs text-jungle-500 mt-0.5 italic">"{r.notas}"</p>}
                <button
                  onClick={() => onAbrirChat(r.id, r.nombre_viajero)}
                  className="relative text-xs font-semibold text-jungle-700 hover:text-jungle-900 flex items-center gap-1 mt-2"
                >
                  <MessageCircle size={13} /> Mensajes
                  {!!r.mensajes_no_leidos && (
                    <span className="absolute -top-1.5 -left-1 -translate-x-full bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                      {r.mensajes_no_leidos}
                    </span>
                  )}
                </button>
                <div className="flex gap-2 mt-2.5">
                  <button onClick={() => onResponder(r.id, 'confirmar')}
                    className="flex-1 bg-jungle-700 hover:bg-jungle-800 text-white text-xs font-semibold py-2 rounded-lg">
                    Confirmar
                  </button>
                  <button onClick={() => onResponder(r.id, 'rechazar')}
                    className="flex-1 bg-white border border-jungle-200 hover:bg-jungle-50 text-jungle-700 text-xs font-semibold py-2 rounded-lg">
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {!cargando && resueltasFiltradas.length > 0 && (
          <div className="space-y-2">
            {resueltasFiltradas.map(r => (
              <div key={r.id} className="flex items-center justify-between border-t border-jungle-100 pt-2.5">
                <div>
                  <p className="text-xs font-semibold text-jungle-800">{r.nombre_viajero}</p>
                  <p className="text-[11px] text-jungle-400">
                    {new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  </p>
                  {r.estado === 'confirmada' && r.pago_estado !== 'pagado' && r.pago_vencimiento && (
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      Esperando pago hasta {new Date(r.pago_vencimiento).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} {new Date(r.pago_vencimiento).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {r.estado === 'confirmada' && (
                    <button onClick={() => onAbrirChat(r.id, r.nombre_viajero)} className="relative text-jungle-500 hover:text-jungle-800 p-1">
                      <MessageCircle size={14} />
                      {!!r.mensajes_no_leidos && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                          {r.mensajes_no_leidos}
                        </span>
                      )}
                    </button>
                  )}
                  {r.estado === 'confirmada' && r.pago_estado === 'pagado' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">$ Pagado</span>
                  )}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    r.estado === 'confirmada' ? 'bg-green-100 text-green-800'
                    : r.estado === 'rechazada' ? 'bg-red-100 text-red-800'
                    : 'bg-jungle-100 text-jungle-500'
                  }`}>
                    {r.estado === 'confirmada' ? 'Confirmada' : r.estado === 'rechazada' ? 'Rechazada' : 'Cancelada'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {acepta && mpConectado && (
        <TarjetaFormulario Icono={CalendarDays} titulo="Tu calendario" ayuda="Reservas, días bloqueados y tu horario en un solo lugar" orden={3}>
          <Suspense fallback={<CargandoCampo alto={380} />}>
            <CalendarioReservas
              reservaciones={reservaciones ?? []}
              fechasBloqueadas={bloqueadas}
              horario={horarioSemana}
              onGuardarFechas={onGuardarFechas}
              onResponder={onResponder}
              onAbrirChat={onAbrirChat}
            />
          </Suspense>
        </TarjetaFormulario>
      )}

      {/* Zona discreta: borrar toda la configuración de reservaciones */}
      {mpConectado && (acepta || guardadoMonto != null || !!servicio.politica_cancelacion) && (
        <div className="pt-3 pb-1 text-center">
          <button type="button" onClick={eliminar} disabled={guardandoConfig}
            className="text-xs text-jungle-400 hover:text-red-600 underline underline-offset-2 decoration-jungle-200 hover:decoration-red-300 disabled:opacity-50">
            Eliminar reservaciones de este servicio
          </button>
        </div>
      )}

      {sucio && (
        <div className="sticky bottom-[84px] lg:bottom-4 z-30 flex items-center gap-2.5 rounded-2xl bg-jungle-950 text-white pl-4 pr-2.5 py-2.5 shadow-2xl animate-fade-in" role="status">
          <span className="flex-1 text-[13.5px] font-semibold">Tienes cambios sin guardar</span>
          <button type="button" onClick={descartar} className="h-10 px-3 text-sm font-bold text-jungle-200">Descartar</button>
          <button type="button" onClick={guardarCambios} disabled={guardandoConfig}
            className="h-10 px-5 rounded-xl bg-jungle-400 text-jungle-950 text-sm font-bold flex items-center gap-1.5 disabled:opacity-60">
            {guardandoConfig && <Loader2 size={15} className="animate-spin" />} Guardar
          </button>
        </div>
      )}
    </div>
  );
}

function PanelResumenPrestador({
  servicio, fotos, enlaces, labelEstado, onCerrar,
}: {
  servicio: ServicioAPI;
  fotos: string[];
  enlaces: EnlaceServicio[];
  labelEstado: string;
  onCerrar: () => void;
}) {
  const [pagando, setPagando] = useState(false);
  const [errorPago, setErrorPago] = useState('');

  const premiumActivo = !!servicio.premium && (!servicio.premium_hasta || new Date(servicio.premium_hasta) > new Date());

  // Estadísticas reales — antes esto era un $0.00 fijo y ninguna
  // gráfica. Se piden solo al abrir el panel (no en cada render).
  const [stats, setStats] = useState<EstadisticasServicio | null>(null);
  const [cargandoStats, setCargandoStats] = useState(true);
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch('/api/servicios/editar?recurso=estadisticas', {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (!cancelado && data.ok) setStats(data);
      } catch { /* sin conexión — se queda el shell de abajo */ }
      if (!cancelado) setCargandoStats(false);
    })();
    return () => { cancelado = true; };
  }, []);

  async function pagarPremium() {
    setPagando(true);
    setErrorPago('');
    try {
      const res = await fetch('/api/pagos/mercadopago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url; // redirige al checkout de Mercado Pago
      } else {
        setErrorPago(data.error ?? 'No se pudo iniciar el pago');
        setPagando(false);
      }
    } catch {
      setErrorPago('Sin conexión. Verifica tu internet.');
      setPagando(false);
    }
  }

  const ganancias = stats ? formatearMXNCompleto(stats.ganancias) : null;

  return (
    <div className="fixed inset-0 z-[80] bg-obsidiana-950/50 flex items-end sm:items-center justify-center" onClick={onCerrar}>
      <div
        className="bg-jungle-50 w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-jungle-50/95 backdrop-blur px-4 pt-4 pb-2 flex items-center justify-between">
          <h2 className="font-display font-bold text-jungle-950">Ganancias y estadísticas</h2>
          <button onClick={onCerrar} className="text-jungle-400 hover:text-jungle-700 p-1"><X size={20} /></button>
        </div>

        <div className="px-4 pb-6 space-y-3">
          {/* Ganancias reales — suma de anticipos ya pagados de tus
              reservaciones (94% que te toca, sin el 6% de comisión). */}
          <div className="bg-gradient-to-br from-jungle-900 to-jungle-950 rounded-2xl p-5 text-white relative overflow-hidden">
            <DollarSign size={72} className="absolute -right-3 -bottom-3 text-white/5" />
            <p className="text-xs text-jungle-300 uppercase tracking-wide font-semibold mb-1">Ganancias totales</p>
            <p className="font-display font-extrabold text-3xl">
              {cargandoStats ? '···' : (ganancias ?? '$0.00 MXN')}
            </p>
            <p className="text-xs text-jungle-300 mt-2 relative">
              {stats && stats.reservasPagadas > 0
                ? `De ${stats.reservasPagadas} reservación${stats.reservasPagadas > 1 ? 'es' : ''} pagada${stats.reservasPagadas > 1 ? 's' : ''}, ya con el 6% de comisión descontado.`
                : servicio.acepta_reservaciones
                  ? 'Todavía no tienes anticipos pagados — aparecerán aquí en cuanto un turista pague.'
                  : 'Activa reservaciones (pestaña Reservaciones) para empezar a cobrar anticipos.'}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-jungle-100 p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-jungle-900">Plan Premium</p>
              {premiumActivo && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800">Activo</span>
              )}
            </div>
            <p className="text-xs text-jungle-500 mb-3">
              Prioridad en las recomendaciones del asistente de IA — $89 MXN/mes.
            </p>

            {premiumActivo ? (
              <p className="text-xs text-jungle-600 bg-jungle-50 rounded-xl px-3 py-2.5">
                Activo hasta el {servicio.premium_hasta ? new Date(servicio.premium_hasta).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}.
              </p>
            ) : (
              <>
                <button
                  onClick={pagarPremium}
                  disabled={pagando}
                  className="w-full flex items-center justify-center gap-2 bg-jungle-700 hover:bg-jungle-800 disabled:opacity-60 text-white py-3 rounded-xl text-sm font-semibold"
                >
                  {pagando ? <Loader2 size={16} className="animate-spin" /> : <DollarSign size={16} />}
                  Desbloquear Premium — $89 MXN
                </button>
                <p className="text-[11px] text-jungle-400 mt-2">
                  Pagas con tarjeta, SPEI o efectivo en OXXO — se procesa con Mercado Pago.
                  Si pagas con SPEI u OXXO, la activación puede tardar unas horas.
                </p>
                {errorPago && <p className="text-xs text-red-600 mt-2">{errorPago}</p>}
              </>
            )}
          </div>

          {/* Interés real — quién lo vio, cuántos le dieron like, y
              cuántas veces lo recomendó la IA. Esto reemplaza el
              módulo que antes no mostraba ninguna gráfica. */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <TarjetaStat icono={Search} label="Vistas de tu ficha" valor={cargandoStats ? '···' : String(stats?.vistas ?? 0)} />
            <TarjetaStat icono={CheckCircle2} label="Le gustó a la gente" valor={cargandoStats ? '···' : String(stats?.likes ?? 0)} />
            <TarjetaStat icono={BarChart3} label="Recomendado por IA" valor={cargandoStats ? '···' : String(stats?.iaRecomendaciones ?? 0)} />
            <TarjetaStat icono={DollarSign} label="% que vio y le gustó" valor={cargandoStats ? '···' : `${stats?.porcentajeLike ?? 0}%`} />
          </div>

          {!cargandoStats && stats && stats.serie.some(d => d.vistas + d.likes + d.ia_recomendaciones > 0) && (
            <div className="bg-white rounded-2xl border border-jungle-100 p-4 space-y-3">
              <p className="text-xs font-semibold text-jungle-500 uppercase tracking-wide flex items-center gap-1.5">
                <BarChart3 size={12} /> Últimos 14 días
              </p>
              <div>
                <p className="text-[11px] font-semibold text-jungle-600 mb-1">Vistas</p>
                <GraficaMini datos={stats.serie.map(d => ({ dia: d.dia, valor: d.vistas }))} color="#15803d" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-jungle-600 mb-1">Le gustó</p>
                <GraficaMini datos={stats.serie.map(d => ({ dia: d.dia, valor: d.likes }))} color="#dc2626" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-jungle-600 mb-1">Recomendado por IA</p>
                <GraficaMini datos={stats.serie.map(d => ({ dia: d.dia, valor: d.ia_recomendaciones }))} color="#2563eb" />
              </div>
            </div>
          )}
          {!cargandoStats && stats && stats.vistas === 0 && (
            <p className="text-[11px] text-jungle-400 text-center px-2">
              Todavía no hay actividad registrada — en cuanto alguien vea tu ficha, la des favorito o la IA la recomiende en el chat, aparecerá aquí.
            </p>
          )}

          {/* Estadísticas — solo métricas reales y calculables con lo
              que ya tenemos, nada inventado. */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <TarjetaStat icono={Calendar} label="Prestador desde" valor={servicio.creado_en ? formatearMes(servicio.creado_en) : '—'} />
            <TarjetaStat icono={CheckCircle2} label="Estado" valor={labelEstado} />
            <TarjetaStat icono={ImagePlus} label="Fotos subidas" valor={String(fotos.length)} />
            <TarjetaStat icono={Link2} label="Enlaces agregados" valor={String(enlaces.length)} />
          </div>
          <div className="bg-white rounded-2xl border border-jungle-100 p-4">
            <p className="text-xs font-semibold text-jungle-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <BarChart3 size={12} /> Perfil completo
            </p>
            <BarraPerfilCompleto servicio={servicio} fotos={fotos} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Modal — "¿Cómo te gustaría que te pagaran?" — solo guarda el dato
// por ahora (a dónde le llega su parte al prestador). El reparto
// automático real (94%/6%) llega junto con el módulo de reservas.

// ─────────────── Selectores estructurados de Mi Servicio ───────────
// Antes eran texto libre — la IA necesita formatos consistentes para
// poder leerlos bien, así que ahora son selectores/pickers que arman
// el mismo tipo de texto que ya se usaba, no cambia nada del backend.



const OPCIONES_DURACION_EDICION = ['30 minutos', '1 hora', '1-2 horas', '2-3 horas', '3-4 horas', 'Medio día', 'Día completo', 'Variable'];

function SelectorDuracion({ valor, onCambiar }: { valor: string; onCambiar: (s: string) => void }) {
  const esPersonalizado = !!valor && !OPCIONES_DURACION_EDICION.includes(valor);
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {OPCIONES_DURACION_EDICION.map((op) => (
          <button key={op} type="button" onClick={() => onCambiar(op)}
            className={`min-h-[44px] px-4 rounded-full border-[1.5px] text-sm font-semibold transition-colors ${valor === op ? 'bg-jungle-700 border-jungle-700 text-white' : 'bg-white/80 border-jungle-100 text-jungle-800 hover:border-jungle-300'}`}>
            {op}
          </button>
        ))}
      </div>
      {esPersonalizado && (
        <input value={valor} onChange={(e) => onCambiar(e.target.value)}
          className="w-full rounded-xl border-[1.5px] border-jungle-100 bg-white/90 px-4 py-3 text-[15px] font-medium text-jungle-950 mt-3 focus:outline-none focus:border-jungle-600 focus:ring-4 focus:ring-jungle-600/10" />
      )}
    </div>
  );
}

function TarjetaStat({ icono: Icono, label, valor }: { icono: typeof Calendar; label: string; valor: string }) {
  return (
    <div className="bg-white rounded-2xl border border-jungle-100 p-3.5">
      <div className="flex items-center gap-1.5 text-jungle-400 mb-1.5">
        <Icono size={13} />
        <span className="text-[10px] uppercase tracking-wide font-semibold">{label}</span>
      </div>
      <p className="font-display font-bold text-sm text-jungle-950">{valor}</p>
    </div>
  );
}

// Perfil completo — % calculado con datos reales (nada supuesto):
// cuenta cuántos de los campos opcionales que sí existen en el
// servicio ya están llenos. No es una métrica de "engagement", es
// solo qué tan completa está la ficha.
function BarraPerfilCompleto({ servicio, fotos }: { servicio: ServicioAPI; fotos: string[] }) {
  const campos = [
    !!servicio.horario, !!servicio.como_llegar, !!servicio.tip,
    !!servicio.mascotas, fotos.length > 0, parseIdeal(servicio.ideal_para).length > 0,
  ];
  const llenos = campos.filter(Boolean).length;
  const porcentaje = Math.round((llenos / campos.length) * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-bold text-jungle-900">{porcentaje}%</span>
        <span className="text-xs text-jungle-400">{llenos} de {campos.length} campos</span>
      </div>
      <div className="h-2 bg-jungle-100 rounded-full overflow-hidden">
        <div className="h-full bg-jungle-600 rounded-full transition-all" style={{ width: `${porcentaje}%` }} />
      </div>
      {porcentaje < 100 && (
        <p className="text-xs text-jungle-500 mt-2">
          Completa horario, cómo llegar, consejo, mascotas, fotos e "ideal para" en Mi Servicio para llegar al 100%.
        </p>
      )}
    </div>
  );
}

// Tarjeta de solo lectura para una sección de "Mi Servicio", con su
// propio lápiz de editar — reemplaza al formulario único gigante.
function SeccionServicio({ titulo, onEditar, children }: { titulo: string; onEditar: () => void; children: React.ReactNode }) {
  return (
    <div className="border border-jungle-100 rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[11px] font-bold text-jungle-400 uppercase tracking-wide">{titulo}</p>
        <button onClick={onEditar} className="text-jungle-500 hover:text-jungle-800 hover:bg-jungle-50 p-1.5 -m-1.5 rounded-lg transition-colors"
          aria-label={`Editar ${titulo}`}>
          <Edit3 size={14} />
        </button>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// Modal enfocado en UNA sección de "Mi Servicio" — mismo patrón visual
// que AuthModal (hoja desde abajo en móvil, centrado en escritorio),
// para que editar el negocio se sienta igual de simple que iniciar
// sesión, en vez de la pared de campos de antes.
// Una regla con su resumen y su lápiz: al tocarlo se despliega para editarla.
function SeccionRegla({ Icono, titulo, resumen, abierta, onAlternar, children }: {
  Icono: LucideIcon; titulo: string; resumen: string; abierta: boolean; onAlternar: () => void; children: React.ReactNode;
}) {
  return (
    <section className="py-4 border-t border-jungle-100 first-of-type:border-t-0 first-of-type:pt-0">
      <div className="flex items-center gap-3">
        <span className="h-9 w-9 rounded-xl bg-jungle-50 ring-1 ring-jungle-100 text-jungle-700 flex items-center justify-center flex-shrink-0">
          <Icono size={17} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-[14.5px] text-jungle-950 leading-tight">{titulo}</p>
          <p className="text-[13.5px] font-bold text-jungle-700 mt-0.5 leading-snug">{resumen}</p>
        </div>
        <button type="button" onClick={onAlternar} aria-expanded={abierta} aria-label={`${abierta ? 'Cerrar' : 'Editar'} ${titulo}`}
          className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${abierta ? 'bg-jungle-700 text-white' : 'bg-jungle-50 text-jungle-700 ring-1 ring-jungle-100 hover:bg-jungle-100'}`}>
          {abierta ? <Check size={17} /> : <Pencil size={16} />}
        </button>
      </div>
      <div className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${abierta ? 'grid-rows-[1fr] opacity-100 mt-3.5' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
        <div className="overflow-hidden min-h-0">{children}</div>
      </div>
    </section>
  );
}

// Tarjeta de vidrio para separar los bloques de un formulario: título con icono,
// fondo translúcido y entrada escalonada (orden = posición para el retraso).
function TarjetaFormulario({
  Icono, titulo, ayuda, orden = 0, className = '', derecha, children,
}: {
  Icono: LucideIcon; titulo: string; ayuda?: string; orden?: number; className?: string; derecha?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.07 * orden, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-2xl bg-white/85 border border-white/90 ring-1 ring-jungle-100/70 shadow-[0_8px_28px_rgba(20,83,45,0.08)] p-4 lg:p-5 min-w-0 ${className}`}
    >
      <header className="flex items-center gap-3 mb-4">
        <span className="h-9 w-9 rounded-xl bg-jungle-50 ring-1 ring-jungle-100 text-jungle-700 flex items-center justify-center flex-shrink-0">
          <Icono size={18} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display font-bold text-[15px] text-jungle-950 leading-tight">{titulo}</h3>
          {ayuda && <p className="text-xs text-jungle-500 mt-0.5 leading-snug">{ayuda}</p>}
        </div>
        {derecha && <div className="ml-auto flex-shrink-0">{derecha}</div>}
      </header>
      {children}
    </motion.section>
  );
}

function ModalEditarSeccion({
  titulo, onClose, onGuardar, guardando, children, textoGuardar, formulario, subtitulo,
}: {
  titulo: string; onClose: () => void; onGuardar: () => void; guardando: boolean; children: React.ReactNode; textoGuardar?: string;
  /** Pantalla completa en celular y dos columnas en PC (los hijos son las 2 columnas). */
  formulario?: boolean; subtitulo?: string;
}) {
  if (formulario) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(2,44,22,0.6)', backdropFilter: 'blur(3px)' }}
        className="flex lg:items-center lg:justify-center lg:p-8">
        <div className="bg-white w-full h-full lg:h-[min(700px,90vh)] lg:max-w-5xl lg:rounded-3xl lg:shadow-2xl flex flex-col overflow-hidden animate-fade-in">
          <div className="flex items-center gap-3 px-4 lg:px-7 py-3.5 border-b border-jungle-100 bg-white/85 backdrop-blur-xl flex-none">
            <div className="min-w-0">
              <h2 className="font-display font-extrabold text-lg text-jungle-950 leading-tight">{titulo}</h2>
              {subtitulo && <p className="text-xs text-jungle-500 mt-0.5">{subtitulo}</p>}
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="ml-auto h-11 w-11 rounded-xl flex items-center justify-center text-jungle-600 hover:bg-jungle-50"><X size={22} /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 lg:px-7 py-5 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-6 lg:overflow-hidden bg-gradient-to-b from-jungle-50 via-jungle-50/60 to-white">
            {children}
          </div>
          <div className="flex gap-3 px-4 lg:px-7 py-3 lg:justify-end border-t border-jungle-100 bg-white/90 backdrop-blur-xl flex-none" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
            <button onClick={onClose} className="px-6 bg-jungle-50 hover:bg-jungle-100 text-jungle-800 py-3.5 rounded-xl text-sm font-bold">Cancelar</button>
            <button onClick={onGuardar} disabled={guardando}
              className="flex-1 lg:flex-none lg:px-9 bg-jungle-700 hover:bg-jungle-800 disabled:opacity-60 text-white py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {textoGuardar ?? 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(2,44,22,0.85)', display: 'flex', alignItems: 'flex-end' }}
      className="lg:!items-center lg:!justify-center lg:p-8">
      <div className="bg-white w-full rounded-t-3xl lg:rounded-3xl max-h-[92vh] overflow-y-auto lg:max-w-lg lg:max-h-[90vh] lg:shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-jungle-100 px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
          <h2 className="font-display font-extrabold text-lg text-jungle-950">{titulo}</h2>
          <button onClick={onClose} className="text-jungle-400 hover:text-jungle-700 p-1"><X size={22} /></button>
        </div>
        <div className="px-6 py-6 space-y-4">
          {children}
          <div className="flex gap-3 pt-2">
            <button onClick={onGuardar} disabled={guardando}
              className="flex-1 bg-jungle-700 hover:bg-jungle-800 disabled:opacity-60 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {textoGuardar ?? 'Guardar cambios'}
            </button>
            <button onClick={onClose}
              className="px-5 bg-jungle-100 hover:bg-jungle-200 text-jungle-700 py-3 rounded-xl text-sm font-semibold">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoFila({ icono, label, valor }: { icono: React.ReactNode; label: string; valor?: string | null }) {
  if (!valor) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="text-jungle-400 mt-0.5 flex-shrink-0 w-4">{icono}</span>
      <div>
        <p className="text-[10px] text-jungle-400 uppercase tracking-wide font-semibold leading-none mb-0.5">{label}</p>
        <p className="text-sm text-jungle-800">{valor}</p>
      </div>
    </div>
  );
}

