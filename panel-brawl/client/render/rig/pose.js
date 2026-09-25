// Procedural posing. Every frame a target pose ("T") is rebuilt from the
// entity state + anim clocks: a locomotion base (idle / gait / crouch / air /
// climb / dash), an arm layer (weapon hold, punches, slashes, reloads,
// throws) and an optional full-body state (cover, knockdown, tied, ...) that
// is cross-faded in. The skeleton is then solved with hinted two-bone IK so
// knees always bend forward and elbows down/back.

import { ACT } from '../../../shared/ai.js';
import { clamp, lerp, sat, smooth, easeOut, easeIn, lerpA, fp, ik, PI, TAU } from './util.js';
import { WMETA } from './props.js';
import { localAim } from './anim.js';

export const ST_DOWN = 100, ST_REVIVE = 101;

const NUM = [
  'px', 'py', 'pel', 'lean', 'tw', 'br', 'sw',
  'a0x', 'a0y', 'f0', 'a1x', 'a1y', 'f1',
  'h0x', 'h0y', 'r0', 'h1x', 'h1y', 'r1',
  'wa', 'sup', 'hd', 'rot', 'rpx', 'rpy', 'rtx', 'rty', 'sqx', 'sqy',
  'fk0', 'fk1', 'wv', 'e0x', 'e0y', 'e1x', 'e1y', 'toss', 'mouth', 'shx',
];

function newT() {
  return resetT({});
}

function resetT(T) {
  for (const k of NUM) T[k] = 0;
  T.sqx = T.sqy = 1;
  T.fk0 = T.fk1 = 1;
  T.wv = 1;
  T.e0x = -0.45; T.e0y = 1; T.e1x = -0.2; T.e1y = 1;
  T.hs0 = 'relax'; T.hs1 = 'relax';
  T.ex = 'det';
  T.fx = 0;
  T.mag = 0;
  T._rk = 0; T._swing0 = 0; T._swing1 = 0; T._kf = 0;
  return T;
}

function copyT(d, s) {
  for (const k of NUM) d[k] = s[k];
  d.hs0 = s.hs0; d.hs1 = s.hs1; d.ex = s.ex; d.fx = s.fx; d.mag = s.mag;
  return d;
}

function blendT(out, a, b, w) {
  if (w <= 0) return copyT(out, a);
  if (w >= 1) return copyT(out, b);
  for (const k of NUM) out[k] = a[k] + (b[k] - a[k]) * w;
  out.wa = lerpA(a.wa, b.wa, w);
  out.r0 = lerpA(a.r0, b.r0, w);
  out.r1 = lerpA(a.r1, b.r1, w);
  const d = w >= 0.5 ? b : a;
  out.hs0 = d.hs0; out.hs1 = d.hs1; out.ex = d.ex; out.fx = d.fx; out.mag = d.mag;
  return out;
}

// ----------------------------------------------------------- geometry

function waistOf(T, B) {
  return fp(T.px, T.py, T.pel, 0, -B.waist);
}

export function shoulderOfT(T, B, near) {
  const [wx, wy] = waistOf(T, B);
  const tw = T.tw;
  const x = near ? lerp(B.shN, B.shNt, tw) + T.sw * 1.8 : lerp(B.shF, B.shFt, tw) - T.sw * 1.8;
  return fp(wx, wy, T.lean, x, B.shY - T.br * 0.35 - T.shx);
}

// foot: lowest-point height -> ankle height for a given foot angle
function ankleLift(B, a) {
  const f = B.foot;
  const toe = 9 * f * Math.sin(a) + B.ank * Math.cos(a);
  const heel = -3.6 * f * Math.sin(a) + B.ank * Math.cos(a);
  return Math.max(toe, heel);
}

