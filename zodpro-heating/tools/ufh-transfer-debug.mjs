// Phase 7B debug: the transfer leads, corridors and heating loops of a zone, rendered straight
// from the engine's geometry (roomgraph + corridor + the frozen Phase 6 planner). Nothing is drawn
// by hand: every line is a polyline the engine returned.
//   node tools/ufh-transfer-debug.mjs <fixture.json> <leadSpacing m> <out.svg> [detail.svg]
import fs from 'fs';
import crypto from 'crypto';
import * as G from '../src/engines/ufh/geom.js';
import { doorChains } from '../src/engines/ufh/roomgraph.js';
import { planTransfers, heatingPitchOf } from '../src/engines/ufh/corridor.js';
import { portsOf } from '../src/engines/ufh/collector.js';
import { spiralRegions } from '../src/engines/ufh/decompose.js';
import { planLoops } from '../src/engines/ufh/loopplanner.js';
import { checkRawSet } from '../src/engines/ufh/rawcheck.js';
import { loopTopology } from '../src/engines/ufh/looptopology.js';
import { loopReport } from '../src/engines/ufh/loopreport.js';
import { ENGINEERING_FINAL_COVERAGE, ENGINEERING_COVERAGE_TOLERANCE } from '../src/engines/ufh/criteria.js';

const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** U of every room: inner faces − wallClearance − obstacles ⊕ obstacleClearance. */
export function usableOf(fx) {
  const out = {};
  for (const r of fx.rooms) {
    let U = G.offset([{ outer: G.ccw(r.poly), holes: [] }], -fx.wallClearance, 'miter');
    const obs = (r.obstacles ?? []).map((o) => ({ outer: G.ccw(o), holes: [] }));
    if (obs.length) U = G.difference(U, G.offset(obs, fx.obstacleClearance, 'miter'));
    out[r.id] = U;
  }
  return out;
}

/**
 * The 7B pipeline: loop counts from the frozen planner on U, transfers + corridors, the rooms
 * planned again on U' until the loop counts hold (at most maxIter rounds).
 */
