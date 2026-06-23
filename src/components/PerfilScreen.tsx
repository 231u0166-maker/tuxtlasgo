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

import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Camera, Edit3, Save, Clock, Phone,
  Loader2, CheckCircle2, Store, RefreshCw, ImagePlus, X,
} from 'lucide-react';
import { getToken, getUsuarioLocal, setUsuarioLocal, type UsuarioSesion } from '../lib/auth';
import { subirFoto, type ProgresoSubida } from '../lib/cloudinary';
import { servicioComoLugar } from '../lib/db';
import GestorFotos from './GestorFotos';
import type { Lugar } from '../data/lugares';
import { CATEGORIAS } from '../data/lugares';

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
  ideal_para?: string[] | string;
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

// ─────────────── ENTRADA ───────────────
interface Props { onVolver: () => void; }

export default function PerfilScreen({ onVolver }: Props) {
  const usuario = getUsuarioLocal();

  if (!usuario) {
    return (
      <div className="min-h-screen bg-jungle-50 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-jungle-600 mb-4 font-medium">
            Inicia sesión para ver tu perfil.
          </p>
          <button
            onClick={onVolver}
            className="bg-jungle-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return usuario.tipo === 'prestador'
    ? <PerfilPrestador usuario={usuario} onVolver={onVolver} />
    : <PerfilTurista   usuario={usuario} onVolver={onVolver} />;
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
    }).catch(() => {});
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
type TabPrestador = 'servicio' | 'fotos' | 'preview';

function PerfilPrestador({
  usuario,
  onVolver,
}: {
  usuario: UsuarioSesion;
  onVolver: () => void;
}) {
  const [tab, setTab]             = useState<TabPrestador>('servicio');
  const [servicio, setServicio]   = useState<ServicioAPI | null>(null);
  const [fotos, setFotos]         = useState<string[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState('');
  const [editando, setEditando]   = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito]         = useState(false);
  const [form, setForm]           = useState<FormServicio>({
    nombre: '', categoria: '', municipio: '', descripcion: '',
    precio: '', contacto: '', horario: '', dias_abierto: '',
    duracion: '', como_llegar: '', tip: '', ideal_para: [],
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
        setForm({
          nombre:      srv.nombre      ?? '',
          categoria:   srv.categoria   ?? '',
          municipio:   srv.municipio   ?? '',
          descripcion: srv.descripcion ?? '',
          precio:      srv.precio      ?? '',
          contacto:    srv.contacto    ?? '',
          horario:     srv.horario     ?? '',
          dias_abierto: srv.dias_abierto ?? '',
          duracion:    srv.duracion    ?? '',
          como_llegar: srv.como_llegar ?? '',
          tip:         srv.tip         ?? '',
          ideal_para:  parseIdeal(srv.ideal_para),
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
      idealPara:     form.ideal_para.length ? form.ideal_para : undefined,
      foto:          fotos[0]          || undefined,
    });
  }

  const fotoUrl    = usuario.foto_url;
  const iniciales  = usuario.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const colorEstado = servicio ? (COLORES_ESTADO[servicio.estado] ?? 'bg-gray-100 text-gray-600') : '';
  const labelEstado = servicio?.estado === 'pendiente' ? '⏳ En revisión'
                    : servicio?.estado === 'aprobado'  ? '✅ Aprobado'
                    : '❌ Rechazado';

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

      {/* Avatar + nombre + estado */}
      <div className="px-4 -mt-12 mb-5 flex items-end gap-4">
        <div className="relative flex-shrink-0">
          {fotoUrl ? (
            <img src={fotoUrl} alt={usuario.nombre} className="w-20 h-20 rounded-full border-4 border-white object-cover shadow-lg" />
          ) : (
            <div className="w-20 h-20 rounded-full border-4 border-white bg-jungle-600 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-xl">{iniciales}</span>
            </div>
          )}
        </div>
        <div className="pb-1 flex-1 min-w-0">
          <h1 className="font-display font-bold text-lg text-jungle-950 leading-tight break-words">
            {servicio?.nombre ?? usuario.nombre}
          </h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-jungle-500">{servicio?.categoria ?? 'Prestador de servicio'}</span>
            {servicio && (
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${colorEstado}`}>{labelEstado}</span>
            )}
          </div>
        </div>
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
          {/* Tabs */}
          <div className="px-4 mb-4 flex gap-2">
            {([
              { id: 'servicio' as TabPrestador, label: '📋 Mi Servicio' },
              { id: 'fotos'    as TabPrestador, label: '📸 Fotos' },
              { id: 'preview'  as TabPrestador, label: '👁️ Preview' },
            ]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  tab === t.id ? 'bg-jungle-700 text-white' : 'bg-white text-jungle-700 border border-jungle-100'
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
                          {['Gastronomia','Naturaleza','Aventura','Hospedaje','Cultura','Transporte','Comercio','Cooperativa','Otro'].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-jungle-700 mb-1 block">Municipio</label>
                        <select value={form.municipio} onChange={e => setForm({ ...form, municipio: e.target.value })}
                          className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400">
                          {['Catemaco','San Andrés Tuxtla','Santiago Tuxtla'].map(m => (
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
                        <input value={form.precio} onChange={e => setForm({ ...form, precio: e.target.value })}
                          placeholder="$200 MXN"
                          className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-jungle-700 mb-1 block">WhatsApp / correo</label>
                        <input value={form.contacto} onChange={e => setForm({ ...form, contacto: e.target.value })}
                          placeholder="9521234567"
                          className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-jungle-700 mb-1 block"><Clock size={11} className="inline mr-1" />Horario</label>
                        <input value={form.horario} onChange={e => setForm({ ...form, horario: e.target.value })}
                          placeholder="9:00 am – 6:00 pm"
                          className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-jungle-700 mb-1 block">Días abierto</label>
                        <input value={form.dias_abierto} onChange={e => setForm({ ...form, dias_abierto: e.target.value })}
                          placeholder="Todos los días"
                          className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-jungle-700 mb-1 block">Duración sugerida de visita</label>
                      <input value={form.duracion} onChange={e => setForm({ ...form, duracion: e.target.value })}
                        placeholder="ej: 2-3 horas, Día completo"
                        className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
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
                      <label className="text-xs font-semibold text-jungle-700 mb-2 block">Ideal para</label>
                      <div className="flex flex-wrap gap-2">
                        {IDEAL_OPCIONES.map(op => (
                          <button key={op.id} type="button" onClick={() => toggleIdeal(op.id)}
                            className={`text-sm px-3 py-1.5 rounded-xl border font-medium transition-colors ${
                              form.ideal_para.includes(op.id) ? 'bg-jungle-600 text-white border-jungle-600' : 'bg-white text-jungle-700 border-jungle-200'
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
                    <InfoFila icono={<Store size={14} />}  label="Categoría"   valor={servicio.categoria} />
                    <InfoFila icono={null}                 label="Municipio"   valor={servicio.municipio} />
                    <InfoFila icono={<Phone size={14} />}  label="Contacto"    valor={servicio.contacto} />
                    <InfoFila icono={null}                 label="Precio"      valor={servicio.precio} />
                    <InfoFila icono={<Clock size={14} />}  label="Horario"
                      valor={servicio.horario ? `${servicio.horario} · ${servicio.dias_abierto ?? ''}` : undefined} />
                    <InfoFila icono={null}  label="Duración"    valor={servicio.duracion} />
                    <InfoFila icono={null}  label="Cómo llegar" valor={servicio.como_llegar} />
                    <InfoFila icono={null}  label="Consejo"     valor={servicio.tip} />
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
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────── AUXILIARES ───────────────
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