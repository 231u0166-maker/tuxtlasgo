import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  ArrowLeft, Search, Sparkles, Building2, MapPin, Navigation, CheckCircle2, Loader2, Copy,
} from 'lucide-react';
import { buscarPorCodigo } from '../lib/db';
import { getUsuarioLocal, getToken, setUsuarioLocal, type UsuarioSesion } from '../lib/auth';
import OfflineIndicator from './OfflineIndicator';
import AuthModal from './AuthModal';
import GestorFotos from './GestorFotos';

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

const iconoPrestador = L.divIcon({
  html: `<div style="background:#15803d;color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:14px;">📍</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  className: '',
});

function ClickCaptor({ onUbicacion }: { onUbicacion: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onUbicacion(e.latlng.lat, e.latlng.lng); } });
  return null;
}

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

function RegistrarNegocio({ onVolver, onExito }: { onVolver: () => void; onExito: () => void }) {
  const [paso, setPaso] = useState<PasoRegistro>('info');
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

  // Envía los datos y crea el servicio — pasa al paso de fotos si
  // sale bien, porque GestorFotos necesita que el servicio YA exista.
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
        setPaso('fotos');
      } else {
        setError(data.error ?? 'No se pudo enviar tu solicitud.');
      }
    } catch {
      setError('Necesitas internet para enviar tu solicitud.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <button onClick={onVolver} className="inline-flex items-center gap-1.5 text-jungle-700 hover:text-jungle-900 text-sm font-medium mb-4">
        <ArrowLeft size={16} /> Volver
      </button>

      {/* Barra de progreso por secciones */}
      <div className="flex gap-1.5 mb-2">
        {ORDEN_PASOS.map((p, i) => (
          <div key={p} className={`h-1 flex-1 rounded-full transition-colors ${i <= indicePaso ? 'bg-jungle-600' : 'bg-jungle-100'}`} />
        ))}
      </div>
      <p className="text-xs font-semibold text-jungle-600 uppercase tracking-wide mb-4">
        Paso {indicePaso + 1} de {ORDEN_PASOS.length} · {TITULO_PASO[paso]}
      </p>

      <div className="bg-white border border-obsidiana-900/8 rounded-2xl p-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>}

        {paso === 'info' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Nombre de empresa o servicio <span className="text-red-500">*</span></label>
              <div className="relative">
                <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-400" />
                <input type="text" value={nombreNegocio} onChange={(e) => setNombreNegocio(e.target.value)} placeholder="Ej: Hotel Lago Encantado"
                  className="w-full border border-jungle-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Categoría <span className="text-red-500">*</span></label>
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)}
                  className="w-full border border-jungle-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400">
                  {['Gastronomia', 'Naturaleza', 'Aventura', 'Hospedaje', 'Comercio', 'Cooperativa', 'Otro'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Municipio <span className="text-red-500">*</span></label>
                <select value={municipio} onChange={(e) => setMunicipio(e.target.value)}
                  className="w-full border border-jungle-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400">
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-jungle-700 block">Descripción <span className="text-red-500">*</span></label>
              <button type="button" onClick={generarDescripcionIA} disabled={generandoDescripcion}
                className="inline-flex items-center gap-1 text-xs font-semibold text-jungle-700 hover:text-jungle-900 disabled:opacity-50">
                {generandoDescripcion ? <Loader2 size={12} className="animate-spin" /> : <span>✨</span>}
                Generar descripción con IA
              </button>
            </div>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
              placeholder="¿Qué ofreces? ¿Qué te hace especial? (mín. 20 caracteres)" rows={5}
              className="w-full border border-jungle-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 resize-none" />
            <p className="text-[11px] text-jungle-500 mt-1">Es de suma importancia para que las personas vean bien tu servicio — si la IA te ayuda, léela y ajusta antes de continuar.</p>
          </div>
        )}

        {paso === 'precio' && (
          <div>
            <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Precio aproximado</label>
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {NIVELES_PRECIO.map((n) => (
                <button key={n.id} type="button" onClick={() => setNivelPrecio(n.id)}
                  className={`rounded-xl py-3 text-center border-2 transition-colors ${nivelPrecio === n.id ? 'border-jungle-500 bg-jungle-50' : 'border-jungle-100'}`}>
                  <div className="font-display font-bold text-jungle-800 text-base">{n.simbolo}</div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-jungle-500 mb-3">{NIVELES_PRECIO.find((n) => n.id === nivelPrecio)?.label}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-400 text-sm">$</span>
                <input type="number" min={0} value={precioMin} onChange={(e) => setPrecioMin(e.target.value)} placeholder="Desde"
                  className="w-full border border-jungle-200 rounded-xl pl-7 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-400 text-sm">$</span>
                <input type="number" min={0} value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} placeholder="Hasta"
                  className="w-full border border-jungle-200 rounded-xl pl-7 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
              </div>
            </div>
            {precioMin && precioMax && !Number.isNaN(parseFloat(precioMin)) && !Number.isNaN(parseFloat(precioMax)) && (
              <p className="text-[11px] text-jungle-500 mt-2">
                ≈ ${Math.round(parseFloat(precioMin) / TASA_USD_REFERENCIA)} – ${Math.round(parseFloat(precioMax) / TASA_USD_REFERENCIA)} USD (tasa de referencia, no en vivo)
              </p>
            )}
          </div>
        )}

        {paso === 'contacto' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">WhatsApp o correo</label>
              <input type="text" value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="9521234567"
                className="w-full border border-jungle-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">
                <MapPin size={11} className="inline mr-1" />
                Marca tu ubicación en el mapa <span className="text-red-500">*</span>
              </label>
              <p className="text-[11px] text-jungle-500 mb-2">Toca el mapa donde está tu negocio para colocar el marcador</p>
              <div className="rounded-xl overflow-hidden border-2 border-jungle-200" style={{ height: '240px', position: 'relative' }}>
                <MapContainer center={TUXTLAS_CENTER} zoom={11} style={{ height: '100%', width: '100%' }} zoomControl attributionControl={false}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <ClickCaptor onUbicacion={(lat, lng) => { setUbicacion([lat, lng]); setUbicacionGuardada(false); }} />
                  {ubicacion && <Marker position={ubicacion} icon={iconoPrestador} />}
                </MapContainer>
              </div>
              {ubicacion && !ubicacionGuardada && (
                <button type="button" onClick={() => setUbicacionGuardada(true)}
                  className="w-full mt-2 bg-jungle-600 hover:bg-jungle-700 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors">
                  <Navigation size={13} /> Guardar ubicación
                </button>
              )}
              {ubicacionGuardada && (
                <div className="mt-2 flex items-center gap-2 bg-jungle-50 border border-jungle-200 rounded-xl px-3 py-2">
                  <CheckCircle2 size={14} className="text-jungle-600 flex-shrink-0" />
                  <p className="text-xs text-jungle-700 font-medium">Ubicación guardada ({ubicacion![0].toFixed(4)}, {ubicacion![1].toFixed(4)})</p>
                  <button type="button" onClick={() => { setUbicacionGuardada(false); setUbicacion(null); }} className="ml-auto text-[10px] text-jungle-500 underline">cambiar</button>
                </div>
              )}
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={terminos} onChange={(e) => setTerminos(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-jungle-300 text-jungle-600" />
              <span className="text-xs text-jungle-600">Acepto los <span className="text-jungle-800 underline font-semibold">términos y condiciones</span> del sistema</span>
            </label>
          </div>
        )}

        {paso === 'fotos' && (
          <div>
            <p className="text-sm text-obsidiana-800/60 mb-4">
              Último paso — sube al menos <strong>una foto</strong> real de tu negocio. Es lo primero que va a ver la gente.
            </p>
            <GestorFotos codigoSeguimiento={codigo} onFotosActualizadas={setFotosSubidas} />
          </div>
        )}

        {paso === 'listo' && (
          <div className="text-center py-4">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-jungle-700 flex items-center justify-center">
              <CheckCircle2 className="text-white" size={26} />
            </div>
            <h2 className="font-display font-bold text-xl text-obsidiana-900 mb-2">¡Solicitud enviada!</h2>
            <p className="text-sm text-obsidiana-800/60 mb-4 leading-relaxed">
              Nuestro equipo va a validar tu negocio. Guarda este código para consultar el estado:
            </p>
            <div className="flex items-center justify-center gap-2 bg-amate-50 rounded-xl px-4 py-3 mb-5">
              <span className="font-mono font-bold text-lg tracking-wider text-jungle-800">{codigo}</span>
              <button onClick={() => { navigator.clipboard.writeText(codigo).catch(() => {}); setCopiado(true); }} className="text-jungle-600 hover:text-jungle-800">
                {copiado ? <CheckCircle2 size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <button onClick={onExito} className="text-sm font-semibold text-jungle-700 underline">Entendido</button>
          </div>
        )}
      </div>

      {/* Navegación entre pasos */}
      {paso !== 'listo' && paso !== 'fotos' && (
        <div className="flex items-center gap-3 mt-4">
          {indicePaso > 0 && (
            <button onClick={() => setPaso(ORDEN_PASOS[indicePaso - 1])}
              className="w-12 h-12 rounded-2xl border-2 border-jungle-100 flex items-center justify-center text-jungle-800 flex-shrink-0">
              <ArrowLeft size={18} />
            </button>
          )}
          {paso === 'contacto' ? (
            <button onClick={enviarYContinuar} disabled={cargando}
              className="flex-1 bg-jungle-700 hover:bg-jungle-800 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 transition-colors">
              {cargando && <Loader2 size={18} className="animate-spin" />}
              Enviar solicitud de registro
            </button>
          ) : (
            <button
              onClick={() => {
                if (paso === 'info' && (!nombreNegocio.trim() || nombreNegocio.trim().length < 3)) return setError('Escribe el nombre de tu negocio.');
                if (paso === 'descripcion' && (!descripcion.trim() || descripcion.trim().length < 20)) return setError('La descripción debe tener al menos 20 caracteres.');
                setError('');
                setPaso(ORDEN_PASOS[indicePaso + 1]);
              }}
              className="flex-1 bg-jungle-700 hover:bg-jungle-800 text-white font-bold py-3.5 rounded-2xl transition-colors"
            >
              Siguiente
            </button>
          )}
        </div>
      )}

      {paso === 'fotos' && (
        <button
          onClick={() => setPaso('listo')}
          disabled={fotosSubidas.length === 0}
          className="w-full mt-4 bg-jungle-700 hover:bg-jungle-800 text-white font-bold py-3.5 rounded-2xl disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          {fotosSubidas.length === 0 ? 'Sube al menos una foto para continuar' : 'Finalizar registro'}
        </button>
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