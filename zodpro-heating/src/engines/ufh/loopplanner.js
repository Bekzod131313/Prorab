// UFH Coverage Router — step 6: LOOP_PLANNER (RAW_SPIRAL geometry → hydraulic LOOPs ≤ 60 m).
//
// REGION ≠ LOOP. A region's raw spiral longer than one loop allows is NEVER cut: a cut bifilar
// spiral is no spiral (two open ends inside the floor) and cutting it anywhere would leave a
// serpentine-like fragment. Instead the region is re-split into k parts (strips across it, the cut
// positions searched) and EVERY part gets its own continuous two-path spiral from the same
// generators (spiralgen / obstaclespiral) and the same centre closure (closure.js) — so every loop
// is a real spiral with the same hard geometry rules (R ≥ RMIN, spacing, clearance, no crossing).
//
// Budget first, not a check at the end:
//   loop total = supply lead + heating pipe + return lead ≤ MAX_LOOP_M (exact, no rounding)
//   supply / return lead = the spiral's own lead stub + the estimated route from the manifold
//   (ctx.leadTo(point): e.g. through the doors, rectilinear) — known before a split is chosen
//   k0 = ⌈raw heating / (MAX_LOOP_M − estimated leads)⌉ loops are tried first, then k0 + 1 …
//   (minimum loop count); the cut positions are balanced on the built spirals' exact lengths.
// Coverage counts the heating pipe only; leads count in the loop length only.
//
// Physical manifold outlets only: requiredLoops > availableOutlets → HYDRAULIC_LOOP_INVALID
// ('outlet_shortage'); no virtual outlets. RAW_GEOMETRY status and HYDRAULIC status are separate.

import * as G from './geom.js';
import { bestSpiral } from './spiralgen.js';
import { obstacleSpiral, minPipeGap, zonedGap, measure } from './obstaclespiral.js';
import { closeCentre } from './closure.js';
import { spiralRegions } from './decompose.js';
import { checkRawSet } from './rawcheck.js';
import { MAX_LOOP_M, RMIN_CHECK, SPACING_TOL, MIN_RESIDUAL_CLOSURE_SPACING, LOOP_LENGTH_EPS, MAX_LARGEST_GAP, ROWS_TRY_UNCOVERED_SHARE } from './criteria.js';

/** Loop length rule: exact, the only tolerance is the floating point representation (1 nm). */
export const lengthOk = (total) => total <= MAX_LOOP_M + LOOP_LENGTH_EPS;

/**
 * Validates one loop: lengths (supply + heating + return ≤ 60 m) and its geometry.
 * @param loop  { heatingLength, supplyLength, returnLength, spiral?, shape? }
 * @returns { status: 'LOOP_VALID' | 'LOOP_INVALID', lengthValid, geometryValid, checks, failed[] }
 */
export function validateLoopLength(loop, s) {
  const total = loop.heatingLength + loop.supplyLength + loop.returnLength;
  const checks = {
    heatingLength: loop.heatingLength > 0,
    supplyLength: loop.supplyLength >= 0,
    returnLength: loop.returnLength >= 0,
    totalLength: lengthOk(total),
  };
  const sp = loop.spiral;
  if (sp) {
    checks.bendRadius = G.minBendRadius(sp.path).radius >= RMIN_CHECK;
    const lean = G.simplifyPath(sp.path, 0.0005);
    if (sp.residual) {
      const [t0, t1] = sp.residual.terminal;
      const z = zonedGap(lean, s, (q) => q >= t0 && q <= t1);
      checks.spacing = z.nom >= s - SPACING_TOL && z.res >= MIN_RESIDUAL_CLOSURE_SPACING - SPACING_TOL;
    } else checks.spacing = minPipeGap(lean, s) >= s - SPACING_TOL;
    if (loop.shape) {
      const reg = [loop.shape];
      checks.clearance = G.densify(G.simplifyPath(sp.heating, 0.0005), 0.05).every((q) => G.pointInRegion(q, reg) && G.distToRegionBoundary(q, reg) >= s / 2 - SPACING_TOL);
    }
    checks.crossing = selfCrossings(sp.path) === 0;
  }
  const failed = Object.entries(checks)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  const lengthValid = ['heatingLength', 'supplyLength', 'returnLength', 'totalLength'].every((k) => checks[k]);
  const geometryValid = !failed.some((k) => ['bendRadius', 'spacing', 'clearance', 'crossing'].includes(k));
  return { status: failed.length ? 'LOOP_INVALID' : 'LOOP_VALID', lengthValid, geometryValid, total, checks, failed };
}

