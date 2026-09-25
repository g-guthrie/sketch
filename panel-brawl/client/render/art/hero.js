// SUPERHERO backdrops: rooftop, street, lab, lair.

import {
  INK, TAU, shade, mix, rgba, halftoneGradient, cloudPath, starburstPath,
  P, rectP, circP, ellP, polyP, rrectP, lineP, fillP, strokeP, inked, dotsIn, hatchIn, clipped, gradIn, crescent,
  bandSky, dotSky, dotFade, stars, moon, glow, glowRect, beam, cloudBank, skyline, windows, waterTowerPath, brickPatches,
  bricksFull, pipe, hazardStripes, rivetRow, dial, neon, letters, boltPath, arcLine, vignette, speckle, hatchLines, mkR, solid, spans, rain,
} from './kit.js';

// ------------------------------------------------------------------ rooftop

export function rooftop(ctx, w, h, R) {
  const roofY = h - 62;
  const parTop = roofY - 34;
  const dusk = R.chance(0.5);
  const skyA = '#19204f', skyB = '#2c3a80', skyC = dusk ? '#6c4f95' : '#3f4e98', skyD = dusk ? '#d88a78' : '#6d7fbf';
  bandSky(ctx, 0, w, [
    { c: skyA, y: 0 },
    { c: skyB, y: h * 0.26 },
    { c: skyC, y: h * 0.46 },
    { c: skyD, y: h * 0.62, blend: 70 },
  ], 110, 10);
  stars(ctx, R, 0, 0, w, h * 0.4, Math.round(w * h / 9000), '#c9d0f2', { r: 0.9, pow: 1.4, big: 5 });

  // moon + halo
  const mr = Math.max(46, Math.min(115, Math.min(w, h) * R.r(0.085, 0.12)));
  const mx = R.r(0.14, 0.86) * w, my = R.r(0.12, 0.24) * h + mr * 0.2;
  moon(ctx, R, mx, my, mr, { color: '#f5e7ae', halo: [mix(skyA, '#f5e7ae', 0.1), mix(skyA, '#f5e7ae', 0.18)], haloStep: 0.28, lw: 2.2 });

  // hero signal: a searchlight splashing an emblem on the clouds
  const sigX = Math.max(w * 0.12, Math.min(w * 0.88, (mx > w / 2 ? R.r(0.15, 0.4) : R.r(0.6, 0.85)) * w));
  const sigY = R.r(0.1, 0.2) * h + 30;
  const cloudC = mix(skyB, '#8c95d6', 0.35);
  cloudBank(ctx, R, sigX + R.r(-30, 30), sigY + 16, 150, 46, { fill: cloudC, shadow: shade(cloudC, -0.18), dots: true, lw: 1.6, puffs: 3 });
  // drifting night cloud streaks
  for (let i = 0; i < 2; i++) {
    const cx = R() * w, cy = h * R.r(0.3, 0.45);
    cloudBank(ctx, R, cx, cy, R.r(120, 200), R.r(22, 34), { fill: mix(skyC, '#b9bde6', 0.18), shadow: shade(skyC, -0.1), dots: true, lw: 1.4, puffs: 4, bumps: 9 });
  }

  // far skyline
  const farBase = roofY;
  const far = skyline(ctx, R, {
    x0: -20, x1: w + 20, base: farBase, hMin: h * 0.2, hMax: h * 0.42, wMin: 60, wMax: 130, peak: 1.35, peakP: 0.2,
    fill: dusk ? '#4d4886' : '#3c4a86', lw: 1.3, ink: '#262a5c',
    onBuilding: (b) => windows(ctx, R, b, { ww: 3, wh: 5, gx: 5, gy: 6, litP: 0.18, lit: '#e8c475', pad: 5, padTop: 12 }),
  });
  void far;

  // searchlights (behind mid skyline)
  const beams = R.i(1, 2);
  const beamC = '#fff4c2';
  for (let i = 0; i < beams; i++) {
    const ox = R.r(0.05, 0.95) * w, oy = roofY - h * 0.18;
    const a = -Math.PI / 2 + R.r(-0.6, 0.6);
    beam(ctx, ox, oy, a, h * 1.4, 0.05, beamC, { alpha: 0.13, core: true, edge: beamC, edgeAlpha: 0.35 });
  }
  const ox = sigX + (sigX > w / 2 ? -1 : 1) * R.r(80, 240), oy = roofY - h * 0.16;
  const ang = Math.atan2(sigY - oy, sigX - ox), dist = Math.hypot(sigX - ox, sigY - oy);
  beam(ctx, ox, oy, ang, dist, Math.atan2(48, dist), beamC, { alpha: 0.2, core: true, edge: beamC, edgeAlpha: 0.5 });
  const sig = ellP(sigX, sigY, 74, 44, (ang + Math.PI / 2) * 0.6);
  fillP(ctx, sig, '#f9efbd');
  gradIn(ctx, sig, sigX - 72, sigY - 48, 144, 96, '#e8c86a', { spacing: 6, dir: 'radial', cx: sigX, cy: sigY, from: 0.45, to: 1, maxR: 3.4 });
  const star = P();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 14 : 34;
    const px = sigX + Math.cos(a) * rr * 1.1, py = sigY + 3 + Math.sin(a) * rr * 0.92;
    i ? star.lineTo(px, py) : star.moveTo(px, py);
  }
  star.closePath();
  fillP(ctx, star, skyA);
  strokeP(ctx, sig, 1.6, rgba(INK, 0.6));

  // mid skyline
  const midC = '#262550';
  skyline(ctx, R, {
    x0: -30, x1: w + 30, base: parTop + 6, hMin: h * 0.1, hMax: h * 0.3, wMin: 90, wMax: 190,
    kinds: ['flat', 'flat', 'tank', 'tank', 'step', 'antenna', 'gable'],
    fill: midC, lw: 2, ink: INK,
    onBuilding: (b) => {
      clipped(ctx, b.path, () => {
        const sx = b.x + b.w * 0.8;
        fillP(ctx, rectP(sx, b.top - 200, b.w, b.h + 400), '#1b1a3c');
        hatchLines(ctx, null, b.x + b.w * 0.55, b.top - 200, b.w * 0.25, b.h + 400, { spacing: 5, angle: -1.2, color: '#1b1a3c', lw: 1.2, R });
      });
      windows(ctx, R, b, { ww: 7, wh: 10, gx: 9, gy: 10, litP: 0.18, lit: '#f1cd6a', dark: '#1d1c40', pad: 10, padTop: 14 });
      // cornice line
      const c = rectP(b.x - 3, b.top, b.w + 6, 5);
      inked(ctx, c, shade(midC, 0.12), 1.4);
    },
  });
  // searchlight housings on the rooftops
  const lamp = (lx, ly, a) => {
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(a + Math.PI / 2);
    inked(ctx, rrectP(-11, -10, 22, 24, 4), '#3b3a66', 1.6);
    inked(ctx, ellP(0, -10, 11, 4), '#fff4c2', 1.6);
    ctx.restore();
    inked(ctx, polyP([[lx - 10, ly + 22], [lx, ly + 4], [lx + 10, ly + 22]]), '#3b3a66', 1.6);
  };
  lamp(ox, oy, ang);

  // parapet wall
  const par = rectP(-5, parTop, w + 10, roofY - parTop);
  fillP(ctx, par, '#7b5a6c');
  brickPatches(ctx, R, 0, parTop + 8, w, roofY - parTop - 8, { bw: 26, bh: 9, color: '#5e4254', lw: 1, patches: Math.ceil(w / 260), rx: 70, ry: 20 });
  crescent(ctx, par, 0, -6, '#6a4a5c');
  const cap = rectP(-5, parTop - 7, w + 10, 9);
  inked(ctx, cap, '#a8909c', 1.8);
  strokeP(ctx, lineP(-5, roofY, w + 5, roofY), 1.8);
  // tar roof
  fillP(ctx, rectP(-5, roofY, w + 10, h - roofY + 5), '#4a4460');
  dotFade(ctx, 0, w, roofY, roofY + 30, '#3c3650', 7);
}

