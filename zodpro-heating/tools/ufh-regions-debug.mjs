// Debug run of spiral region decomposition: node tools/ufh-regions-debug.mjs <case> [out.svg]
import fs from 'fs';
import * as G from '../src/engines/ufh/geom.js';
import { spiralRegions } from '../src/engines/ufh/decompose.js';
import { coverageAnalysis } from '../src/engines/ufh/coverage.js';
import { debugSVG, tightBends, minSpacing, selfCrossings } from '../src/engines/ufh/debug.js';

const P = (...a) => a.map(([x, y]) => ({ x, y }));
const box = (x0, y0, x1, y1) => P([x0, y0], [x1, y0], [x1, y1], [x0, y1]);
export const CASES = {
  L1: { zone: P([0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]), s: 0.2, note: 'simple L, 200 mm' },
  L2: { zone: P([0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]), s: 0.15, note: 'simple L, 150 mm' },
  L3: { zone: P([0, 0], [9, 0], [9, 5], [4, 5], [4, 9], [0, 9]), s: 0.2, obstacles: [box(6.2, 2.2, 6.8, 2.8)], note: 'L + column 0.6×0.6 in the open floor (clearance 0.2)' },
  L3b: { zone: P([0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]), s: 0.2, obstacles: [box(1.2, 1.2, 1.8, 1.8)], note: 'L + column 0.8 m from two walls (spiral round obstacles: phase 4)' },
  L4a: { zone: P([0, 0], [5, 0], [5, 4], [1.2, 4], [1.2, 8], [0, 8]), s: 0.2, note: 'L with a 1.2 m corridor' },
  L4b: { zone: P([0, 0], [5, 0], [5, 4], [0.9, 4], [0.9, 8], [0, 8]), s: 0.2, note: 'L with a 0.9 m corridor (too narrow)' },
  L5: { zone: P([0, 0], [7.4, 0], [7.4, 3.9], [3.9, 3.9], [3.9, 7.4], [0, 7.4]), s: 0.2, note: 'L — centre gaps shown' },
  L6: { zone: P([0, 0], [9, 0], [9, 5], [4, 5], [4, 9], [0, 9]), s: 0.2, note: 'big L — a region spiral > 60 m' },
  L7: { zone: P([0, 0], [12, 0], [12, 6], [5, 6], [5, 10], [0, 10]), s: 0.15, note: 'big L — needs several loops' },
};

export function runCase(name, o = {}) {
  const c = CASES[name];
  const clear = o.clear ?? 0.2;
  const obsClear = 0.2;
  const s = c.s;
  const Z = G.sanitize(c.zone);
  let U = G.offset(Z, -clear, 'miter');
  const obstacles = (c.obstacles ?? []).map((ob) => G.sanitize(ob)).flat();
  if (obstacles.length) U = G.difference(U, G.offset(obstacles, obsClear, 'miter'));
  const res = spiralRegions(U, s, { toward: { x: 0, y: 0 } });
  const pipes = res.regions.filter((x) => x.spiral).map((x) => x.spiral);
  const cov = coverageAnalysis({ U, Z, pipes: pipes.map((p) => p.heating), s });
  const all = pipes.map((p) => p.path);
  // checks over all spirals together
  let minGap = Infinity;
  for (const p of all) minGap = Math.min(minGap, minSpacing(p, 0.5).min);
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++)
      for (const a of all[i].filter((_, k) => k % 3 === 0)) {
        let d = Infinity;
        for (let k = 1; k < all[j].length; k++) d = Math.min(d, G.segDist(a, all[j][k - 1], all[j][k]));
        minGap = Math.min(minGap, d);
      }
  const crossings = all.reduce((a, p) => a + selfCrossings(p), 0);
  const bends = all.flatMap((p) => tightBends(p, 0.068));
  const inside = pipes.every((p) => p.heating.every((q) => G.pointInRegion(q, G.offset(U, 1e-4))));
  return { c, Z, U, obstacles, res, cov, minGap, crossings, bends, inside };
}

if (process.argv[1]?.endsWith('ufh-regions-debug.mjs')) {
  const name = process.argv[2] ?? 'L1';
  const out = process.argv[3] ?? `${name}.svg`;
  const { c, Z, U, obstacles, res, cov, minGap, crossings, bends, inside } = runCase(name);
  const lines = [`${name}: ${c.note} — zone ${G.area(Z).toFixed(2)} m², usable ${G.area(U).toFixed(2)} m², s ${c.s * 1000} mm`];
  res.regions.forEach((x, i) => {
    const st = x.stats;
    lines.push(`REGION ${String.fromCharCode(65 + i)}: ${x.area.toFixed(2)} m² · ${x.status}${x.reason ? ' (' + x.reason + ')' : ''}${st ? ` · raw spiral ${st.rawSpiral_m.toFixed(1)} m${st.exceeds60 ? ' (> 60 m: planner)' : ''} · cov ${(st.coverage * 100).toFixed(1)} % · min bend ${st.minBend_mm.toFixed(0)} mm · centre ${st.centre}` : ''}`);
  });
  const holes = cov.holes.filter((h) => h.area > 0.01);
  lines.push(`total: coverage ${(cov.ratio * 100).toFixed(1)} % · uncovered ${(G.area(U) - cov.coveredArea).toFixed(2)} m² · largest ${(holes[0]?.area ?? 0).toFixed(2)} m² · min spacing ${(minGap * 1000).toFixed(0)} mm · bends<68: ${bends.length} · crossings ${crossings} · inside ${inside} · ${res.ok ? 'ALL REGIONS VALID' : 'INVALID REGION(S)'}`);
  console.log(lines.join('\n'));
  const pipesDraw = [];
  const leads = [];
  for (const x of res.regions)
    if (x.spiral) {
      const sp = x.spiral;
      const L = G.pathLength(sp.path);
      const mid = sp.leadIn + (L - sp.leadIn - sp.leadOut) / 2;
      pipesDraw.push({ pts: G.subPath(sp.path, sp.leadIn, mid), color: '#d32f2f', w: 1.2 }, { pts: G.subPath(sp.path, mid, L - sp.leadOut), color: '#1565c0', w: 1.2 });
      leads.push(G.subPath(sp.path, 0, sp.leadIn), G.subPath(sp.path, L - sp.leadOut, L));
    }
  fs.writeFileSync(out, debugSVG({ zone: Z, usable: U, obstacles, uncovered: holes.map((h) => h.shape), cells: res.regions.map((x) => [{ outer: x.poly, holes: [] }]), pipes: pipesDraw, leads, bends: bends.map((b) => b.at), lines }, { scale: +(process.env.SCALE ?? 70) }));
}
