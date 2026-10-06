// UFH Coverage Router — Phase 6 reopen: ROOM SEARCH — minimum loop count, then the closure.
//
// PRIMARY: the minimum number of VALID loops of a room. A loop is valid only when (hard):
//   total = heating + supply + return (the lead budget, ctx.leadTo, holds the drop) ≤ 60 m;
//   a continuous two-path spiral (generators of steps 1–5, no serpentine); R ≥ RMIN; clearances
//   (inside the generators); its own region covered ≥ ENGINEERING_FINAL_COVERAGE; largest gap ≤
//   MAX_LARGEST_GAP; both ends on the room's outline; a VALID TERMINAL CLOSURE — a residual only
//   in the terminal closure, and that closure along the side strip (the reference) — a spiral
//   without any residual (exact width or a rest thinner than MIN_RESIDUAL_CLOSURE_SPACING) has no
//   residual closure and is valid.
// SECONDARY (only within the minimum count): coverage, largest gap, residual terminal strip
//   (uncovered floor), real lead length, heating pipe, balance of the loop lengths.
//
// MODEL (declared): the room (a rectilinear polygon) is cut by STRAIGHT FULL CUTS along raster
// lines — every LOOP_CUT_GRID from the bounding box's low side plus the polygon's own vertex lines —
// recursively (guillotine on the polygon): a cut splits the current piece along the whole line
// through it; the pieces may be notched (non-rectangular). Every piece is one loop. For every
// piece EVERY generator variant is built: start corner × orientation / winding (the mirror) ×
// terminal side × ρ (every rest width between parallel sides) × closure mode (none / centre
// residual / side residual) × ring count × centre type — measured where it lies. Each candidate
// that fails is recorded with its reason.
//
// Status per k: PROVEN_INFEASIBLE (below the continuous lower bound — any geometry),
// GRID_EXHAUSTIVE (every partition of the declared model searched, none valid — NOT a proof outside
// the model), PROVEN_FEASIBLE (a valid partition built and measured), SEARCH_NOT_EXHAUSTIVE (time
// limit), NOT_RUN.

import * as G from './geom.js';
import { bestSpiral } from './spiralgen.js';
import { obstacleSpiral, measure } from './obstaclespiral.js';
import { loopLowerBounds } from './loopproof.js';
import { validateLoopLength } from './loopplanner.js';
import { referenceCheck, PHASE6_REFERENCE_MISMATCH } from './phase6reference.js';
import { MAX_LOOP_M, LOOP_LENGTH_EPS, MAX_LARGEST_GAP, ENGINEERING_FINAL_COVERAGE, RMIN_CHECK, LOOP_CUT_GRID, MIN_RESIDUAL_CLOSURE_SPACING, SPACING_TOL } from './criteria.js';

const lengthOk = (t) => t <= MAX_LOOP_M + LOOP_LENGTH_EPS;
const q4 = (v) => Math.round(v * 1e4) / 1e4;

/** The rest widths of a rectilinear piece: every distance between two parallel sides, mod s. */
export function restWidths(shape, s) {
  const out = {};
  for (const axis of ['x', 'y']) {
    const R = shape.outer;
    const cs = [...new Set(R.filter((p, i) => Math.abs(p[axis] - R[(i + 1) % R.length][axis]) < 1e-9).map((p) => Math.round(p[axis] * 1e6) / 1e6))];
    const set = new Set();
    for (const a of cs) for (const b of cs) if (b > a + 1e-9) set.add(q4(b - a - s * Math.floor((b - a) / s + 1e-9)));
    out[axis] = [...set].sort((u, v) => u - v);
  }
  return out;
}

/** Can a side residual exist in this piece at all (some rest width MIN ≤ ρ < s)? */
export const sideResidualPossible = (shape, s) => {
  const w = restWidths(shape, s);
  return [...w.x, ...w.y].some((r) => r >= MIN_RESIDUAL_CLOSURE_SPACING - 1e-9 && r < s - SPACING_TOL);
};

