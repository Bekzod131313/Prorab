// Engineering reports and schedules (HTML) + table definitions shared with CSV/Excel export.
import { elementsOf, levelById, roomTemp, sortedLevels } from '../core/model.js';
import { t, msg } from '../core/i18n.js';
import { VALVES } from '../data/products.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f0 = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('ru-RU') : '—');
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');

/** Schedule definitions: {key, title, rows(project,res), columns[]}. Columns are user-configurable. */
export function scheduleDefs(project, res) {
  const lvl = (id) => levelById(project, id)?.name ?? '';
  const roomName = (id) => project.elements[id]?.name ?? '';
  return [
    {
      key: 'rooms',
      title: t('r_heatloss'),
      rows: () => elementsOf(project, 'room').map((r) => ({ el: r, hl: res.rooms[r.id] })).sort((a, b) => lvl(a.el.levelId).localeCompare(lvl(b.el.levelId)) || String(a.el.number).localeCompare(String(b.el.number))),
      columns: [
        { key: 'level', label: t('floor'), get: (r) => lvl(r.el.levelId) },
        { key: 'number', label: t('number'), get: (r) => r.el.number },
        { key: 'name', label: t('room'), get: (r) => r.el.name },
        { key: 'area', label: `${t('area')}, m²`, get: (r) => +r.hl.inputs.area.toFixed(2), n: 1 },
        { key: 'volume', label: `${t('volume')}, m³`, get: (r) => +r.hl.inputs.volume.toFixed(1), n: 1 },
        { key: 'tin', label: 't, °C', get: (r) => r.hl.inputs.tIn, n: 1 },
        { key: 'trans', label: `${t('transmission')}, W`, get: (r) => Math.round(r.hl.transmission), n: 1 },
        { key: 'vent', label: `${t('ventilation')}, W`, get: (r) => Math.round(r.hl.ventilation), n: 1 },
        { key: 'inf', label: `${t('infiltration')}, W`, get: (r) => Math.round(r.hl.infiltration), n: 1 },
        { key: 'total', label: `${t('total')}, W`, get: (r) => Math.round(r.hl.total), n: 1 },
        { key: 'req', label: `${t('required')}, W`, get: (r) => Math.round(r.hl.required), n: 1 },
        { key: 'spec', label: 'W/m²', get: (r) => Math.round(r.hl.specific), n: 1 },
        { key: 'cov', label: `${t('coverage')}, %`, get: (r) => (r.hl.emitters?.coverage ? Math.round(r.hl.emitters.coverage * 100) : ''), n: 1 },
      ],
    },
    {
      key: 'radiators',
      title: t('r_radiators'),
      rows: () => elementsOf(project, 'radiator').map((e) => ({ el: e, r: res.radiators[e.id], c: res.circuits.find((c) => c.elementId === e.id) })).sort((a, b) => String(a.el.mark).localeCompare(String(b.el.mark))),
      columns: [
        { key: 'mark', label: t('mark'), get: (r) => r.el.mark },
        { key: 'level', label: t('floor'), get: (r) => lvl(r.el.levelId) },
        { key: 'room', label: t('room'), get: (r) => roomName(r.r?.roomId) },
        { key: 'model', label: t('model'), get: (r) => r.r?.product?.model ?? '' },
        { key: 'article', label: t('article'), get: (r) => r.r?.product?.article ?? '' },
        { key: 'hxl', label: 'H×L, mm', get: (r) => (r.r?.product ? `${Math.round(r.r.product.height * 1000)}×${Math.round(r.r.product.length * 1000)}` : '') },
        { key: 'q75', label: 'Q 75/65/20, W', get: (r) => r.r?.nominal75 ?? '', n: 1 },
        { key: 'q', label: `Q ${project.settings.regime.ts}/${project.settings.regime.tr}/${r0(project)}, W`, get: (r) => Math.round(r.r?.output ?? 0), n: 1 },
        { key: 'design', label: `${t('required')}, W`, get: (r) => Math.round(r.r?.designQ ?? 0), n: 1 },
        { key: 'mode', label: t('selection'), get: (r) => (r.r?.mode === 'manual' ? t('manual') : t('auto')) },
        { key: 'flow', label: 'G, l/h', get: (r) => Math.round(r.c?.flowLh ?? 0), n: 1 },
        { key: 'setting', label: t('setting'), get: (r) => r.c?.balance?.setting ?? '' },
        { key: 'regime', label: 'Rejim', get: () => project.settings.regime.name ?? `${project.settings.regime.ts}/${project.settings.regime.tr}` },
      ],
    },
    {
      key: 'pipes',
      title: t('r_pipes'),
      rows: () => Object.values(res.pipes).map((p) => ({ p, el: project.elements[p.elementId] })),
      columns: [
        { key: 'mark', label: t('mark'), get: (r) => r.el?.mark },
        { key: 'level', label: t('floor'), get: (r) => lvl(r.el?.levelId ?? r.el?.levelFrom) },
        { key: 'kind', label: t('type'), get: (r) => (r.p.kind === 'riser' ? t('t_riser') : 'Quvur') },
        { key: 'system', label: t('system'), get: (r) => t(r.p.system) },
        { key: 'material', label: t('material'), get: (r) => r.p.material },
        { key: 'dn', label: 'Ø', get: (r) => r.p.dn },
        { key: 'length', label: `${t('length')}, m`, get: (r) => +r.p.length.toFixed(2), n: 1 },
        { key: 'q', label: 'Q, W', get: (r) => Math.round(r.p.Q), n: 1 },
        { key: 'flow', label: 'G, l/h', get: (r) => Math.round(r.p.flowLh), n: 1 },
        { key: 'v', label: 'v, m/s', get: (r) => +r.p.v.toFixed(3), n: 1 },
        { key: 'R', label: 'R, Pa/m', get: (r) => Math.round(r.p.R), n: 1 },
        { key: 'zeta', label: 'Σζ', get: (r) => +r.p.zeta.toFixed(2), n: 1 },
        { key: 'dp', label: 'ΔP, Pa', get: (r) => Math.round(r.p.dp), n: 1 },
        { key: 'status', label: 'Holat', get: (r) => r.p.status },
      ],
    },
    {
      key: 'circuits',
      title: t('r_hydraulic'),
      rows: () => res.circuits.filter((c) => c.connected),
      columns: [
        { key: 'mark', label: t('circuit'), get: (c) => project.elements[c.elementId]?.mark },
        { key: 'kind', label: t('type'), get: (c) => (c.kind === 'radiator' ? t('radiator') : t('ufh')) },
        { key: 'q', label: 'Q, W', get: (c) => Math.round(c.Q), n: 1 },
        { key: 'flow', label: 'G, l/h', get: (c) => Math.round(c.flowLh), n: 1 },
        { key: 'len', label: 'L, m', get: (c) => +c.length.toFixed(1), n: 1 },
        { key: 'dps', label: "ΔP ta'minot, kPa", get: (c) => +(c.dpSupply / 1000).toFixed(2), n: 1 },
        { key: 'dpr', label: 'ΔP qaytish, kPa', get: (c) => +(c.dpReturn / 1000).toFixed(2), n: 1 },
        { key: 'dpu', label: 'ΔP asbob+klapan, kPa', get: (c) => +(c.dpUnit / 1000).toFixed(2), n: 1 },
        { key: 'dpb', label: 'ΔP qozon, kPa', get: (c) => +(c.dpBoiler / 1000).toFixed(2), n: 1 },
        { key: 'dpt', label: 'ΔP jami, kPa', get: (c) => +(c.dpTotal / 1000).toFixed(2), n: 1 },
        { key: 'crit', label: 'Kritik', get: (c) => (res.critical?.elementId === c.elementId ? '★' : '') },
      ],
    },
    {
      key: 'balancing',
      title: t('r_balancing'),
      rows: () => res.circuits.filter((c) => c.connected && c.balance),
      columns: [
        { key: 'mark', label: t('circuit'), get: (c) => project.elements[c.elementId]?.mark },
        { key: 'flow', label: 'G, l/h', get: (c) => Math.round(c.flowLh), n: 1 },
        { key: 'need', label: 'ΔP ortiqcha, kPa', get: (c) => (c.balance.needPa !== undefined ? +(c.balance.needPa / 1000).toFixed(2) : ''), n: 1 },
        { key: 'kvreq', label: 'Kv kerak', get: (c) => (Number.isFinite(c.balance.kvRequired) ? +c.balance.kvRequired.toFixed(3) : '∞'), n: 1 },
        { key: 'setting', label: `${VALVES.lockshield.model}: ${t('setting')}`, get: (c) => c.balance.setting ?? c.balance.target },
        { key: 'kv', label: 'Kv', get: (c) => c.balance.kv ?? '', n: 1 },
        { key: 'before', label: 'Sarf og‘ishi oldin, %', get: (c) => (c.balance.flowBeforePct !== undefined ? +c.balance.flowBeforePct.toFixed(1) : ''), n: 1 },
        { key: 'after', label: 'Sarf og‘ishi keyin, %', get: (c) => (c.balance.flowAfterPct !== undefined ? +c.balance.flowAfterPct.toFixed(1) : ''), n: 1 },
        { key: 'auth', label: 'Klapan avtoriteti', get: (c) => (c.balance.authority !== undefined ? +c.balance.authority.toFixed(2) : ''), n: 1 },
      ],
    },
    {
      key: 'equipment',
      title: t('r_equipment'),
      rows: () => {
        const rows = [];
        if (res.boiler?.product && res.boiler.element) rows.push({ mark: project.elements[res.boiler.element]?.mark, name: res.boiler.product.model, article: res.boiler.product.article, data: `${res.boiler.product.powerKw} kVt, η=${res.boiler.product.efficiency}, ${res.boiler.product.modulation}` });
        if (res.pump?.product) rows.push({ mark: project.elements[res.pump.element]?.mark ?? (res.pump.builtIn ? 'qozonda' : '—'), name: res.pump.product.model, article: res.pump.product.article, data: `Q=${f2(res.pump.q)} m³/h, H=${f2(res.pump.h)} m` });
        if (res.expansion?.tank) rows.push({ mark: 'EXP', name: res.expansion.tank.model, article: res.expansion.tank.article, data: `Vn=${f1(res.expansion.Vn)} l, p0=${f2(res.expansion.p0)} bar` });
        for (const c of elementsOf(project, 'collector')) rows.push({ mark: c.mark, name: `Kollektor ${c.kind === 'ufh' ? '(TP)' : ''} ×${c.outlets}`, article: '', data: c.kind === 'ufh' && c.mixing !== false ? 'aralashtirish uzeli bilan' : '' });
        return rows;
      },
      columns: [
        { key: 'mark', label: t('mark'), get: (r) => r.mark },
        { key: 'name', label: t('name'), get: (r) => r.name },
        { key: 'article', label: t('article'), get: (r) => r.article },
        { key: 'data', label: 'Texnik ma’lumot', get: (r) => r.data },
      ],
    },
    {
      key: 'ufh',
      title: t('r_ufh'),
      rows: () => Object.values(res.ufh).map((u) => ({ u, el: project.elements[u.roomId] })),
      columns: [
        { key: 'room', label: t('room'), get: (r) => r.el?.name },
        { key: 'area', label: 'A, m²', get: (r) => +r.u.area.toFixed(1), n: 1 },
        { key: 'q', label: 'q, W/m²', get: (r) => Math.round(r.u.q), n: 1 },
        { key: 'cap', label: 'q max, W/m²', get: (r) => Math.round(r.u.capacity), n: 1 },
        { key: 'sp', label: 'Qadam, mm', get: (r) => Math.round(r.u.spacing * 1000), n: 1 },
        { key: 'loops', label: 'Konturlar', get: (r) => r.u.loops, n: 1 },
        { key: 'len', label: 'L kontur, m', get: (r) => +r.u.loopLength.toFixed(1), n: 1 },
        { key: 'flow', label: 'G, l/h', get: (r) => Math.round(r.u.flowPerLoopLh), n: 1 },
        { key: 'dp', label: 'ΔP, kPa', get: (r) => +(r.u.dpLoop / 1000).toFixed(2), n: 1 },
        { key: 'ts', label: 't pol, °C', get: (r) => +r.u.tSurf.toFixed(1), n: 1 },
        { key: 'pattern', label: 'Sxema', get: (r) => r.u.pattern },
        { key: 'col', label: 'Kollektor', get: (r) => project.elements[r.u.collectorId]?.mark ?? '—' },
      ],
    },
    {
      key: 'bom',
      title: t('r_bom'),
      rows: () => res.bom.rows,
      columns: [
        { key: 'group', label: t('group'), get: (r) => r.group },
        { key: 'name', label: t('name'), get: (r) => r.name },
        { key: 'article', label: t('article'), get: (r) => r.article },
        { key: 'sap', label: 'SAP', get: (r) => r.sapArticle ?? '' },
        { key: 'unit', label: t('unit'), get: (r) => r.unit },
        { key: 'qty', label: t('qty'), get: (r) => +r.qty.toFixed(2), n: 1 },
        { key: 'waste', label: `${t('waste')}, %`, get: (r) => Math.round((r.waste ?? 0) * 100), n: 1 },
        { key: 'purchase', label: t('purchase'), get: (r) => +r.purchase.toFixed(2), n: 1 },
        { key: 'price', label: `${t('price')}, ${project.settings.currency}`, get: (r) => Math.round(r.unitUsd * res.cost.rate), n: 1 },
        { key: 'sum', label: `${t('sum')}, ${project.settings.currency}`, get: (r) => Math.round(r.totalUsd * res.cost.rate), n: 1 },
      ],
    },
    {
      key: 'validation',
      title: t('r_validation'),
      rows: () => res.validation.findings,
      columns: [
        { key: 'sev', label: 'Daraja', get: (f) => f.severity },
        { key: 'rule', label: 'Qoida', get: (f) => f.rule },
        { key: 'el', label: t('element'), get: (f) => project.elements[f.elementId]?.mark || project.elements[f.elementId]?.name || '' },
        { key: 'msg', label: 'Xabar', get: (f) => msg(f.code, f.params) },
      ],
    },
  ];
}

