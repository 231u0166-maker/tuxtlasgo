import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ShieldCheck, CheckCircle2, XCircle,
  Store, MapPin, Phone, DollarSign, Loader2, BookPlus,
  Search, ImagePlus, X, ExternalLink, Sparkles, Flag, Trash2, RotateCcw
} from 'lucide-react';
import { agregarConocimientoDinamico } from '../lib/conocimiento';
import { CATEGORIAS, type Categoria } from '../data/lugares';

const ADMIN_PWD = 'tuxtlasgo2026';

type Filtro = 'pendiente' | 'aprobado' | 'rechazado' | 'baja' | 'todos';
// Sección de más alto nivel del panel — separadas a propósito: la
// administración de servicios de PRESTADORES (aprobar/rechazar/dar de
// baja lo que registra el público) es un flujo distinto de la Base de
// Conocimiento (fichas de la IA + alta rápida de lugares por el
// propio equipo). Antes vivían mezcladas en una sola pantalla.
type Seccion = 'servicios' | 'conocimiento' | 'comunidad';

const MUNICIPIOS = ['Catemaco', 'San Andrés Tuxtla', 'Santiago Tuxtla'];
const OPCIONES_IDEAL = ['solo', 'pareja', 'familia', 'amigos'];

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
  foto_verificacion?: string;
}

interface ResultadoNominatim {
  display_name: string;
  lat: string;
  lon: string;
}

