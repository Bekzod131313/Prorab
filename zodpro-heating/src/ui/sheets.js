// Sheet system & automatic documentation package (cover, notes, plans, schematic, riser,
// axonometry, sections, schedules, calculations, specification, optional estimate).
import { sortedLevels, elementsOf } from '../core/model.js';
import { schematicSVG, riserSVG, axonometrySVG, sectionSVG } from './schematic.js';
import { scheduleDefs, tableHTML, esc, f0, f1 } from './reports.js';
import { planSVG, ufhAxoSVG, specBlockHTML, doc } from './drawingsvg.js';
import { manifoldNodeParts } from '../engines/bom.js';

export function buildSheets(project, res, { includeCost = false } = {}) {
  if (!res) return [];
  const sheets = [];
  const add = (no, title, html) => sheets.push({ no, title, html });
  const s = project.settings;
  const defs = scheduleDefs(project, res);
  const def = (k) => defs.find((d) => d.key === k);
  add('A-001', 'Muqova va umumiy ko‘rsatkichlar', `<div style="width:100%;padding:10px 30px;align-self:flex-start;display:grid;grid-template-columns:1.1fr 1fr;gap:28px">
    <div><div style="font-size:26px;font-weight:800;color:#1e6ef2">ZODPRO</div>
    <h1 style="margin:6px 0 2px;font-size:26px">${esc(project.meta.name)}</h1>
    <div style="font-size:13px">Isitish tizimi loyihasi (OV) · Bosqich: ${esc(project.meta.stage)}</div>
    <table class="tbl" style="margin-top:14px"><tbody>
      <tr><td>Buyurtmachi</td><td>${esc(project.meta.client)}</td></tr><tr><td>Manzil</td><td>${esc(project.meta.address)}</td></tr>
      <tr><td>Loyiha raqami</td><td>${esc(project.meta.number)}</td></tr><tr><td>Standart</td><td>${esc(s.standard)}</td></tr>
      <tr><td>Hisobiy tashqi harorat</td><td>${s.climate.tOut} °C (${esc(s.climate.city)})</td></tr><tr><td>Issiqlik tashuvchi</td><td>suv ${s.regime.ts}/${s.regime.tr} °C</td></tr>
      <tr><td>Isitiladigan maydon</td><td>${f1(res.totals.area)} m²</td></tr><tr><td>Issiqlik yuklamasi</td><td>${f0(res.totals.heatLoss)} W</td></tr>
      <tr><td>Qozon</td><td>${esc(res.boiler.product?.model ?? '—')}</td></tr><tr><td>Tizim hajmi</td><td>${f0(res.totals.systemL)} l</td></tr>
    </tbody></table></div>
    <div><h3 style="margin-top:6px">Umumiy ko‘rsatmalar</h3>
    <ol style="font-size:11px;line-height:1.5">
      <li>Loyiha ${esc(s.standard)} standartlar to‘plami bo‘yicha bajarilgan; standartlar aralashtirilmagan.</li>
      <li>Quvurlar: ${esc(s.pipeMaterial)}; montaj ishlab chiqaruvchi ko‘rsatmasiga muvofiq. Devordan o‘tishda gilza qo‘yilsin (${res.clashes?.sleeves ?? 0} dona).</li>
      <li>Radiatorlar pol sathidan 100 mm balandlikda, deraza o‘qiga markazlab o‘rnatiladi.</li>
      <li>Ishga tushirishdan oldin tizim 1.5×ishchi bosimda (kamida 6 bar) gidravlik sinovdan o‘tkazilsin.</li>
      <li>Balanslash klapanlari "Balanslash" jadvalidagi sozlamalarga o‘rnatilsin.</li>
      <li>Kengaytirish baki: ${esc(res.expansion.tank?.model ?? '—')}, p0 = ${res.expansion.p0?.toFixed(2)} bar.</li>
    </ol>
    <h3>Varaqlar ro‘yxati</h3><div id="sheet-index" style="font-size:11px"></div></div></div>`);
  let n = 1;
  const H = () => `H-${String(n++).padStart(3, '0')}`;
  const D = doc(project);
  const levels = sortedLevels(project);
  levels.forEach((l, i) => {
    const hasUfh = elementsOf(project, 'room', l.id).some((r) => res.ufh[r.id]);
    const hasRad = elementsOf(project, 'radiator', l.id).length || elementsOf(project, 'pipe', l.id).length;
    const onLevel = (r) => r.ids.some((id) => project.elements[id]?.levelId === l.id);
    if (hasUfh) add(H(), `${i + 1}-${D.floor.toUpperCase()} · ${D.ufhZone}`, `<div class="dwg">${planSVG(project, res, l.id, 'ufh')}</div>`);
    if (hasRad) add(H(), `${i + 1}-${D.floor} · ${D.radTrace}`, `<div class="dwg">${planSVG(project, res, l.id, 'radiator')}<div class="dwg-spec">${specBlockHTML(project, res, (r) => onLevel(r) && !r.key.startsWith('col|ufh'))}</div></div>`);
    if (hasUfh) add(H(), `${D.ufhScheme} ${i + 1}-${D.floor}`, `<div class="dwg">${ufhAxoSVG(project, res, l.id)}<div class="dwg-spec">${specBlockHTML(project, res, (r) => onLevel(r) && r.key.startsWith('col|ufh'))}</div></div>`);
  });
  // manifold connection node — one sheet per manifold type
  const types = new Map();
  for (const c of elementsOf(project, 'collector')) {
    const nOut = Math.max(c.outlets ?? 4, res.ufhPorts?.[c.id] ?? 0);
    const k = `${c.kind}|${nOut}`;
    if (!types.has(k)) types.set(k, { kind: c.kind, n: nOut, mixing: c.kind === 'ufh' && c.mixing !== false, count: 0 });
    types.get(k).count++;
  }
  for (const t of types.values()) {
    const parts = manifoldNodeParts(t.n);
    const rows = [...parts.map(([, name, unit, qty], i) => [i + 1, name, unit === 'dona' ? '' : unit, qty]), [parts.length + 1, t.kind === 'ufh' ? 'Коллектор расходомерный для теплого пола' : 'Коллектор расходомерный для радиатора', `${t.n}-контур`, 1]];
    add(H(), `${D.node} (${t.n}-контур${t.kind === 'ufh' ? ', ТП' : ''})`, `<div class="dwg node-dwg"><div class="mnode" data-n="${t.n}" data-kind="${t.kind}" data-mixing="${t.mixing ? 1 : 0}"><span class="muted">3D render…</span></div>
      <div class="dwg-spec"><b>${D.parts}</b> <span class="muted">(${t.count} шт. в проекте)</span><table class="tbl" style="font-size:9px"><tr><th>${D.pos}</th><th>${D.name}</th><th>${D.type}</th><th>${D.qty}</th></tr>${rows.map((r) => `<tr><td>${r[0]}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td class="n">${r[3]}</td></tr>`).join('')}</table></div></div>`);
  }
  add(H(), 'Prinsipial sxema', schematicSVG(project, res, s.colors));
  add(H(), 'Stoyaklar sxemasi', riserSVG(project, res, s.colors));
  add(H(), 'Aksonometrik sxema', axonometrySVG(project, res, s.colors));
  for (const sec of elementsOf(project, 'section')) add(H(), `Kesim ${esc(sec.name)}`, sectionSVG(project, res, sec, s.colors));
  add(H(), 'Uskunalar va radiatorlar jadvali', `<div style="width:100%;align-self:flex-start">${tableHTML(def('equipment'))}${tableHTML(def('radiators'))}</div>`);
  add(H(), 'Quvurlar jadvali va gidravlik hisob', `<div style="width:100%;align-self:flex-start">${tableHTML(def('pipes'))}${tableHTML(def('circuits'))}${tableHTML(def('balancing'))}</div>`);
  add(H(), 'Issiqlik yo‘qotish hisobi', `<div style="width:100%;align-self:flex-start">${tableHTML(def('rooms'))}${Object.keys(res.ufh).length ? tableHTML(def('ufh')) : ''}</div>`);
  add(H(), 'Material spetsifikatsiyasi', `<div style="width:100%;align-self:flex-start">${tableHTML({ ...def('bom'), columns: def('bom').columns.filter((c) => includeCost || !['price', 'sum'].includes(c.key)) })}</div>`);
  if (includeCost) {
    const c = res.cost;
    add(H(), 'Smeta', `<table class="tbl" style="max-width:560px"><tbody><tr><td>Materiallar (chiqindi bilan)</td><td class="n">${f0(c.material)} ${c.currency}</td></tr><tr><td>shu jumladan chiqindi</td><td class="n">${f0(c.waste)}</td></tr><tr><td>Montaj ishi (${s.laborPct}%)</td><td class="n">${f0(c.labor)}</td></tr><tr><td>Transport (${s.transportPct}%)</td><td class="n">${f0(c.transport)}</td></tr><tr class="total"><td>JAMI</td><td class="n">${f0(c.total)} ${c.currency}</td></tr><tr><td>Kurs</td><td class="n">1 USD = ${c.rate} ${c.currency} (${esc(c.ratesDate)}, ${esc(c.ratesSource)})</td></tr></tbody></table>`);
  }
  sheets[0].html = sheets[0].html.replace('<div id="sheet-index" style="font-size:11px"></div>', `<div style="font-size:11px">${sheets.map((x) => `${x.no} — ${esc(x.title)}`).join('<br>')}</div>`);
  return sheets;
}

