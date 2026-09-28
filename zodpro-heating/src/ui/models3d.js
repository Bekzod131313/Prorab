// Realistic parametric 3D product models (procedural, driven by product data):
// panel & sectional radiators with valves, manifolds with ball valves / flow meters / actuators,
// wall-hung boiler with flue and service valves, circulator pump, expansion vessel, thermostat,
// pipes with real fittings (sockets, elbows, bends), windows, doors, textured finishes.
//
// Frames: a model is built in its own frame (X along the element, Y towards the element's back,
// Z up) and placed with place(): plan local (lx, ly) ↦ model (lx, −ly).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Merge geometries of mixed kinds (indexed / non-indexed) into one. */
function merge(geos) {
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of list) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return mergeGeometries(list, false);
}

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.repeat.set(repeat, repeat);
  return t;
}

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export function makeTextures() {
  seed = 7;
  // oak parquet, texture covers 1.2 × 1.2 m (planks 0.15 × 1.2)
  const parquet = canvasTex(512, 512, (g, w, h) => {
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * w;
      while (x < w) {
        const len = w * (0.45 + rnd() * 0.55);
        const base = 150 + rnd() * 40;
        g.fillStyle = `rgb(${base + 40},${base + 5},${base - 45})`;
        g.fillRect(x, (r * h) / rows, len, h / rows);
        for (let k = 0; k < 14; k++) {
          g.strokeStyle = `rgba(90,55,25,${0.05 + rnd() * 0.08})`;
          g.beginPath();
          const yy = (r * h) / rows + rnd() * (h / rows);
          g.moveTo(x, yy);
          g.bezierCurveTo(x + len / 3, yy + rnd() * 4 - 2, x + (2 * len) / 3, yy + rnd() * 4 - 2, x + len, yy);
          g.stroke();
        }
        g.fillStyle = 'rgba(60,35,15,0.55)';
        g.fillRect(x, (r * h) / rows, 1.5, h / rows);
        x += len;
      }
      g.fillStyle = 'rgba(60,35,15,0.5)';
      g.fillRect(0, (r * h) / rows, w, 1.5);
    }
  });
  parquet.repeat.set(1 / 1.2, 1 / 1.2);
  // ceramic tiles 0.3 × 0.3 m with grout (texture covers 1.2 m)
  const tiles = canvasTex(512, 512, (g, w, h) => {
    const n = 4;
    g.fillStyle = '#b9bcbf';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = 222 + rnd() * 16;
        g.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
        g.fillRect((i * w) / n + 2, (j * h) / n + 2, w / n - 4, h / n - 4);
      }
    }
  });
  tiles.repeat.set(1 / 1.2, 1 / 1.2);
  // plaster noise (1 × 1 m)
  const plaster = (base) =>
    canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 5000; k++) {
        g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.05})`;
        g.fillRect(rnd() * w, rnd() * h, 2, 2);
      }
    });
  const facade = plaster('#e9dcc5');
  const interior = plaster('#f4f3ef');
  // screed (cement) for UFH rooms
  const screed = plaster('#b8b5ad');
  // door wood veneer
  const wood = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#8a5a34';
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 90; k++) {
      g.strokeStyle = `rgba(${rnd() > 0.5 ? '60,35,15' : '170,120,80'},${0.1 + rnd() * 0.15})`;
      g.beginPath();
      const x = rnd() * w;
      g.moveTo(x, 0);
      g.bezierCurveTo(x + rnd() * 20 - 10, h / 3, x + rnd() * 20 - 10, (2 * h) / 3, x + rnd() * 10 - 5, h);
      g.stroke();
    }
  });
  const grass = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8fa874';
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 6000; k++) {
      g.fillStyle = `rgba(${60 + rnd() * 60},${100 + rnd() * 60},${40 + rnd() * 30},0.35)`;
      g.fillRect(rnd() * w, rnd() * h, 1.5, 3);
    }
  });
  grass.repeat.set(1 / 4, 1 / 4);
  // UFH system board: metallised foil with the printed 50/100 mm laying grid (texture covers 1 m)
  const foil = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#c9ced4';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '120,128,138'},${0.04 + rnd() * 0.05})`;
      g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 30, 1 + rnd() * 2);
    }
    for (let k = 0; k <= 20; k++) {
      const p = (k / 20) * w;
      const major = k % 2 === 0;
      g.strokeStyle = major ? 'rgba(30,80,160,0.55)' : 'rgba(30,80,160,0.28)';
      g.lineWidth = major ? 2.2 : 1.1;
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, h);
      g.moveTo(0, p);
      g.lineTo(w, p);
      g.stroke();
    }
    g.fillStyle = 'rgba(30,80,160,0.45)';
    g.font = 'bold 22px Arial';
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.fillText('50 · 100 · 150 mm', 60 + x * 512, 45 + y * 512);
  });
  return { parquet, tiles, facade, interior, screed, wood, grass, foil };
}

// ---------------------------------------------------------------- materials
export function makeMaterials(textures, systemColors) {
  const std = (o) => new THREE.MeshStandardMaterial({ side: THREE.FrontSide, ...o });
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  return {
    enamel: phys({ color: 0xecece8, roughness: 0.38, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.25 }),
    enamelShade: phys({ color: 0xe6e6e2, roughness: 0.45, clearcoat: 0.4 }),
    chrome: std({ color: 0xe8e8e8, metalness: 1, roughness: 0.12 }),
    nickel: std({ color: 0xc7cbd0, metalness: 0.95, roughness: 0.22 }),
    brass: std({ color: 0xc8a14a, metalness: 1, roughness: 0.28 }),
    steel: std({ color: 0x8b9096, metalness: 0.85, roughness: 0.35 }),
    castIron: std({ color: 0x3b4046, metalness: 0.4, roughness: 0.6 }),
    pumpRed: std({ color: 0xc81e1e, metalness: 0.2, roughness: 0.45 }),
    pumpBody: std({ color: 0x2a5bb8, metalness: 0.3, roughness: 0.4 }),
    black: std({ color: 0x1d1f22, roughness: 0.5 }),
    darkGrey: std({ color: 0x3c4148, roughness: 0.4 }),
    whitePlastic: std({ color: 0xf2f2f0, roughness: 0.35 }),
    redPlastic: std({ color: 0xd62a20, roughness: 0.4 }),
    bluePlastic: std({ color: 0x1f5fd6, roughness: 0.4 }),
    yellow: std({ color: 0xf2c200, roughness: 0.4 }),
    orange: std({ color: 0xf07a1a, roughness: 0.4 }),
    tankRed: std({ color: 0xc4201b, metalness: 0.25, roughness: 0.35 }),
    lcd: std({ color: 0x0d2230, emissive: 0x3aa3ff, emissiveIntensity: 0.35, roughness: 0.2 }),
    flowMeter: phys({ color: 0xd8f0ff, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.45 }),
    glass: phys({ color: 0xbfd8e8, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.28, envMapIntensity: 1.2, depthWrite: false }),
    pvc: std({ color: 0xf4f4f2, roughness: 0.4 }),
    sill: std({ color: 0xfafaf8, roughness: 0.3 }),
    ebb: std({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.35 }),
    doorWood: std({ map: textures.wood, roughness: 0.55 }),
    frameWood: std({ color: 0x6e4a2c, roughness: 0.5 }),
    wallFacade: std({ map: textures.facade, roughness: 0.95, side: THREE.DoubleSide }),
    wallInterior: std({ map: textures.interior, roughness: 0.92, side: THREE.DoubleSide }),
    wallCore: std({ color: 0xb9b2a6, roughness: 0.9, side: THREE.DoubleSide }),
    slab: std({ color: 0x3a3b3d, roughness: 0.9, side: THREE.DoubleSide }),
    cut: std({ color: 0x232426, roughness: 1, metalness: 0 }),
    ceiling: std({ color: 0xf7f7f5, roughness: 0.95, side: THREE.DoubleSide }),
    roof: std({ color: 0x7d7f80, roughness: 0.95 }),
    parquet: std({ map: textures.parquet, roughness: 0.55 }),
    tiles: std({ map: textures.tiles, roughness: 0.3 }),
    screed: std({ map: textures.screed, roughness: 0.95 }),
    insulation: std({ color: 0xdfe4ea, roughness: 0.9 }),
    ground: std({ map: textures.grass, roughness: 1 }),
    plinth: std({ color: 0x8a8580, roughness: 0.9 }),
    supply: std({ color: systemColors.supply, roughness: 0.35, metalness: 0.05 }),
    ret: std({ color: systemColors.ret, roughness: 0.35, metalness: 0.05 }),
    ppr: std({ color: 0xf0f0ec, roughness: 0.4 }),
    pprFitting: std({ color: 0xe4e4df, roughness: 0.45 }),
    pexRed: phys({ color: 0xd2382c, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.7 }),
    pexBlue: phys({ color: 0x2a62d0, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.7 }),
    ufhFoil: std({ map: textures.foil, color: 0xffffff, metalness: 0.35, roughness: 0.55 }),
    copper: std({ color: 0xc27a4a, metalness: 1, roughness: 0.3 }),
    cabinet: std({ color: 0xe9ebee, metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide }),
    obstacle: std({ color: 0xa08050, roughness: 0.8, transparent: true, opacity: 0.7 }),
  };
}

