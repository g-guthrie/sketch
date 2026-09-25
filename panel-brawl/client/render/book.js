// The physical comic: desk, page stack, paper, spine shading, the reader's
// hands holding it, the cover, and the page-turn animation.

import {
  INK, PAPER, FONT, rand, shade, mix, rgba, makeCanvas, halftone, halftoneGradient, paperTexture, starburstPath,
  comicText, captionBox, speedLines, wobblyRectPath, inkFill, cloudPath,
} from './ink.js';
import { LAYOUT } from '../../shared/constants.js';
import { THEMES, HEROES, HERO_KEYS } from '../../shared/themes.js';
import { drawCharacter, makeAnim } from './characters.js';

const TAU = Math.PI * 2;
const PW = LAYOUT.pageW, PH = LAYOUT.pageH;
const SKIN = '#f0c29a';

// ------------------------------------------------------------------- desk

let deskCache = null;
export function drawDesk(ctx, W, H, parallaxX, parallaxY, t) {
  if (!deskCache || deskCache.w !== W || deskCache.h !== H) {
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#3a2416');
    grad.addColorStop(1, '#1e120b');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // wood grain
    const r = rand(77);
    for (let i = 0; i < 90; i++) {
      const y = r() * H;
      g.strokeStyle = r() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,200,140,0.05)';
      g.lineWidth = 1 + r() * 3;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= W; x += 40) g.lineTo(x, y + Math.sin(x * 0.004 + i) * 8 + (r() - 0.5) * 3);
      g.stroke();
    }
    // planks
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 3;
    for (let y = H * 0.18; y < H; y += H * 0.27) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    // lamp light
    const lg = g.createRadialGradient(W * 0.35, H * 0.3, 10, W * 0.4, H * 0.45, Math.max(W, H) * 0.8);
    lg.addColorStop(0, 'rgba(255,210,140,0.35)');
    lg.addColorStop(0.5, 'rgba(255,170,90,0.08)');
    lg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);
    deskCache = { c, w: W, h: H };
  }
  ctx.drawImage(deskCache.c, parallaxX % 1, parallaxY % 1);
}

// ------------------------------------------------------------- book base

// A reader's desk clutter, visible when the camera pulls back to the book.
export function drawDeskProps(ctx, level, t) {
  const W = level.width;
  ctx.save();
  // coffee mug (top-down) with a steam wisp
  const mx = W + 380, my = 360;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(mx + 22, my + 26, 150, 150, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 12; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.ellipse(mx + 150, my + 10, 70, 44, 0.3, 0, Math.PI * 2);
  ctx.lineWidth = 36; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 20; ctx.strokeStyle = '#e8262b'; ctx.stroke();
  ctx.beginPath(); ctx.arc(mx, my, 140, 0, Math.PI * 2);
  ctx.fillStyle = '#e8262b'; ctx.fill(); ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = halftone(ctx, 'rgba(0,0,0,0.3)', 18, 5); ctx.fill();
  ctx.beginPath(); ctx.arc(mx, my, 108, 0, Math.PI * 2);
  ctx.fillStyle = '#4a2a16'; ctx.fill(); ctx.lineWidth = 8; ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,220,0.35)';
  ctx.beginPath(); ctx.ellipse(mx - 30, my - 34, 38, 16, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 10; ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    const ox = mx - 30 + i * 60;
    ctx.moveTo(ox, my - 20);
    for (let k = 1; k <= 6; k++) ctx.lineTo(ox + Math.sin(t * 1.5 + k + i) * 18, my - 20 - k * 40);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // pencil
  ctx.translate(-470, 900);
  ctx.rotate(1.25);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(14, 16, 620, 44);
  ctx.lineWidth = 8; ctx.strokeStyle = INK;
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(0, 0, 520, 50); ctx.strokeRect(0, 0, 520, 50);
  ctx.fillStyle = '#e6b820'; ctx.fillRect(0, 17, 520, 16);
  ctx.fillStyle = '#c8ced6'; ctx.fillRect(-60, -2, 60, 54); ctx.strokeRect(-60, -2, 60, 54);
  ctx.fillStyle = '#ff8fb0'; ctx.fillRect(-120, 0, 60, 50); ctx.strokeRect(-120, 0, 60, 50);
  ctx.beginPath(); ctx.moveTo(520, 0); ctx.lineTo(640, 25); ctx.lineTo(520, 50); ctx.closePath();
  ctx.fillStyle = '#f0d0a0'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(606, 18); ctx.lineTo(640, 25); ctx.lineTo(606, 32); ctx.closePath();
  ctx.fillStyle = INK; ctx.fill();
  ctx.restore();
}

export function drawBookBase(ctx, level, comic, theme) {
  const W = level.width, H = level.height;
  // shadow on the desk (pre-blurred once; live blur filters are very slow)
  ctx.drawImage(bookShadow(W, H), -150, -90, W + 300, H + 300);
  // back cover peeking out
  const cover = theme ? theme.palette.accent : '#e8262b';
  ctx.fillStyle = shade(cover, -0.3);
  ctx.fillRect(-26, -18, W + 52, H + 44);
  // page stack edges
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = i % 2 ? '#e2d6b8' : '#efe5c9';
    ctx.fillRect(-18 + i * 2, -10 + i, W + 36 - i * 4, H + 28 - i * 3.5);
  }
  // paper
  const pat = ctx.createPattern(paperTexture(), 'repeat');
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  // slight yellowing toward edges
  const eg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.7);
  eg.addColorStop(0, 'rgba(0,0,0,0)');
  eg.addColorStop(1, 'rgba(150,110,40,0.12)');
  ctx.fillStyle = eg;
  ctx.fillRect(0, 0, W, H);

  // page furniture: chapter banner, page numbers, publisher line
  ctx.save();
  const chapter = level.chapter || '';
  const num = level.index + 1;
  comicText(ctx, `CHAPTER ${num}: ${chapter}`, LAYOUT.marginOuter, 58, 44, { align: 'left', fill: '#ffffff', fill2: theme ? theme.palette.burst[0] : '#ffe14a', extrude: 5, outline: 4, jitter: 0.04, seed: num, rot: -0.01 });
  ctx.font = `26px ${FONT}`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  for (const pg of level.pages) {
    ctx.fillText(String(pg.num + (comic ? 0 : 0)), pg.x + pg.w / 2, pg.y + pg.h - 60);
  }
  ctx.font = `18px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(20,20,20,0.6)';
  if (comic) ctx.fillText(`${comic.title} #${comic.issue} · ${comic.publisher} · ${comic.month} ${comic.year}`, W - LAYOUT.marginOuter, H - 60);
  ctx.restore();
}

