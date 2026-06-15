import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../App';
import { Toast, useToast } from '../components/UI';

const CARD_FEE = 0.036; // 3.6% comisión por cobro con tarjeta (ajustable)

function rangeFor(period) {
  const now = new Date();
  const start = new Date(now);
  if (period === 'hoy') start.setHours(0, 0, 0, 0);
  if (period === 'semana') start.setDate(now.getDate() - 7);
  if (period === 'mes') start.setMonth(now.getMonth() - 1);
  return { start: start.toISOString(), end: new Date().toISOString() };
}

export default function Finance() {
  const { isAdmin, profile } = useAuth();
  const [period, setPeriod] = useState('hoy');
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [team, setTeam] = useState({});       // id -> nombre
  const [scope, setScope] = useState('mio');  // admin: 'salon' | 'mio' | artistId
  const [toast, setToast] = useToast();
  const [loading, setLoading] = useState(true);
  const [showExp, setShowExp] = useState(false);
  const [expCat, setExpCat] = useState('Renta');
  const [expAmount, setExpAmount] = useState('');
  const [expNote, setExpNote] = useState('');

  useEffect(() => {
    if (isAdmin) setScope('salon');
    supabase.from('profiles').select('id, full_name').then(({ data }) => {
      const map = {}; (data || []).forEach(p => { map[p.id] = p.full_name; }); setTeam(map);
    });
  }, [isAdmin]);

  function load() {
    setLoading(true);
    const { start, end } = rangeFor(period);
    // Gracias a RLS: el artista solo recibe SUS ventas; el Admin las recibe todas.
    Promise.all([
      supabase.from('sales').select('*').gte('created_at', start).lte('created_at', end),
      supabase.from('operating_expenses').select('*').gte('created_at', start).lte('created_at', end),
    ]).then(([s, e]) => { setSales(s.data || []); setExpenses(e.data || []); setLoading(false); });
  }
  useEffect(load, [period]);

  // Filtrar por alcance seleccionado (solo Admin puede cambiarlo)
  const myId = profile?.id;
  const viewSales = !isAdmin ? sales
    : scope === 'salon' ? sales
    : sales.filter(s => s.user_id === scope);
  const viewExpenses = (!isAdmin || scope === 'salon') ? expenses
    : expenses.filter(e => e.user_id === scope);

  const ingresos = viewSales.reduce((a, s) => a + Number(s.total || 0), 0);
  const cardSales = viewSales.filter(s => (s.payment_method || '').toLowerCase().includes('tarjeta'));
  const cardIncome = cardSales.reduce((a, s) => a + Number(s.total || 0), 0);
  const costoFinanciero = cardIncome * CARD_FEE;
  const costoInsumos = viewSales.reduce((a, s) => a + Number(s.financial_cost || 0), 0);
  const gastosOp = viewExpenses.reduce((a, e) => a + Number(e.amount || 0), 0);
  const utilidad = ingresos - costoFinanciero - gastosOp; // costoInsumos ya viene dentro de financial_cost

  // Desglose por artista (solo Admin, vista salón)
  const byArtist = {};
  if (isAdmin) {
    sales.forEach(s => {
      const id = s.user_id || 'sin';
      byArtist[id] = byArtist[id] || { ingresos: 0, n: 0, tarjeta: 0 };
      byArtist[id].ingresos += Number(s.total || 0);
      byArtist[id].n += 1;
      if ((s.payment_method || '').toLowerCase().includes('tarjeta')) byArtist[id].tarjeta += Number(s.total || 0);
    });
  }

  async function addExpense() {
    const amt = Number(expAmount);
    if (!amt) return setToast('Escribe un monto');
    const { error } = await supabase.from('operating_expenses').insert({ category: expCat, amount: amt, notes: expNote || null });
    if (error) return setToast('⚠ ' + error.message);
    setToast('✓ Gasto registrado'); setShowExp(false); setExpAmount(''); setExpNote(''); load();
  }

  const fmt = n => '$' + Math.round(n).toLocaleString('es-MX');
  const scopeTitle = !isAdmin ? 'Mis números'
    : scope === 'salon' ? 'Todo el salón'
    : `Artista: ${team[scope] || ''}`;

  return (
    <Shell title="Finanzas" sub={scopeTitle}>
      <div className="screen" style={{ paddingBottom: 40 }}>
        <h2>Corte financiero</h2>
        <p className="lead">{isAdmin ? 'Como administrador ves el total del salón y el desglose por artista.' : 'Tus ingresos y costos personales.'}</p>

        {isAdmin && (
          <div className="pill-grid" style={{ marginBottom: 12 }}>
            <button className={'pill' + (scope === 'salon' ? ' sel' : '')} onClick={() => setScope('salon')}>🏠 Todo el salón</button>
            <button className={'pill' + (scope === myId ? ' sel' : '')} onClick={() => setScope(myId)}>Solo yo</button>
            {Object.keys(byArtist).filter(id => id !== myId && id !== 'sin').map(id => (
              <button key={id} className={'pill' + (scope === id ? ' sel' : '')} onClick={() => setScope(id)}>{team[id] || 'Artista'}</button>
            ))}
          </div>
        )}

        <div className="pill-grid" style={{ marginBottom: 14 }}>
          {[['hoy', 'Hoy'], ['semana', 'Últimos 7 días'], ['mes', 'Último mes']].map(([k, l]) => (
            <button key={k} className={'pill' + (period === k ? ' sel' : '')} onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>

        {loading ? <p style={{ color: 'var(--muted)' }}>Cargando…</p> : (
          <>
            <div className="fin-grid">
              <div className="fin-card ingreso">
                <div className="flabel">Ingresos</div>
                <div className="fvalue num">{fmt(ingresos)}</div>
                <div className="fsub">{viewSales.length} ventas</div>
              </div>
              <div className="fin-card util" style={{ borderColor: utilidad >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
                <div className="flabel">Utilidad estimada</div>
                <div className="fvalue num" style={{ color: utilidad >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{fmt(utilidad)}</div>
                <div className="fsub">después de costos y gastos</div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <h3 style={{ fontSize: '1rem', marginBottom: 10 }}>Desglose</h3>
              <div className="total-line"><span>Ingresos totales</span><span className="num">{fmt(ingresos)}</span></div>
              <div className="total-line"><span>− Costo de insumos consumidos</span><span className="num" style={{ color: 'var(--peroxide)' }}>−{fmt(costoInsumos)}</span></div>
              <div className="total-line"><span>− Costo financiero tarjeta ({(CARD_FEE * 100).toFixed(1)}%)</span><span className="num" style={{ color: 'var(--peroxide)' }}>−{fmt(costoFinanciero)}</span></div>
              <div className="total-line"><span>− Gastos operativos</span><span className="num" style={{ color: 'var(--peroxide)' }}>−{fmt(gastosOp)}</span></div>
              <div className="total-line big"><span>Utilidad</span><span className="num" style={{ color: utilidad >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{fmt(utilidad)}</span></div>
              <p style={{ color: 'var(--muted)', fontSize: '.74rem', marginTop: 8 }}>El costo de insumos ya está incluido en el costo financiero registrado de cada venta; se muestra desglosado de forma informativa.</p>
            </div>

            {isAdmin && scope === 'salon' && Object.keys(byArtist).length > 0 && (
              <div className="card">
                <h3 style={{ fontSize: '1rem', marginBottom: 10 }}>Por artista</h3>
                {Object.entries(byArtist).sort((a, b) => b[1].ingresos - a[1].ingresos).map(([id, d]) => (
                  <button key={id} className="comp-row" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => setScope(id === 'sin' ? 'salon' : id)}>
                    <div className="avatar" style={{ width: 36, height: 36, fontSize: '.8rem' }}>
                      {(team[id] || '?').split(' ').map(p => p[0]).slice(0, 2).join('')}
                    </div>
                    <div className="cname" style={{ flex: 1 }}>{team[id] || 'Sin asignar'}
                      <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{d.n} ventas · tarjeta {fmt(d.tarjeta)}</div>
                    </div>
                    <div className="num" style={{ fontWeight: 800 }}>{fmt(d.ingresos)}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ fontSize: '1rem' }}>Pagos con tarjeta</h3>
                <span className="tag">{cardSales.length} de {viewSales.length}</span>
              </div>
              <div className="total-line"><span>Cobrado con tarjeta</span><span className="num">{fmt(cardIncome)}</span></div>
              <div className="total-line"><span>Comisión estimada</span><span className="num" style={{ color: 'var(--peroxide)' }}>−{fmt(costoFinanciero)}</span></div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ fontSize: '1rem' }}>Gastos operativos</h3>
                <button className="btn sm" onClick={() => setShowExp(s => !s)}>{showExp ? 'Cerrar' : '＋ Registrar gasto'}</button>
              </div>
              {showExp && (
                <div style={{ marginBottom: 12 }}>
                  <div className="field"><label>Categoría</label>
                    <select value={expCat} onChange={e => setExpCat(e.target.value)}>
                      {['Renta', 'Servicios (luz/agua)', 'Sueldos', 'Productos', 'Mantenimiento', 'Otro'].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field"><label>Monto</label><input type="number" inputMode="decimal" value={expAmount} onChange={e => setExpAmount(e.target.value)} /></div>
                  <div className="field"><label>Nota (opcional)</label><input value={expNote} onChange={e => setExpNote(e.target.value)} /></div>
                  <button className="btn primary" style={{ width: '100%' }} onClick={addExpense}>Guardar gasto</button>
                </div>
              )}
              {viewExpenses.length === 0 && <p style={{ color: 'var(--muted)' }}>Sin gastos en este periodo.</p>}
              {viewExpenses.map(e => (
                <div key={e.id} className="total-line"><span>{e.category}{e.notes ? ` · ${e.notes}` : ''}{isAdmin && scope === 'salon' && e.user_id ? ` · ${team[e.user_id] || ''}` : ''}</span><span className="num">{fmt(e.amount)}</span></div>
              ))}
            </div>
          </>
        )}
      </div>
      <Toast msg={toast} />
    </Shell>
  );
}
