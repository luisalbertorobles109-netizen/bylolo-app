// Gota visual para el pesaje. Se llena con los gramos actuales.
// Si se da un objetivo (target), se pone verde al acercarse y rojo al pasarse.
// Si no hay objetivo, se llena de forma suave (solo visual).
export default function DropGauge({ grams = 0, target = 0, color = 'var(--pigment)' }) {
  const TOL = 1.0;
  let fill, ringColor, fillColor;
  if (target > 0) {
    const pct = Math.max(0, Math.min(1.15, grams / target));
    const near = Math.abs(grams - target) <= TOL && grams > 0;
    const over = grams > target + TOL;
    fill = Math.min(1, pct) * 252;
    fillColor = over ? 'var(--danger)' : near ? 'var(--ok)' : color;
    ringColor = near ? 'var(--ok)' : over ? 'var(--danger)' : 'rgba(127,127,127,.25)';
  } else {
    // sin objetivo: llenado suave asintótico, solo visual
    const frac = grams > 0 ? Math.min(0.92, grams / (grams + 50)) : 0;
    fill = frac * 252;
    fillColor = color;
    ringColor = grams > 0 ? color : 'rgba(127,127,127,.25)';
  }
  const dropPath = "M100 8 C100 8 32 110 32 168 a68 68 0 0 0 136 0 C168 110 100 8 100 8 Z";
  return (
    <div className="drop-stage">
      <svg viewBox="0 0 200 260" width="100%" aria-hidden="true">
        <defs><clipPath id="dropClipSvc"><path d={dropPath} /></clipPath></defs>
        <path d={dropPath} fill="rgba(0,0,0,.35)" stroke="var(--line)" strokeWidth="3" />
        <g clipPath="url(#dropClipSvc)">
          <rect x="0" y={260 - fill} width="200" height="260" fill={fillColor} />
        </g>
        <path d={dropPath} fill="none" stroke={ringColor} strokeWidth="3" />
      </svg>
    </div>
  );
}