// ---------------------------------------------------------------- helpers
function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/** Cylinder between two points. */
export function cylBetween(a, b, r, mat, seg = 16) {
  const d = b.clone().sub(a);
  const L = d.length();
  const m = mesh(new THREE.CylinderGeometry(r, r, Math.max(L, 1e-4), seg, 1, false), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  if (L > 1e-6) m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  return m;
}

function cylAlong(axis, r, len, mat, seg = 16) {
  const m = mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  if (axis === 'y') m.rotation.x = 0;
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  return m;
}

function hexNut(r, len, mat) {
  const m = mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
  return m;
}

function box(sx, sy, sz, mat, x = 0, y = 0, z = 0, round = 0) {
  const g = round > 0 ? new RoundedBoxGeometry(sx, sy, sz, 3, Math.min(round, sx / 2, sy / 2, sz / 2)) : new THREE.BoxGeometry(sx, sy, sz);
  const m = mesh(g, mat);
  m.position.set(x, y, z);
  return m;
}

/** Place a model built in its own frame at a plan element (x, y, angle°) and elevation z. */
export function place(group, el, z = 0) {
  group.position.set(el.x, -el.y, z);
  group.rotation.z = -((el.angle ?? 0) * Math.PI) / 180;
  return group;
}

export function tagIds(obj, id) {
  obj.traverse((o) => {
    o.userData.id = id;
  });
  return obj;
}

// ---------------------------------------------------------------- valves
/** Ball valve with lever handle. axis = direction of flow ('x' | 'z'). */
export function ballValve(M, dn = 0.02, handleMat = M.redPlastic, axis = 'z') {
  const g = new THREE.Group();
  const r = dn * 0.75;
  const body = mesh(new THREE.SphereGeometry(r * 1.25, 16, 12), M.brass);
  g.add(body);
  for (const s of [-1, 1]) {
    const nut = hexNut(r * 1.05, dn * 0.9, M.brass);
    nut.position.y = s * r * 1.5;
    g.add(nut);
  }
  const lever = box(dn * 4, dn * 0.5, dn * 0.25, handleMat, dn * 1.6, 0, 0, dn * 0.1);
  const handle = new THREE.Group();
  handle.add(lever);
  handle.position.set(0, 0, r * 1.6);
  lever.position.set(dn * 1.4, 0, 0);
  g.add(handle);
  const st = mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.22, r * 1.6, 8), M.steel);
  st.rotation.x = Math.PI / 2;
  st.position.z = r * 0.8;
  g.add(st);
  // body cylinder axis is Y; orient to requested flow axis
  if (axis === 'z') g.rotation.x = Math.PI / 2;
  if (axis === 'x') g.rotation.z = Math.PI / 2;
  return g;
}

/** Thermostatic radiator valve (angle body + thermostatic head). */
function trv(M, headAxis = 'z') {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 16), M.chrome);
  g.add(body);
  const nut = hexNut(0.015, 0.014, M.chrome);
  nut.position.y = -0.03;
  g.add(nut);
  // head
  const head = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 20), M.chrome);
  head.add(base);
  const knob = mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.07, 28), M.whitePlastic);
  knob.position.y = 0.045;
  head.add(knob);
  for (let i = 0; i < 12; i++) {
    const rib = box(0.004, 0.06, 0.004, M.enamelShade, Math.cos((i / 12) * Math.PI * 2) * 0.026, 0.045, Math.sin((i / 12) * Math.PI * 2) * 0.026);
    head.add(rib);
  }
  if (headAxis === 'z') head.rotation.set(0, 0, 0);
  head.position.set(0, 0.03, 0);
  g.add(head);
  return g;
}

function lockshield(M) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.045, 16), M.chrome));
  const cap = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.018, 16), M.chrome);
  cap.position.y = 0.03;
  g.add(cap);
  const nut = hexNut(0.015, 0.014, M.chrome);
  nut.position.y = -0.03;
  g.add(nut);
  return g;
}

// ---------------------------------------------------------------- radiators
const PANELS = { 11: 1, 21: 2, 22: 2, 33: 3 };
const CONV = { 11: 1, 21: 1, 22: 2, 33: 3 };

function panelGeometry(L, H, t = 0.009, pitch = 0.033, amp = 0.0065) {
  // profile in (x = length, y = depth), extruded along height
  // profile: flat back at y = 0, channelled front face towards −y; extruded along +z (height)
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(L, 0);
  const n = Math.max(2, Math.round(L / pitch));
  const steps = n * 8;
  for (let i = steps; i >= 0; i--) {
    const x = (L * i) / steps;
    const y = -(t + amp * Math.pow(0.5 - 0.5 * Math.cos((2 * Math.PI * x) / (L / n)), 0.6));
    s.lineTo(x, y);
  }
  s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: H, bevelEnabled: false, steps: 1 });
  g.translate(-L / 2, 0, 0);
  return g;
}

/**
 * Panel radiator: panels with vertical water channels, convector fins, top grille, side covers,
 * air vent, blind plug, TRV (supply end, top) and lockshield (return end, bottom), wall brackets.
 * @returns {Group} origin at the radiator centre on the floor-plan position, z = 0 at mount height.
 */
