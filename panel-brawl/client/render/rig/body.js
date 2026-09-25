// Humanoid assembly: shapes each body part from the solved skeleton and
// paints them in inked layers (back limbs -> torso + near leg -> head ->
// shield -> weapon -> near arm). Also used by the portrait (mode 'bust').

import { Painter, frame } from './painter.js';
import { computePose, solve } from './pose.js';
import { buildFor } from './build.js';
import { drawHead } from './heads.js';
import { weaponParts, shieldParts, backpackParts, jetFlame, WMETA, starPath } from './props.js';
import { simChain, ribbonPath, foldLines } from './cloth.js';
import { limbPath, ellipse, circle, rrect, poly, fp, lerp, clamp, sat, TAU, PI, cshade, isDark } from './util.js';
import { INK, halftone, starburstPath } from '../ink.js';
import { ACT } from '../../../shared/ai.js';

const P2 = () => new Path2D();
const bodyP = new Painter();
const clothP = new Painter();

export function getBuild(A, ent) {
  const look = ent.look || {};
  if (A._Bl !== look || A._Bk !== ent.k) { A._B = buildFor(look, ent.k); A._Bl = look; A._Bk = ent.k; }
  return A._B;
}

// ---------------------------------------------------------------- limbs

function limb(P, ax, ay, bx, by, prof, color, o = {}) {
  const path = limbPath(P2(), ax, ay, bx, by, prof);
  if (o.flat || P.flat) { P.part(path, color, { flat: true, back: o.back }); return path; }
  // analytic lit copy: thinner, pushed toward the light
  const r = (prof[0] + prof[1]) * 0.5;
  const d = clamp(r * 0.3, 0.8, 2.6);
  const lit = limbPath(P2(), ax, ay, bx, by, prof, 1 - d / (r * 1.6), P.lx * d, P.ly * d);
  P.part(path, color, { lit, lr: r, skin: o.skin, sh: o.sh, back: o.back });
  return path;
}

function blob(P, path, color, cx, cy, r, o = {}) {
  P.part(path, color, { c: [cx, cy, r], skin: o.skin, hi: o.hi, dots: o.dots, m: o.m, sh: o.sh, thin: o.thin, flat: o.flat });
}

// hand shapes in the hand frame (origin = palm centre, +x = knuckles)
const handCache = new Map();
function handShape(kind) {
  let h = handCache.get(kind);
  if (h) return h;
  const p = P2(), d = P2();
  switch (kind) {
    case 'open': case 'palm': {
      p.moveTo(-3.2, -2.4); p.lineTo(1.6, -2.8); p.quadraticCurveTo(6.8, -3.0, 7.0, 0);
      p.quadraticCurveTo(6.8, 3.0, 1.6, 2.9); p.lineTo(-3.2, 2.6); p.quadraticCurveTo(-4.4, 0, -3.2, -2.4); p.closePath();
      // thumb
      p.moveTo(-1.8, -2.4); p.quadraticCurveTo(0.6, -6.2, 3.4, -5.2); p.quadraticCurveTo(3.6, -3.6, 1.4, -2.4); p.closePath();
      d.moveTo(2.4, -0.9); d.lineTo(6.2, -0.9); d.moveTo(2.4, 0.9); d.lineTo(6.2, 1.0);
      break;
    }
    case 'point': {
      rrect(p, -3.2, -2.9, 6.8, 5.9, 2.4);
      p.moveTo(2.4, -2.9); p.lineTo(8.6, -2.6); p.quadraticCurveTo(9.8, -1.6, 8.6, -0.6); p.lineTo(2.6, -0.4); p.closePath();
      d.moveTo(-1.6, -1.9); d.quadraticCurveTo(0.8, -0.4, 2.8, 0.2);
      break;
    }
    case 'claw': {
      p.moveTo(-3.2, -2.6); p.lineTo(2, -2.8);
      p.lineTo(8.6, -4.6); p.lineTo(4.4, -1.4); p.lineTo(9.4, -0.6); p.lineTo(4.4, 1.0); p.lineTo(8.4, 3.6); p.lineTo(2.2, 2.8);
      p.lineTo(-3.2, 2.6); p.quadraticCurveTo(-4.4, 0, -3.2, -2.6); p.closePath();
      p.moveTo(-1, -2.4); p.lineTo(2.2, -6.6); p.lineTo(2.8, -2.6); p.closePath();
      break;
    }
    case 'cup': {
      p.moveTo(-3.2, -2.2); p.quadraticCurveTo(0, -3.4, 3.4, -3.4); p.quadraticCurveTo(5.8, -3.0, 5.4, -0.6);
      p.quadraticCurveTo(4.6, 2.9, 0.6, 3.0); p.lineTo(-3.2, 2.6); p.quadraticCurveTo(-4.4, 0.2, -3.2, -2.2); p.closePath();
      d.moveTo(1.4, -2.9); d.quadraticCurveTo(3.4, -1.6, 3.8, 0.6);
      break;
    }
    case 'thumb': {
      rrect(p, -3.2, -3.0, 6.8, 6.1, 2.5);
      p.moveTo(-1.6, -2.6); p.lineTo(-1.8, -7.6); p.quadraticCurveTo(-0.6, -9.4, 0.8, -7.8); p.lineTo(1.4, -2.6); p.closePath();
      d.moveTo(3.4, -1.2); d.lineTo(1.6, -1.2); d.moveTo(3.4, 0.8); d.lineTo(1.6, 0.8);
      break;
    }
    case 'relax': {
      p.moveTo(-3.0, -2.6); p.quadraticCurveTo(2.4, -3.4, 4.6, -1.8); p.quadraticCurveTo(5.6, 0.4, 4.2, 2.4);
      p.quadraticCurveTo(0.6, 3.6, -3.0, 2.6); p.quadraticCurveTo(-4.2, 0, -3.0, -2.6); p.closePath();
      d.moveTo(-1.2, -2.0); d.quadraticCurveTo(1.6, -1.6, 3.0, 0.2); d.moveTo(3.6, 0.6); d.lineTo(4.6, 0.8);
      break;
    }
    default: { // fist / grip
      rrect(p, -3.2, -3.0, 6.8, 6.1, 2.5);
      d.moveTo(-1.6, -2.1); d.quadraticCurveTo(1.0, -0.8, 3.2, -0.8);
      d.moveTo(3.5, 0.9); d.lineTo(2.4, 0.9);
      break;
    }
  }
  h = { p, d };
  handCache.set(kind, h);
  return h;
}

const NOHAND = { m: null, d: new Path2D() };
function hand(P, x, y, a, kind, color, scale, o = {}) {
  if (kind === 'none') return NOHAND;
  const h = handShape(kind === 'grip' ? 'fist' : kind);
  const m = frame(x, y, a, scale);
  P.part(h.p, color, { m, c: [0.5, 0, 3.8], skin: o.skin, back: o.back, flat: o.back });
  return { m, d: h.d };
}

