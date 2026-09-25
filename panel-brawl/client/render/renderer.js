// Frame composition: desk -> book -> panels -> props/pickups -> characters ->
// projectiles -> panel borders -> FX -> hands -> HUD, plus the camera, the
// cover/page-turn transitions and the "impact frame" post-process.

import { INK, PAPER, FONT, rand, shade, mix, rgba, makeCanvas, halftone, starburstPath, comicText, captionBox, speedLines, wobblyRectPath, cloudPath, paperTexture } from './ink.js';
import { drawCharacter, drawWeapon } from './characters.js';
import { PanelArt } from './panels.js';
import { paintLadder } from './scenes.js';
import { drawDesk, drawDeskProps, drawBookBase, drawSpine, drawHandsBack, drawHandsFront, coverImage, drawFlipSheet, bookShadow, PW, PH } from './book.js';
import { WEAPONS, shoulderOf, weaponOf } from '../../shared/weapons.js';
import { LAYOUT } from '../../shared/constants.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class Renderer {
  constructor(canvas, world, fx, hud) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.fx = fx;
    this.hud = hud;
    this.cam = { x: PW, y: PH / 2, zoom: 0.3, dpr: 1 };
    this.art = null;
    this.borderPath = null;
    this.trans = null;
    this.time = 0;
    this.W = 0;
    this.H = 0;
    this.matrix = new DOMMatrix();
    this.inv = new DOMMatrix();
    this.resize();
    addEventListener('resize', () => this.resize());
    fx.onDecal = (kind, x, y, p) => { if (this.art) this.art.stamp(kind, x, y, p); };
  }

  resize() {
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    const maxPx = 2560 * 1440;
    if (innerWidth * innerHeight * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (innerWidth * innerHeight));
    this.cam.dpr = dpr;
    this.W = this.canvas.width = Math.round(innerWidth * dpr);
    this.H = this.canvas.height = Math.round(innerHeight * dpr);
    this.canvas.style.width = innerWidth + 'px';
    this.canvas.style.height = innerHeight + 'px';
    this.fx.setRes(this.playZoom());
    if (this.art) {
      clearTimeout(this._rebuild);
      this._rebuild = setTimeout(() => this.art && this.art.build(this.playZoom()), 250);
    }
  }

  playZoom() {
    return Math.min(this.H / 780, this.W / 1200);
  }

  inTransition() {
    const tr = this.trans;
    return !!tr && ((tr.kind === 'cover' && tr.t < 2.5) || (tr.kind === 'turn' && tr.t < 1.9));
  }

  bookZoom() {
    return Math.min(this.W / (PW * 2 + 900), this.H / (PH + 700));
  }

  // --------------------------------------------------------------- levels

  onLevel(msg, prev) {
    const world = this.world;
    let oldPages = null;
    if (prev && this.art && msg.transition !== 'cover') oldPages = this.pageImages(this.art, prev.level, prev.comic, 0.5);
    this.art = new PanelArt(msg.level, msg.comic, world.theme);
    this.art.build(this.playZoom());
    this.buildBorders(msg.level);
    const newPages = this.pageImages(this.art, msg.level, msg.comic, 0.5);
    if (msg.transition === 'cover') {
      const mine = world.roster.get(world.me) || world.players.get(world.me);
      const others = [...world.roster.values()].filter((r) => r.id !== world.me && !r.bot).map((r) => r.hero);
      const stars = [mine ? mine.hero : null, ...others].filter(Boolean);
      this.trans = { kind: 'cover', t: 0, newPages, cover: coverImage(msg.comic, 0.55, stars), dur: 4.3 };
      this.cam.x = PW * 1.5;
      this.cam.y = PH / 2;
      this.cam.zoom = Math.min(this.W / (PW + 700), this.H / (PH + 420));
    } else if (oldPages) {
      this.trans = { kind: 'turn', t: 0, oldPages, newPages, dur: 3.2 };
    } else {
      this.trans = null;
    }
  }

  buildBorders(level) {
    const p = new Path2D();
    let seed = 1;
    for (const s of level.solids) {
      if (s.k === 'border' || s.k === 'bridge' || s.k === 'lintel' || s.k === 'shaft') {
        wobblyRectPath(s.x, s.y, s.w, s.h, 1.4, seed++, p);
      }
    }
    this.borderPath = p;
  }

  pageImages(art, level, comic, res) {
    const imgs = [];
    for (const pg of level.pages) {
      const c = makeCanvas(Math.ceil(PW * res), Math.ceil(PH * res));
      const g = c.getContext('2d');
      g.scale(res, res);
      g.translate(-pg.x, -pg.y);
      g.fillStyle = g.createPattern(paperTexture(), 'repeat');
      g.fillRect(pg.x, pg.y, PW, PH);
      for (const item of art.items.values()) {
        const P = item.P;
        if (P.page !== level.pages.indexOf(pg)) continue;
        g.drawImage(item.canvas, P.x1, P.y1, item.w, item.h);
      }
      if (this.borderPath) {
        g.fillStyle = INK;
        g.save();
        g.beginPath();
        g.rect(pg.x, pg.y, PW, PH);
        g.clip();
        g.fill(this.borderPath === null ? new Path2D() : this.bordersFor(level));
        g.restore();
      }
      g.font = `26px ${FONT}`;
      g.fillStyle = INK;
      g.textAlign = 'center';
      g.fillText(String(pg.num), pg.x + PW / 2, pg.y + PH - 60);
      imgs.push(c);
    }
    return imgs;
  }

  bordersFor(level) {
    const p = new Path2D();
    let seed = 1;
    for (const s of level.solids) {
      if (s.k === 'border' || s.k === 'bridge' || s.k === 'lintel' || s.k === 'shaft') wobblyRectPath(s.x, s.y, s.w, s.h, 1.4, seed++, p);
    }
    return p;
  }

  // --------------------------------------------------------------- camera

  updateCamera(dt, input) {
    const world = this.world;
    const cam = this.cam;
    const pz = this.playZoom(), bz = this.bookZoom();
    const cz = Math.min(this.W / (PW + 700), this.H / (PH + 420)); // closed-cover close-up
    let tx = PW, ty = PH / 2 + 60, tz = bz;
    const me = world.meRender();
    const tr = this.trans;
    let snap = false;
    if (tr) {
      tr.t += dt;
      if (tr.kind === 'cover') {
        const t = tr.t;
        if (t < 1.4) { tx = PW * 1.5; ty = PH / 2 + 60; tz = cz; }
        else if (t < 2.5) { tx = lerp(PW * 1.5, PW, ease((t - 1.4) / 1.1)); ty = PH / 2 + 60; tz = bz; }
        else if (me) { tx = me.x; ty = me.y - 70; tz = pz; }
        snap = t < 2.5;
        if (t < 2.5) {
          cam.x = tx; cam.y = ty;
          cam.zoom = t < 1.4 ? cz : lerp(cz, bz, ease((t - 1.4) / 1.1));
        }
      } else if (tr.kind === 'turn') {
        if (tr.t < 1.9) { tx = PW; ty = PH / 2 + 60; tz = bz; }
        else if (me) { tx = me.x; ty = me.y - 70; tz = pz; }
      }
      if (tr.t >= tr.dur) this.trans = null;
    }
    if (!tr || (tr.kind === 'cover' && tr.t >= 2.5) || (tr.kind === 'turn' && tr.t >= 1.9)) {
      if (me && me.alive && world.phase !== 'victory' && world.phase !== 'over') {
        const P = world.myPanel();
        let fx = me.x, fy = me.y - 70;
        if (P) {
          const pcx = (P.x1 + P.x2) / 2, pcy = (P.y1 + P.y2) / 2;
          fx = lerp(fx, pcx, 0.28);
          fy = lerp(fy, pcy, 0.35);
        }
        // look-ahead toward the mouse
        const mx = (input.mouse.x * cam.dpr - this.W / 2) / cam.zoom;
        const my = (input.mouse.y * cam.dpr - this.H / 2) / cam.zoom;
        tx = fx + clamp(mx * 0.22, -220, 220);
        ty = fy + clamp(my * 0.18, -140, 140);
        tz = pz;
      } else if (me && !me.alive) {
        tx = me.x;
        ty = me.y - 200;
        tz = lerp(pz, bz, 0.55);
      } else {
        tz = bz;
      }
    }
    if (!snap) {
      const k = 1 - Math.exp(-dt * 5.5);
      cam.x += (tx - cam.x) * k;
      cam.y += (ty - cam.y) * k;
      const kz = 1 - Math.exp(-dt * 3.2);
      cam.zoom = Math.exp(Math.log(cam.zoom) + (Math.log(tz) - Math.log(cam.zoom)) * kz);
    }
    // keep the book in frame
    const halfW = this.W / 2 / cam.zoom, halfH = this.H / 2 / cam.zoom;
    const lv = world.level;
    if (lv && cam.zoom > bz * 1.2 && !this.inTransition()) {
      cam.x = clamp(cam.x, halfW - 300, lv.width - halfW + 300);
      cam.y = clamp(cam.y, halfH - 200, lv.height - halfH + 360);
    }
  }

  worldTransform() {
    const cam = this.cam;
    const [sx, sy] = this.fx.shakeOffset(18 * cam.dpr);
    const bz = this.bookZoom();
    const swayAmt = clamp(1 - (cam.zoom - bz) / (this.playZoom() - bz), 0, 1);
    const sway = Math.sin(this.time * 0.6) * 0.006 * swayAmt;
    const m = new DOMMatrix()
      .translate(this.W / 2 + sx, this.H / 2 + sy)
      .rotate((sway * 180) / Math.PI)
      .scale(cam.zoom)
      .translate(-cam.x, -cam.y + Math.sin(this.time * 0.9) * 6 * swayAmt);
    this.matrix = m;
    this.inv = m.inverse();
    this.cam.matrix = m;
    return m;
  }

  screenToWorld(px, py) {
    const p = this.inv.transformPoint(new DOMPoint(px, py));
    return { x: p.x, y: p.y };
  }

  aimFrom(input) {
    const world = this.world;
    const p = world.pred.p;
    const sh = shoulderOf(p);
    if (input.usingPad && input.padAim != null) return input.padAim;
    const m = this.screenToWorld(input.mouse.x * this.cam.dpr, input.mouse.y * this.cam.dpr);
    return Math.atan2(m.y - sh.y, m.x - sh.x);
  }

  // ------------------------------------------------------------------ frame

  frame(dt, input, audio) {
    this.time += dt;
    const ctx = this.ctx;
    const world = this.world;
    const W = this.W, H = this.H;
    this.updateCamera(dt, input);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawDesk(ctx, W, H, -this.cam.x * 0.02, -this.cam.y * 0.02, this.time);
    if (!world.level || !this.art) {
      ctx.restore?.();
      return;
    }
    const m = this.worldTransform();
    ctx.setTransform(m);
    const lv = world.level;
    const view = this.viewRect();

    const tr = this.trans;
    if (tr && ((tr.kind === 'cover' && tr.t < 2.5) || (tr.kind === 'turn' && tr.t < 1.9))) {
      this.drawTransition(ctx, tr, lv);
    } else {
      if (this.cam.zoom < this.playZoom() * 0.8) drawDeskProps(ctx, lv, this.time);
      drawHandsBack(ctx, lv, this.time);
      drawBookBase(ctx, lv, world.comic, world.theme);
      this.drawPanels(ctx, view);
      this.drawGatesAndLadders(ctx, view);
      this.drawProps(ctx, view);
      this.drawPickups(ctx, view);
      this.fx.drawBack(ctx);
      this.drawEnemies(ctx, view);
      this.drawPlayers(ctx, view);
      this.drawProjectiles(ctx, view);
      ctx.fillStyle = INK;
      if (this.borderPath) ctx.fill(this.borderPath);
      this.drawHoleCovers(ctx);
      this.fx.drawWorld(ctx);
      this.drawTags(ctx, view);
      this.fx.drawTop(ctx);
      drawSpine(ctx, lv);
      drawHandsFront(ctx, lv, this.time);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.fx.impact > 0) this.impactFrame(ctx, W, H);
    if (!this.inTransition()) this.hud.draw(ctx, W, H, world, this.fx, input, this.cam, audio);
  }

  viewRect() {
    const a = this.screenToWorld(0, 0), b = this.screenToWorld(this.W, this.H);
    const c = this.screenToWorld(this.W, 0), d = this.screenToWorld(0, this.H);
    return {
      x1: Math.min(a.x, b.x, c.x, d.x) - 80, y1: Math.min(a.y, b.y, c.y, d.y) - 80,
      x2: Math.max(a.x, b.x, c.x, d.x) + 80, y2: Math.max(a.y, b.y, c.y, d.y) + 80,
    };
  }

  inView(v, x1, y1, x2, y2) {
    return x2 >= v.x1 && x1 <= v.x2 && y2 >= v.y1 && y1 <= v.y2;
  }

  drawTransition(ctx, tr, lv) {
    const world = this.world;
    drawDeskProps(ctx, lv, this.time);
    if (tr.kind === 'cover' && tr.t < 1.6) ctx.drawImage(bookShadow(PW, PH), PW - 150, -90, PW + 300, PH + 300);
    else ctx.drawImage(bookShadow(PW * 2, PH), -150, -90, PW * 2 + 300, PH + 300);
    if (tr.kind === 'cover') {
      const k = clamp((tr.t - 1.4) / 1.0, 0, 1);
      // right page (new) under the cover, left page appears as the cover swings over
      ctx.fillStyle = shade(world.theme.palette.accent, -0.3);
      ctx.fillRect(PW - 6, -14, PW + 30, PH + 34);
      if (k > 0.5) {
        ctx.fillRect(-24, -14, PW + 30, PH + 34);
        ctx.drawImage(tr.newPages[0], 0, 0, PW, PH);
      }
      ctx.drawImage(tr.newPages[1], PW, 0, PW, PH);
      drawSpine(ctx, lv);
      drawFlipSheet(ctx, tr.cover, tr.newPages[0], ease(k));
      drawHandsFront(ctx, { width: k > 0.5 ? lv.width : lv.width, height: lv.height }, this.time);
      if (tr.t < 1.4) {
        // "tap to open" sparkle on the cover
        const a = 0.5 + 0.5 * Math.sin(this.time * 6);
        ctx.save();
        ctx.globalAlpha = a;
        comicText(ctx, 'NEW ISSUE!', PW * 1.5, PH + 170, 120, { fill: '#ffffff', fill2: '#ffe14a', seed: 3 });
        ctx.restore();
      }
    } else {
      const k = clamp((tr.t - 0.6) / 1.1, 0, 1);
      ctx.fillStyle = shade(world.theme.palette.accent, -0.3);
      ctx.fillRect(-24, -14, PW * 2 + 48, PH + 34);
      ctx.drawImage(tr.oldPages[0], 0, 0, PW, PH);
      ctx.drawImage(tr.newPages[1], PW, 0, PW, PH);
      if (k >= 0.5) ctx.drawImage(tr.newPages[0], 0, 0, PW, PH);
      drawSpine(ctx, lv);
      drawFlipSheet(ctx, tr.oldPages[1], tr.newPages[0], ease(k));
      drawHandsFront(ctx, lv, this.time);
    }
  }

  drawPanels(ctx, view) {
    const world = this.world;
    for (const item of this.art.items.values()) {
      const P = item.P;
      if (!this.inView(view, P.x1, P.y1, P.x2, P.y2)) continue;
      const st = world.panelState[P.id];
      if (world.mode === 'story' && st === 'locked') {
        ctx.drawImage(this.art.pencilVersion(item), P.x1, P.y1, item.w, item.h);
        // "not inked yet" caption
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.font = `28px ${FONT}`;
        ctx.fillStyle = 'rgba(60,100,170,0.8)';
        ctx.textAlign = 'center';
        ctx.fillText('( PANEL NOT INKED YET )', (P.x1 + P.x2) / 2, (P.y1 + P.y2) / 2);
        ctx.restore();
      } else {
        ctx.drawImage(item.canvas, P.x1, P.y1, item.w, item.h);
        const inkT = item.inkT;
        if (item.wasLocked && inkT < 1) {
          // inking wipe: pencil version recedes left-to-right
          const pc = this.art.pencilVersion(item);
          const cut = item.w * ease(inkT);
          ctx.drawImage(pc, (cut / item.w) * pc.width, 0, pc.width - (cut / item.w) * pc.width, pc.height, P.x1 + cut, P.y1, item.w - cut, item.h);
          ctx.fillStyle = INK;
          ctx.fillRect(P.x1 + cut - 3, P.y1, 6, item.h);
          item.inkT = Math.min(1, inkT + 1 / 60 / 0.7);
        }
      }
      if (st === 'locked') { item.wasLocked = true; item.inkT = 0; }
    }
  }

  drawGatesAndLadders(ctx, view) {
    const world = this.world;
    const lv = world.level;
    for (const l of lv.ladders) {
      if (!this.inView(view, l.x, l.y, l.x + l.w, l.y + l.h)) continue;
      try { paintLadder(ctx, { x: l.x, y: l.y, w: l.w, h: l.h, theme: world.theme }); } catch (e) { /* scenes not ready */ }
    }
    for (const g of lv.gates) {
      const open = world.gatesOpen.has(g.id);
      const fade = world.gateFade.get(g.id);
      if (open && fade == null) continue;
      if (!this.inView(view, g.x, g.y, g.x + g.w, g.y + g.h)) continue;
      ctx.save();
      if (fade != null) ctx.globalAlpha = 1 - fade;
      ctx.fillStyle = '#141414';
      ctx.fillRect(g.x, g.y, g.w, g.h);
      ctx.strokeStyle = '#f3ead3';
      ctx.lineWidth = 2;
      const r = rand(g.id + 5);
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        ctx.moveTo(g.x + r() * g.w, g.y + r() * g.h);
        ctx.lineTo(g.x + r() * g.w, g.y + r() * g.h);
      }
      ctx.stroke();
      ctx.restore();
    }
    // arrow to the next panel in story mode
    if (world.mode === 'story') {
      for (const l of lv.links) {
        if (!l.gate) continue;
        const gate = lv.gates.find((g) => g.link === l.id);
        if (!gate || !world.gatesOpen.has(gate.id)) continue;
        const next = l.a === l.from ? l.b : l.a;
        if (world.panelState[next] !== 'asleep') continue;
        const bob = Math.sin(this.time * 6) * 10;
        let x, y, a;
        if (l.kind === 'door') {
          x = (l.x1 + l.x2) / 2;
          y = l.y1 - 60 + bob;
          a = next === l.b ? 0 : Math.PI;
        } else {
          x = (l.x1 + l.x2) / 2;
          y = l.y1 - 140 + bob;
          a = next === l.b ? Math.PI / 2 : -Math.PI / 2;
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        const p = new Path2D();
        p.moveTo(-34, -12); p.lineTo(6, -12); p.lineTo(6, -28); p.lineTo(40, 0); p.lineTo(6, 28); p.lineTo(6, 12); p.lineTo(-34, 12); p.closePath();
        ctx.lineWidth = 7;
        ctx.strokeStyle = INK;
        ctx.stroke(p);
        ctx.fillStyle = '#ffe14a';
        ctx.fill(p);
        ctx.restore();
        comicText(ctx, 'THIS WAY!', x, y - 50, 26, { fill: '#ffffff', fill2: '#ffe14a', extrude: 3, outline: 3, seed: 2 });
      }
    }
  }

  drawHoleCovers(ctx) {
    const lv = this.world.level;
    for (const o of lv.oneways) {
      if (o.k !== 'cover') continue;
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(o.x, o.y, o.w, 8);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(o.x, o.y, o.w, 8);
      ctx.beginPath();
      for (let x = o.x + 12; x < o.x + o.w; x += 14) { ctx.moveTo(x, o.y); ctx.lineTo(x, o.y + 8); }
      ctx.stroke();
    }
  }

  drawProps(ctx, view) {
    const world = this.world;
    const th = world.theme;
    for (const pr of world.props.values()) {
      if (!this.inView(view, pr.x - 60, pr.y - 60, pr.x + pr.w + 60, pr.y + pr.h + 20)) continue;
      ctx.save();
      if (pr.shake > 0) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3);
      if (pr.k === 'crate') drawCrate(ctx, pr, th);
      else if (pr.k === 'barrel') drawBarrel(ctx, pr, th, this.time);
      else if (pr.k === 'table') drawTable(ctx, pr, th);
      ctx.restore();
    }
  }

  drawPickups(ctx, view) {
    const world = this.world;
    for (const pk of world.pickups.values()) {
      if (!this.inView(view, pk.x - 60, pk.y - 60, pk.x + 60, pk.y + 60)) continue;
      const bob = Math.sin(pk.t * 3) * 6;
      const sp = pk.spawnT > 0 ? 1 - pk.spawnT / 0.5 : 1;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      ctx.scale(sp, sp);
      // glow badge
      const badge = starburstPath(0, 0, 26, 36, 10, pk.id % 50, pk.t * 0.8);
      ctx.fillStyle = pk.k === 'health' ? '#ffffff' : pk.k === 'bomb' ? '#ffe14a' : '#fff36b';
      ctx.globalAlpha = 0.9;
      ctx.fill(badge);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke(badge);
      if (pk.k === 'weapon') {
        ctx.save();
        ctx.scale(1.25, 1.25);
        ctx.rotate(-0.25);
        ctx.translate(-16, 0);
        drawWeapon(ctx, pk.w, {});
        ctx.restore();
        ctx.font = `15px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = INK;
        ctx.strokeText(WEAPONS[pk.w].name, 0, 50);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(WEAPONS[pk.w].name, 0, 50);
      } else if (pk.k === 'health') {
        const h = new Path2D();
        h.moveTo(0, 16);
        h.bezierCurveTo(-26, -2, -16, -24, 0, -10);
        h.bezierCurveTo(16, -24, 26, -2, 0, 16);
        ctx.fillStyle = '#e8262b';
        ctx.fill(h);
        ctx.lineWidth = 3;
        ctx.stroke(h);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-2.5, -9, 5, 16);
        ctx.fillRect(-8, -3.5, 16, 5);
      } else if (pk.k === 'bomb') {
        drawBombIcon(ctx, 0, 2, 13, pk.t);
      }
      ctx.restore();
    }
  }

  drawEnemies(ctx, view) {
    const world = this.world;
    const list = [...world.enemies.values()].sort((a, b) => (b.asleep ? 1 : 0) - (a.asleep ? 1 : 0));
    for (const e of list) {
      if (!this.inView(view, e.x - 150, e.y - e.h - 150, e.x + 150, e.y + 40)) continue;
      const opts = {};
      if (e.asleep) opts.asleep = true;
      else if (e.st === 1 || e.drawP < 1) opts.draw = e.drawP;
      else if (e.wakeP < 1) opts.wake = e.wakeP;
      opts.flash = e.anim.flash > 0 ? 1 : 0;
      opts.hurt = e.anim.hurt;
      if (world.theme.mono) opts.rim = '#f2efe6';
      const look = e.look;
      const humanoid = look.body === 'humanoid' || look.body === 'robot';
      if (humanoid) opts.weapon = null;
      // telegraphs
      if (!e.asleep && e.act === 6) {
        // gunner aiming: laser sight
        const sx = e.x + e.facing * 10, sy = e.y - e.h * 0.72;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,40,40,0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -this.time * 60;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(e.aim) * 900, sy + Math.sin(e.aim) * 900);
        ctx.stroke();
        ctx.restore();
      }
      const windup = !e.asleep && (e.act === 2) && (e.k === 'brute' || e.k === 'boss');
      ctx.save();
      if (windup) {
        ctx.translate((Math.random() - 0.5) * 4, 0);
        opts.tint = '#ff2020';
        opts.tintAmt = 0.25 + 0.2 * Math.sin(this.time * 30);
      }
      if (e.act === 4 && !e.asleep) {
        // charging: speed lines behind
        ctx.save();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const yy = e.y - e.h * (0.2 + i * 0.16);
          ctx.moveTo(e.x - e.facing * (e.w * 0.6), yy);
          ctx.lineTo(e.x - e.facing * (e.w * 0.6 + 60 + (i % 2) * 30), yy);
        }
        ctx.stroke();
        ctx.restore();
      }
      drawCharacter(ctx, e, e.anim, opts);
      ctx.restore();
      if (!e.asleep && e.st === 3 && e.hp < e.maxHp && e.k !== 'boss') {
        const bw = Math.max(40, e.w * 1.2), by = e.y - e.h - 18;
        ctx.fillStyle = INK;
        ctx.fillRect(e.x - bw / 2 - 2, by - 2, bw + 4, 9);
        ctx.fillStyle = '#e8262b';
        ctx.fillRect(e.x - bw / 2, by, bw * clamp(e.hp / e.maxHp, 0, 1), 5);
      }
    }
  }

  drawPlayers(ctx, view) {
    const world = this.world;
    const list = [...world.players.values()].sort((a, b) => (a.id === world.me ? 1 : 0) - (b.id === world.me ? 1 : 0));
    for (const p of list) {
      if (!p.alive) continue;
      if (!this.inView(view, p.x - 150, p.y - 200, p.x + 150, p.y + 40)) continue;
      const opts = { weapon: p.id === world.me ? weaponOf(world.pred.p) : p.w || 'pistol' };
      if (world.theme.mono) opts.rim = '#f2efe6';
      opts.flash = p.anim.flash > 0 ? 1 : 0;
      opts.hurt = p.anim.hurt;
      if (p.drawP != null && p.drawP < 1) opts.draw = p.drawP;
      if (p.invuln && !opts.draw) opts.alpha = 0.55 + 0.45 * (Math.floor(this.time * 12) % 2);
      if (p.super) {
        ctx.save();
        const r = 70 + Math.sin(this.time * 30) * 6;
        const b = starburstPath(p.x, p.y - 46, r * 0.7, r, 14, 3, this.time * 2);
        ctx.fillStyle = 'rgba(255,225,74,0.85)';
        ctx.fill(b);
        ctx.lineWidth = 3;
        ctx.strokeStyle = INK;
        ctx.stroke(b);
        ctx.restore();
      }
      drawCharacter(ctx, p, p.anim, opts);
    }
  }

  drawTags(ctx, view) {
    const world = this.world;
    for (const p of world.players.values()) {
      if (!p.alive || p.id === world.me) continue;
      if (!this.inView(view, p.x - 100, p.y - 200, p.x + 100, p.y)) continue;
      const y = p.y - (p.h || 92) - 30;
      ctx.font = `17px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.strokeText(p.name, p.x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.name, p.x, y);
      if (world.mode === 'brawl' || p.hp < 150) {
        const bw = 44;
        ctx.fillStyle = INK;
        ctx.fillRect(p.x - bw / 2 - 2, y + 6, bw + 4, 8);
        ctx.fillStyle = p.hp > 75 ? '#35c24a' : p.hp > 38 ? '#ffc21f' : '#e8262b';
        ctx.fillRect(p.x - bw / 2, y + 8, bw * clamp(p.hp / 150, 0, 1), 4);
      }
    }
  }

  drawProjectiles(ctx, view) {
    const world = this.world;
    for (const pr of world.projectiles.values()) {
      if (pr.localDead) continue;
      if (!this.inView(view, pr.x - 40, pr.y - 40, pr.x + 40, pr.y + 40)) continue;
      const a = Math.atan2(pr.vy, pr.vx);
      const sp = Math.hypot(pr.vx, pr.vy);
      ctx.save();
      switch (pr.k) {
        case 'bullet':
        case 'pellet':
        case 'ebullet': {
          const enemy = pr.ok === 'e';
          const len = Math.min(46, sp * 0.022) * (pr.k === 'pellet' ? 0.7 : 1);
          const w = pr.k === 'pellet' ? 5 : 7;
          ctx.translate(pr.x, pr.y);
          ctx.rotate(a);
          ctx.lineCap = 'round';
          ctx.strokeStyle = INK;
          ctx.lineWidth = w + 4;
          ctx.beginPath();
          ctx.moveTo(-len, 0);
          ctx.lineTo(0, 0);
          ctx.stroke();
          ctx.strokeStyle = enemy ? '#ff3fa4' : pr.deflected ? '#ff3fa4' : '#ffe14a';
          ctx.lineWidth = w;
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = w * 0.35;
          ctx.beginPath();
          ctx.moveTo(-len * 0.5, 0);
          ctx.lineTo(0, 0);
          ctx.stroke();
          break;
        }
        case 'word': {
          // the ONOMATO-CANNON fires actual sound effects
          ctx.translate(pr.x, pr.y);
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          for (let i = 1; i <= 3; i++) {
            ctx.beginPath();
            ctx.arc(-Math.cos(a) * i * 16, -Math.sin(a) * i * 16, 8 - i * 1.5, 0, TAU);
            ctx.fill();
          }
          // keep the lettering readable: tilt with the flight path but never mirror it
          const tilt = Math.cos(a) >= 0 ? a : a - Math.PI;
          ctx.rotate(clamp(tilt, -0.6, 0.6) + Math.sin(pr.age * 20) * 0.08);
          comicText(ctx, pr.word || 'BOOM', 0, 0, 32, { fill: '#fff36b', fill2: '#ff4d2b', extrude: 4, outline: 3.5, jitter: 0.1, seed: 4 });
          break;
        }
        case 'bomb':
          drawBombIcon(ctx, pr.x, pr.y, 11, pr.age * 4, pr.fuse != null ? clamp(1 - pr.age / pr.fuse, 0, 1) : 1);
          break;
        case 'orb':
        case 'bossorb': {
          const r = pr.k === 'bossorb' ? 15 : 11;
          ctx.translate(pr.x, pr.y);
          ctx.fillStyle = pr.k === 'bossorb' ? 'rgba(255,40,40,0.35)' : 'rgba(255,63,164,0.35)';
          ctx.beginPath();
          ctx.arc(0, 0, r * 1.9, 0, TAU);
          ctx.fill();
          const orb = starburstPath(0, 0, r * 0.9, r * 1.2, 8, 3, pr.age * 6);
          ctx.fillStyle = pr.k === 'bossorb' ? '#e8262b' : '#ff3fa4';
          ctx.fill(orb);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = INK;
          ctx.stroke(orb);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(-r * 0.25, -r * 0.25, r * 0.35, 0, TAU);
          ctx.fill();
          break;
        }
        case 'acid': {
          ctx.translate(pr.x, pr.y);
          ctx.rotate(a);
          const blob = cloudPath(0, 0, 11, 8, 6, 5);
          ctx.fillStyle = '#7fd13b';
          ctx.fill(blob);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = INK;
          ctx.stroke(blob);
          ctx.fillStyle = '#d6ff5c';
          ctx.beginPath();
          ctx.arc(2, -2, 3, 0, TAU);
          ctx.fill();
          break;
        }
      }
      ctx.restore();
    }
  }

  impactFrame(ctx, W, H) {
    // one-frame high-contrast negative, like a manga/comic impact panel
    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    const p = this.matrix.transformPoint(new DOMPoint(this.fx.impactX, this.fx.impactY));
    speedLines(ctx, p.x, p.y, Math.min(W, H) * 0.12, Math.max(W, H), 70, (this.time * 60) | 0, '#ffffff', 2.5);
    ctx.restore();
  }
}

