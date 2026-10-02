// UFH Coverage Router — validation of a RAW SPIRAL SET (geometry of all regions of one zone).
// Global checks, not per region: two regions' spirals must keep s from each other too.
//
//   regions   union ≈ usable heating area (gap = unexplained area), no overlap
//   pipes     min spacing over ALL spirals (incl. across region cuts), bends ≥ RMIN_CHECK, no
//             crossing (within a spiral and between spirals), inside the usable area
//   exits     both ends of every spiral on an outer wall
//   coverage  heating pipe coverage and the largest uncovered patch within the engineering limits
//   status    INVALID_ZONE when any region is invalid or any check fails; else RAW_GEOMETRY_VALID
//             (plus loopPlannerRequired when any raw spiral is longer than a loop) — never a
//             "valid hydraulic loop": loops do not exist before the loop length planner

import * as G from './geom.js';
import { RMIN_CHECK, SPACING_TOL, MAX_LOOP_M, ENGINEERING_FINAL_COVERAGE, ENGINEERING_FINAL_MAX_HOLE } from './criteria.js';

/** Segments of a path with their arc-length positions and bounding boxes. */
function segsOf(path) {
  let acc = 0;
  const out = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    out.push({ a, b, s0: acc, s1: acc + l, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) });
    acc += l;
  }
  return { segs: out, L: acc };
}

/** Minimum distance between pipe stretches (same path: more than `gap` apart along it). */
function minGap(paths, s, step = 0.05) {
  const S = paths.map(segsOf);
  const gap = Math.PI * s * 0.5 + 2 * s;
  const reach = s * 1.5; // only near segments matter
  let best = { d: Infinity, at: null };
  S.forEach(({ L }, pi) => {
    for (let q = 0; q <= L; q += step) {
      const p = G.pointAt(paths[pi], q);
      S.forEach(({ segs }, pj) => {
        for (const sg of segs) {
          if (p.x < sg.x0 - reach || p.x > sg.x1 + reach || p.y < sg.y0 - reach || p.y > sg.y1 + reach) continue;
          if (pi === pj && sg.s1 > q - gap && sg.s0 < q + gap) continue;
          const d = G.segDist(p, sg.a, sg.b);
          if (d < best.d) best = { d, at: p };
        }
      });
    }
  });
  return best;
}

function crossings(paths) {
  const S = paths.map((p) => segsOf(p).segs);
  let n = 0;
  for (let i = 0; i < S.length; i++)
    for (let j = i; j < S.length; j++)
      for (let a = 0; a < S[i].length; a++) {
        const A = S[i][a];
        for (let b = i === j ? a + 2 : 0; b < S[j].length; b++) {
          const B = S[j][b];
          if (A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0) continue;
          if (G.segmentsIntersect(A.a, A.b, B.a, B.b, 1e-14)) n++;
        }
      }
  return n;
}

/**
 * @param res  spiralRegions() result
 * @param U    usable heating area
 * @param s    spacing
 */
export function checkRawSet(res, U, s) {
  const usable = G.asRegion(U);
  // (a region wrapping an obstacle carries the exclusion as its hole)
  const polys = res.regions.map((x) => [{ outer: x.poly, holes: x.holes ?? [] }]);
  const union = polys.length ? G.union(polys.flat()) : [];
  const sumA = polys.reduce((a, q) => a + G.area(q), 0);
  const regionUnion_m2 = G.area(union);
  const usable_m2 = G.area(usable);
  const overlap_m2 = Math.max(0, sumA - regionUnion_m2);
  const gap_m2 = G.area(G.difference(usable, union));
  const outside_m2 = G.area(G.difference(union, usable));
  const sp = res.regions.filter((x) => x.spiral).map((x) => x.spiral);
  const paths = sp.map((x) => x.path);
  const heat = sp.map((x) => x.heating);
  const g = paths.length ? minGap(paths, s) : { d: Infinity, at: null };
  const minBend = Math.min(Infinity, ...paths.map((p) => G.minBendRadius(p).radius));
  const cross = crossings(paths);
  const grown = G.offset(usable, 1e-4);
  const inside = heat.every((h) => h.every((q) => G.pointInRegion(q, grown)));
  const outer = usable.map((sh) => ({ outer: sh.outer, holes: [] }));
  const exitsOnWall = sp.every((x) => [x.supply, x.ret].every((q) => G.distToRegionBoundary(q, outer) < 1e-6));
  const band = heat.length ? G.bufferPolylines(heat.map((h) => G.simplifyPath(h, 0.002)), s / 2 + 0.003, 'round', 'round', 0.001) : [];
  const covered = G.area(G.intersection(usable, band));
  const holes = G.opening(G.difference(usable, band), s / 2)
    .map((sh) => ({ area: G.area([sh]), shape: sh }))
    .sort((a, b) => b.area - a.area);
  const invalidRegions = res.regions.filter((x) => x.status !== 'VALID').length;
  const rawTotal_m = sp.reduce((a, x) => a + x.heatingLength, 0);
  const checks = {
    regionsValid: invalidRegions === 0,
    noOverlap: overlap_m2 < 1e-6,
    noGap: gap_m2 < 1e-4,
    regionsInside: outside_m2 < 1e-6,
    spacing: g.d >= s - SPACING_TOL,
    bends: minBend >= RMIN_CHECK,
    noCrossing: cross === 0,
    inside,
    exitsOnWall,
    // heating pipe only; the same limits as the final engineering validation (a raw set that
    // already fails them can never become a valid zone)
    coverage: usable_m2 > 0 && covered / usable_m2 >= ENGINEERING_FINAL_COVERAGE,
    maxHole: (holes[0]?.area ?? 0) <= ENGINEERING_FINAL_MAX_HOLE,
  };
  const ok = Object.values(checks).every(Boolean);
  return {
    status: ok ? 'RAW_GEOMETRY_VALID' : 'INVALID_ZONE',
    loopPlannerRequired: ok && (rawTotal_m > MAX_LOOP_M || sp.some((x) => x.heatingLength > MAX_LOOP_M)),
    checks,
    usable_m2,
    regionUnion_m2,
    gap_m2,
    overlap_m2,
    regions: res.regions.length,
    invalidRegions,
    minSpacing: g.d,
    minSpacingAt: g.at,
    minBend,
    crossings: cross,
    coverage: usable_m2 > 0 ? covered / usable_m2 : 0,
    uncovered_m2: usable_m2 - covered,
    holes,
    largestHole_m2: holes[0]?.area ?? 0,
    rawTotal_m,
  };
}
