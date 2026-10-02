// Debug run of the loop planner: node tools/ufh-loops-debug.mjs <case> [out.svg]
// Lead estimate: rectilinear route manifold → (doors) → loop end. Manifold outlets: physical only.
import fs from 'fs';
import * as G from '../src/engines/ufh/geom.js';
import { spiralRegions } from '../src/engines/ufh/decompose.js';
import { planLoops, assessHydraulics } from '../src/engines/ufh/loopplanner.js';
import { debugSVG, tightBends } from '../src/engines/ufh/debug.js';
import { WALL_CLEARANCE, OBSTACLE_CLEARANCE, MAX_LOOP_M } from '../src/engines/ufh/criteria.js';

const P = (...a) => a.map(([x, y]) => ({ x, y }));
const box = (x0, y0, x1, y1) => P([x0, y0], [x1, y0], [x1, y1], [x0, y1]);
const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const M0 = { name: 'M', at: { x: 0, y: 0 }, outlets: 12 };

export const CASES = {
  LP1: { zone: box(0, 0, 3.6, 3.6), s: 0.2, manifold: M0, note: '≈ 50 m raw → 1 loop' },
  LP2: { zone: box(0, 0, 3.8, 3.8), s: 0.2, manifold: M0, note: '≈ 57 m raw, total just under 60 m → 1 loop' },
  LP3: { zone: box(0, 0, 4, 4), s: 0.2, manifold: M0, note: '≈ 63.5 m raw — just over one loop → 2 loops' },
  LP3b: { zone: box(0, 0, 3.85, 3.9), s: 0.2, manifold: M0, note: '59.4 m raw, over 60 m with the leads — a shorter valid variant of the same spiral fits → 1 loop' },
  LP4: { zone: box(0, 0, 4.9, 4.9), s: 0.2, manifold: M0, note: '≈ 100 m raw' },
  LP5: { zone: box(0, 0, 5.2, 5.2), s: 0.2, manifold: M0, note: '≈ 110 m raw' },
  LP6: { zone: box(0, 0, 5.4, 5.4), s: 0.2, manifold: M0, note: '≈ 120 m raw' },
  LP7: { zone: box(0, 0, 6, 7), s: 0.2, manifold: M0, note: '≈ 180 m raw' },
  LP8: { zone: box(0, 0, 8, 9), s: 0.2, manifold: M0, note: '≈ 300 m raw' },
  LP9: { zone: box(0, 0, 3.6, 3.6), s: 0.2, manifold: { name: 'M', at: { x: -7, y: 0 }, outlets: 12 }, note: '≈ 50 m raw, manifold 7 m away (long leads)' },
  LP10: { zone: box(0, 0, 6, 7), s: 0.2, manifold: { name: 'M', at: { x: 0, y: 0 }, outlets: 3 }, sameAs: 'LP7', note: '≈ 180 m raw (LP7), manifold with 3 outlets only' },
  LP11: { zone: box(0, 0, 1.6, 20), s: 0.2, manifold: M0, note: 'narrow 1.6 × 20 m: cuts that would leave strips too narrow for R ≥ RMIN' },
  LP12: { zone: box(0, 0, 6, 6), s: 0.2, obstacles: [box(2.7, 2.7, 3.3, 3.3)], manifold: M0, note: 'column in the middle: cuts round the obstacle clearance' },
};

// 101–109 (ZODPRO project export): rooms 101, 107, 108 of ZONE-01; manifold C-01 in 107 — 6
// physical outlets (the old layer offered 12 virtual ports); leads through the doors D-03 / D-04
export const ZONE_101 = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/zone-101-109.json', import.meta.url), 'utf8'));

/** One zone: regions (raw spirals) → loops. */
const runs = new Map();
export function runLoops(name) {
  const c = CASES[name];
  // the same geometry with another manifold: the loops are the same, only the outlets are checked again
  if (c.sameAs) {
    const r = runs.get(c.sameAs) ?? runLoops(c.sameAs);
    return { ...r, c, plan: assessHydraulics(r.plan, c.manifold) };
  }
  const s = c.s;
  const Z = G.sanitize(c.zone);
  let U = G.offset(Z, -WALL_CLEARANCE, 'miter');
  const obstacles = (c.obstacles ?? []).map((ob) => G.sanitize(ob)).flat();
  if (obstacles.length) U = G.difference(U, G.offset(obstacles, OBSTACLE_CLEARANCE, 'miter'));
  const t0 = Date.now();
  const res = spiralRegions(U, s, { toward: c.manifold.at });
  const plan = planLoops(res, U, s, { leadTo: (p) => man(c.manifold.at, p), manifold: c.manifold, toward: c.manifold.at });
  const out = { c, Z, U, obstacles, res, plan, ms: Date.now() - t0 };
  runs.set(name, out);
  return out;
}

