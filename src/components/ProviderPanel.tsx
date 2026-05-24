import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, CheckCircle2, XCircle, Clock,
  Store, Phone, MapPin, Search, Copy, Edit3, RefreshCw,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db, registrarServicio, buscarPorCodigo,
  type ServicioPrestador, type EstadoServicio,
} from '../lib/db';
import { CATEGORIAS, LOS_TUXTLAS_CENTER } from '../data/lugares';
import { getToken, getUsuarioLocal } from '../lib/auth';
import OfflineIndicator from './OfflineIndicator';
import GestorFotos from './GestorFotos';

// ============================================================
// PANEL DEL PRESTADOR — v2 (fix QA 23/05)
// Tres modos:
//  1. inicio      → botones según si hay sesión activa
//  2. registrar   → formulario con validación → Neon primero
//  3. consultar   → buscar por código (IndexedDB + Neon)
//  4. mi-servicio → vista del prestador logueado (sin código)
// ============================================================

type Vista = 'inicio' | 'consultar' | 'mi-servicio';

export default function ProviderPanel() {
  const [vista, setVista] = useState<Vista>('inicio');
  const usuario = getUsuarioLocal();
  const esPrestador = usuario?.tipo === 'prestador';

  return (
    <div className="min-h-screen bg-jungle-50">
      <OfflineIndicator />
      <header className="bg-gradient-to-br from-jungle-800 to-jungle-950 text-white px-4 py-5">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <Link to="/" className="flex items-center gap-1 text-jungle-200 hover:text-white text-sm">
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
            Da a conocer tu servicio turístico a todos los visitantes de Los Tuxtlas. Sin intermediarios.
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 pb-12">
        {vista === 'inicio'       && <PantallaInicio onElegir={setVista} esPrestador={esPrestador} />}
        {vista === 'consultar'    && <ConsultarEstado onVolver={() => setVista('inicio')} />}
        {vista === 'mi-servicio'  && <MiServicio onVolver={() => setVista('inicio')} />}
      </main>
    </div>
  );
}

// ─────────────── PANTALLA DE INICIO ───────────────
function PantallaInicio({
  onElegir, esPrestador,
}: { onElegir: (v: Vista) => void; esPrestador: boolean }) {
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
        <Stat label="Servicios"  value={stats?.total    ?? 0} color="text-jungle-700" />
        <Stat label="Aprobados"  value={stats?.aprobados ?? 0} color="text-green-600" />
        <Stat label="Pendientes" value={stats?.pendientes ?? 0} color="text-amber-600" />
      </div>

      {/* Si ya es prestador logueado → mostrar "Mi servicio" primero */}
      {esPrestador && (
        <button
          onClick={() => onElegir('mi-servicio')}
          className="w-full bg-jungle-700 hover:bg-jungle-800 text-white p-5 rounded-2xl text-left shadow-lg shadow-jungle-700/20 flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Edit3 size={24} />
          </div>
          <div>
            <div className="font-display font-bold text-lg">Mi servicio</div>
            <div className="text-sm text-jungle-100 opacity-90">
              Ver estado y gestionar tu servicio registrado
            </div>
          </div>
        </button>
      )}

      {/* Registro solo desde la app — no desde aquí */}
      {!esPrestador && (
        <div className="w-full bg-jungle-50 border-2 border-dashed border-jungle-200 text-jungle-700 p-5 rounded-2xl text-center">
          <p className="font-semibold text-sm mb-1">¿Quieres registrar tu servicio?</p>
          <p className="text-xs text-jungle-500">Crea tu cuenta desde la app marcando <strong>"¿Eres proveedor?"</strong> y llena tu información.</p>
        </div>
      )}

      <button
        onClick={() => onElegir('consultar')}
        className="w-full bg-white hover:bg-jungle-50 border-2 border-jungle-200 text-jungle-900 p-5 rounded-2xl text-left flex items-center gap-4"
      >
        <div className="w-12 h-12 rounded-xl bg-jungle-100 flex items-center justify-center flex-shrink-0">
          <Search size={24} className="text-jungle-700" />
        </div>
        <div>
          <div className="font-display font-bold text-lg">Consultar estado de mi servicio</div>
          <div className="text-sm text-jungle-600">
            ¿Ya registraste tu negocio? Revisa si fue aprobado con tu código.
          </div>
        </div>
      </button>
    </div>
  );
}

