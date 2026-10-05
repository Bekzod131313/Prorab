// Phase 7B final correction: every loop one physical route (port → supply lead → door → room →
// continuous two-path spiral → terminal closure → return lead → the same outlet pair), measured on
// the final rebuilt geometry. The heating geometry is the frozen Phase 6 planner's; nothing here
// draws or edits a spiral.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as G from '../src/engines/ufh/geom.js';
import { runTransfers, metricsOf, pitchMeasure, loopsOfRun } from '../tools/ufh-transfer-debug.mjs';
import { loopTopology, LOOP_TOPOLOGY_VALID, LOOP_DISCONNECTED, LOOP_CONNECTION_INVALID, TOPOLOGY_FLAGS } from '../src/engines/ufh/looptopology.js';
import { portsOf } from '../src/engines/ufh/collector.js';
import { MAX_LOOP_M, RMIN_CHECK } from '../src/engines/ufh/criteria.js';

const R = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
// a manifold room C (2.0 × 2.4 m, manifold on its south wall) and one target room T behind door D
function synth({ target, obstacles = [], pitch = 0.2, outlets = 6 }) {
  return {
    wallClearance: 0.1,
    obstacleClearance: 0.1,
    pipeType: 'PERT-16x2.0',
    heatingPitch: 0.2,
    leadWallOffset: 0.05,
    collector: { id: 'C-T', at: { x: 0.9, y: 0.05 }, outlets, portPitch_m: 0.05, dropPerPipe_m: 0.4, facing: { x: 0, y: 1 } },
    rooms: [
      { id: 'C', poly: R(0, 0, 2.0, 2.4) },
      { id: 'T', heatingPitch: pitch, poly: target, obstacles },
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
const memo = new Map();
const run = (key, fx, leadSpacing) => {
  if (!memo.has(key)) memo.set(key, runTransfers(fx, { leadSpacing, connect: true }));
  return memo.get(key);
};
const RECT = () => run('rect', synth({ target: R(2.12, 0, 6.1, 3.0) }), 0.05);
const SMALL = () => run('small', synth({ target: R(2.12, 0, 4.6, 2.4) }), 0.05);
const LSHAPE = () => run('L', synth({ target: L_ROOM }), 0.05);
const WIDTH = () => run('width', synth({ target: R(2.12, 0, 5.27, 2.53) }), 0.05);
const OBST = () => run('obst', synth({ target: R(2.12, 0, 5.6, 3.0), obstacles: [R(4.6, 1.0, 5.6, 2.0)] }), 0.05);
const APT = JSON.parse(fs.readFileSync(new URL('./fixtures/apartment-7b.json', import.meta.url), 'utf8'));
const APT50 = () => run('apt50', APT, 0.05);
const APT100 = () => run('apt100', APT, 0.1);

// every loop: valid topology, coverage ≥ 85 %, no crossing, clearance, radius, total ≤ 60 m
function everyLoopValid(r, label) {
  assert.equal(r.transfers.status, 'TRANSFERS_OK', `${label}: ${r.transfers.reasons}`);
  assert.equal(r.transfers.crossings, 0, `${label}: lead crossings`);
  assert.ok(r.converged, `${label}: the leads and the heating settled (no heating near a lead)`);
  assert.equal(r.topology.status, LOOP_TOPOLOGY_VALID, label);
  assert.ok(r.loopRows.length > 0);
  for (const w of r.loopRows) {
    const tag = `${label} ${w.loop}`;
    assert.equal(w.topology, LOOP_TOPOLOGY_VALID, tag);
    for (const f of TOPOLOGY_FLAGS) assert.equal(w.flags[f], true, `${tag} ${f}`);
    assert.ok(w.total_m <= MAX_LOOP_M + 1e-12, `${tag}: total ${w.total_m}`);
    assert.ok(Math.abs(w.total_m - (w.heating_m + w.supply_m + w.return_m + w.drop_m)) < 1e-9, `${tag}: total = heating + supply + return + 2 · drop`);
    assert.ok(w.coverage >= 0.85, `${tag}: coverage ${w.coverage}`);
    assert.equal(w.crossings, 0, `${tag}: crossings`);
    assert.ok(w.leadClearance_m >= r.params.leadSpacing - 1e-9, `${tag}: clearance ${w.leadClearance_m}`);
    assert.ok(w.minRadius_m >= RMIN_CHECK, `${tag}: radius ${w.minRadius_m}`);
    assert.equal(w.status, 'LOOP_VALID', `${tag}: ${w.failed}`);
  }
  // the rooms: coverage(U′) = H / U′ ≥ 85 %, U′ = U − C (the corridor once)
  const m = metricsOf(r);
  for (const [rid, x] of Object.entries(m.rooms)) {
    assert.ok(Math.abs(x.U_m2 - x.C_m2 - x.Uprime_m2) < 1e-4, `${label} ${rid}: U − C = U′`);
    assert.ok(x.coverageUprime >= 0.85, `${label} ${rid}: coverage(U′) ${x.coverageUprime}`);
  }
  return m;
}
const loopsIn = (r, rid) => r.loopRows.filter((w) => w.room === rid);

test('7B-F 1 rectangular room: one route per loop, all valid', () => {
  const r = RECT();
  everyLoopValid(r, 'rect');
  assert.equal(loopsIn(r, 'T').length, 1);
});

test('7B-F 2 irregular (L-shaped) room: all loops valid', () => {
  everyLoopValid(LSHAPE(), 'L');
});

test('7B-F 3 one-loop room', () => {
  const r = SMALL();
  everyLoopValid(r, 'small');
  assert.equal(loopsIn(r, 'T').length, 1);
});

test('7B-F 4 two-loop room: each loop its own subregion, an independent continuous spiral', () => {
  const r = LSHAPE();
  everyLoopValid(r, 'L');
  const T = r.plans.T.loops;
  assert.equal(T.length, 2);
  // own subregions: no overlap; every spiral one polyline from its start to its end
  assert.ok(G.area(G.intersection([T[0].shape], [T[1].shape])) < 1e-6);
  for (const l of T) assert.ok(l.spiral.path.length > 10 && G.pathLength(l.spiral.path) > l.spiral.heatingLength);
});

test('7B-F 5 three-loop rooms (apartment H, LR, BR1)', () => {
  const r = APT50();
  everyLoopValid(r, 'apartment');
  for (const rid of ['H', 'LR', 'BR1']) assert.equal(loopsIn(r, rid).length, 3, rid);
});

test('7B-F 6 leftover width at the right side: the side strip is covered, no gap left there', () => {
  const r = WIDTH();
  everyLoopValid(r, 'width');
  // the right 0.3 m of the target room's U′ (5.27 − 0.1 wall clearance): covered by the heating
  const U = r.transfers.rooms.T.Uprime;
  const bb = G.bbox(U.flatMap((sh) => sh.outer));
  const strip = G.intersection(U, [{ outer: R(bb.x1 - 0.3, bb.y0, bb.x1, bb.y1), holes: [] }]);
  const band = G.bufferPolylines(r.plans.T.loops.map((l) => l.spiral.heating), 0.1 + 0.003);
  const cov = G.area(G.intersection(strip, band)) / G.area(strip);
  assert.ok(cov >= 0.95, `right strip covered ${cov}`);
  assert.equal(loopsIn(r, 'T')[0].largestGap_m2, 0);
});

test('7B-F 7 centre residual closure: the terminal part with residual spacing, ≥ the Phase 5 minimum', () => {
  const r = WIDTH();
  const l = r.plans.T.loops[0];
  const term = l.spiral.residual?.terminal;
  assert.ok(term && term[1] > term[0], 'a residual terminal part');
  const sub = G.subPath(l.spiral.heating, term[0], term[1]);
  const b = G.bbox(sub);
  const sb = G.bbox(l.shape.outer);
  const cx = ((b.x0 + b.x1) / 2 - sb.x0) / (sb.x1 - sb.x0);
  assert.ok(cx > 0.3 && cx < 0.7, `closure in the centre (${cx})`);
  const w = loopsIn(r, 'T')[0];
  assert.ok(w.residual.measured >= 0.1 - 0.002 && w.residual.measured < 0.2, `residual ${w.residual.measured}`);
});

test('7B-F 8 obstacle near the right side: loops valid, no pipe in the obstacle', () => {
  const r = OBST();
  everyLoopValid(r, 'obstacle');
  const ob = [{ outer: R(4.6, 1.0, 5.6, 2.0), holes: [] }];
  for (const l of r.plans.T.loops) assert.equal(G.clipLines([l.spiral.path], ob).reduce((a, q) => a + G.pathLength(q), 0), 0);
  for (const l of r.transfers.leads) assert.equal(G.clipLines([l.path], ob).reduce((a, q) => a + G.pathLength(q), 0), 0);
});

test('7B-F 9 leadSpacing 50 mm on the apartment: TRANSFERS_OK, 50 mm wall offset, pitches measured', () => {
  const r = APT50();
  const m = everyLoopValid(r, 'apartment 50');
  const wall = Math.min(...Object.values(m.rooms).map((x) => x.leadWallMin_m ?? Infinity));
  assert.ok(Math.abs(wall - 0.05) < 1e-6, `wall offset ${wall}`);
  for (const [rid, p] of Object.entries(r.plans)) {
    const want = rid === 'BA' ? 0.15 : 0.2;
    for (const l of p.loops) assert.equal(l.nominalSpacing, want, `${rid} pitch`);
    const pm = pitchMeasure(p.loops);
    assert.ok(pm && Math.abs(pm.d - want) < 1e-6, `${rid} measured pitch ${pm?.d}`);
  }
  // the outlet pairs: one per loop, the supply and the return of a loop on the same pair
  const used = r.topology.loops.map((t) => t.outlet);
  assert.equal(new Set(used).size, used.length);
  assert.ok(used.length <= APT.collector.outlets);
});

test('7B-F 10 leadSpacing 100 mm on the apartment: the bundle does not fit — not forced through', () => {
  const r = APT100();
  assert.notEqual(r.transfers.status, 'TRANSFERS_OK');
  assert.ok(r.transfers.reasons.includes('CORRIDOR_CAPACITY_EXCEEDED'), r.transfers.reasons.join());
  assert.notEqual(r.topology?.status, LOOP_TOPOLOGY_VALID);
});

// the negative topology tests: one valid run, its geometry changed by 10 mm / its links swapped
function topoOf(r, leads) {
  return loopTopology(loopsOfRun(r), leads, { ports: portsOf(r.fx.collector), doors: r.transfers.doors });
}
const copyLeads = (r) => r.transfers.leads.map((l) => ({ ...l, path: l.path.map((q) => ({ ...q })) }));

test('7B-F 11 heating start 10 mm off → LOOP_DISCONNECTED', () => {
  const r = LSHAPE();
  assert.equal(topoOf(r, copyLeads(r)).status, LOOP_TOPOLOGY_VALID);
  const leads = copyLeads(r);
  const s = leads.find((l) => l.loop === 'T.L1' && l.kind === 'supply');
  s.path[s.path.length - 1].x += 0.01;
  const t = topoOf(r, leads);
  const x = t.loops.find((q) => q.id === 'T.L1');
  assert.equal(x.status, LOOP_DISCONNECTED);
  assert.equal(x.flags.heatingStartConnected, false);
  assert.equal(x.flags.wholeLoopConnected, false);
  // the heating end 10 mm off as well
  const leads2 = copyLeads(r);
  const ret = leads2.find((l) => l.loop === 'T.L1' && l.kind === 'return');
  ret.path[ret.path.length - 1].y += 0.01;
  const y = topoOf(r, leads2).loops.find((q) => q.id === 'T.L1');
  assert.equal(y.status, LOOP_DISCONNECTED);
  assert.equal(y.flags.heatingEndConnected, false);
});

test('7B-F 12 disconnected return (lead off its port by 10 mm) → LOOP_DISCONNECTED', () => {
  const r = LSHAPE();
  const leads = copyLeads(r);
  const ret = leads.find((l) => l.loop === 'T.L2' && l.kind === 'return');
  ret.path[0].x += 0.01;
  const x = topoOf(r, leads).loops.find((q) => q.id === 'T.L2');
  assert.equal(x.status, LOOP_DISCONNECTED);
  assert.equal(x.flags.collectorReturnConnected, false);
});

test('7B-F 13 wrong loop connection: supply / return on another loop → LOOP_CONNECTION_INVALID', () => {
  const r = LSHAPE();
  // the supply lead of T.L1 ends on the spiral of T.L2
  const leads = copyLeads(r);
  const s = leads.find((l) => l.loop === 'T.L1' && l.kind === 'supply');
  const other = r.plans.T.loops.find((l) => l.loopId === 'L2').spiral;
  s.path[s.path.length - 1] = { ...other.supply };
  const a = topoOf(r, leads).loops.find((q) => q.id === 'T.L1');
  assert.equal(a.status, LOOP_CONNECTION_INVALID);
  // the return of T.L2 taken from the outlet pair of T.L1
  const leads2 = copyLeads(r);
  const r1 = leads2.find((l) => l.loop === 'T.L1' && l.kind === 'return');
  const r2 = leads2.find((l) => l.loop === 'T.L2' && l.kind === 'return');
  r2.outlet = r1.outlet;
  r2.path[0] = { ...r1.path[0] };
  const b = topoOf(r, leads2).loops.find((q) => q.id === 'T.L2');
  assert.equal(b.status, LOOP_CONNECTION_INVALID);
});

test('7B-F 14 real apartment fixture: every loop one route, the whole zone valid and deterministic', () => {
  const r = APT50();
  everyLoopValid(r, 'apartment');
  const again = runTransfers(APT, { leadSpacing: 0.05, connect: true });
  assert.equal(metricsOf(again).geometryHash, metricsOf(r).geometryHash);
  assert.deepEqual(
    again.loopRows.map((w) => [w.loop, w.outlet, w.total_m]),
    r.loopRows.map((w) => [w.loop, w.outlet, w.total_m]),
  );
});
