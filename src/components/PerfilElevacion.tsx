import { useMemo } from 'react';
import type { PerfilElevacion as Perfil } from '../lib/elevacion';

// Gráfica de la altura a lo largo de la ruta (estilo MAPS.ME, en los colores de la
// plataforma). El trazo y el relleno son un SVG que se estira al ancho; las etiquetas
// y el punto de "tú estás aquí" son HTML encima para que no se deformen.
export default function PerfilElevacion({ perfil, avance }: { perfil: Perfil; avance: number }) {
  const { path, linea, idx, yActual } = useMemo(() => {
    const n = perfil.alturas.length;
    const rango = Math.max(1, perfil.max - perfil.min);
    const X = (i: number) => (i / (n - 1)) * 300;
    // un poco de aire arriba y abajo para que el trazo no toque los bordes
    const Y = (h: number) => 8 + (1 - (h - perfil.min) / rango) * 64;
    const pts = perfil.alturas.map((h, i) => `${X(i).toFixed(1)},${Y(h).toFixed(1)}`);
    const i = Math.min(n - 1, Math.max(0, Math.round(avance * (n - 1))));
    return {
      linea: 'M' + pts.join(' L'),
      path: 'M0,80 L' + pts.join(' L') + ' L300,80 Z',
      idx: i,
      yActual: ((Y(perfil.alturas[i]) / 80) * 100),
    };
  }, [perfil, avance]);

  const xActual = Math.min(100, Math.max(0, avance * 100));
  const alturaActual = Math.round(perfil.alturas[idx]);

  return (
    <div className="relative h-[92px] mt-3 select-none" role="img" aria-label={`Perfil de elevación: de ${Math.round(perfil.min)} a ${Math.round(perfil.max)} metros`}>
      <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <linearGradient id="relleno-perfil" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0891b2" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#0891b2" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {/* rejilla punteada */}
        {[75, 150, 225].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="80" stroke="#14532d" strokeOpacity="0.15" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1="0" y1="40" x2="300" y2="40" stroke="#14532d" strokeOpacity="0.15" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <path d={path} fill="url(#relleno-perfil)" />
        <path d={linea} fill="none" stroke="#0891b2" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>

      {/* altura máxima y mínima */}
      <span className="absolute right-0 top-0 text-[10px] font-bold text-jungle-800 bg-white/80 border border-jungle-100 rounded-md px-1.5 py-0.5 tabular-nums">{Math.round(perfil.max)}</span>
      <span className="absolute right-0 bottom-0 text-[10px] font-bold text-jungle-800 bg-white/80 border border-jungle-100 rounded-md px-1.5 py-0.5 tabular-nums">{Math.round(perfil.min)}</span>

      {/* dónde vas */}
      <div className="absolute top-0 bottom-0 w-px bg-jungle-900/25" style={{ left: xActual + '%' }} aria-hidden="true" />
      <span
        className="absolute w-3.5 h-3.5 -ml-[7px] -mt-[7px] rounded-full bg-white border-[3px] border-jungle-800 shadow"
        style={{ left: xActual + '%', top: yActual + '%' }}
        aria-hidden="true"
      />
      <span
        className="absolute -translate-x-1/2 -translate-y-full -mt-3 text-[10px] font-bold text-white bg-jungle-800 rounded-md px-1.5 py-0.5 tabular-nums whitespace-nowrap"
        style={{ left: Math.min(88, Math.max(12, xActual)) + '%', top: yActual + '%' }}
      >
        ▲ {alturaActual} m
      </span>
    </div>
  );
}
