// ZODPRO Heating BIM — application shell (UI layer). Wires the ribbon, panels, views,
// command line, shortcuts, files, autosave/recovery and integrations to the Store.
import { Store, ERROR_LOG, logError } from '../core/store.js';
import { createEmptyProject, elementsOf, sortedLevels, newElement, levelById } from '../core/model.js';
import { createDemoProject } from '../core/demo.js';
import { autoPlaceRadiators, autoRoute, autoPlaceCollector } from '../core/autodesign.js';
import { serializeProject, parseProject, exportDXF, exportIFC, exportSVG, parseDXF, dxfSegmentsToWalls, download, toExcelXml } from '../core/io.js';
import { t, setLang, getLang, LANG_NAMES, msg } from '../core/i18n.js';
import { interpret } from '../core/assistant.js';
import { PluginHost, sendTelegram, can, ROLES } from '../core/integrations.js';
import { PlanView } from './plan2d.js';
import { View3D } from './view3d.js';
import { renderBrowser, renderProperties } from './panels.js';
import { reportsHTML, dashboardHTML, scheduleDefs, esc, f0 } from './reports.js';
import { schematicSVG, riserSVG, axonometrySVG, sectionSVG } from './schematic.js';
import { renderSchedules, renderSheets, renderLibrary, renderSettings, renderInstall, renderIssues, renderHelp } from './pages.js';
import { icon } from './icons.js';
import { pointInPolygon, round } from '../core/util.js';

const $ = (s) => document.querySelector(s);

class App {
  constructor() {
    this.collapsed = new Set();
    this.filter = {};
    this.radiatorPref = { kind: 'panel', type: 22 };
    this.leftTab = 'project';
    this.rightTab = 'props';
    this.view = 'plan';
    this.ribbonTab = 'project';
    this.commands = new Map();
    this.lang = getLang();
    this.theme = localStore('zodpro.theme') ?? 'system';
    this.role = localStore('zodpro.role') ?? 'manager';
    this.telemetry = localStore('zodpro.telemetry') === '1';
    this.applyTheme();
    this.store = new Store(this.initialProject());
    this.plan = new PlanView($('#plan-canvas'), this.store, this);
    this.v3d = new View3D($('#three-host'), $('#toolbar-3d'), this.store, this);
    this.plugins = new PluginHost(this);
    this.registerCommands();
    this.buildShell();
    this.bindKeys();
    this.store.on('change', () => this.onModelChange());
    this.store.on('results', () => this.refresh());
    this.store.on('selection', () => this.refreshPanels());
    this.store.on('level', () => this.refresh());
    this.store.on('project', () => this.refresh());
    this.showView(this.view);
    this.refresh();
    this.startAutosave();
    window.addEventListener('error', (e) => logError(this.store, 'ui', e.error ?? e.message));
    window.addEventListener('unhandledrejection', (e) => logError(this.store, 'ui', e.reason));
    window.addEventListener('beforeunload', (e) => {
      if (this.store.dirty) {
        this.store.autosave();
        e.preventDefault();
      }
    });
    window.ZODPRO = { app: this, register: (m, a) => this.plugins.register(m, a) };
    this.offerRecovery();
  }

  initialProject() {
    return createDemoProject();
  }

  /** Crash recovery: offered after start-up in an in-page dialog. */
  async offerRecovery() {
    const rec = Store.recoverable();
    if (!rec) return;
    const when = rec.backups?.[0]?.time?.replace('T', ' ').slice(0, 16) ?? '';
    if (await this.confirmBox(t('recovery_q', { time: when }))) {
      try {
        const { project } = parseProject(rec.data);
        this.store.setProject(project);
        this.toast(`${t('recovered')}: ${when}`);
        return;
      } catch (err) {
        this.toast(`Tiklab bo‘lmadi: ${err.message}`, 'error');
      }
    }
    Store.clearRecovery();
  }

  /** In-page replacements for prompt()/confirm() (native dialogs are blocked in embedded viewers). */
  ask(title, def = '', hint = '') {
    return new Promise((resolve) => {
      let done = false;
      const m = this.modal(title, `${hint ? `<p class="muted" style="white-space:pre-wrap">${esc(hint)}</p>` : ''}<input id="ask-input" class="search" style="width:100%" value="${esc(def)}">`, [
        { label: 'Bekor', run: () => ((done = true), resolve(null)) },
        { label: 'OK', primary: true, run: (b) => ((done = true), resolve(b.querySelector('#ask-input').value)) },
      ]);
      const inp = m.querySelector('#ask-input');
      inp.focus();
      inp.select();
      inp.onkeydown = (e) => {
        if (e.key === 'Enter') {
          done = true;
          resolve(inp.value);
          m.remove();
        } else if (e.key === 'Escape') {
          done = true;
          resolve(null);
          m.remove();
        }
      };
      new MutationObserver(() => !m.isConnected && !done && ((done = true), resolve(null))).observe($('#modal-root'), { childList: true });
    });
  }

  confirmBox(text) {
    return new Promise((resolve) => {
      let done = false;
      const m = this.modal('Tasdiqlash', `<p>${esc(text)}</p>`, [
        { label: 'Yo‘q', run: () => ((done = true), resolve(false)) },
        { label: 'Ha', primary: true, run: () => ((done = true), resolve(true)) },
      ]);
      new MutationObserver(() => !m.isConnected && !done && ((done = true), resolve(false))).observe($('#modal-root'), { childList: true });
    });
  }

  // ======================= commands =======================
  registerCommand(c) {
    this.commands.set(c.id, c);
  }