/**
 * Every spiral variant of one piece (joint: start × mirror × side × ρ × closure × rings × centre),
 * measured on the piece. exitOk / edgeOk: the ends leave through the room's outline.
 */
export function pieceVariants(shape, s, o) {
  const out = [];
  const seen = new Set();
  const area = G.area([shape]);
  const add = (sp, mirrored) => {
    if (!sp?.ok || !sp.heating) return;
    const key = `${sp.heatingLength.toFixed(6)}|${sp.supply.x.toFixed(4)},${sp.supply.y.toFixed(4)}|${sp.ret.x.toFixed(4)},${sp.ret.y.toFixed(4)}|${sp.residualSpacing ?? '-'}|${sp.closureSide ?? '-'}`;
    if (seen.has(key)) return;
    seen.add(key);
    const m = sp.uncovered !== undefined && sp.largestHole !== undefined ? sp : measure({ heating: sp.heating }, s, [shape]);
    out.push({ sp, mirrored: !!(sp.mirrored ?? mirrored), uncovered: m.uncovered, hole: m.largestHole, area });
  };
  const bb = G.bbox(shape.outer);
  const isRect = !(shape.holes ?? []).length && Math.abs(area - (bb.x1 - bb.x0) * (bb.y1 - bb.y0)) < 1e-6;
  // (1) the convex generator (rectangles), every start corner
  if (isRect) {
    const R = [{ x: bb.x0, y: bb.y0 }, { x: bb.x1, y: bb.y0 }, { x: bb.x1, y: bb.y1 }, { x: bb.x0, y: bb.y1 }];
    const b = bestSpiral(R, s, { r: o.r, exitOk: o.exitOk, maxHole: Infinity });
    add(b, false);
  }
  // (2) the seamed generator with every residual spec (centre ρ, side X × ρ) and the plain one,
  // every start corner and ring count, and (3) its mirror (the other winding / orientation)
  const runs = [];
  const M = (p) => ({ x: -p.x, y: p.y });
  for (const mir of [false, true]) {
    const ring = (Rg) => (mir ? Rg.map(M).reverse() : Rg);
    const sh = { outer: ring(shape.outer), holes: (shape.holes ?? []).map(ring) };
    const res = obstacleSpiral(sh, s, {
      r: o.r,
      exitOk: o.exitOk && ((q) => o.exitOk({ ...q, supply: mir ? M(q.supply) : q.supply, ret: mir ? M(q.ret) : q.ret })),
      edgeOk: o.edgeOk && ((a, b) => (mir ? o.edgeOk(M(b), M(a)) : o.edgeOk(a, b))),
      residual: true,
      returnAll: true,
      measure: o.measure ?? 3,
      groupByStart: true,
      maxSeams: 3,
    });
    runs.push({ mir, ok: res.ok, n: res.ok ? res.ranked.length : 0 });
    if (!res.ok) continue;
    for (const x of res.ranked) {
      if (!mir) {
        add(x, false);
        continue;
      }
      const flip = (n) => ({ left: 'right', right: 'left' })[n] ?? n;
      add(
        {
          ...x,
          mirrored: true,
          path: x.path.map(M),
          heating: x.heating.map(M),
          supply: M(x.supply),
          ret: M(x.ret),
          region: ring(x.region),
          ...(x.residual?.side ? { residual: { ...x.residual, side: flip(x.residual.side) }, closureSide: flip(x.residual.side) } : {}),
          uncovered: undefined,
          largestHole: undefined,
        },
        true,
      );
    }
  }
  // (the centre closures of closure.js are the same generator restricted to one corner — every
  // one of them is among the variants above already)
  return { variants: out, runs, isRect };
}

/**
 * Evaluate the variants of a piece: hard constraints, reasons for every rejection, the valid
 * ones in the secondary order (coverage, gap, uncovered, lead, pipe).
 */
