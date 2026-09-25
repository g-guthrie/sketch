// Shared math + shape helpers for the character rig.
// Everything here works in character-local units: origin at the feet,
// y down, the character faces +x (the caller mirrors with ctx.scale).

import { shade, mix, desat } from '../ink.js';

export const TAU = Math.PI * 2;
export const PI = Math.PI;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (t) => { t = sat(t); return t * t * (3 - 2 * t); };
export const easeOut = (t) => { t = sat(t); return 1 - (1 - t) * (1 - t); };
export const easeIn = (t) => { t = sat(t); return t * t; };
export const wrapA = (a) => { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; };
export const lerpA = (a, b, t) => a + wrapA(b - a) * t;
// 0..1 bump centred on c with half-width w
export const bump = (t, c, w) => { const x = (t - c) / w; return x <= -1 || x >= 1 ? 0 : (1 - x * x) * (1 - x * x); };

export function rot(x, y, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

// Point in a frame (origin ox,oy rotated by a)
export function fp(ox, oy, a, x, y) {
  const c = Math.cos(a), s = Math.sin(a);
  return [ox + x * c - y * s, oy + x * s + y * c];
}

// Critically damped spring, stable for any dt. s = { x, v }
export function crit(s, target, dt, w) {
  if (dt <= 0) return s.x;
  const x0 = s.x - target;
  const e = Math.exp(-w * dt);
  const k = s.v + w * x0;
  s.x = target + (x0 + k * dt) * e;
  s.v = (s.v - w * k * dt) * e;
  return s.x;
}

// Underdamped spring (for overshoot / wobble). Sub-stepped for stability.
export function wobble(s, target, dt, k, d) {
  let t = Math.min(dt, 0.1);
  while (t > 0) {
    const h = Math.min(t, 1 / 120);
    s.v += ((target - s.x) * k - s.v * d) * h;
    s.x += s.v * h;
    t -= h;
  }
  return s.x;
}

// Exponential approach (frame-rate independent lerp)
export const approach = (v, t, dt, rate) => v + (t - v) * (1 - Math.exp(-rate * dt));

// Deterministic PRNG step (xorshift on a number)
export function rnd(A) {
  let x = A.rs | 0 || 0x9e3779b9;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  A.rs = x;
  return ((x >>> 0) % 100000) / 100000;
}

// ---------------------------------------------------------------- IK

// Two-bone IK. The joint bends toward the (hx, hy) hint direction, so knees
// always point forward and elbows down/back. Soft limit near full extension
// so limbs never snap straight. Writes into out = { jx, jy, ex, ey }.
export function ik(ax, ay, tx, ty, l1, l2, hx, hy, out) {
  let dx = tx - ax, dy = ty - ay;
  let d = Math.hypot(dx, dy);
  const L = l1 + l2;
  if (d < 1e-4) { dx = hx; dy = hy; d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d; d = Math.abs(l1 - l2) + 0.5; dx *= d; dy *= d; }
  // soft extension: approach 0.985 L asymptotically
  const soft = L * 0.1, knee0 = L * 0.985 - soft;
  let dd = d;
  if (d > knee0) dd = knee0 + soft * (1 - Math.exp(-(d - knee0) / soft));
  const dmin = Math.abs(l1 - l2) + 0.6;
  if (dd < dmin) dd = dmin;
  const ux = dx / d, uy = dy / d;
  const ca = clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1);
  const a = Math.acos(ca);
  const side = ux * hy - uy * hx >= 0 ? 1 : -1;
  const base = Math.atan2(uy, ux) + side * a;
  out.jx = ax + Math.cos(base) * l1;
  out.jy = ay + Math.sin(base) * l1;
  out.ex = ax + ux * dd;
  out.ey = ay + uy * dd;
  return out;
}

// ------------------------------------------------------------- shapes

