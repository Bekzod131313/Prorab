// UFH Coverage Router, step 6: MINIMUM LOOP COUNT — named lower bounds and the exhaustive search
// (loopproof.js). "Not found" and "impossible" are never the same status: PROVEN_INFEASIBLE only
// below the continuous lower bound; GRID_EXHAUSTIVE where every rectangle partition on the raster
// was searched (≤ 4 parts guillotine, ≤ 6 with pinwheels); SEARCH_NOT_EXHAUSTIVE otherwise;
// PROVEN_FEASIBLE for a rebuilt, validated solution (never "the minimum" by itself).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/engines/ufh/geom.js';
import { loopLowerBounds, proveLoopCount, regionCoverMin } from '../src/engines/ufh/loopproof.js';
import { assessHydraulics } from '../src/engines/ufh/loopplanner.js';
import { modelComplete, SEARCH_OPTS_DEFAULT } from '../src/engines/ufh/partitionsearch.js';
import { CASES } from '../tools/ufh-loops-debug.mjs';
import { MAX_LOOP_M, MAX_LARGEST_GAP, REBUILD_TOL, GEOMETRY_NUMERICAL_TOLERANCE, ENGINEERING_COVERAGE_TOLERANCE, RMIN_CHECK, ENGINEERING_FINAL_COVERAGE } from '../src/engines/ufh/criteria.js';

const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const setup = (name) => {
  const c = CASES[name];
  const b = G.bbox(c.zone);
  const rect = { x0: b.x0 + 0.2, y0: b.y0 + 0.2, x1: b.x1 - 0.2, y1: b.y1 - 0.2 };
  const R = [{ x: rect.x0, y: rect.y0 }, { x: rect.x1, y: rect.y0 }, { x: rect.x1, y: rect.y1 }, { x: rect.x0, y: rect.y1 }];
  return { rect, s: c.s, onWall: (q) => G.distToRegionBoundary(q, [{ outer: R, holes: [] }]) < 1e-6, leadTo: (p) => man(c.manifold.at, p) };
};

test('lower bounds: named, FINAL = max(COVERAGE, LEAD_AWARE), the raw pipe estimate is no bound', () => {
  const b = loopLowerBounds({ area: 36.96, s: 0.2, leadMin: 0.4, rawHeating: 182.08 });
  for (const k of ['COVERAGE_LOWER_BOUND', 'LEAD_AWARE_LOWER_BOUND', 'FINAL_LOWER_BOUND', 'RAW_PIPE_ESTIMATE']) assert.ok(Number.isInteger(b[k]), k);
  assert.equal(b.FINAL_LOWER_BOUND, Math.max(b.COVERAGE_LOWER_BOUND, b.LEAD_AWARE_LOWER_BOUND));
  assert.equal(b.RAW_PIPE_ESTIMATE_isBound, false);
  // long leads only raise the bound
  const far = loopLowerBounds({ area: 36.96, s: 0.2, leadMin: 10 });
  assert.ok(far.LEAD_AWARE_LOWER_BOUND >= b.LEAD_AWARE_LOWER_BOUND && far.COVERAGE_LOWER_BOUND === b.COVERAGE_LOWER_BOUND);
});

