import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Briefcase, LogOut,
  Home, Compass, Map, MessageCircle, Heart, TreePine, User, Navigation,
  PanelLeftClose, PanelLeftOpen, ChevronLeft, ChevronRight, Search, SlidersHorizontal
} from 'lucide-react';
import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { apiLogout, getUsuarioLocal, type UsuarioSesion } from '../lib/auth';
import AuthModal from './AuthModal';
import BottomNav, { type Tab } from './BottomNav';
import ExploreScreen from './ExploreScreen';
import InicioScreen from './InicioScreen';
import {
  getCatalogoActivo,
  grupoDesdeQuien,
  presupuestoDesdeNivel,
  diasDesdeFechas,
  detectarMunicipio,
  type PreferenciasUsuario,
} from '../lib/chatbot';
import FiltrosViaje, { type FiltrosViajeValor } from './FiltrosViaje';
import MapScreen from './MapScreen';
import ChatAssistant from './ChatAssistant';
import { useLLM } from '../hooks/useLLM';
import FavoritesScreen from './FavoritesScreen';
import SugerenciasChat from './SugerenciasChat';
import PlaceDetail from './PlaceDetail';
import OfflineIndicator from './OfflineIndicator';
import type { Lugar } from '../data/lugares';
import { obtenerRutaPorTramos, obtenerUbicacionGPS, type Coord } from '../lib/routing';
import PerfilScreen from './PerfilScreen';


interface RutaVisible {
  // Arreglo plano de punta a punta — se conserva para no tocar la
  // animación cinematográfica ni el fitBounds de MapScreen, que ya
  // funcionan bien con esto.
  geometria: Coord[];
  // La MISMA ruta pero partida por tramo (parada A → parada B, B →
  // C, ...) — para poder pintar cada tramo de un color distinto en
  // vez de una sola línea verde de punta a punta.
  tramos: Coord[][];
  paradas: { coord: Coord; orden: number }[];
}

const TABS: { id: Tab; label: string; icon: typeof Compass }[] = [
  { id: 'inicio', label: 'Inicio', icon: Home },
  { id: 'explorar', label: 'Explorar', icon: Compass },
  { id: 'chat', label: 'Asistente IA', icon: MessageCircle },
  { id: 'favoritos', label: 'Mis lugares', icon: Heart },
  { id: 'perfil', label: "Mi Perfil", icon: User }
];

