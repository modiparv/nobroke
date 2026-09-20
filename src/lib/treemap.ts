/**
 * Squarified treemap (Bruls, Huizing, van Wijk). Items are laid in rows
 * along the shorter side of the remaining rectangle, each row accepting the
 * next item only while it does not worsen the row's worst aspect ratio.
 * Tiles come out near-square for any count, where slice-and-dice turned a
 * third or fifth goal into an unreadable sliver. Coordinates are in the
 * caller's units (the glimpse passes 0..100 for percentages).
 */
export interface TreemapRect {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Weighted {
  key: string;
  area: number;
}

function worst(row: Weighted[], side: number): number {
  if (row.length === 0 || side <= 0) return Infinity;
  const s = row.reduce((sum, r) => sum + r.area, 0);
  if (s <= 0) return Infinity;
  let max = -Infinity;
  let min = Infinity;
  for (const r of row) {
    if (r.area > max) max = r.area;
    if (r.area < min) min = r.area;
  }
  const s2 = s * s;
  const side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

export function squarify(
  items: Array<{ key: string; amount: number }>,
  x: number,
  y: number,
  w: number,
  h: number,
): TreemapRect[] {
  const sorted = items.filter((i) => i.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = sorted.reduce((s, i) => s + i.amount, 0);
  if (sorted.length === 0 || total <= 0 || w <= 0 || h <= 0) return [];
  const scale = (w * h) / total;
  const areas: Weighted[] = sorted.map((i) => ({ key: i.key, area: i.amount * scale }));

  const out: TreemapRect[] = [];
  let rx = x;
  let ry = y;
  let rw = w;
  let rh = h;

  const layoutRow = (row: Weighted[]) => {
    const s = row.reduce((sum, r) => sum + r.area, 0);
    if (s <= 0) return;
    if (rw >= rh) {
      // A column against the left edge, full height, as wide as it needs.
      const cw = Math.min(rw, s / rh);
      let cy = ry;
      for (const r of row) {
        const ch = cw > 0 ? r.area / cw : 0;
        out.push({ key: r.key, x: rx, y: cy, w: cw, h: ch });
        cy += ch;
      }
      rx += cw;
      rw = Math.max(0, rw - cw);
    } else {
      // A row against the top edge, full width, as tall as it needs.
      const ch = Math.min(rh, s / rw);
      let cx = rx;
      for (const r of row) {
        const cw = ch > 0 ? r.area / ch : 0;
        out.push({ key: r.key, x: cx, y: ry, w: cw, h: ch });
        cx += cw;
      }
      ry += ch;
      rh = Math.max(0, rh - ch);
    }
  };

  let row: Weighted[] = [];
  for (const next of areas) {
    const side = Math.min(rw, rh);
    if (row.length === 0 || worst([...row, next], side) <= worst(row, side)) {
      row.push(next);
    } else {
      layoutRow(row);
      row = [next];
    }
  }
  if (row.length > 0) layoutRow(row);
  return out;
}
