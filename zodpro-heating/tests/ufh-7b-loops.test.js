// Phase 7B: the frozen Phase 6 heating output is an IMMUTABLE input. 7B only routes the real
// leads to its spiral ends (port → supply lead → door → room → heating start … heating end →
// return lead → the same outlet pair), checks the topology and measures / reports. A Phase 6
// loop that fails a limit is reported with a named status — never re-spiralled, re-partitioned,
// split or given an extra loop.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as G from '../src/engines/ufh/geom.js';
import { runTransfers, metricsOf, pitchMeasure, loopsOfRun, phase6GeometryHash } from '../tools/ufh-transfer-debug.mjs';
import { loopTopology, LOOP_TOPOLOGY_VALID, LOOP_DISCONNECTED, LOOP_CONNECTION_INVALID, TOPOLOGY_FLAGS } from '../src/engines/ufh/looptopology.js';
import { referenceCheck, PHASE6_REFERENCE_OK, PHASE6_REFERENCE_MISMATCH } from '../src/engines/ufh/phase6reference.js';
import { portsOf } from '../src/engines/ufh/collector.js';
import { MAX_LOOP_M } from '../src/engines/ufh/criteria.js';

const R = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
// a manifold room C (2.0 × 2.4 m, manifold on its south wall) and one target room T behind door D
function synth({ target, obstacles = [] }) {
  return {
    wallClearance: 0.1,
    obstacleClearance: 0.1,
    pipeType: 'PERT-16x2.0',
    heatingPitch: 0.2,
    leadWallOffset: 0.05,
    collector: { id: 'C-T', at: { x: 0.9, y: 0.05 }, outlets: 6, portPitch_m: 0.05, dropPerPipe_m: 0.4, facing: { x: 0, y: 1 } },
    rooms: [
      { id: 'C', poly: R(0, 0, 2.0, 2.4) },
      { id: 'T', poly: target, obstacles },
    ],
    doors: [{ id: 'D', between: ['C', 'T'], at: { x: 2.06, y: 0.8 }, width_m: 0.9 }],
  };
}
const L_ROOM = [
  { x: 2.12, y: 0 },
  { x: 7.0, y: 0 },
  { x: 7.0, y: 4.2 },
  { x: 4.6, y: 4.2 },
  { x: 4.6, y: 2.4 },
  { x: 2.12, y: 2.4 },
];
const FX = {
  small: synth({ target: R(2.12, 0, 4.6, 2.4) }),
  L: synth({ target: L_ROOM }),
  obst: synth({ target: R(2.12, 0, 5.6, 3.0), obstacles: [R(4.6, 1.0, 5.6, 2.0)] }),
  width: synth({ target: R(2.12, 0, 5.27, 2.53) }),
  apt: JSON.parse(fs.readFileSync(new URL('./fixtures/apartment-7b.json', import.meta.url), 'utf8')),
};
const memo = new Map();
const run = (k, ls = 0.05, connect = true) => {
  const key = `${k}/${ls}/${connect}`;
  if (!memo.has(key)) memo.set(key, runTransfers(FX[k], { leadSpacing: ls, connect }));
  return memo.get(key);
};

