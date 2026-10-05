// UFH Coverage Router — step 4: obstacle-around spiral (bifilar spiral wrapped round obstacles).
//
// A region with an obstacle inside (rectangle − exclusion; exclusion = obstacle offset by its
// clearance) is an annulus: closed rings round the obstacle cannot carry two interleaved arms. The
// region is made simply connected by a SEAM — a zero-width cut (SEAM_WIDTH) from the exclusion to the
// region's outline. The seam is no gap in the floor: the rings run along both of its sides at s/2,
// so the pipes on the two sides are s apart like everywhere else.
//
//   rings      ring k = the seamed region offset inwards by s/2 + k·s (exact mitered offsets of a
//              rectilinear polygon, so every ring follows the obstacle's sides at a fixed distance);
//              parts of a ring narrower than s are cut off (a strip between obstacle and wall too
//              narrow for that ring simply ends there — the ring never squeezes through it)
//   arms       supply on the even rings going in, return on the odd rings coming out; a lap ends
//              where the first side of the ring two further in begins (as in spiralgen); 180° centre
//              turn of radius s/2 ('side' or 'hairpin' through the core)
//   bends      every corner — the room's and the obstacle's — a true arc of radius r ≥ the minimum
//              bend radius (round the obstacle no sharp corner; the mitered rings meet on the
//              diagonals, so no corner area is lost). A corner without room for its arc makes the
//              variant INVALID (never a smaller radius).
//   checks     built geometry only: spacing ≥ s − SPACING_TOL, bends, no crossing, every heating
//              point ≥ s/2 from the region outline, the exclusions and the seam.
//
// SIDE residual closure (Phase 6 reopen, reference behaviour): the rest width W mod s is not left
// in the core but put on one side X of the region, between the supply's first lap (ring 0) and the
// return's last lap (ring 1) — the final pass of the loop runs along that side strip ρ from ring 0
// and then returns: across the region s/2, ρ, s, s, …, s, s/2 (ρ only there, MIN_RESIDUAL_CLOSURE ≤ ρ
// < s, one residual pair). Rings k ≥ 1 are the rings of the region moved out by s − ρ on side X;
// side X is never one of the two sides at the start corner (the ends and stubs keep their place).
//
// Seams: from each exclusion corner along the extension of its sides and from the middle of each
// side, straight to the region's outline. A seam through the narrow strip between an obstacle and a
// wall lets the rings end there instead of splitting. All seams × start corners are tried; the
// variants are compared like spiralgen's (coverage of the heating pipe first).

import * as G from './geom.js';
import { SEAM_WIDTH, SPACING_TOL, RMIN_CHECK, MIN_RESIDUAL_CLOSURE_SPACING, MAX_RESIDUAL_RINGS, RESIDUAL_SEARCH_STEP } from './criteria.js';

const EPS = 1e-9;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const len = (a) => Math.hypot(a.x, a.y);
const unit = (a) => mul(a, 1 / (len(a) || 1));
const left = (u) => ({ x: -u.y, y: u.x });

function lineX(p, u, q, v) {
  const d = cross(u, v);
  if (Math.abs(d) < EPS) return null;
  const t = cross(sub(q, p), v) / d;
  return add(p, mul(u, t));
}

/** CCW ring without duplicate / collinear vertices. */
function tidy(ring) {
  let P = G.cleanPath([...ring], 1e-6);
  if (P.length > 1 && len(sub(P[0], P[P.length - 1])) < 1e-6) P = P.slice(0, -1);
  if (G.ringArea(P) < 0) P = P.reverse();
  for (let guard = 0; guard < 4; guard++) {
    const n = P.length;
    const keep = P.filter((p, i) => Math.abs(cross(sub(p, P[(i - 1 + n) % n]), sub(P[(i + 1) % n], p))) > 1e-10);
    if (keep.length === P.length) break;
    P = keep;
  }
  return P;
}

/**
 * Smallest distance between stretches of a path more than ~π·s apart along it (grid index); stops
 * early once below `stop`.
 */
export function minPipeGap(path, s, stop = -1) {
  const gap = Math.PI * s * 0.5 + 2 * s;
  const cell = s;
  const grid = new Map();
  const segs = [];
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const l = len(sub(b, a));
    const sg = { a, b, s0: acc, s1: acc + l };
    segs.push(sg);
    acc += l;
    for (let gx = Math.floor(Math.min(a.x, b.x) / cell); gx <= Math.floor(Math.max(a.x, b.x) / cell); gx++)
      for (let gy = Math.floor(Math.min(a.y, b.y) / cell); gy <= Math.floor(Math.max(a.y, b.y) / cell); gy++) {
        const k = gx * 100003 + gy;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(sg);
      }
  }
  let best = Infinity;
  for (const sg of segs) {
    const l = sg.s1 - sg.s0;
    for (let q = Math.ceil(sg.s0 / 0.05) * 0.05; q < sg.s1; q += 0.05) {
      const f = l > 0 ? (q - sg.s0) / l : 0;
      const p = { x: sg.a.x + (sg.b.x - sg.a.x) * f, y: sg.a.y + (sg.b.y - sg.a.y) * f };
      const gx = Math.floor(p.x / cell);
      const gy = Math.floor(p.y / cell);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const t of grid.get((gx + dx) * 100003 + gy + dy) ?? []) {
            if (t.s1 > q - gap && t.s0 < q + gap) continue;
            const dd = G.segDist(p, t.a, t.b);
            if (dd < best) {
              best = dd;
              if (best < stop) return best;
            }
          }
    }
  }
  return best;
}

