// Screen-space HUD, drawn in comic style: portrait panel, health/super bars,
// weapon caption box, kill feed captions, boss bar, crosshair + hitmarkers,
// announcements, the SPLASH PAGE super intro, death card and results page.

import { INK, FONT, rand, shade, mix, rgba, halftone, starburstPath, comicText as comicTextRaw, comicTextCached, captionBox, speedLines, wobblyRectPath, inkFill } from './ink.js';

// HUD text is screen-space and mostly static, so cache the lettering.
const comicText = (ctx, text, x, y, size, o = {}) => {
  const m = ctx.getTransform();
  if (m.a !== 1 || m.b !== 0 || m.c !== 0 || m.d !== 1) return comicTextRaw(ctx, text, x, y, size, o);
  return comicTextCached(ctx, text, x, y, Math.round(size * 2) / 2, o);
};
import { drawPortrait, drawWeapon, makeAnim } from './characters.js';
import { WEAPONS } from '../../shared/weapons.js';
import { PLAYER, BRAWL } from '../../shared/constants.js';
import { HEROES } from '../../shared/themes.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);

const WEAPON_NAMES = {
  pistol: 'PEACEMAKER', shotgun: 'KA-BLAMMER', smg: 'RAT-A-TAT', launcher: 'ONOMATO-CANNON', rail: 'INK RAILGUN', blade: 'PANEL CUTTER',
  punch: 'KNUCKLE SANDWICH', combo: 'KNUCKLE SANDWICH', bomb: 'INK BOMB', super: 'SPLASH PAGE', barrel: 'EXPLODING BARREL', fall: 'GRAVITY',
  swipe: 'CLAWS', charge: 'CHARGE', quake: 'GROUND POUND', dive: 'DIVE BOMB', acid: 'ACID', ebullet: 'BULLET', orb: 'ENERGY ORB', bossorb: 'DOOM ORB',
};

export class HUD {
  constructor() {
    this.anns = [];
    this.bigMsg = null;
    this.toasts = [];
    this.feedItems = [];
    this.deathInfo = null;
    this.splash = null;
    this.bossIntroT = 0;
    this.bossName = '';
    this.hurtT = 0;
    this.hpLag = PLAYER.hp;
    this.resultsT = 0;
    this.resultsData = null;
    this.showScores = false;
    this.hintT = 14;
    this.portraitAnim = makeAnim(9);
    this.time = 0;
    this.lowHpBeat = 0;
    this.superReadyPlayed = false;
  }

  // ------------------------------------------------------------ triggers

  announce(text, sub = null, dur = 1.6) {
    // one at a time; a queued announcement hurries the current one along
    this.anns.push({ text, sub, t: 0, dur, seed: (Math.random() * 1e5) | 0 });
    if (this.anns.length > 3) this.anns.splice(1, 1);
  }
  big(text, sub, dur = 2.5) { this.bigMsg = { text, sub, t: 0, dur }; }
  toast(text, big) { this.toasts.push({ text, big, t: 0 }); if (this.toasts.length > 3) this.toasts.shift(); }
  feed(killer, victim, weapon, mine) {
    this.feedItems.unshift({ killer, victim, weapon, mine, t: 0 });
    if (this.feedItems.length > 5) this.feedItems.pop();
  }
  hurt() { this.hurtT = 0.35; }
  death(killer, weapon) { this.deathInfo = { killer, weapon: WEAPON_NAMES[weapon] || String(weapon || '').toUpperCase(), t: 0 }; }
  splashPage(rp) { this.splash = { look: rp.look, name: rp.name, t: 0 }; }
  bossIntro(name) { this.bossIntroT = 3.2; this.bossName = name; }
  victory(world) { this.resultsT = 11; this.resultsData = { kind: 'victory', world }; }
  results(world, winner) { this.resultsT = BRAWL.overTime; this.resultsData = { kind: 'brawl', world, winner }; }

  update(dt) {
    this.time += dt;
    if (this.anns.length) {
      const a = this.anns[0];
      a.t += dt * (this.anns.length > 1 && a.t > 0.5 ? 2.5 : 1);
      if (a.t >= a.dur) this.anns.shift();
    }
    if (this.bigMsg && (this.bigMsg.t += dt) > this.bigMsg.dur) this.bigMsg = null;
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < 1.8);
    for (const f of this.feedItems) f.t += dt;
    this.feedItems = this.feedItems.filter((f) => f.t < 6);
    if (this.splash && (this.splash.t += dt) > 1.0) this.splash = null;
    this.bossIntroT = Math.max(0, this.bossIntroT - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.resultsT = Math.max(0, this.resultsT - dt);
    this.hintT = Math.max(0, this.hintT - dt);
    if (this.deathInfo) this.deathInfo.t += dt;
  }

  // --------------------------------------------------------------- draw

