import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Agenda from './pages/Agenda';
import ColorBar from './pages/ColorBar';
import NailBar from './pages/NailBar';
import Clients from './pages/Clients';
import Inventory from './pages/Inventory';
import Settings from './pages/Settings';
import Finance from './pages/Finance';
import WalkInSale from './pages/WalkInSale';
import Loyalty from './pages/Loyalty';
import PublicCard from './pages/PublicCard';

function Protected({ children }) {
  const { session } = useAuth();
  if (session === undefined) return <div className="login-wrap"><div className="card">Cargando…</div></div>;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export function Shell({ title, sub, children, badge }) {
  const nav = useNavigate();
  const { signOut } = useAuth();
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
        <button className="iconbtn" onClick={async () => { await signOut(); nav('/login'); }} aria-label="Salir">⎋</button>
      </div>
      {children}
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/tarjeta/:token" element={<PublicCard />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/agenda" element={<Protected><Agenda /></Protected>} />
      <Route path="/color" element={<Protected><ColorBar /></Protected>} />
      <Route path="/unas" element={<Protected><NailBar /></Protected>} />
      <Route path="/clientes" element={<Protected><Clients /></Protected>} />
      <Route path="/inventario" element={<Protected><Inventory /></Protected>} />
      <Route path="/finanzas" element={<Protected><Finance /></Protected>} />
      <Route path="/venta" element={<Protected><WalkInSale /></Protected>} />
      <Route path="/lealtad" element={<Protected><Loyalty /></Protected>} />
      <Route path="/ajustes" element={<Protected><Settings /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