  registerCommands() {
    const tool = (id, label, ic, key, perm = 'model.edit') => this.registerCommand({ id, label, icon: ic, key, run: () => this.setTool(id), tool: true, perm });
    tool('select', t('t_select'), 'select', 'Esc', 'view');
    tool('wall', t('t_wall'), 'wall', 'W');
    tool('door', t('t_door'), 'door', 'DR');
    tool('window', t('t_window'), 'window', 'WIN');
    tool('room', t('t_room'), 'room', 'RM');
    tool('room_poly', t('t_room_poly'), 'room_poly', 'RP');
    tool('radiator', t('t_radiator'), 'radiator', 'RAD');
    tool('pipe_s', t('t_pipe_s'), 'pipe_s', 'PS');
    tool('pipe_r', t('t_pipe_r'), 'pipe_r', 'PR');
    tool('riser', t('t_riser'), 'riser', 'RS');
    tool('collector', t('t_collector'), 'collector', 'COL');
    tool('ufh_collector', t('t_ufh_collector'), 'ufh', 'UFH');
    tool('boiler', t('t_boiler'), 'boiler', 'B');
    tool('pump', t('t_pump'), 'pump', 'PU');
    tool('thermostat', t('t_thermostat'), 'thermostat', 'TH');
    tool('obstacle', t('t_obstacle'), 'obstacle', 'OB');
    tool('text', t('t_text'), 'text', 'T');
    tool('dim', t('t_dim'), 'dim', 'D');
    tool('measure', t('t_measure'), 'measure', 'MEA', 'view');
    tool('move', t('t_move'), 'move', 'M');
    tool('copy', t('t_copy'), 'copy', 'CO');
    tool('rotate', t('t_rotate'), 'rotate', 'RO');
    tool('mirror', t('t_mirror'), 'mirror', 'MI');
    tool('array', t('t_array'), 'array', 'AR');
    tool('offset', t('t_offset'), 'offset', 'O');
    tool('trim', t('t_trim'), 'trim', 'TR');
    tool('extend', t('t_extend'), 'fillet', 'EX');
    tool('split', t('t_split'), 'split', 'SP');
    tool('fillet', 'Fillet', 'fillet', 'F');
    tool('line', 'Chiziq', 'line', 'L');
    tool('polyline', 'Polilinya', 'polyline', 'PL');
    tool('circle', 'Aylana', 'circle', 'C');
    tool('arc', 'Yoy', 'arc', 'A');
    tool('rect', "To'rtburchak", 'rect', 'REC');
    tool('hatch', 'Shtrix', 'hatch', 'H');
    tool('leader', 'Vynoska', 'leader', 'LE');
    tool('section', 'Kesim', 'section', 'SEC');
    tool('calibrate', 'Kalibrlash', 'measure', 'CAL');
    const cmd = (id, label, ic, run, key = '', perm = 'model.edit') => this.registerCommand({ id, label, icon: ic, run, key, perm });
    cmd('delete', t('t_delete'), 'delete', () => this.deleteSelection(), 'E');
    cmd('undo', t('undo'), 'revision', () => this.store.undo() || this.toast('Bekor qilinadigan amal yo‘q'), 'U');
    cmd('redo', t('redo'), 'revision', () => this.store.redo(), 'REDO');
    cmd('level', t('t_level'), 'level', () => this.addLevel(), 'LV');
    cmd('auto_rad', t('t_auto_rad'), 'auto_rad', () => this.autoRadiators(), 'AUTORAD');
    cmd('auto_col', t('t_auto_col'), 'collector', () => this.autoCollector(), 'AUTOCOL');
    cmd('auto_route', t('t_auto_route'), 'auto_route', () => this.autoRoute(), 'AUTOROUTE');
    cmd('calc', t('t_calc'), 'calc', () => {
      this.store.recalc(true);
      this.toast(t('calc_ms', { ms: this.store.results?.stats.ms.toFixed(1) }));
    }, 'CALC', 'view');
    cmd('validate', t('t_validate'), 'validate', () => this.showView('dashboard'), 'VAL', 'view');
    cmd('balance', t('t_balance'), 'balance', () => {
      this.scheduleKey = 'balancing';
      this.showView('schedules');
    }, 'BAL', 'view');
    cmd('tags', 'Belgilash', 'tag', () => {
      this.plan.toggles.tags = !this.plan.toggles.tags;
      this.plan.draw();
    }, 'TAG', 'view');
    cmd('new', t('t_new'), 'new', () => this.newProject(), 'NEW', 'view');
    cmd('open', t('t_open'), 'open', () => this.openFile(), 'OPEN', 'view');
    cmd('save', t('t_save'), 'save', () => this.saveFile(), 'SAVE', 'view');
    cmd('save_as', t('t_save_as'), 'save', () => this.saveFile(true), 'SAVEAS', 'view');
    cmd('demo', t('t_demo'), 'demo', async () => {
      if (!this.store.dirty || (await this.confirmBox(t('confirm_new')))) this.store.setProject(createDemoProject());
    }, 'DEMO', 'view');
    cmd('imp_dxf', t('t_imp_dxf'), 'import', () => this.importDXF(), 'IMPDXF');
    cmd('imp_img', t('t_imp_img'), 'underlay', () => this.importUnderlay(), 'UNDERLAY');
    cmd('imp_ifc', 'IFC import', 'import', () => this.importIFC(), 'IMPIFC');
    cmd('exp_dxf', 'DXF', 'export', () => download(`${this.fileBase()}_${this.store.level.name}.dxf`, exportDXF(this.store.project, this.store.results, this.store.activeLevelId), 'application/dxf'), 'DXFOUT', 'docs.export');
    cmd('exp_ifc', 'IFC', 'export', () => download(`${this.fileBase()}.ifc`, exportIFC(this.store.project, this.store.results), 'application/x-step'), 'IFCOUT', 'docs.export');
    cmd('exp_xls', 'Excel', 'schedule', () => {
      const defs = scheduleDefs(this.store.project, this.store.results);
      download(`${this.fileBase()}.xls`, toExcelXml(defs.map((d) => ({ name: d.title, rows: d.rows(), columns: d.columns }))), 'application/vnd.ms-excel');
    }, 'XLSOUT', 'docs.export');
    cmd('exp_csv', 'CSV', 'schedule', () => this.showView('schedules'), 'CSVOUT', 'docs.export');
    cmd('exp_svg', 'SVG', 'export', () => download(`${this.fileBase()}_${this.store.level.name}.svg`, exportSVG(this.store.project, this.store.results, this.store.activeLevelId, this.store.project.settings.colors), 'image/svg+xml'), 'SVGOUT', 'docs.export');
    cmd('exp_png', 'PNG', 'export', () => this.exportPNG(), 'PNGOUT', 'docs.export');
    cmd('exp_pdf', t('t_exp_pdf'), 'pdf', () => {
      this.showView('sheets');
      setTimeout(() => window.print(), 300);
    }, 'PDF', 'docs.export');
    cmd('quote', 'Tijorat taklifi', 'quote', () => this.openQuotation(), 'QUOTE', 'view');
    cmd('telegram', 'Telegram', 'telegram', () => this.telegramDialog(), 'TG', 'view');
    cmd('sap', 'SAP / Ombor', 'sap', () => {
      this.scheduleKey = 'bom';
      this.showView('schedules');
    }, 'SAP', 'view');
    cmd('revision', t('t_revision'), 'revision', () => this.newRevision(), 'REV', 'view');
    cmd('palette', t('t_palette'), 'help', () => this.palette(), 'F1', 'view');
    cmd('ai', t('t_ai'), 'ai', () => this.assistant(), 'AI', 'view');
    cmd('plugins', 'Plaginlar', 'plugin', () => this.pluginsDialog(), 'PLUGINS', 'view');
    cmd('errors', 'Xatolar jurnali', 'issue', () => this.errorLog(), 'ERRLOG', 'view');
    cmd('zoom_fit', 'Moslash', 'plan', () => this.plan.fit(), 'Z', 'view');
    cmd('copy_level', 'Qavatni nusxalash', 'level', () => this.copyLevel(), 'COPYLV');
    for (const [v, label, ic] of [['plan', t('v_plan'), 'plan'], ['3d', t('v_3d'), 'cube'], ['schema', t('v_schema'), 'schema'], ['riser', t('v_riser'), 'riser'], ['section', 'Kesim/Aksonometriya', 'section'], ['reports', t('v_reports'), 'calc'], ['schedules', t('v_schedules'), 'schedule'], ['sheets', t('v_sheets'), 'sheet'], ['dashboard', t('v_dashboard'), 'dashboard'], ['issues', t('v_issues'), 'issue'], ['install', t('v_install'), 'install'], ['library', t('v_library'), 'library'], ['settings', t('tab_settings'), 'settings'], ['help', t('tab_help'), 'help']]) {
      cmd(`view_${v}`, label, ic, () => this.showView(v), '', 'view');
    }
  }