test('a found partition is PROVEN_FEASIBLE: rebuilt geometry = scored numbers (tolerances named), every loop ≤ 60 m', () => {
  const r = proveLoopCount({ ...setup('LP4'), chosen: 3, grid: 0.2 });
  assert.equal(r.candidate_minimum, 2);
  const f = r.results.find((x) => x.k === 2);
  assert.equal(f.status, 'PROVEN_FEASIBLE');
  assert.ok(f.cover_m2 >= r.bounds.neededCover_m2);
  for (const row of f.validation.rows) {
    // scored vs rebuilt: length 1e-9 m, cover / largest gap 1 cm², min radius 2 mm (polyline measure)
    assert.ok(row.length && row.coverage && row.largestGap && row.minRadius && row.total, JSON.stringify(row));
    assert.ok(row.values.total <= MAX_LOOP_M && row.values.minRadius >= RMIN_CHECK);
  }
  assert.deepEqual(REBUILD_TOL, { length_m: 1e-9, area_m2: 1e-4, radius_m: 0.002 });
  assert.equal(REBUILD_TOL, GEOMETRY_NUMERICAL_TOLERANCE);
  // the engineering acceptance is separate and has no tolerance: measured on the rebuilt pipes
  assert.equal(ENGINEERING_COVERAGE_TOLERANCE, 0);
  const e = f.validation.engineering;
  assert.ok(f.validation.rebuildMatches && e.coverage && e.largestGap && e.minRadius && e.total, JSON.stringify(e));
  assert.ok(e.values.covered >= r.bounds.neededCover_m2 && e.values.largestGap <= MAX_LARGEST_GAP);
  assert.ok(e.values.minRadius >= RMIN_CHECK && e.values.maxTotal <= MAX_LOOP_M);
  for (const p of r.solution.parts) {
    const sp = p.spiral();
    assert.ok(Math.abs(sp.heatingLength - p.v.heatingLength) <= REBUILD_TOL.length_m);
    assert.ok(p.v.hole <= MAX_LARGEST_GAP);
  }
});

test('LP11: 2 loops GRID_EXHAUSTIVE (every partition into ≤ 2 rectangles on the 0.05 m raster) — not called impossible', () => {
  const r = proveLoopCount({ ...setup('LP11'), chosen: 3, grid: 0.05 });
  assert.equal(r.bounds.FINAL_LOWER_BOUND, 2);
  const k2 = r.results.find((x) => x.k === 2);
  assert.equal(k2.status, 'GRID_EXHAUSTIVE');
  assert.equal(k2.proof_method, 'GRID_EXHAUSTIVE');
  assert.equal(k2.proof_resolution, 0.05);
  assert.equal(r.results.find((x) => x.status === 'PROVEN_INFEASIBLE').k, '1…1'); // below the continuous bound only
  assert.equal(r.minimum_loop_count_lower_bound, 3);
  assert.equal(r.candidate_minimum, 3);
  assert.equal(r.provenWithinModel, true);
  assert.equal(r.provenGlobally, false);
  assert.match(r.proof_scope, /^GRID_EXHAUSTIVE/);
});

test('LP7: 3 loops GRID_EXHAUSTIVE on the 0.2 m raster — 4 within the model, not a continuous proof', () => {
  const r = proveLoopCount({ ...setup('LP7'), chosen: 4, grid: 0.2 });
  assert.equal(r.bounds.FINAL_LOWER_BOUND, 3);
  assert.equal(r.results.find((x) => x.k === 3).status, 'GRID_EXHAUSTIVE');
  assert.equal(r.minimum_loop_count_lower_bound, 4);
  assert.equal(r.provenWithinModel, true);
  assert.equal(r.provenGlobally, false);
});

test('a time limit, a guillotine-only k ≥ 5 or any k > 6: SEARCH_NOT_EXHAUSTIVE — never GRID_EXHAUSTIVE or PROVEN_INFEASIBLE', () => {
  const r = proveLoopCount({ ...setup('LP8'), chosen: 7, grid: 0.2, timeLimit_ms: 1 });
  for (const x of r.results.filter((q) => typeof q.k === 'number')) assert.equal(x.status, 'SEARCH_NOT_EXHAUSTIVE', `k ${x.k}`);
  assert.equal(r.provenWithinModel, false);
  assert.equal(r.proof_scope, 'SEARCH_NOT_EXHAUSTIVE');
  // the model's completeness per k (partitionsearch.js: guillotine to 4, + pinwheels to 6)
  assert.equal(modelComplete(5, { ...SEARCH_OPTS_DEFAULT, pinwheel: false }), false);
  assert.equal(modelComplete(6, SEARCH_OPTS_DEFAULT), true);
  assert.equal(modelComplete(7, SEARCH_OPTS_DEFAULT), false);
});

