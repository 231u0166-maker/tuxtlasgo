import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, Trash2, X } from 'lucide-react';
import {
  DIAS_CORTO, DIAS_NOMBRE, horaUI, semanaVacia, unirTramos,
  type Semana, type Tramo,
} from '../lib/horario';
import ResumenHorario from './ResumenHorario';

// Editor del horario por día.
//  - PC: calendario semanal tipo Google Calendar (arrastrar para marcar, bordes para
//    ajustar, mover el bloque). Se puede EXPANDIR a pantalla completa.
//  - Celular: un renglón por día con interruptor y selector de hora del teléfono.
//
// Ligero a propósito: durante un arrastre solo se vuelve a pintar la columna que se
// toca (las otras seis están memorizadas), sin desenfoques ni estado global.

const INICIO = 6 * 60;   // el calendario empieza a las 6:00 a. m.
const FIN = 24 * 60;     // y llega a la medianoche
const PASO = 30;         // se ajusta de 30 en 30 minutos

const PRESETS: { texto: string; aplicar: (s: Semana) => Semana }[] = [
  { texto: 'Lun–Vie 9 a 6', aplicar: () => semanaVacia().map((_, i) => (i < 5 ? [[540, 1080]] : [])) as Semana },
  { texto: 'Todos los días 9 a 9', aplicar: () => semanaVacia().map(() => [[540, 1260]]) as Semana },
  { texto: 'Copiar el lunes a todos', aplicar: (s) => s.map(() => s[0].map((t) => [...t] as Tramo)) },
  { texto: 'Limpiar', aplicar: () => semanaVacia() },
];

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

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const deHhmm = (v: string) => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };

interface Props { value: Semana; onChange: (s: Semana) => void }

export default function EditorHorarioSemanal({ value, onChange }: Props) {
  const esPC = useEsPC();
  const [expandido, setExpandido] = useState(false);

  // onDia estable (lee el valor más reciente por ref) para no invalidar la memoria de las columnas
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const ponerDia = useCallback((d: number, tramos: Tramo[]) => {
    onChangeRef.current(valueRef.current.map((t, i) => (i === d ? unirTramos(tramos) : t)));
  }, []);

  useEffect(() => { // Esc cierra la vista expandida
    if (!expandido) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setExpandido(false); } };
    window.addEventListener('keydown', f, true);
    return () => window.removeEventListener('keydown', f, true);
  }, [expandido]);

  const presets = (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map((p) => (
        <button key={p.texto} type="button" onClick={() => onChange(p.aplicar(value))}
          className="min-h-[40px] px-3.5 rounded-full border-[1.5px] border-jungle-100 bg-white/80 text-[13px] font-semibold text-jungle-800 hover:border-jungle-300 transition-colors">
          {p.texto}
        </button>
      ))}
    </div>
  );

  if (!esPC) {
    return (
      <div className="flex flex-col min-h-0 flex-1">
        <div className="mb-3">{presets}</div>
        <ListaDias value={value} onDia={ponerDia} />
      </div>
    );
  }

  const cuerpo = (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-start justify-between gap-3 mb-2">
        {presets}
        {!expandido && (
          <button type="button" onClick={() => setExpandido(true)} aria-label="Expandir el calendario a pantalla completa"
            className="flex-shrink-0 h-10 pl-3 pr-3.5 rounded-xl bg-jungle-50 text-jungle-800 text-[13px] font-bold flex items-center gap-1.5 hover:bg-jungle-100">
            <Maximize2 size={16} /> Expandir
          </button>
        )}
      </div>
      <Calendario value={value} onDia={ponerDia} altoPaso={expandido ? 30 : 22} />
    </div>
  );

  if (!expandido) return cuerpo;

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex flex-col bg-white animate-fade-in">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-jungle-100 bg-white">
        <div>
          <p className="font-display font-bold text-jungle-950 leading-tight">Horario</p>
          <p className="text-xs text-jungle-500">Dibuja cuándo abres sobre la semana</p>
        </div>
        <button type="button" onClick={() => setExpandido(false)}
          className="ml-auto h-10 px-4 rounded-xl bg-jungle-700 text-white text-sm font-bold flex items-center gap-1.5">
          <Minimize2 size={16} /> Listo
        </button>
      </div>
      <div className="flex-1 min-h-0 flex gap-6 p-6 bg-gradient-to-b from-jungle-50 to-white">
        <div className="flex-1 min-w-0 flex flex-col min-h-0 rounded-2xl bg-white border border-jungle-100 p-5 shadow-sm">{cuerpo}</div>
        <aside className="w-72 flex-shrink-0 rounded-2xl bg-white border border-jungle-100 p-5 shadow-sm self-start">
          <p className="font-display font-bold text-[15px] text-jungle-950 mb-3">Así lo verá el turista</p>
          <ResumenHorario value={value} />
        </aside>
      </div>
    </div>,
    document.body
  );
}