export function runTransfers(fx, { leadSpacing, maxIter = 3, connect = false, maxConnectIter = 8, maxRounds = 6, settleMode = 'both' }) {
  const params = { heatingPitch: fx.heatingPitch, leadWallOffset: fx.leadWallOffset, leadSpacing, pipeType: fx.pipeType, wallClearance: fx.wallClearance };
  const U = usableOf(fx);
  const chains = doorChains({ rooms: fx.rooms, doors: fx.doors, collectorAt: fx.collector.at });
  const doorAt = (id) => fx.doors.find((d) => d.id === id).at;
  const toward = (rid) => (rid === chains.collectorRoom ? fx.collector.at : doorAt(chains.rooms[rid].doors.at(-1)));
  // the lead estimate the frozen planner budgets with (its own ctx.leadTo interface): unconnected
  // runs keep the Phase 6 estimate (Manhattan from the room's entry); connected runs use the routed
  // geometry — the measured transfer from the port to the room's entry (longest of the room's
  // leads), the drop, and the way along the walls from the entry to the spiral end
  const leadExtra = {};
  const wallWay = (rid) => {
    const R = G.ccw(fx.rooms.find((r) => r.id === rid).poly);
    const cum = [0];
    for (let i = 0; i < R.length; i++) cum.push(cum[i] + Math.hypot(R[(i + 1) % R.length].x - R[i].x, R[(i + 1) % R.length].y - R[i].y));
    const T = cum[R.length];
    const sOf = (q) => {
      const c = G.closestOnRing(q, R);
      return { s: cum[c.i] + c.t * (cum[c.i + 1] - cum[c.i]), d: c.d };
    };
    const e = sOf(toward(rid));
    return (p) => {
      const q = sOf(p);
      const f = Math.abs(q.s - e.s);
      return Math.min(f, T - f) + q.d;
    };
  };
  const leadToOf = (rid) => {
    const t = toward(rid);
    if (leadExtra[rid] === undefined) return (p) => man(t, p);
    const w = wallWay(rid);
    return (p) => leadExtra[rid] + w(p);
  };
  const plan = (rid, region, towardAt = null) => {
    const room = fx.rooms.find((r) => r.id === rid);
    const s = heatingPitchOf(room, params);
    const t = towardAt ?? toward(rid);
    const res = spiralRegions(region, s, { toward: t });
    return planLoops(res, region, s, { leadTo: leadToOf(rid), manifold: null, toward: t });
  };
  // one loop's part re-spiralled alone (frozen decomposition + planner); its ends on the real walls
  const replanPart = (rid, part, P, towardAt = null) => {
    const room = fx.rooms.find((r) => r.id === rid);
    const s = heatingPitchOf(room, params);
    const t = towardAt ?? toward(rid);
    const walls = P.map((sh) => ({ outer: sh.outer, holes: [] }));
    const res = spiralRegions(part, s, { toward: t, walls });
    if (!res.regions?.length) return [];
    const pl = planLoops(res, P, s, { leadTo: leadToOf(rid), manifold: null, toward: t });
    return pl.loops.filter((l) => l.spiral?.heating);
  };
  const served = fx.rooms.map((r) => r.id).filter((rid) => chains.rooms[rid].reachable);
  let counts = Object.fromEntries(served.map((rid) => [rid, plan(rid, U[rid]).loops.length]));
  const history = [{ ...counts }];
  let tr = null;
  let plans = null;
  for (let it = 0; it < maxIter; it++) {
    tr = planTransfers({ rooms: fx.rooms, doors: fx.doors, collector: fx.collector, loopsByRoom: counts, usable: U, params });
    if (!tr.rooms) break;
    plans = Object.fromEntries(served.map((rid) => [rid, plan(rid, tr.rooms[rid].Uprime)]));
    const next = Object.fromEntries(served.map((rid) => [rid, plans[rid].loops.length]));
    history.push({ ...next });
    if (served.every((rid) => next[rid] === counts[rid])) break;
    counts = next;
  }
  // connected loops: the leads end at the spiral ends of the final plans (supply / ret of the frozen
  // planner); the corridor changes with them → replan on the new U′ until the ends stand still
  const exitsOf = (pl) => {
    const e = {};
    for (const [rid, p] of Object.entries(pl)) p.loops.forEach((l, i) => l.spiral?.path && (e[`${rid}.L${i + 1}`] = { a: l.spiral.supply, b: l.spiral.ret, ha: l.spiral.path.slice(0, 3), hb: l.spiral.path.slice(-3).reverse() }));
    return e;
  };
  const moved = (e1, e2) => {
    const ks = new Set([...Object.keys(e1), ...Object.keys(e2)]);
    let m = 0;
    for (const k of ks) {
      if (!e1[k] || !e2[k]) return Infinity;
      m = Math.max(m, Math.hypot(e1[k].a.x - e2[k].a.x, e1[k].a.y - e2[k].a.y), Math.hypot(e1[k].b.x - e2[k].b.x, e1[k].b.y - e2[k].b.y));
    }
    return m;
  };
  const convergence = [];
  let converged = !connect;
  let lastClash = [];
  if (connect && tr?.rooms && plans) {
    // the leads always end at the spiral ends of the loops in use. A loop whose heating comes
    // closer than leadSpacing to a lead is re-spiralled alone in its own region minus the lead
    // envelope (frozen spiralRegions + planLoops on that part; the room's other loops stay); the
    // envelope only grows (monotone), so the loops never jump back into a corridor.
    const pitch = (rid) => heatingPitchOf(fx.rooms.find((r) => r.id === rid), params);
    const relabel = (ls) => ls.map((l, i) => ({ ...l, loopId: `L${i + 1}` }));
    const asPlans = (lo) => Object.fromEntries(served.map((rid) => [rid, { loops: lo[rid] }]));
    const countsOf = (lo) => Object.fromEntries(served.map((rid) => [rid, lo[rid].length]));
    // settle: route to the loop ends, re-spiral the clashing loops (monotone envelope) until none
    const settle = (lo0, round, mode) => {
      let lo = lo0;
      const reservedX = {};
      let last = null;
      for (let it = 0; it < maxConnectIter; it++) {
        const trK = planTransfers({ rooms: fx.rooms, doors: fx.doors, collector: fx.collector, loopsByRoom: countsOf(lo), usable: U, params, loopExits: exitsOf(asPlans(lo)) });
        if (!trK.rooms) {
          convergence.push({ round, mode, iteration: it + 1, status: trK.status, counts: countsOf(lo) });
          return { lo, tr: trK, clash: [], ok: false };
        }
        const clash = heatingClash(asPlans(lo), trK, params.leadSpacing);
        convergence.push({ round, mode, iteration: it + 1, status: trK.status, clashes: clash.length, clashLoops: clash.map((c) => c.loop), counts: countsOf(lo) });
        last = { lo, tr: trK, clash, ok: true };
        if (!clash.length || it + 1 === maxConnectIter) return last;
        const next = {};
        for (const rid of served) {
          const bad = new Set(clash.filter((c) => c.room === rid).map((c) => c.loop));
          if (!bad.size) {
            next[rid] = lo[rid];
            continue;
          }
          reservedX[rid] = reservedX[rid] ? G.union(reservedX[rid], trK.rooms[rid].planExclusion) : trK.rooms[rid].planExclusion;
          const P = G.difference(U[rid], reservedX[rid]).filter((sh) => G.area([sh]) >= 1e-6);
          if (mode === 'room') {
            next[rid] = relabel(plan(rid, P).loops);
            continue;
          }
          const out = [];
          let lost = false;
          for (const l of lo[rid]) {
            if (!bad.has(`${rid}.${l.loopId}`)) {
              out.push(l);
              continue;
            }
            // candidates: the loop's region minus the envelope; for a rectangle also the largest
            // rectangle inside (stays one region). Fewer loops first, then area.
            const cands = [];
            const part = G.intersection([l.shape], P).filter((sh) => G.area([sh]) >= 1e-6);
            if (part.length) cands.push(replanPart(rid, part, P));
            const rect = trimmedRect(l.shape, P);
            if (rect) cands.push(replanPart(rid, [rect], P));
            const area = (ls) => ls.reduce((s, q) => s + G.area([q.shape]), 0);
            const ok = cands.filter((c) => c.length);
            ok.sort((x, y) => x.length - y.length || area(y) - area(x));
            if (ok.length) out.push(...ok[0]);
            else lost = true;
          }
          // (a loop with no spiral left in its part: the room is replanned whole instead)
          next[rid] = lost ? relabel(plan(rid, P).loops) : relabel(out);
        }
        lo = next;
        history.push(countsOf(lo));
      }
      return last;
    };
    const covOf = (st) => Object.fromEntries(served.map((rid) => [rid, coverageOn({ loops: st.lo[rid] }, st.tr.rooms[rid].Uprime, pitch(rid))]));
    const scoreOf = (st) => {
      if (!st.ok) return [9, 9, 9, 0];
      const cov = covOf(st);
      const low = served.filter((rid) => cov[rid] < ENGINEERING_FINAL_COVERAGE - ENGINEERING_COVERAGE_TOLERANCE);
      const short = served.reduce((a, rid) => a + Math.max(0, ENGINEERING_FINAL_COVERAGE - cov[rid]), 0);
      return [st.clash.length ? 1 : 0, st.tr.status === 'TRANSFERS_OK' ? 0 : 1, low.length, short];
    };
    const better = (a, b) => {
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
      return false;
    };
    // rounds: a room still under the coverage limit is replanned whole on U minus the envelope of
    // its current corridor (its own leads included), then settled again; the best state is kept
    // the measured transfer to every room's entry (+ drop) → the rooms replanned with it
    for (const rid of served) leadExtra[rid] = transferToEntry(fx, tr, rid) + fx.collector.dropPerPipe_m;
    plans = Object.fromEntries(served.map((rid) => [rid, plan(rid, tr.rooms[rid].Uprime)]));
    history.push(Object.fromEntries(served.map((rid) => [rid, plans[rid].loops.length])));
    let lo = Object.fromEntries(served.map((rid) => [rid, relabel(plans[rid].loops)]));
    let best = null;
    let bestScore = null;
    for (let round = 1; round <= maxRounds; round++) {
      // both ways of settling a clash (the loop's own part re-spiralled / the room replanned)
      const tries = (settleMode === 'both' ? ['loop', 'room'] : [settleMode]).map((m) => settle(lo, round, m));
      let st = tries[0];
      for (const x of tries.slice(1)) if (better(scoreOf(x), scoreOf(st))) st = x;
      const sc = scoreOf(st);
      if (!best || better(sc, bestScore)) {
        best = st;
        bestScore = sc;
      }
      if (!st.ok) break;
      const cov = covOf(st);
      const low = served.filter((rid) => cov[rid] < ENGINEERING_FINAL_COVERAGE - ENGINEERING_COVERAGE_TOLERANCE);
      convergence.push({ round, coverage: Object.fromEntries(Object.entries(cov).map(([k, v]) => [k, +v.toFixed(4)])), low });
      if (!low.length && !st.clash.length) break;
      lo = { ...st.lo };
      for (const rid of low) lo[rid] = relabel(plan(rid, st.tr.rooms[rid].planRegion).loops);
    }
    // polish: a loop under the coverage limit in its own region is re-spiralled alone in it from
    // each corner of the region as the start side (Phase 6 `toward`); the best one loop is kept
    // when the settled zone is not worse and has fewer such loops
    const loopCov = (st, rid, l) => coverageOn({ loops: [l] }, G.intersection([l.shape], st.tr.rooms[rid].Uprime), pitch(rid));
    const weakOf = (st) => (!st.ok || !st.tr?.rooms ? served.map((rid) => [rid, null]).concat([[null, null]]).concat(Array(99).fill([null, null])) : weakOfOk(st));
    const weakOfOk = (st) => served.flatMap((rid) => st.lo[rid].filter((l) => loopCov(st, rid, l) < ENGINEERING_FINAL_COVERAGE - ENGINEERING_COVERAGE_TOLERANCE).map((l) => [rid, l]));
    // one room at a time: its weak loops re-spiralled alone from each corner, else the room
    // replanned from each corner (more loops only on free outlets); kept when the settled zone is
    // not worse and has fewer weak loops
    for (let pass = 1; pass <= 3 && best.ok; pass++) {
      const weak = weakOf(best);
      if (!weak.length) break;
      let improved = false;
      for (const rid of [...new Set(weak.map(([r]) => r))]) {
        const P = best.tr.rooms[rid].planRegion;
        const Up = best.tr.rooms[rid].Uprime;
        const lc = (l) => coverageOn({ loops: [l] }, G.intersection([l.shape], Up), pitch(rid));
        const weakIn = (ls) => ls.filter((l) => lc(l) < ENGINEERING_FINAL_COVERAGE - ENGINEERING_COVERAGE_TOLERANCE).length;
        const cur = best.lo[rid];
        const corners = (reg) => {
          const bb = G.bbox(reg.flatMap((sh) => sh.outer));
          return [{ x: bb.x0, y: bb.y0 }, { x: bb.x1, y: bb.y0 }, { x: bb.x1, y: bb.y1 }, { x: bb.x0, y: bb.y1 }];
        };
        const variants = [];
        // (a) the weak loops alone
        const alone = cur.map((l) => {
          if (lc(l) >= ENGINEERING_FINAL_COVERAGE - ENGINEERING_COVERAGE_TOLERANCE) return l;
          const part = G.intersection([l.shape], P).filter((sh) => G.area([sh]) >= 1e-6);
          let pick = l;
          let pc = lc(l);
          if (part.length)
            for (const c of corners(part)) {
              const ls = replanPart(rid, part, P, c);
              if (ls.length !== 1) continue;
              const cv = coverageOn({ loops: ls }, G.intersection(part, Up), pitch(rid));
              if (cv > pc + 1e-9) {
                pick = { ...ls[0], loopId: l.loopId };
                pc = cv;
              }
            }
          return pick;
        });
        if (alone.some((l, i) => l !== cur[i])) variants.push(alone);
        // (b) the room replanned
        const used = served.reduce((a, r) => a + best.lo[r].length, 0);
        for (const c of corners(P)) {
          const ls = plan(rid, P, c).loops.filter((l) => l.spiral?.heating);
          if (ls.length && ls.length <= cur.length + (fx.collector.outlets - used)) variants.push(relabel(ls));
        }
        const key = (ls) => [weakIn(ls), -coverageOn({ loops: ls }, Up, pitch(rid))];
        variants.sort((x, y) => key(x)[0] - key(y)[0] || key(x)[1] - key(y)[1]);
        for (const v of variants.slice(0, 2)) {
          if (key(v)[0] >= weakIn(cur)) continue;
          const lo2 = { ...best.lo, [rid]: v };
          for (const m of ['loop', 'room']) {
            const st2 = settle(lo2, `polish${pass}.${rid}`, m);
            if (process.env.UFH_DEBUG) console.error('polish', rid, m, JSON.stringify(scoreOf(st2)), JSON.stringify(scoreOf(best)), weakOf(st2).length, weakOf(best).length);
            if (st2.ok && !better(scoreOf(best), scoreOf(st2)) && weakOf(st2).length < weakOf(best).length) {
              best = st2;
              improved = true;
              break;
            }
          }
          if (improved) break;
        }
        if (improved) break;
      }
      if (!improved) break;
    }
    tr = best.tr;
    lastClash = best.clash;
    converged = best.ok && !best.clash.length;
    const loopsOf = best.lo;
    // the loop set of every room, checked by the frozen raw check against the final U′
    plans = Object.fromEntries(
      served.map((rid) => {
        const loops = loopsOf[rid];
        const loopSet = { regions: loops.map((l) => ({ poly: l.shape.outer, holes: l.shape.holes, status: 'VALID', spiral: l.spiral })) };
        return [rid, { loops, check: checkRawSet(loopSet, tr?.rooms?.[rid]?.Uprime ?? U[rid], pitch(rid)) }];
      }),
    );
    counts = Object.fromEntries(served.map((rid) => [rid, loopsOf[rid].length]));
  }
  const run = { fx, params, U, transfers: tr, plans, counts, history, connect, converged, convergence, clashes: lastClash };
  if (connect && tr?.rooms && plans) Object.assign(run, connectedReport(run));
  return run;
}

