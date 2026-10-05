// UFH Coverage Router — step 7B: transit corridors of the leads (physical exclusions) and U'.
//
// Real lead routing rules (docs/phase7/SPEC.md, "REAL UFH LEAD ROUTING RULES"):
//   • the leads to another room run along the walls of the manifold room and of the rooms in
//     between, their centrelines leadWallOffset from the wall (and from the door jambs), the leads
//     of one bundle leadSpacing apart, supply and return in pairs (2 leads per loop);
//   • they cross into the next room through a door; in the target room they turn into its heating
//     zone (a transition — no corridor there);
//   • the heating pipes keep their own heatingPitch (per room) — three separate parameters, none
//     of them a default: collectorPortPitch (the manifold's, collector.portPitch_m), leadWallOffset,
//     heatingPitch.
//
// Corridor of a transit room (the manifold room, a room in between): the way along the room's wall
// ring from the entry (the manifold's port row / the entry door's opening) to each exit door's
// opening, the shorter way round. On every stretch of that way N leads pass (the sum over the exit
// doors it serves); lead slot j lies at leadWallOffset + j · leadSpacing from the wall and the
// corridor reaches e = leadWallOffset + (N − 1) · leadSpacing + heatingPitch / 2 into the room —
// the outermost lead keeps heatingPitch from the first heating pipe (which lies heatingPitch / 2
// inside its region). corridor_exclusion = U ∩ corridor; U' = U − corridor_exclusion.

import * as G from './geom.js';
import { doorChains } from './roomgraph.js';

const HEATING_PITCHES = [0.15, 0.2];
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** The three routing parameters (no defaults): { heatingPitch, leadWallOffset, leadSpacing }. */
export function routingParams(p) {
  const errors = [];
  if (!finite(p?.heatingPitch) || !HEATING_PITCHES.some((h) => Math.abs(p.heatingPitch - h) < 1e-12)) errors.push('heatingPitch: 0.15 or 0.20 m required (no default)');
  if (!finite(p?.leadWallOffset) || p.leadWallOffset <= 0) errors.push('leadWallOffset: > 0 required (no default)');
  if (!finite(p?.leadSpacing) || p.leadSpacing <= 0) errors.push('leadSpacing: > 0 required (no default)');
  return errors.length ? { ok: false, status: 'INPUT_INVALID', errors } : { ok: true, params: { heatingPitch: p.heatingPitch, leadWallOffset: p.leadWallOffset, leadSpacing: p.leadSpacing } };
}

/** The heating pitch of a room: its own (0.15 / 0.20) or the zone's. */
export function heatingPitchOf(room, params) {
  const h = room.heatingPitch ?? params.heatingPitch;
  if (!HEATING_PITCHES.some((x) => Math.abs(h - x) < 1e-12)) throw new Error(`room ${room.id}: heatingPitch 0.15 or 0.20 m required`);
  return h;
}