export function panelRadiator(M, prod, { flip = false } = {}) {
  const g = new THREE.Group();
  const L = prod.length;
  const H = prod.height;
  const D = prod.depth ?? 0.1;
  const type = Number(prod.type) || 22;
  const np = PANELS[type] ?? 2;
  const pg = panelGeometry(L, H - 0.012);
  const pt = 0.0155; // panel thickness incl. channels
  for (let i = 0; i < np; i++) {
    const p = mesh(pg, M.enamel);
    // panel back plane: front panel's face flush with −D/2, last panel's back at +D/2
    const yb = np === 1 ? pt / 2 : -D / 2 + pt + (i * (D - pt)) / (np - 1);
    p.position.set(0, yb, 0.006);
    g.add(p);
    // top & bottom header bands
    for (const zz of [0.02, H - 0.02]) g.add(box(L, pt + 0.002, 0.036, M.enamel, 0, yb - pt / 2, zz, 0.004));
  }
  // convector fins (between/behind panels): corrugated sheet as many thin plates (merged)
  const finGeos = [];
  const nconv = CONV[type] ?? 1;
  for (let c = 0; c < nconv; c++) {
    const yc = np === 1 ? 0.018 : -D / 2 + 0.02 + ((c + 0.5) * (D - 0.04)) / Math.max(1, nconv);
    for (let x = -L / 2 + 0.02; x < L / 2 - 0.01; x += 0.022) {
      const f = new THREE.BoxGeometry(0.0012, Math.min(0.028, D / (nconv + 1)), H - 0.08);
      f.translate(x, yc, H / 2);
      finGeos.push(f);
    }
  }
  if (finGeos.length) g.add(mesh(merge(finGeos), M.enamelShade, false));
  if (type >= 21) {
    // top grille: slotted cover
    const slats = [];
    for (let x = -L / 2 + 0.006; x <= L / 2 - 0.006; x += 0.0085) {
      const sl = new THREE.BoxGeometry(0.0035, D - 0.004, 0.003);
      sl.translate(x, 0, H + 0.001);
      slats.push(sl);
    }
    g.add(mesh(merge(slats), M.enamel));
    g.add(box(L, 0.004, 0.012, M.enamel, 0, -D / 2 + 0.002, H - 0.004));
    g.add(box(L, 0.004, 0.012, M.enamel, 0, D / 2 - 0.002, H - 0.004));
    // side covers
    for (const s of [-1, 1]) g.add(box(0.003, D, H - 0.01, M.enamel, s * (L / 2 + 0.0015), 0, H / 2, 0.001));
  }
  // air vent (top, return end) & plug
  const sgn = flip ? -1 : 1;
  const vent = cylAlong('x', 0.007, 0.018, M.chrome);
  vent.position.set(sgn * (L / 2 + 0.01), -D / 2 + 0.02, H - 0.035);
  g.add(vent);
  // brackets (behind)
  for (const x of [-L * 0.35, L * 0.35]) g.add(box(0.03, 0.03, 0.05, M.steel, x, D / 2 + 0.015, H - 0.05));
  return g;
}

/** Sectional (aluminium / bimetal) radiator: N die-cast sections with hubs and fins. */
export function sectionalRadiator(M, prod, { flip = false } = {}) {
  const g = new THREE.Group();
  const n = prod.sections ?? Math.round(prod.length / 0.08);
  const H = prod.height;
  const D = prod.depth ?? 0.08;
  const w = 0.08;
  // one section geometry
  const parts = [];
  const front = new RoundedBoxGeometry(w - 0.004, 0.012, H - 0.04, 2, 0.004);
  front.translate(0, -D / 2 + 0.006, H / 2);
  parts.push(front);
  const tube = new THREE.CylinderGeometry(0.009, 0.009, H - 0.06, 12);
  tube.rotateX(Math.PI / 2);
  tube.translate(0, -0.005, H / 2);
  parts.push(tube);
  for (const x of [-w / 2 + 0.006, w / 2 - 0.006]) {
    const fin = new THREE.BoxGeometry(0.002, D - 0.012, H - 0.1);
    fin.translate(x, 0, H / 2);
    parts.push(fin);
  }
  for (let z = 0.08; z < H - 0.06; z += 0.05) {
    const rib = new THREE.BoxGeometry(w - 0.012, D - 0.02, 0.002);
    rib.translate(0, 0.002, z);
    parts.push(rib);
  }
  for (const z of [0.035, H - 0.035]) {
    const hub = new THREE.CylinderGeometry(0.02, 0.02, w, 18);
    hub.rotateZ(Math.PI / 2);
    hub.translate(0, 0, z);
    parts.push(hub);
  }
  const sec = merge(parts);
  const inst = new THREE.InstancedMesh(sec, M.enamel, n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    m4.makeTranslation(-(n * w) / 2 + w / 2 + i * w, 0, 0);
    inst.setMatrixAt(i, m4);
  }
  inst.castShadow = true;
  inst.receiveShadow = true;
  g.add(inst);
  const sgn = flip ? -1 : 1;
  const vent = cylAlong('x', 0.008, 0.02, M.chrome);
  vent.position.set(sgn * ((n * w) / 2 + 0.01), 0, H - 0.035);
  g.add(vent);
  return g;
}

/**
 * Radiator valve set + connection pipes down to the floor pipe run.
 * @param supplyX, returnX  model-frame x of the connector drops; zPipe floor pipe level (relative to mount z)
 */
export function radiatorConnections(M, prod, { flip = false, mount = 0.1, zPipe = 0.05, pipeMatS, pipeMatR, sectional = false }) {
  const g = new THREE.Group();
  const L = prod.length;
  const H = prod.height;
  const sgn = flip ? -1 : 1;
  const xs = -sgn * (L / 2 + 0.05);
  const xr = sgn * (L / 2 + 0.05);
  const yConn = -0.05; // connector at plan local y = 0.05 → model −0.05
  const zTop = mount + H - 0.05;
  const zBot = mount + 0.05;
  const zp = zPipe;
  // supply: floor → up to top side connection with TRV
  g.add(cylBetween(V(xs, yConn, zp), V(xs, yConn, zTop - 0.05), 0.008, pipeMatS));
  const valve = trv(M);
  valve.rotation.x = Math.PI / 2;
  valve.position.set(xs, yConn, zTop - 0.02);
  g.add(valve);
  g.add(cylBetween(V(xs, yConn, zTop), V(-sgn * (L / 2), yConn, zTop), 0.009, M.chrome));
  // return: floor → lockshield at bottom side connection
  g.add(cylBetween(V(xr, yConn, zp), V(xr, yConn, zBot - 0.03), 0.008, pipeMatR));
  const ls = lockshield(M);
  ls.rotation.x = Math.PI / 2;
  ls.position.set(xr, yConn, zBot);
  g.add(ls);
  g.add(cylBetween(V(xr, yConn, zBot + 0.01), V(sgn * (L / 2), yConn, zBot + 0.01), 0.009, M.chrome));
  // wall escutcheons (floor rosettes)
  for (const x of [xs, xr]) {
    const ros = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.004, 20), M.chrome);
    ros.rotation.x = Math.PI / 2;
    ros.position.set(x, yConn, Math.max(0.002, zp - 0.02));
    g.add(ros);
  }
  void sectional;
  return g;
}

// ---------------------------------------------------------------- in-floor convector
/**
 * Trench (in-floor) convector: steel tray sunk into the floor, copper/aluminium heat exchanger,
 * tangential fan (fan models), anodised linear grille flush with the floor, connections at one end.
 * Frame: z = 0 is the finished floor, the tray goes down; plan local y from −0.05 into the room.
 */
