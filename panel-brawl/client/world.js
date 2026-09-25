// Client-side game state: applies server messages, predicts the local player,
// interpolates everyone else, simulates projectiles cosmetically, and turns
// the server event stream into comic FX + sound.

import { Physics, SOLID, ONEWAY, raycast } from '../shared/physics.js';
import { DT, TICK_RATE, F, PLAYER, emptyCmd } from '../shared/constants.js';
import { WEAPONS, PUNCH, BOMB, PROJ_RADIUS, shoulderOf, weaponOf } from '../shared/weapons.js';
import { THEMES, HEROES, CIVILIANS } from '../shared/themes.js';
import { PERKS } from '../shared/perks.js';
import { hash01 } from '../shared/rng.js';
import { findPanel } from '../shared/comicgen.js';
import { ACT } from '../shared/ai.js';
import { Predictor } from './predict.js';
import { makeAnim, updateAnim } from './render/characters.js';

const TICK_MS = 1000 / TICK_RATE;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const CRIT_WORDS = ['CRIT!', 'BULLSEYE!', 'HEADSHOT!', 'BOOYAH!', 'SPLAT!!'];
const MISS_WORDS = ['MISS!', 'WHIFF!', 'NOPE!'];
const WALL_WORDS = ['PTANG!', 'THOK!', 'ZING!', 'PLINK!'];

export class ClientWorld {
  constructor({ fx, audio, hud }) {
    this.fx = fx;
    this.audio = audio;
    this.hud = hud;
    this.onLevel = null;
    this.onError = null;
    this.reset();
  }

  reset() {
    this.me = null;
    this.code = null;
    this.mode = 'story';
    this.chaos = false;
    this.level = null;
    this.comic = null;
    this.theme = THEMES.hero;
    this.phys = null;
    this.roster = new Map();
    this.players = new Map();
    this.enemies = new Map();
    this.projectiles = new Map();
    this.props = new Map();
    this.pickups = new Map();
    this.gatesOpen = new Set();
    this.gateFade = new Map();
    this.gateSolids = new Map();
    this.panelState = [];
    this.snaps = [];
    this.clockOff = null;
    this.interpTicks = 4;
    this.pred = new Predictor();
    this.seq = 0;
    this.smooth = { x: 0, y: 0 };
    this.meState = null;
    this.phase = 'intro';
    this.phaseT = 0;
    this.matchT = 0;
    this.boss = null;
    this.aim = 0;
    this.predictedBeams = new Set();
    this.wakeSoundT = 0;
    this.killStreak = 0;
    this.lastKillT = -10;
    this.time = 0;
    this.levelVersion = -1;
    this.civs = new Map();
    this.switches = [];
    this.seals = new Map();
    this.stand = [];
    this.ads = null;
    this.coupons = 0;
    this.stamps = 0;
    this.alarms = new Set();
    this.solved = new Set();
    this.hints = new Map();
    this.styleT = 0;
  }

  // --------------------------------------------------------------- messages

  handle(msg) {
    switch (msg.type) {
      case 'joined':
        this.me = msg.you;
        this.code = msg.code;
        this.mode = msg.mode;
        this.chaos = msg.chaos;
        break;
      case 'level':
        this.loadLevel(msg);
        break;
      case 'roster':
        this.roster = new Map(msg.players.map((p) => [p.id, p]));
        for (const [id, rp] of this.players) {
          const r = this.roster.get(id);
          if (!r) this.players.delete(id);
          else Object.assign(rp, { name: r.name, hero: r.hero, color: r.color, bot: r.bot, look: HEROES[r.hero].look });
        }
        break;
      case 'snap':
        this.applySnap(msg);
        break;
      case 'error':
        if (this.onError) this.onError(msg.msg);
        break;
    }
  }

  loadLevel(msg) {
    const prev = this.level ? { level: this.level, comic: this.comic } : null;
    this.level = msg.level;
    this.comic = msg.comic;
    this.theme = THEMES[msg.comic.theme];
    this.fx.theme = this.theme;
    this.mode = msg.mode;
    this.chaos = msg.chaos;
    this.levelVersion = msg.version;
    const lv = msg.level;

    const phys = new Physics();
    for (const s of lv.solids) phys.add({ ...s });
    for (const o of lv.oneways) phys.add({ ...o });
    phys.ladders = lv.ladders.map((l) => ({ ...l }));
    phys.lowGrav = (lv.lowGrav || []).map((z) => ({ ...z }));
    this.gatesOpen = new Set(msg.dyn.gates);
    this.gateSolids = new Map();
    this.gateFade = new Map();
    for (const g of lv.gates) {
      if (!this.gatesOpen.has(g.id)) this.gateSolids.set(g.id, phys.add({ x: g.x, y: g.y, w: g.w, h: g.h, t: SOLID, gate: g.id }));
    }
    this.phys = phys;
    this.seals = new Map();
    for (const s of msg.dyn.seals || []) this.addSeal(s.panel, s.r, true);
    const swState = new Map((msg.dyn.switches || []).map((s) => [s.id, s]));
    this.switches = (lv.switches || []).map((s) => ({ ...s, on: swState.get(s.id)?.on ? 1 : 0, done: !!swState.get(s.id)?.done, glow: 0 }));
    this.civs = new Map();
    for (const c of msg.dyn.civs || []) this.upsertCiv(c);
    this.alarms = new Set(msg.dyn.alarms || []);
    this.solved = new Set(msg.dyn.solved || []);
    this.coupons = msg.dyn.coupons || 0;
    this.stamps = msg.dyn.stamps || 0;
    this.hints = new Map();
    this.stand = [];
    this.ads = null;

    this.props = new Map();
    for (const pr of msg.dyn.props) {
      const p = { ...pr, shake: 0 };
      this.props.set(p.id, p);
      this.propSolid(p);
    }
    this.pickups = new Map(msg.dyn.pickups.map((pk) => [pk.id, { ...pk, t: Math.random() * 6, spawnT: 0 }]));
    this.enemies = new Map();
    for (const e of msg.dyn.asleep) this.upsertEnemy(e, true);
    this.panelState = msg.dyn.panels.slice();
    this.projectiles = new Map();
    this.snaps = [];
    this.boss = null;
    this.fx.clear();
    for (const rp of this.players.values()) rp.anim = makeAnim(rp.id);
    if (this.onLevel) this.onLevel(msg, prev);
  }

  propSolid(pr) {
    if (pr.solidId) this.phys.remove(pr.solidId);
    if (pr.k === 'table') {
      if (pr.st === 'up') pr.solidId = this.phys.add({ x: pr.x, y: pr.y, w: pr.w, h: 10, t: ONEWAY, prop: pr.id });
      else pr.solidId = this.phys.add({ x: pr.x + pr.w / 2 - 9, y: pr.y + pr.h - 60, w: 18, h: 60, t: SOLID, prop: pr.id });
    } else pr.solidId = this.phys.add({ x: pr.x, y: pr.y, w: pr.w, h: pr.h, t: SOLID, prop: pr.id });
  }

  addSeal(panel, rects, instant) {
    const list = rects.map((r) => ({ ...r, sid: this.phys.add({ x: r.x, y: r.y, w: r.w, h: r.h, t: SOLID, k: 'seal' }), t: instant ? 1 : 0 }));
    this.seals.set(panel, list);
  }

  removeSeal(panel) {
    const list = this.seals.get(panel);
    if (!list) return;
    for (const r of list) this.phys.remove(r.sid);
    this.seals.delete(panel);
    for (const r of list) this.fx.shreds(r.x + r.w / 2, r.y + r.h / 2, ['#f3ead3', '#141414'], 10, 0.6);
  }

  upsertCiv(c) {
    let rc = this.civs.get(c.id);
    if (!rc) {
      const def = CIVILIANS[c.look % CIVILIANS.length];
      rc = { id: c.id, kind: 'c', name: def.name, look: def.look, anim: makeAnim(c.id), x: c.x, y: c.y, vx: 0, vy: 0, facing: c.f || 1, aim: 0, h: 84, w: 36, onGround: true, panel: c.panel };
      this.civs.set(c.id, rc);
    }
    rc.st = c.st;
    rc.hp = c.hp;
    rc.u = c.u;
    if (c.st === 'free') { rc.vx = (c.x - rc.x) * 30 || rc.facing * 300; rc.facing = c.f; }
    rc.tx = c.x;
    rc.ty = c.y;
    return rc;
  }

  upsertEnemy(e, asleep) {
    let re = this.enemies.get(e.id);
    const spec = this.theme.enemies[e.k];
    if (!re) {
      re = {
        id: e.id, k: e.k, name: spec.name, look: spec.look, anim: makeAnim(e.id),
        x: e.x, y: e.y, vx: 0, vy: 0, aim: e.a || 0, facing: e.f || 1, st: e.st, hp: e.hp, maxHp: e.mh,
        act: 0, at: 0, panel: e.p, w: e.w, h: e.h, onGround: true, asleep, wakeP: asleep ? 0 : 1, drawP: 1, seen: this.time, tel: 0,
        aware: e.aw !== 0, susp: 0, shieldUp: e.sh === undefined ? undefined : !!e.sh, eshield: e.es || 0,
      };
      this.enemies.set(e.id, re);
    }
    return re;
  }

  // ------------------------------------------------------------- snapshots

