// partitionsearch.js against brute force: no pruning rule (P1–P7) ever drops a partition that
// reaches the target, and LEAF / SLICE / PINWHEEL covers every partition into ≤ 6 rectangles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionSearch, pinwheelParts, modelComplete, SEARCH_OPTS_DEFAULT, SEARCH_OPTS_BASELINE } from '../src/engines/ufh/partitionsearch.js';
import { allPartitions, inGrammar, rng } from './helpers/partitions.js';

const P66 = allPartitions(6, 6, 6);
const touches = (p, n, m) => p[0] === 0 || p[1] === 0 || p[2] === n || p[3] === m;
const isGuillotine = (pieces, n, m) => inGrammar([0, 0, n, m], pieces, false);

test('lattice 6 × 6: 82 538 partitions into ≤ 6 rectangles — every one a LEAF / SLICE / PINWHEEL tree', () => {
  assert.equal(P66.length, 82538);
  let nonGuillotine = 0;
  for (const pieces of P66) {
    assert.ok(inGrammar([0, 0, 6, 6], pieces, true), JSON.stringify(pieces));
    if (!isGuillotine(pieces, 6, 6)) nonGuillotine++;
  }
  // ≤ 4 rectangles: all guillotine; 5: pinwheels exist
  for (const pieces of P66) if (pieces.length <= 4) assert.ok(isGuillotine(pieces, 6, 6));
  assert.ok(nonGuillotine > 0);
});

test('lead access (P7): every partition into ≤ 6 rectangles all touching the boundary is guillotine', () => {
  let walled = 0;
  for (const pieces of P66) {
    if (!pieces.every((p) => touches(p, 6, 6))) continue;
    walled++;
    assert.ok(isGuillotine(pieces, 6, 6), JSON.stringify(pieces));
  }
  assert.ok(walled > 1000);
  // and a non-guillotine one always has a piece off the boundary (the pinwheel centre)
  for (const pieces of P66) if (!isGuillotine(pieces, 6, 6)) assert.ok(pieces.some((p) => !touches(p, 6, 6)));
});

test('modelComplete: guillotine alone to k = 4, with pinwheels to k = 6, never above', () => {
  assert.equal(modelComplete(4, SEARCH_OPTS_BASELINE), true);
  assert.equal(modelComplete(5, SEARCH_OPTS_BASELINE), false);
  assert.equal(modelComplete(5, SEARCH_OPTS_DEFAULT), true);
  assert.equal(modelComplete(6, SEARCH_OPTS_DEFAULT), true);
  assert.equal(modelComplete(7, SEARCH_OPTS_DEFAULT), false);
});

// a random instance on the n × m lattice: leaf covers ≤ min(area, cap) (or null), the ub
// min(area, k·cap) valid for any partition; walls: a part off the boundary has no loop (−∞)
function instance(seed, n, m, { walls, nullShare = 0.15, minW = 1 }) {
  const r = rng(seed);
  const xs = Array.from({ length: n + 1 }, (_, i) => i);
  const ys = Array.from({ length: m + 1 }, (_, i) => i);
  const cap = 4 + r() * 8;
  const covers = new Map();
  const wallOk = (x0, y0, x1, y1) => !walls || x0 === 0 || y0 === 0 || x1 === n || y1 === m;
  const leafVal = (i0, j0, i1, j1) => {
    const k = `${i0},${j0},${i1},${j1}`;
    if (!covers.has(k)) {
      const w = i1 - i0;
      const h = j1 - j0;
      // (a function of the seed and the rectangle only — not of the order of the calls)
      const rr = rng(seed * 1000003 + ((i0 * 13 + j0) * 13 + i1) * 13 + j1);
      const ok = w >= minW && h >= minW && wallOk(i0, j0, i1, j1) && rr() >= nullShare;
      covers.set(k, ok ? Math.min(w * h * (0.6 + 0.4 * rr()), cap) : null);
    }
    return covers.get(k);
  };
  const leaf = (i0, j0, i1, j1) => {
    const c = leafVal(i0, j0, i1, j1);
    return c === null ? null : { cover: c, rect: [i0, j0, i1, j1] };
  };
  const ub = (x0, y0, x1, y1, k) => (wallOk(x0, y0, x1, y1) ? Math.min((x1 - x0) * (y1 - y0), k * cap) : -Infinity);
  const brute = (k, parts) => {
    let best = null;
    for (const pieces of parts) {
      if (pieces.length > k) continue;
      let s = 0;
      for (const p of pieces) {
        const c = leafVal(...p);
        if (c === null) {
          s = null;
          break;
        }
        s += c;
      }
      if (s !== null && (best === null || s > best)) best = s;
    }
    return best;
  };
  return { xs, ys, leaf, ub, brute, minW };
}