export function trenchConvector(M, prod, { pipeZ = 0.05, pipeMatS, pipeMatR, flip = false } = {}) {
  const g = new THREE.Group();
  const L = prod.length;
  const D = prod.depth ?? prod.width ?? 0.3;
  const H = prod.height ?? 0.12;
  const yc = -(D / 2 - 0.05);
  const t = 0.0015;
  // tray (open top): bottom + 4 sides
  g.add(box(L, D, t, M.castIron, 0, yc, -H));
  for (const s of [-1, 1]) g.add(box(L, t, H, M.castIron, 0, yc + (s * D) / 2, -H / 2));
  for (const s of [-1, 1]) g.add(box(t, D, H, M.castIron, (s * L) / 2, yc, -H / 2));
  // frame on top
  for (const s of [-1, 1]) g.add(box(L + 0.01, 0.012, 0.006, M.nickel, 0, yc + (s * (D + 0.004)) / 2, -0.003));
  // heat exchanger: 2 copper tubes with aluminium fins
  const hxY = prod.fan ? yc - D * 0.12 : yc;
  const hxZ = -H * 0.45;
  for (const dz of [-0.012, 0.012]) g.add(cylBetween(V(-L / 2 + 0.06, hxY, hxZ + dz), V(L / 2 - 0.06, hxY, hxZ + dz), 0.006, M.copper, 10));
  const fins = [];
  for (let x = -L / 2 + 0.07; x < L / 2 - 0.07; x += 0.006) {
    const f = new THREE.BoxGeometry(0.0006, D * 0.42, H * 0.55);
    f.translate(x, hxY, hxZ);
    fins.push(f);
  }
  if (fins.length) g.add(mesh(merge(fins), M.nickel, false));
  if (prod.fan) {
    const fan = cylBetween(V(-L / 2 + 0.08, yc + D * 0.25, -H * 0.5), V(L / 2 - 0.12, yc + D * 0.25, -H * 0.5), Math.min(0.03, H * 0.35), M.black, 18);
    g.add(fan);
    g.add(box(0.06, 0.06, H * 0.6, M.black, L / 2 - 0.06, yc + D * 0.25, -H * 0.5));
  }
  // linear grille (anodised aluminium bars across the width)
  const bars = [];
  for (let x = -L / 2 + 0.01; x <= L / 2 - 0.01; x += 0.018) {
    const b = new THREE.BoxGeometry(0.005, D - 0.012, 0.012);
    b.translate(x, yc, -0.006);
    bars.push(b);
  }
  g.add(mesh(merge(bars), M.nickel));
  for (const s of [-1, 1]) g.add(box(L - 0.02, 0.006, 0.012, M.nickel, 0, yc + (s * (D - 0.012)) / 2, -0.006));
  // connections (angle valve + lockshield) at the connector end, drops from the floor pipe level
  const sgn = flip ? -1 : 1;
  for (const [x, mat, z] of [[-sgn * (L / 2 + 0.05), pipeMatS, hxZ + 0.012], [sgn * (L / 2 + 0.05), pipeMatR, hxZ - 0.012]]) {
    const inner = x < 0 ? -L / 2 + 0.06 : L / 2 - 0.06;
    g.add(cylBetween(V(x, -0.05, pipeZ), V(x, -0.05, z), 0.008, mat));
    g.add(cylBetween(V(x, -0.05, z), V(x, hxY, z), 0.008, mat));
    g.add(cylBetween(V(x, hxY, z), V(inner, hxY, z), 0.008, M.chrome));
  }
  return g;
}

// ---------------------------------------------------------------- towel dryer
export function towelDryer(M, prod) {
  const g = new THREE.Group();
  const W = prod.length;
  const H = prod.height;
  for (const s of [-1, 1]) g.add(cylBetween(V((s * W) / 2, 0, 0), V((s * W) / 2, 0, H), 0.014, M.chrome, 16));
  for (let z = 0.06; z < H - 0.02; z += 0.075) g.add(cylBetween(V(-W / 2, 0, z), V(W / 2, 0, z), 0.0095, M.chrome, 12));
  for (const s of [-1, 1]) for (const z of [0.15, H - 0.1]) g.add(cylBetween(V((s * W) / 2, 0, z), V((s * W) / 2, 0.05, z), 0.006, M.chrome, 8));
  return g;
}

// Geometry of the manifold in its model frame (x along the bars, y towards the wall, z up, floor z = 0).
// Supply bar on top and 60 mm further from the wall than the return bar, so the supply outlets pass
// in front of it; outlets point down; the plan connector rows (supply y = 0, return y = −returnY)
// are on the floor in front of the manifold.
export const MANIFOLD = { yS: 0.07, yR: 0.13, zS: 0.72, zR: 0.52, rBar: 0.0165, wallY: 0.2, xIn: -0.1, jog: 0.025 };

