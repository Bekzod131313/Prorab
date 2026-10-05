// Phase 7B: room graph, transit corridors (physical exclusions), U' — and the three separate
// parameters collectorPortPitch / leadWallOffset / heatingPitch (docs/phase7/SPEC.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import * as G from '../src/engines/ufh/geom.js';
import { doorChains, roomOf } from '../src/engines/ufh/roomgraph.js';
import { planCorridors, routingParams, heatingPitchOf, slotLine } from '../src/engines/ufh/corridor.js';
import { spiralRegions } from '../src/engines/ufh/decompose.js';
import { planLoops } from '../src/engines/ufh/loopplanner.js';
import { checkZoneReport, ZONE_REPORT_VERSION } from '../src/engines/ufh/collectorcontract.js';
import { SPACING_TOL, GEOMETRY_NUMERICAL_TOLERANCE } from '../src/engines/ufh/criteria.js';

const box = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const WALL_CLEARANCE = 0.2;
const usableOf = (rooms) => Object.fromEntries(rooms.map((r) => [r.id, G.offset([{ outer: G.ccw(r.poly), holes: [] }], -WALL_CLEARANCE, 'miter')]));

// three rooms in a row (0.1 m walls): A holds the manifold, B is passed, C is the target
const ROOMS = [
  { id: 'A', poly: box(0, 0, 4, 4) },
  { id: 'B', poly: box(4.1, 0, 8.1, 4) },
  { id: 'C', poly: box(8.2, 0, 11.2, 3) },
];
const DOORS = [
  { id: 'AB', between: ['A', 'B'], at: { x: 4.05, y: 0.8 }, width_m: 0.9 },
  { id: 'BC', between: ['B', 'C'], at: { x: 8.15, y: 0.8 }, width_m: 0.9 },
];
const COLLECTOR = { id: 'M', at: { x: 2, y: 0 }, outlets: 6, portPitch_m: 0.05, dropPerPipe_m: 0.4, facing: { x: 0, y: 1 } };
// the real project values: leadWallOffset 50 mm, heating 200 mm; leadSpacing is a test input
const PARAMS = { heatingPitch: 0.2, leadWallOffset: 0.05, leadSpacing: 0.1 };
const base = (over = {}) => ({ rooms: ROOMS, doors: DOORS, collector: COLLECTOR, loopsByRoom: { B: 1, C: 2 }, usable: usableOf(ROOMS), params: PARAMS, ...over });

const planRoom = (U, s, toward) => {
  const res = spiralRegions(U, s, { toward });
  return planLoops(res, U, s, { leadTo: (p) => man(toward, p), manifold: null, toward });
};

test('7B parameters: heatingPitch, leadWallOffset, leadSpacing required — no default; heatingPitch only 0.15 / 0.20 m', () => {
  assert.equal(routingParams(PARAMS).ok, true);
  assert.equal(routingParams({ ...PARAMS, heatingPitch: 0.15 }).ok, true);
  for (const k of ['heatingPitch', 'leadWallOffset', 'leadSpacing']) {
    const p = { ...PARAMS };
    delete p[k];
    const r = routingParams(p);
    assert.equal(r.status, 'INPUT_INVALID', k);
    assert.ok(r.errors.some((e) => e.startsWith(k)));
  }
  // the other two values never pass as a heating pitch
  for (const h of [0.05, 0.1, 0.25]) assert.equal(routingParams({ ...PARAMS, heatingPitch: h }).ok, false, `${h}`);
  assert.equal(planCorridors(base({ params: { leadWallOffset: 0.05, leadSpacing: 0.1 } })).status, 'INPUT_INVALID');
  // per room: its own heating pitch, else the zone's
  assert.equal(heatingPitchOf({ id: 'X' }, PARAMS), 0.2);
  assert.equal(heatingPitchOf({ id: 'X', heatingPitch: 0.15 }, PARAMS), 0.15);
  assert.throws(() => heatingPitchOf({ id: 'X', heatingPitch: 0.05 }, PARAMS));
});

