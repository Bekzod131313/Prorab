// UFH Coverage Router, step 5: CENTER CLOSURE + RESIDUAL SPACING OPTIMIZER. Geometry only — raw
// spirals, no loops, no manifold. The nominal spacing s is kept by the whole spiral; only its
// terminal part (innermost ring, hairpin legs, centre turn) may close the rest at a residual
// spacing ≥ MIN_RESIDUAL_CLOSURE_SPACING. Never a serpentine, never s reduced everywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/engines/ufh/geom.js';
import { runCase } from '../tools/ufh-regions-debug.mjs';
import { tightBends, selfCrossings } from '../src/engines/ufh/debug.js';
import { KNOWN_LIMITATIONS, MAX_RESIDUAL_RINGS, MIN_RESIDUAL_CLOSURE_SPACING, RMIN_CHECK, SPACING_TOL, GEOMETRY_TEST_MAX_HOLE } from '../src/engines/ufh/criteria.js';

const kl = (name) => KNOWN_LIMITATIONS.find((k) => k.case === name);

/** Hard checks of a closed zone + nominal / residual bookkeeping. */
function checkClosed(name, r) {
  const { res, chk, c } = r;
  for (const k of ['spacing', 'residualSpacing', 'bends', 'noCrossing', 'inside', 'exitsOnWall', 'noOverlap', 'noGap', 'regionsInside']) assert.ok(chk.checks[k], `${name}: ${k}`);
  assert.ok(chk.minSpacing >= c.s - SPACING_TOL, `${name}: nominal spacing ${chk.minSpacing}`);
  for (const x of res.regions) {
    if (!x.spiral) continue;
    assert.equal(x.spiral.kind, 'RAW_SPIRAL');
    assert.ok(['side', 'hairpin'].includes(x.spiral.centre));
    // the nominal spacing is never rewritten by a residual
    assert.equal(x.stats.nominalSpacing, c.s);
    assert.equal(tightBends(x.spiral.path, RMIN_CHECK).length, 0, `${name}: bend < RMIN`);
    assert.equal(selfCrossings(x.spiral.path), 0);
    assert.ok(Math.abs(x.stats.heatingPipeLength_m - x.spiral.heatingLength) < 1e-9);
    if (x.stats.residualSpacing) {
      const rs = x.stats.residualSpacing;
      assert.ok(rs >= MIN_RESIDUAL_CLOSURE_SPACING - 1e-9 && rs < c.s, `${name}: residual ${rs}`);
      // terminal only: at most MAX_RESIDUAL_RINGS residual rings, the closure stretch is a part of the pipe
      const R = x.spiral.residual;
      assert.ok(R.rings <= MAX_RESIDUAL_RINGS);
      const pts = G.densify(G.subPath(x.spiral.path, R.terminal[0], R.terminal[1]), 0.05);
      const outline = [{ outer: x.spiral.region, holes: [] }];
      if (R.side) {
        // a SIDE closure (Phase 6 reopen, the reference): the terminal stretch is the final pass —
        // the return's last lap, s/2 + ρ from the outline on side X, s/2 + s elsewhere — at the end
        // of the pipe; the residual pair is the outermost one on that side
        const near = pts.filter((q) => G.distToRegionBoundary(q, outline) <= c.s / 2 + c.s + 0.01).length;
        assert.ok(near / pts.length >= 0.8, `${name}: side closure stretch not the final pass (${near}/${pts.length})`);
        assert.ok(R.terminal[1] >= G.pathLength(x.spiral.path) - x.spiral.leadOut - 1e-6, `${name}: the side closure ends the pipe`);
      } else {
        // terminal = inside the last nominal ring: the closure stretch lies deeper than ring n−1
        // (apart from the short transitions onto it)
        const lastNominal = c.s / 2 + (R.n - 1) * c.s;
        const deep = pts.filter((q) => G.distToRegionBoundary(q, outline) >= lastNominal - 0.01).length;
        assert.ok(deep / pts.length >= 0.8, `${name}: residual stretch not terminal (${deep}/${pts.length})`);
      }
      assert.ok(R.minMeasured >= MIN_RESIDUAL_CLOSURE_SPACING - SPACING_TOL);
    }
  }
  if (chk.residualSpacings.length) assert.ok(chk.minResidualSpacing >= MIN_RESIDUAL_CLOSURE_SPACING - SPACING_TOL);
}

