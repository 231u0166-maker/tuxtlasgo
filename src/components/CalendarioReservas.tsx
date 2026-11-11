import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, MessageCircle, Loader2, Layers } from 'lucide-react';
import { horaUI, type Semana } from '../lib/horario';

// ============================================================
// CALENDARIO DE RESERVACIONES — estilo Google Calendar
// ============================================================
// Un solo calendario para todo: reservas, días bloqueados y el horario de apertura.
//  - Mes:    cuadrícula con las reservas en cada día.
//  - Semana: 7 días en PC, 3 en celular; tu horario de apertura va sombreado.
//            (Las reservaciones son por DÍA, sin hora, así que salen arriba como
//            eventos de "todo el día".)
//  - Bloquear: toca un día y usa el botón, o arrastra con el mouse sobre varios
//    días. En el celular, "Varios días" permite tocar el primero y el último.
//  - Un día con reservación confirmada queda cerrado en automático desde el
//    servidor; aquí se ve como "Reservado" y no se libera a mano (se cancela la
//    reservación).
// ============================================================

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DC = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const ALTO_HORA = 40;
const RAYADO = 'repeating-linear-gradient(135deg, #fff, #fff 6px, #fde8e8 6px, #fde8e8 12px)';

const aISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const deISO = (k: string) => new Date(k + 'T00:00:00');
const sumar = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const lunesDe = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const dow = (d: Date) => (d.getDay() + 6) % 7; // 0 = lunes

