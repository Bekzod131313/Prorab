// UFH Coverage Router — step 7.0: the interface contract of the collector-integrated router
// (docs/phase7/SPEC.md). Executable checks of what goes in (manifold, rooms, doors) and what comes
// out (ZoneReport) — every later sub-phase (7A–7E) produces and consumes exactly these shapes.
//
// ZoneReport
//   { version, zoneId, status: ROUTED_VALID | a blocking status, reasons: [status…],
//     collector: { id, outlets, portsUsed },
//     areas: { U_m2, corridor_m2, Uprime_m2, heated_m2, coverageUprime },
//     corridors: [{ id, rooms: [...], doors: [...], leads: n, width_m, area_m2, poly }],
//     loops: [{ loopId, regionId, portIndex, supplyPath, returnPath, heatingLength, supplyLength,
//               returnLength, dropLength, totalLength, margin, lowMargin, estimatedLead }] }
//   areas — the corridor decision (SPEC §9): U' = U − corridor exclusion, coverage = heated / U';
//   U − corridor − U' within GEOMETRY_NUMERICAL_TOLERANCE (numerics only, never acceptance);
//   coverage acceptance with ENGINEERING_COVERAGE_TOLERANCE (0).
//   loops — supplyLength / returnLength are the routed leads; dropLength the manifold drop of ONE
//   pipe (total counts it twice); totalLength = heating + supply + return + 2 · drop.

import { MAX_LOOP_M, LOOP_LENGTH_EPS, ENGINEERING_FINAL_COVERAGE, ENGINEERING_COVERAGE_TOLERANCE, GEOMETRY_NUMERICAL_TOLERANCE, LOOP_LOW_MARGIN_M } from './criteria.js';
import { LEAD_STATUSES, ROUTED_VALID } from './leadcriteria.js';

export const ZONE_REPORT_VERSION = 'ufh-router-zone/7';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const point = (p) => p && finite(p.x) && finite(p.y);
const path = (a) => Array.isArray(a) && a.every(point);

/** Input of the collector-integrated router: { collector, rooms, doors, params }. */
export function checkCollectorInput(inp) {
  const errors = [];
  const e = (code, at, msg) => errors.push({ code, at, msg });
  const c = inp?.collector;
  if (!c) e('MANIFOLD_PORTS_INVALID', 'collector', 'no collector');
  else {
    if (typeof c.id !== 'string' || !c.id) e('MANIFOLD_PORTS_INVALID', 'collector.id', 'id missing');
    if (!point(c.at)) e('MANIFOLD_PORTS_INVALID', 'collector.at', 'position missing');
    if (!Number.isInteger(c.outlets) || c.outlets < 1) e('MANIFOLD_PORTS_INVALID', 'collector.outlets', 'physical outlets: an integer ≥ 1');
    if (!finite(c.portPitch_m) || c.portPitch_m <= 0) e('MANIFOLD_PORTS_INVALID', 'collector.portPitch_m', '> 0 required');
    // the manifold drop has no default: a hidden constant would change every loop total
    if (!finite(c.dropPerPipe_m) || c.dropPerPipe_m < 0) e('MANIFOLD_PORTS_INVALID', 'collector.dropPerPipe_m', 'required (m per pipe, ≥ 0)');
    if (!point(c.facing) || Math.abs(Math.hypot(c.facing.x, c.facing.y) - 1) > 1e-9) e('MANIFOLD_PORTS_INVALID', 'collector.facing', 'unit vector required');
    if (c.ports !== undefined) {
      if (!Array.isArray(c.ports) || c.ports.length !== c.outlets) e('MANIFOLD_PORTS_INVALID', 'collector.ports', 'one port pair per physical outlet');
      else {
        const idx = new Set(c.ports.map((p) => p.index));
        if (idx.size !== c.outlets || ![...idx].every((i) => Number.isInteger(i) && i >= 0 && i < c.outlets)) e('MANIFOLD_PORTS_INVALID', 'collector.ports', 'indices 0…outlets−1, each once');
        if (!c.ports.every((p) => point(p.supply) && point(p.ret))) e('MANIFOLD_PORTS_INVALID', 'collector.ports', 'supply / return points');
      }
    }
  }
  const rooms = inp?.rooms ?? [];
  if (!Array.isArray(rooms)) e('INPUT_INVALID', 'rooms', 'array');
  const ids = new Set();
  for (const [i, r] of rooms.entries()) {
    if (typeof r.id !== 'string' || ids.has(r.id)) e('INPUT_INVALID', `rooms[${i}].id`, 'unique id');
    ids.add(r.id);
    if (!path(r.poly) || r.poly.length < 3) e('INPUT_INVALID', `rooms[${i}].poly`, 'polygon ≥ 3 points');
  }
  for (const [i, d] of (inp?.doors ?? []).entries()) {
    if (typeof d.id !== 'string') e('INPUT_INVALID', `doors[${i}].id`, 'id');
    if (!Array.isArray(d.between) || d.between.length !== 2 || d.between[0] === d.between[1] || !d.between.every((x) => ids.has(x))) e('INPUT_INVALID', `doors[${i}].between`, 'two different known rooms');
    if (!point(d.at)) e('INPUT_INVALID', `doors[${i}].at`, 'position');
    if (!finite(d.width_m) || d.width_m <= 0) e('INPUT_INVALID', `doors[${i}].width_m`, 'clear width > 0');
  }
  for (const [k, v] of Object.entries(inp?.params ?? {})) if (!finite(v) || v <= 0) e('INPUT_INVALID', `params.${k}`, '> 0');
  return { ok: errors.length === 0, errors };
}

