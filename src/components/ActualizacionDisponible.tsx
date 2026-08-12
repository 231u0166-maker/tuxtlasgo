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
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) {
        console.log('[TuxtlasGO] Service Worker activo. App lista para offline.');
        // Antes revisaba cada hora — durante desarrollo activo eso
        // dejaba a quien probaba la app pegado a una versión vieja
        // por mucho tiempo (justo lo que pasó con la conexión de
        // Mercado Pago: el código ya estaba corregido en el
        // servidor, pero el navegador seguía sirviendo el bundle
        // viejo). Cada 5 minutos, más al volver a la pestaña.
        setInterval(() => {
          registration.update().catch(() => {});
        }, 5 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {});
          }
        });
      }
    },
  });

  // Antes esperaba a que la persona viera el aviso y le diera clic a
  // "Actualizar" — eso es justo lo que causaba que alguien se
  // quedara horas en una versión vieja sin darse cuenta. Ahora, en
  // cuanto hay una versión nueva, se aplica sola — el aviso de abajo
  // solo informa que está pasando, ya no requiere que nadie decida
  // nada.
  useEffect(() => {
    if (!needRefresh) return;
    updateServiceWorker(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needRefresh]);

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
          <RefreshCw size={18} className="flex-shrink-0 text-jungle-200 animate-spin" />
          <span className="text-sm flex-1">Actualizando a la versión más reciente…</span>
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