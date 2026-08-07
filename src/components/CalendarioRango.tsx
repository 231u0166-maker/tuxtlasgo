import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// ============================================================
// CALENDARIO DE RANGO — un mes visible, navegación con flechas
// ============================================================
// Reemplaza los dos <input type="date"> sueltos que tenía el modal
// "Cuándo" — la referencia real de mindtrip (imagen 4) es un
// calendario de verdad, no dos campos de texto. Un solo mes en vez
// de los dos que muestra mindtrip: el modal aquí es angosto (340px,
// mismo ancho que los demás) y dos meses uno junto al otro no caben
// sin romper esa consistencia — con flechas para navegar alcanza.
//
// Selección: primer click = inicio, segundo click = fin (si es antes
// del inicio, se intercambian). Un tercer click reinicia el rango.

const DIAS_SEMANA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function aISO(d: Date): string {
  // Fecha LOCAL, no UTC — toISOString() puede recorrer al día
  // anterior/siguiente según la zona horaria del dispositivo.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const día = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${día}`;
}

function desdeISO(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

interface Props {
  desde: string;
  hasta: string;
  onCambiar: (desde: string, hasta: string) => void;
}

export default function CalendarioRango({ desde, hasta, onCambiar }: Props) {
  const inicioRango = desdeISO(desde);
  const finRango = desdeISO(hasta);

  const [mesVisible, setMesVisible] = useState<Date>(() => inicioRango ?? new Date());

  const primerDiaMes = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1);
  const diasEnMes = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 0).getDate();
  const offsetInicial = primerDiaMes.getDay(); // 0 = domingo

  const celdas: (Date | null)[] = [
    ...Array(offsetInicial).fill(null),
    ...Array.from({ length: diasEnMes }, (_, i) => new Date(mesVisible.getFullYear(), mesVisible.getMonth(), i + 1)),
  ];

  const hoy = aISO(new Date());

  const manejarClickDia = (dia: Date) => {
    const iso = aISO(dia);
    if (!inicioRango || (inicioRango && finRango)) {
      // Sin rango, o rango ya completo → empieza uno nuevo
      onCambiar(iso, '');
    } else if (iso < aISO(inicioRango)) {
      // Tocó un día antes del inicio → se convierte en el nuevo inicio
      onCambiar(iso, desde);
    } else {
      onCambiar(desde, iso);
    }
  };

  const enRango = (dia: Date): boolean => {
    if (!inicioRango || !finRango) return false;
    const iso = aISO(dia);
    return iso > aISO(inicioRango) && iso < aISO(finRango);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setMesVisible(new Date(mesVisible.getFullYear(), mesVisible.getMonth() - 1, 1))}
          className="w-7 h-7 rounded-full flex items-center justify-center text-obsidiana-800/60 hover:bg-obsidiana-900/5"
          aria-label="Mes anterior"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-[13.5px] font-semibold text-obsidiana-900">
          {MESES[mesVisible.getMonth()]} de {mesVisible.getFullYear()}
        </span>
        <button
          type="button"
          onClick={() => setMesVisible(new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 1))}
          className="w-7 h-7 rounded-full flex items-center justify-center text-obsidiana-800/60 hover:bg-obsidiana-900/5"
          aria-label="Mes siguiente"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 mb-1">
        {DIAS_SEMANA.map((d, i) => (
          <div key={i} className="text-center text-[10.5px] font-semibold text-obsidiana-800/40 py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {celdas.map((dia, i) => {
          if (!dia) return <div key={i} />;
          const iso = aISO(dia);
          const esInicio = iso === desde;
          const esFin = iso === hasta;
          const esHoy = iso === hoy;
          const dentro = enRango(dia);
          return (
            <div key={i} className="flex items-center justify-center relative">
              {dentro && <div className="absolute inset-y-0.5 inset-x-0 bg-jungle-50" />}
              <button
                type="button"
                onClick={() => manejarClickDia(dia)}
                className={`relative w-8 h-8 rounded-full text-[12.5px] flex items-center justify-center transition-colors ${
                  esInicio || esFin
                    ? 'bg-jungle-700 text-white font-semibold'
                    : esHoy
                      ? 'text-jungle-700 font-semibold'
                      : 'text-obsidiana-800 hover:bg-obsidiana-900/5'
                }`}
              >
                {dia.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
