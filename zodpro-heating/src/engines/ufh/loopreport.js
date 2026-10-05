// UFH Coverage Router — Phase 7B: the per-loop numbers of a connected zone, measured on the final
// rebuilt geometry (the real lead polylines of corridor.js, the frozen Phase 6 spirals, the final
// U′ = U − corridor). Nothing is estimated: every length is a polyline length, every area a
// polygon area.
//
//   heating   spiral.heatingLength (Phase 6)
//   supply    supply lead (port → spiral end) + the spiral's stub at that end (leadIn / leadOut)
//   return    return lead + the stub at the other end
//   total     heating + supply + return + 2 · drop (collector.js loopTotal → the frozen 60 m check)
//   coverage  the loop's own region ∩ U′ covered by its heating band (s/2 + 3 mm, as the raw check)
//   gap       the largest uncovered patch of that region (opening by s/2, as the raw check)

import * as G from './geom.js';
import { loopTotal } from './collector.js';
import { RMIN_CHECK, ENGINEERING_FINAL_COVERAGE, ENGINEERING_COVERAGE_TOLERANCE, ENGINEERING_FINAL_MAX_HOLE, MIN_RESIDUAL_CLOSURE_SPACING, SPACING_TOL } from './criteria.js';

const bbox = (p) => G.bbox(p);
const boxesMeet = (a, b, pad = 0) => a.x0 - pad <= b.x1 && b.x0 - pad <= a.x1 && a.y0 - pad <= b.y1 && b.y0 - pad <= a.y1;

/** Segment intersections between two polylines (shared end points within `skipNear` of `skip` ignored). */
function crossCount(A, B, skip = [], skipNear = 1e-6) {
  if (!boxesMeet(bbox(A), bbox(B))) return 0;
  let n = 0;
  for (let i = 1; i < A.length; i++) {
    const ab = { x0: Math.min(A[i - 1].x, A[i].x), x1: Math.max(A[i - 1].x, A[i].x), y0: Math.min(A[i - 1].y, A[i].y), y1: Math.max(A[i - 1].y, A[i].y) };
    for (let j = 1; j < B.length; j++) {
      const cd = { x0: Math.min(B[j - 1].x, B[j].x), x1: Math.max(B[j - 1].x, B[j].x), y0: Math.min(B[j - 1].y, B[j].y), y1: Math.max(B[j - 1].y, B[j].y) };
      if (!boxesMeet(ab, cd)) continue;
      const x = G.segmentIntersection(A[i - 1], A[i], B[j - 1], B[j]);
      if (x && !skip.some((q) => Math.hypot(q.x - x.x, q.y - x.y) <= skipNear)) n++;
    }
  }
  return n;
}

/** Smallest distance between two polylines (densified at `step`). */
function minDist(A, B, step = 0.01) {
  let m = Infinity;
  const pa = G.densify(A, step);
  for (const q of pa) for (let j = 1; j < B.length; j++) m = Math.min(m, G.segDist(q, B[j - 1], B[j]));
  return m;
}

/**
 * @param o { rooms: [{id, poly}], loops: [{ id, room, s, loop (Phase 6 loop: spiral, shape, nominalSpacing, geometryValid) }],
 *            leads (corridor.js), topology (looptopology.js), Uprime: {room: region}, collector,
 *            leadSpacing, keepOff: [points] (doors, manifold: the leads turn through the wall there) }
 */
