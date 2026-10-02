// UFH Coverage Router — step 1: spiral offset generator (bifilar "snail" spiral of one region).
//
// The pipe is built explicitly, never derived from a buffer outline:
//   rings      ring k = the region's boundary offset inwards by s/2 + k·s (exact line offsets of a
//              convex polygon — every ring keeps the region's shape, corners stay corners)
//   two arms   supply arm on the even rings (0, 2, 4 …) going inwards, return arm on the odd rings
//              (1, 3, 5 …) coming back out; the arms are interleaved, so every pipe is exactly s from
//              its neighbours. A lap ends on its last side where the first side of the ring two
//              further in begins (a 90° step, the rectangular spiral), so the arms never cross.
//   centre     the innermost supply and return laps are joined by a 180° turn of radius s/2
//   ends       both arms leave at the start corner side by side (s apart), straight out along the
//              line of their first side — the place where the leads to the manifold attach
//   bends      every corner is a true circular arc of radius r ≥ the pipe's minimum bend radius;
//              a corner without room for that arc makes the variant INVALID (never a smaller
//              radius); the generator then tries a spiral with one lap fewer
//
// Input: a convex region (CCW ring), spacing s, bend radius r, start vertex. Non-convex regions are
// cut into convex spiral regions first (next step: decompose). Pure and deterministic.

import * as G from './geom.js';

const EPS = 1e-9;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const len = (a) => Math.hypot(a.x, a.y);
const unit = (a) => mul(a, 1 / (len(a) || 1));

/** Intersection of the lines p + t·u and q + w·v (null when parallel). */
function lineX(p, u, q, v) {
  const d = cross(u, v);
  if (Math.abs(d) < EPS) return null;
  const t = cross(sub(q, p), v) / d;
  return add(p, mul(u, t));
}

/** Smallest distance between stretches of a path more than ~π·s apart along it (neighbouring runs). */
function minPipeGap(path, s) {
  const gap = Math.PI * s * 0.5 + 2 * s;
  let acc = 0;
  const segs = [];
  for (let i = 1; i < path.length; i++) {
    const l = len(sub(path[i], path[i - 1]));
    const a = path[i - 1];
    const b = path[i];
    segs.push({ a, b, s0: acc, s1: acc + l, x0: Math.min(a.x, b.x) - s, x1: Math.max(a.x, b.x) + s, y0: Math.min(a.y, b.y) - s, y1: Math.max(a.y, b.y) + s });
    acc += l;
  }
  // sample points every 5 cm (walking the segments); only segments within s can be closer than s
  let best = Infinity;
  const samples = [];
  for (const sg of segs) {
    const l = sg.s1 - sg.s0;
    for (let q = Math.ceil(sg.s0 / 0.05) * 0.05; q < sg.s1; q += 0.05) {
      const f = l > 0 ? (q - sg.s0) / l : 0;
      samples.push({ q, p: { x: sg.a.x + (sg.b.x - sg.a.x) * f, y: sg.a.y + (sg.b.y - sg.a.y) * f } });
    }
  }
  for (const { q, p } of samples) {
    for (const sg of segs) {
      if (p.x < sg.x0 || p.x > sg.x1 || p.y < sg.y0 || p.y > sg.y1) continue;
      if (sg.s1 > q - gap && sg.s0 < q + gap) continue;
      const dd = G.segDist(p, sg.a, sg.b);
      if (dd < best) best = dd;
    }
  }
  return best;
}

/** A convex, CCW ring without repeated / collinear points (null when not convex). */
export function convexRing(ring) {
  let P = G.cleanPath([...G.ccw(ring)], 1e-6);
  if (P.length > 1 && len(sub(P[0], P[P.length - 1])) < 1e-6) P = P.slice(0, -1);
  // drop collinear vertices
  P = P.filter((p, i) => Math.abs(cross(sub(p, P[(i - 1 + P.length) % P.length]), sub(P[(i + 1) % P.length], p))) > 1e-9);
  if (P.length < 3) return null;
  for (let i = 0; i < P.length; i++) if (cross(sub(P[(i + 1) % P.length], P[i]), sub(P[(i + 2) % P.length], P[(i + 1) % P.length])) < -1e-9) return null;
  return P;
}

/**
 * Edge lines of the region offset inwards by d: line i = { p, u } (edge i from vertex i to i+1).
 * The ring's vertex i is where lines i−1 and i meet; null when an edge has vanished (the region is
 * too small for that offset).
 */
