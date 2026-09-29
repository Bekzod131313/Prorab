// Material takeoff (BOM) and cost estimation.
// exact quantity → waste factor → purchase quantity (rounded to sale units: bars / pieces).

import { PIPE_MATERIALS, VALVES, COLLECTORS, FITTING_PRICES, fittingSizeFactor } from '../data/products.js';
import { elementsOf } from '../core/model.js';
import { polygonArea } from '../core/util.js';
import { pipeType as ufhPipeType } from './ufh/pipes.js';

export const BOM_VERSION = 'bom/1.1';

function addItem(map, key, item) {
  const cur = map.get(key);
  if (cur) cur.qty += item.qty;
  else map.set(key, { ...item });
}

/** Parts of one manifold connection node (as on the "Узел подключения коллектора" sheet). */
export function manifoldNodeParts(outlets) {
  return [
    ['ppr-red-40-32', 'Переход ППР 40×32', 'dona', 2, 0.9],
    ['bv-angle-25', 'Кран шаровой угловой с полусгоном DN25 × 1"', 'dona', 2, 11],
    ['adapter-32-1', 'Адаптер полипропиленовый с нар. резьбой 32×1"', 'dona', 2, 2.4],
    ['elbow-32', 'Отвод ППР 32×32', 'dona', 4, 0.5],
    ['nipple-1', 'Ниппель 1"', 'dona', 1, 1.6],
    ['sleeve-red-16', 'Защитная втулка на теплоизоляцию dn16, красная', 'dona', outlets, 0.35],
    ['sleeve-blue-16', 'Защитная втулка на теплоизоляцию dn16, синяя', 'dona', outlets, 0.35],
    ['actuator', 'Электропривод для коллектора', 'dona', outlets, 17],
    ['balancing-1', 'Балансировочный клапан DN 1"', 'dona', 1, 34],
  ];
}

