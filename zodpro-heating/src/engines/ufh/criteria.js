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

/**
 * Known limitations — kept visible (tests assert the current numbers so any change is noticed);
 * to be removed by the modules named.
 */
export const KNOWN_LIMITATIONS = [
  { id: 'centre_gap_square_3_5', case: '3.5 × 3.5 m, s 200 mm', centreGap_m2: 0.2, fixBy: 'CENTER CLOSURE OPTIMIZER (phase 5)' },
  { id: 'centre_gap_square_3_5_s150', case: '3.5 × 3.5 m, s 150 mm', centreGap_m2: 0.27, fixBy: 'CENTER CLOSURE OPTIMIZER (phase 5)' },
  { id: 'centre_gap_U3', case: 'U3', centreGap_m2: 0.79, fixBy: 'CENTER CLOSURE OPTIMIZER (phase 5)' },
  { id: 'obstacle_near_wall_U9', case: 'U9', invalidRegion: 'column 0.6 m from two walls (after clearances): no rectangular spiral region fits the strip', fixBy: 'OBSTACLE-AWARE SPIRAL (phase 4)' },
  { id: 'narrow_corridor_0_9_U', case: 'U4b', invalidRegion: '0.9 m arm: no two-pipe spiral with R ≥ 100 mm fits', fixBy: 'obstacle-aware / local spiral (phases 4–5)' },
  { id: 'narrow_corridor_0_9', case: 'L4b', invalidRegion: '0.9 m corridor: no two-pipe spiral with R ≥ 100 mm fits', fixBy: 'obstacle-aware / local spiral (phases 4–5)' },
];
