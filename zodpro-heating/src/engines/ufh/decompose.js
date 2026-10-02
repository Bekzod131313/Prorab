// UFH Coverage Router — step 2: spiral region decomposition.
//
// A complex usable heating area (L, U, with obstacles cut out) is split into convex SPIRAL REGIONS;
// each region gets its own bifilar spiral (spiralgen). Decomposition exists only to make spirals
// possible — never to make serpentine lanes. A region where no valid spiral fits is reported as
// INVALID REGION; no other pipe pattern is drawn there.
//
//   rectilinear areas (walls along x / y — rooms, corridors, rectangular obstacles): the vertex
//   coordinates cut the area into grid cells; partitions into rectangles are enumerated and tried
//   by region count, 1, 2, 3 …: the first count with an ACCEPTABLE split ends the search
//   (MINIMUM VALID SPIRAL REGIONS). Acceptable = every region a valid spiral, coverage of the
//   heating pipe ≥ the geometry threshold, no hole > max. Among those: least uncovered, fewest extra
//   loops (raw spirals near 60 m), widest regions, nearest to the manifold. Rectangles narrower
//   than a two-ring spiral or without an outer wall are rejected before any spiral is built.
//   Priority: valid geometry (bends, spacing — hard, inside the generator) > coverage > loop length
//   compatibility > region count > manifold distance; an invalid region is never chosen by score
//   over a valid split.
//
//   Two neighbouring regions meet on a cut; each spiral keeps s/2 from its region's boundary, so the
//   pipes on both sides of a cut are exactly s apart. The ends of every spiral must leave through a
//   wall (the area's boundary), never into a neighbouring region — that is where the leads to the
//   manifold attach later (collector connection is a later phase).
//
// Output: RAW SPIRALS per region (geometry). Loop lengths (≤ 60 m with leads) are planned later.

import * as G from './geom.js';
import { bestSpiral } from './spiralgen.js';
import { MAX_LOOP_M, GEOMETRY_TEST_COVERAGE_SINGLE_REGION, GEOMETRY_TEST_COVERAGE_MULTI_REGION, GEOMETRY_TEST_MAX_HOLE } from './criteria.js';

const AX = 1e-6;

/** All edges axis-parallel? */
function rectilinear(region) {
  for (const sh of region)
    for (const r of [sh.outer, ...(sh.holes ?? [])])
      for (let i = 0; i < r.length; i++) {
        const a = r[i];
        const b = r[(i + 1) % r.length];
        if (Math.abs(a.x - b.x) > AX && Math.abs(a.y - b.y) > AX) return false;
      }
  return true;
}

const uniq = (v) => [...new Set(v.map((x) => Math.round(x * 1e6) / 1e6))].sort((a, b) => a - b);

/** Partitions of the free cells into rectangles (grid indices), at most `cap`. */
function partitions(free, nx, ny, cap = 3000) {
  const out = [];
  const used = free.map((row) => row.map((f) => !f));
  const full = (i0, j0, i1, j1) => {
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (used[j][i]) return false;
    return true;
  };
  const rec = (acc) => {
    if (out.length >= cap) return;
    // first free cell
    let fi = -1;
    let fj = -1;
    for (let j = 0; j < ny && fi < 0; j++)
      for (let i = 0; i < nx; i++)
        if (!used[j][i]) {
          fi = i;
          fj = j;
          break;
        }
    if (fi < 0) return void out.push(acc.slice());
    // maximal free rectangles with (fi, fj) as their lower-left cell (it is the first free cell, so
    // nothing free lies before it): widen to the right, then up as far as possible, both orders
    const cands = [];
    let iMax = fi;
    while (iMax + 1 < nx && !used[fj][iMax + 1]) iMax++;
    for (let i1 = fi; i1 <= iMax; i1++) {
      let j1 = fj;
      while (j1 + 1 < ny && full(fi, j1 + 1, i1, j1 + 1)) j1++;
      cands.push([fi, fj, i1, j1]);
    }
    // every rectangle with the cell as its lower-left corner (also the shorter ones: a cut that
    // stops early gives other partitions); the largest first
    const all = [];
    for (const [, , i1, jMax] of cands) for (let j1 = fj; j1 <= jMax; j1++) all.push([fi, fj, i1, j1]);
    all.sort((a, b) => (b[2] - b[0] + 1) * (b[3] - b[1] + 1) - (a[2] - a[0] + 1) * (a[3] - a[1] + 1));
    for (const [i0, j0, i1, j1] of all) {
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) used[j][i] = true;
      acc.push([i0, j0, i1, j1]);
      rec(acc);
      acc.pop();
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) used[j][i] = false;
    }
  };
  rec([]);
  return out;
}

