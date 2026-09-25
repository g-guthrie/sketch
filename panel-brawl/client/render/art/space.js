// SCI-FI backdrops: bridge, hangar, planet, reactor.

import {
  INK, TAU, shade, mix, rgba, halftoneGradient, cloudPath,
  P, rectP, circP, ellP, polyP, rrectP, lineP, fillP, strokeP, inked, dotsIn, hatchIn, clipped, gradIn, crescent,
  bandSky, dotFade, stars, glow, glowRect, beam, pipe, hazardStripes, rivetRow, letters, vignette, speckle,
  solid, arcLine, hillPath, mkR, hatchLines, ringGlow,
} from './kit.js';

// A big banded gas giant (optionally ringed) with halftone terminator.
export function gasGiant(ctx, R, cx, cy, r, o = {}) {
  const cols = o.bands || ['#e8a05a', '#d0704e', '#f0c07a', '#b85a4a', '#e8a05a'];
  const ringTilt = o.tilt != null ? o.tilt : -0.25;
  const ringRx = r * 1.9, ringRy = r * 0.42;
  const ring = (front) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ringTilt);
    const band = P();
    band.ellipse(0, 0, ringRx, ringRy, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
    band.ellipse(0, 0, ringRx * 0.72, ringRy * 0.72, 0, front ? Math.PI : TAU, front ? 0 : Math.PI, true);
    band.closePath();
    fillP(ctx, band, o.ring || '#e8dcb0');
    dotsIn(ctx, band, o.ringDots || '#b8a878', 5, 1.1);
    const inner = P();
    inner.ellipse(0, 0, ringRx * 0.86, ringRy * 0.86, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
    strokeP(ctx, inner, 3, o.ringGap || '#8a7a58');
    strokeP(ctx, band, o.lw || 2);
    ctx.restore();
  };
  if (o.rings) ring(false);
  const body = circP(cx, cy, r);
  fillP(ctx, body, cols[0]);
  clipped(ctx, body, () => {
    const n = cols.length;
    for (let i = 0; i < n * 2; i++) {
      const y0 = cy - r + (i / (n * 2)) * r * 2 + (R() - 0.5) * r * 0.06;
      const hh = r * 2 / (n * 2) * R.r(0.5, 1.1);
      const b = P();
      b.moveTo(cx - r, y0);
      b.bezierCurveTo(cx - r * 0.3, y0 - hh * 0.4, cx + r * 0.3, y0 + hh * 0.4, cx + r, y0);
      b.lineTo(cx + r, y0 + hh);
      b.bezierCurveTo(cx + r * 0.3, y0 + hh * 1.3, cx - r * 0.3, y0 + hh * 0.6, cx - r, y0 + hh);
      b.closePath();
      fillP(ctx, b, cols[i % n]);
    }
    if (o.spot) {
      const sx = cx + r * R.r(-0.3, 0.3), sy = cy + r * R.r(0.1, 0.35);
      inked(ctx, ellP(sx, sy, r * 0.18, r * 0.09), o.spot, 1.5);
    }
    // terminator
    const sh = P();
    sh.rect(cx - r * 2, cy - r * 2, r * 4, r * 4);
    circP(cx - r * 0.35, cy - r * 0.3, r * 1.05, sh);
    fillP(ctx, sh, rgba(o.night || '#1a1030', 0.35));
    ctx.save();
    ctx.fillStyle = o.night || '#1a1030';
    halftoneGradient(ctx, cx - r, cy - r, r * 2, r * 2, o.night || '#1a1030', { spacing: Math.max(5, r / 16), dir: 'radial', cx: cx - r * 0.4, cy: cy - r * 0.35, from: 0.55, to: 1.1, maxR: Math.max(5, r / 16) * 0.62 });
    ctx.restore();
  });
  strokeP(ctx, body, o.lw || 2.4);
  if (o.rings) ring(true);
}

function starfield(ctx, R, x, y, w, h, o = {}) {
  fillP(ctx, rectP(x, y, w, h), o.bg || '#0c0f2a');
  if (o.nebula) {
    const nx = x + R() * w, ny = y + R() * h;
    ctx.save();
    ctx.clip(rectP(x, y, w, h));
    halftoneGradient(ctx, x, y, w, h, o.nebula, { spacing: 7, dir: 'center', cx: nx, cy: ny, from: 0.25, to: 1.2, maxR: 3.2 });
    ctx.restore();
  }
  stars(ctx, R, x, y, w, h, Math.round(w * h / 1400), o.star || '#dfe6ff', { r: 0.8, twinkles: Math.round(w * h / 40000), big: 6 });
}

// ------------------------------------------------------------------ bridge

