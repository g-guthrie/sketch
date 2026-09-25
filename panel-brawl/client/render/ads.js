// The comic's back-page mail-order ads: between chapters every player clips
// a coupon (a perk). Drawn in screen space over the book, styled like a
// cramped 1960s ad page on yellowed newsprint.

import { INK, FONT, rand, shade, rgba, halftone, starburstPath, comicTextCached } from './ink.js';
import { PERKS } from '../../shared/perks.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const PAPER = '#efe4c4';
const RED = '#c8262b';

// One accent colour per ad so the page reads as a collage of different ads.
const AD_COLORS = ['#c8262b', '#1f5fd1', '#1d8a4a', '#d98a14', '#7b3fb8', '#0f7c8a'];

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Little woodcut-style illustrations for each ad.
function drawIcon(ctx, icon, r, col) {
  ctx.save();
  ctx.lineWidth = Math.max(2, r * 0.09);
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const fill = (c) => { ctx.fillStyle = c; ctx.fill(); ctx.stroke(); };
  switch (icon) {
    case 'specs': {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(s * r * 0.45, 0, r * 0.36, 0, TAU);
        fill('#ffffff');
        // spiral "x-ray" swirl
        ctx.beginPath();
        for (let a = 0; a < 10; a += 0.3) {
          const rr = (a / 10) * r * 0.3;
          const px = s * r * 0.45 + Math.cos(a) * rr, py = Math.sin(a) * rr;
          if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, -r * 0.05);
      ctx.quadraticCurveTo(0, -r * 0.2, r * 0.1, -r * 0.05);
      ctx.moveTo(-r * 0.8, -r * 0.05);
      ctx.lineTo(-r * 1.0, -r * 0.2);
      ctx.moveTo(r * 0.8, -r * 0.05);
      ctx.lineTo(r * 1.0, -r * 0.2);
      ctx.stroke();
      break;
    }
    case 'muscle': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, r * 0.5);
      ctx.quadraticCurveTo(-r * 0.7, -r * 0.2, -r * 0.2, -r * 0.35);
      ctx.quadraticCurveTo(-r * 0.3, -r * 0.8, r * 0.15, -r * 0.85);
      ctx.quadraticCurveTo(r * 0.55, -r * 0.8, r * 0.45, -r * 0.35);
      ctx.quadraticCurveTo(r * 0.9, -r * 0.2, r * 0.8, r * 0.3);
      ctx.quadraticCurveTo(r * 0.3, r * 0.65, -r * 0.9, r * 0.5);
      fill('#f2c49b');
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.35);
      ctx.quadraticCurveTo(r * 0.15, -r * 0.1, r * 0.45, -r * 0.35);
      ctx.stroke();
      break;
    }
    case 'boots': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, -r * 0.8);
      ctx.lineTo(r * 0.15, -r * 0.8);
      ctx.lineTo(r * 0.2, r * 0.1);
      ctx.lineTo(r * 0.75, r * 0.2);
      ctx.lineTo(r * 0.75, r * 0.5);
      ctx.lineTo(-r * 0.4, r * 0.5);
      ctx.closePath();
      fill(col);
      // flames
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, r * 0.5);
      ctx.lineTo(-r * 0.2, r * 0.95);
      ctx.lineTo(0, r * 0.62);
      ctx.lineTo(r * 0.18, r * 1.0);
      ctx.lineTo(r * 0.35, r * 0.62);
      ctx.lineTo(r * 0.55, r * 0.9);
      ctx.lineTo(r * 0.7, r * 0.5);
      fill('#ffb21f');
      break;
    }
    case 'ring': {
      ctx.beginPath();
      ctx.arc(0, r * 0.2, r * 0.55, 0, TAU);
      ctx.arc(0, r * 0.2, r * 0.38, 0, TAU, true);
      fill('#ffd23f');
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.95);
      ctx.lineTo(r * 0.35, -r * 0.55);
      ctx.lineTo(0, -r * 0.3);
      ctx.lineTo(-r * 0.35, -r * 0.55);
      ctx.closePath();
      fill(col);
      break;
    }
    case 'heart': {
      ctx.beginPath();
      ctx.moveTo(0, r * 0.8);
      ctx.bezierCurveTo(-r * 1.1, r * 0.05, -r * 0.7, -r * 0.9, 0, -r * 0.35);
      ctx.bezierCurveTo(r * 0.7, -r * 0.9, r * 1.1, r * 0.05, 0, r * 0.8);
      fill('#e8262b');
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.1);
      ctx.lineTo(r * 0.5, -r * 0.1);
      ctx.moveTo(0, -r * 0.55);
      ctx.lineTo(0, r * 0.35);
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      break;
    }
    case 'coin': {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.75, 0, TAU);
      fill('#ffd23f');
      ctx.beginPath();
      for (let a = 0; a < 16; a += 0.25) {
        const rr = (a / 16) * r * 0.6;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      break;
    }
    case 'bottle': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, -r * 0.9);
      ctx.lineTo(r * 0.15, -r * 0.9);
      ctx.lineTo(r * 0.15, -r * 0.45);
      ctx.quadraticCurveTo(r * 0.6, -r * 0.3, r * 0.55, r * 0.2);
      ctx.lineTo(r * 0.55, r * 0.8);
      ctx.lineTo(-r * 0.55, r * 0.8);
      ctx.lineTo(-r * 0.55, r * 0.2);
      ctx.quadraticCurveTo(-r * 0.6, -r * 0.3, -r * 0.15, -r * 0.45);
      ctx.closePath();
      fill('#1b1b2b');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-r * 0.4, r * 0.05, r * 0.8, r * 0.4);
      ctx.strokeRect(-r * 0.4, r * 0.05, r * 0.8, r * 0.4);
      break;
    }
    case 'buzzer': {
      ctx.beginPath();
      ctx.arc(0, r * 0.1, r * 0.55, 0, TAU);
      fill('#dddddd');
      ctx.beginPath();
      ctx.arc(0, r * 0.1, r * 0.2, 0, TAU);
      fill(col);
      ctx.beginPath();
      for (const a of [-2.4, -1.6, -0.8]) {
        ctx.moveTo(Math.cos(a) * r * 0.7, r * 0.1 + Math.sin(a) * r * 0.7);
        ctx.lineTo(Math.cos(a) * r * 0.95, r * 0.1 + Math.sin(a) * r * 0.95);
      }
      ctx.strokeStyle = '#d98a14';
      ctx.stroke();
      break;
    }
    case 'judo': {
      // stick-figure throw
      ctx.lineWidth = Math.max(3, r * 0.13);
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.55, r * 0.16, 0, TAU);
      ctx.moveTo(-r * 0.35, -r * 0.4);
      ctx.lineTo(-r * 0.3, r * 0.2);
      ctx.lineTo(-r * 0.6, r * 0.8);
      ctx.moveTo(-r * 0.3, r * 0.2);
      ctx.lineTo(0, r * 0.8);
      ctx.moveTo(-r * 0.33, -r * 0.2);
      ctx.lineTo(r * 0.2, -r * 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r * 0.55, -r * 0.2, r * 0.14, 0, TAU);
      ctx.moveTo(r * 0.45, -r * 0.3);
      ctx.lineTo(r * 0.1, -r * 0.8);
      ctx.moveTo(r * 0.45, -r * 0.1);
      ctx.lineTo(r * 0.9, r * 0.3);
      ctx.stroke();
      break;
    }
    default: {
      // open book with speed lines
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.4);
      ctx.quadraticCurveTo(-r * 0.5, -r * 0.6, -r * 0.9, -r * 0.4);
      ctx.lineTo(-r * 0.9, r * 0.5);
      ctx.quadraticCurveTo(-r * 0.5, r * 0.3, 0, r * 0.5);
      ctx.quadraticCurveTo(r * 0.5, r * 0.3, r * 0.9, r * 0.5);
      ctx.lineTo(r * 0.9, -r * 0.4);
      ctx.quadraticCurveTo(r * 0.5, -r * 0.6, 0, -r * 0.4);
      ctx.closePath();
      fill('#ffffff');
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.4);
      ctx.lineTo(0, r * 0.5);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// Returns the clickable rects (screen space) of the ads.
