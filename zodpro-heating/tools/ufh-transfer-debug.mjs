// Phase 7B debug: the transfer leads, corridors and heating loops of a zone, rendered straight
// from the engine's geometry (roomgraph + corridor + the frozen Phase 6 planner). Nothing is drawn
// by hand: every line is a polyline the engine returned.
//   node tools/ufh-transfer-debug.mjs <fixture.json> <leadSpacing m> <out.svg> [detail.svg]
import fs from 'fs';
import crypto from 'crypto';
import * as G from '../src/engines/ufh/geom.js';
import { doorChains } from '../src/engines/ufh/roomgraph.js';
import { planTransfers, heatingPitchOf } from '../src/engines/ufh/corridor.js';
import { portsOf } from '../src/engines/ufh/collector.js';
import { spiralRegions } from '../src/engines/ufh/decompose.js';
import { planLoops } from '../src/engines/ufh/loopplanner.js';
import { ENGINEERING_FINAL_COVERAGE, ENGINEERING_COVERAGE_TOLERANCE } from '../src/engines/ufh/criteria.js';

const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** U of every room: inner faces − wallClearance − obstacles ⊕ obstacleClearance. */
export function usableOf(fx) {
  const out = {};
  for (const r of fx.rooms) {
    let U = G.offset([{ outer: G.ccw(r.poly), holes: [] }], -fx.wallClearance, 'miter');
    const obs = (r.obstacles ?? []).map((o) => ({ outer: G.ccw(o), holes: [] }));
    if (obs.length) U = G.difference(U, G.offset(obs, fx.obstacleClearance, 'miter'));
    out[r.id] = U;
  }
  return out;
}

/**
 * The 7B pipeline: loop counts from the frozen planner on U, transfers + corridors, the rooms
 * planned again on U' until the loop counts hold (at most maxIter rounds).
 */
export function runTransfers(fx, { leadSpacing, maxIter = 3 }) {
  const params = { heatingPitch: fx.heatingPitch, leadWallOffset: fx.leadWallOffset, leadSpacing, pipeType: fx.pipeType, wallClearance: fx.wallClearance };
  const U = usableOf(fx);
  const chains = doorChains({ rooms: fx.rooms, doors: fx.doors, collectorAt: fx.collector.at });
  const doorAt = (id) => fx.doors.find((d) => d.id === id).at;
  const toward = (rid) => (rid === chains.collectorRoom ? fx.collector.at : doorAt(chains.rooms[rid].doors.at(-1)));
  const plan = (rid, region) => {
    const room = fx.rooms.find((r) => r.id === rid);
    const s = heatingPitchOf(room, params);
    const t = toward(rid);
    const res = spiralRegions(region, s, { toward: t });
    return planLoops(res, region, s, { leadTo: (p) => man(t, p), manifold: null, toward: t });
  };
  const served = fx.rooms.map((r) => r.id).filter((rid) => chains.rooms[rid].reachable);
  let counts = Object.fromEntries(served.map((rid) => [rid, plan(rid, U[rid]).loops.length]));
  const history = [{ ...counts }];
  let tr = null;
  let plans = null;
  for (let it = 0; it < maxIter; it++) {
    tr = planTransfers({ rooms: fx.rooms, doors: fx.doors, collector: fx.collector, loopsByRoom: counts, usable: U, params });
    if (!tr.rooms) break;
    plans = Object.fromEntries(served.map((rid) => [rid, plan(rid, tr.rooms[rid].Uprime)]));
    const next = Object.fromEntries(served.map((rid) => [rid, plans[rid].loops.length]));
    history.push({ ...next });
    if (served.every((rid) => next[rid] === counts[rid])) break;
    counts = next;
  }
  return { fx, params, U, transfers: tr, plans, counts, history };
}

