import { W, H, engine, setScene, flash, shake } from '../engine.js';
import { drawText, STYLE } from '../gfx/font.js';
import { FIGHTERS, fighterFor } from '../gfx/fighters.js';
import { Button, blink } from '../ui.js';
import { sfx, music } from '../audio.js';
import { net } from '../net.js';
import { backdrop, logo, flashes, drawPortrait, stripes } from './common.js';
import { prewarm } from '../gfx/view.js';
import { app } from '../app.js';

const CW = 88, CG = 6, CX0 = Math.round((W - (4 * CW + 3 * CG)) / 2), CY = 34, CH = 128;

export class SelectScene {
  constructor() {
    const mine = net.room?.fighters?.[net.you];
    this.sel = Math.max(0, FIGHTERS.findIndex((f) => f.id === mine));
    if (!mine) this.sendSel();
    this.readyBtn = new Button('READY!', W / 2 - 45, 190, 90, 16, () => this.toggleReady());
    this.leaveBtn = new Button('QUIT', 6, H - 18, 40, 13, () => { net.leave(); setScene(new app.scenes.TitleScene({ attract: false })); }, { color: '#4a4468', shade: '#1a1630', small: true });
  }
  enter() { music('title'); }
  get ready() { return !!net.room?.ready?.[net.you]; }
  sendSel() { net.send({ t: 'fighter', id: FIGHTERS[this.sel].id }); }
  move(d) {
    if (this.ready) return;
    this.sel = (this.sel + d + FIGHTERS.length) % FIGHTERS.length;
    sfx('move');
    this.sendSel();
  }
  toggleReady() {
    const v = !this.ready;
    if (v) { sfx('lock'); this.sendSel(); }
    net.send({ t: 'ready', v });
  }
  onKey(k) {
    if (k === 'ArrowLeft' || k === 'A') this.move(-1);
    if (k === 'ArrowRight' || k === 'D') this.move(1);
    if (k === 'Enter' || k === ' ' || k === 'J') this.toggleReady();
    if ((k === 'Escape' || k === 'Backspace') && this.ready) net.send({ t: 'ready', v: false });
  }
  onPointer(type, x, y) {
    if (this.readyBtn.pointer(type, x, y) || this.leaveBtn.pointer(type, x, y)) return;
    if (type !== 'down' || this.ready) return;
    for (let i = 0; i < 4; i++) {
      const cx = CX0 + i * (CW + CG);
      if (x >= cx && x < cx + CW && y >= CY && y < CY + CH) {
        if (this.sel === i) this.toggleReady();
        else { this.sel = i; sfx('move'); this.sendSel(); }
      }
    }
  }
  update(dt) {
    flashes.update(dt);
    this.readyBtn.label = this.ready ? 'WAIT...' : 'READY!';
    this.readyBtn.active = this.ready;
  }
  draw(ctx) {
    backdrop(ctx, 0.7);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 6, W, 24);
    stripes(ctx, 6, 24);
    logo(ctx, 'CHOOSE YOUR FIGHTER', W / 2, 8, 2);
    const room = net.room;
    const oppIdx = FIGHTERS.findIndex((f) => f.id === room?.fighters?.[1 - net.you]);
    const oppReady = room?.ready?.[1 - net.you];
    const oppBot = room?.players?.[1 - net.you]?.bot;
    FIGHTERS.forEach((f, i) => {
      const x = CX0 + i * (CW + CG);
      const mine = i === this.sel, theirs = i === oppIdx;
      ctx.fillStyle = mine ? '#2a1a08' : '#0c0820';
      ctx.fillRect(x, CY, CW, CH);
      // Card backdrop gradient
      const g = ctx.createLinearGradient(0, CY, 0, CY + 84);
      g.addColorStop(0, f.palette.trunks[1]);
      g.addColorStop(1, '#0a0618');
      ctx.fillStyle = g;
      ctx.fillRect(x + 2, CY + 2, CW - 4, 82);
      ctx.save();
      ctx.beginPath(); ctx.rect(x + 2, CY + 2, CW - 4, 82); ctx.clip();
      drawPortrait(ctx, f, x + CW / 2, CY + 4, { pose: mine && this.ready ? 'taunt' : mine && blink(1.2) ? 'idle2' : 'idle', scale: 1.5, clipW: CW - 4, clipH: 82 });
      ctx.restore();
      ctx.fillStyle = '#000'; ctx.fillRect(x + 2, CY + 84, CW - 4, 42);
      const [first, ...rest] = f.name.split(' ');
      drawText(ctx, first, x + CW / 2, CY + 88, { ...STYLE.white, align: 'center' });
      drawText(ctx, rest.join(' '), x + CW / 2, CY + 98, { ...STYLE.white, align: 'center' });
      drawText(ctx, f.tag, x + CW / 2, CY + 109, { small: true, color: '#ffd21a', align: 'center' });
      drawText(ctx, f.from, x + CW / 2, CY + 117, { small: true, color: '#8a86b0', align: 'center' });
      // Frames
      const frame = (col, inset) => {
        ctx.fillStyle = col;
        ctx.fillRect(x + inset, CY + inset, CW - inset * 2, 2);
        ctx.fillRect(x + inset, CY + CH - 2 - inset, CW - inset * 2, 2);
        ctx.fillRect(x + inset, CY + inset, 2, CH - inset * 2);
        ctx.fillRect(x + CW - 2 - inset, CY + inset, 2, CH - inset * 2);
      };
      frame('#2a2448', 0);
      if (theirs) frame(blink(3) || oppReady ? '#3a98ff' : '#1a4a90', mine ? 3 : 0);
      if (mine) frame(this.ready ? '#ffffff' : blink(4) ? '#ffd21a' : '#ff8a00', 0);
      if (mine) drawTag(ctx, x + 4, CY - 6, 'YOU', '#ffd21a', '#2a0a00');
      if (theirs) drawTag(ctx, x + CW - 36, CY - 6, oppBot ? 'CPU' : 'RIVAL', '#3a98ff', '#001030');
      if (mine && this.ready) drawText(ctx, 'READY', x + CW / 2, CY + 66, { ...STYLE.gold, align: 'center' });
      if (theirs && oppReady) drawText(ctx, 'READY', x + CW / 2, CY + (mine ? 54 : 66), { ...STYLE.blue, align: 'center' });
    });
    this.readyBtn.draw(ctx);
    this.leaveBtn.draw(ctx);
    const who = oppBot ? 'CPU' : 'RIVAL';
    drawText(ctx, oppReady ? `${who} IS READY!` : `${who} IS CHOOSING...`, W / 2, 176, { small: true, color: oppReady ? '#7ac8ff' : '#8a86b0', align: 'center' });
    drawText(ctx, `CODE ${room?.code || ''}`, W - 6, H - 9, { small: true, color: '#5a5688', align: 'right' });
  }
}