// ─────────────── MI SERVICIO (prestador logueado) ───────────────
function MiServicio({ onVolver }: { onVolver: () => void }) {
  const [servicio, setServicio] = useState<any>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  async function cargar() {
    setCargando(true);
    setError('');
    const token = getToken();
    if (!token) {
      setError('No hay sesión activa. Inicia sesión para ver tu servicio.');
      setCargando(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/perfil', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setError('Sesión expirada. Vuelve a iniciar sesión.');
        setCargando(false);
        return;
      }
      const data = await res.json();
      if (data.ok && data.servicio) {
        // Normalizar estado por si viene con espacios o distinto case
        const srv = { ...data.servicio, estado: (data.servicio.estado ?? '').trim().toLowerCase() };
        setServicio(srv);
        setFotos(data.servicio?.fotos ?? []);
      } else {
        // No tiene servicio en Neon todavía
        setServicio(null);
      }
    } catch {
      setError('Sin conexión. Verifica tu internet.');
    }
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  const colores: Record<string, string> = {
    pendiente: 'bg-amber-100 text-amber-800',
    aprobado: 'bg-green-100 text-green-800',
    rechazado: 'bg-red-100 text-red-700',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onVolver} className="flex items-center gap-1 text-jungle-600 hover:text-jungle-900 text-sm">
          <ArrowLeft size={16} /> Volver
        </button>
        <button onClick={cargar} className="flex items-center gap-1 text-jungle-500 hover:text-jungle-800 text-xs">
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {cargando && (
        <div className="bg-white rounded-2xl p-8 text-center text-jungle-500">
          <div className="w-8 h-8 border-2 border-jungle-300 border-t-jungle-700 rounded-full animate-spin mx-auto mb-3" />
          Cargando tu servicio...
        </div>
      )}

      {!cargando && error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-700">
          {error}
        </div>
      )}

      {!cargando && !error && !servicio && (
        <div className="bg-white rounded-2xl border border-jungle-100 p-8 text-center">
          <Store size={40} className="mx-auto text-jungle-200 mb-3" />
          <p className="text-jungle-600 font-medium mb-1">Aún no tienes un servicio registrado</p>
          <p className="text-sm text-jungle-400 mb-4">
            Cuando tu cuenta fue creada como prestador, puedes agregar tu negocio aquí.
          </p>
          <button
            onClick={onVolver}
            className="bg-jungle-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold"
          >
            Registrar servicio ahora
          </button>
        </div>
      )}

      {!cargando && !error && servicio && (
        <div className="space-y-4">
          {/* Tarjeta principal */}
          <div className="bg-white rounded-2xl border border-jungle-100 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="font-display font-bold text-xl text-jungle-950 mb-1">
                  {servicio.nombre}
                </h2>
                <p className="text-xs text-jungle-500 font-mono">{servicio.codigo_seguimiento}</p>
              </div>
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0 ${colores[servicio.estado] || 'bg-gray-100 text-gray-600'}`}>
                {servicio.estado === 'pendiente' ? '⏳ En revisión' : servicio.estado === 'aprobado' ? '✅ Aprobado' : '❌ Rechazado'}
              </span>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-jungle-600 mb-3">
              <span className="flex items-center gap-1"><Store size={11} />{servicio.categoria}</span>
              <span className="flex items-center gap-1"><MapPin size={11} />{servicio.municipio}</span>
              {servicio.precio && <span>{servicio.precio}</span>}
              {servicio.contacto && (
                <span className="flex items-center gap-1"><Phone size={11} />{servicio.contacto}</span>
              )}
            </div>

            {servicio.descripcion && (
              <p className="text-sm text-jungle-700 bg-jungle-50 rounded-xl px-3 py-2.5">
                {servicio.descripcion}
              </p>
            )}

            {servicio.estado === 'rechazado' && servicio.motivo_rechazo && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
                <strong>Motivo de rechazo:</strong> {servicio.motivo_rechazo}
                <p className="mt-1">Puedes registrar un nuevo servicio corrigiendo esto.</p>
              </div>
            )}

            {servicio.estado === 'pendiente' && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                Tu servicio está en revisión. El equipo de TuxtlasGO lo validará pronto.
              </div>
            )}

            {servicio.estado === 'aprobado' && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800">
                ✅ Tu servicio ya es visible en el mapa y la IA lo recomienda a los turistas.
              </div>
            )}

            {/* Subir fotos solo cuando está aprobado */}
            {servicio.estado === 'aprobado' && (
              <div className="mt-4 pt-4 border-t border-jungle-100">
                <GestorFotos
                  codigoSeguimiento={servicio.codigo_seguimiento}
                  fotosIniciales={fotos}
                  onFotosActualizadas={(nuevasFotos) => setFotos(nuevasFotos)}
                />
              </div>
            )}

            {/* Mensaje si pendiente: no puede subir fotos todavía */}
            {servicio.estado === 'pendiente' && (
              <div className="mt-4 pt-4 border-t border-jungle-100">
                <div className="flex items-center gap-2 text-jungle-500 text-xs bg-jungle-50 rounded-xl p-3">
                  <span>📸</span>
                  <span>Podrás subir fotos una vez que tu servicio sea aprobado.</span>
                </div>
              </div>
            )}
          </div>

          {/* Código de seguimiento */}
          <div className="bg-jungle-50 rounded-2xl p-4 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-xs text-jungle-500 uppercase tracking-wide font-semibold mb-1">
                Código de seguimiento
              </p>
              <p className="font-display font-extrabold text-xl text-jungle-900 tracking-wider">
                {servicio.codigo_seguimiento}
              </p>
            </div>
            <button
              onClick={() => navigator.clipboard?.writeText(servicio.codigo_seguimiento)}
              className="text-jungle-500 hover:text-jungle-800 p-2"
              title="Copiar código"
            >
              <Copy size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────── REGISTRAR SERVICIO ───────────────
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
  const [resultado, setResultado] = useState<{ codigo: string; enNeon: boolean } | null>(null);

  function validar(): boolean {
    const nuevosErrores: ErroresFormulario = {};
    const nombre = datos.nombreNegocio.trim();
    if (nombre.length < 3) nuevosErrores.nombreNegocio = 'El nombre debe tener al menos 3 caracteres.';
    else if (nombre.length > 60) nuevosErrores.nombreNegocio = 'El nombre es demasiado largo (máx. 60).';
    const desc = datos.descripcion.trim();
    if (desc.length < 20) nuevosErrores.descripcion = 'Describe tu servicio con al menos 20 caracteres.';
    else if (desc.length > 400) nuevosErrores.descripcion = 'La descripción es muy larga (máx. 400).';
    const precio = datos.precio.trim();
    if (precio.length < 2) nuevosErrores.precio = 'Indica un precio o rango aproximado.';
    const contacto = datos.contacto.trim();
    const esTelefono = (contacto.match(/\d/g) || []).length >= 7;
    const esCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto);
    if (!esTelefono && !esCorreo) nuevosErrores.contacto = 'Pon un teléfono válido (mín. 7 dígitos) o un correo.';
    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  }

  async function handleSubmit() {
    if (!validar()) return;
    setEnviando(true);

    const token = getToken();
    const usuario = getUsuarioLocal();
    const esPrestador = usuario?.tipo === 'prestador';

    try {
      // ── Intento 1: Neon (si hay token de prestador) ──
      if (esPrestador && token) {
        try {
          const res = await fetch('/api/servicios/registro', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              nombre: datos.nombreNegocio.trim(),
              categoria: datos.categoria,
              municipio: datos.municipio,
              descripcion: datos.descripcion.trim(),
              precio: datos.precio.trim() || 'A consultar',
              contacto: datos.contacto.trim(),
              lat: datos.ubicacionLat,
              lng: datos.ubicacionLng,
            }),
          });
          const data = await res.json();
          if (data.ok && data.servicio?.codigo_seguimiento) {
            // Éxito en Neon → guardar también local como respaldo
            await registrarServicio({
              nombreNegocio: datos.nombreNegocio.trim(),
              categoria: datos.categoria,
              municipio: datos.municipio,
              descripcion: datos.descripcion.trim(),
              precio: datos.precio.trim() || 'A consultar',
              contacto: datos.contacto.trim(),
              ubicacionLat: datos.ubicacionLat,
              ubicacionLng: datos.ubicacionLng,
            }).catch(() => {});
            setResultado({ codigo: data.servicio.codigo_seguimiento, enNeon: true });
            return;
          }
          // 409: ya tiene un servicio activo en Neon (registrado al crear la cuenta)
          if (res.status === 409) {
            // Obtener el servicio existente y mostrarlo
            const perfil = await fetch('/api/auth/perfil', { headers: { Authorization: `Bearer ${token}` } });
            const perfilData = await perfil.json();
            if (perfilData.ok && perfilData.servicio?.codigo_seguimiento) {
              setResultado({ codigo: perfilData.servicio.codigo_seguimiento, enNeon: true });
              return;
            }
          }
          // Neon devolvió otro error → caer a local
          console.warn('[TuxtlasGO] Neon respondió:', data.error);
        } catch (netErr) {
          console.warn('[TuxtlasGO] Error de red en Neon:', netErr);
        }
      }

      // ── Fallback: solo IndexedDB (sin internet o sin sesión prestador) ──
      const { codigo } = await registrarServicio({
        nombreNegocio: datos.nombreNegocio.trim(),
        categoria: datos.categoria,
        municipio: datos.municipio,
        descripcion: datos.descripcion.trim(),
        precio: datos.precio.trim() || 'A consultar',
        contacto: datos.contacto.trim(),
        ubicacionLat: datos.ubicacionLat,
        ubicacionLng: datos.ubicacionLng,
      });
      setResultado({ codigo, enNeon: false });
    } catch (e) {
      console.error('[handleSubmit]', e);
      alert('Hubo un problema al guardar. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    return (
      <div className="bg-white rounded-2xl border-2 border-green-200 p-6 text-center">
        <CheckCircle2 className="mx-auto text-green-600 mb-3" size={56} />
        <h2 className="font-display font-bold text-xl text-jungle-950 mb-1">¡Servicio registrado!</h2>
        <p className="text-sm text-jungle-700 mb-4">
          {resultado.enNeon
            ? 'Tu servicio fue enviado al equipo. En breve verás el estado en tu perfil.'
            : 'Tu servicio quedó guardado localmente. Cuando tengas internet se sincronizará.'}
        </p>
        <div className="bg-jungle-50 rounded-xl p-4 mb-4">
          <div className="text-xs text-jungle-600 uppercase tracking-wide font-semibold mb-1">Tu código de seguimiento</div>
          <div className="flex items-center justify-center gap-2">
            <span className="font-display font-extrabold text-2xl text-jungle-900 tracking-wider">{resultado.codigo}</span>
            <button onClick={() => navigator.clipboard?.writeText(resultado.codigo)} className="text-jungle-500 hover:text-jungle-800" title="Copiar"><Copy size={18} /></button>
          </div>
          <div className="text-xs text-jungle-600 mt-2">Guarda este código para consultar el estado de tu solicitud.</div>
        </div>
        <button onClick={onVolver} className="w-full bg-jungle-700 hover:bg-jungle-800 text-white py-3 rounded-xl font-semibold">
          Entendido
        </button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={onVolver} className="flex items-center gap-1 text-jungle-600 hover:text-jungle-900 text-sm mb-3">
        <ArrowLeft size={16} /> Volver
      </button>
      <div className="bg-white rounded-2xl border border-jungle-100 p-5">
        <h2 className="font-display font-bold text-lg text-jungle-950 mb-1">Registra tu servicio</h2>
        <p className="text-sm text-jungle-600 mb-4">Los campos con * son obligatorios. Tu servicio será revisado antes de aparecer en la app.</p>
        <div className="space-y-3">
          <Campo label="Nombre del negocio *" value={datos.nombreNegocio} onChange={(v) => setDatos({ ...datos, nombreNegocio: v })} placeholder="Ej: Lanchas Don Cheve" error={errores.nombreNegocio} />
          <div className="grid grid-cols-2 gap-3">
            <CampoSelect label="Categoría *" value={datos.categoria} onChange={(v) => setDatos({ ...datos, categoria: v })} opciones={CATEGORIAS.map((c) => c.id)} />
            <CampoSelect label="Municipio *" value={datos.municipio} onChange={(v) => setDatos({ ...datos, municipio: v })} opciones={['Catemaco', 'San Andrés Tuxtla', 'Santiago Tuxtla']} />
          </div>
          <Campo label="Descripción *" value={datos.descripcion} onChange={(v) => setDatos({ ...datos, descripcion: v })} placeholder="¿Qué ofreces? ¿Qué te hace especial? (mín. 20 caracteres)" textarea error={errores.descripcion} contador={`${datos.descripcion.trim().length}/400`} />
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Precio aproximado *" value={datos.precio} onChange={(v) => setDatos({ ...datos, precio: v })} placeholder="$200 MXN por persona" error={errores.precio} />
            <Campo label="Contacto *" value={datos.contacto} onChange={(v) => setDatos({ ...datos, contacto: v })} placeholder="WhatsApp o correo" error={errores.contacto} />
          </div>
          <div className="bg-jungle-50 rounded-xl p-3 text-xs text-jungle-600">
            📍 Tu servicio se ubicará en el centro de {datos.municipio} por ahora. La ubicación exacta se podrá ajustar después con el equipo.
          </div>
          <button onClick={handleSubmit} disabled={enviando} className="w-full bg-jungle-700 hover:bg-jungle-800 text-white py-3 rounded-xl font-semibold disabled:opacity-60">
            {enviando ? 'Guardando...' : 'Registrar servicio'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────── CONSULTAR ESTADO (IndexedDB + Neon) ───────────────
function ConsultarEstado({ onVolver }: { onVolver: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<any | null | 'no-encontrado'>(null);

  async function buscar() {
    if (codigo.trim().length < 4) return;
    setBuscando(true);
    try {
      // 1. Buscar en IndexedDB local
      const local = await buscarPorCodigo(codigo.trim().toUpperCase());
      if (local) { setResultado(local); return; }

      // 2. Si no está local, buscar en Neon
      try {
        const res = await fetch(`/api/servicios/registro?codigo=${encodeURIComponent(codigo.trim().toUpperCase())}`);
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
    pendiente: 'bg-amber-100 text-amber-800',
    aprobado: 'bg-green-100 text-green-800',
    rechazado: 'bg-red-100 text-red-700',
  };

  return (
    <div>
      <button onClick={onVolver} className="flex items-center gap-1 text-jungle-600 hover:text-jungle-900 text-sm mb-3">
        <ArrowLeft size={16} /> Volver
      </button>
      <div className="bg-white rounded-2xl border border-jungle-100 p-5">
        <h2 className="font-display font-bold text-lg text-jungle-950 mb-1">Consultar mi servicio</h2>
        <p className="text-sm text-jungle-600 mb-4">Escribe el código de seguimiento que recibiste al registrar tu servicio.</p>
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
          <button onClick={buscar} disabled={buscando || codigo.trim().length < 4}
            className="bg-jungle-700 hover:bg-jungle-800 disabled:opacity-50 text-white px-5 rounded-xl font-semibold text-sm">
            Buscar
          </button>
        </div>

        {resultado === 'no-encontrado' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            No encontramos ningún servicio con ese código. Revisa que esté bien escrito (ejemplo: TGO-A7B2).
          </div>
        )}

        {resultado && resultado !== 'no-encontrado' && (
          <div className="border border-jungle-100 rounded-xl p-4">
            <div className="font-display font-bold text-jungle-950 mb-1">{resultado.nombreNegocio}</div>
            <div className="text-xs text-jungle-600 mb-3">{resultado.categoria} · {resultado.municipio}</div>
            <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${colores[resultado.estado] || 'bg-gray-100'}`}>
              {resultado.estado === 'pendiente' ? '⏳ Pendiente' : resultado.estado === 'aprobado' ? '✅ Aprobado' : '❌ Rechazado'}
            </span>
            {resultado.estado === 'pendiente' && <p className="text-sm text-jungle-600 mt-3">Tu servicio está en revisión. El equipo de TuxtlasGO lo validará pronto.</p>}
            {resultado.estado === 'aprobado' && <p className="text-sm text-green-700 mt-3">¡Felicidades! Tu servicio ya está visible en el mapa y en Explorar.</p>}
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

// ─────────────── COMPONENTES AUXILIARES ───────────────
function BadgeEstado({ estado }: { estado: EstadoServicio }) {
  if (estado === 'aprobado') return <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-semibold"><CheckCircle2 size={12} /> Aprobado</span>;
  if (estado === 'rechazado') return <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-semibold"><XCircle size={12} /> Rechazado</span>;
  return <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold"><Clock size={12} /> Pendiente</span>;
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-3 text-center shadow-sm border border-jungle-100">
      <div className={`font-display font-extrabold text-2xl ${color}`}>{value}</div>
      <div className="text-[11px] text-jungle-600 uppercase tracking-wide font-semibold">{label}</div>
    </div>
  );
}

function Campo({ label, value, onChange, placeholder, textarea, error, contador }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; textarea?: boolean; error?: string; contador?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-semibold text-jungle-700 uppercase tracking-wide mb-1">
        <span>{label}</span>
        {contador && <span className="text-jungle-400 font-normal normal-case">{contador}</span>}
      </span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3}
          className={`w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 border-0 resize-none ${error ? 'ring-2 ring-red-300' : 'focus:ring-jungle-400'}`} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className={`w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 border-0 ${error ? 'ring-2 ring-red-300' : 'focus:ring-jungle-400'}`} />
      )}
      {error && <span className="text-xs text-red-600 mt-1 block">{error}</span>}
    </label>
  );
}

function CampoSelect({ label, value, onChange, opciones }: {
  label: string; value: string; onChange: (v: string) => void; opciones: string[];
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-jungle-700 uppercase tracking-wide mb-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 border-0">
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}