test('7B room graph: door chains by Dijkstra; 101–109: 107 (manifold) → D-03 → 108 → D-04 → 101; no door → LEAD_ROUTE_NOT_FOUND', () => {
  const Z = JSON.parse(fs.readFileSync(new URL('./fixtures/zone-101-109.json', import.meta.url), 'utf8'));
  const D = JSON.parse(fs.readFileSync(new URL('./fixtures/doors-101-109.json', import.meta.url), 'utf8'));
  const rooms = Z.rooms.map((r) => ({ id: r.name, poly: r.poly }));
  const c = doorChains({ rooms, doors: D.doors, collectorAt: Z.manifold.at });
  assert.equal(c.collectorRoom, '107');
  assert.deepEqual(c.rooms['107'].doors, []);
  assert.deepEqual(c.rooms['108'].doors, ['D-03']);
  assert.deepEqual(c.rooms['101'].doors, ['D-03', 'D-04']);
  // the Phase 6 fixture's own chains agree
  for (const r of Z.rooms) assert.deepEqual(c.rooms[r.name].doors, r.via);
  const cut = doorChains({ rooms, doors: D.doors.filter((d) => d.id !== 'D-04'), collectorAt: Z.manifold.at });
  assert.equal(cut.rooms['101'].reachable, false);
  assert.equal(cut.rooms['101'].status, 'LEAD_ROUTE_NOT_FOUND');
  assert.equal(roomOf(rooms, { x: -5, y: -5 }), null);
  const pc = planCorridors({ rooms, doors: D.doors.filter((d) => d.id !== 'D-04'), collector: { ...COLLECTOR, at: Z.manifold.at }, loopsByRoom: D.loopsByRoom, usable: usableOf(rooms), params: PARAMS });
  assert.ok(pc.reasons.includes('LEAD_ROUTE_NOT_FOUND'));
});

test('7B corridors are physical: every lead slot centreline lies in its corridor, slot j at leadWallOffset + j·leadSpacing from the wall', () => {
  const r = planCorridors(base());
  assert.equal(r.status, 'CORRIDORS_OK', JSON.stringify(r.issues));
  // A carries C's and B's leads (2 + 4 = 6) to door AB; B carries C's 4 leads to BC; C: none (transition)
  assert.deepEqual(r.rooms.A.exits, [{ door: 'AB', leads: 6 }]);
  assert.deepEqual(r.rooms.B.exits, [{ door: 'BC', leads: 4 }]);
  assert.equal(r.rooms.C.pieces.length, 0);
  for (const id of ['A', 'B']) {
    const room = [{ outer: G.ccw(ROOMS.find((x) => x.id === id).poly), holes: [] }];
    assert.ok(r.rooms[id].pieces.length > 0);
    for (const pc of r.rooms[id].pieces) {
      assert.ok(Math.abs(pc.e - (PARAMS.leadWallOffset + (pc.N - 1) * PARAMS.leadSpacing + PARAMS.heatingPitch / 2)) < 1e-12);
      for (let j = 0; j < pc.N; j++) {
        const pts = G.densify(slotLine(pc, j, PARAMS), 0.02);
        const want = PARAMS.leadWallOffset + j * PARAMS.leadSpacing;
        let dmin = Infinity;
        for (const q of pts) {
          assert.ok(G.pointInRegion(q, pc.band) || G.distToRegionBoundary(q, pc.band) < 1e-6, `${id} slot ${j} outside its corridor`);
          dmin = Math.min(dmin, G.distToRegionBoundary(q, room));
        }
        assert.ok(Math.abs(dmin - want) < 1e-9, `${id} slot ${j}: ${dmin} ≠ ${want}`);
      }
    }
  }
});

test('7B A: the collector port pitch (50 mm) never becomes the heating pitch — the corridor edge and the slots do not depend on it', () => {
  const r5 = planCorridors(base());
  const r8 = planCorridors(base({ collector: { ...COLLECTOR, portPitch_m: 0.08 } }));
  for (const id of ['A', 'B', 'C']) assert.equal(r8.rooms[id].heatingPitch, r5.rooms[id].heatingPitch);
  assert.deepEqual(r8.rooms.A.pieces.map((p) => [p.N, p.e]), r5.rooms.A.pieces.map((p) => [p.N, p.e]));
  assert.ok(Math.abs(r8.rooms.B.Uprime_m2 - r5.rooms.B.Uprime_m2) < 1e-12); // (only the port row's own length in A)
  for (const r of [r5, r8]) for (const id of ['A', 'B', 'C']) assert.notEqual(r.rooms[id].heatingPitch, COLLECTOR.portPitch_m);
});

