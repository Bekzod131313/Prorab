// UFH BIM objects — heating zones, floor obstacles, stored loops and manifold circuits (spec §2,
// §38). Pure data helpers shared by the UI, the calculation and the engine job builder.
//
//   ufh_zone        { points, spacing, wallClearance, obstacleClearance, pipeType, strategy,
//                     maxLoop, coverageMin, collectorId, circuitIds[], roomId, status, report }
//   floor_obstacle  { points, kind, clearance|null }
//   ufh_loop        { name, zoneId|null, collectorId, circuitId, portIndex, path (supply connector →
//                     return connector), length, supplyLength, heatingLength, returnLength, drop,
//                     spacing, pipeType, manual, status, errors, warnings }

import { elementsOf, collectorPort, newElement } from './model.js';
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
export function zoneJob(project, zone, res = null, extra = {}) {
  const col = project.elements[zone.collectorId];
  if (!col) throw new Error('Zona uchun kollektor tanlanmagan');
  const own = new Set(elementsOf(project, 'ufh_loop').filter((l) => l.zoneId === zone.id).map((l) => l.id));
  let ports = freeCircuits(project, col, res, own);
  if (zone.circuitIds?.length && extra.onlyCircuits) ports = ports.filter((c) => zone.circuitIds.includes(c.id));
  // pipes already on the floor (manual loops, other zones) are obstacles for the router (§29)
  const avoid = elementsOf(project, 'ufh_loop', zone.levelId)
    .filter((l) => !own.has(l.id))
    .map((l) => l.path)
    .filter((path) => path.some((p) => pointInPolygon(p, zone.points)));
  return {
    zone: zone.points,
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