export function evaluatePiece(shape, s, o) {
  const { variants, runs, isRect } = pieceVariants(shape, s, o);
  const area = G.area([shape]);
  const sidePossible = sideResidualPossible(shape, s);
  const rejected = {};
  const reject = (why) => (rejected[why] = (rejected[why] ?? 0) + 1);
  const valid = [];
  for (const v of variants) {
    const sp = v.sp;
    const supplyLead = sp.leadIn + o.leadTo(sp.supply);
    const returnLead = sp.leadOut + o.leadTo(sp.ret);
    const total = sp.heatingLength + supplyLead + returnLead;
    const cover = 1 - v.uncovered / area;
    const minR = sp.minBend ?? G.minBendRadius(sp.path).radius;
    const ref = referenceCheck({ shape, spiral: sp }, s);
    const terminalValid = ref.status !== PHASE6_REFERENCE_MISMATCH;
    const row = { v, total, supplyLead, returnLead, cover, minR, ref, terminalValid, closure: sp.residual ? (sp.residual.side ? `side:${sp.residual.side}` : 'centre') : 'none', rho: sp.residualSpacing ?? null, start: sp.start, mirrored: v.mirrored, centre: sp.centre };
    if (!lengthOk(total)) reject('total > 60 m');
    else if (v.hole > MAX_LARGEST_GAP + 1e-9) reject('largest gap > limit');
    else if (cover < ENGINEERING_FINAL_COVERAGE) reject('coverage < 85 %');
    else if (minR < RMIN_CHECK) reject('R < RMIN');
    else if (!terminalValid) reject('terminal closure not on the side (centre residual)');
    else valid.push(row);
  }
  // secondary order: coverage (0.1 %), largest gap (0.01 m²), the side closure before none (the
  // reference: the final pass over the side strip, when it is valid and loses nothing above), the
  // uncovered floor (the residual strip), lead, pipe
  const sideRank = (x) => (x.closure.startsWith('side:') ? 0 : 1);
  valid.sort((a, b) => Math.round(b.cover * 1000) - Math.round(a.cover * 1000) || Math.round(a.v.hole * 100) - Math.round(b.v.hole * 100) || sideRank(a) - sideRank(b) || a.v.uncovered - b.v.uncovered || a.supplyLead + a.returnLead - (b.supplyLead + b.returnLead) || a.v.sp.heatingLength - b.v.sp.heatingLength);
  return { area, isRect, sidePossible, rest: restWidths(shape, s), variants: variants.length, runs, rejected, valid, best: valid[0] ?? null };
}

/** Straight full cuts of a piece along x = c or y = c: the pieces (each connected, non-empty). */
function cutPiece(piece, axis, c) {
  const bb = G.bbox(piece.outer);
  if (axis === 'x' ? c <= bb.x0 + 1e-9 || c >= bb.x1 - 1e-9 : c <= bb.y0 + 1e-9 || c >= bb.y1 - 1e-9) return null;
  const big = 1e3;
  const lo = axis === 'x' ? { outer: [{ x: -big, y: -big }, { x: c, y: -big }, { x: c, y: big }, { x: -big, y: big }], holes: [] } : { outer: [{ x: -big, y: -big }, { x: big, y: -big }, { x: big, y: c }, { x: -big, y: c }], holes: [] };
  const hi = axis === 'x' ? { outer: [{ x: c, y: -big }, { x: big, y: -big }, { x: big, y: big }, { x: c, y: big }], holes: [] } : { outer: [{ x: -big, y: c }, { x: big, y: c }, { x: big, y: big }, { x: -big, y: big }], holes: [] };
  const parts = [...G.intersection([piece], [lo]), ...G.intersection([piece], [hi])].filter((sh) => G.area([sh]) > 1e-6);
  return parts.length >= 2 ? parts.map((sh) => ({ outer: sh.outer, holes: sh.holes ?? [] })) : null;
}

/**
 * Minimum valid loop count of a room, then the best partition at that count.
 * @param U    the room's usable area (one rectilinear polygon)
 * @param s    heating pitch
 * @param ctx  { leadTo(p) (supply / return lead incl. drop), r, grid, kMax, timeLimit_ms, measure }
 */
