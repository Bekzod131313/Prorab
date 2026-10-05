// UFH Coverage Router — step 7A: the PHYSICAL manifold (collector) model.
//
//   ports      one supply + one return connection per physical outlet, nothing more: the port
//              list is never extended (no virtual outlets). Plan geometry: the 2·outlets
//              connections stand in a row along the manifold (u = facing turned −90°), centred
//              on `at`, portPitch_m apart; outlet i = supply at slot 2i, return at slot 2i + 1.
//              Given ports (manufacturer geometry) are used as they are, after the same checks.
//   capacity   required loops ≤ physical outlets, else OUTLET_SHORTAGE — the zone is not routed;
//              the report names the outlets missing (a recommendation, the model is not changed)
//   assignment one loop ↔ one outlet, each outlet at most once (the order comes from the caller;
//              the crossing-free order is step 7C's)
//   drop       the pipe from a port down into the floor: dropPerPipe_m (an input, no default),
//              counted for the supply AND the return — total = heating + supply + return + 2·drop

import { validateLoopLength, lengthOk } from './loopplanner.js';
import { MAX_LOOP_M, LOOP_LOW_MARGIN_M } from './criteria.js';
import { checkCollectorInput } from './collectorcontract.js';

const PORT_TOL = 1e-9;

/** The physical ports of a manifold: [{ index, supply: {x,y}, ret: {x,y} }], one per outlet. */
export function portsOf(col) {
  if (col.ports) return col.ports.map((p) => ({ index: p.index, supply: { ...p.supply }, ret: { ...p.ret } })).sort((a, b) => a.index - b.index);
  const u = { x: col.facing.y, y: -col.facing.x };
  const n = 2 * col.outlets;
  const slot = (j) => {
    const t = (j - (n - 1) / 2) * col.portPitch_m;
    return { x: col.at.x + t * u.x, y: col.at.y + t * u.y };
  };
  return Array.from({ length: col.outlets }, (_, i) => ({ index: i, supply: slot(2 * i), ret: slot(2 * i + 1) }));
}

/** Port checks: count = outlets, supply ↔ return of an outlet portPitch_m apart, no two connections closer. */
export function checkPorts(col) {
  const input = checkCollectorInput({ collector: col, rooms: [], doors: [] });
  const errors = input.errors.filter((e) => e.code === 'MANIFOLD_PORTS_INVALID').map((e) => `${e.at}: ${e.msg}`);
  if (errors.length) return { ok: false, status: 'MANIFOLD_PORTS_INVALID', errors };
  const P = portsOf(col);
  if (P.length !== col.outlets) errors.push(`ports ${P.length} ≠ outlets ${col.outlets}`);
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  for (const p of P) if (Math.abs(d(p.supply, p.ret) - col.portPitch_m) > PORT_TOL) errors.push(`outlet ${p.index}: supply ↔ return ${d(p.supply, p.ret)} ≠ ${col.portPitch_m}`);
  const pts = P.flatMap((p) => [p.supply, p.ret]);
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (d(pts[i], pts[j]) < col.portPitch_m - PORT_TOL) errors.push(`connections ${i} / ${j} closer than ${col.portPitch_m}`);
  return errors.length ? { ok: false, status: 'MANIFOLD_PORTS_INVALID', errors } : { ok: true, status: 'PORTS_OK', errors: [] };
}

/** Required loops against the physical outlets. */
export function capacity(requiredLoops, col) {
  const available = col.outlets;
  if (requiredLoops <= available) return { status: 'OUTLETS_OK', required: requiredLoops, available, missing: 0, recommendation: null };
  return {
    status: 'OUTLET_SHORTAGE',
    required: requiredLoops,
    available,
    missing: requiredLoops - available,
    // (a recommendation only — no outlet is added to the model)
    recommendation: `${requiredLoops} loops need ${requiredLoops} physical outlets: a manifold with ≥ ${requiredLoops} outlets, or the zone split over several manifolds`,
  };
}

/**
 * One loop ↔ one physical outlet. `order`: loop ids in port order (default: the loops' order).
 * Over capacity: OUTLET_SHORTAGE and no assignment at all (never a partial or virtual one).
 */
export function assignPorts(loops, col, order = null) {
  const cap = capacity(loops.length, col);
  if (cap.status !== 'OUTLETS_OK') return { status: cap.status, capacity: cap, assignments: [] };
  const ports = portsOf(col);
  const ids = order ?? loops.map((l) => l.loopId);
  if (ids.length !== loops.length || new Set(ids).size !== ids.length || !ids.every((id) => loops.some((l) => l.loopId === id))) throw new Error('assignPorts: order must list every loop once');
  const assignments = ids.map((loopId, i) => ({ loopId, portIndex: ports[i].index, supply: ports[i].supply, ret: ports[i].ret }));
  return { status: 'ASSIGNED', capacity: cap, assignments };
}

/**
 * Loop total with routed leads and the manifold drop (one per pipe, supply and return):
 * total = heating + supply + return + 2 · drop, checked by the Phase 6 length rule (lengthOk, 1e-12).
 */
export function loopTotal({ heatingLength, supplyRouted, returnRouted }, col) {
  const drop = col.dropPerPipe_m;
  const totalLength = heatingLength + supplyRouted + returnRouted + 2 * drop;
  // the frozen Phase 6 validator: the drops ride on the leads
  const v = validateLoopLength({ heatingLength, supplyLength: supplyRouted + drop, returnLength: returnRouted + drop }, null);
  const margin = MAX_LOOP_M - totalLength;
  return {
    heatingLength,
    supplyLength: supplyRouted,
    returnLength: returnRouted,
    dropLength: drop,
    totalLength,
    margin,
    lowMargin: margin < LOOP_LOW_MARGIN_M,
    lengthValid: v.lengthValid && lengthOk(totalLength),
    status: v.lengthValid && lengthOk(totalLength) ? 'LOOP_VALID' : 'LOOP_INVALID',
  };
}