const COMBOS = [
  SEARCH_OPTS_BASELINE,
  { ...SEARCH_OPTS_BASELINE, leafGate: true },
  { ...SEARCH_OPTS_BASELINE, monotone: true },
  { ...SEARCH_OPTS_BASELINE, cutOrder: true },
  { ...SEARCH_OPTS_BASELINE, order: true },
  { ...SEARCH_OPTS_DEFAULT, pinwheel: false },
  SEARCH_OPTS_DEFAULT,
];

const GUILL66 = P66.filter((p) => isGuillotine(p, 6, 6));
// instances where a pinwheel beats every guillotine partition (k = 5 or 6) — the pinwheel branch
// must be exercised against brute force, not only the guillotine one
const PINWHEEL_SEEDS = [];
for (let seed = 100; PINWHEEL_SEEDS.length < 4 && seed < 600; seed++) {
  const I = instance(seed, 6, 6, { walls: false });
  if ([5, 6].some((k) => (I.brute(k, P66) ?? -1) > (I.brute(k, GUILL66) ?? -1) + 1e-9)) PINWHEEL_SEEDS.push(seed);
}

test('every pruning rule against brute force: same maximum cover, k = 1…6 (6 × 6 lattice, interior loops allowed)', () => {
  const guill = GUILL66;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, ...PINWHEEL_SEEDS]) {
    const I = instance(seed, 6, 6, { walls: false, minW: seed % 3 === 0 ? 2 : 1 });
    for (const opts of COMBOS) {
      // a fresh search per option set; the k loop shares its memo (as in loopproof.js)
      const S = partitionSearch({ xs: I.xs, ys: I.ys, minW: I.minW, leaf: I.leaf, ub: I.ub, opts, kMax: 8 });
      for (let k = 1; k <= 6; k++) {
        const want = I.brute(k, opts.pinwheel ? P66 : guill);
        const got = S.best(0, 0, 6, 6, k, -1e9)?.cover ?? null;
        assert.ok(want === null ? got === null : Math.abs(got - want) < 1e-9, `seed ${seed} k ${k} ${JSON.stringify(opts)}: ${got} vs ${want}`);
      }
    }
  }
});

test('decision form: best(R, k, t) is null exactly when the maximum < t (targets round the maximum, early stop)', () => {
  for (let seed = 21; seed <= 30; seed++) {
    const I = instance(seed, 6, 5, { walls: seed % 2 === 0 });
    const parts = allPartitions(6, 5, 6);
    for (let k = 1; k <= 6; k++) {
      const want = I.brute(k, parts);
      if (want === null) continue;
      for (const t of [want - 0.5, want - 1e-6, want, want + 1e-6, want + 0.5]) {
        const S = partitionSearch({ xs: I.xs, ys: I.ys, minW: 1, leaf: I.leaf, ub: I.ub, opts: { ...SEARCH_OPTS_DEFAULT, interiorAccess: seed % 2 !== 0 } });
        const got = S.best(0, 0, 6, 5, k, t, true);
        assert.equal(got !== null, want >= t - 1e-9, `seed ${seed} k ${k} t ${t}`);
        if (got) assert.ok(got.cover >= t - 1e-9 && got.parts.length <= k);
      }
    }
  }
});

test('P7 lead access: with wall-only loops the pinwheel shortcut equals the full pinwheel enumeration and brute force', () => {
  for (let seed = 41; seed <= 50; seed++) {
    const I = instance(seed, 6, 6, { walls: true, nullShare: 0.05 });
    const full = partitionSearch({ xs: I.xs, ys: I.ys, minW: 1, leaf: I.leaf, ub: I.ub, opts: { ...SEARCH_OPTS_DEFAULT, interiorAccess: true } });
    const cut = partitionSearch({ xs: I.xs, ys: I.ys, minW: 1, leaf: I.leaf, ub: I.ub, opts: SEARCH_OPTS_DEFAULT });
    for (let k = 5; k <= 6; k++) {
      const want = I.brute(k, P66);
      const a = full.best(0, 0, 6, 6, k, -1e9)?.cover ?? null;
      const b = cut.best(0, 0, 6, 6, k, -1e9)?.cover ?? null;
      assert.equal(a === null ? null : +a.toFixed(9), want === null ? null : +want.toFixed(9));
      assert.equal(b === null ? null : +b.toFixed(9), want === null ? null : +want.toFixed(9));
    }
    assert.ok(cut.stats.pinwheelLeadAccess > 0 && cut.stats.pinwheelOpened === 0);
  }
});

