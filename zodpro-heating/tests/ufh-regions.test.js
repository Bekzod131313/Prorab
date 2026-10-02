// UFH Coverage Router, steps 2–3: MINIMUM VALID SPIRAL REGIONS for L / U shapes. Geometry only —
// regions are not loops; the final engineering validation (loops ≤ 60 m, manifold) comes later.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/engines/ufh/geom.js';
import { runCase } from '../tools/ufh-regions-debug.mjs';
import { GEOMETRY_TEST_COVERAGE_MULTI_REGION, GEOMETRY_TEST_MAX_HOLE, KNOWN_LIMITATIONS, MAX_LOOP_M } from '../src/engines/ufh/criteria.js';

const kl = (name) => KNOWN_LIMITATIONS.find((k) => k.case === name);

/** Every case: spirals only, global geometry valid, regions = usable area exactly, ends on walls. */
function checkGeometry(name, r) {
  const { res, chk } = r;
  assert.equal(res.kind, 'RAW_SPIRAL_SET');
  for (const x of res.regions) {
    assert.match(x.label, /^R\d+$/);
    if (x.status !== 'VALID') {
      assert.equal(x.spiral, undefined, `${name}: pipe drawn in an invalid region`);
      continue;
    }
    assert.equal(x.spiral.kind, 'RAW_SPIRAL'); // a region is not a loop
    assert.equal(x.loops, undefined);
    assert.ok(['side', 'hairpin'].includes(x.spiral.centre));
  }
  // regions: union = usable heating area, no gap, no overlap
  assert.ok(chk.gap_m2 < 1e-4, `${name}: region gap ${chk.gap_m2}`);
  assert.ok(chk.overlap_m2 < 1e-6, `${name}: overlap ${chk.overlap_m2}`);
  assert.ok(Math.abs(chk.regionUnion_m2 - chk.usable_m2) < 1e-4);
  // global pipe checks (across region cuts too)
  for (const k of ['spacing', 'bends', 'noCrossing', 'inside', 'exitsOnWall', 'noOverlap', 'noGap', 'regionsInside']) assert.ok(chk.checks[k], `${name}: ${k}`);
}

const VALID = ['L1', 'L2', 'L3', 'L3b', 'L4a', 'L5', 'U1', 'U1c', 'U2', 'U4', 'U5'];
for (const name of VALID)
  test(`regions ${name}: RAW GEOMETRY VALID — each region its own spiral, s kept across cuts`, () => {
    const r = runCase(name);
    checkGeometry(name, r);
    assert.equal(r.chk.status, 'RAW_GEOMETRY_VALID', JSON.stringify(r.chk.checks));
    assert.ok(r.res.ok);
    assert.ok(r.chk.largestHole_m2 <= GEOMETRY_TEST_MAX_HOLE, `${name}: hole ${r.chk.largestHole_m2}`);
    // the geometry self-check (multi-region) — named, not hidden
    if (r.res.acceptable) assert.ok(r.chk.coverage >= GEOMETRY_TEST_COVERAGE_MULTI_REGION - 1e-3, `${name}: ${r.chk.coverage}`);
  });

for (const name of ['L4b', 'U4b', 'U9'])
  test(`regions ${name}: an invalid region makes the zone INVALID (no other pipe pattern) — known limitation`, () => {
    const r = runCase(name);
    checkGeometry(name, r);
    assert.ok(kl(name), 'recorded as a known limitation');
    assert.equal(r.res.ok, false);
    assert.equal(r.chk.status, 'INVALID_ZONE');
    assert.equal(r.chk.checks.regionsValid, false);
    assert.ok(r.res.regions.some((x) => x.status === 'INVALID_REGION'));
    assert.equal(r.chk.loopPlannerRequired, false);
  });

test('regions U3: obstacle in the open floor — valid spirals, centre gap over the limit stays visible (known limitation)', () => {
  const r = runCase('U3');
  checkGeometry('U3', r);
  assert.ok(r.res.ok, 'every region a valid spiral');
  const k = kl('U3');
  assert.ok(k);
  assert.ok(r.chk.largestHole_m2 <= k.centreGap_m2 + 0.005, `grew: ${r.chk.largestHole_m2}`);
  // the zone is not reported valid while the gap is over the limit
  assert.equal(r.chk.status, r.chk.largestHole_m2 > 0.5 ? 'INVALID_ZONE' : 'RAW_GEOMETRY_VALID');
});

test('regions L6 / L7 / U6: raw spirals over 60 m are flagged, the zone needs the loop planner — no loops yet', () => {
  for (const name of ['L6', 'L7', 'U6']) {
    const r = runCase(name);
    checkGeometry(name, r);
    assert.equal(r.chk.status, 'RAW_GEOMETRY_VALID');
    assert.equal(r.chk.loopPlannerRequired, true);
    const long = r.res.regions.filter((x) => x.stats.exceeds60);
    assert.ok(long.length >= 1);
    for (const x of long) assert.ok(x.stats.rawSpiral_m > MAX_LOOP_M && x.stats.estimatedLoops >= 2);
  }
});

test('regions U10 / U7: the minimum region count with an acceptable split is chosen', () => {
  const r = runCase('U1');
  const k = r.res.regions.length;
  assert.equal(k, 3); // a U needs three rectangles
  const ok = r.res.evaluated.filter((t) => t.ok);
  assert.ok(ok.length >= 2, 'several valid decompositions'); // U7
  assert.ok(ok.every((t) => t.regions >= k), 'an acceptable split with fewer regions was skipped'); // U10
});

test('regions U8: splits that fail (narrow / shut-in / invalid regions) are rejected, a valid one is used', () => {
  const r = runCase('U8');
  checkGeometry('U8', r);
  assert.ok(r.res.evaluated.some((t) => t.rejected || t.invalid), 'no failing split seen');
  assert.equal(r.chk.status, 'RAW_GEOMETRY_VALID');
});

test('regions: fewer regions win over a little more coverage (C before B unless C breaks the limits)', () => {
  const r = runCase('U5');
  const k = r.res.regions.length;
  // a valid split with more regions and (slightly) more coverage exists — it is not taken
  const more = r.res.evaluated.filter((t) => !t.invalid && !t.rejected && t.regions > k && t.coverage > r.chk.coverage);
  assert.ok(more.length >= 1);
  assert.ok(r.chk.largestHole_m2 <= GEOMETRY_TEST_MAX_HOLE);
});
