import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// ============================================================
// CALENDARIO DE SELECCIÓN DE FECHA — un mes grande, un solo día
// ============================================================
// Antes el modal de "Reservar" usaba <input type="date">, que en
// muchos navegadores/dispositivos abre un selector minúsculo con
// letras diminutas (ver captura de referencia) — aquí se reemplaza
// por un calendario de verdad, igual de grande que el resto del
// modal, mismo lenguaje visual que CalendarioRango.tsx.
//
// Las fechas en `fechasBloqueadas` (ya ocupadas en el servicio) se
// muestran tachadas y no se pueden seleccionar — así el turista ve
// de un vistazo qué días sí hay, sin tener que ir probando uno por
// uno.
// ============================================================

const DIAS_SEMANA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function aISO(d: Date): string {
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
  valor: string;                 // fecha seleccionada, 'YYYY-MM-DD' o ''
  onSeleccionar: (iso: string) => void;
  fechaMinima: string;           // 'YYYY-MM-DD' — no se puede elegir antes de esto
  fechasBloqueadas?: string[];   // ya ocupadas, no seleccionables
}

export default function CalendarioSeleccionFecha({ valor, onSeleccionar, fechaMinima, fechasBloqueadas = [] }: Props) {
  const seleccionada = desdeISO(valor);
  const minima = desdeISO(fechaMinima) ?? new Date();
  const bloqueadas = new Set(fechasBloqueadas);

  const [mesVisible, setMesVisible] = useState<Date>(() => seleccionada ?? minima);

  const primerDiaMes = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1);
  const diasEnMes = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 0).getDate();
  const offsetInicial = primerDiaMes.getDay();

  const celdas: (Date | null)[] = [
    ...Array(offsetInicial).fill(null),
    ...Array.from({ length: diasEnMes }, (_, i) => new Date(mesVisible.getFullYear(), mesVisible.getMonth(), i + 1)),
  ];

  // No se puede retroceder antes del mes de la fecha mínima — evita
  // que el turista navegue a un mes ya pasado sin ningún día útil.
  const puedeRetroceder = mesVisible.getFullYear() > minima.getFullYear()
    || (mesVisible.getFullYear() === minima.getFullYear() && mesVisible.getMonth() > minima.getMonth());

  return (
    <div className="bg-jungle-50 rounded-2xl p-3.5">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => puedeRetroceder && setMesVisible(new Date(mesVisible.getFullYear(), mesVisible.getMonth() - 1, 1))}
          disabled={!puedeRetroceder}
          className="w-8 h-8 rounded-full flex items-center justify-center text-jungle-700 hover:bg-white disabled:opacity-25 disabled:hover:bg-transparent"
          aria-label="Mes anterior"
        >
          <ChevronLeft size={17} />
        </button>
        <span className="text-sm font-semibold text-jungle-950">
          {MESES[mesVisible.getMonth()]} de {mesVisible.getFullYear()}
        </span>
        <button
          type="button"
          onClick={() => setMesVisible(new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 1))}
          className="w-8 h-8 rounded-full flex items-center justify-center text-jungle-700 hover:bg-white"
          aria-label="Mes siguiente"
        >
          <ChevronRight size={17} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 mb-1">
        {DIAS_SEMANA.map((d, i) => (
          <div key={i} className="text-center text-[11px] font-semibold text-jungle-400 py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1.5">
        {celdas.map((dia, i) => {
          if (!dia) return <div key={i} />;
          const iso = aISO(dia);
          const esSeleccionada = iso === valor;
          const esBloqueada = bloqueadas.has(iso);
          const esPasado = iso < fechaMinima;
          const deshabilitada = esBloqueada || esPasado;
          return (
            <div key={i} className="flex items-center justify-center">
              <button
                type="button"
                disabled={deshabilitada}
                onClick={() => onSeleccionar(iso)}
                title={esBloqueada ? 'Ya está ocupado ese día' : undefined}
                className={`relative w-9 h-9 rounded-full text-[13px] flex items-center justify-center transition-colors ${
                  esSeleccionada
                    ? 'bg-jungle-700 text-white font-semibold'
                    : deshabilitada
                      ? 'text-jungle-300 line-through cursor-not-allowed'
                      : 'text-jungle-900 hover:bg-white font-medium'
                }`}
              >
                {dia.getDate()}
              </button>
            </div>
          );
        })}
      </div>

      {fechasBloqueadas.length > 0 && (
        <p className="text-[11px] text-jungle-400 mt-2.5 flex items-center gap-1.5">
          <span className="w-3 text-center line-through text-jungle-300">0</span> Ya ocupado
        </p>
      )}
    </div>
  );
}
