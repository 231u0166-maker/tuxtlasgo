import { useCallback, useState } from 'react';

// ============================================================
// HOJA ARRASTRABLE — expandir/cerrar con el dedo (o el mouse)
// ============================================================
// Para modales que en celular aparecen como hoja inferior: arrastra
// hacia arriba para agrandarla, hacia abajo para achicarla o
// cerrarla si la sueltas por debajo del mínimo. En escritorio no se
// usa (ahí el modal tiene tamaño fijo, centrado).
// ============================================================

export function useHojaArrastrable(opciones?: {
  inicial?: number; // % de alto de pantalla al abrir
  min?: number;      // por debajo de esto, se cierra al soltar
  max?: number;
  onCerrar?: () => void;
}) {
  const inicial = opciones?.inicial ?? 70;
  const min = opciones?.min ?? 35;
  const max = opciones?.max ?? 94;

  const [altura, setAltura] = useState(inicial);
  const [arrastrando, setArrastrando] = useState(false);

  const iniciarArrastre = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setArrastrando(true);
    const inicioY = e.clientY;
    const alturaInicial = altura;

    const mover = (ev: PointerEvent) => {
      const deltaVh = ((inicioY - ev.clientY) / window.innerHeight) * 100;
      setAltura(Math.min(max, Math.max(min - 15, alturaInicial + deltaVh)));
    };
    const soltar = () => {
      setArrastrando(false);
      setAltura((actual) => {
        if (actual < min) {
          opciones?.onCerrar?.();
          return inicial;
        }
        return Math.max(min, actual);
      });
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar, { once: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [altura, min, max, inicial]);

  return { altura, arrastrando, iniciarArrastre };
}
