// UFH workflow UI (spec §3–§6, §25–§28, §32, §34, §40):
//   collector → floating menu [SHLANKA OLISH] [AVTO ТЕПЛЫЙ ПОЛ] [PROPERTIES] [CIRCUITS]
//   SHLANKA OLISH   choose a free circuit → draw from its supply outlet (click = bend, Enter /
//                   double-click = finish at the return outlet, Backspace = undo point, Esc = cancel)
//   AVTO ТЕПЛЫЙ ПОЛ choose circuits + parameters → draw the zone polygon → engine (Web Worker, with
//                   progress) → preview with coverage map → APPLY / REGENERATE / AUTO REPAIR / CANCEL
// Everything that changes the model is one Store transaction (one undo step).

import { runPhase6Engine as runUfhEngine } from '../engines/ufh/apartment.js';
import * as G from '../engines/ufh/geom.js';
import { UFH_PIPES, SPACINGS, WALL_CLEARANCES, STRATEGIES, OBSTACLE_KINDS, pipeType } from '../engines/ufh/pipes.js';
import { UFH_RULES } from '../engines/ufh/validate.js';
import { collectorCircuits, freeCircuits, zoneJob, applyEngineResult, defaultZoneParams, loopName, MAX_CIRCUITS, splitZoneForCollectors } from '../core/ufhmodel.js';
import { newElement, elementsOf } from '../core/model.js';
import { pointInPolygon } from '../core/util.js';
import { esc } from './reports.js';

