// Product library (ZODPRO demo catalog).
// IMPORTANT: this is a representative demo catalog so the engines can run end-to-end.
// Replace/extend it with manufacturer data through the Product Importer (CSV) before issuing
// documents. Prices are in USD (base currency) and converted by the cost engine.

// ---------------- Radiators ----------------
// Panel radiators: nominal output per metre at 75/65/20 (EN 442, LMTD 49.83 K), exponent n.
const PANEL_OUTPUT_PER_M = {
  11: { 300: 480, 500: 760, 600: 880, 900: 1210 },
  21: { 300: 700, 500: 1060, 600: 1230, 900: 1700 },
  22: { 300: 900, 500: 1400, 600: 1640, 900: 2260 },
  33: { 300: 1280, 500: 1980, 600: 2300, 900: 3150 },
};
const PANEL_DEPTH = { 11: 0.063, 21: 0.066, 22: 0.1, 33: 0.155 };
const PANEL_WATER_L_PER_M = { 11: 2.4, 21: 4.4, 22: 4.8, 33: 7.2 }; // for 500 mm height, scaled by height
const PANEL_KG_PER_M = { 11: 11, 21: 17, 22: 22, 33: 33 }; // for 500 mm height, scaled
const PANEL_USD_PER_M = { 11: 38, 21: 52, 22: 62, 33: 92 }; // for 500 mm height, scaled

function buildPanelRadiators() {
  const out = [];
  for (const type of [11, 21, 22, 33]) {
    for (const h of [300, 500, 600, 900]) {
      for (let L = 400; L <= 2000; L += 100) {
        const m = L / 1000;
        const hs = h / 500;
        out.push({
          id: `RAD-P${type}-${h}-${L}`,
          family: 'radiator',
          kind: 'panel',
          brand: 'ZODPRO',
          model: `Panel T${type} ${h}x${L}`,
          article: `ZP-PR${type}${String(h).padStart(3, '0')}${String(L).padStart(4, '0')}`,
          sapArticle: `SAP-10${type}${h}${L}`,
          type,
          height: h / 1000,
          length: m,
          depth: PANEL_DEPTH[type],
          q75: Math.round(PANEL_OUTPUT_PER_M[type][h] * m),
          n: 1.3,
          waterL: +(PANEL_WATER_L_PER_M[type] * m * hs).toFixed(2),
          weightKg: +(PANEL_KG_PER_M[type] * m * (0.4 + 0.6 * hs)).toFixed(1),
          connection: 'side', // side | bottom (VK)
          priceUsd: +(PANEL_USD_PER_M[type] * m * (0.5 + 0.5 * hs) + 12).toFixed(2),
          zeta: 2.5,
        });
      }
    }
  }
  return out;
}

// Sectional aluminium / bimetal radiators: per-section output at 75/65/20.
function buildSectional() {
  const out = [];
  const lines = [
    { key: 'AL500', model: 'Alyumin 500', h: 0.58, per: 150, n: 1.34, water: 0.3, kg: 1.2, usd: 7.5, depth: 0.08 },
    { key: 'AL350', model: 'Alyumin 350', h: 0.43, per: 115, n: 1.34, water: 0.25, kg: 0.95, usd: 6.5, depth: 0.08 },
    { key: 'BM500', model: 'Bimetall 500', h: 0.56, per: 140, n: 1.32, water: 0.2, kg: 1.9, usd: 10.5, depth: 0.08 },
  ];
  for (const l of lines) {
    for (let s = 4; s <= 16; s++) {
      out.push({
        id: `RAD-${l.key}-${s}`,
        family: 'radiator',
        kind: 'sectional',
        brand: 'ZODPRO',
        model: `${l.model} × ${s}`,
        article: `ZP-${l.key}-${String(s).padStart(2, '0')}`,
        sapArticle: `SAP-20${l.key}${s}`,
        type: l.key,
        sections: s,
        height: l.h,
        length: +(s * 0.08).toFixed(2),
        depth: l.depth,
        q75: l.per * s,
        n: l.n,
        waterL: +(l.water * s).toFixed(2),
        weightKg: +(l.kg * s).toFixed(1),
        connection: 'side',
        priceUsd: +(l.usd * s + 6).toFixed(2),
        zeta: 2.0,
      });
    }
  }
  return out;
}

export const RADIATORS = [...buildPanelRadiators(), ...buildSectional()];

