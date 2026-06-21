import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../App';
import { Modal, Toast, useToast } from '../components/UI';
import { FALLBACK_RULES, suggestVol, toneColor, targetLevelOf, classifyTone, funnyLevel } from '../lib/colorRules';
import { connectSkale } from '../lib/scale';
import { useTimer } from '../context/TimerContext';

const STEPS_BAR = ['1 Cliente', '2 Colores', '3 Fórmula', '4 Báscula', '⏱ Tiempo', '5 Resumen', '6 Cobro'];
const TOL = 1.0;
const CARD_FEE = 0.036; // comisión informativa por cobro con tarjeta
const LEVEL_NAMES = ['Negro', 'C.E.Osc', 'C.Osc', 'Cast.', 'C.Claro', 'R.Osc', 'Rubio', 'R.Claro', 'R.Clmo', 'R.E.Claro'];

export default function ColorBar() {
  const nav = useNavigate();
  const location = useLocation();
  const { session, profile, activeArtist } = useAuth();
  const tmr = useTimer();
  const [toast, setToast] = useToast();
  const SESSION_KEY = 'bylolo_color_session';
  const restoredRef = useRef(false);
  const readyRef = useRef(false);

  // ---------- catálogos ----------
  const [clients, setClients] = useState([]);
  const [appts, setAppts] = useState([]);
  const [tones, setTones] = useState({});           // {marca:{gama:[productos]}}
  const [rules, setRules] = useState(FALLBACK_RULES);
  const [suppliesCat, setSuppliesCat] = useState([]);
  const [servicesCat, setServicesCat] = useState([]);
  const [peroxProducts, setPeroxProducts] = useState([]);

  // ---------- flujo ----------
  const [screen, setScreen] = useState(1);
  const [client, setClient] = useState(null);
  const [appointmentId, setAppointmentId] = useState(null);
  const [hist, setHist] = useState(null);
  const [brandView, setBrandView] = useState('KULL');
  const [gamaView, setGamaView] = useState('');
  const [mix, setMix] = useState([]);               // [{p, g}]
  const [baseLevel, setBaseLevel] = useState(5);
  const [mode, setMode] = useState('sugerida');
  const [peroxRows, setPeroxRows] = useState([]);
  const [extra, setExtra] = useState('');
  const [doneSteps, setDoneSteps] = useState([]);
  const [svcItems, setSvcItems] = useState([]);
  const [treatments, setTreatments] = useState([]);   // [{product, grams, price}]
  const [treatmentCat, setTreatmentCat] = useState([]); // insumos de tratamiento
  const [showTreat, setShowTreat] = useState(false);
  const [services, setServices] = useState([]);
  const [prods, setProds] = useState([]);
  const [savedJobId, setSavedJobId] = useState(null);
  const [payMethod, setPayMethod] = useState('efectivo');
  const [discountPct, setDiscountPct] = useState(0);
  const [nextAppt, setNextAppt] = useState(null);
  const [showNextAppt, setShowNextAppt] = useState(false);
  const [busy, setBusy] = useState(false);
  // ---------- carga inicial ----------
  useEffect(() => {
    (async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const [c, a, p, b, s, sc, px, tr] = await Promise.all([
        supabase.from('clients').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.from('appointments').select('id, datetime, client_id, client_name, reason, clients(id, full_name)').gte('datetime', start.toISOString()).lte('datetime', end.toISOString()).order('datetime'),
        supabase.from('products').select('*').in('class', ['Tinte', 'Decolorante']).eq('status', 'Activo').order('gama').order('name'),
        supabase.from('color_brands').select('*').eq('active', true),
        supabase.from('service_supplies').select('*').eq('active', true),
        supabase.from('service_catalog').select('*').eq('active', true),
        supabase.from('products').select('*').eq('class', 'Peroxido').eq('status', 'Activo'),
        supabase.from('products').select('*').eq('class', 'Tratamiento').eq('status', 'Activo').order('name'),
      ]);
      setClients(c.data || []);
      setAppts(a.data || []);
      const grouped = {};
      (p.data || []).forEach(t => {
        const brand = t.brand || 'OTRA';
        const gama = t.gama || t.class || 'GENERAL';
        grouped[brand] = grouped[brand] || {};
        grouped[brand][gama] = grouped[brand][gama] || [];
        grouped[brand][gama].push(t);
      });
      setTones(grouped);
      const firstBrand = grouped['KULL'] ? 'KULL' : Object.keys(grouped)[0];
      setBrandView(firstBrand || 'KULL');
      setGamaView(firstBrand ? Object.keys(grouped[firstBrand])[0] : '');
      const r = { ...FALLBACK_RULES };
      (b.data || []).forEach(br => { r[br.name] = { ...FALLBACK_RULES[br.name], ...br.rules }; });
      setRules(r);
      setSuppliesCat(s.data || []);
      setSvcItems((s.data || []).filter(x => x.auto_add).map(x => ({ supply_id: x.id, name: x.name, cost: Number(x.cost), auto: true })));
      setServicesCat(sc.data || []);
      setPeroxProducts(px.data || []);
      setTreatmentCat(tr.data || []);
      // preselección desde el dashboard
      const st = location.state;
      if (st?.clientId) {
        const found = (c.data || []).find(x => x.id === st.clientId);
        if (found) { setClient(found); if (st.appointmentId) setAppointmentId(st.appointmentId); setScreen(2); }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const primaryBrand = mix.length ? (mix[0].p.brand || 'KULL') : (doneSteps.length ? doneSteps[doneSteps.length - 1].brand : 'KULL');
  const R = rules[primaryBrand] || FALLBACK_RULES['KULL'];
  const stepNum = doneSteps.length + 1;

  // ---------- sugerencia de fórmula ----------
  const suggestion = useMemo(() => {
    if (!mix.length) return { ratio: 0, vol: 0, note: '', extras: [], warns: [] };
    const totalG = mix.reduce((a, m) => a + m.g, 0);
    const cls = mix.map(m => classifyTone(m.p));
    const hasFunny = cls.some(c => c.isFunny), hasBleach = cls.some(c => c.isBleach);
    const hasMetal = cls.some(c => c.isMetal), hasSuper = cls.some(c => c.isSuper);
    const lvls = mix.map(m => targetLevelOf(m.p.name)).filter(x => x != null);
    const targetLv = lvls.length ? Math.max(...lvls) : null;
    let sug = { ratio: R.ratio ?? 1.5, vol: 20, note: '', extras: [] };
    const warns = [];
    if (hasFunny && mix.length > 1) warns.push('Estás mezclando un tono Funny con otros productos: los Funny son de aplicación directa y NO se mezclan con peróxido.');
    if (hasFunny && mix.length === 1) {
      sug = { ratio: 0, vol: 0, note: 'Aplicación directa. NO mezclar con peróxido.', extras: [] };
      const fl = funnyLevel(mix[0].p.name);
      if (fl > baseLevel) warns.push(`Este Funny requiere base decolorada a nivel ${fl}; la base actual es ${baseLevel}.`);
    } else if (hasBleach) {
      sug = { ratio: R.bleach_ratio || 3, vol: 30, note: 'Luminous: 1 + 3 (ej. 30 g + 90 ml). Hasta 50 min según diagnóstico.', extras: [] };
    } else if (hasMetal) {
      sug = { ratio: R.ratio ?? 1.5, vol: 10, note: 'Metálicos: sobre decoloración previa, con 10 vol.', extras: [] };
      if (baseLevel < 9) warns.push('Los metálicos requieren decoloración previa (base clara). Base actual: nivel ' + baseLevel + '.');
    } else if (hasSuper) {
      sug = { ratio: R.super_ratio || 2, vol: primaryBrand === 'KULL' ? 40 : 30, note: primaryBrand === 'KULL' ? 'Súper aclarantes KÜÜL: 1+2. Sobre cabello decolorado usar solo 10 vol.' : 'Ultraaclarantes: hasta 4 tonos de aclaración.', extras: [] };
    } else if (targetLv != null) {
      const v = suggestVol(primaryBrand, baseLevel, targetLv);
      sug = { ratio: R.ratio ?? 1.5, vol: v.vol, note: v.note, extras: v.add000 ? ['000'] : [] };
      if (v.needBleach) warns.push(v.note);
    }
    const brands = [...new Set(mix.map(m => m.p.brand))];
    if (brands.length > 1 && !hasFunny) sug.note += (sug.note ? ' · ' : '') + `Mezcla de marcas: se usa la proporción de ${primaryBrand} (${R.label}).`;
    return { ...sug, warns, totalG };
  }, [mix, baseLevel, primaryBrand, R]);

  // ---------- componentes a pesar ----------
  const builtComps = useMemo(() => {
    if (!mix.length) return [];
    const comps = [];
    mix.forEach(m => comps.push({
      key: 'tinte', product_id: m.p.id, name: `${m.p.name} · ${m.p.gama || m.p.class}`,
      g: m.g, color: toneColor(m.p.name, m.p.gama),
      cost: m.p.gramos_por_pieza > 0 ? Number(m.p.cost) / Number(m.p.gramos_por_pieza) : 0,
      type: classifyTone(m.p).isBleach ? 'decolorante' : 'tinte',
    }));
    let base = mix.reduce((a, m) => a + m.g, 0);
    if (extra === '000') { comps.push({ key: '000', name: 'KÜÜL 000 Reforzador', g: base, color: '#f4ecd9', cost: 0.5, type: 'aditivo' }); base *= 2; }
    const pName = R.perox_name || 'Peróxido';
    const rowsToUse = mode === 'custom'
      ? peroxRows.filter(r => r.vol > 0 && r.g > 0)
      : (suggestion.ratio > 0 && suggestion.vol > 0 ? [{ vol: suggestion.vol, g: Math.round(base * suggestion.ratio) }] : []);
    rowsToUse.forEach(r => {
      const pp = peroxProducts.find(x => (x.name || '').includes(String(r.vol)));
      comps.push({
        key: 'peroxido', product_id: pp?.id || null, name: `${pName} · ${r.vol} vol`, peroxide_vol: r.vol,
        g: r.g, color: '#f2b33d',
        cost: pp && pp.gramos_por_pieza > 0 ? Number(pp.cost) / Number(pp.gramos_por_pieza) : 0.18, type: 'peroxido',
      });
    });
    if (extra === 'olaplex') comps.push({ key: 'olaplex', name: 'Olaplex 4 en 1', g: 4, color: '#cfd6f5', cost: 3, type: 'aditivo' });
    if (extra === 'matiz') comps.push({ key: 'matiz', name: 'Gotas de matiz', g: 2, color: '#b07fe8', cost: 2.5, type: 'aditivo' });
    return comps;
  }, [mix, mode, peroxRows, extra, suggestion, R, peroxProducts]);

  // ---------- báscula ----------
  const [weighComps, setWeighComps] = useState([]);
  const [weights, setWeights] = useState([]);
  const [compIdx, setCompIdx] = useState(0);
  const [curGrams, setCurGrams] = useState(0);
  const [bleOn, setBleOn] = useState(false);
  const [diag, setDiag] = useState(false);
  const [diagLog, setDiagLog] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  // ---- Restaurar sesión en curso (para volver al paso tras salir o recargar) ----
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (location.state?.clientId) { readyRef.current = true; return; }
    try {
      const snap = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (snap && snap.client) {
        setClient(snap.client); setAppointmentId(snap.appointmentId || null);
        setBrandView(snap.brandView || 'KULL'); setGamaView(snap.gamaView || '');
        setMix(snap.mix || []); setBaseLevel(snap.baseLevel ?? 5); setMode(snap.mode || 'sugerida');
        setPeroxRows(snap.peroxRows || []); setExtra(snap.extra || '');
        setDoneSteps(snap.doneSteps || []); setSvcItems(snap.svcItems || []);
        setTreatments(snap.treatments || []); setServices(snap.services || []); setProds(snap.prods || []);
        setWeighComps(snap.weighComps || []); setWeights(snap.weights || []); setCompIdx(snap.compIdx || 0);
        setSavedJobId(snap.savedJobId || null); setDiscountPct(snap.discountPct || 0); setPayMethod(snap.payMethod || 'efectivo');
        setScreen(snap.screen || 2);
        setToast('↩ Se restauró el servicio en curso');
      }
    } catch (e) {}
    readyRef.current = true;
  }, []);

  // ---- Guardar sesión cuando cambian los datos del trabajo ----
  useEffect(() => {
    if (!readyRef.current || !client) return;
    const snap = { screen, client, appointmentId, brandView, gamaView, mix, baseLevel, mode, peroxRows, extra, doneSteps, svcItems, treatments, services, prods, weighComps, weights, compIdx, savedJobId, discountPct, payMethod };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(snap)); } catch (e) {}
  }, [screen, client, appointmentId, brandView, gamaView, mix, baseLevel, mode, peroxRows, extra, doneSteps, svcItems, treatments, services, prods, weighComps, weights, compIdx, savedJobId, discountPct, payMethod]);
  const simRef = useRef(0);
  const pourRef = useRef(false);
  const rafRef = useRef(null);
  const bleRef = useRef(null);
  const offsetRef = useRef(0);
  const lastRawRef = useRef(0);
  const inTargetRef = useRef(null);
  const stateRef = useRef({});
  stateRef.current = { screen, compIdx, weighComps, curGrams };

  function startWeigh() {
    setWeighComps(builtComps.map(c => ({ ...c })));
    setWeights(builtComps.map(() => 0));
    setCompIdx(0); simRef.current = 0; setCurGrams(0);
    offsetRef.current = lastRawRef.current;
  }
  function tare(silent) {
    offsetRef.current = lastRawRef.current; simRef.current = 0; setCurGrams(0);
    if (bleRef.current) bleRef.current.tare();
    if (!silent) setToast('Tara ✓');
  }
  function completeComponent() {
    const { compIdx: i, curGrams: g } = stateRef.current;
    inTargetRef.current = null;
    setWeights(w => { const n = [...w]; n[i] = g; return n; });
    setCompIdx(i + 1);
    simRef.current = 0; tare(true);
    beep(880, .12); if (navigator.vibrate) navigator.vibrate(80);
    if (i + 1 >= stateRef.current.weighComps.length) { beep(1320, .25); setToast('✓ Mezcla completa — pasa al temporizador'); }
  }
  // verificación de permanencia en objetivo (corre siempre, no solo al verter)
  useEffect(() => {
    const int = setInterval(() => {
      const { screen: sc, compIdx: i, weighComps: wc, curGrams: g } = stateRef.current;
      if (sc !== 4) return;
      const c = wc[i]; if (!c) return;
      const near = Math.abs(g - c.g) <= TOL && g > 0;
      if (near) {
        if (!inTargetRef.current) inTargetRef.current = Date.now();
        else if (Date.now() - inTargetRef.current > 1500) completeComponent();
      } else inTargetRef.current = null;
    }, 200);
    return () => clearInterval(int);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pourLoop() {
    if (!pourRef.current) return;
    const { compIdx: i, weighComps: wc } = stateRef.current;
    const c = wc[i];
    if (c && !bleRef.current) {
      const remaining = c.g - simRef.current;
      const rate = remaining > 15 ? 0.9 : remaining > 4 ? 0.35 : 0.12;
      simRef.current = Math.max(0, simRef.current + rate + Math.random() * .06);
      setCurGrams(simRef.current);
    }
    rafRef.current = requestAnimationFrame(pourLoop);
  }
  const startPour = (e) => { e.preventDefault(); pourRef.current = true; pourLoop(); };
  const stopPour = () => { pourRef.current = false; cancelAnimationFrame(rafRef.current); };

  async function connectScale() {
    try {
      const s = await connectSkale({
        onWeight: (raw) => { lastRawRef.current = raw; setCurGrams(Math.max(0, raw - offsetRef.current)); },
        onRaw: (hex) => setDiagLog(l => ('RX: ' + hex + '\n' + l).slice(0, 4000)),
        onDisconnect: () => { bleRef.current = null; setBleOn(false); },
      });
      bleRef.current = s; setBleOn(true);
    } catch (err) { setToast('⚠ ' + err.message); setDiagLog(l => ('Error: ' + err.message + '\n' + l).slice(0, 4000)); }
  }
  function addMidComp(kind, customName, customG) {
    let c = null;
    const totalTinte = mix.reduce((a, m) => a + m.g, 0);
    if (kind === 'olaplex') c = { key: 'olaplex', name: 'Olaplex 4 en 1', g: 4, color: '#cfd6f5', cost: 3, type: 'aditivo' };
    if (kind === 'matiz') c = { key: 'matiz', name: 'Gotas de matiz', g: 2, color: '#b07fe8', cost: 2.5, type: 'aditivo' };
    if (kind === '000') c = { key: '000', name: 'KÜÜL 000 Reforzador', g: totalTinte, color: '#f4ecd9', cost: 0.5, type: 'aditivo' };
    if (kind === 'perox') c = { key: 'peroxido', name: (R.perox_name || 'Peróxido') + ' (extra)', g: 20, color: '#f2b33d', cost: 0.18, type: 'peroxido' };
    if (kind === 'otro') {
      if (!customName || !customG) return setToast('Escribe nombre y gramos');
      c = { key: 'otro', name: customName, g: customG, color: '#9aa3b5', cost: 1.5, type: 'otro' };
    }
    if (!c) return;
    setWeighComps(w => [...w, c]); setWeights(w => [...w, 0]);
    setShowAdd(false); setToast('＋ ' + c.name + ' agregado a la cola');
  }

  // ---------- temporizador (global persistente) ----------
  // dur/left/running/alert vienen del contexto global; sobreviven navegación y recarga.
  const timerSecs = tmr.dur;
  const timerLeft = tmr.left;
  const timerOn = tmr.running;
  const timerAlert = tmr.alert;
  const fmtT = (s) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

  // ---------- pasos / guardar ----------
  function currentStepObj() {
    return {
      brand: primaryBrand,
      is_custom: mode === 'custom' || weighComps.length > builtComps.length,
      base_level: baseLevel,
      pose_minutes: Math.round(timerSecs / 60) || null,
      comps: weighComps.map((c, i) => ({ ...c, actual_g: weights[i] || c.g })),
    };
  }
  function addAnotherStep() {
    setDoneSteps(s => [...s, currentStepObj()]);
    setMix([]); setMode('sugerida'); setPeroxRows([]); setExtra('');
    setWeighComps([]); setWeights([]); setCompIdx(0);
    tmr.reset();
    setToast(`Etapa ${doneSteps.length + 2}: elige los colores de la siguiente aplicación`);
    setScreen(2);
  }
  function discardSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    tmr.clear();
    setClient(null); setAppointmentId(null); setMix([]); setMode('sugerida'); setPeroxRows([]); setExtra('');
    setDoneSteps([]); setSvcItems([]); setTreatments([]); setServices([]); setProds([]);
    setWeighComps([]); setWeights([]); setCompIdx(0); setSavedJobId(null); setDiscountPct(0); setPayMethod('efectivo');
    setScreen(1);
    setToast('Servicio descartado');
  }
  async function saveWork() {
    if (busy) return;
    setBusy(true);
    try {
      const allSteps = [...doneSteps, currentStepObj()];
      const { data: job, error: e1 } = await supabase.from('color_jobs').insert({
        client_id: client.id, artist_id: activeArtist.id, appointment_id: appointmentId,
        base_level: baseLevel, status: 'done', finished_at: new Date().toISOString(),
      }).select().single();
      if (e1) throw e1;
      for (let i = 0; i < allSteps.length; i++) {
        const st = allSteps[i];
        const { data: stepRow, error: e2 } = await supabase.from('color_job_steps').insert({
          job_id: job.id, step_number: i + 1, brand: st.brand, is_custom: st.is_custom, pose_minutes: st.pose_minutes,
        }).select().single();
        if (e2) throw e2;
        const compRows = st.comps.map((c, idx) => ({
          step_id: stepRow.id, product_id: c.product_id || null, component_type: c.type,
          name: c.name, peroxide_vol: c.peroxide_vol || null,
          target_g: c.g, actual_g: c.actual_g, unit_cost_per_g: c.cost || 0, position: idx,
        }));
        const { error: e3 } = await supabase.from('color_step_components').insert(compRows);
        if (e3) throw e3;
        // descuento de inventario por gramos consumidos
        for (const c of st.comps) {
          if (!c.product_id) continue;
          const { data: prod } = await supabase.from('products').select('current_stock, gramos_por_pieza').eq('id', c.product_id).single();
          if (!prod || !prod.gramos_por_pieza) continue;
          const pieces = c.actual_g / Number(prod.gramos_por_pieza);
          const after = Math.max(0, Number(prod.current_stock) - pieces);
          await supabase.from('products').update({ current_stock: after }).eq('id', c.product_id);
          await supabase.from('inventory_movements').insert({
            product_id: c.product_id, user_id: activeArtist.id, type: 'consumo_color',
            quantity_before: prod.current_stock, quantity_after: after, grams: c.actual_g,
            notes: `Barra de Color · trabajo ${job.id.slice(0, 8)}`,
          });
        }
      }
      if (svcItems.length) {
        await supabase.from('color_job_supplies').insert(svcItems.map(s => ({
          job_id: job.id, supply_id: s.supply_id || null, name: s.name, cost: s.cost,
        })));
      }
      // tratamientos: descuenta gramos del inventario como costo de insumo
      for (const t of treatments) {
        if (!t.grams || !t.product.gramos_por_pieza) continue;
        const { data: prod } = await supabase.from('products').select('current_stock, gramos_por_pieza').eq('id', t.product.id).single();
        if (!prod) continue;
        const pieces = t.grams / Number(prod.gramos_por_pieza);
        const after = Math.max(0, Number(prod.current_stock) - pieces);
        await supabase.from('products').update({ current_stock: after }).eq('id', t.product.id);
        await supabase.from('inventory_movements').insert({
          product_id: t.product.id, user_id: activeArtist.id, type: 'consumo_color',
          quantity_before: prod.current_stock, quantity_after: after, grams: t.grams,
          notes: `Tratamiento · trabajo ${job.id.slice(0, 8)}`,
        });
      }
      // agrega los tratamientos como servicios cobrables con el precio que puso el artista
      if (treatments.length) {
        setServices(prev => [...prev, ...treatments.filter(t => t.price > 0).map(t => ({ name: t.product.name, price: Number(t.price) }))]);
      }
      setSavedJobId(job.id);
      setToast('✓ Fórmula guardada en historial · inventario descontado');
      setScreen(7);
      if (!services.length) setServices([{ name: 'Color global', price: 950 }]);
    } catch (err) {
      setToast('⚠ Error al guardar: ' + err.message);
    } finally { setBusy(false); }
  }

  // ---------- cobro ----------
  const allSupplyCost = svcItems.reduce((a, b) => a + Number(b.cost), 0);
  const treatmentCost = treatments.reduce((a, t) => a + (Number(t.grams) || 0) * (Number(t.product.cost) / (Number(t.product.gramos_por_pieza) || 1)), 0);
  const insumosCost = [...doneSteps, ...(weighComps.length ? [currentStepObj()] : [])]
    .reduce((a, st) => a + st.comps.reduce((x, c) => x + (c.actual_g || c.g) * (c.cost || 0), 0), 0) + allSupplyCost + treatmentCost;
  const totSvc = services.reduce((a, b) => a + Number(b.price), 0);
  const totProdBruto = prods.reduce((a, b) => a + Number(b.price), 0);
  const giftDiscount = prods.filter(p => p.is_gift).reduce((a, b) => a + Number(b.price), 0);
  const giftCost = prods.filter(p => p.is_gift).reduce((a, b) => a + Number(b.cost || 0), 0);
  const prodsCostAll = prods.reduce((a, b) => a + Number(b.cost || 0), 0); // costo de TODOS los productos
  const totProd = totProdBruto - giftDiscount;
  const beforeDiscount = totSvc + totProd;
  const discountAmount = beforeDiscount * (Number(discountPct || 0) / 100);
  const totalCobrar = Math.max(0, beforeDiscount - discountAmount);
  const cardFee = payMethod === 'tarjeta' ? totalCobrar * CARD_FEE : 0;

  async function chargeAll() {
    if (busy) return;
    setBusy(true);
    try {
      const { data: sale, error: e1 } = await supabase.from('sales').insert({
        user_id: activeArtist.id, client_id: client.id, appointment_id: appointmentId,
        service_name: services.map(s => s.name).join(' + ') || 'Barra de Color',
        service_price: totSvc, subtotal: beforeDiscount, total: totalCobrar,
        financial_cost: Math.round(insumosCost + cardFee + prodsCostAll), payment_method: payMethod,
        products_cost: Math.round(prodsCostAll), supplies_cost: Math.round(insumosCost), card_cost: Math.round(cardFee),
        discount_pct: discountPct, gift_value: Math.round(giftDiscount),
        notes: 'Barra de Color' + (payMethod === 'tarjeta' ? ` · comisión tarjeta $${cardFee.toFixed(0)}` : '') + (giftCost > 0 ? ` · regalos costo $${giftCost.toFixed(0)}` : ''),
      }).select().single();
      if (e1) throw e1;
      const items = [
        ...services.map(s => ({ sale_id: sale.id, item_type: 'servicio', name: s.name, quantity: 1, unit_price: s.price, total_price: s.price })),
        ...prods.map(p => ({ sale_id: sale.id, item_type: 'producto', product_id: p.id || null, name: p.name, quantity: 1, unit_price: p.price, total_price: p.is_gift ? 0 : p.price, is_gift: !!p.is_gift, gift_cost: p.is_gift ? Number(p.cost || 0) : 0 })),
      ];
      if (items.length) await supabase.from('sale_items').insert(items);
      if (savedJobId) await supabase.from('color_jobs').update({ sale_id: sale.id, status: 'charged' }).eq('id', savedJobId);
      if (appointmentId) await supabase.from('appointments').update({ status: 'paid', total: totalCobrar }).eq('id', appointmentId);
      // estrella de lealtad por el servicio
      if (client) await supabase.rpc('add_loyalty_stamp', { p_client_id: client.id, p_delta: 1, p_note: 'Servicio Barra de Color' });
      if (nextAppt) {
        await supabase.from('appointments').insert({
          datetime: nextAppt.date.toISOString(), artist_id: activeArtist.id, client_id: client.id,
          client_name: client.full_name, reason: nextAppt.svc, status: 'scheduled', is_maintenance: true,
        });
      }
      setToast(`💵 Cobrado $${totalCobrar.toLocaleString()} · visita cerrada`);
      try { localStorage.removeItem('bylolo_color_session'); } catch (e) {}
      tmr.clear();
      setTimeout(() => nav('/'), 1600);
    } catch (err) { setToast('⚠ ' + err.message); } finally { setBusy(false); }
  }

  // ---------- navegación ----------
  function go(n) {
    if (n === 4) startWeigh();
    setScreen(n);
    window.scrollTo({ top: 0 });
  }
  function navNext() {
    if (screen === 1 && !client) return setToast('Elige un cliente o cita primero');
    if (screen === 2 && !mix.length) return setToast('Toca al menos un tono');
    if (screen === 4 && compIdx < weighComps.length) return setToast('Aún falta pesar componentes');
    go(screen + 1);
  }

  async function openHistory(c) {
    const { data: jobs } = await supabase.from('color_jobs')
      .select('id, created_at, base_level, color_job_steps(step_number, brand, is_custom, pose_minutes, color_step_components(name, peroxide_vol, actual_g, target_g))')
      .eq('client_id', c.id).order('created_at', { ascending: false }).limit(10);
    setHist({ client: c, jobs: jobs || [] });
  }

  // ============================================================ RENDER
  const curComp = weighComps[compIdx];
  const pct = curComp ? Math.max(0, Math.min(1.15, curGrams / curComp.g)) : 0;
  const near = curComp && Math.abs(curGrams - curComp.g) <= TOL && curGrams > 0;
  const over = curComp && curGrams > curComp.g + TOL;
  const liquidH = Math.min(1, pct) * 252;
  const liquidColor = over ? 'var(--danger)' : near ? 'var(--ok)' : (curComp?.color || 'var(--pigment)');

  return (
    <Shell title="Barra de Color"
      sub={client ? `Cliente: ${client.full_name || 'Sin nombre'}` : 'Sin cliente seleccionado'}
      badge={<>
        {screen >= 2 && screen <= 5 && <span className="stepbadge">Paso {stepNum}</span>}
        {(timerOn || timerAlert) && (
          <button className={'chip-timer num' + (timerAlert ? ' alert' : '')} onClick={() => go(5)}>⏱ {fmtT(timerLeft)}</button>
        )}
        {client && <button className="iconbtn" title="Descartar servicio en curso" onClick={discardSession}>✕</button>}
      </>}>
      <div className="steps">
        {STEPS_BAR.map((s, i) => (
          <div key={s} className={'step' + (i + 1 === screen ? ' active' : '') + (i + 1 < screen ? ' done' : '')}>{s}</div>
        ))}
      </div>

      {/* ============ 1. CLIENTE / AGENDA ============ */}
      {screen === 1 && (
        <section className="screen">
          <h2>Agenda de hoy</h2>
          <p className="lead">Toca una cita para trabajarla, o elige un cliente de la lista.</p>
          {appts.map(a => {
            const t = new Date(a.datetime);
            const isNow = Math.abs(t.getTime() - Date.now()) < 30 * 60000;
            return (
              <button key={a.id} className={'appt' + (isNow ? ' now' : '')} onClick={() => {
                const c = clients.find(x => x.id === a.client_id);
                if (c) { setAppointmentId(a.id); openHistory(c); }
              }}>
                <div className="time num">{t.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{a.clients?.full_name || a.client_name || 'Cliente'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '.82rem' }}>{a.reason || 'Servicio'}</div>
                </div>
                {isNow && <span className="tag ok">AHORA</span>}
              </button>
            );
          })}
          <h2 style={{ fontSize: '1.15rem', margin: '22px 0 4px' }}>Clientes</h2>
          <p className="lead">Toca para ver historial capilar y formular.</p>
          {clients.map(c => (
            <button key={c.id} className="list-item" onClick={() => openHistory(c)}>
              <div className="avatar">{(c.full_name || '?').split(' ').map(p => p[0]).slice(0, 2).join('')}</div>
              <div className="meta">
                <div className="name">{c.full_name || 'Sin nombre'}</div>
                <div className="sub">{c.phone || 'sin teléfono'}</div>
              </div>
              <span className="tag pig">Historial</span>
            </button>
          ))}
          <button className="btn ghost" style={{ width: '100%' }} onClick={() => nav('/clientes')}>＋ Cliente nuevo (en módulo Clientes)</button>
        </section>
      )}

      {/* ============ 2. COLORES ============ */}
      {screen === 2 && (
        <section className="screen">
          <h2>{doneSteps.length ? `Paso ${stepNum}: elige los colores` : 'Elige tus colores'}</h2>
          <p className="lead">Toca uno o varios tonos — puedes combinar gamas y marcas. Stock en vivo de tu inventario.</p>
          <div className="brand-toggle">
            {Object.keys(tones).map(b => (
              <button key={b} className={'pill' + (b === brandView ? ' sel' : '')}
                onClick={() => { setBrandView(b); setGamaView(Object.keys(tones[b])[0]); }}>
                {b === 'KULL' ? 'KÜÜL' : b}
              </button>
            ))}
          </div>
          <div className="pill-grid">
            {Object.keys(tones[brandView] || {}).map(g => (
              <button key={g} className={'pill' + (g === gamaView ? ' sel' : '')} onClick={() => setGamaView(g)}>{g}</button>
            ))}
          </div>
          <div className="tone-grid">
            {(tones[brandView]?.[gamaView] || []).map(p => {
              const inMix = mix.some(m => m.p.id === p.id);
              const stock = Number(p.current_stock);
              return (
                <button key={p.id} className={'tone' + (inMix ? ' sel' : '') + (stock <= 0 ? ' nostock' : '')}
                  onClick={() => {
                    if (stock <= 0) return setToast('Sin existencia');
                    setMix(m => inMix ? m.filter(x => x.p.id !== p.id) : [...m, { p, g: m.length ? 20 : 60 }]);
                  }}>
                  {inMix && <span className="check">✓</span>}
                  <span className="swatch" style={{ background: toneColor(p.name, p.gama) }} />
                  <span className="tname">{p.name}</span>
                  <span className="tstock">stock: {stock}</span>
                </button>
              );
            })}
          </div>
          {mix.length > 0 && (
            <div className="mixtray">
              <div style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>TU MEZCLA ({mix.length})</div>
              <div>
                {mix.map((m, i) => (
                  <span key={m.p.id} className="mixchip">
                    <span className="sw" style={{ background: toneColor(m.p.name, m.p.gama) }} />{m.p.name}
                    <button onClick={() => setMix(x => x.filter((_, j) => j !== i))}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ============ 3. FÓRMULA ============ */}
      {screen === 3 && mix.length > 0 && (
        <section className="screen">
          <h2>Formulación</h2>
          <p className="lead">Paso {stepNum} · {mix.map(m => m.p.name).join(' + ')} · {primaryBrand === 'KULL' ? 'KÜÜL' : primaryBrand}</p>
          <div className="card">
            <div className="field"><label>Base actual del cliente (altura de tono)</label>
              <div className="level-row">
                {LEVEL_NAMES.map((n, i) => (
                  <button key={i} className={'level' + (baseLevel === i + 1 ? ' sel' : '')} onClick={() => setBaseLevel(i + 1)}>
                    {i + 1}<small>{n}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="field"><label>Gramos por tono</label>
              {mix.map((m, i) => (
                <div key={m.p.id} className="mixline">
                  <span className="sw" style={{ background: toneColor(m.p.name, m.p.gama) }} />
                  <div className="mname">{m.p.name}<small>{m.p.brand} · {m.p.gama}</small></div>
                  <div className="stepper" style={{ maxWidth: 220 }}>
                    <button onClick={() => setMix(x => x.map((y, j) => j === i ? { ...y, g: Math.max(5, y.g - 5) } : y))}>−</button>
                    <div className="val num">{m.g} g</div>
                    <button onClick={() => setMix(x => x.map((y, j) => j === i ? { ...y, g: Math.min(300, y.g + 5) } : y))}>＋</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {suggestion.warns.map((w, i) => <div key={i} className="warnbox">⚠ {w}</div>)}
          <div className="card suggest">
            <span className="tag ok">Fórmula sugerida · guía {primaryBrand === 'KULL' ? 'KÜÜL' : primaryBrand}</span>
            <div className="big" style={{ marginTop: 8 }}>
              {suggestion.ratio === 0 ? 'Aplicación directa (sin peróxido)' :
                `${suggestion.totalG} g de producto + ${Math.round(suggestion.totalG * suggestion.ratio)} g de ${R.perox_name} · ${suggestion.vol} vol`}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: '.88rem', marginTop: 6 }}>
              Mezcla {suggestion.ratio === 0 ? '—' : `1 : ${suggestion.ratio}`} {suggestion.note && ` · ${suggestion.note}`}
            </div>
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className={'btn' + (mode === 'sugerida' ? ' ok' : '')} onClick={() => setMode('sugerida')}>✓ Fórmula sugerida</button>
            <button className={'btn' + (mode === 'custom' ? ' warn' : ' ghost')} onClick={() => {
              setMode('custom');
              if (!peroxRows.length) setPeroxRows([{ vol: suggestion.vol || 20, g: Math.round((suggestion.totalG || 60) * (suggestion.ratio || 1)) }]);
            }}>✎ Personalizada</button>
          </div>
          {mode === 'custom' && (
            <div className="card">
              <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>Fórmula personalizada</h3>
              <div className="field"><label>Peróxidos — puedes usar varios volúmenes en la misma fórmula</label>
                {peroxRows.map((r, i) => (
                  <div key={i} className="perox-row">
                    <select value={r.vol} onChange={e => setPeroxRows(rows => rows.map((x, j) => j === i ? { ...x, vol: +e.target.value } : x))}>
                      {[0, 10, 20, 30, 40].map(v => <option key={v} value={v}>{v === 0 ? 'Sin peróxido' : `${v} vol (${v * 0.3}%)`}</option>)}
                    </select>
                    <input type="number" inputMode="decimal" value={r.g}
                      onChange={e => setPeroxRows(rows => rows.map((x, j) => j === i ? { ...x, g: +e.target.value || 0 } : x))} />
                    <span style={{ color: 'var(--muted)', fontWeight: 700 }}>g</span>
                    {peroxRows.length > 1 && <button className="del" onClick={() => setPeroxRows(rows => rows.filter((_, j) => j !== i))}>✕</button>}
                  </div>
                ))}
                <button className="btn sm" style={{ width: '100%' }} onClick={() => setPeroxRows(r => [...r, { vol: 20, g: 30 }])}>＋ Agregar otro peróxido</button>
              </div>
              <div className="field"><label>Aditivo extra (opcional)</label>
                <select value={extra} onChange={e => setExtra(e.target.value)}>
                  <option value="">Ninguno</option>
                  <option value="000">KÜÜL 000 Reforzador (partes iguales)</option>
                  <option value="olaplex">Olaplex 4 en 1 (4 g)</option>
                  <option value="matiz">Gotas de matiz (2 g)</option>
                </select>
              </div>
            </div>
          )}
          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: 10 }}>Se pesará en este orden</h3>
            {builtComps.map((c, i) => (
              <div key={i} className="comp-row">
                <div className="dot" style={{ background: c.color }} />
                <div className="cname">{i + 1}. {c.name}</div>
                <div className="cgr num">{c.g} g</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ============ 4. BÁSCULA ============ */}
      {screen === 4 && (
        <section className="screen">
          <h2>Pesaje en vivo</h2>
          <p className="lead">Coloca el bowl, tara, y vierte hasta llenar la gota.</p>
          <div className="card scale-wrap">
            <div className="scale-status">
              <span className={'dot-live' + (bleOn ? ' on' : '')} />
              <span>{bleOn ? 'SKALE 2 conectada · lectura en vivo' : 'Báscula no conectada · usando simulador'}</span>
            </div>
            <div className="drop-stage">
              <svg viewBox="0 0 200 260" width="100%" aria-hidden="true">
                <defs><clipPath id="dropClip"><path d="M100 8 C100 8 32 110 32 168 a68 68 0 0 0 136 0 C168 110 100 8 100 8 Z" /></clipPath></defs>
                <path d="M100 8 C100 8 32 110 32 168 a68 68 0 0 0 136 0 C168 110 100 8 100 8 Z" fill="rgba(0,0,0,.35)" stroke="var(--line)" strokeWidth="3" />
                <g clipPath="url(#dropClip)">
                  <rect x="0" y={260 - liquidH} width="200" height="260" fill={liquidColor} />
                </g>
                <path d="M100 8 C100 8 32 110 32 168 a68 68 0 0 0 136 0 C168 110 100 8 100 8 Z" fill="none"
                  stroke={near ? 'var(--ok)' : over ? 'var(--danger)' : 'rgba(127,127,127,.25)'} strokeWidth="3" />
              </svg>
            </div>
            <div className="gram-counter num">{curGrams.toFixed(1)}<small> g</small></div>
            <div className="pct num">{Math.round(pct * 100)} %</div>
            <div className="target-label">
              Pesando: <b>{curComp ? curComp.name : '¡Mezcla completa!'}</b><br />
              objetivo <b className="num">{curComp ? curComp.g + ' g' : '—'}</b>
            </div>
            <div className="row" style={{ width: '100%' }}>
              <button className="btn" onClick={() => tare()}>⟲ Tara</button>
              <button className="btn warn" onClick={connectScale}>{bleOn ? '✓ Conectada' : '🔗 SKALE 2'}</button>
              <button className="btn" onClick={() => setShowAdd(true)}>＋ Aditivo</button>
            </div>
            {(near || over) && curComp && (
              <button className="btn xl ok" style={{ width: '100%' }} onClick={completeComponent}>✓ Listo, siguiente componente →</button>
            )}
            {curComp && !bleOn && (
              <button className="btn xl primary" style={{ width: '100%' }}
                onPointerDown={startPour} onPointerUp={stopPour} onPointerLeave={stopPour}
                onTouchStart={startPour} onTouchEnd={stopPour} onTouchCancel={stopPour}>
                Mantén presionado para verter (simulador)
              </button>
            )}
            <button className="btn ghost sm" style={{ width: '100%' }} onClick={() => setDiag(d => !d)}>Modo diagnóstico báscula</button>
            {diag && <div className="diaglog">{diagLog || 'Esperando datos de la báscula…'}</div>}
          </div>
          <div className="queue">
            {weighComps.map((c, i) => (
              <div key={i} className={'comp-row' + (i < compIdx ? ' donecomp' : i === compIdx ? ' activecomp' : '')}>
                <div className="dot" style={{ background: c.color }} />
                <div className="cname">{c.name}</div>
                <div className="cgr num">{i < compIdx ? '✓ ' + (weights[i] || 0).toFixed(1) : c.g} g</div>
              </div>
            ))}
          </div>
          <Modal open={showAdd} onClose={() => setShowAdd(false)}>
            <h3 style={{ marginBottom: 6 }}>Agregar a la mezcla</h3>
            <p style={{ color: 'var(--muted)', fontSize: '.85rem', margin: '0 0 14px' }}>Se añade a la cola de pesaje sin perder lo ya pesado.</p>
            <div className="row" style={{ marginBottom: 10 }}>
              <button className="btn" onClick={() => addMidComp('olaplex')}>Olaplex 4 en 1 · 4 g</button>
              <button className="btn" onClick={() => addMidComp('matiz')}>Gotas de matiz · 2 g</button>
            </div>
            <div className="row" style={{ marginBottom: 14 }}>
              <button className="btn" onClick={() => addMidComp('000')}>KÜÜL 000 Reforzador</button>
              <button className="btn" onClick={() => addMidComp('perox')}>Más peróxido · 20 g</button>
            </div>
            <AddOtherForm onAdd={(n, g) => addMidComp('otro', n, g)} />
            <button className="btn warn" style={{ width: '100%', marginBottom: 8 }} onClick={() => { setShowAdd(false); go(3); }}>✎ Volver a editar toda la fórmula</button>
            <button className="btn ghost" style={{ width: '100%' }} onClick={() => setShowAdd(false)}>Cerrar</button>
          </Modal>
        </section>
      )}

      {/* ============ 5. TEMPORIZADOR ============ */}
      {screen === 5 && (
        <section className="screen">
          <h2>Temporizador de pose</h2>
          <p className="lead">Botones grandes para guantes. Suena y vibra al terminar. Si sales a otro módulo, aparece una burbuja flotante para volver aquí.</p>
          <div className={'timer-display num' + (timerAlert ? ' alert' : '')}>{fmtT(timerLeft)}</div>
          <div className="preset-grid">
            {(R.timer_presets || []).map(p => (
              <button key={p.m} className="btn xl" onClick={() => tmr.setPreset(p.m * 60, { label: client?.full_name || 'Pose', returnPath: '/color' })}>{p.l}</button>
            ))}
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="btn xl" onClick={() => tmr.addSecs(300)}>＋5 min</button>
            <button className="btn xl" onClick={() => tmr.addSecs(60)}>＋1 min</button>
          </div>
          <div className="row">
            <button className={'btn xl ' + (timerOn ? 'warn' : 'ok')} onClick={() => {
              if (timerLeft <= 0) return setToast('Elige un tiempo primero');
              tmr.toggle({ label: client?.full_name || 'Pose', returnPath: '/color' });
            }}>{timerOn ? '⏸ Pausa' : '▶ Iniciar'}</button>
            <button className="btn xl danger" onClick={() => tmr.reset()}>■ Reiniciar</button>
          </div>
          {timerAlert && (
            <div className="card" style={{ marginTop: 14, textAlign: 'center', borderColor: 'var(--ok)' }}>
              <h3 style={{ marginBottom: 10 }}>✅ ¡Tiempo terminado!</h3>
              <p style={{ color: 'var(--muted)', fontSize: '.86rem', marginBottom: 12 }}>¿Qué sigue con {client?.full_name || 'el cliente'}?</p>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button className="btn xl" onClick={() => tmr.extend(300, { label: client?.full_name || 'Pose', returnPath: '/color' })}>＋5 min más</button>
                <button className="btn xl primary" onClick={addAnotherStep}>➕ Siguiente etapa</button>
                <button className="btn xl ok" onClick={() => { tmr.reset(); go(6); }}>Ir al resumen →</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ============ 6. RESUMEN ============ */}
      {screen === 6 && (
        <section className="screen">
          <h2>Resumen del trabajo</h2>
          <p className="lead">Revisa los pasos. Si el diseño necesita otra aplicación, agrega un paso más.</p>
          {[...doneSteps, currentStepObj()].map((st, i) => (
            <div key={i} className="stepcard">
              <div className="sct">
                Paso {i + 1} · {st.comps.filter(c => c.type === 'tinte' || c.type === 'decolorante').map(c => c.name.split(' ·')[0]).join(' + ')} ({st.brand === 'KULL' ? 'KÜÜL' : st.brand})
                <span className={'tag ' + (st.is_custom ? 'warn' : 'ok')} style={{ marginLeft: 6 }}>{st.is_custom ? 'personalizada' : 'guía'}</span>
              </div>
              <div className="scd">
                {st.comps.map(c => `${Number(c.actual_g || c.g).toFixed(0)} g ${c.name}`).join(' · ')}
                {st.pose_minutes ? ` · pose ${st.pose_minutes} min` : ''} · base nivel {st.base_level}
              </div>
            </div>
          ))}
          <button className="btn xl warn" style={{ width: '100%', marginBottom: 14 }} onClick={addAnotherStep}>＋ Agregar otro paso a la fórmula</button>
          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>Insumos de servicio (costo interno)</h3>
            <p style={{ color: 'var(--muted)', fontSize: '.82rem', margin: '0 0 10px' }}>El insumo "Servicio" se agrega solo: cubre guantes, agua, luz.</p>
            {svcItems.map((s, i) => (
              <div key={i} className="comp-row">
                <div className="cname">{s.name} {s.auto && <span className="tag" style={{ marginLeft: 6 }}>automático</span>}</div>
                <div className="cgr num">${s.cost}</div>
                {!s.auto && <button className="btn ghost sm" onClick={() => setSvcItems(x => x.filter((_, j) => j !== i))}>✕</button>}
              </div>
            ))}
            <div className="pill-grid" style={{ marginTop: 8 }}>
              {suppliesCat.filter(s => !s.auto_add).map(s => (
                <button key={s.id} className="pill" onClick={() => setSvcItems(x => [...x, { supply_id: s.id, name: s.name, cost: Number(s.cost) }])}>
                  ＋ {s.name} ${Number(s.cost)}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h3 style={{ fontSize: '1rem' }}>Tratamientos</h3>
              <button className="btn sm" onClick={() => setShowTreat(t => !t)}>{showTreat ? 'Cerrar' : '＋ Agregar'}</button>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '.82rem', margin: '0 0 10px' }}>
              Ej. pasos de Olaplex. Los gramos se descuentan del inventario como costo; tú pones el precio al cliente.
            </p>
            {showTreat && (
              <div className="pill-grid" style={{ marginBottom: 10 }}>
                {treatmentCat.map(t => (
                  <button key={t.id} className="pill" onClick={() => {
                    setTreatments(x => [...x, { product: t, grams: 0, price: 0 }]); setShowTreat(false);
                  }}>＋ {t.name} <span style={{ color: 'var(--muted)' }}>({t.brand})</span></button>
                ))}
                {treatmentCat.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '.82rem' }}>No hay insumos de clase "Tratamiento" en el inventario.</p>}
              </div>
            )}
            {treatments.map((t, i) => (
              <div key={i} className="card" style={{ background: 'var(--surface2)', padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <b>{t.product.name}</b>
                  <button className="btn ghost sm" onClick={() => setTreatments(x => x.filter((_, j) => j !== i))}>✕</button>
                </div>
                <div className="row">
                  <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Gramos usados</label>
                    <input type="number" inputMode="decimal" value={t.grams || ''}
                      onChange={e => setTreatments(x => x.map((y, j) => j === i ? { ...y, grams: Number(e.target.value) } : y))} />
                  </div>
                  <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Precio al cliente</label>
                    <input type="number" inputMode="decimal" value={t.price || ''}
                      onChange={e => setTreatments(x => x.map((y, j) => j === i ? { ...y, price: Number(e.target.value) } : y))} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button className="btn xl primary" style={{ width: '100%' }} disabled={busy} onClick={saveWork}>
            {busy ? 'Guardando…' : '💾 Guardar fórmula y pasar a cobro →'}
          </button>
        </section>
      )}

      {/* ============ 7. COBRO ============ */}
      {screen === 7 && (
        <section className="screen">
          <h2>Cobro de la visita</h2>
          <p className="lead">Servicios, productos de venta y próxima cita — todo queda en el CRM.</p>
          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: 10 }}>Servicios realizados</h3>
            {services.map((s, i) => (
              <div key={i} className="comp-row">
                <div className="cname">{s.name}</div><div className="cgr num">${Number(s.price)}</div>
                <button className="btn ghost sm" onClick={() => setServices(x => x.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <div className="pill-grid" style={{ marginTop: 10 }}>
              {servicesCat.filter(s => s.discipline !== 'Producto').map(s => (
                <button key={s.id} className="pill" onClick={() => setServices(x => [...x, { name: s.name, price: Number(s.price) }])}>
                  ＋ {s.name} ${Number(s.price)}
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: 10 }}>Productos / mantenimiento en casa</h3>
            {prods.map((p, i) => (
              <div key={i} className="comp-row">
                <div className="cname">{p.name}
                  {p.is_gift && <span className="tag ok" style={{ marginLeft: 6 }}>REGALO</span>}
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                    {p.is_gift ? `Costo regalado: $${Number(p.cost || 0).toFixed(0)} (no se cobra)` : `$${Number(p.price)}`}
                  </div>
                </div>
                <div className="cgr num" style={{ textDecoration: p.is_gift ? 'line-through' : 'none', opacity: p.is_gift ? .5 : 1 }}>${Number(p.price)}</div>
                <button className={'btn ghost sm' + (p.is_gift ? ' ok' : '')} onClick={() => setProds(x => x.map((y, j) => j === i ? { ...y, is_gift: !y.is_gift } : y))} title="Marcar como regalo">🎁</button>
                <button className="btn ghost sm" onClick={() => setProds(x => x.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            {prods.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '.88rem' }}>Sugiere el KIT de mantenimiento 😉</p>}
            <div className="pill-grid" style={{ marginTop: 10 }}>
              {servicesCat.filter(s => s.discipline === 'Producto').map(s => (
                <button key={s.id} className="pill" onClick={() => setProds(x => [...x, { name: s.name, price: Number(s.price), cost: 0 }])}>＋ {s.name} ${Number(s.price)}</button>
              ))}
              <button className="pill" onClick={() => setProds(x => [...x, { name: 'Cuarto Paso (A)', price: 85, cost: 23 }])}>＋ Cuarto Paso (A) $85</button>
              <button className="pill" onClick={() => setProds(x => [...x, { name: 'Cuarto Paso (V)', price: 85, cost: 24 }])}>＋ Cuarto Paso (V) $85</button>
            </div>
          </div>
          <div className="card" style={{ borderColor: 'var(--violet)' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: 6 }}>📅 Próxima cita de mantenimiento</h3>
            <p style={{ color: 'var(--muted)', fontSize: '.84rem', margin: '0 0 10px' }}>
              {nextAppt ? <>✓ Agendada: <b>{nextAppt.date.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })}</b> · {nextAppt.svc}</>
                : 'Según el trabajo, el mantenimiento ideal es en 3–6 semanas.'}
            </p>
            <button className="btn" style={{ width: '100%' }} onClick={() => setShowNextAppt(true)}>Sugerir y agendar próxima cita</button>
          </div>
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
            <div className="total-line"><span>Servicios</span><span className="num">${totSvc.toLocaleString()}</span></div>
            <div className="total-line"><span>Productos</span><span className="num">${totProdBruto.toLocaleString()}</span></div>
            {giftDiscount > 0 && (
              <div className="total-line" style={{ color: 'var(--ok)' }}><span>🎁 Regalado (no se cobra)</span><span className="num">−${giftDiscount.toLocaleString()}</span></div>
            )}
            {discountAmount > 0 && (
              <div className="total-line" style={{ color: 'var(--ok)' }}><span>Descuento {discountPct}%</span><span className="num">−${Math.round(discountAmount).toLocaleString()}</span></div>
            )}
            <div className="total-line big"><span>Total a cobrar ({payMethod})</span><span className="num">${totalCobrar.toLocaleString()}</span></div>
            <div style={{ marginTop: 10, borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
              <p style={{ fontSize: '.72rem', color: 'var(--muted)', margin: '0 0 6px', fontWeight: 700, letterSpacing: '.04em' }}>COSTOS INTERNOS (informativo)</p>
              <div className="info-cost">Insumos + servicio: <b>${insumosCost.toFixed(0)}</b></div>
              {prodsCostAll > 0 && <div className="info-cost">Productos (vendidos o regalados): <b>${prodsCostAll.toFixed(0)}</b></div>}
              {payMethod === 'tarjeta' && (
                <div className="info-cost">Costo financiero tarjeta ({(CARD_FEE * 100).toFixed(1)}%): <b>−${cardFee.toFixed(0)}</b> · no se suma al precio</div>
              )}
              <div className="info-cost" style={{ borderColor: (totalCobrar - insumosCost - prodsCostAll - cardFee) >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
                Utilidad estimada: <b style={{ color: (totalCobrar - insumosCost - prodsCostAll - cardFee) >= 0 ? 'var(--ok)' : 'var(--danger)' }}>${Math.round(totalCobrar - insumosCost - prodsCostAll - cardFee).toLocaleString()}</b>
              </div>
            </div>
          </div>
          <button className="btn xl ok" style={{ width: '100%' }} disabled={busy} onClick={chargeAll}>
            {busy ? 'Procesando…' : '💵 Cobrar y terminar visita'}
          </button>
          <Modal open={showNextAppt} onClose={() => setShowNextAppt(false)}>
            <h3 style={{ marginBottom: 6 }}>📅 Próxima cita de mantenimiento</h3>
            <p style={{ color: 'var(--muted)', fontSize: '.85rem', margin: '0 0 14px' }}>Para {client?.full_name || 'el cliente'}, elige la fecha sugerida (10:00 am, ajustable después en el calendario):</p>
            {[{ d: 21, l: 'Retoque de raíz', svc: 'Retoque + matiz' }, { d: 28, l: 'Mantenimiento de color', svc: 'Color global' }, { d: 42, l: 'Mechas / diseño', svc: 'Mechas mantenimiento' }].map(o => {
              const date = new Date(Date.now() + o.d * 86400000); date.setHours(10, 0, 0, 0);
              return (
                <button key={o.d} className="btn" style={{ width: '100%', marginBottom: 8 }}
                  onClick={() => { setNextAppt({ date, svc: o.svc }); setShowNextAppt(false); setToast('📅 Se agendará al cobrar'); }}>
                  {o.l} · <b>{date.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })}</b> (+{o.d} días)
                </button>
              );
            })}
            <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setShowNextAppt(false)}>Cerrar</button>
          </Modal>
        </section>
      )}

      {/* nav inferior */}
      {screen < 6 && (
        <div className="footer-nav">
          <button className="btn" style={{ visibility: screen === 1 ? 'hidden' : 'visible' }} onClick={() => go(Math.max(1, screen - 1))}>← Atrás</button>
          <button className="btn primary" onClick={navNext}>Continuar →</button>
        </div>
      )}
      {screen === 6 && (
        <div className="footer-nav">
          <button className="btn" onClick={() => go(5)}>← Atrás</button>
        </div>
      )}

      {/* modal historial */}
      <Modal open={!!hist} onClose={() => setHist(null)}>
        {hist && <>
          <h3 style={{ marginBottom: 12 }}>Historial capilar · {hist.client.full_name || 'Sin nombre'}</h3>
          {hist.jobs.length === 0 && <p style={{ color: 'var(--muted)' }}>Este cliente aún no tiene trabajos registrados.</p>}
          {hist.jobs.map(j => (
            <div key={j.id} className="hist-item">
              <div className="hdate">{new Date(j.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })} · base nivel {j.base_level}</div>
              {(j.color_job_steps || []).sort((a, b) => a.step_number - b.step_number).map((s, i) => (
                <div key={i} className="hformula">
                  P{s.step_number} ({s.brand}{s.is_custom ? ' · pers.' : ''}{s.pose_minutes ? ` · ${s.pose_minutes} min` : ''}):{' '}
                  {(s.color_step_components || []).map(c => `${Number(c.actual_g || c.target_g).toFixed(0)}g ${c.name}${c.peroxide_vol ? ` (${c.peroxide_vol}v)` : ''}`).join(' + ')}
                </div>
              ))}
            </div>
          ))}
          <button className="btn primary" style={{ width: '100%', marginTop: 12 }}
            onClick={() => { setClient(hist.client); setHist(null); setScreen(2); }}>Formular para este cliente →</button>
          <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setHist(null)}>Cerrar</button>
        </>}
      </Modal>
      <Toast msg={toast} />
    </Shell>
  );
}

function AddOtherForm({ onAdd }) {
  const [n, setN] = useState('');
  const [g, setG] = useState('');
  return (
    <div className="field"><label>Otro (nombre y gramos)</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="Nombre" value={n} onChange={e => setN(e.target.value)}
          style={{ flex: 2, minHeight: 56, background: 'var(--surface2)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)', padding: '0 14px' }} />
        <input type="number" inputMode="decimal" placeholder="g" value={g} onChange={e => setG(e.target.value)}
          style={{ flex: 1, minHeight: 56, background: 'var(--surface2)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)', padding: '0 14px' }} />
        <button className="btn sm" onClick={() => { onAdd(n.trim(), parseFloat(g)); setN(''); setG(''); }}>＋</button>
      </div>
    </div>
  );
}

let audioCtx = null;
function beep(freq, dur) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(.4, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + dur);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* sin audio */ }
}
