import { useState, useRef, useEffect } from 'react';
import {
  X, Eye, EyeOff, Loader2, CheckCircle2, Copy,
  ChevronDown, ChevronUp, MapPin, Lock, Mail, User, Building2, Navigation
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { apiLogin, apiRegistro, apiRecuperar, type UsuarioSesion } from '../lib/auth';

type Vista = 'login' | 'registro' | 'recuperar' | 'codigo';

interface Props {
  onClose: () => void;
  onSuccess: (usuario: UsuarioSesion) => void;
  // Permite abrir el modal directo en el registro, con la casilla de
  // prestador ya marcada — usado por el CTA "Registrar mi negocio"
  // de /prestador, que antes caía al login genérico sin ningún
  // contexto (hallazgo real de campo, doc MEJORAS DISEÑO PANEL
  // PRESTADOR, punto 2).
  vistaInicial?: Vista;
  prestadorInicial?: boolean;
}

const TUXTLAS_CENTER: [number, number] = [18.45, -95.18];

type NivelPrecio = 'limitado' | 'razonable' | 'lujo' | 'muy_lujo';

const NIVELES_PRECIO: { id: NivelPrecio; simbolo: string; label: string }[] = [
  { id: 'limitado', simbolo: '$', label: 'Presupuesto limitado' },
  { id: 'razonable', simbolo: '$$', label: 'Precio razonable' },
  { id: 'lujo', simbolo: '$$$', label: 'De lujo' },
  { id: 'muy_lujo', simbolo: '$$$$', label: 'Muy lujo' },
];

// Tasa de referencia MXN → USD, solo para dar una idea aproximada al
// prestador — NO es una tasa en vivo (eso necesitaría una API externa
// nueva). Verificada al momento de escribir esto (~17.1 MXN/USD);
// revisar de vez en cuando si se nota muy desfasada.
const TASA_USD_REFERENCIA = 17.1;

// Ícono personalizado para el marcador del prestador
const iconoPrestador = L.divIcon({
  html: `<div style="background:#15803d;color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:14px;">📍</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  className: '',
});

// Componente interno para capturar clicks en el mapa
function ClickCaptor({ onUbicacion }: { onUbicacion: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onUbicacion(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function AuthModal({ onClose, onSuccess, vistaInicial, prestadorInicial }: Props) {
  const [vista, setVista] = useState<Vista>(vistaInicial ?? 'login');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [verPass, setVerPass] = useState(false);
  const [esPrestador, setEsPrestador] = useState(prestadorInicial ?? false);
  // Paso 2 del registro de prestador
  const [categoria, setCategoria] = useState('Gastronomia');
  const [municipio, setMunicipio] = useState('Catemaco');
  const [descripcion, setDescripcion] = useState('');
  const [generandoDescripcion, setGenerandoDescripcion] = useState(false);
  // Precio: nivel (para el símbolo $/$$/$$$/$$$$) + rango en pesos.
  // El nivel es solo una guía visual — lo que de verdad se guarda es
  // el rango de precios que la persona escriba.
  const [nivelPrecio, setNivelPrecio] = useState<NivelPrecio>('razonable');
  const [precioMin, setPrecioMin] = useState('');
  const [precioMax, setPrecioMax] = useState('');
  const [contacto, setContacto] = useState('');
  const [codigoMostrado, setCodigoMostrado] = useState('');
  const [codigoCopiado, setCodigoCopiado] = useState(false);
  const [usuarioRegistrado, setUsuarioRegistrado] = useState<UsuarioSesion | null>(null);

  // Ubicación en mapa
  const [ubicacion, setUbicacion] = useState<[number, number] | null>(null);
  const [ubicacionGuardada, setUbicacionGuardada] = useState(false);

  // Campos login
  const [correoLogin, setCorreoLogin] = useState('');
  const [passLogin, setPassLogin] = useState('');

  // Campos registro
  const [nombre, setNombre] = useState('');
  const [correoReg, setCorreoReg] = useState('');
  const [passReg, setPassReg] = useState('');
  const [passConf, setPassConf] = useState('');
  const [terminos, setTerminos] = useState(false);
  const [nombreNegocio, setNombreNegocio] = useState('');

  // Campos recuperar
  const [correoRec, setCorreoRec] = useState('');
  const [codigoRec, setCodigoRec] = useState('');
  const [passNueva, setPassNueva] = useState('');
  const [recuperado, setRecuperado] = useState(false);

  // Arma el texto de precio final a partir del nivel + rango que la
  // persona escribió, con el equivalente aproximado en dólares.
  function precioFinal(): string {
    const nivel = NIVELES_PRECIO.find((n) => n.id === nivelPrecio)!;
    const min = parseFloat(precioMin);
    const max = parseFloat(precioMax);
    if (Number.isNaN(min) || Number.isNaN(max) || min <= 0 || max <= 0) {
      return 'A consultar';
    }
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
          mensajes: [
            {
              role: 'user',
              content: `Nombre: ${nombreNegocio.trim()}. Categoría: ${categoria}. Municipio: ${municipio}. Escribe la descripción.`,
            },
          ],
        }),
      });
      const data = await r.json();
      if (r.ok && data.texto) {
        setDescripcion(data.texto.trim());
      } else {
        setError('No se pudo generar la descripción ahora mismo — escríbela tú, no hay problema.');
      }
    } catch {
      setError('Necesitas internet para generar la descripción con IA.');
    } finally {
      setGenerandoDescripcion(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    const res = await apiLogin({ correo: correoLogin, password: passLogin });
    setCargando(false);
    if (res.ok && res.usuario) onSuccess(res.usuario);
    else setError(res.error ?? 'Correo o contraseña incorrectos');
  }

  async function handleRegistro(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (passReg !== passConf) return setError('Las contraseñas no coinciden');
    if (passReg.length < 6) return setError('La contraseña debe tener mínimo 6 caracteres');
    if (!terminos) return setError('Debes aceptar los términos y condiciones');
    if (esPrestador && !ubicacionGuardada) return setError('Marca tu ubicación en el mapa antes de continuar');
    setCargando(true);
    const res = await apiRegistro({
      nombre,
      correo: correoReg,
      password: passReg,
      tipo: esPrestador ? 'prestador' : 'turista',
    });
    setCargando(false);
    if (res.ok && res.usuario) {
      if (esPrestador && ubicacion && nombreNegocio.trim() && res.token) {
        try {
          localStorage.setItem('prestador-lat', String(ubicacion[0]));
          localStorage.setItem('prestador-lng', String(ubicacion[1]));
          localStorage.setItem('prestador-nombre-negocio', nombreNegocio.trim());
          // Registrar servicio en Neon automáticamente
          fetch('/api/servicios/registro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${res.token}` },
            body: JSON.stringify({
              nombre: nombreNegocio.trim(),
              categoria,
              municipio,
              descripcion: descripcion.trim() || `Servicio turístico de ${nombreNegocio.trim()} en Los Tuxtlas.`,
              precio: precioFinal(),
              contacto: contacto.trim() || correoReg,
              lat: ubicacion[0],
              lng: ubicacion[1],
            }),
          }).catch(() => {});
        } catch {}
      }
      setCodigoMostrado(res.codigoRecuperacion ?? '');
      setUsuarioRegistrado(res.usuario);
      setVista('codigo');
    } else {
      setError(res.error ?? 'Error al crear la cuenta');
    }
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    const res = await apiRecuperar({ correo: correoRec, codigoRecuperacion: codigoRec, nuevaPassword: passNueva });
    setCargando(false);
    if (res.ok) setRecuperado(true);
    else setError(res.error ?? 'Correo o código incorrectos');
  }

  function copiarCodigo() {
    navigator.clipboard.writeText(codigoMostrado).catch(() => {});
    setCodigoCopiado(true);
    setTimeout(() => setCodigoCopiado(false), 2000);
  }

  // ─── CÓDIGO DE RECUPERACIÓN ───
  if (vista === 'codigo') {
    return (
      <div style={{ position:'fixed',inset:0,zIndex:9999,backgroundColor:'rgba(2,44,22,0.85)',display:'flex',alignItems:'flex-end' }} className="auth-modal-overlay lg:!items-center lg:!justify-center lg:p-8">
        <div className="bg-white w-full rounded-t-3xl lg:rounded-3xl p-6 pb-10 lg:max-w-md lg:shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-jungle-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={32} className="text-jungle-600" />
            </div>
            <h2 className="font-display font-extrabold text-2xl text-jungle-950">¡Cuenta creada!</h2>
            <p className="text-jungle-600 mt-1 text-sm">Bienvenido, {usuarioRegistrado?.nombre.split(' ')[0]}</p>
          </div>
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Lock size={16} className="text-amber-600" />
              <p className="text-xs font-bold text-amber-900">Guarda tu código de recuperación</p>
            </div>
            <p className="text-xs text-amber-700 mb-3">Si olvidas tu contraseña lo necesitarás. <strong>No lo podrás ver de nuevo.</strong></p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white border border-amber-200 rounded-xl px-4 py-3 text-base font-bold text-center text-jungle-900 tracking-widest">
                {codigoMostrado}
              </code>
              <button onClick={copiarCodigo} className="bg-amber-500 hover:bg-amber-600 text-white p-3 rounded-xl transition-colors">
                {codigoCopiado ? <CheckCircle2 size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>
          <button onClick={() => { if (usuarioRegistrado) onSuccess(usuarioRegistrado); else onClose(); }}
            className="w-full bg-jungle-700 hover:bg-jungle-800 text-white font-bold py-4 rounded-2xl transition-colors">
            Ya lo guardé — Entrar a la app
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position:'fixed',inset:0,zIndex:9999,backgroundColor:'rgba(2,44,22,0.85)',display:'flex',alignItems:'flex-end' }} className="auth-modal-overlay lg:!items-center lg:!justify-center lg:p-8">
      <div className="bg-white w-full rounded-t-3xl lg:rounded-3xl max-h-[92vh] overflow-y-auto lg:max-w-md lg:max-h-[90vh] lg:shadow-2xl" style={{ WebkitOverflowScrolling:'touch' }}>

        {/* Header sticky */}
        <div className="sticky top-0 bg-white border-b border-jungle-100 px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
          <img src="/logo-tuxtlasgo.png" alt="TuxtlasGO" className="h-8 w-auto object-contain" />
          <button onClick={onClose} className="text-jungle-400 hover:text-jungle-700 p-1"><X size={22} /></button>
        </div>

        <div className="px-6 py-6 pb-12">

          {/* ─── RECUPERAR ─── */}
          {vista === 'recuperar' && (
            <div>
              <button onClick={() => { setVista('login'); setError(''); setRecuperado(false); }}
                className="text-xs text-jungle-600 underline mb-5 block">← Volver al inicio de sesión</button>
              {recuperado ? (
                <div className="text-center py-6">
                  <CheckCircle2 size={40} className="text-jungle-600 mx-auto mb-3" />
                  <h3 className="font-display font-bold text-lg text-jungle-950 mb-2">¡Contraseña actualizada!</h3>
                  <p className="text-sm text-jungle-600 mb-5">Ya puedes iniciar sesión con tu nueva contraseña.</p>
                  <button onClick={() => { setVista('login'); setRecuperado(false); setError(''); }}
                    className="bg-jungle-700 text-white font-bold px-8 py-3 rounded-2xl">Iniciar sesión</button>
                </div>
              ) : (
                <>
                  <h2 className="font-display font-extrabold text-2xl text-jungle-950 mb-1">Recuperar contraseña</h2>
                  <p className="text-sm text-jungle-600 mb-6">Ingresa tu correo y el código de recuperación que guardaste.</p>
                  {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>}
                  <form onSubmit={handleRecuperar} className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Correo electrónico</label>
                      <div className="relative">
                        <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-400" />
                        <input type="email" value={correoRec} onChange={e => setCorreoRec(e.target.value)} required placeholder="tu@email.com"
                          className="w-full border border-jungle-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Código de recuperación</label>
                      <input type="text" value={codigoRec} onChange={e => setCodigoRec(e.target.value.toUpperCase())} required placeholder="REC-XXXXXXXX"
                        className="w-full border border-jungle-200 rounded-xl px-4 py-3 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Nueva contraseña</label>
                      <div className="relative">
                        <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-400" />
                        <input type="password" value={passNueva} onChange={e => setPassNueva(e.target.value)} required minLength={6} placeholder="Mínimo 6 caracteres"
                          className="w-full border border-jungle-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                      </div>
                    </div>
                    <button type="submit" disabled={cargando}
                      className="w-full bg-jungle-700 hover:bg-jungle-800 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 transition-colors">
                      {cargando && <Loader2 size={18} className="animate-spin" />}
                      Cambiar contraseña
                    </button>
                  </form>
                </>
              )}
            </div>
          )}

          {/* ─── LOGIN ─── */}
          {vista === 'login' && (
            <div>
              <h2 className="font-display font-extrabold text-2xl text-jungle-950 mb-1">Iniciar sesión</h2>
              <p className="text-sm text-jungle-600 mb-6">Ingresa tus datos para continuar</p>
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>}
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Correo electrónico</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-400" />
                    <input type="email" value={correoLogin} onChange={e => setCorreoLogin(e.target.value)} required placeholder="tu@email.com"
                      className="w-full border border-jungle-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-jungle-700">Contraseña</label>
                    <button type="button" onClick={() => { setVista('recuperar'); setError(''); }}
                      className="text-xs text-jungle-600 underline">¿Olvidaste tu contraseña?</button>
                  </div>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-400" />
                    <input type={verPass ? 'text' : 'password'} value={passLogin} onChange={e => setPassLogin(e.target.value)} required placeholder="Tu contraseña"
                      className="w-full border border-jungle-200 rounded-xl pl-10 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                    <button type="button" onClick={() => setVerPass(!verPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-jungle-400">
                      {verPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={cargando}
                  className="w-full bg-jungle-700 hover:bg-jungle-800 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 transition-colors mt-2">
                  {cargando && <Loader2 size={18} className="animate-spin" />}
                  Iniciar sesión
                </button>
              </form>
              <p className="text-center text-sm text-jungle-600 mt-6">
                ¿No tienes cuenta?{' '}
                <button onClick={() => { setVista('registro'); setError(''); }} className="font-bold text-jungle-800 underline">Regístrate aquí</button>
              </p>
            </div>
          )}

          {/* ─── REGISTRO ─── */}
          {vista === 'registro' && (
            <div>
              <h2 className="font-display font-extrabold text-2xl text-jungle-950 mb-1">Crear cuenta</h2>
              <p className="text-sm text-jungle-600 mb-6">Completa los datos para registrarte</p>
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>}

              <form onSubmit={handleRegistro} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Nombre completo <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-400" />
                    <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} required minLength={2} placeholder="Tu nombre y apellido"
                      className="w-full border border-jungle-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Correo electrónico <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-400" />
                    <input type="email" value={correoReg} onChange={e => setCorreoReg(e.target.value)} required placeholder="tu@email.com"
                      className="w-full border border-jungle-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Contraseña <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-400" />
                    <input type={verPass ? 'text' : 'password'} value={passReg} onChange={e => setPassReg(e.target.value)} required minLength={6} placeholder="Mínimo 6 caracteres"
                      className="w-full border border-jungle-200 rounded-xl pl-10 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                    <button type="button" onClick={() => setVerPass(!verPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-jungle-400">
                      {verPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Confirmar contraseña <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-400" />
                    <input type="password" value={passConf} onChange={e => setPassConf(e.target.value)} required placeholder="Repite tu contraseña"
                      className={`w-full border rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 ${passConf && passReg !== passConf ? 'border-red-300 bg-red-50' : 'border-jungle-200'}`} />
                  </div>
                  {passConf && passReg !== passConf && <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>}
                </div>

                {/* Toggle prestador — ya NO abre una caja anidada
                    dentro del formulario; lo que sigue es parte del
                    MISMO formulario continuo (hallazgo real de campo:
                    "formulario dentro de formulario... se ve muy
                    pequeño y ambiguo", doc MEJORAS DISEÑO PANEL
                    PRESTADOR). */}
                <button type="button" onClick={() => setEsPrestador(!esPrestador)}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-colors text-left ${esPrestador ? 'border-jungle-500 bg-jungle-50' : 'border-jungle-100 bg-white'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${esPrestador ? 'bg-jungle-600 border-jungle-600' : 'border-jungle-300'}`}>
                      {esPrestador && <CheckCircle2 size={12} className="text-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-jungle-900">¿Eres proveedor de servicios?</p>
                      <p className="text-xs text-jungle-500">Hotel, restaurante, ecoturismo u otro servicio turístico</p>
                    </div>
                  </div>
                  {esPrestador ? <ChevronUp size={18} className="text-jungle-600 flex-shrink-0" /> : <ChevronDown size={18} className="text-jungle-400 flex-shrink-0" />}
                </button>

                {esPrestador && (
                  <>
                    <div className="bg-sun-50 border border-sun-200 rounded-xl p-3">
                      <p className="text-xs font-bold text-sun-800 mb-1">🎁 ¡1 mes GRATIS de promoción!</p>
                      <p className="text-xs text-sun-700">Visibilidad en el mapa · recomendaciones de la IA · perfil verificado. Sujeto a validación.</p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Nombre de empresa o servicio <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-400" />
                        <input type="text" value={nombreNegocio} onChange={e => setNombreNegocio(e.target.value)} placeholder="Ej: Hotel Lago Encantado"
                          className="w-full border border-jungle-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Categoría <span className="text-red-500">*</span></label>
                        <select value={categoria} onChange={e => setCategoria(e.target.value)}
                          className="w-full border border-jungle-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400">
                          {['Gastronomia','Naturaleza','Aventura','Hospedaje','Comercio','Cooperativa','Otro'].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Municipio <span className="text-red-500">*</span></label>
                        <select value={municipio} onChange={e => setMunicipio(e.target.value)}
                          className="w-full border border-jungle-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400">
                          {['Catemaco','San Andrés Tuxtla','Santiago Tuxtla'].map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Descripción + generar con IA */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-jungle-700 block">Descripción <span className="text-red-500">*</span></label>
                        <button type="button" onClick={generarDescripcionIA} disabled={generandoDescripcion}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-jungle-700 hover:text-jungle-900 disabled:opacity-50">
                          {generandoDescripcion ? <Loader2 size={12} className="animate-spin" /> : <span>✨</span>}
                          Generar descripción con IA
                        </button>
                      </div>
                      <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)}
                        placeholder="¿Qué ofreces? ¿Qué te hace especial? (mín. 20 caracteres) — o pulsa 'Generar descripción con IA' arriba" rows={3}
                        className="w-full border border-jungle-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 resize-none" />
                      <p className="text-[11px] text-jungle-500 mt-1">Es de suma importancia para que las personas vean bien tu servicio — si la IA te ayuda a redactarla, léela y ajusta lo que haga falta antes de enviar.</p>
                    </div>

                    {/* Precio — nivel + rango + equivalente en USD */}
                    <div>
                      <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Precio aproximado</label>
                      <div className="grid grid-cols-4 gap-1.5 mb-2">
                        {NIVELES_PRECIO.map((n) => (
                          <button key={n.id} type="button" onClick={() => setNivelPrecio(n.id)}
                            className={`rounded-xl py-2 text-center border-2 transition-colors ${nivelPrecio === n.id ? 'border-jungle-500 bg-jungle-50' : 'border-jungle-100'}`}>
                            <div className="font-display font-bold text-jungle-800 text-sm">{n.simbolo}</div>
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-jungle-500 mb-2">
                        {NIVELES_PRECIO.find((n) => n.id === nivelPrecio)?.label}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-400 text-sm">$</span>
                          <input type="number" min={0} value={precioMin} onChange={e => setPrecioMin(e.target.value)} placeholder="Desde"
                            className="w-full border border-jungle-200 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                        </div>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-400 text-sm">$</span>
                          <input type="number" min={0} value={precioMax} onChange={e => setPrecioMax(e.target.value)} placeholder="Hasta"
                            className="w-full border border-jungle-200 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                        </div>
                      </div>
                      {precioMin && precioMax && !Number.isNaN(parseFloat(precioMin)) && !Number.isNaN(parseFloat(precioMax)) && (
                        <p className="text-[11px] text-jungle-500 mt-1.5">
                          ≈ ${Math.round(parseFloat(precioMin) / TASA_USD_REFERENCIA)} – ${Math.round(parseFloat(precioMax) / TASA_USD_REFERENCIA)} USD (tasa de referencia, no en vivo)
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">WhatsApp o correo</label>
                      <input type="text" value={contacto} onChange={e => setContacto(e.target.value)}
                        placeholder="9521234567" className="w-full border border-jungle-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                    </div>

                    {/* Mini mapa de ubicación */}
                    <div>
                      <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">
                        <MapPin size={11} className="inline mr-1" />
                        Marca tu ubicación en el mapa <span className="text-red-500">*</span>
                      </label>
                      <p className="text-[11px] text-jungle-500 mb-2">Toca el mapa donde está tu negocio para colocar el marcador</p>
                      <div className="rounded-xl overflow-hidden border-2 border-jungle-200" style={{ height: '220px', position: 'relative' }}>
                        <MapContainer
                          center={TUXTLAS_CENTER}
                          zoom={11}
                          style={{ height: '100%', width: '100%' }}
                          zoomControl={true}
                          attributionControl={false}
                        >
                          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                          <ClickCaptor onUbicacion={(lat, lng) => {
                            setUbicacion([lat, lng]);
                            setUbicacionGuardada(false);
                          }} />
                          {ubicacion && (
                            <Marker position={ubicacion} icon={iconoPrestador} />
                          )}
                        </MapContainer>
                      </div>

                      {ubicacion && !ubicacionGuardada && (
                        <button type="button"
                          onClick={() => setUbicacionGuardada(true)}
                          className="w-full mt-2 bg-jungle-600 hover:bg-jungle-700 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors">
                          <Navigation size={13} />
                          Guardar ubicación
                        </button>
                      )}
                      {ubicacionGuardada && (
                        <div className="mt-2 flex items-center gap-2 bg-jungle-50 border border-jungle-200 rounded-xl px-3 py-2">
                          <CheckCircle2 size={14} className="text-jungle-600 flex-shrink-0" />
                          <p className="text-xs text-jungle-700 font-medium">
                            Ubicación guardada ({ubicacion![0].toFixed(4)}, {ubicacion![1].toFixed(4)})
                          </p>
                          <button type="button" onClick={() => { setUbicacionGuardada(false); setUbicacion(null); }}
                            className="ml-auto text-[10px] text-jungle-500 underline">cambiar</button>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Términos */}
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={terminos} onChange={e => setTerminos(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-jungle-300 text-jungle-600" />
                  <span className="text-xs text-jungle-600">
                    Acepto los <span className="text-jungle-800 underline font-semibold">términos y condiciones</span> del sistema
                  </span>
                </label>

                <button type="submit" disabled={cargando || (passConf !== '' && passReg !== passConf)}
                  className="w-full bg-jungle-700 hover:bg-jungle-800 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 transition-colors">
                  {cargando && <Loader2 size={18} className="animate-spin" />}
                  {esPrestador ? 'Enviar solicitud de registro' : 'Crear cuenta'}
                </button>
              </form>

              <p className="text-center text-sm text-jungle-600 mt-6">
                ¿Ya tienes cuenta?{' '}
                <button onClick={() => { setVista('login'); setError(''); }} className="font-bold text-jungle-800 underline">Inicia sesión</button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}