import { useEffect, useRef, useState } from 'react';
import { MapPin, Calendar, Users, DollarSign, ChevronDown, Minus, Plus } from 'lucide-react';

// ============================================================
// BARRA DE FILTROS — Dónde / Cuándo / Quién / Presupuesto
// ============================================================
// Base-visual SECTION-04. Es el molde visual nada más: guarda su
// propio estado y lo expone por onCambiar, pero no llama a
// chatbot.ts/routing.ts todavía — esa conexión es del módulo de
// rutas/itinerarios (siguiente pieza), que reemplaza la doble
// pregunta por chat con este filtro estructurado (PDF págs. 52-53).

export interface QuienViaja {
  adultos: number;
  ninos: number;
  bebes: number;
  mascotas: boolean;
}

export interface FiltrosViajeValor {
  donde: string;
  porCarretera: boolean;
  desde: string;
  hasta: string;
  quien: QuienViaja;
  presupuesto: 1 | 2 | 3;
}

const QUIEN_DEFAULT: QuienViaja = { adultos: 1, ninos: 0, bebes: 0, mascotas: false };

const VALOR_DEFAULT: FiltrosViajeValor = {
  donde: '',
  porCarretera: false,
  desde: '',
  hasta: '',
  quien: QUIEN_DEFAULT,
  presupuesto: 2,
};

interface Props {
  valor?: Partial<FiltrosViajeValor>;
  onCambiar?: (valor: FiltrosViajeValor) => void;
}

type PopoverAbierto = 'donde' | 'cuando' | 'quien' | 'presupuesto' | null;

