// UFH Coverage Router — what is checked where. Two different questions, kept apart:
//
//   GEOMETRY_TEST_COVERAGE_SINGLE_REGION / _MULTI_REGION
//                                does the spiral generator fill its region(s)? A self-check of the raw
//                                geometry (heating pipe only). Not a design approval.
//   ENGINEERING_FINAL_COVERAGE   the final engineering validation of a whole zone. It passes only
//                                with ALL of ENGINEERING_FINAL_CHECKS — heating pipe coverage and
//                                uncovered polygons, spacing, clearance, bend radius, loop length
//                                (supply + heating + return ≤ 60 m) and the manifold connection.
//
// A raw spiral (kind 'RAW_SPIRAL') is geometry, never a valid heating loop by itself.
// REGION ≠ LOOP: a region is an area with one raw spiral; a loop is a hydraulic circuit (manifold
// supply → heating → return, ≤ 60 m). The loop length planner (phase 6) makes loops of regions —
// one region may become 1, 2 or 3 loops. Nothing before it calls a region a loop.
export const RMIN_CHECK = 0.068; // PE-RT 16×2.0: cold bending radius 80 mm − 15 %
export const SPACING_TOL = 0.002; // m: pipes never closer than s − 2 mm (numeric only)

import { UFH_RULES } from './validate.js';

export const GEOMETRY_TEST_COVERAGE_SINGLE_REGION = 0.95;
export const GEOMETRY_TEST_MAX_HOLE = 0.5; // m²
// several spiral regions: each cut between two regions and each corner of a region leaves slivers
// the spirals' bands do not reach (s√2 at corners), so the geometry self-check of a decomposed area
// is one point lower
export const GEOMETRY_TEST_COVERAGE_MULTI_REGION = 0.94;

export const ENGINEERING_FINAL_COVERAGE = UFH_RULES.coverageMin; // 0.85, heating pipe only
export const ENGINEERING_FINAL_MAX_HOLE = UFH_RULES.maxHole; // m²
export const ENGINEERING_FINAL_CHECKS = ['heating_coverage', 'uncovered_polygons', 'spacing', 'clearance', 'bend_radius', 'loop_length_60m', 'manifold_connection'];
export const MAX_LOOP_M = 60;
// ---- step 6: loop planner ----
// loop total (supply + heating + return) ≤ MAX_LOOP_M exactly; the only tolerance is the floating
// point representation of a sum of lengths (1 nm) — 60.0001 m is never 60
export const LOOP_LENGTH_EPS = 1e-9;
// a loop within this much of 60 m is flagged LOW_MARGIN (a warning, not invalid): its leads are
// estimated routes (rectilinear, through the doors) — the real lead routing (step 7: risers,
// manifold connections, bends) may add pipe
export const LOOP_LOW_MARGIN_M = 0.25;
// a search candidate (numbers only) and its rebuilt geometry must agree within these: lengths to
// floating point; areas to 1 cm² (Clipper's 0.1 mm integer grid — the same pipe measured on the
// region outline started at another vertex differs by ~0.1 cm²); the min radius to 2 mm (measured
// on the polyline: 3-point circumradius over 40 mm of the 4 mm arc steps)
export const REBUILD_TOL = { length_m: 1e-9, area_m2: 1e-4, radius_m: 0.002 };
// raster of the cuts in the exhaustive minimum-loop-count search (loopproof.js) — the resolution
// a "PROVEN_INFEASIBLE" refers to
export const LOOP_CUT_GRID = 0.05;
// the loop planner also tries two rows of strips (squarer loops) when the strips alone leave more
// uncovered than this share of the region (search effort only, no acceptance criterion)
export const ROWS_TRY_UNCOVERED_SHARE = 0.03;


/**
 * Known limitations — kept visible (tests assert the current numbers so any change is noticed);
 * to be removed by the modules named.
 */
