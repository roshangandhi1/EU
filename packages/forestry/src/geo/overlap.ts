/**
 * Approximate overlap between plot boundaries, for the KMZ import preview (DATA-6).
 * No polygon-clipping library is bundled, so the shared area is estimated by sampling a grid over
 * the intersection of the two bounding boxes and testing each cell centre against both shapes.
 * At 60 x 60 cells this is accurate to a few percent, which is plenty to say "these overlap".
 */
import { pointInMultiPolygon } from "./pip";

type MultiPolygon = { type: "MultiPolygon"; coordinates: number[][][][] };
export type BBox = [minX: number, minY: number, maxX: number, maxY: number];

export function bboxOf(g: MultiPolygon): BBox {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of g.coordinates)
    for (const [x, y] of poly[0] ?? []) {
      x0 = Math.min(x0, x!);
      y0 = Math.min(y0, y!);
      x1 = Math.max(x1, x!);
      y1 = Math.max(y1, y!);
    }
  return [x0, y0, x1, y1];
}

function bboxIntersection(a: BBox, b: BBox): BBox | null {
  const r: BBox = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[0] < r[2] && r[1] < r[3] ? r : null;
}

const M_PER_DEG = 111_320;

/** Estimated area (ha) covered by both shapes. 0 when their bounding boxes do not meet. */
export function overlapHa(a: MultiPolygon, b: MultiPolygon, cells = 60, boxes?: { a?: BBox; b?: BBox }): number {
  const box = bboxIntersection(boxes?.a ?? bboxOf(a), boxes?.b ?? bboxOf(b));
  if (!box) return 0;
  const [x0, y0, x1, y1] = box;
  const dx = (x1 - x0) / cells;
  const dy = (y1 - y0) / cells;
  let hits = 0;
  for (let i = 0; i < cells; i++)
    for (let j = 0; j < cells; j++) {
      const x = x0 + (i + 0.5) * dx;
      const y = y0 + (j + 0.5) * dy;
      if (pointInMultiPolygon(x, y, a) && pointInMultiPolygon(x, y, b)) hits++;
    }
  const midLat = ((y0 + y1) / 2) * (Math.PI / 180);
  const cellM2 = dx * M_PER_DEG * Math.cos(midLat) * (dy * M_PER_DEG);
  return (hits * cellM2) / 10_000;
}

/** Overlap worth flagging: more than 0.01 ha and more than 1 % of the smaller shape. */
export function significantOverlap(sharedHa: number, areaA: number, areaB: number): boolean {
  return sharedHa > 0.01 && sharedHa > 0.01 * Math.min(areaA, areaB);
}

/** Overlap between the parts of one multipolygon (the same land drawn twice in one placemark). */
export function selfOverlapHa(g: MultiPolygon): number {
  let total = 0;
  for (let i = 0; i < g.coordinates.length; i++)
    for (let j = i + 1; j < g.coordinates.length; j++)
      total += overlapHa({ type: "MultiPolygon", coordinates: [g.coordinates[i]!] }, { type: "MultiPolygon", coordinates: [g.coordinates[j]!] });
  return total;
}
