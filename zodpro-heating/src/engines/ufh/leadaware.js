// UFH Coverage Router — Phase 6 reopen: LEAD-AWARE loop planning.
//
// The loops of a room are planned with the room's own lead connections as constraints (inputs):
//   ENTRY            where the leads come in (the door, or the manifold in its own room): point +
//                    the direction into the room
//   LEAD_CLEARANCE   the lead pitch S (leadSpacing): lead ↔ lead and lead ↔ heating centre distance
//   lead budget      explicit conservative lead length for the 60 m limit: the measured transfer
//                    to the entry (input), the drop per pipe (input), the way from the entry to the
//                    loop's end along the room's usable outline
//
// Every loop's two ends leave through the usable outline (Phase 6 rule); its two leads run from the
// entry along that outline to them. Where n loop pairs pass, 2·n·S of the usable floor next to the
// outline is LEAD_CLEARANCE band (no heating) — the leads, S apart, and their clearance to the first
// heating pipe (s/2 ≥ S/2 inside the band edge). The band at the entry is the DOOR_TRANSITION_ZONE
// (all pairs pass there); round each loop's ends the LEAD_ENTRY_ZONE / LEAD_EXIT_ZONE. The room is
// planned (decompose + loop planner, unchanged rules: continuous spirals, residual only in the
// terminal closure, no serpentine), its routes measured, the bands carved off, and planned again
// until the bands no longer grow (the reserved floor only grows — the iteration ends).
//
// Output: the plan (loops as from planLoops), per loop its endpoints with directions and lead
// compatibility, the zones, the raw areas (usable, reserved, heating, uncovered, largest gap).
// No valid spiral → NO_VALID_SPIRAL (never another pipe pattern).

import * as G from './geom.js';
import { spiralRegions } from './decompose.js';
import { planLoops } from './loopplanner.js';
import { ENGINEERING_FINAL_COVERAGE, MAX_LARGEST_GAP } from './criteria.js';

export const NO_VALID_SPIRAL = 'NO_VALID_SPIRAL';
export const LEAD_AWARE_VALID = 'LEAD_AWARE_VALID';
export const LEAD_INCOMPATIBLE = 'LEAD_INCOMPATIBLE';

const unit = (a) => {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
};

/** A ring by arc length: s of a point, the sub-path between two arc lengths (the shorter way). */
function ringWay(R) {
  const cum = [0];
  for (let i = 0; i < R.length; i++) cum.push(cum[i] + Math.hypot(R[(i + 1) % R.length].x - R[i].x, R[(i + 1) % R.length].y - R[i].y));
  const T = cum[R.length];
  const sOf = (p) => {
    const c = G.closestOnRing(p, R);
    return { s: cum[c.i] + c.t * (cum[c.i + 1] - cum[c.i]), d: c.d };
  };
  const closed = [...R, R[0]];
  const way = (s0, s1) => {
    const f = (((s1 - s0) % T) + T) % T;
    const fwd = f <= T - f;
    const len = fwd ? f : T - f;
    if (len < 1e-9) return { path: [G.pointAt(closed, s0)], len: 0 };
    // the outline's own vertices between the two ends (a corner is never cut by a chord)
    const at = (x) => G.pointAt(closed, ((x % T) + T) % T);
    const pts = [at(s0)];
    const inner = [];
    for (let i = 0; i < R.length; i++)
      for (const c of [cum[i] - T, cum[i], cum[i] + T]) {
        const f2 = fwd ? c - s0 : s0 - c;
        if (f2 > 1e-9 && f2 < len - 1e-9) inner.push({ f: f2, p: R[i] });
      }
    inner.sort((x, y) => x.f - y.f);
    for (const q of inner) pts.push(q.p);
    pts.push(at(s0 + (fwd ? len : -len)));
    return { path: G.cleanPath(pts, 1e-6), len };
  };
  return { T, sOf, way };
}

/**
 * The explicit lead budget of a room: a lead from the entry to a point of the usable outline runs
 * along the outline (the shorter way). leadTo(p) = transfer to the entry + drop + that way.
 */
