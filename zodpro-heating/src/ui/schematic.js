// Generated drawings linked to the model: principal schematic (from the real network
// topology), riser diagram, axonometric heating view, and sections.
import { elementsOf, sortedLevels, levelById, localToPlan, wallDir, openingPos } from '../core/model.js';
import { projectOnSegment } from '../core/util.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * Principal schematic. Traverses the supply tree from the boiler; every branch/consumer is drawn
 * as it actually exists in the model (no fake schematic). Return lines mirror supply.
 */
export function schematicSVG(project, res, colors = {}) {
  const net = res?._network;
  const S = colors.supply ?? '#e0312b';
  const R = colors.return ?? '#1f5fd6';
  if (!net?.source) return `<p class="muted">Sxema uchun qozon va ulangan tarmoq kerak.</p>`;
  const tree = net.supplyTree;
  // children map node → [{edge, child}]
  const kids = new Map();
  for (const [child, { edge, from }] of tree.parent) {
    if (!kids.has(from)) kids.set(from, []);
    kids.get(from).push({ edge, child });
  }
  const consumerAt = new Map(net.consumers.map((c) => [c.supplyKey, c]));
  // layout: depth-first, leaves get consecutive rows
  let row = 0;
  const pos = new Map();
  const edgesOut = [];
  const place = (key, depth) => {
    const ch = kids.get(key) ?? [];
    const ys = [];
    for (const { edge, child } of ch) {
      const ccol = edge.kind === 'manifold' || edge.kind === 'pump' ? depth + 1 : depth + 1;
      place(child, ccol);
      ys.push(pos.get(child).y);
      edgesOut.push({ edge, from: key, to: child });
    }
    const c = consumerAt.get(key);
    let y;
    if (!ch.length) y = row++;
    else y = (Math.min(...ys) + Math.max(...ys)) / 2;
    if (c && ch.length) y = row++;
    pos.set(key, { x: depth, y, consumer: c });
  };
  place(tree.parent.size ? net.source.supplyKey : net.source.supplyKey, 0);
  const maxX = Math.max(...[...pos.values()].map((p) => p.x), 1);
  const cw = 150;
  const rh = 46;
  const W = (maxX + 2) * cw + 220;
  const H = Math.max(row, 1) * rh + 120;
  const X = (x) => 120 + x * cw;
  const Y = (y) => 60 + y * rh;
  const parts = [];
  parts.push(`<defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="${S}"/></marker></defs>`);
  // boiler
  const b = pos.get(net.source.supplyKey);
  const bo = project.elements[net.source.elementId];
  parts.push(`<rect x="${X(0) - 95}" y="${Y(b.y) - 26}" width="70" height="60" rx="4" fill="#fff" stroke="#222" stroke-width="1.5"/>`);
  parts.push(`<text x="${X(0) - 60}" y="${Y(b.y) - 4}" font-size="12" text-anchor="middle" font-weight="700">${esc(bo?.mark ?? 'B')}</text>`);
  parts.push(`<text x="${X(0) - 60}" y="${Y(b.y) + 12}" font-size="10" text-anchor="middle">${esc(res.boiler?.product ? res.boiler.product.powerKw + ' kVt' : '')}</text>`);
  parts.push(`<line x1="${X(0) - 25}" y1="${Y(b.y)}" x2="${X(0)}" y2="${Y(b.y)}" stroke="${S}" stroke-width="2.5"/>`);
  parts.push(`<line x1="${X(0) - 25}" y1="${Y(b.y) + 14}" x2="${X(0)}" y2="${Y(b.y) + 14}" stroke="${R}" stroke-width="2.5" stroke-dasharray="7 3"/>`);
  if (res.pump?.builtIn) parts.push(`<text x="${X(0) - 60}" y="${Y(b.y) + 48}" font-size="9" text-anchor="middle">+ ichki nasos</text>`);
  for (const { edge, from, to } of edgesOut) {
    const a = pos.get(from);
    const c = pos.get(to);
    const x1 = X(a.x);
    const y1 = Y(a.y);
    const x2 = X(c.x);
    const y2 = Y(c.y);
    const pr = res.pipes[edge.elementId];
    // supply: orthogonal (vertical at parent column then horizontal)
    parts.push(`<path d="M${x1},${y1} L${x1},${y2} L${x2},${y2}" fill="none" stroke="${S}" stroke-width="${pr ? Math.max(1.5, Number(pr.dn) / 10) : 1.5}"/>`);
    parts.push(`<path d="M${x1 + 8},${y1 + 14} L${x1 + 8},${y2 + 14} L${x2},${y2 + 14}" fill="none" stroke="${R}" stroke-width="${pr ? Math.max(1.2, Number(pr.dn) / 12) : 1.2}" stroke-dasharray="7 3"/>`);
    if (edge.kind === 'pump') {
      parts.push(`<circle cx="${(x1 + x2) / 2}" cy="${y2}" r="9" fill="#fff" stroke="#222"/><path d="M${(x1 + x2) / 2 - 5},${y2 - 5} L${(x1 + x2) / 2 + 6},${y2} L${(x1 + x2) / 2 - 5},${y2 + 5} z" fill="none" stroke="#222"/>`);
    }
    if (pr) {
      parts.push(`<text x="${(x1 + x2) / 2 + 4}" y="${y2 - 5}" font-size="9.5" text-anchor="middle" fill="${S}">Ø${esc(pr.dn)} · ${Math.round(pr.flowLh)} l/h · ${pr.length.toFixed(1)} m</text>`);
    }
    if (edge.kind === 'manifold' && !parts.some((q) => q.includes(`data-col="${edge.elementId}"`))) {
      const col = project.elements[edge.elementId];
      parts.push(`<rect data-col="${edge.elementId}" x="${x1 - 10}" y="${y1 - 20}" width="20" height="${Math.max(40, Math.abs(y2 - y1) + 40)}" fill="none" stroke="#555" stroke-dasharray="3 2"/>`);
      parts.push(`<text x="${x1}" y="${y1 - 26}" font-size="10" text-anchor="middle" font-weight="700">${esc(col?.mark ?? 'C')}</text>`);
    }
  }
  for (const [key, p] of pos) {
    if (!p.consumer) continue;
    const c = p.consumer;
    const x = X(p.x);
    const y = Y(p.y);
    const el = project.elements[c.elementId];
    const circ = res.circuits.find((q) => q.elementId === c.elementId);
    if (c.kind === 'radiator') {
      const rr = res.radiators[c.elementId];
      parts.push(`<rect x="${x + 4}" y="${y - 10}" width="44" height="30" fill="#fff" stroke="#222"/>`);
      for (let i = 1; i < 6; i++) parts.push(`<line x1="${x + 4 + i * 7.3}" y1="${y - 10}" x2="${x + 4 + i * 7.3}" y2="${y + 20}" stroke="#999"/>`);
      parts.push(`<line x1="${x + 48}" y1="${y + 14}" x2="${x + 56}" y2="${y + 14}" stroke="${R}" stroke-width="1.5"/>`);
      parts.push(`<text x="${x + 60}" y="${y - 1}" font-size="10.5" font-weight="700">${esc(el?.mark)} · ${esc(rr?.product?.model ?? '')}</text>`);
      parts.push(`<text x="${x + 60}" y="${y + 13}" font-size="9.5">${Math.round(rr?.output ?? 0)} W · ${Math.round(circ?.flowLh ?? 0)} l/h · ${circ ? (circ.dpTotal / 1000).toFixed(1) : '-'} kPa · sozlama ${esc(circ?.balance?.setting ?? '-')}</text>`);
    } else {
      const loops = Object.values(res.ufh).filter((u) => u.collectorId === c.elementId);
      parts.push(`<rect x="${x + 4}" y="${y - 12}" width="44" height="34" fill="#fff5e6" stroke="#e08a1f"/>`);
      parts.push(`<path d="M${x + 8},${y - 6} h36 v6 h-36 v6 h36 v6 h-36" fill="none" stroke="#e08a1f"/>`);
      parts.push(`<text x="${x + 60}" y="${y - 1}" font-size="10.5" font-weight="700">${esc(el?.mark)} pol isitish · ${loops.reduce((a, l) => a + l.loops, 0)} kontur</text>`);
      parts.push(`<text x="${x + 60}" y="${y + 13}" font-size="9.5">${Math.round(c.Q ?? circ?.Q ?? 0)} W · ${Math.round(circ?.flowLh ?? 0)} l/h${el?.mixing !== false ? ' · aralashtirish uzeli' : ''}</text>`);
    }
    void key;
  }
  const crit = res.critical ? project.elements[res.critical.elementId] : null;
  parts.push(`<text x="20" y="${H - 20}" font-size="11">Kritik kontur: ${esc(crit?.mark ?? '-')} · ΔP = ${res.critical ? (res.critical.dp / 1000).toFixed(1) : '-'} kPa · Nasos: ${esc(res.pump?.product?.model ?? '—')} · Q = ${res.pump?.q?.toFixed(2)} m³/h, H = ${res.pump?.h?.toFixed(2)} m</text>`);
  return `<svg class="schema-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">${parts.join('')}</svg>`;
}

