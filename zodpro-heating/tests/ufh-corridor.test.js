// Phase 7B: transfer leads (manifold → wall-following → door → wall-following → target-room
// transition) as real engine geometry, the physical corridor exclusion, U' and the frozen Phase 6
// heating loops — on a fixture of the real project type (tests/fixtures/apartment-7b.json) and on
// 101–109.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import crypto from 'crypto';
import * as G from '../src/engines/ufh/geom.js';
import { doorChains } from '../src/engines/ufh/roomgraph.js';
import { planTransfers, routingParams, heatingPitchOf, bundleGeometry } from '../src/engines/ufh/corridor.js';
import { portsOf } from '../src/engines/ufh/collector.js';
import { checkZoneReport, ZONE_REPORT_VERSION } from '../src/engines/ufh/collectorcontract.js';
import { FAN_RADIUS_M } from '../src/engines/ufh/leadcriteria.js';
import { SPACING_TOL, GEOMETRY_NUMERICAL_TOLERANCE, ENGINEERING_COVERAGE_TOLERANCE } from '../src/engines/ufh/criteria.js';
import { usableOf, runTransfers, metricsOf } from '../tools/ufh-transfer-debug.mjs';

const APT = JSON.parse(fs.readFileSync(new URL('./fixtures/apartment-7b.json', import.meta.url), 'utf8'));
const Z101 = JSON.parse(fs.readFileSync(new URL('./fixtures/zone-101-109.json', import.meta.url), 'utf8'));
const D101 = JSON.parse(fs.readFileSync(new URL('./fixtures/doors-101-109.json', import.meta.url), 'utf8'));
const TOL = GEOMETRY_NUMERICAL_TOLERANCE.area_m2;
const paramsOf = (fx, leadSpacing) => ({ heatingPitch: fx.heatingPitch, leadWallOffset: fx.leadWallOffset, leadSpacing, pipeType: fx.pipeType, wallClearance: fx.wallClearance });
const COUNTS = { H: 3, LR: 3, BR1: 3, BA: 2, BR2: 1 };
const transfers = (leadSpacing, over = {}) => planTransfers({ rooms: APT.rooms, doors: APT.doors, collector: APT.collector, loopsByRoom: COUNTS, usable: usableOf(APT), params: paramsOf(APT, leadSpacing), ...over });
const hash = (x) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
// the pipeline (frozen planner on U and U′) once per spacing, shared by the tests
const RUN50 = runTransfers(APT, { leadSpacing: 0.05 });
const M50 = metricsOf(RUN50);

test('7B 1 parameter separation: collectorPortPitch, leadWallOffset, leadSpacing, heatingPitch — required, none a fallback for another', () => {
  const p = paramsOf(APT, 0.05);
  assert.equal(routingParams(p).ok, true);
  for (const k of ['heatingPitch', 'leadWallOffset', 'leadSpacing', 'pipeType', 'wallClearance']) {
    const q = { ...p };
    delete q[k];
    const r = routingParams(q);
    assert.equal(r.status, 'INPUT_INVALID', k);
    // no other value is taken instead (the collector has portPitch_m = 0.05 — never a leadSpacing)
    assert.equal(transfers(0.05, { params: q }).status, 'INPUT_INVALID', k);
  }
  for (const h of [0.05, 0.1, 0.25]) assert.equal(routingParams({ ...p, heatingPitch: h }).ok, false, `heatingPitch ${h}`);
  assert.equal(routingParams({ ...p, pipeType: 'no-such-pipe' }).ok, false);
  assert.equal(routingParams({ ...p, leadSpacing: 0.01 }).ok, false); // < pipe OD 16 mm
  // per room: its own heating pitch or the zone's — never the lead offset or the port pitch
  const PITCH = { H: 0.2, LR: 0.2, BR1: 0.2, BA: 0.15, BR2: 0.2 }; // (the bathroom 150 mm, its own)
  for (const r of APT.rooms) assert.equal(heatingPitchOf(r, routingParams(p).params), PITCH[r.id]);
  // changing the collector port pitch changes neither the lead depths nor the heating pitch
  const a = transfers(0.05);
  const b = transfers(0.05, { collector: { ...APT.collector, portPitch_m: 0.04 } });
  const depthsOf = (tr) => Object.fromEntries(Object.entries(tr.rooms).map(([k, v]) => [k, [v.heatingPitch, v.bundles.map((x) => [x.N, x.depth])]]));
  assert.deepEqual(depthsOf(b), depthsOf(a));
  // changing the lead wall offset moves the bundles, not the heating pitch
  const c = transfers(0.05, { params: { ...paramsOf(APT, 0.05), leadWallOffset: 0.06 } });
  for (const [rid, x] of Object.entries(c.rooms)) {
    assert.equal(x.heatingPitch, a.rooms[rid].heatingPitch);
    x.bundles.forEach((bd, i) => assert.ok(Math.abs(bd.depth - a.rooms[rid].bundles[i].depth - 0.01) < 1e-12));
  }
  // the heating loops of every room at 200 mm (measured), not 50 mm
  for (const [rid, x] of Object.entries(M50.rooms)) {
    for (const l of x.loops) assert.equal(l.nominalSpacing, PITCH[rid], `${rid} ${l.id}`);
    assert.ok(x.minHeatingSpacing_m >= PITCH[rid] - SPACING_TOL, `${rid}: ${x.minHeatingSpacing_m}`);
    assert.ok(x.minHeatingSpacing_m > 0.1, `${rid}: never the 50 mm offset / port pitch`);
  }
});