// Catmull-Rom through keyframes [v, x, y, ang]
const _k = [0, 0, 0];
function evalKeys(keys, v, sx, sy) {
  let i = 0;
  while (i < keys.length - 2 && v > keys[i + 1][0]) i++;
  const k1 = keys[i], k2 = keys[i + 1];
  const k0 = keys[Math.max(0, i - 1)], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const t = clamp((v - k1[0]) / (k2[0] - k1[0] || 1), 0, 1);
  const t2 = t * t, t3 = t2 * t;
  for (let j = 1; j <= 3; j++) {
    const p0 = k0[j], p1 = k1[j], p2 = k2[j], p3 = k3[j];
    _k[j - 1] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  _k[0] *= sx;
  _k[1] *= sy;
  return _k;
}

// swing paths: [v, x (in stride units), lift (units), foot angle]
const SW_RUN = [[0, -1.0, 0, 0.6], [0.18, -1.14, -8, 1.0], [0.4, -0.55, -18.5, 1.15], [0.62, 0.32, -19, 0.55], [0.82, 1.0, -8.5, 0.02], [1, 0.9, 0, -0.2]];
const SW_WALK = [[0, -1.0, 0, 0.42], [0.3, -0.5, -5.5, 0.3], [0.65, 0.5, -5, -0.08], [1, 0.9, 0, -0.18]];
const SW_BACK = [[0, -1.0, 0, -0.15], [0.5, 0.05, -7, 0.1], [1, 0.9, 0, 0.3]];
const _f = { x: 0, y: 0, a: 0 };

function gaitFoot(A, u, rk, bk, liftK) {
  const s = A.stance, R = A.stride;
  if (u < s) {
    const v = u / s;
    _f.x = lerp(0.9, -1.0, v) * R;
    _f.y = 0;
    const fwd = v < 0.22 ? lerp(-0.2 * (0.4 + rk * 0.6), 0, v / 0.22) : v > 0.6 ? easeIn((v - 0.6) / 0.4) * lerp(0.42, 0.6, rk) : 0;
    const bwd = v < 0.3 ? lerp(0.3, 0, v / 0.3) : v > 0.7 ? -0.15 * (v - 0.7) / 0.3 : 0;
    _f.a = lerp(fwd, bwd, bk);
    return _f;
  }
  const v = (u - s) / (1 - s);
  let [rx, ry, ra] = evalKeys(SW_RUN, v, R, liftK);
  const [wx, wy, wa] = evalKeys(SW_WALK, v, R, liftK);
  rx = lerp(wx, rx, rk); ry = lerp(wy, ry, rk); ra = lerp(wa, ra, rk);
  if (bk > 0) {
    const [bx, by, ba] = evalKeys(SW_BACK, v, R, liftK);
    rx = lerp(rx, bx, bk); ry = lerp(ry, by, bk); ra = lerp(ra, ba, bk);
  }
  _f.x = rx; _f.y = ry; _f.a = ra;
  return _f;
}

// ------------------------------------------------------------ context

export function makeCtx(ent, A, opts) {
  const look = ent.look || {};
  const wkey = (opts && opts.weapon) || look.weapon || 'none';
  const W = WMETA[wkey] || WMETA.none;
  const s = (look.scale || 1) * (ent.renderScale || 1);
  const player = !ent.k;
  const h = (ent.h || (player ? 92 : 90)) / s;
  const shield = !!(look.shield && ent.shieldUp !== false);
  return {
    ent, A, look, W, wkey, s, h, player, shield,
    k: ent.k,
    facing: ent.facing < 0 ? -1 : 1,
    onGround: ent.onGround !== false,
    climb: !!ent.climb,
    flying: look.extra === 'jetpack' && ent.k === 'flyer',
    aim: A.aim.x,
    e: A.engage,
    t: A.t + A.idleOff,
    pivot: player ? [2, -(h - 22)] : [0, -0.72 * h],
    act: effAct(ent),
    B: null,
  };
}

export function effAct(ent) {
  if (ent.downed) return ST_DOWN;
  if (ent.reviving) return ST_REVIVE;
  if (ent.stagger && ent.act !== ACT.knockdown && ent.act !== ACT.getup) return ACT.stagger;
  if (ent.stun && !ent.k) return ACT.stunned;
  return ent.act == null ? -1 : ent.act;
}

// ------------------------------------------------------------ poses

function stand(T, C) {
  const { B, t } = C;
  const br = Math.sin(t * 2.1);
  const sway = Math.sin(t * 0.8) * 1.0 + Math.sin(t * 1.9) * 0.25;
  T.br = br;
  T.px = -0.6 + sway * 0.8 + (B.fem ? -0.8 : 0);
  T.py = -B.hipH + br * 0.22 + (B.fem ? 0.4 : 0);
  T.pel = 0.02 + sway * 0.015;
  T.lean = -0.07 + B.hunch + br * 0.012;
  T.tw = 0; T.sw = 0;
  T.shx = (br * 0.5 + 0.5) * 0.7;
  const w = B.fem ? 0.75 : 1;
  T.a0x = -8.6 * w - (B.hips - 1) * 4; T.a0y = -B.ank; T.f0 = 0;
  T.a1x = 9.8 * w + (B.hips - 1) * 4; T.a1y = -B.ank; T.f1 = 0.04;
  if (B.fem) { T.a1x = 3.5; T.f1 = 0.05; }
  T.hd = -0.06 + br * 0.012 + B.hunch * 1.2;
  T.ex = C.player ? 'det' : 'mean';
}

function gait(T, C) {
  const { A, B } = C;
  const rk = clamp(A.speed / 390, 0, 1.1);
  const bk = A.backK;
  const d = 1;
  const u0 = ((A.phase / TAU) % 1 + 1) % 1;
  const u1 = (u0 + 0.5) % 1;
  const liftK = lerp(1, 0.45, C.A.crouchK);
  const f0 = gaitFoot(A, u0, rk, bk, liftK);
  const x0 = f0.x, y0 = f0.y, a0 = f0.a;
  const f1 = gaitFoot(A, u1, rk, bk, liftK);
  const x1 = f1.x, y1 = f1.y, a1 = f1.a;
  const s = A.stance;
  const bob = Math.cos(TAU * 2 * (u0 - s / 2));
  T.br = Math.sin(C.t * 3);
  T.px = rk * 1.5 - bk * 1.5;
  T.py = -(B.hipH - 1.2 - 2.4 * rk) + (0.5 + 1.8 * rk) * bob * (1 - bk * 0.5);
  T.pel = 0.05 + 0.1 * rk - bk * 0.08;
  T.lean = 0.02 + 0.2 * rk - bk * 0.1 + B.hunch;
  // accelerate/decelerate lean
  const acc = clamp((A.svx * C.facing - A.speed * (1 - 2 * bk)) * 0, -1, 1);
  T.lean += acc;
  T.tw = 0.18 * rk;
  T.sw = clamp(-x0 / A.stride, -1.2, 1.2) * 0.55 * Math.min(1, rk * 1.4);
  T.a0x = T.px * 0.3 + x0 * d; T.a0y = y0 - ankleLift(B, a0); T.f0 = a0;
  T.a1x = T.px * 0.3 + x1 * d; T.a1y = y1 - ankleLift(B, a1); T.f1 = a1;
  T.hd = 0.04 + rk * 0.02 + B.hunch * 1.2;
  T.fx = 0;
  T._swing1 = clamp(-x1 / A.stride, -1.2, 1.2); // far arm swing (opposite far leg)
  T._swing0 = clamp(-x0 / A.stride, -1.2, 1.2);
  T._rk = rk;
  T.ex = C.player ? 'det' : 'mean';
}

function crouchPose(T, C) {
  const { A, B } = C;
  const moving = A.speed > 20;
  const rk = clamp(A.speed / 200, 0, 1);
  T.br = Math.sin(C.t * 2.4) * 0.6;
  T.px = -1.5;
  T.py = -21 + T.br * 0.25;
  T.pel = 0.42;
  T.lean = 0.42 + B.hunch * 0.5;
  T.tw = 0.25;
  if (moving) {
    const u0 = ((A.phase / TAU) % 1 + 1) % 1;
    const f0 = gaitFoot(A, u0, 0, A.backK, 0.45);
    const x0 = f0.x, y0 = f0.y, a0 = f0.a;
    const f1 = gaitFoot(A, (u0 + 0.5) % 1, 0, A.backK, 0.45);
    T.a0x = -5 + x0 * 0.9; T.a0y = y0 - ankleLift(B, a0); T.f0 = a0;
    T.a1x = 6 + f1.x * 0.9; T.a1y = f1.y - ankleLift(B, f1.a); T.f1 = f1.a;
    T.py += Math.abs(Math.sin(A.phase)) * -1.2 * rk;
  } else {
    T.a0x = -12; T.a0y = -ankleLift(B, 0.55); T.f0 = 0.55;
    T.a1x = 10; T.a1y = -B.ank; T.f1 = 0;
  }
  T.hd = -0.12;
}

function airPose(T, C) {
  const { A, B } = C;
  const vy = A.svy;
  const kr = sat(-vy / 650), kf = sat((vy - 120) / 650);
  const ka = 1 - Math.max(kr, kf);
  const dx = clamp(-A.svx * C.facing * 0.012, -6, 6);
  T.br = 0;
  T.px = 0;
  T.py = -B.hipH - 2;
  T.pel = 0.1 * kr - 0.05 * kf + 0.18 * ka;
  T.lean = 0.06 + 0.12 * ka - 0.04 * kf + B.hunch * 0.5;
  T.tw = 0.2;
  // rising: far knee up, near leg trailing; apex: tuck; falling: legs reach down
  const hy = T.py;
  T.a1x = lerp(lerp(9, 11, ka), 8, kf) + dx;
  T.a1y = hy + lerp(lerp(30, 21, ka), 38, kf);
  T.f1 = lerp(lerp(0.55, 0.35, ka), -0.1, kf);
  T.a0x = lerp(lerp(-6, -2, ka), -6, kf) + dx;
  T.a0y = hy + lerp(lerp(40, 28, ka), 37, kf);
  T.f0 = lerp(lerp(0.85, 0.7, ka), 0.3, kf);
  T.hd = -0.05 - 0.08 * kf;
  // take-off stretch
  if (A.jumpT < 0.16) {
    const k = 1 - A.jumpT / 0.16;
    T.sqy = 1 + 0.1 * k;
    T.sqx = 1 - 0.06 * k;
  }
  T._kf = kf;
  T.ex = 'det';
}

function flipTuck(T, C, p) {
  const { B } = C;
  const tuck = Math.sin(p * PI);
  const hy = T.py;
  T.a0x = lerp(T.a0x, 6, tuck); T.a0y = lerp(T.a0y, hy + 16, tuck); T.f0 = lerp(T.f0, 0.9, tuck);
  T.a1x = lerp(T.a1x, 11, tuck); T.a1y = lerp(T.a1y, hy + 14, tuck);
  T.lean = lerp(T.lean, 0.55, tuck);
  T.pel = lerp(T.pel, 0.5, tuck);
  T.hd = lerp(T.hd, 0.3, tuck);
  T.rot = TAU * smooth(p) * C.A.flipDir;
  T.rpx = T.px + 4; T.rpy = T.py - 8;
  void B;
}

function climbPose(T, C) {
  const { A, B } = C;
  const c = A.climbPhase;
  const sc = Math.sin(c), cc = Math.cos(c);
  T.br = 0;
  T.px = -3;
  T.py = -B.hipH + 3 + Math.abs(cc) * 1.5;
  T.pel = 0.05;
  T.lean = 0.1;
  T.tw = 0.35;
  T.a0x = 1; T.a0y = -B.ank - 5 - 7 * (1 + sc); T.f0 = 0.1;
  T.a1x = 3; T.a1y = -B.ank - 5 - 7 * (1 - sc); T.f1 = 0.1;
  T.hd = -0.2;
  const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
  T.h0x = sN[0] + 17; T.h0y = sN[1] - 12 - 8 * (1 - sc) * 0.9; T.r0 = -1.2; T.hs0 = 'fist';
  T.h1x = sF[0] + 11; T.h1y = sF[1] - 13 - 8 * (1 + sc) * 0.9; T.r1 = -1.2; T.hs1 = 'fist';
  T.e0x = -0.6; T.e0y = 0.5; T.e1x = -0.3; T.e1y = 0.8;
  T.wv = 0;
  T.ex = 'focus';
}

function dashPose(T, C) {
  const { B } = C;
  T.px = 3;
  T.py = -B.hipH + 5;
  T.pel = 0.35;
  T.lean = 0.55;
  T.tw = 0.5;
  T.a0x = -24; T.a0y = -B.ank - 6; T.f0 = 0.9;
  T.a1x = 13; T.a1y = -B.ank - 10; T.f1 = 0.1;
  if (!C.onGround) { T.a0y -= 6; T.a1y -= 12; }
  T.sqx = 1.1; T.sqy = 0.93;
  T.hd = -0.35;
  T.ex = 'grit';
}

function hoverPose(T, C) {
  // jetpack flyer: legs dangle, body tilts with velocity
  const { A, B, t } = C;
  const tilt = clamp(A.svx * C.facing / 700, -0.4, 0.5);
  T.br = Math.sin(t * 3);
  T.px = 0; T.py = -B.hipH - 2 + Math.sin(t * 4) * 1.5;
  T.pel = 0.1 + tilt * 0.6;
  T.lean = 0.08 + tilt;
  T.tw = 0.25;
  T.a0x = -3 - tilt * 14 + Math.sin(t * 5) * 1.5; T.a0y = T.py + 40; T.f0 = 0.9;
  T.a1x = 3 - tilt * 14 + Math.sin(t * 5 + 1) * 1.5; T.a1y = T.py + 37; T.f1 = 0.75;
  T.hd = -tilt * 0.6;
  T.ex = 'mean';
}

// ------------------------------------------------------------- arms

function freeArm(T, C, near) {
  // relaxed hang / run swing for an unused arm
  const { B } = C;
  const sh = shoulderOfT(T, B, near);
  const rk = T._rk || 0;
  const swing = (near ? T._swing0 : T._swing1) || 0;
  const br = T.br || 0;
  const phi = swing * 0.9 * Math.min(1, rk * 1.3) + (near ? -0.05 : 0.12) + br * 0.02;
  const bend = lerp(0.35, lerp(0.5, 1.7, sat(swing * 0.5 + 0.5)), Math.min(1, rk * 1.5));
  const psi = phi + bend;
  const x = sh[0] + Math.sin(phi) * B.upper + Math.sin(psi) * B.fore * 0.95;
  const y = sh[1] + Math.cos(phi) * B.upper + Math.cos(psi) * B.fore * 0.95;
  if (near) { T.h0x = x; T.h0y = y; T.r0 = Math.atan2(Math.cos(psi), Math.sin(psi)); T.hs0 = rk > 0.4 ? 'fist' : 'relax'; }
  else { T.h1x = x; T.h1y = y; T.r1 = Math.atan2(Math.cos(psi), Math.sin(psi)); T.hs1 = rk > 0.4 ? 'fist' : 'relax'; }
}

function gunArms(T, C, e) {
  const { B, W, A } = C;
  const aim = C.aim;
  const ca = Math.cos(aim), sa = Math.sin(aim);
  const sN = shoulderOfT(T, B, 1);
  const two = W.hold !== 'pistol';
  const R = (two ? 0.64 : 0.86) * B.armLen;
  // engaged: gun axis passes through the gameplay pivot (so muzzle FX line up)
  const pv = C.pivot;
  const pyAdj = pv[1] + (sN[1] - pv[1]) * 0.25;
  const dx = pv[0] - sN[0], dy = pyAdj - sN[1];
  const dd = dx * ca + dy * sa;
  const disc = dd * dd - (dx * dx + dy * dy) + R * R;
  const g = disc > 0 ? -dd + Math.sqrt(disc) : -dd;
  const ay = (W.ay || 0) * (W.hs || 1);
  let gx = pv[0] + ca * g + sa * ay, gy = pyAdj + sa * g - ca * ay;
  const rc = A.recoil;
  const kb = (W.kickBack || 3) * Math.pow(rc, 1.4);
  const ku = (W.kickUp || 0.3) * rc * rc;
  gx -= ca * kb; gy -= sa * kb + ku * 5;
  const waE = aim - ku;
  // relaxed low-ready
  let waR, rx, ry;
  if (two) { waR = W.hold === 'heavy' ? 0.15 + aim * 0.3 : 0.5 + aim * 0.25; rx = sN[0] + 7; ry = sN[1] + (W.hold === 'heavy' ? 11 : 17); }
  else { waR = clamp(aim * 0.3 + 0.62, 0.3, 1.0); rx = sN[0] + 9; ry = sN[1] + 18.5; }
  T.wa = lerpA(waR, waE, e);
  T.h0x = lerp(rx, gx, e); T.h0y = lerp(ry, gy, e);
  T.r0 = T.wa;
  T.hs0 = 'grip';
  T.sup = two ? 1 : 0;
  T.tw = lerp(T.tw, two ? 0.7 : 0.42, e);
  T.lean += (aim * 0.14 - rc * 0.06 * (W.heavy || 0.3)) * e;
  T.hd = lerp(T.hd, clamp(aim * 0.55, -0.6, 0.45) + T.lean * 0.2, e);
  T.e0x = -0.25; T.e0y = 1;
  if (!two) freeArm(T, C, 0);
  if (rc > 0.4) T.ex = 'grit';
}

function bladeArms(T, C, e) {
  const { B, A } = C;
  const aim = C.aim;
  const sN = shoulderOfT(T, B, 1);
  if (A.slash > 0) {
    const p = 1 - A.slash / 0.22;
    const up = A.slashN % 2 === 0;
    const q = p < 0.12 ? p / 0.12 * 0.12 : 0.12 + easeOut((p - 0.12) / 0.6) * 0.88;
    const a0 = up ? aim + 1.25 : aim - 2.35, a1 = up ? aim - 2.0 : aim + 1.2;
    const ang = lerp(a0, a1, sat(q));
    const r = 21 * (1 - 0.15 * Math.sin(p * PI));
    T.h0x = sN[0] + Math.cos(ang - 0.3) * r; T.h0y = sN[1] + Math.sin(ang - 0.3) * r;
    T.wa = ang + 0.2; T.r0 = T.wa; T.hs0 = 'grip';
    const k = Math.sin(p * PI);
    T.tw = lerp(T.tw, 0.95, 0.8);
    T.lean += 0.22 * k + (up ? -0.1 : 0.1) * k;
    T.px += 3 * k;
    // two-handed on the hilt through the swing
    T.sup = 0;
    T.h1x = T.h0x - Math.cos(T.wa) * 5.5; T.h1y = T.h0y - Math.sin(T.wa) * 5.5; T.r1 = T.wa; T.hs1 = 'grip';
    T.ex = 'grit';
    T.fx |= 2;
    return;
  }
  // guard: blade forward-up like a katana stance
  const gx = lerp(sN[0] + 10, sN[0] + 14, e), gy = lerp(sN[1] + 16, sN[1] + 9, e);
  T.h0x = gx; T.h0y = gy;
  T.wa = lerp(-0.95 + aim * 0.2, aim - 0.55, e);
  T.r0 = T.wa; T.hs0 = 'grip';
  T.tw = lerp(T.tw, 0.5, e);
  freeArm(T, C, 0);
}

function clubArms(T, C) {
  const { B, W, A, act } = C;
  const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
  const aim = C.aim;
  const bat = C.wkey === 'bat';
  let gx, gy, wa;
  if (act === ACT.windup) {
    const k = easeOut(A.actAge / 0.2);
    gx = sN[0] + lerp(6, -8, k); gy = sN[1] + lerp(10, -14, k); wa = lerp(0.2, -2.5, k);
    T.lean -= 0.14 * k; T.tw = lerp(T.tw, 0.9, k); T.px -= 2 * k;
    T.h1x = sF[0] + 14; T.h1y = sF[1] + 4; T.r1 = 0; T.hs1 = 'open';
    T.ex = 'grit';
  } else if (act === ACT.attack) {
    const p = sat(A.actAge / 0.14);
    const ang = lerp(-2.5, 1.0 + aim * 0.3, easeOut(p));
    gx = sN[0] + Math.cos(ang - 0.35) * 21; gy = sN[1] + Math.sin(ang - 0.35) * 21; wa = ang + 0.25;
    T.lean += 0.3; T.tw = lerp(T.tw, 1, 0.8); T.px += 3;
    T.ex = 'grit'; T.fx |= 2;
    if (bat) { T.h1x = gx - Math.cos(wa) * 5; T.h1y = gy - Math.sin(wa) * 5; T.r1 = wa; T.hs1 = 'grip'; }
    else freeArm(T, C, 0);
  } else if (act === ACT.recover) {
    const k = 1 - smooth(A.actAge / 0.35);
    gx = sN[0] + lerp(10, 14, k); gy = sN[1] + lerp(17, 15, k); wa = lerp(bat ? -2.2 : 0.9, 1.1, k);
    if (bat) { gx = lerp(sN[0] + 8, gx, k); gy = lerp(sN[1] + 6, gy, k); }
    T.lean += 0.15 * k;
    freeArm(T, C, 0);
  } else {
    // idle carry
    const t = C.t;
    if (bat) { gx = sN[0] + 8; gy = sN[1] + 7 + Math.sin(t * 2.1) * 0.5; wa = -2.25; }
    else if (C.wkey === 'baton') { gx = sN[0] + 8; gy = sN[1] + 17; wa = 0.25 + Math.sin(t * 1.5) * 0.08; }
    else { gx = sN[0] + 7; gy = sN[1] + 19; wa = 0.95 + Math.sin(t * 1.3) * 0.06; }
    freeArm(T, C, 0);
    if (C.k === 'grunt' && !C.shield) { T.h1x = sF[0] + 10; T.h1y = sF[1] + 8; T.r1 = -0.4; T.hs1 = 'fist'; T.fk1 = 1.1; }
  }
  T.h0x = gx; T.h0y = gy; T.wa = wa; T.r0 = wa; T.hs0 = 'grip';
  void W;
}

function clawArms(T, C) {
  const { B, A, act, look } = C;
  const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
  const t = C.t;
  T.hs0 = T.hs1 = 'claw';
  T.wv = 0;
  if (act === ACT.windup || act === ACT.slam && A.actAge < 0.12) {
    const k = easeOut(A.actAge / 0.25);
    T.h0x = sN[0] + lerp(10, -4, k); T.h0y = sN[1] + lerp(4, -18, k); T.r0 = -2;
    T.h1x = sF[0] + lerp(10, 0, k); T.h1y = sF[1] + lerp(2, -20, k); T.r1 = -1.8;
    T.lean -= 0.18 * k; T.ex = 'grit';
    return;
  }
  if (act === ACT.attack || act === ACT.slam) {
    const p = sat(A.actAge / 0.16);
    const e = easeOut(p);
    T.h0x = sN[0] + lerp(-4, 22, e); T.h0y = sN[1] + lerp(-18, 16, e); T.r0 = lerp(-2, 0.8, e);
    T.h1x = sF[0] + lerp(0, 20, e); T.h1y = sF[1] + lerp(-20, 12, e); T.r1 = lerp(-1.8, 0.7, e);
    T.lean += 0.32 * e; T.ex = 'grit'; T.fx |= 4;
    return;
  }
  if (look.armsForward) {
    const sw = Math.sin(t * 2.3) * 3;
    T.h0x = sN[0] + 25; T.h0y = sN[1] + 5 + sw; T.r0 = 0.3;
    T.h1x = sF[0] + 23; T.h1y = sF[1] + 2 - sw; T.r1 = 0.25;
    T.e0x = -0.2; T.e0y = 1; T.e1x = 0; T.e1y = 1;
    return;
  }
  // menacing half-raised claws
  freeArm(T, C, 1);
  freeArm(T, C, 0);
  const br = Math.sin(t * 2.2);
  T.h0x += 5; T.h0y -= 5 + br; T.h1x += 6; T.h1y -= 7 - br;
  T.hs0 = T.hs1 = 'claw';
}

function fistArms(T, C) {
  const { B, A, act } = C;
  const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
  const t = C.t;
  const big = C.k === 'brute' || C.k === 'boss' || C.k === 'grunt';
  T.wv = 0;
  if (big) {
    // boxer guard, bobbing
    const b = Math.sin(t * 3.2) * 1.2;
    T.h0x = sN[0] + 15; T.h0y = sN[1] + 13 + b; T.r0 = -0.4; T.hs0 = 'fist';
    T.h1x = sF[0] + 15; T.h1y = sF[1] + 9 - b; T.r1 = -0.5; T.hs1 = 'fist';
    T.e0x = -0.6; T.e0y = 1; T.e1x = -0.3; T.e1y = 1;
    if (act === ACT.windup) {
      const k = easeOut(A.actAge / 0.25);
      T.h0x = sN[0] + lerp(13, -10, k); T.h0y = sN[1] + lerp(6, 2, k);
      T.lean -= 0.12 * k; T.tw = lerp(T.tw, -0.2, k); T.ex = 'grit';
    } else if (act === ACT.attack) {
      const e = easeOut(A.actAge / 0.1);
      T.h0x = sN[0] + lerp(-10, B.armLen * 0.95, e); T.h0y = sN[1] + lerp(2, 2, e); T.r0 = 0; T.fk0 = 1 + 0.5 * e;
      T.lean += 0.3 * e; T.tw = lerp(T.tw, 1, e); T.ex = 'grit'; T.fx |= 1;
    }
    return;
  }
  freeArm(T, C, 1);
  freeArm(T, C, 0);
  // hands resting on the belly for bloated zombies
  if (C.look.bloat) {
    T.h0x = sN[0] + 10; T.h0y = sN[1] + 20; T.hs0 = 'open'; T.r0 = 0.6;
    T.h1x = sF[0] + 9; T.h1y = sF[1] + 22; T.hs1 = 'open'; T.r1 = 0.4;
  }
}

function throwIdle(T, C) {
  const { B } = C;
  const sN = shoulderOfT(T, B, 1);
  const t = C.t;
  const toss = Math.abs(Math.sin(t * 3.6));
  T.h0x = sN[0] + 12; T.h0y = sN[1] + 20 + (1 - toss) * 1.5; T.r0 = -0.4; T.hs0 = 'cup';
  T.wa = -0.3;
  T.toss = C.A.speed < 60 ? toss : 0;
  freeArm(T, C, 0);
}

function pencilArms(T, C) {
  const { B } = C;
  const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
  const t = C.t;
  T.h0x = sN[0] + 9; T.h0y = sN[1] + 17; T.wa = -1.2 + Math.sin(t * 1.4) * 0.05; T.r0 = T.wa; T.hs0 = 'grip';
  T.h1x = sF[0] + 8; T.h1y = sF[1] + 22; T.hs1 = 'relax'; T.r1 = 1.2;
  freeArm(T, C, 0);
}

function shieldArm(T, C) {
  const { B, act, A } = C;
  const sF = shoulderOfT(T, B, 0);
  let fx = 11, fy = 9;
  if (act === ACT.shield) { fx = 13; fy = 5; }
  if (act === ACT.bash) { const k = Math.sin(sat(A.actAge / 0.3) * PI); fx = 13 + 8 * k; fy = 4; }
  T.h1x = sF[0] + fx; T.h1y = sF[1] + fy; T.r1 = -0.2; T.hs1 = 'fist';
  T.e1x = -0.6; T.e1y = 1;
}

function armsLayer(T, C) {
  const { W, A, act } = C;
  const e = C.e;
  switch (W.hold) {
    case 'pistol': case 'rifle': case 'heavy':
      gunArms(T, C, e);
      break;
    case 'blade': bladeArms(T, C, e); break;
    case 'club': clubArms(T, C); break;
    case 'claws': clawArms(T, C); break;
    case 'throw': throwIdle(T, C); break;
    case 'pencil': pencilArms(T, C); break;
    default: fistArms(T, C);
  }
  if (C.shield) shieldArm(T, C);
  // punches
  if (A.melee > 0 && W.hold !== 'blade') punch(T, C);
  // reload
  if (A.reloadT > 0 && (W.hold === 'pistol' || W.hold === 'rifle' || W.hold === 'heavy')) reload(T, C);
  // grenade / bomb throws
  if (act === ACT.throw) throwAct(T, C);
  else if ((A.throw || 0) > 0) bombToss(T, C);
  void e;
}

function punch(T, C) {
  const { A, B, W } = C;
  const p = 1 - A.melee / 0.2;
  const kind = A.punchKind;
  const ext = p < 0.28 ? easeOut(p / 0.28) : p < 0.62 ? 1 : 1 - smooth((p - 0.62) / 0.38);
  const aim = clamp(C.aim, -0.7, 0.55);
  const ca = Math.cos(aim), sa = Math.sin(aim);
  const gun = W.hold === 'pistol' || W.hold === 'rifle' || W.hold === 'heavy';
  const two = W.hold === 'rifle' || W.hold === 'heavy';
  const useFar = kind === 1 || two || (kind === 3 && W.hold !== 'none');
  T.fx |= 1;
  T.ex = 'grit';
  if (kind === 3) {
    // uppercut: body dips then extends; fist rises from the hip past the chin
    const q = easeOut(sat(p / 0.5));
    const k = Math.sin(sat(p / 0.75) * PI * 0.5) * (1 - smooth((p - 0.7) / 0.3));
    T.py -= 4 * q; T.lean = lerp(T.lean + 0.25, T.lean - 0.18, q); T.tw = lerp(T.tw, useFar ? -0.3 : 1, 0.8);
    T.hd -= 0.2 * q;
    T.a0x -= 2; T.f0 = lerp(T.f0, 0.5, q);
    const sh = shoulderOfT(T, B, useFar ? 0 : 1);
    const hx = sh[0] + lerp(4, 13, q), hy = sh[1] + lerp(20, -18, q);
    if (useFar) {
      T.h1x = hx; T.h1y = hy; T.r1 = -1.35; T.hs1 = 'fist'; T.fk1 = 1 + 0.95 * k; T.sup = 0; T.e1x = 0.5; T.e1y = 1;
      if (gun) { const sN = shoulderOfT(T, B, 1); T.h0x = sN[0] + 8; T.h0y = sN[1] + 19; T.wa = 0.8; T.r0 = T.wa; }
    } else { T.h0x = hx; T.h0y = hy; T.r0 = -1.35; T.wa = -1.9; T.hs0 = 'fist'; T.fk0 = 1 + 0.95 * k; T.e0x = 0.4; T.e0y = 1; }
    T.fx |= 8;
    return;
  }
  // torso first: jab = quick lead-hand snap, cross = full hip/shoulder rotation
  if (useFar) {
    T.tw = lerp(T.tw, kind === 2 ? 0.2 : -0.35, ext);
    T.lean += (kind === 2 ? 0.2 : 0.1) * ext;
  } else {
    T.tw = lerp(T.tw, 1.05, ext);
    T.lean += 0.2 * ext;
    T.f0 = lerp(T.f0, 0.55, ext);
  }
  T.px += 2.5 * ext;
  const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
  const reach = B.armLen * 0.97;
  if (useFar) {
    if (gun) {
      // drop the gun to low ready so the punching fist reads
      const k = Math.min(1, ext * 1.5);
      T.h0x = lerp(T.h0x, sN[0] + 8, k); T.h0y = lerp(T.h0y, sN[1] + 19, k);
      T.wa = lerpA(T.wa, 0.7, k); T.r0 = T.wa;
    }
    T.h1x = lerp(sF[0] + 9, sF[0] + ca * reach, ext); T.h1y = lerp(sF[1] + 6, sF[1] + sa * reach, ext);
    T.r1 = aim; T.hs1 = 'fist'; T.fk1 = 1 + 0.6 * ext; T.sup = 0;
    T.e1x = 0; T.e1y = 1;
  } else {
    T.h0x = lerp(sN[0] + 8, sN[0] + ca * reach, ext); T.h0y = lerp(sN[1] + 10, sN[1] + sa * reach, ext);
    T.r0 = aim; T.wa = aim - 1.7; T.hs0 = 'fist'; T.fk0 = 1 + 0.6 * ext;
    T.e0x = 0; T.e0y = 1;
    // lead hand guards the chin
    T.h1x = sF[0] + 10; T.h1y = sF[1] + 3; T.r1 = -0.8; T.hs1 = 'fist'; T.sup = 0;
  }
}

function reload(T, C) {
  const { A, B, W } = C;
  const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
  const rt = A.reloadT % 0.9;
  const two = W.hold !== 'pistol';
  const k = smooth(A.reloadT / 0.12);
  const wa = two ? -0.5 : -0.75;
  T.h0x = lerp(T.h0x, sN[0] + (two ? 9 : 12), k); T.h0y = lerp(T.h0y, sN[1] + (two ? 12 : 11), k);
  T.wa = lerpA(T.wa, wa, k); T.r0 = T.wa;
  T.sup = 0;
  // magazine well in world space
  const hs = W.hs || 1;
  const mw = W.mag ? [W.mag[0] * hs, W.mag[1] * hs] : [4, 7];
  const c = Math.cos(T.wa), s = Math.sin(T.wa);
  const mx = T.h0x + mw[0] * c - mw[1] * s, my = T.h0y + mw[0] * s + mw[1] * c;
  let hx, hy, mag = 0;
  if (rt < 0.2) { const q = rt / 0.2; hx = lerp(sF[0] + 10, mx, easeOut(q)); hy = lerp(sF[1] + 14, my + 2, easeOut(q)); }
  else if (rt < 0.42) { const q = (rt - 0.2) / 0.22; hx = lerp(mx, sF[0] + 5, easeOut(q)); hy = lerp(my + 2, sF[1] + 26, easeOut(q)); mag = 1; }
  else if (rt < 0.66) { const q = (rt - 0.42) / 0.24; hx = lerp(sF[0] + 5, mx, smooth(q)); hy = lerp(sF[1] + 26, my + 3, smooth(q)); mag = 2; }
  else if (rt < 0.78) { const q = (rt - 0.66) / 0.12; hx = mx; hy = lerp(my + 3, my - 0.5, easeOut(q)); mag = 2; }
  else { const q = (rt - 0.78) / 0.12; hx = lerp(mx, mx - c * 5 + s * 3, q); hy = lerp(my, my - s * 5 - c * 7, q); }
  T.h1x = hx; T.h1y = hy; T.r1 = T.wa + 1.2; T.hs1 = mag ? 'cup' : 'grip';
  T.mag = mag;
  T.hd = 0.28;
  T.tw = lerp(T.tw, 0.35, k);
  T.ex = 'focus';
}

function throwAct(T, C) {
  const { A, B, W } = C;
  const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
  const age = A.actAge;
  const aim = clamp(C.aim, -0.8, 0.3);
  const noProp = W.hold === 'none' || W.hold === 'claws';
  if (noProp) {
    // bile heave: lean back, then lurch forward mouth-first
    if (age < 0.32) {
      const k = easeOut(age / 0.25);
      T.lean -= 0.3 * k; T.hd -= 0.3 * k; T.py += 2 * k;
      T.h0x = sN[0] + 8; T.h0y = sN[1] + 22; T.h1x = sF[0] + 8; T.h1y = sF[1] + 22; T.hs0 = T.hs1 = 'open';
      T.ex = 'grit';
    } else {
      const k = easeOut((age - 0.32) / 0.12);
      T.lean += 0.4 * k; T.hd += 0.25 * k; T.px += 3 * k;
      T.mouth = 1; T.ex = 'shout';
    }
    return;
  }
  if (age < 0.34) {
    const k = easeOut(age / 0.26);
    T.lean -= 0.2 * k; T.tw = lerp(T.tw, -0.1, k); T.px -= 2 * k;
    T.a1y -= 3 * k;
    const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
    T.h0x = sN[0] + lerp(9, -15, k); T.h0y = sN[1] + lerp(14, -11, k); T.r0 = -2.4; T.hs0 = 'cup';
    T.h1x = sF[0] + Math.cos(aim) * 22; T.h1y = sF[1] + Math.sin(aim) * 22 - 3; T.r1 = aim; T.hs1 = 'point';
    T.ex = 'grit';
    T.e0x = -0.8; T.e0y = -0.2;
  } else {
    const q = sat((age - 0.34) / 0.14);
    T.lean += 0.35 * easeOut(q); T.tw = lerp(T.tw, 1, q); T.px += 3 * q;
    T.a0x -= 3 * q; T.f0 = lerp(T.f0, 0.6, q);
    const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
    const ang = lerp(-2.6, 0.45 + aim * 0.4, easeOut(q));
    const r = lerp(24, 29, q);
    T.h0x = sN[0] + Math.cos(ang) * r; T.h0y = sN[1] + Math.sin(ang) * r; T.r0 = ang; T.hs0 = q > 0.4 ? 'open' : 'cup';
    T.e0x = 0.2; T.e0y = 1;
    T.h1x = sF[0] - 9; T.h1y = sF[1] + 14; T.r1 = 2.2; T.hs1 = 'fist'; T.e1x = -1; T.e1y = 0.3; T.sup = 0;
    T.toss = -1; // prop released
    T.ex = 'shout';
    T.fx |= 2;
  }
}

function bombToss(T, C) {
  const { A, B } = C;
  const sF = shoulderOfT(T, B, 0);
  const p = 1 - A.throw / 0.3;
  const ang = p < 0.35 ? lerp(0.5, -2.5, easeOut(p / 0.35)) : lerp(-2.5, 0.6 + C.aim * 0.4, easeOut((p - 0.35) / 0.4));
  T.h1x = sF[0] + Math.cos(ang) * 25; T.h1y = sF[1] + Math.sin(ang) * 25; T.r1 = ang; T.hs1 = p < 0.5 ? 'cup' : 'open';
  T.sup = 0;
  T.e1x = -0.8; T.e1y = 0.2;
}

// ----------------------------------------------------- state overrides

function lying(T, C, onBack) {
  const { B, t } = C;
  T.px = 0; T.py = -B.hipH;
  T.br = Math.sin(t * 1.6);
  if (onBack) {
    // standing-frame pose; root rotation lays it on its back
    T.pel = -0.05; T.lean = -0.12; T.tw = -0.1; T.sw = 0;
    T.a0x = T.px - 5; T.a0y = T.py + 30; T.f0 = -0.6;
    T.a1x = T.px - 3; T.a1y = T.py + 42; T.f1 = -0.9;
    const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
    T.h0x = sN[0] - 7; T.h0y = sN[1] - 24; T.r0 = -1.8; T.hs0 = 'open';
    T.h1x = sF[0] - 6; T.h1y = sF[1] + 18; T.r1 = 1.4; T.hs1 = 'open';
    T.e0x = -0.5; T.e0y = 0; T.e1x = -1; T.e1y = 0.3;
    T.rot = -PI / 2; T.rpx = T.px; T.rpy = T.py; T.rtx = -T.px + 2; T.rty = -13.5 * B.chest - T.py;
    T.hd = -0.25;
  } else {
    T.pel = 0.05; T.lean = 0.1; T.tw = 0.3;
    T.a0x = T.px + 4; T.a0y = T.py + 44; T.f0 = 1.2;
    T.a1x = T.px + 5; T.a1y = T.py + 41; T.f1 = 1.1;
    const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
    T.h0x = sN[0] + 5; T.h0y = sN[1] - 26; T.r0 = -1.5; T.hs0 = 'claw';
    T.h1x = sF[0] + 8; T.h1y = sF[1] - 20; T.r1 = -1.4; T.hs1 = 'claw';
    T.e0x = 1; T.e0y = 0; T.e1x = 1; T.e1y = 0;
    T.rot = PI / 2; T.rpx = T.px; T.rpy = T.py; T.rtx = -T.px - 4; T.rty = -12.5 * B.chest - T.py;
    T.hd = -0.75;
  }
  T.wv = 0;
  T.sup = 0;
  T.ex = 'daze';
}

function applyState(T, C, act, age) {
  const { A, B, t } = C;
  switch (act) {
    case ACT.stunned:
    case ACT.stagger: {
      const w = Math.sin(t * 5.2), w2 = Math.sin(t * 3.1 + 1);
      T.px += w * 3.2; T.py += 3 + Math.abs(w2) * 1.5;
      T.lean = -0.22 + w2 * 0.16; T.pel = -0.05 + w * 0.08;
      T.hd = 0.25 + w * 0.25; T.tw = 0.1 + w2 * 0.15;
      T.a0x = -9 + w * 2; T.a1x = 7 - w * 2;
      const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
      T.h0x = sN[0] - 3 + w * 5; T.h0y = sN[1] + 25; T.r0 = 1.6; T.hs0 = 'relax'; T.wa = 1.4;
      T.h1x = sF[0] + 6 - w * 4; T.h1y = sF[1] + 26; T.r1 = 1.5; T.hs1 = 'open';
      T.sup = 0;
      T.ex = 'daze';
      return 1;
    }
    case ACT.knockdown: {
      lying(T, C, true);
      const tw = Math.sin(t * 9) * Math.max(0, 1 - age * 1.5);
      T.a0y += tw * 3;
      return 1;
    }
    case ACT.getup: {
      const p = sat(age / 0.55);
      const L = C.tmpA || (C.tmpA = newT());
      const S = C.tmpB || (C.tmpB = newT());
      copyT(L, T); lying(L, C, !C.wasFront);
      copyT(S, T);
      // sitting / kneeling midpoint
      S.px = -2; S.py = -14; S.pel = -0.2; S.lean = -0.05; S.tw = 0.2; S.rot = 0;
      S.a0x = -4; S.a0y = -B.ank - 1; S.f0 = 0.9; S.a1x = 12; S.a1y = -B.ank; S.f1 = 0;
      const sN = shoulderOfT(S, B, 1), sF = shoulderOfT(S, B, 0);
      S.h0x = sN[0] - 8; S.h0y = -6; S.r0 = 1.4; S.hs0 = 'open';
      S.h1x = sF[0] + 8; S.h1y = sF[1] + 22; S.r1 = 1.2; S.hs1 = 'open'; S.sup = 0; S.wv = 0; S.ex = 'daze';
      if (p < 0.5) blendT(T, L, S, smooth(p / 0.5));
      else blendT(T, S, T, smooth((p - 0.5) / 0.5));
      return 1;
    }
    case ACT.downed: {
      lying(T, C, false);
      const tw = Math.sin(t * 2.2);
      T.h0x += tw * 4; T.h1x -= tw * 3; T.hd += Math.max(0, Math.sin(t * 0.9)) * 0.3;
      T.ex = 'mean';
      return 1;
    }
    case ST_DOWN: {
      lying(T, C, true);
      // reach up for help, weak wave
      const sF = shoulderOfT(T, B, 0);
      const w = Math.sin(t * 2.4);
      T.h1x = sF[0] + 25; T.h1y = sF[1] + 4 + w * 3; T.r1 = 0.1; T.hs1 = 'open';
      T.e1x = -0.3; T.e1y = 1;
      T.hd = -0.35 + w * 0.05;
      T.ex = 'pain';
      return 1;
    }
    case ST_REVIVE: {
      const pump = Math.max(0, Math.sin(t * 9));
      T.px = -1; T.py = -24 + pump * 1.5; T.pel = 0.35; T.lean = 0.55 + pump * 0.06; T.tw = 0.2;
      T.a0x = -14; T.a0y = -3.2; T.f0 = 1.35;
      T.a1x = 9; T.a1y = -B.ank; T.f1 = 0;
      T.h0x = 20; T.h0y = -12 + pump * 2.5; T.r0 = 0.6; T.hs0 = 'open';
      T.h1x = 24; T.h1y = -11 + pump * 2.5; T.r1 = 0.5; T.hs1 = 'open';
      T.sup = 0; T.wv = 0; T.hd = 0.45;
      T.ex = 'focus';
      return 1;
    }
    case ACT.tied: {
      const wr = Math.max(0, Math.sin(t * 1.3)) ;
      const wig = Math.sin(t * 11) * wr;
      T.px = -2; T.py = -9 - wr * 1.5; T.pel = -0.55; T.lean = -0.08 + wig * 0.07; T.tw = 0.15;
      T.a0x = 20; T.a0y = -B.ank + wig * -1; T.f0 = -0.3;
      T.a1x = 22.5; T.a1y = -B.ank - 1; T.f1 = -0.3;
      const [wx, wy] = waistOf(T, B);
      T.h0x = wx - 9; T.h0y = wy + 3; T.r0 = 2.4; T.hs0 = 'fist';
      T.h1x = wx - 8; T.h1y = wy + 4; T.r1 = 2.4; T.hs1 = 'fist';
      T.e0x = -1; T.e0y = 0.1; T.e1x = -1; T.e1y = 0.1;
      T.hd = -0.1 + Math.sin(t * 1.7) * 0.15;
      T.sup = 0; T.wv = 0; T.fx |= 16;
      T.ex = wr > 0.4 ? 'shout' : 'scared';
      T.mouth = wr > 0.4 ? 0.6 + 0.4 * Math.abs(Math.sin(t * 7)) : 0;
      return 1;
    }
    case ACT.cover: {
      T.px = -3; T.py = -20 + Math.sin(t * 2) * 0.3; T.pel = 0.25; T.lean = 0.15; T.tw = 0.1;
      T.a0x = -14; T.a0y = -3.3; T.f0 = 1.3;
      T.a1x = 8; T.a1y = -B.ank; T.f1 = 0;
      const sN = shoulderOfT(T, B, 1);
      if (C.W.hold === 'pistol' || C.W.hold === 'rifle' || C.W.hold === 'heavy') {
        T.h0x = sN[0] + 9; T.h0y = sN[1] + 4; T.wa = -1.3; T.r0 = T.wa; T.hs0 = 'grip';
        if (C.W.hold !== 'pistol') { T.sup = 1; } else { const sF = shoulderOfT(T, B, 0); T.h1x = sF[0] + 8; T.h1y = sF[1] + 14; T.hs1 = 'fist'; T.sup = 0; }
      }
      T.hd = 0.28 + Math.max(0, Math.sin(t * 0.7)) * -0.35;
      T.ex = 'focus';
      return 1;
    }
    case ACT.peek: {
      const k = easeOut(age / 0.16);
      T.py = lerp(-20, -34, k); T.px -= 1;
      T.a0x = lerp(-14, -12, k); T.a0y = -3.3; T.f0 = 1.2; T.a1x = 9; T.a1y = -B.ank;
      T.lean = lerp(0.15, 0.2, k); T.pel = 0.3;
      C.e = 1;
      gunArms(T, C, 1);
      T.ex = 'grit';
      return 1;
    }
    case ACT.shield: {
      if (!C.shield) return 0;
      T.lean += 0.14; T.py += 2.5; T.a0x -= 3; T.a1x += 2;
      T.hd -= 0.1;
      T.ex = 'grit';
      return 1;
    }
    case ACT.bash: {
      const k = Math.sin(sat(age / 0.32) * PI);
      T.lean = 0.45 * k + T.lean * (1 - k); T.pel = 0.3 * k;
      T.px += 5 * k; T.py += 3 * k;
      T.a0x = lerp(T.a0x, -20, k); T.a0y = lerp(T.a0y, -B.ank - 4, k); T.f0 = lerp(T.f0, 0.9, k);
      T.a1x = lerp(T.a1x, 15, k); T.a1y = lerp(T.a1y, -B.ank, k);
      T.hd = -0.4 * k; T.tw = lerp(T.tw, -0.3, k);
      T.ex = 'grit';
      return 1;
    }
    case ACT.dodge: {
      const p = sat(age / 0.38);
      const dir = Math.sign(A.svx * C.facing) || -1;
      const tuck = Math.sin(p * PI);
      T.py = lerp(-B.hipH + 6, -17, tuck); T.lean = lerp(T.lean, 0.9, tuck); T.pel = lerp(T.pel, 0.9, tuck);
      T.a0x = lerp(T.a0x, 4, tuck); T.a0y = lerp(T.a0y, T.py + 18, tuck); T.f0 = lerp(T.f0, 0.8, tuck);
      T.a1x = lerp(T.a1x, 9, tuck); T.a1y = lerp(T.a1y, T.py + 16, tuck);
      const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
      T.h0x = lerp(T.h0x, sN[0] + 10, tuck); T.h0y = lerp(T.h0y, sN[1] + 14, tuck);
      T.h1x = lerp(T.h1x, sF[0] + 12, tuck); T.h1y = lerp(T.h1y, sF[1] + 14, tuck); T.hs1 = 'fist'; T.sup = 0;
      T.hd = lerp(T.hd, 0.4, tuck);
      T.rot = TAU * smooth(p) * dir; T.rpx = 2; T.rpy = T.py - 3;
      T.ex = 'grit';
      return 1;
    }
    case ACT.callout: {
      const sF = shoulderOfT(T, B, 0);
      const pump = Math.sin(t * 7) * 0.08;
      const a = -0.25 + pump;
      T.h1x = sF[0] + Math.cos(a) * 28; T.h1y = sF[1] + Math.sin(a) * 28; T.r1 = a; T.hs1 = 'point'; T.sup = 0;
      T.e1x = 0; T.e1y = 1;
      T.lean -= 0.08; T.hd = -0.15; T.tw = lerp(T.tw, -0.25, 0.8);
      T.mouth = 0.7 + 0.3 * Math.abs(Math.sin(t * 9));
      T.ex = 'shout';
      return 1;
    }
    case ACT.draw: {
      const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
      const w = t * 16;
      T.h0x = sN[0] + 15 + Math.cos(w) * 5; T.h0y = sN[1] + 4 + Math.sin(w * 2) * 3.5;
      T.wa = 0.25 + Math.sin(w) * 0.12; T.r0 = T.wa; T.hs0 = 'grip';
      T.h1x = sF[0] + 10; T.h1y = sF[1] + 10; T.r1 = -0.3; T.hs1 = 'relax';
      T.lean += 0.14; T.tw = lerp(T.tw, 0.5, 0.8); T.hd = 0.18;
      T.sup = 0;
      T.ex = 'focus'; T.fx |= 32;
      return 1;
    }
    case ACT.flee: {
      const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
      const w = t * 14;
      T.h0x = sN[0] - 4 + Math.sin(w) * 5; T.h0y = sN[1] - 22 + Math.cos(w) * 3; T.r0 = -1.6; T.hs0 = 'open';
      T.h1x = sF[0] + 5 - Math.sin(w) * 5; T.h1y = sF[1] - 21 - Math.cos(w) * 3; T.r1 = -1.4; T.hs1 = 'open';
      T.e0x = -1; T.e0y = 0.2; T.e1x = -1; T.e1y = 0.4;
      T.sup = 0; T.hd = -0.3; T.lean = Math.max(T.lean, 0.28);
      T.mouth = 1; T.ex = 'scared'; T.fx |= 64;
      return 1;
    }
    case ACT.patrol: {
      C.e = 0;
      T.hd = 0.08 + Math.sin(t * 1.1) * 0.06;
      T.lean = Math.min(T.lean, 0.06 + B.hunch);
      T.ex = 'calm';
      return 1;
    }
    case ACT.alert: {
      const k = age < 0.1 ? easeOut(age / 0.1) : 1 - 0.3 * smooth((age - 0.1) / 0.4);
      T.py -= 5 * Math.sin(sat(age / 0.25) * PI);
      T.lean -= 0.2 * k; T.hd -= 0.2 * k;
      const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
      T.h0x = lerp(T.h0x, sN[0] + 4, k); T.h0y = lerp(T.h0y, sN[1] - 8, k); T.hs0 = C.W.hold === 'none' || C.W.hold === 'claws' ? 'open' : T.hs0;
      T.h1x = lerp(T.h1x, sF[0] + 14, k); T.h1y = lerp(T.h1y, sF[1] - 12, k); T.hs1 = 'open'; T.sup = 0;
      T.ex = 'surp'; T.fx |= 128;
      return 1;
    }
    case ACT.charge: {
      T.lean = 0.55; T.pel = 0.3; T.hd = -0.4; T.tw = 0.8;
      const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
      T.h0x = sN[0] + 12; T.h0y = sN[1] + 10; T.hs0 = 'fist';
      T.h1x = sF[0] + 8; T.h1y = sF[1] + 14; T.hs1 = 'fist';
      T.ex = 'grit';
      return 1;
    }
    case ACT.slam: {
      if (C.W.hold === 'claws') return 0;
      const p = sat(age / 0.18);
      const up = age < 0.08;
      const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
      if (up) { T.h0x = sN[0] + 4; T.h0y = sN[1] - 22; T.h1x = sF[0] + 4; T.h1y = sF[1] - 24; T.lean -= 0.2; }
      else {
        T.lean = 0.55 * easeOut(p); T.py += 8 * easeOut(p);
        T.h0x = sN[0] + 20; T.h0y = -8; T.h1x = sF[0] + 18; T.h1y = -7;
        T.fx |= 4;
      }
      T.hs0 = T.hs1 = 'fist'; T.fk0 = T.fk1 = 1.3; T.sup = 0; T.ex = 'grit';
      return 1;
    }
    case ACT.summon: {
      const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
      const k = easeOut(age / 0.25);
      T.h0x = sN[0] - 6; T.h0y = sN[1] - 24 * k; T.r0 = -1.8; T.hs0 = 'claw';
      T.h1x = sF[0] + 10; T.h1y = sF[1] - 26 * k; T.r1 = -1.2; T.hs1 = 'claw';
      T.e0x = -1; T.e0y = 0.2; T.e1x = -0.5; T.e1y = 0.5;
      T.lean -= 0.2 * k; T.hd -= 0.3 * k; T.sup = 0;
      T.mouth = 1; T.ex = 'shout';
      return 1;
    }
    case ACT.leap: {
      const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
      T.h0x = sN[0] + 2; T.h0y = sN[1] - 20; T.h1x = sF[0] + 6; T.h1y = sF[1] - 22; T.hs0 = T.hs1 = 'fist'; T.sup = 0;
      T.ex = 'grit';
      return 1;
    }
    case ACT.dive: {
      const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
      T.lean = 0.9; T.pel = 0.8; T.hd = -0.7;
      T.h0x = sN[0] + 14; T.h0y = sN[1] + 14; T.h1x = sF[0] + 16; T.h1y = sF[1] + 12; T.hs0 = T.hs1 = 'fist'; T.sup = 0;
      T.a0x = T.px - 16; T.a0y = T.py + 34; T.a1x = T.px - 12; T.a1y = T.py + 38;
      T.ex = 'grit';
      return 1;
    }
    case ACT.windup: {
      if (C.k === 'brute' || C.k === 'boss') {
        T.lean -= 0.12; T.py += 2; T.ex = 'grit';
        if (C.W.hold !== 'none' && C.W.hold !== 'claws') {
          const sF = shoulderOfT(T, B, 0);
          T.h1x = sF[0] + 4; T.h1y = sF[1] - 20; T.hs1 = 'fist'; T.sup = 0;
        }
        return 1;
      }
      return 0;
    }
    case ACT.aim: case ACT.fire: case ACT.spray: {
      if (act !== ACT.aim) T.ex = 'grit';
      else T.ex = 'focus';
      return 0;
    }
    case ACT.recover: return 0;
    default: return 0;
  }
}

// ----------------------------------------------------------- main entry

// Callers that draw without ever calling updateAnim (e.g. the comic cover)
// may set anim.speed / anim.phase directly: derive the blend weights from them.
function staticAnim(A, ent) {
  const sp = A.speed || Math.abs(ent.vx || 0);
  A.runK = ent.onGround !== false ? Math.min(1.2, sp / 390) : 0;
  A.airK = ent.onGround === false ? 1 : 0;
  A.crouchK = ent.crouch ? 1 : 0;
  A.climbK = ent.climb ? 1 : 0;
  A.svx = sp * (ent.facing < 0 ? -1 : 1); A.svy = ent.vy || 0;
  A.aim.x = localAim(ent); A.aim.v = 0;
  A.engage = 1;
  A.stride = 20; A.stance = 0.4;
  A.jumpT = 9; A.flipT = 9;
}

export function computePose(ent, A, opts, B) {
  if (!A._upd) staticAnim(A, ent);
  const C = makeCtx(ent, A, opts);
  C.B = B;
  const look = C.look;
  const T = A._T || (A._T = newT());
  const Tb = A._Tb || (A._Tb = newT());
  const Tc = A._Tc || (A._Tc = newT());
  const Tp = A._Tp || (A._Tp = newT());
  const Tx = A._Tx || (A._Tx = newT());

  // ---- locomotion base (every field rebuilt from scratch each frame)
  resetT(T);
  stand(T, C);
  const rkw = sat(A.runK * 3.5);
  if (rkw > 0.001 && !C.flying) {
    gait(Tx, C);
    Tx.ex = T.ex;
    blendT(T, T, Tx, rkw);
  } else { T._rk = 0; T._swing0 = T._swing1 = 0; }
  if (A.crouchK > 0.01) { copyT(Tx, T); crouchPose(Tx, C); blendT(T, T, Tx, A.crouchK); }
  if (C.flying) hoverPose(T, C);
  else if (A.airK > 0.01) { copyT(Tx, T); airPose(Tx, C); blendT(T, T, Tx, A.airK); T.sqx = Tx.sqx; T.sqy = Tx.sqy; }
  if (A.climbK > 0.01) { copyT(Tx, T); climbPose(Tx, C); blendT(T, T, Tx, A.climbK); }
  if (A.dashK > 0.01) { copyT(Tx, T); dashPose(Tx, C); blendT(T, T, Tx, A.dashK); T.sqx = lerp(1, Tx.sqx, A.dashK); T.sqy = lerp(1, Tx.sqy, A.dashK); }
  // landing squash
  if (A.land > 0 && C.onGround) {
    const L = A.land * A.land;
    T.py += 11 * L; T.lean += 0.2 * L; T.pel += 0.25 * L; T.hd -= 0.1 * L;
    T.sqy *= 1 - 0.09 * L; T.sqx *= 1 + 0.07 * L;
  }
  // turn: quick squash when flipping facing
  if (A.turnT < 0.12) { const k = 1 - A.turnT / 0.12; T.sqx *= 1 - 0.1 * k; }

  // ---- arms
  const climbing = A.climbK > 0.5;
  if (!climbing) {
    const keepH0 = T.h0x, keepH1 = T.h1x;
    armsLayer(T, C);
    if (A.climbK > 0.01) { /* arms blend handled above */ void keepH0; void keepH1; }
  } else if (A.recoil > 0.3 || A.engage > 0.8) {
    gunArms(T, C, 1);
  }

  // ---- full-body states (cross-faded)
  const act = C.act;
  if (A.flung > 0 && !C.onGround && act !== ACT.knockdown) {
    copyT(Tc, T);
    const k = sat(A.flung / 0.25);
    Tc.lean = -0.35; Tc.hd = 0.3; Tc.pel = -0.2;
    const sN = shoulderOfT(Tc, B, 1), sF = shoulderOfT(Tc, B, 0);
    Tc.h0x = sN[0] + 16; Tc.h0y = sN[1] - 12; Tc.hs0 = 'open'; Tc.h1x = sF[0] + 18; Tc.h1y = sF[1] - 8; Tc.hs1 = 'open'; Tc.sup = 0;
    Tc.a0x = Tc.px + 12; Tc.a0y = Tc.py + 36; Tc.a1x = Tc.px + 16; Tc.a1y = Tc.py + 32;
    Tc.ex = 'pain';
    blendT(T, T, Tc, k);
  }
  if (act !== -1 || A.pact !== -1) {
    copyT(Tb, T);
    copyT(Tc, T);
    C.wasFront = A.pact === ACT.downed;
    const wc = act !== -1 ? applyState(Tc, C, act, A.actAge) : 0;
    const x = A.xfade;
    if (x < 1 && A.pact !== -1 && A.pact !== act) {
      copyT(Tp, Tb);
      const fromLying = A.pact === ACT.knockdown || A.pact === ACT.downed || A.pact === ST_DOWN;
      const wp = applyState(Tp, C, A.pact, A.pactAge + A.actAge);
      const xf = fromLying && act !== ACT.getup ? sat(A.actAge / 0.4) : x;
      blendT(Tp, Tb, Tp, wp);
      blendT(Tc, Tb, Tc, wc);
      blendT(T, Tp, Tc, smooth(xf));
    } else blendT(T, Tb, Tc, wc);
  }
  // flip on double jump (drawn as a root rotation)
  if (A.flipT < 0.42 && A.airK > 0.3) flipTuck(T, C, A.flipT / 0.42);

  // hurt flinch
  const fl = A.flinch.x;
  if (fl !== 0) {
    T.lean -= fl * 0.045; T.hd -= fl * 0.06; T.px -= fl * 0.35;
  }
  if (A.hurt > 0.08 && T.ex !== 'daze') T.ex = 'pain';
  if (opts.asleep) T.ex = 'sleep';
  C.T = T;
  return C;
}

// ------------------------------------------------------------ solve IK

export function solve(C) {
  const { T, B } = C;
  const S = C.S || (C.S = {});
  // pelvis + hips
  const hN = fp(T.px, T.py, T.pel, -B.hipX, 0.6);
  const hF = fp(T.px, T.py, T.pel, B.hipX, 0);
  // keep feet reachable: lower the hips instead of over-stretching legs
  const L = (B.thigh + B.shin) * 0.975;
  let drop = 0;
  if (!T.rot && C.onGround && C.A.airK < 0.5 && C.A.climbK < 0.5) {
    for (const [hx, hy, ax, ay] of [[hN[0], hN[1], T.a0x, T.a0y], [hF[0], hF[1], T.a1x, T.a1y]]) {
      const dx = ax - hx;
      if (Math.abs(dx) < L) {
        const need = ay - Math.sqrt(L * L - dx * dx);
        if (need > hy + drop) drop = need - hy;
      }
    }
  }
  if (drop > 0) { T.py += drop; hN[1] += drop; hF[1] += drop; }
  S.hipN = hN; S.hipF = hF;
  const kh = fp(0, 0, T.pel, 1, 0.25);
  S.legN = ik(hN[0], hN[1], T.a0x, T.a0y, B.thigh, B.shin, kh[0], kh[1], S.legN || {});
  S.legF = ik(hF[0], hF[1], T.a1x, T.a1y, B.thigh, B.shin, kh[0], kh[1], S.legF || {});
  // torso
  S.waist = waistOf(T, B);
  S.neck = fp(S.waist[0], S.waist[1], T.lean, 0, -B.chestH - T.br * 0.3);
  S.shN = shoulderOfT(T, B, 1);
  S.shF = shoulderOfT(T, B, 0);
  // head: neck bends between chest and head
  const ha = T.hd + T.lean * 0.3;
  S.headA = ha;
  const na = (T.lean + ha) * 0.5;
  S.neckTop = fp(S.neck[0], S.neck[1], na, 0.3, -B.neck);
  // arms: wrist sits a little behind the palm centre
  const hand = 3.2 * B.hand;
  const w0x = T.h0x - Math.cos(T.r0) * hand, w0y = T.h0y - Math.sin(T.r0) * hand;
  const w1x = T.h1x - Math.cos(T.r1) * hand, w1y = T.h1y - Math.sin(T.r1) * hand;
  const eh0 = fp(0, 0, T.lean, T.e0x, T.e0y), eh1 = fp(0, 0, T.lean, T.e1x, T.e1y);
  S.armN = ik(S.shN[0], S.shN[1], w0x, w0y, B.upper, B.fore, eh0[0], eh0[1], S.armN || {});
  let wx1 = w1x, wy1 = w1y;
  // two-handed: the support hand goes to the foregrip of the gun as actually held
  const W = C.W;
  if (T.sup > 0.01 && W.fore && T.wv > 0.5) {
    const px = S.armN.ex + Math.cos(T.r0) * hand, py = S.armN.ey + Math.sin(T.r0) * hand;
    const c = Math.cos(T.wa), s = Math.sin(T.wa);
    const hs = W.hs || 1;
    const fx = px + (W.fore[0] * c - W.fore[1] * s) * hs, fy = py + (W.fore[0] * s + W.fore[1] * c) * hs;
    const k = Math.min(1, T.sup);
    T.r1 = lerpA(T.r1, T.wa, k);
    T.h1x = lerp(T.h1x, fx, k); T.h1y = lerp(T.h1y, fy, k);
    if (k > 0.5) T.hs1 = 'grip';
    wx1 = T.h1x - Math.cos(T.r1) * hand; wy1 = T.h1y - Math.sin(T.r1) * hand;
  }
  S.armF = ik(S.shF[0], S.shF[1], wx1, wy1, B.upper, B.fore, eh1[0], eh1[1], S.armF || {});
  return S;
}
