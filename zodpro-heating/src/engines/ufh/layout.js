// Zone layout: usable area → entry edge → strips (one per loop) → leads from the manifold →
// per-strip centreline trees → real bifilar loops. Works in a local frame (u along the entry edge,
// v into the zone); results are mapped back to the plan.
//
// Strip / lead scheme (no crossings by construction):
//   • strips are cut perpendicular to the entry edge, separated by exactly s (pipe spacing);
//   • the manifold sits at u = ua; strips left of it form the left group L1 (nearest) … Lq,
//     strips right of it R1 … Rp;
//   • lead of Lj fans from its outlet to the corner (dj, tj), tj = s/2 + 2s·(q − j), then runs
//     along the edge at that track to its strip — the nested staircase of the reference drawings;
//   • every strip region excludes all leads by 1.5·s (other pipes stay exactly s from lead pipes),
//     so the ring of the strip continues the lead at its own track — one smooth pipe.

import * as G from './geom.js';
import { spiralTree, serpentineTree, removeHoles, cornerRadius } from './spiral.js';
import { buildLoop } from './loop.js';

const EPS = 1e-4;

export const toLocal = (F, p) => ({ x: (p.x - F.o.x) * F.u.x + (p.y - F.o.y) * F.u.y, y: (p.x - F.o.x) * F.v.x + (p.y - F.o.y) * F.v.y });
export const toPlan = (F, q) => ({ x: F.o.x + q.x * F.u.x + q.y * F.v.x, y: F.o.y + q.x * F.u.y + q.y * F.v.y });
const mapRegion = (region, f) => region.map((sh) => ({ outer: sh.outer.map(f), holes: (sh.holes ?? []).map((h) => h.map(f)) }));
const mapLine = (pts, f) => pts.map(f);

/**
 * Heating area where pipe axes may run:
 *   U = offset(zone, −wall clearance) − ⋃ offset(obstacle, +clearance) − keep-out − buffer(existing pipes, s)
 */
export function usableArea({ zone, obstacles = [], wallClearance = 0.1, obstacleClearance = 0.1, avoid = [], keepOut = [], s = 0.15, clip = null }) {
  const Z = G.sanitize(zone);
  // round joins: clearance is a distance, so around re-entrant wall corners and obstacle corners
  // the boundary is an arc and the filleted pipe never cuts into the clearance
  let U = G.offset(Z, -wallClearance, 'round');
  const obs = obstacles.map((o) => G.offset(G.sanitize(o.polygon), o.clearance ?? obstacleClearance, 'round')).flat();
  const ko = keepOut.map((k) => G.sanitize(k)).flat();
  const blocks = [...obs, ...ko];
  if (avoid.length) blocks.push(...G.bufferPolylines(avoid, s));
  if (blocks.length) U = G.difference(U, G.union(blocks));
  // one side of a manifold standing inside the zone (no clearance at the cut: the pipes of the two
  // halves are s/2 from it on each side → exactly s apart)
  if (clip) U = G.intersection(U, [{ outer: G.ccw(clip), holes: [] }]);
  return { Z, U, obstacles: obs, keepOut: ko };
}

/** Intervals of the vertical line x = u through a local region. */
function sectionAt(region, u) {
  const ys = [];
  for (const sh of region)
    for (const r of [sh.outer, ...(sh.holes ?? [])])
      for (let i = 0; i < r.length; i++) {
        const a = r[i];
        const b = r[(i + 1) % r.length];
        if (a.x > u !== b.x > u) ys.push(a.y + ((u - a.x) * (b.y - a.y)) / (b.x - a.x));
      }
  ys.sort((a, b) => a - b);
  const iv = [];
  for (let i = 0; i + 1 < ys.length; i += 2) iv.push([ys[i], ys[i + 1]]);
  return iv;
}

/** Candidate entry edges of U, best first (monotone from the edge, near the manifold, long). */
export function entryFrames(U, anchor, s) {
  if (!U.length) return [];
  const main = U.reduce((a, b) => (G.area([b]) > G.area([a]) ? b : a));
  const ring = main.outer;
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 3 * s) continue;
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const F = { o: a, u, v: { x: -u.y, y: u.x }, len };
    const L = G.union(mapRegion(U, (p) => toLocal(F, p)));
    const bb = G.regionBBox(L);
    let good = 0;
    let all = 0;
    for (let x = bb.x0 + 0.025; x < bb.x1; x += 0.05) {
      const iv = sectionAt(L, x);
      const w = iv.reduce((t, [p, q]) => t + q - p, 0);
      all += w;
      if (iv.length === 1 && iv[0][0] < 2 * s) good += w;
    }
    const mono = all > 0 ? good / all : 0;
    const d = G.segDist(anchor, a, b);
    const al = toLocal(F, anchor);
    out.push({ F, mono, d, score: d + 25 * (1 - mono) - 0.05 * len + (al.y > 0.8 ? al.y : 0) });
  }
  out.sort((p, q) => p.score - q.score);
  return out;
}