/**
 * Spacing with a residual closure: a pair with a point in the terminal stretch of the path
 * (inZone(arc length) — the closure: residual ring, hairpin legs, centre turn) may be closer than s
 * (the residual), every other pair keeps the nominal spacing.
 * Returns { nom, res } — the smallest gap of each kind (stops early below the limits).
 */
export function zonedGap(path, s, inZone, stopNom = -1, stopRes = -1) {
  const gap = Math.PI * s * 0.5 + 2 * s;
  const cell = s;
  const grid = new Map();
  const segs = [];
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const l = len(sub(b, a));
    const sg = { a, b, s0: acc, s1: acc + l, deep: null };
    segs.push(sg);
    acc += l;
    for (let gx = Math.floor(Math.min(a.x, b.x) / cell); gx <= Math.floor(Math.max(a.x, b.x) / cell); gx++)
      for (let gy = Math.floor(Math.min(a.y, b.y) / cell); gy <= Math.floor(Math.max(a.y, b.y) / cell); gy++) {
        const k = gx * 100003 + gy;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(sg);
      }
  }
  const deep = (sg) => (sg.deep ??= inZone((sg.s0 + sg.s1) / 2));
  const out = { nom: Infinity, res: Infinity };
  for (const sg of segs) {
    const l = sg.s1 - sg.s0;
    for (let q = Math.ceil(sg.s0 / 0.05) * 0.05; q < sg.s1; q += 0.05) {
      const f = l > 0 ? (q - sg.s0) / l : 0;
      const p = { x: sg.a.x + (sg.b.x - sg.a.x) * f, y: sg.a.y + (sg.b.y - sg.a.y) * f };
      let pDeep = null;
      const gx = Math.floor(p.x / cell);
      const gy = Math.floor(p.y / cell);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const t of grid.get((gx + dx) * 100003 + gy + dy) ?? []) {
            if (t.s1 > q - gap && t.s0 < q + gap) continue;
            const dd = G.segDist(p, t.a, t.b);
            if (dd >= s) continue;
            pDeep ??= inZone(q);
            if (pDeep || deep(t)) {
              if (dd < out.res) (out.res = dd), (out.atRes = { p, q, s: (t.s0 + t.s1) / 2 });
            } else if (dd < out.nom) (out.nom = dd), (out.atNom = { p, q, s: (t.s0 + t.s1) / 2 });
            if (out.nom < stopNom || out.res < stopRes) return out;
          }
    }
  }
  return out;
}

/**
 * Corners rounded with true arcs, the radius given per corner (rad[i] for vertex i). A corner whose
 * arc does not fit between its neighbours' arcs is reported (never shrunk).
 */
function filletVar(P, rad, roomOnly = false, step = 0.004) {
  const out = [P[0]];
  const tl = P.map((_, i) => {
    if (i === 0 || i === P.length - 1) return 0;
    const u = unit(sub(P[i], P[i - 1]));
    const v = unit(sub(P[i + 1], P[i]));
    const th = Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
    return th < 1e-4 ? 0 : rad[i] * Math.tan(th / 2);
  });
  for (let i = 1; i < P.length; i++) {
    const L = len(sub(P[i], P[i - 1]));
    if (tl[i - 1] + tl[i] > L + 1e-7) return { tight: P[tl[i - 1] > tl[i] ? i - 1 : i] };
  }
  if (roomOnly) return {};
  for (let i = 1; i < P.length - 1; i++) {
    const b = P[i];
    const u = unit(sub(b, P[i - 1]));
    const v = unit(sub(P[i + 1], b));
    const th = Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
    if (th < 1e-4) {
      out.push(b);
      continue;
    }
    const R = rad[i];
    const t = tl[i];
    const p0 = sub(b, mul(u, t));
    const cr = cross(u, v);
    const nrm = cr > 0 ? left(u) : mul(left(u), -1);
    const cen = add(p0, mul(nrm, R));
    const a0 = Math.atan2(p0.y - cen.y, p0.x - cen.x);
    const sweep = cr > 0 ? th : -th;
    const n = Math.max(2, Math.ceil((R * th) / step), Math.ceil(th / (Math.PI / 24)));
    for (let k = 0; k <= n; k++) out.push({ x: cen.x + R * Math.cos(a0 + (sweep * k) / n), y: cen.y + R * Math.sin(a0 + (sweep * k) / n) });
  }
  out.push(P[P.length - 1]);
  return { pts: G.cleanPath(out, 1e-6) };
}

/** 180° turn of radius s/2 from X (heading u) round to X + w·s. */
function uturn(X, u, w, s) {
  const C = add(X, mul(w, s / 2));
  const a0 = Math.atan2(X.y - C.y, X.x - C.x);
  const sweep = cross(u, w) > 0 ? Math.PI : -Math.PI;
  const steps = Math.max(12, Math.ceil((Math.PI * s) / 2 / 0.004));
  const out = [];
  for (let i = 1; i < steps; i++) {
    const a = a0 + (sweep * i) / steps;
    out.push({ x: C.x + (s / 2) * Math.cos(a), y: C.y + (s / 2) * Math.sin(a) });
  }
  return out;
}

/**
 * The seamed region: shape (outer + holes) minus a SEAM_WIDTH strip along each seam. One side of
 * the strip lies exactly on the seam line (no 0.1 mm jogs where it meets an obstacle side).
 * @param seams [{ a (on the exclusion), b (on the outline), side (+1/−1: which side of a→b the strip lies) }]
 * @returns CCW ring (simply connected) or null
 */
export function seamRegion(shape, seams) {
  const strips = seams.map(({ a, b, side }) => {
    const u = unit(sub(b, a));
    const n = mul(left(u), side * SEAM_WIDTH);
    const a0 = sub(a, mul(u, 0.002));
    const b0 = add(b, mul(u, 0.002));
    return [a0, b0, add(b0, n), add(a0, n)];
  });
  const R = G.difference([shape], G.union(strips.map((r) => ({ outer: G.ringArea(r) < 0 ? [...r].reverse() : r, holes: [] }))));
  if (R.length !== 1 || (R[0].holes ?? []).length) return null;
  return tidy(R[0].outer);
}

