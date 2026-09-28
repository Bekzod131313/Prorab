// Known-value / reference tests for the engineering engines.
// Hand calculations are written out next to each assertion so a reviewer can re-check them.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assemblyU } from '../src/data/materials.js';
import { lmtd, correctionFactor, selectRadiator, outputAt } from '../src/engines/radiator.js';
import { flowFromHeat, frictionFactor, pipeSegment, kvDrop, kvRequired } from '../src/engines/hydraulics.js';
import { water, expansionCoefficient } from '../src/engines/water.js';
import { selectPump, selectBoiler, sizeExpansion, sizePipe } from '../src/engines/equipment.js';
import { surfaceTemp, designUfh } from '../src/engines/ufh.js';
import { roomHeatLoss, groundZones } from '../src/engines/heatloss.js';
import { createEmptyProject, newElement } from '../src/core/model.js';
import { outerWalls } from '../src/core/demo.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

test('assembly U-value: brick 510 + 2×20 plaster', () => {
  // R = 0.13 + 2·0.02/0.93 + 0.51/0.81 + 0.04 = 0.842641 → U = 1.18674
  const r = assemblyU('ext_brick_510');
  close(r.R, 0.842641, 1e-5);
  close(r.U, 1.18674, 1e-4);
});

test('LMTD and EN 442 correction factor', () => {
  // 10 / ln(55/45) = 49.8329
  close(lmtd(75, 65, 20), 49.8329, 1e-3);
  // 70/55/20: 15/ln(50/35)=42.0551; (42.0551/49.8329)^1.3 = 0.80204
  close(correctionFactor(70, 55, 20, 1.3), 0.80204, 5e-4);
  close(correctionFactor(75, 65, 20, 1.3), 1, 1e-9);
  assert.equal(lmtd(40, 30, 45), 0);
});

test('radiator auto-selection (Required = 1265 W example)', () => {
  const sel = selectRadiator(1265, { ts: 75, tr: 65, ti: 20, kind: 'panel', type: 22 });
  assert.ok(sel.product, 'a product is selected');
  assert.ok(sel.output >= 1265, 'output covers requirement');
  assert.ok(sel.excessPct < 10, `excess ${sel.excessPct}% should be small`);
  close(outputAt(sel.product, 75, 65, 20), sel.product.q75, 1e-9);
  // impossible requirement → explicit warning, not a silent pick
  const none = selectRadiator(1e6, { ts: 75, tr: 65, ti: 20, kind: 'panel', type: 22 });
  assert.equal(none.product, null);
  assert.equal(none.warnings[0].code, 'rad_no_candidate');
});

test('flow from heat load', () => {
  // 1000 W, ΔT 10 K, 70 °C: m = 1000/(4190·10) = 0.0238663 kg/s; V = m/977.8·3.6e6 = 87.87 l/h
  const f = flowFromHeat(1000, 10, 70);
  close(f.mKgS, 0.0238663, 1e-6);
  close(f.vLh, 87.87, 0.05);
  assert.throws(() => flowFromHeat(1000, 0));
});

test('friction factor: laminar and Colebrook agreement', () => {
  close(frictionFactor(1000, 0.02, 1e-5), 0.064, 1e-12);
  // Colebrook iterative reference
  const colebrook = (Re, d, k) => {
    let f = 0.02;
    for (let i = 0; i < 50; i++) f = (-2 * Math.log10(k / (3.7 * d) + 2.51 / (Re * Math.sqrt(f)))) ** -2;
    return f;
  };
  for (const [Re, d, k] of [[1e4, 0.02, 7e-6], [5e4, 0.0266, 7e-6], [2e5, 0.053, 2e-4]]) {
    const sj = frictionFactor(Re, d, k);
    const cb = colebrook(Re, d, k);
    assert.ok(Math.abs(sj - cb) / cb < 0.03, `Swamee-Jain within 3% of Colebrook at Re=${Re}`);
  }
});

test('pipe segment: R and velocity', () => {
  // v = 0.1 l/s / (π·0.02²/4) = 0.3183 m/s
  const seg = pipeSegment({ vM3s: 1e-4, dInner: 0.02, k: 7e-6, length: 10, zeta: 2, tm: 70 });
  close(seg.v, 0.31831, 1e-4);
  const w = water(70);
  const dyn = (w.rho * seg.v ** 2) / 2;
  close(seg.R, (seg.lambda / 0.02) * dyn, 1e-9);
  close(seg.dpLocal, 2 * dyn, 1e-9);
  close(seg.dp, seg.R * 10 + 2 * dyn, 1e-9);
});

test('Kv relations', () => {
  // (0.5/1)² bar = 0.25 bar = 25 kPa
  close(kvDrop(0.5, 1), 25000, 1e-6);
  close(kvRequired(0.5, 25000), 1, 1e-9);
});

test('pipe auto-sizing picks the smallest valid diameter and explains', () => {
  // 0.2 m³/h in PPR 20 (Ø13.2): v = 0.4060 m/s ≤ 0.8 → DN20
  const r = sizePipe({ vM3s: 0.2 / 3600, material: 'PPR', tm: 70, velMin: 0.2, velMax: 0.8, maxR: 250 });
  assert.equal(r.selected.dn, '20');
  close(r.selected.v, 0.406, 0.002);
  assert.equal(r.reason, 'smallest_valid');
  // 2 m³/h cannot be DN20
  const big = sizePipe({ vM3s: 2 / 3600, material: 'PPR', tm: 70, velMin: 0.2, velMax: 0.8, maxR: 250 });
  assert.ok(Number(big.selected.dn) >= 32);
  assert.ok(big.candidates.find((c) => c.dn === '20').valid === false);
});

