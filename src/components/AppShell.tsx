import { Link } from 'react-router-dom';
import {
  ArrowLeft, Briefcase, LogOut, MoreVertical,
  Compass, Map, MessageCircle, Heart, TreePine, User, Navigation
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { apiLogout, getUsuarioLocal, type UsuarioSesion } from '../lib/auth';
import AuthModal from './AuthModal';
import BottomNav, { type Tab } from './BottomNav';
import ExploreScreen from './ExploreScreen';
import { getCatalogoActivo } from '../lib/chatbot';
import MapScreen from './MapScreen';
import ChatAssistant from './ChatAssistant';
import { useLLM } from '../hooks/useLLM';
import FavoritesScreen from './FavoritesScreen';
import PlaceDetail from './PlaceDetail';
import OfflineIndicator from './OfflineIndicator';
import type { Lugar } from '../data/lugares';
import { obtenerRutaPorCarretera, type Coord } from '../lib/routing';
import PerfilScreen from './PerfilScreen';


interface RutaVisible {
  geometria: Coord[];
  paradas: { coord: Coord; orden: number }[];
}

const TABS: { id: Tab; label: string; icon: typeof Compass }[] = [
  { id: 'explorar', label: 'Explorar', icon: Compass },
  { id: 'mapa', label: 'Mapa', icon: Map },
  { id: 'chat', label: 'Asistente IA', icon: MessageCircle },
  { id: 'favoritos', label: 'Mis lugares', icon: Heart },
  { id: 'perfil', label: "Mi Perfil", icon: User }
];

export default function AppShell() {
  const [tab, setTab] = useState<Tab>('explorar');
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

  // Menú compacto móvil ("⋮") que reemplaza los dos botones sueltos
  // "Soy prestador" + "Entrar" flotando encima del contenido — hallazgo
  // de campo: se veían mal sobre todo encima del mapa (dos pastillas
  // separadas competían visualmente con los controles del mapa). Ahora
  // es un solo botón circular; al tocarlo se despliega una tarjeta con
  // ambas acciones, igual de accesibles pero sin ensuciar la vista.
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const menuMovilRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuMovilAbierto) return;
    const cerrarSiFuera = (e: Event) => {
      if (menuMovilRef.current && !menuMovilRef.current.contains(e.target as Node)) {
        setMenuMovilAbierto(false);
      }
    };
    document.addEventListener('mousedown', cerrarSiFuera);
    document.addEventListener('touchstart', cerrarSiFuera);
    return () => {
      document.removeEventListener('mousedown', cerrarSiFuera);
      document.removeEventListener('touchstart', cerrarSiFuera);
    };
  }, [menuMovilAbierto]);

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
    const resultado = await new Promise<{ coord: Coord; precisionMetros: number } | null>(
      (res) => {
        if (!navigator.geolocation) {
          console.warn('[TuxtlasGO] navigator.geolocation no existe en este navegador.');
          return res(null);
        }
        // Diagnóstico: si el origen no es https ni localhost, el GPS
        // se bloquea SIEMPRE por regla del navegador (no es un bug) —
        // esto se ve seguido al probar desde una IP local (ej.
        // http://192.168.x.x:5173) en vez de la URL https desplegada.
        if (
          window.location.protocol !== 'https:' &&
          window.location.hostname !== 'localhost'
        ) {
          console.warn(
            `[TuxtlasGO] GPS bloqueado: estás en "${window.location.origin}" — el navegador solo permite geolocalización en https:// o localhost.`
          );
        }
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            res({
              coord: [pos.coords.latitude, pos.coords.longitude],
              precisionMetros: pos.coords.accuracy,
            }),
          (err) => {
            console.warn(
              `[TuxtlasGO] No se pudo obtener el GPS — código ${err.code}: ${err.message}`
            );
            res(null);
          },
          { timeout: 8000, enableHighAccuracy: true, maximumAge: 0 }
        );
      }
    );

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
        const ruta = await obtenerRutaPorCarretera(coords);
        setRutaVisible({ geometria: ruta.geometria, paradas });
      } else {
        setRutaVisible({ geometria: coords, paradas });
      }
    } catch {
      // Sin internet → línea recta silenciosa, sin mostrar error
      setRutaVisible({ geometria: coords, paradas });
    }
    setCargandoRuta(false);
    setTab('mapa');
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
      const ruta = await obtenerRutaPorCarretera(puntosRuta);
      setRutaVisible({ geometria: ruta.geometria, paradas });
      setTab('mapa');
    } catch (err) {
      console.warn('[TuxtlasGO] OSRM no disponible:', err);
      // Línea recta entre paradas — silencioso, sin toast de error
      setRutaVisible({ geometria: puntosRuta, paradas });
      setTab('mapa');
    } finally {
      setCargandoRuta(false);
    }
  };

  const cambiarTab = (nuevoTab: Tab) => {
    if (nuevoTab !== 'mapa' && rutaVisible) setRutaVisible(null);
    if (nuevoTab === 'mapa') {
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
    <div className="flex flex-col lg:flex-row bg-jungle-50 h-screen [height:100dvh]">
      <OfflineIndicator />

      {/* ══════════════ SIDEBAR (solo desktop) ══════════════ */}
      <aside className="hidden lg:flex flex-col w-56 xl:w-64 flex-shrink-0 bg-jungle-900 text-white">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-jungle-700/50">
          <Link to="/" className="flex items-center gap-2 group">
            <TreePine size={22} className="text-amber-400" />
            <span className="font-display font-extrabold text-lg tracking-tight group-hover:text-amber-300 transition-colors">
              TuxtlasGO
            </span>
          </Link>
          <p className="text-[11px] text-jungle-400 mt-0.5">Los Tuxtlas, Veracruz</p>

        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const activo = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => cambiarTab(t.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activo
                  ? 'bg-jungle-700 text-white shadow-sm'
                  : 'text-jungle-300 hover:bg-jungle-800 hover:text-white'
                  }`}
              >
                <Icon size={18} strokeWidth={activo ? 2.5 : 2} />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Acciones de usuario */}
        <div className="px-3 py-4 border-t border-jungle-700/50 space-y-2">
          <Link
            to="/prestador"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-jungle-300 hover:bg-jungle-800 hover:text-white transition-all"
          >
            <Briefcase size={16} />
            Portal prestadores
          </Link>



          {usuario ? (
            <div className="flex items-center gap-2 px-3 py-2">
              <User size={15} className="text-jungle-400 flex-shrink-0" />
              <span className="text-sm text-jungle-200 truncate flex-1">{usuario.nombre.split(' ')[0]}</span>
              <button
                onClick={async () => { await apiLogout(); setUsuario(null); }}
                className="text-jungle-400 hover:text-red-400 transition-colors"
                title="Cerrar sesión"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setMostrarAuth(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-jungle-950 transition-colors"
            >
              <User size={16} />
              Iniciar sesión
            </button>
          )}
        </div>
      </aside>

      {/* ══════════════ ÁREA PRINCIPAL ══════════════ */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">

        {/* Header flotante móvil — spacer con altura real y
            position:relative. ESTA es la causa raíz del bug de
            superposición ("Entrar" tapando el error, el "0%" raro del
            principio): antes el header (position:absolute) no tenía
            NINGÚN ancestro con position:relative, así que se anclaba
            a toda la pantalla en vez de a esta columna de contenido —
            no reservaba espacio real, sin importar qué margen se le
            pusiera a lo que viene después. Ahora el spacer sí reserva
            el espacio (h-14 en móvil, nada en desktop), y el header
            flota DENTRO de él — visualmente igual, pero con un límite
            real que empuja correctamente al resto del contenido. */}
        <div className="relative h-14 lg:hidden flex-shrink-0">
          <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between">
            <Link
              to="/"
              className="bg-white/90 backdrop-blur shadow-md rounded-full w-9 h-9 flex items-center justify-center text-jungle-900 hover:bg-white flex-shrink-0"
            >
              <ArrowLeft size={18} />
            </Link>

            <Link
              to="/"
              className="bg-white/90 backdrop-blur shadow-sm rounded-full px-3 h-9 flex items-center gap-1.5 text-jungle-900 font-display font-extrabold text-sm tracking-tight hover:bg-white"
            >
              <TreePine size={16} className="text-jungle-700 flex-shrink-0" />
              TuxtlasGO
            </Link>

            {/* Menú compacto: un solo botón, sin pastillas sueltas
                encimadas al contenido (antes eran 2-3 elementos aquí
                mismo, chocaban visualmente sobre todo en el mapa). */}
            <div className="relative" ref={menuMovilRef}>
              <button
                onClick={() => setMenuMovilAbierto((v) => !v)}
                className="bg-white/90 backdrop-blur shadow-md rounded-full w-9 h-9 flex items-center justify-center text-jungle-900 hover:bg-white border border-jungle-100"
                aria-label="Más opciones"
                aria-expanded={menuMovilAbierto}
              >
                {usuario ? (
                  <span className="w-6 h-6 rounded-full bg-jungle-700 text-white text-[11px] font-bold flex items-center justify-center">
                    {usuario.nombre.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <MoreVertical size={18} />
                )}
              </button>

              {menuMovilAbierto && (
                <div className="absolute top-11 right-0 w-52 bg-white rounded-2xl shadow-xl border border-jungle-100 py-1.5 overflow-hidden animate-fade-in">
                  <Link
                    to="/prestador"
                    onClick={() => setMenuMovilAbierto(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-jungle-800 hover:bg-jungle-50"
                  >
                    <Briefcase size={15} /> Soy prestador
                  </Link>
                  <div className="h-px bg-jungle-100 mx-2 my-1" />
                  {usuario ? (
                    <>
                      <div className="flex items-center gap-2 px-4 py-2 text-sm text-jungle-700">
                        <User size={15} className="flex-shrink-0" />
                        <span className="truncate">{usuario.nombre}</span>
                      </div>
                      <button
                        onClick={async () => {
                          await apiLogout();
                          setUsuario(null);
                          setMenuMovilAbierto(false);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        <LogOut size={15} /> Cerrar sesión
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setMenuMovilAbierto(false);
                        setMostrarAuth(true);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-jungle-800 hover:bg-jungle-50"
                    >
                      <User size={15} /> Entrar
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

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

        {/* Contenido principal */}
        <main className="flex-1 overflow-hidden min-h-0">
          {/*para eacceder y poder entrar al perfil*/}
          {tab === 'perfil' && (
            <div className="h-full overflow-y-auto">
              <PerfilScreen onVolver={() => setTab('explorar')} />
            </div>
          )}

          {tab === 'explorar' && (
            <div className="h-full overflow-y-auto">
              <ExploreScreen onVerLugar={verLugar} lugares={getCatalogoActivo()} />
            </div>
          )}
          {tab === 'mapa' && (
            <MapScreen
              onVerLugar={verLugar}
              rutaResaltada={rutaVisible?.geometria}
              paradasResaltadas={rutaVisible?.paradas}
              miUbicacion={miUbicacion ?? undefined}
              onLimpiarRuta={() => { setRutaVisible(null); setMiUbicacion(null); }}
            />
          )}
          <div style={{ display: tab === 'chat' ? 'flex' : 'none', height: '100%', flexDirection: 'column' }}>
            <ChatAssistant onVerLugar={verLugar} onVerRutaEnMapa={verRutaEnMapa} llm={llm} />
          </div>
          {tab === 'favoritos' && (
            <div className="h-full overflow-y-auto">
              <FavoritesScreen
                onVerLugar={verLugar}
                onVerRutaEnMapa={(lugares) => { verRutaEnMapa(lugares); setTab('mapa'); }}
              />
            </div>
          )}



        </main>

        {/* Bottom nav solo en móvil */}
        <div className="lg:hidden">
          <BottomNav activa={tab} onChange={cambiarTab} />
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