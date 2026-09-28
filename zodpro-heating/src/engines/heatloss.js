// Room heat-loss engine (deterministic, traceable).
//
// Transmission:  Q = U · A · ΔT · (1 + Σβ) · n
// Ventilation:   Q = ρ · c · L · ΔT           (ρ at outdoor temp, c = 1005 J/kgK, L in m³/s)
// Infiltration:  Q = ρ · c · (n_inf · V) · ΔT
// Ground floor:  zone method (SNiP 2.04.05 / SP 60.13330 app.): 2 m strips from the exterior
//                walls with R0 = 2.1 / 4.3 / 8.6 / 14.2 m²K/W, plus insulating layers.
// Orientation additions β (SP 60 / SNiP 2.04.05): N, NE, NW, E: 0.10; SE, W: 0.05; S, SW: 0.
// Corner rooms (≥ 2 exterior walls): +0.05 on walls and windows.

import { assemblyU, ASSEMBLIES, MATERIALS, OPENING_TYPES } from '../data/materials.js';
import {
  elementsOf,
  roomGeometry,
  roomTemp,
  roomType,
  isHeated,
  sortedLevels,
  levelById,
} from '../core/model.js';
import {
  collinearOverlap,
  polygonCentroid,
  compassOf,
  pointInPolygon,
  projectOnSegment,
  norm,
  sub,
  dot,
} from '../core/util.js';

export const HEATLOSS_VERSION = 'heatloss/1.2';

export const ORIENTATION_BETA = { N: 0.1, NE: 0.1, NW: 0.1, E: 0.1, SE: 0.05, W: 0.05, S: 0, SW: 0 };
export const GROUND_ZONE_R = [2.1, 4.3, 8.6, 14.2];

function airDensity(t) {
  return 353 / (273.15 + t);
}

/** Returns room edges with the outward normal. */
function roomEdges(points) {
  const c = polygonCentroid(points);
  const edges = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const d = norm(sub(b, a));
    let n = { x: -d.y, y: d.x };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (dot(n, sub(mid, c)) < 0) n = { x: -n.x, y: -n.y };
    // robust check for concave polygons: probe point slightly outside must be outside
    const probe = { x: mid.x + n.x * 0.01, y: mid.y + n.y * 0.01 };
    if (pointInPolygon(probe, points)) n = { x: -n.x, y: -n.y };
    edges.push({ a, b, n, i });
  }
  return edges;
}

/** Insulating-layer resistance of a floor assembly (layers with λ < 1.2 per SP method). */
function floorExtraR(assemblyId, assemblies, materials) {
  const a = assemblies[assemblyId];
  if (!a) return 0;
  return a.layers.reduce((s, l) => {
    const m = materials[l.material];
    return m && m.lambda < 1.2 ? s + l.d / m.lambda : s;
  }, 0);
}

/** Area of a room polygon split into 2 m ground zones measured from exterior walls (numerical sampling). */
export function groundZones(roomPts, extWalls, cell = 0.1) {
  const xs = roomPts.map((p) => p.x);
  const ys = roomPts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const zones = [0, 0, 0, 0];
  for (let x = minX + cell / 2; x < maxX; x += cell) {
    for (let y = minY + cell / 2; y < maxY; y += cell) {
      const p = { x, y };
      if (!pointInPolygon(p, roomPts)) continue;
      let d = Infinity;
      for (const w of extWalls) d = Math.min(d, projectOnSegment(p, w.a, w.b).d - (w.thickness ?? 0.4) / 2);
      if (!extWalls.length) d = 99;
      const z = Math.min(3, Math.max(0, Math.floor(d / 2)));
      zones[z] += cell * cell;
    }
  }
  return zones;
}

/**
 * Calculate one room.
 * @param {object} project
 * @param {object} room element
 * @param {object} [lib] { assemblies, materials, openings } — overridable libraries
 */
