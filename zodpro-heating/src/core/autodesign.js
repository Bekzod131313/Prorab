// Automatic design operations. Each function is pure: it reads the project (and optionally
// calculation results) and returns a change-set { add: [elements], update: [{id, patch}], remove: [ids] }
// that the application applies as ONE undoable transaction.

import { newElement, elementsOf, openingPos, connectorsOf, isHeated, levelById, sortedLevels, localToPlan, wallDir } from './model.js';
import { pointInPolygon, polygonCentroid, polygonArea, round } from './util.js';

function inwardNormalForWall(wall, room, at = null) {
  const d = wallDir(wall);
  const left = { x: -d.y, y: d.x };
  const mid = at ?? { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 };
  const probe = { x: mid.x + left.x * ((wall.thickness ?? 0.3) / 2 + 0.2), y: mid.y + left.y * ((wall.thickness ?? 0.3) / 2 + 0.2) };
  return pointInPolygon(probe, room.points) ? left : { x: -left.x, y: -left.y };
}

function angleFor(wall, n) {
  const d = wallDir(wall);
  const left = { x: -d.y, y: d.x };
  const base = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  return left.x * n.x + left.y * n.y > 0 ? base : base + 180;
}

/** Place one radiator under every window of heated radiator-rooms; rooms without windows get one on the longest wall. */
export function autoPlaceRadiators(project, { levelId = null } = {}) {
  const add = [];
  const rooms = elementsOf(project, 'room').filter((r) => (!levelId || r.levelId === levelId) && isHeated(r) && ['radiator', 'mixed'].includes(r.heating ?? 'radiator'));
  const existing = elementsOf(project, 'radiator');
  for (const room of rooms) {
    if (existing.some((x) => x.roomId === room.id)) continue;
    const wins = elementsOf(project, 'window', room.levelId).filter((w) => {
      const p = openingPos(project, w);
      if (!p) return false;
      const n = inwardNormalForWall(p.wall, room, p);
      const probe = { x: p.x + n.x * ((p.wall.thickness ?? 0.3) / 2 + 0.2), y: p.y + n.y * ((p.wall.thickness ?? 0.3) / 2 + 0.2) };
      return pointInPolygon(probe, room.points);
    });
    const placeOn = (wall, center, windowId) => {
      const n = inwardNormalForWall(wall, room, center);
      const off = (wall.thickness ?? 0.3) / 2 + 0.06;
      add.push(
        newElement('radiator', {
          levelId: room.levelId,
          roomId: room.id,
          windowId: windowId ?? null,
          x: round(center.x + n.x * off, 3),
          y: round(center.y + n.y * off, 3),
          angle: round(angleFor(wall, n), 3),
          selection: 'auto',
          prefKind: 'panel',
          prefType: 22,
          mountHeight: 0.1,
          length: 1,
          wallId: wall.id,
        }),
      );
    };
    if (wins.length) {
      for (const w of wins) {
        const p = openingPos(project, w);
        placeOn(p.wall, p, w.id);
      }
    } else {
      // longest wall touching the room (prefer exterior)
      const c = polygonCentroid(room.points);
      let best = null;
      for (const wall of elementsOf(project, 'wall', room.levelId)) {
        for (let i = 0; i < room.points.length; i++) {
          const a = room.points[i];
          const b = room.points[(i + 1) % room.points.length];
          const L = Math.hypot(b.x - a.x, b.y - a.y);
          const d = wallDir(wall);
          const cross = Math.abs((a.x - wall.a.x) * d.y - (a.y - wall.a.y) * d.x) + Math.abs((b.x - wall.a.x) * d.y - (b.y - wall.a.y) * d.x);
          if (cross > (wall.thickness ?? 0.3) + 0.2) continue;
          const score = L + (wall.exterior ? 100 : 0);
          if (!best || score > best.score) best = { wall, score, center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        }
      }
      if (best) placeOn(best.wall, best.center, null);
      else add.push(newElement('radiator', { levelId: room.levelId, roomId: room.id, x: c.x, y: c.y, angle: 0, selection: 'auto', prefKind: 'panel', prefType: 22, mountHeight: 0.1, length: 1 }));
    }
  }
  return { add, update: [], remove: [] };
}

function orthoRoute(A, B, exitDir, stub = 0.15) {
  const A1 = exitDir ? { x: A.x + exitDir.x * stub, y: A.y + exitDir.y * stub } : A;
  const c1 = { x: B.x, y: A1.y };
  const c2 = { x: A1.x, y: B.y };
  // choose the corner whose first leg continues along the exit direction
  const corner = exitDir && Math.abs(exitDir.x) > Math.abs(exitDir.y) ? c1 : c2;
  const pts = [A, A1, corner, B].map((p) => ({ x: round(p.x, 3), y: round(p.y, 3) }));
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - p.x, last.y - p.y) < 1e-4) continue;
    out.push(p);
  }
  // drop collinear points
  const clean = [out[0]];
  for (let i = 1; i < out.length - 1; i++) {
    const a = clean[clean.length - 1];
    const b = out[i];
    const c = out[i + 1];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) > 1e-6) clean.push(b);
  }
  clean.push(out[out.length - 1]);
  return clean;
}