// what holds for EVERY connected run, whatever the frozen geometry is like
function frozenAndReported(r, label) {
  // the Phase 6 output untouched: the same hash before / after 7B and as an independent Phase 6 run
  assert.equal(r.phase6Mutated, false, `${label}: Phase 6 geometry mutated`);
  assert.equal(r.phase6HashAfter, r.phase6Hash);
  assert.equal(r.loopCountChanged, false);
  const k = Object.keys(FX).find((x) => FX[x] === r.fx);
  const plain = run(k, r.params.leadSpacing, false);
  assert.equal(phase6GeometryHash(plain.plans), r.phase6Hash, `${label}: 7B heating = the Phase 6 output`);
  // every frozen loop reported exactly once, with the real lengths and named statuses
  const ids = loopsOfRun(r).map((l) => l.id);
  assert.deepEqual(r.loopRows.map((w) => w.loop), ids);
  for (const w of r.loopRows) {
    const tag = `${label} ${w.loop}`;
    assert.ok(Math.abs(w.total_m - (w.heating_m + w.supply_m + w.return_m + w.drop_m)) < 1e-9, `${tag}: total = heating + supply + return + 2 · drop`);
    assert.equal(w.total_m > MAX_LOOP_M + 1e-12, w.statuses.includes('REAL_LEAD_LENGTH_INVALID'), `${tag}: 60 m status`);
    if (w.coverage < 0.85) assert.ok(w.statuses.includes('PHASE6_COVERAGE_INSUFFICIENT'), `${tag}: coverage ${w.coverage} hidden`);
    if (w.crossings > 0 || w.leadClearance_m < r.params.leadSpacing - 1e-9) assert.ok(w.statuses.includes('LEAD_HEATING_CLASH'), tag);
    if (w.reference.status === PHASE6_REFERENCE_MISMATCH) assert.ok(w.statuses.includes(PHASE6_REFERENCE_MISMATCH), tag);
    assert.equal(w.status, w.statuses.length ? 'LOOP_INVALID' : 'LOOP_VALID', tag);
  }
  // rooms: U − C = U′, H on the final U′ ≤ U′
  for (const [rid, x] of Object.entries(metricsOf(r).rooms)) {
    assert.ok(Math.abs(x.U_m2 - x.C_m2 - x.Uprime_m2) < 1e-4, `${label} ${rid}: U − C = U′`);
    assert.ok(x.H_m2 <= x.Uprime_m2 + 1e-9);
  }
}
const topoOk = (r, label) => {
  assert.equal(r.topology.status, LOOP_TOPOLOGY_VALID, label);
  for (const t of r.topology.loops) for (const f of TOPOLOGY_FLAGS) assert.equal(t.flags[f], true, `${label} ${t.id} ${f}`);
};

test('7B-A frozen 1-loop geometry + real leads: one physical route, heating untouched', () => {
  const r = run('small');
  frozenAndReported(r, 'small');
  topoOk(r, 'small');
  assert.equal(r.transfers.crossings, 0);
  assert.equal(r.plans.T.loops.length, 1);
  // the leads end exactly on the frozen spiral ends
  const sp = r.plans.T.loops[0].spiral;
  const ends = r.transfers.leads.filter((l) => l.loop === 'T.L1').map((l) => l.path.at(-1));
  for (const e of ends) assert.ok(Math.min(Math.hypot(e.x - sp.supply.x, e.y - sp.supply.y), Math.hypot(e.x - sp.ret.x, e.y - sp.ret.y)) < 1e-9);
});

test('7B-B frozen 2-loop geometry + real leads: routed without crossing, the lengths reported as they are', () => {
  const r = run('L');
  frozenAndReported(r, 'L');
  topoOk(r, 'L');
  assert.equal(r.plans.T.loops.length, 2);
  assert.equal(r.transfers.crossings, 0);
});

test('7B-C frozen 3-loop geometry + real leads: topology, every failure named', () => {
  const r = run('obst');
  frozenAndReported(r, 'obstacle');
  topoOk(r, 'obstacle');
  assert.equal(r.plans.T.loops.length, 3);
  // a lead crossing is never silent: the transfers say it and the loops it touches say it
  if (r.transfers.crossings > 0) assert.ok(r.transfers.reasons.includes('LEAD_INTERSECTION'));
});

function topoOf(r, leads) {
  return loopTopology(loopsOfRun(r), leads, { ports: portsOf(r.fx.collector), doors: r.transfers.doors });
}
const copyLeads = (r) => r.transfers.leads.map((l) => ({ ...l, path: l.path.map((q) => ({ ...q })) }));
const lead = (leads, loop, kind) => leads.find((l) => l.loop === loop && l.kind === kind);

