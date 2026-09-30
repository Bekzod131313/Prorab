// Loop construction: centreline tree → real bifilar pipe.
//
//   1. fillet the centreline (radius Rc so the inner pipe of a 90° turn keeps the pipe's minimum
//      bend radius)
//   2. pipe region = buffer(tree, s/2); U-turn caps widened to the minimum bend radius (keyhole)
//   3. concave corners rounded (closing)
//   4. the region boundary is ONE closed curve; it is opened at the root of the tree → an open pipe
//      that leaves on the right of the lead (supply) and comes back on the left (return)

import { cornerRadius } from './spiral.js';
import { cleanRing, removeSpikes, fillet, bufferPolylines, union, difference, closing, pointAt, pathLength, cleanPath, norm, ringArea, subPath, minBendRadius } from './geom.js';

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
 * S-bends too short to take two full fillets (a lead meeting a spiral jog, a jog right after the
 * entry corner): the short middle segment is replaced by a longer diagonal that starts further back
 * on the incoming segment and ends further on along the outgoing one, so both deflections shrink
 * and both arcs keep the full radius r. Turns in the same sense (U-turns) are left alone.
 */
export function easeS(pts, r) {
  let P = cleanPath(pts);
  const dirOf = (a, b) => norm({ x: b.x - a.x, y: b.y - a.y });
  const len = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const turn = (u, v) => ({ cr: u.x * v.y - u.y * v.x, th: Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))) });
  const need = (th) => r * Math.tan(th / 2);
  for (let i = 1; i + 2 < P.length; i++) {
    const [a, b, c, d] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const u = dirOf(a, b);
    const m = dirOf(b, c);
    const w = dirOf(c, d);
    const t1 = turn(u, m);
    const t2 = turn(m, w);
    if (t1.th < 1e-3 || t2.th < 1e-3 || t1.cr * t2.cr >= 0) continue;
    const L = len(b, c);
    if (need(t1.th) + need(t2.th) <= L + 1e-6) continue;
    const La = len(a, b) - (i - 1 === 0 ? 0 : len(a, b) / 2);
    const Ld = len(c, d) - (i + 2 === P.length - 1 ? 0 : len(c, d) / 2);
    for (let k = 1; k <= 40; k++) {
      const e = 0.01 * k;
      if (e > La - 1e-6 || e > Ld - 1e-6) break;
      const b2 = { x: b.x - u.x * e, y: b.y - u.y * e };
      const c2 = { x: c.x + w.x * e, y: c.y + w.y * e };
      const m2 = dirOf(b2, c2);
      const s1 = turn(u, m2);
      const s2 = turn(m2, w);
      if (s1.cr * t1.cr < 0 || s2.cr * t2.cr < 0) break;
      const n1 = need(s1.th);
      const n2 = need(s2.th);
      if (n1 + n2 <= len(b2, c2) && n1 <= len(a, b) - e - (i - 1 === 0 ? 0 : 0) && n2 <= len(c, d) - e) {
        P = [...P.slice(0, i), b2, c2, ...P.slice(i + 2)];
        break;
      }
    }
  }
  return P;
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
  const f = fillet(easeS(main, o.filletR ?? Rc), o.filletR ?? Rc);
  const center = f.pts;
  const brs = branches.map((b) => fillet(b, o.filletR ?? Rc).pts).filter((b) => b.length >= 2 && pathLength(b) > 1e-3);
  let region = bufferPolylines([center, ...brs], s / 2);
  // keyholes only where the plain U-turn (radius s/2) would be tighter than the checked minimum
  const rb = (o.rminKey ?? rmin) + 0.004;
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
  // light closing only (removes numeric slivers); a large one would facet the tight inner arcs
  region = closing(region, Math.min(0.2 * s, 0.02));
  if (region.length !== 1) errors.push({ code: 'loop_split', n: region.length });
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
  // spots left tighter than the pipe allows (a notch cut by a lead, two corners close together):
  // re-bent locally with a true arc of the design radius
  if (o.pipeFillet) pipe = repairBends(pipe, o.bendMin ?? o.pipeFillet * 0.92, o.pipeFillet);
  return { pipe, errors, center, branches: brs, region };
}

/** Arc-length position of the point of `pts` nearest to p. */
function positionOf(pts, p) {
  let acc = 0;
  let best = { d: Infinity, s: 0 };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L > 0) {
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (L * L)));
      const d = Math.hypot(a.x + t * (b.x - a.x) - p.x, a.y + t * (b.y - a.y) - p.y);
      if (d < best.d) best = { d, s: acc + t * L };
    }
    acc += L;
  }
  return best.s;
}