test('7B B: the lead wall offset (50 mm) never becomes the heating pitch — it moves the corridor only', () => {
  const r5 = planCorridors(base());
  const r8 = planCorridors(base({ params: { ...PARAMS, leadWallOffset: 0.08 } }));
  for (const id of ['A', 'B', 'C']) {
    assert.equal(r5.rooms[id].heatingPitch, 0.2);
    assert.equal(r8.rooms[id].heatingPitch, 0.2);
  }
  r5.rooms.B.pieces.forEach((p, i) => assert.ok(Math.abs(r8.rooms.B.pieces[i].e - p.e - 0.03) < 1e-12));
  assert.ok(r8.rooms.B.corridor_m2 > r5.rooms.B.corridor_m2);
});

test('7B C: heating pitch 200 mm stays 200 mm in the target room (and 150 mm stays 150) — frozen Phase 6 planner', () => {
  for (const h of [0.2, 0.15]) {
    const r = planCorridors(base({ params: { ...PARAMS, heatingPitch: h } }));
    const s = r.rooms.C.heatingPitch;
    assert.equal(s, h);
    const plan = planRoom(r.rooms.C.Uprime, s, DOORS[1].at);
    assert.ok(plan.loops.length > 0);
    for (const l of plan.loops) assert.equal(l.nominalSpacing, h);
    assert.ok(plan.check.minSpacing >= h - SPACING_TOL, `min spacing ${plan.check.minSpacing}`);
    assert.ok(plan.check.minSpacing > PARAMS.leadWallOffset + 0.05 && plan.check.minSpacing > COLLECTOR.portPitch_m + 0.05);
  }
  // a different pitch per room: manifold room 150 mm, target 200 mm
  const rooms = [{ ...ROOMS[0], heatingPitch: 0.15 }, ROOMS[1], { ...ROOMS[2], heatingPitch: 0.2 }];
  const r = planCorridors(base({ rooms, usable: usableOf(rooms) }));
  assert.equal(r.rooms.A.heatingPitch, 0.15);
  assert.equal(r.rooms.C.heatingPitch, 0.2);
  for (const l of planRoom(r.rooms.C.Uprime, r.rooms.C.heatingPitch, DOORS[1].at).loops) assert.equal(l.nominalSpacing, 0.2);
});

test("7B D: U, corridor exclusion, U', heated area and coverage(U') consistent; no heating pipe in a corridor", () => {
  const r = planCorridors(base());
  const tol = GEOMETRY_NUMERICAL_TOLERANCE.area_m2;
  for (const id of ['A', 'B', 'C']) {
    const x = r.rooms[id];
    assert.ok(Math.abs(x.U_m2 - x.corridor_m2 - x.Uprime_m2) <= tol, `${id}`);
    assert.ok(Math.abs(G.area(G.intersection(x.Uprime, x.corridor))) <= tol, `${id}: U′ ∩ corridor`);
  }
  assert.ok(r.rooms.A.corridor_m2 > 0 && r.rooms.B.corridor_m2 > 0 && r.rooms.C.corridor_m2 === 0);
  assert.ok(Math.abs(r.areas.U_m2 - r.areas.corridor_m2 - r.areas.Uprime_m2) <= tol);
  // the manifold room heated on U′ by the frozen planner: heated / U′, and the 7.0 contract
  const A = r.rooms.A;
  const plan = planRoom(A.Uprime, A.heatingPitch, COLLECTOR.at);
  assert.ok(Math.abs(plan.check.usable_m2 - A.Uprime_m2) <= tol);
  const heated = plan.check.usable_m2 - plan.check.uncovered_m2;
  const coverage = heated / A.Uprime_m2;
  assert.ok(Math.abs(coverage - plan.check.coverage) < 1e-6);
  const report = {
    version: ZONE_REPORT_VERSION,
    zoneId: 'A',
    status: 'ROUTED_VALID',
    reasons: [],
    collector: { id: 'M', outlets: 6, portsUsed: 0 },
    areas: { U_m2: A.U_m2, corridor_m2: A.corridor_m2, Uprime_m2: A.Uprime_m2, heated_m2: heated, coverageUprime: heated / A.Uprime_m2 },
    corridors: r.corridors.filter((k) => k.rooms[0] === 'A'),
    loops: [],
  };
  assert.deepEqual(checkZoneReport(report), { ok: true, errors: [] });
  // coverage over U would differ: the contract rejects it
  assert.equal(checkZoneReport({ ...report, areas: { ...report.areas, coverageUprime: heated / A.U_m2 } }).ok, false);
  // no collision: every heating pipe outside the corridor, ≥ heatingPitch/2 from it
  for (const l of plan.loops)
    for (const q of G.densify(l.spiral.heating, 0.02)) {
      assert.ok(!G.pointInRegion(q, A.corridor), 'heating pipe inside the corridor');
      assert.ok(G.distToRegionBoundary(q, A.corridor) >= A.heatingPitch / 2 - SPACING_TOL);
    }
});

