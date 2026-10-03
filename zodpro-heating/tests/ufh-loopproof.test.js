// UFH Coverage Router, step 6: MINIMUM LOOP COUNT — named lower bounds and the exhaustive search
// (loopproof.js). "Not found" and "impossible" are kept apart: PROVEN_INFEASIBLE only where the
// search covers every rectangle partition (≤ 4 parts: all guillotine), on the stated raster.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/engines/ufh/geom.js';
import { loopLowerBounds, proveLoopCount } from '../src/engines/ufh/loopproof.js';
import { CASES } from '../tools/ufh-loops-debug.mjs';
import { MAX_LOOP_M, MAX_LARGEST_GAP } from '../src/engines/ufh/criteria.js';

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

test('exhaustive search finds a feasible partition where one exists (LP4: 2 loops), every part ≤ 60 m, no patch', () => {
  const r = proveLoopCount({ ...setup('LP4'), chosen: 3, grid: 0.2 });
  assert.equal(r.minimum, 2);
  const f = r.results.find((x) => x.status === 'FEASIBLE');
  assert.ok(f);
  for (const p of r.solution.parts) {
    assert.ok(p.total <= MAX_LOOP_M);
    assert.ok(p.v.hole <= MAX_LARGEST_GAP);
    // the solution's spiral is rebuilt exactly (same pipe length as evaluated)
    const sp = p.spiral();
    assert.ok(sp && Math.abs(sp.heatingLength - p.v.heatingLength) < 1e-9);
  }
  assert.ok(f.cover_m2 >= r.bounds.neededCover_m2);
});

test('LP11: 2 loops PROVEN_INFEASIBLE (every partition into ≤ 2 rectangles, 0.05 m raster) — 3 is the minimum', () => {
  const r = proveLoopCount({ ...setup('LP11'), chosen: 3, grid: 0.05 });
  assert.equal(r.bounds.FINAL_LOWER_BOUND, 2);
  assert.deepEqual(r.results.map((x) => [x.k, x.status]), [[2, 'PROVEN_INFEASIBLE']]);
  assert.equal(r.provenMinimum, true);
  assert.equal(r.minimum, 3);
});

test('LP7: 3 loops PROVEN_INFEASIBLE on the 0.2 m raster — 4 is the minimum there', () => {
  const r = proveLoopCount({ ...setup('LP7'), chosen: 4, grid: 0.2 });
  assert.equal(r.bounds.FINAL_LOWER_BOUND, 3);
  assert.equal(r.results[0].k, 3);
  assert.equal(r.results[0].status, 'PROVEN_INFEASIBLE');
  assert.equal(r.provenMinimum, true);
});

test('k ≥ 5: guillotine search only — reported SEARCH_NOT_EXHAUSTIVE, never PROVEN_INFEASIBLE', () => {
  // a tiny time limit: whatever is left unexplored can never be called impossible
  const r = proveLoopCount({ ...setup('LP8'), chosen: 7, grid: 0.2, timeLimit_ms: 1 });
  for (const x of r.results) assert.notEqual(x.status, 'PROVEN_INFEASIBLE', `k ${x.k}`);
  assert.equal(r.provenMinimum, false);
});
