// Underfloor-heating layout geometry tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutRoomUfh, spiralLoop, serpentineLoop, doubleSerpentineLoop, roundCorners, pathLength } from '../src/engines/ufhlayout.js';
import { createDemoProject } from '../src/core/demo.js';
import { runCalculation } from '../src/engines/calc.js';

function crossings(pts) {
  const inter = (a, b, c, d) => {
    const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
    if (Math.abs(den) < 1e-12) return false;
    const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
    const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
    return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
  };
  let n = 0;
  for (let i = 1; i < pts.length; i++) for (let j = i + 2; j < pts.length; j++) if (inter(pts[i - 1], pts[i], pts[j - 1], pts[j])) n++;
  return n;
}

test('bifilar spiral: no self-crossings, both ends side by side at the entry corner, even spacing', () => {
  const { coil, sup, ret } = spiralLoop(0, 0, 3, 2, 0.15);
  assert.equal(crossings(coil), 0);
  assert.ok(Math.hypot(sup[0].x - 0, sup[0].y - 0.075) < 1e-9, 'supply starts on the edge');
  const end = ret[ret.length - 1];
  assert.ok(Math.hypot(end.x - 0.15, end.y - 0.075) < 1e-9, 'return ends s away from the supply start');
  const L = pathLength(coil);
  assert.ok(L > (6 / 0.15) * 0.8 && L < (6 / 0.15) * 1.15, `length ${L}`);
  // every coil point stays inside the rectangle
  for (const p of coil) assert.ok(p.x >= -1e-9 && p.x <= 3 + 1e-9 && p.y >= -1e-9 && p.y <= 2 + 1e-9);
});

test('double serpentine: closed U-turn, supply/return pair s apart, no crossings', () => {
  const { coil, sup, ret } = doubleSerpentineLoop(0, 0, 2, 3, 0.2);
  assert.equal(crossings(coil), 0);
  assert.ok(Math.abs(ret[ret.length - 1].x - sup[0].x - 0.2) < 1e-9);
  assert.deepEqual(sup[sup.length - 1], ret[0], 'supply and return meet at the U-turn');
});

test('serpentine: even number of runs, return back along the entry edge', () => {
  const { coil, sup, ret } = serpentineLoop(0, 0, 2, 3, 0.2);
  assert.equal(crossings(coil), 0);
  const runs = sup.slice(1).filter((q, i) => Math.hypot(q.x - sup[i].x, q.y - sup[i].y) > 1).length;
  assert.ok(runs >= 2);
  assert.equal(runs % 2, 0);
  assert.ok(Math.abs(ret[ret.length - 1].y) < 1e-9, 'return ends at the entry edge');
});

test('corner rounding keeps the path continuous and never lengthens it', () => {
  const sharp = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
  const r = roundCorners(sharp, 0.1);
  assert.ok(pathLength(r) < pathLength(sharp));
  assert.deepEqual(r[0], sharp[0]);
  assert.deepEqual(r[r.length - 1], sharp[2]);
});

test('room layout: strips touch the manifold side, leads end at ports and never cross', () => {
  const polygon = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];
  const ports = [0, 1, 2].map((i) => ({ supply: { x: 7 + i * 0.05, y: 1 }, return: { x: 7 + i * 0.05, y: 1.2 } }));
  for (const pattern of ['spiral', 'double_serpentine', 'serpentine']) {
    const lay = layoutRoomUfh({ polygon, loops: 3, spacing: 0.15, pattern, inset: 0.25, ports, toward: { x: 7, y: 1 } });
    assert.equal(lay.side, 'right');
    assert.equal(lay.loops.length, 3);
    const paths = [];
    for (const [k, l] of lay.loops.entries()) {
      assert.deepEqual(l.supplyLead[0], ports[k].supply);
      assert.deepEqual(l.returnLead[l.returnLead.length - 1], ports[k].return);
      assert.deepEqual(l.supplyLead[l.supplyLead.length - 1], l.coil[0]);
      assert.deepEqual(l.returnLead[0], l.coil[l.coil.length - 1]);
      assert.equal(crossings(l.coil), 0, pattern);
      for (const p of l.coil) assert.ok(p.x >= 0.25 - 1e-9 && p.x <= 5.75 + 1e-9 && p.y >= 0.25 - 1e-9 && p.y <= 3.75 + 1e-9);
      // leads inside the room (the manifold rows themselves overlap in plan)
      paths.push(l.coil, l.supplyLead.filter((p) => p.x < 5.9), l.returnLead.filter((p) => p.x < 5.9));
    }
    let n = 0;
    for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) n += crossBetween(paths[i], paths[j]);
    assert.equal(n, 0, `${pattern}: leads/coils cross`);
  }
});

