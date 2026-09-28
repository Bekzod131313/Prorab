// Persistence & exchange: native .zph (JSON, versioned, migrations), CSV, Excel (SpreadsheetML),
// DXF (R12 ASCII), SVG, IFC4 (STEP, semantic entities + property sets), product CSV importer,
// DXF importer (walls / underlay lines).

import { SCHEMA_VERSION, defaultSettings, elementsOf, sortedLevels, openingPos, localToPlan, levelById, wallDir, newElement, collectorBodyX } from './model.js';
import { guid, round } from './util.js';

// ======================= native file =======================

function checksum(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function serializeProject(project, results = null) {
  const body = { ...project, schema: SCHEMA_VERSION, savedAt: new Date().toISOString() };
  if (results) body.results = results; // optional cached results (recomputed on load anyway)
  const json = JSON.stringify(body);
  return JSON.stringify({ format: 'ZPH', schema: SCHEMA_VERSION, checksum: checksum(json), project: body });
}

/** Migrations: each step upgrades from schema N to N+1. */
export const MIGRATIONS = {
  1: (p) => {
    // v1 → v2: settings.regime became an object, levels gained floorThickness
    if (typeof p.settings?.regime === 'string') {
      const [ts, tr] = p.settings.regime.split('/').map(Number);
      p.settings.regime = { ts, tr, name: `${ts}/${tr}/20` };
    }
    for (const l of p.levels ?? []) l.floorThickness ??= 0.3;
    return p;
  },
  2: (p) => {
    // v2 → v3: elements gained guid/custom, pipes gained autoSize, room.heating
    for (const e of Object.values(p.elements ?? {})) {
      e.guid ??= guid();
      e.custom ??= {};
      if (e.cat === 'pipe') e.autoSize ??= true;
      if (e.cat === 'room') e.heating ??= 'radiator';
    }
    p.issues ??= [];
    p.history ??= [];
    p.customParams ??= [];
    return p;
  },
};

export function parseProject(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('file_not_json');
  }
  let p = obj.format === 'ZPH' ? obj.project : obj;
  if (obj.format === 'ZPH' && obj.checksum) {
    const { ...body } = p;
    const json = JSON.stringify(body);
    if (checksum(json) !== obj.checksum) p._checksumWarning = true;
  }
  const from = p.schema ?? 1;
  if (from > SCHEMA_VERSION) {
    const err = new Error('file_newer');
    err.params = { file: from, app: SCHEMA_VERSION };
    throw err;
  }
  const migrated = [];
  for (let v = from; v < SCHEMA_VERSION; v++) {
    p = MIGRATIONS[v](p);
    migrated.push(`${v}→${v + 1}`);
  }
  p.schema = SCHEMA_VERSION;
  p.settings = { ...defaultSettings(), ...(p.settings ?? {}) };
  delete p.results;
  // duplicate GUID protection
  const seen = new Set();
  for (const e of Object.values(p.elements ?? {})) {
    if (seen.has(e.guid)) e.guid = guid();
    seen.add(e.guid);
  }
  return { project: p, migrated, backupRecommended: migrated.length > 0 };
}

// ======================= tables =======================

export function toCSV(rows, columns) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(';'));
  return '﻿' + [head, ...body].join('\r\n');
}

