// Phase 6 reopen: re-measure the chosen parts of room-search outputs (every report field).
// node tools/phase6r-roomparts.mjs <out.json> ROOM=<search output> ...
import fs from 'fs';
import * as G from '../src/engines/ufh/geom.js';
import { roomInputs } from './phase6r-eval.mjs';
import { leadBudget } from '../src/engines/ufh/leadaware.js';
import { evaluatePiece } from '../src/engines/ufh/roomsearch.js';
const fx = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/apartment-7b.json', import.meta.url)));
const inp = roomInputs(fx, process.env.COUNTS ? JSON.parse(process.env.COUNTS) : { H: 2, LR: 3, BR1: 2, BA: 1, BR2: 2 });
const out = {};
for (const [rid, file] of process.argv.slice(3).map((a) => a.split('='))) {
  const x = inp[rid];
  const { leadTo } = leadBudget(x.U, x.entry.at, x.budget);
  const room = [{ outer: G.asRegion(x.U)[0].outer, holes: [] }];
  const onWall = (q) => G.distToRegionBoundary(q, room) < 1e-6;
  const txt = fs.readFileSync(file, 'utf8');
  const parts = [...txt.matchAll(/^  part \d+ (.*)$/gm)].map((m) => ({ outer: [...m[1].matchAll(/\(([-\d.]+),([-\d.]+)\)/g)].map((q) => ({ x: +q[1], y: +q[2] })), holes: [] }));
  out[rid] = { s: x.s, toEntry_m: x.budget.toEntry_m, drop_m: x.budget.drop_m, search: txt.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)), loops: [] };
  parts.forEach((pc, i) => {
    const e = evaluatePiece(pc, x.s, { exitOk: (q) => onWall(q.supply) && onWall(q.ret), edgeOk: (a, b) => onWall({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), leadTo, measure: 3 });
    const b = e.best;
    const sp = b.v.sp;
    // the orientation: the winding of the supply path (+1 ccw, −1 cw) — and the mirror flag
    const P = sp.path;
    let w = 0;
    for (let k = 1; k + 1 < Math.min(P.length, 60); k++) w += (P[k].x - P[k - 1].x) * (P[k + 1].y - P[k].y) - (P[k].y - P[k - 1].y) * (P[k + 1].x - P[k].x);
    const fam = {};
    for (const r of e.valid) fam[r.closure] = (fam[r.closure] ?? 0) + 1;
    out[rid].loops.push({
      part: i + 1,
      polygon: pc.outer.map((p) => [p.x, p.y]),
      area_m2: +e.area.toFixed(3),
      restWidths: e.rest,
      variantsTested: e.variants,
      validVariants: e.valid.length,
      validByClosure: fam,
      rejected: e.rejected,
      chosen: {
        startCorner: sp.start, startPoint: sp.supply, mirrored: b.mirrored, orientation: w > 0 ? 'ccw' : 'cw',
        closure: b.closure, terminalSide: sp.residual?.side ?? null, rho: b.rho, centre: sp.centre,
        terminal: sp.residual?.terminal ?? null,
        minBendRadius_m: +b.minR.toFixed(4),
        heating_m: +sp.heatingLength.toFixed(3), supply_m: +b.supplyLead.toFixed(3), return_m: +b.returnLead.toFixed(3), drop_m: 2 * x.budget.drop_m, total_m: +b.total.toFixed(3),
        coverage: +b.cover.toFixed(4), largestGap_m2: +b.v.hole.toFixed(3), uncovered_m2: +b.v.uncovered.toFixed(3), reference: b.ref.status,
      },
    });
    console.log(rid, i + 1, JSON.stringify(out[rid].loops.at(-1).chosen), JSON.stringify(e.rejected), JSON.stringify(fam));
  });
}
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
