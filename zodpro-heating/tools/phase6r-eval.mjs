// Phase 6 reopen (lead-aware spiral / terminal closure): the same measurement before and after the
// change — per loop coverage (own region), largest gap, terminal closure location, min bend radius,
// heating length, loop counts, the file hashes of the Phase 6 algorithm and a geometry hash.
//   node tools/phase6r-eval.mjs <out.json>
import fs from 'fs';
import crypto from 'crypto';
import * as G from '../src/engines/ufh/geom.js';
import { spiralRegions } from '../src/engines/ufh/decompose.js';
import { planLoops } from '../src/engines/ufh/loopplanner.js';
import { referenceCheck } from '../src/engines/ufh/phase6reference.js';
import { runTransfers, phase6GeometryHash, heatingClash, connectedReport } from './ufh-transfer-debug.mjs';
import { planLeadAware } from '../src/engines/ufh/leadaware.js';
import { planTransfers, heatingPitchOf } from '../src/engines/ufh/corridor.js';
import { doorChains } from '../src/engines/ufh/roomgraph.js';

export const PHASE6_FILES = ['geom.js', 'spiralgen.js', 'decompose.js', 'obstaclespiral.js', 'closure.js', 'rawcheck.js', 'criteria.js', 'loopplanner.js', 'loopproof.js', 'partitionsearch.js'];
const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const R = (x0, y0, x1, y1) => [{ outer: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [] }];

// the reference cases (usable areas, wall clearance already off): a leftover width on one axis
export const CASES = {
  'right-residual 3.15×2.33 s0.2': { U: R(0, 0, 3.15, 2.33), s: 0.2, toward: { x: -0.3, y: 0.3 } },
  'right-residual 2.95×2.33 s0.2': { U: R(0, 0, 2.95, 2.33), s: 0.2, toward: { x: -0.3, y: 0.3 } },
  'right-residual 3.37×2.0 s0.2': { U: R(0, 0, 3.37, 2.0), s: 0.2, toward: { x: -0.3, y: 0.3 } },
  'exact 3.2×2.4 s0.2': { U: R(0, 0, 3.2, 2.4), s: 0.2, toward: { x: -0.3, y: 0.3 } },
  'residual 2.62×1.9 s0.15': { U: R(0, 0, 2.62, 1.9), s: 0.15, toward: { x: -0.3, y: 0.3 } },
};

export function planCase(c) {
  const res = spiralRegions(c.U, c.s, { toward: c.toward });
  return planLoops(res, c.U, c.s, { leadTo: (p) => man(c.toward, p), manifold: null, toward: c.toward });
}

export function loopMetrics(plan, U, s) {
  return plan.loops.map((l) => {
    const region = G.intersection([l.shape], U);
    const A = G.area(region);
    const band = G.bufferPolylines([G.simplifyPath(l.spiral.heating, 0.002)], s / 2 + 0.003, 'round', 'round', 0.001);
    const cov = A > 0 ? G.area(G.intersection(region, band)) / A : 0;
    const gap = G.opening(G.difference(region, band), s / 2).reduce((a, q) => Math.max(a, G.area([q])), 0);
    const ref = referenceCheck(l, s);
    return {
      loop: l.loopId,
      heating_m: l.heatingLength,
      total_m: l.totalLength,
      coverage: cov,
      largestGap_m2: gap,
      minRadius_m: G.minBendRadius(l.spiral.path).radius,
      residualSpacing: l.spiral.residualSpacing ?? null,
      closure: l.spiral.closureSide ?? (l.spiral.residual ? 'centre' : 'none'),
      terminal: ref.terminal ? { u: ref.terminal.centre.u, v: ref.terminal.centre.v, toSide_m: ref.terminal.toSide_m } : null,
      reference: ref.status,
      ends: { supply: l.spiral.supply, ret: l.spiral.ret },
    };
  });
}

export function fileHashes() {
  return Object.fromEntries(PHASE6_FILES.map((f) => [f, crypto.createHash('sha256').update(fs.readFileSync(new URL(`../src/engines/ufh/${f}`, import.meta.url))).digest('hex')]));
}

export function evaluate({ apartment = true } = {}) {
  const out = { files: fileHashes(), cases: {}, apartment: null };
  for (const [name, c] of Object.entries(CASES)) {
    const p = planCase(c);
    out.cases[name] = { loops: p.loops.length, hash: phase6GeometryHash({ X: p }), metrics: loopMetrics(p, c.U, c.s) };
  }
  if (apartment) {
    const fx = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/apartment-7b.json', import.meta.url), 'utf8'));
    const r = runTransfers(fx, { leadSpacing: 0.05 });
    out.apartment = { counts: r.counts, hash: phase6GeometryHash(r.plans), rooms: {} };
    for (const [rid, p] of Object.entries(r.plans)) {
      const s = p.loops[0]?.nominalSpacing ?? 0.2;
      out.apartment.rooms[rid] = { loops: p.loops.length, metrics: loopMetrics(p, r.transfers.rooms[rid].Uprime, s) };
    }
  }
  return out;
}

