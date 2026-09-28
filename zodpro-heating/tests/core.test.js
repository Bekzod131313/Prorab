// Core layer tests: file format / migrations, transactions (undo/redo), data integrity,
// geometry operations, auto-design, exports/imports, assistant intents, permissions.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDemoProject } from '../src/core/demo.js';
import { createEmptyProject, newElement, elementsOf, integrityCheck, connectorsOf, SCHEMA_VERSION } from '../src/core/model.js';
import { serializeProject, parseProject, exportDXF, parseDXF, exportIFC, exportSVG, toCSV, toExcelXml, importRadiatorCSV, dxfSegmentsToWalls } from '../src/core/io.js';
import { Store } from '../src/core/store.js';
import { detectRoom, splitAt, extendToBoundary, offsetElement, filletWalls, transformElement, rotateFn, mirrorFn, teeSplits } from '../src/ui/geometry-ops.js';
import { autoPlaceRadiators, autoRoute, syncRadiatorGeometry, applyChangeSet } from '../src/core/autodesign.js';
import { runCalculation } from '../src/engines/calc.js';
import { interpret } from '../src/core/assistant.js';
import { can, procurement, LocalWarehouse, PluginHost } from '../src/core/integrations.js';
import { outerWalls } from '../src/core/demo.js';

test('native .zph round-trip preserves every element and GUID', () => {
  const p = createDemoProject();
  const text = serializeProject(p);
  const { project, migrated } = parseProject(text);
  assert.deepEqual(migrated, []);
  assert.equal(Object.keys(project.elements).length, Object.keys(p.elements).length);
  for (const [id, e] of Object.entries(p.elements)) assert.equal(project.elements[id].guid, e.guid);
  assert.equal(project.schema, SCHEMA_VERSION);
  assert.ok(!project._checksumWarning);
});

test('migration from schema 1 file', () => {
  const v1 = { schema: 1, meta: { name: 'old' }, settings: { regime: '70/55' }, levels: [{ id: 'l', name: 'L', elevation: 0, height: 3 }], elements: { a: { id: 'a', cat: 'pipe', levelId: 'l', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] } }, revisions: [] };
  const { project, migrated } = parseProject(JSON.stringify(v1));
  assert.deepEqual(migrated, ['1→2', '2→3']);
  assert.deepEqual(project.settings.regime, { ts: 70, tr: 55, name: '70/55/20' });
  assert.ok(project.elements.a.guid);
  assert.equal(project.elements.a.autoSize, true);
  assert.equal(project.levels[0].floorThickness, 0.3);
});

test('newer file version is rejected, corrupted file detected', () => {
  assert.throws(() => parseProject(JSON.stringify({ schema: 999, elements: {} })), /file_newer/);
  assert.throws(() => parseProject('{not json'), /file_not_json/);
  const p = createEmptyProject();
  const wrapped = JSON.parse(serializeProject(p));
  wrapped.project.meta.name = 'tampered';
  const { project } = parseProject(JSON.stringify(wrapped));
  assert.equal(project._checksumWarning, true);
});

test('duplicate GUIDs are repaired on load', () => {
  const p = createEmptyProject();
  const a = newElement('text', { levelId: 'lvl_0', x: 0, y: 0, text: 'a' });
  const b = newElement('text', { levelId: 'lvl_0', x: 1, y: 0, text: 'b', guid: a.guid });
  b.guid = a.guid;
  p.elements[a.id] = a;
  p.elements[b.id] = b;
  assert.ok(integrityCheck(p).some((x) => x.code === 'dup_guid'));
  const { project } = parseProject(serializeProject(p));
  assert.notEqual(project.elements[a.id].guid, project.elements[b.id].guid);
});

