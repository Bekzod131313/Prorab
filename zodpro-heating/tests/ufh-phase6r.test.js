// Phase 6 reopen: LEAD-AWARE spiral / SIDE terminal closure (the project reference). The reference:
// a continuous two-path spiral from the outer contour inward, the terminal closure, the final pass
// over the remaining side strip, then back — never a centre left for the rest width when a side
// closure is valid, never serpentine, the residual spacing only in the terminal closure.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/engines/ufh/geom.js';
import { obstacleSpiral, zonedGap } from '../src/engines/ufh/obstaclespiral.js';
import { closureOrder, withinLimits } from '../src/engines/ufh/closure.js';
import { planLeadAware, NO_VALID_SPIRAL, LEAD_AWARE_VALID } from '../src/engines/ufh/leadaware.js';
import { referenceCheck, PHASE6_REFERENCE_OK } from '../src/engines/ufh/phase6reference.js';
import { MAX_LOOP_M, MIN_RESIDUAL_CLOSURE_SPACING, SPACING_TOL, RMIN_CHECK, ENGINEERING_FINAL_COVERAGE, MAX_LARGEST_GAP, MAX_RESIDUAL_RINGS } from '../src/engines/ufh/criteria.js';
import { planCase, loopMetrics } from '../tools/phase6r-eval.mjs';
import { phase6GeometryHash } from '../tools/ufh-transfer-debug.mjs';

const R = (x0, y0, x1, y1) => [{ outer: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [] }];
const TOWARD = { x: -0.3, y: 0.3 };
const RIGHT = { U: R(0, 0, 2.55, 3.4), s: 0.2, toward: TOWARD }; // rest width across x: 2.55 mod 0.2 = 0.15

// every Phase 6 loop: continuous spiral, coverage, gap, spacing, residual, radius, no crossing, length
function loopValid(l, U, s, tag) {
  const m = loopMetrics({ loops: [l] }, U, s)[0];
  assert.ok(l.spiral.kind === 'RAW_SPIRAL' && ['hairpin', 'side'].includes(l.spiral.centre), `${tag}: a two-path spiral (no serpentine)`);
  assert.ok(m.coverage >= ENGINEERING_FINAL_COVERAGE, `${tag}: coverage ${m.coverage}`);
  assert.ok(m.largestGap_m2 <= MAX_LARGEST_GAP + 1e-9, `${tag}: gap ${m.largestGap_m2}`);
  assert.ok(m.minRadius_m >= RMIN_CHECK, `${tag}: radius ${m.minRadius_m}`);
  assert.ok(l.totalLength <= MAX_LOOP_M + 1e-12, `${tag}: ${l.totalLength}`);
  assert.equal(l.geometryValid, true, tag);
  // spacing: nominal everywhere, the residual only inside the terminal interval
  const term = l.spiral.residual?.terminal;
  const z = zonedGap(G.simplifyPath(l.spiral.path, 0.0005), s, term ? (q) => q >= term[0] && q <= term[1] : () => false);
  assert.ok(z.nom >= s - SPACING_TOL, `${tag}: nominal spacing ${z.nom}`);
  if (term) assert.ok(z.res >= MIN_RESIDUAL_CLOSURE_SPACING - SPACING_TOL && z.res < s, `${tag}: residual ${z.res}`);
  if (l.spiral.residual) assert.ok(l.spiral.residual.rings <= MAX_RESIDUAL_RINGS, tag);
  return m;
}

test('6R-1 reference regression: right-side residual — the final pass covers the right strip, not the centre', () => {
  const p = planCase(RIGHT);
  assert.equal(p.loops.length, 1);
  const l = p.loops[0];
  loopValid(l, RIGHT.U, RIGHT.s, 'right');
  assert.equal(l.spiral.closureSide, 'right');
  assert.equal(l.spiral.residual.side, 'right');
  assert.ok(Math.abs(l.spiral.residualSpacing - 0.15) < 1e-9, `ρ = 2.55 mod 0.2 = 0.15 (${l.spiral.residualSpacing})`);
  const ref = referenceCheck(l, RIGHT.s);
  assert.equal(ref.status, PHASE6_REFERENCE_OK, ref.reasons.join());
  assert.ok(ref.startsAtOuterContour);
  // the residual pair is the outermost one on the right: s/2 from the wall, ρ further in
  const pts = G.densify(l.spiral.heating, 0.02).filter((q) => q.y > 1 && q.y < 2.4);
  const xs = [...new Set(pts.map((q) => Math.round(q.x * 1000) / 1000))].sort((a, b) => b - a);
  assert.ok(Math.abs(xs[0] - (2.55 - 0.1)) < 1e-3 && Math.abs(xs[0] - xs[1] - 0.15) < 2e-3, `right strip: ${xs.slice(0, 3)}`);
});

test('6R-2 the side closure ranks above the centre one within the limits (not by hiding coverage)', () => {
  const shape = { outer: RIGHT.U[0].outer, holes: [] };
  const r = obstacleSpiral(shape, 0.2, { residual: true, returnAll: true, measure: 2, groupByStart: true, toward: TOWARD });
  const area = G.area([shape]);
  const all = r.ranked.map((x) => ({ ...x, area }));
  const centre = all.filter((x) => x.residual && !x.residual.side && withinLimits(x));
  const side = all.filter((x) => x.residual?.side && withinLimits(x));
  assert.ok(centre.length && side.length, 'both kinds exist');
  const best = all.sort(closureOrder)[0];
  assert.ok(best.residual?.side, 'a side closure first');
  // and only because it keeps the patch: no side candidate with a larger patch is put first
  const bestCentre = centre.sort(closureOrder)[0];
  assert.ok(Math.round(best.largestHole * 100) <= Math.round(bestCentre.largestHole * 100));
});