// ------------------------------------------------------------------ street

const SHOPS = ['DINER', 'PAWN', 'BANK', 'DRUGS', 'HOTEL', 'BOOKS', 'RADIO', 'BARBER', 'CAFE', 'TOYS', 'LOANS', 'SHOES'];

export function street(ctx, w, h, R) {
  const walkY = h - 44;
  dotSky(ctx, 0, 0, w, walkY, '#e2f0ec', '#5fa8da', { solid: 0.14, spacing: 11, to: 0.95 });

  // clouds
  const nc = Math.max(2, Math.round(w / 380));
  for (let i = 0; i < nc; i++) {
    const cx = ((i + R.r(0.1, 0.9)) / nc) * w, cy = h * R.r(0.1, 0.3);
    cloudBank(ctx, R, cx, cy, R.r(80, 140), R.r(34, 52), { fill: '#fbfbf4', shadow: '#c5dcea', dots: true, dotSp: 6, lw: 2, puffs: R.i(2, 4) });
  }
  // blimp with an ad
  if (R.chance(0.75)) {
    const bx = R.r(0.2, 0.8) * w, by = h * R.r(0.12, 0.24), bl = Math.min(260, w * 0.24), bh2 = bl * 0.3;
    const body = ellP(bx, by, bl / 2, bh2 / 2);
    const fin = polyP([[bx + bl * 0.36, by - bh2 * 0.1], [bx + bl * 0.56, by - bh2 * 0.62], [bx + bl * 0.52, by], [bx + bl * 0.56, by + bh2 * 0.62], [bx + bl * 0.36, by + bh2 * 0.1]]);
    inked(ctx, fin, '#c9544d', 2);
    solid(ctx, body, '#d9d4c4', { lx: 0, ly: -6, lw: 2, dots: '#9e978a' });
    inked(ctx, rrectP(bx - bl * 0.1, by + bh2 / 2 - 2, bl * 0.18, bh2 * 0.28, 3), '#8b8f99', 1.6);
    clipped(ctx, body, () => {
      fillP(ctx, rectP(bx - bl * 0.3, by - bh2 * 0.28, bl * 0.56, bh2 * 0.56), '#e5534b');
      letters(ctx, 'KAPOW!', bx - bl * 0.02, by + 1, bh2 * 0.46, '#fff2a8', { maxW: bl * 0.5 });
    });
    strokeP(ctx, body, 2);
  }

  // far towers
  skyline(ctx, R, {
    x0: -20, x1: w + 20, base: walkY - 60, hMin: h * 0.35, hMax: h * 0.62, wMin: 70, wMax: 140, peak: 1.25,
    kinds: ['flat', 'step', 'spire', 'step', 'antenna', 'dome'],
    fill: '#a9c2d8', lw: 1.3, ink: '#7c98b6',
    onBuilding: (b) => {
      const p = P();
      for (let x = b.x + 8; x < b.x + b.w - 6; x += 9) p.rect(x, b.top + 10, 3, b.h - 10);
      fillP(ctx, p, '#95b0c9');
    },
  });

  // street-front buildings
  let x = -R.r(10, 80);
  const facades = ['#c47a62', '#d8bd8f', '#8fb0a6', '#b7a3c6', '#d9c079', '#b98b73'];
  let fi = R.i(0, facades.length - 1);
  while (x < w) {
    const bw = R.r(200, 340);
    const tall = R.chance(0.35);
    const top = walkY - (tall ? R.r(h * 0.55, Math.min(h * 0.78, 660)) : R.r(Math.min(270, h * 0.4), Math.min(h * 0.5, 420)));
    const col = facades[fi++ % facades.length];
    const brick = col === '#c47a62' || col === '#b98b73';
    const f = rectP(x, top, bw, walkY - top + 2);
    fillP(ctx, f, col);
    if (brick) brickPatches(ctx, R, x + 4, top + 30, bw - 8, walkY - top - 200, { bw: 24, bh: 10, color: shade(col, -0.3), lw: 1, patches: 3, rx: 60, ry: 36 });
    // side shadow
    fillP(ctx, rectP(x + bw - 10, top, 10, walkY - top), shade(col, -0.15));
    strokeP(ctx, f, 2.2);
    // cornice
    const corn = rectP(x - 6, top - 4, bw + 12, 16);
    inked(ctx, corn, shade(col, 0.25), 2);
    const dent = P();
    for (let dx = x; dx < x + bw; dx += 10) dent.rect(dx, top + 12, 5, 6);
    fillP(ctx, dent, shade(col, -0.3));
    dotsIn(ctx, rectP(x, top + 12, bw, 16), shade(col, -0.35), 5, 1.4);
    // windows above the shop
    const shopTop = walkY - 150;
    const rows = Math.floor((shopTop - top - 50) / 70);
    const cols = Math.max(2, Math.floor(bw / 62));
    const wwid = 30, whei = 44;
    const gap = (bw - cols * wwid) / (cols + 1);
    const glass = P(), shades = P(), frames = P(), sills = P();
    for (let r = 0; r < rows; r++) {
      const wy = top + 40 + r * 70;
      for (let c = 0; c < cols; c++) {
        const wx = x + gap + c * (wwid + gap);
        frames.rect(wx - 3, wy - 3, wwid + 6, whei + 6);
        glass.rect(wx, wy, wwid, whei);
        if (R() < 0.35) shades.rect(wx, wy, wwid, whei * R.r(0.3, 0.7));
        sills.rect(wx - 6, wy + whei + 3, wwid + 12, 5);
      }
    }
    fillP(ctx, frames, shade(col, 0.35));
    fillP(ctx, glass, '#4d6886');
    clipped(ctx, glass, () => {
      const g = P();
      for (let gx = x - 200; gx < x + bw; gx += 34) polyP([[gx, shopTop], [gx + 10, shopTop], [gx + 10 + 400, shopTop - 400], [gx + 400, shopTop - 400]], true, g);
      fillP(ctx, g, '#7894b0');
    });
    fillP(ctx, shades, '#e6d59b');
    strokeP(ctx, frames, 1.4);
    strokeP(ctx, glass, 1.2);
    inked(ctx, sills, shade(col, 0.3), 1.2);
    // fire escape
    if (R.chance(0.45) && rows >= 2) {
      const fx = x + gap - 12, fw = wwid * 2 + gap + 24;
      const fe = P(), rail = P();
      for (let r = 0; r < rows; r++) {
        const py = top + 40 + r * 70 + whei + 8;
        fe.rect(fx, py, fw, 4);
        for (let rx = fx; rx <= fx + fw; rx += 8) rail.moveTo(rx, py), rail.lineTo(rx, py - 20);
        rail.moveTo(fx, py - 20); rail.lineTo(fx + fw, py - 20);
        if (r < rows - 1) { rail.moveTo(fx + fw - 10, py); rail.lineTo(fx + fw - 40, py + 70); }
      }
      strokeP(ctx, rail, 1.5, '#1f2230');
      fillP(ctx, fe, '#1f2230');
    }
    // shop front
    const awnY = shopTop - 14;
    const sign = rrectP(x + 16, shopTop - 58, bw - 32, 34, 3);
    inked(ctx, sign, R.pick(['#2e4f7a', '#7a2e36', '#2f5e4a', '#403a66']), 2);
    letters(ctx, R.pick(SHOPS), x + bw / 2, shopTop - 40, 26, '#f4e2a4', { maxW: bw - 50 });
    const sf = rectP(x + 10, shopTop, bw - 20, walkY - shopTop);
    fillP(ctx, sf, shade(col, -0.35));
    const disp = rectP(x + 22, shopTop + 30, bw * 0.55, walkY - shopTop - 50);
    fillP(ctx, disp, '#6f8aa2');
    clipped(ctx, disp, () => {
      fillP(ctx, polyP([[x + 40, walkY], [x + 70, walkY], [x + 170, shopTop], [x + 140, shopTop]]), '#8aa3b8');
    });
    strokeP(ctx, disp, 1.6);
    const door = rectP(x + bw * 0.66, shopTop + 22, Math.min(54, bw * 0.2), walkY - shopTop - 22);
    inked(ctx, door, shade(col, -0.5), 1.6);
    fillP(ctx, rectP(x + bw * 0.66 + 8, shopTop + 32, Math.min(54, bw * 0.2) - 16, 40), '#6f8aa2');
    // awning shadow falling on the shop front
    const ash = polyP([[x + 10, awnY + 30], [x + bw - 10, awnY + 30], [x + bw - 10, awnY + 64], [x + 10, awnY + 50]]);
    fillP(ctx, ash, rgba(INK, 0.28));
    dotsIn(ctx, rectP(x + 10, awnY + 60, bw - 20, 18), rgba(INK, 0.3), 5, 1.3);
    // awning
    const aw = polyP([[x + 6, awnY], [x + bw - 6, awnY], [x + bw + 4, awnY + 34], [x - 4, awnY + 34]]);
    const ac = R.pick(['#d4574f', '#3f73b8', '#3c9a6a', '#e0a13a']);
    hazardStripes(ctx, aw, x - 10, awnY, bw + 20, 36, '#f1ecd9', ac, 14, 0);
    clipped(ctx, aw, () => {
      const vs = P();
      for (let sx = x - 4; sx < x + bw + 10; sx += 28) vs.rect(sx, awnY, 14, 40);
      fillP(ctx, rectP(x - 10, awnY, bw + 20, 40), '#f1ecd9');
      fillP(ctx, vs, ac);
      fillP(ctx, rectP(x - 10, awnY + 26, bw + 20, 10), rgba(INK, 0.15));
    });
    strokeP(ctx, aw, 2);
    const scal = P();
    for (let sx = x - 4; sx < x + bw + 4; sx += 14) { scal.moveTo(sx, awnY + 34); scal.arc(sx + 7, awnY + 34, 7, Math.PI, 0, true); }
    fillP(ctx, scal, ac);
    strokeP(ctx, scal, 1.6);
    x += bw + (R.chance(0.3) ? R.r(50, 110) : 0);
  }

  // sidewalk
  fillP(ctx, rectP(-5, walkY, w + 10, h - walkY + 5), '#c9c2b0');
  strokeP(ctx, lineP(-5, walkY, w + 5, walkY), 2);
  dotFade(ctx, 0, w, walkY, walkY + 16, '#9f978a', 6);
}