/** Multi-floor riser diagram: levels as bands; collectors/radiators per level; risers vertical. */
export function riserSVG(project, res, colors = {}) {
  const S = colors.supply ?? '#e0312b';
  const R = colors.return ?? '#1f5fd6';
  const levels = sortedLevels(project).slice().reverse();
  const bandH = 150;
  const W = 1100;
  const H = levels.length * bandH + 60;
  const parts = [];
  const yOf = new Map();
  levels.forEach((l, i) => {
    const y = 30 + i * bandH + bandH - 20;
    yOf.set(l.id, y);
    parts.push(`<line x1="20" y1="${y}" x2="${W - 20}" y2="${y}" stroke="#888" stroke-width="1"/>`);
    parts.push(`<text x="24" y="${y - 6}" font-size="11" font-weight="700">${esc(l.name)}  ${l.elevation >= 0 ? '+' : ''}${l.elevation.toFixed(3)}</text>`);
  });
  const risers = elementsOf(project, 'riser');
  const rx = new Map();
  let xi = 0;
  for (const r of risers) {
    const x = 180 + (xi++ % 2) * 14 + Math.floor(xi / 2) * 60;
    rx.set(r.id, x);
    const y1 = yOf.get(r.levelFrom) - 30;
    const y2 = yOf.get(r.levelTo) - 30;
    const pr = res?.pipes?.[r.id];
    parts.push(`<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${r.system === 'return' ? R : S}" stroke-width="3" ${r.system === 'return' ? 'stroke-dasharray="7 3"' : ''}/>`);
    parts.push(`<text x="${x + 4}" y="${(y1 + y2) / 2}" font-size="9.5" transform="rotate(-90 ${x + 4} ${(y1 + y2) / 2})">${esc(r.mark)} Ø${esc(pr?.dn ?? '')}</text>`);
  }
  for (const l of levels) {
    const y = yOf.get(l.id);
    let x = 320;
    for (const b of elementsOf(project, 'boiler', l.id)) {
      parts.push(`<rect x="60" y="${y - 90}" width="60" height="60" fill="#fff" stroke="#222"/><text x="90" y="${y - 55}" font-size="11" text-anchor="middle" font-weight="700">${esc(b.mark)}</text><text x="90" y="${y - 40}" font-size="9" text-anchor="middle">${esc(res?.boiler?.product?.powerKw ?? '')} kVt</text>`);
      parts.push(`<line x1="120" y1="${y - 70}" x2="${W - 40}" y2="${y - 70}" stroke="${S}" stroke-width="1" opacity="0.25"/>`);
    }
    for (const c of elementsOf(project, 'collector', l.id)) {
      parts.push(`<rect x="${x}" y="${y - 80}" width="70" height="36" fill="#fff" stroke="#222"/><text x="${x + 35}" y="${y - 58}" font-size="10" text-anchor="middle" font-weight="700">${esc(c.mark)} ${c.kind === 'ufh' ? 'TP' : ''} ×${c.outlets ?? ''}</text>`);
      const circuits = (res?.circuits ?? []).filter((q) => q.connected && q.path.includes(c.id));
      let rxp = x + 90;
      for (const q of circuits) {
        if (q.kind !== 'radiator') continue;
        const el = project.elements[q.elementId];
        parts.push(`<line x1="${x + 70}" y1="${y - 70}" x2="${rxp}" y2="${y - 70}" stroke="${S}" stroke-width="1.2"/>`);
        parts.push(`<rect x="${rxp}" y="${y - 84}" width="40" height="24" fill="#fff" stroke="#222"/>`);
        parts.push(`<text x="${rxp + 20}" y="${y - 90}" font-size="9" text-anchor="middle">${esc(el?.mark)}</text>`);
        parts.push(`<text x="${rxp + 20}" y="${y - 44}" font-size="8.5" text-anchor="middle">${Math.round(q.Q)} W</text>`);
        rxp += 56;
      }
      x = Math.max(rxp + 30, x + 200);
    }
  }
  return `<svg class="schema-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">${parts.join('')}</svg>`;
}

