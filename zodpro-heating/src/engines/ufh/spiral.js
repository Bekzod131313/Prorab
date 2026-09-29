// Centreline generators for bifilar UFH loops.
//
// A loop is the boundary of the s/2-buffer of a centreline TREE whose parallel branches are 2s
// apart — both pipes (supply out, return back) then run exactly s apart everywhere, and the loop is
// a single closed curve by construction (a tree has no cycles).
//
//   adaptive spiral  contour-parallel rings of the region at 2s pitch, each ring cut open 2s before
//                    its entry and bridged inwards → "snail" spiral that follows any polygon
//   serpentine       boustrophedon: lines at 2s pitch joined by rungs at alternating ends
//
// All functions work in the caller's frame; regions must be simply connected for the spiral
// (see removeHoles). Pure, deterministic.

import { offset, opening, area, asRegion, bbox, closestOnRing, pathLength, subPath, cleanPath, difference, isCCW, pointAt } from './geom.js';

const EPS = 1e-4;

/** Centreline corner radius: the inner pipe of a turn keeps rmin (+6 mm margin for discretisation). */
export const cornerRadius = (s, rmin) => Math.max(s + 0.006, rmin + s / 2 + 0.006);

/** Ring as a closed polyline starting (and ending) at the ring point nearest to E, in orientation sign (+1 CCW). */
export function ringFrom(ring, E, sign) {
  const r = (isCCW(ring) ? 1 : -1) === sign ? ring : [...ring].reverse();
  const c = closestOnRing(E, r);
  const n = r.length;
  const out = [c.p];
  for (let k = 1; k <= n; k++) out.push(r[(c.i + k) % n]);
  out.push(c.p);
  return cleanPath(out, 1e-6);
}

/** Orientation (+1 CCW / −1 CW) whose initial direction at E best matches dir; ties → prefer. */
export function chooseSign(ring, E, dir, prefer = 1) {
  const score = (sign) => {
    const p = ringFrom(ring, E, sign);
    const q = pointAt(p, Math.min(0.1, pathLength(p) / 4));
    const L = Math.hypot(q.x - p[0].x, q.y - p[0].y) || 1;
    return ((q.x - p[0].x) * dir.x + (q.y - p[0].y) * dir.y) / L;
  };
  const a = score(1);
  const b = score(-1);
  if (Math.abs(a - b) < 0.2) return prefer;
  return a > b ? 1 : -1;
}

/**
 * Cut slits (width s, pointing along `dir` — default +y) from every hole to the outer boundary so
 * the region becomes simply connected; the two pipes either side of a slit are then s apart.
 */
export function removeHoles(region, s, dir = { x: 0, y: 1 }) {
  let R = asRegion(region);
  for (let guard = 0; guard < 50; guard++) {
    const shape = R.find((sh) => sh.holes?.length);
    if (!shape) break;
    const hole = shape.holes[0];
    const hb = bbox(hole);
    const ob = bbox(shape.outer);
    const cx = (hb.x0 + hb.x1) / 2;
    const cy = (hb.y0 + hb.y1) / 2;
    // shortest way out among the 4 axis directions, preferring `dir`
    const opts = [
      { d: { x: 0, y: 1 }, len: ob.y1 - hb.y1 },
      { d: { x: 0, y: -1 }, len: hb.y0 - ob.y0 },
      { d: { x: 1, y: 0 }, len: ob.x1 - hb.x1 },
      { d: { x: -1, y: 0 }, len: hb.x0 - ob.x0 },
    ].map((o) => ({ ...o, score: o.len - (o.d.x === dir.x && o.d.y === dir.y ? 0.5 : 0) }));
    opts.sort((a, b) => a.score - b.score);
    const o = opts[0].d;
    const far = 1000;
    let slit;
    if (o.x === 0) {
      const y0 = o.y > 0 ? cy : cy - far;
      const y1 = o.y > 0 ? cy + far : cy;
      slit = [{ x: cx - s / 2, y: y0 }, { x: cx + s / 2, y: y0 }, { x: cx + s / 2, y: y1 }, { x: cx - s / 2, y: y1 }];
    } else {
      const x0 = o.x > 0 ? cx : cx - far;
      const x1 = o.x > 0 ? cx + far : cx;
      slit = [{ x: x0, y: cy - s / 2 }, { x: x1, y: cy - s / 2 }, { x: x1, y: cy + s / 2 }, { x: x0, y: cy + s / 2 }];
    }
    // only this shape is slit (the slit must not cut other shapes)
    const others = R.filter((sh) => sh !== shape);
    R = [...others, ...difference([shape], slit)];
  }
  return R;
}

