// Room-by-room layout (the practice of the reference drawings):
//   • a loop stays in its room — only its two lead pipes leave it, and only through a door;
//   • the leads of a room run from the manifold as a tight bundle (transit spacing, 100 mm)
//     along the walls of the rooms in between and through their doors;
//   • every room is then laid out on its own with the door as its "manifold" (strips, spirals);
//   • the room with the manifold heats itself with the manifold's own outlets.
// Rooms and doors come from the model (zoneJob); a pair of neighbouring rooms without a door gets
// a virtual passage through the wall (dearer, reported as a warning).

import * as G from './geom.js';
import { layoutZone, usableArea } from './layout.js';

const ring = (poly) => [{ outer: G.ccw(poly), holes: [] }];

/** Shortest way along a closed ring between the projections of a and b (both ends included). */
function alongRing(R, a, b) {
  const qa = G.closestOnRing(a, R);
  const qb = G.closestOnRing(b, R);
  const n = R.length;
  const fwd = () => {
    if (qa.i === qb.i && qb.t >= qa.t) return [qa.p, qb.p];
    const pts = [qa.p];
    for (let j = (qa.i + 1) % n, k = 0; k <= n; j = (j + 1) % n, k++) {
      pts.push(R[j]);
      if (j === qb.i) break;
    }
    pts.push(qb.p);
    return pts;
  };
  const bwd = () => {
    if (qa.i === qb.i && qb.t <= qa.t) return [qa.p, qb.p];
    const pts = [qa.p];
    for (let j = qa.i, k = 0; k <= n; j = (j - 1 + n) % n, k++) {
      pts.push(R[j]);
      if (j === (qb.i + 1) % n) break;
    }
    pts.push(qb.p);
    return pts;
  };
  const f = G.cleanPath(fwd(), 1e-6);
  const r = G.cleanPath(bwd(), 1e-6);
  return G.pathLength(f) <= G.pathLength(r) ? f : r;
}

/**
 * @returns null when the zone lies in one room (normal layout), else the merged layout
 *   inp.rooms  [{ id, name, poly }]  room interiors (wall faces), plan
 *   inp.doors  [{ c, u, n, width, half, ra, rb, virtual }]  door centre on the wall axis, unit
 *              vectors along / across the wall, wall half thickness, rooms on the two sides
 */
