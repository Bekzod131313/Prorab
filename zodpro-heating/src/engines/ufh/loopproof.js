// UFH Coverage Router — step 6: MINIMUM LOOP COUNT — lower bounds and an exhaustive search.
//
// "The planner found no plan with fewer loops" is no proof. Two things are:
//
//   LOWER BOUNDS (any plan, any loop shapes) — a heating pipe of length L covers at most its band,
//   area ≤ L · (s + 6 mm) + π r² (r = s/2 + 3 mm, the coverage band); a valid zone covers at least
//   ENGINEERING_FINAL_COVERAGE of its floor; a loop carries at most 60 m − its two leads of heating
//   pipe, and every lead is at least the shortest route from the manifold to the region's walls.
//     COVERAGE_LOWER_BOUND    ⌈ needed cover / (60 · (s + 6 mm) + π r²) ⌉         (no leads)
//     LEAD_AWARE_LOWER_BOUND  ⌈ needed cover / ((60 − 2 · leadMin) · (s + 6 mm) + π r²) ⌉
//     FINAL_LOWER_BOUND       max of the two
//     RAW_PIPE_ESTIMATE       ⌈ raw spiral / (60 − 2 · leadMin) ⌉ — NOT a bound (a shorter valid
//                             spiral of the same floor may exist: LP3b) — reported, never used
//
//   EXHAUSTIVE SEARCH (the router's region model) — the loops of a rectangular region are
//   rectangles of it (the decomposition model of steps 2–4), every cut on a CUT_GRID raster, every
//   part with every spiral variant the generators give (start corners, ring counts, centre types,
//   mirror, centre closures with residual spacing), at its real position (its leads). A branch and
//   bound over guillotine partitions decides whether k loops can reach the needed cover with every
//   loop ≤ 60 m (supply + heating + return) and no patch over MAX_LARGEST_GAP. Pruning uses the
//   bound above only (rigorous). Every partition of a rectangle into at most 4 rectangles is a
//   guillotine one, so for k ≤ 4 the search covers all rectangle partitions on the raster.
//
// Status per loop count k — "not found" and "impossible" are never the same:
//   PROVEN_INFEASIBLE      k below the continuous lower bound (any geometry, no raster)
//   GRID_EXHAUSTIVE        k ≤ 4: no rectangle partition on the raster works (NOT a continuous proof)
//   SEARCH_NOT_EXHAUSTIVE  k ≥ 5 (guillotine only) or the time limit hit
//   PROVEN_FEASIBLE        a partition found, its geometry rebuilt and validated
//   NOT_RUN                not searched

import * as G from './geom.js';
import { bestSpiral } from './spiralgen.js';
import { obstacleSpiral, measure } from './obstaclespiral.js';
import { closeCentre } from './closure.js';
import { MAX_LOOP_M, MAX_LARGEST_GAP, ENGINEERING_FINAL_COVERAGE, LOOP_LENGTH_EPS, LOOP_CUT_GRID, RMIN_CHECK, REBUILD_TOL } from './criteria.js';

const lengthOk = (t) => t <= MAX_LOOP_M + LOOP_LENGTH_EPS;
const GUILLOTINE_COMPLETE_MAX = 4; // every partition of a rectangle into ≤ 4 rectangles is guillotine

/** The named lower bounds of a region's loop count. */
export function loopLowerBounds({ area, s, leadMin, rawHeating, coverMin = ENGINEERING_FINAL_COVERAGE }) {
  const band = s + 0.006;
  const cap = Math.PI * (s / 2 + 0.003) ** 2;
  const need = coverMin * area;
  const perLoop = MAX_LOOP_M - 2 * leadMin;
  const coverageLB = Math.max(1, Math.ceil(need / (MAX_LOOP_M * band + cap) - 1e-9));
  const leadAwareLB = perLoop > 0 ? Math.max(1, Math.ceil(need / (perLoop * band + cap) - 1e-9)) : Infinity;
  return {
    neededCover_m2: need,
    leadMin,
    perLoopHeatingMax: perLoop,
    COVERAGE_LOWER_BOUND: coverageLB,
    LEAD_AWARE_LOWER_BOUND: leadAwareLB,
    FINAL_LOWER_BOUND: Math.max(coverageLB, leadAwareLB),
    RAW_PIPE_ESTIMATE: rawHeating === undefined ? null : Math.ceil(rawHeating / perLoop - 1e-9),
    RAW_PIPE_ESTIMATE_isBound: false,
  };
}

