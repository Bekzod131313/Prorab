// Phase 6 reopen (lead-aware spiral / terminal closure): the same measurement before and after the
// change — per loop coverage (own region), largest gap, terminal closure location, min bend radius,
// heating length, loop counts, the file hashes of the Phase 6 algorithm and a geometry hash.
//   node tools/phase6r-eval.mjs <out.json>
import fs from 'fs';
import crypto from 'crypto';
import * as G from '../src/engines/ufh/geom.js';
import { spiralRegions } from '../src/engines/ufh/decompose.js';
import { planLoops } from '../src/engines/ufh/loopplanner.js';
import { referenceCheck } from '../src/engines/ufh/phase6reference.js';
import { runTransfers, phase6GeometryHash } from './ufh-transfer-debug.mjs';

export const PHASE6_FILES = ['geom.js', 'spiralgen.js', 'decompose.js', 'obstaclespiral.js', 'closure.js', 'rawcheck.js', 'criteria.js', 'loopplanner.js', 'loopproof.js', 'partitionsearch.js'];
const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const R = (x0, y0, x1, y1) => [{ outer: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [] }];

// the reference cases (usable areas, wall clearance already off): a leftover width on one axis
export const CASES = {
  'right-residual 3.15×2.33 s0.2': { U: R(0, 0, 3.15, 2.33), s: 0.2, toward: { x: -0.3, y: 0.3 } },
  'right-residual 2.95×2.33 s0.2': { U: R(0, 0, 2.95, 2.33), s: 0.2, toward: { x: -0.3, y: 0.3 } },
  'right-residual 3.37×2.0 s0.2': { U: R(0, 0, 3.37, 2.0), s: 0.2, toward: { x: -0.3, y: 0.3 } },
  'exact 3.2×2.4 s0.2': { U: R(0, 0, 3.2, 2.4), s: 0.2, toward: { x: -0.3, y: 0.3 } },
  'residual 2.62×1.9 s0.15': { U: R(0, 0, 2.62, 1.9), s: 0.15, toward: { x: -0.3, y: 0.3 } },
};

export function planCase(c) {
  const res = spiralRegions(c.U, c.s, { toward: c.toward });
  return planLoops(res, c.U, c.s, { leadTo: (p) => man(c.toward, p), manifold: null, toward: c.toward });
}

export function loopMetrics(plan, U, s) {
  return plan.loops.map((l) => {
    const region = G.intersection([l.shape], U);
    const A = G.area(region);
    const band = G.bufferPolylines([G.simplifyPath(l.spiral.heating, 0.002)], s / 2 + 0.003, 'round', 'round', 0.001);
    const cov = A > 0 ? G.area(G.intersection(region, band)) / A : 0;
    const gap = G.opening(G.difference(region, band), s / 2).reduce((a, q) => Math.max(a, G.area([q])), 0);
    const ref = referenceCheck(l, s);
    return {
      loop: l.loopId,
      heating_m: l.heatingLength,
      total_m: l.totalLength,
      coverage: cov,
      largestGap_m2: gap,
      minRadius_m: G.minBendRadius(l.spiral.path).radius,
      residualSpacing: l.spiral.residualSpacing ?? null,
      closure: l.spiral.closureSide ?? (l.spiral.residual ? 'centre' : 'none'),
      terminal: ref.terminal ? { u: ref.terminal.centre.u, v: ref.terminal.centre.v, toSide_m: ref.terminal.toSide_m } : null,
      reference: ref.status,
      ends: { supply: l.spiral.supply, ret: l.spiral.ret },
    };
  });
}

export function fileHashes() {
  return Object.fromEntries(PHASE6_FILES.map((f) => [f, crypto.createHash('sha256').update(fs.readFileSync(new URL(`../src/engines/ufh/${f}`, import.meta.url))).digest('hex')]));
}

export function evaluate({ apartment = true } = {}) {
  const out = { files: fileHashes(), cases: {}, apartment: null };
  for (const [name, c] of Object.entries(CASES)) {
    const p = planCase(c);
    out.cases[name] = { loops: p.loops.length, hash: phase6GeometryHash({ X: p }), metrics: loopMetrics(p, c.U, c.s) };
  }
  if (apartment) {
    const fx = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/apartment-7b.json', import.meta.url), 'utf8'));
    const r = runTransfers(fx, { leadSpacing: 0.05 });
    out.apartment = { counts: r.counts, hash: phase6GeometryHash(r.plans), rooms: {} };
    for (const [rid, p] of Object.entries(r.plans)) {
      const s = p.loops[0]?.nominalSpacing ?? 0.2;
      out.apartment.rooms[rid] = { loops: p.loops.length, metrics: loopMetrics(p, r.transfers.rooms[rid].Uprime, s) };
    }
  }
  return out;
}

if (process.argv[1]?.endsWith('phase6r-eval.mjs')) {
  const t0 = Date.now();
  const out = evaluate();
  out.ms = Date.now() - t0;
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  for (const [n, c] of Object.entries(out.cases)) console.log(n, c.loops, c.metrics.map((m) => `${m.loop} cov ${(m.coverage * 100).toFixed(1)} gap ${m.largestGap_m2.toFixed(3)} R ${(m.minRadius_m * 1000).toFixed(0)} L ${m.heating_m.toFixed(2)} ${m.closure} ${m.reference} ${m.terminal ? m.terminal.u.toFixed(2) + ',' + m.terminal.v.toFixed(2) : ''}`).join(' | '));
  for (const [rid, x] of Object.entries(out.apartment.rooms)) console.log(rid, x.loops, x.metrics.map((m) => `${m.loop} cov ${(m.coverage * 100).toFixed(1)} gap ${m.largestGap_m2.toFixed(3)} R ${(m.minRadius_m * 1000).toFixed(0)} L ${m.heating_m.toFixed(2)} ${m.reference}`).join(' | '));
  console.log('apartment hash', out.apartment.hash, 'ms', out.ms);
}