// ---------------- Pipes ----------------
// roughness k in metres; sizes: nominal label, outer diameter, inner diameter (m), price USD/m.
export const PIPE_MATERIALS = {
  PPR: {
    name: 'PPR PN20 (armirlangan)',
    k: 0.000007,
    barLength: 4,
    maxTemp: 95,
    pn: 20,
    sizes: [
      { dn: '20', od: 0.02, id: 0.0132, usd: 0.55 },
      { dn: '25', od: 0.025, id: 0.0166, usd: 0.85 },
      { dn: '32', od: 0.032, id: 0.0212, usd: 1.35 },
      { dn: '40', od: 0.04, id: 0.0266, usd: 2.1 },
      { dn: '50', od: 0.05, id: 0.0334, usd: 3.2 },
      { dn: '63', od: 0.063, id: 0.042, usd: 5.1 },
    ],
  },
  PEX: {
    name: 'PEX-a / EVOH',
    k: 0.000007,
    barLength: 200,
    maxTemp: 95,
    pn: 10,
    sizes: [
      { dn: '16', od: 0.016, id: 0.012, usd: 0.7 },
      { dn: '20', od: 0.02, id: 0.0144, usd: 1.0 },
      { dn: '25', od: 0.025, id: 0.018, usd: 1.6 },
      { dn: '32', od: 0.032, id: 0.0232, usd: 2.6 },
    ],
  },
  PERT: {
    name: 'PE-RT / EVOH',
    k: 0.000007,
    barLength: 200,
    maxTemp: 70,
    pn: 6,
    sizes: [
      { dn: '16', od: 0.016, id: 0.012, usd: 0.45 },
      { dn: '20', od: 0.02, id: 0.0144, usd: 0.7 },
    ],
  },
  STEEL: {
    name: "Po'lat VGP (GOST 3262)",
    k: 0.0002,
    barLength: 6,
    maxTemp: 150,
    pn: 16,
    sizes: [
      { dn: '15', od: 0.0213, id: 0.0157, usd: 1.6 },
      { dn: '20', od: 0.0269, id: 0.0213, usd: 2.1 },
      { dn: '25', od: 0.0337, id: 0.0273, usd: 3.0 },
      { dn: '32', od: 0.0424, id: 0.036, usd: 3.9 },
      { dn: '40', od: 0.048, id: 0.041, usd: 4.6 },
      { dn: '50', od: 0.06, id: 0.053, usd: 6.2 },
    ],
  },
  CU: {
    name: 'Mis (EN 1057)',
    k: 0.0000015,
    barLength: 5,
    maxTemp: 110,
    pn: 16,
    sizes: [
      { dn: '15', od: 0.015, id: 0.013, usd: 4.2 },
      { dn: '18', od: 0.018, id: 0.016, usd: 5.4 },
      { dn: '22', od: 0.022, id: 0.02, usd: 7.1 },
      { dn: '28', od: 0.028, id: 0.026, usd: 9.3 },
      { dn: '35', od: 0.035, id: 0.032, usd: 13.5 },
    ],
  },
};

export function pipeSize(material, dn) {
  const m = PIPE_MATERIALS[material];
  if (!m) return null;
  return m.sizes.find((s) => s.dn === String(dn)) ?? null;
}

// ---------------- Valves ----------------
// Thermostatic radiator valve: Kv at 2 K proportional band. Lockshield/return valve with presets.
export const VALVES = {
  trv: { id: 'VAL-TRV-15', family: 'valve', model: 'Termostatik klapan DN15', article: 'ZP-TRV15', kv: 0.9, usd: 9.5 },
  head: { id: 'VAL-HEAD', family: 'valve', model: 'Termostatik golovka', article: 'ZP-TH01', usd: 11 },
  lockshield: {
    id: 'VAL-LS-15',
    family: 'valve',
    model: 'Balanslovchi (pastki) klapan DN15',
    article: 'ZP-LS15',
    usd: 7.2,
    // preset (turns) → Kv [m³/h]; last is fully open
    presets: [
      { setting: '1', kv: 0.08 },
      { setting: '2', kv: 0.15 },
      { setting: '3', kv: 0.26 },
      { setting: '4', kv: 0.4 },
      { setting: '5', kv: 0.6 },
      { setting: '6', kv: 0.85 },
      { setting: 'N', kv: 1.4 },
    ],
  },
  ball: { id: 'VAL-BALL', family: 'valve', model: 'Sharli kran', article: 'ZP-BV', kv: 20, usd: 6 },
};