test('7B 2 corridor width: centreline span (N − 1)·S, physical width span + OD — never N·S; 12 leads at 50 and 100 mm', () => {
  const P = (S) => routingParams(paramsOf(APT, S)).params;
  const g50 = bundleGeometry(12, P(0.05));
  assert.ok(Math.abs(g50.span - 0.55) < 1e-12);
  assert.ok(Math.abs(g50.width - 0.566) < 1e-12);
  assert.ok(Math.abs(g50.depth - (0.05 + 0.55 + 0.008)) < 1e-12);
  assert.ok(Math.abs(g50.doorNeed - 0.65) < 1e-12);
  assert.notEqual(g50.width, 12 * 0.05);
  const g100 = bundleGeometry(12, P(0.1));
  assert.ok(Math.abs(g100.span - 1.1) < 1e-12);
  assert.ok(Math.abs(g100.width - 1.116) < 1e-12);
  assert.ok(Math.abs(g100.depth - (0.05 + 1.1 + 0.008)) < 1e-12);
  assert.ok(Math.abs(g100.doorNeed - 1.2) < 1e-12);
  assert.notEqual(g100.width, 12 * 0.1);
  // the corridor the engine cut matches its bundle: no corridor point deeper than the bundle
  const tr = RUN50.transfers;
  for (const rid of ['H', 'LR']) {
    const room = [{ outer: G.ccw(APT.rooms.find((r) => r.id === rid).poly), holes: [] }];
    const deepest = Math.max(...tr.rooms[rid].bundles.map((b) => b.depth));
    for (const sh of tr.rooms[rid].corridor) for (const q of sh.outer) assert.ok(G.distToRegionBoundary(q, room) <= deepest + 1e-6, `${rid}: corridor point ${JSON.stringify(q)} deeper than ${deepest}`);
  }
});

test("7B 3 area accounting: U, C once, U′ = U − C, H inside U′ (rawcheck's own denominator is U′), coverage = H / U′", () => {
  assert.equal(ENGINEERING_COVERAGE_TOLERANCE, 0);
  const tr = RUN50.transfers;
  for (const [rid, x] of Object.entries(tr.rooms)) {
    const m = M50.rooms[rid];
    // C counted once: C = area(U ∩ corridor); nothing of the corridor left in U′
    assert.ok(Math.abs(x.C_m2 - G.area(G.intersection(x.U, x.corridor))) <= TOL, rid);
    assert.ok(G.area(G.intersection(x.Uprime, x.corridor)) <= TOL, `${rid}: U′ ∩ corridor`);
    assert.ok(Math.abs(x.U_m2 - x.C_m2 - x.Uprime_m2) <= TOL, `${rid}: U − C ≠ U′`);
    // the frozen rawcheck measured on U′: its usable area is U′ (the corridor is not in it, so not subtracted again)
    assert.ok(Math.abs(m.rawcheckUsable_m2 - x.Uprime_m2) <= TOL, `${rid}: rawcheck usable ${m.rawcheckUsable_m2} vs U′ ${x.Uprime_m2}`);
    assert.ok(Math.abs(m.H_m2 + m.rawcheckUncovered_m2 - x.Uprime_m2) <= TOL, `${rid}: H + uncovered ≠ U′`);
    assert.ok(Math.abs(m.coverageUprime - m.H_m2 / x.Uprime_m2) < 1e-12);
    assert.ok(m.H_m2 <= x.Uprime_m2 + TOL);
  }
  // the 7.0 contract on the zone's areas: U′ denominator; coverage over U is rejected
  const sum = (k) => Object.values(M50.rooms).reduce((a, r) => a + r[k], 0);
  const areas = { U_m2: sum('U_m2'), corridor_m2: sum('C_m2'), Uprime_m2: sum('Uprime_m2'), heated_m2: sum('H_m2') };
  areas.coverageUprime = areas.heated_m2 / areas.Uprime_m2;
  const corridors = Object.entries(tr.rooms).filter(([, x]) => x.C_m2 > 0).map(([rid, x]) => ({ id: `K-${rid}`, rooms: [rid], doors: [], leads: Math.max(...x.bundles.map((b) => b.N)), width_m: Math.max(...x.bundles.map((b) => b.width)), area_m2: x.C_m2, poly: x.corridor }));
  const report = { version: ZONE_REPORT_VERSION, zoneId: 'apartment', status: 'ROUTED_VALID', reasons: [], collector: { id: 'C-1', outlets: 12, portsUsed: 0 }, areas, corridors, loops: [] };
  assert.deepEqual(checkZoneReport(report), { ok: true, errors: [] });
  assert.equal(checkZoneReport({ ...report, areas: { ...areas, coverageUprime: areas.heated_m2 / areas.U_m2 } }).ok, false);
  // no heating pipe in a corridor: ≥ heatingPitch / 2 from it
  for (const [rid, p] of Object.entries(RUN50.plans)) {
    const K = tr.rooms[rid].corridor;
    if (!K.length) continue;
    for (const l of p.loops)
      for (const q of G.densify(l.spiral.heating, 0.02)) {
        assert.ok(!G.pointInRegion(q, K), `${rid}: heating pipe in the corridor`);
        assert.ok(G.distToRegionBoundary(q, K) >= tr.rooms[rid].heatingPitch / 2 - SPACING_TOL);
      }
  }
});