/** Seam candidates of one exclusion (rectilinear ring) towards the shape's outline. */
export function seamCandidates(shape, hole, others = []) {
  const H = tidy(hole);
  const out = [];
  const outline = shape.outer;
  const n = H.length;
  const blockers = others.map((o) => tidy(o));
  const hit = (p, u) => {
    // first crossing of the ray p + t·u (t > 0) with the outline
    let best = null;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      const e = sub(b, a);
      const d = cross(u, e);
      if (Math.abs(d) < EPS) continue;
      const t = cross(sub(a, p), e) / d;
      const w = cross(sub(a, p), u) / d;
      if (t > 1e-6 && w > 1e-6 && w < 1 - 1e-6 && (!best || t < best.t)) best = { t, q: add(p, mul(u, t)) };
    }
    return best;
  };
  const blocked = (a, b) =>
    blockers.some((R) => R.some((p, i) => G.segmentsIntersect(a, b, p, R[(i + 1) % R.length]))) ||
    // the seam must not run back through its own exclusion
    G.pointInRing(add(a, mul(unit(sub(b, a)), 0.01)), H);
  for (let i = 0; i < n; i++) {
    const p = H[i];
    const q = H[(i + 1) % n];
    const e = unit(sub(q, p));
    // the exclusion's own inside: left of its CCW sides
    const inside = left(e);
    // extensions of the side beyond both corners (strip on the exclusion's side of the line)
    for (const [from, u] of [
      [q, e],
      [p, mul(e, -1)],
    ]) {
      const h = hit(from, u);
      if (!h || blocked(from, h.q)) continue;
      const side = cross(u, inside) > 0 ? 1 : -1;
      out.push({ a: from, b: h.q, side, len: h.t, kind: 'extension' });
    }
    // perpendicular from the middle of the side
    const m = mul(add(p, q), 0.5);
    const u = mul(inside, -1);
    const h = hit(m, u);
    if (h && !blocked(m, h.q)) out.push({ a: m, b: h.q, side: 1, len: h.t, kind: 'middle' });
  }
  // same seam twice (corner extensions of two sides can coincide): keep one
  const seen = new Set();
  return out
    .filter((c) => {
      const k = [c.a.x, c.a.y, c.b.x, c.b.y].map((v) => v.toFixed(4)).join(',');
      return seen.has(k) ? false : (seen.add(k), true);
    })
    .sort((a, b) => a.len - b.len);
}

/**
 * Bifilar spiral in a simply connected rectilinear region (a seamed region).
 * @param P      CCW ring (may contain seams)
 * @param s      spacing
 * @param o.r    bend radius at convex corners
 * @param o.start  start vertex index (a convex corner; the ends leave through the edge into it)
 * @param o.rings  precomputed rings (ringsOf)
 */
