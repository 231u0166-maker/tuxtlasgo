// ============================================================
// ADMIN — gestión de la agenda de eventos
// ============================================================
// Pestaña "Eventos" del panel de admin: crear, editar, publicar/despublicar y
// eliminar eventos (api/_lib/eventos.ts). Un evento nace como BORRADOR y solo se ve
// en la sección pública /eventos cuando se publica.
//
// Todavía no hay cobro: las columnas de pago existen en la tabla para cuando se
// abra la publicación de anuncios al público, pero aquí no se usan.
// ============================================================

import { useEffect, useState } from 'react';
import { CalendarPlus, Eye, EyeOff, Loader2, Pencil, Trash2, ImagePlus, X, Archive } from 'lucide-react';
import { subirFoto } from '../lib/cloudinary';
import { CATEGORIAS_EVENTO, fechaLocal, finEvento, hoyISO, type ItemPrograma } from '../lib/agendaEventos';

const ADMIN_PWD = 'tuxtlasgo2026';
const MUNICIPIOS = ['Catemaco', 'San Andrés Tuxtla', 'Santiago Tuxtla'];

type Estado = 'borrador' | 'publicado' | 'archivado';
interface EventoAdmin {
  id: number; titulo: string; descripcion: string; categoria: string;
  fecha: string; hora_inicio: string | null; fecha_fin: string | null; hora_fin: string | null;
  lugar: string; municipio: string; precio_entrada: string; organizador: string; contacto: string;
  enlace: string; imagen: string; estado: Estado; programa: ItemPrograma[];
}

const VACIO = {
  titulo: '', descripcion: '', categoria: 'Fiesta tradicional', fecha: '', hora_inicio: '', fecha_fin: '', hora_fin: '',
  lugar: '', municipio: 'Catemaco', precio_entrada: '', organizador: '', contacto: '', enlace: '', imagen: '',
  estado: 'borrador' as Estado,
  programa: [] as ItemPrograma[],
};
type Form = typeof VACIO;

const CHIP: Record<Estado, string> = {
  borrador: 'bg-slate-100 text-slate-700',
  publicado: 'bg-green-100 text-green-800',
  archivado: 'bg-amber-100 text-amber-800',
};

const campo = 'w-full border border-jungle-200 rounded-xl px-3.5 py-2.5 text-sm text-jungle-950 focus:outline-none focus:border-jungle-500 bg-white';
const etiqueta = 'block text-xs font-semibold text-jungle-700 mb-1.5';

async function api(metodo: string, cuerpo?: unknown, query = '') {
  const r = await fetch('/api/comunidad/publicaciones?recurso=eventos' + query, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PWD },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error ?? `Error ${r.status}`);
  return data;
}

