// UFH Coverage Router — the app's "Avto тёплый пол" on the Phase 6 / 7B core.
//
// The UI's zone job (rooms, doors, manifold outlets, pitch, clearances) → the heating of every room
// of the zone by the lead-aware Phase 6 planner (continuous two-path spirals, residual only in the
// terminal closure, never a serpentine; NO_VALID_SPIRAL when no spiral fits) → the leads from the
// manifold outlets along the walls and through the doors by the 7B router (corridor.js, code as it
// is) → one loop per outlet: lead + spiral + lead, measured (60 m with the real leads and the drop),
// checked (crossings, lead ↔ heating clashes, topology) and reported. Nothing is hidden: a failure
// is an issue of the result, the loops stay as built.
//
// Output: the result format of engine.js (loops, issues, coverage, usable, params), so the UI
// preview / APPLY are unchanged.

import * as G from './geom.js';
import { planLeadAware, leadBudget } from './leadaware.js';
import { spiralRegions } from './decompose.js';
import { planLoops } from './loopplanner.js';
import { planTransfers } from './corridor.js';
import { doorChains, roomOf } from './roomgraph.js';
import { loopTopology } from './looptopology.js';
import { portsOf } from './collector.js';
import { pipeType, DEFAULT_PIPE } from './pipes.js';
import { MAX_LOOP_M, LOOP_LENGTH_EPS, RMIN_CHECK } from './criteria.js';

// (the frozen planner reads process.env for its debug switch — a browser / worker has no `process`)
if (!globalThis.process) globalThis.process = { env: {} };

export const UFH_PHASE6_ENGINE_VERSION = 'ufh-phase6/1.0';
// lead routing inputs of the 7B fixtures (wall offset of the first lead, lead ↔ lead pitch)
const LEAD_WALL_OFFSET = 0.05;
const LEAD_SPACING = 0.05;
const PITCHES = [0.15, 0.2];

const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;

/**
 * @param job  zoneJob() of ufhmodel.js: { zone, rooms, doors, obstacles, collector: { id, anchor,
 *             ports: [{ circuitId, index, supply, ret }] }, spacing, wallClearance,
 *             obstacleClearance, pipeType, maxLoop, coverageMin, maxHole, dropLength }
 */
