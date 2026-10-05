// UFH Coverage Router — step 7B: the transfer leads (manifold → other rooms) as real geometry, and
// the physical corridor exclusion they make in the heating area.
//
// Real lead routing rules (docs/phase7/SPEC.md, "REAL UFH LEAD ROUTING RULES"):
//   • a loop of another room has two leads (supply + return, in a pair) from its manifold port;
//     they run along the walls of the manifold room and of the rooms in between, their
//     centrelines leadWallOffset from the wall, the leads of a bundle leadSpacing apart;
//   • they cross into the next room through the door opening, leadWallOffset from the jambs;
//   • in the target room they turn into its heating zone (a transition — no wall run there);
//   • the heating pipes keep their own heatingPitch per room. Four separate inputs, none a
//     fallback for another: collectorPortPitch (the manifold's: collector.portPitch_m),
//     leadWallOffset, leadSpacing, heatingPitch; the pipe body (OD) comes from the pipe type.
//
// Geometry of a room the bundle passes (the manifold room, a room in between): the way along the
// room's wall ring from the entry (manifold ports / entry door) to the exit doors, the shorter way
// round. Slot j (0 = next to the wall) at depth leadWallOffset + j · leadSpacing. Crossing-free
// order: a lead turning into an exit door leaves from the inner slots first; at an entry the lead
// arriving furthest along the way takes the innermost slot; the leads ending in a room (its own
// loops) take the positions behind the bundle and go straight into the room. The order at the
// manifold ports follows from that (the port order of step 7A).
//
// Corridor exclusion: the physical bundle — the lead centrelines buffered by the pipe radius, the
// gaps between neighbouring leads and between the wall and the first lead filled (closing): its
// depth from the wall is leadWallOffset + (N − 1) · leadSpacing + OD / 2; its width across the
// leads (N − 1) · leadSpacing + OD (never N · leadSpacing). C = U ∩ corridor, U' = U − C.

import * as G from './geom.js';
import { UFH_PIPES } from './pipes.js';
import { doorChains } from './roomgraph.js';
import { portsOf, capacity } from './collector.js';

const HEATING_PITCHES = [0.15, 0.2];
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a, b) => a.x * b.x + a.y * b.y;

/** The routing inputs (no defaults): heatingPitch, leadWallOffset, leadSpacing, pipeType. */
export function routingParams(p) {
  const errors = [];
  if (!finite(p?.heatingPitch) || !HEATING_PITCHES.some((h) => Math.abs(p.heatingPitch - h) < 1e-12)) errors.push('heatingPitch: 0.15 or 0.20 m required (no default)');
  if (!finite(p?.leadWallOffset) || p.leadWallOffset <= 0) errors.push('leadWallOffset: > 0 required (no default)');
  if (!finite(p?.leadSpacing) || p.leadSpacing <= 0) errors.push('leadSpacing: > 0 required (no default)');
  const pipe = UFH_PIPES.find((x) => x.id === p?.pipeType);
  if (!pipe) errors.push('pipeType: a pipe of the catalogue required (no default)');
  else if (finite(p?.leadSpacing) && p.leadSpacing < pipe.od) errors.push(`leadSpacing ${p.leadSpacing} < pipe OD ${pipe.od}: the pipes would overlap`);
  if (!finite(p?.wallClearance) || p.wallClearance < 0) errors.push('wallClearance: ≥ 0 required (the heating zone edge, where the transition ends)');
  if (errors.length) return { ok: false, status: 'INPUT_INVALID', errors };
  return { ok: true, params: { heatingPitch: p.heatingPitch, leadWallOffset: p.leadWallOffset, leadSpacing: p.leadSpacing, pipeType: pipe.id, pipeOD: pipe.od, wallClearance: p.wallClearance } };
}

/** The heating pitch of a room: its own (0.15 / 0.20) or the zone's. */
export function heatingPitchOf(room, params) {
  const h = room.heatingPitch ?? params.heatingPitch;
  if (!HEATING_PITCHES.some((x) => Math.abs(h - x) < 1e-12)) throw new Error(`room ${room.id}: heatingPitch 0.15 or 0.20 m required`);
  return h;
}

