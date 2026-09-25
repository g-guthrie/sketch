// Animation state: everything that needs memory between frames lives on the
// anim object. updateAnim() only integrates timers, springs and blend weights;
// the pose itself is rebuilt from scratch every draw (see pose.js), so a
// character can never get "stuck" in a bad pose.

import { ACT } from '../../../shared/ai.js';
import { clamp, crit, approach, wrapA, rnd, sat, lerp } from './util.js';

export function makeAnim(seed = 1) {
  seed = Math.abs(seed | 0) || 1;
  return {
    seed,
    rs: (Math.imul(seed, 2654435761) >>> 0) || 1,
    // --- fields the world writes
    t: (seed % 97) * 0.37,
    phase: 0,
    flash: 0, hurt: 0, stars: 0,
    melee: 0, meleeBig: false, combo: null,
    slash: 0, recoil: 0, flung: 0, land: 0,
    // --- internal
    speed: 0, svx: 0, svy: 0,
    runK: 0, backK: 0, crouchK: 0, airK: 0, climbK: 0, dashK: 0,
    stride: 20, stance: 0.4,
    climbPhase: 0,
    prevGround: true, prevVy: 0, vyRef: 0, groundY: null,
    jumpT: 9, flipT: 9, flipDir: 1, airT: 0,
    engage: 0, lastFire: 9,
    aim: { x: 0, v: 0 }, face: 1, turnT: 9,
    punchKind: 1, punchT: 9, prevMelee: 0,
    slashN: 0, prevSlash: 0,
    reloadT: 0,
    act: -1, actAge: 0, pact: -1, pactAge: 0, xfade: 1,
    flinch: { x: 0, v: 0 }, prevHurt: 0,
    blink: 1.5 + (seed % 7) * 0.4,
    idleOff: (seed * 1.618) % 10,
    trail: [], trailT: 0,
    cape: null, scarf: null, pony: null, coat: null, simDt: 0,
    downT: 0, reviveT: 0,
    lastT: null,
  };
}

