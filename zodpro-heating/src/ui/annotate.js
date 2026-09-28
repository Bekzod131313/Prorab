// Drawing annotation layouts shared by the plan editor and the sheet generator:
// UFH loop tags around the building ("1.2.3 | Ø16 | L=53 м" with leaders), structural grid axes,
// equipment positions (Поз.) and system designations.
import { elementsOf, sortedLevels } from '../core/model.js';

export const RU_LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'И', 'К', 'Л', 'М', 'Н', 'П', 'Р', 'С', 'Т', 'У', 'Ф', 'Ш', 'Э', 'Ю', 'Я'];

export function levelBBox(project, levelId) {
  const pts = [];
  for (const w of elementsOf(project, 'wall', levelId)) {
    const t = (w.thickness ?? 0.2) / 2;
    pts.push({ x: w.a.x - t, y: w.a.y - t }, { x: w.b.x + t, y: w.b.y + t }, { x: w.a.x + t, y: w.a.y + t }, { x: w.b.x - t, y: w.b.y - t });
  }
  if (!pts.length) for (const r of elementsOf(project, 'room', levelId)) pts.push(...r.points);
  if (!pts.length) return null;
  return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) };
}

/**
 * Loop tags placed outside the building on the nearest side, spread so they never overlap,
 * each with a leader to its loop. Sizes are in metres (drawing annotation at 1:50 ≈ 2.5 mm text).
 */
export function ufhLoopTags(project, res, levelId, { w = 1.25, h = 0.42, gap = 0.08, offset = 0.9 } = {}) {
  const bb = levelBBox(project, levelId);
  if (!bb) return [];
  const items = [];
  for (const r of elementsOf(project, 'room', levelId)) {
    const u = res?.ufh?.[r.id];
    if (!u?.layout) continue;
    u.layout.forEach((l, i) => {
      // anchor: middle of the first supply run of the loop
      const a = l.coil[Math.min(l.coil.length - 1, Math.max(1, Math.floor((l.split ?? l.coil.length) / 6)))];
      items.push({ id: u.loopIds?.[i] ?? `${i + 1}`, dn: u.pipe?.dn ?? '16', L: l.length, anchor: a, roomId: r.id });
    });
  }
  const sides = { top: [], bottom: [], left: [], right: [] };
  for (const it of items) {
    const d = { top: it.anchor.y - bb.y0, bottom: bb.y1 - it.anchor.y, left: it.anchor.x - bb.x0, right: bb.x1 - it.anchor.x };
    const side = Object.entries(d).sort((a, b) => a[1] - b[1])[0][0];
    sides[side].push(it);
  }
  const out = [];
  for (const [side, list] of Object.entries(sides)) {
    const horiz = side === 'top' || side === 'bottom';
    const span = horiz ? w : h * 1.0;
    const step = (horiz ? w : h) + gap;
    list.sort((a, b) => (horiz ? a.anchor.x - b.anchor.x : a.anchor.y - b.anchor.y));
    let cursor = -Infinity;
    for (const it of list) {
      const want = (horiz ? it.anchor.x : it.anchor.y) - span / 2;
      const pos = Math.max(want, cursor);
      cursor = pos + step;
      const box = horiz
        ? { x: pos, y: side === 'top' ? bb.y0 - offset - h : bb.y1 + offset, w, h }
        : { x: side === 'left' ? bb.x0 - offset - w : bb.x1 + offset, y: pos, w, h };
      // leader end on the box edge facing the building
      const end = horiz ? { x: box.x + w / 2, y: side === 'top' ? box.y + h : box.y } : { x: side === 'left' ? box.x + w : box.x, y: box.y + h / 2 };
      out.push({ ...it, side, box, leaderEnd: end, text: [it.id, `Ø${it.dn}`, `L=${Math.round(it.L)} м`] });
    }
  }
  return out;
}

/** Generate structural grid axes from long wall lines of the lowest level (1…n along x, А… along y from the bottom). */
export function autoGrid(project) {
  const lv = sortedLevels(project)[0];
  if (!lv) return { x: [], y: [] };
  const walls = elementsOf(project, 'wall', lv.id);
  const xs = [];
  const ys = [];
  for (const w of walls) {
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (L < 2.5 && !w.exterior) continue;
    if (Math.abs(w.a.x - w.b.x) < 1e-3) xs.push(w.a.x);
    if (Math.abs(w.a.y - w.b.y) < 1e-3) ys.push(w.a.y);
  }
  const uniq = (arr) => [...new Set(arr.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1] > 0.3);
  const X = uniq(xs).map((pos, i) => ({ name: String(i + 1), pos }));
  const Yv = uniq(ys);
  const Y = [...Yv].reverse().map((pos, i) => ({ name: RU_LETTERS[i] ?? `Y${i + 1}`, pos }));
  return { x: X, y: Y };
}

/** Equipment positions (Поз.) — one number per product type, in specification order. */
export function positions(project, res) {
  const map = new Map(); // key → {pos, name, type, qty, ids[]}
  const add = (key, name, type, id) => {
    if (!map.has(key)) map.set(key, { key, name, type, qty: 0, ids: [] });
    const r = map.get(key);
    r.qty++;
    r.ids.push(id);
  };
  const kindName = (p) => (p.kind === 'convector' ? (p.fan ? 'Внутрипольный конвектор с вентилятором' : 'Внутрипольный конвектор без вентилятора') : p.kind === 'towel' ? 'Полотенцесушитель' : p.kind === 'sectional' ? 'Радиатор секционный' : 'Радиатор стальной панельный');
  for (const e of elementsOf(project, 'radiator')) {
    const p = res?.radiators?.[e.id]?.product;
    if (!p) continue;
    const type = p.kind === 'convector' ? `${p.fan ? `H=${Math.round(p.height * 1000)} мм ` : `${Math.round(p.width * 1000)}×${Math.round(p.height * 1000)}×`}L=${Math.round(p.length * 1000)} мм${p.fan ? ` / 3-скорость ${p.noiseDb} дБ` : ''} / ${p.q75} Вт` : `${p.model} / ${p.q75} Вт`;
    add(`rad|${p.id}`, kindName(p), type, e.id);
  }
  for (const c of elementsOf(project, 'collector')) {
    const n = Math.max(c.outlets ?? 4, res?.ufhPorts?.[c.id] ?? 0);
    add(`col|${c.kind}|${n}`, c.kind === 'ufh' ? 'Коллектор расходомерный для теплого пола' : 'Коллектор расходомерный для радиатора', `${n}-контур`, c.id);
  }
  for (const b of elementsOf(project, 'boiler')) add(`boiler|${res?.boiler?.product?.id}`, 'Котёл газовый настенный', res?.boiler?.product?.model ?? '', b.id);
  for (const p of elementsOf(project, 'pump')) add(`pump|${res?.pump?.product?.id}`, 'Насос циркуляционный', res?.pump?.product?.model ?? '', p.id);
  for (const t of elementsOf(project, 'thermostat')) add('thermostat', 'Термостат комнатный', t.kind ?? 'room', t.id);
  const rows = [...map.values()];
  rows.forEach((r, i) => (r.pos = i + 1));
  const byId = new Map();
  for (const r of rows) for (const id of r.ids) byId.set(id, r.pos);
  return { rows, byId };
}

/** System designations used on drawings (configurable per project, defaults follow the sample: T1/T2 UFH, T5/T6 radiators). */
export function systemCodes(project) {
  return { rs: 'T5', rr: 'T6', us: 'T1', ur: 'T2', ...(project.settings.systemCodes ?? {}) };
}
