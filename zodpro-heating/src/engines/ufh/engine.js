// UFH Auto Routing Engine — pipeline (spec §11):
//   zone → boundary → obstacles → clearance → usable area → decomposition → routing → 60 m check
//   → coverage → connectivity → validation → (auto repair) → preview → apply
// Pure and deterministic; runs in a Web Worker (workers/ufh.worker.js) or directly (tests, fallback).

import * as G from './geom.js';
import { layoutZone, usableArea } from './layout.js';

const polygonCentroid = (pts) => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
import { validateLayout, UFH_RULES } from './validate.js';
import { coverageMap } from './coverage.js';
import { pipeType, DEFAULT_PIPE } from './pipes.js';

export const UFH_ENGINE_VERSION = 'ufh-engine/1.0';

/**
 * @param job {
 *   zone: ring, obstacles: [{polygon, clearance?, kind?}], avoid: [polyline] (existing pipes),
 *   collector: { id, anchor, ports: [{circuitId, index, supply, ret}] }  (free circuits, in order)
 *   spacing, wallClearance, obstacleClearance, pipeType, strategy, maxLoop, coverageMin, maxHole,
 *   loops (optional fixed count), dropLength, names (optional loop names)
 * }
 * @param onProgress (step, fraction)
 */
export function runUfhEngine(job, onProgress = () => {}) {
  const t0 = Date.now();
  const pipe = pipeType(job.pipeType ?? DEFAULT_PIPE);
  const s = job.spacing ?? 0.15;
  // design bend radius: the pipe's cold-bending radius less the tolerance allowed with a bending
  // spring / guide (validation uses the same value — one rule everywhere)
  const bendTol = job.bendTolerance ?? UFH_RULES.bendTol;
  const rminEff = pipe.minBend * (1 - bendTol); // validation limit
  const rminDesign = pipe.minBend * (1 - bendTol / 2); // the router aims higher (margin for real geometry)
  const base = {
    zone: job.zone,
    obstacles: job.obstacles ?? [],
    avoid: job.avoid ?? [],
    keepOut: job.keepOut ?? [],
    ports: job.collector.ports,
    anchor: job.collector.anchor,
    s,
    rmin: rminDesign,
    rminCheck: rminEff,
    maxLoop: Math.min(60, job.maxLoop ?? 60),
    wallClearance: job.wallClearance ?? 0.1,
    obstacleClearance: job.obstacleClearance ?? 0.1,
    strategy: job.strategy ?? 'adaptive_spiral',
    dropLength: job.dropLength ?? 0.8,
    loops: job.loops ?? null,
  };
  onProgress('boundary', 0.05);
  const Z = G.sanitize(job.zone);
  if (!Z.length) return fail('UFH-ZONE', 'Zona poligoni noto‘g‘ri (yopiq emas / o‘zini kesadi)');
  onProgress('usable_area', 0.1);
  // capacity first (spec §16–18): a zone that needs more loops than the manifold has free outlets
  // is not routed into over-long loops — the user is told how many are needed (split / 2nd manifold)
  {
    const { U } = usableArea({ ...base, s });
    const a = G.area(U);
    const c = polygonCentroid(job.zone);
    const lead = Math.hypot(c.x - base.anchor.x, c.y - base.anchor.y) * 0.6;
    const need = Math.ceil((a / s + 2 * lead + base.dropLength) / (base.maxLoop * 0.92));
    if (!base.loops && need > base.ports.length) {
      const r = fail('UFH-CIRC', `Zona uchun ≈ ${need} ta kontur kerak (${(a / s).toFixed(0)} m quvur), kollektorda bo‘sh chiqish ${base.ports.length} ta — zonani ikkinchi kollektorga bo‘ling`);
      r.needCircuits = need;
      r.freeCircuits = base.ports.length;
      r.usableArea = a;
      return r;
    }
  }

  // candidate plans: the requested strategy first, then the repair alternatives (entry edge, one
  // loop more, the other strategy) — the first valid one wins, else the one with fewest errors
  const alts = job.frameOnly != null ? [{ ...base, frameIndex: job.frameOnly }] : candidates(base, job.repair ? 'full' : 'basic');
  let best = null;
  const tried = [];
  const splitMemo = new Map();
  alts.forEach((inp, k) => {
    if (best?.v.ok) return; // the first valid plan in the order above wins
    onProgress(k === 0 ? 'routing' : 'auto_repair', 0.15 + (0.7 * k) / alts.length);
    const lay = layoutSplit(inp, (l, q) => badness(finish(l, q, job, pipe)), splitMemo) ?? layoutZone(inp);
    const res = finish(lay, inp, job, pipe);
    const score = badness(res);
    tried.push({ strategy: inp.strategy, frameIndex: inp.frameIndex ?? 0, loops: res.loops.length, errors: res.v.errors.length, coverage: res.v.coverage?.ratio ?? 0 });
    if (!best || (res.v.ok && !best.v.ok) || (res.v.ok === best.v.ok && score < best.score)) best = { ...res, score, inp };
  });
  onProgress('coverage_map', 0.92);
  const map = best.lay.U?.length ? coverageMap({ Z, U: best.lay.U, obstacles: best.lay.obstacles ?? [], band: best.v.coverage?.band ?? [] }) : null;
  onProgress('done', 1);
  const cov = best.v.coverage;
  return {
    version: UFH_ENGINE_VERSION,
    ok: best.v.ok && best.loops.length > 0,
    loops: best.loops,
    issues: [...(best.lay.errors ?? []).map((e) => ({ level: 'error', code: e.code?.startsWith('UFH') ? e.code : 'UFH-GEOM', msg: e.msg ?? e.code, at: e.at })), ...best.v.issues],
    coverage: cov ? { ratio: cov.ratio, area: cov.area, coveredArea: cov.coveredArea, largestHole: cov.largestHole, holes: cov.holes.slice(0, 20).map((h) => ({ area: h.area, at: h.at })), zoneArea: cov.zoneArea, obstacleArea: cov.obstacleArea } : null,
    map,
    usable: best.lay.U,
    strategy: best.inp.strategy,
    frameIndex: best.inp.frameIndex ?? 0,
    repaired: best.inp !== alts[0],
    tried,
    ms: Date.now() - t0,
    params: { spacing: s, wallClearance: base.wallClearance, obstacleClearance: base.obstacleClearance, pipeType: pipe.id, maxLoop: base.maxLoop, minBend: pipe.minBend, minBendAllowed: rminEff },
  };

  function fail(code, msg) {
    return { version: UFH_ENGINE_VERSION, ok: false, loops: [], issues: [{ level: 'error', code, msg }], coverage: null, map: null, tried: [], ms: Date.now() - t0 };
  }
}

