import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Trash2, X } from 'lucide-react';
import {
  DIAS_CORTO, DIAS_NOMBRE, gruposDeSemana, etiquetaDias, horaUI, semanaVacia, unirTramos,
  type Semana, type Tramo,
} from '../lib/horario';

// Editor del horario por día.
//  - PC: calendario semanal tipo Google Calendar. Se arrastra sobre un día para
//    marcar el horario; los bordes del bloque lo ajustan; el bloque se mueve.
//  - Celular: un renglón por día con interruptor y selector de hora del teléfono.

const INICIO = 6 * 60;   // el calendario empieza a las 6:00 a. m.
const FIN = 24 * 60;     // y llega a la medianoche
const PASO = 30;         // se ajusta de 30 en 30 minutos
const ALTO_PASO = 22;    // px por cada 30 min

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

  function ponerDia(d: number, tramos: Tramo[]) {
    onChange(value.map((t, i) => (i === d ? unirTramos(tramos) : t)));
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PRESETS.map((p) => (
          <button key={p.texto} type="button" onClick={() => onChange(p.aplicar(value))}
            className="min-h-[40px] px-3.5 rounded-full border-[1.5px] border-jungle-100 bg-white/80 text-[13px] font-semibold text-jungle-800 hover:border-jungle-300 transition-colors">
            {p.texto}
          </button>
        ))}
      </div>
      {esPC ? <Calendario value={value} onDia={ponerDia} /> : <ListaDias value={value} onDia={ponerDia} />}
    </div>
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
                <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                  className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow ${abierto ? 'right-[3px]' : 'left-[3px]'}`} />
              </button>
            </div>
            {abierto && (
              <div className="mt-2.5 space-y-2">
                {tramos.map(([a, b], k) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <input type="time" step={1800} value={hhmm(a)} aria-label="Abre"
                      onChange={(e) => {
                        const n = deHhmm(e.target.value);
                        const nuevo = tramos.map((t, j) => (j === k ? ([n, b <= n ? Math.min(n + 60, 1440) : b] as Tramo) : t));
                        onDia(d, nuevo);
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

function Calendario({ value, onDia }: { value: Semana; onDia: (d: number, t: Tramo[]) => void }) {
  const gesto = useRef<Gesto | null>(null);
  const [vivo, setVivo] = useState<{ d: number; k: number; r: Tramo } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { // abre mostrando la mañana
    if (scrollRef.current) scrollRef.current.scrollTop = ((8 * 60 - INICIO) / PASO) * ALTO_PASO;
  }, []);

  const clamp = (m: number) => Math.max(INICIO, Math.min(FIN, m));
  const yAMin = (col: HTMLElement, y: number) => clamp(INICIO + Math.round((y - col.getBoundingClientRect().top) / ALTO_PASO) * PASO);

  function iniciarNuevo(e: React.PointerEvent<HTMLDivElement>, d: number) {
    if (e.target !== e.currentTarget) return;
    const a = yAMin(e.currentTarget, e.clientY);
    gesto.current = { tipo: 'nuevo', d, k: -1, y0: e.clientY, r0: [a, a], a };
    e.currentTarget.setPointerCapture(e.pointerId);
    setVivo({ d, k: -1, r: [a, Math.min(a + PASO, FIN)] });
  }
  function iniciarBloque(e: React.PointerEvent, d: number, k: number, tipo: 't' | 'b' | 'm') {
    e.stopPropagation(); e.preventDefault();
    const col = (e.currentTarget as HTMLElement).closest('[data-col]') as HTMLElement;
    gesto.current = { tipo, d, k, y0: e.clientY, r0: [...value[d][k]] as Tramo, a: 0 };
    col.setPointerCapture(e.pointerId);
    setVivo({ d, k, r: [...value[d][k]] as Tramo });
  }
  function mover(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesto.current;
    if (!g) return;
    if (g.tipo === 'nuevo') {
      const b = yAMin(e.currentTarget, e.clientY);
      const ini = Math.min(g.a, b);
      const fin = Math.max(g.a, b, ini + PASO);
      setVivo({ d: g.d, k: -1, r: [ini, Math.min(fin, FIN)] });
      return;
    }
    const delta = Math.round((e.clientY - g.y0) / ALTO_PASO) * PASO;
    const [a, b] = g.r0;
    let r: Tramo;
    if (g.tipo === 't') r = [Math.max(INICIO, Math.min(b - PASO, a + delta)), b];
    else if (g.tipo === 'b') r = [a, Math.min(FIN, Math.max(a + PASO, b + delta))];
    else { const dur = b - a; const ini = Math.max(INICIO, Math.min(FIN - dur, a + delta)); r = [ini, ini + dur]; }
    setVivo({ d: g.d, k: g.k, r });
  }
  function soltar() {
    const g = gesto.current;
    const v = vivo;
    gesto.current = null;
    setVivo(null);
    if (!g || !v) return;
    if (g.tipo === 'nuevo') {
      let [a, b] = v.r;
      if (g.y0 !== undefined && b - a < PASO) b = Math.min(a + 60, FIN);
      onDia(g.d, [...value[g.d], [a, b]]);
    } else {
      onDia(g.d, value[g.d].map((t, i) => (i === g.k ? v.r : t)));
    }
  }

  const alto = ((FIN - INICIO) / PASO) * ALTO_PASO;
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
      <div ref={scrollRef} className="overflow-y-auto flex-1 min-h-[260px]">
        <div className="grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
          <div style={{ height: alto }}>
            {horas.map((m) => (
              <div key={m} className="text-[11px] text-jungle-500 text-right pr-2 -translate-y-[7px]" style={{ height: ALTO_PASO * 2 }}>
                {m === INICIO ? '' : horaUI(m).replace(':00', '')}
              </div>
            ))}
          </div>
          {value.map((tramos, d) => {
            const lista: { r: Tramo; k: number; fantasma: boolean }[] = tramos.map((r, k) => ({
              r: vivo && vivo.d === d && vivo.k === k ? vivo.r : r, k, fantasma: false,
            }));
            if (vivo && vivo.d === d && vivo.k === -1) lista.push({ r: vivo.r, k: -1, fantasma: true });
            return (
              <div key={d} data-col className="relative border-l border-jungle-100 cursor-crosshair touch-none hover:bg-jungle-50/60"
                style={{
                  height: alto,
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${ALTO_PASO * 2 - 1}px, rgba(22,101,52,0.09) ${ALTO_PASO * 2 - 1}px, rgba(22,101,52,0.09) ${ALTO_PASO * 2}px)`,
                }}
                onPointerDown={(e) => iniciarNuevo(e, d)} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
                {lista.map(({ r, k, fantasma }) => (
                  <div key={k + (fantasma ? 'f' : '')}
                    onPointerDown={fantasma ? undefined : (e) => { if (!(e.target as HTMLElement).dataset.h && !(e.target as HTMLElement).closest('button')) iniciarBloque(e, d, k, 'm'); }}
                    className={`group absolute left-[3px] right-[3px] rounded-[10px] text-[11.5px] font-bold px-2 py-1.5 overflow-hidden select-none touch-none ${fantasma ? 'pointer-events-none bg-jungle-500/30 outline-dashed outline-2 outline-jungle-600 text-jungle-900' : 'cursor-grab active:cursor-grabbing text-white bg-gradient-to-br from-jungle-500 to-jungle-700 shadow-[0_4px_12px_rgba(21,128,61,0.3)]'}`}
                    style={{ top: ((r[0] - INICIO) / PASO) * ALTO_PASO, height: Math.max(ALTO_PASO, ((r[1] - r[0]) / PASO) * ALTO_PASO) }}>
                    {!fantasma && (
                      <>
                        <div data-h="t" onPointerDown={(e) => iniciarBloque(e, d, k, 't')} className="absolute inset-x-0 top-0 h-2.5 cursor-ns-resize" />
                        <div data-h="b" onPointerDown={(e) => iniciarBloque(e, d, k, 'b')} className="absolute inset-x-0 bottom-0 h-2.5 cursor-ns-resize" />
                        <button type="button" aria-label="Quitar horario"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => onDia(d, tramos.filter((_, i) => i !== k))}
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
          })}
        </div>
      </div>
    </div>
  );
}

/** Resumen "Así lo verá el turista": días iguales agrupados. */
export function ResumenHorario({ value }: { value: Semana }) {
  const grupos = gruposDeSemana(value);
  if (grupos.every((g) => g.tramos.length === 0)) {
    return <p className="text-sm text-jungle-500">Aún no marcas ningún horario.</p>;
  }
  return (
    <div className="space-y-1.5">
      {grupos.map((g) => (
        <div key={g.ini} className={`flex gap-3 items-baseline text-sm ${g.tramos.length ? '' : 'text-jungle-400'}`}>
          <b className="min-w-[74px] text-jungle-800">{etiquetaDias(g.ini, g.fin)}</b>
          <span>{g.tramos.length ? g.tramos.map(([a, b]) => `${horaUI(a)} – ${horaUI(b)}`).join(' y ') : 'Cerrado'}</span>
        </div>
      ))}
    </div>
  );
}
