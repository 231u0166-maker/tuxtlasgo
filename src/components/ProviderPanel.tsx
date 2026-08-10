import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, Sparkles } from 'lucide-react';
import { buscarPorCodigo } from '../lib/db';
import { getUsuarioLocal } from '../lib/auth';
import OfflineIndicator from './OfflineIndicator';

// ============================================================
// PANEL DEL PRESTADOR — v3 (simplificado, ver MEJORAS DISEÑO
// PANEL PRESTADOR)
// ============================================================
// Hallazgo real de campo: esta página mostraba estadísticas
// internas (Servicios / Aprobados / Pendientes) a CUALQUIER
// visitante — dato que solo le sirve al equipo, no al público.
// Ahora /prestador tiene un solo trabajo: mostrar el mensaje de
// "regístrate" y dejar consultar el estado de un registro ya
// hecho. El registro en sí vive dentro de la app (AuthModal).
//
// Dos modos:
//  1. inicio     → mensaje + botón de consultar estado
//  2. consultar  → buscar por código (IndexedDB + Neon)
// ============================================================

type Vista = 'inicio' | 'consultar';

export default function ProviderPanel() {
  const [vista, setVista] = useState<Vista>('inicio');
  const usuario = getUsuarioLocal();
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
        {vista === 'inicio' && <PantallaInicio onElegir={setVista} esPrestador={esPrestador} />}
        {vista === 'consultar' && <ConsultarEstado onVolver={() => setVista('inicio')} />}
      </main>
    </div>
  );
}

// ─────────────── PANTALLA DE INICIO ───────────────
function PantallaInicio({
  onElegir,
  esPrestador,
}: {
  onElegir: (v: Vista) => void;
  esPrestador: boolean;
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
      ) : (
        <div className="bg-white border border-obsidiana-900/8 rounded-2xl p-6 text-center">
          <p className="font-display font-bold text-obsidiana-900 mb-1.5">
            ¿Quieres registrar tu servicio?
          </p>
          <p className="text-sm text-obsidiana-800/60 mb-5 leading-relaxed">
            Créate una cuenta desde la app y marca la opción de prestador de servicios.
          </p>
          <Link
            to="/app?registro=prestador"
            className="inline-flex items-center gap-2 bg-jungle-700 hover:bg-jungle-800 text-white px-6 py-3 rounded-full font-semibold text-sm transition-colors"
          >
            Registrar mi negocio
          </Link>
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
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="TGO-XXXX"
            className="flex-1 bg-amate-50 rounded-xl px-4 py-3 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-jungle-400 border-0"
            maxLength={8}
          />
          <button onClick={buscar} disabled={buscando || codigo.trim().length < 4}
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