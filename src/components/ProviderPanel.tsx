import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Store,
  Phone,
  MapPin,
  Search,
  Copy,
  ShieldCheck,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  registrarServicio,
  buscarPorCodigo,
  cambiarEstadoServicio,
  type ServicioPrestador,
  type EstadoServicio,
} from '../lib/db';
import { CATEGORIAS, LOS_TUXTLAS_CENTER } from '../data/lugares';
import OfflineIndicator from './OfflineIndicator';

// ============================================================
// PANEL DEL PRESTADOR — VERSIÓN COMPLETA
// ============================================================
// Tres modos:
//  1. Registrar servicio (con validaciones reales)
//  2. Consultar estado por código de seguimiento
//  3. Vista de administrador (aprobar / rechazar)
// ============================================================

type Vista = 'inicio' | 'registrar' | 'consultar';

export default function ProviderPanel() {
  const [vista, setVista] = useState<Vista>('inicio');

  return (
    <div className="min-h-screen bg-jungle-50">
      <OfflineIndicator />

      <header className="bg-gradient-to-br from-jungle-800 to-jungle-950 text-white px-4 py-5">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <Link
              to="/"
              className="flex items-center gap-1 text-jungle-200 hover:text-white text-sm"
            >
              <ArrowLeft size={16} /> Inicio
            </Link>
            <div className="text-xs bg-amber-500 text-white px-2 py-1 rounded font-bold uppercase tracking-wide">
              Prestadores
            </div>
          </div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl">
            Tu negocio en TuxtlasGO
          </h1>
          <p className="text-sm text-jungle-100 opacity-90 mt-1">
            Da a conocer tu servicio turístico a todos los visitantes de Los
            Tuxtlas. Sin intermediarios.
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 pb-12">
        {vista === 'inicio' && <PantallaInicio onElegir={setVista} />}
        {vista === 'registrar' && (
          <RegistrarServicio onVolver={() => setVista('inicio')} />
        )}
        {vista === 'consultar' && (
          <ConsultarEstado onVolver={() => setVista('inicio')} />
        )}
      </main>
    </div>
  );
}