/** Cumulative area profile of a local region along u (1 cm sampling). */
function areaProfile(L) {
  const bb = G.regionBBox(L);
  const du = 0.01;
  const xs = [];
  const cum = [0];
  for (let x = bb.x0; x < bb.x1; x += du) {
    const iv = sectionAt(L, x + du / 2);
    xs.push(x);
    cum.push(cum[cum.length - 1] + iv.reduce((t, [p, q]) => t + q - p, 0) * du);
  }
  xs.push(bb.x1);
  const at = (u) => {
    if (u <= xs[0]) return 0;
    if (u >= xs[xs.length - 1]) return cum[cum.length - 1];
    const k = Math.min(xs.length - 2, Math.floor((u - xs[0]) / du));
    const t = (u - xs[k]) / du;
    return cum[k] + t * (cum[k + 1] - cum[k]);
  };
  const inv = (A) => {
    if (A <= 0) return xs[0];
    if (A >= cum[cum.length - 1]) return xs[xs.length - 1];
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] < A) lo = m;
      else hi = m;
    }
    const t = (A - cum[lo]) / (cum[hi] - cum[lo] || 1);
    return xs[lo] + t * du;
  };
  return { at, inv, total: cum[cum.length - 1], x0: bb.x0, x1: bb.x1 };
}

/** Nearest strip width that fills with rings exactly: an odd multiple of s (3s, 5s, 7s …). */
const snapW = (w, s) => s * Math.max(3, 2 * Math.round((w / s - 1) / 2) + 1);

const slab = (a, b) => [{ x: a, y: -1000 }, { x: b, y: -1000 }, { x: b, y: 1000 }, { x: a, y: 1000 }];

/** Trim the last d metres of a polyline. */
function trimEnd(pts, d) {
  const L = G.pathLength(pts);
  return L - d > 1e-3 ? G.subPath(pts, 0, L - d) : null;
}

/**
 * Lead centreline: fan from the outlet to the staircase corner (d, track), then along the track to
 * the strip (xe). A lead that ends at its own corner (no track) arrives straight down for the last
 * 2.2·s so the ring that continues it keeps exactly 2s from its own lead.
 */
function leadPath(root, d, track, xe, s) {
  // a fan corner just short of the strip side would leave a stub too short to bend round (S-bend):
  // the lead then goes straight up the strip side instead
  if (Math.abs(xe - d) < 2 * s + 1e-6) d = xe;
  if (Math.abs(xe - d) > 1e-6) return G.cleanPath([root, { x: d, y: track }, { x: xe, y: track }]);
  const knee = Math.max(root.y, track - 2.2 * s);
  if (Math.abs(root.x - xe) < 1e-3) return G.cleanPath([root, { x: xe, y: track }]);
  return G.cleanPath([root, { x: xe, y: knee }, { x: xe, y: track }]);
}

/**
 * Build strips, leads and centreline trees for given strip shares (local frame).
 *   shares: { left: [w(L1)…w(Lq)], right: [w(R1)…w(Rp)] } — area fractions within each group
 */