/** The measured transit length from a port to where a lead enters room rid (longest; 0 in the manifold room). */
function toEntryOf(fx, tr, rid) {
  const room = [{ outer: G.ccw(fx.rooms.find((r) => r.id === rid).poly), holes: [] }];
  let m = 0;
  for (const l of tr.leads.filter((x) => x.room === rid && x.path.length >= 2)) {
    if (G.pointInRegion(l.path[0], room)) continue;
    let acc = 0;
    for (let k = 1; k < l.path.length; k++) {
      const a = l.path[k - 1];
      const b = l.path[k];
      if (G.pointInRegion(b, room) && G.distToRegionBoundary(b, room) > 1e-9) {
        let lo = 0;
        let hi = 1;
        for (let it = 0; it < 40; it++) {
          const mid = (lo + hi) / 2;
          if (G.pointInRegion({ x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid }, room)) hi = mid;
          else lo = mid;
        }
        acc += Math.hypot(b.x - a.x, b.y - a.y) * hi;
        break;
      }
      acc += Math.hypot(b.x - a.x, b.y - a.y);
    }
    m = Math.max(m, acc);
  }
  return m;
}

/**
 * The Phase 6 inputs of every room of the apartment for a loop count map: U′ (7B transit corridor),
 * the entry (door / manifold), the measured transfer to it, the drop, the pitch.
 */
export function roomInputs(fx, counts, leadSpacing = 0.05) {
  const base = runTransfers(fx, { leadSpacing });
  const params = base.params;
  const chains = doorChains({ rooms: fx.rooms, doors: fx.doors, collectorAt: fx.collector.at });
  const tr = planTransfers({ rooms: fx.rooms, doors: fx.doors, collector: fx.collector, loopsByRoom: counts, usable: base.U, params });
  const out = {};
  for (const rid of Object.keys(base.plans)) {
    const room = fx.rooms.find((r) => r.id === rid);
    const isC = rid === chains.collectorRoom;
    const at = isC ? fx.collector.at : fx.doors.find((d) => d.id === chains.rooms[rid].doors.at(-1)).at;
    out[rid] = { U: tr.rooms[rid].Uprime, s: heatingPitchOf(room, params), entry: { at }, budget: { toEntry_m: isC ? 0 : toEntryOf(fx, tr, rid), drop_m: fx.collector.dropPerPipe_m } };
  }
  return out;
}

/**
 * The apartment with the LEAD-AWARE Phase 6 planner: 7B's transit corridor gives U′ and the measured
 * transfer to each room's entry (inputs); Phase 6 plans every room with them; then 7B's own routing
 * (unchanged code) connects the leads to the new ends — crossings, clashes, topology, 60 m measured.
 */
export function leadAwareApartment(fx, leadSpacing = 0.05, maxIter = 4) {
  const base = runTransfers(fx, { leadSpacing });
  const params = base.params;
  const chains = doorChains({ rooms: fx.rooms, doors: fx.doors, collectorAt: fx.collector.at });
  let plans = {};
  let rooms = {};
  // the transit corridor needs the loop counts, the counts come from the plans on U′ — until stable
  let cnt = { ...base.counts };
  const countHistory = [{ ...cnt }];
  for (let it = 0; it < maxIter; it++) {
    const trT = planTransfers({ rooms: fx.rooms, doors: fx.doors, collector: fx.collector, loopsByRoom: cnt, usable: base.U, params });
    if (!trT.rooms) break;
    plans = {};
    rooms = {};
    for (const rid of Object.keys(base.plans)) {
      const room = fx.rooms.find((r) => r.id === rid);
      const s = heatingPitchOf(room, params);
      const isC = rid === chains.collectorRoom;
      const at = isC ? fx.collector.at : fx.doors.find((d) => d.id === chains.rooms[rid].doors.at(-1)).at;
      const la = planLeadAware(trT.rooms[rid].Uprime, s, { entry: { at }, leadSpacing, budget: { toEntry_m: isC ? 0 : toEntryOf(fx, trT, rid), drop_m: fx.collector.dropPerPipe_m } });
      plans[rid] = la.plan;
      rooms[rid] = la;
    }
    const next = Object.fromEntries(Object.entries(plans).map(([rid, p]) => [rid, p.loops.length]));
    countHistory.push({ ...next });
    if (Object.keys(next).every((rid) => next[rid] === cnt[rid])) break;
    cnt = next;
  }
  const counts = Object.fromEntries(Object.entries(plans).map(([rid, p]) => [rid, p.loops.length]));
  // the transit corridor for these counts, then the leads to the new ends (7B code as it is)
  const tr0 = planTransfers({ rooms: fx.rooms, doors: fx.doors, collector: fx.collector, loopsByRoom: counts, usable: base.U, params });
  const loopExits = {};
  for (const [rid, p] of Object.entries(plans)) p.loops.forEach((l) => (loopExits[`${rid}.${l.loopId}`] = { a: l.spiral.supply, b: l.spiral.ret, ha: l.spiral.path.slice(0, 3), hb: l.spiral.path.slice(-3).reverse() }));
  const trC = tr0.rooms ? planTransfers({ rooms: fx.rooms, doors: fx.doors, collector: fx.collector, loopsByRoom: counts, usable: base.U, params, loopExits }) : tr0;
  const run = { fx, params, U: base.U, transfers: trC, plans, phase6Transfers: tr0 };
  const rep = trC.rooms ? connectedReport(run) : null;
  return { countHistory, counts, rooms, plans, transfers: trC, clashes: trC.rooms ? heatingClash(plans, trC, leadSpacing) : null, report: rep, hash: phase6GeometryHash(plans) };
}