// boot / shoe in the foot frame (origin = ankle, +x toes)
const bootCache = new Map();
function footShape(kind) {
  let f = bootCache.get(kind);
  if (f) return f;
  const p = P2(), sole = P2();
  if (kind === 'hero') {
    p.moveTo(-3.6, -5); p.lineTo(-4.4, 2.6); p.quadraticCurveTo(-4.4, 4.6, -2.4, 4.6); p.lineTo(8.6, 4.6);
    p.quadraticCurveTo(12.2, 4.4, 11.6, 1.4); p.quadraticCurveTo(10.8, -1.6, 5.4, -2.2); p.lineTo(3.4, -5.4); p.closePath();
    sole.moveTo(-4.3, 3.0); sole.lineTo(11.5, 3.0);
  } else if (kind === 'robot') {
    p.moveTo(-4.6, -4); p.lineTo(-5.2, 4.8); p.lineTo(11.6, 4.8); p.lineTo(11.2, 0.6); p.lineTo(5, -1.6); p.lineTo(4.2, -4.4); p.closePath();
    sole.moveTo(-5, 3); sole.lineTo(11.4, 3);
  } else {
    p.moveTo(-3.2, -2.4); p.lineTo(-4.0, 2.8); p.quadraticCurveTo(-4.0, 4.4, -2.2, 4.4); p.lineTo(8.4, 4.4);
    p.quadraticCurveTo(11.0, 4.2, 10.4, 1.8); p.quadraticCurveTo(9.4, -0.6, 4.2, -1.2); p.lineTo(3.0, -2.6); p.closePath();
    sole.moveTo(-3.9, 3.1); sole.lineTo(10.6, 3.1);
  }
  f = { p, sole };
  bootCache.set(kind, f);
  return f;
}

// ---------------------------------------------------------------- torso

function roundPoly(p, pts, r) {
  const n = pts.length / 2;
  const mx = (pts[0] + pts[(n - 1) * 2]) / 2, my = (pts[1] + pts[(n - 1) * 2 + 1]) / 2;
  p.moveTo(mx, my);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    p.arcTo(pts[i * 2], pts[i * 2 + 1], (pts[i * 2] + pts[j * 2]) / 2, (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2, r);
  }
  p.closePath();
  return p;
}

function chestPath(B, tw, bellyK, bust) {
  const cw = B.chest, ww = B.waistW;
  if (B.robot) {
    const xs = 1 - 0.12 * tw;
    return roundPoly(P2(), [-12.6 * cw * xs, -20.5, 12.8 * cw * xs, -20.5, 11.4 * cw * xs, -6, 8 * ww * xs, 3.5, -8 * ww * xs, 3.5, -11 * cw * xs, -6], 3.5);
  }
  const xs = 1 - 0.14 * tw;
  const bel = B.belly * bellyK;
  const pts = B.fem ? [
    -7.6 * ww, 3.5, -7.4 * ww, -0.5, -9.6 * cw, -6.5, -11.4 * cw, -12, -11.2 * cw, -15.8, -8.2 * cw, -18.4, -3.2, -20.4,
    3.0, -20.2, 7.8 * cw, -18.6, 10.6 * cw, -15, 12.4 * cw, -10.8, 11.8 * cw, -7.2, 8.2 * ww, -3.6, 7.2 * ww, 0, 7.4 * ww, 3.5,
  ] : [
    -7.8 * ww, 3.5, -7.9 * ww, -0.5, -10.6 * cw, -7, -13.0 * cw, -12.8, -13.6 * cw, -17.4, -11.6 * cw, -19.8, -4.2, -22.2,
    3.6, -22.0, 10.2 * cw, -19.8, 12.8 * cw, -17.0, 12.6 * cw, -11.8, 11.0 * cw + bel * 0.3, -7.4, 8.2 * ww + bel, -3.6, 7.5 * ww + bel * 0.8, 0.2, 7.6 * ww + bel * 0.2, 3.5,
  ];
  for (let i = 0; i < pts.length; i += 2) pts[i] = pts[i] * xs + tw * 1.2;
  void bust;
  const p = P2();
  // Catmull-Rom through the outline, closed
  catmull(p, pts);
  return p;
}

function pelvisPath(B) {
  const ww = B.waistW, hp = B.hips;
  if (B.robot) return roundPoly(P2(), [-8.4 * ww, -12.5, 8.4 * ww, -12.5, 9 * hp, 1, 4, 6, -4, 6, -9 * hp, 1], 3);
  const bel = B.belly;
  const pts = [
    -8.4 * ww, -12.5, -9.6 * hp, -6.4, -9.8 * hp, -0.6, -7.6 * hp, 3.8, -3.0, 5.8,
    2.8, 5.8, 7.2 * hp, 2.2, 8.4 * hp + bel * 0.5, -3.6, 8.1 * ww + bel * 0.7, -9, 8.0 * ww + bel * 0.3, -12.5,
  ];
  const p = P2();
  catmull(p, pts);
  return p;
}

function catmull(p, pts) {
  const n = pts.length / 2;
  const P = (i) => { i = (i + n) % n; return [pts[i * 2], pts[i * 2 + 1]]; };
  const [x0, y0] = P(0);
  p.moveTo(x0, y0);
  for (let i = 0; i < n; i++) {
    const [ax, ay] = P(i - 1), [bx, by] = P(i), [cx, cy] = P(i + 1), [dx, dy] = P(i + 2);
    p.bezierCurveTo(bx + (cx - ax) / 6, by + (cy - ay) / 6, cx - (dx - bx) / 6, cy - (dy - by) / 6, cx, cy);
  }
  p.closePath();
}

// emblem in the chest frame
function emblem(P, kind, x, y, r, color, m) {
  const bg = P2(), fg = P2();
  switch (kind) {
    case 'star': {
      circle(bg, x, y, r);
      starPath(fg, x, y + 0.2, r * 0.82);
      P.fill(bg, '#ffd23f', m); P.line(bg, 0.9, null, m);
      P.fill(fg, color || '#e8262b', m); P.line(fg, 0.7, null, m);
      break;
    }
    case 'drop': {
      ellipse(bg, x, y, r * 0.95, r);
      fg.moveTo(x, y - r * 0.8); fg.quadraticCurveTo(x + r * 0.75, y + r * 0.1, x + r * 0.45, y + r * 0.45);
      fg.quadraticCurveTo(x, y + r * 0.85, x - r * 0.45, y + r * 0.45); fg.quadraticCurveTo(x - r * 0.75, y + r * 0.1, x, y - r * 0.8); fg.closePath();
      P.fill(bg, color || '#23d5e8', m); P.line(bg, 0.9, null, m);
      P.fill(fg, '#f4f8ff', m); P.line(fg, 0.7, null, m);
      break;
    }
    case 'bolt': {
      fg.moveTo(x + r * 0.35, y - r * 1.25); fg.lineTo(x - r * 0.75, y + r * 0.12); fg.lineTo(x - r * 0.02, y + r * 0.12);
      fg.lineTo(x - r * 0.45, y + r * 1.3); fg.lineTo(x + r * 0.85, y - r * 0.3); fg.lineTo(x + r * 0.1, y - r * 0.3); fg.lineTo(x + r * 0.55, y - r * 1.25); fg.closePath();
      circle(bg, x, y, r * 1.08);
      P.fill(bg, '#1b1b1b', m); P.line(bg, 0.9, null, m);
      P.fill(fg, '#ffd23f', m); P.line(fg, 0.6, null, m);
      break;
    }
    case 'circle': {
      circle(bg, x, y, r);
      P.fill(bg, '#ffe14a', m); P.line(bg, 0.9, null, m);
      for (let i = 0; i < 3; i++) {
        const a = -PI / 2 + (i / 3) * TAU;
        fg.moveTo(x, y); fg.arc(x, y, r * 0.8, a - 0.5, a + 0.5); fg.closePath();
      }
      circle(fg, x, y, r * 0.18);
      P.fill(fg, '#1b1b1b', m);
      break;
    }
    case 'planet': {
      circle(bg, x, y, r * 0.62);
      fg.ellipse(x, y, r * 1.15, r * 0.34, -0.35, 0, TAU);
      P.fill(bg, color || '#ff7a1a', m); P.line(bg, 0.8, null, m);
      P.line(fg, 1.4, null, m);
      P.line(fg, 0.6, '#ffd23f', m);
      break;
    }
    default: break;
  }
}