/**
 * Exhaustive minimum loop count of a rectangular region (the router's region model).
 * @param o { rect {x0,y0,x1,y1}, s, r, onWall(p), leadTo(p), toward, rawHeating, chosen (planner's count),
 *            coverMin, grid, kMax, log }
 * @returns { bounds, results: [{ k, status: 'FEASIBLE'|'PROVEN_INFEASIBLE'|'SEARCH_NOT_EXHAUSTIVE', ... }],
 *            minimum, provenMinimum, solution (parts of the smallest feasible k), stats }
 */
export function proveLoopCount(o) {
  const { rect, s, onWall, leadTo } = o;
  const grid = o.grid ?? LOOP_CUT_GRID;
  const band = s + 0.006;
  const cap = Math.PI * (s / 2 + 0.003) ** 2;
  const minW = 3 * s + (o.r ?? Math.max(0.072, s / 2));
  const t0 = Date.now();
  const stats = { leafCalls: 0, leafBuilds: 0, nodes: 0, pruned: 0 };
  // raster: cuts every `grid` from the low side, the far side exactly
  const axis = (a, b) => {
    const v = [];
    for (let x = a; x < b - 1e-9; x += grid) v.push(Math.round(x * 1e6) / 1e6);
    v.push(b);
    return v;
  };
  const xs = axis(rect.x0, rect.x1);
  const ys = axis(rect.y0, rect.y1);
  const area = (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
  // the shortest lead to a rectangle's wall points (its exits are there); Infinity: no wall
  const leadMinMemo = new Map();
  const leadMinOf = (x0, y0, x1, y1) => {
    const key = `${x0},${y0},${x1},${y1}`;
    if (leadMinMemo.has(key)) return leadMinMemo.get(key);
    let m = Infinity;
    const R = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
    for (let i = 0; i < 4; i++) for (const q of G.densify([R[i], R[(i + 1) % 4]], 0.05)) if (onWall(q)) m = Math.min(m, leadTo(q));
    leadMinMemo.set(key, m);
    return m;
  };
  const leadMinAll = leadMinOf(rect.x0, rect.y0, rect.x1, rect.y1);
  const bounds = loopLowerBounds({ area, s, leadMin: leadMinAll, rawHeating: o.rawHeating, coverMin: o.coverMin });
  const need0 = bounds.neededCover_m2;
  // upper bound of the cover k loops in a rectangle can give (rigorous: band area and the leads)
  const ub = (x0, y0, x1, y1, k) => {
    const lm = leadMinOf(x0, y0, x1, y1);
    if (!isFinite(lm)) return -Infinity;
    const per = (MAX_LOOP_M - 2 * lm) * band + cap;
    return per <= 0 ? -Infinity : Math.min((x1 - x0) * (y1 - y0), k * per);
  };

  // ---- one rectangle as one loop: every generator variant, measured, at its position ----
  // (kept slim: the numbers the search needs — the geometry of a variant is rebuilt for the
  // solution only; thousands of parts are evaluated)
  const sig = (sp) => `${sp.start}|${sp.centre}|${sp.usedRings}|${sp.residualSpacing ?? '-'}|${sp.mirrored ? 'm' : ''}|${sp.heatingLength.toFixed(6)}`;
  // (min radius: the generator's own value — r, or a centre turn's ρ/2 — else measured on the pipe)
  const slim = (sp, m, closed) => ({ heatingLength: sp.heatingLength, leadIn: sp.leadIn, leadOut: sp.leadOut, supply: { x: sp.supply.x, y: sp.supply.y }, ret: { x: sp.ret.x, y: sp.ret.y }, uncovered: m.uncovered, hole: m.largestHole, minRadius: sp.minBend ?? G.minBendRadius(sp.path).radius, closed, sig: sig(sp) });
  const rectMemo = new Map();
  // every variant of a w × h rectangle with that wall pattern (built at the origin); full = keep geometry
  const buildVariants = (w, h, pat, full) => {
    const R0 = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    const walls0 = R0.map((p, i) => [p, R0[(i + 1) % 4]]).filter((_, i) => pat[i] === '1');
    const on0 = (q) => walls0.some(([a, c]) => G.segDist(q, a, c) < 1e-6);
    const ex0 = (q) => on0(q.supply) && on0(q.ret);
    const eo0 = (a, c) => on0({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 });
    const sh0 = { outer: R0, holes: [] };
    const list = [];
    const add = (sp, m, closed) => list.push(full ? { ...slim(sp, m, closed), sp } : slim(sp, m, closed));
    let base = null;
    const b = bestSpiral(R0, s, { r: o.r, exitOk: ex0 });
    if (b.ok) {
      const m = measure({ heating: b.heating }, s, [sh0]);
      add(b, m, false);
      base = { sp: b, hole: m.largestHole };
    }
    const r = obstacleSpiral(sh0, s, { r: o.r, exitOk: ex0, edgeOk: eo0, returnAll: true, measure: 2, groupByStart: true });
    if (r.ok)
      for (const x of r.ranked) {
        add(x, { uncovered: x.uncovered, largestHole: x.largestHole }, false);
        if (!base || x.largestHole < base.hole) base = { sp: x, hole: x.largestHole };
      }
    // the centre closures (residual spacing too) of the variant with the smallest patch
    const closures = () => {
      const out = [];
      if (base)
        for (const residual of [false, true]) {
          const c = closeCentre(sh0, base.sp, s, { r: o.r, exitOk: ex0, edgeOk: eo0, residual, returnAll: true });
          for (const x of c.candidates ?? []) out.push(full ? { ...slim(x, { uncovered: x.uncovered, largestHole: x.largestHole }, true), sp: x } : slim(x, { uncovered: x.uncovered, largestHole: x.largestHole }, true));
        }
      return out;
    };
    // (only the base spiral's pipe is kept for its closures; the closure lists are slim too)
    const baseKeep = base && { heating: base.sp.heating, region: base.sp.region, start: base.sp.start, supply: base.sp.supply, ret: base.sp.ret, path: base.sp.path, heatingLength: base.sp.heatingLength, leadIn: base.sp.leadIn, leadOut: base.sp.leadOut };
    return { list, closures: full ? closures : null, baseKeep, sh0, ex0, eo0 };
  };
  const variantsOf = (w, h, pat) => {
    const key = `${w.toFixed(4)}x${h.toFixed(4)}|${pat}`;
    if (rectMemo.has(key)) return rectMemo.get(key);
    stats.leafBuilds++;
    const v = buildVariants(w, h, pat, false);
    const entry = { list: v.list, closures: null };
    entry.closed = () => {
      if (!entry.closures) {
        entry.closures = [];
        if (v.baseKeep)
          for (const residual of [false, true]) {
            const c = closeCentre(v.sh0, v.baseKeep, s, { r: o.r, exitOk: v.ex0, edgeOk: v.eo0, residual, returnAll: true });
            for (const x of c.candidates ?? []) entry.closures.push(slim(x, { uncovered: x.uncovered, largestHole: x.largestHole }, true));
          }
        v.baseKeep = null; // (its pipe is not needed any more)
      }
      return entry.closures;
    };
    rectMemo.set(key, entry);
    return entry;
  };
  // the full spiral of a chosen variant (the solution's parts only): rebuilt, found by its signature
  const materialize = (part) => {
    const v = buildVariants(part.x1 - part.x0, part.y1 - part.y0, part.pat, true);
    const all = [...v.list, ...(part.v.closed ? v.closures() : [])];
    const hit = all.find((x) => x.sig === part.v.sig);
    return hit ? hit.sp : null;
  };
  const leafMemo = new Map();
  // best cover of a rectangle as one valid loop (≤ 60 m with its leads there, no patch) or null
  const leaf = (i0, j0, i1, j1) => {
    const key = `${i0},${j0},${i1},${j1}`;
    if (leafMemo.has(key)) return leafMemo.get(key);
    stats.leafCalls++;
    const x0 = xs[i0];
    const y0 = ys[j0];
    const x1 = xs[i1];
    const y1 = ys[j1];
    const w = x1 - x0;
    const h = y1 - y0;
    let out = null;
    if (Math.min(w, h) >= minW - 1e-9 && isFinite(leadMinOf(x0, y0, x1, y1))) {
      const side = (p, q) => [0.1, 0.5, 0.9].every((f) => onWall({ x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f }));
      const C = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
      const pat = C.map((p, i) => (side(p, C[(i + 1) % 4]) ? 1 : 0)).join('');
      const e = variantsOf(w, h, pat);
      const total = (v) => v.heatingLength + v.leadIn + v.leadOut + leadTo({ x: v.supply.x + x0, y: v.supply.y + y0 }) + leadTo({ x: v.ret.x + x0, y: v.ret.y + y0 });
      const ok = (v) => v.hole <= MAX_LARGEST_GAP && lengthOk(total(v));
      let best = null;
      const consider = (list) => {
        for (const v of list) if (ok(v) && (!best || v.uncovered < best.v.uncovered)) best = { v, total: total(v) };
      };
      consider(e.list);
      // the closures only where a plain variant fits the length (a closure only adds pipe)
      if (e.list.some((v) => lengthOk(total(v)))) consider(e.closed());
      if (best) out = { cover: w * h - best.v.uncovered, total: best.total, x0, y0, x1, y1, pat, v: best.v };
    }
    leafMemo.set(key, out);
    return out;
  };

  // ---- branch and bound over guillotine partitions ----
  // best(R, k, target): the MAXIMUM cover of R by ≤ k valid loops (a guillotine partition) when
  // it is ≥ target, else null. The maximum (not the first partition found) — a split of R into A
  // and B needs A's best cover to give B the smallest requirement. memo per (R, k): the exact
  // maximum, or "below t" (the maximum is < t).
  const memo = new Map();
  let deadline = Infinity;
  let timedOut = false;
  const best = (i0, j0, i1, j1, k, target, early = false) => {
    if (Date.now() > deadline) {
      timedOut = true;
      return null;
    }
    stats.nodes++;
    const x0 = xs[i0];
    const y0 = ys[j0];
    const x1 = xs[i1];
    const y1 = ys[j1];
    const U = ub(x0, y0, x1, y1, k);
    if (U < target - 1e-9) {
      stats.pruned++;
      return null;
    }
    const key = `${i0},${j0},${i1},${j1},${k}`;
    const m = memo.get(key);
    if (m) {
      if (m.exact) return m.exact.cover >= target - 1e-9 ? m.exact : null;
      if (target >= m.below - 1e-9) return null;
    }
    let top = null;
    const lf = leaf(i0, j0, i1, j1);
    if (lf) top = { cover: lf.cover, parts: [lf] };
    const bar = () => Math.max(target, top ? top.cover : -Infinity);
    let complete = true;
    if (k > 1)
      outer: for (const ax of ['x', 'y']) {
        const lo = ax === 'x' ? i0 : j0;
        const hi = ax === 'x' ? i1 : j1;
        const vs = ax === 'x' ? xs : ys;
        for (let c = lo + 1; c < hi; c++) {
          if (vs[c] - vs[lo] < minW - 1e-9 || vs[hi] - vs[c] < minW - 1e-9) continue;
          const A = ax === 'x' ? [i0, j0, c, j1] : [i0, j0, i1, c];
          const B = ax === 'x' ? [c, j0, i1, j1] : [i0, c, i1, j1];
          for (let k1 = 1; k1 < k; k1++) {
            const k2 = k - k1;
            const ubA = ub(xs[A[0]], ys[A[1]], xs[A[2]], ys[A[3]], k1);
            const ubB = ub(xs[B[0]], ys[B[1]], xs[B[2]], ys[B[3]], k2);
            // only a split that can beat the current best (and the target) is opened
            if (ubA + ubB <= bar() + 1e-9 && !(top === null && ubA + ubB >= target - 1e-9)) {
              stats.pruned++;
              continue;
            }
            const a = best(...A, k1, bar() - ubB);
            if (timedOut) {
              complete = false;
              break outer;
            }
            if (!a) continue;
            const b2 = best(...B, k2, Math.max(bar() - a.cover, -Infinity));
            if (timedOut) {
              complete = false;
              break outer;
            }
            if (!b2) continue;
            if (!top || a.cover + b2.cover > top.cover + 1e-9) top = { cover: a.cover + b2.cover, parts: [...a.parts, ...b2.parts] };
            // (root: a partition reaching the need is enough to decide feasibility)
            if (early && top.cover >= target - 1e-9) break outer;
          }
        }
      }
    if (timedOut && !complete) return top && top.cover >= target - 1e-9 ? top : null;
    if (!early || !top || top.cover < target - 1e-9) {
      if (top && top.cover >= target - 1e-9) memo.set(key, { exact: top });
      else memo.set(key, { below: Math.min(m?.below ?? Infinity, top ? Math.max(target, top.cover + 1e-9) : target) });
    }
    return top && top.cover >= target - 1e-9 ? top : null;
  };

  // a found partition, rebuilt and checked against what the search scored (the search keeps
  // numbers only): pipe length, cover, largest patch, min radius, and the loop total ≤ 60 m
  // recomputed on the rebuilt pipe where it lies
  const validate = (found) => {
    const rows = [];
    for (const p of found.parts) {
      const sp = materialize(p);
      if (!sp) return { ok: false, rows, reason: 'variant not rebuilt' };
      const m = measure({ heating: sp.heating }, s, [{ outer: [{ x: 0, y: 0 }, { x: p.x1 - p.x0, y: 0 }, { x: p.x1 - p.x0, y: p.y1 - p.y0 }, { x: 0, y: p.y1 - p.y0 }], holes: [] }]);
      const total = sp.heatingLength + sp.leadIn + sp.leadOut + leadTo({ x: sp.supply.x + p.x0, y: sp.supply.y + p.y0 }) + leadTo({ x: sp.ret.x + p.x0, y: sp.ret.y + p.y0 });
      const minR = G.minBendRadius(sp.path).radius;
      const row = {
        length: Math.abs(sp.heatingLength - p.v.heatingLength) <= REBUILD_TOL.length_m,
        coverage: Math.abs(m.uncovered - p.v.uncovered) <= REBUILD_TOL.area_m2,
        largestGap: Math.abs(m.largestHole - p.v.hole) <= REBUILD_TOL.area_m2,
        minRadius: Math.abs(minR - p.v.minRadius) <= REBUILD_TOL.radius_m && minR >= RMIN_CHECK,
        total: lengthOk(total) && Math.abs(total - p.total) <= REBUILD_TOL.length_m,
        values: { heating: sp.heatingLength, total, uncovered: m.uncovered, largestGap: m.largestHole, minRadius: minR },
      };
      rows.push(row);
    }
    return { ok: rows.every((r) => r.length && r.coverage && r.largestGap && r.minRadius && r.total), rows };
  };
  const mem = () => Math.round(process.memoryUsage().rss / 1048576);

  const results = [];
  // below the continuous lower bound: impossible for any geometry
  if (bounds.FINAL_LOWER_BOUND > 1) results.push({ k: `1…${bounds.FINAL_LOWER_BOUND - 1}`, status: 'PROVEN_INFEASIBLE', proof_method: 'LOWER_BOUND', completeness: 'complete — any geometry (continuous)', ms: 0 });
  let found1 = null;
  const ks = o.ks ?? Array.from({ length: Math.max(0, (o.kMax ?? o.chosen - 1) - bounds.FINAL_LOWER_BOUND + 1) }, (_, i) => bounds.FINAL_LOWER_BOUND + i);
  for (const k of ks) {
    const tk = Date.now();
    timedOut = false;
    deadline = o.timeLimit_ms ? tk + o.timeLimit_ms : Infinity;
    const found = best(0, 0, xs.length - 1, ys.length - 1, k, need0, true);
    const r = { k, grid, ms: Date.now() - tk, nodes: stats.nodes, leafBuilds: stats.leafBuilds, memory_MB: mem() };
    if (found) {
      const v = validate(found);
      r.status = v.ok ? 'PROVEN_FEASIBLE' : 'FOUND_NOT_VALIDATED';
      r.proof_method = 'constructed partition, rebuilt and validated';
      r.completeness = 'n/a (a solution)';
      r.cover_m2 = found.cover;
      r.validation = v;
      r.parts = found.parts.map((p) => ({ x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, total: p.total, cover: p.cover, hole: p.v.hole, minRadius: p.v.minRadius }));
      results.push(r);
      o.log?.(r);
      if (v.ok && !found1) found1 = { k, found };
      if (!o.ks) break;
      continue;
    }
    if (timedOut) {
      r.status = 'SEARCH_NOT_EXHAUSTIVE';
      r.completeness = 'time limit';
    } else if (k <= GUILLOTINE_COMPLETE_MAX) {
      r.status = 'GRID_EXHAUSTIVE';
      r.completeness = `every partition into ≤ ${k} rectangles (all guillotine) with cuts on the ${grid} m raster`;
    } else {
      r.status = 'SEARCH_NOT_EXHAUSTIVE';
      r.completeness = `guillotine partitions on the ${grid} m raster searched completely; non-guillotine (pinwheel) partitions of ${k} rectangles not searched`;
    }
    r.proof_method = r.status === 'GRID_EXHAUSTIVE' ? 'GRID_EXHAUSTIVE' : 'branch and bound (partial)';
    r.proof_resolution = grid;
    r.reason = `no partition found giving ${k} valid loops ≤ 60 m covering ≥ ${need0.toFixed(2)} m²`;
    results.push(r);
    o.log?.(r);
  }
  // what is proven: the counts below the first one not excluded
  const excluded = (k) => k < bounds.FINAL_LOWER_BOUND || results.some((r) => r.k === k && r.status === 'GRID_EXHAUSTIVE');
  let lowerBound = 1;
  while (excluded(lowerBound)) lowerBound++;
  const candidate = found1 ? found1.k : o.chosen;
  const globally = candidate === bounds.FINAL_LOWER_BOUND;
  const withinModel = globally || lowerBound >= candidate;
  const solution = found1?.found ?? null;
  if (solution) for (const p of solution.parts) p.spiral = () => materialize(p);
  return {
    bounds,
    results,
    minimum_loop_count_lower_bound: lowerBound,
    continuous_lower_bound: bounds.FINAL_LOWER_BOUND,
    candidate_minimum: candidate,
    proof_scope: globally ? 'LOWER_BOUND — any geometry' : withinModel ? `GRID_EXHAUSTIVE — rectangle partitions, ${grid} m raster` : 'SEARCH_NOT_EXHAUSTIVE',
    provenGlobally: globally,
    provenWithinModel: withinModel,
    provenMinimum: withinModel,
    minimum: candidate,
    improved: !!found1 && found1.k < o.chosen,
    solution,
    stats: { ...stats, ms: Date.now() - t0, grid, memory_MB: mem() },
  };
}

/**
 * The cover a region must give at least so that its zone can still reach the zone requirement —
 * the other regions covering all of their floor (a relaxation: the sum over the regions never
 * exceeds the zone requirement).
 */
export function regionCoverMin(zoneArea, regionArea, coverMin = ENGINEERING_FINAL_COVERAGE) {
  return Math.max(0, coverMin * zoneArea - (zoneArea - regionArea)) / regionArea;
}