// ------------------------------------------------------------------ lab

export function lab(ctx, w, h, R) {
  const floorY = h - 40;
  const wall = '#3d5f63', wallD = '#2c4a4e', wallL = '#4d7275';
  fillP(ctx, rectP(0, 0, w, h), wall);
  // riveted steel panels
  const pw = 150, ph = 120;
  const panels = P(), rv = P();
  for (let y = 0; y < floorY; y += ph) for (let x = (y / ph) % 2 ? -pw / 2 : 0; x < w; x += pw) {
    panels.rect(x, y, pw, ph);
    circP(x + 8, y + 8, 2, rv); circP(x + pw - 8, y + 8, 2, rv); circP(x + 8, y + ph - 8, 2, rv); circP(x + pw - 8, y + ph - 8, 2, rv);
  }
  strokeP(ctx, panels, 1.4, wallD);
  fillP(ctx, rv, wallL);
  dotFade(ctx, 0, w, 0, h * 0.4, wallD, 9);
  const slots = spans(10, w - 10);

  // arched storm window
  const ww = Math.min(w * 0.34, 300), wh = Math.min(h * 0.46, 420), wy = h * 0.08;
  const wx = slots.take(R, ww + 40, 10) + 20;
  const arch = P();
  arch.moveTo(wx, wy + wh);
  arch.lineTo(wx, wy + ww / 2);
  arch.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0);
  arch.lineTo(wx + ww, wy + wh);
  arch.closePath();
  clipped(ctx, arch, () => {
    bandSky(ctx, wx, ww, [{ c: '#17132e', y: wy - 10 }, { c: '#2e2656', y: wy + wh * 0.4 }, { c: '#4a3c7a', y: wy + wh * 0.75 }], 50, 5);
    for (let i = 0; i < 3; i++) cloudBank(ctx, R, wx + R() * ww, wy + wh * R.r(0.15, 0.55), 80, 26, { fill: '#2a2250', shadow: '#1d1840', lw: 1.2, puffs: 3 });
    const bx = wx + ww * R.r(0.3, 0.7);
    glow(ctx, bx, wy + wh * 0.4, ww * 0.7, '#9d8cf0', { from: 0.3, spacing: 5 });
    const b = boltPath(R, bx, wy - 10, bx + R.r(-60, 60), wy + wh, 9, 8);
    inked(ctx, b, '#fffbe0', 2);
    const b2 = arcLine(R, bx, wy + wh * 0.35, bx + R.sign() * 70, wy + wh * 0.6, 5, 0.3);
    strokeP(ctx, b2, 5, INK); strokeP(ctx, b2, 2.5, '#fffbe0');
    skyline(ctx, R, { x0: wx - 10, x1: wx + ww + 10, base: wy + wh + 4, hMin: 20, hMax: 70, wMin: 20, wMax: 44, fill: '#15122a', lw: 0, kinds: ['flat', 'gable', 'step'] });
    // rain on the glass
    rain(ctx, R, wx, wy, ww, wh, 40, { angle: 1.45, len: 20, color: '#8f84c8', lw: 1 });
  });
  const mul = P();
  mul.rect(wx + ww / 2 - 3, wy, 6, wh);
  for (let y = wy + ww * 0.45; y < wy + wh; y += 70) mul.rect(wx, y, ww, 5);
  clipped(ctx, arch, () => inked(ctx, mul, '#27303a', 1.4));
  strokeP(ctx, arch, 14, '#27303a');
  strokeP(ctx, arch, 2.4);
  inked(ctx, rectP(wx - 16, wy + wh, ww + 32, 12), '#4f6468', 2);
  // cold light spilling from the window
  beam(ctx, wx + ww / 2, wy + wh * 0.5, Math.PI / 2 + R.r(-0.25, 0.25), floorY - wy - wh * 0.5, 0.35, '#b9b0ff', { alpha: 0.08, w0: ww * 0.4 });

  // ceiling pipes
  const pc = '#b27b4e';
  const py1 = R.r(24, 44);
  pipe(ctx, [[-20, py1], [w + 20, py1]], 9, pc, { flanges: 180, lw: 2 });

  // gauge bank
  const gx = slots.take(R, 220, 30);
  if (gx != null) {
    const gy = h * 0.18;
    const gb = rrectP(gx, gy, 220, 150, 6);
    pipe(ctx, [[gx + 110, py1 + 8], [gx + 110, gy]], 5, '#7f9a9c', { lw: 1.8 });
    solid(ctx, gb, '#6f8184', { lw: 2, lx: -4, ly: -4 });
    for (let i = 0; i < 3; i++) dial(ctx, R, gx + 40 + i * 70, gy + 44, 22, { face: '#ece3c4', rim: '#9aa3a6', lw: 1.6 });
    const leds = P();
    for (let i = 0; i < 9; i++) circP(gx + 24 + i * 21, gy + 100, 4, leds);
    fillP(ctx, leds, '#c8e07a');
    strokeP(ctx, leds, 1.2);
    for (let i = 0; i < 5; i++) { fillP(ctx, rectP(gx + 30 + i * 36, gy + 116, 6, 22), INK); inked(ctx, rectP(gx + 24 + i * 36, gy + 118 + R() * 10, 18, 8), '#e2c36a', 1.2); }
  }

  // Frankenstein knife switch
  const kx = slots.take(R, 110, 30);
  if (kx != null) {
    const ky = h * 0.24;
    const board = rectP(kx + 10, ky, 90, 140);
    solid(ctx, board, '#3a3a36', { lw: 2.2, lx: -4, ly: -4 });
    const on = R.chance(0.5);
    for (const bx of [kx + 36, kx + 74]) {
      inked(ctx, rectP(bx - 7, ky + 96, 14, 20), '#c8804a', 1.6);
      inked(ctx, rectP(bx - 7, ky + 22, 14, 18), '#c8804a', 1.6);
      const blade = on ? lineP(bx, ky + 106, bx, ky + 30) : lineP(bx, ky + 106, bx + 30, ky + 50);
      strokeP(ctx, blade, 8, INK); strokeP(ctx, blade, 4, '#e0a060');
    }
    const handle = on ? lineP(kx + 36, ky + 30, kx + 74, ky + 30) : lineP(kx + 66, ky + 50, kx + 104, ky + 50);
    strokeP(ctx, handle, 10, INK); strokeP(ctx, handle, 6, '#b8342a');
    inked(ctx, rectP(kx + 22, ky + 124, 66, 12), '#e8c040', 1.4);
    letters(ctx, 'DANGER', kx + 55, ky + 130.5, 11, INK);
    if (on) { const sp = P(); for (let k = 0; k < 6; k++) { const a = R() * TAU; sp.moveTo(kx + 55, ky + 30); sp.lineTo(kx + 55 + Math.cos(a) * 18, ky + 30 + Math.sin(a) * 18); } strokeP(ctx, sp, 1.8, '#fff3a0'); }
    const cab = P(); cab.moveTo(kx + 36, ky + 140); cab.quadraticCurveTo(kx + 30, floorY - 40, kx - 20, floorY - 30);
    strokeP(ctx, cab, 6, INK); strokeP(ctx, cab, 3, '#2a2a2a');
  }

  // Jacob's ladder
  const jx = slots.take(R, 120, 30);
  if (jx != null) {
    const cx = jx + 60, base = floorY - 16, top = base - Math.min(240, h * 0.38);
    glow(ctx, cx, (base + top) / 2, 110, '#8ad8ff', { from: 0.3, spacing: 6 });
    const rods = P(); rods.moveTo(cx - 12, base - 30); rods.lineTo(cx - 42, top); rods.moveTo(cx + 12, base - 30); rods.lineTo(cx + 42, top);
    strokeP(ctx, rods, 8, INK); strokeP(ctx, rods, 4, '#c8ccd4');
    for (let k = 0; k < 3; k++) {
      const t = 0.25 + k * 0.3 + R() * 0.1;
      const y = base - 30 + (top - base + 30) * t, hw = 12 + 30 * t;
      const a = arcLine(R, cx - hw, y, cx + hw, y - 6, 6, 0.3);
      strokeP(ctx, a, 6, rgba('#8ad8ff', 0.6)); strokeP(ctx, a, 2.2, '#ffffff');
    }
    solid(ctx, rrectP(cx - 34, base - 34, 68, 34, 4), '#5d6e72', { lw: 2.2, lx: 0, ly: -4 });
    hazardStripes(ctx, rectP(cx - 28, base - 14, 56, 8), cx - 28, base - 14, 56, 8, '#e8c040', INK, 5);
  }

  // specimen tanks
  const nt = w > 800 ? 3 : 2;
  for (let i = 0; i < nt; i++) {
    const tw = 70 + R() * 20, th = Math.min(250, h * 0.3) + R() * 40;
    const tx = slots.take(R, tw + 16, 16);
    if (tx == null) continue;
    labTank(ctx, R, tx + 8, floorY - 20 - th, tw, th);
  }

  // floor
  const fl = rectP(-5, floorY, w + 10, h - floorY + 5);
  fillP(ctx, fl, '#56696a');
  clipped(ctx, fl, () => {
    const tiles = P();
    const vx = w / 2, vy = floorY - 500;
    for (let i = -30; i <= 30; i++) {
      const bx = w / 2 + i * 60;
      const t0 = (floorY - vy) / (h + 10 - vy);
      tiles.moveTo(vx + (bx - vx) * t0, floorY);
      tiles.lineTo(bx, h + 10);
    }
    tiles.moveTo(0, floorY + 16); tiles.lineTo(w, floorY + 16);
    strokeP(ctx, tiles, 1.2, '#415455');
  });
  strokeP(ctx, lineP(-5, floorY, w + 5, floorY), 2);
  fillP(ctx, rectP(-5, floorY - 14, w + 10, 14), '#355255');
  strokeP(ctx, lineP(-5, floorY - 14, w + 5, floorY - 14), 1.6);
  vignette(ctx, w, h, '#1c2f33', { spacing: 10 });
}

