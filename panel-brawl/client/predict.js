// Client-side prediction for the local player. Mirrors the order of
// operations in Game.updatePlayer so replaying unacknowledged inputs after a
// server snapshot lands in (almost exactly) the same place.

import { DT, PLAYER } from '../shared/constants.js';
import { WEAPONS, PUNCH, SUPER, weaponOf, applyRecoil } from '../shared/weapons.js';
import { initMoveState, stepMovement, MOVE_FIELDS } from '../shared/movement.js';

const WEAPON_FIELDS = ['alive', 'hp', 'mag', 'heavy', 'heavyAmmo', 'slot', 'cd', 'rl', 'bombs', 'bombT', 'super', 'meleeCd', 'invuln', 'combo'];

export class Predictor {
  constructor() {
    this.p = { kind: 'p', x: 0, y: 0, aim: 0, alive: false, hp: 150, mag: 12, heavy: null, heavyAmmo: 0, slot: 0, cd: 0, rl: 0, bombs: 2, bombT: 0, super: 0, meleeCd: 0, comboT: 0, combo: 0, invuln: 0 };
    initMoveState(this.p);
    this.pending = [];
    this.fx = {};
    this.ready = false;
  }

  setFromServer(me) {
    const p = this.p;
    for (const k of MOVE_FIELDS) if (me[k] !== undefined) p[k] = me[k];
    for (const k of WEAPON_FIELDS) if (me[k] !== undefined) p[k] = me[k];
    this.ready = true;
  }

  // Returns a description of what happened this tick (only used for FX the first time).
  step(cmd, phys, frozen) {
    const p = this.p;
    const out = { fired: null, punched: false, big: false, bombed: false, jump: false, djump: false, dash: false, land: 0, superStart: false, reload: false, swap: false };
    if (!p.alive || !this.ready) return out;
    p.aim = cmd.aim;
    if (frozen) {
      p.facing = Math.cos(p.aim) >= 0 ? 1 : -1;
      p.vx = 0;
      return out;
    }
    if (p.invuln > 0) p.invuln -= DT;
    if (p.cd > 0) p.cd -= DT;
    if (p.meleeCd > 0) p.meleeCd -= DT;
    if (p.comboT > 0) p.comboT -= DT; else p.combo = 0;
    if (p.rl > 0) {
      p.rl -= DT;
      if (p.rl <= 0) { p.rl = 0; p.mag = PLAYER.mag; }
    }
    if (p.bombs < PLAYER.bombs) {
      p.bombT -= DT;
      if (p.bombT <= 0) { p.bombs++; p.bombT = PLAYER.bombRecharge; }
    }
    if (cmd.superP && p.super >= PLAYER.superMax && p.superT <= 0) {
      p.super = 0;
      p.superT = SUPER.windup;
      p.invuln = Math.max(p.invuln, SUPER.windup + 0.4);
      p.vy = -300;
      out.superStart = true;
    }
    stepMovement(p, cmd, phys, DT, this.fx);
    out.jump = this.fx.jump;
    out.djump = this.fx.djump;
    out.dash = this.fx.dash;
    out.land = this.fx.land;
    if (p.superT > 0) return out;

    if (cmd.swapP && p.heavy) {
      p.slot = p.slot === 1 ? 0 : 1;
      p.cd = Math.max(p.cd, 0.15);
      out.swap = true;
    }
    if (cmd.reloadP && weaponOf(p) === 'pistol' && p.mag < PLAYER.mag && p.rl <= 0) {
      p.rl = WEAPONS.pistol.reload;
      out.reload = true;
    }
    if (cmd.fire) out.fired = this.tryFire(p, out);
    if (cmd.meleeP && p.meleeCd <= 0) {
      p.meleeCd = PUNCH.rate;
      p.combo = p.comboT > 0 ? p.combo + 1 : 1;
      p.comboT = PUNCH.comboWindow;
      out.big = p.combo >= 3;
      if (out.big) p.combo = 0;
      out.punched = true;
    }
    if (cmd.bombP && p.bombs > 0) {
      p.bombs--;
      if (p.bombs < PLAYER.bombs && p.bombT <= 0) p.bombT = PLAYER.bombRecharge;
      out.bombed = true;
    }
    return out;
  }

  tryFire(p, out) {
    const wk = weaponOf(p);
    const W = WEAPONS[wk];
    if (p.cd > 0) return null;
    if (wk === 'pistol') {
      if (p.rl > 0) return null;
      if (p.mag <= 0) { p.rl = W.reload; out.reload = true; return null; }
      p.mag--;
    } else if (W.ammo > 0) {
      if (p.heavyAmmo <= 0) { p.heavy = null; p.slot = 0; return null; }
      p.heavyAmmo--;
    }
    p.cd = W.rate;
    applyRecoil(p, wk);
    if (wk !== 'pistol' && W.ammo > 0 && p.heavyAmmo <= 0) { p.heavy = null; p.heavyAmmo = 0; p.slot = 0; }
    return wk;
  }

  // Server snapshot arrived: rewind to authoritative state and replay.
  reconcile(me, phys, frozen) {
    const p = this.p;
    const bx = p.x, by = p.y;
    const wasAlive = p.alive;
    this.setFromServer(me);
    while (this.pending.length && this.pending[0].seq <= me.ack) this.pending.shift();
    for (const cmd of this.pending) this.step(cmd, phys, frozen);
    if (!wasAlive || !p.alive) return { dx: 0, dy: 0 };
    return { dx: bx - p.x, dy: by - p.y };
  }
}