test('transactions: undo / redo / cascade delete of hosted openings', () => {
  const s = new Store(createEmptyProject());
  const w = newElement('wall', { levelId: 'lvl_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, exterior: true, thickness: 0.4, assembly: 'ext_brick_510' });
  s.apply({ add: [w] }, 'wall');
  const win = newElement('window', { levelId: 'lvl_0', wallId: w.id, offset: 2, width: 1, height: 1, sill: 0.9, type: 'win_pvc_2' });
  s.apply({ add: [win] }, 'window');
  s.apply({ remove: [w.id] }, 'delete');
  assert.equal(s.project.elements[win.id], undefined, 'opening removed with host');
  s.undo();
  assert.ok(s.project.elements[w.id] && s.project.elements[win.id], 'undo restores wall and opening');
  s.redo();
  assert.equal(s.project.elements[w.id], undefined);
  s.undo();
  s.apply({ update: [{ id: w.id, patch: { thickness: 0.5 } }] }, 'edit');
  assert.equal(s.redoStack.length, 0, 'new edit clears redo');
  s.undo();
  assert.equal(s.project.elements[w.id].thickness, 0.4);
  s.apply({ settings: { climate: { tOut: -20 } } }, 'settings');
  assert.equal(s.project.settings.climate.tOut, -20);
  assert.equal(s.project.settings.climate.city, 'Toshkent', 'deep merge keeps siblings');
  s.undo();
  assert.equal(s.project.settings.climate.tOut, -15);
});

test('automatic room detection and geometry operations', () => {
  const p = createEmptyProject();
  for (const w of outerWalls('lvl_0', 0, 0, 6, 4)) p.elements[w.id] = w;
  const pts = detectRoom(p, 'lvl_0', { x: 3, y: 2 });
  assert.deepEqual(pts.map((q) => [q.x, q.y]), [[0, 0], [6, 0], [6, 4], [0, 4]]);
  assert.equal(detectRoom(p, 'lvl_0', { x: 10, y: 10 }), null);

  const wall = elementsOf(p, 'wall')[0];
  const sp = splitAt(p, wall, { x: 2, y: 0 });
  assert.equal(sp.add.length, 1);
  assert.deepEqual(sp.update[0].patch.b, { x: 2, y: 0 });

  const line = newElement('pipe', { levelId: 'lvl_0', points: [{ x: 1, y: 1 }, { x: 3, y: 1 }] });
  p.elements[line.id] = line;
  const ext = extendToBoundary(p, line, { x: 3, y: 1 }, 'lvl_0');
  assert.deepEqual(ext.points[1], { x: 6, y: 1 });

  const off = offsetElement(wall, 0.5, { x: 3, y: 1 });
  assert.equal(off.a.y, 0.5);
  const rot = transformElement({ cat: 'text', x: 1, y: 0 }, rotateFn({ x: 0, y: 0 }, 90));
  assert.ok(Math.abs(rot.x) < 1e-9 && Math.abs(rot.y - 1) < 1e-9);
  const mir = transformElement({ cat: 'text', x: 1, y: 2 }, mirrorFn({ x: 0, y: 0 }, { x: 0, y: 1 }));
  assert.equal(mir.x, -1);
  const w2 = { id: 'w2', a: { x: 0, y: 1 }, b: { x: 0, y: 3 } };
  const w1 = { id: 'w1', a: { x: 1, y: 0 }, b: { x: 3, y: 0 } };
  const f = filletWalls(w1, w2);
  assert.deepEqual(f[0].patch.a, { x: 0, y: 0 });
  assert.deepEqual(f[1].patch.a, { x: 0, y: 0 });
});

test('tee split when a pipe ends on another pipe', () => {
  const p = createEmptyProject();
  const main = newElement('pipe', { levelId: 'lvl_0', system: 'supply', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }] });
  p.elements[main.id] = main;
  const cs = teeSplits(p, 'lvl_0', 'supply', [{ x: 2, y: 0 }, { x: 2, y: 2 }]);
  assert.equal(cs.add.length, 1);
  assert.deepEqual(cs.update[0].patch.points[1], { x: 2, y: 0 });
});

test('parametric follow-up: radiator length change drags attached pipes', () => {
  const p = createDemoProject();
  const res = runCalculation(p);
  const rad = elementsOf(p, 'radiator')[0];
  const before = connectorsOf(p, rad, null).map((c) => c.pos);
  // pretend the stored length is stale → sync must move attached pipe endpoints
  rad.length = 0.5;
  const staleConn = connectorsOf(p, rad, null).map((c) => c.pos);
  for (const pipe of elementsOf(p, 'pipe', rad.levelId)) {
    for (const idx of [0, pipe.points.length - 1]) {
      for (let k = 0; k < 2; k++) {
        if (Math.hypot(pipe.points[idx].x - before[k].x, pipe.points[idx].y - before[k].y) < 1e-6) pipe.points[idx] = { ...staleConn[k] };
      }
    }
  }
  applyChangeSet(p, syncRadiatorGeometry(p, res));
  const r2 = runCalculation(p);
  assert.ok(r2.circuits.every((c) => c.connected), 'still connected after sync');
});

test('auto-design on an empty house connects everything', () => {
  const p = createEmptyProject();
  for (const w of outerWalls('lvl_0', 0, 0, 8, 6)) p.elements[w.id] = w;
  const wall = elementsOf(p, 'wall')[0];
  p.elements.win = newElement('window', { id: 'win', levelId: 'lvl_0', wallId: wall.id, offset: 4, width: 1.5, height: 1.5, sill: 0.9, type: 'win_pvc_2' });
  const room = newElement('room', { levelId: 'lvl_0', name: 'R', number: '101', roomType: 'living', heating: 'radiator', points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }] });
  p.elements[room.id] = room;
  p.elements.b = newElement('boiler', { id: 'b', levelId: 'lvl_0', x: 7.5, y: 5.5, angle: 0 });
  p.elements.c = newElement('collector', { id: 'c', levelId: 'lvl_0', x: 3, y: 5, angle: 0, outlets: 2, kind: 'radiator' });
  applyChangeSet(p, autoPlaceRadiators(p));
  let res = runCalculation(p);
  applyChangeSet(p, syncRadiatorGeometry(p, res));
  const cs = autoRoute(p, null);
  assert.equal(cs.add.filter((e) => e.cat === 'pipe').length, 4);
  applyChangeSet(p, cs);
  res = runCalculation(p);
  assert.ok(res.circuits.length === 1 && res.circuits[0].connected);
  assert.equal(res.validation.counts.critical, 0);
});

