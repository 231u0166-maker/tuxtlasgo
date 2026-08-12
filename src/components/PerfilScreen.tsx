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

import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Camera, Edit3, Save, Clock, Phone,
  Loader2, CheckCircle2, Store, RefreshCw, ImagePlus, X,
  Link2, DollarSign, BarChart3, Plus, Trash2, Instagram, Facebook,
  MessageCircle, Globe, Calendar, ChevronRight, Search,
} from 'lucide-react';
import { getToken, getUsuarioLocal, setUsuarioLocal, type UsuarioSesion } from '../lib/auth';
import { subirFoto, type ProgresoSubida } from '../lib/cloudinary';
import { servicioComoLugar } from '../lib/db';
import GestorFotos from './GestorFotos';
import type { Lugar } from '../data/lugares';
import { CATEGORIAS } from '../data/lugares';
import { recargarCatalogo } from '../App';
import { TIPOS_ENLACE, nuevoEnlaceId, parseEnlaces, type EnlaceServicio, type TipoEnlace } from '../lib/enlaces';
import { useHojaArrastrable } from '../lib/useHojaArrastrable';
import ChatReservacion from './ChatReservacion';

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
  { id: 'pareja', label: '💕 Parejas' },
  { id: 'familia', label: '👨‍👩‍👧 Familias' },
  { id: 'grupos', label: '🎉 Grupos' },
  { id: 'solo', label: '🧭 Viajeros solos' },
];