/** 101–109: every room its own zone; one manifold for all of them. */
export function run101() {
  const f = ZONE_101;
  const s = f.s;
  const door = (n) => f.doors.find((d) => d.name === n).at;
  const t0 = Date.now();
  const rooms = f.rooms.map((rm) => {
    const Z = G.sanitize(rm.poly);
    const U = G.offset(Z, -f.wallClearance, 'miter');
    // route manifold → doors of the chain → point (rectilinear)
    const chain = [f.manifold.at, ...rm.via.map(door)];
    const base = chain.slice(1).reduce((a, q, i) => a + man(chain[i], q), 0);
    const leadTo = (p) => base + man(chain[chain.length - 1], p);
    const res = spiralRegions(U, s, { toward: chain[chain.length - 1] });
    const plan = planLoops(res, U, s, { leadTo, manifold: f.manifold, toward: chain[chain.length - 1] });
    return { name: rm.name, Z, U, res, plan };
  });
  const loops = rooms.flatMap((r) => r.plan.loops.map((l) => ({ ...l, room: r.name })));
  const reasons = [...new Set(rooms.flatMap((r) => r.plan.reasons.filter((x) => x !== 'outlet_shortage')))];
  if (loops.length > f.manifold.outlets) reasons.push('outlet_shortage');
  return {
    rooms,
    loops,
    requiredLoops: loops.length,
    availableOutlets: f.manifold.outlets,
    rawGeometryStatus: rooms.every((r) => r.plan.rawGeometryStatus === 'RAW_GEOMETRY_VALID') ? 'RAW_GEOMETRY_VALID' : 'INVALID_ZONE',
    status: reasons.length ? 'HYDRAULIC_LOOP_INVALID' : 'HYDRAULIC_LOOP_VALID',
    reasons,
    ms: Date.now() - t0,
  };
}

const COLORS = ['#d32f2f', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#00838f', '#ad1457', '#4e342e', '#283593', '#9e9d24'];
export function loopsSVG({ Z, U, obstacles = [], plan, title, manifoldAt }) {
  const pipes = [];
  const leads = [];
  const labels = [];
  const lines = [title];
  plan.loops.forEach((l, i) => {
    const sp = l.spiral;
    const L = G.pathLength(sp.path);
    pipes.push({ pts: G.subPath(sp.path, sp.leadIn, L - sp.leadOut), color: COLORS[i % COLORS.length], w: 1.3 });
    leads.push(G.subPath(sp.path, 0, sp.leadIn), G.subPath(sp.path, L - sp.leadOut, L));
    const b = G.bbox(l.shape.outer);
    labels.push({ p: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, color: l.status === 'LOOP_VALID' ? '#1b5e20' : '#b71c1c', text: [`${l.loopId} ${l.status}`, `${l.heatingLength.toFixed(1)} + ${(l.supplyLength + l.returnLength).toFixed(1)} = ${l.totalLength.toFixed(2)} m`] });
    lines.push(`${l.loopId} (${l.regionId}): heating ${l.heatingLength.toFixed(2)} · supply ${l.supplyLength.toFixed(2)} · return ${l.returnLength.toFixed(2)} · TOTAL ${l.totalLength.toFixed(3)} m ≤ ${MAX_LOOP_M} · ${l.status}${l.failed.length ? ' (' + l.failed.join(', ') + ')' : ''}${l.residualSpacing ? ` · S ${l.nominalSpacing * 1000} + residual ${(l.residualSpacing * 1000).toFixed(0)}` : ''}`);
  });
  lines.push(`required loops ${plan.requiredLoops} · available outlets ${plan.availableOutlets ?? '—'} · ${plan.rawGeometryStatus} · ${plan.status}${plan.reasons.length ? ' (' + plan.reasons.join(', ') + ')' : ''}`);
  const bends = plan.loops.flatMap((l) => tightBends(l.spiral.path, 0.068).map((b) => b.at));
  return debugSVG({ zone: Z, usable: U, obstacles, cells: plan.loops.map((l) => [l.shape]), pipes, leads, bends, labels, lines, marks: manifoldAt ? [{ p: manifoldAt, r: 7, color: '#000' }] : [] }, { scale: 70 });
}

if (process.argv[1]?.endsWith('ufh-loops-debug.mjs')) {
  const name = process.argv[2] ?? 'LP4';
  const out = process.argv[3] ?? `${name}.svg`;
  if (name === '101') {
    const r = run101();
    for (const rm of r.rooms) {
      console.log(`${rm.name}: raw ${rm.res.regions.map((x) => x.spiral?.heatingLength.toFixed(1) ?? 'INVALID').join(' + ')} m → ${rm.plan.loops.length} loops: ${rm.plan.loops.map((l) => l.totalLength.toFixed(2)).join(' / ')} · ${rm.plan.rawGeometryStatus}`);
      fs.writeFileSync(out.replace('.svg', `_${rm.name}.svg`), loopsSVG({ ...rm, plan: rm.plan, title: `${rm.name} — ${rm.plan.loops.length} loops` }));
    }
    console.log(`required ${r.requiredLoops} · outlets ${r.availableOutlets} · ${r.rawGeometryStatus} · ${r.status} (${r.reasons.join(', ')}) · ${r.ms} ms`);
  } else {
    const r = runLoops(name);
    const raw = r.res.regions.map((x) => x.spiral?.heatingLength.toFixed(2)).join(' + ');
    console.log(`${name}: ${r.c.note} — raw ${raw} m · ${r.ms} ms`);
    for (const l of r.plan.loops) console.log(`  ${l.loopId}: heating ${l.heatingLength.toFixed(2)} · leads ${l.supplyLength.toFixed(2)} + ${l.returnLength.toFixed(2)} · total ${l.totalLength.toFixed(3)} · ${l.status} ${l.failed.join(',')}`);
    console.log(`  required ${r.plan.requiredLoops} · outlets ${r.plan.availableOutlets} · ${r.plan.rawGeometryStatus} · ${r.plan.status} ${r.plan.reasons.join(',')}`);
    fs.writeFileSync(out, loopsSVG({ ...r, plan: r.plan, title: `${name}: ${r.c.note}`, manifoldAt: r.c.manifold.at }));
  }
}