function connectedConnectorIds(project) {
  const used = new Set();
  const conns = [];
  for (const el of Object.values(project.elements)) {
    if (['radiator', 'collector', 'boiler', 'pump'].includes(el.cat)) conns.push(...connectorsOf(project, el, () => null));
  }
  for (const p of elementsOf(project, 'pipe')) {
    for (const pt of [p.points[0], p.points[p.points.length - 1]]) {
      for (const c of conns) if (c.levelId === p.levelId && Math.hypot(c.pos.x - pt.x, c.pos.y - pt.y) < 0.03) used.add(c.id);
    }
  }
  return used;
}

/**
 * Collector (radial) auto-routing: every unconnected radiator is connected to the nearest collector
 * on its level with a supply and a return pipe (orthogonal route). Collector outlets grow as needed.
 * Collectors are connected to the boiler (same level) or through supply/return risers (other levels).
 * @param productLookup (radiatorElement) → product (for exact connector positions)
 */
export function autoRoute(project, productLookup, { material = null, trunkMaterial = null } = {}) {
  const add = [];
  const update = [];
  const s = project.settings;
  const mat = material ?? s.pipeMaterial;
  // trunk (boiler ↔ manifolds, risers) may use another material, e.g. PPR trunks + PEX home-runs
  // PEX tops out at small diameters → main lines default to PPR
  const trunk = trunkMaterial ?? s.trunkMaterial ?? (mat === 'PEX' ? 'PPR' : mat);
  const used = connectedConnectorIds(project);
  const collectors = elementsOf(project, 'collector').filter((c) => c.kind !== 'ufh');
  const patches = new Map();
  const warnings = [];

  const colPortsUsed = new Map();
  for (const c of collectors) {
    let n = 0;
    for (let i = 1; i <= (c.outlets ?? 4); i++) if (used.has(`${c.id}:s${i}`) || used.has(`${c.id}:r${i}`)) n = i;
    colPortsUsed.set(c.id, n);
  }

  for (const rad of elementsOf(project, 'radiator')) {
    const conns = connectorsOf(project, rad, productLookup);
    const sc = conns.find((c) => c.name === 'supply');
    const rc = conns.find((c) => c.name === 'return');
    if (used.has(sc.id) && used.has(rc.id)) continue;
    const cands = collectors.filter((c) => c.levelId === rad.levelId);
    if (!cands.length) {
      warnings.push({ code: 'route_no_collector', elementId: rad.id });
      continue;
    }
    cands.sort((a, b) => Math.hypot(a.x - rad.x, a.y - rad.y) - Math.hypot(b.x - rad.x, b.y - rad.y));
    const col = cands[0];
    const port = colPortsUsed.get(col.id) + 1;
    colPortsUsed.set(col.id, port);
    const outlets = Math.max(col.outlets ?? 4, port);
    const cur = patches.get(col.id) ?? {};
    if (outlets > (col.outlets ?? 4)) patches.set(col.id, { ...cur, outlets: Math.min(12, outlets) });
    if (port > 12) {
      warnings.push({ code: 'route_collector_full', elementId: col.id });
      continue;
    }
    const colView = { ...col, outlets: Math.max(outlets, col.outlets ?? 4) };
    const cc = connectorsOf(project, colView, null);
    const ps = cc.find((c) => c.name === `s${port}`);
    const pr = cc.find((c) => c.name === `r${port}`);
    const a = ((rad.angle ?? 0) * Math.PI) / 180;
    const inward = { x: -Math.sin(a), y: Math.cos(a) };
    if (!used.has(sc.id)) add.push(newElement('pipe', { levelId: rad.levelId, system: 'supply', material: mat, autoSize: true, elevation: s.pipeElevation, points: orthoRoute(sc.pos, ps.pos, inward, 0.15) }));
    if (!used.has(rc.id)) add.push(newElement('pipe', { levelId: rad.levelId, system: 'return', material: mat, autoSize: true, elevation: s.pipeElevation + 0.05, points: orthoRoute(rc.pos, pr.pos, inward, 0.25) }));
  }

  // collectors (radiator + ufh) → boiler
  const boiler = elementsOf(project, 'boiler')[0];
  if (boiler) {
    const bc = connectorsOf(project, boiler, null);
    const bs = bc.find((c) => c.name === 'supply');
    const br = bc.find((c) => c.name === 'return');
    const bLevel = levelById(project, boiler.levelId);
    const pump = elementsOf(project, 'pump').find((p) => p.levelId === boiler.levelId);
    let supplyStart = bs;
    if (pump) {
      const pc = connectorsOf(project, pump, null);
      const pin = pc.find((c) => c.name === 'in');
      const pout = pc.find((c) => c.name === 'out');
      if (!used.has(pin.id)) add.push(newElement('pipe', { levelId: boiler.levelId, system: 'supply', material: trunk, autoSize: true, elevation: s.pipeElevation, points: orthoRoute(bs.pos, pin.pos, null) }));
      supplyStart = pout;
    }
    const riserFor = new Map();
    for (const col of elementsOf(project, 'collector')) {
      const cc = connectorsOf(project, col, null);
      const cs = cc.find((c) => c.name === 'in_supply');
      const cr = cc.find((c) => c.name === 'in_return');
      if (used.has(cs.id) && used.has(cr.id)) continue;
      if (col.levelId === boiler.levelId) {
        add.push(newElement('pipe', { levelId: col.levelId, system: 'supply', material: trunk, autoSize: true, elevation: s.pipeElevation + 0.1, points: orthoRoute(supplyStart.pos, cs.pos, null) }));
        add.push(newElement('pipe', { levelId: col.levelId, system: 'return', material: trunk, autoSize: true, elevation: s.pipeElevation + 0.15, points: orthoRoute(br.pos, cr.pos, null) }));
      } else {
        // risers beside the boiler, shared by all collectors on upper/lower levels
        const lv = levelById(project, col.levelId);
        if (!lv || !bLevel) continue;
        const rs = localToPlan(boiler, -0.45, 0.25 + 0.15 * riserFor.size);
        const rr = localToPlan(boiler, 0.45, 0.25 + 0.15 * riserFor.size);
        const sp = { x: round(rs.x, 3), y: round(rs.y, 3) };
        const rp = { x: round(rr.x, 3), y: round(rr.y, 3) };
        riserFor.set(col.id, true);
        add.push(newElement('riser', { system: 'supply', x: sp.x, y: sp.y, levelFrom: bLevel.id, levelTo: lv.id, levelId: bLevel.id, material: trunk, autoSize: true }));
        add.push(newElement('riser', { system: 'return', x: rp.x, y: rp.y, levelFrom: bLevel.id, levelTo: lv.id, levelId: bLevel.id, material: trunk, autoSize: true }));
        add.push(newElement('pipe', { levelId: bLevel.id, system: 'supply', material: trunk, autoSize: true, elevation: s.pipeElevation + 0.1, points: orthoRoute(supplyStart.pos, sp, null) }));
        add.push(newElement('pipe', { levelId: bLevel.id, system: 'return', material: trunk, autoSize: true, elevation: s.pipeElevation + 0.15, points: orthoRoute(br.pos, rp, null) }));
        add.push(newElement('pipe', { levelId: lv.id, system: 'supply', material: trunk, autoSize: true, elevation: s.pipeElevation + 0.1, points: orthoRoute(sp, cs.pos, null) }));
        add.push(newElement('pipe', { levelId: lv.id, system: 'return', material: trunk, autoSize: true, elevation: s.pipeElevation + 0.15, points: orthoRoute(rp, cr.pos, null) }));
      }
    }
  } else {
    warnings.push({ code: 'route_no_boiler' });
  }
  for (const [id, patch] of patches) update.push({ id, patch });
  return { add, update, remove: [], warnings };
}

