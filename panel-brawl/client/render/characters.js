// Procedural comic characters (entry point).
//
// The rig lives in ./rig/:
//   anim.js      makeAnim / updateAnim: clocks, springs, event detection
//   pose.js      procedural poses (locomotion, arms, act states) + hinted IK
//   build.js     body proportions per role
//   body.js      shapes (tapered muscled limbs, V-taper torso, costumes) + layering
//   heads.js     heads, hair, hats and expressive faces
//   props.js     weapons, shields, gear
//   cloth.js     verlet capes / scarves / ponytails / coat tails
//   creatures.js bat / crow, saucer, brain jar
//   portrait.js  heroic 3/4 bust for HUD + hero select
//   painter.js   unified-outline inking + one-tone cel shading
//
// Public API (unchanged): makeAnim, updateAnim, drawCharacter, drawWeapon, drawPortrait.

import { makeAnim, updateAnim } from './rig/anim.js';
import { drawHumanoid, getBuild } from './rig/body.js';
import { drawBat, drawSaucer, drawBrainJar } from './rig/creatures.js';
import { drawWeapon } from './rig/props.js';
import { drawPortrait } from './rig/portrait.js';
import { effAct, ST_DOWN } from './rig/pose.js';
import { INK, starburstPath, rand } from './ink.js';
import { ACT } from '../../shared/ai.js';
import { TAU, clamp, sat } from './rig/util.js';

export { makeAnim, updateAnim, drawWeapon, drawPortrait };

// opts: { weapon, asleep, wake, draw, flash, hurt, tint, tintAmt, rim, alpha, lw,
//         noShadow, noInk, noFill, ink, ghost }
export function drawCharacter(ctx, ent, A, opts = {}) {
  if (!ent || !A) return;
  const look = ent.look || {};
  const body = look.body || 'humanoid';
  ctx.save();
  if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
  const s = (look.scale || 1) * (ent.renderScale || 1);
  const flying = body === 'bat' || body === 'saucer' || body === 'brainjar' || (look.extra === 'jetpack' && ent.k === 'flyer');
  const act = effAct(ent);
  const lying = act === ACT.knockdown || act === ACT.downed || act === ST_DOWN || act === ACT.tied;

  // contact shadow
  if (!opts.noShadow && !opts.ghost && ent.onGround !== false && !flying) {
    const bulk = look.bulk || 1;
    const rx = (lying ? 34 : 17 + (A.runK || 0) * 3) * s * Math.min(1.6, 0.8 + bulk * 0.25);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(ent.x, ent.y + 1, rx, 4 * Math.sqrt(s), 0, 0, TAU);
    ctx.fill();
  }

  // dash afterimages (flat ghosts, no ink)
  if (A.trail && A.trail.length && !opts.asleep && !opts.ghost && opts.draw == null) {
    const n = A.trail.length;
    for (let i = 0; i < n; i++) {
      const p = A.trail[i];
      const k = 1 - (A.t - p.t) / 0.2;
      if (k <= 0) continue;
      const g = { ...ent, x: p.x, y: p.y };
      drawBody(ctx, g, A, { ...opts, ghost: true, noInk: true, tint: i % 2 ? '#23d5e8' : '#ff3fa4', alpha: undefined, flash: 0 }, 0.28 * k);
    }
  }

  // flung by a big hit: action lines streaming behind the body
  if (A.flung > 0 && !opts.asleep) {
    const sp = Math.hypot(ent.vx || 0, ent.vy || 0);
    if (sp > 120) {
      const ux = -(ent.vx || 0) / sp, uy = -(ent.vy || 0) / sp;
      const cy = ent.y - (ent.h || 90) * 0.5;
      const k = A.flung / 0.4;
      ctx.strokeStyle = INK;
      ctx.lineCap = 'round';
      for (let i = -2; i <= 2; i++) {
        const ox = -uy * i * 11, oy = ux * i * 11;
        const len = (50 + (i & 1) * 30) * k + 20;
        ctx.lineWidth = 3 - Math.abs(i) * 0.5;
        ctx.beginPath();
        ctx.moveTo(ent.x + ux * 26 + ox, cy + uy * 26 + oy);
        ctx.lineTo(ent.x + ux * (26 + len) + ox, cy + uy * (26 + len) + oy);
        ctx.stroke();
      }
    }
  }

  if (opts.draw != null && opts.draw < 1) drawBeingDrawn(ctx, ent, A, opts);
  else if (opts.wake != null && opts.wake < 1) {
    // colour floods in from the chest outward
    drawBody(ctx, ent, A, { ...opts, asleep: true });
    const r = Math.pow(sat(opts.wake), 1.4) * 105 * s;
    const cx = ent.x, cy = ent.y - (ent.h || 90) * 0.55;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.clip();
    drawBody(ctx, ent, A, { ...opts, asleep: false });
    ctx.restore();
    if (!opts.noInk) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 3 * (1 - opts.wake) + 1;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    }
  } else drawBody(ctx, ent, A, opts);

  // energy shield bubble (sci-fi troopers)
  if (ent.eshield > 0 && !opts.asleep && !opts.ghost) eshieldBubble(ctx, ent, A, s);

  // dizzy stars
  const dizzy = ent.stun || ent.stagger || A.stars > 0 || act === ACT.stunned || act === ACT.stagger || act === ACT.knockdown || act === ST_DOWN;
  if (dizzy && !opts.asleep && !opts.ghost && A._head) {
    const [hx, hy] = A._head;
    const r = 13 * s;
    for (let i = 0; i < 3; i++) {
      const a = A.t * 5 + (i * TAU) / 3;
      const px = hx + Math.cos(a) * r, py = hy - 13 * s + Math.sin(a) * r * 0.32;
      const star = starburstPath(px, py, 2.2 * Math.sqrt(s), 5.4 * Math.sqrt(s), 5, i + 3, a);
      ctx.fillStyle = '#ffe14a';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.4;
      ctx.fill(star);
      ctx.stroke(star);
    }
  }
  ctx.restore();
}

