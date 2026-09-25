// Procedural comic characters.
// A 2-bone IK rig (arms/legs), a lean-able torso and a set of head/torso/
// weapon "costume pieces" chosen by a look spec. Drawn in three layers
// (back, mid, front); each layer is stroked with thick ink first and filled
// second, which gives the unified silhouette outline of inked comic art.

import { INK, shade, mix, desat, halftone, rand, starburstPath, cloudPath } from './ink.js';
import { WEAPONS } from '../../shared/weapons.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------ animation

export function makeAnim(seed = 1) {
  return {
    t: (seed % 97) * 0.37, phase: 0, speed: 0, cape: null, scarf: null, pony: null, coat: null,
    land: 0, prevGround: true, prevVy: 0, melee: 0, meleeBig: false, slash: 0, recoil: 0, lean: 0,
    flash: 0, hurt: 0, stars: 0, blink: 3 + (seed % 5), trail: [], lastX: null, lastY: null, jumpSquash: 0,
    climbPhase: 0, flip: 0, seed,
  };
}

// ent: { x, y, vx, vy, facing, aim, h, onGround, crouch, climb, dash, look, scale }
export function updateAnim(A, ent, dt) {
  A.t += dt;
  const sp = Math.abs(ent.vx || 0);
  A.speed = lerp(A.speed, ent.onGround && !ent.climb ? sp : 0, Math.min(1, dt * 12));
  if (ent.onGround) A.phase += (sp * dt) / 13;
  if (ent.climb) A.climbPhase += Math.abs(ent.vy || 0) * dt / 16;
  if (ent.onGround && !A.prevGround && A.prevVy > 300) A.land = Math.min(1, A.prevVy / 1100);
  if (!ent.onGround && A.prevGround && (ent.vy || 0) < -200) A.jumpSquash = 1;
  A.prevGround = !!ent.onGround;
  A.prevVy = ent.vy || 0;
  A.land = Math.max(0, A.land - dt * 5);
  A.jumpSquash = Math.max(0, A.jumpSquash - dt * 6);
  A.melee = Math.max(0, A.melee - dt);
  A.slash = Math.max(0, A.slash - dt);
  A.recoil = Math.max(0, A.recoil - dt * 7);
  A.flash = Math.max(0, A.flash - dt);
  A.hurt = Math.max(0, A.hurt - dt);
  A.stars = Math.max(0, A.stars - dt);
  A.flung = Math.max(0, (A.flung || 0) - dt);
  const targetLean = ent.climb ? 0 : clamp((ent.vx || 0) * (ent.facing || 1) / 390, -1, 1) * 0.16 + (ent.dash ? 0.3 : 0);
  A.lean = lerp(A.lean, targetLean, Math.min(1, dt * 10));
  A.blink -= dt;
  if (A.blink < -0.12) A.blink = 2 + Math.random() * 3;
  // dash afterimages
  if (ent.dash && (A.trail.length === 0 || A.t - A.trail[A.trail.length - 1].t > 0.03)) A.trail.push({ x: ent.x, y: ent.y, t: A.t });
  A.trail = A.trail.filter((p) => A.t - p.t < 0.22);

  const look = ent.look || {};
  const s = (look.scale || 1) * (ent.renderScale || 1);
  const crouch = ent.crouch ? 1 : 0;
  // cloth chains (world space)
  const shoulderY = ent.y - (crouch ? 44 : 70) * s;
  const backX = ent.x - (ent.facing || 1) * 5 * s;
  if (look.cape) A.cape = simChain(A.cape, 9, 7.4 * s, backX, shoulderY, ent, dt, 1);
  if (look.scarf) A.scarf = simChain(A.scarf, 7, 6 * s, backX + (ent.facing || 1) * 2 * s, shoulderY - 6 * s, ent, dt, 1.4);
  if (look.ponytail) A.pony = simChain(A.pony, 5, 6 * s, backX - (ent.facing || 1) * 3 * s, shoulderY - 20 * s, ent, dt, 0.8);
  if (look.torso === 'trench' || look.torso === 'labcoat' || look.torso === 'robe') A.coat = simChain(A.coat, 4, 9 * s, backX, ent.y - (crouch ? 26 : 44) * s, ent, dt, 0.6);
}

function simChain(ch, n, seg, ax, ay, ent, dt, windMul) {
  if (!ch || ch.length !== n) {
    ch = [];
    for (let i = 0; i < n; i++) ch.push({ x: ax - (ent.facing || 1) * i * 2, y: ay + i * seg, px: ax - (ent.facing || 1) * i * 2, py: ay + i * seg });
  }
  const step = Math.min(dt, 1 / 30);
  const evx = ent.vx || 0, evy = ent.vy || 0;
  const accX = -evx * 3.2 * windMul;
  const accY = 1400 - evy * 0.7 * windMul;
  const flutter = Math.min(1, Math.abs(evx) / 250 + Math.abs(evy) / 900);
  const t = (ent._t = (ent._t || 0) + step);
  for (let i = 1; i < n; i++) {
    const p = ch[i];
    const vx = (p.x - p.px) * 0.9, vy = (p.y - p.py) * 0.9;
    p.px = p.x;
    p.py = p.y;
    p.x += vx + (accX + Math.sin(performance.now() / 90 + i * 1.3) * 500 * flutter) * step * step;
    p.y += vy + accY * step * step;
  }
  ch[0].x = ax; ch[0].y = ay; ch[0].px = ax; ch[0].py = ay;
  for (let k = 0; k < 4; k++) {
    for (let i = 1; i < n; i++) {
      const a = ch[i - 1], b = ch[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const diff = (d - seg) / d;
      if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
      else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
    }
    ch[0].x = ax; ch[0].y = ay;
  }
  // teleport guard (respawn etc.)
  if (Math.hypot(ch[n - 1].x - ax, ch[n - 1].y - ay) > seg * n * 2) return null;
  return ch;
}

// ------------------------------------------------------------------ rig

function ik(ax, ay, tx, ty, l1, l2, bend) {
  let dx = tx - ax, dy = ty - ay;
  let d = Math.hypot(dx, dy);
  const maxd = l1 + l2 - 0.01;
  if (d > maxd) { dx *= maxd / d; dy *= maxd / d; d = maxd; }
  if (d < 0.01) d = 0.01;
  const a = Math.atan2(dy, dx);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const ea = a + bend * A;
  return { ex: ax + Math.cos(ea) * l1, ey: ay + Math.sin(ea) * l1, hx: ax + dx, hy: ay + dy };
}

function limb(x1, y1, x2, y2, r1, r2, p = new Path2D()) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  p.moveTo(x1 + Math.cos(a + Math.PI / 2) * r1, y1 + Math.sin(a + Math.PI / 2) * r1);
  p.arc(x1, y1, r1, a + Math.PI / 2, a - Math.PI / 2);
  p.arc(x2, y2, r2, a - Math.PI / 2, a + Math.PI / 2);
  p.closePath();
  return p;
}

function circle(x, y, r, p = new Path2D()) {
  p.moveTo(x + r, y);
  p.arc(x, y, r, 0, TAU);
  return p;
}

function rot(px, py, a, ox = 0, oy = 0) {
  const c = Math.cos(a), s = Math.sin(a);
  return [ox + px * c - py * s, oy + px * s + py * c];
}

function xform(path, x, y, a, sx = 1, sy = 1) {
  const p = new Path2D();
  p.addPath(path, new DOMMatrix().translate(x, y).rotate((a * 180) / Math.PI).scale(sx, sy));
  return p;
}

// ------------------------------------------------------------- painter

class Painter {
  constructor(ctx, o) {
    this.ctx = ctx;
    this.o = o;
    this.ink = o.ink || INK;
    this.lw = o.lw || 2.6;
    this.layer = [];
  }
  color(c) {
    const o = this.o;
    if (!c) return c;
    if (o.flash > 0) return mix(c, '#ffffff', clamp(o.flash * 1.6, 0, 1));
    if (o.asleep) return mix(desat(c, 0.95), '#f3ead3', 0.55);
    if (o.hurt > 0) return mix(c, '#ff2020', o.hurt * 0.45);
    if (o.tint) return mix(c, o.tint, o.tintAmt || 0.3);
    return c;
  }
  add(path, color, shadeIt = true, extra) {
    this.layer.push({ path, color, shadeIt, extra });
  }
  flush() {
    const ctx = this.ctx;
    const o = this.o;
    if (!this.layer.length) return;
    if (!o.noInk) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (o.rim && !o.asleep) {
        ctx.strokeStyle = o.rim;
        ctx.lineWidth = this.lw * 2 + 3.2;
        for (const part of this.layer) ctx.stroke(part.path);
      }
      ctx.strokeStyle = this.ink;
      ctx.lineWidth = this.lw * 2;
      for (const part of this.layer) ctx.stroke(part.path);
    }
    if (!o.noFill) {
      for (const part of this.layer) {
        const col = this.color(part.color);
        ctx.fillStyle = col;
        ctx.fill(part.path);
        if (part.shadeIt && !o.asleep && !(o.flash > 0.3)) {
          ctx.save();
          ctx.clip(part.path);
          const sh = new Path2D();
          sh.rect(-400, -400, 800, 800);
          sh.addPath(part.path, new DOMMatrix().translate(-3.2, -2.6));
          ctx.fillStyle = shade(col, -0.2);
          ctx.fill(sh, 'evenodd');
          ctx.fillStyle = halftone(ctx, shade(col, -0.42), 3.4, 0.75);
          ctx.fill(sh, 'evenodd');
          ctx.restore();
        } else if (part.shadeIt && o.asleep) {
          ctx.save();
          ctx.clip(part.path);
          const sh = new Path2D();
          sh.rect(-400, -400, 800, 800);
          sh.addPath(part.path, new DOMMatrix().translate(-3, -3));
          ctx.fillStyle = 'rgba(40,40,40,0.25)';
          ctx.fill(sh, 'evenodd');
          ctx.restore();
        }
        if (part.extra) part.extra(ctx, col);
      }
    }
    this.layer = [];
  }
  // immediate inner detail line
  line(path, w = 1.6, color = null) {
    if (this.o.noInk) return;
    const ctx = this.ctx;
    ctx.lineWidth = w;
    ctx.strokeStyle = color || this.ink;
    ctx.stroke(path);
  }
  fill(path, color) {
    if (this.o.noFill) return;
    this.ctx.fillStyle = this.color(color);
    this.ctx.fill(path);
  }
}

