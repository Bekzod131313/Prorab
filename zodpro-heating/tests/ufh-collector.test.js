// Phase 7A: the physical manifold model (collector.js) — ports, capacity, assignment, drop.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { portsOf, checkPorts, capacity, assignPorts, loopTotal } from '../src/engines/ufh/collector.js';
import { run101 } from '../tools/ufh-loops-debug.mjs';

const FIX = JSON.parse(fs.readFileSync(new URL('./fixtures/collectors.json', import.meta.url), 'utf8'));
const C01 = FIX['C-01'];
const clone = (x) => JSON.parse(JSON.stringify(x));
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('7A ports: one supply + return pair per physical outlet, portPitch_m apart, in a row centred on the manifold', () => {
  for (const outlets of [1, 2, 6, 12]) {
    for (const facing of [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: -Math.SQRT1_2, y: Math.SQRT1_2 }]) {
      const col = { ...C01, outlets, facing };
      const P = portsOf(col);
      assert.equal(P.length, outlets);
      assert.deepEqual(P.map((p) => p.index), [...Array(outlets).keys()]);
      for (const p of P) assert.ok(Math.abs(d(p.supply, p.ret) - col.portPitch_m) <= 1e-9);
      // centred on `at`, the row across the facing direction
      const pts = P.flatMap((p) => [p.supply, p.ret]);
      const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
      const cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
      assert.ok(Math.abs(cx - col.at.x) < 1e-12 && Math.abs(cy - col.at.y) < 1e-12);
      for (const q of pts) assert.ok(Math.abs((q.x - col.at.x) * facing.x + (q.y - col.at.y) * facing.y) < 1e-12);
      assert.equal(checkPorts(col).status, 'PORTS_OK');
    }
  }
  // C-01: 6 outlets → 12 connections, 0.55 m wide row
  const P = portsOf(C01);
  assert.ok(Math.abs(d(P[0].supply, P[5].ret) - 11 * 0.05) < 1e-12);
});

test('7A ports: given manufacturer ports used as they are; wrong count / pitch / overlap → MANIFOLD_PORTS_INVALID', () => {
  const given = { ...C01, ports: portsOf(C01) };
  assert.equal(checkPorts(given).status, 'PORTS_OK');
  assert.deepEqual(portsOf(given), portsOf(C01));
  const bad = (f) => {
    const c = clone(given);
    f(c);
    return checkPorts(c);
  };
  assert.equal(bad((c) => c.ports.pop()).status, 'MANIFOLD_PORTS_INVALID'); // 5 ports for 6 outlets
  assert.equal(bad((c) => (c.ports[2].ret = { x: c.ports[2].supply.x + 0.08, y: c.ports[2].supply.y })).status, 'MANIFOLD_PORTS_INVALID');
  assert.equal(bad((c) => (c.ports[3].supply = { ...c.ports[2].ret })).status, 'MANIFOLD_PORTS_INVALID');
  assert.equal(bad((c) => (c.ports[1].index = 0)).status, 'MANIFOLD_PORTS_INVALID');
  assert.equal(bad((c) => delete c.dropPerPipe_m).status, 'MANIFOLD_PORTS_INVALID');
});

test('7A capacity: required ≤ outlets → OUTLETS_OK; above → OUTLET_SHORTAGE, no assignment, no port added', () => {
  assert.deepEqual(capacity(6, C01), { status: 'OUTLETS_OK', required: 6, available: 6, missing: 0, recommendation: null });
  const c = capacity(9, C01);
  assert.equal(c.status, 'OUTLET_SHORTAGE');
  assert.equal(c.missing, 3);
  assert.ok(c.recommendation.includes('≥ 9 outlets'));
  const loops = Array.from({ length: 9 }, (_, i) => ({ loopId: `L${i + 1}` }));
  const before = clone(C01);
  const a = assignPorts(loops, C01);
  assert.equal(a.status, 'OUTLET_SHORTAGE');
  assert.deepEqual(a.assignments, []);
  // the manifold is not touched: still 6 physical outlets, still 6 ports
  assert.deepEqual(C01, before);
  assert.equal(portsOf(C01).length, 6);
});

