// ============================================================
// COMUNIDAD — feed de publicaciones de viajeros y prestadores
// ============================================================
// Fotos y video corto (máx. 1 min) + texto. Cualquiera puede VER el
// feed; publicar y reportar requieren cuenta — así el feed no se
// vuelve un lugar anónimo.
//
// El video necesita internet real (no es una función offline, a
// diferencia del resto de la app) y respeta un cupo mensual propio
// —ver api/comunidad/video-cupo.ts— para no rebasar lo que da el
// plan gratuito de Cloudinary. Cuando se agota, el botón "Video" se
// desactiva solo y queda "Foto" nada más, hasta el mes siguiente.
//
// Moderación real, no solo de adorno: 3 reportes distintos ocultan
// una publicación del feed público solos (api/comunidad/reportar.ts),
// sin depender de que un admin esté viendo la plataforma en ese
// momento. El admin puede revisar/restaurar desde /admin.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Flag, Trash2, X, Users, Video, Wifi } from 'lucide-react';
import { getToken, getUsuarioLocal } from '../lib/auth';
import { subirFotoComunidad, subirVideoComunidad, leerDuracionVideo, type ProgresoSubida } from '../lib/cloudinary';
import SubNavPublica from './SubNavPublica';
import AuthModal from './AuthModal';

const DURACION_MAX_SEG = 60;
const TAMANO_MAX_VIDEO_MB = 40;

interface Publicacion {
  id: number;
  texto: string | null;
  imagen_url: string | null;
  video_url: string | null;
  video_duracion_seg: number | null;
  creado_en: string;
  reportes: number;
  usuario_id: number;
  autor_nombre: string;
  autor_foto: string | null;
}

interface CupoVideo {
  disponible: boolean;
  mbSubidos?: number;
  limiteMb?: number;
}

export default function ComunidadPage() {
  const usuario = getUsuarioLocal();
  const [publicaciones, setPublicaciones] = useState<Publicacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mostrarAuth, setMostrarAuth] = useState(false);
  const [cupoVideo, setCupoVideo] = useState<CupoVideo>({ disponible: false });

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const res = await fetch('/api/comunidad/publicaciones');
      const data = await res.json();
      if (data.ok) setPublicaciones(data.publicaciones);
      else setError('No se pudo cargar la comunidad.');
    } catch {
      setError('Sin conexión. Verifica tu internet.');
    }
    setCargando(false);
  }

  async function cargarCupoVideo() {
    try {
      const res = await fetch('/api/comunidad/video-cupo');
      const data = await res.json();
      setCupoVideo({ disponible: !!data.disponible, mbSubidos: data.mbSubidos, limiteMb: data.limiteMb });
    } catch {
      setCupoVideo({ disponible: false });
    }
  }

  useEffect(() => { cargar(); cargarCupoVideo(); }, []);

  return (
    <div className="min-h-screen bg-amate-50">
      <SubNavPublica activa="comunidad" />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-10 pb-16">
        <div className="flex items-center gap-2 mb-1">
          <Users size={26} className="text-jungle-700" />
          <h1 className="font-display font-extrabold text-3xl text-obsidiana-900">Comunidad</h1>
        </div>
        <p className="text-obsidiana-800/60 mb-6">
          Fotos, videos cortos y experiencias de quienes ya visitaron Los Tuxtlas — compartidas por turistas y prestadores con cuenta.
        </p>

        {usuario ? (
          <Composer
            onPublicado={(nueva) => { setPublicaciones((p) => [nueva, ...p]); if (nueva.video_url) cargarCupoVideo(); }}
            usuario={usuario}
            cupoVideo={cupoVideo}
          />
        ) : (
          <div className="bg-white border border-jungle-100 rounded-2xl p-5 mb-6 text-center">
            <p className="text-sm text-jungle-700 mb-3">Inicia sesión para compartir tu experiencia con la comunidad.</p>
            <button
              onClick={() => setMostrarAuth(true)}
              className="bg-jungle-700 hover:bg-jungle-800 text-white px-5 py-2.5 rounded-full text-sm font-semibold"
            >
              Iniciar sesión
            </button>
          </div>
        )}

        {cargando && (
          <div className="text-center py-10 text-jungle-400">
            <Loader2 size={26} className="animate-spin mx-auto mb-2" />
            <p className="text-sm">Cargando comunidad…</p>
          </div>
        )}

        {!cargando && error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700 text-center">{error}</div>
        )}

        {!cargando && !error && publicaciones.length === 0 && (
          <div className="text-center py-10 text-jungle-400">
            <p className="text-sm">Todavía no hay publicaciones. ¡Sé la primera persona en compartir algo!</p>
          </div>
        )}

        <div className="space-y-4">
          {publicaciones.map((p) => (
            <TarjetaPublicacion
              key={p.id}
              publicacion={p}
              esPropia={usuario?.id === p.usuario_id}
              onEliminada={() => setPublicaciones((prev) => prev.filter((x) => x.id !== p.id))}
            />
          ))}
        </div>
      </div>

      {mostrarAuth && (
        <AuthModal onClose={() => setMostrarAuth(false)} onSuccess={() => { setMostrarAuth(false); window.location.reload(); }} />
      )}
    </div>
  );
}