// ------------------------------------------------------------ main draw

// mode: undefined (full body) | 'bust' (portrait: skip legs, extra detail)
export function drawHumanoid(ctx, ent, A, opts, mode) {
  const look = ent.look || {};
  const B = getBuild(A, ent);
  const C = computePose(ent, A, opts, B);
  if (opts.pose) opts.pose(C.T, C);
  const S = solve(C);
  paintHumanoid(ctx, ent, A, opts, B, C, S, mode);
  return C;
}

export function paintHumanoid(ctx, ent, A, opts, B, C, S, mode) {
  const look = ent.look || {};
  const T = C.T;
  const W = C.W;
  const robot = !!B.robot;
  const s = C.s;
  const facing = C.facing;
  const bust = mode === 'bust';
  const lw = (opts.lw || 2.35) / Math.sqrt(s) * (robot ? 1.08 : 1);
  const sqx = T.sqx, sqy = T.sqy;

  // local -> world (for cloth anchors)
  const rc = Math.cos(T.rot || 0), rs = Math.sin(T.rot || 0);
  const toW = (x, y) => {
    let X = x, Y = y;
    if (T.rot) { const dx = x - T.rpx, dy = y - T.rpy; X = dx * rc - dy * rs + T.rpx + T.rtx; Y = dx * rs + dy * rc + T.rpy + T.rty; }
    return [ent.x + X * facing * s * sqx, ent.y + Y * s * sqy];
  };

  // frames
  const pelM = frame(T.px, T.py, T.pel);
  const chM = frame(S.waist[0], S.waist[1], T.lean);
  const hk = B.head * (bust ? 1.26 : 1);
  const headC = fp(S.neckTop[0], S.neckTop[1], S.headA, 0.1 * hk, -5.0 * hk);
  const hdM = frame(headC[0], headC[1], S.headA, hk);

  // ---- cloth (world space, behind the body)
  if (!opts.ghost) drawCloth(ctx, ent, A, opts, B, C, S, toW, lw, s, chM, hdM, pelM);
  if (bust && look.cape) capeBackdrop(ctx, opts, look, B, chM, facing, s, A.t, lw);

  ctx.save();
  ctx.translate(ent.x, ent.y);
  ctx.scale(facing * s * sqx, s * sqy);
  if (T.rot) { ctx.translate(T.rpx + T.rtx, T.rpy + T.rty); ctx.rotate(T.rot); ctx.translate(-T.rpx, -T.rpy); }
  const P = bodyP.begin(ctx, opts, lw, facing);

  const suit = look.suit || '#888888';
  const pants = look.pants || suit;
  const skin = look.skin || '#f0c29a';
  const gloves = robot ? (look.suit2 || suit) : look.gloves || null;
  const boots = look.boots || '#222222';
  const torso = look.torso || (robot ? 'robot' : 'plain');
  const hero = torso === 'hero';
  const bareFore = torso === 'torn' || torso === 'smock';
  const arm = B.arm, leg = B.leg;
  const armCol = robot ? suit : suit;
  const foreCol = bareFore ? skin : armCol;
  const handCol = gloves || skin;
  const bootKind = robot ? 'robot' : hero ? 'hero' : 'shoe';
  const legCol = robot ? cshade(suit, -0.08) : pants;

  // profiles
  const upP = robot ? [4.4 * arm, 4.0 * arm, 0, 0.5, 0, 0.5] : [4.5 * arm, 3.2 * arm, 1.25 * arm, 0.45, 0.95 * arm, 0.35];
  const foP = robot ? [3.8 * arm, 3.6 * arm, 0, 0.5, 0, 0.5] : [3.35 * arm, 2.45 * arm, 1.15 * arm, 0.22, 0.6 * arm, 0.3];
  const thP = robot ? [5.8 * leg, 5.0 * leg, 0, 0.5, 0, 0.5] : [6.4 * leg, 4.1 * leg, 1.45 * leg, 0.4, 0.85 * leg, 0.5];
  const shP = robot ? [4.8 * leg, 4.4 * leg, 0, 0.5, 0, 0.5] : [4.0 * leg, 2.6 * leg, 0.35 * leg, 0.3, 2.0 * leg, 0.3];
  const handK = B.hand * (robot ? 1.25 : 1) * (gloves && hero ? 1.08 : 1);

  const { legN, legF, armN, armF } = S;
  const hipN = S.hipN, hipF = S.hipF;

  // ================= far arm (behind everything)
  const farArm = (back) => {
    P.layer();
    const ob = { back };
    limb(P, S.shF[0], S.shF[1], armF.jx, armF.jy, upP, armCol, ob);
    limb(P, armF.jx, armF.jy, armF.ex, armF.ey, foP, bareFore ? skin : armCol, { back, skin: bareFore });
    if (gloves && !robot && hero) cuff(P, armF, foP, gloves, back);
    const fk = T.fk1 * handK;
    const hx = armF.ex + Math.cos(T.r1) * 3.2 * B.hand, hy = armF.ey + Math.sin(T.r1) * 3.2 * B.hand;
    const hd = hand(P, hx, hy, T.r1, T.hs1, handCol, fk, { back, skin: !gloves });
    return { hx, hy, hd };
  };
  let farHand = null;
  if (!bust || true) farHand = farArm(true);
  if (farHand) P.line(farHand.hd.d, 0.6, null, farHand.hd.m);

  // ================= far leg
  if (!bust) {
    P.layer();
    limb(P, hipF[0], hipF[1], legF.jx, legF.jy, thP, legCol, { back: true });
    limb(P, legF.jx, legF.jy, legF.ex, legF.ey, shP, legCol, { back: true });
    bootPart(P, legF, T.f1, shP, boots, bootKind, hero, B, true, T);
    if (look.trunks && hero) trunks(P, look, B, S, pelM, thP, true);
    skirt(P, look, B, T, S, pelM, torso, legCol, true);
  }

  // back gear
  if (look.extra === 'jetpack' || look.extra === 'airtank') backpackParts(P, look.extra, chM, B);

  // ================= torso + near leg
  P.layer();
  const pel = pelvisPath(B);
  const pelCol = robot ? cshade(suit, -0.12) : hero ? pants : torso === 'trench' || torso === 'robe' || torso === 'labcoat' ? pants : pants;
  blob(P, pel, pelCol, 0, -3, 9, { m: pelM });
  const chest = chestPath(B, T.tw, 1, bust);
  const chestCol = robot ? suit : suit;
  blob(P, chest, chestCol, 1.5, -9, 12.5, { m: chM, hi: true, dots: bust });
  // neck
  const nk = bust ? 1.22 : 1;
  if (!robot) limb(P, S.neck[0], S.neck[1] + 1.5, S.neckTop[0], S.neckTop[1], [B.neckR * nk * 1.08, B.neckR * nk * 0.9, 0.3, 0.5, 0.2, 0.5], skin, { skin: true });
  else limb(P, S.neck[0], S.neck[1] + 1, S.neckTop[0], S.neckTop[1], [3.2, 3.2, 0, 0.5, 0, 0.5], cshade(suit, -0.25));
  if (!bust) {
    limb(P, hipN[0], hipN[1], legN.jx, legN.jy, thP, legCol);
    limb(P, legN.jx, legN.jy, legN.ex, legN.ey, shP, legCol);
  }
  // torso details
  torsoDetail(P, look, B, T, chM, pelM, torso, bust, S, A);
  if (!bust) {
    bootPart(P, legN, T.f0, shP, boots, bootKind, hero, B, false, T);
    // thigh crease where the near leg overlaps the body
    const kneeUp = legN.jy < hipN[1] + 12;
    if (kneeUp) {
      const cr = P2(); cr.moveTo(hipN[0] + 5, hipN[1] - 3); cr.quadraticCurveTo(legN.jx, legN.jy - 6, legN.jx + 3, legN.jy - 2);
      P.line(cr, 0.9);
    }
    skirt(P, look, B, T, S, pelM, torso, legCol, false);
  }
  if (look.trunks && hero && !bust) trunks(P, look, B, S, pelM, thP, false);
  else if (look.trunks && hero) trunks(P, look, B, S, pelM, thP, false);

  // ================= head
  const blink = A.blink < 0 && !opts.asleep;
  drawHead(P, look, hdM, { ex: T.ex, blink, t: A.t, lw: lw * 0.95 / hk }, B);
  if (look.scarf) scarfWrap(P, look, S, B, T);

  // ================= shield
  if (C.shield && !bust && Math.abs(T.rot || 0) < 0.5 && !(T.fx & 16)) {
    const hx = armF.ex + Math.cos(T.r1) * 3, hy = armF.ey + Math.sin(T.r1) * 3;
    shieldParts(P, look.shield, frame(hx, hy, 0), A.t);
  }

  // ================= weapon + near arm
  const nearHx = armN.ex + Math.cos(T.r0) * 3.2 * B.hand, nearHy = armN.ey + Math.sin(T.r0) * 3.2 * B.hand;
  const wkey = C.wkey;
  const wv = T.wv > 0.5 && wkey !== 'none' && wkey !== 'claws';
  let wm = null;
  if (wv) {
    if (W.hold === 'throw' && T.toss < 0) { /* released */ } else {
      const tossY = W.hold === 'throw' ? -Math.max(0, T.toss) * 9 : 0;
      wm = frame(nearHx, nearHy + tossY, W.hold === 'throw' ? -0.2 : T.wa, W.hs || 1);
      weaponParts(P, wkey, wm, { gold: wkey === 'tommy' && (ent.k === 'boss' || (look.scale || 1) >= 1.8), plasma: look.head === 'alien' || look.head === 'dome', glow: look.suit2, grip: look.suit, lead: look.body === 'robot' ? '#23d5e8' : null });
    }
  }
  // support hand grabs the foregrip
  if (T.sup > 0.5 && W.fore && wm) {
    // re-solve the far arm to the actual foregrip (after the near arm moved)
  }
  if (T.mag) {
    const mm = frame(farHand.hx, farHand.hy + 1, T.r1 - 1.2);
    weaponParts(P, 'mag', mm, {});
  }
  if (T.mag && farHand) {
    // redraw the far hand over the magazine
    P.layer();
    hand(P, farHand.hx, farHand.hy, T.r1, 'cup', handCol, T.fk1 * handK, { back: true, skin: !gloves });
  }

  // near arm
  P.layer();
  deltoid(P, S.shN, armN, upP, armCol, robot);
  limb(P, S.shN[0], S.shN[1], armN.jx, armN.jy, upP, armCol);
  limb(P, armN.jx, armN.jy, armN.ex, armN.ey, foP, bareFore ? skin : armCol, { skin: bareFore });
  if (gloves && !robot && hero) cuff(P, armN, foP, gloves, false);
  const fk0 = T.fk0 * handK;
  const hd0 = hand(P, nearHx, nearHy, T.r0, T.hs0, handCol, fk0, { skin: !gloves });
  if (!robot && look.torso === 'stripes') armStripes(P, S.shN, armN, look.suit2);
  if (bareFore && torso === 'smock') sleeveCuff(P, armN, upP, suit);
  P.line(hd0.d, 0.6, null, hd0.m);
  if (robot) jointBolts(P, [armN.jx, armN.jy, legN.jx, legN.jy], look.suit2);

  // tied up: rope
  if (T.fx & 16) rope(P, S, B, T, chM);

  P.run();

  // ---- FX in local space
  fxLocal(ctx, P, T, S, A, C, opts, B, hd0, nearHx, nearHy, farHand);
  ctx.restore();

  // jet flame (world)
  if (look.extra === 'jetpack' && !opts.asleep && !opts.noFill && !opts.ghost) {
    const n = fp(S.waist[0], S.waist[1], T.lean, -12 * B.chest - 4.5, 9);
    const [wx, wy] = toW(n[0], n[1]);
    ctx.save();
    jetFlame(ctx, wx, wy, s, A.t);
    ctx.restore();
  }
  return { P, S };
}

