// UFH Auto Routing Engine — spec §42 tests 01–15 + geometry kernel.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/engines/ufh/geom.js';
import { runUfhEngine } from '../src/engines/ufh/engine.js';
import { validateLayout } from '../src/engines/ufh/validate.js';
import { spiralTree } from '../src/engines/ufh/spiral.js';
import { buildLoop } from '../src/engines/ufh/loop.js';

const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
/** Manifold on the wall below y = 0 (outlets 50 mm apart, supply row at the wall, return 0.2 m in). */
const manifold = (cx, n = 12, cy = -0.25) => ({
  anchor: { x: cx + 0.3, y: cy + 0.1 },
  ports: Array.from({ length: n }, (_, i) => ({ circuitId: `C${String(i + 1).padStart(2, '0')}`, index: i, supply: { x: cx + 0.05 + i * 0.05, y: cy }, ret: { x: cx + 0.05 + i * 0.05, y: cy + 0.2 } })),
});
const codes = (r) => r.issues.filter((i) => i.level === 'error').map((i) => i.code);
const hard = ['UFH-LEN', 'UFH-CROSS', 'UFH-TOPO', 'UFH-WALL', 'UFH-OBST', 'UFH-ZONE'];

test('geom: offset / boolean / area / orientation / sanitize', () => {
  const sq = rect(0, 0, 4, 3);
  assert.ok(Math.abs(G.area(G.offset(sq, -0.1)) - 3.8 * 2.8) < 1e-6);
  assert.ok(Math.abs(G.area(G.difference(sq, rect(1, 1, 2, 2))) - 11) < 1e-6);
  assert.ok(Math.abs(G.area(G.union([rect(0, 0, 2, 2), rect(1, 1, 3, 3)])) - 7) < 1e-6);
  assert.ok(G.isCCW(G.offset(sq, -0.1)[0].outer));
  const bow = [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }];
  assert.ok(G.checkRing(bow).includes('self_intersection'));
  assert.equal(G.sanitize(bow).length, 2);
  // bend radius of a true arc and of a sharp corner
  const arc = G.fillet([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], 0.2).pts;
  assert.ok(Math.abs(G.minBendRadius(arc).radius - 0.2) < 0.005);
  assert.ok(G.minBendRadius([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]).radius < 0.03);
});

test('loop: bifilar pipe from a centreline tree is ONE open pipe, supply on the right of the lead', () => {
  const R = G.asRegion(rect(0, 0, 3, 2));
  const t = spiralTree(R, 0.15, { x: 0.075, y: 0.075 }, { x: 0, y: 1 }, { rmin: 0.072 });
  const lp = buildLoop([{ x: 0.075, y: -0.4 }, ...t.path], t.branches, 0.15, 0.072);
  assert.deepEqual(lp.errors, []);
  assert.ok(Math.abs(lp.pipe[0].x - 0.15) < 1e-6 && Math.abs(lp.pipe[lp.pipe.length - 1].x - 0.0) < 1e-6);
  // length ≈ area / spacing
  const L = G.pathLength(lp.pipe);
  assert.ok(L > 30 && L < 48, `length ${L}`);
});

function runCase(zone, col, extra = {}) {
  return runUfhEngine({ zone, collector: col, spacing: 0.15, ...extra });
}

function assertSound(r, label) {
  const bad = codes(r).filter((c) => hard.includes(c));
  assert.deepEqual(bad, [], `${label}: ${r.issues.filter((i) => hard.includes(i.code)).map((i) => i.msg).join('; ')}`);
  for (const l of r.loops) assert.ok(l.length <= 60 + 1e-9, `${label}: ${l.name} ${l.length}`);
}

test('TEST 01 — rectangle 3×2.5 m: one loop, ≤ 60 m, coverage ≥ 90 %, valid', () => {
  const r = runCase(rect(0, 0, 3, 2.5), manifold(1.2));
  assertSound(r, 'T01');
  assert.equal(r.loops.length, 1);
  assert.ok(r.coverage.ratio >= 0.9, `coverage ${r.coverage.ratio}`);
});

