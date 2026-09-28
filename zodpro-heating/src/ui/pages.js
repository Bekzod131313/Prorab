// Document-style views: schedules, sheets, library, settings, installation, issues, help.
import { elementsOf, sortedLevels, levelById, newElement } from '../core/model.js';
import { CLIMATE, ROOM_TYPES, CLIMATE_SOURCE_NOTE } from '../data/climate.js';
import { ASSEMBLIES, MATERIALS, OPENING_TYPES, assemblyU } from '../data/materials.js';
import { PIPE_MATERIALS, BOILERS, PUMPS, COLLECTORS, VALVES, EXPANSION_TANKS } from '../data/products.js';
import { catalogOf } from '../engines/calc.js';
import { RULES } from '../engines/validation.js';
import { scheduleDefs, tableHTML, setColPrefs, esc, f0, f1, f2 } from './reports.js';
import { buildSheets, sheetHTML } from './sheets.js';
import { toCSV, toExcelXml, download, importRadiatorCSV } from '../core/io.js';
import { ROLES, LocalWarehouse, procurement, materialListText, statusText, sendTelegram, API_ROUTES } from '../core/integrations.js';
import { t, LANG_NAMES } from '../core/i18n.js';
import { TEMPLATES } from '../core/templates.js';

// ---------------- schedules ----------------
export function renderSchedules(el, app) {
  const { store } = app;
  const res = store.results;
  if (!res) return;
  const defs = scheduleDefs(store.project, res);
  const cur = app.scheduleKey ?? 'radiators';
  const d = defs.find((x) => x.key === cur) ?? defs[0];
  el.innerHTML = `<div class="doc-toolbar">${defs.map((x) => `<button class="btn small ${x.key === d.key ? 'primary' : ''}" data-k="${x.key}">${esc(x.title)}</button>`).join('')}</div>
   <div class="doc-toolbar"><b>${esc(d.title)}</b><span class="muted">(${d.rows().length} qator)</span>
   <button class="btn small" data-x="csv">CSV</button><button class="btn small" data-x="xls">Excel</button><button class="btn small" data-x="xlsall">Excel (barcha jadvallar)</button></div>
   ${tableHTML(d, { chooser: true })}
   ${d.key === 'bom' ? `<div class="card" style="max-width:520px"><div class="kv"><span>${t('material_cost')} (chiqindi bilan)</span><span>${f0(res.cost.material)} ${res.cost.currency}</span><span>shu jumladan chiqindi (${Math.round(store.project.settings.wasteFactor * 100)}%)</span><span>${f0(res.cost.waste)}</span><span>${t('labor')}</span><span>${f0(res.cost.labor)}</span><span>${t('transport')}</span><span>${f0(res.cost.transport)}</span><span><b>${t('total')}</b></span><span><b>${f0(res.cost.total)} ${res.cost.currency}</b></span></div></div>
   <div class="btn-row"><button class="btn small" data-x="quote">Tijorat taklifi</button><button class="btn small" data-x="proc">Ombor / xarid (SAP)</button><button class="btn small" data-x="tg">Telegramga yuborish</button></div><div id="proc-out"></div>` : ''}`;
  el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
    app.scheduleKey = b.dataset.k;
    renderSchedules(el, app);
  }));
  el.querySelectorAll('[data-sched]').forEach((c) => (c.onchange = () => {
    const keys = [...el.querySelectorAll(`[data-sched="${c.dataset.sched}"]`)].filter((x) => x.checked).map((x) => x.dataset.col);
    setColPrefs(c.dataset.sched, keys);
    renderSchedules(el, app);
  }));
  el.querySelectorAll('tr.clickable').forEach((tr) => (tr.onclick = () => tr.dataset.id && app.focusElement(tr.dataset.id)));
  const name = store.project.meta.number;
  el.querySelectorAll('[data-x]').forEach((b) => (b.onclick = async () => {
    const x = b.dataset.x;
    if (x === 'csv') download(`${name}_${d.key}.csv`, toCSV(d.rows(), d.columns), 'text/csv;charset=utf-8');
    if (x === 'xls') download(`${name}_${d.key}.xls`, toExcelXml([{ name: d.title, rows: d.rows(), columns: d.columns }]), 'application/vnd.ms-excel');
    if (x === 'xlsall') download(`${name}_jadvallar.xls`, toExcelXml(defs.map((q) => ({ name: q.title, rows: q.rows(), columns: q.columns }))), 'application/vnd.ms-excel');
    if (x === 'quote') app.openQuotation();
    if (x === 'tg') app.telegramDialog(materialListText(store.project, res));
    if (x === 'proc') {
      const rows = await procurement(res.bom.rows, new LocalWarehouse(store.project));
      el.querySelector('#proc-out').innerHTML = `<h3>Ombor qoldig‘i va taqchillik (ERP: mahalliy ombor)</h3><table class="tbl"><tr><th>Artikul / SAP</th><th>Nomi</th><th>Kerak</th><th>Omborda</th><th>Taqchil</th></tr>${rows.map((r) => `<tr><td>${esc(r.sapArticle || r.article)}</td><td>${esc(r.name)}</td><td class="n">${+r.purchase.toFixed(2)} ${esc(r.unit)}</td><td class="n"><input type="number" data-wh="${esc(r.sapArticle || r.article)}" value="${r.warehouse}" style="width:80px"></td><td class="n" style="color:${r.shortage ? 'var(--err)' : 'var(--ok)'}">${+r.shortage.toFixed(2)}</td></tr>`).join('')}</table><button class="btn small" id="po">Xarid buyurtmasi (qoralama)</button>`;
      el.querySelectorAll('[data-wh]').forEach((i) => (i.onchange = () => {
        store.project.warehouse = { ...(store.project.warehouse ?? {}), [i.dataset.wh]: Number(i.value) };
        store.dirty = true;
        b.click();
      }));
      el.querySelector('#po').onclick = async () => {
        const po = await new LocalWarehouse(store.project).createOrder(rows.filter((r) => r.shortage > 0).map((r) => ({ article: r.sapArticle || r.article, qty: r.shortage, unit: r.unit })));
        download(`${po.id}.json`, JSON.stringify(po, null, 2), 'application/json');
        app.toast(`${po.id}: ${po.lines.length} qator`);
      };
    }
  }));
}

