import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Cookie, MapPin } from 'lucide-react';
import { useT } from '../lib/i18n';

const CLAVE = 'tuxtlasgo:aviso-privacidad';

function yaVisto(): boolean {
  try { return localStorage.getItem(CLAVE) === 'ok'; } catch { return false; }
}

// Aviso de datos al entrar. Es informativo a propósito: la app no usa
// cookies de seguimiento ni analítica de terceros, solo guarda en el
// dispositivo lo necesario (sesión, idioma, favoritos, mapa offline) y
// la ubicación únicamente cuando la persona lo autoriza. No hay nada
// que "rechazar", así que solo se pide enterarse.
export default function AvisoPrivacidad() {
  const t = useT();
  const { pathname } = useLocation();
  const [visto, setVisto] = useState(yaVisto);

  // En las páginas legales ya está la información completa.
  if (visto || pathname === '/privacidad' || pathname === '/terminos') return null;

  const entendido = () => {
    setVisto(true);
    try { localStorage.setItem(CLAVE, 'ok'); } catch { /* no crítico */ }
  };

  return (
    <div
      role="dialog"
      aria-label={t('Aviso de privacidad')}
      className="fixed z-[9500] left-3 right-3 bottom-20 lg:left-auto lg:right-4 lg:bottom-4 lg:w-[400px] bg-white rounded-2xl shadow-2xl border border-jungle-100 p-4 animate-fade-in"
    >
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-full bg-jungle-100 text-jungle-700 flex items-center justify-center flex-shrink-0">
          <Cookie size={18} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display font-bold text-sm text-jungle-950">
            {t('Tus datos, en tu dispositivo')}
          </h3>
          <p className="text-xs text-jungle-700 mt-1">
            {t('No usamos cookies de seguimiento ni publicidad. Solo guardamos en tu dispositivo lo necesario para que la app funcione: tu sesión, el idioma, tus favoritos y el mapa sin internet.')}
          </p>
          <p className="text-xs text-jungle-700 mt-2 flex items-start gap-1.5">
            <MapPin size={13} className="flex-shrink-0 mt-0.5 text-jungle-600" />
            <span>
              {t('Tu ubicación es un dato sensible: solo se usa si tú lo autorizas, para trazar rutas, y nunca se guarda en nuestros servidores.')}
            </span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Link
          to="/privacidad"
          className="flex-1 text-center border-2 border-jungle-200 text-jungle-800 py-2 rounded-xl font-semibold text-xs"
        >
          {t('Aviso de privacidad')}
        </Link>
        <button
          onClick={entendido}
          className="flex-1 bg-jungle-700 hover:bg-jungle-800 text-white py-2 rounded-xl font-semibold text-xs"
        >
          {t('Entendido')}
        </button>
      </div>
    </div>
  );
}