/** Place a collector in the corridor (or the largest heated room) of a level if none exists. */
export function autoPlaceCollector(project, levelId, kind = 'radiator') {
  const existing = elementsOf(project, 'collector', levelId).filter((c) => (c.kind ?? 'radiator') === kind);
  if (existing.length) return { add: [], update: [], remove: [] };
  const rooms = elementsOf(project, 'room', levelId);
  const host = rooms.find((r) => r.roomType === 'corridor') ?? rooms.sort((a, b) => b.points.length - a.points.length)[0];
  if (!host) return { add: [], update: [], remove: [] };
  const c = polygonCentroid(host.points);
  return { add: [newElement('collector', { levelId, x: round(c.x - 0.3, 3), y: round(c.y + (kind === 'ufh' ? 0.6 : 0), 3), angle: 0, outlets: 4, kind })], update: [], remove: [] };
}

export function levelsAbove(project, levelId) {
  const ls = sortedLevels(project);
  const i = ls.findIndex((l) => l.id === levelId);
  return ls.slice(i + 1);
}

/**
 * Parametric follow-up: when automatic selection changes a radiator's length, its connectors
 * move. This returns the change-set that updates the stored length and drags attached pipe
 * endpoints (keeping the first/last leg orthogonal).
 */
export function syncRadiatorGeometry(project, res) {
  const update = [];
  const pipePatches = new Map();
  for (const rad of elementsOf(project, 'radiator')) {
    const prod = res.radiators[rad.id]?.product;
    if (!prod) continue;
    if (rad.length !== undefined && rad.length !== null && Math.abs(rad.length - prod.length) < 1e-6) continue;
    // connectors are always derived from the stored length (default 1 m before the first selection)
    const before = connectorsOf(project, { ...rad, length: rad.length ?? 1 }, null);
    const after = connectorsOf(project, { ...rad, length: prod.length }, null);
    update.push({ id: rad.id, patch: { length: prod.length } });
    for (let k = 0; k < before.length; k++) {
      const o = before[k].pos;
      const n = after[k].pos;
      const dx = n.x - o.x;
      const dy = n.y - o.y;
      for (const p of elementsOf(project, 'pipe', rad.levelId)) {
        const pts = (pipePatches.get(p.id) ?? p.points).map((q) => ({ ...q }));
        let changed = false;
        for (const [ei, ni] of [[0, 1], [pts.length - 1, pts.length - 2]]) {
          const e = pts[ei];
          if (Math.hypot(e.x - o.x, e.y - o.y) > 0.03) continue;
          const nb = pts[ni];
          if (nb && ni !== ei) {
            if (Math.abs(nb.x - e.x) < 1e-6) nb.x += dx;
            if (Math.abs(nb.y - e.y) < 1e-6) nb.y += dy;
          }
          e.x = round(n.x, 4);
          e.y = round(n.y, 4);
          changed = true;
        }
        if (changed) pipePatches.set(p.id, pts);
      }
    }
  }
  for (const [id, points] of pipePatches) update.push({ id, patch: { points } });
  return { add: [], update, remove: [] };
}

