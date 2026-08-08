import { useState } from 'react';
import { MapPin, Calendar, Users, DollarSign, ChevronDown, Minus, Plus, X, SlidersHorizontal } from 'lucide-react';
import CalendarioRango from './CalendarioRango';

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
// filtro abre un MODAL EMERGENTE real: fondo oscurecido cubriendo
// toda la pantalla, tarjeta centrada en el viewport (NO anclada
// debajo de la pastilla como un menú desplegable — corregido a
// propósito, así se sentía "encerrado"), título + botón de cerrar
// circular, ancho fijo 340px, radio 20px, sombra de tarjeta
// flotante, campos con fondo amate-50, botón de confirmar explícito.
export const RADIO_MODAL = 'rounded-[20px]';
export const SOMBRA_MODAL = 'shadow-[0_24px_60px_-8px_rgba(12,10,9,0.35)]';

export interface QuienViaja {
  adultos: number;
  ninos: number;
  bebes: number;
  // Contador, no un sí/no — así lo muestra mindtrip (imagen 5:
  // "¿Va a llevar un animal de servicio?" con +/-, no un switch).
  mascotas: number;
}

export interface FiltrosViajeValor {
  donde: string;
  porCarretera: boolean;
  desde: string;
  hasta: string;
  quien: QuienViaja;
  presupuesto: 1 | 2 | 3;
  // Preferencias libres — "cuéntanos lo que sabes hasta ahora" de la
  // referencia. Se captura aquí y queda visible/editable, pero por
  // ahora NO se conecta a la generación de rutas (chatbot.ts) — eso
  // es un paso aparte, ver aviso en AppShell.
  notas: string;
}

const QUIEN_DEFAULT: QuienViaja = { adultos: 1, ninos: 0, bebes: 0, mascotas: 0 };

const VALOR_DEFAULT: FiltrosViajeValor = {
  donde: '',
  porCarretera: false,
  desde: '',
  hasta: '',
  quien: QUIEN_DEFAULT,
  presupuesto: 2,
  notas: '',
};

interface Props {
  valor?: Partial<FiltrosViajeValor>;
  onCambiar?: (valor: FiltrosViajeValor) => void;
}

type PopoverAbierto = 'donde' | 'cuando' | 'quien' | 'presupuesto' | 'todo' | null;

