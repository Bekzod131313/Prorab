// Domain / BIM model. Pure data + helpers. No DOM, no rendering, no calculation side effects.
//
// A project is a plain JSON object (serialised 1:1 into the native .zph file):
//   { schema, meta, settings, levels[], elements{id→element}, revisions[], issues[], history[] }
// Every element has: id, guid, cat (category/family), type, levelId, mark, params…, custom{}.

import { guid, shortId, deepClone, polygonArea, polygonCentroid, add, mul } from './util.js';
import { ROOM_TYPES } from '../data/climate.js';

export const SCHEMA_VERSION = 3;
export const FILE_EXT = '.zph';

export const CATEGORIES = [
  'wall',
  'window',
  'door',
  'room',
  'radiator',
  'pipe',
  'riser',
  'collector',
  'boiler',
  'pump',
  'tank',
  'thermostat',
  'obstacle',
  'text',
  'dim',
];

export const MARK_PREFIX = {
  radiator: 'R',
  pipe: 'P',
  riser: 'CT',
  collector: 'C',
  boiler: 'B',
  pump: 'N',
  tank: 'EXP',
  thermostat: 'T',
  window: 'OK',
  door: 'D',
  obstacle: 'X',
};

export function defaultSettings() {
  return {
    standard: 'SP-UZ', // active standard set; never mixed silently
    country: 'UZ',
    climate: { city: 'Toshkent', tOut: -15, manual: false },
    northAngle: 0,
    regime: { ts: 75, tr: 65, name: '75/65/20' },
    ufhRegime: { ts: 45, tr: 35 },
    radiatorReserve: 1.1,
    heatLossSafety: 1.0,
    internalGainsWm2: 0,
    infiltrationAch: 0.3,
    ventPolicy: 'max', // 'max' (EN 12831 / SP: larger of ventilation & infiltration) | 'sum'
    velMin: 0.2,
    velMax: 0.8,
    velCritical: 1.2,
    maxRPaM: 250,
    maxBranchKpa: 25,
    pipeMaterial: 'PPR',
    pipeElevation: 0.05,
    ufhMaxLoopM: 100,
    ufhMaxSurface: { occupied: 29, bathroom: 33, perimeter: 35 },
    ufhMaxLoopKpa: 20,
    boilerReserve: 1.1,
    dhwKw: 0,
    dhwSimultaneity: 0,
    pumpHeadMargin: 1.1,
    staticHeightM: 6,
    safetyValveBar: 3,
    wasteFactor: 0.07,
    laborPct: 25,
    transportPct: 3,
    currency: 'UZS',
    // exchange rates relative to USD; source is user-editable (no single hard-coded feed)
    rates: { USD: 1, UZS: 12800, RUB: 92, EUR: 0.92, TJS: 10.9 },
    ratesDate: '2026-09-01',
    ratesSource: 'manual',
    autosaveMin: 3,
    units: { length: 'm', power: 'W', pressure: 'kPa', flow: 'l/h', temp: '°C' },
    colors: { supply: '#e0312b', return: '#1f5fd6', ufh: '#e08a1f', warn: '#f2a100', error: '#d11a2a' },
  };
}

export function createEmptyProject(name = 'Yangi loyiha') {
  const l0 = { id: 'lvl_0', name: '1-qavat', elevation: 0, height: 3.0, floorThickness: 0.3 };
  return {
    schema: SCHEMA_VERSION,
    app: 'ZODPRO Heating BIM',
    meta: {
      name,
      number: 'ZP-' + new Date().getFullYear() + '-001',
      client: '',
      address: '',
      designer: '',
      checker: '',
      company: 'ZODPRO',
      date: new Date().toISOString().slice(0, 10),
      stage: 'P',
    },
    settings: defaultSettings(),
    levels: [l0],
    elements: {},
    revisions: [{ no: '00', date: new Date().toISOString().slice(0, 10), by: '', what: 'Initial issue' }],
    issues: [],
    customParams: [], // [{name, type, categories[]}]
    history: [],
  };
}

