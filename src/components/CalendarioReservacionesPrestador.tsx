import { useState } from 'react';
import { ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';

// ============================================================
// CALENDARIO DEL PRESTADOR — vista mensual de sus reservaciones
// ============================================================
// Antes "Fechas no disponibles" era solo una lista de chips de
// texto, sin ninguna vista de calendario real — lo que se pidió
// fue justo eso: un calendario grande que muestre cuándo hay
// reservaciones, igual para el prestador que para el turista.
//
// Un día puede estar en 3 estados:
//   - Reservado (verde)   → hay una reservación CONFIRMADA ese día
//   - Pendiente (ámbar)   → hay una solicitud esperando respuesta
//   - Bloqueado (gris)    → el prestador lo cerró a mano, sin reserva
// Tocar un día vacío lo bloquea; tocar uno bloqueado a mano lo
// libera. Los días con reservación real no se tocan desde aquí —
// eso se maneja confirmando/rechazando/cancelando la reservación,
// no bloqueando el calendario a mano.
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

interface ReservaDia {
  id: number;
  nombre_viajero: string;
  estado: string;
  fecha: string;
}

interface Props {
  reservaciones: ReservaDia[];
  fechasBloqueadas: string[];
  onBloquear: (fecha: string) => void;
  onDesbloquear: (fecha: string) => void;
  onAbrirChat: (id: number, nombreViajero: string) => void;
}

export default function CalendarioReservacionesPrestador({
  reservaciones, fechasBloqueadas, onBloquear, onDesbloquear, onAbrirChat,
}: Props) {
  const [mesVisible, setMesVisible] = useState<Date>(new Date());
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);

  const hoy = aISO(new Date());
  const bloqueadasManual = new Set(fechasBloqueadas);

  const porDia = new Map<string, ReservaDia[]>();
  for (const r of reservaciones) {
    if (r.estado !== 'confirmada' && r.estado !== 'pendiente') continue;
    const lista = porDia.get(r.fecha) ?? [];
    lista.push(r);
    porDia.set(r.fecha, lista);
  }

  const primerDiaMes = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1);
  const diasEnMes = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 0).getDate();
  const offsetInicial = primerDiaMes.getDay();
  const celdas: (Date | null)[] = [
    ...Array(offsetInicial).fill(null),
    ...Array.from({ length: diasEnMes }, (_, i) => new Date(mesVisible.getFullYear(), mesVisible.getMonth(), i + 1)),
  ];

  function manejarClick(iso: string) {
    const reservasDia = porDia.get(iso) ?? [];
    if (reservasDia.length > 0) {
      // Día con reservación real — se muestra el detalle abajo, no
      // se bloquea/desbloquea a mano desde aquí.
      setDiaSeleccionado(diaSeleccionado === iso ? null : iso);
      return;
    }
    if (bloqueadasManual.has(iso)) onDesbloquear(iso);
    else if (iso >= hoy) onBloquear(iso);
  }

  const reservasDelDiaSeleccionado = diaSeleccionado ? (porDia.get(diaSeleccionado) ?? []) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setMesVisible(new Date(mesVisible.getFullYear(), mesVisible.getMonth() - 1, 1))}
          className="w-8 h-8 rounded-full flex items-center justify-center text-jungle-700 hover:bg-jungle-50"
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
          className="w-8 h-8 rounded-full flex items-center justify-center text-jungle-700 hover:bg-jungle-50"
          aria-label="Mes siguiente"
        >
          <ChevronRight size={17} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 mb-1">
        {DIAS_SEMANA.map((d, i) => (
          <div key={i} className="text-center text-[11px] font-semibold text-jungle-400 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1.5">
        {celdas.map((dia, i) => {
          if (!dia) return <div key={i} />;
          const iso = aISO(dia);
          const reservasDia = porDia.get(iso) ?? [];
          const tieneConfirmada = reservasDia.some(r => r.estado === 'confirmada');
          const tienePendiente = reservasDia.some(r => r.estado === 'pendiente');
          const bloqueada = bloqueadasManual.has(iso);
          const esPasado = iso < hoy;
          const esSeleccionado = iso === diaSeleccionado;

          let clase = 'text-jungle-900 hover:bg-jungle-50 font-medium';
          if (tieneConfirmada) clase = 'bg-green-600 text-white font-semibold hover:bg-green-700';
          else if (tienePendiente) clase = 'bg-amber-400 text-amber-950 font-semibold hover:bg-amber-500';
          else if (bloqueada) clase = 'text-jungle-300 line-through hover:bg-jungle-50';
          else if (esPasado) clase = 'text-jungle-200 cursor-default';

          return (
            <div key={i} className="flex items-center justify-center">
              <button
                type="button"
                onClick={() => manejarClick(iso)}
                disabled={esPasado && reservasDia.length === 0}
                title={
                  tieneConfirmada ? 'Reservación confirmada — toca para ver'
                  : tienePendiente ? 'Solicitud pendiente — toca para ver'
                  : bloqueada ? 'Bloqueado a mano — toca para liberar'
                  : esPasado ? undefined
                  : 'Toca para bloquear este día'
                }
                className={`relative w-9 h-9 rounded-full text-[13px] flex items-center justify-center transition-colors ${clase} ${esSeleccionado ? 'ring-2 ring-jungle-700 ring-offset-1' : ''}`}
              >
                {dia.getDate()}
              </button>
            </div>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 text-[10.5px] text-jungle-500">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-600" /> Confirmada</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Pendiente</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-jungle-200" /> Bloqueado</span>
        <span>· Toca un día vacío para bloquearlo</span>
      </div>

      {/* Detalle del día tocado */}
      {diaSeleccionado && reservasDelDiaSeleccionado.length > 0 && (
        <div className="mt-3 bg-jungle-50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-jungle-700">
            {new Date(diaSeleccionado + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}
          </p>
          {reservasDelDiaSeleccionado.map(r => (
            <div key={r.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
              <div>
                <p className="text-xs font-semibold text-jungle-900">{r.nombre_viajero}</p>
                <p className={`text-[10px] font-bold ${r.estado === 'confirmada' ? 'text-green-700' : 'text-amber-700'}`}>
                  {r.estado === 'confirmada' ? 'Confirmada' : 'Pendiente'}
                </p>
              </div>
              <button
                onClick={() => onAbrirChat(r.id, r.nombre_viajero)}
                className="text-jungle-600 hover:text-jungle-900 p-1.5"
                aria-label="Abrir mensajes"
              >
                <MessageCircle size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
