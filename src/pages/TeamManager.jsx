import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../App';
import { Toast, useToast, Modal } from '../components/UI';

const ACCENTS = ['violeta', 'rosa', 'esmeralda', 'azul'];
// Módulos que se pueden ocultar por artista
const MODULES = [
  ['color', 'Barra de Color'],
  ['unas', 'Barra de Uñas'],
  ['venta', 'Venta sin cita'],
  ['agenda', 'Agenda'],
  ['clientes', 'Clientes'],
  ['lealtad', 'Lealtad'],
  ['inventario', 'Inventario'],
  ['finanzas', 'Finanzas'],
];

export default function TeamManager() {
  const { isAdmin } = useAuth();
  const [team, setTeam] = useState([]);
  const [toast, setToast] = useToast();
  const [editing, setEditing] = useState(null); // null o el miembro a editar
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  // campos del formulario
  const [name, setName] = useState('');
  const [role, setRole] = useState('Artista');
  const [accent, setAccent] = useState('violeta');
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pin, setPin] = useState('');
  const [hidden, setHidden] = useState([]);

  function load() {
    supabase.rpc('admin_list_team').then(({ data, error }) => {
      if (error) setToast('⚠ ' + error.message);
      setTeam(data || []);
    });
  }
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  function openCreate() {
    setCreating(true); setEditing(null);
    setName(''); setRole('Artista'); setAccent('violeta'); setPinEnabled(false); setPin(''); setHidden([]);
  }
  function openEdit(m) {
    setEditing(m); setCreating(false);
    setName(m.full_name || ''); setRole(m.role); setAccent(m.accent || 'violeta');
    setPinEnabled(m.pin_enabled); setPin(''); setHidden(m.hidden_modules || []);
  }
  function toggleModule(key) {
    setHidden(h => h.includes(key) ? h.filter(x => x !== key) : [...h, key]);
  }

  async function save() {
    if (busy) return;
    if (!name.trim()) return setToast('Escribe el nombre');
    if (pinEnabled && pin && pin.length < 4 && pin.length > 0) return setToast('El PIN debe tener al menos 4 dígitos');
    setBusy(true);
    try {
      if (creating) {
        const { error } = await supabase.rpc('admin_create_artist', {
          p_full_name: name.trim(), p_role: role, p_accent: accent,
          p_pin: pinEnabled ? pin : null, p_pin_enabled: pinEnabled,
        });
        if (error) throw error;
        setToast('✓ Miembro creado');
      } else {
        const { error } = await supabase.rpc('admin_update_artist', {
          p_id: editing.id, p_full_name: name.trim(), p_role: role, p_accent: accent,
          p_pin_enabled: pinEnabled,
          p_pin: pin ? pin : null,                 // si se deja vacío, conserva el PIN actual
          p_hidden_modules: hidden,
        });
        if (error) throw error;
        setToast('✓ Cambios guardados');
      }
      setCreating(false); setEditing(null); load();
    } catch (e) { setToast('⚠ ' + e.message); } finally { setBusy(false); }
  }

  async function toggleActive(m) {
    const { error } = await supabase.rpc('admin_update_artist', { p_id: m.id, p_active: !m.active });
    if (error) return setToast('⚠ ' + error.message);
    setToast(m.active ? 'Miembro desactivado' : 'Miembro activado'); load();
  }

  if (!isAdmin) return <Shell title="Equipo"><div className="screen"><p style={{ color: 'var(--muted)' }}>Solo el administrador puede gestionar el equipo.</p></div></Shell>;

  const formOpen = creating || !!editing;
  const initials = n => (n || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <Shell title="Equipo" sub="Gestión de artistas">
      <div className="screen" style={{ paddingBottom: 40 }}>
        <h2>Equipo</h2>
        <p className="lead">Crea y administra a los miembros del salón. Tú decides quién pide PIN y qué módulos ve cada uno.</p>

        <button className="btn xl primary" style={{ width: '100%', marginBottom: 16 }} onClick={openCreate}>＋ Nuevo miembro</button>

        {team.map(m => (
          <div key={m.id} className="comp-row" style={{ opacity: m.active ? 1 : .5 }}>
            <div className="artist-av" style={{ width: 40, height: 40, fontSize: '.9rem' }}>{m.role === 'Admin' ? '👑' : initials(m.full_name)}</div>
            <div className="cname" style={{ flex: 1 }}>{m.full_name}
              <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                {m.role}{m.pin_enabled ? ' · 🔒 PIN' : ''}{(m.hidden_modules?.length > 0) ? ` · ${m.hidden_modules.length} módulo(s) oculto(s)` : ''}{!m.active ? ' · inactivo' : ''}
              </div>
            </div>
            <button className="btn sm" onClick={() => openEdit(m)}>✎</button>
            <button className={'btn sm' + (m.active ? ' danger' : ' ok')} onClick={() => toggleActive(m)}>{m.active ? 'Desactivar' : 'Activar'}</button>
          </div>
        ))}
      </div>

      <Modal open={formOpen} onClose={() => { setCreating(false); setEditing(null); }}>
        <h3 style={{ marginBottom: 12 }}>{creating ? 'Nuevo miembro' : `Editar: ${editing?.full_name}`}</h3>

        <div className="field"><label>Nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del artista" />
        </div>

        <div className="field"><label>Rol</label>
          <div className="row">
            {['Artista', 'Admin'].map(r => (
              <button key={r} className={'btn' + (role === r ? ' primary' : '')} onClick={() => setRole(r)}>{r}</button>
            ))}
          </div>
        </div>

        <div className="field"><label>Color de acento</label>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {ACCENTS.map(a => (
              <button key={a} className={'btn sm' + (accent === a ? ' primary' : '')} onClick={() => setAccent(a)} style={{ textTransform: 'capitalize' }}>{a}</button>
            ))}
          </div>
        </div>

        <div className="card" style={{ background: 'var(--surface2)', marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><b>Protección con PIN</b><div style={{ fontSize: '.74rem', color: 'var(--muted)' }}>Pide un PIN al ficharse</div></div>
            <button className={'btn sm' + (pinEnabled ? ' ok' : '')} onClick={() => setPinEnabled(v => !v)}>{pinEnabled ? 'Activado' : 'Desactivado'}</button>
          </div>
          {pinEnabled && (
            <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
              <label>{creating ? 'PIN (4+ dígitos)' : 'Nuevo PIN (deja vacío para conservar el actual)'}</label>
              <input inputMode="numeric" maxLength={8} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
            </div>
          )}
        </div>

        {!creating && (
          <div className="card" style={{ background: 'var(--surface2)' }}>
            <b>Módulos visibles para este artista</b>
            <p style={{ fontSize: '.74rem', color: 'var(--muted)', margin: '2px 0 10px' }}>Apaga los que NO debe ver (ej. ocultar Barra de Color a la artista de uñas).</p>
            {MODULES.map(([key, label]) => {
              const isHidden = hidden.includes(key);
              return (
                <div key={key} className="comp-row" style={{ marginBottom: 6 }}>
                  <div className="cname">{label}</div>
                  <button className={'btn sm' + (isHidden ? '' : ' ok')} onClick={() => toggleModule(key)}>{isHidden ? 'Oculto' : 'Visible'}</button>
                </div>
              );
            })}
          </div>
        )}

        <button className="btn primary" style={{ width: '100%', marginTop: 6 }} onClick={save} disabled={busy}>
          {busy ? 'Guardando…' : creating ? 'Crear miembro' : 'Guardar cambios'}
        </button>
        <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => { setCreating(false); setEditing(null); }}>Cancelar</button>
      </Modal>
      <Toast msg={toast} />
    </Shell>
  );
}