/** The longest lead length from its port to where it enters the room (0 in the manifold room). */
export function transferToEntry(fx, tr, rid) {
  const room = [{ outer: G.ccw(fx.rooms.find((r) => r.id === rid).poly), holes: [] }];
  let m = 0;
  for (const l of tr.leads.filter((x) => x.room === rid && x.path.length >= 2)) {
    if (G.pointInRegion(l.path[0], room)) continue;
    let s = 0;
    for (let k = 1; k < l.path.length; k++) {
      const a = l.path[k - 1];
      const b = l.path[k];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (G.pointInRegion(b, room) && G.distToRegionBoundary(b, room) > 1e-9) {
        // the entry on this segment: walk it in small steps (the wall plane)
        let lo = 0;
        let hi = 1;
        for (let it = 0; it < 40; it++) {
          const mid = (lo + hi) / 2;
          const q = { x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid };
          if (G.pointInRegion(q, room)) hi = mid;
          else lo = mid;
        }
        s += seg * hi;
        break;
      }
      s += seg;
    }
    m = Math.max(m, s);
  }
  return m;
}

/** The loops of a connected run as one list: id `${room}.${loopId}`, the room's heating pitch. */
export function loopsOfRun(run) {
  const out = [];
  for (const [rid, p] of Object.entries(run.plans ?? {})) {
    const s = heatingPitchOf(run.fx.rooms.find((r) => r.id === rid), run.params);
    for (const l of p.loops) out.push({ id: `${rid}.${l.loopId}`, room: rid, s, loop: l, spiral: l.spiral });
  }
  return out;
}

