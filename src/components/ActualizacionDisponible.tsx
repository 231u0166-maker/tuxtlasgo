import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, WifiOff } from 'lucide-react';

// ============================================================
// AVISO DE ACTUALIZACIÓN DISPONIBLE
// ============================================================
// Por qué existe: TuxtlasGO es una PWA con Service Worker (para
// funcionar sin internet) — eso significa que el navegador (o el
// ícono instalado en el celular) guarda una COPIA cacheada de la app.
// Cuando se despliega una versión nueva a Vercel, esa copia cacheada
// sigue viva hasta que el navegador se entera de que hay algo nuevo Y
// alguien recarga la página. Antes, `main.tsx` registraba el Service
// Worker de forma silenciosa (sin avisar nada visualmente) — así que
// un cambio bien desplegado podía "no verse" durante horas, y parecía
// que el despliegue había fallado o que se estaba viendo la rama
// equivocada, cuando en realidad solo faltaba una recarga.
//
// Con este componente: en cuanto el Service Worker detecta una
// versión nueva, aparece un aviso claro con un botón "Actualizar
// ahora" — un toque y ya se ve la versión correcta, sin tener que
// adivinar por qué "no cambió nada".
//
// También se revisa cada hora si hay una versión nueva mientras la
// pestaña sigue abierta — sin esto, alguien que deja la app abierta
// varias horas (común en un viaje) nunca se entera de una
// actualización hasta que cierra y vuelve a abrir la app.
export default function ActualizacionDisponible() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) {
        console.log('[TuxtlasGO] Service Worker activo. App lista para offline.');
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 60 * 1000);
      }
    },
  });

  // Aviso de "listo para offline" — informativo, se autocierra solo;
  // a diferencia del de "hay versión nueva" (needRefresh), que se
  // queda hasta que la persona lo cierra o actualiza, porque ese sí
  // requiere una decisión.
  useEffect(() => {
    if (!offlineReady) return;
    const t = setTimeout(() => setOfflineReady(false), 4000);
    return () => clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="fixed bottom-20 left-3 right-3 z-[999] flex justify-center pointer-events-none">
      {needRefresh ? (
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl bg-jungle-900 text-white shadow-lg px-4 py-3 max-w-md w-full">
          <RefreshCw size={18} className="flex-shrink-0 text-jungle-200" />
          <span className="text-sm flex-1">Hay una versión nueva de TuxtlasGO.</span>
          <button
            onClick={() => updateServiceWorker(true)}
            className="text-sm font-semibold bg-white text-jungle-900 rounded-lg px-3 py-1.5 flex-shrink-0"
          >
            Actualizar
          </button>
          <button
            onClick={() => setNeedRefresh(false)}
            className="text-jungle-300 text-xs flex-shrink-0"
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-jungle-800/95 text-white shadow-lg px-4 py-2.5 text-xs">
          <WifiOff size={14} className="text-jungle-300" />
          Listo para usarse sin conexión.
        </div>
      )}
    </div>
  );
}
