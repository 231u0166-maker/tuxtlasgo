import { lazy, Suspense, type ComponentProps, type ComponentType } from 'react';

// Carga una pantalla/modal bajo demanda conservando el tipo de sus props. Se usa en
// AppShell para que Comunidad, Favoritos, Detalle, el modal de sesión… no viajen
// en el JS de la primera pantalla (Lighthouse móvil: LCP de /app).
export function perezoso<T extends ComponentType<any>>(cargar: () => Promise<{ default: T }>) {
  const Cargado = lazy(cargar) as unknown as ComponentType<any>;
  return function Perezoso(props: ComponentProps<T>) {
    return (
      <Suspense fallback={null}>
        <Cargado {...props} />
      </Suspense>
    );
  };
}
