// Arena backdrop: crowd, light haze, ad boards, ring floor and ropes.
// Pre-rendered at native resolution once (two crowd frames for bobbing).

import { drawText } from './font.js';

export const W = 384, H = 216;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

class Pix {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  set(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255;
  }
  get(x, y) {
    const i = (y * this.w + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2]];
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  circle(cx, cy, r, c) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.8) this.set(cx + x, cy + y, c);
  }
  // Rounded-top body blob.
  torso(cx, top, w, h, c) {
    for (let y = 0; y < h; y++) {
      const inset = y < 2 ? 2 - y : 0;
      for (let x = -w + inset; x <= w - inset; x++) this.set(cx + x, top + y, c);
    }
  }
  line(x0, y0, x1, y1, c, th = 1) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
    for (let i = 0; i <= n; i++) {
      const t = i / (n || 1);
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const tt = typeof th === 'function' ? th(t) : th;
      for (let k = 0; k < tt; k++) this.set(Math.round(x), Math.round(y + k), typeof c === 'function' ? c(k, tt) : c);
    }
  }
  toCanvas() {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    c.getContext('2d').putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    return c;
  }
}

const SHIRTS = ['#c83a3a', '#3a6ac8', '#e0c040', '#48a060', '#d06ab0', '#e08a3a', '#f0f0f0', '#6a4ac8', '#38b0c0', '#a0a0a8', '#282830'].map(hex);
const SKINS = ['#f2c29c', '#d69a6a', '#a8683c', '#704020', '#e8b088'].map(hex);
const HAIRS = ['#1a1414', '#3a2414', '#6a3a1a', '#c09040', '#8a8a8a', '#101010'].map(hex);

export const FLOOR_Y = 118;
export const ROPES = [70, 84, 98];