/**
 * Rectangle partitions made by cuts from the reflex corners (the classic minimum partitions): at
 * every reflex grid node one cut runs on — along x or along y — until it meets a wall or an earlier
 * cut. All 2^r direction choices (r reflex corners, capped), in two cut orders; faces that are not
 * rectangles are dropped. Plus every partition with two neighbouring faces merged when their union
 * is a rectangle (fewer regions).
 */
function reflexPartitions(free, nx, ny, cap = 1024) {
  const F = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && free[j][i];
  const reflex = [];
  for (let j = 1; j < ny; j++)
    for (let i = 1; i < nx; i++) {
      const q = [F(i - 1, j - 1), F(i, j - 1), F(i - 1, j), F(i, j)];
      if (q.filter(Boolean).length !== 3) continue;
      const b = q.indexOf(false); // blocked quadrant: 0 ll, 1 lr, 2 ul, 3 ur
      reflex.push({ i, j, dx: b === 0 || b === 2 ? 1 : -1, dy: b === 0 || b === 1 ? 1 : -1 });
    }
  const r = Math.min(reflex.length, 10);
  const out = new Map();
  const add = (rects) => {
    const key = rects.map((q) => q.join(',')).sort().join('|');
    if (!out.has(key)) out.set(key, rects);
  };
  const facesOf = (cutH, cutV) => {
    // cutH[j][i]: cut on the line y = j between cells (i, j-1) and (i, j); cutV[j][i]: x = i
    const id = Array.from({ length: ny }, () => Array(nx).fill(-1));
    const faces = [];
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        if (!F(i, j) || id[j][i] >= 0) continue;
        const f = faces.length;
        const st = [[i, j]];
        id[j][i] = f;
        let i0 = i;
        let i1 = i;
        let j0 = j;
        let j1 = j;
        let n = 0;
        while (st.length) {
          const [a, b] = st.pop();
          n++;
          i0 = Math.min(i0, a);
          i1 = Math.max(i1, a);
          j0 = Math.min(j0, b);
          j1 = Math.max(j1, b);
          const nb = [
            [a + 1, b, !cutV[b][a + 1]],
            [a - 1, b, !cutV[b][a]],
            [a, b + 1, !cutH[b + 1][a]],
            [a, b - 1, !cutH[b][a]],
          ];
          for (const [c, d, open] of nb)
            if (open && F(c, d) && id[d][c] < 0) {
              id[d][c] = f;
              st.push([c, d]);
            }
        }
        if (n !== (i1 - i0 + 1) * (j1 - j0 + 1)) return null; // not a rectangle
        faces.push([i0, j0, i1, j1]);
      }
    return faces;
  };
  for (let mask = 0; mask < 1 << r && out.size < cap; mask++)
    for (const order of [1, -1]) {
      const cutH = Array.from({ length: ny + 1 }, () => Array(nx).fill(false));
      const cutV = Array.from({ length: ny }, () => Array(nx + 1).fill(false));
      const list = order > 0 ? reflex.slice(0, r) : reflex.slice(0, r).reverse();
      list.forEach((v, k0) => {
        const k = order > 0 ? k0 : r - 1 - k0;
        if (mask & (1 << k)) {
          // along x from the node, away from the blocked quadrant
          for (let i = v.dx > 0 ? v.i : v.i - 1; i >= 0 && i < nx; i += v.dx) {
            if (!F(i, v.j - 1) || !F(i, v.j)) break;
            if (cutH[v.j][i]) break;
            cutH[v.j][i] = true;
            const nx2 = v.dx > 0 ? i + 1 : i; // the node reached
            if (cutV[v.j - 1]?.[nx2] || cutV[v.j]?.[nx2] || !F(v.dx > 0 ? i + 1 : i - 1, v.j - 1) || !F(v.dx > 0 ? i + 1 : i - 1, v.j)) break;
          }
        } else {
          for (let j = v.dy > 0 ? v.j : v.j - 1; j >= 0 && j < ny; j += v.dy) {
            if (!F(v.i - 1, j) || !F(v.i, j)) break;
            if (cutV[j][v.i]) break;
            cutV[j][v.i] = true;
            const ny2 = v.dy > 0 ? j + 1 : j;
            if (cutH[ny2]?.[v.i - 1] || cutH[ny2]?.[v.i] || !F(v.i - 1, v.dy > 0 ? j + 1 : j - 1) || !F(v.i, v.dy > 0 ? j + 1 : j - 1)) break;
          }
        }
      });
      const faces = facesOf(cutH, cutV);
      if (faces) add(faces);
    }
  // merges of two neighbouring faces into one rectangle (one level)
  for (const rects of [...out.values()]) {
    for (let a = 0; a < rects.length; a++)
      for (let b = a + 1; b < rects.length; b++) {
        const A = rects[a];
        const B = rects[b];
        const h = A[1] === B[1] && A[3] === B[3] && (A[2] + 1 === B[0] || B[2] + 1 === A[0]);
        const v = A[0] === B[0] && A[2] === B[2] && (A[3] + 1 === B[1] || B[3] + 1 === A[1]);
        if (h || v) add([...rects.filter((_, k) => k !== a && k !== b), [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])]]);
      }
  }
  return [...out.values()];
}