test('7B door capacity: 2·leadWallOffset + (N − 1)·leadSpacing ≤ width — exact boundary', () => {
  // door BC carries 4 leads: 0.1 + 3 · 0.1 = 0.4 m
  const at = (w) => planCorridors(base({ doors: [DOORS[0], { ...DOORS[1], width_m: w }] }));
  assert.ok(!at(0.4).reasons.includes('DOOR_CAPACITY_EXCEEDED'));
  assert.ok(at(0.4 - 1e-6).reasons.includes('DOOR_CAPACITY_EXCEEDED'));
});

test('7B a corridor never closes off heating area: a narrow transit room → CORRIDOR_CAPACITY_EXCEEDED', () => {
  const rooms = [ROOMS[0], { id: 'B', poly: box(4.1, 0, 4.9, 4) }, { id: 'C', poly: box(5, 0, 8, 3) }];
  const doors = [DOORS[0], { id: 'BC', between: ['B', 'C'], at: { x: 4.95, y: 3.2 }, width_m: 2 }];
  const r = planCorridors({ ...base(), rooms, doors, usable: usableOf(rooms), loopsByRoom: { C: 6 } });
  assert.ok(r.reasons.includes('CORRIDOR_CAPACITY_EXCEEDED'), JSON.stringify(r.issues));
});

test('7B on 101–109: chains, leads per door and the door capacity depend on leadSpacing (an explicit input)', () => {
  const Z = JSON.parse(fs.readFileSync(new URL('./fixtures/zone-101-109.json', import.meta.url), 'utf8'));
  const D = JSON.parse(fs.readFileSync(new URL('./fixtures/doors-101-109.json', import.meta.url), 'utf8'));
  const rooms = Z.rooms.map((r) => ({ id: r.name, poly: r.poly }));
  const run = (leadSpacing) => planCorridors({ rooms, doors: D.doors, collector: { ...COLLECTOR, at: Z.manifold.at }, loopsByRoom: D.loopsByRoom, usable: usableOf(rooms), params: { ...PARAMS, leadSpacing } });
  const r10 = run(0.1);
  assert.deepEqual(r10.rooms['107'].exits, [{ door: 'D-03', leads: 12 }]);
  assert.deepEqual(r10.rooms['108'].exits, [{ door: 'D-04', leads: 10 }]);
  // 12 leads at 100 mm: 0.1 + 11 · 0.1 = 1.2 m > 0.9 m door → DOOR_CAPACITY_EXCEEDED (D-03 and D-04)
  assert.deepEqual(r10.issues.filter((x) => x.status === 'DOOR_CAPACITY_EXCEEDED').map((x) => x.door), ['D-03', 'D-04']);
  // at 50 mm: 0.1 + 11 · 0.05 = 0.65 m ≤ 0.9 m
  assert.ok(!run(0.05).reasons.includes('DOOR_CAPACITY_EXCEEDED'));
  for (const x of Object.values(r10.rooms)) assert.ok(Math.abs(x.U_m2 - x.corridor_m2 - x.Uprime_m2) <= GEOMETRY_NUMERICAL_TOLERANCE.area_m2);
});