function deltoid(P, sh, arm, prof, color, robot) {
  const dx = arm.jx - sh[0], dy = arm.jy - sh[1];
  const d = Math.hypot(dx, dy) || 1;
  const a = Math.atan2(dy, dx);
  const cx = sh[0] + dx / d * 1.6, cy = sh[1] + dy / d * 1.6;
  const p = P2();
  if (robot) { rrect(p, cx - 6.4, cy - 5.6, 12.8, 10.4, 3.4); }
  else ellipse(p, cx, cy, prof[0] * 1.3, prof[0] * 1.12, a);
  P.part(p, color, { c: [cx, cy, prof[0] * 1.2], hi: true });
}

function cuff(P, arm, foP, color, back) {
  // flared gauntlet from mid-forearm to the wrist
  const k = 0.5;
  const bx = lerp(arm.jx, arm.ex, k), by = lerp(arm.jy, arm.ey, k);
  const r0 = foP[0] * 1.08, r1 = foP[1] * 1.05;
  const p = limbPath(P2(), bx, by, arm.ex, arm.ey, [r0, r1, 0, 0.5, 0, 0.5]);
  P.part(p, color, { flat: back, back, thin: back ? 0 : 0.8, c: back ? null : [(bx + arm.ex) / 2, (by + arm.ey) / 2, r0] });
}

function sleeveCuff(P, arm, upP, color) {
  const bx = lerp(arm.jx, arm.ex, 0.02), by = lerp(arm.jy, arm.ey, 0.02);
  const p = P2(); circle(p, bx, by, upP[1] * 1.25);
  P.part(p, color, { flat: true, thin: 0.7 });
}

function armStripes(P, sh, arm, col) {
  const p = P2();
  for (const t of [0.35, 0.7]) {
    const x = lerp(sh[0], arm.jx, t), y = lerp(sh[1], arm.jy, t);
    const dx = arm.jx - sh[0], dy = arm.jy - sh[1];
    const d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d * 4.6, ny = dx / d * 4.6;
    p.moveTo(x + nx, y + ny); p.lineTo(x - nx, y - ny);
  }
  P.line(p, 2.2, col || '#1b1b1b');
}

function bootPart(P, legS, fa, shP, boots, kind, hero, B, back, T) {
  // boot shaft up the shin
  const k = hero ? 0.46 : kind === 'robot' ? 0.7 : 0.8;
  const bx = lerp(legS.jx, legS.ex, k), by = lerp(legS.jy, legS.ey, k);
  if (hero || kind === 'robot') {
    const pr = [shP[0] * (hero ? 1.02 : 1.05) * (1 - k * 0.35), shP[1] * 1.1, hero ? 0.3 : 0, 0.3, hero ? 0.7 : 0, 0.25];
    const p = limbPath(P2(), bx, by, legS.ex, legS.ey, pr);
    P.part(p, boots, { flat: back, back, thin: back ? 0 : 0.8, c: back ? null : [(bx + legS.ex) / 2, (by + legS.ey) / 2, pr[0]] });
  }
  const f = footShape(kind);
  const m = frame(legS.ex, legS.ey, fa, B.foot * (kind === 'shoe' ? 0.95 : 0.9));
  P.part(f.p, boots, { m, c: [3.5, 1.2, 4.5], back, flat: back });
  if (!back) P.line(f.sole, 1.1, null, m);
  void T;
}