/** Medial line of a pair of chains (resampled by normalised arc length and averaged). */
function averageChains(ring) {
  const n = ring.length;
  if (n < 3) return null;
  let best = [0, 0, -1];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const d = (ring[i].x - ring[j].x) ** 2 + (ring[i].y - ring[j].y) ** 2;
      if (d > best[2]) best = [i, j, d];
    }
  const [i, j] = best;
  const a = [];
  for (let k = i; k !== j; k = (k + 1) % n) a.push(ring[k]);
  a.push(ring[j]);
  const b = [];
  for (let k = i; k !== j; k = (k - 1 + n) % n) b.push(ring[k]);
  b.push(ring[j]);
  const La = pathLength(a);
  const Lb = pathLength(b);
  const N = Math.max(2, Math.ceil(Math.max(La, Lb) / 0.05));
  const out = [];
  for (let k = 0; k <= N; k++) {
    const p = pointAt(a, (La * k) / N);
    const q = pointAt(b, (Lb * k) / N);
    out.push({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  }
  return cleanPath(out, 0.005);
}

/**
 * Medial axis of a thin region (ring): the region is shrunk to a sliver (inradius − 4 mm) whose
 * averaged chains give the axis; the ends are extended back by the inradius to the region's ends.
 */
export function spineOf(ring) {
  const R = [{ outer: ring, holes: [] }];
  let lo = 0;
  let hi = 0.5;
  for (let k = 0; k < 14; k++) {
    const m = (lo + hi) / 2;
    if (offset(R, -m).length) lo = m;
    else hi = m;
  }
  const d = lo;
  const sl = offset(R, -Math.max(0, d - 0.004));
  if (!sl.length) return null;
  const main = sl.reduce((x, y) => (area([y]) > area([x]) ? y : x));
  let m = averageChains(main.outer);
  if (!m || m.length < 2) return null;
  m = straighten(m);
  // a nearly straight spine becomes exactly straight (hairpins at its ends stay symmetric)
  if (m.length > 2 && m.slice(1, -1).every((q) => segDistPt(q, m[0], m[m.length - 1]) < 0.02)) m = [m[0], m[m.length - 1]];
  const ext = (p, q) => {
    const L = Math.hypot(p.x - q.x, p.y - q.y) || 1;
    return { x: p.x + ((p.x - q.x) / L) * d, y: p.y + ((p.y - q.y) / L) * d };
  };
  m[0] = ext(m[0], m[1]);
  m[m.length - 1] = ext(m[m.length - 1], m[m.length - 2]);
  return cleanPath(m, 0.005);
}

/** Douglas–Peucker (5 mm): a spine of a straight strip becomes one straight segment. */
function straighten(pts, tol = 0.012) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const rec = (i, j) => {
    let md = -1;
    let mi = -1;
    for (let k = i + 1; k < j; k++) {
      const dd = segDistPt(pts[k], pts[i], pts[j]);
      if (dd > md) {
        md = dd;
        mi = k;
      }
    }
    if (md > tol) {
      keep[mi] = true;
      rec(i, mi);
      rec(mi, j);
    }
  };
  rec(0, pts.length - 1);
  return pts.filter((_, k) => keep[k]);
}

function segDistPt(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function nearestOnPolyline(p, pts) {
  let best = null;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (!best || d < best.d - 1e-12) best = { p: q, d, s: acc + t * Math.sqrt(L2) };
    acc += Math.sqrt(L2);
  }
  return best;
}

/**
 * Latest arc length ≤ stop such that one straight segment covers [stop − before, stop + after]
 * (the jog and its landing on the next ring then sit on straight pipe, never on a corner arc).
 */
function straightStop(pts, stop, before, after) {
  let acc = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push({ a: acc, b: acc + L });
    acc += L;
  }
  for (let i = segs.length - 1; i >= 0; i--) {
    const sg = segs[i];
    const lo = sg.a + before;
    const hi = Math.min(stop, sg.b - after);
    if (hi >= lo) return hi;
  }
  return -1;
}

/**
 * Adaptive spiral centreline tree for a simply connected region (pipe-axis region: the outermost
 * pipe may lie on its boundary).
 *   E0      desired entry point (end of the lead)      dir  arrival direction of the lead
 * Returns { entry, path, branches[], rings, stats } or null when the region is too small.
 */
