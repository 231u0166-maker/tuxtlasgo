// ============================================================
// ADMIN — editor del programa de un evento, ORGANIZADO POR DÍAS
// ============================================================
// Antes era una lista plana de actividades, cada una con su selector de día,
// y las de un día se mezclaban con las del siguiente: el día nunca avanzaba solo.
//
// Ahora el editor genera UNA SECCIÓN POR CADA DÍA del evento (de la fecha de
// inicio a la de fin). Cada sección se abre y se cierra, y trae sus propias
// actividades: la actividad nueva nace ya con el día de su sección, así que
// nada se pisa. Cada fila es compacta (hora + qué pasa); lugar, foto y video
// quedan plegados hasta que se necesitan.
//
// Si el admin acorta las fechas del evento y quedan actividades en días que ya
// no existen, aparecen aparte para moverlas a un día válido o quitarlas (no se
// pierden en silencio).
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarPlus, ChevronDown, ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import { subirFoto } from '../lib/cloudinary';
import { aISO, cap, fechaLocal, type ItemPrograma } from '../lib/agendaEventos';

/** Actividad en edición: lleva `_k`, un id solo del navegador para que las filas no se confundan al quitar una. */
export type FilaPrograma = ItemPrograma & { _k: number };

const MAX_DIAS = 31;
const campo = 'w-full border border-jungle-200 rounded-lg px-3 py-2 text-sm text-jungle-950 focus:outline-none focus:border-jungle-500 bg-white';
const mini = 'block text-[11px] font-semibold text-jungle-600 mb-1';

export function diasDelEvento(fecha: string, fechaFin: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return [];
  const ini = fechaLocal(fecha);
  const fin = fechaFin && fechaFin >= fecha ? fechaLocal(fechaFin) : ini;
  const dias: string[] = [];
  for (const d = new Date(ini); d <= fin && dias.length < MAX_DIAS; d.setDate(d.getDate() + 1)) dias.push(aISO(d));
  return dias;
}

export const conClaves = (items: ItemPrograma[]): FilaPrograma[] => items.map((a, i) => ({ ...a, _k: i + 1 }));

/**
 * Deja listo el programa para guardar: quita las filas que se agregaron sin querer
 * (totalmente vacías) y avisa si alguna tiene lugar/foto/video pero no descripción.
 */
export function prepararPrograma(programa: FilaPrograma[]): { items: ItemPrograma[]; error?: { dia: string; mensaje: string } } {
  const items: ItemPrograma[] = [];
  for (const { _k: _omitida, ...a } of programa) {
    const vacia = !a.descripcion.trim() && !a.lugar.trim() && !a.imagen && !a.video.trim() && !a.hora;
    if (vacia) continue;
    if (!a.descripcion.trim()) return { items, error: { dia: a.dia, mensaje: 'A una actividad le falta la descripción.' } };
    items.push(a);
  }
  return { items };
}

const fechaLarga = (iso: string) => cap(fechaLocal(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }));
const textoActividades = (n: number) => (n === 0 ? 'Sin actividades' : n === 1 ? '1 actividad' : `${n} actividades`);

interface Props {
  fecha: string;
  fechaFin: string;
  programa: FilaPrograma[];
  onChange: (p: FilaPrograma[]) => void;
  /** Señal para abrir un día (p. ej. donde falta una descripción); `n` cambia para poder repetirla. */
  abrir?: { dia: string; n: number } | null;
  onAviso: (mensaje: string | null) => void;
}