function ringAt(P, d) {
  const n = P.length;
  const lines = P.map((p, i) => {
    const u = unit(sub(P[(i + 1) % n], p));
    const nIn = { x: -u.y, y: u.x }; // CCW: inside is on the left
    return { p: add(p, mul(nIn, d)), u, n: nIn };
  });
  const V = lines.map((l, i) => lineX(lines[(i - 1 + n) % n].p, lines[(i - 1 + n) % n].u, l.p, l.u));
  if (V.some((v) => !v)) return null;
  // every edge keeps its direction and a positive length
  for (let i = 0; i < n; i++) if (dot(sub(V[(i + 1) % n], V[i]), lines[i].u) < 1e-6) return null;
  return { lines, V };
}

/**
 * Bifilar spiral in a convex region.
 * @param region  ring (any orientation) — the usable heating area of the region (clearances off)
 * @param s       pipe spacing (centre to centre)
 * @param o.r     bend radius of the pipe arcs (≥ minimum bend radius)
 * @param o.start index of the start vertex (the corner where both ends leave)
 * @returns { ok, reason?, path, supply, ret, leadIn, leadOut, heating, laps, rings, r, s, start }
 *   path      the whole pipe, supply end first (lead stub in → spiral → lead stub out)
 *   supply/ret the two ends on the region boundary, heating = path without the lead stubs
 */
export function spiralRegion(region, s, o = {}) {
  const P = convexRing(region);
  if (!P) return { ok: false, reason: 'not_convex' };
  const n = P.length;
  const r = o.r ?? Math.max(0.072, s / 2);
  const v = (((o.start ?? 0) % n) + n) % n;
  const d = (k) => s / 2 + k * s;
  // rings that exist
  const rings = [];
  for (let k = 0; k < 400; k++) {
    const R = ringAt(P, d(k));
    if (!R) break;
    rings.push(R);
  }
  if (rings.length < 2) return { ok: false, reason: 'too_small', rings: rings.length };
  const idx = (i) => (((v + i) % n) + n) % n;
  const first = (k) => rings[k].lines[idx(0)]; // the first side of ring k (leaves the start corner)
  const last = (k) => rings[k].lines[idx(n - 1)]; // the last side of ring k (comes into the start corner)
  const firstAt = (dist) => {
    const l0 = rings[0].lines[idx(0)];
    return { p: add(l0.p, mul(l0.n, dist - d(0))), u: l0.u };
  };
  const lastSide = last(0);
  // one arm: laps on rings p, p+2, … , p+2m; each lap ends where the first side two rings in begins
  const arm = (p, m, end) => {
    const pts = [rings[p].V[idx(0)]];
    for (let j = 0; j <= m; j++) {
      const k = p + 2 * j;
      for (let i = 1; i < n; i++) pts.push(rings[k].V[idx(i)]);
      if (j < m) {
        const L = last(k);
        const F = first(k + 2);
        pts.push(lineX(L.p, L.u, F.p, F.u));
      } else pts.push(end);
    }
    return pts;
  };
  // lead stubs: back along the first side's line to the region boundary (the last edge of the region)
  const stub = (k) => {
    const F = first(k);
    const e0 = P[idx(n - 1)];
    const e1 = P[idx(0)];
    return lineX(F.p, F.u, e0, sub(e1, e0));
  };
  const tries = [];
  const valid = [];
  // 180° turn of radius s/2 from X (heading u) round to X + w·s (w ⟂ u)
  const uturn = (X, u, w) => {
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
  };
  const build = (m, centre) => {
    let armA;
    let armB;
    let turn;
    if (centre === 'side') {
      // the innermost laps (rings 2m, 2m+1) stop on their last side 1.5 s past the first side of
      // ring 2m+1 (the turn keeps s from it) and are joined there
      const A = last(2 * m);
      const ET = firstAt(d(2 * m + 1) + 1.5 * s);
      const EA = lineX(A.p, A.u, ET.p, ET.u);
      if (!EA) return { reason: 'centre' };
      const EB = add(EA, mul(lastSide.n, s));
      const onLast = (k, E) => {
        const a = rings[k].V[idx(n - 1)];
        const b = rings[k].V[idx(0)];
        const t = dot(sub(E, a), unit(sub(b, a)));
        return t > r - 1e-6 && t < len(sub(b, a)) + 1e-6;
      };
      if (!onLast(2 * m, EA) || !onLast(2 * m + 1, EB)) return { reason: 'centre' };
      armA = [stub(0), ...arm(0, m, EA)];
      armB = [stub(1), ...arm(1, m, EB)];
      turn = uturn(EA, lastSide.u, lastSide.n);
    } else {
      // hairpin through the core: after their last laps both arms step in once more (onto the first
      // side lines of rings 2m+2, 2m+3) and run along them; joined by the 180° turn 1.5 s short of
      // the second side of ring 2m+1
      if (rings.length < 2 * m + 3) return { reason: 'centre' };
      const F0 = first(0);
      const LA = firstAt(d(2 * m + 2));
      const S1 = rings[0].lines[idx(1)];
      const stop = { p: add(S1.p, mul(S1.n, d(2 * m + 1) + 1.5 * s - d(0))), u: S1.u };
      const XA = lineX(LA.p, LA.u, stop.p, stop.u);
      if (!XA) return { reason: 'centre' };
      const XB = add(XA, mul(F0.n, s));
      const TA = (() => {
        const L = last(2 * m);
        return lineX(L.p, L.u, LA.p, LA.u);
      })();
      const LB = firstAt(d(2 * m + 3));
      const TB = (() => {
        const L = last(2 * m + 1);
        return lineX(L.p, L.u, LB.p, LB.u);
      })();
      if (!TA || !TB || dot(sub(XA, TA), F0.u) < 2 * r + 1e-6 || dot(sub(XB, TB), F0.u) < 2 * r + 1e-6) return { reason: 'centre' };
      armA = [stub(0), ...arm(0, m, TA), XA];
      armB = [stub(1), ...arm(1, m, TB), XB];
      turn = uturn(XA, F0.u, F0.n);
    }
    const fa = G.fillet(armA, r);
    const fb = G.fillet(armB, r);
    const tight = [...fa.radii, ...fb.radii].find((q) => q.r < r - 1e-9);
    if (tight) return { reason: 'bend', at: tight.at };
    const path = G.cleanPath([...fa.pts, ...turn, ...[...fb.pts].reverse()], 1e-6);
    // every pipe run keeps s from its neighbours (checked on the built geometry, not assumed)
    const sp = minPipeGap(path, s);
    if (sp < s - 0.002) return { reason: 'spacing', gap: sp };
    const leadIn = G.pathLength([armA[0], armA[1]]);
    const leadOut = G.pathLength([armB[0], armB[1]]);
    const total = G.pathLength(path);
    return { path, leadIn, leadOut, total, armA, armB };
  };
  for (let m = Math.floor((rings.length - 2) / 2); m >= 0; m--) {
    for (const centre of ['hairpin', 'side']) {
      const b = build(m, centre);
      if (!b.path) {
        tries.push({ m, centre, ...b });
        continue;
      }
      const heating = G.subPath(b.path, b.leadIn, b.total - b.leadOut);
      // the uncovered core (the spiral's own band, s/2 each side) decides between the variants
      const band = G.bufferPolylines([G.simplifyPath(heating, 0.002)], s / 2 + 0.003, 'round', 'round', 0.001);
      const uncovered = G.area(G.difference([{ outer: P, holes: [] }], band));
      valid.push({
        ok: true,
        // geometry only — not a heating loop: the loop length planner turns raw spirals into loops
        kind: 'RAW_SPIRAL',
        path: b.path,
        heating,
        supply: b.armA[0],
        ret: b.armB[0],
        leadIn: b.leadIn,
        leadOut: b.leadOut,
        heatingLength: b.total - b.leadIn - b.leadOut,
        laps: m + 1,
        centre,
        rings: rings.length,
        usedRings: 2 * m + 2,
        uncovered,
        r,
        s,
        start: v,
        region: P,
        tries,
      });
    }
    // fewer laps only leave more uncovered: stop at the first lap count that works
    if (valid.length) break;
  }
  if (valid.length) return valid.reduce((a, b) => (b.uncovered < a.uncovered - 1e-6 ? b : a));
  return { ok: false, reason: 'no_valid_spiral', tries, rings: rings.length };
}

