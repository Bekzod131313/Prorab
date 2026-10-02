// UFH Coverage Router, step 2: spiral region decomposition (L-shapes). Geometry tests only — the
// final engineering validation (loops ≤ 60 m, manifold) comes with the later phases.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/engines/ufh/geom.js';
import { runCase } from '../tools/ufh-regions-debug.mjs';
import { GEOMETRY_TEST_COVERAGE_REGIONS, GEOMETRY_TEST_MAX_HOLE, KNOWN_LIMITATIONS, MAX_LOOP_M } from '../src/engines/ufh/criteria.js';

const RMIN = 0.068;

/** The checks every case must pass: spirals only, valid geometry, ends on an outer wall. */
function checkGeometry(name, r) {
  const { c, U, res } = r;
  assert.equal(res.kind, 'RAW_SPIRAL_SET');
  for (const x of res.regions) {
    if (x.status !== 'VALID') {
      // an invalid region gets no pipe at all (never another pattern)
      assert.equal(x.spiral, undefined, `${name}: pipe drawn in an invalid region`);
      continue;
    }
    assert.equal(x.spiral.kind, 'RAW_SPIRAL');
    assert.ok(['side', 'hairpin'].includes(x.spiral.centre));
    // both ends leave through an outer wall
    const outer = U.map((sh) => ({ outer: sh.outer, holes: [] }));
    for (const q of [x.spiral.supply, x.spiral.ret]) assert.ok(G.distToRegionBoundary(q, outer) < 1e-6, `${name}: end not on an outer wall`);
  }
  assert.ok(r.minGap >= c.s - 0.002, `${name}: spacing ${r.minGap}`);
  assert.equal(r.bends.length, 0, `${name}: bend < ${RMIN}`);
  assert.equal(r.crossings, 0, `${name}: crossing`);
  assert.ok(r.inside, `${name}: pipe outside the usable area`);
}

for (const name of ['L1', 'L2', 'L3', 'L3b', 'L4a', 'L5'])
  test(`regions ${name}: every region its own valid spiral, s kept across cuts, covered`, () => {
    const r = runCase(name);
    checkGeometry(name, r);
    assert.ok(r.res.ok, `${name}: invalid region`);
    assert.ok(r.cov.ratio >= GEOMETRY_TEST_COVERAGE_REGIONS, `${name}: coverage ${r.cov.ratio}`);
    const kl = KNOWN_LIMITATIONS.find((k) => k.case === name);
    const hole = r.cov.largestHole;
    if (kl) assert.ok(hole <= kl.centreGap_m2 + 0.005, `${kl.id}: ${hole}`);
    else assert.ok(hole <= GEOMETRY_TEST_MAX_HOLE, `${name}: hole ${hole}`);
  });

test('regions L4b: a corridor too narrow for a spiral is an INVALID REGION (no other pipe pattern)', () => {
  const r = runCase('L4b');
  checkGeometry('L4b', r);
  assert.equal(r.res.ok, false);
  const bad = r.res.regions.filter((x) => x.status === 'INVALID_REGION');
  assert.equal(bad.length, 1);
  assert.ok(Math.min(...bad[0].poly.map((p) => p.x)) < 1, 'the corridor is the invalid region');
});

test('regions L6 / L7: raw spirals longer than a loop are flagged for the loop planner, not loops', () => {
  for (const name of ['L6', 'L7']) {
    const r = runCase(name);
    checkGeometry(name, r);
    assert.ok(r.res.ok);
    const long = r.res.regions.filter((x) => x.stats.exceeds60);
    assert.ok(long.length >= 1, `${name}: no raw spiral over ${MAX_LOOP_M} m`);
    for (const x of long) assert.ok(x.stats.rawSpiral_m > MAX_LOOP_M);
    // nothing here is a heating loop yet
    assert.ok(r.res.regions.every((x) => x.spiral.kind === 'RAW_SPIRAL'));
  }
});
