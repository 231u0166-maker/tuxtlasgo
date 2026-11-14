// ============================================================
// GRÁFICA DE ACTIVIDAD — línea con área, estilo Mercado Pago
// ============================================================
// Reemplaza a GraficaMini (tres barras minúsculas). Una sola gráfica
// grande con pestañas (vistas / me gusta / IA), eje vertical con
// números, fechas abajo, comparación contra el periodo anterior y
// un tooltip al tocar o pasar el mouse. SVG puro — sin librerías
// nuevas, igual que antes, para no inflar el bundle.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';

export interface PuntoActividad {
  dia: string; // 'YYYY-MM-DD'
  vistas: number;
  likes: number;
  ia_recomendaciones: number;
}

type Metrica = 'vistas' | 'likes' | 'ia_recomendaciones';

const METRICAS: { id: Metrica; pestana: string; plural: string; color: string }[] = [
  { id: 'vistas', pestana: 'Vistas', plural: 'vistas', color: '#15803d' },
  { id: 'likes', pestana: 'Me gusta', plural: 'me gusta', color: '#dc2626' },
  { id: 'ia_recomendaciones', pestana: 'Recomendado por IA', plural: 'recomendaciones de IA', color: '#2563eb' },
];

const suma = (a: number[]) => a.reduce((x, y) => x + y, 0);

// Fecha 'YYYY-MM-DD' → Date local (evita el desfase de zona horaria de new Date('YYYY-MM-DD'))
function aFecha(dia: string): Date {
  const [y, m, d] = dia.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const fechaCorta = (dia: string) => aFecha(dia).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '');
const fechaLarga = (dia: string) => aFecha(dia).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

// Tope "bonito" del eje Y: 4 divisiones con paso 1, 2, 5, 10, 20, 50…
function topeEje(max: number): number {
  if (max <= 4) return 4;
  const minimo = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(minimo)));
  const paso = [1, 2, 5, 10].map((x) => x * p).find((x) => x >= minimo) ?? 10 * p;
  return paso * 4;
}

const IZQ = 34, DER = 10, ARR = 14, ABA = 30;