export function seamSpiral(P, s, o = {}) {
  const n = P.length;
  const r = o.r ?? Math.max(0.072, s / 2);
  const v = o.start ?? 0;
  // ring offsets: nominal s/2 + k·s; with a residual closure (o.res = { n, rho, single }) the
  // element after ring n−1 (ring n, at most MAX_RESIDUAL_RINGS rings, or the hairpin legs) steps
  // by rho < s — and the following ones by rho as well ('uniform': the centre turn diameter rho), or
  // by s again ('single': the residual only once, the turn at the nominal diameter)
  const res = o.res ?? null;
  // (a side residual keeps the nominal offsets at the start corner — X is not one of its sides)
  const side = res?.side ? res : null;
  const d = (k) => (!res || side || k < res.n ? s / 2 + k * s : s / 2 + (res.n - 1) * s + res.rho + (k - res.n) * (res.single ? s : res.rho));
  const Cn = P[v];
  const ePrev = P[(v - 1 + n) % n];
  const eNext = P[(v + 1) % n];
  const uF = unit(sub(eNext, Cn)); // first side direction
  const uL = unit(sub(Cn, ePrev)); // last side direction (into the corner)
  if (cross(uL, uF) <= 1e-9) return { ok: false, reason: 'start_not_convex' };
  const nF = left(uF);
  const nL = left(uL);
  // side X must not be a side of the start corner (outward normal of the first side −nF, last −nL)
  if (side && (dot(side.dir, nF) < -1 + 1e-6 || dot(side.dir, nL) < -1 + 1e-6)) return { ok: false, reason: 'side_at_start' };
  const ringsAll = o.rings ?? ringsOf(P, s, res);
  // rings in the start vertex's frame: rotated so V[0] is the image of the start corner
  const rings = [];
  for (let k = 0; k < ringsAll.length; k++) {
    const want = add(Cn, add(mul(nF, d(k)), mul(nL, d(k))));
    let found = null;
    for (const R of ringsAll[k]) {
      const i = R.findIndex((p) => len(sub(p, want)) < 3e-4);
      if (i >= 0) {
        found = [...R.slice(i), ...R.slice(0, i)];
        break;
      }
    }
    if (!found) break;
    const m = found.length;
    if (dot(unit(sub(found[1], found[0])), uF) < 1 - 1e-6 || dot(unit(sub(found[0], found[m - 1])), uL) < 1 - 1e-6) break;
    found[0] = want;
    // the same arc radius r at every corner — round the obstacle's corners too (the mitered rings
    // meet on the diagonals, so no corner area is lost; ring 0 is concentric with the exclusion
    // corner when r = s/2)
    const radius = found.map(() => r);
    rings.push({ V: found, rad: radius });
  }
  if (rings.length < 2) return { ok: false, reason: 'too_small', rings: rings.length };
  const firstLine = (k) => ({ p: add(Cn, mul(nF, d(k))), u: uF });
  const lastLine = (k) => ({ p: add(Cn, mul(nL, d(k))), u: uL });
  const T = (k, k2) => lineX(lastLine(k).p, uL, firstLine(k2).p, uF);
  // on ring k's last side, at least `room` from its previous vertex
  const onLast = (k, E, room) => {
    const R = rings[k].V;
    const a = R[R.length - 1];
    const t = dot(sub(E, a), uL);
    return t > room - 1e-6 && t < len(sub(R[0], a)) + 1e-6;
  };
  // one arm: rings p, p+2, …, last; ends at `end` on the last ring's last side
  const arm = (p, last, end, endRad, endTerm = false) => {
    const pts = [];
    const rad = [];
    // index of the first point of the terminal (residual) part, if any
    let term = -1;
    const stub = lineX(firstLine(p).p, uF, ePrev, sub(Cn, ePrev));
    pts.push(stub, rings[p].V[0]);
    rad.push(0, rings[p].rad[0]);
    for (let k = p; k <= last; k += 2) {
      const R = rings[k];
      for (let i = 1; i < R.V.length; i++) pts.push(R.V[i]), rad.push(R.rad[i]);
      if (k < last) {
        const X = T(k, k + 2);
        if (!X || !onLast(k, X, rings[k].rad[R.V.length - 1] + r)) return null;
        if (res && k + 2 >= res.n && term < 0) term = pts.length;
        pts.push(X);
        rad.push(r);
      } else {
        if (endTerm && term < 0) term = pts.length;
        pts.push(...end);
        rad.push(...endRad);
      }
    }
    return { pts, rad, term };
  };
  const valid = [];
  const tries = [];
  const region = [{ outer: P, holes: [] }];
  // coverage is measured on the real region (o.cover: without any pipe-free margin)
  const coverRegion = o.cover ?? region;
  const build = (used, centre) => {
    const kIn = used - 1;
    const kOut = used - 2;
    const inA = kIn % 2 === 0; // which arm (A even rings, B odd) runs the innermost ring
    let endIn;
    let endOut;
    let radIn;
    let radOut;
    let turn;
    if (centre === 'side') {
      // the innermost two laps joined by a 180° turn of diameter t (their distance), its apex t
      // short of ring kIn's first side
      const t = d(kIn) - d(kOut);
      if (t / 2 < RMIN_CHECK) return { reason: 'bend', turn: t / 2 };
      const ET = { p: add(Cn, mul(nF, d(kIn) + 1.5 * t)), u: uF };
      const EO = lineX(lastLine(kOut).p, uL, ET.p, uF);
      const EI = add(EO, mul(nL, t));
      if (!onLast(kOut, EO, rings[kOut].rad[rings[kOut].V.length - 1]) || !onLast(kIn, EI, rings[kIn].rad[rings[kIn].V.length - 1])) return { reason: 'centre' };
      endOut = [EO];
      endIn = [EI];
      radOut = [0];
      radIn = [0];
      turn = inA ? uturn(EI, uL, mul(nL, -1), t) : uturn(EO, uL, nL, t);
    } else {
      // hairpin: the last laps step onto the first side lines of rings kIn+1, kIn+2 (legs t apart)
      // and run along them to (gap + t/2) short of ring kIn's second side
      const t = d(kIn + 2) - d(kIn + 1);
      const gapA = d(kIn + 1) - d(kIn);
      if (t / 2 < RMIN_CHECK) return { reason: 'bend', turn: t / 2 };
      const RI = rings[kIn].V;
      if (Math.abs(dot(unit(sub(RI[2], RI[1])), uF)) > 1e-6) return { reason: 'centre' };
      const stop = { p: sub(RI[1], mul(uF, gapA + t / 2)), u: unit(sub(RI[2], RI[1])) };
      const LO = firstLine(kIn + 1);
      const LI = firstLine(kIn + 2);
      const TO = T(kOut, kIn + 1);
      const TI = T(kIn, kIn + 2);
      const XO = lineX(LO.p, uF, stop.p, stop.u);
      const XI = lineX(LI.p, uF, stop.p, stop.u);
      if (!TO || !TI || !XO || !XI) return { reason: 'centre' };
      if (!onLast(kOut, TO, rings[kOut].rad[rings[kOut].V.length - 1] + r) || !onLast(kIn, TI, rings[kIn].rad[rings[kIn].V.length - 1] + r)) return { reason: 'centre' };
      if (dot(sub(XO, TO), uF) < 2 * r + 1e-6 || dot(sub(XI, TI), uF) < 2 * r + 1e-6) return { reason: 'centre' };
      endOut = [TO, XO];
      endIn = [TI, XI];
      radOut = [r, 0];
      radIn = [r, 0];
      turn = inA ? uturn(XI, uF, mul(nF, -1), t) : uturn(XO, uF, nF, t);
    }
    const lastA = inA ? kIn : kOut;
    const lastB = inA ? kOut : kIn;
    // hairpin legs on residual offsets are terminal from their first point (the transition)
    const legTermIn = centre === 'hairpin' && !!res && kIn + 2 >= res.n;
    const legTermOut = centre === 'hairpin' && !!res && kIn + 1 >= res.n;
    const A = arm(0, lastA, inA ? endIn : endOut, inA ? radIn : radOut, inA ? legTermIn : legTermOut);
    const B = arm(1, lastB, inA ? endOut : endIn, inA ? radOut : radIn, inA ? legTermOut : legTermIn);
    if (!A || !B) return { reason: 'transition' };
    const fa = filletVar(A.pts, A.rad, true);
    const fb = filletVar(B.pts, B.rad, true);
    if (fa.tight || fb.tight) return { reason: 'bend', at: fa.tight ?? fb.tight };
    // the corner polylines (arcs drawn on demand: make())
    const leadIn = len(sub(A.pts[1], A.pts[0]));
    const leadOut = len(sub(B.pts[1], B.pts[0]));
    const estimate = G.pathLength(A.pts) + G.pathLength(B.pts) - leadIn - leadOut;
    let fA = null;
    let fB = null;
    const fa0 = () => (fA ??= filletVar(A.pts, A.rad).pts);
    const fb0 = () => (fB ??= filletVar(B.pts, B.rad).pts);
    const make = () => {
      const path = G.cleanPath([...fa0(), ...turn, ...[...fb0()].reverse()], 1e-6);
      const total = G.pathLength(path);
      const heating = G.subPath(path, leadIn, total - leadOut);
      // the terminal stretch [t0, t1] of the path (arc length): from the first residual element of
      // arm A, through the turn, to that of arm B (an arm without one: from its end)
      // (positions on the filleted pipe: the arc length of its point nearest to the corner, less r)
      const at = (pts, q) => {
        let acc = 0;
        let best = { d: Infinity, s: 0 };
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const l = len(sub(b, a));
          const c = G.closestOnSegment(q, a, b);
          const dd = len(sub(c, q));
          if (dd < best.d) best = { d: dd, s: acc + len(sub(c, a)) };
          acc += l;
        }
        return Math.max(0, best.s - r);
      };
      if (side) {
        // the final pass: the return arm's ring 1 from its lap along side X to the end (arm B runs
        // reversed at the end of the path; its ring-1 side X is V[i] → V[i+1] going in)
        const V = rings[1].V;
        let iX = -1;
        let best = 0;
        for (let i = 0; i < V.length; i++) {
          const a = V[i];
          const b = V[(i + 1) % V.length];
          const u = unit(sub(b, a));
          const L = len(sub(b, a));
          if (dot({ x: u.y, y: -u.x }, side.dir) > 1 - 1e-6 && L > best) (best = L), (iX = i);
        }
        if (iX < 0) return { path, heating, leadIn, leadOut, total, supply: A.pts[0], ret: B.pts[0], terminal: null };
        const t0 = Math.max(0, total - at(fb0(), V[(iX + 1) % V.length]) - 2 * r);
        return { path, heating, leadIn, leadOut, total, supply: A.pts[0], ret: B.pts[0], terminal: [t0, total] };
      }
      const t0 = A.term >= 0 ? at(fa0(), A.pts[A.term]) : G.pathLength(fa0());
      const t1 = total - (B.term >= 0 ? at(fb0(), B.pts[B.term]) : G.pathLength(fb0()));
      return { path, heating, leadIn, leadOut, total, supply: A.pts[0], ret: B.pts[0], terminal: [t0, t1] };
    };
    return { make, estimate, turnR: (centre === 'side' ? d(kIn) - d(kOut) : d(kIn + 2) - d(kIn + 1)) / 2 };
  };
  // the built geometry checked: spacing and clearance (null when valid)
  const check = (b, used, centre) => {
    // (spacing on the path simplified within 0.5 mm: the arcs in fewer pieces)
    const lean = G.simplifyPath(b.path, 0.0005);
    if (side && !b.terminal) return { reason: 'side_terminal' };
    if (resUsed(used, centre)) {
      // nominal pairs ≥ s − tol; pairs in the terminal (residual) zone ≥ MIN_RESIDUAL_CLOSURE_SPACING
      const [t0, t1] = b.terminal;
      const z = zonedGap(lean, s, (q) => q >= t0 && q <= t1, s - SPACING_TOL, MIN_RESIDUAL_CLOSURE_SPACING - SPACING_TOL);
      if (z.nom < s - SPACING_TOL) return { reason: 'spacing', gap: z.nom, at: z.atNom, terminal: b.terminal };
      if (z.res < MIN_RESIDUAL_CLOSURE_SPACING - SPACING_TOL) return { reason: 'residual_spacing', gap: z.res };
      b.minResidual = z.res;
      b.minNominal = z.nom;
    } else {
      const sp = minPipeGap(lean, s, s - SPACING_TOL);
      if (sp < s - SPACING_TOL) return { reason: 'spacing', gap: sp };
    }
    // every heating point keeps s/2 from the outline, the exclusions and the seams
    const lim = s / 2 - SPACING_TOL;
    for (const q of G.densify(G.simplifyPath(b.heating, 0.0005), 0.05)) if (!G.pointInRing(q, P) || G.distToRegionBoundary(q, region) < lim) return { reason: 'clearance', at: q };
    return null;
  };
  // does a variant reach the residual offsets (rings from res.n on, or hairpin legs there)?
  const resUsed = (used, centre) => !!res && (side ? used >= 2 : (centre === 'hairpin' ? used + 1 : used - 1) >= res.n);
  const variant = (b, used, centre) => ({
    ok: true,
    kind: 'RAW_SPIRAL',
    // nominal spacing of the whole spiral; a residual closure only in its terminal part
    nominalSpacing: s,
    residualSpacing: resUsed(used, centre) ? res.rho : null,
    residual: !resUsed(used, centre) ? null : side ? { side: side.name, rho: res.rho, terminal: b.terminal, rings: 1, minMeasured: b.minResidual ?? null } : { n: res.n, rho: res.rho, single: !!res.single, dRes: d(res.n), terminal: b.terminal, rings: Math.max(0, used - res.n), minMeasured: b.minResidual ?? null },
    // where the terminal closure lies: 'side' (left / right / top / bottom of the plan) or the centre
    closureSide: !resUsed(used, centre) ? null : side ? side.name : 'centre',
    path: b.path,
    heating: b.heating,
    supply: b.supply,
    ret: b.ret,
    leadIn: b.leadIn,
    leadOut: b.leadOut,
    heatingLength: b.total - b.leadIn - b.leadOut,
    laps: Math.ceil(used / 2),
    centre,
    rings: rings.length,
    usedRings: used,
    r,
    s,
    start: v,
    region: P,
    tries,
  });
  // o.lazy: every buildable variant, not drawn and unchecked — the caller draws and checks the
  // longest ones only: { estimate (corner polyline length), get() → variant or { reason } }
  if (o.lazy) {
    const cands = [];
    for (let used = rings.length; used >= 2; used--)
      for (const centre of ['hairpin', 'side']) {
        const g = build(used, centre);
        if (!g.make) {
          tries.push({ used, centre, ...g });
          continue;
        }
        cands.push({
          estimate: g.estimate,
          used,
          centre,
          residualUsed: resUsed(used, centre),
          start: v,
          get: () => {
            const b = g.make();
            return check(b, used, centre) ?? { ...variant(b, used, centre), minBend: Math.min(r, g.turnR) };
          },
        });
      }
    return cands.length ? { ok: true, variants: cands } : { ok: false, reason: 'no_valid_spiral', tries, rings: rings.length };
  }
  for (let used = rings.length; used >= 2; used--) {
    for (const centre of ['hairpin', 'side']) {
      const g = build(used, centre);
      const b = g.make ? g.make() : null;
      const bad = b ? check(b, used, centre) : g;
      if (bad) {
        tries.push({ used, centre, ...bad });
        continue;
      }
      valid.push(variant(b, used, centre));
    }
    if (valid.length) break;
  }
  if (!valid.length) return { ok: false, reason: 'no_valid_spiral', tries, rings: rings.length };
  for (const x of valid) measure(x, s, coverRegion);
  return valid.reduce((a, b) => (b.uncovered < a.uncovered - 1e-6 ? b : a));
}