/** Axonometric (isometric) heating view from real pipe geometry (x, y, elevation). */
export function axonometrySVG(project, res, colors = {}) {
  const S = colors.supply ?? '#e0312b';
  const R = colors.return ?? '#1f5fd6';
  const c30 = Math.cos(Math.PI / 6);
  const s30 = 0.5;
  const K = 38;
  const proj = (x, y, z) => ({ x: (x - y) * c30 * K, y: (x + y) * s30 * K - z * K * 1.1 });
  const segs = [];
  for (const p of elementsOf(project, 'pipe')) {
    const l = levelById(project, p.levelId);
    if (!l) continue;
    const z = l.elevation + (p.elevation ?? 0.05);
    for (let i = 1; i < p.points.length; i++) segs.push({ a: proj(p.points[i - 1].x, p.points[i - 1].y, z), b: proj(p.points[i].x, p.points[i].y, z), sys: p.system, id: p.id, dn: res?.pipes?.[p.id]?.dn });
  }
  for (const r of elementsOf(project, 'riser')) {
    const a = levelById(project, r.levelFrom);
    const b = levelById(project, r.levelTo);
    if (!a || !b) continue;
    segs.push({ a: proj(r.x, r.y, a.elevation + 0.1), b: proj(r.x, r.y, b.elevation + 0.1), sys: r.system, id: r.id, dn: res?.pipes?.[r.id]?.dn, riser: true });
  }
  const eq = [];
  for (const e of [...elementsOf(project, 'radiator'), ...elementsOf(project, 'boiler'), ...elementsOf(project, 'collector')]) {
    const l = levelById(project, e.levelId);
    if (!l) continue;
    const z = l.elevation + (e.cat === 'boiler' ? 1.0 : e.cat === 'radiator' ? 0.3 : 0.45);
    const L = e.cat === 'radiator' ? e.length ?? 1 : e.cat === 'collector' ? 0.2 + (e.outlets ?? 4) * 0.1 : 0.45;
    const a = localToPlan(e, -L / 2, 0);
    const b = localToPlan(e, L / 2, 0);
    eq.push({ a: proj(a.x, a.y, z), b: proj(b.x, b.y, z), h: e.cat === 'radiator' ? 0.5 : 0.7, e });
  }
  const all = [...segs.flatMap((s) => [s.a, s.b]), ...eq.flatMap((q) => [q.a, q.b])];
  if (!all.length) return '<p class="muted">Aksonometriya uchun quvurlar yo‘q.</p>';
  const minX = Math.min(...all.map((p) => p.x)) - 60;
  const minY = Math.min(...all.map((p) => p.y)) - 80;
  const maxX = Math.max(...all.map((p) => p.x)) + 60;
  const maxY = Math.max(...all.map((p) => p.y)) + 40;
  const parts = [];
  for (const s of segs) {
    parts.push(`<line x1="${(s.a.x - minX).toFixed(1)}" y1="${(s.a.y - minY).toFixed(1)}" x2="${(s.b.x - minX).toFixed(1)}" y2="${(s.b.y - minY).toFixed(1)}" stroke="${s.sys === 'return' ? R : S}" stroke-width="${s.riser ? 3 : 1.8}" ${s.sys === 'return' ? 'stroke-dasharray="6 3"' : ''}/>`);
    const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    if (s.dn && L > 50 && s.sys !== 'return') parts.push(`<text x="${((s.a.x + s.b.x) / 2 - minX).toFixed(1)}" y="${((s.a.y + s.b.y) / 2 - minY - 4).toFixed(1)}" font-size="9" fill="${S}">Ø${s.dn}</text>`);
  }
  for (const q of eq) {
    const hh = q.h * K;
    const pts = [q.a, q.b, { x: q.b.x, y: q.b.y - hh }, { x: q.a.x, y: q.a.y - hh }].map((p) => `${(p.x - minX).toFixed(1)},${(p.y - minY).toFixed(1)}`).join(' ');
    parts.push(`<polygon points="${pts}" fill="#fff" stroke="#333" stroke-width="1"/>`);
    parts.push(`<text x="${((q.a.x + q.b.x) / 2 - minX).toFixed(1)}" y="${((q.a.y + q.b.y) / 2 - minY - hh - 4).toFixed(1)}" font-size="9.5" text-anchor="middle">${esc(q.e.mark)}</text>`);
  }
  const W = maxX - minX;
  const H = maxY - minY;
  return `<svg class="schema-svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">${parts.join('')}</svg>`;
}

