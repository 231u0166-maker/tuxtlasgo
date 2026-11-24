import { useEffect, useState } from 'react';
import { useOffline } from '../hooks/useOffline';
import { useT } from '../lib/i18n';
import { leerZonas } from '../lib/mapaOffline';

// ============================================================
// Anuncio flotante: "¿Vas a salir de señal?"
// ============================================================
// Flota sobre toda la app (no solo sobre el mapa) mientras el turista no tenga
// ningún mapa guardado y haya internet. Desaparece solo en cuanto guarda un
// mapa. "Ahora no" solo lo cierra durante esta visita: la próxima vez vuelve a
// preguntar (el mapa de la zona del turista es clave para que no se quede sin ruta).
// ============================================================

const CLAVE_CERRADO = 'aviso-descarga-cerrado';

function leerCerrado(): boolean {
  try { return sessionStorage.getItem(CLAVE_CERRADO) === 'true'; } catch { return false; }
}

// `ocultar`: mientras hay una ruta en pantalla (o se navega) el anuncio no debe tapar el mapa.
export default function AvisoDescargaMapa({ onDescargar, ocultar = false }: { onDescargar: () => void; ocultar?: boolean }) {
  const t = useT();
  const sinInternet = useOffline();
  const [cerrado, setCerrado] = useState(leerCerrado);
  const [oculto, setOculto] = useState(false); // solo esta sesión (tocó "Descargar mapa")
  const [hayMapa, setHayMapa] = useState(() => leerZonas().length > 0);
  const [listo, setListo] = useState(false);

  // Aparece un instante después de abrir la app, para no empalmarse con los avisos de inicio
  useEffect(() => {
    const id = window.setTimeout(() => setListo(true), 1800);
    return () => window.clearTimeout(id);
  }, []);

  // El mapa se guarda desde otra pantalla: se vuelve a revisar cada par de segundos
  useEffect(() => {
    const id = window.setInterval(() => setHayMapa(leerZonas().length > 0), 2000);
    return () => window.clearInterval(id);
  }, []);

  if (!listo || cerrado || oculto || hayMapa || sinInternet || ocultar) return null;

  const cerrarParaSiempre = () => {
    setCerrado(true);
    try { sessionStorage.setItem(CLAVE_CERRADO, 'true'); } catch { /* nada */ }
  };

  return (
    <div
      role="status"
      className="fixed top-3 left-3 right-3 z-[9000] lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:top-4 lg:w-[440px] rounded-2xl px-3.5 py-2.5 shadow-lg backdrop-blur-xl backdrop-saturate-150 text-xs border bg-white/85 border-white/60 text-jungle-900"
    >
      <p className="font-semibold mb-1.5">
        {t('¿Vas a salir de señal? Permite tu ubicación y guarda el mapa de tu zona con Wi-Fi.')}
      </p>
      <button
        onClick={() => { setOculto(true); onDescargar(); }}
        className="font-bold underline mr-3 text-jungle-700"
      >
        {t('Descargar mapa')}
      </button>
      <button onClick={cerrarParaSiempre} className="underline">
        {t('Ahora no')}
      </button>
    </div>
  );
}
