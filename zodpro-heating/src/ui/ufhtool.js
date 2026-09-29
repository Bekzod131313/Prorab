// UFH workflow UI (spec §3–§6, §25–§28, §32, §34, §40):
//   collector → floating menu [SHLANKA OLISH] [AVTO ТЕПЛЫЙ ПОЛ] [PROPERTIES] [CIRCUITS]
//   SHLANKA OLISH   choose a free circuit → draw from its supply outlet (click = bend, Enter /
//                   double-click = finish at the return outlet, Backspace = undo point, Esc = cancel)
//   AVTO ТЕПЛЫЙ ПОЛ choose circuits + parameters → draw the zone polygon → engine (Web Worker, with
//                   progress) → preview with coverage map → APPLY / REGENERATE / AUTO REPAIR / CANCEL
// Everything that changes the model is one Store transaction (one undo step).

import { runUfhEngine } from '../engines/ufh/engine.js';
import * as G from '../engines/ufh/geom.js';
import { UFH_PIPES, SPACINGS, WALL_CLEARANCES, STRATEGIES, OBSTACLE_KINDS, pipeType } from '../engines/ufh/pipes.js';
import { UFH_RULES } from '../engines/ufh/validate.js';
import { collectorCircuits, freeCircuits, zoneJob, applyEngineResult, defaultZoneParams, loopName, MAX_CIRCUITS } from '../core/ufhmodel.js';
import { newElement, elementsOf } from '../core/model.js';
import { pointInPolygon } from '../core/util.js';
import { esc } from './reports.js';

const STEP = { boundary: 'Zona chegarasi', usable_area: 'Clearance va to‘siqlar', routing: 'Quvur yo‘li yaratilmoqda', auto_repair: 'Auto Repair', coverage_map: 'Qamrov tekshirilmoqda', done: 'Tayyor' };
export const STRATEGY_LABEL = { adaptive_spiral: 'Adaptive spiral', spiral: 'Spiral', serpentine: 'Zmeyka (serpentin)', adaptive_serpentine: 'Adaptive zmeyka' };
export const OBSTACLE_LABEL = { stair: 'Zina', column: 'Kolonna', bathtub: 'Vanna', shower: 'Dush', toilet: 'Unitaz', furniture: 'Mebel', kitchen: 'Oshxona mebeli', equipment: 'Uskuna', structure: 'Konstruksiya', unheated: 'Isitilmaydigan joy' };
const mm = (v) => `${Math.round(v * 1000)} mm`;

export class UfhTool {
  constructor(app) {
    this.app = app;
    this.store = app.store;
    this.plan = app.plan;
    this.preview = null; // { zone, result, isNew, params }
    this.jobSeq = 0;
    this.buildDom();
    this.store.on('selection', () => this.updateMenu());
    this.store.on('change', () => this.updateMenu());
  }

