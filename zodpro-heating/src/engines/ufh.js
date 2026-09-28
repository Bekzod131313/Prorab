// Underfloor heating (water) engine — simplified EN 1264 approach.
//   q = Q_room / A_active                             [W/m²]
//   Surface temperature: q = 8.92 · (θF,m − θi)^1.1    (EN 1264-2 base characteristic)
//   Heating medium:      q = K_H · ΔθH,  ΔθH = (ts − tr) / ln((ts − ti)/(tr − ti))
//   K_H depends on spacing (screed 45 mm over pipe, tile covering R = 0.01 m²K/W) — table below.
//   Loop length L = A / spacing + 2 · lead length; loops split so L ≤ max loop length.
//   Flow per loop from Q_loop · (1 + downward loss share) / (cp · (ts − tr)).

import { flowFromHeat, pipeSegment } from './hydraulics.js';
import { lmtd } from './radiator.js';
import { PIPE_MATERIALS } from '../data/products.js';

export const UFH_VERSION = 'ufh/1.1';

export const KH_BY_SPACING = { 0.1: 6.7, 0.15: 5.9, 0.2: 5.1, 0.25: 4.5, 0.3: 4.0 };
export const SPACINGS = [0.1, 0.15, 0.2, 0.25, 0.3];

export function surfaceTemp(q, ti) {
  if (q <= 0) return ti;
  return ti + (q / 8.92) ** (1 / 1.1);
}

/** Heat flux the UFH can emit for spacing/regime. */
export function fluxCapacity(spacing, ts, tr, ti) {
  const kh = KH_BY_SPACING[spacing] ?? 5.1;
  return kh * lmtd(ts, tr, ti);
}

/**
 * @param {object} args { Q (W), area (m²), ti, ts, tr, spacing? (auto if null), leadLength (m),
 *                        maxLoop (m), maxSurface (°C), pipe {material, dn}, maxLoopKpa, downwardShare }
 */
export function designUfh(args) {
  const {
    Q,
    area,
    ti,
    ts,
    tr,
    leadLength = 5,
    maxLoop = 100,
    maxSurface = 29,
    maxLoopKpa = 20,
    downwardShare = 0.1,
    pipe = { material: 'PEX', dn: '16' },
    edgeZoneShare = 0,
  } = args;
  const warnings = [];
  const activeArea = area * 0.92; // furniture/edge exclusions
  const q = activeArea > 0 ? Q / activeArea : 0;
  // spacing: largest that still covers the load (lower cost), unless forced
  let spacing = args.spacing;
  if (!spacing) {
    spacing = 0.1;
    for (const s of [...SPACINGS].reverse()) {
      if (fluxCapacity(s, ts, tr, ti) >= q) {
        spacing = s;
        break;
      }
    }
  }
  const capacity = fluxCapacity(spacing, ts, tr, ti);
  const qOut = Math.min(q, capacity);
  const Qout = qOut * activeArea;
  if (capacity < q) warnings.push({ code: 'ufh_insufficient', params: { q: Math.round(q), cap: Math.round(capacity) } });
  const tSurf = surfaceTemp(qOut, ti);
  if (tSurf > maxSurface) warnings.push({ code: 'ufh_surface_high', params: { t: tSurf.toFixed(1), max: maxSurface } });

  const coilLength = activeArea / spacing;
  let loops = Math.max(1, Math.ceil((coilLength + 2 * leadLength) / maxLoop));
  const loopLen = coilLength / loops + 2 * leadLength;
  const mat = PIPE_MATERIALS[pipe.material];
  const size = mat?.sizes.find((s) => s.dn === String(pipe.dn)) ?? { id: 0.012 };
  const Qloop = (Qout * (1 + downwardShare)) / loops;
  const f = flowFromHeat(Qloop, ts - tr, (ts + tr) / 2);
  // bends of a serpentine: roughly one 180° turn per run (≈ zeta 0.5 each, bent pipe)
  const turns = Math.max(0, Math.round(Math.sqrt(activeArea / loops) / spacing));
  const seg = pipeSegment({ vM3s: f.vM3s, dInner: size.id, k: mat?.k ?? 7e-6, length: loopLen, zeta: turns * 0.5, tm: (ts + tr) / 2 });
  if (seg.dp / 1000 > maxLoopKpa) {
    // add loops until pressure drop is acceptable
    let n = loops;
    let s2 = seg;
    let L2 = loopLen;
    let f2 = f;
    while (s2.dp / 1000 > maxLoopKpa && n < 20) {
      n++;
      L2 = coilLength / n + 2 * leadLength;
      f2 = flowFromHeat((Qout * (1 + downwardShare)) / n, ts - tr, (ts + tr) / 2);
      s2 = pipeSegment({ vM3s: f2.vM3s, dInner: size.id, k: mat?.k ?? 7e-6, length: L2, zeta: turns * 0.5, tm: (ts + tr) / 2 });
    }
    warnings.push({ code: 'ufh_loops_increased', params: { from: loops, to: n } });
    loops = n;
    return finish(L2, f2, s2);
  }
  return finish(loopLen, f, seg);

  function finish(Lloop, flow, s) {
    if (Lloop > maxLoop) warnings.push({ code: 'ufh_loop_long', params: { L: Lloop.toFixed(0), max: maxLoop } });
    return {
      version: UFH_VERSION,
      q,
      qOut,
      Qout,
      capacity,
      spacing,
      tSurf,
      loops,
      loopLength: Lloop,
      totalLength: Lloop * loops,
      flowPerLoopLh: flow.vLh,
      vM3sPerLoop: flow.vM3s,
      velocity: s.v,
      dpLoop: s.dp,
      pattern: args.pattern ?? 'auto',
      pipe,
      warnings,
    };
  }
}