const r0 = (p) => (p.settings.regime.ti ?? 20);

function colPrefs(key) {
  try {
    return JSON.parse(localStorage.getItem(`zodpro.cols.${key}`) ?? 'null');
  } catch {
    return null;
  }
}
export function setColPrefs(key, cols) {
  try {
    localStorage.setItem(`zodpro.cols.${key}`, JSON.stringify(cols));
  } catch {
    /* storage unavailable */
  }
}
export function visibleColumns(def) {
  const pref = colPrefs(def.key);
  return pref ? def.columns.filter((c) => pref.includes(c.key)) : def.columns;
}

export function tableHTML(def, opts = {}) {
  const cols = visibleColumns(def);
  const rows = def.rows();
  const head = cols.map((c) => `<th>${esc(c.label)}</th>`).join('');
  const body = rows
    .map((r) => {
      const id = r.el?.id ?? r.elementId ?? r.p?.elementId ?? '';
      return `<tr class="${id ? 'clickable' : ''}" data-id="${esc(id)}">${cols.map((c) => {
        const v = c.get(r);
        if (c.key === 'sev') return `<td><span class="sev ${esc(v)}">${esc(t(v))}</span></td>`;
        return `<td class="${c.n ? 'n' : ''}">${esc(typeof v === 'number' ? v.toLocaleString('ru-RU') : v)}</td>`;
      }).join('')}</tr>`;
    })
    .join('');
  const chooser = opts.chooser
    ? `<details class="colchooser"><summary class="btn small">Ustunlar</summary><div class="btn-row">${def.columns.map((c) => `<label><input type="checkbox" data-sched="${def.key}" data-col="${c.key}" ${cols.includes(c) ? 'checked' : ''}> ${esc(c.label)}</label>`).join(' ')}</div></details>`
    : '';
  return `${chooser}<table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="muted">—</td></tr>`}</tbody></table>`;
}

// ---------------- full engineering report ----------------

export function reportsHTML(project, res) {
  if (!res) return '<p class="muted">Hisob natijalari yo‘q.</p>';
  const s = project.settings;
  const T = res.totals;
  const cards = [
    [t('heat_loss'), `${f0(T.heatLoss)} W`, `${f0(T.heatLoss / Math.max(T.area, 1))} W/m² · ${f1(T.area)} m²`],
    [t('r_radiators'), `${f0(T.radiatorOutput)} W`, `${Object.keys(res.radiators).length} dona`],
    [t('ufh'), `${f0(T.ufhOutput)} W`, `${Object.values(res.ufh).reduce((a, u) => a + u.loops, 0)} kontur`],
    [t('water_flow'), `${f0(T.flowLh)} l/h`, `${f2(T.flowLh / 1000)} m³/h`],
    [t('r_boiler'), res.boiler?.product ? `${res.boiler.product.powerKw} kVt` : '—', `talab ${f1(res.boiler?.requiredKw)} kVt`],
    [t('r_pump'), res.pump?.product?.model ?? '—', `Q ${f2(res.pump?.q)} m³/h · H ${f2(res.pump?.h)} m`],
    [t('r_expansion'), res.expansion?.tank ? `${res.expansion.tank.volumeL} l` : '—', `Vn ${f1(res.expansion?.Vn)} l · V sist. ${f0(T.systemL)} l`],
    [t('r_cost'), `${f0(res.cost.total)} ${res.cost.currency}`, `${f0(res.cost.totalUsd)} USD`],
  ];
  let h = `<h2>Muhandislik hisobotlari</h2>
  <p class="muted">Standart: <b>${esc(s.standard)}</b> · Iqlim: ${esc(s.climate.city)} t<sub>tash</sub> = ${s.climate.tOut} °C${s.climate.manual ? ' (qo‘lda)' : ''} · Rejim ${s.regime.ts}/${s.regime.tr} °C · Hisob versiyasi <code>${esc(res.version)}</code> · ${esc(Object.values(res.engines).join(', '))}</p>
  <div class="cards">${cards.map(([a, b, c]) => `<div class="card"><div class="lbl">${esc(a)}</div><div class="big">${esc(b)}</div><div class="lbl">${esc(c)}</div></div>`).join('')}</div>`;

  // heat loss with breakdown
  h += `<h3>${t('r_heatloss')}</h3>`;
  for (const l of sortedLevels(project)) {
    const rooms = elementsOf(project, 'room', l.id);
    if (!rooms.length) continue;
    h += `<table class="tbl"><thead><tr><th colspan="9">${esc(l.name)} (${l.elevation >= 0 ? '+' : ''}${l.elevation.toFixed(3)})</th></tr><tr><th>${t('element')}</th><th>${t('orientation')}</th><th>A, m²</th><th>${t('U')}</th><th>${t('dT')}</th><th>β</th><th>n</th><th>${t('Q')}</th><th></th></tr></thead><tbody>`;
    for (const r of rooms) {
      const hl = res.rooms[r.id];
      h += `<tr class="total clickable" data-id="${r.id}"><td colspan="2">${esc(r.number)} ${esc(r.name)} · t=${roomTemp(r)} °C</td><td class="n">${f1(hl.inputs.area)}</td><td colspan="4" class="muted">V=${f1(hl.inputs.volume)} m³${hl.inputs.corner ? ' · burchak xona' : ''}</td><td class="n">${f0(hl.required)}</td><td></td></tr>`;
      for (const ln of hl.lines) h += `<tr class="sub"><td>${esc(lineName(ln.kind))}</td><td>${esc(ln.orient ?? '')}</td><td class="n">${f2(ln.area)}</td><td class="n">${f2(ln.U)}</td><td class="n">${f1(ln.dT)}</td><td class="n">${f2(ln.beta)}</td><td class="n">${ln.n}</td><td class="n">${f0(ln.Q)}</td><td></td></tr>`;
      h += `<tr class="sub"><td>${t('ventilation')} (${hl.inputs.achVent} 1/h)</td><td colspan="6">Q = ρ·c·L·ΔT = ${hl.rhoAir.toFixed(3)}·1005·${(hl.inputs.achVent * hl.inputs.volume).toFixed(1)}/3600·${hl.inputs.dT}</td><td class="n">${f0(hl.ventilation)}</td><td>${hl.airRule === 'vent' ? '✓' : ''}</td></tr>`;
      h += `<tr class="sub"><td>${t('infiltration')} (${hl.inputs.infAch} 1/h)</td><td colspan="6">Q = ρ·c·n·V·ΔT</td><td class="n">${f0(hl.infiltration)}</td><td>${hl.airRule === 'inf' ? '✓' : ''}</td></tr>`;
      if (hl.gains) h += `<tr class="sub"><td>Maishiy issiqlik</td><td colspan="6"></td><td class="n">−${f0(hl.gains)}</td><td></td></tr>`;
    }
    h += '</tbody></table>';
  }
  h += `<p class="muted">Havo: ${s.ventPolicy === 'max' ? 'ventilyatsiya va infiltratsiyadan kattasi olinadi (✓)' : 'ventilyatsiya + infiltratsiya yig‘indisi'}. Grunt ustidagi pol: zonalar usuli (2 m polosalar, R = 2.1 / 4.3 / 8.6 / 14.2 m²K/W + izolyatsiya). Yo‘nalish qo‘shimchalari: N/NE/NW/E 0.10, SE/W 0.05.</p>`;

  const defs = scheduleDefs(project, res);
  for (const key of ['radiators', 'pipes', 'circuits', 'balancing', 'ufh', 'equipment']) {
    const d = defs.find((x) => x.key === key);
    h += `<h3>${esc(d.title)}</h3>${tableHTML(d)}`;
  }

  // pump curve chart
  h += `<h3>${t('r_pump')}</h3>${pumpChartSVG(res)}`;
  h += `<div class="kv" style="max-width:520px"><span>Tizim sarfi Q</span><span>${f2(res.pump.q)} m³/h</span><span>Kritik kontur ΔP</span><span>${f1((res.critical?.dp ?? 0) / 1000)} kPa</span><span>Zaxira koeffitsiyenti</span><span>${s.pumpHeadMargin}</span><span>Talab qilingan bosim H</span><span>${f2(res.pump.h)} m</span><span>Tanlangan nasos</span><span>${esc(res.pump.product?.model ?? '—')}${res.pump.builtIn ? ' (qozon ichida)' : ''}</span><span>Ishchi nuqta</span><span>${res.pump.operatingPoint ? `${f2(res.pump.operatingPoint.q)} m³/h @ ${f2(res.pump.operatingPoint.h)} m` : '—'}</span><span>Tezlik nisbati (n/n₀)</span><span>${res.pump.speedRatio ? f2(res.pump.speedRatio) : '—'}</span><span>Gidravlik quvvat</span><span>${f0(res.pump.hydraulicPowerW)} W</span></div>`;

  h += `<h3>${t('r_boiler')}</h3><div class="kv" style="max-width:520px"><span>Isitish yuklamasi</span><span>${f0(T.heatLoss)} W</span><span>Tarqatish yo‘qotishi</span><span>${Math.round(res.boiler.distributionLoss * 100)} %</span><span>Issiq suv (DHW)</span><span>${f1(res.boiler.dhwKw)} kVt × ${res.boiler.dhwKw ? s.dhwSimultaneity : 0}</span><span>Zaxira</span><span>${res.boiler.reserve}</span><span>Talab qilingan quvvat</span><span>${f1(res.boiler.requiredKw)} kVt</span><span>Tanlangan qozon</span><span>${esc(res.boiler.product?.model ?? '—')}</span></div>`;

  const e = res.expansion;
  h += `<h3>${t('r_expansion')} (EN 12828)</h3><div class="kv" style="max-width:520px"><span>Tizim hajmi Vs</span><span>${f1(e.systemL)} l</span><span>Kengayish koeff. e (${e.tFill}→${e.tMax} °C)</span><span>${(e.e * 100).toFixed(2)} %</span><span>Ve = e·Vs</span><span>${f2(e.Ve)} l</span><span>Suv zaxirasi Vwr</span><span>${f2(e.Vwr)} l</span><span>Boshlang‘ich bosim p0</span><span>${f2(e.p0)} bar</span><span>Yakuniy bosim pe</span><span>${f2(e.pe)} bar (psv ${e.psv} bar)</span><span>Vn = (Ve+Vwr)(pe+1)/(pe−p0)</span><span>${f1(e.Vn)} l</span><span>Tavsiya</span><span>${esc(e.tank?.model ?? '—')}</span></div>`;
  return h;
}

function lineName(kind) {
  return { wall_ext: 'Tashqi devor', wall_int: 'Ichki devor', window: 'Deraza', door: 'Eshik', floor_ground: 'Pol (grunt)', roof: 'Tom / cherdak yopmasi' }[kind] ?? kind;
}

export function pumpChartSVG(res) {
  const p = res.pump?.product;
  if (!p) return '<p class="muted">Nasos tanlanmagan.</p>';
  const W = 520;
  const H = 280;
  const qMax = Math.max(p.qMax, (res.pump.q || 0) * 1.4);
  const hMax = p.h0 * 1.15;
  const X = (q) => 50 + (q / qMax) * (W - 70);
  const Y = (h) => H - 35 - (h / hMax) * (H - 60);
  let pump = '';
  let sys = '';
  for (let i = 0; i <= 40; i++) {
    const q = (qMax * i) / 40;
    const h = p.h0 - p.k * q * q;
    if (h >= 0) pump += `${i ? 'L' : 'M'}${X(q).toFixed(1)},${Y(h).toFixed(1)}`;
    const hs = (res.pump.systemA ?? (res.pump.h / Math.max(res.pump.q ** 2, 1e-9))) * q * q;
    if (hs <= hMax) sys += `${sys ? 'L' : 'M'}${X(q).toFixed(1)},${Y(hs).toFixed(1)}`;
  }
  const op = res.pump.operatingPoint;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${X(0)}" y1="${Y(hMax * f)}" x2="${X(qMax)}" y2="${Y(hMax * f)}" stroke="#ddd"/><text x="${X(0) - 6}" y="${Y(hMax * f) + 3}" font-size="9" text-anchor="end">${(hMax * f).toFixed(1)}</text>`).join('') +
    [0, 0.25, 0.5, 0.75, 1].map((f) => `<text x="${X(qMax * f)}" y="${H - 20}" font-size="9" text-anchor="middle">${(qMax * f).toFixed(1)}</text>`).join('');
  return `<svg class="schema-svg" style="max-width:560px" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui">${grid}
  <path d="${pump}" fill="none" stroke="#1e6ef2" stroke-width="2.2"/><path d="${sys}" fill="none" stroke="#e0312b" stroke-width="1.8" stroke-dasharray="6 3"/>
  <circle cx="${X(res.pump.q)}" cy="${Y(res.pump.h)}" r="4" fill="#e0312b"/>
  ${op ? `<circle cx="${X(op.q)}" cy="${Y(op.h)}" r="5" fill="none" stroke="#111" stroke-width="2"/><text x="${X(op.q) + 8}" y="${Y(op.h) - 6}" font-size="10">ishchi nuqta</text>` : ''}
  <text x="${W / 2}" y="${H - 4}" font-size="10" text-anchor="middle">Q, m³/h</text><text x="12" y="16" font-size="10">H, m</text>
  <text x="${W - 10}" y="18" font-size="10" text-anchor="end" fill="#1e6ef2">${esc(p.model)}</text><text x="${W - 10}" y="32" font-size="10" text-anchor="end" fill="#e0312b">tizim egri chizig‘i</text></svg>`;
}

