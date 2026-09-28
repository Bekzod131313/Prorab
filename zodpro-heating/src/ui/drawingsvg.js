// Construction-drawing SVGs (the style of the sample documentation):
//  • planSVG(mode 'ufh')       — "Зона теплого пола": walls in black poché, grid axes with dimension
//                                chains, UFH loops T1 red / T2 blue, manifolds, loop tags around the plan
//  • planSVG(mode 'radiator')  — "Трасса радиаторного отопления": convectors/radiators with table tags,
//                                home-run pipe bundles with rounded bends, manifolds, positions, legend
//  • ufhAxoSVG                 — "Схема теплого пола": isometric loops + trunk pipes with Ø labels,
//                                risers "Подъем T1 Ø32", elevation marks, legend, specification
import { elementsOf, openingPos, localToPlan, wallDir, levelById, collectorBodyX, sortedLevels } from '../core/model.js';
import { polygonCentroid } from '../core/util.js';
import { ufhLoopTags, levelBBox, positions, systemCodes } from './annotate.js';
import { roundCorners } from '../engines/ufhlayout.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const RED = '#e3261f';
const BLUE = '#1f4fd6';
const GREEN = '#22a33a';

export const DOC = {
  ru: {
    ufhZone: 'зона теплого пола',
    radTrace: 'трасса отопления',
    floor: 'этаж',
    ufhScheme: 'Схема теплого пола',
    node: 'Узел подключения коллектора',
    legend: 'Условное обозначение',
    ufhS: 'Теплый пол подача',
    ufhR: 'Теплый пол обратка',
    radS: 'Радиатор подача',
    radR: 'Радиатор обратка',
    spec: 'Спецификация оборудования',
    parts: 'Спецификация деталей',
    pos: 'Поз',
    name: 'Наименование и тех.хар-ка',
    type: 'Тип, марка, обозначение',
    qty: 'Кол',
    manifold: 'Расходомерный коллектор',
    outlets: 'выходом',
    riseT: 'Подъем',
    dropT: 'Опуск',
    dryer: 'Сушилка',
    convN: 'Конвектор без вент',
    convF: 'Конвектор с вент',
  },
  uz: {
    ufhZone: 'pol isitish zonasi',
    radTrace: 'isitish trassasi',
    floor: 'qavat',
    ufhScheme: 'Pol isitish sxemasi',
    node: 'Kollektor ulanish uzeli',
    legend: 'Shartli belgilar',
    ufhS: "Pol isitish ta'minot",
    ufhR: 'Pol isitish qaytish',
    radS: "Radiator ta'minot",
    radR: 'Radiator qaytish',
    spec: 'Uskunalar spetsifikatsiyasi',
    parts: 'Detallar spetsifikatsiyasi',
    pos: 'Poz',
    name: 'Nomi va texnik tavsifi',
    type: 'Turi, markasi',
    qty: 'Soni',
    manifold: 'Rotametrli kollektor',
    outlets: 'chiqishli',
    riseT: "Ko'tarilish",
    dropT: 'Tushish',
    dryer: 'Sushilka',
    convN: 'Konvektor ventsiz',
    convF: 'Konvektor ventli',
  },
};
export const doc = (project) => DOC[project.settings.docLang ?? 'ru'] ?? DOC.ru;

function frameOf(project, levelId, pad = 3.4) {
  const bb = levelBBox(project, levelId) ?? { x0: 0, x1: 10, y0: 0, y1: 10 };
  return { x0: bb.x0 - pad, y0: bb.y0 - pad, x1: bb.x1 + pad, y1: bb.y1 + pad, bb };
}

