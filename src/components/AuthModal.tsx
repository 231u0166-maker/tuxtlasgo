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
}

const TUXTLAS_CENTER: [number, number] = [18.45, -95.18];

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

export default function AuthModal({ onClose, onSuccess }: Props) {
  const [vista, setVista] = useState<Vista>('login');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [verPass, setVerPass] = useState(false);
  const [esPrestador, setEsPrestador] = useState(false);
  // Paso 2 del registro de prestador
  const [categoria, setCategoria] = useState('Gastronomia');
  const [municipio, setMunicipio] = useState('Catemaco');
  const [descripcion, setDescripcion] = useState('');
  const [precio, setPrecio] = useState('');
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
              precio: precio.trim() || 'A consultar',
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

                {/* Checkbox prestador */}
                <div className={`border-2 rounded-2xl overflow-hidden transition-colors ${esPrestador ? 'border-jungle-500 bg-jungle-50' : 'border-jungle-100'}`}>
                  <button type="button" onClick={() => setEsPrestador(!esPrestador)}
                    className="w-full flex items-center justify-between p-4 text-left">
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
                    <div className="px-4 pb-4 space-y-3 border-t border-jungle-100 pt-3">
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                        <p className="text-xs font-bold text-amber-800 mb-1">🎁 ¡1 mes GRATIS de promoción!</p>
                        <p className="text-xs text-amber-700">Visibilidad en el mapa · recomendaciones de la IA · perfil verificado. Sujeto a validación.</p>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-jungle-700 mb-1 block">Nombre de empresa o servicio <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-jungle-400" />
                          <input type="text" value={nombreNegocio} onChange={e => setNombreNegocio(e.target.value)} placeholder="Ej: Hotel Lago Encantado"
                            className="w-full border border-jungle-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                        </div>
                      </div>

                      {/* Categoría y Municipio */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-semibold text-jungle-700 mb-1 block">Categoría <span className="text-red-500">*</span></label>
                          <select value={categoria} onChange={e => setCategoria(e.target.value)}
                            className="w-full border border-jungle-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400">
                            {['Gastronomia','Naturaleza','Aventura','Hospedaje','Cultura','Transporte','Comercio','Cooperativa','Otro'].map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-jungle-700 mb-1 block">Municipio <span className="text-red-500">*</span></label>
                          <select value={municipio} onChange={e => setMunicipio(e.target.value)}
                            className="w-full border border-jungle-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400">
                            {['Catemaco','San Andrés Tuxtla','Santiago Tuxtla'].map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Descripción */}
                      <div>
                        <label className="text-xs font-semibold text-jungle-700 mb-1 block">Descripción <span className="text-red-500">*</span></label>
                        <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)}
                          placeholder="¿Qué ofreces? ¿Qué te hace especial? (mín. 20 caracteres)" rows={3}
                          className="w-full border border-jungle-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 resize-none" />
                      </div>

                      {/* Precio y Contacto */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-semibold text-jungle-700 mb-1 block">Precio aproximado</label>
                          <input type="text" value={precio} onChange={e => setPrecio(e.target.value)}
                            placeholder="$200 MXN" className="w-full border border-jungle-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-jungle-700 mb-1 block">WhatsApp o correo</label>
                          <input type="text" value={contacto} onChange={e => setContacto(e.target.value)}
                            placeholder="9521234567" className="w-full border border-jungle-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
                        </div>
                      </div>

                      {/* Mini mapa de ubicación */}
                      <div>
                        <label className="text-xs font-semibold text-jungle-700 mb-1 block">
                          <MapPin size={11} className="inline mr-1" />
                          Marca tu ubicación en el mapa <span className="text-red-500">*</span>
                        </label>
                        <p className="text-[10px] text-jungle-500 mb-2">Toca el mapa donde está tu negocio para colocar el marcador</p>
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
                    </div>
                  )}
                </div>

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