test('TEST 02 — large room 10×8 m: several loops, each ≤ 60 m, balanced', () => {
  const r = runCase(rect(0, 0, 10, 8), manifold(3));
  assertSound(r, 'T02');
  assert.ok(r.loops.length >= 8, `loops ${r.loops.length}`);
  assert.ok(r.coverage.ratio >= 0.85, `coverage ${r.coverage.ratio}`);
});

test('TEST 03 — L-shaped zone', () => {
  const r = runCase([{ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 6 }, { x: 0, y: 6 }], manifold(3));
  assertSound(r, 'T03');
  assert.ok(r.coverage.ratio >= 0.85, `coverage ${r.coverage.ratio}`);
});

test('TEST 04 — U-shaped zone', () => {
  const r = runCase([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 5.5, y: 6 }, { x: 5.5, y: 3 }, { x: 2.5, y: 3 }, { x: 2.5, y: 6 }, { x: 0, y: 6 }], manifold(3.5));
  assertSound(r, 'T04');
  assert.ok(r.coverage.ratio >= 0.85, `coverage ${r.coverage.ratio}`);
});

test('TEST 05/14 — stair obstacle: no pipe inside obstacle + clearance', () => {
  const stair = rect(2, 2, 3.2, 4.2);
  const r = runCase(rect(0, 0, 6, 5), manifold(2), { obstacles: [{ polygon: stair, kind: 'stair' }] });
  assertSound(r, 'T05');
  const keep = G.offset(stair, 0.1 - 0.003, 'round');
  for (const l of r.loops) for (const p of l.path) assert.ok(!G.pointInRegion(p, keep), `${l.name} in obstacle clearance`);
});

test('TEST 06 — irregular polygon', () => {
  const r = runCase([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 2 }, { x: 5, y: 4.5 }, { x: 2, y: 5 }, { x: 0, y: 3.5 }], manifold(1.5));
  assertSound(r, 'T06');
});

test('TEST 07/08 — manifold far away / zone needing > 120 m: leads count, loops split ≤ 60 m', () => {
  const r = runCase(rect(0, 0, 7, 6), manifold(0.3));
  assertSound(r, 'T07');
  const total = r.loops.reduce((a, l) => a + l.length, 0);
  assert.ok(total > 120 && r.loops.length >= 3, `total ${total}`);
  for (const l of r.loops) assert.ok(l.supplyLength > 0 && l.returnLength > 0);
});

test('TEST 09 — supply/return topology: each loop starts at its supply and ends at its return connector', () => {
  const col = manifold(2);
  const r = runCase(rect(0, 0, 6, 5), col);
  const byId = Object.fromEntries(col.ports.map((p) => [p.circuitId, p]));
  const used = new Set();
  for (const l of r.loops) {
    const p = byId[l.circuitId];
    assert.ok(p, 'circuit exists');
    assert.ok(!used.has(l.circuitId), 'circuit used once');
    used.add(l.circuitId);
    assert.ok(Math.hypot(l.path[0].x - p.supply.x, l.path[0].y - p.supply.y) < 1e-3);
    const e = l.path[l.path.length - 1];
    assert.ok(Math.hypot(e.x - p.ret.x, e.y - p.ret.y) < 1e-3);
  }
});

test('TEST 10 — three zones on one manifold use different circuits, no crossings', () => {
  const col = manifold(2);
  const a = runCase(rect(0, 0, 4, 4), { anchor: col.anchor, ports: col.ports.slice(0, 4) });
  const b = runCase(rect(4.3, 0, 7, 3), { anchor: col.anchor, ports: col.ports.slice(4, 8) });
  const ids = [...a.loops, ...b.loops].map((l) => l.circuitId);
  assert.equal(new Set(ids).size, ids.length);
});

test('TEST 11 — spacing 100 mm with a 80 mm pipe: bends validated against the pipe radius', () => {
  const r = runCase(rect(0, 0, 3, 2.5), manifold(1), { spacing: 0.1 });
  assertSound(r, 'T11');
});

test('TEST 12/13 — spacing exact and wall clearance kept', () => {
  const r = runCase(rect(0, 0, 5, 4), manifold(1.5));
  const v = validateLayout(r.loops, { s: 0.15, rmin: 0.072, maxLoop: 60, Z: G.asRegion(rect(0, 0, 5, 4)), wallClearance: 0.1, rules: { bendTol: 0, spacingTol: 0.012 } });
  assert.deepEqual(v.errors.filter((e) => ['UFH-CROSS', 'UFH-WALL', 'UFH-SPACE'].includes(e.code)).map((e) => e.msg), []);
});