export const KNOWN_LIMITATIONS = [
  // the phase-1 generator alone (spiralgen) keeps these centre gaps; the zone router closes them
  // with the CENTER CLOSURE OPTIMIZER (closure.js, phase 5): C1 / C2 → largest patch 0.00 m²
  { id: 'centre_gap_square_3_5', case: '3.5 × 3.5 m, s 200 mm', centreGap_m2: 0.2, fixBy: 'closed in spiralRegions by closure.js (phase 5) — generator alone only' },
  { id: 'centre_gap_square_3_5_s150', case: '3.5 × 3.5 m, s 150 mm', centreGap_m2: 0.27, fixBy: 'closed in spiralRegions by closure.js (phase 5) — generator alone only' },
  // (centre_gap_U3, obstacle_near_wall_U9: solved in phase 4 — spirals round / beside the column)
  { id: 'narrow_corridor_0_9_U', case: 'U4b', invalidRegion: '0.9 m arm: no two-pipe spiral with R ≥ 100 mm fits', fixBy: 'obstacle-aware / local spiral (phases 4–5)' },
  { id: 'narrow_corridor_0_9', case: 'L4b', invalidRegion: '0.9 m corridor: no two-pipe spiral with R ≥ 100 mm fits', fixBy: 'obstacle-aware / local spiral (phases 4–5)' },
  // (obstacle_centre_O10: solved in phase 5 — residual closure 150 mm round the column, 98.4 %)
  { id: 'closure_impossible_C10', case: 'C10', uncoveredStrip_m: 0.1, reason: '0.3 m core: closing it needs 100 mm pipes joined by a 180° turn of R 50 mm < RMIN — a 0.1 m strip stays uncovered (thinner than s: no patch)', fixBy: '— (geometry: RMIN)' },
  { id: 'obstacle_corridor_0_3_O9', case: 'O9', uncovered_m2: 0.41, reason: '0.3 m corridor between column and wall: no pipe fits (stays uncovered, visible)', fixBy: '— (geometry: narrower than one pipe pitch + clearances)' },
];

// ---- step 4: obstacles ----
// Clearances (m): the usable heating area is the zone minus WALL_CLEARANCE along its walls; an
// obstacle (column, shaft, built-in) is excluded together with OBSTACLE_CLEARANCE round it —
// exclusion = offset(obstacle, OBSTACLE_CLEARANCE), one polygon, no pipe ever enters it.
export const WALL_CLEARANCE = 0.2;
export const OBSTACLE_CLEARANCE = 0.2;
// ---- step 5: centre closure / residual spacing ----
// NOMINAL spacing s is the spacing of the whole spiral. Only its terminal part (the innermost ring,
// the hairpin legs, the centre turn — the core, or the last strip round an obstacle) may close the
// rest width with a RESIDUAL spacing rho < s: e.g. 200 · 200 · 200 · 150, never 150 · 150 · 150.
// MIN_RESIDUAL_CLOSURE_SPACING: the smallest residual accepted — 100 mm, the smallest standard laying
// pitch of a 16 mm UFH pipe (clip rails / tacker grids in 50 mm steps; 100 mm is the narrow edge-zone
// pitch of EN 1264 layouts); closer parallel runs only overheat a strip. Where a 180° turn joins
// two residual-spaced pipes its radius rho/2 must still be ≥ RMIN_CHECK (so there rho ≥ 136 mm).
export const MIN_RESIDUAL_CLOSURE_SPACING = 0.1;
// at most this many rings at the residual spacing (the innermost one) — plus the hairpin legs
export const MAX_RESIDUAL_RINGS = 1;
// residual values tried (search grid, from MIN_RESIDUAL_CLOSURE_SPACING up to just under s)
export const RESIDUAL_SEARCH_STEP = 0.01;
// the optimizer runs on a region whose own uncovered share exceeds this (nothing to close below)
export const CLOSURE_TRIGGER_UNCOVERED_SHARE = 0.01;

// A region wrapping an obstacle (step 4): the strip between the exclusion and each wall holds
// rings from both of its sides, filled only when its width W = 2·s·m; the rest (W mod 2s, up to
// almost 2s along every side of the obstacle) stays uncovered — beside the obstacle and in the
// core, never hidden. Spacing is fixed, so a spiral round an obstacle cannot reach the 0.94–0.95 of
// an empty rectangle. RELAXED THRESHOLD (reported): 0.90 for a split that wraps an obstacle; the
// engineering limits (ENGINEERING_FINAL_COVERAGE, ENGINEERING_FINAL_MAX_HOLE) are unchanged.
// Meaning: an OBSTACLE RAW GEOMETRY SEARCH / TEST criterion only (which splits the search accepts);
// it never replaces ENGINEERING_FINAL_COVERAGE, and MAX_LARGEST_GAP is checked on its own.
export const GEOMETRY_TEST_COVERAGE_OBSTACLE_REGION = 0.9;
// largest uncovered patch accepted by the geometry self-check (= GEOMETRY_TEST_MAX_HOLE)
export const MAX_LARGEST_GAP = GEOMETRY_TEST_MAX_HOLE;
// width of the seam cut from an exclusion to the region outline (numeric only: the rings run along
// both sides of it at s/2, so the pipes across a seam are s + SEAM_WIDTH apart)
export const SEAM_WIDTH = 0.0002;
