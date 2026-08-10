import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Map, Marker } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Search, Sparkles, Building2, MapPin, Navigation, CheckCircle2, Loader2, Copy,
} from 'lucide-react';
import { buscarPorCodigo } from '../lib/db';
import { getUsuarioLocal, getToken, setUsuarioLocal, type UsuarioSesion } from '../lib/auth';
import OfflineIndicator from './OfflineIndicator';
import AuthModal from './AuthModal';
import GestorFotos from './GestorFotos';
import { ESTILO_MAPA } from './MapScreen';

// ============================================================
// PANEL DEL PRESTADOR — v3 (ver MEJORAS DISEÑO PANEL PRESTADOR)
// ============================================================
// Hallazgo real de campo IMPORTANTE: el formulario de negocio vivía
// ANTES dentro del modal de crear cuenta — un "formulario dentro de
// otro formulario", confuso y chico. Ahora el registro de CUENTA es
// simple y genérico (AuthModal, igual para cualquiera), y el
// formulario de NEGOCIO vive aquí, como su propia pantalla completa,
// para quien ya tiene sesión iniciada.
//
// Flujo:
//  1. Sin sesión  → botón para crear cuenta (AuthModal, simple)
//  2. Con sesión, no es prestador → "¿Quieres registrar tu servicio?"
//     → pantalla de registro de negocio completa
//  3. Ya es prestador → mensaje de "gestiona desde Mi Perfil"
//  + Consultar estado, disponible siempre
// ============================================================

type Vista = 'inicio' | 'consultar' | 'registrar';

const TUXTLAS_CENTER: [number, number] = [18.45, -95.18];
type NivelPrecio = 'limitado' | 'razonable' | 'lujo' | 'muy_lujo';
const NIVELES_PRECIO: { id: NivelPrecio; simbolo: string; label: string }[] = [
  { id: 'limitado', simbolo: '$', label: 'Presupuesto limitado' },
  { id: 'razonable', simbolo: '$$', label: 'Precio razonable' },
  { id: 'lujo', simbolo: '$$$', label: 'De lujo' },
  { id: 'muy_lujo', simbolo: '$$$$', label: 'Muy lujo' },
];
// Tasa de referencia MXN → USD, solo para dar una idea aproximada —
// NO es una tasa en vivo (eso necesitaría una API externa nueva).
// Verificada al escribir esto (~17.1 MXN/USD); revisar de vez en
// cuando si se nota muy desfasada.
const TASA_USD_REFERENCIA = 17.1;

export default function ProviderPanel() {
  const [vista, setVista] = useState<Vista>('inicio');
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(getUsuarioLocal());
  const [mostrarAuth, setMostrarAuth] = useState(false);
  const esPrestador = usuario?.tipo === 'prestador';

  return (
    <div className="min-h-screen bg-amate-50">
      <OfflineIndicator />
      <header className="bg-white/80 backdrop-blur-md border-b border-obsidiana-900/5">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-jungle-700 hover:text-jungle-900 text-sm font-medium mb-4"
          >
            <ArrowLeft size={16} /> Inicio
          </Link>
          <div className="inline-flex items-center gap-1.5 bg-sun-50 text-sun-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide mb-3">
            <Sparkles size={12} />
            Prestadores
          </div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-obsidiana-900">
            Tu negocio en TuxtlasGO
          </h1>
          <p className="text-sm text-obsidiana-800/60 mt-1.5 leading-relaxed">
            Da a conocerte a quien ya viene por acá. Sin intermediarios, sin comisiones.
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-14">
        {vista === 'inicio' && (
          <PantallaInicio
            onElegir={setVista}
            usuario={usuario}
            esPrestador={esPrestador}
            onPedirCuenta={() => setMostrarAuth(true)}
          />
        )}
        {vista === 'consultar' && <ConsultarEstado onVolver={() => setVista('inicio')} />}
        {vista === 'registrar' && (
          <RegistrarNegocio
            onVolver={() => setVista('inicio')}
            onExito={() => {
              const actualizado = getUsuarioLocal();
              setUsuario(actualizado);
              setVista('inicio');
            }}
          />
        )}
      </main>

      {mostrarAuth && (
        <AuthModal
          vistaInicial="registro"
          onClose={() => setMostrarAuth(false)}
          onSuccess={(u) => {
            setUsuario(u);
            setMostrarAuth(false);
            setVista('registrar');
          }}
        />
      )}
    </div>
  );
}