/** Swept tube through every point of a 3D polyline (parallel-transport frames, no corner cutting). */
export function tubeAlong(points, r, radial = 12) {
  const P = points.filter((p, i) => i === 0 || p.distanceTo(points[i - 1]) > 1e-6);
  if (P.length < 2) return null;
  const n = P.length;
  const T = P.map((p, i) => {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(n - 1, i + 1)];
    return b.clone().sub(a).normalize();
  });
  // initial normal ⟂ first tangent
  let N = Math.abs(T[0].z) < 0.9 ? V(0, 0, 1) : V(1, 0, 0);
  N = N.sub(T[0].clone().multiplyScalar(N.dot(T[0]))).normalize();
  const pos = [];
  const nor = [];
  const uv = [];
  let len = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      // parallel transport: rotate N by the rotation T[i-1] → T[i]
      const axis = T[i - 1].clone().cross(T[i]);
      const sin = axis.length();
      if (sin > 1e-9) N.applyAxisAngle(axis.normalize(), Math.atan2(sin, T[i - 1].dot(T[i])));
      len += P[i].distanceTo(P[i - 1]);
    }
    // keep the ring perpendicular to the bisecting tangent; scale at bends so the wall keeps its radius
    const B = T[i].clone().cross(N).normalize();
    for (let j = 0; j <= radial; j++) {
      const t = (j / radial) * Math.PI * 2;
      const d = N.clone().multiplyScalar(Math.cos(t)).add(B.clone().multiplyScalar(Math.sin(t)));
      pos.push(P[i].x + d.x * r, P[i].y + d.y * r, P[i].z + d.z * r);
      nor.push(d.x, d.y, d.z);
      uv.push(len, j / radial);
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1); // counter-clockwise seen from outside
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Fillet a 3D orthogonal-ish polyline with circular arcs of radius R (for bent PEX pipe). */
export function bend3(points, R, perQuarter = 8) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const p = points[i];
    const c = points[i + 1];
    const u1 = p.clone().sub(a);
    const u2 = c.clone().sub(p);
    const la = u1.length();
    const lc = u2.length();
    if (la < 1e-9 || lc < 1e-9) continue;
    u1.divideScalar(la);
    u2.divideScalar(lc);
    const th = Math.acos(Math.max(-1, Math.min(1, u1.dot(u2))));
    if (th < 1e-3) {
      out.push(p);
      continue;
    }
    const rr = Math.min(R, Math.min(la, lc) / 2 / Math.tan(th / 2));
    const t = rr * Math.tan(th / 2);
    const s0 = p.clone().addScaledVector(u1, -t);
    const s1 = p.clone().addScaledVector(u2, t);
    const k = Math.max(2, Math.ceil((th / (Math.PI / 2)) * perQuarter));
    // quadratic Bézier with the corner as control point ≈ circular arc for these angles
    for (let j = 0; j <= k; j++) {
      const q = j / k;
      out.push(s0.clone().multiplyScalar((1 - q) * (1 - q)).addScaledVector(p, 2 * (1 - q) * q).addScaledVector(s1, q * q));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function pexPipe(pts, od, mat, R = 0.06) {
  const g = tubeAlong(bend3(pts, R), od / 2, 14);
  return g ? mesh(g, mat) : new THREE.Group();
}

/** Points of the manifold the drawings refer to (model frame), for callouts on detail sheets. */
export function manifoldAnchors(n, portLocal) {
  const { yS, yR, zS, zR, rBar, xIn } = MANIFOLD;
  const x1 = portLocal(n - 1) + 0.06;
  return {
    ballValveS: V(xIn, yS, zS - 0.1),
    ballValveR: V(xIn, yR, zR - 0.1),
    adapter: V(xIn, yR, 0.2),
    elbow: V(xIn, yS, zS),
    balancing: V(xIn, yS, zS - 0.2),
    nipple: V(xIn + 0.02, yS, zS),
    manifold: V((portLocal(0) + x1) / 2, yS, zS + rBar),
    sleeveRed: V(portLocal(n - 1), yS, 0.2),
    actuator: V(portLocal(n - 1), yR, zR + rBar + 0.05),
    sleeveBlue: V(portLocal(Math.max(0, n - 2)) + MANIFOLD.jog, yR, 0.15),
  };
}

// ---------------------------------------------------------------- manifold
/**
 * Distribution manifold as installed: wall brackets, supply bar (flow meters on top) above and in
 * front of the return bar (thermostatic inserts + electro-thermal actuators), eurocone outlets
 * pointing down with PEX pipes bent into the floor, ball valves on the inlets, air vents and drain
 * cocks on the end group, optional mixing unit (3-way valve + circulator), open cabinet.
 */
export function manifold(M, { n, kind, mixing, pitch, returnY, portLocal, pipeZ, pipeMatS, pipeMatR, floorZ = null, cabinet = true, drops = true }) {
  const g = new THREE.Group();
  const ufh = kind === 'ufh';
  const { yS, yR, zS, zR, rBar, wallY, xIn, jog } = MANIFOLD;
  const x0 = xIn + 0.03;
  const x1 = portLocal(n - 1) + 0.06;
  const zF = floorZ ?? pipeZ; // pipes leave the manifold at this height (UFH: on the insulation)
  const od = 0.016;
  // ---- cabinet (open front)
  const cab = new THREE.Group();
  const cx0 = (mixing && ufh ? -0.46 : xIn - 0.08);
  const cx1 = x1 + 0.08;
  const cw = cx1 - cx0;
  const cxm = (cx0 + cx1) / 2;
  cab.add(box(cw, 0.008, 0.66, M.cabinet, cxm, wallY - 0.004, 0.63));
  for (const xe of [cx0, cx1]) cab.add(box(0.008, 0.13, 0.66, M.cabinet, xe, wallY - 0.065, 0.63));
  cab.add(box(cw, 0.13, 0.008, M.cabinet, cxm, wallY - 0.065, 0.96));
  // DIN rail + a strip of terminals for the actuators (UFH)
  if (ufh) {
    cab.add(box(Math.min(0.3, cw - 0.1), 0.01, 0.035, M.steel, cxm, wallY - 0.012, 0.9));
    cab.add(box(Math.min(0.22, cw - 0.12), 0.05, 0.06, M.whitePlastic, cxm, wallY - 0.04, 0.9, 0.004));
  }
  if (cabinet) g.add(cab);
  // ---- brackets: galvanised plate on the wall, two arms, rubber-lined clamps
  for (const xb of [x0 + 0.035, x1 - 0.035]) {
    g.add(box(0.03, 0.004, zS - zR + 0.16, M.steel, xb, wallY - 0.01, (zS + zR) / 2));
    g.add(box(0.02, wallY - 0.01 - yS, 0.004, M.steel, xb, (wallY - 0.01 + yS) / 2, zS - rBar - 0.004));
    g.add(box(0.02, wallY - 0.01 - yR, 0.004, M.steel, xb, (wallY - 0.01 + yR) / 2, zR - rBar - 0.004));
    for (const [yy, zz] of [[yS, zS], [yR, zR]]) {
      const clamp = mesh(new THREE.TorusGeometry(rBar + 0.003, 0.004, 8, 24), M.steel);
      clamp.rotation.y = Math.PI / 2;
      clamp.position.set(xb, yy, zz);
      g.add(clamp);
    }
  }
  for (const [z, y, mat, sys] of [[zS, yS, pipeMatS, 'supply'], [zR, yR, pipeMatR, 'return']]) {
    const sup = sys === 'supply';
    // ---- bar (1" nickel-plated brass) with hex end pieces
    const bar = cylAlong('x', rBar, x1 - x0, M.nickel, 24);
    bar.position.set((x0 + x1) / 2, y, z);
    g.add(bar);
    for (const xe of [x0, x1]) {
      const h = hexNut(rBar * 1.3, 0.022, M.nickel);
      h.rotation.z = Math.PI / 2;
      h.position.set(xe, y, z);
      g.add(h);
    }
    // ---- end group: automatic air vent on top, drain cock with cap below
    const eg = cylAlong('x', rBar * 0.95, 0.035, M.brass, 20);
    eg.position.set(x1 + 0.028, y, z);
    g.add(eg);
    const vent = cylAlong('z', 0.012, 0.035, M.brass, 18);
    vent.position.set(x1 + 0.03, y, z + rBar + 0.017);
    g.add(vent);
    const ventCap = cylAlong('z', 0.013, 0.014, M.black, 18);
    ventCap.position.set(x1 + 0.03, y, z + rBar + 0.042);
    g.add(ventCap);
    const drain = cylAlong('z', 0.008, 0.03, M.brass, 14);
    drain.position.set(x1 + 0.03, y, z - rBar - 0.015);
    g.add(drain);
    const dcap = cylAlong('z', 0.009, 0.012, sup ? M.redPlastic : M.bluePlastic, 14);
    dcap.position.set(x1 + 0.03, y, z - rBar - 0.036);
    g.add(dcap);
    // ---- thermometer on the inlet end
    const th = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 28), M.chrome);
    th.position.set(x0 + 0.012, y - rBar - 0.02, z + 0.03);
    g.add(th);
    const face = mesh(new THREE.CircleGeometry(0.019, 28), M.whitePlastic);
    face.rotation.x = Math.PI / 2;
    face.position.set(x0 + 0.012, y - rBar - 0.0265, z + 0.03);
    g.add(face);
    // ---- inlet: elbow at the bar end, ball valve (butterfly handle) going down, pipe to the plan connector
    const elbow = mesh(new THREE.SphereGeometry(rBar * 1.15, 18, 14), M.brass);
    elbow.position.set(xIn, y, z);
    g.add(elbow);
    g.add(cylBetween(V(xIn, y, z), V(x0, y, z), rBar * 0.9, M.brass, 18));
    const mixedInlet = ufh && mixing && sup;
    const bv = ballValve(M, 0.026, sup ? M.redPlastic : M.bluePlastic, 'z');
    bv.position.set(xIn, y, mixedInlet ? 0.36 : z - 0.1);
    g.add(bv);
    if (sup) {
      // balancing valve with measuring nipples below the ball valve
      const body = cylAlong('z', 0.02, 0.055, M.brass, 18);
      const zb = mixedInlet ? 0.24 : z - 0.2;
      body.position.set(xIn, y, zb);
      g.add(body);
      const bon = mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.05, 16), M.brass);
      bon.rotation.x = Math.PI / 2;
      bon.position.set(xIn, y - 0.035, zb);
      g.add(bon);
      const cap = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 16), M.bluePlastic);
      cap.rotation.x = Math.PI / 2;
      cap.position.set(xIn, y - 0.065, zb);
      g.add(cap);
    }
    const conY = sup ? 0 : -returnY;
    if (!mixedInlet) {
      // inlet pipe down to the floor and forward to the plan connector (return jogs sideways past the supply)
      const dx = sup ? 0 : -jog;
      const pts = [V(xIn, y, z - 0.13), V(xIn, y, 0.3), V(xIn + dx, y, 0.25), V(xIn + dx, y, pipeZ), V(xIn + dx, conY, pipeZ), V(xIn, conY - 0.001, pipeZ)];
      g.add(pexPipe(pts, 0.026, mat, 0.08));
    }
    // ---- outlets
    for (let i = 0; i < n; i++) {
      const x = portLocal(i);
      // valve insert on top: flow meter (supply) / thermostatic insert + actuator (return)
      const base = hexNut(0.013, 0.012, M.brass);
      base.rotation.x = Math.PI / 2;
      base.position.set(x, y, z + rBar + 0.006);
      g.add(base);
      if (sup && ufh) {
        const glassT = cylAlong('z', 0.0105, 0.062, M.flowMeter, 20);
        glassT.position.set(x, y, z + rBar + 0.043);
        g.add(glassT);
        const scale = box(0.004, 0.001, 0.05, M.whitePlastic, x, y - 0.0107, z + rBar + 0.043);
        g.add(scale);
        const float = cylAlong('z', 0.0055, 0.01, M.redPlastic, 12);
        float.position.set(x, y, z + rBar + 0.035);
        g.add(float);
        const cap = cylAlong('z', 0.0125, 0.016, M.redPlastic, 20);
        cap.position.set(x, y, z + rBar + 0.082);
        g.add(cap);
      } else if (sup) {
        const vb = ballValve(M, 0.012, M.redPlastic, 'z');
        vb.position.set(x, y, z + rBar + 0.03);
        g.add(vb);
      } else {
        const stem = cylAlong('z', 0.006, 0.018, M.nickel, 12);
        stem.position.set(x, y, z + rBar + 0.02);
        g.add(stem);
        if (ufh) {
          // electro-thermal actuator (white body, LED window)
          const act = cylAlong('z', 0.017, 0.048, M.whitePlastic, 24);
          act.position.set(x, y, z + rBar + 0.052);
          g.add(act);
          const dome = mesh(new THREE.SphereGeometry(0.017, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.whitePlastic);
          dome.rotation.x = Math.PI / 2;
          dome.position.set(x, y, z + rBar + 0.076);
          g.add(dome);
          const led = box(0.006, 0.002, 0.006, M.lcd, x, y - 0.0172, z + rBar + 0.06);
          g.add(led);
        } else {
          const cap = cylAlong('z', 0.014, 0.022, M.bluePlastic, 20);
          cap.position.set(x, y, z + rBar + 0.04);
          g.add(cap);
        }
      }
      // eurocone outlet (brass) + compression union nut (nickel) pointing down
      const cone = cylAlong('z', 0.0095, 0.022, M.brass, 16);
      cone.position.set(x, y, z - rBar - 0.011);
      g.add(cone);
      const nut = hexNut(0.0135, 0.018, M.nickel);
      nut.rotation.x = Math.PI / 2;
      nut.position.set(x, y, z - rBar - 0.03);
      g.add(nut);
      // PEX pipe: straight down, (return: sideways past the supply pipe), bent into the floor, forward to the plan connector
      // (UFH in the model view: the pipe is drawn together with its lead, bending the way the lead leaves)
      if (!drops) continue;
      const zTop = z - rBar - 0.04;
      const dx = sup ? 0 : jog;
      const pts = sup
        ? [V(x, y, zTop), V(x, y, zF), V(x, conY, zF)]
        : [V(x, y, zTop), V(x, y, 0.34), V(x + dx, y, 0.29), V(x + dx, y, zF), V(x + dx, conY + 0.06, zF), V(x, conY, zF)];
      g.add(pexPipe(pts, od, mat, 0.07));
      // protective sleeve on the vertical part above the floor (red supply / blue return)
      const sl = cylAlong('z', 0.0115, 0.16, sup ? M.redPlastic : M.bluePlastic, 18);
      sl.position.set(x + dx, y, zF + 0.16);
      g.add(sl);
    }
  }
  if (ufh && mixing) {
    // mixing unit: supply comes up at xIn, runs left under the bars to the 3-way thermostatic valve,
    // up and back through the circulator into the supply bar; bypass from the valve to the return bar
    const xV = -0.4;
    const zL = zS - 0.13;
    g.add(pexPipe([V(xIn, 0, pipeZ), V(xIn, yS, pipeZ), V(xIn, yS, zL - 0.12)], 0.026, pipeMatS, 0.08));
    g.add(cylBetween(V(xIn, yS, zL - 0.12), V(xIn, yS, zL), 0.013, M.brass));
    g.add(cylBetween(V(xIn, yS, zL), V(xV, yS, zL), 0.013, M.brass));
    g.add(cylBetween(V(xV, yS, zL), V(xV, yS, zS), 0.013, M.brass));
    const valve = mesh(new THREE.SphereGeometry(0.028, 18, 14), M.brass);
    valve.position.set(xV, yS, zS);
    g.add(valve);
    const head = cylAlong('y', 0.024, 0.07, M.whitePlastic, 28);
    head.position.set(xV, yS - 0.06, zS);
    g.add(head);
    const pump = circulator(M, 0.18);
    pump.position.set((xV + xIn) / 2 - 0.02, yS, zS);
    g.add(pump);
    g.add(cylBetween(V(xV, yS, zS), V(xIn - 0.12, yS, zS), 0.013, M.brass));
    g.add(cylBetween(V(xIn + 0.08 - 0.18, yS, zS), V(xIn, yS, zS), 0.013, M.brass));
    // bypass to the return bar
    g.add(cylBetween(V(xV, yS, zS - 0.03), V(xV, yR, zR), 0.011, M.brass));
    g.add(cylBetween(V(xV, yR, zR), V(xIn, yR, zR), 0.011, M.brass));
    // immersion thermometer on the mixed supply
    const th = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.012, 28), M.chrome);
    th.position.set(xIn - 0.05, yS - 0.03, zS + 0.045);
    g.add(th);
  }
  void pitch;
  return g;
}