function buildStrips(ctx, shares) {
  const { L, prof, ua, s, roots, strategy, rmin } = ctx;
  const q = shares.left.length;
  const p = shares.right.length;
  const both = q > 0 && p > 0;
  // snapped: the ends of the two groups at the manifold move independently (the corridor between
  // them may widen from s up to 1.3 s, like the gaps between strips) so that both end strips, which
  // take the remainders, are odd multiples of s as well
  let dlL = 0;
  let dlR = 0;
  if (both && ctx.snap && !ctx.noShift) {
    const devOdd0 = (w) => w / s - (2 * Math.round((w / s - 1) / 2) + 1);
    const Wl = ua - s / 2 - prof.x0;
    const Wr = prof.x1 - ua - s / 2;
    const dL = devOdd0(Wl);
    const dR = devOdd0(Wr);
    let bestC = null;
    for (const kl of [0, 2, -2])
      for (const kr of [0, 2, -2]) {
        const l = (-dL + kl) * s; // left group end moves by l (its width Wl + l is odd)
        const r = (dR - kr) * s; // right group start moves by r (its width Wr − r is odd)
        const corridor = s + r - l;
        if (corridor < s - 1e-9 || corridor > 1.3 * s + 1e-9) continue;
        const c = Math.abs(l) + Math.abs(r);
        if (!bestC || c < bestC.c) bestC = { c, l, r };
      }
    if (bestC) (dlL = bestC.l), (dlR = bestC.r);
  }
  const gL = both ? ua - s / 2 + dlL : prof.x1;
  const gR = both ? ua + s / 2 + dlR : prof.x0;
  // g: gap between neighbouring strips (s; a little more to absorb the remainder, see below)
  const leftGroup = (g, adj = []) => {
    const out = [];
    const Aend = prof.at(gL);
    const Astart = prof.at(prof.x0);
    const tot = Aend - Astart;
    let acc = 0;
    let hi = gL;
    for (let j = 1; j <= q; j++) {
      acc += shares.left[j - 1];
      let cut = j === q ? prof.x0 - 1 : prof.inv(Aend - tot * acc);
      if (ctx.snap && j < q) cut = hi - (ctx.widths?.L?.[j - 1] ?? Math.max(3 * s, snapW(hi - Math.max(cut, prof.x0) - g / 2, s) - 2 * s * (adj[j] ?? 0))) - g / 2;
      out.push({ group: 'L', j, lo: j === q ? prof.x0 - 1 : cut + g / 2, hi });
      hi = cut - g / 2;
    }
    return out;
  };
  const rightGroup = (g, adj = []) => {
    const out = [];
    const Astart = prof.at(gR);
    const tot = prof.total - Astart;
    let acc = 0;
    let lo = gR;
    for (let j = 1; j <= p; j++) {
      acc += shares.right[j - 1];
      let cut = j === p ? prof.x1 + 1 : prof.inv(Astart + tot * acc);
      if (ctx.snap && j < p) cut = Math.max(lo, prof.x0) + (ctx.widths?.R?.[j - 1] ?? Math.max(3 * s, snapW(Math.min(cut, prof.x1) - g / 2 - Math.max(lo, prof.x0), s) - 2 * s * (adj[j] ?? 0))) + g / 2;
      out.push({ group: 'R', j, lo, hi: j === p ? prof.x1 + 1 : cut - g / 2 });
      lo = cut + g / 2;
    }
    return out;
  };
  // snapped: the end strip of a group takes the remainder; when that is not an odd multiple of s
  // (a band the rings cannot fill), the excess is spread over the gaps of the group instead
  // (each ≤ 0.3 s wider — spacing stays uniform to ±3 cm; one centre band is never left empty)
  const devOdd = (w) => w / s - (2 * Math.round((w / s - 1) / 2) + 1);
  const remW = (grp) => {
    const last = grp[grp.length - 1];
    return last.group === 'L' ? Math.min(last.hi, prof.x1) - prof.x0 : prof.x1 - Math.max(last.lo, prof.x0);
  };
  const fitGroup = (make, n) => {
    let grp = make(s);
    if (!ctx.snap || n < 2) return grp;
    // an end strip narrower than one ring: its neighbours give up 2 s each until it is one
    const adj = [];
    const wOf = (t) => Math.min(t.hi, prof.x1) - Math.max(t.lo, prof.x0);
    for (let it = 0; it < n && !ctx.widths && remW(grp) < 3 * s - 1e-6; it++) {
      // (the cuts follow the area shares, so only the strip next to the end one really gives way)
      const cand = grp.filter((t) => t.j < n && wOf(t) >= 5 * s - 1e-6).sort((a, b) => b.j - a.j)[0];
      if (!cand) break;
      adj[cand.j] = (adj[cand.j] ?? 0) + 1;
      grp = make(s, adj);
    }
    for (let it = 0; it < 3; it++) {
      const w = remW(grp);
      const d = devOdd(w);
      if (Math.abs(d) < 0.05 || w < 3 * s) break;
      const extra = (d > 0 ? d : 2 + d) * s;
      const gg = s + extra / (n - 1);
      if (gg > 1.3 * s) break;
      const next = make(gg, adj);
      if (Math.abs(devOdd(remW(next))) < Math.abs(d)) grp = next;
      else break;
    }
    return grp;
  };
  // last resort: an end strip a little wider than odd stops short of the zone end (≤ 0.65 s more
  // wall clearance there) instead of leaving an empty band in its middle
  const trimGroupEnd = (grp) => {
    if (!ctx.snap || !grp.length) return grp;
    const last = grp[grp.length - 1];
    const w = remW(grp);
    const d = devOdd(w);
    if (d >= 0.03 && d <= 0.65 && w - d * s >= 3 * s) {
      if (last.group === 'L') last.lo = prof.x0 + d * s;
      else last.hi = prof.x1 - d * s;
    }
    return grp;
  };
  // whole row at once: inner strips keep their odd widths, the two end strips take the nearest odd
  // widths and what is left is spread evenly over all gaps (≤ 1.3 s, the corridor at the manifold
  // included and kept where the leads come in)
  const evenGaps = (all) => {
    const ord = [...all].sort((a, b) => a.lo - b.lo);
    const n = ord.length;
    if (n < 2) return;
    const W = (t) => Math.min(t.hi, prof.x1) - Math.max(t.lo, prof.x0);
    const inner = ord.slice(1, -1).map(W);
    if (inner.some((w) => Math.abs(devOdd(w)) > 0.05)) return;
    const ends = [W(ord[0]), W(ord[n - 1])];
    if (ends.every((w) => Math.abs(devOdd(w)) < 0.05)) return;
    const odds = (w) => [...new Set([2 * Math.floor((w / s - 1) / 2) + 1, 2 * Math.floor((w / s - 1) / 2) + 3].map((k) => Math.max(3, k) * s))];
    const T = prof.x1 - prof.x0;
    const sumIn = inner.reduce((a, b) => a + b, 0);
    const iC = both ? ord.findIndex((t, k) => k + 1 < n && t.group === 'L' && ord[k + 1].group === 'R') : -1;
    let best = null;
    // an end strip next to the manifold (the first of its group) keeps its width and its end: its
    // fan corner stays as it is
    const fix0 = ord[0].j === 1;
    const fix1 = ord[n - 1].j === 1;
    const free = (fix0 ? 0 : 1) + (fix1 ? 0 : 1);
    for (const a of fix0 ? [ends[0]] : odds(ends[0]))
      for (const b of fix1 ? [ends[1]] : odds(ends[1])) {
        // what is left goes first into a little more clearance at the free zone ends (≤ 0.65 s
        // each), the rest into the gaps
        const rest = T - a - b - sumIn;
        const trim = Math.max(0, Math.min(free * 0.65 * s, rest - (n - 1) * s));
        const g = (rest - trim) / (n - 1);
        if (g < s - 1e-9 || g > 1.3 * s + 1e-9) continue;
        const ws = [a, ...inner, b];
        const t0 = free ? (fix0 ? 0 : fix1 ? trim : trim / 2) : 0;
        if (iC >= 0) {
          const cEnd = prof.x0 + t0 + ws.slice(0, iC + 1).reduce((x, y) => x + y, 0) + iC * g;
          if (Math.abs(cEnd + g / 2 - ua) > 1.25 * s) continue;
        }
        const cost = 2 * (g - s) + trim + 0.01 * (Math.abs(a - ends[0]) + Math.abs(b - ends[1]));
        if (!best || cost < best.cost) best = { cost, g, ws, t0, t1: trim - t0 };
      }
    if (!best) return;
    let x = prof.x0 + best.t0;
    ord.forEach((t, k) => {
      t.lo = k === 0 ? (best.t0 > 1e-6 ? x : prof.x0 - 1) : x;
      t.hi = k === n - 1 ? (best.t1 > 1e-6 ? prof.x1 - best.t1 : prof.x1 + 1) : x + best.ws[k];
      x += best.ws[k] + best.g;
    });
  };
  const strips = [...(q ? trimGroupEnd(fitGroup(leftGroup, q)) : []), ...(p ? trimGroupEnd(fitGroup(rightGroup, p)) : [])];
  if (ctx.snap && ctx.evenGaps) evenGaps(strips);
  if (!both) {
    // single group: the strip nearest to the manifold extends over the manifold position
    if (q) strips.find((t) => t.j === 1).hi = prof.x1 + 1;
    else strips.find((t) => t.j === 1).lo = prof.x0 - 1;
  }
  // order along u (ports are assigned in the same order → leads never cross)
  strips.sort((a, b) => a.lo - b.lo);
  strips.forEach((t, k) => (t.root = roots[k]));
  const b0 = both ? s : 0;
  // one group only: the staircase starts at the zone end (the strip beside the manifold is the
  // first one); its lead runs down the end of the zone and the corner above it is left to the fan
  const single = !both && !ctx.nearEnd; // one group, manifold away from the end: first lead straight in at ua
  const uL = both || single ? ua : prof.x1 - s / 2;
  const uR = both || single ? ua : prof.x0 + s / 2;
  // manifold on the zone end, away from the entry edge (a short end wall of a long zone): the
  // fan corners lie on the bisector of the zone corner — the outermost lead runs along the end
  // wall into the corner and up the entry wall, the others nest inside it (no unheated wedge)
  // (only the leads heading for the entry wall; tracks beyond the manifold keep the staircase)
  const rootV = roots.reduce((a, r) => a + r.y, 0) / roots.length;
  const side = !both && ctx.nearEnd && rootV > 3 * s;
  for (const t of strips) {
    const n = t.group === 'L' ? q : p;
    t.track = s / 2 + 2 * s * (n - t.j);
    if (t.group === 'L') {
      t.xe = Math.min(t.hi, prof.x1) - s / 2;
      // fan corner: its own staircase position, or the strip's ring side if the strip is nearer
      t.d = side && t.track < rootV ? Math.max(prof.x1 - t.track, t.xe) : Math.max(uL - b0 - 2 * s * (t.j - 1), t.xe);
    } else {
      t.xe = Math.max(t.lo, prof.x0) + s / 2;
      t.d = side && t.track < rootV ? Math.min(prof.x0 + t.track, t.xe) : Math.min(uR + b0 + 2 * s * (t.j - 1), t.xe);
    }
    t.target = { x: t.xe, y: t.track };
  }
  if (side) {
    // rays from the manifold row to the fan corners must not cross: the ports are taken in the
    // order of the ray directions
    const c = { x: roots.reduce((a, r) => a + r.x, 0) / roots.length, y: roots.reduce((a, r) => a + r.y, 0) / roots.length };
    const ang = (t) => Math.atan2(t.track - c.y, t.d - c.x);
    // roots along the manifold row, in the rotational sense of the rays
    const rs = [...roots].sort((a, b) => b.y - a.y || a.x - b.x);
    // every lead heads for the entry wall: the strip beside the manifold takes the outlet farthest
    // from that wall and goes straight in (its strip is not notched by its own lead)
    const first = strips.find((t) => t.j === 1);
    const straight = first && strips.every((t) => t.track < rootV);
    if (straight) {
      first.root = rs[0];
      first.d = first.xe;
      first.track = first.root.y;
      first.target = { x: first.xe, y: first.track };
    }
    const byAng = strips.filter((t) => !straight || t !== first).sort((a, b) => ang(a) - ang(b));
    (q ? byAng : byAng.reverse()).forEach((t, k) => (t.root = rs[k + (straight ? 1 : 0)]));
  }
  for (const t of strips) {
    t.lead = leadPath(t.root, t.d, t.track, t.xe, s);
    if (single && t.group === 'R' && t.j === 1) {
      t.target = { x: ua, y: s / 2 };
      t.lead = G.cleanPath([t.root, { x: ua, y: t.root.y }, t.target]);
    }
  }
  // regions: strip slab ∩ U − all leads (own lead only up to 2s before its end)
  for (const t of strips) {
    const excl = [];
    for (const o of strips) {
      const line = o === t ? trimEnd(o.lead, 2 * s) : o.lead;
      if (line) excl.push(line);
    }
    let R = G.intersection(L, [{ outer: slab(t.lo, t.hi), holes: [] }]);
    if (excl.length) R = G.difference(R, G.bufferPolylines(excl, 1.5 * s - EPS, 'square', 'miter'));
    if (!both && !single && !side && t.j === 1 && t.lead.length >= 3) {
      // the corner between the zone end and the lead coming down it (fan zone, heated by leads)
      const knee = t.lead[t.lead.length - 2];
      const far = t.group === 'L' ? 1000 : -1000;
      const wedge = [t.lead[0], { x: far, y: t.lead[0].y - 1000 }, { x: far, y: knee.y - s / 2 }, { x: knee.x, y: knee.y - s / 2 }];
      R = G.difference(R, [{ outer: G.ccw(wedge), holes: [] }]);
    }
    R = removeHoles(R, s, { x: 0, y: 1 });
    // a strip that is a room plus a thin leftover of a corridor (where the other leads run): the
    // loop heats the room; its lead goes on through the leftover to it
    let reach = null;
    if (R.length) {
      const A = G.area(R);
      const thick = G.opening(R, 1.4 * s, 'miter');
      const big = thick.reduce((a, b) => (!a || G.area([b]) > G.area([a]) ? b : a), null);
      if (big && G.area([big]) >= 0.5 * A && A - G.area([big]) >= 0.15 * A && G.distToRegionBoundary(t.target, [big]) > 2 * s && !G.pointInRegion(t.target, [big])) {
        R = [big];
        const q0 = G.closestOnRing(t.target, big.outer);
        reach = q0.p ?? q0;
      }
    }
    t.region = R;
    const last = t.lead[t.lead.length - 1];
    const prev = t.lead[t.lead.length - 2];
    const dir = reach ? G.norm({ x: reach.x - last.x, y: reach.y - last.y }) : G.norm({ x: last.x - prev.x, y: last.y - prev.y });
    t.dir = dir;
    let tree = null;
    if (R.length) {
      const serp = strategy === 'serpentine' || strategy === 'adaptive_serpentine';
      if (serp) tree = serpentineTree(R, s, t.target, strategy === 'adaptive_serpentine' ? t.axis ?? 'x' : 'x');
      else tree = spiralTree(R, s, t.target, dir, { rmin, prefer: t.group === 'L' ? -1 : 1, allowBranches: strategy !== 'spiral' });
    }
    t.tree = tree;
    t.centerLen = tree ? G.pathLength([...t.lead, ...tree.path]) + tree.branches.reduce((a, b) => a + G.pathLength(b), 0) : 0;
  }
  return strips;
}