test('6R-3 exact width: no residual, no closure needed', () => {
  const c = { U: R(0, 0, 3.2, 2.4), s: 0.2, toward: TOWARD };
  const p = planCase(c);
  assert.equal(p.loops.length, 1);
  loopValid(p.loops[0], c.U, c.s, 'exact');
  assert.equal(p.loops[0].spiral.residual ?? null, null);
});

test('6R-4 residual at 150 mm pitch: 100 ≤ ρ < 150 on the side, terminal only', () => {
  const c = { U: R(0, 0, 2.35, 2.95), s: 0.15, toward: TOWARD };
  const p = planCase(c);
  const l = p.loops[0];
  loopValid(l, c.U, c.s, '150');
  assert.ok(l.spiral.residual?.side && l.spiral.residualSpacing >= 0.1 && l.spiral.residualSpacing < 0.15);
  assert.equal(referenceCheck(l, 0.15).status, PHASE6_REFERENCE_OK);
});

test('6R-5 multi-loop room (lead-aware): own subregions, no overlap, each loop valid, ≤ 60 m with the explicit lead budget', () => {
  const U = R(0, 0, 6.0, 4.0);
  const la = planLeadAware(U, 0.2, { entry: { at: { x: -0.06, y: 0.6 } }, leadSpacing: 0.05, budget: { toEntry_m: 6, drop_m: 0.4 } });
  assert.equal(la.status, LEAD_AWARE_VALID);
  assert.ok(la.plan.loops.length >= 2);
  const L = la.plan.loops;
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) assert.ok(G.area(G.intersection([L[i].shape], [L[j].shape])) < 1e-6, 'no overlap');
  for (const l of L) loopValid(l, U, 0.2, l.loopId);
  // the budget is the explicit one: transfer + drop + the way in the room
  for (const x of la.loops) assert.ok(x.entryRoute_m > 0 && x.leadCompatible);
  assert.ok(la.areas.largestGap_m2 <= MAX_LARGEST_GAP && la.areas.heating_m2 / la.areas.usable_m2 >= ENGINEERING_FINAL_COVERAGE);
});

test('6R-6 lead-aware endpoints: supply / return point and direction, entry / exit zones; inputs required', () => {
  const U = R(0, 0, 3.0, 2.6);
  const la = planLeadAware(U, 0.2, { entry: { at: { x: -0.06, y: 0.5 } }, leadSpacing: 0.05, budget: { toEntry_m: 4, drop_m: 0.4 } });
  for (const x of la.loops) {
    for (const e of [x.endpoints.supply, x.endpoints.ret]) {
      assert.ok(Math.abs(Math.hypot(e.dir.x, e.dir.y) - 1) < 1e-9);
      assert.ok(G.distToRegionBoundary(e.at, U) < 1e-6, 'the end on the usable outline');
    }
    assert.ok(G.area(x.leadEntryZone) > 0 && G.area(x.leadExitZone) > 0);
  }
  assert.throws(() => planLeadAware(U, 0.2, { entry: { at: { x: 0, y: 0 } }, leadSpacing: 0.05 }), /budget/);
  assert.throws(() => planLeadAware(U, 0.2, { entry: { at: { x: 0, y: 0 } }, budget: { toEntry_m: 1, drop_m: 0.4 } }), /leadSpacing/);
});

test('6R-7 60 m with the real lead budget: a longer transfer → more loops, never a loop over 60 m', () => {
  const U = R(0, 0, 4.0, 3.0);
  const near = planLeadAware(U, 0.2, { entry: { at: { x: -0.06, y: 0.5 } }, leadSpacing: 0.05, budget: { toEntry_m: 0, drop_m: 0.4 } });
  const far = planLeadAware(U, 0.2, { entry: { at: { x: -0.06, y: 0.5 } }, leadSpacing: 0.05, budget: { toEntry_m: 12, drop_m: 0.4 } });
  for (const l of [...near.plan.loops, ...far.plan.loops]) assert.ok(l.totalLength <= MAX_LOOP_M + 1e-12, `${l.totalLength}`);
  assert.ok(far.plan.loops.length >= near.plan.loops.length);
});

test('6R-8 obstacle notch: one continuous spiral round the notch, residual on a side', () => {
  // the bathroom's floor: a bathtub (with clearance) biting into the corner
  const U = [{ outer: [{ x: 0, y: 0 }, { x: 1.18, y: 0 }, { x: 1.18, y: 0.75 }, { x: 2.88, y: 0.75 }, { x: 2.88, y: 1.8 }, { x: 0, y: 1.8 }], holes: [] }];
  const p = planCase({ U, s: 0.15, toward: TOWARD });
  assert.equal(p.loops.length, 1, 'one loop round the notch');
  loopValid(p.loops[0], U, 0.15, 'notch');
});

test('6R-9 no valid spiral → NO_VALID_SPIRAL (never a serpentine)', () => {
  const la = planLeadAware(R(0, 0, 0.5, 3.0), 0.2, { entry: { at: { x: -0.06, y: 0.5 } }, leadSpacing: 0.05, budget: { toEntry_m: 0, drop_m: 0.4 } });
  assert.equal(la.status, NO_VALID_SPIRAL);
  assert.equal(la.plan.loops.length, 0);
});

test('6R-10 determinism: the same input → the same Phase 6 geometry', () => {
  const a = planCase(RIGHT);
  const b = planCase(RIGHT);
  assert.equal(phase6GeometryHash({ X: a }), phase6GeometryHash({ X: b }));
});