export function buildBom(project, res, net) {
  const s = project.settings;
  const waste = s.wasteFactor ?? 0.07;
  const items = new Map();

  // pipes by material / diameter
  const pipeLen = new Map();
  for (const p of Object.values(res.pipes)) {
    const k = `${p.material}|${p.dn}`;
    pipeLen.set(k, (pipeLen.get(k) ?? 0) + p.length);
    const el = project.elements[p.elementId];
    const mat = PIPE_MATERIALS[p.material];
    // elbows (not for bendable PEX/PERT)
    if (!['PEX', 'PERT'].includes(p.material) && p.bends) {
      addItem(items, `elbow|${p.material}|${p.dn}`, { group: 'fittings', name: `Burchak 90° ${p.material} Ø${p.dn}`, article: `ZP-EL-${p.material}-${p.dn}`, unit: 'dona', qty: p.bends, unitUsd: FITTING_PRICES.elbow * fittingSizeFactor(p.dn), waste: 0 });
    }
    if (mat && mat.barLength <= 6) {
      const couplings = Math.max(0, Math.ceil(p.length / mat.barLength) - 1);
      if (couplings) addItem(items, `coupling|${p.material}|${p.dn}`, { group: 'fittings', name: `Mufta ${p.material} Ø${p.dn}`, article: `ZP-CP-${p.material}-${p.dn}`, unit: 'dona', qty: couplings, unitUsd: FITTING_PRICES.coupling * fittingSizeFactor(p.dn), waste: 0 });
    }
    addItem(items, `clip|${p.dn}`, { group: 'accessories', name: `Quvur qisqichi Ø${p.dn}`, article: `ZP-CL-${p.dn}`, unit: 'dona', qty: Math.ceil(p.length / 0.8), unitUsd: FITTING_PRICES.clip * fittingSizeFactor(p.dn), waste: 0.05 });
    if (el?.insulated) {
      addItem(items, `ins|${p.dn}`, { group: 'insulation', name: `Quvur izolyatsiyasi Ø${p.dn}×9 mm`, article: `ZP-INS-${p.dn}`, unit: 'm', qty: p.length, unitUsd: FITTING_PRICES.insulation_m * fittingSizeFactor(p.dn), waste });
    }
  }
  for (const [k, L] of pipeLen) {
    const [material, dn] = k.split('|');
    const mat = PIPE_MATERIALS[material];
    const size = mat?.sizes.find((z) => z.dn === dn);
    const bar = mat?.barLength ?? 1;
    const purchase = bar <= 6 ? Math.ceil((L * (1 + waste)) / bar) * bar : Math.ceil(L * (1 + waste));
    items.set(`pipe|${k}`, { group: 'pipes', name: `Quvur ${mat?.name ?? material} Ø${dn}`, article: `ZP-PIPE-${material}-${dn}`, sapArticle: `SAP-60${material}${dn}`, unit: 'm', qty: L, waste, purchase, unitUsd: size?.usd ?? 1 });
  }

  // tees at junction nodes
  if (net) {
    for (const n of net.nodes.values()) {
      if (!n.tee) continue;
      const pipeEdges = n.edges.filter((e) => e.kind === 'pipe');
      if (!pipeEdges.length) continue;
      const dns = pipeEdges.map((e) => res.pipes[e.elementId]?.dn).filter(Boolean);
      const dn = dns.sort((a, b) => Number(b) - Number(a))[0] ?? '20';
      const material = res.pipes[pipeEdges[0].elementId]?.material ?? s.pipeMaterial;
      addItem(items, `tee|${material}|${dn}`, { group: 'fittings', name: `Troynik ${material} Ø${dn}`, article: `ZP-TEE-${material}-${dn}`, unit: 'dona', qty: 1, unitUsd: FITTING_PRICES.tee * fittingSizeFactor(dn), waste: 0 });
    }
  }

  // radiators + valves
  for (const [id, r] of Object.entries(res.radiators)) {
    if (!r.product) continue;
    const el = project.elements[id];
    addItem(items, `rad|${r.product.id}`, { group: 'radiators', name: `Radiator ${r.product.model}`, article: r.product.article, sapArticle: r.product.sapArticle, unit: 'dona', qty: 1, unitUsd: r.product.priceUsd, waste: 0 });
    addItem(items, 'rad_bracket', { group: 'accessories', name: 'Radiator kronshteyn to‘plami', article: 'ZP-BRK', unit: 'kompl', qty: 1, unitUsd: FITTING_PRICES.radiator_bracket_set, waste: 0 });
    addItem(items, 'air_vent', { group: 'accessories', name: 'Mayevskiy krani', article: 'ZP-AV', unit: 'dona', qty: 1, unitUsd: FITTING_PRICES.air_vent, waste: 0 });
    if (el?.valves !== false) {
      addItem(items, 'trv', { group: 'valves', name: VALVES.trv.model, article: VALVES.trv.article, unit: 'dona', qty: 1, unitUsd: VALVES.trv.usd, waste: 0 });
      addItem(items, 'head', { group: 'valves', name: VALVES.head.model, article: VALVES.head.article, unit: 'dona', qty: 1, unitUsd: VALVES.head.usd, waste: 0 });
      addItem(items, 'lockshield', { group: 'valves', name: VALVES.lockshield.model, article: VALVES.lockshield.article, unit: 'dona', qty: 1, unitUsd: VALVES.lockshield.usd, waste: 0 });
    }
  }

  // collectors
  for (const c of elementsOf(project, 'collector')) {
    const loops = res.ufhPorts?.[c.id] ?? 0;
    const need = c.kind === 'ufh' ? Math.max(2, loops) : c.outlets ?? 4;
    const prod = COLLECTORS.find((p) => p.outlets >= need) ?? COLLECTORS[COLLECTORS.length - 1];
    addItem(items, `col|${prod.id}|${c.kind}`, { group: 'collectors', name: `${prod.model}${c.kind === 'ufh' ? ' (pol isitish, rotametrli)' : ''}`, article: prod.article, sapArticle: prod.sapArticle, unit: 'dona', qty: 1, unitUsd: prod.usd + (c.kind === 'ufh' ? prod.ufhUsdExtra : 0), waste: 0 });
    // manifold connection node (узел подключения коллектора) — same parts list as the detail sheet
    const used = c.kind === 'ufh' ? Math.max(loops, 1) : Math.max(1, res.circuits.filter((x) => x.connected && x.path.includes(c.id)).length);
    for (const [key, name, unit, qty, usd] of manifoldNodeParts(used)) addItem(items, `node|${key}`, { group: 'fittings', name, article: `ZP-NODE-${key}`, unit, qty, unitUsd: usd, waste: 0 });
    if (c.kind === 'ufh' && c.mixing !== false) {
      addItem(items, 'mixing', { group: 'equipment', name: 'Aralashtirish uzeli (3-yo‘lli klapan + nasos + termometr)', article: 'ZP-MIX-01', unit: 'kompl', qty: 1, unitUsd: 240, waste: 0 });
    }
  }

  // UFH materials
  for (const u of Object.values(res.ufh)) {
    const mat = PIPE_MATERIALS[u.pipe.material];
    const size = mat?.sizes.find((z) => z.dn === String(u.pipe.dn));
    addItem(items, `ufhpipe|${u.pipe.material}|${u.pipe.dn}`, { group: 'ufh', name: `Pol isitish quvuri ${u.pipe.material} ${u.pipe.dn}×2`, article: `ZP-UFH-${u.pipe.material}-${u.pipe.dn}`, unit: 'm', qty: u.totalLength, unitUsd: size?.usd ?? 0.7, waste: 0.05 });
    addItem(items, 'ufh_clip', { group: 'ufh', name: 'Pol isitish qisqichi (garpun)', article: 'ZP-UFH-CLIP', unit: 'dona', qty: Math.ceil(u.totalLength * 3), unitUsd: FITTING_PRICES.ufh_pipe_clip, waste: 0.05 });
    addItem(items, 'ufh_ins', { group: 'ufh', name: 'Issiqlik izolyatsiya plitasi (pol isitish)', article: 'ZP-UFH-INS', unit: 'm²', qty: u.area, unitUsd: FITTING_PRICES.ufh_insulation_m2, waste: 0.05 });
    addItem(items, 'ufh_edge', { group: 'ufh', name: 'Demfer lenta', article: 'ZP-UFH-EDGE', unit: 'm', qty: u.perimeter, unitUsd: FITTING_PRICES.ufh_edge_strip_m, waste: 0.1 });
  }

  // UFH engine loops (stored pipes: exact lengths per pipe type)
  for (const l of elementsOf(project, 'ufh_loop')) {
    const pt = ufhPipeType(l.pipeType);
    addItem(items, `ufhpipe2|${pt.id}`, { group: 'ufh', name: `Pol isitish quvuri ${pt.label}`, article: `ZP-UFH-${pt.id}`, unit: 'm', qty: l.length, unitUsd: pt.od >= 0.02 ? 1.1 : 0.7, waste: 0.05 });
    addItem(items, 'ufh_clip', { group: 'ufh', name: 'Pol isitish qisqichi (garpun)', article: 'ZP-UFH-CLIP', unit: 'dona', qty: Math.ceil(l.length * 3), unitUsd: FITTING_PRICES.ufh_pipe_clip, waste: 0.05 });
  }
  for (const z of elementsOf(project, 'ufh_zone')) {
    const a = Math.abs(polygonArea(z.points));
    const per = z.points.reduce((acc, p, i) => acc + Math.hypot(z.points[(i + 1) % z.points.length].x - p.x, z.points[(i + 1) % z.points.length].y - p.y), 0);
    addItem(items, 'ufh_ins', { group: 'ufh', name: 'Issiqlik izolyatsiya plitasi (pol isitish)', article: 'ZP-UFH-INS', unit: 'm²', qty: a, unitUsd: FITTING_PRICES.ufh_insulation_m2, waste: 0.05 });
    addItem(items, 'ufh_edge', { group: 'ufh', name: 'Demfer lenta', article: 'ZP-UFH-EDGE', unit: 'm', qty: per, unitUsd: FITTING_PRICES.ufh_edge_strip_m, waste: 0.1 });
  }

  // thermostats
  const nThermo = elementsOf(project, 'thermostat').length;
  if (nThermo) addItem(items, 'thermostat', { group: 'controls', name: 'Xona termostati', article: 'ZP-RT', unit: 'dona', qty: nThermo, unitUsd: FITTING_PRICES.thermostat_room, waste: 0 });

  // boiler room
  if (res.boiler?.product && res.boiler.element) {
    const b = res.boiler.product;
    addItem(items, `boiler|${b.id}`, { group: 'equipment', name: b.model, article: b.article, sapArticle: b.sapArticle, unit: 'dona', qty: 1, unitUsd: b.usd, waste: 0 });
    addItem(items, 'safety', { group: 'equipment', name: 'Xavfsizlik guruhi (klapan 3 bar, manometr, havo chiqargich)', article: 'ZP-SG', unit: 'kompl', qty: 1, unitUsd: FITTING_PRICES.safety_group, waste: 0 });
    addItem(items, 'filter', { group: 'equipment', name: 'Magnit-mexanik filtr', article: 'ZP-FLT', unit: 'dona', qty: 1, unitUsd: FITTING_PRICES.filter, waste: 0 });
  }
  if (res.pump?.product && res.pump.element) {
    const p = res.pump.product;
    addItem(items, `pump|${p.id}`, { group: 'equipment', name: p.model, article: p.article, sapArticle: p.sapArticle, unit: 'dona', qty: 1, unitUsd: p.usd, waste: 0 });
    addItem(items, 'check', { group: 'valves', name: 'Teskari klapan', article: 'ZP-CHK', unit: 'dona', qty: 1, unitUsd: FITTING_PRICES.check_valve, waste: 0 });
  }
  if (res.expansion?.tank && res.boiler?.element) {
    const t = res.expansion.tank;
    addItem(items, `exp|${t.id}`, { group: 'equipment', name: t.model, article: t.article, unit: 'dona', qty: 1, unitUsd: t.usd, waste: 0 });
  }

  // wall penetrations (sleeves) from clash analysis
  const sleeves = res.clashes?.sleeves ?? 0;
  if (sleeves) addItem(items, 'sleeve', { group: 'accessories', name: 'Devor gilzasi', article: 'ZP-SLV', unit: 'dona', qty: sleeves, unitUsd: 0.6, waste: 0 });

  const rows = [...items.values()].map((it) => {
    const purchase = it.purchase ?? (it.unit === 'dona' || it.unit === 'kompl' ? Math.ceil(it.qty * (1 + (it.waste ?? 0))) : Math.ceil(it.qty * (1 + (it.waste ?? 0)) * 10) / 10);
    return { ...it, purchase, totalUsd: purchase * it.unitUsd };
  });
  const order = ['equipment', 'radiators', 'collectors', 'pipes', 'fittings', 'valves', 'ufh', 'controls', 'insulation', 'accessories'];
  rows.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name));
  return { version: BOM_VERSION, waste, rows };
}

export function convert(usd, currency, rates) {
  const r = rates?.[currency];
  if (!r) throw new Error(`No exchange rate for ${currency}`);
  return usd * r;
}

export function costEstimate(project, bom) {
  const s = project.settings;
  const materialUsd = bom.rows.reduce((a, r) => a + r.totalUsd, 0);
  const exactUsd = bom.rows.reduce((a, r) => a + r.qty * r.unitUsd, 0);
  const wasteUsd = materialUsd - exactUsd;
  const laborUsd = (materialUsd * (s.laborPct ?? 0)) / 100;
  const transportUsd = (materialUsd * (s.transportPct ?? 0)) / 100;
  const totalUsd = materialUsd + laborUsd + transportUsd;
  const cur = s.currency ?? 'USD';
  const rate = s.rates?.[cur] ?? 1;
  return {
    currency: cur,
    rate,
    ratesDate: s.ratesDate,
    ratesSource: s.ratesSource,
    materialUsd,
    exactUsd,
    wasteUsd,
    laborUsd,
    transportUsd,
    totalUsd,
    material: materialUsd * rate,
    waste: wasteUsd * rate,
    labor: laborUsd * rate,
    transport: transportUsd * rate,
    total: totalUsd * rate,
  };
}