let shadowCache = null;
export function bookShadow(W, H) {
  const key = W + 'x' + H;
  if (shadowCache && shadowCache.key === key) return shadowCache.c;
  const k = 0.1; // low-res is fine for a soft shadow
  const c = makeCanvas(Math.ceil((W + 300) * k), Math.ceil((H + 300) * k));
  const g = c.getContext('2d');
  g.filter = `blur(${30 * k}px)`;
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(140 * k, 130 * k, (W + 60) * k, (H + 40) * k);
  shadowCache = { key, c };
  return c;
}

export function drawSpine(ctx, level) {
  const H = level.height;
  const x = PW;
  const g = ctx.createLinearGradient(x - 160, 0, x + 160, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.42, 'rgba(60,40,20,0.10)');
  g.addColorStop(0.5, 'rgba(30,20,10,0.32)');
  g.addColorStop(0.58, 'rgba(60,40,20,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 160, -10, 320, H + 20);
  ctx.strokeStyle = 'rgba(40,25,10,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, H);
  ctx.stroke();
  // staples
  for (const sy of [H * 0.3, H * 0.7]) {
    ctx.fillStyle = '#b8bec6';
    ctx.fillRect(x - 3, sy - 40, 6, 80);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 3, sy - 40, 6, 80);
  }
}

// ------------------------------------------------------------------ hands