test('LP8 k = 5 (0.2 m raster): guillotine alone SEARCH_NOT_EXHAUSTIVE, with pinwheels GRID_EXHAUSTIVE; a variant cache changes nothing', () => {
  const store = new Map();
  const variantCache = { get: (k) => store.get(k), set: (k, v) => store.set(k, JSON.parse(JSON.stringify(v))) };
  const g = proveLoopCount({ ...setup('LP8'), chosen: 7, grid: 0.2, ks: [5], searchOpts: { ...SEARCH_OPTS_DEFAULT, pinwheel: false }, variantCache });
  const p = proveLoopCount({ ...setup('LP8'), chosen: 7, grid: 0.2, ks: [5], variantCache });
  const k5g = g.results.find((x) => x.k === 5);
  const k5p = p.results.find((x) => x.k === 5);
  assert.equal(k5g.status, 'SEARCH_NOT_EXHAUSTIVE');
  assert.equal(k5g.search_model, 'GUILLOTINE');
  assert.equal(k5p.status, 'GRID_EXHAUSTIVE');
  assert.equal(k5p.search_model, 'LEAF/SLICE/PINWHEEL');
  assert.equal(k5p.proof_resolution, 0.2);
  // the pinwheels: rejected by the lead-access rule (P7), checked on the real bound
  assert.ok(k5p.stats.pinwheelChecked > 0 && k5p.stats.pinwheelLeadAccess === k5p.stats.pinwheelChecked);
  // the second run built nothing: every rectangle came from the cache, the same decision
  assert.equal(k5p.stats.leafBuilds, 0);
  assert.ok(k5p.stats.cacheHits > 0);
  // k = 5 alone is not a proof that 7 is the least: 6 not searched here
  assert.equal(p.candidate_minimum, 7);
  assert.equal(p.provenWithinModel, false);
});

test('multi-region zone: the regions\' minimum covers never add up to more than the zone requirement', () => {
  // zone 100 m², regions 60 + 40 m², zone requirement 85 m²
  const a = regionCoverMin(100, 60, 0.85) * 60;
  const b = regionCoverMin(100, 40, 0.85) * 40;
  assert.ok(Math.abs(a - 45) < 1e-9 && Math.abs(b - 25) < 1e-9);
  assert.ok(a + b <= 85 + 1e-9);
  // one region alone in its zone: the full requirement
  assert.ok(Math.abs(regionCoverMin(50, 50, 0.85) - 0.85) < 1e-12);
  // a small region beside a big one may need nothing
  assert.equal(regionCoverMin(100, 10, 0.85), 0);
  for (const [z, r] of [[100, 60], [37, 12.5], [80, 79]]) {
    const parts = [r, z - r];
    const sum = parts.reduce((acc, x) => acc + regionCoverMin(z, x, ENGINEERING_FINAL_COVERAGE) * x, 0);
    assert.ok(sum <= ENGINEERING_FINAL_COVERAGE * z + 1e-9, `${z} / ${r}: ${sum}`);
  }
});

test('zone acceptance: total heating-pipe coverage and the largest gap decide (region coverage only informs)', () => {
  const loop = { lengthValid: true, geometryValid: true };
  const base = { loops: [loop], rawGeometryStatus: 'RAW_GEOMETRY_VALID' };
  const checks = { spacing: true, residualSpacing: true, bends: true, noCrossing: true, inside: true, exitsOnWall: true, coverage: true, maxHole: true };
  assert.equal(assessHydraulics({ ...base, check: { checks } }, { outlets: 6 }).status, 'HYDRAULIC_LOOP_VALID');
  const low = assessHydraulics({ ...base, check: { checks: { ...checks, coverage: false } } }, { outlets: 6 });
  assert.deepEqual([low.status, low.reasons], ['HYDRAULIC_LOOP_INVALID', ['zone_coverage']]);
  const gap = assessHydraulics({ ...base, check: { checks: { ...checks, maxHole: false } } }, { outlets: 6 });
  assert.deepEqual([gap.status, gap.reasons], ['HYDRAULIC_LOOP_INVALID', ['largest_gap']]);
});