export function spiralTree(region, s, E0, dir, o = {}) {
  const allowBranches = o.allowBranches ?? true;
  const minPiece = o.minPiece ?? s * s * 1.5;
  const gap = 2 * s;
  // ring corner radius: the inner pipe of a turn keeps the minimum bend radius
  const rc = cornerRadius(s, o.rmin ?? 0);
  // bridge between rings: inclined at JOG to the ring so both turns fit radius rc within the bridge
  const JOG = (75 * Math.PI) / 180;
  const jogGap = gap / Math.sin(JOG);
  const jogAhead = gap / Math.tan(JOG);
  const lv0 = offset(region, -(s / 2 + EPS)).filter((sh) => area([sh]) > minPiece * 0.25);
  if (!lv0.length) return null;
  const stats = { rings: 0, spines: 0, branches: 0, dropped: 0, droppedArea: 0 };
  const branches = [];
  const uturns = [];

  // walk one component: appends to `path` (which already ends at / near E)
  // split a level region into thick components (rings) and thin ones (spines)
  const kidsOf = (pieces) => {
    const out = [];
    for (const piece of pieces) {
      // thick parts only (a ring needs ≥ 2s width); miter keeps the corners sharp
      const op = opening([piece], s - 0.004, 'miter');
      if (!op.length) {
        const sp = spineOf(piece.outer);
        if (sp && pathLength(sp) >= s * 0.5) out.push({ spine: sp });
        else {
          stats.dropped++;
          stats.droppedArea += area([piece]);
        }
        continue;
      }
      for (const c of op) out.push({ shape: c });
      const rest = area([piece]) - area(op);
      if (rest > minPiece) stats.droppedArea += rest;
    }
    return out;
  };
  const kidDist = (k, p) => (k.shape ? closestOnRing(p, k.shape.outer).d : nearestOnPolyline(p, k.spine).d);
  const kidArea = (k) => (k.shape ? area([k.shape]) : pathLength(k.spine) * 2 * s);

  // a spine reached at its point nearest to E: longer half continues the path, the other is a branch
  const walkSpine = (sp, E, path) => {
    stats.spines++;
    const q = nearestOnPolyline(E, sp);
    const L = pathLength(sp);
    const toEnd = q.s > L / 2 ? subPath(sp, 0, q.s).reverse() : subPath(sp, q.s, L);
    const other = q.s > L / 2 ? subPath(sp, q.s, L) : subPath(sp, 0, q.s).reverse();
    path.push(q.p, ...toEnd);
    // a short stub would be a T-junction (two tight corners): leave it out, only a long one branches
    if (pathLength(other) > s * 0.5) {
      if (allowBranches && pathLength(other) > 1.0) branches.push(other);
      else {
        stats.dropped++;
        stats.droppedArea += pathLength(other) * 2 * s;
      }
    }
  };

  const walk = (kid, E, path) => {
    if (kid.spine) return walkSpine(kid.spine, E, path);
    const main = kid.shape;
    const pts = ringFrom(main.outer, E, sign);
    const perim = pathLength(pts);
    stats.rings++;
    let kids = kidsOf(offset([main], -gap).filter((sh) => area([sh]) > minPiece * 0.05));
    // a level exactly 4s wide has a zero-width next level: its centre spine is found with 6 mm
    // tolerance (the spine pipes then sit s − 3 mm from the ring)
    if (!kids.length) kids = kidsOf(offset([main], -(gap - 0.006)).filter((sh) => area([sh]) > minPiece * 0.02)).filter((k) => k.spine);
    // classic transition: the ring stops 2s before the corner it started at and turns straight onto
    // the next ring's corner (one ordinary 90° turn). Otherwise an inclined jog (JOG) is used.
    let stop = perim - gap;
    if (stop < s) return;
    let P = pointAt(pts, stop);
    let classic = null;
    for (const k of kids) {
      if (k.spine) {
        // a spine starting right where the ring turns in: enter it at its end, straight on
        const sp = k.spine;
        const q = nearestOnPolyline(P, sp);
        const Ls = pathLength(sp);
        const atStart = q.s < 0.02;
        const atEnd = q.s > Ls - 0.02;
        if ((!atStart && !atEnd) || q.d > gap * 1.2) continue;
        const e = atStart ? sp[0] : sp[sp.length - 1];
        const nx = atStart ? sp[1] : sp[sp.length - 2];
        const cos = ((nx.x - e.x) * (e.x - P.x) + (nx.y - e.y) * (e.y - P.y)) / ((Math.hypot(nx.x - e.x, nx.y - e.y) || 1) * (Math.hypot(e.x - P.x, e.y - P.y) || 1));
        if (cos > Math.cos((20 * Math.PI) / 180)) classic = { kid: k, E: e };
        continue;
      }
      const q = closestOnRing(P, k.shape.outer);
      const r = k.shape.outer;
      const vi = [q.i, (q.i + 1) % r.length].find((i) => Math.hypot(r[i].x - q.p.x, r[i].y - q.p.y) < 0.02);
      if (vi === undefined || q.d > gap * 1.2) continue;
      const nxt = ringFrom(r, r[vi], sign);
      const dx = nxt[1].x - nxt[0].x;
      const dy = nxt[1].y - nxt[0].y;
      const bx = r[vi].x - P.x;
      const by = r[vi].y - P.y;
      const cos = (dx * bx + dy * by) / ((Math.hypot(dx, dy) || 1) * (Math.hypot(bx, by) || 1));
      if (cos > Math.cos((20 * Math.PI) / 180)) classic = { kid: k, E: r[vi] };
    }
    // only a spine left inside: leave the ring where it faces a spine end squarely (the one
    // reached last) and go straight onto the spine — one ordinary turn, no T-junction
    if (!classic && kids.length === 1 && kids[0].spine) {
      const sp = kids[0].spine;
      let bestEnd = null;
      for (const e of [sp[0], sp[sp.length - 1]]) {
        let acc = 0;
        let bq = null;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const L = Math.hypot(b.x - a.x, b.y - a.y);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const t = L > 0 ? Math.max(0, Math.min(1, ((e.x - a.x) * dx + (e.y - a.y) * dy) / (L * L))) : 0;
          const sig = acc + t * L;
          const d = Math.hypot(a.x + t * dx - e.x, a.y + t * dy - e.y);
          if (sig <= perim - gap * 0.5 && sig > s && (!bq || d < bq.d - 0.02 || (d < bq.d + 0.02 && sig > bq.sig))) bq = { d, sig };
          acc += L;
        }
        // only near the end of the ring (never abandon most of it)
        if (bq && bq.d < gap * 1.6 && bq.sig > perim - gap * 2.5 && (!bestEnd || bq.sig > bestEnd.sig)) bestEnd = { ...bq, e };
      }
      if (bestEnd) classic = { kid: kids[0], E: bestEnd.e, stop: bestEnd.sig };
      if (classic) {
        stop = classic.stop;
        P = pointAt(pts, stop);
        // a hook (ring → across → back along the spine) is a 180° turn: keyhole its inner gap
        const e = classic.E;
        const nx = e === sp[0] ? sp[1] : sp[sp.length - 2];
        const sd = { x: nx.x - e.x, y: nx.y - e.y };
        const sl = Math.hypot(sd.x, sd.y) || 1;
        const hw = Math.hypot(P.x - e.x, P.y - e.y);
        if ((sd.x * P.tx + sd.y * P.ty) / sl < -0.7 && hw > gap * 0.95 && hw < gap * 1.05) uturns.push({ c: { x: (P.x + e.x) / 2, y: (P.y + e.y) / 2 }, dir: { x: -P.tx, y: -P.ty } });
      }
    }
    if (!classic) {
      stop = perim - jogGap;
      // the jog needs straight pipe before it and at its landing; when a drifting jog reaches a
      // corner it jumps back to the previous side
      const need = rc * Math.tan(JOG / 2) + 0.01;
      const st = straightStop(pts, stop, need, jogAhead + need + gap);
      if (st >= s) stop = st;
      if (stop < s) return;
      P = pointAt(pts, stop);
    }
    const run = subPath(pts, 0, stop);
    path.push(...run);
    if (!kids.length) {
      // innermost ring 2s wide: its far short side is a 180° turn around a slot — keyhole it
      if (!offset([main], -(s + 0.01)).length) {
        const ax = spineOf(main.outer);
        if (ax && pathLength(ax) > gap) {
          const a0 = ax[0];
          const a1 = ax[ax.length - 1];
          const far = Math.hypot(a0.x - E.x, a0.y - E.y) > Math.hypot(a1.x - E.x, a1.y - E.y) ? [a0, ax[1]] : [a1, ax[ax.length - 2]];
          const L = Math.hypot(far[1].x - far[0].x, far[1].y - far[0].y) || 1;
          const d = { x: (far[1].x - far[0].x) / L, y: (far[1].y - far[0].y) / L };
          // the turn's centre sits s inside the short side
          uturns.push({ c: { x: far[0].x + d.x * s, y: far[0].y + d.y * s }, dir: d });
        }
      }
      return;
    }
    P = run[run.length - 1];
    // main child: nearest to the end of the ring run (a far one would need a long bridge)
    let child = classic?.kid ?? null;
    let cd = classic ? 0 : Infinity;
    if (!classic) for (const k of kids) {
      const d = kidDist(k, P);
      if (d < cd) {
        cd = d;
        child = k;
      }
    }
    if (cd > gap * 1.5) child = null;
    for (const k of kids) {
      if (k === child) continue;
      if (!allowBranches || kidArea(k) < minPiece) {
        stats.dropped++;
        stats.droppedArea += kidArea(k);
        continue;
      }
      // T-branch from the nearest point of this ring run
      const cand = k.shape ? k.shape.outer : k.spine;
      let best = null;
      for (const p of cand) {
        const q = nearestOnPolyline(p, run);
        if (!best || q.d < best.d) best = q;
      }
      const Ec = k.shape ? closestOnRing(best.p, k.shape.outer).p : nearestOnPolyline(best.p, k.spine).p;
      const br = [best.p];
      stats.branches++;
      if (k.shape) br.push(Ec);
      walk(k, Ec, br);
      branches.push(cleanPath(br));
    }
    if (!child) return;
    if (classic) {
      path.push(classic.E);
      walk(child, classic.E, path);
    } else if (child.shape) {
      // inclined bridge (angle JOG): both turns keep the corner radius, parallel bridges 2s apart
      const t = pointAt(pts, stop);
      const Ec = closestOnRing({ x: P.x + t.tx * jogAhead, y: P.y + t.ty * jogAhead }, child.shape.outer).p;
      path.push(Ec);
      walk(child, Ec, path);
    } else {
      // spine not faced squarely: enter it at its nearer END (no T-junction) when that is close
      const sp = child.spine;
      const e0 = sp[0];
      const e1 = sp[sp.length - 1];
      const d0 = Math.hypot(e0.x - P.x, e0.y - P.y);
      const d1 = Math.hypot(e1.x - P.x, e1.y - P.y);
      const e = d0 <= d1 ? e0 : e1;
      const dd = Math.min(d0, d1) || 1;
      const square = Math.abs(((e.x - P.x) * P.tx + (e.y - P.y) * P.ty) / dd) < 0.2; // a clean 90° hook
      if (dd <= gap * 2.5 && square) {
        path.push(e);
        walk(child, e, path);
      } else walk(child, P, path);
    }
  };

  const top = kidsOf(lv0);
  if (!top.length) return null;
  let first = top[0];
  let fd = Infinity;
  for (const k of top) {
    const d = kidDist(k, E0);
    if (d < fd) {
      fd = d;
      first = k;
    }
  }
  const entry = first.shape ? closestOnRing(E0, first.shape.outer).p : nearestOnPolyline(E0, first.spine).p;
  // optionally the ring starts along the region's long side (every ring then ends on a short
  // side, right above the next ring's corner and finally the centre spine)
  let sign = first.shape ? chooseSign(first.shape.outer, entry, dir, o.prefer ?? 1) : 1;
  if (first.shape && o.longSide) {
    const bb = bbox(first.shape.outer);
    const w = bb.x1 - bb.x0;
    const h = bb.y1 - bb.y0;
    const axis = h > w * 1.15 ? { x: 0, y: 1 } : w > h * 1.15 ? { x: 1, y: 0 } : null;
    if (axis) {
      const along = (sg) => {
        const p = ringFrom(first.shape.outer, entry, sg);
        const q = pointAt(p, Math.min(0.1, pathLength(p) / 4));
        const L = Math.hypot(q.x - p[0].x, q.y - p[0].y) || 1;
        return Math.abs(((q.x - p[0].x) * axis.x + (q.y - p[0].y) * axis.y) / L);
      };
      const a = along(1);
      const b = along(-1);
      if (Math.abs(a - b) > 0.5) sign = a > b ? 1 : -1;
    }
  }
  const path = [entry];
  walk(first, entry, path);
  for (const k of top) if (k !== first) {
    stats.dropped++;
    stats.droppedArea += kidArea(k);
  }
  return { entry, path: cleanPath(path), branches, sign, stats, uturns };
}

