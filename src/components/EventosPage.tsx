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
import { CalendarDays, ChevronLeft, ChevronRight, Clock, ExternalLink, MapPin, Phone, Play, Tag, Ticket, User, X, WifiOff, type LucideIcon } from 'lucide-react';
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
  // `dia` = el día que estaba elegido en el calendario al abrir el evento (null si ninguno).
  const [detalle, setDetalle] = useState<{ evento: EventoAgenda; dia: string | null } | null>(null);

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
                  <li key={e.id}><TarjetaEvento evento={e} pasado onAbrir={() => setDetalle({ evento: e, dia: null })} /></li>
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
                    <li key={e.id}>
                      <TarjetaEvento evento={e} onAbrir={() => setDetalle({ evento: e, dia: diaSel })} />
                      {diaSel && <ProgramaDelDia evento={e} dia={diaSel} onAbrir={() => setDetalle({ evento: e, dia: diaSel })} />}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>

      {detalle && <DetalleEvento evento={detalle.evento} diaInicial={detalle.dia} onCerrar={() => setDetalle(null)} />}
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

/** Fila de dato con ícono, como "Cómo llegar / Horario" en el detalle de un lugar. */
function Fila({ icono: Icono, titulo, children }: { icono: LucideIcon; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3.5 min-w-0">
      <Icono size={20} className="text-jungle-800 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold text-obsidiana-900 text-[15px]">{titulo}</p>
        <div className="text-sm text-obsidiana-800/80 mt-0.5 break-words leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

/** Foto a pantalla completa (el cartel completo, sin recortar). */
function VisorImagen({ url, alt, onCerrar }: { url: string; alt: string; onCerrar: () => void }) {
  const { t } = useI18n();
  const ref = useDialogA11y({ onClose: onCerrar, label: alt });
  return (
    <div ref={ref} className="fixed inset-0 z-[120] bg-black/95 flex items-center justify-center p-2" onClick={onCerrar}>
      <button onClick={onCerrar} aria-label={t('Cerrar foto')} className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
        <X size={22} aria-hidden="true" />
      </button>
      <img src={optimizarImagen(url, 1600)} alt={alt} onClick={(ev) => ev.stopPropagation()} className="max-w-full max-h-full object-contain" />
    </div>
  );
}

/**
 * Programa del evento con selector de DÍAS: al elegir un día solo se ven las
 * actividades que pertenecen a ese día (no una lista larga con todo mezclado).
 * Abre en el día que se eligió en el calendario; si no hubo, en hoy (si el evento está
 * en curso) o en el primer día que viene.
 */
/**
 * Al elegir un día en el calendario, cada evento que ocurre ese día muestra aquí
 * lo que pasa ESE día (antes había que abrir el evento y buscarlo).
 */
function ProgramaDelDia({ evento: e, dia, onAbrir }: { evento: EventoAgenda; dia: string; onAbrir: () => void }) {
  const { t, idioma } = useI18n();
  const items = e.programa.filter((a) => a.dia === dia).sort((a, b) => a.hora.localeCompare(b.hora));
  if (items.length === 0) return null;
  const MAX = 4;
  const loc = localeDe(idioma);
  return (
    <div className="mt-2 rounded-2xl bg-jungle-50 border border-jungle-100 px-4 py-3.5">
      <h3 className="text-sm font-bold text-jungle-900">
        {t('Programa')} · {cap(fechaLocal(dia).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }))}
      </h3>
      <ul className="mt-2.5 space-y-2">
        {items.slice(0, MAX).map((a, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="flex-shrink-0 w-[4.75rem] whitespace-nowrap font-bold text-jungle-900">
              {a.hora ? formatearHora(a.hora, idioma) : (<><span aria-hidden="true">—</span><span className="sr-only">{t('Sin hora fija')}</span></>)}
            </span>
            <span className="min-w-0 break-words text-obsidiana-800">{a.descripcion}</span>
          </li>
        ))}
      </ul>
      <button onClick={onAbrir} className="mt-3 text-sm font-semibold text-jungle-800 hover:text-jungle-950 underline underline-offset-2">
        {items.length > MAX ? t('Ver las {n} actividades del día', { n: items.length }) : t('Ver programa del día')}
      </button>
    </div>
  );
}