test('pump selection and operating point', () => {
  // Q = 1 m³/h, H = 3 m → 25/40: H(1) = 4 − (4/9)·1 = 3.556 ≥ 3 → cheapest valid
  const r = selectPump({ qM3h: 1, headM: 3 });
  assert.equal(r.pump.id, 'PMP-25-40');
  // operating point lies on both curves
  close(r.operatingPoint.h, r.systemA * r.operatingPoint.q ** 2, 1e-9);
  close(r.operatingPoint.h, r.pump.h0 - r.pump.k * r.operatingPoint.q ** 2, 1e-9);
  assert.equal(selectPump({ qM3h: 50, headM: 30 }).pump, null);
});

test('boiler selection', () => {
  // 15 kW × 1.05 × 1.1 = 17.325 kW → 18 kW
  const r = selectBoiler({ heatingW: 15000, reserve: 1.1 });
  close(r.requiredKw, 17.325, 1e-9);
  assert.equal(r.boiler.powerKw, 18);
  // DHW-priority combi must cover DHW alone
  const d = selectBoiler({ heatingW: 5000, dhwKw: 24, dhwSimultaneity: 0, reserve: 1.0 });
  close(d.requiredKw, 24, 1e-9);
});

test('expansion vessel (EN 12828)', () => {
  // e(10→75) = 999.7/974.8 − 1 = 0.025544; Ve = 2.554 l; Vwr = 3 l; p0 = 0.9; pe = 2.5
  // Vn = 5.554·3.5/1.6 = 12.15 l → 18 l tank
  const r = sizeExpansion({ systemL: 100, tMax: 75, staticM: 6, psv: 3 });
  close(r.e, 0.025544, 2e-4);
  close(r.p0, 0.9, 1e-9);
  close(r.pe, 2.5, 1e-9);
  close(r.Vn, 12.15, 0.05);
  assert.equal(r.tank.volumeL, 18);
  close(expansionCoefficient(10, 10), 0, 1e-12);
});

test('UFH surface temperature and loop design', () => {
  // q = 100 W/m²: 20 + (100/8.92)^(1/1.1) = 29.0 °C
  close(surfaceTemp(100, 20), 29.0, 0.05);
  const d = designUfh({ Q: 1500, area: 20, ti: 20, ts: 45, tr: 35, maxLoop: 100 });
  assert.ok(d.loops >= 1);
  assert.ok(d.loopLength <= 100 + 1e-9);
  assert.ok(d.tSurf < 29);
  assert.ok(d.Qout > 0);
});

function boxProject() {
  const p = createEmptyProject('box');
  p.settings.climate.tOut = -15;
  p.settings.infiltrationAch = 0;
  for (const w of outerWalls('lvl_0', 0, 0, 4, 5, 'ext_brick_510', 0.49)) p.elements[w.id] = w;
  const room = newElement('room', { levelId: 'lvl_0', name: 'Box', roomType: 'living', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 5 }, { x: 0, y: 5 }], ach: 0.5 });
  p.elements[room.id] = room;
  return { p, room };
}

test('room heat loss: hand-calculated box room', () => {
  const { p, room } = boxProject();
  const r = roomHeatLoss(p, room);
  const U = assemblyU('ext_brick_510').U;
  const dT = 35;
  const H = 3;
  // corner room: +0.05 on all walls. N: 0.10, E: 0.10, S: 0, W: 0.05
  const walls = 4 * H * U * dT * (1 + 0.15) + 5 * H * U * dT * (1 + 0.15) + 4 * H * U * dT * (1 + 0.05) + 5 * H * U * dT * (1 + 0.1);
  // ground floor zone I: 20 m², U = 1/(2.1 + 0.05/0.032) = 0.273038
  const floor = 20 * (1 / (2.1 + 0.05 / 0.032)) * dT;
  // attic ceiling (single level = top level): n = 0.9
  const roof = assemblyU('roof_attic_mw200').U * 20 * dT * 0.9;
  close(r.transmission, walls + floor + roof, 0.5, 'transmission');
  // ventilation 0.5 1/h × 60 m³ = 30 m³/h; ρ(-15) = 353/258.15
  const vent = (353 / 258.15) * 1005 * (30 / 3600) * dT;
  close(r.ventilation, vent, 1e-6, 'ventilation');
  close(r.total, walls + floor + roof + vent, 0.5, 'total');
  assert.equal(r.inputs.corner, true);
  assert.ok(r.lines.length >= 6, 'breakdown lines exist');
});

test('ground zones sum to room area', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const walls = [
    { a: pts[0], b: pts[1], thickness: 0 },
    { a: pts[1], b: pts[2], thickness: 0 },
    { a: pts[2], b: pts[3], thickness: 0 },
    { a: pts[3], b: pts[0], thickness: 0 },
  ];
  const z = groundZones(pts, walls);
  // zone I: 100 − 6×6 = 64; zone II: 36 − 2×2 = 32; zone III: 4
  close(z[0], 64, 0.5);
  close(z[1], 32, 0.5);
  close(z[2], 4, 0.5);
  close(z.reduce((a, b) => a + b, 0), 100, 1e-6);
});