// ─────────────── PANTALLA DE INICIO ───────────────
function PantallaInicio({
  onElegir,
  usuario,
  esPrestador,
  onPedirCuenta,
}: {
  onElegir: (v: Vista) => void;
  usuario: UsuarioSesion | null;
  esPrestador: boolean;
  onPedirCuenta: () => void;
}) {
  return (
    <div className="space-y-4">
      {esPrestador ? (
        <div className="bg-jungle-50 border border-jungle-200 text-jungle-800 p-5 rounded-2xl flex items-start gap-3">
          <span className="text-xl flex-shrink-0">📋</span>
          <div>
            <p className="font-display font-bold text-sm mb-1">Gestiona tu servicio desde Mi Perfil</p>
            <p className="text-sm text-jungle-700/70 leading-relaxed">
              Edita tu información, horarios, fotos y previsualiza tu tarjeta desde{' '}
              <strong>Mi Perfil</strong> dentro de la app.
            </p>
          </div>
        </div>
      ) : usuario ? (
        <div className="bg-white border border-obsidiana-900/8 rounded-2xl p-6 text-center">
          <p className="font-display font-bold text-obsidiana-900 mb-1.5">
            ¿Quieres registrar tu servicio?
          </p>
          <p className="text-sm text-obsidiana-800/60 mb-5 leading-relaxed">
            Llena tu información — toma unos minutos y tu solicitud queda en revisión.
          </p>
          <button
            onClick={() => onElegir('registrar')}
            className="inline-flex items-center gap-2 bg-jungle-700 hover:bg-jungle-800 text-white px-6 py-3 rounded-full font-semibold text-sm transition-colors"
          >
            Más información
          </button>
        </div>
      ) : (
        <div className="bg-white border border-obsidiana-900/8 rounded-2xl p-6 text-center">
          <p className="font-display font-bold text-obsidiana-900 mb-1.5">
            ¿Quieres registrar tu servicio?
          </p>
          <p className="text-sm text-obsidiana-800/60 mb-5 leading-relaxed">
            Primero crea una cuenta gratis — es rápido, luego llenas la información de tu negocio.
          </p>
          <button
            onClick={onPedirCuenta}
            className="inline-flex items-center gap-2 bg-jungle-700 hover:bg-jungle-800 text-white px-6 py-3 rounded-full font-semibold text-sm transition-colors"
          >
            Crear cuenta
          </button>
        </div>
      )}

      <button
        onClick={() => onElegir('consultar')}
        className="w-full bg-white hover:border-jungle-300 border border-obsidiana-900/8 text-obsidiana-900 p-5 rounded-2xl text-left flex items-center gap-4 transition-colors"
      >
        <div className="w-11 h-11 rounded-xl bg-jungle-50 flex items-center justify-center flex-shrink-0">
          <Search size={20} className="text-jungle-700" />
        </div>
        <div>
          <div className="font-display font-bold text-base">Consultar estado de mi servicio</div>
          <div className="text-sm text-obsidiana-800/55">
            ¿Ya registraste tu negocio? Revisa si fue aprobado con tu código.
          </div>
        </div>
      </button>
    </div>
  );
}

// ─────────────── REGISTRAR NEGOCIO (asistente por pasos) ───────────────
// Hallazgo real de campo: el formulario largo de una sola pantalla
// "no convencía" — se pidió por secciones, más interactivo, y sobre
// todo que la foto fuera parte de ENVIAR LA SOLICITUD, no algo que
// solo aparece después en Mi Perfil. La foto se sube DESPUÉS de que
// el servicio ya existe en la base (GestorFotos necesita un servicio
// real al que asociarla vía el token) — por eso "Fotos" es el paso
// que sigue justo después de enviar los datos, antes de la
// confirmación final, no antes.
type PasoRegistro = 'info' | 'descripcion' | 'precio' | 'contacto' | 'fotos' | 'listo';
const ORDEN_PASOS: PasoRegistro[] = ['info', 'descripcion', 'precio', 'contacto', 'fotos', 'listo'];
const TITULO_PASO: Record<PasoRegistro, string> = {
  info: 'Información básica',
  descripcion: 'Descripción',
  precio: 'Precio',
  contacto: 'Contacto y ubicación',
  fotos: 'Fotos de tu negocio',
  listo: '¡Listo!',
};

