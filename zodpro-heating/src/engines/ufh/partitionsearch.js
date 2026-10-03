// UFH Coverage Router — step 6: the partition search behind the minimum loop count (loopproof.js).
//
// best(R, k, target): the MAXIMUM cover of the rectangle R (indices into the cut rasters xs / ys)
// by at most k loops, one loop per part of a partition of R into rectangles, when it is ≥ target,
// else null. leaf(part) is the best cover one loop gives in that part (null: none valid);
// ub(rect, k) an upper bound of the cover k loops can give in rect (it must hold for any partition).
//
// SEARCH MODEL — a part of R is
//   LEAF       one loop
//   SLICE      a guillotine cut (x or y) into two parts, each searched again
//   PINWHEEL   (k ≥ 5) four arms round a centre rectangle, each of the five searched again —
//              the only non-guillotine way to cut a rectangle into 5; every partition into ≤ 6
//              rectangles is a LEAF / SLICE / PINWHEEL tree (tests/ufh-partitionsearch.test.js
//              checks it on all 82 538 partitions of the 6 × 6 lattice; a partition into k
//              rectangles has ≤ k − 1 distinct inner x and y edges, so the k × k lattice holds
//              every combinatorial type)
//   so for k ≤ 6 with pinwheels the search covers every rectangle partition on the raster.
//
// PRUNING — each rule is exact (it never drops a partition that could reach the target):
//   P1 node bound       ub(R, k) < target                          → no partition of R reaches it
//   P2 split bound      ub(A, k1) + ub(B, k2) ≤ best so far         → this split cannot improve
//   P3 leaf gate        ub(R, 1) < target: the single loop of R cannot reach the target, and it
//                       cannot raise the best either (every returned value is ≥ target) — R's
//                       spirals are not built
//   P4 memo             (R, k, side) solved: exact maximum, or "below t" (the maximum < t)
//   P5 monotone in k    "≤ k loops" — max(R, k) ≤ max(R, k') for k ≤ k'; and the canonical
//                       subset (P6) ≤ the full set: a "below t" for (R, k', any) answers (R, k)
//   P6 cut order        a partition whose top cut is along x may have several full cuts along x;
//                       only the one with the first part A cut no further along x at its top
//                       level is opened (A's own top x-cut would be a full cut of R left of it).
//                       Every guillotine partition keeps exactly one such representation.
//   P7 lead access      (pinwheels) the centre of a pinwheel touches no wall of R; a loop whose
//                       part touches no region wall has no lead route (its leads would cross or
//                       squeeze between other loops' pipes) — ub = −∞, so every pinwheel is
//                       infeasible when interiorAccess is off. Checked on the real ub, not assumed.
//   ordering            splits are opened in decreasing ub(A) + ub(B) (no effect on the result)

const EPS = 1e-9;

export const SEARCH_OPTS_DEFAULT = Object.freeze({ leafGate: true, monotone: true, cutOrder: true, order: true, pinwheel: true, interiorAccess: false });
export const SEARCH_OPTS_BASELINE = Object.freeze({ leafGate: false, monotone: false, cutOrder: false, order: false, pinwheel: false, interiorAccess: false });

/** Every composition of k into n parts ≥ 1. */
function compositions(k, n) {
  if (n === 1) return k >= 1 ? [[k]] : [];
  const out = [];
  for (let a = 1; a <= k - n + 1; a++) for (const rest of compositions(k - a, n - 1)) out.push([a, ...rest]);
  return out;
}

/** The five parts of a pinwheel of [i0,i1] × [j0,j1] with centre [a,b] × [c,d]; turn 0 / 1 (mirror). */
export function pinwheelParts(i0, j0, i1, j1, a, b, c, d, turn) {
  return turn === 0
    ? [[i0, j0, b, c], [b, j0, i1, d], [a, d, i1, j1], [i0, c, a, j1], [a, c, b, d]]
    : [[a, j0, i1, c], [i0, j0, a, d], [i0, d, b, j1], [b, c, i1, j1], [a, c, b, d]];
}