export function dashboardHTML(project, res) {
  if (!res) return '';
  const v = res.validation;
  const sevs = ['critical', 'error', 'warning'];
  let h = `<h2>${t('dashboard_title')}</h2><div class="cards">
    <div class="card"><div class="lbl">[OK]</div><div class="big" style="color:var(--ok)">${v.counts.ok}</div><div class="lbl">qoida muvaffaqiyatli</div></div>
    <div class="card"><div class="lbl">[WARNING]</div><div class="big" style="color:var(--warn)">${v.counts.warning}</div></div>
    <div class="card"><div class="lbl">[ERROR]</div><div class="big" style="color:var(--err)">${v.counts.error}</div></div>
    <div class="card"><div class="lbl">[CRITICAL]</div><div class="big" style="color:var(--crit)">${v.counts.critical}</div></div>
  </div>`;
  if (!v.findings.length) h += `<p><span class="sev ok">OK</span> ${t('all_ok')}</p>`;
  h += `<table class="tbl"><thead><tr><th>Daraja</th><th>Qoida</th><th>Element</th><th>Xabar</th></tr></thead><tbody>`;
  const sorted = [...v.findings].sort((a, b) => sevs.indexOf(a.severity) - sevs.indexOf(b.severity));
  for (const f of sorted) {
    const el = project.elements[f.elementId];
    h += `<tr class="clickable" data-id="${esc(f.elementId ?? '')}"><td><span class="sev ${f.severity}">${t(f.severity)}</span></td><td>${f.rule}</td><td>${esc(el?.mark || el?.name || '')}</td><td>${esc(msg(f.code, f.params))}</td></tr>`;
  }
  h += '</tbody></table>';
  // clashes
  const cl = res.clashes?.clashes ?? [];
  h += `<h3>${t('v_clash')} (${cl.length}) · devor teshiklari (gilzalar): ${res.clashes?.sleeves ?? 0}</h3>`;
  if (cl.length) {
    h += `<table class="tbl"><thead><tr><th>ID</th><th>Turi</th><th>Daraja</th><th>Elementlar</th><th>Joy</th><th>Holat</th><th>Mas’ul</th></tr></thead><tbody>`;
    for (const c of cl) h += `<tr data-id="${c.a}" class="clickable"><td>${c.id}</td><td>${esc(c.kind)}</td><td><span class="sev ${c.severity}">${t(c.severity)}</span></td><td>${esc(project.elements[c.a]?.mark)} × ${esc(project.elements[c.b]?.mark || project.elements[c.b]?.kind)}</td><td>${c.pos.x.toFixed(2)}; ${c.pos.y.toFixed(2)}</td><td><select data-clash="${c.key}" data-f="status">${['new', 'active', 'reviewed', 'approved', 'resolved'].map((s) => `<option ${s === c.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td><td><input data-clash="${c.key}" data-f="assignee" value="${esc(c.assignee)}" size="10"></td></tr>`;
    h += '</tbody></table>';
  }
  h += `<h3>Hisob statistikasi</h3><div class="kv" style="max-width:420px"><span>Elementlar</span><span>${res.stats.elements}</span><span>Tarmoq tugunlari / qirralari</span><span>${res.net.nodes} / ${res.net.edges}</span><span>Hisob vaqti</span><span>${res.stats.ms.toFixed(1)} ms</span><span>Issiqlik keshi (inkremental)</span><span>${res.stats.heatLossCacheHits} xona</span><span>Versiya</span><span>${esc(res.version)}</span></div>`;
  return h;
}

export { f0, f1, f2, esc };
