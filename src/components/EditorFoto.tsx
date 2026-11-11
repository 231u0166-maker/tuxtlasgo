import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crop, Sun, Type, X, Loader2, Save, Share2, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import { subirFoto } from '../lib/cloudinary';
import { getToken } from '../lib/auth';

// Editor de una foto del servicio: recortar, ajustar (brillo, contraste, color) y
// ponerle un texto debajo. Se puede publicar directo en Comunidad.
// Todo el procesamiento es en el navegador (canvas): la foto editada se sube como
// una nueva y reemplaza a la anterior en el mismo lugar.

interface Recorte { x: number; y: number; w: number; h: number } // 0..1 sobre la foto
type Asa = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'm';

const MIN = 0.08;
const TOPE_PX = 1600;
const ASPECTOS: { id: string; texto: string; r: number | null | 'orig' }[] = [
  { id: 'libre', texto: 'Libre', r: null },
  { id: 'orig', texto: 'Original', r: 'orig' },
  { id: '1:1', texto: '1:1', r: 1 },
  { id: '4:3', texto: '4:3', r: 4 / 3 },
  { id: '3:4', texto: '3:4', r: 3 / 4 },
  { id: '16:9', texto: '16:9', r: 16 / 9 },
];
const COMPLETO: Recorte = { x: 0, y: 0, w: 1, h: 1 };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** public_id de Cloudinary a partir de la URL (para borrar la foto anterior). */
function publicIdDesdeUrl(url: string): string | undefined {
  // Con o sin transformaciones y con o sin versión (v123/) antes de la carpeta.
  const m = url.match(/\/upload\/(?:[^?#]*?\/)?v\d+\/([^?#]+)\.[a-z0-9]+(?:[?#].*)?$/i) || url.match(/\/upload\/([^?#]+)\.[a-z0-9]+(?:[?#].*)?$/i);
  return m ? m[1] : undefined;
}

interface Props {
  url: string;
  pie: string;
  codigoSeguimiento: string;
  nombreNegocio?: string;
  /** Avisa al padre con el estado nuevo de las fotos (sin cerrar el editor). */
  onGuardado: (r: { fotos: string[]; pies: Record<string, string>; urlAnterior: string; urlNueva: string }) => void;
  onCerrar: () => void;
}

export default function EditorFoto({ url, pie, codigoSeguimiento, nombreNegocio, onGuardado, onCerrar }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [errorImg, setErrorImg] = useState(false);
  const [recorte, setRecorte] = useState<Recorte>(COMPLETO);
  const [aspecto, setAspecto] = useState('libre');
  const [brillo, setBrillo] = useState(100);
  const [contraste, setContraste] = useState(100);
  const [color, setColor] = useState(100);
  const [texto, setTexto] = useState(pie);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const [compartido, setCompartido] = useState(false);
  const [error, setError] = useState('');
  const gesto = useRef<{ asa: Asa; x0: number; y0: number; c: Recorte } | null>(null);

  const ratioNat = nat ? nat.w / nat.h : 1;
  const ajustado = brillo !== 100 || contraste !== 100 || color !== 100;
  const recortado = Math.abs(recorte.x) > 0.001 || Math.abs(recorte.y) > 0.001 || Math.abs(recorte.w - 1) > 0.001 || Math.abs(recorte.h - 1) > 0.001;
  const hayCambiosFoto = ajustado || recortado;
  const hayCambios = hayCambiosFoto || texto.trim() !== pie.trim();
  const ocupado = guardando || compartiendo;

  useEffect(() => { // Esc cierra
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape' && !ocupado) { e.stopPropagation(); onCerrar(); } };
    window.addEventListener('keydown', f, true);
    return () => window.removeEventListener('keydown', f, true);
  }, [onCerrar, ocupado]);

  // ── proporción elegida: el rectángulo más grande, centrado ──
  function aplicarAspecto(id: string) {
    setAspecto(id);
    const a = ASPECTOS.find((x) => x.id === id)!;
    if (a.r === null) return;
    const r = a.r === 'orig' ? ratioNat : a.r;
    let w = 1, h = ratioNat / r;
    if (h > 1) { h = 1; w = r / ratioNat; }
    setRecorte({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  }
  const ratioActual = (() => {
    const a = ASPECTOS.find((x) => x.id === aspecto)!;
    return a.r === null ? null : a.r === 'orig' ? ratioNat : a.r;
  })();

  // ── mover / redimensionar el recorte ──
  function iniciar(e: React.PointerEvent, asa: Asa) {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesto.current = { asa, x0: e.clientX, y0: e.clientY, c: { ...recorte } };
  }
  function mover(e: React.PointerEvent) {
    const g = gesto.current; const caja = cajaRef.current;
    if (!g || !caja) return;
    const rect = caja.getBoundingClientRect();
    const dx = (e.clientX - g.x0) / rect.width;
    const dy = (e.clientY - g.y0) / rect.height;
    const c = g.c;
    if (g.asa === 'm') {
      setRecorte({ ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) });
      return;
    }
    if (ratioActual !== null) {            // proporción fija: solo esquinas
      if (g.asa.length !== 2) return;
      const k = ratioNat / ratioActual;     // alto = ancho * k
      const oeste = g.asa.includes('w'), norte = g.asa.includes('n');
      const ax = oeste ? c.x + c.w : c.x, ay = norte ? c.y + c.h : c.y;
      const maxW = Math.min(oeste ? ax : 1 - ax, (norte ? ay : 1 - ay) / k);
      const w = clamp(c.w + (oeste ? -dx : dx), MIN, maxW);
      const h = w * k;
      setRecorte({ x: oeste ? ax - w : ax, y: norte ? ay - h : ay, w, h });
      return;
    }
    let x0 = c.x, y0 = c.y, x1 = c.x + c.w, y1 = c.y + c.h;
    if (g.asa.includes('w')) x0 = clamp(c.x + dx, 0, x1 - MIN);
    if (g.asa.includes('e')) x1 = clamp(x1 + dx, x0 + MIN, 1);
    if (g.asa.includes('n')) y0 = clamp(c.y + dy, 0, y1 - MIN);
    if (g.asa.includes('s')) y1 = clamp(y1 + dy, y0 + MIN, 1);
    setRecorte({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  const soltar = () => { gesto.current = null; };

  function restablecer() {
    setRecorte(COMPLETO); setAspecto('libre'); setBrillo(100); setContraste(100); setColor(100);
  }

  // ── exportar la foto editada ──
  function exportar(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = imgRef.current;
      if (!img || !nat) return reject(new Error('La foto aún no carga'));
      const sx = recorte.x * nat.w, sy = recorte.y * nat.h, sw = recorte.w * nat.w, sh = recorte.h * nat.h;
      const escala = Math.min(1, TOPE_PX / Math.max(sw, sh));
      const cw = Math.max(1, Math.round(sw * escala)), ch = Math.max(1, Math.round(sh * escala));
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Tu navegador no pudo preparar la foto'));
      try {
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
        if (ajustado) {
          const datos = ctx.getImageData(0, 0, cw, ch);
          const d = datos.data;
          const b = brillo / 100, c = contraste / 100, s = color / 100;
          for (let i = 0; i < d.length; i += 4) {
            let r = d[i] * b, g = d[i + 1] * b, bl = d[i + 2] * b;
            r = (r - 128) * c + 128; g = (g - 128) * c + 128; bl = (bl - 128) * c + 128;
            const l = 0.299 * r + 0.587 * g + 0.114 * bl;
            d[i] = clamp(l + (r - l) * s, 0, 255);
            d[i + 1] = clamp(l + (g - l) * s, 0, 255);
            d[i + 2] = clamp(l + (bl - l) * s, 0, 255);
          }
          ctx.putImageData(datos, 0, 0);
        }
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la foto'))), 'image/jpeg', 0.9);
      } catch {
        reject(new Error('No se pudo leer la foto para editarla. Intenta de nuevo con internet.'));
      }
    });
  }

  function subirEditada(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      subirFoto(file, codigoSeguimiento, ({ porcentaje, url: nueva, error: e }) => {
        if (e) return reject(new Error(e));
        setProgreso(porcentaje);
        if (nueva) resolve(nueva);
      });
    });
  }

  /** Guarda (foto editada + texto). Devuelve la URL final o null si falló. */
  async function guardarInterno(): Promise<string | null> {
    setError('');
    setGuardando(true);
    try {
      let reemplazarPor: string | undefined;
      if (hayCambiosFoto) {
        const blob = await exportar();
        reemplazarPor = await subirEditada(new File([blob], 'foto-editada.jpg', { type: 'image/jpeg' }));
      }
      const res = await fetch('/api/servicios/editar?recurso=fotos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ url, pie: texto.trim(), reemplazarPor, publicIdViejo: reemplazarPor ? publicIdDesdeUrl(url) : undefined }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'No se pudo guardar');
      onGuardado({ fotos: data.fotos, pies: data.pies, urlAnterior: url, urlNueva: reemplazarPor ?? url });
      return reemplazarPor ?? url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sin conexión — necesitas internet para guardar.');
      return null;
    } finally {
      setGuardando(false);
      setProgreso(null);
    }
  }

  async function guardar() {
    const final = await guardarInterno();
    if (final) onCerrar();
  }

  async function subirAComunidad() {
    setError('');
    setCompartiendo(true);
    try {
      const final = hayCambios ? await guardarInterno() : url;
      if (!final) return;
      const res = await fetch('/api/comunidad/publicaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ texto: texto.trim() || nombreNegocio || '', imagen_url: final }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'No se pudo publicar en Comunidad');
      setCompartido(true);
      setTimeout(onCerrar, 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sin conexión — necesitas internet para publicar.');
    } finally {
      setCompartiendo(false);
    }
  }

  const filtro = useMemo(() => `brightness(${brillo}%) contrast(${contraste}%) saturate(${color}%)`, [brillo, contraste, color]);
  const asas: { id: Asa; clase: string }[] = [
    { id: 'nw', clase: '-left-3 -top-3 cursor-nwse-resize' }, { id: 'ne', clase: '-right-3 -top-3 cursor-nesw-resize' },
    { id: 'sw', clase: '-left-3 -bottom-3 cursor-nesw-resize' }, { id: 'se', clase: '-right-3 -bottom-3 cursor-nwse-resize' },
    ...(ratioActual === null ? [
      { id: 'n' as Asa, clase: 'left-1/2 -top-3 -translate-x-1/2 cursor-ns-resize' }, { id: 's' as Asa, clase: 'left-1/2 -bottom-3 -translate-x-1/2 cursor-ns-resize' },
      { id: 'w' as Asa, clase: '-left-3 top-1/2 -translate-y-1/2 cursor-ew-resize' }, { id: 'e' as Asa, clase: '-right-3 top-1/2 -translate-y-1/2 cursor-ew-resize' },
    ] : []),
  ];

  const tarjeta = 'rounded-2xl bg-white/85 border border-white/90 ring-1 ring-jungle-100/70 shadow-[0_6px_22px_rgba(20,83,45,0.07)] p-4';
  const titulo = (Icono: typeof Crop, t: string) => (
    <p className="flex items-center gap-2 font-display font-bold text-[14px] text-jungle-950 mb-3">
      <span className="h-8 w-8 rounded-xl bg-jungle-50 ring-1 ring-jungle-100 text-jungle-700 flex items-center justify-center"><Icono size={16} strokeWidth={1.75} /></span>{t}
    </p>
  );
  const slider = (etiqueta: string, v: number, set: (n: number) => void) => (
    <label className="block mb-3 last:mb-0">
      <span className="flex justify-between text-xs font-semibold text-jungle-700 mb-1"><span>{etiqueta}</span><span className="text-jungle-500">{v - 100 > 0 ? '+' : ''}{v - 100}</span></span>
      <input type="range" min={50} max={150} step={1} value={v} onChange={(e) => set(Number(e.target.value))} className="w-full h-2 accent-jungle-600" aria-label={etiqueta} />
    </label>
  );

  return createPortal(
    <div className="fixed inset-0 z-[10002] flex flex-col bg-jungle-50 animate-fade-in" role="dialog" aria-label="Editar foto">
      <div className="flex items-center gap-3 px-4 lg:px-7 py-3 border-b border-jungle-100 bg-white/90 backdrop-blur-xl flex-none">
        <div className="min-w-0">
          <h2 className="font-display font-extrabold text-lg text-jungle-950 leading-tight">Editar foto</h2>
          <p className="text-xs text-jungle-500">Recorta, ajusta y ponle un texto</p>
        </div>
        <button onClick={onCerrar} disabled={ocupado} aria-label="Cerrar" className="ml-auto h-11 w-11 rounded-xl flex items-center justify-center text-jungle-600 hover:bg-jungle-50 disabled:opacity-40"><X size={22} /></button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden px-4 lg:px-7 py-4 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        {/* escenario */}
        <div className="flex items-center justify-center min-h-[260px] lg:min-h-0 rounded-2xl bg-jungle-950/90 p-4 lg:p-6 overflow-hidden">
          {errorImg ? (
            <p className="text-white/80 text-sm text-center flex items-center gap-2"><AlertCircle size={18} /> No se pudo cargar la foto. Revisa tu internet.</p>
          ) : (
            <div ref={cajaRef} className="relative inline-block select-none touch-none" style={{ lineHeight: 0 }}>
              <img ref={imgRef} src={url} crossOrigin="anonymous" alt="Foto a editar" draggable={false}
                onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                onError={() => setErrorImg(true)}
                className="block max-w-full max-h-[52vh] lg:max-h-[calc(100vh-230px)] rounded-lg" style={{ filter: filtro }} />
              {nat && (
                // El contenedor excede la foto 16px por cada lado para que las asas de las esquinas no se corten;
                // la capa interior (inset-4) coincide exactamente con la foto.
                <div className="absolute -inset-4 overflow-hidden pointer-events-none">
                 <div className="absolute inset-4">
                  <div className="absolute pointer-events-auto cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                    style={{ left: `${recorte.x * 100}%`, top: `${recorte.y * 100}%`, width: `${recorte.w * 100}%`, height: `${recorte.h * 100}%` }}
                    onPointerDown={(e) => iniciar(e, 'm')} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
                    <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, transparent 33%, rgba(255,255,255,.35) 33%, rgba(255,255,255,.35) calc(33% + 1px), transparent calc(33% + 1px), transparent 66%, rgba(255,255,255,.35) 66%, rgba(255,255,255,.35) calc(66% + 1px), transparent calc(66% + 1px)), linear-gradient(to bottom, transparent 33%, rgba(255,255,255,.35) 33%, rgba(255,255,255,.35) calc(33% + 1px), transparent calc(33% + 1px), transparent 66%, rgba(255,255,255,.35) 66%, rgba(255,255,255,.35) calc(66% + 1px), transparent calc(66% + 1px))' }} />
                    {asas.map((a) => (
                      <span key={a.id} onPointerDown={(e) => iniciar(e, a.id)} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
                        className={`absolute h-6 w-6 rounded-full bg-white border-2 border-jungle-600 shadow ${a.clase}`} style={{ touchAction: 'none' }} />
                    ))}
                  </div>
                 </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* controles */}
        <div className="flex flex-col gap-4 lg:overflow-y-auto lg:pr-1 lg:-mr-1 pb-2">
          <section className={tarjeta}>
            {titulo(Crop, 'Recorte')}
            <div className="flex flex-wrap gap-1.5">
              {ASPECTOS.map((a) => (
                <button key={a.id} type="button" onClick={() => aplicarAspecto(a.id)} aria-pressed={aspecto === a.id}
                  className={`min-h-[40px] px-3.5 rounded-full border-[1.5px] text-[13px] font-semibold transition-colors ${aspecto === a.id ? 'bg-jungle-700 border-jungle-700 text-white' : 'bg-white/80 border-jungle-100 text-jungle-800 hover:border-jungle-300'}`}>
                  {a.texto}
                </button>
              ))}
            </div>
            <p className="text-xs text-jungle-500 mt-2.5 leading-snug">Arrastra el marco para moverlo y las esquinas para cambiar el tamaño.</p>
          </section>

          <section className={tarjeta}>
            {titulo(Sun, 'Ajustes')}
            {slider('Brillo', brillo, setBrillo)}
            {slider('Contraste', contraste, setContraste)}
            {slider('Color', color, setColor)}
            {(hayCambiosFoto) && (
              <button type="button" onClick={restablecer} className="mt-3 text-[13px] font-bold text-jungle-700 flex items-center gap-1.5">
                <RotateCcw size={14} /> Restablecer foto
              </button>
            )}
          </section>

          <section className={tarjeta}>
            {titulo(Type, 'Texto debajo')}
            <textarea value={texto} onChange={(e) => setTexto(e.target.value.slice(0, 160))} rows={3} maxLength={160}
              placeholder="Ej: Vista del lago al atardecer desde nuestra terraza."
              className="w-full rounded-xl border-[1.5px] border-jungle-100 bg-white/90 px-3.5 py-3 text-[15px] text-jungle-950 placeholder:text-jungle-300 resize-none focus:outline-none focus:border-jungle-600 focus:ring-4 focus:ring-jungle-600/10" />
            <p className="text-xs text-jungle-500 mt-1.5 flex justify-between"><span>Se muestra debajo de la foto en tu ficha.</span><span>{texto.length} / 160</span></p>
          </section>

          {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 flex-shrink-0" />{error}</p>}
          {compartido && <p className="text-sm text-jungle-800 bg-jungle-50 border border-jungle-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2"><CheckCircle2 size={16} className="text-jungle-600" /> Publicada en Comunidad.</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 px-4 lg:px-7 py-3 border-t border-jungle-100 bg-white/90 backdrop-blur-xl flex-none lg:justify-end" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
        <button onClick={subirAComunidad} disabled={ocupado || !nat}
          className="order-2 lg:order-1 flex-1 lg:flex-none px-5 py-3.5 rounded-xl border-[1.5px] border-jungle-200 bg-white text-jungle-800 text-sm font-bold flex items-center justify-center gap-2 hover:border-jungle-400 disabled:opacity-50">
          {compartiendo ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />} Subir a Comunidad
        </button>
        <button onClick={onCerrar} disabled={ocupado} className="order-3 lg:order-2 px-6 py-3.5 rounded-xl bg-jungle-50 text-jungle-800 text-sm font-bold hover:bg-jungle-100 disabled:opacity-50">Cancelar</button>
        <button onClick={guardar} disabled={ocupado || !nat || !hayCambios}
          className="order-1 lg:order-3 basis-full lg:basis-auto lg:px-9 py-3.5 rounded-xl bg-jungle-700 hover:bg-jungle-800 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {guardando ? (progreso !== null ? `Subiendo… ${progreso}%` : 'Guardando…') : 'Guardar cambios'}
        </button>
      </div>
    </div>,
    document.body
  );
}