export function bridge(ctx, w, h, R) {
  const floorY = h - 40;
  const hull = '#7888a0', hullD = '#5d6c84', hullL = '#95a4ba';
  fillP(ctx, rectP(0, 0, w, h), hull);
  // ceiling
  const ceil = 52;
  fillP(ctx, rectP(-5, -5, w + 10, ceil + 5), '#46526a');
  const lights = P();
  for (let x = 40; x < w; x += 180) lights.rect(x, ceil - 16, 110, 8);
  inked(ctx, lights, '#e9fbff', 1.6);
  strokeP(ctx, lineP(-5, ceil, w + 5, ceil), 2);

  // the viewscreen
  const vx0 = Math.max(30, w * 0.07), vx1 = w - Math.max(30, w * 0.07);
  const vy0 = ceil + 34, vy1 = Math.min(h * 0.6, floorY - 190);
  const ch = 46;
  const vpts = [[vx0 + ch, vy0], [vx1 - ch, vy0], [vx1, vy0 + ch], [vx1, vy1 - ch], [vx1 - ch, vy1], [vx0 + ch, vy1], [vx0, vy1 - ch], [vx0, vy0 + ch]];
  const vs = polyP(vpts);
  const vw = vx1 - vx0, vh = vy1 - vy0;
  // frame (outer)
  const outer = polyP(vpts.map(([x, y]) => [x + Math.sign(x - (vx0 + vx1) / 2) * 20, y + Math.sign(y - (vy0 + vy1) / 2) * 20]));
  solid(ctx, outer, '#4f5b73', { lw: 2.5, lx: 0, ly: -6 });
  clipped(ctx, vs, () => {
    starfield(ctx, R, vx0, vy0, vw, vh, { bg: '#0b0e28', nebula: '#4a2468' });
    // hyperspace streaks
    if (R.chance(0.35)) {
      const cx = vx0 + vw / 2, cy = vy0 + vh / 2;
      const sl = P();
      for (let i = 0; i < 70; i++) {
        const a = R() * TAU, r0 = R.r(20, 120), r1 = r0 + R.r(40, 200);
        sl.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.6);
        sl.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.6);
      }
      strokeP(ctx, sl, 1.4, '#b8e8ff');
    } else {
      const pr = Math.max(90, Math.min(vh * 0.95, vw * 0.3));
      const px = vx0 + vw * R.r(0.2, 0.8), py = vy1 + pr * R.r(0.05, 0.5);
      glow(ctx, px, py, pr * 1.35, '#3a6aa8', { from: 0.55, spacing: 6 });
      gasGiant(ctx, R, px, py, pr, { rings: R.chance(0.5), tilt: R.r(-0.35, 0.35), bands: R.pick([
        ['#e8a05a', '#d0704e', '#f0c07a', '#b85a4a'],
        ['#6ac8c8', '#3f8fa8', '#9fe0d0', '#2f6a8a'],
        ['#d88ac0', '#a05090', '#f0b8d8', '#7a3a7a'],
      ]), spot: '#b8453a' });
      // small moon
      const mx = px + (px > vx0 + vw / 2 ? -1 : 1) * pr * R.r(1.3, 1.8), my = vy0 + vh * R.r(0.2, 0.4);
      const m = circP(mx, my, pr * 0.14);
      solid(ctx, m, '#b8b4c8', { lw: 2, lx: -4, ly: -3 });
    }
    // glass glare
    const gl = P();
    polyP([[vx0 + vw * 0.1, vy1], [vx0 + vw * 0.16, vy1], [vx0 + vw * 0.36, vy0], [vx0 + vw * 0.3, vy0]], true, gl);
    polyP([[vx0 + vw * 0.18, vy1], [vx0 + vw * 0.2, vy1], [vx0 + vw * 0.4, vy0], [vx0 + vw * 0.38, vy0]], true, gl);
    fillP(ctx, gl, 'rgba(200,240,255,0.1)');
  });
  // struts dividing the screen
  const ns = vw > 700 ? 2 : 1;
  for (let i = 1; i <= ns; i++) {
    const sx = vx0 + (vw * i) / (ns + 1);
    const st = rectP(sx - 8, vy0 - 4, 16, vh + 8);
    solid(ctx, st, '#4f5b73', { lw: 2, lx: -4, ly: 0 });
  }
  strokeP(ctx, vs, 3);
  rivetRow(ctx, vx0 + ch, vy0 - 11, vx1 - ch, vy0 - 11, 26, 2.2, '#8b97ad', 1);
  rivetRow(ctx, vx0 + ch, vy1 + 11, vx1 - ch, vy1 + 11, 26, 2.2, '#8b97ad', 1);

  // wall panels below the screen
  const wallTop = vy1 + 30;
  const pan = P();
  for (let x = -40; x < w; x += 120) pan.rect(x, wallTop, 120, floorY - wallTop);
  strokeP(ctx, pan, 1.2, hullD);
  fillP(ctx, rectP(-5, wallTop + 14, w + 10, 8), '#ff5fae');
  strokeP(ctx, rectP(-5, wallTop + 14, w + 10, 8), 1.4);
  dotFade(ctx, 0, w, floorY, wallTop + 40, hullD, 8);
  // side bulkhead ribs
  for (const sx of [vx0 - 20, vx1 + 20]) {
    const rb = rectP(sx - 14, ceil, 28, floorY - ceil);
    solid(ctx, rb, hullL, { lw: 2, lx: -4, ly: 0 });
  }

  // console bank (low, behind the fight)
  const cTop = floorY - 84;
  let x = Math.max(24, w * 0.05);
  while (x < w - 120) {
    const cw = R.r(150, 240);
    if (x + cw > w - 30) break;
    const desk = polyP([[x, floorY], [x, cTop + 30], [x + 16, cTop], [x + cw - 16, cTop], [x + cw, cTop + 30], [x + cw, floorY]]);
    solid(ctx, desk, '#5a6780', { lw: 2.2, lx: 0, ly: -5 });
    const face = polyP([[x + 18, cTop + 4], [x + cw - 18, cTop + 4], [x + cw - 8, cTop + 28], [x + 8, cTop + 28]]);
    inked(ctx, face, '#2b3448', 1.6);
    const btn = P(), btn2 = P(), btn3 = P();
    for (let bx = x + 20; bx < x + cw - 20; bx += 13) {
      const r = R();
      const tgt = r < 0.3 ? btn : r < 0.5 ? btn2 : r < 0.65 ? btn3 : null;
      if (tgt) tgt.rect(bx, cTop + 10 + (R() < 0.5 ? 0 : 9), 8, 5);
    }
    fillP(ctx, btn, '#5fe0ec'); fillP(ctx, btn2, '#ff5fae'); fillP(ctx, btn3, '#ffe14a');
    // little screen
    const sc = rrectP(x + cw / 2 - 30, cTop + 38, 60, 28, 4);
    inked(ctx, sc, '#1c3a48', 1.6);
    const wave = P();
    wave.moveTo(x + cw / 2 - 26, cTop + 52);
    for (let k = 0; k <= 10; k++) wave.lineTo(x + cw / 2 - 26 + k * 5.2, cTop + 52 + Math.sin(k * 1.3 + R() * 2) * 8);
    strokeP(ctx, wave, 1.4, '#5fe0ec');
    x += cw + R.r(30, 90);
  }
  // floor
  const fl = rectP(-5, floorY, w + 10, h - floorY + 5);
  fillP(ctx, fl, '#4a5670');
  strokeP(ctx, lineP(-5, floorY, w + 5, floorY), 2);
  fillP(ctx, rectP(-5, floorY + 6, w + 10, 4), '#7fe6f0');
  vignette(ctx, w, h, '#2b3348', { spacing: 10 });
}

