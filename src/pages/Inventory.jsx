import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Shell } from '../App';
import { useAuth } from '../context/AuthContext';
import { Toast, useToast, Modal } from '../components/UI';
import { exportInventoryXLSX, parseInventoryXLSX } from '../lib/excel';

export default function Inventory() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('todo'); // todo | bajo | abasto
  const [toast, setToast] = useToast();
  const [busy, setBusy] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const fileRef = useRef();

  function load() {
    supabase.from('products').select('*').order('brand').order('gama').order('name').limit(1000)
      .then(({ data }) => setItems(data || []));
  }
  useEffect(load, []);

  const filtered = items.filter(p =>
    [p.name, p.brand, p.gama, p.class].join(' ').toLowerCase().includes(q.toLowerCase()));
  const low = items.filter(p => Number(p.current_stock) <= Number(p.min_stock) && p.status === 'Activo');
  const view = tab === 'bajo' ? filtered.filter(p => Number(p.current_stock) <= Number(p.min_stock) && p.status === 'Activo') : filtered;

  async function doExport() {
    try { setBusy(true); await exportInventoryXLSX(items); setToast('✓ Excel descargado'); }
    catch (e) { setToast('⚠ ' + e.message); } finally { setBusy(false); }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      const rows = await parseInventoryXLSX(file);
      if (!rows.length) { setToast('⚠ No se encontraron filas con Nombre'); return; }
      setImportPreview(rows);
    } catch (err) { setToast('⚠ ' + err.message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function confirmImport() {
    setBusy(true);
    try {
      // Empareja por código de barras; si no, por nombre+marca. Actualiza o inserta.
      let updated = 0, inserted = 0;
      for (const r of importPreview) {
        let match = null;
        if (r.barcode) match = items.find(p => p.barcode && p.barcode === r.barcode);
        if (!match) match = items.find(p => p.name === r.name && (p.brand || '') === (r.brand || '') && (p.gama || '') === (r.gama || ''));
        const payload = {
          name: r.name, barcode: r.barcode || null, brand: r.brand || null,
          type: r.type || null, class: r.class || null, gama: r.gama || null,
          sku: r.sku || null, description: r.description || null,
          cost: r.cost || 0, price: r.price || 0, price_per_gram: r.price_per_gram || 0, min_stock: r.min_stock || 0,
          current_stock: r.current_stock || 0, gramos_por_pieza: r.gramos_por_pieza || 0,
          status: r.status || 'Activo',
        };
        if (match) { await supabase.from('products').update(payload).eq('id', match.id); updated++; }
        else { await supabase.from('products').insert(payload); inserted++; }
      }
      setToast(`✓ ${updated} actualizados, ${inserted} nuevos`);
      setImportPreview(null); load();
    } catch (e) { setToast('⚠ ' + e.message); } finally { setBusy(false); }
  }

  // ---- Abasto: ajuste rápido de stock ----
  async function bump(p, delta) {
    const after = Math.max(0, Number(p.current_stock) + delta);
    setItems(list => list.map(x => x.id === p.id ? { ...x, current_stock: after } : x));
    await supabase.from('products').update({ current_stock: after }).eq('id', p.id);
    await supabase.from('inventory_movements').insert({
      product_id: p.id, type: 'recarga', quantity_before: p.current_stock, quantity_after: after,
      notes: 'Abasto manual',
    });
  }
  async function setStock(p, val) {
    const after = Math.max(0, Number(val) || 0);
    setItems(list => list.map(x => x.id === p.id ? { ...x, current_stock: after } : x));
    await supabase.from('products').update({ current_stock: after }).eq('id', p.id);
  }

  return (
    <Shell title="Inventario" sub={`${items.length} artículos`}>
      <div className="screen" style={{ paddingBottom: 40 }}>
        <h2>Inventario</h2>
        <p className="lead">
          Tu inventario real. {low.length > 0 && <b style={{ color: 'var(--peroxide)' }}>{low.length} en stock bajo.</b>}
        </p>

        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn sm" onClick={doExport} disabled={busy}>⬇ Descargar Excel</button>
          {isAdmin && <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={busy}>⬆ Subir Excel</button>}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={onFile} />
        </div>

        <div className="pill-grid" style={{ marginBottom: 12 }}>
          <button className={'pill' + (tab === 'todo' ? ' sel' : '')} onClick={() => setTab('todo')}>Todo</button>
          <button className={'pill' + (tab === 'bajo' ? ' sel' : '')} onClick={() => setTab('bajo')}>Stock bajo ({low.length})</button>
          <button className={'pill' + (tab === 'abasto' ? ' sel' : '')} onClick={() => setTab('abasto')}>Abasto rápido</button>
        </div>

        <div className="field"><input placeholder="Buscar producto, marca o gama…" value={q} onChange={e => setQ(e.target.value)} /></div>

        {tab === 'abasto' ? (
          <div>
            <p className="lead">Ajusta el stock con los botones, o escribe la cantidad nueva. Se guarda solo.</p>
            {(q ? view : low).slice(0, 120).map(p => (
              <div key={p.id} className="comp-row">
                <div className="cname">{p.name} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {p.brand} {p.gama || p.class || ''}</span>
                  <div style={{ fontSize: '.72rem', color: Number(p.current_stock) <= Number(p.min_stock) ? 'var(--danger)' : 'var(--muted)' }}>
                    mín: {Number(p.min_stock)}
                  </div>
                </div>
                <button className="btn sm" onClick={() => bump(p, -1)}>−</button>
                <input className="num" style={{ width: 60, minHeight: 44, textAlign: 'center', background: 'var(--surface2)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--text)' }}
                  value={Number(p.current_stock)} onChange={e => setStock(p, e.target.value)} inputMode="decimal" />
                <button className="btn sm" onClick={() => bump(p, 1)}>＋</button>
              </div>
            ))}
            {!q && low.length === 0 && <p style={{ color: 'var(--muted)' }}>Nada en stock bajo. Busca arriba para reabastecer cualquier producto.</p>}
          </div>
        ) : (
          <div className="card" style={{ overflowX: 'auto', padding: 8 }}>
            <table className="inv">
              <thead><tr><th>Producto</th><th>Marca</th><th>Gama</th><th>Stock</th><th>Precio</th></tr></thead>
              <tbody>
                {view.slice(0, 250).map(p => (
                  <tr key={p.id} style={{ opacity: p.status === 'Activo' ? 1 : .45 }}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>{p.brand}</td>
                    <td>{p.gama || p.class || '—'}</td>
                    <td className="num" style={{ color: Number(p.current_stock) <= Number(p.min_stock) ? 'var(--danger)' : 'inherit' }}>{Number(p.current_stock)}</td>
                    <td className="num">${Number(p.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!importPreview} onClose={() => setImportPreview(null)}>
        <h3 style={{ marginBottom: 6 }}>Confirmar importación</h3>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem', marginBottom: 12 }}>
          Se leyeron <b>{importPreview?.length}</b> filas. Los productos existentes se actualizan (por código de barras o nombre+marca) y los nuevos se agregan.
        </p>
        <div style={{ maxHeight: 220, overflow: 'auto', marginBottom: 12 }}>
          {importPreview?.slice(0, 30).map((r, i) => (
            <div key={i} className="comp-row" style={{ marginBottom: 6 }}>
              <div className="cname">{r.name} <span style={{ color: 'var(--muted)' }}>· {r.brand} {r.gama}</span></div>
              <div className="num">stock {r.current_stock} · ${r.price}</div>
            </div>
          ))}
          {importPreview?.length > 30 && <p style={{ color: 'var(--muted)', fontSize: '.8rem' }}>…y {importPreview.length - 30} más.</p>}
        </div>
        <button className="btn primary" style={{ width: '100%' }} onClick={confirmImport} disabled={busy}>
          {busy ? 'Aplicando…' : 'Aplicar cambios'}
        </button>
        <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setImportPreview(null)}>Cancelar</button>
      </Modal>

      <Toast msg={toast} />
    </Shell>
  );
}