export function layoutRooms(inp, score, kFix = null) {
  const rooms = inp.rooms ?? [];
  const doors = inp.doors ?? [];
  if (rooms.length < 2) return null;
  const s = inp.s;
  const st = Math.min(s, inp.transitS ?? 0.1);
  const Z = G.sanitize(inp.zone);
  const parts = rooms
    .map((r, i) => {
      const region = G.intersection(Z, ring(r.poly));
      return { i, room: r, region, area: G.area(region) };
    })
    .filter((p) => p.area >= 1.5);
  if (!parts.length) return null;
  const errors = [];

  // ---- manifold room: the room in front of the outlets ----
  const P0 = inp.ports[0];
  const fx = P0 ? P0.ret.x - P0.supply.x : 0;
  const fy = P0 ? P0.ret.y - P0.supply.y : 0;
  const fl = Math.hypot(fx, fy) || 1;
  const front = { x: inp.anchor.x + (fx / fl) * 0.3, y: inp.anchor.y + (fy / fl) * 0.3 };
  let mr = rooms.findIndex((r) => G.pointInRegion(front, ring(r.poly)));
  const inRoom = (p, i) => G.pointInRegion(p, G.offset(ring(rooms[i].poly), 0.35));
  if (mr < 0) mr = parts.find((p) => inRoom(inp.anchor, p.i))?.i ?? rooms.findIndex((r, i) => inRoom(inp.anchor, i));
  if (mr < 0) mr = parts.reduce((a, b) => (G.distToRegionBoundary(inp.anchor, b.region) < G.distToRegionBoundary(inp.anchor, a.region) ? b : a)).i;
  // one room with its own manifold: the normal layout (a room fed from a manifold in another room
  // still gets its leads through the doors)
  if (parts.length === 1 && parts[0].i === mr) return null;

  // ---- door graph: Dijkstra over rooms (entry point → door centre, virtual passages dearer) ----
  const N = rooms.length;
  const dist = Array(N).fill(Infinity);
  const via = Array(N).fill(null); // door index used to enter
  const at = Array(N).fill(null); // entry point
  dist[mr] = 0;
  at[mr] = inp.anchor;
  const done = new Set();
  for (;;) {
    let u = -1;
    for (let i = 0; i < N; i++) if (!done.has(i) && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done.add(u);
    doors.forEach((d, di) => {
      const v = d.ra === u ? d.rb : d.rb === u ? d.ra : -1;
      if (v < 0 || done.has(v)) return;
      const w = Math.hypot(d.c.x - at[u].x, d.c.y - at[u].y) * (d.virtual ? 2 : 1) + (d.virtual ? 3 : 0);
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        via[v] = di;
        at[v] = d.c;
      }
    });
  }
  const chainOf = (r) => {
    const out = [];
    let x = r;
    while (x !== mr && via[x] != null) {
      const d = doors[via[x]];
      out.unshift({ di: via[x], from: d.ra === x ? d.rb : d.ra, to: x });
      x = d.ra === x ? d.rb : d.ra;
    }
    return x === mr ? out : null;
  };

  // ---- loops per room (the lead run counts against the 60 m) ----
  const maxLoop = inp.maxLoop ?? 60;
  const drop = inp.dropLength ?? 0.8;
  const plan = [];
  for (const p of parts) {
    const chain = p.i === mr ? [] : chainOf(p.i);
    if (!chain) {
      errors.push({ code: 'UFH-DOOR', msg: `${p.room.name ?? 'Xona'}: kollektor xonasidan eshik orqali yo‘l yo‘q` });
      continue;
    }
    let T = 0;
    let q = inp.anchor;
    for (const c of chain) {
      const d = doors[c.di];
      T += Math.abs(d.c.x - q.x) + Math.abs(d.c.y - q.y);
      q = d.c;
    }
    const cap = maxLoop - 2 * T - drop - 2;
    if (cap < 12) {
      errors.push({ code: 'UFH-LEN', msg: `${p.room.name ?? 'Xona'}: kollektordan juda uzoq (lead ≈ ${T.toFixed(0)} m) — yaqinroq kollektor kerak` });
      continue;
    }
    // heated area of the room: clearances and obstacles off
    const big = p.region.reduce((a, b) => (!a || G.area([b]) > G.area([a]) ? b : a), null);
    const Au = big ? G.area(usableArea({ ...inp, zone: big.outer, s }).U) : p.area;
    const need = Math.max(1, Math.ceil((Au / s + 2) / (cap * 0.9)));
    if (chain.some((c) => doors[c.di].virtual)) errors.push({ code: 'UFH-DOOR', level: 'warning', msg: `${p.room.name ?? 'Xona'}: eshik yo‘q — lead'lar devor orqali o‘tadi (eshik chizing)`, at: doors[chain.find((c) => doors[c.di].virtual).di].c });
    plan.push({ ...p, chain, T, need });
  }
  const P = inp.ports;
  const total = plan.reduce((a, b) => a + b.need, 0);
  if (total > P.length) return { loops: [], errors: [...errors, { code: 'UFH-CIRC', msg: `Xonalar uchun ≈ ${total} kontur kerak, kollektorda ${P.length} ta chiqish` }], U: [], Z, obstacles: [] };
  // spare outlets by area (a room may take one loop more when its strips need it)
  let spare = P.length - total;
  const byArea = [...plan].sort((a, b) => !a.chain.length - !b.chain.length || b.area - a.area);
  for (const p of byArea) p.k = kFix?.has(p.i) ? kFix.get(p.i) : p.need;
  if (kFix) spare = P.length - plan.reduce((a, b) => a + b.k, 0);
  const fits = (p) => !kFix?.has(p.i);
  for (let k = 0; spare > 0 && k < 50; k++)
    for (const p of byArea) {
      if (spare <= 0) break;
      if (p.k < p.need + 1 && fits(p)) (p.k += 1), (spare -= 1);
    }

  // ---- outlets: rooms in the order of the way their leads leave the manifold ----
  const e0 = P[0].supply;
  const e1 = P[P.length - 1].supply;
  const eL = Math.hypot(e1.x - e0.x, e1.y - e0.y) || 1;
  const e = { x: (e1.x - e0.x) / eL, y: (e1.y - e0.y) / eL };
  const key = (p) => {
    const q = p.chain.length ? doors[p.chain[0].di].c : inp.anchor;
    return (q.x - inp.anchor.x) * e.x + (q.y - inp.anchor.y) * e.y;
  };
  const ordP = [...P].sort((a, b) => (a.supply.x - b.supply.x) * e.x + (a.supply.y - b.supply.y) * e.y);
  // leads leaving towards −e take the outlets at that end (the farthest room the outermost ones),
  // those leaving towards +e the other end, the manifold's own room the middle
  let lo = 0;
  let hi = ordP.length;
  for (const p of plan.filter((x) => x.chain.length && key(x) < 0).sort((a, b) => key(a) - key(b))) {
    p.ports = ordP.slice(lo, lo + p.k);
    lo += p.k;
  }
  for (const p of plan.filter((x) => x.chain.length && key(x) >= 0).sort((a, b) => key(b) - key(a))) {
    p.ports = ordP.slice(hi - p.k, hi);
    hi -= p.k;
  }
  for (const p of plan.filter((x) => !x.chain.length)) {
    p.ports = ordP.slice(lo, lo + p.k);
    lo += p.k;
  }

  // ---- door slots: every lead through a door gets its place across the door width ----
  const through = new Map(); // di → [{ p, port }]
  for (const p of plan)
    for (const c of p.chain)
      for (const port of p.ports) {
        if (!through.has(c.di)) through.set(c.di, []);
        through.get(c.di).push({ p, port });
      }
  const slot = new Map(); // `${di}|${circuitId}` → offset along the door
  for (const [di, list] of through) {
    const d = doors[di];
    list.sort((a, b) => ordP.indexOf(a.port) - ordP.indexOf(b.port));
    const pitch = Math.min(2 * st, Math.max(st, ((d.width ?? 0.8) - 0.1) / list.length));
    if (list.length * pitch > (d.width ?? 0.8) + 1e-6) errors.push({ code: 'UFH-DOOR', level: 'warning', msg: `Eshikdan ${list.length} ta lead o‘tadi — eshik tor`, at: d.c });
    list.forEach((x, k) => slot.set(`${di}|${x.port.circuitId}`, (k - (list.length - 1) / 2) * pitch));
  }

  // ---- transit lines: along the walls of each room passed (one lane per lead) ----
  const laneUse = new Map(); // room → next lane
  // in the manifold room the lanes start in front of the manifold (its outlets stand off the wall)
  // ---- comb at the manifold: the pairs leaving the room fan out in outlet order to a pitch of 2·st
  // (pair + gap), then each drops straight to its own lane ----
  const combLeads = plan.filter((p) => p.chain.length).flatMap((p) => p.ports);
  const alongA = (q) => (q.x - inp.anchor.x) * e.x + (q.y - inp.anchor.y) * e.y;
  combLeads.sort((a, b) => alongA(a.ret) - alongA(b.ret));
  const cMid = combLeads.length ? combLeads.reduce((a, q) => a + alongA(q.ret), 0) / combLeads.length : 0;
  const combX = new Map(combLeads.map((q, k) => [q.circuitId, cMid + (k - (combLeads.length - 1) / 2) * 2 * st]));
  let combD = 0.15 + Math.max(0, ...combLeads.map((q) => Math.abs(combX.get(q.circuitId) - alongA(q.ret))));
  const R0 = ring(rooms[mr].poly);
  const outD = Math.max(0.12, ...inp.ports.flatMap((q) => [q.supply, q.ret]).map((q) => (G.pointInRegion(q, R0) ? G.distToRegionBoundary(q, R0) : 0)));
  let mBase = outD + combD + 0.25;
  // a room too narrow for the spread comb and its lanes: the pairs leave straight from the outlets
  const deep = G.offset(R0, -(mBase + (combLeads.length + 1) * 2 * st), 'miter');
  // (a door right at the manifold: the pairs go straight through it, no spread needed)
  const doorNear = plan.some((p) => p.chain.length && Math.hypot(doors[p.chain[0].di].c.x - inp.anchor.x, doors[p.chain[0].di].c.y - inp.anchor.y) < 1.0);
  // too narrow for the spread: the pairs drop straight from their own outlets (a column, as at a
  // real manifold) and turn at nested depths; a door right at the manifold: straight through it
  let column = false;
  if (!combLeads.length || doorNear || G.area(deep) < 0.5) {
    combX.clear();
    column = combLeads.length > 0 && !doorNear;
    combD = 0.05;
    mBase = column ? outD + 0.2 : outD + 0.08;
  }
  const comb = combX.size > 0 || column;
  const laneRing = (ri, lane) => {
    const base = ri === mr ? Math.max(0.12, mBase) : 0.12;
    const off = G.offset(ring(rooms[ri].poly), -(base + st / 2 + lane * 2 * st), 'miter');
    const big = off.reduce((a, b) => (!a || G.area([b]) > G.area([a]) ? b : a), null);
    return big?.outer ?? null;
  };
  const inside = (d, ri) => {
    // unit normal pointing into room ri
    const t = { x: d.c.x + d.n.x * (d.half + 0.1), y: d.c.y + d.n.y * (d.half + 0.1) };
    return G.pointInRegion(t, ring(rooms[ri].poly)) ? d.n : { x: -d.n.x, y: -d.n.y };
  };
  const transit = new Map(); // circuitId → polyline (plan)
  // leads out of the manifold as a comb: each pair goes straight from its outlet to its own lane;
  // the pairs turning the same way are nested (the outlet at that end takes the lane nearest the
  // wall), so no two pairs cross at the manifold
  const leads = [];
  for (const p of plan) if (p.chain.length) for (const port of p.ports) leads.push({ p, port });
  const along = (q) => (q.x - inp.anchor.x) * e.x + (q.y - inp.anchor.y) * e.y;
  const slotPt = (L, c) => {
    const d = doors[c.di];
    const off = slot.get(`${c.di}|${L.port.circuitId}`) ?? 0;
    return { x: d.c.x + d.u.x * off, y: d.c.y + d.u.y * off };
  };
  const firstLane = new Map();
  for (const sgn of [-1, 1]) {
    const grp = leads.filter((L) => Math.sign(along(slotPt(L, L.p.chain[0])) - along(L.port.supply) || 1) === sgn);
    grp.sort((A, B) => sgn * (along(B.port.supply) - along(A.port.supply)));
    grp.forEach((L, k) => firstLane.set(L.port.circuitId, k));
  }
  // a door on a side wall of the manifold room: the pair nearest to it turns first, so it takes the
  // slot nearest the manifold's wall (L-routes nested, none crossing)
  const fM = (() => {
    const q = inp.ports[0];
    const l = q ? Math.hypot(q.ret.x - q.supply.x, q.ret.y - q.supply.y) || 1 : 1;
    return q ? { x: (q.ret.x - q.supply.x) / l, y: (q.ret.y - q.supply.y) / l } : { x: 0, y: 1 };
  })();
  for (const [di, list] of through) {
    const d = doors[di];
    if (Math.abs(d.n.x * fM.x + d.n.y * fM.y) > 0.3) continue;
    if (!list.every((x) => x.p.chain[0]?.di === di)) continue;
    const uf = d.u.x * fM.x + d.u.y * fM.y;
    let offs = list.map((x) => slot.get(`${di}|${x.port.circuitId}`)).sort((a, b) => uf * (a - b));
    // the slots sit beyond the point where the pairs leave the outlets (room for the L's corner)
    const depth = (o) => (d.c.x + d.u.x * o) * fM.x + (d.c.y + d.u.y * o) * fM.y;
    const need = Math.max(...list.map((x) => x.port.ret.x * fM.x + x.port.ret.y * fM.y)) + (comb ? combD : 0.15) + 0.1;
    const lift = need - depth(offs[0]);
    if (lift > 0) {
      const room0 = (d.width ?? 0.8) / 2 - st / 2 - 0.02 - Math.abs(offs[offs.length - 1]);
      const sh = Math.min(lift, Math.max(0, room0));
      offs = offs.map((o) => o + uf * sh);
    }
    [...list].sort((A, B) => (firstLane.get(A.port.circuitId) ?? 0) - (firstLane.get(B.port.circuitId) ?? 0)).forEach((x, k) => slot.set(`${di}|${x.port.circuitId}`, offs[k]));
  }
  const inMr = (() => {
    const Ri = G.offset(ring(rooms[mr].poly), -0.05, 'miter');
    return (a, b) => [0, 0.25, 0.5, 0.75, 1].every((s) => G.pointInRegion({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s }, Ri));
  })();
  // a door on a side wall near the manifold's wall: straight out of the manifold, then one turn
  // into the door (an L; a door farther on is reached along the walls, not across the room)
  const directRoute = (L, cur, qIn) => {
    const dot = (a, b) => a.x * b.x + a.y * b.y;
    const dv = { x: qIn.x - cur.x, y: qIn.y - cur.y };
    const nOut = inside(doors[L.p.chain[0].di], mr);
    let pts = null;
    if (Math.abs(dot(nOut, fM)) < 0.3) {
      const t = dot(dv, fM);
      if (t > 0.095 && t < 1.5) pts = [{ x: cur.x + fM.x * t, y: cur.y + fM.y * t }];
    }
    if (!pts) return null;
    const all = [cur, ...pts, qIn];
    for (let i = 1; i < all.length; i++) if (!inMr(all[i - 1], all[i])) return null;
    return pts;
  };
  const used = new Map([[mr, Math.max(0, ...[...firstLane.values()].map((k) => k + 1))]]);
  for (const L of [...leads].sort((A, B) => B.p.T - A.p.T)) {
    const { p, port } = L;
    const fl0 = Math.hypot(port.ret.x - port.supply.x, port.ret.y - port.supply.y) || 1;
    const f0 = { x: (port.ret.x - port.supply.x) / fl0, y: (port.ret.y - port.supply.y) / fl0 };
    const sh = (combX.get(port.circuitId) ?? alongA(port.ret)) - alongA(port.ret);
    let cur = comb ? { x: port.ret.x + f0.x * combD + e.x * sh, y: port.ret.y + f0.y * combD + e.y * sh } : { x: (port.supply.x + port.ret.x) / 2 + f0.x * 0.15, y: (port.supply.y + port.ret.y) / 2 + f0.y * 0.15 };
    const line = [cur];
    let room = mr;
    p.chain.forEach((c, ci) => {
      const d = doors[c.di];
      const q = slotPt(L, c);
      const nOut = inside(d, room);
      const qIn = { x: q.x + nOut.x * (d.half + 0.12), y: q.y + nOut.y * (d.half + 0.12) };
      let lane;
      if (ci === 0) lane = firstLane.get(port.circuitId) ?? 0;
      else {
        lane = used.get(room) ?? 0;
        used.set(room, lane + 1);
      }
      const R = laneRing(room, lane);
      const dr = ci === 0 ? directRoute(L, cur, qIn) : null;
      if (dr) {
        line.push(...dr, qIn, q);
        const nIn = inside(d, c.to);
        cur = { x: q.x + nIn.x * (d.half + 0.12), y: q.y + nIn.y * (d.half + 0.12) };
        line.push(cur);
        room = c.to;
        return;
      }
      if (ci === 0 && R && comb) {
        // straight out of the outlet onto its lane, then along the walls to the door
        // perpendicular to the manifold first (no hooks at the outlet rows), then onto the lane
        const fl = Math.hypot(port.ret.x - port.supply.x, port.ret.y - port.supply.y) || 1;
        const f = { x: (port.ret.x - port.supply.x) / fl, y: (port.ret.y - port.supply.y) / fl };
        const far = { x: cur.x + f.x * 50, y: cur.y + f.y * 50 };
        let hit = null;
        for (const r of R) {
          for (let i = 0; i < r.length; i++) {
            const x = G.segmentIntersection(cur, far, r[i], r[(i + 1) % r.length]);
            if (x && (!hit || Math.hypot(x.x - cur.x, x.y - cur.y) < Math.hypot(hit.x - cur.x, hit.y - cur.y))) hit = x;
          }
        }
        const q0 = hit && Math.hypot(hit.x - cur.x, hit.y - cur.y) < 2.5 ? hit : G.closestOnRing(cur, R).p;
        line.push(q0);
        cur = q0;
      }
      if (R && Math.hypot(qIn.x - cur.x, qIn.y - cur.y) > (ci === 0 && comb ? 0.3 : ci === 0 ? 2.0 : 1.0)) line.push(...alongRing(R, cur, qIn));
      line.push(qIn, q);
      const nIn = inside(d, c.to);
      cur = { x: q.x + nIn.x * (d.half + 0.12), y: q.y + nIn.y * (d.half + 0.12) };
      line.push(cur);
      room = c.to;
    });
    transit.set(port.circuitId, G.cleanPath(line, 0.002));
  }
  // ---- every room on its own ----
  const allTransit = [...transit.values()];
  const out = { loops: [], errors: [...errors], U: [], Z, obstacles: [], rooms: true };
  for (const p of plan) {
    const big = p.region.reduce((a, b) => (!a || G.area([b]) > G.area([a]) ? b : a), null);
    if (!big) continue;
    let ports;
    let anchor;
    if (!p.chain.length) {
      ports = p.ports;
      anchor = inp.anchor;
    } else {
      const last = p.chain[p.chain.length - 1];
      const d = doors[last.di];
      anchor = d.c;
      ports = p.ports.map((port) => {
        const tr = transit.get(port.circuitId);
        const end = tr[tr.length - 1];
        return { circuitId: port.circuitId, index: port.index, supply: { x: end.x - d.u.x * st / 2, y: end.y - d.u.y * st / 2 }, ret: { x: end.x + d.u.x * st / 2, y: end.y + d.u.y * st / 2 }, transit: tr, realSupply: port.supply, realRet: port.ret };
      });
    }
    // other rooms' bundles (not this room's own leads) are kept clear
    const others = allTransit.filter((tr, k) => !ports.some((pt) => pt.transit === tr));
    const keepOut = others.length ? G.bufferPolylines(others, st / 2 + s) : [];
    // a sliver cut off by the bundles (between a bundle and the wall) is left out of the room
    let zoneRing = big.outer;
    if (keepOut.length) {
      const pieces = G.difference([big], keepOut).sort((a, b) => G.area([b]) - G.area([a]));
      if (pieces.length > 1 && pieces.slice(1).every((pc) => G.area([pc]) < 1.5)) {
        zoneRing = G.difference([big], G.offset(pieces.slice(1), 0.01, 'miter')).reduce((a, b) => (!a || G.area([b]) > G.area([a]) ? b : a), null)?.outer ?? big.outer;
      }
    }
    const base = { ...inp, zone: zoneRing, ports, anchor, keepOut: [...(inp.keepOut ?? []), ...keepOut.map((sh) => sh.outer)], transitS: st, rooms: null, doors: null };
    let best = null;
    for (const frameIndex of [0, 1, 2]) {
      const q = { ...base, frameIndex };
      const lay = layoutZone(q);
      // a stub loop (a few metres in a leftover strip) heats nothing worth an outlet
      if (lay.loops?.length > 1) lay.loops = lay.loops.filter((l) => !(l.length < 8));
      // the leads come through the other rooms of the zone: checked against the whole zone
      lay.Z = Z;
      const sc = score ? score(lay, q) : (lay.errors?.length ?? 0);
      if (!best || sc < best.sc) best = { lay, sc };
    }
    const lay = best.lay;
    out.loops.push(...(lay.loops ?? []));
    out.errors.push(...(lay.errors ?? []));
    out.U.push(...(lay.U ?? []));
    if (!out.obstacles.length && lay.obstacles) out.obstacles = lay.obstacles;
    out.frame = out.frame ?? lay.frame;
  }
  out.U = out.U.length ? G.union(out.U) : [];
  // a room behind a door that used fewer outlets than it was given: planned again with that count,
  // so no unused lead holds a place in the doors and bundles
  if (!kFix) {
    const fix = new Map();
    for (const p of plan) {
      if (!p.chain.length) continue;
      const n = out.loops.filter((l) => p.ports.some((pt) => pt.circuitId === l.circuitId)).length;
      if (n > 0 && n < p.k) fix.set(p.i, n);
    }
    if (fix.size) {
      for (const p of plan) if (p.chain.length && !fix.has(p.i)) fix.set(p.i, p.k);
      return layoutRooms(inp, score, fix);
    }
  }
  return out;
}