  applySnap(s) {
    const now = performance.now();
    const sample = s.t - now / TICK_MS;
    if (this.clockOff == null) this.clockOff = sample;
    else if (sample > this.clockOff) this.clockOff += (sample - this.clockOff) * 0.25;
    else this.clockOff += (sample - this.clockOff) * 0.02;

    const pmap = new Map(s.p.map((p) => [p.id, p]));
    const emap = new Map(s.e.map((e) => [e.id, e]));
    this.snaps.push({ t: s.t, pmap, emap });
    if (this.snaps.length > 40) this.snaps.shift();

    this.phase = s.ph;
    this.phaseT = s.pt;
    this.matchT = s.mt;
    this.boss = s.boss;

    for (const p of s.p) {
      if (!this.players.has(p.id)) {
        const r = this.roster.get(p.id) || { name: 'HERO', hero: 'kapow', color: '#fff', bot: false };
        this.players.set(p.id, { id: p.id, name: r.name, hero: r.hero, color: r.color, bot: r.bot, look: HEROES[r.hero].look, anim: makeAnim(p.id), x: p.x, y: p.y, vx: 0, vy: 0, aim: p.a, facing: 1, h: p.h });
      }
      const rp = this.players.get(p.id);
      rp.hp = p.hp; rp.k = p.k; rp.d = p.d; rp.s = p.s; rp.sp = p.sp; rp.w = p.w; rp.flags = p.f;
      rp.maxHp = p.mh || PLAYER.hp;
      rp.alive = !(p.f & F.DEAD);
      rp.downed = !!(p.f & F.DOWN);
      rp.reviving = !!(p.f & F.REVIVE);
      rp.hasKey = !!(p.f & F.KEY);
      rp.charging = !!(p.f & F.CHARGE);
      rp.reloading = !!(p.f & F.RELOAD);
      rp.rev = p.rv || 0;
      rp.bleed = p.bl || 0;
    }
    for (const id of [...this.players.keys()]) if (!pmap.has(id)) this.players.delete(id);

    for (const e of s.e) {
      const re = this.upsertEnemy(e, false);
      re.asleep = false;
      re.st = e.st;
      re.hp = e.hp;
      re.maxHp = e.mh;
      re.act = e.act;
      re.at = e.at;
      re.w = e.w;
      re.h = e.h;
      re.seen = this.time;
      re.shieldUp = e.sh === undefined ? undefined : !!e.sh;
      re.eshield = e.es || 0;
      re.aware = e.aw !== 0;
      re.susp = e.su || 0;
      re.elite = !!e.el;
      if (e.n) re.name = e.n;
      re.poise = e.po;
      re.hasKey = !!e.ky;
      re.stagger = !!e.sg;
      re.zdown = !!e.dz;
      re.reloading = e.act === ACT.reload;
      if (e.st === 1 && re.drawP >= 1 && !re.drawStarted) { re.drawP = 0; re.drawStarted = true; }
    }

    if (s.me) {
      this.meState = s.me;
      if (this.phys) {
        const err = this.pred.reconcile(s.me, this.phys, this.isFrozen());
        if (Math.hypot(err.dx, err.dy) < 160) {
          this.smooth.x += err.dx;
          this.smooth.y += err.dy;
        } else {
          this.smooth.x = 0;
          this.smooth.y = 0;
        }
      }
    }

    // story extras
    if (s.cv) {
      const seen = new Set();
      for (const c of s.cv) { this.upsertCiv(c); seen.add(c.id); }
      for (const id of [...this.civs.keys()]) if (!seen.has(id)) this.civs.delete(id);
    } else if (this.civs.size) this.civs.clear();
    this.stand = s.sd || [];
    this.ads = s.ads || null;
    if (s.cp != null) this.coupons = s.cp;
    if (s.stp != null) this.stamps = s.stp;

    for (const ev of s.ev) this.event(ev, s);
  }

  isFrozen() {
    return this.phase === 'intro' || this.phase === 'turning' || this.phase === 'over' || this.phase === 'victory' || this.phase === 'ads';
  }

  serverTickNow() {
    return performance.now() / TICK_MS + (this.clockOff || 0);
  }

  // ----------------------------------------------------------- local input

  localTick(raw) {
    if (this.me == null || !this.phys) return null;
    const p = this.pred.p;
    const cmd = emptyCmd(++this.seq, this.aim);
    cmd.mx = raw.mx || 0;
    cmd.up = !!raw.up;
    cmd.down = !!raw.down;
    cmd.jump = !!raw.jump;
    cmd.jumpP = !!raw.jumpP;
    cmd.fire = !!raw.fire;
    for (const k of ['meleeP', 'dashP', 'swapP', 'bombP', 'interactP', 'superP', 'reloadP', 'tauntP']) cmd[k] = !!raw[k];
    const ladder = this.phys.findLadder(p);
    if (!p.climb && !ladder) {
      if (raw.up) cmd.jump = true;
      if (raw.upP) cmd.jumpP = true;
    }
    const out = this.pred.step(cmd, this.phys, this.isFrozen());
    this.pred.pending.push(cmd);
    if (this.pred.pending.length > 180) this.pred.pending.shift();
    this.predictedFx(out, cmd);
    return cmd;
  }

  meRender() {
    return this.me != null ? this.players.get(this.me) : null;
  }

  predictedFx(out, cmd) {
    const p = this.pred.p;
    const rp = this.meRender();
    if (!rp || !p.alive) return;
    const fx = this.fx, audio = this.audio;
    if (out.jump) { fx.dust(p.x, p.y, 4); audio.play('jump', { x: p.x, y: p.y }); }
    if (out.djump) this.djumpFx(p.x, p.y);
    if (out.dash) this.dashFx(p.x, p.y, p.dashDir);
    if (out.land > 800) { fx.dust(p.x, p.y, 6); audio.play('land', { x: p.x, y: p.y, vol: Math.min(1, out.land / 1300) }); }
    if (out.reload) audio.play('reload');
    if (out.swap) audio.play('swap');
    if (out.superStart) {
      this.hud.splashPage(rp);
      audio.play('superCharge');
      fx.lines(p.x, p.y - 46, 60, 400, 0.6);
    }
    if (out.punched) {
      rp.anim.melee = 0.2;
      rp.anim.meleeBig = out.big;
      rp.anim.combo = out.combo;
      audio.play(out.big ? 'punchBig' : 'punch', { x: p.x, y: p.y, vol: 0.6 });
    }
    if (out.charging) this.chargeFx(rp);
    if (out.bombed) {
      const sh = shoulderOf(p);
      const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
      let x = sh.x + ca * 22, y = sh.y + sa * 22;
      if (raycast(this.phys, sh.x, sh.y, x, y)) { x = sh.x; y = sh.y; }
      this.spawnProjectile({
        id: this.me + '_' + cmd.seq + '_b', k: 'bomb', o: this.me, ok: 'p', x, y,
        vx: ca * BOMB.speed + p.vx * 0.4, vy: sa * BOMB.speed + p.vy * 0.3 - 140, g: BOMB.grav, l: BOMB.fuse + 0.2, r: PROJ_RADIUS.bomb, w: 'bomb', f: BOMB.fuse, b: BOMB.bounce,
      });
      audio.play('bombThrow', { x, y });
      rp.anim.throw = 0.3;
    }
    if (out.fired) this.predictShot(out.fired, out.firedSeq || cmd.seq);
  }

  chargeFx(rp) {
    rp.chargeT = WEAPONS.rail.charge;
    this.fx.ring(rp.x, rp.y - 50, 60, '#23d5e8', WEAPONS.rail.charge, 4);
    this.audio.play('superCharge', { x: rp.x, y: rp.y, vol: 0.35, pitch: 2.2 });
  }

  predictShot(wk, seq) {
    const p = this.pred.p;
    const rp = this.meRender();
    const W = WEAPONS[wk];
    const sh = shoulderOf(p);
    const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
    rp.anim.recoil = 1;
    if (W.melee) {
      rp.anim.slash = 0.22;
      this.fx.slashArc(sh.x, sh.y, p.aim, W.range, W.color);
      this.audio.play('blade', { x: p.x, y: p.y });
      if (Math.random() < 0.5) this.fx.burst(sh.x + ca * 70, sh.y + sa * 70 - 20, pick(W.words), { size: 24, dur: 0.4, shape: 'none', fill: '#ffffff', fill2: '#ff9ad0' });
      return;
    }
    if (W.hitscan) {
      const x2 = sh.x + ca * W.range, y2 = sh.y + sa * W.range;
      const wall = raycast(this.phys, sh.x, sh.y, x2, y2);
      const t = wall ? wall.t : 1;
      this.railFx(sh.x + ca * W.len, sh.y + sa * W.len, sh.x + (x2 - sh.x) * t, sh.y + (y2 - sh.y) * t, true);
      this.predictedBeams.add(seq);
      if (this.predictedBeams.size > 30) this.predictedBeams.delete(this.predictedBeams.values().next().value);
      return;
    }
    let mx = sh.x + ca * W.len, my = sh.y + sa * W.len;
    const block = raycast(this.phys, sh.x, sh.y, mx, my);
    if (block) { mx = sh.x + ca * (W.len * block.t - 3); my = sh.y + sa * (W.len * block.t - 3); }
    for (let i = 0; i < W.pellets; i++) {
      const ang = p.aim + (hash01(this.me, seq, i, 1) - 0.5) * 2 * W.spread;
      const spd = W.speed * (1 + (hash01(this.me, seq, i, 2) - 0.5) * (W.speedVar || 0));
      this.spawnProjectile({
        id: this.me + '_' + seq + '_' + i, k: W.proj, o: this.me, ok: 'p', x: mx, y: my, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        g: W.grav || 0, l: W.life, r: PROJ_RADIUS[W.proj], w: wk,
        word: W.proj === 'word' ? W.ammoWords[Math.floor(hash01(this.me, seq, 7) * W.ammoWords.length)] : undefined,
      });
    }
    this.gunFx(wk, mx, my, p.aim, p.facing, true);
  }

