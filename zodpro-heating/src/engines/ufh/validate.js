// Hard validation of a UFH layout (spec §35). Every check reports the exact place and a remedy;
// a layout with any error cannot be applied.
//
//   UFH-LEN     loop longer than the limit (supply + heating + return, incl. manifold drops)
//   UFH-COV     coverage below the threshold, or an uncovered patch larger than allowed
//   UFH-SPACE   two pipes closer than spacing − tolerance (crossings show up as 0 mm)
//   UFH-BEND    bend radius below the pipe's minimum
//   UFH-WALL    pipe closer to the wall than the wall clearance
//   UFH-OBST    pipe inside an obstacle's clearance
//   UFH-ZONE    heating pipe outside its zone
//   UFH-TOPO    loop not connected supply → loop → return of ONE circuit, or a circuit used twice

import * as G from './geom.js';
import { coverageAnalysis } from './coverage.js';

export const UFH_RULES = {
  spacingTol: 0.012, // pipes may come 12 mm closer at keyholes / jogs
  bendTol: 0.15, // 15 %: pipe table gives the cold-bending radius 5×OD; ≥ 4.25×OD is accepted (bending spring / guide)
  wallTol: 0.003,
  maxHole: 0.5, // m² — largest uncovered patch (≈ 0.7 × 0.7 m)
  coverageMin: 0.85,
};

const err = (code, msg, extra = {}) => ({ code, level: 'error', msg, ...extra });
const warn = (code, msg, extra = {}) => ({ code, level: 'warning', msg, ...extra });

/** Resample a polyline every `step` metres, keeping the arc length of each sample. */
function samples(pts, step) {
  const out = [];
  let acc = 0;
  out.push({ x: pts[0].x, y: pts[0].y, s: 0 });
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n, s: acc + (L * k) / n });
    acc += L;
  }
  return out;
}

/**
 * @param loops     [{ id, name, circuitId, path (plan, connector→connector), length, fan (lead's first
 *                  segment, exempt manifold fan), collectorId }]
 * @param ctx       { Z, U, obstacles (inflated by clearance), s, rmin, maxLoop, wallClearance,
 *                  coverageMin, maxHole, circuits (valid circuit ids), connectors: id → {supply, ret} }
 */
