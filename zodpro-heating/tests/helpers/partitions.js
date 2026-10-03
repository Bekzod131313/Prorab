// Brute force over rectangle partitions of a small lattice (test oracle for partitionsearch.js).
import { pinwheelParts } from '../../src/engines/ufh/partitionsearch.js';

/** Every partition of the n × m lattice into ≤ K rectangles [x0, y0, x1, y1] (cell units). */
export function allPartitions(n, m, K) {
  const grid = new Uint8Array(n * m);
  const out = [];
  const rects = [];
  const rec = () => {
    const f = grid.indexOf(0);
    if (f < 0) {
      out.push(rects.slice());
      return;
    }
    if (rects.length >= K) return;
    const x = f % n;
    const y = Math.floor(f / n);
    for (let w = 1; x + w <= n && !grid[y * n + x + w - 1]; w++)
      for (let h = 1; y + h <= m; h++) {
        let ok = true;
        for (let i = 0; i < w; i++) if (grid[(y + h - 1) * n + x + i]) ok = false;
        if (!ok) break;
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) grid[(y + j) * n + x + i] = 1;
        rects.push([x, y, x + w, y + h]);
        rec();
        rects.pop();
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) grid[(y + j) * n + x + i] = 0;
      }
  };
  rec();
  return out;
}

const inside = (p, r) => p[0] >= r[0] && p[1] >= r[1] && p[2] <= r[2] && p[3] <= r[3];

/** Is the partition (pieces of rect) a LEAF / SLICE (/ PINWHEEL) tree? */
export function inGrammar(rect, pieces, pinwheel = true) {
  if (pieces.length === 1) return true;
  const [i0, j0, i1, j1] = rect;
  for (let c = i0 + 1; c < i1; c++)
    if (pieces.every((p) => p[2] <= c || p[0] >= c)) {
      const L = [i0, j0, c, j1];
      const R = [c, j0, i1, j1];
      if (inGrammar(L, pieces.filter((p) => inside(p, L)), pinwheel) && inGrammar(R, pieces.filter((p) => inside(p, R)), pinwheel)) return true;
    }
  for (let c = j0 + 1; c < j1; c++)
    if (pieces.every((p) => p[3] <= c || p[1] >= c)) {
      const L = [i0, j0, i1, c];
      const R = [i0, c, i1, j1];
      if (inGrammar(L, pieces.filter((p) => inside(p, L)), pinwheel) && inGrammar(R, pieces.filter((p) => inside(p, R)), pinwheel)) return true;
    }
  if (!pinwheel || pieces.length < 5) return false;
  for (let turn = 0; turn < 2; turn++)
    for (let a = i0 + 1; a < i1; a++)
      for (let b = a + 1; b < i1; b++)
        for (let c = j0 + 1; c < j1; c++)
          for (let d = c + 1; d < j1; d++) {
            const P = pinwheelParts(i0, j0, i1, j1, a, b, c, d, turn);
            const groups = P.map((q) => pieces.filter((p) => inside(p, q)));
            if (groups.reduce((s, g) => s + g.length, 0) !== pieces.length) continue;
            if (groups.every((g, i) => g.length && inGrammar(P[i], g, pinwheel))) return true;
          }
  return false;
}

/** Deterministic random numbers. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
