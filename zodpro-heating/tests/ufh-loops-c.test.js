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

const SET = ['LP11', 'LP12'];
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

test('loops LP11: cuts leaving strips too narrow for R ≥ RMIN are rejected — no sharp bend to fit 60 m', () => {
  const r = run('LP11');
  const tried = r.plan.regions[0].tried;
  assert.ok(tried.length > 0);
  for (const l of r.plan.loops) assert.ok(G.minBendRadius(l.spiral.path).radius >= RMIN_CHECK);
});

test('loops LP12: loops round / beside the column keep the obstacle clearance', () => {
  const r = run('LP12');
  let d = Infinity;
  for (const l of r.plan.loops) for (const q of G.densify(G.simplifyPath(l.spiral.heating, 0.0005), 0.02)) for (const ob of r.obstacles) d = Math.min(d, G.pointInRegion(q, [ob]) ? 0 : G.distToRegionBoundary(q, [ob]));
  assert.ok(d >= OBSTACLE_CLEARANCE + r.c.s / 2 - SPACING_TOL, `clearance ${d}`);
});

test('101–109 regression: rooms 101 / 107 / 108 need more loops than C-01 has outlets — HYDRAULIC_LOOP_INVALID, raw geometry valid', () => {
  const r = run('101');
  assert.equal(r.availableOutlets, 6); // physical — not the 12 virtual ports offered before
  assert.equal(r.rawGeometryStatus, 'RAW_GEOMETRY_VALID');
  const by = Object.fromEntries(r.rooms.map((x) => [x.name, x]));
  assert.ok(by['101'].plan.loops.length >= 3);
  assert.ok(by['107'].plan.loops.length >= 3);
  assert.ok(by['108'].plan.loops.length >= 1);
  for (const x of r.rooms) checkPlan(x.name, x.plan, 0.2);
  assert.ok(r.requiredLoops > r.availableOutlets);
  assert.equal(r.status, 'HYDRAULIC_LOOP_INVALID');
  assert.ok(r.reasons.includes('outlet_shortage'));
});
