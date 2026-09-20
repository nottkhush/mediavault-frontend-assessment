export const GAP = 12;
export const PAD = 16;
export const MIN_COL = 220;
export const BODY_H = 96; // fixed height of the text area under the thumbnail
export const FOOTER_H = 48;
export const OVERSCAN = 3; // extra rows rendered above and below the viewport
export const PREFETCH_ROWS = 3; // start loading the next page this close to the end

export interface GridLayout {
  cols: number;
  colWidth: number;
  cardHeight: number;
  stride: number; // vertical distance from one row's top to the next
}

/** Pure: the same width always gives the same layout. */
export function computeLayout(width: number): GridLayout {
  const inner = Math.max(0, width - PAD * 2);
  const cols = Math.max(1, Math.floor((inner + GAP) / (MIN_COL + GAP)));
  const colWidth = (inner - (cols - 1) * GAP) / cols;
  // The thumbnail is 16:10, and the card has a 1px border on each side.
  const cardHeight = Math.round((colWidth - 2) * 0.625) + BODY_H + 2;
  return { cols, colWidth, cardHeight, stride: cardHeight + GAP };
}
