// Pipe hydraulics primitives: flow from heat load, velocity, friction (Darcy–Weisbach with
// Swamee–Jain explicit Colebrook approximation), local losses, Kv valve losses.
import { water } from './water.js';

export const HYDRAULICS_VERSION = 'hydraulics/1.1';

/** Mass flow kg/s and volume flow m³/h for heat Q [W] with temperature drop dT [K] at mean temp tm. */
export function flowFromHeat(Q, dT, tm = 70) {
  const w = water(tm);
  if (dT <= 0) throw new Error('Temperature drop must be > 0');
  const mKgS = Q / (w.cp * dT);
  const vM3s = mKgS / w.rho;
  return { mKgS, mKgH: mKgS * 3600, vM3s, vM3h: vM3s * 3600, vLh: vM3s * 3.6e6, rho: w.rho };
}

export function velocity(vM3s, dInner) {
  const A = (Math.PI * dInner * dInner) / 4;
  return vM3s / A;
}

export function reynolds(v, dInner, nu) {
  return (v * dInner) / nu;
}

/** Darcy friction factor. */
export function frictionFactor(Re, dInner, k) {
  if (Re <= 0) return 0;
  const lamLam = 64 / Re;
  const turb = (r) => 0.25 / Math.log10(k / (3.7 * dInner) + 5.74 / r ** 0.9) ** 2;
  if (Re < 2300) return lamLam;
  if (Re < 4000) {
    // linear blend across the transition zone (conservative, deterministic)
    const f = (Re - 2300) / 1700;
    return 64 / 2300 + f * (turb(4000) - 64 / 2300);
  }
  return turb(Re);
}

/**
 * Full segment calculation.
 * @returns {{v, Re, lambda, R (Pa/m), dpFriction, dpLocal, dp, regime}}
 */
export function pipeSegment({ vM3s, dInner, k, length, zeta = 0, tm = 70 }) {
  const w = water(tm);
  const v = velocity(vM3s, dInner);
  const Re = reynolds(v, dInner, w.nu);
  const lambda = frictionFactor(Re, dInner, k);
  const dyn = (w.rho * v * v) / 2;
  const R = dInner > 0 ? (lambda / dInner) * dyn : 0;
  const dpFriction = R * length;
  const dpLocal = zeta * dyn;
  return {
    v,
    Re,
    lambda,
    R,
    dpFriction,
    dpLocal,
    dp: dpFriction + dpLocal,
    regime: Re < 2300 ? 'laminar' : Re < 4000 ? 'transition' : 'turbulent',
  };
}

/** Pressure drop across a Kv element [Pa]. vM3h in m³/h, kv in m³/h at 1 bar. */
export function kvDrop(vM3h, kv) {
  if (!kv) return 0;
  return (vM3h / kv) ** 2 * 1e5;
}

/** Kv needed to create dp [Pa] at vM3h. */
export function kvRequired(vM3h, dp) {
  if (dp <= 0) return Infinity;
  return vM3h / Math.sqrt(dp / 1e5);
}

export const PA_PER_M_WATER = 9806.65;
export const paToM = (pa, rho = 977.8) => pa / (rho * 9.80665);