// A tapered, muscled limb from A to B. prof: [r0, r1, bulgeF, posF, bulgeB, posB]
// "F" is the side n = (uy, -ux) of A->B: for a limb hanging down that is the
// front (+x); "B" is the other side (for a hanging limb: the back).
// off = [ox, oy] shifts the whole shape, k scales the radii (used to build
// the lit copy for cel shading).
const SAMPLES = [0.0, 0.22, 0.45, 0.68, 0.88, 1.0];
const _l = new Float64Array(12), _r = new Float64Array(12);
export function limbPath(p, ax, ay, bx, by, prof, k = 1, ox = 0, oy = 0) {
  ax += ox; ay += oy; bx += ox; by += oy;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 0.001;
  const ux = dx / len, uy = dy / len;
  const nx = uy, ny = -ux; // left normal (y down)
  const [r0, r1, bl, pl, br, pr] = prof;
  const n = SAMPLES.length;
  for (let i = 0; i < n; i++) {
    const t = SAMPLES[i];
    const base = r0 + (r1 - r0) * t;
    const e = sat(t / 0.14) * sat((1 - t) / 0.14);
    const wl = (base + bl * bump(t, pl, 0.5) * e) * k;
    const wr = (base + br * bump(t, pr, 0.5) * e) * k;
    const cx = ax + dx * t, cy = ay + dy * t;
    _l[i * 2] = cx + nx * wl; _l[i * 2 + 1] = cy + ny * wl;
    _r[i * 2] = cx - nx * wr; _r[i * 2 + 1] = cy - ny * wr;
  }
  const th = Math.atan2(uy, ux);
  // start cap at A (left side -> around the back -> right side)
  p.moveTo(_r[0], _r[1]);
  p.arc(ax, ay, r0 * k, th + PI / 2, th - PI / 2, false);
  // left side forward
  for (let i = 1; i < n - 1; i++) {
    const mx = (_l[i * 2] + _l[i * 2 + 2]) / 2, my = (_l[i * 2 + 1] + _l[i * 2 + 3]) / 2;
    p.quadraticCurveTo(_l[i * 2], _l[i * 2 + 1], i === n - 2 ? _l[(n - 1) * 2] : mx, i === n - 2 ? _l[(n - 1) * 2 + 1] : my);
  }
  // end cap at B
  p.arc(bx, by, r1 * k, th - PI / 2, th + PI / 2, false);
  // right side back
  for (let i = n - 2; i >= 1; i--) {
    const mx = (_r[i * 2] + _r[i * 2 - 2]) / 2, my = (_r[i * 2 + 1] + _r[i * 2 - 1]) / 2;
    p.quadraticCurveTo(_r[i * 2], _r[i * 2 + 1], i === 1 ? _r[0] : mx, i === 1 ? _r[1] : my);
  }
  p.closePath();
  return p;
}

export function ellipse(p, x, y, rx, ry, a = 0) {
  p.moveTo(x + Math.cos(a) * rx, y + Math.sin(a) * rx);
  p.ellipse(x, y, rx, ry, a, 0, TAU);
  return p;
}

export function circle(p, x, y, r) {
  p.moveTo(x + r, y);
  p.arc(x, y, r, 0, TAU);
  return p;
}

// Polygon / smooth closed curve through points (quadratic through midpoints)
export function smoothPoly(p, pts, closed = true) {
  const n = pts.length / 2;
  if (!closed) {
    p.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n - 1; i++) {
      const mx = (pts[i * 2] + pts[i * 2 + 2]) / 2, my = (pts[i * 2 + 1] + pts[i * 2 + 3]) / 2;
      p.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], i === n - 2 ? pts[i * 2 + 2] : mx, i === n - 2 ? pts[i * 2 + 3] : my);
    }
    return p;
  }
  const mx0 = (pts[(n - 1) * 2] + pts[0]) / 2, my0 = (pts[(n - 1) * 2 + 1] + pts[1]) / 2;
  p.moveTo(mx0, my0);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    p.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], (pts[i * 2] + pts[j * 2]) / 2, (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2);
  }
  p.closePath();
  return p;
}

// Sharp-cornered polygon
export function poly(p, pts) {
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath();
  return p;
}

export function rrect(p, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
  return p;
}

// ------------------------------------------------------------- colour

const cache = new Map();
function memo(key, f) {
  let v = cache.get(key);
  if (v === undefined) {
    v = f();
    if (cache.size > 4000) cache.clear();
    cache.set(key, v);
  }
  return v;
}

const SHADOW_TINT = '#2a1f55';
export const shadowOf = (c) => memo('s' + c, () => mix(shade(c, -0.18), SHADOW_TINT, 0.24));
export const deepOf = (c) => memo('d' + c, () => mix(shade(c, -0.35), SHADOW_TINT, 0.3));
export const lightOf = (c) => memo('l' + c, () => mix(c, '#fffbea', 0.38));
export const skinShadow = (c) => memo('k' + c, () => mix(shade(c, -0.12), '#9a3048', 0.26));
export const cmix = (a, b, t) => memo('m' + a + b + ((t * 20) | 0), () => mix(a, b, Math.round(t * 20) / 20));
export const cshade = (a, t) => memo('h' + a + ((t * 40) | 0), () => shade(a, Math.round(t * 40) / 40));
export const asleepOf = (c) => memo('a' + c, () => mix(desat(c, 1), '#efe6cf', 0.6));
export const isDark = (c) => memo('D' + c, () => {
  const h = c.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 < 70;
});
