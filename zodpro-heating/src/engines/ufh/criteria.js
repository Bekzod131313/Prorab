// UFH Coverage Router — what is checked where. Two different questions, kept apart:
//
//   GEOMETRY_TEST_COVERAGE       does the spiral generator fill its region? A self-check of the raw
//                                geometry (one region, heating pipe only). Not a design approval.
//   ENGINEERING_FINAL_COVERAGE   the final engineering validation of a whole zone. It passes only
//                                with ALL of ENGINEERING_FINAL_CHECKS — heating pipe coverage and
//                                uncovered polygons, spacing, clearance, bend radius, loop length
//                                (supply + heating + return ≤ 60 m) and the manifold connection.
//
// A raw spiral (kind 'RAW_SPIRAL') is geometry, never a valid heating loop by itself.

import { UFH_RULES } from './validate.js';

export const GEOMETRY_TEST_COVERAGE = 0.95;
export const GEOMETRY_TEST_MAX_HOLE = 0.5; // m²
// several spiral regions: each cut between two regions and each corner of a region leaves slivers
// the spirals' bands do not reach (s√2 at corners), so the geometry self-check of a decomposed area
// is one point lower
export const GEOMETRY_TEST_COVERAGE_REGIONS = 0.94;

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
  { id: 'centre_gap_L2', case: 'L2', centreGap_m2: 0.61, fixBy: 'CENTER CLOSURE OPTIMIZER (phase 5)' },
];