function labTank(ctx, R, x, y, w, h) {
  const glass = rrectP(x, y + 18, w, h - 36, 14);
  const liquid = '#7fcf7a';
  fillP(ctx, glass, '#a9e39a');
  clipped(ctx, glass, () => {
    fillP(ctx, rectP(x, y + 18 + h * 0.12, w, h), liquid);
    halftoneGradient(ctx, x, y, w, h, '#5aa865', { spacing: 6, dir: 'right', from: 0.4, maxR: 3.3 });
    // specimen: brain or little humanoid
    if (R.chance(0.5)) {
      const cx = x + w / 2, cy = y + h * 0.45;
      const br = cloudPath(cx, cy, w * 0.28, w * 0.2, 8, (R() * 1e6) | 0);
      inked(ctx, br, '#e7a3a8', 1.6);
      const s = P(); s.moveTo(cx, cy - w * 0.16); s.quadraticCurveTo(cx + 6, cy, cx, cy + w * 0.14);
      strokeP(ctx, s, 1.2);
      strokeP(ctx, lineP(cx, cy + w * 0.2, cx, y + h - 20), 2, '#5a7a5a');
    } else {
      const cx = x + w / 2, cy = y + h * 0.35;
      const body = P();
      circP(cx, cy, 11, body);
      body.moveTo(cx - 13, cy + 14); body.lineTo(cx + 13, cy + 14); body.lineTo(cx + 9, cy + 62); body.lineTo(cx + 12, cy + 110); body.lineTo(cx + 3, cy + 110); body.lineTo(cx, cy + 70); body.lineTo(cx - 3, cy + 110); body.lineTo(cx - 12, cy + 110); body.lineTo(cx - 9, cy + 62); body.closePath();
      fillP(ctx, body, '#3d6e4d');
    }
    const bub = P();
    for (let i = 0; i < 12; i++) circP(x + 8 + R() * (w - 16), y + 30 + R() * (h - 60), 1.5 + R() * 4, bub);
    fillP(ctx, bub, '#d9f7c8');
    strokeP(ctx, bub, 1);
    fillP(ctx, rectP(x + 8, y + 26, 7, h - 60), 'rgba(255,255,255,0.55)');
  });
  strokeP(ctx, glass, 2.2);
  const capT = rrectP(x - 6, y, w + 12, 22, 4), capB = rrectP(x - 6, y + h - 22, w + 12, 22, 4);
  solid(ctx, capT, '#8c9aa0', { lw: 2 });
  solid(ctx, capB, '#8c9aa0', { lw: 2 });
  rivetRow(ctx, x, y + 11, x + w, y + 11, 14, 2, '#c9d2d4', 1);
  rivetRow(ctx, x, y + h - 11, x + w, y + h - 11, 14, 2, '#c9d2d4', 1);
}