function buildFrame(frame) {
  const p = new Pix(W, H);
  const r = rng(1234);
  // Backdrop gradient.
  const top = hex('#05030c'), mid = hex('#120c28'), low = hex('#1c1238');
  for (let y = 0; y < H; y++) {
    const c = y < 60 ? mix(top, mid, y / 60) : mix(mid, low, Math.min(1, (y - 60) / 60));
    for (let x = 0; x < W; x++) p.set(x, y, c);
  }
  // Upper-deck silhouette and light truss.
  for (let x = 0; x < W; x++) {
    const h = 3 + Math.round(2 * Math.sin(x * 0.07) + 1.5 * Math.sin(x * 0.19));
    for (let y = 26; y < 26 + h; y++) p.set(x, y, hex('#0a0616'));
  }
  // Crowd rows, far to near.
  const rows = [];
  for (let y = 36, k = 0; y < 106; k++) {
    const rad = 2 + Math.floor(k / 3);
    rows.push({ y, rad, k });
    y += rad * 2 + 2;
  }
  const nRows = rows.length;
  for (const row of rows) {
    const bright = 0.28 + 0.62 * (row.k / (nRows - 1));
    const step = row.rad * 2 + 3;
    const offset = (row.k % 2) * (step / 2);
    for (let x = -step + offset; x < W + step; x += step) {
      const jx = Math.round(x + (r() - 0.5) * 2);
      const shirt = SHIRTS[(r() * SHIRTS.length) | 0];
      const skin = SKINS[(r() * SKINS.length) | 0];
      const hair = HAIRS[(r() * HAIRS.length) | 0];
      const raise = r() < (frame ? 0.22 : 0.1);
      const bob = frame && r() < 0.5 ? -1 : 0;
      const dim = (c) => mix(hex('#0c0818'), c, bright);
      const hy = row.y + bob;
      p.torso(jx, hy + row.rad, row.rad + 1, row.rad * 2 + 2, dim(shirt));
      p.circle(jx, hy, row.rad, dim(skin));
      // Hair cap
      for (let xx = -row.rad; xx <= row.rad; xx++) p.set(jx + xx, hy - row.rad + (Math.abs(xx) >= row.rad ? 1 : 0), dim(hair));
      if (row.rad > 2) p.set(jx - 1, hy, dim(hex('#201010'))), p.set(jx + 1, hy, dim(hex('#201010')));
      if (raise) {
        const side = r() < 0.5 ? -1 : 1;
        const both = r() < 0.4;
        for (const s of both ? [-1, 1] : [side]) {
          p.line(jx + s * (row.rad + 1), hy + row.rad + 1, jx + s * (row.rad + 2), hy - row.rad - 3, dim(skin), 1);
          p.set(jx + s * (row.rad + 2), hy - row.rad - 4, dim(skin));
        }
      }
    }
  }
  // Light haze beams from overhead rigs (dithered).
  const beams = [[64, -0.25], [150, -0.08], [234, 0.08], [320, 0.25]];
  for (let y = 22; y < FLOOR_Y + 4; y++) {
    for (let x = 0; x < W; x++) {
      let I = 0;
      for (const [bx, sl] of beams) {
        const cx = bx + sl * (y - 22) * 1.4;
        const wdt = 6 + (y - 22) * 0.34;
        const dx = Math.abs(x - cx) / wdt;
        if (dx < 1) I += (1 - dx) * 0.42 * (1 - (y - 22) / 140);
      }
      if (I <= 0) continue;
      const th = BAYER[(y & 3) * 4 + (x & 3)];
      if (I > th * 0.9) {
        const c = p.get(x, y);
        p.set(x, y, mix(c, hex('#b8c4ff'), Math.min(0.35, I * 0.5)));
      }
    }
  }
  // Barrier + ad boards.
  const boardY = 104, boardH = 12;
  p.rect(0, boardY, W, boardH, hex('#0e0a1a'));
  p.rect(0, boardY, W, 1, hex('#3a3060'));
  const ads = [
    { w: 70, bg: '#c8161e', fg: '#ffffff' },
    { w: 62, bg: '#101830', fg: '#ffd21a' },
    { w: 74, bg: '#f0c020', fg: '#1a1020' },
    { w: 64, bg: '#1a60c8', fg: '#ffffff' },
    { w: 70, bg: '#2a8a3a', fg: '#ffffff' },
    { w: 60, bg: '#e8e8f0', fg: '#c8161e' },
  ];
  let ax = -8;
  const adRects = [];
  while (ax < W) {
    for (const a of ads) {
      if (ax >= W) break;
      p.rect(ax + 1, boardY + 2, a.w - 2, boardH - 3, hex(a.bg));
      adRects.push({ x: ax + 1, y: boardY + 2, w: a.w - 2, h: boardH - 3, ...a });
      ax += a.w;
    }
  }
  // Ring floor: canvas with perspective shading and a center spotlight.
  const far = hex('#6c74a8'), near = hex('#b6bee4'), hot = hex('#e4e8ff');
  for (let y = FLOOR_Y; y < H; y++) {
    const t = (y - FLOOR_Y) / (H - FLOOR_Y);
    for (let x = 0; x < W; x++) {
      let c = mix(far, near, Math.pow(t, 0.7));
      const dx = (x - 192) / 150, dy = (y - 176) / 44;
      const spot = Math.max(0, 1 - (dx * dx + dy * dy));
      const th = BAYER[(y & 3) * 4 + (x & 3)];
      if (spot * 0.9 > th) c = mix(c, hot, 0.45);
      p.set(x, y, c);
    }
  }
  // Apron edge (far side) line.
  p.rect(0, FLOOR_Y, W, 1, hex('#f0f0ff'));
  p.rect(0, FLOOR_Y + 1, W, 1, hex('#48507a'));
  // Center logo on canvas (flattened ellipse ring).
  for (let y = FLOOR_Y + 30; y < H; y++) {
    for (let x = 60; x < 324; x++) {
      const dx = (x - 192) / 118, dy = (y - 186) / 34;
      const q = dx * dx + dy * dy;
      if (q < 1 && q > 0.8) p.set(x, y, mix(p.get(x, y), hex('#c8161e'), 0.5));
    }
  }
  // Posts and ropes.
  const postL = 30, postR = 354, postTop = 60;
  const post = (x) => {
    for (let y = postTop; y < FLOOR_Y + 2; y++) {
      p.set(x - 2, y, hex('#50506a')); p.set(x - 1, y, hex('#c8c8e0')); p.set(x, y, hex('#9898b8')); p.set(x + 1, y, hex('#50506a'));
    }
    p.rect(x - 3, postTop - 2, 8, 3, hex('#e0e0f0'));
  };
  post(postL); post(postR);
  const ropeCols = [['#ff6a5a', '#c8161e', '#600810'], ['#ffffff', '#c8c8dc', '#686880'], ['#6aa8ff', '#1a50c8', '#0a1860']];
  ROPES.forEach((ry, i) => {
    const [hi, md, lo] = ropeCols[i].map(hex);
    const col = (k, tt) => (k === 0 ? hi : k === tt - 1 ? lo : md);
    // Far rope between the posts.
    for (let x = postL; x <= postR; x++) {
      const sag = Math.round(Math.sin(((x - postL) / (postR - postL)) * Math.PI) * 2);
      for (let k = 0; k < 3; k++) p.set(x, ry + sag + k, col(k, 3));
    }
    // Side ropes toward the camera.
    const nearY = ry + 120 + i * 30;
    p.line(postL, ry, postL - 160, nearY, col, (t) => 3 + Math.round(t * 4));
    p.line(postR, ry, postR + 160, nearY, col, (t) => 3 + Math.round(t * 4));
    // Turnbuckle pads.
    for (const x of [postL, postR]) {
      p.rect(x - 3, ry - 2, 7, 7, lo);
      p.rect(x - 2, ry - 1, 5, 5, md);
      p.rect(x - 2, ry - 1, 2, 2, hi);
    }
  });
  const c = p.toCanvas();
  const ctx = c.getContext('2d');
  const names = ['HAYMAKER', 'KO COLA', 'SPARK TV', 'IRON GYM', 'TURBO', 'BELL 9'];
  adRects.forEach((a, i) => {
    drawText(ctx, names[i % names.length], a.x + a.w / 2, a.y + 2, { small: true, color: a.fg, align: 'center' });
  });
  return c;
}

let frames = null;
export function arenaFrames() {
  if (!frames) frames = [buildFrame(0), buildFrame(1)];
  return frames;
}

// Camera flashes popping in the crowd.
export class Flashes {
  constructor() { this.list = []; this.rate = 1.5; }
  update(dt) {
    if (Math.random() < this.rate * dt) {
      this.list.push({ x: (Math.random() * W) | 0, y: 34 + ((Math.random() * 66) | 0), t: 0 });
    }
    for (const f of this.list) f.t += dt;
    this.list = this.list.filter((f) => f.t < 0.12);
  }
  draw(ctx) {
    for (const f of this.list) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(f.x - 1, f.y, 3, 1);
      ctx.fillRect(f.x, f.y - 1, 1, 3);
      if (f.t < 0.05) {
        ctx.fillStyle = '#fff8c0';
        ctx.fillRect(f.x - 3, f.y, 7, 1);
        ctx.fillRect(f.x, f.y - 3, 1, 7);
      }
    }
  }
}
