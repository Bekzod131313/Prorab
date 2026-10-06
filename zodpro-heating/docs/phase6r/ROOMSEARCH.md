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

**Inputs.** Each room gets its inputs from 7B as they are: the usable area U′ and the transfer to the room's entry (`tools/phase6r-eval.mjs roomInputs`). Both depend on the apartment's loop counts through the transit corridor.

**Fixpoint.** All the results below use the counts H 2, LR 3, BR1 2, BA 1, BR2 2. The room searches give back exactly these counts.

**First pass.** The first pass used the old counts (H 3): `*-counts-H3.txt`. With H at 2 loops, the corridor in H changes. That moves H's U′ and adds 0.1 m to the transfers of BR1 and BA. LR and BR2 inputs are identical.

### BR1 — required regression (old 28.7 + 28.7 + 10.5 = 3 loops)

| k | status | detail |
|---|---|---|
| 1 | PROVEN_INFEASIBLE | continuous lower bound 2: needs 12.33 m², ≤ 55.30 m heating per loop |
| 2 | PROVEN_FEASIBLE | 157 partitions, 68 feasible, `secondaryOptimum` GRID_EXHAUSTIVE (735 s) |
| 3 | NOT_RUN | a smaller count is feasible, so 3 loops are rejected |

Rejected partitions at k=2 (first failing piece):

| Reason | Partitions |
|---|---|
| narrow | 26 |
| total > 60 m | 28 |
| coverage | 4 |
| gap | 10 |
| no spiral | 7 |
| length bound | 14 |

Selected loop count = minimum feasible count = **2**.

| loop | piece | start corner | orient. | terminal side | ρ | R min | heating | supply* | return* | drop | total | coverage | gap | uncovered | reference |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BR1.1 | 4.18 × 1.15 | 2 (6.22, 0.20) | ccw | top | 0.150 | 0.100 | 24.151 | 3.445 | 3.445 | 0.8 | 31.041 | 97.7 % | 0 | 0.111 | OK |
| BR1.2 | notched 9.69 m² | 3 (6.32, 3.78) | ccw | bottom | 0.150 | 0.100 | 46.846 | 5.125 | 5.525 | 0.8 | 57.496 | 95.7 % | 0 | 0.419 | OK |

\* Supply and return include the 0.4 m drop each. Total = heating + supply + return.

Rejected variants in the chosen pieces:

| Piece | Gap > limit | Centre residual | Total > 60 m |
|---|---|---|---|
| BR1.1 | 56 | 48 | — |
| BR1.2 | 115 | 105 | 58 |

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

### H, BA, BR2 (searched with the same model; their old loops were reference OK/NA)

| room | k=1 | k=2 | selected = minimum |
|---|---|---|---|
| H (old 3) | GRID_EXHAUSTIVE — no spiral of the whole polygon | PROVEN_FEASIBLE, 186 partitions, 7 feasible, best GRID_EXHAUSTIVE (225 s) | **2** |
| BA (old 1) | PROVEN_FEASIBLE, best GRID_EXHAUSTIVE | — | **1** |
| BR2 (old 2) | PROVEN_INFEASIBLE — lower bound 2 | PROVEN_FEASIBLE, 138 partitions, 55 feasible, best GRID_EXHAUSTIVE (452 s) | **2** |

All values are from the final code at the fixpoint counts, re-measured with `tools/phase6r-roomparts.mjs` (`chosen-loops.json`).

| loop | closure | ρ | R min | heating | supply* | return* | total | coverage | gap | uncovered | reference |
|---|---|---|---|---|---|---|---|---|---|---|---|
| H.1 | none | — | 0.100 | 36.138 | 3.798 | 4.198 | 44.134 | 88.6 % | 0.150 | 0.946 | NA |
| H.2 | side right | 0.18 | 0.100 | 11.217 | 7.290 | 7.690 | 26.197 | 95.7 % | 0 | 0.102 | OK |
| BA.1 | side right | 0.13 | 0.075 | 23.616 | 8.545 | 8.845 | 41.006 | 91.3 % | 0.024 | 0.341 | OK |
| BR2.1 | none | — | 0.0999 | 21.971 | 9.915 | 9.915 | 41.801 | 97.4 % | 0 | 0.120 | NA |
| BR2.2 | side top | 0.18 | 0.100 | 36.787 | 10.115 | 10.515 | 57.417 | 97.7 % | 0 | 0.172 | OK |

### Apartment

| | old | new |
|---|---|---|
| Loops | 11 (H 3, LR 3, BR1 2, BA 1, BR2 2) | **10** (H 2, LR 3, BR1 2, BA 1, BR2 2) |

- All 10 loops are LOOP_VALID.
- References: 7 OK, 3 NA, 0 MISMATCH.
- Max total 58.403 m (LR.1).
- Phase 6 geometry hash: `b53cce69636f23b7…`.

**7B routing (7B code unchanged), measured on these ends** — `apartment-connected.json`, `tools/phase6r-roomsearch-apartment.mjs`:

| Check | Result |
|---|---|
| Transfers | CORRIDOR_CAPACITY_EXCEEDED, LEAD_INTERSECTION |
| Lead crossings | 9 (lead-aware 11-loop plan: 19) |
| Lead ↔ heating clashes | 4 loops: H.1, LR.2, LR.3, BR2.1 (before: 5) |
| H.2 | LOOP_DISCONNECTED: the corridor in H has no capacity for its pair |
| Every other loop | LOOP_TOPOLOGY_VALID, 7B-measured total ≤ 60 m (max 57.93) |

The lead compatibility is not part of the room search's hard limits. It stays a reported FAIL for 7B to re-accept on the new Phase 6. It is not hidden.

### Status of the three failing reference cases

| case | outcome | SEARCH_EXHAUSTIVE |
|---|---|---|
| LR.L1 | Piece removed by the minimum-count re-partition. All 3 LR loops are valid, reference OK/NA. | count: yes (k=1 proven, k=2 grid); best-of-3: no |
| BR1.L1 | Piece removed. BR1 has 2 loops (old: 3), both reference OK. | yes (k=1 proven, k=2 grid-exhaustive best) |
| BR1.L2 | Piece removed. Same BR1 result. | yes |
