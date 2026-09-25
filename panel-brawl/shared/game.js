// Authoritative game simulation. Runs on the Node server for online play and
// inside the browser for solo play. Emits a stream of events that clients use
// to drive all the comic-book FX.
//
// Story structure: an issue is three spreads; each spread is a reading path of
// panels, and each panel has a BEAT (establishing shot, brawl, ambush, silent
// stealth panel, last stand, rescue, showdown, boss) and maybe a light PUZZLE
// on its exit (key, switches, cracked wall). Between spreads the comic flips
// to its mail-order ad page and everyone picks a perk.

import { DT, BODY, PLAYER, MODES, BRAWL, F, emptyCmd } from './constants.js';
import { RNG, hash01, randomSeed } from './rng.js';
import { THEMES, HEROES, HERO_KEYS, PLAYER_COLORS, TAUNTS } from './themes.js';
import {
  WEAPONS, HEAVY_KEYS, PUNCH, BOMB, SUPER, EXPLOSION_SELF, ENEMY_SHOTS, PROJ_RADIUS,
  weaponOf, shoulderOf, applyRecoil, reloadTime, bombRecharge,
} from './weapons.js';
import { Physics, SOLID, ONEWAY, raycast, segRect, groundProbe } from './physics.js';
import { initMoveState, stepMovement } from './movement.js';
import { generateComic, generateSpread, findPanel } from './comicgen.js';
import { updateEnemy, ENEMY_STATS, ACT, squadOf, callout, releaseCover } from './ai.js';
import { botThink } from './bots.js';
import { PERKS, PERK_KEYS, applyPerkStats } from './perks.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const PHASE_TIME = { intro: 4.6, turning: 3.4, retry: 2.6, ads: 30 };
const ZOMBIE_RISERS = new Set(['grunt', 'shield', 'gunner', 'grenadier']);
const SLOW_SHOTS = new Set(['orb', 'acid', 'bossorb', 'egren']);

export class Game {
  constructor(opts = {}) {
    this.mode = opts.mode === MODES.BRAWL ? MODES.BRAWL : MODES.STORY;
    this.chaos = !!opts.chaos;
    this.forceTheme = opts.theme || null;
    this.rng = new RNG(opts.seed ?? randomSeed());
    this.tick = 0;
    this.events = [];
    this.players = new Map();
    this.enemies = new Map();
    this.projectiles = new Map();
    this.props = new Map();
    this.pickups = new Map();
    this.civs = new Map();
    this.squads = new Map();
    this.pending = [];
    this.levelVersion = 0;
    this.coverVer = 0;
    this.nextShot = 1;
    this.uid = 100000;
    this.nextColor = 0;
    this.coupons = 0;
    this.stamps = 0;
    this.phase = 'intro';
    this.phaseT = PHASE_TIME.intro;
    this.matchT = BRAWL.matchTime;
    this.newComic(opts.seed);
    if (opts.startSpread) this.loadSpread(Math.min(this.comic.spreads - 1, opts.startSpread | 0), 'cover');
  }

  emit(ev) {
    ev.tk = this.tick;
    this.events.push(ev);
  }

  get theme() { return THEMES[this.comic.theme]; }

  get humans() {
    let n = 0;
    for (const p of this.players.values()) if (!p.bot) n++;
    return n;
  }

  // ------------------------------------------------------------------ level