/**
 * Manifold standing inside the zone (on an inner wall, outlets into one room, the zone going on
 * behind it): the zone is cut along the outlet row into the part in front of the outlets and the
 * part behind them. Each part has the manifold on its edge — the normal layout — and gets its share
 * of the outlets (consecutive ones, by the loops each part needs); the connections of the rear loops
 * are kept clear in the front part. Returns null when the manifold stands on the zone edge.
 */
export function manifoldCut(inp) {
  const P = inp.ports;
  if (P.length < 2) return null;
  const a = P[0].supply;
  const b = P[P.length - 1].supply;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-6) return null;
  const e = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  let f = { x: P[0].ret.x - P[0].supply.x, y: P[0].ret.y - P[0].supply.y };
  const fd = f.x * e.x + f.y * e.y;
  f = G.norm({ x: f.x - fd * e.x, y: f.y - fd * e.y });
  if (!Number.isFinite(f.x)) return null;
  const B = 1e3;
  // pipes run on the edge of the usable area: each half stops s/2 short of the cut line
  const h = (inp.s ?? 0.15) / 2;
  const half = (k) => {
    const o = { x: a.x + k * f.x * h, y: a.y + k * f.y * h };
    return [
      { x: o.x - e.x * B, y: o.y - e.y * B },
      { x: o.x + e.x * B, y: o.y + e.y * B },
      { x: o.x + e.x * B + k * f.x * B, y: o.y + e.y * B + k * f.y * B },
      { x: o.x - e.x * B + k * f.x * B, y: o.y - e.y * B + k * f.y * B },
    ];
  };
  const { U } = usableArea({ ...inp });
  const front = half(1);
  const back = half(-1);
  const Af = G.area(G.intersection(U, [{ outer: G.ccw(front), holes: [] }]));
  const Ab = G.area(G.intersection(U, [{ outer: G.ccw(back), holes: [] }]));
  // behind a wall-mounted manifold there is (almost) nothing — normal layout
  if (Math.min(Af, Ab) < Math.max(1.5, 0.08 * (Af + Ab))) return null;
  return { front, back, Af, Ab, e };
}

