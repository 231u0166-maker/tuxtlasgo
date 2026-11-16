// ============================================================
// EVENTOS — agenda pública de Los Tuxtlas
// ============================================================
// Calendario mensual + lista de eventos publicados desde el panel de admin
// (api/_lib/eventos.ts). Un evento sigue en "Próximos" hasta que pasa su último
// día; después pasa solo a "Historial". Cada evento puede traer un programa de
// actividades por día (hora, descripción, lugar, foto o video).
//
// Los eventos son contenido editorial de la plataforma: por ahora no se cobra
// por publicar ni se vende nada aquí.
//
// Móvil: el grid es de UNA columna con minmax(0,1fr) (grid-cols-1) y los textos
// largos se parten en líneas. Con `truncate`/nowrap dentro de una pista `auto`,
// la columna se ensanchaba a lo que midiera el texto y la página se salía de la
// pantalla.
//
// Accesible por diseño: el calendario es una cuadrícula de botones con nombre
// ("15 de noviembre, 2 eventos"), la lista es una <ul> de botones, y el detalle
// es un diálogo con foco atrapado (useDialogA11y).
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, ExternalLink, MapPin, Play, Tag, X, WifiOff } from 'lucide-react';
import SubNavPublica from './SubNavPublica';
import { useI18n } from '../lib/i18n';
import { useDialogA11y } from '../lib/useDialogA11y';
import {
  agruparPorDia, aISO, cap, cargarAgenda, cargarHistorial, enlaceSeguro, esVideoDirecto, fechaLocal, finEvento,
  formatearHora, formatearRango, hoyISO, localeDe, ocurreEn,
  type EventoAgenda, type ItemPrograma, type ResultadoAgenda,
} from '../lib/agendaEventos';
import { optimizarImagen, ANCHO_TARJETA, ANCHO_DETALLE } from '../lib/imagenOptimizada';

const dow = (d: Date) => (d.getDay() + 6) % 7; // 0 = lunes

export function horaTexto(e: EventoAgenda, idioma: string): string {
  const ini = formatearHora(e.hora_inicio, idioma);
  const fin = formatearHora(e.hora_fin, idioma);
  return ini && fin ? `${ini} – ${fin}` : ini;
}

type Vista = 'proximos' | 'historial';

