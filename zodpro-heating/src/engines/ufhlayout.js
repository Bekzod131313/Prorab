// Underfloor-heating loop geometry (the real pipe path, used by the plan, 3D, lengths and Δp).
//
//  • Spiral ("ulitka", bifilar counter-flow): the supply spirals inwards with a 2·s gap, reverses at
//    the centre and the return spirals outwards between the supply runs → supply and return runs
//    alternate every s, which gives an even floor temperature. No crossings.
//  • Double serpentine ("двойная змейка"): supply/return as a parallel pair along a meander.
//  • Serpentine ("zmeyka"): parallel runs at spacing s with U-turns; the return lead runs back
//    along the edge zone to the entry corner.
//  • Several loops per room: the room is split into equal strips along its longer side.
//  • Leads: orthogonal route from the loop start/end to the manifold outlet (supply / return port).
//  • Corners are rounded with the pipe's minimum bending radius (≥ 5·OD, capped at s/2).

import { polygonArea } from '../core/util.js';

export const UFH_LAYOUT_VERSION = 'ufh-layout/1.1';

const r3 = (v) => Math.round(v * 1000) / 1000;

export function pathLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

/** Rectangular spiral with gap `gap`, starting at (x0,y0) going +x, clockwise (screen coords). */
function spiral(x0, y0, x1, y1, gap) {
  const pts = [{ x: x0, y: y0 }];
  let l = x0;
  let t = y0;
  let r = x1;
  let b = y1;
  const min = gap * 0.6;
  for (let guard = 0; guard < 500; guard++) {
    if (r - l < min) break;
    pts.push({ x: r, y: t });
    if (b - t < min) break;
    pts.push({ x: r, y: b });
    pts.push({ x: l, y: b });
    t += gap;
    if (b - t < min) break;
    pts.push({ x: l, y: t });
    l += gap;
    r -= gap;
    b -= gap;
  }
  return pts;
}

/** Bifilar counter-flow spiral inside the rectangle; start & end both near (x0,y0). */
export function spiralLoop(x0, y0, x1, y1, s) {
  const sup = spiral(x0, y0, x1, y1, 2 * s);
  const ret = spiral(x0 + s, y0 + s, x1 - s, y1 - s, 2 * s).reverse();
  // centre reversal: supply end → return start
  const a = sup[sup.length - 1];
  const b = ret[0];
  const mid = Math.abs(a.x - b.x) > Math.abs(a.y - b.y) ? [{ x: b.x, y: a.y }] : [{ x: a.x, y: b.y }];
  return { coil: [...sup, ...mid, ...ret], split: sup.length + mid.length - 1 };
}

/** Offset an open polyline sideways by d (positive = left of travel direction, screen coords). */
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
 * Double serpentine ("двойная змейка", bifilar meander): supply and return run as a parallel pair
 * s apart along a meander with 2·s pitch, turning at the far end — both ends at the entry corner,
 * supply/return alternate every s like the spiral, and there are no crossings (offset curves).
 */
export function doubleSerpentineLoop(x0, y0, x1, y1, s) {
  const c = [];
  let dir = 1;
  const xa = x0 + s / 2;
  const xb = x1 - s / 2;
  for (let y = y0 + s / 2; y <= y1 - s / 2 + 1e-9; y += 2 * s) {
    c.push({ x: dir > 0 ? xa : xb, y }, { x: dir > 0 ? xb : xa, y });
    dir = -dir;
  }
  if (c.length < 2) return { coil: [], split: 0 };
  const sup = offsetPolyline(c, s / 2);
  const ret = offsetPolyline(c, -s / 2).reverse();
  return { coil: [...sup, ...ret], split: sup.length };
}

/** Serpentine inside the rectangle; runs parallel to x. Returns coil ending back at the start edge. */
export function serpentineLoop(x0, y0, x1, y1, s, edge) {
  const pts = [];
  let dir = 1;
  let y = y0;
  for (; y <= y1 + 1e-9; y += s) {
    pts.push({ x: dir > 0 ? x0 : x1, y }, { x: dir > 0 ? x1 : x0, y });
    dir = -dir;
  }
  const last = pts[pts.length - 1];
  // return lead back along the edge zone to the entry side
  const back = last.x === x0 ? [{ x: x0 - edge / 2, y: last.y }, { x: x0 - edge / 2, y: y0 - edge / 2 }] : [{ x: x1 + edge / 2, y: last.y }, { x: x1 + edge / 2, y: y0 - edge / 2 }, { x: x0 - edge / 2, y: y0 - edge / 2 }];
  return { coil: [...pts, ...back], split: Math.ceil(pts.length / 2) };
}

/** Round the corners of an orthogonal polyline with radius r (arc approximated by `n` segments). */
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
    if (rr < 1e-4) {
      out.push(p);
      continue;
    }
    const ua = { x: (p.x - a.x) / la, y: (p.y - a.y) / la };
    const uc = { x: (c.x - p.x) / lc, y: (c.y - p.y) / lc };
    const s0 = { x: p.x - ua.x * rr, y: p.y - ua.y * rr };
    const s1 = { x: p.x + uc.x * rr, y: p.y + uc.y * rr };
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      // quadratic Bézier through the corner (tangent-continuous)
      const x = (1 - t) * (1 - t) * s0.x + 2 * (1 - t) * t * p.x + t * t * s1.x;
      const y = (1 - t) * (1 - t) * s0.y + 2 * (1 - t) * t * p.y + t * t * s1.y;
      out.push({ x, y });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function orthoLead(a, b, horizontalFirst) {
  const c = horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  return [a, c, b].filter((p, i, arr) => i === 0 || Math.hypot(p.x - arr[i - 1].x, p.y - arr[i - 1].y) > 1e-4);
}

