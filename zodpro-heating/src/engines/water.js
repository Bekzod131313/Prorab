// Water properties (1 bar), linear interpolation of tabulated values.
// Source: standard steam-table values (IAPWS-IF97 rounded).
const TABLE = [
  // t °C, rho kg/m³, nu m²/s (kinematic viscosity), cp J/(kg·K)
  [5, 999.97, 1.519e-6, 4202],
  [10, 999.7, 1.307e-6, 4192],
  [20, 998.2, 1.004e-6, 4182],
  [30, 995.7, 0.801e-6, 4178],
  [40, 992.2, 0.658e-6, 4179],
  [50, 988.0, 0.553e-6, 4181],
  [60, 983.2, 0.475e-6, 4185],
  [70, 977.8, 0.413e-6, 4190],
  [80, 971.8, 0.365e-6, 4197],
  [90, 965.3, 0.326e-6, 4205],
  [100, 958.4, 0.295e-6, 4216],
];

export const WATER_VERSION = 'water-props/1.0';

export function water(t) {
  const T = Math.max(TABLE[0][0], Math.min(TABLE[TABLE.length - 1][0], t));
  for (let i = 0; i < TABLE.length - 1; i++) {
    const a = TABLE[i];
    const b = TABLE[i + 1];
    if (T >= a[0] && T <= b[0]) {
      const f = (T - a[0]) / (b[0] - a[0]);
      return {
        t: T,
        rho: a[1] + f * (b[1] - a[1]),
        nu: a[2] + f * (b[2] - a[2]),
        cp: a[3] + f * (b[3] - a[3]),
      };
    }
  }
  const l = TABLE[TABLE.length - 1];
  return { t: T, rho: l[1], nu: l[2], cp: l[3] };
}

/** Relative expansion of water heated from t0 to t1: (rho0/rho1 − 1). */
export function expansionCoefficient(t0, t1) {
  return water(t0).rho / water(t1).rho - 1;
}
