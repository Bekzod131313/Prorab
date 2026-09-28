// Project browser (left) and Properties / Calculation / System panels (right).
import { elementsOf, sortedLevels, levelById, roomTemp, isHeated, roomType } from '../core/model.js';
import { ROOM_TYPES, CLIMATE } from '../data/climate.js';
import { ASSEMBLIES, OPENING_TYPES, assemblyU } from '../data/materials.js';
import { PIPE_MATERIALS, BOILERS, PUMPS } from '../data/products.js';
import { REGIMES } from '../engines/radiator.js';
import { catalogOf } from '../engines/calc.js';
import { t, msg } from '../core/i18n.js';
import { esc, f0, f1, f2 } from './reports.js';

const CAT_ICON = { wall: '▭', window: '⊞', door: '⌸', room: '▢', radiator: '▥', pipe: '╱', riser: '◉', collector: '☰', boiler: '▣', pump: '◎', thermostat: 'T', obstacle: '▨', text: 'A', dim: '↔', dline: '∕', circle: '○', section: '✂' };

// ======================= left panel =======================
export function renderBrowser(el, app, tab) {
  const { store } = app;
  const p = store.project;
  const res = store.results;
  if (tab === 'library') return renderLibraryMini(el, app);
  if (tab === 'filter') return renderFilter(el, app);
  const selIds = store.selection;
  const node = (id, label, icon, badge = '', cls = '') => `<div class="node ${selIds.has(id) ? 'sel' : ''} ${cls}" data-id="${esc(id)}"><span class="tw"></span><span class="ic">${icon}</span><span>${esc(label)}</span><span class="badge">${esc(badge)}</span></div>`;
  const group = (key, label, icon, inner, badge = '', open = true) => `<li class="${app.collapsed.has(key) || !open ? 'collapsed' : ''}" data-key="${key}"><div class="node grp" data-toggle="${key}"><span class="tw">${app.collapsed.has(key) ? '▸' : '▾'}</span><span class="ic">${icon}</span><span>${esc(label)}</span><span class="badge">${esc(badge)}</span></div><ul>${inner}</ul></li>`;
  let levels = '';
  for (const l of sortedLevels(p)) {
    const rooms = elementsOf(p, 'room', l.id).sort((a, b) => String(a.number).localeCompare(String(b.number)));
    let inner = '';
    for (const r of rooms) {
      const hl = res?.rooms?.[r.id];
      const cov = hl?.emitters?.coverage;
      const dot = isHeated(r) && hl?.required > 0 ? `<span class="dot" style="background:${cov >= 0.95 ? 'var(--ok)' : 'var(--err)'}"></span>` : '';
      const items = elementsOf(p, 'radiator', l.id).filter((x) => res?.radiators?.[x.id]?.roomId === r.id).map((x) => `<li>${node(x.id, `${x.mark} ${res?.radiators?.[x.id]?.product?.model ?? ''}`, CAT_ICON.radiator, `${f0(res?.radiators?.[x.id]?.output)} W`)}</li>`).join('');
      inner += `<li class="${app.collapsed.has(r.id) ? 'collapsed' : ''}"><div class="node ${selIds.has(r.id) ? 'sel' : ''}" data-id="${r.id}"><span class="tw" data-toggle="${r.id}">${items ? (app.collapsed.has(r.id) ? '▸' : '▾') : ''}</span><span class="ic">${CAT_ICON.room}</span><span>${esc(r.number)} ${esc(r.name)}</span><span class="badge">${dot} ${hl ? f0(hl.required) + ' W' : ''}</span></div><ul>${items}</ul></li>`;
    }
    const equip = ['collector', 'boiler', 'pump', 'thermostat'].flatMap((c) => elementsOf(p, c, l.id)).map((x) => `<li>${node(x.id, `${x.mark || x.cat} ${x.cat === 'collector' ? `×${x.outlets}${x.kind === 'ufh' ? ' TP' : ''}` : ''}`, CAT_ICON[x.cat])}</li>`).join('');
    levels += `<li class="${app.collapsed.has(l.id) ? 'collapsed' : ''}"><div class="node ${store.activeLevelId === l.id ? 'sel' : ''}" data-level="${l.id}"><span class="tw" data-toggle="${l.id}">${app.collapsed.has(l.id) ? '▸' : '▾'}</span><span class="ic">▤</span><span>${esc(l.name)}</span><span class="badge">${l.elevation >= 0 ? '+' : ''}${l.elevation.toFixed(3)}</span></div><ul>${inner}${equip}</ul></li>`;
  }
  const pipes = (sys) => elementsOf(p, 'pipe').filter((x) => (x.system ?? 'supply') === sys);
  const sysInner = [
    ['supply', `🔥 Isitish — ${t('supply')}`, pipes('supply')],
    ['return', `🔥 Isitish — ${t('return')}`, pipes('return')],
  ].map(([k, label, list]) => group(`sys_${k}`, label, '', list.map((x) => `<li>${node(x.id, `${x.mark} Ø${res?.pipes?.[x.id]?.dn ?? x.dn ?? '?'} ${x.material ?? ''}`, CAT_ICON.pipe, `${f1(res?.pipes?.[x.id]?.length)} m`)}</li>`).join(''), `${list.length}`, false)).join('') +
    group('sys_ufh', `〰 ${t('ufh')}`, '', Object.values(res?.ufh ?? {}).map((u) => `<li>${node(u.roomId, `${p.elements[u.roomId]?.name}: ${u.loops}×${u.loopLength.toFixed(0)} m`, '〰')}</li>`).join(''), `${Object.keys(res?.ufh ?? {}).length}`, false) +
    group('sys_riser', t('t_riser'), '', elementsOf(p, 'riser').map((x) => `<li>${node(x.id, `${x.mark} ${t(x.system)} Ø${res?.pipes?.[x.id]?.dn ?? ''}`, CAT_ICON.riser)}</li>`).join(''), `${elementsOf(p, 'riser').length}`, false) +
    `<li><div class="node muted">💧 Issiq suv (DHW) — ${p.settings.dhwKw ? p.settings.dhwKw + ' kVt' : 'rejalashtirilgan'}</div></li>`;
  const views = [['plan', t('v_plan')], ['3d', t('v_3d')], ['schema', t('v_schema')], ['riser', t('v_riser')], ['section', 'Kesimlar']].map(([k, label]) => `<li><div class="node" data-view="${k}"><span class="tw"></span><span class="ic">◧</span><span>${esc(label)}</span></div></li>`).join('');
  const sched = [['schedules', t('v_schedules')], ['reports', t('v_reports')]].map(([k, label]) => `<li><div class="node" data-view="${k}"><span class="tw"></span><span class="ic">▦</span><span>${esc(label)}</span></div></li>`).join('');
  const sheets = `<li><div class="node" data-view="sheets"><span class="tw"></span><span class="ic">▭</span><span>${t('v_sheets')} (A-001, H-001…)</span></div></li>`;
  el.innerHTML = `<ul class="tree">
    ${group('proj', p.meta.name, '📁', `
      ${group('site', 'SITE / BINO', '🏠', levels)}
      ${group('systems', t('p_systems'), '⚙', sysInner)}
      ${group('views', t('p_views'), '◧', views)}
      ${group('schedules', 'Jadvallar', '▦', sched)}
      ${group('sheets', 'Varaqlar', '▭', sheets)}
      <li><div class="node" data-view="issues"><span class="tw"></span><span class="ic">!</span><span>${t('v_issues')}</span><span class="badge">${p.issues.filter((i) => i.status !== 'closed').length}</span></div></li>
    `)}
  </ul>`;
  el.onclick = (e) => {
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      const k = tg.dataset.toggle;
      if (app.collapsed.has(k)) app.collapsed.delete(k);
      else app.collapsed.add(k);
      renderBrowser(el, app, tab);
      return;
    }
    const n = e.target.closest('.node');
    if (!n) return;
    if (n.dataset.level) {
      store.setLevel(n.dataset.level);
      app.showView('plan');
    } else if (n.dataset.view) app.showView(n.dataset.view);
    else if (n.dataset.id) app.focusElement(n.dataset.id, e.shiftKey);
  };
}

