import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';

// ============ Báscula SKALE 2 global ============
// La conexión vive aquí (a nivel de app): se conecta UNA vez y queda sincronizada
// en todas las pantallas. Al llegar a pesar ya está leyendo en vivo.
// Web Bluetooth: la primera conexión necesita un toque del usuario; la reconexión
// (si la báscula se duerme o se aleja) es automática, sin volver a tocar.
//
// El peso en vivo NO se guarda en el value del contexto (cambia muchas veces por
// segundo). Se entrega por suscripción para que SOLO la pantalla de pesaje se
// vuelva a dibujar y no toda la app.

const SKALE = { SERVICE: 0xFF08, WEIGHT: 0xEF81, CMD: 0xEF80 };

const ScaleContext = createContext(null);
export const useScale = () => useContext(ScaleContext);

// Hook para leer el peso en vivo (en gramos, ya con la tara aplicada).
export function useScaleGrams() {
  const scale = useScale();
  const [g, setG] = useState(() => (scale?.getGrams ? scale.getGrams() : 0));
  useEffect(() => {
    if (!scale?.subscribe) return undefined;
    setG(scale.getGrams());
    return scale.subscribe(setG);
  }, [scale]);
  return g;
}

export function ScaleProvider({ children }) {
  const supported = typeof navigator !== 'undefined' && !!navigator.bluetooth;
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [diagLog, setDiagLog] = useState('');

  const deviceRef = useRef(null);
  const cmdCharRef = useRef(null);
  const wCharRef = useRef(null);
  const rawRef = useRef(0);     // peso crudo
  const offsetRef = useRef(0);  // tara
  const gramsRef = useRef(0);   // peso neto = crudo - tara
  const listeners = useRef(new Set());
  const reconnectingRef = useRef(false);

  const emit = useCallback(() => {
    const g = Math.max(0, rawRef.current - offsetRef.current);
    gramsRef.current = g;
    listeners.current.forEach(fn => { try { fn(g); } catch (e) {} });
  }, []);

  const onValue = useCallback((e) => {
    const dv = e.target.value;
    let raw = 0;
    try { raw = dv.getInt32(1, true) / 10; }
    catch { try { raw = dv.getInt16(1, true) / 10; } catch { /* ignorar */ } }
    rawRef.current = raw;
    emit();
  }, [emit]);

  const attach = useCallback(async (dev) => {
    const server = await dev.gatt.connect();
    const svc = await server.getPrimaryService(SKALE.SERVICE);
    const wChar = await svc.getCharacteristic(SKALE.WEIGHT);
    wCharRef.current = wChar;
    try {
      const cmd = await svc.getCharacteristic(SKALE.CMD);
      cmdCharRef.current = cmd;
      await cmd.writeValue(Uint8Array.of(0x03)); // enciende notificaciones de peso
    } catch (e) { /* opcional según firmware */ }
    await wChar.startNotifications();
    try { wChar.removeEventListener('characteristicvaluechanged', onValue); } catch (e) {}
    wChar.addEventListener('characteristicvaluechanged', onValue);
    setConnected(true);
  }, [onValue]);

  const handleDisconnect = useCallback(async () => {
    setConnected(false);
    const dev = deviceRef.current;
    if (!dev || reconnectingRef.current) return;
    reconnectingRef.current = true;
    setDiagLog(l => ('Báscula desconectada · reintentando…\n' + l).slice(0, 4000));
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 1500));
      try {
        await attach(dev);
        setDiagLog(l => ('Reconectada ✓\n' + l).slice(0, 4000));
        reconnectingRef.current = false;
        return;
      } catch (e) { /* sigue intentando */ }
    }
    reconnectingRef.current = false;
  }, [attach]);

  const connect = useCallback(async () => {
    if (!supported) throw new Error('Este navegador no tiene Bluetooth Web. Usa Chrome en Android o PC (los iPad no lo soportan).');
    if (connecting) return;
    setConnecting(true);
    try {
      const dev = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SKALE.SERVICE] }, { namePrefix: 'Skale' }, { namePrefix: 'SKALE' }],
        optionalServices: [SKALE.SERVICE],
      });
      deviceRef.current = dev;
      try { dev.removeEventListener('gattserverdisconnected', handleDisconnect); } catch (e) {}
      dev.addEventListener('gattserverdisconnected', handleDisconnect);
      await attach(dev);
      setDiagLog(l => ('Conectada ✓\n' + l).slice(0, 4000));
    } finally {
      setConnecting(false);
    }
  }, [supported, connecting, attach, handleDisconnect]);

  const tare = useCallback(async () => {
    offsetRef.current = rawRef.current;
    emit();
    try { if (cmdCharRef.current) await cmdCharRef.current.writeValue(Uint8Array.of(0x10)); } catch (e) { /* se calibra con el equipo */ }
  }, [emit]);

  const disconnect = useCallback(() => {
    reconnectingRef.current = true;
    try { deviceRef.current?.gatt?.disconnect(); } catch (e) {}
    deviceRef.current = null;
    setConnected(false);
    setTimeout(() => { reconnectingRef.current = false; }, 100);
  }, []);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  const getGrams = useCallback(() => gramsRef.current, []);

  // Reconexión silenciosa a una báscula ya autorizada al abrir la app (Chrome).
  useEffect(() => {
    if (!supported || !navigator.bluetooth.getDevices) return undefined;
    let cancel = false;
    navigator.bluetooth.getDevices().then(async (devs) => {
      const dev = (devs || []).find(d => /skale/i.test(d.name || ''));
      if (!dev || cancel) return;
      deviceRef.current = dev;
      try { dev.addEventListener('gattserverdisconnected', handleDisconnect); } catch (e) {}
      try { await attach(dev); } catch (e) { /* requiere báscula encendida y cerca */ }
    }).catch(() => {});
    return () => { cancel = true; };
  }, [supported, attach, handleDisconnect]);

  const value = useMemo(() => ({
    supported, connected, connecting, diagLog,
    connect, disconnect, tare, subscribe, getGrams,
  }), [supported, connected, connecting, diagLog, connect, disconnect, tare, subscribe, getGrams]);

  return <ScaleContext.Provider value={value}>{children}</ScaleContext.Provider>;
}