export function newElement(cat, props = {}) {
  return {
    id: shortId(cat.slice(0, 3)),
    guid: guid(),
    cat,
    mark: '',
    custom: {},
    ...deepClone(props),
  };
}

// ---------- queries ----------
export const elementsOf = (project, cat, levelId) =>
  Object.values(project.elements).filter((e) => e.cat === cat && (levelId === undefined || e.levelId === levelId));

export const levelById = (project, id) => project.levels.find((l) => l.id === id);

export function sortedLevels(project) {
  return [...project.levels].sort((a, b) => a.elevation - b.elevation);
}

export function levelIndex(project, levelId) {
  return sortedLevels(project).findIndex((l) => l.id === levelId);
}

export function roomType(room) {
  return ROOM_TYPES[room.roomType] ?? ROOM_TYPES.living;
}

export function roomTemp(room) {
  return room.tIn ?? roomType(room).tIn;
}

export function roomHeight(project, room) {
  return room.height ?? levelById(project, room.levelId)?.height ?? 3;
}

export function roomGeometry(project, room) {
  const area = Math.abs(polygonArea(room.points));
  const h = roomHeight(project, room);
  return { area, volume: area * h, height: h, centroid: polygonCentroid(room.points) };
}

export function isHeated(room) {
  return room.heated ?? roomType(room).heated;
}

export function wallDir(w) {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const L = Math.hypot(dx, dy) || 1;
  return { x: dx / L, y: dy / L, L };
}

/** Plan position of an opening centre on its host wall. */
export function openingPos(project, op) {
  const w = project.elements[op.wallId];
  if (!w) return null;
  const d = wallDir(w);
  return { x: w.a.x + d.x * op.offset, y: w.a.y + d.y * op.offset, angle: Math.atan2(d.y, d.x), wall: w };
}

