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
import { designUfh, UFH_VERSION } from './ufh.js';
import { buildNetwork, NETWORK_VERSION } from './network.js';
import { flowFromHeat, pipeSegment, kvDrop, kvRequired, paToM, HYDRAULICS_VERSION } from './hydraulics.js';
import { sizePipe, selectPump, selectBoiler, sizeExpansion, EQUIPMENT_VERSION } from './equipment.js';
import { buildBom, costEstimate, BOM_VERSION } from './bom.js';
import { validate, clashDetection, VALIDATION_VERSION } from './validation.js';
import { RADIATORS, PIPE_MATERIALS, VALVES, BOILERS, PUMPS, COLLECTORS } from '../data/products.js';
import { elementsOf, roomTemp, isHeated, integrityCheck } from '../core/model.js';
import { pointInPolygon } from '../core/util.js';
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
    engines: { HEATLOSS_VERSION, RADIATOR_VERSION, UFH_VERSION, NETWORK_VERSION, HYDRAULICS_VERSION, EQUIPMENT_VERSION, BOM_VERSION, VALIDATION_VERSION },
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
  for (const r of rooms) {
    if (!['ufh', 'mixed'].includes(r.heating) || !isHeated(r)) continue;
    const hl = res.rooms[r.id];
    const Q = hl.required;
    const bath = r.roomType === 'bathroom' || r.roomType === 'wc';
    const d = designUfh({
      Q,
      area: hl.inputs.area,
      ti: roomTemp(r),
      ts: s.ufhRegime.ts,
      tr: s.ufhRegime.tr,
      spacing: r.ufh?.spacing ?? null,
      leadLength: r.ufh?.leadLength ?? 4,
      maxLoop: s.ufhMaxLoopM,
      maxSurface: bath ? s.ufhMaxSurface.bathroom : s.ufhMaxSurface.occupied,
      maxLoopKpa: s.ufhMaxLoopKpa,
      pipe: r.ufh?.pipe ?? { material: 'PEX', dn: '16' },
      pattern: r.ufh?.pattern ?? 'spiral',
    });
    d.roomId = r.id;
    d.collectorId = r.ufh?.collectorId ?? null;
    d.perimeter = hl.inputs.area > 0 ? r.points.reduce((a, p, i) => a + Math.hypot(r.points[(i + 1) % r.points.length].x - p.x, r.points[(i + 1) % r.points.length].y - p.y), 0) : 0;
    d.area = hl.inputs.area;
    res.ufh[r.id] = d;
    if (d.collectorId) {
      if (!ufhByCollector.has(d.collectorId)) ufhByCollector.set(d.collectorId, []);
      ufhByCollector.get(d.collectorId).push(d);
    }
  }

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
    const required = hl ? Math.max(0, hl.required - (res.ufh[roomId]?.Qout ?? 0)) : 0;
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
        if (win) {
          maxHeight = Math.max(0.3, win.sill - (rad.mountHeight ?? 0.1) - 0.05);
          preferLength = win.width * 0.75;
        }
        sel = selectRadiator(Math.max(req, 1), {
          ts,
          tr,
          ti,
          kind: rad.prefKind ?? 'panel',
          type: rad.prefType ?? (rad.prefKind === 'sectional' ? null : 22),
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
  for (const r of rooms) {
    const hl = res.rooms[r.id];
    const radiatorOutput = (byRoom.get(r.id) ?? []).reduce((a, x) => a + res.radiators[x.id].output, 0);
    const ufhOutput = res.ufh[r.id]?.Qout ?? 0;
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