function layoutSplit(inp, score, memo) {
  const cut = manifoldCut(inp);
  if (!cut) return null;
  const key = `${inp.strategy}|${inp.loops ?? ''}|${inp.loopsPlus ?? 0}`;
  if (memo?.has(key)) return memo.get(key);
  const P = inp.ports;
  const s = inp.s;
  const cap = (inp.maxLoop ?? 60) * 0.92;
  const need = (A) => Math.max(1, Math.ceil((A / s + 2 + (inp.dropLength ?? 0.8)) / cap));
  let nb;
  let nf;
  if (inp.loops) {
    nb = Math.max(1, Math.min(inp.loops - 1, Math.round((inp.loops * cut.Ab) / (cut.Ab + cut.Af))));
    nf = inp.loops - nb;
  } else {
    nb = need(cut.Ab);
    nf = need(cut.Af);
  }
  // spare outlets shared by area (each part may take one loop more than estimated)
  const spare = Math.max(0, P.length - nb - nf);
  const kb = Math.max(1, Math.min(P.length - 1, nb + Math.round((spare * cut.Ab) / (cut.Ab + cut.Af))));
  const ord = [...P].sort((p, q) => (p.supply.x - q.supply.x) * cut.e.x + (p.supply.y - q.supply.y) * cut.e.y);
  // each part on its own best entry edge (the cut edge, or a side wall with the manifold at its end)
  const bestOf = (base) => {
    let b = null;
    for (const frameIndex of [0, 1, 2]) {
      const q = { ...base, frameIndex };
      const lay = layoutZone(q);
      const sc = score(lay, q);
      if (!b || sc < b.sc) b = { lay, sc };
    }
    return b.lay;
  };
  // each part's manifold point is the middle of its own outlets (its leads start there)
  const mid = (ps) => ({ x: ps.reduce((a, q) => a + (q.supply.x + q.ret.x) / 2, 0) / ps.length, y: ps.reduce((a, q) => a + (q.supply.y + q.ret.y) / 2, 0) / ps.length });
  const layB = bestOf({ ...inp, ports: ord.slice(0, kb), anchor: mid(ord.slice(0, kb)), clip: cut.back, loops: inp.loops ? nb : null });
  // the rear loops' connections at the manifold are kept clear in the front part
  const conn = (layB.loops ?? []).flatMap((l) => [l.path.slice(0, 2), l.path.slice(-2)]);
  const layF = bestOf({ ...inp, ports: ord.slice(kb), anchor: mid(ord.slice(kb)), clip: cut.front, avoid: [...(inp.avoid ?? []), ...conn], loops: inp.loops ? nf : null });
  const out = {
    loops: [...(layB.loops ?? []), ...(layF.loops ?? [])],
    errors: [...(layB.errors ?? []), ...(layF.errors ?? [])],
    U: G.union([...(layB.U ?? []), ...(layF.U ?? [])]),
    Z: layB.Z ?? layF.Z,
    obstacles: layB.obstacles ?? layF.obstacles,
    frame: layB.frame,
    split: true,
  };
  memo?.set(key, out);
  return out;
}

