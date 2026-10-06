# Phase 6 reopen — room search: minimum valid loop count, joint terminal closure

Module: `src/engines/ufh/roomsearch.js`; opt-in in `planLeadAware(…, { roomSearch })`.
Tools: `tools/phase6r-roomsearch.mjs <room> [kMax] [timeLimit_ms]`,
`tools/phase6r-roomparts.mjs <out.json> ROOM=<search output>`.
Evidence: `docs/phase6r/evidence/roomsearch/`.

## Objective order

1. **PRIMARY — minimum VALID hydraulic loop count.** A loop is valid only if every hard limit holds:
   - total = heating + supply + return ≤ 60.000000000 m, with the drop (0.4 m per pipe) inside supply and return;
   - continuous two-path spiral; R ≥ RMIN;
   - wall and obstacle clearance;
   - its own piece covered ≥ 85 %;
   - largest gap ≤ MAX_LARGEST_GAP;
   - both ends on the room outline;
   - a valid terminal closure. A residual is allowed only in the terminal closure, along the side strip (PHASE6_REFERENCE_OK). A spiral without any residual (NA) is valid. A centre residual (MISMATCH) is not.
2. **SECONDARY — only within the minimum count**, in this order:
   - coverage;
   - largest gap;
   - side closure before none;
   - residual strip (uncovered floor);
   - real lead;
   - heating pipe;
   - balance.

An extra loop is never traded for coverage: the search stops at the first feasible k.

## Model and statuses

**Model.** Guillotine straight full cuts on the 0.05 m raster plus the polygon's vertex lines. The pieces may be notched. Each piece is one loop.

**Joint search per piece.** Every combination of:
- start corner;
- winding / orientation (normal and mirrored);
- terminal side;
- ρ — every rest width between parallel sides, with MIN ≤ ρ < s;
- closure mode — none, centre, or side;
- ring count;
- centre type.

**Pruning.** Only exact bounds are used:
- narrower than two rings plus the bends;
- no outline access;
- 85 % of the piece needs more pipe than 60 m minus its two shortest leads;
- the same bound for a piece that must hold k loops.

**Statuses.**

| Status | Meaning |
|---|---|
| PROVEN_INFEASIBLE | Below the continuous lower bound, for any geometry. |
| GRID_EXHAUSTIVE | Every partition of the model was searched and none is valid. This is not a proof outside the model. |
| PROVEN_FEASIBLE | A valid partition was built and measured. `secondaryOptimum` says whether the best one within that count was searched exhaustively. |
| SEARCH_NOT_EXHAUSTIVE | The time limit was reached. |
| NOT_RUN | Not searched. |

In `planLeadAware`, a room-search timeout with no valid partition is reported as SEARCH_NOT_EXHAUSTIVE, never as NO_VALID_SPIRAL.

## Why the old pieces could not be fixed in place

Final code, every joint variant of the old pieces: `old-pieces-joint-search.json`.

ρ is fixed by the piece geometry: ρ = (distance between parallel sides) mod s. The start corner, winding and terminal side only choose *where* the residual pass lies; they never change ρ.

Start corners whose supply or return end is not on the room outline are not generated (Phase 6 rule).

**LR.L1** (3.80 × 2.242)
- Rest widths: x {0}, y {0.042}. Side residual possible: **no** — 0.042 < MIN_RESIDUAL_CLOSURE_SPACING = 0.10.
- SEARCH_EXHAUSTIVE: **true** for the piece. 273 variants: starts 0/2/3, normal and mirrored, ρ 0.10–0.19 (centre), every side.
- Rejected:
  - largest gap > limit: 180;
  - centre residual (MISMATCH): 49;
  - total > 60 m: 39.
- Best centre variant: 98.1 %, gap 0, but MISMATCH, so not valid.
- Best valid variant: none, 92.8 %, gap 0.417.
- **Conclusion:** no side closure can exist in this piece. The fix is the room-level re-partition below.

**BR1.L1** (4.18 × 1.84)
- Rest widths: x {0.18}, y {0.04}.
- SEARCH_EXHAUSTIVE: **true**. 294 variants, 0 valid.
- Rejected:
  - gap > limit: 270;
  - centre residual: 24.
- side:right and side:left at ρ 0.18 are reference OK but leave a 0.596 / 0.601 m² gap, above MAX_LARGEST_GAP.
- **Conclusion:** no valid loop in this piece. Fixed by re-partition.

**BR1.L2** (notched)
- Rest widths: x {0.08, 0.10, 0.18}, y {0.04, 0.06, 0.18}.
- SEARCH_EXHAUSTIVE: **true**. 261 variants, 17 valid.
- side:left / bottom / top are reference OK but leave a 0.390–0.418 m² gap. side:right is MISMATCH.
- Best valid variant: none, 90.7 %, gap 0.385.
- **Conclusion:** within the old piece, no side closure removes the 0.39 m² patch. Fixed by re-partition.