  ribbonLayout() {
    return {
      project: [['select'], ['wall', 'door', 'window', 'room', 'level'], ['radiator', 'pipe_s', 'pipe_r', 'collector', 'boiler', 'pump', 'riser'], ['text', 'dim'], ['auto_rad', 'auto_route', 'calc'], ['view_3d', 'view_reports', 'view_schedules', 'view_sheets', 'exp_dxf']],
      edit: [['select', 'undo', 'redo'], ['move', 'copy', 'rotate', 'mirror', 'array', 'offset'], ['trim', 'extend', 'split', 'fillet', 'delete'], ['line', 'polyline', 'circle', 'arc', 'rect', 'hatch', 'leader', 'text', 'dim', 'measure']],
      view: [['view_plan', 'view_3d', 'view_schema', 'view_riser', 'view_section', 'section'], ['view_dashboard', 'view_install', 'view_issues', 'tags', 'zoom_fit']],
      systems: [['radiator', 'pipe_s', 'pipe_r', 'riser'], ['collector', 'ufh_collector', 'boiler', 'pump', 'thermostat', 'obstacle'], ['auto_rad', 'auto_col', 'auto_route']],
      calc: [['calc', 'validate', 'balance'], ['view_reports', 'view_dashboard', 'view_schema'], ['ai']],
      docs: [['view_sheets', 'view_schedules', 'exp_pdf'], ['view_schema', 'view_riser', 'view_section', 'section'], ['revision', 'tags']],
      export: [['new', 'open', 'save', 'save_as', 'demo'], ['imp_dxf', 'imp_img', 'imp_ifc', 'calibrate'], ['exp_dxf', 'exp_ifc', 'exp_xls', 'exp_csv', 'exp_svg', 'exp_png', 'exp_pdf'], ['quote', 'sap', 'telegram']],
      settings: [['view_settings', 'view_library'], ['plugins', 'errors']],
      help: [['view_help', 'palette', 'ai']],
    };
  }

  // ======================= shell =======================
  buildShell() {
    const tabs = [['project', t('tab_project')], ['edit', t('tab_edit')], ['view', t('tab_view')], ['systems', t('tab_systems')], ['calc', t('tab_calc')], ['docs', t('tab_docs')], ['export', t('tab_export')], ['settings', t('tab_settings')], ['help', t('tab_help')]];
    $('#menutabs').innerHTML = tabs.map(([k, l]) => `<button data-rt="${k}" class="${k === this.ribbonTab ? 'active' : ''}">${esc(l)}</button>`).join('');
    $('#menutabs').onclick = (e) => {
      const b = e.target.closest('[data-rt]');
      if (!b) return;
      this.ribbonTab = b.dataset.rt;
      this.buildShell();
    };
    this.renderRibbon();
    const vt = [['plan', t('v_plan')], ['3d', t('v_3d')], ['schema', t('v_schema')], ['riser', t('v_riser')], ['section', 'Kesim · Akso'], ['reports', t('v_reports')], ['schedules', t('v_schedules')], ['sheets', t('v_sheets')], ['dashboard', t('v_dashboard')], ['issues', t('v_issues')], ['install', t('v_install')], ['library', t('v_library')], ['settings', t('tab_settings')], ['help', t('tab_help')]];
    $('#viewtabs').innerHTML = vt.map(([k, l]) => `<button data-v="${k}" class="${k === this.view ? 'active' : ''}">${esc(l)}</button>`).join('');
    $('#viewtabs').onclick = (e) => {
      const b = e.target.closest('[data-v]');
      if (b) this.showView(b.dataset.v);
    };
    $('#left-tabs').innerHTML = [['project', t('tab_project')], ['library', t('p_library')], ['filter', 'Filtr']].map(([k, l]) => `<button data-lt="${k}" class="${k === this.leftTab ? 'active' : ''}">${esc(l)}</button>`).join('');
    $('#left-tabs').onclick = (e) => {
      const b = e.target.closest('[data-lt]');
      if (!b) return;
      this.leftTab = b.dataset.lt;
      this.buildShell();
      this.refreshPanels();
    };
    $('#right-tabs').innerHTML = [['props', t('p_properties')], ['calc', t('p_calc')], ['system', t('p_system')]].map(([k, l]) => `<button data-rt2="${k}" class="${k === this.rightTab ? 'active' : ''}">${esc(l)}</button>`).join('');
    $('#right-tabs').onclick = (e) => {
      const b = e.target.closest('[data-rt2]');
      if (!b) return;
      this.rightTab = b.dataset.rt2;
      this.buildShell();
      this.refreshPanels();
    };
    $('#lang-select').innerHTML = Object.entries(LANG_NAMES).map(([k, v]) => `<option value="${k}" ${k === this.lang ? 'selected' : ''}>${k.toUpperCase()}</option>`).join('');
    $('#lang-select').onchange = (e) => this.setLang(e.target.value);
    $('#btn-theme').onclick = () => this.setTheme(this.theme === 'dark' ? 'light' : this.theme === 'light' ? 'system' : 'dark');
    $('#btn-undo').onclick = () => this.run('undo');
    $('#btn-redo').onclick = () => this.run('redo');
    $('#btn-ai').onclick = () => this.assistant();
    $('#user-chip').textContent = (ROLES[this.role]?.name ?? 'U')[0];
    $('#user-chip').title = ROLES[this.role]?.name;
    $('#user-chip').onclick = () => this.showView('settings');
    $('#global-search').placeholder = t('search');
    $('#global-search').onkeydown = (e) => e.key === 'Enter' && this.globalSearch(e.target.value);
    $('#brand-sub').textContent = t('app_sub');
    $('#cmd-input').placeholder = t('cmd_placeholder');
    this.renderToggles();
    this.renderPlanToolbar();
    this.bindCmdLine();
    this.bindSplitters();
  }

  renderRibbon() {
    const lay = this.ribbonLayout()[this.ribbonTab] ?? [];
    $('#ribbon').innerHTML = lay.map((g) => `<div class="rgroup">${g.map((id) => {
      const c = this.commands.get(id);
      if (!c) return '';
      const active = c.tool && this.plan?.tool === id;
      const disabled = !can(this.role, c.perm ?? 'model.edit');
      return `<button class="rbtn ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}" data-cmd="${id}" title="${esc(c.label)}${c.key ? ` (${c.key})` : ''}">${icon(c.icon)}<span>${esc(c.label)}</span>${c.key ? `<span class="kbd">${esc(c.key)}</span>` : ''}</button>`;
    }).join('')}</div>`).join('');
    $('#ribbon').onclick = (e) => {
      const b = e.target.closest('[data-cmd]');
      if (b) this.run(b.dataset.cmd);
    };
  }

  renderToggles() {
    const tg = this.plan.toggles;
    const items = [['snap', `${t('snap')} F9`], ['grid', `${t('grid')} F7`], ['ortho', `${t('ortho')} F8`], ['osnap', `${t('osnap')} F3`]];
    $('#status-toggles').innerHTML = items.map(([k, l]) => `<button data-tg="${k}" class="${tg[k] ? 'on' : ''}">${l}</button>`).join('');
    $('#status-toggles').onclick = (e) => {
      const b = e.target.closest('[data-tg]');
      if (!b) return;
      tg[b.dataset.tg] = !tg[b.dataset.tg];
      this.renderToggles();
      this.plan.draw();
    };
  }