const STEP = { boundary: 'Zona chegarasi', usable_area: 'Clearance va to‘siqlar', routing: 'Quvur yo‘li yaratilmoqda', auto_repair: 'Auto Repair', coverage_map: 'Qamrov tekshirilmoqda', done: 'Tayyor' };
export const STRATEGY_LABEL = { phase6_spiral: 'Spiral (Phase 6 yadro)', adaptive_spiral: 'Adaptive spiral', spiral: 'Spiral', serpentine: 'Zmeyka (serpentin)', adaptive_serpentine: 'Adaptive zmeyka' };
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
      const siblings = elementsOf(this.store.project, 'ufh_zone', zone.levelId).filter((z) => z.collectorId === zone.collectorId && z.id !== zone.id);
      job = zoneJob(this.store.project, zone, this.store.results, { ...extra, siblings });
      this.siblings = siblings;
    } catch (err) {
      return this.app.toast(err.message, 'error');
    }
    if (!job.collector.ports.length) return this.app.toast('Bo‘sh circuit qolmadi', 'error');
    const id = ++this.jobSeq;
    const siblings = this.siblings ?? [];
    this.preview = { zone, isNew, siblings, result: null, busy: true, step: 'boundary', f: 0, job };
    this.updateMenu();
    this.renderPanel();
    this.plan.draw();
    const done = (result) => {
      if (id !== this.jobSeq) return; // superseded
      this.preview = { zone, isNew, siblings, result, busy: false, job };
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
    const z = pv.zone ?? pv.items[0].zone;
    const col = this.store.project.elements[z.collectorId];
    if (pv.busy) {
      this.panel.innerHTML = `<header>${esc(z.name)} — hisoblanmoqda…</header><div class="ufh-prog"><div style="width:${Math.round((pv.f ?? 0) * 100)}%"></div></div><p class="muted">${esc(STEP[pv.step] ?? pv.step)}…</p><div class="btn-row"><button class="btn small" data-a="cancel">Bekor</button></div>`;
      this.panel.onclick = (e) => e.target.dataset.a === 'cancel' && this.cancel();
      return;
    }
    if (pv.items) return this.renderMulti();
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
        <button class="btn small primary" data-a="apply" ${r.loops.length ? '' : 'disabled'} ${r.ok ? '' : 'title="Xatolar bor — tasdiqlash so‘raladi"'}>APPLY${r.ok ? '' : ' (xatolar bilan)'}</button>
        <button class="btn small" data-a="regen">REGENERATE</button>
        <button class="btn small" data-a="repair">AUTO REPAIR</button>
        <button class="btn small" data-a="params">Parametrlar</button>
        <button class="btn small" data-a="cancel">CANCEL</button>
      </div>
      ${r.needCircuits ? `<div class="btn-row"><button class="btn small primary" data-a="split">Kollektorlarga bo‘lish (+${Math.ceil(((r.needCircuits - r.freeCircuits) * 1.08) / MAX_CIRCUITS)} kollektor)</button></div>` : ''}
      <p class="muted" style="font-size:11px;margin:4px 0 0">Xarita: <span style="color:#3aa757">■</span> isitilgan · <span style="color:#e0474c">■</span> isitilmagan · <span style="color:#999">■</span> to‘siq · <span style="color:#d8b400">■</span> clearance · ${r.ms} ms</p>`;
    this.panel.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'apply') this.apply();
      else if (a === 'regen') this.run(pv.zone, pv.isNew, { onlyCircuits: pv.isNew });
      else if (a === 'repair') this.run(pv.zone, pv.isNew, { onlyCircuits: pv.isNew, repair: true });
      else if (a === 'params') this.editParams();
      else if (a === 'split') this.splitRun();
      else if (a === 'cancel') this.cancel();
    };
  }

  // ======================= one zone → several manifolds (> 12 loops) =======================
  /** Cut the zone by manifold capacity, add the manifolds it needs and route every part. */
  async splitRun(repair = false) {
    const pv = this.preview;
    const base = pv.items ? pv.items[0].zone : pv.zone;
    const need = pv.items ? pv.need : pv.result.needCircuits;
    const free = pv.items ? pv.free : pv.result.freeCircuits;
    const col = this.store.project.elements[base.collectorId];
    const clip = (pts, alongX, lo, hi) => {
      const slab = alongX ? [{ x: lo, y: -1e4 }, { x: hi, y: -1e4 }, { x: hi, y: 1e4 }, { x: lo, y: 1e4 }] : [{ x: -1e4, y: lo }, { x: 1e4, y: lo }, { x: 1e4, y: hi }, { x: -1e4, y: hi }];
      const r = G.intersection(G.sanitize(pts), [{ outer: slab, holes: [] }]);
      const big = r.reduce((a, b) => (!a || G.area([b]) > G.area([a]) ? b : a), null);
      return { area: G.area(r), ring: big?.outer ?? null };
    };
    const parts = splitZoneForCollectors(base, col, need, free, clip);
    const newCols = parts.filter((q) => q.isNewCol).map((q) => q.col);
    // a project view that already knows the new manifolds (names, outlets) — nothing is stored yet
    const proj = { ...this.store.project, elements: { ...this.store.project.elements } };
    for (const c of newCols) proj.elements[c.id] = c;
    const id = ++this.jobSeq;
    const items = parts.map((q, i) => ({
      zone: { ...base, ...(i ? { id: newElement('ufh_zone', {}).id, guid: newElement('ufh_zone', {}).guid, name: `${base.name}-${String.fromCharCode(65 + i)}` } : { name: `${base.name}-A` }), points: q.points.map((p) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4) })), collectorId: q.col.id, circuitIds: [] },
      col: q.col,
      isNew: i ? true : pv.isNew,
      result: null,
    }));
    this.preview = { items, newCols, proj, busy: true, step: 'routing', f: 0, need, free };
    this.renderPanel();
    this.plan.draw();
    for (let i = 0; i < items.length; i++) {
      if (id !== this.jobSeq) return;
      const it = items[i];
      const job = zoneJob(proj, it.zone, this.store.results, { col: it.col, repair });
      it.result = await this.runEngine(job, (step, f) => {
        if (id !== this.jobSeq || !this.preview) return;
        this.preview.step = `${it.zone.name}: ${STEP[step] ?? step}`;
        this.preview.f = (i + f) / items.length;
        this.renderPanel();
      }).catch((err) => ({ ok: false, loops: [], issues: [{ level: 'error', code: 'UFH-ENGINE', msg: err.message }], coverage: null }));
    }
    if (id !== this.jobSeq) return;
    this.preview.busy = false;
    this.renderPanel();
    this.plan.draw();
  }

  renderMulti() {
    const pv = this.preview;
    const ok = pv.items.every((it) => it.result?.ok);
    const rows = pv.items
      .map((it) => {
        const r = it.result;
        const errs = r.issues.filter((x) => x.level === 'error');
        const L = r.loops.map((l) => l.length);
        return `<tr><td>${esc(it.zone.name)}</td><td>${it.col.mark || (pv.newCols.includes(it.col) ? 'yangi' : '')}</td><td>${r.loops.length}</td><td>${L.length ? `${Math.min(...L).toFixed(0)}–${Math.max(...L).toFixed(0)} m` : '—'}</td><td>${r.coverage ? `${(r.coverage.ratio * 100).toFixed(1)} %` : '—'}</td><td>${r.ok ? '✓' : `<span class="bad">${errs.length} xato</span>`}</td></tr>`;
      })
      .join('');
    const errs = pv.items.flatMap((it) => it.result.issues.filter((x) => x.level === 'error').map((e) => `${it.zone.name}: ${e.msg}`));
    this.panel.innerHTML = `
      <header>Zona ${pv.items.length} qismga bo‘lindi · ${pv.newCols.length} ta yangi kollektor</header>
      <p class="muted" style="margin:0 0 6px">Kerak ≈ ${pv.need} kontur; har kollektorda ≤ ${MAX_CIRCUITS}. Yangi kollektorlar o‘z qismining devorida, chiqishlari xonaga qaragan.</p>
      <table class="tbl compact"><tr><th>Qism</th><th>Kollektor</th><th>Kontur</th><th>Uzunlik</th><th>Qamrov</th><th></th></tr>${rows}</table>
      ${errs.length ? `<ul class="bad" style="margin:4px 0 4px 16px">${errs.slice(0, 6).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '<p class="good">✓ Barcha qismlar qat’iy tekshiruvlardan o‘tdi</p>'}
      <div class="btn-row">
        <button class="btn small primary" data-a="apply" ${ok ? '' : 'disabled'}>APPLY</button>
        <button class="btn small" data-a="repair">AUTO REPAIR</button>
        <button class="btn small" data-a="cancel">CANCEL</button>
      </div>`;
    this.panel.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'apply') this.applyMulti();
      else if (a === 'repair') this.splitRun(true);
      else if (a === 'cancel') this.cancel();
    };
  }

  applyMulti() {
    const pv = this.preview;
    if (!pv.items.every((it) => it.result?.ok)) return this.app.toast('Xatolar bor — APPLY bloklangan', 'error');
    const cs = { add: [...pv.newCols], update: [], remove: [] };
    const proj = { ...pv.proj, elements: { ...pv.proj.elements } };
    for (const it of pv.items) {
      const part = applyEngineResult(proj, it.zone, it.result, it.isNew);
      cs.add.push(...part.add);
      cs.remove.push(...part.remove);
      for (const u of part.update) {
        if (u.id === it.zone.id) u.patch.points = it.zone.points;
        if (u.id === it.zone.id) u.patch.name = it.zone.name;
        const nc = cs.add.find((x) => x.id === u.id);
        if (nc) Object.assign(nc, u.patch);
        else cs.update.push(u);
      }
      // loops of this part now exist for the naming / outlet bookkeeping of the next part
      for (const l of part.add) proj.elements[l.id] = l;
    }
    this.store.apply(cs, 'ufh:zone-split');
    this.preview = null;
    this.renderPanel();
    this.app.setTool('select');
    this.app.toast(`${pv.items.length} ta zona, ${pv.newCols.length} ta yangi kollektor, ${pv.items.reduce((a, it) => a + it.result.loops.length, 0)} ta kontur (bitta amal)`);
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

  async apply() {
    const pv = this.preview;
    if (!pv?.result?.loops?.length) return this.app.toast('Kontur yo‘q — APPLY qilinmaydi', 'error');
    // errors are applied only on the user's explicit confirmation; the invalid loops stay marked
    if (!pv.result.ok && !(await this.app.confirmBox(`Natijada ${pv.result.issues.filter((i) => i.level === 'error').length} ta xato bor (xato konturlar qizil ✕ bilan belgilanadi). Baribir qo‘llaymi?`))) return;
    // every zone of the manifold planned together: each gets the loops of its own rooms
    const zones = [pv.zone, ...(pv.siblings ?? [])];
    const cs = { add: [], update: [], remove: [] };
    for (const z of zones) {
      const part = zones.length > 1 ? { ...pv.result, loops: pv.result.loops.filter((l) => (l.zoneId ?? pv.zone.id) === z.id) } : pv.result;
      const c = applyEngineResult(this.store.project, z, part, z === pv.zone && pv.isNew);
      cs.add.push(...c.add);
      cs.update.push(...c.update);
      cs.remove.push(...c.remove);
    }
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
