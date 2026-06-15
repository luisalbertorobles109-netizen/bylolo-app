import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../App';
import { Modal, Toast, useToast } from '../components/UI';

export default function Clients() {
  const nav = useNavigate();
  const { session } = useAuth();
  const [clients, setClients] = useState([]);
  const [tagsCat, setTagsCat] = useState([]);
  const [q, setQ] = useState('');
  const [openNew, setOpenNew] = useState(false);
  const [hist, setHist] = useState(null); // {client, jobs}
  const [toast, setToast] = useToast();
  const [form, setForm] = useState({ name: '', phone: '', bday: '', tags: [] });
  const [newTag, setNewTag] = useState('');

  async function load() {
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false }).limit(300);
    setClients(data || []);
  }
  useEffect(() => {
    load();
    supabase.from('client_tags_catalog').select('name').eq('active', true).then(({ data }) => setTagsCat((data || []).map(t => t.name)));
  }, []);

  async function openHistory(c) {
    const { data: jobs } = await supabase.from('color_jobs')
      .select('id, created_at, base_level, status, notes, color_job_steps(step_number, brand, is_custom, pose_minutes, color_step_components(name, component_type, peroxide_vol, actual_g, target_g))')
      .eq('client_id', c.id).order('created_at', { ascending: false });
    setHist({ client: c, jobs: jobs || [] });
  }

  async function saveClient() {
    const payload = {
      full_name: form.name.trim() || ('Cliente ' + new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })),
      phone: form.phone.trim() || null,
      birthday: form.bday || null,
      tags: form.tags,
      artist_id: session.user.id,
    };
    const { error } = await supabase.from('clients').insert(payload);
    if (error) return setToast('⚠ ' + error.message);
    setToast('✓ Cliente guardado');
    setOpenNew(false); setForm({ name: '', phone: '', bday: '', tags: [] });
    load();
  }

  const filtered = clients.filter(c => (c.full_name || '').toLowerCase().includes(q.toLowerCase()) || (c.phone || '').includes(q));

  return (
    <Shell title="Clientes" sub={`${clients.length} registrados`}>
      <div className="screen" style={{ paddingBottom: 40 }}>
        <h2>Clientes</h2>
        <p className="lead">Toca un cliente para ver su historial capilar.</p>
        <div className="field"><input placeholder="Buscar por nombre o teléfono…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <button className="btn primary" style={{ width: '100%', marginBottom: 14 }} onClick={() => setOpenNew(true)}>＋ Cliente nuevo</button>
        {filtered.map(c => (
          <button key={c.id} className="list-item" onClick={() => openHistory(c)}>
            <div className="avatar">{(c.full_name || '?').split(' ').map(p => p[0]).slice(0, 2).join('')}</div>
            <div className="meta">
              <div className="name">{c.full_name || 'Sin nombre'}</div>
              <div className="sub">{c.phone || 'sin teléfono'}{(c.tags || []).length > 0 && <> · {(c.tags || []).map(t => <span key={t} className="tag" style={{ marginRight: 4 }}>{t}</span>)}</>}</div>
            </div>
            <span className="tag pig">Historial</span>
          </button>
        ))}

        <Modal open={openNew} onClose={() => setOpenNew(false)}>
          <h3 style={{ marginBottom: 6 }}>Cliente nuevo</h3>
          <p style={{ color: 'var(--muted)', fontSize: '.85rem', margin: '0 0 14px' }}>Todos los campos son opcionales.</p>
          <div className="field"><label>Nombre</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Opcional" /></div>
          <div className="field"><label>Teléfono</label><input inputMode="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Opcional" /></div>
          <div className="field"><label>Cumpleaños</label><input type="date" value={form.bday} onChange={e => setForm({ ...form, bday: e.target.value })} /></div>
          <div className="field"><label>Servicios de interés</label>
            <div className="pill-grid">
              {tagsCat.map(t => (
                <button key={t} className={'pill' + (form.tags.includes(t) ? ' sel' : '')}
                  onClick={() => setForm(f => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t] }))}>{t}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ flex: 1, minHeight: 52, background: 'var(--surface2)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)', padding: '0 14px' }}
                placeholder="Nueva etiqueta…" value={newTag} onChange={e => setNewTag(e.target.value)} />
              <button className="btn sm" onClick={async () => {
                const v = newTag.trim(); if (!v) return;
                await supabase.from('client_tags_catalog').insert({ name: v }).then(() => {});
                if (!tagsCat.includes(v)) setTagsCat(t => [...t, v]);
                setForm(f => ({ ...f, tags: [...f.tags, v] })); setNewTag('');
              }}>＋</button>
            </div>
          </div>
          <button className="btn primary" style={{ width: '100%' }} onClick={saveClient}>Guardar cliente</button>
          <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setOpenNew(false)}>Cancelar</button>
        </Modal>

        <Modal open={!!hist} onClose={() => setHist(null)}>
          {hist && <>
            <h3 style={{ marginBottom: 12 }}>Historial capilar · {hist.client.full_name || 'Sin nombre'}</h3>
            {hist.jobs.length === 0 && <p style={{ color: 'var(--muted)' }}>Sin trabajos registrados todavía.</p>}
            {hist.jobs.map(j => (
              <div key={j.id} className="hist-item">
                <div className="hdate">{new Date(j.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })} · base nivel {j.base_level}</div>
                {(j.color_job_steps || []).sort((a, b) => a.step_number - b.step_number).map((s, i) => (
                  <div key={i} className="hformula">
                    Paso {s.step_number} ({s.brand}{s.is_custom ? ' · personalizada' : ''}{s.pose_minutes ? ` · pose ${s.pose_minutes} min` : ''}):{' '}
                    {(s.color_step_components || []).map(c => `${Number(c.actual_g || c.target_g).toFixed(0)}g ${c.name}${c.peroxide_vol ? ` (${c.peroxide_vol} vol)` : ''}`).join(' + ')}
                  </div>
                ))}
                {j.notes && <div className="hnotes">{j.notes}</div>}
              </div>
            ))}
            <button className="btn primary" style={{ width: '100%', marginTop: 10 }}
              onClick={() => nav('/color', { state: { clientId: hist.client.id } })}>Formular para este cliente →</button>
            <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setHist(null)}>Cerrar</button>
          </>}
        </Modal>
        <Toast msg={toast} />
      </div>
    </Shell>
  );
}