  draw(ctx, W, H, world, fx, input, cam, audio) {
    const u = Math.min(H / 900, W / 1300);
    const me = world.meState;
    const pred = world.pred.p;
    const rp = world.meRender();
    ctx.save();
    ctx.lineJoin = 'round';

    this.drawVignettes(ctx, W, H, u, fx, me);
    if (me && rp) {
      if (me.alive) {
        this.drawDamageDirs(ctx, W, H, u, fx);
        this.drawPlayerCard(ctx, W, H, u, world, me, pred, rp, audio);
        this.drawWeaponBox(ctx, W, H, u, world, pred);
        this.drawPrompts(ctx, W, H, u, world, pred);
        this.deathInfo = null;
      } else {
        this.drawDeathCard(ctx, W, H, u, me);
      }
    }
    this.drawTopLeft(ctx, W, H, u, world);
    this.drawFeed(ctx, W, H, u);
    this.drawMinimap(ctx, W, H, u, world);
    if (world.boss && world.phase === 'play') this.drawBossBar(ctx, W, H, u, world.boss);
    if (this.bossIntroT > 0) this.drawBossIntro(ctx, W, H, u);
    this.drawAnnouncements(ctx, W, H, u);
    this.drawToasts(ctx, W, H, u);
    if (this.bigMsg) this.drawBig(ctx, W, H, u);
    if (this.splash) this.drawSplash(ctx, W, H, u);
    if (this.hintT > 0 && world.phase === 'play') this.drawHints(ctx, W, H, u);
    if (this.resultsT > 0 && this.resultsData) this.drawResults(ctx, W, H, u);
    else if (this.showScores) this.drawScoreboard(ctx, W, H, u, world);
    if (me && me.alive && world.phase !== 'intro' && world.phase !== 'turning' && !input.usingPad) this.drawCrosshair(ctx, input.mouse.x * cam.dpr, input.mouse.y * cam.dpr, u, fx, pred);
    ctx.restore();
  }