export function runPhase6Engine(job, onProgress = () => {}) {
  const t0 = Date.now();
  const pipe = pipeType(job.pipeType ?? DEFAULT_PIPE);
  const s = job.spacing ?? 0.2;
  const wallClearance = job.wallClearance ?? 0.1;
  const obstacleClearance = job.obstacleClearance ?? 0.1;
  const dropPerPipe = (job.dropLength ?? 0.8) / 2;
  const fail = (code, msg) => ({ version: UFH_PHASE6_ENGINE_VERSION, ok: false, loops: [], issues: [{ level: 'error', code, msg }], coverage: null, map: null, tried: [], ms: Date.now() - t0, strategy: 'phase6_spiral' });
  if (!PITCHES.some((p) => Math.abs(p - s) < 1e-9)) return fail('UFH-PARAM', `Quvur qadami ${Math.round(s * 1000)} mm — spiral yadro 150 yoki 200 mm qadam bilan ishlaydi (Parametrlar)`);
  const rooms = (job.rooms ?? []).map((r) => ({ id: String(r.id), name: r.name, poly: r.poly }));
  if (!rooms.length) return fail('UFH-ROOM', 'Qavatda xona yo‘q — xonalarni (RM) chizing: konturlar xona bo‘yicha, podvodka eshiklardan o‘tadi');
  // real doors only (a passage through a wall is no route for leads)
  const doors = (job.doors ?? []).filter((d) => !d.virtual && d.id).map((d) => ({ id: String(d.id), between: [rooms[d.ra].id, rooms[d.rb].id], at: d.c, width_m: d.width ?? 0.9 }));
  const ports = job.collector.ports;
  if (!ports.length) return fail('UFH-CIRC', 'Kollektorda bo‘sh chiqish yo‘q');
  // the manifold: its outlets as they are (physical ports of the model), the side the room is on
  const row = { x: ports.at(-1).supply.x - ports[0].supply.x, y: ports.at(-1).supply.y - ports[0].supply.y };
  const depth = { x: ports[0].ret.x - ports[0].supply.x, y: ports[0].ret.y - ports[0].supply.y };
  const mid = { x: ports.reduce((a, p) => a + (p.supply.x + p.ret.x) / 2, 0) / ports.length, y: ports.reduce((a, p) => a + (p.supply.y + p.ret.y) / 2, 0) / ports.length };
  let facing = G.norm(Math.hypot(row.x, row.y) > 1e-9 ? { x: -row.y, y: row.x } : depth);
  const inRoom = (p) => roomOf(rooms, p) != null;
  if (!inRoom({ x: mid.x + facing.x * 0.3, y: mid.y + facing.y * 0.3 })) facing = { x: -facing.x, y: -facing.y };
  let at = mid;
  for (let k = 0; k < 20 && !inRoom(at); k++) at = { x: at.x + facing.x * 0.05, y: at.y + facing.y * 0.05 };
  if (!inRoom(at)) return fail('UFH-COL', 'Kollektor hech bir xona ichida emas — kollektorni xona devoriga qo‘ying');
  // the leads leave the manifold along its wall: the connection row LEAD_WALL_OFFSET in front of the
  // wall the manifold stands on (7B's port model), each outlet joined to its slot by a short tail
  const colRoom = rooms.find((r) => r.id === roomOf(rooms, at));
  const ring = G.ccw(colRoom.poly);
  let foot = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = Math.max(0, Math.min(1, ((mid.x - a.x) * (b.x - a.x) + (mid.y - a.y) * (b.y - a.y)) / L2));
    const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    const d = Math.hypot(q.x - mid.x, q.y - mid.y);
    if (!foot || d < foot.d) foot = { q, d, n: G.norm({ x: -(b.y - a.y), y: b.x - a.x }) };
  }
  // (the inward normal of a CCW ring is the left normal)
  facing = foot.n;
  at = { x: foot.q.x + facing.x * (LEAD_WALL_OFFSET - 0.01), y: foot.q.y + facing.y * (LEAD_WALL_OFFSET - 0.01) };
  const collector = { id: String(job.collector.id), at, outlets: ports.length, portPitch_m: 0.05, dropPerPipe_m: dropPerPipe, facing };
  const slots = portsOf(collector);
  const params = { heatingPitch: s, leadWallOffset: LEAD_WALL_OFFSET, leadSpacing: LEAD_SPACING, pipeType: pipe.id, wallClearance };

  // ---- the heating area of every room of the zone: room ∩ zone − wall clearance − obstacles ----
  onProgress('usable_area', 0.05);
  // the zones of the manifold (this one and the others planned together)
  const zones = (job.zones?.length ? job.zones : [{ id: null, points: job.zone }]).map((z) => ({ id: z.id, R: G.sanitize(z.points) }));
  if (!zones[0].R.length) return fail('UFH-ZONE', 'Zona poligoni noto‘g‘ri (yopiq emas / o‘zini kesadi)');
  const Z = G.union(zones.flatMap((z) => z.R));
  const obstacles = (job.obstacles ?? []).map((o) => G.offset(G.sanitize(o.polygon), o.clearance ?? obstacleClearance, 'miter')).flat();
  const U = {};
  const zoneOfRoom = {};
  for (const r of rooms) {
    const inZone = G.intersection([{ outer: G.ccw(r.poly), holes: [] }], Z);
    if (G.area(inZone) < 0.5) continue;
    let u = G.offset(inZone, -wallClearance, 'miter');
    if (obstacles.length) u = G.difference(u, obstacles);
    u = u.filter((sh) => G.area([sh]) >= 0.05);
    if (G.area(u) >= 0.3) {
      U[r.id] = u;
      const own = zones.map((z) => ({ id: z.id, a: z.R.length ? G.area(G.intersection([{ outer: G.ccw(r.poly), holes: [] }], z.R)) : 0 })).sort((a, b) => b.a - a.a)[0];
      zoneOfRoom[r.id] = own?.id ?? null;
    }
  }
  const targets = Object.keys(U);
  if (!targets.length) return fail('UFH-ZONE', 'Zona hech bir xonani qoplamaydi');
  const chains = doorChains({ rooms, doors, collectorAt: at });
  const issues = [];
  for (const rid of targets) if (!chains.rooms[rid]?.reachable) issues.push({ level: 'error', code: 'UFH-ROUTE', msg: `${nameOf(rid)}: kollektordan eshiklar orqali yo‘l yo‘q (eshik qo‘ying)` });
  const served = targets.filter((rid) => chains.rooms[rid]?.reachable);
  if (!served.length) return { ...fail('UFH-ROUTE', 'Zonaning hech bir xonasiga kollektordan eshik orqali yo‘l yo‘q'), issues };
  const doorAt = (id) => doors.find((d) => d.id === id).at;
  const entryOf = (rid) => (rid === chains.collectorRoom ? at : doorAt(chains.rooms[rid].doors.at(-1)));

  // ---- loop counts ⇄ transit corridor (U′) until they agree; every room lead-aware ----
  onProgress('routing', 0.1);
  // the first corridor from an estimate of the counts (heating pipe of 90 % of the floor over the
  // length left after the leads); the planner's own counts replace it
  const estimate = (rid) => {
    const lead = man(at, entryOf(rid)) + 2;
    return Math.max(1, Math.ceil((0.9 * G.area(U[rid])) / s / Math.max(10, MAX_LOOP_M - 2 * (lead + dropPerPipe) - 3)));
  };
  let counts = Object.fromEntries(served.map((rid) => [rid, estimate(rid)]));
  let tr = null;
  let rooms6 = {};
  const memo = new Map();
  for (let it = 0; it < 3; it++) {
    onProgress('routing', 0.15 + it * 0.15);
    tr = planTransfers({ rooms, doors, collector, loopsByRoom: counts, usable: U, params });
    if (!tr.rooms) break;
    rooms6 = {};
    for (const rid of served) {
      const toEntry = rid === chains.collectorRoom ? 0 : toEntryOf(rooms, tr, rid);
      const key = `${rid}|${toEntry.toFixed(3)}|${G.area(tr.rooms[rid].Uprime).toFixed(4)}`;
      if (!memo.has(key)) memo.set(key, planLeadAware(tr.rooms[rid].Uprime, s, { entry: { at: entryOf(rid) }, leadSpacing: LEAD_SPACING, budget: { toEntry_m: toEntry, drop_m: dropPerPipe }, maxIter: 2 }));
      rooms6[rid] = memo.get(key);
    }
    const next = Object.fromEntries(served.map((rid) => [rid, rooms6[rid].plan.loops.length]));
    if (served.every((rid) => next[rid] === counts[rid])) break;
    counts = next;
  }
  if (!tr?.rooms) {
    const msg = tr?.status === 'OUTLET_SHORTAGE' ? `Konturlar soni ${Object.values(counts).reduce((a, b) => a + b, 0)} — kollektorda bo‘sh chiqish ${ports.length} ta: ikkinchi kollektor kerak` : `Podvodka yo‘li topilmadi (${tr?.status ?? '—'})`;
    const r = { ...fail(tr?.status === 'OUTLET_SHORTAGE' ? 'UFH-CIRC' : 'UFH-ROUTE', msg), issues: [...issues, { level: 'error', code: tr?.status === 'OUTLET_SHORTAGE' ? 'UFH-CIRC' : 'UFH-ROUTE', msg }] };
    if (tr?.status === 'OUTLET_SHORTAGE') Object.assign(r, { needCircuits: tr.capacity.required, freeCircuits: ports.length });
    return r;
  }
  let plans = Object.fromEntries(served.map((rid) => [rid, rooms6[rid].plan]));
  const uOf = Object.fromEntries(served.map((rid) => [rid, tr.rooms[rid].Uprime]));

  // ---- the leads to the spiral ends (7B router) ----
  onProgress('connectivity', 0.6);
  const better = (a, b) => {
    for (let i = 0; i < a.key.length; i++) if (Math.abs(a.key[i] - b.key[i]) > 1e-9) return a.key[i] < b.key[i];
    return false;
  };
  // heating of the plans inside the clearance of the leads (per room)
  const clashOf = (x, pl) => {
    const out = {};
    const heat = [];
    for (const rid of served) pl[rid].loops.forEach((l) => heat.push({ id: `${rid}.${l.loopId}`, rid, h: l.spiral.heating }));
    for (const q of x.leads ?? []) {
      if (q.path.length < 2) continue;
      const band = G.bufferPolylines([q.path], LEAD_SPACING + s / 2 - 0.01, 'butt', 'miter');
      for (const h of heat) {
        if (h.id === q.loop) continue;
        const len = G.clipLines([h.h], band).reduce((a2, c) => a2 + G.pathLength(c), 0);
        if (len > 1e-3) out[h.rid] = (out[h.rid] ?? 0) + len;
      }
    }
    for (const k of Object.keys(out)) if (out[k] < 0.05) delete out[k];
    return out;
  };
  const connect = (pl, cnt) => {
    const loopExits = {};
    for (const [rid, p] of Object.entries(pl)) p.loops.forEach((l) => (loopExits[`${rid}.${l.loopId}`] = { a: l.spiral.supply, b: l.spiral.ret, ha: l.spiral.path.slice(0, 3), hb: l.spiral.path.slice(-3).reverse() }));
    const route = (exitSide) => {
      const x = planTransfers({ rooms, doors, collector, loopsByRoom: cnt, usable: U, params, loopExits, exitSide });
      const hard = (x.issues ?? []).filter((i) => i.status !== 'LEAD_INTERSECTION').length;
      return { tr: x, key: [x.rooms ? 0 : 1, hard, x.crossings ?? 1e9, (x.leads ?? []).reduce((a2, l) => a2 + l.length, 0)], exitSide };
    };
    // a pair whose leads cross may go the other way round its room (lead routing only)
    let best = route({});
    for (let pass = 0, tries = 0; pass < 2 && best.tr.rooms && best.tr.crossings > 0 && tries < 6; pass++) {
      let improved = false;
      const L = best.tr.leads;
      const crossing = new Set();
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (pathsCross(L[i].path, L[j].path)) (crossing.add(L[i].loop), crossing.add(L[j].loop));
      // (the pair with the longest leads first: a pair sent the long way round its room)
      const leadLen = (lid) => L.filter((q) => q.loop === lid).reduce((a2, q) => a2 + q.length, 0);
      for (const lid of [...crossing].sort((p1, p2) => leadLen(p2) - leadLen(p1) || p1.localeCompare(p2))) {
        if (++tries > 6) break;
        const side = best.exitSide[lid] ?? (best.tr.rooms[lid.split('.')[0]]?.bundles ?? []).find((q) => q.exits.includes(lid))?.side ?? 1;
        const cand = route({ ...best.exitSide, [lid]: -side });
        if (better(cand, best)) ((best = cand), (improved = true));
      }
      if (!improved) break;
    }
    return best.tr;
  };
  tr = connect(plans, counts);
  if (!tr.rooms) return { ...fail('UFH-ROUTE', `Podvodka yo‘li topilmadi (${tr.status})`), issues };

  // one loop: outlet tail + lead + spiral + lead + tail, its lengths (the 60 m rule measures this)
  const measureLoop = (x, id, sp) => {
    const leads = x.leads.filter((q) => q.loop === id && q.path.length >= 2);
    const inL = leads.find((q) => near(q.path.at(-1), sp.path[0]));
    const outL = leads.find((q) => q !== inL && near(q.path.at(-1), sp.path.at(-1)));
    const port = ports[x.portOrder.indexOf(id)];
    const tailIn = inL && port ? (inL.kind === 'supply' ? port.supply : port.ret) : null;
    const tailOut = outL && port ? (outL.kind === 'supply' ? port.supply : port.ret) : null;
    const tail = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0);
    const supplyLength = (inL?.length ?? 0) + tail(tailIn, inL?.path[0]) + sp.leadIn;
    const returnLength = (outL?.length ?? 0) + tail(tailOut, outL?.path[0]) + sp.leadOut;
    const drop = 2 * dropPerPipe;
    return { inL, outL, port, tailIn, tailOut, supplyLength, returnLength, drop, length: sp.heatingLength + supplyLength + returnLength + drop };
  };

  // ---- the REAL leads back into the planning (lead-aware with the routed leads): a room whose
  // heating lies in the clearance of a lead is planned again on its floor without that band; a room
  // with a loop over 60 m with its routed leads is planned again with the measured excess added to
  // its lead budget. Phase 6 rules unchanged; the leads routed again; a round is kept only when it
  // is better (over-length, crossings, clashes) ----
  // over 60 m with the routed leads; `err`: how much the room's lead budget underestimated the
  // routed leads (the largest real − planned total of its loops)
  const realOver = (x, pl) => {
    const over = {};
    for (const rid of served) {
      let o = 0;
      let err = 0;
      for (const l of pl[rid].loops) {
        const t = measureLoop(x, `${rid}.${l.loopId}`, l.spiral).length;
        o = Math.max(o, t - MAX_LOOP_M);
        err = Math.max(err, t - (l.totalLength ?? t));
      }
      if (o > 0) over[rid] = { o, err };
    }
    return over;
  };
  const score = (x, pl) => {
    const c = clashOf(x, pl);
    const o = realOver(x, pl);
    return Object.values(o).reduce((a2, v) => a2 + 100 + v.o * 10, 0) + (x.crossings ?? 99) * 10 + Object.values(c).reduce((a2, v) => a2 + v, 0) + (x.issues ?? []).filter((i) => i.status !== 'LEAD_INTERSECTION').length * 20;
  };
  const extra = {};
  const cut = {};
  let cur = score(tr, plans);
  for (let pass = 0; pass < 5 && cur > 0; pass++) {
    onProgress('auto_repair', 0.65 + pass * 0.06);
    const clash = clashOf(tr, plans);
    const over = realOver(tr, plans);
    const redo = new Set([...Object.keys(clash), ...Object.keys(over)]);
    if (!redo.size) break;
    const pl2 = { ...plans };
    const cnt2 = { ...counts };
    for (const rid of redo) {
      if (over[rid]) extra[rid] = (extra[rid] ?? 0) + Math.max(over[rid].o, over[rid].err) + 0.5;
      if (clash[rid]) {
        const room = [{ outer: G.ccw(rooms.find((r) => r.id === rid).poly), holes: [] }];
        const own = tr.leads.filter((q) => q.path.length >= 2).map((q) => q.path);
        const band = G.intersection(G.bufferPolylines(own, LEAD_SPACING + 0.02, 'butt', 'miter'), room);
        cut[rid] = cut[rid] ? G.union(cut[rid], band) : band;
      }
      const u2 = (cut[rid] ? G.difference(uOf[rid], cut[rid]) : uOf[rid]).filter((sh) => G.area([sh]) >= 0.05);
      if (!u2.length) continue;
      const toEntry = (rid === chains.collectorRoom ? 0 : toEntryOf(rooms, tr, rid)) + (extra[rid] ?? 0);
      const { leadTo } = leadBudget(u2, entryOf(rid), { toEntry_m: toEntry, drop_m: dropPerPipe });
      pl2[rid] = planLoops(spiralRegions(u2, s, { toward: entryOf(rid) }), u2, s, { leadTo, manifold: null, toward: entryOf(rid) });
      cnt2[rid] = pl2[rid].loops.length;
    }
    const tr2 = connect(pl2, cnt2);
    if (!tr2.rooms) break;
    const sc = score(tr2, pl2);
    // (not better: the next round starts from the kept plan with the larger budget / band)
    if (sc >= cur) continue;
    ((plans = pl2), (counts = cnt2), (tr = tr2), (cur = sc));
  }
  for (const rid of served) if (!plans[rid].loops.length) issues.push({ level: 'error', code: 'UFH-SPIRAL', msg: `${nameOf(rid)}: spiral sig‘maydi (NO_VALID_SPIRAL) — serpantin ishlatilmaydi` });

  // ---- one loop per outlet: lead + spiral + lead, measured and checked ----
  onProgress('validation', 0.9);
  const all = [];
  for (const rid of served) for (const l of plans[rid].loops) all.push({ id: `${rid}.${l.loopId}`, room: rid, s, loop: l, spiral: l.spiral });
  const topo = loopTopology(all, tr.leads, { ports: slots, doors: tr.doors });
  const topoOf = new Map((topo.loops ?? []).map((x) => [x.loop ?? x.id, x]));
  const heatBand = (except) => all.filter((x) => x.id !== except).map((x) => x.spiral.heating);
  const loops = [];
  for (const x of all) {
    const sp = x.spiral;
    const { inL, outL, port, tailIn, tailOut, supplyLength, returnLength, drop, length } = measureLoop(tr, x.id, sp);
    const errs = [];
    if (!inL || !outL) errs.push({ code: 'UFH-TOPO', msg: `${x.id}: podvodka kontur uchiga ulanmadi` });
    // the outlet's own connection → its slot on the connection row (supply / return of the outlet)
    const path = [...(tailIn ? [tailIn] : []), ...(inL?.path ?? []), ...sp.path.slice(inL ? 1 : 0, outL ? -1 : undefined), ...(outL ? [...outL.path].reverse() : []), ...(tailOut ? [tailOut] : [])];
    if (length > Math.min(MAX_LOOP_M, job.maxLoop ?? MAX_LOOP_M) + LOOP_LENGTH_EPS) errs.push({ code: 'UFH-LEN', msg: `${x.id}: ${length.toFixed(2)} m > 60 m (podvodka bilan)` });
    if (!x.loop.geometryValid) errs.push({ code: 'UFH-GEOM', msg: `${x.id}: geometriya (${(x.loop.failed ?? []).join(', ')})` });
    if (G.minBendRadius(sp.path).radius < RMIN_CHECK - 1e-9) errs.push({ code: 'UFH-BEND', msg: `${x.id}: egilish radiusi kichik` });
    // the leads of this loop through another loop's heating (lead clearance)
    const zone = [inL, outL].filter(Boolean).length ? G.bufferPolylines([inL, outL].filter(Boolean).map((q) => q.path), LEAD_SPACING - 1e-9, 'butt', 'round') : [];
    const clash = zone.length ? G.clipLines(heatBand(x.id), zone).reduce((a, q) => a + G.pathLength(q), 0) : 0;
    if (clash > 0.05) errs.push({ code: 'UFH-CROSS', msg: `${x.id}: podvodka boshqa kontur isitish quvuri ustidan o‘tadi (${clash.toFixed(2)} m)` });
    const t = topoOf.get(x.id);
    if (t && t.status !== 'LOOP_TOPOLOGY_VALID') errs.push({ code: 'UFH-TOPO', msg: `${x.id}: ${t.status}` });
    loops.push({
      name: x.id,
      circuitId: port.circuitId,
      portIndex: port.index,
      path: G.cleanPath(path, 1e-7).map((p) => ({ x: +p.x.toFixed(5), y: +p.y.toFixed(5) })),
      length,
      supplyLength,
      returnLength,
      heatingLength: sp.heatingLength,
      drop,
      fan: [],
      transit: null,
      spacing: s,
      pipeType: pipe.id,
      status: errs.length ? 'invalid' : 'valid',
      errors: errs.length,
      warnings: 0,
      room: x.room,
      zoneId: zoneOfRoom[x.room],
      closure: sp.residual ? (sp.residual.side ? `side:${sp.residual.side}` : 'centre') : 'none',
    });
    for (const e of errs) issues.push({ level: 'error', ...e });
  }
  if (tr.crossings > 0) issues.push({ level: 'error', code: 'UFH-CROSS', msg: `Podvodkalar ${tr.crossings} joyda kesishadi` });
  for (const i of tr.issues ?? []) if (i.status !== 'LEAD_INTERSECTION') issues.push({ level: 'error', code: 'UFH-ROUTE', msg: i.msg ?? i.status });

  // ---- coverage of the heating area (U′: the corridor of the leads is not heating floor) ----
  // (the floor the leads occupy — their own pitch and clearance — is lead corridor, as the transit
  // corridor of 7B: not heating floor)
  const leadFloor = tr.leads.filter((q) => q.path.length >= 2).length ? G.bufferPolylines(tr.leads.filter((q) => q.path.length >= 2).map((q) => q.path), LEAD_SPACING + 0.02, 'butt', 'miter') : [];
  const Up = served.flatMap((rid) => (leadFloor.length ? G.difference(uOf[rid], leadFloor) : uOf[rid]));
  const heat = all.map((x) => G.simplifyPath(x.spiral.heating, 0.002));
  const band = heat.length ? G.bufferPolylines(heat, s / 2 + 0.003, 'round', 'round', 0.001) : [];
  const unc = band.length ? G.difference(Up, band) : Up;
  const area = G.area(Up);
  const holes = G.opening(unc, s / 2).map((q) => ({ area: G.area([q]), at: q.outer.reduce((a, v) => ({ x: a.x + v.x / q.outer.length, y: a.y + v.y / q.outer.length }), { x: 0, y: 0 }) })).sort((a, b) => b.area - a.area);
  const coverage = { ratio: area ? 1 - G.area(unc) / area : 0, area, coveredArea: area - G.area(unc), largestHole: holes[0]?.area ?? 0, holes: holes.slice(0, 20), zoneArea: G.area(Z), obstacleArea: G.area(obstacles) };
  if (coverage.ratio < (job.coverageMin ?? 0.85)) issues.push({ level: 'error', code: 'UFH-COV', msg: `Qamrov ${(coverage.ratio * 100).toFixed(1)} % < ${((job.coverageMin ?? 0.85) * 100).toFixed(0)} %` });
  if (coverage.largestHole > (job.maxHole ?? 0.5) + 1e-9) issues.push({ level: 'error', code: 'UFH-COV', msg: `Eng katta bo‘sh joy ${coverage.largestHole.toFixed(2)} m²` });
  onProgress('done', 1);
  return {
    version: UFH_PHASE6_ENGINE_VERSION,
    ok: loops.length > 0 && !issues.some((i) => i.level === 'error'),
    loops,
    issues,
    coverage,
    map: null,
    usable: Up,
    leads: tr.leads.map((l) => ({ loop: l.loop, kind: l.kind, path: l.path })),
    strategy: 'phase6_spiral',
    frameIndex: 0,
    repaired: false,
    tried: [],
    counts,
    ms: Date.now() - t0,
    params: { spacing: s, wallClearance, obstacleClearance, pipeType: pipe.id, maxLoop: Math.min(MAX_LOOP_M, job.maxLoop ?? MAX_LOOP_M), minBend: pipe.minBend, minBendAllowed: RMIN_CHECK },
  };

  function nameOf(rid) {
    return rooms.find((r) => r.id === rid)?.name ?? rid;
  }
}

