// Phase 6 reopen: the apartment from the room-search results (one search output per room, the
// lead-aware count fixpoint) — every chosen piece re-built and re-measured (evaluatePiece, final
// code), the loops validated, then 7B's routing (code as it is) connects the leads: crossings,
// clashes, topology and the real 60 m measured.
// node tools/phase6r-roomsearch-apartment.mjs <out.json> ROOM=<search output> ...
import fs from 'fs';
import * as G from '../src/engines/ufh/geom.js';
import { roomInputs, connectApartment, loopMetrics } from './phase6r-eval.mjs';
import { leadBudget } from '../src/engines/ufh/leadaware.js';
import { evaluatePiece, loopsOf } from '../src/engines/ufh/roomsearch.js';
import { referenceCheck } from '../src/engines/ufh/phase6reference.js';

const fx = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/apartment-7b.json', import.meta.url)));
const files = Object.fromEntries(process.argv.slice(3).map((a) => a.split('=')));
const counts = {};
const parsed = {};
for (const [rid, file] of Object.entries(files)) {
  const txt = fs.readFileSync(file, 'utf8');
  parsed[rid] = [...txt.matchAll(/^  part \d+ (.*)$/gm)].map((m) => ({ outer: [...m[1].matchAll(/\(([-\d.]+),([-\d.]+)\)/g)].map((q) => ({ x: +q[1], y: +q[2] })), holes: [] }));
  counts[rid] = parsed[rid].length;
}
const inp = roomInputs(fx, counts);
const plans = {};
const rows = {};
for (const [rid, parts] of Object.entries(parsed)) {
  const x = inp[rid];
  const { leadTo } = leadBudget(x.U, x.entry.at, x.budget);
  const room = [{ outer: G.asRegion(x.U)[0].outer, holes: [] }];
  const onWall = (q) => G.distToRegionBoundary(q, room) < 1e-6;
  const best = parts.map((pc) => evaluatePiece(pc, x.s, { exitOk: (q) => onWall(q.supply) && onWall(q.ret), edgeOk: (a, b) => onWall({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), leadTo, measure: 3 }).best);
  if (best.some((b) => !b)) throw new Error(`${rid}: a chosen piece has no valid loop with these inputs`);
  plans[rid] = { loops: loopsOf(best, parts, x.s, leadTo) };
  rows[rid] = plans[rid].loops.map((l) => ({ loopId: l.loopId, status: l.status, total_m: l.totalLength, failed: l.failed, ...l.search, reference: referenceCheck(l, x.s).status }));
}
const c = connectApartment(fx, plans);
const out = { counts: c.counts, hash: c.hash, rows, transfers: { status: c.transfers.status, reasons: c.transfers.reasons, crossings: c.transfers.crossings }, clashes: c.clashes, topology: c.report?.topology?.status, loopRows: c.report?.loopRows };
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log('counts', JSON.stringify(c.counts), 'total loops', Object.values(c.counts).reduce((a, b) => a + b, 0), 'hash', c.hash);
for (const [rid, r] of Object.entries(rows)) for (const l of r) console.log(rid, l.loopId, l.status, l.total_m.toFixed(3), l.closure, l.rho ?? '-', (l.coverage * 100).toFixed(1), l.largestGap_m2.toFixed(3), l.reference);
console.log('transfers', out.transfers.status, 'crossings', out.transfers.crossings, 'clashes', (out.clashes ?? []).length, 'topology', out.topology);
for (const w of out.loopRows ?? []) console.log(w.loop, 'total', w.total_m.toFixed(2), 'x', w.crossings, w.topology, w.reference.status, w.statuses.join(','));