// ---- arc length on a closed CCW ring ----
function ringMeasure(R) {
  const cum = [0];
  for (let i = 0; i < R.length; i++) {
    const a = R[i];
    const b = R[(i + 1) % R.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const T = cum[R.length];
  const at = (s) => {
    s = ((s % T) + T) % T;
    let i = 0;
    while (i < R.length - 1 && cum[i + 1] <= s) i++;
    const a = R[i];
    const b = R[(i + 1) % R.length];
    const L = cum[i + 1] - cum[i];
    const t = L > 0 ? (s - cum[i]) / L : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };
  const sOf = (p) => {
    const q = G.closestOnRing(p, R);
    return cum[q.i] + q.t * (cum[q.i + 1] - cum[q.i]);
  };
  // the polyline from s0 going dir (+1 along the ring, −1 against) over length len
  const path = (s0, dir, len) => {
    const pts = [at(s0)];
    const s1 = s0 + dir * len;
    // the ring vertices strictly between s0 and s1
    for (let k = -2; k <= 2; k++)
      for (let i = 0; i < R.length; i++) {
        const v = cum[i] + k * T;
        if ((dir > 0 && v > s0 + 1e-12 && v < s1 - 1e-12) || (dir < 0 && v < s0 - 1e-12 && v > s1 + 1e-12)) pts.push({ v, p: R[i] });
      }
    const mids = pts.slice(1).sort((a, b) => (a.v - b.v) * dir).map((x) => x.p);
    return [pts[0], ...mids, at(s1)];
  };
  return { T, at, sOf, path };
}

/** A polyline shifted by d to its left (side +1) or right (side −1), miter joins. */
export function offsetPolyline(pts, d, side) {
  const n = (a, b) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: (-(b.y - a.y) / L) * side, y: ((b.x - a.x) / L) * side };
  };
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-12) continue;
    const m = n(a, b);
    segs.push([{ x: a.x + m.x * d, y: a.y + m.y * d }, { x: b.x + m.x * d, y: b.y + m.y * d }]);
  }
  const out = [segs[0][0]];
  for (let i = 1; i < segs.length; i++) {
    const X = G.segmentIntersection(segs[i - 1][0], { x: segs[i - 1][1].x + (segs[i - 1][1].x - segs[i - 1][0].x) * 10, y: segs[i - 1][1].y + (segs[i - 1][1].y - segs[i - 1][0].y) * 10 }, { x: segs[i][0].x - (segs[i][1].x - segs[i][0].x) * 10, y: segs[i][0].y - (segs[i][1].y - segs[i][0].y) * 10 }, segs[i][1]);
    out.push(X ?? segs[i][0]);
  }
  out.push(segs[segs.length - 1][1]);
  return out;
}

/**
 * Transit corridors and U' of a zone.
 * @param o { rooms: [{ id, poly, heatingPitch? }], doors: [{ id, between, at, width_m }],
 *            collector (step 7A: { at, outlets, portPitch_m }), loopsByRoom: { [roomId]: loops },
 *            usable: { [roomId]: region U of the room }, params: { heatingPitch, leadWallOffset, leadSpacing } }
 * @returns { status, reasons, issues, chains, rooms: { [id]: {...} }, corridors: [...], areas }
 */
