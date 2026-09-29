// Shared scene helpers: backdrop, logo, portraits.

import { W, H, engine } from '../engine.js';
import { arenaFrames, Flashes } from '../gfx/arena.js';
import { drawText } from '../gfx/font.js';
import { sprite } from '../gfx/view.js';

export const flashes = new Flashes();

export function backdrop(ctx, dim = 0.55, ox = 0, oy = 0) {
  const fr = arenaFrames();
  ctx.drawImage(fr[Math.floor(engine.time * 2.5) % 2], ox, oy);
  flashes.draw(ctx);
  if (dim > 0) {
    ctx.fillStyle = `rgba(4,2,14,${dim})`;
    ctx.fillRect(0, 0, W, H);
  }
}

const logoCache = new Map();
export function logo(ctx, text, cx, y, scale = 4, colors) {
  const key = text + scale;
  let c = logoCache.get(key);
  if (!c) {
    const pal = colors || ['#fffbe0', '#ffe25a', '#ffc21a', '#ff9a00', '#ff6a00', '#e04000', '#b02800'];
    const tmp = document.createElement('canvas');
    tmp.width = 400; tmp.height = 7 * scale + 8;
    const tx = tmp.getContext('2d');
    const w = drawText(tx, text, 2, 2, { color: pal, outline: '#1a0400', scale });
    const shear = 0.28;
    const h = 7 * scale + 6;
    c = document.createElement('canvas');
    c.width = w + 4 + Math.ceil(h * shear) + 4;
    c.height = h + 6;
    const x = c.getContext('2d');
    // Thick dark extrusion, then sheared face.
    for (let r = 0; r < h; r++) {
      const off = Math.round((h - r) * shear);
      for (let d = 4; d >= 1; d--) {
        x.globalCompositeOperation = 'source-over';
        x.drawImage(tmp, 0, r, w + 4, 1, off + d, r + d, w + 4, 1);
      }
    }
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#3a0a00';
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over';
    for (let r = 0; r < h; r++) {
      const off = Math.round((h - r) * shear);
      x.drawImage(tmp, 0, r, w + 4, 1, off, r, w + 4, 1);
    }
    logoCache.set(key, c);
  }
  ctx.drawImage(c, Math.round(cx - c.width / 2), y);
  return c;
}

// Head-and-shoulders portrait from the front sprite.
export function portrait(fighter, pose = 'idle', scale = 1.6) {
  return sprite(fighter, 'front', scale, pose);
}

export function drawPortrait(ctx, fighter, cx, top, { pose = 'idle', scale = 1.6, clipH = 96, clipW = 110 } = {}) {
  const s = portrait(fighter, pose, scale);
  const hx = s.head.x, hy = s.head.y;
  const sx = Math.round(hx - clipW / 2), sy = Math.max(0, Math.round(hy - fighter.body.headR * scale * 1.5));
  ctx.drawImage(s.canvas, sx, sy, clipW, clipH, Math.round(cx - clipW / 2), top, clipW, clipH);
}

export function stripes(ctx, y, h, color = 'rgba(255,255,255,0.05)') {
  const off = Math.floor(engine.time * 20) % 16;
  ctx.fillStyle = color;
  for (let x = -16 + off; x < W + 16; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, y + h); ctx.lineTo(x + 8, y + h); ctx.lineTo(x + 8 + h, y); ctx.lineTo(x + h, y);
    ctx.fill();
  }
}