// ------------------------------------------------------------------- props

function drawCrate(ctx, pr, th) {
  const { x, y, w, h } = pr;
  const wood = th.mono ? '#b8b0a0' : '#c48a4a';
  ctx.lineJoin = 'round';
  ctx.fillStyle = wood;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = halftone(ctx, rgba(shade(wood, -0.45), 0.8), 4, 1);
  ctx.fillRect(x + w * 0.55, y, w * 0.45, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.5;
  ctx.strokeRect(x, y, w, h);
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 6);
  ctx.lineTo(x + w - 6, y + h - 6);
  ctx.moveTo(x + w - 6, y + 6);
  ctx.lineTo(x + 6, y + h - 6);
  ctx.stroke();
  ctx.fillStyle = INK;
  for (const [px, py] of [[x + 3, y + 3], [x + w - 3, y + 3], [x + 3, y + h - 3], [x + w - 3, y + h - 3]]) {
    ctx.beginPath();
    ctx.arc(px, py, 1.6, 0, TAU);
    ctx.fill();
  }
}

function drawBarrel(ctx, pr, th, t) {
  const { x, y, w, h } = pr;
  const col = th.key === 'zombie' ? '#7fd13b' : th.key === 'space' ? '#ff3fa4' : '#e8262b';
  const p = new Path2D();
  p.moveTo(x + 4, y);
  p.lineTo(x + w - 4, y);
  p.quadraticCurveTo(x + w + 3, y + h / 2, x + w - 4, y + h);
  p.lineTo(x + 4, y + h);
  p.quadraticCurveTo(x - 3, y + h / 2, x + 4, y);
  p.closePath();
  ctx.fillStyle = col;
  ctx.fill(p);
  ctx.save();
  ctx.clip(p);
  ctx.fillStyle = halftone(ctx, rgba(shade(col, -0.5), 0.8), 4, 1.1);
  ctx.fillRect(x + w * 0.6, y, w * 0.4, h);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(x + w * 0.2, y + 4, 4, h - 8);
  ctx.restore();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = INK;
  ctx.stroke(p);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x + 1, y + h * 0.28);
  ctx.lineTo(x + w - 1, y + h * 0.28);
  ctx.moveTo(x + 1, y + h * 0.72);
  ctx.lineTo(x + w - 1, y + h * 0.72);
  ctx.stroke();
  // hazard symbol
  ctx.fillStyle = '#ffe14a';
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + h * 0.36);
  ctx.lineTo(x + w / 2 + 10, y + h * 0.62);
  ctx.lineTo(x + w / 2 - 10, y + h * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', x + w / 2, y + h * 0.54);
}

