import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Toast, useToast, Modal } from '../components/UI';

export default function SelectArtist() {
  const { selectArtist, signOutDevice, setAdminPin } = useAuth();
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useToast();
  const [pinFor, setPinFor] = useState(null); // miembro pendiente de PIN
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc('list_selectable_artists').then(({ data, error }) => {
      if (error) setToast('⚠ ' + error.message);
      setArtists(data || []);
      setLoading(false);
    });
  }, []);

  function pick(a) {
    if (a.pin_enabled) { setPinFor(a); setPin(''); }
    else enter(a);
  }
  function enter(a) {
    // guarda el artista activo con sus módulos ocultos
    selectArtist({ id: a.id, full_name: a.full_name, role: a.role, accent: a.accent, hidden_modules: a.hidden_modules || [] });
  }

  async function confirmPin() {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('verify_member_pin', { p_id: pinFor.id, p_pin: pin });
    setBusy(false);
    if (error) return setToast('⚠ ' + error.message);
    if (data === true) {
      if (pinFor.role === 'Admin') setAdminPin(pin); // recordar PIN para acciones de gestión
      enter(pinFor);
    }
    else { setToast('PIN incorrecto'); setPin(''); }
  }

  const initials = n => (n || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="select-wrap">
      <div className="select-head">
        <img src="/logo-bylolo.png" alt="ByLolo" className="select-logo" />
        <h1>¿Quién va a trabajar?</h1>
        <p>Toca tu nombre para entrar a tu estación.</p>
      </div>

      {loading ? <p style={{ color: 'var(--muted)' }}>Cargando equipo…</p> : (
        <div className="artist-grid">
          {artists.map(a => (
            <button key={a.id} className={'artist-btn' + (a.role === 'Admin' ? ' admin' : '')} onClick={() => pick(a)}>
              <span className="artist-av">{a.role === 'Admin' ? '👑' : initials(a.full_name)}</span>
              <span className="artist-name">{a.full_name || 'Sin nombre'}</span>
              <span className="artist-role">{a.role === 'Admin' ? 'Administrador' : 'Artista'}{a.pin_enabled ? ' · 🔒' : ''}</span>
            </button>
          ))}
          {artists.length === 0 && <p style={{ color: 'var(--muted)' }}>No hay miembros del equipo dados de alta todavía.</p>}
        </div>
      )}

      <button className="btn ghost select-exit" onClick={signOutDevice}>Cerrar sesión del dispositivo</button>

      <Modal open={!!pinFor} onClose={() => setPinFor(null)}>
        <h3 style={{ textAlign: 'center', marginBottom: 4 }}>{pinFor?.role === 'Admin' ? '👑' : '🔒'} {pinFor?.full_name}</h3>
        <p style={{ color: 'var(--muted)', fontSize: '.86rem', textAlign: 'center', marginBottom: 16 }}>Ingresa tu PIN</p>
        <input className="pin-input" inputMode="numeric" maxLength={8} value={pin} autoFocus
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter') confirmPin(); }}
          placeholder="••••" />
        <button className="btn primary" style={{ width: '100%', marginTop: 14 }} onClick={confirmPin} disabled={busy || pin.length < 4}>
          {busy ? 'Verificando…' : 'Entrar'}
        </button>
        <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setPinFor(null)}>Cancelar</button>
      </Modal>
      <Toast msg={toast} />
    </div>
  );
}
