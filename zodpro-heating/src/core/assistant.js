// Natural-language command assistant (deterministic intent parser, uz / ru / en).
// It NEVER invents engineering values: every answer quotes model data / calculation results,
// and it asks for missing critical parameters. An LLM backend can be plugged in later through
// the same intent interface (backlog AI-LLM), but calculations stay in the deterministic engines.

import { elementsOf, sortedLevels, isHeated } from './model.js';
import { autoPlaceRadiators, autoRoute, autoPlaceCollector } from './autodesign.js';

const ROOM_WORDS = {
  bedroom: ['yotoq', 'спальн', 'bedroom'],
  living: ['mehmon', 'zal', 'гостин', 'living'],
  kitchen: ['oshxona', 'кухн', 'kitchen'],
  bathroom: ['sanuzel', 'hammom', 'ванн', 'санузел', 'bath'],
  corridor: ['koridor', 'dahliz', 'коридор', 'corridor', 'hall'],
  office: ['ofis', 'kabinet', 'офис', 'кабинет', 'office'],
};

function levelFromText(project, text) {
  const m = text.match(/(\d+)\s*[-‑]?\s*(qavat|этаж|floor|level)/i) || text.match(/(qavat|этаж|floor|level)\s*(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]) || Number(m[2]);
  return sortedLevels(project)[n - 1] ?? null;
}

function roomTypeFromText(text) {
  for (const [k, words] of Object.entries(ROOM_WORDS)) if (words.some((w) => text.includes(w))) return k;
  return null;
}