// local → plan transform for placed equipment
export function localToPlan(el, lx, ly) {
  const a = ((el.angle ?? 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: el.x + lx * c - ly * s, y: el.y + lx * s + ly * c };
}

// ---------- connectors ----------
// Connector: { id, elementId, name, system: supply|return, pos:{x,y}, levelId, z, dir, dn, kind }
export function connectorsOf(project, el, productLookup) {
  const out = [];
  const push = (name, system, lx, ly, extra = {}) => {
    const p = localToPlan(el, lx, ly);
    out.push({ id: `${el.id}:${name}`, elementId: el.id, name, system, pos: p, levelId: el.levelId, ...extra });
  };
  switch (el.cat) {
    case 'radiator': {
      // the stored length is the single source of truth for connector positions (attached pipes
      // stay consistent); syncRadiatorGeometry() updates it and drags pipes when selection changes
      const L = el.length ?? 1;
      const flip = el.flip ? -1 : 1;
      push('supply', 'supply', -flip * (L / 2 + 0.05), 0.05, { kind: 'consumer_in', dn: '15' });
      push('return', 'return', flip * (L / 2 + 0.05), 0.05, { kind: 'consumer_out', dn: '15' });
      break;
    }
    case 'collector': {
      const n = el.outlets ?? 4;
      push('in_supply', 'supply', -0.1, 0, { kind: 'collector_in', dn: '25' });
      push('in_return', 'return', -0.1, 0.2, { kind: 'collector_in', dn: '25' });
      if (el.kind !== 'ufh') {
        for (let i = 0; i < n; i++) {
          push(`s${i + 1}`, 'supply', 0.05 + i * 0.1, 0, { kind: 'collector_port', port: i + 1, dn: '16' });
          push(`r${i + 1}`, 'return', 0.05 + i * 0.1, 0.2, { kind: 'collector_port', port: i + 1, dn: '16' });
        }
      }
      break;
    }
    case 'boiler':
      push('supply', 'supply', -0.12, 0.25, { kind: 'source_out', dn: '25' });
      push('return', 'return', 0.12, 0.25, { kind: 'source_in', dn: '25' });
      break;
    case 'pump':
      push('in', 'supply', -0.15, 0, { kind: 'pump_in', dn: '25' });
      push('out', 'supply', 0.15, 0, { kind: 'pump_out', dn: '25' });
      break;
    default:
      break;
  }
  return out;
}

export function allConnectors(project, productLookup) {
  const out = [];
  for (const el of Object.values(project.elements)) {
    if (['radiator', 'collector', 'boiler', 'pump'].includes(el.cat)) out.push(...connectorsOf(project, el, productLookup));
  }
  return out;
}

// ---------- marks ----------
export function autoMark(project) {
  const counters = {};
  const cats = Object.keys(MARK_PREFIX);
  const els = Object.values(project.elements)
    .filter((e) => cats.includes(e.cat))
    .sort((a, b) => {
      const la = levelIndex(project, a.levelId);
      const lb = levelIndex(project, b.levelId);
      if (la !== lb) return la - lb;
      return (a.y ?? a.a?.y ?? a.points?.[0]?.y ?? 0) - (b.y ?? b.a?.y ?? b.points?.[0]?.y ?? 0) ||
        (a.x ?? a.a?.x ?? a.points?.[0]?.x ?? 0) - (b.x ?? b.a?.x ?? b.points?.[0]?.x ?? 0);
    });
  const changes = {};
  for (const e of els) {
    if (e.markLocked) continue;
    counters[e.cat] = (counters[e.cat] ?? 0) + 1;
    const m = `${MARK_PREFIX[e.cat]}-${String(counters[e.cat]).padStart(2, '0')}`;
    if (e.mark !== m) changes[e.id] = m;
  }
  return changes;
}

// ---------- data integrity ----------
export function integrityCheck(project) {
  const problems = [];
  const guids = new Set();
  for (const e of Object.values(project.elements)) {
    if (guids.has(e.guid)) problems.push({ code: 'dup_guid', id: e.id });
    guids.add(e.guid);
    if (e.levelId && !levelById(project, e.levelId) && e.cat !== 'riser') problems.push({ code: 'bad_level', id: e.id });
    if ((e.cat === 'window' || e.cat === 'door') && !project.elements[e.wallId]) problems.push({ code: 'orphan_opening', id: e.id });
    if (e.cat === 'radiator' && e.roomId && !project.elements[e.roomId]) problems.push({ code: 'bad_room_ref', id: e.id });
    if (e.cat === 'room' && e.ufh?.collectorId && !project.elements[e.ufh.collectorId]) problems.push({ code: 'bad_collector_ref', id: e.id });
    if (e.cat === 'thermostat') {
      for (const c of e.controls ?? []) if (!project.elements[c]) problems.push({ code: 'bad_control_ref', id: e.id });
    }
    if (e.cat === 'riser' && (!levelById(project, e.levelFrom) || !levelById(project, e.levelTo))) problems.push({ code: 'bad_riser_level', id: e.id });
  }
  return problems;
}

/** Remove broken references in place (used on load / after deletes). Returns number of fixes. */
export function repairReferences(project) {
  let fixes = 0;
  for (const e of Object.values(project.elements)) {
    if ((e.cat === 'window' || e.cat === 'door') && !project.elements[e.wallId]) {
      delete project.elements[e.id];
      fixes++;
    }
    if (e.cat === 'radiator' && e.roomId && !project.elements[e.roomId]) {
      e.roomId = null;
      fixes++;
    }
    if (e.cat === 'room' && e.ufh?.collectorId && !project.elements[e.ufh.collectorId]) {
      e.ufh.collectorId = null;
      fixes++;
    }
    if (e.cat === 'thermostat' && e.controls) {
      const before = e.controls.length;
      e.controls = e.controls.filter((c) => project.elements[c]);
      fixes += before - e.controls.length;
    }
  }
  return fixes;
}

/** Find the room that contains point p on a level. */
export function roomAt(project, levelId, p, pointInPolygon) {
  return elementsOf(project, 'room', levelId).find((r) => pointInPolygon(p, r.points)) ?? null;
}

export const offsetPoint = (p, dir, d) => add(p, mul(dir, d));
