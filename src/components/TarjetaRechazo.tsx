import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, ChevronDown, MessageCircle, RotateCcw, Loader2, Phone } from 'lucide-react';
import { enlaceSoporte, numeroSoporteLegible } from '../lib/soporte';

interface Props {
  motivo?: string | null;
  nombreNegocio?: string;
  codigo?: string;
  /** Si viene, se muestra "Volver a enviar a revisión" (el prestador ya corrigió lo indicado). */
  onReenviar?: () => void;
  reenviando?: boolean;
  /** Texto de ayuda sobre qué hacer antes de reenviar. */
  pista?: string;
}

// Lo que ve un prestador cuando se rechazó su solicitud: el motivo, qué
// hacer para volver a intentar y cómo escribirle a TuxtlasGO.
export default function TarjetaRechazo({ motivo, nombreNegocio, codigo, onReenviar, reenviando, pista }: Props) {
  const [verRazones, setVerRazones] = useState(true);
  const numero = numeroSoporteLegible();

  const mensaje =
    `Hola TuxtlasGO, mi solicitud${nombreNegocio ? ` "${nombreNegocio}"` : ''}${codigo ? ` (código ${codigo})` : ''} ` +
    `no fue aprobada${motivo ? `. Motivo: ${motivo}` : ''}. Necesito ayuda para corregirla.`;
  const contacto = enlaceSoporte(mensaje);
  const [copiado, setCopiado] = useState(false);

  // Instagram no precarga texto: se copia el mensaje para pegarlo en el chat.
  function alAbrirContacto() {
    if (contacto.esWhatsApp) return;
    navigator.clipboard?.writeText(mensaje).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 6000);
    }).catch(() => { /* sin permiso de portapapeles: se abre el chat igual */ });
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-900">
      <div className="flex items-start gap-3">
        <span className="h-9 w-9 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
          <AlertTriangle size={18} />
        </span>
        <div className="flex-1">
          <p className="font-display font-bold text-sm">Tu solicitud no fue aprobada</p>
          <p className="text-xs text-red-800/80 mt-0.5">Puedes corregirla y volver a intentarlo, o escribirnos y te ayudamos.</p>
        </div>
      </div>

      <button type="button" onClick={() => setVerRazones((v) => !v)} aria-expanded={verRazones}
        className="mt-3 w-full flex items-center justify-between text-xs font-bold text-red-700 bg-white/60 rounded-xl px-3 py-2">
        Ver razones
        <ChevronDown size={16} className={`transition-transform ${verRazones ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {verRazones && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <p className="text-sm bg-white/60 rounded-xl px-3 py-2.5 mt-2 leading-relaxed">
              {motivo?.trim() || 'El equipo no dejó un motivo. Escríbenos para que te lo expliquemos.'}
            </p>
            {pista && <p className="text-xs text-red-800/80 mt-2 px-1 leading-relaxed">{pista}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-3 space-y-2">
        {onReenviar && (
          <motion.button whileTap={{ scale: 0.98 }} type="button" onClick={onReenviar} disabled={reenviando}
            className="w-full flex items-center justify-center gap-2 bg-jungle-700 hover:bg-jungle-800 text-white text-sm font-bold py-3 rounded-xl disabled:opacity-60 transition-colors">
            {reenviando ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            Volver a enviar a revisión
          </motion.button>
        )}
        <a href={contacto.href} target="_blank" rel="noopener noreferrer" onClick={alAbrirContacto}
          className="w-full flex items-center justify-center gap-2 bg-white border-2 border-red-200 hover:border-red-300 text-red-700 text-sm font-bold py-3 rounded-xl transition-colors">
          <MessageCircle size={16} /> {contacto.etiqueta}
        </a>
        {copiado && (
          <p className="text-xs text-center text-jungle-700 font-semibold bg-jungle-50 rounded-lg px-3 py-2">
            ✓ Mensaje copiado. Pégalo en el chat y envíalo.
          </p>
        )}
        {numero && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-red-800/80">
            <Phone size={12} /> Contacto: <a href={`tel:${numero.replace(/\s/g, '')}`} className="font-bold underline">{numero}</a>
          </p>
        )}
      </div>
    </div>
  );
}
