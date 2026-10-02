// UFH Coverage Router, step 1: spiral offset generator (bifilar spiral of one convex region)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/engines/ufh/geom.js';
import { spiralRegion, bestSpiral } from '../src/engines/ufh/spiralgen.js';
import { coverageAnalysis } from '../src/engines/ufh/coverage.js';
import { tightBends, minSpacing, selfCrossings } from '../src/engines/ufh/debug.js';

const RMIN = 0.068; // PE-RT 16×2.0: 80 mm − 15 %
const rect = (w, h, c = 0.2) => [{ x: c, y: c }, { x: w - c, y: c }, { x: w - c, y: h - c }, { x: c, y: h - c }];

for (const [w, h] of [[5, 5], [3.5, 3.5], [6, 4]])
  for (const s of [0.2, 0.15])
    test(`spiral ${w}×${h} m, s ${s * 1000} mm: one continuous bifilar spiral, valid bends, exact spacing, covered`, () => {
      const U = rect(w, h);
      const sp = bestSpiral(U, s, { toward: { x: 0, y: 0 } });
      assert.ok(sp.ok, sp.reason);
      const P = sp.path;
      // one continuous pipe: supply end → spiral → return end, no straight run longer than a side
      const side = Math.max(w, h);
      assert.ok(Math.hypot(P[0].x - sp.supply.x, P[0].y - sp.supply.y) < 1e-9 && Math.hypot(P[P.length - 1].x - sp.ret.x, P[P.length - 1].y - sp.ret.y) < 1e-9);
      for (let i = 1; i < P.length; i++) assert.ok(Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y) < side, `jump at ${i}`);
      assert.equal(selfCrossings(P), 0, 'pipe crosses itself');
      // every bend is a true arc ≥ the minimum radius (none made smaller to fit)
      assert.deepEqual(tightBends(P, RMIN), []);
      assert.ok(G.minBendRadius(P).radius >= Math.min(sp.r, s / 2) - 0.002);
      // neighbouring runs exactly s apart (never closer)
      assert.ok(minSpacing(P, 0.5).min >= s - 0.002, `spacing ${minSpacing(P, 0.5).min}`);
      // the heating pipe stays in the usable area; both ends on its boundary, s apart
      const reg = [{ outer: G.ccw(U), holes: [] }];
      for (const p of sp.heating) assert.ok(G.pointInRegion(p, G.offset(reg, 1e-4)), 'outside the usable area');
      assert.ok(G.distToRegionBoundary(sp.supply, reg) < 1e-6 && G.distToRegionBoundary(sp.ret, reg) < 1e-6);
      assert.ok(Math.abs(Math.hypot(sp.supply.x - sp.ret.x, sp.supply.y - sp.ret.y) - s) < 1e-6);
      // coverage by the heating pipe only
      const cov = coverageAnalysis({ U: reg, Z: reg, pipes: [sp.heating], s });
      assert.ok(cov.ratio >= 0.95, `coverage ${cov.ratio}`);
      assert.ok(cov.largestHole <= 0.5, `hole ${cov.largestHole}`);
    });

test('spiral: a non-convex region is refused (it is cut into spiral regions first)', () => {
  const L = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }];
  assert.equal(spiralRegion(L, 0.2).reason, 'not_convex');
});

test('spiral: no room for the bends — no spiral rather than a smaller radius', () => {
  const sp = spiralRegion(rect(0.75, 0.75, 0), 0.2, { r: 0.1 });
  if (sp.ok) assert.deepEqual(tightBends(sp.path, 0.1 - 0.002), []);
  else assert.ok(['too_small', 'no_valid_spiral'].includes(sp.reason));
});