test('7B 4 connectivity: no closed / split heating area, no sliver, the transitions reach the target heating zone', () => {
  const tr = RUN50.transfers;
  assert.equal(tr.status, 'TRANSFERS_OK', JSON.stringify(tr.issues));
  for (const [rid, x] of Object.entries(tr.rooms)) {
    assert.equal(x.components.after, x.components.before, rid);
    assert.deepEqual(x.split, []);
    assert.deepEqual(x.slivers, []);
    assert.ok(x.crumbs_m2 < 1e-5, `${rid}: crumbs ${x.crumbs_m2}`);
  }
  // every transfer lead ends on the edge of its target room's heating zone (U′, wallClearance in)
  for (const l of tr.leads) {
    const end = l.path.at(-1);
    assert.ok(G.distToRegionBoundary(end, tr.rooms[l.room].Uprime) < 1e-6, `${l.id} ends ${JSON.stringify(end)}`);
  }
  // at 100 mm the hall cannot hold its 10-lead bundle between the manifold and the corner: reported, not hidden
  const t100 = transfers(0.1);
  assert.ok(t100.reasons.includes('CORRIDOR_CAPACITY_EXCEEDED'));
  assert.ok(t100.issues.some((i) => /does not fit the wall stretch/.test(i.msg)));
});

test('7B lead geometry: manifold → wall at 50 mm → door → wall → target transition; no crossing; leads S apart', () => {
  const tr = RUN50.transfers;
  const prm = tr.params;
  assert.equal(tr.crossings, 0);
  const ports = portsOf(APT.collector);
  const portPts = ports.flatMap((p) => [p.supply, p.ret]);
  const chains = doorChains({ rooms: APT.rooms, doors: APT.doors, collectorAt: APT.collector.at });
  for (const l of tr.leads) {
    // starts on a physical port, passes its doors in order
    assert.ok(portPts.some((q) => Math.hypot(q.x - l.path[0].x, q.y - l.path[0].y) < 1e-9), `${l.id} starts on a port`);
    assert.deepEqual(l.doors, chains.rooms[l.room].doors);
  }
  // supply / return in pairs on one outlet (adjacent ports)
  tr.portOrder.forEach((lid, i) => {
    const s = tr.leads.find((x) => x.id === `${lid}/S`);
    const r = tr.leads.find((x) => x.id === `${lid}/R`);
    if (!s) return; // (the manifold room's own loops: 7C)
    assert.deepEqual([s.path[0], r.path[0]], [ports[i].supply, ports[i].ret]);
  });
  // along the walls the innermost lead is exactly leadWallOffset from the wall
  for (const rid of ['H', 'LR']) assert.ok(Math.abs(M50.rooms[rid].leadWallMin_m - prm.leadWallOffset) < 1e-9, `${rid}: ${M50.rooms[rid].leadWallMin_m}`);
  // two leads never closer than leadSpacing (outside the manifold fan and the door openings)
  const doorsAt = APT.doors.map((d) => d.at);
  const far = (q) => Math.hypot(q.x - APT.collector.at.x, q.y - APT.collector.at.y) > FAN_RADIUS_M && doorsAt.every((d) => Math.hypot(q.x - d.x, q.y - d.y) > 0.6);
  let dmin = Infinity;
  for (let i = 0; i < tr.leads.length; i++) {
    const A = G.densify(tr.leads[i].path, 0.01).filter(far);
    for (let j = i + 1; j < tr.leads.length; j++) {
      const B = tr.leads[j].path;
      for (const q of A) for (let k = 1; k < B.length; k++) dmin = Math.min(dmin, G.segDist(q, B[k - 1], B[k]));
    }
  }
  assert.ok(dmin >= prm.leadSpacing - 1e-6, `lead ↔ lead ${dmin}`);
});