/** Topology (looptopology.js) and the per-loop table (loopreport.js) of a connected run. */
export function connectedReport(run) {
  const { fx, transfers: tr } = run;
  const loops = loopsOfRun(run);
  const topology = loopTopology(loops, tr.leads, { ports: portsOf(fx.collector), doors: tr.doors });
  const keepOff = [...fx.doors.map((d) => d.at), fx.collector.at];
  const Uprime = Object.fromEntries(Object.entries(tr.rooms).map(([rid, x]) => [rid, x.Uprime]));
  const loopRows = loopReport({ rooms: fx.rooms, loops, leads: tr.leads, topology, Uprime, collector: fx.collector, leadSpacing: run.params.leadSpacing, keepOff });
  return { topology, loopRows };
}

/**
 * A rectangular loop region cut down to the largest rectangle inside P (null: not a rectangle or
 * nothing left): the cut lines are the coordinates of the overlap, the cells a grid over them.
 */
export function trimmedRect(shape, P) {
  if (shape.holes?.length) return null;
  const bb = G.bbox(shape.outer);
  if (Math.abs(G.area([shape]) - (bb.x1 - bb.x0) * (bb.y1 - bb.y0)) > 1e-6) return null;
  const R = { outer: [{ x: bb.x0, y: bb.y0 }, { x: bb.x1, y: bb.y0 }, { x: bb.x1, y: bb.y1 }, { x: bb.x0, y: bb.y1 }], holes: [] };
  // (numerical slivers along a shared edge — under 1 mm thick — are no overlap)
  const O = G.difference([R], P).filter((sh) => {
    const b = G.bbox(sh.outer);
    return G.area([sh]) >= 1e-6 && Math.min(b.x1 - b.x0, b.y1 - b.y0) >= 1e-3;
  });
  if (!O.length) return R;
  const cut = (v, lo, hi) => [...new Set([lo, hi, ...v.filter((x) => x > lo + 1e-9 && x < hi - 1e-9)].map((x) => Math.round(x * 1e9) / 1e9))].sort((a, b) => a - b);
  const pts = O.flatMap((sh) => [sh.outer, ...(sh.holes ?? [])].flat());
  const xs = cut(pts.map((p) => p.x), bb.x0, bb.x1);
  const ys = cut(pts.map((p) => p.y), bb.y0, bb.y1);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const busy = [];
  for (let j = 0; j < ny; j++) {
    busy.push([]);
    for (let i = 0; i < nx; i++) busy[j].push(G.pointInRegion({ x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 }, O));
  }
  let best = null;
  for (let j0 = 0; j0 < ny; j0++)
    for (let i0 = 0; i0 < nx; i0++)
      for (let j1 = j0; j1 < ny; j1++)
        for (let i1 = i0; i1 < nx; i1++) {
          let free = true;
          for (let j = j0; j <= j1 && free; j++) for (let i = i0; i <= i1 && free; i++) if (busy[j][i]) free = false;
          if (!free) break;
          const a = (xs[i1 + 1] - xs[i0]) * (ys[j1 + 1] - ys[j0]);
          if (!best || a > best.a + 1e-12) best = { a, x0: xs[i0], y0: ys[j0], x1: xs[i1 + 1], y1: ys[j1 + 1] };
        }
  if (!best) return null;
  return { outer: [{ x: best.x0, y: best.y0 }, { x: best.x1, y: best.y0 }, { x: best.x1, y: best.y1 }, { x: best.x0, y: best.y1 }], holes: [] };
}

/** Covered share of a region by a plan's heating (band s/2 + 3 mm, as the raw check). */
export function coverageOn(plan, region, s) {
  const lines = plan.loops.map((l) => l.spiral?.heating).filter((h) => h && h.length >= 2);
  const A = G.area(region);
  if (!lines.length || A <= 0) return 0;
  return G.area(G.intersection(G.bufferPolylines(lines, s / 2 + 0.003), region)) / A;
}

const stateKey = (plans) =>
  JSON.stringify(Object.entries(plans).map(([rid, p]) => [rid, p.loops.map((l) => [l.spiral?.supply?.x?.toFixed(6), l.spiral?.supply?.y?.toFixed(6), l.heatingLength.toFixed(6)])]));

/**
 * Where a spiral comes too close to a lead run in a room (centre to centre < `clear`):
 *   other loops' leads — the whole spiral path (heating + the stubs to its two ends);
 *   its own leads — the heating, except within s + clear of its own two ends (where its pair
 *   leaves the bundle, the outermost there by construction); and they never cross its path.
 * The connection segments from a lead run to the spiral ends are not runs and are not counted.
 */
