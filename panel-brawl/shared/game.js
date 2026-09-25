// Authoritative game simulation. Runs on the Node server for online play and
// inside the browser for solo play. Emits a stream of events that clients use
// to drive all the comic-book FX.

import { DT, BODY, PLAYER, MODES, BRAWL, F, emptyCmd } from './constants.js';
import { RNG, hash01, randomSeed } from './rng.js';
import { THEMES, HEROES, HERO_KEYS, PLAYER_COLORS, TAUNTS } from './themes.js';
import { WEAPONS, HEAVY_KEYS, PUNCH, BOMB, SUPER, EXPLOSION_SELF, ENEMY_SHOTS, PROJ_RADIUS, weaponOf, shoulderOf, applyRecoil } from './weapons.js';
import { Physics, SOLID, ONEWAY, raycast, segRect, groundProbe } from './physics.js';
import { initMoveState, stepMovement } from './movement.js';
import { generateComic, generateSpread, findPanel } from './comicgen.js';
import { updateEnemy, ENEMY_STATS, ACT } from './ai.js';
import { botThink } from './bots.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const PHASE_TIME = { intro: 4.6, turning: 3.4, retry: 2.6 };

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
    this.pending = [];
    this.levelVersion = 0;
    this.nextShot = 1;
    this.uid = 100000;
    this.nextColor = 0;
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
    }
    this.matchT = BRAWL.matchTime;
    this.loadSpread(0, 'cover');
  }

  loadSpread(index, transition) {
    this.spreadIndex = index;
    this.level = generateSpread(this.comic, index, this.mode, { chaos: this.chaos });
    this.transition = transition;
    this.levelVersion++;
    const lv = this.level;

    this.phys = new Physics();
    for (const s of lv.solids) this.phys.add({ ...s });
    for (const o of lv.oneways) this.phys.add({ ...o });
    this.phys.ladders = lv.ladders.map((l) => ({ ...l }));
    this.gateIds = new Map();
    this.gatesOpen = new Set();
    for (const g of lv.gates) this.gateIds.set(g.id, this.phys.add({ x: g.x, y: g.y, w: g.w, h: g.h, t: SOLID, k: 'gate', gate: g.id }));

    this.props.clear();
    for (const pr of lv.props) this.addProp({ ...pr });

    this.pickups.clear();
    for (const pk of lv.pickups) this.pickups.set(pk.id, { ...pk, active: true, t: 0 });

    this.projectiles.clear();
    this.enemies.clear();
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
    this.bossId = null;

    this.phase = transition === 'cover' ? 'intro' : 'turning';
    this.phaseT = transition === 'cover' ? PHASE_TIME.intro : transition === 'retry' ? PHASE_TIME.retry : PHASE_TIME.turning;
    this.wipeT = 0;
    for (const p of this.players.values()) this.spawnPlayer(p, true);
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
      else pr.solidId = this.phys.add({ x: pr.x + pr.w / 2 - 9, y: pr.y + pr.h - 80, w: 18, h: 80, t: SOLID, prop: pr.id });
    } else {
      pr.solidId = this.phys.add({ x: pr.x, y: pr.y, w: pr.w, h: pr.h, t: SOLID, prop: pr.id });
    }
  }

  addEnemy(def, st) {
    const th = THEMES[this.comic.theme];
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
    const n = Math.max(1, this.humans);
    const hpMul = def.k === 'boss' ? 1 + 0.55 * (n - 1) : 1 + 0.25 * (n - 1);
    const P = this.level.panels[def.panel];
    const y = flying ? clamp(def.y, P.y1 + h + 30, P.y2 - 60) : def.y;
    const e = {
      kind: 'e', id: def.id, k: def.k, name: spec.name, look,
      x: def.x, y, vx: 0, vy: 0, w, h,
      hp: Math.round(base.hp * hpMul), maxHp: Math.round(base.hp * hpMul),
      st, panel: def.panel, facing: def.facing || 1, aim: (def.facing || 1) > 0 ? 0 : Math.PI,
      onGround: !flying, flying, speed: base.speed, jumpV: base.jumpV, knockMul: base.knockMul,
      act: ACT.idle, actT: 0, cd: 0.6 + this.rng.f(), jumpCd: 0, t: this.rng.f() * 10,
      wakeT: 0, drawT: 0, stunT: 0, hurtT: 0, pattern: 0, blocked: false, target: null,
    };
    this.enemies.set(e.id, e);
    if (st === 'drawing') {
      e.drawT = 1.0;
      this.emit({ t: 'draw', id: e.id, k: e.k, x: r1(e.x), y: r1(e.y) });
    }
    return e;
  }

  activateEnemy(e) {
    e.st = 'active';
    const th = THEMES[this.comic.theme];
    let line = null;
    if (e.k === 'boss') line = this.rng.pick(th.bossLines);
    else if (this.rng.f() < 0.45) line = this.rng.pick(th.wakeLines);
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
    };
    initMoveState(p);
    this.players.set(id, p);
    this.spawnPlayer(p, true);
    return p;
  }

  removePlayer(id) {
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

  frontierPanel() {
    const lv = this.level;
    if (this.mode !== MODES.STORY) return null;
    let best = lv.panels[lv.path[0]];
    for (const id of lv.path) {
      const s = this.panelState[id];
      if (s === 'active' || s === 'asleep') return lv.panels[id];
      if (s === 'cleared') best = lv.panels[id];
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
    p.alive = true;
    p.hp = p.maxHp;
    p.invuln = PLAYER.spawnInvuln;
    p.mag = PLAYER.mag;
    p.rl = 0;
    p.cd = 0;
    p.slot = p.heavy ? 1 : 0;
    p.onGround = true;
    this.emit({ t: 'spawn', id: p.id, x: r1(p.x), y: r1(p.y) });
  }

  // ------------------------------------------------------------------- step

  step() {
    this.tick++;
    const frozen = this.phase === 'intro' || this.phase === 'turning' || this.phase === 'over' || this.phase === 'victory';

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
    if (p.invuln > 0) p.invuln -= DT;
    if (p.cd > 0) p.cd -= DT;
    if (p.meleeCd > 0) p.meleeCd -= DT;
    if (p.meleeT > 0) p.meleeT -= DT;
    if (p.comboT > 0) p.comboT -= DT; else p.combo = 0;
    if (p.tauntCd > 0) p.tauntCd -= DT;
    if (p.rl > 0) {
      p.rl -= DT;
      if (p.rl <= 0) { p.rl = 0; p.mag = PLAYER.mag; }
    }
    if (p.bombs < PLAYER.bombs) {
      p.bombT -= DT;
      if (p.bombT <= 0) { p.bombs++; p.bombT = PLAYER.bombRecharge; }
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

    if (p.superT > 0 || !p.alive) return;
    const seq = p.bot ? ++p.botSeq : cmd.seq;

    if (cmd.swapP && p.heavy) {
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
    p.rl = WEAPONS.pistol.reload;
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
    for (const p of this.players.values()) if (p.alive) out.push(p);
    for (const e of this.enemies.values()) if (e.st === 'active' || (this.chaos && e.st === 'asleep')) out.push(e);
    return out;
  }

  // ---------------------------------------------------------------- weapons

  tryFire(p, seq) {
    const wk = weaponOf(p);
    const W = WEAPONS[wk];
    if (p.cd > 0) return;
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

    if (W.melee) this.swingBlade(p, W, seq, sh, ca, sa);
    else if (W.hitscan) this.fireRail(p, W, seq, sh, ca, sa);
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
      this.hurt(h.t, dmg * (crit ? 1.5 : 1), { by: p.id, byKind: 'p', w: 'rail', x: hx, y: hy, kx: ca * W.knock, ky: sa * W.knock - 120, crit });
      dmg *= W.pierceFalloff;
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
      if (this.hurt(t, W.dmg, { by: p.id, byKind: 'p', w: 'blade', x: tx - ca * t.w * 0.3, y: ty, kx: ca * W.knock, ky: sa * W.knock - 180, melee: true, stun: 0.12 })) hitAny = true;
    }
    for (const pr of this.projectiles.values()) {
      if (pr.o === p.id || pr.k === 'bomb') continue;
      if (pr.ok === 'p' && this.mode !== MODES.BRAWL) continue;
      const d = Math.hypot(pr.x - sh.x, pr.y - sh.y);
      if (d > W.range + 30) continue;
      if (Math.abs(angDiff(Math.atan2(pr.y - sh.y, pr.x - sh.x), p.aim)) > W.arc + 0.25) continue;
      const spd = Math.max(900, Math.hypot(pr.vx, pr.vy) * 1.3);
      pr.vx = ca * spd;
      pr.vy = sa * spd;
      pr.grav = 0;
      pr.o = p.id;
      pr.ok = 'p';
      pr.dmg = Math.round(pr.dmg * 1.6);
      pr.life = Math.max(pr.life, 1.4);
      this.emit({ t: 'deflect', id: pr.id, o: p.id, x: r1(pr.x), y: r1(pr.y), vx: r1(pr.vx), vy: r1(pr.vy) });
    }
    for (const pr of this.props.values()) {
      if (pr.dead || pr.k === 'table' && pr.st === 'up') continue;
      const d = Math.hypot(pr.x + pr.w / 2 - sh.x, pr.y + pr.h / 2 - sh.y);
      if (d < W.range + 20 && Math.abs(angDiff(Math.atan2(pr.y + pr.h / 2 - sh.y, pr.x + pr.w / 2 - sh.x), p.aim)) < W.arc) this.damageProp(pr, W.dmg, { by: p.id, byKind: 'p', w: 'blade' });
    }
    p.meleeT = 0.22;
    this.emit({ t: 'slash', o: p.id, a: r2(p.aim), x: r1(sh.x), y: r1(sh.y), seq, hit: hitAny });
  }

  punch(p, seq) {
    p.meleeCd = PUNCH.rate;
    p.meleeT = 0.2;
    p.combo = p.comboT > 0 ? p.combo + 1 : 1;
    p.comboT = PUNCH.comboWindow;
    const big = p.combo >= 3;
    if (big) p.combo = 0;
    const sh = shoulderOf(p);
    const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
    const hx = sh.x + ca * PUNCH.reach, hy = sh.y + sa * PUNCH.reach;
    let hit = false;
    for (const t of this.targets()) {
      if (!this.isHostile('p', p.id, t)) continue;
      const nx = clamp(hx, t.x - t.w / 2, t.x + t.w / 2), ny = clamp(hy, t.y - t.h, t.y);
      if (Math.hypot(nx - hx, ny - hy) > PUNCH.radius) continue;
      const K = big ? PUNCH.comboKnock : PUNCH.knock;
      const lift = big ? PUNCH.comboLift : PUNCH.lift;
      if (this.hurt(t, big ? PUNCH.comboDmg : PUNCH.dmg, { by: p.id, byKind: 'p', w: big ? 'combo' : 'punch', x: nx, y: ny, kx: ca * K, ky: sa * K * 0.5 - lift, melee: true, stun: big ? 0.4 : 0.18 })) hit = true;
    }
    for (const pr of this.props.values()) {
      if (pr.dead || (pr.k === 'table' && pr.st === 'up')) continue;
      const nx = clamp(hx, pr.x, pr.x + pr.w), ny = clamp(hy, pr.y, pr.y + pr.h);
      if (Math.hypot(nx - hx, ny - hy) <= PUNCH.radius) this.damageProp(pr, big ? 40 : 22, { by: p.id, byKind: 'p', w: 'punch' });
    }
    this.emit({ t: 'punch', o: p.id, a: r2(p.aim), x: r1(hx), y: r1(hy), big, hit, seq });
  }

  throwBomb(p, seq) {
    p.bombs--;
    if (p.bombs < PLAYER.bombs && p.bombT <= 0) p.bombT = PLAYER.bombRecharge;
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
    this.explode(x, y, SUPER.radius, SUPER.dmg, SUPER.knock, { by: p.id, byKind: 'p', w: 'super', kind: 'super', selfMul: 0 });
    for (const e of this.enemies.values()) {
      if (e.st === 'active' && Math.hypot(e.x - x, e.y - y) < SUPER.radius * 1.3) e.stunT = Math.max(e.stunT, 1.4);
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
      dmg: S.dmg, life: S.life, r: S.r, knock: S.knock, w: kind,
    };
    this.projectiles.set(id, proj);
    this.emit({ t: 'eshot', o: e.id, k: kind, x: r1(sx), y: r1(sy), pr: [projInfo(proj)] });
  }

  shockwave(e, radius, dmg, knock) {
    const x = e.x, y = e.y;
    this.emit({ t: 'quake', id: e.id, x: r1(x), y: r1(y), r: radius });
    for (const p of this.players.values()) {
      if (!p.alive) continue;
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

  // ------------------------------------------------------------- projectiles

  updateProjectiles() {
    for (const pr of this.projectiles.values()) {
      pr.life -= DT;
      if (pr.fuse != null) {
        pr.fuse -= DT;
        if (pr.fuse <= 0) {
          this.projectiles.delete(pr.id);
          this.emit({ t: 'pdie', id: pr.id, x: r1(pr.x), y: r1(pr.y), why: 'fuse' });
          this.explode(pr.x, pr.y, BOMB.radius, BOMB.dmg, BOMB.knock, { by: pr.o, byKind: pr.ok, w: 'bomb', kind: 'bomb', selfMul: EXPLOSION_SELF });
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
      if (pr.k !== 'bomb') {
        const dx = nx - pr.x, dy = ny - pr.y;
        for (const t of this.targets()) {
          if (t.kind === 'p' && t.id === pr.o && pr.ok === 'p') continue;
          if (!this.isHostile(pr.ok, pr.o, t)) continue;
          const h = segRect(pr.x, pr.y, dx, dy, t.x - t.w / 2 - pr.r, t.y - t.h - pr.r, t.w + pr.r * 2, t.h + pr.r * 2);
          if (h && h.t < hitT) { hitT = h.t; hitChar = t; }
        }
      }
      const hx = pr.x + (nx - pr.x) * hitT, hy = pr.y + (ny - pr.y) * hitT;
      if (hitChar) {
        if (pr.k === 'word') {
          this.projectiles.delete(pr.id);
          this.emit({ t: 'pdie', id: pr.id, x: r1(hx), y: r1(hy), why: 'hit' });
          const W = WEAPONS.launcher;
          this.hurt(hitChar, 20, { by: pr.o, byKind: pr.ok, w: 'launcher', x: hx, y: hy, kx: pr.vx * 0.2, ky: -100, direct: true });
          this.explode(hx, hy, W.radius, W.dmg, W.knock, { by: pr.o, byKind: pr.ok, w: 'launcher', kind: 'word', selfMul: EXPLOSION_SELF });
          continue;
        }
        const crit = (pr.k === 'bullet' || pr.k === 'pellet') && hy < hitChar.y - hitChar.h * 0.77;
        const sp = Math.hypot(pr.vx, pr.vy) || 1;
        this.projectiles.delete(pr.id);
        this.emit({ t: 'pdie', id: pr.id, x: r1(hx), y: r1(hy), why: 'hit' });
        this.hurt(hitChar, pr.dmg * (crit ? 1.5 : 1), {
          by: pr.o, byKind: pr.ok, w: pr.w, x: hx, y: hy,
          kx: (pr.vx / sp) * pr.knock, ky: (pr.vy / sp) * pr.knock * 0.5 - 60, crit,
        });
        continue;
      }
      if (wall) {
        if (pr.k === 'bomb') {
          // bounce
          pr.x = hx + wall.nx * 1.5;
          pr.y = hy + wall.ny * 1.5;
          if (wall.nx) pr.vx = -pr.vx * pr.bounce;
          if (wall.ny) { pr.vy = -pr.vy * pr.bounce; pr.vx *= 0.8; }
          if (Math.abs(pr.vy) < 60 && wall.ny < 0) pr.vy = 0;
          continue;
        }
        this.projectiles.delete(pr.id);
        this.emit({ t: 'pdie', id: pr.id, x: r1(hx), y: r1(hy), why: 'wall', nx: wall.nx, ny: wall.ny });
        if (pr.k === 'word') {
          const W = WEAPONS.launcher;
          this.explode(hx + wall.nx * 8, hy + wall.ny * 8, W.radius, W.dmg, W.knock, { by: pr.o, byKind: pr.ok, w: 'launcher', kind: 'word', selfMul: EXPLOSION_SELF });
        } else if (pr.k === 'acid') {
          this.explode(hx, hy, 70, 8, 200, { by: pr.o, byKind: 'e', w: 'acid', kind: 'acid', selfMul: 0 });
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

  hurt(t, dmg, info) {
    if (t.kind === 'p') {
      if (!t.alive || t.invuln > 0) return false;
      if (t.iframes > 0 && !info.explosive) {
        this.emit({ t: 'dodge', id: t.id, x: r1(t.x), y: r1(t.y - t.h * 0.6) });
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
      if (t.act === ACT.stunned) dmg *= 1.6;
    }
    let d = Math.max(1, Math.round(dmg));
    if (t.kind === 'p' && this.mode === MODES.STORY && info.byKind === 'e') d = Math.max(1, Math.round(d * (1 - 0.08 * (this.humans - 1))));
    t.hp -= d;
    const km = t.kind === 'e' ? t.knockMul : 1;
    t.vx += (info.kx || 0) * km;
    t.vy += (info.ky || 0) * km;
    if (t.kind === 'p') {
      if (t.onGround && Math.abs(info.kx || 0) > 250 && (info.ky || 0) > -150) t.vy = Math.min(t.vy, -170);
      if (info.stun) t.stun = Math.max(t.stun, info.stun);
      if (t.climb && Math.abs(info.kx || 0) > 300) t.climb = false;
      t.lastBy = info.by;
      t.lastByKind = info.byKind;
    } else {
      t.hurtT = 0.2;
      if (info.stun && t.k !== 'boss') t.stunT = Math.max(t.stunT, info.stun * (t.k === 'brute' ? 0.3 : 1));
      if ((d >= 30 || info.melee) && (t.k === 'grunt' || t.k === 'gunner' || t.k === 'flyer') && (t.act === ACT.windup || t.act === ACT.aim)) {
        t.act = ACT.stagger;
        t.actT = 0.3;
      }
    }
    const big = d >= 40 || info.w === 'combo' || info.w === 'super';
    this.emit({
      t: 'hit', id: t.id, tt: t.kind, x: r1(info.x), y: r1(info.y), d, c: info.crit ? 1 : 0,
      w: info.w, by: info.by, bk: info.byKind, kx: Math.round(info.kx || 0), ky: Math.round(info.ky || 0), big,
      ex: info.explosive ? 1 : 0,
    });
    if (info.byKind === 'p') {
      const a = this.players.get(info.by);
      if (a && a !== t) {
        a.dmg += d;
        a.score += d;
        if (info.w !== 'super') a.super = Math.min(PLAYER.superMax, a.super + d * SUPER.chargePerDmg);
      }
    }
    if (t.hp <= 0) this.kill(t, info);
    return true;
  }

  kill(t, info) {
    const killer = info.byKind === 'p' ? this.players.get(info.by) : null;
    if (t.kind === 'p') {
      t.alive = false;
      t.hp = 0;
      t.deaths++;
      t.climb = false;
      t.superT = 0;
      t.respawnT = this.mode === MODES.BRAWL ? PLAYER.respawnBrawl : PLAYER.respawnStory;
      if (killer && killer !== t) {
        killer.kills++;
        killer.score += 100;
        if (info.w !== 'super') killer.super = Math.min(PLAYER.superMax, killer.super + SUPER.chargePerKO);
      }
      if (t.heavy && this.mode === MODES.BRAWL) this.dropPickup('weapon', t.heavy, t.x, t.y - 40, t.heavyAmmo);
      t.heavy = null;
      t.heavyAmmo = 0;
      t.slot = 0;
      this.emit({ t: 'kill', id: t.id, tt: 'p', by: info.by, bk: info.byKind, w: info.w, x: r1(t.x), y: r1(t.y - t.h / 2), vx: Math.round(t.vx), vy: Math.round(t.vy) });
    } else {
      t.st = 'dead';
      this.enemies.delete(t.id);
      if (killer) {
        killer.kills++;
        killer.score += ENEMY_STATS[t.k].score * 10;
        if (info.w !== 'super') killer.super = Math.min(PLAYER.superMax, killer.super + (t.k === 'boss' ? 0 : 5));
      }
      this.emit({ t: 'kill', id: t.id, tt: 'e', by: info.by, bk: info.byKind, w: info.w, x: r1(t.x), y: r1(t.y - t.h / 2), vx: Math.round(t.vx), vy: Math.round(t.vy), k: t.k });
      if (t.look && t.look.bloat && t.k === 'brute') {
        const x = t.x, y = t.y - t.h / 2;
        this.pending.push({ t: 0.1, fn: () => this.explode(x, y, 150, 20, 500, { by: t.id, byKind: 'e', w: 'acid', kind: 'acid', selfMul: 0 }) });
      }
      const roll = this.rng.f();
      if (t.k === 'brute') this.dropPickup('weapon', HEAVY_KEYS[Math.floor(this.rng.f() * HEAVY_KEYS.length)], t.x, t.y - 40);
      else if (t.k !== 'boss') {
        if (roll < 0.16) this.dropPickup('health', null, t.x, t.y - 40);
        else if (roll < 0.23) this.dropPickup('bomb', null, t.x, t.y - 40);
        else if (roll < 0.28) this.dropPickup('weapon', HEAVY_KEYS[Math.floor(this.rng.f() * HEAVY_KEYS.length)], t.x, t.y - 40);
      }
    }
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
      this.hurt(t, dm, { by: info.by, byKind: info.byKind, w: info.w, x: cx, y: cy, kx: ux * knock * f, ky: uy * knock * f, explosive: true, stun: info.kind === 'super' ? 0.5 : 0 });
    }
    for (const pr of this.props.values()) {
      if (pr.dead) continue;
      const nx = clamp(x, pr.x, pr.x + pr.w), ny = clamp(y, pr.y, pr.y + pr.h);
      const d = Math.hypot(nx - x, ny - y);
      if (d > radius) continue;
      this.damageProp(pr, dmg * (1 - (d / radius) * 0.5), info);
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
    const cx = pr.x + pr.w / 2, cy = pr.y + pr.h / 2;
    this.emit({ t: 'break', id: pr.id, k: pr.k, x: r1(cx), y: r1(cy) });
    if (pr.k === 'barrel') {
      const src = { by: info.by, byKind: info.byKind || 'env', w: 'barrel', kind: 'barrel', selfMul: 0.5 };
      this.pending.push({ t: 0.12, fn: () => this.explode(cx, cy, 175, 75, 950, src) });
    } else if (pr.k === 'crate') {
      // anything stacked on top collapses too
      for (const o of this.props.values()) {
        if (o.dead || o.k !== 'crate') continue;
        if (Math.abs(o.y + o.h - pr.y) < 3 && o.x < pr.x + pr.w && o.x + o.w > pr.x) {
          this.pending.push({ t: 0.15, fn: () => this.breakProp(o, info) });
        }
      }
      const r = this.rng.f();
      if (r < 0.22) this.dropPickup('health', null, cx, cy);
      else if (r < 0.34) this.dropPickup('bomb', null, cx, cy);
      else if (r < 0.42) this.dropPickup('weapon', HEAVY_KEYS[Math.floor(this.rng.f() * HEAVY_KEYS.length)], cx, cy);
    }
  }

  interact(p) {
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

  // --------------------------------------------------------------- pickups

  dropPickup(k, w, x, y, ammo) {
    const id = this.uid++;
    const g = groundProbe(this.phys, { x, y, w: 20 }, 800, false);
    const py = g ? g.y - 34 : y;
    const pk = { id, k, w, x, y: py, active: true, respawn: 0, ttl: 20, t: 0, ammo };
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

  touchPickups(p, cmd) {
    for (const pk of this.pickups.values()) {
      if (!pk.active) continue;
      if (Math.abs(p.x - pk.x) > 40 || Math.abs(p.y - p.h / 2 - pk.y) > 64) continue;
      if (pk.k === 'health') {
        if (p.hp >= p.maxHp) continue;
        p.hp = Math.min(p.maxHp, p.hp + 60);
      } else if (pk.k === 'bomb') {
        if (p.bombs >= PLAYER.bombMax) continue;
        p.bombs++;
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

  // ------------------------------------------------------------------ modes

  playersIn(P) {
    for (const p of this.players.values()) {
      if (p.alive && p.x > P.x1 && p.x < P.x2 && p.y > P.y1 && p.y <= P.y2 + 1) return true;
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
    this.emit({ t: 'panel', id: P.id, s: 'active' });
    for (const e of this.enemies.values()) {
      if (e.panel !== P.id || e.st !== 'asleep') continue;
      e.st = 'waking';
      e.wakeT = 0.15 + this.rng.f() * 0.6;
      if (e.k === 'boss') {
        e.wakeT = 1.2;
        this.bossId = e.id;
        this.emit({ t: 'boss', id: e.id, name: e.name });
      }
    }
  }

  updateStory() {
    if (this.phase === 'intro' || this.phase === 'turning') {
      this.phaseT -= DT;
      if (this.phaseT <= 0) { this.phase = 'play'; this.emit({ t: 'phase', ph: 'play' }); }
      return;
    }
    const lv = this.level;
    if (this.phase === 'play') {
      if (this.tick % 3 === 0) {
        for (const P of lv.panels) {
          const s = this.panelState[P.id];
          if (s === 'asleep' && this.playersIn(P)) this.activatePanel(P);
          else if (s === 'active' && this.enemiesIn(P.id) === 0) {
            const waves = this.pendingWaves.get(P.id);
            if (waves && waves.length) {
              const next = waves.shift();
              for (const def of next) this.addEnemy(def, 'drawing');
              this.emit({ t: 'wave', panel: P.id });
            } else this.clearPanel(P);
          }
        }
      }
      if (lv.path.every((id) => this.panelState[id] === 'cleared')) {
        this.phase = 'cleared';
        this.phaseT = 3.2;
        this.emit({ t: 'spreadclear', final: lv.final });
      }
      let alive = 0;
      for (const p of this.players.values()) if (p.alive) alive++;
      if (this.players.size > 0 && alive === 0) {
        this.wipeT += DT;
        if (this.wipeT > 1.2) {
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
        } else this.loadSpread(this.spreadIndex + 1, 'turn');
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
    for (const l of lv.links) {
      if (!l.gate || l.from !== P.id) continue;
      const g = lv.gates.find((gg) => gg.link === l.id);
      if (g && !this.gatesOpen.has(g.id)) {
        this.gatesOpen.add(g.id);
        this.phys.remove(this.gateIds.get(g.id));
        this.emit({ t: 'gate', id: g.id });
      }
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
    return {
      t: this.tick, ph: this.phase, pt: r1(this.phaseT), mt: Math.round(this.matchT),
      p: ps, e: es,
      boss: boss ? { id: boss.id, hp: boss.hp, max: boss.maxHp, name: boss.name } : null,
    };
  }

  meSnap(id) {
    const p = this.players.get(id);
    if (!p) return null;
    return {
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, h: p.h, onGround: p.onGround, crouch: p.crouch, climb: p.climb,
      jumps: p.jumps, coyote: p.coyote, jbuf: p.jbuf, jumpHeld: p.jumpHeld, dashT: p.dashT, dashCd: p.dashCd,
      dashDir: p.dashDir, dropT: p.dropT, stun: p.stun, facing: p.facing, iframes: p.iframes, superT: p.superT,
      groundOneway: p.groundOneway,
      alive: p.alive, respawnT: r1(p.respawnT), hp: p.hp, mag: p.mag, heavy: p.heavy, heavyAmmo: p.heavyAmmo,
      slot: p.slot, cd: p.cd, rl: p.rl, bombs: p.bombs, bombT: r1(p.bombT), super: r1(p.super),
      meleeCd: p.meleeCd, invuln: p.invuln, combo: p.combo, ack: p.lastSeq,
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
        props: [...this.props.values()].map((pr) => ({ id: pr.id, k: pr.k, x: pr.x, y: pr.y, w: pr.w, h: pr.h, st: pr.st, dir: pr.dir })),
        pickups: [...this.pickups.values()].filter((pk) => pk.active).map(pickupInfo),
        asleep: [...this.enemies.values()].filter((e) => e.st === 'asleep').map(enemySnap),
        gates: [...this.gatesOpen],
        panels: this.panelState.slice(),
      },
    };
  }
}

// -------------------------------------------------------------------- utils

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
  return {
    id: p.id, x: r1(p.x), y: r1(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy), a: r2(p.aim), f,
    hp: Math.max(0, Math.round(p.hp)), w: weaponOf(p), k: p.kills, d: p.deaths, s: p.score, sp: Math.round(p.super), h: p.h,
  };
}

function enemySnap(e) {
  const st = e.st === 'asleep' ? 0 : e.st === 'drawing' ? 1 : e.st === 'waking' ? 2 : 3;
  return {
    id: e.id, k: e.k, x: r1(e.x), y: r1(e.y), vx: Math.round(e.vx), vy: Math.round(e.vy), a: r2(e.aim), f: e.facing,
    st, hp: Math.max(0, Math.round(e.hp)), mh: e.maxHp, act: e.act, at: r2(e.actT), p: e.panel, w: e.w, h: e.h,
    g: e.onGround ? 1 : 0,
  };
}
