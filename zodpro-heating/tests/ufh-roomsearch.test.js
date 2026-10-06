// Phase 6 reopen: ROOM SEARCH — the minimum VALID loop count first, then the closure jointly
// (start corner × winding × terminal side × ρ × closure mode) per piece.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/engines/ufh/geom.js';
import { restWidths, sideResidualPossible, evaluatePiece, searchRoom } from '../src/engines/ufh/roomsearch.js';
import { leadBudget, planLeadAware } from '../src/engines/ufh/leadaware.js';
import { PHASE6_REFERENCE_MISMATCH } from '../src/engines/ufh/phase6reference.js';
import { MAX_LOOP_M, MAX_LARGEST_GAP, ENGINEERING_FINAL_COVERAGE, RMIN_CHECK } from '../src/engines/ufh/criteria.js';

const rect = (x0, y0, x1, y1) => ({ outer: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [] });

test('RS-1 rest widths: ρ is fixed by the distances between parallel sides (start / winding cannot change it)', () => {
  // LR.L1 of the old plan: 3.80 × 2.242 → x rest 0, y rest 0.042 → no side residual possible
  const lr = rect(0.1, 0.1, 3.9, 2.342);
  assert.deepEqual(restWidths(lr, 0.2), { x: [0], y: [0.042] });
  assert.equal(sideResidualPossible(lr, 0.2), false);
  // 2.55 wide: 0.15 rest across x → a side residual
  assert.equal(sideResidualPossible(rect(0, 0, 2.55, 3.4), 0.2), true);
});

test('RS-2 joint piece evaluation: every valid variant meets the hard limits; centre residual is never valid', () => {
  const sh = rect(0, 0, 2.55, 3.4);
  const room = [sh];
  const onWall = (q) => G.distToRegionBoundary(q, room) < 1e-6;
  const { leadTo } = leadBudget(room, { x: -0.06, y: 0.6 }, { toEntry_m: 2, drop_m: 0.4 });
  const e = evaluatePiece(sh, 0.2, { exitOk: (q) => onWall(q.supply) && onWall(q.ret), edgeOk: (a, b) => onWall({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), leadTo, measure: 2 });
  assert.ok(e.variants > 10 && e.valid.length > 0);
  for (const r of e.valid) {
    assert.ok(r.total <= MAX_LOOP_M + 1e-9 && r.v.hole <= MAX_LARGEST_GAP + 1e-9 && r.cover >= ENGINEERING_FINAL_COVERAGE && r.minR >= RMIN_CHECK);
    assert.notEqual(r.ref.status, PHASE6_REFERENCE_MISMATCH);
    assert.ok(Math.abs(r.total - (r.v.sp.heatingLength + r.supplyLead + r.returnLead)) < 1e-9, 'total = heating + supply + return (drop in the leads)');
  }
  // every rejection carries its reason
  assert.equal(Object.values(e.rejected).reduce((a, b) => a + b, 0) + e.valid.length, e.variants);
  // the side closure is among the valid ones (both start corners / windings searched)
  assert.ok(e.valid.some((r) => r.closure === 'side:right' || r.closure === 'side:left'));
});

test('RS-3 minimum count: k below the continuous bound is PROVEN_INFEASIBLE; the first feasible k stops the search', () => {
  const U = [rect(0, 0, 2.55, 3.4)];
  const { leadTo } = leadBudget(U, { x: -0.06, y: 0.6 }, { toEntry_m: 2, drop_m: 0.4 });
  const r = searchRoom(U, 0.2, { leadTo, kMax: 2 });
  assert.equal(r.chosen.k, 1);
  assert.equal(r.results[0].status, 'PROVEN_FEASIBLE');
  assert.equal(r.results[0].secondaryOptimum, 'GRID_EXHAUSTIVE');
  assert.deepEqual(r.results.slice(1).map((q) => q.status), ['NOT_RUN']);
  // a longer transfer: one loop is impossible by the bound → PROVEN_INFEASIBLE stated, never searched
  const far = leadBudget(U, { x: -0.06, y: 0.6 }, { toEntry_m: 14, drop_m: 0.4 });
  const r2 = searchRoom(U, 0.2, { leadTo: far.leadTo, kMax: 2, timeLimit_ms: 1 });
  assert.equal(r2.results[0].status, 'PROVEN_INFEASIBLE');
  // the time limit: never claimed exhaustive
  assert.ok(['SEARCH_NOT_EXHAUSTIVE', 'PROVEN_FEASIBLE'].includes(r2.results[1].status));
  if (r2.results[1].status === 'PROVEN_FEASIBLE') assert.equal(r2.results[1].secondaryOptimum, 'SEARCH_NOT_EXHAUSTIVE');
});

test('RS-4 lead-aware planning with the room search: valid loops, or SEARCH_NOT_EXHAUSTIVE — never a hidden NO_VALID_SPIRAL', () => {
  const U = [rect(0, 0, 2.55, 3.4)];
  const la = planLeadAware(U, 0.2, { entry: { at: { x: -0.06, y: 0.6 } }, leadSpacing: 0.05, budget: { toEntry_m: 2, drop_m: 0.4 }, roomSearch: { kMax: 2 } });
  assert.ok(la.plan.loops.length === 1 && la.plan.loops[0].status === 'LOOP_VALID');
  const t = planLeadAware([rect(0, 0, 6, 4)], 0.2, { entry: { at: { x: -0.06, y: 0.6 } }, leadSpacing: 0.05, budget: { toEntry_m: 6, drop_m: 0.4 }, maxIter: 1, roomSearch: { kMax: 4, timeLimit_ms: 1 } });
  assert.equal(t.status, 'SEARCH_NOT_EXHAUSTIVE');
});