function handPaths(t) {
  // Left hand in book space, holding the bottom-left corner. Mirrored for the right.
  const bob = Math.sin(t * 0.8) * 4;
  const palm = new Path2D();
  palm.moveTo(-620, 2600 + bob);
  palm.bezierCurveTo(-560, 2320, -330, 2140, -120, 2080 + bob);
  palm.bezierCurveTo(-40, 2060, 10, 2120, -20, 2200 + bob);
  palm.bezierCurveTo(-60, 2330, -120, 2460, -90, 2700);
  palm.closePath();
  // four fingers curling around the book's edge from behind
  const fingers = [];
  const creases = [];
  const widths = [84, 90, 86, 74];
  const reach = [34, 44, 36, 18];
  let fy = 1700 + bob;
  for (let i = 0; i < 4; i++) {
    const w = widths[i];
    const tip = reach[i];
    const f = new Path2D();
    f.moveTo(-300, fy + w * 0.9);
    f.bezierCurveTo(-260, fy + 4, -120, fy - 6, -30, fy + 2);
    f.bezierCurveTo(tip, fy + 6, tip + 14, fy + w * 0.75, -20, fy + w * 0.92);
    f.bezierCurveTo(-110, fy + w * 1.05, -220, fy + w * 1.2, -280, fy + w * 1.7);
    f.closePath();
    fingers.push(f);
    const c = new Path2D();
    for (const cx of [-150, -62]) {
      c.moveTo(cx, fy + w * 0.12);
      c.quadraticCurveTo(cx - 14, fy + w * 0.45, cx - 4, fy + w * 0.8);
    }
    creases.push(c);
    fy += w * 0.96;
  }
  const thumb = new Path2D();
  thumb.moveTo(-180, 2330 + bob);
  thumb.bezierCurveTo(-130, 2210, -30, 2150, 70, 2128 + bob);
  thumb.bezierCurveTo(150, 2110, 214, 2126, 222, 2160 + bob);
  thumb.bezierCurveTo(230, 2198, 190, 2222, 120, 2230 + bob);
  thumb.bezierCurveTo(40, 2240, -20, 2290, -40, 2380 + bob);
  thumb.closePath();
  const nail = new Path2D();
  nail.moveTo(158, 2132 + bob);
  nail.bezierCurveTo(196, 2126, 214, 2144, 212, 2164 + bob);
  nail.bezierCurveTo(200, 2176, 172, 2176, 156, 2164 + bob);
  nail.closePath();
  const sleeve = new Path2D();
  sleeve.moveTo(-760, 2380 + bob);
  sleeve.lineTo(-420, 2330 + bob);
  sleeve.bezierCurveTo(-380, 2460, -330, 2640, -300, 2900);
  sleeve.lineTo(-900, 2900);
  sleeve.closePath();
  return { palm, fingers, creases, thumb, nail, sleeve };
}

function paintSkin(ctx, path, lw = 7) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = INK;
  ctx.stroke(path);
  ctx.fillStyle = SKIN;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  const sh = new Path2D();
  sh.rect(-3000, -3000, 9000, 9000);
  sh.addPath(path, new DOMMatrix().translate(-15, -13));
  ctx.fillStyle = shade(SKIN, -0.12);
  ctx.fill(sh, 'evenodd');
  ctx.fillStyle = halftone(ctx, shade(SKIN, -0.3), 14, 3);
  ctx.fill(sh, 'evenodd');
  ctx.restore();
}

// fingers wrap behind the book
export function drawHandsBack(ctx, level, t) {
  const W = level.width;
  for (const side of [-1, 1]) {
    ctx.save();
    if (side > 0) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    const h = handPaths(t + (side > 0 ? 1.7 : 0));
    // bottom finger first so each upper finger overlaps the one below
    for (let i = h.fingers.length - 1; i >= 0; i--) {
      paintSkin(ctx, h.fingers[i], 6);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,20,20,0.75)';
      ctx.stroke(h.creases[i]);
    }
    ctx.restore();
  }
}

// palm + thumb in front of the page
export function drawHandsFront(ctx, level, t) {
  const W = level.width;
  for (const side of [-1, 1]) {
    ctx.save();
    if (side > 0) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    const h = handPaths(t + (side > 0 ? 1.7 : 0));
    // sleeve
    ctx.lineWidth = 14;
    ctx.strokeStyle = INK;
    ctx.stroke(h.sleeve);
    ctx.fillStyle = '#2f4f7f';
    ctx.fill(h.sleeve);
    ctx.save();
    ctx.clip(h.sleeve);
    ctx.fillStyle = halftone(ctx, '#1f3558', 18, 5);
    ctx.fillRect(-1000, 2300, 800, 700);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 6;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(-900 + i * 90, 2380);
      ctx.lineTo(-800 + i * 90, 2900);
      ctx.stroke();
    }
    ctx.restore();
    paintSkin(ctx, h.palm, 7);
    paintSkin(ctx, h.thumb, 7);
    ctx.fillStyle = '#f8d9c0';
    ctx.fill(h.nail);
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke(h.nail);
    // knuckle crease
    ctx.beginPath();
    ctx.moveTo(40, 2180);
    ctx.quadraticCurveTo(60, 2200, 50, 2224);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  }
}

// ------------------------------------------------------------------- cover