// --------------------------------------------------------------- entry

// opts: { weapon, asleep, flash, hurt, alpha, wake(0..1), draw(0..1), invuln, time, noShadow }
export function drawCharacter(ctx, ent, A, opts = {}) {
  const look = ent.look || {};
  const body = look.body || 'humanoid';
  ctx.save();
  if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;

  if (!opts.noShadow && ent.onGround !== false && body !== 'bat' && body !== 'saucer' && body !== 'brainjar') {
    const s = (look.scale || 1) * (look.bulk || 1);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(ent.x, ent.y + 1, 20 * s, 4.5, 0, 0, TAU);
    ctx.fill();
  }

  // dash afterimages
  if (A.trail.length > 1 && !opts.asleep) {
    for (const p of A.trail) {
      const k = 1 - (A.t - p.t) / 0.22;
      drawBody(ctx, { ...ent, x: p.x, y: p.y }, A, { ...opts, noInk: true, tint: '#23d5e8', tintAmt: 0.85, alpha: 0.25 * k, ghost: true });
    }
  }

  // flung by a big hit: action lines streaming behind the body
  if (A.flung > 0 && !opts.asleep) {
    const sp = Math.hypot(ent.vx || 0, ent.vy || 0);
    if (sp > 120) {
      const ux = -(ent.vx || 0) / sp, uy = -(ent.vy || 0) / sp;
      const cy = ent.y - (ent.h || 90) * 0.5;
      const k = A.flung / 0.4;
      ctx.save();
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
      ctx.restore();
    }
  }

  if (opts.draw != null && opts.draw < 1) {
    drawBeingDrawn(ctx, ent, A, opts);
  } else if (opts.wake != null && opts.wake < 1) {
    // colour floods in from the chest outward
    drawBody(ctx, ent, A, { ...opts, asleep: true });
    const s = look.scale || 1;
    const r = opts.wake * 90 * s;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ent.x, ent.y - (ent.h || 90) * 0.55, r, 0, TAU);
    ctx.clip();
    drawBody(ctx, ent, A, { ...opts, asleep: false });
    ctx.restore();
  } else {
    drawBody(ctx, ent, A, opts);
  }
  ctx.restore();
}

function drawBeingDrawn(ctx, ent, A, opts) {
  const p = opts.draw;
  const look = ent.look || {};
  const s = (look.scale || 1);
  const top = ent.y - (ent.h || 92) - 20 * s;
  const bottom = ent.y + 6;
  // pencil pass reveals top->bottom
  const pencil = clamp(p / 0.45, 0, 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ent.x - 120 * s, top, 240 * s, (bottom - top) * pencil);
  ctx.clip();
  const r = rand(Math.floor(A.t * 12) + 1);
  for (let i = 0; i < 2; i++) {
    ctx.save();
    ctx.translate((r() - 0.5) * 3, (r() - 0.5) * 3);
    drawBody(ctx, ent, A, { ...opts, noFill: true, ink: 'rgba(80,130,210,0.75)', lw: 0.6, noShadow: true });
    ctx.restore();
  }
  ctx.restore();
  if (p > 0.4) {
    const inkP = clamp((p - 0.4) / 0.3, 0, 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ent.x - 120 * s, top, 240 * s, (bottom - top) * inkP);
    ctx.clip();
    drawBody(ctx, ent, A, { ...opts, noFill: p < 0.72, asleep: p < 0.85 });
    ctx.restore();
  }
}

function drawBody(ctx, ent, A, opts) {
  const look = ent.look || {};
  switch (look.body) {
    case 'bat': return drawBat(ctx, ent, A, opts);
    case 'saucer': return drawSaucer(ctx, ent, A, opts);
    case 'brainjar': return drawBrainJar(ctx, ent, A, opts);
    default: return drawHumanoid(ctx, ent, A, opts);
  }
}

// ---------------------------------------------------------- humanoid

