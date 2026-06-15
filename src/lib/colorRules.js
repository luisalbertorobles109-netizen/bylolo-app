// ============ Reglas de formulación (guías KÜÜL y TEC ITALY) ============

export const FALLBACK_RULES = {
  'KULL': { ratio: 1.5, label: '1 + 1½', super_ratio: 2, perox_name: 'Peróxido KÜÜL',
    timer_presets: [{ m: 15, l: '15 min · mechas con calor' }, { m: 40, l: '40 min · estándar' }, { m: 50, l: '50 min · canas difíciles' }] },
  'TEC ITALY': { ratio: 1, label: '1 + 1', super_ratio: 1, bleach_ratio: 3, perox_name: 'A.O. Peroxide',
    timer_presets: [{ m: 35, l: '35 min · Designer' }, { m: 45, l: '45 min · Designer máx.' }, { m: 50, l: '50 min · canas / Luminous' }] },
};

export function suggestVol(brand, baseLevel, targetLevel) {
  const lift = targetLevel - baseLevel;
  if (lift <= 0) return { vol: 10, note: lift < 0 ? 'Depositar / oscurecer' : 'Tono sobre tono (usa 20 vol si hay mucha cana)' };
  if (lift === 1) return { vol: 20, note: 'Aclara 1 tono · cubre canas' };
  if (lift === 2) return { vol: 30, note: 'Aclara 2 tonos' };
  if (lift === 3) return { vol: 40, note: 'Aclara 3 tonos' };
  if (lift === 4 && brand === 'KULL') return { vol: 40, note: 'Aclara 4 tonos · agregar 000 Reforzador', add000: true };
  return { vol: 40, note: `Más de ${brand === 'KULL' ? 4 : 3} tonos de aclaración: se recomienda decoloración previa (hazla como Paso 1 y el matiz como Paso 2)`, needBleach: true };
}

// Nivel de decoloración previa para Funny Colors (PDF KÜÜL)
const FUNNY_LEVELS = {
  'rojo': 7, 'magenta': 7, 'violeta': 7, 'bugambilia': 7, 'naranja': 8,
  'rojo violeta': 9, 'rojo rosado': 9, 'verde esmeralda': 9,
  'amarillo neon': 9, 'azul neon': 9, 'rosa neon': 9, 'verde neon': 9, 'violeta neon': 9,
  'azul oceano': 9, 'coral': 9, 'azul jeans': 9, 'verde pera': 9, 'azul celeste': 9,
  'plata': 10, 'verde': 10, 'azul': 10, 'blanco': 10, 'blanco titanio': 10, 'rosa': 9,
};
export function funnyLevel(name) {
  return FUNNY_LEVELS[(name || '').toLowerCase().trim()] || 9;
}

// Color visual aproximado del tono para el swatch y la gota
const FC_COLORS = {
  'rojo': '#d8262f', 'magenta': '#d11c7c', 'violeta': '#7b2fbf', 'bugambilia': '#c2348f',
  'naranja': '#f07020', 'rojo violeta': '#a4225e', 'rojo rosado': '#e0527a', 'verde esmeralda': '#1d9e64',
  'amarillo neon': '#f5f53c', 'azul neon': '#2e6bf5', 'rosa neon': '#ff4fa3', 'verde neon': '#4df53c',
  'violeta neon': '#9b4dff', 'azul oceano': '#1f6fae', 'coral': '#ff7256', 'azul jeans': '#4a6fa5',
  'verde pera': '#9acd32', 'azul celeste': '#7ec8e3', 'plata': '#c9ccd6', 'verde': '#1d8348',
  'azul': '#2456a4', 'blanco': '#f2f2f5', 'blanco titanio': '#f2f2f5', 'rosa': '#e29bb4',
  'rosa metalico': '#e29bb4', 'azul metalico': '#5a7fb5', 'platinado metalico': '#c9ccd6',
  'morado metalico': '#7d5fa8', 'oro metalico': '#cfa64e', 'cromo grafito': '#5a5f6b', 'cromo corrector': '#8a8f9b',
  'cobre': '#a85a2e', 'dorado cobrizo': '#b06a32',
};
const LEVEL_BASE = { 1:'#141414',2:'#2b1a12',3:'#33221a',4:'#43301f',5:'#5c452f',6:'#6f5638',7:'#8a6b42',8:'#a98a58',9:'#c8ab7c',10:'#e3d0a8',11:'#ecdfbf' };
export function toneColor(name, gama) {
  const n = (name || '').toLowerCase().trim();
  if (FC_COLORS[n]) return FC_COLORS[n];
  const m = n.match(/^(\d+)/);
  if (m) {
    let lvl = parseInt(m[1]);
    if (lvl >= 100) lvl = 11; // ultraaclarantes 100/1000
    if (n === '902' || n === '000') return '#ece2c6';
    return LEVEL_BASE[Math.min(11, Math.max(1, lvl))] || '#8a6b42';
  }
  if ((gama || '').includes('RUBIOS')) return '#d8c096';
  if ((gama || '').includes('INTENSE')) return '#6f5638';
  return '#9b8a72';
}

export function targetLevelOf(name) {
  const m = String(name || '').match(/^(\d+)/);
  if (!m) return null;
  let lvl = parseInt(m[1]);
  if (lvl >= 100) lvl = 11;
  return Math.min(11, lvl);
}

export function classifyTone(p) {
  const g = (p.gama || '').toUpperCase();
  return {
    isFunny: g === 'FC',
    isMetal: g === 'MT' || g.includes('METALICO') || g.includes('CROMO'),
    isSuper: g.includes('SUPER ACLARANTE') || g.includes('ULTRAACLARANTES'),
    isBleach: (p.class || '') === 'Decolorante',
  };
}
