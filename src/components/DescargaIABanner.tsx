import { useState, useEffect } from 'react';
import { Download, X, Sparkles } from 'lucide-react';
import type { useLLM } from '../hooks/useLLM';

// ============================================================
// AVISO DE PRE-DESCARGA DE IA
// ============================================================
// Se muestra apenas se abre la app (en CUALQUIER pestaña, no solo
// en el chat) para invitar a descargar el modelo de IA mientras hay
// señal — es lo que de verdad garantiza que funcione después sin
// internet en la selva (ver conversación sobre "Caso A vs Caso B").
//
// A propósito NO se descarga sola en automático y en silencio: el
// modelo pesa ~1GB, y TuxtlasGO existe justo para ayudar a gente con
// acceso limitado/caro a datos móviles (ver la brecha digital citada
// en la memoria técnica). Descargar eso sin avisar, a espaldas de
// alguien que abrió la app desde su plan de datos, contradice esa
// propuesta de valor. Por eso: aviso visible, botón explícito,
// opción de "más tarde" igual de visible.
// ============================================================

const CLAVE_DESCARTADO = 'tuxtlasgo:aviso-ia-descartado';

interface Props {
  llm: ReturnType<typeof useLLM>;
}

export default function DescargaIABanner({ llm }: Props) {
  const [descartado, setDescartado] = useState(
    () => localStorage.getItem(CLAVE_DESCARTADO) === '1'
  );
  const [mostrarExito, setMostrarExito] = useState(false);
  const [enDatosMoviles, setEnDatosMoviles] = useState(false);

  // Network Information API — no todos los navegadores la tienen
  // (Safari/iOS no la soporta), así que es solo un plus si existe,
  // nunca un bloqueo si no está disponible.
  useEffect(() => {
    const conn = (navigator as any).connection;
    if (conn?.type) setEnDatosMoviles(conn.type === 'cellular');
    else if (typeof conn?.effectiveType === 'string') {
      setEnDatosMoviles(['slow-2g', '2g', '3g'].includes(conn.effectiveType));
    }
  }, []);

  // Cuando termina de cargar, mostramos una confirmación breve y
  // apagamos el aviso para siempre (ya cumplió su propósito).
  useEffect(() => {
    if (llm.estado === 'listo') {
      setMostrarExito(true);
      localStorage.setItem(CLAVE_DESCARTADO, '1');
      const t = setTimeout(() => setMostrarExito(false), 4000);
      return () => clearTimeout(t);
    }
  }, [llm.estado]);

  function descartar() {
    localStorage.setItem(CLAVE_DESCARTADO, '1');
    setDescartado(true);
  }

  // No mostrar si: ya se descartó, el dispositivo no soporta IA
  // avanzada (no tiene sentido ofrecer algo que no puede correr), aún
  // se está verificando el soporte, o no hay internet para descargar.
  if (descartado && !mostrarExito) return null;
  if (llm.estado === 'sin_soporte' || llm.estado === 'verificando') return null;
  if (llm.estado === 'inactivo' && typeof navigator !== 'undefined' && !navigator.onLine) {
    return null;
  }

  if (mostrarExito) {
    return (
      <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl bg-jungle-50 border border-jungle-200 px-3 py-2 text-xs text-jungle-800 animate-fade-in">
        <Sparkles size={14} className="text-jungle-600 flex-shrink-0" />
        Listo — la IA avanzada ya quedó guardada en tu dispositivo. Seguirá funcionando aunque pierdas la señal.
      </div>
    );
  }

  if (llm.estado === 'cargando') {
    return (
      <div className="mx-3 mt-2 rounded-xl bg-jungle-50 border border-jungle-200 px-3 py-2">
        <div className="flex items-center justify-between text-xs text-jungle-800 mb-1">
          <span>Preparando guIA para uso sin internet…</span>
          <span className="font-semibold">
            {Math.round(llm.progreso * 100)}% · {llm.segundosTranscurridos}s
          </span>
        </div>
        <div className="w-full h-1 bg-jungle-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-jungle-600 transition-all duration-300"
            style={{ width: `${Math.round(llm.progreso * 100)}%` }}
          />
        </div>
        {llm.progreso === 0 && llm.segundosTranscurridos > 5 && (
          <p className="text-[10px] text-jungle-500 mt-1">
            El % puede tardar en moverse en archivos grandes — sigue descargando, no está congelado.
          </p>
        )}
      </div>
    );
  }

  if (llm.estado === 'inactivo') {
    return (
      <div className="mx-3 mt-2 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
        <Download size={16} className="text-amber-700 flex-shrink-0 mt-0.5" />
        <div className="flex-1 text-xs text-amber-900">
          <div className="font-medium mb-0.5">Descarga la IA para que funcione sin internet</div>
          <div className="text-amber-800">
            {enDatosMoviles
              ? 'Pesa cerca de 1GB — pareces estar en datos móviles, esto puede consumir tu plan. Puede tardar varios minutos; deja la app abierta mientras descarga.'
              : 'Pesa cerca de 1GB — se recomienda hacerlo con WiFi. Puede tardar varios minutos; deja la app abierta mientras descarga.'}
          </div>
          <div className="mt-1.5 flex gap-4">
            <button
              onClick={() => llm.activar(undefined, { sinPrisa: true })}
              className="font-semibold text-jungle-700 underline underline-offset-2"
            >
              Descargar ahora
            </button>
            <button onClick={descartar} className="text-amber-700">
              Más tarde
            </button>
          </div>
        </div>
        <button
          onClick={descartar}
          aria-label="Cerrar aviso"
          className="text-amber-400 flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // 'error': antes esto desaparecía en silencio — que fue justo el bug
  // real reportado en campo ("se puso como la siguiente captura y no
  // se mostró nada"). Ahora se avisa con el motivo real y se ofrece
  // reintentar, en vez de dejar al usuario sin saber qué pasó.
  if (llm.estado === 'error') {
    return (
      <div className="mx-3 mt-2 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
        <div className="flex-1 text-xs text-red-800">
          <div className="font-medium mb-0.5">No se pudo descargar la IA local</div>
          {llm.ultimoError && (
            <div className="text-red-700 font-mono text-[10px] mb-1">{llm.ultimoError}</div>
          )}
          <button
            onClick={() => llm.activar(undefined, { sinPrisa: true })}
            className="font-semibold text-jungle-700 underline underline-offset-2"
          >
            Reintentar
          </button>
        </div>
        <button onClick={descartar} aria-label="Cerrar aviso" className="text-red-400 flex-shrink-0">
          <X size={14} />
        </button>
      </div>
    );
  }

  return null;
}
