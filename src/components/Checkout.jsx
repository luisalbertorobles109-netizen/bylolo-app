import { useState } from 'react';
import { supabase } from '../lib/supabase';

export const CARD_FEE = 0.036;

// Estado reutilizable para el cobro (productos, descuento, método de pago)
export function useSaleExtras() {
  const [products, setProducts] = useState([]); // {id,name,price,cost,gift}
  const [discountPct, setDiscountPct] = useState(0);
  const [payMethod, setPayMethod] = useState('efectivo');
  const [serviceMode, setServiceMode] = useState('charge'); // 'charge' | 'gift' | 'removed'
  const [baseServiceMode, setBaseServiceMode] = useState('include'); // 'include' | 'gift' | 'removed'
  return { products, setProducts, discountPct, setDiscountPct, payMethod, setPayMethod, serviceMode, setServiceMode, baseServiceMode, setBaseServiceMode };
}

// Calcula el desglose completo del cobro
export function computeBreakdown({ serviceSubtotal, serviceMode = 'charge', products, discountPct, payMethod, suppliesCost = 0, baseServiceCost = 0, baseServiceMode = 'include' }) {
  const svc = Number(serviceSubtotal || 0);
  const effectiveService = serviceMode === 'charge' ? svc : 0;
  const serviceGiftValue = serviceMode === 'gift' ? svc : 0;
  const productsGross = products.reduce((a, p) => a + (p.gift ? 0 : Number(p.price || 0)), 0);
  const giftValue = products.filter(p => p.gift).reduce((a, p) => a + Number(p.price || 0), 0) + serviceGiftValue;
  const productsCost = products.reduce((a, p) => a + Number(p.cost || 0), 0); // costo de TODOS (vendidos o regalados)
  const beforeDiscount = effectiveService + productsGross;
  const discountAmount = beforeDiscount * (Number(discountPct || 0) / 100);
  const total = Math.max(0, beforeDiscount - discountAmount);
  const cardCost = payMethod === 'tarjeta' ? total * CARD_FEE : 0;
  const effectiveBaseCost = baseServiceMode === 'removed' ? 0 : Number(baseServiceCost || 0);
  const realCost = productsCost + Number(suppliesCost || 0) + cardCost + effectiveBaseCost;
  const utilidad = total - realCost;
  return { productsGross, giftValue, productsCost, beforeDiscount, discountAmount, total, cardCost, realCost, utilidad, effectiveService, effectiveBaseCost };
}