export function heatingClash(plans, tr, clear) {
  const out = [];
  const runsOf = new Map();
  const all = [];
  for (const pcs of Object.values(tr.roomPieces ?? {})) for (const pp of pcs) if (pp.length >= 2) all.push(pp);
  if (!all.length) return out;
  // (a run belongs to the lead whose path holds both its ends)
  const on = (q, path) => path.some((v, k) => k > 0 && G.segDist(q, path[k - 1], v) < 1e-7);
  const ownerOf = new Map();
  for (const pp of all) {
    const l = (tr.leads ?? []).find((x) => on(pp[0], x.path) && on(pp[pp.length - 1], x.path));
    ownerOf.set(pp, l?.loop ?? null);
  }
  for (const [rid, p] of Object.entries(plans ?? {}))
    for (const l of p.loops) {
      const sp = l.spiral;
      if (!sp?.path) continue;
      const lid = `${rid}.${l.loopId}`;
      const own = all.filter((pp) => ownerOf.get(pp) === lid);
      const others = all.filter((pp) => ownerOf.get(pp) !== lid);
      let len = 0;
      let at = null;
      const add = (parts) => {
        for (const q of parts) {
          len += G.pathLength(q);
          at = at ?? q[0];
        }
      };
      if (others.length) add(G.clipLines([sp.path], G.bufferPolylines(others, clear - 1e-9, 'butt', 'miter')));
      if (own.length) {
        const ends = G.bufferPolylines([[sp.supply, sp.ret]], (sp.s ?? l.nominalSpacing) + clear, 'round', 'round');
        add(G.clipLines([sp.heating], G.difference(G.bufferPolylines(own, clear - 1e-9, 'butt', 'miter'), ends)));
        for (const pp of own)
          for (let i = 1; i < pp.length; i++)
            for (let j = 1; j < sp.path.length; j++) {
              const x = G.segmentIntersection(pp[i - 1], pp[i], sp.path[j - 1], sp.path[j]);
              if (x) {
                len += 1e-3;
                at = at ?? x;
              }
            }
      }
      if (len > 1e-6) out.push({ room: rid, loop: lid, length_m: len, at });
    }
  return out;
}

/** The numbers of a run (per room and per door), and a hash of all geometry (determinism). */
export function metricsOf(run) {
  const { transfers: tr, plans, params } = run;
  const rooms = {};
  for (const [rid, x] of Object.entries(tr.rooms)) {
    const p = plans?.[rid];
    const H = p ? p.check.usable_m2 - p.check.uncovered_m2 : 0;
    // measured: the lead centrelines' smallest distance to this room's walls (away from the
    // doors and the manifold, where they turn through the wall)
    const room = run.fx.rooms.find((r) => r.id === rid);
    const reg = [{ outer: G.ccw(room.poly), holes: [] }];
    const keepOff = [...run.fx.doors.filter((d) => d.between.includes(rid)).map((d) => d.at), run.fx.collector.at];
    let wallMin = Infinity;
    let wallAt = null;
    for (const l of tr.leads.filter((x) => x.path.length >= 2))
      for (const q of G.densify(l.path, 0.02))
        if (G.pointInRegion(q, reg) && keepOff.every((k) => Math.hypot(q.x - k.x, q.y - k.y) > 0.7)) {
          const d = G.distToRegionBoundary(q, reg);
          if (d < wallMin - 1e-12) {
            wallMin = d;
            wallAt = { lead: q, wall: G.closestOnRing(q, G.ccw(room.poly)).p };
          }
        }
    rooms[rid] = {
      role: x.role,
      heatingPitch: x.heatingPitch,
      U_m2: x.U_m2,
      C_m2: x.C_m2,
      Uprime_m2: x.Uprime_m2,
      H_m2: H,
      coverageUprime: x.Uprime_m2 > 0 ? H / x.Uprime_m2 : 0,
      rawcheckUsable_m2: p?.check.usable_m2 ?? null,
      rawcheckUncovered_m2: p?.check.uncovered_m2 ?? null,
      loops: p ? p.loops.map((l) => ({ id: `${rid}.L${l.loopId.slice(1)}`, heating_m: l.heatingLength, nominalSpacing: l.nominalSpacing })) : [],
      minHeatingSpacing_m: p?.check.minSpacing ?? null,
      bundles: x.bundles.map((b) => ({ side: b.side, stretch: b.stretch, leads: b.N, leadSpacing: params.leadSpacing, span_m: b.span, width_m: b.width, depth_m: b.depth, exits: b.exits })),
      corridorComponents: x.corridor.length,
      components: x.components,
      split: x.split,
      slivers: x.slivers,
      leadWallMin_m: Number.isFinite(wallMin) ? wallMin : null,
      leadWallAt: wallAt,
      minHeatingSpacingAt: p?.check.minSpacingAt ?? null,
    };
  }
  const geometry = JSON.stringify({ leads: tr.leads.map((l) => [l.id, l.path.map((p) => [+p.x.toFixed(9), +p.y.toFixed(9)])]), rooms: Object.fromEntries(Object.entries(tr.rooms).map(([k, v]) => [k, [v.C_m2.toFixed(9), v.Uprime_m2.toFixed(9)]])), loops: Object.fromEntries(Object.entries(plans ?? {}).map(([k, p]) => [k, p.loops.map((l) => l.heatingLength.toFixed(9))])) });
  // pipeline-level: the heating of every served room on U′ (frozen planner) against the
  // engineering coverage (tolerance 0) — a room the corridor leaves unheatable shows here
  const heatingIssues = Object.entries(rooms)
    .filter(([, x]) => !(x.coverageUprime >= ENGINEERING_FINAL_COVERAGE - ENGINEERING_COVERAGE_TOLERANCE))
    .map(([rid, x]) => ({ status: 'COVERAGE_BELOW_LIMIT', room: rid, msg: `room ${rid}: coverage(U′) ${(100 * x.coverageUprime).toFixed(1)} % < ${100 * ENGINEERING_FINAL_COVERAGE} % (${x.loops.length} loop(s) on U′ ${x.Uprime_m2.toFixed(2)} m²)` }));
  return {
    status: tr.status,
    issues: tr.issues,
    heatingIssues,
    leadSpacing: params.leadSpacing,
    portOrder: tr.portOrder,
    leadCrossings: tr.crossings,
    doors: tr.doors,
    areas: tr.areas,
    rooms,
    leads: tr.leads.map((l) => ({ id: l.id, kind: l.kind, doors: l.doors, length_m: l.length })),
    history: run.history,
    geometryHash: crypto.createHash('sha256').update(geometry).digest('hex'),
  };
}