// ---------------------------------------------------------------- circulator pump
export function circulator(M, portToPort = 0.18) {
  const g = new THREE.Group();
  const body = cylAlong('x', 0.032, portToPort * 0.7, M.castIron, 24);
  g.add(body);
  for (const s of [-1, 1]) {
    const u = hexNut(0.03, 0.022, M.brass);
    u.rotation.z = Math.PI / 2;
    u.position.x = (s * portToPort) / 2;
    g.add(u);
  }
  const volute = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 28), M.castIron);
  volute.position.set(0, -0.03, 0);
  g.add(volute);
  // motor housing with cooling ribs (lathe profile), axis along −Y (towards the viewer)
  const prof = [V(0, 0, 0), V(0.047, 0, 0), V(0.047, 0.02, 0), V(0.05, 0.022, 0), V(0.05, 0.1, 0), V(0.035, 0.115, 0), V(0, 0.118, 0)].map((p) => new THREE.Vector2(p.x, p.y));
  const motor = mesh(new THREE.LatheGeometry(prof, 32), M.pumpBody);
  motor.rotation.x = Math.PI; // grow towards −Y
  motor.position.set(0, -0.055, 0);
  g.add(motor);
  for (let i = 0; i < 8; i++) {
    const rib = box(0.004, 0.08, 0.006, M.pumpBody, Math.cos((i / 8) * Math.PI * 2) * 0.05, -0.11, Math.sin((i / 8) * Math.PI * 2) * 0.05);
    g.add(rib);
  }
  const tb = box(0.06, 0.05, 0.035, M.black, 0, -0.12, 0.06, 0.006);
  g.add(tb);
  const led = box(0.02, 0.004, 0.012, M.lcd, 0, -0.176, 0);
  g.add(led);
  return g;
}