export default function AppShell() {
  // "Empezar a chatear" / "Explorar" del menú de la landing (móvil)
  // llegan aquí como /app?tab=chat o /app?tab=explorar — se lee UNA
  // vez al montar, no hace falta que sea reactivo a cambios después.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const deLaUrl = searchParams.get('tab');
    const validos: Tab[] = ['inicio', 'explorar', 'chat', 'favoritos', 'perfil'];
    return validos.includes(deLaUrl as Tab) ? (deLaUrl as Tab) : 'inicio';
  });
  // Solo importa en móvil (el peek de mapa a pantalla completa) —
  // en escritorio el mapa nunca "reemplaza" la pestaña, así que no
  // hace falta volver a ningún lado.
  const [tabAntesDeMapa, setTabAntesDeMapa] = useState<Tab>('explorar');
  // Colapsar el panel izquierdo para que el mapa tome toda la
  // columna — botón sobre el mapa mismo, solo escritorio (ver
  // NOTA ADICIONAL: "que el mapa no sea tan invasivo").
  const [mapaExpandido, setMapaExpandido] = useState(false);

  // Reactivo (no un window.matchMedia suelto) porque ahora decide en
  // qué lugar del árbol vive el mapa vía portal — si cambia mientras
  // la app está abierta (girar el teléfono, redimensionar la
  // ventana), el mapa se tiene que mover de verdad, no solo la
  // primera vez.
  const [esEscritorio, setEsEscritorio] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const actualizar = () => setEsEscritorio(mq.matches);
    mq.addEventListener('change', actualizar);
    return () => mq.removeEventListener('change', actualizar);
  }, []);

  // El mapa es UNA instancia (componente React) que vive montada una
  // sola vez — nunca se desmonta, nunca pierde zoom/posición — y se
  // TELETRANSPORTA (portal) al contenedor que corresponda según el
  // contexto. Antes se lograba re-posicionando el mismo <div> con
  // clases; ahora hace falta un lugar más: adentro del scroll de
  // Explorar en móvil (vista previa, como en la referencia), que es
  // un contenedor DISTINTO al de al lado en escritorio — con solo
  // clases de CSS no alcanza, por eso el portal.
  const refMapaPrincipal = useRef<HTMLDivElement>(null);
  const refMapaInlineExplorar = useRef<HTMLDivElement>(null);
  const [destinoMapa, setDestinoMapa] = useState<HTMLDivElement | null>(null);
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(getUsuarioLocal());
  const [mostrarAuth, setMostrarAuth] = useState(false);
  const [lugarSeleccionado, setLugarSeleccionado] = useState<Lugar | null>(null);
  const [rutaVisible, setRutaVisible] = useState<RutaVisible | null>(null);
  const [cargandoRuta, setCargandoRuta] = useState(false);
  const [errorRuta, setErrorRuta] = useState<string | null>(null);
  // Posición GPS real del turista, capturada la primera vez que pide
  // "cómo llegar" — se usa solo para dibujar el punto azul "tú estás
  // aquí" en el mapa, no se vuelve a consultar en vivo (eso sería
  // navegación tipo Google Maps con recálculo continuo — un proyecto
  // bastante más grande, fuera de alcance por ahora).
  const [miUbicacion, setMiUbicacion] = useState<Coord | null>(null);
  // Explicación PROPIA antes del diálogo nativo del sistema — buena
  // práctica bien conocida: si el navegador pregunta "Permitir
  // ubicación?" en frío, sin contexto, la gente sospecha y le da "No
  // permitir" más seguido. Mostrando primero el por qué (con nuestras
  // propias palabras, no las genéricas del navegador), es más
  // probable que entiendan que es para trazar rutas, no para "robar
  // datos" — y de paso, aquí es donde aparece la pregunta real del
  // sistema, no escondida dentro de "Cómo llegar".
  const [mostrarExplicacionUbicacion, setMostrarExplicacionUbicacion] = useState(false);

  // Riel de escritorio colapsable (base-visual, SECTION-02) — solo
  // afecta el <aside> de lg+, el bottom nav de celular no se toca.
  // Se lee de localStorage en el primer render para que no "salte"
  // de expandido a colapsado después de pintar la pantalla.
  const [sidebarColapsado, setSidebarColapsado] = useState(() => {
    try {
      return localStorage.getItem('sidebar-colapsado') === 'true';
    } catch {
      return false;
    }
  });
  const alternarSidebar = () => {
    setSidebarColapsado((v) => {
      const nuevo = !v;
      try {
        localStorage.setItem('sidebar-colapsado', String(nuevo));
      } catch { /* no crítico */ }
      return nuevo;
    });
  };

  // Base-visual SECTION-04 / módulo de rutas: estado de la barra de
  // filtros, elevado aquí (no vive dentro de FiltrosViaje) para poder
  // traducirlo al modelo del chat. Se deriva a PreferenciasUsuario
  // parcial con useMemo — ChatAssistant solo actúa cuando los tres
  // campos que le importan (dias/presupuesto/grupo) están completos.
  const [filtros, setFiltros] = useState<FiltrosViajeValor | undefined>(undefined);
  // Buscador de Explorar — elevado aquí porque en móvil vive
  // flotando sobre la vista previa del mapa (AppShell), no dentro de
  // ExploreScreen; se pasa como prop controlado para que ambos
  // (el input flotante y la lista de abajo) usen el mismo valor.
  const [busquedaExplorar, setBusquedaExplorar] = useState('');

  // Hoja arrastrable de Explorar en móvil — el mapa de fondo ocupa
  // toda la pantalla; esta hoja blanca se arrastra encima para ver
  // los servicios (subir = más hoja, más servicios; bajar = más
  // mapa), igual que como pediste con la referencia de mindtrip. No
  // es un scroll normal de página — es un panel con su propio alto
  // que se controla con el dedo.
  const ALTURA_HOJA_COLAPSADA = 130;
  const [hojaExplorarAbierta, setHojaExplorarAbierta] = useState(false);
  const [alturaArrastrePx, setAlturaArrastrePx] = useState<number | null>(null);
  const refPanelExplorar = useRef<HTMLDivElement>(null);
  const arrastreRef = useRef<{ y: number; alturaInicialPx: number; contenedorAlto: number; movioSuficiente: boolean } | null>(null);
  const seMovioRef = useRef(false);

  const iniciarArrastreHoja = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const contenedorAlto = refPanelExplorar.current?.clientHeight ?? window.innerHeight;
    const alturaInicialPx = hojaExplorarAbierta ? contenedorAlto * 0.85 : ALTURA_HOJA_COLAPSADA;
    arrastreRef.current = { y: e.clientY, alturaInicialPx, contenedorAlto, movioSuficiente: false };
  };

  const moverArrastreHoja = (e: React.PointerEvent) => {
    const inicio = arrastreRef.current;
    if (!inicio) return;
    const delta = inicio.y - e.clientY; // arrastrar hacia arriba (Y menor) = hoja más alta
    if (Math.abs(delta) > 6) inicio.movioSuficiente = true;
    const nuevaAltura = Math.min(
      Math.max(inicio.alturaInicialPx + delta, ALTURA_HOJA_COLAPSADA),
      inicio.contenedorAlto * 0.9
    );
    setAlturaArrastrePx(nuevaAltura);
  };

  const terminarArrastreHoja = () => {
    const inicio = arrastreRef.current;
    seMovioRef.current = inicio?.movioSuficiente ?? false;
    if (inicio && alturaArrastrePx !== null) {
      const mitad = (ALTURA_HOJA_COLAPSADA + inicio.contenedorAlto * 0.85) / 2;
      setHojaExplorarAbierta(alturaArrastrePx > mitad);
    }
    arrastreRef.current = null;
    setAlturaArrastrePx(null);
  };

  const manejarClickAsaHoja = () => {
    // Si el pointerup de arriba ya venía de un arrastre real, este
    // click es el "fantasma" que el navegador dispara después — se
    // ignora una vez, si no la hoja se movería dos veces con un solo
    // gesto (el snap del arrastre + el toggle del tap).
    if (seMovioRef.current) {
      seMovioRef.current = false;
      return;
    }
    setHojaExplorarAbierta((v) => !v);
  };

  const alturaHojaEstilo: React.CSSProperties =
    alturaArrastrePx !== null
      ? { height: `${alturaArrastrePx}px`, transition: 'none' }
      : { height: hojaExplorarAbierta ? '85%' : `${ALTURA_HOJA_COLAPSADA}px`, transition: 'height 0.25s ease-out' };

  // Mensaje que viene del campo de texto de Inicio (o de una
  // "consulta rápida") — se guarda aquí un instante nada más,
  // mientras cambia a la pestaña de chat y se lo entrega.
  const [mensajeInicialChat, setMensajeInicialChat] = useState<string | undefined>(undefined);
  const preguntarDesdeInicio = (texto: string) => {
    setMensajeInicialChat(texto);
    cambiarTab('chat');
  };
  // Doble clic en "Asistente IA" del riel (solo escritorio) abre el
  // historial — cada clic sube el número, el efecto en ChatAssistant
  // reacciona a CUALQUIER cambio, no a un valor específico.
  const [dispararHistorial, setDispararHistorial] = useState(0);
  const prefsDesdeFiltros = useMemo((): Partial<PreferenciasUsuario> | undefined => {
    if (!filtros) return undefined;
    const dias = diasDesdeFechas(filtros.desde, filtros.hasta);
    // Mismo detector que ya usa el chat en texto libre (tolera errores
    // de escritura) — así "Dónde" se comporta idéntico haya venido de
    // la barra o de un mensaje escrito, sin duplicar lógica de
    // reconocimiento de municipios.
    const municipio = filtros.donde.trim() ? detectarMunicipio(filtros.donde) : null;
    return {
      ...(dias ? { dias } : {}),
      presupuesto: presupuestoDesdeNivel(filtros.presupuesto),
      grupo: grupoDesdeQuien(filtros.quien),
      ...(municipio ? { municipio } : {}),
    };
  }, [filtros]);

  // El mapa en escritorio se ve desde el primer render (al lado de
  // Explorar) — ya no hay un momento de "entrar a la pestaña Mapa"
  // que dispare el aviso de ubicación, así que se revisa una vez al
  // montar. En móvil NO entra por aquí a propósito: ahí el mapa solo
  // aparece cuando lo piden con el botón "Ver mapa", y ese momento
  // sigue disparando el aviso desde cambiarTab (más abajo).
  useEffect(() => {
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    try {
      if (localStorage.getItem('ubicacion-explicada') !== 'true') {
        setMostrarExplicacionUbicacion(true);
      }
    } catch { /* no crítico */ }
  }, []);

  // Instancia ÚNICA y compartida del hook de IA: vive aquí (no dentro
  // de ChatAssistant) para que cualquier pestaña use el mismo estado
  // de la nube sin duplicar lógica.
  const llm = useLLM();

  const verLugar = (l: Lugar) => setLugarSeleccionado(l);

  // Compartida entre verEnMapa (un solo destino) y verRutaEnMapa
  // (varias paradas) — hallazgo real de campo: antes esta lógica solo
  // vivía dentro de verEnMapa, así que una ruta de varios lugares
  // (1, 2, 3) nunca incluía "cómo llegar desde donde estoy hasta el
  // primer lugar" — solo trazaba lugar→lugar→lugar, dejando el primer
  // tramo (tú→lugar 1) sin resolver. Ahora ambas funciones parten del
  // mismo punto real, sea online o para guardarse offline después.
  const obtenerMiUbicacionActual = async (): Promise<Coord | null> => {
    const resultado = await obtenerUbicacionGPS();

    const origen = resultado?.coord ?? null;
    setMiUbicacion(origen);

    // Ningún sitio web puede forzar que Android/iOS usen ubicación
    // "precisa" en vez de "aproximada" — es una decisión que el
    // sistema reserva exclusivamente al usuario, por privacidad. Lo
    // que SÍ podemos hacer: avisar con claridad cuando la precisión
    // que llegó es mala, en vez de poner el punto azul mal ubicado
    // sin ninguna explicación.
    if (resultado && resultado.precisionMetros > 500) {
      console.warn(
        `[TuxtlasGO] Precisión del GPS muy baja: ${Math.round(resultado.precisionMetros)}m de margen de error.`
      );
      setErrorRuta(
        `Tu ubicación no es muy precisa (margen de ~${Math.round(
          resultado.precisionMetros
        )}m). Activa "Ubicación precisa" en los permisos de esta app, en Ajustes de tu teléfono, para que el punto azul quede exacto.`
      );
    }

    return origen;
  };

  // Derivado, no estado: el mapa se ve al lado en Explorar siempre, y
  // en Chat solo cuando ya hay una ruta que mostrar — antes de
  // preguntar algo, ese espacio lo ocupan las sugerencias.
  const mostrarMapaAlLado = tab === 'explorar' || (tab === 'chat' && !!rutaVisible);

  // Decide a qué contenedor apunta el portal del mapa. Corre DESPUÉS
  // de que el DOM ya se actualizó (useLayoutEffect, no useEffect) —
  // así los refs de los contenedores ya existen cuando se leen, sin
  // parpadeo de un frame sin mapa.
  useLayoutEffect(() => {
    const destino =
      tab === 'explorar' && !esEscritorio
        ? refMapaInlineExplorar.current
        : refMapaPrincipal.current;
    setDestinoMapa(destino);
  }, [tab, esEscritorio]);


  // El mapa ahora es una sola instancia persistente (no una pestaña
  // que se "entra" y "sale"). En escritorio, si ya estás en Explorar
  // o Chat, el mapa YA está visible al lado — no hace falta cambiar
  // de pestaña, solo actualizar rutaVisible. Solo se cambia de
  // pestaña cuando el mapa no está a la vista: en Favoritos/Perfil
  // en escritorio, o en cualquier pestaña en móvil (ahí no hay
  // "al lado" posible, es pantalla completa o nada).
  const mostrarMapaConRuta = () => {
    const mapaYaVisibleAlLado =
      (tab === 'explorar' || tab === 'chat') &&
      window.matchMedia('(min-width: 1024px)').matches;
    if (!mapaYaVisibleAlLado) cambiarTab('mapa');
  };

  const verEnMapa = async () => {
    if (!lugarSeleccionado) return;
    const destino = lugarSeleccionado;
    setLugarSeleccionado(null);
    setCargandoRuta(true);
    setErrorRuta(null);

    const paradas = [{ coord: destino.coords as Coord, orden: 1 }];
    const origen = await obtenerMiUbicacionActual();
    const coords: Coord[] = origen
      ? [origen, destino.coords as Coord]
      : [destino.coords as Coord];

    try {
      if (coords.length >= 2) {
        const { tramos } = await obtenerRutaPorTramos(coords);
        setRutaVisible({
          geometria: tramos.flatMap((t) => t.geometria),
          tramos: tramos.map((t) => t.geometria),
          paradas,
        });
      } else {
        setRutaVisible({ geometria: coords, tramos: [], paradas });
      }
    } catch {
      // Sin internet → línea recta silenciosa, sin mostrar error
      setRutaVisible({
        geometria: coords,
        tramos: coords.length >= 2 ? [coords] : [],
        paradas,
      });
    }
    setCargandoRuta(false);
    mostrarMapaConRuta();
  };

  const verRutaEnMapa = async (lugares: Lugar[]) => {
    if (lugares.length < 2) return;
    setCargandoRuta(true);
    setErrorRuta(null);
    setLugarSeleccionado(null);

    // Las paradas numeradas (1, 2, 3...) son SOLO los lugares de la
    // ruta — tu propia posición no cuenta como una "parada", se
    // dibuja aparte como el punto azul (ver PinMiUbicacion en
    // MapScreen.tsx), igual que en verEnMapa.
    const paradas = lugares.map((l, i) => ({ coord: l.coords as Coord, orden: i + 1 }));
    const origen = await obtenerMiUbicacionActual();
    const puntosRuta: Coord[] = origen
      ? [origen, ...lugares.map((l) => l.coords as Coord)]
      : lugares.map((l) => l.coords as Coord);

    try {
      const { tramos } = await obtenerRutaPorTramos(puntosRuta);
      setRutaVisible({
        geometria: tramos.flatMap((t) => t.geometria),
        tramos: tramos.map((t) => t.geometria),
        paradas,
      });
      mostrarMapaConRuta();
    } catch (err) {
      console.warn('[TuxtlasGO] OSRM no disponible:', err);
      // Línea recta entre paradas — silencioso, sin toast de error
      setRutaVisible({ geometria: puntosRuta, tramos: [puntosRuta], paradas });
      mostrarMapaConRuta();
    } finally {
      setCargandoRuta(false);
    }
  };

  const cambiarTab = (nuevoTab: Tab) => {
    // Antes esto borraba rutaVisible al salir de "mapa" — tenía
    // sentido cuando el mapa era una pestaña que se "cerraba". Ahora
    // es una instancia persistente: la ruta se queda dibujada hasta
    // que el turista la quite explícitamente (botón "×" en
    // MapScreen, onLimpiarRuta), sin importar a qué pestaña te
    // muevas.
    if (nuevoTab === 'mapa' && tab !== 'mapa') {
      setTabAntesDeMapa(tab);
      try {
        if (localStorage.getItem('ubicacion-explicada') !== 'true') {
          setMostrarExplicacionUbicacion(true);
        }
      } catch { /* localStorage no disponible, no es crítico */ }
    }
    setTab(nuevoTab);
  };

  // Se llama SOLO cuando la persona toca "Permitir ubicación" en
  // nuestra propia explicación — eso es justo lo que dispara el
  // diálogo real del sistema ("Para uso de esta app se necesita
  // ubicación — Permitir / No permitir"). Ningún código puede mostrar
  // ese diálogo con otras palabras; lo único que controlamos es EL
  // MOMENTO en que se dispara y la explicación que va justo antes.
  const pedirPermisoUbicacion = () => {
    setMostrarExplicacionUbicacion(false);
    try {
      localStorage.setItem('ubicacion-explicada', 'true');
    } catch { /* no crítico */ }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => { }, // no hace falta usar el resultado aquí — solo dispara el permiso
        (err) => console.warn(`[TuxtlasGO] Permiso de ubicación: ${err.code} ${err.message}`),
        { timeout: 8000, enableHighAccuracy: true }
      );
    }
  };

  return (
    /* ── Layout raíz ── mobile: column flex  |  desktop: row flex ── */
    <div className="flex flex-col lg:flex-row bg-jungle-50 h-screen [height:100dvh] overflow-hidden">
      <OfflineIndicator />

      {/* ══════════════ SIDEBAR (solo desktop) ══════════════ */}
      <aside
        className={`hidden lg:flex flex-col flex-shrink-0 bg-jungle-900 text-white transition-[width] duration-200 ease-in-out ${sidebarColapsado ? 'w-[72px]' : 'w-56 xl:w-64'
          }`}
      >
        {/* Arriba: ícono + wordmark juntos como siempre — sueltos se
            veían mal, ver captura. El botón de colapsar se queda acá
            al lado (eso sí funcionaba bien). */}
        <div
          className={`border-b border-jungle-700/50 ${sidebarColapsado ? 'py-4 flex flex-col items-center gap-2' : 'py-4 px-4 flex items-center justify-between'
            }`}
        >
          <Link to="/" title={sidebarColapsado ? 'TuxtlasGO' : undefined} className="flex items-center gap-2 flex-shrink-0 min-w-0">
            <TreePine size={22} className="text-amber-400 flex-shrink-0" />
            {!sidebarColapsado && (
              <span className="font-display font-extrabold text-lg tracking-tight truncate">
                TuxtlasGO
              </span>
            )}
          </Link>
          <button
            onClick={alternarSidebar}
            title={sidebarColapsado ? 'Expandir menú' : 'Colapsar menú'}
            className="w-8 h-8 rounded-full flex items-center justify-center text-jungle-300 hover:bg-jungle-800 hover:text-white transition-colors flex-shrink-0"
          >
            {sidebarColapsado ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Nav items — doble clic en "Asistente IA" abre el
            historial de conversaciones (ver dispararHistorial más
            abajo): en escritorio ya se ve el chat con solo un clic,
            así que un ícono aparte solo para el historial hubiera
            sido redundante con el botón de colapsar de arriba. */}
        <nav className={`flex-1 py-4 space-y-1 ${sidebarColapsado ? 'px-2' : 'px-3'}`}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const activo = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => cambiarTab(t.id)}
                onDoubleClick={() => { if (t.id === 'chat') setDispararHistorial((v) => v + 1); }}
                title={sidebarColapsado ? t.label : undefined}
                className={`w-full flex items-center gap-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${sidebarColapsado ? 'px-0 justify-center' : 'px-3'
                  } ${activo
                    ? 'bg-jungle-700 text-white shadow-sm'
                    : 'text-jungle-300 hover:bg-jungle-800 hover:text-white'
                  }`}
              >
                <Icon size={18} strokeWidth={activo ? 2.5 : 2} className="flex-shrink-0" />
                {!sidebarColapsado && t.label}
              </button>
            );
          })}
        </nav>

        {/* Acciones de usuario */}
        <div className={`py-4 border-t border-jungle-700/50 space-y-2 ${sidebarColapsado ? 'px-2' : 'px-3'}`}>
          <Link
            to="/prestador"
            title={sidebarColapsado ? 'Portal prestadores' : undefined}
            className={`flex items-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-jungle-300 hover:bg-jungle-800 hover:text-white transition-all ${sidebarColapsado ? 'px-0 justify-center' : 'px-3'
              }`}
          >
            <Briefcase size={16} className="flex-shrink-0" />
            {!sidebarColapsado && 'Portal prestadores'}
          </Link>

          {usuario ? (
            <div className={`flex items-center gap-2 py-2 ${sidebarColapsado ? 'px-0 justify-center' : 'px-3'}`}>
              <span
                className="w-7 h-7 rounded-full bg-jungle-700 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0"
                title={sidebarColapsado ? usuario.nombre : undefined}
              >
                {usuario.nombre.charAt(0).toUpperCase()}
              </span>
              {!sidebarColapsado && (
                <>
                  <span className="text-sm text-jungle-200 truncate flex-1">{usuario.nombre.split(' ')[0]}</span>
                  <button
                    onClick={async () => { await apiLogout(); setUsuario(null); }}
                    className="text-jungle-400 hover:text-red-400 transition-colors"
                    title="Cerrar sesión"
                  >
                    <LogOut size={15} />
                  </button>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={() => setMostrarAuth(true)}
              title={sidebarColapsado ? 'Iniciar sesión' : undefined}
              className={`w-full flex items-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-jungle-950 transition-colors ${sidebarColapsado ? 'px-0 justify-center' : 'px-3'
                }`}
            >
              <User size={16} className="flex-shrink-0" />
              {!sidebarColapsado && 'Iniciar sesión'}
            </button>
          )}
        </div>
      </aside>

      {/* ══════════════ ÁREA PRINCIPAL ══════════════ */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">

        {/* Toast error ruta */}
        {errorRuta && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-amber-100 border border-amber-300 text-amber-900 text-xs px-3 py-2 rounded-lg shadow-md max-w-xs text-center">
            {errorRuta}
            <button onClick={() => setErrorRuta(null)} className="ml-2 font-bold">×</button>
          </div>
        )}

        {/* Explicación propia antes del permiso de ubicación real del
            sistema — se muestra UNA sola vez, la primera vez que se
            abre la pestaña de Mapa. */}
        {mostrarExplicacionUbicacion && (
          <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-5 max-w-sm animate-fade-in">
              <div className="w-12 h-12 rounded-full bg-jungle-100 flex items-center justify-center mb-3">
                <Navigation size={22} className="text-jungle-700" />
              </div>
              <h3 className="font-display font-bold text-lg text-jungle-950 mb-1">
                TuxtlasGO quiere ubicarte
              </h3>
              <p className="text-sm text-jungle-700 mb-4">
                Es para trazarte la ruta real desde donde estás hasta el
                lugar que elijas — no se comparte con nadie más, se usa
                solo en tu teléfono. Tu navegador te va a preguntar a
                continuación; elige <strong>"Permitir"</strong> (y de ser
                posible, <strong>"ubicación precisa"</strong>) para que
                el punto en el mapa quede exacto.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setMostrarExplicacionUbicacion(false);
                    try { localStorage.setItem('ubicacion-explicada', 'true'); } catch { /* ok */ }
                  }}
                  className="flex-1 border-2 border-jungle-200 text-jungle-800 py-2.5 rounded-xl font-semibold text-sm"
                >
                  Ahora no
                </button>
                <button
                  onClick={pedirPermisoUbicacion}
                  className="flex-1 bg-jungle-700 text-white py-2.5 rounded-xl font-semibold text-sm"
                >
                  Permitir ubicación
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Overlay carga ruta */}
        {cargandoRuta && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
            <div className="bg-white rounded-2xl px-6 py-5 shadow-xl flex flex-col items-center gap-3 max-w-xs">
              <div className="w-8 h-8 border-2 border-jungle-200 border-t-jungle-700 rounded-full animate-spin" />
              <div className="text-sm font-semibold text-jungle-900">Calculando ruta…</div>
              <div className="text-xs text-jungle-600 text-center">
                Trazando el camino por carretera. Se guardará para usarse sin internet.
              </div>
            </div>
          </div>
        )}

        {/* Contenido principal — el mapa es UNA sola instancia que se
            reposiciona (no una pestaña más): al lado de Explorar
            siempre, al lado de Chat SOLO cuando ya hay una ruta que
            mostrar (antes de preguntar algo, ese espacio lo ocupan
            sugerencias — ver SugerenciasChat, corrección de la pasada
            anterior). En móvil, a pantalla completa con "Volver". Se
            mantiene siempre montada para no perder zoom/posición. */}
        <main className="flex-1 overflow-hidden min-h-0 flex flex-col lg:flex-row">
          {/*para eacceder y poder entrar al perfil*/}
          {tab === 'perfil' && (
            <div className="flex-1 h-full overflow-y-auto">
              <PerfilScreen
                onVolver={() => cambiarTab('inicio')}
                onIniciarSesion={() => setMostrarAuth(true)}
                onCerrarSesion={async () => { await apiLogout(); setUsuario(null); }}
              />
            </div>
          )}

          {tab === 'inicio' && (
            <div className="flex-1 h-full">
              <InicioScreen
                onVerLugar={verLugar}
                onPreguntar={preguntarDesdeInicio}
                ubicacion={filtros?.donde}
              />
            </div>
          )}

          {tab === 'explorar' && (
            <div
              ref={refPanelExplorar}
              className={`relative flex-1 lg:flex-none lg:w-[42%] lg:min-w-[380px] lg:max-w-[560px] lg:border-r lg:border-jungle-100 h-full overflow-hidden lg:overflow-y-auto ${mapaExpandido ? 'lg:hidden' : ''
                }`}
            >
              {/* MÓVIL: el mapa es el fondo, a pantalla completa
                  dentro de este panel — ya no una cajita de 224px.
                  Es el MISMO mapa de siempre movido aquí por portal.
                  Tocar el mapa (no el buscador, no la hoja) lleva a
                  la vista completa. */}
              <div
                ref={refMapaInlineExplorar}
                onClick={() => cambiarTab('mapa')}
                className="lg:hidden absolute inset-0 bg-jungle-100 cursor-pointer"
              >
                <div
                  className="absolute top-3 left-3 right-3 z-10 flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-jungle-500" />
                    <input
                      type="search"
                      value={busquedaExplorar}
                      onChange={(e) => setBusquedaExplorar(e.target.value)}
                      placeholder="Buscar lugares, comida, hoteles..."
                      className="w-full bg-white text-jungle-950 placeholder:text-jungle-500 rounded-full pl-10 pr-4 py-3 text-sm shadow-lg focus:outline-none focus:ring-2 focus:ring-jungle-400"
                    />
                  </div>
                  <button
                    type="button"
                    className="w-11 h-11 flex-shrink-0 rounded-full bg-white text-jungle-700 shadow-lg flex items-center justify-center"
                    aria-label="Filtros del mapa"
                  >
                    <SlidersHorizontal size={16} />
                  </button>
                </div>
              </div>

              {/* MÓVIL: hoja arrastrable con los servicios, ENCIMA del
                  mapa. Arrastra el asa (o tócala) para subirla y ver
                  Explorar; suéltala abajo para volver a ver el mapa
                  casi completo — dos estados con imán al soltar, no
                  cualquier alto intermedio. */}
              <div
                className="lg:hidden absolute inset-x-0 bottom-0 z-[45] bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(12,10,9,0.18)] flex flex-col"
                style={alturaHojaEstilo}
              >
                <div
                  onPointerDown={iniciarArrastreHoja}
                  onPointerMove={moverArrastreHoja}
                  onPointerUp={terminarArrastreHoja}
                  onPointerCancel={terminarArrastreHoja}
                  onClick={manejarClickAsaHoja}
                  className="flex-shrink-0 pt-2.5 pb-2 flex flex-col items-center gap-1.5 cursor-grab active:cursor-grabbing touch-none select-none"
                >
                  <div className="w-10 h-1.5 rounded-full bg-obsidiana-900/15" />
                  <span className="text-[11px] font-semibold text-obsidiana-800/50">
                    {hojaExplorarAbierta ? 'Volver al mapa' : 'Ver servicios'}
                  </span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                  <ExploreScreen
                    onVerLugar={verLugar}
                    lugares={getCatalogoActivo()}
                    busqueda={busquedaExplorar}
                    onBusquedaChange={setBusquedaExplorar}
                  />
                </div>
              </div>

              {/* ESCRITORIO: sin mapa aquí (va en su propia columna al
                  lado) — scroll normal de toda la vida, sin hoja. */}
              <div className="hidden lg:block h-full overflow-y-auto">
                <ExploreScreen
                  onVerLugar={verLugar}
                  lugares={getCatalogoActivo()}
                  busqueda={busquedaExplorar}
                  onBusquedaChange={setBusquedaExplorar}
                />
              </div>
            </div>
          )}

          <div
            className={`${tab === 'chat' ? 'flex' : 'hidden'} ${mapaExpandido ? 'lg:hidden' : ''
              } flex-col lg:flex-none lg:w-[42%] lg:min-w-[380px] lg:max-w-[560px] lg:border-r lg:border-jungle-100 h-full min-h-0`}
          >
            <div className="flex-shrink-0 px-3 pt-3 pb-2 bg-jungle-50 border-b border-jungle-100 overflow-x-auto">
              <FiltrosViaje valor={filtros} onCambiar={setFiltros} />
            </div>
            <div className="flex-1 min-h-0">
              <ChatAssistant
                onVerLugar={verLugar}
                onVerRutaEnMapa={verRutaEnMapa}
                llm={llm}
                prefsDesdeFiltros={prefsDesdeFiltros}
                viajaConMascota={(filtros?.quien.mascotas ?? 0) > 0}
                mensajeInicial={mensajeInicialChat}
                onMensajeInicialConsumido={() => setMensajeInicialChat(undefined)}
                dispararHistorial={dispararHistorial}
                accionSobreInput={
                  rutaVisible ? (
                    <div className="lg:hidden px-3 pt-2 flex-shrink-0">
                      <button
                        onClick={() => cambiarTab('mapa')}
                        className="w-full flex items-center justify-center gap-1.5 bg-jungle-50 hover:bg-jungle-100 text-jungle-800 rounded-xl py-2.5 text-sm font-semibold border border-jungle-100"
                      >
                        <Map size={15} /> Ver ruta en el mapa
                      </button>
                    </div>
                  ) : null
                }
              />
            </div>
          </div>

          {tab === 'favoritos' && (
            <div className="flex-1 h-full overflow-y-auto">
              <FavoritesScreen onVerLugar={verLugar} onVerRutaEnMapa={verRutaEnMapa} />
            </div>
          )}

          {/* Sugerencias — ocupa el lugar del mapa en Chat mientras no
              haya nada preguntado todavía. Solo escritorio: en móvil
              el chat es de un solo panel, no hay "al lado". */}
          {tab === 'chat' && !rutaVisible && (
            <div className="hidden lg:block lg:flex-1 h-full min-h-0 overflow-y-auto bg-amate-50">
              <SugerenciasChat onVerLugar={verLugar} />
            </div>
          )}

          {/* MAPA — instancia única y persistente, nunca se desmonta:
              - explorar (escritorio): columna derecha, al lado.
              - explorar (móvil): NO aquí — vive como vista previa
                dentro del scroll de Explorar (portal, ver arriba).
              - chat + ya hay ruta (escritorio): columna derecha.
              - mapa (peek de móvil, o "expandir" en escritorio):
                pantalla/columna completa.
              - favoritos/perfil, o chat sin ruta: oculto. */}
          <div
            ref={refMapaPrincipal}
            className={
              tab === 'mapa' || (mostrarMapaAlLado && mapaExpandido)
                ? 'flex-1 h-full min-h-0 flex flex-col relative'
                : mostrarMapaAlLado
                  ? 'hidden lg:flex lg:flex-1 h-full min-h-0 flex-col relative'
                  : 'hidden'
            }
          >
            {tab === 'mapa' && (
              <div className="lg:hidden flex-shrink-0 flex items-center gap-2 px-3 py-2.5 bg-white border-b border-jungle-100">
                <button
                  onClick={() => cambiarTab(tabAntesDeMapa)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-jungle-800"
                >
                  <ArrowLeft size={16} /> Volver
                </button>
              </div>
            )}

            {/* Colapsar/expandir — solo tiene sentido en escritorio,
                cuando el mapa está AL LADO de algo (si no hay nada al
                lado, ya está a pantalla completa por default). Así se
                reduce lo invasivo que se siente el mapa: quien quiera
                más espacio para el chat lo puede pedir. */}
            {tab !== 'mapa' && mostrarMapaAlLado && (
              <button
                onClick={() => setMapaExpandido((v) => !v)}
                title={mapaExpandido ? 'Mostrar panel' : 'Expandir mapa'}
                className="hidden lg:flex absolute top-3 left-3 z-30 w-9 h-9 bg-white rounded-full shadow-md border border-jungle-100 items-center justify-center text-jungle-800 hover:bg-jungle-50"
              >
                {mapaExpandido ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
            )}
          </div>
        </main>

        {/* El mapa se renderiza UNA vez aquí y se teletransporta
            (portal) al contenedor activo — nunca se desmonta al
            cambiar de pestaña o de tamaño de pantalla, así conserva
            zoom/posición siempre. */}
        {destinoMapa && createPortal(
          <MapScreen
            onVerLugar={verLugar}
            rutaResaltada={rutaVisible?.geometria}
            tramosResaltados={rutaVisible?.tramos}
            paradasResaltadas={rutaVisible?.paradas}
            miUbicacion={miUbicacion ?? undefined}
            onLimpiarRuta={() => { setRutaVisible(null); setMiUbicacion(null); }}
            vistaCompacta={tab === 'explorar' && !esEscritorio}
          />,
          destinoMapa
        )}

        {/* Bottom nav solo en móvil */}
        <div className="lg:hidden">
          <BottomNav activa={tab === 'mapa' ? tabAntesDeMapa : tab} onChange={cambiarTab} />
        </div>
      </div>

      {/* PlaceDetail overlay */}
      {lugarSeleccionado && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998, touchAction: 'none' }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
          <PlaceDetail
            lugar={lugarSeleccionado}
            onClose={() => setLugarSeleccionado(null)}
            onVerEnMapa={verEnMapa}
          />
        </>
      )}

      {mostrarAuth && (
        <AuthModal
          onClose={() => setMostrarAuth(false)}
          onSuccess={(u: UsuarioSesion) => { setUsuario(u); setMostrarAuth(false); }}
        />
      )}
    </div>
  );
}