// ─────────────── REGISTRAR NEGOCIO (asistente por pasos, con mapa
// MapLibre consistente con el resto de la app, y animado) ──────────
function RegistrarNegocio({ onVolver, onExito }: { onVolver: () => void; onExito: () => void }) {
  const [paso, setPaso] = useState<PasoRegistro>('info');
  const [direccion, setDireccion] = useState<1 | -1>(1);
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [categoria, setCategoria] = useState('Gastronomia');
  const [municipio, setMunicipio] = useState('Catemaco');
  const [descripcion, setDescripcion] = useState('');
  const [generandoDescripcion, setGenerandoDescripcion] = useState(false);
  const [nivelPrecio, setNivelPrecio] = useState<NivelPrecio>('razonable');
  const [precioMin, setPrecioMin] = useState('');
  const [precioMax, setPrecioMax] = useState('');
  const [contacto, setContacto] = useState('');
  const [ubicacion, setUbicacion] = useState<[number, number] | null>(null);
  const [ubicacionGuardada, setUbicacionGuardada] = useState(false);
  const [terminos, setTerminos] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [codigo, setCodigo] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [fotosSubidas, setFotosSubidas] = useState<string[]>([]);

  const indicePaso = ORDEN_PASOS.indexOf(paso);

  function irA(p: PasoRegistro, dir: 1 | -1) {
    setDireccion(dir);
    setPaso(p);
  }

  function precioFinal(): string {
    const nivel = NIVELES_PRECIO.find((n) => n.id === nivelPrecio)!;
    const min = parseFloat(precioMin);
    const max = parseFloat(precioMax);
    if (Number.isNaN(min) || Number.isNaN(max) || min <= 0 || max <= 0) return 'A consultar';
    const usdMin = Math.round(min / TASA_USD_REFERENCIA);
    const usdMax = Math.round(max / TASA_USD_REFERENCIA);
    return `${nivel.simbolo} $${min.toLocaleString('es-MX')} – $${max.toLocaleString('es-MX')} MXN (aprox. $${usdMin} – $${usdMax} USD)`;
  }

  async function generarDescripcionIA() {
    if (!nombreNegocio.trim()) {
      setError('Escribe primero el nombre de tu negocio para poder generar la descripción.');
      return;
    }
    setGenerandoDescripcion(true);
    setError('');
    try {
      const r = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt:
            'Eres un redactor de descripciones cortas para negocios turísticos de Los Tuxtlas, Veracruz. Con los datos que te den (nombre, categoría, municipio), escribe una descripción de 2 a 3 frases, cálida y profesional, en español. NUNCA inventes detalles específicos que no te dieron (no inventes platillos, actividades ni servicios concretos que no mencionaron) — describe de forma genérica pero atractiva según su categoría. Responde solo con la descripción, sin comillas ni texto extra.',
          mensajes: [{ role: 'user', content: `Nombre: ${nombreNegocio.trim()}. Categoría: ${categoria}. Municipio: ${municipio}. Escribe la descripción.` }],
        }),
      });
      const data = await r.json();
      if (r.ok && data.texto) setDescripcion(data.texto.trim());
      else setError('No se pudo generar la descripción ahora mismo — escríbela tú, no hay problema.');
    } catch {
      setError('Necesitas internet para generar la descripción con IA.');
    } finally {
      setGenerandoDescripcion(false);
    }
  }

  async function enviarYContinuar() {
    setError('');
    if (!ubicacionGuardada) return setError('Marca tu ubicación en el mapa antes de continuar.');
    if (!terminos) return setError('Debes aceptar los términos y condiciones.');
    const token = getToken();
    if (!token) return setError('Tu sesión expiró — vuelve a iniciar sesión.');

    setCargando(true);
    try {
      const r = await fetch('/api/servicios/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nombre: nombreNegocio.trim(),
          categoria,
          municipio,
          descripcion: descripcion.trim(),
          precio: precioFinal(),
          contacto: contacto.trim(),
          lat: ubicacion![0],
          lng: ubicacion![1],
        }),
      });
      const data = await r.json();
      if (r.ok && data.ok) {
        const actual = getUsuarioLocal();
        if (actual) setUsuarioLocal({ ...actual, tipo: 'prestador' });
        setCodigo(data.servicio?.codigo_seguimiento ?? '');
        irA('fotos', 1);
      } else {
        setError(data.error ?? 'No se pudo enviar tu solicitud.');
      }
    } catch {
      setError('Necesitas internet para enviar tu solicitud.');
    } finally {
      setCargando(false);
    }
  }

  function siguiente() {
    if (paso === 'info' && (!nombreNegocio.trim() || nombreNegocio.trim().length < 3)) return setError('Escribe el nombre de tu negocio.');
    if (paso === 'descripcion' && (!descripcion.trim() || descripcion.trim().length < 20)) return setError('La descripción debe tener al menos 20 caracteres.');
    setError('');
    irA(ORDEN_PASOS[indicePaso + 1], 1);
  }

  const variantesPaso = {
    entra: (dir: 1 | -1) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    centro: { x: 0, opacity: 1 },
    sale: (dir: 1 | -1) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
  };

  return (
    <div>
      <button onClick={onVolver} className="inline-flex items-center gap-1.5 text-jungle-700 hover:text-jungle-900 text-sm font-medium mb-6">
        <ArrowLeft size={16} /> Volver
      </button>

      <div className="flex gap-1.5 mb-2">
        {ORDEN_PASOS.map((p, i) => (
          <div key={p} className="h-1 flex-1 rounded-full bg-jungle-100 overflow-hidden">
            <motion.div
              className="h-full bg-jungle-600"
              initial={false}
              animate={{ width: i <= indicePaso ? '100%' : '0%' }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
          </div>
        ))}
      </div>
      <p className="text-xs font-semibold text-jungle-600 uppercase tracking-wide mb-6">
        Paso {indicePaso + 1} de {ORDEN_PASOS.length} · {TITULO_PASO[paso]}
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-5">{error}</div>
      )}

      <AnimatePresence mode="wait" custom={direccion}>
        <motion.div
          key={paso}
          custom={direccion}
          variants={variantesPaso}
          initial="entra"
          animate="centro"
          exit="sale"
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {paso === 'info' && (
            <div className="space-y-6">
              <div>
                <label className="text-sm font-semibold text-jungle-800 mb-2 block">Nombre de empresa o servicio <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Building2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-jungle-400" />
                  <input type="text" value={nombreNegocio} onChange={(e) => setNombreNegocio(e.target.value)} placeholder="Ej: Hotel Lago Encantado"
                    className="w-full bg-white border border-jungle-200 rounded-2xl pl-12 pr-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-jungle-800 mb-2 block">Categoría <span className="text-red-500">*</span></label>
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)}
                    className="w-full bg-white border border-jungle-200 rounded-2xl px-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-jungle-400">
                    {['Gastronomia', 'Naturaleza', 'Aventura', 'Hospedaje', 'Comercio', 'Cooperativa', 'Otro'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold text-jungle-800 mb-2 block">Municipio <span className="text-red-500">*</span></label>
                  <select value={municipio} onChange={(e) => setMunicipio(e.target.value)}
                    className="w-full bg-white border border-jungle-200 rounded-2xl px-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-jungle-400">
                    {['Catemaco', 'San Andrés Tuxtla', 'Santiago Tuxtla'].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {paso === 'descripcion' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-jungle-800 block">Descripción <span className="text-red-500">*</span></label>
                <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={generarDescripcionIA} disabled={generandoDescripcion}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-jungle-700 hover:text-jungle-900 disabled:opacity-50">
                  {generandoDescripcion ? <Loader2 size={14} className="animate-spin" /> : <span>✨</span>}
                  Generar con IA
                </motion.button>
              </div>
              <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                placeholder="¿Qué ofreces? ¿Qué te hace especial? (mín. 20 caracteres)" rows={8}
                className="w-full bg-white border border-jungle-200 rounded-2xl px-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-jungle-400 resize-none" />
              <p className="text-xs text-jungle-500 mt-2">Es de suma importancia para que las personas vean bien tu servicio — si la IA te ayuda, léela y ajusta antes de continuar.</p>
            </div>
          )}

          {paso === 'precio' && (
            <div>
              <label className="text-sm font-semibold text-jungle-800 mb-3 block">Precio aproximado</label>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {NIVELES_PRECIO.map((n) => (
                  <motion.button key={n.id} whileTap={{ scale: 0.95 }} type="button" onClick={() => setNivelPrecio(n.id)}
                    className={`rounded-2xl py-4 text-center border-2 transition-colors ${nivelPrecio === n.id ? 'border-jungle-500 bg-jungle-50' : 'border-jungle-100 bg-white'}`}>
                    <div className="font-display font-bold text-jungle-800 text-lg">{n.simbolo}</div>
                  </motion.button>
                ))}
              </div>
              <p className="text-xs text-jungle-500 mb-4">{NIVELES_PRECIO.find((n) => n.id === nivelPrecio)?.label}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-jungle-400">$</span>
                  <input type="number" min={0} value={precioMin} onChange={(e) => setPrecioMin(e.target.value)} placeholder="Desde"
                    className="w-full bg-white border border-jungle-200 rounded-2xl pl-8 pr-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-jungle-400">$</span>
                  <input type="number" min={0} value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} placeholder="Hasta"
                    className="w-full bg-white border border-jungle-200 rounded-2xl pl-8 pr-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                </div>
              </div>
              {precioMin && precioMax && !Number.isNaN(parseFloat(precioMin)) && !Number.isNaN(parseFloat(precioMax)) && (
                <p className="text-xs text-jungle-500 mt-3">
                  ≈ ${Math.round(parseFloat(precioMin) / TASA_USD_REFERENCIA)} – ${Math.round(parseFloat(precioMax) / TASA_USD_REFERENCIA)} USD (tasa de referencia, no en vivo)
                </p>
              )}
            </div>
          )}

          {paso === 'contacto' && (
            <div className="space-y-6">
              <div>
                <label className="text-sm font-semibold text-jungle-800 mb-2 block">WhatsApp o correo</label>
                <input type="text" value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="9521234567"
                  className="w-full bg-white border border-jungle-200 rounded-2xl px-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-jungle-400" />
              </div>
              <div>
                <label className="text-sm font-semibold text-jungle-800 mb-2 block">
                  <MapPin size={13} className="inline mr-1" />
                  Marca tu ubicación en el mapa <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-jungle-500 mb-3">Toca el mapa donde está tu negocio para colocar el marcador</p>
                <div className="rounded-2xl overflow-hidden border-2 border-jungle-200" style={{ height: '320px' }}>
                  <Map
                    initialViewState={{ longitude: TUXTLAS_CENTER[1], latitude: TUXTLAS_CENTER[0], zoom: 11 }}
                    minZoom={8}
                    maxZoom={17}
                    mapStyle={ESTILO_MAPA}
                    style={{ width: '100%', height: '100%' }}
                    onClick={(e) => { setUbicacion([e.lngLat.lat, e.lngLat.lng]); setUbicacionGuardada(false); }}
                  >
                    {ubicacion && (
                      <Marker longitude={ubicacion[1]} latitude={ubicacion[0]} anchor="bottom">
                        <div className="w-8 h-8 rounded-full bg-jungle-700 border-[3px] border-white shadow-lg flex items-center justify-center text-white text-sm">📍</div>
                      </Marker>
                    )}
                  </Map>
                </div>
                {ubicacion && !ubicacionGuardada && (
                  <motion.button whileTap={{ scale: 0.97 }} type="button" onClick={() => setUbicacionGuardada(true)}
                    className="w-full mt-3 bg-jungle-600 hover:bg-jungle-700 text-white text-sm font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition-colors">
                    <Navigation size={15} /> Guardar ubicación
                  </motion.button>
                )}
                {ubicacionGuardada && (
                  <div className="mt-3 flex items-center gap-2 bg-jungle-50 border border-jungle-200 rounded-2xl px-4 py-3">
                    <CheckCircle2 size={16} className="text-jungle-600 flex-shrink-0" />
                    <p className="text-sm text-jungle-700 font-medium">Ubicación guardada ({ubicacion![0].toFixed(4)}, {ubicacion![1].toFixed(4)})</p>
                    <button type="button" onClick={() => { setUbicacionGuardada(false); setUbicacion(null); }} className="ml-auto text-xs text-jungle-500 underline">cambiar</button>
                  </div>
                )}
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={terminos} onChange={(e) => setTerminos(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-jungle-300 text-jungle-600" />
                <span className="text-sm text-jungle-600">Acepto los <span className="text-jungle-800 underline font-semibold">términos y condiciones</span> del sistema</span>
              </label>
            </div>
          )}

          {paso === 'fotos' && (
            <div>
              <p className="text-sm text-obsidiana-800/60 mb-5">
                Último paso — sube al menos <strong>una foto</strong> real de tu negocio. Es lo primero que va a ver la gente.
              </p>
              <GestorFotos codigoSeguimiento={codigo} onFotosActualizadas={setFotosSubidas} />
            </div>
          )}

          {paso === 'listo' && (
            <div className="text-center py-6">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-jungle-700 flex items-center justify-center"
              >
                <CheckCircle2 className="text-white" size={28} />
              </motion.div>
              <h2 className="font-display font-bold text-2xl text-obsidiana-900 mb-2">¡Solicitud enviada!</h2>
              <p className="text-sm text-obsidiana-800/60 mb-5 leading-relaxed max-w-sm mx-auto">
                Nuestro equipo va a validar tu negocio. Guarda este código para consultar el estado:
              </p>
              <div className="inline-flex items-center justify-center gap-2 bg-amate-50 rounded-2xl px-5 py-4 mb-6">
                <span className="font-mono font-bold text-xl tracking-wider text-jungle-800">{codigo}</span>
                <button onClick={() => { navigator.clipboard.writeText(codigo).catch(() => {}); setCopiado(true); }} className="text-jungle-600 hover:text-jungle-800">
                  {copiado ? <CheckCircle2 size={20} /> : <Copy size={20} />}
                </button>
              </div>
              <div>
                <button onClick={onExito} className="text-sm font-semibold text-jungle-700 underline">Entendido</button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {paso !== 'listo' && paso !== 'fotos' && (
        <div className="flex items-center gap-3 mt-8">
          {indicePaso > 0 && (
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => irA(ORDEN_PASOS[indicePaso - 1], -1)}
              className="w-14 h-14 rounded-2xl border-2 border-jungle-100 flex items-center justify-center text-jungle-800 flex-shrink-0">
              <ArrowLeft size={20} />
            </motion.button>
          )}
          {paso === 'contacto' ? (
            <motion.button whileTap={{ scale: 0.98 }} onClick={enviarYContinuar} disabled={cargando}
              className="flex-1 bg-jungle-700 hover:bg-jungle-800 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 transition-colors">
              {cargando && <Loader2 size={18} className="animate-spin" />}
              Enviar solicitud de registro
            </motion.button>
          ) : (
            <motion.button whileTap={{ scale: 0.98 }} onClick={siguiente}
              className="flex-1 bg-jungle-700 hover:bg-jungle-800 text-white font-bold py-4 rounded-2xl transition-colors">
              Siguiente
            </motion.button>
          )}
        </div>
      )}

      {paso === 'fotos' && (
        <motion.button whileTap={{ scale: 0.98 }}
          onClick={() => irA('listo', 1)}
          disabled={fotosSubidas.length === 0}
          className="w-full mt-8 bg-jungle-700 hover:bg-jungle-800 text-white font-bold py-4 rounded-2xl disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          {fotosSubidas.length === 0 ? 'Sube al menos una foto para continuar' : 'Finalizar registro'}
        </motion.button>
      )}
    </div>
  );
}

// ─────────────── CONSULTAR ESTADO (IndexedDB + Neon) ───────────────
function ConsultarEstado({ onVolver }: { onVolver: () => void }) {
  const [codigoBusqueda, setCodigoBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<any | null | 'no-encontrado'>(null);

  async function buscar() {
    if (codigoBusqueda.trim().length < 4) return;
    setBuscando(true);
    try {
      const local = await buscarPorCodigo(codigoBusqueda.trim().toUpperCase());
      if (local) { setResultado(local); return; }
      try {
        const res = await fetch(`/api/servicios/registro?codigo=${encodeURIComponent(codigoBusqueda.trim().toUpperCase())}`);
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.servicio) {
            setResultado({
              nombreNegocio: data.servicio.nombre,
              categoria: data.servicio.categoria,
              municipio: data.servicio.municipio,
              estado: data.servicio.estado,
              motivoRechazo: data.servicio.motivo_rechazo,
              codigoSeguimiento: data.servicio.codigo_seguimiento,
            });
            return;
          }
        }
      } catch { /* sin internet */ }
      setResultado('no-encontrado');
    } finally {
      setBuscando(false);
    }
  }

  const colores: Record<string, string> = {
    pendiente: 'bg-sun-50 text-sun-700',
    aprobado: 'bg-jungle-50 text-jungle-700',
    rechazado: 'bg-red-50 text-red-700',
  };

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="inline-flex items-center gap-1.5 text-jungle-700 hover:text-jungle-900 text-sm font-medium">
        <ArrowLeft size={16} /> Volver
      </button>

      <div className="bg-white border border-obsidiana-900/8 rounded-2xl p-6">
        <h2 className="font-display font-bold text-lg text-obsidiana-900 mb-1">Consultar mi servicio</h2>
        <p className="text-sm text-obsidiana-800/60 mb-4">Escribe el código de seguimiento que recibiste al registrar tu servicio.</p>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={codigoBusqueda}
            onChange={(e) => setCodigoBusqueda(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="TGO-XXXX"
            className="flex-1 bg-amate-50 rounded-xl px-4 py-3 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-jungle-400 border-0"
            maxLength={8}
          />
          <button onClick={buscar} disabled={buscando || codigoBusqueda.trim().length < 4}
            className="bg-jungle-700 hover:bg-jungle-800 disabled:opacity-40 text-white px-5 rounded-xl font-semibold text-sm transition-colors">
            Buscar
          </button>
        </div>

        {resultado === 'no-encontrado' && (
          <div className="bg-sun-50 border border-sun-200 rounded-xl p-4 text-sm text-sun-800">
            No encontramos ningún servicio con ese código. Revisa que esté bien escrito (ejemplo: TGO-A7B2).
          </div>
        )}

        {resultado && resultado !== 'no-encontrado' && (
          <div className="border border-obsidiana-900/8 rounded-xl p-4">
            <div className="font-display font-bold text-obsidiana-900 mb-1">{resultado.nombreNegocio}</div>
            <div className="text-xs text-obsidiana-800/55 mb-3">{resultado.categoria} · {resultado.municipio}</div>
            <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${colores[resultado.estado] || 'bg-gray-100'}`}>
              {resultado.estado === 'pendiente' ? '⏳ Pendiente' : resultado.estado === 'aprobado' ? '✅ Aprobado' : '❌ Rechazado'}
            </span>
            {resultado.estado === 'pendiente' && <p className="text-sm text-obsidiana-800/60 mt-3">Tu servicio está en revisión. El equipo de TuxtlasGO lo validará pronto.</p>}
            {resultado.estado === 'aprobado' && <p className="text-sm text-jungle-700 mt-3">¡Felicidades! Tu servicio ya está visible en el mapa y en Explorar.</p>}
            {resultado.estado === 'rechazado' && (
              <div className="text-sm text-red-700 mt-3">
                <p>Tu servicio no fue aprobado en esta ocasión.</p>
                {resultado.motivoRechazo && <p className="mt-1"><strong>Motivo:</strong> {resultado.motivoRechazo}</p>}
                <p className="mt-1">Puedes registrarlo de nuevo corrigiendo lo indicado.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}