export default function AdminEventos() {
  const [eventos, setEventos] = useState<EventoAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null); // null = formulario cerrado
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [procesando, setProcesando] = useState<number | null>(null);
  const [subiendoFila, setSubiendoFila] = useState<number | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const d = await api('GET', undefined, '&admin=1');
      setEventos(d.eventos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los eventos.');
    }
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  function nuevo() { setEditandoId(null); setForm({ ...VACIO }); setAviso(null); }
  function editar(e: EventoAdmin) {
    setEditandoId(e.id);
    setForm({
      titulo: e.titulo, descripcion: e.descripcion, categoria: e.categoria, fecha: e.fecha,
      hora_inicio: e.hora_inicio ?? '', fecha_fin: e.fecha_fin ?? '', hora_fin: e.hora_fin ?? '',
      lugar: e.lugar, municipio: e.municipio, precio_entrada: e.precio_entrada, organizador: e.organizador,
      contacto: e.contacto, enlace: e.enlace, imagen: e.imagen, estado: e.estado,
      programa: e.programa ?? [],
    });
    setAviso(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form) return;
    setGuardando(true);
    setAviso(null);
    try {
      if (editandoId) await api('PATCH', { id: editandoId, ...form });
      else await api('POST', form);
      setAviso(editandoId ? 'Cambios guardados.' : 'Evento creado como borrador. Publícalo cuando esté listo.');
      setForm(null);
      setEditandoId(null);
      await cargar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo guardar.');
    }
    setGuardando(false);
  }

  async function cambiarEstado(e: EventoAdmin, estado: Estado) {
    setProcesando(e.id);
    setAviso(null);
    try {
      await api('PATCH', { id: e.id, estado });
      await cargar();
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
    }
    setProcesando(null);
  }

  async function eliminar(e: EventoAdmin) {
    if (!confirm(`¿Eliminar "${e.titulo}" por completo? No se puede deshacer.`)) return;
    setProcesando(e.id);
    try {
      await api('DELETE', { id: e.id });
      setEventos((prev) => prev.filter((x) => x.id !== e.id));
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo eliminar.');
    }
    setProcesando(null);
  }

  function subirImagen(file: File | undefined) {
    if (!file || !form) return;
    setSubiendo(true);
    setAviso(null);
    subirFoto(file, 'eventos', (p) => {
      if (p.error) { setAviso('No se pudo subir la foto: ' + p.error); setSubiendo(false); }
      else if (p.url) { setForm((f) => (f ? { ...f, imagen: p.url! } : f)); setSubiendo(false); }
    });
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  // ── Programa de actividades ──
  function agregarActividad() {
    setForm((f) => {
      if (!f) return f;
      const ultima = f.programa[f.programa.length - 1];
      return { ...f, programa: [...f.programa, { dia: ultima?.dia || f.fecha, hora: '', descripcion: '', lugar: '', imagen: '', video: '' }] };
    });
  }
  function cambiarActividad(i: number, parche: Partial<ItemPrograma>) {
    setForm((f) => (f ? { ...f, programa: f.programa.map((a, j) => (j === i ? { ...a, ...parche } : a)) } : f));
  }
  function quitarActividad(i: number) {
    setForm((f) => (f ? { ...f, programa: f.programa.filter((_, j) => j !== i) } : f));
  }
  function subirFotoActividad(i: number, file: File | undefined) {
    if (!file) return;
    setSubiendoFila(i);
    setAviso(null);
    subirFoto(file, 'eventos', (p) => {
      if (p.error) { setAviso('No se pudo subir la foto: ' + p.error); setSubiendoFila(null); }
      else if (p.url) { cambiarActividad(i, { imagen: p.url }); setSubiendoFila(null); }
    });
  }

  const hoy = hoyISO();

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display font-bold text-lg text-jungle-950">Agenda de eventos</h2>
          <p className="text-xs text-jungle-500 mt-0.5">Lo que publiques aquí aparece en la sección pública «Eventos»; al terminar pasa solo al Historial. Sin cobro por ahora.</p>
        </div>
        {!form && (
          <button onClick={nuevo} className="flex items-center gap-1.5 bg-jungle-700 hover:bg-jungle-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex-shrink-0">
            <CalendarPlus size={16} aria-hidden="true" /> Nuevo evento
          </button>
        )}
      </div>

      {aviso && (
        <p role="status" className="mb-4 text-sm bg-jungle-50 border border-jungle-200 text-jungle-900 rounded-xl px-4 py-3">{aviso}</p>
      )}

      {form && (
        <form onSubmit={guardar} className="bg-white border border-jungle-100 rounded-2xl p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-jungle-950">{editandoId ? 'Editar evento' : 'Nuevo evento'}</h3>
            <button type="button" onClick={() => { setForm(null); setEditandoId(null); }} aria-label="Cerrar formulario" className="text-jungle-400 hover:text-jungle-700 p-1">
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div>
            <label htmlFor="ev-titulo" className={etiqueta}>Título *</label>
            <input id="ev-titulo" required minLength={3} maxLength={120} value={form.titulo} onChange={(e) => set('titulo', e.target.value)} className={campo} placeholder="Ej. Feria del Chile y la Raíz" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ev-cat" className={etiqueta}>Categoría</label>
              <select id="ev-cat" value={form.categoria} onChange={(e) => set('categoria', e.target.value)} className={campo}>
                {CATEGORIAS_EVENTO.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ev-estado" className={etiqueta}>Estado</label>
              <select id="ev-estado" value={form.estado} onChange={(e) => set('estado', e.target.value as Estado)} className={campo}>
                <option value="borrador">Borrador (no se ve)</option>
                <option value="publicado">Publicado</option>
                <option value="archivado">Archivado (no se ve)</option>
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ev-fecha" className={etiqueta}>Fecha de inicio *</label>
              <input id="ev-fecha" type="date" required value={form.fecha} onChange={(e) => set('fecha', e.target.value)} className={campo} />
            </div>
            <div>
              <label htmlFor="ev-hini" className={etiqueta}>Hora de inicio</label>
              <input id="ev-hini" type="time" value={form.hora_inicio} onChange={(e) => set('hora_inicio', e.target.value)} className={campo} />
            </div>
            <div>
              <label htmlFor="ev-ffin" className={etiqueta}>Fecha de fin (si dura varios días)</label>
              <input id="ev-ffin" type="date" min={form.fecha || undefined} value={form.fecha_fin} onChange={(e) => set('fecha_fin', e.target.value)} className={campo} />
            </div>
            <div>
              <label htmlFor="ev-hfin" className={etiqueta}>Hora de fin</label>
              <input id="ev-hfin" type="time" value={form.hora_fin} onChange={(e) => set('hora_fin', e.target.value)} className={campo} />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ev-lugar" className={etiqueta}>Lugar</label>
              <input id="ev-lugar" maxLength={140} value={form.lugar} onChange={(e) => set('lugar', e.target.value)} className={campo} placeholder="Ej. Malecón de Catemaco" />
            </div>
            <div>
              <label htmlFor="ev-mun" className={etiqueta}>Municipio</label>
              <select id="ev-mun" value={form.municipio} onChange={(e) => set('municipio', e.target.value)} className={campo}>
                {MUNICIPIOS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ev-precio" className={etiqueta}>Costo de entrada (informativo)</label>
              <input id="ev-precio" maxLength={60} value={form.precio_entrada} onChange={(e) => set('precio_entrada', e.target.value)} className={campo} placeholder="Gratis, $50…" />
            </div>
            <div>
              <label htmlFor="ev-org" className={etiqueta}>Organiza</label>
              <input id="ev-org" maxLength={100} value={form.organizador} onChange={(e) => set('organizador', e.target.value)} className={campo} />
            </div>
            <div>
              <label htmlFor="ev-contacto" className={etiqueta}>Contacto (teléfono o correo)</label>
              <input id="ev-contacto" maxLength={100} value={form.contacto} onChange={(e) => set('contacto', e.target.value)} className={campo} />
            </div>
            <div>
              <label htmlFor="ev-enlace" className={etiqueta}>Enlace de más información (https)</label>
              <input id="ev-enlace" type="url" maxLength={300} value={form.enlace} onChange={(e) => set('enlace', e.target.value)} className={campo} placeholder="https://…" />
            </div>
          </div>

          <div>
            <label htmlFor="ev-desc" className={etiqueta}>Descripción</label>
            <textarea id="ev-desc" rows={4} maxLength={2000} value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} className={campo} />
          </div>

          <fieldset className="border border-jungle-100 rounded-2xl p-4 min-w-0">
            <legend className="text-sm font-bold text-jungle-900 px-1">Programa de actividades</legend>
            <p className="text-xs text-jungle-500 mb-3">
              Para eventos de varios días (como el Festival del Globo): agrega cada actividad con su día y hora. Se muestran ordenadas por día y hora.
            </p>
            {form.programa.length === 0 && <p className="text-xs text-jungle-400 mb-3">Sin actividades todavía.</p>}
            <ul className="space-y-3">
              {form.programa.map((a, i) => (
                <li key={i} className="bg-jungle-50/60 border border-jungle-100 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-jungle-700">Actividad {i + 1}</span>
                    <button type="button" onClick={() => quitarActividad(i)} aria-label={`Quitar la actividad ${i + 1}`} className="flex items-center gap-1 text-xs font-semibold text-red-700 hover:bg-red-50 px-2 py-1.5 rounded-lg">
                      <Trash2 size={13} aria-hidden="true" /> Quitar
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <label htmlFor={`ev-a${i}-dia`} className={etiqueta}>Día *</label>
                      <input id={`ev-a${i}-dia`} type="date" required min={form.fecha || undefined} max={form.fecha_fin || form.fecha || undefined} value={a.dia} onChange={(e) => cambiarActividad(i, { dia: e.target.value })} className={campo} />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor={`ev-a${i}-hora`} className={etiqueta}>Hora</label>
                      <input id={`ev-a${i}-hora`} type="time" value={a.hora} onChange={(e) => cambiarActividad(i, { hora: e.target.value })} className={campo} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor={`ev-a${i}-desc`} className={etiqueta}>Descripción de la actividad *</label>
                    <textarea id={`ev-a${i}-desc`} required rows={2} maxLength={600} value={a.descripcion} onChange={(e) => cambiarActividad(i, { descripcion: e.target.value })} className={campo} placeholder="Ej. Suelta de globos en los barrios" />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <label htmlFor={`ev-a${i}-lugar`} className={etiqueta}>Lugar (opcional)</label>
                      <input id={`ev-a${i}-lugar`} maxLength={140} value={a.lugar} onChange={(e) => cambiarActividad(i, { lugar: e.target.value })} className={campo} />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor={`ev-a${i}-video`} className={etiqueta}>Video: enlace https (opcional)</label>
                      <input id={`ev-a${i}-video`} type="url" maxLength={300} value={a.video} onChange={(e) => cambiarActividad(i, { video: e.target.value })} className={campo} placeholder="https://youtu.be/…" />
                    </div>
                  </div>
                  <div>
                    <span className={etiqueta}>Foto (opcional)</span>
                    {a.imagen ? (
                      <div className="relative inline-block">
                        <img src={a.imagen} alt={`Foto de la actividad ${i + 1}`} className="h-24 rounded-xl object-cover border border-jungle-100" />
                        <button type="button" onClick={() => cambiarActividad(i, { imagen: '' })} aria-label={`Quitar la foto de la actividad ${i + 1}`} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-obsidiana-900 text-white flex items-center justify-center">
                          <X size={13} aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <label className="inline-flex items-center gap-2 border border-dashed border-jungle-300 rounded-xl px-4 py-3 text-sm font-semibold text-jungle-700 cursor-pointer hover:bg-white focus-within:ring-2 focus-within:ring-jungle-500">
                        {subiendoFila === i ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ImagePlus size={16} aria-hidden="true" />}
                        {subiendoFila === i ? 'Subiendo…' : 'Subir foto'}
                        <input type="file" accept="image/*" disabled={subiendoFila !== null} onChange={(e) => { subirFotoActividad(i, e.target.files?.[0]); e.target.value = ''; }} className="sr-only" />
                      </label>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <button type="button" onClick={agregarActividad} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-jungle-800 bg-jungle-50 hover:bg-jungle-100 px-4 py-2.5 rounded-xl">
              <CalendarPlus size={15} aria-hidden="true" /> Agregar actividad
            </button>
          </fieldset>

          <div>
            <span className={etiqueta}>Foto (opcional)</span>
            {form.imagen ? (
              <div className="relative inline-block">
                <img src={form.imagen} alt="Vista previa del evento" className="h-32 rounded-xl object-cover border border-jungle-100" />
                <button type="button" onClick={() => set('imagen', '')} aria-label="Quitar foto" className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-obsidiana-900 text-white flex items-center justify-center">
                  <X size={13} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 border border-dashed border-jungle-300 rounded-xl px-4 py-4 text-sm font-semibold text-jungle-700 cursor-pointer hover:bg-jungle-50 focus-within:ring-2 focus-within:ring-jungle-500">
                {subiendo ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ImagePlus size={16} aria-hidden="true" />}
                {subiendo ? 'Subiendo…' : 'Subir foto'}
                <input type="file" accept="image/*" disabled={subiendo} onChange={(e) => { subirImagen(e.target.files?.[0]); e.target.value = ''; }} className="sr-only" />
              </label>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={guardando || subiendo || subiendoFila !== null} className="bg-jungle-700 hover:bg-jungle-800 disabled:opacity-60 text-white text-sm font-bold px-6 py-3 rounded-xl flex items-center gap-2">
              {guardando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {editandoId ? 'Guardar cambios' : 'Crear evento'}
            </button>
            <button type="button" onClick={() => { setForm(null); setEditandoId(null); }} className="bg-jungle-50 hover:bg-jungle-100 text-jungle-800 text-sm font-bold px-6 py-3 rounded-xl">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {cargando && eventos.length === 0 && <p role="status" className="text-sm text-jungle-500 py-6 text-center">Cargando…</p>}
      {error && <p role="alert" className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">{error}</p>}
      {!cargando && !error && eventos.length === 0 && (
        <p className="text-sm text-jungle-500 bg-white border border-jungle-100 rounded-2xl px-5 py-8 text-center">Todavía no hay eventos. Crea el primero con «Nuevo evento».</p>
      )}

      <ul className="space-y-3">
        {eventos.map((e) => {
          const pasado = finEvento(e) < hoy;
          return (
            <li key={e.id} className="bg-white border border-jungle-100 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full capitalize ${CHIP[e.estado]}`}>{e.estado}</span>
                    {pasado && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Ya pasó</span>}
                    {e.programa.length > 0 && <span className="text-xs text-jungle-500">· {e.programa.length} {e.programa.length === 1 ? 'actividad' : 'actividades'}</span>}
                    <span className="text-xs text-jungle-500">{e.categoria}</span>
                  </div>
                  <h3 className="font-display font-bold text-jungle-950 mt-1">{e.titulo}</h3>
                  <p className="text-sm text-jungle-600 mt-0.5">
                    {fechaLocal(e.fecha).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    {e.hora_inicio ? ` · ${e.hora_inicio}` : ''}
                    {[e.lugar, e.municipio].filter(Boolean).length ? ` · ${[e.lugar, e.municipio].filter(Boolean).join(', ')}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {e.estado !== 'publicado' ? (
                  <button disabled={procesando === e.id} onClick={() => cambiarEstado(e, 'publicado')} className="flex items-center gap-1.5 text-sm font-semibold bg-jungle-700 hover:bg-jungle-800 disabled:opacity-60 text-white px-3.5 py-2 rounded-xl">
                    <Eye size={14} aria-hidden="true" /> Publicar
                  </button>
                ) : (
                  <button disabled={procesando === e.id} onClick={() => cambiarEstado(e, 'borrador')} className="flex items-center gap-1.5 text-sm font-semibold bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-800 px-3.5 py-2 rounded-xl">
                    <EyeOff size={14} aria-hidden="true" /> Despublicar
                  </button>
                )}
                {e.estado !== 'archivado' && (
                  <button disabled={procesando === e.id} onClick={() => cambiarEstado(e, 'archivado')} className="flex items-center gap-1.5 text-sm font-semibold bg-amber-50 hover:bg-amber-100 disabled:opacity-60 text-amber-900 px-3.5 py-2 rounded-xl">
                    <Archive size={14} aria-hidden="true" /> Archivar
                  </button>
                )}
                <button onClick={() => editar(e)} className="flex items-center gap-1.5 text-sm font-semibold bg-jungle-50 hover:bg-jungle-100 text-jungle-800 px-3.5 py-2 rounded-xl">
                  <Pencil size={14} aria-hidden="true" /> Editar
                </button>
                <button disabled={procesando === e.id} onClick={() => eliminar(e)} className="flex items-center gap-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 px-3.5 py-2 rounded-xl ml-auto">
                  <Trash2 size={14} aria-hidden="true" /> Eliminar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