export function sheetHTML(project, sheet, total, index = 1) {
  const m = project.meta;
  const rev = project.revisions[project.revisions.length - 1];
  const blank = '<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
  const person = (role, name, date = '') => `<tr><td colspan="2">${esc(role)}</td><td colspan="2">${esc(name)}</td><td></td><td>${esc(date)}</td></tr>`;
  const year = (m.date ?? '').slice(0, 4);
  return `<div class="sheet" data-no="${esc(sheet.no)}">
    <div class="frame"></div>
    <div class="content">${sheet.html}</div>
    <div class="gost">
      <div class="gost-code">ОВ</div>
      <table class="gost-left">
        ${blank}${blank}
        <tr><th>Изм.</th><th>Кол.уч</th><th>Лист</th><th>№док</th><th>Подп.</th><th>Дата</th></tr>
        <tr><th colspan="2">Должность</th><th colspan="2">Фамилия</th><th>Подпись</th><th>Дата</th></tr>
        ${person('Рук.раб.', m.checker || '', year)}
        ${person('Исполн.', m.designer || '')}
        ${person('Разработ.', m.designer || '')}
        <tr><td colspan="6" class="rev">Rev ${esc(rev?.no ?? '00')} · ${esc(rev?.what ?? '')}</td></tr>
      </table>
      <table class="gost-right">
        <tr><td colspan="3" class="gost-project">${esc(m.name)}${m.address ? `, ${esc(m.address)}` : ''}</td></tr>
        <tr><td rowspan="2" class="gost-sheet-title">${esc(sheet.title)}</td><th>Стадия</th><th>Лист</th><th>Листов</th></tr>
        <tr><td>${esc(m.stage === 'P' ? 'РП' : m.stage || 'РП')}</td><td>${index}</td><td>${total}</td></tr>
        <tr><td class="gost-num">${esc(m.number)} · ${esc(sheet.no)}</td><td colspan="3" class="gost-logo">ZODPRO</td></tr>
      </table>
    </div>
  </div>`;
}