/**
 * Layout all loops of one room.
 * @param {object} o { polygon, loops, spacing, pattern: 'spiral'|'serpentine', inset, bendRadius,
 *                     ports: [{supply:{x,y}, return:{x,y}}] (one per loop, optional), toward:{x,y} }
 * @returns {{ loops: [{coil, supplyLead, returnLead, path, coilLength, leadLength, length, corners}], approx }}
 */
export function layoutRoomUfh(o) {
  const { polygon, spacing: s, pattern = 'spiral', inset = 0.25, bendRadius = 0.08 } = o;
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const bx0 = Math.min(...xs) + inset;
  const bx1 = Math.max(...xs) - inset;
  const by0 = Math.min(...ys) + inset;
  const by1 = Math.max(...ys) - inset;
  const bboxArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  const approx = Math.abs(Math.abs(polygonArea(polygon)) - bboxArea) > 0.05 * bboxArea;
  if (bx1 - bx0 < 2 * s || by1 - by0 < 2 * s) return { loops: [], approx, tooSmall: true };
  const n = Math.max(1, o.loops | 0);
  const toward = o.toward ?? { x: bx0, y: by0 };
  // split along the longer side into n strips; order strips from the collector side outward
  const horizontalStrips = bx1 - bx0 >= by1 - by0; // strips side by side along x
  const strips = [];
  for (let k = 0; k < n; k++) {
    if (horizontalStrips) {
      const w = (bx1 - bx0) / n;
      strips.push({ x0: bx0 + k * w + (k ? s / 2 : 0), x1: bx0 + (k + 1) * w - (k < n - 1 ? s / 2 : 0), y0: by0, y1: by1 });
    } else {
      const h = (by1 - by0) / n;
      strips.push({ x0: bx0, x1: bx1, y0: by0 + k * h + (k ? s / 2 : 0), y1: by0 + (k + 1) * h - (k < n - 1 ? s / 2 : 0) });
    }
  }
  const cx = (r) => (r.x0 + r.x1) / 2;
  const cy = (r) => (r.y0 + r.y1) / 2;
  strips.sort((a, b) => Math.hypot(cx(a) - toward.x, cy(a) - toward.y) - Math.hypot(cx(b) - toward.x, cy(b) - toward.y));
  const minBend = Math.min(bendRadius, s / 2);
  const out = [];
  strips.forEach((r) => {
    const k = out.length;
    // pick the strip corner nearest to the manifold as entry; generate in a normalised frame
    const fx = Math.abs(r.x1 - toward.x) < Math.abs(r.x0 - toward.x);
    const fy = Math.abs(r.y1 - toward.y) < Math.abs(r.y0 - toward.y);
    const W = r.x1 - r.x0;
    const H = r.y1 - r.y0;
    // pattern per strip: 'auto' → spiral ("ulitka") for compact areas, double serpentine for long / narrow ones
    const pat = pattern === 'auto' || !pattern ? (Math.max(W, H) / Math.min(W, H) > 1.8 || Math.min(W, H) < 1.2 ? 'double_serpentine' : 'spiral') : pattern;
    // meanders run along the longer side
    const along = W >= H;
    const gen =
      pat === 'serpentine'
        ? serpentineLoop(0, 0, along ? W : H, along ? H : W, s, inset)
        : pat === 'double_serpentine'
          ? doubleSerpentineLoop(0, 0, along ? W : H, along ? H : W, s)
          : spiralLoop(0, 0, W, H, s);
    const turn = pat !== 'spiral' && !along ? (p) => ({ x: p.y, y: p.x }) : (p) => p;
    const map = (p0) => {
      const p = turn(p0);
      return { x: r3(fx ? r.x1 - p.x : r.x0 + p.x), y: r3(fy ? r.y1 - p.y : r.y0 + p.y) };
    };
    if (!gen.coil.length) return;
    // supply part and return part are rounded separately so the split survives rounding
    const supSharp = gen.coil.slice(0, gen.split).map(map);
    const retSharp = gen.coil.slice(gen.split).map(map);
    const coilSharp = [...supSharp, ...retSharp];
    const supR = roundCorners(supSharp, minBend);
    const coil = [...supR, ...roundCorners(retSharp, minBend)];
    const split = supR.length;
    const start = coil[0];
    const end = coil[coil.length - 1];
    const port = o.ports?.[k];
    const supplyLead = port ? orthoLead(port.supply, start, false) : [];
    const returnLead = port ? orthoLead(end, port.return, true) : [];
    const coilLength = pathLength(coil);
    const leadLength = (supplyLead.length ? pathLength(supplyLead) : 0) + (returnLead.length ? pathLength(returnLead) : 0);
    out.push({
      strip: r,
      coil,
      split,
      pattern: pat,
      supplyLead,
      returnLead,
      coilLength,
      leadLength,
      length: coilLength + leadLength,
      corners: coilSharp.length - 2,
    });
  });
  return { loops: out, approx, version: UFH_LAYOUT_VERSION };
}