export default function FiltrosViaje({ valor, onCambiar }: Props) {
  const [estado, setEstado] = useState<FiltrosViajeValor>({ ...VALOR_DEFAULT, ...valor });
  const [abierto, setAbierto] = useState<PopoverAbierto>(null);

  const actualizar = (parcial: Partial<FiltrosViajeValor>) => {
    setEstado((prev) => {
      const siguiente = { ...prev, ...parcial };
      onCambiar?.(siguiente);
      return siguiente;
    });
  };

  const totalQuien = estado.quien.adultos + estado.quien.ninos + estado.quien.bebes;
  const etiquetaPresupuesto = { 1: '$', 2: '$$', 3: '$$$' }[estado.presupuesto];
  const cerrar = () => setAbierto(null);

  return (
    <>
      {/* Escritorio — igual que siempre, sin tocar */}
      <div className="hidden lg:inline-flex flex-wrap items-center gap-0.5 bg-white rounded-full border border-obsidiana-900/10 p-[5px] shadow-[0_2px_10px_rgba(28,25,23,0.05)]">
        <Pastilla
          icon={MapPin}
          label={estado.donde || 'Dónde'}
          activo={abierto === 'donde'}
          onClick={() => setAbierto('donde')}
        />
        <Pastilla
          icon={Calendar}
          label={estado.desde ? `${estado.desde}${estado.hasta ? ` – ${estado.hasta}` : ''}` : 'Cuándo'}
          activo={abierto === 'cuando'}
          onClick={() => setAbierto('cuando')}
        />
        <Pastilla
          icon={Users}
          label={totalQuien > 0 ? `${totalQuien} viajero${totalQuien === 1 ? '' : 's'}` : 'Quién'}
          activo={abierto === 'quien'}
          onClick={() => setAbierto('quien')}
        />
        <Pastilla
          icon={DollarSign}
          label={etiquetaPresupuesto}
          activo={abierto === 'presupuesto'}
          onClick={() => setAbierto('presupuesto')}
        />
      </div>

      {/* Móvil — un solo ícono en vez de 4 pastillas, abre un
          formulario consolidado (todo junto, como la referencia). */}
      <button
        type="button"
        onClick={() => setAbierto('todo')}
        className="lg:hidden w-9 h-9 flex items-center justify-center rounded-full text-white/90 hover:bg-white/10 transition-colors flex-shrink-0"
        aria-label="Filtros del viaje"
        title="Filtros del viaje"
      >
        <SlidersHorizontal size={18} />
      </button>

      {/* Un solo overlay compartido — el modal que corresponda se
          decide por `abierto`, en vez de vivir anclado a su pastilla.
          Así "emerge" sobre toda la pantalla, no como submenú. */}
      {abierto && (
        <Overlay onCerrar={cerrar}>
          {abierto === 'donde' && (
            <Modal titulo="Dónde" subtitulo="Cubrimos Los Tuxtlas — Catemaco, San Andrés y Santiago" onCerrar={cerrar}>
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
              <BotonGuardar onClick={cerrar} />
            </Modal>
          )}

          {abierto === 'cuando' && (
            <Modal titulo="Cuándo" onCerrar={cerrar}>
              <div className="mb-5">
                <CalendarioRango
                  desde={estado.desde}
                  hasta={estado.hasta}
                  onCambiar={(desde, hasta) => actualizar({ desde, hasta })}
                />
              </div>
              <BotonGuardar etiqueta="Actualizar" onClick={cerrar} />
            </Modal>
          )}

          {abierto === 'quien' && (
            <Modal
              titulo="Quién"
              subtitulo={`${totalQuien} viajero${totalQuien === 1 ? '' : 's'}`}
              onCerrar={cerrar}
            >
              <div className="space-y-1 mb-1">
                <ContadorQuien
                  etiqueta="Adultos"
                  nota="A partir de 13 años"
                  valor={estado.quien.adultos}
                  min={1}
                  onCambiar={(n) => actualizar({ quien: { ...estado.quien, adultos: n } })}
                />
                <ContadorQuien
                  etiqueta="Niños"
                  nota="De 2 a 12 años"
                  valor={estado.quien.ninos}
                  min={0}
                  onCambiar={(n) => actualizar({ quien: { ...estado.quien, ninos: n } })}
                />
                <ContadorQuien
                  etiqueta="Bebés"
                  nota="Menores de 2 años"
                  valor={estado.quien.bebes}
                  min={0}
                  onCambiar={(n) => actualizar({ quien: { ...estado.quien, bebes: n } })}
                />
                <ContadorQuien
                  etiqueta="Mascotas"
                  nota="¿Va a llevar un animal de servicio?"
                  valor={estado.quien.mascotas}
                  min={0}
                  onCambiar={(n) => actualizar({ quien: { ...estado.quien, mascotas: n } })}
                />
              </div>
              <BotonGuardar etiqueta="Actualizar" onClick={cerrar} />
            </Modal>
          )}

          {abierto === 'presupuesto' && (
            <Modal titulo="Presupuesto" onCerrar={cerrar}>
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
              <BotonGuardar onClick={cerrar} />
            </Modal>
          )}
        </Overlay>
      )}

      {/* Móvil — formulario consolidado, todo en una sola hoja que
          entra desde abajo (no 4 modales separados). Mismos
          subcomponentes de arriba, reusados tal cual. */}
      {abierto === 'todo' && (
        <HojaInferior onCerrar={cerrar}>
          <div className="max-h-[75vh] overflow-y-auto px-5 pt-2 pb-5">
            <label className="text-xs font-semibold text-obsidiana-800/50 uppercase tracking-wide">
              Dónde
            </label>
            <Campo
              placeholder="Catemaco, San Andrés Tuxtla..."
              value={estado.donde}
              onChange={(v) => actualizar({ donde: v })}
            />

            <label className="text-xs font-semibold text-obsidiana-800/50 uppercase tracking-wide">
              Cuándo
            </label>
            <div className="mb-5 mt-1.5">
              <CalendarioRango
                desde={estado.desde}
                hasta={estado.hasta}
                onCambiar={(desde, hasta) => actualizar({ desde, hasta })}
              />
            </div>

            <label className="text-xs font-semibold text-obsidiana-800/50 uppercase tracking-wide">
              Quién viaja
            </label>
            <div className="space-y-1 mb-5 mt-1">
              <ContadorQuien
                etiqueta="Adultos"
                nota="A partir de 13 años"
                valor={estado.quien.adultos}
                min={1}
                onCambiar={(n) => actualizar({ quien: { ...estado.quien, adultos: n } })}
              />
              <ContadorQuien
                etiqueta="Niños"
                nota="De 2 a 12 años"
                valor={estado.quien.ninos}
                min={0}
                onCambiar={(n) => actualizar({ quien: { ...estado.quien, ninos: n } })}
              />
              <ContadorQuien
                etiqueta="Bebés"
                nota="Menores de 2 años"
                valor={estado.quien.bebes}
                min={0}
                onCambiar={(n) => actualizar({ quien: { ...estado.quien, bebes: n } })}
              />
              <ContadorQuien
                etiqueta="Mascotas"
                nota="¿Va a llevar un animal de servicio?"
                valor={estado.quien.mascotas}
                min={0}
                onCambiar={(n) => actualizar({ quien: { ...estado.quien, mascotas: n } })}
              />
            </div>

            <label className="text-xs font-semibold text-obsidiana-800/50 uppercase tracking-wide mb-2 block">
              Presupuesto
            </label>
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

            <label className="text-xs font-semibold text-obsidiana-800/50 uppercase tracking-wide">
              Preferencias adicionales
            </label>
            <textarea
              value={estado.notas}
              onChange={(e) => actualizar({ notas: e.target.value })}
              placeholder="Cuéntanos lo que sabes hasta ahora: compañeros de viaje, cosas que no te puedes perder, preferencias..."
              rows={3}
              maxLength={500}
              className="w-full mt-1.5 mb-1 px-3.5 py-3 rounded-xl border border-obsidiana-900/10 bg-amate-50 text-sm resize-none focus:outline-none focus:border-jungle-400"
            />
            <p className="text-[11px] text-obsidiana-800/40 text-right mb-4">
              {estado.notas.length}/500 caracteres
            </p>

            <BotonGuardar etiqueta="Guardar" onClick={cerrar} />
          </div>
        </HojaInferior>
      )}
    </>
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

// Fondo oscurecido a pantalla completa + centrado del modal. `fixed`
// e independiente de dónde vive la pastilla en el layout — así se
// ve igual sin importar si el filtro está arriba del chat, del mapa,
// o en cualquier otra pantalla que lo use más adelante.
export function Overlay({ onCerrar, children }: { onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[200] bg-obsidiana-950/45 backdrop-blur-[2px] flex items-center justify-center p-4 animate-fade-in"
      onClick={onCerrar}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

// Hoja anclada abajo — para el formulario consolidado de móvil.
// Entra deslizándose desde abajo (nunca transparente, mismo cuidado
// que el menú de NavbarLanding), fondo oscurecido detrás, tocar
// fuera cierra.
function HojaInferior({ onCerrar, children }: { onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[200]">
      <div
        className="absolute inset-0 bg-obsidiana-950/45 animate-fade-in"
        onClick={onCerrar}
        aria-hidden="true"
      />
      <div
        className={`absolute inset-x-0 bottom-0 ${RADIO_MODAL} rounded-b-none animate-slide-in-bottom`}
        style={{ backgroundColor: '#ffffff' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-obsidiana-900/15" />
        </div>
        <div className="flex items-center justify-between px-5 pb-2">
          <span className="font-display font-bold text-[15px] text-obsidiana-900">Tu viaje</span>
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
    </div>
  );
}

export function Modal({
  titulo,
  subtitulo,
  onCerrar,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`w-[340px] max-w-[90vw] bg-white ${RADIO_MODAL} ${SOMBRA_MODAL} p-[22px]`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="block font-display font-bold text-[15px] text-obsidiana-900">{titulo}</span>
          {subtitulo && (
            <span className="block text-[12.5px] text-obsidiana-800/50 mt-0.5">{subtitulo}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="w-[26px] h-[26px] rounded-full bg-amate-100 flex items-center justify-center text-obsidiana-800/50 hover:text-obsidiana-900 transition-colors flex-shrink-0"
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

function BotonGuardar({ onClick, etiqueta = 'Guardar' }: { onClick: () => void; etiqueta?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full py-3 rounded-xl bg-jungle-700 hover:bg-jungle-800 text-white font-semibold text-sm transition-colors"
    >
      {etiqueta}
    </button>
  );
}

function ContadorQuien({
  etiqueta,
  nota,
  valor,
  min,
  onCambiar,
}: {
  etiqueta: string;
  nota?: string;
  valor: number;
  min: number;
  onCambiar: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm text-obsidiana-800">
      <div>
        <div>{etiqueta}</div>
        {nota && <div className="text-[12px] text-obsidiana-800/45 mt-0.5">{nota}</div>}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
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
