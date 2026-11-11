import { Instagram, Facebook, Youtube, Globe, Mail, Link2 } from 'lucide-react';
import type { TipoEnlace } from '../lib/enlaces';

// Logo de cada red o medio de contacto: un cuadro con el color de la marca y su ícono.
// Lo usan el perfil del prestador (Enlaces y pagos) y la ficha pública.

const TRAZO = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function TikTok({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...TRAZO} aria-hidden="true">
      <path d="M21 7.917v4.034a9.948 9.948 0 0 1-5-1.951v4.5a6.5 6.5 0 1 1-8-6.326v4.326a2.5 2.5 0 1 0 4 2v-11.5h4.083a6.005 6.005 0 0 0 4.917 4.917z" />
    </svg>
  );
}

function WhatsApp({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...TRAZO} aria-hidden="true">
      <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
    </svg>
  );
}

export const FONDO_RED: Record<TipoEnlace, string> = {
  instagram: 'bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5]',
  facebook: 'bg-[#1877F2]',
  whatsapp: 'bg-[#25D366]',
  tiktok: 'bg-black',
  youtube: 'bg-[#FF0000]',
  sitio: 'bg-jungle-700',
  correo: 'bg-sky-600',
  otro: 'bg-jungle-500',
};

export default function LogoRed({ tipo, size = 40, className = '' }: { tipo: TipoEnlace; size?: number; className?: string }) {
  const g = Math.round(size * 0.52);
  const props = { size: g, strokeWidth: 2 };
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center text-white shadow-sm ${FONDO_RED[tipo] ?? FONDO_RED.otro} ${className}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
      aria-hidden="true"
    >
      {tipo === 'instagram' ? <Instagram {...props} />
        : tipo === 'facebook' ? <Facebook {...props} />
        : tipo === 'youtube' ? <Youtube {...props} />
        : tipo === 'tiktok' ? <TikTok size={g} />
        : tipo === 'whatsapp' ? <WhatsApp size={g} />
        : tipo === 'sitio' ? <Globe {...props} />
        : tipo === 'correo' ? <Mail {...props} />
        : <Link2 {...props} />}
    </span>
  );
}