export function roomHeatLoss(project, room, lib = {}) {
  const assemblies = { ...ASSEMBLIES, ...(project.library?.assemblies ?? {}), ...(lib.assemblies ?? {}) };
  const materials = { ...MATERIALS, ...(project.library?.materials ?? {}), ...(lib.materials ?? {}) };
  const openingsLib = { ...OPENING_TYPES, ...(project.library?.openings ?? {}), ...(lib.openings ?? {}) };
  const s = project.settings;
  const tOut = s.climate.tOut;
  const tIn = roomTemp(room);
  const dT = tIn - tOut;
  const geo = roomGeometry(project, room);
  const lines = [];
  const warnings = [];
  const levelId = room.levelId;
  const walls = elementsOf(project, 'wall', levelId);
  const openings = [...elementsOf(project, 'window', levelId), ...elementsOf(project, 'door', levelId)];
  const otherRooms = elementsOf(project, 'room', levelId).filter((r) => r.id !== room.id);
  const edges = roomEdges(room.points);

  // pass 1: collect exterior exposure to detect corner rooms
  const exposures = [];
  for (const e of edges) {
    for (const w of walls) {
      const tol = (w.thickness ?? 0.3) / 2 + 0.12;
      const ov = collinearOverlap(w.a, w.b, e.a, e.b, tol);
      if (!ov || ov.length < 0.05) continue;
      exposures.push({ edge: e, wall: w, ov });
    }
  }
  const extDirections = new Set(exposures.filter((x) => x.wall.exterior).map((x) => compassOf(x.edge.n, s.northAngle)));
  const corner = extDirections.size >= 2;

  let transmission = 0;
  for (const { edge, wall, ov } of exposures) {
    const orient = compassOf(edge.n, s.northAngle);
    // openings of this wall that lie within the overlap interval
    const ops = openings.filter((o) => o.wallId === wall.id && o.offset >= ov.s0 - 1e-6 && o.offset <= ov.s1 + 1e-6);
    const opArea = ops.reduce((a, o) => a + o.width * o.height, 0);
    const gross = ov.length * geo.height;
    const net = Math.max(0, gross - opArea);
    let wallDT;
    let adjacentName = null;
    if (wall.exterior) {
      wallDT = dT;
    } else {
      // interior wall: loss only towards a colder adjacent room (ΔT ≥ 3 K)
      const probe = {
        x: (edge.a.x + edge.b.x) / 2 + edge.n.x * ((wall.thickness ?? 0.12) + 0.15),
        y: (edge.a.y + edge.b.y) / 2 + edge.n.y * ((wall.thickness ?? 0.12) + 0.15),
      };
      const adj = otherRooms.find((r) => pointInPolygon(probe, r.points));
      if (!adj) continue;
      const tAdj = roomTemp(adj);
      if (tIn - tAdj < 3) continue;
      wallDT = tIn - tAdj;
      adjacentName = adj.name;
    }
    let Uw;
    try {
      Uw = assemblyU(wall.assembly, assemblies, materials).U;
    } catch (err) {
      warnings.push({ code: 'missing_assembly', params: { wall: wall.id, assembly: wall.assembly } });
      continue;
    }
    const betaO = wall.exterior ? ORIENTATION_BETA[orient] ?? 0 : 0;
    const betaC = wall.exterior && corner ? 0.05 : 0;
    const beta = betaO + betaC;
    const Qw = Uw * net * wallDT * (1 + beta);
    transmission += Qw;
    lines.push({
      kind: wall.exterior ? 'wall_ext' : 'wall_int',
      ref: wall.id,
      orient: wall.exterior ? orient : adjacentName,
      area: net,
      U: Uw,
      dT: wallDT,
      beta,
      n: 1,
      Q: Qw,
    });
    for (const o of ops) {
      const t = openingsLib[o.type];
      if (!t) {
        warnings.push({ code: 'missing_opening_type', params: { id: o.id } });
        continue;
      }
      const A = o.width * o.height;
      const betaDoor = o.cat === 'door' && wall.exterior ? 0.27 * (levelById(project, levelId)?.height ?? 3) : 0; // SP: external door opening allowance
      const b = beta + (o.cat === 'door' ? Math.min(betaDoor, 1) : 0);
      const Qo = t.U * A * wallDT * (1 + b);
      transmission += Qo;
      lines.push({ kind: o.cat, ref: o.id, orient: wall.exterior ? orient : adjacentName, area: A, U: t.U, dT: wallDT, beta: b, n: 1, Q: Qo });
    }
  }

  // floor & roof by level position
  const levels = sortedLevels(project);
  const idx = levels.findIndex((l) => l.id === levelId);
  const isLowest = idx === 0;
  const isTop = idx === levels.length - 1;
  if (isLowest && room.floorOnGround !== false) {
    const extWalls = walls.filter((w) => w.exterior);
    const zones = groundZones(room.points, extWalls);
    const floorAsm = room.floorAssembly ?? s.groundFloorAssembly ?? 'floor_ground_xps50';
    const extraR = floorExtraR(floorAsm, assemblies, materials);
    zones.forEach((A, z) => {
      if (A <= 0.001) return;
      const U = 1 / (GROUND_ZONE_R[z] + extraR);
      const Q = U * A * dT;
      transmission += Q;
      lines.push({ kind: 'floor_ground', ref: `zone ${z + 1}`, orient: '-', area: A, U, dT, beta: 0, n: 1, Q });
    });
  }
  if (isTop && room.roofAbove !== false) {
    const roofAsm = room.roofAssembly ?? s.roofAssembly ?? 'roof_attic_mw200';
    try {
      const U = assemblyU(roofAsm, assemblies, materials).U;
      const n = s.roofN ?? 0.9; // attic floor coefficient (SP 50.13330 Table 6)
      const Q = U * geo.area * dT * n;
      transmission += Q;
      lines.push({ kind: 'roof', ref: roofAsm, orient: '-', area: geo.area, U, dT, beta: 0, n, Q });
    } catch {
      warnings.push({ code: 'missing_assembly', params: { assembly: roofAsm } });
    }
  }

  // ventilation / infiltration
  const rho = airDensity(tOut);
  const c = 1005;
  const achVent = room.ach ?? roomType(room).ach;
  const Lvent = (achVent * geo.volume) / 3600; // m³/s
  const Linf = ((room.infiltrationAch ?? s.infiltrationAch) * geo.volume) / 3600;
  const Qvent = rho * c * Lvent * dT;
  const Qinf = rho * c * Linf * dT;
  let air;
  let airRule;
  if (s.ventPolicy === 'sum') {
    air = Qvent + Qinf;
    airRule = 'sum';
  } else {
    air = Math.max(Qvent, Qinf);
    airRule = Qvent >= Qinf ? 'vent' : 'inf';
  }

  const gains = (s.internalGainsWm2 ?? 0) * geo.area;
  const heated = isHeated(room);
  const total = Math.max(0, transmission + air - gains);
  const safety = s.heatLossSafety ?? 1;
  const required = heated ? total * safety : 0;

  return {
    roomId: room.id,
    version: HEATLOSS_VERSION,
    inputs: { tIn, tOut, dT, area: geo.area, volume: geo.volume, height: geo.height, achVent, infAch: room.infiltrationAch ?? s.infiltrationAch, corner, standard: s.standard },
    lines,
    transmission,
    ventilation: Qvent,
    infiltration: Qinf,
    airApplied: air,
    airRule,
    rhoAir: rho,
    gains,
    total,
    safety,
    margin: required - total,
    required,
    specific: geo.area > 0 ? required / geo.area : 0,
    heated,
    warnings,
  };
}

export function buildingHeatLoss(project) {
  const out = {};
  for (const r of elementsOf(project, 'room')) out[r.id] = roomHeatLoss(project, r);
  return out;
}
