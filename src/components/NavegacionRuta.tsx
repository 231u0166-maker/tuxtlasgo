import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Car, Footprints, Navigation, X, ArrowUpLeft, ArrowUpRight, ArrowLeft, ArrowRight, Undo2, Flag, Loader2,
} from 'lucide-react';
import type { Coord, ModoRuta } from '../lib/routing';
import { formatearDistancia, formatearDuracion } from '../lib/routing';
import {
  prepararRuta, proyectar, rumbo, distancia, textoManiobra, formatoDistanciaCorta, type Maniobra,
} from '../lib/navegacion';

// ============================================================
// Panel de ruta + navegación paso a paso (estilo MAPS.ME / AllTrails)
// ============================================================
// 1) Con una ruta dibujada: hoja inferior con auto/a pie, tiempo y distancia,
//    y el botón "Iniciar".
// 2) Al iniciar: sigue el GPS (funciona sin internet), muestra el siguiente
//    giro con su distancia, lo que falta y la hora de llegada, y recalcula si
//    el turista se sale de la ruta.
// Toda la lógica de geometría vive en lib/navegacion.ts.
// ============================================================

interface Props {
  geometria: Coord[];
  modo: ModoRuta;
  distanciaMetros?: number;
  duracionSegundos?: number;
  aproximada: boolean;
  calculando: boolean;
  onCambiarModo: (m: ModoRuta) => void;
  onRecalcular: (desde: Coord, m: ModoRuta) => void;
  // Posición/rumbo para que el mapa dibuje el marcador y mueva la cámara
  onPosicion: (pos: Coord | null, rumboGrados: number | null) => void;
  onNavegando: (activa: boolean) => void;
}

function IconoGiro({ tipo }: { tipo: Maniobra['tipo'] }) {
  const p = { size: 34, strokeWidth: 2.6 };
  switch (tipo) {
    case 'izquierda': return <ArrowLeft {...p} />;
    case 'derecha': return <ArrowRight {...p} />;
    case 'ligera-izquierda': return <ArrowUpLeft {...p} />;
    case 'ligera-derecha': return <ArrowUpRight {...p} />;
    case 'vuelta': return <Undo2 {...p} />;
    case 'llegada': return <Flag {...p} />;
  }
}