// ---------------- Collectors (manifolds) ----------------
export const COLLECTORS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({
  id: `COL-${n}`,
  family: 'collector',
  brand: 'ZODPRO',
  model: `Kollektor 1" × ${n} chiqish`,
  article: `ZP-COL1-${String(n).padStart(2, '0')}`,
  sapArticle: `SAP-30${n}`,
  outlets: n,
  maxFlowM3h: 3.5,
  zeta: 1.5,
  waterL: +(0.12 * n + 0.3).toFixed(2),
  usd: 28 + n * 9,
  ufhUsdExtra: 14 + n * 12, // flow meters + actuator bases for UFH version
}));

// ---------------- Boilers ----------------
export const BOILERS = [12, 18, 24, 28, 35, 45, 60, 80, 100].map((kw) => ({
  id: `BLR-${kw}`,
  family: 'boiler',
  brand: 'ZODPRO',
  model: `Gaz qozon ${kw} kVt`,
  article: `ZP-GB-${kw}`,
  sapArticle: `SAP-40${kw}`,
  powerKw: kw,
  modulation: kw <= 35 ? '30–100%' : '20–100%',
  efficiency: 0.93,
  waterL: +(1.5 + kw * 0.06).toFixed(1),
  // resistance at nominal flow (ΔT 20 K)
  dpNominalKpa: kw <= 35 ? 12 : 18,
  builtInPump: kw <= 35,
  dims: kw <= 35 ? '440×700×340' : '600×900×500',
  connections: kw <= 35 ? '3/4"' : '1 1/4"',
  usd: Math.round(380 + kw * 18),
}));

// ---------------- Circulation pumps ----------------
// Curve: H(Q) = h0 − k·Q² at max speed (H in m, Q in m³/h). Variable-speed pumps may run lower.
export const PUMPS = [
  { id: 'PMP-25-40', model: 'Nasos 25/40-180', h0: 4.0, qMax: 3.0, powerW: 25, eff: 0.25, usd: 115 },
  { id: 'PMP-25-60', model: 'Nasos 25/60-180', h0: 6.0, qMax: 3.5, powerW: 45, eff: 0.28, usd: 135 },
  { id: 'PMP-25-80', model: 'Nasos 25/80-180', h0: 8.0, qMax: 4.5, powerW: 75, eff: 0.3, usd: 175 },
  { id: 'PMP-32-80', model: 'Nasos 32/80-180', h0: 8.0, qMax: 7.5, powerW: 130, eff: 0.34, usd: 240 },
  { id: 'PMP-32-120', model: 'Nasos 32/120-180', h0: 12.0, qMax: 9.0, powerW: 250, eff: 0.38, usd: 360 },
  { id: 'PMP-40-120', model: 'Nasos 40/120-250', h0: 12.0, qMax: 16.0, powerW: 450, eff: 0.45, usd: 610 },
].map((p) => ({
  ...p,
  family: 'pump',
  brand: 'ZODPRO',
  article: `ZP-${p.id}`,
  sapArticle: `SAP-50${p.id.replace(/\D/g, '')}`,
  k: p.h0 / (p.qMax * p.qMax),
  qMin: +(p.qMax * 0.05).toFixed(2),
}));

// ---------------- Expansion tanks ----------------
export const EXPANSION_TANKS = [8, 12, 18, 24, 35, 50, 80, 100, 150, 200].map((v) => ({
  id: `EXP-${v}`,
  family: 'equipment',
  model: `Kengaytirish baki ${v} l`,
  article: `ZP-EXP-${v}`,
  volumeL: v,
  maxBar: 3,
  usd: Math.round(18 + v * 0.9),
}));

// ---------------- Fittings / accessories (unit prices by nominal size) ----------------
export const FITTING_PRICES = {
  elbow: 0.25,
  tee: 0.35,
  coupling: 0.15,
  reducer: 0.3,
  clip: 0.08,
  insulation_m: 0.4,
  safety_group: 38,
  filter: 14,
  check_valve: 9,
  air_vent: 4,
  radiator_bracket_set: 3.5,
  ufh_pipe_clip: 0.03,
  ufh_edge_strip_m: 0.3,
  ufh_insulation_m2: 3.2,
  thermostat_room: 24,
  actuator: 17,
};

/** Size multiplier so bigger fittings cost more. */
export function fittingSizeFactor(dn) {
  const n = Number(dn) || 20;
  return Math.max(1, (n / 20) ** 1.6);
}