export function searchRoom(U, s, ctx) {
  const t0 = Date.now();
  const region = G.asRegion(U);
  if (region.length !== 1) throw new Error('searchRoom: one connected usable area expected');
  const P = { outer: region[0].outer, holes: region[0].holes ?? [] };
  const outline = [{ outer: P.outer, holes: [] }];
  const onWall = (q) => G.distToRegionBoundary(q, outline) < 1e-6;
  const exitOk = (q) => onWall(q.supply) && onWall(q.ret);
  const edgeOk = (a, b) => onWall({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const grid = ctx.grid ?? LOOP_CUT_GRID;
  const deadline = ctx.timeLimit_ms ? t0 + ctx.timeLimit_ms : Infinity;
  const area = G.area([P]);
  // the shortest lead anywhere on the outline (lower bound of a loop's two leads)
  const samples = G.densify([...P.outer, P.outer[0]], 0.05);
  const leadMin = Math.min(...samples.map((q) => ctx.leadTo(q)));
  const bounds = loopLowerBounds({ area, s, leadMin });
  // raster lines: every `grid` from the low side, and the polygon's own vertex lines
  const bb = G.bbox(P.outer);
  const lines = (axis, a, b) => {
    const v = new Set(P.outer.map((p) => Math.round(p[axis] * 1e6) / 1e6));
    for (let x = a + grid; x < b - 1e-9; x += grid) v.add(Math.round(x * 1e6) / 1e6);
    return [...v].filter((x) => x > a + 1e-9 && x < b - 1e-9).sort((u, w) => u - w);
  };
  const xs = lines('x', bb.x0, bb.x1);
  const ys = lines('y', bb.y0, bb.y1);
  // one piece as one loop — memo by geometry
  const memo = new Map();
  const keyOf = (pc) => pc.outer.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).sort().join(';');
  const minW = 3 * s + (ctx.r ?? Math.max(0.072, s / 2));
  let leafEvals = 0;
  let leafSkipped = 0;
  const leaf = (pc) => {
    const k = keyOf(pc);
    if (memo.has(k)) return memo.get(k);
    const pa = G.area([pc]);
    // exact pre-checks (no candidate can pass them): too narrow for two rings and the bends; no
    // outline access; even its whole area covered needs more pipe than 60 m minus its leads
    let out;
    const pb = G.bbox(pc.outer);
    const lm = Math.min(...G.densify([...pc.outer, pc.outer[0]], 0.05).filter(onWall).map((q) => ctx.leadTo(q)), Infinity);
    const needPipe = (ENGINEERING_FINAL_COVERAGE * pa - Math.PI * (s / 2 + 0.003) ** 2) / (s + 0.006);
    if (Math.min(pb.x1 - pb.x0, pb.y1 - pb.y0) < minW - 1e-9) out = { valid: [], rejected: { 'narrower than a two-ring spiral': 1 }, pre: 'narrow' };
    else if (!isFinite(lm)) out = { valid: [], rejected: { 'no wall: no lead route': 1 }, pre: 'no_wall' };
    else if (needPipe + 2 * lm > MAX_LOOP_M + LOOP_LENGTH_EPS) out = { valid: [], rejected: { 'over 60 m for 85 % even at best (lower bound)': 1 }, pre: 'length_bound' };
    else {
      leafEvals++;
      out = evaluatePiece(pc, s, { r: ctx.r, exitOk, edgeOk, leadTo: ctx.leadTo, measure: ctx.measure });
    }
    if (out.pre) leafSkipped++;
    memo.set(k, out);
    return out;
  };
  // the partitions of the model with k pieces (generator: guillotine straight cuts)
  // the same length bound for a piece of k loops (the covered floor of every loop ≤ its pipe ×
  // (s + tol) + the end disc; every loop ≤ 60 m minus two leads to the piece's own outline): a piece
  // that cannot hold k loops is not split further
  const pieceLb = new Map();
  const canHold = (pc, k) => {
    const key = `${keyOf(pc)}#${k}`;
    if (pieceLb.has(key)) return pieceLb.get(key);
    const pa = G.area([pc]);
    const lm = Math.min(...G.densify([...pc.outer, pc.outer[0]], 0.05).filter(onWall).map((q) => ctx.leadTo(q)), Infinity);
    const need = (ENGINEERING_FINAL_COVERAGE * pa - k * Math.PI * (s / 2 + 0.003) ** 2) / (s + 0.006);
    const ok = isFinite(lm) && need <= k * (MAX_LOOP_M + LOOP_LENGTH_EPS - 2 * lm);
    pieceLb.set(key, ok);
    return ok;
  };
  function* partitions(pc, k) {
    if (k > 1 && !canHold(pc, k)) return;
    if (k === 1) {
      yield [pc];
      return;
    }
    const pb = G.bbox(pc.outer);
    for (const [axis, list] of [
      ['x', xs.filter((c) => c > pb.x0 + 1e-9 && c < pb.x1 - 1e-9)],
      ['y', ys.filter((c) => c > pb.y0 + 1e-9 && c < pb.y1 - 1e-9)],
    ])
      for (const c of list) {
        const parts = cutPiece(pc, axis, c);
        if (!parts || parts.length > k) continue;
        // distribute the remaining cuts over the pieces (every split of k over them)
        const n = parts.length;
        const splits = (rest, i) => (i === n - 1 ? [[rest]] : Array.from({ length: Math.max(0, rest - (n - i - 1)) }, (_, a) => a + 1).flatMap((a) => splits(rest - a, i + 1).map((t) => [a, ...t])));
        for (const ks of splits(k, 0)) {
          const sub = parts.map((p, i) => [...partitions(p, ks[i])]);
          const prod = (i) => (i === n ? [[]] : sub[i].flatMap((a) => prod(i + 1).map((b) => [...a, ...b])));
          yield* prod(0);
        }
      }
  }
  const results = [];
  if (bounds.FINAL_LOWER_BOUND > 1) results.push({ k: `1…${bounds.FINAL_LOWER_BOUND - 1}`, status: 'PROVEN_INFEASIBLE', reason: `continuous lower bound ${bounds.FINAL_LOWER_BOUND} (need ${bounds.neededCover_m2.toFixed(2)} m², ≤ ${bounds.perLoopHeatingMax.toFixed(2)} m heating per loop)` });
  let chosen = null;
  const kMax = ctx.kMax ?? bounds.FINAL_LOWER_BOUND + 2;
  for (let k = Math.max(1, bounds.FINAL_LOWER_BOUND); k <= kMax; k++) {
    const tk = Date.now();
    const seenPart = new Set();
    let tested = 0;
    let feasible = 0;
    let timedOut = false;
    const why = {};
    let best = null;
    // the best partition: secondary order
    const score = (rows) => {
      const covered = rows.reduce((a, r) => a + r.cover * r.v.area, 0);
      return [-Math.round((covered / area) * 1000), Math.round(Math.max(...rows.map((r) => r.v.hole)) * 100), rows.reduce((a, r) => a + r.v.uncovered, 0), rows.reduce((a, r) => a + r.supplyLead + r.returnLead, 0), rows.reduce((a, r) => a + r.v.sp.heatingLength, 0), Math.max(...rows.map((r) => r.total)) - Math.min(...rows.map((r) => r.total))];
    };
    const better = (a, b) => {
      for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-9) return a[i] < b[i];
      return false;
    };
    for (const parts of partitions(P, k)) {
      if (Date.now() > deadline) {
        timedOut = true;
        break;
      }
      const pk = parts.map(keyOf).sort().join('|');
      if (seenPart.has(pk)) continue;
      seenPart.add(pk);
      tested++;
      // the pieces one by one: the first without a valid loop rejects the partition (the others
      // need not be built)
      const ev = [];
      let bad = -1;
      for (const p of parts) {
        const e = leaf(p);
        ev.push(e);
        if (!e.valid.length) {
          bad = ev.length - 1;
          break;
        }
      }
      if (bad >= 0) {
        // the reason of the first piece without a valid loop (its most frequent rejection)
        const r = Object.entries(ev[bad].rejected).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'no spiral built';
        why[r] = (why[r] ?? 0) + 1;
        continue;
      }
      feasible++;
      const rows = ev.map((e) => e.valid[0]);
      const sc = score(rows);
      if (!best || better(sc, best.score)) best = { parts, rows, score: sc };
    }
    const r = { k, tested, feasible, ms: Date.now() - tk, rejectedPartitions: why };
    if (best) {
      r.status = 'PROVEN_FEASIBLE';
      // the count is proven (a valid partition built); the best one within it only if every
      // partition was searched
      r.secondaryOptimum = timedOut ? 'SEARCH_NOT_EXHAUSTIVE' : 'GRID_EXHAUSTIVE';
      r.best = best;
      results.push(r);
      chosen = { k, ...best };
      break;
    }
    r.status = timedOut ? 'SEARCH_NOT_EXHAUSTIVE' : 'GRID_EXHAUSTIVE';
    r.completeness = timedOut ? 'time limit' : `every partition of the declared model (guillotine straight cuts on the ${grid} m raster + vertex lines) into ${k} loops searched`;
    results.push(r);
    if (timedOut) break;
  }
  for (let k = (chosen?.k ?? kMax) + 1; k <= kMax; k++) results.push({ k, status: 'NOT_RUN', reason: chosen ? 'a smaller count is feasible' : 'beyond kMax' });
  return { bounds, results, chosen, leafEvals, leafSkipped, xs: xs.length, ys: ys.length, ms: Date.now() - t0, memo };
}

