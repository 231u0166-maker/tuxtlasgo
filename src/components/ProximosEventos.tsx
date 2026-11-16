// Franja "Próximos eventos" de la pantalla de Inicio. Solo se dibuja si hay
// eventos publicados (nunca una sección vacía que prometa algo que no existe).
// Sin red usa la última lista guardada (ver lib/agendaEventos.ts).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { cap, cargarAgenda, fechaLocal, formatearRango, localeDe, type EventoAgenda } from '../lib/agendaEventos';

export default function ProximosEventos() {
  const { t, idioma } = useI18n();
  const [eventos, setEventos] = useState<EventoAgenda[]>([]);

  useEffect(() => {
    let vivo = true;
    cargarAgenda().then((r) => { if (vivo) setEventos(r.eventos.slice(0, 3)); });
    return () => { vivo = false; };
  }, []);

  if (eventos.length === 0) return null;
  const loc = localeDe(idioma);

  return (
    <section className="px-4 lg:px-8 mt-6" aria-labelledby="titulo-proximos-eventos">
      <div className="flex items-center justify-between mb-3">
        <h2 id="titulo-proximos-eventos" className="font-display font-bold text-lg text-obsidiana-900">
          {t('Próximos eventos')}
        </h2>
        <Link to="/eventos" className="flex items-center gap-0.5 text-sm font-semibold text-jungle-700 hover:text-jungle-900">
          {t('Ver calendario')}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {eventos.map((e) => {
          const f = fechaLocal(e.fecha);
          return (
            <li key={e.id} className="min-w-0">
              <Link
                to="/eventos"
                className="flex min-w-0 gap-3 items-center bg-white rounded-2xl border border-jungle-100 hover:border-jungle-300 hover:shadow-md transition-all p-3"
              >
                <div className="flex-shrink-0 w-14 rounded-xl bg-jungle-50 text-jungle-900 flex flex-col items-center justify-center py-1.5" aria-hidden="true">
                  <span className="text-[10px] font-bold uppercase tracking-wide">{f.toLocaleDateString(loc, { month: 'short' }).replace('.', '')}</span>
                  <span className="font-display font-extrabold text-xl leading-none">{f.getDate()}</span>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-obsidiana-900 text-sm leading-snug line-clamp-2">{e.titulo}</p>
                  <p className="text-xs text-obsidiana-800/70 mt-0.5 flex items-center gap-1">
                    <CalendarDays size={11} aria-hidden="true" className="flex-shrink-0" />
                    <span className="truncate">{cap(formatearRango(e, idioma))}</span>
                  </p>
                  {(e.lugar || e.municipio) && (
                    <p className="text-xs text-obsidiana-800/70 flex items-center gap-1">
                      <MapPin size={11} aria-hidden="true" className="flex-shrink-0" />
                      <span className="truncate">{[e.lugar, e.municipio].filter(Boolean).join(', ')}</span>
                    </p>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