function renderLibraryMini(el, app) {
  const cat = catalogOf(app.store.project);
  el.innerHTML = `<p class="muted">Faol radiator turi (joylashtirishda qo‘llanadi) va to‘liq katalog "Kutubxona" ko‘rinishida.</p>
    <div class="prop"><label>Radiator turi</label><select id="lib-kind"><option value="panel">Panel</option><option value="sectional">Seksiyali</option></select><span></span></div>
    <div class="prop"><label>Panel tipi</label><select id="lib-type">${[11, 21, 22, 33].map((x) => `<option ${x === 22 ? 'selected' : ''}>${x}</option>`).join('')}</select><span></span></div>
    <div class="btn-row"><button class="btn small" data-v="library">Katalogni ochish</button></div>
    <h4>Mahsulotlar soni</h4><div class="kv"><span>Radiatorlar</span><span>${cat.length}</span><span>Qozonlar</span><span>${BOILERS.length}</span><span>Nasoslar</span><span>${PUMPS.length}</span><span>Quvur materiallari</span><span>${Object.keys(PIPE_MATERIALS).length}</span></div>`;
  el.querySelector('[data-v]').onclick = () => app.showView('library');
  el.querySelector('#lib-kind').onchange = (e) => (app.radiatorPref.kind = e.target.value);
  el.querySelector('#lib-type').onchange = (e) => (app.radiatorPref.type = Number(e.target.value));
}

