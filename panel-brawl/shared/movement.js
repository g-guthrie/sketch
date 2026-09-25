// Character movement shared by server simulation and client prediction.
// Mutates the body/state `p` given one input command `cmd`.

import { PHYS, BODY } from './constants.js';
import { moveBody, groundProbe, ONEWAY } from './physics.js';

function approach(v, target, delta) {
  if (v < target) return Math.min(v + delta, target);
  if (v > target) return Math.max(v - delta, target);
  return v;
}

export function initMoveState(p) {
  p.vx = 0; p.vy = 0;
  p.w = BODY.w; p.h = BODY.h;
  p.onGround = false; p.crouch = false; p.climb = false;
  p.jumps = 1; p.coyote = 0; p.jbuf = 0; p.jumpHeld = false;
  p.dashT = 0; p.dashCd = 0; p.dashDir = 1;
  p.dropT = 0; p.stun = 0; p.facing = 1; p.iframes = 0; p.superT = 0;
  p.groundOneway = false;
}

// Fields that fully describe movement state (used for reconciliation).
export const MOVE_FIELDS = ['x', 'y', 'vx', 'vy', 'h', 'onGround', 'crouch', 'climb', 'jumps', 'coyote', 'jbuf',
  'jumpHeld', 'dashT', 'dashCd', 'dashDir', 'dropT', 'stun', 'facing', 'iframes', 'superT', 'groundOneway'];

export function copyMove(dst, src) {
  for (const k of MOVE_FIELDS) dst[k] = src[k];
  return dst;
}

