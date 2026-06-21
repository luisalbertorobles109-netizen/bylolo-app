// ============ Exportar / importar inventario en Excel (.xlsx) ============
// Usa SheetJS cargado bajo demanda desde CDN, para no engordar el bundle.
let xlsxPromise = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxPromise) return xlsxPromise;
  xlsxPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('No se pudo cargar el lector de Excel (revisa tu conexión)'));
    document.head.appendChild(s);
  });
  return xlsxPromise;
}

// Columnas del layout. El mismo formato se exporta y se vuelve a importar.
export const INV_COLUMNS = [
  ['name', 'Nombre'],
  ['barcode', 'Código de Barras'],
  ['brand', 'Marca'],
  ['type', 'Tipo'],
  ['class', 'Clase'],
  ['cost', 'Costo'],
  ['price', 'Precio de Venta'],
  ['price_per_gram', 'Precio por Gramo'],
  ['min_stock', 'Stock Mínimo'],
  ['current_stock', 'Stock Actual'],
  ['gramos_por_pieza', 'Gramos por Pieza'],
  ['sku', 'SKU'],
  ['description', 'Descripción'],
  ['gama', 'Gama'],
  ['status', 'Estatus'],
];

export async function exportInventoryXLSX(rows) {
  const XLSX = await loadXLSX();
  const header = INV_COLUMNS.map(c => c[1]);
  const data = rows.map(r => INV_COLUMNS.map(([key]) => r[key] ?? ''));
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws['!cols'] = INV_COLUMNS.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

  // Hoja de instrucciones para agregar artículos nuevos
  const guide = [
    ['CÓMO ACTUALIZAR Y AGREGAR ARTÍCULOS'],
    [''],
    ['1. Para ACTUALIZAR un artículo existente: edita su fila (precio, stock, costo, etc.).'],
    ['2. Para AGREGAR uno nuevo: escribe una fila nueva al final con su Nombre y datos.'],
    ['3. Guarda el archivo y súbelo en Inventario → "Subir Excel".'],
    [''],
    ['CAMPOS IMPORTANTES:'],
    ['Nombre', 'Obligatorio. Ej: "7.3 Rubio Dorado" o "Shampoo Matizador".'],
    ['Tipo', 'Escribe "insumo" (se usa en servicios, es costo) o "producto" (se vende al cliente).'],
    ['Marca', 'Ej: KÜÜL, TEC ITALY, Olaplex, ByLolo…'],
    ['Clase', 'Ej: Tinte, Peroxido, Decolorante, Aditivo, Reforzador, Tratamiento, Alisado, Estilizado, Capilar…'],
    ['Gama', 'La línea/colección del fabricante. Ej: COLOR SYSTEM, DESIGN COLOR.'],
    ['Costo', 'Lo que te cuesta a ti (para el costo de insumos).'],
    ['Precio de Venta', 'Lo que cobras al cliente (solo para productos de venta).'],
    ['Stock Actual', 'Cuántas piezas tienes ahora.'],
    ['Stock Mínimo', 'Cuándo avisar de stock bajo.'],
    ['Gramos por Pieza', 'Para tintes/insumos a granel: gramos que rinde cada pieza (ej. 60 para un tubo de 60g).'],
    [''],
    ['NOTA: el sistema reconoce un artículo por su Código de Barras o por Nombre+Marca.'],
    ['Si no coincide con ninguno existente, lo crea como nuevo automáticamente.'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide['!cols'] = [{ wch: 22 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Instrucciones');

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  XLSX.writeFile(wb, `Inventario_ByLolo_${date}.xlsx`);
}

// Lee un archivo .xlsx y devuelve filas mapeadas a las columnas internas.
export async function parseInventoryXLSX(file) {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
  // mapa de "Etiqueta visible" -> clave interna
  const label2key = Object.fromEntries(INV_COLUMNS.map(([k, l]) => [l.toLowerCase(), k]));
  const numeric = ['cost', 'price', 'price_per_gram', 'min_stock', 'current_stock', 'gramos_por_pieza'];
  return json.map(row => {
    const out = {};
    for (const [label, val] of Object.entries(row)) {
      const key = label2key[String(label).trim().toLowerCase()];
      if (!key) continue;
      out[key] = numeric.includes(key) ? (Number(val) || 0) : String(val).trim();
    }
    // Normaliza "Tipo": acepta insumo/producto en cualquier forma
    if (out.type) {
      const t = out.type.toLowerCase();
      out.type = (t.startsWith('prod')) ? 'producto' : (t.startsWith('insu')) ? 'insumo' : out.type.toLowerCase();
    }
    // Normaliza "Estatus"
    if (out.status) {
      const s = out.status.toLowerCase();
      out.status = s.startsWith('inac') || s.startsWith('desa') ? 'Inactivo' : 'Activo';
    }
    return out;
  }).filter(r => r.name); // ignora filas sin nombre
}
