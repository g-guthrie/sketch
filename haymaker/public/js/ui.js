// Small UI kit: arcade panels, menus and on-screen buttons.

import { drawText, textWidth, STYLE } from './gfx/font.js';
import { engine } from './engine.js';
import { sfx } from './audio.js';

export function panel(ctx, x, y, w, h, { fill = 'rgba(8,4,24,0.86)', edge = '#ffd21a', inner = '#6a3a00' } = {}) {
  ctx.fillStyle = fill;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = edge;
  ctx.fillRect(x + 2, y, w - 4, 1); ctx.fillRect(x + 2, y + h - 1, w - 4, 1);
  ctx.fillRect(x, y + 2, 1, h - 4); ctx.fillRect(x + w - 1, y + 2, 1, h - 4);
  ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + w - 2, y + 1, 1, 1);
  ctx.fillRect(x + 1, y + h - 2, 1, 1); ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
  ctx.fillStyle = inner;
  ctx.fillRect(x + 2, y + 2, w - 4, 1);
}

export function blink(rate = 2) { return Math.floor(engine.time * rate * 2) % 2 === 0; }

// Vertical menu with keyboard + pointer support.
export class Menu {
  constructor(items, { x, y, w = 150, gap = 16, onPick } = {}) {
    this.items = items; // { label, action, disabled? }
    this.x = x; this.y = y; this.w = w; this.gap = gap;
    this.sel = 0;
    this.onPick = onPick;
  }
  rect(i) { return { x: this.x - this.w / 2, y: this.y + i * this.gap - 3, w: this.w, h: this.gap - 2 }; }
  move(d) {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      this.sel = (this.sel + d + n) % n;
      if (!this.items[this.sel].disabled) break;
    }
    sfx('move');
  }
  key(k) {
    if (k === 'ArrowUp' || k === 'W') { this.move(-1); return true; }
    if (k === 'ArrowDown' || k === 'S') { this.move(1); return true; }
    if (k === 'Enter' || k === ' ' || k === 'J') { this.pick(this.sel); return true; }
    return false;
  }
  pick(i) {
    const it = this.items[i];
    if (!it || it.disabled) { sfx('error'); return; }
    sfx('select');
    this.onPick?.(it, i);
  }
  pointer(type, x, y) {
    for (let i = 0; i < this.items.length; i++) {
      const r = this.rect(i);
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
        if (type === 'move' && this.sel !== i && !this.items[i].disabled) { this.sel = i; sfx('move'); }
        if (type === 'down') { this.sel = i; this.pick(i); }
        return true;
      }
    }
    return false;
  }
  draw(ctx) {
    this.items.forEach((it, i) => {
      const r = this.rect(i);
      const on = i === this.sel;
      if (on) {
        ctx.fillStyle = 'rgba(255,210,26,0.13)';
        ctx.fillRect(Math.round(r.x), r.y, this.w, r.h);
        const bob = Math.floor(engine.time * 6) % 2;
        drawGlove(ctx, Math.round(this.x - textWidth(it.label) / 2 - 14 + bob), r.y + r.h / 2);
      }
      const style = it.disabled ? { color: '#5a5678' } : on ? { color: GOLD, shadow: '#000' } : { color: '#d8d4f4', shadow: '#000' };
      drawText(ctx, it.label, this.x, r.y + 3, { ...style, align: 'center' });
    });
  }
}

const GOLD = ['#fffbd0', '#ffe25a', '#ffc21a', '#ff9a00', '#ff7a00', '#e05400', '#c03c00'];

export function drawGlove(ctx, x, y) {
  const m = [
    '..####..',
    '.#rrrr#.',
    '#rwrrrr#',
    '#rrrrrr#',
    '#rrrrr##',
    '.#rrr#w#',
    '..###ww.',
  ];
  const c = { '#': '#2a0406', r: '#e8242a', w: '#ffd2c0' };
  for (let j = 0; j < m.length; j++) for (let i = 0; i < m[j].length; i++) {
    const ch = m[j][i];
    if (ch === '.') continue;
    ctx.fillStyle = c[ch];
    ctx.fillRect(x - 4 + i, Math.round(y - 3 + j), 1, 1);
  }
}

// Rectangular touch/click button.
export class Button {
  constructor(label, x, y, w, h, onClick, opts = {}) {
    Object.assign(this, { label, x, y, w, h, onClick, ...opts });
    this.hover = false;
  }
  hit(x, y) { return x >= this.x && x < this.x + this.w && y >= this.y && y < this.y + this.h; }
  pointer(type, x, y) {
    const h = this.hit(x, y);
    if (type === 'move') this.hover = h;
    if (type === 'down' && h && !this.disabled) { sfx('select'); this.onClick?.(); return true; }
    return h;
  }
  draw(ctx) {
    const on = this.hover || this.active;
    ctx.fillStyle = this.disabled ? '#24203a' : on ? '#ffd21a' : this.color || '#c8161e';
    ctx.fillRect(this.x, this.y + 1, this.w, this.h - 2);
    ctx.fillRect(this.x + 1, this.y, this.w - 2, this.h);
    ctx.fillStyle = this.disabled ? '#16122a' : on ? '#b07000' : this.shade || '#6a0810';
    ctx.fillRect(this.x + 1, this.y + this.h - 2, this.w - 2, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    if (!this.disabled) ctx.fillRect(this.x + 2, this.y + 1, this.w - 4, 1);
    drawText(ctx, this.label, this.x + this.w / 2, this.y + Math.round((this.h - (this.small ? 5 : 7)) / 2), {
      small: this.small, color: this.disabled ? '#5a5678' : on ? '#2a0a00' : '#ffffff', align: 'center',
    });
  }
}
