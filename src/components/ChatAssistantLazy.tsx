import { lazy, Suspense, useEffect, useState, type ComponentProps } from 'react';
import { asegurarConocimiento } from '../lib/chatbot';
import { useDespuesDeCarga } from '../lib/useDespuesDeCarga';

// El chat (motor de recomendación, base de conocimiento, mapa en miniatura…) es
// de lo más pesado de la app y antes viajaba en el chunk de AppShell aunque
// estuvieras en Inicio. Ahora se baja y se monta cuando abres la pestaña Chat o
// unos segundos después de cargar (así ya está listo cuando lo vas a usar), y
// desde ahí se queda montado, igual que antes.
const ChatAssistant = lazy(async () => {
  await asegurarConocimiento();
  return import('./ChatAssistant');
});

type Props = ComponentProps<typeof ChatAssistant> & { activo: boolean };

export default function ChatAssistantLazy({ activo, ...resto }: Props) {
  const precalentado = useDespuesDeCarga(3000);
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    if (!montado && (precalentado || activo)) setMontado(true);
  }, [precalentado, activo, montado]);
  if (!montado) return null;
  return (
    <Suspense fallback={null}>
      <ChatAssistant {...resto} />
    </Suspense>
  );
}