// ------------------------------------------------------------------ hangar

function rocketShip(ctx, R, cx, base, s, o = {}) {
  const body = o.body || '#d9d2c2', trim = o.trim || '#c9544d';
  const bw = s * 0.34, bh = s;
  // fins
  const fin = P();
  polyP([[cx - bw * 0.45, base - bh * 0.34], [cx - bw * 1.05, base - bh * 0.06], [cx - bw * 1.0, base], [cx - bw * 0.48, base - bh * 0.1]], true, fin);
  polyP([[cx + bw * 0.45, base - bh * 0.34], [cx + bw * 1.05, base - bh * 0.06], [cx + bw * 1.0, base], [cx + bw * 0.48, base - bh * 0.1]], true, fin);
  solid(ctx, fin, trim, { lw: 2.2, lx: -4, ly: -3 });
  const b = P();
  b.moveTo(cx - bw * 0.5, base - bh * 0.08);
  b.bezierCurveTo(cx - bw * 0.62, base - bh * 0.5, cx - bw * 0.45, base - bh * 0.8, cx, base - bh);
  b.bezierCurveTo(cx + bw * 0.45, base - bh * 0.8, cx + bw * 0.62, base - bh * 0.5, cx + bw * 0.5, base - bh * 0.08);
  b.closePath();
  solid(ctx, b, body, { lw: 2.6, lx: -7, ly: 0, dots: shade(body, -0.4) });
  clipped(ctx, b, () => {
    fillP(ctx, rectP(cx - bw, base - bh * 0.66, bw * 2, bh * 0.05), trim);
    fillP(ctx, rectP(cx - bw, base - bh * 0.2, bw * 2, bh * 0.05), trim);
    const nose = P();
    nose.rect(cx - bw, base - bh * 1.05, bw * 2, bh * 0.2);
    fillP(ctx, nose, trim);
    crescent(ctx, b, -7, 0, rgba(INK, 0.001));
  });
  strokeP(ctx, b, 2.6);
  const port = circP(cx, base - bh * 0.5, bw * 0.2);
  inked(ctx, circP(cx, base - bh * 0.5, bw * 0.27), '#9aa3ad', 2);
  inked(ctx, port, '#3a8fb0', 2);
  fillP(ctx, ellP(cx - bw * 0.07, base - bh * 0.53, bw * 0.07, bw * 0.04, -0.6), '#dff6ff');
  const nz = polyP([[cx - bw * 0.3, base - bh * 0.08], [cx + bw * 0.3, base - bh * 0.08], [cx + bw * 0.4, base], [cx - bw * 0.4, base]]);
  inked(ctx, nz, '#6a6f7a', 2);
}

