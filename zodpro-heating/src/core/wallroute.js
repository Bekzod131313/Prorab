// Pipe routing along walls (radiator home-runs, trunk lines), as installers lay them in the floor:
// every room gets a "lane" line parallel to its walls at a fixed distance from the wall faces;
// neighbouring rooms are linked straight through their common wall; the shortest path on that
// graph runs along the walls, turns only at room corners and crosses walls at right angles.
// Supply and return of one circuit use two lanes 50 mm apart, so they run as a pair.

import { elementsOf } from './model.js';
import { polygonArea } from './util.js';

const EPS = 1e-6;

/** Closed polygon offset inwards by d (orthogonal / simple rooms). */
export function insetPolygon(points, d) {
  const ccw = polygonArea(points) > 0;
  const P = ccw ? points : [...points].reverse();
  const n = P.length;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = P[i];
    const b = P[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < EPS) continue;
    const nx = -(b.y - a.y) / L; // left normal = inside for CCW
    const ny = (b.x - a.x) / L;
    lines.push({ a: { x: a.x + nx * d, y: a.y + ny * d }, b: { x: b.x + nx * d, y: b.y + ny * d } });
  }
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l1 = lines[(i - 1 + lines.length) % lines.length];
    const l2 = lines[i];
    const den = (l1.b.x - l1.a.x) * (l2.b.y - l2.a.y) - (l1.b.y - l1.a.y) * (l2.b.x - l2.a.x);
    if (Math.abs(den) < EPS) {
      out.push(l2.a);
      continue;
    }
    const t = ((l2.a.x - l1.a.x) * (l2.b.y - l2.a.y) - (l2.a.y - l1.a.y) * (l2.b.x - l2.a.x)) / den;
    out.push({ x: l1.a.x + t * (l1.b.x - l1.a.x), y: l1.a.y + t * (l1.b.y - l1.a.y) });
  }
  return out;
}

function projOnRing(ring, p) {
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (!best || d < best.d) best = { i, t, q, d };
  }
  return best;
}