/** Section / elevation along a section line: cut walls, openings, radiators, pipes at elevation. */
export function sectionSVG(project, res, section, colors = {}) {
  const S = colors.supply ?? '#e0312b';
  const R = colors.return ?? '#1f5fd6';
  const { a, b } = section;
  const d = wallDir(section);
  const depth = section.depth ?? 3;
  const n = { x: -d.y, y: d.x };
  const K = 70;
  const levels = sortedLevels(project);
  const topZ = (levels[levels.length - 1]?.elevation ?? 0) + (levels[levels.length - 1]?.height ?? 3) + 0.4;
  const W = d.L * K + 120;
  const H = topZ * K + 80;
  const X = (s) => 60 + s * K;
  const Y = (z) => H - 40 - z * K;
  const along = (p) => (p.x - a.x) * d.x + (p.y - a.y) * d.y;
  const across = (p) => (p.x - a.x) * n.x + (p.y - a.y) * n.y;
  const parts = [];
  for (const l of levels) {
    parts.push(`<line x1="${X(0) - 40}" y1="${Y(l.elevation)}" x2="${X(d.L) + 20}" y2="${Y(l.elevation)}" stroke="#555" stroke-width="3"/>`);
    parts.push(`<text x="10" y="${Y(l.elevation) - 4}" font-size="10">${l.elevation >= 0 ? '+' : ''}${l.elevation.toFixed(3)}</text>`);
    for (const w of elementsOf(project, 'wall', l.id)) {
      // cut: wall crosses the section line
      const d1 = across(w.a);
      const d2 = across(w.b);
      if (d1 * d2 < 0) {
        const t = d1 / (d1 - d2);
        const p = { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t };
        const s = along(p);
        if (s < -0.3 || s > d.L + 0.3) continue;
        parts.push(`<rect x="${X(s - w.thickness / 2)}" y="${Y(l.elevation + l.height)}" width="${w.thickness * K}" height="${l.height * K}" fill="url(#hatch)" stroke="#111"/>`);
        for (const o of [...elementsOf(project, 'window', l.id), ...elementsOf(project, 'door', l.id)]) {
          if (o.wallId !== w.id) continue;
          const op = openingPos(project, o);
          if (op && Math.abs(projectOnSegment(p, { x: op.x - Math.cos(op.angle) * o.width / 2, y: op.y - Math.sin(op.angle) * o.width / 2 }, { x: op.x + Math.cos(op.angle) * o.width / 2, y: op.y + Math.sin(op.angle) * o.width / 2 }).d) < 0.05) {
            parts.push(`<rect x="${X(s - w.thickness / 2)}" y="${Y(l.elevation + o.sill + o.height)}" width="${w.thickness * K}" height="${o.height * K}" fill="#dff0ff" stroke="#111"/>`);
          }
        }
      }
    }
    // projected elements within depth
    for (const e of elementsOf(project, 'radiator', l.id)) {
      const dd = across(e);
      if (dd < 0 || dd > depth) continue;
      const pr = res?.radiators?.[e.id]?.product;
      const L = e.length ?? pr?.length ?? 1;
      const s = along(e);
      const h = pr?.height ?? 0.5;
      parts.push(`<rect x="${X(s - L / 2)}" y="${Y(l.elevation + (e.mountHeight ?? 0.1) + h)}" width="${L * K}" height="${h * K}" fill="#fff" stroke="#222"/>`);
      for (let i = 1; i < 8; i++) parts.push(`<line x1="${X(s - L / 2 + (i * L) / 8)}" y1="${Y(l.elevation + (e.mountHeight ?? 0.1) + h)}" x2="${X(s - L / 2 + (i * L) / 8)}" y2="${Y(l.elevation + (e.mountHeight ?? 0.1))}" stroke="#aaa"/>`);
      parts.push(`<text x="${X(s)}" y="${Y(l.elevation + (e.mountHeight ?? 0.1) + h) - 4}" font-size="9" text-anchor="middle">${esc(e.mark)}</text>`);
    }
    for (const p of elementsOf(project, 'pipe', l.id)) {
      const z = l.elevation + (p.elevation ?? 0.05);
      for (let i = 1; i < p.points.length; i++) {
        const q1 = p.points[i - 1];
        const q2 = p.points[i];
        const a1 = across(q1);
        const a2 = across(q2);
        if (Math.min(a1, a2) > depth || Math.max(a1, a2) < 0) continue;
        parts.push(`<line x1="${X(along(q1))}" y1="${Y(z)}" x2="${X(along(q2))}" y2="${Y(z)}" stroke="${p.system === 'return' ? R : S}" stroke-width="2" ${p.system === 'return' ? 'stroke-dasharray="6 3"' : ''}/>`);
      }
    }
  }
  return `<svg class="schema-svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#666" stroke-width="1"/></pattern></defs>${parts.join('')}</svg>`;
}
