// UFH geometry kernel — robust polygon operations on top of Clipper (integer arithmetic).
//
// Conventions
//   point  {x, y} in metres, plan frame (y up)
//   ring   [point…] closed implicitly (first point not repeated)
//   shape  { outer: ring (CCW), holes: [ring (CW)…] }        — one connected region
//   region [shape…]                                          — any set of regions
// All inputs are snapped to a 0.1 mm integer grid (SCALE) so results are exact and deterministic.

import ClipperLib from '../../../vendor/clipper/clipper.mjs';

export const SCALE = 10000; // 1 unit = 0.1 mm
export const EPS_LEN = 1e-4; // 0.1 mm
export const EPS_AREA = 1e-6; // 1 mm²
const ARC_TOL = 0.0001 * SCALE; // arcs approximated within 0.1 mm

const C = ClipperLib;

// ---------- conversion ----------
const toPath = (ring) => ring.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }));
const fromPath = (path) => path.map((p) => ({ x: p.X / SCALE, y: p.Y / SCALE }));

export function ringArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export const isCCW = (ring) => ringArea(ring) > 0;
export const ccw = (ring) => (isCCW(ring) ? ring : [...ring].reverse());
export const cw = (ring) => (isCCW(ring) ? [...ring].reverse() : ring);

function shapePaths(region) {
  const out = [];
  for (const s of region) {
    out.push(toPath(ccw(s.outer)));
    for (const h of s.holes ?? []) out.push(toPath(cw(h)));
  }
  return out;
}

function treeToRegion(tree) {
  const region = [];
  const walk = (node) => {
    for (const outer of node.Childs()) {
      const shape = { outer: ccw(fromPath(outer.Contour())), holes: [] };
      for (const hole of outer.Childs()) {
        shape.holes.push(cw(fromPath(hole.Contour())));
        walk(hole); // islands inside holes
      }
      if (shape.outer.length >= 3) region.push(shape);
    }
  };
  walk(tree);
  // deterministic order: by min y then min x of the outer ring
  region.sort((a, b) => key(a.outer) - key(b.outer));
  return region;
}
const key = (ring) => {
  let m = Infinity;
  for (const p of ring) m = Math.min(m, Math.round(p.y * 1000) * 1e6 + Math.round(p.x * 1000));
  return m;
};

/** Normalise any polygon input (ring, shape, region) into a region. */
export function asRegion(x) {
  if (!x) return [];
  if (Array.isArray(x) && x.length && x[0].x !== undefined) return [{ outer: x, holes: [] }];
  if (Array.isArray(x) && x.length && Array.isArray(x[0])) return x.map((r) => ({ outer: r, holes: [] }));
  if (x.outer) return [x];
  return x;
}