test('TEST 15 — a loop over 60 m is reported and Auto Repair splits the zone', () => {
  const r0 = runCase(rect(0, 0, 7, 5), manifold(2), { loops: 2 });
  assert.ok(codes(r0).includes('UFH-LEN'));
  const r1 = runCase(rect(0, 0, 7, 5), manifold(2), { repair: true });
  assert.ok(!codes(r1).includes('UFH-LEN'));
  assert.ok(r1.loops.every((l) => l.length <= 60));
});

test('determinism: the same input gives the same geometry', () => {
  const a = runCase(rect(0, 0, 5, 4), manifold(1.5));
  const b = runCase(rect(0, 0, 5, 4), manifold(1.5));
  assert.equal(JSON.stringify(a.loops), JSON.stringify(b.loops));
});

test('capacity: a zone needing more than 12 loops is UFH-CIRC; split into manifolds every part is valid', async () => {
  const { collectorPort } = await import('../src/core/model.js');
  const { collectorAnchor, splitZoneForCollectors } = await import('../src/core/ufhmodel.js');
  // the long living room from the field report: 6.4 × 23.35 m, manifold on the end wall near a corner
  const zone = rect(0, 0, 6.4, 23.35);
  const col = { x: 5.9, y: 23.6, angle: 180, outlets: 12 };
  const portsOf = (c) => ({ anchor: collectorAnchor(c), ports: Array.from({ length: 12 }, (_, i) => ({ circuitId: `C${String(i + 1).padStart(2, '0')}`, index: i, supply: collectorPort(c, i, 'supply'), ret: collectorPort(c, i, 'return') })) });
  const job = { spacing: 0.15, wallClearance: 0.2, obstacleClearance: 0.2 };
  const r = runUfhEngine({ ...job, zone, collector: portsOf(col) });
  assert.equal(r.ok, false);
  assert.ok(codes(r).includes('UFH-CIRC'));
  assert.ok(r.needCircuits > 12 && r.freeCircuits === 12);
  const clip = (pts, alongX, lo, hi) => {
    const slab = alongX ? rect(lo, -1e4, hi, 1e4) : rect(-1e4, lo, 1e4, hi);
    const q = G.intersection(G.sanitize(pts), [{ outer: slab, holes: [] }]);
    const big = q.reduce((a, b) => (!a || G.area([b]) > G.area([a]) ? b : a), null);
    return { area: G.area(q), ring: big?.outer ?? null };
  };
  const parts = splitZoneForCollectors({ points: zone }, col, r.needCircuits, 12, clip);
  assert.equal(parts.length, 2);
  assert.ok(parts[1].isNewCol);
  for (const p of parts) {
    const rp = runUfhEngine({ ...job, zone: p.points, collector: portsOf(p.col) });
    assert.ok(rp.ok, `${codes(rp).join(',')}`);
    assert.ok(rp.loops.length <= 12 && rp.loops.every((l) => l.length <= 60));
  }
});

