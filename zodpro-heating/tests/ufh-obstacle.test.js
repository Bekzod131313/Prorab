// UFH Coverage Router, step 4: OBSTACLE-AROUND SPIRAL. Geometry only — regions are not loops.
// A region round an obstacle is one bifilar spiral whose rings follow the exclusion (obstacle +
// clearance) round; one beside it follows the notch. Never another pipe pattern.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/engines/ufh/geom.js';
import { runCase } from '../tools/ufh-regions-debug.mjs';
import { obstacleSpiral, seamSpiral, ringsOf } from '../src/engines/ufh/obstaclespiral.js';
import { spiralRegion } from '../src/engines/ufh/spiralgen.js';
import { tightBends, selfCrossings } from '../src/engines/ufh/debug.js';
import { GEOMETRY_TEST_COVERAGE_OBSTACLE_REGION, GEOMETRY_TEST_MAX_HOLE, KNOWN_LIMITATIONS, OBSTACLE_CLEARANCE, RMIN_CHECK, SPACING_TOL } from '../src/engines/ufh/criteria.js';

const kl = (name) => KNOWN_LIMITATIONS.find((k) => k.case === name);
const box = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Every check of one case (whatever its status): spirals only, s, R, no crossing, clearances. */
function checkCase(name, r) {
  const { res, chk, exclusions, obstacleClear, c } = r;
  for (const x of res.regions) {
    if (x.status !== 'VALID') {
      assert.equal(x.spiral, undefined, `${name}: pipe drawn in an invalid region`);
      continue;
    }
    assert.equal(x.spiral.kind, 'RAW_SPIRAL');
    assert.ok(['side', 'hairpin'].includes(x.spiral.centre));
    // no pipe inside an exclusion (obstacle + clearance)
    for (const q of G.densify(G.simplifyPath(x.spiral.path, 0.0005), 0.02)) assert.ok(!G.pointInRegion(q, exclusions), `${name}: pipe in the exclusion`);
    // no sharp corner anywhere, round the obstacle neither
    assert.equal(tightBends(x.spiral.path, RMIN_CHECK).length, 0, `${name}: bend < RMIN`);
    assert.equal(selfCrossings(x.spiral.path), 0);
  }
  assert.ok(chk.gap_m2 < 1e-4 && chk.overlap_m2 < 1e-6 && Math.abs(chk.regionUnion_m2 - chk.usable_m2) < 1e-4, `${name}: regions ≠ usable area`);
  for (const k of ['spacing', 'residualSpacing', 'bends', 'noCrossing', 'inside', 'exitsOnWall', 'noOverlap', 'noGap', 'regionsInside']) assert.ok(chk.checks[k], `${name}: ${k}`);
  assert.ok(chk.minSpacing >= c.s - SPACING_TOL);
  // the pipe keeps the obstacle clearance + half a pitch (it is laid outside the exclusion at ≥ s/2)
  assert.ok(obstacleClear >= OBSTACLE_CLEARANCE + c.s / 2 - SPACING_TOL, `${name}: obstacle clearance ${obstacleClear}`);
}

// O1–O9 (and the regressions): one spiral round the obstacle wherever it fits
const SINGLE = ['O1', 'O2', 'O3', 'O4', 'O5', 'O6'];
for (const name of SINGLE)
  test(`obstacle ${name}: ONE spiral round the obstacle(s) — RAW GEOMETRY VALID`, () => {
    const r = runCase(name);
    checkCase(name, r);
    assert.equal(r.res.regions.length, 1, `${name}: ${r.res.regions.length} regions`);
    const x = r.res.regions[0];
    assert.equal(x.status, 'VALID');
    assert.ok(x.stats.obstacle && x.stats.obstacle.wraps >= 1, 'not wrapped round the obstacle');
    assert.equal(x.stats.obstacle.seams.length, x.stats.obstacle.wraps, 'one seam per obstacle');
    assert.equal(r.chk.status, 'RAW_GEOMETRY_VALID', JSON.stringify(r.chk.checks));
    assert.ok(r.chk.coverage >= GEOMETRY_TEST_COVERAGE_OBSTACLE_REGION - 1e-3, `${name}: ${r.chk.coverage}`);
    assert.ok(r.chk.largestHole_m2 <= GEOMETRY_TEST_MAX_HOLE);
  });

