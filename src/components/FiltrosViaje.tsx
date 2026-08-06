import { useEffect, useRef, useState } from 'react';
import { MapPin, Calendar, Users, DollarSign, ChevronDown, Minus, Plus, X } from 'lucide-react';

// ============================================================
// BARRA DE FILTROS — Dónde / Cuándo / Quién / Presupuesto
// ============================================================
// Base-visual SECTION-04. Es el molde visual nada más: guarda su
// propio estado y lo expone por onCambiar, pero no llama a
// chatbot.ts/routing.ts directamente — esa conexión vive en AppShell
// (ver prefsDesdeFiltros en ChatAssistant.tsx).
//
// REGLAS "OPCIÓN A" (ver filtro-claro-vs-oscuro.html, aprobado) — se
// mantiene la identidad clara amate/jungle de siempre, pero cada
// popover es un MODAL real, no un tooltip chiquito: título + botón
// de cerrar circular, ancho fijo consistente (340px, no variable por
// contenido), radio 20px, sombra propia de tarjeta flotante, campos
// con fondo amate-50 en vez de blanco liso, y un botón "Guardar"
// explícito que cierra el modal — así se ve deliberado, no un
// dropdown genérico de librería.
export const RADIO_MODAL = 'rounded-[20px]';
export const SOMBRA_MODAL = 'shadow-[0_20px_45px_-12px_rgba(28,25,23,0.18)]';

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
      className="inline-flex flex-wrap items-center gap-0.5 bg-white rounded-full border border-obsidiana-900/10 p-[5px] shadow-[0_2px_10px_rgba(28,25,23,0.05)]"
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
          <Modal titulo="Dónde" onCerrar={() => setAbierto(null)}>
            <Campo
              placeholder="Catemaco, San Andrés Tuxtla..."
              value={estado.donde}
              onChange={(v) => actualizar({ donde: v })}
            />
            <FilaToggle
              etiqueta="¿Viaje por carretera?"
              valor={estado.porCarretera}
              onCambiar={(v) => actualizar({ porCarretera: v })}
            />
            <BotonGuardar onClick={() => setAbierto(null)} />
          </Modal>
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
          <Modal titulo="Cuándo" onCerrar={() => setAbierto(null)}>
            <div className="flex items-center gap-2 mb-5">
              <input
                type="date"
                value={estado.desde}
                onChange={(e) => actualizar({ desde: e.target.value })}
                className="flex-1 min-w-0 px-3.5 py-3 rounded-xl border border-obsidiana-900/10 bg-amate-50 text-sm focus:outline-none focus:border-jungle-400"
              />
              <span className="text-obsidiana-800/30 flex-shrink-0">–</span>
              <input
                type="date"
                value={estado.hasta}
                onChange={(e) => actualizar({ hasta: e.target.value })}
                className="flex-1 min-w-0 px-3.5 py-3 rounded-xl border border-obsidiana-900/10 bg-amate-50 text-sm focus:outline-none focus:border-jungle-400"
              />
            </div>
            <BotonGuardar onClick={() => setAbierto(null)} />
          </Modal>
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
          <Modal titulo="Quién viaja" onCerrar={() => setAbierto(null)}>
            <div className="space-y-0.5 mb-1">
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
            </div>
            <div className="pt-3 mt-2 border-t border-obsidiana-900/8">
              <FilaToggle
                etiqueta="Mascotas"
                valor={estado.quien.mascotas}
                onCambiar={(v) => actualizar({ quien: { ...estado.quien, mascotas: v } })}
              />
            </div>
            <BotonGuardar onClick={() => setAbierto(null)} />
          </Modal>
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
          <Modal titulo="Presupuesto" onCerrar={() => setAbierto(null)}>
            <div className="flex gap-2 mb-5">
              {([1, 2, 3] as const).map((nivel) => (
                <button
                  key={nivel}
                  type="button"
                  onClick={() => actualizar({ presupuesto: nivel })}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold border transition-colors ${estado.presupuesto === nivel
                    ? 'bg-jungle-700 border-jungle-700 text-white'
                    : 'border-obsidiana-900/10 bg-amate-50 text-obsidiana-800/70 hover:border-jungle-300'
                    }`}
                >
                  {'$'.repeat(nivel)}
                </button>
              ))}
            </div>
            <BotonGuardar onClick={() => setAbierto(null)} />
          </Modal>
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
      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13.5px] font-medium transition-colors ${activo ? 'bg-jungle-50 text-jungle-700' : 'text-obsidiana-800/75 hover:bg-obsidiana-900/5'
        }`}
    >
      <Icon size={15} className="flex-shrink-0" />
      <span className="max-w-[9rem] truncate">{label}</span>
      <ChevronDown size={13} className={`flex-shrink-0 transition-transform ${activo ? 'rotate-180' : ''}`} />
    </button>
  );
}

// Modal real — no un dropdown de dos líneas de CSS. Ancho fijo
// (340px) en las cuatro instancias, a propósito: mindtrip nunca hace
// que el popover "respire" según su contenido, y esa consistencia es
// justo lo que se sentía descuidado antes.
function Modal({
  titulo,
  onCerrar,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute top-[calc(100%+10px)] left-0 w-[340px] bg-white border border-obsidiana-900/8 ${RADIO_MODAL} ${SOMBRA_MODAL} p-[22px] z-50 animate-fade-in`}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="font-display font-bold text-[15px] text-obsidiana-900">{titulo}</span>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="w-[26px] h-[26px] rounded-full bg-amate-100 flex items-center justify-center text-obsidiana-800/50 hover:text-obsidiana-900 transition-colors"
        >
          <X size={13} />
        </button>
      </div>
      {children}
    </div>
  );
}

function Campo({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full mb-5 px-3.5 py-3 rounded-xl border border-obsidiana-900/10 bg-amate-50 text-sm focus:outline-none focus:border-jungle-400"
    />
  );
}

function FilaToggle({
  etiqueta,
  valor,
  onCambiar,
}: {
  etiqueta: string;
  valor: boolean;
  onCambiar: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between text-[13.5px] text-obsidiana-800 mb-5 last:mb-0">
      {etiqueta}
      <button
        type="button"
        onClick={() => onCambiar(!valor)}
        className={`w-[38px] h-[22px] rounded-full transition-colors relative flex-shrink-0 ${valor ? 'bg-jungle-700' : 'bg-obsidiana-900/15'
          }`}
        aria-pressed={valor}
      >
        <span
          className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${valor ? 'translate-x-[18px]' : 'translate-x-0.5'
            }`}
        />
      </button>
    </label>
  );
}

function BotonGuardar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full py-3 rounded-xl bg-jungle-700 hover:bg-jungle-800 text-white font-semibold text-sm transition-colors"
    >
      Guardar
    </button>
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
    <div className="flex items-center justify-between py-2 text-sm text-obsidiana-800">
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
