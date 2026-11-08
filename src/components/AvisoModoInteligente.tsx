import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useT } from '../lib/i18n';
import { estadoEmbeddings, suscribirEstadoEmbeddings, type EstadoEmbeddings } from '../lib/embeddings';

// Aviso discreto cuando el "modo inteligente" (el modelo de lenguaje que corre en
// el teléfono) no pudo activarse en esta carga. Pasa sobre todo en teléfonos con
// poca memoria al RECARGAR la página: la app sigue funcionando con respuestas
// básicas, y cerrar la app por completo y volver a abrirla suele activarlo.
//
// Solo aparece si de verdad falló (no cuando el dispositivo lo omite a propósito,
// ni mientras todavía está cargando), una vez por sesión, y se puede cerrar.

const CLAVE = 'tuxtlasgo-aviso-modo-inteligente';

export default function AvisoModoInteligente() {
  const t = useT();
  const [estado, setEstado] = useState<EstadoEmbeddings>(estadoEmbeddings());
  const [cerrado, setCerrado] = useState(() => {
    try { return sessionStorage.getItem(CLAVE) === '1'; } catch { return false; }
  });

  useEffect(() => suscribirEstadoEmbeddings(setEstado), []);

  if (cerrado || estado.fase !== 'error') return null;

  return (
    <div
      role="status"
      className="flex-shrink-0 mx-3 mt-3 mb-0 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"
    >
      <Sparkles size={15} className="mt-0.5 flex-shrink-0 text-amber-600" />
      <p className="flex-1 text-xs leading-snug">
        {t('El modo inteligente no se activó en esta carga (poca memoria). El asistente sigue funcionando con respuestas básicas, incluso sin internet. Para activarlo, cierra la app por completo y vuelve a abrirla.')}
      </p>
      <button
        onClick={() => {
          setCerrado(true);
          try { sessionStorage.setItem(CLAVE, '1'); } catch { /* no crítico */ }
        }}
        aria-label={t('Cerrar')}
        className="flex-shrink-0 rounded-full p-1 text-amber-700 hover:bg-amber-100"
      >
        <X size={14} />
      </button>
    </div>
  );
}