function selfCrossings(path) {
  let n = 0;
  const segs = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    segs.push({ a, b, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) });
  }
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 2; j < segs.length; j++) {
      const A = segs[i];
      const B = segs[j];
      if (A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0) continue;
      if (G.segmentsIntersect(A.a, A.b, B.a, B.b, 1e-14) && Math.hypot(A.b.x - B.a.x, A.b.y - B.a.y) > 1e-9) n++;
    }
  return n;
}

/** A raw spiral moved by (dx, dy) (arc lengths, lengths and measures do not change). */
function moveSpiral(sp, dx, dy) {
  const M = (p) => ({ x: p.x + dx, y: p.y + dy });
  const R = (r) => r && r.map(M);
  return {
    ...sp,
    path: sp.path.map(M),
    heating: sp.heating.map(M),
    supply: M(sp.supply),
    ret: M(sp.ret),
    region: R(sp.region),
    seamed: R(sp.seamed),
    seams: (sp.seams ?? []).map((q) => ({ ...q, a: M(q.a), b: M(q.b) })),
    unc: sp.unc && sp.unc.map((q) => ({ outer: R(q.outer), holes: (q.holes ?? []).map(R) })),
  };
}

/**
 * Plans the hydraulic loops of a zone.
 * @param res  spiralRegions() result (REGIONS with RAW_SPIRALs)
 * @param U    usable heating area (its outer outline = walls: loop ends leave there)
 * @param s    nominal spacing
 * @param ctx  { leadTo(point) → m (estimated route manifold → point), manifold: { name, outlets } | null,
 *               toward (manifold side), r }
 * @returns { kind: 'LOOP_PLAN', loops, regions, requiredLoops, availableOutlets, status, reasons,
 *            rawGeometryStatus, check (raw-set check of all loop spirals together) }
 */
