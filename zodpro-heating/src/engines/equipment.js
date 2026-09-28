// Pipe auto-sizing, pump selection, boiler selection, expansion vessel sizing.

import { PIPE_MATERIALS, PUMPS, BOILERS, EXPANSION_TANKS } from '../data/products.js';
import { pipeSegment } from './hydraulics.js';
import { expansionCoefficient, water } from './water.js';

export const EQUIPMENT_VERSION = 'equipment/1.1';

/**
 * Pipe diameter auto-sizing.
 * required flow → candidate diameters → velocity → R → constraints → pick the smallest valid.
 */
export function sizePipe({ vM3s, material, tm, velMin, velMax, maxR, preferred }) {
  const mat = PIPE_MATERIALS[material];
  if (!mat) return { selected: null, candidates: [], reason: 'unknown_material', warnings: [{ code: 'unknown_material', params: { material } }] };
  const candidates = mat.sizes.map((s) => {
    const seg = pipeSegment({ vM3s, dInner: s.id, k: mat.k, length: 1, tm });
    const okV = seg.v <= velMax;
    const okR = seg.R <= maxR;
    const lowV = seg.v < velMin;
    const inRange = !preferred || (Number(s.dn) >= Number(preferred.min ?? 0) && Number(s.dn) <= Number(preferred.max ?? 999));
    return { dn: s.dn, id: s.id, v: seg.v, R: seg.R, valid: okV && okR && inRange, lowV, okV, okR, inRange };
  });
  const warnings = [];
  let selected = candidates.find((c) => c.valid);
  let reason = 'smallest_valid';
  if (!selected) {
    selected = candidates[candidates.length - 1];
    reason = 'largest_available';
    warnings.push({ code: 'size_no_valid', params: { material } });
  }
  if (selected.lowV && vM3s > 0) warnings.push({ code: 'velocity_low', params: { v: selected.v.toFixed(2), min: velMin } });
  return {
    selected,
    alternatives: candidates.filter((c) => c.valid && c.dn !== selected.dn),
    candidates,
    reason,
    warnings,
  };
}

/**
 * Pump selection: system curve H = a·Q² through the design point; operating point is the
 * intersection with the pump curve H = h0 − k·Q² at max speed. For variable-speed pumps the
 * required speed ratio n/n0 = sqrt(H_req / H_op) is reported (affinity laws).
 */
export function selectPump({ qM3h, headM, catalog = PUMPS }) {
  const warnings = [];
  if (qM3h <= 0) return { pump: null, warnings: [{ code: 'pump_no_flow' }] };
  const a = headM / (qM3h * qM3h);
  const rows = catalog.map((p) => {
    const hAtQ = p.h0 - p.k * qM3h * qM3h;
    const qOp = Math.sqrt(p.h0 / (a + p.k));
    const hOp = a * qOp * qOp;
    const ok = hAtQ >= headM && qM3h <= p.qMax && qM3h >= p.qMin;
    return { ...p, hAtQ, qOp, hOp, ok, speedRatio: ok ? Math.sqrt(headM / Math.max(hAtQ, 1e-9)) : null };
  });
  const ok = rows.filter((r) => r.ok).sort((x, y) => x.powerW - y.powerW || x.usd - y.usd);
  if (!ok.length) {
    warnings.push({ code: 'pump_none', params: { q: qM3h.toFixed(2), h: headM.toFixed(2) } });
    return { pump: null, systemA: a, candidates: rows, warnings };
  }
  const pump = ok[0];
  const hydraulicPowerW = (water(70).rho * 9.80665 * headM * (qM3h / 3600));
  return {
    pump,
    q: qM3h,
    h: headM,
    systemA: a,
    operatingPoint: { q: pump.qOp, h: pump.hOp },
    speedRatio: pump.speedRatio,
    hydraulicPowerW,
    alternatives: ok.slice(1, 4),
    candidates: rows,
    warnings,
  };
}

/** Boiler capacity: heating load (+ distribution losses) + simultaneous DHW, × reserve. */
export function selectBoiler({ heatingW, dhwKw = 0, dhwSimultaneity = 0, distributionLoss = 0.05, reserve = 1.1, catalog = BOILERS }) {
  const heatingKw = (heatingW / 1000) * (1 + distributionLoss);
  const dhwPart = dhwKw * dhwSimultaneity;
  // DHW-priority boilers must also cover the full DHW load on their own.
  const requiredKw = Math.max(heatingKw + dhwPart, dhwKw) * reserve;
  const boiler = catalog.filter((b) => b.powerKw >= requiredKw).sort((a, b) => a.powerKw - b.powerKw)[0] ?? null;
  const warnings = boiler ? [] : [{ code: 'boiler_none', params: { kw: requiredKw.toFixed(1) } }];
  return { heatingKw, dhwKw, dhwPart, distributionLoss, reserve, requiredKw, boiler, warnings, alternatives: catalog.filter((b) => b.powerKw >= requiredKw).slice(1, 3) };
}

/**
 * Expansion vessel (EN 12828 Annex D):
 *   Ve  = e · Vs                      expansion volume
 *   Vwr = max(0.005 · Vs, 3 l)       water reserve
 *   p0  = hst/10 + 0.3 bar  (≥ 0.5)  precharge (static head + vapour margin)
 *   pe  = psv − 0.5 bar (psv ≤ 5)    final pressure
 *   Vn  = (Ve + Vwr) · (pe + 1) / (pe − p0)
 */
export function sizeExpansion({ systemL, tMax, tFill = 10, staticM, psv = 3, catalog = EXPANSION_TANKS }) {
  const e = expansionCoefficient(tFill, tMax);
  const Ve = e * systemL;
  const Vwr = Math.max(0.005 * systemL, 3);
  const p0 = Math.max(0.5, staticM / 10 + 0.3);
  const pe = psv <= 5 ? psv - 0.5 : psv * 0.9;
  const warnings = [];
  if (pe <= p0) {
    warnings.push({ code: 'exp_pressure_invalid', params: { p0: p0.toFixed(2), pe: pe.toFixed(2) } });
    return { e, Ve, Vwr, p0, pe, Vn: Infinity, tank: null, warnings };
  }
  const Vn = ((Ve + Vwr) * (pe + 1)) / (pe - p0);
  const tank = catalog.filter((t) => t.volumeL >= Vn).sort((a, b) => a.volumeL - b.volumeL)[0] ?? null;
  if (!tank) warnings.push({ code: 'exp_none', params: { v: Vn.toFixed(0) } });
  return { e, Ve, Vwr, p0, pe, psv, Vn, tank, systemL, tMax, tFill, warnings };
}