/**
 * The loops of a usable area from the room search (per connected shape): the minimum valid loop
 * count, the best partition at it — as loop objects of planLoops (lengths, validation).
 * A shape without a valid partition up to kMax gives no loop (its status says why).
 * @param ctx { leadTo, r, grid, kMax, timeLimit_ms, measure }
 */
export function planFromSearch(U, s, ctx) {
  const loops = [];
  const regions = [];
  for (const [i, sh] of G.asRegion(U).entries()) {
    const shape = { outer: sh.outer, holes: sh.holes ?? [] };
    const r = searchRoom([shape], s, ctx);
    const { memo, ...search } = r;
    regions.push({ label: `S${i + 1}`, search: { ...search, results: r.results.map(({ best, ...q }) => q) }, chosenLoops: r.chosen?.k ?? 0 });
    if (!r.chosen) continue;
    loops.push(...loopsOf(r.chosen.rows, r.chosen.parts, s, ctx.leadTo, { first: loops.length + 1, regionId: `S${i + 1}` }));
  }
  return { loops, regions };
}

/**
 * Loop objects of planLoops from chosen rows (evaluatePiece) and their pieces: lengths with the
 * explicit lead budget, the loop validation (lengths and geometry) of the planner.
 */
export function loopsOf(rows, parts, s, leadTo, { first = 1, regionId = 'S1' } = {}) {
  return rows.map((row, j) => {
    const sp = row.v.sp;
    const loop = {
      loopId: `L${first + j}`,
      regionId,
      kind: 'LOOP',
      startPoint: sp.supply,
      endPoint: sp.ret,
      heatingLength: sp.heatingLength,
      supplyLength: row.supplyLead,
      returnLength: row.returnLead,
      estimatedSupplyLead: leadTo(sp.supply),
      estimatedReturnLead: leadTo(sp.ret),
      totalLength: row.total,
      nominalSpacing: s,
      residualSpacing: sp.residualSpacing ?? null,
      spiral: sp,
      shape: parts[j],
      estimatedLead: true,
      search: { closure: row.closure, rho: row.rho, start: row.start, mirrored: row.mirrored, centre: row.centre, coverage: row.cover, largestGap_m2: row.v.hole, uncovered_m2: row.v.uncovered, minRadius_m: row.minR, reference: row.ref.status },
    };
    loop.remainingBudget = MAX_LOOP_M - loop.totalLength;
    loop.exceeds60 = !lengthOk(loop.totalLength);
    const v = validateLoopLength(loop, s);
    loop.status = v.status;
    loop.lengthValid = v.lengthValid;
    loop.geometryValid = v.geometryValid;
    loop.failed = v.failed;
    return loop;
  });
}
