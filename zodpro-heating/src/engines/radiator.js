// Radiator output recalculation and automatic selection (EN 442 characteristic).
//   ΔT_lm = (ts − tr) / ln((ts − ti)/(tr − ti))
//   Q = Q_nom · (ΔT_lm / ΔT_nom)^n,  Q_nom at 75/65/20 → ΔT_nom = 49.83 K

import { RADIATORS } from '../data/products.js';

export const RADIATOR_VERSION = 'radiator/1.1';
export const DT_NOMINAL = lmtd(75, 65, 20);

export const REGIMES = [
  { name: '75/65/20', ts: 75, tr: 65 },
  { name: '70/55/20', ts: 70, tr: 55 },
  { name: '65/55/20', ts: 65, tr: 55 },
  { name: '60/50/20', ts: 60, tr: 50 },
  { name: '55/45/20', ts: 55, tr: 45 },
];

export function lmtd(ts, tr, ti) {
  if (ts <= ti || tr <= ti) return 0;
  if (Math.abs(ts - tr) < 1e-9) return ts - ti;
  return (ts - tr) / Math.log((ts - ti) / (tr - ti));
}

export function correctionFactor(ts, tr, ti, n = 1.3) {
  const d = lmtd(ts, tr, ti);
  if (d <= 0) return 0;
  return (d / DT_NOMINAL) ** n;
}

export function outputAt(product, ts, tr, ti) {
  return product.q75 * correctionFactor(ts, tr, ti, product.n ?? 1.3);
}

/**
 * Automatic selection.
 * @param {number} required W (already including reserve)
 * @param {object} opts { ts, tr, ti, kind, type, maxHeight, maxLength, minLength, preferLength, catalog }
 * @returns {{ product, output, excess, alternatives[], reason, warnings[] }}
 */
export function selectRadiator(required, opts) {
  const catalog = opts.catalog ?? RADIATORS;
  const warnings = [];
  const cands = catalog
    .filter((p) => !opts.kind || p.kind === opts.kind)
    .filter((p) => !opts.type || String(p.type) === String(opts.type))
    .filter((p) => !opts.height || Math.abs(p.height - opts.height) < 1e-6)
    .filter((p) => !opts.maxHeight || p.height <= opts.maxHeight + 1e-6)
    .filter((p) => !opts.maxLength || p.length <= opts.maxLength + 1e-6)
    .filter((p) => !opts.minLength || p.length >= opts.minLength - 1e-6)
    .map((p) => ({ product: p, output: outputAt(p, opts.ts, opts.tr, opts.ti) }))
    .filter((c) => c.output >= required);
  if (!cands.length) {
    warnings.push({ code: 'rad_no_candidate', params: { required: Math.round(required) } });
    return { product: null, output: 0, excess: -required, alternatives: [], reason: 'none', warnings };
  }
  // rank: smallest excess first; tie-break: closest to preferred length, then cheaper
  const pref = opts.preferLength ?? null;
  cands.sort((a, b) => {
    const ea = a.output - required;
    const eb = b.output - required;
    const band = Math.max(40, required * 0.05); // outputs within 5 % are "equivalent"
    if (Math.abs(ea - eb) > band) return ea - eb;
    if (pref) {
      const la = Math.abs(a.product.length - pref);
      const lb = Math.abs(b.product.length - pref);
      if (Math.abs(la - lb) > 0.05) return la - lb;
    }
    return a.product.priceUsd - b.product.priceUsd;
  });
  const best = cands[0];
  return {
    product: best.product,
    output: best.output,
    excess: best.output - required,
    excessPct: required > 0 ? ((best.output - required) / required) * 100 : 0,
    alternatives: cands.slice(1, 5).map((c) => ({ id: c.product.id, model: c.product.model, output: c.output, priceUsd: c.product.priceUsd })),
    reason: pref ? 'min_excess_pref_length' : 'min_excess',
    warnings,
  };
}

export function radiatorById(id, catalog = RADIATORS) {
  return catalog.find((r) => r.id === id) ?? null;
}