// C1–C9: the closure never makes the largest patch worse; where the old centre left a patch it closes it
const CASES = { C1: true, C2: true, C3: true, C4: false, C5: true, C6: true, C7: true, C8: false, C9: true };
for (const [name, gain] of Object.entries(CASES))
  test(`closure ${name}: ${gain ? 'centre gap closed' : 'nothing to gain — spiral kept'}, every hard check holds`, () => {
    const old = runCase(name, { closure: false });
    const r = runCase(name);
    checkClosed(name, r);
    assert.equal(r.chk.status, 'RAW_GEOMETRY_VALID');
    assert.equal(r.res.regions.length, old.res.regions.length, 'the closure does not change the regions');
    assert.ok(r.chk.largestHole_m2 <= old.chk.largestHole_m2 + 0.005, `${name}: patch ${old.chk.largestHole_m2} → ${r.chk.largestHole_m2}`);
    assert.ok(r.chk.largestHole_m2 <= GEOMETRY_TEST_MAX_HOLE);
    if (gain) assert.ok(r.res.regions.some((x) => x.stats.closure?.changed), `${name}: no region closed`);
    else assert.ok(r.chk.coverage >= old.chk.coverage - 1e-9);
  });

test('closure regression: 3.5 × 3.5 @ 200 / 150 — the old centre gaps (0.20 / 0.27 m²) are closed', () => {
  for (const [name, gap] of [
    ['C1', 0.2],
    ['C2', 0.27],
  ]) {
    const old = runCase(name, { closure: false });
    assert.ok(Math.abs(old.chk.largestHole_m2 - gap) < 0.01, `${name} before: ${old.chk.largestHole_m2}`);
    const r = runCase(name);
    assert.ok(r.chk.largestHole_m2 < 0.01, `${name} after: ${r.chk.largestHole_m2}`);
    assert.ok(r.chk.coverage > old.chk.coverage);
  }
});

test('closure regression: 5 × 5 and 6 × 4 @ 200 / 150 — never worse', () => {
  for (const name of ['C3', 'C3b', 'C4', 'C4b']) {
    const old = runCase(name, { closure: false });
    const r = runCase(name);
    checkClosed(name, r);
    assert.ok(r.chk.largestHole_m2 <= old.chk.largestHole_m2 + 0.005);
    assert.ok(r.chk.coverage >= old.chk.coverage - 0.002, `${name}: ${old.chk.coverage} → ${r.chk.coverage}`);
  }
});

test('residual examples: 200 + 150 (C3), 200 + 170 (C1) — the residual only at the centre', () => {
  const a = runCase('C3').res.regions[0];
  assert.equal(a.stats.nominalSpacing, 0.2);
  assert.equal(a.stats.residualSpacing, 0.15);
  const b = runCase('C1').res.regions[0];
  assert.equal(b.stats.residualSpacing, 0.17);
});

test('closure C7 / C9: round obstacles — the closure keeps the obstacle clearance and gains', () => {
  for (const name of ['C7', 'C9']) {
    const old = runCase(name, { closure: false });
    const r = runCase(name);
    checkClosed(name, r);
    assert.ok(r.obstacleClear >= 0.2 + r.c.s / 2 - SPACING_TOL);
    assert.ok(r.chk.largestHole_m2 <= old.chk.largestHole_m2 + 0.005);
  }
  assert.ok(runCase('C7').chk.coverage > runCase('C7', { closure: false }).chk.coverage + 0.05);
});

test('closure C10: impossible (residual would need R < RMIN) — nothing forced, the thin strip stays uncovered and visible', () => {
  const k = kl('C10');
  assert.ok(k);
  const old = runCase('C10', { closure: false });
  const r = runCase('C10');
  checkClosed('C10', r);
  const x = r.res.regions[0];
  assert.ok(x.stats.closure.tried > 0, 'the closure was tried');
  // the CENTRE closure stays impossible (R < RMIN): no centre residual is forced; since the Phase 6
  // reopen the SIDE closure (the reference: the final pass along the side strip) is valid here and
  // used — every hard check holds (checkClosed), never less coverage, the strip still reported
  assert.ok(!x.spiral.residual || x.spiral.residual.side, 'no centre residual forced');
  if (x.spiral.residual) assert.ok(x.stats.residualSpacing >= MIN_RESIDUAL_CLOSURE_SPACING - 1e-9);
  assert.ok(r.chk.coverage >= old.chk.coverage - 1e-9);
  assert.ok(r.chk.uncovered_m2 > 0.1, 'the strip is reported uncovered');
});
