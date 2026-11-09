import { useEffect, useRef, useState } from 'react';

// ============================================================
// BOTÓN "CONTINUAR CON GOOGLE" (Google Identity Services)
// ============================================================
// Carga el script oficial de Google y dibuja SU botón (así cumple con
// su marca). Al elegir cuenta, Google entrega un "credential" (ID token)
// que se manda al servidor para verificarlo: /api/auth/login?accion=google.
// Si no hay VITE_GOOGLE_CLIENT_ID configurado, el botón no se muestra y
// el inicio de sesión sigue funcionando solo con correo y contraseña.

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || '';

declare global {
  interface Window {
    google?: any;
  }
}

let cargaScript: Promise<void> | null = null;
function cargarGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (cargaScript) return cargaScript;
  cargaScript = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      cargaScript = null;
      reject(new Error('gsi'));
    };
    document.head.appendChild(s);
  });
  return cargaScript;
}

export default function BotonGoogle({ onCredential }: { onCredential: (credential: string) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const [fallo, setFallo] = useState(false);
  // Siempre el callback más reciente, sin volver a inicializar Google.
  const cb = useRef(onCredential);
  cb.current = onCredential;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let vivo = true;
    cargarGsi()
      .then(() => {
        if (!vivo || !caja.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (r: { credential?: string }) => r.credential && cb.current(r.credential),
          ux_mode: 'popup',
        });
        const ancho = Math.min(400, Math.max(200, Math.round(caja.current.clientWidth || 320)));
        window.google.accounts.id.renderButton(caja.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'left',
          locale: 'es',
          width: ancho,
        });
      })
      .catch(() => vivo && setFallo(true));
    return () => {
      vivo = false;
    };
  }, []);

  if (!GOOGLE_CLIENT_ID) return null;
  if (fallo) return null; // sin internet: queda el acceso con correo
  return <div ref={caja} className="flex min-h-[44px] w-full justify-center" />;
}
