// Integration / regression tests on the benchmark (demo) project.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDemoProject } from '../src/core/demo.js';
import { runCalculation } from '../src/engines/calc.js';
import { elementsOf } from '../src/core/model.js';

const project = createDemoProject();
const res = runCalculation(project, { noCache: true });

test('benchmark: every room calculated with breakdown', () => {
  const rooms = elementsOf(project, 'room');
  assert.equal(rooms.length, 7);
  for (const r of rooms) {
    const hl = res.rooms[r.id];
    assert.ok(hl.required > 0, `${r.name} has load`);
    assert.ok(hl.lines.length > 0);
    assert.ok(Math.abs(hl.total - (hl.transmission + hl.airApplied - hl.gains)) < 1e-6);
  }
});

test('benchmark regression: building heat loss stays in expected band', () => {
  // 216 m² house, -15 °C: ~70 W/m² → 15.0 kW (update deliberately if engine version changes)
  assert.ok(res.totals.heatLoss > 14000 && res.totals.heatLoss < 16000, `heat loss ${res.totals.heatLoss}`);
});

test('benchmark: network fully connected, no errors', () => {
  const c = res.validation.counts;
  assert.equal(c.critical, 0, JSON.stringify(res.validation.findings));
  assert.equal(c.error, 0, JSON.stringify(res.validation.findings));
  assert.ok(res.circuits.every((x) => x.connected));
});

test('flow conservation: boiler outlet carries total flow', () => {
  const total = res.circuits.reduce((a, c) => a + c.flowLh, 0);
  close(res.totals.flowLh, total, 1e-6);
  const net = res._network;
  const boilerSupplyKey = net.source.supplyKey;
  const outFlow = net.nodes.get(boilerSupplyKey).edges.reduce((a, e) => a + (res.pipes[e.elementId]?.flowLh ?? 0), 0);
  close(outFlow, total, 1e-6);
});

test('every heated room is covered by its emitters', () => {
  for (const r of elementsOf(project, 'room')) {
    const cov = res.rooms[r.id].emitters.coverage;
    assert.ok(cov >= 0.95, `${r.name} coverage ${cov}`);
  }
});

test('balancing reaches ±15 % flow on every radiator circuit', () => {
  for (const c of res.circuits.filter((x) => x.kind === 'radiator')) {
    assert.ok(Math.abs(c.balance.flowAfterPct) <= 15, `${c.elementId}: ${c.balance.flowAfterPct}`);
  }
  // index circuit keeps the valve fully open
  const crit = res.circuits.find((c) => c.elementId === res.critical.elementId);
  if (crit.kind === 'radiator') assert.equal(crit.balance.setting, 'N');
});

test('pump, boiler and expansion vessel selected', () => {
  assert.ok(res.pump.product);
  assert.ok(res.pump.adequate);
  assert.ok(res.boiler.product.powerKw >= res.boiler.requiredKw);
  assert.ok(res.expansion.tank.volumeL >= res.expansion.Vn);
});

test('BOM and cost are consistent', () => {
  const sum = res.bom.rows.reduce((a, r) => a + r.totalUsd, 0);
  close(res.cost.materialUsd, sum, 1e-6);
  for (const r of res.bom.rows) assert.ok(r.purchase >= r.qty - 1e-9, `${r.name} purchase ≥ exact`);
  const pipes = res.bom.rows.filter((r) => r.group === 'pipes');
  const pipeTotal = pipes.reduce((a, r) => a + r.qty, 0);
  close(pipeTotal, res.totals.pipeLength, 1e-6);
  close(res.cost.total, res.cost.totalUsd * project.settings.rates[project.settings.currency], 1e-3);
});

test('dependency chain: changing climate changes load, radiators, flow and cost', () => {
  const p2 = structuredClone(project);
  p2.settings.climate.tOut = -25;
  const r2 = runCalculation(p2);
  assert.ok(r2.totals.heatLoss > res.totals.heatLoss);
  assert.ok(r2.totals.radiatorOutput >= res.totals.radiatorOutput);
  assert.ok(r2.totals.flowLh > res.totals.flowLh);
  assert.ok(r2.cost.totalUsd >= res.cost.totalUsd);
});

test('deterministic: same input → same result', () => {
  const a = runCalculation(project, { noCache: true });
  const b = runCalculation(project, { noCache: true });
  assert.equal(a.totals.heatLoss, b.totals.heatLoss);
  assert.equal(JSON.stringify(a.circuits), JSON.stringify(b.circuits));
});

test('disconnecting a pipe is detected', () => {
  const p2 = structuredClone(project);
  const pipe = elementsOf(p2, 'pipe')[0];
  delete p2.elements[pipe.id];
  const r2 = runCalculation(p2);
  assert.ok(r2.validation.counts.error > 0);
  assert.ok(r2.validation.findings.some((f) => f.code.startsWith('consumer_') || f.code === 'pipe_disconnected'));
});

test('performance: 1000 rooms heat loss under budget', () => {
  const p = structuredClone(project);
  const base = elementsOf(p, 'room')[0];
  for (let i = 0; i < 1000; i++) {
    const r = { ...structuredClone(base), id: `bench_${i}`, guid: `g_${i}` };
    p.elements[r.id] = r;
  }
  const t = Date.now();
  runCalculation(p, { noCache: true });
  assert.ok(Date.now() - t < 15000, 'calc 1000 rooms < 15 s');
});

function close(a, b, tol) {
  assert.ok(Math.abs(a - b) <= tol, `expected ${b} ± ${tol}, got ${a}`);
}

import { createSampleProject } from '../src/core/demo.js';

test('sample project (2-storey, UFH ground floor, convectors upstairs) designs without errors', () => {
  const p = createSampleProject();
  const r = runCalculation(p, { noCache: true });
  assert.equal(r.validation.counts.critical, 0, JSON.stringify(r.validation.findings));
  assert.equal(r.validation.counts.error, 0, JSON.stringify(r.validation.findings));
  const conv = Object.values(r.radiators).filter((x) => x.product?.kind === 'convector');
  assert.ok(conv.length >= 12, 'in-floor convectors on the first floor');
  assert.ok(Object.values(r.radiators).some((x) => x.product?.kind === 'towel'), 'towel dryer');
  const loops = Object.values(r.ufh).flatMap((u) => u.loopIds);
  assert.equal(new Set(loops).size, loops.length, 'unique loop IDs');
  assert.ok(loops.every((id) => /^1\.\d\.\d+$/.test(id)));
  assert.ok(r.circuits.every((c) => c.connected));
});