export function planCorridors(o) {
  const P = routingParams(o.params);
  if (!P.ok) return { status: 'INPUT_INVALID', reasons: ['INPUT_INVALID'], issues: P.errors.map((msg) => ({ status: 'INPUT_INVALID', msg })) };
  const { leadWallOffset, leadSpacing } = P.params;
  const issues = [];
  const chains = doorChains({ rooms: o.rooms, doors: o.doors, collectorAt: o.collector.at });
  const doorById = new Map(o.doors.map((d) => [d.id, d]));
  // leads through every door (2 per loop of the rooms behind it)
  const leadsThrough = new Map();
  for (const [rid, n] of Object.entries(o.loopsByRoom)) {
    const c = chains.rooms[rid];
    if (!c?.reachable) {
      issues.push({ status: 'LEAD_ROUTE_NOT_FOUND', room: rid, msg: `no chain of doors from the manifold to room ${rid}` });
      continue;
    }
    for (const d of c.doors) leadsThrough.set(d, (leadsThrough.get(d) ?? 0) + 2 * n);
  }
  // door capacity: the bundle with leadWallOffset from both jambs
  for (const [d, N] of [...leadsThrough].sort()) {
    const door = doorById.get(d);
    const need = 2 * leadWallOffset + (N - 1) * leadSpacing;
    if (need > door.width_m + 1e-12) issues.push({ status: 'DOOR_CAPACITY_EXCEEDED', door: d, msg: `${N} leads need ${need.toFixed(3)} m, door ${door.width_m} m` });
  }
  const roomsOut = {};
  const corridors = [];
  for (const room of o.rooms) {
    const h = heatingPitchOf(room, P.params);
    const U = o.usable[room.id] ?? [];
    const R = G.ccw(room.poly);
    const region = [{ outer: R, holes: [] }];
    // the exits of this room: doors on a chain leaving it, with their leads
    const chainHere = (rid) => chains.rooms[rid]?.doors ?? [];
    const entry = room.id === chains.collectorRoom ? null : chainHere(room.id).at(-1) ?? null;
    const exits = [];
    for (const [d, N] of leadsThrough) {
      const door = doorById.get(d);
      if (!door.between.includes(room.id) || d === entry) continue;
      exits.push({ door, N });
    }
    exits.sort((a, b) => a.door.id.localeCompare(b.door.id));
    let K = [];
    const pieces = [];
    if (exits.length && (room.id === chains.collectorRoom || entry)) {
      const M = ringMeasure(R);
      // entry opening: the manifold's port row, or the entry door's width
      const e0 = room.id === chains.collectorRoom ? { at: o.collector.at, half: ((2 * o.collector.outlets - 1) * o.collector.portPitch_m) / 2 } : { at: doorById.get(entry).at, half: doorById.get(entry).width_m / 2 };
      const sE = M.sOf(e0.at);
      const Ntot = exits.reduce((a, x) => a + x.N, 0);
      const edge = (N) => leadWallOffset + (N - 1) * leadSpacing + h / 2;
      const piece = (s0, dir, len, N) => {
        if (len <= 1e-9) return;
        const line = M.path(s0, dir, len);
        // (the buffer of the wall stretch, inside the room: a band e wide along the wall)
        const band = G.intersection(G.bufferPolylines([line], edge(N), 'butt', 'miter'), region);
        pieces.push({ line, dir, N, e: edge(N), band });
        K = G.union(K, band);
      };
      // the entry opening carries every lead of the room
      piece(sE - e0.half, +1, 2 * e0.half, Ntot);
      for (const side of [+1, -1]) {
        const mine = exits
          .map((x) => {
            const f = (((M.sOf(x.door.at) - sE) % M.T) + M.T) % M.T;
            const along = side > 0 ? f : M.T - f;
            const other = side > 0 ? M.T - f : f;
            return { ...x, len: along + x.door.width_m / 2, own: along < other - 1e-12 || (Math.abs(along - other) <= 1e-12 && side > 0) };
          })
          .filter((x) => x.own)
          .sort((a, b) => a.len - b.len);
        let from = e0.half;
        for (let i = 0; i < mine.length; i++) {
          const to = mine[i].len;
          const N = mine.slice(i).reduce((a, x) => a + x.N, 0);
          if (to > from) piece(sE + side * from, side, to - from, N);
          from = Math.max(from, to);
        }
      }
    }
    const exclusion = K.length && U.length ? G.intersection(U, K) : [];
    const Uprime = exclusion.length ? G.difference(U, K) : U;
    // a corridor must not close or cut a part of the heating area off
    for (const [i, sh] of U.entries()) {
      const parts = G.intersection([sh], Uprime);
      if (parts.length !== 1 || G.area(parts) <= 0) issues.push({ status: 'CORRIDOR_CAPACITY_EXCEEDED', room: room.id, msg: `usable part ${i} → ${parts.length} part(s) after the corridor` });
    }
    const r = {
      heatingPitch: h,
      U,
      corridor: K,
      exclusion,
      Uprime,
      U_m2: G.area(U),
      corridor_m2: G.area(exclusion),
      Uprime_m2: G.area(Uprime),
      pieces,
      exits: exits.map((x) => ({ door: x.door.id, leads: x.N })),
      entry,
    };
    roomsOut[room.id] = r;
    if (pieces.length) corridors.push({ id: `K-${room.id}`, rooms: [room.id], doors: exits.map((x) => x.door.id), leads: Math.max(...pieces.map((p) => p.N)), width_m: Math.max(...pieces.map((p) => p.e)), area_m2: r.corridor_m2, poly: K });
  }
  const areas = {
    U_m2: Object.values(roomsOut).reduce((a, r) => a + r.U_m2, 0),
    corridor_m2: Object.values(roomsOut).reduce((a, r) => a + r.corridor_m2, 0),
    Uprime_m2: Object.values(roomsOut).reduce((a, r) => a + r.Uprime_m2, 0),
  };
  const reasons = [...new Set(issues.map((x) => x.status))];
  return { status: reasons[0] ?? 'CORRIDORS_OK', reasons, issues, chains, rooms: roomsOut, corridors, areas, params: P.params };
}

/** The centreline of lead slot j on a corridor piece (j = 0 next to the wall). */
export function slotLine(piece, j, params) {
  return offsetPolyline(piece.line, params.leadWallOffset + j * params.leadSpacing, piece.dir);
}