/** The numbers of a run (per room and per door), and a hash of all geometry (determinism). */
export function metricsOf(run) {
  const { transfers: tr, plans, params } = run;
  const rooms = {};
  for (const [rid, x] of Object.entries(tr.rooms)) {
    const p = plans?.[rid];
    const H = p ? p.check.usable_m2 - p.check.uncovered_m2 : 0;
    // measured: the lead centrelines' smallest distance to this room's walls (away from the
    // doors and the manifold, where they turn through the wall)
    const room = run.fx.rooms.find((r) => r.id === rid);
    const reg = [{ outer: G.ccw(room.poly), holes: [] }];
    const keepOff = [...run.fx.doors.filter((d) => d.between.includes(rid)).map((d) => d.at), run.fx.collector.at];
    let wallMin = Infinity;
    for (const l of tr.leads.filter((x) => x.path.length >= 2))
      for (const q of G.densify(l.path, 0.02))
        if (G.pointInRegion(q, reg) && keepOff.every((k) => Math.hypot(q.x - k.x, q.y - k.y) > 0.7)) wallMin = Math.min(wallMin, G.distToRegionBoundary(q, reg));
    rooms[rid] = {
      role: x.role,
      heatingPitch: x.heatingPitch,
      U_m2: x.U_m2,
      C_m2: x.C_m2,
      Uprime_m2: x.Uprime_m2,
      H_m2: H,
      coverageUprime: x.Uprime_m2 > 0 ? H / x.Uprime_m2 : 0,
      rawcheckUsable_m2: p?.check.usable_m2 ?? null,
      rawcheckUncovered_m2: p?.check.uncovered_m2 ?? null,
      loops: p ? p.loops.map((l) => ({ id: `${rid}.L${l.loopId.slice(1)}`, heating_m: l.heatingLength, nominalSpacing: l.nominalSpacing })) : [],
      minHeatingSpacing_m: p?.check.minSpacing ?? null,
      bundles: x.bundles.map((b) => ({ side: b.side, stretch: b.stretch, leads: b.N, leadSpacing: params.leadSpacing, span_m: b.span, width_m: b.width, depth_m: b.depth, exits: b.exits })),
      corridorComponents: x.corridor.length,
      components: x.components,
      split: x.split,
      slivers: x.slivers,
      leadWallMin_m: Number.isFinite(wallMin) ? wallMin : null,
    };
  }
  const geometry = JSON.stringify({ leads: tr.leads.map((l) => [l.id, l.path.map((p) => [+p.x.toFixed(9), +p.y.toFixed(9)])]), rooms: Object.fromEntries(Object.entries(tr.rooms).map(([k, v]) => [k, [v.C_m2.toFixed(9), v.Uprime_m2.toFixed(9)]])), loops: Object.fromEntries(Object.entries(plans ?? {}).map(([k, p]) => [k, p.loops.map((l) => l.heatingLength.toFixed(9))])) });
  // pipeline-level: the heating of every served room on U′ (frozen planner) against the
  // engineering coverage (tolerance 0) — a room the corridor leaves unheatable shows here
  const heatingIssues = Object.entries(rooms)
    .filter(([, x]) => !(x.coverageUprime >= ENGINEERING_FINAL_COVERAGE - ENGINEERING_COVERAGE_TOLERANCE))
    .map(([rid, x]) => ({ status: 'COVERAGE_BELOW_LIMIT', room: rid, msg: `room ${rid}: coverage(U′) ${(100 * x.coverageUprime).toFixed(1)} % < ${100 * ENGINEERING_FINAL_COVERAGE} % (${x.loops.length} loop(s) on U′ ${x.Uprime_m2.toFixed(2)} m²)` }));
  return {
    status: tr.status,
    issues: tr.issues,
    heatingIssues,
    leadSpacing: params.leadSpacing,
    portOrder: tr.portOrder,
    leadCrossings: tr.crossings,
    doors: tr.doors,
    areas: tr.areas,
    rooms,
    leads: tr.leads.map((l) => ({ id: l.id, kind: l.kind, doors: l.doors, length_m: l.length })),
    history: run.history,
    geometryHash: crypto.createHash('sha256').update(geometry).digest('hex'),
  };
}

const LOOP_COLORS = ['#2e7d32', '#ef6c00', '#6a1b9a', '#00838f', '#ad1457', '#4e342e', '#283593', '#9e9d24', '#5d4037', '#00695c'];

