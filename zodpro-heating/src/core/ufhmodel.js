// UFH BIM objects — heating zones, floor obstacles, stored loops and manifold circuits (spec §2,
// §38). Pure data helpers shared by the UI, the calculation and the engine job builder.
//
//   ufh_zone        { points, spacing, wallClearance, obstacleClearance, pipeType, strategy,
//                     maxLoop, coverageMin, collectorId, circuitIds[], roomId, status, report }
//   floor_obstacle  { points, kind, clearance|null }
//   ufh_loop        { name, zoneId|null, collectorId, circuitId, portIndex, path (supply connector →
//                     return connector), length, supplyLength, heatingLength, returnLength, drop,
//                     spacing, pipeType, manual, status, errors, warnings }

import { elementsOf, collectorPort, newElement, openingPos, wallDir } from './model.js';
import { insetPolygon, sharedSegments } from './wallroute.js';
import { pointInPolygon, polygonArea, polygonCentroid } from './util.js';
import { pipeType, DEFAULT_PIPE } from '../engines/ufh/pipes.js';

export const MAX_CIRCUITS = 12;

export const circuitId = (i) => `C${String(i + 1).padStart(2, '0')}`;
export const circuitIndex = (id) => Number(String(id).replace(/\D/g, '')) - 1;

export function defaultZoneParams(project) {
  const s = project.settings ?? {};
  return {
    spacing: 0.15,
    wallClearance: 0.1,
    obstacleClearance: 0.1,
    pipeType: DEFAULT_PIPE,
    strategy: 'adaptive_spiral',
    maxLoop: Math.min(60, s.ufhMaxLoopM ?? 60),
    coverageMin: 0.85,
    maxHole: 0.5,
  };
}

/** Loops stored on a manifold, by outlet index. */
export function storedLoopsByPort(project, colId) {
  const m = new Map();
  for (const l of elementsOf(project, 'ufh_loop')) if (l.collectorId === colId) m.set(l.portIndex ?? circuitIndex(l.circuitId), l);
  return m;
}

/**
 * Circuits of a manifold with their connectors and use:
 *   use = 'loop' (stored loop) | 'room' (room-based UFH computed by the calculation) | null (free)
 */
export function collectorCircuits(project, col, res = null) {
  const stored = storedLoopsByPort(project, col.id);
  const roomUse = res?.ufhRoomPorts?.[col.id] ?? [];
  const n = Math.max(col.outlets ?? 4, ...[...stored.keys()].map((i) => i + 1), roomUse.length ? Math.max(...roomUse) + 1 : 0);
  return Array.from({ length: n }, (_, i) => {
    const loop = stored.get(i) ?? null;
    return {
      id: circuitId(i),
      index: i,
      supply: collectorPort(col, i, 'supply'),
      ret: collectorPort(col, i, 'return'),
      loopId: loop?.id ?? null,
      loopName: loop?.name ?? null,
      use: loop ? 'loop' : roomUse.includes(i) ? 'room' : null,
    };
  });
}

/** Free outlets of a manifold (up to 12, extra ones appended when the manifold is not full). */
export function freeCircuits(project, col, res = null, exclude = new Set()) {
  const cs = collectorCircuits(project, col, res);
  const out = cs.filter((c) => !c.use || exclude.has(c.loopId));
  for (let i = cs.length; i < MAX_CIRCUITS; i++) out.push({ id: circuitId(i), index: i, supply: collectorPort(col, i, 'supply'), ret: collectorPort(col, i, 'return'), loopId: null, use: null, extra: true });
  return out;
}