/** Uncovered floor of a variant (heating pipe band s/2 each side) and its largest patch. */
export function measure(x, s, cover) {
  if (x.unc) return x;
  const band = G.bufferPolylines([G.simplifyPath(x.heating, 0.002)], s / 2 + 0.003, 'round', 'round', 0.001);
  x.unc = G.difference(cover, band);
  x.uncovered = G.area(x.unc);
  x.largestHole = G.opening(x.unc, s / 2).reduce((a, q) => Math.max(a, G.area([q])), 0);
  return x;
}

/**
 * Rings of a seamed region: offsets at s/2 + k·s, parts thinner than s cut off. Each ring is a list
 * of CCW rings (the offset may fall apart — only the part holding the start corner is used).
 * With a residual closure (res = { n, rho }): rings 0 … n−1 nominal, then at most
 * MAX_RESIDUAL_RINGS rings rho further in (parts thinner than MIN_RESIDUAL_CLOSURE_SPACING cut off).
 */
const ringCache = new WeakMap();
export function ringsOf(P, s, res = null) {
  if (!ringCache.has(P)) ringCache.set(P, new Map());
  const cache = ringCache.get(P);
  const ring = (dk, cut) => {
    const key = `${dk.toFixed(6)}|${cut.toFixed(6)}`;
    if (!cache.has(key)) {
      const R = G.offset(G.offset([{ outer: P, holes: [] }], -(dk + cut), 'miter', 4), cut, 'miter', 4);
      cache.set(key, R.filter((sh) => !(sh.holes ?? []).length).map((sh) => tidy(sh.outer)));
    }
    return cache.get(key);
  };
  const out = [];
  if (res?.side) {
    // ring 0 of the region; rings k ≥ 1 of the region moved out by e = s − ρ on side X
    const e = s - res.rho;
    const key = `side|${res.name}|${res.rho.toFixed(6)}`;
    if (!cache.has(key)) {
      const moved = P.map((p) => ({ x: p.x + res.dir.x * e, y: p.y + res.dir.y * e }));
      const Q = G.union([{ outer: P, holes: [] }, { outer: G.ringArea(moved) < 0 ? [...moved].reverse() : moved, holes: [] }]);
      cache.set(key, Q.length === 1 && !(Q[0].holes ?? []).length ? tidy(Q[0].outer) : null);
    }
    const Q = cache.get(key);
    if (!Q) return out;
    const R0 = ring(s / 2, s / 2 - 0.001);
    if (!R0.length) return out;
    out.push(R0);
    for (let k = 1; k < 400; k++) {
      const R = G.offset(G.offset([{ outer: Q, holes: [] }], -(s / 2 + k * s + s / 2 - 0.001), 'miter', 4), s / 2 - 0.001, 'miter', 4)
        .filter((sh) => !(sh.holes ?? []).length)
        .map((sh) => tidy(sh.outer));
      if (!R.length) break;
      out.push(R);
    }
    return out;
  }
  const nom = res ? res.n : 400;
  for (let k = 0; k < nom; k++) {
    const R = ring(s / 2 + k * s, s / 2 - 0.001);
    if (!R.length) return out;
    out.push(R);
  }
  for (let j = 1; res && j <= MAX_RESIDUAL_RINGS; j++) {
    const R = ring(s / 2 + (res.n - 1) * s + j * res.rho, MIN_RESIDUAL_CLOSURE_SPACING / 2 - 0.001);
    if (!R.length) break;
    out.push(R);
  }
  return out;
}