// ---------------------------------------------------------------- boiler
/** Wall-hung gas boiler with coaxial flue, display, service valves and pipe connections. */
export function wallBoiler(M, prod, { pipeMatS, pipeMatR, pipeZ }) {
  const g = new THREE.Group();
  const big = (prod?.powerKw ?? 24) > 35;
  const W = big ? 0.6 : 0.44;
  const H = big ? 0.9 : 0.72;
  const Dp = big ? 0.5 : 0.34;
  const z0 = 1.0;
  const yc = -0.065; // body centre (model frame)
  g.add(box(W, Dp, H, M.whitePlastic, 0, yc, z0 + H / 2, 0.03));
  // front control panel (front = model +Y, away from the wall)
  const yf = yc + Dp / 2;
  g.add(box(W * 0.92, 0.012, 0.13, M.darkGrey, 0, yf + 0.002, z0 + 0.1, 0.01));
  g.add(box(0.09, 0.004, 0.045, M.lcd, 0, yf + 0.009, z0 + 0.11));
  for (const s of [-1, 1]) {
    const k = cylAlong('y', 0.014, 0.018, M.chrome, 24);
    k.position.set(s * 0.12, yf + 0.012, z0 + 0.1);
    g.add(k);
  }
  g.add(box(0.1, 0.003, 0.018, M.darkGrey, 0, yf + 0.001, z0 + H - 0.08));
  g.add(box(W * 0.8, 0.002, 0.003, M.enamelShade, 0, yf + 0.001, z0 + 0.19));
  // coaxial flue 60/100: up, elbow into the wall (+model −Y is towards the wall)
  const fz = z0 + H;
  g.add(cylBetween(V(0, yc, fz), V(0, yc, fz + 0.18), 0.05, M.whitePlastic, 28));
  const elbow = mesh(new THREE.TorusGeometry(0.1, 0.05, 16, 24, Math.PI / 2), M.whitePlastic);
  elbow.rotation.set(0, -Math.PI / 2, 0);
  elbow.position.set(0, yc - 0.1, fz + 0.18);
  g.add(elbow);
  g.add(cylBetween(V(0, yc - 0.1, fz + 0.28), V(0, -0.6, fz + 0.28), 0.05, M.whitePlastic, 28));
  // bottom connections (5): CH flow, DHW out, gas, cold in, CH return
  const conns = [[-0.12, 'supply'], [-0.06, 'dhw'], [0, 'gas'], [0.06, 'cold'], [0.12, 'return']];
  for (const [x, kind] of conns) {
    const top = V(x, yc - 0.02, z0);
    const low = V(x, yc - 0.02, z0 - 0.09);
    const mat = kind === 'supply' ? pipeMatS : kind === 'return' ? pipeMatR : kind === 'gas' ? M.yellow : kind === 'dhw' ? M.copper : M.steel;
    g.add(cylBetween(top, low, 0.01, M.chrome));
    const v = ballValve(M, 0.016, kind === 'gas' ? M.yellow : kind === 'supply' ? M.redPlastic : kind === 'return' ? M.bluePlastic : M.black, 'z');
    v.position.copy(low);
    g.add(v);
    if (kind === 'supply' || kind === 'return') {
      // down behind the boiler to the floor connector (plan local (±0.12, 0.25) → model y −0.25)
      const bot = V(x, yc - 0.02, z0 - 0.14);
      g.add(cylBetween(low, bot, 0.011, mat));
      g.add(cylBetween(bot, V(x, -0.25, z0 - 0.14), 0.011, mat));
      g.add(cylBetween(V(x, -0.25, z0 - 0.14), V(x, -0.25, pipeZ + (kind === 'supply' ? 0.1 : 0.15)), 0.011, mat));
    } else {
      g.add(cylBetween(low, V(x, -0.25, z0 - 0.3), 0.008, mat));
    }
  }
  // safety group & manometer on the flow pipe
  const sv = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 12), M.brass);
  sv.rotation.z = Math.PI / 2;
  sv.position.set(-0.17, -0.2, z0 - 0.2);
  g.add(sv);
  const mano = cylAlong('y', 0.025, 0.012, M.chrome, 24);
  mano.position.set(-0.17, -0.2 - 0.02, z0 - 0.14);
  g.add(mano);
  return g;
}

// ---------------------------------------------------------------- expansion vessel
export function expansionVessel(M, volumeL) {
  const g = new THREE.Group();
  const V3 = volumeL / 1000;
  const r = Math.max(0.1, Math.cbrt(V3 / (Math.PI * 2.2)));
  const h = r * 2.2;
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(a) * r * 0.999 + 0.0001, -h / 2 - Math.cos(a) * r * 0.35 + r * 0.35));
  }
  for (let i = 10; i >= 0; i--) {
    const a = (i / 10) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(a) * r * 0.999 + 0.0001, h / 2 + Math.cos(a) * r * 0.35 - r * 0.35));
  }
  const shell = mesh(new THREE.LatheGeometry(pts, 36), M.tankRed);
  shell.rotation.x = Math.PI / 2;
  g.add(shell);
  const seam = mesh(new THREE.TorusGeometry(r * 1.005, 0.004, 8, 40), M.tankRed);
  g.add(seam);
  const valve = cylAlong('z', 0.01, 0.03, M.brass);
  valve.position.z = h / 2 + 0.02;
  g.add(valve);
  const conn = cylAlong('z', 0.012, 0.04, M.steel);
  conn.position.z = -h / 2 - 0.02;
  g.add(conn);
  return { group: g, height: h, radius: r };
}

// ---------------------------------------------------------------- thermostat
export function roomThermostat(M) {
  const g = new THREE.Group();
  g.add(box(0.085, 0.022, 0.085, M.whitePlastic, 0, 0, 0, 0.008));
  g.add(box(0.045, 0.003, 0.022, M.lcd, 0, -0.012, 0.012));
  const dial = cylAlong('y', 0.014, 0.006, M.enamelShade, 24);
  dial.position.set(0, -0.013, -0.018);
  g.add(dial);
  return g;
}

