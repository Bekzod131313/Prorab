// Calculation pipeline — the dependency chain of the parametric model:
//
//   geometry → heat loss → radiator selection / UFH → network topology → flows
//   → pipe sizing → hydraulics → balancing → pump → boiler → expansion → BOM → cost → validation
//
// Pure function of the project JSON (no DOM). Deterministic and versioned: every result carries
// the engine versions and the settings that produced it. Heat loss is cached per room by input
// hash (incremental recalculation); the rest of the chain is cheap and recomputed.

import { roomHeatLoss, HEATLOSS_VERSION } from './heatloss.js';
import { selectRadiator, outputAt, radiatorById, RADIATOR_VERSION } from './radiator.js';
import { designUfh, refineWithLayout, fluxCapacity, UFH_VERSION } from './ufh.js';
import { pipeType as ufhPipeType, innerDiameter } from './ufh/pipes.js';
import { layoutRoomUfh, splitRoomBands, UFH_LAYOUT_VERSION } from './ufhlayout.js';
import { buildNetwork, NETWORK_VERSION } from './network.js';
import { flowFromHeat, pipeSegment, kvDrop, kvRequired, paToM, HYDRAULICS_VERSION } from './hydraulics.js';
import { sizePipe, selectPump, selectBoiler, sizeExpansion, EQUIPMENT_VERSION } from './equipment.js';
import { buildBom, costEstimate, BOM_VERSION } from './bom.js';
import { validate, clashDetection, VALIDATION_VERSION } from './validation.js';
import { RADIATORS, PIPE_MATERIALS, VALVES, BOILERS, PUMPS, COLLECTORS } from '../data/products.js';
import { elementsOf, roomTemp, isHeated, integrityCheck, collectorPort } from '../core/model.js';
import { pointInPolygon, polygonArea, polygonCentroid } from '../core/util.js';
import { water } from './water.js';

export const CALC_VERSION = 'zodpro-calc/1.2';

export const DEPENDENCY_GRAPH = {
  heatLoss: { inputs: ['room', 'wall', 'window', 'door', 'level', 'settings.climate', 'settings.heatLoss'], outputs: ['radiators', 'ufh', 'boiler'] },
  radiators: { inputs: ['heatLoss', 'radiator', 'settings.regime', 'settings.radiatorReserve'], outputs: ['network'] },
  ufh: { inputs: ['heatLoss', 'room.ufh', 'settings.ufhRegime'], outputs: ['network', 'bom'] },
  network: { inputs: ['radiators', 'pipe', 'riser', 'collector', 'boiler', 'pump'], outputs: ['flows'] },
  flows: { inputs: ['network', 'heatLoss', 'settings.regime'], outputs: ['sizing'] },
  sizing: { inputs: ['flows', 'settings.velocity', 'settings.maxR'], outputs: ['hydraulics'] },
  hydraulics: { inputs: ['sizing', 'network'], outputs: ['balancing', 'pump'] },
  balancing: { inputs: ['hydraulics'], outputs: ['validation'] },
  pump: { inputs: ['hydraulics', 'flows'], outputs: ['bom'] },
  boiler: { inputs: ['heatLoss', 'settings.dhw'], outputs: ['expansion', 'bom'] },
  expansion: { inputs: ['network', 'radiators', 'boiler'], outputs: ['bom'] },
  bom: { inputs: ['network', 'sizing', 'radiators', 'ufh', 'pump', 'boiler', 'expansion'], outputs: ['cost'] },
  cost: { inputs: ['bom', 'settings.currency', 'settings.rates'], outputs: ['documentation'] },
  validation: { inputs: ['*'], outputs: ['dashboard'] },
};

const ZETA_ELBOW = { PPR: 1.2, PEX: 0.3, PERT: 0.3, STEEL: 0.8, CU: 0.8 };
const ZETA_TEE = 1.0;
const COLLECTOR_PORT_KV = 2.5;
const RAD_CONN_ID = 0.0157;

const heatLossCache = new Map();

function heatLossHash(project, room) {
  const lvl = room.levelId;
  const rel = Object.values(project.elements).filter((e) => e.levelId === lvl && ['wall', 'window', 'door', 'room'].includes(e.cat));
  return JSON.stringify([room, rel, project.levels, project.settings.climate, project.settings.northAngle, project.settings.infiltrationAch, project.settings.ventPolicy, project.settings.internalGainsWm2, project.settings.heatLossSafety, project.settings.roofN, project.library ?? null]);
}

export function catalogOf(project) {
  return [...RADIATORS, ...(project.library?.radiators ?? [])];
}