function useEsPC() {
  const q = '(min-width: 1024px)';
  const [pc, setPc] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setPc(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return pc;
}

interface Reserva {
  id: number;
  nombre_viajero: string;
  numero_personas: number;
  estado: string;
  fecha: string;
  mensajes_no_leidos?: number;
}

interface Props {
  reservaciones: Reserva[];
  fechasBloqueadas: string[];
  horario: Semana;
  onGuardarFechas: (fechas: string[]) => Promise<boolean> | void;
  onResponder: (id: number, accion: 'confirmar' | 'rechazar') => void;
  onAbrirChat: (id: number, nombreViajero: string) => void;
}

export default function CalendarioReservas({ reservaciones, fechasBloqueadas, horario, onGuardarFechas, onResponder, onAbrirChat }: Props) {
  const esPC = useEsPC();
  const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const hoyK = aISO(hoy);
  const [vista, setVista] = useState<'mes' | 'sem'>('mes');
  const [ref, setRef] = useState<Date>(hoy);
  const [sel, setSel] = useState<string>(hoyK);
  const [rango, setRango] = useState<[string, string] | null>(null);
  const [variosDias, setVariosDias] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const bloqueadas = useMemo(() => new Set(fechasBloqueadas), [fechasBloqueadas]);
  const porDia = useMemo(() => {
    const m = new Map<string, Reserva[]>();
    for (const r of reservaciones) {
      if (r.estado !== 'confirmada' && r.estado !== 'pendiente') continue;
      (m.get(r.fecha) ?? m.set(r.fecha, []).get(r.fecha)!).push(r);
    }
    return m;
  }, [reservaciones]);
  const reservado = (k: string) => (porDia.get(k) ?? []).some((r) => r.estado === 'confirmada');
  const abiertoEl = (d: Date) => horario[dow(d)] ?? [];
  const enRango = (k: string) => !!rango && k >= rango[0] && k <= rango[1];

  async function guardarFechas(siguiente: Set<string>) {
    setGuardando(true);
    try { await onGuardarFechas([...siguiente].sort()); } finally { setGuardando(false); }
  }
  function diasDe(a: string, b: string) {
    const salida: string[] = [];
    for (let d = deISO(a); aISO(d) <= b; d = sumar(d, 1)) salida.push(aISO(d));
    return salida;
  }
  async function bloquear(dias: string[]) {
    const s = new Set(bloqueadas);
    dias.forEach((k) => { if (k >= hoyK) s.add(k); });
    await guardarFechas(s);
    setRango(null);
  }
  async function desbloquear(dias: string[]) {
    const s = new Set(bloqueadas);
    dias.forEach((k) => { if (!reservado(k)) s.delete(k); });
    await guardarFechas(s);
    setRango(null);
  }

  // ── selección de días ──
  function tocarDia(k: string) {
    if (variosDias) {
      if (!rango || rango[0] !== rango[1]) { setRango([k, k]); setSel(k); }
      else setRango(k < rango[0] ? [k, rango[0]] : [rango[0], k]);
      return;
    }
    setSel(k); setRango(null);
  }
  const arrastre = useRef<{ ini: string; movio: boolean } | null>(null);
  const tipoPuntero = useRef<string>('mouse');
  function bajar(e: React.PointerEvent, k: string) {
    tipoPuntero.current = e.pointerType;
    if (e.pointerType !== 'mouse' || variosDias) return;
    arrastre.current = { ini: k, movio: false };
  }
  function pasar(k: string) {
    const a = arrastre.current;
    if (!a || (k === a.ini && !a.movio)) return;
    a.movio = true;
    setRango(k < a.ini ? [k, a.ini] : [a.ini, k]);
  }
  function soltar() {
    const a = arrastre.current;
    arrastre.current = null;
    if (a && !a.movio) tocarDia(a.ini);
  }
  useEffect(() => { window.addEventListener('pointerup', soltar); return () => window.removeEventListener('pointerup', soltar); });

  function mover(n: number) {
    if (vista === 'mes') setRef(new Date(ref.getFullYear(), ref.getMonth() + n, 1));
    else setRef(sumar(ref, n * (esPC ? 7 : 3)));
  }
  function irHoy() { setRef(hoy); setSel(hoyK); setRango(null); }

  // ── título ──
  const nSem = esPC ? 7 : 3;
  const iniSem = esPC ? lunesDe(ref) : ref;
  const titulo = vista === 'mes'
    ? `${MESES[ref.getMonth()]} ${ref.getFullYear()}`
    : (() => { const f = sumar(iniSem, nSem - 1); return `${iniSem.getDate()} – ${f.getDate()} de ${MESES[f.getMonth()]}`; })();

  const boton = 'h-10 min-w-10 px-3 rounded-xl text-sm font-bold text-jungle-800 bg-jungle-50 hover:bg-jungle-100 flex items-center justify-center transition-colors';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <h3 className="font-display font-bold text-[17px] text-jungle-950 mr-auto first-letter:uppercase">{titulo}</h3>
        <button type="button" onClick={() => mover(-1)} aria-label="Anterior" className={boton}><ChevronLeft size={18} /></button>
        <button type="button" onClick={irHoy} className={boton}>Hoy</button>
        <button type="button" onClick={() => mover(1)} aria-label="Siguiente" className={boton}><ChevronRight size={18} /></button>
        <div className="flex p-[3px] rounded-xl bg-jungle-50 ring-1 ring-jungle-100" role="tablist" aria-label="Vista del calendario">
          {([['mes', 'Mes'], ['sem', 'Semana']] as const).map(([id, t]) => (
            <button key={id} type="button" role="tab" aria-selected={vista === id} onClick={() => setVista(id)}
              className={`h-9 px-3.5 rounded-[9px] text-[13px] font-bold transition-all ${vista === id ? 'bg-white shadow text-jungle-950' : 'text-jungle-700'}`}>{t}</button>
          ))}
        </div>
      </div>

      {vista === 'mes' ? (
        <VistaMes ref0={ref} esPC={esPC} hoyK={hoyK} sel={sel} rango={rango} bloqueadas={bloqueadas} porDia={porDia}
          abiertoEl={abiertoEl} enRango={enRango} onBajar={bajar} onPasar={pasar} onTocar={(k) => { if (variosDias || tipoPuntero.current !== 'mouse') tocarDia(k); }} onTecla={tocarDia} />
      ) : (
        <VistaSemana ini={iniSem} n={nSem} hoyK={hoyK} sel={sel} bloqueadas={bloqueadas} porDia={porDia} abiertoEl={abiertoEl}
          onElegir={(k) => { setSel(k); setRango(null); }} />
      )}

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 mt-3 text-xs text-jungle-500">
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px] bg-jungle-600" />Confirmada</span>
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px] bg-amber-400" />Pendiente</span>
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px] bg-red-100 ring-1 ring-red-300" />Bloqueado</span>
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px] bg-jungle-100" />Abierto</span>
        {vista === 'mes' && (
          <button type="button" onClick={() => { setVariosDias((v) => !v); setRango(null); }} aria-pressed={variosDias}
            className={`ml-auto h-9 px-3 rounded-full text-[13px] font-bold flex items-center gap-1.5 transition-colors ${variosDias ? 'bg-jungle-700 text-white' : 'bg-jungle-50 text-jungle-800'}`}>
            <Layers size={14} /> Varios días
          </button>
        )}
      </div>
      <p className="text-xs text-jungle-500 mt-1.5">
        {variosDias ? 'Toca el primer día y luego el último para marcar un rango.'
          : vista === 'mes' ? (esPC ? 'Haz clic en un día para ver su agenda o arrastra sobre varios para bloquear un rango.' : 'Toca un día para ver su agenda. Con “Varios días” bloqueas un rango.')
          : 'Verde claro = tu horario de apertura. Toca un día para ver su agenda.'}
      </p>

      <PanelDia sel={sel} rango={rango} bloqueadas={bloqueadas} porDia={porDia} abiertoEl={abiertoEl} hoyK={hoyK} reservado={reservado}
        guardando={guardando} diasDe={diasDe} onBloquear={bloquear} onDesbloquear={desbloquear}
        onResponder={onResponder} onAbrirChat={onAbrirChat} />
    </div>
  );
}