  renderPlanToolbar() {
    const pv = this.plan;
    const layers = [['room', 'Xonalar'], ['wall', 'Devorlar'], ['window', 'Derazalar'], ['door', 'Eshiklar'], ['radiator', 'Radiatorlar'], ['supply', "Ta'minot"], ['return', 'Qaytish'], ['riser', 'Stoyaklar'], ['ufh', 'Pol isitish'], ['collector', 'Kollektor'], ['boiler', 'Qozon'], ['obstacle', "To'siqlar"], ['dline', 'Chizmachilik'], ['text', 'Matn'], ['dim', "O'lcham"]];
    const tb = $('#plan-toolbar');
    tb.innerHTML = `<details style="position:relative"><summary style="list-style:none;padding:5px 9px;cursor:pointer">Qatlamlar ▾</summary><div style="position:absolute;top:30px;left:0;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:6px 10px;box-shadow:var(--shadow);z-index:5;white-space:nowrap">${layers.map(([k, l]) => `<label style="display:block"><input type="checkbox" data-layer="${k}" ${pv.hidden.has(k) ? '' : 'checked'}> ${l}</label>`).join('')}</div></details>
      <button data-cm="system" class="${pv.colorMode === 'system' ? 'active' : ''}">Tizim ranglari</button>
      <button data-cm="velocity" class="${pv.colorMode === 'velocity' ? 'active' : ''}">Tezlik</button>
      <button data-cm="pressure" class="${pv.colorMode === 'pressure' ? 'active' : ''}">Bosim</button>
      <button data-t="tags" class="${pv.toggles.tags ? 'active' : ''}">Teglar</button>
      <button data-t="arrows" class="${pv.toggles.arrows ? 'active' : ''}">Oqim</button>
      <button data-t="ufh" class="${pv.toggles.ufh ? 'active' : ''}">TP</button>
      <button data-t="underlay" class="${pv.toggles.underlay ? 'active' : ''}">Podloshka</button>
      <button data-fit="1">⤢</button>`;
    tb.querySelectorAll('[data-layer]').forEach((c) => (c.onchange = () => {
      if (c.checked) pv.hidden.delete(c.dataset.layer);
      else pv.hidden.add(c.dataset.layer);
      pv.draw();
    }));
    tb.querySelectorAll('[data-cm]').forEach((b) => (b.onclick = () => {
      pv.colorMode = b.dataset.cm;
      this.renderPlanToolbar();
      pv.draw();
    }));
    tb.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
      pv.toggles[b.dataset.t] = !pv.toggles[b.dataset.t];
      this.renderPlanToolbar();
      pv.draw();
    }));
    tb.querySelector('[data-fit]').onclick = () => pv.fit();
  }

  bindSplitters() {
    document.querySelectorAll('.splitter').forEach((sp) => {
      sp.onpointerdown = (e) => {
        const ws = $('#workspace');
        const cols = getComputedStyle(ws).gridTemplateColumns.split(' ').map(parseFloat);
        const left = sp.dataset.target === 'left-panel';
        const start = e.clientX;
        const w0 = left ? cols[0] : cols[4];
        const move = (ev) => {
          const w = Math.max(180, Math.min(560, w0 + (left ? ev.clientX - start : start - ev.clientX)));
          if (left) cols[0] = w;
          else cols[4] = w;
          ws.style.gridTemplateColumns = `${cols[0]}px 5px 1fr 5px ${cols[4]}px`;
          this.plan.resize();
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      };
      sp.ondblclick = () => {
        const ws = $('#workspace');
        ws.classList.toggle(sp.dataset.target === 'left-panel' ? 'hide-left' : 'hide-right');
        ws.style.gridTemplateColumns = '';
        setTimeout(() => this.plan.resize(), 50);
      };
    });
  }

  // ======================= running commands =======================
  run(id) {
    const c = this.commands.get(id);
    if (!c) return this.toast(`Buyruq topilmadi: ${id}`, 'error');
    if (!can(this.role, c.perm ?? 'model.edit')) return this.toast(`Rol "${ROLES[this.role].name}" uchun ruxsat yo‘q`, 'error');
    try {
      this.store.flush();
      c.run();
      this.plugins.emit('command', id);
      this.logCmd(c.label);
    } catch (err) {
      logError(this.store, id, err);
      this.toast(`Xato: ${err.message}`, 'error');
      console.error(err);
    }
  }

  setTool(id) {
    if (this.view !== 'plan') this.showView('plan');
    this.plan.setTool(id);
    this.renderRibbon();
  }

  logCmd(text) {
    const h = $('#cmd-history');
    const d = document.createElement('div');
    d.textContent = `› ${text}`;
    h.appendChild(d);
    h.scrollTop = h.scrollHeight;
  }

  bindCmdLine() {
    const inp = $('#cmd-input');
    const aliases = {};
    for (const c of this.commands.values()) if (c.key) aliases[c.key.toUpperCase()] = c.id;
    Object.assign(aliases, { E: 'delete', DEL: 'delete', U: 'undo', Z: 'zoom_fit', '?': 'palette', HELP: 'view_help', '3D': 'view_3d', PLAN: 'view_plan' });
    inp.onkeydown = (e) => {
      if (e.key === 'Escape') {
        inp.value = '';
        inp.blur();
        this.plan.cancel();
        return;
      }
      if (e.key !== 'Enter') return;
      const v = inp.value.trim();
      inp.value = '';
      if (!v) {
        this.plan.finishTool();
        return;
      }
      this.logCmd(v);
      if (this.plan.numericInput(v)) return;
      const id = aliases[v.toUpperCase()];
      if (id) return this.run(id);
      if (v.length > 6 && /\s/.test(v)) return this.assistant(v);
      this.toast(`Noma’lum buyruq: ${v}`, 'error');
    };
  }

  bindKeys() {
    document.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      const typing = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && e.target.id !== 'plan-canvas';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        return e.shiftKey ? this.run('redo') : this.run('undo');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        return this.run('redo');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        return this.saveFile(e.shiftKey);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        return this.openFile();
      }
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || e.key === 'F1') {
        e.preventDefault();
        return this.palette();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !typing && this.view === 'plan') {
        e.preventDefault();
        return this.store.select(Object.values(this.store.project.elements).filter((x) => x.levelId === this.store.activeLevelId).map((x) => x.id));
      }
      if (typing) return;
      if (this.view === 'plan' && this.plan.onKey(e)) {
        e.preventDefault();
        return;
      }
      // printable key → command line (AutoCAD style)
      if (e.key.length === 1 && /[a-zA-Z0-9@?.\-]/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const inp = $('#cmd-input');
        inp.focus();
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.key === ' ') this.plan.spaceDown = false;
    });
  }

  // ======================= views =======================
  showView(v) {
    this.view = v;
    document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === `view-${v}`));
    document.querySelectorAll('#viewtabs [data-v]').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
    this.v3d.show(v === '3d');
    if (v === 'plan') setTimeout(() => this.plan.resize(), 0);
    this.renderView();
  }

  renderView() {
    const p = this.store.project;
    const res = this.store.results;
    const colors = p.settings.colors;
    const el = $(`#view-${this.view}`);
    const bindRows = () => el.querySelectorAll('tr.clickable, [data-id].clickable').forEach((tr) => (tr.onclick = () => tr.dataset.id && this.focusElement(tr.dataset.id)));
    switch (this.view) {
      case 'schema':
        el.innerHTML = `<div class="doc-toolbar"><b>${t('v_schema')}</b><span class="muted">Model topologiyasidan avtomatik (qozon → nasos → kollektor → shoxlar → radiatorlar → qaytish)</span><button class="btn small" id="sv">SVG</button></div>${schematicSVG(p, res, colors)}`;
        el.querySelector('#sv').onclick = () => download(`${this.fileBase()}_sxema.svg`, el.querySelector('svg').outerHTML, 'image/svg+xml');
        break;
      case 'riser':
        el.innerHTML = `<div class="doc-toolbar"><b>${t('v_riser')}</b><button class="btn small" id="sv">SVG</button></div>${riserSVG(p, res, colors)}`;
        el.querySelector('#sv').onclick = () => download(`${this.fileBase()}_stoyak.svg`, el.querySelector('svg').outerHTML, 'image/svg+xml');
        break;
      case 'section': {
        const secs = elementsOf(p, 'section');
        el.innerHTML = `<div class="doc-toolbar"><b>Aksonometrik sxema</b><span class="muted">Haqiqiy quvur geometriyasi (x, y, balandlik)</span></div>${axonometrySVG(p, res, colors)}
          <h3>Kesimlar (${secs.length})</h3><p class="muted">Yangi kesim: Ko‘rish → Kesim, rejada 2 nuqta.</p>${secs.map((s) => `<h4>${esc(s.name)}</h4>${sectionSVG(p, res, s, colors)}`).join('')}`;
        break;
      }
      case 'reports':
        el.innerHTML = reportsHTML(p, res);
        bindRows();
        break;
      case 'schedules':
        renderSchedules(el, this);
        break;
      case 'sheets':
        renderSheets(el, this);
        break;
      case 'dashboard':
        el.innerHTML = dashboardHTML(p, res);
        bindRows();
        el.querySelectorAll('[data-clash]').forEach((i) => (i.onchange = () => {
          p.clashStatus = { ...(p.clashStatus ?? {}), [i.dataset.clash]: { ...(p.clashStatus?.[i.dataset.clash] ?? {}), [i.dataset.f]: i.value } };
          this.store.changed('clash');
        }));
        break;
      case 'issues':
        renderIssues(el, this);
        break;
      case 'install':
        renderInstall(el, this);
        break;
      case 'library':
        renderLibrary(el, this);
        break;
      case 'settings':
        renderSettings(el, this);
        break;
      case 'help':
        renderHelp(el);
        break;
      default:
        break;
    }
  }

  refresh() {
    this.refreshPanels();
    this.renderStatus();
    this.renderLevelSwitch();
    if (this.view !== 'plan' && this.view !== '3d') this.renderView();
    this.plan.draw();
  }

  refreshPanels() {
    renderBrowser($('#left-body'), this, this.leftTab);
    renderProperties($('#right-body'), this, this.rightTab);
  }

  onModelChange() {
    this.plugins?.emit('change');
  }

  renderLevelSwitch() {
    const ls = sortedLevels(this.store.project).slice().reverse();
    $('#level-switch').innerHTML = ls.map((l) => `<button data-l="${l.id}" class="${l.id === this.store.activeLevelId ? 'active' : ''}">${esc(l.name)} <small>${l.elevation >= 0 ? '+' : ''}${l.elevation.toFixed(3)}</small></button>`).join('');
    $('#level-switch').onclick = (e) => {
      const b = e.target.closest('[data-l]');
      if (b) this.store.setLevel(b.dataset.l);
    };
  }

  renderStatus() {
    const res = this.store.results;
    if (!res) {
      $('#status-validation').innerHTML = this.store.calcError ? `<span class="pill critical">Hisob xatosi</span>` : '';
      return;
    }
    const c = res.validation.counts;
    $('#status-validation').innerHTML = `<button class="pill ok">OK ${c.ok}</button><button class="pill warning">⚠ ${c.warning}</button><button class="pill error">✖ ${c.error}</button><button class="pill critical">‼ ${c.critical}</button>`;
    $('#status-validation').onclick = () => this.showView('dashboard');
    this.statusBase = `${this.store.level?.name ?? ''} · Q ${f0(res.totals.heatLoss)} W · ${t('calc_ms', { ms: res.stats.ms.toFixed(1) })} · ${t('elements_n', { n: res.stats.elements })}${this.store.dirty ? ' · •' : ''}`;
    $('#status-info').textContent = this.statusBase;
  }

  setCoords(p) {
    $('#status-info').textContent = `X ${p.x.toFixed(3)}  Y ${(-p.y).toFixed(3)} · ${this.statusBase ?? ''}`;
  }

  setHint(h) {
    $('#tool-hint').textContent = h;
  }

  focusCmd(v) {
    const i = $('#cmd-input');
    i.value = v;
    i.focus();
  }

  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = text;
    $('#toast-root').appendChild(d);
    setTimeout(() => d.remove(), kind === 'error' ? 6000 : 3500);
  }

  focusElement(id, additive = false) {
    const e = this.store.project.elements[id];
    if (!e) return;
    const lvl = e.levelId ?? e.levelFrom;
    if (lvl && lvl !== this.store.activeLevelId) this.store.setLevel(lvl);
    this.store.select(id, additive);
    if (this.view !== 'plan' && this.view !== '3d') this.showView('plan');
    if (this.view === 'plan') this.plan.fit([id]);
    if (this.plan.scale > 120) {
      const c = { x: this.plan.w / 2, y: this.plan.h / 2 };
      const k = 80 / this.plan.scale;
      this.plan.ox = c.x - (c.x - this.plan.ox) * k;
      this.plan.oy = c.y - (c.y - this.plan.oy) * k;
      this.plan.scale = 80;
      this.plan.draw();
    }
  }

  filterMatches(f) {
    const p = this.store.project;
    const res = this.store.results;
    return Object.values(p.elements).filter((e) => {
      if (f.cat && e.cat !== f.cat) return false;
      if (f.level && e.levelId !== f.level) return false;
      if (f.system && e.system !== f.system) return false;
      const pr = res?.pipes?.[e.id];
      if (f.dn && pr?.dn !== f.dn) return false;
      if (f.material && (pr?.material ?? e.material) !== f.material) return false;
      if (f.status && pr?.status !== f.status) return false;
      if (f.text) {
        const s = `${e.mark} ${e.name ?? ''} ${res?.radiators?.[e.id]?.product?.article ?? ''} ${res?.radiators?.[e.id]?.product?.model ?? ''}`.toLowerCase();
        if (!s.includes(f.text.toLowerCase())) return false;
      }
      return true;
    }).map((e) => e.id);
  }

  globalSearch(q) {
    if (!q) return;
    const ids = this.filterMatches({ text: q });
    if (!ids.length) return this.toast('Topilmadi');
    this.store.select(ids);
    this.focusElement(ids[0], true);
    this.toast(`${ids.length} ta natija`);
  }

  // ======================= model ops =======================
  deleteSelection() {
    const ids = [...this.store.selection];
    if (!ids.length) return;
    this.store.apply({ remove: ids }, 'delete');
  }

  addLevel() {
    const ls = sortedLevels(this.store.project);
    const top = ls[ls.length - 1];
    const n = ls.length + 1;
    const nl = { id: `lvl_${Date.now().toString(36)}`, name: `${n}-qavat`, elevation: round(top.elevation + top.height + (top.floorThickness ?? 0.3), 3), height: top.height, floorThickness: top.floorThickness ?? 0.3 };
    this.store.apply({ levels: [...this.store.project.levels, nl] }, 'level:add');
    this.store.setLevel(nl.id);
    this.toast(`${nl.name} (+${nl.elevation.toFixed(3)}) qo‘shildi`);
  }

  copyLevel() {
    const p = this.store.project;
    const cur = this.store.activeLevelId;
    const ls = sortedLevels(p);
    const top = ls[ls.length - 1];
    const nl = { id: `lvl_${Date.now().toString(36)}`, name: `${ls.length + 1}-qavat`, elevation: round(top.elevation + top.height + (top.floorThickness ?? 0.3), 3), height: top.height, floorThickness: top.floorThickness ?? 0.3 };
    const src = Object.values(p.elements).filter((e) => e.levelId === cur && ['wall', 'window', 'door', 'room'].includes(e.cat));
    const idMap = new Map();
    const add = src.map((e) => {
      const n = newElement(e.cat, { ...JSON.parse(JSON.stringify(e)), id: undefined, guid: undefined, levelId: nl.id, mark: '' });
      idMap.set(e.id, n.id);
      return n;
    });
    for (const n of add) if (n.wallId) n.wallId = idMap.get(n.wallId);
    for (const n of add) if (n.cat === 'room') n.number = String(n.number ?? '').replace(/^\d/, String(ls.length + 1));
    this.store.apply({ levels: [...p.levels, nl], add }, 'level:copy');
    this.store.setLevel(nl.id);
    this.toast(`${nl.name}: ${add.length} ta arxitektura elementi nusxalandi`);
  }

  autoRadiators() {
    const cs = autoPlaceRadiators(this.store.project, { levelId: this.store.activeLevelId });
    if (!cs.add.length) return this.toast('Barcha isitiladigan xonalarda radiator bor');
    for (const r of cs.add) {
      r.prefKind = this.radiatorPref.kind;
      if (r.prefKind === 'panel') r.prefType = this.radiatorPref.type;
      else delete r.prefType;
    }
    this.store.apply(cs, 'auto:radiators');
    this.toast(`${cs.add.length} ta radiator joylashtirildi va tanlandi`);
  }

  autoCollector() {
    const cs = autoPlaceCollector(this.store.project, this.store.activeLevelId);
    if (!cs.add.length) return this.toast('Qavatda kollektor bor yoki xona yo‘q');
    this.store.apply(cs, 'auto:collector');
  }

  autoRoute() {
    const res = this.store.results;
    const cs = autoRoute(this.store.project, (el) => res?.radiators?.[el.id]?.product);
    for (const w of cs.warnings) this.toast(msg(w.code), 'error');
    if (!cs.add.length && !cs.update.length) return this.toast('Ulanadigan element yo‘q');
    this.store.apply(cs, 'auto:route');
    this.toast(`${cs.add.length} ta quvur/stoyak yaratildi`);
  }

  async newRevision() {
    const p = this.store.project;
    const last = p.revisions[p.revisions.length - 1];
    const what = await this.ask('Reviziya: nima o‘zgardi?', '');
    if (what === null) return;
    const no = String(Number(last?.no ?? -1) + 1).padStart(2, '0');
    p.revisions.push({ no, date: new Date().toISOString().slice(0, 10), by: p.meta.designer || ROLES[this.role].name, what, changes: this.store.undoStack.length });
    this.store.changed('revision');
    this.toast(`Reviziya ${no}`);
  }

  async newIssue(elementId) {
    const d = await this.ask('Muammo tavsifi');
    if (!d) return;
    const p = this.store.project;
    p.issues.push({ id: `ISS-${String(p.issues.length + 1).padStart(3, '0')}`, elementId, description: d, status: 'open', priority: 'medium', responsible: '', date: new Date().toISOString().slice(0, 10), resolution: '', history: [] });
    this.store.changed('issue');
    this.toast('Muammo qo‘shildi');
  }

  // ======================= files =======================
  fileBase() {
    return (this.store.project.meta.number || 'zodpro').replace(/[^\w-]+/g, '_');
  }

  async saveFile(as = false) {
    let name = this.fileName ?? `${this.fileBase()}.zph`;
    if (as || !this.fileName) {
      const n = await this.ask('Fayl nomi', name);
      if (!n) return;
      name = n.endsWith('.zph') ? n : `${n}.zph`;
    }
    this.fileName = name;
    // backup of previous save (.zph.bak)
    try {
      const prev = localStore('zodpro.lastsave');
      if (prev) localStorage.setItem('zodpro.lastsave.bak', prev);
    } catch {
      /* ignore */
    }
    const data = serializeProject(this.store.project);
    try {
      localStorage.setItem('zodpro.lastsave', data);
    } catch {
      /* quota */
    }
    download(name, data, 'application/json');
    this.store.dirty = false;
    Store.clearRecovery();
    this.toast(`${t('saved')}: ${name}`);
    this.renderStatus();
  }

  openFile() {
    this.pickFile('.zph,.json', (text, file) => {
      try {
        const { project, migrated } = parseProject(text);
        if (migrated.length) {
          download(`${file.name}.bak`, text, 'application/json');
          this.toast(`Fayl migratsiya qilindi (${migrated.join(', ')}); asl nusxa .bak sifatida saqlandi`);
        }
        if (project._checksumWarning) this.toast('Diqqat: fayl nazorat yig‘indisi mos emas', 'error');
        this.fileName = file.name;
        this.store.setProject(project);
      } catch (err) {
        this.toast(err.message === 'file_newer' ? 'Fayl dasturning yangiroq versiyasida yaratilgan' : `Ochib bo‘lmadi: ${err.message}`, 'error');
      }
    });
  }

  async newProject() {
    if (this.store.dirty && !(await this.confirmBox(t('confirm_new')))) return;
    this.fileName = null;
    this.store.setProject(createEmptyProject());
    this.showView('plan');
    this.toast('Yangi loyiha. Devor (W) chizishdan boshlang.');
  }

  pickFile(accept, cb, asDataURL = false) {
    const i = $('#file-input');
    i.accept = accept;
    i.value = '';
    i.onchange = () => {
      const f = i.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => cb(r.result, f);
      if (asDataURL) r.readAsDataURL(f);
      else r.readAsText(f);
    };
    i.click();
  }

  pickImage(cb) {
    this.pickFile('image/*', (url) => cb(url), true);
  }

  importDXF() {
    this.pickFile('.dxf', async (text) => {
      const unit = Number(await this.ask('DXF birligi (1 = metr, 0.001 = mm)', '0.001')) || 0.001;
      const segs = parseDXF(text, unit);
      if (!segs.length) return this.toast('DXF da LINE/LWPOLYLINE topilmadi', 'error');
      const layers = [...new Set(segs.map((s) => s.layer))];
      const layer = await this.ask('Devor sifatida olinadigan qatlam (bo‘sh — hammasi)', layers.find((l) => /wall|devor|стен/i.test(l)) ?? '', `Qatlamlar: ${layers.join(', ')}`);
      if (layer === null) return;
      const walls = dxfSegmentsToWalls(segs, this.store.activeLevelId, { layerFilter: layer || null });
      this.store.apply({ add: walls }, 'import:dxf');
      this.plan.fit();
      this.toast(`${walls.length} ta devor import qilindi`);
    });
  }

  importUnderlay() {
    this.pickFile('image/*,.pdf', async (url, f) => {
      let src = url;
      if (f.type === 'application/pdf') {
        try {
          const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs');
          pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
          const bin = atob(url.split(',')[1]);
          const bytes = new Uint8Array(bin.length);
          for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
          const doc = await pdfjs.getDocument({ data: bytes }).promise;
          const page = await doc.getPage(1);
          const vp = page.getViewport({ scale: 2 });
          const c = document.createElement('canvas');
          c.width = vp.width;
          c.height = vp.height;
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          src = c.toDataURL('image/png');
        } catch (err) {
          return this.toast(`PDF o‘qilmadi: ${err.message}`, 'error');
        }
      }
      const lv = this.store.activeLevelId;
      this.store.apply({ settings: { underlays: { [lv]: { src, x: 0, y: 0, scale: 0.01, opacity: 0.5, visible: true } } } }, 'underlay');
      this.plan.toggles.underlay = true;
      this.toast('Podloshka qo‘shildi. Masshtab uchun "Kalibrlash" (CAL): ma’lum masofali 2 nuqtani bosing.');
      this.setTool('calibrate');
    }, true);
  }

  importIFC() {
    this.pickFile('.ifc', (text) => {
      // IFC import: storeys & spaces with ZODPRO property sets (round-trip of our own export);
      // general IFC geometry import is backlog item INT-IFC-GEOM.
      const storeys = [...text.matchAll(/IFCBUILDINGSTOREY\([^,]*,[^,]*,'([^']*)'.*?,([-\d.E+]+)\);/g)];
      if (!storeys.length) return this.toast('IFC da qavatlar topilmadi', 'error');
      const levels = storeys.map((m, i) => ({ id: `lvl_ifc_${i}`, name: m[1], elevation: Number(m[2]), height: 3, floorThickness: 0.3 }));
      this.store.apply({ levels: [...this.store.project.levels, ...levels.filter((l) => !this.store.project.levels.some((x) => x.name === l.name))] }, 'import:ifc');
      this.toast(`IFC: ${levels.length} ta qavat o‘qildi (geometriya importi — backlog)`);
    });
  }

  exportPNG() {
    const url = this.view === '3d' ? this.v3d.toPNG() : this.plan.toPNG();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.fileBase()}_${this.view}.png`;
    a.click();
  }

  exportPNG3d() {
    const url = this.v3d.toPNG();
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.fileBase()}_3d.png`;
      a.click();
    }
  }

  // ======================= dialogs =======================
  modal(title, body, buttons = [{ label: 'Yopish' }]) {
    const root = $('#modal-root');
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal"><header><span>${esc(title)}</span><button class="icon-btn" data-close>✕</button></header><div class="body"></div><footer></footer></div>`;
    const b = back.querySelector('.body');
    if (typeof body === 'string') b.innerHTML = body;
    else b.appendChild(body);
    const close = () => back.remove();
    back.querySelector('[data-close]').onclick = close;
    back.onclick = (e) => e.target === back && close();
    for (const btn of buttons) {
      const x = document.createElement('button');
      x.className = `btn ${btn.primary ? 'primary' : ''}`;
      x.textContent = btn.label;
      x.onclick = async () => {
        if (btn.run && (await btn.run(back)) === false) return;
        close();
      };
      back.querySelector('footer').appendChild(x);
    }
    root.appendChild(back);
    return back;
  }

  palette() {
    const list = [...this.commands.values()].filter((c) => can(this.role, c.perm ?? 'model.edit'));
    const m = this.modal(t('t_palette'), `<input class="search" style="width:100%" id="pal-q" placeholder="Buyruq nomi yoki qisqa kod…"><div class="palette-list" id="pal-l"></div>`, []);
    const q = m.querySelector('#pal-q');
    const l = m.querySelector('#pal-l');
    let hl = 0;
    let items = list;
    const draw = () => {
      const s = q.value.toLowerCase();
      items = list.filter((c) => !s || c.label.toLowerCase().includes(s) || (c.key ?? '').toLowerCase().includes(s) || c.id.includes(s)).slice(0, 60);
      hl = Math.min(hl, items.length - 1);
      l.innerHTML = items.map((c, i) => `<div class="palette-item ${i === hl ? 'hl' : ''}" data-i="${i}"><span>${esc(c.label)}</span><span class="muted">${esc(c.key ?? '')}</span></div>`).join('');
    };
    q.oninput = () => {
      hl = 0;
      draw();
    };
    q.onkeydown = (e) => {
      if (e.key === 'ArrowDown') hl = Math.min(items.length - 1, hl + 1);
      else if (e.key === 'ArrowUp') hl = Math.max(0, hl - 1);
      else if (e.key === 'Enter' && items[hl]) {
        m.remove();
        this.run(items[hl].id);
        return;
      } else if (e.key === 'Escape') return m.remove();
      else return;
      e.preventDefault();
      draw();
    };
    l.onclick = (e) => {
      const d = e.target.closest('[data-i]');
      if (!d) return;
      m.remove();
      this.run(items[Number(d.dataset.i)].id);
    };
    draw();
    q.focus();
  }

  assistant(initial) {
    const m = this.modal(`${t('t_ai')} — muhandislik yordamchisi`, `<div class="chat" id="chat"></div><div style="display:flex;gap:6px;margin-top:10px"><input class="search" style="flex:1" id="ai-q" placeholder="Masalan: Barcha yotoqxonalarga radiator qo‘y"><button class="btn primary" id="ai-go">→</button></div><p class="muted" style="font-size:11px">Yordamchi hisoblarni o‘zi o‘ylab topmaydi: javoblar model va deterministik hisob natijalariga asoslanadi; yetishmayotgan parametrlarni so‘raydi.</p>`, []);
    const chat = m.querySelector('#chat');
    const q = m.querySelector('#ai-q');
    const say = (text, who) => {
      const d = document.createElement('div');
      d.className = `msg ${who}`;
      d.textContent = text;
      chat.appendChild(d);
      chat.scrollTop = chat.scrollHeight;
      return d;
    };
    const ask = (text) => {
      if (!text.trim()) return;
      say(text, 'user');
      const r = interpret(text, this);
      const d = say(r.reply, 'bot');
      if (r.select) this.store.select(r.select);
      if (r.view) this.showView(r.view);
      if (r.changes) {
        const b = document.createElement('button');
        b.className = 'btn primary small';
        b.style.marginTop = '6px';
        b.textContent = 'Bajarish';
        b.onclick = () => {
          this.store.apply(r.changes.cs, r.changes.label);
          b.disabled = true;
          b.textContent = 'Bajarildi ✓';
        };
        d.appendChild(document.createElement('br'));
        d.appendChild(b);
      }
    };
    say('Salom! Loyiha bo‘yicha savol bering yoki buyruq yozing.', 'bot');
    m.querySelector('#ai-go').onclick = () => {
      ask(q.value);
      q.value = '';
    };
    q.onkeydown = (e) => {
      if (e.key === 'Enter') {
        ask(q.value);
        q.value = '';
      }
    };
    if (initial) ask(initial);
    q.focus();
  }

  telegramDialog(text) {
    const p = this.store.project;
    const body = `<div class="prop"><label>Bot token</label><input id="tg-token" value="${esc(localStore('zodpro.tg.token') ?? '')}"><span></span></div>
      <div class="prop"><label>Chat ID</label><input id="tg-chat" value="${esc(localStore('zodpro.tg.chat') ?? '')}"><span></span></div>
      <div class="btn-row"><button class="btn small" data-m="materials">Materiallar</button><button class="btn small" data-m="status">Holat</button><button class="btn small" data-m="issues">Muammolar</button></div>
      <textarea id="tg-text" rows="12" style="width:100%">${esc(text ?? '')}</textarea>`;
    const m = this.modal('Telegram', body, [
      { label: 'Nusxalash', run: (b) => (navigator.clipboard?.writeText(b.querySelector('#tg-text').value), this.toast('Nusxalandi'), false) },
      {
        label: 'Yuborish',
        primary: true,
        run: async (b) => {
          const token = b.querySelector('#tg-token').value.trim();
          const chatId = b.querySelector('#tg-chat').value.trim();
          try {
            localStorage.setItem('zodpro.tg.chat', chatId);
          } catch {
            /* ignore */
          }
          try {
            await sendTelegram({ token, chatId, text: b.querySelector('#tg-text').value });
            this.toast('Telegramga yuborildi');
          } catch (err) {
            this.toast(`Telegram: ${err.message}`, 'error');
            return false;
          }
        },
      },
    ]);
    import('../core/integrations.js').then(({ materialListText, statusText }) => {
      m.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => {
        const res = this.store.results;
        const k = b.dataset.m;
        m.querySelector('#tg-text').value = k === 'materials' ? materialListText(p, res) : k === 'status' ? statusText(p, res) : p.issues.filter((i) => i.status !== 'closed').map((i) => `• ${i.id} [${i.priority}] ${i.description}`).join('\n') || 'Ochiq muammo yo‘q';
      }));
      if (!text) m.querySelector('[data-m="status"]').click();
    });
  }

  openQuotation() {
    const p = this.store.project;
    const res = this.store.results;
    const c = res.cost;
    const rows = res.bom.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.article)}</td><td>${esc(r.unit)}</td><td class="n">${+r.purchase.toFixed(2)}</td><td class="n">${f0(r.unitUsd * c.rate)}</td><td class="n">${f0(r.totalUsd * c.rate)}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Tijorat taklifi ${esc(p.meta.number)}</title><style>body{font:13px system-ui;margin:30px;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:4px 6px}th{background:#eef}.n{text-align:right}h1{color:#1e6ef2}</style></head><body>
      <h1>ZODPRO</h1><h2>Tijorat taklifi № ${esc(p.meta.number)}-Q</h2><p>Buyurtmachi: <b>${esc(p.meta.client)}</b><br>Obyekt: ${esc(p.meta.name)}, ${esc(p.meta.address)}<br>Sana: ${new Date().toISOString().slice(0, 10)}</p>
      <p>Isitish tizimi: ${f0(res.totals.heatLoss)} W, ${Object.keys(res.radiators).length} radiator, qozon ${esc(res.boiler.product?.model ?? '—')}.</p>
      <table><tr><th>#</th><th>Nomi</th><th>Artikul</th><th>Birlik</th><th>Miqdor</th><th>Narx, ${c.currency}</th><th>Summa, ${c.currency}</th></tr>${rows}
      <tr><td colspan="6">Materiallar</td><td class="n">${f0(c.material)}</td></tr><tr><td colspan="6">Montaj ishlari</td><td class="n">${f0(c.labor)}</td></tr><tr><td colspan="6">Transport</td><td class="n">${f0(c.transport)}</td></tr><tr><th colspan="6">JAMI</th><th class="n">${f0(c.total)} ${c.currency}</th></tr></table>
      <p style="font-size:11px">Kurs: 1 USD = ${c.rate} ${c.currency} (${esc(c.ratesDate)}). Taklif 14 kun amal qiladi.</p><script>window.print()<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return download(`${this.fileBase()}_taklif.html`, html, 'text/html');
    w.document.write(html);
    w.document.close();
  }

  async showQR(id) {
    const e = this.store.project.elements[id];
    const res = this.store.results;
    const payload = JSON.stringify({ app: 'ZODPRO', project: this.store.project.meta.number, id: e.id, guid: e.guid, mark: e.mark, cat: e.cat, product: res?.radiators?.[id]?.product?.article ?? res?.pipes?.[id]?.dn ?? '', asBuilt: e.asBuilt?.installed ?? false });
    let svg = '';
    try {
      const mod = await import('../../vendor/qrcode.mjs');
      const qrcode = mod.default ?? mod;
      const qr = qrcode(0, 'M');
      qr.addData(payload);
      qr.make();
      svg = qr.createSvgTag({ cellSize: 4, margin: 2 });
    } catch (err) {
      svg = `<p class="muted">QR kutubxonasi yuklanmadi (internet). Ma’lumot:</p>`;
    }
    const issues = this.store.project.issues.filter((i) => i.elementId === id);
    this.modal(`QR — ${e.mark || e.cat}`, `<div style="text-align:center">${svg}</div><pre style="white-space:pre-wrap;font-size:11px">${esc(payload)}</pre><p>Muammolar: ${issues.length} · Tarix: ${(e.asBuilt?.updated ?? '—')}</p>`);
  }

  pluginsDialog() {
    const list = [...this.plugins.plugins.values()];
    this.modal('Plaginlar', `<p>Plagin API ${esc('1.0')}: manifest (id, name, version, apiVersion, permissions) + activate(api). Konsol orqali: <code>ZODPRO.register({...}, api =&gt; ...)</code></p>
      <table class="tbl"><tr><th>ID</th><th>Nomi</th><th>Versiya</th><th>Ruxsatlar</th></tr>${list.map((x) => `<tr><td>${esc(x.manifest.id)}</td><td>${esc(x.manifest.name)}</td><td>${esc(x.manifest.version)}</td><td>${esc((x.manifest.permissions ?? []).join(', '))}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">O‘rnatilmagan</td></tr>'}</table>
      <p class="muted">Kengaytirish nuqtalari: buyruqlar (ui.command), model o‘qish/yozish, hodisalar (change, command).</p>`, [
      {
        label: 'Namuna plagin',
        run: () => {
          if (this.plugins.plugins.has('sample.pipe-summary')) return;
          this.plugins.register({ id: 'sample.pipe-summary', name: 'Quvur xulosasi', version: '1.0.0', apiVersion: '1.0', permissions: ['model.read', 'ui.command'] }, (api) => {
            api.addCommand({ id: 'summary', label: 'Quvur xulosasi', icon: 'plugin', perm: 'view', run: () => api.toast(`${Object.keys(api.getResults().pipes).length} quvur, ${api.getResults().totals.pipeLength.toFixed(1)} m`) });
          });
          this.renderRibbon();
          this.toast('Namuna plagin o‘rnatildi (Buyruqlar palitrasida "Quvur xulosasi")');
        },
      },
      { label: 'Yopish' },
    ]);
  }

  errorLog() {
    this.modal('Xatolar jurnali', ERROR_LOG.length ? `<table class="tbl"><tr><th>ID</th><th>Vaqt</th><th>Hisob</th><th>Xabar</th></tr>${ERROR_LOG.map((e) => `<tr><td>${e.id}</td><td>${e.timestamp}</td><td>${esc(e.calculation)}</td><td>${esc(e.message)}</td></tr>`).join('')}</table>` : '<p>Xatolar qayd etilmagan.</p>', [
      { label: 'JSON yuklab olish', run: () => download('zodpro-errors.json', JSON.stringify(ERROR_LOG, null, 2), 'application/json') },
      { label: 'Yopish' },
    ]);
  }

  // ======================= preferences =======================
  setLang(l) {
    setLang(l);
    this.lang = l;
    this.commands.clear();
    this.registerCommands();
    this.buildShell();
    this.refresh();
  }

  applyTheme() {
    if (this.theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', this.theme);
  }

  setTheme(th) {
    this.theme = th;
    try {
      localStorage.setItem('zodpro.theme', th);
    } catch {
      /* ignore */
    }
    this.applyTheme();
    this.plan.readColors();
    this.plan.draw();
    this.toast(`${t('t_theme')}: ${th}`);
  }

  setRole(r) {
    this.role = r;
    try {
      localStorage.setItem('zodpro.role', r);
    } catch {
      /* ignore */
    }
    this.buildShell();
    this.toast(`Rol: ${ROLES[r].name}`);
  }

  setWorkspace(ws) {
    const w = $('#workspace');
    w.classList.remove('hide-left', 'hide-right');
    w.style.gridTemplateColumns = '';
    if (ws === 'drafting') w.classList.add('hide-left', 'hide-right');
    if (ws === 'engineering') w.classList.add('hide-left');
    setTimeout(() => this.plan.resize(), 50);
  }

  setTelemetry(on) {
    this.telemetry = on;
    try {
      localStorage.setItem('zodpro.telemetry', on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  startAutosave() {
    clearInterval(this._as);
    const min = Math.max(1, this.store.project.settings.autosaveMin ?? 3);
    this._as = setInterval(() => {
      this.store.autosave();
    }, min * 60000);
    this.store.on('autosaved', () => {
      $('#status-info').textContent = `${t('autosaved')} ${new Date().toLocaleTimeString()} · ${this.statusBase ?? ''}`;
    });
  }
}

function localStore(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

try {
  window.app = new App();
} catch (err) {
  console.error(err);
  document.body.insertAdjacentHTML('afterbegin', `<div style="padding:20px;color:#b00">ZODPRO ishga tushmadi: ${String(err.message)}</div>`);
}

export { App, pointInPolygon, levelById };