function drawHumanoid(ctx, ent, A, opts) {
  const look = ent.look;
  const robot = look.body === 'robot';
  const s = (look.scale || 1) * (ent.renderScale || 1);
  const bulk = look.bulk || 1;
  const facing = ent.facing || 1;
  const P = new Painter(ctx, opts);
  P.lw = (opts.lw || 2.5) / Math.sqrt(s) * (robot ? 1.1 : 1);

  // cloth (world space, behind everything)
  if (!opts.ghost) drawCloth(ctx, ent, A, P, s);

  ctx.save();
  ctx.translate(ent.x, ent.y);
  // squash & stretch
  const sq = A.land * 0.18 - A.jumpSquash * 0.12;
  ctx.scale(facing * s * (1 + sq * 0.6), s * (1 - sq));

  // local aim (mirrored when facing left)
  let aim = ent.aim != null ? ent.aim : 0;
  if (facing < 0) aim = Math.PI - aim;
  while (aim > Math.PI) aim -= TAU;
  while (aim < -Math.PI) aim += TAU;
  aim = clamp(aim, -1.45, 1.45);

  const crouch = !!ent.crouch;
  const climb = !!ent.climb;
  const air = !ent.onGround && !climb;
  const speedK = clamp(A.speed / 390, 0, 1.2);
  const ph = A.phase;
  const idleBob = Math.sin(A.t * 2.4) * 0.8;
  const hunch = look.hunch || 0;

  // hip & torso
  let hipY = crouch ? -27 : -44 + Math.abs(Math.sin(ph)) * -2.5 * speedK + (speedK < 0.1 ? idleBob * 0.4 : 0);
  if (air) hipY = -46;
  let lean = A.lean + hunch + (crouch ? 0.28 : 0) + (ent.stun ? -0.15 : 0);
  if (A.hurt > 0) lean -= A.hurt * 0.6;
  if (A.melee > 0) lean += 0.18;
  const torsoLen = 28;
  const [nx, ny] = rot(0, -torsoLen, lean, 0, hipY);
  const wide = (Math.min(bulk, 1.9) - 1) * 9;
  const shF = rot(2.5 + wide, 3, lean, nx, ny);
  const shB = rot(-3 - wide, 3.5, lean, nx, ny);

  // ---------------- legs ----------------
  const thigh = robot ? 20 : 22.5, shin = robot ? 21 : 22.5;
  const legR = (robot ? 7.4 : 5.6) * Math.min(1.5, bulk);
  let fF, fB;
  if (climb) {
    const c = A.climbPhase;
    fF = [4, -8 + Math.sin(c) * 9];
    fB = [-4, -8 - Math.sin(c) * 9];
  } else if (air) {
    const rising = (ent.vy || 0) < 0;
    fF = rising ? [11, hipY + 30] : [7, hipY + 38];
    fB = rising ? [-5, hipY + 36] : [-10, hipY + 40];
  } else if (crouch) {
    fF = [13, 0];
    fB = [-9, 0];
  } else if (speedK > 0.05) {
    const stride = 15 * Math.min(1, speedK) + 2;
    const lift = 13 * Math.min(1, speedK);
    const dirMul = Math.sign((ent.vx || 0) * facing) || 1;
    fF = [Math.cos(ph) * stride * dirMul + 2, -Math.max(0, Math.sin(ph)) * lift];
    fB = [Math.cos(ph + Math.PI) * stride * dirMul - 1, -Math.max(0, Math.sin(ph + Math.PI)) * lift];
  } else {
    fF = [7 + bulk * 2, 0];
    fB = [-6 - bulk * 2, 0];
  }
  const hipF = [2.5 * bulk, hipY], hipB = [-2.5 * bulk, hipY];
  const legF = ik(hipF[0], hipF[1], fF[0], fF[1] - 3, thigh, shin, -1);
  const legB = ik(hipB[0], hipB[1], fB[0], fB[1] - 3, thigh, shin, -1);

  // ---------------- arms ----------------
  const W = opts.weapon ? WEAPONS[opts.weapon] : null;
  const wkey = opts.weapon || look.weapon || 'none';
  const upper = robot ? 16 : 16.5, fore = robot ? 16 : 16;
  const armR = (robot ? 5.6 : 4.4) * Math.min(1.45, bulk);
  const dir = [Math.cos(aim), Math.sin(aim)];
  const recoil = A.recoil * 6;
  let handF, handB;
  const meleeK = A.melee > 0 ? Math.sin((1 - A.melee / 0.2) * Math.PI) : 0;
  const armsForward = look.armsForward && !opts.weapon;
  if (climb) {
    const c = A.climbPhase;
    handF = [5, ny - 16 + Math.sin(c + 1) * 8];
    handB = [-3, ny - 16 - Math.sin(c + 1) * 8];
  } else if (A.melee > 0 && !opts.weaponSwing) {
    // punch: front fist rockets out along aim
    const reach = 18 + meleeK * 17;
    handF = [shF[0] + dir[0] * reach, shF[1] + dir[1] * reach];
    handB = [shB[0] - 6, shB[1] + 16];
  } else if (armsForward) {
    const sway = Math.sin(A.t * 3) * 3;
    handF = [shF[0] + 28, shF[1] + 4 + sway];
    handB = [shB[0] + 26, shB[1] + 8 - sway];
  } else if (wkey === 'blade') {
    // blade held high; slash sweeps it
    const sl = A.slash > 0 ? 1 - A.slash / 0.22 : -1;
    const ang = sl >= 0 ? aim - 1.4 + sl * 2.6 : aim - 0.9;
    handF = [shF[0] + Math.cos(ang) * 22, shF[1] + Math.sin(ang) * 22];
    handB = [shB[0] - 4 + Math.sin(ph) * 5 * speedK, shB[1] + 20];
  } else if (W || look.weapon && look.weapon !== 'none' && look.weapon !== 'claws') {
    const two = W ? W.twoHand : look.weapon === 'tommy' || look.weapon === 'bat';
    const reach = two ? 19 : 26;
    handF = [shF[0] + dir[0] * (reach - recoil), shF[1] + dir[1] * (reach - recoil)];
    if (two) {
      const fg = look.weapon === 'bat' ? 8 : 20;
      handB = [handF[0] + dir[0] * fg - dir[1] * 1.5, handF[1] + dir[1] * fg + dir[0] * 1.5];
    } else {
      handB = [shB[0] - 3 - Math.sin(ph) * 7 * speedK, shB[1] + 21];
    }
  } else {
    // claws / unarmed: swing arms with the run (bulky types hang them wide)
    const sw = Math.sin(ph) * 10 * speedK;
    const out = (bulk - 1) * 16;
    handF = [shF[0] + 6 + out - sw, shF[1] + 22 + out * 0.2];
    handB = [shB[0] - 4 - out * 0.6 + sw, shB[1] + 22 + out * 0.2];
    if (ent.act === 2 || ent.act === 3) {
      // windup / attack for claw enemies
      const k = ent.act === 2 ? -1 : 1;
      handF = [shF[0] + 10 + k * 16, shF[1] - 10 + k * 18];
      handB = [shB[0] + 8 + k * 12, shB[1] - 6 + k * 16];
    }
  }
  const armF = ik(shF[0], shF[1], handF[0], handF[1], upper, fore, 1);
  const armB = ik(shB[0], shB[1], handB[0], handB[1], upper, fore, 1);

  // ======================= BACK LAYER =======================
  const back = (c) => (c ? shade(c, -0.12) : c);
  const pants = look.pants || look.suit;
  P.add(limb(hipB[0], hipB[1], legB.ex, legB.ey, legR, legR * 0.92), back(pants));
  P.add(limb(legB.ex, legB.ey, legB.hx, legB.hy, legR * 0.92, legR * 0.8), back(look.boots || pants));
  P.add(boot(legB.hx, legB.hy, robot, bulk), back(look.boots || '#222'));
  if (!climb || true) {
    P.add(limb(shB[0], shB[1], armB.ex, armB.ey, armR, armR * 0.9), back(robot ? look.suit : look.suit));
    P.add(limb(armB.ex, armB.ey, armB.hx, armB.hy, armR * 0.9, armR * 0.8), back(look.gloves && !robot ? look.suit : look.suit));
    P.add(hand(armB.hx, armB.hy, armR * (robot ? 1.3 : bulk > 1.3 ? 1.1 : 1.25)), back(look.gloves || look.skin || look.suit), false);
  }
  P.flush();

  // ======================= MID LAYER ========================
  // front leg
  P.add(limb(hipF[0], hipF[1], legF.ex, legF.ey, legR, legR * 0.92), pants);
  P.add(limb(legF.ex, legF.ey, legF.hx, legF.hy, legR * 0.92, legR * 0.8), look.boots && look.torso === 'hero' ? pants : pants);
  P.add(boot(legF.hx, legF.hy, robot, bulk), look.boots || '#222');
  if (look.boots && look.torso === 'hero') {
    // boot cuffs up the shin
    const k = 0.45;
    const bx = lerp(legF.hx, legF.ex, k), by = lerp(legF.hy, legF.ey, k);
    P.add(limb(bx, by, legF.hx, legF.hy, legR * 0.98, legR * 0.84), look.boots);
  }
  // torso
  const torso = torsoPath(look, bulk, robot);
  const tp = xform(torso, 0, hipY, lean);
  const torsoColor = look.torso === 'trench' ? look.suit : look.torso === 'labcoat' ? look.suit : look.suit;
  P.add(tp, torsoColor, true, (c, col) => torsoDetail(c, P, look, hipY, lean, bulk, robot));
  // neck
  if (!robot) P.add(limb(nx, ny, ...rot(1, -6, lean, nx, ny), 3.6 * bulk, 3.6 * bulk), look.skin || look.suit, false);
  P.flush();

  // head
  const headTilt = clamp(aim * 0.35, -0.35, 0.35) + (ent.stun ? Math.sin(A.t * 9) * 0.15 : 0);
  const [hx, hy] = rot(1.5, -11, lean, nx, ny);
  drawHead(ctx, P, look, hx, hy, lean * 0.5 + headTilt, A, ent, opts, robot);

  // ======================= FRONT LAYER ======================
  // weapon behind the front hand
  const wpnDraw = () => {
    if (wkey === 'none' || wkey === 'claws') return;
    ctx.save();
    if (wkey === 'blade') {
      const sl = A.slash > 0 ? 1 - A.slash / 0.22 : -1;
      const ang = sl >= 0 ? aim - 1.2 + sl * 2.4 : aim - 1.1;
      ctx.translate(armF.hx, armF.hy);
      ctx.rotate(ang + 0.9);
    } else {
      ctx.translate(armF.hx, armF.hy);
      ctx.rotate(aim);
    }
    drawWeapon(ctx, wkey, { painter: P, asleep: opts.asleep, flash: opts.flash });
    ctx.restore();
  };
  wpnDraw();
  const sleeve = look.suit;
  P.add(limb(shF[0], shF[1], armF.ex, armF.ey, armR, armR * 0.9), sleeve);
  P.add(limb(armF.ex, armF.ey, armF.hx, armF.hy, armR * 0.9, armR * 0.82), look.gloves && look.torso === 'hero' ? sleeve : sleeve);
  if (look.gloves && !robot) {
    const bx = lerp(armF.hx, armF.ex, 0.5), by = lerp(armF.hy, armF.ey, 0.5);
    P.add(limb(bx, by, armF.hx, armF.hy, armR * 1.02, armR * 0.9), look.gloves);
  }
  const fistScale = A.melee > 0 ? 1 + meleeK * (A.meleeBig ? 1.1 : 0.6) : 1;
  P.add(hand(armF.hx, armF.hy, armR * (robot ? 1.3 : bulk > 1.3 ? 1.1 : 1.28) * fistScale), look.gloves || look.skin || look.suit, false);
  P.flush();
  if (look.torso === 'hero' && look.suit && !opts.asleep) {
    // shoulder highlight
  }
  if (A.melee > 0 && meleeK > 0.3 && !opts.asleep && !opts.noInk) {
    // motion lines behind the fist
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      const px = -dir[1] * i * 5, py = dir[0] * i * 5;
      ctx.moveTo(armF.hx - dir[0] * 14 + px, armF.hy - dir[1] * 14 + py);
      ctx.lineTo(armF.hx - dir[0] * (26 + i * i * 4) + px, armF.hy - dir[1] * (26 + i * i * 4) + py);
    }
    ctx.stroke();
  }
  if (look.weapon === 'claws' && !opts.asleep && (ent.act === 3)) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(armF.hx + 4, armF.hy - 8 + i * 6);
      ctx.lineTo(armF.hx + 22, armF.hy - 14 + i * 8);
    }
    ctx.stroke();
  }
  ctx.restore();

  // dizzy stars
  if ((ent.stun || A.stars > 0) && !opts.asleep) {
    const hy2 = ent.y - (ent.h || 92) * s * 1.02 - 6;
    for (let i = 0; i < 3; i++) {
      const a = A.t * 5 + (i * TAU) / 3;
      const px = ent.x + Math.cos(a) * 16 * s, py = hy2 + Math.sin(a) * 5 * s;
      const star = starburstPath(px, py, 2.5, 6, 5, i + 3, a);
      ctx.fillStyle = '#ffe14a';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.fill(star);
      ctx.stroke(star);
    }
  }
}

function boot(x, y, robot, bulk) {
  const p = new Path2D();
  const b = robot ? 1.3 : 1;
  p.moveTo(x - 6 * b * bulk, y - 5);
  p.lineTo(x + 3, y - 6 * b);
  p.quadraticCurveTo(x + 13 * b * Math.min(bulk, 1.4), y - 4, x + 13 * b * Math.min(bulk, 1.4), y + 2);
  p.lineTo(x - 6 * b * bulk, y + 3);
  p.closePath();
  return p;
}

function hand(x, y, r) {
  return circle(x, y, r);
}

function torsoPath(look, bulk, robot) {
  const p = new Path2D();
  const sw = 14.5 * bulk, ww = 9.8 * Math.min(bulk, 1.6) * (look.bloat ? 1.25 : 1);
  if (robot) {
    const w = 15 * bulk;
    p.moveTo(-w * 0.7, 2);
    p.lineTo(w * 0.7, 2);
    p.lineTo(w, -26);
    p.quadraticCurveTo(w, -32, w - 5, -32);
    p.lineTo(-w + 5, -32);
    p.quadraticCurveTo(-w, -32, -w, -26);
    p.closePath();
    return p;
  }
  const belly = look.bloat ? 6 : 0;
  p.moveTo(-ww, 3);
  p.lineTo(ww, 3);
  p.quadraticCurveTo(ww + 4 + belly, -12, sw + 1.5, -24);
  p.quadraticCurveTo(sw + 1, -31, sw - 6, -31);
  p.lineTo(-sw + 6, -31);
  p.quadraticCurveTo(-sw - 1, -31, -sw - 1, -24);
  p.quadraticCurveTo(-ww - 4, -12, -ww, 3);
  p.closePath();
  return p;
}