function trunks(P, look, B, S, pelM, thP, far) {
  const L = far ? S.legF : S.legN;
  const hip = far ? S.hipF : S.hipN;
  // leg cap riding on the thigh
  const cap = limbPath(P2(), hip[0], hip[1], lerp(hip[0], L.jx, 0.16), lerp(hip[1], L.jy, 0.16), [thP[0] * 1.04, thP[0] * 1.02, 0, 0.5, 0, 0.5]);
  P.part(cap, look.trunks, { flat: far, back: far, thin: far ? 0 : 0.8, c: far ? null : [hip[0], hip[1] + 3, thP[0]] });
  if (far) return;
  const p = P2();
  p.moveTo(-9.3 * B.hips, -8.6); p.quadraticCurveTo(0, -7.6, 8.3 * B.hips, -8.8);
  p.quadraticCurveTo(8.6 * B.hips, -3, 5.6, 1.8); p.quadraticCurveTo(2.4, 5.4, -2.6, 5.2);
  p.quadraticCurveTo(-8.4, 2.4, -9.6 * B.hips, -2.4); p.quadraticCurveTo(-9.9 * B.hips, -6, -9.3 * B.hips, -8.6); p.closePath();
  P.part(p, look.trunks, { m: pelM, c: [0, -2, 8], thin: 0.8 });
}