/**
 * Replace the estimated loop lengths with the real layout geometry (coil + leads) and recompute
 * flow / Δp per loop. Adds loops while any loop exceeds the maximum length.
 * @param d result of designUfh
 * @param layoutFn (loops) => layoutRoomUfh(...) result
 */
export function refineWithLayout(d, layoutFn, { ts, tr, maxLoop = 100, maxLoopKpa = 20, downwardShare = 0.1 }) {
  let loops = d.loops;
  let lay = layoutFn(loops);
  if (!lay.loops.length) return { ...d, layout: [], layoutApprox: lay.approx, warnings: [...d.warnings, { code: 'ufh_room_too_small' }] };
  const longest = (l) => Math.max(...l.loops.map((x) => x.length));
  while (longest(lay) > maxLoop && loops < 20) {
    loops++;
    lay = layoutFn(loops);
  }
  const mat = PIPE_MATERIALS[d.pipe.material];
  const size = mat?.sizes.find((z) => z.dn === String(d.pipe.dn)) ?? { id: 0.012 };
  const tm = (ts + tr) / 2;
  let dpMax = 0;
  let totalLength = 0;
  const details = lay.loops.map((l) => {
    // heat split by coil length (each loop covers the floor it is laid in)
    const coilTotal = lay.loops.reduce((a, x) => a + x.coilLength, 0) || 1;
    const Q = d.Qout * (1 + downwardShare) * (l.coilLength / coilTotal);
    const f = flowFromHeat(Math.max(Q, 1), ts - tr, tm);
    const seg = pipeSegment({ vM3s: f.vM3s, dInner: size.id, k: mat?.k ?? 7e-6, length: l.length, zeta: l.corners * 0.3, tm });
    dpMax = Math.max(dpMax, seg.dp);
    totalLength += l.length;
    return { ...l, Q, flowLh: f.vLh, velocity: seg.v, dp: seg.dp };
  });
  const warnings = d.warnings.filter((w) => w.code !== 'ufh_loop_long' && w.code !== 'ufh_loops_increased');
  if (loops !== d.loops) warnings.push({ code: 'ufh_loops_increased', params: { from: d.loops, to: loops } });
  const maxL = Math.max(...details.map((x) => x.length));
  if (maxL > maxLoop) warnings.push({ code: 'ufh_loop_long', params: { L: maxL.toFixed(0), max: maxLoop } });
  if (dpMax / 1000 > maxLoopKpa) warnings.push({ code: 'ufh_dp_high', params: { dp: (dpMax / 1000).toFixed(1), max: maxLoopKpa } });
  if (lay.approx) warnings.push({ code: 'ufh_layout_approx' });
  return {
    ...d,
    loops,
    loopLength: maxL,
    totalLength,
    flowPerLoopLh: Math.max(...details.map((x) => x.flowLh)),
    velocity: Math.max(...details.map((x) => x.velocity)),
    dpLoop: dpMax,
    layout: details,
    geometric: true,
    warnings,
  };
}