/** A measured heating pitch: from the middle of a long straight run, the nearest parallel pipe along its normal. */
export function pitchMeasure(loops) {
  let best = null;
  for (const l of loops) {
    const h = l.spiral?.heating;
    if (!h) continue;
    for (let i = 1; i < h.length; i++) {
      const L = Math.hypot(h[i].x - h[i - 1].x, h[i].y - h[i - 1].y);
      if (L < 0.6 || (best && L <= best.L)) continue;
      const m = { x: (h[i].x + h[i - 1].x) / 2, y: (h[i].y + h[i - 1].y) / 2 };
      const n = { x: -(h[i].y - h[i - 1].y) / L, y: (h[i].x - h[i - 1].x) / L };
      let dmin = Infinity;
      let hit = null;
      for (const sgn of [1, -1]) {
        const far = { x: m.x + n.x * sgn * 0.5, y: m.y + n.y * sgn * 0.5 };
        for (const o of loops)
          for (let j = 1; j < (o.spiral?.heating?.length ?? 0); j++) {
            const H = o.spiral.heating;
            if (o === l && Math.abs(j - i) < 1) continue;
            const x = G.segmentIntersection(m, far, H[j - 1], H[j]);
            if (x) {
              const d = Math.hypot(x.x - m.x, x.y - m.y);
              if (d > 1e-6 && d < dmin) {
                dmin = d;
                hit = { x: x.x, y: x.y };
              }
            }
          }
      }
      if (hit) best = { L, a: m, b: hit, d: dmin };
    }
  }
  return best;
}

const LOOP_COLORS = ['#2e7d32', '#ef6c00', '#6a1b9a', '#00838f', '#ad1457', '#4e342e', '#283593', '#9e9d24', '#5d4037', '#00695c'];