/* ───────────── Mes ───────────── */
interface MesProps {
  ref0: Date; esPC: boolean; hoyK: string; sel: string; rango: [string, string] | null;
  bloqueadas: Set<string>; porDia: Map<string, Reserva[]>; abiertoEl: (d: Date) => unknown[];
  enRango: (k: string) => boolean;
  onBajar: (e: React.PointerEvent, k: string) => void; onPasar: (k: string) => void; onTocar: (k: string) => void; onTecla: (k: string) => void;
}
const VistaMes = memo(function VistaMes({ ref0, esPC, hoyK, sel, rango, bloqueadas, porDia, abiertoEl, enRango, onBajar, onPasar, onTocar, onTecla }: MesProps) {
  const ini = lunesDe(new Date(ref0.getFullYear(), ref0.getMonth(), 1));
  return (
    <div className="grid grid-cols-7 border border-jungle-100 rounded-2xl overflow-hidden bg-white select-none">
      {DC.map((d) => (
        <div key={d} className="py-2 text-center text-[11px] font-extrabold tracking-wider uppercase text-jungle-500 bg-jungle-50/50 border-b border-jungle-100">{d}</div>
      ))}
      {Array.from({ length: 42 }, (_, i) => {
        const d = sumar(ini, i), k = aISO(d);
        const fuera = d.getMonth() !== ref0.getMonth();
        const rs = porDia.get(k) ?? [];
        const bloq = bloqueadas.has(k);
        const cerrado = !bloq && abiertoEl(d).length === 0;
        return (
          <div key={k}
            onPointerDown={(e) => onBajar(e, k)} onPointerEnter={() => onPasar(k)} onClick={() => onTocar(k)}
            role="button" tabIndex={0} aria-label={`${d.getDate()} de ${MESES[d.getMonth()]}`}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTecla(k); } }}
            style={bloq ? { backgroundImage: RAYADO } : undefined}
            className={`relative border-r border-b border-jungle-100 last:border-r-0 p-1 cursor-pointer transition-colors ${esPC ? 'min-h-[84px]' : 'min-h-[58px]'} ${fuera ? 'text-jungle-300 bg-jungle-50/30' : cerrado ? 'bg-gray-100/70' : 'bg-white hover:bg-jungle-50'} ${k === sel && !rango ? '!bg-jungle-100' : ''} ${enRango(k) ? '!bg-jungle-100 ring-[1.5px] ring-inset ring-jungle-500' : ''}`}>
            <span className={`w-6 h-6 rounded-full text-[13px] font-bold flex items-center justify-center ${k === hoyK ? 'bg-jungle-700 text-white' : ''}`}>{d.getDate()}</span>
            {bloq && <Lock size={11} className="absolute top-1.5 right-1.5 text-red-500" />}
            <div className={`mt-1 ${esPC ? 'flex flex-col gap-0.5' : 'flex flex-wrap gap-[3px]'}`}>
              {rs.slice(0, esPC ? 2 : 4).map((r) => esPC ? (
                <span key={r.id} className={`text-[10.5px] font-bold rounded px-1.5 py-px truncate text-white ${r.estado === 'confirmada' ? 'bg-jungle-600' : 'bg-amber-400 !text-amber-950'}`}>{r.nombre_viajero.split(' ')[0]}</span>
              ) : (
                <span key={r.id} className={`w-2 h-2 rounded-full ${r.estado === 'confirmada' ? 'bg-jungle-600' : 'bg-amber-400'}`} />
              ))}
              {esPC && rs.length > 2 && <span className="text-[10px] text-jungle-500 font-semibold">+{rs.length - 2} más</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
});

/* ───────────── Semana ───────────── */
interface SemProps {
  ini: Date; n: number; hoyK: string; sel: string; bloqueadas: Set<string>; porDia: Map<string, Reserva[]>;
  abiertoEl: (d: Date) => [number, number][] | unknown[]; onElegir: (k: string) => void;
}
const VistaSemana = memo(function VistaSemana({ ini, n, hoyK, sel, bloqueadas, porDia, abiertoEl, onElegir }: SemProps) {
  const dias = Array.from({ length: n }, (_, i) => sumar(ini, i));
  const cols = { gridTemplateColumns: `56px repeat(${n}, minmax(0, 1fr))` };
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 2 * ALTO_HORA; }, []);
  return (
    <div className="border border-jungle-100 rounded-2xl overflow-hidden bg-white">
      <div className="grid border-b border-jungle-100 bg-jungle-50/50" style={cols}>
        <div />
        {dias.map((d) => {
          const k = aISO(d);
          return (
            <button key={k} type="button" onClick={() => onElegir(k)} className={`py-1.5 text-center text-xs font-bold text-jungle-800 ${k === sel ? 'bg-jungle-100' : ''}`}>
              {DC[dow(d)]}
              <span className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold ${k === hoyK ? 'bg-jungle-700 text-white' : 'text-jungle-500'}`}>{d.getDate()}</span>
            </button>
          );
        })}
      </div>
      {/* todo el día: las reservaciones son por día, sin hora */}
      <div className="grid border-b border-jungle-100" style={cols}>
        <div className="text-[10px] text-jungle-400 text-right pr-1.5 pt-1.5 leading-tight">todo el día</div>
        {dias.map((d) => {
          const k = aISO(d);
          const rs = porDia.get(k) ?? [];
          return (
            <div key={k} className="border-l border-jungle-100 p-1 min-h-[34px] flex flex-col gap-0.5">
              {bloqueadas.has(k) && rs.length === 0 && <span className="text-[10px] font-bold text-red-500 flex items-center gap-1"><Lock size={9} /> Bloqueado</span>}
              {rs.map((r) => (
                <button key={r.id} type="button" onClick={() => onElegir(k)}
                  className={`text-left text-[10.5px] font-bold rounded px-1.5 py-0.5 truncate ${r.estado === 'confirmada' ? 'bg-jungle-600 text-white' : 'bg-amber-400 text-amber-950'}`}>{r.nombre_viajero.split(' ')[0]}</button>
              ))}
            </div>
          );
        })}
      </div>
      <div ref={scroll} className="max-h-[340px] overflow-y-auto">
        <div className="grid" style={cols}>
          <div>
            {Array.from({ length: 18 }, (_, i) => (
              <div key={i} className="text-[10px] text-jungle-500 text-right pr-1.5 -translate-y-[6px] whitespace-nowrap" style={{ height: ALTO_HORA }}>
                {i === 0 ? '' : horaUI((6 + i) * 60).replace(':00', '')}
              </div>
            ))}
          </div>
          {dias.map((d) => {
            const k = aISO(d), bloq = bloqueadas.has(k);
            return (
              <div key={k} onClick={() => onElegir(k)} role="button" aria-label={`${DIAS[dow(d)]} ${d.getDate()}`}
                className={`relative border-l border-jungle-100 cursor-pointer ${k === sel ? 'bg-jungle-50/60' : ''}`}
                style={{
                  height: 18 * ALTO_HORA,
                  backgroundImage: bloq ? RAYADO : `repeating-linear-gradient(to bottom, transparent 0, transparent ${ALTO_HORA - 1}px, rgba(22,101,52,0.09) ${ALTO_HORA - 1}px, rgba(22,101,52,0.09) ${ALTO_HORA}px)`,
                }}>
                {!bloq && (abiertoEl(d) as [number, number][]).map(([a, b], i) => (
                  <div key={i} className="absolute inset-x-0 bg-jungle-100/60" style={{ top: ((Math.max(a, 360) - 360) / 60) * ALTO_HORA, height: ((Math.min(b, 1440) - Math.max(a, 360)) / 60) * ALTO_HORA }} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

/* ───────────── Agenda del día (debajo del calendario) ───────────── */
interface PanelProps {
  sel: string; rango: [string, string] | null; bloqueadas: Set<string>; porDia: Map<string, Reserva[]>;
  abiertoEl: (d: Date) => unknown[]; hoyK: string; reservado: (k: string) => boolean; guardando: boolean;
  diasDe: (a: string, b: string) => string[];
  onBloquear: (dias: string[]) => void; onDesbloquear: (dias: string[]) => void;
  onResponder: (id: number, accion: 'confirmar' | 'rechazar') => void; onAbrirChat: (id: number, n: string) => void;
}
function PanelDia({ sel, rango, bloqueadas, porDia, abiertoEl, hoyK, reservado, guardando, diasDe, onBloquear, onDesbloquear, onResponder, onAbrirChat }: PanelProps) {
  const caja = 'mt-4 rounded-2xl bg-jungle-50 ring-1 ring-jungle-100 p-4';
  const btn = (peligro: boolean) => `w-full mt-3 h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors ${peligro ? 'bg-white border-[1.5px] border-red-200 text-red-600 hover:bg-red-50' : 'bg-jungle-700 text-white hover:bg-jungle-800'}`;

  if (rango) {
    const dias = diasDe(rango[0], rango[1]);
    const libres = dias.filter((k) => !reservado(k));
    const todosBloq = libres.length > 0 && libres.every((k) => bloqueadas.has(k));
    const a = deISO(rango[0]), b = deISO(rango[1]);
    return (
      <div className={caja}>
        <h4 className="font-display font-bold text-[15px] text-jungle-950">{a.getDate()} {MESES[a.getMonth()].slice(0, 3)} – {b.getDate()} {MESES[b.getMonth()].slice(0, 3)}</h4>
        <p className="text-xs font-bold text-jungle-700 mt-1">{dias.length} días seleccionados</p>
        {dias.length !== libres.length && <p className="text-xs text-jungle-500 mt-1">Los días con reservación confirmada no se tocan.</p>}
        <button type="button" disabled={guardando || libres.length === 0} onClick={() => (todosBloq ? onDesbloquear(libres) : onBloquear(libres))} className={btn(!todosBloq)}>
          {guardando && <Loader2 size={16} className="animate-spin" />}
          {todosBloq ? 'Desbloquear estos días' : 'Bloquear estos días'}
        </button>
      </div>
    );
  }

  const d = deISO(sel);
  const rs = (porDia.get(sel) ?? []).slice().sort((x, y) => x.id - y.id);
  const bloq = bloqueadas.has(sel), res = reservado(sel), ab = abiertoEl(d) as [number, number][];
  const pasado = sel < hoyK;
  const estado = res ? { t: 'Reservado', c: 'bg-jungle-600 text-white' }
    : bloq ? { t: 'Bloqueado', c: 'bg-red-100 text-red-800' }
    : ab.length ? { t: 'Abierto ' + ab.map(([x, y]) => `${horaUI(x)} – ${horaUI(y)}`).join(' y '), c: 'bg-jungle-100 text-jungle-800' }
    : { t: 'Cerrado por horario', c: 'bg-gray-200 text-gray-600' };
  return (
    <div className={caja}>
      <h4 className="font-display font-bold text-[15px] text-jungle-950 first-letter:uppercase">{DIAS[dow(d)]} {d.getDate()} de {MESES[d.getMonth()]}</h4>
      <span className={`inline-block mt-1.5 mb-2 text-[11.5px] font-extrabold px-2.5 py-1 rounded-full ${estado.c}`}>{estado.t}</span>
      {rs.length === 0 ? <p className="text-sm text-jungle-500 py-1">Sin reservas este día.</p> : rs.map((r) => (
        <div key={r.id} className="flex items-center gap-3 py-2.5 border-t border-jungle-100 first-of-type:border-t-0">
          <span className={`w-2 self-stretch rounded ${r.estado === 'confirmada' ? 'bg-jungle-600' : 'bg-amber-400'}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-jungle-950 truncate">{r.nombre_viajero}</p>
            <p className="text-xs text-jungle-500">{r.numero_personas} persona{r.numero_personas === 1 ? '' : 's'} · {r.estado === 'confirmada' ? 'Confirmada' : 'Pendiente'}</p>
          </div>
          <button type="button" onClick={() => onAbrirChat(r.id, r.nombre_viajero)} aria-label="Abrir mensajes" className="relative h-9 w-9 rounded-lg text-jungle-600 hover:bg-white flex items-center justify-center">
            <MessageCircle size={16} />
            {!!r.mensajes_no_leidos && <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{r.mensajes_no_leidos}</span>}
          </button>
          {r.estado === 'pendiente' && (
            <div className="flex gap-1.5">
              <button type="button" onClick={() => onResponder(r.id, 'rechazar')} className="h-9 px-3 rounded-lg border-[1.5px] border-red-200 bg-white text-red-600 text-xs font-bold">Rechazar</button>
              <button type="button" onClick={() => onResponder(r.id, 'confirmar')} className="h-9 px-3 rounded-lg bg-jungle-700 text-white text-xs font-bold">Aceptar</button>
            </div>
          )}
        </div>
      ))}
      {res ? (
        <p className="text-xs text-jungle-500 mt-2">Este día quedó cerrado por la reservación confirmada. Para liberarlo, cancela la reservación.</p>
      ) : pasado ? null : (
        <button type="button" disabled={guardando} onClick={() => (bloq ? onDesbloquear([sel]) : onBloquear([sel]))} className={btn(!bloq)}>
          {guardando && <Loader2 size={16} className="animate-spin" />}
          {bloq ? 'Desbloquear este día' : 'Bloquear este día'}
        </button>
      )}
    </div>
  );
}