function wallsSVG(project, levelId, T) {
  const parts = [];
  for (const w of elementsOf(project, 'wall', levelId)) {
    const d = wallDir(w);
    const n = { x: -d.y * (w.thickness / 2), y: d.x * (w.thickness / 2) };
    const ext = 0; // joins are filled by overlapping ends
    const a = { x: w.a.x - d.x * ext, y: w.a.y - d.y * ext };
    const b = { x: w.b.x + d.x * ext, y: w.b.y + d.y * ext };
    const pts = [
      { x: a.x + n.x, y: a.y + n.y },
      { x: b.x + n.x, y: b.y + n.y },
      { x: b.x - n.x, y: b.y - n.y },
      { x: a.x - n.x, y: a.y - n.y },
    ];
    parts.push(`<polygon points="${pts.map((p) => `${T(p)}`).join(' ')}" fill="${w.exterior ? '#111' : '#222'}"/>`);
    // corner squares at joins
    for (const q of [w.a, w.b]) {
      const t = w.thickness / 2;
      parts.push(`<rect x="${T.x(q.x - t)}" y="${T.y(q.y - t)}" width="${T.s(2 * t)}" height="${T.s(2 * t)}" fill="${w.exterior ? '#111' : '#222'}"/>`);
    }
  }
  for (const o of [...elementsOf(project, 'window', levelId), ...elementsOf(project, 'door', levelId)]) {
    const op = openingPos(project, o);
    if (!op) continue;
    const dir = { x: Math.cos(op.angle), y: Math.sin(op.angle) };
    const nrm = { x: -dir.y, y: dir.x };
    const t = (op.wall.thickness ?? 0.3) / 2 + 0.01;
    const hw = o.width / 2;
    const P = (u, v) => T({ x: op.x + dir.x * u + nrm.x * v, y: op.y + dir.y * u + nrm.y * v });
    parts.push(`<polygon points="${[P(-hw, -t), P(hw, -t), P(hw, t), P(-hw, t)].join(' ')}" fill="#fff"/>`);
    if (o.cat === 'window') {
      for (const v of [-t, -t / 3, t / 3, t]) parts.push(`<line x1="${P(-hw, v).split(',')[0]}" y1="${P(-hw, v).split(',')[1]}" x2="${P(hw, v).split(',')[0]}" y2="${P(hw, v).split(',')[1]}" stroke="#4a90c8" stroke-width="0.8"/>`);
    } else {
      const h0 = P(-hw, t).split(',');
      const h1 = P(-hw, t + o.width).split(',');
      parts.push(`<line x1="${h0[0]}" y1="${h0[1]}" x2="${h1[0]}" y2="${h1[1]}" stroke="#333" stroke-width="0.8"/>`);
    }
  }
  return parts.join('');
}

function gridSVG(project, levelId, T) {
  const grids = elementsOf(project, 'gridline');
  if (!grids.length) return '';
  const bb = levelBBox(project, levelId);
  const ext = 1.6;
  const R = 0.32;
  const parts = [];
  const xs = grids.filter((g) => g.axis === 'x').sort((a, b) => a.pos - b.pos);
  const ys = grids.filter((g) => g.axis === 'y').sort((a, b) => a.pos - b.pos);
  const bub = (x, y, name) => `<circle cx="${T.x(x)}" cy="${T.y(y)}" r="${T.s(R)}" fill="#fff" stroke="#333" stroke-width="0.8"/><text x="${T.x(x)}" y="${T.y(y) + T.s(R) * 0.35}" font-size="${T.s(R) * 1.05}" text-anchor="middle">${esc(name)}</text>`;
  for (const g of xs) parts.push(`<line x1="${T.x(g.pos)}" y1="${T.y(bb.y0 - 0.4)}" x2="${T.x(g.pos)}" y2="${T.y(bb.y1 + ext)}" stroke="#666" stroke-width="0.5" stroke-dasharray="10 3 2 3"/>${bub(g.pos, bb.y1 + ext + R, g.name)}`);
  for (const g of ys) parts.push(`<line x1="${T.x(bb.x0 - ext)}" y1="${T.y(g.pos)}" x2="${T.x(bb.x1 + 0.4)}" y2="${T.y(g.pos)}" stroke="#666" stroke-width="0.5" stroke-dasharray="10 3 2 3"/>${bub(bb.x0 - ext - R, g.pos, g.name)}`);
  const chain = (list, horiz, o1, o2) => {
    const seg = (p0, p1, o) => {
      const A = horiz ? [T.x(p0), T.y(o)] : [T.x(o), T.y(p0)];
      const B = horiz ? [T.x(p1), T.y(o)] : [T.x(o), T.y(p1)];
      const mx = (A[0] + B[0]) / 2;
      const my = (A[1] + B[1]) / 2;
      const txt = Math.round(Math.abs(p1 - p0) * 1000);
      return `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="#333" stroke-width="0.6"/>${[A, B].map((P) => `<line x1="${P[0] - 3}" y1="${P[1] + 3}" x2="${P[0] + 3}" y2="${P[1] - 3}" stroke="#333" stroke-width="0.8"/>`).join('')}<text x="${mx}" y="${my - 2}" font-size="${T.s(0.24)}" text-anchor="middle" ${horiz ? '' : `transform="rotate(-90 ${mx} ${my})"`}>${txt}</text>`;
    };
    let out = '';
    for (let i = 1; i < list.length; i++) out += seg(list[i - 1].pos, list[i].pos, o1);
    if (list.length > 1) out += seg(list[0].pos, list[list.length - 1].pos, o2);
    return out;
  };
  parts.push(chain(xs, true, bb.y1 + 0.8, bb.y1 + 1.25));
  parts.push(chain(ys, false, bb.x0 - 0.8, bb.x0 - 1.25));
  return parts.join('');
}