function torsoDetail(ctx, P, look, hipY, lean, bulk, robot) {
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(lean);
  const sw = 14.5 * bulk, ww = 9.8 * Math.min(bulk, 1.6);
  const clip = torsoPath(look, bulk, robot);
  ctx.clip(clip);
  const o = P.o;
  const inkc = P.ink;
  const lw = 1.5;
  switch (look.torso) {
    case 'hero': {
      // pecs + abs
      const d = new Path2D();
      d.moveTo(-2, -24); d.quadraticCurveTo(3, -17, 11 * bulk, -20);
      d.moveTo(-1, -14); d.lineTo(-1, -4);
      d.moveTo(-5, -10); d.lineTo(3, -10);
      P.line(d, lw);
      if (look.emblem) drawEmblem(ctx, P, look.emblem, 2, -19, look.suit2, bulk);
      if (look.belt) {
        const b = new Path2D();
        b.rect(-20, -3, 40, 6);
        P.fill(b, look.belt);
        P.line(b, lw);
        const buckle = new Path2D();
        buckle.rect(2, -3.5, 7, 7);
        P.fill(buckle, shade(look.belt, -0.2));
        P.line(buckle, 1.2);
      }
      if (look.trunks) {
        const t = new Path2D();
        t.rect(-20, 1.5, 40, 8);
        P.fill(t, look.trunks);
        P.line(t, lw);
      }
      break;
    }
    case 'trench': {
      // collar, lapels, tie, belt
      const tie = new Path2D();
      tie.moveTo(3, -30); tie.lineTo(6, -30); tie.lineTo(7, -14); tie.lineTo(4.5, -10); tie.lineTo(2, -14); tie.closePath();
      P.fill(tie, look.tie || '#b8171b');
      P.line(tie, 1.2);
      const lap = new Path2D();
      lap.moveTo(-2, -31); lap.lineTo(4, -18); lap.lineTo(0, -4);
      lap.moveTo(10, -31); lap.lineTo(7, -20);
      P.line(lap, lw);
      const belt = new Path2D();
      belt.rect(-20, -8, 40, 5);
      P.fill(belt, look.suit2 || shade(look.suit, -0.3));
      P.line(belt, 1.2);
      break;
    }
    case 'stripes': {
      for (let y = -30; y < 4; y += 6) {
        const r = new Path2D();
        r.rect(-24, y, 48, 3);
        P.fill(r, look.suit2 || '#111');
      }
      break;
    }
    case 'armor': {
      const pl = new Path2D();
      pl.moveTo(-sw + 3, -27); pl.lineTo(sw - 3, -27); pl.lineTo(ww, -8); pl.lineTo(-ww, -8); pl.closePath();
      P.fill(pl, shade(look.suit, 0.15));
      P.line(pl, lw);
      const band = new Path2D();
      band.rect(-20, -8, 40, 4);
      P.fill(band, look.suit2);
      P.line(band, 1.2);
      break;
    }
    case 'torn': {
      // exposed ribs through a torn shirt
      const hole = new Path2D();
      hole.moveTo(-3, -22); hole.lineTo(4, -25); hole.lineTo(8, -19); hole.lineTo(5, -12); hole.lineTo(9, -6); hole.lineTo(0, -8); hole.lineTo(-4, -14); hole.closePath();
      P.fill(hole, look.skin);
      P.line(hole, 1.2);
      const ribs = new Path2D();
      ribs.moveTo(0, -20); ribs.lineTo(5, -19);
      ribs.moveTo(-1, -16); ribs.lineTo(5, -15);
      ribs.moveTo(0, -12); ribs.lineTo(4, -11);
      P.line(ribs, 1);
      const hem = new Path2D();
      hem.moveTo(-14, 3); hem.lineTo(-10, -2); hem.lineTo(-6, 3); hem.lineTo(-1, -3); hem.lineTo(3, 3); hem.lineTo(8, -1); hem.lineTo(13, 3);
      P.line(hem, lw);
      break;
    }
    case 'labcoat': {
      const lap = new Path2D();
      lap.moveTo(-3, -31); lap.lineTo(5, -14); lap.lineTo(4, 4);
      lap.moveTo(11, -31); lap.lineTo(8, -20);
      P.line(lap, lw);
      const shirt = new Path2D();
      shirt.moveTo(-1, -31); shirt.lineTo(9, -31); shirt.lineTo(5, -16); shirt.closePath();
      P.fill(shirt, look.suit2);
      P.line(shirt, 1.2);
      break;
    }
    case 'robe': {
      const fur = new Path2D();
      fur.rect(-22, -34, 44, 9);
      P.fill(fur, '#f4f1e8');
      P.line(fur, lw);
      ctx.fillStyle = '#141414';
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(i * 5.5, -29.5 + (i % 2) * 2, 1.2, 1.8, 0, 0, TAU);
        ctx.fill();
      }
      const trim = new Path2D();
      trim.rect(-1, -26, 4, 30);
      P.fill(trim, look.suit2);
      break;
    }
    case 'suit': {
      const shirt = new Path2D();
      shirt.moveTo(-1, -31); shirt.lineTo(10, -31); shirt.lineTo(5, -12); shirt.closePath();
      P.fill(shirt, '#f4f1e8');
      P.line(shirt, 1.2);
      const tie = new Path2D();
      tie.moveTo(3.5, -30); tie.lineTo(6, -30); tie.lineTo(6.5, -17); tie.lineTo(4.8, -14); tie.lineTo(3, -17); tie.closePath();
      P.fill(tie, look.suit2);
      P.line(tie, 1);
      const lap = new Path2D();
      lap.moveTo(-2, -31); lap.lineTo(4, -12); lap.lineTo(2, 3);
      P.line(lap, lw);
      break;
    }
    case 'plain':
    default: {
      if (robot) {
        const plate = new Path2D();
        plate.rect(-10 * bulk, -26, 20 * bulk, 14);
        P.fill(plate, look.suit2);
        P.line(plate, lw);
        ctx.fillStyle = INK;
        for (const [x, y] of [[-12, -29], [12, -29], [-10, -2], [10, -2]]) {
          ctx.beginPath();
          ctx.arc(x * bulk, y, 1.4, 0, TAU);
          ctx.fill();
        }
        const grill = new Path2D();
        for (let i = 0; i < 3; i++) { grill.moveTo(-6 * bulk, -8 + i * 3); grill.lineTo(6 * bulk, -8 + i * 3); }
        P.line(grill, 1.2);
      } else {
        const stripe = new Path2D();
        stripe.rect(-3, -31, 6, 34);
        P.fill(stripe, look.suit2);
        P.line(stripe, 1.1);
      }
    }
  }
  if (look.extra === 'jetpack' || look.extra === 'airtank') {
    // visible straps
    const st = new Path2D();
    st.moveTo(-8, -30); st.lineTo(-2, -4);
    P.line(st, 2.2, shade(look.suit2 || '#333', -0.3));
  }
  ctx.restore();
}

function drawEmblem(ctx, P, kind, x, y, color, bulk) {
  const p = new Path2D();
  const s = 1;
  if (kind === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * TAU;
      const r = i % 2 ? 2.6 : 6.2;
      const px = x + Math.cos(a) * r * s, py = y + Math.sin(a) * r * s;
      if (i === 0) p.moveTo(px, py); else p.lineTo(px, py);
    }
    p.closePath();
    const bg = new Path2D();
    bg.arc(x, y, 7.5, 0, TAU);
    P.fill(bg, '#ffd23f');
    P.line(bg, 1.3);
    P.fill(p, color || '#e8262b');
    P.line(p, 1);
  } else if (kind === 'raven') {
    p.moveTo(x - 9, y - 3); p.lineTo(x - 2, y - 1); p.lineTo(x, y - 5); p.lineTo(x + 2, y - 1); p.lineTo(x + 9, y - 3);
    p.lineTo(x + 5, y + 3); p.lineTo(x + 1, y + 1); p.lineTo(x, y + 6); p.lineTo(x - 1, y + 1); p.lineTo(x - 5, y + 3); p.closePath();
    const bg = new Path2D();
    bg.ellipse(x, y, 10, 6.5, 0, 0, TAU);
    P.fill(bg, '#ffd23f');
    P.line(bg, 1.3);
    P.fill(p, '#141414');
  } else if (kind === 'drop') {
    const bg = new Path2D();
    bg.arc(x, y, 7.5, 0, TAU);
    P.fill(bg, color || '#23d5e8');
    P.line(bg, 1.3);
    p.moveTo(x, y - 6);
    p.quadraticCurveTo(x + 5.5, y + 1, x + 3.5, y + 3.5);
    p.quadraticCurveTo(x, y + 6.5, x - 3.5, y + 3.5);
    p.quadraticCurveTo(x - 5.5, y + 1, x, y - 6);
    p.closePath();
    P.fill(p, '#ffffff');
    P.line(p, 1);
  } else if (kind === 'bolt') {
    p.moveTo(x + 2, y - 8); p.lineTo(x - 5, y + 1); p.lineTo(x, y + 1); p.lineTo(x - 3, y + 9); p.lineTo(x + 6, y - 2); p.lineTo(x + 1, y - 2); p.closePath();
    P.fill(p, color || '#141414');
    P.line(p, 1);
  } else if (kind === 'circle') {
    const bg = new Path2D();
    bg.arc(x, y, 6.5, 0, TAU);
    P.fill(bg, '#ffe14a');
    P.line(bg, 1.3);
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i / 3) * TAU;
      const w = new Path2D();
      w.moveTo(x, y);
      w.arc(x, y, 5.5, a - 0.45, a + 0.45);
      w.closePath();
      P.fill(w, '#141414');
    }
  } else if (kind === 'planet') {
    const bg = new Path2D();
    bg.arc(x, y, 5, 0, TAU);
    P.fill(bg, color || '#ff7a1a');
    P.line(bg, 1.2);
    const ring = new Path2D();
    ring.ellipse(x, y, 9, 2.6, -0.35, 0, TAU);
    P.line(ring, 1.5);
  }
}

// ------------------------------------------------------------------ heads

function headShape(big = 1) {
  const p = new Path2D();
  const k = big;
  p.moveTo(-6 * k, 9 * k);
  p.quadraticCurveTo(-12 * k, 4 * k, -10.5 * k, -4 * k);
  p.quadraticCurveTo(-8.5 * k, -13 * k, 0, -12.8 * k);
  p.quadraticCurveTo(8.5 * k, -12.4 * k, 9.8 * k, -4 * k);
  p.lineTo(12 * k, 0.8 * k);
  p.lineTo(9.8 * k, 2.2 * k);
  p.lineTo(10.4 * k, 5.6 * k);
  p.quadraticCurveTo(10 * k, 10.8 * k, 4 * k, 11.2 * k);
  p.quadraticCurveTo(-1 * k, 11.2 * k, -6 * k, 9 * k);
  p.closePath();
  return p;
}