/**
 * First place, going away from the manifold end (dir +1: from x0, −1: from x1), where the section
 * width of the zone changes by more than 1.6× within 0.4 m (e.g. a corridor opening into a room).
 */
function widthJump(prof, s, dir) {
  const w = (u) => (prof.at(u + 0.05) - prof.at(u - 0.05)) / 0.1;
  const start = dir > 0 ? prof.x0 + 4 * s : prof.x1 - 4 * s;
  for (let u = start; dir > 0 ? u < prof.x1 - 4 * s : u > prof.x0 + 4 * s; u += dir * 0.05) {
    const a = w(u - dir * 0.2);
    const b = w(u + dir * 0.2);
    if (a > 0.3 && b > 0.3 && (b / a > 1.6 || a / b > 1.6)) {
      // the exact edge: where the width is halfway
      let lo = u - 0.2;
      let hi = u + 0.2;
      const mid = (a + b) / 2;
      for (let k = 0; k < 20; k++) {
        const m = (lo + hi) / 2;
        const inA = dir > 0 ? (a < b ? w(m) < mid : w(m) > mid) : (a < b ? w(m) < mid : w(m) > mid);
        if ((dir > 0) === inA) lo = m;
        else hi = m;
      }
      return (lo + hi) / 2;
    }
  }
  return null;
}

