// Minimum loop count search of a debug case (rectangular region):
//   node --max-old-space-size=8000 tools/ufh-proof-run.mjs <case> <chosen> [grid] [limit_s|-] [k,k…] [default|guill|baseline] [cacheDir]
// The spiral variants of every (w, h, walls) rectangle are kept in <cacheDir>/variants-<hash>.jsonl
// (hash: the generator sources) — a later run (another k, another process) reuses them; the
// generators are deterministic, a cached list is the list a build gives.
import fs from 'fs';
import crypto from 'crypto';
import * as G from '../src/engines/ufh/geom.js';
import { proveLoopCount } from '../src/engines/ufh/loopproof.js';
import { SEARCH_OPTS_BASELINE, SEARCH_OPTS_DEFAULT } from '../src/engines/ufh/partitionsearch.js';
import { CASES, ZONE_101 } from './ufh-loops-debug.mjs';

const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const SOURCES = ['geom.js', 'spiralgen.js', 'obstaclespiral.js', 'closure.js', 'loopproof.js', 'criteria.js'];

export function diskCache(dir) {
  const h = crypto.createHash('sha1');
  for (const f of SOURCES) h.update(fs.readFileSync(new URL(`../src/engines/ufh/${f}`, import.meta.url)));
  const hash = h.digest('hex').slice(0, 12);
  fs.mkdirSync(dir, { recursive: true });
  const file = `${dir}/variants-${hash}.jsonl`;
  const map = new Map();
  if (fs.existsSync(file))
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const [k, v] = JSON.parse(line);
        map.set(k, v);
      } catch {
        // a torn line: that rectangle is built again
      }
    }
  const fd = fs.openSync(file, 'a');
  // other processes append to the same file: a miss reads what they added since (whole lines)
  let pos = fs.statSync(file).size;
  const refresh = () => {
    const size = fs.statSync(file).size;
    if (size <= pos) return;
    const buf = Buffer.alloc(size - pos);
    const rfd = fs.openSync(file, 'r');
    fs.readSync(rfd, buf, 0, buf.length, pos);
    fs.closeSync(rfd);
    const text = buf.toString('utf8');
    const end = text.lastIndexOf('\n');
    if (end < 0) return;
    for (const line of text.slice(0, end).split('\n')) {
      if (!line) continue;
      try {
        const [k, v] = JSON.parse(line);
        if (!map.has(k) || (v.closures && !map.get(k).closures)) map.set(k, v);
      } catch {
        // torn line: built again
      }
    }
    pos += Buffer.byteLength(text.slice(0, end + 1), 'utf8');
  };
  return {
    file,
    loaded: map.size,
    get: (k) => {
      if (!map.has(k)) refresh();
      return map.get(k);
    },
    set: (k, v) => {
      map.set(k, v);
      fs.writeSync(fd, JSON.stringify([k, v]) + '\n');
    },
  };
}

export function caseSetup(name) {
  let rect;
  let leadTo;
  if (name === '101') {
    const f = ZONE_101;
    const rm = f.rooms.find((r) => r.name === '101');
    const b = G.bbox(rm.poly);
    rect = { x0: b.x0 + f.wallClearance, y0: b.y0 + f.wallClearance, x1: b.x1 - f.wallClearance, y1: b.y1 - f.wallClearance };
    const door = (n) => f.doors.find((d) => d.name === n).at;
    const chain = [f.manifold.at, ...rm.via.map(door)];
    const base = chain.slice(1).reduce((a, q, i) => a + man(chain[i], q), 0);
    leadTo = (p) => base + man(chain[chain.length - 1], p);
  } else {
    const c = CASES[name];
    const b = G.bbox(c.zone);
    rect = { x0: b.x0 + 0.2, y0: b.y0 + 0.2, x1: b.x1 - 0.2, y1: b.y1 - 0.2 };
    leadTo = (p) => man(c.manifold.at, p);
  }
  const R = [{ x: rect.x0, y: rect.y0 }, { x: rect.x1, y: rect.y0 }, { x: rect.x1, y: rect.y1 }, { x: rect.x0, y: rect.y1 }];
  const onWall = (q) => G.distToRegionBoundary(q, [{ outer: R, holes: [] }]) < 1e-6;
  return { rect, s: 0.2, onWall, leadTo };
}

if (process.argv[1]?.endsWith('ufh-proof-run.mjs')) {
  const [name, chosen, grid, limit, kList, mode = 'default', cacheDir, shardArg] = process.argv.slice(2);
  const rootShard = shardArg ? { i: +shardArg.split('/')[0], n: +shardArg.split('/')[1] } : undefined;
  const searchOpts = mode === 'baseline' ? SEARCH_OPTS_BASELINE : mode === 'guill' ? { ...SEARCH_OPTS_DEFAULT, pinwheel: false } : SEARCH_OPTS_DEFAULT;
  const variantCache = cacheDir ? diskCache(cacheDir) : undefined;
  if (variantCache) console.log(`cache ${variantCache.file}: ${variantCache.loaded} rectangles`);
  const r = proveLoopCount({
    ...caseSetup(name),
    chosen: +chosen,
    grid: grid ? +grid : undefined,
    timeLimit_ms: limit && limit !== '-' ? +limit * 1000 : undefined,
    ks: kList ? kList.split(',').map(Number) : undefined,
    searchOpts,
    variantCache,
    rootShard,
    log: (x) => console.log(`  k ${x.k} ${x.status} ${x.ms} ms · ${x.search_model} · peak ${x.memory_MB} MB · memo ${x.memoEntries} · ${JSON.stringify(x.stats)}`),
  });
  console.log(name, JSON.stringify(r.bounds));
  for (const x of r.results) console.log(' ', x.k, x.status, `${x.ms} ms`, x.completeness ?? '', x.cover_m2?.toFixed(3) ?? '', x.parts ? JSON.stringify(x.parts.map((p) => [p.x0, p.y0, p.x1, p.y1, +p.total.toFixed(3), +p.cover.toFixed(3)])) : x.reason ?? '');
  console.log(JSON.stringify({ lower: r.minimum_loop_count_lower_bound, continuous: r.continuous_lower_bound, candidate: r.candidate_minimum, scope: r.proof_scope, provenGlobally: r.provenGlobally, provenWithinModel: r.provenWithinModel, stats: r.stats }));
  // one line for tools/ufh-proof-merge.mjs
  console.log('RESULT ' + JSON.stringify({ case: name, grid: r.stats.grid, mode, shard: rootShard ?? null, results: r.results.map((x) => ({ k: x.k, status: x.status, modelComplete: x.modelComplete, ms: x.ms, memory_MB: x.memory_MB, search_model: x.search_model, stats: x.stats, cover_m2: x.cover_m2, parts: x.parts, engineering: x.validation?.engineering, rebuildMatches: x.validation?.rebuildMatches })) }));
  for (const x of r.results) if (x.validation) console.log('  validation', x.k, JSON.stringify({ rebuildMatches: x.validation.rebuildMatches, engineering: x.validation.engineering, rows: x.validation.rows.map((q) => ({ ...q.values, ok: [q.length, q.coverage, q.largestGap, q.minRadius, q.total].join('') })) }));
}
