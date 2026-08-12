// ============================================================
// COMUNIDAD — feed de publicaciones de viajeros y prestadores
// ============================================================
// Fotos y video corto (máx. 1 min) + texto. Cualquiera puede VER el
// feed; publicar, comentar, dar like y reportar requieren cuenta —
// así el feed no se vuelve un lugar anónimo.
//
// El video necesita internet real (no es una función offline, a
// diferencia del resto de la app) y respeta un cupo mensual propio
// —ver ?accion=cupo— para no rebasar lo que da el plan gratuito de
// Cloudinary. Cuando se agota, el botón "Video" se desactiva solo.
//
// Moderación real, no solo de adorno: 3 reportes distintos ocultan
// una publicación del feed público solos, sin depender de que un
// admin esté viendo la plataforma en ese momento. El admin puede
// revisar/restaurar desde /admin.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Flag, Trash2, X, Users, Video, Wifi, Heart, MessageCircle, Share2, Smile, Camera, FolderOpen, Send } from 'lucide-react';
import { getToken, getUsuarioLocal } from '../lib/auth';
import { subirFotoComunidad, subirVideoComunidad, leerDuracionVideo, type ProgresoSubida } from '../lib/cloudinary';
import SubNavPublica from './SubNavPublica';
import AuthModal from './AuthModal';

const DURACION_MAX_SEG = 60;
const TAMANO_MAX_VIDEO_MB = 40;

// Curados a mano, nada de emoji externo pesado — cubre lo típico de
// viajes y reacciones normales, no hace falta más para esto.
const EMOJIS_COMUNES = ['😀', '😂', '😍', '🥰', '😎', '🤩', '👍', '🙌', '🎉', '🔥', '❤️', '✨', '🌴', '🏖️', '🌊', '⛰️', '🦜', '🐒', '☀️', '🌙', '😋', '🙏', '💚', '👏'];

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
  likes: number;
  le_di_like: boolean;
  comentarios_count: number;
}

interface Comentario {
  id: number;
  texto: string;
  respuesta_a: number | null;
  creado_en: string;
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
      const res = await fetch('/api/comunidad/publicaciones', {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
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
      const res = await fetch('/api/comunidad/publicaciones?accion=cupo');
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
              onCambio={(cambios) => setPublicaciones((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...cambios } : x)))}
              onNecesitaLogin={() => setMostrarAuth(true)}
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

// Selector de emoji simple — sin librería externa, una rejilla fija.
function SelectorEmojis({ onElegir, onCerrar }: { onElegir: (e: string) => void; onCerrar: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onCerrar} />
      <div className="absolute z-30 bottom-full mb-2 left-0 bg-white border border-jungle-100 rounded-2xl shadow-xl p-2.5 grid grid-cols-6 gap-1 w-60">
        {EMOJIS_COMUNES.map((e) => (
          <button
            key={e}
            onClick={() => { onElegir(e); onCerrar(); }}
            className="text-lg hover:bg-jungle-50 rounded-lg p-1.5 transition-colors"
          >
            {e}
          </button>
        ))}
      </div>
    </>
  );
}

