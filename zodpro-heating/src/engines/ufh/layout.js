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
export function usableArea({ zone, obstacles = [], wallClearance = 0.1, obstacleClearance = 0.1, avoid = [], keepOut = [], s = 0.15 }) {
  const Z = G.sanitize(zone);
  // round joins: clearance is a distance, so around re-entrant wall corners and obstacle corners
  // the boundary is an arc and the filleted pipe never cuts into the clearance
  let U = G.offset(Z, -wallClearance, 'round');
  const obs = obstacles.map((o) => G.offset(G.sanitize(o.polygon), o.clearance ?? obstacleClearance, 'round')).flat();
  const ko = keepOut.map((k) => G.sanitize(k)).flat();
  const blocks = [...obs, ...ko];
  if (avoid.length) blocks.push(...G.bufferPolylines(avoid, s));
  if (blocks.length) U = G.difference(U, G.union(blocks));
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
  const gL = both ? ua - s / 2 : prof.x1;
  const gR = both ? ua + s / 2 : prof.x0;
  const strips = [];
  // left group: from the manifold outwards (L1 first)
  if (q) {
    const Aend = prof.at(gL);
    const Astart = prof.at(prof.x0);
    const tot = Aend - Astart;
    let acc = 0;
    let hi = gL;
    for (let j = 1; j <= q; j++) {
      acc += shares.left[j - 1];
      let cut = j === q ? prof.x0 - 1 : prof.inv(Aend - tot * acc);
      if (ctx.snap && j < q) cut = hi - snapW(hi - Math.max(cut, prof.x0) - s / 2, s) - s / 2;
      strips.push({ group: 'L', j, lo: j === q ? prof.x0 - 1 : cut + s / 2, hi });
      hi = cut - s / 2;
    }
  }
  if (p) {
    const Astart = prof.at(gR);
    const tot = prof.total - Astart;
    let acc = 0;
    let lo = gR;
    for (let j = 1; j <= p; j++) {
      acc += shares.right[j - 1];
      let cut = j === p ? prof.x1 + 1 : prof.inv(Astart + tot * acc);
      if (ctx.snap && j < p) cut = Math.max(lo, prof.x0) + snapW(Math.min(cut, prof.x1) - s / 2 - Math.max(lo, prof.x0), s) + s / 2;
      strips.push({ group: 'R', j, lo, hi: j === p ? prof.x1 + 1 : cut - s / 2 });
      lo = cut + s / 2;
    }
  }
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
  const single = !both && !ctx.nearEnd; // one loop, manifold mid-side: straight in at ua
  const uL = both || single ? ua : prof.x1 - s / 2;
  const uR = both || single ? ua : prof.x0 + s / 2;
  for (const t of strips) {
    const n = t.group === 'L' ? q : p;
    t.track = s / 2 + 2 * s * (n - t.j);
    if (t.group === 'L') {
      const xe = Math.min(t.hi, prof.x1) - s / 2;
      // fan corner: its own staircase position, or the strip's ring side if the strip is nearer
      const d = Math.max(uL - b0 - 2 * s * (t.j - 1), xe);
      t.target = { x: xe, y: t.track };
      t.lead = leadPath(t.root, d, t.track, xe, s);
    } else {
      const xe = Math.max(t.lo, prof.x0) + s / 2;
      const d = Math.min(uR + b0 + 2 * s * (t.j - 1), xe);
      t.target = { x: xe, y: t.track };
      t.lead = leadPath(t.root, d, t.track, xe, s);
      if (single) {
        t.target = { x: ua, y: s / 2 };
        t.lead = G.cleanPath([t.root, { x: ua, y: t.root.y }, t.target]);
      }
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
    if (!both && !single && t.j === 1 && t.lead.length >= 3) {
      // the corner between the zone end and the lead coming down it (fan zone, heated by leads)
      const knee = t.lead[t.lead.length - 2];
      const far = t.group === 'L' ? 1000 : -1000;
      const wedge = [t.lead[0], { x: far, y: t.lead[0].y - 1000 }, { x: far, y: knee.y - s / 2 }, { x: knee.x, y: knee.y - s / 2 }];
      R = G.difference(R, [{ outer: G.ccw(wedge), holes: [] }]);
    }
    R = removeHoles(R, s, { x: 0, y: 1 });
    t.region = R;
    const last = t.lead[t.lead.length - 1];
    const prev = t.lead[t.lead.length - 2];
    const dir = G.norm({ x: last.x - prev.x, y: last.y - prev.y });
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
  const ctx = { L, prof, ua, s, rmin, strategy: inp.strategy ?? 'adaptive_spiral' };
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
      const roots = ports.slice(0, n).map((pt) => ({ x: (pt.sl.x + pt.rl.x) / 2, y: Math.max(pt.sl.y, pt.rl.y) + 0.05 }));
      const nearEnd = AL < half || totalArea - AL < half;
      const c = { ...ctx, roots, nearEnd };
      let shares = { left: Array(q).fill(1 / Math.max(1, q)), right: Array(p).fill(1 / Math.max(1, p)) };
      let strips = null;
      let lens = null;
      let bestIt = null;
      for (let it = 0; it < 6; it++) {
        strips = buildStrips(c, shares);
        strips.forEach((t, k) => (t.port = ports[k]));
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
        const cs = { ...c, snap: true };
        const st = buildStrips(cs, bestIt.shares);
        st.forEach((t, k) => (t.port = ports[k]));
        const ls = st.map(est);
        const mx = Math.max(...ls);

        if (mx <= maxLoop - 0.3 || mx <= bestIt.mx) bestIt = { mx, strips: st, lens: ls, shares: bestIt.shares, snapped: true };
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
    const lp = buildLoop(main, t.tree.branches, s, rmin, { uturns: t.tree.uturns, rminKey: inp.rminCheck ?? rmin });
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