function ProgramaEvento({ programa, onFoto, diaInicial }: { programa: ItemPrograma[]; onFoto: (url: string, alt: string) => void; diaInicial?: string | null }) {
  const { t, idioma } = useI18n();
  const loc = localeDe(idioma);
  const grupos = agruparPorDia(programa);
  const hoy = hoyISO();
  const [dia, setDia] = useState(() => (diaInicial && grupos.some((g) => g.dia === diaInicial) ? diaInicial : (grupos.find((g) => g.dia === hoy) ?? grupos.find((g) => g.dia > hoy) ?? grupos[0])?.dia) ?? '');
  const actual = grupos.find((g) => g.dia === dia) ?? grupos[0];
  if (!actual) return null;
  const fActual = fechaLocal(actual.dia);

  return (
    <section aria-labelledby="titulo-programa">
      <h2 id="titulo-programa" className="font-display font-bold text-xl text-obsidiana-900">{t('Programa')}</h2>

      <div role="group" aria-label={t('Días del programa')} className="flex gap-2 overflow-x-auto py-3 -mx-5 px-5 sm:-mx-8 sm:px-8">
        {grupos.map((g) => {
          const f = fechaLocal(g.dia);
          const sel = g.dia === actual.dia;
          const n = g.items.length;
          return (
            <button
              key={g.dia}
              onClick={() => setDia(g.dia)}
              aria-pressed={sel}
              aria-label={`${cap(f.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }))}, ${n === 1 ? t('1 actividad') : t('{n} actividades', { n })}`}
              className={`flex-shrink-0 w-[4.25rem] rounded-2xl py-2.5 flex flex-col items-center border transition-colors ${sel
                ? 'bg-jungle-900 border-jungle-900 text-white'
                : 'bg-white border-obsidiana-900/10 text-obsidiana-800 hover:border-jungle-400'}`}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide">{f.toLocaleDateString(loc, { weekday: 'short' }).replace('.', '')}</span>
              <span className="font-display font-extrabold text-2xl leading-none my-0.5">{f.getDate()}</span>
              <span className={`text-[10px] font-medium uppercase ${sel ? 'text-white/70' : 'text-obsidiana-800/50'}`}>{f.toLocaleDateString(loc, { month: 'short' }).replace('.', '')}</span>
            </button>
          );
        })}
      </div>

      <h3 className="mt-2 font-display font-bold text-obsidiana-900">
        {cap(fActual.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }))}
        <span className="ml-2 text-sm font-medium text-obsidiana-800/55">
          {actual.items.length === 1 ? t('1 actividad') : t('{n} actividades', { n: actual.items.length })}
        </span>
      </h3>

      <ul className="mt-4 space-y-5">
        {actual.items.map((it, i) => {
          const enlaceVideo = it.video ? enlaceSeguro(it.video) : null;
          return (
            <li key={i} className="flex gap-4">
              <div className="flex-shrink-0 w-[5.5rem] pt-0.5">
                <span className="inline-block whitespace-nowrap text-[13px] font-bold text-jungle-900 bg-jungle-50 rounded-lg px-2 py-1">
                  {it.hora
                    ? formatearHora(it.hora, idioma)
                    : (<><span aria-hidden="true">—</span><span className="sr-only">{t('Sin hora fija')}</span></>)}
                </span>
              </div>
              <div className="min-w-0 flex-1 border-l-2 border-jungle-100 pl-4 pb-1">
                <p className="text-[15px] text-obsidiana-900 whitespace-pre-line break-words leading-relaxed">{it.descripcion}</p>
                {it.lugar && (
                  <p className="text-sm text-obsidiana-800/60 mt-1 flex items-start gap-1.5">
                    <MapPin size={14} aria-hidden="true" className="flex-shrink-0 mt-[3px]" />
                    <span className="min-w-0 break-words">{it.lugar}</span>
                  </p>
                )}
                {it.imagen && (
                  <button onClick={() => onFoto(it.imagen, it.descripcion)} aria-label={t('Ampliar foto')} className="mt-3 block w-full overflow-hidden rounded-xl bg-jungle-50">
                    <img src={optimizarImagen(it.imagen, ANCHO_TARJETA)} alt="" loading="lazy" className="w-full max-h-64 object-cover" />
                  </button>
                )}
                {it.video && enlaceVideo && (
                  esVideoDirecto(enlaceVideo) ? (
                    <video
                      src={enlaceVideo}
                      controls
                      preload="none"
                      playsInline
                      aria-label={`${t('Video')}: ${it.descripcion.slice(0, 60)}`}
                      className="mt-3 rounded-xl w-full max-h-72 bg-black"
                    />
                  ) : (
                    <a
                      href={enlaceVideo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-jungle-300 px-4 py-2 text-sm font-semibold text-jungle-900 hover:bg-jungle-50"
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
    </section>
  );
}

const ES_TELEFONO = /^[\d\s()+.-]{7,}$/;

/**
 * Detalle del evento a PANTALLA COMPLETA (mismo lenguaje que el detalle de un
 * lugar): encabezado fijo con cerrar, título, cartel completo sin recortar,
 * pestañas Resumen / Programa y filas con ícono. Antes era una hoja a media
 * pantalla que dejaba ver un pedazo de la página de atrás.
 */
function DetalleEvento({ evento: e, onCerrar, diaInicial }: { evento: EventoAgenda; onCerrar: () => void; diaInicial?: string | null }) {
  const { t, td, idioma } = useI18n();
  const ref = useDialogA11y({ onClose: onCerrar, label: e.titulo });
  const tienePrograma = e.programa.length > 0;
  // Abierto desde un día del calendario que tiene actividades → directo al programa de ESE día.
  const diaConActividades = diaInicial && e.programa.some((a) => a.dia === diaInicial) ? diaInicial : null;
  const [pestana, setPestana] = useState<'resumen' | 'programa'>(diaConActividades ? 'programa' : 'resumen');
  const [foto, setFoto] = useState<{ url: string; alt: string } | null>(null);
  const hora = horaTexto(e, idioma);
  const enlace = e.enlace ? enlaceSeguro(e.enlace) : null;
  const terminado = finEvento(e) < hoyISO();
  const cat = t(e.categoria);

  // La página de atrás no debe moverse mientras el detalle está abierto.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, []);

  return (
    <div ref={ref} className="fixed inset-0 z-[100] bg-white overflow-y-auto overflow-x-hidden overscroll-contain">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-obsidiana-900/8">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 sm:px-6 h-14">
          <button onClick={onCerrar} aria-label={t('Cerrar')} className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-obsidiana-900 hover:bg-obsidiana-900/5">
            <X size={22} aria-hidden="true" />
          </button>
          <p className="font-display font-bold text-obsidiana-900 truncate">{t('Evento')}</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto pb-16">
        <div className="px-5 sm:px-8 pt-5">
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-obsidiana-900 leading-tight break-words">{e.titulo}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 rounded-full px-2.5 py-1">
              <Tag size={11} aria-hidden="true" /> {cat}
            </span>
            {e.municipio && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-jungle-800 bg-jungle-50 rounded-full px-2.5 py-1">
                <MapPin size={11} aria-hidden="true" /> {e.municipio}
              </span>
            )}
            {terminado && <span className="text-xs font-semibold text-slate-700 bg-slate-100 rounded-full px-2.5 py-1">{t('Terminó')}</span>}
          </div>

          {e.imagen && (
            <button
              onClick={() => setFoto({ url: e.imagen, alt: e.titulo })}
              aria-label={t('Ver foto completa')}
              className="mt-5 block w-full rounded-2xl overflow-hidden bg-jungle-50 border border-obsidiana-900/8"
            >
              <img src={optimizarImagen(e.imagen, ANCHO_DETALLE)} alt="" className="mx-auto w-full h-auto max-h-[70vh] object-contain" />
            </button>
          )}
        </div>

        {/* Pestañas — se quedan pegadas bajo el encabezado al deslizar */}
        {tienePrograma && (
          <div role="group" aria-label={t('Secciones del evento')} className="sticky top-14 z-10 bg-white mt-5 px-5 sm:px-8 border-b border-jungle-100 flex gap-6">
            {(['resumen', 'programa'] as const).map((id) => (
              <button
                key={id}
                onClick={() => setPestana(id)}
                aria-pressed={pestana === id}
                className={`py-3.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${pestana === id
                  ? 'border-jungle-900 text-jungle-950'
                  : 'border-transparent text-jungle-500 hover:text-jungle-800'}`}
              >
                {id === 'resumen' ? t('Resumen') : `${t('Programa')} (${e.programa.length})`}
              </button>
            ))}
          </div>
        )}

        <div className="px-5 sm:px-8 pt-6">
          {pestana === 'resumen' || !tienePrograma ? (
            <div className="space-y-6">
              {terminado && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">{t('Este evento ya terminó.')}</p>}

              {e.descripcion && <p className="text-[15px] text-obsidiana-900 whitespace-pre-line break-words leading-relaxed">{e.descripcion}</p>}

              <div className="border-t border-jungle-100 pt-6 grid sm:grid-cols-2 gap-x-8 gap-y-5">
                <Fila icono={CalendarDays} titulo={t('Fecha')}>{cap(formatearRango(e, idioma))}</Fila>
                {hora && <Fila icono={Clock} titulo={t('Hora')}>{hora}</Fila>}
                {(e.lugar || e.municipio) && <Fila icono={MapPin} titulo={t('Lugar')}>{[e.lugar, e.municipio].filter(Boolean).join(', ')}</Fila>}
                {e.precio_entrada && <Fila icono={Ticket} titulo={t('Entrada')}>{td(e.precio_entrada)}</Fila>}
                {e.organizador && <Fila icono={User} titulo={t('Organiza')}>{e.organizador}</Fila>}
                {e.contacto && (
                  <Fila icono={Phone} titulo={t('Contacto')}>
                    {ES_TELEFONO.test(e.contacto)
                      ? <a href={`tel:${e.contacto.replace(/[^\d+]/g, '')}`} className="font-semibold text-jungle-800 underline underline-offset-2">{e.contacto}</a>
                      : e.contacto}
                  </Fila>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {tienePrograma && (
                  <button onClick={() => setPestana('programa')} className="inline-flex items-center gap-1.5 bg-jungle-900 hover:bg-jungle-950 text-white text-sm font-semibold px-5 py-2.5 rounded-full">
                    <CalendarDays size={15} aria-hidden="true" /> {t('Ver programa')}
                  </button>
                )}
                {enlace && (
                  <a
                    href={enlace}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-jungle-300 px-5 py-2.5 text-sm font-semibold text-jungle-900 hover:bg-jungle-50"
                  >
                    {t('Más información')}
                    <ExternalLink size={14} aria-hidden="true" />
                    <span className="sr-only">({t('se abre en otra pestaña')})</span>
                  </a>
                )}
              </div>
            </div>
          ) : (
            <ProgramaEvento programa={e.programa} diaInicial={diaConActividades} onFoto={(url, alt) => setFoto({ url, alt })} />
          )}
        </div>
      </div>

      {foto && <VisorImagen url={foto.url} alt={foto.alt} onCerrar={() => setFoto(null)} />}
    </div>
  );
}