function drawHead(ctx, P, look, x, y, a, A, ent, opts, robot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  const hs = look.head === 'brain' ? 1.05 : look.head === 'alien' ? 1.15 : 1;
  const skin = look.skin || '#f0c29a';
  const blink = A.blink < 0 && !opts.asleep;
  const angry = ent.act === 2 || ent.act === 6 || ent.act === 4;

  const eye = (ex, ey, big = 1, color = '#fff') => {
    if (blink) {
      const b = new Path2D();
      b.moveTo(ex - 2.5, ey); b.lineTo(ex + 2.5, ey);
      P.line(b, 1.4);
      return;
    }
    const e = new Path2D();
    e.moveTo(ex - 2.6 * big, ey - 1.6 * big);
    e.lineTo(ex + 2.8 * big, ey - 2.4 * big);
    e.lineTo(ex + 2.4 * big, ey + 1.2 * big);
    e.lineTo(ex - 2.2 * big, ey + 1.2 * big);
    e.closePath();
    P.fill(e, color);
    P.line(e, 1.1);
  };
  const mouth = () => {
    const m = new Path2D();
    if (angry || ent.stun) {
      m.moveTo(6.5, 6.8); m.lineTo(10.3, 6.2);
      m.moveTo(6.5, 6.8); m.lineTo(7.2, 8.4);
    } else {
      m.moveTo(6.8, 6.4); m.quadraticCurveTo(8.6, 7.2, 10.2, 6.2);
    }
    P.line(m, 1.3);
  };
  const ear = () => {
    const e = new Path2D();
    e.ellipse(-2.5, 0.5, 2.2, 3.2, 0, 0, TAU);
    P.line(e, 1.1);
  };
  const stubble = () => {
    if (opts.asleep || opts.noFill) return;
    ctx.save();
    ctx.clip(headShape());
    ctx.fillStyle = halftone(ctx, 'rgba(20,20,20,0.55)', 2.4, 0.5);
    ctx.fillRect(-4, 4, 16, 9);
    ctx.restore();
  };

  switch (look.head) {
    case 'mask': {
      // hair tuft behind
      const hair = new Path2D();
      hair.moveTo(-11, -2); hair.lineTo(-14, -8); hair.lineTo(-9, -9); hair.lineTo(-11, -15); hair.lineTo(-4, -12);
      hair.lineTo(-3, -18); hair.lineTo(2, -13.5); hair.lineTo(6, -17); hair.lineTo(7, -12); hair.lineTo(11, -11); hair.lineTo(9, -6); hair.closePath();
      P.add(hair, look.hair || '#f5c542', false);
      P.add(headShape(), skin, true);
      P.flush();
      const m = new Path2D();
      m.moveTo(-5, -6.5); m.lineTo(11, -6); m.lineTo(11.5, -1); m.lineTo(-4, 0.5); m.lineTo(-7, -3); m.closePath();
      P.fill(m, look.mask || '#141414');
      P.line(m, 1.2);
      eye(6.5, -3.2, 1.05);
      ear();
      mouth();
      const jaw = new Path2D();
      jaw.moveTo(2, 9.5); jaw.quadraticCurveTo(0, 7, -2, 8);
      P.line(jaw, 1);
      break;
    }
    case 'cowl': {
      P.add(headShape(), look.mask || '#1b1d2a', true);
      const ears = new Path2D();
      ears.moveTo(-7, -9); ears.lineTo(-6, -22); ears.lineTo(-1, -12); ears.closePath();
      ears.moveTo(2, -12.5); ears.lineTo(5.5, -21.5); ears.lineTo(7.5, -10); ears.closePath();
      P.add(ears, look.mask || '#1b1d2a', false);
      P.flush();
      // exposed jaw
      const jaw = new Path2D();
      jaw.moveTo(1, 3); jaw.lineTo(10, 2.5); jaw.lineTo(10.4, 5.6); jaw.quadraticCurveTo(10, 10.8, 4, 11.2); jaw.quadraticCurveTo(0, 11, -2, 8); jaw.closePath();
      P.fill(jaw, skin);
      P.line(jaw, 1.2);
      eye(6.5, -2.8, 1.1);
      mouth();
      break;
    }
    case 'hood': {
      // swept-back hood with a trailing point; face in shadow, glowing eyes
      const hood = new Path2D();
      hood.moveTo(-4, 11);
      hood.quadraticCurveTo(-13, 6, -12, -5);
      hood.quadraticCurveTo(-16, -8, -24, -6);
      hood.quadraticCurveTo(-15, -14, -8, -14);
      hood.quadraticCurveTo(4, -18, 10, -9);
      hood.quadraticCurveTo(13, -4, 12, 1);
      hood.lineTo(3, 1);
      hood.lineTo(0, 11);
      hood.closePath();
      P.add(headShape(), skin, true);
      P.flush();
      const shadowFace = new Path2D();
      shadowFace.moveTo(1, -8); shadowFace.lineTo(11, -7); shadowFace.lineTo(11.5, 1.5); shadowFace.lineTo(2, 2); shadowFace.closePath();
      P.fill(shadowFace, '#101226');
      P.add(hood, look.mask || '#14163a', true);
      P.flush();
      if (!blink) {
        const e = new Path2D();
        e.moveTo(5, -3.4); e.lineTo(10.5, -4.6); e.lineTo(10, -2.2); e.lineTo(5.5, -1.8); e.closePath();
        P.fill(e, opts.asleep ? '#dddddd' : look.suit2 || '#23d5e8');
        if (!opts.asleep && !opts.noFill) {
          ctx.fillStyle = 'rgba(35,213,232,0.35)';
          ctx.beginPath(); ctx.arc(8, -3, 5, 0, TAU); ctx.fill();
        }
      }
      const jaw = new Path2D();
      jaw.moveTo(3, 3); jaw.lineTo(10.2, 3); jaw.lineTo(10.4, 5.6); jaw.quadraticCurveTo(10, 10.8, 4, 11.2); jaw.closePath();
      P.fill(jaw, skin);
      P.line(jaw, 1.1);
      mouth();
      break;
    }
    case 'goggles': {
      if (look.ponytail) { /* ponytail drawn as cloth */ }
      const hair = new Path2D();
      hair.moveTo(-11, 4); hair.quadraticCurveTo(-14, -12, 0, -14.5); hair.quadraticCurveTo(10, -14, 10.5, -5); hair.lineTo(-2, -6); hair.lineTo(-6, 6); hair.closePath();
      P.add(headShape(), skin, true);
      P.add(hair, look.hair || '#e8262b', true);
      P.flush();
      const band = new Path2D();
      band.rect(-10.5, -6.5, 22, 4.5);
      P.fill(band, '#1b1b1b');
      const lens = new Path2D();
      lens.ellipse(7, -4.2, 4.2, 3.6, 0, 0, TAU);
      P.fill(lens, '#23d5e8');
      P.line(lens, 1.4);
      const glint = new Path2D();
      glint.moveTo(5.5, -6); glint.lineTo(8, -3.4);
      P.line(glint, 1.2, '#ffffff');
      mouth();
      break;
    }
    case 'helmet': {
      const hel = new Path2D();
      hel.moveTo(-11, 5); hel.quadraticCurveTo(-13, -14, 0, -15); hel.quadraticCurveTo(12, -14, 12, -2); hel.lineTo(11, 4); hel.lineTo(3, 5); hel.lineTo(2, 10); hel.lineTo(-7, 10); hel.closePath();
      P.add(hel, look.suit || '#2fa84f', true);
      P.flush();
      const crest = new Path2D();
      crest.moveTo(-6, -13); crest.lineTo(-2, -22); crest.lineTo(2, -14.5);
      P.fill(crest, look.suit2 || '#b8171b');
      P.line(crest, 1.2);
      const vis = new Path2D();
      vis.moveTo(0, -6); vis.lineTo(12.5, -6.5); vis.lineTo(12, 0.5); vis.lineTo(1, 1); vis.closePath();
      P.fill(vis, look.visor || '#ffe14a');
      P.line(vis, 1.3);
      const glint = new Path2D();
      glint.moveTo(3, -4.5); glint.lineTo(8, -4.8);
      P.line(glint, 1.3, '#ffffff');
      const jaw = new Path2D();
      jaw.moveTo(3, 5); jaw.lineTo(10.5, 4.5); jaw.quadraticCurveTo(10, 10.5, 4, 11); jaw.closePath();
      P.fill(jaw, skin);
      P.line(jaw, 1.1);
      break;
    }
    case 'fedora': {
      P.add(headShape(), skin, true);
      P.flush();
      stubble();
      const shadowBand = new Path2D();
      shadowBand.rect(-4, -6, 16, 4.5);
      P.fill(shadowBand, 'rgba(20,20,20,0.85)');
      const e = new Path2D();
      e.moveTo(5, -3.5); e.lineTo(9, -4);
      P.line(e, 1.6, '#ffffff');
      mouth();
      ear();
      const hat = new Path2D();
      hat.moveTo(-15, -6); hat.quadraticCurveTo(0, -10, 17, -7); hat.quadraticCurveTo(15, -4, 0, -5.2); hat.quadraticCurveTo(-10, -4.5, -15, -6); hat.closePath();
      hat.moveTo(-9, -7); hat.quadraticCurveTo(-10, -17, -2, -18); hat.lineTo(1, -15); hat.lineTo(4, -18); hat.quadraticCurveTo(11, -17, 10, -7.5); hat.closePath();
      P.add(hat, look.hat || '#5a4632', true);
      P.flush();
      const band = new Path2D();
      band.moveTo(-9, -9); band.quadraticCurveTo(0, -11, 10, -9.3);
      P.line(band, 2.2, look.suit2 && look.torso === 'suit' ? look.suit2 : '#1b1b1b');
      if (look.extra === 'cigar' && !opts.asleep) {
        const cig = new Path2D();
        cig.rect(9, 6, 9, 2.6);
        P.fill(cig, '#7a4a2a');
        P.line(cig, 1);
        ctx.fillStyle = '#ff5a1a';
        ctx.fillRect(17, 6, 2, 2.6);
      }
      break;
    }
    case 'bubble': {
      const hair = new Path2D();
      hair.moveTo(-11, 2); hair.quadraticCurveTo(-13, -12, 0, -14); hair.quadraticCurveTo(9, -13, 10, -6); hair.lineTo(4, -8); hair.lineTo(1, -5); hair.lineTo(-3, -8); hair.lineTo(-6, 3); hair.closePath();
      P.add(headShape(), skin, true);
      P.add(hair, look.hair || '#6b3b1f', true);
      P.flush();
      eye(6.5, -2.5, 0.9, '#ffffff');
      mouth();
      if (!opts.noFill) {
        ctx.fillStyle = 'rgba(180,235,255,0.25)';
        ctx.beginPath();
        ctx.arc(0.5, -1.5, 16, 0, TAU);
        ctx.fill();
      }
      const glass = new Path2D();
      glass.arc(0.5, -1.5, 16, 0, TAU);
      P.line(glass, 2.2);
      const hl = new Path2D();
      hl.arc(0.5, -1.5, 12.5, -2.6, -1.7);
      P.line(hl, 2.2, '#ffffff');
      const ring = new Path2D();
      ring.rect(-12, 12, 25, 4.5);
      P.fill(ring, look.suit2 || '#ff7a1a');
      P.line(ring, 1.3);
      break;
    }
    case 'beanie': {
      P.add(headShape(), skin, true);
      P.flush();
      stubble();
      const m = new Path2D();
      m.moveTo(-3, -6); m.lineTo(11, -5.5); m.lineTo(11.4, -1); m.lineTo(-2, -0.5); m.closePath();
      P.fill(m, look.mask || '#141414');
      eye(6.5, -3, 0.95);
      mouth();
      const cap = new Path2D();
      cap.moveTo(-11, -3); cap.quadraticCurveTo(-11, -16, 0, -16); cap.quadraticCurveTo(11, -16, 10.5, -5); cap.closePath();
      P.add(cap, look.hat || '#2d2f3a', true);
      P.flush();
      const cuff = new Path2D();
      cuff.rect(-11.5, -7, 22.5, 4);
      P.fill(cuff, shade(look.hat || '#2d2f3a', -0.25));
      P.line(cuff, 1.2);
      break;
    }
    case 'visor': {
      const hel = new Path2D();
      hel.moveTo(-11, 7); hel.quadraticCurveTo(-13, -14, 0, -15); hel.quadraticCurveTo(12, -14, 12.5, 0); hel.lineTo(12, 7); hel.closePath();
      P.add(hel, look.hat || look.suit, true);
      P.flush();
      const vis = new Path2D();
      vis.moveTo(1, -6); vis.lineTo(13, -5); vis.lineTo(12.5, 2); vis.lineTo(2, 2); vis.closePath();
      P.fill(vis, '#141414');
      const glow = new Path2D();
      glow.moveTo(4, -2); glow.lineTo(12, -1.5);
      P.line(glow, 2, look.suit2 || '#ff7a1a');
      break;
    }
    case 'zombie': {
      P.add(headShape(), skin, true);
      P.flush();
      const hair = new Path2D();
      hair.moveTo(-10, -3); hair.lineTo(-13, -10); hair.lineTo(-7, -9); hair.lineTo(-7, -15); hair.lineTo(-2, -11); hair.lineTo(3, -14); hair.lineTo(4, -10);
      P.fill(hair, look.hair || '#3a2e22');
      P.line(hair, 1.1);
      // sunken eyes
      const socket = new Path2D();
      socket.ellipse(6, -3, 3.8, 3.2, 0, 0, TAU);
      P.fill(socket, shade(skin, -0.45));
      const pupil = new Path2D();
      pupil.arc(7, -3, 1.3, 0, TAU);
      P.fill(pupil, '#fff6a0');
      // jaw + teeth
      const mouthP = new Path2D();
      mouthP.moveTo(5, 5); mouthP.lineTo(10.4, 4.6); mouthP.lineTo(9.6, 9.4); mouthP.lineTo(5.5, 9); mouthP.closePath();
      P.fill(mouthP, '#3a0d0d');
      P.line(mouthP, 1.1);
      ctx.fillStyle = '#f4f1e8';
      for (let i = 0; i < 3; i++) ctx.fillRect(6 + i * 1.5, 5, 1, 1.6);
      const stitch = new Path2D();
      stitch.moveTo(-6, -8); stitch.lineTo(-1, -5);
      for (let i = 0; i < 3; i++) { stitch.moveTo(-5 + i * 1.7, -8.5 + i); stitch.lineTo(-4 + i * 1.7, -5.5 + i); }
      P.line(stitch, 1);
      break;
    }
    case 'crown': {
      P.add(headShape(1.05), skin, true);
      P.flush();
      const socket = new Path2D();
      socket.ellipse(6, -3, 3.8, 3, 0, 0, TAU);
      P.fill(socket, '#1b1b1b');
      const pupil = new Path2D();
      pupil.arc(6.5, -3, 1.4, 0, TAU);
      P.fill(pupil, '#ff3030');
      const beard = new Path2D();
      beard.moveTo(-4, 6); beard.lineTo(10, 5); beard.lineTo(8, 14); beard.lineTo(4, 11); beard.lineTo(1, 16); beard.lineTo(-2, 10); beard.closePath();
      P.fill(beard, look.hair || '#e8e2c8');
      P.line(beard, 1.1);
      const crown = new Path2D();
      crown.moveTo(-10, -9); crown.lineTo(-11, -20); crown.lineTo(-6, -14); crown.lineTo(-2, -23); crown.lineTo(2, -14); crown.lineTo(6, -21); crown.lineTo(8, -12); crown.lineTo(10, -18); crown.lineTo(10, -8); crown.closePath();
      P.add(crown, '#ffd23f', true);
      P.flush();
      ctx.fillStyle = '#e8262b';
      ctx.beginPath();
      ctx.arc(-1, -12, 1.8, 0, TAU);
      ctx.fill();
      break;
    }
    case 'alien': {
      const h = new Path2D();
      h.ellipse(1, -6, 13, 15, 0.1, 0, TAU);
      P.add(h, skin, true);
      const ant = new Path2D();
      ant.moveTo(-4, -19); ant.quadraticCurveTo(-8, -28, -3, -30);
      ant.moveTo(4, -19); ant.quadraticCurveTo(8, -27, 12, -27);
      P.flush();
      P.line(ant, 1.8);
      for (const [ex, ey, r] of [[-3, -30, 2.2], [12, -27, 2.2]]) { const b = circle(ex, ey, r); P.fill(b, look.suit2 || '#23d5e8'); P.line(b, 1); }
      for (const [ex, ey, r] of [[6, -8, 3.4], [0, -11, 2.4], [9, -2, 2.2]]) {
        const e = new Path2D(); e.ellipse(ex, ey, r * 1.2, r, 0, 0, TAU);
        P.fill(e, '#141414');
        const g = circle(ex + r * 0.3, ey - r * 0.3, r * 0.35); P.fill(g, '#ffffff');
      }
      const m = new Path2D();
      m.moveTo(4, 5); m.quadraticCurveTo(8, 7, 11, 3);
      P.line(m, 1.3);
      break;
    }
    case 'dome': {
      const h = new Path2D();
      h.ellipse(1, -3, 10, 11, 0, 0, TAU);
      P.add(h, skin, true);
      P.flush();
      for (const [ex, ey] of [[4, -5], [9, -4]]) { const e = new Path2D(); e.ellipse(ex, ey, 2.4, 3.2, 0.2, 0, TAU); P.fill(e, '#141414'); }
      if (!opts.noFill) {
        ctx.fillStyle = 'rgba(200,240,255,0.3)';
        ctx.beginPath(); ctx.arc(1, -4, 15, 0, TAU); ctx.fill();
      }
      const g = circle(1, -4, 15);
      P.line(g, 2);
      const hl = new Path2D(); hl.arc(1, -4, 11, -2.5, -1.6);
      P.line(hl, 2, '#ffffff');
      const ring = new Path2D(); ring.rect(-11, 10, 24, 4);
      P.fill(ring, look.suit2 || '#ff3fa4'); P.line(ring, 1.2);
      break;
    }
    case 'flatcap': {
      P.add(headShape(), skin, true);
      P.flush();
      stubble();
      eye(6.5, -2.6, 0.9);
      mouth();
      ear();
      const scar = new Path2D(); scar.moveTo(3, -7); scar.lineTo(7, 1);
      P.line(scar, 1.2, '#b8171b');
      const cap = new Path2D();
      cap.moveTo(-11, -4); cap.quadraticCurveTo(-10, -14, 1, -14); cap.quadraticCurveTo(10, -13, 16, -6); cap.lineTo(9, -5); cap.closePath();
      P.add(cap, look.hat || '#2a2a2a', true);
      P.flush();
      break;
    }
    case 'bald': {
      P.add(headShape(1.05), skin, true);
      P.flush();
      stubble();
      const shades = new Path2D();
      shades.moveTo(-1, -5); shades.lineTo(12, -5); shades.lineTo(11, -1); shades.lineTo(5, -1); shades.closePath();
      P.fill(shades, '#141414');
      const gl = new Path2D(); gl.moveTo(6, -4); gl.lineTo(9, -4);
      P.line(gl, 1, '#ffffff');
      mouth();
      ear();
      const shine = new Path2D(); shine.arc(-1, -9, 5, -2.6, -1.8);
      P.line(shine, 1.4, '#ffffff');
      break;
    }
    case 'brain': {
      P.add(headShape(), skin, true);
      P.flush();
      const brain = new Path2D();
      brain.ellipse(-1, -14, 14, 11, 0, 0, TAU);
      P.add(brain, '#f7a8c8', true);
      P.flush();
      const folds = new Path2D();
      folds.moveTo(-10, -14); folds.quadraticCurveTo(-5, -20, -2, -14); folds.quadraticCurveTo(2, -8, 6, -15); folds.quadraticCurveTo(9, -19, 11, -13);
      folds.moveTo(-7, -9); folds.quadraticCurveTo(-3, -11, 0, -8);
      P.line(folds, 1.2, '#9a3a5a');
      if (!opts.noFill) {
        ctx.fillStyle = 'rgba(200,240,255,0.25)';
        ctx.beginPath(); ctx.ellipse(-1, -13, 17, 14, 0, 0, TAU); ctx.fill();
      }
      const glass = new Path2D(); glass.ellipse(-1, -13, 17, 14, 0, 0, TAU);
      P.line(glass, 1.8);
      const gog = new Path2D(); gog.ellipse(6.5, -2.5, 4, 3.5, 0, 0, TAU);
      P.fill(gog, '#1fb4c8'); P.line(gog, 1.3);
      mouth();
      break;
    }
    default: {
      if (robot) {
        const h = new Path2D();
        h.moveTo(-9, 8); h.lineTo(-10, -9); h.lineTo(-6, -13); h.lineTo(9, -13); h.lineTo(12, -8); h.lineTo(11, 8); h.closePath();
        P.add(h, look.suit, true);
        P.flush();
        const vis = new Path2D(); vis.rect(0, -7, 12, 5);
        P.fill(vis, '#141414');
        const eyeG = circle(7, -4.5, 2.4);
        P.fill(eyeG, look.eye || '#ff2d2d');
        if (!opts.asleep && !opts.noFill) {
          ctx.fillStyle = 'rgba(255,60,60,0.35)';
          ctx.beginPath(); ctx.arc(7, -4.5, 6, 0, TAU); ctx.fill();
        }
        const ant = new Path2D(); ant.moveTo(-2, -13); ant.lineTo(-3, -20);
        P.line(ant, 1.6);
        const bulb = circle(-3, -21, 1.8); P.fill(bulb, look.suit2 || '#e8262b'); P.line(bulb, 1);
        const grill = new Path2D();
        for (let i = 0; i < 3; i++) { grill.moveTo(2, 1 + i * 2.2); grill.lineTo(10, 1 + i * 2.2); }
        P.line(grill, 1);
      } else {
        P.add(headShape(), skin, true);
        P.flush();
        eye(6.5, -2.6, 1);
        mouth();
        ear();
      }
    }
  }
  if (opts.asleep && !opts.noInk) {
    // closed "printed" eyes are part of the art; nothing else
  }
  ctx.restore();
}