function torsoDetail(P, look, B, T, chM, pelM, torso, bust, S, A) {
  const tw = T.tw;
  const ex = 2.4 + tw * 2.6;   // chest centre x shifts toward the front as the torso turns
  const cw = B.chest;
  switch (torso) {
    case 'hero': {
      if (look.cape) {
        // cape collar over the shoulders
        const cc = P2();
        cc.moveTo(-9.5 * cw, -19.2); cc.quadraticCurveTo(-2, -22.6, 6.6 * cw, -20.4); cc.quadraticCurveTo(7.2 * cw, -18.6, 5.6 * cw, -17.8);
        cc.quadraticCurveTo(-1, -19.6, -8.6 * cw, -16.6); cc.closePath();
        P.part(cc, look.cape, { m: chM, flat: true, thin: 0.8 });
        const clasp = P2(); circle(clasp, 5.6 * cw, -18.6, 1.6);
        P.fill(clasp, '#ffd23f', chM); P.line(clasp, 0.7, null, chM);
      }
      const d = P2();
      // pec line + centre line + abs (abs only when drawn large)
      d.moveTo(-3.5 + ex * 0.3, -9.2); d.quadraticCurveTo(ex, -6.6, 10.4 * cw, -8.4);
      if (bust) {
        // sternum notch, a hint of abs, collarbone
        d.moveTo(ex - 0.2, -5.6); d.lineTo(ex - 0.4, -3.8);
        d.moveTo(ex - 3.6, -2.6); d.quadraticCurveTo(ex - 1.8, -1.8, ex - 0.6, -2.4);
        d.moveTo(ex + 0.6, -2.4); d.quadraticCurveTo(ex + 1.8, -1.8, ex + 3.4, -2.6);
        d.moveTo(-5.6 * cw, -16.6); d.quadraticCurveTo(-2.4, -17.6, -0.2, -19.4);
      }
      P.line(d, 0.85, null, chM);
      if (look.emblem) emblem(P, look.emblem, ex + 0.6, -12.6, 5.4 * Math.min(cw, 1.1), look.suit2, chM);
      if (look.belt) belt(P, look, B, pelM, true);
      break;
    }
    case 'trench': {
      const lap = P2();
      lap.moveTo(ex - 5.5, -20.4); lap.lineTo(ex + 0.2, -9.6); lap.lineTo(ex - 1.6, 3.4);
      lap.moveTo(ex + 5.6, -20.2); lap.lineTo(ex + 3.2, -12);
      const shirt = P2(); shirt.moveTo(ex - 3.6, -20.2); shirt.lineTo(ex + 4.4, -20.2); shirt.lineTo(ex + 0.6, -10.8); shirt.closePath();
      P.fill(shirt, '#f4f1e8', chM); P.line(shirt, 0.7, null, chM);
      const tie = P2(); tie.moveTo(ex - 0.2, -19.8); tie.lineTo(ex + 1.6, -19.8); tie.lineTo(ex + 2.0, -12.4); tie.lineTo(ex + 0.8, -10.8); tie.lineTo(ex - 0.4, -12.4); tie.closePath();
      P.fill(tie, look.tie || '#b8171b', chM); P.line(tie, 0.6, null, chM);
      const col = P2(); col.moveTo(-8.8 * cw, -18.6); col.lineTo(-4.2, -23.2); col.lineTo(ex - 5.8, -20.2); col.lineTo(ex - 4, -16.4); col.lineTo(-7.2, -15.8); col.closePath();
      P.part(col, look.suit, { m: chM, flat: true, thin: 0.8 });
      P.line(lap, 0.9, null, chM);
      const btn = P2(); circle(btn, ex + 2.2, -7.5, 0.8); circle(btn, ex + 2.0, -3.4, 0.8);
      P.fill(btn, '#3a2a1b', chM);
      belt(P, { belt: look.suit2 || '#7a5a36' }, B, pelM, false);
      break;
    }
    case 'stripes': {
      P.fn((ctx, Pp) => {
        if (Pp.o.noFill) return;
        ctx.save();
        ctx.clip(chestPath(B, tw, 1));
        ctx.fillStyle = Pp.col(look.suit2 || '#1b1b1b');
        for (let y = -21; y < 4; y += 4.4) ctx.fillRect(-16, y, 32, 2.2);
        ctx.restore();
      }, chM);
      break;
    }
    case 'armor': {
      const pl = P2();
      pl.moveTo(-10.2 * cw, -17.2); pl.quadraticCurveTo(ex, -21, 11.4 * cw, -15.6); pl.lineTo(11.2 * cw, -8.6); pl.quadraticCurveTo(ex, -3.2, -9.6 * cw, -7.6); pl.closePath();
      P.part(pl, cshade(look.suit, 0.16), { m: chM, c: [ex, -12, 7], hi: true, thin: 0.8 });
      const d = P2(); d.moveTo(ex, -19.4); d.lineTo(ex, -5.6);
      P.line(d, 0.8, null, chM);
      const band = P2(); band.moveTo(-9 * cw, -3.4); band.quadraticCurveTo(ex, -1.6, 9.6 * B.waistW, -3.6); band.lineTo(9.2 * B.waistW, -0.6); band.quadraticCurveTo(ex, 1.2, -8.8 * cw, -0.4); band.closePath();
      P.fill(band, look.suit2 || '#ffd23f', chM); P.line(band, 0.7, null, chM);
      break;
    }
    case 'torn': {
      const hole = P2();
      hole.moveTo(ex - 3, -14); hole.lineTo(ex + 1, -16.4); hole.lineTo(ex + 4.6, -12.6); hole.lineTo(ex + 3, -8.8); hole.lineTo(ex + 6.4, -5.2); hole.lineTo(ex, -6.2); hole.lineTo(ex - 3.4, -9.4); hole.closePath();
      P.fill(hole, look.skin, chM); P.line(hole, 0.8, null, chM);
      const ribs = P2(); ribs.moveTo(ex - 0.6, -13); ribs.lineTo(ex + 3, -12.4); ribs.moveTo(ex - 1.2, -10.6); ribs.lineTo(ex + 2.8, -10); ribs.moveTo(ex - 0.2, -8.2); ribs.lineTo(ex + 2.6, -7.6);
      P.line(ribs, 0.7, null, chM);
      const hem = P2(); hem.moveTo(-8.4, 1.4); hem.lineTo(-6, -2); hem.lineTo(-3.4, 1.6); hem.lineTo(0, -2.4); hem.lineTo(3.4, 1.8); hem.lineTo(6.2, -1.6); hem.lineTo(8.6, 1.4);
      P.line(hem, 0.9, null, chM);
      const stain = P2(); circle(stain, -5, -12, 2.2); circle(stain, -3.6, -10.4, 1.3);
      P.fill(stain, look.suit2 || '#6e5a3f', chM);
      break;
    }
    case 'labcoat': {
      const shirt = P2(); shirt.moveTo(ex - 4.2, -20.4); shirt.lineTo(ex + 4.4, -20.4); shirt.lineTo(ex + 2.2, -4); shirt.lineTo(ex - 1.4, -4); shirt.closePath();
      P.fill(shirt, look.suit2 || '#1fb4c8', chM); P.line(shirt, 0.7, null, chM);
      const lap = P2(); lap.moveTo(ex - 5, -20.2); lap.lineTo(ex - 1.8, -9.6); lap.lineTo(ex - 1.8, 3.4); lap.moveTo(ex + 5.2, -20.2); lap.lineTo(ex + 2.6, -10);
      P.line(lap, 0.9, null, chM);
      const pocket = P2(); pocket.rect(-6.2, -12.6, 5, 4.6); P.line(pocket, 0.7, null, chM);
      const pens = P2(); pens.rect(-5.4, -14.4, 1, 2.4); pens.rect(-3.8, -14.8, 1, 2.8);
      P.fill(pens, '#e8262b', chM);
      break;
    }
    case 'robe': {
      const fur = P2(); fur.moveTo(-11 * cw, -17.4); fur.quadraticCurveTo(0, -23.6, 11.4 * cw, -17.2); fur.lineTo(10.6 * cw, -13.6); fur.quadraticCurveTo(0, -18, -10.6 * cw, -13.8); fur.closePath();
      P.part(fur, '#f4f1e8', { m: chM, c: [0, -17, 4], thin: 0.8 });
      const spots = P2(); for (let i = -3; i <= 3; i++) { ellipse(spots, i * 2.9 + 0.4, -16.8 + Math.abs(i) * 0.3 + (i & 1) * 0.8, 0.6, 1.0); }
      P.fill(spots, '#141414', chM);
      const trim = P2(); trim.moveTo(ex - 1.2, -14.4); trim.lineTo(ex + 1.4, -14.4); trim.lineTo(ex + 1.8, 3.5); trim.lineTo(ex - 1.4, 3.5); trim.closePath();
      P.fill(trim, look.suit2 || '#ffd23f', chM); P.line(trim, 0.6, null, chM);
      break;
    }
    case 'suit': {
      const shirt = P2(); shirt.moveTo(ex - 3.8, -20.4); shirt.lineTo(ex + 4.4, -20.4); shirt.lineTo(ex + 0.8, -8.4); shirt.closePath();
      P.fill(shirt, '#f4f1e8', chM); P.line(shirt, 0.7, null, chM);
      const tie = P2(); tie.moveTo(ex - 0.2, -20); tie.lineTo(ex + 1.6, -20); tie.lineTo(ex + 1.9, -12.4); tie.lineTo(ex + 0.7, -10.4); tie.lineTo(ex - 0.5, -12.4); tie.closePath();
      P.fill(tie, look.suit2 || '#d7141a', chM); P.line(tie, 0.6, null, chM);
      const lap = P2(); lap.moveTo(ex - 5.2, -20.2); lap.lineTo(ex - 0.4, -8.2); lap.lineTo(ex - 1.4, 3.4); lap.moveTo(ex + 5.2, -20.2); lap.lineTo(ex + 2.8, -12.6); lap.lineTo(ex + 0.9, -8.6);
      P.line(lap, 0.9, null, chM);
      const sq = P2(); sq.moveTo(-6.6, -12.8); sq.lineTo(-4.8, -14.6); sq.lineTo(-3.4, -12.8); sq.closePath();
      P.fill(sq, look.suit2 || '#d7141a', chM);
      break;
    }
    case 'smock': {
      const splot = P2();
      const cols = ['#e8262b', '#1f5fd1', '#ffd23f', '#2fa84f'];
      for (let i = 0; i < 4; i++) {
        const p = P2(); const x = -6 + i * 3.6, y = -14 + (i % 2) * 5 + (i === 3 ? 4 : 0);
        p.moveTo(x + 1.6, y); p.quadraticCurveTo(x + 1.8, y + 1.8, x, y + 1.6); p.quadraticCurveTo(x - 1.8, y + 1.4, x - 1.2, y - 0.4); p.quadraticCurveTo(x - 0.4, y - 2, x + 1.6, y); p.closePath();
        P.fill(p, cols[i], chM);
        splot.addPath(p);
      }
      const bow = P2(); bow.moveTo(ex, -19.4); bow.lineTo(ex - 4.4, -22); bow.lineTo(ex - 4.2, -16.4); bow.closePath(); bow.moveTo(ex, -19.4); bow.lineTo(ex + 4.6, -22.2); bow.lineTo(ex + 4.4, -16.4); bow.closePath();
      P.layer(1.3);
      P.part(bow, look.suit2 || '#e8262b', { m: chM });
      const knot = P2(); circle(knot, ex, -19.4, 1.3); P.fill(knot, look.suit2 || '#e8262b', chM); P.line(knot, 0.6, null, chM);
      const folds = P2(); folds.moveTo(-6, -4); folds.lineTo(-5, 3); folds.moveTo(3, -3); folds.lineTo(4, 3.4);
      P.line(folds, 0.7, null, chM);
      break;
    }
    case 'robot': case 'plain':
    default: {
      if (B.robot) {
        const plate = P2(); rrect(plate, -7 * cw, -16, 13 * cw, 10, 2);
        P.fill(plate, look.suit2 || '#e8262b', chM); P.line(plate, 0.8, null, chM);
        const grill = P2(); for (let i = 0; i < 3; i++) { grill.moveTo(-5 * cw, -3.4 + i * 2.2); grill.lineTo(5 * cw, -3.4 + i * 2.2); }
        P.line(grill, 0.8, null, chM);
        const bolts = P2(); for (const [x, y] of [[-10, -17], [10, -17], [-8, 1], [8, 1]]) circle(bolts, x * cw, y, 0.9);
        P.fill(bolts, '#141414', chM);
        const core = P2(); circle(core, -0.5 * cw, -11, 2.4); P.fill(core, '#fff6a0', chM); P.line(core, 0.7, null, chM);
      } else {
        const stripe = P2(); stripe.moveTo(ex - 1.8, -20.4); stripe.lineTo(ex + 1.8, -20.4); stripe.lineTo(ex + 1.6, 3.5); stripe.lineTo(ex - 1.6, 3.5); stripe.closePath();
        P.fill(stripe, look.suit2 || '#ffd23f', chM); P.line(stripe, 0.6, null, chM);
        if (look.head === 'civilian') {
          const col = P2(); col.moveTo(ex - 4.6, -20.4); col.lineTo(ex - 0.2, -17.4); col.lineTo(ex + 4.6, -20.4); col.lineTo(ex + 3.4, -16.4); col.lineTo(ex, -17); col.lineTo(ex - 3.6, -16.2); col.closePath();
          P.fill(col, '#f4f1e8', chM); P.line(col, 0.7, null, chM);
        }
      }
    }
  }
  if (look.extra === 'bandolier') bandolier(P, chM, B, ex);
  void S; void A; void bust;
}

