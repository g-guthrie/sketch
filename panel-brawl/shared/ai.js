// Enemy behaviour. Enemies live inside their panel (they never leave it),
// which keeps navigation simple and makes every panel its own little arena.
// Every attack is telegraphed (windup/aim states) so players can read it.

import { PHYS } from './constants.js';
import { moveBody, groundProbe, raycast } from './physics.js';

export const ENEMY_STATS = {
  grunt: { hp: 50, w: 36, h: 90, speed: 215, jumpV: 820, knockMul: 1, score: 10 },
  gunner: { hp: 42, w: 36, h: 90, speed: 175, jumpV: 780, knockMul: 1, score: 15 },
  flyer: { hp: 34, w: 46, h: 42, speed: 270, jumpV: 0, knockMul: 1.2, score: 15, flying: true },
  brute: { hp: 280, w: 62, h: 132, speed: 125, jumpV: 700, knockMul: 0.3, score: 60 },
  boss: { hp: 1100, w: 92, h: 184, speed: 150, jumpV: 900, knockMul: 0.08, score: 500 },
};

export const ACT = {
  idle: 0, walk: 1, windup: 2, attack: 3, charge: 4, stunned: 5, aim: 6, fire: 7, recover: 8,
  stagger: 9, slam: 10, spray: 11, summon: 12, leap: 13, dive: 14,
};

const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : v > t ? Math.max(v - d, t) : v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function cx(e) { return e.x; }
export function cy(e) { return e.y - e.h / 2; }

function setAct(e, act, t) {
  e.act = act;
  e.actT = t;
}