  gunFx(wk, x, y, a, facing, mine) {
    const W = WEAPONS[wk];
    this.fx.muzzle(x, y, a, wk, W.color);
    this.audio.play(wk, { x, y, vol: mine ? 1 : 0.8 });
    if (wk === 'pistol' || wk === 'smg') this.fx.casing(x - Math.cos(a) * 20, y, facing);
    if (wk === 'shotgun') {
      this.fx.smoke(x + Math.cos(a) * 14, y + Math.sin(a) * 14, 3, '#f4f1e8', 0.5, 20);
      this.fx.burst(x + Math.cos(a) * 48, y + Math.sin(a) * 48 - 24, pick(W.words), { size: 26, dur: 0.42, shape: 'none', fill: '#ffffff', fill2: '#ffb21f', vy: -60 });
    }
    if (wk === 'launcher') {
      this.fx.smoke(x, y, 4, '#f4f1e8', 0.6, 30);
      this.fx.burst(x - Math.cos(a) * 10, y - 30, pick(W.words), { size: 22, dur: 0.4, shape: 'none', fill: '#ffffff', fill2: '#ff9a1f' });
    }
    if (!mine && wk !== 'shotgun' && wk !== 'launcher') { if (mine) this.fx.shake(W.shake * 0.35); return; }
    if (wk === 'smg' && Math.random() < 0.06) this.fx.burst(x + Math.cos(a) * 40, y - 26, pick(W.words), { size: 20, dur: 0.35, shape: 'none' });
    if (wk === 'pistol' && Math.random() < 0.07) this.fx.burst(x + Math.cos(a) * 30, y - 22, pick(W.words), { size: 18, dur: 0.32, shape: 'none' });
    if (mine) this.fx.shake(W.shake * 0.35);
  }

  railFx(x0, y0, x1, y1, mine) {
    const W = WEAPONS.rail;
    this.fx.beam(x0, y0, x1, y1, W.color);
    this.fx.sparks(x1, y1, W.color, 10);
    this.fx.burst(x0 + (x1 - x0) * 0.15, y0 + (y1 - y0) * 0.15 - 30, pick(W.words), { size: 30, dur: 0.5, burst: '#b8fbff', edge: '#141414', fill: '#ffffff', fill2: '#23d5e8' });
    this.fx.muzzle(x0, y0, Math.atan2(y1 - y0, x1 - x0), 'rail', W.color);
    if (this.fx.onDecal) this.fx.onDecal('streak', x0, y0, { x1, y1 });
    this.audio.play('rail', { x: x0, y: y0 });
    if (mine) this.fx.shake(0.18);
  }

  djumpFx(x, y) {
    this.fx.ring(x, y + 4, 40, '#ffffff', 0.25, 6);
    this.fx.smoke(x, y, 4, '#ffffff', 0.5, -60);
    this.audio.play('djump', { x, y });
  }

  dashFx(x, y, dir) {
    this.fx.smoke(x - dir * 20, y - 30, 3, '#ffffff', 0.5, 0);
    this.fx.burst(x - dir * 40, y - 70, 'WHOOSH!', { size: 18, dur: 0.35, shape: 'none', fill: '#ffffff', fill2: '#b8fbff', vy: 0, vx: -dir * 60 });
    this.audio.play('dash', { x, y });
  }

  spawnProjectile(info) {
    if (this.projectiles.has(info.id)) return this.projectiles.get(info.id);
    const pr = {
      id: info.id, k: info.k, o: info.o, ok: info.ok, x: info.x, y: info.y, vx: info.vx, vy: info.vy,
      g: info.g || 0, life: info.l || 1, r: info.r || 5, w: info.w, word: info.word, fuse: info.f, bounce: info.b, age: 0,
      trail: [],
    };
    this.projectiles.set(pr.id, pr);
    return pr;
  }

  // ------------------------------------------------------------------ events

  entityPos(tt, id, snap) {
    // offset from the server-side position to where we are rendering it
    if (tt === 'p') {
      const rp = this.players.get(id);
      if (!rp) return null;
      if (id === this.me) return { dx: 0, dy: 0, ent: rp };
      const sp = snap && snap.p.find((p) => p.id === id);
      return { dx: sp ? rp.x - sp.x : 0, dy: sp ? rp.y - sp.y : 0, ent: rp };
    }
    const re = this.enemies.get(id);
    if (!re) return null;
    const se = snap && snap.e.find((e) => e.id === id);
    return { dx: se ? re.x - se.x : 0, dy: se ? re.y - se.y : 0, ent: re };
  }

  splatColor(ent, tt) {
    const pal = this.theme.palette;
    if (tt === 'p') return pal.splat;
    const body = ent && ent.look && ent.look.body;
    if (body === 'robot' || body === 'saucer') return '#2b2b2b';
    return pal.enemySplat;
  }