export default function EditorProgramaEvento({ fecha, fechaFin, programa, onChange, abrir, onAviso }: Props) {
  const dias = useMemo(() => diasDelEvento(fecha, fechaFin), [fecha, fechaFin]);
  const [abierto, setAbierto] = useState<string | null>(null);
  // Extras (lugar/foto/video) abiertos o cerrados a mano; si no se tocó, se abren solos cuando la fila ya tiene alguno.
  const [extras, setExtras] = useState<Record<number, boolean>>({});
  const [subiendo, setSubiendo] = useState<number | null>(null);

  useEffect(() => { if (abrir) setAbierto(abrir.dia); }, [abrir]);

  const diaAbierto = abierto && dias.includes(abierto) ? abierto : (dias.find((d) => programa.some((a) => a.dia === d)) ?? dias[0] ?? null);
  const fuera = programa.filter((a) => !dias.includes(a.dia));

  const cambiar = (k: number, parche: Partial<ItemPrograma>) => onChange(programa.map((a) => (a._k === k ? { ...a, ...parche } : a)));
  const quitar = (k: number) => onChange(programa.filter((a) => a._k !== k));
  function agregar(dia: string) {
    const k = Math.max(0, ...programa.map((a) => a._k)) + 1;
    onChange([...programa, { _k: k, dia, hora: '', descripcion: '', lugar: '', imagen: '', video: '' }]);
    setAbierto(dia);
  }
  function subir(k: number, file: File | undefined) {
    if (!file) return;
    setSubiendo(k);
    onAviso(null);
    subirFoto(file, 'eventos', (p) => {
      if (p.error) { onAviso('No se pudo subir la foto: ' + p.error); setSubiendo(null); }
      else if (p.url) { cambiar(k, { imagen: p.url }); setSubiendo(null); }
    });
  }

  if (dias.length === 0) {
    return (
      <p className="text-sm text-jungle-600 bg-jungle-50 border border-jungle-100 rounded-xl px-4 py-3">
        Elige primero la <strong>fecha de inicio</strong> del evento (y la de fin si dura varios días): aquí aparecerá una sección por cada día para armar su programa.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {fuera.length > 0 && (
        <div role="alert" className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
          <p className="flex items-start gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            Estas actividades quedaron en un día fuera de las fechas del evento. Muévelas a un día válido o quítalas.
          </p>
          {fuera.map((a) => (
            <div key={a._k} className="flex flex-wrap items-center gap-2 pl-6">
              <span className="min-w-0 flex-1 text-sm text-amber-950 truncate">{fechaLarga(a.dia)} · {a.descripcion || '(sin descripción)'}</span>
              <label htmlFor={`pa-${a._k}-mover`} className="sr-only">Mover esta actividad a otro día</label>
              <select id={`pa-${a._k}-mover`} value="" onChange={(e) => e.target.value && cambiar(a._k, { dia: e.target.value })} className="border border-amber-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                <option value="">Mover a…</option>
                {dias.map((d) => <option key={d} value={d}>{fechaLarga(d)}</option>)}
              </select>
              <button type="button" onClick={() => quitar(a._k)} aria-label={`Quitar la actividad «${a.descripcion || 'sin descripción'}»`} className="w-8 h-8 rounded-lg text-red-700 hover:bg-red-50 flex items-center justify-center">
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ul className="space-y-2.5">
        {dias.map((dia, n) => {
          const filas = programa.filter((a) => a.dia === dia);
          const esAbierto = dia === diaAbierto;
          const f = fechaLocal(dia);
          return (
            <li key={dia} className="rounded-2xl border border-jungle-100 bg-white overflow-hidden">
              <h5>
                <button
                  type="button"
                  aria-expanded={esAbierto}
                  aria-controls={`pd-${dia}`}
                  onClick={() => setAbierto(esAbierto ? '' : dia)}
                  className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-jungle-50/60"
                >
                  <span className="flex-shrink-0 w-11 rounded-lg bg-jungle-50 text-jungle-900 text-center py-1" aria-hidden="true">
                    <span className="block text-[10px] font-bold uppercase">{f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}</span>
                    <span className="block font-display font-extrabold text-lg leading-none">{f.getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold text-jungle-500 uppercase tracking-wide">Día {n + 1}</span>
                    <span className="block font-semibold text-jungle-950 text-sm">{fechaLarga(dia)}</span>
                    <span className={`sm:hidden mt-1 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${filas.length ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                      {textoActividades(filas.length)}
                    </span>
                  </span>
                  <span className={`hidden sm:inline-block flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${filas.length ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                    {textoActividades(filas.length)}
                  </span>
                  <ChevronDown size={18} className={`flex-shrink-0 text-jungle-500 transition-transform ${esAbierto ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
              </h5>

              {esAbierto && (
                <div id={`pd-${dia}`} className="px-3.5 pb-4 pt-3 border-t border-jungle-100 space-y-3">
                  {filas.length === 0 && <p className="text-xs text-jungle-500">Todavía no hay actividades este día.</p>}
                  {filas.map((a) => {
                    const tieneExtras = !!(a.lugar || a.imagen || a.video);
                    const verExtras = extras[a._k] ?? tieneExtras;
                    return (
                      <div key={a._k} className="rounded-xl border border-jungle-100 bg-jungle-50/40 p-3">
                        <div className="flex items-end justify-between gap-2">
                          <div className="w-40">
                            <label htmlFor={`pa-${a._k}-hora`} className={mini}>Hora</label>
                            <input id={`pa-${a._k}-hora`} type="time" value={a.hora} onChange={(e) => cambiar(a._k, { hora: e.target.value })} className={campo} />
                          </div>
                          <button
                            type="button"
                            onClick={() => quitar(a._k)}
                            aria-label={`Quitar la actividad de ${fechaLarga(dia)}${a.hora ? ' a las ' + a.hora : ''}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:bg-red-50 px-2.5 py-2 rounded-lg"
                          >
                            <Trash2 size={15} aria-hidden="true" /> Quitar
                          </button>
                        </div>
                        <div className="mt-2">
                          <label htmlFor={`pa-${a._k}-desc`} className={mini}>¿Qué pasa a esa hora? *</label>
                          <textarea id={`pa-${a._k}-desc`} rows={2} maxLength={600} value={a.descripcion} onChange={(e) => cambiar(a._k, { descripcion: e.target.value })} className={campo} placeholder="Ej. Suelta en barrios" />
                        </div>

                        <button
                          type="button"
                          aria-expanded={verExtras}
                          onClick={() => setExtras((x) => ({ ...x, [a._k]: !verExtras }))}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-jungle-700 hover:text-jungle-900"
                        >
                          <ChevronDown size={14} className={verExtras ? 'rotate-180' : ''} aria-hidden="true" />
                          {verExtras ? 'Ocultar lugar, foto y video' : tieneExtras ? 'Ver lugar, foto y video' : 'Agregar lugar, foto o video'}
                        </button>

                        {verExtras && (
                          <div className="mt-3 pt-3 border-t border-jungle-100 space-y-3">
                            <div className="grid sm:grid-cols-2 gap-3">
                              <div className="min-w-0">
                                <label htmlFor={`pa-${a._k}-lugar`} className={mini}>Lugar</label>
                                <input id={`pa-${a._k}-lugar`} maxLength={140} value={a.lugar} onChange={(e) => cambiar(a._k, { lugar: e.target.value })} className={campo} />
                              </div>
                              <div className="min-w-0">
                                <label htmlFor={`pa-${a._k}-video`} className={mini}>Video: enlace https</label>
                                <input id={`pa-${a._k}-video`} type="url" maxLength={300} value={a.video} onChange={(e) => cambiar(a._k, { video: e.target.value })} className={campo} placeholder="https://youtu.be/…" />
                              </div>
                            </div>
                            <div>
                              <span className={mini}>Foto</span>
                              {a.imagen ? (
                                <div className="relative inline-block">
                                  <img src={a.imagen} alt="Foto de la actividad" className="h-24 rounded-lg object-cover border border-jungle-100" />
                                  <button type="button" onClick={() => cambiar(a._k, { imagen: '' })} aria-label="Quitar la foto de la actividad" className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-obsidiana-900 text-white flex items-center justify-center">
                                    <X size={13} aria-hidden="true" />
                                  </button>
                                </div>
                              ) : (
                                <label className="inline-flex items-center gap-2 border border-dashed border-jungle-300 rounded-lg px-4 py-2.5 text-sm font-semibold text-jungle-700 cursor-pointer hover:bg-white focus-within:ring-2 focus-within:ring-jungle-500">
                                  {subiendo === a._k ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ImagePlus size={16} aria-hidden="true" />}
                                  {subiendo === a._k ? 'Subiendo…' : 'Subir foto'}
                                  <input type="file" accept="image/*" disabled={subiendo !== null} onChange={(e) => { subir(a._k, e.target.files?.[0]); e.target.value = ''; }} className="sr-only" />
                                </label>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => agregar(dia)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-jungle-800 bg-jungle-50 hover:bg-jungle-100 px-4 py-2.5 rounded-xl"
                  >
                    <CalendarPlus size={15} aria-hidden="true" /> Agregar actividad a este día
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