export default function AdminPanel() {
  const [autenticado, setAutenticado] = useState(false);
  const [pass, setPass] = useState('');
  const [errorAuth, setErrorAuth] = useState('');
  const [seccion, setSeccion] = useState<Seccion>('servicios');
  const [filtro, setFiltro] = useState<Filtro>('pendiente');
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [cargando, setCargando] = useState(false);
  const [accionando, setAccionando] = useState<number | null>(null);

  // ── Base de conocimiento: ficha de FAQ (sin cambios de lógica) ──
  const [mostrarFormConocimiento, setMostrarFormConocimiento] = useState(false);
  const [nuevaFicha, setNuevaFicha] = useState({ claves: '', titulo: '', respuesta: '', esSeguridad: false });
  const [guardandoFicha, setGuardandoFicha] = useState(false);
  const [mensajeFicha, setMensajeFicha] = useState<string | null>(null);

  // ── Base de conocimiento: alta rápida de servicio completo (nuevo) ──
  const [nuevoServicio, setNuevoServicio] = useState({
    nombre: '',
    categoria: 'Naturaleza' as Categoria,
    municipio: 'Catemaco',
    descripcion: '',
    precio: '',
    contacto: '',
    horario: '',
    diasAbierto: 'Todos los días',
    duracion: '',
    comoLlegar: '',
    tip: '',
    lat: '',
    lng: '',
    idealPara: [] as string[],
  });
  const [busquedaUbicacion, setBusquedaUbicacion] = useState('');
  const [resultadosUbicacion, setResultadosUbicacion] = useState<ResultadoNominatim[]>([]);
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);
  const [fotosServicio, setFotosServicio] = useState<string[]>([]);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [guardandoServicio, setGuardandoServicio] = useState(false);
  const [mensajeServicio, setMensajeServicio] = useState<string | null>(null);

  async function cargarServicios(estado: Filtro) {
    setCargando(true);
    try {
      if (estado === 'todos') {
        const [r1, r2, r3, r4] = await Promise.all([
          fetch('/api/servicios/admin?estado=pendiente', { headers: { 'X-Admin-Password': ADMIN_PWD } }).then(r => r.json()),
          fetch('/api/servicios/admin?estado=aprobado', { headers: { 'X-Admin-Password': ADMIN_PWD } }).then(r => r.json()),
          fetch('/api/servicios/admin?estado=rechazado', { headers: { 'X-Admin-Password': ADMIN_PWD } }).then(r => r.json()),
          fetch('/api/servicios/admin?estado=baja', { headers: { 'X-Admin-Password': ADMIN_PWD } }).then(r => r.json()),
        ]);
        setServicios([...(r1.servicios || []), ...(r2.servicios || []), ...(r3.servicios || []), ...(r4.servicios || [])]);
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

  async function darDeBaja(id: number) {
    const motivo = prompt('¿Por qué se da de baja? (ej. "cerró definitivamente", "cambió de dueño", "datos desactualizados")');
    if (motivo === null) return;
    setAccionando(id);
    try {
      await fetch('/api/servicios/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PWD },
        body: JSON.stringify({ servicioId: id, accion: 'dar_de_baja', motivoRechazo: motivo || 'Ya no está vigente' })
      });
      await cargarServicios(filtro);
    } catch (err) { console.error(err); }
    setAccionando(null);
  }

  async function guardarFicha() {
    if (!nuevaFicha.claves.trim() || !nuevaFicha.titulo.trim() || !nuevaFicha.respuesta.trim()) {
      setMensajeFicha('Faltan campos por llenar.');
      return;
    }
    setGuardandoFicha(true);
    setMensajeFicha(null);
    const r = await agregarConocimientoDinamico(
      {
        claves: nuevaFicha.claves,
        titulo: nuevaFicha.titulo,
        respuesta: nuevaFicha.respuesta,
        prioridad: nuevaFicha.esSeguridad ? 10 : 0,
      },
      ADMIN_PWD
    );
    setGuardandoFicha(false);
    if (r.ok) {
      setMensajeFicha('✅ Ficha guardada — ya está disponible en el chat.');
      setNuevaFicha({ claves: '', titulo: '', respuesta: '', esSeguridad: false });
    } else {
      setMensajeFicha('❌ ' + (r.error ?? 'No se pudo guardar.'));
    }
  }

  function cambiarFiltro(f: Filtro) {
    setFiltro(f);
    if (autenticado) cargarServicios(f);
  }

  function cambiarSeccion(s: Seccion) {
    setSeccion(s);
    if (s === 'servicios' && servicios.length === 0) cargarServicios(filtro);
  }

  // ── Ubicación real vía Nominatim (OpenStreetMap) — gratis, sin
  // tarjeta, sin cuenta de facturación. Se prefirió sobre Google Maps
  // Geocoding a propósito: esa API exige habilitar facturación desde
  // el primer uso, aunque tenga capa gratuita — justo lo que se
  // evitó en todo el proyecto (ver conversación sobre Groq/Gemini).
  // El navegador manda automáticamente un header Referer identificando
  // la app, que es lo que pide la política de uso de Nominatim para
  // volumen bajo como este (un puñado de registros del equipo, no
  // miles de peticiones de turistas).
  async function buscarUbicacion() {
    if (!busquedaUbicacion.trim()) return;
    setBuscandoUbicacion(true);
    setResultadosUbicacion([]);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        busquedaUbicacion + ', Los Tuxtlas, Veracruz, México'
      )}&limit=5`;
      const r = await fetch(url, { headers: { 'Accept-Language': 'es' } });
      const data = await r.json();
      setResultadosUbicacion(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[Nominatim]', err);
      setMensajeServicio('❌ No se pudo buscar la ubicación (revisa tu conexión).');
    }
    setBuscandoUbicacion(false);
  }

  function seleccionarUbicacion(resultado: ResultadoNominatim) {
    setNuevoServicio((s) => ({ ...s, lat: resultado.lat, lng: resultado.lon }));
    setResultadosUbicacion([]);
  }

  async function agregarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    if (fotosServicio.length >= 6) {
      setMensajeServicio('Máximo 6 fotos por lugar.');
      e.target.value = '';
      return;
    }
    setSubiendoFoto(true);
    setMensajeServicio(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
        reader.readAsDataURL(archivo);
      });
      const r = await fetch('/api/conocimiento/registrar-servicio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PWD },
        body: JSON.stringify({ imagenBase64: base64 }),
      });

      const data = await r.json();
      if (r.ok && data.url) {
        setFotosServicio((f) => [...f, data.url]);
      } else {
        setMensajeServicio('❌ ' + (data.error ?? 'No se pudo subir la foto.'));
      }
    } catch (err) {
      console.error(err);
      setMensajeServicio('❌ Error subiendo la foto.');
    }
    setSubiendoFoto(false);
    e.target.value = ''; // permite volver a elegir el mismo archivo si hace falta
  }

  function quitarFoto(url: string) {
    setFotosServicio((f) => f.filter((x) => x !== url));
  }

  function toggleIdeal(valor: string) {
    setNuevoServicio((s) => ({
      ...s,
      idealPara: s.idealPara.includes(valor)
        ? s.idealPara.filter((v) => v !== valor)
        : [...s.idealPara, valor],
    }));
  }

  async function guardarServicio() {
    if (!nuevoServicio.nombre.trim() || nuevoServicio.nombre.trim().length < 3) {
      setMensajeServicio('El nombre es muy corto.');
      return;
    }
    if (!nuevoServicio.descripcion.trim() || nuevoServicio.descripcion.trim().length < 10) {
      setMensajeServicio('La descripción es muy corta.');
      return;
    }
    setGuardandoServicio(true);
    setMensajeServicio(null);
    try {
      const r = await fetch('/api/conocimiento/registrar-servicio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PWD },
        body: JSON.stringify({
          nombre: nuevoServicio.nombre,
          categoria: nuevoServicio.categoria,
          municipio: nuevoServicio.municipio,
          descripcion: nuevoServicio.descripcion,
          precio: nuevoServicio.precio || undefined,
          contacto: nuevoServicio.contacto || undefined,
          lat: nuevoServicio.lat ? parseFloat(nuevoServicio.lat) : undefined,
          lng: nuevoServicio.lng ? parseFloat(nuevoServicio.lng) : undefined,
          horario: nuevoServicio.horario || undefined,
          diasAbierto: nuevoServicio.diasAbierto || undefined,
          duracion: nuevoServicio.duracion || undefined,
          comoLlegar: nuevoServicio.comoLlegar || undefined,
          tip: nuevoServicio.tip || undefined,
          idealPara: nuevoServicio.idealPara.length > 0 ? nuevoServicio.idealPara : undefined,
          fotos: fotosServicio.length > 0 ? fotosServicio : undefined,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setMensajeServicio(
          `✅ "${nuevoServicio.nombre}" registrado y visible de inmediato en la app. Código: ${data.servicio.codigo_seguimiento}`
        );
        setNuevoServicio({
          nombre: '', categoria: 'Naturaleza', municipio: 'Catemaco', descripcion: '',
          precio: '', contacto: '', horario: '', diasAbierto: 'Todos los días',
          duracion: '', comoLlegar: '', tip: '', lat: '', lng: '', idealPara: [],
        });
        setFotosServicio([]);
        setBusquedaUbicacion('');
      } else {
        setMensajeServicio('❌ ' + (data.error ?? 'No se pudo guardar.'));
      }
    } catch (err) {
      console.error(err);
      setMensajeServicio('❌ Error de conexión.');
    }
    setGuardandoServicio(false);
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
    aprobado: 'bg-jungle-100 text-jungle-800',
    rechazado: 'bg-red-100 text-red-700',
    baja: 'bg-gray-200 text-gray-700',
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

      {/* Selector de sección — separa Administración de servicios de
          Base de Conocimiento, cada una con su propio propósito. */}
      <div className="bg-white border-b border-jungle-100 px-4">
        <div className="max-w-3xl mx-auto flex gap-1">
          <button
            onClick={() => cambiarSeccion('servicios')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${seccion === 'servicios'
              ? 'border-jungle-700 text-jungle-900'
              : 'border-transparent text-jungle-400 hover:text-jungle-700'
              }`}
          >
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={15} /> Administración de servicios
              {pendientes > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {pendientes}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => cambiarSeccion('conocimiento')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${seccion === 'conocimiento'
              ? 'border-jungle-700 text-jungle-900'
              : 'border-transparent text-jungle-400 hover:text-jungle-700'
              }`}
          >
            <span className="flex items-center gap-1.5">
              <BookPlus size={15} /> Base de Conocimiento
            </span>
          </button>
          <button
            onClick={() => cambiarSeccion('comunidad')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${seccion === 'comunidad'
              ? 'border-jungle-700 text-jungle-900'
              : 'border-transparent text-jungle-400 hover:text-jungle-700'
              }`}
          >
            <span className="flex items-center gap-1.5">
              <Flag size={15} /> Comunidad reportada
            </span>
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {seccion === 'comunidad' && <SeccionComunidad />}
        {seccion === 'servicios' && (
          <>
            {/* Título */}
            <div className="bg-white rounded-2xl border border-jungle-100 p-5 mb-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <ShieldCheck size={24} className="text-amber-600" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg text-jungle-950">Administración de servicios</h2>
                <p className="text-sm text-jungle-600">Revisa y valida los servicios que registra el público.</p>
              </div>
              {pendientes > 0 && (
                <div className="ml-auto bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  {pendientes} pendiente{pendientes > 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* Filtros */}
            <div className="flex gap-2 mb-5 flex-wrap">
              {(['pendiente', 'aprobado', 'rechazado', 'baja', 'todos'] as Filtro[]).map(f => (
                <button key={f} onClick={() => cambiarFiltro(f)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors capitalize ${filtro === f ? 'bg-jungle-700 text-white' : 'bg-white text-jungle-700 border border-jungle-200 hover:bg-jungle-50'
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
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-display font-bold text-lg text-jungle-950">{s.nombre}</h3>
                          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${colores[s.estado] || 'bg-gray-100 text-gray-600'}`}>
                            {s.estado === 'pendiente' ? '⏳ Pendiente' : s.estado === 'aprobado' ? '✅ Aprobado' : s.estado === 'baja' ? '🚫 De baja' : '❌ Rechazado'}
                          </span>
                        </div>
                        <p className="text-xs text-jungle-500 font-mono">{s.codigo_seguimiento}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-jungle-600 mb-3">
                      <span className="flex items-center gap-1"><Store size={11} />{s.categoria}</span>
                      <span className="flex items-center gap-1"><MapPin size={11} />{s.municipio}</span>
                      {s.precio && <span className="flex items-center gap-1"><DollarSign size={11} />{s.precio}</span>}
                      {s.contacto && <span className="flex items-center gap-1"><Phone size={11} />{s.contacto}</span>}
                    </div>
                    {s.descripcion && (
                      <p className="text-sm text-jungle-700 bg-jungle-50 rounded-xl px-3 py-2 mb-3">{s.descripcion}</p>
                    )}
                    {s.foto_verificacion ? (
                      <a href={s.foto_verificacion} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 mb-3 group">
                        <img src={s.foto_verificacion} alt="Verificación de identidad"
                          className="h-20 w-20 rounded-xl object-cover border border-jungle-200 group-hover:opacity-80 transition-opacity" />
                        <span className="text-xs font-semibold text-jungle-600 underline">Ver foto de verificación completa</span>
                      </a>
                    ) : (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mb-3">
                        ⚠️ Sin foto de verificación de identidad — solicitud enviada antes de este requisito.
                      </p>
                    )}
                    {s.usuario_nombre && (
                      <p className="text-xs text-jungle-400 mb-3">
                        Registrado por: <strong>{s.usuario_nombre}</strong> ({s.usuario_correo})
                      </p>
                    )}
                    {(s.estado === 'rechazado' || s.estado === 'baja') && s.motivo_rechazo && (
                      <div className={`border rounded-xl px-3 py-2 text-xs mb-3 ${s.estado === 'baja' ? 'bg-gray-50 border-gray-200 text-gray-600' : 'bg-red-50 border-red-200 text-red-700'}`}>
                        <strong>Motivo:</strong> {s.motivo_rechazo}
                      </div>
                    )}
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
                      <button onClick={() => darDeBaja(s.id)} disabled={accionando === s.id}
                        className="w-full border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-semibold py-2 rounded-xl mt-1 transition-colors flex items-center justify-center gap-2">
                        {accionando === s.id ? <Loader2 size={14} className="animate-spin" /> : null}
                        Dar de baja (ya no existe / cerró)
                      </button>
                    )}
                    {s.estado === 'baja' && (
                      <button onClick={() => aprobar(s.id)} disabled={accionando === s.id}
                        className="w-full border border-jungle-300 text-jungle-700 hover:bg-jungle-50 text-sm font-semibold py-2 rounded-xl mt-1 transition-colors flex items-center justify-center gap-2">
                        {accionando === s.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        Reactivar (fue un error)
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {seccion === 'conocimiento' && (
          <>
            {/* Título */}
            <div className="bg-white rounded-2xl border border-jungle-100 p-5 mb-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-jungle-100 flex items-center justify-center">
                <BookPlus size={24} className="text-jungle-700" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg text-jungle-950">Base de Conocimiento</h2>
                <p className="text-sm text-jungle-600">
                  Datos verificados que la IA usa para responder, y alta rápida de lugares reales.
                </p>
              </div>
            </div>

            {/* Ficha de FAQ (sin cambios de lógica) */}
            <div className="bg-white rounded-2xl border border-jungle-100 p-5 mb-5">
              <button
                onClick={() => setMostrarFormConocimiento((v) => !v)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <BookPlus size={18} className="text-jungle-600" />
                  <span className="font-display font-bold text-jungle-950">Ficha de respuesta (FAQ)</span>
                </div>
                <span className="text-xs text-jungle-500">
                  {mostrarFormConocimiento ? 'Ocultar ▲' : 'Agregar ficha ▼'}
                </span>
              </button>
              {mostrarFormConocimiento && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs text-jungle-500">
                    Esta información la usa la IA para responder con datos verificados (precios, horarios,
                    seguridad). Verifica los datos antes de guardar — la IA los va a repetir tal cual.
                  </p>
                  <div>
                    <label className="text-xs font-semibold text-jungle-700 block mb-1">
                      Palabras clave (separadas por coma)
                    </label>
                    <input
                      value={nuevaFicha.claves}
                      onChange={(e) => setNuevaFicha({ ...nuevaFicha, claves: e.target.value })}
                      placeholder="ej: nombre del lugar, apodo común, palabras que usaría el turista"
                      className="w-full border border-jungle-200 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-jungle-700 block mb-1">Título interno</label>
                    <input
                      value={nuevaFicha.titulo}
                      onChange={(e) => setNuevaFicha({ ...nuevaFicha, titulo: e.target.value })}
                      placeholder="ej: Precios Restaurante X"
                      className="w-full border border-jungle-200 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-jungle-700 block mb-1">
                      Respuesta (lo que dirá la IA, tal cual)
                    </label>
                    <textarea
                      value={nuevaFicha.respuesta}
                      onChange={(e) => setNuevaFicha({ ...nuevaFicha, respuesta: e.target.value })}
                      rows={3}
                      placeholder="ej: El Restaurante X tiene precios de $100 a $200 por persona. Abre de 9am a 8pm..."
                      className="w-full border border-jungle-200 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-jungle-700">
                    <input
                      type="checkbox"
                      checked={nuevaFicha.esSeguridad}
                      onChange={(e) => setNuevaFicha({ ...nuevaFicha, esSeguridad: e.target.checked })}
                    />
                    Es información de seguridad (emergencias, salud) — se le da prioridad sobre otros datos
                  </label>
                  {mensajeFicha && <p className="text-xs font-medium">{mensajeFicha}</p>}
                  <button
                    onClick={guardarFicha}
                    disabled={guardandoFicha}
                    className="bg-jungle-700 hover:bg-jungle-800 text-white font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60 text-sm"
                  >
                    {guardandoFicha ? <Loader2 size={16} className="animate-spin" /> : <BookPlus size={16} />}
                    Guardar ficha
                  </button>
                </div>
              )}
            </div>

            {/* Alta rápida de servicio completo — NUEVO */}
            <div className="bg-white rounded-2xl border border-jungle-100 p-5">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={18} className="text-amber-600" />
                <span className="font-display font-bold text-jungle-950">Registrar servicio completo</span>
              </div>
              <p className="text-xs text-jungle-500 mb-4">
                Para dar de alta un lugar real verificado en campo — queda visible de inmediato en la app
                (mapa, explorar, y recomendaciones de la IA), a nombre de TuxtlasGO hasta que el negocio se
                una como prestador y se le transfiera.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-jungle-700 block mb-1">Nombre del lugar</label>
                  <input
                    value={nuevoServicio.nombre}
                    onChange={(e) => setNuevoServicio({ ...nuevoServicio, nombre: e.target.value })}
                    placeholder="ej: Restaurante El Buen Sazón"
                    className="w-full border border-jungle-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-jungle-700 block mb-1">Categoría</label>
                    <select
                      value={nuevoServicio.categoria}
                      onChange={(e) => setNuevoServicio({ ...nuevoServicio, categoria: e.target.value as Categoria })}
                      className="w-full border border-jungle-200 rounded-xl px-3 py-2 text-sm bg-white"
                    >
                      {CATEGORIAS.map((c) => (
                        <option key={c.id} value={c.id}>{c.emoji} {c.id}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-jungle-700 block mb-1">Municipio</label>
                    <select
                      value={nuevoServicio.municipio}
                      onChange={(e) => setNuevoServicio({ ...nuevoServicio, municipio: e.target.value })}
                      className="w-full border border-jungle-200 rounded-xl px-3 py-2 text-sm bg-white"
                    >
                      {MUNICIPIOS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-jungle-700 block mb-1">Descripción</label>
                  <textarea
                    value={nuevoServicio.descripcion}
                    onChange={(e) => setNuevoServicio({ ...nuevoServicio, descripcion: e.target.value })}
                    rows={3}
                    placeholder="Descripción completa del lugar, lo que ofrece, ambiente, especialidades..."
                    className="w-full border border-jungle-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-jungle-700 block mb-1">Precio</label>
                    <input
                      value={nuevoServicio.precio}
                      onChange={(e) => setNuevoServicio({ ...nuevoServicio, precio: e.target.value })}
                      placeholder="ej: $100 – $200 por persona"
                      className="w-full border border-jungle-200 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-jungle-700 block mb-1">Contacto</label>
                    <input
                      value={nuevoServicio.contacto}
                      onChange={(e) => setNuevoServicio({ ...nuevoServicio, contacto: e.target.value })}
                      placeholder="ej: WhatsApp 294-100-0000"
                      className="w-full border border-jungle-200 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-jungle-700 block mb-1">Horario</label>
                    <input
                      value={nuevoServicio.horario}
                      onChange={(e) => setNuevoServicio({ ...nuevoServicio, horario: e.target.value })}
                      placeholder="ej: 9:00 am – 6:00 pm"
                      className="w-full border border-jungle-200 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-jungle-700 block mb-1">Días abierto</label>
                    <input
                      value={nuevoServicio.diasAbierto}
                      onChange={(e) => setNuevoServicio({ ...nuevoServicio, diasAbierto: e.target.value })}
                      placeholder="ej: Todos los días"
                      className="w-full border border-jungle-200 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-jungle-700 block mb-1">Duración sugerida de la visita</label>
                  <input
                    value={nuevoServicio.duracion}
                    onChange={(e) => setNuevoServicio({ ...nuevoServicio, duracion: e.target.value })}
                    placeholder="ej: 2-3 horas"
                    className="w-full border border-jungle-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-jungle-700 block mb-1">Cómo llegar</label>
                  <input
                    value={nuevoServicio.comoLlegar}
                    onChange={(e) => setNuevoServicio({ ...nuevoServicio, comoLlegar: e.target.value })}
                    placeholder="ej: A 14 km de San Andrés Tuxtla, hay colectivos y taxis"
                    className="w-full border border-jungle-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-jungle-700 block mb-1">Consejo (tip insider)</label>
                  <input
                    value={nuevoServicio.tip}
                    onChange={(e) => setNuevoServicio({ ...nuevoServicio, tip: e.target.value })}
                    placeholder="ej: Ve en la mañana para evitar las nubes"
                    className="w-full border border-jungle-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>

                {/* Ideal para */}
                <div>
                  <label className="text-xs font-semibold text-jungle-700 block mb-1.5">Ideal para</label>
                  <div className="flex flex-wrap gap-2">
                    {OPCIONES_IDEAL.map((op) => (
                      <button
                        key={op}
                        type="button"
                        onClick={() => toggleIdeal(op)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${nuevoServicio.idealPara.includes(op)
                          ? 'bg-jungle-700 text-white'
                          : 'bg-jungle-50 text-jungle-600 border border-jungle-200'
                          }`}
                      >
                        {op}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ubicación — Nominatim, sin Google Maps, sin tarjeta */}
                <div className="border-t border-jungle-100 pt-3">
                  <label className="text-xs font-semibold text-jungle-700 block mb-1">
                    Ubicación (buscar dirección o nombre del lugar)
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={busquedaUbicacion}
                      onChange={(e) => setBusquedaUbicacion(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), buscarUbicacion())}
                      placeholder="ej: malecón de Catemaco"
                      className="flex-1 border border-jungle-200 rounded-xl px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={buscarUbicacion}
                      disabled={buscandoUbicacion}
                      className="bg-jungle-100 hover:bg-jungle-200 text-jungle-800 px-3 rounded-xl flex items-center justify-center"
                    >
                      {buscandoUbicacion ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    </button>
                  </div>

                  {resultadosUbicacion.length > 0 && (
                    <div className="mt-2 border border-jungle-200 rounded-xl overflow-hidden">
                      {resultadosUbicacion.map((r, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => seleccionarUbicacion(r)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-jungle-50 border-b border-jungle-100 last:border-0"
                        >
                          {r.display_name}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <label className="text-[11px] text-jungle-500 block mb-1">Latitud</label>
                      <input
                        value={nuevoServicio.lat}
                        onChange={(e) => setNuevoServicio({ ...nuevoServicio, lat: e.target.value })}
                        placeholder="18.417..."
                        className="w-full border border-jungle-200 rounded-xl px-3 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-jungle-500 block mb-1">Longitud</label>
                      <input
                        value={nuevoServicio.lng}
                        onChange={(e) => setNuevoServicio({ ...nuevoServicio, lng: e.target.value })}
                        placeholder="-95.110..."
                        className="w-full border border-jungle-200 rounded-xl px-3 py-1.5 text-xs"
                      />
                    </div>
                  </div>

                  {nuevoServicio.lat && nuevoServicio.lng && (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${nuevoServicio.lat}&mlon=${nuevoServicio.lng}#map=17/${nuevoServicio.lat}/${nuevoServicio.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-jungle-600 hover:text-jungle-800 underline"
                    >
                      <ExternalLink size={12} /> Ver este punto en el mapa para confirmar
                    </a>
                  )}
                </div>

                {/* Fotos */}
                <div className="border-t border-jungle-100 pt-3">
                  <label className="text-xs font-semibold text-jungle-700 block mb-1.5">
                    Fotos (mejor calidad posible, hasta 6)
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {fotosServicio.map((url) => (
                      <div key={url} className="relative w-16 h-16">
                        <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-jungle-200" />
                        <button
                          type="button"
                          onClick={() => quitarFoto(url)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                          aria-label="Quitar foto"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {fotosServicio.length < 6 && (
                      <label className="w-16 h-16 border-2 border-dashed border-jungle-300 rounded-lg flex items-center justify-center cursor-pointer hover:bg-jungle-50">
                        {subiendoFoto ? (
                          <Loader2 size={18} className="animate-spin text-jungle-400" />
                        ) : (
                          <ImagePlus size={18} className="text-jungle-400" />
                        )}
                        <input type="file" accept="image/*" onChange={agregarFoto} disabled={subiendoFoto} className="hidden" />
                      </label>
                    )}
                  </div>
                  <p className="text-[11px] text-jungle-400">
                    Se suben directo a Cloudinary y quedan disponibles offline automáticamente.
                  </p>
                </div>

                {mensajeServicio && <p className="text-xs font-medium">{mensajeServicio}</p>}

                <button
                  onClick={guardarServicio}
                  disabled={guardandoServicio}
                  className="w-full bg-jungle-700 hover:bg-jungle-800 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60 text-sm"
                >
                  {guardandoServicio ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  Registrar servicio (visible de inmediato)
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SECCIÓN COMUNIDAD — moderación de publicaciones reportadas
// ============================================================
// Solo trae publicaciones con reportes>0 u ocultas (?admin=1 filtra
// del lado del servidor) — no toda la comunidad, para no duplicar
// lo que ya se ve en /comunidad. Restaurar limpia el contador de
// reportes; eliminar borra la publicación por completo.
interface PublicacionAdmin {
  id: number;
  texto: string | null;
  imagen_url: string | null;
  video_url: string | null;
  creado_en: string;
  reportes: number;
  oculto: boolean;
  autor_nombre: string;
}

function SeccionComunidad() {
  const [publicaciones, setPublicaciones] = useState<PublicacionAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState<number | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      const res = await fetch('/api/comunidad/publicaciones?admin=1', {
        headers: { 'X-Admin-Password': ADMIN_PWD },
      });
      const data = await res.json();
      if (data.ok) {
        const reportadas = (data.publicaciones as PublicacionAdmin[]).filter(
          (p) => p.reportes > 0 || p.oculto
        );
        setPublicaciones(reportadas);
      }
    } catch { /* sin conexión */ }
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  async function restaurar(id: number) {
    setProcesando(id);
    try {
      await fetch('/api/comunidad/publicaciones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PWD },
        body: JSON.stringify({ id }),
      });
      await cargar();
    } catch { /* sin conexión */ }
    setProcesando(null);
  }

  async function eliminar(id: number) {
    if (!confirm('¿Eliminar esta publicación por completo? No se puede deshacer.')) return;
    setProcesando(id);
    try {
      await fetch('/api/comunidad/publicaciones', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PWD },
        body: JSON.stringify({ id }),
      });
      setPublicaciones((prev) => prev.filter((p) => p.id !== id));
    } catch { /* sin conexión */ }
    setProcesando(null);
  }

  if (cargando) {
    return (
      <div className="bg-white rounded-2xl border border-jungle-100 p-10 text-center text-jungle-400">
        <Loader2 size={26} className="animate-spin mx-auto mb-2" />
        <p className="text-sm">Cargando publicaciones reportadas…</p>
      </div>
    );
  }

  if (publicaciones.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-jungle-100 p-10 text-center text-jungle-400">
        <Flag size={28} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">No hay publicaciones reportadas por ahora.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {publicaciones.map((p) => (
        <div key={p.id} className="bg-white rounded-2xl border border-jungle-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-jungle-900">{p.autor_nombre}</p>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${p.oculto ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
              {p.reportes} reporte{p.reportes === 1 ? '' : 's'} {p.oculto && '· oculta'}
            </span>
          </div>
          {p.texto && <p className="text-sm text-jungle-700 mb-2 whitespace-pre-wrap">{p.texto}</p>}
          {p.imagen_url && <img src={p.imagen_url} alt="" className="max-h-56 rounded-xl object-cover mb-3" />}
          {p.video_url && <video src={p.video_url} controls className="max-h-56 rounded-xl mb-3" />}
          <div className="flex gap-2">
            <button
              onClick={() => restaurar(p.id)}
              disabled={procesando === p.id}
              className="flex-1 flex items-center justify-center gap-1.5 bg-jungle-50 hover:bg-jungle-100 text-jungle-700 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
            >
              <RotateCcw size={13} /> Restaurar
            </button>
            <button
              onClick={() => eliminar(p.id)}
              disabled={procesando === p.id}
              className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
            >
              <Trash2 size={13} /> Eliminar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}