export function hangar(ctx, w, h, R) {
  const floorY = h - 42;
  const steel = '#6b7686';
  fillP(ctx, rectP(0, 0, w, h), steel);
  // bay door opening
  const bx0 = w * R.r(0.14, 0.26), bx1 = w - w * R.r(0.14, 0.26);
  const by0 = h * 0.12, by1 = floorY - 70;
  const bay = rectP(bx0, by0, bx1 - bx0, by1 - by0);
  clipped(ctx, bay, () => {
    starfield(ctx, R, bx0, by0, bx1 - bx0, by1 - by0, { bg: '#0b0f2a', nebula: '#233f78' });
    // planet limb
    const pr = (bx1 - bx0) * 1.1;
    const pcx = (bx0 + bx1) / 2 + R.r(-100, 100), pcy = by1 + pr * 0.8;
    ctx.save();
    ctx.globalAlpha = 0.5;
    strokeP(ctx, circP(pcx, pcy, pr + 16), 28, '#4a8fd0');
    ctx.restore();
    strokeP(ctx, circP(pcx, pcy, pr + 8), 12, '#6fb0e8');
    const pl = circP(pcx, pcy, pr);
    fillP(ctx, pl, '#3a78b8');
    clipped(ctx, pl, () => {
      for (let i = 0; i < 7; i++) inked(ctx, cloudPath(pcx + R.r(-pr * 0.6, pr * 0.6), pcy - pr + R.r(10, 90), R.r(50, 120), R.r(10, 22), 7, (R() * 1e6) | 0), '#e8f2ff', 0);
      halftoneGradient(ctx, pcx - pr, pcy - pr, pr * 2, pr * 0.6, '#1f4a80', { spacing: 7, dir: 'down', from: 0.2, maxR: 4 });
    });
    strokeP(ctx, pl, 2.4);
    // distant ship
    const sx = bx0 + (bx1 - bx0) * R.r(0.2, 0.8), sy = by0 + (by1 - by0) * R.r(0.2, 0.45);
    const ship = P();
    polyP([[sx - 40, sy], [sx + 30, sy - 8], [sx + 44, sy], [sx + 30, sy + 8]], true, ship);
    polyP([[sx - 10, sy - 4], [sx - 30, sy - 22], [sx - 22, sy - 4]], true, ship);
    polyP([[sx - 10, sy + 4], [sx - 30, sy + 22], [sx - 22, sy + 4]], true, ship);
    inked(ctx, ship, '#c9d2dc', 1.4);
    inked(ctx, circP(sx - 44, sy, 5), '#ffb04a', 1.2);
  });
  strokeP(ctx, bay, 2.5);
  // sliding doors (partly open) with hazard edges
  const open = R.r(0.45, 0.7);
  const halfW = (bx1 - bx0) / 2 * (1 - open);
  for (const side of [-1, 1]) {
    const dx = side < 0 ? bx0 : bx1 - halfW;
    const door = rectP(dx, by0, halfW, by1 - by0);
    solid(ctx, door, '#8a93a2', { lw: 2.5, lx: side * 4, ly: 0 });
    const ribs = P();
    for (let y = by0 + 40; y < by1; y += 60) ribs.rect(dx + 6, y, halfW - 12, 8);
    inked(ctx, ribs, '#727c8c', 1.4);
    const edge = rectP(side < 0 ? dx + halfW - 20 : dx, by0, 20, by1 - by0);
    hazardStripes(ctx, edge, side < 0 ? dx + halfW - 20 : dx, by0, 20, by1 - by0, '#e8c040', '#1d1f26', 10);
    strokeP(ctx, edge, 2);
  }
  // door frame
  const fr = P();
  fr.rect(bx0 - 30, by0 - 30, bx1 - bx0 + 60, 30);
  fr.rect(bx0 - 30, by0, 30, by1 - by0);
  fr.rect(bx1, by0, 30, by1 - by0);
  solid(ctx, fr, '#555f6f', { lw: 2.4, lx: 0, ly: -5 });
  hazardStripes(ctx, rectP(bx0 - 30, by1, bx1 - bx0 + 60, 18), bx0 - 30, by1, bx1 - bx0 + 60, 18, '#e8c040', '#1d1f26', 14);
  strokeP(ctx, rectP(bx0 - 30, by1, bx1 - bx0 + 60, 18), 2);
  rivetRow(ctx, bx0 - 20, by0 - 15, bx1 + 20, by0 - 15, 30, 2.4, '#8b95a5', 1);

  // wall ribs outside the bay
  const rib = P();
  for (let x = 30; x < bx0 - 40; x += 110) rib.rect(x, 0, 22, floorY);
  for (let x = bx1 + 60; x < w; x += 110) rib.rect(x, 0, 22, floorY);
  fillP(ctx, rib, '#7c8797');
  strokeP(ctx, rib, 1.6, '#4a5362');

  // fuel pipes along the walls
  const py = h * R.r(0.25, 0.4);
  pipe(ctx, [[-20, py], [bx0 - 50, py], [bx0 - 50, floorY - 40]], 10, '#c9794a', { flanges: 110 });
  pipe(ctx, [[w + 20, py + 40], [bx1 + 50, py + 40], [bx1 + 50, floorY - 40]], 8, '#6fa36a', { flanges: 100 });
  pipe(ctx, [[-20, py + 60], [bx0 - 90, py + 60], [bx0 - 90, floorY - 40]], 6, '#b8b0a0', { flanges: 90 });

  // gantry crane girder across the top
  const gy = Math.max(20, by0 - 70);
  const gird = rectP(-5, gy, w + 10, 26);
  solid(ctx, gird, '#b8563e', { lw: 2.4, lx: 0, ly: -4 });
  const tr = P();
  for (let x = 0; x < w; x += 26) { tr.moveTo(x, gy + 4); tr.lineTo(x + 13, gy + 22); tr.lineTo(x + 26, gy + 4); }
  strokeP(ctx, tr, 1.6, '#7a2e22');
  const hx = R.r(0.2, 0.8) * w;
  inked(ctx, rrectP(hx - 26, gy + 20, 52, 26, 4), '#e8c040', 2);
  const cable = lineP(hx, gy + 46, hx, gy + R.r(160, 260));
  strokeP(ctx, cable, 2.4);
  const hk = P();
  hk.moveTo(hx, gy + 200); hk.arc(hx + 8, gy + 214, 10, Math.PI, Math.PI * 0.2, true);
  ctx.save(); ctx.translate(0, cable.__dy || 0); ctx.restore();

  // parked rocket in the bay
  const rs = Math.min(h * 0.55, 380);
  const rx = R.chance(0.5) ? bx0 + (bx1 - bx0) * 0.3 : bx0 + (bx1 - bx0) * 0.7;
  fillP(ctx, ellP(rx, floorY - 60, rs * 0.5, 14), 'rgba(0,0,0,0.25)');
  rocketShip(ctx, R, rx, floorY - 62, rs, { body: '#d9d2c2', trim: R.pick(['#c9544d', '#3f73b8', '#d99a3a']) });
  // launch gantry tower next to rocket
  const tx = rx + (rx > w / 2 ? -1 : 1) * rs * 0.45;
  const tower = P();
  tower.rect(tx - 16, floorY - 62 - rs * 0.85, 4, rs * 0.85);
  tower.rect(tx + 12, floorY - 62 - rs * 0.85, 4, rs * 0.85);
  for (let y = floorY - 62; y > floorY - 62 - rs * 0.85; y -= 26) { tower.moveTo(tx - 14, y); tower.lineTo(tx + 14, y - 26); tower.moveTo(tx - 14, y); tower.lineTo(tx + 14, y); }
  strokeP(ctx, tower, 2.4, '#2a2e36');

  // raised deck the rocket stands on
  const deck = rectP(-5, floorY - 62, w + 10, 22);
  inked(ctx, deck, '#596373', 2);
  fillP(ctx, rectP(-5, floorY - 40, w + 10, 40), '#4e5767');
  strokeP(ctx, lineP(-5, floorY - 40, w + 5, floorY - 40), 1.6);
  const chev = P();
  for (let x = 20; x < w; x += 80) polyP([[x, floorY - 36], [x + 20, floorY - 20], [x, floorY - 4], [x + 12, floorY - 4], [x + 32, floorY - 20], [x + 12, floorY - 36]], true, chev);
  fillP(ctx, chev, '#b8a04a');
  // floor
  const fl = rectP(-5, floorY, w + 10, h - floorY + 5);
  fillP(ctx, fl, '#5b6576');
  strokeP(ctx, lineP(-5, floorY, w + 5, floorY), 2);
  clipped(ctx, fl, () => {
    const g = P();
    for (let x = 0; x < w; x += 12) { g.moveTo(x, floorY); g.lineTo(x, h); }
    strokeP(ctx, g, 1, '#4d5666');
  });
  vignette(ctx, w, h, '#353c48', { spacing: 10 });
}