// ------------------------------------------------------------- cloth

function chainPath(ch, w0, w1) {
  const n = ch.length;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = ch[Math.max(0, i - 1)], b = ch[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const w = lerp(w0, w1, i / (n - 1)) / 2;
    const nx = -dy / d, ny = dx / d;
    left.push([ch[i].x + nx * w, ch[i].y + ny * w]);
    right.push([ch[i].x - nx * w, ch[i].y - ny * w]);
  }
  const p = new Path2D();
  p.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < n; i++) p.lineTo(left[i][0], left[i][1]);
  // scalloped / jagged hem
  const lastL = left[n - 1], lastR = right[n - 1];
  const segs = 4;
  for (let k = 1; k <= segs; k++) {
    const t = k / segs;
    const x = lerp(lastL[0], lastR[0], t), y = lerp(lastL[1], lastR[1], t);
    const mx = lerp(lastL[0], lastR[0], t - 0.5 / segs), my = lerp(lastL[1], lastR[1], t - 0.5 / segs);
    const dx = ch[n - 1].x - ch[n - 2].x, dy = ch[n - 1].y - ch[n - 2].y;
    const d = Math.hypot(dx, dy) || 1;
    p.quadraticCurveTo(mx + (dx / d) * 5, my + (dy / d) * 5, x, y);
  }
  for (let i = n - 2; i >= 0; i--) p.lineTo(right[i][0], right[i][1]);
  p.closePath();
  return p;
}

