// Demo / benchmark project: two-storey private house in Tashkent.
// Used by the UI ("Namuna loyiha"), by tests (regression benchmark) and as a template example.

import { createEmptyProject, newElement } from './model.js';
import { autoPlaceRadiators, autoRoute, syncRadiatorGeometry, applyChangeSet } from './autodesign.js';
import { runCalculation } from '../engines/calc.js';

function wall(levelId, a, b, exterior, assembly, thickness) {
  return newElement('wall', { levelId, a, b, exterior, assembly, thickness });
}

function rect(x0, y0, x1, y1) {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

export function outerWalls(levelId, x0, y0, x1, y1, assembly = 'ext_brick_380_eps100', t = 0.49) {
  return [
    wall(levelId, { x: x0, y: y0 }, { x: x1, y: y0 }, true, assembly, t), // north
    wall(levelId, { x: x1, y: y0 }, { x: x1, y: y1 }, true, assembly, t), // east
    wall(levelId, { x: x1, y: y1 }, { x: x0, y: y1 }, true, assembly, t), // south
    wall(levelId, { x: x0, y: y1 }, { x: x0, y: y0 }, true, assembly, t), // west
  ];
}

export function createDemoProject() {
  const p = createEmptyProject('Xususiy uy — namuna');
  p.meta.client = 'Namuna mijoz';
  p.meta.address = "Toshkent sh., Yunusobod tumani";
  p.meta.designer = 'ZODPRO muhandisi';
  p.levels = [
    { id: 'lvl_0', name: '1-qavat', elevation: 0, height: 3.0, floorThickness: 0.3 },
    { id: 'lvl_1', name: '2-qavat', elevation: 3.3, height: 3.0, floorThickness: 0.3 },
  ];
  const E = (el) => {
    p.elements[el.id] = el;
    return el;
  };
  const L0 = 'lvl_0';
  const L1 = 'lvl_1';

  // ---------- Level 1 ----------
  const [wN, wE, wS, wW] = outerWalls(L0, 0, 0, 12, 9).map(E);
  const i1 = E(wall(L0, { x: 6, y: 0 }, { x: 6, y: 4.5 }, false, 'int_brick_120', 0.16));
  E(wall(L0, { x: 0, y: 4.5 }, { x: 12, y: 4.5 }, false, 'int_brick_120', 0.16));
  E(wall(L0, { x: 3, y: 4.5 }, { x: 3, y: 9 }, false, 'int_brick_120', 0.16));
  E(wall(L0, { x: 7.5, y: 4.5 }, { x: 7.5, y: 9 }, false, 'int_brick_120', 0.16));
  void i1;

  const win = (w, offset, width = 1.5, height = 1.5, sill = 0.9, type = 'win_pvc_2') =>
    E(newElement('window', { levelId: w.levelId, wallId: w.id, offset, width, height, sill, type }));
  win(wN, 3); // living, north
  win(wW, 2.25, 1.2); // living, west
  win(wN, 9); // bedroom
  win(wE, 6.75, 1.2); // kitchen, east
  win(wS, 12 - 9.75, 1.2); // kitchen, south (wall runs east→west)
  win(wS, 12 - 1.5, 0.6, 0.6, 1.5); // bathroom
  E(newElement('door', { levelId: L0, wallId: wS.id, offset: 12 - 5.25, width: 1.0, height: 2.1, sill: 0, type: 'door_ext_insulated' }));

  const room = (levelId, number, name, roomType, pts, extra = {}) =>
    E(newElement('room', { levelId, number, name, roomType, points: pts, heating: 'radiator', ...extra }));
  room(L0, '101', 'Mehmonxona', 'living', rect(0, 0, 6, 4.5));
  room(L0, '102', 'Yotoqxona', 'bedroom', rect(6, 0, 12, 4.5));
  room(L0, '103', 'Oshxona', 'kitchen', rect(7.5, 4.5, 12, 9));
  const corridor = room(L0, '104', 'Koridor', 'corridor', rect(3, 4.5, 7.5, 9), { heating: 'ufh' });
  const bath = room(L0, '105', 'Sanuzel', 'bathroom', rect(0, 4.5, 3, 9), { heating: 'mixed' });

  // boiler in the kitchen on the east wall, radiator collector + UFH collector in the corridor
  E(newElement('boiler', { levelId: L0, x: 11.45, y: 5.4, angle: -90, builtInPump: true }));
  E(newElement('collector', { levelId: L0, x: 4.0, y: 5.8, angle: 0, outlets: 6, kind: 'radiator' }));
  const ufhCol = E(newElement('collector', { levelId: L0, x: 5.6, y: 8.2, angle: 0, outlets: 2, kind: 'ufh', mixing: true }));
  corridor.ufh = { collectorId: ufhCol.id, spacing: null, pipe: { material: 'PEX', dn: '16' }, pattern: 'spiral' };
  bath.ufh = { collectorId: ufhCol.id, spacing: 0.15, pipe: { material: 'PEX', dn: '16' }, pattern: 'serpentine' };

  // ---------- Level 2 ----------
  const [w2N, w2E, w2S, w2W] = outerWalls(L1, 0, 0, 12, 9).map(E);
  E(wall(L1, { x: 6, y: 0 }, { x: 6, y: 9 }, false, 'int_brick_120', 0.16));
  win(w2N, 3);
  win(w2N, 9);
  win(w2S, 3);
  win(w2S, 9);
  void w2E;
  void w2W;
  room(L1, '201', 'Yotoqxona 2', 'bedroom', rect(0, 0, 6, 9));
  room(L1, '202', 'Yotoqxona 3', 'bedroom', rect(6, 0, 12, 9));
  E(newElement('collector', { levelId: L1, x: 5.2, y: 4.3, angle: 0, outlets: 4, kind: 'radiator' }));

  // ---------- auto design ----------
  applyChangeSet(p, autoPlaceRadiators(p));
  let res = runCalculation(p);
  applyChangeSet(p, syncRadiatorGeometry(p, res));
  const lookup = (el) => res.radiators[el.id]?.product;
  applyChangeSet(p, autoRoute(p, lookup));
  res = runCalculation(p);
  applyChangeSet(p, syncRadiatorGeometry(p, res));

  // a sample obstacle (beam) for clash detection, placed above pipe level
  E(newElement('obstacle', { levelId: L0, kind: 'beam', a: { x: 6, y: 0.3 }, b: { x: 6, y: 4.2 }, zBottom: 2.6, zTop: 3.0, width: 0.3 }));
  E(newElement('thermostat', { levelId: L0, x: 4.5, y: 6.5, roomId: corridor.id, controls: [ufhCol.id], kind: 'room' }));
  return p;
}

/**
 * Sample project modelled on the reference documentation ("2-этажный жилой дом"):
 * 17.6 × 18.76 m two-storey house, ground floor fully on underfloor heating (bifilar loops,
 * three UFH manifolds with mixing units), first floor with in-floor convectors fed by
 * home-run PEX pipes from two 12-outlet manifolds, towel dryer in the bathroom, boiler room.
 */
export function createSampleProject() {
  const p = createEmptyProject('2-этажный жилой дом');
  p.meta.client = 'Buyurtmachi';
  p.meta.address = 'Toshkent sh.';
  p.meta.designer = 'Ramazonov';
  p.meta.checker = 'Djalilov Sh.';
  p.meta.number = 'ZP-2025-OV-01';
  p.meta.stage = 'РП';
  p.settings.docLang = 'ru';
  p.settings.systemCodes = { rs: 'T5', rr: 'T6', us: 'T1', ur: 'T2' };
  p.levels = [
    { id: 'lvl_0', name: '1-этаж', elevation: 0, height: 3.0, floorThickness: 0.3 },
    { id: 'lvl_1', name: '2-этаж', elevation: 3.3, height: 3.0, floorThickness: 0.3 },
  ];
  const E = (el) => {
    p.elements[el.id] = el;
    return el;
  };
  const EXT = 'ext_aerated_400';
  const INT = 'int_brick_120';
  const outline = [{ x: 0, y: 0 }, { x: 5.8, y: 0 }, { x: 5.8, y: 2.2 }, { x: 17.6, y: 2.2 }, { x: 17.6, y: 18.76 }, { x: 0, y: 18.76 }];
  const build = (L, n) => {
    const ext = outline.map((a, i) => E(wall(L, a, outline[(i + 1) % outline.length], true, EXT, 0.44)));
    const iw = (a, b) => E(wall(L, a, b, false, INT, 0.16));
    iw({ x: 5.8, y: 2.2 }, { x: 5.8, y: 18.76 });
    iw({ x: 11.6, y: 2.2 }, { x: 11.6, y: 18.76 });
    iw({ x: 0, y: 7.16 }, { x: 5.8, y: 7.16 });
    iw({ x: 11.6, y: 7.16 }, { x: 17.6, y: 7.16 });
    iw({ x: 0, y: 13.16 }, { x: 17.6, y: 13.16 });
    iw({ x: 3.2, y: 7.16 }, { x: 3.2, y: 13.16 });
    const [wN, wNs, wN2, wE, wS, wW] = ext;
    void wNs;
    const win = (w, absAlong, width = 1.6, height = 1.6, sill = 0.8) => {
      const d = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      const off = Math.abs(w.a.x - w.b.x) > Math.abs(w.a.y - w.b.y) ? Math.abs(absAlong - w.a.x) : Math.abs(absAlong - w.a.y);
      if (off > d) return null;
      return E(newElement('window', { levelId: L, wallId: w.id, offset: off, width, height, sill, type: 'win_pvc_2' }));
    };
    win(wN, 1.6); win(wN, 4.2);
    win(wN2, 8.7, n === 1 ? 3.0 : 2.4); win(wN2, 13.2); win(wN2, 16.0);
    win(wE, 4.2); win(wE, 6.2, 1.2); win(wE, 10.2, 1.2); win(wE, 15.2); win(wE, 17.3, 1.2);
    win(wS, 16.0); win(wS, 13.2); win(wS, 10.4, 1.4); win(wS, 7.0, 1.4); win(wS, 4.2); win(wS, 1.6);
    win(wW, 17.2); win(wW, 15.2); win(wW, 10.2, 0.8, 0.8, 1.4); win(wW, 5.7); win(wW, 3.5);
    if (n === 1) {
      const d = Math.abs(8.7 - wS.a.x);
      E(newElement('door', { levelId: L, wallId: wS.id, offset: d, width: 1.2, height: 2.2, sill: 0, type: 'door_ext_insulated' }));
    }
  };
  build('lvl_0', 1);
  build('lvl_1', 2);
  const room = (L, number, name, roomType, pts, extra = {}) => E(newElement('room', { levelId: L, number, name, roomType, points: pts, heating: 'radiator', ...extra }));
  const u = (pattern = 'auto') => ({ heating: 'ufh', ufh: { collectorId: null, spacing: null, pipe: { material: 'PEX', dn: '16' }, pattern } });
  // ground floor — underfloor heating everywhere except the boiler room
  const g = [
    room('lvl_0', '1', 'Гостиная', 'living', [{ x: 0, y: 0 }, { x: 5.8, y: 0 }, { x: 5.8, y: 7.16 }, { x: 0, y: 7.16 }], u()),
    room('lvl_0', '2', 'Санузел', 'bathroom', rect(0, 7.16, 3.2, 13.16), { ...u(), tIn: 22 }),
    room('lvl_0', '3', 'Коридор', 'corridor', rect(3.2, 7.16, 5.8, 13.16), { heating: 'ufh', ufh: { collectorId: null, transit: true, pipe: { material: 'PEX', dn: '16' } } }),
    room('lvl_0', '4', 'Спальня', 'bedroom', rect(0, 13.16, 5.8, 18.76), u()),
    room('lvl_0', '5', 'Холл', 'living', rect(5.8, 2.2, 11.6, 13.16), u()),
    room('lvl_0', '6', 'Кухня-столовая', 'kitchen', rect(5.8, 13.16, 11.6, 18.76), u()),
    room('lvl_0', '7', 'Кабинет', 'office', rect(11.6, 2.2, 17.6, 7.16), u()),
    room('lvl_0', '8', 'Котельная', 'boiler', rect(11.6, 7.16, 17.6, 13.16), { heating: 'none' }),
    room('lvl_0', '9', 'Спальня', 'bedroom', rect(11.6, 13.16, 17.6, 18.76), u()),
  ];
  // UFH manifolds (with mixing units) — left block, centre, right block
  const c1 = E(newElement('collector', { levelId: 'lvl_0', x: 3.7, y: 12.7, angle: 0, outlets: 12, kind: 'ufh', mixing: true }));
  const c2 = E(newElement('collector', { levelId: 'lvl_0', x: 8.0, y: 12.7, angle: 0, outlets: 12, kind: 'ufh', mixing: true }));
  const c3 = E(newElement('collector', { levelId: 'lvl_0', x: 12.1, y: 12.7, angle: 0, outlets: 12, kind: 'ufh', mixing: true }));
  const assign = { 1: c1, 2: c1, 3: c1, 4: c1, 5: c2, 6: c2, 7: c3, 9: c3 };
  for (const r of g) if (assign[r.number]) r.ufh.collectorId = assign[r.number].id;
  E(newElement('boiler', { levelId: 'lvl_0', x: 17.14, y: 9.0, angle: -90 }));
  // floor-standing boilers > 35 kW have no built-in circulator → separate pump on the flow line
  E(newElement('pump', { levelId: 'lvl_0', x: 16.6, y: 9.9, angle: 0 }));
  // first floor — in-floor convectors on home-run pipes
  const conv = { heating: 'radiator' };
  room('lvl_1', '11', 'Спальня', 'bedroom', [{ x: 0, y: 0 }, { x: 5.8, y: 0 }, { x: 5.8, y: 7.16 }, { x: 0, y: 7.16 }], conv);
  room('lvl_1', '12', 'Санузел', 'bathroom', rect(0, 7.16, 3.2, 13.16), conv);
  room('lvl_1', '13', 'Гардероб', 'corridor', rect(3.2, 7.16, 5.8, 13.16), { heating: 'none', heated: false });
  room('lvl_1', '14', 'Спальня', 'bedroom', rect(0, 13.16, 5.8, 18.76), conv);
  room('lvl_1', '15', 'Детская', 'bedroom', rect(5.8, 13.16, 11.6, 18.76), conv);
  room('lvl_1', '16', 'Холл', 'living', rect(5.8, 2.2, 11.6, 13.16), conv);
  room('lvl_1', '17', 'Спальня', 'bedroom', rect(11.6, 2.2, 17.6, 7.16), conv);
  room('lvl_1', '18', 'Лестница', 'stair', rect(11.6, 7.16, 17.6, 13.16), { heating: 'none', heated: false });
  room('lvl_1', '19', 'Спальня', 'bedroom', rect(11.6, 13.16, 17.6, 18.76), conv);
  E(newElement('collector', { levelId: 'lvl_1', x: 6.3, y: 12.75, angle: 0, outlets: 12, kind: 'radiator' }));
  E(newElement('collector', { levelId: 'lvl_1', x: 10.3, y: 6.8, angle: 0, outlets: 12, kind: 'radiator' }));
  p.settings.pipeMaterial = 'PEX';
  p.settings.ufhMaxLoopM = 60;
  // auto design: convectors under the windows, towel dryer in the bathroom, routing, risers
  applyChangeSet(p, autoPlaceRadiators(p));
  for (const r of Object.values(p.elements)) {
    if (r.cat !== 'radiator') continue;
    const rm = p.elements[r.roomId];
    r.prefKind = 'convector';
    r.prefType = 'KV';
    void rm;
  }
  // bathrooms: towel dryer (сушилка) in addition to the window emitter
  for (const rm of Object.values(p.elements).filter((e) => e.cat === 'room' && e.roomType === 'bathroom' && e.heating !== 'ufh')) {
    E(newElement('radiator', { levelId: rm.levelId, roomId: rm.id, x: 3.03, y: 9.4, angle: 90, selection: 'manual', productId: 'TOWEL-600-1200', prefKind: 'towel', mountHeight: 0.45, length: 0.6 }));
  }
  let res = runCalculation(p);
  // rooms where one convector cannot cover the load get a row of convectors along the window wall
  for (const r of Object.values(p.elements).filter((e) => e.cat === 'radiator' && e.prefKind === 'convector')) {
    if (res.radiators[r.id]?.product) continue;
    const a = (r.angle * Math.PI) / 180;
    for (const sgn of [-1, 1]) E(newElement('radiator', { ...r, id: undefined, guid: undefined, x: +(r.x + sgn * 2.1 * Math.cos(a)).toFixed(3), y: +(r.y + sgn * 2.1 * Math.sin(a)).toFixed(3), windowId: null, mark: '' }));
  }
  res = runCalculation(p);
  applyChangeSet(p, syncRadiatorGeometry(p, res));
  res = runCalculation(p);
  applyChangeSet(p, autoRoute(p, (el) => res.radiators[el.id]?.product, { material: 'PEX', trunkMaterial: 'PPR' }));
  res = runCalculation(p);
  applyChangeSet(p, syncRadiatorGeometry(p, res));
  return p;
}
