import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ShieldCheck, CheckCircle2, XCircle,
  Clock, Store, MapPin, Phone, DollarSign, Loader2
} from 'lucide-react';

const ADMIN_PWD = 'tuxtlasgo2026';

type Filtro = 'pendiente' | 'aprobado' | 'rechazado' | 'todos';

interface Servicio {
  id: number;
  nombre: string;
  categoria: string;
  municipio: string;
  descripcion: string;
  precio?: string;
  contacto?: string;
  estado: string;
  codigo_seguimiento: string;
  motivo_rechazo?: string;
  usuario_nombre?: string;
  usuario_correo?: string;
  creado_en: string;
}

export default function AdminPanel() {
  const [autenticado, setAutenticado] = useState(false);
  const [pass, setPass] = useState('');
  const [errorAuth, setErrorAuth] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('pendiente');
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [cargando, setCargando] = useState(false);
  const [accionando, setAccionando] = useState<number | null>(null);

  async function cargarServicios(estado: Filtro) {
    setCargando(true);
    try {
      if (estado === 'todos') {
        const [r1, r2, r3] = await Promise.all([
          fetch('/api/servicios/admin?estado=pendiente', { headers: { 'X-Admin-Password': ADMIN_PWD } }).then(r => r.json()),
          fetch('/api/servicios/admin?estado=aprobado', { headers: { 'X-Admin-Password': ADMIN_PWD } }).then(r => r.json()),
          fetch('/api/servicios/admin?estado=rechazado', { headers: { 'X-Admin-Password': ADMIN_PWD } }).then(r => r.json()),
        ]);
        setServicios([...(r1.servicios||[]), ...(r2.servicios||[]), ...(r3.servicios||[])]);
      } else {
        const res = await fetch(`/api/servicios/admin?estado=${estado}`, {
          headers: { 'X-Admin-Password': ADMIN_PWD }
        });
        const data = await res.json();
        setServicios(data.servicios || []);
      }
    } catch (err) {
      console.error(err);
    }
    setCargando(false);
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (pass === ADMIN_PWD) {
      setAutenticado(true);
      setErrorAuth('');
      cargarServicios('pendiente');
    } else {
      setErrorAuth('Contraseña incorrecta');
    }
  }

  async function aprobar(id: number) {
    setAccionando(id);
    try {
      await fetch('/api/servicios/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PWD },
        body: JSON.stringify({ servicioId: id, accion: 'aprobar' })
      });
      await cargarServicios(filtro);
    } catch (err) { console.error(err); }
    setAccionando(null);
  }

  async function rechazar(id: number) {
    const motivo = prompt('Motivo del rechazo (lo verá el prestador):');
    if (motivo === null) return;
    setAccionando(id);
    try {
      await fetch('/api/servicios/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PWD },
        body: JSON.stringify({ servicioId: id, accion: 'rechazar', motivoRechazo: motivo || 'No cumple los requisitos' })
      });
      await cargarServicios(filtro);
    } catch (err) { console.error(err); }
    setAccionando(null);
  }

  function cambiarFiltro(f: Filtro) {
    setFiltro(f);
    if (autenticado) cargarServicios(f);
  }

  // ─── PANTALLA DE LOGIN ADMIN ───
  if (!autenticado) {
    return (
      <div className="min-h-screen bg-jungle-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShieldCheck size={32} className="text-amber-600" />
            </div>
            <img src="/logo-tuxtlasgo.png" alt="TuxtlasGO" className="h-8 w-auto object-contain mx-auto mb-2" />
            <h1 className="font-display font-extrabold text-xl text-jungle-950">Panel de Administración</h1>
            <p className="text-sm text-jungle-600 mt-1">Solo para el equipo de TuxtlasGO</p>
          </div>

          {errorAuth && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4 text-center">
              {errorAuth}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-jungle-700 mb-1.5 block">Contraseña de administrador</label>
              <input
                type="password"
                value={pass}
                onChange={e => setPass(e.target.value)}
                placeholder="Ingresa la contraseña"
                required
                autoFocus
                className="w-full border border-jungle-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
              />
            </div>
            <button type="submit"
              className="w-full bg-jungle-700 hover:bg-jungle-800 text-white font-bold py-3.5 rounded-2xl transition-colors">
              Entrar al panel
            </button>
          </form>

          <Link to="/prestador" className="block text-center text-xs text-jungle-500 mt-4 hover:text-jungle-700">
            ← Volver a portal de prestadores
          </Link>
        </div>
      </div>
    );
  }

  // ─── PANEL ADMIN AUTENTICADO ───
  const colores: Record<string, string> = {
    pendiente: 'bg-amber-100 text-amber-800',
    aprobado:  'bg-jungle-100 text-jungle-800',
    rechazado: 'bg-red-100 text-red-700',
  };

  const pendientes = servicios.filter(s => s.estado === 'pendiente').length;

  return (
    <div className="min-h-screen bg-jungle-50">
      {/* Header */}
      <div className="bg-jungle-950 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo-tuxtlasgo.png" alt="TuxtlasGO" className="h-7 w-auto object-contain brightness-0 invert" />
          <div>
            <div className="font-display font-bold text-base">Panel Admin</div>
            <div className="text-xs text-jungle-300">TuxtlasGO — equipo interno</div>
          </div>
        </div>
        <Link to="/" className="text-xs text-jungle-300 hover:text-white flex items-center gap-1">
          <ArrowLeft size={14} /> Inicio
        </Link>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Título */}
        <div className="bg-white rounded-2xl border border-jungle-100 p-5 mb-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
            <ShieldCheck size={24} className="text-amber-600" />
          </div>
          <div>
            <h2 className="font-display font-bold text-lg text-jungle-950">Administración de servicios</h2>
            <p className="text-sm text-jungle-600">Revisa y valida los servicios de prestadores.</p>
          </div>
          {pendientes > 0 && (
            <div className="ml-auto bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full">
              {pendientes} pendiente{pendientes > 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Filtros */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {(['pendiente','aprobado','rechazado','todos'] as Filtro[]).map(f => (
            <button key={f} onClick={() => cambiarFiltro(f)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors capitalize ${
                filtro === f ? 'bg-jungle-700 text-white' : 'bg-white text-jungle-700 border border-jungle-200 hover:bg-jungle-50'
              }`}>
              {f === 'todos' ? 'Todos' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
            </button>
          ))}
        </div>

        {/* Lista de servicios */}
        {cargando ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={32} className="animate-spin text-jungle-400" />
          </div>
        ) : servicios.length === 0 ? (
          <div className="bg-white rounded-2xl border border-jungle-100 p-12 text-center">
            <Store size={40} className="text-jungle-200 mx-auto mb-3" />
            <p className="text-jungle-500 font-medium">No hay servicios {filtro !== 'todos' ? filtro + 's' : ''}.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {servicios.map(s => (
              <div key={s.id} className="bg-white rounded-2xl border border-jungle-100 p-5">
                {/* Header del servicio */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-display font-bold text-lg text-jungle-950">{s.nombre}</h3>
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${colores[s.estado] || 'bg-gray-100 text-gray-600'}`}>
                        {s.estado === 'pendiente' ? '⏳ Pendiente' : s.estado === 'aprobado' ? '✅ Aprobado' : '❌ Rechazado'}
                      </span>
                    </div>
                    <p className="text-xs text-jungle-500 font-mono">{s.codigo_seguimiento}</p>
                  </div>
                </div>

                {/* Info */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-jungle-600 mb-3">
                  <span className="flex items-center gap-1"><Store size={11} />{s.categoria}</span>
                  <span className="flex items-center gap-1"><MapPin size={11} />{s.municipio}</span>
                  {s.precio && <span className="flex items-center gap-1"><DollarSign size={11} />{s.precio}</span>}
                  {s.contacto && <span className="flex items-center gap-1"><Phone size={11} />{s.contacto}</span>}
                </div>

                {s.descripcion && (
                  <p className="text-sm text-jungle-700 bg-jungle-50 rounded-xl px-3 py-2 mb-3">{s.descripcion}</p>
                )}

                {/* Prestador */}
                {s.usuario_nombre && (
                  <p className="text-xs text-jungle-400 mb-3">
                    Registrado por: <strong>{s.usuario_nombre}</strong> ({s.usuario_correo})
                  </p>
                )}

                {/* Motivo rechazo */}
                {s.estado === 'rechazado' && s.motivo_rechazo && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 mb-3">
                    <strong>Motivo:</strong> {s.motivo_rechazo}
                  </div>
                )}

                {/* Acciones */}
                {s.estado === 'pendiente' && (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <button onClick={() => aprobar(s.id)} disabled={accionando === s.id}
                      className="bg-jungle-700 hover:bg-jungle-800 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
                      {accionando === s.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      Aprobar
                    </button>
                    <button onClick={() => rechazar(s.id)} disabled={accionando === s.id}
                      className="border-2 border-red-200 text-red-600 hover:bg-red-50 font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
                      {accionando === s.id ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                      Rechazar
                    </button>
                  </div>
                )}

                {s.estado === 'aprobado' && (
                  <button onClick={() => rechazar(s.id)} disabled={accionando === s.id}
                    className="w-full border border-red-200 text-red-500 hover:bg-red-50 text-sm font-semibold py-2 rounded-xl mt-1 transition-colors">
                    Quitar de la app
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}