/** Apply a change-set directly (used by headless builders/tests; the UI wraps it in a transaction). */
export function applyChangeSet(project, cs) {
  for (const e of cs.add ?? []) project.elements[e.id] = e;
  for (const u of cs.update ?? []) if (project.elements[u.id]) Object.assign(project.elements[u.id], u.patch);
  for (const id of cs.remove ?? []) delete project.elements[id];
  return project;
}

// ---------------------------------------------------------------- underfloor heating

const UFH_MAX_OUTLETS = 12;
const NO_UFH_TYPES = ['boiler', 'stair', 'technical'];

/** Estimated number of UFH loops of a room: pipe ≈ area / 0.15 m + leads, split so no loop exceeds `maxLoop` (default 60 m). */
export function estimateUfhLoops(room, maxLoop = 60) {
  const pipe = (Math.abs(polygonArea(room.points)) * 0.92) / 0.15 + 8;
  return Math.max(1, Math.ceil(pipe / maxLoop));
}

/**
 * Manifold placement inside `room` on the room edge nearest `target` (0.3 m off the wall axis),
 * body centred on the target's projection, the return row towards the room.
 */
export function ufhCollectorPlacement(room, target, outlets) {
  const pts = room.points;
  const len = 0.05 * outlets + 0.23;
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < len + 0.5) continue;
    const dir = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const t = Math.max(len / 2 + 0.25, Math.min(L - len / 2 - 0.25, (target.x - a.x) * dir.x + (target.y - a.y) * dir.y));
    const q = { x: a.x + dir.x * t, y: a.y + dir.y * t };
    const d = Math.hypot(q.x - target.x, q.y - target.y);
    if (!best || d < best.d) best = { q, dir, d };
  }
  if (!best) return null;
  let dir = best.dir;
  let left = { x: -dir.y, y: dir.x };
  if (!pointInPolygon({ x: best.q.x + left.x * 0.5, y: best.q.y + left.y * 0.5 }, pts)) {
    dir = { x: -dir.x, y: -dir.y };
    left = { x: -dir.y, y: dir.x };
  }
  const off = 0.3;
  return {
    x: round(best.q.x - dir.x * (len / 2 - 0.15) + left.x * off, 3),
    y: round(best.q.y - dir.y * (len / 2 - 0.15) + left.y * off, 3),
    angle: round((Math.atan2(dir.y, dir.x) * 180) / Math.PI, 2),
  };
}