// ─────────────── PANTALLA DE INICIO ───────────────
function PantallaInicio({ onElegir }: { onElegir: (v: Vista) => void }) {
  const stats = useLiveQuery(async () => {
    const todos = await db.prestadores.toArray();
    return {
      total: todos.length,
      aprobados: todos.filter((s) => s.estado === 'aprobado').length,
      pendientes: todos.filter((s) => s.estado === 'pendiente').length,
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Servicios" value={stats?.total ?? 0} color="text-jungle-700" />
        <Stat
          label="Aprobados"
          value={stats?.aprobados ?? 0}
          color="text-green-600"
        />
        <Stat
          label="Pendientes"
          value={stats?.pendientes ?? 0}
          color="text-amber-600"
        />
      </div>

      <button
        onClick={() => onElegir('registrar')}
        className="w-full bg-jungle-700 hover:bg-jungle-800 text-white p-5 rounded-2xl text-left shadow-lg shadow-jungle-700/20 flex items-center gap-4"
      >
        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
          <Plus size={24} />
        </div>
        <div>
          <div className="font-display font-bold text-lg">
            Registrar mi servicio
          </div>
          <div className="text-sm text-jungle-100 opacity-90">
            Agrega tu negocio: hospedaje, comida, tours, transporte...
          </div>
        </div>
      </button>

      <button
        onClick={() => onElegir('consultar')}
        className="w-full bg-white hover:bg-jungle-50 border-2 border-jungle-200 text-jungle-900 p-5 rounded-2xl text-left flex items-center gap-4"
      >
        <div className="w-12 h-12 rounded-xl bg-jungle-100 flex items-center justify-center flex-shrink-0">
          <Search size={24} className="text-jungle-700" />
        </div>
        <div>
          <div className="font-display font-bold text-lg">
            Consultar estado de mi servicio
          </div>
          <div className="text-sm text-jungle-600">
            ¿Ya registraste tu negocio? Revisa si fue aprobado con tu código.
          </div>
        </div>
      </button>


    </div>
  );
}

// ─────────────── REGISTRAR SERVICIO (CON VALIDACIONES) ───────────────
interface ErroresFormulario {
  nombreNegocio?: string;
  descripcion?: string;
  precio?: string;
  contacto?: string;
}

function RegistrarServicio({ onVolver }: { onVolver: () => void }) {
  const [datos, setDatos] = useState({
    nombreNegocio: '',
    categoria: 'Gastronomia',
    municipio: 'Catemaco',
    descripcion: '',
    precio: '',
    contacto: '',
    ubicacionLat: LOS_TUXTLAS_CENTER[0],
    ubicacionLng: LOS_TUXTLAS_CENTER[1],
  });
  const [errores, setErrores] = useState<ErroresFormulario>({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ codigo: string } | null>(null);

  // Validación real de cada campo
  function validar(): boolean {
    const nuevosErrores: ErroresFormulario = {};

    const nombre = datos.nombreNegocio.trim();
    if (nombre.length < 3) {
      nuevosErrores.nombreNegocio =
        'El nombre debe tener al menos 3 caracteres.';
    } else if (nombre.length > 60) {
      nuevosErrores.nombreNegocio = 'El nombre es demasiado largo (máx. 60).';
    }

    const desc = datos.descripcion.trim();
    if (desc.length < 20) {
      nuevosErrores.descripcion =
        'Describe tu servicio con al menos 20 caracteres.';
    } else if (desc.length > 400) {
      nuevosErrores.descripcion = 'La descripción es muy larga (máx. 400).';
    }

    const precio = datos.precio.trim();
    if (precio.length < 2) {
      nuevosErrores.precio = 'Indica un precio o rango aproximado.';
    }

    const contacto = datos.contacto.trim();
    // Acepta teléfono (al menos 7 dígitos) o correo (tiene @ y punto)
    const esTelefono = (contacto.match(/\d/g) || []).length >= 7;
    const esCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto);
    if (!esTelefono && !esCorreo) {
      nuevosErrores.contacto =
        'Pon un teléfono válido (mín. 7 dígitos) o un correo.';
    }

    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  }

  async function handleSubmit() {
    if (!validar()) {
      return;
    }
    setEnviando(true);
    try {
      const { codigo } = await registrarServicio({
        nombreNegocio: datos.nombreNegocio.trim(),
        categoria: datos.categoria,
        municipio: datos.municipio,
        descripcion: datos.descripcion.trim(),
        precio: datos.precio.trim(),
        contacto: datos.contacto.trim(),
        ubicacionLat: datos.ubicacionLat,
        ubicacionLng: datos.ubicacionLng,
      });
      setResultado({ codigo });
    } catch (e) {
      alert('Hubo un problema al guardar. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  // Pantalla de éxito con código de seguimiento
  if (resultado) {
    return (
      <div className="bg-white rounded-2xl border-2 border-green-200 p-6 text-center animate-fade-in">
        <CheckCircle2 className="mx-auto text-green-600 mb-3" size={56} />
        <h2 className="font-display font-bold text-xl text-jungle-950 mb-1">
          ¡Servicio registrado!
        </h2>
        <p className="text-sm text-jungle-700 mb-4">
          Tu servicio quedó en revisión. El equipo de TuxtlasGO lo validará
          pronto.
        </p>
        <div className="bg-jungle-50 rounded-xl p-4 mb-4">
          <div className="text-xs text-jungle-600 uppercase tracking-wide font-semibold mb-1">
            Tu código de seguimiento
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="font-display font-extrabold text-2xl text-jungle-900 tracking-wider">
              {resultado.codigo}
            </span>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(resultado.codigo);
              }}
              className="text-jungle-500 hover:text-jungle-800"
              title="Copiar código"
            >
              <Copy size={18} />
            </button>
          </div>
          <div className="text-xs text-jungle-600 mt-2">
            Guarda este código. Con él puedes consultar si tu servicio fue
            aprobado.
          </div>
        </div>
        <button
          onClick={onVolver}
          className="w-full bg-jungle-700 hover:bg-jungle-800 text-white py-3 rounded-xl font-semibold"
        >
          Entendido
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onVolver}
        className="flex items-center gap-1 text-jungle-600 hover:text-jungle-900 text-sm mb-3"
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <div className="bg-white rounded-2xl border border-jungle-100 p-5">
        <h2 className="font-display font-bold text-lg text-jungle-950 mb-1">
          Registra tu servicio
        </h2>
        <p className="text-sm text-jungle-600 mb-4">
          Los campos con * son obligatorios. Tu servicio será revisado antes de
          aparecer en la app.
        </p>

        <div className="space-y-3">
          <Campo
            label="Nombre del negocio *"
            value={datos.nombreNegocio}
            onChange={(v) => setDatos({ ...datos, nombreNegocio: v })}
            placeholder="Ej: Lanchas Don Cheve"
            error={errores.nombreNegocio}
          />

          <div className="grid grid-cols-2 gap-3">
            <CampoSelect
              label="Categoría *"
              value={datos.categoria}
              onChange={(v) => setDatos({ ...datos, categoria: v })}
              opciones={CATEGORIAS.map((c) => c.id)}
            />
            <CampoSelect
              label="Municipio *"
              value={datos.municipio}
              onChange={(v) => setDatos({ ...datos, municipio: v })}
              opciones={['Catemaco', 'San Andrés Tuxtla', 'Santiago Tuxtla']}
            />
          </div>

          <Campo
            label="Descripción *"
            value={datos.descripcion}
            onChange={(v) => setDatos({ ...datos, descripcion: v })}
            placeholder="¿Qué ofreces? ¿Qué te hace especial? (mín. 20 caracteres)"
            textarea
            error={errores.descripcion}
            contador={`${datos.descripcion.trim().length}/400`}
          />

          <div className="grid grid-cols-2 gap-3">
            <Campo
              label="Precio aproximado *"
              value={datos.precio}
              onChange={(v) => setDatos({ ...datos, precio: v })}
              placeholder="$200 MXN por persona"
              error={errores.precio}
            />
            <Campo
              label="Contacto *"
              value={datos.contacto}
              onChange={(v) => setDatos({ ...datos, contacto: v })}
              placeholder="WhatsApp o correo"
              error={errores.contacto}
            />
          </div>

          <div className="bg-jungle-50 rounded-xl p-3 text-xs text-jungle-600">
            📍 Tu servicio se ubicará en el centro de {datos.municipio} por
            ahora. La ubicación exacta en el mapa se podrá ajustar después con
            el equipo.
          </div>

          <button
            onClick={handleSubmit}
            disabled={enviando}
            className="w-full bg-jungle-700 hover:bg-jungle-800 text-white py-3 rounded-xl font-semibold disabled:opacity-60"
          >
            {enviando ? 'Guardando...' : 'Registrar servicio'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────── CONSULTAR ESTADO POR CÓDIGO ───────────────
function ConsultarEstado({ onVolver }: { onVolver: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<
    ServicioPrestador | null | 'no-encontrado'
  >(null);

  async function buscar() {
    if (codigo.trim().length < 4) return;
    setBuscando(true);
    try {
      const servicio = await buscarPorCodigo(codigo);
      setResultado(servicio || 'no-encontrado');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div>
      <button
        onClick={onVolver}
        className="flex items-center gap-1 text-jungle-600 hover:text-jungle-900 text-sm mb-3"
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <div className="bg-white rounded-2xl border border-jungle-100 p-5">
        <h2 className="font-display font-bold text-lg text-jungle-950 mb-1">
          Consultar mi servicio
        </h2>
        <p className="text-sm text-jungle-600 mb-4">
          Escribe el código de seguimiento que recibiste al registrar tu
          servicio.
        </p>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="TGO-XXXX"
            className="flex-1 bg-jungle-50 rounded-xl px-4 py-3 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-jungle-400 border-0"
            maxLength={8}
          />
          <button
            onClick={buscar}
            disabled={buscando || codigo.trim().length < 4}
            className="bg-jungle-700 hover:bg-jungle-800 disabled:opacity-50 text-white px-5 rounded-xl font-semibold text-sm"
          >
            Buscar
          </button>
        </div>

        {resultado === 'no-encontrado' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            No encontramos ningún servicio con ese código. Revisa que esté bien
            escrito (ejemplo: TGO-A7B2).
          </div>
        )}

        {resultado && resultado !== 'no-encontrado' && (
          <div className="border border-jungle-100 rounded-xl p-4">
            <div className="font-display font-bold text-jungle-950 mb-1">
              {resultado.nombreNegocio}
            </div>
            <div className="text-xs text-jungle-600 mb-3">
              {resultado.categoria} · {resultado.municipio}
            </div>
            <BadgeEstado estado={resultado.estado} />
            {resultado.estado === 'pendiente' && (
              <p className="text-sm text-jungle-600 mt-3">
                Tu servicio está en revisión. El equipo de TuxtlasGO lo validará
                pronto. Vuelve a consultar más tarde.
              </p>
            )}
            {resultado.estado === 'aprobado' && (
              <p className="text-sm text-green-700 mt-3">
                ¡Felicidades! Tu servicio ya está visible en el mapa y en la
                sección de explorar de TuxtlasGO.
              </p>
            )}
            {resultado.estado === 'rechazado' && (
              <div className="text-sm text-red-700 mt-3">
                <p>Tu servicio no fue aprobado en esta ocasión.</p>
                {resultado.motivoRechazo && (
                  <p className="mt-1">
                    <span className="font-semibold">Motivo:</span>{' '}
                    {resultado.motivoRechazo}
                  </p>
                )}
                <p className="mt-1">
                  Puedes registrarlo de nuevo corrigiendo lo indicado.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────── PANEL DE ADMINISTRACIÓN ───────────────
function PanelAdmin({ onVolver }: { onVolver: () => void }) {
  const [filtro, setFiltro] = useState<'pendiente' | 'aprobado' | 'rechazado' | 'todos'>('pendiente');
  const [servicios, setServicios] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [pass, setPass] = useState('');
  const [autenticado, setAutenticado] = useState(false);
  const [errorAuth, setErrorAuth] = useState('');

  const ADMIN_PWD = 'tuxtlasgo2026';

  async function cargarServicios(estado: string) {
    setCargando(true);
    try {
      const res = await fetch(`/api/servicios/admin?estado=${estado === 'todos' ? 'pendiente' : estado}`, {
        headers: { 'X-Admin-Password': ADMIN_PWD }
      });
      if (res.ok) {
        const data = await res.json();
        if (estado === 'todos') {
          // Cargar todos los estados
          const [r1, r2, r3] = await Promise.all([
            fetch('/api/servicios/admin?estado=pendiente', { headers: { 'X-Admin-Password': ADMIN_PWD } }).then(r => r.json()),
            fetch('/api/servicios/admin?estado=aprobado', { headers: { 'X-Admin-Password': ADMIN_PWD } }).then(r => r.json()),
            fetch('/api/servicios/admin?estado=rechazado', { headers: { 'X-Admin-Password': ADMIN_PWD } }).then(r => r.json()),
          ]);
          setServicios([...(r1.servicios||[]), ...(r2.servicios||[]), ...(r3.servicios||[])]);
        } else {
          setServicios(data.servicios || []);
        }
      }
    } catch (err) {
      console.error(err);
    }
    setCargando(false);
  }

  async function aprobar(id: number) {
    try {
      await fetch('/api/servicios/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PWD },
        body: JSON.stringify({ servicioId: id, accion: 'aprobar' })
      });
      cargarServicios(filtro);
    } catch (err) { console.error(err); }
  }

  async function rechazar(id: number) {
    const motivo = prompt('Motivo del rechazo (lo verá el prestador):');
    if (motivo === null) return;
    try {
      await fetch('/api/servicios/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PWD },
        body: JSON.stringify({ servicioId: id, accion: 'rechazar', motivoRechazo: motivo || 'No especificado' })
      });
      cargarServicios(filtro);
    } catch (err) { console.error(err); }
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

  const serviciosFiltrados = servicios;

  return (
    <div>
      <button
        onClick={onVolver}
        className="flex items-center gap-1 text-jungle-600 hover:text-jungle-900 text-sm mb-3"
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <div className="bg-white rounded-2xl border border-jungle-100 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={20} className="text-amber-600" />
          <h2 className="font-display font-bold text-lg text-jungle-950">
            Administración de servicios
          </h2>
        </div>
        <p className="text-sm text-jungle-600">
          Revisa los servicios registrados por prestadores y decide si se
          publican en la app.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {(['pendiente', 'aprobado', 'rechazado', 'todos'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold capitalize transition-colors ${
              filtro === f
                ? 'bg-jungle-800 text-white'
                : 'bg-white text-jungle-700 border border-jungle-200'
            }`}
          >
            {f === 'todos' ? 'Todos' : f + 's'}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {serviciosFiltrados.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-jungle-600">
            <Store size={40} className="mx-auto mb-2 opacity-30" />
            <p>No hay servicios {filtro !== 'todos' ? filtro + 's' : ''}.</p>
          </div>
        ) : (
          serviciosFiltrados.map((s) => (
            <article
              key={s.id}
              className="bg-white rounded-2xl p-4 border border-jungle-100"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-display font-bold text-jungle-950">
                      {s.nombreNegocio}
                    </h3>
                    <BadgeEstado estado={s.estado} />
                  </div>
                  <div className="text-xs text-jungle-500 font-mono">
                    {s.codigoSeguimiento}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-jungle-700 mb-2">
                <span>{s.categoria}</span>
                <span className="flex items-center gap-1">
                  <MapPin size={11} /> {s.municipio}
                </span>
                <span>{s.precio}</span>
                <span className="flex items-center gap-1">
                  <Phone size={11} /> {s.contacto}
                </span>
              </div>
              <p className="text-sm text-jungle-800 mb-3">{s.descripcion}</p>

              {s.motivoRechazo && (
                <div className="text-xs text-red-700 bg-red-50 rounded-lg p-2 mb-3">
                  Motivo de rechazo: {s.motivoRechazo}
                </div>
              )}

              {/* Acciones de admin */}
              {s.estado !== 'aprobado' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => s.id && aprobar(s.id)}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1"
                  >
                    <CheckCircle2 size={15} /> Aprobar
                  </button>
                  {s.estado !== 'rechazado' && (
                    <button
                      onClick={() => s.id && rechazar(s.id)}
                      className="flex-1 bg-white border-2 border-red-200 text-red-600 hover:bg-red-50 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1"
                    >
                      <XCircle size={15} /> Rechazar
                    </button>
                  )}
                </div>
              )}
              {s.estado === 'aprobado' && (
                <button
                  onClick={() => s.id && rechazar(s.id)}
                  className="w-full bg-white border-2 border-jungle-200 text-jungle-600 hover:bg-jungle-50 py-2 rounded-lg text-sm font-semibold"
                >
                  Quitar de la app
                </button>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────── COMPONENTES AUXILIARES ───────────────
function BadgeEstado({ estado }: { estado: EstadoServicio }) {
  if (estado === 'aprobado') {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-semibold">
        <CheckCircle2 size={12} /> Aprobado
      </span>
    );
  }
  if (estado === 'rechazado') {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-semibold">
        <XCircle size={12} /> Rechazado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold">
      <Clock size={12} /> Pendiente
    </span>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-3 text-center shadow-sm border border-jungle-100">
      <div className={`font-display font-extrabold text-2xl ${color}`}>
        {value}
      </div>
      <div className="text-[11px] text-jungle-600 uppercase tracking-wide font-semibold">
        {label}
      </div>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  placeholder,
  textarea,
  error,
  contador,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  error?: string;
  contador?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-semibold text-jungle-700 uppercase tracking-wide mb-1">
        <span>{label}</span>
        {contador && (
          <span className="text-jungle-400 font-normal normal-case">
            {contador}
          </span>
        )}
      </span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 border-0 resize-none ${
            error ? 'ring-2 ring-red-300' : 'focus:ring-jungle-400'
          }`}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 border-0 ${
            error ? 'ring-2 ring-red-300' : 'focus:ring-jungle-400'
          }`}
        />
      )}
      {error && <span className="text-xs text-red-600 mt-1 block">{error}</span>}
    </label>
  );
}

function CampoSelect({
  label,
  value,
  onChange,
  opciones,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opciones: string[];
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-jungle-700 uppercase tracking-wide mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 border-0"
      >
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}