function drawTable(ctx, pr, th) {
  const { x, y, w, h } = pr;
  const col = th.geo.table === 'labtable' ? '#dfe6ea' : th.geo.table === 'gurney' ? '#c8d0d8' : th.geo.table === 'messtable' ? '#9aa6b2' : '#8a5a2b';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  if (pr.st === 'up') {
    ctx.lineWidth = 3;
    for (const lx of [x + 10, x + w - 16]) {
      ctx.fillStyle = shade(col, -0.3);
      ctx.fillRect(lx, y + 8, 6, h - 8);
      ctx.strokeRect(lx, y + 8, 6, h - 8);
    }
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, 10);
    ctx.lineWidth = 3.5;
    ctx.strokeRect(x, y, w, 10);
  } else {
    const k = pr.flipT != null ? pr.flipT : 1;
    const cx = x + w / 2;
    ctx.save();
    ctx.translate(cx, y + h);
    ctx.rotate(-pr.dir * (1 - k) * Math.PI / 2);
    ctx.fillStyle = col;
    ctx.fillRect(-9, -80, 18, 80);
    ctx.fillStyle = halftone(ctx, rgba(shade(col, -0.45), 0.8), 4, 1);
    ctx.fillRect(-9, -80, 9, 80);
    ctx.lineWidth = 3.5;
    ctx.strokeRect(-9, -80, 18, 80);
    ctx.lineWidth = 3;
    ctx.fillStyle = shade(col, -0.3);
    for (const ly of [-70, -18]) {
      ctx.fillRect(pr.dir * 9, ly, pr.dir * 40, 6);
      ctx.strokeRect(pr.dir * 9, ly, pr.dir * 40, 6);
    }
    ctx.restore();
  }
}

function drawBombIcon(ctx, x, y, r, t, fuse = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(-r * 0.35, -r * 0.35, r * 0.28, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#6b6b6b';
  ctx.fillRect(-r * 0.3, -r * 1.15, r * 0.6, r * 0.35);
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.1);
  ctx.quadraticCurveTo(r * 0.6, -r * 1.9, r * 1.1, -r * 1.6);
  ctx.strokeStyle = '#c49a5a';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  const blink = fuse < 0.35 ? Math.sin(t * 40) > 0 : true;
  if (blink) {
    const sp = starburstPath(r * 1.1, -r * 1.6, 3, 8, 6, (t * 10) | 0);
    ctx.fillStyle = fuse < 0.35 ? '#ff3a1a' : '#ffe14a';
    ctx.fill(sp);
  }
  ctx.restore();
}