const coverCache = new Map();
export function coverImage(comic, res, starHeroes = []) {
  const key = comic.seed + '|' + res + '|' + starHeroes.join(',');
  if (coverCache.has(key)) return coverCache.get(key);
  if (coverCache.size > 3) coverCache.clear();
  const c = makeCanvas(Math.ceil(PW * res), Math.ceil(PH * res));
  const g = c.getContext('2d');
  g.scale(res, res);
  paintCover(g, comic, starHeroes);
  coverCache.set(key, c);
  return c;
}

function paintCover(g, comic, starHeroes = []) {
  const th = THEMES[comic.theme];
  const pal = th.palette;
  const r = rand(comic.coverSeed);
  const bg = th.mono ? '#f2efe6' : pal.accent3 === '#ffe14a' ? '#ffe14a' : pal.burst[0];
  // background
  g.fillStyle = th.mono ? '#e9e4d8' : mix(pal.accent2, '#ffffff', 0.15);
  g.fillRect(0, 0, PW, PH);
  halftoneGradient(g, 0, 0, PW, PH, th.mono ? '#141414' : shade(pal.accent2, -0.35), { dir: 'radial', spacing: 22, maxR: 12, cx: PW / 2, cy: PH * 0.55 });
  // radiating burst
  g.save();
  g.translate(PW / 2, PH * 0.56);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU;
    g.fillStyle = i % 2 ? (th.mono ? '#d7141a' : pal.accent) : (th.mono ? '#141414' : bg);
    g.globalAlpha = 0.35;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * 2200, Math.sin(a) * 2200);
    g.lineTo(Math.cos(a + TAU / 52) * 2200, Math.sin(a + TAU / 52) * 2200);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.globalAlpha = 1;

  // villain looming
  const boss = th.enemies.boss;
  const bossEnt = { x: PW * 0.58, y: PH * 0.86, vx: 0, vy: 0, facing: -1, aim: Math.PI + 0.25, h: 184, onGround: true, look: { ...boss.look, scale: 6.2 }, act: 2 };
  if (boss.look.body === 'brainjar') { bossEnt.y = PH * 0.62; bossEnt.h = 150 * 6.2 / 2.2; }
  const A = makeAnim(5);
  A.t = 1;
  g.save();
  g.globalAlpha = 1;
  drawCharacter(g, bossEnt, A, { lw: 3.2, noShadow: true });
  g.restore();
  // heroes charging in
  // the reader's own hero gets top billing on the cover
  const heroes = [starHeroes[0] || HERO_KEYS[Math.floor(r() * HERO_KEYS.length)], starHeroes[1] || HERO_KEYS[Math.floor(r() * HERO_KEYS.length)]];
  const weapons = ['launcher', 'shotgun', 'rail', 'smg', 'blade'];
  heroes.forEach((hk, i) => {
    const ent = { x: PW * (0.22 + i * 0.2), y: PH * (0.95 - i * 0.02), vx: 390, vy: 0, facing: 1, aim: -0.35 - i * 0.15, h: 92, onGround: i === 0, look: { ...HEROES[hk].look, scale: 5 - i * 0.6 }, crouch: false };
    const An = makeAnim(i + 2);
    An.phase = 1.2 + i;
    An.speed = 390;
    for (let k = 0; k < 20; k++) An.cape = null;
    drawCharacter(g, ent, An, { weapon: weapons[Math.floor(r() * weapons.length)], lw: 3, noShadow: true });
  });

  // title band
  g.fillStyle = th.mono ? '#141414' : pal.accent;
  g.fillRect(0, 0, PW, 470);
  g.fillStyle = halftone(g, rgba('#000000', 0.25), 14, 4);
  g.fillRect(0, 0, PW, 470);
  g.lineWidth = 10;
  g.strokeStyle = INK;
  g.beginPath();
  g.moveTo(0, 470);
  g.lineTo(PW, 470);
  g.stroke();
  // corner box
  g.fillStyle = '#ffffff';
  g.fillRect(40, 40, 230, 230);
  g.lineWidth = 8;
  g.strokeRect(40, 40, 230, 230);
  g.fillStyle = INK;
  g.font = `38px ${FONT}`;
  g.textAlign = 'center';
  g.fillText(comic.publisher.split(' ')[0], 155, 96);
  g.font = `74px ${FONT}`;
  g.fillText(comic.price, 155, 172);
  g.font = `34px ${FONT}`;
  g.fillText(`NO. ${comic.issue}  ${comic.month}`, 155, 238);
  // title
  const words = comic.title.split(' ');
  let line1 = '', line2 = '';
  for (const w of words) {
    if ((line1 + ' ' + w).trim().length <= Math.ceil(comic.title.length / 2) + 2 && !line2) line1 = (line1 + ' ' + w).trim();
    else line2 = (line2 + ' ' + w).trim();
  }
  comicText(g, line1, 340, 150, 118, { align: 'left', fill: '#ffffff', fill2: th.mono ? '#dddddd' : pal.burst[0], extrude: 16, outline: 10, jitter: 0.06, seed: 11, rot: -0.03 });
  if (line2) comicText(g, line2, 300, 330, 150, { align: 'left', fill: th.mono ? '#ffffff' : '#fff36b', fill2: th.mono ? '#d7141a' : '#ff7a1a', extrude: 20, outline: 12, jitter: 0.05, seed: 12, rot: -0.03 });

  // blurb burst
  const bx = PW * 0.76, by = PH * 0.32;
  const burst = starburstPath(bx, by, 190, 270, 14, comic.coverSeed % 97);
  g.fillStyle = th.mono ? '#ffffff' : '#fff36b';
  g.fill(burst);
  g.lineWidth = 9;
  g.strokeStyle = INK;
  g.stroke(burst);
  g.save();
  g.translate(bx, by);
  g.rotate(0.12);
  g.fillStyle = INK;
  g.font = `52px ${FONT}`;
  g.textAlign = 'center';
  const lines = wrapWords(g, comic.blurb, 300);
  lines.forEach((l, i) => g.fillText(l, 0, (i - (lines.length - 1) / 2) * 56 + 18));
  g.restore();

  // bottom caption
  captionBox(g, 60, PH - 250, `IN THIS ISSUE: ${comic.villain} STRIKES!`, { size: 54, maxW: 900, fill: pal.caption || '#ffe36e', seed: 3, lw: 7 });
  // code seal
  g.fillStyle = '#ffffff';
  g.fillRect(PW - 250, PH - 260, 190, 200);
  g.lineWidth = 7;
  g.strokeRect(PW - 250, PH - 260, 190, 200);
  g.fillStyle = INK;
  g.font = `28px ${FONT}`;
  g.textAlign = 'center';
  ['APPROVED', 'BY THE', 'PANEL', 'CODE', 'AUTHORITY'].forEach((l, i) => g.fillText(l, PW - 155, PH - 222 + i * 34));
  // frame
  g.lineWidth = 16;
  g.strokeRect(8, 8, PW - 16, PH - 16);
}

