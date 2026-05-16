import { WifiOff, CheckCircle2 } from 'lucide-react';
import { useOffline } from '../hooks/useOffline';

// Indicador discreto de modo offline. Antes era una banda naranja que
// tapaba el header — ahora es un badge flotante pequeño en la esquina
// inferior derecha, encima del bottom nav. No estorba a la navegación.
export default function OfflineIndicator() {
  const offline = useOffline();
  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-3 right-3 z-40 bg-amber-500/95 backdrop-blur text-white pl-3 pr-3.5 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-semibold shadow-lg shadow-amber-900/20 animate-fade-in"
    >
      <WifiOff size={13} />
      <span>Offline</span>
    </div>
  );
}

export function OfflineReadyBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 text-xs bg-jungle-100 text-jungle-800 px-2.5 py-1 rounded-full font-medium">
      <CheckCircle2 size={12} />
      Disponible offline
    </div>
  );
}