// ------------------------------------------------------------------ planet

function crystalCluster(ctx, R, x, base, s, col, o = {}) {
  const n = R.i(3, 6);
  const shards = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.32 + R.r(-0.12, 0.12);
    const len = s * R.r(0.45, 1) * (1 - Math.abs(i - (n - 1) / 2) * 0.12);
    const wid = s * R.r(0.1, 0.16);
    shards.push({ a, len, wid, ox: x + (i - (n - 1) / 2) * wid * 0.9 });
  }
  shards.sort((p, q) => q.len - p.len);
  if (o.glow) glow(ctx, x, base - s * 0.4, s * 1.1, o.glow, { from: 0.2, spacing: 6 });
  for (const sh of shards) {
    const ca = Math.cos(sh.a), sa = Math.sin(sh.a), nx = -sa, ny = ca;
    const bx = sh.ox, by = base + 4;
    const tipx = bx + ca * sh.len, tipy = by + sa * sh.len;
    const p = polyP([
      [bx + nx * sh.wid, by + ny * sh.wid],
      [bx + nx * sh.wid + ca * sh.len * 0.8, by + ny * sh.wid + sa * sh.len * 0.8],
      [tipx, tipy],
      [bx - nx * sh.wid + ca * sh.len * 0.8, by - ny * sh.wid + sa * sh.len * 0.8],
      [bx - nx * sh.wid, by - ny * sh.wid],
    ]);
    fillP(ctx, p, col);
    const half = polyP([[bx, by], [tipx, tipy], [bx - nx * sh.wid + ca * sh.len * 0.8, by - ny * sh.wid + sa * sh.len * 0.8], [bx - nx * sh.wid, by - ny * sh.wid]]);
    fillP(ctx, half, shade(col, -0.25));
    dotsIn(ctx, half, shade(col, -0.45), 4, 0.9);
    fillP(ctx, polyP([[bx + nx * sh.wid * 0.5, by], [bx + nx * sh.wid * 0.5 + ca * sh.len * 0.7, by + ny * sh.wid * 0.5 + sa * sh.len * 0.7], [bx + nx * sh.wid * 0.2 + ca * sh.len * 0.72, by + sa * sh.len * 0.72], [bx + nx * sh.wid * 0.2, by]]), shade(col, 0.5));
    strokeP(ctx, lineP(bx, by, tipx, tipy), 1.2, shade(col, -0.5));
    strokeP(ctx, p, o.lw || 2);
  }
}