/**
 * Local bend repair: every spot whose bend radius (same measure as the validation) is below
 * `rmin` is replaced, between the points d before and after it, by the two tangents there meeting
 * at a corner rounded with radius `r` — the smallest d whose arc keeps the full radius wins.
 */
export function repairBends(pipe, rmin, r) {
  let P = pipe;
  const tried = new Set();
  const keyOf = (p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  // the next tight spot not tried yet (spots that cannot be re-bent, e.g. at the outlets, stay)
  const nextSpot = () => {
    const L = pathLength(P);
    for (let a = 0; a < L; a += 0.4) {
      const w = subPath(P, Math.max(0, a - 0.05), Math.min(L, a + 0.45));
      if (w.length < 3) continue;
      const m = minBendRadius(w);
      if (m.at && m.radius < rmin && !tried.has(keyOf(m.at))) return m;
    }
    return null;
  };
  for (let it = 0; it < 24; it++) {
    const w = nextSpot();
    if (!w) break;
    tried.add(keyOf(w.at));
    const L = pathLength(P);
    const sAt = positionOf(P, w.at);
    let fixed = false;
    for (const d of [0.05, 0.08, 0.12, 0.17, 0.24]) {
      if (sAt - d < 0.05 || sAt + d > L - 0.05) continue;
      const A = pointAt(P, sAt - d);
      const A0 = pointAt(P, sAt - d - 0.02);
      const B = pointAt(P, sAt + d);
      const B1 = pointAt(P, sAt + d + 0.02);
      const ua = norm({ x: A.x - A0.x, y: A.y - A0.y });
      const ub = norm({ x: B1.x - B.x, y: B1.y - B.y });
      const den = ua.x * ub.y - ua.y * ub.x;
      if (Math.abs(den) < 0.02 && ua.x * ub.x + ua.y * ub.y < -0.98) {
        // a squared U-turn: the legs are parallel — one semicircle of half their distance
        const ab = { x: B.x - A.x, y: B.y - A.y };
        const along = ab.x * ua.x + ab.y * ua.y;
        const nv = { x: ab.x - ua.x * along, y: ab.y - ua.y * along };
        const wd = Math.hypot(nv.x, nv.y);
        if (wd / 2 < rmin + 0.001) continue;
        const n = { x: nv.x / wd, y: nv.y / wd };
        const S = along >= 0 ? { x: A.x + ua.x * along, y: A.y + ua.y * along } : A;
        const C = { x: S.x + (n.x * wd) / 2, y: S.y + (n.y * wd) / 2 };
        const arc = [];
        const steps = Math.max(12, Math.ceil((Math.PI * wd) / 2 / 0.004));
        for (let k = 0; k <= steps; k++) {
          const f = (Math.PI * k) / steps;
          arc.push({ x: C.x + (wd / 2) * (-n.x * Math.cos(f) + ua.x * Math.sin(f)), y: C.y + (wd / 2) * (-n.y * Math.cos(f) + ua.y * Math.sin(f)) });
        }
        const midU = cleanPath([A, ...arc, B], 1e-6);
        const nextU = cleanPath([...subPath(P, 0, sAt - d), ...midU.slice(1, -1), ...subPath(P, sAt + d, L)], 1e-6);
        const aroundU = subPath(nextU, Math.max(0, sAt - d - 0.1), Math.min(pathLength(nextU), sAt + d + 0.1));
        if (minBendRadius(aroundU).radius >= rmin) {
          P = nextU;
          break;
        }
        continue;
      }
      if (Math.abs(den) < 1e-6) continue;
      // A + t·ua = B − k·ub
      const t = ((B.x - A.x) * ub.y - (B.y - A.y) * ub.x) / den;
      const k = (ua.x * (B.y - A.y) - ua.y * (B.x - A.x)) / den;
      if (t <= 0 || k <= 0 || t > 3 * d || k > 3 * d) continue;
      const V = { x: A.x + t * ua.x, y: A.y + t * ua.y };
      const mid = fillet([A, V, B], r).pts;
      const next = cleanPath([...subPath(P, 0, sAt - d), ...mid.slice(1, -1), ...subPath(P, sAt + d, L)], 1e-6);
      const around = subPath(next, Math.max(0, sAt - d - 0.1), Math.min(pathLength(next), sAt + d + 0.1));
      if (minBendRadius(around).radius >= rmin) {
        P = next;
        fixed = true;
        break;
      }
    }
    if (!fixed) continue;
  }
  return P;
}
