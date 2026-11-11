import { motion } from 'motion/react';
import { NIVELES_PRECIO, PRECIO_PASO, PRECIO_TOPE, TASA_USD_REFERENCIA, type NivelPrecio } from '../lib/precio';

// Selector de rango de precios: 4 niveles que precargan un rango y dos
// deslizadores para afinarlo. Lo usan el registro de prestador y Mi Perfil.

interface Props {
  nivel: NivelPrecio;
  min: number;
  max: number;
  onChange: (v: { nivel: NivelPrecio; min: number; max: number }) => void;
}

export default function SelectorRangoPrecio({ nivel, min, max, onChange }: Props) {
  function elegirNivel(id: NivelPrecio) {
    const n = NIVELES_PRECIO.find((x) => x.id === id)!;
    onChange({ nivel: id, min: n.min, max: n.max });
  }

  function cambiar(cual: 'min' | 'max', v: number) {
    let nuevoMin = min;
    let nuevoMax = max;
    if (cual === 'min') { nuevoMin = v; if (nuevoMax < v) nuevoMax = v; }
    else { nuevoMax = v; if (nuevoMin > v) nuevoMin = v; }
    onChange({ nivel, min: nuevoMin, max: nuevoMax });
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {NIVELES_PRECIO.map((n, i) => {
          const activo = nivel === n.id;
          return (
            <motion.button
              key={n.id} type="button"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 * i, duration: 0.3 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => elegirNivel(n.id)}
              aria-pressed={activo}
              className={`rounded-2xl border-2 p-4 text-left transition-colors ${activo ? 'border-jungle-600 bg-jungle-600 text-white shadow-lg' : 'border-jungle-100 bg-white/80 text-obsidiana-900 hover:border-jungle-300'}`}
            >
              <span className="block font-display font-extrabold text-2xl tracking-wider">
                {[0, 1, 2, 3].map((k) => (
                  <span key={k} className={k < n.simbolo.length ? '' : activo ? 'opacity-25' : 'text-jungle-200'}>$</span>
                ))}
              </span>
              <span className="block font-bold text-sm mt-1">{n.label}</span>
              <span className={`block text-xs mt-0.5 ${activo ? 'text-white/80' : 'text-obsidiana-600'}`}>{n.ejemplo}</span>
            </motion.button>
          );
        })}
      </div>

      <div className="bg-white/80 border border-jungle-100 rounded-2xl p-5">
        <div className="text-center mb-5">
          <motion.p key={`${min}-${max}`} initial={{ scale: 0.96 }} animate={{ scale: 1 }}
            className="font-display font-extrabold text-3xl sm:text-4xl text-jungle-700">
            ${min.toLocaleString('es-MX')} – ${max.toLocaleString('es-MX')}
            <span className="text-base font-bold text-jungle-500 ml-1.5">MXN</span>
          </motion.p>
          <p className="text-xs text-obsidiana-600 mt-1">
            ≈ ${Math.round(min / TASA_USD_REFERENCIA)} – ${Math.round(max / TASA_USD_REFERENCIA)} USD (referencia, no en vivo)
          </p>
        </div>
        <label className="block mb-4">
          <span className="flex justify-between text-xs font-semibold text-obsidiana-600 mb-1"><span>Desde</span><span>${min.toLocaleString('es-MX')}</span></span>
          <input type="range" min={0} max={PRECIO_TOPE} step={PRECIO_PASO} value={min}
            onChange={(e) => cambiar('min', Number(e.target.value))}
            className="w-full h-2 accent-jungle-600" aria-label="Precio desde" />
        </label>
        <label className="block">
          <span className="flex justify-between text-xs font-semibold text-obsidiana-600 mb-1"><span>Hasta</span><span>${max.toLocaleString('es-MX')}{max >= PRECIO_TOPE ? '+' : ''}</span></span>
          <input type="range" min={0} max={PRECIO_TOPE} step={PRECIO_PASO} value={max}
            onChange={(e) => cambiar('max', Number(e.target.value))}
            className="w-full h-2 accent-jungle-600" aria-label="Precio hasta" />
        </label>
      </div>
    </div>
  );
}
