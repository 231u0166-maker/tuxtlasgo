// ============================================================
// GRÁFICA MINI — barras simples en SVG puro, sin librería externa
// ============================================================
// El panel de "Ganancias y estadísticas" solo necesita mostrar
// tendencias de ~14 puntos — una barra SVG a mano es más liviana
// que sumar una dependencia de gráficas nueva, y este proyecto ya
// es cuidadoso con lo que agrega (piensa offline-first).
// ============================================================

interface Punto {
  dia: string;   // 'YYYY-MM-DD'
  valor: number;
}

export default function GraficaMini({
  datos,
  color = '#15803d',
  alto = 48,
}: {
  datos: Punto[];
  color?: string;
  alto?: number;
}) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const n = Math.max(datos.length, 1);
  const anchoBarra = 100 / n;

  return (
    <svg viewBox={`0 0 100 ${alto}`} preserveAspectRatio="none" className="w-full" style={{ height: alto }}>
      {datos.map((d, i) => {
        const h = Math.max((d.valor / max) * (alto - 4), d.valor > 0 ? 3 : 1.5);
        return (
          <rect
            key={d.dia}
            x={i * anchoBarra + anchoBarra * 0.18}
            y={alto - h}
            width={anchoBarra * 0.64}
            height={h}
            rx={1}
            fill={color}
            opacity={d.valor > 0 ? 1 : 0.15}
          />
        );
      })}
    </svg>
  );
}
