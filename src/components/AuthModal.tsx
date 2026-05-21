import { useState } from 'react';
import { X, Eye, EyeOff, Loader2, CheckCircle2, Copy } from 'lucide-react';
import { apiLogin, apiRegistro, apiRecuperar, type UsuarioSesion } from '../lib/auth';

type Vista = 'login' | 'registro' | 'recuperar' | 'codigo';

interface Props {
  onClose: () => void;
  onSuccess: (usuario: UsuarioSesion) => void;
}

export default function AuthModal({ onClose, onSuccess }: Props) {
  const [vista, setVista] = useState<Vista>('login');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [verPassword, setVerPassword] = useState(false);

  // Campos login
  const [correoLogin, setCorreoLogin] = useState('');
  const [passLogin, setPassLogin] = useState('');

  // Campos registro
  const [nombre, setNombre] = useState('');
  const [correoReg, setCorreoReg] = useState('');
  const [passReg, setPassReg] = useState('');
  const [tipo, setTipo] = useState<'turista' | 'prestador'>('turista');
  const [codigoMostrado, setCodigoMostrado] = useState('');
  const [codigoCopiado, setCodigoCopiado] = useState(false);

  // Campos recuperar
  const [correoRec, setCorreoRec] = useState('');
  const [codigoRec, setCodigoRec] = useState('');
  const [passNueva, setPassNueva] = useState('');

  const limpiarError = () => setError('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    const res = await apiLogin({ correo: correoLogin, password: passLogin });
    setCargando(false);
    if (res.ok && res.usuario) {
      onSuccess(res.usuario);
    } else {
      setError(res.error ?? 'Error al iniciar sesión');
    }
  }

  async function handleRegistro(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    const res = await apiRegistro({ nombre, correo: correoReg, password: passReg, tipo });
    setCargando(false);
    if (res.ok && res.usuario) {
      setCodigoMostrado(res.codigoRecuperacion ?? '');
      setVista('codigo');
      // El usuario ya quedó logueado, lo pasamos al padre cuando cierre el modal del código
    } else {
      setError(res.error ?? 'Error al registrarse');
    }
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    const res = await apiRecuperar({
      correo: correoRec,
      codigoRecuperacion: codigoRec,
      nuevaPassword: passNueva,
    });
    setCargando(false);
    if (res.ok) {
      setVista('login');
      setError('');
    } else {
      setError(res.error ?? 'Error al recuperar contraseña');
    }
  }

  function copiarCodigo() {
    navigator.clipboard.writeText(codigoMostrado).catch(() => {});
    setCodigoCopiado(true);
    setTimeout(() => setCodigoCopiado(false), 2000);
  }

  // ─── PANTALLA: CÓDIGO DE RECUPERACIÓN ────────────────────
  if (vista === 'codigo') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(2,44,22,0.97)', display: 'flex', alignItems: 'flex-end' }}>
        <div className="bg-white w-full rounded-t-3xl p-6 pb-8">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-jungle-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={28} className="text-jungle-700" />
            </div>
            <h2 className="font-display font-extrabold text-xl text-jungle-950">¡Cuenta creada!</h2>
            <p className="text-sm text-jungle-700 mt-1">Bienvenido a TuxtlasGO 🌿</p>
          </div>

          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 mb-5">
            <p className="text-xs font-bold text-amber-900 mb-1">⚠️ Guarda este código ahora</p>
            <p className="text-xs text-amber-800 mb-3">
              Si olvidas tu contraseña, lo necesitarás para recuperar tu cuenta.
              <strong> No lo podrás ver de nuevo.</strong>
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white border border-amber-200 rounded-xl px-4 py-3 text-lg font-bold text-center text-jungle-900 tracking-widest">
                {codigoMostrado}
              </code>
              <button
                onClick={copiarCodigo}
                className="bg-amber-500 text-white p-3 rounded-xl"
              >
                {codigoCopiado ? <CheckCircle2 size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full bg-jungle-700 text-white font-bold py-3.5 rounded-2xl"
          >
            Ya lo guardé, continuar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(2,44,22,0.97)', display: 'flex', alignItems: 'flex-end' }}>
      <div className="bg-white w-full rounded-t-3xl p-6 pb-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <img src="/logo-tuxtlasgo.png" alt="TuxtlasGO" className="h-8 w-auto object-contain" />
          <button onClick={onClose} className="text-jungle-400 hover:text-jungle-700 p-1">
            <X size={22} />
          </button>
        </div>

        {/* Tabs */}
        {vista !== 'recuperar' && (
          <div className="flex bg-jungle-50 rounded-xl p-1 mb-6">
            <button
              onClick={() => { setVista('login'); limpiarError(); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                vista === 'login' ? 'bg-white text-jungle-900 shadow-sm' : 'text-jungle-600'
              }`}
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => { setVista('registro'); limpiarError(); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                vista === 'registro' ? 'bg-white text-jungle-900 shadow-sm' : 'text-jungle-600'
              }`}
            >
              Crear cuenta
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        {/* ─── LOGIN ─── */}
        {vista === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-jungle-700 mb-1 block">Correo electrónico</label>
              <input
                type="email"
                value={correoLogin}
                onChange={e => setCorreoLogin(e.target.value)}
                placeholder="tu@correo.com"
                required
                className="w-full border border-jungle-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-jungle-700 mb-1 block">Contraseña</label>
              <div className="relative">
                <input
                  type={verPassword ? 'text' : 'password'}
                  value={passLogin}
                  onChange={e => setPassLogin(e.target.value)}
                  placeholder="Tu contraseña"
                  required
                  className="w-full border border-jungle-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 pr-12"
                />
                <button type="button" onClick={() => setVerPassword(!verPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-jungle-400">
                  {verPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={cargando}
              className="w-full bg-jungle-700 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {cargando ? <Loader2 size={18} className="animate-spin" /> : null}
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => { setVista('recuperar'); limpiarError(); }}
              className="w-full text-center text-xs text-jungle-600 underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        )}

        {/* ─── REGISTRO ─── */}
        {vista === 'registro' && (
          <form onSubmit={handleRegistro} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-jungle-700 mb-1 block">Nombre completo</label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Tu nombre"
                required
                minLength={2}
                className="w-full border border-jungle-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-jungle-700 mb-1 block">Correo electrónico</label>
              <input
                type="email"
                value={correoReg}
                onChange={e => setCorreoReg(e.target.value)}
                placeholder="tu@correo.com"
                required
                className="w-full border border-jungle-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-jungle-700 mb-1 block">Contraseña</label>
              <div className="relative">
                <input
                  type={verPassword ? 'text' : 'password'}
                  value={passReg}
                  onChange={e => setPassReg(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  className="w-full border border-jungle-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 pr-12"
                />
                <button type="button" onClick={() => setVerPassword(!verPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-jungle-400">
                  {verPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-jungle-700 mb-2 block">¿Cómo usarás la app?</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setTipo('turista')}
                  className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${
                    tipo === 'turista'
                      ? 'border-jungle-600 bg-jungle-50 text-jungle-900'
                      : 'border-jungle-100 text-jungle-500'
                  }`}
                >
                  🗺️ Soy turista
                </button>
                <button
                  type="button"
                  onClick={() => setTipo('prestador')}
                  className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${
                    tipo === 'prestador'
                      ? 'border-jungle-600 bg-jungle-50 text-jungle-900'
                      : 'border-jungle-100 text-jungle-500'
                  }`}
                >
                  🏪 Soy prestador
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={cargando}
              className="w-full bg-jungle-700 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {cargando ? <Loader2 size={18} className="animate-spin" /> : null}
              Crear cuenta
            </button>
          </form>
        )}

        {/* ─── RECUPERAR ─── */}
        {vista === 'recuperar' && (
          <form onSubmit={handleRecuperar} className="space-y-4">
            <div>
              <button onClick={() => setVista('login')} className="text-xs text-jungle-600 underline mb-3 block">
                ← Volver al login
              </button>
              <h3 className="font-display font-bold text-lg text-jungle-950 mb-1">Recuperar contraseña</h3>
              <p className="text-xs text-jungle-600 mb-4">
                Ingresa tu correo y el código de recuperación que recibiste al crear tu cuenta.
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-jungle-700 mb-1 block">Correo electrónico</label>
              <input type="email" value={correoRec} onChange={e => setCorreoRec(e.target.value)}
                placeholder="tu@correo.com" required
                className="w-full border border-jungle-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-jungle-700 mb-1 block">Código de recuperación</label>
              <input type="text" value={codigoRec} onChange={e => setCodigoRec(e.target.value.toUpperCase())}
                placeholder="REC-XXXXXXXX" required
                className="w-full border border-jungle-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-jungle-400 tracking-widest" />
            </div>
            <div>
              <label className="text-xs font-semibold text-jungle-700 mb-1 block">Nueva contraseña</label>
              <input type="password" value={passNueva} onChange={e => setPassNueva(e.target.value)}
                placeholder="Mínimo 6 caracteres" required minLength={6}
                className="w-full border border-jungle-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400" />
            </div>
            <button type="submit" disabled={cargando}
              className="w-full bg-jungle-700 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60">
              {cargando ? <Loader2 size={18} className="animate-spin" /> : null}
              Cambiar contraseña
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