// ---------- boolean operations ----------
function clip(type, a, b) {
  const c = new C.Clipper();
  c.StrictlySimple = false;
  c.AddPaths(shapePaths(asRegion(a)), C.PolyType.ptSubject, true);
  if (b) c.AddPaths(shapePaths(asRegion(b)), C.PolyType.ptClip, true);
  const tree = new C.PolyTree();
  c.Execute(type, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return treeToRegion(tree);
}
export const union = (a, b = null) => clip(C.ClipType.ctUnion, a, b);
export const difference = (a, b) => clip(C.ClipType.ctDifference, a, b);
export const intersection = (a, b) => clip(C.ClipType.ctIntersection, a, b);

/** Clean up user input: removes duplicate / collinear points and self-intersections. */
export function sanitize(ring) {
  const cleaned = C.Clipper.CleanPolygon(toPath(ring), 0.001 * SCALE);
  const simple = C.Clipper.SimplifyPolygon(cleaned, C.PolyFillType.pftNonZero);
  const c = new C.Clipper();
  c.AddPaths(simple, C.PolyType.ptSubject, true);
  const tree = new C.PolyTree();
  c.Execute(C.ClipType.ctUnion, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return treeToRegion(tree);
}

/** Remove spikes / needles and vertices closer than `dist` (Clipper CleanPolygon). */
export function cleanRing(ring, dist = 0.00002) {
  return fromPath(C.Clipper.CleanPolygon(toPath(ring), dist * SCALE));
}

/** Remove direction reversals (needles) from an open polyline. */
export function removeSpikes(pts, maxTurnDeg = 170) {
  let P = pts.slice();
  const lim = Math.cos((maxTurnDeg * Math.PI) / 180);
  for (let guard = 0; guard < 5; guard++) {
    const out = [P[0]];
    let changed = false;
    for (let i = 1; i < P.length - 1; i++) {
      const a = out[out.length - 1];
      const b = P[i];
      const c = P[i + 1];
      const ux = b.x - a.x;
      const uy = b.y - a.y;
      const vx = c.x - b.x;
      const vy = c.y - b.y;
      const lu = Math.hypot(ux, uy);
      const lv = Math.hypot(vx, vy);
      if (lu < 1e-9 || (lu > 0 && lv > 0 && (ux * vx + uy * vy) / (lu * lv) < lim)) {
        changed = true;
        continue;
      }
      out.push(b);
    }
    out.push(P[P.length - 1]);
    P = out;
    if (!changed) break;
  }
  return P;
}

/** Validate a user-drawn zone / obstacle ring. */
export function checkRing(ring) {
  const errors = [];
  if (!ring || ring.length < 3) errors.push('too_few_points');
  else {
    if (Math.abs(ringArea(ring)) < 0.01) errors.push('zero_area');
    const n = ring.length;
    for (let i = 0; i < n && !errors.includes('self_intersection'); i++)
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (segmentsIntersect(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) {
          errors.push('self_intersection');
          break;
        }
      }
  }
  return errors;
}

// ---------- offset ----------
/** Offset a region by d (negative = inwards). join: 'miter' | 'round' | 'square'. */
export function offset(region, d, join = 'miter', miterLimit = 4) {
  const co = new C.ClipperOffset(miterLimit, ARC_TOL);
  const jt = join === 'round' ? C.JoinType.jtRound : join === 'square' ? C.JoinType.jtSquare : C.JoinType.jtMiter;
  co.AddPaths(shapePaths(asRegion(region)), jt, C.EndType.etClosedPolygon);
  const tree = new C.PolyTree();
  co.Execute(tree, d * SCALE);
  return treeToRegion(tree);
}

/** Buffer open polylines by r (round caps and joins) — the swept area of a pipe of width 2r. */
export function bufferPolylines(lines, r, cap = 'round', join = 'round', arcTol = ARC_TOL / SCALE) {
  const co = new C.ClipperOffset(8, arcTol * SCALE);
  const et = cap === 'butt' ? C.EndType.etOpenButt : cap === 'square' ? C.EndType.etOpenSquare : C.EndType.etOpenRound;
  const jt = join === 'miter' ? C.JoinType.jtMiter : C.JoinType.jtRound;
  for (const l of lines) if (l.length >= 2) co.AddPath(toPath(l), jt, et);
  const tree = new C.PolyTree();
  co.Execute(tree, r * SCALE);
  return treeToRegion(tree);
}

/** Douglas–Peucker simplification of an open polyline (tolerance tol), iterative. */
export function simplifyPath(pts, tol) {
  const n = pts.length;
  if (n < 3) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let md = -1;
    let mi = -1;
    for (let k = i + 1; k < j; k++) {
      const d = segDist(pts[k], pts[i], pts[j]);
      if (d > md) (md = d), (mi = k);
    }
    if (md > tol) {
      keep[mi] = 1;
      stack.push([i, mi], [mi, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

/** Morphological opening (rounds convex corners, removes parts thinner than 2r). */
export const opening = (region, r, join = 'round') => offset(offset(region, -r, join, 8), r, join, 8);
/** Morphological closing (rounds concave corners, fills gaps narrower than 2r). */
export const closing = (region, r) => offset(offset(region, r, 'round'), -r, 'round');

// ---------- measures ----------
export function area(region) {
  let a = 0;
  for (const s of asRegion(region)) {
    a += Math.abs(ringArea(s.outer));
    for (const h of s.holes ?? []) a -= Math.abs(ringArea(h));
  }
  return a;
}

export function bbox(pts) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

export function regionBBox(region) {
  return bbox(asRegion(region).flatMap((s) => s.outer));
}

export function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function pointInRegion(p, region) {
  for (const s of asRegion(region)) if (pointInRing(p, s.outer) && !(s.holes ?? []).some((h) => pointInRing(p, h))) return true;
  return false;
}

export function segDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function closestOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy, t };
}

/** Closest point on a closed ring: { p, i (segment start index), t, d }. */
export function closestOnRing(p, ring) {
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const q = closestOnSegment(p, ring[i], ring[(i + 1) % ring.length]);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (!best || d < best.d - 1e-12) best = { p: { x: q.x, y: q.y }, i, t: q.t, d };
  }
  return best;
}

export function distToRegionBoundary(p, region) {
  let d = Infinity;
  for (const s of asRegion(region)) for (const r of [s.outer, ...(s.holes ?? [])]) d = Math.min(d, closestOnRing(p, r).d);
  return d;
}

const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
/** Proper or touching intersection of segments ab and cd (collinear overlaps count). */
export function segmentsIntersect(a, b, c, d, eps = 1e-12) {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) && ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps))) return true;
  const on = (p, q, r) => Math.min(p.x, q.x) - 1e-9 <= r.x && r.x <= Math.max(p.x, q.x) + 1e-9 && Math.min(p.y, q.y) - 1e-9 <= r.y && r.y <= Math.max(p.y, q.y) + 1e-9;
  if (Math.abs(o1) <= eps && on(a, b, c)) return true;
  if (Math.abs(o2) <= eps && on(a, b, d)) return true;
  if (Math.abs(o3) <= eps && on(c, d, a)) return true;
  if (Math.abs(o4) <= eps && on(c, d, b)) return true;
  return false;
}