export function drawAdPage(ctx, W, H, u, world, t, mouse) {
  const ads = world.ads;
  if (!ads) return [];
  const me = world.meState || {};
  const owned = new Set(me.perks || []);
  const left = me.picks != null ? me.picks : 0;
  const offers = ads.o;
  const k = clamp(t / 0.45, 0, 1);
  const ease = 1 - Math.pow(1 - k, 3);

  // the page
  const pw = Math.min(W - 40 * u, 1180 * u), ph = Math.min(H - 40 * u, 780 * u);
  const px = W / 2 - pw / 2, py = H / 2 - ph / 2 + (1 - ease) * H * 0.6;
  ctx.save();
  ctx.fillStyle = `rgba(20,12,6,${0.55 * ease})`;
  ctx.fillRect(0, 0, W, H);
  ctx.translate(px + pw / 2, py + ph / 2);
  ctx.rotate(-0.012 * (1 - ease) - 0.004);
  ctx.translate(-pw / 2, -ph / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(10 * u, 12 * u, pw, ph);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, pw, ph);
  ctx.fillStyle = halftone(ctx, 'rgba(150,120,60,0.18)', 7 * u, 1.3 * u);
  ctx.fillRect(0, 0, pw, ph);
  ctx.lineWidth = 5 * u;
  ctx.strokeStyle = INK;
  ctx.strokeRect(0, 0, pw, ph);

  // masthead
  ctx.fillStyle = RED;
  ctx.fillRect(14 * u, 14 * u, pw - 28 * u, 70 * u);
  ctx.lineWidth = 3 * u;
  ctx.strokeRect(14 * u, 14 * u, pw - 28 * u, 70 * u);
  comicTextCached(ctx, 'AMAZING OFFERS FOR HEROES!', pw / 2, 49 * u, 40 * u, { fill: '#fff36b', fill2: '#ffd23f', extrude: 4 * u, outline: 4 * u, seed: 3 });
  ctx.font = `${17 * u}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  const secs = Math.max(0, Math.ceil(world.phaseT || 0));
  const sub = left > 0
    ? `CLIP ${left} COUPON${left > 1 ? 'S' : ''}! CLICK AN AD (OR PRESS ITS NUMBER) · OFFER EXPIRES IN ${secs}s`
    : 'YOUR ORDER IS IN THE MAIL! WAITING FOR THE OTHER READERS...';
  ctx.fillText(sub, pw / 2, 102 * u);

  // the ads
  const n = offers.length;
  const cols = n <= 3 ? n : 3;
  const rows = Math.ceil(n / cols);
  const gx = 18 * u, gy = 16 * u;
  const top = 122 * u;
  const aw = (pw - 28 * u - gx * (cols - 1)) / cols;
  const ah = (ph - top - 18 * u - gy * (rows - 1)) / rows;
  const rects = [];
  offers.forEach((key, i) => {
    const P = PERKS[key];
    if (!P) return;
    const r = Math.floor(i / cols), c = i % cols;
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const rowOff = (cols - inRow) * (aw + gx) / 2;
    const x = 14 * u + rowOff + c * (aw + gx), y = top + r * (ah + gy);
    const col = AD_COLORS[(key.charCodeAt(0) + key.length) % AD_COLORS.length];
    const have = owned.has(key);
    const sx = px + x, sy = py + y;
    const hover = mouse && left > 0 && !have && mouse.x >= sx && mouse.x <= sx + aw && mouse.y >= sy && mouse.y <= sy + ah;
    rects.push({ key, x: sx, y: sy, w: aw, h: ah });
    ctx.save();
    ctx.translate(x, y);
    const R = rand(key.length * 31 + i);
    ctx.rotate((R() - 0.5) * 0.012);
    // dashed "clip here" coupon border
    ctx.fillStyle = hover ? '#fffbe6' : '#fbf3da';
    ctx.fillRect(0, 0, aw, ah);
    ctx.setLineDash([9 * u, 6 * u]);
    ctx.lineWidth = 2.5 * u;
    ctx.strokeStyle = INK;
    ctx.strokeRect(-4 * u, -4 * u, aw + 8 * u, ah + 8 * u);
    ctx.setLineDash([]);
    ctx.lineWidth = hover ? 5 * u : 3 * u;
    ctx.strokeStyle = hover ? col : INK;
    ctx.strokeRect(0, 0, aw, ah);
    // scissors
    ctx.font = `${16 * u}px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.fillText('✂', -2 * u, -6 * u);

    // headline band
    ctx.fillStyle = col;
    ctx.fillRect(8 * u, 8 * u, aw - 16 * u, 30 * u);
    ctx.fillStyle = '#ffffff';
    ctx.font = `${16 * u}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(P.tag, aw / 2, 23 * u);

    // number key
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(aw - 22 * u, 58 * u, 15 * u, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `${18 * u}px ${FONT}`;
    ctx.fillText(String(i + 1), aw - 22 * u, 59 * u);

    // title
    const tsz = Math.min(30 * u, aw / (P.title.length * 0.42));
    comicTextCached(ctx, P.title, aw / 2, 62 * u, Math.max(18 * u, tsz), { fill: '#ffffff', fill2: col, extrude: 3 * u, outline: 3.5 * u, seed: i + 5 });

    // illustration in a starburst
    const ir = Math.min(ah * 0.2, aw * 0.2);
    const icy = 82 * u + ir * 1.25;
    ctx.save();
    ctx.translate(aw / 2, icy);
    const sb = starburstPath(0, 0, ir * 1.05, ir * 1.35, 14, i * 7 + 1, 0.15);
    ctx.fillStyle = '#fff36b';
    ctx.fill(sb);
    ctx.lineWidth = 2.5 * u;
    ctx.strokeStyle = INK;
    ctx.stroke(sb);
    drawIcon(ctx, P.icon, ir, col);
    ctx.restore();

    // body copy
    ctx.font = `${15 * u}px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    const lines = wrap(ctx, P.body, aw - 30 * u);
    let ly = icy + ir * 1.5 + 12 * u;
    for (const l of lines.slice(0, 4)) { ctx.fillText(l, aw / 2, ly); ly += 19 * u; }

    // price tag
    ctx.save();
    ctx.translate(26 * u, ah - 26 * u);
    ctx.rotate(-0.2);
    const tag = starburstPath(0, 0, 18 * u, 24 * u, 10, i, 0.2);
    ctx.fillStyle = RED;
    ctx.fill(tag);
    ctx.lineWidth = 2 * u;
    ctx.stroke(tag);
    ctx.fillStyle = '#ffffff';
    ctx.font = `${12 * u}px ${FONT}`;
    ctx.fillText(P.price, 0, 1 * u);
    ctx.restore();
    ctx.font = `${13 * u}px ${FONT}`;
    ctx.fillStyle = shade(INK, 0.3);
    ctx.textAlign = 'right';
    ctx.fillText('SEND NO MONEY!', aw - 12 * u, ah - 14 * u);

    if (have) {
      // "ORDERED" rubber stamp
      ctx.save();
      ctx.translate(aw / 2, ah * 0.55);
      ctx.rotate(-0.25);
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = RED;
      ctx.lineWidth = 5 * u;
      ctx.strokeRect(-aw * 0.36, -24 * u, aw * 0.72, 48 * u);
      ctx.fillStyle = RED;
      ctx.font = `${32 * u}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('ORDERED!', 0, 2 * u);
      ctx.restore();
    } else if (left <= 0) {
      ctx.fillStyle = 'rgba(239,228,196,0.55)';
      ctx.fillRect(0, 0, aw, ah);
    }
    ctx.restore();
  });
  ctx.restore();
  return left > 0 ? rects : [];
}