// Buscador y selector de productos de venta (type='producto')
export function ProductPicker({ products, setProducts, label = 'Productos de venta' }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [loaded, setLoaded] = useState(false);

  function toggle() {
    setOpen(o => !o);
    if (!loaded) {
      supabase.from('products').select('*').eq('type', 'producto').eq('status', 'Activo')
        .order('brand').order('name').limit(500)
        .then(({ data }) => { setList(data || []); setLoaded(true); });
    }
  }
  const filtered = list.filter(p => [p.name, p.brand].join(' ').toLowerCase().includes(q.toLowerCase()));

  function add(p) {
    setProducts(x => [...x, { id: p.id, name: p.name, price: Number(p.price), cost: Number(p.cost || 0), gift: false }]);
    setOpen(false); setQ('');
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h3 style={{ fontSize: '1rem' }}>{label}</h3>
        <button className="btn sm" onClick={toggle}>{open ? 'Cerrar' : '＋ Agregar producto'}</button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '.8rem', margin: '0 0 8px' }}>
        Agrega productos al cliente en el mismo cobro. Usa 🎁 para regalar.
      </p>
      {open && (
        <div style={{ marginBottom: 10 }}>
          <div className="field"><input placeholder="Buscar producto…" value={q} onChange={e => setQ(e.target.value)} /></div>
          <div style={{ maxHeight: 180, overflow: 'auto' }}>
            {filtered.slice(0, 50).map(p => (
              <button key={p.id} className="pill" style={{ width: '100%', textAlign: 'left', marginBottom: 4, opacity: Number(p.current_stock) <= 0 ? .5 : 1 }} onClick={() => add(p)}>
                ＋ {p.name} <span style={{ color: 'var(--muted)' }}>· {p.brand} · ${Number(p.price)} · stock {Number(p.current_stock)}</span>
              </button>
            ))}
            {loaded && filtered.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '.82rem' }}>No hay productos de venta que coincidan.</p>}
          </div>
        </div>
      )}
      {products.map((p, i) => (
        <div key={i} className="comp-row">
          <div className="cname">{p.name}{p.gift && <span className="tag ok" style={{ marginLeft: 6 }}>REGALO</span>}
            <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{p.gift ? `Costo: $${Number(p.cost).toFixed(0)} (no se cobra)` : `$${Number(p.price)}`}</div>
          </div>
          <div className="num" style={{ minWidth: 52, textAlign: 'right', textDecoration: p.gift ? 'line-through' : 'none', opacity: p.gift ? .5 : 1 }}>${Number(p.price)}</div>
          <button className={'btn ghost sm' + (p.gift ? ' ok' : '')} onClick={() => setProducts(x => x.map((y, j) => j === i ? { ...y, gift: !y.gift } : y))} title="Regalo">🎁</button>
          <button className="btn ghost sm" onClick={() => setProducts(x => x.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
    </div>
  );
}

// Resumen de cobro con desglose, descuento, sugerido y método de pago
export function CheckoutSummary({
  serviceSubtotal, products, discountPct, setDiscountPct, payMethod, setPayMethod,
  suppliesCost = 0, suggested = 0, serviceMode = 'charge', setServiceMode = null, serviceLabel = 'Servicio',
  baseServiceCost = 0, baseServiceMode = 'include', setBaseServiceMode = null, baseServiceName = 'Servicio (costo base)',
}) {
  const b = computeBreakdown({ serviceSubtotal, serviceMode, products, discountPct, payMethod, suppliesCost, baseServiceCost, baseServiceMode });
  const fmt = n => '$' + Math.round(n).toLocaleString('es-MX');
  return (
    <>
      <div className="card">
        <h3 style={{ fontSize: '1rem', marginBottom: 10 }}>Método de pago</h3>
        <div className="row">
          {['efectivo', 'tarjeta', 'transferencia'].map(m => (
            <button key={m} className={'btn' + (payMethod === m ? ' primary' : '')} style={{ textTransform: 'capitalize' }} onClick={() => setPayMethod(m)}>{m}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '1rem', marginBottom: 10 }}>Descuento</h3>
        <div className="pill-grid">
          {[0, 5, 10, 15, 20, 25].map(d => (
            <button key={d} className={'pill' + (Number(discountPct) === d ? ' sel' : '')} onClick={() => setDiscountPct(d)}>{d}%</button>
          ))}
        </div>
        <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
          <label>Otro %</label>
          <input type="number" inputMode="decimal" value={discountPct || ''} onChange={e => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value))))} placeholder="0" />
        </div>
      </div>

      <div className="card">
        {suggested > 0 && (
          <div className="info-cost" style={{ borderColor: 'var(--violet)' }}>
            💡 Precio sugerido (según insumos y productos): <b>{fmt(suggested)}</b> · es solo referencia, tú decides el precio final.
          </div>
        )}
        <div className="total-line" style={{ alignItems: 'center', opacity: serviceMode === 'removed' ? .45 : 1 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            {serviceLabel}
            {serviceMode === 'gift' && <span className="tag ok">REGALO</span>}
            {serviceMode === 'removed' && <span className="tag" style={{ color: 'var(--muted)' }}>QUITADO</span>}
            {setServiceMode && (
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button className={'btn ghost sm' + (serviceMode === 'gift' ? ' ok' : '')} title="Regalar el servicio"
                  onClick={() => setServiceMode(m => m === 'gift' ? 'charge' : 'gift')}>🎁</button>
                <button className={'btn ghost sm' + (serviceMode === 'removed' ? ' danger' : '')} title="Quitar el servicio del cobro"
                  onClick={() => setServiceMode(m => m === 'removed' ? 'charge' : 'removed')}>✕</button>
              </span>
            )}
          </span>
          <span className="num" style={{ textDecoration: serviceMode !== 'charge' ? 'line-through' : 'none' }}>{fmt(serviceSubtotal)}</span>
        </div>
        <div className="total-line"><span>Productos</span><span className="num">{fmt(b.productsGross)}</span></div>
        {b.giftValue > 0 && <div className="total-line" style={{ color: 'var(--ok)' }}><span>🎁 Regalado (no se cobra)</span><span className="num">−{fmt(b.giftValue)}</span></div>}
        {b.discountAmount > 0 && <div className="total-line" style={{ color: 'var(--ok)' }}><span>Descuento {discountPct}%</span><span className="num">−{fmt(b.discountAmount)}</span></div>}
        <div className="total-line big"><span>Total a cobrar ({payMethod})</span><span className="num">{fmt(b.total)}</span></div>

        <div style={{ marginTop: 10, borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
          <p style={{ fontSize: '.72rem', color: 'var(--muted)', margin: '0 0 6px', fontWeight: 700, letterSpacing: '.04em' }}>COSTOS INTERNOS (informativo)</p>
          {baseServiceCost > 0 && (
            <div className="info-cost" style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: baseServiceMode === 'removed' ? .5 : 1, borderColor: baseServiceMode === 'removed' ? 'var(--line)' : 'var(--violet)' }}>
              <span style={{ flex: 1 }}>
                {baseServiceName}: <b style={{ textDecoration: baseServiceMode === 'removed' ? 'line-through' : 'none' }}>{fmt(baseServiceCost)}</b>
                {baseServiceMode === 'gift' && <span className="tag ok" style={{ marginLeft: 6 }}>REGALO</span>}
                {baseServiceMode === 'removed' && <span className="tag" style={{ marginLeft: 6, color: 'var(--muted)' }}>QUITADO</span>}
                <br /><span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>No se cobra al cliente · {baseServiceMode === 'removed' ? 'no afecta tu utilidad' : 'afecta tu utilidad'}</span>
              </span>
              {setBaseServiceMode && (
                <span style={{ display: 'flex', gap: 4 }}>
                  <button className={'btn ghost sm' + (baseServiceMode === 'gift' ? ' ok' : '')} title="Marcar como regalo (sigue contando como costo)"
                    onClick={() => setBaseServiceMode(m => m === 'gift' ? 'include' : 'gift')}>🎁</button>
                  <button className={'btn ghost sm' + (baseServiceMode === 'removed' ? ' danger' : '')} title="Quitar (no se cuenta como costo)"
                    onClick={() => setBaseServiceMode(m => m === 'removed' ? 'include' : 'removed')}>✕</button>
                </span>
              )}
            </div>
          )}
          {suppliesCost > 0 && <div className="info-cost">Insumos consumidos: <b>{fmt(suppliesCost)}</b></div>}
          {b.productsCost > 0 && <div className="info-cost">Productos (vendidos o regalados): <b>{fmt(b.productsCost)}</b></div>}
          {payMethod === 'tarjeta' && <div className="info-cost">Costo financiero tarjeta ({(CARD_FEE * 100).toFixed(1)}%): <b>−{fmt(b.cardCost)}</b> · no se suma al precio</div>}
          <div className="info-cost" style={{ borderColor: b.utilidad >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
            Utilidad estimada del servicio: <b style={{ color: b.utilidad >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{fmt(b.utilidad)}</b>
          </div>
        </div>
      </div>
    </>
  );
}

// Registra los productos de una venta: inserta sale_items y descuenta stock.
export async function persistSaleProducts(saleId, products, artistId) {
  if (!products.length) return;
  await supabase.from('sale_items').insert(products.map(p => ({
    sale_id: saleId, product_id: p.id || null, item_type: 'producto', name: p.name,
    quantity: 1, unit_price: p.price, total_price: p.gift ? 0 : p.price,
    is_gift: !!p.gift, gift_cost: p.gift ? Number(p.cost || 0) : 0,
  })));
  for (const p of products) {
    if (!p.id) continue;
    const { data: prod } = await supabase.from('products').select('current_stock').eq('id', p.id).single();
    if (!prod) continue;
    const after = Math.max(0, Number(prod.current_stock) - 1);
    await supabase.from('products').update({ current_stock: after }).eq('id', p.id);
    await supabase.from('inventory_movements').insert({
      product_id: p.id, user_id: artistId, type: p.gift ? 'regalo' : 'venta',
      quantity_before: prod.current_stock, quantity_after: after,
      notes: p.gift ? 'Regalo en servicio' : 'Venta en servicio',
    });
  }
}

// Descuenta el insumo "Servicio" (costo base) del inventario si no fue quitado.
// baseProduct: el producto insumo de la BD; mode: 'include' | 'gift' | 'removed'.
export async function persistBaseService(saleId, baseProduct, mode, artistId) {
  if (!baseProduct || mode === 'removed') return;
  const { data: prod } = await supabase.from('products').select('current_stock').eq('id', baseProduct.id).single();
  if (!prod) return;
  const after = Math.max(0, Number(prod.current_stock) - 1);
  await supabase.from('products').update({ current_stock: after }).eq('id', baseProduct.id);
  await supabase.from('inventory_movements').insert({
    product_id: baseProduct.id, user_id: artistId, type: 'consumo_servicio',
    quantity_before: prod.current_stock, quantity_after: after,
    notes: mode === 'gift' ? 'Costo base (regalo)' : 'Costo base de servicio',
  });
}
