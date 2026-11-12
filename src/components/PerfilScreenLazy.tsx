import { lazy, Suspense, type ComponentProps } from 'react';

// Perfil trae listas de estados/municipios y formularios: solo se baja al abrirlo.
const PerfilScreen = lazy(() => import('./PerfilScreen'));

export default function PerfilScreenLazy(props: ComponentProps<typeof PerfilScreen>) {
  return (
    <Suspense fallback={null}>
      <PerfilScreen {...props} />
    </Suspense>
  );
}