  event(ev, snap) {
    const fx = this.fx, audio = this.audio, hud = this.hud;
    const th = this.theme;
    const me = this.me;
    switch (ev.t) {
      case 'shot': {
        if (ev.o === me) {
          for (const pr of ev.pr) if (!this.projectiles.has(pr.id)) this.spawnProjectile(pr);
          return;
        }
        const pos = this.entityPos('p', ev.o, snap);
        const dx = pos ? pos.dx : 0, dy = pos ? pos.dy : 0;
        for (const pr of ev.pr) this.spawnProjectile({ ...pr, x: pr.x + dx, y: pr.y + dy });
        if (pos) pos.ent.anim.recoil = 1;
        if (ev.w === 'bomb') { audio.play('bombThrow', { x: ev.x, y: ev.y }); if (pos) pos.ent.anim.throw = 0.3; }
        else this.gunFx(ev.w, ev.x + dx, ev.y + dy, ev.a, Math.cos(ev.a) >= 0 ? 1 : -1, false);
        break;
      }
      case 'eshot': {
        const pos = this.entityPos('e', ev.o, snap);
        const dx = pos ? pos.dx : 0, dy = pos ? pos.dy : 0;
        for (const pr of ev.pr) this.spawnProjectile({ ...pr, x: pr.x + dx, y: pr.y + dy });
        fx.muzzle(ev.x + dx, ev.y + dy, Math.atan2(ev.pr[0].vy, ev.pr[0].vx), 'pistol', ev.k === 'acid' ? '#7fd13b' : '#ff3fa4');
        audio.play(ev.k === 'acid' ? 'acid' : ev.k === 'orb' || ev.k === 'bossorb' ? 'orb' : 'enemyShot', { x: ev.x, y: ev.y });
        if (pos) pos.ent.anim.recoil = 1;
        break;
      }
      case 'pdie': {
        const pr = this.projectiles.get(ev.id);
        this.projectiles.delete(ev.id);
        if (pr && pr.localDead) break;
        if (ev.why === 'wall') this.wallHitFx(ev.x, ev.y, ev.nx || 0, ev.ny || 0, pr);
        if (pr && pr.k === 'word' && ev.why !== 'expire') fx.letters(ev.x, ev.y, pr.word || 'BOOM', '#ff4d2b');
        break;
      }
      case 'beam': {
        if (ev.o === me && this.predictedBeams.has(ev.seq)) break;
        const pos = this.entityPos('p', ev.o, snap);
        const dx = pos ? pos.dx : 0, dy = pos ? pos.dy : 0;
        this.railFx(ev.x0 + dx, ev.y0 + dy, ev.x1, ev.y1, false);
        if (pos) pos.ent.anim.recoil = 1;
        break;
      }
      case 'slash': {
        if (ev.o === me) break;
        const pos = this.entityPos('p', ev.o, snap);
        if (pos) pos.ent.anim.slash = 0.22;
        fx.slashArc(ev.x + (pos ? pos.dx : 0), ev.y + (pos ? pos.dy : 0), ev.a, WEAPONS.blade.range, WEAPONS.blade.color);
        audio.play('blade', { x: ev.x, y: ev.y });
        break;
      }
      case 'punch': {
        if (ev.o === me) break;
        const pos = this.entityPos('p', ev.o, snap);
        if (pos) { pos.ent.anim.melee = 0.2; pos.ent.anim.meleeBig = ev.big; pos.ent.anim.combo = ev.n; }
        audio.play(ev.big ? 'punchBig' : 'punch', { x: ev.x, y: ev.y, vol: 0.5 });
        break;
      }
      case 'deflect': {
        const pr = this.projectiles.get(ev.id);
        if (pr) { pr.vx = ev.vx; pr.vy = ev.vy; pr.g = 0; pr.o = ev.o; pr.ok = 'p'; pr.x = ev.x; pr.y = ev.y; pr.life = Math.max(pr.life, 1.4); pr.deflected = true; }
        fx.burst(ev.x, ev.y - 20, pick(['DEFLECT!', 'TING!', 'PARRY!', 'NOPE!']), { size: 26, dur: 0.55, burst: '#ffffff', edge: '#ff3fa4', fill: '#fff36b', fill2: '#ff3fa4' });
        fx.sparks(ev.x, ev.y, '#ffffff', 8);
        audio.play('deflect', { x: ev.x, y: ev.y });
        if (ev.o === me) fx.hitstop = 0.04;
        break;
      }
      case 'hit': return this.hitFx(ev, snap);
      case 'kill': return this.killFx(ev, snap);
      case 'boom': return this.boomFx(ev);
      case 'dodge': {
        fx.burst(ev.x, ev.y - 30, pick(MISS_WORDS), { size: 24, dur: 0.5, shape: 'none', fill: '#ffffff', fill2: '#b8fbff' });
        audio.play('dodge', { x: ev.x, y: ev.y });
        break;
      }
      case 'jump': {
        if (ev.id === me) break;
        const rp = this.players.get(ev.id);
        if (!rp) break;
        if (ev.d) this.djumpFx(rp.x, rp.y);
        else { fx.dust(rp.x, rp.y, 3); audio.play('jump', { x: rp.x, y: rp.y, vol: 0.6 }); }
        break;
      }
      case 'dash': {
        if (ev.id === me) break;
        const rp = this.players.get(ev.id);
        if (rp) this.dashFx(rp.x, rp.y, ev.dir);
        break;
      }
      case 'land': {
        if (ev.id === me) break;
        const rp = this.players.get(ev.id);
        if (rp && ev.v > 900) { fx.dust(rp.x, rp.y, 5); audio.play('land', { x: rp.x, y: rp.y, vol: 0.6 }); }
        break;
      }
      case 'spawn': {
        const rp = this.players.get(ev.id);
        if (rp) {
          rp.anim = makeAnim(rp.id);
          rp.drawP = 0;
          rp.x = ev.x;
          rp.y = ev.y;
        }
        if (ev.id === me) { this.smooth.x = 0; this.smooth.y = 0; }
        audio.play('respawn', { x: ev.x, y: ev.y });
        break;
      }
      case 'wake': {
        const re = this.enemies.get(ev.id);
        if (re) {
          re.wakeP = 0;
          re.asleep = false;
          if (re.aware !== false && !ev.quiet) fx.burst(re.x, re.y - re.h - 26, '!', { size: 30, dur: 0.55, shape: 'none', fill: '#ffffff', fill2: '#ffe14a' });
          if (ev.line) fx.bubble(() => (this.enemies.has(re.id) ? { x: re.x, y: re.y - re.h - 10 } : null), ev.line, re.k === 'boss' ? 'shout' : 'speech', re.k === 'boss' ? 3.2 : 2.2, re.k === 'boss' ? 22 : 16);
        }
        if (this.time - this.wakeSoundT > 0.6) { this.wakeSoundT = this.time; audio.play('wake', { x: re ? re.x : undefined, y: re ? re.y : undefined }); }
        break;
      }
      case 'draw': {
        const re = this.enemies.get(ev.id);
        if (re) { re.drawP = 0; re.drawStarted = true; }
        audio.play('draw', { x: ev.x, y: ev.y, vol: 0.6 });
        break;
      }
      case 'etel': {
        const re = this.enemies.get(ev.id);
        if (!re) break;
        re.tel = ev.k === 'draw' ? 2.1 : 0.6;
        re.telKind = ev.k;
        if (ev.tx != null) { re.telX = ev.tx; re.telY = ev.ty; }
        if (ev.k === 'charge' || ev.k === 'slam' || ev.k === 'leap' || ev.k === 'spray' || ev.k === 'summon' || ev.k === 'dive' || ev.k === 'bash' || ev.k === 'grenade') {
          fx.burst(re.x, re.y - re.h - 30, '!!', { size: re.k === 'boss' ? 46 : 28, dur: 0.6, shape: 'none', fill: '#ffffff', fill2: '#ff3a1a' });
        }
        if (re.k === 'boss' && th.bossMoves && th.bossMoves[ev.k]) hud.announce(th.bossMoves[ev.k], null, 1.1);
        break;
      }
      case 'eatk': {
        const re = this.enemies.get(ev.id);
        if (re) { re.anim.melee = 0.2; fx.slashArc(re.x + re.facing * 20, re.y - re.h * 0.6, re.facing > 0 ? 0 : Math.PI, 60, '#ffffff'); }
        audio.play('swipe', { x: re ? re.x : 0, y: re ? re.y : 0, vol: 0.7 });
        break;
      }
      case 'bonk': {
        fx.burst(ev.x, ev.y, pick(['BONK!', 'KLONK!', 'DOINK!']), { size: 40, dur: 0.8, burst: '#ffffff', edge: '#141414' });
        const re = this.enemies.get(ev.id);
        if (re) re.anim.stars = 1.4;
        fx.shake(this.nearMe(ev.x, ev.y, 700) * 0.3);
        audio.play('bonk', { x: ev.x, y: ev.y });
        break;
      }
      case 'quake': {
        fx.ring(ev.x, ev.y - 10, ev.r, '#ffe14a', 0.45, 16);
        for (let i = -3; i <= 3; i++) fx.dust(ev.x + i * ev.r / 4, ev.y, 2, Math.sign(i));
        fx.debris(ev.x, ev.y, '#8a7a5a', 10, 0.8);
        fx.burst(ev.x, ev.y - 60, pick(['KRA-THOOM!', 'WHUMP!', 'KA-THUD!']), { size: 44, dur: 0.8 });
        fx.shake(this.nearMe(ev.x, ev.y, 900) * 0.5);
        audio.play('quake', { x: ev.x, y: ev.y });
        break;
      }
      case 'boss':
        hud.bossIntro(ev.name, th);
        audio.play('boss');
        break;
      case 'enrage': {
        const re = this.enemies.get(ev.id);
        if (re) {
          fx.burst(re.x, re.y - re.h - 20, pick(['RAAAGH!!', 'ENOUGH!!', 'GRRRAAH!!']), { size: 60, dur: 1.2, burst: '#e8262b', edge: '#141414', fill: '#fff36b', fill2: '#ff7a1a' });
          fx.lines(re.x, re.y - re.h / 2, 80, 360, 0.5);
        }
        fx.shake(0.4);
        audio.play('enrage');
        break;
      }
      case 'break': {
        const pr = this.props.get(ev.id);
        if (pr) { this.phys.remove(pr.solidId); this.props.delete(ev.id); }
        if (ev.k === 'barrel') { fx.debris(ev.x, ev.y, '#c8102e', 8); audio.play('breakMetal', { x: ev.x, y: ev.y }); }
        else {
          fx.debris(ev.x, ev.y, ev.k === 'table' ? '#8a5a2b' : '#c48a4a', 14);
          fx.smoke(ev.x, ev.y, 4, '#e8dcc0', 0.6, 30);
          fx.burst(ev.x, ev.y - 20, pick(['KRASH!', 'KRAK!', 'SMASH!', 'KER-RUNCH!']), { size: 30, dur: 0.6, burst: '#ffffff', edge: '#8a5a2b' });
          audio.play('break', { x: ev.x, y: ev.y });
        }
        break;
      }
      case 'prophit': {
        const pr = this.props.get(ev.id);
        if (pr) pr.shake = 0.15;
        break;
      }
      case 'flip': {
        const pr = this.props.get(ev.id);
        if (pr) {
          pr.st = 'flipped';
          pr.dir = ev.dir;
          pr.flipT = 0;
          this.propSolid(pr);
          fx.dust(pr.x + pr.w / 2, pr.y + pr.h, 6);
          fx.burst(pr.x + pr.w / 2, pr.y - 20, pick(['FLIP!', 'KA-CHUNK!', 'THUNK!']), { size: 26, dur: 0.5, shape: 'none', fill: '#ffffff', fill2: '#ffd23f' });
          audio.play('flip', { x: pr.x, y: pr.y });
        }
        break;
      }
      case 'gate': {
        this.gatesOpen.add(ev.id);
        const sid = this.gateSolids.get(ev.id);
        if (sid) this.phys.remove(sid);
        this.gateFade.set(ev.id, 0);
        const g = this.level.gates[ev.id];
        if (g) {
          if (ev.how === 'crack') {
            fx.debris(g.x + g.w / 2, g.y + g.h / 2, '#8a5a3a', 22, 1.3);
            fx.smoke(g.x + g.w / 2, g.y + g.h / 2, 6, '#e8dcc0', 1, 40);
            fx.burst(g.x + g.w / 2, g.y - 10, pick(['KA-RUMBLE!', 'KRUNCH!', 'BRICK-KRAK!']), { size: 44, dur: 1, big: true });
            audio.play('break', { x: g.x, y: g.y });
          } else {
            fx.shreds(g.x + g.w / 2, g.y + g.h / 2, ['#f3ead3', '#141414', '#f3ead3'], 16, 0.8);
            if (ev.how === 'key') fx.burst(g.x + g.w / 2, g.y - 10, pick(['KA-CHUNK!', 'CLICK!']), { size: 34, dur: 0.8, shape: 'none', fill: '#ffffff', fill2: '#ffd23f' });
          }
          audio.play('gateOpen', { x: g.x, y: g.y });
          this.hints.delete(g.panel);
        }
        break;
      }
      case 'panel': {
        this.panelState[ev.id] = ev.s;
        if (ev.s === 'active' && this.mode === 'story') {
          const P = this.level.panels[ev.id];
          if (ev.beat === 'silent') hud.announce('SHHH...', 'SNEAK UP BEHIND THEM · GUNFIRE RAISES THE ALARM', 2.4);
          else if (ev.beat === 'rescue') hud.announce('HOSTAGE!', 'STAND BY THEM AND PRESS [E] TO UNTIE', 2.2);
          else if (ev.beat === 'establish' && P && P.caption) hud.announce('MEANWHILE...', null, 1.4);
        }
        if (ev.s === 'cleared' && this.mode === 'story') {
          const last = this.level.path[this.level.path.length - 1] === ev.id;
          if (!last) {
            hud.announce(pick(['PANEL CLEAR!', 'NEXT PANEL!', 'ONWARD!', 'KEEP READING!']), 'CONTINUED IN THE NEXT PANEL →');
            audio.play('panelClear');
          }
        }
        break;
      }
      case 'wave':
        if (!this.stand.some((s) => s.p === ev.panel)) hud.announce(pick(['MORE OF THEM!', 'REINFORCEMENTS!', 'HERE THEY COME!']), 'THE ARTIST IS DRAWING MORE...');
        break;
      case 'say': {
        const re = this.enemies.get(ev.id);
        if (!re || this.nearMe(re.x, re.y, 1500) <= 0) break;
        const shout = ev.k === 'grenade' || ev.k === 'spotted' || ev.k === 'reload';
        fx.bubble(() => (this.enemies.has(re.id) ? { x: re.x, y: re.y - re.h - 10 } : null), ev.text, shout ? 'shout' : 'speech', shout ? 1.5 : 1.8, 15);
        break;
      }
      case 'csay': {
        const rc = this.civs.get(ev.id);
        if (rc) fx.bubble(() => (this.civs.has(rc.id) ? { x: rc.x, y: rc.y - 70 } : null), ev.text, 'shout', 2, 15);
        break;
      }
      case 'stagger': {
        const re = this.enemies.get(ev.id);
        const mine = ev.by === me;
        if (re) { re.anim.stars = Math.max(re.anim.stars, ev.d || 1.2); re.anim.flash = 0.1; }
        if (mine || ev.boss) {
          fx.burst(ev.x, ev.y - 30, ev.boss ? 'STAGGERED!!' : pick(['STAGGERED!', 'DAZED!', 'WOBBLE!']), { size: ev.boss ? 56 : 34, dur: ev.boss ? 1.3 : 0.8, burst: '#ffffff', edge: '#23a0e8', fill: '#fff36b', fill2: '#23d5e8', big: true });
          fx.ring(ev.x, ev.y, 70, '#23d5e8', 0.35, 6);
          if (mine) fx.hitstop = Math.max(fx.hitstop, 0.05);
          if (ev.boss) { hud.announce('HE\'S OPEN!', 'POUR IT ON!', 1.4); fx.shake(0.35); }
        } else fx.ring(ev.x, ev.y, 50, '#23d5e8', 0.3, 4);
        audio.play('stagger', { x: ev.x, y: ev.y });
        break;
      }
      case 'splat': {
        fx.burst(ev.x, ev.y - 10, pick(['WALL SPLAT!', 'SPLAT!!', 'KER-SPLAT!']), { size: 42, dur: 1, burst: '#ffffff', edge: th.palette.accent, fill: '#ffffff', fill2: '#ffe14a', big: true, spikes: 16 });
        fx.lines(ev.x, ev.y, 20, 180, 0.25);
        fx.inkSplat(ev.x, ev.y, this.splatColor(this.enemies.get(ev.id), 'e'), 12, ev.dir * 120, 0, 1.6);
        if (fx.onDecal) fx.onDecal('splat', ev.x + ev.dir * 6, ev.y, { r: 18, color: this.splatColor(this.enemies.get(ev.id), 'e') });
        fx.shake(this.nearMe(ev.x, ev.y, 900) * 0.35);
        audio.play('splat', { x: ev.x, y: ev.y });
        break;
      }
      case 'block': {
        fx.sparks(ev.x, ev.y, '#ffffff', ev.m ? 8 : 4, 0, -0.3, 1.2);
        fx.gatedBurst('blk' + ev.id, 0.5, ev.x, ev.y - 18, ev.m ? pick(['THUD!', 'WHUMP!']) : pick(['TINK!', 'KLANG!', 'PING!']), { size: 18, dur: 0.4, shape: 'none', fill: '#ffffff', fill2: '#c8d8e8' });
        audio.play('block', { x: ev.x, y: ev.y });
        break;
      }
      case 'shieldbreak': {
        const col = ev.k === 'energy' ? '#23d5e8' : ev.k === 'door' ? '#3a3a3a' : '#9fc4dc';
        fx.debris(ev.x, ev.y, col, 16, 1.2);
        fx.burst(ev.x, ev.y - 20, ev.k === 'energy' ? 'FZZZT!' : pick(['KRASH!', 'SHATTER!', 'KER-RUNCH!']), { size: 40, dur: 0.9, burst: '#ffffff', edge: '#141414', fill: '#ffffff', fill2: col, big: true });
        audio.play('shieldBreak', { x: ev.x, y: ev.y });
        break;
      }
      case 'shieldup': {
        const re = this.enemies.get(ev.id);
        if (re) fx.ring(re.x, re.y - re.h / 2, 60, '#23d5e8', 0.4, 4);
        break;
      }
      case 'eshit':
        fx.ring(ev.x, ev.y, 26, '#23d5e8', 0.2, 3);
        audio.play('eshield', { x: ev.x, y: ev.y, vol: 0.5 });
        break;
      case 'eshpop':
        fx.ring(ev.x, ev.y, 70, '#23d5e8', 0.35, 6);
        fx.sparks(ev.x, ev.y, '#b8fbff', 10);
        fx.burst(ev.x, ev.y - 50, 'FZZT!', { size: 24, dur: 0.5, shape: 'none', fill: '#ffffff', fill2: '#23d5e8' });
        audio.play('eshield', { x: ev.x, y: ev.y, pitch: 0.6 });
        break;
      case 'takedown': {
        fx.burst(ev.x, ev.y - 20, pick(['*THWACK*', '*CLONK*', '*BONK*']), { size: 22, dur: 0.7, shape: 'none', fill: '#ffffff', fill2: '#aaaaaa' });
        if (ev.by === me) { hud.toast('SILENT TAKEDOWN!', true); fx.hitstop = 0.06; }
        audio.play('punchBig', { x: ev.x, y: ev.y, vol: 0.4 });
        break;
      }
      case 'alarm': {
        this.alarms.add(ev.panel);
        const re = ev.id != null ? this.enemies.get(ev.id) : null;
        if (re) fx.burst(re.x, re.y - re.h - 30, '!', { size: 54, dur: 0.9, shape: 'none', fill: '#ffffff', fill2: '#ff3a1a' });
        hud.announce('SPOTTED!', 'THE ALARM IS UP!', 1.4);
        audio.play('alarm');
        break;
      }
      case 'trap':
        hud.big('IT\'S A TRAP!', 'THE DOORS SLAM SHUT!', 1.8);
        fx.shake(0.45);
        audio.play('trap');
        break;
      case 'seal':
        this.addSeal(ev.panel, ev.r, false);
        for (const r of ev.r) fx.dust(r.x + r.w / 2, r.y + r.h, 6);
        break;
      case 'unseal':
        this.removeSeal(ev.panel);
        break;
      case 'stand':
        hud.announce('HOLD THE LINE!', `SURVIVE ${ev.dur | 0} SECONDS WHILE THE INK DRIES`, 2.2);
        audio.play('trap');
        break;
      case 'standover':
        hud.announce('THE INK IS DRY!', 'THE PAGE WIPES THEM AWAY', 1.8);
        audio.play('solved');
        break;
      case 'erase': {
        const re = this.enemies.get(ev.id);
        fx.shreds(ev.x, ev.y, ['#f3ead3', '#cfd6dc', '#f3ead3'], 14, 0.7);
        fx.smoke(ev.x, ev.y, 3, '#ffffff', 0.8, 20);
        if (re) this.enemies.delete(ev.id);
        break;
      }
      case 'zdown': {
        fx.burst(ev.x, ev.y - 30, pick(['THUD.', 'FLOMP.', 'KLUNK.']), { size: 22, dur: 0.6, shape: 'none', fill: '#ffffff', fill2: '#9cc47a' });
        if (!this.zHintShown && ev.by === me) { this.zHintShown = true; hud.announce('IT\'S NOT DEAD YET!', 'HEADSHOTS, FISTS OR FIRE KEEP THE DEAD DOWN', 2.6); }
        break;
      }
      case 'rise': {
        fx.burst(ev.x, ev.y - 40, pick(['BRAAAINS!', 'RISE!', 'GRRAAH!']), { size: 30, dur: 0.8, burst: '#c8f08a', edge: '#3a7a1a', big: true });
        audio.play('wake', { x: ev.x, y: ev.y });
        break;
      }
      case 'down': {
        const rp = this.players.get(ev.id);
        fx.burst(ev.x, ev.y - 40, pick(['OOF!', 'DOWN!', 'UGH!']), { size: 36, dur: 0.9, big: true });
        if (ev.id === me) { hud.big('YOU\'RE DOWN!', 'HOLD ON: A FRIEND CAN PICK YOU UP', 2.2); audio.play('gameover', { vol: 0.5 }); }
        else if (rp) hud.announce(`${rp.name} IS DOWN!`, 'GET TO THEM AND PRESS [E]', 2);
        break;
      }
      case 'revive': {
        fx.ring(ev.x, ev.y, 90, '#ffffff', 0.4, 8);
        fx.burst(ev.x, ev.y - 60, pick(['BACK IN IT!', 'ON YOUR FEET!', 'NOT TODAY!']), { size: 30, dur: 0.9, burst: '#ffffff', edge: '#7fd13b', big: true });
        audio.play('respawn', { x: ev.x, y: ev.y });
        break;
      }
      case 'freed': {
        const rc = this.civs.get(ev.id);
        if (rc) {
          fx.bubble(() => (this.civs.has(rc.id) ? { x: rc.x, y: rc.y - 70 } : null), ev.text, 'speech', 2, 17);
          fx.ring(rc.x, rc.y - 40, 80, '#ffffff', 0.4, 6);
        }
        hud.announce('RESCUED!', '+1 MAIL-ORDER COUPON', 1.8);
        audio.play('coupon');
        break;
      }
      case 'chit': {
        const rc = this.civs.get(ev.id);
        if (rc) { rc.anim.flash = 0.08; rc.anim.hurt = 0.3; }
        break;
      }
      case 'civdead':
        fx.shreds(ev.x, ev.y, ['#f3ead3', '#141414'], 18, 1);
        hud.announce('NOOO!', 'THE HOSTAGE IS GONE...', 2);
        this.civs.delete(ev.id);
        break;
      case 'civgone':
        this.civs.delete(ev.id);
        break;
      case 'sw': {
        const sw = this.switches.find((x) => x.id === ev.id);
        if (sw) {
          sw.on = ev.on;
          sw.litT = ev.on ? 5 : 0;
          if (ev.on) { sw.glow = 1; fx.ring(sw.x, sw.y, 40, '#fff36b', 0.35, 5); audio.play('switchOn', { x: sw.x, y: sw.y }); }
        }
        break;
      }
      case 'solved':
        for (const sw of this.switches) if (sw.panel === ev.panel) { sw.done = true; sw.on = 1; fx.ring(sw.x, sw.y, 70, '#fff36b', 0.6, 6); }
        this.solved.add(ev.panel);
        hud.announce('SOLVED!', 'THE WAY FORWARD IS OPEN', 1.8);
        audio.play('solved');
        break;
      case 'hint': {
        this.hints.set(ev.panel, ev.k);
        const kn = th.keyName || 'KEY', sn = th.switchName || 'SWITCH';
        if (ev.k === 'key') hud.announce('IT\'S LOCKED!', `FIND THE ${kn} AND BRING IT TO THE DOOR`, 2.6);
        else if (ev.k === 'switch') hud.announce('THE WAY IS SHUT!', `LIGHT ALL 3 ${sn}ES AT ONCE: SHOOT THEM!`, 2.6);
        else if (ev.k === 'crack') hud.announce('BRICKED UP!', 'SOMETHING EXPLOSIVE SHOULD DO IT...', 2.6);
        break;
      }
      case 'unlock':
        audio.play('unlock');
        if (ev.by === me) hud.toast('UNLOCKED!', true);
        break;
      case 'stamp':
        hud.announce('COLLECTOR\'S STAMP!', `+1 COUPON · ${ev.n} FOUND THIS ISSUE`, 2);
        audio.play('coupon');
        break;
      case 'coupon':
        break;
      case 'ghost':
        hud.announce('GHOST!', 'NOBODY SAW A THING · +30 SUPER', 2);
        audio.play('solved');
        break;
      case 'elite': {
        const re = this.enemies.get(ev.id);
        if (re) re.name = ev.name;
        hud.announce('SHOWDOWN!', ev.name, 2.2);
        audio.play('boss', { vol: 0.6 });
        break;
      }
      case 'redraw': {
        const re = this.enemies.get(ev.id);
        if (re) re.anim.melee = 0.2;
        break;
      }
      case 'drawfail': {
        const re = this.enemies.get(ev.id);
        if (re) fx.burst(re.x, re.y - re.h - 20, pick(['ACK!', 'MY LINES!', 'SMUDGED!']), { size: 22, dur: 0.6, shape: 'none', fill: '#ffffff', fill2: '#ff9ad0' });
        break;
      }
      case 'edodge': {
        const re = this.enemies.get(ev.id);
        if (re) { fx.dust(re.x, re.y, 4, -ev.dir); if (this.nearMe(re.x, re.y, 1000) > 0) fx.burst(re.x, re.y - re.h - 10, pick(['HUP!', 'WHOA!', 'NOPE!']), { size: 18, dur: 0.4, shape: 'none', fill: '#ffffff', fill2: '#dddddd' }); }
        break;
      }
      case 'charge': {
        if (ev.id === me) break;
        const rp = this.players.get(ev.id);
        if (rp) this.chargeFx(rp);
        break;
      }
      case 'stick': {
        const pr = this.projectiles.get(ev.id);
        if (pr) { pr.x = ev.x; pr.y = ev.y; pr.vx = 0; pr.vy = 0; pr.g = 0; }
        fx.inkSplat(ev.x, ev.y, '#141414', 4, 0, 0, 0.5);
        break;
      }
      case 'zap':
        fx.beam(ev.x0, ev.y0, ev.x1, ev.y1, '#fff36b');
        fx.sparks(ev.x1, ev.y1, '#fff36b', 6);
        break;
      case 'counter':
        if (ev.id === me) { hud.toast('COUNTER! NEXT PUNCH IS A KNOCKOUT', true); fx.ring(this.pred.p.x, this.pred.p.y - 46, 70, '#ffffff', 0.35, 6); }
        break;
      case 'style':
        if (ev.id === me) hud.stylePop(ev.k, ev.v);
        break;
      case 'perk':
        if (ev.id === me) { hud.toast(PERKS[ev.k] ? PERKS[ev.k].title : ev.k, true); audio.play('coupon'); }
        break;
      case 'ads':
        audio.play('pageTurn');
        break;
      case 'spreadclear':
        hud.big(ev.final ? 'THE END?' : 'TO BE CONTINUED...', ev.final ? 'NOT QUITE...' : 'TURN THE PAGE!', 3);
        audio.play('spreadClear');
        break;
      case 'victory':
        hud.victory(this);
        audio.play('victory');
        break;
      case 'gameover':
        hud.big('THE END?', 'EVERY HERO FELL. RE-READING THIS CHAPTER...', 4);
        audio.play('gameover');
        break;
      case 'over':
        hud.results(this, ev.winner);
        audio.play('roundOver');
        break;
      case 'phase':
        if (ev.ph === 'play') {
          hud.big(this.mode === 'story' ? pick(['LET’S GO!', 'READ ON!', 'FIGHT!']) : 'BRAWL!', null, 1.2);
          audio.play('go');
        }
        break;
      case 'pick': {
        const pk = this.pickups.get(ev.id);
        this.pickups.delete(ev.id);
        if (pk) fx.ring(pk.x, pk.y, 50, '#ffffff', 0.3, 6);
        if (ev.by === me) {
          if (ev.k === 'weapon') {
            hud.toast(WEAPONS[ev.w].name + '!', true);
            audio.play('pickupWeapon');
          } else if (ev.k === 'health') {
            fx.heal = 1;
            if (pk) fx.number('heal', pk.x, pk.y - 20, 60, { fresh: true });
            hud.toast('+60 HEALTH', false);
            audio.play('pickupHealth');
          } else {
            hud.toast('+1 INK BOMB', false);
            audio.play('pickup');
          }
        } else if (pk) audio.play('pickup', { x: pk.x, y: pk.y, vol: 0.5 });
        break;
      }
      case 'pkspawn':
        this.pickups.set(ev.pk.id, { ...ev.pk, t: 0, spawnT: 0.5 });
        break;
      case 'pkgone':
        this.pickups.delete(ev.id);
        break;
      case 'reload':
        if (ev.id !== me) audio.play('reload', { vol: 0.4, x: this.players.get(ev.id)?.x, y: this.players.get(ev.id)?.y });
        break;
      case 'swap':
        break;
      case 'empty':
        if (ev.id === me) { hud.toast('OUT OF AMMO!', false); audio.play('empty'); }
        break;
      case 'taunt': {
        const rp = this.players.get(ev.id);
        if (rp) {
          fx.bubble(() => (this.players.has(rp.id) && rp.alive ? { x: rp.x, y: rp.y - 110 } : null), ev.text, 'speech', 2.2, 16);
          audio.play('taunt', { x: rp.x, y: rp.y });
        }
        break;
      }
      case 'super': {
        const rp = this.players.get(ev.id);
        if (ev.ph === 0) {
          if (rp) rp.superGlow = 0.7;
          if (ev.id !== me) {
            fx.burst(ev.x, ev.y - 90, 'SPLASH PAGE!', { size: 34, dur: 1.0 });
            fx.lines(ev.x, ev.y, 60, 360, 0.6);
            audio.play('superCharge', { x: ev.x, y: ev.y });
          }
        } else {
          fx.ring(ev.x, ev.y, 430, '#ffffff', 0.6, 24);
          fx.ring(ev.x, ev.y, 320, '#ffe14a', 0.5, 16);
          fx.lines(ev.x, ev.y, 120, 900, 0.5);
          fx.impactFrame(ev.x, ev.y, 0.12);
          fx.shake(this.nearMe(ev.x, ev.y, 1400) * 0.9);
        }
        break;
      }
    }
  }

