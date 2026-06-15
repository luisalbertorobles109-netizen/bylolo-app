import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Shell } from '../App';
import { Toast, useToast, Modal } from '../components/UI';

export default function Loyalty() {
  const [clients, setClients] = useState([]);
  const [cards, setCards] = useState({});
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [qr, setQr] = useState(null);
  const [toast, setToast] = useToast();
  const [busy, setBusy] = useState(false);

  function load() {
    Promise.all([
      supabase.from('clients').select('id, full_name, phone').order('full_name').limit(500),
      supabase.from('loyalty_cards').select('*'),
    ]).then(([c, lc]) => {
      setClients(c.data || []);
      const map = {};
      (lc.data || []).forEach(card => { map[card.client_id] = card; });
      setCards(map);
    });
  }
  useEffect(load, []);

  const filtered = clients.filter(c => (c.full_name || '').toLowerCase().includes(q.toLowerCase()));

  async function changeStamp(clientId, delta) {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('add_loyalty_stamp', {
      p_client_id: clientId, p_delta: delta, p_note: delta > 0 ? 'Estrella por servicio' : 'Ajuste manual',
    });
    setBusy(false);
    if (error) return setToast('⚠ ' + error.message);
    const row = data?.[0];
    if (row) {
      setCards(m => ({ ...m, [clientId]: { ...m[clientId], client_id: clientId, stamps_count: row.stamps, tier_name: row.tier_name, rewards_available: row.rewards_available } }));
      setToast(delta > 0 ? '⭐ Estrella agregada' : 'Estrella quitada');
    }
  }

  async function shareCard(client) {
    let card = cards[client.id];
    if (!card?.public_token) {
      // crear tarjeta para obtener token
      await supabase.rpc('add_loyalty_stamp', { p_client_id: client.id, p_delta: 0, p_note: 'Alta de tarjeta' });
      const { data } = await supabase.from('loyalty_cards').select('*').eq('client_id', client.id).single();
      card = data;
      setCards(m => ({ ...m, [client.id]: data }));
    }
    const url = `${window.location.origin}/tarjeta/${card.public_token}`;
    setQr({ client, url });
  }

  return (
    <Shell title="Lealtad" sub="Tarjetas digitales">
      <div className="screen" style={{ paddingBottom: 40 }}>
        <h2>Programa de lealtad</h2>
        <p className="lead">Una estrella por servicio. Comparte la tarjeta al cliente por QR o enlace.</p>
        <div className="field"><input placeholder="Buscar cliente…" value={q} onChange={e => setQ(e.target.value)} /></div>

        {filtered.slice(0, 80).map(c => {
          const card = cards[c.id] || { stamps_count: 0, tier_name: 'Plata', rewards_available: 0 };
          return (
            <div key={c.id} className="loyalty-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{c.full_name || 'Sin nombre'}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                  <span className={'tier ' + card.tier_name?.toLowerCase()}>{card.tier_name}</span>
                  {' '}⭐ {card.stamps_count}
                  {card.rewards_available > 0 && <b style={{ color: 'var(--ok)' }}> · {card.rewards_available} premio(s)</b>}
                </div>
              </div>
              <button className="btn sm" onClick={() => changeStamp(c.id, -1)} disabled={busy}>−</button>
              <button className="btn sm ok" onClick={() => changeStamp(c.id, 1)} disabled={busy}>＋⭐</button>
              <button className="btn sm" onClick={() => shareCard(c)}>QR</button>
            </div>
          );
        })}
      </div>

      <Modal open={!!qr} onClose={() => setQr(null)}>
        {qr && (
          <>
            <img src="/logo-marshmallow.png" alt="Marshmallow" style={{ width: 200, maxWidth: '70%', display: 'block', margin: '0 auto 12px', background: '#fff', borderRadius: 14, padding: '10px 14px' }} />
            <h3 style={{ marginBottom: 6, textAlign: 'center' }}>Tarjeta de {qr.client.full_name || 'Cliente'}</h3>
            <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginBottom: 14 }}>
              El cliente escanea este código para ver su tarjeta. Se actualiza sola cada que agregas una estrella.
            </p>
            <div style={{ background: '#fff', padding: 16, borderRadius: 16, display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <img alt="QR de la tarjeta" width="220" height="220"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qr.url)}`} />
            </div>
            <button className="btn" style={{ width: '100%', marginBottom: 8 }}
              onClick={() => { navigator.clipboard?.writeText(qr.url); setToast('🔗 Enlace copiado'); }}>
              Copiar enlace
            </button>
            {navigator.share && (
              <button className="btn primary" style={{ width: '100%', marginBottom: 8 }}
                onClick={() => navigator.share({ title: 'Tu tarjeta ByLolo', url: qr.url })}>
                Compartir por WhatsApp…
              </button>
            )}
            <button className="btn ghost" style={{ width: '100%' }} onClick={() => setQr(null)}>Cerrar</button>
          </>
        )}
      </Modal>
      <Toast msg={toast} />
    </Shell>
  );
}
