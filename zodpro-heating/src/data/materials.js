// Building materials and default assemblies used by the heat-loss engine.
// lambda: thermal conductivity W/(m·K); rho: density kg/m³; c: specific heat J/(kg·K);
// mu: vapour diffusion resistance factor (-). Values are typical design values (SP 50.13330
// appendix / EN ISO 10456 order of magnitude) and are editable per project.

export const MATERIALS = {
  brick_solid: { name: "G'isht (to'liq)", lambda: 0.81, rho: 1800, c: 880, mu: 10, fire: 'A1' },
  brick_hollow: { name: "G'isht (g'ovak)", lambda: 0.58, rho: 1400, c: 880, mu: 8, fire: 'A1' },
  aerated_d500: { name: 'Gazoblok D500', lambda: 0.14, rho: 500, c: 840, mu: 6, fire: 'A1' },
  concrete: { name: 'Temirbeton', lambda: 2.04, rho: 2500, c: 840, mu: 80, fire: 'A1' },
  plaster_cement: { name: 'Sement-qum suvoq', lambda: 0.93, rho: 1800, c: 840, mu: 10, fire: 'A1' },
  plaster_gypsum: { name: 'Gips suvoq', lambda: 0.35, rho: 1000, c: 840, mu: 8, fire: 'A1' },
  eps: { name: 'Penopolistirol (EPS)', lambda: 0.039, rho: 20, c: 1340, mu: 60, fire: 'E' },
  xps: { name: 'Ekstrudirlangan PPS (XPS)', lambda: 0.032, rho: 32, c: 1450, mu: 150, fire: 'E' },
  mineral_wool: { name: 'Mineral paxta', lambda: 0.042, rho: 80, c: 840, mu: 1, fire: 'A1' },
  screed: { name: 'Styajka (sement)', lambda: 1.4, rho: 2000, c: 1000, mu: 50, fire: 'A1' },
  tile: { name: 'Kafel', lambda: 1.3, rho: 2300, c: 840, mu: 200, fire: 'A1' },
  wood: { name: "Yog'och (qarag'ay)", lambda: 0.14, rho: 500, c: 2300, mu: 50, fire: 'D' },
  sandwich_pur: { name: 'Sendvich panel (PUR)', lambda: 0.024, rho: 40, c: 1400, mu: 1000, fire: 'B' },
  gravel: { name: 'Shag‘al tayyorlov', lambda: 2.0, rho: 2000, c: 1000, mu: 50, fire: 'A1' },
};

// Surface resistances (m²K/W), EN ISO 6946 / SP 50.13330.
export const RSI = { wall: 0.13, roof: 0.1, floor: 0.17 };
export const RSE = { wall: 0.04, roof: 0.04, floor: 0.04, ground: 0 };

// Default assemblies. Layers from inside to outside.
export const ASSEMBLIES = {
  ext_brick_510: {
    name: "Tashqi devor: g'isht 510 mm",
    kind: 'wall',
    exterior: true,
    layers: [
      { material: 'plaster_cement', d: 0.02 },
      { material: 'brick_solid', d: 0.51 },
      { material: 'plaster_cement', d: 0.02 },
    ],
  },
  ext_brick_380_eps100: {
    name: "Tashqi devor: g'isht 380 + EPS 100",
    kind: 'wall',
    exterior: true,
    layers: [
      { material: 'plaster_cement', d: 0.02 },
      { material: 'brick_solid', d: 0.38 },
      { material: 'eps', d: 0.1 },
      { material: 'plaster_cement', d: 0.01 },
    ],
  },
  ext_aerated_400: {
    name: 'Tashqi devor: gazoblok D500 400 mm',
    kind: 'wall',
    exterior: true,
    layers: [
      { material: 'plaster_gypsum', d: 0.015 },
      { material: 'aerated_d500', d: 0.4 },
      { material: 'plaster_cement', d: 0.02 },
    ],
  },
  ext_concrete_mw150: {
    name: 'Tashqi devor: monolit 200 + mineral paxta 150',
    kind: 'wall',
    exterior: true,
    layers: [
      { material: 'plaster_gypsum', d: 0.015 },
      { material: 'concrete', d: 0.2 },
      { material: 'mineral_wool', d: 0.15 },
      { material: 'plaster_cement', d: 0.01 },
    ],
  },
  ext_sandwich_100: {
    name: 'Tashqi devor: sendvich panel 100',
    kind: 'wall',
    exterior: true,
    layers: [{ material: 'sandwich_pur', d: 0.1 }],
  },
  int_brick_120: {
    name: "Ichki devor: g'isht 120",
    kind: 'wall',
    exterior: false,
    layers: [
      { material: 'plaster_cement', d: 0.02 },
      { material: 'brick_solid', d: 0.12 },
      { material: 'plaster_cement', d: 0.02 },
    ],
  },
  floor_ground_xps50: {
    name: 'Grunt ustidagi pol: XPS 50',
    kind: 'floor',
    exterior: true,
    layers: [
      { material: 'tile', d: 0.01 },
      { material: 'screed', d: 0.05 },
      { material: 'xps', d: 0.05 },
      { material: 'concrete', d: 0.1 },
      { material: 'gravel', d: 0.15 },
    ],
  },
  roof_attic_mw200: {
    name: 'Cherdak ora yopmasi: mineral paxta 200',
    kind: 'roof',
    exterior: true,
    layers: [
      { material: 'plaster_cement', d: 0.02 },
      { material: 'concrete', d: 0.22 },
      { material: 'mineral_wool', d: 0.2 },
    ],
  },
  slab_interfloor: {
    name: 'Qavatlararo yopma',
    kind: 'floor',
    exterior: false,
    layers: [
      { material: 'tile', d: 0.01 },
      { material: 'screed', d: 0.05 },
      { material: 'concrete', d: 0.22 },
    ],
  },
};

// Opening (window / door) types with overall U-values W/(m²K).
export const OPENING_TYPES = {
  win_pvc_2: { name: 'PVX deraza, 2 kamerali paket', kind: 'window', U: 1.6 },
  win_pvc_1: { name: 'PVX deraza, 1 kamerali paket', kind: 'window', U: 2.7 },
  win_alu: { name: 'Alyumin deraza (termo-ko‘prik bilan)', kind: 'window', U: 2.2 },
  door_ext_insulated: { name: 'Tashqi eshik (izolyatsiyali)', kind: 'door', U: 1.8 },
  door_ext_metal: { name: 'Tashqi metall eshik', kind: 'door', U: 3.5 },
  door_int: { name: 'Ichki eshik', kind: 'door', U: 2.0 },
};

/** Thermal resistance and U-value of an assembly (EN ISO 6946 simplified, no thermal bridges). */
export function assemblyU(assemblyId, assemblies = ASSEMBLIES, materials = MATERIALS) {
  const a = assemblies[assemblyId];
  if (!a) throw new Error(`Unknown assembly: ${assemblyId}`);
  const rsi = RSI[a.kind] ?? 0.13;
  const rse = a.exterior ? RSE[a.kind] ?? 0.04 : rsi; // interior element: both sides internal
  const layers = a.layers.map((l) => {
    const m = materials[l.material];
    if (!m) throw new Error(`Unknown material: ${l.material}`);
    return { ...l, name: m.name, lambda: m.lambda, R: l.d / m.lambda };
  });
  const Rlayers = layers.reduce((s, l) => s + l.R, 0);
  const R = rsi + Rlayers + rse;
  const thickness = a.layers.reduce((s, l) => s + l.d, 0);
  return { R, U: 1 / R, rsi, rse, layers, thickness };
}