function belt(P, look, B, pelM, buckle) {
  const b = P2();
  const w = B.waistW;
  b.moveTo(-8.8 * w, -12.8); b.quadraticCurveTo(0, -11.4, 8.4 * w, -12.8); b.lineTo(8.6 * w, -9.4); b.quadraticCurveTo(0, -8.0, -9.2 * w, -9.2); b.closePath();
  P.part(b, look.belt, { m: pelM, flat: true, thin: 0.8 });
  if (buckle) {
    const k = P2(); rrect(k, 2.2, -12.9, 4.6, 4.2, 1);
    P.fill(k, cshade(look.belt, -0.2), pelM); P.line(k, 0.7, null, pelM);
  }
}

function bandolier(P, chM, B, ex) {
  const s = P2();
  s.moveTo(-9 * B.chest, -18); s.lineTo(-6.4 * B.chest, -18.6); s.lineTo(10 * B.chest, -3); s.lineTo(7.8 * B.chest, -1.4); s.closePath();
  P.part(s, '#6a4a2a', { m: chM, flat: true, thin: 0.7 });
  const g = P2();
  for (let i = 0; i < 4; i++) { const t = 0.2 + i * 0.2; circle(g, lerp(-7.6, 8.8, t) * B.chest, lerp(-18.2, -2.4, t), 1.9); }
  P.part(g, '#3a3d44', { m: chM, flat: true, thin: 0.6 });
  void ex;
}

function skirt(P, look, B, T, S, pelM, torso, legCol, far) {
  if (torso !== 'trench' && torso !== 'labcoat' && torso !== 'robe') return;
  const col = look.suit;
  const long = torso === 'robe';
  const L = far ? S.legF : S.legN;
  const hip = far ? S.hipF : S.hipN;
  // a coat panel that rides on the thigh (and shin for robes) and flares at the hem
  const ex = long ? lerp(L.jx, L.ex, 0.8) : lerp(L.jx, L.ex, 0.12);
  const ey = long ? lerp(L.jy, L.ey, 0.8) : lerp(L.jy, L.ey, 0.12);
  const dx = ex - hip[0], dy = ey - hip[1];
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d, nx = uy, ny = -ux;
  const [wx, wy] = fp(T.px, T.py, T.pel, far ? 2.5 : -2.5, -9.5);
  const w0 = 9.6 * B.hips, w1 = (long ? 11 : 10.6) * B.hips;
  const fl = far ? 1 : 1.15;
  const p = P2();
  p.moveTo(wx + nx * w0, wy + ny * w0);
  p.quadraticCurveTo(hip[0] + nx * (w0 + 1.2), hip[1] + ny * (w0 + 1.2), ex + nx * w1 * fl + ux * 3, ey + ny * w1 * fl + uy * 3);
  p.lineTo(ex + ux * 5, ey + uy * 5);
  p.lineTo(ex - nx * w1 + ux * 3, ey - ny * w1 + uy * 3);
  p.quadraticCurveTo(hip[0] - nx * (w0 + 1), hip[1] - ny * (w0 + 1), wx - nx * w0, wy - ny * w0);
  p.closePath();
  P.layer();
  P.part(p, col, { c: [(wx + ex) / 2, (wy + ey) / 2, 10], back: far, flat: far });
  const slit = P2(); slit.moveTo(ex + ux * 4, ey + uy * 4); slit.lineTo(lerp(ex, hip[0], 0.55), lerp(ey, hip[1], 0.55));
  if (!far) P.line(slit, 0.8);
  void legCol;
}

function scarfWrap(P, look, S, B, T) {
  const m = frame(S.neck[0], S.neck[1], T.lean);
  const p = P2();
  p.moveTo(-4.8, -2.6); p.quadraticCurveTo(0, -4.8, 5.0, -2.8); p.lineTo(5.2, -0.2); p.quadraticCurveTo(0, 1.6, -5.0, 0.2); p.closePath();
  P.layer(1.4);
  P.part(p, look.scarf, { m, c: [0, -1.4, 3], hi: true });
  const knot = P2(); ellipse(knot, -5.0, -0.8, 1.7, 2.0);
  P.part(knot, look.scarf, { m });
  void B;
}

function rope(P, S, B, T, chM) {
  const p = P2();
  for (const y of [-14, -8.5]) { p.moveTo(-13.4 * B.chest, y - 1.4); p.quadraticCurveTo(0, y + 2.6, 13.2 * B.chest, y - 1.2); }
  P.line(p, 3.2, null, chM);
  P.line(p, 1.8, '#d8b878', chM);
  const a = P2();
  const { legN, legF } = S;
  a.moveTo(legN.ex - 1, legN.ey - 5); a.lineTo(legF.ex + 1, legF.ey - 6);
  a.moveTo(legN.ex - 1, legN.ey - 2.5); a.lineTo(legF.ex + 1, legF.ey - 3);
  P.line(a, 3.0);
  P.line(a, 1.6, '#d8b878');
  void T;
}

function jointBolts(P, pts, col) {
  const p = P2();
  for (let i = 0; i < pts.length; i += 2) circle(p, pts[i], pts[i + 1], 2.4);
  P.layer(1.2);
  P.part(p, col || '#e8262b', { flat: true });
}

// ------------------------------------------------------------ cloth

// Portrait: the cape spread behind both shoulders, framing the figure
const capeP = new Painter();
function capeBackdrop(ctx, opts, look, B, chM, facing, s, t, lw) {
  ctx.save();
  ctx.scale(facing * s, s);
  const P = capeP.begin(ctx, opts, lw, facing);
  const cw = B.chest;
  const w = Math.sin(t * 1.3) * 1.5, w2 = Math.sin(t * 1.7 + 1) * 1.5;
  const p = P2();
  p.moveTo(-8 * cw, -21);
  p.bezierCurveTo(-24 * cw, -27 + w, -33 * cw + w, -12, -31 * cw + w, 18);
  p.quadraticCurveTo(-26 * cw, 13 + w, -21 * cw, 20 + w2); p.quadraticCurveTo(-15 * cw, 13, -9 * cw, 19 + w);
  p.quadraticCurveTo(0, 14, 9 * cw, 19 + w2); p.quadraticCurveTo(15 * cw, 13, 21 * cw, 19 + w);
  p.quadraticCurveTo(25 * cw, 13 + w2, 29 * cw + w2, 17);
  p.bezierCurveTo(31 * cw + w2, -10, 22 * cw, -25 + w2, 8 * cw, -21);
  p.closePath();
  P.layer();
  P.part(p, look.cape, { m: chM, c: [0, -2, 20], dots: true, sh: look.cape === '#161843' ? '#0c0d26' : null });
  const f = P2(); f.moveTo(-20 * cw, -14); f.quadraticCurveTo(-24 * cw, 0, -21 * cw, 17); f.moveTo(20 * cw, -13); f.quadraticCurveTo(23 * cw, 0, 21 * cw, 16);
  P.line(f, 0.8, null, chM);
  P.run();
  ctx.restore();
}

function capeHem(look) {
  if (look.capeHem) return look.capeHem;
  if (look.head === 'hood' || look.head === 'crown') return 'jag';
  if (look.head === 'brain') return 'point';
  return 'scallop';
}