/** @returns {{reply:string, select?:string[], changes?:{cs,label}, view?:string}} */
export function interpret(text, app) {
  const q = text.toLowerCase().replace(/[ʻʼ‘’`]/g, "'").trim();
  const p = app.store.project;
  const res = app.store.results;
  const level = levelFromText(p, q);
  const rt = roomTypeFromText(q);
  const dnm = q.match(/dn\s*(\d+)|ø\s*(\d+)|(\d+)\s*mm/);
  const dn = dnm ? dnm[1] || dnm[2] || dnm[3] : null;

  // --- place radiators ---
  if (/(radiator|радиатор).*(qo'y|qoy|qo‘y|joyla|постав|размест|place|add)/.test(q) || /(qo'y|qo‘y|joyla|постав|place).*(radiator|радиатор)/.test(q)) {
    const before = elementsOf(p, 'room').filter((r) => (!level || r.levelId === level.id) && (!rt || r.roomType === rt));
    if (!before.length) return { reply: `Mos xona topilmadi${rt ? ` (turi: ${rt})` : ''}${level ? `, ${level.name}` : ''}.` };
    const temp = { ...p, elements: Object.fromEntries(Object.entries(p.elements).filter(([, e]) => e.cat !== 'room' || before.includes(e))) };
    const cs = autoPlaceRadiators(temp);
    if (!cs.add.length) return { reply: 'Tanlangan xonalarda radiatorlar allaqachon bor.' };
    return { reply: `${before.length} ta xona uchun ${cs.add.length} ta radiator joylashtiraman (deraza ostiga, avtomatik tanlov bilan).`, changes: { cs, label: 'ai:radiators' } };
  }

  // --- check pipes ---
  if (/(quvur|труб|pipe)/.test(q) && /(tekshir|провер|check)/.test(q)) {
    const pipes = Object.values(res?.pipes ?? {}).filter((x) => (!dn || x.dn === String(dn)) && (!level || p.elements[x.elementId]?.levelId === level.id));
    if (!pipes.length) return { reply: `Mos quvur topilmadi${dn ? ` (DN${dn})` : ''}${level ? ` — ${level.name}` : ''}.` };
    const bad = pipes.filter((x) => x.status === 'warning' || x.status === 'critical');
    const low = pipes.filter((x) => x.status === 'low');
    const vmax = Math.max(...pipes.map((x) => x.v));
    return {
      reply: `${pipes.length} ta quvur tekshirildi${dn ? ` (DN${dn})` : ''}${level ? `, ${level.name}` : ''}.\nMaks. tezlik: ${vmax.toFixed(2)} m/s (ruxsat ${p.settings.velMin}–${p.settings.velMax}).\nChegaradan oshgan: ${bad.length} ta${bad.length ? ` → ${bad.map((b) => p.elements[b.elementId]?.mark).join(', ')}` : ''}.\nPast tezlik: ${low.length} ta.\nJami uzunlik: ${pipes.reduce((a, x) => a + x.length, 0).toFixed(1)} m.`,
      select: pipes.map((x) => x.elementId),
    };
  }

  // --- show collectors / radiators / etc ---
  if (/(ko'rsat|ko‘rsat|korsat|покаж|show|select|tanla)/.test(q)) {
    const map = { collector: /(kollektor|коллектор|manifold|collector)/, radiator: /(radiator|радиатор)/, boiler: /(qozon|котел|котёл|boiler)/, riser: /(stoyak|стояк|riser)/, pipe: /(quvur|труб|pipe)/ };
    for (const [cat, re] of Object.entries(map)) {
      if (re.test(q) && !/nasos|насос|pump/.test(q)) {
        const ids = elementsOf(p, cat).filter((e) => !level || e.levelId === level.id || e.levelFrom === level.id).map((e) => e.id);
        return { reply: `${ids.length} ta ${cat} topildi va tanlandi.`, select: ids };
      }
    }
  }

  // --- pump ---
  if (/(nasos|насос|pump)/.test(q)) {
    if (!res?.circuits?.some((c) => c.connected)) {
      const missing = [];
      if (!elementsOf(p, 'boiler').length) missing.push('qozon');
      if (!elementsOf(p, 'radiator').length && !Object.keys(res?.ufh ?? {}).length) missing.push('isitish asboblari');
      if (!elementsOf(p, 'pipe').length) missing.push('quvurlar (yoki "avto quvur")');
      return { reply: `Nasos tanlash uchun gidravlik hisob kerak. Yetishmayapti: ${missing.join(', ') || 'ulangan kontur'}. Iltimos, avval ularni qo‘shing.` };
    }
    const r = res.pump;
    return { reply: `Tizim: Q = ${r.q.toFixed(2)} m³/h, H = ${r.h.toFixed(2)} m (kritik kontur ${p.elements[res.critical.elementId]?.mark}, ΔP ${(res.critical.dp / 1000).toFixed(1)} kPa × ${p.settings.pumpHeadMargin}).\nTanlangan: ${r.product?.model ?? 'mos nasos yo‘q'}${r.builtIn ? ' (qozon ichidagi)' : ''}${r.operatingPoint ? `, ishchi nuqta ${r.operatingPoint.q.toFixed(2)} m³/h @ ${r.operatingPoint.h.toFixed(2)} m` : ''}.`, view: 'reports' };
  }

  // --- missing radiators / heating check ---
  if (/(yetishma|yetmay|не хватает|недостат|missing|enough|tekshir|провер|check)/.test(q) || /(xona|комнат|room)/.test(q)) {
    const numM = q.match(/(\d+)\s*[-‑]?\s*(xona|комнат|room)/);
    let rooms = elementsOf(p, 'room').filter((r) => !level || r.levelId === level.id);
    if (numM) {
      const n = numM[1];
      rooms = rooms.filter((r) => String(r.number).endsWith(n) || String(r.number) === n || r.name.includes(n));
    }
    if (!rooms.length) return { reply: 'Bunday xona topilmadi. Xona raqamini yoki qavatni aniqlashtiring.' };
    const lines = rooms.map((r) => {
      const hl = res.rooms[r.id];
      if (!isHeated(r)) return `• ${r.number} ${r.name}: isitilmaydi`;
      const cov = hl.emitters?.coverage ?? 0;
      return `• ${r.number} ${r.name}: talab ${Math.round(hl.required)} W, o‘rnatilgan ${Math.round((hl.emitters?.radiatorOutput ?? 0) + (hl.emitters?.ufhOutput ?? 0))} W → ${Math.round(cov * 100)}% ${cov >= 0.95 ? '✓' : '✖ yetarli emas'}`;
    });
    const bad = rooms.filter((r) => isHeated(r) && (res.rooms[r.id].emitters?.coverage ?? 0) < 0.95);
    return { reply: `${lines.join('\n')}${bad.length ? `\n\n${bad.length} ta xonada isitish yetarli emas. "radiator qo‘y" deb yozsangiz avtomatik joylashtiraman.` : ''}`, select: rooms.map((r) => r.id) };
  }

  if (/(avto|auto).*(quvur|trass|route)|quvurlarni ula|трассир/.test(q)) {
    const cs = autoRoute(p, (el) => res?.radiators?.[el.id]?.product);
    if (!cs.add.length) return { reply: `Ulanmagan radiator yo‘q yoki kollektor/qozon yetishmaydi.${cs.warnings.length ? ' Ogohlantirishlar: ' + cs.warnings.map((w) => w.code).join(', ') : ''}` };
    return { reply: `${cs.add.length} ta quvur/stoyak avtomatik trassirovka qilinadi.`, changes: { cs, label: 'ai:route' } };
  }
  if (/(kollektor|коллектор).*(qo'y|qo‘y|joyla|постав)/.test(q)) {
    const lv = level ?? sortedLevels(p).find((l) => l.id === app.store.activeLevelId);
    const cs = autoPlaceCollector(p, lv.id);
    return cs.add.length ? { reply: `${lv.name} ga kollektor joylashtiraman.`, changes: { cs, label: 'ai:collector' } } : { reply: 'Bu qavatda kollektor allaqachon bor.' };
  }
  if (/(yo'qotish|yo‘qotish|qancha|теплопотер|heat loss|jami)/.test(q)) {
    return { reply: `Bino issiqlik yo‘qotishi: ${Math.round(res.totals.heatLoss)} W (${(res.totals.heatLoss / Math.max(res.totals.area, 1)).toFixed(0)} W/m², ${res.totals.area.toFixed(1)} m²).\nUzatish: ${Math.round(res.totals.transmission)} W · Havo: ${Math.round(res.totals.ventilation)} W.\nQozon: ${res.boiler.requiredKw.toFixed(1)} kVt talab → ${res.boiler.product?.model ?? '—'}.` };
  }
  if (/(xato|ошиб|error|muammo|warning|ogohl)/.test(q)) {
    const f = res.validation.findings;
    if (!f.length) return { reply: 'Loyihada xato yo‘q ✓' };
    return { reply: f.slice(0, 12).map((x) => `• [${x.severity}] ${x.code}${x.elementId ? ` (${p.elements[x.elementId]?.mark || p.elements[x.elementId]?.name || ''})` : ''}`).join('\n') + (f.length > 12 ? `\n… yana ${f.length - 12}` : ''), view: 'dashboard' };
  }
  return {
    reply: 'Tushunmadim. Misollar:\n• "Barcha yotoqxonalarga radiator qo‘y"\n• "2-qavatdagi barcha DN20 quvurlarni tekshir"\n• "Kollektorlarni ko‘rsat"\n• "Bu tizimga nasos tanla"\n• "3-qavatdagi 12-xonada radiator yetishmayaptimi?"\n• "Issiqlik yo‘qotish qancha?"\n• "Xatolarni ko‘rsat"\n• "Avto quvur"',
  };
}