// fx: optional object whose flags get set for one-shot events (jump, dash, land)
export function stepMovement(p, cmd, phys, dt, fx) {
  if (fx) { fx.jump = false; fx.djump = false; fx.dash = false; fx.land = 0; fx.superBlast = false; }
  p.facing = Math.cos(cmd.aim) >= 0 ? 1 : -1;
  if (p.dashCd > 0) p.dashCd -= dt;
  if (p.coyote > 0) p.coyote -= dt;
  if (p.jbuf > 0) p.jbuf -= dt;
  if (p.dropT > 0) p.dropT -= dt;
  if (p.iframes > 0) p.iframes -= dt;
  if (cmd.jumpP) p.jbuf = PHYS.jumpBuffer;

  const stunned = p.stun > 0;
  if (stunned) p.stun -= dt;
  const mx = stunned ? 0 : cmd.mx;

  // SPLASH PAGE wind-up: hover in place
  if (p.superT > 0) {
    p.superT -= dt;
    p.vx = approach(p.vx, 0, 4000 * dt);
    p.vy = approach(p.vy, -60, 3000 * dt);
    moveBody(phys, p, p.vx * dt, p.vy * dt, { noOneway: false });
    p.onGround = false;
    p.climb = false;
    if (p.superT <= 0) {
      p.superT = 0;
      if (fx) fx.superBlast = true;
    }
    return;
  }

  // ---- Ladders ----
  const ladder = phys.findLadder(p);
  if (!p.climb && ladder && !stunned) {
    const atTop = p.y <= ladder.y + 10;
    if ((cmd.up && !atTop) || (cmd.down && (p.onGround ? p.y < ladder.y + ladder.h - 4 : true) && p.y < ladder.y + ladder.h - 4)) {
      p.climb = true;
      p.crouch = false;
      p.h = BODY.h;
      p.vx = 0;
      p.dashT = 0;
      p.jumps = 1;
    }
  }
  if (p.climb) {
    if (!ladder || stunned) {
      p.climb = false;
    } else if (p.jbuf > 0) {
      p.climb = false;
      p.jbuf = 0;
      p.vy = -PHYS.jumpV * 0.8;
      p.vx = mx * PHYS.runSpeed;
      p.jumpHeld = true;
      if (fx) fx.jump = true;
    } else {
      const cx = ladder.x + ladder.w / 2;
      p.x += (cx - p.x) * Math.min(1, 14 * dt);
      p.vx = 0;
      const dir = cmd.up ? -1 : cmd.down ? 1 : 0;
      p.vy = dir * PHYS.climbSpeed;
      const topStand = ladder.y + 8; // the surface you step off onto at the top
      if (dir < 0 && p.y + p.vy * dt <= topStand) {
        p.y = topStand;
        p.vy = 0;
        p.climb = false;
        p.onGround = true;
        p.jumps = 1;
        return;
      }
      const res = moveBody(phys, p, 0, p.vy * dt, { noOneway: true });
      if (res.ground && dir > 0) { p.climb = false; p.onGround = true; p.vy = 0; }
      if (res.ceil) p.vy = 0;
      p.onGround = !p.climb && res.ground;
      return;
    }
  }

  // ---- Dash ----
  if (cmd.dashP && p.dashCd <= 0 && !stunned) {
    p.dashT = PHYS.dashTime;
    p.dashCd = PHYS.dashCooldown;
    p.dashDir = mx !== 0 ? Math.sign(mx) : p.facing;
    p.iframes = PHYS.dashIframes;
    if (p.crouch) { p.crouch = false; p.h = BODY.h; }
    if (fx) fx.dash = true;
  }

  let dashing = false;
  if (p.dashT > 0) {
    p.dashT -= dt;
    dashing = true;
    p.vx = p.dashDir * PHYS.dashSpeed;
    p.vy = 0;
    if (p.dashT <= 0) p.vx = p.dashDir * PHYS.runSpeed * 1.1;
  } else {
    // ---- Crouch ----
    const wantCrouch = cmd.down && p.onGround && !stunned;
    if (wantCrouch && !p.crouch) {
      p.crouch = true;
      p.h = BODY.crouchH;
    } else if (!wantCrouch && p.crouch) {
      const hw = p.w / 2;
      if (!phys.solidIn(p.x - hw, p.y - BODY.h, p.x + hw, p.y - 1)) {
        p.crouch = false;
        p.h = BODY.h;
      }
    }

    // ---- Horizontal ----
    const target = mx * (p.crouch ? PHYS.crouchSpeed : PHYS.runSpeed);
    if (mx !== 0) {
      const accel = p.onGround ? PHYS.groundAccel : PHYS.airAccel;
      // don't kill knockback / recoil speed that is going the same way
      if (Math.sign(p.vx) === Math.sign(target) && Math.abs(p.vx) > Math.abs(target)) {
        p.vx = approach(p.vx, target, (p.onGround ? PHYS.groundFriction : PHYS.airFriction) * dt);
      } else {
        p.vx = approach(p.vx, target, accel * dt);
      }
    } else {
      p.vx = approach(p.vx, 0, (p.onGround ? PHYS.groundFriction : PHYS.airFriction) * dt);
    }

    // ---- Jump / drop-through ----
    if (p.jbuf > 0 && !stunned) {
      const hw = p.w / 2;
      if (cmd.down && p.onGround && p.groundOneway && !phys.solidIn(p.x - hw, p.y - 1, p.x + hw, p.y + 3)) {
        p.dropT = 0.22;
        p.jbuf = 0;
        p.onGround = false;
        p.y += 1;
      } else if (p.onGround || p.coyote > 0) {
        p.vy = -PHYS.jumpV;
        p.jbuf = 0;
        p.coyote = 0;
        p.onGround = false;
        p.jumps = 1;
        p.jumpHeld = true;
        if (p.crouch) {
          const hw = p.w / 2;
          if (!phys.solidIn(p.x - hw, p.y - BODY.h, p.x + hw, p.y - 1)) { p.crouch = false; p.h = BODY.h; }
        }
        if (fx) fx.jump = true;
      } else if (p.jumps > 0) {
        p.vy = -PHYS.doubleJumpV;
        p.jumps--;
        p.jbuf = 0;
        p.jumpHeld = true;
        if (fx) fx.djump = true;
      }
    }
    if (p.jumpHeld && !cmd.jump && p.vy < 0) {
      p.vy *= PHYS.jumpCut;
      p.jumpHeld = false;
    }
    if (p.vy >= 0) p.jumpHeld = false;

    p.vy = Math.min(p.vy + PHYS.gravity * dt, PHYS.maxFall);
  }

  const wasGround = p.onGround;
  const fallV = p.vy;
  const res = moveBody(phys, p, p.vx * dt, p.vy * dt, { drop: p.dropT > 0, step: wasGround || dashing });
  if (res.hitX) {
    if (dashing) { p.dashT = 0; }
    p.vx = 0;
  }
  if (res.ceil && p.vy < 0) p.vy = 0;
  if (res.ground) {
    if (!wasGround && fx && fallV > 500) fx.land = fallV;
    p.onGround = true;
    p.groundOneway = res.groundRect && res.groundRect.t === ONEWAY;
    p.vy = 0;
    p.jumps = 1;
    p.coyote = PHYS.coyote;
  } else if (wasGround && p.vy >= 0 && !dashing) {
    // stick to stairs / small drops
    const g = groundProbe(phys, p, PHYS.stepHeight + 2, p.dropT > 0);
    if (g) {
      p.y = g.y;
      p.vy = 0;
      p.onGround = true;
      p.groundOneway = g.rect.t === ONEWAY;
    } else {
      p.onGround = false;
    }
  } else {
    p.onGround = false;
  }
}
