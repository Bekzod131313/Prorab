// Application layer: project state, transactions (undo/redo), selection, events,
// recalculation scheduling (background worker with synchronous fallback) and autosave.

import { deepClone } from './util.js';
import { autoMark, repairReferences } from './model.js';
import { runCalculation } from '../engines/calc.js';
import { syncRadiatorGeometry } from './autodesign.js';
import { serializeProject } from './io.js';

const AUTOSAVE_KEY = 'zodpro.autosave.v1';
const AUTOSAVE_BACKUPS = 'zodpro.autosave.backups.v1';

export class Store {
  constructor(project) {
    this.listeners = new Map();
    this.undoStack = [];
    this.redoStack = [];
    this.selection = new Set();
    this.activeLevelId = null;
    this.results = null;
    this.dirty = false;
    this.commandLog = [];
    this.setProject(project);
  }

  on(evt, fn) {
    if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
    this.listeners.get(evt).add(fn);
    return () => this.listeners.get(evt).delete(fn);
  }

  emit(evt, payload) {
    for (const fn of this.listeners.get(evt) ?? []) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[store] listener for ${evt} failed`, err);
      }
    }
  }

  setProject(project) {
    repairReferences(project);
    this.project = project;
    this.undoStack = [];
    this.redoStack = [];
    this.selection.clear();
    this.activeLevelId = project.levels[0]?.id ?? null;
    this.recalc(true);
    this.emit('project', project);
    this.emit('selection', this.selection);
  }

  get level() {
    return this.project.levels.find((l) => l.id === this.activeLevelId) ?? this.project.levels[0];
  }

  setLevel(id) {
    this.activeLevelId = id;
    this.emit('level', id);
    this.emit('view');
  }

  // ---------- selection ----------
  select(ids, additive = false) {
    if (!additive) this.selection.clear();
    for (const id of [].concat(ids)) if (id && this.project.elements[id]) this.selection.add(id);
    this.emit('selection', this.selection);
  }

  toggleSelect(id) {
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
    this.emit('selection', this.selection);
  }

  clearSelection() {
    this.selection.clear();
    this.emit('selection', this.selection);
  }

  get selected() {
    return [...this.selection].map((id) => this.project.elements[id]).filter(Boolean);
  }

  // ---------- transactions ----------
  /**
   * Apply a change-set as one undoable transaction.
   * cs = { add: [el], update: [{id, patch}], remove: [id], settings?: patch, meta?: patch, levels?: [...] }
   */
  apply(cs, label = 'edit') {
    const p = this.project;
    const before = { elements: {}, settings: null, meta: null, levels: null, library: undefined };
    const touch = (id) => {
      if (!(id in before.elements)) before.elements[id] = p.elements[id] ? deepClone(p.elements[id]) : null;
    };
    for (const e of cs.add ?? []) touch(e.id);
    for (const u of cs.update ?? []) touch(u.id);
    for (const id of cs.remove ?? []) touch(id);
    if (cs.settings) before.settings = deepClone(p.settings);
    if (cs.meta) before.meta = deepClone(p.meta);
    if (cs.levels) before.levels = deepClone(p.levels);
    if (cs.library) before.library = deepClone(p.library ?? null);

    for (const e of cs.add ?? []) p.elements[e.id] = deepClone(e);
    for (const u of cs.update ?? []) if (p.elements[u.id]) Object.assign(p.elements[u.id], deepClone(u.patch));
    for (const id of cs.remove ?? []) delete p.elements[id];
    if (cs.settings) deepMerge(p.settings, cs.settings);
    if (cs.meta) Object.assign(p.meta, cs.meta);
    if (cs.levels) p.levels = deepClone(cs.levels);
    if (cs.library) p.library = deepClone(cs.library);

    // cascade deletes: openings hosted by removed walls, dangling refs
    for (const id of cs.remove ?? []) {
      for (const e of Object.values(p.elements)) {
        if ((e.cat === 'window' || e.cat === 'door') && e.wallId === id) {
          touch(e.id);
          delete p.elements[e.id];
        }
        // a UFH loop goes with its zone or its manifold
        if (e.cat === 'ufh_loop' && (e.zoneId === id || e.collectorId === id)) {
          touch(e.id);
          delete p.elements[e.id];
        }
      }
    }
    const afterRepair = Object.values(p.elements).filter((e) => (e.cat === 'radiator' && e.roomId && !p.elements[e.roomId]) || (e.cat === 'room' && e.ufh?.collectorId && !p.elements[e.ufh.collectorId]));
    for (const e of afterRepair) touch(e.id);
    repairReferences(p);

    const after = { elements: {}, settings: cs.settings ? deepClone(p.settings) : null, meta: cs.meta ? deepClone(p.meta) : null, levels: cs.levels ? deepClone(p.levels) : null, library: cs.library ? deepClone(p.library) : undefined };
    for (const id of Object.keys(before.elements)) after.elements[id] = p.elements[id] ? deepClone(p.elements[id]) : null;

    this.undoStack.push({ label, before, after, time: new Date().toISOString() });
    if (this.undoStack.length > 300) this.undoStack.shift();
    this.redoStack = [];
    this.commandLog.push({ label, time: new Date().toISOString(), n: Object.keys(before.elements).length });
    for (const id of cs.remove ?? []) this.selection.delete(id);
    this.changed(label);
  }

  restore(state) {
    const p = this.project;
    for (const [id, el] of Object.entries(state.elements)) {
      if (el) p.elements[id] = deepClone(el);
      else delete p.elements[id];
    }
    if (state.settings) p.settings = deepClone(state.settings);
    if (state.meta) p.meta = deepClone(state.meta);
    if (state.levels) p.levels = deepClone(state.levels);
    if (state.library !== undefined) p.library = deepClone(state.library);
    for (const id of [...this.selection]) if (!p.elements[id]) this.selection.delete(id);
  }

  undo() {
    const t = this.undoStack.pop();
    if (!t) return false;
    this.restore(t.before);
    this.redoStack.push(t);
    this.changed(`undo:${t.label}`);
    return true;
  }

  redo() {
    const t = this.redoStack.pop();
    if (!t) return false;
    this.restore(t.after);
    this.undoStack.push(t);
    this.changed(`redo:${t.label}`);
    return true;
  }

  changed(label) {
    this.dirty = true;
    this.project.history.push({ label, time: new Date().toISOString() });
    if (this.project.history.length > 500) this.project.history.splice(0, this.project.history.length - 500);
    this.recalc();
    this.emit('change', label);
    this.emit('selection', this.selection);
  }

  // ---------- calculation ----------
  /** Run a pending (debounced) recalculation now, so commands never act on stale results. */
  flush() {
    if (this._calcTimer) this.recalc(true);
  }

  recalc(immediate = false) {
    clearTimeout(this._calcTimer);
    this._calcTimer = null;
    const run = () => {
      try {
        let res = runCalculation(this.project);
        // parametric follow-up: radiator lengths / attached pipes (not a separate undo step)
        const sync = syncRadiatorGeometry(this.project, res);
        if (sync.update.length) {
          const last = this.undoStack[this.undoStack.length - 1];
          for (const u of sync.update) {
            if (last && !(u.id in last.before.elements)) last.before.elements[u.id] = deepClone(this.project.elements[u.id]);
            Object.assign(this.project.elements[u.id], deepClone(u.patch));
            if (last) last.after.elements[u.id] = deepClone(this.project.elements[u.id]);
          }
          res = runCalculation(this.project);
        }
        const marks = autoMark(this.project);
        for (const [id, m] of Object.entries(marks)) this.project.elements[id].mark = m;
        this.results = res;
        this.calcError = null;
      } catch (err) {
        console.error('[calc] failed', err);
        this.calcError = { message: String(err?.message ?? err), stack: String(err?.stack ?? ''), time: new Date().toISOString() };
        logError(this, 'calc', err);
      }
      this.emit('results', this.results);
    };
    if (immediate) run();
    else
      this._calcTimer = setTimeout(() => {
        this._calcTimer = null;
        run();
      }, 30);
  }

  // ---------- autosave / recovery ----------
  autosave() {
    if (!this.dirty) return;
    try {
      const data = serializeProject(this.project);
      localStorage.setItem(AUTOSAVE_KEY, data);
      const backups = JSON.parse(localStorage.getItem(AUTOSAVE_BACKUPS) ?? '[]');
      backups.unshift({ time: new Date().toISOString(), name: this.project.meta.name, size: data.length });
      localStorage.setItem(AUTOSAVE_BACKUPS, JSON.stringify(backups.slice(0, 5)));
      this.emit('autosaved', new Date());
    } catch (err) {
      console.warn('[autosave] failed', err);
    }
  }

  static recoverable() {
    try {
      const d = localStorage.getItem(AUTOSAVE_KEY);
      return d ? { data: d, backups: JSON.parse(localStorage.getItem(AUTOSAVE_BACKUPS) ?? '[]') } : null;
    } catch {
      return null;
    }
  }

  static clearRecovery() {
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      /* storage unavailable */
    }
  }
}

function deepMerge(t, s) {
  for (const [k, v] of Object.entries(s)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object') deepMerge(t[k], v);
    else t[k] = deepClone(v);
  }
}

export const ERROR_LOG = [];
export function logError(store, calculation, err, elementId = null) {
  ERROR_LOG.push({
    id: `ERR-${ERROR_LOG.length + 1}`,
    version: '0.1.0',
    project: store?.project?.meta?.number,
    element: elementId,
    calculation,
    message: String(err?.message ?? err),
    stack: String(err?.stack ?? ''),
    timestamp: new Date().toISOString(),
  });
}