// ent: { x, y, vx, vy, facing, aim, h, onGround, crouch, climb, dash, stun, look, k, act, ... }
export function updateAnim(A, ent, dt) {
  A._upd = true;
  if (!(dt > 0)) dt = 0;
  if (dt > 0.1) dt = 0.1;
  A.t += dt;
  const vx = +ent.vx || 0, vy = +ent.vy || 0;
  const facing = ent.facing < 0 ? -1 : 1;
  const onGround = ent.onGround !== false;
  const climb = !!ent.climb;
  const flying = isFlying(ent);

  // smoothed velocity (robust to snapshot jitter)
  A.svx = approach(A.svx, vx, dt, 16);
  A.svy = approach(A.svy, vy, dt, 14);
  const sp = Math.abs(A.svx);
  A.speed = sp;

  const grounded = onGround && !climb && !flying;
  A.runK = approach(A.runK, grounded ? clamp(sp / 390, 0, 1.25) : 0, dt, 12);
  const back = grounded && sp > 30 && Math.sign(A.svx) !== facing;
  A.backK = approach(A.backK, back ? 1 : 0, dt, 10);
  A.crouchK = approach(A.crouchK, ent.crouch ? 1 : 0, dt, 16);
  A.airK = approach(A.airK, !onGround && !climb && !flying ? 1 : 0, dt, onGround ? 22 : 14);
  A.climbK = approach(A.climbK, climb ? 1 : 0, dt, 14);
  A.dashK = approach(A.dashK, ent.dash ? 1 : 0, dt, ent.dash ? 30 : 9);

  // run cycle: cadence chosen so planted feet do not slide
  const rk = clamp(sp / 390, 0, 1);
  const crouchW = A.crouchK;
  A.stride = lerp(lerp(12, 20, rk), 10, crouchW) * (1 - A.backK * 0.35);
  A.stance = lerp(lerp(0.6, 0.38, rk), 0.55, Math.max(A.backK, crouchW * 0.6));
  if (grounded && sp > 4) {
    const cyc = (sp * A.stance) / (2 * A.stride) * lerp(0.86, 1, rk);
    A.phase += cyc * Math.PI * 2 * dt;
  }
  if (climb) A.climbPhase += (Math.abs(vy) * dt) / 15;

  // ground / air events
  if (onGround && !A.prevGround && !climb) {
    const impact = sat((A.prevVy - 200) / 1000);
    if (A.prevVy > 150) A.land = Math.max(A.land, 0.3 + impact * 0.7);
    A.flipT = 9;
  }
  if (!onGround && A.prevGround && vy < -200 && !climb) { A.jumpT = 0; A.flipT = 9; }
  if (onGround) { A.groundY = ent.y; A.airT = 0; } else A.airT += dt;
  // double jump: sudden upward impulse while airborne
  if (!onGround && !climb && !flying && A.jumpT > 0.1 && vy < A.vyRef - 380 && vy < -300 && A.hurt <= 0.02 && !ent.dash) {
    A.flipT = 0;
    A.flipDir = 1;
  }
  A.vyRef = approach(A.vyRef, vy, dt, 10);
  if (vy > A.vyRef) A.vyRef = vy;
  A.jumpT += dt;
  A.flipT += dt;
  A.prevGround = onGround;
  A.prevVy = vy;
  A.land = Math.max(0, A.land - dt * 3.6);

  // facing flips
  if (facing !== A.face) {
    A.face = facing;
    A.turnT = 0;
    A.aim.x = localAim(ent);
    A.aim.v = 0;
  }
  A.turnT += dt;
  crit(A.aim, localAim(ent), dt, 26);

  // combat timers
  if (A.recoil > 0.6 || A.slash > 0 || A.melee > 0) A.lastFire = 0;
  A.lastFire += dt;
  if (A.melee > A.prevMelee + 0.01) {
    // a new punch: combo 1 jab, 2 cross, 3 uppercut
    if (A.meleeBig) A.punchKind = 3;
    else if (A.combo === 1 || A.combo === 2 || A.combo === 3) A.punchKind = A.combo;
    else A.punchKind = A.punchT < 0.9 && A.punchKind === 1 ? 2 : 1;
    A.combo = null;
    A.punchT = 0;
  }
  A.punchT += dt;
  if (A.slash > A.prevSlash + 0.01) A.slashN++;
  A.melee = Math.max(0, A.melee - dt);
  A.slash = Math.max(0, A.slash - dt);
  A.prevMelee = A.melee;
  A.prevSlash = A.slash;
  A.recoil = Math.max(0, A.recoil - dt * 6.5);

  // engagement: gun raised after shooting, when aiming well off level, or in combat acts
  let eng = A.lastFire < 1.5 ? 1 : 0;
  const al = Math.abs(A.aim.x);
  if (al > 0.5) eng = Math.max(eng, sat((al - 0.5) / 0.25));
  const act = ent.act;
  if (ent.k) {
    eng = A.lastFire < 0.8 ? 1 : 0;
    if (act === ACT.aim || act === ACT.fire || act === ACT.spray || act === ACT.peek) eng = 1;
  } else if (grounded && sp > 60) eng = Math.max(eng, 0.55);
  if (!onGround && !climb) eng = Math.max(eng, 0.6);
  A.engage = approach(A.engage, eng, dt, eng > A.engage ? 16 : 3.2);

  // reload clock
  if (ent.reloading || act === ACT.reload) A.reloadT += dt; else A.reloadT = 0;
  // down / revive clocks
  if (ent.downed) A.downT += dt; else A.downT = 0;
  if (ent.reviving) A.reviveT += dt; else A.reviveT = 0;

  // enemy act changes (for timed poses + crossfades)
  const a = act == null ? -1 : act;
  if (a !== A.act) {
    A.pact = A.act;
    A.pactAge = A.actAge;
    A.act = a;
    A.actAge = 0;
    A.xfade = 0;
  }
  A.actAge += dt;
  A.xfade = Math.min(1, A.xfade + dt / 0.16);

  // hurt flinch spring
  if (A.hurt > A.prevHurt + 0.05) A.flinch.v += 16;
  A.prevHurt = A.hurt;
  springStep(A.flinch, dt);

  A.flash = Math.max(0, A.flash - dt);
  A.hurt = Math.max(0, A.hurt - dt);
  A.stars = Math.max(0, A.stars - dt);
  A.flung = Math.max(0, (A.flung || 0) - dt);

  // blink (deterministic)
  A.blink -= dt;
  if (A.blink < -0.13) A.blink = 1.6 + rnd(A) * 3.4;

  // dash afterimages
  if (dt > 0) {
    A.trailT -= dt;
    if (ent.dash && A.trailT <= 0) {
      A.trailT = 0.035;
      if (A.trail.length > 6) A.trail.shift();
      A.trail.push({ x: ent.x, y: ent.y, t: A.t, face: facing });
    }
    while (A.trail.length && A.t - A.trail[0].t > 0.2) A.trail.shift();
  }
  A.simDt += dt;
}

function springStep(s, dt) {
  // underdamped flinch: quick snap back with a little overshoot
  let t = dt;
  while (t > 0) {
    const h = Math.min(t, 1 / 120);
    s.v += (-s.x * 260 - s.v * 20) * h;
    s.x += s.v * h;
    t -= h;
  }
}

export function localAim(ent) {
  const facing = ent.facing < 0 ? -1 : 1;
  let a = ent.aim != null && isFinite(ent.aim) ? ent.aim : facing > 0 ? 0 : Math.PI;
  if (facing < 0) a = Math.PI - a;
  a = wrapA(a);
  return clamp(a, -1.55, 1.45);
}

export function isFlying(ent) {
  const look = ent.look || {};
  if (look.body === 'bat' || look.body === 'saucer' || look.body === 'brainjar') return true;
  return !!(look.extra === 'jetpack' && ent.k === 'flyer');
}