/**
 * Obstacle-around spiral of one region: exclusions inside it (holes — wrapped, with seams) and / or
 * obstacles biting into its outline (a notched rectangle — the rings follow the notch).
 * @param shape  { outer (rectilinear ring), holes: [exclusion rings] }
 * @param s      spacing
 * @param o      { r, toward, maxHole, exitOk(sp), edgeOk(a, b) (the ends may leave through edge a→b), maxSeams,
 *                 measure (variants measured per group), residual (try residual closures), supplyAt,
 *                 returnAll (every measured variant), groupByStart (measure per start corner) }
 * @returns best RAW_SPIRAL (with .seams, .seamed) or { ok: false, reason, tries }
 */
export function obstacleSpiral(shape, s, o = {}) {
  const holes0 = (shape.holes ?? []).map((h) => tidy(h));
  const outer = tidy(shape.outer);
  const real = [{ outer, holes: holes0.map((h) => [...h].reverse()) }];
  const area = G.area(real);
  const all = [];
  const tries = [];
  // margin variants (see alignMargins): the exclusions as they are; the rest width as a margin
  // beside the exclusions ('obstacle': least uncovered floor, but a strip ≥ s wide is a patch);
  // up to just under s of it there and the remainder left in the core ('partial': a strip
  // thinner than s is no patch — the pipes on both sides of it reach over it)
  const variants = [{ holes: holes0, margin: false }];
  const ms = holes0.map((h, i) => alignMargins(outer, h, holes0.filter((_, j) => j !== i), s));
  if (ms.some(Boolean)) {
    variants.push({ holes: holes0.map((h, i) => (ms[i] ? grow(h, ms[i]) : h)), margin: 'obstacle' });
    const part = ms.map((m) => m && m.map((x) => Math.min(x, s - 0.01)));
    if (part.some((m, i) => m && m.some((x, j) => x < ms[i][j] - 1e-9))) variants.push({ holes: holes0.map((h, i) => (part[i] ? grow(h, part[i]) : h)), margin: 'partial' });
  }
  for (const { holes, margin } of variants) {
    const sh = { outer, holes: holes.map((h) => [...h].reverse()) };
    const maxSeams = o.maxSeams ?? 6;
    // seam sets: one seam per exclusion (the shortest candidates; combinations for several)
    const per = holes.map((h, i) =>
      seamCandidates(
        { outer },
        h,
        holes.filter((_, j) => j !== i),
      ).slice(0, holes.length > 1 ? 3 : maxSeams),
    );
    if (holes.length && per.some((c) => !c.length)) {
      tries.push({ margin, reason: 'no_seam' });
      continue;
    }
    let sets = [[]];
    for (const c of per) sets = sets.flatMap((acc) => c.map((x) => [...acc, x]));
    for (const seams of sets) {
      // seams must not cross each other
      if (seams.some((a, i) => seams.some((b, j) => j > i && G.segmentsIntersect(a.a, a.b, b.a, b.b)))) continue;
      const P = seamRegion(sh, seams);
      if (!P) {
        tries.push({ seams, reason: 'seam_region' });
        continue;
      }
      const rings = ringsOf(P, s);
      // residual closure (o.residual): the last nominal ring n = R or R − 1 (R nominal rings), then
      // the closure rho apart, rho from MIN_RESIDUAL_CLOSURE_SPACING up to just under s
      const specs = o.residual === 'side' ? [] : [null];
      // side residual closures: on each side X the rest width W mod s as ρ (when MIN ≤ ρ < s); W =
      // every distance between two parallel sides of the region across that axis (an L shape has a
      // rest width per arm)
      if (o.residual) {
        const widths = (axis) => {
          const cs = [...new Set(P.filter((p, i) => Math.abs(p[axis] - P[(i + 1) % P.length][axis]) < 1e-9).map((p) => Math.round(p[axis] * 1e6) / 1e6))];
          const out = new Set();
          for (const a of cs) for (const b of cs) if (b > a + 1e-9) out.add(Math.round(((b - a) - s * Math.floor((b - a) / s + 1e-9)) * 1e4) / 1e4);
          return [...out].filter((rho) => rho >= MIN_RESIDUAL_CLOSURE_SPACING - 1e-9 && rho < s - SPACING_TOL).sort((x, y) => x - y);
        };
        for (const rho of widths('x')) for (const [name, dir] of [['right', { x: 1, y: 0 }], ['left', { x: -1, y: 0 }]]) specs.push({ side: true, name, dir, rho });
        for (const rho of widths('y')) for (const [name, dir] of [['top', { x: 0, y: 1 }], ['bottom', { x: 0, y: -1 }]]) specs.push({ side: true, name, dir, rho });
      }
      if (o.residual && o.residual !== 'side')
        for (const n of [rings.length - 1, rings.length])
          if (n >= 2)
            for (let rho = MIN_RESIDUAL_CLOSURE_SPACING; rho < s - 1e-6; rho += RESIDUAL_SEARCH_STEP)
              for (const single of [false, true]) specs.push({ n, rho: Math.round(rho * 1e4) / 1e4, single });
      for (let i = 0; i < P.length; i++) {
        const a = P[(i - 1 + P.length) % P.length];
        const b = P[(i + 1) % P.length];
        if (cross(sub(P[i], a), sub(b, P[i])) <= 1e-9) continue; // convex corners only
        if (o.edgeOk && !o.edgeOk(a, P[i])) continue; // the ends leave through this edge
        // o.cornerAt / o.supplyAt: keep the ends where they are (at that corner / that point — the
        // supply end sits s/2 from its corner)
        if ((o.cornerAt || o.supplyAt) && !(o.cornerAt && len(sub(P[i], o.cornerAt)) < 1e-3) && !(o.supplyAt && len(sub(sub(P[i], mul(unit(sub(P[i], a)), s / 2)), o.supplyAt)) < 1e-3)) continue;
        for (const spec of specs) {
          const res = seamSpiral(P, s, { r: o.r, start: i, rings: spec ? ringsOf(P, s, spec) : rings, res: spec, cover: real, lazy: true });
          if (!res.ok) {
            tries.push({ start: i, reason: res.reason });
            continue;
          }
          const key = `${margin}|${spec ? (spec.side ? 'side:' + spec.name + ',' + spec.rho : spec.n + ',' + spec.rho + (spec.single ? 's' : 'u')) : '-'}${o.groupByStart ? '|' + i : ''}`;
          // (a residual spec whose variant never reaches the residual offsets = the nominal one)
          for (const c of res.variants) if (!spec || c.residualUsed) all.push({ ...c, seams, seamed: P, margin, marginHoles: margin ? holes : null, group: key });
        }
      }
    }
  }
  if (!all.length) return { ok: false, reason: 'no_valid_spiral', tries };
  const maxHole = o.maxHole ?? 0.5;
  // coverage of the best candidates only: with one spacing the covered floor grows with the pipe
  // length, so the longest heating pipes of each margin variant are measured
  all.sort((a, b) => b.estimate - a.estimate);
  const ranked = [];
  for (const mv of new Set(all.map((x) => x.group))) {
    let n = 0;
    for (const c of all.filter((y) => y.group === mv)) {
      if (n >= (o.measure ?? 4)) break;
      const sp = c.get();
      if (!sp.ok) {
        tries.push({ start: c.start, used: c.used, centre: c.centre, ...sp });
        continue;
      }
      if (o.exitOk && !o.exitOk(sp)) continue;
      n++;
      const dist = o.toward ? Math.hypot(sp.supply.x - o.toward.x, sp.supply.y - o.toward.y) : 0;
      ranked.push(measure({ ...sp, seams: c.seams, seamed: c.seamed, margin: c.margin, marginHoles: c.marginHoles, area, dist }, s, real));
    }
  }
  if (!ranked.length) return { ok: false, reason: 'no_valid_spiral', tries };
  if (o.returnAll) return { ok: true, ranked, tries };
  const okHole = ranked.filter((x) => x.largestHole <= maxHole);
  const pool = okHole.length ? okHole : ranked;
  // least uncovered first (variants within 0.1 m²: the smaller patch, then nearest to the manifold)
  const minU = Math.min(...pool.map((x) => x.uncovered));
  const near = pool.filter((x) => x.uncovered <= minU + 0.1);
  const minH = Math.min(...near.map((x) => x.largestHole));
  return near
    .filter((x) => x.largestHole <= minH + 0.05)
    .reduce((a, b) => (b.dist < a.dist - 1e-6 || (Math.abs(b.dist - a.dist) <= 1e-6 && b.uncovered < a.uncovered) ? b : a));
}