/**
 * Spiral regions of a usable heating area.
 * @param U   usable heating area (region: zone − clearances − obstacles with their clearance)
 * @param s   pipe spacing
 * @param o   { r (bend radius), toward (manifold side, for the start corners), maxEval }
 * @returns { ok, kind: 'RAW_SPIRAL_SET', regions: [{ poly, area, status, reason?, spiral?, stats }],
 *            uncovered (region), candidates, evaluated }
 */
export function spiralRegions(U, s, o = {}) {
  const region = G.asRegion(U);
  if (!rectilinear(region)) return { ok: false, kind: 'RAW_SPIRAL_SET', reason: 'not_rectilinear', regions: [] };
  const pts = region.flatMap((sh) => [sh.outer, ...(sh.holes ?? [])].flat());
  const xs = uniq(pts.map((p) => p.x));
  const ys = uniq(pts.map((p) => p.y));
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const free = [];
  for (let j = 0; j < ny; j++) {
    free.push([]);
    for (let i = 0; i < nx; i++) free[j].push(G.pointInRegion({ x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 }, region));
  }
  // the reflex-cut partitions first (few, good), then the general enumeration
  const seen = new Set();
  const parts = [];
  for (const p of [...reflexPartitions(free, nx, ny), ...partitions(free, nx, ny)]) {
    const key = p.map((q) => q.join(',')).sort().join('|');
    if (!seen.has(key)) seen.add(key), parts.push(p);
  }
  const rectOf = ([i0, j0, i1, j1]) => ({ x0: xs[i0], y0: ys[j0], x1: xs[i1 + 1], y1: ys[j1 + 1] });
  // a region needs ≥ 2 rings (supply + return) and room for the bends: narrower than ~3 s holds no spiral
  const minW = 3 * s + 2 * (o.r ?? Math.max(0.072, s / 2)) * 0.5;
  // the area's outer outline (walls): spiral ends leave there — never onto an obstacle's side (the
  // leads could not get past it to the manifold) nor into a neighbouring region
  const outerWalls = region.map((sh) => ({ outer: sh.outer, holes: [] }));
  const onWall = (q) => G.distToRegionBoundary(q, outerWalls) < 1e-6;
  // a rectangle side lying on the area's outline (where a spiral's ends can leave)
  const wallSides = (r) => {
    const sides = [
      [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }],
      [{ x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }],
      [{ x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }],
      [{ x: r.x0, y: r.y1 }, { x: r.x0, y: r.y0 }],
    ];
    return sides.filter(([a, b]) => onWall({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })).length;
  };
  const narrowness = (rs) => rs.reduce((a, r) => a + Math.max(0, 1.5 - Math.min(r.x1 - r.x0, r.y1 - r.y0)), 0);
  // cheap order inside one region count: wider, squarer regions first
  const cheap = (rs) => narrowness(rs) * 20 + rs.reduce((a, r) => a + Math.max(r.x1 - r.x0, r.y1 - r.y0) / Math.min(r.x1 - r.x0, r.y1 - r.y0), 0) * 0.1;
  const byCount = new Map();
  parts.forEach((p, idx) => {
    const rs = p.map(rectOf);
    if (!byCount.has(p.length)) byCount.set(p.length, []);
    byCount.get(p.length).push({ rs, c: cheap(rs), idx });
  });
  const counts = [...byCount.keys()].sort((a, b) => a - b);
  // per region count: up to `perCount` splits with every region valid are scored (coverage costs);
  // up to `scan` splits are looked at (rejections and invalid splits cost no coverage)
  const perCount = o.perCount ?? 24;
  const scan = o.scan ?? 300;
  const maxEval = o.maxEval ?? 120;
  // one spiral per rectangle (partitions share most of their rectangles)
  const memo = new Map();
  const tried = [];
  let evals = 0;
  let bestOk = null;
  let bestValid = null;
  let bestAny = null;
  const covMin = (k) => (k === 1 ? GEOMETRY_TEST_COVERAGE_SINGLE_REGION : GEOMETRY_TEST_COVERAGE_MULTI_REGION);
  for (const k of counts) {
    const list = byCount.get(k).sort((a, b) => a.c - b.c);
    let validHere = 0;
    for (const { rs } of list.slice(0, scan)) {
      if (evals >= maxEval || validHere >= perCount) break;
      // early rejection (no spiral built): a rectangle too narrow for two rings and the bends, or
      // without any outer wall for the ends
      const early = rs.find((r) => Math.min(r.x1 - r.x0, r.y1 - r.y0) < minW || !wallSides(r));
      if (early) {
        tried.push({ regions: k, rejected: Math.min(early.x1 - early.x0, early.y1 - early.y0) < minW ? 'narrow' : 'no_wall' });
        continue;
      }
      const regs = rs.map((r) => {
        const key = `${r.x0},${r.y0},${r.x1},${r.y1}`;
        if (!memo.has(key)) memo.set(key, build([{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }], r));
        return memo.get(key);
      });
      const invalid = regs.filter((x) => x.status !== 'VALID').length;
      if (invalid) {
        // an invalid split is kept only as the last resort (for reporting which region fails)
        tried.push({ regions: k, invalid });
        if (!bestAny || invalid < bestAny.invalid) bestAny = { k, regs, unc: region, uncovered: G.area(region), score: Infinity, invalid };
        continue;
      }
      evals++;
      validHere++;
      const pipes = regs.filter((x) => x.spiral).map((x) => x.spiral.heating);
      const band = pipes.length ? G.bufferPolylines(pipes.map((h) => G.simplifyPath(h, 0.002)), s / 2 + 0.003, 'round', 'round', 0.001) : [];
      const unc = G.difference(region, band);
      const uncovered = G.area(unc);
      const hole = G.opening(unc, s / 2).reduce((a, sh) => Math.max(a, G.area([sh])), 0);
      const coverage = 1 - uncovered / G.area(region);
      // loops this split will need at least (raw spiral only — the planner adds the leads)
      const raws = regs.filter((x) => x.spiral).map((x) => x.spiral.heatingLength);
      const loopPenalty = raws.reduce((a, l) => a + Math.ceil(l / MAX_LOOP_M), 0) - Math.ceil(raws.reduce((a, l) => a + l, 0) / MAX_LOOP_M);
      const dist = o.toward ? regs.reduce((a, x) => a + (x.spiral ? Math.hypot(x.spiral.supply.x - o.toward.x, x.spiral.supply.y - o.toward.y) : 0), 0) : 0;
      // an extra region must buy at least 0.2 m² of coverage (no regions just for a few tenths of a %)
      const score = k * 2 + uncovered * 10 + loopPenalty * 5 + narrowness(rs) + dist * 0.001;
      const cand = { k, regs, unc, uncovered, hole, coverage, score, loopPenalty };
      const okCand = !invalid && coverage >= covMin(k) && hole <= GEOMETRY_TEST_MAX_HOLE;
      tried.push({ regions: k, invalid, coverage, hole, ok: okCand });
      if (okCand && (!bestOk || score < bestOk.score)) bestOk = cand;
      // (a split leaving a patch over the limit ranks after every split that does not)
      cand.rank = (hole > GEOMETRY_TEST_MAX_HOLE ? 1e4 : 0) + score;
      if (!bestValid || cand.rank < bestValid.rank) bestValid = cand;
    }
    // minimum valid region count: the first count with an acceptable split ends the search
    if (bestOk) break;
  }
  const best = bestOk ?? bestValid ?? bestAny;
  function build(poly, r) {
    const sp = bestSpiral(poly, s, {
      r: o.r,
      toward: o.toward,
      // both ends leave through a wall of the area, not into a neighbouring region
      exitOk: (q) => onWall(q.supply) && onWall(q.ret),
    });
    const area = (r.x1 - r.x0) * (r.y1 - r.y0);
    if (!sp.ok) return { poly, area, status: 'INVALID_REGION', reason: sp.reason === 'no_valid_spiral' ? 'no valid spiral (too narrow / no wall exit)' : sp.reason };
    return {
      poly,
      area,
      status: 'VALID',
      spiral: sp,
      stats: {
        area,
        spacing: s,
        rawSpiral_m: sp.heatingLength,
        laps: sp.laps,
        centre: sp.centre,
        minBend_mm: G.minBendRadius(sp.path).radius * 1000,
        // a raw spiral longer than a whole loop is split by the loop length planner (not invalid)
        exceeds60: sp.heatingLength > MAX_LOOP_M,
        // at least this many loops (raw spiral only; the leads come on top)
        estimatedLoops: Math.ceil(sp.heatingLength / MAX_LOOP_M),
      },
    };
  }
  let chosen = best;
  if (!chosen || chosen.score === Infinity) {
    // no split with every region valid: report the split whose invalid part is smallest (the
    // narrow / shut-in rectangles there are the INVALID REGIONS; the rest keep their spirals)
    const bad = (r) => Math.min(r.x1 - r.x0, r.y1 - r.y0) < minW || !wallSides(r);
    let pick = null;
    for (const p of parts) {
      const rs = p.map(rectOf);
      const badArea = rs.filter(bad).reduce((a, r) => a + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
      if (!pick || badArea < pick.badArea - 1e-9 || (Math.abs(badArea - pick.badArea) <= 1e-9 && rs.length < pick.rs.length)) pick = { rs, badArea };
    }
    const regs = (pick?.rs ?? []).map((r) => {
      const poly = [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];
      if (bad(r)) return { poly, area: (r.x1 - r.x0) * (r.y1 - r.y0), status: 'INVALID_REGION', reason: 'too narrow / no outer wall' };
      const key = `${r.x0},${r.y0},${r.x1},${r.y1}`;
      if (!memo.has(key)) memo.set(key, build(poly, r));
      return memo.get(key);
    });
    const pipes = regs.filter((x) => x.spiral).map((x) => G.simplifyPath(x.spiral.heating, 0.002));
    const unc = G.difference(region, pipes.length ? G.bufferPolylines(pipes, s / 2 + 0.003, 'round', 'round', 0.001) : []);
    chosen = { regs, unc };
  }
  // per-region coverage (its own spiral, heating pipe only); copies — memo entries are shared
  const regs = chosen.regs.map((x, i) => ({ ...x, label: `R${i + 1}`, stats: x.stats ? { ...x.stats } : undefined }));
  for (const x of regs)
    if (x.spiral) {
      const own = G.intersection([{ outer: x.poly, holes: [] }], G.bufferPolylines([G.simplifyPath(x.spiral.heating, 0.002)], s / 2 + 0.003, 'round', 'round', 0.001));
      x.stats.coverage = G.area(own) / x.area;
    }
  return {
    ok: regs.every((x) => x.status === 'VALID'),
    kind: 'RAW_SPIRAL_SET',
    regions: regs,
    uncovered: chosen.unc,
    acceptable: !!bestOk && chosen === bestOk,
    candidates: parts.length,
    evaluated: tried,
  };
}