const COLORES_ESTADO: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-800',
  aprobado: 'bg-green-100 text-green-800',
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
  const usuario = getUsuarioLocal();

  if (!usuario) {
    return (
      <div className="min-h-screen bg-jungle-50 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-jungle-600 mb-4 font-medium">
            Inicia sesión para ver tu perfil.
          </p>
          <button
            onClick={onIniciarSesion ?? onVolver}
            className="bg-jungle-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold"
          >
            Iniciar sesión
          </button>
          <Link
            to="/prestador"
            className="block mt-3 text-sm font-semibold text-jungle-700 underline underline-offset-2"
          >
            Soy prestador
          </Link>
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
          className="lg:hidden absolute top-3 right-3 z-10 bg-white/90 backdrop-blur shadow-sm rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-100"
        >
          Cerrar sesión
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
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState<FormUsuario>({ nombre: usuario.nombre, bio: '' });
  const [fotoSubiendo, setFotoSubiendo] = useState(false);
  const [fotoPerfil, setFotoPerfil] = useState(usuario.foto_url ?? '');
  // Álbum de fotos del turista
  const [album, setAlbum] = useState<string[]>([]);
  const [subiendoAlbum, setSubiendoAlbum] = useState(false);
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const inputAlbumRef = useRef<HTMLInputElement>(null);

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
      .catch(() => { });
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
    }).catch(() => { });
  }

  const iniciales = usuario.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-jungle-50 pb-10">
      {/* Header */}
      <div className="bg-gradient-to-br from-jungle-800 to-jungle-950 px-4 pt-5 pb-24">
        <div className="flex items-center justify-between">
          <button onClick={onVolver} className="flex items-center gap-1 text-jungle-200 hover:text-white text-sm">
            <ArrowLeft size={16} /> Inicio
          </button>
          <span className="text-xs bg-jungle-700 text-jungle-200 px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide">
            Turista
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
              <label className="text-xs font-semibold text-jungle-600 mb-1.5 block">Sobre mí</label>
              <textarea
                value={form.bio}
                onChange={e => setForm({ ...form, bio: e.target.value })}
                placeholder="Cuéntales a los demás sobre ti…"
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
                  Guardar
                </button>
                <button
                  onClick={() => setEditando(false)}
                  className="px-4 bg-jungle-100 hover:bg-jungle-200 text-jungle-700 py-2.5 rounded-xl text-sm font-semibold"
                >
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-jungle-700 leading-relaxed">
                {form.bio || (
                  <span className="text-jungle-400 italic">Sin descripción todavía. ¡Cuéntanos sobre ti!</span>
                )}
              </p>
              <button
                onClick={() => setEditando(true)}
                className="mt-3 flex items-center gap-1.5 text-xs text-jungle-600 hover:text-jungle-900 font-semibold"
              >
                <Edit3 size={12} /> Editar perfil
              </button>
            </>
          )}
        </div>
      </div>

      {/* Álbum de fotos */}
      <div className="px-4">
        <div className="bg-white rounded-2xl border border-jungle-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-jungle-900 text-sm">📷 Mis fotos</h2>
            <button
              onClick={() => inputAlbumRef.current?.click()}
              disabled={subiendoAlbum}
              className="flex items-center gap-1.5 text-xs font-semibold text-jungle-600 hover:text-jungle-900 bg-jungle-50 px-3 py-1.5 rounded-full border border-jungle-100"
            >
              {subiendoAlbum
                ? <Loader2 size={13} className="animate-spin" />
                : <ImagePlus size={13} />
              }
              {subiendoAlbum ? 'Subiendo…' : 'Agregar'}
            </button>
            <input ref={inputAlbumRef} type="file" accept="image/*" className="hidden" onChange={agregarAlAlbum} />
          </div>

          {album.length === 0 ? (
            <div className="text-center py-8 text-jungle-300">
              <ImagePlus size={32} className="mx-auto mb-2" />
              <p className="text-sm text-jungle-400">Aún no tienes fotos. ¡Comparte tu experiencia en Los Tuxtlas!</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {album.map((url, i) => (
                <div key={i} className="relative aspect-square">
                  <img src={url} alt="" className="w-full h-full object-cover rounded-xl" />
                  <button
                    onClick={() => eliminarFotoAlbum(url)}
                    className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center"
                  >
                    <X size={12} className="text-white" />
                  </button>
                </div>
              ))}
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
type TabPrincipal = 'servicio' | 'fotos' | 'preview' | 'reservaciones' | 'externa';

function PerfilPrestador({
  usuario,
  onVolver,
}: {
  usuario: UsuarioSesion;
  onVolver: () => void;
}) {
  const [tab, setTab] = useState<TabPrincipal>('servicio');
  const [servicio, setServicio] = useState<ServicioAPI | null>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);
  const [enlaces, setEnlaces] = useState<EnlaceServicio[]>([]);
  const [guardandoEnlaces, setGuardandoEnlaces] = useState(false);
  const [nuevoTipoEnlace, setNuevoTipoEnlace] = useState<TipoEnlace>('instagram');
  const [nuevaUrlEnlace, setNuevaUrlEnlace] = useState('');
  const [mostrarResumen, setMostrarResumen] = useState(false);
  const [mensajePremium, setMensajePremium] = useState<{ tipo: 'exito' | 'error' | 'pendiente'; texto: string } | null>(null);
  const [form, setForm] = useState<FormServicio>({
    nombre: '', categoria: '', municipio: '', descripcion: '',
    precio: '', contacto: '', horario: '', dias_abierto: '',
    duracion: '', como_llegar: '', tip: '', mascotas: '', ideal_para: [],
  });

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
        setForm({
          nombre: srv.nombre ?? '',
          categoria: srv.categoria ?? '',
          municipio: srv.municipio ?? '',
          descripcion: srv.descripcion ?? '',
          precio: srv.precio ?? '',
          contacto: srv.contacto ?? '',
          horario: srv.horario ?? '',
          dias_abierto: srv.dias_abierto ?? '',
          duracion: srv.duracion ?? '',
          como_llegar: srv.como_llegar ?? '',
          tip: srv.tip ?? '',
          mascotas: srv.mascotas ?? '',
          ideal_para: parseIdeal(srv.ideal_para),
        });
      } else {
        setServicio(null);
      }
    } catch {
      setError('Sin conexión. Verifica tu internet.');
    }
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    if (tab !== 'reservaciones') return;
    cargarReservacionesEntrantes();
    const intervalo = setInterval(cargarReservacionesEntrantes, 8000); // antes solo cargaba al cambiar de tab
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
    cargar();
  }, []);

  async function guardar() {
    setGuardando(true);
    setExito(false);
    try {
      const res = await fetch('/api/servicios/editar', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        const srv = {
          ...data.servicio,
          estado: (data.servicio.estado ?? servicio?.estado ?? '').trim().toLowerCase(),
        };
        setServicio(srv);
        setEditando(false);
        setExito(true);
        setTimeout(() => setExito(false), 3000);
        // Actualiza el catálogo en tiempo real — el turista ve los cambios de inmediato
        recargarCatalogo().catch(() => { });
      } else {
        alert(data.error ?? 'Error al guardar');
      }
    } catch {
      alert('Sin conexión. Verifica tu internet.');
    }
    setGuardando(false);
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
        recargarCatalogo().catch(() => { });
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

  async function cargarReservacionesEntrantes() {
    setCargandoReservaciones(true);
    try {
      const res = await fetch('/api/reservaciones', { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.ok) setReservacionesEntrantes(data.reservaciones);
    } catch { /* sin conexión */ }
    setCargandoReservaciones(false);
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
        recargarCatalogo().catch(() => { }); // el turista debe ver el cambio sin recargar la app
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

  function agregarFechaBloqueada() {
    if (!nuevaFechaBloqueada || !servicio) return;
    const actuales = servicio.fechas_bloqueadas ?? [];
    if (actuales.includes(nuevaFechaBloqueada)) { setNuevaFechaBloqueada(''); return; }
    const nuevas = [...actuales, nuevaFechaBloqueada].sort();
    actualizarConfigReservaciones({ fechas_bloqueadas: nuevas });
    setNuevaFechaBloqueada('');
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
          recargarCatalogo().catch(() => { });
        }
      } else {
        alert(data.error ?? 'No se pudo procesar');
      }
    } catch {
      alert('Sin conexión. Verifica tu internet.');
    }
  }

  function agregarEnlace() {
    if (!nuevaUrlEnlace.trim()) return;
    setEnlaces(e => [...e, { id: nuevoEnlaceId(), tipo: nuevoTipoEnlace, url: nuevaUrlEnlace.trim() }]);
    setNuevaUrlEnlace('');
  }

  function eliminarEnlace(id: string) {
    setEnlaces(e => e.filter(x => x.id !== id));
  }

  function buildPreview(): Lugar {
    return servicioComoLugar({
      id: servicio?.id,
      nombreNegocio: form.nombre || servicio?.nombre || 'Mi Negocio',
      categoria: form.categoria || 'Gastronomia',
      municipio: form.municipio || 'Catemaco',
      descripcion: form.descripcion || 'Descripción del servicio.',
      precio: form.precio || '',
      contacto: form.contacto || '',
      ubicacionLat: servicio?.lat ?? 18.42,
      ubicacionLng: servicio?.lng ?? -95.11,
      creadoEn: Date.now(),
      estado: (servicio?.estado ?? 'pendiente') as any,
      horario: form.horario || undefined,
      diasAbierto: form.dias_abierto || undefined,
      duracion: form.duracion || undefined,
      comoLlegar: form.como_llegar || undefined,
      tip: form.tip || undefined,
      mascotas: form.mascotas || undefined,
      idealPara: form.ideal_para.length ? form.ideal_para : undefined,
      foto: fotos[0] || undefined,
    });
  }

  const fotoUrl = usuario.foto_url;
  const iniciales = usuario.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const colorEstado = servicio ? (COLORES_ESTADO[servicio.estado] ?? 'bg-gray-100 text-gray-600') : '';
  const labelEstado = servicio?.estado === 'pendiente' ? '⏳ En revisión'
    : servicio?.estado === 'aprobado' ? '✅ Aprobado'
      : '❌ Rechazado';
  const premiumActivo = !!servicio?.premium && (!servicio?.premium_hasta || new Date(servicio.premium_hasta) > new Date());

  return (
    <div className="min-h-screen bg-jungle-50 pb-10">
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
            <div className={`rounded-xl p-3 mb-3 text-sm flex items-start gap-2 ${mensajePremium.tipo === 'exito' ? 'bg-green-50 text-green-800 border border-green-200'
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
            <p className="font-display font-extrabold text-3xl">$0.00 MXN</p>
            <p className="text-xs text-jungle-300 mt-2 relative flex items-center gap-1">
              Ver estadísticas y Plan Premium <ChevronRight size={13} />
            </p>
          </button>
        </div>
      )}

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
          <div className="px-4 mb-4 flex gap-2 overflow-x-auto">
            {([
              { id: 'servicio' as TabPrincipal, label: '📋 Mi Servicio' },
              { id: 'fotos' as TabPrincipal, label: '📸 Fotos' },
              { id: 'preview' as TabPrincipal, label: '👁️ Preview' },
              { id: 'reservaciones' as TabPrincipal, label: '📅 Reservaciones' },
              { id: 'externa' as TabPrincipal, label: '🔗 Información externa' },
            ]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex-shrink-0 py-2.5 px-2.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${tab === t.id ? 'bg-jungle-700 text-white' : 'bg-white text-jungle-700 border border-jungle-100'
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="px-4">
            {/* ── TAB: Mi Servicio ── */}
            {tab === 'servicio' && (
              <div className="bg-white rounded-2xl border border-jungle-100 p-4 space-y-4">
                {exito && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2 text-sm text-green-800">
                    <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                    Cambios guardados. Tu PlaceCard ya refleja la info actualizada.
                  </div>
                )}
                {servicio.estado === 'rechazado' && servicio.motivo_rechazo && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
                    <strong>Motivo de rechazo:</strong> {servicio.motivo_rechazo}
                  </div>
                )}

                {editando ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-jungle-700 mb-1 block">Nombre del negocio <span className="text-red-500">*</span></label>
                      <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
                        className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-jungle-700 mb-1 block">Categoría</label>
                        <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}
                          className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400">
                          {['Gastronomia', 'Naturaleza', 'Aventura', 'Hospedaje', 'Comercio', 'Cooperativa', 'Otro'].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-jungle-700 mb-1 block">Municipio</label>
                        <select value={form.municipio} onChange={e => setForm({ ...form, municipio: e.target.value })}
                          className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400">
                          {['Catemaco', 'San Andrés Tuxtla', 'Santiago Tuxtla'].map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-jungle-700 mb-1 block">Descripción <span className="text-red-500">*</span></label>
                      <textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })}
                        rows={4} className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 resize-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-jungle-700 mb-1 block">Precio aproximado</label>
                        <SelectorPrecio valor={form.precio} onCambiar={(s) => setForm({ ...form, precio: s })} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-jungle-700 mb-1 block">WhatsApp / correo</label>
                        <SelectorContacto valor={form.contacto} onCambiar={(s) => setForm({ ...form, contacto: s })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-8">
                      <div>
                        <label className="text-xs font-semibold text-jungle-700 mb-1 block"><Clock size={11} className="inline mr-1" />Horario</label>
                        <SelectorHorario valor={form.horario} onCambiar={(s) => setForm({ ...form, horario: s })} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-jungle-700 mb-1 block">Días abierto</label>
                        <SelectorDias valor={form.dias_abierto} onCambiar={(s) => setForm({ ...form, dias_abierto: s })} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-jungle-700 mb-1 block">Duración sugerida de visita</label>
                      <SelectorDuracion valor={form.duracion} onCambiar={(s) => setForm({ ...form, duracion: s })} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-jungle-700 mb-1 block">Cómo llegar</label>
                      <textarea value={form.como_llegar} onChange={e => setForm({ ...form, como_llegar: e.target.value })}
                        placeholder="ej: A 45 minutos de Catemaco por carretera costera."
                        rows={2} className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 resize-none" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-jungle-700 mb-1 block">💡 Consejo para el visitante</label>
                      <input value={form.tip} onChange={e => setForm({ ...form, tip: e.target.value })}
                        placeholder="ej: Lleva efectivo, no siempre hay señal."
                        className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-jungle-700 mb-1 block">🐾 ¿Aceptan mascotas?</label>
                      <input value={form.mascotas} onChange={e => setForm({ ...form, mascotas: e.target.value })}
                        placeholder="ej: Sí, aceptamos perros / No se permiten mascotas / Solo en la terraza"
                        className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                      <p className="text-[11px] text-jungle-500 mt-1">Si lo dejas vacío, el asistente dirá honestamente que no tiene ese dato — nunca lo inventa.</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-jungle-700 mb-2 block">Ideal para</label>
                      <div className="flex flex-wrap gap-2">
                        {IDEAL_OPCIONES.map(op => (
                          <button key={op.id} type="button" onClick={() => toggleIdeal(op.id)}
                            className={`text-sm px-3 py-1.5 rounded-xl border font-medium transition-colors ${form.ideal_para.includes(op.id) ? 'bg-jungle-600 text-white border-jungle-600' : 'bg-white text-jungle-700 border-jungle-200'
                              }`}>
                            {op.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={guardar} disabled={guardando}
                        className="flex-1 bg-jungle-700 hover:bg-jungle-800 disabled:opacity-60 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                        {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Guardar cambios
                      </button>
                      <button onClick={() => setEditando(false)}
                        className="px-5 bg-jungle-100 hover:bg-jungle-200 text-jungle-700 py-3 rounded-xl text-sm font-semibold">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <InfoFila icono={<Store size={14} />} label="Categoría" valor={servicio.categoria} />
                    <InfoFila icono={null} label="Municipio" valor={servicio.municipio} />
                    <InfoFila icono={<Phone size={14} />} label="Contacto" valor={servicio.contacto} />
                    <InfoFila icono={null} label="Precio" valor={servicio.precio} />
                    <InfoFila icono={<Clock size={14} />} label="Horario"
                      valor={servicio.horario ? `${servicio.horario} · ${servicio.dias_abierto ?? ''}` : undefined} />
                    <InfoFila icono={null} label="Duración" valor={servicio.duracion} />
                    <InfoFila icono={null} label="Cómo llegar" valor={servicio.como_llegar} />
                    <InfoFila icono={null} label="Consejo" valor={servicio.tip} />
                    <InfoFila icono={null} label="🐾 Mascotas" valor={servicio.mascotas} />
                    <div className="bg-jungle-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-jungle-500 mb-1">Descripción</p>
                      <p className="text-sm text-jungle-800">{servicio.descripcion}</p>
                    </div>
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
                    <div className="bg-jungle-50 rounded-xl p-3 flex items-center gap-3">
                      <div>
                        <p className="text-[10px] text-jungle-500 uppercase tracking-wide font-semibold">Código de seguimiento</p>
                        <p className="font-display font-bold text-lg text-jungle-900 tracking-wider">{servicio.codigo_seguimiento}</p>
                      </div>
                    </div>
                    <button onClick={() => setEditando(true)}
                      className="w-full flex items-center justify-center gap-2 border border-jungle-200 hover:bg-jungle-50 text-jungle-700 py-3 rounded-xl text-sm font-semibold transition-colors">
                      <Edit3 size={15} /> Editar información del servicio
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: Fotos ── */}
            {tab === 'fotos' && (
              <div className="bg-white rounded-2xl border border-jungle-100 p-4">
                {servicio.estado === 'aprobado' ? (
                  <GestorFotos codigoSeguimiento={servicio.codigo_seguimiento} fotosIniciales={fotos} onFotosActualizadas={setFotos} />
                ) : (
                  <div className="text-center py-8 text-jungle-400">
                    <p className="text-sm font-medium mb-1">Fotos disponibles cuando el servicio sea aprobado.</p>
                    <p className="text-xs">Estado actual: <strong>{labelEstado}</strong></p>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: Preview ── */}
            {tab === 'preview' && (
              <div>
                <p className="text-xs text-jungle-500 mb-3 text-center">Así verá el turista tu servicio en la app</p>
                <PreviewCard lugar={buildPreview()} />
              </div>
            )}

            {/* ── TAB: Reservaciones (pieza 2 — sin pagos todavía) ── */}
            {tab === 'reservaciones' && (
              <PanelReservacionesPrestador
                servicio={servicio}
                mpConectado={!!servicio.mp_conectado}
                reservaciones={reservacionesEntrantes}
                cargando={cargandoReservaciones}
                guardandoConfig={guardandoReservConfig}
                nuevaFechaBloqueada={nuevaFechaBloqueada}
                setNuevaFechaBloqueada={setNuevaFechaBloqueada}
                onGuardarConfig={(cfg) => actualizarConfigReservaciones({
                  acepta_reservaciones: cfg.activar,
                  politica_cancelacion: cfg.politica_cancelacion,
                  monto_minimo: cfg.monto_minimo,
                  mostrar_usd_reservacion: cfg.mostrar_usd_reservacion,
                })}
                onEliminar={() => actualizarConfigReservaciones({ eliminar_reservaciones: true })}
                onAgregarFechaBloqueada={agregarFechaBloqueada}
                onQuitarFechaBloqueada={quitarFechaBloqueada}
                onResponder={responderReservacion}
                onAbrirChat={(id, nombre) => setChatAbierto({ id, nombre })}
              />
            )}
          </div>

          {/* ── TAB: Información externa (antes "Enlaces") ── */}
          {tab === 'externa' && (
            <div className="px-4 space-y-3">
              <div className="bg-white rounded-2xl border border-jungle-100 p-4">
                <p className="text-sm font-semibold text-jungle-900 mb-1">Redes sociales y sitio</p>
                <p className="text-xs text-jungle-500 mb-4">
                  El turista podrá tocarlos desde tu ficha para conocerte más.
                </p>

                {enlaces.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {enlaces.map(en => (
                      <div key={en.id} className="flex items-center gap-2.5 bg-jungle-50 rounded-xl p-2.5">
                        <IconoEnlace tipo={en.tipo} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-jungle-800">
                            {TIPOS_ENLACE.find(t => t.tipo === en.tipo)?.etiqueta}
                          </p>
                          <p className="text-xs text-jungle-500 truncate">{en.url}</p>
                        </div>
                        <button onClick={() => eliminarEnlace(en.id)} className="text-red-300 hover:text-red-600 p-1 flex-shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <select
                    value={nuevoTipoEnlace}
                    onChange={e => setNuevoTipoEnlace(e.target.value as TipoEnlace)}
                    className="bg-jungle-50 rounded-xl px-2.5 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-jungle-400"
                  >
                    {TIPOS_ENLACE.map(t => <option key={t.tipo} value={t.tipo}>{t.etiqueta}</option>)}
                  </select>
                  <input
                    value={nuevaUrlEnlace}
                    onChange={e => setNuevaUrlEnlace(e.target.value)}
                    placeholder={TIPOS_ENLACE.find(t => t.tipo === nuevoTipoEnlace)?.placeholder}
                    className="flex-1 min-w-0 bg-jungle-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
                  />
                  <button onClick={agregarEnlace} disabled={!nuevaUrlEnlace.trim()}
                    className="bg-jungle-100 disabled:opacity-40 text-jungle-700 px-3 rounded-xl">
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <button onClick={guardarEnlaces} disabled={guardandoEnlaces}
                className="w-full bg-jungle-700 hover:bg-jungle-800 disabled:opacity-60 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                {guardandoEnlaces ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Guardar enlaces
              </button>

              {/* Cuenta de cobro — a dónde le llega su parte al
                  prestador cuando exista el reparto 94%/6% de
                  reservaciones. Mercado Pago ya es una conexión real
                  (OAuth) — PayPal por ahora solo guarda el correo,
                  hasta que construyamos su propia conexión. */}
              <div className="bg-white rounded-2xl border border-jungle-100 p-4">
                <p className="text-sm font-semibold text-jungle-900 mb-1">Mercado Pago</p>
                <p className="text-xs text-jungle-500 mb-3">
                  Conecta tu cuenta para recibir tu parte de cada reservación en automático.
                </p>
                {servicio.mp_conectado ? (
                  <div className="flex items-center gap-2.5 bg-green-50 rounded-xl p-3">
                    <span className="w-8 h-8 rounded-full bg-sky-500 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">MP</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-green-800">Conectada</p>
                      {servicio.mp_user_id && <p className="text-xs text-green-700/70 truncate">Cuenta #{servicio.mp_user_id}</p>}
                    </div>
                    <button onClick={desconectarMercadoPago} className="text-[11px] font-semibold text-jungle-500 hover:text-red-600 flex-shrink-0">
                      Desconectar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={conectarMercadoPago}
                    disabled={conectandoMp}
                    className="w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
                  >
                    {conectandoMp ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                    Conectar con Mercado Pago
                  </button>
                )}
              </div>
            </div>
          )}
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
  servicio, mpConectado, reservaciones, cargando, guardandoConfig,
  nuevaFechaBloqueada, setNuevaFechaBloqueada,
  onGuardarConfig, onEliminar, onAgregarFechaBloqueada, onQuitarFechaBloqueada, onResponder, onAbrirChat,
}: {
  servicio: ServicioAPI;
  mpConectado: boolean;
  reservaciones: ReservacionPrestador[] | null;
  cargando: boolean;
  guardandoConfig: boolean;
  nuevaFechaBloqueada: string;
  setNuevaFechaBloqueada: (v: string) => void;
  onGuardarConfig: (cfg: { politica_cancelacion: 'flexible' | 'no_reembolsable'; monto_minimo: number | null; mostrar_usd_reservacion: boolean; activar: boolean }) => Promise<boolean>;
  onEliminar: () => void;
  onAgregarFechaBloqueada: () => void;
  onQuitarFechaBloqueada: (fecha: string) => void;
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
    await onGuardarConfig({
      politica_cancelacion: politicaDraft,
      monto_minimo: montoDraft.trim() ? montoNum : null,
      mostrar_usd_reservacion: mostrarUsdDraft,
      activar: true,
    });
  }

  async function guardarCambios() {
    await onGuardarConfig({
      politica_cancelacion: politicaDraft,
      monto_minimo: montoDraft.trim() ? montoNum : null,
      mostrar_usd_reservacion: mostrarUsdDraft,
      activar: true,
    });
  }

  function eliminar() {
    if (!confirm('¿Eliminar reservaciones de este servicio? Ya no se mostrará "Reservar" a los turistas, y se borra la configuración (política, monto mínimo, fechas bloqueadas). Las reservaciones ya confirmadas no se cancelan solas.')) return;
    onEliminar();
  }

  const FormularioConfig = (
    <>
      <div className="bg-white rounded-2xl border border-jungle-100 p-4">
        <p className="text-sm font-semibold text-jungle-900 mb-3">Política de cancelación</p>
        <div className="space-y-2">
          <button
            onClick={() => setPoliticaDraft('flexible')}
            className={`w-full text-left rounded-xl border-2 p-3 transition-colors ${politicaDraft === 'flexible' ? 'border-jungle-700 bg-jungle-50' : 'border-jungle-100'}`}
          >
            <p className="text-sm font-semibold text-jungle-900">Flexible</p>
            <p className="text-xs text-jungle-500 mt-0.5">Cancelación gratuita hasta 24–48h antes.</p>
          </button>
          <button
            onClick={() => setPoliticaDraft('no_reembolsable')}
            className={`w-full text-left rounded-xl border-2 p-3 transition-colors ${politicaDraft === 'no_reembolsable' ? 'border-jungle-700 bg-jungle-50' : 'border-jungle-100'}`}
          >
            <p className="text-sm font-semibold text-jungle-900">No reembolsable</p>
            <p className="text-xs text-jungle-500 mt-0.5">Más económica para el turista, sin cancelación.</p>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-jungle-100 p-4">
        <p className="text-sm font-semibold text-jungle-900 mb-1">Anticipo mínimo para confirmar</p>
        <p className="text-xs text-jungle-500 mb-3">Lo que se retiene para cerrar la reservación (10–20% es lo usual) — opcional.</p>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-400 text-sm">$</span>
          <input
            type="number"
            min={0}
            value={montoDraft}
            onChange={(e) => setMontoDraft(e.target.value)}
            placeholder="ej: 150"
            className="w-full bg-jungle-50 rounded-xl pl-7 pr-16 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
          />
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-jungle-400 text-xs font-semibold">MXN</span>
        </div>
        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={mostrarUsdDraft}
            onChange={(e) => setMostrarUsdDraft(e.target.checked)}
            className="w-4 h-4 rounded accent-jungle-700"
          />
          <span className="text-xs text-jungle-600">Mostrar también en USD (para turistas extranjeros)</span>
        </label>
        {mostrarUsdDraft && montoUsd !== null && (
          <p className="text-xs text-jungle-400 mt-1.5">≈ ${montoUsd} USD (tasa de referencia, no en vivo)</p>
        )}
      </div>
    </>
  );

  return (
    <div className="px-4 space-y-3">
      {/* Reservaciones es independiente de Premium; lo único que hace
          falta es tener Mercado Pago conectado, para saber a dónde
          depositarle su parte. */}
      <div className="bg-white rounded-2xl border border-jungle-100 p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-jungle-900">Reservaciones</p>
          {acepta && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800">Publicado</span>
          )}
        </div>
        {!mpConectado ? (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">
            Conecta tu cuenta de Mercado Pago (pestaña Información externa) antes de esto — es a donde te va a llegar tu parte.
          </p>
        ) : (
          <p className="text-xs text-jungle-500">
            El turista podrá reservar tu servicio directo desde la app. TuxtlasGO retiene 6% por reservación pagada, tú recibes el 94% directo a tu cuenta.
          </p>
        )}
      </div>

      {mpConectado && (
        <>
          {FormularioConfig}

          {/* Publicar cuando está apagado; Guardar + Eliminar cuando
              ya está activo — como se pidió. */}
          {!acepta ? (
            <button
              onClick={publicar}
              disabled={guardandoConfig}
              className="w-full bg-jungle-700 hover:bg-jungle-800 disabled:opacity-60 text-white py-3 rounded-xl text-sm font-semibold"
            >
              {guardandoConfig ? 'Publicando…' : 'Publicar reservaciones'}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={guardarCambios}
                disabled={guardandoConfig}
                className="flex-1 bg-jungle-700 hover:bg-jungle-800 disabled:opacity-60 text-white py-3 rounded-xl text-sm font-semibold"
              >
                {guardandoConfig ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button
                onClick={eliminar}
                disabled={guardandoConfig}
                className="flex-1 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-60 text-red-600 py-3 rounded-xl text-sm font-semibold"
              >
                Eliminar reservaciones
              </button>
            </div>
          )}
        </>
      )}

      {acepta && mpConectado && (
        <>
          {/* Fechas bloqueadas */}
          <div className="bg-white rounded-2xl border border-jungle-100 p-4">
            <p className="text-sm font-semibold text-jungle-900 mb-1">Fechas no disponibles</p>
            <p className="text-xs text-jungle-500 mb-3">Bloquea los días que ya no tengas cupo.</p>
            {bloqueadas.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {bloqueadas.map(f => (
                  <span key={f} className="flex items-center gap-1.5 bg-jungle-50 text-jungle-700 text-xs font-semibold px-2.5 py-1.5 rounded-full">
                    {new Date(f + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                    <button onClick={() => onQuitarFechaBloqueada(f)} className="text-jungle-400 hover:text-red-600"><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="date"
                min={hoy}
                value={nuevaFechaBloqueada}
                onChange={(e) => setNuevaFechaBloqueada(e.target.value)}
                className="flex-1 bg-jungle-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
              />
              <button onClick={onAgregarFechaBloqueada} disabled={!nuevaFechaBloqueada}
                className="bg-jungle-100 disabled:opacity-40 text-jungle-700 px-3 rounded-xl">
                <Plus size={16} />
              </button>
            </div>
          </div>
        </>
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
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.estado === 'confirmada' ? 'bg-green-100 text-green-800'
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
          {/* Ganancias — shell honesto: sin cobros/reservas reales
              todavía, solo lo que sí existe hoy (Plan Premium). */}
          <div className="bg-gradient-to-br from-jungle-900 to-jungle-950 rounded-2xl p-5 text-white relative overflow-hidden">
            <DollarSign size={72} className="absolute -right-3 -bottom-3 text-white/5" />
            <p className="text-xs text-jungle-300 uppercase tracking-wide font-semibold mb-1">Ganancias totales</p>
            <p className="font-display font-extrabold text-3xl">$0.00 MXN</p>
            <p className="text-xs text-jungle-300 mt-2 relative">
              Aquí verás tus ingresos cuando actives el módulo de reservas y pagos — todavía no está disponible.
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
function IconoEnlace({ tipo }: { tipo: TipoEnlace }) {
  const props = { size: 15, className: 'text-jungle-600 flex-shrink-0' };
  switch (tipo) {
    case 'instagram': return <Instagram {...props} />;
    case 'facebook': return <Facebook {...props} />;
    case 'whatsapp': return <MessageCircle {...props} />;
    case 'tiktok': return <Globe {...props} />;
    case 'sitio': return <Globe {...props} />;
    default: return <Link2 {...props} />;
  }
}

// ─────────────── Selectores estructurados de Mi Servicio ───────────
// Antes eran texto libre — la IA necesita formatos consistentes para
// poder leerlos bien, así que ahora son selectores/pickers que arman
// el mismo tipo de texto que ya se usaba, no cambia nada del backend.

const TASA_USD_REFERENCIA_EDICION = 17.1; // misma tasa que ProviderPanel.tsx
const NIVELES_PRECIO_EDICION = ['$', '$$', '$$$', '$$$$'];

function SelectorPrecio({ valor, onCambiar }: { valor: string; onCambiar: (s: string) => void }) {
  const parseado = useMemo(() => {
    const m = valor.match(/^(\${1,4})\s*\$([\d,]+)\s*[–-]\s*\$([\d,]+)\s*MXN/);
    return m ? { nivel: m[1], min: m[2].replace(/,/g, ''), max: m[3].replace(/,/g, '') } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [nivel, setNivel] = useState(parseado?.nivel ?? '$$');
  const [min, setMin] = useState(parseado?.min ?? '');
  const [max, setMax] = useState(parseado?.max ?? '');

  useEffect(() => {
    const minNum = parseFloat(min), maxNum = parseFloat(max);
    if (!min || !max || Number.isNaN(minNum) || Number.isNaN(maxNum)) return;
    const usdMin = Math.round(minNum / TASA_USD_REFERENCIA_EDICION);
    const usdMax = Math.round(maxNum / TASA_USD_REFERENCIA_EDICION);
    onCambiar(`${nivel} $${minNum.toLocaleString('es-MX')} – $${maxNum.toLocaleString('es-MX')} MXN (aprox. $${usdMin} – $${usdMax} USD)`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel, min, max]);

  return (
    <div>
      <div className="flex gap-1.5 mb-2">
        {NIVELES_PRECIO_EDICION.map((n) => (
          <button key={n} type="button" onClick={() => setNivel(n)}
            className={`flex-1 py-1.5 rounded-lg text-sm font-bold border-2 transition-colors ${nivel === n ? 'border-jungle-600 bg-jungle-600 text-white' : 'border-jungle-100 bg-white text-jungle-700'}`}>
            {n}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input type="number" min={0} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Desde"
          className="w-full bg-jungle-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
        <span className="text-jungle-400 flex-shrink-0">–</span>
        <input type="number" min={0} inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Hasta"
          className="w-full bg-jungle-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
      </div>
    </div>
  );
}

function SelectorContacto({ valor, onCambiar }: { valor: string; onCambiar: (s: string) => void }) {
  const [modo, setModo] = useState<'whatsapp' | 'correo'>(valor.includes('@') ? 'correo' : 'whatsapp');

  return (
    <div>
      <div className="flex gap-1.5 mb-1.5">
        <button type="button" onClick={() => setModo('whatsapp')}
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${modo === 'whatsapp' ? 'bg-jungle-700 text-white' : 'bg-jungle-50 text-jungle-600'}`}>
          WhatsApp
        </button>
        <button type="button" onClick={() => setModo('correo')}
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${modo === 'correo' ? 'bg-jungle-700 text-white' : 'bg-jungle-50 text-jungle-600'}`}>
          Correo
        </button>
      </div>
      {modo === 'whatsapp' ? (
        <input
          value={valor}
          inputMode="numeric"
          type="tel"
          onChange={(e) => onCambiar(e.target.value.replace(/[^\d+\s-]/g, ''))}
          placeholder="9521234567"
          className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
        />
      ) : (
        <input
          value={valor}
          type="email"
          onChange={(e) => onCambiar(e.target.value)}
          placeholder="negocio@correo.com"
          className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
        />
      )}
    </div>
  );
}

function parsearHora12a24(str: string): string {
  const m = str.trim().match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!m) return '';
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3].toLowerCase();
  if (ampm === 'pm' && h !== 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}
function formatear12h(hhmm: string): string {
  if (!hhmm) return '';
  const [hStr, m] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

function SelectorHorario({ valor, onCambiar }: { valor: string; onCambiar: (s: string) => void }) {
  const partes = useMemo(() => valor.split(/[-–]/).map((s) => s.trim()), [valor]);
  const [desde, setDesde] = useState(() => (partes[0] ? parsearHora12a24(partes[0]) : ''));
  const [hasta, setHasta] = useState(() => (partes[1] ? parsearHora12a24(partes[1]) : ''));

  useEffect(() => {
    if (!desde || !hasta) return;
    onCambiar(`${formatear12h(desde)} - ${formatear12h(hasta)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  return (
    <div className="flex items-center gap-2">
      <input type="time" value={desde} onChange={(e) => setDesde(e.target.value)}
        className="w-full bg-jungle-50 rounded-xl px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
      <span className="text-jungle-400 text-xs flex-shrink-0">a</span>
      <input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)}
        className="w-full bg-jungle-50 rounded-xl px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
    </div>
  );
}