export default function FiltrosViaje({ valor, onCambiar }: Props) {
  const [estado, setEstado] = useState<FiltrosViajeValor>({ ...VALOR_DEFAULT, ...valor });
  const [abierto, setAbierto] = useState<PopoverAbierto>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cerrarSiFuera = (e: Event) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(null);
      }
    };
    document.addEventListener('mousedown', cerrarSiFuera);
    return () => document.removeEventListener('mousedown', cerrarSiFuera);
  }, []);

  const actualizar = (parcial: Partial<FiltrosViajeValor>) => {
    setEstado((prev) => {
      const siguiente = { ...prev, ...parcial };
      onCambiar?.(siguiente);
      return siguiente;
    });
  };

  const totalQuien = estado.quien.adultos + estado.quien.ninos + estado.quien.bebes;
  const etiquetaPresupuesto = { 1: '$', 2: '$$', 3: '$$$' }[estado.presupuesto];

  return (
    <div
      ref={contenedorRef}
      className="inline-flex flex-wrap items-center gap-2 bg-white rounded-full border border-obsidiana-900/10 p-1.5 shadow-sm"
    >
      {/* DÓNDE */}
      <div className="relative">
        <Pastilla
          icon={MapPin}
          label={estado.donde || 'Dónde'}
          activo={abierto === 'donde'}
          onClick={() => setAbierto(abierto === 'donde' ? null : 'donde')}
        />
        {abierto === 'donde' && (
          <Popover>
            <label className="text-xs font-semibold text-obsidiana-800/60 uppercase tracking-wide">
              Ubicación
            </label>
            <input
              type="text"
              value={estado.donde}
              onChange={(e) => actualizar({ donde: e.target.value })}
              placeholder="Catemaco, San Andrés Tuxtla..."
              className="w-full mt-1.5 mb-3 px-3 py-2 rounded-lg border border-obsidiana-900/10 text-sm focus:outline-none focus:border-jungle-400"
            />
            <label className="flex items-center justify-between text-sm text-obsidiana-800">
              ¿Viaje por carretera?
              <button
                type="button"
                onClick={() => actualizar({ porCarretera: !estado.porCarretera })}
                className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${estado.porCarretera ? 'bg-jungle-700' : 'bg-obsidiana-900/15'
                  }`}
                aria-pressed={estado.porCarretera}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${estado.porCarretera ? 'translate-x-[18px]' : 'translate-x-0.5'
                    }`}
                />
              </button>
            </label>
          </Popover>
        )}
      </div>

      {/* CUÁNDO */}
      <div className="relative">
        <Pastilla
          icon={Calendar}
          label={estado.desde ? `${estado.desde}${estado.hasta ? ` – ${estado.hasta}` : ''}` : 'Cuándo'}
          activo={abierto === 'cuando'}
          onClick={() => setAbierto(abierto === 'cuando' ? null : 'cuando')}
        />
        {abierto === 'cuando' && (
          <Popover>
            <label className="text-xs font-semibold text-obsidiana-800/60 uppercase tracking-wide">
              Fechas
            </label>
            <div className="flex items-center gap-2 mt-1.5">
              <input
                type="date"
                value={estado.desde}
                onChange={(e) => actualizar({ desde: e.target.value })}
                className="flex-1 px-2 py-2 rounded-lg border border-obsidiana-900/10 text-sm focus:outline-none focus:border-jungle-400"
              />
              <span className="text-obsidiana-800/40">–</span>
              <input
                type="date"
                value={estado.hasta}
                onChange={(e) => actualizar({ hasta: e.target.value })}
                className="flex-1 px-2 py-2 rounded-lg border border-obsidiana-900/10 text-sm focus:outline-none focus:border-jungle-400"
              />
            </div>
          </Popover>
        )}
      </div>

      {/* QUIÉN */}
      <div className="relative">
        <Pastilla
          icon={Users}
          label={totalQuien > 0 ? `${totalQuien} viajero${totalQuien === 1 ? '' : 's'}` : 'Quién'}
          activo={abierto === 'quien'}
          onClick={() => setAbierto(abierto === 'quien' ? null : 'quien')}
        />
        {abierto === 'quien' && (
          <Popover ancho="w-72">
            <ContadorQuien
              etiqueta="Adultos"
              valor={estado.quien.adultos}
              min={1}
              onCambiar={(n) => actualizar({ quien: { ...estado.quien, adultos: n } })}
            />
            <ContadorQuien
              etiqueta="Niños"
              valor={estado.quien.ninos}
              min={0}
              onCambiar={(n) => actualizar({ quien: { ...estado.quien, ninos: n } })}
            />
            <ContadorQuien
              etiqueta="Bebés"
              valor={estado.quien.bebes}
              min={0}
              onCambiar={(n) => actualizar({ quien: { ...estado.quien, bebes: n } })}
            />
            <label className="flex items-center justify-between text-sm text-obsidiana-800 pt-2 mt-1 border-t border-obsidiana-900/8">
              Mascotas
              <button
                type="button"
                onClick={() => actualizar({ quien: { ...estado.quien, mascotas: !estado.quien.mascotas } })}
                className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${estado.quien.mascotas ? 'bg-jungle-700' : 'bg-obsidiana-900/15'
                  }`}
                aria-pressed={estado.quien.mascotas}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${estado.quien.mascotas ? 'translate-x-[18px]' : 'translate-x-0.5'
                    }`}
                />
              </button>
            </label>
          </Popover>
        )}
      </div>

      {/* PRESUPUESTO */}
      <div className="relative">
        <Pastilla
          icon={DollarSign}
          label={etiquetaPresupuesto}
          activo={abierto === 'presupuesto'}
          onClick={() => setAbierto(abierto === 'presupuesto' ? null : 'presupuesto')}
        />
        {abierto === 'presupuesto' && (
          <Popover ancho="w-56">
            <label className="text-xs font-semibold text-obsidiana-800/60 uppercase tracking-wide mb-2 block">
              Presupuesto
            </label>
            <div className="flex gap-2">
              {([1, 2, 3] as const).map((nivel) => (
                <button
                  key={nivel}
                  type="button"
                  onClick={() => actualizar({ presupuesto: nivel })}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${estado.presupuesto === nivel
                    ? 'bg-jungle-700 border-jungle-700 text-white'
                    : 'border-obsidiana-900/10 text-obsidiana-800/70 hover:border-jungle-300'
                    }`}
                >
                  {'$'.repeat(nivel)}
                </button>
              ))}
            </div>
          </Popover>
        )}
      </div>
    </div>
  );
}

function Pastilla({
  icon: Icon,
  label,
  activo,
  onClick,
}: {
  icon: typeof MapPin;
  label: string;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition-colors ${activo ? 'bg-jungle-50 text-jungle-800' : 'text-obsidiana-800/80 hover:bg-obsidiana-900/5'
        }`}
    >
      <Icon size={15} className="flex-shrink-0" />
      <span className="max-w-[9rem] truncate">{label}</span>
      <ChevronDown size={13} className={`flex-shrink-0 transition-transform ${activo ? 'rotate-180' : ''}`} />
    </button>
  );
}

function Popover({ children, ancho = 'w-64' }: { children: React.ReactNode; ancho?: string }) {
  return (
    <div
      className={`absolute top-[calc(100%+8px)] left-0 ${ancho} bg-white rounded-2xl shadow-xl border border-obsidiana-900/8 p-4 z-50 animate-fade-in`}
    >
      {children}
    </div>
  );
}

function ContadorQuien({
  etiqueta,
  valor,
  min,
  onCambiar,
}: {
  etiqueta: string;
  valor: number;
  min: number;
  onCambiar: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm text-obsidiana-800">
      {etiqueta}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onCambiar(Math.max(min, valor - 1))}
          disabled={valor <= min}
          className="w-7 h-7 rounded-full border border-obsidiana-900/15 flex items-center justify-center text-obsidiana-800/70 disabled:opacity-30 hover:border-jungle-400 transition-colors"
        >
          <Minus size={13} />
        </button>
        <span className="w-4 text-center font-semibold">{valor}</span>
        <button
          type="button"
          onClick={() => onCambiar(valor + 1)}
          className="w-7 h-7 rounded-full border border-obsidiana-900/15 flex items-center justify-center text-obsidiana-800/70 hover:border-jungle-400 transition-colors"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}