  // ======================= DOM =======================
  buildDom() {
    const host = document.getElementById('view-plan');
    this.menu = document.createElement('div');
    this.menu.className = 'ufh-menu';
    this.menu.innerHTML = `
      <button data-a="pipe" title="Kollektor chiqishidan qo‘lda quvur chizish">Shlanka olish</button>
      <button data-a="auto" class="primary" title="Zona chizing — konturlar avtomatik">Avto тёплый пол</button>
      <button data-a="props">Properties</button>
      <button data-a="circuits">Circuits</button>`;
    this.menu.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a;
      const col = this.selectedCollector();
      if (!a || !col) return;
      if (a === 'pipe') this.startManual(col);
      else if (a === 'auto') this.startAuto(col);
      else if (a === 'props') this.app.showRight?.('props');
      else if (a === 'circuits') this.circuitsDialog(col);
    };
    host.appendChild(this.menu);
    this.panel = document.createElement('div');
    this.panel.className = 'ufh-panel';
    host.appendChild(this.panel);
    this.menu.style.display = 'none';
    this.panel.style.display = 'none';
  }

  selectedCollector() {
    const sel = this.store.selected;
    return sel.length === 1 && sel[0].cat === 'collector' ? sel[0] : null;
  }

  /** Floating menu next to the selected manifold (kept in place while panning / zooming). */
  updateMenu() {
    const col = this.selectedCollector();
    if (!col || this.preview || this.app.view !== 'plan' || col.levelId !== this.store.activeLevelId || this.plan.tool !== 'select') {
      this.menu.style.display = 'none';
      return;
    }
    const s = this.plan.w2s({ x: col.x, y: col.y });
    this.menu.style.display = 'flex';
    const w = this.menu.offsetWidth || 360;
    this.menu.style.left = `${Math.max(8, Math.min(this.plan.w - w - 8, s.x - w / 2))}px`;
    this.menu.style.top = `${Math.max(48, Math.min(this.plan.h - 50, s.y - 58))}px`;
  }

  // ======================= circuits =======================
  circuitsDialog(col) {
    const res = this.store.results;
    const cs = collectorCircuits(this.store.project, col, res);
    const rows = cs
      .map((c) => {
        const l = c.loopId ? this.store.project.elements[c.loopId] : null;
        const h = l ? res?.ufhLoops?.[l.id] : null;
        const use = c.use === 'loop' ? `<b>${esc(l.name)}</b>${l.manual ? ' (qo‘lda)' : ''}` : c.use === 'room' ? 'Xona bo‘yicha (avto hisob)' : '<span class="muted">bo‘sh</span>';
        return `<tr data-loop="${c.loopId ?? ''}" style="${c.loopId ? 'cursor:pointer' : ''}"><td>${c.id}</td><td>${use}</td><td>${l ? `${l.length.toFixed(1)} m` : ''}</td><td>${h ? `${h.flowLh.toFixed(0)} l/h` : ''}</td><td>${h ? `${h.dpKpa.toFixed(1)} kPa` : ''}</td><td>${l ? `<span class="pill ${l.status === 'invalid' ? 'error' : 'ok'}">${l.status === 'invalid' ? 'xato' : 'OK'}</span>` : ''}</td></tr>`;
      })
      .join('');
    const m = this.app.modal(`${col.mark || 'Kollektor'} — circuitlar (${cs.filter((c) => c.use).length}/${MAX_CIRCUITS})`, `<table class="tbl"><tr><th>Circuit</th><th>Kontur</th><th>Uzunlik</th><th>Sarf</th><th>Δp</th><th></th></tr>${rows}</table><p class="muted" style="font-size:11px">Har bir circuit: supply (yuqori qator) va return (pastki qator) connector. Bitta circuitga bitta kontur ulanadi.</p>`);
    m.querySelector('table').onclick = (e) => {
      const id = e.target.closest('tr')?.dataset.loop;
      if (id) {
        this.store.select(id);
        m.remove();
      }
    };
  }

  /** Pick one free circuit (buttons). Resolves the circuit or null. */
  pickCircuit(col, title) {
    return new Promise((resolve) => {
      const free = freeCircuits(this.store.project, col, this.store.results);
      if (!free.length) {
        this.app.toast('Kollektorda bo‘sh chiqish yo‘q (12 / 12). Yangi kollektor qo‘ying yoki bo‘ling.', 'error');
        return resolve(null);
      }
      let done = false;
      const m = this.app.modal(title, `<div class="btn-row">${free.map((c) => `<button class="btn" data-c="${c.id}">${c.id}${c.extra ? ' +' : ''}</button>`).join('')}</div><p class="muted" style="font-size:11px">“+” — kollektorga yangi chiqish qo‘shiladi (maks. ${MAX_CIRCUITS}).</p>`, [{ label: 'Bekor', run: () => ((done = true), resolve(null)) }]);
      m.querySelector('.btn-row').onclick = (e) => {
        const id = e.target.closest('button')?.dataset.c;
        if (!id) return;
        done = true;
        resolve(free.find((c) => c.id === id));
        m.remove();
      };
      new MutationObserver(() => !m.isConnected && !done && ((done = true), resolve(null))).observe(document.getElementById('modal-root'), { childList: true });
    });
  }

  // ======================= SHLANKA OLISH (manual pipe) =======================
  async startManual(col) {
    const c = await this.pickCircuit(col, `${col.mark || 'Kollektor'}: qaysi circuit uchun shlanka?`);
    if (!c) return;
    this.app.setTool('ufh_pipe');
    this.plan.ts = { ufh: { col: col.id, circuit: c }, pts: [c.supply] };
    this.app.setHint(`${c.id}: supply chiqishidan boshlandi. Bosish — burilish nuqtasi · Enter / 2×bosish — tugatish (return ${c.id} ga ulanadi) · Backspace — oxirgi nuqta · Esc — bekor`);
    this.plan.draw();
  }

  /** Called by the plan when the manual pipe is finished. */
  finishManual(ts) {
    const info = ts.ufh;
    const col = this.store.project.elements[info.col];
    if (!col) return;
    const pts = ts.pts.slice(1);
    if (!pts.length) return this.app.toast('Kamida bitta nuqta chizing', 'error');
    const c = info.circuit;
    const pt = pipeType(defaultZoneParams(this.store.project).pipeType);
    // bends of a single pipe get the pipe's own minimum radius (true arcs)
    const f = G.fillet([c.supply, ...pts, c.ret], pt.minBend + 0.005);
    const path = f.pts;
    const drop = 2 * (col.connHeight ?? 0.4);
    const length = G.pathLength(path) + drop;
    const maxLoop = Math.min(60, this.store.project.settings.ufhMaxLoopM ?? 60);
    const tooShort = f.radii.find((r) => r.angle > 0.3 && r.r < pt.minBend * (1 - UFH_RULES.bendTol) - 1e-4);
    const errors = (length > maxLoop ? 1 : 0) + (tooShort ? 1 : 0);
    const loop = newElement('ufh_loop', {
      levelId: col.levelId,
      name: loopName(this.store.project, col, c.index),
      zoneId: null,
      collectorId: col.id,
      circuitId: c.id,
      portIndex: c.index,
      path: path.map((p) => ({ x: +p.x.toFixed(5), y: +p.y.toFixed(5) })),
      length: +length.toFixed(2),
      supplyLength: 0,
      returnLength: 0,
      heatingLength: +(length - drop).toFixed(2),
      drop,
      spacing: 0.15,
      pipeType: pt.id,
      manual: true,
      status: errors ? 'invalid' : 'valid',
      errors,
      warnings: 0,
    });
    const update = (c.index + 1 > (col.outlets ?? 0)) ? [{ id: col.id, patch: { outlets: Math.min(MAX_CIRCUITS, c.index + 1) } }] : [];
    this.store.apply({ add: [loop], update }, 'ufh:pipe');
    this.store.select(loop.id);
    if (length > maxLoop) this.app.toast(`${loop.name}: ${length.toFixed(1)} m > ${maxLoop} m — kontur juda uzun`, 'error');
    else if (tooShort) this.app.toast(`${loop.name}: burilish radiusi ${mm(tooShort.r)} < ${mm(pt.minBend)} — nuqtalarni uzoqroq qo‘ying`, 'error');
    else this.app.toast(`${loop.name}: ${length.toFixed(1)} m (${c.id})`);
  }

  // ======================= AVTO ТЁПЛЫЙ ПОЛ =======================
  paramsForm(p, free) {
    const sel = (name, opts, cur, fmt = (x) => x) => `<select class="small-select" name="${name}">${opts.map((o) => `<option value="${o}" ${String(o) === String(cur) ? 'selected' : ''}>${esc(fmt(o))}</option>`).join('')}</select>`;
    return `
      <div class="form-grid" style="display:grid;grid-template-columns:max-content 1fr;gap:6px 10px;align-items:center">
        <label>Quvur oralig‘i (spacing)</label>${sel('spacing', SPACINGS, p.spacing, mm)}
        <label>Devordan masofa</label>${sel('wallClearance', WALL_CLEARANCES, p.wallClearance, mm)}
        <label>To‘siqdan masofa</label>${sel('obstacleClearance', WALL_CLEARANCES, p.obstacleClearance, mm)}
        <label>Quvur turi</label>${sel('pipeType', UFH_PIPES.map((x) => x.id), p.pipeType, (id) => `${pipeType(id).label} (Rmin ${mm(pipeType(id).minBend)})`)}
        <label>Yotqizish usuli</label>${sel('strategy', STRATEGIES, p.strategy, (s) => STRATEGY_LABEL[s])}
        <label>Maks. kontur uzunligi</label><input class="search" style="width:90px" name="maxLoop" type="number" min="10" max="60" step="1" value="${p.maxLoop}"> <span></span>
        <label>Min. qamrov</label><span><input class="search" style="width:70px" name="coverageMin" type="number" min="50" max="100" step="1" value="${Math.round(p.coverageMin * 100)}"> %</span>
        <label>Maks. isitilmagan joy</label><span><input class="search" style="width:70px" name="maxHole" type="number" min="0.05" max="5" step="0.05" value="${p.maxHole}"> m²</span>
      </div>
      ${free ? `<p style="margin:10px 0 4px"><b>Circuitlar</b> <span class="muted">(kerak bo‘lsa dvigatel shulardan oladi; 60 m dan oshsa zona avtomatik bo‘linadi)</span></p><div class="btn-row" id="ufh-circ">${free.map((c) => `<label class="pill ok" style="cursor:pointer"><input type="checkbox" value="${c.id}" checked> ${c.id}${c.extra ? '+' : ''}</label>`).join('')}</div>` : ''}`;
  }

  readForm(root, base) {
    const v = (n) => root.querySelector(`[name="${n}"]`)?.value;
    return {
      ...base,
      spacing: Number(v('spacing')),
      wallClearance: Number(v('wallClearance')),
      obstacleClearance: Number(v('obstacleClearance')),
      pipeType: v('pipeType'),
      strategy: v('strategy'),
      maxLoop: Math.min(60, Math.max(10, Number(v('maxLoop')) || 60)),
      coverageMin: Math.min(1, Math.max(0.5, (Number(v('coverageMin')) || 85) / 100)),
      maxHole: Math.max(0.05, Number(v('maxHole')) || 0.5),
    };
  }

  startAuto(col) {
    const free = freeCircuits(this.store.project, col, this.store.results);
    if (!free.length) return this.app.toast('Kollektorda bo‘sh chiqish yo‘q (12 / 12)', 'error');
    const base = { ...defaultZoneParams(this.store.project), ...(this.lastParams ?? {}) };
    const m = this.app.modal(`${col.mark || 'Kollektor'} — Avto тёплый пол`, this.paramsForm(base, free), [
      { label: 'Bekor' },
      {
        label: 'Zona chizish →',
        primary: true,
        run: (b) => {
          const params = this.readForm(b, base);
          const circuits = [...b.querySelectorAll('#ufh-circ input:checked')].map((x) => x.value);
          if (!circuits.length) return this.app.toast('Kamida bitta circuit tanlang', 'error');
          this.lastParams = params;
          this.app.setTool('ufh_zone');
          this.plan.ts = { ufhZone: { col: col.id, params, circuits }, pts: [] };
          this.app.setHint('Тёплый пол zonasini chizing: bosish — nuqta · birinchi nuqtaga bosish / Enter — yopish · Shift+bosish xona ichida — xona konturini olish · Backspace — oxirgi nuqta · Esc — bekor');
        },
      },
    ]);
    void m;
  }

  /** Called by the plan when the zone polygon is closed. */
  zoneDrawn(ts, points) {
    const info = ts.ufhZone;
    const errs = G.checkRing(points);
    if (errs.length) return this.app.toast(`Zona noto‘g‘ri: ${errs.includes('self_intersection') ? 'o‘zini kesadi' : 'maydon yo‘q'}`, 'error');
    const col = this.store.project.elements[info.col];
    const room = elementsOf(this.store.project, 'room', col.levelId).find((r) => pointInPolygon(G.pointAt(points, 0), r.points) || pointInPolygon(centroid(points), r.points));
    const n = elementsOf(this.store.project, 'ufh_zone').length + 1;
    const zone = newElement('ufh_zone', {
      levelId: this.store.activeLevelId,
      name: `ZONE-${String(n).padStart(2, '0')}`,
      points: points.map((p) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4) })),
      collectorId: col.id,
      roomId: room?.id ?? null,
      circuitIds: info.circuits,
      status: 'draft',
      ...info.params,
    });
    this.run(zone, true, { onlyCircuits: true });
  }

  // ======================= engine run / preview =======================
  run(zone, isNew, extra = {}) {
    let job;
    try {
      job = zoneJob(this.store.project, zone, this.store.results, extra);
    } catch (err) {
      return this.app.toast(err.message, 'error');
    }
    if (!job.collector.ports.length) return this.app.toast('Bo‘sh circuit qolmadi', 'error');
    const id = ++this.jobSeq;
    this.preview = { zone, isNew, result: null, busy: true, step: 'boundary', f: 0, job };
    this.updateMenu();
    this.renderPanel();
    this.plan.draw();
    const done = (result) => {
      if (id !== this.jobSeq) return; // superseded
      this.preview = { zone, isNew, result, busy: false, job };
      this.renderPanel();
      this.plan.draw();
    };
    const progress = (step, f) => {
      if (id !== this.jobSeq || !this.preview) return;
      this.preview.step = step;
      this.preview.f = f;
      this.renderPanel();
    };
    this.runEngine(job, progress).then(done, (err) => {
      if (id !== this.jobSeq) return;
      this.preview = null;
      this.renderPanel();
      this.app.toast(`Dvigatel xatosi: ${err.message}`, 'error');
    });
  }

  runEngine(job, onProgress) {
    return new Promise((resolve, reject) => {
      let w = null;
      try {
        if (!this.worker) this.worker = new Worker(new URL('../workers/ufh.worker.js', import.meta.url), { type: 'module' });
        w = this.worker;
      } catch {
        w = null;
      }
      if (!w) {
        // no module workers (old browser / file://): run in the page, deferred so the UI paints
        setTimeout(() => {
          try {
            resolve(runUfhEngine(job, onProgress));
          } catch (err) {
            reject(err);
          }
        }, 30);
        return;
      }
      const reqId = Math.random().toString(36).slice(2);
      const onMsg = (e) => {
        const d = e.data;
        if (d.id !== reqId) return;
        if (d.type === 'progress') onProgress(d.step, d.f);
        else {
          w.removeEventListener('message', onMsg);
          w.removeEventListener('error', onErr);
          if (d.type === 'result') resolve(d.result);
          else reject(new Error(d.message));
        }
      };
      const onErr = (e) => {
        w.removeEventListener('message', onMsg);
        w.removeEventListener('error', onErr);
        this.worker?.terminate();
        this.worker = null;
        // fall back to the page thread once
        setTimeout(() => {
          try {
            resolve(runUfhEngine(job, onProgress));
          } catch (err) {
            reject(err);
          }
        }, 30);
        e.preventDefault?.();
      };
      w.addEventListener('message', onMsg);
      w.addEventListener('error', onErr);
      w.postMessage({ id: reqId, job });
    });
  }

  renderPanel() {
    const pv = this.preview;
    if (!pv) {
      this.panel.style.display = 'none';
      return;
    }
    this.panel.style.display = 'block';
    const z = pv.zone;
    const col = this.store.project.elements[z.collectorId];
    if (pv.busy) {
      this.panel.innerHTML = `<header>${esc(z.name)} — hisoblanmoqda…</header><div class="ufh-prog"><div style="width:${Math.round((pv.f ?? 0) * 100)}%"></div></div><p class="muted">${esc(STEP[pv.step] ?? pv.step)}…</p><div class="btn-row"><button class="btn small" data-a="cancel">Bekor</button></div>`;
      this.panel.onclick = (e) => e.target.dataset.a === 'cancel' && this.cancel();
      return;
    }
    const r = pv.result;
    const errs = r.issues.filter((i) => i.level === 'error');
    const warns = r.issues.filter((i) => i.level === 'warning');
    const pt = pipeType(r.params?.pipeType ?? z.pipeType);
    const cov = r.coverage;
    const loops = r.loops
      .map((l) => `<tr><td>${esc(loopName(this.store.project, col, l.portIndex))}</td><td>${l.circuitId}</td><td class="${l.length > (r.params?.maxLoop ?? 60) ? 'bad' : ''}">${l.length.toFixed(1)} m</td><td>${l.supplyLength.toFixed(1)} / ${l.heatingLength.toFixed(1)} / ${l.returnLength.toFixed(1)}</td><td>${l.status === 'valid' ? '✓' : '✕'}</td></tr>`)
      .join('');
    const byCode = {};
    for (const e of errs) byCode[e.code] = (byCode[e.code] ?? 0) + 1;
    this.panel.innerHTML = `
      <header>${esc(z.name)} · ${esc(col?.mark ?? '')} · ${esc(STRATEGY_LABEL[r.strategy] ?? r.strategy)}${r.repaired ? ' · <span class="pill warning">auto repair</span>' : ''}</header>
      <div class="ufh-kv">
        <span>Quvur</span><b>${esc(pt.label)} · ${mm(r.params?.spacing ?? z.spacing)}</b>
        <span>Konturlar</span><b>${r.loops.length}</b>
        <span>Qamrov</span><b class="${cov && cov.ratio < (z.coverageMin ?? 0.85) ? 'bad' : 'good'}">${cov ? `${(cov.ratio * 100).toFixed(1)} %` : '—'}${cov ? ` · maks. bo‘sh joy ${cov.largestHole.toFixed(2)} m²` : ''}</b>
        <span>Clearance</span><b>devor ${mm(z.wallClearance)} · to‘siq ${mm(z.obstacleClearance)}</b>
        <span>Egilish</span><b>Rmin ${mm(pt.minBend)} (ruxsat ${mm(r.params?.minBendAllowed ?? pt.minBend)})</b>
        <span>Ulanish</span><b>${errs.some((e) => e.code === 'UFH-TOPO') ? '<span class="bad">xato</span>' : 'supply → kontur → return ✓'}</b>
      </div>
      <table class="tbl compact"><tr><th>Kontur</th><th>Circuit</th><th>Uzunlik</th><th>S / isitish / R</th><th></th></tr>${loops}</table>
      ${errs.length ? `<div class="ufh-errs">${Object.entries(byCode).map(([k, n]) => `<span class="pill error">${k} ×${n}</span>`).join(' ')}<ul>${errs.slice(0, 6).map((e) => `<li>${esc(e.msg)}</li>`).join('')}</ul></div>` : `<p class="good">✓ Barcha qat’iy tekshiruvlar o‘tdi${warns.length ? ` · ${warns.length} ogohlantirish` : ''}</p>`}
      <div class="btn-row">
        <button class="btn small primary" data-a="apply" ${r.ok ? '' : 'disabled title="Xatolar bor — APPLY bloklangan (AUTO REPAIR yoki parametrlarni o‘zgartiring)"'}>APPLY</button>
        <button class="btn small" data-a="regen">REGENERATE</button>
        <button class="btn small" data-a="repair">AUTO REPAIR</button>
        <button class="btn small" data-a="params">Parametrlar</button>
        <button class="btn small" data-a="cancel">CANCEL</button>
      </div>
      <p class="muted" style="font-size:11px;margin:4px 0 0">Xarita: <span style="color:#3aa757">■</span> isitilgan · <span style="color:#e0474c">■</span> isitilmagan · <span style="color:#999">■</span> to‘siq · <span style="color:#d8b400">■</span> clearance · ${r.ms} ms</p>`;
    this.panel.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'apply') this.apply();
      else if (a === 'regen') this.run(pv.zone, pv.isNew, { onlyCircuits: pv.isNew });
      else if (a === 'repair') this.run(pv.zone, pv.isNew, { onlyCircuits: pv.isNew, repair: true });
      else if (a === 'params') this.editParams();
      else if (a === 'cancel') this.cancel();
    };
  }

  editParams() {
    const pv = this.preview;
    if (!pv) return;
    this.app.modal(`${pv.zone.name} — parametrlar`, this.paramsForm(pv.zone, null), [
      { label: 'Bekor' },
      {
        label: 'REGENERATE',
        primary: true,
        run: (b) => {
          const zone = this.readForm(b, pv.zone);
          this.lastParams = { spacing: zone.spacing, wallClearance: zone.wallClearance, obstacleClearance: zone.obstacleClearance, pipeType: zone.pipeType, strategy: zone.strategy, maxLoop: zone.maxLoop, coverageMin: zone.coverageMin, maxHole: zone.maxHole };
          this.run(zone, pv.isNew, { onlyCircuits: pv.isNew });
        },
      },
    ]);
  }

  apply() {
    const pv = this.preview;
    if (!pv?.result?.ok) return this.app.toast('Xatolar bor — APPLY bloklangan', 'error');
    const cs = applyEngineResult(this.store.project, pv.zone, pv.result, pv.isNew);
    this.store.apply(cs, pv.isNew ? 'ufh:zone' : 'ufh:regenerate');
    this.preview = null;
    this.renderPanel();
    this.store.select(pv.zone.id);
    this.app.setTool('select');
    this.app.toast(`${pv.zone.name}: ${pv.result.loops.length} ta kontur qo‘shildi (bitta amal — Ctrl+Z bilan qaytariladi)`);
  }

  cancel() {
    this.jobSeq++;
    this.preview = null;
    this.renderPanel();
    this.plan.draw();
  }

  /** REGENERATE / AUTO REPAIR on an existing zone (from its properties). */
  regenerate(zoneId, repair = false) {
    const z = this.store.project.elements[zoneId];
    if (!z) return;
    this.app.showView('plan');
    this.run(z, false, repair ? { repair: true } : {});
  }

  // ======================= floor obstacles =======================
  startObstacle() {
    const kinds = OBSTACLE_KINDS.map((k) => `<button class="btn" data-k="${k}">${esc(OBSTACLE_LABEL[k])}</button>`).join('');
    const m = this.app.modal('To‘siq (pol) turi', `<div class="btn-row">${kinds}</div><p class="muted" style="font-size:11px">To‘siq atrofida quvur ${mm(defaultZoneParams(this.store.project).obstacleClearance)} masofa saqlaydi (zona sozlamasi).</p>`, [{ label: 'Bekor' }]);
    m.querySelector('.btn-row').onclick = (e) => {
      const k = e.target.closest('button')?.dataset.k;
      if (!k) return;
      m.remove();
      this.app.setTool('floor_obstacle');
      this.plan.ts = { ufhObstacle: { kind: k }, pts: [] };
      this.app.setHint(`${OBSTACLE_LABEL[k]}: poligon chizing · birinchi nuqta / Enter — yopish · Esc — bekor`);
    };
  }

  obstacleDrawn(ts, points) {
    if (G.checkRing(points).length) return this.app.toast('To‘siq poligoni noto‘g‘ri', 'error');
    const el = newElement('floor_obstacle', { levelId: this.store.activeLevelId, kind: ts.ufhObstacle.kind, points: points.map((p) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4) })), clearance: null });
    // zones it touches must be regenerated
    const upd = elementsOf(this.store.project, 'ufh_zone', el.levelId)
      .filter((z) => points.some((p) => pointInPolygon(p, z.points)) || z.points.some((p) => pointInPolygon(p, points)))
      .map((z) => ({ id: z.id, patch: { stale: true } }));
    this.store.apply({ add: [el], update: upd }, 'ufh:obstacle');
    if (upd.length) this.app.toast(`${upd.length} ta zona o‘zgardi — REGENERATE qiling`);
  }
}

function centroid(pts) {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x / pts.length;
    y += p.y / pts.length;
  }
  return { x, y };
}