function drawBody(ctx, ent, A, opts, alpha) {
  const look = ent.look || {};
  if (alpha != null) { ctx.save(); ctx.globalAlpha *= alpha; }
  switch (look.body) {
    case 'bat': drawBat(ctx, ent, A, opts); A._head = [ent.x, ent.y - (ent.h || 42) * 0.6]; break;
    case 'saucer': drawSaucer(ctx, ent, A, opts); A._head = [ent.x, ent.y - (ent.h || 34)]; break;
    case 'brainjar': drawBrainJar(ctx, ent, A, opts); A._head = [ent.x, ent.y - (ent.h || 150)]; break;
    default: {
      const C = drawHumanoid(ctx, ent, A, opts);
      if (!opts.ghost && C && C.S) A._head = headWorld(ent, C);
    }
  }
  if (alpha != null) ctx.restore();
}

function headWorld(ent, C) {
  const T = C.T, S = C.S;
  let x = S.neckTop[0] + 1, y = S.neckTop[1] - 12 * C.B.head;
  if (T.rot) {
    const c = Math.cos(T.rot), s = Math.sin(T.rot);
    const dx = x - T.rpx, dy = y - T.rpy;
    x = dx * c - dy * s + T.rpx + T.rtx; y = dx * s + dy * c + T.rpy + T.rty;
  }
  return [ent.x + x * C.facing * C.s, ent.y + y * C.s];
}

// Pencil sketch -> ink -> colour
function drawBeingDrawn(ctx, ent, A, opts) {
  const p = sat(opts.draw);
  const look = ent.look || {};
  const s = look.scale || 1;
  const top = ent.y - (ent.h || 92) - 30 * s;
  const bottom = ent.y + 8;
  const H = bottom - top;
  const left = ent.x - 140 * s, W = 280 * s;
  const pencil = sat(p / 0.4);
  const r = rand(Math.floor(A.t * 10) + 1);
  // blue pencil construction: jittered double contour, revealed top -> bottom
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, W, H * pencil);
  ctx.clip();
  const fade = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
  for (let i = 0; i < 2; i++) {
    ctx.save();
    ctx.globalAlpha *= 0.85 * fade;
    ctx.translate((r() - 0.5) * 2.4, (r() - 0.5) * 2.4);
    drawBody(ctx, ent, A, { ...opts, noFill: true, noShadow: true, ink: 'rgba(70,120,210,0.8)', lw: 0.55, rim: null });
    ctx.restore();
  }
  ctx.restore();
  // construction scribble on the leading edge
  if (pencil < 1) {
    const y = top + H * pencil;
    ctx.save();
    ctx.strokeStyle = 'rgba(70,120,210,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const x0 = ent.x + (r() - 0.5) * 50 * s;
      ctx.moveTo(x0, y - r() * 6);
      ctx.lineTo(x0 + (r() - 0.5) * 24 * s, y + r() * 4);
    }
    ctx.stroke();
    ctx.restore();
  }
  // ink pass
  if (p > 0.35) {
    const inkP = sat((p - 0.35) / 0.35);
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, W, H * inkP);
    ctx.clip();
    drawBody(ctx, ent, A, { ...opts, noFill: true, noShadow: true, lw: (opts.lw || 2.35) * 0.45 });
    ctx.restore();
  }
  // colour
  if (p > 0.62) drawBody(ctx, ent, A, { ...opts, noShadow: true }, sat((p - 0.62) / 0.3));
}

function eshieldBubble(ctx, ent, A, s) {
  const k = clamp(ent.eshield, 0, 1);
  const h = ent.h || 90, w = ent.w || 36;
  const cx = ent.x, cy = ent.y - h * 0.52;
  const rx = Math.max(w * 0.95, 28 * s), ry = h * 0.62;
  const flick = k < 0.3 ? (Math.sin(A.t * 40) > 0 ? 1 : 0.4) : 1;
  ctx.save();
  ctx.globalAlpha *= (0.12 + 0.14 * k) * flick;
  ctx.fillStyle = '#23d5e8';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = ctx.globalAlpha / ((0.12 + 0.14 * k) * flick) * (0.5 + 0.4 * k) * flick;
  ctx.strokeStyle = '#8ff4ff';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -2; i <= 2; i++) {
    const y = cy + i * ry * 0.34;
    const ww = rx * Math.sqrt(Math.max(0, 1 - (i * 0.34) ** 2)) * 0.85;
    const ph = (A.t * 30 + i * 13) % 12;
    for (let x = -ww; x < ww - 6; x += 12) { ctx.moveTo(cx + x + ph * 0, y); ctx.lineTo(cx + x + 6, y + 3.4); ctx.lineTo(cx + x + 12, y); }
  }
  ctx.stroke();
  ctx.restore();
}

export { getBuild };