export default function NavegacionRuta(props: Props) {
  const { geometria, modo, distanciaMetros, duracionSegundos, aproximada, calculando } = props;
  const [navegando, setNavegando] = useState(false);
  const [pos, setPos] = useState<Coord | null>(null);
  const [sinGps, setSinGps] = useState<string | null>(null);
  const [recalculando, setRecalculando] = useState(false);
  const [llego, setLlego] = useState(false);

  const ruta = useMemo(() => prepararRuta(geometria), [geometria]);
  const rutaRef = useRef(ruta);
  rutaRef.current = ruta;
  const modoRef = useRef(modo);
  modoRef.current = modo;
  const recorridoRef = useRef(0);
  const fueraRef = useRef(0);
  const ultimoRecalculo = useRef(0);
  const ultimaPos = useRef<Coord | null>(null);
  const cbRef = useRef(props);
  cbRef.current = props;

  // Cuando llega una ruta nueva (recalculada) se reinicia el avance
  useEffect(() => {
    recorridoRef.current = 0;
    fueraRef.current = 0;
    setRecalculando(false);
  }, [geometria]);

  useEffect(() => {
    props.onNavegando(navegando);
    if (!navegando) {
      props.onPosicion(null, null);
      return;
    }
    if (!navigator.geolocation) {
      setSinGps('Este dispositivo no permite usar el GPS.');
      return;
    }
    setSinGps(null);
    setLlego(false);

    // Mantener la pantalla encendida mientras se navega
    let wake: { release: () => Promise<void> } | null = null;
    (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } })
      .wakeLock?.request('screen').then((w) => { wake = w; }).catch(() => { });

    const id = navigator.geolocation.watchPosition(
      (g) => {
        const nueva: Coord = [g.coords.latitude, g.coords.longitude];
        let rumboGps: number | null =
          g.coords.heading != null && !Number.isNaN(g.coords.heading) && (g.coords.speed ?? 0) > 0.7
            ? g.coords.heading : null;
        const previa = ultimaPos.current;
        if (rumboGps == null && previa && distancia(previa, nueva) > 4) rumboGps = rumbo(previa, nueva);
        if (!previa || distancia(previa, nueva) > 2) ultimaPos.current = nueva;
        setPos(nueva);
        setSinGps(null);

        const r = rutaRef.current;
        const pr = proyectar(r, nueva, recorridoRef.current);
        if (pr.desvio <= 40) recorridoRef.current = Math.max(recorridoRef.current, pr.recorrido);
        cbRef.current.onPosicion(nueva, rumboGps);

        // Llegada
        if (r.total - recorridoRef.current < 25 && pr.desvio < 60) {
          setLlego(true);
          return;
        }
        // Fuera de ruta: 3 lecturas seguidas a más de 50 m → recalcular
        // (con enfriamiento para no pedir rutas sin parar).
        fueraRef.current = pr.desvio > 50 ? fueraRef.current + 1 : 0;
        if (fueraRef.current >= 3 && Date.now() - ultimoRecalculo.current > 12000) {
          ultimoRecalculo.current = Date.now();
          fueraRef.current = 0;
          setRecalculando(true);
          cbRef.current.onRecalcular(nueva, modoRef.current);
        }
      },
      (e) => {
        setSinGps(e.code === 1
          ? 'Activa el permiso de ubicación para navegar.'
          : 'Buscando señal de GPS…');
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      wake?.release().catch(() => { });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navegando]);

  const recorrido = pos ? Math.max(recorridoRef.current, 0) : 0;
  const restante = Math.max(ruta.total - recorrido, 0);
  const siguiente = ruta.maniobras.find((m) => m.distancia > recorrido + 3) ?? ruta.maniobras[ruta.maniobras.length - 1];
  const distAlGiro = siguiente ? Math.max(siguiente.distancia - recorrido, 0) : 0;
  const segRestantes = duracionSegundos && ruta.total > 0 ? duracionSegundos * (restante / ruta.total) : 0;
  const hora = segRestantes
    ? new Date(Date.now() + segRestantes * 1000).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
    : null;

  // ---------------- Navegación activa ----------------
  if (navegando) {
    return (
      <>
        <div className="absolute top-14 left-3 right-3 z-30 flex flex-col gap-2 pointer-events-none">
          {sinGps ? (
            <div role="status" className="self-start bg-amber-50 border border-amber-300 text-amber-900 text-sm font-semibold rounded-xl px-3 py-2 shadow-lg">
              {sinGps}
            </div>
          ) : llego ? (
            <div role="status" className="self-start bg-jungle-700 text-white rounded-2xl px-4 py-3 shadow-xl flex items-center gap-3">
              <Flag size={30} />
              <span className="font-display font-bold text-lg">Llegaste a tu destino</span>
            </div>
          ) : (
            <div role="status" aria-live="polite" className="self-start bg-jungle-700 text-white rounded-2xl px-4 py-3 shadow-xl flex items-center gap-3 max-w-full">
              {recalculando
                ? <Loader2 size={30} className="animate-spin" />
                : siguiente && <IconoGiro tipo={siguiente.tipo} />}
              <div className="min-w-0">
                <div className="font-display font-extrabold text-2xl leading-none">
                  {recalculando ? 'Recalculando…' : formatoDistanciaCorta(distAlGiro)}
                </div>
                {!recalculando && siguiente && (
                  <div className="text-xs opacity-90 mt-0.5">{textoManiobra(siguiente.tipo)}</div>
                )}
              </div>
            </div>
          )}
          {aproximada && (
            <div className="self-start bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-semibold rounded-lg px-2.5 py-1 shadow">
              Sin ruta por calles: la guía es una línea recta de referencia.
            </div>
          )}
        </div>

        <div className="absolute bottom-3 left-3 right-3 z-30 bg-white rounded-2xl shadow-xl border border-jungle-100 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-jungle-950 text-lg leading-tight">
              {formatearDistancia(restante)}
              {segRestantes > 0 && <span className="text-jungle-700"> · {formatearDuracion(segRestantes)}</span>}
            </div>
            {hora && <div className="text-xs text-jungle-600">Llegas a las {hora}</div>}
          </div>
          <button
            onClick={() => { setNavegando(false); setLlego(false); }}
            className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-4 py-2.5 font-semibold text-sm flex items-center gap-1.5"
          >
            <X size={16} /> Detener
          </button>
        </div>
      </>
    );
  }

  // ---------------- Hoja con resumen de la ruta ----------------
  const unidades = (
    <div className="flex gap-2 mb-3">
      {([['auto', 'En auto', Car], ['pie', 'A pie', Footprints]] as const).map(([m, texto, Icono]) => (
        <button
          key={m}
          onClick={() => m !== modo && props.onCambiarModo(m)}
          disabled={calculando}
          aria-pressed={modo === m}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold border-2 disabled:opacity-60 ${modo === m
            ? 'border-jungle-700 bg-jungle-50 text-jungle-900'
            : 'border-jungle-100 text-jungle-600 hover:bg-jungle-50'}`}
        >
          <Icono size={17} /> {texto}
        </button>
      ))}
    </div>
  );

  return (
    <div className="absolute bottom-3 left-3 right-3 z-30 bg-white rounded-2xl shadow-xl border border-jungle-100 p-3">
      {unidades}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {calculando ? (
            <div className="flex items-center gap-2 text-jungle-700 font-semibold text-sm">
              <Loader2 size={16} className="animate-spin" /> Calculando ruta…
            </div>
          ) : aproximada ? (
            <>
              <div className="font-display font-bold text-jungle-950">
                {distanciaMetros ? `≈ ${formatearDistancia(distanciaMetros)} en línea recta` : 'Sin ruta por calles'}
              </div>
              <div className="text-xs text-amber-800">No hay ruta por calles disponible aquí.</div>
            </>
          ) : (
            <>
              <div className="font-display font-bold text-jungle-950 text-lg leading-tight">
                {duracionSegundos ? formatearDuracion(duracionSegundos) : '—'}
                {distanciaMetros ? <span className="text-jungle-600 font-semibold"> · {formatearDistancia(distanciaMetros)}</span> : null}
              </div>
              <div className="text-xs text-jungle-600">
                {modo === 'pie' ? 'Caminando, por calles y carreteras' : 'En auto, la más rápida'}
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => setNavegando(true)}
          disabled={calculando}
          className="bg-jungle-700 hover:bg-jungle-800 disabled:opacity-50 text-white rounded-xl px-5 py-3 font-semibold text-sm flex items-center gap-1.5"
        >
          <Navigation size={16} /> Iniciar
        </button>
      </div>
    </div>
  );
}