function renderFilter(el, app) {
  const { store } = app;
  const p = store.project;
  const f = app.filter;
  const cats = ['radiator', 'pipe', 'riser', 'collector', 'room', 'wall', 'window', 'door', 'boiler', 'pump', 'thermostat'];
  const dns = [...new Set(Object.values(store.results?.pipes ?? {}).map((x) => x.dn))].sort((a, b) => a - b);
  el.innerHTML = `
    <div class="prop"><label>Kategoriya</label><select data-f="cat"><option value="">—</option>${cats.map((c) => `<option ${f.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select><span></span></div>
    <div class="prop"><label>${t('level')}</label><select data-f="level"><option value="">—</option>${p.levels.map((l) => `<option value="${l.id}" ${f.level === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select><span></span></div>
    <div class="prop"><label>${t('system')}</label><select data-f="system"><option value="">—</option><option ${f.system === 'supply' ? 'selected' : ''} value="supply">${t('supply')}</option><option ${f.system === 'return' ? 'selected' : ''} value="return">${t('return')}</option></select><span></span></div>
    <div class="prop"><label>${t('diameter')}</label><select data-f="dn"><option value="">—</option>${dns.map((d) => `<option ${f.dn === d ? 'selected' : ''}>${d}</option>`).join('')}</select><span></span></div>
    <div class="prop"><label>${t('material')}</label><select data-f="material"><option value="">—</option>${Object.keys(PIPE_MATERIALS).map((m) => `<option ${f.material === m ? 'selected' : ''}>${m}</option>`).join('')}</select><span></span></div>
    <div class="prop"><label>Holat</label><select data-f="status"><option value="">—</option>${['ok', 'warning', 'critical', 'low', 'error'].map((s) => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select><span></span></div>
    <div class="prop"><label>Matn</label><input data-f="text" value="${esc(f.text ?? '')}" placeholder="belgi, artikul, nom…"><span></span></div>
    <div class="btn-row"><button class="btn primary small" id="flt-sel">Hammasini tanlash</button><button class="btn small" id="flt-clear">Tozalash</button></div>
    <div class="btn-row"><button class="btn small" data-q="radiator">Barcha radiatorlar</button><button class="btn small" data-q="dn20">Barcha DN20</button><button class="btn small" data-q="valve">Barcha klapanlar</button><button class="btn small" data-q="loops">Barcha konturlar</button></div>
    <div id="flt-res" class="muted"></div>`;
  const matches = () => app.filterMatches(f);
  const upd = () => (el.querySelector('#flt-res').textContent = `${matches().length} ta mos element`);
  el.querySelectorAll('[data-f]').forEach((i) => (i.oninput = () => {
    f[i.dataset.f] = i.value || undefined;
    upd();
  }));
  el.querySelector('#flt-sel').onclick = () => {
    store.select(matches());
    app.toast(`${store.selection.size} ta element tanlandi — o‘ng panelda ommaviy tahrirlash mumkin`);
  };
  el.querySelector('#flt-clear').onclick = () => {
    app.filter = {};
    renderFilter(el, app);
  };
  el.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => {
    const q = b.dataset.q;
    let ids = [];
    if (q === 'radiator') ids = elementsOf(p, 'radiator').map((x) => x.id);
    if (q === 'dn20') ids = Object.values(store.results?.pipes ?? {}).filter((x) => x.dn === '20').map((x) => x.elementId);
    if (q === 'valve') ids = elementsOf(p, 'radiator').map((x) => x.id); // valves are radiator-hosted
    if (q === 'loops') ids = Object.keys(store.results?.ufh ?? {});
    store.select(ids);
    app.toast(`${ids.length} ta element tanlandi`);
  }));
  upd();
}

// ======================= right panel =======================
function fieldsFor(el, p, res) {
  const lvOpts = p.levels.map((l) => [l.id, l.name]);
  const common = [{ k: 'mark', l: t('mark'), type: 'text' }];
  switch (el.cat) {
    case 'room': {
      const cols = elementsOf(p, 'collector', el.levelId).filter((c) => c.kind === 'ufh').map((c) => [c.id, c.mark || c.id]);
      return [
        { k: 'name', l: t('name'), type: 'text' },
        { k: 'number', l: t('number'), type: 'text' },
        { k: 'roomType', l: t('type'), type: 'select', opts: Object.keys(ROOM_TYPES).map((k) => [k, k]) },
        { k: 'tIn', l: t('t_in'), type: 'number', u: '°C', ph: roomType(el).tIn },
        { k: 'height', l: t('height'), type: 'number', u: 'm', ph: levelById(p, el.levelId)?.height },
        { k: 'heated', l: t('heated'), type: 'check', def: roomType(el).heated },
        { k: 'heating', l: t('heating'), type: 'select', opts: [['radiator', t('radiator')], ['ufh', t('ufh')], ['mixed', t('mixed')], ['none', t('none')]] },
        { k: 'ach', l: 'Havo almashinuvi', type: 'number', u: '1/h', ph: roomType(el).ach },
        { k: 'infiltrationAch', l: 'Infiltratsiya', type: 'number', u: '1/h', ph: p.settings.infiltrationAch },
        ...(el.heating === 'ufh' || el.heating === 'mixed'
          ? [
              { k: 'ufh.collectorId', l: 'TP kollektori', type: 'select', opts: [['', '—'], ...cols] },
              { k: 'ufh.spacing', l: 'Quvur qadami', type: 'select', opts: [['', t('auto')], ['0.1', '100 mm'], ['0.15', '150 mm'], ['0.2', '200 mm'], ['0.25', '250 mm'], ['0.3', '300 mm']], num: true },
              { k: 'ufh.pattern', l: 'Yotqizish sxemasi', type: 'select', opts: [['auto', 'Avto (spiral)'], ['spiral', 'Spiral (ulitka)'], ['double_serpentine', 'Ikki qatorli zmeyka'], ['serpentine', 'Ilon (zmeyka)']] },
            ]
          : []),
        { k: 'floorAssembly', l: 'Pol konstruksiyasi', type: 'select', opts: [['', '— standart'], ...Object.entries(ASSEMBLIES).filter(([, a]) => a.kind === 'floor').map(([k, a]) => [k, a.name])] },
      ];
    }
    case 'wall':
      return [...common, { k: 'exterior', l: t('exterior'), type: 'check' }, { k: 'thickness', l: t('thickness'), type: 'number', u: 'm' }, { k: 'assembly', l: t('assembly'), type: 'select', opts: Object.entries(ASSEMBLIES).filter(([, a]) => a.kind === 'wall').map(([k, a]) => [k, a.name]) }];
    case 'window':
    case 'door':
      return [...common, { k: 'type', l: t('type'), type: 'select', opts: Object.entries(OPENING_TYPES).filter(([, o]) => o.kind === el.cat).map(([k, o]) => [k, `${o.name} (U=${o.U})`]) }, { k: 'width', l: t('width'), type: 'number', u: 'm' }, { k: 'height', l: t('height'), type: 'number', u: 'm' }, { k: 'sill', l: t('sill'), type: 'number', u: 'm' }, { k: 'offset', l: 'Devor bo‘yicha', type: 'number', u: 'm' }, ...(el.cat === 'door' ? [{ k: 'swing', l: 'Ochilish', type: 'select', opts: [['in', 'ichkariga'], ['out', 'tashqariga']] }] : [])];
    case 'radiator': {
      const cat = catalogOf(p).filter((r) => (el.prefKind ?? 'panel') === r.kind && (!el.prefType || el.prefKind === 'sectional' || String(r.type) === String(el.prefType)));
      return [
        ...common,
        { k: 'selection', l: t('selection'), type: 'select', opts: [['auto', t('auto')], ['manual', t('manual')]] },
        { k: 'prefKind', l: 'Turi', type: 'select', opts: [['panel', 'Panel'], ['sectional', 'Seksiyali']] },
        ...(el.prefKind !== 'sectional' ? [{ k: 'prefType', l: 'Panel tipi', type: 'select', opts: [['11', '11'], ['21', '21'], ['22', '22'], ['33', '33']], num: true }] : []),
        { k: 'prefHeight', l: 'Balandlik', type: 'select', opts: [['', t('auto')], ['0.3', '300'], ['0.5', '500'], ['0.6', '600'], ['0.9', '900']], num: true },
        ...(el.selection === 'manual' ? [{ k: 'productId', l: t('product'), type: 'select', opts: cat.map((r) => [r.id, `${r.model} — ${r.q75} W`]) }] : []),
        { k: 'mountHeight', l: 'Poldan balandlik', type: 'number', u: 'm' },
        { k: 'angle', l: t('angle'), type: 'number', u: '°' },
        { k: 'flip', l: 'Ulanishni almashtirish', type: 'check' },
        { k: 'valves', l: 'Klapanlar (TRV + balans)', type: 'check', def: true },
      ];
    }
    case 'pipe': {
      const mat = el.material ?? p.settings.pipeMaterial;
      return [...common, { k: 'system', l: t('system'), type: 'select', opts: [['supply', t('supply')], ['return', t('return')]] }, { k: 'material', l: t('material'), type: 'select', opts: Object.entries(PIPE_MATERIALS).map(([k, m]) => [k, m.name]) }, { k: 'autoSize', l: 'Avto diametr', type: 'check', def: true }, ...(el.autoSize === false ? [{ k: 'dn', l: t('diameter'), type: 'select', opts: PIPE_MATERIALS[mat].sizes.map((s) => [s.dn, `Ø${s.dn}`]) }] : []), { k: 'elevation', l: t('elevation'), type: 'number', u: 'm' }, { k: 'insulated', l: 'Izolyatsiya', type: 'check' }, { k: 'zetaExtra', l: 'Qo‘shimcha Σζ', type: 'number' }];
    }
    case 'riser': {
      const mat = el.material ?? p.settings.pipeMaterial;
      return [...common, { k: 'system', l: t('system'), type: 'select', opts: [['supply', t('supply')], ['return', t('return')]] }, { k: 'levelFrom', l: 'Qavatdan', type: 'select', opts: lvOpts }, { k: 'levelTo', l: 'Qavatgacha', type: 'select', opts: lvOpts }, { k: 'material', l: t('material'), type: 'select', opts: Object.entries(PIPE_MATERIALS).map(([k, m]) => [k, m.name]) }, { k: 'autoSize', l: 'Avto diametr', type: 'check', def: true }, ...(el.autoSize === false ? [{ k: 'dn', l: t('diameter'), type: 'select', opts: PIPE_MATERIALS[mat].sizes.map((s) => [s.dn, `Ø${s.dn}`]) }] : []), { k: 'x', l: 'X', type: 'number', u: 'm' }, { k: 'y', l: 'Y', type: 'number', u: 'm' }];
    }
    case 'collector':
      return [...common, { k: 'kind', l: t('kind'), type: 'select', opts: [['radiator', 'Radiator'], ['ufh', t('ufh')]] }, { k: 'outlets', l: t('outlets'), type: 'number' }, ...(el.kind === 'ufh' ? [{ k: 'mixing', l: 'Aralashtirish uzeli', type: 'check', def: true }] : []), { k: 'angle', l: t('angle'), type: 'number', u: '°' }];
    case 'boiler':
      return [...common, { k: 'productId', l: t('product'), type: 'select', opts: [['', `${t('auto')} (${res?.boiler?.boiler?.model ?? '—'})`], ...BOILERS.map((b) => [b.id, b.model])] }, { k: 'angle', l: t('angle'), type: 'number', u: '°' }];
    case 'pump':
      return [...common, { k: 'productId', l: t('product'), type: 'select', opts: [['', `${t('auto')}`], ...PUMPS.map((b) => [b.id, b.model])] }, { k: 'angle', l: t('angle'), type: 'number', u: '°' }];
    case 'thermostat':
      return [...common, { k: 'kind', l: t('kind'), type: 'select', opts: [['room', 'Xona termostati'], ['zone', 'Zona termostati'], ['smart', 'Aqlli termostat']] }, { k: 'setpoint', l: 'Setpoint', type: 'number', u: '°C' }];
    case 'obstacle':
      return [...common, { k: 'kind', l: t('kind'), type: 'select', opts: [['beam', 'Balka'], ['duct', 'Havo kanali'], ['cable_tray', 'Kabel lotok'], ['structure', 'Konstruksiya'], ['plumbing', 'Suv quvuri']] }, { k: 'width', l: t('width'), type: 'number', u: 'm' }, { k: 'zBottom', l: 'Pastki belgi', type: 'number', u: 'm' }, { k: 'zTop', l: 'Yuqori belgi', type: 'number', u: 'm' }];
    case 'text':
      return [{ k: 'text', l: 'Matn', type: 'text' }, { k: 'size', l: 'Balandlik', type: 'number', u: 'm' }];
    case 'dim':
      return [{ k: 'offset', l: 'Offset', type: 'number', u: 'm' }];
    case 'gridline':
      return [{ k: 'name', l: 'O‘q nomi', type: 'text' }, { k: 'pos', l: 'Holati', type: 'number', u: 'm' }];
    case 'section':
      return [{ k: 'name', l: t('name'), type: 'text' }, { k: 'depth', l: 'Chuqurlik', type: 'number', u: 'm' }];
    default:
      return common;
  }
}

const getPath = (o, path) => path.split('.').reduce((a, k) => (a ? a[k] : undefined), o);
function setPathPatch(el, path, value) {
  const keys = path.split('.');
  if (keys.length === 1) return { [path]: value };
  const top = keys[0];
  const obj = JSON.parse(JSON.stringify(el[top] ?? {}));
  let o = obj;
  for (let i = 1; i < keys.length - 1; i++) o = o[keys[i]] ??= {};
  o[keys[keys.length - 1]] = value;
  return { [top]: obj };
}

function fieldHTML(f, value) {
  const v = value ?? '';
  if (f.type === 'check') return `<input type="checkbox" data-k="${f.k}" data-type="check" ${value ?? f.def ? 'checked' : ''} style="width:auto">`;
  if (f.type === 'select') return `<select data-k="${f.k}" data-type="select" ${f.num ? 'data-num="1"' : ''}>${f.opts.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  if (f.type === 'number') return `<input type="number" step="any" data-k="${f.k}" data-type="number" value="${esc(v)}" placeholder="${esc(f.ph ?? '')}">`;
  return `<input type="text" data-k="${f.k}" data-type="text" value="${esc(v)}">`;
}

export function renderProperties(el, app, tab) {
  const { store } = app;
  const p = store.project;
  const res = store.results;
  const sel = store.selected;
  if (tab === 'system') return renderSystem(el, app);
  if (tab === 'calc') return renderCalcTab(el, app, sel);
  if (!sel.length) {
    el.innerHTML = projectSummary(p, res);
    return;
  }
  const first = sel[0];
  const same = sel.every((x) => x.cat === first.cat);
  if (!same) {
    const counts = {};
    for (const x of sel) counts[x.cat] = (counts[x.cat] ?? 0) + 1;
    el.innerHTML = `<div class="sect"><h4>${t('multi_selection', { n: sel.length })}</h4><div class="sect-body kv">${Object.entries(counts).map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')}</div></div><div class="btn-row"><button class="btn small" data-act="delete">${t('t_delete')}</button></div>`;
    el.querySelector('[data-act]').onclick = () => app.run('delete');
    return;
  }
  const fields = fieldsFor(first, p, res);
  const multi = sel.length > 1;
  const valueOf = (f) => {
    const vals = sel.map((x) => getPath(x, f.k));
    return vals.every((v) => JSON.stringify(v) === JSON.stringify(vals[0])) ? vals[0] : undefined;
  };
  let h = `<div class="sect"><h4>${multi ? t('multi_selection', { n: sel.length }) + ' · ' : ''}${esc(first.cat)} ${esc(multi ? '' : first.mark || first.name || '')}</h4><div class="sect-body">`;
  h += `<div class="prop"><label>ID / GUID</label><input readonly value="${esc(multi ? '—' : first.guid)}"><span></span></div>`;
  if (!multi && first.levelId) h += `<div class="prop"><label>${t('level')}</label><input readonly value="${esc(levelById(p, first.levelId)?.name)}"><span></span></div>`;
  for (const f of fields) h += `<div class="prop"><label title="${esc(f.k)}">${esc(f.l)}</label>${fieldHTML(f, valueOf(f))}<span class="u">${esc(f.u ?? '')}</span></div>`;
  h += '</div></div>';
  // custom parameters
  if (!multi) {
    const custom = first.custom ?? {};
    h += `<div class="sect closed"><h4>${t('custom')}</h4><div class="sect-body">${Object.entries(custom).map(([k, v]) => `<div class="prop"><label>${esc(k)}</label><input data-custom="${esc(k)}" value="${esc(v)}"><span></span></div>`).join('')}<div class="btn-row"><button class="btn small" data-act="addparam">+ parametr</button></div></div></div>`;
    h += elementResults(first, p, res);
    h += `<div class="btn-row"><button class="btn small" data-act="issue">+ Muammo</button><button class="btn small" data-act="qr">QR kod</button><button class="btn small" data-act="zoom">Ko‘rsatish</button><button class="btn small" data-act="delete">${t('t_delete')}</button></div>`;
  } else {
    h += `<p class="muted">Ommaviy tahrir: o‘zgartirilgan qiymat barcha ${sel.length} ta elementga qo‘llanadi va bog‘liq hisoblar qayta bajariladi.</p><div class="btn-row"><button class="btn small" data-act="delete">${t('t_delete')}</button></div>`;
  }
  el.innerHTML = h;
  bindSections(el);
  el.querySelectorAll('[data-k]').forEach((inp) => {
    inp.onchange = () => {
      const f = fields.find((x) => x.k === inp.dataset.k);
      let v;
      if (inp.dataset.type === 'check') v = inp.checked;
      else if (inp.dataset.type === 'number') v = inp.value === '' ? null : Number(inp.value);
      else if (inp.dataset.num) v = inp.value === '' ? null : Number(inp.value);
      else v = inp.value === '' && f.type === 'select' ? null : inp.value;
      if (v === null && inp.dataset.type !== 'select') v = undefined;
      const updates = sel.map((x) => {
        const patch = setPathPatch(x, f.k, v === undefined ? null : v);
        if (f.k === 'mark') patch.markLocked = !!v;
        if (f.k === 'heating' && (v === 'ufh' || v === 'mixed') && !x.ufh?.collectorId) {
          // attach to the nearest UFH manifold on the level so the loops are hydraulically connected
          const cols = elementsOf(p, 'collector', x.levelId).filter((c) => c.kind === 'ufh');
          const c0 = x.points.reduce((a, q) => ({ x: a.x + q.x / x.points.length, y: a.y + q.y / x.points.length }), { x: 0, y: 0 });
          cols.sort((a, b) => Math.hypot(a.x - c0.x, a.y - c0.y) - Math.hypot(b.x - c0.x, b.y - c0.y));
          patch.ufh = { ...(x.ufh ?? {}), collectorId: cols[0]?.id ?? null };
          if (!cols.length) app.toast('Qavatda pol isitish kollektori yo‘q — "Pol isitish kollektori" ni joylashtiring', 'error');
        }
        return { id: x.id, patch };
      });
      store.apply({ update: updates }, `edit:${f.k}`);
    };
  });
  el.querySelectorAll('[data-custom]').forEach((inp) => (inp.onchange = () => store.apply({ update: [{ id: first.id, patch: { custom: { ...(first.custom ?? {}), [inp.dataset.custom]: inp.value } } }] }, 'custom')));
  el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => {
    const a = b.dataset.act;
    if (a === 'delete') app.run('delete');
    if (a === 'zoom') app.focusElement(first.id);
    if (a === 'issue') app.newIssue(first.id);
    if (a === 'qr') app.showQR(first.id);
    if (a === 'addparam') {
      const k = await app.ask('Parametr nomi');
      if (k) store.apply({ update: [{ id: first.id, patch: { custom: { ...(first.custom ?? {}), [k]: '' } } }] }, 'custom');
    }
  }));
}

