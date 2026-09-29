import { W, H, engine, setScene } from '../engine.js';
import { drawText, STYLE } from '../gfx/font.js';
import { Button, panel, blink } from '../ui.js';
import { sfx } from '../audio.js';
import { net } from '../net.js';
import { backdrop, logo, flashes, stripes } from './common.js';
import { app } from '../app.js';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function codeBoxes(ctx, code, y, cursor = -1) {
  const bw = 34, gap = 8, total = 4 * bw + 3 * gap;
  const x0 = Math.round(W / 2 - total / 2);
  for (let i = 0; i < 4; i++) {
    const x = x0 + i * (bw + gap);
    ctx.fillStyle = '#0a0620';
    ctx.fillRect(x, y, bw, 36);
    ctx.fillStyle = i === cursor ? '#ffd21a' : '#4a3a8a';
    ctx.fillRect(x, y, bw, 2); ctx.fillRect(x, y + 34, bw, 2); ctx.fillRect(x, y, 2, 36); ctx.fillRect(x + bw - 2, y, 2, 36);
    const ch = code[i];
    if (ch) drawText(ctx, ch, x + bw / 2, y + 7, { ...STYLE.gold, align: 'center', scale: 3, shadow: null });
    else if (i === cursor && blink(2)) { ctx.fillStyle = '#ffd21a'; ctx.fillRect(x + 9, y + 28, bw - 18, 3); }
  }
}

export class JoinScene {
  constructor(prefill = '') {
    this.code = (prefill || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    this.err = null;
    this.keys = [];
    const cols = 8, kw = 22, kh = 15, gap = 3;
    const x0 = Math.round(W / 2 - (cols * kw + (cols - 1) * gap) / 2);
    [...LETTERS].forEach((ch, i) => {
      const x = x0 + (i % cols) * (kw + gap), y = 108 + Math.floor(i / cols) * (kh + gap);
      this.keys.push(new Button(ch, x, y, kw, kh, () => this.type(ch), { color: '#2a2058', shade: '#120c30' }));
    });
    this.del = new Button('DEL', x0, 164, 60, 15, () => this.back(), { color: '#4a4468', shade: '#1a1630' });
    this.ok = new Button('JOIN!', x0 + cols * (kw + gap) - gap - 90, 164, 90, 15, () => this.submit());
    this.cancel = new Button('BACK', 6, H - 20, 48, 14, () => setScene(new app.scenes.TitleScene({ attract: false })), { color: '#4a4468', shade: '#1a1630', small: true });
    this.off = net.on((m) => {
      if (m.t === 'error') { this.err = m.msg; sfx('error'); }
    });
  }
  exit() { this.off(); }
  type(ch) {
    if (this.code.length >= 4) return;
    this.code += ch; this.err = null; sfx('move');
    if (this.code.length === 4) this.submit();
  }
  back() { this.code = this.code.slice(0, -1); this.err = null; sfx('move'); }
  submit() {
    if (this.code.length < 4) { sfx('error'); return; }
    this.err = null;
    app.status('CONNECTING...');
    net.join(this.code);
  }
  onKey(k) {
    if (k === 'Escape') return this.cancel.onClick();
    if (k === 'Backspace') return this.back();
    if (k === 'Enter') return this.submit();
    if (k.length === 1 && LETTERS.includes(k)) return this.type(k);
    if (k === 'I' || k === 'O') { this.err = 'CODES NEVER USE I OR O'; sfx('error'); }
  }
  onPointer(type, x, y) {
    for (const b of [...this.keys, this.del, this.ok, this.cancel]) if (b.pointer(type, x, y) && type === 'down') return;
  }
  update(dt) { flashes.update(dt); this.ok.disabled = this.code.length < 4; }
  draw(ctx) {
    backdrop(ctx, 0.7);
    logo(ctx, 'JOIN MATCH', W / 2, 10, 3);
    drawText(ctx, "ENTER YOUR FRIEND'S CODE", W / 2, 44, { small: true, color: '#d8d4f4', align: 'center' });
    codeBoxes(ctx, this.code, 56, this.code.length);
    for (const b of this.keys) b.draw(ctx);
    this.del.draw(ctx); this.ok.draw(ctx); this.cancel.draw(ctx);
    if (this.err) drawText(ctx, this.err, W / 2, 99, { small: true, color: '#ff5a4a', align: 'center' });
    else if (app.statusText) drawText(ctx, app.statusText, W / 2, 99, { small: true, color: '#ffd21a', align: 'center' });
  }
}

export class LobbyScene {
  constructor() {
    this.copied = 0;
    this.copy = new Button('COPY INVITE LINK', W / 2 - 70, 132, 140, 16, () => this.copyLink());
    this.cancel = new Button('CANCEL', W / 2 - 34, 176, 68, 14, () => { net.leave(); setScene(new app.scenes.TitleScene({ attract: false })); }, { color: '#4a4468', shade: '#1a1630', small: true });
  }
  get code() { return net.room?.code || ''; }
  link() { return `${location.origin}${location.pathname}?code=${this.code}`; }
  async copyLink() {
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'HAYMAKER', text: `Fight me! Code ${this.code}`, url: this.link() });
      else await navigator.clipboard.writeText(this.link());
      this.copied = 2.5;
    } catch {
      this.copied = -2.5;
    }
  }
  onKey(k) {
    if (k === 'Escape') this.cancel.onClick();
    if (k === 'C' || k === 'Enter') this.copyLink();
  }
  onPointer(type, x, y) { this.copy.pointer(type, x, y) || this.cancel.pointer(type, x, y); }
  update(dt) {
    flashes.update(dt);
    if (this.copied > 0) this.copied = Math.max(0, this.copied - dt);
    if (this.copied < 0) this.copied = Math.min(0, this.copied + dt);
  }
  draw(ctx) {
    backdrop(ctx, 0.62);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 20, W, 26);
    stripes(ctx, 20, 26);
    logo(ctx, 'MATCH CODE', W / 2, 18, 3);
    codeBoxes(ctx, this.code, 58);
    drawText(ctx, 'SEND THIS CODE TO YOUR FRIEND', W / 2, 102, { small: true, color: '#ffffff', align: 'center' });
    drawText(ctx, 'THEY PICK JOIN MATCH AND TYPE IT IN', W / 2, 110, { small: true, color: '#a8a4d0', align: 'center' });
    this.copy.draw(ctx);
    if (this.copied > 0) drawText(ctx, 'LINK COPIED!', W / 2, 152, { small: true, color: '#7aff7a', align: 'center' });
    if (this.copied < 0) drawText(ctx, this.link().replace(/^https?:\/\//, '').toUpperCase(), W / 2, 152, { small: true, color: '#ffd21a', align: 'center' });
    const dots = '.'.repeat(1 + (Math.floor(engine.time * 3) % 3));
    drawText(ctx, 'WAITING FOR CHALLENGER' + dots, W / 2 - 80, 162, { small: true, color: '#ffd21a' });
    this.cancel.draw(ctx);
  }
}
