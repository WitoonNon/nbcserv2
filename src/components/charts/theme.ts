/**
 * One place where the charts agree with the rest of the application.
 *
 * G2 draws to a canvas, so nothing here can be a CSS variable — the values
 * have to be literal at draw time. They are copied from the tokens in
 * globals.css and must be kept in step with them; that duplication is the
 * price of canvas rendering, and it is cheaper than the alternative of reading
 * computed styles on every render.
 */

export const BRAND = {
  orange: '#e4750e',
  orange600: '#c96409',
  blue: '#2891bd',
  blue600: '#0c76a2',
  teal: '#09455e',
  navy: '#132945',
  sky: '#6ec1e4',
  muted: '#7a7a7a',
  line: '#d8dee6',
  ink: '#1a1a1a',
} as const;

/**
 * Category colours, fixed by name rather than by position.
 *
 * A palette applied in series order would recolour every chart the moment a
 * category has no work in the window — cleaning would turn orange and the
 * reader would misread the season. Naming them pins each category to a colour
 * for good.
 */
export const CATEGORY_COLOR: Record<string, string> = {
  'ล้างแอร์/PM': BRAND.blue,
  ซ่อม: BRAND.orange,
  ตรวจเช็ค: BRAND.sky,
  ติดตั้ง: BRAND.teal,
};

/** Pipeline colours, matching the status badges used in the tables. */
export const STATUS_COLOR: Record<string, string> = {
  รอจัดคิว: '#94a3b8',
  นัดแล้ว: '#2891bd',
  จ่ายงานแล้ว: '#6366f1',
  กำลังเดินทาง: '#8b5cf6',
  ถึงหน้างาน: '#d97706',
  กำลังทำงาน: '#e4750e',
  รอเสนอราคา: '#eab308',
  อนุมัติราคาแล้ว: '#84cc16',
  ทำงานเสร็จ: '#16a34a',
  ตรวจใบงานแล้ว: '#0d9488',
};

/**
 * Sarabun, not Mitr. Mitr is a display face and the charts are dense data —
 * the same reasoning that puts Sarabun in the tables and on the printed work
 * order. The literal family name is needed because canvas text cannot resolve
 * `var(--font-sarabun)`.
 */
export const CHART_FONT = 'Sarabun, "Leelawadee UI", Tahoma, sans-serif';

/** Axis, legend and tooltip styling shared by every chart. */
export const AXIS_STYLE = {
  labelFontFamily: CHART_FONT,
  labelFontSize: 11,
  labelFill: BRAND.muted,
  lineStroke: BRAND.line,
  tickStroke: BRAND.line,
  gridStroke: BRAND.line,
  gridStrokeOpacity: 0.5,
} as const;

export const LEGEND_STYLE = {
  itemLabelFontFamily: CHART_FONT,
  itemLabelFontSize: 12,
  itemLabelFill: BRAND.ink,
} as const;