function drawCloth(ctx, ent, A, opts, B, C, S, toW, lw, s, chM, hdM, pelM) {
  const look = ent.look || {};
  const T = C.T;
  const dt = A.simDt;
  A.simDt = 0;
  const facing = C.facing;
  const onG = C.onGround;
  const floor = A.groundY != null && ent.y <= A.groundY + 2 && (onG || ent.y > A.groundY - 400) ? A.groundY - 1.5 : null;
  const wind = A.windX || 0;
  const speed = Math.min(1, Math.hypot(A.svx, A.svy) / 450);
  const base = { t: A.t, facing, slack: 3 * s, back: facing, floor, flutter: (60 + 1300 * speed) * s, flutterF: 8 + 9 * speed };
  const at = (m, x, y) => { const c = m[0], n = m[1]; return toW(m[4] + x * c - y * n, m[5] + x * n + y * c); };
  const list = [];
  const flatOut = (Math.abs(T.rot || 0) > 1.2 && Math.abs(T.rot || 0) < 5) || (T.fx & 16);
  if (look.cape && !flatOut) {
    const [ax, ay] = at(chM, -7.2 * B.chest, -17.4);
    const seg = 7.2 * s * (B.robot ? 1 : 1) * (ent.k === 'boss' ? 1.05 : 1);
    A.cape = simChain(A.cape, 8, seg, ax, ay, dt, { ...base, wind, grav: 1500 * s, drag: 4.6 });
    list.push([A.cape, 8, 15 * s * B.chest, 34 * s * B.chest, look.cape, capeHem(look), true]);
  } else A.cape = null;
  if ((look.torso === 'trench' || look.torso === 'labcoat' || look.torso === 'robe') && !flatOut) {
    const [ax, ay] = at(pelM, -8.6 * B.hips, -6);
    const long = look.torso === 'robe';
    A.coat = simChain(A.coat, long ? 5 : 4, (long ? 9 : 7) * s, ax, ay, dt, { ...base, slack: 2 * s, wind: wind * 0.8, grav: 1800 * s, drag: 3.2, flutter: base.flutter * 0.3 });
    list.push([A.coat, long ? 5 : 4, 12 * s, 15 * s, look.suit, 'scallop', false]);
  } else A.coat = null;
  if (look.scarf) {
    const [ax, ay] = at(chM, -4.6, -20.2);
    A.scarf = simChain(A.scarf, 7, 5.4 * s, ax, ay, dt, { ...base, slack: 1 * s, wind: wind * 1.3, grav: 900 * s, drag: 7, flutter: base.flutter * 1.5 });
    list.push([A.scarf, 7, 6 * s, 4.4 * s, look.scarf, 'jag', false]);
  } else A.scarf = null;
  if (look.ponytail) {
    const [ax, ay] = at(hdM, -7.2, -5.2);
    A.pony = simChain(A.pony, 6, 4.4 * s, ax, ay, dt, { ...base, slack: 2 * s, wind: wind * 0.35, grav: 1300 * s, drag: 5, flutter: base.flutter * 0.6 });
    list.push([A.pony, 6, 6.4 * s, 2.6 * s, look.hair || '#e8262b', 'round', false]);
  } else A.pony = null;
  if (!list.length) return;
  const P = clothP.begin(ctx, opts, lw * s, 1);
  for (const [ch, n, w0, w1, col, hem, folds] of list) {
    P.layer(lw * s);
    const path = ribbonPath(P2(), ch, n, w0, w1, hem);
    const d = 2.2 * s;
    const lit = ribbonPath(P2(), ch, n, w0, w1, hem, 0.62, P.lx * d, P.ly * d);
    P.part(path, col, { lit, dots: !!folds });
    if (folds) P.line(foldLines(P2(), ch, n, w0, w1), 0.9 * s);
  }
  P.run();
}

// -------------------------------------------------------------- fx

function fxLocal(ctx, P, T, S, A, C, opts, B, hd0, hx, hy, farHand) {
  if (opts.asleep || opts.ghost || opts.noInk) return;
  const ink = P.ink;
  ctx.lineCap = 'round';
  // punch motion lines + impact star
  if ((T.fx & 1) && A.melee > 0) {
    const p = 1 - A.melee / 0.2;
    const kind = A.punchKind;
    const useFar = T.fk1 > T.fk0;
    const fx = useFar && farHand ? farHand.hx : hx, fy = useFar && farHand ? farHand.hy : hy;
    const a = kind === 3 ? -PI / 2 + 0.3 : C.aim;
    const ux = Math.cos(a), uy = Math.sin(a);
    const k = Math.sin(Math.min(1, p / 0.6) * PI);
    if (k > 0.2) {
      ctx.strokeStyle = ink;
      for (let i = -1; i <= 1; i++) {
        const ox = -uy * i * 3.4, oy = ux * i * 3.4;
        const l0 = 7 + Math.abs(i) * 2, l1 = l0 + (12 + (i === 0 ? 8 : 0)) * k;
        ctx.lineWidth = 1.6 - Math.abs(i) * 0.4;
        ctx.beginPath(); ctx.moveTo(fx - ux * l0 + ox, fy - uy * l0 + oy); ctx.lineTo(fx - ux * l1 + ox, fy - uy * l1 + oy); ctx.stroke();
      }
      if (p > 0.18 && p < 0.55) {
        const st = starburstPath(fx + ux * 7, fy + uy * 7, 3.5, 8 + (kind === 3 ? 3 : 0), 7, 3 + kind);
        ctx.fillStyle = kind === 3 ? '#ffd23f' : '#ffffff';
        ctx.globalAlpha *= 0.9;
        ctx.fill(st);
        ctx.globalAlpha /= 0.9;
        ctx.lineWidth = 1; ctx.strokeStyle = ink; ctx.stroke(st);
      }
    }
    if (kind === 3 && p < 0.7) {
      // uppercut swoosh arc
      const sh = useFar ? S.shF : S.shN;
      ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(sh[0] - 2, sh[1] + 4, 22, 0.9, 0.9 - 1.6 * Math.min(1, p / 0.5), true); ctx.stroke();
    }
  }
  // claw swipe streaks
  if ((T.fx & 4) && C.W.hold === 'claws') {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { ctx.moveTo(hx + 2, hy - 6 + i * 4); ctx.lineTo(hx + 18, hy - 10 + i * 6); }
    ctx.stroke();
  }
  // sweat drops when fleeing / scared
  if (T.fx & 64) {
    const h = S.neckTop;
    const t = A.t * 6;
    ctx.fillStyle = '#9fe4ff'; ctx.strokeStyle = ink; ctx.lineWidth = 0.8;
    for (let i = 0; i < 2; i++) {
      const ph = (t + i * 0.5) % 1;
      const x = h[0] - 6 - i * 4 - ph * 4, y = h[1] - 12 + ph * 8;
      const d = new Path2D(); d.moveTo(x, y - 2.6); d.quadraticCurveTo(x + 1.8, y + 0.4, x, y + 1.4); d.quadraticCurveTo(x - 1.8, y + 0.4, x, y - 2.6);
      ctx.fill(d); ctx.stroke(d);
    }
  }
  // alert: startle lines
  if ((T.fx & 128) && A.actAge < 0.6) {
    const h = S.neckTop;
    const k = 1 - A.actAge / 0.6;
    ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -PI / 2 + (i - 2) * 0.42;
      const r0 = 16 * B.head + 2, r1 = r0 + 7 * k;
      ctx.moveTo(h[0] + 2 + Math.cos(a) * r0, h[1] - 8 + Math.sin(a) * r0);
      ctx.lineTo(h[0] + 2 + Math.cos(a) * r1, h[1] - 8 + Math.sin(a) * r1);
    }
    ctx.stroke();
  }
  // artist scribble trail
  if (T.fx & 32) {
    const t = A.t;
    const tip = [hx + Math.cos(T.wa) * 37, hy + Math.sin(T.wa) * 37];
    ctx.strokeStyle = 'rgba(80,130,210,0.8)'; ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const w = (t - i * 0.012) * 16;
      const x = tip[0] + Math.cos(w) * 5 - i * 0.2, y = tip[1] + Math.sin(w * 2) * 3.5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  void hd0; void opts;
}

export { WMETA, isDark, sat };
