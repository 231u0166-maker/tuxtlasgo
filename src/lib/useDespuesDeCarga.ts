import { useEffect, useState } from 'react';

// true cuando la página ya terminó de cargar (+ un margen). Sirve para pedir
// fotos que todavía no se ven (escenas apiladas, cartas de más abajo) SIN que
// compitan con la primera pantalla: `loading="lazy"` no basta, porque con
// conexión lenta el navegador adelanta mucho su umbral y las baja de todos
// modos. Lighthouse suma todo lo pedido antes del LCP, así que esto es
// lo que separa un LCP de ~6 s de uno de ~2 s.
export function useDespuesDeCarga(margenMs = 2500): boolean {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    let t: number | undefined;
    const arrancar = () => { t = window.setTimeout(() => setListo(true), margenMs); };
    if (document.readyState === 'complete') arrancar();
    else window.addEventListener('load', arrancar, { once: true });
    return () => {
      window.removeEventListener('load', arrancar);
      if (t !== undefined) window.clearTimeout(t);
    };
  }, [margenMs]);
  return listo;
}