export function validateLayout(loops, ctx) {
  const R = { ...UFH_RULES, ...(ctx.rules ?? {}) };
  const s = ctx.s;
  const issues = [];
  const perLoop = loops.map(() => ({ errors: 0, warnings: 0 }));
  const push = (i, it) => {
    issues.push({ ...it, loop: loops[i]?.name ?? null, loopIndex: i });
    if (i != null && perLoop[i]) perLoop[i][it.level === 'error' ? 'errors' : 'warnings']++;
  };
  // manifold fan: the dense zone where pipes converge on the outlets (spacing rules waived)
  const fans = loops.map((l) => l.fan).filter((f) => f && f.length >= 2);
  // transit bundles (leads from the manifold through the doors) lie closer than s by design
  const transits = loops.map((l) => l.transit).filter((tr) => tr && tr.length >= 2);
  const nearTransit = (p) => transits.some((tr) => tr.some((q, k) => k > 0 && G.segDist(p, tr[k - 1], q) < 0.14));
  const inFan = (p) => fans.some((f) => G.segDist(p, f[0], f[1]) < s * 1.6) || nearTransit(p);
  const Zin = ctx.Z ? G.offset(ctx.Z, -(ctx.wallClearance ?? 0.1) + R.wallTol, 'round') : null;

  // ---- per loop ----
  const seen = new Map();
  loops.forEach((l, i) => {
    if (l.length > ctx.maxLoop + 1e-6) push(i, err('UFH-LEN', `${l.name}: uzunlik ${l.length.toFixed(1)} m > ${ctx.maxLoop} m — zonani bo‘lish yoki qayta yaratish kerak`, { at: l.path[Math.floor(l.path.length / 2)], value: l.length }));
    if (l.circuitId) {
      if (seen.has(l.circuitId)) push(i, err('UFH-TOPO', `${l.name}: ${l.circuitId} circuit ikkinchi marta ishlatilgan`, { at: l.path[0] }));
      seen.set(l.circuitId, i);
    }
    const con = ctx.connectors?.[l.circuitId];
    if (con) {
      const a = l.path[0];
      const b = l.path[l.path.length - 1];
      if (Math.hypot(a.x - con.supply.x, a.y - con.supply.y) > 0.002) push(i, err('UFH-TOPO', `${l.name}: boshlanishi ${l.circuitId} supply connectoriga ulanmagan`, { at: a }));
      if (Math.hypot(b.x - con.ret.x, b.y - con.ret.y) > 0.002) push(i, err('UFH-TOPO', `${l.name}: oxiri ${l.circuitId} return connectoriga ulanmagan`, { at: b }));
    } else if (ctx.connectors) push(i, err('UFH-TOPO', `${l.name}: kollektor circuit topilmadi (${l.circuitId ?? '—'})`, { at: l.path[0] }));
    // bends: the two connector hook-ups (vertical fittings at the manifold) are exempt
    const body = l.path.slice(1, -1);
    const minR = ctx.rmin * (1 - R.bendTol);
    // scan in 0.5 m windows so every tight spot is reported once (max 5 per loop)
    let reported = 0;
    const Lb = G.pathLength(body);
    for (let a = 0; a < Lb && reported < 5; a += 0.4) {
      const w = G.subPath(body, Math.max(0, a - 0.05), Math.min(Lb, a + 0.45));
      if (w.length < 2) continue;
      const m = G.minBendRadius(w);
      if (m.radius < minR - 0.001 && m.at && !inFan(m.at)) {
        push(i, err('UFH-BEND', `${l.name}: egilish radiusi ${(m.radius * 1000).toFixed(0)} mm < ${(ctx.rmin * 1000).toFixed(0)} mm`, { at: m.at, value: m.radius }));
        reported++;
      }
    }
    // wall clearance / zone / obstacles (sampled every 2 cm)
    const smp = samples(body, 0.02);
    let wallBad = null;
    let obstBad = null;
    for (const p of smp) {
      if (inFan(p)) continue;
      if (Zin && !wallBad && !G.pointInRegion(p, Zin)) wallBad = p;
      if (ctx.obstacles?.length && !obstBad && G.pointInRegion(p, ctx.obstaclesTight ?? ctx.obstacles)) obstBad = p;
    }
    if (wallBad) push(i, err(G.pointInRegion(wallBad, ctx.Z) ? 'UFH-WALL' : 'UFH-ZONE', `${l.name}: devorga ${((ctx.wallClearance ?? 0.1) * 1000).toFixed(0)} mm dan yaqin / zonadan tashqarida`, { at: wallBad }));
    if (obstBad) push(i, err('UFH-OBST', `${l.name}: to‘siq (obstacle) clearance ichida`, { at: obstBad }));
  });

  // ---- spacing / crossings between all pipes (spatial hash) ----
  const minGap = s - R.spacingTol;
  const cell = Math.max(minGap, 0.1);
  const grid = new Map();
  const pts = [];
  loops.forEach((l, i) => {
    for (const p of samples(l.path.slice(1, -1), 0.02)) {
      if (inFan(p)) continue;
      const q = { ...p, i };
      pts.push(q);
      const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(q);
    }
  });
  const flagged = new Set();
  for (const p of pts) {
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const q of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (q === p) continue;
          if (q.i === p.i && Math.abs(q.s - p.s) < Math.PI * s * 0.75 + 0.05) continue; // same pipe, around a bend
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d >= minGap) continue;
          const key = `${Math.min(p.i, q.i)}:${Math.round(p.x * 5)},${Math.round(p.y * 5)}`;
          if (flagged.has(key)) continue;
          flagged.add(key);
          if (flagged.size > 40) break;
          const cross = d < 0.012;
          push(p.i, err(cross ? 'UFH-CROSS' : 'UFH-SPACE', cross ? `${loops[p.i].name}: quvurlar kesishadi${q.i !== p.i ? ` (${loops[q.i].name})` : ''}` : `${loops[p.i].name}: quvurlar oralig‘i ${(d * 1000).toFixed(0)} mm < ${(s * 1000).toFixed(0)} mm`, { at: { x: p.x, y: p.y }, value: d }));
        }
  }

  // ---- coverage ----
  let cov = null;
  if (ctx.U && ctx.U.length) {
    cov = coverageAnalysis({ U: ctx.U, Z: ctx.Z, obstacles: ctx.obstacles ?? [], pipes: loops.map((l) => l.path), s, widths: loops.map((l) => Math.max(s, l.spacing ?? s)) });
    const cmin = ctx.coverageMin ?? R.coverageMin;
    if (cov.ratio < cmin) push(null, err('UFH-COV', `Qamrov ${(cov.ratio * 100).toFixed(1)} % < ${(cmin * 100).toFixed(0)} %`, { value: cov.ratio }));
    const mh = ctx.maxHole ?? R.maxHole;
    if (cov.largestHole > mh) push(null, err('UFH-COV', `Isitilmagan joy ${cov.largestHole.toFixed(2)} m² > ${mh} m²`, { at: cov.holes[0].at, value: cov.largestHole }));
    else if (cov.largestHole > mh / 2) push(null, warn('UFH-COV', `Isitilmagan joy ${cov.largestHole.toFixed(2)} m²`, { at: cov.holes[0].at, value: cov.largestHole }));
  }
  const errors = issues.filter((x) => x.level === 'error');
  return { ok: errors.length === 0, issues, errors, warnings: issues.filter((x) => x.level === 'warning'), perLoop, coverage: cov };
}