// ---------------- sheets ----------------
export function renderSheets(el, app) {
  const { store } = app;
  const sheets = buildSheets(store.project, store.results, { includeCost: !!app.includeCost });
  el.innerHTML = `<div class="doc-toolbar"><b>Hujjatlar to‘plami (${sheets.length} varaq)</b>
    <label><input type="checkbox" id="inc-cost" ${app.includeCost ? 'checked' : ''}> Smetani qo‘shish</label>
    <button class="btn small primary" id="print">PDF / Chop etish (A3)</button>
    <button class="btn small" id="newrev">+ Reviziya</button>
    <span class="muted">${sheets.map((s) => s.no).join(' · ')}</span></div>
    ${sheets.map((s) => sheetHTML(store.project, s, sheets.length)).join('')}`;
  el.querySelector('#inc-cost').onchange = (e) => {
    app.includeCost = e.target.checked;
    renderSheets(el, app);
  };
  el.querySelector('#print').onclick = () => window.print();
  el.querySelector('#newrev').onclick = () => app.newRevision();
}

// ---------------- library ----------------
export function renderLibrary(el, app) {
  const { store } = app;
  const tab = app.libTab ?? 'radiators';
  const q = (app.libQuery ?? '').toLowerCase();
  const tabs = [['radiators', 'Radiatorlar'], ['pipes', 'Quvurlar'], ['boilers', 'Qozonlar'], ['pumps', 'Nasoslar'], ['collectors', 'Kollektorlar'], ['valves', 'Armatura'], ['tanks', 'Baklar'], ['materials', 'Materiallar / konstruksiyalar'], ['family', 'Oila yaratish'], ['import', 'Import (CSV)']];
  let body = '';
  const match = (o) => !q || JSON.stringify(o).toLowerCase().includes(q);
  if (tab === 'radiators') {
    const list = catalogOf(store.project).filter(match);
    body = `<table class="tbl"><tr><th></th><th>Model</th><th>Artikul</th><th>SAP</th><th>H×L×D, mm</th><th>Q75, W</th><th>n</th><th>V, l</th><th>kg</th><th>USD</th></tr>${list.slice(0, 400).map((r) => `<tr><td>${radPreview(r)}</td><td>${esc(r.model)}${r.imported ? ' <span class="sev ok">import</span>' : ''}</td><td>${esc(r.article)}</td><td>${esc(r.sapArticle ?? '')}</td><td>${Math.round(r.height * 1000)}×${Math.round(r.length * 1000)}×${Math.round(r.depth * 1000)}</td><td class="n">${r.q75}</td><td class="n">${r.n}</td><td class="n">${r.waterL}</td><td class="n">${r.weightKg}</td><td class="n">${r.priceUsd}</td></tr>`).join('')}</table>${list.length > 400 ? `<p class="muted">… ${list.length - 400} ta ko‘proq (qidiruvdan foydalaning)</p>` : ''}`;
  } else if (tab === 'pipes') {
    body = Object.entries(PIPE_MATERIALS).map(([k, m]) => `<h3>${esc(m.name)} (${k})</h3><p class="muted">k = ${m.k * 1000} mm · PN${m.pn} · t max ${m.maxTemp} °C · sotuv birligi ${m.barLength} m</p><table class="tbl"><tr><th>Ø</th><th>D tashqi, mm</th><th>d ichki, mm</th><th>USD/m</th></tr>${m.sizes.map((s) => `<tr><td>${s.dn}</td><td class="n">${(s.od * 1000).toFixed(1)}</td><td class="n">${(s.id * 1000).toFixed(1)}</td><td class="n">${s.usd}</td></tr>`).join('')}</table>`).join('');
  } else if (tab === 'boilers') {
    body = `<table class="tbl"><tr><th>Model</th><th>Artikul</th><th>kVt</th><th>Modulyatsiya</th><th>η</th><th>Ulanish</th><th>O‘lcham</th><th>Ichki nasos</th><th>USD</th></tr>${BOILERS.filter(match).map((b) => `<tr><td>${esc(b.model)}</td><td>${b.article}</td><td class="n">${b.powerKw}</td><td>${b.modulation}</td><td class="n">${b.efficiency}</td><td>${b.connections}</td><td>${b.dims}</td><td>${b.builtInPump ? 'ha' : 'yo‘q'}</td><td class="n">${b.usd}</td></tr>`).join('')}</table>`;
  } else if (tab === 'pumps') {
    body = `<table class="tbl"><tr><th>Model</th><th>H0, m</th><th>Q max, m³/h</th><th>Q min</th><th>P, W</th><th>η</th><th>USD</th></tr>${PUMPS.filter(match).map((b) => `<tr><td>${esc(b.model)}</td><td class="n">${b.h0}</td><td class="n">${b.qMax}</td><td class="n">${b.qMin}</td><td class="n">${b.powerW}</td><td class="n">${b.eff}</td><td class="n">${b.usd}</td></tr>`).join('')}</table>`;
  } else if (tab === 'collectors') {
    body = `<table class="tbl"><tr><th>Model</th><th>Chiqish</th><th>Q max</th><th>V, l</th><th>USD</th></tr>${COLLECTORS.filter(match).map((b) => `<tr><td>${esc(b.model)}</td><td class="n">${b.outlets}</td><td class="n">${b.maxFlowM3h}</td><td class="n">${b.waterL}</td><td class="n">${b.usd}</td></tr>`).join('')}</table>`;
  } else if (tab === 'valves') {
    body = `<table class="tbl"><tr><th>Model</th><th>Artikul</th><th>Kv</th><th>USD</th></tr>${Object.values(VALVES).map((v) => `<tr><td>${esc(v.model)}</td><td>${v.article}</td><td>${v.kv ?? (v.presets ? v.presets.map((p) => `${p.setting}:${p.kv}`).join(' ') : '—')}</td><td class="n">${v.usd}</td></tr>`).join('')}</table>`;
  } else if (tab === 'tanks') {
    body = `<table class="tbl"><tr><th>Model</th><th>V, l</th><th>USD</th></tr>${EXPANSION_TANKS.map((v) => `<tr><td>${esc(v.model)}</td><td class="n">${v.volumeL}</td><td class="n">${v.usd}</td></tr>`).join('')}</table>`;
  } else if (tab === 'materials') {
    body = `<h3>Materiallar</h3><table class="tbl"><tr><th>Nomi</th><th>λ, W/mK</th><th>ρ, kg/m³</th><th>c, J/kgK</th><th>μ</th><th>Yong‘in</th></tr>${Object.values(MATERIALS).map((m) => `<tr><td>${esc(m.name)}</td><td class="n">${m.lambda}</td><td class="n">${m.rho}</td><td class="n">${m.c}</td><td class="n">${m.mu}</td><td>${m.fire}</td></tr>`).join('')}</table>
      <h3>Konstruksiyalar</h3><table class="tbl"><tr><th>Nomi</th><th>Qatlamlar</th><th>R</th><th>U</th></tr>${Object.entries(ASSEMBLIES).map(([k, a]) => {
        const u = assemblyU(k);
        return `<tr><td>${esc(a.name)}</td><td>${u.layers.map((l) => `${esc(l.name)} ${l.d * 1000}`).join(' + ')}</td><td class="n">${f2(u.R)}</td><td class="n">${f2(u.U)}</td></tr>`;
      }).join('')}</table>
      <h3>Deraza / eshik turlari</h3><table class="tbl">${Object.values(OPENING_TYPES).map((o) => `<tr><td>${esc(o.name)}</td><td class="n">U = ${o.U}</td></tr>`).join('')}</table>`;
  } else if (tab === 'family') {
    body = `<p>Maxsus radiator oilasi/turi yaratish (parametrik): yangi tur katalogga qo‘shiladi va loyiha fayli bilan saqlanadi.</p>
    <div style="max-width:420px">${[['model', 'Model', 'text', 'Custom panel'], ['article', 'Artikul', 'text', 'CUST-001'], ['height', 'Balandlik, mm', 'number', 500], ['length', 'Uzunlik, mm', 'number', 1000], ['depth', 'Chuqurlik, mm', 'number', 100], ['q75', 'Q 75/65/20, W', 'number', 1400], ['n', 'Eksponent n', 'number', 1.3], ['waterL', 'Suv hajmi, l', 'number', 5], ['priceUsd', 'Narx, USD', 'number', 80]].map(([k, l, ty, v]) => `<div class="prop"><label>${l}</label><input data-fam="${k}" type="${ty}" value="${v}"><span></span></div>`).join('')}
    <div class="btn-row"><button class="btn primary small" id="fam-add">Katalogga qo‘shish</button></div></div>`;
  } else if (tab === 'import') {
    body = `<p>CSV ustunlari: <code>article;brand;model;type;height_mm;length_mm;depth_mm;q75_w;n;water_l;weight_kg;price;currency</code>. Validatsiya va dublikat (artikul bo‘yicha) tekshiruvi bajariladi.</p>
    <textarea id="imp-text" rows="8" style="width:100%;font-family:monospace">article;brand;model;type;height_mm;length_mm;q75_w;n;price;currency
DEMO-22-500-800;Demo;Panel 22 500x800;22;500;800;1120;1.3;850000;UZS</textarea>
    <div class="btn-row"><button class="btn small" id="imp-file">Fayldan…</button><button class="btn primary small" id="imp-run">Import</button></div><div id="imp-out"></div>`;
  }
  el.innerHTML = `<h2>Mahsulot kutubxonasi</h2><div class="doc-toolbar">${tabs.map(([k, l]) => `<button class="btn small ${k === tab ? 'primary' : ''}" data-t="${k}">${l}</button>`).join('')}<input class="search" id="lib-q" placeholder="Qidirish: artikul, model, brend…" value="${esc(app.libQuery ?? '')}"></div>
  <p class="muted">ZODPRO demo katalogi — ishlab chiqaruvchi ma’lumotlari bilan almashtiring (Import). Mahsulot yozuvi: brend, model, artikul, SAP artikul, texnik ma’lumot, o‘lchamlar, konnektorlar, narx, ta’minotchi.</p>${body}`;
  el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
    app.libTab = b.dataset.t;
    renderLibrary(el, app);
  }));
  const qi = el.querySelector('#lib-q');
  qi.onchange = () => {
    app.libQuery = qi.value;
    renderLibrary(el, app);
  };
  el.querySelector('#fam-add')?.addEventListener('click', () => {
    const v = (k) => el.querySelector(`[data-fam="${k}"]`).value;
    const n = (k) => Number(v(k));
    if (!(n('height') > 0 && n('length') > 0 && n('q75') > 0)) return app.toast('Qiymatlar noto‘g‘ri', 'error');
    const prod = { id: `FAM-${v('article')}`, family: 'radiator', kind: 'panel', brand: 'Custom', model: v('model'), article: v('article'), type: 'custom', height: n('height') / 1000, length: n('length') / 1000, depth: n('depth') / 1000, q75: n('q75'), n: n('n'), waterL: n('waterL'), weightKg: 0, priceUsd: n('priceUsd'), zeta: 2.5, imported: true };
    if (catalogOf(store.project).some((r) => r.article === prod.article)) return app.toast('Bunday artikul bor (dublikat)', 'error');
    store.apply({ library: { ...(store.project.library ?? {}), radiators: [...(store.project.library?.radiators ?? []), prod] } }, 'family:add');
    app.toast(`${prod.model} qo‘shildi`);
  });
  el.querySelector('#imp-file')?.addEventListener('click', () => app.pickFile('.csv,.txt', (text) => (el.querySelector('#imp-text').value = text)));
  el.querySelector('#imp-run')?.addEventListener('click', () => {
    const r = importRadiatorCSV(el.querySelector('#imp-text').value, store.project.settings.rates, catalogOf(store.project));
    el.querySelector('#imp-out').innerHTML = `<p>Qo‘shildi: <b>${r.products.length}</b> · Xato: <b>${r.errors.length}</b> · Dublikat: <b>${r.duplicates.length}</b></p>${r.errors.map((e) => `<div class="sev error">Qator ${e.row}: ${esc(e.code)} ${esc(JSON.stringify(e.params ?? ''))}</div>`).join('')}${r.duplicates.map((d) => `<div class="sev warning">Qator ${d.row}: dublikat ${esc(d.article)}</div>`).join('')}`;
    if (r.products.length) store.apply({ library: { ...(store.project.library ?? {}), radiators: [...(store.project.library?.radiators ?? []), ...r.products] } }, 'import:products');
  });
}