/** SVG of a run; view = { x0, y0, x1, y1 } for a detail, scale px / m. */
export function renderTransfers(run, { title, view = null, scale = 80, notes = true, focus = null } = {}) {
  const { fx, transfers: tr, plans } = run;
  const m = metricsOf(run);
  const all = fx.rooms.flatMap((r) => r.poly);
  const bb = view ?? (() => {
    const b = G.bbox(all);
    return { x0: b.x0 - 0.3, y0: b.y0 - 0.3, x1: b.x1 + 0.3, y1: b.y1 + 0.3 };
  })();
  const S = scale;
  const W = (bb.x1 - bb.x0) * S;
  const Hh = (bb.y1 - bb.y0) * S;
  const X = (p) => (p.x - bb.x0) * S;
  const Y = (p) => (bb.y1 - p.y) * S;
  const pth = (pts, closed) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p).toFixed(2)},${Y(p).toFixed(2)}`).join('') + (closed ? 'Z' : '');
  const reg = (R) => G.asRegion(R).map((s) => [s.outer, ...(s.holes ?? [])].map((q) => pth(q, true)).join('')).join('');
  const el = [];
  // walls: the building outline (0.12 m outer walls) minus the rooms
  const roomsReg = fx.rooms.map((r) => ({ outer: G.ccw(r.poly), holes: [] }));
  const walls = G.difference(G.offset(G.union(roomsReg), 0.12, 'miter'), roomsReg);
  el.push(`<path d="${reg(walls)}" fill="#9e9e9e" fill-rule="evenodd"/>`);
  for (const r of fx.rooms) for (const o of r.obstacles ?? []) el.push(`<path d="${pth(G.ccw(o), true)}" fill="#bdbdbd" stroke="#616161" stroke-width="1"/>`);
  // doors: the opening through the wall
  for (const d of fx.doors) {
    const a = fx.rooms.find((r) => r.id === d.between[0]);
    const q = G.closestOnRing(d.at, G.ccw(a.poly));
    const R = G.ccw(a.poly);
    const p0 = R[q.i];
    const p1 = R[(q.i + 1) % R.length];
    const L = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const u = { x: (p1.x - p0.x) / L, y: (p1.y - p0.y) / L };
    const n = { x: -u.y, y: u.x };
    const w = d.width_m / 2;
    const c = d.at;
    const rect = [-1, 1].flatMap((sg) => [-1, 1].map((sn) => ({ x: c.x + u.x * w * sg + n.x * 0.08 * sn * sg, y: c.y + u.y * w * sg + n.y * 0.08 * sn * sg })));
    el.push(`<path d="${pth([rect[0], rect[1], rect[3], rect[2]], true)}" fill="#fff" stroke="#8d6e63" stroke-width="1"/>`);
    el.push(`<text x="${X(c) + 4}" y="${Y(c) - 4}" font-size="${Math.max(9, S / 9)}" fill="#5d4037">${d.id} ${d.width_m} m</text>`);
  }
  for (const [rid, x] of Object.entries(tr.rooms)) {
    el.push(`<path d="${reg(x.U)}" fill="#e8f5e9" stroke="none" fill-rule="evenodd"/>`);
    if (x.exclusion.length) el.push(`<path d="${reg(x.exclusion)}" fill="#ffb74d" fill-opacity="0.8" stroke="#e65100" stroke-width="0.6" fill-rule="evenodd"/>`);
    el.push(`<path d="${reg(x.Uprime)}" fill="none" stroke="#2e7d32" stroke-width="0.8" stroke-dasharray="4,3" fill-rule="evenodd"/>`);
  }
  // heating loops (frozen Phase 6 planner on U′): the whole continuous spiral, its residual /
  // terminal closure part highlighted (Phase 5/6 terminal interval along the heating)
  let ci = 0;
  const rowOf = new Map((run.loopRows ?? []).map((w) => [w.loop, w]));
  const fade = (id) => (focus && id !== focus ? ' opacity="0.25"' : '');
  for (const [rid, p] of Object.entries(plans ?? {}))
    for (const l of p.loops) {
      const id = `${rid}.${l.loopId}`;
      const col = LOOP_COLORS[ci++ % LOOP_COLORS.length];
      const sp = l.spiral;
      const term = sp.residual?.terminal;
      if (term && term[1] > term[0]) el.push(`<path d="${pth(G.subPath(sp.heating, term[0], term[1]))}" fill="none" stroke="#ffd600" stroke-opacity="0.75" stroke-width="${Math.max(4, S / 18)}" stroke-linecap="round"${fade(id)}/>`);
      el.push(`<path d="${pth(sp.path)}" fill="none" stroke="${col}" stroke-width="${Math.max(0.8, S / 90)}"${fade(id)}/>`);
      const b = G.bbox(l.shape.outer);
      const w = rowOf.get(id);
      const lab = w ? `${id} · o${w.outlet + 1} · heat ${w.heating_m.toFixed(1)} · total ${w.total_m.toFixed(1)} m · ${(100 * w.coverage).toFixed(1)} %` : `${id} · ${l.heatingLength.toFixed(1)} m`;
      el.push(`<text x="${X({ x: (b.x0 + b.x1) / 2 })}" y="${Y({ y: (b.y0 + b.y1) / 2 })}" font-size="${Math.max(9, S / 9)}" font-weight="bold" fill="${col}" text-anchor="middle" stroke="#fff" stroke-width="3" paint-order="stroke"${fade(id)}>${lab}</text>`);
    }
  // transfer leads: supply red, return blue (the engine's centrelines)
  for (const l of tr.leads.filter((x) => x.path.length >= 2)) el.push(`<path d="${pth(l.path)}" fill="none" stroke="${l.kind === 'supply' ? '#d50000' : '#0d47a1'}" stroke-width="${Math.max(0.7, S / 160)}"${fade(l.loop)}/>`);
  // connection points (topology): the heating start (supply joins) ● and end (return joins) ○
  for (const tl of run.topology?.loops ?? []) {
    const r0 = Math.max(2.2, S / 35);
    if (tl.heatingStart) el.push(`<circle cx="${X(tl.heatingStart)}" cy="${Y(tl.heatingStart)}" r="${r0}" fill="#d50000" stroke="#000" stroke-width="0.6"${fade(tl.id)}/>`);
    if (tl.heatingEnd) el.push(`<circle cx="${X(tl.heatingEnd)}" cy="${Y(tl.heatingEnd)}" r="${r0}" fill="#fff" stroke="#0d47a1" stroke-width="${Math.max(1, S / 120)}"${fade(tl.id)}/>`);
    if (focus === tl.id && tl.heatingStart) {
      el.push(`<text x="${X(tl.heatingStart) + 8}" y="${Y(tl.heatingStart) + 4}" font-size="${Math.max(10, S / 14)}" font-weight="bold" stroke="#fff" stroke-width="3" paint-order="stroke">HEATING START (supply)</text>`);
      el.push(`<text x="${X(tl.heatingEnd) + 8}" y="${Y(tl.heatingEnd) + 16}" font-size="${Math.max(10, S / 14)}" font-weight="bold" stroke="#fff" stroke-width="3" paint-order="stroke">HEATING END (return)</text>`);
    }
  }
  // manifold
  const P = portsOf(fx.collector);
  const used = new Set(tr.portOrder.map((_, i) => i));
  const pts = P.flatMap((p) => [p.supply, p.ret]);
  const mb = G.bbox(pts);
  el.push(`<rect x="${X({ x: mb.x0 - 0.04 })}" y="${Y({ y: mb.y1 + 0.06 })}" width="${(mb.x1 - mb.x0 + 0.08) * S}" height="${(mb.y1 - mb.y0 + 0.08) * S}" fill="#fff59d" stroke="#f57f17"/>`);
  P.forEach((p, i) => {
    for (const [q, col] of [[p.supply, '#d50000'], [p.ret, '#0d47a1']]) el.push(`<circle cx="${X(q)}" cy="${Y(q)}" r="${Math.max(1.5, S / 60)}" fill="${used.has(i) ? col : '#bdbdbd'}"/>`);
  });
  el.push(`<text x="${X({ x: mb.x1 + 0.08 })}" y="${Y({ y: mb.y1 + 0.1 })}" font-size="${Math.max(9, S / 8)}" font-weight="bold">${fx.collector.id} · ${fx.collector.outlets} outlets · ${tr.portOrder.length} used</text>`);
  // measured dimensions (from the geometry above): lead ↔ wall and the heating pitch
  const fsz = Math.max(9, S / 9);
  for (const [rid, x] of Object.entries(m.rooms)) {
    if (x.leadWallAt) {
      const { lead, wall } = x.leadWallAt;
      el.push(`<path d="${pth([wall, lead])}" stroke="#000" stroke-width="${Math.max(2, S / 60)}"/>`);
      const lab = { x: lead.x + 0.35, y: lead.y + 0.35 };
      el.push(`<path d="${pth([lead, lab])}" stroke="#000" stroke-width="0.8"/>`);
      el.push(`<text x="${X(lab) + 3}" y="${Y(lab)}" font-size="${fsz}" font-weight="bold" stroke="#fff" stroke-width="3" paint-order="stroke">${rid}: lead ↔ wall ${(x.leadWallMin_m * 1000).toFixed(1)} mm (measured)</text>`);
    }
    // the heating pitch: a dimension line between two neighbouring pipe centrelines (measured)
    const pm = plans?.[rid] ? pitchMeasure(plans[rid].loops) : null;
    if (pm) {
      el.push(`<path d="${pth([pm.a, pm.b])}" stroke="#000" stroke-width="${Math.max(1.2, S / 90)}"/>`);
      for (const q of [pm.a, pm.b]) el.push(`<circle cx="${X(q)}" cy="${Y(q)}" r="${Math.max(1.5, S / 70)}" fill="#000"/>`);
      el.push(`<text x="${X(pm.b) + 5}" y="${Y(pm.b) - 3}" font-size="${fsz}" font-weight="bold" stroke="#fff" stroke-width="3" paint-order="stroke">pitch ${(pm.d * 1000).toFixed(1)} mm (measured)</text>`);
    }
  }
  for (const r of fx.rooms) {
    const c = G.bbox(r.poly);
    const x = m.rooms[r.id];
    el.push(`<text x="${X({ x: c.x0 + 0.15 })}" y="${Y({ y: c.y1 - 0.15 }) + S / 6}" font-size="${Math.max(10, S / 6)}" font-weight="bold" fill="#263238">${r.id}</text>`);
    if (x) el.push(`<text x="${X({ x: c.x0 + 0.15 })}" y="${Y({ y: c.y1 - 0.15 }) + S / 3.2}" font-size="${Math.max(8, S / 10)}" fill="#263238">h ${x.heatingPitch * 1000} mm · cov(U′) ${(100 * x.coverageUprime).toFixed(1)} %</text>`);
  }
  const lines = [];
  if (notes) {
    lines.push(title ?? '');
    lines.push(`engine: roomgraph + corridor (7B) + frozen Phase 6 planner · transfers ${m.status}${m.issues.length ? ' — ' + m.issues.map((i) => i.msg).join('; ') : ''}`);
    lines.push(`heating on U′: ${m.heatingIssues.length ? m.heatingIssues.map((i) => i.msg).join('; ') : 'every room ≥ 85 % coverage(U′)'}`);
    lines.push(`leadWallOffset ${run.params.leadWallOffset * 1000} mm · leadSpacing ${run.params.leadSpacing * 1000} mm · heatingPitch ${run.params.heatingPitch * 1000} mm · collectorPortPitch ${fx.collector.portPitch_m * 1000} mm · pipe ${tr.params.pipeType} (OD ${tr.params.pipeOD * 1000} mm) · lead crossings ${m.leadCrossings}`);
    for (const [rid, x] of Object.entries(m.rooms))
      lines.push(`${rid.padEnd(3)} ${x.role.padEnd(16)} U ${x.U_m2.toFixed(2)} − C ${x.C_m2.toFixed(2)} = U′ ${x.Uprime_m2.toFixed(2)} · H ${x.H_m2.toFixed(2)} · cov(U′) ${(100 * x.coverageUprime).toFixed(1)} % · loops ${x.loops.length} · min heating spacing ${x.minHeatingSpacing_m ? (x.minHeatingSpacing_m * 1000).toFixed(1) : '—'} mm · lead↔wall ${x.leadWallMin_m ? (x.leadWallMin_m * 1000).toFixed(1) + ' mm' : '—'} · ${x.bundles.map((b) => `bundle ${b.leads} leads, span ${b.span_m.toFixed(3)}, width ${b.width_m.toFixed(3)}, depth ${b.depth_m.toFixed(3)} m → ${b.exits.join(',')}`).join(' | ')}`);
    lines.push(`doors: ${m.doors.map((d) => `${d.door} ${d.leads} leads need ${d.need_m.toFixed(3)} / ${d.width_m} m ${d.ok ? 'OK' : 'EXCEEDED'}`).join(' · ')}`);
    if (run.loopRows?.length) {
      lines.push(`topology ${run.topology.status} (${Object.entries(run.topology.counts).map(([k, v]) => `${k} ${v}`).join(', ')}) · settled ${run.converged ? 'yes' : 'NO'} · loop | outlet | heating | supply | return | drop | total (≤ 60) | coverage | largest gap | residual | min R | lead depth | status`);
      for (const w of run.loopRows) lines.push(`  ${w.loop.padEnd(7)} o${String(w.outlet + 1).padEnd(3)} ${w.heating_m.toFixed(2).padStart(6)} ${w.supply_m.toFixed(2).padStart(6)} ${w.return_m.toFixed(2).padStart(6)} ${w.drop_m.toFixed(2)} ${w.total_m.toFixed(2).padStart(6)} ${(100 * w.coverage).toFixed(1).padStart(5)} % ${w.largestGap_m2.toFixed(3)} m² ${w.residual?.measured ? (w.residual.measured * 1000).toFixed(0) + ' mm' : '—'.padEnd(6)} ${(w.minRadius_m * 1000).toFixed(0)} mm ${(w.wallOffset_m * 1000).toFixed(0)} mm ${w.topology} ${w.status}${w.warnings.length ? ' ' + w.warnings.join(',') : ''}${w.failed.length ? ' [' + w.failed.join(',') + ']' : ''}`);
    }
    lines.push('yellow: residual / terminal closure part · ● heating start (supply joins) · ○ heating end (return joins)');
    lines.push('red / blue: supply / return transfer leads · orange: corridor exclusion C · dashed: U′ · coloured: heating loops (dashed: lead-in to its region exit — 7C) · grey: walls, bathtub');
  }
  const fs1 = Math.max(11, 12);
  const txt = lines.map((l, i) => `<text x="8" y="${Hh + 18 + i * 17}" font-size="${i ? fs1 : 14}" font-family="monospace" ${i ? '' : 'font-weight="bold"'}>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(W, 1500).toFixed(0)}" height="${(Hh + 24 + lines.length * 17).toFixed(0)}" style="background:#fff" font-family="sans-serif"><rect width="100%" height="100%" fill="#fff"/>${el.join('')}${txt}</svg>`;
}