  nearMe(x, y, range) {
    const p = this.pred.p;
    if (!p.alive) return 0.3;
    return clamp(1 - Math.hypot(p.x - x, p.y - y) / range, 0, 1);
  }

  wallHitFx(x, y, nx, ny, pr) {
    const fx = this.fx;
    const col = pr && pr.ok === 'e' ? '#ff3fa4' : '#ffe14a';
    fx.sparks(x, y, col, 4, nx * 100, ny * 100, 1.2);
    fx.particle({ k: 'glow', x, y, vx: 0, vy: 0, g: 0, drag: 0, life: 0.08, r: 8, color: '#fffbe0' });
    if (Math.random() < 0.4) fx.smoke(x, y, 1, '#f4f1e8', 0.35, 10);
    if (fx.onDecal) fx.onDecal('hole', x - nx * 2, y - ny * 2, {});
    if (pr && pr.k === 'pellet' && Math.random() > 0.3) return;
    this.audio.play('wall', { x, y, vol: 0.5 });
    if (Math.random() < 0.06) fx.burst(x + nx * 20, y + ny * 20 - 10, pick(WALL_WORDS), { size: 16, dur: 0.35, shape: 'none', fill: '#ffffff', fill2: '#dddddd' });
  }

  // FX budget: loud comic FX are the reward, so they're spent on hits that
  // involve YOU (and on big moments). Everything else stays small and clean.
  hitFx(ev, snap) {
    const fx = this.fx, audio = this.audio, hud = this.hud;
    const th = this.theme;
    const pos = this.entityPos(ev.tt, ev.id, snap);
    const ent = pos ? pos.ent : null;
    const x = ev.x + (pos ? pos.dx : 0), y = ev.y + (pos ? pos.dy : 0);
    const mine = ev.bk === 'p' && ev.by === this.me;
    const onMe = ev.tt === 'p' && ev.id === this.me;
    const involved = mine || onMe;
    const near = this.nearMe(x, y, 1200);
    const d = ev.d;
    if (ent) {
      ent.anim.flash = 0.07;
      ent.anim.hurt = 0.3;
      if (Math.hypot(ev.kx, ev.ky) > 420) ent.anim.flung = 0.4;
    }
    if (!involved && near <= 0) return;
    const kn = Math.hypot(ev.kx, ev.ky) || 1;
    const dx = ev.kx / kn, dy = ev.ky / kn;
    const col = this.splatColor(ent, ev.tt);
    const mech = ent && ent.look && (ent.look.body === 'robot' || ent.look.body === 'saucer');
    const heavy = d >= 25 || ev.w === 'combo' || ev.st || ev.c;
    // a killing blow gets the K.O. treatment instead of a hit word
    const killed = snap && snap.ev && snap.ev.some((k) => k.t === 'kill' && k.id === ev.id && k.tt === ev.tt);
    if (mech) {
      fx.sparks(x, y, '#ffe14a', involved ? 4 + Math.min(8, d / 6) : 3, dx, dy);
      if (heavy) fx.inkSplat(x, y, '#2b2b2b', 3, dx * 200, dy * 200, 0.8);
    } else {
      fx.inkSplat(x, y, col, involved ? 3 + Math.min(9, Math.round(d / 6)) : 2, dx * 250, dy * 250, 0.9);
    }
    fx.particle({ k: 'glow', x, y, vx: 0, vy: 0, g: 0, drag: 0, life: 0.07, r: 8 + d * 0.15, color: '#ffffff' });
    if (heavy && involved && fx.onDecal && Math.random() < 0.35 && !mech) fx.onDecal('splat', x + dx * 30, y + dy * 20, { r: Math.min(20, 8 + d * 0.2), color: col });

    // -------- the words --------
    let word;
    if (ev.w === 'punch') word = pick(PUNCH.words);
    else if (ev.w === 'combo') word = pick(PUNCH.comboWords);
    else if (ev.w === 'blade') word = pick(WEAPONS.blade.words);
    else if (ev.w === 'rail') word = pick(['SHRAKK!', 'ZZAKK!', 'KZZRT!']);
    else if (ev.w === 'charge' || ev.w === 'bash') word = pick(['WHAM!', 'KA-RUNCH!', 'SLAM!']);
    else word = pick(th.hitWords);
    const pal = th.palette;
    if (!ev.ex && !killed) {
      if (mine && ev.c) {
        fx.burst(x, y - 16, pick(CRIT_WORDS), { size: 38, dur: 0.8, burst: '#e8262b', edge: '#141414', fill: '#fff36b', fill2: '#ffb21f', spikes: 14, pop: 1.25, big: true });
      } else if (mine && heavy) {
        fx.gatedBurst('w' + ev.id, 0.12, x + (Math.random() - 0.5) * 16, y - 18, word, {
          size: clamp(26 + d * 0.4, 30, 60), dur: 0.7, big: true,
          burst: ev.w === 'combo' ? '#ff3fa4' : pal.burst[1], edge: ev.w === 'combo' ? '#141414' : pal.burstEdge,
          fill: '#ffffff', fill2: pal.burst[0], pop: 1.2,
        });
        fx.lines(x, y, 18, 100, 0.18);
      } else if (mine) {
        fx.gatedBurst('w' + ev.id, 0.4, x + (Math.random() - 0.5) * 20, y - 20, word, { size: 19, dur: 0.4, shape: 'none', fill: '#ffffff', fill2: pal.burst[0] });
      } else if (onMe) {
        fx.gatedBurst('me', 0.3, x, y - 20, word, { size: d >= 20 ? 30 : 20, dur: 0.5, shape: d >= 20 ? 'burst' : 'none', burst: '#ffffff', edge: pal.burstEdge, fill: '#ffffff', fill2: pal.burst[0] });
      } else if (ev.big && near > 0.3) {
        fx.gatedBurst('o' + ev.id, 0.6, x, y - 20, word, { size: 18, dur: 0.35, shape: 'none', fill: '#ffffff', fill2: '#dddddd' });
      }
    }
    if (involved) fx.number(ev.tt + ev.id, x, y - 34, d, { crit: !!ev.c, mine, hurtMe: onMe });
    audio.play(ev.c ? 'hitCrit' : 'hit', { x, y, vol: involved ? clamp(0.5 + d / 60, 0.5, 1) : 0.35 });

    if (mine) {
      fx.hitmarker = 0.2;
      fx.hitmarkerCrit = !!ev.c;
      audio.play('hitmarker');
      if (heavy) fx.shake(0.1);
    }
    if (onMe) {
      fx.vignette = Math.min(1, fx.vignette + d / 55);
      fx.shake(0.12 + d / 90);
      let src = null;
      if (ev.bk === 'p') src = this.players.get(ev.by);
      else if (ev.bk === 'e') src = this.enemies.get(ev.by);
      const me = this.pred.p;
      const a = src ? Math.atan2(src.y - 46 - (me.y - 46), src.x - me.x) : Math.atan2(-ev.ky, -ev.kx);
      fx.dmgDirs.push({ a, t: 0 });
      hud.hurt(d);
      audio.play('hurt', { vol: clamp(0.5 + d / 50, 0.5, 1) });
      if (d >= 40) fx.impactFrame(x, y, 0.05);
    }
  }

