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