/**
 * All-odd strip widths (every strip filled by the rings with no empty band): each inner strip takes
 * the odd multiple of s just below or just above its share; loop lengths are estimated from the
 * area profile (pipe ≈ area / s + lead + drop). The combination whose end strips are odd too (or
 * can be made so by spreading ≤ 0.3 s per gap) and whose longest loop is shortest is returned
 * ({L: [w…], R: [w…]} for the strips before each group's end strip), or null.
 */
function oddWidths(ctx, shares, q, p, n) {
  const { prof, ua, s } = ctx;
  const maxLoop = ctx.maxLoop ?? 60;
  const drop = ctx.drop ?? 0.8;
  const both = q > 0 && p > 0;
  const nIn = Math.max(0, q - 1) + Math.max(0, p - 1);
  if (nIn === 0 || nIn > 11) return null;
  const devOdd = (w) => w / s - (2 * Math.round((w / s - 1) / 2) + 1);
  const oddDown = (w) => s * Math.max(3, 2 * Math.floor((w / s - 1) / 2) + 1);
  // raw (share) widths of a group, from the manifold outwards
  const raw = (sh, from, to) => {
    const dir = to > from ? 1 : -1;
    const A0 = prof.at(Math.min(from, to));
    const A1 = prof.at(Math.max(from, to));
    const tot = A1 - A0;
    const out = [];
    let acc = 0;
    let at = from;
    for (let j = 0; j < sh.length - 1; j++) {
      acc += sh[j];
      const cut = dir < 0 ? prof.inv(A1 - tot * acc) : prof.inv(A0 + tot * acc);
      out.push(Math.max(3 * s, Math.abs(cut - at) - s));
      at = cut + dir * (s / 2);
    }
    return out;
  };
  const gL = both ? ua - s / 2 : prof.x1;
  const gR = both ? ua + s / 2 : prof.x0;
  const rl = q ? raw(shares.left, gL, prof.x0) : [];
  const rr = p ? raw(shares.right, gR, prof.x1) : [];
  const opts = [...rl.map((w) => [oddDown(w), oddDown(w) + 2 * s]), ...rr.map((w) => [oddDown(w), oddDown(w) + 2 * s])];
  const area = (a, b) => prof.at(Math.max(a, b)) - prof.at(Math.min(a, b));
  const lead = (x, j) => 2 * (Math.abs(x - ua) + s / 2 + 2 * s * j);
  let best = null;
  const total = 1 << opts.length;
  for (let mask = 0; mask < total; mask++) {
    const ws = opts.map((o, i) => o[(mask >> i) & 1]);
    const wl = ws.slice(0, rl.length);
    const wr = ws.slice(rl.length);
    let mx = 0;
    let ok = true;
    // end strip of a group: odd as it is, or by spreading ≤ 0.3 s per gap (spreadOk)
    const grp = (w, from, to, nG) => {
      const dir = to > from ? 1 : -1;
      let at = from;
      for (let j = 0; j < w.length; j++) {
        const nx = at + dir * w[j];
        mx = Math.max(mx, area(at, nx) / s + lead(at, j) + drop);
        at = nx + dir * s;
      }
      const rem = Math.abs(to - at);
      if (rem < 3 * s - 1e-6) ok = false;
      const d = devOdd(rem);
      const spread = nG > 1 ? ((d > 0 ? d : 2 + d) * s) / (nG - 1) : Infinity;
      mx = Math.max(mx, area(at, to) / s + lead(at, w.length) + drop);
      return { d, spreadOk: Math.abs(d) < 0.05 || spread <= 0.3 * s || (d > 0 && d <= 0.65) };
    };
    const gl = q ? grp(wl, gL, prof.x0, q) : null;
    const gr = p ? grp(wr, gR, prof.x1, p) : null;
    // two groups: the corridor between them may also move / widen to ≤ 1.3 s (as buildStrips does)
    let corridorOk = false;
    if (gl && gr)
      for (const kl of [0, 2, -2])
        for (const kr of [0, 2, -2]) {
          const c = s + (gr.d - kr) * s - (-gl.d + kl) * s;
          if (c >= s - 1e-9 && c <= 1.3 * s + 1e-9) corridorOk = true;
        }
    const parityOk = corridorOk || ((!gl || gl.spreadOk) && (!gr || gr.spreadOk));
    if (!ok || !parityOk || mx > maxLoop - 1.5) continue;
    if (!best || mx < best.mx) best = { mx, L: wl, R: wr };
  }
  return best ? { L: best.L, R: best.R } : null;
}