// ------------------------------------------------------------------ lair

export function lair(ctx, w, h, R) {
  const floorY = h - 40;
  const wall = '#2e2842';
  fillP(ctx, rectP(0, 0, w, h), wall);
  // vertical ribs / bulkheads
  const rib = P();
  const ribSp = R.r(140, 190);
  for (let x = R.r(0, ribSp); x < w; x += ribSp) rib.rect(x - 12, 0, 24, floorY);
  fillP(ctx, rib, '#3a3354');
  strokeP(ctx, rib, 1.6, '#1a1628');
  dotFade(ctx, 0, w, floorY - 260, floorY - 60, '#231e36', 9);

  // cavern rock framing (volcano hideout)
  const rock = P();
  rock.moveTo(-10, -10);
  let x = -10;
  while (x < w + 10) {
    const nx = x + R.r(30, 80);
    const tip = R.chance(0.35) ? R.r(40, 110) : R.r(10, 36);
    rock.lineTo((x + nx) / 2, tip);
    rock.lineTo(nx, R.r(4, 14));
    x = nx;
  }
  rock.lineTo(w + 10, -10);
  rock.closePath();
  fillP(ctx, rock, '#1a1424');
  strokeP(ctx, rock, 2);

  // giant monitor wall
  const mw = Math.min(w * 0.72, 760), mh = Math.min(h * 0.44, 380);
  const mx = (w - mw) / 2 + R.r(-0.08, 0.08) * w, my = h * 0.12;
  const frame = rrectP(mx - 18, my - 18, mw + 36, mh + 36, 10);
  solid(ctx, frame, '#4b4466', { lw: 2.5 });
  rivetRow(ctx, mx - 6, my - 9, mx + mw + 6, my - 9, 24, 2.2, '#7a7196', 1);
  const cols = mw > 500 ? 4 : 3;
  const cw = mw / cols;
  const screens = [];
  // center big screen spans 2 cols x 2 rows
  const bigC = Math.floor((cols - 2) / 2);
  screens.push({ x: mx + bigC * cw, y: my, w: cw * 2, h: mh, kind: 'boss' });
  for (let c = 0; c < cols; c++) {
    if (c === bigC || c === bigC + 1) continue;
    screens.push({ x: mx + c * cw, y: my, w: cw, h: mh / 2, kind: R.pick(['map', 'radar', 'bars']) });
    screens.push({ x: mx + c * cw, y: my + mh / 2, w: cw, h: mh / 2, kind: R.pick(['map', 'radar', 'bars', 'count']) });
  }
  for (const s of screens) monitor(ctx, R, s.x + 5, s.y + 5, s.w - 10, s.h - 10, s.kind);

  // doomsday ray cannon on a side gantry (only where there is room)
  const leftM = mx - 18, rightM = w - (mx + mw + 18);
  const side = rightM >= leftM ? 1 : -1;
  const margin = Math.max(leftM, rightM);
  if (margin >= 80) {
    const sc = Math.max(0.55, Math.min(1, margin / 170));
    const cx = side > 0 ? w - margin / 2 : margin / 2, cy = Math.max(my + mh * 0.55, h * 0.42);
    const strut = polyP([[cx - 20 * sc, cy + 30 * sc], [cx + 20 * sc, cy + 30 * sc], [cx + 40 * sc, floorY - 70], [cx - 40 * sc, floorY - 70]]);
    solid(ctx, strut, '#403958', { lw: 2 });
    hazardStripes(ctx, strut, cx - 40, cy, 80, floorY - cy, '#b5953a', '#1d1a28', 12);
    strokeP(ctx, strut, 2);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sc, sc);
    ctx.rotate(-Math.PI / 2 - side * 0.42);
    const barrel = rrectP(0, -26, 200, 52, 12);
    solid(ctx, barrel, '#8a86a4', { lw: 2.5, lx: 0, ly: -6 });
    for (let i = 0; i < 4; i++) solid(ctx, rrectP(40 + i * 38, -32, 18, 64, 5), '#5f5a7c', { lw: 2 });
    solid(ctx, rrectP(192, -18, 40, 36, 6), '#5f5a7c', { lw: 2 });
    glow(ctx, 238, 0, 64, '#57e1ec', { core: '#9ff4f8', core2: '#ffffff', coreR: 0.35, spacing: 5 });
    strokeP(ctx, circP(238, 0, 22), 2);
    const zap = arcLine(R, 238, 0, 330, R.r(-30, 30), 5, 0.3);
    strokeP(ctx, zap, 5, rgba('#57e1ec', 0.6)); strokeP(ctx, zap, 2, '#ffffff');
    ctx.restore();
    solid(ctx, circP(cx, cy, 46 * sc), '#6b6488', { lw: 2.5 });
    inked(ctx, circP(cx, cy, 18 * sc), '#3b3554', 2);
  }

  // alarm lights with red sweeping beams
  const nl = Math.max(2, Math.round(w / 420));
  for (let i = 0; i < nl; i++) {
    const lx = ((i + 0.5) / nl) * w + R.r(-40, 40), ly = my + mh + 60;
    beam(ctx, lx, ly, R.r(-0.5, 0.5) + (R.chance(0.5) ? 0 : Math.PI), w * 0.5, 0.12, '#ff4a3d', { alpha: 0.14, core: true });
    const dome = P(); dome.moveTo(lx - 14, ly + 6); dome.arc(lx, ly + 6, 14, Math.PI, 0); dome.closePath();
    glow(ctx, lx, ly, 40, '#ff6b5a', { spacing: 5 });
    inked(ctx, dome, '#ff5a4a', 2);
    inked(ctx, rectP(lx - 18, ly + 6, 36, 7), '#4b4466', 1.6);
  }

  // glowing energy conduits along the wall
  const nc = Math.max(2, Math.round(w / 350));
  for (let i = 0; i < nc; i++) {
    const tx = ((i + R.r(0.2, 0.8)) / nc) * w;
    if (Math.abs(tx - (mx + mw / 2)) < mw / 2 + 30) continue;
    const t = rrectP(tx - 13, h * 0.2, 26, floorY - 150 - h * 0.2, 13);
    fillP(ctx, t, '#2c9aa6');
    clipped(ctx, t, () => {
      fillP(ctx, rectP(tx - 5, 0, 10, h), '#9ff4f8');
      halftoneGradient(ctx, tx - 13, h * 0.2, 26, floorY - 150 - h * 0.2, '#1f6f78', { spacing: 5, dir: 'right', from: 0.55, maxR: 2.8 });
    });
    strokeP(ctx, t, 2);
    for (let y = h * 0.2 + 30; y < floorY - 160; y += 60) inked(ctx, rrectP(tx - 17, y, 34, 8, 3), '#5f5a7c', 1.6);
  }

  // hazard band + floor
  const hz = rectP(-5, floorY - 70, w + 10, 26);
  hazardStripes(ctx, hz, -5, floorY - 70, w + 10, 26, '#c9a73f', '#231e32', 16);
  strokeP(ctx, hz, 2);
  fillP(ctx, rectP(-5, floorY - 44, w + 10, 44), '#39324f');
  strokeP(ctx, lineP(-5, floorY - 44, w + 5, floorY - 44), 1.6);
  const fl = rectP(-5, floorY, w + 10, h - floorY + 5);
  fillP(ctx, fl, '#4a4262');
  strokeP(ctx, lineP(-5, floorY, w + 5, floorY), 2);
  clipped(ctx, fl, () => {
    const g = P();
    for (let gx = 0; gx < w; gx += 40) { g.moveTo(gx, floorY); g.lineTo(gx - 10, h); }
    strokeP(ctx, g, 1, '#3a3350');
  });
  vignette(ctx, w, h, '#16121f', { from: 0.6, spacing: 10 });
}

