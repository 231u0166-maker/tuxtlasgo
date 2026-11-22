import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Car, Footprints, Navigation, X, Download, Check, AlertTriangle, ChevronDown, Route as RutaIcono, ArrowUpLeft, ArrowUpRight, ArrowLeft, ArrowRight, Undo2, Flag, Loader2,
} from 'lucide-react';
import type { Coord, ModoRuta } from '../lib/routing';
import { useOffline } from '../hooks/useOffline';
import { formatearDistancia, formatearDuracion } from '../lib/routing';
import {
  prepararRuta, proyectar, rumbo, distancia, textoManiobra, formatoDistanciaCorta, type Maniobra,
} from '../lib/navegacion';
import { estaCubierto } from '../lib/mapaOffline';
import { perfilElevacion, type PerfilElevacion as Perfil } from '../lib/elevacion';
import PerfilElevacionGrafica from './PerfilElevacion';

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
  // "Guardar mapa y ruta": descarga la franja del trayecto para usarla sin internet
  onGuardar?: () => void;
  mbGuardar?: number;
  guardando?: boolean;
  guardada?: boolean;
  // Cambia cuando se descarga/borra algo, para volver a evaluar la cobertura
  zonasClave?: string;
  // Tiempo del otro modo (se muestra en su pestaña), y los nombres de origen y destino
  alterna?: { modo: ModoRuta; duracionSegundos?: number; distanciaMetros?: number };
  origen?: string;
  destino?: string;
  // Rutas alternas al mismo destino y cómo elegir una
  alternativas?: { geometria: Coord[]; distanciaMetros: number; duracionSegundos: number }[];
  onElegirAlternativa?: (indice: number) => void;
  // Encuadra toda la ruta en el mapa (la cámara vuelve a seguirte con la siguiente lectura del GPS)
  onVerRutaCompleta?: () => void;
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
  const sinInternet = useOffline();
  const [fueraDeMapa, setFueraDeMapa] = useState(false);
  const [velocidad, setVelocidad] = useState<number | null>(null); // km/h según el GPS
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [verPerfil, setVerPerfil] = useState(true);
  // El perfil de elevación se calcula una vez por ruta (con internet, o con los mosaicos ya guardados)
  useEffect(() => {
    let vivo = true;
    setPerfil(null);
    if (!aproximada && geometria.length >= 2) {
      perfilElevacion(geometria).then((pf) => { if (vivo) setPerfil(pf); }).catch(() => { });
    }
    return () => { vivo = false; };
  }, [geometria, aproximada]);
  const [confirmando, setConfirmando] = useState(false);
  // ¿Todo el trayecto ya cae dentro del mapa descargado? Si sí, funciona sin
  // internet y NO se pregunta ni se ofrece guardar nada.
  const cubierta = useMemo(() => {
    const paso = Math.max(1, Math.floor(geometria.length / 80));
    for (let i = 0; i < geometria.length; i += paso) {
      if (!estaCubierto(geometria[i][0], geometria[i][1])) return false;
    }
    const u = geometria[geometria.length - 1];
    return estaCubierto(u[0], u[1]);
  }, [geometria, props.zonasClave]); // eslint-disable-line react-hooks/exhaustive-deps
  const fueraMapaRef = useRef(false);

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
    fueraMapaRef.current = false;
    setFueraDeMapa(false);

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
        setVelocidad(g.coords.speed != null && !Number.isNaN(g.coords.speed) ? Math.max(0, g.coords.speed * 3.6) : null);

        const r = rutaRef.current;
        const pr = proyectar(r, nueva, recorridoRef.current);
        if (pr.desvio <= 40) recorridoRef.current = Math.max(recorridoRef.current, pr.recorrido);
        cbRef.current.onPosicion(nueva, rumboGps);

        // Fuera del mapa descargado (solo importa sin internet)
        if (!navigator.onLine) {
          const cubierto = estaCubierto(nueva[0], nueva[1]);
          fueraMapaRef.current = !cubierto;
          setFueraDeMapa(!cubierto);
        } else if (fueraMapaRef.current) {
          fueraMapaRef.current = false;
          setFueraDeMapa(false);
        }

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
  const avance = ruta.total > 0 ? Math.min(1, Math.max(0, recorrido / ruta.total)) : 0;
  const segRestantes = duracionSegundos && ruta.total > 0 ? duracionSegundos * (restante / ruta.total) : 0;
  const hora = segRestantes
    ? new Date(Date.now() + segRestantes * 1000).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
    : null;

  const iniciar = () => {
    setConfirmando(false);
    setNavegando(true);
  };
  const alPulsarIniciar = () => {
    if (props.onGuardar && !sinInternet && !props.guardada && !aproximada && !cubierta) {
      setConfirmando(true);
      return;
    }
    iniciar();
  };

  // ---------------- Navegación activa ----------------
  if (navegando) {
    return (
      <>
        <div className="absolute top-14 right-3 z-30 bg-white/85 backdrop-blur-xl border border-white/70 shadow-lg rounded-2xl pl-2.5 pr-3 py-1.5 text-jungle-950 pointer-events-none flex items-center gap-1.5" aria-label="Velocidad">
          {modo === 'pie' ? <Footprints size={16} className="text-jungle-600" /> : <Car size={16} className="text-jungle-600" />}
          <span className="font-display font-extrabold text-base tabular-nums">{(velocidad ?? 0).toFixed(1)}</span>
          <span className="text-[11px] font-semibold text-jungle-600">km/h</span>
        </div>
        <div className="absolute top-14 left-3 right-16 z-30 flex flex-col gap-2 pointer-events-none">
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
          {fueraDeMapa && (
            <div role="alert" className="self-start bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold rounded-lg px-2.5 py-1.5 shadow flex items-center gap-1.5">
              <AlertTriangle size={14} className="flex-shrink-0" />
              Saliste del mapa descargado: el fondo puede verse en blanco, pero la línea de la ruta sigue ahí.
            </div>
          )}
        </div>

        <div className="absolute bottom-3 left-3 right-3 sm:left-1/2 sm:right-auto sm:w-[440px] sm:-translate-x-1/2 z-30 bg-white/90 backdrop-blur-xl backdrop-saturate-150 rounded-3xl shadow-2xl border border-white/60 px-3.5 pt-3 pb-3.5">
          {/* fila de datos: ver toda la ruta · distancia · tiempo · hora de llegada · mostrar/ocultar gráfica */}
          <div className="flex items-center gap-3">
            <button
              onClick={props.onVerRutaCompleta}
              className="w-11 h-11 rounded-2xl bg-jungle-50 border border-jungle-100 hover:bg-jungle-100 text-jungle-800 flex items-center justify-center flex-none"
              aria-label="Ver toda la ruta"
              title="Ver toda la ruta"
            >
              <RutaIcono size={20} />
            </button>
            <div className="flex-1 min-w-0 flex items-baseline justify-between gap-x-2 flex-wrap">
              <span className="font-display font-extrabold text-jungle-950 text-2xl leading-none">{formatearDistancia(restante)}</span>
              {segRestantes > 0 && <span className="font-display font-extrabold text-jungle-950 text-2xl leading-none">{formatearDuracion(segRestantes)}</span>}
              {hora && <span className="font-display font-extrabold text-jungle-950 text-2xl leading-none">{hora}</span>}
            </div>
            {perfil && (
              <button
                onClick={() => setVerPerfil((v) => !v)}
                className="w-11 h-11 rounded-2xl bg-jungle-50 border border-jungle-100 hover:bg-jungle-100 text-jungle-800 flex items-center justify-center flex-none"
                aria-label={verPerfil ? 'Ocultar perfil de elevación' : 'Mostrar perfil de elevación'}
                aria-expanded={verPerfil}
              >
                <ChevronDown size={20} className={'transition-transform ' + (verPerfil ? '' : 'rotate-180')} />
              </button>
            )}
          </div>

          {perfil && verPerfil && <PerfilElevacionGrafica perfil={perfil} avance={avance} />}

          <button
            onClick={() => { setNavegando(false); setLlego(false); }}
            className="mt-3 w-full bg-red-600 hover:bg-red-700 text-white rounded-2xl py-3.5 font-display font-bold text-base flex items-center justify-center gap-2 shadow-md"
          >
            <X size={18} /> Detener
          </button>
        </div>
      </>
    );
  }

  // ---------------- "Antes de salir": guardar el mapa ----------------
  if (confirmando) {
    return (
      <div className="absolute bottom-3 left-3 right-3 sm:left-1/2 sm:right-auto sm:w-[440px] sm:-translate-x-1/2 z-30 bg-white/85 backdrop-blur-xl backdrop-saturate-150 rounded-3xl shadow-xl border border-amber-300 p-4">
        <p className="font-display font-bold text-jungle-950 mb-1">Antes de salir</p>
        <p className="text-xs text-jungle-700 mb-3">
          Parte de esta ruta queda fuera del mapa que descargaste. Si pierdes la señal por el camino,
          esa parte se verá en blanco. Agrégala ahora, con Wi-Fi o datos{props.mbGuardar ? ` (~${props.mbGuardar} MB)` : ''}.
        </p>
        <button
          onClick={() => { setConfirmando(false); props.onGuardar?.(); }}
          className="w-full bg-jungle-700 hover:bg-jungle-800 text-white rounded-xl py-2.5 font-semibold text-sm flex items-center justify-center gap-1.5 mb-2"
        >
          <Download size={15} /> Agregar este trayecto
        </button>
        <button
          onClick={iniciar}
          className="w-full border-2 border-jungle-200 text-jungle-800 rounded-xl py-2 font-semibold text-sm"
        >
          Iniciar sin guardar
        </button>
      </div>
    );
  }

  // ---------------- Hoja con resumen de la ruta (estilo MAPS.ME) ----------------
  const llegada = duracionSegundos
    ? new Date(Date.now() + duracionSegundos * 1000).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
    : null;

  // Pestañas de modo: la elegida va más ancha y con tiempo + distancia; la otra, con su tiempo
  // Fila de modos (como MAPS.ME): el modo elegido es un recuadro con su tiempo y
  // distancia; el otro es solo su ícono (su tiempo queda en la etiqueta accesible).
  const pestana = (m: ModoRuta) => {
    const activa = modo === m;
    const Icono = m === 'auto' ? Car : Footprints;
    const nombre = m === 'auto' ? 'En auto' : 'A pie';
    const dur = activa ? duracionSegundos : props.alterna?.modo === m ? props.alterna.duracionSegundos : undefined;
    const dist = activa ? distanciaMetros : props.alterna?.modo === m ? props.alterna.distanciaMetros : undefined;
    const etiqueta = nombre + (dur ? ': ' + formatearDuracion(dur) : '');
    if (!activa) {
      return (
        <button
          key={m}
          onClick={() => props.onCambiarModo(m)}
          disabled={calculando}
          aria-pressed={false}
          aria-label={etiqueta}
          title={etiqueta}
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-jungle-600 hover:bg-white/80 hover:text-jungle-900 disabled:opacity-60 transition-colors"
        >
          <Icono size={24} />
        </button>
      );
    }
    return (
      <div
        key={m}
        aria-pressed="true"
        aria-label={etiqueta}
        className="rounded-2xl border-2 border-jungle-800 bg-white px-3.5 py-2 flex items-center gap-3 shadow-sm"
      >
        <Icono size={26} className="text-jungle-900 flex-none" />
        <span className="leading-tight">
          <span className="block font-display font-extrabold text-jungle-950 text-xl">
            {dur ? formatearDuracion(dur) : calculando ? '…' : '—'}
          </span>
          {dist ? <span className="block text-xs text-jungle-600">{formatearDistancia(dist)}</span> : null}
        </span>
      </div>
    );
  };

  const botonGuardar = props.onGuardar && !aproximada && !calculando && (
    cubierta || props.guardada ? (
      <p className="mt-3 text-xs font-semibold text-jungle-700 flex items-center gap-1.5">
        <Check size={14} /> Dentro de tu mapa descargado: funciona sin internet
      </p>
    ) : sinInternet ? null : (
      <button
        onClick={props.onGuardar}
        disabled={props.guardando}
        className="mt-3 w-full border-2 border-jungle-200 hover:bg-jungle-50 disabled:opacity-60 text-jungle-800 rounded-2xl py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
      >
        {props.guardando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        Esta ruta sale de tu mapa descargado: agregar este trayecto{props.mbGuardar ? ` (~${props.mbGuardar} MB)` : ''}
      </button>
    )
  );

  return (
    <div className="absolute bottom-3 left-3 right-3 sm:left-1/2 sm:right-auto sm:w-[440px] sm:-translate-x-1/2 z-30 bg-white/90 backdrop-blur-xl backdrop-saturate-150 rounded-3xl shadow-2xl border border-white/60 px-4 pt-2.5 pb-4">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-jungle-900/15" aria-hidden="true" />

      <div className="flex items-center gap-3 mb-3">
        {pestana('auto')}
        {pestana('pie')}
      </div>

      {/* Origen → destino */}
      <div className="rounded-2xl bg-jungle-50/70 border border-jungle-100 px-3.5 py-3 mb-3">
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 rounded-full bg-laguna-600 border-[3px] border-white shadow flex-none" aria-hidden="true" />
          <span className="text-sm font-semibold text-jungle-950 truncate">{props.origen ?? 'Mi ubicación'}</span>
        </div>
        <div className="ml-[9px] my-1 h-3 border-l-2 border-dotted border-jungle-300" aria-hidden="true" />
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 rounded-full bg-sun-500 text-white flex items-center justify-center flex-none shadow" aria-hidden="true"><Flag size={11} strokeWidth={3} /></span>
          <span className="text-sm font-semibold text-jungle-950 truncate">{props.destino ?? 'Destino'}</span>
        </div>
      </div>

      {calculando ? (
        <div className="flex items-center gap-2 text-jungle-700 font-semibold text-sm mb-3">
          <Loader2 size={16} className="animate-spin" /> Calculando ruta…
        </div>
      ) : aproximada ? (
        <div className="mb-3">
          <div className="font-display font-bold text-jungle-950">
            {distanciaMetros ? `≈ ${formatearDistancia(distanciaMetros)} en línea recta` : 'Sin ruta por calles'}
          </div>
          <div className="text-xs text-amber-800">No hay ruta por calles disponible aquí.</div>
        </div>
      ) : (
        <p className="text-xs text-jungle-600 mb-3">
          {modo === 'pie' ? 'Caminando, por calles y carreteras' : 'En auto, la ruta más rápida'}
          {llegada ? ' · Llegas a las ' + llegada : ''}
        </p>
      )}

      {!calculando && !aproximada && props.alternativas && props.alternativas.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold text-jungle-700 mb-1.5">Otras rutas</p>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {props.alternativas.map((a, i) => {
              const dMin = Math.round((a.duracionSegundos - (duracionSegundos ?? 0)) / 60);
              return (
                <button
                  key={i}
                  onClick={() => props.onElegirAlternativa?.(i)}
                  className="flex-none rounded-2xl border-2 border-slate-300 bg-white/70 hover:bg-white px-3 py-1.5 text-left"
                >
                  <span className="block font-display font-bold text-sm text-jungle-950 leading-tight">
                    {formatearDuracion(a.duracionSegundos)}
                    <span className="text-xs font-semibold text-slate-500"> {dMin === 0 ? '≈ igual' : (dMin > 0 ? '+' : '−') + Math.abs(dMin) + ' min'}</span>
                  </span>
                  <span className="block text-[11px] text-jungle-600">{formatearDistancia(a.distanciaMetros)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={alPulsarIniciar}
        disabled={calculando}
        className="w-full bg-jungle-700 hover:bg-jungle-800 disabled:opacity-50 text-white rounded-2xl py-3.5 font-display font-bold text-base flex items-center justify-center gap-2 shadow-md"
      >
        <Navigation size={18} /> Iniciar
      </button>
      {botonGuardar}
    </div>
  );
}
