import { useMemo } from 'react';
import { Compass, MapPin, X } from 'lucide-react';
import { useT } from '../lib/i18n';
import { CATEGORIAS, type Lugar } from '../data/lugares';

// "Te puede interesar": aviso breve que se muestra UNA vez por sesión al
// abrir el asistente, cuando hay servicios registrados fuera de Los
// Tuxtlas (ej. un hotel en Villahermosa). TuxtlasGO nació para impulsar
// una región, pero la plataforma está pensada para crecer: quien viene
// de otro estado puede querer ver también lo que hay en otros lugares.
//
// Es una OFERTA, no una recomendación: el chat y las rutas siguen
// hablando solo de Los Tuxtlas. Si el turista dice que no, todo sigue
// igual; si dice que sí, el mapa se libera para ver esa zona.

interface Props {
  externos: Lugar[];
  onExplorar: (zona: string, lugares: Lugar[]) => void;
  onCerrar: () => void;
}

// "Villahermosa, Tabasco" -> esa zona; un servicio con etiqueta rara
// (municipio de Los Tuxtlas pero coordenadas de fuera) va a "Otra
// ubicación" en vez de repetir una etiqueta que no es cierta.
function nombreDeZona(l: Lugar): string {
  return l.municipio && l.municipio.includes(',') ? l.municipio : 'Otra ubicación';
}

export default function OtrasZonasOferta({ externos, onExplorar, onCerrar }: Props) {
  const t = useT();

  const zonas = useMemo(() => {
    const mapa = new Map<string, Lugar[]>();
    for (const l of externos) {
      const z = nombreDeZona(l);
      mapa.set(z, [...(mapa.get(z) ?? []), l]);
    }
    return [...mapa.entries()];
  }, [externos]);

  if (zonas.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('Te puede interesar')}
    >
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto animate-fade-in">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-jungle-100 flex items-center justify-center flex-shrink-0">
              <Compass size={20} className="text-jungle-700" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-jungle-950 leading-tight">
                {t('Te puede interesar')}
              </h3>
              <p className="text-xs text-jungle-600">
                {t('También hay servicios registrados fuera de Los Tuxtlas')}
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            aria-label={t('Cerrar')}
            className="w-8 h-8 flex items-center justify-center rounded-full text-jungle-600 hover:bg-jungle-50 flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 mb-4">
          {zonas.map(([zona, lugares]) => (
            <div key={zona} className="border border-jungle-100 rounded-xl p-3">
              <div className="flex items-center gap-1.5 font-semibold text-sm text-jungle-900 mb-2">
                <MapPin size={14} className="text-jungle-600" />
                {t(zona)}
                <span className="text-xs font-normal text-jungle-500">
                  · {lugares.length} {lugares.length === 1 ? t('servicio') : t('servicios')}
                </span>
              </div>
              <ul className="space-y-1 mb-3">
                {lugares.slice(0, 3).map((l) => {
                  const cat = CATEGORIAS.find((c) => c.id === l.categoria);
                  return (
                    <li key={l.id} className="text-sm text-jungle-800 truncate">
                      <span className="mr-1.5">{cat?.emoji}</span>
                      {l.nombre}
                    </li>
                  );
                })}
                {lugares.length > 3 && (
                  <li className="text-xs text-jungle-500">+ {lugares.length - 3} {t('más')}</li>
                )}
              </ul>
              <button
                onClick={() => onExplorar(zona, lugares)}
                className="w-full bg-jungle-700 hover:bg-jungle-800 text-white py-2 rounded-lg text-sm font-semibold"
              >
                {t('Ver en el mapa')}
              </button>
            </div>
          ))}
        </div>

        <p className="text-xs text-jungle-500 mb-3 text-center">
          {t('Fuera de Los Tuxtlas el mapa necesita internet; el mapa sin conexión cubre solo la región.')}
        </p>

        <button
          onClick={onCerrar}
          className="w-full border-2 border-jungle-200 text-jungle-800 py-2.5 rounded-xl font-semibold text-sm"
        >
          {t('No, gracias — seguir en Los Tuxtlas')}
        </button>
      </div>
    </div>
  );
}
