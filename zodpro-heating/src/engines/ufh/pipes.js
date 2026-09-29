// UFH pipe types. Minimum bend radius = manufacturer cold-bending radius (5 × OD for PE-X / PE-RT
// with a bending guide, 5 × OD for multilayer with a bending spring). Values are per type, never
// hard-coded in the routing algorithm.

export const UFH_PIPES = [
  { id: 'PERT-16x2.0', material: 'PE-RT', od: 0.016, wall: 0.002, minBend: 0.08, label: 'PE-RT Ø16×2.0' },
  { id: 'PEX-16x2.0', material: 'PE-Xa', od: 0.016, wall: 0.002, minBend: 0.08, label: 'PE-Xa Ø16×2.0' },
  { id: 'PEX-17x2.0', material: 'PE-Xa', od: 0.017, wall: 0.002, minBend: 0.085, label: 'PE-Xa Ø17×2.0' },
  { id: 'PEXAL-16x2.0', material: 'PEX-AL-PEX', od: 0.016, wall: 0.002, minBend: 0.08, label: 'PEX-AL-PEX Ø16×2.0' },
  { id: 'PERT-20x2.0', material: 'PE-RT', od: 0.02, wall: 0.002, minBend: 0.1, label: 'PE-RT Ø20×2.0' },
  { id: 'PEX-20x2.0', material: 'PE-Xa', od: 0.02, wall: 0.002, minBend: 0.1, label: 'PE-Xa Ø20×2.0' },
];

export const DEFAULT_PIPE = 'PERT-16x2.0';

export function pipeType(id) {
  return UFH_PIPES.find((p) => p.id === id) ?? UFH_PIPES[0];
}

/** Inner diameter in metres. */
export const innerDiameter = (p) => p.od - 2 * p.wall;

/** Short label used on drawings: "Ø16x2.0". */
export const pipeShort = (p) => `Ø${Math.round(p.od * 1000)}x${p.wall * 1000 === 2 ? '2.0' : (p.wall * 1000).toFixed(1)}`;

export const SPACINGS = [0.1, 0.15, 0.2, 0.25, 0.3];
export const WALL_CLEARANCES = [0.05, 0.075, 0.1, 0.15, 0.2];
export const STRATEGIES = ['adaptive_spiral', 'spiral', 'serpentine', 'adaptive_serpentine'];
export const OBSTACLE_KINDS = ['stair', 'column', 'bathtub', 'shower', 'toilet', 'furniture', 'kitchen', 'equipment', 'structure', 'unheated'];
