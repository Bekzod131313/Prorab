// Debug run of the spiral offset generator: node tools/ufh-spiral-debug.mjs <case> [out.svg]
import fs from 'fs';
import * as G from '../src/engines/ufh/geom.js';
import { bestSpiral } from '../src/engines/ufh/spiralgen.js';
import { coverageAnalysis } from '../src/engines/ufh/coverage.js';
import { debugSVG, tightBends, minSpacing, selfCrossings } from '../src/engines/ufh/debug.js';

const CASES = {
  rect5: { zone: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }], toward: { x: 0, y: 0 } },
  rect35: { zone: [{ x: 0, y: 0 }, { x: 3.5, y: 0 }, { x: 3.5, y: 3.5 }, { x: 0, y: 3.5 }], toward: { x: 0, y: 0 } },
  rect64: { zone: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }], toward: { x: 0, y: 0 } },
};
const name = process.argv[2] ?? 'rect5';
const out = process.argv[3] ?? `${name}.svg`;
const c = CASES[name];
const s = +(process.env.S ?? 0.2);
const clear = +(process.env.CLEAR ?? 0.2);
const rmin = 0.068; // PE-RT 16×2: 80 mm × (1 − 15 %)
const Z = G.sanitize(c.zone);
const U = G.offset(Z, -clear, 'miter');
const sp = bestSpiral(U[0].outer, s, { toward: c.toward });
if (!sp.ok) {
  console.log('INVALID', sp.reason, JSON.stringify(sp.tries ?? []));
  process.exit(1);
}
const cov = coverageAnalysis({ U, Z, pipes: [sp.heating], s });
const bends = tightBends(sp.path, rmin);
const spacing = minSpacing(sp.path, 0.5);
const cross = selfCrossings(sp.path);
const inside = sp.heating.every((p) => G.pointInRegion(p, G.offset(U, 1e-4)));
const holes = cov.holes.filter((h) => h.area > 0.01);
const m = {
  zone_m2: G.area(Z),
  usable_m2: G.area(U),
  spacing_mm: s * 1000,
  laps: sp.laps,
  rings: `${sp.usedRings} of ${sp.rings} (+ centre ${sp.centre})`,
  heatingPipe_m: sp.heatingLength,
  leadStubs_m: sp.leadIn + sp.leadOut,
  coverage_heating: cov.ratio,
  uncovered_m2: G.area(U) - cov.coveredArea,
  largestHole_m2: holes[0]?.area ?? 0,
  minBend_mm: G.minBendRadius(sp.path).radius * 1000,
  bendRadius_mm: sp.r * 1000,
  bendViolations: bends.length,
  minSpacing_mm: spacing.min * 1000,
  selfCrossings: cross,
  insideUsable: inside,
  continuous: true,
};
console.log(JSON.stringify(m, null, 1));
const lines = [
  `${name}: zone ${m.zone_m2.toFixed(2)} m², usable ${m.usable_m2.toFixed(2)} m², s ${m.spacing_mm} mm, R ${m.bendRadius_mm.toFixed(0)} mm`,
  `spiral: ${sp.laps} laps × 2 arms, heating pipe ${m.heatingPipe_m.toFixed(1)} m (+ lead stubs ${m.leadStubs_m.toFixed(2)} m)`,
  `coverage (heating pipe) ${(m.coverage_heating * 100).toFixed(1)} %, uncovered ${m.uncovered_m2.toFixed(2)} m², largest hole ${m.largestHole_m2.toFixed(2)} m²`,
  `min bend ${m.minBend_mm.toFixed(0)} mm (≥ 68), min spacing ${m.minSpacing_mm.toFixed(0)} mm, crossings ${cross}, inside ${inside}`,
];
const half = Math.floor(sp.path.length / 2);
// supply arm (to the centre) red, return arm blue
const L = G.pathLength(sp.path);
const mid = sp.leadIn + (L - sp.leadIn - sp.leadOut) / 2;
fs.writeFileSync(
  out,
  debugSVG(
    {
      zone: Z,
      usable: U,
      uncovered: holes.map((h) => h.shape),
      pipes: [
        { pts: G.subPath(sp.path, sp.leadIn, mid), color: '#d32f2f' },
        { pts: G.subPath(sp.path, mid, L - sp.leadOut), color: '#1565c0' },
      ],
      leads: [G.subPath(sp.path, 0, sp.leadIn), G.subPath(sp.path, L - sp.leadOut, L)],
      bends: bends.map((b) => b.at),
      marks: [{ p: sp.supply, color: '#d32f2f', r: 5 }, { p: sp.ret, color: '#1565c0', r: 5 }],
      lines,
    },
    { scale: 110 },
  ),
);
void half;