export default function GraficaActividad({ serie }: { serie: PuntoActividad[] }) {
  const [metrica, setMetrica] = useState<Metrica>('vistas');
  const [rango, setRango] = useState<7 | 14>(14);
  const [activo, setActivo] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cajaRef = useRef<HTMLDivElement>(null);

  // El SVG se dibuja al ancho real de la caja (1 unidad = 1 px), así el
  // texto de los ejes mide siempre lo mismo y se lee igual en celular
  // que en computadora, en vez de encogerse con el viewBox.
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = cajaRef.current;
    if (!el) return;
    const medir = () => setW(Math.max(260, Math.round(el.clientWidth)));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = Math.round(Math.min(300, Math.max(210, W * 0.5)));
  const AW = W - IZQ - DER, AH = H - ARR - ABA;

  const m = METRICAS.find((x) => x.id === metrica)!;
  const todos = useMemo(() => serie.map((p) => p[metrica]), [serie, metrica]);
  const datos = todos.slice(-rango);
  const fechas = serie.slice(-rango).map((p) => p.dia);
  const total = suma(datos);
  const n = datos.length;

  // Comparación con el periodo anterior — solo si hay datos completos.
  const previo = todos.slice(-rango * 2, -rango);
  let comparacion: { texto: string; tono: 'sube' | 'baja' | 'igual' };
  if (previo.length === rango && suma(previo) > 0) {
    const pct = Math.round(((total - suma(previo)) / suma(previo)) * 100);
    comparacion = {
      texto: `${pct > 0 ? '↑ ' : pct < 0 ? '↓ ' : ''}${Math.abs(pct)} % vs. periodo anterior`,
      tono: pct > 0 ? 'sube' : pct < 0 ? 'baja' : 'igual',
    };
  } else {
    comparacion = { texto: total > 0 ? 'Sin periodo anterior para comparar' : 'Sin actividad', tono: 'igual' };
  }

  const tope = topeEje(Math.max(...datos, 1));
  const X = (i: number) => IZQ + (n <= 1 ? AW / 2 : (i * AW) / (n - 1));
  const Y = (v: number) => ARR + AH - (v / tope) * AH;
  // Etiquetas de fecha: cada "paso" días contando desde hoy hacia atrás,
  // así la última (hoy) siempre aparece y nunca se pisa con la anterior.
  const paso = n > 8 ? (W < 420 ? 4 : 3) : 1;

  function seleccionar(clientX: number) {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || n === 0) return;
    const x = ((clientX - r.left) / r.width) * W;
    const i = Math.round((x - IZQ) / (AW / Math.max(n - 1, 1)));
    setActivo(Math.max(0, Math.min(n - 1, i)));
  }

  const puntos = datos.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
  const idGrad = `grad-${metrica}`;

  const claseTono = {
    sube: 'bg-green-100 text-green-800',
    baja: 'bg-red-100 text-red-800',
    igual: 'bg-slate-100 text-slate-600',
  }[comparacion.tono];

  return (
    <div>
      {/* Pestañas */}
      <div className="flex gap-1.5 mt-3 border-b border-jungle-100 overflow-x-auto" role="tablist">
        {METRICAS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={metrica === x.id}
            onClick={() => { setMetrica(x.id); setActivo(null); }}
            className={`px-3 py-2.5 text-[13px] font-bold whitespace-nowrap border-b-[3px] -mb-px transition-colors ${
              metrica === x.id ? 'text-jungle-800 border-jungle-700' : 'text-gray-500 border-transparent'
            }`}
          >
            {x.pestana}
          </button>
        ))}
      </div>

      {/* Número grande + comparación */}
      <div className="flex items-baseline gap-2.5 flex-wrap mt-3">
        <span className="font-display font-extrabold text-[34px] leading-none text-jungle-950">{total}</span>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${claseTono}`}>{comparacion.texto}</span>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {m.plural.charAt(0).toUpperCase() + m.plural.slice(1)} en los últimos {rango} días
      </p>

      {/* Rango */}
      <div className="flex gap-1.5 mt-3">
        {([7, 14] as const).map((d) => (
          <button
            key={d}
            onClick={() => { setRango(d); setActivo(null); }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
              rango === d ? 'bg-jungle-50 border-jungle-300 text-jungle-800' : 'border-jungle-100 text-gray-500'
            }`}
          >
            {d} días
          </button>
        ))}
      </div>

      {/* Gráfica */}
      <div ref={cajaRef} className="relative mt-2.5">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto block overflow-visible touch-none"
          role="img"
          aria-label={`Gráfica de ${m.plural} de los últimos ${rango} días`}
        >
          <defs>
            <linearGradient id={idGrad} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={m.color} stopOpacity="0.28" />
              <stop offset="1" stopColor={m.color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3, 4].map((k) => {
            const v = (tope / 4) * k;
            const y = Y(v);
            return (
              <g key={k}>
                <line x1={IZQ} x2={W - DER} y1={y} y2={y} stroke={k ? '#e5ece7' : '#cdd9d1'} strokeDasharray={k ? '3 4' : undefined} />
                <text x={IZQ - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#6b7280">
                  {Number.isInteger(v) ? v : v.toFixed(1)}
                </text>
              </g>
            );
          })}

          {fechas.map((d, i) =>
            (n - 1 - i) % paso === 0 ? (
              <text key={d} x={X(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#6b7280">{fechaCorta(d)}</text>
            ) : null
          )}

          <polygon points={`${IZQ},${Y(0)} ${puntos} ${X(n - 1)},${Y(0)}`} fill={`url(#${idGrad})`} />
          <polyline points={puntos} fill="none" stroke={m.color} strokeWidth="2.5" strokeLinejoin="round" />
          {datos.map((v, i) =>
            v > 0 ? <circle key={i} cx={X(i)} cy={Y(v)} r="3.5" fill="#fff" stroke={m.color} strokeWidth="2" /> : null
          )}

          {activo !== null && (
            <g>
              <line x1={X(activo)} x2={X(activo)} y1={ARR} y2={ARR + AH} stroke={m.color} strokeOpacity="0.35" />
              <circle cx={X(activo)} cy={Y(datos[activo])} r="6" fill={m.color} stroke="#fff" strokeWidth="2.5" />
            </g>
          )}

          <rect
            x={IZQ} y={ARR} width={AW} height={AH} fill="transparent"
            onMouseMove={(e) => seleccionar(e.clientX)}
            onMouseLeave={() => setActivo(null)}
            onTouchStart={(e) => seleccionar(e.touches[0].clientX)}
            onTouchMove={(e) => seleccionar(e.touches[0].clientX)}
            onTouchEnd={() => setActivo(null)}
          />
        </svg>

        {activo !== null && (
          <div
            className="absolute pointer-events-none bg-stone-900 text-white rounded-[10px] px-2.5 py-1.5 text-xs whitespace-nowrap -translate-x-1/2 -translate-y-[110%]"
            style={{ left: `${(X(activo) / W) * 100}%`, top: `${(Y(datos[activo]) / H) * 100}%` }}
          >
            <b className="block text-sm">{datos[activo]} {m.plural}</b>
            <span className="text-stone-400 text-[11px]">{fechaLarga(fechas[activo])}</span>
          </div>
        )}
      </div>
    </div>
  );
}
