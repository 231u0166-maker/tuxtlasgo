import { useCallback, useRef, useState } from 'react';

// ============================================================
// ARRASTRE REORDENABLE — sin librería externa
// ============================================================
// Un solo hook para reordenar cualquier lista arrastrando: los
// bloques del editor de Información adicional, y las fotos de la
// galería. Usa Pointer Events (no HTML5 Drag&Drop) a propósito —
// el prestador edita casi siempre desde el celular en campo, y el
// Drag&Drop nativo del navegador no funciona bien con el dedo.
// ============================================================

export function useArrastreReordenable<T>(
  items: T[],
  onReordenar: (nuevosItems: T[]) => void,
  orientacion: 'vertical' | 'horizontal' = 'vertical'
) {
  const [indiceArrastrando, setIndiceArrastrando] = useState<number | null>(null);
  const [indiceSobre, setIndiceSobre] = useState<number | null>(null);
  const nodos = useRef<Map<number, HTMLElement>>(new Map());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const registrarNodo = useCallback((index: number, el: HTMLElement | null) => {
    if (el) nodos.current.set(index, el);
    else nodos.current.delete(index);
  }, []);

  const calcularIndiceMasCercano = useCallback((x: number, y: number) => {
    let mejor: number | null = null;
    let mejorDist = Infinity;
    nodos.current.forEach((el, idx) => {
      const r = el.getBoundingClientRect();
      const centro = orientacion === 'vertical' ? r.top + r.height / 2 : r.left + r.width / 2;
      const punto = orientacion === 'vertical' ? y : x;
      const dist = Math.abs(punto - centro);
      if (dist < mejorDist) { mejorDist = dist; mejor = idx; }
    });
    return mejor;
  }, [orientacion]);

  const soltar = useCallback(() => {
    setIndiceArrastrando((actual) => {
      setIndiceSobre((sobre) => {
        if (actual !== null && sobre !== null && actual !== sobre) {
          const next = [...itemsRef.current];
          const [item] = next.splice(actual, 1);
          next.splice(sobre, 0, item);
          onReordenar(next);
        }
        return null;
      });
      return null;
    });
    document.body.style.userSelect = '';
  }, [onReordenar]);

  const mover = useCallback((e: PointerEvent) => {
    const idx = calcularIndiceMasCercano(e.clientX, e.clientY);
    if (idx !== null) setIndiceSobre(idx);
  }, [calcularIndiceMasCercano]);

  const iniciar = useCallback((index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    setIndiceArrastrando(index);
    setIndiceSobre(index);
    document.body.style.userSelect = 'none';
    const onMove = (ev: PointerEvent) => mover(ev);
    const onUp = () => {
      soltar();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }, [mover, soltar]);

  return { indiceArrastrando, indiceSobre, registrarNodo, iniciar };
}