function crossBetween(a, b) {
  let n = 0;
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) n += segX(a[i - 1], a[i], b[j - 1], b[j]);
  return n;
}
function segX(a, b, c, d) {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(den) < 1e-12) return 0;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 ? 1 : 0;
}

test('calculation uses the real loop geometry', () => {
  const p = createDemoProject();
  const res = runCalculation(p, { noCache: true });
  const ufh = Object.values(res.ufh);
  assert.ok(ufh.length >= 2);
  for (const u of ufh) {
    assert.equal(u.geometric, true);
    assert.equal(u.layout.length, u.loops);
    const sum = u.layout.reduce((a, l) => a + l.length, 0);
    assert.ok(Math.abs(sum - u.totalLength) < 1e-6);
    assert.ok(u.loopLength <= p.settings.ufhMaxLoopM + 1e-6);
  }
  // manifold ports are allocated consecutively across rooms
  const col = ufh[0].collectorId;
  const ports = ufh.filter((u) => u.collectorId === col).map((u) => [u.firstPort, u.loops]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ports.length; i++) assert.equal(ports[i][0], ports[i - 1][0] + ports[i - 1][1]);
});

import { autoUfh, applyChangeSet } from '../src/core/autodesign.js';
import { createSampleProject } from '../src/core/demo.js';
import { layoutRoomUfh as lay2 } from '../src/engines/ufhlayout.js';

test('L-shaped room: coils stay inside the outline and leads never cross a coil', () => {
  const polygon = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 7 }, { x: 0, y: 7 }];
  const ports = Array.from({ length: 6 }, (_, k) => ({ supply: { x: 6.3, y: 1.5 + k * 0.05 }, return: { x: 6.5, y: 1.5 + k * 0.05 } }));
  const lay = lay2({ polygon, loops: 3, spacing: 0.2, inset: 0.3, ports, toward: ports[0].supply });
  assert.ok(lay.loops.length >= 3);
  const inside = (p) => (p.x >= 0 && p.x <= 6 && p.y >= 0 && p.y <= 3) || (p.x >= 0 && p.x <= 3 && p.y >= 0 && p.y <= 7);
  for (const l of lay.loops) for (const p of l.coil) assert.ok(inside(p), `coil point ${p.x},${p.y} outside`);
  const paths = lay.loops.flatMap((l) => [l.coil, l.supplyLead.filter((p) => p.x < 5.9), l.returnLead.filter((p) => p.x < 5.9)]);
  let n = 0;
  for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) n += crossBetween(paths[i], paths[j]);
  assert.equal(n, 0);
});

test('auto UFH: whole level grouped to ≤ 12-outlet manifolds, every room connected', () => {
  const p = createSampleProject();
  for (const e of Object.values(p.elements)) if (e.cat === 'radiator' && e.levelId === 'lvl_1') delete p.elements[e.id];
  const cs = autoUfh(p, 'lvl_1');
  assert.ok(cs.add.length >= 1);
  applyChangeSet(p, cs);
  const r = runCalculation(p, { noCache: true });
  const rooms = Object.values(p.elements).filter((e) => e.cat === 'room' && e.levelId === 'lvl_1' && e.heating === 'ufh');
  assert.ok(rooms.length >= 6);
  for (const rm of rooms) {
    assert.ok(r.ufh[rm.id]?.layout.length > 0, rm.name);
    assert.ok(r.ufh[rm.id].layout.every((l) => l.supplyLead.length && l.returnLead.length), `${rm.name} leads`);
  }
  for (const c of cs.add) assert.ok((r.ufhPorts?.[c.id] ?? 0) <= 12, `manifold outlets ${r.ufhPorts?.[c.id]}`);
});

