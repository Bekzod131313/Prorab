// UFH debug picture and metrics (no routing here — it only shows what a router produced).
//   blue: zone · yellow: wall clearance · green: usable heating area · dark red: obstacles ·
//   orange: obstacle clearance (exclusion) · red translucent: uncovered (light: strips thinner than
//   s, strong: patches) · purple: region
//   boundaries · black: leads (collector side) · orange ring: bend < minimum · dashed purple: seam
//   of a spiral round an obstacle · pipes: supply arm red, return arm blue, thin centrelines

import * as G from './geom.js';

/** Bend radius along a path (sliding 40 mm window): every stretch below rmin, with its position. */
export function tightBends(path, rmin, step = 0.02) {
  const L = G.pathLength(path);
  const out = [];
  for (let a = 0.04; a < L - 0.04; a += step) {
    const m = G.minBendRadius(G.subPath(path, Math.max(0, a - 0.06), Math.min(L, a + 0.06)));
    if (m.radius < rmin) {
      const last = out[out.length - 1];
      if (last && a - last.a1 < 0.05) (last.a1 = a), (last.r = Math.min(last.r, m.radius));
      else out.push({ a0: a, a1: a, r: m.radius, at: G.pointAt(path, a) });
    }
  }
  return out;
}

/**
 * Smallest distance between two stretches of one path that are at least `gap` apart along it
 * (neighbouring pipe runs); returns { min, at }.
 */
export function minSpacing(path, gap, step = 0.05) {
  const L = G.pathLength(path);
  const samples = [];
  for (let a = 0; a <= L; a += step) samples.push({ a, p: G.pointAt(path, a) });
  let acc = 0;
  const segs = [];
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    segs.push({ a: path[i - 1], b: path[i], s0: acc, s1: acc + l });
    acc += l;
  }
  let best = { min: Infinity, at: null };
  for (const q of samples)
    for (const sg of segs) {
      if (sg.s1 > q.a - gap && sg.s0 < q.a + gap) continue;
      const dd = G.segDist(q.p, sg.a, sg.b);
      if (dd < best.min) best = { min: dd, at: q.p };
    }
  return best;
}

/** True when no two non-adjacent segments of the path cross. */
export function selfCrossings(path) {
  let n = 0;
  for (let i = 1; i < path.length; i++)
    for (let j = i + 2; j < path.length; j++) if (G.segmentsIntersect(path[i - 1], path[i], path[j - 1], path[j], 1e-14) && !(Math.hypot(path[i].x - path[j - 1].x, path[i].y - path[j - 1].y) < 1e-9)) n++;
  return n;
}

/** SVG of a debug scene (plan y up unless flipY). */
export function debugSVG(scene, o = {}) {
  const { zone, usable = [], obstacles = [], exclusions = [], uncovered = [], uncoveredThin = [], cells = [], pipes = [], leads = [], seams = [], bends = [], marks = [], lines = [], labels = [] } = scene;
  const bb = G.regionBBox(zone);
  const k = o.scale ?? 100;
  const pad = 30;
  const W = Math.max((bb.x1 - bb.x0) * k + 2 * pad, ...lines.map((s) => String(s).length * 7.9 + 2 * pad));
  const Hp = (bb.y1 - bb.y0) * k + 2 * pad;
  const textH = lines.length ? lines.length * 16 + 12 : 0;
  const X = (p) => `${(pad + (p.x - bb.x0) * k).toFixed(1)},${(pad + (o.flipY ? p.y - bb.y0 : bb.y1 - p.y) * k).toFixed(1)}`;
  const poly = (reg, fill, stroke = 'none', sw = 0, op = 1) =>
    G.asRegion(reg)
      .map((sh) => `<path d="${[sh.outer, ...(sh.holes ?? [])].map((r) => 'M' + r.map(X).join('L') + 'Z').join('')}" fill="${fill}" fill-opacity="${op}" fill-rule="evenodd" stroke="${stroke}" stroke-width="${sw}"/>`)
      .join('');
  const zr = G.asRegion(zone);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${(Hp + textH).toFixed(0)}" style="background:#fff" font-family="monospace" font-size="13">`;
  svg += poly(G.difference(zr, usable), '#f4d03f', 'none', 0, 0.55);
  svg += poly(usable, '#7bd389', 'none', 0, 0.4);
  svg += poly(exclusions, '#ff9800', 'none', 0, 0.75);
  svg += poly(obstacles, '#7f1d1d');
  svg += poly(uncoveredThin, '#e53935', 'none', 0, 0.25);
  svg += poly(uncovered, '#e53935', 'none', 0, 0.55);
  for (const c of cells) svg += poly(c, 'none', '#8e24aa', 2);
  svg += poly(zr, 'none', '#1e63d6', 3);
  for (const p of pipes) svg += `<polyline points="${p.pts.map(X).join(' ')}" fill="none" stroke="${p.color ?? '#c0392b'}" stroke-width="${p.w ?? 1.6}"/>`;
  for (const [a, b] of seams) svg += `<line x1="${X(a).split(',')[0]}" y1="${X(a).split(',')[1]}" x2="${X(b).split(',')[0]}" y2="${X(b).split(',')[1]}" stroke="#8e24aa" stroke-width="2" stroke-dasharray="6 4"/>`;
  for (const l of leads) svg += `<polyline points="${l.map(X).join(' ')}" fill="none" stroke="#000" stroke-width="2"/>`;
  for (const b of bends) svg += `<circle cx="${X(b).split(',')[0]}" cy="${X(b).split(',')[1]}" r="9" fill="none" stroke="#ff8c00" stroke-width="3"/>`;
  for (const m of marks) svg += `<circle cx="${X(m.p).split(',')[0]}" cy="${X(m.p).split(',')[1]}" r="${m.r ?? 4}" fill="${m.color ?? '#000'}"/>`;
  // region labels: a white box with one line per entry, at the label point
  for (const lb of labels) {
    const [x, y] = X(lb.p).split(',').map(Number);
    const w = Math.max(...lb.text.map((s) => s.length)) * 7.4 + 8;
    const h = lb.text.length * 14 + 6;
    svg += `<rect x="${(x - w / 2).toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h}" fill="#fff" fill-opacity="0.85" stroke="#8e24aa" stroke-width="1" rx="3"/>`;
    lb.text.forEach((s, i) => (svg += `<text x="${(x - w / 2 + 4).toFixed(1)}" y="${(y - h / 2 + 15 + i * 14).toFixed(1)}" font-size="12" fill="${lb.color ?? '#4a148c'}">${String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`));
  }
  lines.forEach((t, i) => (svg += `<text x="${pad}" y="${(Hp + 16 + i * 16).toFixed(0)}">${String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`));
  return svg + '</svg>';
}
