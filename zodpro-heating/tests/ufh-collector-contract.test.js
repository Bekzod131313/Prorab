// Phase 7.0: the interface contract (collectorcontract.js) — a valid input / ZoneReport passes, and
// every rule catches its own violation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCollectorInput, checkZoneReport, ZONE_REPORT_VERSION } from '../src/engines/ufh/collectorcontract.js';
import { LEAD_STATUSES, ROUTED_VALID, isBlocking } from '../src/engines/ufh/leadcriteria.js';
import { ENGINEERING_COVERAGE_TOLERANCE, GEOMETRY_NUMERICAL_TOLERANCE } from '../src/engines/ufh/criteria.js';

const box = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const INPUT = {
  collector: { id: 'C-01', at: { x: 5.315, y: 13.64 }, outlets: 6, portPitch_m: 0.05, dropPerPipe_m: 0.4, facing: { x: 0, y: 1 } },
  rooms: [{ id: '107', poly: box(0.08, 13.24, 5.72, 18.68) }, { id: '108', poly: box(3.28, 7.24, 5.72, 13.08) }],
  doors: [{ id: 'D-03', between: ['107', '108'], at: { x: 4.65, y: 13.16 }, width_m: 0.8 }],
  params: { TRANSIT_PITCH_M: 0.1 },
};
const clone = (x) => JSON.parse(JSON.stringify(x));

const loop = (i, heating, supply, ret, drop = 0.4) => {
  const total = heating + supply + ret + 2 * drop;
  const margin = 60 - total;
  return { loopId: `L${i + 1}`, regionId: 'R1', portIndex: i, supplyPath: [{ x: 0, y: 0 }, { x: 1, y: 0 }], returnPath: [{ x: 0, y: 0.1 }, { x: 1, y: 0.1 }], heatingLength: heating, supplyLength: supply, returnLength: ret, dropLength: drop, totalLength: total, margin, lowMargin: margin < 0.25, estimatedLead: false };
};
const REPORT = {
  version: ZONE_REPORT_VERSION,
  zoneId: 'Z1',
  status: ROUTED_VALID,
  reasons: ['LOW_MARGIN'],
  collector: { id: 'C-01', outlets: 6, portsUsed: 2 },
  areas: { U_m2: 30, corridor_m2: 0.6, Uprime_m2: 29.4, heated_m2: 27, coverageUprime: 27 / 29.4 },
  corridors: [{ id: 'K1', rooms: ['107'], doors: [], leads: 4, width_m: 0.4, area_m2: 0.6, poly: box(0, 0, 1.5, 0.4) }],
  loops: [loop(0, 50, 3, 3.2), loop(1, 55, 2.1, 2.0)],
};

test('7.0 contract: the statuses of step 7 — blocking ones and the LOW_MARGIN warning', () => {
  assert.equal(Object.keys(LEAD_STATUSES).length, 13);
  assert.ok(isBlocking('OUTLET_SHORTAGE') && isBlocking('REPLAN_NOT_CONVERGED') && isBlocking('LEAD_ROUTE_NOT_FOUND'));
  assert.ok(!isBlocking('LOW_MARGIN') && !isBlocking(ROUTED_VALID));
  assert.equal(ENGINEERING_COVERAGE_TOLERANCE, 0);
  assert.equal(GEOMETRY_NUMERICAL_TOLERANCE.area_m2, 1e-4);
});

test('7.0 contract: a valid input passes; each input rule catches its violation', () => {
  assert.deepEqual(checkCollectorInput(INPUT), { ok: true, errors: [] });
  const bad = (f, at) => {
    const x = clone(INPUT);
    f(x);
    const r = checkCollectorInput(x);
    assert.ok(!r.ok && r.errors.some((q) => q.at.startsWith(at)), `${at}: ${JSON.stringify(r.errors)}`);
  };
  bad((x) => delete x.collector.dropPerPipe_m, 'collector.dropPerPipe_m'); // no hidden default drop
  bad((x) => (x.collector.outlets = 0), 'collector.outlets');
  bad((x) => (x.collector.outlets = 6.5), 'collector.outlets');
  bad((x) => (x.collector.facing = { x: 1, y: 1 }), 'collector.facing');
  bad((x) => (x.collector.ports = [{ index: 0, supply: { x: 0, y: 0 }, ret: { x: 0.05, y: 0 } }]), 'collector.ports'); // fewer ports than outlets
  bad((x) => (x.doors[0].between = ['107', '999']), 'doors[0].between');
  bad((x) => (x.doors[0].width_m = 0), 'doors[0].width_m');
  bad((x) => x.rooms.push({ id: '107', poly: box(0, 0, 1, 1) }), 'rooms[2].id');
  bad((x) => (x.params.TRANSIT_PITCH_M = -1), 'params.TRANSIT_PITCH_M');
});

test('7.0 contract: a valid ZoneReport passes; the corridor areas, lengths and ports are enforced', () => {
  assert.deepEqual(checkZoneReport(REPORT), { ok: true, errors: [] });
  const bad = (f, at) => {
    const x = clone(REPORT);
    f(x);
    const r = checkZoneReport(x);
    assert.ok(!r.ok && r.errors.some((q) => q.at.startsWith(at)), `${at}: ${JSON.stringify(r.errors)}`);
  };
  // the corridor decision: U − corridor = U′, coverage = heated / U′ (not / U)
  bad((x) => (x.areas.Uprime_m2 = 30), 'areas');
  bad((x) => (x.areas.coverageUprime = 27 / 30), 'areas');
  bad((x) => (x.corridors[0].area_m2 = 0.5), 'corridors');
  bad((x) => (x.areas.heated_m2 = 29.5), 'areas');
  // lengths: the drop counted twice, the margin, LOW_MARGIN
  bad((x) => (x.loops[0].totalLength = x.loops[0].heatingLength + x.loops[0].supplyLength + x.loops[0].returnLength + x.loops[0].dropLength), 'loops[0].totalLength');
  bad((x) => (x.loops[1].lowMargin = !x.loops[1].lowMargin), 'loops[1].lowMargin');
  // physical ports: never twice, never past the outlets
  bad((x) => (x.loops[1].portIndex = 0), 'loops[1].portIndex');
  bad((x) => (x.loops[1].portIndex = 6), 'loops[1].portIndex');
  bad((x) => (x.collector.portsUsed = 7), 'collector');
  // ROUTED_VALID: real leads, ≤ 60 m, coverage reached
  bad((x) => (x.loops[0].estimatedLead = true), 'loops[0].estimatedLead');
  bad((x) => Object.assign(x.loops[0], loop(0, 54.2, 2.5, 2.500000001)), 'loops[0].totalLength'); // 60.000000001 > 60
  bad((x) => Object.assign(x.areas, { heated_m2: 24, coverageUprime: 24 / 29.4 }), 'areas.coverageUprime');
  bad((x) => (x.reasons = ['LOW_MARGIN', 'LEAD_SPACING']), 'reasons');
  bad((x) => (x.status = 'LOW_MARGIN'), 'status');
});

test('7.0 contract: a blocking report (OUTLET_SHORTAGE) carries loops without ports or leads', () => {
  const r = clone(REPORT);
  r.status = 'OUTLET_SHORTAGE';
  r.reasons = ['OUTLET_SHORTAGE'];
  r.collector = { id: 'C-01', outlets: 6, portsUsed: 0 };
  r.loops = r.loops.map((l) => ({ ...l, portIndex: null, supplyPath: [], returnPath: [], estimatedLead: true }));
  assert.deepEqual(checkZoneReport(r), { ok: true, errors: [] });
});
