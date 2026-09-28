// Sheet system & automatic documentation package (cover, notes, plans, schematic, riser,
// axonometry, sections, schedules, calculations, specification, optional estimate).
import { sortedLevels, elementsOf } from '../core/model.js';
import { exportSVG } from '../core/io.js';
import { schematicSVG, riserSVG, axonometrySVG, sectionSVG } from './schematic.js';
import { scheduleDefs, tableHTML, esc, f0, f1 } from './reports.js';

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
  for (const l of sortedLevels(project)) {
    if (!elementsOf(project, 'room', l.id).length && !elementsOf(project, 'pipe', l.id).length) continue;
    add(H(), `Isitish rejasi — ${l.name}`, exportSVG(project, res, l.id, s.colors));
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

export function sheetHTML(project, sheet, total) {
  const m = project.meta;
  const rev = project.revisions[project.revisions.length - 1];
  const revRows = project.revisions.slice(-4).map((r) => `<tr><td>${esc(r.no)}</td><td>${esc(r.date)}</td><td>${esc(r.by)}</td><td>${esc(r.what)}</td></tr>`).join('');
  return `<div class="sheet" data-no="${esc(sheet.no)}">
    <div class="frame"></div>
    <div class="content">${sheet.html}</div>
    <table class="revtable"><tr><th>Rev</th><th>Sana</th><th>Kim</th><th>O‘zgarish</th></tr>${revRows}</table>
    <div class="titleblock">
      <div class="logo-cell">ZODPRO<small style="font-size:8px;color:#333">Heating BIM</small></div>
      <div>Loyiha: <b>${esc(m.name)}</b></div><div>№ <b>${esc(m.number)}</b></div>
      <div>Buyurtmachi: ${esc(m.client)}</div><div>Rev: <b>${esc(rev?.no ?? '00')}</b></div>
      <div>Loyihachi: ${esc(m.designer)} · Tekshirdi: ${esc(m.checker)}</div><div>Sana: ${esc(m.date)}</div>
      <div><b>${esc(sheet.title)}</b></div><div class="sheet-no">${esc(sheet.no)} <small>(${total})</small></div>
    </div>
  </div>`;
}
