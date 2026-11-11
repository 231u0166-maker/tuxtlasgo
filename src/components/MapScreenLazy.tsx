import { lazy, Suspense, type ComponentProps } from 'react';

// MapLibre GL pesa cientos de KiB: se descarga cuando el mapa se monta, no al
// abrir la app (Lighthouse marcaba ~540 KiB de JavaScript sin usar al inicio).
const MapScreen = lazy(() => import('./MapScreen'));

export default function MapScreenLazy(props: ComponentProps<typeof MapScreen>) {
  return (
    <Suspense fallback={<div className="w-full h-full bg-jungle-100" aria-hidden="true" />}>
      <MapScreen {...props} />
    </Suspense>
  );
}
