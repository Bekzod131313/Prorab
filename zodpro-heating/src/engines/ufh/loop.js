// Loop construction: centreline tree → real bifilar pipe.
//
//   1. fillet the centreline (radius Rc so the inner pipe of a 90° turn keeps the pipe's minimum
//      bend radius)
//   2. pipe region = buffer(tree, s/2); U-turn caps widened to the minimum bend radius (keyhole)
//   3. concave corners rounded (closing)
//   4. the region boundary is ONE closed curve; it is opened at the root of the tree → an open pipe
//      that leaves on the right of the lead (supply) and comes back on the left (return)

import { cornerRadius } from './spiral.js';
import { cleanRing, removeSpikes, fillet, bufferPolylines, union, difference, closing, pointAt, pathLength, cleanPath, norm, ringArea } from './geom.js';

function disc(c, r, n = 48) {
  return Array.from({ length: n }, (_, i) => ({ x: c.x + r * Math.cos((2 * Math.PI * i) / n), y: c.y + r * Math.sin((2 * Math.PI * i) / n) }));
}

const TAPER = 0.35; // length over which a keyhole widens (5–11 mm over 350 mm: a gentle S)

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Smooth keyhole around the last `len` of a centreline: half-width grows from r0 − 0.5 mm to r1
 * (smoothstep, tangent at both ends) and closes with a half-circle of radius r1 — the pipe curves
 * gently outwards instead of kinking.
 */
function taper(line, r0, r1, len) {
  const L = pathLength(line);
  if (L < 1e-3) return [];
  const l = Math.min(len, L);
  const n = Math.max(8, Math.ceil(l / 0.01));
  const left = [];
  const right = [];
  let end = null;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const p = pointAt(line, L - l * (1 - t));
    const w = r0 - 0.0005 + (r1 - r0 + 0.0005) * smooth(t);
    left.push({ x: p.x - p.ty * w, y: p.y + p.tx * w });
    right.push({ x: p.x + p.ty * w, y: p.y - p.tx * w });
    end = p;
  }
  const a0 = Math.atan2(end.tx * 1, -end.ty * 1); // direction of the left normal
  const cap = [];
  for (let k = 1; k < 24; k++) {
    const ang = Math.atan2(end.tx, -end.ty) - (Math.PI * k) / 24;
    cap.push({ x: end.x + r1 * Math.cos(ang), y: end.y + r1 * Math.sin(ang) });
  }
  void a0;
  const ring = [...left, ...cap, ...right.reverse()];
  return [{ outer: ringArea(ring) > 0 ? ring : ring.reverse(), holes: [] }];
}

/** The same keyhole for the gap inside a U-turn: from the tip c back along dir. */
function taperRay(c, dir, r0, r1, len) {
  const line = [{ x: c.x + dir.x * len, y: c.y + dir.y * len }, c];
  return taper(line, r0, r1, len);
}

/**
 * @param main      centreline from the root (lead start) through the whole path
 * @param branches  extra centreline polylines (T-branches)
 * @param s         spacing (pipe to pipe)
 * @param rmin      minimum bend radius of the pipe
 * Returns { pipe, rootIndex, errors[], centre: filleted main }.
 */
export function buildLoop(main, branches, s, rmin, o = {}) {
  const errors = [];
  const Rc = cornerRadius(s, rmin);
  const f = fillet(main, o.filletR ?? Rc);
  const center = f.pts;
  const brs = branches.map((b) => fillet(b, o.filletR ?? Rc).pts).filter((b) => b.length >= 2 && pathLength(b) > 1e-3);
  let region = bufferPolylines([center, ...brs], s / 2);
  const rb = rmin + 0.004;
  if (rb > s / 2 + 1e-6) {
    // keyhole caps: every leaf end (180° turn of the pair) widens smoothly to radius rb
    const tapers = [center, ...brs].flatMap((line) => taper(line, s / 2, rb, TAPER));
    if (tapers.length) region = union(region, tapers);
    // U-turns of a meander: the gap inside the turn is widened the same way (carved)
    // (a carve that would cut the pipe through — an irregular turn — is skipped)
    const same = (a, b) => a.length === b.length && a.every((sh, k) => (sh.holes?.length ?? 0) === (b[k].holes?.length ?? 0));
    const cv = (o.uturns ?? []).map((u) => taperRay(u.c, u.dir, s / 2, rb, TAPER));
    if (cv.length) {
      const all = difference(region, cv.flat());
      if (same(all, region)) region = all;
      else
        for (const c of cv) {
          const next = difference(region, c);
          if (same(next, region)) region = next;
        }
    }
  }
  region = closing(region, Math.min(0.45 * s, rmin));
  if (region.length !== 1) errors.push({ code: 'loop_split', n: region.length });
  if (region.length !== 1 && globalThis.__UFH_DEBUG) console.log('split', JSON.stringify({ uturns: o.uturns, areas: region.map((r) => Math.abs(ringArea(r.outer))), end: center[center.length - 1] }));
  if (region[0]?.holes?.length) errors.push({ code: 'loop_self_touch', n: region[0].holes.length });
  const shape = region.reduce((a, b) => (!a || Math.abs(ringArea(b.outer)) > Math.abs(ringArea(a.outer)) ? b : a), null);
  if (!shape) return { pipe: [], errors: [{ code: 'loop_empty' }], center };
  const ring = cleanRing(shape.outer); // CCW, needles removed
  // open the ring at the root: drop the cap behind the root point
  const root = center[0];
  const d = norm({ x: center[1].x - root.x, y: center[1].y - root.y });
  const n = ring.length;
  const behind = ring.map((p) => (p.x - root.x) * d.x + (p.y - root.y) * d.y < -1e-5 && Math.hypot(p.x - root.x, p.y - root.y) <= s / 2 + rmin + 1e-3);
  if (!behind.some(Boolean)) errors.push({ code: 'loop_root' });
  // first vertex after the cap run
  let start = -1;
  for (let i = 0; i < n; i++) if (behind[i] && !behind[(i + 1) % n]) start = (i + 1) % n;
  if (start < 0) return { pipe: [], errors: [...errors, { code: 'loop_root' }], center };
  const pts = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (behind[i]) break;
    pts.push(ring[i]);
  }
  // exact end points on the root line: root ± right·s/2
  const right = { x: d.y, y: -d.x };
  const sup = { x: root.x + right.x * (s / 2), y: root.y + right.y * (s / 2) };
  const ret = { x: root.x - right.x * (s / 2), y: root.y - right.y * (s / 2) };
  let pipe = removeSpikes(cleanPath([sup, ...pts, ret], 1e-6));
  // CCW boundary: the right side of the lead is walked outwards first — if not, reverse
  const d0 = Math.hypot(pts[0].x - sup.x, pts[0].y - sup.y);
  const d1 = Math.hypot(pts[pts.length - 1].x - sup.x, pts[pts.length - 1].y - sup.y);
  if (d1 < d0) pipe = removeSpikes(cleanPath([sup, ...[...pts].reverse(), ret], 1e-6));
  return { pipe, errors, center, branches: brs, region };
}
