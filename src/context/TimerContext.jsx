import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const KEY = 'bylolo_timer_v1';
const TimerCtx = createContext(null);
export const useTimer = () => useContext(TimerCtx);

function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
function save(s) { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch (e) {} }

// pitido corto con WebAudio
function beep(freq = 980, dur = 0.3) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ac = new Ctx();
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(ac.destination);
    g.gain.setValueAtTime(0.001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.5, ac.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.start(); o.stop(ac.currentTime + dur);
    setTimeout(() => ac.close(), (dur + 0.1) * 1000);
  } catch (e) {}
}

const EMPTY = { dur: 0, left: 0, running: false, endsAt: null, label: '', returnPath: '/color' };

export function TimerProvider({ children }) {
  const [state, setState] = useState(() => {
    const s = load();
    if (s && s.running && s.endsAt) s.left = Math.max(0, Math.round((s.endsAt - Date.now()) / 1000));
    return s || { ...EMPTY };
  });
  const notifiedRef = useRef(false);

  useEffect(() => {
    const int = setInterval(() => {
      setState(s => {
        if (!s.running || !s.endsAt) return s;
        const left = Math.max(0, Math.round((s.endsAt - Date.now()) / 1000));
        if (left <= 0) {
          if (!notifiedRef.current) {
            notifiedRef.current = true;
            for (let i = 0; i < 6; i++) setTimeout(() => beep(990, .3), i * 600);
            if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
          }
          const ns = { ...s, running: false, left: 0, endsAt: null };
          save(ns); return ns;
        }
        return { ...s, left };
      });
    }, 1000);
    return () => clearInterval(int);
  }, []);

  function computeLeft(s) {
    if (s.running && s.endsAt) return Math.max(0, Math.round((s.endsAt - Date.now()) / 1000));
    return s.left;
  }
  function patch(p) { setState(s => { const ns = { ...s, ...p }; save(ns); return ns; }); }

  function setPreset(secs, opts = {}) {
    notifiedRef.current = false;
    patch({ dur: secs, left: secs, running: false, endsAt: null, label: opts.label ?? state.label, returnPath: opts.returnPath ?? state.returnPath });
  }
  function addSecs(secs) {
    setState(s => {
      const base = computeLeft(s); const left = base + secs;
      notifiedRef.current = false;
      const ns = { ...s, left, dur: Math.max(s.dur, left), endsAt: s.running ? Date.now() + left * 1000 : null };
      save(ns); return ns;
    });
  }
  // agrega tiempo y arranca de inmediato
  function extend(secs, opts = {}) {
    setState(s => {
      const base = computeLeft(s); const left = base + secs;
      notifiedRef.current = false;
      const ns = { ...s, left, dur: Math.max(s.dur, left), running: true, endsAt: Date.now() + left * 1000, label: opts.label ?? s.label, returnPath: opts.returnPath ?? s.returnPath };
      save(ns); return ns;
    });
  }
  function toggle(opts = {}) {
    setState(s => {
      const left = computeLeft(s);
      if (left <= 0) return s;
      if (s.running) { const ns = { ...s, running: false, left, endsAt: null }; save(ns); return ns; }
      notifiedRef.current = false;
      const ns = { ...s, running: true, left, endsAt: Date.now() + left * 1000, label: opts.label ?? s.label, returnPath: opts.returnPath ?? s.returnPath };
      save(ns); return ns;
    });
  }
  function reset() { notifiedRef.current = false; patch({ dur: 0, left: 0, running: false, endsAt: null }); }
  function clear() { notifiedRef.current = false; save(null); setState({ ...EMPTY }); }

  const left = computeLeft(state);
  const value = {
    dur: state.dur, left, running: state.running,
    alert: state.dur > 0 && left <= 0 && !state.running,
    active: state.dur > 0 || state.running,
    label: state.label, returnPath: state.returnPath,
    setPreset, addSecs, extend, toggle, reset, clear,
  };
  return <TimerCtx.Provider value={value}>{children}</TimerCtx.Provider>;
}

const fmt = s => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

// Burbuja flotante global. No se muestra cuando ya estás en la Barra de Color.
export function FloatingTimer() {
  const t = useTimer();
  const nav = useNavigate();
  const loc = useLocation();
  if (!t.active) return null;
  if (loc.pathname === '/color') return null;
  return (
    <div className="floating-timer">
      {t.alert && (
        <div className="ft-actions">
          <button onClick={() => t.extend(300)}>＋5 min</button>
          <button onClick={() => nav(t.returnPath || '/color')}>Volver al servicio</button>
        </div>
      )}
      <button className={'ft-bubble' + (t.alert ? ' alert' : '') + (t.running ? ' run' : '')} onClick={() => nav(t.returnPath || '/color')}>
        <span className="ft-icon">⏱</span>
        <span className="ft-time num">{t.alert ? '¡Listo!' : fmt(t.left)}</span>
        <span className="ft-label">{t.label || 'Pose'}</span>
      </button>
    </div>
  );
}