test('exports: DXF (re-importable), IFC4 header/entities, SVG, CSV, Excel', () => {
  const p = createDemoProject();
  const res = runCalculation(p);
  const dxf = exportDXF(p, res, 'lvl_0');
  assert.ok(dxf.includes('M-HEAT-SUPPLY') && dxf.trim().endsWith('EOF'));
  const segs = parseDXF(dxf, 1);
  assert.ok(segs.length > 0);
  const walls = dxfSegmentsToWalls(segs, 'lvl_0', { layerFilter: 'A-WALL' });
  // each exported wall is a closed 4-vertex POLYLINE outline → 4 segments per wall
  assert.equal(walls.length, elementsOf(p, 'wall', 'lvl_0').filter((w) => w.exterior).length * 4);
  const ifc = exportIFC(p, res);
  assert.ok(ifc.startsWith('ISO-10303-21;'));
  for (const ent of ['IFCPROJECT', 'IFCBUILDINGSTOREY', 'IFCSPACE', 'IFCWALL', 'IFCSPACEHEATER', 'IFCPIPESEGMENT', 'IFCBOILER']) assert.ok(ifc.includes(ent), ent);
  assert.ok(ifc.trim().endsWith('END-ISO-10303-21;'));
  const svg = exportSVG(p, res, 'lvl_0');
  assert.ok(svg.startsWith('<svg'));
  const csv = toCSV([{ a: 1, b: 'x;y' }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]);
  assert.ok(csv.includes('"x;y"'));
  const xls = toExcelXml([{ name: 'S', rows: [{ a: 1 }], columns: [{ key: 'a', label: 'A' }] }]);
  assert.ok(xls.includes('ss:Type="Number">1<'));
});

test('DXF import of LINE entities becomes walls', () => {
  const dxf = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', 'WALLS', '10', '0', '20', '0', '11', '5000', '21', '0', '0', 'ENDSEC', '0', 'EOF'].join('\n');
  const segs = parseDXF(dxf, 0.001);
  assert.equal(segs.length, 1);
  assert.deepEqual(segs[0].b, { x: 5, y: -0 });
  const walls = dxfSegmentsToWalls(segs, 'lvl_0', { layerFilter: 'WALLS' });
  assert.equal(walls.length, 1);
});

test('product CSV import: validation and duplicate detection', () => {
  const csv = 'article;brand;model;height_mm;length_mm;q75_w;price;currency\nA1;X;M1;500;1000;1400;128000;UZS\nA1;X;dup;500;1000;1400;1;USD\nBAD;X;M;0;1000;1400;1;USD\nZP-PR22500400;X;existing;500;400;560;1;USD';
  const r = importRadiatorCSV(csv, { USD: 1, UZS: 12800 }, [{ article: 'ZP-PR22500400' }]);
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].priceUsd, 10);
  assert.equal(r.duplicates.length, 2);
  assert.equal(r.errors.length, 1);
  const bad = importRadiatorCSV('foo;bar\n1;2', {}, []);
  assert.equal(bad.errors[0].code, 'missing_columns');
});

test('assistant quotes model data and asks for missing parameters', () => {
  const p = createDemoProject();
  const s = new Store(p);
  const app = { store: s };
  const r1 = interpret('2-qavatdagi barcha DN20 quvurlarni tekshir', app);
  assert.ok(r1.reply.includes('DN20') && r1.select.length > 0);
  const r2 = interpret('Kollektorlarni ko‘rsat', app);
  assert.equal(r2.select.length, elementsOf(p, 'collector').length);
  const r3 = interpret('Bu tizimga nasos tanla', app);
  assert.ok(r3.reply.includes('m³/h'));
  const empty = new Store(createEmptyProject());
  const r4 = interpret('nasos tanla', { store: empty });
  assert.ok(r4.reply.includes('Yetishmayapti'));
  const r5 = interpret('Barcha yotoqxonalarga radiator qo‘y', app);
  assert.ok(r5.reply.includes('allaqachon') || r5.changes);
});

test('roles, procurement shortage and plugin permissions', async () => {
  assert.equal(can('client', 'model.edit'), false);
  assert.equal(can('engineer', 'model.edit'), true);
  assert.equal(can('manager', 'anything'), true);
  const p = createDemoProject();
  const res = runCalculation(p);
  const row = res.bom.rows.find((r) => r.group === 'pipes');
  p.warehouse = { [row.sapArticle || row.article]: 10 };
  const out = await procurement(res.bom.rows, new LocalWarehouse(p));
  const r = out.find((x) => x.article === row.article);
  assert.equal(r.shortage, Math.max(0, r.purchase - 10));
  const host = new PluginHost({ store: new Store(p), registerCommand() {}, toast() {} });
  const api = host.register({ id: 't', name: 'T', version: '1', apiVersion: '1.0', permissions: ['model.read'] }, () => {});
  assert.ok(api.getProject().meta);
  assert.throws(() => api.apply({ add: [] }), /lacks permission/);
  assert.throws(() => host.register({ id: 'x', apiVersion: '2.0' }, () => {}), /incompatible/);
});
