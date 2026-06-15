import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../App';
import { Toast, useToast, Modal } from '../components/UI';

function ymd(d) { return d.toISOString().slice(0, 10); }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

export default function Agenda() {
  const { session } = useAuth();
  const nav = useNavigate();
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [appts, setAppts] = useState([]);
  const [clients, setClients] = useState([]);
  const [toast, setToast] = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  // formulario
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [time, setTime] = useState('10:00');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('clients').select('id, full_name, phone').order('full_name').limit(500)
      .then(({ data }) => setClients(data || []));
  }, []);

  function load() {
    supabase.from('appointments')
      .select('id, datetime, client_id, client_name, client_phone, reason, status, clients(full_name)')
      .gte('datetime', startOfDay(day).toISOString())
      .lte('datetime', endOfDay(day).toISOString())
      .order('datetime')
      .then(({ data }) => setAppts(data || []));
  }
  useEffect(load, [day]);

  function shiftDay(n) { const d = new Date(day); d.setDate(d.getDate() + n); setDay(startOfDay(d)); }
  const isToday = ymd(day) === ymd(new Date());

  function openNew() {
    setEditing(null); setClientId(''); setClientName(''); setPhone(''); setTime('10:00'); setReason('');
    setShowForm(true);
  }
  function openEdit(a) {
    setEditing(a);
    setClientId(a.client_id || '');
    setClientName(a.client_name || a.clients?.full_name || '');
    setPhone(a.client_phone || '');
    setTime(new Date(a.datetime).toTimeString().slice(0, 5));
    setReason(a.reason || '');
    setShowForm(true);
  }
  function pickClient(id) {
    setClientId(id);
    const c = clients.find(x => x.id === id);
    if (c) { setClientName(c.full_name || ''); setPhone(c.phone || ''); }
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const [hh, mm] = time.split(':');
      const dt = new Date(day); dt.setHours(Number(hh), Number(mm), 0, 0);
      const payload = {
        datetime: dt.toISOString(), artist_id: session.user.id,
        client_id: clientId || null, client_name: clientName || null,
        client_phone: phone || null, reason: reason || null, status: 'scheduled',
      };
      if (editing) {
        await supabase.from('appointments').update(payload).eq('id', editing.id);
        setToast('✓ Cita actualizada');
      } else {
        await supabase.from('appointments').insert(payload);
        setToast('✓ Cita agendada');
      }
      setShowForm(false); load();
    } catch (e) { setToast('⚠ ' + e.message); } finally { setBusy(false); }
  }

  async function cancel(a) {
    if (!confirm('¿Cancelar esta cita?')) return;
    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', a.id);
    setToast('Cita cancelada'); load();
  }

  const statusLabel = { scheduled: 'Agendada', completed: 'Completada', paid: 'Pagada', cancelled: 'Cancelada' };

  return (
    <Shell title="Agenda" sub={day.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long' })}>
      <div className="screen" style={{ paddingBottom: 40 }}>
        <h2>Agenda</h2>
        <p className="lead">Registra y consulta las citas del salón.</p>

        <div className="agenda-nav">
          <button className="btn sm" onClick={() => shiftDay(-1)}>← Día anterior</button>
          <button className={'btn sm' + (isToday ? ' primary' : '')} onClick={() => setDay(startOfDay(new Date()))}>Hoy</button>
          <button className="btn sm" onClick={() => shiftDay(1)}>Día siguiente →</button>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Ir a una fecha</label>
          <input type="date" value={ymd(day)} onChange={e => setDay(startOfDay(new Date(e.target.value + 'T12:00')))} />
        </div>

        <button className="btn xl primary" style={{ width: '100%', marginBottom: 16 }} onClick={openNew}>＋ Nueva cita</button>

        {appts.length === 0 && <p style={{ color: 'var(--muted)' }}>No hay citas para este día.</p>}
        {appts.map(a => (
          <div key={a.id} className={'appt' + (a.status === 'cancelled' ? ' cancelled' : '')}>
            <div className="time num">{new Date(a.datetime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{a.clients?.full_name || a.client_name || 'Cliente'}</div>
              <div style={{ color: 'var(--muted)', fontSize: '.82rem' }}>
                {a.reason || 'Servicio'} · <span className={'tag' + (a.status === 'cancelled' ? '' : ' ok')} style={{ fontSize: '.66rem' }}>{statusLabel[a.status] || a.status}</span>
              </div>
            </div>
            {a.status !== 'cancelled' && a.status !== 'paid' && (
              <>
                <button className="btn sm" onClick={() => nav('/color', { state: { clientId: a.client_id, appointmentId: a.id } })} title="Iniciar trabajo">▶</button>
                <button className="btn sm" onClick={() => openEdit(a)} title="Editar">✎</button>
                <button className="btn sm danger" onClick={() => cancel(a)} title="Cancelar">✕</button>
              </>
            )}
          </div>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)}>
        <h3 style={{ marginBottom: 12 }}>{editing ? 'Editar cita' : 'Nueva cita'} · {day.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</h3>
        <div className="field">
          <label>Cliente registrado (opcional)</label>
          <select value={clientId} onChange={e => pickClient(e.target.value)}>
            <option value="">— Cliente nuevo / sin registrar —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.full_name || 'Sin nombre'}</option>)}
          </select>
        </div>
        <div className="field"><label>Nombre</label>
          <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nombre del cliente" />
        </div>
        <div className="field"><label>Teléfono (opcional)</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" />
        </div>
        <div className="field"><label>Hora</label>
          <input type="time" value={time} onChange={e => setTime(e.target.value)} />
        </div>
        <div className="field"><label>Servicio / motivo</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej. Color global, mechas, corte…" />
        </div>
        <button className="btn primary" style={{ width: '100%' }} onClick={save} disabled={busy}>
          {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agendar cita'}
        </button>
        <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setShowForm(false)}>Cancelar</button>
      </Modal>
      <Toast msg={toast} />
    </Shell>
  );
}
