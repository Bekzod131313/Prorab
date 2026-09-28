// Underfloor-heating loop geometry (the real pipe path, used by the plan, 3D, lengths and Δp).
//
// Every bifilar pattern is built from a CENTRELINE with pitch 2·s that is offset by ±s/2:
// the two offsets are the supply and the return pipe, so the pipe spacing is exactly s everywhere,
// supply and return alternate, the two ends sit side by side at the entry corner and a round
// U-turn (radius s/2) closes the loop at the far end. Offset curves of a simple path never cross.
//
//  • Spiral ("ulitka", bifilar counter-flow): rectangular spiral centreline.
//  • Double serpentine ("двойная змейка"): meander centreline, columns running away from the manifold.
//  • Serpentine ("zmeyka"): single meander at pitch s, return pipe back along the entry edge.
//
// Room organisation (like the reference drawings):
//  • the room side nearest the manifold is the entry side; a lead band runs along it (inside the
//    edge zone) and every loop strip touches it, so no lead ever crosses a coil;
//  • loops are ordered along that side and connected to the manifold outlets in the same order
//    (nested, crossing-free); leads run on parallel tracks at `leadPitch` and turn down to the ports;
//  • corners are rounded with the pipe's minimum bending radius (≥ 5·OD, capped at s/2).

import { polygonArea } from '../core/util.js';

export const UFH_LAYOUT_VERSION = 'ufh-layout/2.0';

const r3 = (v) => Math.round(v * 1000) / 1000;

export function pathLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

/** Drop repeated points and collinear middle points. */
export function cleanPath(pts, eps = 1e-6) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.hypot(p.x - q.x, p.y - q.y) < eps) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const cross = (q.x - a.x) * (p.y - q.y) - (q.y - a.y) * (p.x - q.x);
      const dot = (q.x - a.x) * (p.x - q.x) + (q.y - a.y) * (p.y - q.y);
      if (Math.abs(cross) < eps && dot > 0) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

/**
 * Rectangular spiral centreline starting at (l,b), first run along +y (away from the entry edge),
 * clockwise in a y-up frame, successive rings `gap` apart. Stops when a run would be < min.
 */
export function spiralCenterline(l, b, r, t, gap, min = gap * 0.65) {
  const pts = [{ x: l, y: b }];
  let L = l;
  let R = r;
  let T = t;
  let B = b;
  for (let g = 0; g < 500; g++) {
    const cur = pts[pts.length - 1];
    if (T - cur.y < min) break;
    pts.push({ x: L, y: T });
    if (R - L < min) break;
    pts.push({ x: R, y: T });
    if (T - B < min) break;
    pts.push({ x: R, y: B });
    if (R - (L + gap) < min) break;
    pts.push({ x: L + gap, y: B });
    L += gap;
    R -= gap;
    T -= gap;
    B += gap;
  }
  return pts;
}

/** Meander centreline: columns along y at x = l, l+pitch, … ≤ r, starting at (l,b) going +y. */
export function meanderCenterline(l, b, r, t, pitch) {
  const pts = [];
  let up = true;
  for (let x = l; x <= r + 1e-9; x += pitch) {
    pts.push({ x, y: up ? b : t }, { x, y: up ? t : b });
    up = !up;
  }
  return pts;
}

/** Offset an open polyline sideways by d (positive = right of travel in a y-up frame). */
export function offsetPolyline(pts, d) {
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const n = { x: (b.y - a.y) / L, y: -(b.x - a.x) / L };
    segs.push([{ x: a.x + n.x * d, y: a.y + n.y * d }, { x: b.x + n.x * d, y: b.y + n.y * d }]);
  }
  const out = [segs[0][0]];
  for (let i = 1; i < segs.length; i++) {
    const [p1, p2] = segs[i - 1];
    const [p3, p4] = segs[i];
    const den = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if (Math.abs(den) < 1e-12) {
      out.push(p3);
      continue;
    }
    const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / den;
    out.push({ x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) });
  }
  out.push(segs[segs.length - 1][1]);
  return out;
}

/**
 * Supply/return pair from a centreline: offsets ±s/2 joined by a semicircular U-turn at the end.
 * Supply = the offset whose start has the smaller x. Returns { sup: start→tip, ret: tip→end }.
 */