function drawCloth(ctx, ent, A, P, s) {
  const look = ent.look;
  const col = (c) => P.color(c);
  ctx.save();
  ctx.lineJoin = 'round';
  const draw = (path, color) => {
    if (!P.o.noInk) {
      ctx.lineWidth = P.lw * 2 * s;
      ctx.strokeStyle = P.ink;
      ctx.stroke(path);
    }
    if (!P.o.noFill) {
      ctx.fillStyle = col(color);
      ctx.fill(path);
      if (!P.o.asleep) {
        ctx.save();
        ctx.clip(path);
        ctx.fillStyle = halftone(ctx, shade(col(color), -0.4), 3.4 * s, 0.75 * s);
        ctx.globalAlpha *= 0.8;
        ctx.fillRect(ent.x - 200, ent.y - 200, 400, 400);
        ctx.restore();
        // lit strip
        ctx.save();
        ctx.clip(path);
        const lit = new Path2D();
        lit.addPath(path, new DOMMatrix().translate(3 * s * (ent.facing || 1), -2 * s));
        ctx.fillStyle = col(color);
        ctx.fill(lit);
        ctx.restore();
      }
    }
  };
  if (A.coat && A.coat.length > 1) draw(chainPath(A.coat, 22 * s, 30 * s), look.suit);
  if (A.cape && A.cape.length > 1) draw(chainPath(A.cape, 18 * s, 34 * s), look.cape);
  if (A.scarf && A.scarf.length > 1) draw(chainPath(A.scarf, 7 * s, 5 * s), look.scarf);
  if (A.pony && A.pony.length > 1) draw(chainPath(A.pony, 8 * s, 3 * s), look.hair || '#e8262b');
  if (look.extra === 'jetpack' || look.extra === 'airtank') {
    const f = ent.facing || 1;
    const bx = ent.x - f * 14 * s, by = ent.y - 70 * s;
    const pack = new Path2D();
    pack.roundRect ? pack.roundRect(bx - 7 * s, by, 14 * s, 26 * s, 4 * s) : pack.rect(bx - 7 * s, by, 14 * s, 26 * s);
    draw(pack, look.extra === 'jetpack' ? '#6b7b8b' : '#dfe6ea');
    if (look.extra === 'jetpack' && !P.o.asleep && !P.o.noFill) {
      const fl = new Path2D();
      const len = (14 + Math.random() * 10) * s;
      fl.moveTo(bx - 5 * s, by + 26 * s);
      fl.quadraticCurveTo(bx, by + 26 * s + len * 1.4, bx + 5 * s, by + 26 * s);
      fl.closePath();
      ctx.fillStyle = '#ffb21f';
      ctx.fill(fl);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.stroke(fl);
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------- weapons

// Drawn with origin at the grip, pointing +x. Scale ~1 = in-hand size.
export function drawWeapon(ctx, key, o = {}) {
  const P = o.painter || new Painter(ctx, { asleep: o.asleep, flash: o.flash });
  const R = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); return p; };
  const add = (p, c, sh = true) => P.add(p, c, sh);
  switch (key) {
    case 'pistol': {
      add(R(-3, -4, 24, 8), '#c9ced6');
      add(R(20, -2.5, 10, 5), '#8d949e');
      const grip = new Path2D();
      grip.moveTo(-3, 2); grip.lineTo(5, 2); grip.lineTo(2, 14); grip.lineTo(-6, 13); grip.closePath();
      add(grip, '#b8171b');
      add(circle(8, 0, 5), '#aab2bc');
      add(R(0, -7, 4, 3), '#8d949e', false);
      P.flush();
      break;
    }
    case 'shotgun': {
      const stock = new Path2D();
      stock.moveTo(-18, -2); stock.lineTo(2, -4); stock.lineTo(4, 4); stock.lineTo(-18, 8); stock.closePath();
      add(stock, '#8a5a2b');
      add(R(0, -5, 40, 4.5), '#4a4f58');
      add(R(0, -0.5, 40, 4.5), '#4a4f58');
      add(R(14, 3.5, 12, 5), '#8a5a2b');
      P.flush();
      const hl = new Path2D(); hl.moveTo(4, -4); hl.lineTo(38, -4);
      P.line(hl, 1, '#a8b0bc');
      break;
    }
    case 'smg':
    case 'tommy': {
      const stock = new Path2D();
      stock.moveTo(-18, -3); stock.lineTo(0, -3); stock.lineTo(0, 3); stock.lineTo(-16, 7); stock.closePath();
      add(stock, '#7a4a22');
      add(R(0, -4.5, 26, 8), '#3a3d44');
      add(R(26, -2.5, 16, 4.5), '#2b2d33');
      add(circle(12, 8, 7.5), '#3a3d44');
      add(R(30, 1.5, 5, 7), '#7a4a22');
      P.flush();
      for (let i = 0; i < 4; i++) { const f = new Path2D(); f.moveTo(28 + i * 3.5, -3); f.lineTo(28 + i * 3.5, 2); P.line(f, 1); }
      const d = circle(12, 8, 3); P.fill(d, '#8d949e');
      break;
    }
    case 'launcher': {
      const tube = new Path2D();
      tube.moveTo(-10, -7); tube.lineTo(34, -8); tube.lineTo(46, -13); tube.lineTo(46, 13); tube.lineTo(34, 8); tube.lineTo(-10, 7); tube.closePath();
      add(tube, '#e8262b');
      add(R(8, 6, 6, 10), '#3a3d44');
      P.flush();
      const bands = new Path2D();
      bands.moveTo(4, -7.5); bands.lineTo(4, 7.5); bands.moveTo(26, -8); bands.lineTo(26, 8);
      P.line(bands, 2.2, '#ffd23f');
      const st = new Path2D();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * TAU;
        const a2 = a + Math.PI / 5;
        const px = 15 + Math.cos(a) * 4.5, py = Math.sin(a) * 4.5;
        const qx = 15 + Math.cos(a2) * 2, qy = Math.sin(a2) * 2;
        if (i === 0) st.moveTo(px, py); else st.lineTo(px, py);
        st.lineTo(qx, qy);
      }
      st.closePath();
      P.fill(st, '#ffd23f');
      break;
    }
    case 'rail': {
      add(R(-14, -4, 18, 8), '#2b2d33');
      add(R(2, -5, 50, 5), '#dfe6ea');
      add(R(2, 1, 50, 4), '#8d949e');
      add(R(8, -12, 16, 7), '#141414');
      P.flush();
      if (!P.o.asleep && !P.o.noFill) {
        ctx.fillStyle = '#23d5e8';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(28 + i * 6, 0, 1.6, 6.5, 0, 0, TAU);
          ctx.fill();
        }
      }
      for (let i = 0; i < 4; i++) { const c = new Path2D(); c.ellipse(28 + i * 6, 0, 1.6, 6.5, 0, 0, TAU); P.line(c, 1.1); }
      break;
    }
    case 'blade': {
      const bl = new Path2D();
      bl.moveTo(6, -2.5); bl.lineTo(60, -3.5); bl.quadraticCurveTo(66, -2, 62, 1); bl.lineTo(6, 2.5); bl.closePath();
      add(bl, '#e9eef2');
      add(R(-8, -2.5, 12, 5), '#141414', false);
      add(R(3, -6, 3.5, 12), '#ffd23f', false);
      P.flush();
      if (!P.o.asleep && !P.o.noFill) {
        const edge = new Path2D(); edge.moveTo(8, 1.8); edge.lineTo(61, 0.5);
        ctx.save();
        ctx.shadowColor = '#ff3fa4';
        ctx.shadowBlur = 8;
        P.line(edge, 2, '#ff3fa4');
        ctx.restore();
      }
      break;
    }
    case 'raygun': {
      const body = new Path2D();
      body.moveTo(-4, -5); body.lineTo(14, -6); body.quadraticCurveTo(20, -3, 20, 0); body.quadraticCurveTo(20, 3, 14, 5); body.lineTo(-4, 4); body.closePath();
      add(body, '#c9ced6');
      for (let i = 0; i < 3; i++) add(R(4 + i * 4, -7, 2, 13), '#ffd23f', false);
      add(R(20, -1.5, 8, 3), '#8d949e');
      add(circle(29, 0, 3), '#7fffd4', false);
      const grip = new Path2D(); grip.moveTo(-3, 3); grip.lineTo(4, 3); grip.lineTo(1, 13); grip.lineTo(-6, 12); grip.closePath();
      add(grip, '#7b3fb8');
      P.flush();
      break;
    }
    case 'blaster': {
      add(R(-4, -4, 22, 8), '#e8e8f0');
      add(R(18, -2, 12, 4), '#ff3fa4');
      const grip = new Path2D(); grip.moveTo(-3, 3); grip.lineTo(4, 3); grip.lineTo(1, 13); grip.lineTo(-6, 12); grip.closePath();
      add(grip, '#3a3a4a');
      P.flush();
      break;
    }
    case 'crowbar': {
      const bar = new Path2D();
      bar.moveTo(-4, -2); bar.lineTo(34, -2); bar.quadraticCurveTo(42, -2, 40, -9); bar.lineTo(37, -8); bar.quadraticCurveTo(38, 2, 32, 2); bar.lineTo(-4, 2); bar.closePath();
      add(bar, '#b8171b');
      P.flush();
      break;
    }
    case 'bat': {
      const b = new Path2D();
      b.moveTo(-8, -2); b.lineTo(10, -2.5); b.quadraticCurveTo(40, -6, 42, 0); b.quadraticCurveTo(40, 6, 10, 2.5); b.lineTo(-8, 2); b.closePath();
      add(b, '#c49a5a');
      P.flush();
      break;
    }
    default:
      break;
  }
  if (!o.painter) P.flush();
}

