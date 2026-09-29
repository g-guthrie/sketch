// Particles, hit bursts and floating text.

import { drawText, STYLE } from './font.js';

export class FX {
  constructor() { this.items = []; }

  clear() { this.items = []; }

  burst(x, y, size = 1, palette = 'hit') {
    this.items.push({ kind: 'burst', x, y, t: 0, life: 0.22, size, palette, rot: Math.random() * Math.PI });
    const n = Math.round(6 * size);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 120 * size;
      this.items.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, t: 0, life: 0.25 + Math.random() * 0.2, col: Math.random() < 0.5 ? '#fff6b0' : '#ffb020' });
    }
  }

  sweat(x, y, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 50 + Math.random() * 80;
      this.items.push({ kind: 'drop', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.6 });
    }
  }

  stars(x, y, n = 5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 60;
      this.items.push({ kind: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, t: 0, life: 0.9 });
    }
  }

  block(x, y) {
    this.items.push({ kind: 'ring', x, y, t: 0, life: 0.18 });
  }

  whiff(x, y, dir = 1) {
    this.items.push({ kind: 'whiff', x, y, dir, t: 0, life: 0.2 });
  }

  text(str, x, y, style = STYLE.gold, opts = {}) {
    this.items.push({ kind: 'text', str, x, y, style, t: 0, life: opts.life ?? 0.9, rise: opts.rise ?? 18, scale: opts.scale ?? 1, pop: opts.pop ?? true });
  }

  update(dt) {
    for (const p of this.items) {
      p.t += dt;
      if (p.vx !== undefined) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += (p.kind === 'drop' ? 380 : p.kind === 'star' ? 120 : 200) * dt;
      }
    }
    this.items = this.items.filter((p) => p.t < p.life);
  }

  draw(ctx) {
    for (const p of this.items) {
      const u = p.t / p.life;
      const X = Math.round(p.x), Y = Math.round(p.y);
      switch (p.kind) {
        case 'burst': drawBurst(ctx, X, Y, p.size, u, p.rot, p.palette); break;
        case 'spark':
          ctx.fillStyle = p.col;
          ctx.fillRect(X, Y, u < 0.5 ? 2 : 1, u < 0.5 ? 2 : 1);
          break;
        case 'drop':
          ctx.fillStyle = '#d8f0ff';
          ctx.fillRect(X, Y, 2, 2);
          ctx.fillStyle = '#7ab8e8';
          ctx.fillRect(X, Y + 2, 2, 1);
          break;
        case 'star': drawStar(ctx, X, Y, u < 0.8 || Math.floor(p.t * 20) % 2 === 0); break;
        case 'ring': {
          const r = 4 + u * 14;
          ctx.strokeStyle = u < 0.5 ? '#ffffff' : '#a8d0ff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(X, Y, r, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'whiff': {
          ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - u)})`;
          for (let i = 0; i < 4; i++) ctx.fillRect(X + p.dir * (i * 6 + u * 12), Y - 6 + i * 4, 10, 1);
          break;
        }
        case 'text': {
          const y = Y - p.rise * Math.min(1, u * 2);
          if (u > 0.8 && Math.floor(p.t * 30) % 2) break;
          const sc = p.pop && p.t < 0.06 ? p.scale + 1 : p.scale;
          drawText(ctx, p.str, X, Math.round(y), { ...p.style, align: 'center', scale: sc });
          break;
        }
      }
    }
  }
}

function drawBurst(ctx, x, y, size, u, rot, palette) {
  const R = (10 + 14 * size) * (u < 0.35 ? 0.6 + u : 1);
  const rays = 8;
  const cols = palette === 'star' ? ['#ffffff', '#fff070', '#ffb000'] : palette === 'block' ? ['#ffffff', '#c8e4ff', '#5a9aff'] : ['#ffffff', '#fff6b0', '#ff8a1a'];
  if (u > 0.7 && Math.floor(u * 20) % 2) return;
  // Star polygon.
  const pts = [];
  for (let i = 0; i < rays * 2; i++) {
    const a = rot + (i / (rays * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? R : R * 0.42;
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  const poly = (scale, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    pts.forEach(([px, py], i) => {
      const qx = x + (px - x) * scale, qy = y + (py - y) * scale;
      i ? ctx.lineTo(Math.round(qx), Math.round(qy)) : ctx.moveTo(Math.round(qx), Math.round(qy));
    });
    ctx.closePath();
    ctx.fill();
  };
  poly(1, cols[2]);
  poly(0.78, cols[1]);
  poly(0.5, cols[0]);
}

export function drawStar(ctx, x, y, on = true, big = false) {
  if (!on) return;
  const m = big ? [
    '....#....',
    '...###...',
    '#########',
    '.#######.',
    '..#####..',
    '..##.##..',
    '.##...##.',
  ] : [
    '..#..',
    '#####',
    '.###.',
    '.#.#.',
  ];
  const w = m[0].length;
  for (let j = 0; j < m.length; j++) for (let i = 0; i < w; i++) {
    if (m[j][i] !== '#') continue;
    ctx.fillStyle = j < 2 ? '#fffbd0' : '#ffd21a';
    ctx.fillRect(x - (w >> 1) + i, y - (m.length >> 1) + j, 1, 1);
  }
}
