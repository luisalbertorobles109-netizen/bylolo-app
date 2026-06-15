import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../App';

export default function Dashboard() {
  const nav = useNavigate();
  const { profile, isAdmin, salonSettings } = useAuth();
  const [appts, setAppts] = useState([]);
  const hidden = salonSettings?.hidden_modules || [];
  const show = m => !hidden.includes(m);

  useEffect(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    supabase.from('appointments')
      .select('id, datetime, client_name, reason, status, client_id, clients(full_name)')
      .gte('datetime', start.toISOString()).lte('datetime', end.toISOString())
      .order('datetime')
      .then(({ data }) => setAppts(data || []));
  }, []);

  const now = Date.now();
  return (
    <Shell title="Studio" sub={`Hola, ${profile?.full_name || ''} · ${profile?.role || ''}`}>
      <div className="screen" style={{ paddingBottom: 40 }}>
        <h2>Estaciones</h2>
        <p className="lead">Elige tu estación de trabajo.</p>
        <div className="station-grid">
          <button className="station color" onClick={() => nav('/color')}>
            <span className="sicon">🎨</span><span className="sname">Barra de Color</span>
            <span className="ssub">Formular · pesar · cobrar</span>
          </button>
          {show('Uñas') && (
            <button className="station unas" onClick={() => nav('/unas')}>
              <span className="sicon">💅</span><span className="sname">Barra de Uñas</span>
              <span className="ssub">Diseño y cobro</span>
            </button>
          )}
          <button className="station clientes" onClick={() => nav('/clientes')}>
            <span className="sicon">👥</span><span className="sname">Clientes</span>
            <span className="ssub">Historial y fichas</span>
          </button>
          <button className="station agenda" onClick={() => nav('/agenda')}>
            <span className="sicon">📅</span><span className="sname">Agenda</span>
            <span className="ssub">Registrar citas</span>
          </button>
          {show('Lealtad') && (
            <button className="station lealtad" onClick={() => nav('/lealtad')}>
              <span className="sicon">⭐</span><span className="sname">Lealtad</span>
              <span className="ssub">Tarjetas y estrellas</span>
            </button>
          )}
          {show('Venta sin cita') && (
            <button className="station venta" onClick={() => nav('/venta')}>
              <span className="sicon">🛍️</span><span className="sname">Venta sin cita</span>
              <span className="ssub">Productos de mostrador</span>
            </button>
          )}
          <button className="station inventario" onClick={() => nav('/inventario')}>
            <span className="sicon">📦</span><span className="sname">Inventario</span>
            <span className="ssub">Productos, insumos y abasto</span>
          </button>
          {show('Finanzas') && (
            <button className="station finanzas" onClick={() => nav('/finanzas')}>
              <span className="sicon">📊</span><span className="sname">Finanzas</span>
              <span className="ssub">{isAdmin ? 'Salón y por artista' : 'Mis ingresos'}</span>
            </button>
          )}
          <button className="station config" onClick={() => nav('/ajustes')}>
            <span className="sicon">⚙️</span><span className="sname">Ajustes</span>
            <span className="ssub">{isAdmin ? 'Tema y administración' : 'Tema y perfil'}</span>
          </button>
          {show('Pestañas') && (
            <div className="station soon">
              <span className="sicon">👁️</span><span className="sname">Pestañas</span>
              <span className="ssub">Próximamente</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 26 }}>
          <h2 style={{ fontSize: '1.15rem' }}>Citas de hoy</h2>
          <button className="btn sm" onClick={() => nav('/agenda')}>Ver agenda →</button>
        </div>
        <p className="lead">Toca una cita para iniciar el trabajo.</p>
        {appts.length === 0 && <p style={{ color: 'var(--muted)' }}>Sin citas registradas para hoy.</p>}
        {appts.map(a => {
          const t = new Date(a.datetime);
          const isNow = Math.abs(t.getTime() - now) < 30 * 60000;
          return (
            <button key={a.id} className={'appt' + (isNow ? ' now' : '')}
              onClick={() => nav('/color', { state: { clientId: a.client_id, appointmentId: a.id } })}>
              <div className="time num">{t.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{a.clients?.full_name || a.client_name || 'Cliente'}</div>
                <div style={{ color: 'var(--muted)', fontSize: '.82rem' }}>{a.reason || 'Servicio'}</div>
              </div>
              {isNow ? <span className="tag ok">AHORA</span> : <span className="tag">{a.status}</span>}
            </button>
          );
        })}
      </div>
    </Shell>
  );
}