export function partitionSearch(o) {
  const { xs, ys, leaf, ub } = o;
  const minW = o.minW ?? 0;
  const opt = { ...SEARCH_OPTS_DEFAULT, ...(o.opts ?? {}) };
  const kMax = o.kMax ?? 16;
  const now = o.now ?? (() => Date.now());
  const st = o.stats ?? {};
  for (const c of ['generated', 'expanded', 'prunedNodeBound', 'prunedSplitBound', 'prunedMonotone', 'leafGated', 'memoExact', 'memoBelow', 'reexpanded', 'feasible', 'splitsOpened', 'cutOrderSkipped', 'pinwheelChecked', 'pinwheelLeadAccess', 'pinwheelOpened', 'maxDepth']) st[c] = st[c] ?? 0;
  const NX = xs.length;
  const NY = ys.length;
  // numeric memo keys: (i0, i1, j0, j1, k, side)
  const key = (i0, j0, i1, j1, k, side) => ((((i0 * NX + i1) * NY + j0) * NY + j1) * (kMax + 1) + k) * 3 + side;
  const memo = new Map();
  let deadline = Infinity;
  let timedOut = false;
  const fits = (i0, j0, i1, j1) => xs[i1] - xs[i0] >= minW - EPS && ys[j1] - ys[j0] >= minW - EPS;
  const U = (r, k) => ub(xs[r[0]], ys[r[1]], xs[r[2]], ys[r[3]], k);

  // P5: a known "below" for (R, k' ≥ k, the full side or the same side) bounds (R, k, side)
  const monotoneBelow = (i0, j0, i1, j1, k, side, target) => {
    for (let k2 = k; k2 <= kMax; k2++)
      for (const s2 of side === 0 ? [0] : [0, side]) {
        if (k2 === k && s2 === side) continue;
        const m = memo.get(key(i0, j0, i1, j1, k2, s2));
        if (!m) continue;
        if (m.below !== undefined && target >= m.below - EPS) return true;
        if (m.exact && m.exact.cover < target - EPS) return true;
      }
    return false;
  };

  // side: 0 any top cut, 1 no top x-cut, 2 no top y-cut (P6)
  const best = (i0, j0, i1, j1, k, target, early = false, side = 0, depth = 0) => {
    if (now() > deadline) {
      timedOut = true;
      return null;
    }
    st.generated++;
    if (depth > st.maxDepth) st.maxDepth = depth;
    const R = [i0, j0, i1, j1];
    if (U(R, k) < target - EPS) {
      st.prunedNodeBound++;
      return null;
    }
    const kk = key(i0, j0, i1, j1, k, side);
    const m = memo.get(kk);
    if (m) {
      if (m.exact) {
        st.memoExact++;
        return m.exact.cover >= target - EPS ? m.exact : null;
      }
      if (target >= m.below - EPS) {
        st.memoBelow++;
        return null;
      }
      st.reexpanded++;
    }
    if (opt.monotone && monotoneBelow(i0, j0, i1, j1, k, side, target)) {
      st.prunedMonotone++;
      return null;
    }
    st.expanded++;
    let top = null;
    if (!opt.leafGate || U(R, 1) >= target - EPS) {
      const lf = leaf(i0, j0, i1, j1);
      if (lf) top = { cover: lf.cover, parts: [lf] };
    } else st.leafGated++;
    const bar = () => Math.max(target, top ? top.cover : -Infinity);
    let complete = true;
    if (k > 1) {
      const splits = [];
      for (const ax of ['x', 'y']) {
        if (opt.cutOrder && ((ax === 'x' && side === 1) || (ax === 'y' && side === 2))) {
          st.cutOrderSkipped++;
          continue;
        }
        const lo = ax === 'x' ? i0 : j0;
        const hi = ax === 'x' ? i1 : j1;
        const vs = ax === 'x' ? xs : ys;
        for (let c = lo + 1; c < hi; c++) {
          if (vs[c] - vs[lo] < minW - EPS || vs[hi] - vs[c] < minW - EPS) continue;
          const A = ax === 'x' ? [i0, j0, c, j1] : [i0, j0, i1, c];
          const B = ax === 'x' ? [c, j0, i1, j1] : [i0, c, i1, j1];
          for (let k1 = 1; k1 < k; k1++) {
            const ubA = U(A, k1);
            const ubB = U(B, k - k1);
            splits.push({ A, B, k1, ubA, ubB, sideA: opt.cutOrder ? (ax === 'x' ? 1 : 2) : 0 });
          }
        }
      }
      if (opt.order) splits.sort((p, q) => q.ubA + q.ubB - (p.ubA + p.ubB));
      for (const sp of splits) {
        const { A, B, k1, ubA, ubB } = sp;
        if (ubA + ubB <= bar() + EPS && !(top === null && ubA + ubB >= target - EPS)) {
          st.prunedSplitBound++;
          continue;
        }
        st.splitsOpened++;
        const a = best(...A, k1, bar() - ubB, false, sp.sideA, depth + 1);
        if (timedOut) {
          complete = false;
          break;
        }
        if (!a) continue;
        const b2 = best(...B, k - k1, bar() - a.cover, false, 0, depth + 1);
        if (timedOut) {
          complete = false;
          break;
        }
        if (!b2) continue;
        if (!top || a.cover + b2.cover > top.cover + EPS) top = { cover: a.cover + b2.cover, parts: [...a.parts, ...b2.parts] };
        if (early && top.cover >= target - EPS) break;
      }
      // PINWHEEL (k ≥ 5): four arms + a centre, every part ≥ minW wide
      if (complete && opt.pinwheel && k >= 5 && !(early && top && top.cover >= target - EPS)) {
        const comps = compositions(k, 5);
        st.pinwheelChecked++;
        // P7: the centre is interior to R — check its bound on the real ub (smallest centre: the
        // largest bound any centre could have is still that of a strictly interior part)
        let centreFeasible = true;
        if (!opt.interiorAccess) {
          // every centre [a,b]×[c,d] lies strictly inside R; ub of an interior part: probe the
          // ones touching R's corners' neighbourhood — all must be −∞ for the lemma to apply
          const probe = [];
          for (let a = i0 + 1; a < i1; a++) if (xs[a] - xs[i0] >= minW - EPS) { probe.push(a); break; }
          let pb = null;
          for (let b = i1 - 1; b > i0; b--) if (xs[i1] - xs[b] >= minW - EPS) { pb = b; break; }
          let pc = null;
          for (let c = j0 + 1; c < j1; c++) if (ys[c] - ys[j0] >= minW - EPS) { pc = c; break; }
          let pd = null;
          for (let d = j1 - 1; d > j0; d--) if (ys[j1] - ys[d] >= minW - EPS) { pd = d; break; }
          // the largest possible centre: if even it has ub −∞ for every k, all smaller ones do
          // (a wall-less part stays wall-less when it shrinks)
          if (probe.length && pb !== null && pc !== null && pd !== null && probe[0] < pb && pc < pd) {
            const big = [probe[0], pc, pb, pd];
            centreFeasible = comps.some((cp) => U(big, cp[4]) > -Infinity);
          } else centreFeasible = false; // no room for a pinwheel at all
          if (!centreFeasible) st.pinwheelLeadAccess++;
        }
        if (centreFeasible)
          outer: for (const cp of comps)
            for (let turn = 0; turn < 2; turn++)
              for (let a = i0 + 1; a < i1; a++)
                for (let b = a + 1; b < i1; b++)
                  for (let c = j0 + 1; c < j1; c++)
                    for (let d = c + 1; d < j1; d++) {
                      const P = pinwheelParts(i0, j0, i1, j1, a, b, c, d, turn);
                      if (!P.every((p) => fits(...p))) continue;
                      const ubs = P.map((p, i) => U(p, cp[i]));
                      let rest = ubs.reduce((x, y) => x + y, 0);
                      if (rest <= bar() + EPS && !(top === null && rest >= target - EPS)) {
                        st.prunedSplitBound++;
                        continue;
                      }
                      st.pinwheelOpened++;
                      // the centre first (the most constrained), then the arms
                      const order = [4, 0, 1, 2, 3];
                      let got = 0;
                      const parts = [];
                      let ok = true;
                      for (const i of order) {
                        rest -= ubs[i];
                        const r = best(...P[i], cp[i], bar() - got - rest, false, 0, depth + 1);
                        if (timedOut) {
                          complete = false;
                          break outer;
                        }
                        if (!r) {
                          ok = false;
                          break;
                        }
                        got += r.cover;
                        parts.push(...r.parts);
                      }
                      if (ok && (!top || got > top.cover + EPS)) top = { cover: got, parts };
                      if (ok && early && top.cover >= target - EPS) break outer;
                    }
      }
    }
    if (timedOut && !complete) return top && top.cover >= target - EPS ? top : null;
    if (!early || !top || top.cover < target - EPS) {
      if (top && top.cover >= target - EPS) memo.set(kk, { exact: top });
      else memo.set(kk, { below: Math.min(m?.below ?? Infinity, top ? Math.max(target, top.cover + EPS) : target) });
    }
    if (top && top.cover >= target - EPS) st.feasible++;
    return top && top.cover >= target - EPS ? top : null;
  };
  return {
    best,
    setDeadline: (t) => {
      deadline = t;
      timedOut = false;
    },
    timedOut: () => timedOut,
    memoSize: () => memo.size,
    opts: opt,
    stats: st,
  };
}

/** Which partitions the model covers completely: k ≤ 4 guillotine alone, k ≤ 6 with pinwheels. */
export function modelComplete(k, opts) {
  const o = { ...SEARCH_OPTS_DEFAULT, ...(opts ?? {}) };
  return k <= 4 || (o.pinwheel && k <= 6);
}