function bindSections(el) {
  el.querySelectorAll('.sect > h4').forEach((h) => (h.onclick = () => h.parentElement.classList.toggle('closed')));
}

function elementResults(e, p, res) {
  if (!res) return '';
  const kv = (rows) => `<div class="kv">${rows.map(([a, b]) => `<span>${esc(a)}</span><span>${esc(b)}</span>`).join('')}</div>`;
  const sect = (title, body) => `<div class="sect"><h4>${esc(title)}</h4><div class="sect-body">${body}</div></div>`;
  if (e.cat === 'room') {
    const hl = res.rooms[e.id];
    if (!hl) return '';
    const u = res.ufh[e.id];
    let b = kv([
      [t('area'), `${f2(hl.inputs.area)} m²`], [t('volume'), `${f1(hl.inputs.volume)} m³`], [t('t_in'), `${hl.inputs.tIn} °C`], ['ΔT', `${hl.inputs.dT} K`],
      [t('transmission'), `${f0(hl.transmission)} W`], [t('ventilation'), `${f0(hl.ventilation)} W`], [t('infiltration'), `${f0(hl.infiltration)} W`], [t('total'), `${f0(hl.total)} W`],
      [t('required'), `${f0(hl.required)} W`], ['W/m²', f0(hl.specific)], [t('radiator'), `${f0(hl.emitters?.radiatorOutput)} W`], [t('ufh'), `${f0(hl.emitters?.ufhOutput)} W`], [t('coverage'), hl.emitters?.coverage ? `${Math.round(hl.emitters.coverage * 100)} %` : '—'],
    ]);
    if (u) b += `<h5>Pol isitish</h5>` + kv([['q', `${f0(u.q)} W/m²`], ['Qadam', `${u.spacing * 1000} mm`], ['Konturlar', `${u.loops} × ${f1(u.loopLength)} m`], ['G', `${f0(u.flowPerLoopLh)} l/h`], ['ΔP', `${f2(u.dpLoop / 1000)} kPa`], ['t pol', `${f1(u.tSurf)} °C`]]);
    b += `<details><summary class="muted">${t('breakdown')} (${hl.lines.length})</summary><table class="tbl">${hl.lines.map((l) => `<tr><td>${esc(l.kind)} ${esc(l.orient ?? '')}</td><td class="n">${f2(l.area)} m²</td><td class="n">${f2(l.U)}</td><td class="n">${f0(l.Q)} W</td></tr>`).join('')}</table></details>`;
    return sect(t('calc_results'), b);
  }
  if (e.cat === 'radiator') {
    const r = res.radiators[e.id];
    const c = res.circuits.find((x) => x.elementId === e.id);
    if (!r) return '';
    let b = kv([[t('selected_rad'), r.product?.model ?? '—'], [t('article'), r.product?.article ?? ''], ['Q 75/65/20', `${f0(r.nominal75)} W`], [`Q ${p.settings.regime.ts}/${p.settings.regime.tr}/${r.ti}`, `${f0(r.output)} W`], [t('required'), `${f0(r.designQ)} W`], [t('reserve'), r.designQ ? `${((r.output / r.designQ - 1) * 100).toFixed(1)} %` : '—'], ['G', `${f0(c?.flowLh)} l/h`], ['ΔP kontur', c ? `${f2(c.dpTotal / 1000)} kPa` : '—'], ['Balans sozlamasi', c?.balance?.setting ?? '—'], ['Suv hajmi', `${r.product?.waterL ?? '—'} l`], ['Og‘irligi', `${r.product?.weightKg ?? '—'} kg`]]);
    if (r.selection?.alternatives?.length) b += `<details><summary class="muted">Muqobillar</summary>${r.selection.alternatives.map((a) => `<div class="list-item"><span class="grow">${esc(a.model)}</span><span>${f0(a.output)} W</span></div>`).join('')}</details>`;
    return sect(t('calc_results'), b);
  }
  if (e.cat === 'pipe' || e.cat === 'riser') {
    const r = res.pipes[e.id];
    if (!r) return sect(t('calc_results'), `<p class="muted">Quvur tarmoqqa ulanmagan.</p>`);
    let b = kv([[t('diameter'), `${r.material} Ø${r.dn} (ichki ${(r.dInner * 1000).toFixed(1)} mm)`], [t('length'), `${f2(r.length)} m`], ['Q', `${f0(r.Q)} W`], [t('flow'), `${f0(r.flowLh)} l/h`], [t('velocity'), `${f2(r.v)} m/s`], ['Re', f0(r.Re)], ['λ', r.lambda.toFixed(4)], ['R', `${f0(r.R)} Pa/m`], ['Σζ', `${f2(r.zeta)} (${r.bends} burchak, ${r.tees} troynik)`], ['ΔP ishqalanish', `${f0(r.dpFriction)} Pa`], ['ΔP mahalliy', `${f0(r.dpLocal)} Pa`], ['ΔP jami', `${f0(r.dp)} Pa = ${f2(r.dp / 1000)} kPa = ${(r.dp / 1e5).toFixed(4)} bar`], ['Holat', r.status]]);
    if (r.sizing) b += `<details open><summary class="muted">Diametr tanlash: ${esc(r.sizing.reason)}</summary><table class="tbl"><tr><th>Ø</th><th>v</th><th>R</th><th></th></tr>${r.sizing.candidates.map((c) => `<tr><td>${c.dn}</td><td class="n">${f2(c.v)}</td><td class="n">${f0(c.R)}</td><td>${c.dn === r.dn ? '✓ tanlandi' : c.valid ? 'mos' : !c.okV ? 'v yuqori' : !c.okR ? 'R yuqori' : 'diapazon'}</td></tr>`).join('')}</table>${r.sizing.warnings.map((w) => `<div class="muted">⚠ ${esc(msg(w.code, w.params))}</div>`).join('')}</details>`;
    return sect(t('calc_results'), b);
  }
  if (e.cat === 'boiler') {
    const b = res.boiler;
    return sect(t('calc_results'), kv([['Isitish', `${f1(b.heatingKw)} kVt`], ['DHW', `${f1(b.dhwKw)} kVt`], [t('reserve'), b.reserve], [t('required'), `${f1(b.requiredKw)} kVt`], [t('product'), b.product?.model ?? '—'], ['Qarshilik', `${f2(b.dp / 1000)} kPa`], ['Ichki nasos', b.product?.builtInPump ? 'bor' : 'yo‘q']]));
  }
  if (e.cat === 'collector') {
    const loops = Object.values(res.ufh).filter((u) => u.collectorId === e.id);
    const circuits = res.circuits.filter((c) => c.connected && c.path.includes(e.id));
    return sect(t('calc_results'), kv([['Ulangan konturlar', circuits.length + loops.reduce((a, l) => a + l.loops, 0)], ['Sarf', `${f0(circuits.reduce((a, c) => a + c.flowLh, 0))} l/h`], ['Issiqlik', `${f0(circuits.reduce((a, c) => a + c.Q, 0))} W`]]) + (loops.length ? `<table class="tbl"><tr><th>#</th><th>Xona</th><th>L</th><th>G</th><th>ΔP</th></tr>${loops.flatMap((u) => Array.from({ length: u.loops }, (_, i) => `<tr><td>${i + 1}</td><td>${esc(p.elements[u.roomId]?.name)}</td><td class="n">${f1(u.loopLength)}</td><td class="n">${f0(u.flowPerLoopLh)}</td><td class="n">${f2(u.dpLoop / 1000)}</td></tr>`)).join('')}</table>` : ''));
  }
  if (e.cat === 'wall') {
    try {
      const u = assemblyU(e.assembly);
      return sect('Konstruksiya', kv([['R', `${f2(u.R)} m²K/W`], ['U', `${f2(u.U)} W/m²K`], ['Qalinlik', `${(u.thickness * 1000).toFixed(0)} mm`]]) + `<table class="tbl">${u.layers.map((l) => `<tr><td>${esc(l.name)}</td><td class="n">${l.d * 1000} mm</td><td class="n">λ ${l.lambda}</td><td class="n">R ${f2(l.R)}</td></tr>`).join('')}</table>`);
    } catch {
      return '';
    }
  }
  if (e.cat === 'thermostat') {
    return sect('Boshqaruv mantiqi', `<p>t &lt; ${e.setpoint ?? 20} °C → klapan ochiq<br>t ≥ ${e.setpoint ?? 20} °C → klapan yopiq</p><div class="muted">Boshqaradi: ${(e.controls ?? []).map((id) => esc(p.elements[id]?.mark || id)).join(', ') || '—'}</div>`);
  }
  return '';
}