test('7B-D topology negative: heating start / heating end 10 mm off → LOOP_DISCONNECTED', () => {
  const r = run('L');
  assert.equal(topoOf(r, copyLeads(r)).status, LOOP_TOPOLOGY_VALID);
  const a = copyLeads(r);
  lead(a, 'T.L1', 'supply').path.at(-1).x += 0.01;
  const x = topoOf(r, a).loops.find((q) => q.id === 'T.L1');
  assert.equal(x.status, LOOP_DISCONNECTED);
  assert.equal(x.flags.heatingStartConnected, false);
  assert.equal(x.flags.wholeLoopConnected, false);
  const b = copyLeads(r);
  lead(b, 'T.L1', 'return').path.at(-1).y += 0.01;
  const y = topoOf(r, b).loops.find((q) => q.id === 'T.L1');
  assert.equal(y.status, LOOP_DISCONNECTED);
  assert.equal(y.flags.heatingEndConnected, false);
});

test('7B-E supply disconnected (10 mm off its port) → LOOP_DISCONNECTED', () => {
  const r = run('L');
  const a = copyLeads(r);
  lead(a, 'T.L2', 'supply').path[0].x += 0.01;
  const x = topoOf(r, a).loops.find((q) => q.id === 'T.L2');
  assert.equal(x.status, LOOP_DISCONNECTED);
  assert.equal(x.flags.collectorSupplyConnected, false);
});

test('7B-F return disconnected (10 mm off its port) → LOOP_DISCONNECTED', () => {
  const r = run('L');
  const a = copyLeads(r);
  lead(a, 'T.L2', 'return').path[0].y += 0.01;
  const x = topoOf(r, a).loops.find((q) => q.id === 'T.L2');
  assert.equal(x.status, LOOP_DISCONNECTED);
  assert.equal(x.flags.collectorReturnConnected, false);
});

test('7B-G wrong loop connection → LOOP_CONNECTION_INVALID', () => {
  const r = run('L');
  // the supply of T.L1 on the spiral of T.L2
  const a = copyLeads(r);
  lead(a, 'T.L1', 'supply').path[lead(a, 'T.L1', 'supply').path.length - 1] = { ...r.plans.T.loops[1].spiral.supply };
  assert.equal(topoOf(r, a).loops.find((q) => q.id === 'T.L1').status, LOOP_CONNECTION_INVALID);
  // the return of T.L2 on the outlet pair of T.L1
  const b = copyLeads(r);
  const r1 = lead(b, 'T.L1', 'return');
  const r2 = lead(b, 'T.L2', 'return');
  r2.outlet = r1.outlet;
  r2.path[0] = { ...r1.path[0] };
  assert.equal(topoOf(r, b).loops.find((q) => q.id === 'T.L2').status, LOOP_CONNECTION_INVALID);
});

test('7B-H leadSpacing 50 mm (apartment): leads 50 mm from the wall, heating pitch measured 200 / 150 mm', () => {
  const r = run('apt');
  frozenAndReported(r, 'apartment 50');
  const m = metricsOf(r);
  const wall = Math.min(...Object.values(m.rooms).map((x) => x.leadWallMin_m ?? Infinity));
  assert.ok(Math.abs(wall - 0.05) < 1e-6, `wall offset ${wall}`);
  for (const [rid, p] of Object.entries(r.plans)) {
    const want = rid === 'BA' ? 0.15 : 0.2;
    for (const l of p.loops) assert.equal(l.nominalSpacing, want, rid);
    const pm = pitchMeasure(p.loops);
    assert.ok(pm && Math.abs(pm.d - want) < 1e-6, `${rid} measured pitch ${pm?.d}`);
  }
});

test('7B-I leadSpacing 100 mm (apartment): the bundle does not fit → CORRIDOR_CAPACITY_EXCEEDED, not forced', () => {
  const r = run('apt', 0.1);
  assert.notEqual(r.transfers.status, 'TRANSFERS_OK');
  assert.ok(r.transfers.reasons.includes('CORRIDOR_CAPACITY_EXCEEDED'), r.transfers.reasons.join());
  assert.equal(r.phase6Mutated ?? false, false);
});

