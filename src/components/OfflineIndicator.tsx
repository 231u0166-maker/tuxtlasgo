import { WifiOff, CheckCircle2 } from 'lucide-react';
import { useOffline } from '../hooks/useOffline';

export default function OfflineIndicator() {
  const offline = useOffline();

  if (!offline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-md offline-badge">
      <WifiOff size={16} />
      <span>Modo offline activo · funcionando con datos descargados</span>
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