// ---------------------------------------------------------------- pipes with fittings
/**
 * Pipe run through 3D points (world). style: 'socket' (PPR/steel/Cu: straight bars, elbow fittings
 * and sockets, couplings every bar length) or 'bend' (PEX/PE-RT: bent pipe, radius 5·OD).
 */
export function pipeRun(pts, od, mat, { style = 'socket', fittingMat = null, barLength = 4 } = {}) {
  const g = new THREE.Group();
  const r = od / 2;
  const P = pts.map((p) => (p.isVector3 ? p : V(p.x, p.y, p.z)));
  if (P.length < 2) return g;
  const bendR = style === 'bend' ? Math.max(5 * od, 0.05) : od * 1.1;
  const cut = [];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i].clone().sub(P[i - 1]);
    const b = P[i + 1].clone().sub(P[i]);
    const la = a.length();
    const lb = b.length();
    if (la < 1e-6 || lb < 1e-6) {
      cut.push(0);
      continue;
    }
    const ang = a.normalize().angleTo(b.normalize());
    cut.push(ang < 1e-3 ? 0 : Math.min(bendR * Math.tan(ang / 2), la / 2, lb / 2));
  }
  const fm = fittingMat ?? mat;
  const socket = (pos, dir) => {
    const s = mesh(new THREE.CylinderGeometry(r * 1.32, r * 1.32, od * 1.5, 18), fm);
    s.position.copy(pos);
    s.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
    g.add(s);
  };
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i];
    const b = P[i + 1];
    const d = b.clone().sub(a);
    const L = d.length();
    if (L < 1e-6) continue;
    const u = d.clone().normalize();
    const s0 = i > 0 ? cut[i - 1] : 0;
    const s1 = i < P.length - 2 ? cut[i] : 0;
    const A = a.clone().addScaledVector(u, s0);
    const B = b.clone().addScaledVector(u, -s1);
    if (A.distanceTo(B) > 1e-4) g.add(cylBetween(A, B, r, mat, 14));
    if (style === 'socket' && barLength > 0) {
      for (let s = barLength; s < L - 0.1; s += barLength) socket(a.clone().addScaledVector(u, s), u);
    }
  }
  for (let i = 1; i < P.length - 1; i++) {
    const c = cut[i - 1];
    if (c <= 0) continue;
    const uin = P[i].clone().sub(P[i - 1]).normalize();
    const uout = P[i + 1].clone().sub(P[i]).normalize();
    const p0 = P[i].clone().addScaledVector(uin, -c);
    const p1 = P[i].clone().addScaledVector(uout, c);
    const curve = new THREE.QuadraticBezierCurve3(p0, P[i].clone(), p1);
    const rr = style === 'socket' ? r * 1.28 : r;
    g.add(mesh(new THREE.TubeGeometry(curve, 8, rr, 14, false), style === 'socket' ? fm : mat));
    if (style === 'socket') {
      socket(p0, uin);
      socket(p1, uout);
    }
  }
  return g;
}

/** Tee fitting at a junction. */
export function teeFitting(pos, od, mat) {
  const s = mesh(new THREE.SphereGeometry(od * 0.75, 16, 12), mat);
  s.position.copy(pos);
  return s;
}

// ---------------------------------------------------------------- openings
/**
 * Window: PVC frame + sash + mullion, double glazing, interior sill board, exterior ebb.
 * Built in the wall frame: X along the wall, Y across (−Y = interior side), Z up from the sill.
 */
export function windowModel(M, w, h, t, interiorSign = -1) {
  const g = new THREE.Group();
  const f = 0.065; // frame profile width
  const depth = 0.07;
  const y = 0; // centred in the wall
  // outer frame
  g.add(box(w, depth, f, M.pvc, 0, y, f / 2));
  g.add(box(w, depth, f, M.pvc, 0, y, h - f / 2));
  g.add(box(f, depth, h, M.pvc, -w / 2 + f / 2, y, h / 2));
  g.add(box(f, depth, h, M.pvc, w / 2 - f / 2, y, h / 2));
  const two = w > 1.0;
  if (two) g.add(box(f * 1.2, depth, h - 2 * f, M.pvc, 0, y, h / 2));
  // sashes (inner frames) + glass
  const panes = two ? [[-w / 4, w / 2 - f * 1.1], [w / 4, w / 2 - f * 1.1]] : [[0, w - 2 * f]];
  for (const [cx, pw] of panes) {
    const ph = h - 2 * f;
    for (const [sx, sy, px, pz] of [[pw, 0.05, cx, f + 0.025], [pw, 0.05, cx, h - f - 0.025]]) g.add(box(sx, 0.06, sy, M.pvc, px, y - 0.005, pz));
    for (const s of [-1, 1]) g.add(box(0.05, 0.06, ph, M.pvc, cx + (s * (pw - 0.05)) / 2, y - 0.005, h / 2));
    const glass = box(pw - 0.1, 0.024, ph - 0.1, M.glass, cx, y - 0.005, h / 2);
    glass.castShadow = false;
    g.add(glass);
    const handle = box(0.012, 0.03, 0.09, M.whitePlastic, cx + (pw / 2 - 0.04) * (cx <= 0 ? 1 : -1), y + interiorSign * 0.045, h / 2);
    g.add(handle);
  }
  // interior sill board & exterior ebb
  g.add(box(w + 0.1, t / 2 + 0.05, 0.02, M.sill, 0, interiorSign * (t / 4 + 0.025), -0.01));
  g.add(box(w + 0.04, t / 2 + 0.03, 0.008, M.ebb, 0, -interiorSign * (t / 4 + 0.015), -0.012));
  return g;
}

/** Door: casing frame, leaf with panels, lever handle (chrome), threshold. */
export function doorModel(M, w, h, t) {
  const g = new THREE.Group();
  const f = 0.06;
  g.add(box(f, t + 0.02, h, M.frameWood, -w / 2 + f / 2, 0, h / 2));
  g.add(box(f, t + 0.02, h, M.frameWood, w / 2 - f / 2, 0, h / 2));
  g.add(box(w, t + 0.02, f, M.frameWood, 0, 0, h - f / 2));
  g.add(box(w - 2 * f, t + 0.01, 0.015, M.frameWood, 0, 0, 0.0075));
  const leaf = box(w - 2 * f - 0.006, 0.04, h - f - 0.01, M.doorWood, 0, 0, (h - f) / 2 + 0.005);
  g.add(leaf);
  for (const [z, hh] of [[0.55, 0.7], [1.45, 0.75]]) {
    for (const s of [-1, 1]) g.add(box(w - 2 * f - 0.16, 0.006, hh, M.frameWood, 0, s * 0.022, z));
  }
  for (const s of [-1, 1]) {
    const rose = cylAlong('y', 0.025, 0.01, M.chrome, 20);
    rose.position.set(w / 2 - f - 0.07, s * 0.027, 1.0);
    g.add(rose);
    const lever = box(0.12, 0.018, 0.018, M.chrome, w / 2 - f - 0.12, s * 0.045, 1.0, 0.008);
    g.add(lever);
  }
  return g;
}

/** Scale BoxGeometry UVs to metres so tiling textures keep real size. */
export function metricBoxUV(geo, L, D, H) {
  const uv = geo.attributes.uv;
  const faces = [[H, D], [H, D], [L, H], [L, H], [L, D], [L, D]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * faces[f][0], uv.getY(i) * faces[f][1]);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

export { THREE };
