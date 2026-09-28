// Design-rules engine, project validation and clash detection.
// Every finding: { id, severity: ok|warning|error|critical, code, params, elementId, rule }.
// Rules are configurable through project.settings (limits) and project.rules (enable/severity).

import { elementsOf, isHeated, levelById, localToPlan } from '../core/model.js';
import { pointInPolygon, projectOnSegment } from '../core/util.js';

export const VALIDATION_VERSION = 'validation/1.1';

export const RULES = [
  { id: 'R01', code: 'room_not_calculated', category: 'thermal', severity: 'error' },
  { id: 'R02', code: 'room_no_heating', category: 'thermal', severity: 'error' },
  { id: 'R03', code: 'room_under_heated', category: 'thermal', severity: 'warning' },
  { id: 'R04', code: 'radiator_no_product', category: 'thermal', severity: 'error' },
  { id: 'R05', code: 'radiator_not_connected', category: 'topology', severity: 'error' },
  { id: 'R06', code: 'pipe_velocity_high', category: 'hydraulic', severity: 'warning' },
  { id: 'R07', code: 'pipe_velocity_critical', category: 'hydraulic', severity: 'critical' },
  { id: 'R08', code: 'pipe_r_high', category: 'hydraulic', severity: 'warning' },
  { id: 'R09', code: 'branch_dp_high', category: 'hydraulic', severity: 'warning' },
  { id: 'R10', code: 'pump_missing', category: 'equipment', severity: 'critical' },
  { id: 'R11', code: 'pump_inadequate', category: 'equipment', severity: 'error' },
  { id: 'R12', code: 'boiler_missing', category: 'equipment', severity: 'critical' },
  { id: 'R13', code: 'boiler_undersized', category: 'equipment', severity: 'error' },
  { id: 'R14', code: 'collector_ports', category: 'equipment', severity: 'error' },
  { id: 'R15', code: 'collector_flow', category: 'equipment', severity: 'warning' },
  { id: 'R16', code: 'ufh_rule', category: 'ufh', severity: 'warning' },
  { id: 'R17', code: 'ufh_no_collector', category: 'ufh', severity: 'error' },
  { id: 'R18', code: 'equipment_clearance', category: 'maintenance', severity: 'warning' },
  { id: 'R19', code: 'clash', category: 'clash', severity: 'error' },
  { id: 'R20', code: 'integrity', category: 'data', severity: 'critical' },
  { id: 'R21', code: 'network', category: 'topology', severity: 'error' },
  { id: 'R22', code: 'expansion', category: 'equipment', severity: 'warning' },
  { id: 'R23', code: 'balance_unreachable', category: 'hydraulic', severity: 'warning' },
  { id: 'R24', code: 'radiator_not_in_room', category: 'thermal', severity: 'warning' },
];

const SEV_ORDER = { ok: 0, warning: 1, error: 2, critical: 3 };

function segIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y), t, u };
}

/**
 * Clash detection: pipes vs obstacles (beams, ducts, cable trays, structure) with elevation
 * overlap, pipes vs pipes of different systems at the same elevation, and pipe/wall crossings
 * (reported as penetrations requiring sleeves, not errors).
 */
export function clashDetection(project, res) {
  const clashes = [];
  let sleeves = 0;
  const pipes = elementsOf(project, 'pipe');
  const obstacles = elementsOf(project, 'obstacle');
  const walls = elementsOf(project, 'wall');
  const status = project.clashStatus ?? {};
  let n = 0;
  const push = (a, b, pos, severity, kind) => {
    const id = `CL-${String(++n).padStart(3, '0')}`;
    const key = [a, b].sort().join('~');
    clashes.push({ id, key, a, b, pos, severity, kind, status: status[key]?.status ?? 'new', assignee: status[key]?.assignee ?? '' });
  };
  for (const p of pipes) {
    const dn = res.pipes[p.id]?.dInner ?? 0.02;
    const zP = p.elevation ?? project.settings.pipeElevation;
    for (let i = 1; i < p.points.length; i++) {
      const a = p.points[i - 1];
      const b = p.points[i];
      for (const o of obstacles) {
        if (o.levelId !== p.levelId) continue;
        const hit = segIntersect(a, b, o.a, o.b);
        if (!hit) continue;
        const zOk = zP + dn / 2 < (o.zBottom ?? 0) || zP - dn / 2 > (o.zTop ?? 99);
        if (!zOk) push(p.id, o.id, hit, o.kind === 'beam' ? 'critical' : 'error', `pipe×${o.kind ?? 'obstacle'}`);
      }
      for (const w of walls) {
        if (w.levelId !== p.levelId) continue;
        const hit = segIntersect(a, b, w.a, w.b);
        if (hit && hit.t > 0.001 && hit.t < 0.999) sleeves++;
      }
    }
  }
  // pipe × pipe (different system, same elevation band); within 0.6 m of a manifold the pipes rise
  // to their outlets (they cross there in plan only), so that zone is not a clash
  const manifolds = elementsOf(project, 'collector');
  const atManifold = (hit, levelId) => manifolds.some((c) => c.levelId === levelId && Math.hypot(hit.x - c.x, hit.y - c.y) < 0.6 + 0.05 * (c.outlets ?? 4));
  for (let i = 0; i < pipes.length; i++) {
    for (let j = i + 1; j < pipes.length; j++) {
      const p = pipes[i];
      const q = pipes[j];
      if (p.levelId !== q.levelId || p.system === q.system) continue;
      const zp = p.elevation ?? project.settings.pipeElevation;
      const zq = q.elevation ?? project.settings.pipeElevation;
      if (Math.abs(zp - zq) >= 0.04) continue;
      for (let a = 1; a < p.points.length; a++) {
        for (let b = 1; b < q.points.length; b++) {
          const hit = segIntersect(p.points[a - 1], p.points[a], q.points[b - 1], q.points[b]);
          if (hit && hit.t > 0.01 && hit.t < 0.99 && hit.u > 0.01 && hit.u < 0.99 && !atManifold(hit, p.levelId)) push(p.id, q.id, hit, 'warning', 'pipe×pipe');
        }
      }
    }
  }
  return { clashes, sleeves };
}