// Botón "Foto"/"Video" con dos formas de elegir — cámara o galería —
// en vez de forzar una sola. En PC, "Tomar foto/video" simplemente no
// tiene capture nativo así que el navegador abre el selector normal.
function BotonMedia({
  icono: Icono, etiqueta, accept, capture, disabled, titulo, onArchivo, mostrarOpciones,
}: {
  icono: typeof ImagePlus;
  etiqueta: string;
  accept: string;
  capture: 'environment' | 'user';
  disabled?: boolean;
  titulo?: string;
  onArchivo: (f: File) => void;
  mostrarOpciones: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const inputCamaraRef = useRef<HTMLInputElement>(null);
  const inputGaleriaRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <button
        onClick={() => (mostrarOpciones ? setAbierto((v) => !v) : inputGaleriaRef.current?.click())}
        disabled={disabled}
        title={titulo}
        className="flex items-center gap-1.5 text-sm font-semibold text-jungle-700 hover:text-jungle-900 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icono size={16} />
        {etiqueta}
      </button>

      {abierto && mostrarOpciones && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setAbierto(false)} />
          <div className="absolute z-30 top-full mt-1.5 left-0 bg-white border border-jungle-100 rounded-xl shadow-xl overflow-hidden w-44">
            <button
              onClick={() => { inputCamaraRef.current?.click(); setAbierto(false); }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-jungle-700 hover:bg-jungle-50"
            >
              <Camera size={14} /> Usar cámara
            </button>
            <button
              onClick={() => { inputGaleriaRef.current?.click(); setAbierto(false); }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-jungle-700 hover:bg-jungle-50 border-t border-jungle-50"
            >
              <FolderOpen size={14} /> Elegir de galería
            </button>
          </div>
        </>
      )}

      <input
        ref={inputCamaraRef}
        type="file"
        accept={accept}
        capture={capture}
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onArchivo(e.target.files[0]); e.target.value = ''; }}
      />
      <input
        ref={inputGaleriaRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onArchivo(e.target.files[0]); e.target.value = ''; }}
      />
    </div>
  );
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
  const [mostrarEmojis, setMostrarEmojis] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
          likes: 0,
          le_di_like: false,
          comentarios_count: 0,
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

  function insertarEmoji(emoji: string) {
    const el = textareaRef.current;
    if (!el) { setTexto((t) => t + emoji); return; }
    const inicio = el.selectionStart ?? texto.length;
    const fin = el.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, inicio) + emoji + texto.slice(fin));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = inicio + emoji.length; });
  }

  const hayMedia = !!imagenUrl || !!video;

  return (
    <div className="bg-white border border-jungle-100 rounded-2xl p-4 mb-6">
      <textarea
        ref={textareaRef}
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
          <BotonMedia
            icono={ImagePlus}
            etiqueta="Foto"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={subiendo || hayMedia}
            onArchivo={subirImagen}
            mostrarOpciones
          />
          <BotonMedia
            icono={Video}
            etiqueta="Video"
            accept="video/mp4,video/webm,video/quicktime"
            capture="environment"
            disabled={subiendo || hayMedia || !cupoVideo.disponible}
            titulo={cupoVideo.disponible ? 'Video corto, máx. 1 minuto' : 'Límite de video de este mes alcanzado — vuelve el próximo mes'}
            onArchivo={elegirVideo}
            mostrarOpciones={cupoVideo.disponible}
          />
          <div className="relative">
            <button
              onClick={() => setMostrarEmojis((v) => !v)}
              className="text-jungle-700 hover:text-jungle-900"
              title="Agregar emoji"
            >
              <Smile size={17} />
            </button>
            {mostrarEmojis && <SelectorEmojis onElegir={insertarEmoji} onCerrar={() => setMostrarEmojis(false)} />}
          </div>
          {!cupoVideo.disponible && (
            <span className="text-[11px] text-amber-600 font-medium">Video no disponible este mes</span>
          )}
        </div>
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

// ─────────────── Compartir ───────────────
function compartir(publicacion: Publicacion, onMostrarMenu: () => void) {
  const texto = publicacion.texto?.slice(0, 100) ?? 'Mira esto en TuxtlasGO Comunidad';
  const url = 'https://go.tuxtlas.xyz/comunidad';
  if (navigator.share) {
    navigator.share({ title: 'TuxtlasGO Comunidad', text: texto, url }).catch(() => {});
  } else {
    onMostrarMenu();
  }
}

function MenuCompartir({ publicacion, onCerrar }: { publicacion: Publicacion; onCerrar: () => void }) {
  const texto = encodeURIComponent(publicacion.texto?.slice(0, 100) ?? 'Mira esto en TuxtlasGO Comunidad');
  const url = encodeURIComponent('https://go.tuxtlas.xyz/comunidad');
  const enlaces = [
    { nombre: 'WhatsApp', href: `https://wa.me/?text=${texto}%20${url}` },
    { nombre: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${url}` },
    { nombre: 'X (Twitter)', href: `https://twitter.com/intent/tweet?text=${texto}&url=${url}` },
  ];
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onCerrar} />
      <div className="absolute z-30 bottom-full mb-2 right-0 bg-white border border-jungle-100 rounded-xl shadow-xl overflow-hidden w-44">
        {enlaces.map((e) => (
          <a
            key={e.nombre}
            href={e.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onCerrar}
            className="block px-3.5 py-2.5 text-xs font-semibold text-jungle-700 hover:bg-jungle-50 border-b border-jungle-50 last:border-0"
          >
            {e.nombre}
          </a>
        ))}
      </div>
    </>
  );
}