// ------------------------------------------------------- special bodies

function drawBat(ctx, ent, A, opts) {
  const look = ent.look;
  const s = look.scale || 1;
  const P = new Painter(ctx, opts);
  P.lw = 2.4;
  ctx.save();
  ctx.translate(ent.x, ent.y - ent.h / 2 - 2);
  ctx.scale((ent.facing || 1) * s, s);
  const flap = opts.asleep ? 0.3 : Math.sin(A.t * (ent.act === 14 ? 30 : 16));
  const wing = (dir) => {
    const p = new Path2D();
    const tipY = -18 * flap;
    p.moveTo(0, -2);
    p.quadraticCurveTo(dir * 14, -12 + tipY * 0.4, dir * 30, tipY - 4);
    if (look.crow) {
      p.lineTo(dir * 26, tipY + 4); p.lineTo(dir * 28, tipY + 8); p.lineTo(dir * 21, tipY + 8); p.lineTo(dir * 20, tipY + 12); p.lineTo(dir * 12, 6);
    } else {
      p.quadraticCurveTo(dir * 24, tipY + 6, dir * 22, tipY + 12);
      p.quadraticCurveTo(dir * 17, tipY + 6, dir * 12, tipY + 12);
      p.quadraticCurveTo(dir * 9, 4, dir * 4, 6);
    }
    p.closePath();
    return p;
  };
  P.add(wing(-1), shade(look.suit, -0.1));
  P.flush();
  const bodyP = new Path2D();
  bodyP.ellipse(0, 2, 11, 13, 0, 0, TAU);
  P.add(bodyP, look.suit);
  const head = new Path2D();
  head.ellipse(6, -8, 8, 7, 0, 0, TAU);
  if (!look.crow) {
    head.moveTo(1, -12); head.lineTo(0, -22); head.lineTo(5, -14);
    head.moveTo(7, -14); head.lineTo(11, -22); head.lineTo(12, -12);
  }
  P.add(head, look.suit);
  P.flush();
  if (look.crow) {
    const beak = new Path2D(); beak.moveTo(12, -10); beak.lineTo(22, -7); beak.lineTo(12, -5); beak.closePath();
    P.fill(beak, '#ffd23f'); P.line(beak, 1.3);
  } else {
    const fang = new Path2D(); fang.moveTo(8, -3); fang.lineTo(9, 1); fang.lineTo(10, -3); fang.moveTo(11, -3.5); fang.lineTo(12, 0.5); fang.lineTo(13, -3.5);
    P.fill(fang, '#ffffff'); P.line(fang, 0.8);
  }
  const eye = new Path2D(); eye.ellipse(9, -9, 2.2, 1.7, -0.2, 0, TAU);
  P.fill(eye, opts.asleep ? '#bbb' : look.eye || '#ffe14a');
  if (!opts.asleep && !opts.noFill) {
    ctx.fillStyle = 'rgba(255,230,80,0.4)';
    ctx.beginPath(); ctx.arc(9, -9, 5, 0, TAU); ctx.fill();
  }
  P.add(wing(1), look.suit);
  P.flush();
  ctx.restore();
}

function drawSaucer(ctx, ent, A, opts) {
  const look = ent.look;
  const s = look.scale || 1;
  const P = new Painter(ctx, opts);
  P.lw = 2.4;
  ctx.save();
  ctx.translate(ent.x, ent.y - ent.h / 2);
  ctx.rotate(clamp((ent.vx || 0) / 1400, -0.3, 0.3));
  ctx.scale(s, s);
  if (!opts.asleep && !opts.noFill) {
    // tractor glow
    const g = ctx.createLinearGradient(0, 8, 0, 60);
    g.addColorStop(0, 'rgba(35,213,232,0.35)');
    g.addColorStop(1, 'rgba(35,213,232,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-10, 8); ctx.lineTo(10, 8); ctx.lineTo(24, 60); ctx.lineTo(-24, 60); ctx.closePath(); ctx.fill();
  }
  const dome = new Path2D(); dome.ellipse(0, -6, 13, 11, 0, Math.PI, TAU); dome.closePath();
  P.add(dome, '#bfeaff');
  const disc = new Path2D(); disc.ellipse(0, 0, 32, 10, 0, 0, TAU);
  P.add(disc, look.suit);
  const bottom = new Path2D(); bottom.ellipse(0, 6, 16, 5, 0, 0, TAU);
  P.add(bottom, shade(look.suit, -0.25));
  P.flush();
  for (let i = 0; i < 5; i++) {
    const a = A.t * 4 + i * 1.3;
    const x = Math.cos(a) * 26;
    if (Math.sin(a) < 0) continue;
    const l = circle(x, 1, 2.6);
    P.fill(l, i % 2 ? look.suit2 : '#ffe14a');
    P.line(l, 1);
  }
  const eye = new Path2D(); eye.arc(0, -8, 4.5, 0, TAU);
  P.fill(eye, look.eye || '#23d5e8');
  P.line(eye, 1.2);
  const pup = circle(ent.facing > 0 ? 1.5 : -1.5, -8, 1.8);
  P.fill(pup, '#141414');
  ctx.restore();
}

function drawBrainJar(ctx, ent, A, opts) {
  const look = ent.look;
  const P = new Painter(ctx, opts);
  P.lw = 3;
  ctx.save();
  ctx.translate(ent.x, ent.y - ent.h / 2);
  const bob = Math.sin(A.t * 1.6) * 4;
  ctx.translate(0, bob);
  const js = (look.scale || 2.2) / 2.2;
  ctx.scale(js, js);
  // tentacles
  for (let i = 0; i < 5; i++) {
    const bx = -40 + i * 20;
    const p = new Path2D();
    let x = bx, y = 42;
    p.moveTo(x - 5, y);
    const pts = [];
    for (let k = 1; k <= 6; k++) {
      x = bx + Math.sin(A.t * 3 + i + k * 0.8) * (4 + k * 2.5);
      y = 42 + k * 11;
      pts.push([x, y]);
    }
    for (const [px, py] of pts) p.lineTo(px - 4 + (py - 42) * 0.05, py);
    for (let k = pts.length - 1; k >= 0; k--) p.lineTo(pts[k][0] + 4 - (pts[k][1] - 42) * 0.05, pts[k][1]);
    p.lineTo(bx + 5, 42);
    p.closePath();
    P.add(p, '#9a4ad8');
  }
  P.flush();
  const base = new Path2D();
  base.moveTo(-58, 20); base.lineTo(58, 20); base.lineTo(46, 48); base.lineTo(-46, 48); base.closePath();
  P.add(base, look.suit);
  P.flush();
  for (let i = 0; i < 4; i++) {
    const l = circle(-30 + i * 20, 34, 4);
    P.fill(l, (Math.floor(A.t * 4) + i) % 2 ? look.suit2 : '#ffe14a');
    P.line(l, 1.2);
  }
  // liquid + brain
  if (!opts.noFill) {
    ctx.fillStyle = opts.asleep ? '#ddd' : 'rgba(120,255,200,0.35)';
    ctx.beginPath(); ctx.ellipse(0, -18, 52, 46, 0, 0, TAU); ctx.fill();
  }
  const brain = new Path2D();
  brain.ellipse(0, -16, 36, 28, 0, 0, TAU);
  P.add(brain, '#f7a8c8');
  P.flush();
  const folds = new Path2D();
  folds.moveTo(-30, -16); folds.quadraticCurveTo(-20, -34, -8, -18); folds.quadraticCurveTo(2, -4, 12, -22); folds.quadraticCurveTo(20, -36, 30, -14);
  folds.moveTo(-22, -2); folds.quadraticCurveTo(-10, -8, 0, 2); folds.moveTo(8, -2); folds.quadraticCurveTo(18, -8, 26, 0);
  folds.moveTo(0, -42); folds.lineTo(0, 10);
  P.line(folds, 2, '#9a3a5a');
  // single big eye
  const eye = new Path2D(); eye.ellipse(0, -12, 13, 11, 0, 0, TAU);
  P.fill(eye, '#ffffff'); P.line(eye, 2);
  const lookX = (ent.facing || 1) * 4;
  const iris = circle(lookX, -12, 6);
  P.fill(iris, opts.asleep ? '#999' : look.eye || '#ffe14a');
  const pup = circle(lookX, -12, 2.8);
  P.fill(pup, '#141414');
  // glass
  const glass = new Path2D(); glass.ellipse(0, -18, 52, 46, 0, 0, TAU);
  P.line(glass, 3);
  const hl = new Path2D(); hl.ellipse(0, -18, 42, 36, 0, -2.7, -1.9);
  P.line(hl, 3, '#ffffff');
  ctx.restore();
}

// --------------------------------------------------------- portraits

// Draw a hero bust for HUD / menus. (x, y) = center of the frame.
export function drawPortrait(ctx, look, x, y, size, o = {}) {
  const A = o.anim || makeAnim(3);
  const ent = { x: 0, y: 0, vx: 0, vy: 0, facing: 1, aim: -0.1, h: 92, onGround: true, look };
  ctx.save();
  ctx.translate(x, y);
  const k = size / 40;
  ctx.scale(k, k);
  ctx.translate(-2, 58);
  drawCharacter(ctx, ent, A, { weapon: null, noShadow: true, flash: o.flash || 0, hurt: o.hurt || 0 });
  ctx.restore();
}