  newComic(seed) {
    this.comic = generateComic(seed ?? this.rng.int(1, 2e9), { theme: this.forceTheme });
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0; p.score = 0; p.dmg = 0; p.super = 0;
      p.heavy = null; p.heavyAmmo = 0; p.slot = 0;
      p.perks = {};
      p.maxHp = PLAYER.hp;
      applyPerkStats(p);
    }
    this.coupons = 0;
    this.stamps = 0;
    this.matchT = BRAWL.matchTime;
    this.loadSpread(0, 'cover');
  }

  loadSpread(index, transition) {
    this.spreadIndex = index;
    this.level = generateSpread(this.comic, index, this.mode, { chaos: this.chaos });
    this.transition = transition;
    this.levelVersion++;
    this.coverVer++;
    const lv = this.level;

    this.phys = new Physics();
    for (const s of lv.solids) this.phys.add({ ...s });
    for (const o of lv.oneways) this.phys.add({ ...o });
    this.phys.ladders = lv.ladders.map((l) => ({ ...l }));
    this.phys.lowGrav = (lv.lowGrav || []).map((z) => ({ ...z }));
    this.gateIds = new Map();
    this.gatesOpen = new Set();
    for (const g of lv.gates) this.gateIds.set(g.id, this.phys.add({ x: g.x, y: g.y, w: g.w, h: g.h, t: SOLID, k: 'gate', gate: g.id }));
    this.seals = new Map();

    this.props.clear();
    for (const pr of lv.props) this.addProp({ ...pr });

    this.pickups.clear();
    for (const pk of lv.pickups) this.pickups.set(pk.id, { ...pk, active: true, t: 0 });

    this.switches = (lv.switches || []).map((s) => ({ ...s, t: 0, done: false }));
    this.civs.clear();
    for (const c of lv.civs || []) {
      this.civs.set(c.id, { ...c, kind: 'c', st: 'tied', hp: 60, maxHp: 60, untie: 0, by: null, w: 36, h: 84, vx: 0, vy: 0, facing: 1, runT: 0 });
    }
    this.solved = new Set();
    this.alarms = new Set();
    this.triggered = new Set();
    this.stand = new Map();

    this.projectiles.clear();
    this.enemies.clear();
    this.squads.clear();
    this.pending.length = 0;
    this.pendingWaves = new Map();
    this.panelState = lv.panels.map(() => (this.mode === MODES.STORY ? 'locked' : 'asleep'));
    this.panelQuiet = lv.panels.map(() => 0);
    if (this.mode === MODES.STORY) this.panelState[lv.path[0]] = 'asleep';
    for (const def of lv.enemies) {
      if (def.wave === 0) this.addEnemy(def, 'asleep');
      else {
        if (!this.pendingWaves.has(def.panel)) this.pendingWaves.set(def.panel, []);
        const waves = this.pendingWaves.get(def.panel);
        (waves[def.wave - 1] ||= []).push(def);
      }
    }
    for (const [panel, waves] of this.pendingWaves) this.pendingWaves.set(panel, waves.filter(Boolean));
    this.bossId = null;
    this.ads = null;

    this.phase = transition === 'cover' ? 'intro' : 'turning';
    this.phaseT = transition === 'cover' ? PHASE_TIME.intro : transition === 'retry' ? PHASE_TIME.retry : PHASE_TIME.turning;
    this.wipeT = 0;
    for (const p of this.players.values()) {
      p.hasKey = false;
      p.downed = false;
      p.revTarget = null;
      this.spawnPlayer(p, true);
    }
  }

  addProp(pr) {
    pr.dead = false;
    pr.st = 'up';
    pr.dir = 0;
    pr.hp = pr.k === 'crate' ? 45 : pr.k === 'barrel' ? 16 : 70;
    this.props.set(pr.id, pr);
    this.propSolid(pr);
  }

  propSolid(pr) {
    if (pr.solidId) this.phys.remove(pr.solidId);
    if (pr.k === 'table') {
      if (pr.st === 'up') pr.solidId = this.phys.add({ x: pr.x, y: pr.y, w: pr.w, h: 10, t: ONEWAY, prop: pr.id });
      else pr.solidId = this.phys.add({ x: pr.x + pr.w / 2 - 9, y: pr.y + pr.h - 60, w: 18, h: 60, t: SOLID, prop: pr.id });
    } else {
      pr.solidId = this.phys.add({ x: pr.x, y: pr.y, w: pr.w, h: pr.h, t: SOLID, prop: pr.id });
    }
    this.coverVer++;
  }

  addEnemy(def, st) {
    const th = this.theme;
    const spec = th.enemies[def.k];
    const base = ENEMY_STATS[def.k];
    const look = spec.look;
    const scale = look.scale || 1;
    const humanoid = look.body === 'humanoid' || look.body === 'robot';
    const flying = def.k === 'flyer' || !!spec.flying;
    let w = base.w, h = base.h;
    if (def.k === 'boss') {
      if (look.body === 'brainjar') { w = 150; h = 150; }
      else { h = Math.round(BODY.h * scale); w = Math.round(BODY.w * scale * (look.bulk || 1) * 0.8); }
    } else if (humanoid && def.k !== 'flyer') {
      h = Math.round((def.k === 'brute' ? 92 : 90) * scale);
      w = Math.round(36 * scale * Math.min(1.5, look.bulk || 1));
    } else if (look.body === 'saucer') { w = 64; h = 34; }
    const elite = !!def.elite;
    if (elite && def.k !== 'brute') { h = Math.round(h * 1.12); w = Math.round(w * 1.15); }
    const n = Math.max(1, this.humans);
    let hpMul = def.k === 'boss' ? 1 + 0.55 * (n - 1) : 1 + 0.25 * (n - 1);
    if (th.key === 'noir') hpMul *= 0.8;
    if (th.key === 'zombie' && def.k === 'grunt') hpMul *= 0.75;
    if (elite) hpMul *= 2.4;
    const P = this.level.panels[def.panel];
    const y = flying ? clamp(def.y, P.y1 + h + 30, P.y2 - 60) : def.y;
    const poise = Math.round(base.poise * (elite ? 1.8 : 1) * (def.k === 'boss' ? 1 + 0.35 * (n - 1) : 1));
    const e = {
      kind: 'e', id: def.id, k: def.k, name: elite ? def.elite : spec.name, look, elite,
      x: def.x, y, vx: 0, vy: 0, w, h, baseH: h,
      hp: Math.round(base.hp * hpMul), maxHp: Math.round(base.hp * hpMul),
      poise, maxPoise: poise, poiseT: 0, staggerT: 0,
      st, panel: def.panel, facing: def.facing || 1, aim: (def.facing || 1) > 0 ? 0 : Math.PI,
      onGround: !flying, flying, speed: base.speed * (elite ? 1.08 : 1), jumpV: base.jumpV, knockMul: base.knockMul * (elite ? 0.6 : 1),
      dmgMul: (elite ? 1.25 : 1) * (th.key === 'noir' ? 1.35 : 1),
      act: ACT.idle, actT: 0, cd: 0.6 + this.rng.f(), jumpCd: 0, t: this.rng.f() * 10,
      wakeT: 0, drawT: 0, stunT: 0, hurtT: 0, pattern: 0, blocked: false, target: null,
      aware: !def.patrol, susp: 0, supp: 0, dodgeCd: 0, flungT: 0, flungBy: null, launched: false, airT: 0, downT: 0,
      mag: 3, carry: def.carry || null, job: def.job || null, dropT: 0,
      shieldUp: false, shieldHp: 0, shieldMax: 0, shieldKind: null, shieldT: 0, esh: 0, eshMax: 0, eshT: 0,
    };
    if (def.k === 'shield' && look.shield) {
      e.shieldKind = look.shield.kind;
      e.shieldMax = e.shieldKind === 'energy' ? 80 : base.shield;
      e.shieldHp = e.shieldMax;
      e.shieldUp = true;
    }
    if (th.key === 'space' && (def.k === 'gunner' || def.k === 'grenadier')) { e.eshMax = 30; e.esh = 30; }
    this.enemies.set(e.id, e);
    if (st === 'drawing') {
      e.drawT = 1.0;
      if (def.drop) { e.drop = true; e.y = P.y1 + 40; e.onGround = false; }
      this.emit({ t: 'draw', id: e.id, k: e.k, x: r1(e.x), y: r1(e.y), drop: def.drop ? 1 : undefined });
    }
    return e;
  }

  activateEnemy(e) {
    e.st = 'active';
    const th = this.theme;
    let line = null;
    if (e.k === 'boss') line = this.rng.pick(th.bossLines);
    else if (e.elite) line = null;
    else if (e.aware && this.rng.f() < 0.35) line = this.rng.pick(th.wakeLines);
    this.emit({ t: 'wake', id: e.id, line });
  }

  // ---------------------------------------------------------------- players

  addPlayer(id, name, hero, bot = false) {
    const p = {
      kind: 'p', id, bot,
      name: String(name || 'HERO').slice(0, 14).toUpperCase(),
      hero: HEROES[hero] ? hero : HERO_KEYS[id % HERO_KEYS.length],
      color: PLAYER_COLORS[this.nextColor++ % PLAYER_COLORS.length],
      x: 0, y: 0, alive: false, respawnT: 0, hp: PLAYER.hp, maxHp: PLAYER.hp,
      mag: PLAYER.mag, heavy: null, heavyAmmo: 0, slot: 0, cd: 0, rl: 0,
      meleeCd: 0, meleeT: 0, combo: 0, comboT: 0,
      bombs: PLAYER.bombs, bombT: 0, super: 0, invuln: 0,
      kills: 0, deaths: 0, score: 0, dmg: 0,
      lastSeq: 0, inputQ: [], lastCmd: emptyCmd(), aim: 0, tauntCd: 0,
      botSeq: 0, fx: {},
      perks: {}, picks: 0, hasKey: false, downed: false, bleed: 0, rev: 0, revTarget: null, revT: 0,
      railT: 0, railSeq: 0, counterT: 0,
    };
    initMoveState(p);
    applyPerkStats(p);
    this.players.set(id, p);
    this.spawnPlayer(p, true);
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (p && p.hasKey) this.dropPickup('key', null, p.x, p.y - 40);
    this.players.delete(id);
  }

  queueInput(id, cmds) {
    const p = this.players.get(id);
    if (!p || p.bot) return;
    for (const c of cmds) {
      if (typeof c.seq !== 'number' || c.seq <= p.lastSeq) continue;
      if (p.inputQ.length && c.seq <= p.inputQ[p.inputQ.length - 1].seq) continue;
      p.inputQ.push(sanitizeCmd(c));
    }
  }

  // The furthest panel the team has actually reached: never past a puzzle
  // exit that is still shut.
  frontierPanel() {
    const lv = this.level;
    if (this.mode !== MODES.STORY) return null;
    let best = lv.panels[lv.path[0]];
    for (const id of lv.path) {
      const s = this.panelState[id];
      if (s === 'active' || s === 'asleep') return lv.panels[id];
      if (s !== 'cleared') break;
      best = lv.panels[id];
      const exit = lv.gates.find((gt) => gt.panel === id);
      if (exit && !this.gatesOpen.has(exit.id)) break;
    }
    return best;
  }

  spawnPlayer(p, levelStart = false) {
    const lv = this.level;
    let spots;
    if (this.mode === MODES.STORY) {
      const P = levelStart ? lv.panels[lv.path[0]] : this.frontierPanel();
      spots = lv.spawns.filter((s) => s.panel === P.id);
      if (!spots.length) spots = [{ x: (P.x1 + P.x2) / 2, y: P.y2 }];
      const s = spots[Math.floor(this.rng.f() * spots.length)];
      p.x = s.x + (this.rng.f() - 0.5) * 30;
      p.y = s.y;
    } else {
      spots = lv.spawns;
      let best = spots[0], bestScore = -Infinity;
      for (const s of spots) {
        let minD = 5000;
        for (const o of this.players.values()) {
          if (o === p || !o.alive) continue;
          minD = Math.min(minD, Math.hypot(o.x - s.x, o.y - s.y));
        }
        const score = minD + this.rng.f() * 400;
        if (score > bestScore) { bestScore = score; best = s; }
      }
      p.x = best.x;
      p.y = best.y;
    }
    initMoveState(p);
    applyPerkStats(p);
    p.alive = true;
    p.downed = false;
    p.revTarget = null;
    p.hp = p.maxHp;
    p.invuln = PLAYER.spawnInvuln;
    p.mag = PLAYER.mag;
    p.rl = 0;
    p.cd = 0;
    p.railT = 0;
    p.slot = p.heavy ? 1 : 0;
    p.onGround = true;
    this.emit({ t: 'spawn', id: p.id, x: r1(p.x), y: r1(p.y) });
  }

  // ------------------------------------------------------------------- step

  step() {
    this.tick++;
    const frozen = this.phase === 'intro' || this.phase === 'turning' || this.phase === 'over' || this.phase === 'victory' || this.phase === 'ads';

    for (const p of this.players.values()) {
      if (p.bot) {
        this.updatePlayer(p, frozen ? emptyCmd(0, p.aim) : botThink(this, p), frozen);
        continue;
      }
      // Every client input is simulated exactly once, so client prediction
      // replays land in the same spot. A late packet briefly pauses the
      // player (up to ~0.25 s); a backlog is worked off a little faster.
      let n = p.inputQ.length > 6 ? 3 : p.inputQ.length > 2 ? 2 : 1;
      if (!p.inputQ.length) {
        p.starve = (p.starve || 0) + 1;
        if (p.starve > 15) {
          const idle = emptyCmd(p.lastSeq, p.aim);
          idle.seq = p.lastSeq;
          this.updatePlayer(p, idle, frozen);
        }
        continue;
      }
      p.starve = 0;
      while (n-- > 0 && p.inputQ.length) {
        const cmd = p.inputQ.shift();
        p.lastSeq = cmd.seq;
        p.lastCmd = cmd;
        this.updatePlayer(p, cmd, frozen);
      }
    }

    if (!frozen || this.phase === 'over') {
      for (const e of this.enemies.values()) updateEnemy(this, e, DT);
      this.updateCivs();
      this.updateSwitches();
    }
    this.updateProjectiles();
    this.updatePending();
    this.updatePickups();
    if (this.mode === MODES.STORY) this.updateStory();
    else this.updateBrawl();
  }

  updatePending() {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const j = this.pending[i];
      j.t -= DT;
      if (j.t <= 0) {
        this.pending.splice(i, 1);
        j.fn();
      }
    }
  }

  updatePlayer(p, cmd, frozen) {
    if (!p.alive) {
      if (frozen) return;
      p.respawnT -= DT;
      if (p.respawnT <= 0 && this.phase === 'play') this.spawnPlayer(p);
      return;
    }
    p.aim = typeof cmd.aim === 'number' && isFinite(cmd.aim) ? cmd.aim : p.aim;
    if (frozen) {
      p.facing = Math.cos(p.aim) >= 0 ? 1 : -1;
      p.vx = 0;
      p.invuln = Math.max(p.invuln, 0.5);
      return;
    }
    if (p.downed) {
      // knocked down: can only wait for a friend (or bleed out)
      p.bleed -= DT;
      DOWN_CMD.aim = p.aim;
      stepMovement(p, DOWN_CMD, this.phys, DT, p.fx);
      if (p.bleed <= 0) this.bleedOut(p);
      return;
    }
    if (p.invuln > 0) p.invuln -= DT;
    if (p.cd > 0) p.cd -= DT;
    if (p.meleeCd > 0) p.meleeCd -= DT;
    if (p.meleeT > 0) p.meleeT -= DT;
    if (p.comboT > 0) p.comboT -= DT; else p.combo = 0;
    if (p.tauntCd > 0) p.tauntCd -= DT;
    if (p.counterT > 0) p.counterT -= DT;
    if (p.rl > 0) {
      p.rl -= DT;
      if (p.rl <= 0) { p.rl = 0; p.mag = PLAYER.mag; }
    }
    const bombCap = PLAYER.bombs + (p.perks.ink ? 1 : 0);
    if (p.bombs < bombCap) {
      p.bombT -= DT;
      if (p.bombT <= 0) { p.bombs++; p.bombT = bombRecharge(p, PLAYER); }
    }
    if (p.railT > 0) {
      p.railT -= DT;
      if (p.railT <= 0) {
        p.railT = 0;
        const sh = shoulderOf(p);
        this.fireRail(p, WEAPONS.rail, p.railSeq, sh, Math.cos(p.aim), Math.sin(p.aim));
        applyRecoil(p, 'rail');
        if (p.heavy === 'rail' && p.heavyAmmo <= 0) this.dropEmpty(p);
      }
    }

    if (cmd.superP && p.super >= PLAYER.superMax && p.superT <= 0) this.startSuper(p);

    const fx = p.fx;
    stepMovement(p, cmd, this.phys, DT, fx);
    if (fx.jump) this.emit({ t: 'jump', id: p.id });
    if (fx.djump) this.emit({ t: 'jump', id: p.id, d: 1 });
    if (fx.dash) this.emit({ t: 'dash', id: p.id, dir: p.dashDir });
    if (fx.land) this.emit({ t: 'land', id: p.id, v: Math.round(fx.land) });
    if (fx.superBlast) this.superBlast(p);

    // safety net: anyone outside every panel and passage goes back in
    if (this.tick % 20 === p.id % 20 && !this.inPlayArea(p)) {
      p.outT = (p.outT || 0) + 20;
      if (p.outT > 30) this.rescue(p);
    } else if (this.tick % 20 === p.id % 20) p.outT = 0;

    // reviving a buddy
    if (p.revTarget != null) {
      const d = this.players.get(p.revTarget);
      if (!d || !d.downed || Math.hypot(d.x - p.x, d.y - p.y) > 95) {
        if (d) d.rev = 0;
        p.revTarget = null;
        p.revT = 0;
      } else {
        p.revT += DT;
        d.rev = p.revT / PLAYER.reviveTime;
        if (p.revT >= PLAYER.reviveTime) this.revive(d, p);
      }
    }

    if (p.superT > 0 || !p.alive) return;
    const seq = p.bot ? ++p.botSeq : cmd.seq;

    if (cmd.swapP && p.heavy && p.railT <= 0) {
      p.slot = p.slot === 1 ? 0 : 1;
      p.cd = Math.max(p.cd, 0.15);
      this.emit({ t: 'swap', id: p.id, w: weaponOf(p) });
    }
    if (cmd.reloadP && weaponOf(p) === 'pistol' && p.mag < PLAYER.mag && p.rl <= 0) this.startReload(p);
    if (cmd.fire) this.tryFire(p, seq);
    if (cmd.meleeP && p.meleeCd <= 0) this.punch(p, seq);
    if (cmd.bombP && p.bombs > 0) this.throwBomb(p, seq);
    if (cmd.interactP) this.interact(p);
    if (cmd.tauntP && p.tauntCd <= 0) {
      p.tauntCd = 2.5;
      this.emit({ t: 'taunt', id: p.id, text: TAUNTS[Math.floor(this.rng.f() * TAUNTS.length)] });
    }
    this.touchPickups(p, cmd);
  }

  inPlayArea(p) {
    const lv = this.level;
    if (findPanel(lv, p.x, p.y - 4, 2)) return true;
    for (const l of lv.links) {
      if (p.x > l.x1 - 30 && p.x < l.x2 + 30 && p.y > l.y1 - 30 && p.y < l.y2 + 30) return true;
    }
    return false;
  }

  rescue(p) {
    let best = null, bd = Infinity;
    for (const s of this.level.spawns) {
      if (this.mode === MODES.STORY && this.panelState[s.panel] === 'locked') continue;
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return;
    p.x = best.x;
    p.y = best.y;
    p.vx = 0;
    p.vy = 0;
    p.climb = false;
    p.outT = 0;
    this.emit({ t: 'spawn', id: p.id, x: r1(p.x), y: r1(p.y) });
  }

  startReload(p) {
    p.rl = reloadTime(p);
    this.emit({ t: 'reload', id: p.id });
  }

  isHostile(byKind, byId, target) {
    if (target.kind === 'e') return byKind !== 'e';
    if (byKind === 'e' || byKind === 'env') return true;
    if (byId === target.id) return false;
    return this.mode === MODES.BRAWL;
  }

  targets() {
    const out = [];
    for (const p of this.players.values()) if (p.alive && !p.downed) out.push(p);
    for (const e of this.enemies.values()) if (e.st === 'active' || (this.chaos && e.st === 'asleep')) out.push(e);
    return out;
  }

  panelOfPoint(x, y) {
    return findPanel(this.level, x, y, 2);
  }

  // Guns are loud: firing in a silent panel raises the alarm.
  noise(x, y) {
    if (this.mode !== MODES.STORY) return;
    const P = this.panelOfPoint(x, y - 20);
    if (!P || P.beat !== 'silent' || this.alarms.has(P.id) || this.panelState[P.id] !== 'active') return;
    let near = null, nd = Infinity;
    for (const e of this.enemies.values()) {
      if (e.panel !== P.id || e.st !== 'active') continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < nd) { nd = d; near = e; }
    }
    this.alarm(P.id, near);
  }

  alarm(panel, by) {
    if (this.alarms.has(panel)) return;
    this.alarms.add(panel);
    for (const e of this.enemies.values()) {
      if (e.panel !== panel || e.aware) continue;
      e.aware = true;
      e.susp = 0;
      if (e.st === 'active' && e !== by && e.staggerT <= 0) { e.act = ACT.alert; e.actT = 0.45 + this.rng.f() * 0.3; }
    }
    if (by) {
      by.act = ACT.alert;
      by.actT = 0.5;
      callout(this, by, 'spotted', true);
    }
    this.emit({ t: 'alarm', panel, id: by ? by.id : null });
  }

  style(p, k, mul = 1) {
    if (!p || p.kind !== 'p') return;
    const v = SUPER.style[k] * mul * (p.perks.speed ? 1.3 : 1);
    p.super = Math.min(PLAYER.superMax, p.super + v);
    this.emit({ t: 'style', id: p.id, k, v: Math.round(v) });
  }

  // ---------------------------------------------------------------- weapons

  tryFire(p, seq) {
    const wk = weaponOf(p);
    const W = WEAPONS[wk];
    if (p.cd > 0 || p.railT > 0) return;
    if (wk === 'pistol') {
      if (p.rl > 0) return;
      if (p.mag <= 0) { this.startReload(p); return; }
      p.mag--;
    } else if (W.ammo > 0) {
      if (p.heavyAmmo <= 0) { this.dropEmpty(p); return; }
      p.heavyAmmo--;
    }
    p.cd = W.rate;
    const sh = shoulderOf(p);
    const ca = Math.cos(p.aim), sa = Math.sin(p.aim);

    if (W.charge) {
      p.railT = W.charge;
      p.railSeq = seq;
      this.emit({ t: 'charge', id: p.id, w: wk, seq });
      this.noise(p.x, p.y);
      return;
    }
    if (W.melee) this.swingBlade(p, W, seq, sh, ca, sa);
    else {
      let mx = sh.x + ca * W.len, my = sh.y + sa * W.len;
      const block = raycast(this.phys, sh.x, sh.y, mx, my);
      if (block) { mx = sh.x + ca * (W.len * block.t - 3); my = sh.y + sa * (W.len * block.t - 3); }
      const pr = [];
      for (let i = 0; i < W.pellets; i++) {
        const ang = p.aim + (hash01(p.id, seq, i, 1) - 0.5) * 2 * W.spread;
        const spd = W.speed * (1 + (hash01(p.id, seq, i, 2) - 0.5) * (W.speedVar || 0));
        const id = p.id + '_' + seq + '_' + i;
        const proj = {
          id, k: W.proj, o: p.id, ok: 'p', x: mx, y: my,
          vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, grav: W.grav || 0,
          dmg: W.dmg, life: W.life, r: PROJ_RADIUS[W.proj], knock: W.knock, w: wk,
          word: W.proj === 'word' ? W.ammoWords[Math.floor(hash01(p.id, seq, 7) * W.ammoWords.length)] : null,
        };
        this.projectiles.set(id, proj);
        pr.push(projInfo(proj));
      }
      this.emit({ t: 'shot', o: p.id, w: wk, x: r1(mx), y: r1(my), a: r2(p.aim), seq, pr });
      this.noise(p.x, p.y);
    }
    applyRecoil(p, wk);
    if (wk !== 'pistol' && W.ammo > 0 && p.heavyAmmo <= 0) this.dropEmpty(p);
  }

  dropEmpty(p) {
    this.emit({ t: 'empty', id: p.id, w: p.heavy });
    p.heavy = null;
    p.heavyAmmo = 0;
    p.slot = 0;
  }

  fireRail(p, W, seq, sh, ca, sa) {
    const x2 = sh.x + ca * W.range, y2 = sh.y + sa * W.range;
    const wall = raycast(this.phys, sh.x, sh.y, x2, y2);
    const endT = wall ? wall.t : 1;
    const dx = x2 - sh.x, dy = y2 - sh.y;
    const hits = [];
    for (const t of this.targets()) {
      if (!this.isHostile('p', p.id, t)) continue;
      const h = segRect(sh.x, sh.y, dx, dy, t.x - t.w / 2 - 6, t.y - t.h - 6, t.w + 12, t.h + 12);
      if (h && h.t < endT) hits.push({ t, at: h.t });
    }
    hits.sort((a, b) => a.at - b.at);
    let dmg = W.dmg;
    for (const h of hits) {
      const hx = sh.x + dx * h.at, hy = sh.y + dy * h.at;
      const crit = hy < h.t.y - h.t.h * 0.76;
      this.hurt(h.t, dmg * (crit ? W.crit : 1), { by: p.id, byKind: 'p', w: 'rail', x: hx, y: hy, kx: ca * W.knock, ky: sa * W.knock - 120, crit, poise: W.poise, dirx: ca, diry: sa });
      dmg *= W.pierceFalloff;
    }
    for (const sw of this.switches) {
      if (sw.done) continue;
      const h = segRect(sh.x, sh.y, dx, dy, sw.x - 20, sw.y - 20, 40, 40);
      if (h && h.t < endT) this.hitSwitch(sw, p);
    }
    if (wall && wall.rect.prop) this.damageProp(this.props.get(wall.rect.prop), W.dmg, { by: p.id, byKind: 'p', w: 'rail' });
    const ex = sh.x + dx * endT, ey = sh.y + dy * endT;
    this.emit({ t: 'beam', o: p.id, x0: r1(sh.x + ca * W.len), y0: r1(sh.y + sa * W.len), x1: r1(ex), y1: r1(ey), seq, wall: !!wall });
  }

  swingBlade(p, W, seq, sh, ca, sa) {
    let hitAny = false;
    for (const t of this.targets()) {
      if (!this.isHostile('p', p.id, t)) continue;
      const tx = t.x, ty = t.y - t.h / 2;
      const d = Math.hypot(tx - sh.x, ty - sh.y) - Math.min(t.w, t.h) / 2;
      if (d > W.range) continue;
      const diff = angDiff(Math.atan2(ty - sh.y, tx - sh.x), p.aim);
      if (Math.abs(diff) > W.arc) continue;
      if (t.kind === 'e' && this.tryTakedown(p, t)) { hitAny = true; continue; }
      if (this.hurt(t, W.dmg, { by: p.id, byKind: 'p', w: 'blade', x: tx - ca * t.w * 0.3, y: ty, kx: ca * W.knock, ky: sa * W.knock - 180, melee: true, stun: 0.12, poise: W.poise, shieldDmg: 45, dirx: Math.sign(tx - p.x) || ca, diry: 0 })) hitAny = true;
    }
    this.deflect(p, sh, W.range + 30, W.arc + 0.25, ca, sa, true);
    for (const pr of this.props.values()) {
      if (pr.dead || pr.k === 'table' && pr.st === 'up') continue;
      const d = Math.hypot(pr.x + pr.w / 2 - sh.x, pr.y + pr.h / 2 - sh.y);
      if (d < W.range + 20 && Math.abs(angDiff(Math.atan2(pr.y + pr.h / 2 - sh.y, pr.x + pr.w / 2 - sh.x), p.aim)) < W.arc) this.damageProp(pr, W.dmg, { by: p.id, byKind: 'p', w: 'blade' });
    }
    for (const sw of this.switches) {
      if (!sw.done && Math.hypot(sw.x - sh.x, sw.y - sh.y) < W.range + 10 && Math.abs(angDiff(Math.atan2(sw.y - sh.y, sw.x - sh.x), p.aim)) < W.arc) this.hitSwitch(sw, p);
    }
    p.meleeT = 0.22;
    this.emit({ t: 'slash', o: p.id, a: r2(p.aim), x: r1(sh.x), y: r1(sh.y), seq, hit: hitAny });
  }

  // Bat enemy projectiles back where they came from.
  deflect(p, sh, range, arc, ca, sa, all) {
    let n = 0;
    for (const pr of this.projectiles.values()) {
      if (pr.o === p.id || pr.k === 'bomb') continue;
      if (pr.ok === 'p' && this.mode !== MODES.BRAWL) continue;
      if (!all && !SLOW_SHOTS.has(pr.k)) continue;
      const d = Math.hypot(pr.x - sh.x, pr.y - sh.y);
      if (d > range) continue;
      if (arc < Math.PI && Math.abs(angDiff(Math.atan2(pr.y - sh.y, pr.x - sh.x), p.aim)) > arc) continue;
      const spd = pr.k === 'egren' ? 760 : Math.max(900, Math.hypot(pr.vx, pr.vy) * 1.3);
      pr.vx = ca * spd;
      pr.vy = sa * spd - (pr.k === 'egren' ? 220 : 0);
      if (pr.k !== 'egren') pr.grav = 0;
      pr.o = p.id;
      pr.ok = 'p';
      pr.dmg = Math.round(pr.dmg * 1.6);
      pr.life = Math.max(pr.life, 1.4);
      this.emit({ t: 'deflect', id: pr.id, o: p.id, x: r1(pr.x), y: r1(pr.y), vx: r1(pr.vx), vy: r1(pr.vy) });
      n++;
    }
    if (n) this.style(p, 'deflect');
    return n;
  }

  // Silent panels: a punch or slash on an unaware guard from behind or above.
  tryTakedown(p, t) {
    if (t.aware || t.st !== 'active' || t.k === 'boss' || t.k === 'brute' || t.elite) return false;
    const behind = Math.sign(p.x - t.x) === -t.facing;
    const above = p.y < t.y - t.h * 0.55 && !p.onGround;
    if (!behind && !above) return false;
    this.emit({ t: 'takedown', id: t.id, by: p.id, x: r1(t.x), y: r1(t.y - t.h * 0.6) });
    this.style(p, 'takedown');
    t.hp = 0;
    this.kill(t, { by: p.id, byKind: 'p', w: 'takedown', melee: true, silent: true });
    return true;
  }

  punch(p, seq) {
    p.meleeCd = PUNCH.rate;
    p.meleeT = 0.2;
    p.combo = p.comboT > 0 && p.combo < 3 ? p.combo + 1 : 1;
    p.comboT = PUNCH.comboWindow;
    const step = PUNCH.steps[p.combo];
    const big = p.combo === 3;
    const mul = p.perks.mighty ? 1.4 : 1;
    let counter = false;
    if (p.counterT > 0) { counter = true; p.counterT = 0; }
    const sh = shoulderOf(p);
    const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
    const hx = sh.x + ca * PUNCH.reach, hy = sh.y + sa * PUNCH.reach;
    let hit = false;
    const struck = [];
    for (const t of this.targets()) {
      if (!this.isHostile('p', p.id, t)) continue;
      const nx = clamp(hx, t.x - t.w / 2, t.x + t.w / 2), ny = clamp(hy, t.y - t.h, t.y);
      if (Math.hypot(nx - hx, ny - hy) > PUNCH.radius) continue;
      if (t.kind === 'e' && this.tryTakedown(p, t)) { hit = true; continue; }
      const K = step.knock * (counter ? 1.6 : 1);
      const dm = step.dmg * mul * (counter ? 2.5 : 1);
      if (this.hurt(t, dm, {
        by: p.id, byKind: 'p', w: big ? 'combo' : 'punch', x: nx, y: ny,
        kx: ca * K, ky: sa * K * 0.5 - step.lift, melee: true, stun: step.stun,
        poise: step.poise * mul * (counter ? 3 : 1), shieldDmg: step.shield * mul, dirx: Math.sign(t.x - p.x) || ca, diry: sa,
        above: p.y < t.y - t.h + 12, counter,
      })) { hit = true; struck.push(t); }
    }
    if (p.perks.buzzer && struck.length) {
      let chained = 0;
      const src = struck[0];
      for (const e of this.enemies.values()) {
        if (chained >= 2 || e.st !== 'active' || struck.includes(e)) continue;
        if (Math.hypot(e.x - src.x, e.y - src.y) > 180) continue;
        this.emit({ t: 'zap', x0: r1(src.x), y0: r1(src.y - src.h / 2), x1: r1(e.x), y1: r1(e.y - e.h / 2) });
        this.hurt(e, 7, { by: p.id, byKind: 'p', w: 'buzz', x: e.x, y: e.y - e.h / 2, kx: 0, ky: -80, stun: 0.3, poise: 14 });
        chained++;
      }
    }
    if (this.deflect(p, { x: hx, y: hy }, PUNCH.radius + 26, Math.PI, ca, sa, false)) hit = true;
    for (const pr of this.props.values()) {
      if (pr.dead || (pr.k === 'table' && pr.st === 'up')) continue;
      const nx = clamp(hx, pr.x, pr.x + pr.w), ny = clamp(hy, pr.y, pr.y + pr.h);
      if (Math.hypot(nx - hx, ny - hy) <= PUNCH.radius) this.damageProp(pr, big ? 40 : 22, { by: p.id, byKind: 'p', w: 'punch' });
    }
    for (const sw of this.switches) if (!sw.done && Math.hypot(sw.x - hx, sw.y - hy) < 44) this.hitSwitch(sw, p);
    this.emit({ t: 'punch', o: p.id, a: r2(p.aim), x: r1(hx), y: r1(hy), big, n: p.combo, hit, seq, c: counter ? 1 : undefined });
  }

  throwBomb(p, seq) {
    p.bombs--;
    if (p.bombs < PLAYER.bombs + (p.perks.ink ? 1 : 0) && p.bombT <= 0) p.bombT = bombRecharge(p, PLAYER);
    const sh = shoulderOf(p);
    const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
    let x = sh.x + ca * 22, y = sh.y + sa * 22;
    if (raycast(this.phys, sh.x, sh.y, x, y)) { x = sh.x; y = sh.y; }
    const id = p.id + '_' + seq + '_b';
    const proj = {
      id, k: 'bomb', o: p.id, ok: 'p', x, y,
      vx: ca * BOMB.speed + p.vx * 0.4, vy: sa * BOMB.speed + p.vy * 0.3 - 140, grav: BOMB.grav,
      dmg: BOMB.dmg, life: BOMB.fuse + 0.2, fuse: BOMB.fuse, r: PROJ_RADIUS.bomb, knock: BOMB.knock, w: 'bomb', bounce: BOMB.bounce,
    };
    this.projectiles.set(id, proj);
    this.emit({ t: 'shot', o: p.id, w: 'bomb', x: r1(x), y: r1(y), a: r2(p.aim), seq, pr: [projInfo(proj)] });
  }

  startSuper(p) {
    p.super = 0;
    p.superT = SUPER.windup;
    p.invuln = Math.max(p.invuln, SUPER.windup + 0.4);
    p.vy = -300;
    this.emit({ t: 'super', id: p.id, ph: 0, x: r1(p.x), y: r1(p.y - p.h / 2) });
  }

  superBlast(p) {
    const x = p.x, y = p.y - p.h / 2;
    this.emit({ t: 'super', id: p.id, ph: 1, x: r1(x), y: r1(y) });
    this.explode(x, y, SUPER.radius, SUPER.dmg, SUPER.knock, { by: p.id, byKind: 'p', w: 'super', kind: 'super', selfMul: 0, poise: 200 });
    for (const e of this.enemies.values()) {
      if (e.st === 'active' && Math.hypot(e.x - x, e.y - y) < SUPER.radius * 1.3) e.stunT = Math.max(e.stunT, 1.2);
    }
  }

  enemyShot(e, kind, ang, fromY) {
    const S = ENEMY_SHOTS[kind];
    const id = 'e' + this.nextShot++;
    const sx = e.x + Math.cos(ang) * (e.w * 0.6);
    const sy = e.y - (fromY != null ? fromY : e.h * 0.72) + Math.sin(ang) * 10;
    const proj = {
      id, k: kind, o: e.id, ok: 'e', x: sx, y: sy,
      vx: Math.cos(ang) * S.speed, vy: Math.sin(ang) * S.speed, grav: S.grav || 0,
      dmg: S.dmg * (e.dmgMul || 1), life: S.life, r: S.r, knock: S.knock, w: kind,
    };
    this.projectiles.set(id, proj);
    this.emit({ t: 'eshot', o: e.id, k: kind, x: r1(sx), y: r1(sy), pr: [projInfo(proj)] });
  }

  // Grenadiers lob a timed bomb that lands where you're standing.
  lobGrenade(e, t) {
    const zombie = this.theme.key === 'zombie';
    const kind = zombie ? 'acid' : 'egren';
    const S = ENEMY_SHOTS[kind];
    const sx = e.x + e.facing * 14, sy = e.y - e.h * 0.9;
    const tx = t.x + (t.vx || 0) * 0.3, ty = t.y - 12;
    const G = S.grav;
    const dx = tx - sx, dy = ty - sy;
    const T = clamp(Math.abs(dx) / 430, 0.55, 1.25);
    const vx = dx / T, vy = (dy - 0.5 * G * T * T) / T;
    const id = 'e' + this.nextShot++;
    const w = zombie ? 'bile' : this.theme.key === 'noir' ? 'molotov' : this.theme.key === 'space' ? 'plasma' : 'grenade';
    const proj = {
      id, k: kind, o: e.id, ok: 'e', x: sx, y: sy, vx, vy, grav: G,
      dmg: (zombie ? 14 : S.dmg) * (e.dmgMul || 1), life: zombie ? 3 : S.life, r: S.r, knock: S.knock, w,
    };
    if (!zombie) { proj.fuse = S.fuse; proj.bounce = S.bounce; }
    this.projectiles.set(id, proj);
    this.emit({ t: 'eshot', o: e.id, k: kind, x: r1(sx), y: r1(sy), pr: [projInfo(proj)] });
  }

  shockwave(e, radius, dmg, knock) {
    const x = e.x, y = e.y;
    this.emit({ t: 'quake', id: e.id, x: r1(x), y: r1(y), r: radius });
    for (const p of this.players.values()) {
      if (!p.alive || p.downed) continue;
      const dx = p.x - x;
      if (Math.abs(dx) > radius || Math.abs(p.y - y) > 90) continue;
      if (!p.onGround && p.y < y - 30) continue; // jumped over it
      this.hurt(p, dmg, { by: e.id, byKind: 'e', w: 'quake', x: p.x, y: p.y - 20, kx: Math.sign(dx || 1) * knock, ky: -520, stun: 0.25 });
    }
  }

  summon(e, n) {
    const P = this.level.panels[e.panel];
    for (let i = 0; i < n; i++) {
      const x = clamp(e.x + (i - (n - 1) / 2) * 160 + (this.rng.f() - 0.5) * 60, P.x1 + 50, P.x2 - 50);
      const k = this.rng.f() < 0.6 ? 'grunt' : 'gunner';
      this.addEnemy({ id: this.uid++, k, x, y: P.y2, panel: e.panel, facing: this.rng.sign() }, 'drawing');
    }
  }

  // The Artist pencils a KO'd enemy back onto the page.
  redraw(artist, c) {
    let y = c.y;
    if (c.k !== 'flyer') {
      const gp = groundProbe(this.phys, { x: c.x, y: c.y - 60, w: 30 }, 900, false);
      if (gp) y = gp.y;
    }
    const e = this.addEnemy({ id: this.uid++, k: c.k, x: c.x, y, panel: artist.panel, facing: this.rng.sign() }, 'drawing');
    e.redrawn = true;
    this.emit({ t: 'redraw', id: artist.id, nid: e.id });
  }

  // ------------------------------------------------------------- projectiles

  updateProjectiles() {
    for (const pr of this.projectiles.values()) {
      pr.life -= DT;
      if (pr.fuse != null) {
        pr.fuse -= DT;
        if (pr.fuse <= 0) {
          this.projectiles.delete(pr.id);
          this.emit({ t: 'pdie', id: pr.id, x: r1(pr.x), y: r1(pr.y), why: 'fuse' });
          if (pr.k === 'egren') {
            const S = ENEMY_SHOTS.egren;
            this.explode(pr.x, pr.y, S.radius, pr.dmg, S.knock, { by: pr.o, byKind: pr.ok, w: pr.w, kind: pr.w === 'molotov' ? 'fire' : 'grenade', selfMul: EXPLOSION_SELF, poise: 50 });
          } else {
            this.explode(pr.x, pr.y, BOMB.radius, BOMB.dmg, BOMB.knock, { by: pr.o, byKind: pr.ok, w: 'bomb', kind: 'bomb', selfMul: EXPLOSION_SELF, poise: BOMB.poise });
          }
          continue;
        }
      }
      if (pr.life <= 0) {
        this.projectiles.delete(pr.id);
        this.emit({ t: 'pdie', id: pr.id, x: r1(pr.x), y: r1(pr.y), why: 'expire' });
        continue;
      }
      pr.vy += pr.grav * DT;
      const nx = pr.x + pr.vx * DT, ny = pr.y + pr.vy * DT;
      const wall = raycast(this.phys, pr.x, pr.y, nx, ny);
      let hitT = wall ? wall.t : 1;
      let hitChar = null;
      const bouncy = pr.k === 'bomb' || pr.k === 'egren';
      const dx = nx - pr.x, dy = ny - pr.y;
      if (!bouncy) {
        for (const t of this.targets()) {
          if (t.kind === 'p' && t.id === pr.o && pr.ok === 'p') continue;
          if (!this.isHostile(pr.ok, pr.o, t)) continue;
          const h = segRect(pr.x, pr.y, dx, dy, t.x - t.w / 2 - pr.r, t.y - t.h - pr.r, t.w + pr.r * 2, t.h + pr.r * 2);
          if (h && h.t < hitT) { hitT = h.t; hitChar = t; }
        }
      }
      // puzzle switches
      if (pr.ok === 'p' && !bouncy && this.switches.length) {
        let used = false;
        for (const sw of this.switches) {
          if (sw.done) continue;
          const h = segRect(pr.x, pr.y, dx, dy, sw.x - 18 - pr.r, sw.y - 18 - pr.r, 36 + pr.r * 2, 36 + pr.r * 2);
          if (h && h.t < hitT) {
            this.projectiles.delete(pr.id);
            this.emit({ t: 'pdie', id: pr.id, x: r1(pr.x + dx * h.t), y: r1(pr.y + dy * h.t), why: 'hit' });
            this.hitSwitch(sw, this.players.get(pr.o));
            used = true;
            break;
          }
        }
        if (used) continue;
      }
      const hx = pr.x + dx * hitT, hy = pr.y + dy * hitT;
      if (hitChar) {
        if (pr.k === 'word') {
          this.projectiles.delete(pr.id);
          this.emit({ t: 'pdie', id: pr.id, x: r1(hx), y: r1(hy), why: 'hit' });
          const W = WEAPONS.launcher;
          this.hurt(hitChar, 20, { by: pr.o, byKind: pr.ok, w: 'launcher', x: hx, y: hy, kx: pr.vx * 0.2, ky: -100, direct: true, poise: 20, dirx: Math.sign(pr.vx), diry: 0 });
          this.explode(hx, hy, W.radius, W.dmg, W.knock, { by: pr.o, byKind: pr.ok, w: 'launcher', kind: 'word', selfMul: EXPLOSION_SELF, poise: W.poise });
          continue;
        }
        const W = WEAPONS[pr.w];
        const crit = (pr.k === 'bullet' || pr.k === 'pellet') && hy < hitChar.y - hitChar.h * 0.77;
        const sp = Math.hypot(pr.vx, pr.vy) || 1;
        this.projectiles.delete(pr.id);
        this.emit({ t: 'pdie', id: pr.id, x: r1(hx), y: r1(hy), why: 'hit' });
        if (pr.k === 'acid' && pr.ok === 'e' && pr.w === 'bile') {
          this.explode(hx, hy, 110, pr.dmg, 260, { by: pr.o, byKind: 'e', w: 'acid', kind: 'acid', selfMul: 0 });
          continue;
        }
        this.hurt(hitChar, pr.dmg * (crit ? (W && W.crit) || 1.5 : 1), {
          by: pr.o, byKind: pr.ok, w: pr.w, x: hx, y: hy,
          kx: (pr.vx / sp) * pr.knock, ky: (pr.vy / sp) * pr.knock * 0.5 - 60, crit,
          poise: W ? W.poise : undefined, dirx: pr.vx / sp, diry: pr.vy / sp,
        });
        continue;
      }
      // near misses suppress gunners and grenadiers
      if (pr.ok === 'p' && !pr.supd && (pr.k === 'bullet' || pr.k === 'pellet')) {
        for (const e of this.enemies.values()) {
          if (e.st !== 'active' || (e.k !== 'gunner' && e.k !== 'grenadier')) continue;
          if (Math.abs(e.x - nx) > 90 || Math.abs(e.y - e.h / 2 - ny) > 90) continue;
          e.supp = Math.min(3, e.supp + (pr.w === 'smg' ? 0.35 : 0.15));
          pr.supd = true;
        }
      }
      if (wall) {
        if (bouncy) {
          pr.x = hx + wall.nx * 1.5;
          pr.y = hy + wall.ny * 1.5;
          // ink bombs stick to cracked walls: that's what they're for
          if (wall.rect.gate != null && pr.ok === 'p') {
            const gt = this.level.gates[wall.rect.gate];
            if (gt && gt.lock === 'crack') {
              pr.vx = 0; pr.vy = 0; pr.grav = 0;
              pr.fuse = Math.min(pr.fuse, 0.6);
              this.emit({ t: 'stick', id: pr.id, x: r1(pr.x), y: r1(pr.y) });
              continue;
            }
          }
          if (wall.nx) pr.vx = -pr.vx * pr.bounce;
          if (wall.ny) { pr.vy = -pr.vy * pr.bounce; pr.vx *= 0.8; }
          if (Math.abs(pr.vy) < 60 && wall.ny < 0) pr.vy = 0;
          continue;
        }
        this.projectiles.delete(pr.id);
        this.emit({ t: 'pdie', id: pr.id, x: r1(hx), y: r1(hy), why: 'wall', nx: wall.nx, ny: wall.ny });
        if (pr.k === 'word') {
          const W = WEAPONS.launcher;
          this.explode(hx + wall.nx * 8, hy + wall.ny * 8, W.radius, W.dmg, W.knock, { by: pr.o, byKind: pr.ok, w: 'launcher', kind: 'word', selfMul: EXPLOSION_SELF, poise: W.poise });
        } else if (pr.k === 'acid') {
          const bile = pr.w === 'bile';
          this.explode(hx, hy, bile ? 110 : 70, bile ? pr.dmg : 8, bile ? 260 : 200, { by: pr.o, byKind: pr.ok, w: 'acid', kind: 'acid', selfMul: 0 });
        } else if (wall.rect.prop) {
          this.damageProp(this.props.get(wall.rect.prop), pr.dmg, { by: pr.o, byKind: pr.ok, w: pr.w });
        }
        continue;
      }
      pr.x = nx;
      pr.y = ny;
    }
  }

  // ---------------------------------------------------------------- damage

  // Is this hit stopped by the enemy's shield? (frontal, not from above)
  shieldCovers(t, info) {
    if (info.explosive) return Math.sign(info.ox - t.x) === t.facing;
    if (info.above) return false;
    const dx = info.dirx || 0, dy = info.diry || 0;
    if (Math.sign(dx) !== -t.facing) return false;
    if (dy > Math.abs(dx) * 1.2) return false; // coming down over the top
    return info.y > t.y - t.h * 0.97;
  }

  hurt(t, dmg, info) {
    const attacker = info.byKind === 'p' ? this.players.get(info.by) : null;
    if (t.kind === 'p') {
      if (!t.alive || t.downed || t.invuln > 0) return false;
      if (t.iframes > 0 && !info.explosive) {
        this.emit({ t: 'dodge', id: t.id, x: r1(t.x), y: r1(t.y - t.h * 0.6) });
        if (t.perks.selfdef && info.byKind === 'e') {
          t.counterT = 1.6;
          t.dashCd = 0;
          this.emit({ t: 'counter', id: t.id });
        }
        return false;
      }
      if (info.byKind === 'p' && info.by === t.id && info.w === 'super') return false;
    } else {
      if (t.st === 'asleep' && this.chaos) {
        t.st = 'waking';
        t.wakeT = 0.05;
        return false;
      }
      if (t.st !== 'active') return false;
      if (t.downedZ) {
        // a downed zombie: any hit finishes it
        t.hp = 0;
        this.emit({ t: 'hit', id: t.id, tt: 'e', x: r1(info.x), y: r1(info.y), d: Math.max(1, Math.round(dmg)), c: 0, w: info.w, by: info.by, bk: info.byKind, kx: 0, ky: 0, big: false, ex: info.explosive ? 1 : 0 });
        this.kill(t, { ...info, finisher: true });
        return true;
      }
      if (!t.aware && info.byKind === 'p') this.alarm(t.panel, t);
      const perks = attacker ? attacker.perks : NO_PERKS;
      const poiseDmg = info.poise != null ? info.poise : info.explosive ? dmg * 1.1 : info.melee ? dmg * 1.2 : dmg * 0.45;
      // ---- frontal shield ----
      if (t.shieldUp && info.byKind === 'p' && this.shieldCovers(t, info)) {
        const sd = info.w === 'rail' ? 9999 : info.melee ? (info.shieldDmg != null ? info.shieldDmg : dmg * 2) : info.explosive ? dmg * 0.6 : dmg * 0.35;
        t.shieldHp -= sd;
        t.shieldT = 0;
        if (t.shieldHp <= 0) this.breakShield(t, attacker);
        else {
          t.poise -= poiseDmg * 0.4;
          t.poiseT = 0;
          this.emit({ t: 'block', id: t.id, x: r1(info.x), y: r1(info.y), m: info.melee ? 1 : 0 });
          if (!info.explosive) {
            t.vx += (info.kx || 0) * 0.25 * t.knockMul;
            if (t.poise <= 0) this.stagger(t, 1.0, attacker);
            return true;
          }
          dmg *= 0.5;
        }
      }
      // ---- energy shield ----
      if (t.esh > 0 && info.byKind === 'p') {
        const eff = info.w === 'rail' ? 100 : info.melee ? 3 : 1;
        const need = t.esh / eff;
        t.eshT = 0;
        if (dmg <= need) {
          t.esh -= dmg * eff;
          t.poise -= poiseDmg * 0.3;
          t.poiseT = 0;
          this.emit({ t: 'eshit', id: t.id, x: r1(info.x), y: r1(info.y) });
          if (t.poise <= 0) this.stagger(t, 1.0, attacker);
          return true;
        }
        dmg -= need;
        t.esh = 0;
        this.emit({ t: 'eshpop', id: t.id, x: r1(t.x), y: r1(t.y - t.h / 2) });
      }
      // ---- damage multipliers ----
      if (t.staggerT > 0) dmg *= 1.5 + (perks.hypno ? 0.25 : 0) + (perks.xray ? 0.3 : 0);
      else if (t.k === 'boss') dmg *= 0.35;
      else if (t.k === 'brute' && !(t.stunT > 0)) dmg *= 0.8;
      if (t.launched || t.downT > 0) dmg *= 1.15;
      if (info.crit && perks.decoder) dmg *= 1.25;
    }
    let d = Math.max(1, Math.round(dmg));
    if (t.kind === 'p' && this.mode === MODES.STORY && info.byKind === 'e') d = Math.max(1, Math.round(d * (1 - 0.08 * (this.humans - 1))));
    t.hp -= d;
    const km = t.kind === 'e' ? t.knockMul * (t.staggerT > 0 ? 1.6 : 1) : 1;
    const kx = (info.kx || 0) * km, ky = (info.ky || 0) * km;
    t.vx += kx;
    t.vy += ky;
    let staggered = false;
    if (t.kind === 'p') {
      if (t.onGround && Math.abs(info.kx || 0) > 250 && (info.ky || 0) > -150) t.vy = Math.min(t.vy, -170);
      if (info.stun) t.stun = Math.max(t.stun, info.stun);
      if (t.climb && Math.abs(info.kx || 0) > 300) t.climb = false;
      t.lastBy = info.by;
      t.lastByKind = info.byKind;
    } else {
      t.hurtT = 0.2;
      const perks = attacker ? attacker.perks : NO_PERKS;
      if (info.stun && t.k !== 'boss' && t.staggerT <= 0) t.stunT = Math.max(t.stunT, info.stun * (t.k === 'brute' ? 0.3 : 1));
      if (Math.abs(kx) >= 360 && t.k !== 'boss') {
        t.flungT = 0.5;
        t.flungBy = info.byKind === 'p' ? info.by : null;
      }
      if (ky < -480 && t.k !== 'boss' && !t.flying) {
        if (t.launched && attacker) this.style(attacker, 'launch');
        t.launched = true;
        t.airT = 0;
        t.onGround = false;
        releaseCover(this, t);
      }
      if (info.byKind === 'p' || info.byKind === 'env') {
        const pd = (info.poise != null ? info.poise : info.explosive ? dmg * 1.1 : info.melee ? dmg * 1.2 : dmg * 0.45) * (perks.mighty && info.melee ? 1.4 : 1);
        t.poise -= pd;
        t.poiseT = 0;
        if (t.poise <= 0 && t.staggerT <= 0 && t.hp > 0) {
          this.stagger(t, t.k === 'boss' ? 2.4 : t.k === 'brute' ? 1.8 : 1.2, attacker, info.melee || info.explosive || info.w === 'rail' || info.w === 'splat' ? 1 : 0.35);
          staggered = true;
        }
      }
      if (t.act === ACT.cover && info.explosive) { releaseCover(this, t); t.act = ACT.idle; }
    }
    const big = d >= 25 || info.w === 'combo' || info.w === 'super';
    this.emit({
      t: 'hit', id: t.id, tt: t.kind, x: r1(info.x), y: r1(info.y), d, c: info.crit ? 1 : 0,
      w: info.w, by: info.by, bk: info.byKind, kx: Math.round(kx), ky: Math.round(ky), big,
      ex: info.explosive ? 1 : 0, st: staggered ? 1 : undefined,
    });
    if (attacker && attacker !== t) {
      attacker.dmg += d;
      attacker.score += d;
      if (info.w !== 'super') {
        attacker.super = Math.min(PLAYER.superMax, attacker.super + d * SUPER.chargePerDmg * (attacker.perks.speed ? 1.3 : 1));
        if (info.crit && t.kind === 'e') this.style(attacker, 'headshot');
      }
    }
    if (t.hp <= 0) this.kill(t, info);
    return true;
  }

  stagger(e, dur, attacker, styleMul = 1) {
    if (e.staggerT > 0 || e.st !== 'active') return;
    if (attacker && attacker.perks.hypno) dur *= 1.5;
    e.staggerT = dur;
    e.poise = 0;
    e.stunT = 0;
    e.act = ACT.stagger;
    e.actT = dur;
    releaseCover(this, e);
    const sq = this.squads.get(e.panel);
    if (sq) sq.tokens.delete(e.id);
    this.emit({ t: 'stagger', id: e.id, x: r1(e.x), y: r1(e.y - e.h * 0.8), by: attacker ? attacker.id : null, boss: e.k === 'boss' ? 1 : undefined, d: r1(dur) });
    if (attacker) this.style(attacker, 'stagger', styleMul);
  }

  breakShield(e, attacker) {
    e.shieldUp = false;
    e.shieldHp = 0;
    e.shieldT = 0;
    this.emit({ t: 'shieldbreak', id: e.id, x: r1(e.x + e.facing * e.w * 0.6), y: r1(e.y - e.h * 0.55), k: e.shieldKind });
    this.stagger(e, 1.0, attacker);
  }

  wallSplat(e, vx) {
    const by = e.flungBy != null ? this.players.get(e.flungBy) : null;
    e.flungT = 0;
    const dir = Math.sign(vx);
    this.emit({ t: 'splat', id: e.id, x: r1(e.x + dir * e.w / 2), y: r1(e.y - e.h * 0.55), dir });
    if (by) this.style(by, 'splat');
    this.hurt(e, 18, { by: by ? by.id : null, byKind: by ? 'p' : 'env', w: 'splat', x: e.x + dir * e.w / 2, y: e.y - e.h * 0.55, kx: 0, ky: -60, poise: 45 });
    e.vx = -dir * 140;
  }

  zombieRise(e) {
    e.downedZ = false;
    e.rose = true;
    e.h = e.baseH;
    e.hp = Math.round(e.maxHp * 0.45);
    e.poise = e.maxPoise;
    e.act = ACT.getup;
    e.actT = 0.5;
    this.emit({ t: 'rise', id: e.id, x: r1(e.x), y: r1(e.y - e.h / 2) });
  }

  kill(t, info) {
    const killer = info.byKind === 'p' ? this.players.get(info.by) : null;
    if (t.kind === 'p') {
      // co-op story: go down and wait for a friend instead of dying outright
      if (this.mode === MODES.STORY && info.w !== 'bleed' && [...this.players.values()].some((o) => o !== t && o.alive && !o.downed)) {
        this.down(t, info);
        return;
      }
      t.alive = false;
      t.downed = false;
      t.hp = 0;
      t.deaths++;
      t.climb = false;
      t.superT = 0;
      t.railT = 0;
      t.revTarget = null;
      t.respawnT = this.mode === MODES.BRAWL ? PLAYER.respawnBrawl : PLAYER.respawnStory;
      if (killer && killer !== t) {
        killer.kills++;
        killer.score += 100;
        if (info.w !== 'super') killer.super = Math.min(PLAYER.superMax, killer.super + 10);
      }
      if (t.heavy && this.mode === MODES.BRAWL) this.dropPickup('weapon', t.heavy, t.x, t.y - 40, t.heavyAmmo);
      if (t.hasKey) { t.hasKey = false; this.dropPickup('key', null, t.x, t.y - 40); }
      t.heavy = null;
      t.heavyAmmo = 0;
      t.slot = 0;
      this.emit({ t: 'kill', id: t.id, tt: 'p', by: info.by, bk: info.byKind, w: info.w, x: r1(t.x), y: r1(t.y - t.h / 2), vx: Math.round(t.vx), vy: Math.round(t.vy) });
      return;
    }
    // horror genre: the dead get back up unless you do it properly
    if (this.theme.key === 'zombie' && ZOMBIE_RISERS.has(t.k) && !t.rose && !t.downedZ && !info.finisher &&
      !(info.crit || info.melee || info.explosive || info.w === 'splat' || info.w === 'super')) {
      t.downedZ = true;
      t.hp = 1;
      t.riseT = 2.8;
      t.h = 34;
      t.staggerT = 0;
      t.launched = false;
      releaseCover(this, t);
      t.h = 34;
      const sq = this.squads.get(t.panel);
      if (sq) sq.tokens.delete(t.id);
      this.emit({ t: 'zdown', id: t.id, x: r1(t.x), y: r1(t.y), by: info.by });
      return;
    }
    t.st = 'dead';
    this.enemies.delete(t.id);
    releaseCover(this, t);
    const sq = squadOf(this, t.panel);
    sq.tokens.delete(t.id);
    if (sq.diver === t.id) sq.diver = null;
    if (t.k !== 'boss' && t.k !== 'artist' && !t.elite && !t.redrawn) sq.corpses.push({ k: t.k, x: t.x, y: t.y });
    if (killer) {
      killer.kills++;
      killer.score += ENEMY_STATS[t.k].score * 10;
      if (info.w !== 'super' && info.w !== 'takedown') this.style(killer, info.melee ? 'meleeKill' : 'kill');
    }
    this.emit({ t: 'kill', id: t.id, tt: 'e', by: info.by, bk: info.byKind, w: info.w, x: r1(t.x), y: r1(t.y - t.h / 2), vx: Math.round(t.vx), vy: Math.round(t.vy), k: t.k, s: info.silent ? 1 : undefined });
    if (t.look && t.look.bloat && t.k === 'brute') {
      const x = t.x, y = t.y - t.h / 2;
      this.pending.push({ t: 0.1, fn: () => this.explode(x, y, 150, 20, 500, { by: t.id, byKind: 'e', w: 'acid', kind: 'acid', selfMul: 0 }) });
    }
    if (t.carry === 'key') this.dropPickup('key', null, t.x, t.y - 40);
    const roll = this.rng.f();
    const scarce = this.theme.key === 'zombie' ? 0.5 : 1;
    if (t.k === 'brute' || t.elite) {
      this.dropPickup('weapon', HEAVY_KEYS[Math.floor(this.rng.f() * HEAVY_KEYS.length)], t.x, t.y - 40);
      if (t.elite) this.dropPickup('health', null, t.x + 40, t.y - 40);
    } else if (t.k !== 'boss' && !t.redrawn) {
      if (roll < 0.13) this.dropPickup('health', null, t.x, t.y - 40);
      else if (roll < 0.2) this.dropPickup('bomb', null, t.x, t.y - 40);
      else if (roll < 0.2 + 0.035 * scarce) this.dropPickup('weapon', HEAVY_KEYS[Math.floor(this.rng.f() * HEAVY_KEYS.length)], t.x, t.y - 40);
    }
  }

  down(p, info) {
    p.downed = true;
    p.hp = 0;
    p.bleed = PLAYER.bleedout;
    p.rev = 0;
    p.climb = false;
    p.superT = 0;
    p.railT = 0;
    p.stun = 0;
    p.revTarget = null;
    p.dashT = 0;
    this.emit({ t: 'down', id: p.id, x: r1(p.x), y: r1(p.y - p.h / 2), by: info.by, bk: info.byKind, w: info.w });
  }

  bleedOut(p) {
    p.downed = false;
    this.kill(p, { by: p.lastBy, byKind: p.lastByKind || 'env', w: 'bleed' });
  }

  revive(p, by) {
    p.downed = false;
    p.hp = Math.round(p.maxHp * 0.4);
    p.invuln = 1.5;
    p.rev = 0;
    by.revTarget = null;
    by.revT = 0;
    this.emit({ t: 'revive', id: p.id, by: by.id, x: r1(p.x), y: r1(p.y - p.h / 2) });
  }

  explode(x, y, radius, dmg, knock, info) {
    this.emit({ t: 'boom', x: r1(x), y: r1(y), r: radius, k: info.kind, by: info.by, bk: info.byKind });
    for (const t of this.targets()) {
      const self = t.kind === 'p' && info.byKind === 'p' && info.by === t.id;
      if (!self && !this.isHostile(info.byKind, info.by, t)) continue;
      if (self && !info.selfMul) continue;
      const cx = t.x, cy = t.y - t.h / 2;
      const nx = clamp(x, t.x - t.w / 2, t.x + t.w / 2), ny = clamp(y, t.y - t.h, t.y);
      const d = Math.hypot(nx - x, ny - y);
      if (d > radius) continue;
      let f = 1 - (d / radius) * 0.65;
      const los = raycast(this.phys, x, y, cx, cy, (r) => !r.prop);
      if (los && los.t < 0.9) f *= 0.3;
      let ux = cx - x, uy = cy - y;
      const len = Math.hypot(ux, uy) || 1;
      ux /= len;
      uy = uy / len - 0.45;
      const dm = dmg * f * (self ? info.selfMul : 1);
      this.hurt(t, dm, {
        by: info.by, byKind: info.byKind, w: info.w, x: cx, y: cy, kx: ux * knock * f, ky: uy * knock * f,
        explosive: true, stun: info.kind === 'super' ? 0.5 : 0, poise: info.poise != null ? info.poise * f : undefined, ox: x,
      });
    }
    // everybody else scrambles out of cover
    for (const e of this.enemies.values()) {
      if (e.cover && Math.hypot(e.x - x, e.y - y) < radius + 140) { releaseCover(this, e); e.coverCd = 2; if (e.act === ACT.cover) e.act = ACT.idle; }
    }
    for (const pr of this.props.values()) {
      if (pr.dead) continue;
      const nx = clamp(x, pr.x, pr.x + pr.w), ny = clamp(y, pr.y, pr.y + pr.h);
      const d = Math.hypot(nx - x, ny - y);
      if (d > radius) continue;
      this.damageProp(pr, dmg * (1 - (d / radius) * 0.5), info);
    }
    // cracked walls only give way to something explosive
    for (const g of this.level.gates) {
      if (g.lock !== 'crack' || this.gatesOpen.has(g.id)) continue;
      const nx = clamp(x, g.x, g.x + g.w), ny = clamp(y, g.y, g.y + g.h);
      if (Math.hypot(nx - x, ny - y) <= radius + 30) this.openGate(g, 'crack');
    }
    if (info.byKind === 'p' || info.byKind === 'env') {
      for (const sw of this.switches) if (!sw.done && Math.hypot(sw.x - x, sw.y - y) < radius * 0.7) this.hitSwitch(sw, this.players.get(info.by));
      if (info.kind !== 'super') this.noise(x, y);
    }
  }

  damageProp(pr, dmg, info) {
    if (!pr || pr.dead) return;
    if (pr.k === 'table' && pr.st === 'up' && info.kind == null) return;
    pr.hp -= dmg;
    if (pr.hp <= 0) this.breakProp(pr, info);
    else this.emit({ t: 'prophit', id: pr.id });
  }

  breakProp(pr, info) {
    pr.dead = true;
    this.phys.remove(pr.solidId);
    this.props.delete(pr.id);
    this.coverVer++;
    const cx = pr.x + pr.w / 2, cy = pr.y + pr.h / 2;
    this.emit({ t: 'break', id: pr.id, k: pr.k, x: r1(cx), y: r1(cy) });
    if (pr.contains === 'key') this.dropPickup('key', null, cx, cy);
    if (pr.k === 'barrel') {
      const src = { by: info.by, byKind: info.byKind === 'e' ? 'env' : info.byKind || 'env', w: 'barrel', kind: 'barrel', selfMul: 0.5, poise: 70 };
      this.pending.push({ t: 0.12, fn: () => this.explode(cx, cy, 175, 70, 950, src) });
    } else if (pr.k === 'crate') {
      // anything stacked on top collapses too
      for (const o of this.props.values()) {
        if (o.dead || o.k !== 'crate') continue;
        if (Math.abs(o.y + o.h - pr.y) < 3 && o.x < pr.x + pr.w && o.x + o.w > pr.x) {
          this.pending.push({ t: 0.15, fn: () => this.breakProp(o, info) });
        }
      }
      if (pr.contains) return;
      const r = this.rng.f();
      if (r < 0.2) this.dropPickup('health', null, cx, cy);
      else if (r < 0.32) this.dropPickup('bomb', null, cx, cy);
      else if (r < 0.37) this.dropPickup('weapon', HEAVY_KEYS[Math.floor(this.rng.f() * HEAVY_KEYS.length)], cx, cy);
    }
  }

  interact(p) {
    // pick your buddy up
    for (const o of this.players.values()) {
      if (o === p || !o.downed) continue;
      if (Math.hypot(o.x - p.x, o.y - p.y) < 80) {
        p.revTarget = o.id;
        p.revT = 0;
        this.emit({ t: 'reviving', id: p.id, tgt: o.id });
        return;
      }
    }
    // untie a hostage
    for (const c of this.civs.values()) {
      if (c.st !== 'tied' || Math.abs(c.x - p.x) > 70 || Math.abs(c.y - p.y) > 80) continue;
      c.by = p.id;
      c.untie = Math.max(c.untie, 0.01);
      return;
    }
    // swap for a different weapon lying at our feet
    for (const pk of this.pickups.values()) {
      if (!pk.active || pk.k !== 'weapon') continue;
      if (Math.abs(p.x - pk.x) < 44 && Math.abs(p.y - p.h / 2 - pk.y) < 70 && pk.w !== p.heavy) {
        this.takePickup(p, pk, true);
        return;
      }
    }
    // flip a table for cover
    let best = null, bd = 110;
    for (const pr of this.props.values()) {
      if (pr.k !== 'table' || pr.st !== 'up') continue;
      const d = Math.abs(pr.x + pr.w / 2 - p.x);
      if (d < bd && Math.abs(pr.y + pr.h - p.y) < 40) { bd = d; best = pr; }
    }
    if (best) {
      best.st = 'flipped';
      best.dir = p.x < best.x + best.w / 2 ? 1 : -1;
      best.hp = 70;
      this.propSolid(best);
      this.emit({ t: 'flip', id: best.id, dir: best.dir });
    }
  }

  // ------------------------------------------------------------- civilians

  updateCivs() {
    for (const c of this.civs.values()) {
      if (c.st === 'tied') {
        if (c.by != null) {
          const p = this.players.get(c.by);
          if (!p || !p.alive || p.downed || Math.abs(p.x - c.x) > 95 || Math.abs(p.y - c.y) > 90) { c.by = null; c.untie = 0; }
          else {
            c.untie += DT;
            if (c.untie >= 1.0) this.freeCiv(c, p);
          }
        }
        if (this.tick % 240 === c.id % 240 && this.panelState[c.panel] === 'active') {
          const lines = this.theme.callouts.rescue;
          this.emit({ t: 'csay', id: c.id, text: lines[Math.floor(this.rng.f() * lines.length)] });
        }
      } else if (c.st === 'free') {
        c.runT -= DT;
        const P = this.level.panels[c.panel];
        c.x = clamp(c.x + c.facing * 300 * DT, P.x1 + 20, P.x2 - 20);
        if (c.runT <= 0) {
          this.civs.delete(c.id);
          this.emit({ t: 'civgone', id: c.id });
        }
      }
    }
  }

  freeCiv(c, p) {
    c.st = 'free';
    c.runT = 2.2;
    const P = this.level.panels[c.panel];
    c.facing = c.x < (P.x1 + P.x2) / 2 ? -1 : 1;
    this.coupons++;
    this.emit({ t: 'freed', id: c.id, by: p.id, text: this.rng.pick(['MY HERO!', 'THANK YOU!', 'I OWE YOU ONE!', 'YOU SAVED ME!']) });
    this.emit({ t: 'coupon', why: 'rescue', n: this.coupons });
    this.dropPickup('health', null, c.x, c.y - 40);
  }

  hurtCiv(c, dmg) {
    if (c.st !== 'tied') return;
    c.hp -= dmg;
    this.emit({ t: 'chit', id: c.id, x: r1(c.x), y: r1(c.y - 40) });
    if (c.hp <= 0) {
      c.st = 'dead';
      this.civs.delete(c.id);
      this.emit({ t: 'civdead', id: c.id, x: r1(c.x), y: r1(c.y - 40) });
    }
  }

  // --------------------------------------------------------------- puzzles

  hitSwitch(sw, p) {
    if (sw.done) return;
    const was = sw.t > 0;
    sw.t = 5;
    if (!was) this.emit({ t: 'sw', id: sw.id, on: 1, by: p ? p.id : null });
    const group = this.switches.filter((s) => s.panel === sw.panel);
    if (group.every((s) => s.t > 0)) {
      for (const s of group) s.done = true;
      this.solved.add(sw.panel);
      this.emit({ t: 'solved', panel: sw.panel, k: 'switch' });
      if (this.panelState[sw.panel] === 'cleared') this.openExit(this.level.panels[sw.panel], 'switch');
    }
  }

  updateSwitches() {
    for (const sw of this.switches) {
      if (sw.done || sw.t <= 0) continue;
      sw.t -= DT;
      if (sw.t <= 0) { sw.t = 0; this.emit({ t: 'sw', id: sw.id, on: 0 }); }
    }
  }

  openGate(g, how) {
    if (this.gatesOpen.has(g.id)) return;
    this.gatesOpen.add(g.id);
    this.phys.remove(this.gateIds.get(g.id));
    this.emit({ t: 'gate', id: g.id, how });
  }

  openExit(P, how) {
    for (const g of this.level.gates) if (g.panel === P.id && g.lock === how) this.openGate(g, how);
  }

  // Ambushes and last stands close the doors behind you.
  seal(P) {
    const lv = this.level;
    const rects = [];
    for (const l of lv.links) {
      if (l.a !== P.id && l.b !== P.id) continue;
      const g = lv.gates.find((gg) => gg.link === l.id);
      if (g && !this.gatesOpen.has(g.id)) continue;
      const r = l.kind === 'door'
        ? { x: l.x1, y: l.y1, w: l.x2 - l.x1, h: l.y2 - l.y1 }
        : { x: l.x1, y: l.y1, w: l.x2 - l.x1, h: 12 };
      r.id = this.phys.add({ ...r, t: SOLID, k: 'seal' });
      rects.push(r);
    }
    this.seals.set(P.id, rects);
    this.emit({ t: 'seal', panel: P.id, r: rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })) });
  }

  unseal(P) {
    const rects = this.seals.get(P.id);
    if (!rects) return;
    for (const r of rects) this.phys.remove(r.id);
    this.seals.delete(P.id);
    this.emit({ t: 'unseal', panel: P.id });
  }

  // Someone's deep enough inside, and nobody is standing in a doorway.
  canSpring(P) {
    const inset = Math.min(200, (P.x2 - P.x1) * 0.28);
    let inside = false;
    for (const p of this.players.values()) {
      if (!p.alive || p.downed) continue;
      if (p.x > P.x1 + inset && p.x < P.x2 - inset && p.y > P.y1 && p.y <= P.y2 + 1) inside = true;
      for (const l of this.level.links) {
        if (l.a !== P.id && l.b !== P.id) continue;
        // would the seal close on top of them?
        const x1 = l.x1 - p.w / 2 - 12, x2 = l.x2 + p.w / 2 + 12;
        const y1 = l.kind === 'door' ? l.y1 : l.y1, y2 = l.kind === 'door' ? l.y2 : l.y1 + 12;
        if (p.x > x1 && p.x < x2 && p.y > y1 + 1 && p.y - p.h < y2 + 12) return false;
        if (l.kind === 'hole' && p.climb && p.x > x1 && p.x < x2 && p.y > l.y1 - 20 && p.y - p.h < l.y2) return false;
      }
    }
    return inside;
  }

  // --------------------------------------------------------------- pickups

  dropPickup(k, w, x, y, ammo) {
    const id = this.uid++;
    const g = groundProbe(this.phys, { x, y, w: 20 }, 800, false);
    const py = g ? g.y - 34 : y;
    const pk = { id, k, w, x, y: py, active: true, respawn: 0, ttl: k === 'key' ? null : 20, t: 0, ammo };
    this.pickups.set(id, pk);
    this.emit({ t: 'pkspawn', pk: pickupInfo(pk) });
  }

  updatePickups() {
    for (const pk of this.pickups.values()) {
      if (!pk.active) {
        pk.t -= DT;
        if (pk.t <= 0) {
          pk.active = true;
          if (pk.k === 'weapon' && this.mode === MODES.BRAWL && !pk.fixed) pk.w = HEAVY_KEYS[Math.floor(this.rng.f() * HEAVY_KEYS.length)];
          this.emit({ t: 'pkspawn', pk: pickupInfo(pk) });
        }
        continue;
      }
      if (pk.ttl != null) {
        pk.ttl -= DT;
        if (pk.ttl <= 0) {
          this.pickups.delete(pk.id);
          this.emit({ t: 'pkgone', id: pk.id });
        }
      }
    }
  }

  touchPickups(p) {
    for (const pk of this.pickups.values()) {
      if (!pk.active) continue;
      if (Math.abs(p.x - pk.x) > 40 || Math.abs(p.y - p.h / 2 - pk.y) > 64) continue;
      if (pk.k === 'health') {
        if (p.hp >= p.maxHp) continue;
        p.hp = Math.min(p.maxHp, p.hp + 60);
      } else if (pk.k === 'bomb') {
        if (p.bombs >= PLAYER.bombMax + (p.perks.ink ? 1 : 0)) continue;
        p.bombs++;
      } else if (pk.k === 'key') {
        if (p.hasKey) continue;
        p.hasKey = true;
      } else if (pk.k === 'stamp') {
        this.stamps++;
        this.coupons++;
        this.emit({ t: 'stamp', by: p.id, n: this.stamps });
        this.emit({ t: 'coupon', why: 'stamp', n: this.coupons });
      } else if (pk.k === 'weapon') {
        if (p.heavy && p.heavy !== pk.w) continue; // needs E to swap
        this.takePickup(p, pk, false);
        continue;
      }
      this.consumePickup(p, pk);
    }
  }

  takePickup(p, pk, swap) {
    const W = WEAPONS[pk.w];
    if (swap && p.heavy && p.heavy !== pk.w) {
      this.dropPickup('weapon', p.heavy, p.x - p.facing * 30, p.y - 40, p.heavyAmmo);
    }
    const ammo = pk.ammo != null ? pk.ammo : W.ammo;
    if (p.heavy === pk.w) p.heavyAmmo = Math.max(p.heavyAmmo, ammo);
    else p.heavyAmmo = ammo;
    p.heavy = pk.w;
    p.slot = 1;
    p.cd = Math.max(p.cd, 0.1);
    this.consumePickup(p, pk);
  }

  consumePickup(p, pk) {
    this.emit({ t: 'pick', id: pk.id, by: p.id, k: pk.k, w: pk.w });
    if (pk.respawn > 0) {
      pk.active = false;
      pk.t = pk.respawn;
    } else this.pickups.delete(pk.id);
  }

  // ------------------------------------------------------------------ perks

  startAds() {
    const n = 3 + Math.min(2, this.coupons);
    const offers = this.rng.shuffle(PERK_KEYS.slice()).slice(0, n);
    const picks = Math.min(n, 1 + this.coupons);
    this.ads = { offers, picks };
    this.phase = 'ads';
    this.phaseT = PHASE_TIME.ads;
    for (const p of this.players.values()) {
      p.picks = picks;
      if (p.bot) this.autoPick(p);
    }
    this.emit({ t: 'ads', offers, picks });
  }

  autoPick(p) {
    if (!this.ads) return;
    const opts = this.rng.shuffle(this.ads.offers.filter((k) => !p.perks[k]));
    while (p.picks > 0 && opts.length) this.applyPerk(p, opts.shift());
    p.picks = 0;
  }

  pickPerk(pid, key) {
    const p = this.players.get(pid);
    if (!p || this.phase !== 'ads' || !this.ads || p.picks <= 0) return;
    if (!this.ads.offers.includes(key) || p.perks[key] || !PERKS[key]) return;
    this.applyPerk(p, key);
  }

  applyPerk(p, key) {
    p.perks[key] = true;
    p.picks = Math.max(0, p.picks - 1);
    if (key === 'heart') { p.maxHp += 40; p.hp = p.maxHp; }
    if (key === 'ink') p.bombs = Math.min(PLAYER.bombMax + 1, p.bombs + 1);
    applyPerkStats(p);
    this.emit({ t: 'perk', id: p.id, k: key, left: p.picks });
  }

  updateAds() {
    this.phaseT -= DT;
    let waiting = 0;
    for (const p of this.players.values()) if (p.picks > 0) waiting++;
    if (!waiting) this.phaseT = Math.min(this.phaseT, 1.4);
    if (this.phaseT <= 0) {
      for (const p of this.players.values()) if (p.picks > 0) this.autoPick(p);
      this.coupons = 0;
      this.ads = null;
      this.loadSpread(this.spreadIndex + 1, 'turn');
    }
  }

  // ------------------------------------------------------------------ modes

  playersIn(P) {
    for (const p of this.players.values()) {
      if (p.alive && !p.downed && p.x > P.x1 && p.x < P.x2 && p.y > P.y1 && p.y <= P.y2 + 1) return true;
    }
    return false;
  }

  enemiesIn(panelId) {
    let n = 0;
    for (const e of this.enemies.values()) if (e.panel === panelId) n++;
    return n;
  }

  activatePanel(P) {
    this.panelState[P.id] = 'active';
    this.emit({ t: 'panel', id: P.id, s: 'active', beat: P.beat });
    for (const e of this.enemies.values()) {
      if (e.panel !== P.id || e.st !== 'asleep') continue;
      e.st = 'waking';
      e.wakeT = e.aware ? 0.15 + this.rng.f() * 0.6 : 0.05;
      if (e.k === 'boss') {
        e.wakeT = 1.2;
        this.bossId = e.id;
        this.emit({ t: 'boss', id: e.id, name: e.name });
      }
      if (e.elite) {
        e.wakeT = 0.9;
        this.emit({ t: 'elite', id: e.id, name: e.name });
      }
    }
  }

  nextWave(P) {
    const waves = this.pendingWaves.get(P.id);
    if (!waves || !waves.length) return false;
    for (const def of waves.shift()) this.addEnemy(def, 'drawing');
    this.emit({ t: 'wave', panel: P.id });
    return true;
  }

  updateStory() {
    if (this.phase === 'intro' || this.phase === 'turning') {
      this.phaseT -= DT;
      if (this.phaseT <= 0) { this.phase = 'play'; this.emit({ t: 'phase', ph: 'play' }); }
      return;
    }
    if (this.phase === 'ads') return this.updateAds();
    const lv = this.level;
    if (this.phase === 'play') {
      // last-stand timers run every tick
      for (const [pid, st] of this.stand) {
        const P = lv.panels[pid];
        st.t -= DT;
        st.spawnT -= DT;
        const alive = this.enemiesIn(pid);
        if (st.t > 3 && (st.spawnT <= 0 || alive <= 1) && alive < 5) {
          if (this.nextWave(P)) st.spawnT = 6.5;
        }
        if (st.t <= 0) {
          // the ink is dry: the page erases whoever's left
          for (const e of [...this.enemies.values()]) {
            if (e.panel !== pid) continue;
            this.enemies.delete(e.id);
            this.emit({ t: 'erase', id: e.id, x: r1(e.x), y: r1(e.y - e.h / 2) });
          }
          this.pendingWaves.delete(pid);
          this.stand.delete(pid);
          this.emit({ t: 'standover', panel: pid });
        }
      }
      if (this.tick % 3 === 0) {
        for (const P of lv.panels) {
          const s = this.panelState[P.id];
          if (s === 'asleep' && this.playersIn(P)) this.activatePanel(P);
          else if (s === 'active') {
            if ((P.beat === 'ambush' || P.beat === 'stand') && !this.triggered.has(P.id)) {
              if (!this.canSpring(P)) continue;
              this.triggered.add(P.id);
              this.seal(P);
              if (P.beat === 'ambush') {
                this.emit({ t: 'trap', panel: P.id });
                this.pending.push({ t: 0.7, panel: P.id, fn: () => this.nextWave(P) });
              } else {
                this.stand.set(P.id, { t: P.standT || 34, spawnT: 5 });
                this.emit({ t: 'stand', panel: P.id, dur: P.standT || 34 });
              }
              continue;
            }
            if (this.stand.has(P.id)) continue;
            if (this.enemiesIn(P.id) === 0 && !this.pending.some((j) => j.panel === P.id)) {
              if (!this.nextWave(P)) this.clearPanel(P);
            }
          }
        }
      }
      // carry the key to its door
      for (const g of lv.gates) {
        if (g.lock !== 'key' || this.gatesOpen.has(g.id) || this.panelState[g.panel] !== 'cleared') continue;
        for (const p of this.players.values()) {
          if (!p.hasKey || !p.alive || p.downed) continue;
          const P = lv.panels[g.panel];
          const near = g.kind === 'door'
            ? Math.abs(p.x - (g.x + g.w / 2)) < 130 && Math.abs(p.y - (g.y + g.h)) < 190
            : Math.abs(p.x - (g.x + g.w / 2)) < 150 && p.y > P.y1 - 20 && p.y <= P.y2 + 2 && p.x > P.x1 && p.x < P.x2;
          if (near) {
            p.hasKey = false;
            this.openGate(g, 'key');
            this.emit({ t: 'unlock', id: g.id, by: p.id });
            break;
          }
        }
      }
      if (lv.path.every((id) => this.panelState[id] === 'cleared')) {
        this.phase = 'cleared';
        this.phaseT = 3.2;
        this.emit({ t: 'spreadclear', final: lv.final });
      }
      let up = 0;
      for (const p of this.players.values()) if (p.alive && !p.downed) up++;
      if (this.players.size > 0 && up === 0) {
        this.wipeT += DT;
        if (this.wipeT > 1.2) {
          for (const p of this.players.values()) if (p.downed) { p.downed = false; p.alive = false; p.respawnT = 0; }
          this.phase = 'gameover';
          this.phaseT = 4.5;
          this.emit({ t: 'gameover' });
        }
      } else this.wipeT = 0;
    } else if (this.phase === 'cleared') {
      this.phaseT -= DT;
      if (this.phaseT <= 0) {
        if (lv.final) {
          this.phase = 'victory';
          this.phaseT = 12;
          this.emit({ t: 'victory' });
        } else this.startAds();
      }
    } else if (this.phase === 'victory') {
      this.phaseT -= DT;
      if (this.phaseT <= 0) this.newComic();
    } else if (this.phase === 'gameover') {
      this.phaseT -= DT;
      if (this.phaseT <= 0) this.loadSpread(this.spreadIndex, 'retry');
    }
  }

  clearPanel(P) {
    this.panelState[P.id] = 'cleared';
    this.emit({ t: 'panel', id: P.id, s: 'cleared' });
    const lv = this.level;
    this.unseal(P);
    if (P.beat === 'silent' && !this.alarms.has(P.id)) {
      // a clean ghost run pays out
      for (const p of this.players.values()) {
        if (!p.alive || p.downed) continue;
        p.super = Math.min(PLAYER.superMax, p.super + 30);
      }
      this.emit({ t: 'ghost', panel: P.id });
    }
    for (const g of lv.gates) {
      if (g.panel !== P.id || this.gatesOpen.has(g.id)) continue;
      if (!g.lock || (g.lock === 'switch' && this.solved.has(P.id))) this.openGate(g, g.lock || 'clear');
      else this.emit({ t: 'hint', panel: P.id, k: g.lock, gate: g.id });
    }
    const idx = lv.path.indexOf(P.id);
    const next = lv.path[idx + 1];
    if (next != null && this.panelState[next] === 'locked') this.panelState[next] = 'asleep';
  }

  updateBrawl() {
    if (this.phase === 'intro' || this.phase === 'turning') {
      this.phaseT -= DT;
      if (this.phaseT <= 0) { this.phase = 'play'; this.emit({ t: 'phase', ph: 'play' }); }
      return;
    }
    if (this.phase === 'play') {
      this.matchT -= DT;
      let leader = null;
      for (const p of this.players.values()) if (!leader || p.kills > leader.kills) leader = p;
      if ((leader && leader.kills >= BRAWL.killsToWin) || this.matchT <= 0) {
        this.phase = 'over';
        this.phaseT = BRAWL.overTime;
        this.emit({ t: 'over', winner: leader ? leader.id : null });
      }
      if (this.chaos && this.tick % 6 === 0) {
        for (const P of this.level.panels) {
          if (this.panelState[P.id] === 'asleep' && this.playersIn(P)) this.activatePanel(P);
          if (this.panelState[P.id] === 'active' && this.enemiesIn(P.id) === 0) {
            this.panelQuiet[P.id] += 0.1;
            if (this.panelQuiet[P.id] > 25 && !this.playersIn(P)) {
              this.panelQuiet[P.id] = 0;
              const defs = this.level.enemies.filter((d) => d.panel === P.id);
              for (const d of defs) this.addEnemy({ ...d, id: this.uid++ }, 'drawing');
            }
          }
        }
      }
    } else if (this.phase === 'over') {
      this.phaseT -= DT;
      if (this.phaseT <= 0) this.newComic();
    }
  }

  // --------------------------------------------------------------- network

  snapshot() {
    const ps = [];
    for (const p of this.players.values()) ps.push(playerSnap(p));
    const es = [];
    for (const e of this.enemies.values()) if (e.st !== 'asleep') es.push(enemySnap(e));
    const boss = this.bossId != null ? this.enemies.get(this.bossId) : null;
    const snap = {
      t: this.tick, ph: this.phase, pt: r1(this.phaseT), mt: Math.round(this.matchT),
      p: ps, e: es,
      boss: boss ? { id: boss.id, hp: boss.hp, max: boss.maxHp, name: boss.name, po: r2(boss.poise / boss.maxPoise), st: boss.staggerT > 0 ? 1 : 0 } : null,
    };
    if (this.civs.size) snap.cv = [...this.civs.values()].map(civSnap);
    if (this.stand.size) snap.sd = [...this.stand].map(([p, s]) => ({ p, t: r1(Math.max(0, s.t)) }));
    if (this.ads) snap.ads = { o: this.ads.offers, n: this.ads.picks };
    if (this.mode === MODES.STORY) { snap.cp = this.coupons; snap.stp = this.stamps; }
    return snap;
  }

  meSnap(id) {
    const p = this.players.get(id);
    if (!p) return null;
    return {
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, h: p.h, onGround: p.onGround, crouch: p.crouch, climb: p.climb,
      jumps: p.jumps, coyote: p.coyote, jbuf: p.jbuf, jumpHeld: p.jumpHeld, dashT: p.dashT, dashCd: p.dashCd,
      dashDir: p.dashDir, dropT: p.dropT, stun: p.stun, facing: p.facing, iframes: p.iframes, superT: p.superT,
      groundOneway: p.groundOneway, airJumps: p.airJumps, moveMul: p.moveMul, dashCdMul: p.dashCdMul,
      alive: p.alive, respawnT: r1(p.respawnT), hp: p.hp, maxHp: p.maxHp, mag: p.mag, heavy: p.heavy, heavyAmmo: p.heavyAmmo,
      slot: p.slot, cd: p.cd, rl: p.rl, bombs: p.bombs, bombT: r1(p.bombT), super: r1(p.super),
      meleeCd: p.meleeCd, invuln: p.invuln, combo: p.combo, comboT: p.comboT, railT: p.railT, counterT: p.counterT,
      downed: p.downed, bleed: r1(p.bleed), rev: r2(p.rev || 0), revTarget: p.revTarget, hasKey: p.hasKey,
      perks: Object.keys(p.perks), picks: p.picks, ack: p.lastSeq,
    };
  }

  roster() {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, hero: p.hero, color: p.color, bot: p.bot }));
  }

  levelData() {
    return {
      version: this.levelVersion,
      transition: this.transition,
      mode: this.mode,
      chaos: this.chaos,
      comic: this.comic,
      level: this.level,
      dyn: {
        props: [...this.props.values()].map((pr) => ({ id: pr.id, k: pr.k, x: pr.x, y: pr.y, w: pr.w, h: pr.h, st: pr.st, dir: pr.dir, c: pr.contains || undefined })),
        pickups: [...this.pickups.values()].filter((pk) => pk.active).map(pickupInfo),
        asleep: [...this.enemies.values()].filter((e) => e.st === 'asleep').map(enemySnap),
        gates: [...this.gatesOpen],
        panels: this.panelState.slice(),
        seals: [...this.seals].map(([panel, rs]) => ({ panel, r: rs.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })) })),
        switches: this.switches.map((s) => ({ id: s.id, on: s.t > 0 || s.done ? 1 : 0, done: s.done ? 1 : 0 })),
        civs: [...this.civs.values()].map(civSnap),
        alarms: [...this.alarms],
        solved: [...this.solved],
        coupons: this.coupons,
        stamps: this.stamps,
      },
    };
  }
}