/** Length of a room's leads from its entry door into the room (the transfer before the room). */
function toEntryOf(rooms, tr, rid) {
  const room = [{ outer: G.ccw(rooms.find((r) => r.id === rid).poly), holes: [] }];
  let m = 0;
  for (const l of tr.leads.filter((x) => x.room === rid && x.path.length >= 2)) {
    if (G.pointInRegion(l.path[0], room)) continue;
    let acc = 0;
    for (let k = 1; k < l.path.length; k++) {
      const a = l.path[k - 1];
      const b = l.path[k];
      if (G.pointInRegion(b, room) && G.distToRegionBoundary(b, room) > 1e-9) {
        let lo = 0;
        let hi = 1;
        for (let it = 0; it < 40; it++) {
          const md = (lo + hi) / 2;
          if (G.pointInRegion({ x: a.x + (b.x - a.x) * md, y: a.y + (b.y - a.y) * md }, room)) hi = md;
          else lo = md;
        }
        acc += Math.hypot(b.x - a.x, b.y - a.y) * hi;
        break;
      }
      acc += Math.hypot(b.x - a.x, b.y - a.y);
    }
    m = Math.max(m, acc);
  }
  return m;
}

const pathsCross = (A, B) => {
  if (A.length < 2 || B.length < 2) return false;
  for (let a = 1; a < A.length; a++) for (let b = 1; b < B.length; b++) if (G.segmentIntersection(A[a - 1], A[a], B[b - 1], B[b])) return true;
  return false;
};
