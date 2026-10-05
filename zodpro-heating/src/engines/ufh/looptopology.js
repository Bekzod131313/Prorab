// UFH Coverage Router — Phase 7B: the topology of every loop as ONE physical route.
//
//   COLLECTOR SUPPLY PORT → SUPPLY LEAD → (doors) → TARGET ROOM → HEATING START → continuous
//   two-path spiral (Phase 6 geometry, frozen) → HEATING END → RETURN LEAD → (doors) →
//   COLLECTOR RETURN PORT of the SAME outlet pair.
//
// Every link is checked on the geometry (point coincidence within TOPOLOGY_TOL_M, door openings
// crossed, the heating polyline embedded in the spiral path) — a colour or a nearby line is never a
// connection. One false flag → LOOP_DISCONNECTED; a lead on another loop's spiral, the two leads on
// one end, or the supply and return on different outlet pairs → LOOP_CONNECTION_INVALID.
// (The statuses are this module's: the 7.0 status list in leadcriteria.js is not changed.)

import * as G from './geom.js';

export const TOPOLOGY_TOL_M = 1e-6;
export const LOOP_TOPOLOGY_VALID = 'LOOP_TOPOLOGY_VALID';
export const LOOP_DISCONNECTED = 'LOOP_DISCONNECTED';
export const LOOP_CONNECTION_INVALID = 'LOOP_CONNECTION_INVALID';

export const TOPOLOGY_FLAGS = ['collectorSupplyConnected', 'supplyLeadConnected', 'heatingStartConnected', 'heatingGeometryContinuous', 'heatingEndConnected', 'returnLeadConnected', 'collectorReturnConnected', 'wholeLoopConnected'];

const d = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity);
const finitePath = (p) => Array.isArray(p) && p.length >= 2 && p.every((q) => Number.isFinite(q?.x) && Number.isFinite(q?.y));
const onSeg = (q, a, b, tol) => G.segDist(q, a, b) <= tol;

/** Does the polyline cross the door opening line (through the wall)? */
function crossesOpening(path, opening) {
  for (let k = 1; k < path.length; k++) if (G.segmentIntersection(path[k - 1], path[k], opening[0], opening[1])) return true;
  // (a vertex exactly on the opening line)
  return path.some((q) => onSeg(q, opening[0], opening[1], TOPOLOGY_TOL_M));
}

/**
 * The heating polyline is the spiral path between its two ends: path[0] and path[n−1] are the
 * ends, the heating's first / last point on the first / last stub, every inner point the same.
 */
export function heatingContinuous(spiral, tol = TOPOLOGY_TOL_M) {
  const p = spiral?.path;
  const h = spiral?.heating;
  if (!finitePath(p) || !finitePath(h) || p.length !== h.length) return false;
  const n = p.length;
  if (d(p[0], spiral.supply) > tol || d(p[n - 1], spiral.ret) > tol) return false;
  if (!onSeg(h[0], p[0], p[1], tol) || !onSeg(h[n - 1], p[n - 2], p[n - 1], tol)) return false;
  for (let k = 1; k < n - 1; k++) if (d(p[k], h[k]) > tol) return false;
  // no zero-length jumps hiding a gap: consecutive points of the heating are joined by its segments
  // (a polyline is continuous by construction; a NaN / missing point is not)
  return true;
}

/**
 * Topology of every loop.
 * @param loops  [{ id, room, spiral: { path, heating, supply, ret } }]
 * @param leads  [{ id, loop, kind: 'supply'|'return', path, port, outlet, doors: [doorId] }]
 *               (path from the port to the spiral end)
 * @param o      { ports: [{ supply, ret }] (physical outlets, index = outlet), doors: [{ door, opening }] }
 * @returns { loops: [{ id, flags, status, heatingStart, heatingEnd, outlet, reasons }], status, counts }
 */
