// Shared checks of the loop planner tests (step 6).
import assert from 'node:assert/strict';
import { runLoops, run101 } from '../../tools/ufh-loops-debug.mjs';
import { tightBends } from '../../src/engines/ufh/debug.js';
import { MAX_LOOP_M, RMIN_CHECK, SPACING_TOL, MAX_LARGEST_GAP, ENGINEERING_FINAL_COVERAGE, LOOP_LOW_MARGIN_M } from '../../src/engines/ufh/criteria.js';

const memo = new Map();
export const run = (name) => {
  if (!memo.has(name)) memo.set(name, name === '101' ? run101() : runLoops(name));
  return memo.get(name);
};

/** Every loop: ≤ 60 m exactly, a spiral, hard geometry; the loop set: spacing, coverage, no patch. */
export function checkPlan(name, plan, s) {
  for (const l of plan.loops) {
    assert.equal(l.kind, 'LOOP');
    assert.equal(l.status, 'LOOP_VALID', `${name} ${l.loopId}: ${l.failed}`);
    assert.ok(l.totalLength <= MAX_LOOP_M, `${name} ${l.loopId}: ${l.totalLength}`);
    assert.ok(Math.abs(l.totalLength - (l.heatingLength + l.supplyLength + l.returnLength)) < 1e-9);
    assert.ok(Math.abs(l.remainingBudget - (MAX_LOOP_M - l.totalLength)) < 1e-9);
    assert.equal(l.exceeds60, false);
    // the leads are estimated (step 7 routes them): flagged, the margin kept, a low one warned
    assert.equal(l.estimatedLead, true);
    assert.ok(Math.abs(l.remainingMargin - (MAX_LOOP_M - l.totalLength)) < 1e-9);
    assert.equal(l.lowMargin, l.remainingMargin < LOOP_LOW_MARGIN_M);
    // the loop is a spiral (never a cut piece of one): RAW_SPIRAL geometry, start / end on the wall
    assert.equal(l.spiral.kind, 'RAW_SPIRAL');
    assert.ok(['side', 'hairpin'].includes(l.spiral.centre));
    assert.deepEqual(l.startPoint, l.spiral.supply);
    assert.deepEqual(l.endPoint, l.spiral.ret);
    assert.equal(l.nominalSpacing, s);
    assert.equal(tightBends(l.spiral.path, RMIN_CHECK).length, 0, `${name} ${l.loopId}: bend < RMIN`);
  }
  // the lower bound never exceeds the chosen count
  for (const g of plan.regions) if (g.lowerBound) assert.ok(g.lowerBound.FINAL_LOWER_BOUND <= g.chosenLoops, `${name} ${g.label}: bound ${g.lowerBound.FINAL_LOWER_BOUND} > ${g.chosenLoops}`);
  const c = plan.check;
  for (const k of ['spacing', 'residualSpacing', 'bends', 'noCrossing', 'inside', 'exitsOnWall', 'noOverlap', 'noGap', 'regionsInside']) assert.ok(c.checks[k], `${name}: loop set ${k}`);
  assert.ok(c.minSpacing >= s - SPACING_TOL);
  // coverage = heating pipe only (the leads are not in it), no patch hidden by the split
  assert.ok(c.largestHole_m2 <= MAX_LARGEST_GAP, `${name}: patch ${c.largestHole_m2}`);
  assert.ok(c.coverage >= ENGINEERING_FINAL_COVERAGE, `${name}: coverage ${c.coverage}`);
}