/** Common wall of two room outlines as segments [{a, b}] (collinear overlaps). */
export function sharedSegments(A, B, tol = 0.05) {
  const out = [];
  for (let i = 0; i < A.length; i++) {
    const p = A[i];
    const q = A[(i + 1) % A.length];
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    if (L < EPS) continue;
    const d = { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
    for (let j = 0; j < B.length; j++) {
      const r = B[j];
      const s = B[(j + 1) % B.length];
      const off = (z) => Math.abs((z.x - p.x) * d.y - (z.y - p.y) * d.x);
      if (off(r) > tol || off(s) > tol) continue;
      const tr = (r.x - p.x) * d.x + (r.y - p.y) * d.y;
      const ts = (s.x - p.x) * d.x + (s.y - p.y) * d.y;
      const t0 = Math.max(0, Math.min(tr, ts));
      const t1 = Math.min(L, Math.max(tr, ts));
      if (t1 - t0 > 0.2) out.push({ a: { x: p.x + d.x * t0, y: p.y + d.y * t0 }, b: { x: p.x + d.x * t1, y: p.y + d.y * t1 } });
    }
  }
  return out;
}

/**
 * Router for one level. route(from, to, lane) returns a polyline from `from` to `to` that runs on
 * the lane `lane` metres inside the wall faces, or null when no path exists.
 */
export function wallRouter(project, levelId) {
  const rooms = elementsOf(project, 'room', levelId).filter((r) => r.points?.length >= 3);
  const walls = elementsOf(project, 'wall', levelId);
  const wallHalf = Math.max(0.05, ...walls.map((w) => (w.thickness ?? 0.2) / 2));
  // wall crossings between neighbouring rooms (positions on the wall axis), every ~1.2 m
  const links = [];
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++)
      for (const seg of sharedSegments(rooms[i].points, rooms[j].points)) {
        const L = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
        const k = Math.max(1, Math.floor(L / 1.2));
        for (let m = 0; m < k; m++) {
          const t = (m + 0.5) / k;
          links.push({ ra: i, rb: j, p: { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t } });
        }
      }
  const roomAt = (p) => {
    let best = null;
    for (let i = 0; i < rooms.length; i++) {
      const pr = projOnRing(rooms[i].points, p);
      const inside = pointInside(p, rooms[i].points);
      const score = inside ? 0 : pr.d;
      if (!best || score < best.score) best = { i, score };
    }
    return best?.i ?? -1;
  };

  function route(from, to, lane) {
    if (!rooms.length) return null;
    const D = wallHalf + lane;
    const rings = rooms.map((r) => {
      const ring = insetPolygon(r.points, D);
      return Math.abs(polygonArea(ring)) > 0.2 ? ring : null;
    });
    // graph: nodes are points on the rings; per ring the attached points are chained in ring order
    const nodes = [];
    const adj = [];
    const node = (p) => {
      nodes.push(p);
      adj.push([]);
      return nodes.length - 1;
    };
    const edge = (a, b, w) => {
      adj[a].push([b, w]);
      adj[b].push([a, w]);
    };
    const attach = rings.map(() => []); // [{ k: param, id }]
    const onRing = (ri, p) => {
      const ring = rings[ri];
      if (!ring) return null;
      const pr = projOnRing(ring, p);
      const id = node(pr.q);
      attach[ri].push({ k: pr.i + pr.t, id });
      return { id, d: pr.d, q: pr.q };
    };
    for (const lk of links) {
      const A = onRing(lk.ra, lk.p);
      const B = onRing(lk.rb, lk.p);
      if (A && B) edge(A.id, B.id, Math.hypot(A.q.x - B.q.x, A.q.y - B.q.y) + 0.8); // wall penetration costs a bit
    }
    const rs = roomAt(from);
    const re = roomAt(to);
    if (rs < 0 || re < 0 || !rings[rs] || !rings[re]) return null;
    const S = node(from);
    const E = node(to);
    const sa = onRing(rs, from);
    const ea = onRing(re, to);
    edge(S, sa.id, sa.d);
    edge(E, ea.id, ea.d);
    // ring corners + chaining
    rings.forEach((ring, ri) => {
      if (!ring) return;
      for (let i = 0; i < ring.length; i++) attach[ri].push({ k: i, id: node(ring[i]) });
      const list = attach[ri].sort((a, b) => a.k - b.k);
      for (let m = 0; m < list.length; m++) {
        const a = list[m];
        const b = list[(m + 1) % list.length];
        const pa = nodes[a.id];
        const pb = nodes[b.id];
        // along the ring between the two params (through the corners in between)
        edge(a.id, b.id, Math.hypot(pa.x - pb.x, pa.y - pb.y));
      }
    });
    // Dijkstra
    const dist = new Array(nodes.length).fill(Infinity);
    const prev = new Array(nodes.length).fill(-1);
    const done = new Array(nodes.length).fill(false);
    dist[S] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || dist[u] === Infinity) break;
      if (u === E) break;
      done[u] = true;
      for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        prev[v] = u;
      }
    }
    if (dist[E] === Infinity) return null;
    const path = [];
    for (let v = E; v >= 0; v = prev[v]) path.unshift(nodes[v]);
    return simplify(path);
  }
  return { route, wallHalf, rooms };
}

