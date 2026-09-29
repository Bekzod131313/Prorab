// 2D CAD / BIM plan editor (canvas). Tools create semantic BIM elements, not lines.
import { newElement, elementsOf, openingPos, localToPlan, connectorsOf, wallDir, levelById, sortedLevels, roomTemp, isHeated, collectorBodyX, collectorPortLocal, COLLECTOR_RETURN_Y } from '../core/model.js';
import { pointInPolygon, projectOnSegment, polygonCentroid, dist, round, polygonArea } from '../core/util.js';
import { t, msg } from '../core/i18n.js';
import { ufhLoopTags, positions, systemCodes, levelBBox } from './annotate.js';
import { transformElement, translateFn, rotateFn, mirrorFn, mirrorAngle, duplicate, extendToBoundary, splitAt, filletWalls, offsetElement, detectRoom, teeSplits } from './geometry-ops.js';

const r3 = (v) => round(v, 3);
const EQUIP = ['radiator', 'boiler', 'collector', 'pump', 'thermostat'];

export const TOOL_HINTS = {
  select: 'Bosing — tanlash · Shift — qo‘shish · sudrash — ko‘chirish · bo‘sh joydan sudrash — ramka',
  wall: 'Devor: boshlang‘ich va keyingi nuqtalarni bosing · Esc/o‘ng tugma — tugatish · masofa yozing (masalan 3.6)',
  room: 'Xona: devorlar bilan o‘ralgan joy ichiga bosing (avto aniqlash)',
  room_poly: 'Xona poligoni: burchaklarni bosing · Enter — yopish',
  window: 'Deraza: devor ustiga bosing',
  door: 'Eshik: devor ustiga bosing',
  radiator: 'Radiator: devor yoniga (deraza tagiga) bosing',
  pipe_s: "Ta'minot quvuri: konnektordan boshlang, nuqtalarni bosing, konnektorda tugating · Alt — erkin burchak",
  pipe_r: 'Qaytish quvuri: konnektordan boshlang, nuqtalarni bosing, konnektorda tugating',
  riser: 'Stoyak: nuqtani bosing (ta’minot + qaytish, yuqori qavatgacha)',
  collector: 'Kollektor: joyni bosing · R — 90° burish',
  ufh_collector: 'Pol isitish kollektori: joyni bosing · R — burish',
  ufh_room: 'Issiq pol: xonani bosing — konturlar va kollektor avtomatik (qayta bosish — o‘chirish)',
  boiler: 'Qozon: joyni bosing · R — burish',
  pump: 'Nasos: joyni bosing · R — burish',
  thermostat: 'Termostat: xona ichiga bosing',
  obstacle: "To'siq (balka/kanal): 2 nuqta",
  text: 'Matn: joyni bosing',
  dim: "O'lcham: 2 nuqta, keyin joylashuv",
  measure: "O'lchash: 2 nuqta",
  line: 'Chiziq: nuqtalarni bosing',
  polyline: 'Polilinya: nuqtalar · Enter — tugatish',
  circle: 'Aylana: markaz, radius',
  arc: 'Yoy: 3 nuqta',
  rect: "To'rtburchak: 2 burchak",
  hatch: 'Shtrix: kontur nuqtalari · Enter',
  leader: 'Vynoska: 2 nuqta, matn',
  move: "Ko'chirish: tanlang, bazaviy nuqta, maqsad",
  copy: 'Nusxa: tanlang, bazaviy nuqta, maqsad',
  rotate: 'Burish: markaz, keyin burchak nuqtasi (yoki burchakni yozing)',
  mirror: 'Oyna: o‘q chizig‘ining 2 nuqtasi',
  offset: 'Offset: masofani yozing, devor/quvurni bosing, tomonni bosing',
  trim: 'Trim: devor/quvur uchini bosing — kesishgacha qisqartiriladi',
  extend: 'Extend: devor/quvur uchini bosing — chegaragacha uzaytiriladi',
  split: "Bo'lish: devor/quvur ustiga bosing",
  fillet: 'Fillet (R=0): ikkita devorni bosing',
  array: 'Massiv: buyruq qatoriga "n,dx,dy" yozing',
  calibrate: 'Kalibrlash: podloshkada 2 nuqta, keyin haqiqiy masofa',
  section: 'Kesim chizig‘i: 2 nuqta',
};

