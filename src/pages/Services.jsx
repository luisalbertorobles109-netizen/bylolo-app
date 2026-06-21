import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../App';
import { Toast, useToast } from '../components/UI';
import { connectSkale } from '../lib/scale';
import { ProductPicker, CheckoutSummary, useSaleExtras, computeBreakdown, persistSaleProducts } from '../components/Checkout';

const CARD_FEE = 0.036;
const SERVICE_TYPES = [
  'Corte de pelo',
  'Tratamiento capilar',
  'Peinado',
  'Secado / Brushing',
  'Hidratación',
  'Otro servicio',
];
const TOL = 1.0; // tolerancia de gramos para marcar "en su punto"

export default function Services() {
  const { activeArtist } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [clients, setClients] = useState([]);
  const [client, setClient] = useState(null);
  const [q, setQ] = useState('');
  const [serviceType, setServiceType] = useState('Corte de pelo');
  const [customName, setCustomName] = useState('');
  const [price, setPrice] = useState('');
  const { products, setProducts, discountPct, setDiscountPct, payMethod, setPayMethod } = useSaleExtras();
  const [screen, setScreen] = useState(1);
  const [supplies, setSupplies] = useState([]);
  const [used, setUsed] = useState([]);          // [{product, grams, target}]
  const [showSupplies, setShowSupplies] = useState(false);
  const [supplyQ, setSupplyQ] = useState('');
  const [toast, setToast] = useToast();
  const [busy, setBusy] = useState(false);

  // ---- báscula ----
  const [weighIdx, setWeighIdx] = useState(null); // índice del insumo que se está pesando
  const [curGrams, setCurGrams] = useState(0);
  const [bleOn, setBleOn] = useState(false);
  const [diag, setDiag] = useState(false);
  const [diagLog, setDiagLog] = useState('');
  const bleRef = useRef(null);
  const simRef = useRef(0);
  const offsetRef = useRef(0);
  const lastRawRef = useRef(0);
  const pourRef = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    Promise.all([
      supabase.from('clients').select('id, full_name, phone').order('full_name').limit(500),
      supabase.from('products').select('*').eq('type', 'insumo').eq('status', 'Activo').order('name').limit(600),
    ]).then(([c, s]) => {
      setClients(c.data || []);
      setSupplies(s.data || []);
      const st = location.state;
      if (st?.clientId) {
        const f = (c.data || []).find(x => x.id === st.clientId);
        if (f) { setClient(f); setScreen(2); }
      }
    });
    return () => { try { bleRef.current?.disconnect(); } catch (e) {} cancelAnimationFrame(rafRef.current); };
  }, []);

  const filtered = clients.filter(c => (c.full_name || '').toLowerCase().includes(q.toLowerCase()));
  const filteredSupplies = supplies.filter(p =>
    [p.name, p.brand, p.gama].join(' ').toLowerCase().includes(supplyQ.toLowerCase()));
  const serviceName = serviceType === 'Otro servicio' ? (customName || 'Servicio') : serviceType;
  const insumosCost = used.reduce((a, u) => {
    const gpp = Number(u.product.gramos_por_pieza) || 0;
    const perGram = gpp > 0 ? Number(u.product.cost) / gpp : 0;
    return a + (Number(u.grams) || 0) * perGram;
  }, 0);
  // Sugerido: precio por gramo de insumos + precio de productos agregados
  const suggestedFromSupplies = used.reduce((a, u) => a + (Number(u.grams) || 0) * Number(u.product.price_per_gram || 0), 0);
  const suggestedProducts = products.reduce((a, p) => a + (p.gift ? 0 : Number(p.price || 0)), 0);
  const suggested = Math.round(suggestedFromSupplies + suggestedProducts);
  const serviceSubtotal = Number(price || 0);
  const b = computeBreakdown({ serviceSubtotal, products, discountPct, payMethod, suppliesCost: insumosCost });

  // ---- lógica de báscula ----
  function tare(silent) {
    offsetRef.current = lastRawRef.current; simRef.current = 0; setCurGrams(0);
    if (bleRef.current) bleRef.current.tare();
    if (!silent) setToast('Tara ✓');
  }
  async function connectScale() {
    try {
      const s = await connectSkale({
        onWeight: (raw) => { lastRawRef.current = raw; setCurGrams(Math.max(0, raw - offsetRef.current)); },
        onRaw: (hex) => setDiagLog(l => ('RX: ' + hex + '\n' + l).slice(0, 4000)),
        onDisconnect: () => { bleRef.current = null; setBleOn(false); },
      });
      bleRef.current = s; setBleOn(true); setToast('Báscula conectada ✓');
    } catch (err) { setToast('⚠ ' + err.message); setDiagLog(l => ('Error: ' + err.message + '\n' + l).slice(0, 4000)); }
  }
  // simulador (cuando no hay báscula física): mantén presionado "Verter"
  function pourLoop() {
    if (!pourRef.current) return;
    simRef.current = Math.max(0, simRef.current + 0.4 + Math.random() * 0.06);
    setCurGrams(simRef.current);
    rafRef.current = requestAnimationFrame(pourLoop);
  }
  const startPour = (e) => { e.preventDefault(); if (bleOn) return; pourRef.current = true; pourLoop(); };
  const stopPour = () => { pourRef.current = false; cancelAnimationFrame(rafRef.current); };

  function openWeigh(i) { setWeighIdx(i); setCurGrams(0); simRef.current = 0; tare(true); }
  function saveWeight() {
    setUsed(x => x.map((y, j) => j === weighIdx ? { ...y, grams: Math.round(curGrams * 10) / 10 } : y));
    setToast('Peso guardado: ' + (Math.round(curGrams * 10) / 10) + ' g');
    setWeighIdx(null);
  }

  async function charge() {
    if (!price || busy) return setToast('Pon el precio del servicio');
    setBusy(true);
    try {
      const { data: sale, error } = await supabase.from('sales').insert({
        user_id: activeArtist.id, client_id: client?.id || null,
        service_name: serviceName, service_price: serviceSubtotal,
        subtotal: b.beforeDiscount, total: b.total,
        payment_method: payMethod, financial_cost: Math.round(b.realCost),
        products_cost: Math.round(b.productsCost), supplies_cost: Math.round(insumosCost), card_cost: Math.round(b.cardCost),
        discount_pct: discountPct, gift_value: Math.round(b.giftValue), suggested_total: suggested,
        notes: 'Servicio',
      }).select().single();
      if (error) throw error;
      await supabase.from('sale_items').insert({
        sale_id: sale.id, item_type: 'servicio', name: serviceName,
        quantity: 1, unit_price: serviceSubtotal, total_price: serviceSubtotal,
      });
      await persistSaleProducts(sale.id, products, activeArtist.id);
      for (const u of used) {
        if (!u.grams || !u.product.gramos_por_pieza) continue;
        const pieces = Number(u.grams) / Number(u.product.gramos_por_pieza);
        const after = Math.max(0, Number(u.product.current_stock) - pieces);
        await supabase.from('products').update({ current_stock: after }).eq('id', u.product.id);
        await supabase.from('inventory_movements').insert({
          product_id: u.product.id, user_id: activeArtist.id, type: 'consumo_servicio',
          quantity_before: u.product.current_stock, quantity_after: after, grams: Number(u.grams),
          notes: `Servicio: ${serviceName}`,
        });
      }
      if (client) await supabase.rpc('add_loyalty_stamp', { p_client_id: client.id, p_delta: 1, p_note: serviceName });
      setToast(`✂️ Cobrado $${b.total.toLocaleString()}`);
      setTimeout(() => nav('/'), 1500);
    } catch (e) { setToast('⚠ ' + e.message); } finally { setBusy(false); }
  }

  // ---- pantalla de báscula (cuando se está pesando un insumo) ----
  if (weighIdx !== null) {
    const u = used[weighIdx];
    const near = curGrams > 0;
    return (
      <Shell title="Báscula" sub={u?.product?.name || 'Pesar insumo'}>
        <div className="screen" style={{ paddingBottom: 40, textAlign: 'center' }}>
          <h2>Pesar: {u?.product?.name}</h2>
          <p className="lead">Pon el recipiente, dale Tara, y vierte el producto. {bleOn ? 'Báscula conectada.' : 'Sin báscula: mantén presionado “Verter” para simular.'}</p>

          <div className="scale-readout">
            <span className="dot-live" style={{ background: bleOn ? '#46d39a' : '#888' }} />
            <div className="scale-grams num">{curGrams.toFixed(1)} <small>g</small></div>
          </div>

          <div className="row" style={{ justifyContent: 'center', marginBottom: 12 }}>
            {!bleOn && <button className="btn primary" style={{ minWidth: 160 }}
              onMouseDown={startPour} onMouseUp={stopPour} onMouseLeave={stopPour}
              onTouchStart={startPour} onTouchEnd={stopPour}>⬇ Mantén para verter</button>}
            <button className="btn" onClick={() => tare(false)}>Tara (poner en 0)</button>
          </div>

          {!bleOn && (
            <button className="btn ghost" style={{ width: '100%', marginBottom: 8 }} onClick={connectScale}>📲 Conectar SKALE 2</button>
          )}

          <button className="btn xl primary" style={{ width: '100%' }} onClick={saveWeight}>✓ Guardar {curGrams.toFixed(1)} g</button>
          <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setWeighIdx(null)}>Cancelar</button>

          <button className="btn ghost sm" style={{ width: '100%', marginTop: 14 }} onClick={() => setDiag(d => !d)}>Modo diagnóstico báscula</button>
          {diag && <div className="diaglog">{diagLog || 'Esperando datos de la báscula…'}</div>}
        </div>
        <Toast msg={toast} />
      </Shell>
    );
  }

  return (
    <Shell title="Servicios" sub={client ? `Cliente: ${client.full_name || 'Sin nombre'}` : 'Corte, tratamiento y más'}>
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
          <h2>Servicio</h2>
          <p className="lead">Elige el tipo de servicio y cóbralo.</p>

          <div className="card">
            <div className="field"><label>Tipo de servicio</label>
              <div className="pill-grid">
                {SERVICE_TYPES.map(s => (
                  <button key={s} className={'pill' + (serviceType === s ? ' sel' : '')} onClick={() => setServiceType(s)}>{s}</button>
                ))}
              </div>
            </div>
            {serviceType === 'Otro servicio' && (
              <div className="field"><label>Nombre del servicio</label>
                <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Escribe el servicio" />
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h3 style={{ fontSize: '1rem' }}>Mezcla del tratamiento (opcional)</h3>
              <button className="btn sm" onClick={() => setShowSupplies(s => !s)}>{showSupplies ? 'Cerrar' : '＋ Agregar'}</button>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '.8rem', margin: '0 0 8px' }}>
              Agrega los insumos de la mezcla y pésalos con la báscula. Los gramos se descuentan del inventario como costo.
            </p>
            {showSupplies && (
              <div style={{ marginBottom: 10 }}>
                <div className="field"><input placeholder="Buscar insumo…" value={supplyQ} onChange={e => setSupplyQ(e.target.value)} /></div>
                <div style={{ maxHeight: 160, overflow: 'auto' }}>
                  {filteredSupplies.slice(0, 40).map(p => (
                    <button key={p.id} className="pill" style={{ width: '100%', textAlign: 'left', marginBottom: 4 }}
                      onClick={() => { setUsed(u => [...u, { product: p, grams: 0 }]); setShowSupplies(false); setSupplyQ(''); }}>
                      ＋ {p.name} <span style={{ color: 'var(--muted)' }}>· {p.brand} {p.gama || ''}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {used.map((u, i) => (
              <div key={i} className="comp-row">
                <div className="cname">{u.product.name}
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{u.grams ? `${u.grams} g` : 'sin pesar'}</div>
                </div>
                <button className="btn sm primary" onClick={() => openWeigh(i)}>⚖ Pesar</button>
                <button className="btn ghost sm" onClick={() => setUsed(x => x.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
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
            payMethod={payMethod} setPayMethod={setPayMethod}
            suppliesCost={insumosCost} suggested={suggested} />

          <button className="btn xl primary" style={{ width: '100%' }} onClick={charge} disabled={busy}>
            {busy ? 'Cobrando…' : `✂️ Cobrar $${b.total.toLocaleString()}`}
          </button>
        </div>
      )}
      <Toast msg={toast} />
    </Shell>
  );
}
