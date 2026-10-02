// UFH Coverage Router — step 2: spiral region decomposition.
//
// A complex usable heating area (L, U, with obstacles cut out) is split into convex SPIRAL REGIONS;
// each region gets its own bifilar spiral (spiralgen). Decomposition exists only to make spirals
// possible — never to make serpentine lanes. A region where no valid spiral fits is reported as
// INVALID REGION; no other pipe pattern is drawn there.
//
//   rectilinear areas (walls along x / y — rooms, corridors, rectangular obstacles): the vertex
//   coordinates cut the area into grid cells; partitions into rectangles are enumerated (each step
//   covers the first free cell by one of the largest rectangles of free cells containing it); the
//   candidates are ranked cheaply (fewer, wider regions), the best few are built with spirals and
//   the one with every region valid and the least uncovered area wins.
//
//   Two neighbouring regions meet on a cut; each spiral keeps s/2 from its region's boundary, so the
//   pipes on both sides of a cut are exactly s apart. The ends of every spiral must leave through a
//   wall (the area's boundary), never into a neighbouring region — that is where the leads to the
//   manifold attach later (collector connection is a later phase).
//
// Output: RAW SPIRALS per region (geometry). Loop lengths (≤ 60 m with leads) are planned later.

import * as G from './geom.js';
import { bestSpiral } from './spiralgen.js';
import { MAX_LOOP_M } from './criteria.js';

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
  const parts = partitions(free, nx, ny);
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
  const cheap = (p) => {
    const rs = p.map(rectOf);
    const narrow = rs.filter((r) => Math.min(r.x1 - r.x0, r.y1 - r.y0) < minW).length;
    const shut = rs.filter((r) => !wallSides(r)).length;
    // thin regions spiral poorly (long thin cores): prefer fewer, squarer, wider regions
    const thin = rs.reduce((a, r) => a + Math.max(0, 1.5 - Math.min(r.x1 - r.x0, r.y1 - r.y0)), 0);
    const aspect = rs.reduce((a, r) => a + Math.max(r.x1 - r.x0, r.y1 - r.y0) / Math.min(r.x1 - r.x0, r.y1 - r.y0), 0);
    return (narrow + shut) * 1000 + p.length * 10 + thin * 20 + aspect * 0.1;
  };
  const ranked = parts.map((p) => ({ p, c: cheap(p) })).sort((a, b) => a.c - b.c);
  const maxEval = o.maxEval ?? 40;
  // one spiral per rectangle (partitions share most of their rectangles)
  const memo = new Map();
  let best = null;
  const tried = [];
  for (const { p } of ranked.slice(0, maxEval)) {
    const rs = p.map(rectOf);
    const regs = rs.map((r) => {
      const poly = [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];
      const key = `${r.x0},${r.y0},${r.x1},${r.y1}`;
      if (memo.has(key)) return memo.get(key);
      const res = build(poly, r);
      memo.set(key, res);
      return res;
    });
    const pipes = regs.filter((x) => x.spiral).map((x) => x.spiral.heating);
    const band = pipes.length ? G.bufferPolylines(pipes, s / 2 + 0.003) : [];
    const uncovered = G.difference(region, band);
    const invalid = regs.filter((x) => x.status !== 'VALID').length;
    const score = invalid * 1e6 + G.area(uncovered) * 100 + regs.length;
    tried.push({ regions: regs.length, invalid, uncovered: G.area(uncovered) });
    if (!best || score < best.score) best = { score, regs, uncovered };
  }
  function build(poly, r) {
    {
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
          // a raw spiral longer than a whole loop must be split by the loop length planner
          exceeds60: sp.heatingLength > MAX_LOOP_M,
        },
      };
    }
  }
  if (!best) return { ok: false, kind: 'RAW_SPIRAL_SET', reason: 'no_partition', regions: [] };
  // per-region coverage (its own spiral, heating pipe only)
  best.regs = best.regs.map((x) => ({ ...x, stats: x.stats ? { ...x.stats } : undefined }));
  for (const x of best.regs)
    if (x.spiral) {
      const own = G.intersection([{ outer: x.poly, holes: [] }], G.bufferPolylines([x.spiral.heating], s / 2 + 0.003));
      x.stats.coverage = G.area(own) / x.area;
    }
  return {
    ok: best.regs.every((x) => x.status === 'VALID'),
    kind: 'RAW_SPIRAL_SET',
    regions: best.regs,
    uncovered: best.uncovered,
    candidates: parts.length,
    evaluated: tried,
  };
}