function wrapWords(g, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ------------------------------------------------------------- page flip

// Draws a sheet rotating around the spine. k: 0 = flat on the right, 1 = flat on the left.
export function drawFlipSheet(ctx, front, back, k) {
  const a = k * Math.PI;
  const c = Math.cos(a);
  const lift = Math.sin(a);
  ctx.save();
  ctx.translate(PW, 0);
  const w = PW * Math.abs(c);
  if (w < 1) { ctx.restore(); return; }
  const img = c >= 0 ? front : back;
  // fake perspective: the free edge lifts & grows a little
  const skew = lift * 0.06 * (c >= 0 ? -1 : 1);
  ctx.transform(1, skew, 0, 1 + lift * 0.04, 0, -lift * 40);
  // shadow under the sheet
  ctx.fillStyle = `rgba(0,0,0,${0.25 * lift})`;
  if (c >= 0) ctx.fillRect(0, 20, w + 60 * lift, PH);
  else ctx.fillRect(-w - 60 * lift, 20, w + 60 * lift, PH);
  if (img) {
    if (c >= 0) ctx.drawImage(img, 0, 0, w, PH);
    else ctx.drawImage(img, -w, 0, w, PH);
  } else {
    ctx.fillStyle = PAPER;
    if (c >= 0) ctx.fillRect(0, 0, w, PH); else ctx.fillRect(-w, 0, w, PH);
  }
  // shading across the curl
  const g = c >= 0 ? ctx.createLinearGradient(0, 0, w, 0) : ctx.createLinearGradient(0, 0, -w, 0);
  g.addColorStop(0, `rgba(0,0,0,${0.35 * lift})`);
  g.addColorStop(0.6, `rgba(0,0,0,${0.08 * lift})`);
  g.addColorStop(1, `rgba(255,255,255,${0.25 * lift})`);
  ctx.fillStyle = g;
  if (c >= 0) ctx.fillRect(0, 0, w, PH); else ctx.fillRect(-w, 0, w, PH);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  if (c >= 0) ctx.strokeRect(0, 0, w, PH); else ctx.strokeRect(-w, 0, w, PH);
  ctx.restore();
}

export { PW, PH };
