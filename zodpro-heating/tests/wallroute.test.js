// Radiator home-runs along the walls: bundle routing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleRoutes, insetPolygon } from '../src/core/wallroute.js';
import { newElement, collectorPortLocal } from '../src/core/model.js';

function segX(a, b, c, d) {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(den) < 1e-12) return 0;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 ? 1 : 0;
}

function house() {
  const project = { elements: {}, levels: [{ id: 'L', elevation: 0 }], settings: {} };
  const add = (e) => (project.elements[e.id] = e);
  add(newElement('room', { levelId: 'L', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 3 }, { x: 0, y: 3 }] }));
  add(newElement('room', { levelId: 'L', points: [{ x: 0, y: 3 }, { x: 5, y: 3 }, { x: 5, y: 7 }, { x: 0, y: 7 }] }));
  for (const [a, b] of [[[0, 0], [10, 0]], [[10, 0], [10, 3]], [[10, 3], [0, 3]], [[0, 3], [0, 0]], [[0, 3], [0, 7]], [[0, 7], [5, 7]], [[5, 7], [5, 3]]]) add(newElement('wall', { levelId: 'L', a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, thickness: 0.2 }));
  return project;
}

test('inset polygon keeps orientation-independent inward offset', () => {
  const sq = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
  for (const poly of [sq, [...sq].reverse()]) {
    const r = insetPolygon(poly, 0.5);
    const xs = r.map((p) => p.x);
    const ys = r.map((p) => p.y);
    assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [0.5, 3.5, 0.5, 2.5]);
  }
});

test('radiator pairs run along the walls as one bundle and never cross', () => {
  const project = house();
  const col = { x: 0.5, y: 1.5, angle: 90 };
  const W = 0.1;
  const circuits = [3, 6, 9].map((x, i) => ({ key: 'r' + i, s: { x: x - 0.4, y: W + 0.07 }, r: { x: x - 0.35, y: W + 0.07 } }));
  circuits.push({ key: 'r3', s: { x: 10 - W - 0.07, y: 2.0 }, r: { x: 10 - W - 0.07, y: 2.05 } });
  circuits.push({ key: 'r4', s: { x: 2.5, y: 7 - W - 0.07 }, r: { x: 2.55, y: 7 - W - 0.07 } });
  const ports = (k) => ({ s: { x: col.x, y: col.y + collectorPortLocal(k) }, r: { x: col.x - 0.2, y: col.y + collectorPortLocal(k) } });
  const res = bundleRoutes(project, 'L', col, circuits, ports);
  assert.equal(res.size, circuits.length);
  const polys = [];
  for (const c of circuits) {
    const r = res.get(c.key);
    assert.deepEqual(r.supply[0], { x: Math.round(c.s.x * 1000) / 1000, y: Math.round(c.s.y * 1000) / 1000 });
    assert.deepEqual(r.return[0], { x: Math.round(c.r.x * 1000) / 1000, y: Math.round(c.r.y * 1000) / 1000 });
    // every segment is horizontal, vertical or a 45° shift
    for (const pl of [r.supply, r.return]) {
      for (let i = 1; i < pl.length; i++) {
        const dx = Math.abs(pl[i].x - pl[i - 1].x);
        const dy = Math.abs(pl[i].y - pl[i - 1].y);
        assert.ok(dx < 1e-3 || dy < 1e-3 || Math.abs(dx - dy) < 1e-3 || Math.hypot(dx, dy) < 0.3, `${c.key}: oblique run ${dx}×${dy}`);
      }
      // away from the manifold (last 0.6 m), keep the pipes inside the rooms and along the walls
      polys.push(pl.filter((p) => Math.hypot(p.x - col.x, p.y - col.y) > 0.6));
    }
  }
  let n = 0;
  for (let i = 0; i < polys.length; i++) for (let j = i + 1; j < polys.length; j++) for (let a = 1; a < polys[i].length; a++) for (let b = 1; b < polys[j].length; b++) n += segX(polys[i][a - 1], polys[i][a], polys[j][b - 1], polys[j][b]);
  assert.equal(n, 0, 'pipes cross away from the manifold');
});