function projectSummary(p, res) {
  const s = p.settings;
  const n = (c) => elementsOf(p, c).length;
  return `<div class="sect"><h4>${t('general')}</h4><div class="sect-body kv">
    <span>${t('name')}</span><span>${esc(p.meta.name)}</span><span>№</span><span>${esc(p.meta.number)}</span><span>Standart</span><span>${esc(s.standard)}</span>
    <span>Iqlim</span><span>${esc(s.climate.city)} ${s.climate.tOut} °C</span><span>Qavatlar</span><span>${p.levels.length}</span>
  </div></div>
  <div class="sect"><h4>${t('calc_results')}</h4><div class="sect-body kv">
    <span>${t('heat_loss')}</span><span>${f0(res?.totals.heatLoss)} W</span><span>${t('total_power')}</span><span>${f0((res?.totals.radiatorOutput ?? 0) + (res?.totals.ufhOutput ?? 0))} W</span>
    <span>${t('water_flow')}</span><span>${f2((res?.totals.flowLh ?? 0) / 1000)} m³/h</span><span>Kritik ΔP</span><span>${f1((res?.critical?.dp ?? 0) / 1000)} kPa</span>
    <span>Qozon</span><span>${esc(res?.boiler?.product?.model ?? '—')}</span><span>Nasos</span><span>${esc(res?.pump?.product?.model ?? '—')}</span>
  </div></div>
  <div class="sect"><h4>${t('elements')}</h4><div class="sect-body kv">
    <span>${t('radiator')}</span><span>${n('radiator')} dona</span><span>Quvur</span><span>${f1(res?.totals.pipeLength)} m</span><span>Kollektor</span><span>${n('collector')} dona</span>
    <span>Xonalar</span><span>${n('room')}</span><span>Devorlar</span><span>${n('wall')}</span><span>Stoyaklar</span><span>${n('riser')}</span>
  </div></div><p class="muted">${t('no_selection')}</p>`;
}

