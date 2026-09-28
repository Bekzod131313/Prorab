// Element-level geometric operations used by the 2D editor (move/rotate/mirror/offset/split/
// extend/fillet) and automatic room detection. Pure functions: return new element objects/patches.

import { deepClone, round, projectOnSegment, dist } from '../core/util.js';
import { newElement, elementsOf, wallDir } from '../core/model.js';

const r4 = (v) => round(v, 4);
const tp = (p, f) => ({ ...p, ...f(p) });

export function transformElement(el, fn, angleDelta = 0, mirrored = false) {
  const e = deepClone(el);
  if (e.a) e.a = tp(e.a, fn);
  if (e.b) e.b = tp(e.b, fn);
  if (e.points) e.points = e.points.map((p) => tp(p, fn));
  if (e.center) e.center = tp(e.center, fn);
  if (e.x !== undefined && e.y !== undefined) {
    const q = fn({ x: e.x, y: e.y });
    e.x = q.x;
    e.y = q.y;
  }
  if (e.angle !== undefined || ['radiator', 'boiler', 'collector', 'pump'].includes(e.cat)) {
    e.angle = r4(((e.angle ?? 0) + angleDelta) % 360);
    if (mirrored && e.cat === 'radiator') e.flip = !e.flip;
  }
  for (const k of ['a', 'b', 'center']) if (e[k]) e[k] = { x: r4(e[k].x), y: r4(e[k].y) };
  if (e.points) e.points = e.points.map((p) => ({ ...p, x: r4(p.x), y: r4(p.y) }));
  if (e.x !== undefined) {
    e.x = r4(e.x);
    e.y = r4(e.y);
  }
  return e;
}

export const translateFn = (dx, dy) => (p) => ({ x: p.x + dx, y: p.y + dy });
export const rotateFn = (c, deg) => {
  const a = (deg * Math.PI) / 180;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  return (p) => ({ x: c.x + (p.x - c.x) * cs - (p.y - c.y) * sn, y: c.y + (p.x - c.x) * sn + (p.y - c.y) * cs });
};
export const mirrorFn = (a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy || 1;
  return (p) => {
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
    const fx = a.x + t * dx;
    const fy = a.y + t * dy;
    return { x: 2 * fx - p.x, y: 2 * fy - p.y };
  };
};

export function mirrorAngle(el, a, b) {
  const axis = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return 2 * axis - (el.angle ?? 0) + 180;
}

/** Copy elements with new ids/guids; openings are re-hosted on copied walls. */
export function duplicate(elements, fn = (p) => p) {
  const idMap = new Map();
  const out = [];
  for (const el of elements) {
    const t = transformElement(el, fn);
    const n = newElement(el.cat, { ...t, id: undefined, guid: undefined, mark: '' });
    delete n.markLocked;
    idMap.set(el.id, n.id);
    out.push(n);
  }
  for (const n of out) {
    if (n.wallId && idMap.has(n.wallId)) n.wallId = idMap.get(n.wallId);
    if (n.windowId && idMap.has(n.windowId)) n.windowId = idMap.get(n.windowId);
    if (n.roomId && idMap.has(n.roomId)) n.roomId = idMap.get(n.roomId);
  }
  return out;
}

export function lineIntersection(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y), t, u };
}

function segmentsOf(el) {
  if (el.a && el.b) return [[el.a, el.b]];
  if (el.points?.length > 1) {
    const s = [];
    for (let i = 1; i < el.points.length; i++) s.push([el.points[i - 1], el.points[i]]);
    if (el.closed) s.push([el.points[el.points.length - 1], el.points[0]]);
    return s;
  }
  return [];
}

