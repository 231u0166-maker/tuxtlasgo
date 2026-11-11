import { Sparkles } from 'lucide-react';
import PlaceCard from './PlaceCard';
import { BarraPregunta } from './ExploreScreen';
import { useT } from '../lib/i18n';
import type { Lugar } from '../data/lugares';
import { getCatalogoRegion } from '../lib/chatbot';

// ============================================================
// INICIO — pantalla nueva (no existía)
// ============================================================
// Instrucciones: "mostrará todo los servicios y de extra: para ti en
// la ubicación seleccionada, imágenes de los sitios registrados, el
// chat, consulta rápida". El chat de aquí NO es una segunda
// implementación — al enviar, se le pasa el mensaje al chat real de
// SIEMPRE (ChatAssistant, vía AppShell) y se cambia a esa pestaña,
// para no mantener dos motores de conversación distintos.

const SUGERENCIAS_RAPIDAS = [
  '¿Qué hacer en Catemaco?',
  'Arma una ruta de 2 días',
  'Comida típica de la región',
  'Lugares para ir con niños',
];

interface Props {
  onVerLugar: (lugar: Lugar) => void;
  onPreguntar: (texto: string) => void;
  onAbrirMapa?: () => void;
  onIrAlChat?: () => void;
  ubicacion?: string;
}

export default function InicioScreen({ onVerLugar, onPreguntar, onAbrirMapa, onIrAlChat, ubicacion }: Props) {
  const t = useT();
  // "Para ti" mezcla dos cosas a propósito, siempre en este orden:
  // primero la curaduría nuestra (destacado: rating/calidad, sin
  // dinero de por medio), y DESPUÉS los prestadores Premium ($89
  // MXN/mes) que todavía no estén ya destacados — para que pagar
  // Premium siempre les dé un lugar aquí. Nunca se ocultan entre sí:
  // si un lugar es ambas cosas, PlaceCard ya muestra las dos insignias
  // sin chocar ("Destacado" ámbar + "Patrocinado" morado). El badge de
  // cada uno es lo que deja claro cuál es curaduría y cuál es pauta
  // pagada.
  const destacados = getCatalogoRegion().filter((l) => l.destacado);
  const patrocinadosSinDestacar = getCatalogoRegion().filter((l) => l.premium && !l.destacado);
  const paraTi = [...destacados, ...patrocinadosSinDestacar];

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto flex flex-col">
        <div className="px-4 lg:px-8 pt-6 pb-2">
          <h1 className="font-display font-extrabold text-2xl text-obsidiana-900">
            {t('¿A dónde vamos hoy?')}
          </h1>
          <p className="text-sm text-obsidiana-800/80 mt-1">
            {t('Pregúntame lo que quieras, o mira lo que tenemos para ti.')}
          </p>
        </div>

        {/* Para ti en [ubicación] — refleja lo que haya puesto la
            persona en "Dónde" (barra de filtros); si no ha puesto
            nada, cae a "Los Tuxtlas" en general. */}
        <section className="px-4 lg:px-8 mt-5">
          <h2 className="font-display font-bold text-lg text-obsidiana-900 mb-3">
            {t('Para ti en {lugar}', { lugar: ubicacion?.trim() || 'Los Tuxtlas' })}
          </h2>
          {paraTi.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {paraTi.map((l, idx) => (
                <PlaceCard key={l.id} lugar={l} prioritaria={idx < 2} onClick={() => onVerLugar(l)} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-obsidiana-800/40">
              {t('Todavía no hay lugares destacados en el catálogo.')}
            </p>
          )}
        </section>

        {/* Consulta rápida */}
        <section className="px-4 lg:px-8 mt-6 mb-6">
          <h2 className="font-display font-bold text-lg text-obsidiana-900 mb-3">
            {t('Consulta rápida')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {SUGERENCIAS_RAPIDAS.map((s) => (
              <button
                key={s}
                onClick={() => onPreguntar(s)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-jungle-50 text-jungle-800 text-sm font-medium hover:bg-jungle-100 transition-colors"
              >
                <Sparkles size={13} className="text-sun-600 flex-shrink-0" />
                {t(s)}
              </button>
            ))}
          </div>
        </section>

        {/* Barra flotante de cristal (la misma de Explorar). */}
        <BarraPregunta onPreguntar={onPreguntar} onAbrirMapa={onAbrirMapa} onAbrirChat={onIrAlChat} />
      </div>
    </div>
  );
}