/**
 * Of all start corners (whose ends may leave there — o.exitOk): the spirals leaving at most `maxHole`
 * uncovered first, of those the one whose ends are nearest to `toward` (the manifold side); else the
 * one leaving the least uncovered.
 */
export function bestSpiral(region, s, o = {}) {
  const P = convexRing(region);
  if (!P) return { ok: false, reason: 'not_convex' };
  const maxHole = o.maxHole ?? 0.5;
  const all = [];
  for (let i = 0; i < P.length; i++) {
    const sp = spiralRegion(P, s, { ...o, start: i });
    // (o.exitOk: where the two ends may leave the region, e.g. only through a wall, never into a
    // neighbouring region)
    if (sp.ok && (!o.exitOk || o.exitOk(sp))) all.push({ ...sp, dist: o.toward ? Math.hypot(sp.supply.x - o.toward.x, sp.supply.y - o.toward.y) : 0 });
  }
  if (!all.length) return { ok: false, reason: 'no_valid_spiral' };
  const good = all.filter((sp) => sp.uncovered <= maxHole);
  if (good.length) return good.reduce((a, b) => (b.dist < a.dist - 1e-6 || (Math.abs(b.dist - a.dist) <= 1e-6 && b.uncovered < a.uncovered) ? b : a));
  return all.reduce((a, b) => (b.uncovered < a.uncovered ? b : a));
}
