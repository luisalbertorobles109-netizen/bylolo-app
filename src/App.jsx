import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { FloatingTimer } from './context/TimerContext';
import { ScaleChip, useScale } from './context/ScaleContext';
import Login from './pages/Login';
import SelectArtist from './pages/SelectArtist';
import Dashboard from './pages/Dashboard';
import Agenda from './pages/Agenda';
import ColorBar from './pages/ColorBar';
import NailBar from './pages/NailBar';
import Services from './pages/Services';
import Clients from './pages/Clients';
import Inventory from './pages/Inventory';
import Settings from './pages/Settings';
import TeamManager from './pages/TeamManager';
import Finance from './pages/Finance';
import WalkInSale from './pages/WalkInSale';
import Loyalty from './pages/Loyalty';
import PublicCard from './pages/PublicCard';

// Protege rutas: requiere (1) sesión del dispositivo y (2) un artista activo seleccionado.
function Protected({ children }) {
  const { session, activeArtist } = useAuth();
  if (session === undefined) return <div className="login-wrap"><div className="card">Cargando…</div></div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!activeArtist) return <Navigate to="/seleccionar" replace />;
  return children;
}

export function Shell({ title, sub, children, badge }) {
  const nav = useNavigate();
  const { signOut, activeArtist } = useAuth();
  return (
    <>
      <div className="appbar">
        <button className="iconbtn" onClick={() => nav('/')} aria-label="Inicio" style={{ padding: 0, overflow: 'hidden' }}>
          <img src="/logo-bylolo.png" alt="ByLolo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </button>
        <div>
          <div className="logo">ByLolo <em>{title}</em></div>
          {sub && <div className="sub">{sub}</div>}
        </div>
        <div className="spacer" />
        {badge}
        <button className="iconbtn" onClick={() => nav('/ajustes')} aria-label="Ajustes">⚙</button>
        <button className="iconbtn" onClick={async () => { await signOut(); nav('/seleccionar'); }} aria-label="Cambiar de artista" title="Salir / cambiar de artista">⎋</button>
      </div>
      {children}
    </>
  );
}

export default function App() {
  return (
    <>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/seleccionar" element={<SelectGate />} />
      <Route path="/tarjeta/:token" element={<PublicCard />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/agenda" element={<Protected><Agenda /></Protected>} />
      <Route path="/color" element={<Protected><ColorBar /></Protected>} />
      <Route path="/unas" element={<Protected><NailBar /></Protected>} />
      <Route path="/servicios" element={<Protected><Services /></Protected>} />
      <Route path="/clientes" element={<Protected><Clients /></Protected>} />
      <Route path="/inventario" element={<Protected><Inventory /></Protected>} />
      <Route path="/finanzas" element={<Protected><Finance /></Protected>} />
      <Route path="/venta" element={<Protected><WalkInSale /></Protected>} />
      <Route path="/lealtad" element={<Protected><Loyalty /></Protected>} />
      <Route path="/ajustes" element={<Protected><Settings /></Protected>} />
      <Route path="/equipo" element={<Protected><TeamManager /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
      <GlobalTimerBubble />
      <GlobalScaleChip />
    </>
  );
}

// Muestra el chip de báscula solo si hay sesión y artista activo
function GlobalScaleChip() {
  const { session, activeArtist } = useAuth();
  if (!session || !activeArtist) return null;
  return <ScaleChip />;
}

// Muestra la burbuja flotante solo si hay sesión y artista activo
function GlobalTimerBubble() {
  const { session, activeArtist } = useAuth();
  if (!session || !activeArtist) return null;
  return <FloatingTimer />;
}

// Compuerta para el panel de selección: requiere sesión, pero NO artista activo.
function SelectGate() {
  const { session, activeArtist } = useAuth();
  if (session === undefined) return <div className="login-wrap"><div className="card">Cargando…</div></div>;
  if (!session) return <Navigate to="/login" replace />;
  if (activeArtist) return <Navigate to="/" replace />;
  return <SelectArtist />;
}