export function loopReport(o) {
  const topoOf = new Map(o.topology.loops.map((t) => [t.id, t]));
  const rows = [];
  for (const L of o.loops) {
    const sp = L.loop.spiral;
    const s = L.s;
    const own = o.leads.filter((x) => x.loop === L.id);
    const S = own.find((x) => x.kind === 'supply');
    const R = own.find((x) => x.kind === 'return');
    const topo = topoOf.get(L.id);
    // the stubs: the supply's end is the heating start (spiral.supply → leadIn, spiral.ret → leadOut)
    const sAtA = topo?.heatingStart && Math.hypot(topo.heatingStart.x - sp.supply.x, topo.heatingStart.y - sp.supply.y) < 1e-6;
    const stubS = sAtA ? sp.leadIn : sp.leadOut;
    const stubR = sAtA ? sp.leadOut : sp.leadIn;
    const supplyRouted = (S?.length ?? NaN) + stubS;
    const returnRouted = (R?.length ?? NaN) + stubR;
    const len = loopTotal({ heatingLength: sp.heatingLength, supplyRouted, returnRouted }, o.collector);
    // own region in the final U′, its coverage and largest gap
    const region = G.intersection([L.loop.shape], o.Uprime[L.room] ?? []);
    const A = G.area(region);
    const band = G.bufferPolylines([G.simplifyPath(sp.heating, 0.002)], s / 2 + 0.003, 'round', 'round', 0.001);
    const covered = G.area(G.intersection(region, band));
    const holes = G.opening(G.difference(region, band), s / 2)
      .map((sh) => G.area([sh]))
      .sort((a, b) => b - a);
    // geometry
    const minRadius = G.minBendRadius(sp.path).radius;
    const residual = sp.residual ? { spacing: sp.residualSpacing ?? sp.residual.rho, measured: sp.residual.minMeasured ?? null, terminal: sp.residual.terminal ?? null } : null;
    // crossings: the spiral against every lead (its own two leads meet it at its two ends only) and
    // every other loop's spiral
    let crossings = 0;
    for (const l of o.leads) crossings += crossCount(sp.path, l.path, l.loop === L.id ? [sp.supply, sp.ret] : []);
    for (const M of o.loops) if (M.id !== L.id && M.room === L.room) crossings += crossCount(sp.path, M.loop.spiral.path);
    // clearance: heating ↔ the other loops' leads (≥ leadSpacing)
    let leadClear = Infinity;
    for (const l of o.leads) if (l.loop !== L.id && boxesMeet(bbox(sp.heating), bbox(l.path), o.leadSpacing * 2)) leadClear = Math.min(leadClear, minDist(l.path, sp.heating));
    // wall offset of this loop's leads: measured, away from the doors and the manifold
    let wall = Infinity;
    for (const l of own)
      for (const q of G.densify(l.path, 0.02)) {
        if (o.keepOff.some((k) => Math.hypot(q.x - k.x, q.y - k.y) <= 0.7)) continue;
        for (const room of o.rooms) {
          const reg = [{ outer: G.ccw(room.poly), holes: [] }];
          if (G.pointInRegion(q, reg)) wall = Math.min(wall, G.distToRegionBoundary(q, reg));
        }
      }
    const coverage = A > 0 ? covered / A : 0;
    const checks = {
      topology: topo?.status === 'LOOP_TOPOLOGY_VALID',
      length60: len.status === 'LOOP_VALID',
      coverage: coverage >= ENGINEERING_FINAL_COVERAGE - ENGINEERING_COVERAGE_TOLERANCE,
      largestGap: (holes[0] ?? 0) <= ENGINEERING_FINAL_MAX_HOLE,
      noCrossing: crossings === 0,
      clearance: leadClear >= o.leadSpacing - 1e-9,
      radius: minRadius >= RMIN_CHECK,
      residualSpacing: !residual?.measured || residual.measured >= MIN_RESIDUAL_CLOSURE_SPACING - SPACING_TOL,
      geometryValid: L.loop.geometryValid !== false,
    };
    const failed = Object.entries(checks)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    rows.push({
      room: L.room,
      loop: L.id,
      outlet: topo?.outlet ?? null,
      heating_m: sp.heatingLength,
      supply_m: supplyRouted,
      return_m: returnRouted,
      drop_m: 2 * o.collector.dropPerPipe_m,
      total_m: len.totalLength,
      margin_m: len.margin,
      lowMargin: len.lowMargin,
      lengthStatus: len.status,
      region_m2: A,
      covered_m2: covered,
      coverage,
      largestGap_m2: holes[0] ?? 0,
      nominalSpacing: L.loop.nominalSpacing ?? s,
      residual,
      minRadius_m: minRadius,
      crossings,
      leadClearance_m: leadClear,
      wallOffset_m: wall,
      topology: topo?.status ?? null,
      flags: topo?.flags ?? null,
      checks,
      // LOW_MARGIN (< 0.25 m) is a warning only
      status: failed.length ? 'LOOP_INVALID' : 'LOOP_VALID',
      warnings: len.lowMargin ? ['LOW_MARGIN'] : [],
      failed,
    });
  }
  return rows;
}
