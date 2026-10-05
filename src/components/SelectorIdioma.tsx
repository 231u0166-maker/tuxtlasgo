import { Languages } from 'lucide-react';
import { useI18n } from '../lib/i18n';

// Botón ES/EN. `variante="claro"` para fondos oscuros/hero (landing),
// `variante="normal"` para fondos blancos (header de la app).
export default function SelectorIdioma({ variante = 'normal' }: { variante?: 'normal' | 'claro' }) {
  const { idioma, setIdioma } = useI18n();
  const siguiente = idioma === 'es' ? 'en' : 'es';
  const estilo =
    variante === 'claro'
      ? 'bg-white/15 text-white hover:bg-white/25 border-white/30'
      : 'bg-jungle-50 text-jungle-800 hover:bg-jungle-100 border-jungle-200';

  return (
    <button
      type="button"
      onClick={() => setIdioma(siguiente)}
      aria-label={idioma === 'es' ? 'Switch to English' : 'Cambiar a español'}
      title={idioma === 'es' ? 'English' : 'Español'}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-xs font-bold transition-colors ${estilo}`}
    >
      <Languages size={14} />
      {idioma === 'es' ? 'EN' : 'ES'}
    </button>
  );
}
