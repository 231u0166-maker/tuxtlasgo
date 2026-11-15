import { useEffect, useRef } from 'react';

/**
 * Accesibilidad de diálogos modales (lectores de pantalla / teclado).
 *
 * Lo que resuelve, una sola vez para todos los modales de la app:
 *  - Marca el contenedor con role="dialog" + aria-modal y su nombre accesible
 *    (TalkBack/VoiceOver anuncian "Reservar, cuadro de diálogo" y dejan de
 *    leer el contenido de fondo).
 *  - Al abrir, mueve el foco adentro; al cerrar lo devuelve a quien lo abrió.
 *  - Atrapa Tab dentro del diálogo.
 *  - Esc cierra. Con modales apilados, solo reacciona el de encima.
 *
 * Uso:
 *   const ref = useDialogA11y({ onClose, label: 'Reservar' });
 *   <div ref={ref}> ... </div>
 *
 * `activo` sirve cuando el modal vive dentro de un componente más grande y se
 * monta con un `{abierto && ...}`: pásale esa misma condición.
 */

const FOCUSABLES =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Pila de diálogos abiertos: solo el último atiende Esc / Tab.
const pila: HTMLElement[] = [];

function visibles(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(FOCUSABLES)).filter(
    (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
  );
}

export function useDialogA11y(
  opciones: {
    onClose?: () => void;
    label?: string;
    activo?: boolean;
    /** Cambia cuando el nodo raíz del modal se reemplaza por otro (p. ej. dos vistas). */
    clave?: unknown;
  } = {},
) {
  const { label, activo = true, clave } = opciones;
  const ref = useRef<HTMLDivElement>(null);
  // onClose cambia en cada render; lo guardamos en un ref para que el efecto
  // no se reinicie (y robe el foco) cada vez que el padre se vuelve a pintar.
  const cerrarRef = useRef(opciones.onClose);
  cerrarRef.current = opciones.onClose;

  useEffect(() => {
    const raiz = ref.current;
    if (!activo || !raiz) return;

    const previo = document.activeElement as HTMLElement | null;
    raiz.setAttribute('role', raiz.getAttribute('role') || 'dialog');
    raiz.setAttribute('aria-modal', 'true');
    if (label && !raiz.hasAttribute('aria-label') && !raiz.hasAttribute('aria-labelledby')) {
      raiz.setAttribute('aria-label', label);
    }
    if (!raiz.hasAttribute('tabindex')) raiz.setAttribute('tabindex', '-1');
    pila.push(raiz);

    // Foco inicial: el primer campo/botón; si no hay, el propio contenedor.
    // Se difiere un tick por si el modal anima su entrada o monta hijos lazy.
    const t = window.setTimeout(() => {
      if (raiz.contains(document.activeElement) && document.activeElement !== raiz) return;
      (visibles(raiz)[0] ?? raiz).focus({ preventScroll: true });
    }, 30);

    const onKey = (e: KeyboardEvent) => {
      if (pila[pila.length - 1] !== raiz) return;
      if (e.key === 'Escape' && cerrarRef.current) {
        e.stopPropagation();
        cerrarRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = visibles(raiz);
      if (items.length === 0) {
        e.preventDefault();
        raiz.focus();
        return;
      }
      const primero = items[0];
      const ultimo = items[items.length - 1];
      const actual = document.activeElement;
      if (e.shiftKey && (actual === primero || actual === raiz)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && actual === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);

    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      const i = pila.lastIndexOf(raiz);
      if (i >= 0) pila.splice(i, 1);
      // Devolver el foco a quien abrió el modal (si sigue en la página).
      if (previo && document.contains(previo)) previo.focus({ preventScroll: true });
    };
  }, [activo, label, clave]);

  return ref;
}