// ─────────────── Comentarios ───────────────
function SeccionComentarios({ publicacionId, onComentario }: { publicacionId: number; onComentario: () => void }) {
  const [comentarios, setComentarios] = useState<Comentario[] | null>(null);
  const [texto, setTexto] = useState('');
  const [respondiendoA, setRespondiendoA] = useState<{ id: number; nombre: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function cargar() {
    try {
      const res = await fetch(`/api/comunidad/publicaciones?recurso=comentarios&post_id=${publicacionId}`);
      const data = await res.json();
      if (data.ok) setComentarios(data.comentarios);
    } catch { /* sin conexión */ }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function enviar() {
    if (!texto.trim()) return;
    if (!getToken()) { alert('Inicia sesión para comentar.'); return; }
    setEnviando(true);
    try {
      const res = await fetch('/api/comunidad/publicaciones?recurso=comentarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ publicacion_id: publicacionId, texto: texto.trim(), respuesta_a: respondiendoA?.id }),
      });
      const data = await res.json();
      if (data.ok) {
        setComentarios((prev) => [...(prev ?? []), data.comentario]);
        setTexto('');
        setRespondiendoA(null);
        onComentario();
      }
    } catch { /* sin conexión */ }
    setEnviando(false);
  }

  const principales = comentarios?.filter((c) => !c.respuesta_a) ?? [];
  const respuestasDe = (id: number) => comentarios?.filter((c) => c.respuesta_a === id) ?? [];

  return (
    <div className="border-t border-jungle-100 px-4 py-3 space-y-3">
      {comentarios === null && (
        <div className="text-center py-3"><Loader2 size={16} className="animate-spin mx-auto text-jungle-300" /></div>
      )}
      {comentarios !== null && principales.length === 0 && (
        <p className="text-xs text-jungle-400 text-center py-2">Sé el primero en comentar.</p>
      )}
      {principales.map((c) => (
        <div key={c.id}>
          <BurbujaComentario comentario={c} onResponder={() => setRespondiendoA({ id: c.id, nombre: c.autor_nombre })} />
          {respuestasDe(c.id).length > 0 && (
            <div className="ml-8 mt-1.5 space-y-1.5">
              {respuestasDe(c.id).map((r) => (
                <BurbujaComentario key={r.id} comentario={r} onResponder={() => setRespondiendoA({ id: c.id, nombre: c.autor_nombre })} />
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enviar()}
          placeholder={respondiendoA ? `Respondiendo a ${respondiendoA.nombre.split(' ')[0]}…` : 'Escribe un comentario…'}
          className="flex-1 bg-jungle-50 rounded-full px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-jungle-400"
        />
        {respondiendoA && (
          <button onClick={() => setRespondiendoA(null)} className="text-jungle-400 hover:text-jungle-700"><X size={14} /></button>
        )}
        <button
          onClick={enviar}
          disabled={enviando || !texto.trim()}
          className="text-jungle-700 hover:text-jungle-900 disabled:opacity-40 flex-shrink-0"
        >
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}

function BurbujaComentario({ comentario, onResponder }: { comentario: Comentario; onResponder: () => void }) {
  const iniciales = comentario.autor_nombre.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="flex items-start gap-2">
      {comentario.autor_foto ? (
        <img src={comentario.autor_foto} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0 mt-0.5" />
      ) : (
        <div className="w-6 h-6 rounded-full bg-jungle-500 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mt-0.5">
          {iniciales}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="bg-jungle-50 rounded-2xl px-3 py-1.5 inline-block max-w-full">
          <p className="text-[11px] font-semibold text-jungle-900">{comentario.autor_nombre}</p>
          <p className="text-xs text-jungle-700 whitespace-pre-wrap break-words">{comentario.texto}</p>
        </div>
        <button onClick={onResponder} className="text-[10px] font-semibold text-jungle-400 hover:text-jungle-700 ml-3 mt-0.5">
          Responder
        </button>
      </div>
    </div>
  );
}

// ─────────────── Tarjeta de publicación ───────────────
function TarjetaPublicacion({
  publicacion, esPropia, onEliminada, onCambio, onNecesitaLogin,
}: {
  publicacion: Publicacion;
  esPropia: boolean;
  onEliminada: () => void;
  onCambio: (cambios: Partial<Publicacion>) => void;
  onNecesitaLogin: () => void;
}) {
  const [reportado, setReportado] = useState(false);
  const [reportando, setReportando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [dandoLike, setDandoLike] = useState(false);
  const [mostrarComentarios, setMostrarComentarios] = useState(false);
  const [mostrarMenuCompartir, setMostrarMenuCompartir] = useState(false);
  const yaRegistroVista = useRef(false);

  async function alternarLike() {
    if (!getToken()) { onNecesitaLogin(); return; }
    if (dandoLike) return;
    setDandoLike(true);
    // Optimista — se corrige solo si el servidor responde distinto.
    onCambio({ le_di_like: !publicacion.le_di_like, likes: publicacion.likes + (publicacion.le_di_like ? -1 : 1) });
    try {
      const res = await fetch('/api/comunidad/publicaciones?recurso=like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ id: publicacion.id }),
      });
      const data = await res.json();
      if (data.ok) onCambio({ le_di_like: data.leDiLike, likes: data.likes });
    } catch { /* se queda el optimista */ }
    setDandoLike(false);
  }

  async function reportar() {
    if (!getToken()) { onNecesitaLogin(); return; }
    setReportando(true);
    try {
      const res = await fetch('/api/comunidad/publicaciones?accion=reportar', {
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
    fetch('/api/comunidad/publicaciones?accion=vista', {
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

      {/* Contadores — solo se ven si hay algo que mostrar */}
      {(publicacion.likes > 0 || publicacion.comentarios_count > 0) && (
        <div className="flex items-center justify-between px-4 pt-2.5 text-[11px] text-jungle-400">
          <span>{publicacion.likes > 0 && `${publicacion.likes} me gusta`}</span>
          <span>{publicacion.comentarios_count > 0 && `${publicacion.comentarios_count} comentario${publicacion.comentarios_count > 1 ? 's' : ''}`}</span>
        </div>
      )}

      <div className="flex items-center gap-1 px-2 py-1.5 border-t border-jungle-50 mt-2">
        <button
          onClick={alternarLike}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl transition-colors ${publicacion.le_di_like ? 'text-red-600' : 'text-jungle-500 hover:bg-jungle-50'}`}
        >
          <Heart size={15} className={publicacion.le_di_like ? 'fill-red-600' : ''} />
          Me gusta
        </button>
        <button
          onClick={() => setMostrarComentarios((v) => !v)}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl text-jungle-500 hover:bg-jungle-50 transition-colors"
        >
          <MessageCircle size={15} />
          Comentar
        </button>
        <div className="flex-1 relative">
          <button
            onClick={() => compartir(publicacion, () => setMostrarMenuCompartir(true))}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl text-jungle-500 hover:bg-jungle-50 transition-colors"
          >
            <Share2 size={14} />
            Compartir
          </button>
          {mostrarMenuCompartir && <MenuCompartir publicacion={publicacion} onCerrar={() => setMostrarMenuCompartir(false)} />}
        </div>
      </div>

      {mostrarComentarios && (
        <SeccionComentarios
          publicacionId={publicacion.id}
          onComentario={() => onCambio({ comentarios_count: publicacion.comentarios_count + 1 })}
        />
      )}

      <div className="flex items-center gap-4 px-4 py-2.5 text-jungle-400 border-t border-jungle-50">
        <button
          onClick={reportar}
          disabled={reportando || reportado}
          className="flex items-center gap-1.5 text-xs font-medium hover:text-amber-600 disabled:opacity-50"
          title="Reportar"
        >
          <Flag size={13} className={reportado ? 'fill-amber-500 text-amber-500' : ''} />
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