// -------------------------------------------------------------------- utils

const NO_PERKS = {};
const DOWN_CMD = emptyCmd();

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function sanitizeCmd(c) {
  const out = emptyCmd(c.seq | 0, Number(c.aim) || 0);
  out.mx = c.mx > 0 ? 1 : c.mx < 0 ? -1 : 0;
  for (const k of ['up', 'down', 'jump', 'fire', 'jumpP', 'dashP', 'meleeP', 'bombP', 'swapP', 'interactP', 'superP', 'reloadP', 'tauntP']) out[k] = !!c[k];
  return out;
}

export function projInfo(pr) {
  return {
    id: pr.id, k: pr.k, o: pr.o, ok: pr.ok, x: r1(pr.x), y: r1(pr.y), vx: r1(pr.vx), vy: r1(pr.vy),
    g: pr.grav, l: r2(pr.life), r: pr.r, w: pr.w, word: pr.word || undefined, f: pr.fuse != null ? r2(pr.fuse) : undefined, b: pr.bounce,
  };
}

function pickupInfo(pk) {
  return { id: pk.id, k: pk.k, w: pk.w, x: r1(pk.x), y: r1(pk.y) };
}

function civSnap(c) {
  return { id: c.id, x: r1(c.x), y: r1(c.y), st: c.st, hp: Math.max(0, Math.round(c.hp)), u: r2(c.untie), f: c.facing, look: c.look, panel: c.panel };
}

