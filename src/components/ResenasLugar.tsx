import { useCallback, useEffect, useState } from 'react';
import { Star, ThumbsUp, MessageCircle, Trash2, CornerDownRight, Loader2, LogIn } from 'lucide-react';
import { getToken, getUsuarioLocal } from '../lib/auth';
import { useT } from '../lib/i18n';

// ============================================================
// RESEÑAS DE UN LUGAR — calificar, comentar y responder
// ============================================================
// Flujo: A publica una reseña (estrellas + texto) → B la comenta →
// A (o quien sea) responde → los demás la marcan "Útil". Solo comentan,
// califican y votan los usuarios registrados; leer es público. Cada
// comentario/respuesta/voto llega a la campana de avisos de quien
// corresponde. El servidor es /api/comunidad/publicaciones?recurso=resenas
// (vive ahí porque Vercel Hobby limita a 12 funciones).

interface Comentario {
  id: number;
  usuario_id: number;
  respuesta_a: number | null;
  texto: string;
  creado_en: string;
  autor_nombre: string;
  autor_foto?: string | null;
}
interface Resena {
  id: number;
  usuario_id: number;
  calificacion: number;
  texto: string;
  creado_en: string;
  autor_nombre: string;
  autor_foto?: string | null;
  utiles: number;
  le_di_util: boolean;
  comentarios: Comentario[];
}
interface Resumen {
  total: number;
  promedio: number;
  distribucion: number[]; // 5,4,3,2,1
}

const API = '/api/comunidad/publicaciones?recurso=resenas';

async function llamar(url: string, opciones: RequestInit = {}) {
  const token = getToken();
  const r = await fetch(url, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || 'No se pudo completar');
  return d;
}

function Estrellas({ valor, tam = 16 }: { valor: number; tam?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${valor} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={tam} className={n <= Math.round(valor) ? 'fill-amber-400 text-amber-400' : 'text-jungle-200'} />
      ))}
    </span>
  );
}

function Avatar({ nombre, foto }: { nombre: string; foto?: string | null }) {
  return foto ? (
    <img src={foto} alt="" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-jungle-700 text-sm font-bold text-white">
      {nombre.charAt(0).toUpperCase()}
    </span>
  );
}