test('a pinwheel-only solution: guillotine search misses it, the pinwheel model finds it', () => {
  // only the five parts of one pinwheel of the 6 × 6 lattice carry a loop
  const P = pinwheelParts(0, 0, 6, 6, 2, 4, 2, 4, 0);
  const ok = new Set(P.map((p) => p.join(',')));
  const xs = [0, 1, 2, 3, 4, 5, 6];
  const leaf = (i0, j0, i1, j1) => (ok.has([i0, j0, i1, j1].join(',')) ? { cover: (i1 - i0) * (j1 - j0), rect: [i0, j0, i1, j1] } : null);
  const ub = (x0, y0, x1, y1) => (x1 - x0) * (y1 - y0);
  const g = partitionSearch({ xs, ys: xs, leaf, ub, opts: { ...SEARCH_OPTS_DEFAULT, pinwheel: false, interiorAccess: true } });
  const p = partitionSearch({ xs, ys: xs, leaf, ub, opts: { ...SEARCH_OPTS_DEFAULT, interiorAccess: true } });
  assert.equal(g.best(0, 0, 6, 6, 5, 36, true), null);
  const r = p.best(0, 0, 6, 6, 5, 36, true);
  assert.equal(r.cover, 36);
  assert.equal(r.parts.length, 5);
  // and with k = 6 (one loop to spare)
  assert.equal(p.best(0, 0, 6, 6, 6, 36, true).cover, 36);
});

test('search statistics are counted', () => {
  const I = instance(7, 6, 6, { walls: true });
  const S = partitionSearch({ xs: I.xs, ys: I.ys, minW: 1, leaf: I.leaf, ub: I.ub });
  S.best(0, 0, 6, 6, 6, -1e9);
  for (const c of ['generated', 'expanded', 'prunedSplitBound', 'feasible', 'splitsOpened', 'maxDepth', 'pinwheelChecked', 'pinwheelLeadAccess']) assert.ok(S.stats[c] > 0, c);
});

test('the oracle is sharp: pinwheel-winning instances exist and are checked, an unsafe bound is caught', () => {
  assert.equal(PINWHEEL_SEEDS.length, 4);
  let caught = 0;
  for (const seed of [1, 2, 3, 4, ...PINWHEEL_SEEDS]) {
    const I = instance(seed, 6, 6, { walls: false });
    // an unsafe rule (a bound 10 % too low) must make the search disagree somewhere
    const bad = partitionSearch({ xs: I.xs, ys: I.ys, minW: 1, leaf: I.leaf, ub: (...a) => 0.9 * I.ub(...a), opts: { ...SEARCH_OPTS_DEFAULT, interiorAccess: true } });
    for (let k = 2; k <= 6; k++) {
      const want = I.brute(k, P66);
      const got = bad.best(0, 0, 6, 6, k, -1e9)?.cover ?? null;
      if (want !== null && (got === null || Math.abs(got - want) > 1e-9)) caught++;
    }
  }
  // the pinwheel seeds: the guillotine-only search really gives less there
  for (const seed of PINWHEEL_SEEDS) {
    const I = instance(seed, 6, 6, { walls: false });
    const g = partitionSearch({ xs: I.xs, ys: I.ys, minW: 1, leaf: I.leaf, ub: I.ub, opts: { ...SEARCH_OPTS_DEFAULT, pinwheel: false, interiorAccess: true } });
    const p = partitionSearch({ xs: I.xs, ys: I.ys, minW: 1, leaf: I.leaf, ub: I.ub, opts: { ...SEARCH_OPTS_DEFAULT, interiorAccess: true } });
    assert.ok([5, 6].some((k) => (p.best(0, 0, 6, 6, k, -1e9)?.cover ?? -1) > (g.best(0, 0, 6, 6, k, -1e9)?.cover ?? -1) + 1e-9), `seed ${seed}`);
  }
  assert.ok(caught > 0, 'the unsafe bound went unnoticed');
});
