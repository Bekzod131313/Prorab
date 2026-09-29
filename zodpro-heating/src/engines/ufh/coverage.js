// Coverage analysis: which part of the heated area is actually served by a pipe.
//
//   covered   = U ∩ ⋃ buffer(pipe, s/2 + 3 mm)      (a pipe heats a band of width s)
//   coverage  = area(covered) / area(U)
//   holes     = connected uncovered patches wider than one spacing; the largest one is a
//               hard limit — a big cold patch is an error even when the percentage looks fine
//
// The map for the preview (green covered / red uncovered / grey obstacle / yellow clearance) is a
// grid sample of the same exact geometry, so what is shown is what was measured.

import * as G from './geom.js';

export function coverageAnalysis({ U, Z, obstacles = [], pipes, s }) {
  const band = G.bufferPolylines(pipes, s / 2 + 0.003);
  const covered = G.intersection(U, band);
  const aU = G.area(U);
  const aC = G.area(covered);
  // a "hole" is a patch that could hold a disc of one spacing: thin stripes where two pipes are a
  // little further apart than s are counted in the ratio, not as cold patches
  const unc = G.opening(G.difference(U, band), s / 2);
  const holes = unc.map((sh) => ({ area: G.area([sh]), at: centroidOf(sh.outer), shape: sh })).sort((a, b) => b.area - a.area);
  return {
    area: aU,
    coveredArea: aC,
    ratio: aU > 0 ? aC / aU : 0,
    holes,
    largestHole: holes[0]?.area ?? 0,
    zoneArea: Z ? G.area(Z) : aU,
    obstacleArea: obstacles.length ? G.area(G.intersection(Z ?? U, G.union(obstacles))) : 0,
    band,
  };
}

function centroidOf(ring) {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
    a += f;
  }
  return a ? { x: cx / (3 * a), y: cy / (3 * a) } : ring[0];
}

/**
 * Grid map (cell 5 cm by default): 1 covered, 2 uncovered, 3 obstacle, 4 clearance band, 0 outside.
 * Returned as a compact Uint8Array with its frame so the UI can paint it cheaply.
 */
export function coverageMap({ Z, U, obstacles = [], band }, cell = 0.05) {
  const bb = G.regionBBox(Z);
  const nx = Math.max(1, Math.ceil((bb.x1 - bb.x0) / cell));
  const ny = Math.max(1, Math.ceil((bb.y1 - bb.y0) / cell));
  if (nx * ny > 400000) return coverageMap({ Z, U, obstacles, band }, cell * 2);
  const grid = new Uint8Array(nx * ny);
  const obs = obstacles.length ? G.union(obstacles) : [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const p = { x: bb.x0 + (i + 0.5) * cell, y: bb.y0 + (j + 0.5) * cell };
      let v = 0;
      if (G.pointInRegion(p, Z)) {
        if (obs.length && G.pointInRegion(p, obs)) v = 3;
        else if (!G.pointInRegion(p, U)) v = 4;
        else v = G.pointInRegion(p, band) ? 1 : 2;
      }
      grid[j * nx + i] = v;
    }
  return { x0: bb.x0, y0: bb.y0, cell, nx, ny, grid };
}
