// "Avto тёплый пол" on the Phase 6 / 7B core: a small flat, two rooms, one door, one manifold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPhase6Engine } from '../src/engines/ufh/apartment.js';
import { MAX_LOOP_M } from '../src/engines/ufh/criteria.js';

const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const ports = Array.from({ length: 6 }, (_, i) => ({ circuitId: `C0${i + 1}`, index: i, supply: { x: 0.4 + i * 0.05, y: 0.3 }, ret: { x: 0.4 + i * 0.05, y: 0.1 } }));
const job = {
  zone: rect(0, 0, 8.2, 3.6),
  rooms: [
    { id: 'A', name: 'A', poly: rect(0, 0, 4, 3.6) },
    { id: 'B', name: 'B', poly: rect(4.2, 0, 8.2, 3.6) },
  ],
  doors: [{ id: 'D1', c: { x: 4.1, y: 2.8 }, width: 0.9, ra: 0, rb: 1 }],
  obstacles: [],
  collector: { id: 'C-1', ports },
  spacing: 0.2,
  wallClearance: 0.1,
  obstacleClearance: 0.1,
  pipeType: 'PERT-16x2.0',
  dropLength: 0.8,
};

test('AP-1 spirals per room, leads along the walls through the door, every loop ≤ 60 m and connected; crossings reported', () => {
  const r = runPhase6Engine(job);
  assert.ok(r.loops.length >= 2, `${r.loops.length} loops`);
  assert.equal(r.strategy, 'phase6_spiral');
  for (const l of r.loops) {
    assert.ok(['none', 'side:left', 'side:right', 'side:top', 'side:bottom', 'centre'].includes(l.closure));
    assert.ok(l.length <= MAX_LOOP_M + 1e-9, `${l.name} ${l.length}`);
    assert.ok(Math.abs(l.length - (l.heatingLength + l.supplyLength + l.returnLength + l.drop)) < 1e-9);
    // the path starts and ends at the loop's own outlet
    const p = ports.find((q) => q.circuitId === l.circuitId);
    const at = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-4;
    assert.ok([p.supply, p.ret].some((q) => at(q, l.path[0])) && [p.supply, p.ret].some((q) => at(q, l.path.at(-1))), l.name);
  }
  assert.equal(new Set(r.loops.map((l) => l.circuitId)).size, r.loops.length, 'one outlet per loop');
  // a lead crossing is never hidden: it is an error of the result (APPLY only on confirmation)
  if (r.issues.some((i) => i.code === 'UFH-CROSS')) assert.equal(r.ok, false);
  assert.ok(!r.issues.some((i) => i.code === 'UFH-LEN' || i.code === 'UFH-TOPO'), JSON.stringify(r.issues));
  assert.ok(r.loops.some((l) => l.room === 'B'), 'the room behind the door is served');
});

test('AP-2 a pitch the spiral core does not take is reported, never routed', () => {
  const r = runPhase6Engine({ ...job, spacing: 0.1 });
  assert.equal(r.ok, false);
  assert.equal(r.issues[0].code, 'UFH-PARAM');
});