/** Point in front of the manifold (middle of its outlet rows) — where leads start. */
export function collectorAnchor(col) {
  const n = Math.max(1, col.outlets ?? 4);
  const a = collectorPort(col, 0, 'return');
  const b = collectorPort(col, n - 1, 'return');
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Floor obstacles overlapping a zone (bbox test + any vertex inside). */
export function zoneObstacles(project, zone) {
  const out = [];
  for (const o of elementsOf(project, 'floor_obstacle', zone.levelId)) {
    const inside = o.points.some((p) => pointInPolygon(p, zone.points)) || zone.points.some((p) => pointInPolygon(p, o.points));
    if (inside) out.push(o);
  }
  return out;
}

/** Engine job for a zone (spec §5–§10): the zone, its obstacles, pipes to avoid, free circuits. */
/**
 * Rooms (interiors: axis outline inset by half the wall) and doors of a level for the room-by-room
 * UFH layout. Neighbouring rooms without a door get a virtual passage through their common wall
 * (the router uses it only when there is no way through doors).
 */
export function roomsAndDoors(project, levelId) {
  const list = elementsOf(project, 'room', levelId).filter((r) => r.points?.length >= 3);
  const walls = elementsOf(project, 'wall', levelId);
  const half = Math.max(0.05, ...walls.filter((w) => !w.exterior).map((w) => (w.thickness ?? 0.16) / 2));
  const rooms = list.map((r) => ({ id: r.id, name: r.name ?? r.number ?? 'Xona', poly: insetPolygon(r.points, half) }));
  const inside = (p) => list.findIndex((r) => pointInPolygon(p, r.points));
  const doors = [];
  for (const d of elementsOf(project, 'door', levelId)) {
    const pos = openingPos(project, d);
    if (!pos) continue;
    const dir = wallDir(pos.wall);
    const th = pos.wall.thickness ?? 0.16;
    const n = { x: -dir.y, y: dir.x };
    const k = th / 2 + 0.15;
    const ra = inside({ x: pos.x + n.x * k, y: pos.y + n.y * k });
    const rb = inside({ x: pos.x - n.x * k, y: pos.y - n.y * k });
    if (ra < 0 || rb < 0 || ra === rb) continue;
    doors.push({ id: d.id, c: { x: pos.x, y: pos.y }, u: { x: dir.x, y: dir.y }, n, width: d.width ?? 0.9, half: th / 2, ra, rb });
  }
  const linked = new Set(doors.map((d) => `${Math.min(d.ra, d.rb)}|${Math.max(d.ra, d.rb)}`));
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      if (linked.has(`${i}|${j}`)) continue;
      const seg = sharedSegments(list[i].points, list[j].points).sort((a, b) => Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) - Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y))[0];
      if (!seg) continue;
      const L = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
      if (L < 1.0) continue;
      const u = { x: (seg.b.x - seg.a.x) / L, y: (seg.b.y - seg.a.y) / L };
      const c = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
      doors.push({ id: null, c, u, n: { x: -u.y, y: u.x }, width: 0.6, half, ra: i, rb: j, virtual: true });
    }
  return { rooms, doors };
}

export function zoneJob(project, zone, res = null, extra = {}) {
  const col = extra.col ?? project.elements[zone.collectorId];
  if (!col) throw new Error('Zona uchun kollektor tanlanmagan');
  // the other zones of the same manifold are planned together with this one (one set of leads)
  const siblings = extra.siblings ?? [];
  const zoneIds = new Set([zone.id, ...siblings.map((z) => z.id)]);
  const own = new Set(elementsOf(project, 'ufh_loop').filter((l) => zoneIds.has(l.zoneId)).map((l) => l.id));
  let ports = freeCircuits(project, col, res, own);
  if (zone.circuitIds?.length && extra.onlyCircuits && !siblings.length) ports = ports.filter((c) => zone.circuitIds.includes(c.id));
  // pipes already on the floor (manual loops, other zones) are obstacles for the router (§29)
  const avoid = elementsOf(project, 'ufh_loop', zone.levelId)
    .filter((l) => !own.has(l.id))
    .map((l) => l.path)
    .filter((path) => path.some((p) => pointInPolygon(p, zone.points)));
  const { rooms, doors } = roomsAndDoors(project, zone.levelId);
  return {
    zone: zone.points,
    zones: [zone, ...siblings].map((z) => ({ id: z.id, points: z.points })),
    rooms,
    doors,
    obstacles: zoneObstacles(project, zone).map((o) => ({ polygon: o.points, clearance: o.clearance ?? null, kind: o.kind })),
    avoid,
    collector: { id: col.id, anchor: collectorAnchor(col), ports: ports.map((c) => ({ circuitId: c.id, index: c.index, supply: c.supply, ret: c.ret })) },
    spacing: zone.spacing,
    wallClearance: zone.wallClearance,
    obstacleClearance: zone.obstacleClearance,
    pipeType: zone.pipeType,
    strategy: zone.strategy,
    maxLoop: zone.maxLoop,
    coverageMin: zone.coverageMin,
    maxHole: zone.maxHole,
    dropLength: 2 * (col.connHeight ?? 0.4),
    ...extra,
    col: undefined,
    siblings: undefined,
  };
}