function pointInside(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function simplify(pts) {
  const out = [];
  for (const p of pts) {
    const q = { x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 };
    if (out.length && Math.hypot(out[out.length - 1].x - q.x, out[out.length - 1].y - q.y) < 1e-3) continue;
    while (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      const cr = (b.x - a.x) * (q.y - b.y) - (b.y - a.y) * (q.x - b.x);
      const dot = (b.x - a.x) * (q.x - b.x) + (b.y - a.y) * (q.y - b.y);
      if (Math.abs(cr) < 1e-6 && dot > 0) out.pop();
      else break;
    }
    out.push(q);
  }
  return out;
}

/**
 * Bundle routing of all radiator circuits of one manifold (how installers lay home-runs):
 * the pairs run together along the walls on the shortest-path tree from the manifold, every pipe at
 * `pitch` from the next; on each wall the pairs are ordered so that a pair leaving the bundle
 * towards its radiator is the one nearest the wall → no pipe crosses another.
 * @param col  manifold element (plan position)
 * @param circuits [{ key, s:{x,y}, r:{x,y} }] radiator supply / return connector positions
 * @param ports (k) → { s:{x,y}, r:{x,y} } manifold outlet k (0-based) positions
 * @returns Map key → { supply: [pts], return: [pts], port: k } (circuits that could not be routed are missing)
 */
export function bundleRoutes(project, levelId, col, circuits, ports, { base = 0.1, pitch = 0.05 } = {}) {
  // base: first lane 100 mm from the wall face — behind it (towards the wall) are the radiator
  // connections, so a pair leaving the bundle always turns towards the wall
  const rooms = elementsOf(project, 'room', levelId).filter((r) => r.points?.length >= 3);
  const out = new Map();
  if (!rooms.length || !circuits.length) return out;
  const walls = elementsOf(project, 'wall', levelId);
  const wallHalf = Math.max(0.05, ...walls.map((w) => (w.thickness ?? 0.2) / 2));
  const D = wallHalf + base;
  const rings = rooms.map((r) => {
    const ring = insetPolygon(r.points, D);
    return Math.abs(polygonArea(ring)) > 0.2 ? ring : null;
  });
  // ---- graph
  const nodes = [];
  const adj = [];
  const node = (p) => {
    nodes.push(p);
    adj.push([]);
    return nodes.length - 1;
  };
  const edge = (a, b, w, meta) => {
    adj[a].push({ v: b, w, meta });
    adj[b].push({ v: a, w, meta });
  };
  const attach = rings.map(() => []);
  const onRing = (ri, p) => {
    const ring = rings[ri];
    if (!ring) return null;
    const pr = projOnRing(ring, p);
    const id = node(pr.q);
    attach[ri].push({ k: pr.i + pr.t, id });
    return { id, d: pr.d };
  };
  const roomOf = (p) => {
    let best = -1;
    let bd = Infinity;
    rooms.forEach((r, i) => {
      if (!rings[i]) return;
      const d = pointInside(p, r.points) ? 0 : projOnRing(r.points, p).d;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++)
      for (const seg of sharedSegments(rooms[i].points, rooms[j].points)) {
        const L = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
        const k = Math.max(1, Math.floor(L / 1.2));
        for (let m = 0; m < k; m++) {
          const t = (m + 0.5) / k;
          const p = { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t };
          const A = onRing(i, p);
          const B = onRing(j, p);
          if (A && B) edge(A.id, B.id, Math.hypot(nodes[A.id].x - nodes[B.id].x, nodes[A.id].y - nodes[B.id].y) + 0.8, { type: 'link' });
        }
      }
  const rc = roomOf({ x: col.x, y: col.y });
  if (rc < 0) return out;
  const root = node({ x: col.x, y: col.y });
  const ra = onRing(rc, { x: col.x, y: col.y });
  edge(root, ra.id, ra.d, { type: 'stub' });
  const leaves = [];
  for (const c of circuits) {
    const m = { x: (c.s.x + c.r.x) / 2, y: (c.s.y + c.r.y) / 2 };
    const ri = roomOf(m);
    if (ri < 0) continue;
    const leaf = node(m);
    const la = onRing(ri, m);
    edge(leaf, la.id, la.d, { type: 'stub' });
    leaves.push({ c, leaf });
  }
  rings.forEach((ring, ri) => {
    if (!ring) return;
    for (let i = 0; i < ring.length; i++) attach[ri].push({ k: i, id: node(ring[i]) });
    const list = attach[ri].sort((a, b) => a.k - b.k);
    for (let m = 0; m < list.length; m++) {
      const a = list[m];
      const b = list[(m + 1) % list.length];
      if (a.id === b.id) continue;
      // meta: going a → b is counter-clockwise along the ring (the wall is on the right)
      edge(a.id, b.id, Math.hypot(nodes[a.id].x - nodes[b.id].x, nodes[a.id].y - nodes[b.id].y) + 1e-6, { type: 'ring', a: a.id, b: b.id });
    }
  });
  // ---- shortest-path tree from the manifold
  const dist = new Array(nodes.length).fill(Infinity);
  const prev = new Array(nodes.length).fill(-1);
  const prevMeta = new Array(nodes.length).fill(null);
  const done = new Array(nodes.length).fill(false);
  dist[root] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    for (const { v, w, meta } of adj[u])
      if (dist[u] + w < dist[v] - 1e-9) {
        dist[v] = dist[u] + w;
        prev[v] = u;
        prevMeta[v] = meta;
      }
  }
  const ok = leaves.filter((l) => dist[l.leaf] < Infinity);
  // tree restricted to the used paths
  const children = new Map();
  const used = new Set([root]);
  for (const l of ok) for (let v = l.leaf; v !== root && v >= 0; v = prev[v]) used.add(v);
  for (const v of used) {
    if (v === root) continue;
    const p = prev[v];
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(v);
  }
  // ---- planar leaf order: DFS, children clockwise from the parent direction (left turn first)
  const order = new Map(); // leaf node → index
  const leafSet = new Set(ok.map((l) => l.leaf));
  const ang = (a, b) => Math.atan2(nodes[b].y - nodes[a].y, nodes[b].x - nodes[a].x);
  const stack = [[root, -1]];
  let idx = 0;
  const visit = (u, parent) => {
    if (leafSet.has(u)) order.set(u, idx++);
    const ch = children.get(u) ?? [];
    const back = parent >= 0 ? ang(u, parent) : Math.PI / 2;
    const cw = (c) => {
      let d = back - ang(u, c);
      while (d <= 1e-9) d += 2 * Math.PI;
      while (d > 2 * Math.PI) d -= 2 * Math.PI;
      return d;
    };
    // left turn first → leaf index grows from left to right across every edge
    for (const c of [...ch].sort((a, b) => cw(a) - cw(b))) visit(c, u);
  };
  void stack;
  visit(root, -1);
  if (globalThis.__BUNDLE_DEBUG) globalThis.__BUNDLE_DEBUG({ nodes, prev, children, order, leaves: ok.map((l) => [l.c.key, l.leaf]) });
  // subtree leaf lists per node
  const sub = new Map();
  const collect = (u) => {
    let list = leafSet.has(u) ? [u] : [];
    for (const c of children.get(u) ?? []) list = list.concat(collect(c));
    list.sort((a, b) => order.get(a) - order.get(b));
    sub.set(u, list);
    return list;
  };
  collect(root);
  // ---- ports in the planar order (or reversed, whichever lies better along the manifold)
  const sortedLeaves = [...ok].sort((a, b) => order.get(a.leaf) - order.get(b.leaf));
  const portOf = new Map();
  sortedLeaves.forEach((l, i) => portOf.set(l.leaf, i));
  const tryRev = (rev) => {
    let crossings = 0;
    const endPts = sortedLeaves.map((l, i) => ports(rev ? sortedLeaves.length - 1 - i : i).s);
    // approximate: distance sum from the bundle end to its ports (monotone assignment → fewer crossings)
    endPts.forEach((p) => (crossings += Math.hypot(p.x - nodes[ra.id].x, p.y - nodes[ra.id].y)));
    return crossings;
  };
  const reverse = sortedLeaves.length > 1 && tryRev(true) < tryRev(false) - 1e-6;
  // ---- offset geometry per circuit
  const offsetSeg = (p, c, leaf, isRetIn, swap = false) => {
    const isRet = swap ? !isRetIn : isRetIn;
    const a = nodes[p];
    const b = nodes[c];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-9) return null;
    const t = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const left = { x: -t.y, y: t.x };
    const list = sub.get(c);
    const m = list.length;
    const r = list.indexOf(leaf); // 0 = leftmost (travel manifold → radiator)
    const meta = prevMeta[c];
    let lateral; // offset to the left of travel
    if (meta?.type === 'ring') {
      const ccw = meta.a === p && meta.b === c;
      // wall on the right when travelling counter-clockwise; within a pair the supply is always
      // left of the return (travelling manifold → radiator) so pairs never twist
      const fromWall = ccw ? m - 1 - r : r;
      const slot = 2 * fromWall + (ccw ? (isRet ? 0 : 1) : isRet ? 1 : 0);
      lateral = (ccw ? 1 : -1) * slot * pitch;
    } else {
      const slot = 2 * r + (isRet ? 1 : 0);
      lateral = ((2 * m - 1) / 2 - slot) * pitch;
    }
    return { a: { x: a.x + left.x * lateral, y: a.y + left.y * lateral }, b: { x: b.x + left.x * lateral, y: b.y + left.y * lateral } };
  };
  // join offset segments: at turns the lines meet (nested corners); on a straight run a pipe keeps
  // its lane until the next turn (no zig-zags where pairs left the bundle)
  const join = (segsIn) => {
    const segs = segsIn.map((q) => ({ a: { ...q.a }, b: { ...q.b } }));
    const pts = [segs[0].a];
    for (let i = 1; i < segs.length; i++) {
      const s1 = segs[i - 1];
      const s2 = segs[i];
      const d1 = { x: s1.b.x - s1.a.x, y: s1.b.y - s1.a.y };
      const d2 = { x: s2.b.x - s2.a.x, y: s2.b.y - s2.a.y };
      const den = d1.x * d2.y - d1.y * d2.x;
      if (Math.abs(den) < 1e-9) {
        // same direction: carry the previous lane onto this segment
        const L2 = Math.hypot(d2.x, d2.y) || 1;
        const t = { x: d2.x / L2, y: d2.y / L2 };
        const v = { x: s1.b.x - s2.a.x, y: s1.b.y - s2.a.y };
        const along = v.x * t.x + v.y * t.y;
        const perp = { x: v.x - t.x * along, y: v.y - t.y * along };
        s2.a = { x: s2.a.x + perp.x, y: s2.a.y + perp.y };
        s2.b = { x: s2.b.x + perp.x, y: s2.b.y + perp.y };
        continue;
      }
      const tt = ((s2.a.x - s1.a.x) * d2.y - (s2.a.y - s1.a.y) * d2.x) / den;
      pts.push({ x: s1.a.x + tt * d1.x, y: s1.a.y + tt * d1.y });
    }
    pts.push(segs[segs.length - 1].b);
    return pts;
  };
  const build = (rev) => {
    const res = new Map();
    for (const l of ok) {
      // node chain manifold → radiator (skip the two stubs)
      const chain = [];
      for (let v = l.leaf; v >= 0; v = prev[v]) chain.unshift(v);
      const k = portOf.get(l.leaf);
      const pk = rev ? sortedLeaves.length - 1 - k : k;
      const port = ports(pk);
      const one = (swap) => {
        const r = { port: pk };
        for (const [sys, isRet, conn, pp] of [['supply', false, l.c.s, port.s], ['return', true, l.c.r, port.r]]) {
          const segs = [];
          for (let i = 2; i < chain.length - 1; i++) {
            const sg = offsetSeg(chain[i - 1], chain[i], l.leaf, isRet, swap);
            if (sg) segs.push(sg);
          }
          let pts;
          if (segs.length) {
            const body = join(segs);
            // manifold end: stay on this pipe's lane up to the port, then turn onto it
            const s0 = segs[0];
            const L0 = Math.hypot(s0.b.x - s0.a.x, s0.b.y - s0.a.y) || 1;
            const t0 = { x: (s0.b.x - s0.a.x) / L0, y: (s0.b.y - s0.a.y) / L0 };
            const along = (pp.x - s0.a.x) * t0.x + (pp.y - s0.a.y) * t0.y;
            body[0] = { x: s0.a.x + t0.x * along, y: s0.a.y + t0.y * along };
            pts = [pp, ...body, conn];
          } else pts = [pp, conn];
          r[sys] = simplify(pts.reverse());
        }
        return r;
      };
      // the pair's two pipes must not cross each other at the radiator: swap the pair's lanes if they do
      const selfX = (r) => {
        let n = 0;
        for (let a = 1; a < r.supply.length; a++) for (let b = 1; b < r.return.length; b++) if (segX(r.supply[a - 1], r.supply[a], r.return[b - 1], r.return[b])) n++;
        return n;
      };
      let r = one(false);
      if (selfX(r)) {
        const r2 = one(true);
        if (selfX(r2) < selfX(r)) r = r2;
      }
      res.set(l.c.key, r);
    }
    return res;
  };
  const crossingsOf = (res) => {
    const polys = [...res.values()].flatMap((r) => [r.supply, r.return]);
    let n = 0;
    for (let i = 0; i < polys.length; i++)
      for (let j = i + 1; j < polys.length; j++)
        for (let a = 1; a < polys[i].length; a++)
          for (let b = 1; b < polys[j].length; b++) if (segX(polys[i][a - 1], polys[i][a], polys[j][b - 1], polys[j][b])) n++;
    return n;
  };
  const r0 = build(false);
  const r1 = sortedLeaves.length > 1 ? build(true) : null;
  const best = r1 && crossingsOf(r1) < crossingsOf(r0) ? r1 : r0;
  void reverse;
  for (const [k, v] of best) out.set(k, v);
  return out;
}

function segX(a, b, c, d) {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(den) < 1e-12) return false;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}