// Chip flotante global: conectar / ver estado de la báscula desde cualquier pantalla.
export function ScaleChip() {
  const scale = useScale();
  const grams = useScaleGrams();
  const [err, setErr] = useState('');
  if (!scale || !scale.supported) return null;

  async function onConnect() {
    setErr('');
    try { await scale.connect(); } catch (e) { setErr(e.message || 'No se pudo conectar'); }
  }

  return (
    <div style={{ position: 'fixed', left: 14, bottom: 16, zIndex: 60, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
      {err && <div style={{ background: 'var(--danger)', color: '#fff', fontSize: '.72rem', padding: '4px 8px', borderRadius: 8, maxWidth: 230 }}>{err}</div>}
      <button
        onClick={scale.connected ? undefined : onConnect}
        title={scale.connected ? 'Báscula conectada' : 'Conectar báscula SKALE 2'}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: scale.connected ? 'var(--ok)' : 'var(--surface2)',
          color: scale.connected ? '#04221a' : 'var(--text)',
          border: '1px solid ' + (scale.connected ? 'var(--ok)' : 'var(--line)'),
          borderRadius: 999, padding: '8px 14px', fontWeight: 700, fontSize: '.82rem',
          boxShadow: '0 6px 20px rgba(0,0,0,.35)', cursor: scale.connected ? 'default' : 'pointer',
        }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: scale.connected ? '#04221a' : (scale.connecting ? '#f2b33d' : '#888'), display: 'inline-block' }} />
        {scale.connected ? `⚖ ${grams.toFixed(1)} g` : (scale.connecting ? 'Conectando…' : '⚖ Conectar báscula')}
      </button>
    </div>
  );
}