test('rooms: loops stay in their rooms, leads cross walls only through the doors', () => {
  // 101 (top) — corridor 103 with the manifold — 105 (bottom); one door at each end of the corridor
  const zone = [{ x: 0, y: 0 }, { x: 5.8, y: 0 }, { x: 5.8, y: 18.76 }, { x: 0, y: 18.76 }, { x: 0, y: 11.6 }, { x: 3.2, y: 11.6 }, { x: 3.2, y: 5.6 }, { x: 0, y: 5.6 }];
  const R = (x0, y0, x1, y1, h = 0.08) => [{ x: x0 + h, y: y0 + h }, { x: x1 - h, y: y0 + h }, { x: x1 - h, y: y1 - h }, { x: x0 + h, y: y1 - h }];
  const rooms = [{ id: 'a', name: '101', poly: R(0, 11.6, 5.8, 18.76) }, { id: 'b', name: '103', poly: R(3.2, 5.6, 5.8, 11.6) }, { id: 'c', name: '105', poly: R(0, 0, 5.8, 5.6) }];
  const doors = [
    { c: { x: 4.5, y: 11.6 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, width: 0.9, half: 0.08, ra: 0, rb: 1 },
    { c: { x: 4.0, y: 5.6 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, width: 0.9, half: 0.08, ra: 1, rb: 2 },
  ];
  const ports = Array.from({ length: 10 }, (_, i) => ({ circuitId: `C${i + 1}`, index: i, supply: { x: 4.55 - i * 0.05, y: 5.75 }, ret: { x: 4.55 - i * 0.05, y: 5.95 } }));
  const r = runUfhEngine({ zone, rooms, doors, collector: { anchor: { x: 4.3, y: 5.85 }, ports }, spacing: 0.2, wallClearance: 0.2, obstacleClearance: 0.2 });
  assert.ok(r.loops.length >= 6, `loops ${r.loops.length}`);
  const hardCodes = codes(r).filter((c) => ['UFH-LEN', 'UFH-TOPO', 'UFH-CROSS', 'UFH-ZONE'].includes(c));
  assert.deepEqual(hardCodes, []);
  // every crossing of the two walls (y = 5.6, y = 11.6) lies inside a door opening
  for (const l of r.loops)
    for (let k = 1; k < l.path.length; k++) {
      const a = l.path[k - 1];
      const b = l.path[k];
      for (const [y, dx] of [[11.6, 4.5], [5.6, 4.0]])
        if ((a.y - y) * (b.y - y) < 0 && a.x < 3.2 === false) {
          const x = a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y);
          if (x > 3.2) assert.ok(Math.abs(x - dx) <= 0.45 + 1e-6, `${l.name} crosses the wall at x=${x.toFixed(2)} (door at ${dx})`);
        }
    }
});

test('rooms: leads to a side door leave the manifold as nested L-routes (no diagonal fan)', () => {
  // 102 (left) is fed from the manifold in corridor 103 through a door low on the shared wall
  const zone = [{ x: 0, y: 5.6 }, { x: 5.8, y: 5.6 }, { x: 5.8, y: 11.6 }, { x: 0, y: 11.6 }];
  const R = (x0, y0, x1, y1, h = 0.08) => [{ x: x0 + h, y: y0 + h }, { x: x1 - h, y: y0 + h }, { x: x1 - h, y: y1 - h }, { x: x0 + h, y: y1 - h }];
  const rooms = [{ id: 'b', name: '103', poly: R(3.2, 5.6, 5.8, 11.6) }, { id: 'd', name: '102', poly: R(0, 5.6, 3.2, 11.6) }];
  const doors = [{ c: { x: 3.2, y: 6.2 }, u: { x: 0, y: 1 }, n: { x: 1, y: 0 }, width: 0.9, half: 0.08, ra: 1, rb: 0 }];
  const ports = Array.from({ length: 12 }, (_, i) => ({ circuitId: `C${i + 1}`, index: i, supply: { x: 5.5 - i * 0.05, y: 5.75 }, ret: { x: 5.5 - i * 0.05, y: 5.95 } }));
  const r = runUfhEngine({ zone, rooms, doors, collector: { anchor: { x: 5.2, y: 5.85 }, ports }, spacing: 0.15, wallClearance: 0.15, obstacleClearance: 0.15 });
  const hardCodes = codes(r).filter((c) => ['UFH-LEN', 'UFH-TOPO', 'UFH-CROSS', 'UFH-ZONE', 'UFH-SPACE'].includes(c));
  assert.deepEqual(hardCodes, []);
  const tr = r.loops.filter((l) => l.transit);
  assert.ok(tr.length >= 2, `transit leads ${tr.length}`);
  for (const l of tr) {
    // every transit segment runs along x or y
    for (let k = 1; k < l.transit.length; k++) {
      const a = l.transit[k - 1];
      const b = l.transit[k];
      assert.ok(Math.min(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) < 0.01, `${l.circuitId} diagonal transit segment`);
    }
  }
  // nested: the lead nearest the door turns lowest
  const turn = (l) => l.transit[1].y;
  const byX = [...tr].sort((a, b) => a.transit[0].x - b.transit[0].x);
  for (let k = 1; k < byX.length; k++) assert.ok(turn(byX[k]) > turn(byX[k - 1]), 'L-routes cross');
});