function drawTag(ctx, x, y, text, bg, fg) {
  const w = text.length * 4 + 6;
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, 9);
  drawText(ctx, text, x + 3, y + 2, { small: true, color: fg });
}

export class VsScene {
  constructor() { this.t = 0; }
  enter() {
    music(null);
    sfx('bell');
    const r = net.room;
    this.me = fighterFor(r.fighters, net.you);
    this.opp = fighterFor(r.fighters, 1 - net.you);
    // Build sprites for the fight while the VS card is up.
    prewarm(this.opp, 'front', 1.25);
    prewarm(this.me, 'back', 1);
  }
  update(dt) {
    const before = this.t;
    this.t += dt;
    flashes.update(dt);
    if (before < 0.55 && this.t >= 0.55) { flash('#ffffff', 0.18); shake(4, 0.3); sfx('heavy'); }
  }
  draw(ctx) {
    backdrop(ctx, 0.8);
    const slide = Math.min(1, this.t / 0.5);
    const e = 1 - Math.pow(1 - slide, 3);
    // Diagonal halves
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W / 2 + 30, 0); ctx.lineTo(W / 2 - 30, H); ctx.lineTo(0, H); ctx.closePath(); ctx.clip();
    ctx.fillStyle = 'rgba(160,20,30,0.55)'; ctx.fillRect(0, 0, W, H);
    stripes(ctx, 0, H, 'rgba(255,255,255,0.04)');
    drawPortrait(ctx, this.me, Math.round(-100 + e * 196), 20, { scale: 2.1, clipW: 170, clipH: 150, pose: 'idle' });
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.moveTo(W / 2 + 30, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(W / 2 - 30, H); ctx.closePath(); ctx.clip();
    ctx.fillStyle = 'rgba(20,50,160,0.55)'; ctx.fillRect(0, 0, W, H);
    drawPortrait(ctx, this.opp, Math.round(W + 100 - e * 196), 20, { scale: 2.1, clipW: 170, clipH: 150, pose: 'idle' });
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(W / 2 + 29, 0); ctx.lineTo(W / 2 + 32, 0); ctx.lineTo(W / 2 - 28, H); ctx.lineTo(W / 2 - 31, H); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 168, W, 48);
    if (this.t > 0.55) {
      const s = this.t < 0.7 ? 6 : 5;
      logo(ctx, 'VS', W / 2, 60 - (s - 5) * 6, s, ['#ffffff', '#ffd0c0', '#ff8870', '#ff4a3a', '#f02a2a', '#c01020', '#800818']);
    }
    drawText(ctx, this.me.name, 96, 176, { ...STYLE.gold, align: 'center' });
    drawText(ctx, this.me.from, 96, 188, { small: true, color: '#c8c4e8', align: 'center' });
    drawText(ctx, 'YOU', 96, 200, { small: true, color: '#ffd21a', align: 'center' });
    drawText(ctx, this.opp.name, W - 96, 176, { ...STYLE.blue, align: 'center' });
    drawText(ctx, this.opp.from, W - 96, 188, { small: true, color: '#c8c4e8', align: 'center' });
    drawText(ctx, net.room?.players?.[1 - net.you]?.bot ? 'CPU' : 'RIVAL', W - 96, 200, { small: true, color: '#7ac8ff', align: 'center' });
  }
}