function playerSnap(p) {
  let f = 0;
  if (p.onGround) f |= F.GROUND;
  if (p.crouch) f |= F.CROUCH;
  if (p.climb) f |= F.CLIMB;
  if (p.dashT > 0) f |= F.DASH;
  if (!p.alive) f |= F.DEAD;
  if (p.invuln > 0) f |= F.INVULN;
  if (p.stun > 0) f |= F.STUN;
  if (p.rl > 0) f |= F.RELOAD;
  if (p.superT > 0) f |= F.SUPER;
  if (p.meleeT > 0) f |= F.MELEE;
  if (p.bot) f |= F.BOT;
  if (p.downed) f |= F.DOWN;
  if (p.revTarget != null) f |= F.REVIVE;
  if (p.hasKey) f |= F.KEY;
  if (p.railT > 0) f |= F.CHARGE;
  const s = {
    id: p.id, x: r1(p.x), y: r1(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy), a: r2(p.aim), f,
    hp: Math.max(0, Math.round(p.hp)), mh: p.maxHp, w: weaponOf(p), k: p.kills, d: p.deaths, s: p.score, sp: Math.round(p.super), h: p.h,
  };
  if (p.downed) { s.rv = r2(p.rev || 0); s.bl = r1(p.bleed); }
  return s;
}

function enemySnap(e) {
  const st = e.st === 'asleep' ? 0 : e.st === 'drawing' ? 1 : e.st === 'waking' ? 2 : 3;
  const s = {
    id: e.id, k: e.k, x: r1(e.x), y: r1(e.y), vx: Math.round(e.vx), vy: Math.round(e.vy), a: r2(e.aim), f: e.facing,
    st, hp: Math.max(0, Math.round(e.hp)), mh: e.maxHp, act: e.act, at: r2(e.actT), p: e.panel, w: e.w, h: e.h,
    g: e.onGround ? 1 : 0,
  };
  if (e.shieldKind) s.sh = e.shieldUp ? 1 : 0;
  if (e.eshMax) s.es = Math.round((e.esh / e.eshMax) * 10) / 10;
  if (!e.aware) { s.aw = 0; s.su = r2(e.susp); }
  if (e.elite) { s.el = 1; s.n = e.name; s.po = r2(e.poise / e.maxPoise); }
  if (e.carry) s.ky = 1;
  if (e.downedZ) s.dz = 1;
  if (e.staggerT > 0) s.sg = 1;
  return s;
}
