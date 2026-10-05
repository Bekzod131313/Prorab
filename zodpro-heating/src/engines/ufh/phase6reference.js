// UFH Coverage Router — Phase 7B: a READ-ONLY check of the frozen Phase 6 heating output against
// the project reference behaviour (user reference drawing, 2026-10-05):
//
//   the spiral starts at the region's outer contour, runs inward, continues through the terminal
//   closure, and its final pass covers the remaining usable strip at the SIDE of the region
//   (right / side residual) before it returns.
//
// Nothing here makes or changes a spiral: the Phase 6 output is measured as it is. A mismatch is
// reported (PHASE6_REFERENCE_MISMATCH) so that Phase 6 can be reopened — 7B never corrects it.

import * as G from './geom.js';
import { SPACING_TOL } from './criteria.js';

export const PHASE6_REFERENCE_OK = 'PHASE6_REFERENCE_OK';
export const PHASE6_REFERENCE_MISMATCH = 'PHASE6_REFERENCE_MISMATCH';
export const PHASE6_REFERENCE_NA = 'PHASE6_REFERENCE_NA'; // no terminal / residual closure to check

/**
 * @param loop  a Phase 6 loop: { shape, spiral: { heating, residual: { terminal: [s0, s1] } } }
 * @param s     nominal pitch
 * @returns { status, startsAtOuterContour, terminal: { length_m, centre: {u, v} (0…1 in the region box),
 *            toSide_m (its mean distance to the region outline), alongSide } , reasons }
 */
export function referenceCheck(loop, s) {
  const sp = loop.spiral;
  const outline = [{ outer: loop.shape.outer, holes: [] }];
  const reasons = [];
  // 1. starts at the outer contour: the first heating point s/2 from the region outline
  const d0 = G.distToRegionBoundary(sp.heating[0], outline);
  const startsAtOuterContour = Math.abs(d0 - s / 2) <= 0.01;
  if (!startsAtOuterContour) reasons.push(`heating starts ${d0.toFixed(3)} m from the region outline (outer pass at s/2 = ${(s / 2).toFixed(3)})`);
  // 2. the terminal closure: where it lies in the region
  const term = sp.residual?.terminal;
  if (!term || !(term[1] > term[0])) return { status: startsAtOuterContour ? PHASE6_REFERENCE_NA : PHASE6_REFERENCE_MISMATCH, startsAtOuterContour, terminal: null, reasons: [...reasons, 'no terminal / residual closure interval'] };
  const part = G.subPath(sp.heating, term[0], term[1]);
  const pts = G.densify(part, 0.02);
  const toSide = pts.reduce((a, q) => a + G.distToRegionBoundary(q, outline), 0) / pts.length;
  const bb = G.bbox(loop.shape.outer);
  const pb = G.bbox(part);
  const centre = { u: ((pb.x0 + pb.x1) / 2 - bb.x0) / (bb.x1 - bb.x0), v: ((pb.y0 + pb.y1) / 2 - bb.y0) / (bb.y1 - bb.y0) };
  // the final pass along a side: on average within 1.5 pitches of the outline (the outer pass is at
  // s/2, the next ring at 1.5 s) — a closure in the middle of the region is not
  const alongSide = toSide <= 1.5 * s + SPACING_TOL;
  if (!alongSide) reasons.push(`terminal closure ${toSide.toFixed(3)} m (mean) from the region outline, centre at (${centre.u.toFixed(2)}, ${centre.v.toFixed(2)}) of the region — in the middle, not the side strip`);
  return {
    status: startsAtOuterContour && alongSide ? PHASE6_REFERENCE_OK : PHASE6_REFERENCE_MISMATCH,
    startsAtOuterContour,
    terminal: { length_m: G.pathLength(part), centre, toSide_m: toSide, alongSide },
    reasons,
  };
}
