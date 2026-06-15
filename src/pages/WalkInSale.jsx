import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../App';
import { Toast, useToast } from '../components/UI';

export default function WalkInSale() {
  const { session } = useAuth();
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]); // {product, qty}
  const [pay, setPay] = useState('efectivo');
  const [toast, setToast] = useToast();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Solo PRODUCTOS de venta, nunca insumos
    supabase.from('products').select('*')
      .eq('type', 'producto').eq('status', 'Activo')
      .order('brand').order('name').limit(500)
      .then(({ data }) => setProducts(data || []));
  }, []);

  const filtered = products.filter(p =>
    [p.name, p.brand].join(' ').toLowerCase().includes(q.toLowerCase()));

  function add(p) {
    setCart(c => {
      const ex = c.find(x => x.product.id === p.id);
      if (ex) return c.map(x => x.product.id === p.id ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { product: p, qty: 1 }];
    });
  }
  function setQty(id, qty) {
    qty = Math.max(0, qty);
    setCart(c => qty === 0 ? c.filter(x => x.product.id !== id) : c.map(x => x.product.id === id ? { ...x, qty } : x));
  }
  function toggleGift(id) {
    setCart(c => c.map(x => x.product.id === id ? { ...x, gift: !x.gift } : x));
  }
  const total = cart.reduce((a, x) => a + (x.gift ? 0 : Number(x.product.price) * x.qty), 0);
  const giftDiscount = cart.reduce((a, x) => a + (x.gift ? Number(x.product.price) * x.qty : 0), 0);
  const costo = cart.reduce((a, x) => a + Number(x.product.cost) * x.qty, 0);
  const cardFee = pay === 'tarjeta' ? total * 0.036 : 0;

  async function checkout() {
    if (!cart.length || busy) return;
    setBusy(true);
    try {
      const { data: sale, error } = await supabase.from('sales').insert({
        user_id: session.user.id, service_name: 'Venta de productos',
        service_price: 0, subtotal: total, total,
        payment_method: pay, financial_cost: Math.round(costo + cardFee), notes: 'Venta sin cita' + (pay === 'tarjeta' ? ` · comisión $${cardFee.toFixed(0)}` : ''),
      }).select().single();
      if (error) throw error;
      await supabase.from('sale_items').insert(cart.map(x => ({
        sale_id: sale.id, product_id: x.product.id, item_type: 'producto', name: x.product.name,
        quantity: x.qty, unit_price: x.product.price, total_price: x.gift ? 0 : x.product.price * x.qty,
        is_gift: !!x.gift, gift_cost: x.gift ? Number(x.product.cost) * x.qty : 0,
      })));
      // descuenta stock por pieza
      for (const x of cart) {
        const after = Math.max(0, Number(x.product.current_stock) - x.qty);
        await supabase.from('products').update({ current_stock: after }).eq('id', x.product.id);
        await supabase.from('inventory_movements').insert({
          product_id: x.product.id, user_id: session.user.id, type: 'venta',
          quantity_before: x.product.current_stock, quantity_after: after, notes: 'Venta sin cita',
        });
      }
      setToast(`💵 Venta cobrada $${total.toLocaleString()}`);
      setCart([]);
      setProducts(ps => ps.map(p => {
        const x = cart.find(c => c.product.id === p.id);
        return x ? { ...p, current_stock: Math.max(0, Number(p.current_stock) - x.qty) } : p;
      }));
    } catch (e) { setToast('⚠ ' + e.message); } finally { setBusy(false); }
  }

  return (
    <Shell title="Venta sin cita" sub="Solo productos de venta">
      <div className="screen" style={{ paddingBottom: 160 }}>
        <h2>Venta sin cita</h2>
        <p className="lead">Vende productos de mostrador. Los insumos del salón no aparecen aquí.</p>
        <div className="field"><input placeholder="Buscar producto…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="tone-grid">
          {filtered.slice(0, 60).map(p => (
            <button key={p.id} className="tone" onClick={() => add(p)} style={{ opacity: Number(p.current_stock) <= 0 ? .4 : 1 }}>
              <span className="tname">{p.name}</span>
              <span className="tstock">{p.brand}<br />${Number(p.price)} · stock {Number(p.current_stock)}</span>
            </button>
          ))}
        </div>
      </div>

      {cart.length > 0 && (
        <div className="cartbar">
          <div style={{ maxHeight: 130, overflow: 'auto', marginBottom: 8 }}>
            {cart.map(x => (
              <div key={x.product.id} className="comp-row" style={{ marginBottom: 6 }}>
                <div className="cname">{x.product.name}{x.gift && <span className="tag ok" style={{ marginLeft: 6 }}>REGALO</span>}</div>
                <button className="btn sm" onClick={() => setQty(x.product.id, x.qty - 1)}>−</button>
                <span className="num" style={{ minWidth: 28, textAlign: 'center' }}>{x.qty}</span>
                <button className="btn sm" onClick={() => setQty(x.product.id, x.qty + 1)}>＋</button>
                <button className={'btn sm' + (x.gift ? ' ok' : '')} onClick={() => toggleGift(x.product.id)} title="Regalo">🎁</button>
                <span className="num" style={{ minWidth: 56, textAlign: 'right', textDecoration: x.gift ? 'line-through' : 'none', opacity: x.gift ? .5 : 1 }}>${(x.product.price * x.qty).toLocaleString()}</span>
              </div>
            ))}
          </div>
          {giftDiscount > 0 && <div className="info-cost" style={{ color: 'var(--ok)' }}>🎁 Regalado: −${giftDiscount.toLocaleString()} (costo ${costo.toFixed(0)} informativo)</div>}
          {pay === 'tarjeta' && total > 0 && <div className="info-cost">ℹ Costo financiero tarjeta (3.6%): <b>−${cardFee.toFixed(0)}</b> · informativo</div>}
          <div className="row" style={{ marginBottom: 8 }}>
            {['efectivo', 'tarjeta', 'transferencia'].map(m => (
              <button key={m} className={'pill' + (pay === m ? ' sel' : '')} onClick={() => setPay(m)} style={{ textTransform: 'capitalize', minHeight: 48 }}>{m}</button>
            ))}
          </div>
          <button className="btn primary xl" style={{ width: '100%' }} onClick={checkout} disabled={busy}>
            Cobrar ${total.toLocaleString()} ({pay})
          </button>
        </div>
      )}
      <Toast msg={toast} />
    </Shell>
  );
}
