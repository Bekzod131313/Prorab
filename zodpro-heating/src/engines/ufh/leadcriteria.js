// UFH Coverage Router — step 7 (collector integration + real lead routing): parameters and statuses.
// Phase 6 rules (criteria.js: 60 m, RMIN, spacing, coverage) are imported, never redefined here.

// leads of one bundle (a transit corridor) lie this far apart, centre to centre (the old room
// engine's transit spacing, rooms.js)
export const TRANSIT_PITCH_M = 0.1;
// a door keeps this much free on each side of the bundle passing it
export const DOOR_MARGIN_M = 0.05;
// round the manifold ports the leads converge: lead spacing rules waived inside this radius
// (crossings never)
export const FAN_RADIUS_M = 0.6;

// zone statuses of step 7 (docs/phase7/SPEC.md §10)
export const ROUTED_VALID = 'ROUTED_VALID';
export const LEAD_STATUSES = Object.freeze({
  OUTLET_SHORTAGE: 'blocking', // required loops > physical outlets: no lead is routed
  MANIFOLD_PORTS_INVALID: 'blocking', // port geometry / count wrong
  LEAD_ROUTE_NOT_FOUND: 'blocking', // no chain of doors to the room (a proof: the graph has no path)
  DOOR_CAPACITY_EXCEEDED: 'blocking',
  CORRIDOR_CAPACITY_EXCEEDED: 'blocking',
  LEAD_ORDER_INFEASIBLE: 'blocking',
  LEAD_BEND_RADIUS: 'blocking',
  LEAD_SPACING: 'blocking',
  LEAD_INTERSECTION: 'blocking',
  LOOP_LENGTH_EXCEEDED_ROUTED: 'blocking',
  REPLAN_NOT_CONVERGED: 'blocking', // the search stopped — not a proof of impossibility
  COVERAGE_BELOW_LIMIT: 'blocking',
  LOW_MARGIN: 'warning',
});
export const isBlocking = (status) => LEAD_STATUSES[status] === 'blocking';