test('7B 101–109 (test variant: the same rooms, a declared 12-outlet manifold): 12 leads — 100 mm door failure, 50 mm passes; room 108 reported', () => {
  const rooms = Z101.rooms.map((r) => ({ id: r.name, poly: r.poly }));
  const fx = { rooms, wallClearance: Z101.wallClearance, obstacleClearance: Z101.obstacleClearance };
  const col = { id: 'C-01/M12', at: Z101.manifold.at, outlets: 12, portPitch_m: 0.05, dropPerPipe_m: 0.4, facing: { x: 0, y: 1 } };
  const run = (S) => planTransfers({ rooms, doors: D101.doors, collector: col, loopsByRoom: { 107: 3, ...D101.loopsByRoom }, usable: usableOf(fx), params: { heatingPitch: 0.2, leadWallOffset: 0.05, leadSpacing: S, pipeType: 'PERT-16x2.0', wallClearance: Z101.wallClearance } });
  const r10 = run(0.1);
  const d03 = r10.doors.find((d) => d.door === 'D-03');
  assert.equal(d03.leads, 12);
  assert.ok(Math.abs(d03.need_m - 1.2) < 1e-12 && !d03.ok);
  assert.ok(r10.reasons.includes('DOOR_CAPACITY_EXCEEDED'));
  const r5 = run(0.05);
  const d03b = r5.doors.find((d) => d.door === 'D-03');
  assert.ok(Math.abs(d03b.need_m - 0.65) < 1e-12 && d03b.ok);
  assert.ok(!r5.reasons.includes('DOOR_CAPACITY_EXCEEDED'));
  // room 108: transit (10 leads to 101) + target; its corridor reported
  const b108 = r5.rooms['108'];
  assert.match(b108.role, /transit/);
  assert.equal(b108.bundles[0].N, 10);
  assert.ok(Math.abs(b108.bundles[0].width - (9 * 0.05 + 0.016)) < 1e-12);
  assert.ok(Math.abs(b108.U_m2 - b108.C_m2 - b108.Uprime_m2) <= TOL);
  // every lead runs along the walls: no lead point of a transit room deeper than its bundle
  // (regression: the two ways round 108 are almost equally long — the far door positions must
  // stay on the chosen side, never a straight cut through the room)
  for (const rid of ['107', '108']) {
    const room = [{ outer: G.ccw(rooms.find((r) => r.id === rid).poly), holes: [] }];
    const deepest = Math.max(...r5.rooms[rid].bundles.map((b) => b.depth));
    for (const pp of r5.roomPieces[rid]) for (const q of G.densify(pp, 0.02)) if (G.pointInRegion(q, room)) assert.ok(G.distToRegionBoundary(q, room) <= deepest + 1e-6, `${rid}: lead point ${JSON.stringify(q)} off the wall`);
    assert.equal(r5.rooms[rid].components.after, r5.rooms[rid].components.before, rid);
  }
  // C-01 stands 0.40 m from the wall: inside the 12-lead bundle (0.05…0.60 m) — no crossing-free order, reported
  assert.ok(r5.reasons.includes('LEAD_ORDER_INFEASIBLE'));
  // with the 6 physical outlets of C-01: OUTLET_SHORTAGE, nothing routed
  assert.equal(planTransfers({ rooms, doors: D101.doors, collector: { ...col, outlets: 6 }, loopsByRoom: { 107: 3, ...D101.loopsByRoom }, usable: usableOf(fx), params: { heatingPitch: 0.2, leadWallOffset: 0.05, leadSpacing: 0.05, pipeType: 'PERT-16x2.0', wallClearance: Z101.wallClearance } }).status, 'OUTLET_SHORTAGE');
});

test('7B determinism: the same input → the same leads, corridors, U′ and loops (hash)', () => {
  const a = transfers(0.05);
  const b = transfers(0.05);
  const strip = (tr) => ({ leads: tr.leads, portOrder: tr.portOrder, rooms: Object.fromEntries(Object.entries(tr.rooms).map(([k, v]) => [k, [v.U_m2, v.C_m2, v.Uprime_m2, v.corridor, v.Uprime]])) });
  assert.equal(hash(strip(a)), hash(strip(b)));
  const again = metricsOf(runTransfers(APT, { leadSpacing: 0.05 }));
  assert.equal(again.geometryHash, M50.geometryHash);
});
