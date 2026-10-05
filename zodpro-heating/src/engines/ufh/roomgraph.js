// UFH Coverage Router — step 7B: rooms and doors as a graph; the chain of doors from the manifold
// to every room (Dijkstra over the doors, deterministic).
//
//   node   a door (and the manifold as the start); the cost from a point of a room to a door of
//          that room is the rectilinear distance between them (an estimate for the order of the
//          chains only — the lead lengths are measured on the routed geometry, step 7C / 7D)
//   result per room: { reachable, doors: [door ids, manifold → room], cost }; a room with no chain
//          is LEAD_ROUTE_NOT_FOUND (a proof: the graph has no path), never routed through a wall

import * as G from './geom.js';

const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** The room holding a point (the manifold), or null. */
export function roomOf(rooms, p) {
  const hit = rooms.filter((r) => G.pointInRegion(p, [{ outer: G.ccw(r.poly), holes: [] }]));
  return hit.length === 1 ? hit[0].id : null;
}

/**
 * Door chains from the manifold room.
 * @param o { rooms: [{ id, poly }], doors: [{ id, between: [a, b], at }], collectorAt: {x,y} }
 * @returns { collectorRoom, rooms: { [id]: { reachable, doors: [...], cost, status } } }
 */
export function doorChains({ rooms, doors, collectorAt }) {
  const start = roomOf(rooms, collectorAt);
  const out = { collectorRoom: start, rooms: {} };
  for (const r of rooms) out.rooms[r.id] = { reachable: false, doors: [], cost: Infinity, status: 'LEAD_ROUTE_NOT_FOUND' };
  if (start === null) return out;
  // states: (room, point we stand at, chain); Dijkstra by cost, ties by the door ids (stable)
  const best = new Map([[start, 0]]);
  out.rooms[start] = { reachable: true, doors: [], cost: 0, status: 'OK' };
  const queue = [{ room: start, at: collectorAt, cost: 0, chain: [] }];
  const done = new Set();
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost || a.chain.join('|').localeCompare(b.chain.join('|')));
    const cur = queue.shift();
    if (done.has(cur.room)) continue;
    done.add(cur.room);
    out.rooms[cur.room] = { reachable: true, doors: cur.chain, cost: cur.cost, status: 'OK' };
    const exits = doors.filter((d) => d.between.includes(cur.room)).sort((a, b) => a.id.localeCompare(b.id));
    for (const d of exits) {
      const next = d.between[0] === cur.room ? d.between[1] : d.between[0];
      if (done.has(next)) continue;
      const cost = cur.cost + man(cur.at, d.at);
      if (cost < (best.get(next) ?? Infinity) - 1e-12) {
        best.set(next, cost);
        queue.push({ room: next, at: d.at, cost, chain: [...cur.chain, d.id] });
      }
    }
  }
  return out;
}