/* ───────────── Celular: un renglón por día ───────────── */
function ListaDias({ value, onDia }: { value: Semana; onDia: (d: number, t: Tramo[]) => void }) {
  return (
    <div className="divide-y divide-jungle-100/80">
      {value.map((tramos, d) => {
        const abierto = tramos.length > 0;
        return (
          <div key={d} className="py-3">
            <div className="flex items-center gap-3 min-h-[44px]">
              <span className="flex-1 text-[15px] font-semibold text-jungle-950">{DIAS_NOMBRE[d]}</span>
              {!abierto && <span className="text-xs text-jungle-500">Cerrado</span>}
              <button type="button" role="switch" aria-checked={abierto} aria-label={`Abierto el ${DIAS_NOMBRE[d]}`}
                onClick={() => onDia(d, abierto ? [] : [[540, 1080]])}
                className={`relative h-[26px] w-[46px] rounded-full flex-shrink-0 transition-colors ${abierto ? 'bg-jungle-600' : 'bg-jungle-200'}`}>
                <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${abierto ? 'left-[23px]' : 'left-[3px]'}`} />
              </button>
            </div>
            {abierto && (
              <div className="mt-2.5 space-y-2">
                {tramos.map(([a, b], k) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <input type="time" step={1800} value={hhmm(a)} aria-label="Abre"
                      onChange={(e) => {
                        const n = deHhmm(e.target.value);
                        onDia(d, tramos.map((t, j) => (j === k ? ([n, b <= n ? Math.min(n + 60, 1440) : b] as Tramo) : t)));
                      }}
                      className="flex-1 min-w-0 h-[46px] rounded-xl border-[1.5px] border-jungle-100 bg-white pl-2.5 pr-1.5 text-sm font-semibold text-jungle-950 focus:outline-none focus:border-jungle-600 focus:ring-4 focus:ring-jungle-600/10" />
                    <span className="text-jungle-400 text-sm">a</span>
                    <input type="time" step={1800} value={hhmm(b)} aria-label="Cierra"
                      onChange={(e) => {
                        let n = deHhmm(e.target.value);
                        if (n === 0) n = 1440;                     // 12:00 a. m. = medianoche
                        if (n <= a) n = Math.min(a + 60, 1440);
                        onDia(d, tramos.map((t, j) => (j === k ? ([a, n] as Tramo) : t)));
                      }}
                      className="flex-1 min-w-0 h-[46px] rounded-xl border-[1.5px] border-jungle-100 bg-white pl-2.5 pr-1.5 text-sm font-semibold text-jungle-950 focus:outline-none focus:border-jungle-600 focus:ring-4 focus:ring-jungle-600/10" />
                    <button type="button" aria-label="Quitar horario" onClick={() => onDia(d, tramos.filter((_, j) => j !== k))}
                      className="h-10 w-9 rounded-xl text-jungle-400 hover:bg-jungle-50 hover:text-jungle-700 flex items-center justify-center">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {tramos.length < 4 && (
                  <button type="button"
                    onClick={() => {
                      const u = tramos[tramos.length - 1];
                      const ini = Math.min(u[1] + 60, 1380);
                      onDia(d, [...tramos, [ini, Math.min(ini + 120, 1440)]]);
                    }}
                    className="text-[13px] font-bold text-jungle-700 py-2 px-1">
                    ＋ Otro horario este día
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── PC: calendario semanal ───────────── */
type Gesto = { tipo: 'nuevo' | 't' | 'b' | 'm'; d: number; k: number; y0: number; r0: Tramo; a: number };
type Vivo = { d: number; k: number; r: Tramo };

interface ColProps {
  d: number;
  tramos: Tramo[];
  vivo: Vivo | null;
  altoPaso: number;
  alto: number;
  onDown: (e: React.PointerEvent<HTMLDivElement>, d: number) => void;
  onMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onUp: () => void;
  onBloque: (e: React.PointerEvent, d: number, k: number, tipo: 't' | 'b' | 'm') => void;
  onQuitar: (d: number, k: number) => void;
}

// Cada columna solo se repinta si cambian SUS tramos o el arrastre en curso es suyo.
const Columna = memo(function Columna({ d, tramos, vivo, altoPaso, alto, onDown, onMove, onUp, onBloque, onQuitar }: ColProps) {
  const lista: { r: Tramo; k: number; fantasma: boolean }[] = tramos.map((r, k) => ({
    r: vivo && vivo.k === k ? vivo.r : r, k, fantasma: false,
  }));
  if (vivo && vivo.k === -1) lista.push({ r: vivo.r, k: -1, fantasma: true });
  const linea = altoPaso * 2;
  return (
    <div data-col className="relative border-l border-jungle-100 cursor-crosshair touch-none hover:bg-jungle-50/60"
      style={{
        height: alto,
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${linea - 1}px, rgba(22,101,52,0.09) ${linea - 1}px, rgba(22,101,52,0.09) ${linea}px)`,
      }}
      onPointerDown={(e) => onDown(e, d)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {lista.map(({ r, k, fantasma }) => (
        <div key={fantasma ? 'f' : k}
          onPointerDown={fantasma ? undefined : (e) => { const t = e.target as HTMLElement; if (!t.dataset.h && !t.closest('button')) onBloque(e, d, k, 'm'); }}
          className={`group absolute left-[3px] right-[3px] rounded-[10px] text-[11.5px] font-bold px-2 py-1.5 overflow-hidden select-none touch-none ${fantasma ? 'pointer-events-none bg-jungle-500/30 outline-dashed outline-2 outline-jungle-600 text-jungle-900' : 'cursor-grab active:cursor-grabbing text-white bg-gradient-to-br from-jungle-500 to-jungle-700 shadow-[0_4px_12px_rgba(21,128,61,0.3)]'}`}
          style={{ top: ((r[0] - INICIO) / PASO) * altoPaso, height: Math.max(altoPaso, ((r[1] - r[0]) / PASO) * altoPaso) }}>
          {!fantasma && (
            <>
              <div data-h="t" onPointerDown={(e) => onBloque(e, d, k, 't')} className="absolute inset-x-0 top-0 h-2.5 cursor-ns-resize" />
              <div data-h="b" onPointerDown={(e) => onBloque(e, d, k, 'b')} className="absolute inset-x-0 bottom-0 h-2.5 cursor-ns-resize" />
              <button type="button" aria-label="Quitar horario"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onQuitar(d, k)}
                className="absolute top-1 right-1 h-5 w-5 rounded-md bg-black/25 hidden group-hover:flex items-center justify-center">
                <X size={12} />
              </button>
            </>
          )}
          <span className="block leading-tight">{horaUI(r[0])} – {horaUI(r[1])}</span>
        </div>
      ))}
    </div>
  );
});

function Calendario({ value, onDia, altoPaso }: { value: Semana; onDia: (d: number, t: Tramo[]) => void; altoPaso: number }) {
  const gesto = useRef<Gesto | null>(null);
  const vivoRef = useRef<Vivo | null>(null);
  const [vivo, setVivoEstado] = useState<Vivo | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const altoRef = useRef(altoPaso);
  altoRef.current = altoPaso;

  // Solo se vuelve a pintar si el rango cambió de verdad (al pasar a otro paso de 30 min)
  const setVivo = useCallback((v: Vivo | null) => {
    const a = vivoRef.current;
    if (a && v && a.d === v.d && a.k === v.k && a.r[0] === v.r[0] && a.r[1] === v.r[1]) return;
    vivoRef.current = v;
    setVivoEstado(v);
  }, []);

  useEffect(() => { // abre mostrando la mañana
    if (scrollRef.current) scrollRef.current.scrollTop = ((8 * 60 - INICIO) / PASO) * altoPaso;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clamp = (m: number) => Math.max(INICIO, Math.min(FIN, m));
  const yAMin = (col: HTMLElement, y: number) => clamp(INICIO + Math.round((y - col.getBoundingClientRect().top) / altoRef.current) * PASO);

  const onDown = useCallback((e: React.PointerEvent<HTMLDivElement>, d: number) => {
    if (e.target !== e.currentTarget) return;
    const a = yAMin(e.currentTarget, e.clientY);
    gesto.current = { tipo: 'nuevo', d, k: -1, y0: e.clientY, r0: [a, a], a };
    e.currentTarget.setPointerCapture(e.pointerId);
    setVivo({ d, k: -1, r: [a, Math.min(a + PASO, FIN)] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setVivo]);

  const onBloque = useCallback((e: React.PointerEvent, d: number, k: number, tipo: 't' | 'b' | 'm') => {
    e.stopPropagation(); e.preventDefault();
    const col = (e.currentTarget as HTMLElement).closest('[data-col]') as HTMLElement;
    const r0 = [...valueRef.current[d][k]] as Tramo;
    gesto.current = { tipo, d, k, y0: e.clientY, r0, a: 0 };
    col.setPointerCapture(e.pointerId);
    setVivo({ d, k, r: r0 });
  }, [setVivo]);

  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesto.current;
    if (!g) return;
    if (g.tipo === 'nuevo') {
      const b = yAMin(e.currentTarget, e.clientY);
      const ini = Math.min(g.a, b);
      setVivo({ d: g.d, k: -1, r: [ini, Math.min(Math.max(g.a, b, ini + PASO), FIN)] });
      return;
    }
    const delta = Math.round((e.clientY - g.y0) / altoRef.current) * PASO;
    const [a, b] = g.r0;
    let r: Tramo;
    if (g.tipo === 't') r = [Math.max(INICIO, Math.min(b - PASO, a + delta)), b];
    else if (g.tipo === 'b') r = [a, Math.min(FIN, Math.max(a + PASO, b + delta))];
    else { const dur = b - a; const ini = Math.max(INICIO, Math.min(FIN - dur, a + delta)); r = [ini, ini + dur]; }
    setVivo({ d: g.d, k: g.k, r });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setVivo]);

  const onUp = useCallback(() => {
    const g = gesto.current;
    const v = vivoRef.current;
    gesto.current = null;
    setVivo(null);
    if (!g || !v) return;
    const dia = valueRef.current[g.d];
    if (g.tipo === 'nuevo') {
      const [a] = v.r;
      let b = v.r[1];
      if (b - a < PASO) b = Math.min(a + 60, FIN);
      onDia(g.d, [...dia, [a, b]]);
    } else {
      onDia(g.d, dia.map((t, i) => (i === g.k ? v.r : t)));
    }
  }, [onDia, setVivo]);

  const onQuitar = useCallback((d: number, k: number) => {
    onDia(d, valueRef.current[d].filter((_, i) => i !== k));
  }, [onDia]);

  const alto = ((FIN - INICIO) / PASO) * altoPaso;
  const horas: number[] = [];
  for (let m = INICIO; m < FIN; m += 60) horas.push(m);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <p className="text-xs text-jungle-500 mb-2 leading-snug">
        Arrastra sobre un día para marcar el horario. Arrastra los bordes para ajustarlo o el bloque para moverlo. Con la × lo quitas.
      </p>
      <div className="grid border-b border-jungle-100 pr-3" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
        <div />
        {DIAS_CORTO.map((d) => (<div key={d} className="py-2 text-center text-[12.5px] font-bold text-jungle-800">{d}</div>))}
      </div>
      <div ref={scrollRef} className="overflow-y-auto flex-1 min-h-[240px]">
        <div className="grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
          <div style={{ height: alto }}>
            {horas.map((m) => (
              <div key={m} className="text-[11px] text-jungle-500 text-right pr-2 -translate-y-[7px]" style={{ height: altoPaso * 2 }}>
                {m === INICIO ? '' : horaUI(m).replace(':00', '')}
              </div>
            ))}
          </div>
          {value.map((tramos, d) => (
            <Columna key={d} d={d} tramos={tramos} vivo={vivo && vivo.d === d ? vivo : null} altoPaso={altoPaso} alto={alto}
              onDown={onDown} onMove={onMove} onUp={onUp} onBloque={onBloque} onQuitar={onQuitar} />
          ))}
        </div>
      </div>
    </div>
  );
}
