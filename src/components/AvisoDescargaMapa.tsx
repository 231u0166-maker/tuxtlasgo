import { useEffect, useState } from 'react';
import { useOffline } from '../hooks/useOffline';
import { useT } from '../lib/i18n';
import { leerZonas } from '../lib/mapaOffline';
import { obtenerUbicacionGPS } from '../lib/routing';
import {
  cargarCatalogo, hayServidorDePaquetes, paquetesParaUbicacion, planVisitaTuxtlas, PAQUETES_PERMITIDOS,
  type PaqueteCatalogo,
} from '../lib/paquetes';

// ============================================================
// Anuncio flotante al entrar: ubicarte → proponer el mapa → descargar
// ============================================================
// Flujo:
//  1. Se marca tu ubicación actual (con tu permiso; si ya lo diste, es automático).
//  2. «Estás en Puebla. ¿Descargar el mapa de Puebla y Los Tuxtlas para visitar la
//     zona, con o sin internet?»
//  3. «Descargar» baja los paquetes necesarios (tu estado + el que cubre Los Tuxtlas)
//     y el mapa te deja trazar desde tu punto hasta cualquier lugar de la región.
// Solo Puebla, Tabasco y Veracruz tienen paquete (ver PAQUETES_PERMITIDOS).
//
// Flota sobre toda la app mientras no haya ningún mapa guardado y haya internet.
// «Ahora no» solo lo cierra durante esta visita: la próxima vuelve a preguntar.
// ============================================================

const CLAVE_CERRADO = 'aviso-descarga-cerrado';
export const CLAVE_UBICACION_INICIAL = 'ubicacion-inicial';

function leerCerrado(): boolean {
  try { return sessionStorage.getItem(CLAVE_CERRADO) === 'true'; } catch { return false; }
}

type Fase = 'inicio' | 'buscando' | 'propuesta' | 'sin-permiso';

// `onDescargar(ids)`: con ids, descarga esos paquetes; sin ids, abre el panel de mapa sin internet.
// `ocultar`: mientras hay una ruta en pantalla (o se navega) el anuncio no debe tapar el mapa.
export default function AvisoDescargaMapa({ onDescargar, ocultar = false }: { onDescargar: (ids?: string[]) => void; ocultar?: boolean }) {
  const t = useT();
  const sinInternet = useOffline();
  const [cerrado, setCerrado] = useState(leerCerrado);
  const [oculto, setOculto] = useState(false); // solo esta sesión (tocó «Descargar»)
  const [hayMapa, setHayMapa] = useState(() => leerZonas().length > 0);
  const [listo, setListo] = useState(false);
  const [fase, setFase] = useState<Fase>('inicio');
  const [estado, setEstado] = useState('');
  const [plan, setPlan] = useState<PaqueteCatalogo[]>([]);

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

  const ubicar = async () => {
    setFase('buscando');
    const r = await obtenerUbicacionGPS();
    if (!r) { setFase('sin-permiso'); return; }
    // Se marca en el mapa (MapScreen lo lee al montarse o por el evento)
    try {
      sessionStorage.setItem(CLAVE_UBICACION_INICIAL, JSON.stringify(r.coord));
      localStorage.setItem('ubicacion-explicada', 'true'); // ya dio el permiso: no repetir la explicación
    } catch { /* nada */ }
    window.dispatchEvent(new Event(CLAVE_UBICACION_INICIAL));
    const catalogo = await cargarCatalogo();
    const sugeridos = planVisitaTuxtlas(r.coord, catalogo);
    if (sugeridos.length === 0) { setFase('sin-permiso'); return; } // sin catálogo: se cae al panel manual
    setPlan(sugeridos);
    setEstado(paquetesParaUbicacion(r.coord, catalogo)[0]?.nombre ?? '');
    setFase('propuesta');
  };

  // Si ya diste el permiso de ubicación, se ubica sola al entrar (sin pedir nada)
  const visible = listo && !cerrado && !oculto && !hayMapa && !sinInternet && !ocultar;
  useEffect(() => {
    if (!visible || fase !== 'inicio' || !hayServidorDePaquetes()) return;
    navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      .then((p) => { if (p.state === 'granted') void ubicar(); })
      .catch(() => { /* navegador sin Permissions API: se pide con el botón */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const cerrarEstaVisita = () => {
    setCerrado(true);
    try { sessionStorage.setItem(CLAVE_CERRADO, 'true'); } catch { /* nada */ }
  };
  const mb = Math.round(plan.reduce((s, p) => s + p.bytesMapa + p.bytesGrafo, 0) / 1048576);
  const nombres = plan.map((p) => p.nombre).join(' + ');
  const sinPaquetes = !hayServidorDePaquetes();

  return (
    <div
      role="status"
      className="fixed top-3 left-3 right-3 z-[9000] lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:top-4 lg:w-[440px] rounded-2xl px-3.5 py-2.5 shadow-lg backdrop-blur-xl backdrop-saturate-150 text-xs border bg-white/85 border-white/60 text-jungle-900"
    >
      {fase === 'propuesta' ? (
        <>
          <p className="font-semibold mb-1.5">
            {estado
              ? t('Estás en {estado}. ¿Descargar el mapa de {nombres} para visitar Los Tuxtlas, con o sin internet?', { estado, nombres })
              : t('¿Descargar el mapa de {nombres} para visitar Los Tuxtlas, con o sin internet?', { nombres })}
          </p>
          <p className="text-jungle-700 mb-1.5">
            {t('{mb} MB en total. Después toca tu ubicación y un lugar de Los Tuxtlas para trazar la ruta.', { mb })}
          </p>
          <button
            onClick={() => { setOculto(true); onDescargar(plan.map((p) => p.id)); }}
            className="font-bold underline mr-3 text-jungle-700"
          >
            {t('Descargar')}
          </button>
          <button onClick={cerrarEstaVisita} className="underline">{t('Ahora no')}</button>
        </>
      ) : (
        <>
          <p className="font-semibold mb-1.5">
            {fase === 'buscando'
              ? t('Buscando tu ubicación…')
              : fase === 'sin-permiso'
                ? t('No pude obtener tu ubicación o no hay mapa de tu zona. Elige el mapa a mano.')
                : sinPaquetes
                  ? t('¿Vas a salir de señal? Guarda el mapa ahora, con Wi-Fi, para usarlo sin internet.')
                  : t('Permite tu ubicación para ofrecerte el mapa de tu zona y de Los Tuxtlas ({estados}).', { estados: PAQUETES_PERMITIDOS.map((i) => i[0].toUpperCase() + i.slice(1)).join(', ') })}
          </p>
          {fase !== 'buscando' && (
            <>
              <button
                onClick={() => {
                  if (fase === 'sin-permiso' || sinPaquetes) { setOculto(true); onDescargar(); return; }
                  void ubicar();
                }}
                className="font-bold underline mr-3 text-jungle-700"
              >
                {fase === 'sin-permiso' || sinPaquetes ? t('Descargar mapa') : t('Usar mi ubicación')}
              </button>
              <button onClick={cerrarEstaVisita} className="underline">{t('Ahora no')}</button>
            </>
          )}
        </>
      )}
    </div>
  );
}