export function planLoops(res, U, s, ctx) {
  const usable = G.asRegion(U);
  const outer = usable.map((sh) => ({ outer: sh.outer, holes: [] }));
  const onWall = (q) => G.distToRegionBoundary(q, outer) < 1e-6;
  const exitOk = (q) => onWall(q.supply) && onWall(q.ret);
  const edgeOk = (a, b) => onWall({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const rawCheck = checkRawSet(res, U, s);
  const leadsOf = (sp) => ({ supply: sp.leadIn + ctx.leadTo(sp.supply), ret: sp.leadOut + ctx.leadTo(sp.ret) });
  const totalOf = (sp) => {
    const l = leadsOf(sp);
    return sp.heatingLength + l.supply + l.ret;
  };
  const loops = [];
  const regions = [];
  // narrowest part with a spiral (two rings and the bends); one spiral per part (memo)
  const minW = 3 * s + (ctx.r ?? Math.max(0.072, s / 2));
  const memo = new Map();
  const rectMemo = new Map();
  const fits = (p) => !!p.pieces && p.pieces.every((q) => lengthOk(q.total));
  for (const x of res.regions) {
    if (!x.spiral) {
      regions.push({ label: x.label, status: 'INVALID_REGION', loops: [] });
      continue;
    }
    const shape = { outer: x.poly, holes: x.holes ?? [] };
    const plan = planRegion(x, shape);
    regions.push({ label: x.label, rawSpiral_m: x.spiral.heatingLength, exceeds60: x.spiral.heatingLength > MAX_LOOP_M, ...plan.summary });
    for (const p of plan.parts) {
      const l = leadsOf(p.spiral);
      const loop = {
        loopId: `L${loops.length + 1}`,
        regionId: x.label,
        kind: 'LOOP',
        startPoint: p.spiral.supply,
        endPoint: p.spiral.ret,
        heatingLength: p.spiral.heatingLength,
        supplyLength: l.supply,
        returnLength: l.ret,
        estimatedSupplyLead: ctx.leadTo(p.spiral.supply),
        estimatedReturnLead: ctx.leadTo(p.spiral.ret),
        totalLength: p.spiral.heatingLength + l.supply + l.ret,
        nominalSpacing: s,
        residualSpacing: p.spiral.residualSpacing ?? null,
        spiral: p.spiral,
        shape: p.shape,
      };
      loop.remainingBudget = MAX_LOOP_M - loop.totalLength;
      loop.exceeds60 = !lengthOk(loop.totalLength);
      const v = validateLoopLength(loop, s);
      loop.status = v.status;
      loop.lengthValid = v.lengthValid;
      loop.geometryValid = v.geometryValid;
      loop.failed = v.failed;
      loops.push(loop);
    }
  }

  // one region → its loops
  function planRegion(x, shape) {
    const sp0 = x.spiral;
    if (lengthOk(totalOf(sp0))) return { parts: [{ spiral: sp0, shape }], summary: { loopCount: 1, split: null, tried: [] } };
    const r = planShape(shape, sp0.heatingLength, 0);
    if (!r) return { parts: [{ spiral: sp0, shape }], summary: { loopCount: 1, split: null, tried: [], failed: 'no valid split within 60 m' } };
    // the centre closure of loops not closed yet — only within their 60 m budget
    const parts = r.parts.map((p) => {
      if (!p.open) return { spiral: p.spiral, shape: p.shape };
      const c = closeCentre(p.shape, p.spiral, s, { r: ctx.r, toward: ctx.toward, exitOk, edgeOk, accept: (q) => lengthOk(totalOf(q)) });
      return { spiral: c.changed ? c.spiral : p.spiral, shape: p.shape };
    });
    return { parts, summary: { loopCount: parts.length, split: r.split, tried: r.tried } };
  }

  /**
   * One part of a region (shape ∩ rectangle R): its own spiral(s), exits on the walls.
   * Plain generators first (the convex one and the seamed one — odd ring counts); a part whose
   * nominal spiral is already over 60 m is out (a closure only adds pipe); a part leaving a patch
   * gets its centre closure now; round an obstacle one spiral may not fit: the part's minimum
   * spiral regions (step 4), each one loop.
   */
  function part(shape, R) {
    const key = R.map((q) => q.x.toFixed(3) + ',' + q.y.toFixed(3)).join('|') + '#' + shape.outer.length;
    if (memo.has(key)) return memo.get(key);
    const b = G.bbox(R);
    let out;
    const sh = G.intersection([shape], [{ outer: R, holes: [] }]);
    // a plain rectangle: its spiral depends only on its size and which sides are walls — built once,
    // moved to its place (the leads, position dependent, are measured there exactly)
    const isRect = sh.length === 1 && !(sh[0].holes ?? []).length && Math.abs(G.area(sh) - (b.x1 - b.x0) * (b.y1 - b.y0)) < 1e-6;
    if (isRect && Math.min(b.x1 - b.x0, b.y1 - b.y0) >= minW - 1e-9) {
      const side = (p, q) => [0.1, 0.5, 0.9].every((f) => onWall({ x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f }));
      const C = [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];
      const pat = C.map((p, i) => (side(p, C[(i + 1) % 4]) ? 1 : 0)).join('');
      const tkey = `R${(b.x1 - b.x0).toFixed(3)}x${(b.y1 - b.y0).toFixed(3)}|${pat}`;
      if (!rectMemo.has(tkey)) {
        const tb0 = Date.now();
        // built at the origin with the same wall pattern
        const R0 = [{ x: 0, y: 0 }, { x: b.x1 - b.x0, y: 0 }, { x: b.x1 - b.x0, y: b.y1 - b.y0 }, { x: 0, y: b.y1 - b.y0 }];
        const walls0 = R0.map((p, i) => [p, R0[(i + 1) % 4]]).filter((_, i) => pat[i] === '1');
        const on0 = (q) => walls0.some(([a, c]) => G.segDist(q, a, c) < 1e-6);
        const ex0 = (q) => on0(q.supply) && on0(q.ret);
        const eo0 = (a, c) => on0({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 });
        const tw = ctx.toward ? { x: ctx.toward.x - b.x0, y: ctx.toward.y - b.y0 } : undefined;
        const sh0 = { outer: R0, holes: [] };
        const cands = [bestSpiral(R0, s, { r: ctx.r, toward: tw, exitOk: ex0 })];
        if (!cands[0].ok || measure({ heating: cands[0].heating }, s, [sh0]).largestHole > MAX_LARGEST_GAP) cands.push(obstacleSpiral(sh0, s, { r: ctx.r, toward: tw, exitOk: ex0, edgeOk: eo0 }));
        const okc = cands.filter((q) => q.ok).map((q) => ({ sp: q, m: measure({ heating: q.heating }, s, [sh0]) }));
        okc.sort((x, y) => x.m.largestHole - y.m.largestHole || x.m.uncovered - y.m.uncovered);
        // a patch: the centre closure — first without residual spacing (mirror, ring counts), the
        // residual search only when that is not enough; run lazily (only for a part whose plain
        // spiral already fits the budget where it lies — a closure only adds pipe)
        const entry = { plain: okc[0] ?? null, closed: new Map(), altList: null };
        // every valid variant of the part (start corners, ring counts, centre types), measured —
        // which one is best depends on where the part lies (its leads)
        entry.alts = () => {
          if (!entry.altList) {
            const r = obstacleSpiral(sh0, s, { r: ctx.r, toward: tw, exitOk: ex0, edgeOk: eo0, returnAll: true, measure: 2, groupByStart: true });
            entry.altList = r.ok ? r.ranked.map((x) => ({ sp: x, m: { largestHole: x.largestHole, uncovered: x.uncovered } })) : [];
          }
          return entry.altList;
        };
        // the centre closures of the part from one of its variants (computed once, best first; first
        // without residual spacing — mirror, ring counts — then with it): where the part lies, the
        // first one that keeps the 60 m budget there is used (= a closure run with that budget)
        entry.closeLists = new Map();
        entry.closeList = (from, residual) => {
          const k2 = `${[entry.plain, ...entry.alts()].indexOf(from)}|${residual}`;
          if (!entry.closeLists.has(k2)) {
            const c = closeCentre(sh0, from.sp, s, { r: ctx.r, toward: tw, exitOk: ex0, edgeOk: eo0, residual, returnAll: true });
            entry.closeLists.set(k2, (c.candidates ?? []).map((x) => ({ sp: x, m: { largestHole: x.largestHole, uncovered: x.uncovered }, closed: true })));
          }
          return entry.closeLists.get(k2);
        };
        rectMemo.set(tkey, entry);
        if (process.env.LP_DEBUG) console.error('build', tkey, Date.now() - tb0, 'ms');
      }
      const entry = rectMemo.get(tkey);
      const at = (c) => totalOf(moveSpiral(c.sp, b.x0, b.y0));
      const good = (list) => list.filter((c) => c.m.largestHole <= MAX_LARGEST_GAP && lengthOk(at(c)));
      let pick = null;
      if (!entry.plain) out = { reason: 'no valid spiral (narrow / bend / no wall exit)' };
      else {
        // the plain spiral where it lies; else every variant of the part there (shortest loop of the
        // best coverage); else the centre closure within the budget
        let ok = good([entry.plain]);
        if (!ok.length) ok = good(entry.alts());
        if (ok.length) pick = ok.sort((x, y) => Math.round((x.m.uncovered - y.m.uncovered) * 10) || at(x) - at(y))[0];
        else {
          const fitting = [entry.plain, ...entry.alts()].filter((c) => lengthOk(at(c))).sort((x, y) => x.m.largestHole - y.m.largestHole);
          if (fitting.length) {
            for (const residual of [false, true]) {
              pick = good(entry.closeList(fitting[0], residual))[0] ?? null;
              if (pick) break;
            }
            if (!pick) out = { reason: 'uncovered_patch' };
          } else out = { reason: 'over60' };
        }
      }
      if (pick) {
        const sp = moveSpiral(pick.sp, b.x0, b.y0);
        out = { pieces: [{ spiral: sp, shape: { outer: C, holes: [] }, total: totalOf(sp), uncovered: pick.m.uncovered, open: !pick.closed }] };
      }
      memo.set(key, out);
      return out;
    }
    if (Math.min(b.x1 - b.x0, b.y1 - b.y0) < minW - 1e-9) out = { reason: 'narrow' };
    else if (sh.length !== 1) out = { reason: 'split_by_obstacle' };
    else {
      const pieceShape = { outer: sh[0].outer, holes: sh[0].holes ?? [] };
      const rect = !pieceShape.holes.length && G.area(sh) > (b.x1 - b.x0) * (b.y1 - b.y0) - 1e-6;
      const cands = [];
      if (rect) cands.push(bestSpiral(R, s, { r: ctx.r, toward: ctx.toward, exitOk }));
      if (!rect || !cands[0].ok || measure({ heating: cands[0].heating }, s, [pieceShape]).largestHole > MAX_LARGEST_GAP) cands.push(obstacleSpiral(pieceShape, s, { r: ctx.r, toward: ctx.toward, exitOk, edgeOk }));
      const okc = cands.filter((q) => q.ok).map((q) => ({ sp: q, m: measure({ heating: q.heating }, s, [pieceShape]) }));
      okc.sort((a, b) => a.m.largestHole - b.m.largestHole || a.m.uncovered - b.m.uncovered);
      let piece;
      if (okc.length && !lengthOk(totalOf(okc[0].sp))) piece = { reason: 'over60', total: totalOf(okc[0].sp) };
      else {
        if (okc.length && okc[0].m.largestHole > MAX_LARGEST_GAP) {
          const c = closeCentre(pieceShape, okc[0].sp, s, { r: ctx.r, toward: ctx.toward, exitOk, edgeOk, accept: (q) => lengthOk(totalOf(q)) });
          if (c.changed) okc.unshift({ sp: c.spiral, m: { largestHole: c.new.largestHole, uncovered: c.new.uncovered }, closed: true });
        }
        if (!okc.length) piece = { reason: 'no valid spiral (narrow / bend / no wall exit)' };
        else {
          const { sp, m } = okc[0];
          // a part leaving a patch over the limit is no valid loop (coverage is never traded for length)
          piece = m.largestHole > MAX_LARGEST_GAP ? { reason: 'uncovered_patch', hole: m.largestHole } : { spiral: sp, shape: pieceShape, total: totalOf(sp), uncovered: m.uncovered, open: !okc[0].closed };
        }
      }
      if (piece.spiral) out = { pieces: [piece] };
      else if (!rect && piece.reason !== 'over60') {
        const sub = spiralRegions([pieceShape], s, { r: ctx.r, toward: ctx.toward, walls: outer, closure: false });
        const pieces = sub.regions.map((y) => {
          if (!y.spiral) return null;
          const yShape = { outer: y.poly, holes: y.holes ?? [] };
          const m = measure({ heating: y.spiral.heating }, s, [yShape]);
          return m.largestHole > MAX_LARGEST_GAP ? null : { spiral: y.spiral, shape: yShape, total: totalOf(y.spiral), uncovered: m.uncovered, open: true };
        });
        out = sub.ok && pieces.every(Boolean) ? { pieces } : piece;
      } else out = piece;
    }
    memo.set(key, out);
    return out;
  }

  /**
   * Loops of a shape: strips across it (greedy packing from both ends, both directions — the
   * fewest strips; a single cut scanned when two may do), and at the top level also two rows
   * first (each row keeps a wall) with strips in each row — squarer loops in big rooms.
   * @returns { parts, loops, uncovered, max, leads, spread, split, tried } | null
   */
  function planShape(shape, heatingEst, depth) {
    const bb = G.bbox(shape.outer);
    const rectOf = (axis, a0, a1) => (axis === 'x' ? [{ x: a0, y: bb.y0 }, { x: a1, y: bb.y0 }, { x: a1, y: bb.y1 }, { x: a0, y: bb.y1 }] : [{ x: bb.x0, y: a0 }, { x: bb.x1, y: a0 }, { x: bb.x1, y: a1 }, { x: bb.x0, y: a1 }]);
    const range = (axis) => (axis === 'x' ? [bb.x0, bb.x1] : [bb.y0, bb.y1]);
    const tried = [];
    // lower bound of the loop count: the pipe within the budget left by the shortest leads
    const wallPts = G.densify([...shape.outer, shape.outer[0]], 0.1).filter(onWall);
    const leadMin = wallPts.length ? Math.min(...wallPts.map((q) => ctx.leadTo(q))) : 0;
    const kLow = Math.max(1, Math.ceil(heatingEst / (MAX_LOOP_M - 2 * leadMin)));
    const whole = part(shape, rectOf('x', bb.x0, bb.x1));
    if (fits(whole)) return summarize([{ parts: whole.pieces, split: null }])[0];
    const evalCuts = (cuts, axis) => {
      const [lo, hi] = range(axis);
      const edges = [lo, ...cuts, hi];
      const parts = [];
      for (let i = 0; i < edges.length - 1; i++) {
        const p = part(shape, rectOf(axis, edges[i], edges[i + 1]));
        if (!fits(p)) return null;
        parts.push(...p.pieces);
      }
      return { parts, split: { axis, cuts } };
    };
    const greedy = (axis, dir) => {
      const [lo, hi] = range(axis);
      const cuts = [];
      let pos = dir > 0 ? lo : hi;
      const strip = (w) => part(shape, dir > 0 ? rectOf(axis, pos, pos + w) : rectOf(axis, pos - w, pos));
      for (let guard = 0; guard < 40; guard++) {
        const rest = dir > 0 ? hi - pos : pos - lo;
        if (fits(strip(rest))) return { cuts: cuts.sort((x, y) => x - y), first: cuts.length ? (dir > 0 ? cuts[0] : cuts[cuts.length - 1]) : null };
        const wMax = Math.floor((rest - minW) / 0.05) * 0.05;
        if (wMax < minW) return null;
        // width estimate from the budget (pipe ≈ area / s), then the widest strip that works from
        // 10 % + 0.4 m above to 20 % + 0.4 m below it, from the widest down (the loop length is not
        // monotone in the width — ring counts and start corners jump)
        const [p0, p1] = axis === 'x' ? [{ x: pos, y: bb.y0 }, { x: pos, y: bb.y1 }] : [{ x: bb.x0, y: pos }, { x: bb.x1, y: pos }];
        const lead = Math.min(ctx.leadTo(p0), ctx.leadTo(p1)) + s;
        const h = axis === 'x' ? bb.y1 - bb.y0 : bb.x1 - bb.x0;
        const est = ((MAX_LOOP_M - 2 * lead) * s) / h;
        let a = null;
        const top = Math.min(wMax, Math.max(minW, est * 1.1 + 0.4));
        // coarse (0.2 m) from the widest down to the first that works, then finer (0.05 m) above it
        for (let w = top; w >= Math.max(minW, est * 0.8 - 0.4) - 1e-9 && a === null; w -= 0.2) {
          const q = Math.round(w * 100) / 100;
          if (fits(strip(q))) a = q;
        }
        if (a !== null)
          for (let w = Math.min(top, a + 0.15); w > a + 1e-9; w -= 0.05) {
            const q = Math.round(w * 100) / 100;
            if (fits(strip(q))) {
              a = q;
              break;
            }
          }
        if (process.env.LP_DEBUG) console.error('greedy', axis, dir, 'pos', pos, 'est', est.toFixed(2), 'range', top.toFixed(2), Math.max(minW, est * 0.8 - 0.4).toFixed(2), 'got', a, a === null ? JSON.stringify(strip(Math.round(est * 100) / 100), (k, v) => (k === 'spiral' || k === 'shape' ? undefined : v)) : '');
        if (a === null) return null;
        pos = Math.round((dir > 0 ? pos + a : pos - a) * 100) / 100;
        cuts.push(pos);
      }
      return null;
    };
    const cands = [];
    for (const axis of ['x', 'y']) {
      const g = {};
      for (const dir of [1, -1]) {
        g[dir] = greedy(axis, dir);
        tried.push({ axis, dir, cuts: g[dir]?.cuts ?? null });
        const e = g[dir] && evalCuts(g[dir].cuts, axis);
        if (e) cands.push(e);
      }
      // a single cut where both ends' widest strips overlap (two loops — only if two may do)
      if (kLow <= 2 && g[1] && g[-1] && g[1].cuts.length >= 2) {
        const [lo, hi] = range(axis);
        const from = Math.max(lo + minW, g[-1].first - 0.4);
        const to = Math.min(hi - minW, g[1].first + 0.4);
        for (let c = from; c <= to + 1e-9; c += 0.05) {
          const e = evalCuts([Math.round(c * 100) / 100], axis);
          if (e) cands.push(e);
        }
      }
    }
    // two rows first, strips in each row (top level only; only when the strips miss the lower
    // bound of the loop count or leave a weak coverage)
    const stripBest = cands.length ? summarize([...cands])[0] : null;
    const area = G.area([shape]);
    if (depth === 0 && (!stripBest || stripBest.loops > kLow || stripBest.uncovered > ROWS_TRY_UNCOVERED_SHARE * area))
      for (const axis of ['x', 'y']) {
        const [lo, hi] = range(axis);
        for (const f of [0.5]) {
          const c = Math.round((lo + (hi - lo) * f) * 100) / 100;
          const A = G.intersection([shape], [{ outer: rectOf(axis, lo, c), holes: [] }]);
          const B = G.intersection([shape], [{ outer: rectOf(axis, c, hi), holes: [] }]);
          if (A.length !== 1 || B.length !== 1) continue;
          const sa = { outer: A[0].outer, holes: A[0].holes ?? [] };
          const sb = { outer: B[0].outer, holes: B[0].holes ?? [] };
          const pa = planShape(sa, heatingEst * f, 1);
          const pb = pa && planShape(sb, heatingEst * (1 - f), 1);
          tried.push({ rows: axis, cut: c, ok: !!(pa && pb) });
          if (pa && pb) cands.push({ parts: [...pa.parts, ...pb.parts], split: { rows: axis, cut: c, a: pa.split, b: pb.split } });
        }
      }
    if (!cands.length) return null;
    const best = summarize(cands)[0];
    return { ...best, tried };
  }
  // fewest loops, then coverage (heating pipe), the longest loop, the leads, the balance
  function summarize(cands) {
    for (const f of cands) {
      const totals = f.parts.map((p) => p.total);
      f.loops = f.parts.length;
      f.uncovered = f.parts.reduce((a, p) => a + p.uncovered, 0);
      f.max = Math.max(...totals);
      f.leads = f.parts.reduce((a, p) => a + p.total - p.spiral.heatingLength, 0);
      f.spread = f.max - Math.min(...totals);
    }
    return cands.sort((a, b) => a.loops - b.loops || Math.round((a.uncovered - b.uncovered) * 10) || a.max - b.max || a.leads - b.leads || a.spread - b.spread);
  }

  // all loop spirals together: spacing across loops, overlaps, coverage (heating pipe only)
  const loopSet = { regions: loops.map((l) => ({ poly: l.shape.outer, holes: l.shape.holes, status: 'VALID', spiral: l.spiral })) };
  const check = checkRawSet(loopSet, U, s);
  return assessHydraulics({ kind: 'LOOP_PLAN', loops, regions, rawGeometryStatus: rawCheck.status, check }, ctx.manifold);
}

/**
 * Hydraulic status of a loop plan with a manifold: every loop LOOP_VALID, the loop set checks, and
 * the physical outlets (requiredLoops ≤ availableOutlets — no virtual outlets, unknown = not valid).
 */
export function assessHydraulics(plan, manifold) {
  const { loops, check } = plan;
  const availableOutlets = manifold?.outlets ?? null;
  const reasons = [];
  if (plan.rawGeometryStatus !== 'RAW_GEOMETRY_VALID') reasons.push('raw_geometry');
  if (loops.some((l) => !l.lengthValid)) reasons.push('loop_length_60m');
  if (loops.some((l) => !l.geometryValid)) reasons.push('loop_geometry');
  for (const k of ['spacing', 'residualSpacing', 'bends', 'noCrossing', 'inside', 'exitsOnWall']) if (!check.checks[k]) reasons.push('loop_set_' + k);
  if (availableOutlets === null) reasons.push('outlets_unknown');
  else if (loops.length > availableOutlets) reasons.push('outlet_shortage');
  return { ...plan, requiredLoops: loops.length, availableOutlets, status: reasons.length ? 'HYDRAULIC_LOOP_INVALID' : 'HYDRAULIC_LOOP_VALID', reasons };
}