  drawVignettes(ctx, W, H, u, fx, me) {
    if (fx.vignette > 0.02) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(200,0,0,0)');
      g.addColorStop(1, `rgba(200,0,0,${0.55 * fx.vignette})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (me && me.alive && me.hp < PLAYER.hp * 0.3) {
      const beat = 0.5 + 0.5 * Math.sin(this.time * 7);
      ctx.save();
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.65);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(120,0,0,${0.25 + beat * 0.2})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (fx.heal > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(0,200,80,0)');
      g.addColorStop(1, `rgba(60,220,100,${0.35 * fx.heal})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawDamageDirs(ctx, W, H, u, fx) {
    for (const d of fx.dmgDirs) {
      const k = 1 - d.t / 0.9;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(d.a);
      ctx.globalAlpha = k;
      const r = Math.min(W, H) * 0.3;
      ctx.beginPath();
      ctx.moveTo(r, -34 * u);
      ctx.lineTo(r + 46 * u, 0);
      ctx.lineTo(r, 34 * u);
      ctx.lineTo(r + 12 * u, 0);
      ctx.closePath();
      ctx.fillStyle = '#e8262b';
      ctx.fill();
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawPlayerCard(ctx, W, H, u, world, me, pred, rp, audio) {
    const x = 24 * u, y = H - 176 * u;
    // portrait panel
    ctx.save();
    ctx.translate(x + 75 * u, y + 76 * u);
    ctx.rotate(-0.04);
    const frame = wobblyRectPath(-72 * u, -72 * u, 144 * u, 144 * u, 1.2 * u, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.save(); ctx.translate(6 * u, 6 * u); ctx.fill(frame); ctx.restore();
    const hurt = this.hurtT > 0;
    ctx.fillStyle = hurt ? '#e8262b' : world.theme.palette.caption || '#ffe36e';
    ctx.fill(frame);
    ctx.save();
    ctx.clip(frame);
    ctx.fillStyle = halftone(ctx, rgba(shade(hurt ? '#e8262b' : world.theme.palette.accent, -0.1), 0.45), 7 * u, 2 * u);
    ctx.fillRect(-80 * u, -80 * u, 160 * u, 160 * u);
    speedLines(ctx, 0, 0, 40 * u, 140 * u, 18, 3, rgba(INK, 0.25), 2);
    this.portraitAnim.t += 1 / 60;
    drawPortrait(ctx, rp.look, 0, -8 * u, 64 * u, { anim: this.portraitAnim, flash: hurt ? this.hurtT * 2 : 0 });
    ctx.restore();
    ctx.lineWidth = 5 * u;
    ctx.strokeStyle = INK;
    ctx.stroke(frame);
    ctx.restore();
    // name
    comicText(ctx, rp.name, x + 164 * u, y + 20 * u, 26 * u, { align: 'left', fill: '#ffffff', fill2: '#ffe14a', extrude: 3 * u, outline: 3 * u, jitter: 0.03, seed: 2 });

    // health bar
    const hp = clamp(me.hp / PLAYER.hp, 0, 1);
    this.hpLag += (me.hp - this.hpLag) * Math.min(1, (me.hp < this.hpLag ? 2.5 : 10) / 60);
    const lag = clamp(this.hpLag / PLAYER.hp, 0, 1);
    const bx = x + 160 * u, by = y + 44 * u, bw = 320 * u, bh = 36 * u;
    const bar = (fill, frac, col) => {
      ctx.beginPath();
      ctx.moveTo(bx + 12 * u, by);
      ctx.lineTo(bx + 12 * u + (bw - 12 * u) * frac, by);
      ctx.lineTo(bx + (bw - 12 * u) * frac, by + bh);
      ctx.lineTo(bx, by + bh);
      ctx.closePath();
      ctx.fillStyle = col;
      if (fill) ctx.fill(); else ctx.stroke();
    };
    ctx.lineWidth = 5 * u;
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    bar(true, 1, '#1b1b1b');
    bar(true, lag, '#ffffff');
    const hpCol = hp > 0.5 ? '#35c24a' : hp > 0.25 ? '#ffc21f' : '#e8262b';
    bar(true, hp, hpCol);
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw * hp, bh * 0.45);
    ctx.clip();
    bar(true, hp, 'rgba(255,255,255,0.35)');
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by + bh * 0.5, bw, bh * 0.5);
    ctx.clip();
    bar(true, hp, halftone(ctx, 'rgba(0,0,0,0.35)', 5 * u, 1.3 * u));
    ctx.restore();
    ctx.strokeStyle = INK;
    bar(false, 1, INK);
    comicText(ctx, String(Math.max(0, Math.ceil(me.hp))), bx + bw - 40 * u, by + bh / 2 + 2 * u, 30 * u, { fill: '#ffffff', fill2: '#dddddd', extrude: 3 * u, outline: 3 * u, jitter: 0, seed: 1 });

    // super meter
    const sp = clamp(pred.super / PLAYER.superMax, 0, 1);
    const sy = by + bh + 10 * u, sh = 20 * u, sw = bw * 0.86;
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(bx, sy, sw, sh);
    const full = sp >= 1;
    const pulse = full ? 0.5 + 0.5 * Math.sin(this.time * 10) : 0;
    ctx.fillStyle = full ? mix('#ffe14a', '#ffffff', pulse * 0.6) : '#23d5e8';
    ctx.fillRect(bx, sy, sw * sp, sh);
    ctx.fillStyle = halftone(ctx, 'rgba(0,0,0,0.3)', 4 * u, 1 * u);
    ctx.fillRect(bx, sy + sh * 0.5, sw * sp, sh * 0.5);
    ctx.lineWidth = 4 * u;
    ctx.strokeRect(bx, sy, sw, sh);
    if (full) {
      comicText(ctx, 'SPLASH PAGE READY! [F]', bx + sw / 2, sy + sh / 2 + 1 * u, 18 * u, { fill: '#ffffff', fill2: '#ffe14a', extrude: 2 * u, outline: 3 * u, jitter: 0.05, seed: 4 });
      if (!this.superReadyPlayed) { this.superReadyPlayed = true; audio && audio.play('superReady'); }
    } else {
      this.superReadyPlayed = false;
      ctx.font = `${14 * u}px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('SUPER', bx + 6 * u, sy + sh / 2 + 1 * u);
    }

    // ink bombs
    for (let i = 0; i < PLAYER.bombMax; i++) {
      const cx = bx + sw + 26 * u + i * 30 * u, cy = sy + sh / 2;
      const has = i < pred.bombs;
      ctx.save();
      ctx.globalAlpha = has ? 1 : 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy + 2 * u, 11 * u, 0, TAU);
      ctx.fillStyle = '#1b1b1b';
      ctx.fill();
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 5 * u, cy - 7 * u);
      ctx.quadraticCurveTo(cx + 10 * u, cy - 16 * u, cx + 15 * u, cy - 13 * u);
      ctx.strokeStyle = '#c49a5a';
      ctx.lineWidth = 2.5 * u;
      ctx.stroke();
      if (has) {
        ctx.fillStyle = '#ffb21f';
        ctx.beginPath();
        ctx.arc(cx + 15 * u, cy - 13 * u, 3 * u, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.font = `${13 * u}px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText('[G]', bx + sw + 16 * u + PLAYER.bombMax * 30 * u, sy + sh / 2);

    // low hp heartbeat sound
    if (me.hp < PLAYER.hp * 0.3 && me.hp > 0) {
      this.lowHpBeat -= 1 / 60;
      if (this.lowHpBeat <= 0) { this.lowHpBeat = 0.9; audio && audio.play('lowHp', { vol: 0.6 }); }
    }
  }

  drawWeaponBox(ctx, W, H, u, world, pred) {
    const wk = pred.slot === 1 && pred.heavy ? pred.heavy : 'pistol';
    const Wd = WEAPONS[wk];
    const x = W - 330 * u, y = H - 150 * u;
    const box = wobblyRectPath(x, y, 300 * u, 120 * u, 1 * u, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.save(); ctx.translate(6 * u, 6 * u); ctx.fill(box); ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.fill(box);
    ctx.save();
    ctx.clip(box);
    ctx.fillStyle = halftone(ctx, rgba(Wd.color || '#ffe14a', 0.55), 7 * u, 2.2 * u);
    ctx.fillRect(x, y, 300 * u, 120 * u);
    ctx.restore();
    ctx.lineWidth = 5 * u;
    ctx.strokeStyle = INK;
    ctx.stroke(box);
    // name caption
    captionBox(ctx, x - 10 * u, y - 22 * u, Wd.name, { size: 22 * u, fill: world.theme.palette.caption || '#ffe36e', lw: 3 * u, seed: 9 });
    // icon
    ctx.save();
    ctx.translate(x + 40 * u, y + 70 * u);
    ctx.scale(2.3 * u, 2.3 * u);
    ctx.rotate(-0.12);
    drawWeapon(ctx, wk, {});
    ctx.restore();
    // ammo
    let ammo, max;
    if (wk === 'pistol') { ammo = pred.mag; max = PLAYER.mag; }
    else if (Wd.ammo > 0) { ammo = pred.heavyAmmo; max = Wd.ammo; }
    const ammoText = ammo == null ? '∞' : String(ammo);
    const low = ammo != null && ammo <= Math.max(2, max * 0.2);
    comicText(ctx, ammoText, x + 240 * u, y + 64 * u, 58 * u, { fill: low ? '#ff5a3a' : '#ffffff', fill2: low ? '#e8262b' : '#ffe14a', extrude: 5 * u, outline: 5 * u, jitter: 0.03, seed: 6 });
    if (max != null) {
      ctx.font = `${16 * u}px ${FONT}`;
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.fillText('/' + max, x + 240 * u, y + 102 * u);
    }
    if (pred.rl > 0 && wk === 'pistol') {
      const k = 1 - pred.rl / WEAPONS.pistol.reload;
      ctx.fillStyle = INK;
      ctx.fillRect(x + 20 * u, y + 104 * u, 160 * u, 8 * u);
      ctx.fillStyle = '#ffe14a';
      ctx.fillRect(x + 20 * u, y + 104 * u, 160 * u * k, 8 * u);
      comicText(ctx, 'RELOADING!', x + 100 * u, y + 90 * u, 18 * u, { fill: '#ffffff', fill2: '#ffe14a', extrude: 2 * u, outline: 3 * u, seed: 8 });
    }
    // other slot
    if (pred.heavy) {
      const other = wk === 'pistol' ? pred.heavy : 'pistol';
      ctx.font = `${15 * u}px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'right';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4 * u;
      const t = `[Q] ${WEAPONS[other].name}`;
      ctx.strokeText(t, x + 296 * u, y + 138 * u);
      ctx.fillText(t, x + 296 * u, y + 138 * u);
    }
  }

  drawPrompts(ctx, W, H, u, world, pred) {
    let text = null;
    for (const pk of world.pickups.values()) {
      if (pk.k !== 'weapon') continue;
      if (Math.abs(pk.x - pred.x) < 44 && Math.abs(pred.y - pred.h / 2 - pk.y) < 70 && pred.heavy && pk.w !== pred.heavy) text = `[E] SWAP FOR ${WEAPONS[pk.w].name}`;
    }
    if (!text) {
      for (const pr of world.props.values()) {
        if (pr.k === 'table' && pr.st === 'up' && Math.abs(pr.x + pr.w / 2 - pred.x) < 110 && Math.abs(pr.y + pr.h - pred.y) < 40) text = '[E] FLIP TABLE FOR COVER';
      }
    }
    if (!text && world.phys && world.phys.findLadder(pred) && !pred.climb) text = '[W]/[S] CLIMB';
    if (!text) return;
    captionBox(ctx, W / 2, H - 230 * u, text, { size: 22 * u, align: 'center', fill: '#ffffff', lw: 3 * u, seed: 4 });
  }

  drawDeathCard(ctx, W, H, u, me) {
    const d = this.deathInfo || { killer: 'THE COMIC', weapon: '', t: 1 };
    const k = clamp(d.t / 0.3, 0, 1);
    ctx.save();
    ctx.translate(W / 2, H * 0.72);
    ctx.scale(easeOutBack(k), easeOutBack(k));
    ctx.rotate(-0.03);
    captionBox(ctx, 0, -60 * u, `KO'D BY ${d.killer}${d.weapon ? ' — ' + d.weapon : ''}`, { size: 30 * u, align: 'center', fill: '#ffffff', lw: 4 * u, maxW: 900 * u, seed: 2 });
    const secs = Math.max(0, Math.ceil(me.respawnT));
    comicText(ctx, secs > 0 ? `BACK IN ${secs}...` : 'GET READY...', 0, 40 * u, 54 * u, { fill: '#ffffff', fill2: '#ffe14a', extrude: 6 * u, outline: 6 * u, seed: secs });
    ctx.restore();
  }

  drawTopLeft(ctx, W, H, u, world) {
    if (!world.comic) return;
    const c = world.comic;
    const lv = world.level;
    const title = `${c.title} #${c.issue}`;
    captionBox(ctx, 18 * u, 16 * u, title, { size: 20 * u, fill: world.theme.palette.caption || '#ffe36e', lw: 3 * u, maxW: 520 * u, seed: 1 });
    let obj = '';
    if (world.mode === 'story') {
      const pages = lv.pages.map((p) => p.num).join('-');
      let n = 0;
      const mp = world.myPanel();
      for (const e of world.enemies.values()) if (!e.asleep && (!mp || e.panel === mp.id)) n++;
      const cleared = world.panelState.filter((s, i) => s === 'cleared' && lv.path.includes(i)).length;
      obj = `PAGES ${pages} · PANELS ${cleared}/${lv.path.length}` + (n ? ` · ${n} FOE${n > 1 ? 'S' : ''} HERE` : '');
    } else {
      const m = Math.max(0, world.matchT | 0);
      obj = `BRAWL · FIRST TO ${BRAWL.killsToWin} KOs · ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    }
    ctx.font = `${17 * u}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 4 * u;
    ctx.strokeStyle = INK;
    ctx.strokeText(obj, 24 * u, 62 * u);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(obj, 24 * u, 62 * u);
    if (world.code && world.code !== 'SOLO') {
      const t = `ROOM ${world.code} · ${[...world.players.values()].filter((p) => !p.bot).length} HERO(ES)`;
      ctx.strokeText(t, 24 * u, 86 * u);
      ctx.fillStyle = '#ffe14a';
      ctx.fillText(t, 24 * u, 86 * u);
    }
  }

  drawFeed(ctx, W, H, u) {
    let y = 16 * u;
    for (const f of this.feedItems) {
      const a = f.t > 5 ? 6 - f.t : 1;
      ctx.save();
      ctx.globalAlpha = a;
      const w = WEAPON_NAMES[f.weapon] || '';
      const text = f.killer && f.killer !== f.victim ? `${f.killer} ▸ ${w} ▸ ${f.victim}` : `${f.victim} WAS ERASED`;
      const r = captionBox(ctx, W - 16 * u, y, text, { size: 17 * u, align: 'right', fill: f.mine ? '#ffe36e' : '#ffffff', lw: 3 * u, maxW: 520 * u, seed: 3, shadow: false });
      y += r.h + 6 * u;
      ctx.restore();
    }
  }

  drawMinimap(ctx, W, H, u, world) {
    const lv = world.level;
    if (!lv) return;
    const mw = 190 * u, mh = mw * (lv.height / lv.width);
    const x = W / 2 - mw / 2, y = H - mh - 14 * u;
    const s = mw / lv.width;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#f3ead3';
    ctx.fillRect(x, y, mw, mh);
    ctx.lineWidth = 2 * u;
    ctx.strokeStyle = INK;
    ctx.strokeRect(x, y, mw, mh);
    ctx.beginPath();
    ctx.moveTo(x + mw / 2, y);
    ctx.lineTo(x + mw / 2, y + mh);
    ctx.stroke();
    for (const P of lv.panels) {
      const st = world.panelState[P.id];
      ctx.fillStyle = st === 'locked' ? '#b8c6d8' : st === 'active' ? '#ffb0a0' : st === 'cleared' ? '#c8f0b8' : '#fff7d6';
      ctx.fillRect(x + P.x1 * s, y + P.y1 * s, (P.x2 - P.x1) * s, (P.y2 - P.y1) * s);
      ctx.lineWidth = 1.2 * u;
      ctx.strokeRect(x + P.x1 * s, y + P.y1 * s, (P.x2 - P.x1) * s, (P.y2 - P.y1) * s);
    }
    for (const e of world.enemies.values()) {
      if (e.asleep) continue;
      ctx.fillStyle = '#e8262b';
      ctx.fillRect(x + e.x * s - 1.5 * u, y + (e.y - e.h / 2) * s - 1.5 * u, 3 * u, 3 * u);
    }
    for (const p of world.players.values()) {
      if (!p.alive) continue;
      const me = p.id === world.me;
      ctx.beginPath();
      ctx.arc(x + p.x * s, y + (p.y - 40) * s, (me ? 4 + Math.sin(this.time * 8) : 3) * u, 0, TAU);
      ctx.fillStyle = me ? '#ffffff' : p.color;
      ctx.fill();
      ctx.lineWidth = 1.5 * u;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBossBar(ctx, W, H, u, boss) {
    const bw = Math.min(760 * u, W * 0.6), bh = 26 * u;
    const x = W / 2 - bw / 2, y = 60 * u;
    comicText(ctx, boss.name, W / 2, y - 18 * u, 32 * u, { fill: '#ffffff', fill2: '#ff7a1a', extrude: 4 * u, outline: 4 * u, seed: 5 });
    ctx.fillStyle = INK;
    ctx.fillRect(x - 4 * u, y + 6 * u, bw + 8 * u, bh + 8 * u);
    const k = clamp(boss.hp / boss.max, 0, 1);
    ctx.fillStyle = '#5a0a0a';
    ctx.fillRect(x, y + 10 * u, bw, bh);
    ctx.fillStyle = '#e8262b';
    ctx.fillRect(x, y + 10 * u, bw * k, bh);
    ctx.fillStyle = halftone(ctx, 'rgba(255,230,80,0.45)', 6 * u, 1.8 * u);
    ctx.fillRect(x, y + 10 * u, bw * k, bh * 0.5);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.moveTo(x + bw / 2, y + 10 * u);
    ctx.lineTo(x + bw / 2, y + 10 * u + bh);
    ctx.stroke();
  }

  drawBossIntro(ctx, W, H, u) {
    const t = 3.2 - this.bossIntroT;
    const k = clamp(t / 0.35, 0, 1);
    const out = this.bossIntroT < 0.4 ? this.bossIntroT / 0.4 : 1;
    ctx.save();
    ctx.globalAlpha = out;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H * 0.34, W, H * 0.24);
    ctx.fillStyle = '#e8262b';
    ctx.fillRect(0, H * 0.34, W, 8 * u);
    ctx.fillRect(0, H * 0.58 - 8 * u, W, 8 * u);
    ctx.translate(W / 2 + (1 - k) * W * 0.5, H * 0.46);
    comicText(ctx, 'ENTER', -10 * u, -46 * u, 30 * u, { fill: '#ffffff', fill2: '#dddddd', extrude: 3 * u, outline: 3 * u, seed: 2 });
    comicText(ctx, this.bossName, 0, 16 * u, 86 * u, { fill: '#fff36b', fill2: '#ff3a1a', extrude: 10 * u, outline: 8 * u, seed: 7, rot: -0.04 });
    ctx.restore();
  }

  drawAnnouncements(ctx, W, H, u) {
    this.anns.slice(0, 1).forEach((a, i) => {
      const k = clamp(a.t / 0.25, 0, 1);
      const out = a.t > a.dur - 0.3 ? (a.dur - a.t) / 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = out;
      ctx.translate(W / 2, H * 0.24 + i * 90 * u);
      const s = easeOutBack(k);
      ctx.scale(s, s);
      ctx.rotate(-0.04);
      const burst = starburstPath(0, 0, 150 * u, 210 * u, 14, a.seed);
      ctx.save();
      ctx.scale(1.6, 0.42);
      ctx.fillStyle = '#ffe14a';
      ctx.fill(burst);
      ctx.lineWidth = 5 * u;
      ctx.strokeStyle = INK;
      ctx.stroke(burst);
      ctx.restore();
      comicText(ctx, a.text, 0, 0, 52 * u, { fill: '#ffffff', fill2: '#ff7a1a', extrude: 7 * u, outline: 6 * u, seed: a.seed });
      if (a.sub) {
        ctx.font = `${20 * u}px ${FONT}`;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 5 * u;
        ctx.textAlign = 'center';
        ctx.strokeText(a.sub, 0, 58 * u);
        ctx.fillText(a.sub, 0, 58 * u);
      }
      ctx.restore();
    });
  }

  drawToasts(ctx, W, H, u) {
    this.toasts.forEach((t, i) => {
      const k = clamp(t.t / 0.2, 0, 1);
      const a = t.t > 1.4 ? (1.8 - t.t) / 0.4 : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(W - 180 * u, H - 200 * u - i * 44 * u - t.t * 20 * u);
      const s = easeOutBack(k);
      ctx.scale(s, s);
      comicText(ctx, t.text, 0, 0, (t.big ? 36 : 26) * u, { fill: '#ffffff', fill2: t.big ? '#ffe14a' : '#b8fbff', extrude: 4 * u, outline: 4 * u, seed: i + 3 });
      ctx.restore();
    });
  }

  drawBig(ctx, W, H, u) {
    const m = this.bigMsg;
    const k = clamp(m.t / 0.4, 0, 1);
    const out = m.t > m.dur - 0.4 ? (m.dur - m.t) / 0.4 : 1;
    ctx.save();
    ctx.globalAlpha = out;
    ctx.translate(W / 2, H * 0.42);
    ctx.scale(easeOutBack(k), easeOutBack(k));
    ctx.rotate(-0.05);
    const r = captionBox(ctx, 0, -70 * u, m.text, { size: 84 * u, align: 'center', fill: '#ffe36e', lw: 7 * u, maxW: W * 0.9, seed: 12, pad: 34 * u });
    if (m.sub) captionBox(ctx, 60 * u, -70 * u + r.h - 10 * u, m.sub, { size: 26 * u, align: 'center', fill: '#ffffff', lw: 4 * u, maxW: W * 0.7, seed: 13 });
    ctx.restore();
  }

  drawSplash(ctx, W, H, u) {
    const s = this.splash;
    const t = s.t;
    const inK = clamp(t / 0.15, 0, 1);
    const outK = t > 0.75 ? (1 - t) / 0.25 : 1;
    ctx.save();
    ctx.globalAlpha = outK;
    // diagonal panel sweeping across the screen
    ctx.translate((1 - easeOutBack(inK)) * -W, 0);
    ctx.beginPath();
    ctx.moveTo(0, H * 0.18);
    ctx.lineTo(W, H * 0.1);
    ctx.lineTo(W, H * 0.78);
    ctx.lineTo(0, H * 0.88);
    ctx.closePath();
    ctx.fillStyle = '#ffe14a';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = halftone(ctx, 'rgba(232,38,43,0.6)', 12 * u, 4 * u);
    ctx.fillRect(0, 0, W, H);
    speedLines(ctx, W * 0.3, H * 0.5, 120 * u, W, 60, 9, INK, 3);
    drawPortrait(ctx, s.look, W * 0.28, H * 0.5, 240 * u, {});
    ctx.restore();
    ctx.lineWidth = 10 * u;
    ctx.strokeStyle = INK;
    ctx.stroke();
    comicText(ctx, 'SPLASH', W * 0.66, H * 0.4, 130 * u, { fill: '#ffffff', fill2: '#23d5e8', extrude: 14 * u, outline: 10 * u, seed: 3, rot: -0.08 });
    comicText(ctx, 'PAGE!!', W * 0.7, H * 0.6, 150 * u, { fill: '#fff36b', fill2: '#ff3a1a', extrude: 16 * u, outline: 11 * u, seed: 4, rot: -0.08 });
    ctx.restore();
  }

  drawHints(ctx, W, H, u) {
    const a = Math.min(1, this.hintT / 2);
    ctx.save();
    ctx.globalAlpha = a;
    const lines = [
      'A/D MOVE · SPACE/W JUMP (TWICE!) · S CROUCH/DROP · SHIFT DASH',
      'MOUSE AIM · LMB FIRE · RMB PUNCH (x3 COMBO) · G INK BOMB · Q SWAP · E USE · F SUPER · T TAUNT',
    ];
    let y = 10 * u;
    lines.forEach((l, i) => {
      const r = captionBox(ctx, W / 2, y, l, { size: 14 * u, align: 'center', fill: 'rgba(255,255,255,0.9)', lw: 2.5 * u, maxW: Math.min(W * 0.52, 700 * u), seed: i, shadow: false });
      y += r.h + 4 * u;
    });
    ctx.restore();
  }

  drawScoreboard(ctx, W, H, u, world) {
    const rows = [...world.players.values()].sort((a, b) => (b.k || 0) - (a.k || 0) || (b.s || 0) - (a.s || 0));
    const bw = 620 * u, rh = 40 * u;
    const bh = 110 * u + rows.length * rh;
    const x = W / 2 - bw / 2, y = H / 2 - bh / 2;
    ctx.save();
    const path = wobblyRectPath(x, y, bw, bh, 1.5 * u, 21);
    ctx.fillStyle = '#fbf6e8';
    ctx.fill(path);
    ctx.lineWidth = 6 * u;
    ctx.strokeStyle = INK;
    ctx.stroke(path);
    comicText(ctx, world.mode === 'story' ? 'THE CAST' : 'THE CONTENDERS', W / 2, y + 40 * u, 40 * u, { fill: '#ffffff', fill2: '#ffe14a', extrude: 5 * u, outline: 5 * u, seed: 4 });
    ctx.font = `${18 * u}px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.fillText('HERO', x + 30 * u, y + 84 * u);
    ctx.textAlign = 'right';
    ctx.fillText('KOs', x + bw - 190 * u, y + 84 * u);
    ctx.fillText('DOWNS', x + bw - 110 * u, y + 84 * u);
    ctx.fillText('SCORE', x + bw - 24 * u, y + 84 * u);
    rows.forEach((p, i) => {
      const ry = y + 110 * u + i * rh;
      if (p.id === world.me) { ctx.fillStyle = 'rgba(255,225,74,0.5)'; ctx.fillRect(x + 10 * u, ry, bw - 20 * u, rh - 4 * u); }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x + 34 * u, ry + rh / 2 - 2 * u, 9 * u, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 2 * u;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `${22 * u}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${p.name}${p.bot ? ' (BOT)' : ''} — ${HEROES[p.hero] ? HEROES[p.hero].name : ''}`, x + 52 * u, ry + rh / 2 - 2 * u);
      ctx.textAlign = 'right';
      ctx.fillText(String(p.k || 0), x + bw - 190 * u, ry + rh / 2 - 2 * u);
      ctx.fillText(String(p.d || 0), x + bw - 110 * u, ry + rh / 2 - 2 * u);
      ctx.fillText(String(p.s || 0), x + bw - 24 * u, ry + rh / 2 - 2 * u);
    });
    ctx.restore();
  }

  drawResults(ctx, W, H, u) {
    const d = this.resultsData;
    const world = d.world;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);
    let title, sub;
    if (d.kind === 'victory') {
      title = 'THE END!';
      sub = `${world.comic.villain} IS DEFEATED! NEXT ISSUE SOON...`;
    } else {
      const w = world.players.get(d.winner);
      title = w ? `${w.name} WINS!` : 'TIME!';
      sub = 'A NEW ISSUE HITS THE STANDS IN A MOMENT...';
    }
    const t = (d.kind === 'victory' ? 11 : BRAWL.overTime) - this.resultsT;
    const k = easeOutBack(clamp(t / 0.4, 0, 1));
    ctx.translate(W / 2, H * 0.2);
    ctx.scale(k, k);
    const burst = starburstPath(0, 0, 220 * u, 300 * u, 18, 4);
    ctx.save();
    ctx.scale(1.7, 0.6);
    ctx.fillStyle = '#ffe14a';
    ctx.fill(burst);
    ctx.lineWidth = 6 * u;
    ctx.strokeStyle = INK;
    ctx.stroke(burst);
    ctx.restore();
    comicText(ctx, title, 0, 0, 90 * u, { fill: '#ffffff', fill2: '#ff7a1a', extrude: 10 * u, outline: 8 * u, seed: 5 });
    ctx.restore();
    captionBox(ctx, W / 2, H * 0.2 + 120 * u, sub, { size: 24 * u, align: 'center', fill: '#ffffff', lw: 4 * u, maxW: W * 0.8, seed: 5 });
    this.drawScoreboard(ctx, W, H * 1.25, u, world);
  }

  drawCrosshair(ctx, x, y, u, fx, pred) {
    ctx.save();
    ctx.translate(x, y);
    const hm = fx.hitmarker > 0 ? fx.hitmarker / 0.2 : 0;
    const km = fx.killmarker > 0 ? fx.killmarker / 0.55 : 0;
    const r = 13 * u * (1 + hm * 0.25);
    ctx.lineWidth = 5 * u;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 2.5 * u;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = (i * TAU) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (r - 5 * u), Math.sin(a) * (r - 5 * u));
      ctx.lineTo(Math.cos(a) * (r + 7 * u), Math.sin(a) * (r + 7 * u));
      ctx.lineWidth = 5 * u;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 2.5 * u;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
    ctx.fillStyle = '#e8262b';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5 * u, 0, TAU);
    ctx.fill();
    // reload ring
    if (pred.rl > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 12 * u, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - pred.rl / WEAPONS.pistol.reload));
      ctx.lineWidth = 4 * u;
      ctx.strokeStyle = '#ffe14a';
      ctx.stroke();
    }
    if (hm > 0) {
      const col = fx.hitmarkerCrit ? '#ffe14a' : '#ffffff';
      const d0 = 10 * u, d1 = (22 + hm * 8) * u;
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * TAU) / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * d0, Math.sin(a) * d0);
        ctx.lineTo(Math.cos(a) * d1, Math.sin(a) * d1);
        ctx.lineWidth = 7 * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.lineWidth = 3.5 * u;
        ctx.strokeStyle = col;
        ctx.stroke();
      }
    }
    if (km > 0) {
      const s = easeOutBack(clamp((1 - km) / 0.3, 0, 1));
      ctx.save();
      ctx.scale(s, s);
      ctx.rotate(0.2);
      const b = starburstPath(0, 0, 22 * u, 36 * u, 10, 3);
      ctx.fillStyle = '#e8262b';
      ctx.fill(b);
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = INK;
      ctx.stroke(b);
      comicText(ctx, 'KO!', 0, 1 * u, 22 * u, { fill: '#ffffff', fill2: '#ffe14a', extrude: 2 * u, outline: 3 * u, seed: 1 });
      ctx.restore();
    }
    ctx.restore();
  }
}