/** Physical bundle of N leads: centreline span, width across the pipes, depth from the wall. */
export function bundleGeometry(N, params) {
  const span = (N - 1) * params.leadSpacing;
  return { N, span, width: span + params.pipeOD, depth: params.leadWallOffset + span + params.pipeOD / 2, doorNeed: 2 * params.leadWallOffset + span };
}

// ---- a closed CCW ring by arc length ----
function ringOf(poly) {
  const R = G.ccw(poly);
  const cum = [0];
  for (let i = 0; i < R.length; i++) cum.push(cum[i] + Math.hypot(R[(i + 1) % R.length].x - R[i].x, R[(i + 1) % R.length].y - R[i].y));
  const T = cum[R.length];
  const mod = (s) => ((s % T) + T) % T;
  const seg = (s, dir = 1) => {
    s = mod(s);
    // (at a vertex: the segment the way goes on along)
    for (let i = 0; i < R.length; i++) {
      const lo = cum[i];
      const hi = cum[i + 1];
      if (dir > 0 ? s >= lo - 1e-12 && s < hi - 1e-12 : s > lo + 1e-12 && s <= hi + 1e-12) return i;
    }
    return dir > 0 ? 0 : R.length - 1;
  };
  const at = (s, dir = 1) => {
    const i = seg(s, dir);
    const a = R[i];
    const b = R[(i + 1) % R.length];
    const L = cum[i + 1] - cum[i];
    const t = (mod(s) - cum[i]) / L;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    // inward normal of a CCW ring: the left of the segment
    return { p: { x: a.x + (b.x - a.x) * Math.min(1, Math.max(0, t)), y: a.y + (b.y - a.y) * Math.min(1, Math.max(0, t)) }, u, n: { x: -u.y, y: u.x } };
  };
  const sOf = (p) => {
    const q = G.closestOnRing(p, R);
    return cum[q.i] + q.t * (cum[q.i + 1] - cum[q.i]);
  };
  // the wall polyline from s0 going dir over len
  const path = (s0, dir, len) => {
    const pts = [at(s0, dir).p];
    const s1 = s0 + dir * len;
    const mids = [];
    for (let k = -2; k <= 2; k++)
      for (let i = 0; i < R.length; i++) {
        const v = cum[i] + k * T;
        if ((dir > 0 && v > s0 + 1e-12 && v < s1 - 1e-12) || (dir < 0 && v < s0 - 1e-12 && v > s1 + 1e-12)) mids.push({ v, p: R[i] });
      }
    mids.sort((a, b) => (a.v - b.v) * dir);
    return [...pts, ...mids.map((m) => m.p), at(s1, -dir).p];
  };
  return { R, T, mod, at, sOf, path };
}

// a point s along the ring, d into the room
const inner = (ring, s, d, dir) => {
  const a = ring.at(s, dir);
  return { x: a.p.x + a.n.x * d, y: a.p.y + a.n.y * d };
};

// a polyline shifted by d to the room side (the left of a CCW way, the right of a CW one); null
// where a segment would turn over (the bundle too deep for the wall stretch)
function shiftPath(pts, d, dir) {
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-12) continue;
    const m = { x: (-(b.y - a.y) / L) * dir, y: ((b.x - a.x) / L) * dir };
    segs.push({ a: { x: a.x + m.x * d, y: a.y + m.y * d }, b: { x: b.x + m.x * d, y: b.y + m.y * d }, u: { x: (b.x - a.x) / L, y: (b.y - a.y) / L } });
  }
  const out = [segs[0].a];
  for (let i = 1; i < segs.length; i++) {
    const p = segs[i - 1];
    const q = segs[i];
    // the two offset lines meet (miter)
    const den = p.u.x * q.u.y - p.u.y * q.u.x;
    if (Math.abs(den) < 1e-12) out.push(q.a);
    else {
      const t = ((q.a.x - p.a.x) * q.u.y - (q.a.y - p.a.y) * q.u.x) / den;
      out.push({ x: p.a.x + p.u.x * t, y: p.a.y + p.u.y * t });
    }
  }
  out.push(segs[segs.length - 1].b);
  // every shifted segment keeps its direction and a length > 0
  for (let i = 1; i < out.length; i++) {
    const v = sub(out[i], out[i - 1]);
    if (Math.hypot(v.x, v.y) < 1e-9 || dot(v, segs[i - 1].u) <= 0) return null;
  }
  return out;
}