/** Excel-compatible SpreadsheetML 2003 workbook (opens in Excel/LibreOffice without extra libs). */
export function toExcelXml(sheets) {
  const x = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cell = (v) => (typeof v === 'number' && Number.isFinite(v) ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>` : `<Cell><Data ss:Type="String">${x(v)}</Data></Cell>`);
  const ws = sheets
    .map(
      (sh) => `<Worksheet ss:Name="${x(sh.name).slice(0, 31)}"><Table>` +
        `<Row>${sh.columns.map((c) => `<Cell ss:StyleID="h"><Data ss:Type="String">${x(c.label)}</Data></Cell>`).join('')}</Row>` +
        sh.rows.map((r) => `<Row>${sh.columns.map((c) => cell(typeof c.get === 'function' ? c.get(r) : r[c.key])).join('')}</Row>`).join('') +
        `</Table></Worksheet>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#DDE7F7" ss:Pattern="Solid"/></Style></Styles>${ws}</Workbook>`;
}

// ======================= DXF =======================

const DXF_LAYERS = {
  'A-WALL': 7,
  'A-WALL-INT': 8,
  'A-GLAZ': 4,
  'A-DOOR': 30,
  'A-AREA': 9,
  'M-HEAT-SUPPLY': 1,
  'M-HEAT-RETURN': 5,
  'M-HEAT-EQPT': 6,
  'M-HEAT-RISER': 3,
  'M-ANNO': 2,
  'M-UFH': 40,
};

export function exportDXF(project, results, levelId) {
  const out = [];
  const g = (code, val) => out.push(String(code), String(val));
  const Y = (y) => -y; // DXF is y-up
  g(0, 'SECTION');
  g(2, 'HEADER');
  g(9, '$INSUNITS');
  g(70, 6); // metres
  g(0, 'ENDSEC');
  g(0, 'SECTION');
  g(2, 'TABLES');
  g(0, 'TABLE');
  g(2, 'LAYER');
  g(70, Object.keys(DXF_LAYERS).length);
  for (const [name, color] of Object.entries(DXF_LAYERS)) {
    g(0, 'LAYER');
    g(2, name);
    g(70, 0);
    g(62, color);
    g(6, 'CONTINUOUS');
  }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION');
  g(2, 'ENTITIES');
  const line = (layer, a, b) => {
    g(0, 'LINE');
    g(8, layer);
    g(10, round(a.x, 4));
    g(20, round(Y(a.y), 4));
    g(30, 0);
    g(11, round(b.x, 4));
    g(21, round(Y(b.y), 4));
    g(31, 0);
  };
  const poly = (layer, pts, closed = false) => {
    g(0, 'POLYLINE');
    g(8, layer);
    g(66, 1);
    g(70, closed ? 1 : 0);
    for (const p of pts) {
      g(0, 'VERTEX');
      g(8, layer);
      g(10, round(p.x, 4));
      g(20, round(Y(p.y), 4));
      g(30, 0);
    }
    g(0, 'SEQEND');
  };
  const text = (layer, p, h, s) => {
    g(0, 'TEXT');
    g(8, layer);
    g(10, round(p.x, 4));
    g(20, round(Y(p.y), 4));
    g(30, 0);
    g(40, h);
    g(1, String(s).replace(/\n/g, ' '));
  };
  const lv = levelId ?? project.levels[0].id;
  for (const w of elementsOf(project, 'wall', lv)) {
    const d = wallDir(w);
    const n = { x: -d.y * (w.thickness / 2), y: d.x * (w.thickness / 2) };
    const layer = w.exterior ? 'A-WALL' : 'A-WALL-INT';
    poly(layer, [
      { x: w.a.x + n.x, y: w.a.y + n.y },
      { x: w.b.x + n.x, y: w.b.y + n.y },
      { x: w.b.x - n.x, y: w.b.y - n.y },
      { x: w.a.x - n.x, y: w.a.y - n.y },
    ], true);
  }
  for (const o of [...elementsOf(project, 'window', lv), ...elementsOf(project, 'door', lv)]) {
    const p = openingPos(project, o);
    if (!p) continue;
    const d = { x: Math.cos(p.angle), y: Math.sin(p.angle) };
    line(o.cat === 'window' ? 'A-GLAZ' : 'A-DOOR', { x: p.x - (d.x * o.width) / 2, y: p.y - (d.y * o.width) / 2 }, { x: p.x + (d.x * o.width) / 2, y: p.y + (d.y * o.width) / 2 });
  }
  for (const r of elementsOf(project, 'room', lv)) {
    poly('A-AREA', r.points, true);
    const c = r.points.reduce((a, p) => ({ x: a.x + p.x / r.points.length, y: a.y + p.y / r.points.length }), { x: 0, y: 0 });
    const hl = results?.rooms?.[r.id];
    text('M-ANNO', c, 0.18, `${r.number ?? ''} ${r.name}`);
    if (hl) text('M-ANNO', { x: c.x, y: c.y + 0.3 }, 0.14, `${hl.inputs.area.toFixed(1)} m2  Q=${Math.round(hl.required)} W`);
  }
  for (const p of elementsOf(project, 'pipe', lv)) {
    poly(p.system === 'return' ? 'M-HEAT-RETURN' : 'M-HEAT-SUPPLY', p.points);
    const pr = results?.pipes?.[p.id];
    if (pr && p.points.length > 1) {
      const m = { x: (p.points[0].x + p.points[1].x) / 2, y: (p.points[0].y + p.points[1].y) / 2 };
      text('M-ANNO', m, 0.1, `${pr.material} d${pr.dn}`);
    }
  }
  for (const e of Object.values(project.elements)) {
    if (e.levelId !== lv) continue;
    if (!['radiator', 'boiler', 'collector', 'pump'].includes(e.cat)) continue;
    let X0;
    let X1;
    let Y0;
    let Y1;
    if (e.cat === 'collector') {
      ({ x0: X0, x1: X1 } = collectorBodyX(Math.max(e.outlets ?? 4, results?.ufhPorts?.[e.id] ?? 0)));
      Y0 = -0.03;
      Y1 = 0.23;
    } else {
      const L = e.cat === 'radiator' ? e.length ?? 1 : 0.45;
      const D = e.cat === 'radiator' ? 0.1 : 0.3;
      X0 = -L / 2;
      X1 = L / 2;
      Y0 = -D / 2;
      Y1 = D / 2;
    }
    const pts = [localToPlan(e, X0, Y0), localToPlan(e, X1, Y0), localToPlan(e, X1, Y1), localToPlan(e, X0, Y1)];
    poly('M-HEAT-EQPT', pts, true);
    const out = results?.radiators?.[e.id];
    text('M-ANNO', localToPlan(e, 0, -0.3), 0.12, `${e.mark ?? ''}${out ? ` ${Math.round(out.output)}W` : ''}`);
  }
  for (const r of elementsOf(project, 'room', lv)) {
    for (const l of results?.ufh?.[r.id]?.layout ?? []) {
      poly('M-UFH', l.coil);
      if (l.supplyLead?.length) poly('M-HEAT-SUPPLY', l.supplyLead);
      if (l.returnLead?.length) poly('M-HEAT-RETURN', l.returnLead);
    }
  }
  for (const r of elementsOf(project, 'riser')) {
    if (r.levelFrom !== lv && r.levelTo !== lv) continue;
    g(0, 'CIRCLE');
    g(8, 'M-HEAT-RISER');
    g(10, r.x);
    g(20, Y(r.y));
    g(30, 0);
    g(40, 0.06);
  }
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return out.join('\r\n');
}

/** Minimal DXF reader: LINE and LWPOLYLINE/POLYLINE entities → segments (y flipped to plan coords). */
export function parseDXF(text, unitScale = 1) {
  const lines = text.split(/\r?\n/).map((s) => s.trim());
  const segs = [];
  let i = 0;
  let inEntities = false;
  while (i < lines.length - 1) {
    const code = lines[i];
    const val = lines[i + 1];
    if (code === '2' && val === 'ENTITIES') inEntities = true;
    if (code === '0' && val === 'ENDSEC') inEntities = false;
    if (inEntities && code === '0' && val === 'POLYLINE') {
      // R12 heavy polyline: POLYLINE (layer, flags) followed by VERTEX…SEQEND
      let layer = '0';
      let closed = false;
      const pts = [];
      i += 2;
      while (i < lines.length - 1 && !(lines[i] === '0' && lines[i + 1] === 'SEQEND')) {
        if (lines[i] === '0' && lines[i + 1] === 'VERTEX') {
          let x = 0;
          let y = 0;
          i += 2;
          while (i < lines.length - 1 && lines[i] !== '0') {
            if (lines[i] === '10') x = Number(lines[i + 1]);
            if (lines[i] === '20') y = Number(lines[i + 1]);
            i += 2;
          }
          pts.push({ x: x * unitScale, y: -y * unitScale });
          continue;
        }
        if (lines[i] === '8' && !pts.length) layer = lines[i + 1];
        if (lines[i] === '70' && !pts.length) closed = (Number(lines[i + 1]) & 1) === 1;
        i += 2;
      }
      for (let k = 1; k < pts.length; k++) segs.push({ layer, a: pts[k - 1], b: pts[k] });
      if (closed && pts.length > 2) segs.push({ layer, a: pts[pts.length - 1], b: pts[0] });
      i += 2;
      continue;
    }
    if (inEntities && code === '0' && (val === 'LINE' || val === 'LWPOLYLINE')) {
      const type = val;
      const data = [];
      let layer = '0';
      let closed = false;
      i += 2;
      while (i < lines.length - 1 && lines[i] !== '0') {
        const c = lines[i];
        const v = lines[i + 1];
        if (c === '8') layer = v;
        if (c === '70') closed = (Number(v) & 1) === 1;
        data.push([c, Number(v)]);
        i += 2;
      }
      if (type === 'LINE') {
        const get = (c) => data.find((d) => d[0] === c)?.[1] ?? 0;
        segs.push({ layer, a: { x: get('10') * unitScale, y: -get('20') * unitScale }, b: { x: get('11') * unitScale, y: -get('21') * unitScale } });
      } else {
        const pts = [];
        for (let k = 0; k < data.length; k++) {
          if (data[k][0] === '10') pts.push({ x: data[k][1] * unitScale, y: -(data.find((d, j) => j > k && d[0] === '20')?.[1] ?? 0) * unitScale });
        }
        for (let k = 1; k < pts.length; k++) segs.push({ layer, a: pts[k - 1], b: pts[k] });
        if (closed && pts.length > 2) segs.push({ layer, a: pts[pts.length - 1], b: pts[0] });
      }
      continue;
    }
    i += 2;
  }
  return segs;
}

export function dxfSegmentsToWalls(segs, levelId, { exterior = true, thickness = 0.4, assembly = 'ext_brick_380_eps100', layerFilter = null } = {}) {
  return segs
    .filter((s) => !layerFilter || s.layer === layerFilter)
    .filter((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > 0.05)
    .map((s) => newElement('wall', { levelId, a: s.a, b: s.b, exterior, thickness, assembly }));
}

// ======================= SVG =======================

export function exportSVG(project, results, levelId, colors) {
  const lv = levelId ?? project.levels[0].id;
  const pts = [];
  for (const e of Object.values(project.elements)) {
    if (e.levelId !== lv) continue;
    if (e.a) pts.push(e.a, e.b);
    if (e.points) pts.push(...e.points);
    if (e.x !== undefined) pts.push({ x: e.x, y: e.y });
  }
  if (!pts.length) pts.push({ x: 0, y: 0 }, { x: 10, y: 10 });
  const minX = Math.min(...pts.map((p) => p.x)) - 1;
  const minY = Math.min(...pts.map((p) => p.y)) - 1;
  const maxX = Math.max(...pts.map((p) => p.x)) + 1;
  const maxY = Math.max(...pts.map((p) => p.y)) + 1;
  const S = 50; // px per metre
  const tx = (x) => ((x - minX) * S).toFixed(1);
  const ty = (y) => ((y - minY) * S).toFixed(1);
  const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const parts = [];
  for (const r of elementsOf(project, 'room', lv)) {
    parts.push(`<polygon points="${r.points.map((p) => `${tx(p.x)},${ty(p.y)}`).join(' ')}" fill="#f4f1ea" stroke="none"/>`);
  }
  for (const w of elementsOf(project, 'wall', lv)) {
    parts.push(`<line x1="${tx(w.a.x)}" y1="${ty(w.a.y)}" x2="${tx(w.b.x)}" y2="${ty(w.b.y)}" stroke="#333" stroke-width="${(w.thickness * S).toFixed(1)}" stroke-linecap="square"/>`);
  }
  for (const r of elementsOf(project, 'room', lv)) {
    for (const l of results?.ufh?.[r.id]?.layout ?? []) {
      parts.push(`<polyline points="${l.coil.map((q) => `${tx(q.x)},${ty(q.y)}`).join(' ')}" fill="none" stroke="#e08a1f" stroke-width="1"/>`);
      for (const [lead, c] of [[l.supplyLead, colors?.supply ?? '#e0312b'], [l.returnLead, colors?.return ?? '#1f5fd6']]) if (lead?.length) parts.push(`<polyline points="${lead.map((q) => `${tx(q.x)},${ty(q.y)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="1"/>`);
    }
  }
  for (const p of elementsOf(project, 'pipe', lv)) {
    parts.push(`<polyline points="${p.points.map((q) => `${tx(q.x)},${ty(q.y)}`).join(' ')}" fill="none" stroke="${p.system === 'return' ? colors?.return ?? '#1f5fd6' : colors?.supply ?? '#e0312b'}" stroke-width="2"/>`);
  }
  for (const r of elementsOf(project, 'room', lv)) {
    const c = r.points.reduce((a, p) => ({ x: a.x + p.x / r.points.length, y: a.y + p.y / r.points.length }), { x: 0, y: 0 });
    const hl = results?.rooms?.[r.id];
    parts.push(`<text x="${tx(c.x)}" y="${ty(c.y)}" font-family="sans-serif" font-size="12" text-anchor="middle">${x(r.name)}</text>`);
    if (hl) parts.push(`<text x="${tx(c.x)}" y="${(+ty(c.y) + 14).toFixed(1)}" font-family="sans-serif" font-size="10" text-anchor="middle" fill="#555">${hl.inputs.area.toFixed(1)} m² · ${Math.round(hl.required)} W</text>`);
  }
  for (const e of elementsOf(project, 'radiator', lv)) {
    const L = e.length ?? 1;
    const a = localToPlan(e, -L / 2, 0);
    const b = localToPlan(e, L / 2, 0);
    parts.push(`<line x1="${tx(a.x)}" y1="${ty(a.y)}" x2="${tx(b.x)}" y2="${ty(b.y)}" stroke="#444" stroke-width="6"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${((maxX - minX) * S).toFixed(0)}" height="${((maxY - minY) * S).toFixed(0)}" viewBox="0 0 ${((maxX - minX) * S).toFixed(0)} ${((maxY - minY) * S).toFixed(0)}"><rect width="100%" height="100%" fill="#fff"/>${parts.join('')}</svg>`;
}

// ======================= IFC4 (STEP) =======================
// Semantic export: project/site/building/storeys, spaces, walls, space heaters, pipe segments,
// equipment, each with local placement and a ZODPRO property set. Body geometry (swept solids)
// for walls/pipes is written as extruded rectangles / polylines where simple.

export function exportIFC(project, results) {
  const lines = [];
  let n = 0;
  const id = () => `#${++n}`;
  const w = (s) => {
    const i = id();
    lines.push(`${i}=${s};`);
    return i;
  };
  const str = (s) => `'${String(s ?? '').replace(/'/g, "''").replace(/[^\x20-\x7E]/g, (c) => `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}\\X0\\`)}'`;
  const ifcGuid = () => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
    let s = '';
    for (let i = 0; i < 22; i++) s += chars[Math.floor(Math.random() * 64)];
    return `'${s}'`;
  };
  const owner = w(`IFCOWNERHISTORY(${w(`IFCPERSONANDORGANIZATION(${w(`IFCPERSON($,${str(project.meta.designer || 'Designer')},$,$,$,$,$,$)`)},${w(`IFCORGANIZATION($,${str(project.meta.company || 'ZODPRO')},$,$,$)`)},$)`)},${w(`IFCAPPLICATION(${w(`IFCORGANIZATION($,'ZODPRO',$,$,$)`)},'0.1.0','ZODPRO Heating BIM','ZPH')`)},$,.ADDED.,$,$,$,${Math.floor(Date.now() / 1000)})`);
  const origin = w('IFCCARTESIANPOINT((0.,0.,0.))');
  const zAxis = w('IFCDIRECTION((0.,0.,1.))');
  const xAxis = w('IFCDIRECTION((1.,0.,0.))');
  const place3d = w(`IFCAXIS2PLACEMENT3D(${origin},${zAxis},${xAxis})`);
  const ctx = w(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${place3d},$)`);
  const units = w(`IFCUNITASSIGNMENT((${w('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)')},${w('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)')},${w('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)')},${w('IFCSIUNIT(*,.POWERUNIT.,$,.WATT.)')}))`);
  const proj = w(`IFCPROJECT(${ifcGuid()},${owner},${str(project.meta.name)},${str(project.meta.number)},$,$,$,(${ctx}),${units})`);
  const lp = (rel, x = 0, y = 0, z = 0) => w(`IFCLOCALPLACEMENT(${rel ?? '$'},${w(`IFCAXIS2PLACEMENT3D(${w(`IFCCARTESIANPOINT((${(+x).toFixed(4)},${(-y).toFixed(4)},${(+z).toFixed(4)}))`)},$,$)`)})`);
  const sitePl = lp(null);
  const site = w(`IFCSITE(${ifcGuid()},${owner},'Site',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldPl = lp(sitePl);
  const bld = w(`IFCBUILDING(${ifcGuid()},${owner},'Building',$,$,${bldPl},$,$,.ELEMENT.,$,$,${w(`IFCPOSTALADDRESS($,$,$,$,(${str(project.meta.address)}),$,$,$,$,$)`)})`);
  w(`IFCRELAGGREGATES(${ifcGuid()},${owner},$,$,${proj},(${site}))`);
  w(`IFCRELAGGREGATES(${ifcGuid()},${owner},$,$,${site},(${bld}))`);
  const storeys = [];
  const pset = (target, name, props) => {
    const ps = Object.entries(props)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => w(`IFCPROPERTYSINGLEVALUE(${str(k)},$,${typeof v === 'number' ? `IFCREAL(${(+v).toFixed(4)})` : `IFCLABEL(${str(v)})`},$)`));
    if (!ps.length) return;
    const set = w(`IFCPROPERTYSET(${ifcGuid()},${owner},${str(name)},$,(${ps.join(',')}))`);
    w(`IFCRELDEFINESBYPROPERTIES(${ifcGuid()},${owner},$,$,(${target}),${set})`);
  };
  for (const l of sortedLevels(project)) {
    const pl = lp(bldPl, 0, 0, l.elevation);
    const st = w(`IFCBUILDINGSTOREY(${ifcGuid()},${owner},${str(l.name)},$,$,${pl},$,$,.ELEMENT.,${(+l.elevation).toFixed(4)})`);
    storeys.push(st);
    const contained = [];
    const spaces = [];
    for (const e of Object.values(project.elements)) {
      if (e.levelId !== l.id) continue;
      if (e.cat === 'room') {
        const c = e.points.reduce((a, p) => ({ x: a.x + p.x / e.points.length, y: a.y + p.y / e.points.length }), { x: 0, y: 0 });
        const sp = w(`IFCSPACE(${ifcGuid()},${owner},${str(e.number ?? '')},${str(e.name)},$,${lp(pl, c.x, c.y, 0)},$,${str(e.name)},.ELEMENT.,.INTERNAL.,$)`);
        spaces.push(sp);
        const hl = results?.rooms?.[e.id];
        pset(sp, 'ZODPRO_HeatLoss', { Area: hl?.inputs.area, Volume: hl?.inputs.volume, DesignTemperature: hl?.inputs.tIn, Transmission: hl?.transmission, Ventilation: hl?.airApplied, RequiredHeating: hl?.required, ZODPRO_GUID: e.guid });
      } else if (e.cat === 'wall') {
        const d = wallDir(e);
        const len = d.L;
        const ax = w(`IFCAXIS2PLACEMENT3D(${w(`IFCCARTESIANPOINT((${e.a.x.toFixed(4)},${(-e.a.y).toFixed(4)},0.))`)},${zAxis},${w(`IFCDIRECTION((${d.x.toFixed(6)},${(-d.y).toFixed(6)},0.))`)})`);
        const wpl = w(`IFCLOCALPLACEMENT(${pl},${ax})`);
        const prof = w(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${w(`IFCAXIS2PLACEMENT2D(${w(`IFCCARTESIANPOINT((${(len / 2).toFixed(4)},0.))`)},$)`)},${len.toFixed(4)},${(+e.thickness).toFixed(4)})`);
        const solid = w(`IFCEXTRUDEDAREASOLID(${prof},${place3d},${zAxis},${(+(levelById(project, l.id)?.height ?? 3)).toFixed(4)})`);
        const shape = w(`IFCPRODUCTDEFINITIONSHAPE($,$,(${w(`IFCSHAPEREPRESENTATION(${ctx},'Body','SweptSolid',(${solid}))`)}))`);
        const wall = w(`IFCWALL(${ifcGuid()},${owner},${str(e.mark || 'Wall')},$,$,${wpl},${shape},$,.STANDARD.)`);
        contained.push(wall);
        pset(wall, 'Pset_WallCommon', { IsExternal: e.exterior ? 'TRUE' : 'FALSE', Reference: e.assembly, ZODPRO_GUID: e.guid });
      } else if (e.cat === 'radiator') {
        const rr = results?.radiators?.[e.id];
        const ent = w(`IFCSPACEHEATER(${ifcGuid()},${owner},${str(e.mark)},${str(rr?.product?.model ?? '')},$,${lp(pl, e.x, e.y, e.mountHeight ?? 0.1)},$,$,.RADIATOR.)`);
        contained.push(ent);
        pset(ent, 'ZODPRO_Radiator', { Mark: e.mark, Model: rr?.product?.model, Article: rr?.product?.article, OutputW: rr?.output, Nominal75W: rr?.nominal75, ZODPRO_GUID: e.guid });
      } else if (e.cat === 'pipe') {
        const pr = results?.pipes?.[e.id];
        const z = e.elevation ?? 0.05;
        const pts = e.points.map((p) => w(`IFCCARTESIANPOINT((${p.x.toFixed(4)},${(-p.y).toFixed(4)},${z.toFixed(4)}))`));
        const pl2 = w(`IFCPOLYLINE((${pts.join(',')}))`);
        const shape = w(`IFCPRODUCTDEFINITIONSHAPE($,$,(${w(`IFCSHAPEREPRESENTATION(${ctx},'Axis','Curve3D',(${pl2}))`)}))`);
        const ent = w(`IFCPIPESEGMENT(${ifcGuid()},${owner},${str(e.mark)},$,$,${lp(pl)},${shape},$,.RIGIDSEGMENT.)`);
        contained.push(ent);
        pset(ent, 'ZODPRO_Pipe', { System: e.system, Material: pr?.material, DN: pr?.dn, Length: pr?.length, FlowLh: pr?.flowLh, Velocity: pr?.v, PressureLossPa: pr?.dp, ZODPRO_GUID: e.guid });
      } else if (e.cat === 'boiler') {
        const ent = w(`IFCBOILER(${ifcGuid()},${owner},${str(e.mark)},${str(results?.boiler?.product?.model ?? '')},$,${lp(pl, e.x, e.y, 1.2)},$,$,.WATER.)`);
        contained.push(ent);
        pset(ent, 'ZODPRO_Boiler', { PowerKW: results?.boiler?.product?.powerKw, RequiredKW: results?.boiler?.requiredKw, ZODPRO_GUID: e.guid });
      } else if (e.cat === 'pump') {
        const ent = w(`IFCPUMP(${ifcGuid()},${owner},${str(e.mark)},${str(results?.pump?.product?.model ?? '')},$,${lp(pl, e.x, e.y, 0.3)},$,$,.CIRCULATOR.)`);
        contained.push(ent);
      } else if (e.cat === 'collector') {
        const ent = w(`IFCPIPEFITTING(${ifcGuid()},${owner},${str(e.mark)},${str(`Collector ${e.outlets ?? ''}`)},$,${lp(pl, e.x, e.y, 0.4)},$,$,.JUNCTION.)`);
        contained.push(ent);
        pset(ent, 'ZODPRO_Collector', { Outlets: e.outlets, Kind: e.kind, ZODPRO_GUID: e.guid });
      }
    }
    if (spaces.length) w(`IFCRELAGGREGATES(${ifcGuid()},${owner},$,$,${st},(${spaces.join(',')}))`);
    if (contained.length) w(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${ifcGuid()},${owner},$,$,(${contained.join(',')}),${st})`);
  }
  if (storeys.length) w(`IFCRELAGGREGATES(${ifcGuid()},${owner},$,$,${bld},(${storeys.join(',')}))`);
  const header = `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');\nFILE_NAME(${str(project.meta.name + '.ifc')},'${new Date().toISOString().slice(0, 19)}',(${str(project.meta.designer)}),(${str(project.meta.company)}),'ZODPRO Heating BIM','ZODPRO Heating BIM 0.1.0','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n`;
  return header + lines.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n';
}

// ======================= product importer =======================

/** Parse a product CSV (radiators). Columns: article;brand;model;type;height_mm;length_mm;q75_w;n;price;currency */
export function importRadiatorCSV(text, rates, existing = []) {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!rows.length) return { products: [], errors: [{ row: 0, code: 'empty' }], duplicates: [] };
  const sep = rows[0].includes(';') ? ';' : ',';
  const head = rows[0].split(sep).map((h) => h.trim().toLowerCase());
  const need = ['article', 'model', 'height_mm', 'length_mm', 'q75_w'];
  const missing = need.filter((n) => !head.includes(n));
  if (missing.length) return { products: [], errors: [{ row: 1, code: 'missing_columns', params: { cols: missing.join(', ') } }], duplicates: [] };
  const products = [];
  const errors = [];
  const duplicates = [];
  const seen = new Set(existing.map((e) => e.article));
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i].split(sep).map((c) => c.trim());
    const r = Object.fromEntries(head.map((h, k) => [h, cols[k]]));
    const num = (k) => Number(String(r[k] ?? '').replace(',', '.'));
    const h = num('height_mm');
    const L = num('length_mm');
    const q = num('q75_w');
    if (!r.article || !(h > 0) || !(L > 0) || !(q > 0)) {
      errors.push({ row: i + 1, code: 'invalid_row', params: { article: r.article ?? '' } });
      continue;
    }
    if (seen.has(r.article)) {
      duplicates.push({ row: i + 1, article: r.article });
      continue;
    }
    seen.add(r.article);
    const cur = (r.currency || 'USD').toUpperCase();
    const price = num('price') || 0;
    const usd = rates?.[cur] ? price / rates[cur] : price;
    products.push({
      id: `IMP-${r.article}`,
      family: 'radiator',
      kind: 'panel',
      brand: r.brand || 'Import',
      model: r.model,
      article: r.article,
      type: r.type || 'custom',
      height: h / 1000,
      length: L / 1000,
      depth: num('depth_mm') / 1000 || 0.1,
      q75: q,
      n: num('n') || 1.3,
      waterL: num('water_l') || 0,
      weightKg: num('weight_kg') || 0,
      priceUsd: +usd.toFixed(2),
      zeta: 2.5,
      imported: true,
    });
  }
  return { products, errors, duplicates };
}

export function download(filename, content, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}