/**
 * Lay out a zone.
 *   inp.zone      plan ring        inp.obstacles  [{polygon, clearance?}]
 *   inp.ports     [{ circuitId, index, supply:{x,y}, ret:{x,y} }] available manifold outlets
 *   inp.anchor    manifold point  inp.s, wallClearance, obstacleClearance, rmin, maxLoop
 *   inp.strategy  adaptive_spiral | spiral | serpentine | adaptive_serpentine
 *   inp.loops     fixed loop count (optional)   inp.frameIndex  entry edge alternative (repair)
 */
export function layoutZone(inp) {
  const s = inp.s ?? 0.15;
  const rmin = inp.rmin ?? 0.08;
  const maxLoop = inp.maxLoop ?? 60;
  const drop = inp.dropLength ?? 0.8;
  const errors = [];
  const { Z, U, obstacles } = usableArea({ ...inp, s });
  if (!U.length || G.area(U) < 0.2) return { errors: [{ code: 'UFH_NO_AREA', msg: 'Isitiladigan maydon yo‘q (clearance / obstacle juda katta)' }], loops: [], U, Z };
  const frames = entryFrames(U, inp.anchor, s);
  if (!frames.length) return { errors: [{ code: 'UFH_NO_ENTRY', msg: 'Kirish tomoni topilmadi' }], loops: [], U, Z };
  const fr = frames[Math.min(inp.frameIndex ?? 0, frames.length - 1)];
  const F = fr.F;
  const L = G.union(mapRegion(U, (p) => toLocal(F, p)));
  const prof = areaProfile(L);
  const anchorL = toLocal(F, inp.anchor);
  const ua = Math.max(prof.x0 + s, Math.min(prof.x1 - s, anchorL.x));
  // outlets in u order; root of each lead just in front of its outlet pair
  const ports = inp.ports
    .map((pt) => ({ ...pt, sl: toLocal(F, pt.supply), rl: toLocal(F, pt.ret) }))
    .sort((a, b) => a.sl.x + a.rl.x - b.sl.x - b.rl.x);
  const serp = (inp.strategy ?? 'adaptive_spiral').includes('serpentine');
  const ctx = { L, prof, ua, s, rmin, maxLoop, drop, strategy: inp.strategy ?? 'adaptive_spiral' };
  const connLen = (t) => {
    const pt = t.port;
    return Math.hypot(pt.sl.x - t.root.x, pt.sl.y - t.root.y) + Math.hypot(pt.rl.x - t.root.x, pt.rl.y - t.root.y);
  };
  // estimated loop length from the centreline (fast; exact geometry is built once at the end)
  const est = (t) => 2 * t.centerLen + connLen(t) + drop + (serp ? 0 : 0.4);
  const totalArea = prof.total;
  const AL = prof.at(ua);
  const approx = totalArea / s + 2 * Math.hypot(anchorL.y, 0) + 4;
  const nMin = Math.max(1, Math.ceil(approx / (maxLoop * 0.93)));
  let best = null;
  const tryN = (n) => {
    if (n > ports.length) return null;
    let bestN = null;
    // loops go both ways from the manifold unless it stands within half a loop of a zone end
    const half = Math.max(0.3, (0.5 * totalArea) / n);
    const q0 = Math.round((n * AL) / totalArea);
    let qs;
    if (AL < half) qs = [0];
    else if (totalArea - AL < half) qs = [n];
    else if (n === 1) qs = [AL < totalArea / 2 ? 0 : 1];
    else qs = [...new Set([q0, q0 - 1, q0 + 1].map((q) => Math.max(1, Math.min(n - 1, q))))];
    for (const q of qs) {
      const p = n - q;
      // the manifold's own outlets: q leftmost go left, p rightmost go right
      const roots = ports.slice(0, n).map((pt, pi) => {
        const y = Math.max(pt.sl.y, pt.rl.y) + 0.05;
        // outlets at the entry edge (their return row may reach into the heated area when the
        // manifold stands inside the zone): the lead starts just outside the heated area, as at a wall
        return { pi, x: (pt.sl.x + pt.rl.x) / 2, y: y < 2 * s ? Math.min(y, -0.05) : y };
      });
      // the staircase starts at the zone end only when the manifold really stands at that end
      const nearEnd = AL < half || totalArea - AL < half;
      const c = { ...ctx, roots, nearEnd };
      let shares = { left: Array(q).fill(1 / Math.max(1, q)), right: Array(p).fill(1 / Math.max(1, p)) };
      let strips = null;
      let lens = null;
      let bestIt = null;
      for (let it = 0; it < 6; it++) {
        strips = buildStrips(c, shares);
        strips.forEach((t) => (t.port = ports[t.root.pi]));
        lens = strips.map(est);
        const mx = Math.max(...lens);
        if (!bestIt || mx < bestIt.mx) bestIt = { mx, strips, lens, shares };
        // rebalance each group towards equal loop length
        const upd = (group, arr) => {
          if (arr.length < 2) return arr;
          const ls = arr.map((_, j) => lens[strips.findIndex((t) => t.group === group && t.j === j + 1)]);
          const mean = ls.reduce((a, b) => a + b, 0) / ls.length;
          const w = arr.map((x, j) => x * Math.pow(mean / Math.max(1, ls[j]), 1.2));
          const tot = w.reduce((a, b) => a + b, 0);
          return w.map((x) => x / tot);
        };
        const spread = Math.max(...lens) - Math.min(...lens);
        if (spread < 1.0) break;
        shares = { left: upd('L', shares.left), right: upd('R', shares.right) };
      }
      // snap strip widths to odd multiples of s (uniform spacing up to the spiral centre)
      if (n > 1) {
        // with the group gap shifted (odd end strips) and without; the shifted one unless only the
        // other keeps every loop within the limit
        let pick = null;
        const widths = oddWidths(c, bestIt.shares, q, p, n);
        const variants = [{ noShift: false }, { noShift: true }, { noShift: false, evenGaps: true }];
        if (widths) variants.unshift({ noShift: false, widths });
        // one group: where the zone widens or narrows sharply (a corridor opening into a room) the
        // first strip ends there — a strip spanning both is an L the rings cannot fill
        const jw = q === 0 || p === 0 ? widthJump(prof, s, p ? 1 : -1) : null;
        if (jw != null) {
          if (jw) {
            const w0 = p ? jw - s / 2 - prof.x0 : prof.x1 - jw - s / 2;
            // the others share what is beyond the edge equally
            const a0 = p ? prof.at(jw) - prof.at(prof.x0) : prof.at(prof.x1) - prof.at(jw);
            const f0 = Math.min(0.9, a0 / prof.total);
            // strips beyond the edge: equal loop lengths (area / s + both lead runs), the far ones
            // smaller as their leads are longer
            const restA = prof.total - a0;
            const m1 = Math.max(1, n - 1);
            let sub = Array(m1).fill(1 / m1);
            for (let it = 0; it < 6; it++) {
              const leads = [];
              let acc = 0;
              for (let j = 0; j < m1; j++) {
                const uStart = p ? prof.inv(prof.at(jw) + restA * acc) : prof.inv(prof.at(jw) - restA * acc);
                leads.push(Math.abs(uStart - ua) + s / 2 + 2 * s * (m1 - 1 - j));
                acc += sub[j];
              }
              const T = (restA / s + 2 * leads.reduce((a, b) => a + b, 0)) / m1;
              const A = leads.map((l) => Math.max(3 * s * 2, s * (T - 2 * l)));
              const tot = A.reduce((a, b) => a + b, 0);
              sub = A.map((x) => x / tot);
            }
            const sh = [f0, ...sub.map((x) => x * (1 - f0))];
            const shares = p ? { left: [], right: sh } : { left: sh, right: [] };
            if (w0 >= 3 * s && n > 1)
              variants.push({ noShift: false, widths: p ? { R: [w0] } : { L: [w0] }, shares }, { noShift: false, widths: p ? { R: [w0] } : { L: [w0] }, shares, evenGaps: true });
          }
        }
        for (const vr of variants) {
          const noShift = vr.noShift;
          const st = buildStrips({ ...c, snap: true, noShift, widths: vr.widths, evenGaps: vr.evenGaps }, vr.shares ?? bestIt.shares);
          st.forEach((t) => (t.port = ports[t.root.pi]));
          const ls = st.map(est);
          const m = Math.max(...ls);
          // a strip narrower than one ring (the remainder at the zone end) heats nothing
          const narrow = st.some((t) => Math.min(t.hi, prof.x1) - Math.max(t.lo, prof.x0) < 2.6 * s);
          if (narrow) continue;
          // uniform: every strip an odd multiple of s (the rings fill it with no empty band)
          const odd = st.every((t) => {
            const w = (Math.min(t.hi, prof.x1) - Math.max(t.lo, prof.x0)) / s;
            return Math.abs(w - (2 * Math.round((w - 1) / 2) + 1)) < 0.05;
          });
          const fitsM = m <= maxLoop - 0.3;
          // a strip across the width jump (corridor + room) is an L the rings cannot fill
          const jumpIn = jw != null && st.some((t) => Math.max(t.lo, prof.x0) + 3 * s < jw && jw < Math.min(t.hi, prof.x1) - 3 * s);
          const better =
            !pick ||
            (fitsM && !pick.fits) ||
            (fitsM === pick.fits && !jumpIn && pick.jumpIn) ||
            (fitsM === pick.fits && jumpIn === pick.jumpIn && odd && !pick.odd) ||
            (fitsM === pick.fits && jumpIn === pick.jumpIn && odd === pick.odd && m < pick.mx);
          // clearly uneven (a strip ≥ 0.3 s off odd leaves an empty band a pipe wide): one loop more
          // is then preferred, like an unsnapped layout
          const even = st.some((t) => {
            const w = (Math.min(t.hi, prof.x1) - Math.max(t.lo, prof.x0)) / s;
            return w >= 4.5 && Math.abs(w - (2 * Math.round((w - 1) / 2) + 1)) >= 0.3;
          });
          if (better) pick = { st, ls, mx: m, fits: fitsM, odd, even: even || jumpIn, jumpIn };
        }
        const { st, ls, mx } = pick ?? { mx: Infinity };

        if (pick && (mx <= maxLoop - 0.3 || mx <= bestIt.mx)) bestIt = { mx, strips: st, lens: ls, shares: bestIt.shares, snapped: !pick.even };
      }
      // within the limit, a snapped (uniform) layout beats a slightly better balanced one
      const rank = (b) => (b.mx <= maxLoop - 0.3 ? 0 : 1000 + b.mx) + (b.snapped ? 0 : 100) + b.mx / 100;
      if (!bestN || rank(bestIt) < rank(bestN)) bestN = { ...bestIt, q, p };
    }
    return bestN;
  };
  const nFixed = inp.loops ?? null;
  for (let n = nFixed ?? Math.min(ports.length, nMin + (inp.loopsPlus ?? 0)); n <= (nFixed ?? ports.length); n++) {
    const r = tryN(n);
    if (!r) continue;
    const fits = r.mx <= maxLoop - 0.3;
    const bestFits = best && best.mx <= maxLoop - 0.3;
    // take the first n that fits; one loop more is accepted only if it makes the strips uniform
    if (!best || (fits && !bestFits) || (!fits && !bestFits && r.mx < best.mx) || (fits && bestFits && r.snapped && !best.snapped)) best = { ...r, n };
    if (nFixed) break;
    if (fits && (r.snapped || n < 2 || (bestFits && best.n < n))) break;
  }
  if (!best) return { errors: [{ code: 'UFH_NO_CIRCUITS', msg: `Kollektorda yetarli bo‘sh chiqish yo‘q (${ports.length})` }], loops: [], U, Z, frame: F };
  // exact loops
  const loops = [];
  for (const t of best.strips) {
    if (!t.tree) {
      errors.push({ code: 'UFH_STRIP_EMPTY', msg: 'Kontur uchun joy qolmadi', at: toPlan(F, t.target) });
      continue;
    }
    const main = G.cleanPath([...t.lead, ...t.tree.path.slice(G.pathLength([t.lead[t.lead.length - 1], t.tree.path[0]]) < 1e-6 ? 1 : 0)]);
    if (G.pathLength(t.tree.path) < 1) {
      // nothing to heat in this strip (only the lead) — never a real loop
      errors.push({ code: 'UFH_STRIP_EMPTY', msg: 'Kontur uchun joy qolmadi (bo‘sh strip)', at: toPlan(F, t.target) });
      continue;
    }
    const lp = buildLoop(main, t.tree.branches, s, rmin, { uturns: t.tree.uturns, rminKey: inp.rminCheck ?? rmin, pipeFillet: rmin, bendMin: (inp.rminCheck ?? rmin) + 0.002 });
    for (const e of lp.errors) errors.push({ ...e, msg: `Kontur geometriyasi: ${e.code}` });
    const pt = t.port;
    const pipeL = lp.pipe;
    const full = G.cleanPath([pt.sl, ...pipeL, pt.rl]);
    const plan = mapLine(full, (q) => toPlan(F, q));
    const leadLen = G.pathLength(t.lead);
    const total = G.pathLength(plan);
    const sConn = Math.hypot(pt.sl.x - pipeL[0].x, pt.sl.y - pipeL[0].y);
    const rConn = Math.hypot(pt.rl.x - pipeL[pipeL.length - 1].x, pt.rl.y - pipeL[pipeL.length - 1].y);
    loops.push({
      circuitId: pt.circuitId,
      portIndex: pt.index,
      path: plan,
      supplyLen: sConn + leadLen,
      returnLen: rConn + leadLen,
      length: total + drop,
      drop,
      lead: mapLine(t.lead, (q) => toPlan(F, q)),
      center: mapLine(lp.center, (q) => toPlan(F, q)),
      region: mapRegion(t.region, (q) => toPlan(F, q)),
      stats: t.tree.stats,
      fanLen: G.pathLength(t.lead.slice(0, 2)) + 0.3,
    });
  }
  return { loops, errors, U, Z, obstacles, frame: F, frames: frames.length, n: best.n, estMax: best.mx };
}