  killFx(ev, snap) {
    const fx = this.fx, audio = this.audio, hud = this.hud;
    const th = this.theme;
    const pos = this.entityPos(ev.tt, ev.id, snap);
    const ent = pos ? pos.ent : null;
    const x = ent ? ent.x : ev.x, y = ent ? ent.y - (ent.h || 90) / 2 : ev.y;
    const look = ent ? ent.look : null;
    const mine = ev.bk === 'p' && ev.by === this.me;
    const onMe = ev.tt === 'p' && ev.id === this.me;
    const boss = ev.k === 'boss';
    const loud = mine || onMe || boss || (ent && ent.elite) || (ev.tt === 'p' && this.nearMe(x, y, 1200) > 0);
    const colors = look
      ? [look.suit, look.suit2 || look.suit, look.skin || look.suit, '#f3ead3', look.cape || look.suit, '#f3ead3']
      : ['#f3ead3', '#141414'];
    fx.shreds(x, y, colors.filter(Boolean), boss ? 60 : loud ? 22 : 10, boss ? 1.6 : 1);
    fx.inkSplat(x, y, this.splatColor(ent, ev.tt), boss ? 40 : loud ? 12 : 5, ev.vx, ev.vy, 2);
    let word = pick(th.killWords);
    if (ev.w === 'punch' || ev.w === 'combo') word = pick(['K.O.!', 'KNOCKOUT!', 'KAPOW!!']);
    if (ev.s) word = null; // silent takedown: no fanfare
    if (word && loud) {
      fx.burst(x, y - 30, boss ? 'THE END!' : word, { size: boss ? 96 : 48, dur: boss ? 2.2 : 1.1, burst: '#fff36b', edge: th.palette.accent, fill: '#ffffff', fill2: '#ffe14a', spikes: 16, pop: 1.4, layer: 1, big: true });
      fx.ring(x, y, boss ? 400 : 110, '#ffffff', 0.4, 10);
      fx.lines(x, y, 40, boss ? 700 : 200, boss ? 0.8 : 0.25);
    } else if (word && this.nearMe(x, y, 1200) > 0) {
      fx.burst(x, y - 30, 'K.O.', { size: 20, dur: 0.5, shape: 'none', fill: '#ffffff', fill2: '#dddddd' });
    }
    if (fx.onDecal && ent && (mine || boss)) fx.onDecal('rip', ent.x, ent.y, { w: ent.w || 36, h: ent.h || 90, flying: ent.look && (ent.look.body === 'bat' || ent.look.body === 'saucer'), seed: ev.id });
    if (boss) {
      fx.explosion(x, y, 260, 'KA-BLAMMO!!', { size: 80 });
      fx.impactFrame(x, y, 0.2);
      fx.hitstop = 0.18;
      fx.shake(1);
    }
    audio.play('ko', { x, y, vol: loud ? 1 : 0.5 });

    if (ev.tt === 'e') {
      this.enemies.delete(ev.id);
    } else if (ent) {
      ent.alive = false;
    }

    if (mine && !onMe) {
      fx.killmarker = 0.55;
      audio.play('killmarker');
      if (!ev.s) {
        fx.impactFrame(x, y, 0.06);
        fx.hitstop = Math.max(fx.hitstop, 0.07);
        fx.shake(0.25);
      }
      if (this.time - this.lastKillT < 3.5) this.killStreak++; else this.killStreak = 1;
      this.lastKillT = this.time;
      if (this.killStreak >= 2) {
        const names = ['', '', 'DOUBLE KO!', 'TRIPLE THREAT!', 'MEGA-KAPOW!', 'UNSTOPPABLE!', 'LEGENDARY!'];
        hud.announce(names[Math.min(names.length - 1, this.killStreak)] || 'UNSTOPPABLE!', null, 1.4);
      }
    }
    if (onMe) {
      fx.impactFrame(x, y, 0.14);
      fx.shake(0.7);
      const killer = ev.bk === 'p' ? this.players.get(ev.by) : ev.bk === 'e' ? this.enemies.get(ev.by) : null;
      hud.death(killer ? killer.name : ev.by === this.me ? 'YOURSELF' : ev.w === 'bleed' ? 'BLOOD LOSS' : 'THE COMIC', ev.w);
      this.killStreak = 0;
    }
    if (ev.tt === 'p' || boss || mine) {
      const victim = ev.tt === 'p' ? (this.players.get(ev.id) || {}).name : ent ? ent.name : 'SOMEONE';
      const killer = ev.bk === 'p' ? (this.players.get(ev.by) || {}).name : ev.bk === 'e' ? (this.enemies.get(ev.by) || { name: th.enemies.grunt.name }).name : null;
      hud.feed(killer, victim, ev.w, ev.by === this.me || ev.id === this.me);
    }
  }

