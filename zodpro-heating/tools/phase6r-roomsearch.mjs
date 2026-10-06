// Phase 6 reopen: the room search of one apartment room (minimum valid loop count, joint closure).
// node tools/phase6r-roomsearch.mjs <room> [kMax] [timeLimit_ms]
import fs from 'fs';
import { roomInputs } from './phase6r-eval.mjs';
import { leadBudget } from '../src/engines/ufh/leadaware.js';
import { searchRoom } from '../src/engines/ufh/roomsearch.js';
const fx = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/apartment-7b.json', import.meta.url)));
const inp = roomInputs(fx, { H: 3, LR: 3, BR1: 2, BA: 1, BR2: 2 });
const rid = process.argv[2];
const x = inp[rid];
console.log(rid, 's', x.s, 'toEntry', x.budget.toEntry_m.toFixed(3));
const { leadTo } = leadBudget(x.U, x.entry.at, x.budget);
const r = searchRoom(x.U, x.s, { leadTo, kMax: +(process.argv[3] ?? 3), timeLimit_ms: +(process.argv[4] ?? 1800000) });
console.log('ms', r.ms, 'raster', r.xs, r.ys, 'leafEvals', r.leafEvals, 'skipped', r.leafSkipped, 'bounds LB', r.bounds.FINAL_LOWER_BOUND);
for (const q of r.results) console.log(JSON.stringify({ k: q.k, status: q.status, tested: q.tested, feasible: q.feasible, ms: q.ms, reason: q.reason, secondaryOptimum: q.secondaryOptimum, rejected: q.rejectedPartitions }));
if (r.chosen) r.chosen.parts.forEach((p, i) => console.log('  part', i + 1, p.outer.map((q) => '(' + q.x.toFixed(3) + ',' + q.y.toFixed(3) + ')').join(' ')));
if (r.chosen) for (const row of r.chosen.rows) console.log('  loop', row.closure, 'rho', row.rho, 'start', row.start, 'mir', row.mirrored, 'centre', row.centre, 'heat', row.v.sp.heatingLength.toFixed(2), 'sup', row.supplyLead.toFixed(2), 'ret', row.returnLead.toFixed(2), 'total', row.total.toFixed(2), 'cov', (row.cover * 100).toFixed(1), 'gap', row.v.hole.toFixed(3), 'R', row.minR.toFixed(3), row.ref.status);
