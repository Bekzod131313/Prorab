// UFH Coverage Router, steps 2–3: MINIMUM VALID SPIRAL REGIONS for L / U shapes. Geometry only —
// regions are not loops; the final engineering validation (loops ≤ 60 m, manifold) comes later.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/engines/ufh/geom.js';
import { runCase } from '../tools/ufh-regions-debug.mjs';
import { GEOMETRY_TEST_COVERAGE_MULTI_REGION, GEOMETRY_TEST_COVERAGE_OBSTACLE_REGION, GEOMETRY_TEST_MAX_HOLE, KNOWN_LIMITATIONS, MAX_LOOP_M } from '../src/engines/ufh/criteria.js';

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
    // never another pipe pattern: a region round / beside an obstacle is a spiral too
    if (x.stats.obstacle) assert.ok(x.spiral.seamed, `${name}: obstacle region without its seamed ring path`);
  }
  // regions: union = usable heating area, no gap, no overlap
  assert.ok(chk.gap_m2 < 1e-4, `${name}: region gap ${chk.gap_m2}`);
  assert.ok(chk.overlap_m2 < 1e-6, `${name}: overlap ${chk.overlap_m2}`);
  assert.ok(Math.abs(chk.regionUnion_m2 - chk.usable_m2) < 1e-4);
  // global pipe checks (across region cuts too)
  for (const k of ['spacing', 'residualSpacing', 'bends', 'noCrossing', 'inside', 'exitsOnWall', 'noOverlap', 'noGap', 'regionsInside']) assert.ok(chk.checks[k], `${name}: ${k}`);
}

// (step 4: U3, U9 — invalid in step 3 — are valid with spirals round / beside the column)
const VALID = ['L1', 'L2', 'L3', 'L3b', 'L4a', 'L5', 'U1', 'U1c', 'U2', 'U3', 'U4', 'U5', 'U9'];
for (const name of VALID)
  test(`regions ${name}: RAW GEOMETRY VALID — each region its own spiral, s kept across cuts`, () => {
    const r = runCase(name);
    checkGeometry(name, r);
    assert.equal(r.chk.status, 'RAW_GEOMETRY_VALID', JSON.stringify(r.chk.checks));
    assert.ok(r.res.ok);
    assert.ok(r.chk.largestHole_m2 <= GEOMETRY_TEST_MAX_HOLE, `${name}: hole ${r.chk.largestHole_m2}`);
    // the geometry self-check (multi-region; with a region round / beside an obstacle its own
    // threshold) — named, not hidden
    const min = r.res.regions.some((x) => x.stats?.obstacle) ? Math.min(GEOMETRY_TEST_COVERAGE_MULTI_REGION, GEOMETRY_TEST_COVERAGE_OBSTACLE_REGION) : GEOMETRY_TEST_COVERAGE_MULTI_REGION;
    if (r.res.acceptable) assert.ok(r.chk.coverage >= min - 1e-3, `${name}: ${r.chk.coverage}`);
  });

for (const name of ['L4b', 'U4b'])
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

test('regions U3 / U9: the step-3 limitations are gone — no longer listed as known limitations', () => {
  assert.equal(kl('U3'), undefined);
  assert.equal(kl('U9'), undefined);
  for (const name of ['U3', 'U9']) {
    const r = runCase(name);
    assert.ok(r.res.regions.some((x) => x.stats?.obstacle), `${name}: no region round / beside the column`);
    assert.ok(r.chk.largestHole_m2 <= GEOMETRY_TEST_MAX_HOLE);
  }
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

test('regions U8 / O8: splits that fail (invalid regions, patches over the limit) are passed over, a valid one is used', () => {
  for (const name of ['U8', 'O8']) {
    const r = runCase(name);
    checkGeometry(name, r);
    assert.equal(r.chk.status, 'RAW_GEOMETRY_VALID');
  }
  const r = runCase('O8');
  assert.ok(r.res.evaluated.some((t) => t.invalid || t.hole > GEOMETRY_TEST_MAX_HOLE), 'no failing split seen');
  assert.ok(r.res.evaluated.every((t) => !t.ok || t.regions >= r.res.regions.length));
});

test('regions: fewer regions win over a little more coverage (C before B unless C breaks the limits)', () => {
  // (the region search itself — before the centre closure of step 5 improves the chosen split)
  const r = runCase('U5', { closure: false });
  const k = r.res.regions.length;
  // a valid split with more regions and (slightly) more coverage exists — it is not taken
  const more = r.res.evaluated.filter((t) => !t.invalid && !t.rejected && t.regions > k && t.coverage > r.chk.coverage);
  assert.ok(more.length >= 1);
  assert.ok(r.chk.largestHole_m2 <= GEOMETRY_TEST_MAX_HOLE);
});
