import { useEffect, useState } from 'react';
import { Heart, Route, Trash2, Calendar, MapPin, Navigation2 } from 'lucide-react'; import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { LUGARES, type Lugar } from '../data/lugares';
import PlaceCard from './PlaceCard';

interface Props {
  onVerLugar: (lugar: Lugar) => void;
  onVerLugarEnMapa?: (lugar: Lugar) => void;
  onVerRutaEnMapa?: (lugares: Lugar[]) => void;
}

export default function FavoritesScreen({ onVerLugar, onVerLugarEnMapa, onVerRutaEnMapa }: Props) {
  const [tab, setTab] = useState<'favoritos' | 'rutas'>('favoritos');

  const favoritos = useLiveQuery(async () => {
    const favs = await db.favoritos.orderBy('agregadoEn').reverse().toArray();
    const ids = new Set(favs.map((f) => f.id));
    return LUGARES.filter((l) => ids.has(l.id));
  }, []);

  const rutas = useLiveQuery(
    () => db.rutas.orderBy('creadaEn').reverse().toArray(),
    []
  );

  const eliminarRuta = async (id: number) => {
    if (confirm('¿Eliminar esta ruta?')) {
      await db.rutas.delete(id);
    }
  };

  return (
    <div className="pb-24 lg:pb-6">
      <header className="bg-gradient-to-br from-jungle-700 to-jungle-900 text-white px-4 pt-6 pb-5 rounded-b-3xl">
        <h1 className="font-display font-extrabold text-2xl">Mis lugares</h1>
        <p className="text-sm text-jungle-100 opacity-90 mb-4">
          Todo se guarda en tu dispositivo, incluso sin conexión.
        </p>

        <div className="flex bg-white/15 backdrop-blur rounded-xl p-1">
          <button
            onClick={() => setTab('favoritos')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${tab === 'favoritos' ? 'bg-white text-jungle-900' : 'text-white'
              }`}
          >
            <Heart size={14} /> Favoritos ({favoritos?.length || 0})
          </button>
          <button
            onClick={() => setTab('rutas')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${tab === 'rutas' ? 'bg-white text-jungle-900' : 'text-white'
              }`}
          >
            <Route size={14} /> Rutas ({rutas?.length || 0})
          </button>
        </div>
      </header>

      <div className="px-4 mt-5">
        {tab === 'favoritos' && (
          <>
            {!favoritos || favoritos.length === 0 ? (
              <EmptyState
                icon={Heart}
                titulo="Aún no tienes favoritos"
                texto='Toca el ❤️ en cualquier lugar para guardarlo aquí.'
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {favoritos.map((l) => (
                  <PlaceCard key={l.id} lugar={l} onClick={() => onVerLugar(l)} onVerMapa={onVerLugarEnMapa} />))}
              </div>
            )}
          </>
        )}

        {tab === 'rutas' && (
          <>
            {!rutas || rutas.length === 0 ? (
              <EmptyState
                icon={Route}
                titulo="No tienes rutas guardadas"
                texto='Habla con el asistente y arma una ruta personalizada.'
              />
            ) : (
              <div className="space-y-4">
                {rutas.map((r) => (
                  <div
                    key={r.id}
                    className="bg-white rounded-2xl p-4 border border-jungle-100 shadow-sm"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-display font-bold text-jungle-950">
                          {r.nombre}
                        </div>
                        <div className="text-xs text-jungle-600 flex items-center gap-1 mt-0.5">
                          <Calendar size={11} />
                          {new Date(r.creadaEn).toLocaleDateString('es-MX', {
                            day: 'numeric',
                            month: 'long',
                          })}{' '}
                          · {r.dias.length} día{r.dias.length > 1 ? 's' : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => r.id && eliminarRuta(r.id)}
                        className="text-jungle-400 hover:text-red-500 p-1"
                        aria-label="Eliminar ruta"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {/* Botón Ver en mapa — muestra todos los lugares de la ruta */}
                    {onVerRutaEnMapa && (() => {
                      const todosLugares = r.dias.flatMap(d =>
                        d.lugaresIds.map(id => LUGARES.find(l => l.id === id)).filter(Boolean) as Lugar[]
                      );
                      return todosLugares.length >= 2 ? (
                        <button
                          onClick={() => onVerRutaEnMapa(todosLugares)}
                          className="w-full bg-jungle-700 hover:bg-jungle-800 text-white text-xs font-semibold py-2 flex items-center justify-center gap-1.5 rounded-xl mb-2 transition-colors"
                        >
                          <MapPin size={12} />
                          Ver ruta en el mapa
                        </button>
                      ) : null;
                    })()}
                    {r.dias.map((d) => {
                      const lugaresDia = d.lugaresIds
                        .map((id) => LUGARES.find((l) => l.id === id))
                        .filter(Boolean) as Lugar[];
                      return (
                        <div
                          key={d.dia}
                          className="border-t border-jungle-100 pt-3 mt-3"
                        >
                          <div className="text-xs font-bold text-jungle-700 uppercase tracking-wide mb-2">
                            Día {d.dia}
                          </div>
                          <div className="space-y-1.5">
                            {lugaresDia.map((l) => (
                              <div key={l.id} className="w-full flex items-center gap-2 text-sm text-jungle-900 py-1">
                                <button
                                  onClick={() => onVerLugar(l)}
                                  className="flex-1 text-left flex items-center gap-2 hover:text-jungle-700 min-w-0"
                                >
                                  <span className="w-1.5 h-1.5 bg-jungle-500 rounded-full flex-shrink-0" />
                                  <span className="truncate">{l.nombre}</span>
                                  <span className="text-xs text-jungle-500 ml-auto flex-shrink-0">
                                    {l.duracionSugerida}
                                  </span>
                                </button>
                                {onVerLugarEnMapa && (
                                  <button
                                    onClick={() => onVerLugarEnMapa(l)}
                                    className="flex-shrink-0 w-7 h-7 rounded-full bg-jungle-50 hover:bg-jungle-100 flex items-center justify-center text-jungle-700"
                                    aria-label={`Ver mapa hacia ${l.nombre}`}
                                    title="Ver mapa desde donde estás"
                                  >
                                    <Navigation2 size={13} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  titulo,
  texto,
}: {
  icon: typeof Heart;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="text-center py-16 text-jungle-700">
      <Icon className="mx-auto mb-4 opacity-30" size={48} />
      <p className="font-semibold text-jungle-900">{titulo}</p>
      <p className="text-sm opacity-70 mt-1">{texto}</p>
    </div>
  );
}