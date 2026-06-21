# ByLolo Studio

## NUEVO: flujo por etapas + temporizador flotante en Barra de Color

### Temporizador flotante y persistente
- Cuando inicias un temporizador de pose y SALES a otro módulo (o incluso si se
  recarga la página por accidente), aparece una BURBUJA FLOTANTE abajo a la derecha
  con el tiempo restante.
- Toca la burbuja para VOLVER exactamente al servicio donde ibas.
- Al terminar el tiempo suena, vibra y la burbuja ofrece: "＋5 min" o "Volver al servicio".

### Flujo por etapas (decoloración → tinte → ...)
- En la Barra de Color, al terminar el tiempo de una etapa (p. ej. decoloración),
  aparecen 3 opciones: "＋5 min más", "➕ Siguiente etapa" (otra fórmula/color), o
  "Ir al resumen" (cobrar).
- Cada etapa tiene su propia fórmula, pesado y temporizador. Todo se junta en un
  solo cobro al final.

### Servicio en curso que se recupera
- Si sales por error, la Barra de Color RESTAURA el servicio donde lo dejaste.
- Para empezar de cero, usa el botón ✕ (arriba a la derecha) para descartar el
  servicio en curso.

## Probar
1. Borra la carpeta vieja antes de descomprimir esta.
2. cmd dentro de la carpeta:  npm install  →  npm run dev
3. http://localhost:5173/  →  Ctrl+Shift+R
4. Barra de Color → arma una fórmula → báscula → Temporizador → Iniciar →
   sal al menú (verás la burbuja) → toca la burbuja para volver.

> Báscula SKALE 2: solo Chrome de Android/PC.
