import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../App';
import { Toast, useToast } from '../components/UI';

export default function Dashboard() {
  const nav = useNavigate();
  const { profile, isAdmin, salonSettings, activeArtist } = useAuth();
  const [appts, setAppts] = useState([]);
  const [toast, setToast] = useToast();
  const [checkBusy, setCheckBusy] = useState(false);
  const [lastCheckIn, setLastCheckIn] = useState(null);   // fecha/hora del último registro de hoy

  // Carga el último registro de entrada de hoy del artista activo
  useEffect(() => {
    if (!activeArtist?.id) return;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    supabase.from('attendance')
      .select('created_at')
      .eq('user_id', activeArtist.id).eq('type', 'in')
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => setLastCheckIn(data?.[0]?.created_at || null));
  }, [activeArtist?.id]);

  async function registrarEntrada() {
    if (checkBusy || !activeArtist?.id) return;
    setCheckBusy(true);
    try {
      const { error } = await supabase.from('attendance').insert({
        user_id: activeArtist.id, type: 'in',
        notes: `Entrada · ${activeArtist.full_name || ''}`.trim(),
      });
      if (error) throw error;
      const ahora = new Date().toISOString();
      setLastCheckIn(ahora);
      setToast('✅ Entrada registrada · ' + new Date(ahora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) { setToast('⚠ ' + e.message); } finally { setCheckBusy(false); }
  }
  // Mapa de nombres globales (salón) a claves de módulo
  const globalHidden = salonSettings?.hidden_modules || [];
  const artistHidden = activeArtist?.hidden_modules || [];
  // show recibe la clave del módulo y su nombre global (para compatibilidad con la config del salón)
  const show = (key, globalName) => !artistHidden.includes(key) && !(globalName && globalHidden.includes(globalName));

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

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontWeight: 700 }}>Registro de entrada</div>
            <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
              {lastCheckIn
                ? `Hoy registraste entrada a las ${new Date(lastCheckIn).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
                : 'Aún no registras tu entrada hoy.'}
            </div>
          </div>
          <button className="btn xl ok" style={{ minWidth: 180 }} onClick={registrarEntrada} disabled={checkBusy}>
            {checkBusy ? 'Registrando…' : (lastCheckIn ? '🔄 Registrar de nuevo' : '🕘 Registrar entrada')}
          </button>
        </div>

        <div className="dash-layout">
          <div className="station-grid main">
            {show('color', 'Barra de Color') && (
              <button className="station color" onClick={() => nav('/color')}>
                <span className="sicon">🎨</span><span className="sname">Barra de Color</span>
                <span className="ssub">Formular · pesar · cobrar</span>
              </button>
            )}
            {show('unas', 'Uñas') && (
              <button className="station unas" onClick={() => nav('/unas')}>
                <span className="sicon">💅</span><span className="sname">Barra de Uñas</span>
                <span className="ssub">Diseño y cobro</span>
              </button>
            )}
            {show('servicios', 'Servicios') && (
              <button className="station servicios" onClick={() => nav('/servicios')}>
                <span className="sicon">✂️</span><span className="sname">Servicios</span>
                <span className="ssub">Corte, tratamiento y más</span>
              </button>
            )}
            {show('venta', 'Venta sin cita') && (
              <button className="station venta" onClick={() => nav('/venta')}>
                <span className="sicon">🛍️</span><span className="sname">Venta sin cita</span>
                <span className="ssub">Productos de mostrador</span>
              </button>
            )}
            {show('agenda') && (
              <button className="station agenda" onClick={() => nav('/agenda')}>
                <span className="sicon">📅</span><span className="sname">Agenda</span>
                <span className="ssub">Registrar citas</span>
              </button>
            )}
            {show('pestanas', 'Pestañas') && (
              <div className="station soon">
                <span className="sicon">👁️</span><span className="sname">Pestañas</span>
                <span className="ssub">Próximamente</span>
              </div>
            )}
          </div>

          <div className="compact-col">
            <div className="compact-title">Gestión</div>
            {show('clientes') && (
              <button className="compact-item" onClick={() => nav('/clientes')}>
                <span className="ci-icon">👥</span><span className="ci-name">Clientes</span>
              </button>
            )}
            {show('inventario') && (
              <button className="compact-item" onClick={() => nav('/inventario')}>
                <span className="ci-icon">📦</span><span className="ci-name">Inventario</span>
              </button>
            )}
            {show('lealtad', 'Lealtad') && (
              <button className="compact-item" onClick={() => nav('/lealtad')}>
                <span className="ci-icon">⭐</span><span className="ci-name">Lealtad</span>
              </button>
            )}
            {show('finanzas', 'Finanzas') && (
              <button className="compact-item" onClick={() => nav('/finanzas')}>
                <span className="ci-icon">📊</span><span className="ci-name">Finanzas</span>
              </button>
            )}
            <button className="compact-item" onClick={() => nav('/ajustes')}>
              <span className="ci-icon">⚙️</span><span className="ci-name">Ajustes</span>
            </button>
            {isAdmin && (
              <button className="compact-item" onClick={() => nav('/equipo')}>
                <span className="ci-icon">🧑‍🤝‍🧑</span><span className="ci-name">Equipo</span>
              </button>
            )}
          </div>
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
      <Toast msg={toast} />
    </Shell>
  );
}