  boomFx(ev) {
    const fx = this.fx;
    let word;
    if (ev.k === 'word') word = pick(WEAPONS.launcher.boomWords);
    else if (ev.k === 'bomb') word = pick(BOMB.words);
    else if (ev.k === 'barrel') word = pick(['KA-BLAMMO!', 'KRAKA-BOOM!', 'BWOOSH!']);
    else if (ev.k === 'super') word = 'SPLASH PAGE!!';
    else if (ev.k === 'acid') word = pick(['SPLORCH!', 'SPLUT!', 'GLORP!']);
    else word = 'BOOM!';
    if (ev.k === 'acid') {
      fx.inkSplat(ev.x, ev.y, '#7fd13b', 16, 0, -200, 3);
      fx.smoke(ev.x, ev.y, 4, '#c8f08a', ev.r / 120, 40);
      fx.burst(ev.x, ev.y - 20, word, { size: 30, dur: 0.6, burst: '#c8f08a', edge: '#3a7a1a' });
      if (fx.onDecal) fx.onDecal('splat', ev.x, ev.y, { r: ev.r * 0.3, color: '#7fd13b' });
      this.audio.play('acid', { x: ev.x, y: ev.y });
      return;
    }
    if (ev.k === 'super') {
      fx.explosion(ev.x, ev.y, ev.r * 0.7, word, { size: 72, burst: '#23d5e8', edge: '#141414' });
      this.audio.play('explosionBig', { x: ev.x, y: ev.y });
      return;
    }
    fx.explosion(ev.x, ev.y, ev.r, word);
    const near = this.nearMe(ev.x, ev.y, ev.r * 3.2);
    fx.shake(0.25 + near * 0.55);
    if (near > 0.6) fx.impactFrame(ev.x, ev.y, 0.05);
    this.audio.play(ev.k === 'barrel' ? 'barrel' : 'explosion', { x: ev.x, y: ev.y });
  }

