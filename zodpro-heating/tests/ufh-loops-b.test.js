// UFH Coverage Router, step 6: LOOP_PLANNER — RAW_SPIRAL → hydraulic LOOPs ≤ 60 m (supply + heating
// + return), every loop its own continuous two-path spiral; physical manifold outlets only.
// (split over three files so that node --test runs them in parallel)
import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES } from '../tools/ufh-loops-debug.mjs';
import { validateLoopLength, lengthOk } from '../src/engines/ufh/loopplanner.js';
import { run, checkPlan } from './helpers/loops.js';
import { MAX_LOOP_M, RMIN_CHECK, SPACING_TOL, OBSTACLE_CLEARANCE } from '../src/engines/ufh/criteria.js';
import * as G from '../src/engines/ufh/geom.js';

const SET = ['LP7', 'LP8', 'LP9'];
const EXPECT = Object.fromEntries(Object.entries({
  LP1: { loops: 1 },
  LP2: { loops: 1 },
  LP3: { loops: 2 }, // 63.5 m raw
  LP3b: { loops: 1 }, // 59.4 m raw + leads > 60, but a shorter valid variant of the spiral fits
  LP4: { loops: 2 },
  LP5: { loops: 2 },
  LP6: { loops: 3 },
  LP7: { min: 4 },
  LP8: { min: 6 },
  LP9: { loops: 2 }, // 50 m raw, but 7 m away from the manifold
  LP11: { min: 2 },
  LP12: { min: 3 },
}).filter(([k]) => SET.includes(k)));
for (const [name, e] of Object.entries(EXPECT))
  test(`loops ${name}: ${CASES[name].note} — ${e.loops ?? '≥ ' + e.min} loop(s), each ≤ 60 m, each a spiral`, () => {
    const r = run(name);
    checkPlan(name, r.plan, r.c.s);
    assert.equal(r.plan.rawGeometryStatus, 'RAW_GEOMETRY_VALID');
    assert.equal(r.plan.status, 'HYDRAULIC_LOOP_VALID', r.plan.reasons.join(','));
    if (e.loops) assert.equal(r.plan.loops.length, e.loops);
    else assert.ok(r.plan.loops.length >= e.min);
    // the lower bound: the loops carry the whole pipe — never fewer than ⌈Σ total / 60⌉
    const sum = r.plan.loops.reduce((a, l) => a + l.totalLength, 0);
    assert.ok(r.plan.loops.length >= Math.ceil(sum / MAX_LOOP_M - 1e-9));
  });

test('loops LP9: long leads shrink the heating budget — more loops for the same floor', () => {
  assert.equal(run('LP1').plan.loops.length, 1);
  const r = run('LP9');
  assert.equal(r.plan.loops.length, 2);
  for (const l of r.plan.loops) assert.ok(l.heatingLength <= MAX_LOOP_M - l.supplyLength - l.returnLength);
});

test('loops LP10: 4 loops, 3 physical outlets — HYDRAULIC_LOOP_INVALID (outlet_shortage), no virtual outlets', () => {
  const r = run('LP10');
  checkPlan('LP10', r.plan, r.c.s);
  assert.equal(r.plan.availableOutlets, 3);
  assert.ok(r.plan.requiredLoops > 3);
  assert.equal(r.plan.rawGeometryStatus, 'RAW_GEOMETRY_VALID');
  assert.equal(r.plan.status, 'HYDRAULIC_LOOP_INVALID');
  assert.deepEqual(r.plan.reasons, ['outlet_shortage']);
});
