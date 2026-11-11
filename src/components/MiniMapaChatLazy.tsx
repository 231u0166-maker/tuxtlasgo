import { lazy, Suspense, type ComponentProps } from 'react';

// Mismo motivo que MapScreenLazy: MapLibre no debe viajar en el bundle inicial.
const MiniMapaChat = lazy(() => import('./MiniMapaChat'));

export default function MiniMapaChatLazy(props: ComponentProps<typeof MiniMapaChat>) {
  return (
    <Suspense fallback={<div className="w-full h-40 rounded-xl bg-jungle-100" aria-hidden="true" />}>
      <MiniMapaChat {...props} />
    </Suspense>
  );
}