/** SVG of a run; view = { x0, y0, x1, y1 } for a detail, scale px / m. */
export function renderTransfers(run, { title, view = null, scale = 80, notes = true } = {}) {
  const { fx, transfers: tr, plans } = run;
  const m = metricsOf(run);
  const all = fx.rooms.flatMap((r) => r.poly);
  const bb = view ?? (() => {
    const b = G.bbox(all);
    return { x0: b.x0 - 0.3, y0: b.y0 - 0.3, x1: b.x1 + 0.3, y1: b.y1 + 0.3 };
  })();
  const S = scale;
  const W = (bb.x1 - bb.x0) * S;
  const Hh = (bb.y1 - bb.y0) * S;
  const X = (p) => (p.x - bb.x0) * S;
  const Y = (p) => (bb.y1 - p.y) * S;
  const pth = (pts, closed) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p).toFixed(2)},${Y(p).toFixed(2)}`).join('') + (closed ? 'Z' : '');
  const reg = (R) => G.asRegion(R).map((s) => [s.outer, ...(s.holes ?? [])].map((q) => pth(q, true)).join('')).join('');
  const el = [];
  // walls: the building outline (0.12 m outer walls) minus the rooms
  const roomsReg = fx.rooms.map((r) => ({ outer: G.ccw(r.poly), holes: [] }));
  const walls = G.difference(G.offset(G.union(roomsReg), 0.12, 'miter'), roomsReg);
  el.push(`<path d="${reg(walls)}" fill="#9e9e9e" fill-rule="evenodd"/>`);
  for (const r of fx.rooms) for (const o of r.obstacles ?? []) el.push(`<path d="${pth(G.ccw(o), true)}" fill="#bdbdbd" stroke="#616161" stroke-width="1"/>`);
  // doors: the opening through the wall
  for (const d of fx.doors) {
    const a = fx.rooms.find((r) => r.id === d.between[0]);
    const q = G.closestOnRing(d.at, G.ccw(a.poly));
    const R = G.ccw(a.poly);
    const p0 = R[q.i];
    const p1 = R[(q.i + 1) % R.length];
    const L = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const u = { x: (p1.x - p0.x) / L, y: (p1.y - p0.y) / L };
    const n = { x: -u.y, y: u.x };
    const w = d.width_m / 2;
    const c = d.at;
    const rect = [-1, 1].flatMap((sg) => [-1, 1].map((sn) => ({ x: c.x + u.x * w * sg + n.x * 0.08 * sn * sg, y: c.y + u.y * w * sg + n.y * 0.08 * sn * sg })));
    el.push(`<path d="${pth([rect[0], rect[1], rect[3], rect[2]], true)}" fill="#fff" stroke="#8d6e63" stroke-width="1"/>`);
    el.push(`<text x="${X(c) + 4}" y="${Y(c) - 4}" font-size="${Math.max(9, S / 9)}" fill="#5d4037">${d.id} ${d.width_m} m</text>`);
  }
  for (const [rid, x] of Object.entries(tr.rooms)) {
    el.push(`<path d="${reg(x.U)}" fill="#e8f5e9" stroke="none" fill-rule="evenodd"/>`);
    if (x.exclusion.length) el.push(`<path d="${reg(x.exclusion)}" fill="#ffb74d" fill-opacity="0.8" stroke="#e65100" stroke-width="0.6" fill-rule="evenodd"/>`);
    el.push(`<path d="${reg(x.Uprime)}" fill="none" stroke="#2e7d32" stroke-width="0.8" stroke-dasharray="4,3" fill-rule="evenodd"/>`);
  }
  // heating loops (frozen Phase 6 planner on U′)
  let ci = 0;
  for (const [rid, p] of Object.entries(plans ?? {}))
    for (const l of p.loops) {
      const col = LOOP_COLORS[ci++ % LOOP_COLORS.length];
      const sp = l.spiral;
      el.push(`<path d="${pth(G.subPath(sp.path, sp.leadIn, G.pathLength(sp.path) - sp.leadOut))}" fill="none" stroke="${col}" stroke-width="${Math.max(0.8, S / 90)}"/>`);
      el.push(`<path d="${pth(G.subPath(sp.path, 0, sp.leadIn))}" fill="none" stroke="${col}" stroke-width="${Math.max(0.8, S / 90)}" stroke-dasharray="2,2"/>`);
      const b = G.bbox(l.shape.outer);
      el.push(`<text x="${X({ x: (b.x0 + b.x1) / 2 })}" y="${Y({ y: (b.y0 + b.y1) / 2 })}" font-size="${Math.max(9, S / 8)}" font-weight="bold" fill="${col}" text-anchor="middle" stroke="#fff" stroke-width="3" paint-order="stroke">${rid}.L${l.loopId.slice(1)} · ${l.heatingLength.toFixed(1)} m</text>`);
    }
  // transfer leads: supply red, return blue (the engine's centrelines)
  for (const l of tr.leads.filter((x) => x.path.length >= 2)) el.push(`<path d="${pth(l.path)}" fill="none" stroke="${l.kind === 'supply' ? '#d50000' : '#0d47a1'}" stroke-width="${Math.max(0.7, S / 160)}"/>`);
  // manifold
  const P = portsOf(fx.collector);
  const used = new Set(tr.portOrder.map((_, i) => i));
  const pts = P.flatMap((p) => [p.supply, p.ret]);
  const mb = G.bbox(pts);
  el.push(`<rect x="${X({ x: mb.x0 - 0.04 })}" y="${Y({ y: mb.y1 + 0.06 })}" width="${(mb.x1 - mb.x0 + 0.08) * S}" height="${(mb.y1 - mb.y0 + 0.08) * S}" fill="#fff59d" stroke="#f57f17"/>`);
  P.forEach((p, i) => {
    for (const [q, col] of [[p.supply, '#d50000'], [p.ret, '#0d47a1']]) el.push(`<circle cx="${X(q)}" cy="${Y(q)}" r="${Math.max(1.5, S / 60)}" fill="${used.has(i) ? col : '#bdbdbd'}"/>`);
  });
  el.push(`<text x="${X({ x: mb.x1 + 0.08 })}" y="${Y({ y: mb.y1 + 0.1 })}" font-size="${Math.max(9, S / 8)}" font-weight="bold">${fx.collector.id} · ${fx.collector.outlets} outlets · ${tr.portOrder.length} used</text>`);
  for (const r of fx.rooms) {
    const c = G.bbox(r.poly);
    const x = m.rooms[r.id];
    el.push(`<text x="${X({ x: c.x0 + 0.15 })}" y="${Y({ y: c.y1 - 0.15 }) + S / 6}" font-size="${Math.max(10, S / 6)}" font-weight="bold" fill="#263238">${r.id}</text>`);
    if (x) el.push(`<text x="${X({ x: c.x0 + 0.15 })}" y="${Y({ y: c.y1 - 0.15 }) + S / 3.2}" font-size="${Math.max(8, S / 10)}" fill="#263238">h ${x.heatingPitch * 1000} mm · cov(U′) ${(100 * x.coverageUprime).toFixed(1)} %</text>`);
  }
  const lines = [];
  if (notes) {
    lines.push(title ?? '');
    lines.push(`engine: roomgraph + corridor (7B) + frozen Phase 6 planner · transfers ${m.status}${m.issues.length ? ' — ' + m.issues.map((i) => i.msg).join('; ') : ''}`);
    lines.push(`heating on U′: ${m.heatingIssues.length ? m.heatingIssues.map((i) => i.msg).join('; ') : 'every room ≥ 85 % coverage(U′)'}`);
    lines.push(`leadWallOffset ${run.params.leadWallOffset * 1000} mm · leadSpacing ${run.params.leadSpacing * 1000} mm · heatingPitch ${run.params.heatingPitch * 1000} mm · collectorPortPitch ${fx.collector.portPitch_m * 1000} mm · pipe ${tr.params.pipeType} (OD ${tr.params.pipeOD * 1000} mm) · lead crossings ${m.leadCrossings}`);
    for (const [rid, x] of Object.entries(m.rooms))
      lines.push(`${rid.padEnd(3)} ${x.role.padEnd(16)} U ${x.U_m2.toFixed(2)} − C ${x.C_m2.toFixed(2)} = U′ ${x.Uprime_m2.toFixed(2)} · H ${x.H_m2.toFixed(2)} · cov(U′) ${(100 * x.coverageUprime).toFixed(1)} % · loops ${x.loops.length} · min heating spacing ${x.minHeatingSpacing_m ? (x.minHeatingSpacing_m * 1000).toFixed(1) : '—'} mm · lead↔wall ${x.leadWallMin_m ? (x.leadWallMin_m * 1000).toFixed(1) + ' mm' : '—'} · ${x.bundles.map((b) => `bundle ${b.leads} leads, span ${b.span_m.toFixed(3)}, width ${b.width_m.toFixed(3)}, depth ${b.depth_m.toFixed(3)} m → ${b.exits.join(',')}`).join(' | ')}`);
    lines.push(`doors: ${m.doors.map((d) => `${d.door} ${d.leads} leads need ${d.need_m.toFixed(3)} / ${d.width_m} m ${d.ok ? 'OK' : 'EXCEEDED'}`).join(' · ')}`);
    lines.push('red / blue: supply / return transfer leads · orange: corridor exclusion C · dashed: U′ · coloured: heating loops (dashed: lead-in to its region exit — 7C) · grey: walls, bathtub');
  }
  const fs1 = Math.max(11, 12);
  const txt = lines.map((l, i) => `<text x="8" y="${Hh + 18 + i * 17}" font-size="${i ? fs1 : 14}" font-family="monospace" ${i ? '' : 'font-weight="bold"'}>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(W, 1500).toFixed(0)}" height="${(Hh + 24 + lines.length * 17).toFixed(0)}" style="background:#fff" font-family="sans-serif"><rect width="100%" height="100%" fill="#fff"/>${el.join('')}${txt}</svg>`;
}

if (process.argv[1]?.endsWith('ufh-transfer-debug.mjs')) {
  const [file, ls, out, detail] = process.argv.slice(2);
  const fx = JSON.parse(fs.readFileSync(file, 'utf8'));
  const t0 = Date.now();
  const run = runTransfers(fx, { leadSpacing: +ls });
  const ms = Date.now() - t0;
  const m = metricsOf(run);
  console.log(JSON.stringify({ ms, ...m }, null, 1));
  fs.writeFileSync(out, renderTransfers(run, { title: `${file.split('/').pop()} — leadSpacing ${+ls * 1000} mm` }));
  if (detail) fs.writeFileSync(detail, renderTransfers(run, { title: 'detail', view: { x0: 3.0, y0: -0.3, x1: 7.6, y1: 3.2 }, scale: 300, notes: false }));
}