export function leadBudget(U, entry, budget) {
  const region = G.asRegion(U);
  const rings = region.map((sh) => ringWay(sh.outer));
  const routeTo = (p) => {
    let best = null;
    region.forEach((sh, k) => {
      const W = rings[k];
      const e = W.sOf(entry);
      const q = W.sOf(p);
      const w = W.way(e.s, q.s);
      const total = e.d + w.len + q.d;
      if (!best || total < best.total) best = { total, path: w.path, shape: k };
    });
    return best;
  };
  const leadTo = (p) => budget.toEntry_m + budget.drop_m + (routeTo(p)?.total ?? Infinity);
  return { routeTo, leadTo };
}

/**
 * @param U    usable heating area of the room (region; 7B's U′: wall clearance, obstacles and the
 *             transit corridor already off)
 * @param s    heating pitch
 * @param ctx  { entry: { at, dir }, leadSpacing, budget: { toEntry_m, drop_m }, r, maxIter }
 */
export function planLeadAware(U, s, ctx) {
  const S = ctx.leadSpacing;
  if (!(S > 0) || !ctx.entry?.at || !ctx.budget || !(ctx.budget.toEntry_m >= 0) || !(ctx.budget.drop_m >= 0)) throw new Error('planLeadAware: entry, leadSpacing and budget { toEntry_m, drop_m } are required inputs');
  const region = G.asRegion(U);
  const entry = ctx.entry.at;
  const maxIter = ctx.maxIter ?? 5;
  // the leads run along the room's usable outline (the wall / bundle edge) — routes on U itself
  const { routeTo, leadTo } = leadBudget(region, entry, ctx.budget);
  const history = [];
  const states = [];
  let reserved = [];
  for (let it = 0; it < maxIter; it++) {
    const P = (reserved.length ? G.difference(region, reserved) : region).filter((sh) => G.area([sh]) >= 1e-6);
    const res = spiralRegions(P, s, { toward: entry, r: ctx.r });
    const plan = planLoops(res, P, s, { leadTo, manifold: null, toward: entry, r: ctx.r });
    // the routes of every loop (one per pair: to the middle of its two ends) and the band they need
    const routes = plan.loops.map((l) => routeTo({ x: (l.spiral.supply.x + l.spiral.ret.x) / 2, y: (l.spiral.supply.y + l.spiral.ret.y) / 2 }));
    const band = bandOf(routes, S, region);
    // consistent: no heating pipe inside the band its own routes need
    const heat = plan.loops.map((l) => l.spiral.heating);
    const inBand = band.length && heat.length ? G.clipLines(heat, band).reduce((a, q) => a + G.pathLength(q), 0) : 0;
    const cover = heat.length ? G.area(G.intersection(region, G.bufferPolylines(heat.map((h) => G.simplifyPath(h, 0.002)), s / 2 + 0.003, 'round', 'round', 0.001))) / G.area(region) : 0;
    const unc0 = heat.length ? G.difference(region, G.bufferPolylines(heat.map((h) => G.simplifyPath(h, 0.002)), s / 2 + 0.003, 'round', 'round', 0.001)) : region;
    const gap = G.opening(unc0, s / 2).reduce((a, q) => Math.max(a, G.area([q])), 0);
    const st = { plan, routes, P, band, inBand, cover, gap, it: it + 1 };
    states.push(st);
    history.push({ iteration: it + 1, loops: plan.loops.length, reserved_m2: G.area(reserved), heatingInBand_m: inBand, coverage: cover });
    if (inBand < 1e-6) break;
    // next: the band of these routes (not the union of all — a band no route needs any more is
    // floor again)
    reserved = band;
  }
  // the order of the reopen brief: a valid spiral, coverage, the largest gap, then lead compatibility
  // (a plan whose heating lies in its own routes' band is LEAD_INCOMPATIBLE — reported, not hidden)
  const rank = (x) => [x.plan.loops.length ? 0 : 1, x.cover >= ENGINEERING_FINAL_COVERAGE ? 0 : 1, x.gap <= MAX_LARGEST_GAP + 1e-9 ? 0 : 1, x.inBand < 1e-6 ? 0 : 1, -x.cover];
  const last = states.reduce((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (Math.abs(ra[i] - rb[i]) > 1e-9) return rb[i] < ra[i] ? b : a;
    return a;
  });
  const { plan, routes, P } = last;
  // endpoints (the stub direction out of the spiral), the zones, lead compatibility
  const loops = plan.loops.map((l, i) => {
    const sp = l.spiral;
    const out = (a, b) => unit({ x: a.x - b.x, y: a.y - b.y });
    const route = routes[i];
    // compatible: the pair's route keeps the clearance from every OTHER loop's heating
    let clash = 0;
    if (route?.path?.length >= 2) {
      const zone = G.bufferPolylines([route.path], S - 1e-9, 'butt', 'round');
      for (const [j, m] of plan.loops.entries()) if (j !== i) clash += G.clipLines([m.spiral.heating], zone).reduce((a, q) => a + G.pathLength(q), 0);
    }
    return {
      loopId: l.loopId,
      endpoints: {
        supply: { at: sp.supply, dir: out(sp.path[0], sp.path[1]) },
        ret: { at: sp.ret, dir: out(sp.path[sp.path.length - 1], sp.path[sp.path.length - 2]) },
      },
      entryRoute_m: route?.total ?? null,
      leadEntryZone: G.bufferPolylines([[sp.supply, sp.supply]], S, 'round', 'round'),
      leadExitZone: G.bufferPolylines([[sp.ret, sp.ret]], S, 'round', 'round'),
      leadClash_m: clash,
      leadCompatible: clash < 1e-6 && !!route,
    };
  });
  // (an INVALID region — a crumb no spiral fits — is uncovered floor, measured below; no loop at all
  // is NO_VALID_SPIRAL)
  const status = !plan.loops.length ? NO_VALID_SPIRAL : loops.every((x) => x.leadCompatible) && last.inBand < 1e-6 ? LEAD_AWARE_VALID : LEAD_INCOMPATIBLE;
  // raw areas (Phase 6 measure: the room's usable floor U; the corridor accounting is 7B's)
  const band = G.bufferPolylines(plan.loops.map((l) => G.simplifyPath(l.spiral.heating, 0.002)), s / 2 + 0.003, 'round', 'round', 0.001);
  const unc = G.difference(region, band);
  const transition = G.intersection(G.bufferPolylines([[entry, entry]], 2 * S * Math.max(1, plan.loops.length) + 0.5 * s, 'round', 'round'), G.difference(region, P));
  return {
    status,
    plan,
    loops,
    zones: { leadClearance: G.difference(region, P), doorTransition: transition },
    areas: {
      usable_m2: G.area(region),
      reserved_m2: G.area(region) - G.area(P),
      heating_m2: G.area(region) - G.area(unc),
      uncovered_m2: G.area(unc),
      largestGap_m2: G.opening(unc, s / 2).reduce((a, q) => Math.max(a, G.area([q])), 0),
    },
    history,
    chosenIteration: last.it,
    heatingInBand_m: last.inBand,
  };
}