test('7A assignment: one loop ↔ one physical outlet, each outlet once, in the given order', () => {
  const loops = ['L1', 'L2', 'L3', 'L4'].map((loopId) => ({ loopId }));
  const a = assignPorts(loops, C01);
  assert.equal(a.status, 'ASSIGNED');
  assert.deepEqual(a.assignments.map((x) => [x.loopId, x.portIndex]), [['L1', 0], ['L2', 1], ['L3', 2], ['L4', 3]]);
  const o = assignPorts(loops, C01, ['L3', 'L1', 'L4', 'L2']);
  assert.deepEqual(o.assignments.map((x) => [x.loopId, x.portIndex]), [['L3', 0], ['L1', 1], ['L4', 2], ['L2', 3]]);
  assert.equal(new Set(o.assignments.map((x) => x.portIndex)).size, 4);
  for (const x of o.assignments) {
    const p = portsOf(C01)[x.portIndex];
    assert.deepEqual([x.supply, x.ret], [p.supply, p.ret]); // supply → supply port, return → return port
  }
  assert.throws(() => assignPorts(loops, C01, ['L1', 'L1', 'L2', 'L3']));
  assert.throws(() => assignPorts(loops, C01, ['L1', 'L2', 'L3']));
  assert.equal(assignPorts(Array.from({ length: 6 }, (_, i) => ({ loopId: `L${i}` })), C01).status, 'ASSIGNED'); // exactly full
});

test('7A drop: counted for supply and return — total = heating + supply + return + 2·drop; 60 m exact', () => {
  const L = { heatingLength: 45.25, supplyRouted: 5.1, returnRouted: 5.3 };
  const t0 = loopTotal(L, { ...C01, dropPerPipe_m: 0 });
  const t4 = loopTotal(L, C01);
  assert.ok(Math.abs(t4.totalLength - t0.totalLength - 0.8) <= 1e-12);
  assert.equal(t4.totalLength, 45.25 + 5.1 + 5.3 + 2 * 0.4);
  assert.equal(t4.dropLength, 0.4);
  assert.ok(Math.abs(t4.margin - (60 - t4.totalLength)) < 1e-15);
  // the 60 m boundary with drops: 60.000000000 valid, 60.000000001 invalid
  assert.equal(loopTotal({ heatingLength: 55.2, supplyRouted: 2, returnRouted: 2 }, C01).status, 'LOOP_VALID');
  assert.equal(loopTotal({ heatingLength: 55.2, supplyRouted: 2, returnRouted: 2.000000001 }, C01).status, 'LOOP_INVALID');
  // LOW_MARGIN < 0.25 m (a warning only)
  const low = loopTotal({ heatingLength: 55, supplyRouted: 2, returnRouted: 2 }, C01);
  assert.ok(low.lowMargin && low.status === 'LOOP_VALID' && Math.abs(low.margin - 0.2) < 1e-12);
});

test('7A on 101–109 (C-01, 6 physical outlets): 9 loops → OUTLET_SHORTAGE, Phase 6 status unchanged; the drop pushes the low-margin loops over 60 m', () => {
  const r = run101();
  assert.equal(r.requiredLoops, 9);
  assert.equal(r.availableOutlets, 6);
  assert.equal(r.status, 'HYDRAULIC_LOOP_INVALID');
  assert.ok(r.reasons.includes('outlet_shortage'));
  const cap = capacity(r.requiredLoops, C01);
  assert.equal(cap.status, 'OUTLET_SHORTAGE');
  assert.equal(cap.missing, 3);
  const a = assignPorts(r.loops.map((l, i) => ({ loopId: `${l.room}/${l.loopId}#${i}` })), C01);
  assert.equal(a.status, 'OUTLET_SHORTAGE');
  assert.equal(a.assignments.length, 0);
  assert.equal(portsOf(C01).length, 6);
  // the Phase 6 totals (estimated leads) with the 2 × 0.40 m drop: every loop with a margin
  // under 0.8 m goes over 60 m — the problem step 7D re-plans
  for (const l of r.loops) {
    const t = loopTotal({ heatingLength: l.heatingLength, supplyRouted: l.supplyLength, returnRouted: l.returnLength }, C01);
    assert.equal(t.status === 'LOOP_INVALID', l.remainingMargin < 0.8, `${l.room} ${l.loopId}: margin ${l.remainingMargin}`);
  }
});