if (process.argv[1]?.endsWith('ufh-transfer-debug.mjs')) {
  // node tools/ufh-transfer-debug.mjs <fixture> <leadSpacing> <out.svg> [detail.svg [loopId]] [--connect]
  const args = process.argv.slice(2).filter((a) => a !== '--connect');
  const connect = process.argv.includes('--connect');
  const [file, ls, out, detail, focusLoop] = args;
  const fx = JSON.parse(fs.readFileSync(file, 'utf8'));
  const t0 = Date.now();
  const run = runTransfers(fx, { leadSpacing: +ls, connect });
  const ms = Date.now() - t0;
  const m = metricsOf(run);
  console.log(JSON.stringify({ ms, ...m, converged: run.converged, convergence: run.convergence, topology: run.topology, loopRows: run.loopRows }, null, 1));
  fs.writeFileSync(out, renderTransfers(run, { title: `${file.split('/').pop()} — leadSpacing ${+ls * 1000} mm${connect ? ' — connected loops' : ''}` }));
  if (detail) {
    // the chain of one loop: collector → lead → door → room → spiral → terminal closure → return
    const focus = focusLoop ?? run.loopRows?.[0]?.loop ?? null;
    let view = { x0: 3.0, y0: -0.3, x1: 7.6, y1: 3.2 };
    if (focus && run.transfers.leads) {
      const [rid, lid] = focus.split('.');
      const lp = run.plans[rid].loops.find((l) => l.loopId === lid);
      const pts = [...run.transfers.leads.filter((l) => l.loop === focus).flatMap((l) => l.path), ...lp.spiral.path, fx.collector.at];
      const b = G.bbox(pts);
      view = { x0: b.x0 - 0.4, y0: b.y0 - 0.4, x1: b.x1 + 0.4, y1: b.y1 + 0.4 };
    }
    const sc = Math.min(260, 1400 / Math.max(view.x1 - view.x0, view.y1 - view.y0));
    fs.writeFileSync(detail, renderTransfers(run, { title: `detail ${focus ?? ''}: COLLECTOR → SUPPLY LEAD → DOOR → ROOM → HEATING SPIRAL → TERMINAL CLOSURE → RETURN LEAD → COLLECTOR`, view, scale: sc, notes: true, focus }));
  }
}