/** Common wall of two room outlines: total collinear overlap and the weighted midpoint. */
export function sharedEdge(a, b, tol = 0.05) {
  let len = 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = a[(i + 1) % a.length];
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    if (L < 1e-6) continue;
    const d = { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
    for (let j = 0; j < b.length; j++) {
      const r = b[j];
      const s = b[(j + 1) % b.length];
      // both ends of b's edge on a's line?
      const off = (z) => Math.abs((z.x - p.x) * d.y - (z.y - p.y) * d.x);
      if (off(r) > tol || off(s) > tol) continue;
      const t0 = Math.max(0, Math.min((r.x - p.x) * d.x + (r.y - p.y) * d.y, (s.x - p.x) * d.x + (s.y - p.y) * d.y));
      const t1 = Math.min(L, Math.max((r.x - p.x) * d.x + (r.y - p.y) * d.y, (s.x - p.x) * d.x + (s.y - p.y) * d.y));
      if (t1 - t0 <= 1e-3) continue;
      const w = t1 - t0;
      len += w;
      mx += (p.x + d.x * (t0 + t1) / 2) * w;
      my += (p.y + d.y * (t0 + t1) / 2) * w;
    }
  }
  return len > 0 ? { len, mid: { x: mx / len, y: my / len } } : { len: 0, mid: null };
}

/**
 * Automatic underfloor heating for a level (or the given rooms): rooms become UFH rooms and are
 * grouped to manifolds of ≤ 12 outlets. Existing UFH manifolds are filled first; new ones go into
 * the room that shares walls with the most UFH loops (preferably a corridor / hall / unheated room,
 * so leads cross one wall straight into the manifold's room), on the wall facing those rooms.
 */