function renderCalcTab(el, app, sel) {
  const { store } = app;
  const res = store.results;
  const p = store.project;
  if (!res) return (el.innerHTML = '');
  if (sel.length === 1) {
    el.innerHTML = elementResults(sel[0], p, res) || '<p class="muted">Bu element uchun hisob yo‘q.</p>';
    bindSections(el);
    return;
  }
  el.innerHTML = `<div class="sect"><h4>Tizim</h4><div class="sect-body kv">
    <span>Q ulangan</span><span>${f0(res.totals.connectedQ)} W</span><span>G</span><span>${f0(res.totals.flowLh)} l/h</span>
    <span>Kritik kontur</span><span>${esc(p.elements[res.critical?.elementId]?.mark ?? '—')}</span><span>ΔP kritik</span><span>${f1((res.critical?.dp ?? 0) / 1000)} kPa</span>
    <span>Nasos H</span><span>${f2(res.pump.h)} m</span><span>V tizim</span><span>${f0(res.totals.systemL)} l</span>
    <span>Kengaytirish baki</span><span>${esc(res.expansion.tank?.model ?? '—')}</span><span>Smeta</span><span>${f0(res.cost.total)} ${res.cost.currency}</span>
  </div></div>
  <div class="sect"><h4>Tekshiruv</h4><div class="sect-body">${res.validation.findings.slice(0, 30).map((f) => `<div class="list-item" data-id="${f.elementId ?? ''}" style="cursor:pointer"><span class="sev ${f.severity}">${t(f.severity)}</span><span class="grow">${esc(msg(f.code, f.params))}</span></div>`).join('') || `<span class="sev ok">OK</span> ${t('all_ok')}`}</div></div>`;
  el.querySelectorAll('[data-id]').forEach((d) => (d.onclick = () => d.dataset.id && app.focusElement(d.dataset.id)));
}

