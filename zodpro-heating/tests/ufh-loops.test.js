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

const SET = ['LP1', 'LP2', 'LP3', 'LP3b', 'LP4', 'LP5', 'LP6'];
test('validateLoopLength: 60.000 m VALID, 60.001 / 60.0001 m INVALID — no rounding', () => {
  const L = (h, a, b) => validateLoopLength({ heatingLength: h, supplyLength: a, returnLength: b }, 0.2);
  assert.equal(L(54, 3, 3).status, 'LOOP_VALID');
  assert.equal(L(54, 3, 3.1).status, 'LOOP_INVALID');
  assert.deepEqual(L(54, 3, 3.1).failed, ['totalLength']);
  assert.equal(L(59.999999, 0, 0).status, 'LOOP_VALID');
  assert.equal(L(60.0001, 0, 0).status, 'LOOP_INVALID');
  assert.equal(L(57, 1.5, 1.501).status, 'LOOP_INVALID'); // 60.001
  assert.equal(lengthOk(60), true);
  assert.equal(lengthOk(60.000001), false);
  // floating point sums of exactly 60
  assert.equal(L(0.1 + 0.2 + 59.7, 0, 0).status, 'LOOP_VALID');
});

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

test('loops LP3 / LP3b: the 60 m budget is planned with the leads; a loop over 60 m is never accepted', () => {
  const r = run('LP3b');
  const raw = r.res.regions[0].spiral;
  // the raw spiral (closed centre) with its own leads is over 60 m …
  const m = CASES.LP3b.manifold.at;
  const lead = (p) => Math.abs(p.x - m.x) + Math.abs(p.y - m.y);
  assert.ok(raw.heatingLength < MAX_LOOP_M);
  assert.ok(raw.heatingLength + raw.leadIn + raw.leadOut + lead(raw.supply) + lead(raw.ret) > MAX_LOOP_M);
  // … the one loop laid is a shorter valid spiral of the room, ≤ 60 m with its leads
  assert.equal(r.plan.loops.length, 1);
  assert.ok(r.plan.loops[0].totalLength <= MAX_LOOP_M);
  const r3 = run('LP3');
  assert.ok(r3.res.regions[0].spiral.heatingLength > MAX_LOOP_M);
  assert.equal(r3.plan.loops.length, 2);
});
