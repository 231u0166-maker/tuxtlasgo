import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import BottomNav, { type Tab } from './BottomNav';
import ExploreScreen from './ExploreScreen';
import MapScreen from './MapScreen';
import ChatAssistant from './ChatAssistant';
import FavoritesScreen from './FavoritesScreen';
import PlaceDetail from './PlaceDetail';
import OfflineIndicator from './OfflineIndicator';
import type { Lugar } from '../data/lugares';

export default function AppShell() {
  const [tab, setTab] = useState<Tab>('explorar');
  const [lugarSeleccionado, setLugarSeleccionado] = useState<Lugar | null>(null);

  const verLugar = (l: Lugar) => setLugarSeleccionado(l);
  const verEnMapa = () => {
    setLugarSeleccionado(null);
    setTab('mapa');
  };

  return (
    <div className="flex flex-col h-screen bg-jungle-50">
      <OfflineIndicator />

      {/* Mini header con "atrás" */}
      <div className="absolute top-3 left-3 z-30">
        <Link
          to="/"
          className="bg-white/90 backdrop-blur shadow-md rounded-full w-9 h-9 flex items-center justify-center text-jungle-900 hover:bg-white"
          aria-label="Volver al inicio"
        >
          <ArrowLeft size={18} />
        </Link>
      </div>

      <main className="flex-1 overflow-hidden">
        {tab === 'explorar' && (
          <div className="h-full overflow-y-auto">
            <ExploreScreen onVerLugar={verLugar} />
          </div>
        )}
        {tab === 'mapa' && <MapScreen onVerLugar={verLugar} />}
        {tab === 'chat' && <ChatAssistant onVerLugar={verLugar} />}
        {tab === 'favoritos' && (
          <div className="h-full overflow-y-auto">
            <FavoritesScreen onVerLugar={verLugar} />
          </div>
        )}
      </main>

      <BottomNav activa={tab} onChange={setTab} />

      {lugarSeleccionado && (
        <PlaceDetail
          lugar={lugarSeleccionado}
          onClose={() => setLugarSeleccionado(null)}
          onVerEnMapa={verEnMapa}
        />
      )}
    </div>
  );
}