function fechaCorta(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function ResenasLugar({
  lugarId,
  lugarNombre,
  onIniciarSesion,
}: {
  lugarId: string;
  lugarNombre: string;
  onIniciarSesion?: () => void;
}) {
  const t = useT();
  const yo = getUsuarioLocal();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [resumen, setResumen] = useState<Resumen>({ total: 0, promedio: 0, distribucion: [0, 0, 0, 0, 0] });

  // Formulario de MI reseña
  const [cal, setCal] = useState(0);
  const [hover, setHover] = useState(0);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    try {
      const d = await llamar(`${API}&lugar_id=${encodeURIComponent(lugarId)}`);
      setResenas(d.resenas);
      setResumen(d.resumen);
      setError('');
    } catch {
      setError(t('No pudimos cargar las reseñas (¿sin conexión?).'));
    } finally {
      setCargando(false);
    }
  }, [lugarId, t]);

  useEffect(() => {
    setCargando(true);
    cargar();
  }, [cargar]);

  const miResena = yo ? resenas.find((r) => r.usuario_id === yo.id) : undefined;
  useEffect(() => {
    if (miResena) {
      setCal(miResena.calificacion);
      setTexto(miResena.texto);
    } else {
      setCal(0);
      setTexto('');
    }
  }, [miResena?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function publicar() {
    setAviso('');
    if (cal < 1) return setAviso(t('Elige de 1 a 5 estrellas.'));
    if (texto.trim().length < 3) return setAviso(t('Cuéntanos tu experiencia.'));
    setEnviando(true);
    try {
      await llamar(API, {
        method: 'POST',
        body: JSON.stringify({ accion: 'resena', lugar_id: lugarId, lugar_nombre: lugarNombre, calificacion: cal, texto }),
      });
      await cargar();
      setAviso(t('¡Gracias! Tu reseña quedó publicada.'));
    } catch (e: any) {
      setAviso(e.message);
    } finally {
      setEnviando(false);
    }
  }

  async function accion(cuerpo: object) {
    try {
      await llamar(API, { method: 'POST', body: JSON.stringify(cuerpo) });
      await cargar();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function borrar(tipo: 'resena' | 'comentario', id: number) {
    if (!window.confirm(t('¿Borrar esto?'))) return;
    try {
      await llamar(`${API}&tipo=${tipo}&id=${id}`, { method: 'DELETE' });
      await cargar();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const max = Math.max(1, ...resumen.distribucion);

  return (
    <div className="mt-4">
      {/* Resumen */}
      {resumen.total > 0 && (
        <div className="flex flex-col gap-5 rounded-2xl border border-jungle-100 bg-jungle-50/60 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="text-center sm:min-w-[9rem]">
            <div className="font-display text-5xl font-extrabold text-jungle-950">{resumen.promedio.toFixed(1)}</div>
            <Estrellas valor={resumen.promedio} tam={18} />
            <div className="mt-1 text-xs text-jungle-600">
              {resumen.total === 1 ? t('{n} reseña', { n: 1 }) : t('{n} reseñas', { n: resumen.total })}
            </div>
          </div>
          <div className="flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map((n, i) => (
              <div key={n} className="flex items-center gap-2 text-xs text-jungle-700">
                <span className="w-3">{n}</span>
                <Star size={11} className="fill-amber-400 text-amber-400" />
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${(resumen.distribucion[i] / max) * 100}%` }} />
                </div>
                <span className="w-5 text-right">{resumen.distribucion[i]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Escribir / editar mi reseña */}
      <div className="mt-4 rounded-2xl border border-jungle-200 bg-white p-4 sm:p-5">
        {yo ? (
          <>
            <div className="font-display font-bold text-jungle-950">
              {miResena ? t('Tu reseña (puedes editarla)') : t('Cuéntanos tu experiencia')}
            </div>
            <div className="mt-2 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onMouseEnter={() => setHover(n)}
                  onClick={() => setCal(n)}
                  aria-label={`${n} ${t('estrellas')}`}
                  className="p-0.5 transition-transform hover:scale-110"
                >
                  <Star size={28} className={n <= (hover || cal) ? 'fill-amber-400 text-amber-400' : 'text-jungle-200'} />
                </button>
              ))}
            </div>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={t('¿Qué tal estuvo? Servicio, ambiente, precio…')}
              className="mt-3 w-full resize-none rounded-xl border border-jungle-200 px-3.5 py-2.5 text-sm text-jungle-950 placeholder:text-jungle-400 focus:border-jungle-400 focus:outline-none focus:ring-2 focus:ring-jungle-300"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                onClick={publicar}
                disabled={enviando}
                className="inline-flex items-center gap-2 rounded-full bg-jungle-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-jungle-700 disabled:opacity-60"
              >
                {enviando && <Loader2 size={15} className="animate-spin" />}
                {miResena ? t('Actualizar reseña') : t('Publicar reseña')}
              </button>
              {miResena && (
                <button onClick={() => borrar('resena', miResena.id)} className="text-sm font-semibold text-red-600 hover:underline">
                  {t('Borrar mi reseña')}
                </button>
              )}
              {aviso && <span className="text-sm text-jungle-700">{aviso}</span>}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-display font-bold text-jungle-950">{t('¿Ya fuiste? Cuéntanos.')}</div>
              <p className="text-sm text-jungle-600">{t('Solo los usuarios registrados pueden calificar y comentar.')}</p>
            </div>
            {onIniciarSesion && (
              <button
                onClick={onIniciarSesion}
                className="inline-flex flex-shrink-0 items-center gap-2 rounded-full bg-jungle-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-jungle-700"
              >
                <LogIn size={15} /> {t('Iniciar sesión')}
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Lista */}
      <div className="mt-5 space-y-5">
        {cargando && (
          <p className="flex items-center gap-2 text-sm text-jungle-600">
            <Loader2 size={15} className="animate-spin" /> {t('Cargando reseñas…')}
          </p>
        )}
        {!cargando && resenas.length === 0 && !error && (
          <p className="text-sm text-jungle-600">{t('Todavía no hay reseñas de turistas para este lugar. ¡Sé el primero!')}</p>
        )}
        {resenas.map((r) => (
          <TarjetaResena
            key={r.id}
            r={r}
            yoId={yo?.id ?? null}
            onUtil={() => (yo ? accion({ accion: 'util', resena_id: r.id }) : onIniciarSesion?.())}
            onComentar={(texto, respuestaA) => accion({ accion: 'comentar', resena_id: r.id, texto, respuesta_a: respuestaA })}
            onBorrarComentario={(id) => borrar('comentario', id)}
            onIniciarSesion={onIniciarSesion}
          />
        ))}
      </div>
    </div>
  );
}

function TarjetaResena({
  r,
  yoId,
  onUtil,
  onComentar,
  onBorrarComentario,
  onIniciarSesion,
}: {
  r: Resena;
  yoId: number | null;
  onUtil: () => void;
  onComentar: (texto: string, respuestaA: number | null) => Promise<void> | void;
  onBorrarComentario: (id: number) => void;
  onIniciarSesion?: () => void;
}) {
  const t = useT();
  const [abierto, setAbierto] = useState(r.comentarios.length > 0 && r.comentarios.length <= 3);
  // A qué comentario estoy respondiendo (null = comentario a la reseña)
  const [respondiendo, setRespondiendo] = useState<number | null>(null);
  const [mostrarCaja, setMostrarCaja] = useState(false);
  const [txt, setTxt] = useState('');
  const [enviando, setEnviando] = useState(false);
  const nombrePorId = new Map(r.comentarios.map((c) => [c.id, c.autor_nombre]));

  async function enviar() {
    if (!txt.trim()) return;
    setEnviando(true);
    await onComentar(txt.trim(), respondiendo);
    setTxt('');
    setMostrarCaja(false);
    setRespondiendo(null);
    setAbierto(true);
    setEnviando(false);
  }

  function abrirCaja(respuestaA: number | null) {
    if (!yoId) return onIniciarSesion?.();
    setRespondiendo(respuestaA);
    setMostrarCaja(true);
  }

  return (
    <article className="rounded-2xl border border-jungle-100 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar nombre={r.autor_nombre} foto={r.autor_foto} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-display font-bold text-jungle-950">{r.autor_nombre}</span>
            <span className="text-xs text-jungle-500">{fechaCorta(r.creado_en)}</span>
          </div>
          <Estrellas valor={r.calificacion} />
          <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-jungle-900">{r.texto}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={onUtil}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                r.le_di_util ? 'border-jungle-700 bg-jungle-700 text-white' : 'border-jungle-200 text-jungle-800 hover:bg-jungle-50'
              }`}
            >
              <ThumbsUp size={13} /> {t('Útil')} {r.utiles > 0 && `· ${r.utiles}`}
            </button>
            <button
              onClick={() => (r.comentarios.length ? setAbierto((v) => !v) : abrirCaja(null))}
              className="inline-flex items-center gap-1.5 rounded-full border border-jungle-200 px-3 py-1.5 text-xs font-semibold text-jungle-800 hover:bg-jungle-50"
            >
              <MessageCircle size={13} />
              {r.comentarios.length > 0
                ? r.comentarios.length === 1
                  ? t('{n} comentario', { n: 1 })
                  : t('{n} comentarios', { n: r.comentarios.length })
                : t('Comentar')}
            </button>
            {r.comentarios.length > 0 && (
              <button onClick={() => abrirCaja(null)} className="text-xs font-semibold text-jungle-700 hover:underline">
                {t('Comentar')}
              </button>
            )}
          </div>

          {abierto && r.comentarios.length > 0 && (
            <div className="mt-3 space-y-3 border-l-2 border-jungle-100 pl-3 sm:pl-4">
              {r.comentarios.map((c) => (
                <div key={c.id} className="flex items-start gap-2.5">
                  <Avatar nombre={c.autor_nombre} foto={c.autor_foto} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 text-xs">
                      <span className="font-bold text-jungle-950">{c.autor_nombre}</span>
                      {c.usuario_id === r.usuario_id && (
                        <span className="rounded-full bg-jungle-100 px-2 py-0.5 text-[10px] font-semibold text-jungle-800">
                          {t('Autor de la reseña')}
                        </span>
                      )}
                      <span className="text-jungle-500">{fechaCorta(c.creado_en)}</span>
                    </div>
                    {c.respuesta_a && nombrePorId.get(c.respuesta_a) && (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-jungle-500">
                        <CornerDownRight size={11} /> {t('en respuesta a')} {nombrePorId.get(c.respuesta_a)}
                      </div>
                    )}
                    <p className="mt-0.5 whitespace-pre-line break-words text-sm text-jungle-900">{c.texto}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs">
                      <button onClick={() => abrirCaja(c.id)} className="font-semibold text-jungle-700 hover:underline">
                        {t('Responder')}
                      </button>
                      {yoId === c.usuario_id && (
                        <button onClick={() => onBorrarComentario(c.id)} className="inline-flex items-center gap-1 text-red-600 hover:underline">
                          <Trash2 size={11} /> {t('Borrar')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {mostrarCaja && (
            <div className="mt-3">
              {respondiendo && (
                <div className="mb-1 flex items-center gap-1 text-xs text-jungle-600">
                  <CornerDownRight size={12} /> {t('Respondiendo a')} {nombrePorId.get(respondiendo)}
                  <button onClick={() => setRespondiendo(null)} className="ml-1 font-semibold text-jungle-800 hover:underline">
                    {t('Cancelar')}
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  autoFocus
                  value={txt}
                  onChange={(e) => setTxt(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder={respondiendo ? t('Escribe tu respuesta…') : t('Escribe un comentario…')}
                  className="flex-1 resize-none rounded-xl border border-jungle-200 px-3 py-2 text-sm focus:border-jungle-400 focus:outline-none focus:ring-2 focus:ring-jungle-300"
                />
                <button
                  onClick={enviar}
                  disabled={enviando || !txt.trim()}
                  className="rounded-full bg-jungle-800 px-4 py-2 text-sm font-semibold text-white hover:bg-jungle-700 disabled:opacity-50"
                >
                  {t('Enviar')}
                </button>
                <button onClick={() => { setMostrarCaja(false); setRespondiendo(null); }} className="px-1 py-2 text-sm text-jungle-600 hover:underline">
                  {t('Cancelar')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