## Room-level result (final code)

### BR1 — required regression (old 28.7 + 28.7 + 10.5 = 3 loops)

| k | status | detail |
|---|---|---|
| 1 | PROVEN_INFEASIBLE | continuous lower bound 2: needs 12.33 m², ≤ 55.50 m heating per loop |
| 2 | PROVEN_FEASIBLE | 157 partitions, 68 feasible, `secondaryOptimum` GRID_EXHAUSTIVE (726 s) |
| 3 | NOT_RUN | a smaller count is feasible, so 3 loops are rejected |

Rejected partitions at k=2 (first failing piece):

| Reason | Partitions |
|---|---|
| narrow | 26 |
| total > 60 m | 29 |
| coverage | 4 |
| gap | 10 |
| no spiral | 7 |
| length bound | 13 |

Selected loop count = minimum feasible count = **2**.

| loop | piece | start corner | orient. | terminal side | ρ | R min | heating | supply* | return* | drop | total | coverage | gap | uncovered | reference |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BR1.1 | 4.18 × 1.15 | 2 (6.22, 0.20) | ccw | top | 0.150 | 0.100 | 24.151 | 3.345 | 3.345 | 0.8 | 30.841 | 97.7 % | 0 | 0.111 | OK |
| BR1.2 | notched 9.69 m² | 3 (6.32, 3.78) | ccw | bottom | 0.150 | 0.100 | 46.846 | 5.025 | 5.425 | 0.8 | 57.296 | 95.7 % | 0 | 0.419 | OK |

\* Supply and return include the 0.4 m drop each. Total = heating + supply + return.

Rejected variants in the chosen pieces:

| Piece | Gap > limit | Centre residual | Total > 60 m |
|---|---|---|---|
| BR1.1 | 56 | 48 | — |
| BR1.2 | 117 | 105 | 56 |

### LR (old plan: 3 loops; LR.L1 MISMATCH)

| k | status | detail |
|---|---|---|
| 1 | PROVEN_INFEASIBLE | continuous lower bound 2: needs 15.61 m², ≤ 53.10 m heating per loop |
| 2 | GRID_EXHAUSTIVE | 194 partitions, 0 valid |
| 3 | PROVEN_FEASIBLE | 9654 partitions tested, 47 feasible; `secondaryOptimum` SEARCH_NOT_EXHAUSTIVE (5400 s time limit) |

Rejected partitions at k=2:

| Reason | Partitions |
|---|---|
| narrow | 26 |
| length bound | 100 |
| coverage | 2 |
| gap | 38 |
| no spiral | 23 |
| total > 60 m | 5 |

Selected loop count = minimum feasible count (in the model) = **3**. The count is proven: k=1 for any geometry, k=2 grid-exhaustive. Which 3-loop partition is best is *not* exhaustive.

| loop | piece | start corner | orient. | terminal side | ρ | R min | heating | supply* | return* | drop | total | coverage | gap | uncovered | reference |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| LR.1 | 1.80 × 4.00 | 1 (0.20, 4.10) | ccw | — (exact width, no residual) | — | 0.100 | 32.513 | 12.945 | 12.945 | 0.8 | 58.403 | 91.3 % | 0 | 0.623 | NA |
| LR.2 | 1.15 × 5.80 | 1 (2.00, 5.90) | ccw | right | 0.150 | 0.100 | 33.871 | 9.345 | 9.345 | 0.8 | 52.561 | 98.3 % | 0 | 0.111 | OK |
| LR.3 | notched 4.49 m² | 0 (3.90, 2.142) | cw | left | 0.142 | 0.100 | 22.169 | 3.687 | 3.803 | 0.8 | 29.659 | 93.3 % | 0 | 0.301 | OK |

Rejected variants in the chosen pieces:

| Piece | Gap > limit | Centre residual | Total > 60 m |
|---|---|---|---|
| LR.1 | 224 | 6 | 10 |
| LR.2 | 8 | 40 | — |
| LR.3 | 4 | — | — |

An earlier, shorter run (3000 s, before the pruning) found a different 3-loop partition, also all valid with OK/NA references: `LR-search-earlier-run.txt`.

### Status of the three failing reference cases

| case | outcome | SEARCH_EXHAUSTIVE |
|---|---|---|
| LR.L1 | Piece removed by the minimum-count re-partition. All 3 LR loops are valid, reference OK/NA. | count: yes (k=1 proven, k=2 grid); best-of-3: no |
| BR1.L1 | Piece removed. BR1 has 2 loops (old: 3), both reference OK. | yes (k=1 proven, k=2 grid-exhaustive best) |
| BR1.L2 | Piece removed. Same BR1 result. | yes |