import { designUfh, refineWithLayout } from '../src/engines/ufh.js';

test('loops ≤ 60 m: fewest loops that fit (70 m → 2), small rooms keep one short loop', () => {
  for (const [w, h] of [[2, 1.8], [3, 3], [4, 3.5], [6, 5]]) {
    const polygon = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    const ports = Array.from({ length: 12 }, (_, k) => ({ supply: { x: -0.4, y: 0.3 + k * 0.05 }, return: { x: -0.6, y: 0.3 + k * 0.05 } }));
    const d0 = designUfh({ Q: 60 * w * h, area: w * h, ti: 20, ts: 45, tr: 35, spacing: 0.15, maxLoop: 60 });
    const fn = (n) => layoutRoomUfh({ polygon, loops: n, spacing: 0.15, inset: 0.3, ports, toward: ports[0].supply });
    const d = refineWithLayout(d0, fn, { ts: 45, tr: 35, maxLoop: 60, maxLoopKpa: 20 });
    assert.ok(d.layout.every((l) => l.length <= 60), `${w}×${h}: ${d.layout.map((l) => l.length.toFixed(0))}`);
    if (d.loops > 1) assert.ok(fn(d.loops - 1).loops.some((l) => l.length > 60), `${w}×${h}: ${d.loops} loops is not the minimum`);
    if (w * h < 4) assert.equal(d.loops, 1, 'small room: one short loop');
  }
});

import { splitOverloadedCollectors } from '../src/core/autodesign.js';

test('manifold > 12 loops is split into manifolds of ≤ 12 outlets side by side', () => {
  const p = createSampleProject();
  const cols = Object.values(p.elements).filter((e) => e.cat === 'collector' && e.kind === 'ufh');
  // hang every ground-floor UFH room on the first manifold
  for (const r of Object.values(p.elements)) if (r.cat === 'room' && r.levelId === 'lvl_0' && r.ufh && !r.ufh.transit) r.ufh.collectorId = cols[0].id;
  let r = runCalculation(p, { noCache: true });
  assert.ok(r.ufhPorts[cols[0].id] > 12);
  const cs = splitOverloadedCollectors(p, r);
  assert.ok(cs.add.length >= 1);
  applyChangeSet(p, cs);
  r = runCalculation(p, { noCache: true });
  for (const [id, n] of Object.entries(r.ufhPorts)) assert.ok(n <= 12, `${id}: ${n}`);
  assert.equal(r.validation.findings.filter((f) => f.code === 'collector_ports').length, 0);
  for (const c of cs.add) assert.equal(c.angle, cols[0].angle);
});

test('one big room with > 12 loops is served by several manifolds (bands), each ≤ 12', () => {
  const p = createSampleProject();
  const hall = Object.values(p.elements).find((e) => e.cat === 'room' && e.levelId === 'lvl_0' && e.name === 'Холл');
  const kit = Object.values(p.elements).find((e) => e.cat === 'room' && e.levelId === 'lvl_0' && e.name === 'Кухня-столовая');
  delete p.elements[kit.id];
  hall.points = [{ x: 5.8, y: 2.2 }, { x: 11.6, y: 2.2 }, { x: 11.6, y: 18.76 }, { x: 5.8, y: 18.76 }];
  hall.ufh.spacing = 0.1;
  let r = runCalculation(p, { noCache: true });
  assert.ok(r.ufhPorts[hall.ufh.collectorId] > 12);
  for (let pass = 0; pass < 6; pass++) {
    const cs = splitOverloadedCollectors(p, r);
    if (!cs.add.length && !cs.update.length) break;
    applyChangeSet(p, cs);
    r = runCalculation(p, { noCache: true });
  }
  assert.ok(hall.ufh.collectorIds.length >= 2);
  for (const n of Object.values(r.ufhPorts)) assert.ok(n <= 12);
  const u = r.ufh[hall.id];
  assert.equal(u.layout.length, u.loops);
  assert.ok(u.layout.every((l) => hall.ufh.collectorIds.includes(l.collectorId)));
  assert.equal(new Set(u.loopIds).size, u.loopIds.length);
});