export function planet(ctx, w, h, R) {
  const groundY = h - 44;
  const pal = R.pick([
    { a: '#1f1446', b: '#5a2e78', c: '#b24f7e', d: '#f09a62', rock1: '#6a3a70', rock2: '#472556', ground: '#7a4658', crys: '#5fe0ec' },
    { a: '#0f2440', b: '#1f5a6e', c: '#3f9a8a', d: '#d8d08a', rock1: '#2f5a5e', rock2: '#1e3c48', ground: '#4a6a5a', crys: '#ff6fb8' },
  ]);
  bandSky(ctx, 0, w, [
    { c: pal.a, y: 0 },
    { c: pal.b, y: h * 0.22 },
    { c: pal.c, y: h * 0.44 },
    { c: pal.d, y: h * 0.62, blend: 80 },
  ], 110, 10);
  stars(ctx, R, 0, 0, w, h * 0.3, Math.round(w * h / 9000), '#f0e8ff', { r: 0.9, pow: 1.3 });

  // twin suns
  const s1x = R.r(0.1, 0.9) * w, s1y = h * R.r(0.36, 0.48);
  const s1r = Math.max(34, Math.min(70, w * 0.045));
  glow(ctx, s1x, s1y, s1r * 3.2, '#ffe9a8', { from: 0.25, spacing: 9 });
  inked(ctx, circP(s1x, s1y, s1r), '#fff7d8', 2);
  const s2x = s1x + (s1x > w / 2 ? -1 : 1) * R.r(90, 160), s2y = s1y - R.r(40, 90), s2r = s1r * 0.45;
  glow(ctx, s2x, s2y, s2r * 3, '#ffb0c8', { from: 0.25, spacing: 7 });
  inked(ctx, circP(s2x, s2y, s2r), '#ffe0ea', 2);

  // ringed planet
  const pr = Math.max(80, Math.min(230, Math.min(w, h) * R.r(0.2, 0.28)));
  const px = s1x > w / 2 ? R.r(0.15, 0.4) * w : R.r(0.6, 0.85) * w, py = h * R.r(0.16, 0.26);
  gasGiant(ctx, R, px, py, pr, { rings: true, tilt: R.r(-0.45, -0.15) * R.sign(), bands: pal.crys === '#5fe0ec' ? ['#8ad0c8', '#5a9ab0', '#c0ecd8', '#4a7a98'] : ['#e8b870', '#c07850', '#f0d8a0', '#a0604a'], night: pal.a, ring: '#efe0c0' });

  // far mesas
  const far = P();
  far.moveTo(-10, groundY);
  let x = -10;
  while (x < w + 10) {
    const mw = R.r(80, 220), mh = R.r(h * 0.08, h * 0.26);
    const base = h * 0.62 + R.r(-10, 20);
    far.lineTo(x + mw * 0.12, base - mh);
    far.lineTo(x + mw * 0.88, base - mh + R.r(-8, 8));
    far.lineTo(x + mw, base + R.r(-4, 20));
    x += mw;
  }
  far.lineTo(w + 10, groundY);
  far.closePath();
  fillP(ctx, far, pal.rock1);
  strokeP(ctx, far, 1.6, shade(pal.rock1, -0.4));
  dotFade(ctx, 0, w, groundY, h * 0.5, shade(pal.rock1, -0.2), 8);

  // near rock spires + an arch
  const near = P();
  const nsp = Math.max(2, Math.round(w / 330));
  for (let i = 0; i < nsp; i++) {
    const sx = ((i + R.r(0.2, 0.8)) / nsp) * w, sw = R.r(40, 80), sh = R.r(h * 0.22, h * 0.42);
    near.moveTo(sx - sw, groundY - 30);
    near.bezierCurveTo(sx - sw * 0.6, groundY - sh * 0.5, sx - sw * 0.5, groundY - sh * 0.8, sx - sw * 0.3, groundY - sh);
    near.lineTo(sx + sw * 0.35, groundY - sh - R.r(-10, 16));
    near.bezierCurveTo(sx + sw * 0.5, groundY - sh * 0.8, sx + sw * 0.7, groundY - sh * 0.4, sx + sw, groundY - 30);
    near.closePath();
  }
  if (R.chance(0.7)) {
    const ax = R.r(0.2, 0.8) * w, aw = R.r(140, 220), ah = R.r(120, 190);
    near.moveTo(ax - aw / 2 - 20, groundY - 30);
    near.lineTo(ax - aw / 2 - 10, groundY - ah);
    near.quadraticCurveTo(ax, groundY - ah - 60, ax + aw / 2 + 10, groundY - ah);
    near.lineTo(ax + aw / 2 + 20, groundY - 30);
    near.lineTo(ax + aw / 2 - 10, groundY - 30);
    near.quadraticCurveTo(ax + aw / 2 - 10, groundY - ah + 10, ax, groundY - ah + 6);
    near.quadraticCurveTo(ax - aw / 2 + 10, groundY - ah + 10, ax - aw / 2 + 10, groundY - 30);
    near.closePath();
  }
  fillP(ctx, near, pal.rock2);
  crescent(ctx, near, 5, 0, shade(pal.rock2, 0.18));
  clipped(ctx, near, () => hatchLines(ctx, null, 0, 0, w, groundY, { spacing: 7, angle: 1.35, color: shade(pal.rock2, -0.35), lw: 1.1, R }));
  strokeP(ctx, near, 2.2);

  // crystals & alien flora on the mid ground
  const mound = hillPath([[-10, groundY - 36], [w * 0.3, groundY - 50], [w * 0.6, groundY - 30], [w + 10, groundY - 46]], groundY + 10);
  fillP(ctx, mound, shade(pal.ground, -0.12));
  strokeP(ctx, mound, 2);
  const nc = Math.max(2, Math.round(w / 300));
  for (let i = 0; i < nc; i++) {
    const cx = ((i + R.r(0.1, 0.9)) / nc) * w;
    crystalCluster(ctx, R, cx, groundY - 36, R.r(40, 80), pal.crys, { glow: pal.crys, lw: 1.8 });
  }
  for (let i = 0; i < nc; i++) {
    const fx = R() * w;
    const stalk = P();
    const fh = R.r(40, 90);
    stalk.moveTo(fx, groundY - 36); stalk.quadraticCurveTo(fx + R.r(-20, 20), groundY - 36 - fh * 0.6, fx + R.r(-10, 10), groundY - 36 - fh);
    ctx.save(); ctx.lineCap = 'round';
    strokeP(ctx, stalk, 7, INK); strokeP(ctx, stalk, 4, '#9ad05a');
    ctx.restore();
    const bulb = circP(fx + R.r(-10, 10), groundY - 36 - fh, R.r(8, 14));
    solid(ctx, bulb, '#ff8ac0', { lw: 1.8, lx: -3, ly: -3 });
  }

  // ground
  const g = rectP(-5, groundY, w + 10, h - groundY + 5);
  fillP(ctx, g, pal.ground);
  strokeP(ctx, lineP(-5, groundY, w + 5, groundY), 2);
  dotFade(ctx, 0, w, groundY, groundY + 24, shade(pal.ground, -0.2), 6);
}

