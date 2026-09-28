// Shared, dependency-free helpers (geometry, ids, numbers).
// Used by both the UI and the calculation engines, so nothing here may touch the DOM.

export function guid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // RFC4122 v4 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let idCounter = 0;
export function shortId(prefix = 'e') {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const round = (v, d = 2) => {
  const f = 10 ** d;
  return Math.round((v + Number.EPSILON) * f) / f;
};
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sum = (arr, fn = (x) => x) => arr.reduce((s, x) => s + fn(x), 0);

// ---------- 2D geometry (metres, plan coordinates; +x east, +y south on screen) ----------
export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const len = (a) => Math.hypot(a.x, a.y);
export const norm = (a) => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};

export function polygonArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2; // signed
}

export function polygonPerimeter(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length]);
  return s;
}

export function polygonCentroid(pts) {
  const a = polygonArea(pts);
  if (Math.abs(a) < 1e-9) {
    return { x: sum(pts, (p) => p.x) / pts.length, y: sum(pts, (p) => p.y) / pts.length };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Projection of p onto segment ab. Returns {t (0..1 clamped), point, d}. */
export function projectOnSegment(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  let t = l2 === 0 ? 0 : dot(sub(p, a), ab) / l2;
  t = clamp(t, 0, 1);
  const point = add(a, mul(ab, t));
  return { t, point, d: dist(p, point) };
}

/**
 * Overlap of segment (c,d) with the line of segment (a,b) when they are collinear
 * within `tol` metres. Returns overlap length along ab and the [t0,t1] interval in ab
 * parameter space, or null.
 */
export function collinearOverlap(a, b, c, d, tol = 0.05) {
  const ab = sub(b, a);
  const L = len(ab);
  if (L < 1e-9) return null;
  const u = mul(ab, 1 / L);
  const n = { x: -u.y, y: u.x };
  const dc = Math.abs(dot(sub(c, a), n));
  const dd = Math.abs(dot(sub(d, a), n));
  if (dc > tol || dd > tol) return null;
  let s0 = dot(sub(c, a), u);
  let s1 = dot(sub(d, a), u);
  if (s0 > s1) [s0, s1] = [s1, s0];
  const lo = Math.max(0, s0);
  const hi = Math.min(L, s1);
  if (hi - lo <= 1e-6) return null;
  return { length: hi - lo, s0: lo, s1: hi };
}

/** Compass direction of an outward normal. North is plan -y rotated by northAngle (deg, clockwise). */
export function compassOf(normal, northAngleDeg = 0) {
  // bearing measured clockwise from north
  const ang = (Math.atan2(normal.x, -normal.y) * 180) / Math.PI - northAngleDeg;
  const b = ((ang % 360) + 360) % 360;
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(b / 45) % 8];
}

export function deepClone(o) {
  return o === undefined ? undefined : JSON.parse(JSON.stringify(o));
}

export function polylineLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, (pts[i].z ?? 0) - (pts[i - 1].z ?? 0));
  return s;
}

export const keyOf = (x, y) => `${round(x, 3)},${round(y, 3)}`;