/** Loop names like the drawings: <floor>.<manifold>.<outlet>  (e.g. 1.2.03). */
export function loopName(project, col, index) {
  const lv = [...project.levels].sort((a, b) => a.elevation - b.elevation).findIndex((l) => l.id === col.levelId) + 1;
  const cols = elementsOf(project, 'collector', col.levelId).filter((c) => c.kind === 'ufh').sort((a, b) => a.y - b.y || a.x - b.x);
  const cn = cols.findIndex((c) => c.id === col.id) + 1;
  return `UFH-${lv}.${cn || 1}.${String(index + 1).padStart(2, '0')}`;
}

/** Engine result → model change set (one undo step): zone update + loops replaced (spec §41). */
export function applyEngineResult(project, zone, result, isNew = false) {
  const col = project.elements[zone.collectorId];
  const old = elementsOf(project, 'ufh_loop').filter((l) => l.zoneId === zone.id);
  const add = [];
  const update = [];
  const remove = old.map((l) => l.id);
  const loops = result.loops.map((l) =>
    newElement('ufh_loop', {
      levelId: zone.levelId,
      name: loopName(project, col, l.portIndex),
      zoneId: zone.id,
      collectorId: col.id,
      circuitId: l.circuitId,
      portIndex: l.portIndex,
      path: l.path,
      length: +l.length.toFixed(2),
      supplyLength: +l.supplyLength.toFixed(2),
      returnLength: +l.returnLength.toFixed(2),
      heatingLength: +l.heatingLength.toFixed(2),
      drop: l.drop,
      spacing: l.spacing,
      pipeType: l.pipeType,
      manual: false,
      status: l.status,
      errors: l.errors,
      warnings: l.warnings,
    }),
  );
  add.push(...loops);
  const patch = {
    circuitIds: loops.map((l) => l.circuitId),
    status: result.ok ? 'valid' : 'invalid',
    stale: false,
    report: {
      version: result.version,
      coverage: result.coverage?.ratio ?? null,
      area: result.coverage?.area ?? null,
      largestHole: result.coverage?.largestHole ?? null,
      errors: result.issues.filter((i) => i.level === 'error').length,
      warnings: result.issues.filter((i) => i.level === 'warning').length,
      issues: result.issues.slice(0, 40).map((i) => ({ code: i.code, level: i.level, msg: i.msg, at: i.at ? { x: +i.at.x.toFixed(3), y: +i.at.y.toFixed(3) } : null })),
      strategy: result.strategy,
      repaired: !!result.repaired,
      at: new Date().toISOString(),
    },
  };
  if (isNew) add.unshift({ ...zone, ...patch });
  else update.push({ id: zone.id, patch });
  // the manifold grows to the outlets it now carries (≤ 12)
  const maxIdx = Math.max(-1, ...loops.map((l) => l.portIndex), ...elementsOf(project, 'ufh_loop').filter((l) => l.collectorId === col.id && !remove.includes(l.id)).map((l) => l.portIndex));
  if (maxIdx + 1 > (col.outlets ?? 0)) update.push({ id: col.id, patch: { outlets: Math.min(MAX_CIRCUITS, maxIdx + 1) } });
  return { add, update, remove };
}

/** Zone geometry summary for panels. */
export function zoneSummary(zone) {
  return { area: Math.abs(polygonArea(zone.points)), centroid: polygonCentroid(zone.points) };
}

export function pipeLabel(loop) {
  const p = pipeType(loop.pipeType);
  return `${loop.name} · Ø${Math.round(p.od * 1000)}x${(p.wall * 1000).toFixed(1)} · ${loop.length.toFixed(1)} m · ${Math.round((loop.spacing ?? 0.15) * 1000)} mm`;
}

/**
 * Split a zone that needs more loops than one manifold can take (spec §16–18, §37): the zone is cut
 * across its long axis into parts sized by manifold capacity (the part at the existing manifold
 * gets its free outlets), and every further part gets a new 12-outlet manifold on its own outer
 * wall, rows facing into the part. Returns [{ points, col (existing or new element), isNewCol }].
 */