export function segmentIntersection(a, b, c, d) {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(den) < 1e-15) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  if (t < -1e-12 || t > 1 + 1e-12 || u < -1e-12 || u > 1 + 1e-12) return null;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), t, u };
}

/** Clip open polylines to a region; returns the parts inside. */
export function clipLines(lines, region) {
  const c = new C.Clipper();
  for (const l of lines) if (l.length >= 2) c.AddPath(toPath(l), C.PolyType.ptSubject, false);
  c.AddPaths(shapePaths(asRegion(region)), C.PolyType.ptClip, true);
  const tree = new C.PolyTree();
  c.Execute(C.ClipType.ctIntersection, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return C.Clipper.OpenPathsFromPolyTree(tree).map(fromPath);
}

// ---------- polylines ----------
export function pathLength(pts, closed = false) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (closed && pts.length > 2) L += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  return L;
}

export function cleanPath(pts, eps = EPS_LEN) {
  const out = [];
  for (const p of pts) if (!out.length || Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y) > eps) out.push({ x: p.x, y: p.y });
  // drop collinear interior points
  const res = [];
  for (let i = 0; i < out.length; i++) {
    if (i > 0 && i < out.length - 1) {
      const a = res[res.length - 1];
      const b = out[i];
      const c = out[i + 1];
      const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
      if (Math.abs(cr) < 1e-10 && dot > 0) continue;
    }
    res.push(out[i]);
  }
  return res;
}

/** Point at arc length s along an open polyline, plus the tangent. */
export function pointAt(pts, s) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + L >= s || i === pts.length - 1) {
      const t = L > 0 ? Math.max(0, Math.min(1, (s - acc) / L)) : 0;
      return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), i, tx: L ? (b.x - a.x) / L : 1, ty: L ? (b.y - a.y) / L : 0 };
    }
    acc += L;
  }
  return { ...pts[0], i: 1, tx: 1, ty: 0 };
}

/** Sub-polyline between arc lengths s0 < s1. */
export function subPath(pts, s0, s1) {
  const out = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const e0 = acc;
    const e1 = acc + L;
    if (e1 >= s0 && e0 <= s1 && L > 0) {
      const t0 = Math.max(0, (s0 - e0) / L);
      const t1 = Math.min(1, (s1 - e0) / L);
      const p0 = { x: a.x + t0 * (b.x - a.x), y: a.y + t0 * (b.y - a.y) };
      const p1 = { x: a.x + t1 * (b.x - a.x), y: a.y + t1 * (b.y - a.y) };
      if (!out.length) out.push(p0);
      out.push(p1);
    }
    acc = e1;
  }
  return cleanPath(out);
}