export class PlanView {
  constructor(canvas, store, app) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.store = store;
    this.app = app;
    this.scale = 45;
    this.ox = 80;
    this.oy = 80;
    this.tool = 'select';
    this.ts = {}; // tool state
    this.opts = {
      wall: { thickness: 0.4, exterior: true, assembly: 'ext_brick_380_eps100' },
      wallInt: { thickness: 0.16, assembly: 'int_brick_120' },
      window: { width: 1.5, height: 1.5, sill: 0.9, type: 'win_pvc_2' },
      door: { width: 0.9, height: 2.1, sill: 0, type: 'door_int' },
      angle: 0,
      offsetDist: 0.5,
    };
    this.toggles = { snap: true, grid: true, ortho: false, osnap: true, tags: true, ufh: true, arrows: true, underlay: true };
    this.colorMode = 'system';
    this.hidden = new Set(); // hidden categories (layers)
    this.mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    this.snapInfo = null;
    this.hover = null;
    this.images = new Map();
    this.bind();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    store.on('results', () => this.draw());
    store.on('selection', () => this.draw());
    store.on('view', () => this.draw());
    store.on('project', () => {
      this.fit();
      this.draw();
    });
    this.readColors();
  }

  readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (k) => cs.getPropertyValue(k).trim();
    this.col = {
      canvas: v('--canvas'), grid: v('--grid'), gridMajor: v('--grid-major'), wall: v('--wall'), wallInt: v('--wall-int'),
      room: v('--room'), text: v('--text'), muted: v('--muted'), accent: v('--accent'), ok: v('--ok'), warn: v('--warn'), err: v('--err'), crit: v('--crit'),
      supply: this.store.project.settings.colors?.supply ?? v('--supply'), ret: this.store.project.settings.colors?.return ?? v('--return'), ufh: v('--ufh'), panel: v('--panel'),
    };
  }

  // ---------- transforms ----------
  w2s(p) {
    return { x: p.x * this.scale + this.ox, y: p.y * this.scale + this.oy };
  }
  s2w(x, y) {
    return { x: (x - this.ox) / this.scale, y: (y - this.oy) / this.scale };
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = Math.max(10, r.width);
    this.h = Math.max(10, r.height);
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this._fitted && this.w > 50) {
      this._fitted = true;
      this.fit();
    }
    this.draw();
  }

  fit(ids = null) {
    const lv = this.store.activeLevelId;
    const pts = [];
    for (const e of Object.values(this.store.project.elements)) {
      if (ids && !ids.includes(e.id)) continue;
      if (!ids && e.levelId !== lv) continue;
      if (e.a) pts.push(e.a, e.b);
      if (e.points) pts.push(...e.points);
      if (e.x !== undefined) pts.push({ x: e.x, y: e.y });
    }
    if (!pts.length) {
      this.scale = 45;
      this.ox = this.w / 2 - 5 * this.scale;
      this.oy = this.h / 2 - 4 * this.scale;
      return;
    }
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const pad = 70;
    const sw = Math.max(0.5, maxX - minX);
    const sh = Math.max(0.5, maxY - minY);
    this.scale = Math.min((this.w - 2 * pad) / sw, (this.h - 2 * pad) / sh, 400);
    this.ox = (this.w - sw * this.scale) / 2 - minX * this.scale;
    this.oy = (this.h - sh * this.scale) / 2 - minY * this.scale;
    this.draw();
  }

  // ---------- tools ----------
  setTool(name) {
    this.tool = name;
    this.ts = {};
    this.canvas.style.cursor = name === 'select' ? 'default' : 'crosshair';
    this.app.setHint(TOOL_HINTS[name] ?? '');
    if (['move', 'copy', 'rotate', 'mirror', 'array'].includes(name) && !this.store.selection.size) this.app.toast('Avval elementlarni tanlang');
    if (name === 'array') this.app.focusCmd('');
    this.draw();
  }

  finishTool() {
    const s = this.ts;
    if (this.tool === 'ufh_pipe' && s.ufh) {
      this.ts = {};
      if (s.pts.length >= 2) this.app.ufh.finishManual(s);
      this.app.setTool('select');
      return;
    }
    if ((this.tool === 'ufh_zone' || this.tool === 'floor_obstacle') && (s.ufhZone || s.ufhObstacle)) {
      this.ts = {};
      this.app.setTool('select');
      if (s.pts?.length >= 3) {
        if (s.ufhZone) this.app.ufh.zoneDrawn(s, s.pts);
        else this.app.ufh.obstacleDrawn(s, s.pts);
      }
      return;
    }
    if ((this.tool === 'pipe_s' || this.tool === 'pipe_r') && s.pts?.length >= 2) this.commitPipe();
    else if (this.tool === 'room_poly' && s.pts?.length >= 3) this.commitRoomPoly();
    else if (this.tool === 'polyline' && s.pts?.length >= 2) this.addEl('dline', { points: s.pts, closed: false }, 'polyline');
    else if (this.tool === 'hatch' && s.pts?.length >= 3) this.addEl('dline', { points: s.pts, closed: true, hatch: true }, 'hatch');
    this.ts = {};
    this.draw();
  }

  cancel() {
    if (['ufh_pipe', 'ufh_zone', 'floor_obstacle'].includes(this.tool)) {
      this.ts = {};
      this.app.setTool('select');
      this.draw();
      return;
    }
    if (Object.keys(this.ts).length) {
      if (this.tool === 'wall' || this.tool === 'line') this.ts = {};
      else this.finishTool();
      this.ts = {};
    } else if (this.tool !== 'select') this.app.setTool('select');
    else this.store.clearSelection();
    this.draw();
  }

  addEl(cat, props, label) {
    const el = newElement(cat, { levelId: this.store.activeLevelId, ...props });
    this.store.apply({ add: [el] }, label ?? cat);
    return el;
  }

  // numeric/relative input from the command line while drawing
  numericInput(text) {
    const last = this.ts.pts?.[this.ts.pts.length - 1] ?? this.ts.a ?? this.ts.base ?? this.ts.center;
    let p = null;
    const rel = text.match(/^@\s*(-?[\d.]+)\s*[,; ]\s*(-?[\d.]+)$/);
    const abs = text.match(/^(-?[\d.]+)\s*[,;]\s*(-?[\d.]+)$/);
    const len = text.match(/^(-?[\d.]+)$/);
    if (this.tool === 'offset' && len) {
      this.opts.offsetDist = Number(len[1]);
      this.app.toast(`Offset = ${this.opts.offsetDist} m`);
      return true;
    }
    if (this.tool === 'rotate' && len && this.ts.center) {
      this.doRotate(Number(len[1]));
      return true;
    }
    if (this.tool === 'array') {
      const m = text.match(/^(\d+)\s*[,; ]\s*(-?[\d.]+)\s*[,; ]\s*(-?[\d.]+)$/);
      if (m) {
        this.doArray(Number(m[1]), Number(m[2]), Number(m[3]));
        return true;
      }
    }
    if (rel && last) p = { x: last.x + Number(rel[1]), y: last.y + Number(rel[2]) };
    else if (abs) p = { x: Number(abs[1]), y: Number(abs[2]) };
    else if (len && last) {
      const m = this.snapInfo?.p ?? this.mouse;
      let dx = m.x - last.x;
      let dy = m.y - last.y;
      const L = Math.hypot(dx, dy) || 1;
      dx /= L;
      dy /= L;
      if (this.toggles.ortho || this.tool.startsWith('pipe') || this.tool === 'wall') {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0, dx = Math.sign(dx) || 1;
        else dx = 0, dy = Math.sign(dy) || 1;
      }
      p = { x: last.x + dx * Number(len[1]), y: last.y + dy * Number(len[1]) };
    }
    if (!p) return false;
    this.click({ x: r3(p.x), y: r3(p.y) }, {});
    return true;
  }

  // ---------- snapping ----------
  snapCandidates() {
    const lv = this.store.activeLevelId;
    const out = [];
    const res = this.store.results;
    for (const e of Object.values(this.store.project.elements)) {
      if (e.cat === 'riser') {
        if (e.levelFrom === lv || e.levelTo === lv) out.push({ p: { x: e.x, y: e.y }, kind: 'riser', pr: 1 });
        continue;
      }
      if (e.levelId !== lv) continue;
      if (e.a) {
        out.push({ p: e.a, kind: 'end', pr: 2 }, { p: e.b, kind: 'end', pr: 2 }, { p: { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }, kind: 'mid', pr: 3 });
      }
      if (e.points) for (const p of e.points) out.push({ p, kind: 'end', pr: 2 });
      if (['radiator', 'collector', 'boiler', 'pump'].includes(e.cat)) {
        for (const c of connectorsOf(this.store.project, e, (el) => res?.radiators?.[el.id]?.product)) out.push({ p: c.pos, kind: 'conn', system: c.system, pr: 0, conn: c });
      }
      if (e.cat === 'window' || e.cat === 'door') {
        const op = openingPos(this.store.project, e);
        if (op) out.push({ p: op, kind: 'mid', pr: 3 });
      }
    }
    return out;
  }

  snap(p, from = null, opts = {}) {
    let best = null;
    const tol = 10 / this.scale;
    if (this.toggles.osnap) {
      for (const c of this.snapCandidates()) {
        const d = dist(p, c.p);
        if (d > tol) continue;
        if (opts.system && c.kind === 'conn' && c.system !== opts.system) continue;
        if (!best || c.pr < best.pr || (c.pr === best.pr && d < best.d)) best = { ...c, d };
      }
      if (!best && opts.onPipes) {
        for (const pipe of elementsOf(this.store.project, 'pipe', this.store.activeLevelId)) {
          if (opts.system && (pipe.system ?? 'supply') !== opts.system) continue;
          for (let i = 1; i < pipe.points.length; i++) {
            const pr = projectOnSegment(p, pipe.points[i - 1], pipe.points[i]);
            if (pr.d < tol && (!best || pr.d < best.d)) best = { p: pr.point, kind: 'on', d: pr.d, pr: 4 };
          }
        }
      }
    }
    let q = best ? { ...best.p } : { ...p };
    if (!best && from && (this.toggles.ortho || opts.ortho)) {
      if (Math.abs(q.x - from.x) > Math.abs(q.y - from.y)) q.y = from.y;
      else q.x = from.x;
    }
    if (!best && this.toggles.snap) {
      const g = this.scale > 120 ? 0.01 : this.scale > 40 ? 0.05 : 0.1;
      q = { x: Math.round(q.x / g) * g, y: Math.round(q.y / g) * g };
      if (from && (this.toggles.ortho || opts.ortho)) {
        if (Math.abs(q.x - from.x) > Math.abs(q.y - from.y)) q.y = from.y;
        else q.x = from.x;
      }
    }
    q = { x: r3(q.x), y: r3(q.y) };
    this.snapInfo = { p: q, kind: best?.kind ?? null, conn: best?.conn ?? null };
    return this.snapInfo;
  }

  // ---------- hit testing ----------
  hitTest(p, onlyCats = null) {
    const lv = this.store.activeLevelId;
    const proj = this.store.project;
    const tol = 6 / this.scale;
    const els = Object.values(proj.elements).filter((e) => (e.levelId === lv || (e.cat === 'riser' && (e.levelFrom === lv || e.levelTo === lv))) && !this.hidden.has(e.cat) && (!onlyCats || onlyCats.includes(e.cat)));
    const inRect = (e, L, y0, y1) => {
      const a = (-(e.angle ?? 0) * Math.PI) / 180;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const lx = dx * Math.cos(a) - dy * Math.sin(a);
      const ly = dx * Math.sin(a) + dy * Math.cos(a);
      return Math.abs(lx) <= L / 2 + tol && ly >= y0 - tol && ly <= y1 + tol;
    };
    // priority order
    for (const e of els) {
      if (e.cat === 'riser' && dist(p, e) < 0.08 + tol) return e.id;
    }
    for (const e of els) {
      if (e.cat === 'radiator' && inRect(e, e.length ?? 1, -0.06, (this.store.results?.radiators?.[e.id]?.product?.kind === 'convector' ? this.store.results.radiators[e.id].product.depth : 0.06))) return e.id;
      if (e.cat === 'boiler' && inRect(e, 0.45, -0.12, 0.25)) return e.id;
      if (e.cat === 'pump' && dist(p, e) < 0.14) return e.id;
      if (e.cat === 'thermostat' && dist(p, e) < 0.12) return e.id;
      if (e.cat === 'collector') {
        const bx = collectorBodyX(Math.max(e.outlets ?? 4, this.ufhPorts?.[e.id] ?? 0));
        const L = bx.x1 - bx.x0;
        const c = localToPlan(e, (bx.x0 + bx.x1) / 2, 0);
        if (inRect({ ...e, x: c.x, y: c.y }, L, -0.05, 0.25)) return e.id;
      }
      if (e.cat === 'text' && dist(p, e) < 0.4) return e.id;
    }
    for (const e of els) {
      if ((e.cat === 'window' || e.cat === 'door')) {
        const op = openingPos(proj, e);
        if (!op) continue;
        const d = { x: Math.cos(op.angle), y: Math.sin(op.angle) };
        const a = { x: op.x - (d.x * e.width) / 2, y: op.y - (d.y * e.width) / 2 };
        const b = { x: op.x + (d.x * e.width) / 2, y: op.y + (d.y * e.width) / 2 };
        if (projectOnSegment(p, a, b).d < (op.wall.thickness ?? 0.3) / 2 + tol) return e.id;
      }
    }
    for (const e of els) {
      if ((e.cat === 'pipe' || e.cat === 'dline' || e.cat === 'dim') && e.points) {
        for (let i = 1; i < e.points.length; i++) if (projectOnSegment(p, e.points[i - 1], e.points[i]).d < tol * 1.2) return e.id;
        if (e.closed && projectOnSegment(p, e.points[e.points.length - 1], e.points[0]).d < tol) return e.id;
      }
      if (e.cat === 'circle' && Math.abs(dist(p, e.center) - e.r) < tol) return e.id;
      if (e.cat === 'obstacle' && projectOnSegment(p, e.a, e.b).d < (e.width ?? 0.3) / 2 + tol) return e.id;
    }
    for (const e of els) {
      if (e.cat === 'ufh_loop' && e.path) for (let i = 1; i < e.path.length; i++) if (projectOnSegment(p, e.path[i - 1], e.path[i]).d < tol) return e.id;
    }
    for (const e of els) {
      if (e.cat === 'wall' && projectOnSegment(p, e.a, e.b).d < (e.thickness ?? 0.2) / 2 + tol) return e.id;
    }
    for (const e of els) if (e.cat === 'floor_obstacle' && pointInPolygon(p, e.points)) return e.id;
    for (const e of els) {
      if (e.cat === 'ufh_zone' && e.points.some((q, i) => projectOnSegment(p, q, e.points[(i + 1) % e.points.length]).d < tol)) return e.id;
    }
    for (const e of els) {
      if (e.cat === 'room' && pointInPolygon(p, e.points)) return e.id;
    }
    return null;
  }

  elementsInRect(a, b, crossing) {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    const inside = (p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
    const lv = this.store.activeLevelId;
    const ids = [];
    for (const e of Object.values(this.store.project.elements)) {
      if (e.levelId !== lv || this.hidden.has(e.cat)) continue;
      let pts = [];
      if (e.a) pts = [e.a, e.b];
      else if (e.points) pts = e.points;
      else if (e.x !== undefined) pts = [{ x: e.x, y: e.y }];
      else if (e.cat === 'window' || e.cat === 'door') {
        const op = openingPos(this.store.project, e);
        if (op) pts = [op];
      }
      if (!pts.length) continue;
      const ok = crossing ? pts.some(inside) : pts.every(inside);
      if (ok) ids.push(e.id);
    }
    return ids;
  }

  // ---------- events ----------
  bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      const ns = Math.min(1500, Math.max(2, this.scale * f));
      const k = ns / this.scale;
      this.ox = e.offsetX - (e.offsetX - this.ox) * k;
      this.oy = e.offsetY - (e.offsetY - this.oy) * k;
      this.scale = ns;
      this.draw();
    }, { passive: false });
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('dblclick', () => this.finishTool());
    // touch pinch zoom
    this.touches = new Map();
  }

  onDown(e) {
    this.canvas.focus();
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.s2w(e.offsetX, e.offsetY);
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (this.touches.size === 2) {
        this.pinch = { d: this.touchDist(), scale: this.scale, ox: this.ox, oy: this.oy };
        return;
      }
    }
    if (e.button === 1 || (e.button === 0 && this.spaceDown) || (e.button === 0 && e.pointerType === 'touch' && this.tool === 'select' && !this.hitTest(p))) {
      this.pan = { x: e.offsetX, y: e.offsetY, ox: this.ox, oy: this.oy };
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    if (e.button === 2) {
      this.cancel();
      return;
    }
    if (this.tool === 'select') {
      // grips first
      const grip = this.gripAt(e.offsetX, e.offsetY);
      if (grip) {
        this.drag = { kind: 'grip', grip, start: p };
        return;
      }
      const id = this.hitTest(p);
      if (id) {
        if (e.shiftKey || e.ctrlKey) this.store.toggleSelect(id);
        else if (!this.store.selection.has(id)) this.store.select(id);
        this.drag = { kind: 'move', start: this.snap(p).p, moved: false };
      } else {
        this.drag = { kind: 'box', start: p, additive: e.shiftKey || e.ctrlKey };
      }
      return;
    }
    const sp = this.snapFor(p, e);
    this.click(sp.p, e, sp);
  }

  touchDist() {
    const [a, b] = [...this.touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  snapFor(p, e) {
    const last = this.ts.pts?.[this.ts.pts.length - 1] ?? this.ts.a ?? null;
    const isPipe = this.tool === 'pipe_s' || this.tool === 'pipe_r';
    return this.snap(p, last, {
      system: isPipe ? (this.tool === 'pipe_s' ? 'supply' : 'return') : null,
      ortho: (isPipe || this.tool === 'wall' || this.tool === 'ufh_pipe') && !e?.altKey,
      onPipes: isPipe,
    });
  }

  onMove(e) {
    const p = this.s2w(e.offsetX, e.offsetY);
    this.mouse = { ...p, sx: e.offsetX, sy: e.offsetY };
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (this.pinch && this.touches.size === 2) {
        const k = this.touchDist() / this.pinch.d;
        this.scale = Math.min(1500, Math.max(2, this.pinch.scale * k));
        const [a, b] = [...this.touches.values()];
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        this.ox = cx - (cx - this.pinch.ox) * k;
        this.oy = cy - (cy - this.pinch.oy) * k;
        this.draw();
        return;
      }
    }
    if (this.pan) {
      this.ox = this.pan.ox + e.offsetX - this.pan.x;
      this.oy = this.pan.oy + e.offsetY - this.pan.y;
      this.draw();
      return;
    }
    if (this.drag) {
      if (this.drag.kind === 'move' || this.drag.kind === 'grip') {
        this.drag.cur = this.snap(p, this.drag.kind === 'move' ? this.drag.start : null).p;
        this.drag.moved = this.drag.moved || dist(this.drag.cur, this.drag.start) > 0.01;
      } else this.drag.cur = p;
      this.draw();
      return;
    }
    if (this.tool === 'select') {
      const h = this.hitTest(p);
      if (h !== this.hover) {
        this.hover = h;
        this.draw();
      }
    } else {
      this.snapFor(p, e);
      this.draw();
    }
    this.app.setCoords(p);
  }

  onUp(e) {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinch = null;
    }
    if (this.pan) {
      this.pan = null;
      this.canvas.style.cursor = this.tool === 'select' ? 'default' : 'crosshair';
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.kind === 'box') {
      const end = d.cur ?? d.start;
      if (dist(end, d.start) * this.scale < 4) {
        if (!d.additive) this.store.clearSelection();
      } else {
        const crossing = end.x < d.start.x;
        this.store.select(this.elementsInRect(d.start, end, crossing), d.additive);
      }
    } else if (d.kind === 'move' && d.moved && d.cur) {
      this.moveSelection(d.cur.x - d.start.x, d.cur.y - d.start.y, false);
    } else if (d.kind === 'grip' && d.cur && d.moved) {
      this.applyGrip(d.grip, d.cur);
    }
    this.draw();
  }

  onKey(e) {
    const k = e.key;
    if (k === 'Escape') {
      this.cancel();
      return true;
    }
    if (k === 'Enter') {
      this.finishTool();
      return true;
    }
    if (k === ' ') {
      this.spaceDown = e.type === 'keydown';
      return true;
    }
    if ((k === 'r' || k === 'R') && ['collector', 'ufh_collector', 'boiler', 'pump', 'radiator'].includes(this.tool)) {
      this.opts.angle = (this.opts.angle + 90) % 360;
      this.opts.angleManual = true;
      this.draw();
      return true;
    }
    if (k === 'F8') {
      this.toggles.ortho = !this.toggles.ortho;
      this.app.renderToggles();
      return true;
    }
    if (k === 'F3') {
      this.toggles.osnap = !this.toggles.osnap;
      this.app.renderToggles();
      return true;
    }
    if (k === 'F9') {
      this.toggles.snap = !this.toggles.snap;
      this.app.renderToggles();
      return true;
    }
    if (k === 'F7') {
      this.toggles.grid = !this.toggles.grid;
      this.app.renderToggles();
      this.draw();
      return true;
    }
    if (k === 'Backspace' && ['ufh_pipe', 'ufh_zone', 'floor_obstacle', 'room_poly', 'polyline', 'pipe_s', 'pipe_r'].includes(this.tool) && this.ts.pts?.length) {
      if (this.tool !== 'ufh_pipe' || this.ts.pts.length > 1) this.ts.pts.pop();
      this.draw();
      return true;
    }
    if (k === 'Delete' || k === 'Backspace') {
      this.app.run('delete');
      return true;
    }
    return false;
  }

  // ---------- selection edits ----------
  moveSelection(dx, dy, copy) {
    const sel = this.store.selected.filter((e) => !(e.cat === 'window' || e.cat === 'door') || !this.store.selection.has(e.wallId));
    if (!sel.length) return;
    // openings slide along their wall
    const updates = [];
    const adds = [];
    const openingOnly = sel.filter((e) => e.cat === 'window' || e.cat === 'door');
    const others = sel.filter((e) => !(e.cat === 'window' || e.cat === 'door'));
    for (const o of openingOnly) {
      const w = this.store.project.elements[o.wallId];
      const d = wallDir(w);
      const off = Math.max(o.width / 2, Math.min(d.L - o.width / 2, o.offset + dx * d.x + dy * d.y));
      updates.push({ id: o.id, patch: { offset: r3(off) } });
    }
    if (copy) adds.push(...duplicate(others, translateFn(dx, dy)));
    else for (const e of others) updates.push({ id: e.id, patch: stripId(transformElement(e, translateFn(dx, dy))) });
    const ufhEdit = others.filter((e) => e.cat === 'ufh_zone' || e.cat === 'floor_obstacle').map((e) => e.id);
    if (ufhEdit.length && !copy) for (const u of this.staleZones(ufhEdit, others.filter((e) => e.cat === 'floor_obstacle').flatMap((e) => e.points.map((q) => ({ x: q.x + dx, y: q.y + dy }))))) if (!updates.some((x) => x.id === u.id)) updates.push(u); else Object.assign(updates.find((x) => x.id === u.id).patch, u.patch);
    this.store.apply({ add: adds, update: updates }, copy ? 'copy' : 'move');
    if (copy) this.store.select(adds.map((a) => a.id));
  }

  doRotate(deg) {
    const sel = this.store.selected;
    const c = this.ts.center;
    const updates = sel.filter((e) => e.cat !== 'window' && e.cat !== 'door').map((e) => ({ id: e.id, patch: stripId(transformElement(e, rotateFn(c, deg), deg)) }));
    this.store.apply({ update: updates }, 'rotate');
    this.ts = {};
  }

  doArray(n, dx, dy) {
    const sel = this.store.selected.filter((e) => e.cat !== 'window' && e.cat !== 'door');
    if (!sel.length) return this.app.toast('Avval tanlang');
    const adds = [];
    for (let i = 1; i < n; i++) adds.push(...duplicate(sel, translateFn(dx * i, dy * i)));
    this.store.apply({ add: adds }, 'array');
    this.app.toast(`Massiv: ${adds.length} element`);
  }

  // grips for single selected wall / pipe / room / dline
  grips() {
    if (this.store.selection.size !== 1) return [];
    const e = this.store.selected[0];
    if (!e || e.levelId !== this.store.activeLevelId) return [];
    if (e.a) return [{ id: e.id, key: 'a', p: e.a }, { id: e.id, key: 'b', p: e.b }];
    if (e.points) return e.points.map((p, i) => ({ id: e.id, key: i, p }));
    return [];
  }

  gripAt(sx, sy) {
    for (const g of this.grips()) {
      const s = this.w2s(g.p);
      if (Math.abs(s.x - sx) < 7 && Math.abs(s.y - sy) < 7) return g;
    }
    return null;
  }

  /** Zones touched by an edit of zones / floor obstacles must be regenerated (spec §32). */
  staleZones(ids, extraPts = []) {
    const proj = this.store.project;
    const out = [];
    for (const z of elementsOf(proj, 'ufh_zone')) {
      if (ids.includes(z.id)) {
        out.push({ id: z.id, patch: { stale: true } });
        continue;
      }
      const touched = ids.some((id) => {
        const o = proj.elements[id];
        return o?.cat === 'floor_obstacle' && (o.points.some((q) => pointInPolygon(q, z.points)) || z.points.some((q) => pointInPolygon(q, o.points)));
      }) || extraPts.some((q) => pointInPolygon(q, z.points));
      if (touched) out.push({ id: z.id, patch: { stale: true } });
    }
    return out;
  }

  applyGrip(g, p) {
    const e0 = this.store.project.elements[g.id];
    if (e0 && (e0.cat === 'ufh_zone' || e0.cat === 'floor_obstacle')) {
      const pts = e0.points.map((q) => ({ ...q }));
      pts[g.key] = { ...pts[g.key], x: p.x, y: p.y };
      this.store.apply({ update: [{ id: e0.id, patch: { points: pts } }, ...this.staleZones([e0.id], [p])] }, 'grip');
      return;
    }
    const e = this.store.project.elements[g.id];
    if (typeof g.key === 'string') this.store.apply({ update: [{ id: e.id, patch: { [g.key]: { x: p.x, y: p.y } } }] }, 'grip');
    else {
      const pts = e.points.map((q) => ({ ...q }));
      pts[g.key] = { ...pts[g.key], x: p.x, y: p.y };
      this.store.apply({ update: [{ id: e.id, patch: { points: pts } }] }, 'grip');
    }
  }

  // ---------- clicks per tool ----------
  async click(p, e, sp = null) {
    const T = this.tool;
    const s = this.ts;
    const lv = this.store.activeLevelId;
    const proj = this.store.project;
    switch (T) {
      case 'wall': {
        if (s.a) {
          if (dist(s.a, p) > 0.05) {
            const ext = !e.ctrlKey && this.opts.wall.exterior;
            const o = ext ? this.opts.wall : { ...this.opts.wallInt, exterior: false };
            this.addEl('wall', { a: s.a, b: p, exterior: ext, thickness: o.thickness, assembly: o.assembly }, 'wall');
          }
          this.ts = { a: p };
        } else this.ts = { a: p };
        break;
      }
      case 'room': {
        const pts = detectRoom(proj, lv, p);
        if (!pts) {
          this.app.toast('Yopiq kontur topilmadi — "Xona (poligon)" dan foydalaning', 'error');
          break;
        }
        this.commitRoom(pts);
        break;
      }
      case 'room_poly': {
        s.pts = s.pts ?? [];
        if (s.pts.length >= 3 && dist(p, s.pts[0]) < 12 / this.scale) {
          this.commitRoomPoly();
          break;
        }
        s.pts.push(p);
        break;
      }
      case 'window':
      case 'door': {
        const w = this.nearestWall(p, 0.6);
        if (!w) {
          this.app.toast('Devor ustiga bosing', 'error');
          break;
        }
        const o = this.opts[T];
        const d = wallDir(w);
        const pr = projectOnSegment(p, w.a, w.b);
        const off = Math.max(o.width / 2, Math.min(d.L - o.width / 2, pr.t * d.L));
        this.addEl(T, { wallId: w.id, offset: r3(off), width: o.width, height: o.height, sill: o.sill, type: o.type }, T);
        break;
      }
      case 'radiator':
        this.placeRadiator(p);
        break;
      case 'pipe_s':
      case 'pipe_r': {
        s.pts = s.pts ?? [];
        const system = T === 'pipe_s' ? 'supply' : 'return';
        if (sp?.kind === 'conn' && sp.conn.system !== system) {
          this.app.toast(msg('connector_system_mismatch', { system }), 'error');
          break;
        }
        const last = s.pts[s.pts.length - 1];
        if (last && dist(last, p) < 0.005) {
          if (s.pts.length >= 2) this.commitPipe();
          break;
        }
        s.pts.push(p);
        if (s.pts.length >= 2 && (sp?.kind === 'conn' || sp?.kind === 'riser' || sp?.kind === 'on')) this.commitPipe();
        break;
      }
      case 'riser': {
        const lvls = sortedLevels(proj);
        const i = lvls.findIndex((l) => l.id === lv);
        const up = lvls[i + 1];
        if (!up) {
          this.app.toast('Yuqorida qavat yo‘q — avval qavat qo‘shing', 'error');
          break;
        }
        const rs = newElement('riser', { system: 'supply', x: p.x, y: p.y, levelFrom: lv, levelTo: up.id, levelId: lv, autoSize: true });
        const rr = newElement('riser', { system: 'return', x: r3(p.x + 0.12), y: p.y, levelFrom: lv, levelTo: up.id, levelId: lv, autoSize: true });
        this.store.apply({ add: [rs, rr] }, 'riser');
        break;
      }
      case 'collector':
      case 'ufh_collector': {
        const at = this.collectorOnWall(p);
        this.addEl('collector', { x: at.x, y: at.y, angle: at.angle, outlets: T === 'ufh_collector' ? 4 : 6, kind: T === 'ufh_collector' ? 'ufh' : 'radiator', mixing: T === 'ufh_collector' }, T);
        break;
      }
      case 'ufh_room': {
        const room = elementsOf(proj, 'room', lv).find((r) => pointInPolygon(p, r.points));
        if (!room) {
          this.app.toast('Xona ichiga bosing', 'error');
          break;
        }
        if (room.heating === 'ufh' || room.heating === 'mixed') {
          this.store.apply({ update: [{ id: room.id, patch: { heating: 'radiator', ufh: null } }] }, 'ufh:off');
          this.app.toast(`${room.name}: issiq pol olib tashlandi`);
        } else this.app.autoUfh([room.id]);
        break;
      }
      case 'boiler':
        this.addEl('boiler', { x: p.x, y: p.y, angle: this.opts.angle }, 'boiler');
        break;
      case 'pump':
        this.addEl('pump', { x: p.x, y: p.y, angle: this.opts.angle }, 'pump');
        break;
      case 'thermostat': {
        const room = elementsOf(proj, 'room', lv).find((r) => pointInPolygon(p, r.points));
        const controls = room ? elementsOf(proj, 'radiator', lv).filter((r) => r.roomId === room.id).map((r) => r.id) : [];
        this.addEl('thermostat', { x: p.x, y: p.y, roomId: room?.id ?? null, controls, kind: 'room', setpoint: room ? roomTemp(room) : 20 }, 'thermostat');
        break;
      }
      case 'text': {
        const txt = await this.app.ask('Matn', '');
        if (txt) this.addEl('text', { x: p.x, y: p.y, text: txt, size: 0.25 }, 'text');
        break;
      }
      case 'leader':
        if (!s.a) this.ts = { a: p };
        else {
          const txt = await this.app.ask('Vynoska matni', '');
          if (txt) this.addEl('dline', { points: [s.a, p], leader: true, text: txt }, 'leader');
          this.ts = {};
        }
        break;
      case 'line':
        if (s.a) {
          this.addEl('dline', { points: [s.a, p] }, 'line');
          this.ts = { a: p };
        } else this.ts = { a: p };
        break;
      case 'polyline':
      case 'hatch':
        s.pts = s.pts ?? [];
        s.pts.push(p);
        break;
      case 'rect':
        if (!s.a) this.ts = { a: p };
        else {
          const a = s.a;
          this.addEl('dline', { points: [a, { x: p.x, y: a.y }, p, { x: a.x, y: p.y }], closed: true }, 'rect');
          this.ts = {};
        }
        break;
      case 'circle':
        if (!s.a) this.ts = { a: p };
        else {
          this.addEl('circle', { center: s.a, r: r3(dist(s.a, p)) }, 'circle');
          this.ts = {};
        }
        break;
      case 'arc':
        s.pts = s.pts ?? [];
        s.pts.push(p);
        if (s.pts.length === 3) {
          this.addEl('dline', { points: arcPoints(...s.pts), arc: true }, 'arc');
          this.ts = {};
        }
        break;
      case 'ufh_pipe': {
        // manual UFH pipe: snaps orthogonally to the last point; the return outlet ends it
        const info = s.ufh;
        if (!info) break;
        if (dist(p, info.circuit.ret) < 12 / this.scale) {
          this.finishTool();
          break;
        }
        s.pts.push(p);
        break;
      }
      case 'ufh_zone':
      case 'floor_obstacle': {
        s.pts = s.pts ?? [];
        if (T === 'ufh_zone' && e?.shiftKey && !s.pts.length) {
          const room = elementsOf(proj, 'room', lv).find((r) => pointInPolygon(p, r.points));
          if (room) {
            const t0 = this.ts;
            this.ts = {};
            this.app.setTool('select');
            this.app.ufh.zoneDrawn(t0, room.points.map((q) => ({ x: q.x, y: q.y })));
            break;
          }
        }
        if (s.pts.length >= 3 && dist(p, s.pts[0]) < 12 / this.scale) {
          this.finishTool();
          break;
        }
        s.pts.push(p);
        break;
      }
      case 'obstacle':
        if (!s.a) this.ts = { a: p };
        else {
          const a0 = s.a;
          this.ts = {};
          const kind = (await this.app.ask('To‘siq turi', 'beam', 'beam / duct / cable_tray / structure / plumbing')) || 'beam';
          s.a = a0;
          this.addEl('obstacle', { a: s.a, b: p, kind, width: 0.3, zBottom: kind === 'beam' ? 2.6 : 2.4, zTop: 3.0 }, 'obstacle');
          this.ts = {};
        }
        break;
      case 'dim':
        s.pts = s.pts ?? [];
        s.pts.push(p);
        if (s.pts.length === 2) {
          this.addEl('dim', { points: s.pts, offset: 0.4 }, 'dim');
          this.ts = {};
        }
        break;
      case 'measure':
        if (!s.a) this.ts = { a: p };
        else {
          this.app.toast(`Masofa: ${dist(s.a, p).toFixed(3)} m  (Δx ${(p.x - s.a.x).toFixed(3)}, Δy ${(p.y - s.a.y).toFixed(3)})`);
          this.ts = {};
        }
        break;
      case 'section':
        if (!s.a) this.ts = { a: p };
        else {
          this.addEl('section', { a: s.a, b: p, depth: 3, name: `Kesim ${elementsOf(proj, 'section').length + 1}` }, 'section');
          this.ts = {};
          this.app.showView('section');
        }
        break;
      case 'move':
      case 'copy':
        if (!this.store.selection.size) break;
        if (!s.base) this.ts = { base: p };
        else {
          this.moveSelection(p.x - s.base.x, p.y - s.base.y, T === 'copy');
          this.ts = T === 'copy' ? { base: s.base } : {};
          if (T === 'move') this.app.setTool('select');
        }
        break;
      case 'rotate':
        if (!this.store.selection.size) break;
        if (!s.center) this.ts = { center: p };
        else this.doRotate(round((Math.atan2(p.y - s.center.y, p.x - s.center.x) * 180) / Math.PI, 2));
        break;
      case 'mirror':
        if (!this.store.selection.size) break;
        if (!s.a) this.ts = { a: p };
        else {
          const fn = mirrorFn(s.a, p);
          const updates = this.store.selected.filter((x) => x.cat !== 'window' && x.cat !== 'door').map((x) => {
            const tr = stripId(transformElement(x, fn, 0, true));
            if (x.angle !== undefined || EQUIP.includes(x.cat)) tr.angle = r3(mirrorAngle(x, s.a, p));
            return { id: x.id, patch: tr };
          });
          this.store.apply({ update: updates }, 'mirror');
          this.ts = {};
        }
        break;
      case 'offset': {
        if (!s.target) {
          const id = this.hitTest(p, ['wall', 'pipe', 'dline']);
          const el = id && proj.elements[id];
          if (!el || !(el.cat === 'wall' || el.cat === 'pipe' || el.cat === 'dline')) break;
          this.ts = { target: el };
        } else {
          const n = offsetElement(s.target, this.opts.offsetDist, p);
          this.store.apply({ add: [n] }, 'offset');
          this.ts = {};
        }
        break;
      }
      case 'trim':
      case 'extend': {
        const id = this.hitTest(p, ['wall', 'pipe', 'dline']);
        const el = id && proj.elements[id];
        if (!el || !(el.cat === 'wall' || el.cat === 'pipe' || el.cat === 'dline')) break;
        const patch = extendToBoundary(proj, el, p, lv, T === 'trim');
        if (!patch) this.app.toast('Chegara topilmadi', 'error');
        else this.store.apply({ update: [{ id: el.id, patch }] }, T);
        break;
      }
      case 'split': {
        const id = this.hitTest(p, ['wall', 'pipe', 'dline']);
        const el = id && proj.elements[id];
        if (!el) break;
        const r = splitAt(proj, el, p);
        if (r) this.store.apply(r, 'split');
        break;
      }
      case 'fillet': {
        const id = this.hitTest(p, ['wall']);
        const el = id && proj.elements[id];
        if (!el || el.cat !== 'wall') break;
        if (!s.first) this.ts = { first: el };
        else {
          const u = filletWalls(s.first, el);
          if (u) this.store.apply({ update: u }, 'fillet');
          this.ts = {};
        }
        break;
      }
      case 'calibrate': {
        if (!s.a) this.ts = { a: p };
        else {
          const real = Number(await this.app.ask('Haqiqiy masofa (m)', dist(s.a, p).toFixed(3)));
          const u = proj.settings.underlays?.[lv];
          if (real > 0 && u) {
            const k = real / dist(s.a, p);
            const nu = { ...u, scale: u.scale * k, x: r3(s.a.x - (s.a.x - u.x) * k), y: r3(s.a.y - (s.a.y - u.y) * k) };
            this.store.apply({ settings: { underlays: { [lv]: nu } } }, 'calibrate');
            this.app.toast(`Masshtab: ×${k.toFixed(4)}`);
          }
          this.ts = {};
          this.app.setTool('select');
        }
        break;
      }
      default:
        break;
    }
    this.draw();
  }

  /**
   * Manifold placement: near a wall (≤ 1 m) the back goes against the wall face and the front
   * (flow meters, connector rows) faces the room, unless the user rotated it with R.
   */
  collectorOnWall(p) {
    const w = this.opts.angleManual ? null : this.nearestWall(p, 1.0);
    if (!w) return { x: p.x, y: p.y, angle: this.opts.angle };
    const d = wallDir(w);
    const pr = projectOnSegment(p, w.a, w.b).point;
    const n = { x: -d.y, y: d.x };
    const side = (p.x - pr.x) * n.x + (p.y - pr.y) * n.y >= 0 ? 1 : -1;
    const inward = { x: n.x * side, y: n.y * side };
    // local +y (connector rows) = inward; the body's back is 0.2 m behind the origin
    const angle = (Math.atan2(-inward.x, inward.y) * 180) / Math.PI;
    const off = (w.thickness ?? 0.2) / 2 + 0.2;
    return { x: r3(pr.x + inward.x * off), y: r3(pr.y + inward.y * off), angle: Math.round(angle * 100) / 100 };
  }

  nearestWall(p, maxD) {
    let best = null;
    for (const w of elementsOf(this.store.project, 'wall', this.store.activeLevelId)) {
      const pr = projectOnSegment(p, w.a, w.b);
      if (pr.d < maxD && (!best || pr.d < best.d)) best = { w, d: pr.d };
    }
    return best?.w ?? null;
  }

  placeRadiator(p) {
    const proj = this.store.project;
    const lv = this.store.activeLevelId;
    const room = elementsOf(proj, 'room', lv).find((r) => pointInPolygon(p, r.points));
    const w = this.nearestWall(p, 1.0);
    if (!w) {
      this.addEl('radiator', { x: p.x, y: p.y, angle: this.opts.angle, roomId: room?.id ?? null, selection: 'auto', prefKind: this.app.radiatorPref.kind, prefType: this.app.radiatorPref.type, mountHeight: 0.1, length: 1 }, 'radiator');
      return;
    }
    const d = wallDir(w);
    const pr = projectOnSegment(p, w.a, w.b);
    let along = pr.t * d.L;
    let windowId = null;
    for (const o of elementsOf(proj, 'window', lv)) {
      if (o.wallId !== w.id) continue;
      if (Math.abs(o.offset - along) <= o.width / 2 + 0.2) {
        along = o.offset;
        windowId = o.id;
      }
    }
    const base = { x: w.a.x + d.x * along, y: w.a.y + d.y * along };
    let n = { x: -d.y, y: d.x };
    if ((p.x - base.x) * n.x + (p.y - base.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    const off = (w.thickness ?? 0.3) / 2 + 0.06;
    const left = { x: -d.y, y: d.x };
    const baseAng = (Math.atan2(d.y, d.x) * 180) / Math.PI;
    const angle = left.x * n.x + left.y * n.y > 0 ? baseAng : baseAng + 180;
    this.addEl('radiator', { x: r3(base.x + n.x * off), y: r3(base.y + n.y * off), angle: r3(angle), roomId: room?.id ?? null, windowId, wallId: w.id, selection: 'auto', prefKind: this.app.radiatorPref.kind, prefType: this.app.radiatorPref.type, mountHeight: 0.1, length: 1 }, 'radiator');
  }

  commitRoom(pts) {
    const proj = this.store.project;
    const lv = this.store.activeLevelId;
    const n = elementsOf(proj, 'room', lv).length + 1;
    const lvIdx = sortedLevels(proj).findIndex((l) => l.id === lv) + 1;
    this.addEl('room', { points: pts, number: `${lvIdx}${String(n).padStart(2, '0')}`, name: `Xona ${lvIdx}${String(n).padStart(2, '0')}`, roomType: 'living', heating: 'radiator' }, 'room');
  }

  commitRoomPoly() {
    const pts = this.ts.pts;
    this.ts = {};
    if (Math.abs(polygonArea(pts)) < 0.2) return;
    this.commitRoom(pts);
  }

  commitPipe() {
    const pts = this.ts.pts;
    const system = this.tool === 'pipe_s' ? 'supply' : 'return';
    this.ts = {};
    if (!pts || pts.length < 2) return;
    const lv = this.store.activeLevelId;
    const s = this.store.project.settings;
    const el = newElement('pipe', { levelId: lv, system, points: pts, material: s.pipeMaterial, autoSize: true, elevation: system === 'supply' ? s.pipeElevation : s.pipeElevation + 0.05 });
    const tee = teeSplits(this.store.project, lv, system, pts);
    this.store.apply({ add: [el, ...tee.add], update: tee.update }, 'pipe');
  }

  // ======================= drawing =======================
  draw() {
    if (!this.w) return;
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this.render());
  }

  render() {
    const ctx = this.ctx;
    const proj = this.store.project;
    const res = this.store.results;
    const lv = this.store.activeLevelId;
    const col = this.col;
    ctx.fillStyle = col.canvas;
    ctx.fillRect(0, 0, this.w, this.h);
    this.labels = [];
    this.ufhPorts = res?.ufhPorts ?? {};
    if (this.toggles.underlay) this.drawUnderlay(ctx, proj.settings.underlays?.[lv]);
    if (this.toggles.grid) this.drawGrid(ctx);
    const els = Object.values(proj.elements);
    const on = (cat) => !this.hidden.has(cat);
    const sel = this.store.selection;

    // rooms
    if (on('room')) for (const r of els) if (r.cat === 'room' && r.levelId === lv) this.drawRoom(ctx, r, res, sel.has(r.id), this.hover === r.id);
    if (on('ufh') && this.toggles.ufh) for (const r of els) if (r.cat === 'room' && r.levelId === lv && res?.ufh?.[r.id]) this.drawUfh(ctx, r, res.ufh[r.id]);
    if (on('ufh') && this.toggles.ufh && this.toggles.tags && this.scale > 12) this.drawUfhTags(ctx, res);
    if (on('ufh')) for (const z of els) if (z.cat === 'ufh_zone' && z.levelId === lv) this.drawUfhZone(ctx, z, sel.has(z.id) || this.hover === z.id);
    for (const o of els) if (o.cat === 'floor_obstacle' && o.levelId === lv && on('obstacle')) this.drawFloorObstacle(ctx, o, sel.has(o.id) || this.hover === o.id);
    for (const h of els) if (h.cat === 'dline' && h.hatch && h.levelId === lv && on('dline')) this.drawHatch(ctx, h, sel.has(h.id));
    // walls & openings
    if (on('wall')) for (const w of els) if (w.cat === 'wall' && w.levelId === lv) this.drawWall(ctx, w, sel.has(w.id), this.hover === w.id);
    for (const o of els) if ((o.cat === 'window' || o.cat === 'door') && o.levelId === lv && on(o.cat)) this.drawOpening(ctx, o, sel.has(o.id) || this.hover === o.id);
    for (const o of els) if (o.cat === 'obstacle' && o.levelId === lv && on('obstacle')) this.drawObstacle(ctx, o, sel.has(o.id));
    // pipes
    const flowDir = this.flowDirections(res);
    for (const p of els) if (p.cat === 'pipe' && p.levelId === lv && on(p.system === 'return' ? 'return' : 'supply')) this.drawPipe(ctx, p, res, sel.has(p.id), this.hover === p.id, flowDir);
    for (const r of els) if (r.cat === 'riser' && (r.levelFrom === lv || r.levelTo === lv) && on('riser')) this.drawRiser(ctx, r, sel.has(r.id), res);
    if (on('ufh') && this.toggles.ufh) {
      const pv0 = this.app.ufh?.preview;
      const hideZone = pv0 && !pv0.isNew && pv0.zone ? pv0.zone.id : pv0?.items && !pv0.items[0].isNew ? pv0.items[0].zone.id : null;
      for (const l of els) if (l.cat === 'ufh_loop' && l.levelId === lv && (!hideZone || l.zoneId !== hideZone)) this.drawUfhLoop(ctx, l, sel.has(l.id) || this.hover === l.id);
    }
    this.drawUfhPreview(ctx);
    // equipment
    for (const e of els) {
      if (e.levelId !== lv || !on(e.cat)) continue;
      const s = sel.has(e.id) || this.hover === e.id;
      if (e.cat === 'radiator') this.drawRadiator(ctx, e, res, s);
      else if (e.cat === 'collector') this.drawCollector(ctx, e, s);
      else if (e.cat === 'boiler') this.drawBoiler(ctx, e, s, res);
      else if (e.cat === 'pump') this.drawPump(ctx, e, s);
      else if (e.cat === 'thermostat') this.drawThermostat(ctx, e, s);
    }
    // annotation
    for (const e of els) {
      if (e.levelId !== lv) continue;
      if (e.cat === 'dline' && !e.hatch && on('dline')) this.drawDline(ctx, e, sel.has(e.id));
      if (e.cat === 'circle' && on('dline')) this.drawCircle(ctx, e, sel.has(e.id));
      if (e.cat === 'text' && on('text')) this.drawText(ctx, e, sel.has(e.id));
      if (e.cat === 'dim' && on('dim')) this.drawDim(ctx, e, sel.has(e.id));
      if (e.cat === 'section') this.drawSectionLine(ctx, e, sel.has(e.id));
    }
    // connectors of selected / hovered equipment and while drawing pipes
    if (this.tool.startsWith('pipe')) this.drawConnectors(ctx, res);
    // clashes
    for (const c of res?.clashes?.clashes ?? []) {
      const a = proj.elements[c.a];
      if (a?.levelId !== lv || c.status === 'resolved') continue;
      const s = this.w2s(c.pos);
      ctx.strokeStyle = col.crit;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
      ctx.moveTo(s.x - 6, s.y - 6);
      ctx.lineTo(s.x + 6, s.y + 6);
      ctx.moveTo(s.x + 6, s.y - 6);
      ctx.lineTo(s.x - 6, s.y + 6);
      ctx.stroke();
    }
    this.drawGrips(ctx);
    this.drawPreview(ctx, res);
    if (this.drag?.kind === 'box' && this.drag.cur) {
      const a = this.w2s(this.drag.start);
      const b = this.w2s(this.drag.cur);
      const crossing = b.x < a.x;
      ctx.fillStyle = crossing ? 'rgba(40,180,90,0.08)' : 'rgba(30,110,242,0.08)';
      ctx.strokeStyle = crossing ? '#1a9c55' : col.accent;
      ctx.setLineDash(crossing ? [5, 4] : []);
      ctx.lineWidth = 1;
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.setLineDash([]);
    }
    if (!this.hidden.has('grid')) this.drawGrids(ctx);
    this.drawNorth(ctx);
    this.drawScaleBar(ctx);
    this.app.ufh?.updateMenu();
  }

  // ---------- UFH engine objects ----------
  drawUfhZone(ctx, z, hot) {
    const pv = this.app.ufh?.preview;
    ctx.save();
    this.poly(ctx, z.points, true);
    ctx.fillStyle = z.stale ? 'rgba(245,158,11,0.07)' : z.status === 'invalid' ? 'rgba(209,26,42,0.05)' : 'rgba(224,138,31,0.05)';
    ctx.fill();
    ctx.setLineDash([7, 4]);
    ctx.strokeStyle = z.stale ? '#f59e0b' : z.status === 'invalid' ? this.col.err : '#e08a1f';
    ctx.lineWidth = hot ? 2.2 : 1.2;
    ctx.stroke();
    ctx.setLineDash([]);
    if (this.toggles.tags && this.scale > 14 && !(pv && pv.zone.id === z.id)) {
      const c = this.w2s(z.points.reduce((a, p) => ({ x: a.x + p.x / z.points.length, y: a.y + p.y / z.points.length }), { x: 0, y: 0 }));
      const cov = z.report?.coverage;
      this.label(ctx, `${z.name} · ${Math.round((z.spacing ?? 0.15) * 1000)} mm${cov != null ? ` · ${(cov * 100).toFixed(0)}%` : ''}${z.stale ? ' · REGENERATE' : ''}`, c.x, c.y, { size: 11, bg: this.col.panel });
    }
    ctx.restore();
  }

  drawFloorObstacle(ctx, o, hot) {
    ctx.save();
    this.poly(ctx, o.points, true);
    ctx.fillStyle = 'rgba(120,120,120,0.25)';
    ctx.fill();
    ctx.strokeStyle = hot ? this.col.accent : '#777';
    ctx.lineWidth = hot ? 2 : 1;
    ctx.stroke();
    ctx.clip();
    ctx.strokeStyle = 'rgba(90,90,90,0.5)';
    ctx.beginPath();
    const b = o.points.reduce((a, p) => ({ x0: Math.min(a.x0, p.x), y0: Math.min(a.y0, p.y), x1: Math.max(a.x1, p.x), y1: Math.max(a.y1, p.y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    for (let t = b.x0 - (b.y1 - b.y0); t < b.x1; t += 0.12) {
      const a = this.w2s({ x: t, y: b.y0 });
      const c = this.w2s({ x: t + (b.y1 - b.y0), y: b.y1 });
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(c.x, c.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** A stored loop: supply half red, return half blue (the bifilar pair is visible). */
  drawUfhLoop(ctx, l, hot, alpha = 1) {
    const path = l.path;
    if (!path?.length) return;
    let total = 0;
    for (let i = 1; i < path.length; i++) total += dist(path[i - 1], path[i]);
    let acc = 0;
    let split = path.length - 1;
    for (let i = 1; i < path.length; i++) {
      acc += dist(path[i - 1], path[i]);
      if (acc >= total / 2) {
        split = i;
        break;
      }
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = hot ? 2.6 : Math.max(1, Math.min(2.2, 0.016 * this.scale));
    ctx.lineJoin = 'round';
    ctx.strokeStyle = l.status === 'invalid' ? this.col.err : this.col.supply;
    this.poly(ctx, path.slice(0, split + 1), false);
    ctx.stroke();
    ctx.strokeStyle = l.status === 'invalid' ? this.col.err : this.col.ret;
    this.poly(ctx, path.slice(split), false);
    ctx.stroke();
    ctx.restore();
    if (this.toggles.tags && this.scale > 22 && l.name) {
      const a = this.w2s(path[Math.min(path.length - 1, Math.max(1, Math.floor(path.length * 0.04)))]);
      this.label(ctx, `${l.name} · ${l.length.toFixed(1)} m · ${Math.round((l.spacing ?? 0.15) * 1000)}`, a.x + 6, a.y - 8, { size: 10, bg: this.col.panel });
    }
  }

  /** Engine preview: coverage map, loops, issue markers (spec §25–§26). */
  drawUfhPreview(ctx) {
    const pv0 = this.app.ufh?.preview;
    if (!pv0) return;
    if (pv0.items) {
      for (const it of pv0.items) this.drawUfhPreviewOne(ctx, { zone: it.zone, result: it.result });
      for (const c of pv0.newCols ?? []) if (c.levelId === this.store.activeLevelId) {
        ctx.globalAlpha = 0.7;
        this.drawCollector(ctx, c, true);
        ctx.globalAlpha = 1;
      }
      return;
    }
    this.drawUfhPreviewOne(ctx, pv0);
  }

  drawUfhPreviewOne(ctx, pv) {
    if (!pv.zone || pv.zone.levelId !== this.store.activeLevelId) return;
    ctx.save();
    this.poly(ctx, pv.zone.points, true);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = this.col.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    const r = pv.result;
    if (r?.map) {
      const m = r.map;
      const colors = [null, 'rgba(58,167,87,0.22)', 'rgba(224,71,76,0.55)', 'rgba(150,150,150,0.5)', 'rgba(216,180,0,0.28)'];
      const cs = m.cell * this.scale;
      for (let j = 0; j < m.ny; j++)
        for (let i = 0; i < m.nx; i++) {
          const v = m.grid[j * m.nx + i];
          if (!v) continue;
          const a = this.w2s({ x: m.x0 + i * m.cell, y: m.y0 + (j + 1) * m.cell });
          ctx.fillStyle = colors[v];
          ctx.fillRect(a.x, a.y, cs + 0.5, cs + 0.5);
        }
    }
    if (r) {
      r.loops.forEach((l) => this.drawUfhLoop(ctx, { ...l, name: '' }, false, 0.95));
      for (const is of r.issues) {
        if (!is.at || is.level !== 'error') continue;
        const a = this.w2s(is.at);
        ctx.strokeStyle = this.col.err;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 9, 0, Math.PI * 2);
        ctx.stroke();
        if (this.scale > 30) this.label(ctx, is.code.replace('UFH-', ''), a.x + 12, a.y - 10, { size: 9.5, bg: this.col.panel, color: this.col.err });
      }
    }
    ctx.restore();
  }

  drawGrid(ctx) {
    const col = this.col;
    const steps = [0.1, 0.5, 1, 5, 10];
    let minor = steps.find((s) => s * this.scale >= 12) ?? 10;
    const major = minor * (minor === 0.5 ? 2 : 5);
    const a = this.s2w(0, 0);
    const b = this.s2w(this.w, this.h);
    for (const [step, color] of [[minor, col.grid], [major, col.gridMajor]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.floor(a.x / step) * step; x <= b.x; x += step) {
        const sx = Math.round(x * this.scale + this.ox) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, this.h);
      }
      for (let y = Math.floor(a.y / step) * step; y <= b.y; y += step) {
        const sy = Math.round(y * this.scale + this.oy) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(this.w, sy);
      }
      ctx.stroke();
    }
  }

  drawUnderlay(ctx, u) {
    if (!u?.src || u.visible === false) return;
    let img = this.images.get(u.src);
    if (!img) {
      img = new Image();
      img.onload = () => this.draw();
      img.src = u.src;
      this.images.set(u.src, img);
    }
    if (!img.complete) return;
    const s = this.w2s({ x: u.x, y: u.y });
    ctx.globalAlpha = u.opacity ?? 0.5;
    ctx.drawImage(img, s.x, s.y, img.width * u.scale * this.scale, img.height * u.scale * this.scale);
    ctx.globalAlpha = 1;
  }

  poly(ctx, pts, close = true) {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const s = this.w2s(p);
      if (i) ctx.lineTo(s.x, s.y);
      else ctx.moveTo(s.x, s.y);
    });
    if (close) ctx.closePath();
  }

  label(ctx, text, sx, sy, opts = {}) {
    const size = opts.size ?? 11;
    ctx.font = `${opts.bold ? '600 ' : ''}${size}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 6;
    const h = size + 4;
    let y = sy;
    if (opts.avoid !== false) {
      for (let k = 0; k < 8; k++) {
        const r = { x: sx - (opts.align === 'left' ? 0 : w / 2), y: y - h / 2, w, h };
        if (!this.labels.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y)) {
          this.labels.push(r);
          break;
        }
        y += (k % 2 ? -1 : 1) * h * (Math.floor(k / 2) + 1);
      }
    }
    if (opts.bg) {
      ctx.fillStyle = opts.bg;
      ctx.fillRect(sx - (opts.align === 'left' ? 0 : w / 2), y - h / 2, w, h);
    }
    ctx.fillStyle = opts.color ?? this.col.text;
    ctx.textAlign = opts.align ?? 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, sx + (opts.align === 'left' ? 3 : 0), y);
  }

  drawRoom(ctx, r, res, selected, hover) {
    const hl = res?.rooms?.[r.id];
    let fill = this.col.room;
    const cov = hl?.emitters?.coverage;
    if (isHeated(r) && hl?.required > 0 && cov !== null && cov !== undefined && cov < 0.95) fill = 'rgba(225,60,60,0.12)';
    this.poly(ctx, r.points);
    ctx.fillStyle = fill;
    ctx.fill();
    if (selected || hover) {
      ctx.strokeStyle = this.col.accent;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!this.toggles.tags) return;
    const c = this.w2s(polygonCentroid(r.points));
    if (this.scale < 12) return;
    // room number in a circle (drawing convention), name below
    if (r.number) {
      const rad = 11;
      ctx.beginPath();
      ctx.arc(c.x, c.y - 22, rad, 0, Math.PI * 2);
      ctx.fillStyle = this.col.panel;
      ctx.fill();
      ctx.strokeStyle = this.col.text;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = this.col.text;
      ctx.font = '600 10px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(r.number), c.x, c.y - 22);
      this.labels.push({ x: c.x - rad, y: c.y - 22 - rad, w: 2 * rad, h: 2 * rad });
    }
    this.label(ctx, r.name, c.x, c.y - 4, { bold: true, size: 12 });
    if (hl) {
      const cv = cov ? ` · ${Math.round(cov * 100)}%` : '';
      this.label(ctx, `${hl.inputs.area.toFixed(1)} m² · ${roomTemp(r)}°C · ${Math.round(hl.required)} W${cv}`, c.x, c.y + 8, { size: 10.5, color: this.col.muted });
    }
  }

  drawUfh(ctx, r, u) {
    const loops = u.layout ?? [];
    const lw = Math.max(1, 0.016 * this.scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    loops.forEach((l) => {
      // supply half (T1, red) and return half (T2, blue) — in a bifilar loop they alternate every s
      const split = l.split ?? Math.ceil(l.coil.length / 2);
      ctx.lineWidth = lw;
      ctx.strokeStyle = this.col.supply;
      this.poly(ctx, l.coil.slice(0, split), false);
      ctx.stroke();
      ctx.strokeStyle = this.col.ret;
      this.poly(ctx, l.coil.slice(Math.max(0, split - 1)), false);
      ctx.stroke();
      for (const [lead, col] of [[l.supplyLead, this.col.supply], [l.returnLead, this.col.ret]]) {
        if (!lead?.length) continue;
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        this.poly(ctx, lead, false);
        ctx.stroke();
      }
    });
  }

  /** Loop tags around the building like the drawings: "1.2.3 | Ø16 | L=53 м" with leaders. */
  drawUfhTags(ctx, res) {
    const tags = ufhLoopTags(this.store.project, res, this.store.activeLevelId);
    ctx.lineWidth = 1;
    for (const t of tags) {
      const a = this.w2s(t.anchor);
      const e = this.w2s(t.leaderEnd);
      ctx.strokeStyle = this.col.muted;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
      ctx.fillStyle = this.col.text;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 2, 0, Math.PI * 2);
      ctx.fill();
      const p = this.w2s({ x: t.box.x, y: t.box.y });
      const w = t.box.w * this.scale;
      const h = t.box.h * this.scale;
      ctx.fillStyle = this.col.panel;
      ctx.fillRect(p.x, p.y, w, h);
      ctx.strokeStyle = this.col.text;
      ctx.strokeRect(p.x, p.y, w, h);
      const c1 = w * 0.42;
      ctx.beginPath();
      ctx.moveTo(p.x + c1, p.y);
      ctx.lineTo(p.x + c1, p.y + h);
      ctx.moveTo(p.x + c1, p.y + h / 2);
      ctx.lineTo(p.x + w, p.y + h / 2);
      ctx.stroke();
      if (h < 9) continue;
      ctx.fillStyle = this.col.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.max(7, h * 0.5)}px system-ui`;
      ctx.fillText(t.text[0], p.x + c1 / 2, p.y + h / 2);
      ctx.font = `${Math.max(6, h * 0.36)}px system-ui`;
      ctx.fillText(t.text[1], p.x + c1 + (w - c1) / 2, p.y + h / 4);
      ctx.fillText(t.text[2], p.x + c1 + (w - c1) / 2, p.y + (3 * h) / 4);
    }
  }

  drawWall(ctx, w, selected, hover) {
    const d = wallDir(w);
    const n = { x: -d.y * (w.thickness / 2), y: d.x * (w.thickness / 2) };
    const pts = [
      { x: w.a.x + n.x, y: w.a.y + n.y },
      { x: w.b.x + n.x, y: w.b.y + n.y },
      { x: w.b.x - n.x, y: w.b.y - n.y },
      { x: w.a.x - n.x, y: w.a.y - n.y },
    ];
    this.poly(ctx, pts);
    ctx.fillStyle = w.exterior ? this.col.wall : this.col.wallInt;
    ctx.fill();
    if (selected || hover) {
      ctx.strokeStyle = this.col.accent;
      ctx.lineWidth = selected ? 3 : 1.5;
      ctx.stroke();
    }
  }

  drawOpening(ctx, o, hl) {
    const op = openingPos(this.store.project, o);
    if (!op) return;
    const w = op.wall;
    const d = { x: Math.cos(op.angle), y: Math.sin(op.angle) };
    const n = { x: -d.y, y: d.x };
    const t = (w.thickness ?? 0.3) / 2;
    const hw = o.width / 2;
    const P = (u, v) => this.w2s({ x: op.x + d.x * u + n.x * v, y: op.y + d.y * u + n.y * v });
    // gap
    ctx.fillStyle = this.col.canvas;
    const g = [P(-hw, -t - 0.01), P(hw, -t - 0.01), P(hw, t + 0.01), P(-hw, t + 0.01)];
    ctx.beginPath();
    g.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hl ? this.col.accent : this.col.wall;
    ctx.lineWidth = hl ? 2 : 1;
    if (o.cat === 'window') {
      ctx.beginPath();
      for (const v of [-t, -t / 3, t / 3, t]) {
        const a = P(-hw, v);
        const b = P(hw, v);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      for (const u of [-hw, hw]) {
        const a = P(u, -t);
        const b = P(u, t);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    } else {
      // door leaf + swing arc
      const side = o.swing === 'out' ? -1 : 1;
      const hinge = P(-hw, side * t);
      const leaf = P(-hw, side * (t + o.width));
      ctx.beginPath();
      ctx.moveTo(hinge.x, hinge.y);
      ctx.lineTo(leaf.x, leaf.y);
      ctx.stroke();
      ctx.beginPath();
      const r = o.width * this.scale;
      const a0 = Math.atan2(leaf.y - hinge.y, leaf.x - hinge.x);
      const end = P(hw, side * t);
      const a1 = Math.atan2(end.y - hinge.y, end.x - hinge.x);
      ctx.setLineDash([3, 3]);
      ctx.arc(hinge.x, hinge.y, r, a0, a1, side * Math.sign(Math.sin(a1 - a0)) < 0);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  drawObstacle(ctx, o, sel) {
    const d = wallDir(o);
    const n = { x: -d.y * ((o.width ?? 0.3) / 2), y: d.x * ((o.width ?? 0.3) / 2) };
    this.poly(ctx, [
      { x: o.a.x + n.x, y: o.a.y + n.y },
      { x: o.b.x + n.x, y: o.b.y + n.y },
      { x: o.b.x - n.x, y: o.b.y - n.y },
      { x: o.a.x - n.x, y: o.a.y - n.y },
    ]);
    ctx.strokeStyle = sel ? this.col.accent : '#8a6d3b';
    ctx.setLineDash([8, 4, 2, 4]);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);
    const m = this.w2s({ x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 });
    if (this.toggles.tags) this.label(ctx, `${o.kind} ${o.zBottom}–${o.zTop} m`, m.x, m.y, { size: 9.5, color: '#8a6d3b' });
  }

  pipeColor(p, pr) {
    if (this.colorMode === 'velocity' && pr) {
      if (pr.status === 'critical') return this.col.crit;
      if (pr.status === 'warning') return this.col.err;
      if (pr.status === 'low') return this.col.warn;
      return this.col.ok;
    }
    if (this.colorMode === 'pressure' && pr) {
      const k = Math.min(1, pr.R / (this.store.project.settings.maxRPaM || 250));
      return `hsl(${(1 - k) * 130}, 70%, 42%)`;
    }
    return p.system === 'return' ? this.col.ret : this.col.supply;
  }

  flowDirections(res) {
    const net = res?._network;
    const map = new Map();
    if (!net) return map;
    for (const tree of [net.supplyTree, net.returnTree]) {
      if (!tree) continue;
      for (const [child, { edge, from }] of tree.parent) {
        if (edge.kind !== 'pipe') continue;
        const f = net.nodes.get(from);
        const c = net.nodes.get(child);
        // supply flows from→child; return flows child→from
        map.set(edge.elementId, edge.system === 'supply' ? { a: f, b: c } : { a: c, b: f });
      }
    }
    return map;
  }

  drawPipe(ctx, p, res, selected, hover, flowDir) {
    const pr = res?.pipes?.[p.id];
    const col = this.pipeColor(p, pr);
    const wpx = Math.max(1.5, Math.min(8, (pr?.dInner ?? 0.016) * this.scale * 1.4));
    if (selected || hover) {
      this.poly(ctx, p.points, false);
      ctx.strokeStyle = this.col.accent;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = wpx + 6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    this.poly(ctx, p.points, false);
    ctx.strokeStyle = col;
    ctx.lineWidth = wpx;
    ctx.lineJoin = 'round';
    if (p.system === 'return') ctx.setLineDash([10, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    // flow arrows
    const fd = flowDir.get(p.id);
    if (this.toggles.arrows && fd && this.scale > 18) {
      let pts = p.points;
      if (dist(pts[0], fd.a) > dist(pts[pts.length - 1], fd.a)) pts = [...pts].reverse();
      for (let i = 1; i < pts.length; i++) {
        const a = this.w2s(pts[i - 1]);
        const b = this.w2s(pts[i]);
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        if (L < 40) continue;
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(m.x + Math.cos(ang) * 6, m.y + Math.sin(ang) * 6);
        ctx.lineTo(m.x + Math.cos(ang + 2.5) * 6, m.y + Math.sin(ang + 2.5) * 6);
        ctx.lineTo(m.x + Math.cos(ang - 2.5) * 6, m.y + Math.sin(ang - 2.5) * 6);
        ctx.fill();
      }
    }
    if (this.toggles.tags && pr && this.scale > 28) {
      // label on the longest segment
      let best = 1;
      let bl = 0;
      for (let i = 1; i < p.points.length; i++) {
        const l = dist(p.points[i - 1], p.points[i]);
        if (l > bl) {
          bl = l;
          best = i;
        }
      }
      if (bl * this.scale > 60) {
        const m = this.w2s({ x: (p.points[best - 1].x + p.points[best].x) / 2, y: (p.points[best - 1].y + p.points[best].y) / 2 });
        this.label(ctx, `${pr.material} Ø${pr.dn} · ${Math.round(pr.flowLh)} l/h · ${pr.v.toFixed(2)} m/s`, m.x, m.y - 9, { size: 9.5, color: col, bg: this.col.canvas });
      }
    }
  }

  drawRiser(ctx, r, selected, res) {
    const s = this.w2s(r);
    const pr = res?.pipes?.[r.id];
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(4, 0.05 * this.scale), 0, Math.PI * 2);
    ctx.fillStyle = r.system === 'return' ? this.col.ret : this.col.supply;
    ctx.fill();
    ctx.strokeStyle = selected ? this.col.accent : this.col.text;
    ctx.lineWidth = selected ? 2.5 : 1;
    ctx.stroke();
    if (this.toggles.tags && this.scale > 25) this.label(ctx, `${r.mark || 'CT'}${pr ? ` Ø${pr.dn}` : ''}`, s.x + 8, s.y - 10, { size: 9.5, align: 'left' });
  }

  equipRect(ctx, e, x0, x1, y0, y1, fill, stroke, lw = 1.2) {
    const pts = [localToPlan(e, x0, y0), localToPlan(e, x1, y0), localToPlan(e, x1, y1), localToPlan(e, x0, y1)];
    this.poly(ctx, pts);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  drawRadiator(ctx, e, res, hl) {
    const L = e.length ?? res?.radiators?.[e.id]?.product?.length ?? 1;
    const rr = res?.radiators?.[e.id];
    const kind = rr?.product?.kind ?? e.prefKind ?? 'panel';
    const stroke = hl ? this.col.accent : this.col.text;
    if (kind === 'convector') {
      // in-floor trench convector: frame + green linear grille (like the drawings)
      const D = rr?.product?.depth ?? 0.3;
      const y0 = -0.05;
      const y1 = y0 + D;
      this.equipRect(ctx, e, -L / 2, L / 2, y0, y1, '#e6f4e6', stroke, hl ? 2.5 : 1.2);
      ctx.beginPath();
      const n = Math.max(6, Math.round(L / 0.04));
      for (let i = 1; i < n; i++) {
        const a = this.w2s(localToPlan(e, -L / 2 + (i * L) / n, y0 + 0.03));
        const b = this.w2s(localToPlan(e, -L / 2 + (i * L) / n, y1 - 0.03));
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.strokeStyle = '#2e9a3e';
      ctx.lineWidth = Math.max(0.6, 0.01 * this.scale);
      ctx.stroke();
      if (this.toggles.tags && this.scale > 16 && rr?.product) this.equipmentTag(ctx, e, rr, D);
      return;
    }
    if (kind === 'towel') {
      this.equipRect(ctx, e, -L / 2, L / 2, -0.03, 0.03, this.col.panel, stroke, hl ? 2.5 : 1.2);
      for (const x of [-L / 2 + 0.03, L / 2 - 0.03]) {
        const c = this.w2s(localToPlan(e, x, 0));
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(2, 0.02 * this.scale), 0, Math.PI * 2);
        ctx.stroke();
      }
      if (this.toggles.tags && this.scale > 16) {
        const t0 = this.w2s(localToPlan(e, 0, 0.35));
        this.label(ctx, `Sushilka${rr ? ` ${Math.round(rr.output)} W` : ''}`, t0.x, t0.y, { size: 10, bg: this.col.panel });
      }
      return;
    }
    this.equipRect(ctx, e, -L / 2, L / 2, -0.05, 0.05, this.col.panel, stroke, hl ? 2.5 : 1.4);
    // fins
    ctx.beginPath();
    const n = Math.max(3, Math.round(L / 0.1));
    for (let i = 1; i < n; i++) {
      const a = this.w2s(localToPlan(e, -L / 2 + (i * L) / n, -0.05));
      const b = this.w2s(localToPlan(e, -L / 2 + (i * L) / n, 0.05));
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.lineWidth = 0.6;
    ctx.stroke();
    if (this.toggles.tags && this.scale > 22) {
      const t0 = this.w2s(localToPlan(e, 0, 0.22));
      const txt = rr?.product ? `${e.mark} · ${rr.product.model.replace('Panel ', '')} · ${Math.round(rr.output)} W` : `${e.mark} · —`;
      this.label(ctx, txt, t0.x, t0.y, { size: 10, bg: this.col.panel, color: rr?.product ? this.col.text : this.col.err });
    }
  }

  /** Two-row table tag like the drawings: | Konvektor ventilyatorsiz | / | 300 | 120 | 1600 | 714 W */
  equipmentTag(ctx, e, rr, D) {
    const p = rr.product;
    const head = p.fan ? 'Konvektor ventilyatorli' : 'Konvektor ventilyatorsiz';
    const cells = p.fan ? [`H${Math.round(p.height * 1000)}`, `${Math.round(p.length * 1000)}`, `${p.noiseDb ?? ''}dB`] : [`${Math.round(p.width * 1000)}`, `${Math.round(p.height * 1000)}`, `${Math.round(p.length * 1000)}`];
    const c = this.w2s(localToPlan(e, 0, D + 0.25));
    const size = 9.5;
    ctx.font = `${size}px system-ui`;
    const cw = Math.max(26, ...cells.map((t) => ctx.measureText(t).width + 8));
    const w = Math.max(ctx.measureText(head).width + 10, cw * 3);
    const h = size + 5;
    const out = `${Math.round(rr.output)} W`;
    ctx.font = `600 ${size}px system-ui`;
    const ow = ctx.measureText(out).width + 8;
    let x = c.x - (w + ow) / 2;
    let y = c.y - h;
    // simple collision avoidance with other labels
    for (let k = 0; k < 6; k++) {
      const r = { x, y, w: w + ow, h: 2 * h };
      if (!this.labels.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y)) break;
      y += 2 * h + 2;
    }
    this.labels.push({ x, y, w: w + ow, h: 2 * h });
    ctx.fillStyle = this.col.panel;
    ctx.fillRect(x, y, w, 2 * h);
    ctx.strokeStyle = this.col.text;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x, y, w, 2 * h);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    for (let i = 1; i < 3; i++) {
      ctx.moveTo(x + (w * i) / 3, y + h);
      ctx.lineTo(x + (w * i) / 3, y + 2 * h);
    }
    ctx.stroke();
    ctx.fillStyle = this.col.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${size}px system-ui`;
    ctx.fillText(head, x + w / 2, y + h / 2);
    cells.forEach((t, i) => ctx.fillText(t, x + (w * (i + 0.5)) / 3, y + 1.5 * h));
    ctx.font = `600 ${size}px system-ui`;
    ctx.textAlign = 'left';
    ctx.fillText(out, x + w + 4, y + h);
    // leader to the convector
    const a = this.w2s(localToPlan(e, 0, D - 0.05));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(x + w / 2, y + 2 * h);
    ctx.strokeStyle = this.col.muted;
    ctx.stroke();
  }

  drawCollector(ctx, e, hl) {
    const n = Math.max(e.outlets ?? 4, this.ufhPorts?.[e.id] ?? 0);
    const ufh = e.kind === 'ufh';
    const { x0, x1 } = collectorBodyX(n);
    this.equipRect(ctx, e, x0, x1, -0.03, 0.03, ufh ? '#fbe3c4' : '#fde2e0', hl ? this.col.accent : this.col.supply, hl ? 2.5 : 1.2);
    this.equipRect(ctx, e, x0, x1, COLLECTOR_RETURN_Y - 0.03, COLLECTOR_RETURN_Y + 0.03, ufh ? '#dbe7fb' : '#dde7fb', hl ? this.col.accent : this.col.ret, hl ? 2.5 : 1.2);
    // outlet stubs every 50 mm
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      for (const [y0, y1, c] of [[-0.03, -0.07, this.col.supply], [COLLECTOR_RETURN_Y + 0.03, COLLECTOR_RETURN_Y + 0.07, this.col.ret]]) {
        const a = this.w2s(localToPlan(e, collectorPortLocal(i), y0));
        const b = this.w2s(localToPlan(e, collectorPortLocal(i), y1));
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    if (this.toggles.tags && this.scale > 18) {
      const t0 = this.w2s(localToPlan(e, (x0 + x1) / 2, -0.2));
      this.label(ctx, `${e.mark} ${ufh ? 'TP ' : ''}kollektor ×${n}`, t0.x, t0.y, { size: 10, bold: true, bg: this.col.panel });
    }
  }

  drawBoiler(ctx, e, hl, res) {
    this.equipRect(ctx, e, -0.225, 0.225, -0.12, 0.25, this.col.panel, hl ? this.col.accent : this.col.text, hl ? 2.5 : 1.6);
    const c = this.w2s(localToPlan(e, 0, 0.06));
    ctx.fillStyle = this.col.supply;
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(3, 0.07 * this.scale), 0, Math.PI * 2);
    ctx.fill();
    if (this.toggles.tags && this.scale > 15) {
      const t0 = this.w2s(localToPlan(e, 0, -0.35));
      const b = res?.boiler?.product;
      this.label(ctx, `${e.mark} ${b ? b.model : 'Qozon'}`, t0.x, t0.y, { size: 10, bold: true, bg: this.col.panel });
    }
  }

  drawPump(ctx, e, hl) {
    const s = this.w2s(e);
    const r = Math.max(6, 0.12 * this.scale);
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = this.col.panel;
    ctx.fill();
    ctx.strokeStyle = hl ? this.col.accent : this.col.text;
    ctx.lineWidth = hl ? 2.5 : 1.4;
    ctx.stroke();
    const a = ((e.angle ?? 0) * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
    ctx.lineTo(s.x + Math.cos(a + 2.2) * r * 0.8, s.y + Math.sin(a + 2.2) * r * 0.8);
    ctx.lineTo(s.x + Math.cos(a - 2.2) * r * 0.8, s.y + Math.sin(a - 2.2) * r * 0.8);
    ctx.closePath();
    ctx.stroke();
    if (this.toggles.tags) this.label(ctx, e.mark || 'N', s.x, s.y - r - 8, { size: 10 });
  }

  drawThermostat(ctx, e, hl) {
    const s = this.w2s(e);
    const r = Math.max(5, 0.08 * this.scale);
    ctx.strokeStyle = hl ? this.col.accent : this.col.text;
    ctx.lineWidth = hl ? 2 : 1.2;
    ctx.strokeRect(s.x - r, s.y - r, 2 * r, 2 * r);
    this.label(ctx, 'T', s.x, s.y, { size: 10, bold: true, avoid: false });
    // semantic control links
    if (hl) {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = this.col.accent;
      for (const id of e.controls ?? []) {
        const t = this.store.project.elements[id];
        if (!t || t.x === undefined) continue;
        const q = this.w2s(t);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }

  drawDline(ctx, e, sel) {
    this.poly(ctx, e.points, !!e.closed);
    ctx.strokeStyle = sel ? this.col.accent : e.color ?? this.col.text;
    ctx.lineWidth = sel ? 2 : e.lw ?? 1;
    ctx.stroke();
    if (e.leader && e.points.length >= 2) {
      const a = this.w2s(e.points[0]);
      const b = this.w2s(e.points[1]);
      const ang = Math.atan2(a.y - b.y, a.x - b.x);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x - Math.cos(ang - 0.4) * 10, a.y - Math.sin(ang - 0.4) * 10);
      ctx.lineTo(a.x - Math.cos(ang + 0.4) * 10, a.y - Math.sin(ang + 0.4) * 10);
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      this.label(ctx, e.text ?? '', b.x + 4, b.y - 8, { align: 'left', avoid: false });
    }
  }

  drawHatch(ctx, e, sel) {
    ctx.save();
    this.poly(ctx, e.points, true);
    ctx.clip();
    ctx.strokeStyle = sel ? this.col.accent : this.col.muted;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let k = -this.h; k < this.w + this.h; k += 8) {
      ctx.moveTo(k, 0);
      ctx.lineTo(k + this.h, this.h);
    }
    ctx.stroke();
    ctx.restore();
    this.poly(ctx, e.points, true);
    ctx.strokeStyle = sel ? this.col.accent : this.col.text;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawCircle(ctx, e, sel) {
    const c = this.w2s(e.center);
    ctx.beginPath();
    ctx.arc(c.x, c.y, e.r * this.scale, 0, Math.PI * 2);
    ctx.strokeStyle = sel ? this.col.accent : this.col.text;
    ctx.lineWidth = sel ? 2 : 1;
    ctx.stroke();
  }

  drawText(ctx, e, sel) {
    const s = this.w2s(e);
    const size = Math.max(8, (e.size ?? 0.25) * this.scale);
    this.label(ctx, e.text, s.x, s.y, { size, color: sel ? this.col.accent : this.col.text, align: 'left', avoid: false });
  }

  drawDim(ctx, e, sel) {
    const [a, b] = e.points;
    const d = { x: b.x - a.x, y: b.y - a.y };
    const L = Math.hypot(d.x, d.y) || 1;
    const n = { x: (-d.y / L) * (e.offset ?? 0.4), y: (d.x / L) * (e.offset ?? 0.4) };
    const A = this.w2s({ x: a.x + n.x, y: a.y + n.y });
    const B = this.w2s({ x: b.x + n.x, y: b.y + n.y });
    const a0 = this.w2s(a);
    const b0 = this.w2s(b);
    ctx.strokeStyle = sel ? this.col.accent : this.col.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a0.x, a0.y);
    ctx.lineTo(A.x, A.y);
    ctx.moveTo(b0.x, b0.y);
    ctx.lineTo(B.x, B.y);
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    for (const P of [A, B]) {
      ctx.moveTo(P.x - 4, P.y + 4);
      ctx.lineTo(P.x + 4, P.y - 4);
    }
    ctx.stroke();
    this.label(ctx, (L * 1000).toFixed(0), (A.x + B.x) / 2, (A.y + B.y) / 2 - 8, { size: 10.5, color: sel ? this.col.accent : this.col.text, bg: this.col.canvas, avoid: false });
  }

  drawSectionLine(ctx, e, sel) {
    const a = this.w2s(e.a);
    const b = this.w2s(e.b);
    ctx.strokeStyle = sel ? this.col.accent : this.col.text;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([14, 4, 3, 4]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    this.label(ctx, e.name ?? 'A', a.x, a.y - 12, { bold: true });
    this.label(ctx, e.name ?? 'A', b.x, b.y - 12, { bold: true });
  }

  drawConnectors(ctx, res) {
    const lv = this.store.activeLevelId;
    for (const e of Object.values(this.store.project.elements)) {
      if (e.levelId !== lv || !['radiator', 'collector', 'boiler', 'pump'].includes(e.cat)) continue;
      for (const c of connectorsOf(this.store.project, e, (el) => res?.radiators?.[el.id]?.product)) {
        const s = this.w2s(c.pos);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = c.system === 'supply' ? this.col.supply : this.col.ret;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  drawGrips(ctx) {
    for (const g of this.grips()) {
      const s = this.w2s(g.p);
      ctx.fillStyle = this.col.accent;
      ctx.fillRect(s.x - 4, s.y - 4, 8, 8);
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(s.x - 4, s.y - 4, 8, 8);
    }
  }

  drawPreview(ctx) {
    const sp = this.snapInfo;
    const s = this.ts;
    const T = this.tool;
    if (T === 'select') {
      if (this.drag?.kind === 'move' && this.drag.moved && this.drag.cur) {
        const dx = this.drag.cur.x - this.drag.start.x;
        const dy = this.drag.cur.y - this.drag.start.y;
        ctx.globalAlpha = 0.5;
        for (const e of this.store.selected) {
          const tr = transformElement(e, translateFn(dx, dy));
          this.ghost(ctx, tr);
        }
        ctx.globalAlpha = 1;
      }
      if (this.drag?.kind === 'grip' && this.drag.cur) {
        const g = this.drag.grip;
        const e = this.store.project.elements[g.id];
        const tr = { ...e };
        if (typeof g.key === 'string') tr[g.key] = this.drag.cur;
        else tr.points = e.points.map((q, i) => (i === g.key ? this.drag.cur : q));
        ctx.globalAlpha = 0.5;
        this.ghost(ctx, tr);
        ctx.globalAlpha = 1;
      }
      return;
    }
    if (!sp) return;
    const m = this.w2s(sp.p);
    // snap marker
    ctx.strokeStyle = sp.kind === 'conn' ? '#16a34a' : sp.kind ? '#f59e0b' : this.col.muted;
    ctx.lineWidth = 1.5;
    if (sp.kind === 'end' || sp.kind === 'riser') ctx.strokeRect(m.x - 6, m.y - 6, 12, 12);
    else if (sp.kind === 'mid') {
      ctx.beginPath();
      ctx.moveTo(m.x, m.y - 7);
      ctx.lineTo(m.x + 7, m.y + 5);
      ctx.lineTo(m.x - 7, m.y + 5);
      ctx.closePath();
      ctx.stroke();
    } else if (sp.kind === 'conn' || sp.kind === 'on') {
      ctx.beginPath();
      ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(m.x - 8, m.y);
      ctx.lineTo(m.x + 8, m.y);
      ctx.moveTo(m.x, m.y - 8);
      ctx.lineTo(m.x, m.y + 8);
      ctx.stroke();
    }
    const last = s.pts?.[s.pts.length - 1] ?? s.a ?? s.base ?? s.center ?? null;
    ctx.strokeStyle = T === 'pipe_s' ? this.col.supply : T === 'pipe_r' ? this.col.ret : this.col.accent;
    ctx.lineWidth = T === 'wall' ? Math.max(2, this.opts.wall.thickness * this.scale) : 2;
    ctx.globalAlpha = T === 'wall' ? 0.35 : 0.8;
    if (s.pts?.length) {
      this.poly(ctx, [...s.pts, sp.p], false);
      ctx.stroke();
    } else if (last) {
      const a = this.w2s(last);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(m.x, m.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (last) {
      const L = dist(last, sp.p);
      const ang = (Math.atan2(-(sp.p.y - last.y), sp.p.x - last.x) * 180) / Math.PI;
      this.label(ctx, `${L.toFixed(3)} m  ∠${ang.toFixed(1)}°`, m.x + 14, m.y + 16, { size: 10.5, align: 'left', bg: this.col.panel, avoid: false });
    }
    if (T === 'circle' && s.a) {
      const c = this.w2s(s.a);
      ctx.beginPath();
      ctx.arc(c.x, c.y, dist(s.a, sp.p) * this.scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (T === 'rect' && s.a) {
      const a = this.w2s(s.a);
      ctx.strokeRect(a.x, a.y, m.x - a.x, m.y - a.y);
    }
    if (['collector', 'ufh_collector', 'boiler', 'pump', 'radiator'].includes(T)) {
      ctx.globalAlpha = 0.5;
      const cat = T === 'ufh_collector' ? 'collector' : T;
      const at = cat === 'collector' ? this.collectorOnWall(sp.p) : { x: sp.p.x, y: sp.p.y, angle: this.opts.angle };
      this.ghost(ctx, { cat, x: at.x, y: at.y, angle: at.angle, outlets: T === 'ufh_collector' ? 4 : 6, kind: T === 'ufh_collector' ? 'ufh' : 'radiator', length: 1 });
      ctx.globalAlpha = 1;
    }
  }

  ghost(ctx, e) {
    const saveTags = this.toggles.tags;
    this.toggles.tags = false;
    if (e.cat === 'wall') this.drawWall(ctx, e, true, false);
    else if (e.cat === 'pipe') this.drawPipe(ctx, e, null, true, false, new Map());
    else if (e.cat === 'radiator') this.drawRadiator(ctx, e, null, true);
    else if (e.cat === 'collector') this.drawCollector(ctx, e, true);
    else if (e.cat === 'boiler') this.drawBoiler(ctx, e, true, null);
    else if (e.cat === 'pump') this.drawPump(ctx, e, true);
    else if (e.cat === 'room') this.drawRoom(ctx, e, null, true, false);
    else if (e.cat === 'dline') this.drawDline(ctx, e, true);
    else if (e.cat === 'thermostat') this.drawThermostat(ctx, e, true);
    else if (e.cat === 'text') this.drawText(ctx, e, true);
    this.toggles.tags = saveTags;
  }

  /** Structural grid axes (dash-dot) with bubbles and dimension chains between axes, like the drawings. */
  drawGrids(ctx) {
    const grids = elementsOf(this.store.project, 'gridline');
    if (!grids.length) return;
    const bb = levelBBox(this.store.project, this.store.activeLevelId) ?? { x0: 0, x1: 10, y0: 0, y1: 10 };
    const ext = 1.6;
    const R = 0.3 * this.scale > 9 ? 0.3 : 9 / this.scale;
    ctx.save();
    ctx.strokeStyle = this.col.muted;
    ctx.fillStyle = this.col.text;
    ctx.lineWidth = 0.8;
    const xs = grids.filter((g) => g.axis === 'x').sort((a, b) => a.pos - b.pos);
    const ys = grids.filter((g) => g.axis === 'y').sort((a, b) => a.pos - b.pos);
    const bubble = (p, name) => {
      const c = this.w2s(p);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, R * this.scale, 0, Math.PI * 2);
      ctx.fillStyle = this.col.panel;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = this.col.text;
      ctx.font = `600 ${Math.max(8, R * this.scale)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, c.x, c.y + 0.5);
    };
    for (const g of xs) {
      const a = this.w2s({ x: g.pos, y: bb.y0 - ext });
      const b = this.w2s({ x: g.pos, y: bb.y1 + ext });
      ctx.setLineDash([12, 4, 2, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      bubble({ x: g.pos, y: bb.y1 + ext + R }, g.name);
    }
    for (const g of ys) {
      const a = this.w2s({ x: bb.x0 - ext, y: g.pos });
      const b = this.w2s({ x: bb.x1 + ext, y: g.pos });
      ctx.setLineDash([12, 4, 2, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      bubble({ x: bb.x0 - ext - R, y: g.pos }, g.name);
    }
    ctx.setLineDash([]);
    // dimension chains (mm)
    const chain = (list, horiz) => {
      if (list.length < 2) return;
      const off = horiz ? bb.y1 + 0.9 : bb.x0 - 0.9;
      const off2 = horiz ? bb.y1 + 1.3 : bb.x0 - 1.3;
      const seg = (p0, p1, o) => {
        const A = this.w2s(horiz ? { x: p0, y: o } : { x: o, y: p0 });
        const B = this.w2s(horiz ? { x: p1, y: o } : { x: o, y: p1 });
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        for (const P of [A, B]) {
          ctx.moveTo(P.x - 3, P.y + 3);
          ctx.lineTo(P.x + 3, P.y - 3);
        }
        ctx.stroke();
        const txt = String(Math.round(Math.abs(p1 - p0) * 1000));
        ctx.save();
        ctx.translate((A.x + B.x) / 2, (A.y + B.y) / 2);
        if (!horiz) ctx.rotate(-Math.PI / 2);
        ctx.font = '10px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = this.col.text;
        ctx.fillText(txt, 0, -2);
        ctx.restore();
      };
      for (let i = 1; i < list.length; i++) seg(list[i - 1].pos, list[i].pos, off);
      seg(list[0].pos, list[list.length - 1].pos, off2);
    };
    ctx.strokeStyle = this.col.text;
    chain(xs, true);
    chain(ys, false);
    ctx.restore();
  }

  drawNorth(ctx) {
    const x = this.w - 40;
    const y = this.h - 60;
    const a = ((this.store.project.settings.northAngle ?? 0) * Math.PI) / 180;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = this.col.text;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(7, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-7, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillText('N', -4, -22);
    ctx.restore();
  }

  drawScaleBar(ctx) {
    const steps = [0.5, 1, 2, 5, 10, 20, 50];
    const m = steps.find((s) => s * this.scale >= 60) ?? 50;
    const x = 16;
    const y = this.h - 40;
    ctx.fillStyle = this.col.text;
    ctx.fillRect(x, y, m * this.scale, 3);
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${m} m`, x, y - 5);
    ctx.fillText(`1:${Math.round(1000 / this.scale / 0.26)}`, x + m * this.scale + 8, y + 4);
  }

  visibleLevelName() {
    return levelById(this.store.project, this.store.activeLevelId)?.name ?? '';
  }

  toPNG() {
    return this.canvas.toDataURL('image/png');
  }
}

function stripId(e) {
  const { id, guid, cat, ...rest } = e;
  void id;
  void guid;
  void cat;
  return rest;
}

function arcPoints(a, b, c, n = 24) {
  // circle through 3 points
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return [a, c];
  const ux = ((a.x ** 2 + a.y ** 2) * (b.y - c.y) + (b.x ** 2 + b.y ** 2) * (c.y - a.y) + (c.x ** 2 + c.y ** 2) * (a.y - b.y)) / d;
  const uy = ((a.x ** 2 + a.y ** 2) * (c.x - b.x) + (b.x ** 2 + b.y ** 2) * (a.x - c.x) + (c.x ** 2 + c.y ** 2) * (b.x - a.x)) / d;
  const r = Math.hypot(a.x - ux, a.y - uy);
  let a0 = Math.atan2(a.y - uy, a.x - ux);
  const a1 = Math.atan2(b.y - uy, b.x - ux);
  let a2 = Math.atan2(c.y - uy, c.x - ux);
  const norm = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // choose direction that passes through b
  const ccw = norm(a1 - a0) < norm(a2 - a0);
  if (!ccw) {
    [a0, a2] = [a2, a0];
  }
  const span = norm(a2 - a0);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + (span * i) / n;
    pts.push({ x: r3(ux + r * Math.cos(t)), y: r3(uy + r * Math.sin(t)) });
  }
  return ccw ? pts : pts.reverse();
}

export { t };