export function runCalculation(project, opts = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const s = project.settings;
  const catalog = catalogOf(project);
  const res = {
    version: CALC_VERSION,
    engines: { UFH_LAYOUT_VERSION, HEATLOSS_VERSION, RADIATOR_VERSION, UFH_VERSION, NETWORK_VERSION, HYDRAULICS_VERSION, EQUIPMENT_VERSION, BOM_VERSION, VALIDATION_VERSION },
    standard: s.standard,
    timestamp: new Date().toISOString(),
    rooms: {},
    radiators: {},
    ufh: {},
    pipes: {},
    circuits: [],
    stats: {},
  };

  // ---------- 1. heat loss (incremental) ----------
  const rooms = elementsOf(project, 'room');
  let cacheHits = 0;
  for (const r of rooms) {
    const h = heatLossHash(project, r);
    const c = heatLossCache.get(r.id);
    if (c && c.hash === h && !opts.noCache) {
      res.rooms[r.id] = c.result;
      cacheHits++;
    } else {
      const result = roomHeatLoss(project, r);
      heatLossCache.set(r.id, { hash: h, result });
      res.rooms[r.id] = result;
    }
  }
  res.stats.heatLossCacheHits = cacheHits;

  const { ts, tr } = s.regime;
  // ---------- 2. UFH (base load; radiators cover the remainder in 'mixed' rooms) ----------
  const ufhByCollector = new Map();
  const portCursor = new Map();
  const levelNo = new Map([...project.levels].sort((a, b) => a.elevation - b.elevation).map((l, i) => [l.id, i + 1]));
  const ufhColNo = new Map();
  for (const l of project.levels) {
    elementsOf(project, 'collector', l.id)
      .filter((c) => c.kind === 'ufh')
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach((c, i) => ufhColNo.set(c.id, i + 1));
  }
  // stored loops (UFH engine / manual) own their outlets; room-based UFH takes the free ones
  const storedLoops = elementsOf(project, 'ufh_loop');
  const zones = elementsOf(project, 'ufh_zone');
  const usedPorts = new Map();
  for (const l of storedLoops) {
    if (!usedPorts.has(l.collectorId)) usedPorts.set(l.collectorId, new Set());
    usedPorts.get(l.collectorId).add(l.portIndex);
  }
  const freeList = (colId) => {
    const used = usedPorts.get(colId) ?? new Set();
    const out = [];
    for (let i = 0; out.length < 40; i++) if (!used.has(i)) out.push(i);
    return out;
  };
  const roomPorts = new Map();
  // a room with an engine zone is heated by that zone (no second, room-based layout)
  const zoneRoom = new Map();
  for (const z of zones) {
    const c = polygonCentroid(z.points);
    const r = z.roomId && project.elements[z.roomId] ? project.elements[z.roomId] : rooms.find((x) => x.levelId === z.levelId && pointInPolygon(c, x.points));
    if (r) zoneRoom.set(z.id, r.id);
  }
  const zonedRooms = new Set(zoneRoom.values());
  const ufhRooms = rooms.filter((r) => ['ufh', 'mixed'].includes(r.heating) && isHeated(r) && !r.ufh?.transit && !zonedRooms.has(r.id)).sort((a, b) => String(a.number ?? '').localeCompare(String(b.number ?? '')));
  for (const r of ufhRooms) {
    const hl = res.rooms[r.id];
    const Q = hl.required;
    const bath = r.roomType === 'bathroom' || r.roomType === 'wc';
    // one manifold, or several (a large room is cut into bands, one per manifold, ≤ 12 loops each)
    const colIds = (r.ufh?.collectorIds?.length ? r.ufh.collectorIds : [r.ufh?.collectorId]).filter((id) => project.elements[id]);
    const cols = colIds.map((id) => project.elements[id]);
    const parts = cols.length > 1 ? splitRoomBands(r.points, cols) : [{ polygon: r.points, col: cols[0] ?? null, share: 1 }];
    const maxSurface = bath ? s.ufhMaxSurface.bathroom : s.ufhMaxSurface.occupied;
    // real loop geometry: edge zone 0.1 m from the inner wall face
    const wallHalf = Math.max(0.1, ...elementsOf(project, 'wall', r.levelId).map((w) => (w.thickness ?? 0.2) / 2));
    const lvNo = levelNo.get(r.levelId) ?? 1;
    const done = parts.map(({ polygon, col, share }) => {
      const cen = polygon.reduce((a, p) => ({ x: a.x + p.x / polygon.length, y: a.y + p.y / polygon.length }), { x: 0, y: 0 });
      let d = designUfh({
        Q: Q * share,
        area: hl.inputs.area * share,
        ti: roomTemp(r),
        ts: s.ufhRegime.ts,
        tr: s.ufhRegime.tr,
        spacing: r.ufh?.spacing ?? null,
        // bathrooms / small rooms: comfort floor at ≥ 150 mm, no densification
        minSpacing: bath || hl.inputs.area < 8 ? 0.15 : undefined,
        comfortFloor: bath,
        leadLength: col ? (Math.abs(col.x - cen.x) + Math.abs(col.y - cen.y)) / 2 : 4,
        maxLoop: s.ufhMaxLoopM,
        maxSurface,
        maxLoopKpa: s.ufhMaxLoopKpa,
        pipe: r.ufh?.pipe ?? { material: 'PEX', dn: '16' },
        pattern: r.ufh?.pattern ?? 'auto',
      });
      const first = col ? portCursor.get(col.id) ?? 0 : 0;
      const free = col ? freeList(col.id) : [];
      const layoutFn = (n) =>
        layoutRoomUfh({
          polygon,
          loops: n,
          spacing: d.spacing,
          pattern: d.pattern,
          inset: wallHalf + 0.1,
          toward: col ? { x: col.x, y: col.y } : cen,
          ports: col ? Array.from({ length: n }, (_, i) => ({ supply: collectorPort(col, free[first + i], 'supply'), return: collectorPort(col, free[first + i], 'return') })) : null,
        });
      d = refineWithLayout(d, layoutFn, { ts: s.ufhRegime.ts, tr: s.ufhRegime.tr, maxLoop: s.ufhMaxLoopM, maxLoopKpa: s.ufhMaxLoopKpa });
      if (col) {
        portCursor.set(col.id, first + d.loops);
        // loop IDs like the drawings: <floor>.<manifold>.<outlet>  e.g. 1.2.3
        const colNo = ufhColNo.get(col.id) ?? 1;
        d.loopIds = d.layout.map((l, i) => `${lvNo}.${colNo}.${free[first + (l.port ?? i)] + 1}`);
        d.layout.forEach((l, i) => {
          l.collectorId = col.id;
          l.portIndex = free[first + (l.port ?? i)];
          if (!roomPorts.has(col.id)) roomPorts.set(col.id, []);
          roomPorts.get(col.id).push(l.portIndex);
        });
        d.firstPort = free[first] + 1;
      } else d.loopIds = d.layout.map((_, i) => `${lvNo}.0.${i + 1}`);
      d.collectorId = col?.id ?? null;
      return d;
    });
    let d = done[0];
    if (done.length > 1) {
      const all = done.flatMap((x) => x.layout);
      d = {
        ...done[0],
        loops: done.reduce((a, x) => a + x.loops, 0),
        Qout: done.reduce((a, x) => a + x.Qout, 0),
        totalLength: done.reduce((a, x) => a + x.totalLength, 0),
        loopLength: Math.max(...done.map((x) => x.loopLength)),
        dpLoop: Math.max(...done.map((x) => x.dpLoop)),
        velocity: Math.max(...done.map((x) => x.velocity)),
        flowPerLoopLh: Math.max(...done.map((x) => x.flowPerLoopLh)),
        layout: all,
        loopIds: done.flatMap((x) => x.loopIds),
        warnings: [...new Map(done.flatMap((x) => x.warnings).map((w) => [w.code, w])).values()],
        firstPort: null,
      };
    }
    d.parts = done.map((x) => ({ collectorId: x.collectorId, loops: x.loops, Qout: x.Qout, dpLoop: x.dpLoop, firstPort: x.firstPort }));
    d.collectorIds = colIds;
    d.roomId = r.id;
    d.perimeter = r.points.reduce((a, p, i) => a + Math.hypot(r.points[(i + 1) % r.points.length].x - p.x, r.points[(i + 1) % r.points.length].y - p.y), 0);
    d.area = hl.inputs.area;
    res.ufh[r.id] = d;
    for (const part of d.parts) {
      if (!part.collectorId) continue;
      if (!ufhByCollector.has(part.collectorId)) ufhByCollector.set(part.collectorId, []);
      ufhByCollector.get(part.collectorId).push(part);
    }
  }
  // ---------- 2b. stored loops (UFH engine zones + manual loops): output and loop hydraulics ----------
  res.ufhLoops = {};
  res.ufhZones = {};
  const zoneOut = new Map(); // roomId → W
  const tmU = (s.ufhRegime.ts + s.ufhRegime.tr) / 2;
  const dTu = s.ufhRegime.ts - s.ufhRegime.tr;
  const turns = (path) => {
    let a = 0;
    for (let i = 2; i < path.length; i++) {
      const u = Math.atan2(path[i - 1].y - path[i - 2].y, path[i - 1].x - path[i - 2].x);
      const v = Math.atan2(path[i].y - path[i - 1].y, path[i].x - path[i - 1].x);
      let d = v - u;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      a += Math.abs(d);
    }
    return a / (Math.PI / 2); // in 90° bends
  };
  const loopHyd = (l, Q) => {
    const pt = ufhPipeType(l.pipeType);
    const f = flowFromHeat(Math.max(Q, 1), dTu, tmU);
    const seg = pipeSegment({ vM3s: f.vM3s, dInner: innerDiameter(pt), k: 7e-6, length: l.length, zeta: 0.3 * turns(l.path) + 2 * 1.5, tm: tmU });
    return { Q, flowLh: f.vLh, velocity: seg.v, dpKpa: seg.dp / 1000, R: seg.R };
  };
  for (const z of zones) {
    const roomId = zoneRoom.get(z.id) ?? null;
    const r = roomId ? project.elements[roomId] : null;
    const hl = roomId ? res.rooms[roomId] : null;
    const area = Math.abs(polygonArea(z.points));
    const ti = r ? roomTemp(r) : 20;
    const loops = storedLoops.filter((l) => l.zoneId === z.id);
    const heated = area * (z.report?.coverage ?? 0.9);
    const cap = fluxCapacity(z.spacing ?? 0.15, s.ufhRegime.ts, s.ufhRegime.tr, ti) * heated;
    const demand = hl ? hl.required * Math.min(1, area / Math.max(0.01, hl.inputs.area)) : cap;
    const Qout = Math.max(0, Math.min(cap, demand));
    zoneOut.set(roomId, (zoneOut.get(roomId) ?? 0) + Qout);
    const hl2 = loops.reduce((a, l) => a + (l.heatingLength || l.length), 0) || 1;
    for (const l of loops) res.ufhLoops[l.id] = { ...loopHyd(l, Qout * 1.1 * ((l.heatingLength || l.length) / hl2)), zoneId: z.id, roomId };
    res.ufhZones[z.id] = { roomId, area, heated, capacity: cap, demand, Qout, loops: loops.length, coverage: z.report?.coverage ?? null, maxDpKpa: Math.max(0, ...loops.map((l) => res.ufhLoops[l.id].dpKpa)) };
  }
  // manual loops without a zone: output from the heated band of the pipe (length × spacing)
  for (const l of storedLoops.filter((x) => !x.zoneId || !project.elements[x.zoneId])) {
    const c = l.path[Math.floor(l.path.length / 2)] ?? l.path[0];
    const r = rooms.find((x) => x.levelId === l.levelId && pointInPolygon(c, x.points));
    const q = fluxCapacity(l.spacing ?? 0.15, s.ufhRegime.ts, s.ufhRegime.tr, r ? roomTemp(r) : 20);
    const Q = q * (l.heatingLength || l.length) * (l.spacing ?? 0.15);
    res.ufhLoops[l.id] = { ...loopHyd(l, Q * 1.1), zoneId: null, roomId: r?.id ?? null };
    if (r) zoneOut.set(r.id, (zoneOut.get(r.id) ?? 0) + Q);
  }
  for (const l of storedLoops) {
    const h = res.ufhLoops[l.id];
    if (!l.collectorId || !h) continue;
    if (!ufhByCollector.has(l.collectorId)) ufhByCollector.set(l.collectorId, []);
    ufhByCollector.get(l.collectorId).push({ collectorId: l.collectorId, loops: 1, Qout: h.Q / 1.1, dpLoop: h.dpKpa * 1000, loopId: l.id });
  }
  res.ufhZoneOut = Object.fromEntries([...zoneOut].filter(([k]) => k));
  res.ufhRoomPorts = Object.fromEntries(roomPorts);
  const allCols = new Set([...portCursor.keys(), ...usedPorts.keys()]);
  res.ufhPorts = Object.fromEntries([...allCols].map((id) => [id, Math.max(0, ...(roomPorts.get(id) ?? []).map((i) => i + 1), ...[...(usedPorts.get(id) ?? [])].map((i) => i + 1))]));

  // ---------- 3. radiators ----------
  const rads = elementsOf(project, 'radiator');
  const byRoom = new Map();
  for (const rad of rads) {
    let roomId = rad.roomId;
    if (!roomId || !project.elements[roomId]) {
      const r = rooms.find((x) => x.levelId === rad.levelId && pointInPolygon({ x: rad.x, y: rad.y }, x.points));
      roomId = r?.id ?? null;
    }
    if (!byRoom.has(roomId)) byRoom.set(roomId, []);
    byRoom.get(roomId).push(rad);
  }
  for (const [roomId, list] of byRoom) {
    const room = roomId ? project.elements[roomId] : null;
    const ti = room ? roomTemp(room) : 20;
    const hl = roomId ? res.rooms[roomId] : null;
    const required = hl ? Math.max(0, hl.required - (res.ufh[roomId]?.Qout ?? 0) - (res.ufhZoneOut[roomId] ?? 0)) : 0;
    const manual = list.filter((r) => r.selection === 'manual' && r.productId);
    const manualOut = manual.reduce((a, r) => a + outputAt(radiatorById(r.productId, catalog) ?? { q75: 0 }, ts, tr, ti), 0);
    const autos = list.filter((r) => !(r.selection === 'manual' && r.productId));
    const remaining = Math.max(0, required - manualOut);
    for (const rad of list) {
      let product;
      let sel = null;
      if (rad.selection === 'manual' && rad.productId) {
        product = radiatorById(rad.productId, catalog);
      } else {
        const share = autos.length ? remaining / autos.length : 0;
        const req = share * (s.radiatorReserve ?? 1.1);
        let maxHeight = null;
        let preferLength = null;
        const win = rad.windowId ? project.elements[rad.windowId] : null;
        const kind = rad.prefKind ?? 'panel';
        if (win && kind === 'convector') preferLength = win.width + 0.1; // in-floor convector spans the window
        else if (win && kind !== 'towel') {
          maxHeight = Math.max(0.3, win.sill - (rad.mountHeight ?? 0.1) - 0.05);
          preferLength = win.width * 0.75;
        }
        if (win && kind === 'panel' && !rad.prefHeight) {
          // under a window (designer practice): 500 mm high if it fits under the sill (else the tallest
          // that does), length 50…100 % of the window (aim 75 %); if the preferred type is far too
          // strong at that length, a lighter type (21 / 11) is taken instead of a stub radiator
          const heights = [...new Set(catalog.filter((c) => c.kind === 'panel').map((c) => c.height))].filter((h) => h <= maxHeight + 1e-6).sort((a, b) => b - a);
          const H = heights.includes(0.5) ? 0.5 : heights[0];
          const base = { ts, tr, ti, kind, height: H, minLength: Math.max(0.4, win.width * 0.5), maxLength: win.width + 0.2, preferLength, catalog };
          const typed = selectRadiator(Math.max(req, 1), { ...base, type: rad.prefType ?? 22 });
          const any = selectRadiator(Math.max(req, 1), base);
          sel = !typed.product || (any.product && typed.excessPct > 40 && any.excessPct < typed.excessPct - 15) ? any : typed;
          if (!sel.product) sel = selectRadiator(Math.max(req, 1), { ...base, maxLength: null, minLength: null });
        }
        if (!sel?.product)
          sel = selectRadiator(Math.max(req, 1), {
            ts,
            tr,
            ti,
            kind,
            type: rad.prefType ?? (kind === 'panel' ? 22 : null),
            maxHeight: rad.prefHeight ? null : maxHeight,
            height: rad.prefHeight ?? null,
            preferLength,
            catalog,
          });
        if (!sel.product) {
          // relax constraints: any type
          sel = selectRadiator(Math.max(req, 1), { ts, tr, ti, kind: rad.prefKind ?? 'panel', maxHeight, catalog });
        }
        product = sel.product;
      }
      const output = product ? outputAt(product, ts, tr, ti) : 0;
      res.radiators[rad.id] = {
        roomId,
        product,
        productId: product?.id ?? null,
        output,
        nominal75: product?.q75 ?? 0,
        selection: sel,
        mode: rad.selection === 'manual' ? 'manual' : 'auto',
        ti,
      };
    }
    // design heat per radiator (share of room load proportional to output)
    const totalOut = list.reduce((a, r) => a + res.radiators[r.id].output, 0);
    for (const rad of list) {
      const rr = res.radiators[rad.id];
      rr.designQ = required > 0 && totalOut > 0 ? (required * rr.output) / totalOut : rr.output;
    }
  }
  // transit rooms (corridors the manifold leads run through): heated by the leads passing over them
  res.ufhTransit = {};
  for (const r of rooms.filter((x) => x.ufh?.transit && isHeated(x))) {
    let length = 0;
    let Q = 0;
    for (const d of Object.values(res.ufh)) {
      if (d.roomId === r.id || project.elements[d.roomId]?.levelId !== r.levelId) continue;
      const qm = d.totalLength > 0 ? d.Qout / d.totalLength : 0;
      for (const l of d.layout ?? [])
        for (const lead of [l.supplyLead, l.returnLead])
          for (let i = 1; i < (lead?.length ?? 0); i++) {
            const a = lead[i - 1];
            const b = lead[i];
            const L = Math.hypot(b.x - a.x, b.y - a.y);
            const n = Math.max(1, Math.ceil(L / 0.1));
            for (let k = 0; k < n; k++) {
              const t = (k + 0.5) / n;
              if (pointInPolygon({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }, r.points)) {
                length += L / n;
                Q += (qm * L) / n;
              }
            }
          }
    }
    res.ufhTransit[r.id] = { length, Q };
  }
  for (const r of rooms) {
    const hl = res.rooms[r.id];
    const radiatorOutput = (byRoom.get(r.id) ?? []).reduce((a, x) => a + res.radiators[x.id].output, 0);
    const ufhOutput = (res.ufh[r.id]?.Qout ?? 0) + (res.ufhTransit[r.id]?.Q ?? 0) + (res.ufhZoneOut[r.id] ?? 0);
    hl.emitters = { radiatorOutput, ufhOutput, coverage: hl.required > 0 ? (radiatorOutput + ufhOutput) / hl.required : null };
  }
  const productLookup = (el) => (el.cat === 'radiator' ? res.radiators[el.id]?.product : null);

  // ---------- 4. network ----------
  const net = buildNetwork(project, productLookup);
  res.networkIssues = net.issues;

  // ---------- 5. flows ----------
  const tmS = ts;
  const tmR = tr;
  const edgeFlow = new Map(); // edge id → {vM3s, Q}
  const consumers = [];
  for (const c of net.consumers) {
    let Q = 0;
    let dT = ts - tr;
    let dpConsumer = 0;
    let detail = {};
    if (c.kind === 'radiator') {
      const rr = res.radiators[c.elementId];
      Q = rr?.designQ ?? 0;
    } else if (c.kind === 'ufh_collector') {
      const loops = ufhByCollector.get(c.elementId) ?? [];
      Q = loops.reduce((a, l) => a + l.Qout * 1.1, 0);
      const col = project.elements[c.elementId];
      const mixing = col.mixing !== false;
      dT = mixing ? ts - s.ufhRegime.tr : s.ufhRegime.ts - s.ufhRegime.tr;
      detail = { loops: loops.length, mixing, maxLoopDp: Math.max(0, ...loops.map((l) => l.dpLoop)) };
    }
    const f = flowFromHeat(Math.max(Q, 0.001), dT, (ts + tr) / 2);
    consumers.push({ ...c, Q, dT, flow: f, dpConsumer, detail });
    if (!c.connected) continue;
    for (const e of [...c.supplyPath, ...c.returnPath]) {
      const cur = edgeFlow.get(e.id) ?? { vM3s: 0, Q: 0 };
      cur.vM3s += f.vM3s;
      cur.Q += Q;
      edgeFlow.set(e.id, cur);
    }
  }

  // ---------- 6. sizing + 7. hydraulics per edge ----------
  const edgeRes = new Map();
  for (const e of net.edges) {
    const fl = edgeFlow.get(e.id) ?? { vM3s: 0, Q: 0 };
    const tm = e.system === 'supply' ? tmS : tmR;
    if (e.kind === 'pipe' || e.kind === 'riser') {
      const el = project.elements[e.elementId];
      const material = el.material ?? s.pipeMaterial;
      const mat = PIPE_MATERIALS[material];
      let sizing = null;
      let dn = el.dn;
      if (el.autoSize !== false || !dn) {
        sizing = sizePipe({ vM3s: fl.vM3s, material, tm, velMin: s.velMin, velMax: s.velMax, maxR: s.maxRPaM, preferred: el.dnRange });
        dn = sizing.selected?.dn ?? dn;
      }
      const size = mat?.sizes.find((z) => z.dn === String(dn)) ?? mat?.sizes[0];
      const nodeA = net.nodes.get(e.a);
      const nodeB = net.nodes.get(e.b);
      const tees = (nodeA?.tee ? 1 : 0) + (nodeB?.tee ? 1 : 0);
      const zeta = e.bends * (ZETA_ELBOW[material] ?? 1) + tees * ZETA_TEE * 0.5 + (el.zetaExtra ?? 0);
      const seg = pipeSegment({ vM3s: fl.vM3s, dInner: size?.id ?? 0.02, k: mat?.k ?? 1e-5, length: e.length, zeta, tm });
      let status = 'ok';
      if (fl.vM3s > 0 && seg.v > s.velCritical) status = 'critical';
      else if (fl.vM3s > 0 && (seg.v > s.velMax || seg.R > s.maxRPaM)) status = 'warning';
      else if (fl.vM3s > 0 && seg.v < s.velMin) status = 'low';
      const r = {
        elementId: e.elementId,
        kind: e.kind,
        system: e.system,
        material,
        dn: size?.dn,
        dInner: size?.id,
        length: e.length,
        bends: e.bends,
        tees,
        zeta,
        flowLh: fl.vM3s * 3.6e6,
        vM3s: fl.vM3s,
        Q: fl.Q,
        ...seg,
        status,
        sizing,
        waterL: size ? ((Math.PI * size.id * size.id) / 4) * e.length * 1000 : 0,
      };
      edgeRes.set(e.id, r);
      res.pipes[e.elementId] = r;
    } else if (e.kind === 'manifold') {
      const vM3h = fl.vM3s * 3600;
      edgeRes.set(e.id, { kind: 'manifold', dp: kvDrop(vM3h, COLLECTOR_PORT_KV) / 2, vM3s: fl.vM3s });
    } else {
      edgeRes.set(e.id, { kind: e.kind, dp: 0, vM3s: fl.vM3s });
    }
  }

  // boiler resistance
  let boilerDp = 0;
  let boilerEl = net.source ? project.elements[net.source.elementId] : null;
  const totalFlow = consumers.filter((c) => c.connected).reduce((a, c) => a + c.flow.vM3s, 0);
  const totalQ = consumers.filter((c) => c.connected).reduce((a, c) => a + c.Q, 0);

  // ---------- boiler selection ----------
  const heatedLoad = rooms.reduce((a, r) => a + (res.rooms[r.id].required ?? 0), 0);
  const boilerSel = selectBoiler({ heatingW: heatedLoad, dhwKw: s.dhwKw, dhwSimultaneity: s.dhwSimultaneity, reserve: s.boilerReserve });
  let boilerProduct = null;
  if (boilerEl) {
    boilerProduct = boilerEl.productId ? BOILERS.find((b) => b.id === boilerEl.productId) : boilerSel.boiler;
    if (boilerProduct) {
      const nomFlow = flowFromHeat(boilerProduct.powerKw * 1000, 20, 70).vM3s;
      boilerDp = boilerProduct.dpNominalKpa * 1000 * (totalFlow / nomFlow) ** 2;
    }
  }
  res.boiler = { ...boilerSel, element: boilerEl?.id ?? null, product: boilerProduct, dp: boilerDp, manual: !!boilerEl?.productId };

  // ---------- circuits ----------
  const w = water((ts + tr) / 2);
  for (const c of consumers) {
    if (!c.connected) {
      res.circuits.push({ elementId: c.elementId, kind: c.kind, connected: false, Q: c.Q });
      continue;
    }
    const vM3h = c.flow.vM3s * 3600;
    let dpUnit = 0;
    let parts = {};
    if (c.kind === 'radiator') {
      const rr = res.radiators[c.elementId];
      const vConn = c.flow.vM3s / ((Math.PI * RAD_CONN_ID * RAD_CONN_ID) / 4);
      const dpBody = (rr.product?.zeta ?? 2.5) * (w.rho * vConn * vConn) / 2;
      const dpTrv = kvDrop(vM3h, VALVES.trv.kv);
      const lsOpen = VALVES.lockshield.presets[VALVES.lockshield.presets.length - 1].kv;
      const dpLs = kvDrop(vM3h, lsOpen);
      dpUnit = dpBody + dpTrv + dpLs;
      parts = { dpBody, dpTrv, dpLsOpen: dpLs };
    } else {
      dpUnit = c.detail.maxLoopDp + kvDrop(vM3h, COLLECTOR_PORT_KV);
      parts = { dpLoops: c.detail.maxLoopDp };
    }
    const dpS = c.supplyPath.reduce((a, e) => a + (edgeRes.get(e.id)?.dp ?? 0), 0);
    const dpR = c.returnPath.reduce((a, e) => a + (edgeRes.get(e.id)?.dp ?? 0), 0);
    const lenS = c.supplyPath.reduce((a, e) => a + (e.length ?? 0), 0);
    const lenR = c.returnPath.reduce((a, e) => a + (e.length ?? 0), 0);
    res.circuits.push({
      elementId: c.elementId,
      kind: c.kind,
      connected: true,
      Q: c.Q,
      flowLh: c.flow.vLh,
      vM3h,
      dpSupply: dpS,
      dpReturn: dpR,
      dpUnit,
      dpBoiler: boilerDp,
      parts,
      dpTotal: dpS + dpR + dpUnit + boilerDp,
      length: lenS + lenR,
      path: [...c.supplyPath.map((e) => e.elementId), c.elementId, ...c.returnPath.map((e) => e.elementId)],
    });
  }

  // ---------- 8. balancing ----------
  const conn = res.circuits.filter((c) => c.connected);
  const crit = conn.reduce((a, c) => (c.dpTotal > (a?.dpTotal ?? -1) ? c : a), null);
  res.critical = crit ? { elementId: crit.elementId, dp: crit.dpTotal, length: crit.length } : null;
  const presets = VALVES.lockshield.presets;
  for (const c of conn) {
    if (!crit) break;
    if (c.kind !== 'radiator') {
      c.balance = { setting: 'flow-meter', target: `${(c.flowLh / 60).toFixed(2)} l/min`, imbalancePct: 0 };
      continue;
    }
    const withoutLs = c.dpTotal - c.parts.dpLsOpen;
    const need = crit.dpTotal - withoutLs; // Pa the lockshield must absorb
    const kvReq = kvRequired(c.vM3h, need);
    let best = presets[presets.length - 1];
    let bestErr = Infinity;
    for (const p of presets) {
      const tot = withoutLs + kvDrop(c.vM3h, p.kv);
      const err = Math.abs(tot - crit.dpTotal);
      if (err < bestErr) {
        bestErr = err;
        best = p;
      }
    }
    const after = withoutLs + kvDrop(c.vM3h, best.kv);
    const actualFlowFactorBefore = Math.sqrt(crit.dpTotal / c.dpTotal);
    const actualFlowFactorAfter = Math.sqrt(crit.dpTotal / after);
    c.balance = {
      needPa: need,
      kvRequired: kvReq,
      setting: best.setting,
      kv: best.kv,
      dpAfter: after,
      imbalancePct: ((after - crit.dpTotal) / crit.dpTotal) * 100,
      flowBeforePct: (actualFlowFactorBefore - 1) * 100,
      flowAfterPct: (actualFlowFactorAfter - 1) * 100,
      authority: (c.parts.dpTrv) / (crit.dpTotal || 1),
    };
  }

  // ---------- 9. pump ----------
  const headPa = (crit?.dpTotal ?? 0) * (s.pumpHeadMargin ?? 1.1);
  const qM3h = totalFlow * 3600;
  const headM = paToM(headPa, w.rho);
  const pumpEl = elementsOf(project, 'pump')[0] ?? null;
  const pumpSel = selectPump({ qM3h, headM });
  const builtIn = !pumpEl && !!boilerProduct?.builtInPump;
  // a boiler's built-in circulator is fixed hardware (modelled as the 25/60 curve), not a free choice
  const pumpProduct = pumpEl?.productId
    ? PUMPS.find((p) => p.id === pumpEl.productId)
    : builtIn
      ? PUMPS.find((p) => p.id === 'PMP-25-60')
      : pumpSel.pump;
  res.pump = { ...pumpSel, element: pumpEl?.id ?? null, product: pumpProduct, builtIn, q: qM3h, h: headM, headPa, totalQ, manual: !!pumpEl?.productId };
  if (pumpProduct) {
    const a = qM3h > 0 ? headM / (qM3h * qM3h) : 0;
    const qOp = Math.sqrt(pumpProduct.h0 / (a + pumpProduct.k));
    res.pump.operatingPoint = { q: qOp, h: a * qOp * qOp };
    res.pump.adequate = pumpProduct.h0 - pumpProduct.k * qM3h * qM3h >= headM;
  }

  // ---------- 10. expansion ----------
  let systemL = 0;
  for (const p of Object.values(res.pipes)) systemL += p.waterL;
  for (const r of Object.values(res.radiators)) systemL += r.product?.waterL ?? 0;
  for (const u of Object.values(res.ufh)) systemL += ((Math.PI * 0.012 * 0.012) / 4) * u.totalLength * 1000;
  for (const col of elementsOf(project, 'collector')) systemL += COLLECTORS.find((c) => c.outlets >= (col.outlets ?? 4))?.waterL ?? 1;
  if (boilerProduct) systemL += boilerProduct.waterL;
  res.expansion = sizeExpansion({ systemL: Math.max(systemL, 1), tMax: ts, staticM: s.staticHeightM, psv: s.safetyValveBar });

  // ---------- totals ----------
  res.totals = {
    heatLoss: heatedLoad,
    transmission: rooms.reduce((a, r) => a + res.rooms[r.id].transmission, 0),
    ventilation: rooms.reduce((a, r) => a + res.rooms[r.id].airApplied, 0),
    area: rooms.reduce((a, r) => a + res.rooms[r.id].inputs.area, 0),
    radiatorOutput: Object.values(res.radiators).reduce((a, r) => a + r.output, 0),
    ufhOutput: Object.values(res.ufh).reduce((a, u) => a + u.Qout, 0),
    flowLh: totalFlow * 3.6e6,
    connectedQ: totalQ,
    systemL,
    pipeLength: Object.values(res.pipes).reduce((a, p) => a + p.length, 0),
  };

  // ---------- 11. clashes / penetrations, BOM / cost ----------
  res.clashes = clashDetection(project, res);
  res.bom = buildBom(project, res, net);
  res.cost = costEstimate(project, res.bom);

  // ---------- 12. validation ----------
  res.integrity = integrityCheck(project);
  res.validation = validate(project, res, net);

  res.stats.ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  res.stats.elements = Object.keys(project.elements).length;
  res.net = { nodes: net.nodes.size, edges: net.edges.length, source: net.source?.elementId ?? null, consumers: net.consumers.length };
  res._network = net; // not serialised
  return res;
}

/** Serialisable snapshot of the results (for the .zph file / reports / worker transfer). */
export function serializableResults(res) {
  const { _network, ...rest } = res;
  void _network;
  return JSON.parse(JSON.stringify(rest));
}