const WEIGHT = { 'UFH-LEN': 1000, 'UFH-TOPO': 1000, 'UFH-CROSS': 800, UFH_STRIP_EMPTY: 500, 'UFH-GEOM': 400, 'UFH-OBST': 300, 'UFH-WALL': 300, 'UFH-ZONE': 300, 'UFH-COV': 200, 'UFH-SPACE': 40, 'UFH-BEND': 20 };

/** Lower is better: weighted errors, then uncovered share, then loop count. */
function badness(res) {
  let b = 0;
  for (const e of res.v.errors) b += WEIGHT[e.code] ?? 100;
  for (const e of res.lay.errors ?? []) b += WEIGHT[e.code] ?? 400;
  b += (1 - (res.v.coverage?.ratio ?? 0)) * 1000;
  b += res.loops.length * 2;
  if (!res.loops.length) b += 1e6;
  return b;
}

function candidates(base, mode) {
  const out = [base];
  const other = base.strategy.includes('serpentine') ? 'adaptive_spiral' : 'adaptive_serpentine';
  out.push({ ...base, frameIndex: 1 });
  if (mode === 'full') {
    out.push({ ...base, frameIndex: 2 });
    out.push({ ...base, loops: null, loopsPlus: 1 });
    out.push({ ...base, strategy: other });
    out.push({ ...base, strategy: other, frameIndex: 1 });
  }
  return out;
}

function finish(lay, inp, job, pipe) {
  const names = job.names ?? [];
  const loops = (lay.loops ?? []).map((l, i) => ({
    name: names[i] ?? `UFH-${String(i + 1).padStart(2, '0')}`,
    circuitId: l.circuitId,
    portIndex: l.portIndex,
    path: l.path.map((p) => ({ x: +p.x.toFixed(5), y: +p.y.toFixed(5) })),
    length: l.length,
    supplyLength: l.supplyLen,
    returnLength: l.returnLen,
    heatingLength: Math.max(0, l.length - l.supplyLen - l.returnLen - l.drop),
    drop: l.drop,
    fan: l.lead.slice(0, 2),
    spacing: l.treeS ?? inp.s,
    pipeType: pipe.id,
  }));
  const connectors = Object.fromEntries(inp.ports.map((p) => [p.circuitId, { supply: p.supply, ret: p.ret }]));
  const obstaclesTight = (inp.obstacles ?? []).length ? G.union(inp.obstacles.map((o) => G.offset(G.sanitize(o.polygon), (o.clearance ?? inp.obstacleClearance) - 0.003, 'round')).flat()) : [];
  const v = validateLayout(loops, {
    Z: lay.Z,
    U: lay.U,
    obstacles: lay.obstacles ?? [],
    obstaclesTight,
    s: inp.s,
    rmin: inp.rminCheck ?? inp.rmin,
    // keyholes (U-turns widened to the bend radius) may come this much closer to walls / pipes
    rules: { bendTol: 0, spacingTol: Math.max(UFH_RULES.spacingTol, (inp.rminCheck ?? inp.rmin) + 0.004 - inp.s / 2 + 0.004), wallTol: Math.max(UFH_RULES.wallTol, (inp.rminCheck ?? inp.rmin) + 0.004 - inp.s / 2 + 0.003) },
    maxLoop: inp.maxLoop,
    wallClearance: inp.wallClearance,
    coverageMin: job.coverageMin ?? UFH_RULES.coverageMin,
    maxHole: job.maxHole ?? UFH_RULES.maxHole,
    connectors,
  });
  v.perLoop.forEach((pl, i) => {
    loops[i].status = pl.errors ? 'invalid' : 'valid';
    loops[i].errors = pl.errors;
    loops[i].warnings = pl.warnings;
  });
  return { lay, loops, v, maxLen: Math.max(0, ...loops.map((l) => l.length)) };
}