export function loopTopology(loops, leads, o) {
  const tol = o.tol ?? TOPOLOGY_TOL_M;
  const openingOf = new Map((o.doors ?? []).map((x) => [x.door, x.opening]));
  const ends = loops.map((l) => ({ id: l.id, a: l.spiral?.supply, b: l.spiral?.ret }));
  const out = [];
  for (const l of loops) {
    const reasons = [];
    const S = leads.filter((x) => x.loop === l.id && x.kind === 'supply');
    const R = leads.filter((x) => x.loop === l.id && x.kind === 'return');
    const sp = S.length === 1 ? S[0] : null;
    const rt = R.length === 1 ? R[0] : null;
    if (S.length !== 1) reasons.push(`${S.length} supply leads`);
    if (R.length !== 1) reasons.push(`${R.length} return leads`);
    const a = l.spiral?.supply;
    const b = l.spiral?.ret;
    // which spiral end each lead reaches (its last point)
    const endOf = (lead) => {
      if (!lead || !finitePath(lead.path)) return null;
      const q = lead.path[lead.path.length - 1];
      if (d(q, a) <= tol) return 'a';
      if (d(q, b) <= tol) return 'b';
      return null;
    };
    const sEnd = endOf(sp);
    const rEnd = endOf(rt);
    const port = (i) => o.ports?.[i] ?? null;
    const outlet = sp?.outlet ?? null;
    const flags = {
      collectorSupplyConnected: !!sp && finitePath(sp.path) && Number.isInteger(sp.outlet) && d(sp.path[0], port(sp.outlet)?.supply) <= tol,
      supplyLeadConnected: !!sp && finitePath(sp.path) && sp.path.slice(1).every((q, k) => Number.isFinite(d(q, sp.path[k]))) && (sp.doors ?? []).every((did) => openingOf.has(did) && crossesOpening(sp.path, openingOf.get(did))),
      heatingStartConnected: sEnd !== null,
      heatingGeometryContinuous: heatingContinuous(l.spiral, tol),
      heatingEndConnected: rEnd !== null,
      returnLeadConnected: !!rt && finitePath(rt.path) && (rt.doors ?? []).every((did) => openingOf.has(did) && crossesOpening(rt.path, openingOf.get(did))),
      collectorReturnConnected: !!rt && finitePath(rt.path) && Number.isInteger(rt.outlet) && d(rt.path[0], port(rt.outlet)?.ret) <= tol,
      wholeLoopConnected: false,
    };
    // connection errors: a lead on another loop's spiral, both leads on one end, two outlet pairs
    let invalid = false;
    for (const [lead, mine] of [
      [sp, sEnd],
      [rt, rEnd],
    ]) {
      if (!lead || mine !== null || !finitePath(lead.path)) continue;
      const q = lead.path[lead.path.length - 1];
      const other = ends.find((e) => e.id !== l.id && (d(q, e.a) <= tol || d(q, e.b) <= tol));
      if (other) {
        invalid = true;
        reasons.push(`${lead.kind} lead ends on the spiral of ${other.id}`);
      }
    }
    if (sEnd !== null && sEnd === rEnd) {
      invalid = true;
      reasons.push('supply and return on the same spiral end');
    }
    if (sp && rt && sp.outlet !== rt.outlet) {
      invalid = true;
      reasons.push(`supply on outlet ${sp.outlet}, return on outlet ${rt.outlet}`);
    }
    // the whole route as one chain: port → supply lead → spiral (from its start) → return lead → port
    if (sp && rt && sEnd && rEnd && sEnd !== rEnd && flags.heatingGeometryContinuous) {
      const spiralPath = sEnd === 'a' ? l.spiral.path : [...l.spiral.path].reverse();
      const chain = [sp.path, spiralPath, [...rt.path].reverse()];
      let joined = true;
      for (let k = 1; k < chain.length; k++) if (d(chain[k - 1][chain[k - 1].length - 1], chain[k][0]) > tol) joined = false;
      flags.wholeLoopConnected = joined && TOPOLOGY_FLAGS.slice(0, -1).every((f) => flags[f]) && !invalid;
    }
    for (const f of TOPOLOGY_FLAGS) if (!flags[f] && !reasons.some((r) => r.startsWith(f))) reasons.push(`${f} = false`);
    const status = invalid ? LOOP_CONNECTION_INVALID : TOPOLOGY_FLAGS.every((f) => flags[f]) ? LOOP_TOPOLOGY_VALID : LOOP_DISCONNECTED;
    out.push({
      id: l.id,
      room: l.room,
      outlet,
      flags,
      status,
      // the heating start is the spiral end the supply reaches (the bifilar spiral is symmetric)
      heatingStart: sEnd === 'a' ? a : sEnd === 'b' ? b : null,
      heatingEnd: rEnd === 'a' ? a : rEnd === 'b' ? b : null,
      reasons: status === LOOP_TOPOLOGY_VALID ? [] : reasons,
    });
  }
  const counts = {};
  for (const x of out) counts[x.status] = (counts[x.status] ?? 0) + 1;
  const status = out.some((x) => x.status === LOOP_CONNECTION_INVALID) ? LOOP_CONNECTION_INVALID : out.some((x) => x.status === LOOP_DISCONNECTED) ? LOOP_DISCONNECTED : LOOP_TOPOLOGY_VALID;
  return { loops: out, status, counts };
}
