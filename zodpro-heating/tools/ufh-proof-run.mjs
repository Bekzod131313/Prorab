// Minimum loop count search of a debug case (rectangular region):
//   node --max-old-space-size=8000 tools/ufh-proof-run.mjs <case> <chosen> [grid] [limit_s|-] [k,k…] [default|guill|baseline] [cacheDir]
// The spiral variants of every (w, h, walls) rectangle are kept in <cacheDir>/variants-<hash>.jsonl
// (hash: the generator sources) — a later run (another k, another process) reuses them; the
// generators are deterministic, a cached list is the list a build gives.
import fs from 'fs';
import crypto from 'crypto';
import v8 from 'v8';
import * as G from '../src/engines/ufh/geom.js';
import { proveLoopCount } from '../src/engines/ufh/loopproof.js';
import { SEARCH_OPTS_BASELINE, SEARCH_OPTS_DEFAULT } from '../src/engines/ufh/partitionsearch.js';
import { CASES, ZONE_101 } from './ufh-loops-debug.mjs';

const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const SOURCES = ['geom.js', 'spiralgen.js', 'obstaclespiral.js', 'closure.js', 'loopproof.js', 'criteria.js'];

export function diskCache(dir) {
  const h = crypto.createHash('sha1');
  // (comment lines left out: a comment edit keeps the cache)
  for (const f of SOURCES) h.update(fs.readFileSync(new URL(`../src/engines/ufh/${f}`, import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n'));
  const hash = h.digest('hex').slice(0, 12);
  fs.mkdirSync(dir, { recursive: true });
  const file = `${dir}/variants-${hash}.jsonl`;
  if (!fs.existsSync(file)) fs.writeFileSync(file, '');
  // in memory only an index key → (offset, length) of its last line; a list is read from disk
  // when asked for (the whole file is hundreds of MB)
  const index = new Map();
  let pos = 0;
  const scan = () => {
    const size = fs.statSync(file).size;
    if (size <= pos) return;
    const rfd = fs.openSync(file, 'r');
    const CH = 1 << 24;
    let carry = Buffer.alloc(0);
    let at = pos;
    while (at < size) {
      const buf = Buffer.alloc(Math.min(CH, size - at));
      fs.readSync(rfd, buf, 0, buf.length, at);
      at += buf.length;
      let data = Buffer.concat([carry, buf]);
      let start = 0;
      for (let i = data.indexOf(10); i >= 0; i = data.indexOf(10, start)) {
        // a line: ["key",{…}]
        const lineStart = pos + start;
        const head = data.toString('utf8', start, Math.min(i, start + 200));
        const q = head.indexOf('",');
        if (head.startsWith('["') && q > 2) index.set(head.slice(2, q), { off: lineStart, len: i - start });
        start = i + 1;
      }
      carry = data.subarray(start);
      pos += start;
    }
    fs.closeSync(rfd);
  };
  scan();
  const loaded = index.size;
  const readAt = ({ off, len }) => {
    const buf = Buffer.alloc(len);
    const rfd = fs.openSync(file, 'r');
    fs.readSync(rfd, buf, 0, len, off);
    fs.closeSync(rfd);
    try {
      return JSON.parse(buf.toString('utf8'))[1];
    } catch {
      return undefined; // a torn line: built again
    }
  };
  const fd = fs.openSync(file, 'a');
  return {
    file,
    loaded,
    get: (k) => {
      if (!index.has(k)) scan(); // (other processes append to the same file)
      const e = index.get(k);
      return e ? readAt(e) : undefined;
    },
    set: (k, v) => {
      const line = JSON.stringify([k, v]) + '\n';
      fs.writeSync(fd, line);
      // (indexed on the next scan — this process keeps the entry itself in its own memo)
    },
  };
}

// the resumable root of one search (case, k, raster, need, model, code): every root split
// searched to the end is appended to <dir>/root-….jsonl; later runs and parallel shards skip them
export function rootProgress(dir, id) {
  const h = crypto.createHash('sha1');
  for (const f of [...SOURCES, 'partitionsearch.js']) h.update(fs.readFileSync(new URL(`../src/engines/ufh/${f}`, import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n'));
  h.update(fs.readFileSync(new URL('./ufh-loops-debug.mjs', import.meta.url))); // (the cases)
  h.update(id);
  const file = `${dir}/root-${id.replace(/[^A-Za-z0-9_.-]+/g, '_')}-${h.digest('hex').slice(0, 12)}.jsonl`;
  fs.mkdirSync(dir, { recursive: true });
  const read = () => {
    const st = { n: null, leaf: false, pinwheel: false, splits: new Set(), runs: 0 };
    if (!fs.existsSync(file)) return st;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      if (e.type === 'splits') st.n = e.n;
      else if (e.type === 'start') st.runs++;
      else if (e.type === 'leaf') st.leaf = true;
      else if (e.type === 'pinwheel') st.pinwheel = true;
      else if (e.type === 'split') st.splits.add(e.si);
    }
    return st;
  };
  const st0 = read();
  const skip = new Set([...st0.splits, ...(st0.leaf ? ['leaf'] : []), ...(st0.pinwheel ? ['pinwheel'] : [])]);
  const fd = fs.openSync(file, 'a');
  fs.writeSync(fd, JSON.stringify({ type: 'start', at: new Date().toISOString() }) + '\n');
  return {
    file,
    skip,
    onEvent: (e) => fs.writeSync(fd, JSON.stringify(e) + '\n'),
    progress: () => {
      const s = read();
      const done = s.n === null ? 0 : [...s.splits].filter((i) => i < s.n).length;
      return { file, n: s.n, done, leaf: s.leaf, pinwheel: s.pinwheel, runs: s.runs, complete: s.n !== null && done === s.n && s.leaf && s.pinwheel };
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
    heapLimit_MB: v8.getHeapStatistics().heap_size_limit / 1048576,
    // (with a cache dir: the root is resumable — progress kept next to the cache)
    rootFor: cacheDir ? (k) => rootProgress(cacheDir, `${name}-k${k}-g${grid ?? 'default'}-${mode}`) : undefined,
    log: (x) => console.log(`  k ${x.k} ${x.status} ${x.ms} ms · ${x.search_model} · peak ${x.memory_MB} MB · memo ${x.memoEntries} · ${JSON.stringify(x.stats)}`),
  });
  console.log(name, JSON.stringify(r.bounds));
  for (const x of r.results) console.log(' ', x.k, x.status, `${x.ms} ms`, x.completeness ?? '', x.cover_m2?.toFixed(3) ?? '', x.parts ? JSON.stringify(x.parts.map((p) => [p.x0, p.y0, p.x1, p.y1, +p.total.toFixed(3), +p.cover.toFixed(3)])) : x.reason ?? '');
  console.log(JSON.stringify({ lower: r.minimum_loop_count_lower_bound, continuous: r.continuous_lower_bound, candidate: r.candidate_minimum, scope: r.proof_scope, provenGlobally: r.provenGlobally, provenWithinModel: r.provenWithinModel, stats: r.stats }));
  // one line for tools/ufh-proof-merge.mjs
  console.log('RESULT ' + JSON.stringify({ case: name, grid: r.stats.grid, mode, shard: rootShard ?? null, results: r.results.map((x) => ({ k: x.k, status: x.status, root: x.root, modelComplete: x.modelComplete, ms: x.ms, memory_MB: x.memory_MB, search_model: x.search_model, stats: x.stats, cover_m2: x.cover_m2, parts: x.parts, engineering: x.validation?.engineering, rebuildMatches: x.validation?.rebuildMatches })) }));
  for (const x of r.results) if (x.validation) console.log('  validation', x.k, JSON.stringify({ rebuildMatches: x.validation.rebuildMatches, engineering: x.validation.engineering, rows: x.validation.rows.map((q) => ({ ...q.values, ok: [q.length, q.coverage, q.largestGap, q.minRadius, q.total].join('') })) }));
}
