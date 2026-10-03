// Merges the root shards of a minimum loop count search (tools/ufh-proof-run.mjs … <i>/<n>):
//   node tools/ufh-proof-merge.mjs <out files…>
// Per k: PROVEN_FEASIBLE when a shard found and validated a partition; GRID_EXHAUSTIVE only when
// all n shards finished (no time limit) without one and the model is complete for k (≤ 6 with
// pinwheels); anything else SEARCH_NOT_EXHAUSTIVE.
import fs from 'fs';

export function mergeShards(runs) {
  const byK = new Map();
  for (const run of runs)
    for (const x of run.results) {
      if (typeof x.k !== 'number') continue;
      if (!byK.has(x.k)) byK.set(x.k, []);
      byK.get(x.k).push({ ...x, shard: run.shard });
    }
  const out = [];
  for (const [k, xs] of [...byK].sort((a, b) => a[0] - b[0])) {
    const n = xs.find((x) => x.shard)?.shard.n ?? 1;
    const found = xs.find((x) => x.status === 'PROVEN_FEASIBLE');
    const done = new Set(xs.filter((x) => x.status === 'SHARD_DONE_NOT_FOUND').map((x) => x.shard.i));
    let status;
    let completeness;
    if (found) {
      status = 'PROVEN_FEASIBLE';
      completeness = 'n/a (a solution)';
    } else if (done.size === n && xs.every((x) => x.modelComplete)) {
      status = 'GRID_EXHAUSTIVE';
      completeness = `all ${n} root shards searched completely; the model covers every partition into ≤ ${k} rectangles`;
    } else {
      status = 'SEARCH_NOT_EXHAUSTIVE';
      const missing = [...Array(n).keys()].filter((i) => !done.has(i));
      completeness = `root shards not finished: ${missing.map((i) => `${i + 1}/${n}`).join(', ') || '—'}${xs.some((x) => x.status === 'SEARCH_NOT_EXHAUSTIVE') ? ' (time limit)' : ''}`;
    }
    out.push({
      k,
      status,
      completeness,
      shards: xs.map((x) => ({ shard: x.shard, status: x.status, ms: x.ms, memory_MB: x.memory_MB })),
      wall_ms: Math.max(...xs.map((x) => x.ms)),
      cpu_ms: xs.reduce((a, x) => a + x.ms, 0),
      peak_MB: Math.max(...xs.map((x) => x.memory_MB)),
      solution: found ? { cover_m2: found.cover_m2, parts: found.parts, engineering: found.engineering, rebuildMatches: found.rebuildMatches } : null,
    });
  }
  return out;
}

if (process.argv[1]?.endsWith('ufh-proof-merge.mjs')) {
  const runs = process.argv.slice(2).flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.startsWith('RESULT ')).map((l) => JSON.parse(l.slice(7))));
  for (const m of mergeShards(runs)) console.log(JSON.stringify(m));
}