if (process.argv[1]?.endsWith('phase6r-eval.mjs') && process.argv[3] === '--lead-aware') {
  const fx = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/apartment-7b.json', import.meta.url), 'utf8'));
  const t0 = Date.now();
  const la = leadAwareApartment(fx);
  const out = { ms: Date.now() - t0, counts: la.counts, hash: la.hash, transfers: { status: la.transfers.status, reasons: la.transfers.reasons, crossings: la.transfers.crossings }, clashes: la.clashes, rooms: {}, loopRows: la.report?.loopRows };
  for (const [rid, x] of Object.entries(la.rooms)) out.rooms[rid] = { status: x.status, areas: x.areas, history: x.history, loops: x.loops.map((l) => ({ loopId: l.loopId, endpoints: l.endpoints, entryRoute_m: l.entryRoute_m, leadCompatible: l.leadCompatible, leadClash_m: l.leadClash_m })), metrics: loopMetrics(x.plan, x.plan.check ? la.transfers.rooms?.[rid]?.Uprime ?? [] : [], x.plan.loops[0]?.nominalSpacing ?? 0.2) };
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log('ms', out.ms, 'countHistory', JSON.stringify(la.countHistory), 'counts', JSON.stringify(out.counts), 'transfers', out.transfers.status, 'crossings', out.transfers.crossings, 'clashes', (out.clashes ?? []).length, 'topology', la.report?.topology?.status);
  for (const [rid, x] of Object.entries(out.rooms)) console.log(rid, x.status, 'usable', x.areas.usable_m2.toFixed(2), 'reserved', x.areas.reserved_m2.toFixed(2), 'cov', ((x.areas.heating_m2 / x.areas.usable_m2) * 100).toFixed(1), 'gap', x.areas.largestGap_m2.toFixed(3), 'iters', x.history.length, x.loops.map((l) => `${l.loopId}${l.leadCompatible ? '' : '!'}`).join(' '));
  for (const w of out.loopRows ?? []) console.log(w.loop, 'total', w.total_m.toFixed(2), 'cov', (w.coverage * 100).toFixed(1), 'x', w.crossings, w.topology, w.reference.status, w.statuses.join(','));
} else if (process.argv[1]?.endsWith('phase6r-eval.mjs')) {
  const t0 = Date.now();
  const out = evaluate();
  out.ms = Date.now() - t0;
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  for (const [n, c] of Object.entries(out.cases)) console.log(n, c.loops, c.metrics.map((m) => `${m.loop} cov ${(m.coverage * 100).toFixed(1)} gap ${m.largestGap_m2.toFixed(3)} R ${(m.minRadius_m * 1000).toFixed(0)} L ${m.heating_m.toFixed(2)} ${m.closure} ${m.reference} ${m.terminal ? m.terminal.u.toFixed(2) + ',' + m.terminal.v.toFixed(2) : ''}`).join(' | '));
  for (const [rid, x] of Object.entries(out.apartment.rooms)) console.log(rid, x.loops, x.metrics.map((m) => `${m.loop} cov ${(m.coverage * 100).toFixed(1)} gap ${m.largestGap_m2.toFixed(3)} R ${(m.minRadius_m * 1000).toFixed(0)} L ${m.heating_m.toFixed(2)} ${m.reference}`).join(' | '));
  console.log('apartment hash', out.apartment.hash, 'ms', out.ms);
}
