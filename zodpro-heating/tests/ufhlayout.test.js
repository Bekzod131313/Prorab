// Underfloor-heating layout geometry tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutRoomUfh, spiralLoop, serpentineLoop, roundCorners, pathLength } from '../src/engines/ufhlayout.js';
import { createDemoProject } from '../src/core/demo.js';
import { runCalculation } from '../src/engines/calc.js';

function crossings(pts) {
  const inter = (a, b, c, d) => {
    const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
    if (Math.abs(den) < 1e-12) return false;
    const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
    const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
    return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
  };
  let n = 0;
  for (let i = 1; i < pts.length; i++) for (let j = i + 2; j < pts.length; j++) if (inter(pts[i - 1], pts[i], pts[j - 1], pts[j])) n++;
  return n;
}

test('bifilar spiral: no self-crossings, both ends at the entry corner, length ≈ area / spacing', () => {
  const { coil } = spiralLoop(0, 0, 3, 2, 0.15);
  assert.equal(crossings(coil), 0);
  assert.ok(Math.hypot(coil[0].x, coil[0].y) < 1e-9);
  const end = coil[coil.length - 1];
  assert.ok(Math.hypot(end.x - 0.15, end.y - 0.15) < 1e-9, 'return ends next to the supply start');
  const L = pathLength(coil);
  assert.ok(L > (6 / 0.15) * 0.85 && L < (6 / 0.15) * 1.25, `length ${L}`);
});

test('serpentine: runs at spacing and return lead back to the entry side', () => {
  const { coil } = serpentineLoop(0, 0, 2, 1, 0.2, 0.2);
  const runs = coil.filter((p, i) => i > 0 && Math.abs(p.y - coil[i - 1].y) < 1e-9 && Math.abs(p.x - coil[i - 1].x) > 1.9).length;
  assert.equal(runs, 6);
  assert.ok(coil[coil.length - 1].y < 0, 'return lead ends at the entry edge');
});

test('corner rounding keeps the path continuous and never lengthens it', () => {
  const sharp = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
  const r = roundCorners(sharp, 0.1);
  assert.ok(pathLength(r) < pathLength(sharp));
  assert.deepEqual(r[0], sharp[0]);
  assert.deepEqual(r[r.length - 1], sharp[2]);
});

test('room layout: loops split into strips, leads end at manifold ports', () => {
  const polygon = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];
  const ports = [0, 1, 2].map((i) => ({ supply: { x: 7 + i * 0.05, y: 1 }, return: { x: 7 + i * 0.05, y: 1.2 } }));
  const lay = layoutRoomUfh({ polygon, loops: 3, spacing: 0.15, pattern: 'spiral', inset: 0.25, ports, toward: { x: 7, y: 1 } });
  assert.equal(lay.loops.length, 3);
  for (const [k, l] of lay.loops.entries()) {
    assert.deepEqual(l.supplyLead[0], ports[k].supply);
    assert.deepEqual(l.returnLead[l.returnLead.length - 1], ports[k].return);
    assert.equal(crossings(l.coil), 0);
    for (const p of l.coil) assert.ok(p.x >= 0.25 - 1e-9 && p.x <= 5.75 + 1e-9 && p.y >= 0.25 - 1e-9 && p.y <= 3.75 + 1e-9);
  }
  // strip closest to the manifold comes first
  assert.ok(lay.loops[0].strip.x1 >= lay.loops[2].strip.x1);
});

test('calculation uses the real loop geometry', () => {
  const p = createDemoProject();
  const res = runCalculation(p, { noCache: true });
  const ufh = Object.values(res.ufh);
  assert.ok(ufh.length >= 2);
  for (const u of ufh) {
    assert.equal(u.geometric, true);
    assert.equal(u.layout.length, u.loops);
    const sum = u.layout.reduce((a, l) => a + l.length, 0);
    assert.ok(Math.abs(sum - u.totalLength) < 1e-6);
    assert.ok(u.loopLength <= p.settings.ufhMaxLoopM + 1e-6);
  }
  // manifold ports are allocated consecutively across rooms
  const col = ufh[0].collectorId;
  const ports = ufh.filter((u) => u.collectorId === col).map((u) => [u.firstPort, u.loops]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ports.length; i++) assert.equal(ports[i][0], ports[i - 1][0] + ports[i - 1][1]);
});