test('obstacle O2 / O3 / O4: 0.6 / 0.8 / 1.0 m gaps — the rings that fit pass, the others end there (no squeezing)', () => {
  for (const name of ['O2', 'O3', 'O4']) {
    const r = runCase(name);
    checkCase(name, r);
    assert.equal(r.chk.status, 'RAW_GEOMETRY_VALID');
    // the gap holds pipes s apart: never closer (no spacing reduced to fit)
    assert.ok(r.chk.minSpacing >= 0.2 - SPACING_TOL);
  }
});

for (const name of ['O7', 'O8'])
  test(`obstacle ${name}: L / U with a column — minimum regions, the column wrapped or notched, valid`, () => {
    const r = runCase(name);
    checkCase(name, r);
    assert.equal(r.chk.status, 'RAW_GEOMETRY_VALID');
    assert.ok(r.res.regions.some((x) => x.stats?.obstacle));
    assert.ok(r.res.acceptable);
    // no acceptable split with fewer regions was skipped
    assert.ok(r.res.evaluated.every((t) => !t.ok || t.regions >= r.res.regions.length));
  });

test('obstacle O9: 0.3 m corridor between column and wall — no pipe squeezed in, the strip stays visible as uncovered', () => {
  const r = runCase('O9');
  checkCase('O9', r);
  assert.ok(kl('O9'));
  assert.equal(r.chk.status, 'RAW_GEOMETRY_VALID');
  assert.ok(r.chk.largestHole_m2 <= kl('O9').uncovered_m2 + 0.01, `grew: ${r.chk.largestHole_m2}`);
  assert.ok(r.chk.holes.some((h) => h.area > 0.3), 'the corridor is reported uncovered');
});

test('obstacle O10: column on the spiral centre — step 4 alone under the limit (78 %); with the centre closure (step 5) valid', () => {
  const before = runCase('O10', { closure: false });
  checkCase('O10', before);
  assert.equal(before.chk.status, 'INVALID_ZONE');
  assert.equal(before.chk.checks.coverage, false);
  const r = runCase('O10');
  checkCase('O10', r);
  assert.equal(kl('O10'), undefined, 'no longer a known limitation');
  assert.equal(r.chk.status, 'RAW_GEOMETRY_VALID');
  assert.ok(r.chk.coverage > before.chk.coverage);
});

test('obstacle L3b / U9 regressions: fewer regions than step 3, still valid', () => {
  const a = runCase('L3b');
  checkCase('L3b', a);
  assert.ok(a.res.regions.length < 5, `L3b: ${a.res.regions.length}`);
  assert.equal(a.chk.status, 'RAW_GEOMETRY_VALID');
  const b = runCase('U9');
  checkCase('U9', b);
  assert.equal(b.chk.status, 'RAW_GEOMETRY_VALID');
});

test('seam spiral without seams on a rectangle: the convex generator\'s rings, at least as much pipe', () => {
  const R = box(0.2, 0.2, 4.8, 4.8);
  const a = spiralRegion(R, 0.2, { start: 0 });
  const b = seamSpiral(R, 0.2, { start: 0, rings: ringsOf(R, 0.2) });
  assert.ok(a.ok && b.ok);
  assert.equal(b.rings, a.rings);
  // (it may also use an odd ring count — the innermost lap on the supply arm)
  assert.ok(b.usedRings >= a.usedRings && b.heatingLength >= a.heatingLength - 0.05, `${a.heatingLength} vs ${b.heatingLength}`);
  assert.equal(tightBends(b.path, RMIN_CHECK).length, 0);
});

test('obstacle spiral: a corner without room for R is never shrunk — the variant is dropped', () => {
  // exclusion 0.1 m from the region side: no ring fits there; whatever is returned keeps r
  const sp = obstacleSpiral({ outer: box(0.2, 0.2, 3.8, 3.8), holes: [box(0.3, 1.5, 1.3, 2.5)] }, 0.2, {});
  if (sp.ok) assert.equal(tightBends(sp.path, RMIN_CHECK).length, 0);
  else assert.ok(['no_valid_spiral', 'no_seam'].includes(sp.reason));
});
