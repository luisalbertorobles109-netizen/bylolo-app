import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Shell } from '../App';
import { Toast, useToast } from '../components/UI';

const ACCENTS = [
  { id: 'violeta', g: 'linear-gradient(135deg,#c84bd8,#7b5cff)' },
  { id: 'rosa', g: 'linear-gradient(135deg,#e0489a,#b14bd8)' },
  { id: 'esmeralda', g: 'linear-gradient(135deg,#16a37a,#0e7fa8)' },
  { id: 'azul', g: 'linear-gradient(135deg,#3b82f6,#7b5cff)' },
];
const TOGGLEABLE_MODULES = ['Pestañas', 'Uñas', 'Venta sin cita', 'Lealtad', 'Finanzas'];

export default function Settings() {
  const { profile, updatePrefs, isAdmin } = useAuth();
  const theme = profile?.theme || 'oscuro';
  const accent = profile?.accent || 'violeta';
  const [toast, setToast] = useToast();
  const [settings, setSettings] = useState(null);
  const [recentSales, setRecentSales] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('salon_settings').select('*').eq('id', 1).single().then(({ data }) => setSettings(data));
    loadSales();
  }, [isAdmin]);

  function loadSales() {
    supabase.from('sales').select('id, created_at, service_name, total, payment_method')
      .order('created_at', { ascending: false }).limit(15).then(({ data }) => setRecentSales(data || []));
  }

  async function saveSettings(patch) {
    const next = { ...settings, ...patch };
    setSettings(next);
    await supabase.from('salon_settings').update(patch).eq('id', 1);
    setToast('✓ Guardado');
  }
  function toggleModule(mod) {
    const hidden = settings.hidden_modules || [];
    const next = hidden.includes(mod) ? hidden.filter(m => m !== mod) : [...hidden, mod];
    saveSettings({ hidden_modules: next });
  }
  async function deleteSale(id) {
    if (!confirm('¿Borrar este cobro de prueba? No se puede deshacer.')) return;
    const { error } = await supabase.rpc('admin_delete_sale', { p_sale_id: id });
    if (error) return setToast('⚠ ' + error.message);
    setToast('🗑 Cobro borrado'); loadSales();
  }
  function setTierStars(idx, val) {
    const tiers = [...(settings.loyalty_tiers || [])];
    tiers[idx] = { ...tiers[idx], min_stars: Number(val) };
    saveSettings({ loyalty_tiers: tiers });
  }
  function setReward(field, val) {
    const rewards = [...(settings.loyalty_rewards || [{ every_stars: 10, reward: '' }])];
    rewards[0] = { ...rewards[0], [field]: field === 'every_stars' ? Number(val) : val };
    saveSettings({ loyalty_rewards: rewards });
  }

  return (
    <Shell title="Ajustes" sub={isAdmin ? 'Apariencia y administración' : 'Apariencia por artista'}>
      <div className="screen" style={{ paddingBottom: 40 }}>
        <h2>Apariencia</h2>
        <p className="lead">Tu elección se guarda en tu perfil y te sigue en cualquier dispositivo.</p>
        <div className="card">
          <div className="field"><label>Modo</label>
            <div className="theme-sw">
              <button className={'theme-opt' + (theme === 'oscuro' ? ' sel' : '')} onClick={() => updatePrefs('oscuro', accent)}>🌙 Oscuro</button>
              <button className={'theme-opt' + (theme === 'claro' ? ' sel' : '')} onClick={() => updatePrefs('claro', accent)}>☀️ Claro</button>
            </div>
          </div>
          <div className="field"><label>Color de acento</label>
            <div className="theme-sw">
              {ACCENTS.map(a => (
                <button key={a.id} className={'theme-opt' + (accent === a.id ? ' sel' : '')} onClick={() => updatePrefs(theme, a.id)}>
                  <span className="accent-dot" style={{ background: a.g }} />{a.id}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: '1rem', marginBottom: 6 }}>Mi perfil</h3>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem', margin: 0 }}>
            {profile?.full_name} · rol: <b>{profile?.role}</b>
          </p>
        </div>

        {isAdmin && settings && (
          <>
            <h2 style={{ marginTop: 26 }}>Administración</h2>
            <p className="lead">Solo tú (Administrador) ves esta sección.</p>

            <div className="card">
              <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>Módulos visibles</h3>
              <p style={{ color: 'var(--muted)', fontSize: '.82rem', margin: '0 0 10px' }}>Apaga los módulos que no quieras mostrar en el tablero.</p>
              {TOGGLEABLE_MODULES.map(m => {
                const hidden = (settings.hidden_modules || []).includes(m);
                return (
                  <div key={m} className="comp-row">
                    <div className="cname">{m}</div>
                    <button className={'btn sm' + (hidden ? '' : ' ok')} onClick={() => toggleModule(m)}>
                      {hidden ? 'Oculto' : 'Visible'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="card">
              <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>Programa de lealtad</h3>
              <p style={{ color: 'var(--muted)', fontSize: '.82rem', margin: '0 0 10px' }}>Niveles y recompensa. Sube de nivel al acumular estrellas.</p>
              {(settings.loyalty_tiers || []).map((t, i) => (
                <div key={i} className="comp-row">
                  <div className="cname"><span className={'tier ' + t.name.toLowerCase()}>{t.name}</span></div>
                  <span style={{ color: 'var(--muted)', fontSize: '.82rem' }}>desde</span>
                  <input className="num" style={{ width: 64, minHeight: 44, textAlign: 'center', background: 'var(--surface2)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--text)' }}
                    value={t.min_stars} onChange={e => setTierStars(i, e.target.value)} inputMode="numeric" />
                  <span style={{ color: 'var(--muted)', fontSize: '.82rem' }}>⭐</span>
                </div>
              ))}
              <div className="field" style={{ marginTop: 12 }}>
                <label>Recompensa: cada cuántas estrellas</label>
                <input type="number" inputMode="numeric" value={settings.loyalty_rewards?.[0]?.every_stars || 10}
                  onChange={e => setReward('every_stars', e.target.value)} />
              </div>
              <div className="field">
                <label>¿Qué obtiene? (descuento o servicio gratis)</label>
                <input value={settings.loyalty_rewards?.[0]?.reward || ''} placeholder="Ej. 10% de descuento o corte gratis"
                  onChange={e => setReward('reward', e.target.value)} />
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>Borrar cobros de prueba</h3>
              <p style={{ color: 'var(--muted)', fontSize: '.82rem', margin: '0 0 10px' }}>Últimos 15 cobros. Útil para limpiar pruebas.</p>
              {recentSales.length === 0 && <p style={{ color: 'var(--muted)' }}>Sin cobros registrados.</p>}
              {recentSales.map(s => (
                <div key={s.id} className="comp-row">
                  <div className="cname">{s.service_name || 'Venta'}
                    <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                      {new Date(s.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${Number(s.total)} · {s.payment_method}
                    </div>
                  </div>
                  <button className="btn sm danger" onClick={() => deleteSale(s.id)}>🗑</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <Toast msg={toast} />
    </Shell>
  );
}