function roomsSVG(project, levelId, T, withNames = true) {
  return elementsOf(project, 'room', levelId)
    .map((r) => {
      const c = polygonCentroid(r.points);
      const R = 0.28;
      return (r.number ? `<circle cx="${T.x(c.x)}" cy="${T.y(c.y)}" r="${T.s(R)}" fill="#fff" stroke="#333" stroke-width="0.7"/><text x="${T.x(c.x)}" y="${T.y(c.y) + T.s(R) * 0.35}" font-size="${T.s(0.26)}" text-anchor="middle">${esc(r.number)}</text>` : '') + (withNames ? `<text x="${T.x(c.x)}" y="${T.y(c.y) + T.s(0.62)}" font-size="${T.s(0.2)}" text-anchor="middle" fill="#555">${esc(r.name)}</text>` : '');
    })
    .join('');
}

function makeT(fr, K) {
  const T = (p) => `${((p.x - fr.x0) * K).toFixed(1)},${((p.y - fr.y0) * K).toFixed(1)}`;
  T.x = (x) => +((x - fr.x0) * K).toFixed(1);
  T.y = (y) => +((y - fr.y0) * K).toFixed(1);
  T.s = (d) => +(d * K).toFixed(2);
  return T;
}

const polyline = (pts, T, color, w, extra = '') => `<polyline points="${pts.map((p) => T(p)).join(' ')}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;

function collectorSVG(e, T, n, label) {
  const { x0, x1 } = collectorBodyX(n);
  const pts = [localToPlan(e, x0, -0.06), localToPlan(e, x1, -0.06), localToPlan(e, x1, 0.26), localToPlan(e, x0, 0.26)];
  const c = localToPlan(e, (x0 + x1) / 2, -0.35);
  return `<polygon points="${pts.map((p) => T(p)).join(' ')}" fill="${GREEN}" stroke="#135c20" stroke-width="0.8"/>${label ? `<text x="${T.x(c.x)}" y="${T.y(c.y)}" font-size="${T.s(0.2)}" text-anchor="middle" font-weight="600">${esc(label)}</text>` : ''}`;
}

/** Plan drawing for one level; mode 'ufh' | 'radiator'. */
export function planSVG(project, res, levelId, mode = 'radiator') {
  const D = doc(project);
  const codes = systemCodes(project);
  const fr = frameOf(project, levelId);
  const K = 42; // px per metre (≈ 1:50 on an A3 sheet at screen scale)
  const T = makeT(fr, K);
  const W = (fr.x1 - fr.x0) * K;
  const H = (fr.y1 - fr.y0) * K;
  const parts = [wallsSVG(project, levelId, T), gridSVG(project, levelId, T)];
  const lvNo = sortedLevels(project).findIndex((l) => l.id === levelId) + 1;
  if (mode === 'ufh') {
    for (const r of elementsOf(project, 'room', levelId)) {
      const u = res?.ufh?.[r.id];
      if (!u?.layout) continue;
      for (const l of u.layout) {
        const sp = l.split ?? Math.ceil(l.coil.length / 2);
        parts.push(polyline(l.coil.slice(0, sp), T, RED, 1.1), polyline(l.coil.slice(Math.max(0, sp - 1)), T, BLUE, 1.1));
        if (l.supplyLead?.length) parts.push(polyline(l.supplyLead, T, RED, 1.1));
        if (l.returnLead?.length) parts.push(polyline(l.returnLead, T, BLUE, 1.1));
      }
    }
    for (const c of elementsOf(project, 'collector', levelId).filter((x) => x.kind === 'ufh')) parts.push(collectorSVG(c, T, Math.max(c.outlets ?? 2, res?.ufhPorts?.[c.id] ?? 0), ''));
    for (const t of ufhLoopTags(project, res, levelId)) {
      const b = t.box;
      const c1 = b.w * 0.42;
      parts.push(`<line x1="${T.x(t.anchor.x)}" y1="${T.y(t.anchor.y)}" x2="${T.x(t.leaderEnd.x)}" y2="${T.y(t.leaderEnd.y)}" stroke="#555" stroke-width="0.5"/><circle cx="${T.x(t.anchor.x)}" cy="${T.y(t.anchor.y)}" r="1.4" fill="#111"/>
        <rect x="${T.x(b.x)}" y="${T.y(b.y)}" width="${T.s(b.w)}" height="${T.s(b.h)}" fill="#fff" stroke="#111" stroke-width="0.7"/>
        <line x1="${T.x(b.x + c1)}" y1="${T.y(b.y)}" x2="${T.x(b.x + c1)}" y2="${T.y(b.y + b.h)}" stroke="#111" stroke-width="0.6"/><line x1="${T.x(b.x + c1)}" y1="${T.y(b.y + b.h / 2)}" x2="${T.x(b.x + b.w)}" y2="${T.y(b.y + b.h / 2)}" stroke="#111" stroke-width="0.6"/>
        <text x="${T.x(b.x + c1 / 2)}" y="${T.y(b.y + b.h * 0.68)}" font-size="${T.s(b.h * 0.5)}" text-anchor="middle">${esc(t.text[0])}</text>
        <text x="${T.x(b.x + c1 + (b.w - c1) / 2)}" y="${T.y(b.y + b.h * 0.38)}" font-size="${T.s(b.h * 0.34)}" text-anchor="middle">${esc(t.text[1])}</text>
        <text x="${T.x(b.x + c1 + (b.w - c1) / 2)}" y="${T.y(b.y + b.h * 0.88)}" font-size="${T.s(b.h * 0.34)}" text-anchor="middle">${esc(t.text[2])}</text>`);
    }
  } else {
    // home-run pipes: bundles with rounded bends (PEX) or sharp (PPR/steel)
    for (const p of elementsOf(project, 'pipe', levelId)) {
      const pr = res?.pipes?.[p.id];
      const bend = (pr?.material ?? p.material) === 'PEX' || (pr?.material ?? p.material) === 'PERT';
      const pts = bend ? roundCorners(p.points, 0.18, 5) : p.points;
      parts.push(polyline(pts, T, p.system === 'return' ? BLUE : RED, pr && Number(pr.dn) >= 25 ? 1.8 : 1.1));
    }
    for (const c of elementsOf(project, 'collector', levelId).filter((x) => x.kind !== 'ufh')) {
      const n = c.outlets ?? 4;
      parts.push(collectorSVG(c, T, n, ''));
      const lp = localToPlan(c, collectorBodyX(n).x1 + 0.6, -0.9);
      const ap = localToPlan(c, collectorBodyX(n).x1, 0);
      parts.push(`<line x1="${T.x(ap.x)}" y1="${T.y(ap.y)}" x2="${T.x(lp.x)}" y2="${T.y(lp.y)}" stroke="#333" stroke-width="0.5"/><rect x="${T.x(lp.x)}" y="${T.y(lp.y) - T.s(0.52)}" width="${T.s(2.1)}" height="${T.s(0.52)}" fill="#fff" stroke="#333" stroke-width="0.6"/><text x="${T.x(lp.x) + T.s(1.05)}" y="${T.y(lp.y) - T.s(0.3)}" font-size="${T.s(0.17)}" text-anchor="middle">${esc(D.manifold)}</text><text x="${T.x(lp.x) + T.s(1.05)}" y="${T.y(lp.y) - T.s(0.08)}" font-size="${T.s(0.17)}" text-anchor="middle">c ${n} ${esc(D.outlets)}</text>`);
    }
    for (const e of elementsOf(project, 'radiator', levelId)) {
      const rr = res?.radiators?.[e.id];
      const p = rr?.product;
      const L = e.length ?? p?.length ?? 1;
      if (p?.kind === 'convector') {
        const Dp = p.depth ?? 0.3;
        const pts = [localToPlan(e, -L / 2, -0.05), localToPlan(e, L / 2, -0.05), localToPlan(e, L / 2, Dp - 0.05), localToPlan(e, -L / 2, Dp - 0.05)];
        parts.push(`<polygon points="${pts.map((q) => T(q)).join(' ')}" fill="#d9f0d9" stroke="#1f7a2e" stroke-width="0.7"/>`);
        for (let i = 1; i < Math.round(L / 0.05); i++) {
          const a = localToPlan(e, -L / 2 + i * 0.05, -0.02);
          const b = localToPlan(e, -L / 2 + i * 0.05, Dp - 0.08);
          parts.push(`<line x1="${T.x(a.x)}" y1="${T.y(a.y)}" x2="${T.x(b.x)}" y2="${T.y(b.y)}" stroke="${GREEN}" stroke-width="0.6"/>`);
        }
        // table tag outside the wall line (like the sample): header + 3 cells + output
        const tp = localToPlan(e, 0, -0.95);
        const w = 2.0;
        const h = 0.28;
        const x = T.x(tp.x - w / 2);
        const y = T.y(tp.y - h);
        const cells = p.fan ? [`H${Math.round(p.height * 1000)}`, `${Math.round(L * 1000)}`, `${p.noiseDb}dB`] : [`${Math.round(p.width * 1000)}`, `${Math.round(p.height * 1000)}`, `${Math.round(L * 1000)}`];
        parts.push(`<rect x="${x}" y="${y}" width="${T.s(w)}" height="${T.s(2 * h)}" fill="#fff" stroke="#111" stroke-width="0.6"/><line x1="${x}" y1="${y + T.s(h)}" x2="${x + T.s(w)}" y2="${y + T.s(h)}" stroke="#111" stroke-width="0.5"/>${[1, 2].map((k) => `<line x1="${x + T.s((w * k) / 3)}" y1="${y + T.s(h)}" x2="${x + T.s((w * k) / 3)}" y2="${y + T.s(2 * h)}" stroke="#111" stroke-width="0.5"/>`).join('')}
          <text x="${x + T.s(w / 2)}" y="${y + T.s(h * 0.72)}" font-size="${T.s(0.17)}" text-anchor="middle">${esc(p.fan ? D.convF : D.convN)}</text>${cells.map((c, k) => `<text x="${x + T.s((w * (k + 0.5)) / 3)}" y="${y + T.s(h * 1.72)}" font-size="${T.s(0.16)}" text-anchor="middle">${esc(c)}</text>`).join('')}<text x="${x + T.s(w) + 4}" y="${y + T.s(h * 1.2)}" font-size="${T.s(0.2)}">${Math.round(rr.output)}вт</text>`);
      } else if (p?.kind === 'towel') {
        const c = localToPlan(e, 0, 0);
        parts.push(`<rect x="${T.x(c.x - L / 2)}" y="${T.y(c.y) - 2}" width="${T.s(L)}" height="4" fill="#fff" stroke="#111" stroke-width="0.6"/><text x="${T.x(c.x)}" y="${T.y(c.y) + T.s(0.45)}" font-size="${T.s(0.18)}" text-anchor="middle" style="outline:1px solid #111">${esc(D.dryer)}</text>`);
      } else {
        const pts = [localToPlan(e, -L / 2, -0.05), localToPlan(e, L / 2, -0.05), localToPlan(e, L / 2, 0.05), localToPlan(e, -L / 2, 0.05)];
        parts.push(`<polygon points="${pts.map((q) => T(q)).join(' ')}" fill="#fff" stroke="#111" stroke-width="0.8"/>`);
        const tp = localToPlan(e, 0, 0.35);
        parts.push(`<text x="${T.x(tp.x)}" y="${T.y(tp.y)}" font-size="${T.s(0.18)}" text-anchor="middle">${esc(p?.model ?? '')} ${Math.round(rr?.output ?? 0)}вт</text>`);
      }
    }
    // risers / drops
    for (const r of elementsOf(project, 'riser')) {
      if (r.levelFrom !== levelId && r.levelTo !== levelId) continue;
      const pr = res?.pipes?.[r.id];
      const code = r.system === 'return' ? codes.rr : codes.rs;
      const up = r.levelFrom === levelId;
      parts.push(`<circle cx="${T.x(r.x)}" cy="${T.y(r.y)}" r="3" fill="${r.system === 'return' ? BLUE : RED}"/><text x="${T.x(r.x) + 6}" y="${T.y(r.y) - 4}" font-size="${T.s(0.18)}">${esc(up ? D.riseT : D.dropT)} ${code}-${lvNo} Ø${esc(pr?.dn ?? '')}</text>`);
    }
  }
  parts.push(roomsSVG(project, levelId, T, mode !== 'ufh'));
  // legend
  const lg = mode === 'ufh' ? [[RED, `${D.ufhS}`, codes.us], [BLUE, `${D.ufhR}`, codes.ur]] : [[RED, D.radS, codes.rs], [BLUE, D.radR, codes.rr]];
  const lx = 14;
  const ly = H - 58;
  parts.push(`<text x="${lx}" y="${ly}" font-size="12" font-weight="700">${esc(D.legend)}</text>${lg.map(([c, t, code], i) => `<rect x="${lx}" y="${ly + 8 + i * 18}" width="38" height="12" fill="${c}"/><text x="${lx + 46}" y="${ly + 18 + i * 18}" font-size="11">${esc(t)}</text><text x="${lx + 190}" y="${ly + 18 + i * 18}" font-size="11">${esc(code)}</text>`).join('')}`);
  const title = mode === 'ufh' ? `${lvNo}- ${D.floor} ${D.ufhZone}` : `${lvNo}- ${D.floor} ${D.radTrace}`;
  parts.push(`<text x="${W - 16}" y="36" font-size="26" font-style="italic" text-anchor="end" font-family="'Segoe Print','Comic Sans MS',cursive">${esc(title)}</text>`);
  return `<svg viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/>${parts.join('')}</svg>`;
}

/** Isometric UFH scheme of one level: loops (thin), leads and trunk pipes (thick, with Ø labels), manifolds, riser labels. */
export function ufhAxoSVG(project, res, levelId) {
  const D = doc(project);
  const codes = systemCodes(project);
  const lv = levelById(project, levelId);
  const z0 = lv?.elevation ?? 0;
  const c30 = Math.cos(Math.PI / 6);
  const K = 34;
  const P = (x, y, z = 0) => ({ x: (x - y) * c30 * K, y: (x + y) * 0.5 * K - (z - z0) * K * 1.2 });
  const segs = [];
  const labels = [];
  for (const r of elementsOf(project, 'room', levelId)) {
    const u = res?.ufh?.[r.id];
    for (const l of u?.layout ?? []) {
      const sp = l.split ?? Math.ceil(l.coil.length / 2);
      segs.push({ pts: l.coil.slice(0, sp).map((q) => P(q.x, q.y, z0)), c: RED, w: 0.6, o: 0.55 });
      segs.push({ pts: l.coil.slice(Math.max(0, sp - 1)).map((q) => P(q.x, q.y, z0)), c: BLUE, w: 0.6, o: 0.55 });
      if (l.supplyLead?.length) segs.push({ pts: l.supplyLead.map((q) => P(q.x, q.y, z0)), c: RED, w: 0.9, o: 0.8 });
      if (l.returnLead?.length) segs.push({ pts: l.returnLead.map((q) => P(q.x, q.y, z0)), c: BLUE, w: 0.9, o: 0.8 });
    }
  }
  for (const p of elementsOf(project, 'pipe', levelId)) {
    const pr = res?.pipes?.[p.id];
    const z = z0 + (p.elevation ?? 0.05);
    const pts = p.points.map((q) => P(q.x, q.y, z));
    segs.push({ pts, c: p.system === 'return' ? BLUE : RED, w: 2.4, o: 1 });
    if (pr && p.points.length > 1) {
      let best = 1;
      for (let i = 1; i < p.points.length; i++) if (Math.hypot(p.points[i].x - p.points[i - 1].x, p.points[i].y - p.points[i - 1].y) > Math.hypot(p.points[best].x - p.points[best - 1].x, p.points[best].y - p.points[best - 1].y)) best = i;
      const a = pts[best - 1];
      const b = pts[best];
      if (Math.hypot(b.x - a.x, b.y - a.y) > 60) labels.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: `${p.system === 'return' ? codes.rr : codes.rs}-Ø${pr.dn}` });
    }
  }
  for (const r of elementsOf(project, 'riser')) {
    if (r.levelFrom !== levelId && r.levelTo !== levelId) continue;
    const a = levelById(project, r.levelFrom);
    const b = levelById(project, r.levelTo);
    const pr = res?.pipes?.[r.id];
    const pa = P(r.x, r.y, a.elevation + 0.1);
    const pb = P(r.x, r.y, Math.min(b.elevation, z0 + 2.4));
    segs.push({ pts: [pa, pb], c: r.system === 'return' ? BLUE : RED, w: 2.4, o: 1 });
    labels.push({ x: pb.x + 6, y: pb.y + 10, t: `${D.riseT} ${r.system === 'return' ? codes.rr : codes.rs}`, t2: `Ø${pr?.dn ?? ''}` });
  }
  const cols = elementsOf(project, 'collector', levelId);
  const all = segs.flatMap((s) => s.pts);
  if (!all.length) return '<p>—</p>';
  const minX = Math.min(...all.map((p) => p.x)) - 60;
  const minY = Math.min(...all.map((p) => p.y)) - 60;
  const maxX = Math.max(...all.map((p) => p.x)) + 60;
  const maxY = Math.max(...all.map((p) => p.y)) + 40;
  const f = (p) => `${(p.x - minX).toFixed(1)},${(p.y - minY).toFixed(1)}`;
  let out = segs.map((s) => `<polyline points="${s.pts.map(f).join(' ')}" fill="none" stroke="${s.c}" stroke-width="${s.w}" opacity="${s.o}" stroke-linejoin="round"/>`).join('');
  const pos = positions(project, res);
  for (const c of cols) {
    const n = Math.max(c.outlets ?? 4, res?.ufhPorts?.[c.id] ?? 0);
    const { x0, x1 } = collectorBodyX(n);
    const a = localToPlan(c, x0, 0.1);
    const b = localToPlan(c, x1, 0.1);
    const A = P(a.x, a.y, z0 + 0.6);
    const B = P(b.x, b.y, z0 + 0.6);
    out += `<line x1="${A.x - minX}" y1="${A.y - minY}" x2="${B.x - minX}" y2="${B.y - minY}" stroke="#222" stroke-width="7"/><line x1="${A.x - minX}" y1="${A.y - minY + 8}" x2="${B.x - minX}" y2="${B.y - minY + 8}" stroke="#555" stroke-width="7"/>`;
    const pn = pos.byId.get(c.id);
    if (pn) out += `<text x="${B.x - minX + 6}" y="${B.y - minY - 12}" font-size="12" fill="#c0268c">${pn}</text>`;
  }
  for (const l of labels) out += `<text x="${l.x - minX}" y="${l.y - minY - 4}" font-size="11">${esc(l.t)}</text>${l.t2 ? `<text x="${l.x - minX}" y="${l.y - minY + 10}" font-size="11">${esc(l.t2)}</text>` : ''}`;
  const W = maxX - minX;
  const H = maxY - minY;
  return `<svg viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/>${out}</svg>`;
}

/** Legend + equipment specification block (HTML) used under plans/schemes. */
export function specBlockHTML(project, res, filter) {
  const D = doc(project);
  const { rows } = positions(project, res);
  const list = rows.filter(filter ?? (() => true));
  if (!list.length) return '';
  return `<table class="tbl" style="font-size:9px"><tr><th>${D.pos}</th><th>${D.name}</th><th>${D.type}</th><th>${D.qty}</th></tr>${list.map((r) => `<tr><td>${r.pos}</td><td>${esc(r.name)}</td><td>${esc(r.type)}</td><td class="n">${r.qty}</td></tr>`).join('')}</table>`;
}