/** A rectangle grown by m = [bottom, right, top, left] (negative: shrunk). */
function grow(R, m) {
  const b = G.bbox(R);
  return [
    { x: b.x0 - m[3], y: b.y0 - m[0] },
    { x: b.x1 + m[1], y: b.y0 - m[0] },
    { x: b.x1 + m[1], y: b.y1 + m[2] },
    { x: b.x0 - m[3], y: b.y1 + m[2] },
  ];
}

/**
 * Pipe-free margin beside a rectangular exclusion: the strip between an exclusion side and the
 * outline facing it holds rings from both of its sides; its width W is filled exactly when
 * W = 2·s·m. The rest (W mod 2s) would stay as an empty core strip along the middle of the whole
 * ring path — moved next to the exclusion instead (a much shorter strip). The exclusion itself and
 * its clearance are unchanged; the margin is uncovered floor and is counted as uncovered.
 * Returns the margins [bottom, right, top, left] (null when nothing is gained / not a rectangle).
 */
export function alignMargins(outer, hole, others, s) {
  if (hole.length !== 4) return null;
  const bb = G.bbox(hole);
  if (hole.some((p) => Math.abs(p.x - bb.x0) > 1e-6 && Math.abs(p.x - bb.x1) > 1e-6)) return null;
  const mid = (a, b) => mul(add(a, b), 0.5);
  const ray = (p, u) => {
    let best = Infinity;
    for (const R of [outer, ...others])
      for (let i = 0; i < R.length; i++) {
        const a = R[i];
        const e = sub(R[(i + 1) % R.length], a);
        const dd = cross(u, e);
        if (Math.abs(dd) < EPS) continue;
        const tt = cross(sub(a, p), e) / dd;
        const w = cross(sub(a, p), u) / dd;
        if (tt > 1e-6 && w >= -1e-9 && w <= 1 + 1e-9) best = Math.min(best, tt);
      }
    return best;
  };
  const sides = [
    { p: mid({ x: bb.x0, y: bb.y0 }, { x: bb.x1, y: bb.y0 }), u: { x: 0, y: -1 } },
    { p: mid({ x: bb.x1, y: bb.y0 }, { x: bb.x1, y: bb.y1 }), u: { x: 1, y: 0 } },
    { p: mid({ x: bb.x0, y: bb.y1 }, { x: bb.x1, y: bb.y1 }), u: { x: 0, y: 1 } },
    { p: mid({ x: bb.x0, y: bb.y0 }, { x: bb.x0, y: bb.y1 }), u: { x: -1, y: 0 } },
  ];
  const m = sides.map(({ p, u }) => {
    const W = ray(p, u);
    if (!isFinite(W)) return 0;
    const r = W - 2 * s * Math.floor((W + 1e-6) / (2 * s));
    return r < 0.005 || W - r < 2 * s - 1e-6 ? 0 : r;
  });
  return m.every((x) => x === 0) ? null : m;
}
