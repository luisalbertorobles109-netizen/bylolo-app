# ByLolo Studio

## NUEVO en esta versión

### Módulo Servicios — submenús
- Tipos: Corte de pelo, Tratamiento, Peinado, Otro servicio.
- "Otro servicio": solo pide el nombre del servicio.
- "Corte de pelo" y "Peinado": la mezcla muestra solo insumos de clase TRATAMIENTO y ESTILIZADO.
- "Tratamiento" despliega: Alisado / Otro.
   - Alisado → insumos de clase ALISADO.
   - Otro → Tratamiento (insumos clase TRATAMIENTO) o Color (marca + tono + peróxido).

### Barra de Color
- PERÓXIDO: en "Personalizada" puedes elegir la MARCA y volumen del peróxido (KÜÜL o
  Tec Italy), agregar varios, o quitarlo con la ✕.
- ADITIVO EXTRA: ahora muestra solo tus insumos reales de clase ADITIVO y REFORZADOR
  (ya no aparece "Gotas de matiz" ni opciones que no tienes).

## Clases nuevas en tu inventario (Excel)
Para que todo aparezca bien, clasifica tus productos en la columna "Clase":
- Estilizado  → para productos de peinado/corte
- Reforzador  → para reforzadores (aparecen junto a Aditivo en Barra de Color)
- Alisado     → para productos de alisado
(Las que ya usabas siguen igual: Tinte, Peroxido, Decolorante, Aditivo, Tratamiento…)

## Probar
1. Borra la carpeta vieja antes de descomprimir esta.
2. cmd dentro de la carpeta:  npm install  →  npm run dev
3. http://localhost:5173/  →  Ctrl+Shift+R