function radPreview(r) {
  const w = 44;
  const h = Math.max(8, Math.round((r.height / r.length) * w));
  return `<svg width="${w}" height="${Math.min(h, 40)}" viewBox="0 0 ${w} ${Math.min(h, 40)}"><rect x="0.5" y="0.5" width="${w - 1}" height="${Math.min(h, 40) - 1}" fill="#fff" stroke="#555"/>${Array.from({ length: 6 }, (_, i) => `<line x1="${(i + 1) * (w / 7)}" y1="1" x2="${(i + 1) * (w / 7)}" y2="${Math.min(h, 40) - 1}" stroke="#aaa"/>`).join('')}</svg>`;
}

// ---------------- settings ----------------
export function renderSettings(el, app) {
  const { store } = app;
  const p = store.project;
  const s = p.settings;
  const m = p.meta;
  const inp = (path, val, type = 'text', extra = '') => `<input data-path="${path}" type="${type}" value="${esc(val ?? '')}" ${extra}>`;
  el.innerHTML = `<h2>${t('tab_settings')}</h2>
  <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(340px,1fr))">
    <div class="card"><h3>Loyiha</h3>${[['meta.name', 'Nomi', m.name], ['meta.number', 'Loyiha raqami', m.number], ['meta.client', 'Buyurtmachi', m.client], ['meta.address', 'Manzil', m.address], ['meta.designer', 'Loyihachi', m.designer], ['meta.checker', 'Tekshiruvchi', m.checker], ['meta.company', 'Kompaniya', m.company], ['meta.date', 'Sana', m.date], ['meta.stage', 'Bosqich', m.stage]].map(([k, l, v]) => `<div class="prop"><label>${l}</label>${inp(k, v)}<span></span></div>`).join('')}</div>
    <div class="card"><h3>Standart va iqlim</h3>
      <div class="prop"><label>Faol standart</label><select data-path="settings.standard">${['SP-UZ', 'KMK', 'SP-RU', 'GOST', 'EN', 'ISO', 'ASHRAE', 'Company'].map((x) => `<option ${x === s.standard ? 'selected' : ''}>${x}</option>`).join('')}</select><span></span></div>
      <div class="prop"><label>Shahar</label><select data-path="settings.climate.city">${CLIMATE.map((c) => `<option ${c.city === s.climate.city ? 'selected' : ''}>${esc(c.city)}</option>`).join('')}</select><span></span></div>
      <div class="prop"><label>t tashqi (qo‘lda)</label>${inp('settings.climate.tOut', s.climate.tOut, 'number')}<span class="u">°C</span></div>
      <div class="prop"><label>Shimol burchagi</label>${inp('settings.northAngle', s.northAngle, 'number')}<span class="u">°</span></div>
      <p class="muted" style="font-size:11px">${esc(CLIMATE_SOURCE_NOTE)}</p>
      <div class="prop"><label>Infiltratsiya</label>${inp('settings.infiltrationAch', s.infiltrationAch, 'number')}<span class="u">1/h</span></div>
      <div class="prop"><label>Havo qoidasi</label><select data-path="settings.ventPolicy"><option value="max" ${s.ventPolicy === 'max' ? 'selected' : ''}>max(vent, inf)</option><option value="sum" ${s.ventPolicy === 'sum' ? 'selected' : ''}>vent + inf</option></select><span></span></div>
      <div class="prop"><label>Maishiy issiqlik</label>${inp('settings.internalGainsWm2', s.internalGainsWm2, 'number')}<span class="u">W/m²</span></div>
      <div class="prop"><label>Xavfsizlik koeff.</label>${inp('settings.heatLossSafety', s.heatLossSafety, 'number', 'step="0.01"')}<span class="u">×</span></div>
    </div>
    <div class="card"><h3>Gidravlika va uskunalar</h3>
      ${[['settings.velMin', 'v min', s.velMin, 'm/s'], ['settings.velMax', 'v max', s.velMax, 'm/s'], ['settings.velCritical', 'v kritik', s.velCritical, 'm/s'], ['settings.maxRPaM', 'R max', s.maxRPaM, 'Pa/m'], ['settings.maxBranchKpa', 'ΔP kontur max', s.maxBranchKpa, 'kPa'], ['settings.pipeElevation', 'Quvur balandligi', s.pipeElevation, 'm'], ['settings.pumpHeadMargin', 'Nasos zaxirasi', s.pumpHeadMargin, '×'], ['settings.boilerReserve', 'Qozon zaxirasi', s.boilerReserve, '×'], ['settings.dhwKw', 'Issiq suv (DHW)', s.dhwKw, 'kVt'], ['settings.dhwSimultaneity', 'DHW bir vaqtlilik', s.dhwSimultaneity, '0..1'], ['settings.staticHeightM', 'Statik balandlik', s.staticHeightM, 'm'], ['settings.safetyValveBar', 'Xavfsizlik klapani', s.safetyValveBar, 'bar'], ['settings.ufhMaxLoopM', 'TP kontur max', s.ufhMaxLoopM, 'm'], ['settings.ufhMaxLoopKpa', 'TP ΔP max', s.ufhMaxLoopKpa, 'kPa']].map(([k, l, v, u]) => `<div class="prop"><label>${l}</label>${inp(k, v, 'number', 'step="any"')}<span class="u">${u}</span></div>`).join('')}
    </div>
    <div class="card"><h3>Narx va valyuta</h3>
      <div class="prop"><label>Valyuta</label><select data-path="settings.currency">${Object.keys(s.rates).map((c) => `<option ${c === s.currency ? 'selected' : ''}>${c}</option>`).join('')}</select><span></span></div>
      ${Object.entries(s.rates).map(([c, r]) => `<div class="prop"><label>1 USD = ${c}</label>${inp(`settings.rates.${c}`, r, 'number', 'step="any"')}<span></span></div>`).join('')}
      <div class="btn-row"><button class="btn small" id="add-cur">+ valyuta</button></div>
      <div class="prop"><label>Kurs sanasi</label>${inp('settings.ratesDate', s.ratesDate)}<span></span></div>
      <div class="prop"><label>Kurs manbai</label>${inp('settings.ratesSource', s.ratesSource)}<span></span></div>
      <div class="prop"><label>Chiqindi</label>${inp('settings.wasteFactor', s.wasteFactor, 'number', 'step="0.01"')}<span class="u">0..1</span></div>
      <div class="prop"><label>Montaj</label>${inp('settings.laborPct', s.laborPct, 'number')}<span class="u">%</span></div>
      <div class="prop"><label>Transport</label>${inp('settings.transportPct', s.transportPct, 'number')}<span class="u">%</span></div>
    </div>
    <div class="card"><h3>Qavatlar</h3><table class="tbl"><tr><th>Nomi</th><th>Belgi, m</th><th>Balandlik</th><th></th></tr>${sortedLevels(p).map((l) => `<tr><td><input data-lvl="${l.id}" data-f="name" value="${esc(l.name)}" size="10"></td><td><input data-lvl="${l.id}" data-f="elevation" type="number" step="0.001" value="${l.elevation}" style="width:80px"></td><td><input data-lvl="${l.id}" data-f="height" type="number" step="0.01" value="${l.height}" style="width:60px"></td><td><button class="btn small" data-del-lvl="${l.id}">✕</button></td></tr>`).join('')}</table><div class="btn-row"><button class="btn small" id="add-lvl">+ qavat</button><button class="btn small" id="copy-lvl">Joriy qavatni nusxalash</button></div></div>
    <div class="card"><h3>Loyihalash qoidalari</h3>${RULES.map((r) => `<label style="display:block"><input type="checkbox" data-rule="${r.id}" ${(p.rulesDisabled ?? []).includes(r.id) ? '' : 'checked'}> ${r.id} ${esc(r.code)} <span class="muted">(${r.category}, ${r.severity})</span></label>`).join('')}</div>
    <div class="card"><h3>Interfeys</h3>
      <div class="prop"><label>Til</label><select id="set-lang">${Object.entries(LANG_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><span></span></div>
      <div class="prop"><label>Mavzu</label><select id="set-theme"><option value="system">Tizim</option><option value="light">Yorug‘</option><option value="dark">Qorong‘i</option></select><span></span></div>
      <div class="prop"><label>Avto-saqlash</label>${inp('settings.autosaveMin', s.autosaveMin, 'number')}<span class="u">min</span></div>
      <div class="prop"><label>Ta'minot rangi</label>${inp('settings.colors.supply', s.colors.supply, 'color')}<span></span></div>
      <div class="prop"><label>Qaytish rangi</label>${inp('settings.colors.return', s.colors.return, 'color')}<span></span></div>
      <div class="prop"><label>Ish maydoni</label><select id="set-ws"><option value="full">To‘liq</option><option value="drafting">Chizmachilik (panelsiz)</option><option value="engineering">Muhandislik</option></select><span></span></div>
      <label><input type="checkbox" id="telemetry" ${app.telemetry ? 'checked' : ''}> Anonim telemetriya (faqat xatolar va unumdorlik, loyiha mazmunisiz)</label>
    </div>
    <div class="card"><h3>Jamoa va rollar</h3>
      <div class="prop"><label>Joriy rol</label><select id="set-role">${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${k === app.role ? 'selected' : ''}>${r.name}</option>`).join('')}</select><span></span></div>
      <table class="tbl"><tr><th>Rol</th><th>Ruxsatlar</th></tr>${Object.values(ROLES).map((r) => `<tr><td>${r.name}</td><td>${r.perms.join(', ')}</td></tr>`).join('')}</table>
      <p class="muted" style="font-size:11px">Bulut sinxronizatsiyasi, 2FA va server tomonidagi avtorizatsiya — backlog (docs/BACKLOG.md). API: ${API_ROUTES.length} endpoint shartnomasi tayyor.</p>
    </div>
    <div class="card"><h3>Shablonlar</h3>${Object.entries(TEMPLATES).map(([k, tp]) => `<div class="list-item"><span class="grow">${esc(tp.name)}</span><button class="btn small" data-tpl="${k}">Sozlamalarni qo‘llash</button></div>`).join('')}</div>
    <div class="card"><h3>Xonalar turlari</h3><table class="tbl"><tr><th>Tur</th><th>t, °C</th><th>n, 1/h</th></tr>${Object.entries(ROOM_TYPES).map(([k, r]) => `<tr><td>${k}</td><td class="n">${r.tIn}</td><td class="n">${r.ach}</td></tr>`).join('')}</table></div>
  </div>`;
  el.querySelector('#set-lang').value = app.lang;
  el.querySelector('#set-theme').value = app.theme;
  el.querySelectorAll('[data-path]').forEach((i) => (i.onchange = () => {
    const path = i.dataset.path.split('.');
    let v = i.type === 'number' ? Number(i.value) : i.value;
    if (path[0] === 'meta') return store.apply({ meta: { [path[1]]: v } }, 'meta');
    if (path[1] === 'climate' && path[2] === 'city') {
      const c = CLIMATE.find((x) => x.city === v);
      return store.apply({ settings: { climate: { city: c.city, tOut: c.tOut, manual: false }, country: c.country } }, 'climate');
    }
    if (path[1] === 'climate' && path[2] === 'tOut') return store.apply({ settings: { climate: { tOut: v, manual: true } } }, 'climate');
    const patch = {};
    let o = patch;
    for (let k = 1; k < path.length - 1; k++) o = o[path[k]] = {};
    o[path[path.length - 1]] = v;
    store.apply({ settings: patch }, `settings:${path.slice(1).join('.')}`);
    if (path[1] === 'colors') app.plan.readColors();
  }));
  el.querySelector('#add-cur').onclick = () => {
    const c = prompt('Valyuta kodi (masalan KZT):');
    const r = Number(prompt('1 USD = ?'));
    if (c && r > 0) store.apply({ settings: { rates: { [c.toUpperCase()]: r } } }, 'currency');
  };
  const lvls = () => JSON.parse(JSON.stringify(p.levels));
  el.querySelectorAll('[data-lvl]').forEach((i) => (i.onchange = () => {
    const ls = lvls();
    const l = ls.find((x) => x.id === i.dataset.lvl);
    l[i.dataset.f] = i.dataset.f === 'name' ? i.value : Number(i.value);
    store.apply({ levels: ls }, 'level');
  }));
  el.querySelectorAll('[data-del-lvl]').forEach((b) => (b.onclick = () => {
    if (p.levels.length < 2) return app.toast('Kamida bitta qavat bo‘lishi kerak', 'error');
    const id = b.dataset.delLvl;
    const els = Object.values(p.elements).filter((e) => e.levelId === id || e.levelFrom === id || e.levelTo === id).map((e) => e.id);
    if (els.length && !confirm(`${els.length} ta element o‘chiriladi. Davom etilsinmi?`)) return;
    store.apply({ levels: lvls().filter((l) => l.id !== id), remove: els }, 'level:delete');
    if (store.activeLevelId === id) store.setLevel(p.levels[0].id);
  }));
  el.querySelector('#add-lvl').onclick = () => app.run('level');
  el.querySelector('#copy-lvl').onclick = () => app.copyLevel();
  el.querySelectorAll('[data-rule]').forEach((c) => (c.onchange = () => {
    const dis = new Set(p.rulesDisabled ?? []);
    if (c.checked) dis.delete(c.dataset.rule);
    else dis.add(c.dataset.rule);
    p.rulesDisabled = [...dis];
    store.changed('rules');
  }));
  el.querySelector('#set-lang').onchange = (e) => app.setLang(e.target.value);
  el.querySelector('#set-theme').onchange = (e) => app.setTheme(e.target.value);
  el.querySelector('#set-role').onchange = (e) => app.setRole(e.target.value);
  el.querySelector('#set-ws').onchange = (e) => app.setWorkspace(e.target.value);
  el.querySelector('#telemetry').onchange = (e) => app.setTelemetry(e.target.checked);
  el.querySelectorAll('[data-tpl]').forEach((b) => (b.onclick = () => {
    store.apply({ settings: TEMPLATES[b.dataset.tpl].settings }, `template:${b.dataset.tpl}`);
    app.toast(`${TEMPLATES[b.dataset.tpl].name} qo‘llandi`);
  }));
}

// ---------------- installation / as-built (mobile friendly) ----------------
export function renderInstall(el, app) {
  const { store } = app;
  const p = store.project;
  const res = store.results;
  if (!res) return;
  let h = `<h2>${t('v_install')} · As-Built</h2><p class="muted">Loyiha → Montaj → As-Built. Har bir element uchun haqiqiy mahsulot, joy, montajchi, sana, izoh va foto saqlanadi.</p>`;
  for (const l of sortedLevels(p)) {
    for (const r of elementsOf(p, 'room', l.id)) {
      const rads = elementsOf(p, 'radiator', l.id).filter((x) => res.radiators[x.id]?.roomId === r.id);
      const u = res.ufh[r.id];
      if (!rads.length && !u) continue;
      h += `<h3>${esc(l.name)} · ${esc(r.number)} ${esc(r.name)}</h3><div class="install-grid">`;
      for (const x of rads) {
        const rr = res.radiators[x.id];
        const c = res.circuits.find((q) => q.elementId === x.id);
        const sp = c?.path?.map((id) => res.pipes[id]).filter(Boolean) ?? [];
        const ab = x.asBuilt ?? {};
        h += `<div class="install-card"><h4>${esc(x.mark)} — ${esc(rr?.product?.model ?? '')}</h4>
          <div class="kv"><span>Artikul</span><span>${esc(rr?.product?.article)}</span><span>O‘lcham H×L</span><span>${Math.round((rr?.product?.height ?? 0) * 1000)}×${Math.round((rr?.product?.length ?? 0) * 1000)} mm</span><span>Poldan</span><span>${Math.round((x.mountHeight ?? 0.1) * 1000)} mm</span><span>Ulanish</span><span>${x.flip ? 'o‘ng ta’minot' : 'chap ta’minot'}, ${rr?.product?.connection}</span><span>Quvvat</span><span>${f0(rr?.output)} W</span><span>Klapan sozlamasi</span><span>${esc(c?.balance?.setting ?? '—')}</span><span>Quvurlar</span><span>${sp.map((q) => `${q.material} Ø${q.dn} ${f1(q.length)}m`).join(', ')}</span></div>
          <div class="prop"><label>O‘rnatildi</label><input type="checkbox" data-ab="${x.id}" data-f="installed" ${ab.installed ? 'checked' : ''} style="width:auto"><span></span></div>
          <div class="prop"><label>Haqiqiy mahsulot</label><input data-ab="${x.id}" data-f="product" value="${esc(ab.product ?? '')}"><span></span></div>
          <div class="prop"><label>Montajchi</label><input data-ab="${x.id}" data-f="installer" value="${esc(ab.installer ?? '')}"><span></span></div>
          <div class="prop"><label>Sana</label><input type="date" data-ab="${x.id}" data-f="date" value="${esc(ab.date ?? '')}"><span></span></div>
          <div class="prop"><label>Izoh</label><input data-ab="${x.id}" data-f="comment" value="${esc(ab.comment ?? '')}"><span></span></div>
          <div class="btn-row"><button class="btn small" data-photo="${x.id}">📷 Foto${ab.photos?.length ? ` (${ab.photos.length})` : ''}</button><button class="btn small" data-qr="${x.id}">QR</button><button class="btn small" data-iss="${x.id}">+ Muammo</button></div></div>`;
      }
      if (u) h += `<div class="install-card"><h4>Pol isitish</h4><div class="kv"><span>Qadam</span><span>${u.spacing * 1000} mm</span><span>Konturlar</span><span>${u.loops} × ${f1(u.loopLength)} m</span><span>Quvur</span><span>${u.pipe.material} ${u.pipe.dn}×2</span><span>Rotametr</span><span>${(u.flowPerLoopLh / 60).toFixed(2)} l/min</span><span>Kollektor</span><span>${esc(p.elements[u.collectorId]?.mark ?? '—')}</span></div></div>`;
      h += '</div>';
    }
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-ab]').forEach((i) => (i.onchange = () => {
    const x = p.elements[i.dataset.ab];
    const v = i.type === 'checkbox' ? i.checked : i.value;
    store.apply({ update: [{ id: x.id, patch: { asBuilt: { ...(x.asBuilt ?? {}), [i.dataset.f]: v, updated: new Date().toISOString(), by: app.role } } }] }, 'asbuilt');
  }));
  el.querySelectorAll('[data-photo]').forEach((b) => (b.onclick = () => app.pickImage((url) => {
    const x = p.elements[b.dataset.photo];
    store.apply({ update: [{ id: x.id, patch: { asBuilt: { ...(x.asBuilt ?? {}), photos: [...(x.asBuilt?.photos ?? []), url] } } }] }, 'asbuilt:photo');
  })));
  el.querySelectorAll('[data-qr]').forEach((b) => (b.onclick = () => app.showQR(b.dataset.qr)));
  el.querySelectorAll('[data-iss]').forEach((b) => (b.onclick = () => app.newIssue(b.dataset.iss)));
}

// ---------------- issues ----------------
export function renderIssues(el, app) {
  const { store } = app;
  const p = store.project;
  el.innerHTML = `<h2>${t('v_issues')}</h2><div class="doc-toolbar"><button class="btn small primary" id="iss-new">+ Yangi muammo</button><button class="btn small" id="iss-tg">Telegramga holat</button></div>
  <table class="tbl"><tr><th>ID</th><th>Element</th><th>Tavsif</th><th>Foto</th><th>Holat</th><th>Muhimlik</th><th>Mas’ul</th><th>Sana</th><th>Yechim</th></tr>
  ${p.issues.map((i, k) => `<tr><td>${esc(i.id)}</td><td class="clickable" data-go="${esc(i.elementId ?? '')}">${esc(p.elements[i.elementId]?.mark ?? '—')}</td><td>${esc(i.description)}</td><td>${i.photo ? `<img src="${i.photo}" style="max-width:60px">` : ''}</td>
  <td><select data-iss="${k}" data-f="status">${['open', 'in_progress', 'resolved', 'closed'].map((s) => `<option ${s === i.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
  <td><select data-iss="${k}" data-f="priority">${['low', 'medium', 'high', 'critical'].map((s) => `<option ${s === i.priority ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
  <td><input data-iss="${k}" data-f="responsible" value="${esc(i.responsible ?? '')}" size="10"></td><td>${esc(i.date)}</td><td><input data-iss="${k}" data-f="resolution" value="${esc(i.resolution ?? '')}"></td></tr>`).join('') || '<tr><td colspan="9" class="muted">Muammolar yo‘q</td></tr>'}</table>`;
  el.querySelector('#iss-new').onclick = () => app.newIssue(store.selected[0]?.id ?? null);
  el.querySelector('#iss-tg').onclick = () => app.telegramDialog(statusText(p, store.results));
  el.querySelectorAll('[data-go]').forEach((td) => (td.onclick = () => td.dataset.go && app.focusElement(td.dataset.go)));
  el.querySelectorAll('[data-iss]').forEach((i) => (i.onchange = () => {
    p.issues[Number(i.dataset.iss)][i.dataset.f] = i.value;
    p.issues[Number(i.dataset.iss)].history = [...(p.issues[Number(i.dataset.iss)].history ?? []), { f: i.dataset.f, v: i.value, at: new Date().toISOString(), by: app.role }];
    store.changed('issue');
  }));
}

// ---------------- help ----------------
export function renderHelp(el) {
  el.innerHTML = `<h2>Yordam — ZODPRO Heating BIM</h2>
  <p>${esc(t('help_intro'))}</p>
  <h3>Tezkor ish tartibi</h3><ol>
   <li><b>Qavat</b>lar: Sozlamalar → Qavatlar (belgilar 0.000, +3.300 …).</li>
   <li><b>Devor</b> (W): tashqi devorlarni chizing (Ctrl bilan — ichki devor). Masofani buyruq qatoriga yozish mumkin: <code>6</code>, <code>@3,0</code>.</li>
   <li><b>Xona</b> (RM): devorlar ichiga bosing — avtomatik aniqlanadi. Xususiyatlarda tur, harorat, isitish turi.</li>
   <li><b>Deraza/Eshik</b> (WIN/DR): devor ustiga bosing.</li>
   <li><b>Avto radiator</b>: deraza ostiga joylashtiradi va issiqlik yo‘qotishga ko‘ra tanlaydi.</li>
   <li><b>Kollektor / Qozon</b> joylashtiring, so‘ng <b>Avto quvur</b> — radial (kollektorli) trassirovka, boshqa qavatlarga stoyaklar bilan.</li>
   <li>Hisob avtomatik: issiqlik yo‘qotish → radiator → sarf → diametr → gidravlika → balanslash → nasos → qozon → bak → BOM → smeta → tekshiruv.</li>
   <li><b>Spetsifikatsiya</b>, <b>Varaqlar</b> (PDF), DXF/IFC/Excel eksport.</li></ol>
  <h3>Klaviatura</h3><table class="tbl">${[['Esc', 'Bekor / tanlashga qaytish'], ['Enter / ikki marta bosish', 'Chizishni tugatish'], ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'], ['Ctrl+S', 'Saqlash (.zph)'], ['Ctrl+K yoki F1', 'Buyruqlar palitrasi'], ['Delete', 'O‘chirish'], ['F3 / F7 / F8 / F9', 'Obyekt snap / To‘r / Orto / Snap'], ['R', 'Joylashtirishda 90° burish'], ['Space+sichqoncha, o‘rta tugma', 'Panorama'], ['Shift/Ctrl+bosish', 'Tanlovga qo‘shish'], ['Chapdan o‘ngga ramka', 'Oyna tanlov (to‘liq ichida)'], ['O‘ngdan chapga ramka', 'Kesishuvchi tanlov']].map(([a, b]) => `<tr><td><code>${a}</code></td><td>${b}</td></tr>`).join('')}</table>
  <h3>Buyruq qatori</h3><p>W devor · RM xona · RP xona poligon · WIN deraza · DR eshik · RAD radiator · PS/PR quvur · RS stoyak · COL kollektor · UFH TP kollektor · B qozon · PU nasos · TH termostat · OB to‘siq · L chiziq · PL polilinya · C aylana · A yoy · REC to‘rtburchak · H shtrix · T matn · LE vynoska · D o‘lcham · MEA o‘lchash · M ko‘chirish · CO nusxa · RO burish · MI oyna · AR massiv · O offset · TR trim · EX extend · SP bo‘lish · F fillet · E o‘chirish · U undo · Z moslash · ? yordam</p>
  <h3>Muhandislik ma’lumotnomasi</h3><ul>
   <li>Uzatish: Q = U·A·ΔT·(1+Σβ)·n; U = 1/(Rsi+Σδ/λ+Rse) (EN ISO 6946).</li>
   <li>Havo: Q = ρ·c·L·ΔT, ρ = 353/(273+t<sub>tash</sub>).</li>
   <li>Grunt poli: zonalar usuli (SP 60/SNiP 2.04.05).</li>
   <li>Radiator: Q = Q<sub>nom</sub>·(ΔT<sub>lm</sub>/49.83)<sup>n</sup> (EN 442).</li>
   <li>Quvur: Darsi–Veysbax, λ — Swamee–Jain (Colebrook bilan 3% ichida), laminar 64/Re.</li>
   <li>Klapan: ΔP = (V/Kv)²·10⁵ Pa.</li>
   <li>Nasos: tizim egri chizig‘i H = a·Q², ishchi nuqta — nasos egri chizig‘i bilan kesishuv.</li>
   <li>Kengaytirish baki: EN 12828 Annex D.</li>
   <li>Pol isitish: q = 8.92·(θ<sub>F</sub>−θ<sub>i</sub>)<sup>1.1</sup> (EN 1264), K<sub>H</sub> qadam bo‘yicha.</li></ul>
  <h3>Cheklovlar</h3><p>To‘liq ro‘yxat va reja: <code>docs/REQUIREMENTS_MATRIX.md</code>, <code>docs/BACKLOG.md</code>. Demo katalog — ishlab chiqaruvchi ma’lumotlari bilan almashtiring. Yopiq halqali tarmoqlar (Hardy-Cross), native DWG/RVT, bulut va LLM — backlogda.</p>`;
}

export { newElement, levelById };
