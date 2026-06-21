import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../App';
import { Toast, useToast } from '../components/UI';
import { ProductPicker, CheckoutSummary, useSaleExtras, computeBreakdown, persistSaleProducts } from '../components/Checkout';

const BRANDS = ['Organic', 'Otro'];
const CARD_FEE = 0.036;

export default function NailBar() {
  const { activeArtist } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [clients, setClients] = useState([]);
  const [client, setClient] = useState(null);
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState('Organic');
  const [size, setSize] = useState(4);
  const [design, setDesign] = useState('Sencillo');
  const [price, setPrice] = useState('');
  const { products, setProducts, discountPct, setDiscountPct, payMethod, setPayMethod } = useSaleExtras();
  const [screen, setScreen] = useState(1);
  const [toast, setToast] = useToast();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('clients').select('id, full_name, phone').order('full_name').limit(500)
      .then(({ data }) => {
        setClients(data || []);
        const st = location.state;
        if (st?.clientId) {
          const f = (data || []).find(x => x.id === st.clientId);
          if (f) { setClient(f); setScreen(2); }
        }
      });
  }, []);

  const filtered = clients.filter(c => (c.full_name || '').toLowerCase().includes(q.toLowerCase()));
  const serviceSubtotal = Number(price || 0);
  const b = computeBreakdown({ serviceSubtotal, products, discountPct, payMethod, suppliesCost: 0 });

  async function charge() {
    if (!price || busy) return setToast('Pon el precio del servicio');
    setBusy(true);
    try {
      const { data: sale, error } = await supabase.from('sales').insert({
        user_id: activeArtist.id, client_id: client?.id || null,
        service_name: `Uñas ${design} · ${brand} · tamaño ${size}`,
        service_price: serviceSubtotal, subtotal: b.beforeDiscount, total: b.total,
        payment_method: payMethod,
        financial_cost: Math.round(b.realCost),
        products_cost: Math.round(b.productsCost), supplies_cost: 0, card_cost: Math.round(b.cardCost),
        discount_pct: discountPct, gift_value: Math.round(b.giftValue),
        notes: 'Barra de Uñas',
      }).select().single();
      if (error) throw error;
      await supabase.from('nail_jobs').insert({
        client_id: client?.id || null, artist_id: activeArtist.id, sale_id: sale.id,
        brand, nail_size: size, design_type: design, price: serviceSubtotal,
      });
      await persistSaleProducts(sale.id, products, activeArtist.id);
      if (client) await supabase.rpc('add_loyalty_stamp', { p_client_id: client.id, p_delta: 1, p_note: 'Servicio de uñas' });
      setToast(`💅 Cobrado $${b.total.toLocaleString()}`);
      setTimeout(() => nav('/'), 1500);
    } catch (e) { setToast('⚠ ' + e.message); } finally { setBusy(false); }
  }

  return (
    <Shell title="Barra de Uñas" sub={client ? `Cliente: ${client.full_name || 'Sin nombre'}` : 'Sin cliente'}>
      {screen === 1 && (
        <div className="screen" style={{ paddingBottom: 40 }}>
          <h2>¿A quién atendemos?</h2>
          <p className="lead">Elige al cliente (o continúa sin cliente para una venta rápida).</p>
          <div className="field"><input placeholder="Buscar cliente…" value={q} onChange={e => setQ(e.target.value)} /></div>
          {filtered.slice(0, 50).map(c => (
            <button key={c.id} className="list-item" onClick={() => { setClient(c); setScreen(2); }}>
              <div className="avatar">{(c.full_name || '?').split(' ').map(p => p[0]).slice(0, 2).join('')}</div>
              <div className="meta"><div className="name">{c.full_name || 'Sin nombre'}</div>
                <div className="sub">{c.phone || ''}</div></div>
            </button>
          ))}
          <button className="btn ghost" style={{ width: '100%' }} onClick={() => { setClient(null); setScreen(2); }}>Continuar sin cliente →</button>
        </div>
      )}

      {screen === 2 && (
        <div className="screen" style={{ paddingBottom: 40 }}>
          <h2>Diseño de uñas</h2>
          <p className="lead">Configura el trabajo. El inventario por marca se conectará cuando lo subas.</p>

          <div className="card">
            <div className="field"><label>Marca</label>
              <div className="pill-grid">
                {BRANDS.map(b => <button key={b} className={'pill' + (brand === b ? ' sel' : '')} onClick={() => setBrand(b)}>{b}</button>)}
              </div>
            </div>
            <div className="field"><label>Tamaño de uña</label>
              <div className="pill-grid">
                {[1, 2, 3, 4, 5, 6, 7].map(n => (
                  <button key={n} className={'pill' + (size === n ? ' sel' : '')} onClick={() => setSize(n)} style={{ minWidth: 56 }}>{n}</button>
                ))}
              </div>
            </div>
            <div className="field"><label>Tipo de diseño</label>
              <div className="row">
                {['Sencillo', 'Plus'].map(d => (
                  <button key={d} className={'btn' + (design === d ? ' primary' : '')} onClick={() => setDesign(d)}>{d}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: 10 }}>Precio del servicio</h3>
            <div className="field"><label>Precio al cliente</label>
              <input type="number" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="$" />
            </div>
          </div>

          <ProductPicker products={products} setProducts={setProducts} />

          <CheckoutSummary
            serviceSubtotal={serviceSubtotal} products={products}
            discountPct={discountPct} setDiscountPct={setDiscountPct}
            payMethod={payMethod} setPayMethod={setPayMethod} suppliesCost={0} />

          <button className="btn xl primary" style={{ width: '100%' }} onClick={charge} disabled={busy}>
            {busy ? 'Cobrando…' : `💅 Cobrar $${b.total.toLocaleString()}`}
          </button>
        </div>
      )}
      <Toast msg={toast} />
    </Shell>
  );
}