// ------------------------------------------------------------------ reactor

export function reactor(ctx, w, h, R) {
  const floorY = h - 40;
  const bg = '#141c28';
  fillP(ctx, rectP(0, 0, w, h), bg);
  const cx = R.r(0.38, 0.62) * w;
  const cw = Math.min(200, Math.max(120, w * 0.15));
  const gy = h * 0.45;
  const big = Math.max(w, h);
  // posterized glow bands behind the core (one screen, no moire)
  ringGlow(ctx, cx, gy, [
    { r: big * 0.75, c: '#18293a' },
    { r: big * 0.5, c: '#1d3a50' },
    { r: big * 0.32, c: '#245672' },
    { r: big * 0.2, c: '#2e7690' },
  ], { spacing: 9, fade: 0.55 });
  // containment wall: radial ribs + ring lines
  const rib = P();
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU;
    rib.moveTo(cx + Math.cos(a) * cw * 0.9, gy + Math.sin(a) * cw * 0.9);
    rib.lineTo(cx + Math.cos(a) * big, gy + Math.sin(a) * big);
  }
  for (let r = cw * 1.2; r < big; r += 90) circP(cx, gy, r, rib);
  strokeP(ctx, rib, 1.6, 'rgba(8,14,22,0.55)');

  // background catwalk silhouettes
  const cwY = [h * R.r(0.2, 0.28), h * R.r(0.5, 0.56)];
  for (const y of cwY) {
    const walk = P();
    walk.rect(-10, y, w + 20, 10);
    walk.rect(-10, y - 34, w + 20, 4);
    walk.rect(-10, y - 18, w + 20, 3);
    for (let x = 0; x < w; x += 36) walk.rect(x, y - 34, 3, 34);
    const truss = P();
    for (let x = 0; x < w; x += 40) { truss.moveTo(x, y + 10); truss.lineTo(x + 20, y + 26); truss.lineTo(x + 40, y + 10); }
    truss.moveTo(-10, y + 26); truss.lineTo(w + 10, y + 26);
    fillP(ctx, walk, '#0a1018');
    strokeP(ctx, truss, 2.4, '#0a1018');
    // cyan rim light from the core on the rail tops
    fillP(ctx, rectP(-10, y - 34, w + 20, 1.5), '#3f9ab0');
  }
  // pillars
  for (let x = R.r(40, 120); x < w; x += R.r(220, 320)) {
    if (Math.abs(x - cx) < cw) continue;
    fillP(ctx, rectP(x - 16, 0, 32, floorY), '#0c131b');
    fillP(ctx, rectP(x - 16 + (x < cx ? 26 : 0), 0, 5, floorY), '#3f9ab0');
  }

  // the core
  const top = -10, bot = floorY - 70;
  const core = rectP(cx - cw / 2, top, cw, bot - top);
  fillP(ctx, core, '#5fd8ea');
  clipped(ctx, core, () => {
    fillP(ctx, rectP(cx - cw * 0.34, top, cw * 0.68, bot - top), '#aef6ff');
    fillP(ctx, rectP(cx - cw * 0.16, top, cw * 0.32, bot - top), '#ffffff');
    halftoneGradient(ctx, cx - cw / 2, top, cw, bot - top, '#2fa8c0', { spacing: 6, dir: 'right', from: 0.62, maxR: 3.6 });
    ctx.save(); ctx.translate(cx * 2, 0); ctx.scale(-1, 1);
    halftoneGradient(ctx, cx - cw / 2, top, cw, bot - top, '#2fa8c0', { spacing: 6, dir: 'right', from: 0.62, maxR: 3.6 });
    ctx.restore();
    for (let i = 0; i < 5; i++) {
      const y0 = top + R() * (bot - top);
      const a = arcLine(R, cx - cw / 2, y0, cx + cw / 2, y0 + R.r(-60, 60), 7, 0.25);
      strokeP(ctx, a, 4, '#5fd8ea');
      strokeP(ctx, a, 1.8, '#ffffff');
    }
  });
  strokeP(ctx, core, 2.6);
  for (let y = top + 50; y < bot - 20; y += R.r(80, 110)) {
    const ring = rrectP(cx - cw / 2 - 22, y, cw + 44, 26, 6);
    solid(ctx, ring, '#5b6a7c', { lw: 2.4, lx: 0, ly: -5 });
    rivetRow(ctx, cx - cw / 2 - 12, y + 13, cx + cw / 2 + 12, y + 13, 22, 2.2, '#9aa9b8', 1);
    if (R() < 0.55) {
      const side = R.sign();
      const a = arcLine(R, cx + side * (cw / 2 + 22), y + 13, cx + side * (cw / 2 + R.r(90, 180)), y + R.r(-70, 70), 6, 0.3);
      strokeP(ctx, a, 6, INK);
      strokeP(ctx, a, 3, '#9ff4ff');
      strokeP(ctx, a, 1.2, '#ffffff');
    }
  }
  const base = polyP([[cx - cw / 2 - 60, floorY], [cx - cw / 2 - 30, bot], [cx + cw / 2 + 30, bot], [cx + cw / 2 + 60, floorY]]);
  solid(ctx, base, '#465466', { lw: 2.6, lx: 0, ly: -6 });
  hazardStripes(ctx, rectP(cx - cw / 2 - 36, bot + 12, cw + 72, 16), cx - cw / 2 - 36, bot + 12, cw + 72, 16, '#e8c040', '#141a22', 12);
  strokeP(ctx, rectP(cx - cw / 2 - 36, bot + 12, cw + 72, 16), 1.8);

  pipe(ctx, [[-20, h * 0.66], [cx - cw / 2 - 80, h * 0.66], [cx - cw / 2 - 40, bot + 6]], 14, '#56657a', { flanges: 130, lw: 2.2 });
  pipe(ctx, [[w + 20, h * 0.7], [cx + cw / 2 + 80, h * 0.7], [cx + cw / 2 + 40, bot + 6]], 12, '#8a5a7a', { flanges: 120, lw: 2.2 });

  for (const sx of [cx - cw / 2 - 150, cx + cw / 2 + 110]) {
    if (sx < 20 || sx > w - 60) continue;
    const tri = polyP([[sx + 20, h * 0.36], [sx + 44, h * 0.36 + 40], [sx - 4, h * 0.36 + 40]]);
    inked(ctx, tri, '#e8c040', 2);
    letters(ctx, '!', sx + 20, h * 0.36 + 26, 24, INK);
  }
  letters(ctx, 'CORE ' + R.pick(['ALPHA', 'OMEGA', '7', 'X-9']), cx, bot + 44, 22, '#9fe8f0', { outline: 4 });

  const fl = rectP(-5, floorY, w + 10, h - floorY + 5);
  fillP(ctx, fl, '#2c3846');
  clipped(ctx, fl, () => {
    const g = P();
    for (let x = 0; x < w; x += 14) { g.moveTo(x, floorY); g.lineTo(x, h); }
    strokeP(ctx, g, 1.2, '#1c2530');
    fillP(ctx, ellP(cx, floorY + 10, cw * 1.4, 16), 'rgba(127,232,244,0.25)');
  });
  strokeP(ctx, lineP(-5, floorY, w + 5, floorY), 2);
}