export default function EventosPage() {
  const { t, idioma } = useI18n();
  const [vista, setVista] = useState<Vista>('proximos');
  const [res, setRes] = useState<ResultadoAgenda | null>(null);
  const [hist, setHist] = useState<ResultadoAgenda | null>(null);
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string>('Todas');
  const [detalle, setDetalle] = useState<EventoAgenda | null>(null);

  function cargar() {
    if (vista === 'proximos') { setRes(null); cargarAgenda().then(setRes); }
    else { setHist(null); cargarHistorial().then(setHist); }
  }
  useEffect(() => { cargarAgenda().then(setRes); }, []);
  // El historial se pide la primera vez que se abre (no pesa en la carga inicial).
  useEffect(() => { if (vista === 'historial' && hist === null) cargarHistorial().then(setHist); }, [vista, hist]);

  const actual = vista === 'proximos' ? res : hist;
  const eventos = res?.eventos ?? [];
  const categorias = useMemo(() => Array.from(new Set(eventos.map((e) => e.categoria))), [eventos]);
  const filtrados = useMemo(
    () => eventos.filter((e) => (categoria === 'Todas' || e.categoria === categoria) && (!diaSel || ocurreEn(e, diaSel))),
    [eventos, categoria, diaSel],
  );

  // ── Calendario del mes ──────────────────────────────────
  const loc = localeDe(idioma);
  const tituloMes = mes.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  const diasEnMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const huecos = dow(mes);
  const hoy = hoyISO();
  const nombresDia = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(loc, { weekday: 'short' }));
  const delDia = (iso: string) => eventos.filter((e) => (categoria === 'Todas' || e.categoria === categoria) && ocurreEn(e, iso));

  return (
    <div className="min-h-screen bg-amate-50">
      <SubNavPublica activa="eventos" />

      <main id="contenido-principal" className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-16 overflow-x-clip">
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-obsidiana-900 break-words">
          {t('Eventos en Los Tuxtlas')}
        </h1>
        <p className="text-obsidiana-800/60 mt-2 max-w-xl">
          {t('Fiestas, ferias, música y actividades de la región, publicadas por el equipo de TuxtlasGO.')}
        </p>

        <div role="group" aria-label={t('Tipo de eventos')} className="mt-6 inline-flex bg-white border border-obsidiana-900/8 rounded-full p-1">
          {([['proximos', 'Próximos'], ['historial', 'Historial']] as [Vista, string][]).map(([v, texto]) => (
            <button
              key={v}
              onClick={() => { setVista(v); setDiaSel(null); }}
              aria-pressed={vista === v}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${vista === v ? 'bg-jungle-900 text-white' : 'text-obsidiana-800 hover:bg-jungle-50'}`}
            >
              {t(texto)}
            </button>
          ))}
        </div>

        {actual?.desdeCache && (
          <p role="status" className="mt-5 flex items-start gap-2 text-sm bg-amber-50 text-amber-900 border border-amber-200 rounded-xl px-4 py-3">
            <WifiOff size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            {t('Sin conexión: mostrando la última lista guardada, puede estar desactualizada.')}
          </p>
        )}

        {actual === null && (
          <p role="status" className="mt-10 text-obsidiana-800/60">{vista === 'proximos' ? t('Cargando eventos…') : t('Cargando historial…')}</p>
        )}

        {actual?.fallo && (
          <div role="alert" className="mt-8 bg-white border border-obsidiana-900/10 rounded-2xl p-6 max-w-md">
            <p className="text-obsidiana-900 font-semibold">{t('No se pudieron cargar los eventos.')}</p>
            <p className="text-sm text-obsidiana-800/60 mt-1">{t('Revisa tu conexión e inténtalo de nuevo.')}</p>
            <button onClick={cargar} className="mt-4 bg-jungle-700 hover:bg-jungle-800 text-white text-sm font-semibold px-5 py-2.5 rounded-full">
              {t('Reintentar')}
            </button>
          </div>
        )}

        {/* ── Historial: eventos que ya terminaron ── */}
        {vista === 'historial' && hist && !hist.fallo && (
          <section aria-label={t('Historial de eventos')} className="mt-8 min-w-0">
            {hist.eventos.length === 0 ? (
              <p className="text-obsidiana-800/60 bg-white border border-obsidiana-900/8 rounded-2xl px-5 py-8 text-center">
                {t('Todavía no hay eventos en el historial.')}
              </p>
            ) : (
              <ul className="space-y-3 max-w-3xl">
                {hist.eventos.map((e) => (
                  <li key={e.id}><TarjetaEvento evento={e} pasado onAbrir={() => setDetalle(e)} /></li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── Próximos: calendario + lista ── */}
        {vista === 'proximos' && res && !res.fallo && (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-8 items-start">
            <section aria-label={t('Calendario de eventos')} className="min-w-0 bg-white rounded-3xl border border-obsidiana-900/8 p-4 sm:p-5 lg:sticky lg:top-24">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
                  aria-label={t('Mes anterior')}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-obsidiana-800 hover:bg-jungle-50"
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <h2 className="font-display font-bold text-obsidiana-900" aria-live="polite">{cap(tituloMes)}</h2>
                <button
                  onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
                  aria-label={t('Mes siguiente')}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-obsidiana-800 hover:bg-jungle-50"
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-obsidiana-800/50 mb-1" aria-hidden="true">
                {nombresDia.map((n, i) => <div key={i} className="py-1 capitalize">{n.replace('.', '')}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-y-1">
                {Array.from({ length: huecos }, (_, i) => <div key={'h' + i} />)}
                {Array.from({ length: diasEnMes }, (_, i) => {
                  const d = new Date(mes.getFullYear(), mes.getMonth(), i + 1);
                  const iso = aISO(d);
                  const n = delDia(iso).length;
                  const sel = diaSel === iso;
                  const etiqueta = d.toLocaleDateString(loc, { day: 'numeric', month: 'long' })
                    + (n > 0 ? `, ${n === 1 ? t('1 evento') : t('{n} eventos', { n })}` : '');
                  return (
                    <button
                      key={iso}
                      onClick={() => setDiaSel(sel ? null : iso)}
                      aria-label={etiqueta}
                      aria-pressed={sel}
                      aria-current={iso === hoy ? 'date' : undefined}
                      className={`relative h-11 rounded-xl text-sm font-medium transition-colors ${sel
                        ? 'bg-jungle-700 text-white'
                        : iso === hoy
                          ? 'ring-2 ring-jungle-600 text-obsidiana-900 hover:bg-jungle-50'
                          : 'text-obsidiana-800 hover:bg-jungle-50'
                        }`}
                    >
                      {i + 1}
                      {n > 0 && (
                        <span aria-hidden="true" className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${sel ? 'bg-white' : 'bg-amber-600'}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <section aria-label={t('Lista de eventos')} className="min-w-0">
              {categorias.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 mb-5">
                  {['Todas', ...categorias].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategoria(c)}
                      aria-pressed={categoria === c}
                      className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${categoria === c
                        ? 'bg-jungle-900 text-white'
                        : 'bg-white text-obsidiana-800 border border-obsidiana-900/8 hover:border-jungle-300'
                        }`}
                    >
                      {c === 'Todas' ? t('Todos') : t(c)}
                    </button>
                  ))}
                </div>
              )}

              {diaSel && (
                <div className="flex items-center justify-between gap-3 mb-4 bg-jungle-50 border border-jungle-100 rounded-xl px-4 py-2.5">
                  <p className="text-sm text-jungle-900 font-medium min-w-0 break-words">
                    {cap(fechaLocal(diaSel).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }))}
                  </p>
                  <button onClick={() => setDiaSel(null)} className="flex-shrink-0 text-sm font-semibold text-jungle-700 hover:text-jungle-900 underline underline-offset-2">
                    {t('Ver todos los eventos')}
                  </button>
                </div>
              )}

              <p className="sr-only" role="status">
                {filtrados.length === 1 ? t('1 evento') : t('{n} eventos', { n: filtrados.length })}
              </p>

              {filtrados.length === 0 ? (
                <p className="text-obsidiana-800/60 bg-white border border-obsidiana-900/8 rounded-2xl px-5 py-8 text-center">
                  {eventos.length === 0
                    ? t('Todavía no hay eventos publicados. Vuelve pronto.')
                    : diaSel ? t('No hay eventos este día.') : t('No hay eventos en esta categoría.')}
                </p>
              ) : (
                <ul className="space-y-3">
                  {filtrados.map((e) => (
                    <li key={e.id}><TarjetaEvento evento={e} onAbrir={() => setDetalle(e)} /></li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>

      {detalle && <DetalleEvento evento={detalle} onCerrar={() => setDetalle(null)} />}
    </div>
  );
}

function TarjetaEvento({ evento: e, onAbrir, pasado }: { evento: EventoAgenda; onAbrir: () => void; pasado?: boolean }) {
  const { t, td, idioma } = useI18n();
  const loc = localeDe(idioma);
  const f = fechaLocal(e.fecha);
  const hora = horaTexto(e, idioma);
  const actividades = e.programa.length;
  return (
    <button
      onClick={onAbrir}
      className={`w-full min-w-0 text-left flex gap-3 sm:gap-4 bg-white rounded-2xl border border-obsidiana-900/8 hover:border-jungle-300 hover:shadow-md transition-all p-3 sm:p-4 ${pasado ? 'opacity-90' : ''}`}
    >
      <div className={`flex-shrink-0 w-14 sm:w-16 self-start rounded-xl flex flex-col items-center justify-center py-2 ${pasado ? 'bg-slate-100 text-slate-700' : 'bg-jungle-50 text-jungle-900'}`} aria-hidden="true">
        <span className="text-[11px] font-bold uppercase tracking-wide">{f.toLocaleDateString(loc, { month: 'short' }).replace('.', '')}</span>
        <span className="font-display font-extrabold text-2xl leading-none">{f.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">
            <Tag size={10} aria-hidden="true" /> {t(e.categoria)}
          </span>
          {pasado && <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 rounded-full px-2 py-0.5">{t('Terminó')}</span>}
        </div>
        <h3 className="font-display font-bold text-obsidiana-900 mt-1 leading-snug break-words">{e.titulo}</h3>
        <p className="text-sm text-obsidiana-800/70 mt-1 flex items-start gap-1.5">
          <CalendarDays size={13} aria-hidden="true" className="flex-shrink-0 mt-[3px]" />
          <span className="min-w-0 break-words">{cap(formatearRango(e, idioma))}{hora ? ` · ${hora}` : ''}</span>
        </p>
        {(e.lugar || e.municipio) && (
          <p className="text-sm text-obsidiana-800/70 flex items-start gap-1.5">
            <MapPin size={13} aria-hidden="true" className="flex-shrink-0 mt-[3px]" />
            <span className="min-w-0 break-words">{[e.lugar, e.municipio].filter(Boolean).join(', ')}</span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
          {e.precio_entrada && <p className="text-sm font-semibold text-jungle-800">{td(e.precio_entrada)}</p>}
          {actividades > 0 && (
            <p className="text-xs font-medium text-obsidiana-800/60">
              {actividades === 1 ? t('1 actividad en el programa') : t('{n} actividades en el programa', { n: actividades })}
            </p>
          )}
        </div>
      </div>
      {e.imagen && (
        <img
          src={optimizarImagen(e.imagen, ANCHO_TARJETA)}
          alt=""
          loading="lazy"
          className="hidden sm:block w-24 h-24 rounded-xl object-cover flex-shrink-0"
        />
      )}
    </button>
  );
}

function ProgramaEvento({ programa }: { programa: ItemPrograma[] }) {
  const { t, idioma } = useI18n();
  const loc = localeDe(idioma);
  const grupos = agruparPorDia(programa);
  if (grupos.length === 0) return null;
  return (
    <section className="mt-6" aria-labelledby="titulo-programa">
      <h3 id="titulo-programa" className="font-display font-bold text-obsidiana-900">{t('Programa')}</h3>
      <div className="mt-3 space-y-5">
        {grupos.map((g) => (
          <div key={g.dia}>
            <h4 className="text-sm font-bold text-jungle-900 bg-jungle-50 rounded-lg px-3 py-1.5">
              {cap(fechaLocal(g.dia).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }))}
            </h4>
            <ul className="mt-2.5 space-y-3.5">
              {g.items.map((it, i) => {
                const enlaceVideo = it.video ? enlaceSeguro(it.video) : null;
                return (
                  <li key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-[4.5rem] text-xs sm:text-sm font-semibold text-obsidiana-900 pt-0.5">
                      {it.hora
                        ? formatearHora(it.hora, idioma)
                        : (<><span aria-hidden="true">—</span><span className="sr-only">{t('Sin hora fija')}</span></>)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-obsidiana-800 whitespace-pre-line break-words leading-relaxed">{it.descripcion}</p>
                      {it.lugar && (
                        <p className="text-xs text-obsidiana-800/60 mt-0.5 flex items-start gap-1">
                          <MapPin size={12} aria-hidden="true" className="flex-shrink-0 mt-[2px]" />
                          <span className="min-w-0 break-words">{it.lugar}</span>
                        </p>
                      )}
                      {it.imagen && (
                        <img src={optimizarImagen(it.imagen, ANCHO_TARJETA)} alt="" loading="lazy" className="mt-2 rounded-xl w-full max-h-56 object-cover" />
                      )}
                      {it.video && enlaceVideo && (
                        esVideoDirecto(enlaceVideo) ? (
                          <video
                            src={enlaceVideo}
                            controls
                            preload="none"
                            playsInline
                            aria-label={`${t('Video')}: ${it.descripcion.slice(0, 60)}`}
                            className="mt-2 rounded-xl w-full max-h-64 bg-black"
                          />
                        ) : (
                          <a
                            href={enlaceVideo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-jungle-700 hover:text-jungle-900 underline underline-offset-2"
                          >
                            <Play size={14} aria-hidden="true" />
                            {t('Ver video')}
                            <span className="sr-only">({t('se abre en otra pestaña')})</span>
                          </a>
                        )
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function DetalleEvento({ evento: e, onCerrar }: { evento: EventoAgenda; onCerrar: () => void }) {
  const { t, td, idioma } = useI18n();
  const ref = useDialogA11y({ onClose: onCerrar, label: e.titulo });
  const hora = horaTexto(e, idioma);
  const enlace = e.enlace ? enlaceSeguro(e.enlace) : null;
  const terminado = finEvento(e) < hoyISO();
  return (
    <div ref={ref} className="fixed inset-0 z-[100] bg-obsidiana-950/60 flex items-end sm:items-center justify-center" onClick={onCerrar}>
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden"
        onClick={(ev) => ev.stopPropagation()}
      >
        {e.imagen && (
          <img src={optimizarImagen(e.imagen, ANCHO_DETALLE)} alt="" className="w-full max-h-56 object-cover sm:rounded-t-3xl" />
        )}
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">
                <Tag size={10} aria-hidden="true" /> {t(e.categoria)}
              </span>
              <h2 className="font-display font-extrabold text-xl text-obsidiana-900 mt-1.5 leading-snug break-words">{e.titulo}</h2>
            </div>
            <button onClick={onCerrar} aria-label={t('Cerrar')} className="w-10 h-10 -mr-2 -mt-2 rounded-full flex items-center justify-center text-obsidiana-800/60 hover:bg-obsidiana-900/5 flex-shrink-0">
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <dl className="mt-4 space-y-2 text-sm text-obsidiana-800">
            <div className="flex gap-2">
              <dt className="sr-only">{t('Fecha')}</dt>
              <CalendarDays size={16} className="mt-0.5 flex-shrink-0 text-jungle-700" aria-hidden="true" />
              <dd className="min-w-0 break-words">{cap(formatearRango(e, idioma))}</dd>
            </div>
            {hora && (
              <div className="flex gap-2">
                <dt className="sr-only">{t('Hora')}</dt>
                <Clock size={16} className="mt-0.5 flex-shrink-0 text-jungle-700" aria-hidden="true" />
                <dd>{hora}</dd>
              </div>
            )}
            {(e.lugar || e.municipio) && (
              <div className="flex gap-2">
                <dt className="sr-only">{t('Lugar')}</dt>
                <MapPin size={16} className="mt-0.5 flex-shrink-0 text-jungle-700" aria-hidden="true" />
                <dd className="min-w-0 break-words">{[e.lugar, e.municipio].filter(Boolean).join(', ')}</dd>
              </div>
            )}
            {e.precio_entrada && (
              <div className="flex gap-2">
                <dt className="font-semibold">{t('Entrada')}:</dt>
                <dd className="min-w-0 break-words">{td(e.precio_entrada)}</dd>
              </div>
            )}
          </dl>

          {terminado && <p className="mt-3 text-sm text-amber-800">{t('Este evento ya terminó.')}</p>}

          {e.descripcion && <p className="mt-4 text-obsidiana-800/80 whitespace-pre-line break-words leading-relaxed">{e.descripcion}</p>}

          <ProgramaEvento programa={e.programa} />

          {(e.organizador || e.contacto) && (
            <div className="mt-5 text-sm text-obsidiana-800/70 space-y-0.5 break-words">
              {e.organizador && <p><span className="font-semibold">{t('Organiza')}:</span> {e.organizador}</p>}
              {e.contacto && <p><span className="font-semibold">{t('Contacto')}:</span> {e.contacto}</p>}
            </div>
          )}

          {enlace && (
            <a
              href={enlace}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 bg-jungle-700 hover:bg-jungle-800 text-white text-sm font-semibold px-5 py-2.5 rounded-full"
            >
              {t('Más información')}
              <ExternalLink size={14} aria-hidden="true" />
              <span className="sr-only">({t('se abre en otra pestaña')})</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