/**
 * The LEAD_CLEARANCE band of the routes: along each stretch of the outline where n pairs pass,
 * 2·n·S into the floor (the leads S apart and S to the first heating pipe).
 */
function bandOf(routes, S, P) {
  const segs = new Map();
  const key = (a, b) => [a, b].map((q) => `${q.x.toFixed(3)},${q.y.toFixed(3)}`).sort().join('|');
  for (const r of routes) {
    if (!r?.path || r.path.length < 2) continue;
    for (let k = 1; k < r.path.length; k++) {
      const kk = key(r.path[k - 1], r.path[k]);
      const e = segs.get(kk) ?? { a: r.path[k - 1], b: r.path[k], n: 0 };
      e.n++;
      segs.set(kk, e);
    }
  }
  if (!segs.size) return [];
  const byN = new Map();
  for (const e of segs.values()) {
    if (!byN.has(e.n)) byN.set(e.n, []);
    byN.get(e.n).push([e.a, e.b]);
  }
  let out = [];
  for (const [n, lines] of byN) {
    // (butt caps, mitred joins: the outline is rectilinear, so the band is — the decomposition needs it)
    const b = G.intersection(G.bufferPolylines(lines, 2 * n * S, 'butt', 'miter'), P);
    out = out.length ? G.union(out, b) : b;
  }
  return out;
}