const DIAS_SEMANA_EDICION = [
  { id: 'lun', label: 'L', nombre: 'Lunes' }, { id: 'mar', label: 'M', nombre: 'Martes' },
  { id: 'mie', label: 'M', nombre: 'Miércoles' }, { id: 'jue', label: 'J', nombre: 'Jueves' },
  { id: 'vie', label: 'V', nombre: 'Viernes' }, { id: 'sab', label: 'S', nombre: 'Sábado' },
  { id: 'dom', label: 'D', nombre: 'Domingo' },
];

function SelectorDias({ valor, onCambiar }: { valor: string; onCambiar: (s: string) => void }) {
  const [seleccionados, setSeleccionados] = useState<string[]>(() => {
    if (/todos/i.test(valor)) return DIAS_SEMANA_EDICION.map((d) => d.id);
    return DIAS_SEMANA_EDICION.filter((d) => new RegExp(d.nombre, 'i').test(valor)).map((d) => d.id);
  });

  useEffect(() => {
    if (seleccionados.length === 0) return;
    if (seleccionados.length === 7) { onCambiar('Todos los días'); return; }
    onCambiar(DIAS_SEMANA_EDICION.filter((d) => seleccionados.includes(d.id)).map((d) => d.nombre).join(', '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionados]);

  function alternar(id: string) {
    setSeleccionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div>
      <div className="flex gap-2.5">
        {DIAS_SEMANA_EDICION.map((d) => (
          <button key={d.id} type="button" onClick={() => alternar(d.id)} title={d.nombre}
            className={`flex-1 h-9 min-w-[2rem] rounded-full text-xs font-bold transition-colors ${seleccionados.includes(d.id) ? 'bg-jungle-700 text-white' : 'bg-jungle-50 text-jungle-500'}`}>
            {d.label}
          </button>
        ))}
      </div>
      {seleccionados.length < 7 && (
        <button type="button" onClick={() => setSeleccionados(DIAS_SEMANA_EDICION.map((d) => d.id))}
          className="text-[11px] font-semibold text-jungle-500 hover:text-jungle-700 mt-1.5">
          Marcar todos los días
        </button>
      )}
    </div>
  );
}

const OPCIONES_DURACION_EDICION = ['30 minutos', '1 hora', '1-2 horas', '2-3 horas', '3-4 horas', 'Medio día', 'Día completo', 'Variable'];

function SelectorDuracion({ valor, onCambiar }: { valor: string; onCambiar: (s: string) => void }) {
  const esPersonalizado = !!valor && !OPCIONES_DURACION_EDICION.includes(valor);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {OPCIONES_DURACION_EDICION.map((op) => (
          <button key={op} type="button" onClick={() => onCambiar(op)}
            className={`px-2.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${valor === op ? 'bg-jungle-700 text-white' : 'bg-jungle-50 text-jungle-600'}`}>
            {op}
          </button>
        ))}
      </div>
      {esPersonalizado && (
        <input value={valor} onChange={(e) => onCambiar(e.target.value)}
          className="w-full bg-jungle-50 rounded-xl px-3 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-jungle-400" />
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

function PreviewCard({ lugar }: { lugar: Lugar }) {
  const cat = CATEGORIAS.find(c => c.id === lugar.categoria);
  return (
    <div className="bg-white rounded-2xl border border-jungle-100 overflow-hidden shadow-sm">
      <div className="relative h-44">
        <img src={lugar.imagen} alt={lugar.nombre} className="w-full h-full object-cover" />
        <div className="absolute top-3 left-3 flex gap-2">
          {cat && (
            <span className="bg-white/90 text-jungle-800 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
              {cat.emoji} {cat.id}
            </span>
          )}
          {lugar.verificado && (
            <span className="bg-white/90 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
              <CheckCircle2 size={11} /> Info verificada
            </span>
          )}
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <h2 className="font-display font-bold text-xl text-jungle-950">{lugar.nombre}</h2>
          <p className="text-sm text-jungle-500 mt-0.5">{lugar.municipio}</p>
        </div>
        <p className="text-sm text-jungle-700">{lugar.descripcionCorta}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-jungle-50 rounded-xl p-2.5">
            <p className="text-[10px] text-jungle-500 uppercase font-semibold">Duración</p>
            <p className="text-sm font-semibold text-jungle-900 mt-0.5">{lugar.duracionSugerida}</p>
          </div>
          <div className="bg-jungle-50 rounded-xl p-2.5">
            <p className="text-[10px] text-jungle-500 uppercase font-semibold">Costo</p>
            <p className="text-sm font-semibold text-jungle-900 mt-0.5">{lugar.precioMxn}</p>
          </div>
          <div className="bg-jungle-50 rounded-xl p-2.5">
            <p className="text-[10px] text-jungle-500 uppercase font-semibold">Días</p>
            <p className="text-sm font-semibold text-jungle-900 mt-0.5">{lugar.abierto.dias}</p>
          </div>
          <div className="bg-jungle-50 rounded-xl p-2.5">
            <p className="text-[10px] text-jungle-500 uppercase font-semibold">Horario</p>
            <p className="text-sm font-semibold text-jungle-900 mt-0.5">{lugar.abierto.horario}</p>
          </div>
        </div>
        {lugar.comoLlegar && (
          <div className="bg-jungle-50 rounded-xl p-2.5">
            <p className="text-[10px] text-jungle-500 uppercase font-semibold mb-0.5">Cómo llegar</p>
            <p className="text-xs text-jungle-700">{lugar.comoLlegar}</p>
          </div>
        )}
        {lugar.tip && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5">
            <p className="text-[10px] text-amber-600 uppercase font-semibold mb-0.5">Consejo</p>
            <p className="text-xs text-amber-800">{lugar.tip}</p>
          </div>
        )}
        {lugar.ideal.length > 0 && (
          <div>
            <p className="text-[10px] text-jungle-500 uppercase font-semibold mb-1.5">Ideal para</p>
            <div className="flex flex-wrap gap-1.5">
              {lugar.ideal.map(id => {
                const op = IDEAL_OPCIONES.find(o => o.id === id);
                return op ? (
                  <span key={id} className="text-xs bg-jungle-100 text-jungle-700 px-2.5 py-1 rounded-full font-medium">{op.label}</span>
                ) : null;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}