function renderSystem(el, app) {
  const { store } = app;
  const s = store.project.settings;
  const res = store.results;
  const regimeName = REGIMES.find((r) => r.ts === s.regime.ts && r.tr === s.regime.tr)?.name ?? 'custom';
  el.innerHTML = `<div class="sect"><h4>${t('system_params')}</h4><div class="sect-body">
    <div class="prop"><label>Rejim</label><select data-s="regimeSel">${REGIMES.map((r) => `<option ${r.name === regimeName ? 'selected' : ''}>${r.name}</option>`).join('')}<option ${regimeName === 'custom' ? 'selected' : ''} value="custom">custom</option></select><span></span></div>
    <div class="prop"><label>${t('supply_t')}</label><input type="number" data-s="regime.ts" value="${s.regime.ts}"><span class="u">°C</span></div>
    <div class="prop"><label>${t('return_t')}</label><input type="number" data-s="regime.tr" value="${s.regime.tr}"><span class="u">°C</span></div>
    <div class="prop"><label>TP ta'minot/qaytish</label><input type="text" data-s="ufhRegime" value="${s.ufhRegime.ts}/${s.ufhRegime.tr}"><span class="u">°C</span></div>
    <div class="prop"><label>Radiator zaxirasi</label><input type="number" step="0.01" data-s="radiatorReserve" value="${s.radiatorReserve}"><span class="u">×</span></div>
    <div class="prop"><label>Quvur materiali</label><select data-s="pipeMaterial">${Object.entries(PIPE_MATERIALS).map(([k, m]) => `<option value="${k}" ${k === s.pipeMaterial ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select><span></span></div>
    <div class="prop"><label>v min / max</label><input type="text" data-s="vel" value="${s.velMin}/${s.velMax}"><span class="u">m/s</span></div>
    <div class="prop"><label>R max</label><input type="number" data-s="maxRPaM" value="${s.maxRPaM}"><span class="u">Pa/m</span></div>
    <div class="prop"><label>ΔP kontur max</label><input type="number" data-s="maxBranchKpa" value="${s.maxBranchKpa}"><span class="u">kPa</span></div>
    <div class="prop"><label>${t('pressure_loss')}</label><input readonly value="${f1((res?.critical?.dp ?? 0) / 1000)}"><span class="u">kPa</span></div>
    <div class="prop"><label>${t('water_flow')}</label><input readonly value="${f2((res?.totals.flowLh ?? 0) / 1000)}"><span class="u">m³/h</span></div>
  </div></div>
  <div class="sect"><h4>Iqlim</h4><div class="sect-body">
    <div class="prop"><label>Shahar</label><select data-s="city">${CLIMATE.map((c) => `<option ${c.city === s.climate.city ? 'selected' : ''}>${esc(c.city)}</option>`).join('')}</select><span></span></div>
    <div class="prop"><label>t tashqi</label><input type="number" data-s="climate.tOut" value="${s.climate.tOut}"><span class="u">°C</span></div>
  </div></div>`;
  el.querySelectorAll('[data-s]').forEach((inp) => (inp.onchange = () => {
    const k = inp.dataset.s;
    const v = inp.value;
    let patch = {};
    if (k === 'regimeSel') {
      const r = REGIMES.find((x) => x.name === v);
      if (!r) return;
      patch = { regime: { ts: r.ts, tr: r.tr, name: r.name } };
    } else if (k === 'regime.ts') patch = { regime: { ts: Number(v), name: 'custom' } };
    else if (k === 'regime.tr') patch = { regime: { tr: Number(v), name: 'custom' } };
    else if (k === 'ufhRegime') {
      const [a, b] = v.split('/').map(Number);
      if (!(a > b)) return app.toast('Noto‘g‘ri rejim', 'error');
      patch = { ufhRegime: { ts: a, tr: b } };
    } else if (k === 'vel') {
      const [a, b] = v.split('/').map(Number);
      patch = { velMin: a, velMax: b };
    } else if (k === 'city') {
      const c = CLIMATE.find((x) => x.city === v);
      patch = { climate: { city: c.city, tOut: c.tOut, manual: false }, country: c.country };
    } else if (k === 'climate.tOut') patch = { climate: { tOut: Number(v), manual: true } };
    else if (k === 'pipeMaterial') patch = { pipeMaterial: v };
    else patch = { [k]: Number(v) };
    if (patch.regime && (patch.regime.ts ?? s.regime.ts) <= (patch.regime.tr ?? s.regime.tr)) return app.toast('Ta’minot harorati qaytishdan yuqori bo‘lishi kerak', 'error');
    store.apply({ settings: patch }, `settings:${k}`);
  }));
}

export { roomTemp };