const cleanLine = (pts) => pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 1e-9);

/**
 * Transfer leads, corridors and U' of a zone.
 * @param o { rooms: [{ id, poly, heatingPitch? }], doors: [{ id, between, at, width_m }],
 *            collector (7A), loopsByRoom: { [roomId]: n }, usable: { [roomId]: region U },
 *            params: { heatingPitch, leadWallOffset, leadSpacing, pipeType, wallClearance } }
 */
export function planTransfers(o) {
  const P = routingParams(o.params);
  if (!P.ok) return { status: 'INPUT_INVALID', reasons: ['INPUT_INVALID'], issues: P.errors.map((msg) => ({ status: 'INPUT_INVALID', msg })) };
  const prm = P.params;
  const { leadWallOffset: off, leadSpacing: S, pipeOD: OD } = prm;
  const issues = [];
  const chains = doorChains({ rooms: o.rooms, doors: o.doors, collectorAt: o.collector.at });
  const C0 = chains.collectorRoom;
  const roomById = new Map(o.rooms.map((r) => [r.id, r]));
  const doorById = new Map(o.doors.map((d) => [d.id, d]));
  const rings = new Map(o.rooms.map((r) => [r.id, ringOf(r.poly)]));
  const loops = [];
  for (const [rid, n] of Object.entries(o.loopsByRoom).sort()) for (let i = 1; i <= n; i++) loops.push({ id: `${rid}.L${i}`, room: rid });
  const cap = capacity(loops.length, o.collector);
  if (cap.status !== 'OUTLETS_OK') return { status: 'OUTLET_SHORTAGE', reasons: ['OUTLET_SHORTAGE'], issues: [{ status: 'OUTLET_SHORTAGE', msg: cap.recommendation }], capacity: cap, chains };
  for (const l of loops) if (!chains.rooms[l.room]?.reachable) issues.push({ status: 'LEAD_ROUTE_NOT_FOUND', room: l.room, msg: `no chain of doors from the manifold to room ${l.room}` });
  if (issues.length) return { status: 'LEAD_ROUTE_NOT_FOUND', reasons: ['LEAD_ROUTE_NOT_FOUND'], issues, chains };

  // ---- the room tree: entry and exits of every room ----
  const entryOf = (rid) => (rid === C0 ? null : chains.rooms[rid].doors.at(-1));
  const nextRoom = (d, from) => (d.between[0] === from ? d.between[1] : d.between[0]);
  const childDoors = (rid) => o.doors.filter((d) => d.between.includes(rid) && d.id !== entryOf(rid) && chains.rooms[nextRoom(d, rid)]?.doors.at(-1) === d.id).map((d) => d.id);
  const loopsBehind = (did) => {
    const d = doorById.get(did);
    return loops.filter((l) => chains.rooms[l.room].doors.includes(did) && l.room !== undefined && d);
  };
  // the entry point of a room on its ring and the way to each exit (shorter way round)
  const layoutOf = new Map();
  const layout = (rid) => {
    if (layoutOf.has(rid)) return layoutOf.get(rid);
    const ring = rings.get(rid);
    const entry = entryOf(rid);
    const eAt = entry ? doorById.get(entry).at : o.collector.at;
    const sE = ring.sOf(eAt);
    const T = ring.at(sE, 1).u; // the ring tangent at the entry (CCW)
    const exits = childDoors(rid)
      .filter((did) => loopsBehind(did).length)
      .map((did) => {
        const f = ring.mod(ring.sOf(doorById.get(did).at) - sE);
        const side = f <= ring.T - f ? 1 : -1;
        return { door: did, side, along: side > 0 ? f : ring.T - f };
      })
      .sort((a, b) => a.along - b.along || a.door.localeCompare(b.door));
    const L = { rid, ring, entry, sE, T, exits };
    layoutOf.set(rid, L);
    return L;
  };
  // door axis: along the door's wall (the ring of its first room, CCW there)
  const axisOf = (did) => {
    const d = doorById.get(did);
    const ring = rings.get(d.between[0]);
    return ring.at(ring.sOf(d.at), 1).u;
  };
  // ---- crossing-free orders (lists of loop units { loop, flip }) ----
  const rev = (list) => [...list].reverse().map((e) => ({ loop: e.loop, flip: !e.flip }));
  const along = (list, axis, t) => (dot(axis, t) > 0 ? list : rev(list));
  const reqMemo = new Map();
  const slotMemo = new Map();
  // slots (inner → outer) of one side of a room: the exit groups in the order the way meets them
  const slotOrder = (rid, side) => {
    const key = `${rid}|${side}`;
    if (slotMemo.has(key)) return slotMemo.get(key);
    const L = layout(rid);
    let out = [];
    for (const x of L.exits.filter((e) => e.side === side)) {
      const ring = L.ring;
      const tOut = { x: ring.at(ring.sOf(doorById.get(x.door).at), side).u.x * side, y: ring.at(ring.sOf(doorById.get(x.door).at), side).u.y * side };
      out = out.concat(along(req(x.door), axisOf(x.door), tOut));
    }
    slotMemo.set(key, out);
    return out;
  };
  // the leads crossing a door, ascending along its axis
  const req = (did) => {
    if (reqMemo.has(did)) return reqMemo.get(did);
    const d = doorById.get(did);
    const from = d.between.find((r) => chains.rooms[r].doors.length < chains.rooms[nextRoom(d, r)].doors.length) ?? d.between[0];
    const to = nextRoom(d, from);
    const L = layout(to);
    const own = loops.filter((l) => l.room === to).map((l) => ({ loop: l.id, flip: false }));
    // ascending along the room's ring tangent at the entry: side −1 slots, own, side +1 slots reversed
    const list = [...slotOrder(to, -1), ...own, ...rev(slotOrder(to, 1))];
    const out = along(list, axisOf(did), L.T);
    reqMemo.set(did, out);
    return out;
  };
  // the manifold: the same rule, its own loops in the middle
  const LC = layout(C0);
  const ownC = loops.filter((l) => l.room === C0).map((l) => ({ loop: l.id, flip: false }));
  const ports = portsOf(o.collector);
  const uAxis = sub(ports[ports.length - 1].ret, ports[0].supply);
  // the ports stand portDepth from the wall: a lead goes from its port straight to its slot depth,
  // then along. Crossing-free: the lead leaving furthest along takes the slot nearest the ports'
  // depth — the innermost when the ports are at the wall side of the bundle, the outermost when
  // they stand deeper than it; ports inside the bundle's depth have no crossing-free pair order
  const portDepth = G.closestOnRing(ports[0].supply, LC.ring.R).d;
  const sideList = (side) => {
    const sl = slotOrder(C0, side);
    if (!sl.length) return sl;
    const n = 2 * sl.length;
    const lo = off;
    const hi = off + (n - 1) * S;
    if (portDepth <= lo + 1e-9) return side > 0 ? rev(sl) : sl;
    if (portDepth >= hi - 1e-9) return side > 0 ? sl : rev(sl);
    issues.push({ status: 'LEAD_ORDER_INFEASIBLE', room: C0, msg: `manifold ports ${portDepth.toFixed(3)} m from the wall lie inside the bundle (${lo.toFixed(3)}…${hi.toFixed(3)} m): no crossing-free order — the manifold on the wall side (≤ ${lo} m) or behind the bundle (≥ ${hi.toFixed(3)} m)` });
    return side > 0 ? rev(sl) : sl;
  };
  const atManifold = along([...sideList(-1), ...ownC, ...sideList(1)], uAxis, LC.T);
  if (atManifold.length !== loops.length) issues.push({ status: 'LEAD_ORDER_INFEASIBLE', msg: `manifold order holds ${atManifold.length} of ${loops.length} loops` });
  const mFlip = new Map(atManifold.map((e) => [e.loop, e.flip]));
  // a unit's two leads in the orientation of its list (supply first along u at the manifold)
  const expand = (list) => list.flatMap((e) => (e.flip === mFlip.get(e.loop) ? [`${e.loop}/S`, `${e.loop}/R`] : [`${e.loop}/R`, `${e.loop}/S`]));
  const portOrder = atManifold.map((e) => e.loop);

  // ---- door capacity ----
  const doorsReport = [];
  for (const did of [...new Set(loops.flatMap((l) => chains.rooms[l.room].doors))].sort()) {
    const leads = expand(req(did));
    const g = bundleGeometry(leads.length, prm);
    const w = doorById.get(did).width_m;
    const ok = g.doorNeed <= w + 1e-12;
    doorsReport.push({ door: did, leads: leads.length, need_m: g.doorNeed, width_m: w, ok });
    if (!ok) issues.push({ status: 'DOOR_CAPACITY_EXCEEDED', door: did, msg: `${leads.length} leads need ${g.doorNeed.toFixed(3)} m (2 × ${off} + ${leads.length - 1} × ${S}), door ${w} m` });
  }
  // lead positions in a door, ascending along its axis
  const doorPos = (did) => {
    const d = doorById.get(did);
    const a = axisOf(did);
    const leads = expand(req(did));
    return new Map(leads.map((id, k) => [id, { x: d.at.x + a.x * (-d.width_m / 2 + off + k * S), y: d.at.y + a.y * (-d.width_m / 2 + off + k * S) }]));
  };

  // ---- the lead polylines, room by room ----
  const pieces = new Map(); // lead id → [polyline parts in order]
  const push = (id, pts) => {
    if (!pieces.has(id)) pieces.set(id, []);
    pieces.get(id).push(pts);
  };
  const bundles = new Map(o.rooms.map((r) => [r.id, []]));
  const portOf = new Map();
  portOrder.forEach((lid, i) => {
    portOf.set(`${lid}/S`, ports[i].supply);
    portOf.set(`${lid}/R`, ports[i].ret);
  });
  const roomsInOrder = o.rooms.map((r) => r.id).filter((rid) => chains.rooms[rid].reachable).sort((a, b) => chains.rooms[a].doors.length - chains.rooms[b].doors.length || a.localeCompare(b));
  for (const rid of roomsInOrder) {
    const L = layout(rid);
    const ring = L.ring;
    // where every lead enters this room: a port (manifold room) or its door position
    const entryPos = L.entry ? doorPos(L.entry) : portOf;
    for (const side of [1, -1]) {
      const slots = expand(slotOrder(rid, side));
      if (!slots.length) continue;
      const exitsHere = L.exits.filter((e) => e.side === side);
      // the exit groups in the order the way meets them (slots: their concatenation, inner first)
      const groups = exitsHere.map((e) => ({ door: e.door, ids: expand(req(e.door)).filter((id) => slots.includes(id)) }));
      // distance along the way from the entry (signed: an entry point may lie behind sE)
      const uOf = (p) => {
        let d = ring.mod(ring.sOf(p) - L.sE);
        if (d > ring.T / 2) d -= ring.T;
        return d * side;
      };
      const sOfU = (u) => L.sE + side * u;
      const turnU = new Map(slots.map((id) => [id, uOf(doorPos(groups.find((g) => g.ids.includes(id)).door).get(id))]));
      // after the leads of an exit have turned, the others move in to the wall: lead of new rank r
      // steps in at base + r · S (inner first — no crossing), base = the last turn + S
      const removedBefore = [0];
      for (const g of groups) removedBefore.push(removedBefore.at(-1) + g.ids.length);
      const jogBase = groups.map((g) => Math.max(...g.ids.map((id) => turnU.get(id))) + S);
      let jogsFit = true;
      for (let t = 1; t < groups.length; t++) {
        const remaining = slots.length - removedBefore[t];
        const firstNext = Math.min(...groups[t].ids.map((id) => turnU.get(id)));
        if (jogBase[t - 1] + (remaining - 1) * S > firstNext - S / 2) jogsFit = false;
      }
      if (!jogsFit) issues.push({ status: 'CORRIDOR_CAPACITY_EXCEEDED', room: rid, msg: `the leads left after an exit cannot move in to the wall before the next exit (pocket between the bundle and the wall)` });
      for (let t = 0; t < groups.length; t++) {
        const n = slots.length - removedBefore[t];
        bundles.get(rid).push({ side, stretch: t, leads: n, exits: groups.slice(t).map((g) => g.door), ...bundleGeometry(n, prm) });
      }
      for (const [j, id] of slots.entries()) {
        const gi = groups.findIndex((g) => g.ids.includes(id));
        const p0 = entryPos.get(id);
        const u0 = uOf(p0);
        const d0 = L.entry ? 0 : G.closestOnRing(p0, ring.R).d;
        const uEnd = turnU.get(id);
        // stretches: [u from, u to, depth]
        const stretches = [];
        let uFrom = u0;
        for (let t = 0; t <= gi; t++) {
          const rank = jogsFit ? j - removedBefore[t] : j;
          const depth = off + rank * S;
          const uTo = t < gi && jogsFit ? jogBase[t] + (j - removedBefore[t + 1]) * S : t < gi ? null : uEnd;
          if (uTo === null) continue;
          stretches.push([uFrom, uTo, depth]);
          uFrom = uTo;
        }
        const pts = [L.entry ? inner(ring, sOfU(u0), 0, side) : p0];
        let bad = null;
        for (const [ua, ub, depth] of stretches) {
          if (ub - ua < 1e-9) {
            pts.push(inner(ring, sOfU(ua), depth, side));
            continue;
          }
          const run = shiftPath(ring.path(sOfU(ua), side, ub - ua), depth, side);
          if (!run) {
            bad = { depth, from: ua, to: ub };
            break;
          }
          pts.push(...run);
        }
        if (bad) {
          issues.push({ status: 'CORRIDOR_CAPACITY_EXCEEDED', room: rid, lead: id, stretches, msg: `lead ${id}: slot ${bad.depth.toFixed(3)} m from the wall does not fit the wall stretch ${bad.from.toFixed(2)}…${bad.to.toFixed(2)} m along the way (a corner closer than the bundle is deep)` });
          continue;
        }
        pts.push(inner(ring, sOfU(uEnd), 0, -side));
        void d0;
        push(id, cleanLine(pts));
      }
    }
  }
  // door crossings (through the wall opening) and the transitions in the target rooms
  for (const l of loops) {
    const ch = chains.rooms[l.room].doors;
    for (const did of ch) {
      const pos = doorPos(did);
      const d = doorById.get(did);
      for (const k of ['S', 'R']) {
        const id = `${l.id}/${k}`;
        const p = pos.get(id);
        const ends = d.between.map((rid) => {
          const ring = rings.get(rid);
          return ring.at(ring.sOf(p), 1).p;
        });
        push(id, ends);
      }
    }
    if (l.room !== C0) {
      const did = ch.at(-1);
      const ring = rings.get(l.room);
      const pos = doorPos(did);
      for (const k of ['S', 'R']) {
        const id = `${l.id}/${k}`;
        const s = ring.sOf(pos.get(id));
        push(id, [inner(ring, s, 0, 1), inner(ring, s, prm.wallClearance, 1)]);
      }
    }
  }
  // join the parts of every lead into one polyline (manifold → target transition)
  const leads = [];
  for (const l of loops) {
    if (l.room === C0) continue;
    for (const k of ['S', 'R']) {
      const id = `${l.id}/${k}`;
      const parts = pieces.get(id) ?? [];
      // parts in order: room runs (manifold room first), door crossings, transition — sort by chain
      const ordered = [];
      let cur = portOf.get(id);
      const pool = [...parts];
      while (pool.length) {
        const near = (q) => Math.hypot(q.x - cur.x, q.y - cur.y) < 1e-6;
        let i = pool.findIndex((pp) => near(pp[0]));
        let back = false;
        if (i < 0) {
          i = pool.findIndex((pp) => near(pp[pp.length - 1]));
          back = true;
        }
        if (i < 0) break;
        const pp0 = pool.splice(i, 1)[0];
        const pp = back ? [...pp0].reverse() : pp0;
        ordered.push(...(ordered.length ? pp.slice(1) : pp));
        cur = pp[pp.length - 1];
      }
      const ok = pool.length === 0;
      if (!ok) issues.push({ status: 'LEAD_ROUTE_NOT_FOUND', msg: `lead ${id}: ${pool.length} piece(s) not joined` });
      leads.push({ id, loop: l.id, room: l.room, kind: k === 'S' ? 'supply' : 'return', path: cleanLine(ordered), doors: chains.rooms[l.room].doors, length: G.pathLength(cleanLine(ordered)) });
    }
  }
  // crossings between leads (none by construction — checked)
  let crossings = 0;
  for (let i = 0; i < leads.length; i++)
    for (let j = i + 1; j < leads.length; j++) {
      const A = leads[i].path;
      const B = leads[j].path;
      for (let a = 1; a < A.length; a++) for (let b = 1; b < B.length; b++) if (G.segmentIntersection(A[a - 1], A[a], B[b - 1], B[b])) crossings++;
    }
  if (crossings) issues.push({ status: 'LEAD_INTERSECTION', msg: `${crossings} lead crossing(s)` });

  // ---- corridor exclusion per room: the physical bundle ----
  const roomsOut = {};
  for (const room of o.rooms) {
    const rid = room.id;
    const ring = rings.get(rid);
    const region = [{ outer: ring.R, holes: [] }];
    const U = o.usable[rid] ?? [];
    const mine = leads.map((x) => G.clipLines([x.path], region)).flat().filter((pp) => pp.length >= 2);
    let K = [];
    if (mine.length) {
      // the pipes, the wall strip behind the first lead, the gaps between neighbours closed
      const pipesBand = G.bufferPolylines(mine, OD / 2, 'butt', 'miter');
      // the strip between the wall and the first lead (within leadWallOffset + OD/2 of the wall)
      const wallStrip = G.difference(G.intersection(G.bufferPolylines(mine, off + OD / 2, 'butt', 'miter'), region), G.offset(region, -(off + OD / 2), 'miter'));
      // closing by leadSpacing / 2: the gaps between neighbouring pipes filled, nothing grown outwards
      K = G.intersection(G.offset(G.offset(G.union(pipesBand, wallStrip), S / 2, 'miter'), -S / 2, 'miter'), region);
    }
    const Craw = K.length && U.length ? G.intersection(U, K) : [];
    let Uprime = Craw.length ? G.difference(U, K) : U;
    // numerical crumbs (< 1 mm²) are dropped and counted, nothing else
    const crumbs = Uprime.filter((sh) => G.area([sh]) < 1e-6);
    Uprime = Uprime.filter((sh) => G.area([sh]) >= 1e-6);
    const h = heatingPitchOf(room, prm);
    // slivers: parts of U' no heating pipe can enter (h/2 from their edge)
    const slivers = Uprime.filter((sh) => G.offset([sh], -h / 2, 'miter').length === 0).map((sh) => G.area([sh]));
    const split = [];
    for (const [i, sh] of U.entries()) {
      const parts = G.intersection([sh], Uprime);
      if (parts.length !== 1) split.push({ part: i, after: parts.length });
    }
    if (split.length) issues.push({ status: 'CORRIDOR_CAPACITY_EXCEEDED', room: rid, msg: `corridor splits / closes usable part(s): ${JSON.stringify(split)}` });
    if (slivers.length) issues.push({ status: 'CORRIDOR_CAPACITY_EXCEEDED', room: rid, msg: `corridor leaves ${slivers.length} sliver(s) narrower than the heating pitch: ${slivers.map((a) => a.toFixed(4)).join(', ')} m²` });
    const U_m2 = G.area(U);
    const C_m2 = G.area(Craw);
    const Uprime_m2 = G.area(Uprime);
    roomsOut[rid] = {
      heatingPitch: h,
      U,
      corridor: K,
      exclusion: Craw,
      Uprime,
      U_m2,
      C_m2,
      Uprime_m2,
      crumbs_m2: crumbs.reduce((a, sh) => a + G.area([sh]), 0),
      components: { before: U.length, after: Uprime.length },
      split,
      slivers,
      bundles: bundles.get(rid),
      entry: entryOf(rid),
      role: rid === C0 ? 'manifold room' : bundles.get(rid).length ? 'transit' + (loops.some((l) => l.room === rid) ? ' + target' : '') : loops.some((l) => l.room === rid) ? 'target' : 'not served',
    };
  }
  const areas = {
    U_m2: Object.values(roomsOut).reduce((a, r) => a + r.U_m2, 0),
    C_m2: Object.values(roomsOut).reduce((a, r) => a + r.C_m2, 0),
    Uprime_m2: Object.values(roomsOut).reduce((a, r) => a + r.Uprime_m2, 0),
  };
  const reasons = [...new Set(issues.map((x) => x.status))];
  return { status: reasons[0] ?? 'TRANSFERS_OK', reasons, issues, chains, capacity: cap, portOrder, leads, crossings, doors: doorsReport, rooms: roomsOut, areas, params: prm };
}
