import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, CheckCircle2, XCircle, Clock,
  Store, Phone, MapPin, Search, Copy, RefreshCw,
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
import { recargarCatalogo } from '../App';

// ============================================================
// PANEL DEL PRESTADOR — v2 (fix QA 23/05)
// Tres modos:
//  1. inicio      → botones según si hay sesión activa
//  2. registrar   → formulario con validación → Neon primero
//  3. consultar   → buscar por código (IndexedDB + Neon)

// ============================================================

type Vista = 'inicio' | 'consultar';

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

      {/* La gestión del servicio está en Mi Perfil → tab "Mi Servicio" */}
      {esPrestador && (
        <div className="w-full bg-jungle-50 border-2 border-jungle-200 text-jungle-700 p-4 rounded-2xl flex items-start gap-3">
          <span className="text-xl flex-shrink-0">📋</span>
          <div>
            <p className="font-semibold text-sm mb-0.5">Gestiona tu servicio desde Mi Perfil</p>
            <p className="text-xs text-jungle-500">Edita tu información, horarios, fotos y previsualiza tu tarjeta desde la sección <strong>Mi Perfil</strong> en la app.</p>
          </div>
        </div>
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