export function autoUfh(project, levelId, { roomIds = null } = {}) {
  const all = elementsOf(project, 'room', levelId);
  const rooms = (roomIds ? all.filter((r) => roomIds.includes(r.id)) : all.filter((r) => isHeated(r) && !NO_UFH_TYPES.includes(r.roomType))).filter((r) => !r.ufh?.transit);
  const add = [];
  const update = [];
  const warnings = [];
  if (!rooms.length) return { add, update, remove: [], warnings };
  const maxLoop = project.settings.ufhMaxLoopM ?? 60;
  const need = new Map(rooms.map((r) => [r.id, estimateUfhLoops(r, maxLoop)]));
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const assign = new Map();
  // 1) existing manifolds: rooms containing or adjacent to the manifold's room, while outlets last
  const cols = elementsOf(project, 'collector', levelId).filter((c) => c.kind === 'ufh');
  const used = new Map(cols.map((c) => [c.id, 0]));
  for (const r of all) if (r.ufh?.collectorId && used.has(r.ufh.collectorId) && !need.has(r.id)) used.set(r.ufh.collectorId, used.get(r.ufh.collectorId) + estimateUfhLoops(r, maxLoop));
  for (const r of [...rooms].sort((a, b) => need.get(b.id) - need.get(a.id))) {
    const ok = cols.filter((c) => {
      if (used.get(c.id) + need.get(r.id) > UFH_MAX_OUTLETS) return false;
      const host = all.find((h) => pointInPolygon(c, h.points));
      return host && (host.id === r.id || sharedEdge(r.points, host.points).len >= 0.8);
    });
    const c = ok.sort((a, b) => d2(a, polygonCentroid(r.points)) - d2(b, polygonCentroid(r.points)))[0];
    if (c) {
      assign.set(r.id, c.id);
      used.set(c.id, used.get(c.id) + need.get(r.id));
    }
  }
  // 2) new manifolds, greedily in the host room that serves the most remaining loops
  const shared = new Map();
  const sh = (a, b) => {
    const k = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (!shared.has(k)) shared.set(k, sharedEdge(a.points, b.points));
    return shared.get(k);
  };
  let remaining = rooms.filter((r) => !assign.has(r.id));
  for (let guard = 0; remaining.length && guard < 50; guard++) {
    let best = null;
    for (const h of all) {
      const pick = [];
      let loops = 0;
      if (remaining.includes(h)) {
        pick.push(h);
        loops += need.get(h.id);
      }
      const passive = !need.has(h.id) && !(h.heating === 'ufh' || h.heating === 'mixed');
      let adj = remaining.filter((r) => r !== h && sh(r, h).len >= 0.8).sort((a, b) => sh(b, h).len - sh(a, h).len);
      if (!passive) {
        // a heated host: only neighbours behind ONE of its walls, so their leads never cross its floor loops
        const xs = h.points.map((p) => p.x);
        const ys = h.points.map((p) => p.y);
        const bb = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
        const sideOf = (m) => [['l', Math.abs(m.x - bb.x0)], ['r', Math.abs(m.x - bb.x1)], ['b', Math.abs(m.y - bb.y0)], ['t', Math.abs(m.y - bb.y1)]].sort((a, b) => a[1] - b[1])[0][0];
        const bySide = {};
        for (const r of adj) (bySide[sideOf(sh(r, h).mid)] ??= []).push(r);
        const sum = (list) => list.reduce((a, r) => a + need.get(r.id), 0);
        adj = Object.values(bySide).sort((a, b) => sum(b) - sum(a))[0] ?? [];
      }
      for (const r of adj) if (loops + need.get(r.id) <= UFH_MAX_OUTLETS) {
        pick.push(r);
        loops += need.get(r.id);
      }
      if (!pick.length) continue;
      const score = loops + (passive ? 3 : 0) + pick.length * 0.01;
      if (!best || score > best.score) best = { h, pick, loops, score };
    }
    if (!best) break;
    const others = best.pick.filter((r) => r !== best.h);
    let target;
    if (others.length) {
      const w = others.reduce((a, r) => a + need.get(r.id), 0);
      target = { x: others.reduce((a, r) => a + sh(r, best.h).mid.x * need.get(r.id), 0) / w, y: others.reduce((a, r) => a + sh(r, best.h).mid.y * need.get(r.id), 0) / w };
    } else target = polygonCentroid(best.h.points);
    const pl = ufhCollectorPlacement(best.h, target, Math.max(2, best.loops));
    if (!pl) {
      warnings.push({ code: 'ufh_no_place', params: { room: best.h.name } });
      remaining = remaining.filter((r) => !best.pick.includes(r));
      continue;
    }
    const col = newElement('collector', { levelId, ...pl, outlets: Math.min(UFH_MAX_OUTLETS, Math.max(2, best.loops)), kind: 'ufh', mixing: true });
    add.push(col);
    for (const r of best.pick) assign.set(r.id, col.id);
    remaining = remaining.filter((r) => !best.pick.includes(r));
  }
  for (const r of rooms) {
    if (!assign.has(r.id)) continue;
    update.push({ id: r.id, patch: { heating: r.heating === 'mixed' ? 'mixed' : 'ufh', ufh: { spacing: null, pipe: { material: 'PEX', dn: '16' }, pattern: 'auto', ...(r.ufh ?? {}), collectorId: assign.get(r.id) } } });
  }
  return { add, update, remove: [], warnings };
}
