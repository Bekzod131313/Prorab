// UFH Coverage Router — step 5: CENTER CLOSURE + RESIDUAL SPACING OPTIMIZER.
//
// A raw spiral is built at the nominal spacing s; where the region's width is no multiple of s the
// rest stays as a gap in its centre (or along the core strip round an obstacle). The optimizer
// rebuilds the region's spiral with the same topology (bifilar, same start corner, same ends) and
// tries closures of that rest:
//   A  plain centre (hairpin / side turn) with an odd or even ring count
//   B  the centre moved (the other centre type, one ring more or less)
//   C  the turn diameter = the actual distance of the joined pipes (radius ≥ RMIN_CHECK, else out)
//   D  the innermost ring / hairpin legs at a RESIDUAL spacing rho < s (rho from
//      MIN_RESIDUAL_CLOSURE_SPACING up) — the residual only in the terminal part, never the whole spiral
//   E  the rest balanced on both sides of the core (the residual ring is an offset: the same rho on
//      every side of the core)
//   F  round an obstacle: the margin variants of step 4 × the residual closures
//   (each also mirrored: the ends stay at the same corner, the first side runs along the other wall
//   — the hairpin then lies along the long side of an elongated core)
// Hard checks inside the generator (any failure drops the candidate): nominal pairs ≥ s − tol,
// residual pairs ≥ MIN_RESIDUAL_CLOSURE_SPACING − tol, bends ≥ r (turns ≥ RMIN_CHECK), heating pipe ≥ s/2
// from walls, exclusions and seams, no crossing. Scoring of the valid ones: largest uncovered patch,
// total uncovered, (coverage), residual penalty, pipe length, bend penalty. The result replaces the
// region's spiral only when it is better (smaller patch, or the same patch and less uncovered).

import * as G from './geom.js';
import { obstacleSpiral, measure } from './obstaclespiral.js';
import { CLOSURE_TRIGGER_UNCOVERED_SHARE, MAX_RESIDUAL_RINGS } from './criteria.js';

/** Lexicographic candidate order (tolerances: 0.01 m² patch / uncovered). */
export function closureOrder(a, b) {
  const q = (v) => Math.round(v * 100);
  if (q(a.largestHole) !== q(b.largestHole)) return a.largestHole - b.largestHole;
  if (q(a.uncovered) !== q(b.uncovered)) return a.uncovered - b.uncovered;
  const pa = a.residualSpacing ? a.s - a.residualSpacing : 0;
  const pb = b.residualSpacing ? b.s - b.residualSpacing : 0;
  if (Math.abs(pa - pb) > 1e-9) return pa - pb;
  if (Math.abs(a.heatingLength - b.heatingLength) > 0.05) return a.heatingLength - b.heatingLength;
  // bend penalty last (computed once per candidate, only when everything else ties)
  const mb = (x) => (x.minBend ??= G.minBendRadius(x.path).radius);
  return mb(b) - mb(a);
}

/**
 * Centre closure of one region's raw spiral.
 * @param shape  the region's usable shape { outer, holes }
 * @param sp     its current raw spiral (nominal)
 * @param s      nominal spacing
 * @param o      { r, toward, exitOk, edgeOk }
 * @returns { spiral (the better one, or sp), changed, old: {uncovered, largestHole}, new: {...}, tried }
 */
export function closeCentre(shape, sp, s, o = {}) {
  const real = [{ outer: shape.outer, holes: shape.holes ?? [] }];
  const old = measure({ heating: sp.heating }, s, real);
  const area = G.area(real);
  const report = { old: { uncovered: old.uncovered, largestHole: old.largestHole }, changed: false, tried: 0 };
  if (old.uncovered / area <= CLOSURE_TRIGGER_UNCOVERED_SHARE) return { spiral: sp, ...report, new: report.old, skipped: 'nothing to close' };
  // the corner the ends leave at (kept)
  const corner = sp.region && sp.start !== undefined ? sp.region[sp.start] : null;
  const run = (mir) => {
    const M = (p) => (mir ? { x: -p.x, y: p.y } : p);
    const ring = (R) => (mir ? R.map(M).reverse() : R);
    const sh = { outer: ring(shape.outer), holes: (shape.holes ?? []).map(ring) };
    const res = obstacleSpiral(sh, s, {
      r: o.r,
      toward: o.toward && M(o.toward),
      exitOk: o.exitOk && ((q) => o.exitOk({ ...q, supply: M(q.supply), ret: M(q.ret) })),
      edgeOk: o.edgeOk && ((a, b) => o.edgeOk(M(b), M(a))),
      cornerAt: corner && M(corner),
      supplyAt: M(sp.supply),
      residual: true,
      returnAll: true,
      measure: o.measure ?? 1,
      maxSeams: 3,
    });
    if (!res.ok) return [];
    if (!mir) return res.ranked;
    // back to plan coordinates (arc lengths, areas and lengths do not change)
    const reg = (R) => R.map((q) => ({ outer: ring(q.outer), holes: (q.holes ?? []).map(ring) }));
    return res.ranked.map((x) => ({
      ...x,
      mirrored: true,
      path: x.path.map(M),
      heating: x.heating.map(M),
      supply: M(x.supply),
      ret: M(x.ret),
      region: ring(x.region),
      start: x.region.length - 1 - x.start,
      seamed: x.seamed && ring(x.seamed),
      seams: (x.seams ?? []).map((q) => ({ ...q, a: M(q.a), b: M(q.b) })),
      marginHoles: x.marginHoles && x.marginHoles.map(ring),
      unc: reg(x.unc),
    }));
  };
  // terminal only: never more residual rings than allowed (the generator builds no more anyway)
  const cands = [...run(false), ...run(true)].filter((x) => !x.residual || x.residual.rings <= MAX_RESIDUAL_RINGS);
  report.tried = cands.length;
  if (!cands.length) return { spiral: sp, ...report, new: report.old };
  const best = cands.sort(closureOrder)[0];
  const better = best.largestHole < old.largestHole - 0.005 || (best.largestHole <= old.largestHole + 0.005 && best.uncovered < old.uncovered - 0.01);
  if (!better) return { spiral: sp, ...report, new: report.old };
  return { spiral: { ...best, closure: true }, ...report, changed: true, new: { uncovered: best.uncovered, largestHole: best.largestHole } };
}