function pickTarget(g, e, P) {
  let best = null, bd = Infinity;
  for (const p of g.players.values()) {
    if (!p.alive) continue;
    const inside = p.x > P.x1 - 30 && p.x < P.x2 + 30 && p.y > P.y1 - 20 && p.y < P.y2 + 30;
    if (!inside) continue;
    const d = Math.hypot(p.x - e.x, p.y - e.y) + (p.invuln > 0 ? 300 : 0);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function hasLOS(g, e, t) {
  const hit = raycast(g.phys, e.x, e.y - e.h * 0.75, t.x, t.y - t.h * 0.6);
  return !hit;
}

function moveGround(g, e, P, targetVx, dt, jump) {
  const accel = e.onGround ? 2600 : 1300;
  e.vx = approach(e.vx, targetVx, accel * dt);
  if (jump && e.onGround) {
    e.vy = -e.jumpV;
    e.onGround = false;
    e.jumpCd = 0.6;
  }
  e.vy = Math.min(e.vy + PHYS.gravity * dt, PHYS.maxFall);
  const wasGround = e.onGround;
  const res = moveBody(g.phys, e, e.vx * dt, e.vy * dt, { step: wasGround });
  e.blocked = res.hitX;
  if (res.hitX) e.vx = 0;
  if (res.ceil && e.vy < 0) e.vy = 0;
  if (res.ground) { e.onGround = true; e.vy = 0; }
  else if (wasGround && e.vy >= 0) {
    const gp = groundProbe(g.phys, e, PHYS.stepHeight + 2, false);
    if (gp) { e.y = gp.y; e.vy = 0; e.onGround = true; } else e.onGround = false;
  } else e.onGround = false;
  const hw = e.w / 2;
  if (e.x < P.x1 + hw) { e.x = P.x1 + hw; e.vx = Math.max(0, e.vx); e.blocked = targetVx < 0; }
  if (e.x > P.x2 - hw) { e.x = P.x2 - hw; e.vx = Math.min(0, e.vx); e.blocked = targetVx > 0; }
  if (e.y > P.y2) e.y = P.y2;
}

function moveFly(g, e, P, tx, ty, speed, dt) {
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const want = Math.min(speed, d * 3);
  e.vx = approach(e.vx, (dx / d) * want, 1100 * dt);
  e.vy = approach(e.vy, (dy / d) * want, 1100 * dt);
  const res = moveBody(g.phys, e, e.vx * dt, e.vy * dt, { noOneway: true });
  if (res.hitX) e.vx *= -0.4;
  if (res.ground || res.ceil) e.vy *= -0.4;
  const hw = e.w / 2;
  e.x = clamp(e.x, P.x1 + hw, P.x2 - hw);
  e.y = clamp(e.y, P.y1 + e.h + 10, P.y2 - 20);
}

function faceTo(e, t) {
  if (!t) return;
  e.facing = t.x >= e.x ? 1 : -1;
  e.aim = Math.atan2(t.y - t.h * 0.55 - (e.y - e.h * 0.72), t.x - e.x);
}

function meleeSweep(g, e, reach, height, dmg, knock, lift, stun, weapon) {
  const x1 = e.facing > 0 ? e.x : e.x - e.w / 2 - reach;
  const x2 = e.facing > 0 ? e.x + e.w / 2 + reach : e.x;
  const y1 = e.y - e.h * height, y2 = e.y;
  let hit = false;
  for (const p of g.players.values()) {
    if (!p.alive) continue;
    if (p.x + p.w / 2 < x1 || p.x - p.w / 2 > x2 || p.y < y1 || p.y - p.h > y2) continue;
    if (g.hurt(p, dmg, { by: e.id, byKind: 'e', w: weapon, x: p.x - e.facing * 8, y: p.y - p.h * 0.6, kx: e.facing * knock, ky: -lift, stun, melee: true })) hit = true;
  }
  return hit;
}

// ---------------------------------------------------------------------------

export function updateEnemy(g, e, dt) {
  const P = g.level.panels[e.panel];
  e.t += dt;
  if (e.cd > 0) e.cd -= dt;
  if (e.jumpCd > 0) e.jumpCd -= dt;
  if (e.hurtT > 0) e.hurtT -= dt;

  if (e.st === 'waking') {
    e.wakeT -= dt;
    if (e.wakeT <= 0) g.activateEnemy(e);
    return;
  }
  if (e.st === 'drawing') {
    e.drawT -= dt;
    if (e.drawT <= 0) { e.st = 'active'; e.cd = 0.4 + g.rng.f() * 0.6; }
    return;
  }
  if (e.st !== 'active') return;

  if (e.stunT > 0) {
    e.stunT -= dt;
    setAct(e, ACT.stunned, e.stunT);
    if (e.flying) moveFly(g, e, P, e.x, e.y + 30, 80, dt);
    else moveGround(g, e, P, 0, dt, false);
    if (e.stunT <= 0) setAct(e, ACT.idle, 0);
    return;
  }

  const t = pickTarget(g, e, P);
  e.target = t ? t.id : null;
  switch (e.k) {
    case 'grunt': return grunt(g, e, P, t, dt);
    case 'gunner': return gunner(g, e, P, t, dt);
    case 'flyer': return flyer(g, e, P, t, dt);
    case 'brute': return brute(g, e, P, t, dt);
    case 'boss': return e.flying ? flyingBoss(g, e, P, t, dt) : boss(g, e, P, t, dt);
  }
}

function patrol(g, e, P, dt, speedMul = 0.35) {
  if (!e.patrolDir) e.patrolDir = e.facing || 1;
  if (e.blocked || e.x <= P.x1 + e.w || e.x >= P.x2 - e.w) e.patrolDir = e.x < (P.x1 + P.x2) / 2 ? 1 : -1;
  e.facing = e.patrolDir;
  e.aim = e.facing > 0 ? 0 : Math.PI;
  moveGround(g, e, P, e.patrolDir * e.speed * speedMul, dt, false);
  setAct(e, ACT.walk, 0);
}

function grunt(g, e, P, t, dt) {
  if (e.act === ACT.windup) {
    e.actT -= dt;
    moveGround(g, e, P, 0, dt, false);
    if (e.actT <= 0) {
      setAct(e, ACT.attack, 0.18);
      const hit = meleeSweep(g, e, 44, 0.9, 13, 380, 180, 0.15, 'swipe');
      g.emit({ t: 'eatk', id: e.id, k: 'swipe', hit });
    }
    return;
  }
  if (e.act === ACT.attack || e.act === ACT.recover || e.act === ACT.stagger) {
    e.actT -= dt;
    moveGround(g, e, P, 0, dt, false);
    if (e.actT <= 0) setAct(e, e.act === ACT.attack ? ACT.recover : ACT.idle, e.act === ACT.attack ? 0.35 : 0);
    return;
  }
  if (!t) return patrol(g, e, P, dt);
  faceTo(e, t);
  const dx = t.x - e.x, dy = t.y - e.y;
  if (Math.abs(dx) < 62 + e.w / 2 && Math.abs(dy) < 80 && e.cd <= 0) {
    setAct(e, ACT.windup, 0.34);
    e.cd = 1.0 + g.rng.f() * 0.4;
    g.emit({ t: 'etel', id: e.id, k: 'swipe' });
    moveGround(g, e, P, 0, dt, false);
    return;
  }
  const wantJump = e.jumpCd <= 0 && e.onGround && (e.blocked || (dy < -110 && Math.abs(dx) < 240));
  const sp = Math.abs(dx) < 40 ? 0 : Math.sign(dx) * e.speed;
  moveGround(g, e, P, sp, dt, wantJump);
  setAct(e, ACT.walk, 0);
}

function gunner(g, e, P, t, dt) {
  if (e.act === ACT.aim) {
    e.actT -= dt;
    if (t) faceTo(e, t);
    moveGround(g, e, P, 0, dt, false);
    if (e.actT <= 0) { setAct(e, ACT.fire, 0.34); e.burst = 3; e.burstT = 0; }
    return;
  }
  if (e.act === ACT.fire) {
    e.actT -= dt;
    e.burstT -= dt;
    moveGround(g, e, P, 0, dt, false);
    if (e.burst > 0 && e.burstT <= 0) {
      e.burst--;
      e.burstT = 0.1;
      const kind = e.look && e.look.bloat ? 'acid' : 'ebullet';
      const spread = (g.rng.f() - 0.5) * 0.12;
      // acid is lobbed: tilt the shot upward on whichever side we face
      const ang = kind === 'acid' ? e.aim - 0.3 * (Math.sign(Math.cos(e.aim)) || 1) + spread : e.aim + spread;
      g.enemyShot(e, kind, ang);
    }
    if (e.actT <= 0) setAct(e, ACT.recover, 0.3);
    return;
  }
  if (e.act === ACT.recover || e.act === ACT.stagger) {
    e.actT -= dt;
    moveGround(g, e, P, 0, dt, false);
    if (e.actT <= 0) setAct(e, ACT.idle, 0);
    return;
  }
  if (!t) return patrol(g, e, P, dt, 0.3);
  faceTo(e, t);
  const dx = t.x - e.x, dist = Math.abs(dx);
  let sp = 0;
  if (dist < 260) sp = -Math.sign(dx) * e.speed;
  else if (dist > 470) sp = Math.sign(dx) * e.speed;
  else sp = Math.sin(e.t * 1.7 + e.id) * e.speed * 0.4;
  const wantJump = e.jumpCd <= 0 && e.onGround && (e.blocked || g.rng.f() < 0.004);
  moveGround(g, e, P, sp, dt, wantJump);
  setAct(e, ACT.walk, 0);
  if (e.cd <= 0 && hasLOS(g, e, t) && dist < 900) {
    setAct(e, ACT.aim, 0.55);
    e.cd = 1.9 + g.rng.f() * 0.8;
    g.emit({ t: 'etel', id: e.id, k: 'aim' });
  }
}

function flyer(g, e, P, t, dt) {
  e.hover = (e.hover || 0) + dt;
  if (e.act === ACT.dive) {
    e.actT -= dt;
    moveFly(g, e, P, e.diveX, e.diveY, 620, dt);
    if (!e.diveHit) {
      for (const p of g.players.values()) {
        if (!p.alive) continue;
        if (Math.abs(p.x - e.x) < (p.w + e.w) / 2 && p.y > e.y - e.h && p.y - p.h < e.y) {
          if (g.hurt(p, 14, { by: e.id, byKind: 'e', w: 'dive', x: p.x, y: p.y - p.h * 0.6, kx: Math.sign(e.vx || 1) * 320, ky: -200, melee: true })) e.diveHit = true;
        }
      }
    }
    if (e.actT <= 0) setAct(e, ACT.recover, 0.5);
    return;
  }
  if (e.act === ACT.windup) {
    e.actT -= dt;
    if (t) faceTo(e, t);
    moveFly(g, e, P, e.x, e.y - 20, 60, dt);
    if (e.actT <= 0) {
      if (e.nextIsDive && t) {
        setAct(e, ACT.dive, 0.7);
        e.diveX = t.x;
        e.diveY = t.y - 10;
        e.diveHit = false;
      } else {
        setAct(e, ACT.fire, 0.25);
        g.enemyShot(e, 'orb', e.aim);
      }
    }
    return;
  }
  if (e.act === ACT.fire || e.act === ACT.recover || e.act === ACT.stagger) {
    e.actT -= dt;
    moveFly(g, e, P, e.x, e.y, 80, dt);
    if (e.actT <= 0) setAct(e, ACT.idle, 0);
    return;
  }
  if (!t) {
    moveFly(g, e, P, e.x + Math.sin(e.hover * 0.9 + e.id) * 120, e.y + Math.sin(e.hover * 2.1) * 30, 120, dt);
    return;
  }
  faceTo(e, t);
  const tx = t.x + Math.sin(e.hover * 0.8 + e.id) * 190;
  const ty = t.y - 230 + Math.sin(e.hover * 2.3 + e.id) * 40;
  moveFly(g, e, P, tx, ty, e.speed, dt);
  setAct(e, ACT.walk, 0);
  if (e.cd <= 0) {
    e.nextIsDive = g.rng.f() < 0.35;
    setAct(e, ACT.windup, e.nextIsDive ? 0.5 : 0.42);
    e.cd = 2.1 + g.rng.f() * 1.0;
    g.emit({ t: 'etel', id: e.id, k: e.nextIsDive ? 'dive' : 'orb' });
  }
}

function brute(g, e, P, t, dt) {
  if (e.act === ACT.windup) {
    e.actT -= dt;
    if (t) faceTo(e, t);
    moveGround(g, e, P, 0, dt, false);
    if (e.actT <= 0) {
      if (e.nextAttack === 'slam') {
        setAct(e, ACT.slam, 0.4);
        g.shockwave(e, 170, 24, 520);
      } else {
        setAct(e, ACT.charge, 0.95);
        e.chargeDir = e.facing;
        e.hitIds = [];
      }
    }
    return;
  }
  if (e.act === ACT.charge) {
    e.actT -= dt;
    moveGround(g, e, P, e.chargeDir * 760, dt, false);
    for (const p of g.players.values()) {
      if (!p.alive || e.hitIds.includes(p.id)) continue;
      if (Math.abs(p.x - e.x) < (p.w + e.w) / 2 + 6 && p.y > e.y - e.h && p.y - p.h < e.y) {
        if (g.hurt(p, 30, { by: e.id, byKind: 'e', w: 'charge', x: p.x, y: p.y - p.h * 0.5, kx: e.chargeDir * 900, ky: -420, stun: 0.3, melee: true })) e.hitIds.push(p.id);
      }
    }
    if (e.blocked) {
      setAct(e, ACT.stunned, 1.4);
      e.stunT = 1.4;
      g.emit({ t: 'bonk', id: e.id, x: e.x + e.chargeDir * e.w / 2, y: e.y - e.h * 0.6 });
    } else if (e.actT <= 0) setAct(e, ACT.recover, 0.5);
    return;
  }
  if (e.act === ACT.slam || e.act === ACT.recover || e.act === ACT.stagger) {
    e.actT -= dt;
    moveGround(g, e, P, 0, dt, false);
    if (e.actT <= 0) setAct(e, ACT.idle, 0);
    return;
  }
  if (!t) return patrol(g, e, P, dt, 0.4);
  faceTo(e, t);
  const dx = t.x - e.x, dy = t.y - e.y;
  moveGround(g, e, P, Math.abs(dx) < 50 ? 0 : Math.sign(dx) * e.speed, dt, e.blocked && e.jumpCd <= 0);
  setAct(e, ACT.walk, 0);
  if (e.cd <= 0) {
    if (Math.abs(dx) < 120 && Math.abs(dy) < 90) {
      e.nextAttack = 'slam';
      setAct(e, ACT.windup, 0.5);
      e.cd = 1.6;
      g.emit({ t: 'etel', id: e.id, k: 'slam' });
    } else if (Math.abs(dy) < 70 && Math.abs(dx) < 620) {
      e.nextAttack = 'charge';
      setAct(e, ACT.windup, 0.7);
      e.cd = 2.6;
      g.emit({ t: 'etel', id: e.id, k: 'charge' });
    }
  }
}

function boss(g, e, P, t, dt) {
  const enraged = e.hp < e.maxHp * 0.5;
  if (enraged && !e.enraged) {
    e.enraged = true;
    g.emit({ t: 'enrage', id: e.id });
  }
  const spd = enraged ? 1.35 : 1;
  switch (e.act) {
    case ACT.windup: {
      e.actT -= dt;
      if (t) faceTo(e, t);
      moveGround(g, e, P, 0, dt, false);
      if (e.actT <= 0) {
        const a = e.nextAttack;
        if (a === 'spray') { setAct(e, ACT.spray, 1.3); e.sprayN = enraged ? 4 : 3; e.sprayT = 0; }
        else if (a === 'charge') { setAct(e, ACT.charge, 1.1); e.chargeDir = e.facing; e.hitIds = []; }
        else if (a === 'summon') { setAct(e, ACT.summon, 0.8); g.summon(e, enraged ? 3 : 2); }
        else if (a === 'leap' && t) {
          setAct(e, ACT.leap, 1.2);
          e.vy = -1150;
          e.vx = clamp((t.x - e.x) * 1.15, -700, 700);
          e.onGround = false;
          e.leapT = 0.15;
        } else setAct(e, ACT.idle, 0);
      }
      return;
    }
    case ACT.spray: {
      e.actT -= dt;
      e.sprayT -= dt;
      moveGround(g, e, P, 0, dt, false);
      if (e.sprayN > 0 && e.sprayT <= 0) {
        e.sprayN--;
        e.sprayT = 0.34;
        const n = enraged ? 14 : 11;
        const off = g.rng.f() * Math.PI;
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * Math.PI * 2;
          if (Math.sin(a) > 0.55) continue; // not straight into the floor
          g.enemyShot(e, 'bossorb', a, e.h * 0.5);
        }
      }
      if (e.actT <= 0) setAct(e, ACT.recover, 0.6);
      return;
    }
    case ACT.charge: {
      e.actT -= dt;
      moveGround(g, e, P, e.chargeDir * 820 * spd, dt, false);
      for (const p of g.players.values()) {
        if (!p.alive || e.hitIds.includes(p.id)) continue;
        if (Math.abs(p.x - e.x) < (p.w + e.w) / 2 + 6 && p.y > e.y - e.h && p.y - p.h < e.y) {
          if (g.hurt(p, 34, { by: e.id, byKind: 'e', w: 'charge', x: p.x, y: p.y - p.h * 0.5, kx: e.chargeDir * 1000, ky: -500, stun: 0.35, melee: true })) e.hitIds.push(p.id);
        }
      }
      if (e.blocked) {
        e.stunT = 1.1;
        setAct(e, ACT.stunned, 1.1);
        g.emit({ t: 'bonk', id: e.id, x: e.x + e.chargeDir * e.w / 2, y: e.y - e.h * 0.6 });
      } else if (e.actT <= 0) setAct(e, ACT.recover, 0.5);
      return;
    }
    case ACT.leap: {
      e.actT -= dt;
      e.leapT -= dt;
      const wasAir = !e.onGround;
      e.vy = Math.min(e.vy + PHYS.gravity * 0.9 * dt, PHYS.maxFall);
      const res = moveBody(g.phys, e, e.vx * dt, e.vy * dt, {});
      if (res.hitX) e.vx = 0;
      if (res.ceil && e.vy < 0) e.vy = 0;
      e.x = clamp(e.x, P.x1 + e.w / 2, P.x2 - e.w / 2);
      if (res.ground) {
        e.onGround = true;
        e.vy = 0;
        e.vx = 0;
        if (wasAir && e.leapT <= 0) {
          g.shockwave(e, 260, 28, 700);
          setAct(e, ACT.recover, 0.7);
        }
      } else e.onGround = false;
      if (e.actT <= 0 && e.onGround) setAct(e, ACT.recover, 0.4);
      return;
    }
    case ACT.summon:
    case ACT.recover:
    case ACT.slam:
    case ACT.stagger: {
      e.actT -= dt;
      moveGround(g, e, P, 0, dt, false);
      if (e.actT <= 0) setAct(e, ACT.idle, 0);
      return;
    }
  }
  if (!t) return patrol(g, e, P, dt, 0.3);
  faceTo(e, t);
  const dx = t.x - e.x;
  moveGround(g, e, P, Math.abs(dx) < 120 ? 0 : Math.sign(dx) * e.speed * spd, dt, false);
  setAct(e, ACT.walk, 0);
  if (e.cd <= 0) {
    const order = ['spray', 'charge', 'leap', 'spray', 'summon', 'charge', 'leap'];
    e.nextAttack = order[e.pattern++ % order.length];
    setAct(e, ACT.windup, enraged ? 0.5 : 0.75);
    e.cd = (enraged ? 1.6 : 2.3) + g.rng.f() * 0.6;
    g.emit({ t: 'etel', id: e.id, k: e.nextAttack });
  }
}

function flyingBoss(g, e, P, t, dt) {
  const enraged = e.hp < e.maxHp * 0.5;
  if (enraged && !e.enraged) {
    e.enraged = true;
    g.emit({ t: 'enrage', id: e.id });
  }
  e.hover = (e.hover || 0) + dt;
  const cxp = (P.x1 + P.x2) / 2;
  switch (e.act) {
    case ACT.windup:
      e.actT -= dt;
      moveFly(g, e, P, e.x, e.y, 40, dt);
      if (t) faceTo(e, t);
      if (e.actT <= 0) {
        const a = e.nextAttack;
        if (a === 'spray') { setAct(e, ACT.spray, 1.5); e.sprayN = enraged ? 5 : 4; e.sprayT = 0; }
        else if (a === 'summon') { setAct(e, ACT.summon, 0.8); g.summon(e, enraged ? 3 : 2); }
        else if (a === 'dive' && t) { setAct(e, ACT.dive, 1.0); e.diveX = t.x; e.diveY = t.y - 20; e.hitIds = []; }
        else setAct(e, ACT.idle, 0);
      }
      return;
    case ACT.spray:
      e.actT -= dt;
      e.sprayT -= dt;
      moveFly(g, e, P, e.x, e.y, 40, dt);
      if (e.sprayN > 0 && e.sprayT <= 0) {
        e.sprayN--;
        e.sprayT = 0.3;
        const n = enraged ? 16 : 12;
        const off = e.hover * 1.7;
        for (let i = 0; i < n; i++) g.enemyShot(e, 'bossorb', off + (i / n) * Math.PI * 2, e.h * 0.5);
      }
      if (e.actT <= 0) setAct(e, ACT.recover, 0.5);
      return;
    case ACT.dive:
      e.actT -= dt;
      moveFly(g, e, P, e.diveX, e.diveY, 700, dt);
      for (const p of g.players.values()) {
        if (!p.alive || e.hitIds.includes(p.id)) continue;
        if (Math.abs(p.x - e.x) < (p.w + e.w) / 2 && p.y > e.y - e.h && p.y - p.h < e.y) {
          if (g.hurt(p, 30, { by: e.id, byKind: 'e', w: 'dive', x: p.x, y: p.y - p.h * 0.5, kx: Math.sign(p.x - e.x || 1) * 800, ky: -500, stun: 0.3, melee: true })) e.hitIds.push(p.id);
        }
      }
      if (e.actT <= 0) setAct(e, ACT.recover, 0.6);
      return;
    case ACT.summon:
    case ACT.recover:
    case ACT.stagger:
      e.actT -= dt;
      moveFly(g, e, P, e.x, e.y - 30, 90, dt);
      if (e.actT <= 0) setAct(e, ACT.idle, 0);
      return;
  }
  const tx = t ? t.x + Math.sin(e.hover * 0.6) * 260 : cxp + Math.sin(e.hover * 0.5) * 300;
  const ty = P.y1 + e.h + 70 + Math.sin(e.hover * 1.3) * 40;
  moveFly(g, e, P, tx, ty, e.speed, dt);
  if (t) faceTo(e, t);
  setAct(e, ACT.walk, 0);
  if (t && e.cd <= 0) {
    const order = ['spray', 'dive', 'spray', 'summon', 'dive'];
    e.nextAttack = order[e.pattern++ % order.length];
    setAct(e, ACT.windup, enraged ? 0.5 : 0.75);
    e.cd = (enraged ? 1.5 : 2.2) + g.rng.f() * 0.6;
    g.emit({ t: 'etel', id: e.id, k: e.nextAttack });
  }
}