/** Extend (or trim) the end of a wall/pipe nearest to `pick` to the nearest boundary it points at. */
export function extendToBoundary(project, el, pick, levelId, trim = false) {
  const isWall = !!el.a;
  const pts = isWall ? [el.a, el.b] : el.points;
  const endIdx = dist(pick, pts[0]) < dist(pick, pts[pts.length - 1]) ? 0 : pts.length - 1;
  const inner = endIdx === 0 ? pts[1] : pts[pts.length - 2];
  const end = pts[endIdx];
  let best = null;
  const candidates = [...elementsOf(project, 'wall', levelId), ...elementsOf(project, 'pipe', levelId), ...elementsOf(project, 'dline', levelId)].filter((x) => x.id !== el.id);
  for (const c of candidates) {
    for (const [a, b] of segmentsOf(c)) {
      const hit = lineIntersection(inner, end, a, b);
      if (!hit || hit.u < -1e-6 || hit.u > 1 + 1e-6) continue;
      // t: 0 at inner, 1 at end. extend → t > 1 ; trim → 0 < t < 1
      const ok = trim ? hit.t > 1e-3 && hit.t < 1 - 1e-3 : hit.t > 1 + 1e-6;
      if (!ok) continue;
      const score = trim ? 1 - hit.t : hit.t;
      if (!best || score < best.score) best = { score, p: { x: r4(hit.x), y: r4(hit.y) } };
    }
  }
  if (!best) return null;
  if (isWall) return endIdx === 0 ? { a: best.p } : { b: best.p };
  const np = pts.map((p) => ({ ...p }));
  np[endIdx] = best.p;
  return { points: np };
}

/** Split a wall/pipe/polyline at point p. Returns {update, add} or null. */
export function splitAt(project, el, p) {
  if (el.a && el.b) {
    const pr = projectOnSegment(p, el.a, el.b);
    if (pr.t < 0.02 || pr.t > 0.98) return null;
    const m = { x: r4(pr.point.x), y: r4(pr.point.y) };
    const L = wallDir(el).L;
    const cut = pr.t * L;
    const second = newElement(el.cat, { ...deepClone(el), id: undefined, guid: undefined, a: m, b: el.b, mark: '' });
    const openings = [...elementsOf(project, 'window'), ...elementsOf(project, 'door')].filter((o) => o.wallId === el.id && o.offset > cut);
    return {
      update: [{ id: el.id, patch: { b: m } }, ...openings.map((o) => ({ id: o.id, patch: { wallId: second.id, offset: r4(o.offset - cut) } }))],
      add: [second],
    };
  }
  if (el.points?.length > 1) {
    let best = null;
    for (let i = 1; i < el.points.length; i++) {
      const pr = projectOnSegment(p, el.points[i - 1], el.points[i]);
      if (!best || pr.d < best.d) best = { ...pr, i };
    }
    const m = { x: r4(best.point.x), y: r4(best.point.y) };
    const first = [...el.points.slice(0, best.i).map((q) => ({ ...q })), m];
    const second = [m, ...el.points.slice(best.i).map((q) => ({ ...q }))];
    if (first.length < 2 || second.length < 2 || dist(first[0], m) < 0.01 || dist(m, second[second.length - 1]) < 0.01) return null;
    const n = newElement(el.cat, { ...deepClone(el), id: undefined, guid: undefined, points: second, mark: '' });
    return { update: [{ id: el.id, patch: { points: first } }], add: [n] };
  }
  return null;
}

/** Corner join (fillet R=0) of two walls. */
export function filletWalls(w1, w2) {
  const hit = lineIntersection(w1.a, w1.b, w2.a, w2.b);
  if (!hit) return null;
  const p = { x: r4(hit.x), y: r4(hit.y) };
  const e1 = dist(w1.a, p) < dist(w1.b, p) ? 'a' : 'b';
  const e2 = dist(w2.a, p) < dist(w2.b, p) ? 'a' : 'b';
  return [
    { id: w1.id, patch: { [e1]: p } },
    { id: w2.id, patch: { [e2]: p } },
  ];
}