export function validate(project, res, net) {
  const s = project.settings;
  const disabled = new Set(project.rulesDisabled ?? []);
  const findings = [];
  const add = (ruleId, severity, code, params = {}, elementId = null) => {
    if (disabled.has(ruleId)) return;
    findings.push({ id: `${ruleId}-${findings.length + 1}`, rule: ruleId, severity, code, params, elementId });
  };

  // thermal
  for (const r of elementsOf(project, 'room')) {
    const hl = res.rooms[r.id];
    if (!hl || !(hl.inputs.area > 0)) {
      add('R01', 'error', 'room_not_calculated', { room: r.name }, r.id);
      continue;
    }
    for (const w of hl.warnings) add('R01', 'warning', w.code, w.params, r.id);
    if (!isHeated(r) || hl.required <= 0) continue;
    const radOut = hl.emitters?.radiatorOutput ?? 0;
    const ufhOut = hl.emitters?.ufhOutput ?? res.ufh[r.id]?.Qout ?? 0;
    const cover = (radOut + ufhOut) / hl.required;
    if (radOut + ufhOut <= 0) add('R02', 'error', 'room_no_heating', { room: r.name, q: Math.round(hl.required) }, r.id);
    else if (cover < 0.95) {
      // a bathroom with only a comfort floor is normal practice → warning, never an error
      const comfort = (r.roomType === 'bathroom' || r.roomType === 'wc') && r.heating === 'ufh';
      add('R03', cover < 0.85 && !comfort ? 'error' : 'warning', 'room_under_heated', { room: r.name, pct: Math.round(cover * 100) }, r.id);
    }
    if ((r.heating === 'ufh' || r.heating === 'mixed') && !r.ufh?.collectorId && !r.ufh?.collectorIds?.length && !r.ufh?.transit) add('R17', 'error', 'ufh_no_collector', { room: r.name }, r.id);
  }
  for (const [id, rr] of Object.entries(res.radiators)) {
    if (!rr.product) add('R04', 'error', 'radiator_no_product', {}, id);
    if (!rr.roomId) add('R24', 'warning', 'radiator_not_in_room', {}, id);
    for (const w of rr.selection?.warnings ?? []) add('R04', 'warning', w.code, w.params, id);
  }
  for (const [roomId, u] of Object.entries(res.ufh)) for (const w of u.warnings) {
    // in 'mixed' rooms radiators cover what the floor cannot; coverage rule R02/R03 judges the room
    if (w.code === 'ufh_insufficient' && project.elements[roomId]?.heating === 'mixed') continue;
    add('R16', w.code === 'ufh_insufficient' ? 'error' : 'warning', w.code, w.params, roomId);
  }

  // topology
  for (const i of net.issues) {
    const sev = i.severity === 'critical' ? 'critical' : i.severity;
    if (i.code === 'no_source') add('R12', 'critical', 'boiler_missing');
    else if (i.code.startsWith('consumer_')) add('R05', sev, i.code, i.params, i.elementId);
    else add('R21', sev, i.code, i.params, i.elementId);
  }

  // hydraulic
  for (const p of Object.values(res.pipes)) {
    if (p.status === 'critical') add('R07', 'critical', 'pipe_velocity_critical', { v: p.v.toFixed(2), max: s.velCritical, dn: p.dn }, p.elementId);
    else if (p.vM3s > 0 && p.v > s.velMax) add('R06', 'warning', 'pipe_velocity_high', { v: p.v.toFixed(2), max: s.velMax, dn: p.dn }, p.elementId);
    if (p.vM3s > 0 && p.R > s.maxRPaM) add('R08', 'warning', 'pipe_r_high', { R: Math.round(p.R), max: s.maxRPaM }, p.elementId);
    for (const w of p.sizing?.warnings ?? []) if (w.code !== 'velocity_low') add('R06', 'warning', w.code, w.params, p.elementId);
  }
  for (const c of res.circuits) {
    if (!c.connected) continue;
    const branch = c.dpTotal - (c.dpBoiler ?? 0); // boiler resistance is common to all circuits
    if (branch / 1000 > s.maxBranchKpa) add('R09', 'warning', 'branch_dp_high', { dp: (branch / 1000).toFixed(1), max: s.maxBranchKpa }, c.elementId);
    if (c.balance && Math.abs(c.balance.flowAfterPct ?? 0) > 15) add('R23', 'warning', 'balance_unreachable', { pct: c.balance.flowAfterPct.toFixed(0) }, c.elementId);
  }

  // equipment
  const hasConsumers = res.circuits.some((c) => c.connected);
  if (hasConsumers) {
    if (!res.pump.product) add('R10', 'critical', 'pump_missing', { q: res.pump.q.toFixed(2), h: res.pump.h.toFixed(2) });
    else if (!res.pump.element && !res.pump.builtIn) add('R10', 'error', 'pump_not_placed', { model: res.pump.product.model });
    else if (res.pump.adequate === false) add('R11', 'error', 'pump_inadequate', { model: res.pump.product.model, h: res.pump.h.toFixed(2) }, res.pump.element);
  }
  if (res.boiler.element) {
    if (!res.boiler.product) add('R13', 'error', 'boiler_none', { kw: res.boiler.requiredKw.toFixed(1) }, res.boiler.element);
    else if (res.boiler.product.powerKw < res.boiler.requiredKw) add('R13', 'error', 'boiler_undersized', { kw: res.boiler.product.powerKw, req: res.boiler.requiredKw.toFixed(1) }, res.boiler.element);
  } else if (elementsOf(project, 'room').length) {
    add('R12', 'critical', 'boiler_missing');
  }
  for (const w of res.expansion?.warnings ?? []) add('R22', 'warning', w.code, w.params);

  // collectors: ports in use and capacity
  for (const c of elementsOf(project, 'collector')) {
    if (c.kind === 'ufh') {
      const loops = res.ufhPorts?.[c.id] ?? 0;
      if (loops > 12) add('R14', 'error', 'collector_ports', { used: loops, max: 12 }, c.id);
    }
    const flow = res.circuits.filter((x) => x.connected && x.path.some((pid) => pid === c.id || String(pid).startsWith(c.id))).reduce((a, x) => a + x.vM3h, 0);
    if (flow > 3.5) add('R15', 'warning', 'collector_flow', { q: flow.toFixed(2), max: 3.5 }, c.id);
  }

  // clearance / maintenance: boiler & pump service zone (0.6 m in front must be free and inside a room)
  for (const eq of [...elementsOf(project, 'boiler'), ...elementsOf(project, 'collector')]) {
    const front = localToPlan(eq, 0, eq.cat === 'boiler' ? -0.6 : -0.5);
    const rooms = elementsOf(project, 'room', eq.levelId);
    const inRoom = rooms.some((r) => pointInPolygon(front, r.points));
    const walls = elementsOf(project, 'wall', eq.levelId);
    const nearWall = walls.some((w) => projectOnSegment(front, w.a, w.b).d < (w.thickness ?? 0.2) / 2 + 0.05);
    if (!inRoom || nearWall) add('R18', 'warning', 'equipment_clearance', { mark: eq.mark || eq.cat }, eq.id);
    if (!levelById(project, eq.levelId)) add('R20', 'critical', 'integrity', { code: 'bad_level' }, eq.id);
  }

  // clashes
  for (const c of res.clashes?.clashes ?? []) {
    if (c.status === 'resolved' || c.status === 'approved') continue;
    add('R19', c.severity, 'clash', { id: c.id, kind: c.kind }, c.a);
  }

  // data integrity
  for (const p of res.integrity ?? []) add('R20', 'critical', 'integrity', { code: p.code }, p.id);

  const counts = { ok: 0, warning: 0, error: 0, critical: 0 };
  for (const f of findings) counts[f.severity]++;
  const worst = findings.reduce((w, f) => (SEV_ORDER[f.severity] > SEV_ORDER[w] ? f.severity : w), 'ok');
  // checks passed (for dashboard [OK])
  counts.ok = RULES.filter((r) => !disabled.has(r.id) && !findings.some((f) => f.rule === r.id)).length;
  return { version: VALIDATION_VERSION, findings, counts, worst, sleeves: res.clashes?.sleeves ?? 0 };
}