/** Resample a polyline so no segment exceeds step (keeps original vertices). */
export function densify(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/**
 * Round the corners of an open polyline with true circular arcs of radius r (clamped so the
 * tangent points never pass the middle of the adjacent segments). Returns the arc radius used at
 * each corner in `radii` (for bend validation).
 */
export function fillet(pts, r, step = 0.004) {
  const P = cleanPath(pts);
  if (P.length < 3 || r <= 0) return { pts: P, radii: [] };
  const out = [P[0]];
  const radii = [];
  const avail = P.map(() => ({ in: 0, out: 0 }));
  for (let i = 1; i < P.length; i++) {
    const L = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
    // the first / last segment may be consumed fully, inner ones are shared between two corners
    avail[i - 1].out = i - 1 === 0 ? L : L / 2;
    avail[i].in = i === P.length - 1 ? L : L / 2;
  }
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1];
    const b = P[i];
    const c = P[i + 1];
    const u = norm({ x: b.x - a.x, y: b.y - a.y });
    const v = norm({ x: c.x - b.x, y: c.y - b.y });
    const cosT = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y));
    const theta = Math.acos(cosT); // deflection angle
    if (theta < 1e-4) {
      out.push(b);
      continue;
    }
    const tanHalf = Math.tan(theta / 2);
    const tMax = Math.min(avail[i].in, avail[i].out);
    const t = Math.min(r * tanHalf, tMax);
    const R = t / tanHalf;
    radii.push({ at: b, r: R, angle: theta });
    const p0 = { x: b.x - u.x * t, y: b.y - u.y * t };
    const p1 = { x: b.x + v.x * t, y: b.y + v.y * t };
    const cr = u.x * v.y - u.y * v.x;
    const nrm = cr > 0 ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
    const cen = { x: p0.x + nrm.x * R, y: p0.y + nrm.y * R };
    const a0 = Math.atan2(p0.y - cen.y, p0.x - cen.x);
    const sweep = cr > 0 ? theta : -theta;
    const n = Math.max(2, Math.ceil((R * theta) / step), Math.ceil(theta / (Math.PI / 24)));
    for (let k = 0; k <= n; k++) {
      const ang = a0 + (sweep * k) / n;
      out.push({ x: cen.x + R * Math.cos(ang), y: cen.y + R * Math.sin(ang) });
    }
  }
  out.push(P[P.length - 1]);
  return { pts: cleanPath(out, 1e-6), radii };
}

export const norm = (v) => {
  const L = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / L, y: v.y / L };
};

/**
 * Minimum radius of curvature of a polyline: the path is resampled every 2 mm and the radius is the
 * circumradius of every point with its neighbours h = 40 mm before and after along the path (the
 * radius a real pipe takes over that length). A true arc of radius R reads R; a sharp corner reads
 * ≈ h / (2·sin(θ/2)). Returns { radius, at }.
 */
export function minBendRadius(pts, closed = false, h = 0.04) {
  const P0 = cleanPath(pts, 1e-6);
  if (P0.length < 3) return { radius: Infinity, at: null };
  const P = [];
  const step = 0.002;
  let acc = 0;
  P.push(P0[0]);
  let carry = 0;
  for (let i = 1; i < P0.length; i++) {
    const a = P0[i - 1];
    const b = P0[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    let t = step - carry;
    while (t <= L) {
      P.push({ x: a.x + ((b.x - a.x) * t) / L, y: a.y + ((b.y - a.y) * t) / L });
      t += step;
    }
    carry = L - (t - step);
    acc += L;
  }
  const k = Math.max(1, Math.round(h / step));
  let best = Infinity;
  let at = null;
  for (let i = k; i < P.length - k; i++) {
    const A = P[i - k];
    const B = P[i];
    const Cc = P[i + k];
    const ab = Math.hypot(B.x - A.x, B.y - A.y);
    const bc = Math.hypot(Cc.x - B.x, Cc.y - B.y);
    const ca = Math.hypot(A.x - Cc.x, A.y - Cc.y);
    const cross = Math.abs((B.x - A.x) * (Cc.y - A.y) - (B.y - A.y) * (Cc.x - A.x));
    if (cross < 1e-12) continue;
    const R = (ab * bc * ca) / (2 * cross);
    if (R < best) {
      best = R;
      at = B;
    }
  }
  void closed;
  return { radius: best, at };
}