/** Offset a wall / pipe / polyline by distance d toward side point. */
export function offsetElement(el, d, side) {
  const segs = el.a ? [[el.a, el.b]] : el.points.map((p, i) => (i ? [el.points[i - 1], p] : null)).filter(Boolean);
  const [a, b] = segs[0];
  const dir = { x: b.x - a.x, y: b.y - a.y };
  const L = Math.hypot(dir.x, dir.y) || 1;
  let n = { x: -dir.y / L, y: dir.x / L };
  if ((side.x - a.x) * n.x + (side.y - a.y) * n.y < 0) n = { x: -n.x, y: -n.y };
  const mv = (p) => ({ x: r4(p.x + n.x * d), y: r4(p.y + n.y * d) });
  if (el.a) return newElement(el.cat, { ...deepClone(el), id: undefined, guid: undefined, a: mv(el.a), b: mv(el.b), mark: '' });
  // polyline offset: offset each segment and intersect neighbours
  const off = segs.map(([p, q]) => {
    const dd = { x: q.x - p.x, y: q.y - p.y };
    const l = Math.hypot(dd.x, dd.y) || 1;
    let nn = { x: -dd.y / l, y: dd.x / l };
    if (nn.x * n.x + nn.y * n.y < 0) nn = { x: -nn.x, y: -nn.y };
    return [{ x: p.x + nn.x * d, y: p.y + nn.y * d }, { x: q.x + nn.x * d, y: q.y + nn.y * d }];
  });
  const pts = [off[0][0]];
  for (let i = 1; i < off.length; i++) {
    const hit = lineIntersection(off[i - 1][0], off[i - 1][1], off[i][0], off[i][1]);
    pts.push(hit ? { x: hit.x, y: hit.y } : off[i][0]);
  }
  pts.push(off[off.length - 1][1]);
  return newElement(el.cat, { ...deepClone(el), id: undefined, guid: undefined, points: pts.map((p) => ({ x: r4(p.x), y: r4(p.y) })), mark: '' });
}

/**
 * Automatic room detection: casts rays from the click point to the nearest wall in the 4
 * axis directions and in 8 diagonal-free steps, then builds the enclosing polygon on wall
 * centre-lines. Works for orthogonal layouts; returns null if not enclosed.
 */
export function detectRoom(project, levelId, p) {
  const walls = elementsOf(project, 'wall', levelId);
  const ray = (dx, dy) => {
    let best = null;
    const far = { x: p.x + dx * 1000, y: p.y + dy * 1000 };
    for (const w of walls) {
      const hit = lineIntersection(p, far, w.a, w.b);
      if (!hit || hit.t <= 1e-9 || hit.u < -1e-6 || hit.u > 1 + 1e-6) continue;
      const d = hit.t * 1000;
      if (!best || d < best.d) best = { d, x: hit.x, y: hit.y, w };
    }
    return best;
  };
  const e = ray(1, 0);
  const wv = ray(-1, 0);
  const s = ray(0, 1);
  const n = ray(0, -1);
  if (!e || !wv || !s || !n) return null;
  const x0 = wv.x;
  const x1 = e.x;
  const y0 = n.y;
  const y1 = s.y;
  if (x1 - x0 < 0.3 || y1 - y0 < 0.3) return null;
  return [
    { x: r4(x0), y: r4(y0) },
    { x: r4(x1), y: r4(y0) },
    { x: r4(x1), y: r4(y1) },
    { x: r4(x0), y: r4(y1) },
  ];
}

/** When a new pipe endpoint lands on the interior of an existing same-system pipe, split it (tee). */
export function teeSplits(project, levelId, system, pts) {
  const out = { update: [], add: [] };
  for (const end of [pts[0], pts[pts.length - 1]]) {
    for (const p of elementsOf(project, 'pipe', levelId)) {
      if ((p.system ?? 'supply') !== system) continue;
      if (dist(p.points[0], end) < 0.02 || dist(p.points[p.points.length - 1], end) < 0.02) continue;
      let on = false;
      for (let i = 1; i < p.points.length; i++) if (projectOnSegment(end, p.points[i - 1], p.points[i]).d < 0.02) on = true;
      if (!on) continue;
      const sp = splitAt(project, p, end);
      if (sp) {
        out.update.push(...sp.update);
        out.add.push(...sp.add);
      }
      break;
    }
  }
  return out;
}