/**
 * Serpentine (boustrophedon) centreline tree. Lines along x (axis 'x') or y at 2s pitch starting
 * at the region side nearest to E0; consecutive lines joined by rungs at alternating ends.
 */
export function serpentineTree(region, s, E0, axis = 'x', o = {}) {
  const C = offset(region, -(s / 2 + EPS));
  if (!C.length) return null;
  // work in a frame where lines are horizontal (y = const)
  const sw = axis === 'y';
  const T = (p) => (sw ? { x: p.y, y: p.x } : p);
  const rings = C.flatMap((sh) => [sh.outer, ...(sh.holes ?? [])]).map((r) => r.map(T));
  const e = T(E0);
  const b = bbox(rings.flat());
  // start at the side (bottom/top) nearest to the entry
  const fromTop = Math.abs(e.y - b.y1) < Math.abs(e.y - b.y0);
  const nLines = Math.floor((b.y1 - b.y0) / (2 * s) + 1e-6) + 1;
  const ys = Array.from({ length: nLines }, (_, k) => (fromTop ? b.y1 - k * 2 * s : b.y0 + k * 2 * s));
  const lines = ys.map((y) => {
    const y2 = y + (fromTop ? -1e-5 : 1e-5); // stay strictly inside at the extreme line
    const xs = [];
    for (const r of rings)
      for (let i = 0; i < r.length; i++) {
        const a = r[i];
        const c = r[(i + 1) % r.length];
        if ((a.y > y2) !== (c.y > y2)) xs.push(a.x + ((y2 - a.y) * (c.x - a.x)) / (c.y - a.y));
      }
    xs.sort((p, q) => p - q);
    const iv = [];
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > s * 0.5) iv.push({ x0: xs[i], x1: xs[i + 1], y });
    return iv;
  });
  const nodes = lines.flatMap((iv, k) => iv.map((v) => ({ ...v, k })));
  if (!nodes.length) return null;
  // root: interval on the first line nearest to the entry
  let root = null;
  for (const n of nodes) {
    const d = Math.hypot(Math.max(n.x0 - e.x, 0, e.x - n.x1), n.y - e.y) + n.k * 10;
    if (!root || d < root.d) root = { n, d };
  }
  root = root.n;
  const used = new Set([root]);
  const branches = [];
  const segs = [];
  const uturns = [];
  // DFS; each interval is traversed from the end it was entered at to the other end
  const walk = (n, enterRight, chain) => {
    const far = enterRight ? { x: n.x0, y: n.y } : { x: n.x1, y: n.y };
    chain.push(far);
    const kids = nodes.filter((m) => !used.has(m) && Math.abs(m.k - n.k) === 1 && Math.min(m.x1, n.x1) - Math.max(m.x0, n.x0) > s);
    kids.sort((a, b) => b.k - a.k || a.x0 - b.x0);
    let first = true;
    for (const m of kids) {
      if (used.has(m)) continue;
      used.add(m);
      // rung at the end of the overlap on the side we just arrived at
      const atRight = !enterRight;
      const x = atRight ? Math.min(m.x1, n.x1) : Math.max(m.x0, n.x0);
      // a clean U-turn (both lines end at the rung): its inner gap gets a keyhole
      const endN = atRight ? n.x1 : n.x0;
      const endM = atRight ? m.x1 : m.x0;
      if (Math.abs(endN - x) < 1e-6 && Math.abs(endM - x) < 1e-6) uturns.push({ c: { x: x + (atRight ? -s : s), y: (n.y + m.y) / 2 }, dir: { x: atRight ? -1 : 1, y: 0 } });
      if (first) {
        chain.push({ x, y: n.y }, { x, y: m.y });
        walk(m, atRight, chain);
        first = false;
      } else {
        const br = [{ x, y: n.y }, { x, y: m.y }];
        walk(m, atRight, br);
        branches.push(br);
      }
    }
  };
  const enterRight = Math.abs(e.x - root.x1) < Math.abs(e.x - root.x0);
  const entryT = enterRight ? { x: root.x1, y: root.y } : { x: root.x0, y: root.y };
  const chain = [entryT];
  walk(root, enterRight, chain);
  const back = (pts) => cleanPath(pts.map(T));
  const dropped = nodes.filter((n) => !used.has(n));
  return {
    entry: T(entryT),
    path: back(chain),
    branches: branches.map(back),
    stats: { lines: nodes.length, branches: branches.length, dropped: dropped.length, droppedArea: dropped.reduce((a, n) => a + (n.x1 - n.x0) * 2 * s, 0) },
    segs,
    uturns: uturns.map((u) => ({ c: T(u.c), dir: T(u.dir) })),
  };
}
