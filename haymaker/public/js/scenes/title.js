import { W, H, engine, setScene } from '../engine.js';
import { drawText, STYLE } from '../gfx/font.js';
import { FIGHTERS } from '../gfx/fighters.js';
import { sprite } from '../gfx/view.js';
import { Menu, blink } from '../ui.js';
import { initAudio, music, sfx, toggleMute, isMuted } from '../audio.js';
import { net } from '../net.js';
import { backdrop, logo, flashes } from './common.js';
import { app } from '../app.js';

export class TitleScene {
  constructor({ attract = true } = {}) {
    this.attract = attract;
    this.t = 0;
    this.pair = [0, 1];
    this.menu = new Menu([
      { label: 'CREATE MATCH', action: 'create' },
      { label: 'JOIN MATCH', action: 'join' },
      { label: 'PRACTICE VS CPU', action: 'cpu' },
      { label: 'HOW TO PLAY', action: 'howto' },
    ], { x: W / 2, y: 112, w: 170, gap: 15, onPick: (it) => this.choose(it.action) });
  }

  enter() {
    if (!this.attract) music('title');
    flashes.rate = 2.5;
  }

  choose(a) {
    if (a === 'create') { app.status('CREATING MATCH...'); net.create(); }
    if (a === 'cpu') { app.status('WARMING UP...'); net.create(null, true); }
    if (a === 'join') setScene(new app.scenes.JoinScene());
    if (a === 'howto') setScene(new app.scenes.HowToScene());
  }

  start() {
    initAudio();
    sfx('bell');
    music('title');
    this.attract = false;
    if (app.pendingCode) setScene(new app.scenes.JoinScene(app.pendingCode));
  }

  onKey(k) {
    if (k === 'M') { toggleMute(); return; }
    if (this.attract) { this.start(); return; }
    this.menu.key(k);
  }

  onPointer(type, x, y) {
    if (this.attract) { if (type === 'down') this.start(); return; }
    if (type === 'down' && x > W - 30 && y > H - 14) { toggleMute(); return; }
    this.menu.pointer(type, x, y);
  }

  update(dt) {
    this.t += dt;
    flashes.update(dt);
    if (Math.floor(this.t / 5) % 2 !== Math.floor((this.t - dt) / 5) % 2) {
      this.pair = [(this.pair[0] + 2) % FIGHTERS.length, (this.pair[1] + 2) % FIGHTERS.length];
    }
  }

  draw(ctx) {
    backdrop(ctx, 0.45);
    // Fighters flanking the logo.
    const L = FIGHTERS[this.pair[0]], R = FIGHTERS[this.pair[1]];
    const bob = Math.floor(this.t * 2.4) % 2 ? 'idle2' : 'idle';
    const sl = sprite(L, 'front', 1.3, bob), sr = sprite(R, 'front', 1.3, bob);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(sl.canvas, Math.round(66 - sl.ax), Math.round(250 - sl.ay));
    ctx.drawImage(sr.canvas, Math.round(318 - sr.ax), Math.round(250 - sr.ay));
    ctx.globalAlpha = 1;
    // Vignette band behind the logo.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 22, W, 62);
    ctx.fillStyle = '#ffd21a'; ctx.fillRect(0, 22, W, 1); ctx.fillRect(0, 83, W, 1);
    ctx.fillStyle = '#b02800'; ctx.fillRect(0, 23, W, 1); ctx.fillRect(0, 82, W, 1);
    const drop = Math.max(0, 1 - this.t * 3);
    const sweep = (this.t % 3.2) / 1.2;
    logo(ctx, 'HAYMAKER', W / 2, 30 - Math.round(drop * 40), 4, undefined, sweep < 1 ? sweep : null);
    drawText(ctx, 'ONLINE KNOCKOUT DUEL', W / 2, 72, { small: true, color: '#fff6c0', align: 'center' });

    if (this.attract) {
      if (blink(1.2)) drawText(ctx, 'PRESS START', W / 2, 130, { ...STYLE.white, align: 'center' });
      drawText(ctx, app.pendingCode ? `CODE ${app.pendingCode} READY TO JOIN` : 'CLICK OR PRESS ANY KEY', W / 2, 146, { small: true, color: '#b8b4e0', align: 'center' });
    } else {
      ctx.fillStyle = 'rgba(6,2,20,0.78)';
      ctx.fillRect(W / 2 - 92, 104, 184, 66);
      this.menu.draw(ctx);
    }
    drawText(ctx, 'WASD/ARROWS + ENTER', 6, H - 9, { small: true, color: '#6a66a0' });
    drawText(ctx, isMuted() ? 'M: SOUND OFF' : 'M: SOUND ON', W - 6, H - 9, { small: true, color: '#6a66a0', align: 'right' });
    if (app.statusText) drawText(ctx, app.statusText, W / 2, 180, { small: true, color: '#ffd21a', align: 'center' });
  }
}