function monitor(ctx, R, x, y, w, h, kind) {
  const scr = rrectP(x, y, w, h, 6);
  const bg = kind === 'boss' ? '#1b4a52' : '#173c43';
  fillP(ctx, scr, bg);
  const fg = '#62d6de';
  clipped(ctx, scr, () => {
    if (kind === 'boss') {
      glowRect(ctx, x, y, w, h, '#2a7780', { from: 0.1, spacing: 7 });
      // the Doctor's brain-dome silhouette
      const cx = x + w / 2, cy = y + h * 0.56, s = Math.min(w, h) * 0.34;
      const head = P();
      head.moveTo(cx - s * 0.7, cy + s * 1.4);
      head.quadraticCurveTo(cx - s * 0.8, cy + s * 0.6, cx - s * 0.55, cy + s * 0.35);
      head.lineTo(cx + s * 0.55, cy + s * 0.35);
      head.quadraticCurveTo(cx + s * 0.8, cy + s * 0.6, cx + s * 0.7, cy + s * 1.4);
      head.closePath();
      fillP(ctx, head, '#0f2a2f');
      const brain = cloudPath(cx, cy - s * 0.05, s * 0.72, s * 0.52, 10, 77);
      inked(ctx, brain, '#e79aa8', 2.4);
      const folds = P();
      folds.moveTo(cx, cy - s * 0.5); folds.quadraticCurveTo(cx - 8, cy - s * 0.1, cx, cy + s * 0.3);
      folds.moveTo(cx - s * 0.4, cy - s * 0.3); folds.quadraticCurveTo(cx - s * 0.2, cy - s * 0.1, cx - s * 0.45, cy + s * 0.15);
      folds.moveTo(cx + s * 0.4, cy - s * 0.3); folds.quadraticCurveTo(cx + s * 0.2, cy - s * 0.1, cx + s * 0.45, cy + s * 0.15);
      strokeP(ctx, folds, 2, '#9a4a5e');
      const eyes = P();
      ellP(cx - s * 0.28, cy + s * 0.62, s * 0.16, s * 0.08, 0.2, eyes);
      ellP(cx + s * 0.28, cy + s * 0.62, s * 0.16, s * 0.08, -0.2, eyes);
      fillP(ctx, eyes, '#ffe14a');
      const dome = ellP(cx, cy, s * 0.95, s * 0.78);
      strokeP(ctx, dome, 2, '#9ff4f8');
      letters(ctx, 'SURRENDER!', cx, y + h * 0.12, Math.min(34, w * 0.09), '#ffe14a', { outline: 5 });
    } else if (kind === 'map') {
      const g = P();
      for (let gx = x; gx < x + w; gx += 16) { g.moveTo(gx, y); g.lineTo(gx, y + h); }
      for (let gy = y; gy < y + h; gy += 16) { g.moveTo(x, gy); g.lineTo(x + w, gy); }
      strokeP(ctx, g, 0.8, '#2b6068');
      for (let i = 0; i < 3; i++) {
        const b = cloudPath(x + w * (0.2 + i * 0.3), y + h * (0.35 + R() * 0.3), w * 0.14, h * 0.2, 7, (R() * 1e6) | 0);
        fillP(ctx, b, '#3a9aa3');
      }
      const tx = x + w * R.r(0.25, 0.75), ty = y + h * R.r(0.3, 0.7);
      const ret = P(); circP(tx, ty, 12, ret); circP(tx, ty, 4, ret);
      ret.moveTo(tx - 20, ty); ret.lineTo(tx + 20, ty); ret.moveTo(tx, ty - 20); ret.lineTo(tx, ty + 20);
      strokeP(ctx, ret, 2, '#ff5a4a');
    } else if (kind === 'radar') {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.4;
      const rr = P(); circP(cx, cy, r, rr); circP(cx, cy, r * 0.66, rr); circP(cx, cy, r * 0.33, rr);
      rr.moveTo(cx - r, cy); rr.lineTo(cx + r, cy); rr.moveTo(cx, cy - r); rr.lineTo(cx, cy + r);
      strokeP(ctx, rr, 1, '#3a9aa3');
      const a = R() * TAU;
      const sw = P(); sw.moveTo(cx, cy); sw.arc(cx, cy, r, a, a + 0.8); sw.closePath();
      fillP(ctx, sw, 'rgba(98,214,222,0.45)');
      const bl = P(); for (let i = 0; i < 4; i++) circP(cx + (R() - 0.5) * r * 1.2, cy + (R() - 0.5) * r * 1.2, 3, bl);
      fillP(ctx, bl, '#ff5a4a');
    } else if (kind === 'bars') {
      const n = 6;
      const bars = P();
      for (let i = 0; i < n; i++) {
        const bh = h * (0.15 + R() * 0.65);
        bars.rect(x + 10 + i * ((w - 20) / n), y + h - 8 - bh, (w - 20) / n - 6, bh);
      }
      fillP(ctx, bars, fg);
    } else {
      letters(ctx, '00:0' + R.i(1, 9), x + w / 2, y + h / 2, Math.min(h * 0.45, w * 0.26), '#ff5a4a');
    }
    // scanlines
    const sl = P();
    for (let sy = y; sy < y + h; sy += 4) sl.rect(x, sy, w, 1.4);
    fillP(ctx, sl, 'rgba(0,0,0,0.18)');
    fillP(ctx, polyP([[x, y], [x + w * 0.3, y], [x, y + h * 0.4]]), 'rgba(255,255,255,0.1)');
  });
  strokeP(ctx, scr, 2.4);
}
