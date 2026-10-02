// Debug run of spiral region decomposition: node tools/ufh-regions-debug.mjs <case> [out.svg]
import fs from 'fs';
import * as G from '../src/engines/ufh/geom.js';
import { spiralRegions } from '../src/engines/ufh/decompose.js';
import { coverageAnalysis } from '../src/engines/ufh/coverage.js';
import { debugSVG, tightBends } from '../src/engines/ufh/debug.js';
import { checkRawSet } from '../src/engines/ufh/rawcheck.js';

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
  // U shapes
  U1: { zone: P([0, 0], [8, 0], [8, 6], [5.5, 6], [5.5, 3], [2.5, 3], [2.5, 6], [0, 6]), s: 0.2, note: 'simple U (open up)' },
  U1c: { zone: P([0, 0], [7, 0], [7, 2.5], [2.5, 2.5], [2.5, 4.5], [7, 4.5], [7, 7], [0, 7]), s: 0.2, note: 'C / U open to the side' },
  U2: { zone: P([0, 0], [8, 0], [8, 6], [5.5, 6], [5.5, 3], [2.5, 3], [2.5, 6], [0, 6]), s: 0.15, note: 'simple U, 150 mm' },
  U3: { zone: P([0, 0], [10, 0], [10, 8], [7, 8], [7, 4], [3, 4], [3, 8], [0, 8]), s: 0.2, obstacles: [box(4.7, 1.7, 5.3, 2.3)], note: 'U + column in the open floor' },
  U4: { zone: P([0, 0], [8, 0], [8, 6], [6.8, 6], [6.8, 3], [2.5, 3], [2.5, 6], [0, 6]), s: 0.2, note: 'U, one arm a 1.2 m corridor' },
  U4b: { zone: P([0, 0], [8, 0], [8, 6], [7.1, 6], [7.1, 3], [2.5, 3], [2.5, 6], [0, 6]), s: 0.2, note: 'U, one arm a 0.9 m corridor (too narrow)' },
  U5: { zone: P([0, 0], [7.8, 0], [7.8, 7.4], [5.2, 7.4], [5.2, 3.9], [2.6, 3.9], [2.6, 7.4], [0, 7.4]), s: 0.2, note: 'U — centre gaps shown' },
  U6: { zone: P([0, 0], [12, 0], [12, 9], [8, 9], [8, 4], [4, 4], [4, 9], [0, 9]), s: 0.2, note: 'big U — raw spirals > 60 m' },
  U8: { zone: P([0, 0], [8, 0], [8, 6], [5.5, 6], [5.5, 3], [2.5, 3], [2.5, 6], [0, 6]), s: 0.2, obstacles: [box(1.2, 1.2, 1.8, 1.8)], note: 'U + column 1.2 m from two walls (some splits fail)' },
  U9: { zone: P([0, 0], [8, 0], [8, 6], [5.5, 6], [5.5, 3], [2.5, 3], [2.5, 6], [0, 6]), s: 0.2, obstacles: [box(1.0, 1.0, 1.6, 1.6)], note: 'U + column 0.8 m from two walls' },
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
  const t0 = Date.now();
  const res = spiralRegions(U, s, { toward: { x: 0, y: 0 } });
  const ms = Date.now() - t0;
  const chk = checkRawSet(res, U, s);
  const pipes = res.regions.filter((x) => x.spiral).map((x) => x.spiral);
  const cov = coverageAnalysis({ U, Z, pipes: pipes.map((p) => p.heating), s });
  const bends = pipes.flatMap((p) => tightBends(p.path, 0.068));
  const minGap = chk.minSpacing;
  const crossings = chk.crossings;
  const inside = chk.checks.inside;
  return { c, Z, U, obstacles, res, chk, cov, minGap, crossings, bends, inside, ms };
}

if (process.argv[1]?.endsWith('ufh-regions-debug.mjs')) {
  const name = process.argv[2] ?? 'L1';
  const out = process.argv[3] ?? `${name}.svg`;
  const { c, Z, U, obstacles, res, chk, bends, ms } = runCase(name);
  const lines = [`${name}: ${c.note} — zone ${G.area(Z).toFixed(2)} m², usable ${chk.usable_m2.toFixed(2)} m², s ${c.s * 1000} mm · ${ms} ms`];
  res.regions.forEach((x) => {
    const st = x.stats;
    lines.push(`${x.label ?? '—'}: ${x.area.toFixed(2)} m² · ${x.status}${x.reason ? ' (' + x.reason + ')' : ''}${st ? ` · raw spiral ${st.rawSpiral_m.toFixed(1)} m${st.exceeds60 ? ' (> 60 m)' : ''} · cov ${(st.coverage * 100).toFixed(1)} % · min bend ${st.minBend_mm.toFixed(0)} mm · centre ${st.centre}` : ''}`);
  });
  lines.push(`regions ${chk.regions} · union ${chk.regionUnion_m2.toFixed(2)} m² · gap ${chk.gap_m2.toFixed(3)} m² · overlap ${chk.overlap_m2.toFixed(3)} m² · raw total ${chk.rawTotal_m.toFixed(1)} m`);
  lines.push(`coverage ${(chk.coverage * 100).toFixed(1)} % · uncovered ${chk.uncovered_m2.toFixed(2)} m² · largest ${chk.largestHole_m2.toFixed(2)} m² · min spacing ${(chk.minSpacing * 1000).toFixed(0)} mm · min bend ${(chk.minBend * 1000).toFixed(0)} mm · crossings ${chk.crossings} · exits on wall ${chk.checks.exitsOnWall}`);
  lines.push(`STATUS: ${chk.status}${chk.loopPlannerRequired ? ' — LOOP PLANNER REQUIRED' : ''}${chk.status === 'INVALID_ZONE' ? ' — failed: ' + Object.entries(chk.checks).filter(([, v]) => !v).map(([k]) => k).join(', ') : ''}`);
  console.log(lines.join('\n'));
  const pipesDraw = [];
  const leads = [];
  const labels = [];
  for (const x of res.regions) {
    const cx = x.poly.reduce((a, p) => a + p.x, 0) / 4;
    const cy = x.poly.reduce((a, p) => a + p.y, 0) / 4;
    labels.push({ p: { x: cx, y: cy }, color: x.status === 'VALID' ? '#4a148c' : '#b71c1c', text: x.spiral ? [`${x.label} ${x.status}`, `${x.stats.rawSpiral_m.toFixed(1)} m · ${(x.stats.coverage * 100).toFixed(1)} %`] : [`${x.label ?? ''} INVALID`, x.reason ?? ''] });
    if (!x.spiral) continue;
    const sp = x.spiral;
    const L = G.pathLength(sp.path);
    const mid = sp.leadIn + (L - sp.leadIn - sp.leadOut) / 2;
    pipesDraw.push({ pts: G.subPath(sp.path, sp.leadIn, mid), color: '#d32f2f', w: 1.2 }, { pts: G.subPath(sp.path, mid, L - sp.leadOut), color: '#1565c0', w: 1.2 });
    leads.push(G.subPath(sp.path, 0, sp.leadIn), G.subPath(sp.path, L - sp.leadOut, L));
  }
  const holes = chk.holes.filter((h) => h.area > 0.01);
  fs.writeFileSync(out, debugSVG({ zone: Z, usable: U, obstacles, uncovered: holes.map((h) => h.shape), cells: res.regions.map((x) => [{ outer: x.poly, holes: [] }]), pipes: pipesDraw, leads, bends: bends.map((b) => b.at), labels, lines }, { scale: +(process.env.SCALE ?? 70) }));
}