export function bifilarFromCenterline(center, s, arcSeg = 6) {
  const a = offsetPolyline(center, s / 2);
  const c = offsetPolyline(center, -s / 2);
  const [sup, ret] = a[0].x <= c[0].x ? [a, c] : [c, a];
  const e1 = sup[sup.length - 1];
  const e2 = ret[ret.length - 1];
  const C = { x: (e1.x + e2.x) / 2, y: (e1.y + e2.y) / 2 };
  const p = center[center.length - 2];
  const q = center[center.length - 1];
  const L = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const dir = { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
  const v1 = { x: e1.x - C.x, y: e1.y - C.y };
  const arc = [];
  for (let k = 1; k < arcSeg; k++) {
    const th = (k / arcSeg) * Math.PI;
    arc.push({ x: C.x + v1.x * Math.cos(th) + dir.x * (s / 2) * Math.sin(th), y: C.y + v1.y * Math.cos(th) + dir.y * (s / 2) * Math.sin(th) });
  }
  const h = Math.floor(arc.length / 2);
  return { sup: [...sup, ...arc.slice(0, h + 1)], ret: [...arc.slice(h), ...[...ret].reverse()] };
}

/** Bifilar counter-flow spiral inside the rectangle; both ends at the (x0,y0) corner, s apart. */
export function spiralLoop(x0, y0, x1, y1, s) {
  const c = spiralCenterline(x0 + s / 2, y0 + s / 2, x1 - s / 2, y1 - s / 2, 2 * s, 1.3 * s);
  if (c.length < 2) return { coil: [], split: 0, sup: [], ret: [] };
  const { sup, ret } = bifilarFromCenterline(c, s);
  return { coil: [...sup, ...ret.slice(1)], split: sup.length, sup, ret };
}

/** Double serpentine: supply/return pair along a meander of 2·s pitch, U-turn at the far column. */
export function doubleSerpentineLoop(x0, y0, x1, y1, s) {
  // columns at exactly 2·s; the leftover width is split evenly to both sides
  const m = Math.floor((x1 - x0 - s) / (2 * s) + 1e-9) + 1;
  const pad = Math.max(0, (x1 - x0 - s - (m - 1) * 2 * s) / 2);
  const c = meanderCenterline(x0 + pad + s / 2, y0 + s / 2, x1 - pad - s / 2 + 1e-6, y1 - s / 2, 2 * s);
  if (c.length < 2 || y1 - y0 < 2 * s) return { coil: [], split: 0, sup: [], ret: [] };
  const { sup, ret } = bifilarFromCenterline(c, s);
  return { coil: [...sup, ...ret.slice(1)], split: sup.length, sup, ret };
}

/**
 * Single serpentine: columns at pitch s (even count so it ends at the entry edge), the return pipe
 * runs back along the entry edge (y = y0) and ends at x0 + 1.5·s, next to the supply start (x0 + s/2, y0 + s).
 */
export function serpentineLoop(x0, y0, x1, y1, s) {
  let m = Math.floor((x1 - x0 - s) / s + 1e-9) + 1;
  if (m % 2) m -= 1;
  if (m < 2 || y1 - y0 < 3 * s) return { coil: [], split: 0, sup: [], ret: [] };
  const sup = meanderCenterline(x0 + s / 2, y0 + s, x0 + s / 2 + (m - 1) * s, y1 - s / 2, s);
  const last = sup[sup.length - 1];
  const ret = [last, { x: last.x, y: y0 }, { x: x0 + 1.5 * s, y: y0 }];
  return { coil: [...sup, ...ret.slice(1)], split: sup.length, sup, ret };
}

/** Round the corners of a polyline with radius r (quadratic Bézier, `n` segments per corner). */
export function roundCorners(pts, r, n = 4) {
  if (pts.length < 3 || r <= 0) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const a = pts[i - 1];
    const c = pts[i + 1];
    const la = Math.hypot(p.x - a.x, p.y - a.y);
    const lc = Math.hypot(c.x - p.x, c.y - p.y);
    const rr = Math.min(r, la / 2, lc / 2);
    const ua = { x: (p.x - a.x) / (la || 1), y: (p.y - a.y) / (la || 1) };
    const uc = { x: (c.x - p.x) / (lc || 1), y: (c.y - p.y) / (lc || 1) };
    // skip nearly straight joints (arc points) and degenerate ones
    if (rr < 1e-4 || ua.x * uc.x + ua.y * uc.y > 0.95) {
      out.push(p);
      continue;
    }
    const s0 = { x: p.x - ua.x * rr, y: p.y - ua.y * rr };
    const s1 = { x: p.x + uc.x * rr, y: p.y + uc.y * rr };
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      out.push({ x: (1 - t) * (1 - t) * s0.x + 2 * (1 - t) * t * p.x + t * t * s1.x, y: (1 - t) * (1 - t) * s0.y + 2 * (1 - t) * t * p.y + t * t * s1.y });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function segDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Frame of a bbox side: u along the side, v into the room (raw bbox, no inset). */
function sideFrame(bb, side) {
  const { x0: X0, x1: X1, y0: Y0, y1: Y1 } = bb;
  const horiz = side === 'bottom' || side === 'top';
  return {
    side,
    U: horiz ? X1 - X0 : Y1 - Y0,
    D: horiz ? Y1 - Y0 : X1 - X0,
    toPlan: ({ x: u, y: v }) => (side === 'bottom' ? { x: X0 + u, y: Y0 + v } : side === 'top' ? { x: X0 + u, y: Y1 - v } : side === 'left' ? { x: X0 + v, y: Y0 + u } : { x: X1 - v, y: Y0 + u }),
    toFrame: (p) => (side === 'bottom' ? { x: p.x - X0, y: p.y - Y0 } : side === 'top' ? { x: p.x - X0, y: Y1 - p.y } : side === 'left' ? { x: p.y - Y0, y: p.x - X0 } : { x: p.y - Y0, y: X1 - p.x }),
  };
}

/**
 * Slabs of the room perpendicular to the entry side: for every u-interval between polygon vertices,
 * the depth of the floor that is reachable straight from the entry side (v from 0). Parts of an
 * L/T/U-shaped room that do not touch the entry side are not reachable (they need their own entry).
 */
export function roomSlabs(polygon, frame) {
  const P = polygon.map(frame.toFrame);
  const us = [...new Set(P.map((p) => Math.round(p.x * 1000) / 1000))].filter((u) => u > 1e-3 && u < frame.U - 1e-3);
  const cuts = [0, ...us.sort((a, b) => a - b), frame.U];
  const slabs = [];
  for (let i = 1; i < cuts.length; i++) {
    const ua = cuts[i - 1];
    const ub = cuts[i];
    if (ub - ua < 1e-3) continue;
    const um = (ua + ub) / 2;
    const vs = [];
    for (let k = 0; k < P.length; k++) {
      const a = P[k];
      const b = P[(k + 1) % P.length];
      if ((a.x - um) * (b.x - um) < 0) vs.push(a.y + ((um - a.x) / (b.x - a.x)) * (b.y - a.y));
    }
    vs.sort((a, b) => a - b);
    const depth = vs.length >= 2 && vs[0] < 0.05 ? vs[1] : 0;
    const last = slabs[slabs.length - 1];
    if (last && Math.abs(last.depth - depth) < 1e-3) last.ub = ub;
    else slabs.push({ ua, ub, depth });
  }
  return slabs;
}

/**
 * Layout all loops of one room.
 * @param {object} o { polygon, loops, spacing, pattern: 'auto'|'spiral'|'double_serpentine'|'serpentine',
 *                     inset, bendRadius, leadPitch, ports: [{supply:{x,y}, return:{x,y}}], toward:{x,y} }
 * @returns {{ loops: [{strip, coil, split, pattern, supplyLead, returnLead, coilLength, leadLength, length, corners, port}], approx, side, band }}
 *          loops[k] is connected to ports[k].
 *
 * The entry side is the room side from which the most floor is reachable (ties → nearest to the
 * manifold). All loops are strips perpendicular to it and share one lead band along it, so the
 * leads of every loop reach the manifold without crossing any coil — also in L/T/U-shaped rooms.
 */
export function layoutRoomUfh(o) {
  const { polygon, spacing: s, pattern = 'auto', inset = 0.25, bendRadius = 0.08, leadPitch = 0.05 } = o;
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const bb = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const area = Math.abs(polygonArea(polygon));
  if (bb.x1 - bb.x0 - 2 * inset < 2 * s || bb.y1 - bb.y0 - 2 * inset < 2 * s) return { loops: [], approx: false, tooSmall: true };
  const n = Math.max(1, o.loops | 0);
  const toward = o.toward ?? { x: bb.x0, y: bb.y0 };
  const minW = Math.max(0.6, 3 * s);
  // choose the entry side
  const cand = ['bottom', 'top', 'left', 'right'].map((side) => {
    const f = sideFrame(bb, side);
    const slabs = roomSlabs(polygon, f).filter((sl) => sl.depth - 2 * inset >= 2.5 * s && sl.ub - sl.ua >= minW * 0.8);
    const reach = slabs.reduce((a, sl) => a + (sl.ub - sl.ua) * sl.depth, 0);
    const t = f.toFrame(toward);
    const dist = Math.hypot(Math.max(0, -t.x, t.x - f.U), Math.max(0, t.y));
    return { side, f, slabs, reach, dist };
  });
  const bestReach = Math.max(...cand.map((c) => c.reach));
  const pick = cand.filter((c) => c.reach >= bestReach * 0.97).sort((a, b) => a.dist - b.dist)[0];
  const { f, slabs, side } = pick;
  const approx = pick.reach < 0.95 * area;
  if (!slabs.length) return { loops: [], approx, tooSmall: true };
  const { toPlan, toFrame, U } = f;
  const ports = o.ports?.length ? o.ports.slice(0, n) : null;
  // loops per slab ∝ area (≥ 1 each; more loops than asked when the room has more slabs)
  const areas = slabs.map((sl) => (sl.ub - sl.ua) * sl.depth);
  const total = Math.max(n, slabs.length);
  const alloc = areas.map(() => 1);
  while (alloc.reduce((a, b) => a + b, 0) < total) {
    // next loop to the slab with the widest strips (never narrower than minW)
    let bi = -1;
    for (let i = 0; i < slabs.length; i++) if ((slabs[i].ub - slabs[i].ua) / (alloc[i] + 1) >= minW && (bi < 0 || areas[i] / alloc[i] > areas[bi] / alloc[bi])) bi = i;
    if (bi < 0) bi = areas.reduce((b, a, i) => (a / alloc[i] > areas[b] / alloc[b] ? i : b), 0);
    alloc[bi]++;
  }
  const nl = alloc.reduce((a, b) => a + b, 0);
  const nPipes = 2 * Math.min(nl, ports?.length ?? 0);
  // lead band along the entry side: one track per lead pipe
  const minDepth = Math.min(...slabs.map((sl) => sl.depth));
  let band = ports ? leadPitch * (nPipes + 1) : 0;
  if (minDepth - 2 * inset - band < 2.5 * s) band = Math.max(0, minDepth - 2 * inset - 2.5 * s);
  const vBase = inset + band; // coil starts here
  const portsF = ports ? ports.map((p) => toFrame(p.supply)) : [];
  const uc = ports ? portsF.reduce((a, p) => a + p.x, 0) / portsF.length : Math.max(0, Math.min(U, toFrame(toward).x));
  const minBend = Math.min(bendRadius, s / 2);
  const loops = [];
  slabs.forEach((sl, si) => {
    const prev = slabs[si - 1];
    const next = slabs[si + 1];
    // a slab side next to a deeper/equal neighbour is interior (half gap); otherwise it is a wall
    const gapL = !prev ? inset : prev.depth >= sl.depth - 0.3 ? s / 2 : inset;
    const gapR = !next ? inset : next.depth >= sl.depth - 0.3 ? s / 2 : inset;
    const a0 = sl.ua + gapL;
    const a1 = sl.ub - gapR;
    const k = alloc[si];
    const w = (a1 - a0) / k;
    for (let j = 0; j < k; j++) {
      const u0 = a0 + j * w + (j ? s / 2 : 0);
      const u1 = a0 + (j + 1) * w - (j < k - 1 ? s / 2 : 0);
      const W = u1 - u0;
      const H = sl.depth - inset - vBase;
      if (W < 2 * s || H < 2 * s) continue;
      const mirror = Math.abs(u1 - uc) < Math.abs(u0 - uc);
      const pat = pattern === 'auto' || !pattern ? (Math.max(W, H) / Math.min(W, H) > 1.8 || Math.min(W, H) < 1.2 ? 'double_serpentine' : 'spiral') : pattern;
      const gen = pat === 'serpentine' ? serpentineLoop(0, 0, W, H, s) : pat === 'double_serpentine' ? doubleSerpentineLoop(0, 0, W, H, s) : spiralLoop(0, 0, W, H, s);
      if (!gen.sup.length) continue;
      const toF = (p) => ({ x: mirror ? u1 - p.x : u0 + p.x, y: vBase + p.y });
      const supF = gen.sup.map(toF);
      const retF = gen.ret.map(toF);
      loops.push({ u0, u1, depth: sl.depth - inset, pat, supF, retF, entryU: supF[0].x });
    }
  });
  // connect loops to ports in the same order along the entry side (nested → no crossings)
  const portOrder = ports ? portsF.map((p, i) => ({ i, u: p.x })).sort((a, b) => a.u - b.u) : [];
  loops.sort((a, b) => a.entryU - b.entryU);
  loops.forEach((l, j) => (l.port = ports ? portOrder[j]?.i ?? null : null));
  // lead pipes: descent point on the entry edge, turn point at the port
  const pipes = [];
  for (const l of loops) {
    if (l.port == null) continue;
    const P = ports[l.port];
    for (const pp of [
      { kind: 'supply', l, at: l.supF[0], port: P.supply },
      { kind: 'return', l, at: l.retF[l.retF.length - 1], port: P.return },
    ]) {
      pp.pf = toFrame(pp.port);
      pipes.push(pp);
    }
  }
  // turn slots near the ports (the ports' u, spread ≥ gap apart), assigned in the same order as the
  // descents along the entry side → pipes left of their slot run right and vice versa; in each group
  // the pipe nearest the slots takes the track closest to the coils → nested, crossing-free runs
  const gap = leadPitch / 2;
  pipes.sort((a, b) => a.at.x - b.at.x);
  const slots = pipes.map((p) => p.pf.x).sort((a, b) => a - b);
  for (let i = 1; i < slots.length; i++) slots[i] = Math.max(slots[i], slots[i - 1] + gap);
  pipes.forEach((p, i) => (p.ut = slots[i]));
  const rightGroup = pipes.filter((p) => p.at.x >= p.ut);
  const leftGroup = pipes.filter((p) => p.at.x < p.ut).reverse();
  for (const g of [rightGroup, leftGroup]) g.forEach((p, i) => (p.v = Math.max(inset / 2, vBase - leadPitch * (i + 1))));
  for (const p of pipes) {
    const path = cleanPath([p.at, { x: p.at.x, y: p.v }, { x: p.ut, y: p.v }, { x: p.ut, y: p.pf.y }, p.pf].map(toPlan));
    p.path = roundCorners(path, Math.min(0.03, leadPitch / 2), 3).map((q) => ({ x: r3(q.x), y: r3(q.y) }));
    p.path[0] = toPlan(p.at);
    p.path[p.path.length - 1] = { ...p.port };
  }
  const out = [];
  for (const l of loops) {
    const supSharp = cleanPath(l.supF.map(toPlan));
    const retSharp = cleanPath(l.retF.map(toPlan));
    const supR = roundCorners(supSharp, minBend).map((q) => ({ x: r3(q.x), y: r3(q.y) }));
    const retR = roundCorners(retSharp, minBend).map((q) => ({ x: r3(q.x), y: r3(q.y) }));
    const coil = [...supR, ...retR.slice(1)];
    const sp = pipes.find((p) => p.l === l && p.kind === 'supply');
    const rp = pipes.find((p) => p.l === l && p.kind === 'return');
    const supplyLead = sp ? [...sp.path].reverse() : [];
    const returnLead = rp ? rp.path : [];
    if (supplyLead.length) supplyLead[supplyLead.length - 1] = coil[0];
    if (returnLead.length) returnLead[0] = coil[coil.length - 1];
    const coilLength = pathLength(coil);
    const leadLength = pathLength(supplyLead) + pathLength(returnLead);
    const a = toPlan({ x: l.u0, y: vBase });
    const b = toPlan({ x: l.u1, y: l.depth });
    out.push({
      port: l.port,
      strip: { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) },
      coil,
      split: supR.length,
      pattern: l.pat,
      supplyLead,
      returnLead,
      coilLength,
      leadLength,
      length: coilLength + leadLength,
      corners: supSharp.length + retSharp.length - 3,
    });
  }
  // loops[k] ↔ ports[k]; without ports keep the order along the side
  if (ports) out.sort((a, b) => (a.port ?? 1e9) - (b.port ?? 1e9));
  return { loops: out, approx, side, band, version: UFH_LAYOUT_VERSION };
}