export function splitZoneForCollectors(zone, col, needLoops, freeLoops, clip) {
  const pts = zone.points;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const bb = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const alongX = bb.x1 - bb.x0 >= bb.y1 - bb.y0;
  const a0 = alongX ? bb.x0 : bb.y0;
  const a1 = alongX ? bb.x1 : bb.y1;
  const key = (p) => (alongX ? p.x : p.y);
  // start from the end where the existing manifold is
  const fromLow = Math.abs(key(col) - a0) <= Math.abs(key(col) - a1);
  const rest = Math.max(0, needLoops - freeLoops);
  const nNew = Math.ceil((rest * 1.08) / MAX_CIRCUITS);
  const caps = [Math.max(1, freeLoops), ...Array(nNew).fill(MAX_CIRCUITS)];
  const total = caps.reduce((x, y) => x + y, 0);
  const areaOf = (lo, hi) => clip(pts, alongX, lo, hi);
  const full = areaOf(a0, a1).area;
  // cumulative cuts by area (bisection), share ∝ capacity (a little under for margin)
  const cuts = [];
  let acc = 0;
  for (let i = 0; i < caps.length - 1; i++) {
    acc += (caps[i] / total) * full;
    let lo = a0;
    let hi = a1;
    for (let k = 0; k < 40; k++) {
      const m = (lo + hi) / 2;
      const A = fromLow ? areaOf(a0, m).area : areaOf(m, a1).area;
      if (A < acc) (fromLow ? (lo = m) : (hi = m));
      else (fromLow ? (hi = m) : (lo = m));
    }
    cuts.push((lo + hi) / 2);
  }
  const bounds = fromLow ? [a0, ...cuts, a1] : [a1, ...cuts, a0];
  const parts = [];
  for (let i = 0; i < caps.length; i++) {
    const lo = Math.min(bounds[i], bounds[i + 1]);
    const hi = Math.max(bounds[i], bounds[i + 1]);
    const piece = areaOf(lo, hi);
    if (!piece.ring) continue;
    if (i === 0) {
      parts.push({ points: piece.ring, col, isNewCol: false });
      continue;
    }
    // new manifold: on the part's outer end wall (last part) or its longest outer side wall
    const ring = piece.ring;
    const onZone = (m) => pts.some((p, k) => {
      const q = pts[(k + 1) % pts.length];
      const L = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const t = Math.max(0, Math.min(1, ((m.x - p.x) * (q.x - p.x) + (m.y - p.y) * (q.y - p.y)) / (L * L)));
      return Math.hypot(p.x + t * (q.x - p.x) - m.x, p.y + t * (q.y - p.y) - m.y) < 1e-3;
    });
    const edges = ring.map((p, k) => {
      const q = ring[(k + 1) % ring.length];
      const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      return { p, q, m, L: Math.hypot(q.x - p.x, q.y - p.y), end: Math.abs(key(p) - key(q)) < 1e-6 };
    }).filter((e) => e.L > 0.9 && onZone(e.m));
    // on a long side of the part (strips across the short way, short leads); of two equally long
    // sides the one on the existing manifold's side of the room
    const dc = (e) => Math.hypot(e.m.x - col.x, e.m.y - col.y);
    const side = edges.filter((e) => !e.end).sort((a, b) => b.L - a.L || dc(a) - dc(b));
    const pick = side.filter((e) => e.L > side[0].L - 0.05).sort((a, b) => dc(a) - dc(b))[0] ?? edges.sort((a, b) => b.L - a.L)[0];
    if (!pick) continue;
    // inward normal of a CCW ring edge = left normal
    const ccw = ring.reduce((acc2, p, k) => acc2 + p.x * ring[(k + 1) % ring.length].y - ring[(k + 1) % ring.length].x * p.y, 0) > 0;
    const d = { x: (pick.q.x - pick.p.x) / pick.L, y: (pick.q.y - pick.p.y) / pick.L };
    const n = ccw ? { x: -d.y, y: d.x } : { x: d.y, y: -d.x };
    const ang = Math.atan2(-n.x, n.y); // local +y (outlet rows) = n
    const xd = { x: Math.cos(ang), y: Math.sin(ang) };
    const org = { x: pick.m.x - n.x * 0.3 - xd.x * 0.3, y: pick.m.y - n.y * 0.3 - xd.y * 0.3 };
    const nc = newElement('collector', { levelId: col.levelId, x: +org.x.toFixed(3), y: +org.y.toFixed(3), angle: +((ang * 180) / Math.PI).toFixed(2), outlets: MAX_CIRCUITS, kind: 'ufh', mixing: col.mixing !== false, mark: '' });
    parts.push({ points: ring, col: nc, isNewCol: true });
  }
  return parts;
}