/** Output of the collector-integrated router (see the header). */
export function checkZoneReport(rep) {
  const errors = [];
  const e = (at, msg) => errors.push({ at, msg });
  const known = (s) => s === ROUTED_VALID || s in LEAD_STATUSES;
  if (rep?.version !== ZONE_REPORT_VERSION) e('version', `${ZONE_REPORT_VERSION} expected`);
  if (!known(rep?.status) || rep?.status === 'LOW_MARGIN') e('status', 'ROUTED_VALID or a blocking status');
  if (!Array.isArray(rep?.reasons) || !rep.reasons.every(known)) e('reasons', 'known statuses only');
  const c = rep?.collector;
  if (!c || !Number.isInteger(c.outlets) || !Number.isInteger(c.portsUsed) || c.portsUsed > c.outlets) e('collector', 'portsUsed ≤ physical outlets');
  // the corridor decision: U' = U − corridor, coverage = heated / U'
  const a = rep?.areas;
  if (!a || !['U_m2', 'corridor_m2', 'Uprime_m2', 'heated_m2', 'coverageUprime'].every((k) => finite(a[k]))) e('areas', 'U_m2, corridor_m2, Uprime_m2, heated_m2, coverageUprime');
  else {
    if (a.corridor_m2 < 0 || a.Uprime_m2 <= 0 || a.heated_m2 < 0) e('areas', 'non-negative, U′ > 0');
    if (Math.abs(a.U_m2 - a.corridor_m2 - a.Uprime_m2) > GEOMETRY_NUMERICAL_TOLERANCE.area_m2) e('areas', 'U − corridor ≠ U′');
    if (a.heated_m2 > a.Uprime_m2 + GEOMETRY_NUMERICAL_TOLERANCE.area_m2) e('areas', 'heated > U′');
    if (Math.abs(a.coverageUprime - a.heated_m2 / a.Uprime_m2) > 1e-12) e('areas', 'coverage ≠ heated / U′');
  }
  const corrSum = (rep?.corridors ?? []).reduce((s, k) => s + (finite(k.area_m2) ? k.area_m2 : NaN), 0);
  if (a && finite(a.corridor_m2) && !(Math.abs(corrSum - a.corridor_m2) <= GEOMETRY_NUMERICAL_TOLERANCE.area_m2)) e('corridors', 'Σ corridor areas ≠ corridor_m2');
  const loops = rep?.loops;
  if (!Array.isArray(loops)) e('loops', 'array');
  const ports = new Set();
  for (const [i, l] of (loops ?? []).entries()) {
    const at = `loops[${i}]`;
    for (const k of ['heatingLength', 'supplyLength', 'returnLength', 'dropLength', 'totalLength', 'margin']) if (!finite(l[k])) e(`${at}.${k}`, 'number');
    if (finite(l.totalLength) && Math.abs(l.totalLength - (l.heatingLength + l.supplyLength + l.returnLength + 2 * l.dropLength)) > 1e-9) e(`${at}.totalLength`, 'heating + supply + return + 2 · drop');
    if (finite(l.margin) && Math.abs(l.margin - (MAX_LOOP_M - l.totalLength)) > 1e-12) e(`${at}.margin`, '60 − total');
    if (finite(l.margin) && l.lowMargin !== l.margin < LOOP_LOW_MARGIN_M) e(`${at}.lowMargin`, `margin < ${LOOP_LOW_MARGIN_M}`);
    if (l.portIndex !== null) {
      if (!Number.isInteger(l.portIndex) || l.portIndex < 0 || (c && l.portIndex >= c.outlets)) e(`${at}.portIndex`, 'a physical port');
      if (ports.has(l.portIndex)) e(`${at}.portIndex`, 'port used twice');
      ports.add(l.portIndex);
    }
    if (!path(l.supplyPath ?? null) || !path(l.returnPath ?? null)) e(`${at}.paths`, 'supplyPath / returnPath arrays of points');
  }
  if (rep?.status === ROUTED_VALID) {
    // a valid zone: every loop on its own physical port, real leads, ≤ 60 m, coverage reached
    if (rep.reasons.some((s) => LEAD_STATUSES[s] === 'blocking')) e('reasons', 'ROUTED_VALID with a blocking reason');
    for (const [i, l] of (loops ?? []).entries()) {
      if (l.estimatedLead !== false) e(`loops[${i}].estimatedLead`, 'false required');
      if (l.portIndex === null) e(`loops[${i}].portIndex`, 'a port required');
      if (!(l.totalLength <= MAX_LOOP_M + LOOP_LENGTH_EPS)) e(`loops[${i}].totalLength`, '≤ 60 m');
      if (!(l.supplyPath?.length >= 2 && l.returnPath?.length >= 2)) e(`loops[${i}].paths`, 'routed leads');
    }
    if (c && c.portsUsed !== (loops ?? []).length) e('collector.portsUsed', 'one port per loop');
    if (a && !(a.coverageUprime >= ENGINEERING_FINAL_COVERAGE - ENGINEERING_COVERAGE_TOLERANCE)) e('areas.coverageUprime', `≥ ${ENGINEERING_FINAL_COVERAGE}`);
  }
  return { ok: errors.length === 0, errors };
}