// Detección oportunista de datos móviles — la Network Information
// API no existe en todos los navegadores (Safari no la tiene), así
// que esto es un aviso quiero-informar, nunca un bloqueo duro: si no
// podemos saberlo, dejamos subir sin preguntar nada.
function pareceRedCelular(): boolean {
  const conn = (navigator as any).connection;
  if (!conn) return false;
  if (typeof conn.type === 'string') return conn.type === 'cellular';
  if (typeof conn.effectiveType === 'string') return ['slow-2g', '2g', '3g'].includes(conn.effectiveType);
  return false;
}

// ─────────────── Composer ───────────────
function Composer({
  onPublicado, usuario, cupoVideo,
}: {
  onPublicado: (p: Publicacion) => void;
  usuario: NonNullable<ReturnType<typeof getUsuarioLocal>>;
  cupoVideo: CupoVideo;
}) {
  const [texto, setTexto] = useState('');
  const [imagenUrl, setImagenUrl] = useState('');
  const [video, setVideo] = useState<{ url: string; bytes: number; duracionSeg: number } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [progresoVideo, setProgresoVideo] = useState(0);
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState('');
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const inputVideoRef = useRef<HTMLInputElement>(null);

  function subirImagen(file: File) {
    setSubiendo(true);
    setError('');
    subirFotoComunidad(file, usuario.id, (p: ProgresoSubida) => {
      if (p.url) { setImagenUrl(p.url); setSubiendo(false); }
      if (p.error) { setError(p.error); setSubiendo(false); }
    });
  }

  async function elegirVideo(file: File) {
    setError('');

    if (file.size > TAMANO_MAX_VIDEO_MB * 1024 * 1024) {
      setError(`El video pesa demasiado — máximo ${TAMANO_MAX_VIDEO_MB} MB.`);
      return;
    }

    let duracion: number;
    try {
      duracion = await leerDuracionVideo(file);
    } catch {
      setError('No se pudo leer ese video. Prueba con otro archivo.');
      return;
    }
    if (duracion > DURACION_MAX_SEG) {
      setError(`El video dura ${Math.round(duracion)}s — máximo ${DURACION_MAX_SEG}s (1 minuto). Recórtalo e intenta de nuevo.`);
      return;
    }

    if (pareceRedCelular()) {
      const continuar = confirm('Pareces estar usando datos móviles. Un video puede pesar varios MB — ¿quieres subirlo de todos modos? (Funciona mejor con WiFi)');
      if (!continuar) return;
    }

    setSubiendo(true);
    setProgresoVideo(0);
    subirVideoComunidad(file, usuario.id, (p) => {
      if (p.porcentaje) setProgresoVideo(p.porcentaje);
      if (p.url && p.bytes) {
        setVideo({ url: p.url, bytes: p.bytes, duracionSeg: p.duracionSeg ?? Math.round(duracion) });
        setSubiendo(false);
      }
      if (p.error) { setError(p.error); setSubiendo(false); }
    });
  }

  async function publicar() {
    if (!texto.trim() && !imagenUrl && !video) return;
    setPublicando(true);
    setError('');
    try {
      const res = await fetch('/api/comunidad/publicaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          texto,
          imagen_url: imagenUrl || undefined,
          video_url: video?.url,
          video_bytes: video?.bytes,
          video_duracion_seg: video?.duracionSeg,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        onPublicado({
          ...data.publicacion,
          autor_nombre: usuario.nombre,
          autor_foto: usuario.foto_url ?? null,
        });
        setTexto('');
        setImagenUrl('');
        setVideo(null);
      } else if (data.error === 'limite_video') {
        setError(data.mensaje ?? 'Se alcanzó el límite de video de este mes.');
      } else {
        setError(data.error ?? 'No se pudo publicar');
      }
    } catch {
      setError('Sin conexión. Verifica tu internet.');
    }
    setPublicando(false);
  }

  const hayMedia = !!imagenUrl || !!video;

  return (
    <div className="bg-white border border-jungle-100 rounded-2xl p-4 mb-6">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={`¿Qué viviste en Los Tuxtlas, ${usuario.nombre.split(' ')[0]}?`}
        rows={2}
        maxLength={500}
        className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 resize-none"
      />

      {imagenUrl && (
        <div className="relative mt-3 inline-block">
          <img src={imagenUrl} alt="" className="max-h-48 rounded-xl object-cover" />
          <button
            onClick={() => setImagenUrl('')}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-obsidiana-900 text-white flex items-center justify-center"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {video && (
        <div className="relative mt-3 inline-block">
          <video src={video.url} controls className="max-h-48 rounded-xl" />
          <button
            onClick={() => setVideo(null)}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-obsidiana-900 text-white flex items-center justify-center"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {subiendo && progresoVideo > 0 && progresoVideo < 100 && (
        <p className="text-xs text-jungle-500 mt-2">Subiendo video… {progresoVideo}%</p>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => inputFotoRef.current?.click()}
            disabled={subiendo || hayMedia}
            className="flex items-center gap-1.5 text-sm font-semibold text-jungle-700 hover:text-jungle-900 disabled:opacity-40"
          >
            <ImagePlus size={16} />
            Foto
          </button>
          <button
            onClick={() => cupoVideo.disponible && inputVideoRef.current?.click()}
            disabled={subiendo || hayMedia || !cupoVideo.disponible}
            title={cupoVideo.disponible ? 'Video corto, máx. 1 minuto' : 'Límite de video de este mes alcanzado — vuelve el próximo mes'}
            className="flex items-center gap-1.5 text-sm font-semibold text-jungle-700 hover:text-jungle-900 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Video size={16} />
            Video
          </button>
          {!cupoVideo.disponible && (
            <span className="text-[11px] text-amber-600 font-medium">Video no disponible este mes</span>
          )}
        </div>
        <input ref={inputFotoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => e.target.files?.[0] && subirImagen(e.target.files[0])} />
        <input ref={inputVideoRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
          onChange={(e) => e.target.files?.[0] && elegirVideo(e.target.files[0])} />
        <button
          onClick={publicar}
          disabled={publicando || subiendo || (!texto.trim() && !hayMedia)}
          className="bg-jungle-700 hover:bg-jungle-800 disabled:opacity-40 text-white px-5 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5"
        >
          {publicando ? <Loader2 size={14} className="animate-spin" /> : null}
          Publicar
        </button>
      </div>

      {video && (
        <p className="text-[11px] text-jungle-400 mt-2 flex items-center gap-1">
          <Wifi size={11} /> El video necesita internet — funciona mejor con WiFi.
        </p>
      )}
    </div>
  );
}

// ─────────────── Tarjeta de publicación ───────────────
function TarjetaPublicacion({
  publicacion, esPropia, onEliminada,
}: {
  publicacion: Publicacion;
  esPropia: boolean;
  onEliminada: () => void;
}) {
  const [reportado, setReportado] = useState(false);
  const [reportando, setReportando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const yaRegistroVista = useRef(false);

  async function reportar() {
    if (!getToken()) { alert('Inicia sesión para reportar publicaciones.'); return; }
    setReportando(true);
    try {
      const res = await fetch('/api/comunidad/reportar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ id: publicacion.id }),
      });
      const data = await res.json();
      if (data.ok) setReportado(true);
    } catch { /* sin conexión */ }
    setReportando(false);
  }

  async function eliminar() {
    if (!confirm('¿Eliminar esta publicación?')) return;
    setEliminando(true);
    try {
      const res = await fetch('/api/comunidad/publicaciones', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ id: publicacion.id }),
      });
      const data = await res.json();
      if (data.ok) onEliminada();
    } catch { /* sin conexión */ }
    setEliminando(false);
  }

  function registrarVista() {
    if (yaRegistroVista.current) return;
    yaRegistroVista.current = true;
    fetch('/api/comunidad/video-vista', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: publicacion.id }),
    }).catch(() => { /* no crítico */ });
  }

  const iniciales = publicacion.autor_nombre.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const fecha = new Date(publicacion.creado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  const duracionLabel = publicacion.video_duracion_seg
    ? `${Math.floor(publicacion.video_duracion_seg / 60)}:${String(publicacion.video_duracion_seg % 60).padStart(2, '0')}`
    : null;

  return (
    <div className="bg-white border border-jungle-100 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 pt-4">
        {publicacion.autor_foto ? (
          <img src={publicacion.autor_foto} alt="" className="w-9 h-9 rounded-full object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-jungle-600 flex items-center justify-center text-white text-xs font-bold">
            {iniciales}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-jungle-950 truncate">{publicacion.autor_nombre}</p>
          <p className="text-[11px] text-jungle-400">{fecha}</p>
        </div>
      </div>

      {publicacion.texto && (
        <p className="text-sm text-jungle-800 px-4 pt-3 whitespace-pre-wrap">{publicacion.texto}</p>
      )}

      {publicacion.imagen_url && (
        <img src={publicacion.imagen_url} alt="" className="w-full max-h-96 object-cover mt-3" />
      )}

      {publicacion.video_url && (
        <div className="relative mt-3">
          <video
            src={publicacion.video_url}
            controls
            preload="metadata"
            onPlay={registrarVista}
            className="w-full max-h-96 bg-obsidiana-950"
          />
          {duracionLabel && (
            <span className="absolute top-2 right-2 bg-obsidiana-950/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
              {duracionLabel}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 px-4 py-3 text-jungle-400">
        <button
          onClick={reportar}
          disabled={reportando || reportado}
          className="flex items-center gap-1.5 text-xs font-medium hover:text-amber-600 disabled:opacity-50"
          title="Reportar"
        >
          <Flag size={14} className={reportado ? 'fill-amber-500 text-amber-500' : ''} />
          {reportado ? 'Reportado' : 'Reportar'}
        </button>
        {esPropia && (
          <button
            onClick={eliminar}
            disabled={eliminando}
            className="flex items-center gap-1.5 text-xs font-medium hover:text-red-600 ml-auto"
          >
            {eliminando ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}
