import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../App';
import { Toast, useToast } from '../components/UI';
import { useScale } from '../context/ScaleContext';
import { toneColor } from '../lib/colorRules';
import DropGauge from '../components/DropGauge';
import { ProductPicker, CheckoutSummary, useSaleExtras, computeBreakdown, persistSaleProducts, persistBaseService } from '../components/Checkout';

const CARD_FEE = 0.036;
const SERVICE_TYPES = ['Corte de pelo', 'Tratamiento', 'Peinado', 'Otro servicio'];

export default function Services() {
  const { activeArtist } = useAuth();
  const scale = useScale();
  const nav = useNavigate();
  const location = useLocation();
  const [clients, setClients] = useState([]);
  const [client, setClient] = useState(null);
  const [q, setQ] = useState('');
  const [serviceType, setServiceType] = useState('Corte de pelo');
  const [treatmentMode, setTreatmentMode] = useState(null);      // 'Alisado' | 'Otro'
  const [treatmentOtherMode, setTreatmentOtherMode] = useState(null); // 'Tratamiento' | 'Color'
  const [colorBrand, setColorBrand] = useState('');
  const [customName, setCustomName] = useState('');
  const [price, setPrice] = useState('');
  const { products, setProducts, discountPct, setDiscountPct, payMethod, setPayMethod, serviceMode, setServiceMode, baseServiceMode, setBaseServiceMode } = useSaleExtras();
  const [screen, setScreen] = useState(1);
  const [supplies, setSupplies] = useState([]);
  const [used, setUsed] = useState([]);          // [{product, grams}]
  const [showSupplies, setShowSupplies] = useState(false);
  const [supplyQ, setSupplyQ] = useState('');
  const [toast, setToast] = useToast();
  const [busy, setBusy] = useState(false);

  // ---- báscula ----
  const [weighIdx, setWeighIdx] = useState(null);
  const [curGrams, setCurGrams] = useState(0);
  const bleOn = scale.connected;
  const [diag, setDiag] = useState(false);
  const [diagLog, setDiagLog] = useState('');
  const simRef = useRef(0);
  const pourRef = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    Promise.all([
      supabase.from('clients').select('id, full_name, phone').order('full_name').limit(500),
      supabase.from('products').select('*').eq('type', 'insumo').eq('status', 'Activo').order('name').limit(800),
    ]).then(([c, s]) => {
      setClients(c.data || []);
      setSupplies(s.data || []);
      const st = location.state;
      if (st?.clientId) {
        const f = (c.data || []).find(x => x.id === st.clientId);
        if (f) { setClient(f); setScreen(2); }
      }
    });
    return () => { cancelAnimationFrame(rafRef.current); };
  }, []);

  // Al cambiar el tipo de servicio, reinicia submodos e insumos
  function pickServiceType(s) {
    setServiceType(s); setTreatmentMode(null); setTreatmentOtherMode(null); setUsed([]); setShowSupplies(false);
  }

  // ---- Contexto de la "mezcla" según el tipo de servicio ----
  // Devuelve { mode:'insumos', classes:[...] } | { mode:'color' } | null (sin mezcla)
  function supplyContext() {
    if (serviceType === 'Corte de pelo' || serviceType === 'Peinado')
      return { mode: 'insumos', classes: ['Tratamiento', 'Estilizado'], label: 'Productos usados (opcional)' };
    if (serviceType === 'Tratamiento') {
      if (treatmentMode === 'Alisado') return { mode: 'insumos', classes: ['Alisado'], label: 'Insumos de Alisado' };
      if (treatmentMode === 'Otro') {
        if (treatmentOtherMode === 'Tratamiento') return { mode: 'insumos', classes: ['Tratamiento'], label: 'Insumos de Tratamiento' };
        if (treatmentOtherMode === 'Color') return { mode: 'color', label: 'Color a utilizar' };
      }
    }
    return null;
  }
  const ctx = supplyContext();

  const filtered = clients.filter(c => (c.full_name || '').toLowerCase().includes(q.toLowerCase()));
  const matchQ = p => [p.name, p.brand, p.gama].join(' ').toLowerCase().includes(supplyQ.toLowerCase());
  const insumosForCtx = ctx?.mode === 'insumos'
    ? supplies.filter(p => ctx.classes.includes(p.class) && matchQ(p)) : [];

  // ---- Color (submodo) ----
  const tintes = supplies.filter(p => p.class === 'Tinte');
  const tinteBrands = [...new Set(tintes.map(t => t.brand).filter(Boolean))];
  const peroxidos = supplies.filter(p => p.class === 'Peroxido');
  const tintesOfBrand = tintes.filter(t => t.brand === colorBrand && matchQ(t));

  function addUsed(p) {
    if (used.some(u => u.product.id === p.id)) return setToast('Ya está agregado');
    setUsed(u => [...u, { product: p, grams: 0 }]);
    setShowSupplies(false); setSupplyQ('');
  }

  // ---- nombre del servicio ----
  let serviceName = serviceType;
  if (serviceType === 'Otro servicio') serviceName = customName || 'Servicio';
  else if (serviceType === 'Tratamiento') {
    if (treatmentMode === 'Alisado') serviceName = 'Alisado';
    else if (treatmentMode === 'Otro' && treatmentOtherMode === 'Tratamiento') serviceName = 'Tratamiento';
    else if (treatmentMode === 'Otro' && treatmentOtherMode === 'Color') serviceName = 'Tratamiento de color';
    else serviceName = 'Tratamiento';
  }

  const insumosCost = used.reduce((a, u) => {
    const gpp = Number(u.product.gramos_por_pieza) || 0;
    const perGram = gpp > 0 ? Number(u.product.cost) / gpp : 0;
    return a + (Number(u.grams) || 0) * perGram;
  }, 0);
  const suggestedFromSupplies = used.reduce((a, u) => a + (Number(u.grams) || 0) * Number(u.product.price_per_gram || 0), 0);
  const suggestedProducts = products.reduce((a, p) => a + (p.gift ? 0 : Number(p.price || 0)), 0);
  const suggested = Math.round(suggestedFromSupplies + suggestedProducts);
  const serviceSubtotal = Number(price || 0);
  const baseService = supplies.find(p => (p.name || '').trim().toLowerCase() === 'servicio');
  const baseServiceCost = baseService ? Number(baseService.cost) : 0;
  const b = computeBreakdown({ serviceSubtotal, serviceMode, products, discountPct, payMethod, suppliesCost: insumosCost, baseServiceCost, baseServiceMode });

  // ---- báscula ----
  function tare(silent) {
    simRef.current = 0; setCurGrams(0);
    if (scale.connected) scale.tare();
    if (!silent) setToast('Tara ✓');
  }
  async function connectScale() {
    try {
      await scale.connect(); setToast('Báscula conectada ✓');
    } catch (err) { setToast('⚠ ' + err.message); }
  }
  function pourLoop() {
    if (!pourRef.current) return;
    simRef.current = Math.max(0, simRef.current + 0.4 + Math.random() * 0.06);
    setCurGrams(simRef.current);
    rafRef.current = requestAnimationFrame(pourLoop);
  }
  const startPour = (e) => { e.preventDefault(); if (bleOn) return; pourRef.current = true; pourLoop(); };
  const stopPour = () => { pourRef.current = false; cancelAnimationFrame(rafRef.current); };
  function openWeigh(i) { setWeighIdx(i); setCurGrams(0); simRef.current = 0; tare(true); }
  // Lectura en vivo de la báscula global mientras se pesa un insumo (por suscripción)
  useEffect(() => {
    if (weighIdx === null || !scale?.subscribe) return undefined;
    setCurGrams(scale.getGrams ? scale.getGrams() : 0);
    return scale.subscribe(setCurGrams);
  }, [weighIdx, scale]);
  function saveWeight() {
    setUsed(x => x.map((y, j) => j === weighIdx ? { ...y, grams: Math.round(curGrams * 10) / 10 } : y));
    setToast('Peso guardado: ' + (Math.round(curGrams * 10) / 10) + ' g');
    setWeighIdx(null);
  }

  async function charge() {
    if (busy) return;
    if (serviceMode === 'charge' && !price && !products.length) return setToast('Pon el precio del servicio o agrega productos');
    setBusy(true);
    try {
      const { data: sale, error } = await supabase.from('sales').insert({
        user_id: activeArtist.id, client_id: client?.id || null,
        service_name: serviceName, service_price: b.effectiveService,
        subtotal: b.beforeDiscount, total: b.total,
        payment_method: payMethod, financial_cost: Math.round(b.realCost),
        products_cost: Math.round(b.productsCost), supplies_cost: Math.round(insumosCost + b.effectiveBaseCost), card_cost: Math.round(b.cardCost),
        discount_pct: discountPct, gift_value: Math.round(b.giftValue), suggested_total: suggested,
        notes: 'Servicio',
      }).select().single();
      if (error) throw error;
      await supabase.from('sale_items').insert({
        sale_id: sale.id, item_type: 'servicio', name: serviceName,
        quantity: 1, unit_price: serviceSubtotal, total_price: serviceSubtotal,
      });
      await persistSaleProducts(sale.id, products, activeArtist.id);
      await persistBaseService(sale.id, baseService, baseServiceMode, activeArtist.id);
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

  // ---- pantalla de báscula ----
  if (weighIdx !== null) {
    const u = used[weighIdx];
    const cls = (u?.product?.class || '').toLowerCase();
    const dropColor = cls === 'tinte' ? toneColor(u.product.name, u.product.gama)
      : cls === 'peroxido' ? '#f2b33d'
      : cls === 'decolorante' ? '#ece2c6'
      : (cls === 'aditivo' || cls === 'reforzador') ? '#cfd6f5'
      : '#5ec8b0';
    return (
      <Shell title="Báscula" sub={u?.product?.name || 'Pesar insumo'}>
        <div className="screen" style={{ paddingBottom: 40, textAlign: 'center' }}>
          <h2>Pesar: {u?.product?.name}</h2>
          <p className="lead">Pon el recipiente, dale Tara, y vierte el producto. {bleOn ? 'Báscula conectada.' : 'Sin báscula: mantén presionado “Verter” para simular.'}</p>

          <div className="card scale-wrap">
            <div className="scale-status">
              <span className={'dot-live' + (bleOn ? ' on' : '')} />
              <span>{bleOn ? 'SKALE 2 conectada · lectura en vivo' : 'Báscula no conectada · usando simulador'}</span>
            </div>
            <DropGauge grams={curGrams} color={dropColor} />
            <div className="gram-counter num">{curGrams.toFixed(1)}<small> g</small></div>
          </div>

          <div className="row" style={{ justifyContent: 'center', marginBottom: 12 }}>
            {!bleOn && <button className="btn primary" style={{ minWidth: 160 }}
              onMouseDown={startPour} onMouseUp={stopPour} onMouseLeave={stopPour}
              onTouchStart={startPour} onTouchEnd={stopPour}>⬇ Mantén para verter</button>}
            <button className="btn" onClick={() => tare(false)}>Tara (poner en 0)</button>
          </div>
          {!bleOn && <button className="btn ghost" style={{ width: '100%', marginBottom: 8 }} onClick={connectScale}>📲 Conectar SKALE 2</button>}
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
                  <button key={s} className={'pill' + (serviceType === s ? ' sel' : '')} onClick={() => pickServiceType(s)}>{s}</button>
                ))}
              </div>
            </div>

            {/* Submenú de Tratamiento */}
            {serviceType === 'Tratamiento' && (
              <div className="field"><label>Tipo de tratamiento</label>
                <div className="pill-grid">
                  {['Alisado', 'Otro'].map(m => (
                    <button key={m} className={'pill' + (treatmentMode === m ? ' sel' : '')}
                      onClick={() => { setTreatmentMode(m); setTreatmentOtherMode(null); setUsed([]); }}>{m}</button>
                  ))}
                </div>
              </div>
            )}
            {/* Submenú de Tratamiento > Otro */}
            {serviceType === 'Tratamiento' && treatmentMode === 'Otro' && (
              <div className="field"><label>¿Qué tipo?</label>
                <div className="pill-grid">
                  {['Tratamiento', 'Color'].map(m => (
                    <button key={m} className={'pill' + (treatmentOtherMode === m ? ' sel' : '')}
                      onClick={() => { setTreatmentOtherMode(m); setUsed([]); }}>{m}</button>
                  ))}
                </div>
              </div>
            )}

            {serviceType === 'Otro servicio' && (
              <div className="field"><label>Nombre del servicio</label>
                <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Escribe el servicio" />
              </div>
            )}
          </div>

          {/* ---- Mezcla / insumos (según contexto) ---- */}
          {ctx?.mode === 'insumos' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <h3 style={{ fontSize: '1rem' }}>{ctx.label}</h3>
                <button className="btn sm" onClick={() => setShowSupplies(s => !s)}>{showSupplies ? 'Cerrar' : '＋ Agregar'}</button>
              </div>
              <p style={{ color: 'var(--muted)', fontSize: '.8rem', margin: '0 0 8px' }}>
                Agrega y pesa con la báscula. Los gramos se descuentan del inventario como costo.
              </p>
              {showSupplies && (
                <div style={{ marginBottom: 10 }}>
                  <div className="field"><input placeholder="Buscar insumo…" value={supplyQ} onChange={e => setSupplyQ(e.target.value)} /></div>
                  <div style={{ maxHeight: 200, overflow: 'auto' }}>
                    {insumosForCtx.slice(0, 60).map(p => (
                      <button key={p.id} className="pill" style={{ width: '100%', textAlign: 'left', marginBottom: 4 }} onClick={() => addUsed(p)}>
                        ＋ {p.name} <span style={{ color: 'var(--muted)' }}>· {p.brand} {p.gama || ''}</span>
                      </button>
                    ))}
                    {insumosForCtx.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '.82rem' }}>No hay insumos de {ctx.classes.join(' / ')} en tu inventario.</p>}
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
          )}

          {/* ---- Color (submodo Tratamiento > Otro > Color) ---- */}
          {ctx?.mode === 'color' && (
            <div className="card">
              <h3 style={{ fontSize: '1rem', marginBottom: 6 }}>Color a utilizar</h3>
              <p style={{ color: 'var(--muted)', fontSize: '.8rem', margin: '0 0 8px' }}>Elige la marca, el tono y, si aplica, el peróxido. Después pésalos.</p>
              <div className="field"><label>Marca</label>
                <div className="pill-grid">
                  {tinteBrands.map(br => (
                    <button key={br} className={'pill' + (colorBrand === br ? ' sel' : '')} onClick={() => setColorBrand(br)}>{br === 'KULL' ? 'KÜÜL' : br}</button>
                  ))}
                </div>
              </div>
              {colorBrand && (
                <div className="field"><label>Tono</label>
                  <input placeholder="Buscar tono…" value={supplyQ} onChange={e => setSupplyQ(e.target.value)} style={{ marginBottom: 6 }} />
                  <div style={{ maxHeight: 200, overflow: 'auto' }}>
                    {tintesOfBrand.slice(0, 60).map(p => (
                      <button key={p.id} className="pill" style={{ width: '100%', textAlign: 'left', marginBottom: 4 }} onClick={() => addUsed(p)}>
                        ＋ {p.name} <span style={{ color: 'var(--muted)' }}>· {p.gama || ''}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="field" style={{ marginBottom: 0 }}><label>Peróxido (opcional)</label>
                <div style={{ maxHeight: 140, overflow: 'auto' }}>
                  {peroxidos.map(p => (
                    <button key={p.id} className="pill" style={{ width: '100%', textAlign: 'left', marginBottom: 4 }} onClick={() => addUsed(p)}>
                      ＋ {p.name} <span style={{ color: 'var(--muted)' }}>· {p.brand}</span>
                    </button>
                  ))}
                </div>
              </div>
              {used.length > 0 && (
                <div style={{ marginTop: 10, borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
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
              )}
            </div>
          )}

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
            serviceMode={serviceMode} setServiceMode={setServiceMode} serviceLabel={serviceName}
            baseServiceCost={baseServiceCost} baseServiceMode={baseServiceMode} setBaseServiceMode={setBaseServiceMode}
            baseServiceName={baseService?.name || 'Servicio (costo base)'}
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