test('7B-J real apartment: every frozen loop routed and reported; failures named, none hidden; deterministic', () => {
  const r = run('apt');
  frozenAndReported(r, 'apartment');
  assert.equal(r.loopRows.length, 12);
  const row = (id) => r.loopRows.find((w) => w.loop === id);
  // the frozen BA.L1 (Phase 6: 84 %) stays 84 % — reported, not repaired
  assert.ok(row('BA.L1').coverage < 0.85 && row('BA.L1').statuses.includes('PHASE6_COVERAGE_INSUFFICIENT'));
  // the frozen BR2.L1 with its real leads over 60 m — reported (7D replans), not shortened here
  assert.ok(row('BR2.L1').total_m > 60 && row('BR2.L1').statuses.includes('REAL_LEAD_LENGTH_INVALID'));
  const again = runTransfers(FX.apt, { leadSpacing: 0.05, connect: true });
  assert.equal(metricsOf(again).geometryHash, metricsOf(r).geometryHash);
  assert.deepEqual(
    again.loopRows.map((w) => [w.loop, w.outlet, w.total_m, w.statuses]),
    r.loopRows.map((w) => [w.loop, w.outlet, w.total_m, w.statuses]),
  );
});

test('7B-K right-side residual (reference): checked on the frozen Phase 6 output; a centre closure → PHASE6_REFERENCE_MISMATCH', () => {
  // the check itself: a hand-made spiral whose final pass runs along the right side → OK
  const shape = { outer: R(0, 0, 2.0, 1.2), holes: [] };
  const heating = [
    { x: 0.1, y: 0.1 },
    { x: 1.9, y: 0.1 },
    { x: 1.9, y: 1.1 },
    { x: 0.1, y: 1.1 },
    { x: 0.1, y: 0.3 },
    { x: 1.7, y: 0.3 },
    { x: 1.7, y: 0.9 },
    { x: 0.3, y: 0.9 },
    { x: 0.3, y: 0.5 },
    { x: 1.5, y: 0.5 },
    { x: 1.5, y: 0.7 },
    { x: 1.9, y: 0.7 },
  ];
  const n = G.pathLength(heating);
  const ok = referenceCheck({ shape, spiral: { heating, residual: { terminal: [n - 0.4, n] } } }, 0.2);
  assert.equal(ok.status, PHASE6_REFERENCE_OK, ok.reasons.join());
  // the frozen Phase 6 output of a room with a leftover width: its closure is where Phase 6 put it
  const r = run('width');
  const l = r.plans.T.loops[0];
  const c = referenceCheck(l, 0.2);
  assert.ok(c.terminal, 'a terminal closure');
  assert.equal(c.status, PHASE6_REFERENCE_MISMATCH, 'the frozen spiral ends in the centre, not along the side');
  assert.ok(c.terminal.centre.u > 0.3 && c.terminal.centre.u < 0.7);
  assert.ok(r.loopRows.find((w) => w.loop === 'T.L1').statuses.includes(PHASE6_REFERENCE_MISMATCH));
});

test('7B-L Phase 6 output immutability: hash before 7B = hash after 7B = an independent Phase 6 run', () => {
  for (const k of ['small', 'L', 'obst', 'width', 'apt']) {
    const r = run(k);
    const plain = run(k, 0.05, false);
    assert.equal(r.phase6Hash, phase6GeometryHash(plain.plans), k);
    assert.equal(r.phase6HashAfter, r.phase6Hash, k);
    assert.deepEqual(
      Object.fromEntries(Object.entries(r.plans).map(([rid, p]) => [rid, p.loops.map((l) => l.loopId)])),
      Object.fromEntries(Object.entries(plain.plans).map(([rid, p]) => [rid, p.loops.map((l) => l.loopId)])),
      k,
    );
  }
  // a mutation is caught: one point of one spiral moved by 1 µm changes the hash
  const r = run('small');
  const copy = structuredClone(r.plans);
  copy.T.loops[0].spiral.heating[5].x += 1e-6;
  assert.notEqual(phase6GeometryHash(copy), r.phase6Hash);
});
