// ============ Báscula SKALE 2 (Atomax) vía Web Bluetooth ============
// Requiere Chrome en Android o computadora (los iPad no soportan Web Bluetooth).
const SKALE = { SERVICE: 0xFF08, WEIGHT: 0xEF81, CMD: 0xEF80 };

export async function connectSkale({ onWeight, onDisconnect, onRaw }) {
  if (!navigator.bluetooth) throw new Error('Este navegador no tiene Bluetooth Web. Usa Chrome en Android o PC.');
  const dev = await navigator.bluetooth.requestDevice({
    filters: [{ services: [SKALE.SERVICE] }, { namePrefix: 'Skale' }, { namePrefix: 'SKALE' }],
    optionalServices: [SKALE.SERVICE],
  });
  const server = await dev.gatt.connect();
  const svc = await server.getPrimaryService(SKALE.SERVICE);
  const wChar = await svc.getCharacteristic(SKALE.WEIGHT);
  let cmdChar = null;
  try { cmdChar = await svc.getCharacteristic(SKALE.CMD); await cmdChar.writeValue(Uint8Array.of(0x03)); } catch (e) { /* opcional */ }
  await wChar.startNotifications();
  wChar.addEventListener('characteristicvaluechanged', (e) => {
    const dv = e.target.value;
    if (onRaw) {
      const bytes = [];
      for (let i = 0; i < dv.byteLength; i++) bytes.push(dv.getUint8(i).toString(16).padStart(2, '0'));
      onRaw(bytes.join(' '));
    }
    let raw = 0;
    try { raw = dv.getInt32(1, true) / 10; } catch (e2) { try { raw = dv.getInt16(1, true) / 10; } catch (e3) { /* ignorar */ } }
    onWeight(raw);
  });
  dev.addEventListener('gattserverdisconnected', () => onDisconnect && onDisconnect());
  return {
    device: dev,
    tare: async () => { try { if (cmdChar) await cmdChar.writeValue(Uint8Array.of(0x10)); } catch (e) { /* se calibra con el equipo físico */ } },
    disconnect: () => { try { dev.gatt.disconnect(); } catch (e) { /* ya desconectada */ } },
  };
}