  // ------------------------------------------------------------------ update

  update(dt) {
    this.time += dt;
    if (!this.level) return;
    const fx = this.fx;
    const frozenVisual = fx.hitstop > 0;
    const vdt = frozenVisual ? 0 : dt;

    // interpolate remote entities
    const rt = this.serverTickNow() - this.interpTicks;
    const snaps = this.snaps;
    let a = null, b = null;
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].t <= rt) { a = snaps[i]; b = snaps[i + 1] || null; break; }
    }
    if (!a && snaps.length) { a = snaps[0]; b = snaps[1] || null; }
    const alpha = a && b ? clamp((rt - a.t) / (b.t - a.t), 0, 1) : 0;
    const extra = a && !b ? clamp(rt - a.t, 0, 6) / TICK_RATE : 0;

    if (a) {
      for (const [id, rp] of this.players) {
        if (id === this.me) continue;
        const sa = a.pmap.get(id), sb = b ? b.pmap.get(id) : null;
        if (!sa && !sb) continue;
        let s0 = sa || sb, s1 = sb || sa;
        const teleport = Math.hypot(s1.x - s0.x, s1.y - s0.y) > 250;
        const t = teleport ? 1 : alpha;
        rp.x = lerp(s0.x, s1.x, t) + (b ? 0 : s0.vx * extra);
        rp.y = lerp(s0.y, s1.y, t) + (b ? 0 : s0.vy * extra * 0.3);
        rp.vx = lerp(s0.vx, s1.vx, t);
        rp.vy = lerp(s0.vy, s1.vy, t);
        rp.aim = lerpAngle(s0.a, s1.a, t);
        const f = t < 0.5 ? s0.f : s1.f;
        this.applyFlags(rp, f);
        rp.h = t < 0.5 ? s0.h : s1.h;
        rp.w = t < 0.5 ? s0.w : s1.w;
      }
      for (const [id, re] of this.enemies) {
        if (re.asleep) continue;
        const sa = a.emap.get(id), sb = b ? b.emap.get(id) : null;
        if (!sa && !sb) continue;
        const s0 = sa || sb, s1 = sb || sa;
        re.x = lerp(s0.x, s1.x, alpha) + (b ? 0 : s0.vx * extra);
        re.y = lerp(s0.y, s1.y, alpha) + (b ? 0 : s0.vy * extra * 0.3);
        re.vx = lerp(s0.vx, s1.vx, alpha);
        re.vy = lerp(s0.vy, s1.vy, alpha);
        re.aim = lerpAngle(s0.a, s1.a, alpha);
        re.facing = s1.f;
        re.onGround = !!s1.g;
        re.act = s1.act;
      }
    }

    // local player from prediction
    const me = this.meRender();
    if (me) {
      const p = this.pred.p;
      const k = Math.exp(-dt * 14);
      this.smooth.x *= k;
      this.smooth.y *= k;
      me.x = p.x + this.smooth.x;
      me.y = p.y + this.smooth.y;
      me.vx = p.vx;
      me.vy = p.vy;
      me.aim = p.aim;
      me.facing = p.facing;
      me.onGround = p.onGround;
      me.crouch = p.crouch;
      me.climb = p.climb;
      me.dash = p.dashT > 0;
      me.stun = p.stun > 0;
      me.h = p.h;
      me.super = p.superT > 0;
      if (this.meState) {
        me.alive = this.meState.alive;
        me.invuln = this.meState.invuln > 0;
        me.w = weaponOf(p);
        me.downed = !!this.meState.downed;
        me.hasKey = !!this.meState.hasKey;
        me.reloading = p.rl > 0;
        me.charging = p.railT > 0;
      }
    }

    // animations
    for (const rp of this.players.values()) {
      rp.look = HEROES[rp.hero] ? HEROES[rp.hero].look : rp.look;
      if (rp.drawP != null && rp.drawP < 1) rp.drawP = Math.min(1, rp.drawP + vdt / 0.55);
      if (rp.superGlow > 0) rp.superGlow -= dt;
      updateAnim(rp.anim, rp, vdt);
    }
    for (const [id, re] of this.enemies) {
      if (!re.asleep && this.time - re.seen > 0.5 && re.st !== 0) { this.enemies.delete(id); continue; }
      if (re.wakeP < 1) re.wakeP = Math.min(1, re.wakeP + vdt / 0.45);
      if (re.drawP < 1) re.drawP = Math.min(1, re.drawP + vdt / 1.0);
      if (re.tel > 0) re.tel -= dt;
      updateAnim(re.anim, re, re.asleep ? 0 : vdt);
    }
    for (const rc of this.civs.values()) {
      rc.x += (rc.tx - rc.x) * Math.min(1, dt * 12);
      rc.y = rc.ty;
      rc.act = rc.st === 'tied' ? ACT.tied : ACT.flee;
      rc.vx = rc.st === 'free' ? rc.facing * 300 : 0;
      rc.k = 'civ';
      updateAnim(rc.anim, rc, vdt);
    }
    for (const list of this.seals.values()) for (const r of list) if (r.t < 1) r.t = Math.min(1, r.t + dt / 0.25);
    for (const sw of this.switches) { if (sw.glow > 0) sw.glow = Math.max(0, sw.glow - dt * 2); if (sw.litT > 0) sw.litT -= dt; }
    for (const rp of this.players.values()) if (rp.chargeT > 0) rp.chargeT -= dt;
    for (const pr of this.props.values()) {
      if (pr.shake > 0) pr.shake -= dt;
      if (pr.flipT != null && pr.flipT < 1) pr.flipT = Math.min(1, pr.flipT + dt / 0.2);
    }
    for (const pk of this.pickups.values()) {
      pk.t += dt;
      if (pk.spawnT > 0) pk.spawnT -= dt;
    }
    for (const [id, t] of this.gateFade) {
      if (t >= 1) this.gateFade.delete(id);
      else this.gateFade.set(id, t + dt / 0.6);
    }

    // cosmetic projectiles
    if (!frozenVisual) this.updateProjectiles(dt);

    // music intensity: foes around me + how hard things are hitting
    let near = 0;
    const mp = this.pred.p;
    for (const e of this.enemies.values()) if (!e.asleep && Math.abs(e.x - mp.x) < 900 && Math.abs(e.y - mp.y) < 600) near++;
    for (const p of this.players.values()) if (p.id !== this.me && p.alive && Math.abs(p.x - mp.x) < 800 && Math.abs(p.y - mp.y) < 500) near++;
    const target = clamp(near / 5 + this.fx.trauma * 0.8 + (this.boss ? 0.5 : 0), 0, 1);
    this.intensity = (this.intensity || 0) + (target - (this.intensity || 0)) * Math.min(1, dt * (target > (this.intensity || 0) ? 3 : 0.4));

    // footsteps for the local hero
    if (me && me.alive && me.onGround && !me.climb) {
      const step = Math.floor(me.anim.phase / Math.PI);
      if (step !== this.lastStep && Math.abs(me.vx) > 120) this.audio.play('step', { x: me.x, y: me.y, vol: 0.7 });
      this.lastStep = step;
    }
  }

  applyFlags(rp, f) {
    rp.flags = f;
    rp.onGround = !!(f & F.GROUND);
    rp.crouch = !!(f & F.CROUCH);
    rp.climb = !!(f & F.CLIMB);
    rp.dash = !!(f & F.DASH);
    rp.alive = !(f & F.DEAD);
    rp.invuln = !!(f & F.INVULN);
    rp.stun = !!(f & F.STUN);
    rp.super = !!(f & F.SUPER);
    rp.downed = !!(f & F.DOWN);
    rp.reviving = !!(f & F.REVIVE);
    rp.hasKey = !!(f & F.KEY);
    rp.reloading = !!(f & F.RELOAD);
    rp.charging = !!(f & F.CHARGE);
    const melee = !!(f & F.MELEE);
    if (melee && !rp._melee && rp.w !== 'blade') rp.anim.melee = Math.max(rp.anim.melee, 0.2);
    rp._melee = melee;
  }

  updateProjectiles(dt) {
    for (const pr of this.projectiles.values()) {
      pr.age += dt;
      pr.life -= dt;
      if (pr.life < -0.3) { this.projectiles.delete(pr.id); continue; }
      if (pr.localDead) continue;
      pr.vy += pr.g * dt;
      const nx = pr.x + pr.vx * dt, ny = pr.y + pr.vy * dt;
      const wall = raycast(this.phys, pr.x, pr.y, nx, ny);
      if (wall) {
        const hx = pr.x + (nx - pr.x) * wall.t, hy = pr.y + (ny - pr.y) * wall.t;
        if (pr.k === 'bomb' || pr.k === 'egren') {
          pr.x = hx + wall.nx * 1.5;
          pr.y = hy + wall.ny * 1.5;
          if (wall.nx) pr.vx = -pr.vx * pr.bounce;
          if (wall.ny) { pr.vy = -pr.vy * pr.bounce; pr.vx *= 0.8; }
          if (Math.abs(pr.vy) < 60 && wall.ny < 0) pr.vy = 0;
          if (Math.hypot(pr.vx, pr.vy) > 150) this.audio.play('land', { x: pr.x, y: pr.y, vol: 0.25, pitch: 1.8 });
          continue;
        }
        pr.localDead = true;
        pr.x = hx;
        pr.y = hy;
        if (pr.k !== 'word') this.wallHitFx(hx, hy, wall.nx, wall.ny, pr);
        continue;
      }
      pr.trail.push(pr.x, pr.y);
      if (pr.trail.length > 12) pr.trail.splice(0, 2);
      pr.x = nx;
      pr.y = ny;
    }
  }

  // helpers for the renderer / HUD
  myPanel() {
    const me = this.meRender();
    if (!me || !this.level) return null;
    return findPanel(this.level, me.x, me.y - 40, 20);
  }
}
