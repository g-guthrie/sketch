// HORROR backdrops: graveyard, street, hospital, mall.

import {
  INK, TAU, shade, mix, rgba, halftoneGradient, cloudPath,
  P, rectP, circP, ellP, polyP, rrectP, lineP, fillP, strokeP, inked, dotsIn, hatchIn, clipped, gradIn, crescent,
  bandSky, dotFade, stars, moon, glow, glowRect, beam, cloudBank, skyline, windows, brickPatches,
  pipe, hazardStripes, rivetRow, neon, letters, vignette, speckle, hatchLines, solid, fire, smoke, fogBand, halftone,
  deadTree, ironFence, drips, batPath, hillPath, handPath, arcLine, spans,
} from './kit.js';

// ---------------------------------------------------------------- graveyard

function tombSil(ctx, x, base, w, h, kind, fill, lw, R) {
  const p = P();
  const tilt = (R() - 0.5) * 0.16;
  if (kind === 0) { // round top
    p.moveTo(x - w / 2, base);
    p.lineTo(x - w / 2, base - h + w / 2);
    p.arc(x, base - h + w / 2, w / 2, Math.PI, 0);
    p.lineTo(x + w / 2, base);
    p.closePath();
  } else if (kind === 1) { // cross
    const t = w * 0.28;
    polyP([[x - t / 2, base], [x - t / 2, base - h * 0.62], [x - w / 2, base - h * 0.62], [x - w / 2, base - h * 0.62 - t], [x - t / 2, base - h * 0.62 - t], [x - t / 2, base - h], [x + t / 2, base - h], [x + t / 2, base - h * 0.62 - t], [x + w / 2, base - h * 0.62 - t], [x + w / 2, base - h * 0.62], [x + t / 2, base - h * 0.62], [x + t / 2, base]], true, p);
  } else if (kind === 2) { // obelisk
    polyP([[x - w * 0.32, base], [x - w * 0.22, base - h * 0.85], [x, base - h], [x + w * 0.22, base - h * 0.85], [x + w * 0.32, base]], true, p);
    p.rect(x - w * 0.45, base - h * 0.12, w * 0.9, h * 0.12);
  } else { // slab with shoulders
    polyP([[x - w / 2, base], [x - w / 2, base - h * 0.8], [x - w * 0.3, base - h * 0.8], [x - w * 0.3, base - h * 0.92], [x, base - h], [x + w * 0.3, base - h * 0.92], [x + w * 0.3, base - h * 0.8], [x + w / 2, base - h * 0.8], [x + w / 2, base]], true, p);
  }
  const m = new DOMMatrix().translate(x, base).rotate((tilt * 180) / Math.PI).translate(-x, -base);
  const q = P();
  q.addPath(p, m);
  fillP(ctx, q, fill);
  if (lw) strokeP(ctx, q, lw);
  return q;
}

export function graveyard(ctx, w, h, R) {
  const groundY = h - 46;
  bandSky(ctx, 0, w, [
    { c: '#1f1433', y: 0 },
    { c: '#35214f', y: h * 0.24 },
    { c: '#533d72', y: h * 0.46 },
    { c: '#7f8a76', y: h * 0.66, blend: 60 },
  ], 110, 10);
  stars(ctx, R, 0, 0, w, h * 0.45, Math.round(w * h / 12000), '#cbbde6', { r: 0.9, pow: 1.5, big: 5 });

  // the big full moon
  const mr = Math.max(80, Math.min(190, Math.min(w, h) * R.r(0.17, 0.23)));
  const mx = R.r(0.25, 0.75) * w, my = Math.max(mr + 20, h * R.r(0.24, 0.32));
  moon(ctx, R, mx, my, mr, { color: '#ecefc4', dots: '#b9c28e', shade: '#d7dcae', crater: '#dde2b4', halo: ['#2f2049', '#3b2a58', '#48366a'], haloStep: 0.16, lw: 2.4, phase: 0.3 });
  // thin cloud streaks across the moon
  for (let i = 0; i < 3; i++) {
    const cy = my + R.r(-0.4, 0.7) * mr, cx = mx + R.r(-1.4, 1.4) * mr;
    const st = P();
    ellP(cx, cy, R.r(90, 180), R.r(6, 12), 0, st);
    ellP(cx + R.r(30, 80), cy + R.r(6, 12), R.r(60, 120), R.r(5, 9), 0, st);
    strokeP(ctx, st, 3, INK);
    fillP(ctx, st, '#3a2a55');
  }
  // bats across the moon
  const nb = R.i(3, 6);
  const bats = P();
  for (let i = 0; i < nb; i++) {
    const a = R() * TAU, d = R.r(0.2, 1.6) * mr;
    batPath(mx + Math.cos(a) * d, my + Math.sin(a) * d * 0.7, R.r(18, 40), R(), bats);
  }
  fillP(ctx, bats, '#140d1f');

  // far hill with chapel and dead trees
  const hillY = h * R.r(0.6, 0.66);
  const hpts = [];
  for (let i = 0; i <= 5; i++) hpts.push([(i / 5) * w * 1.1 - w * 0.05, hillY + R.r(-50, 30)]);
  const hill = hillPath(hpts, h + 10);
  fillP(ctx, hill, '#2c2140');
  strokeP(ctx, hill, 1.6, '#150e20');
  // chapel silhouette on the hill
  const chX = R.r(0.12, 0.88) * w, chY = hillY + 12;
  const ch = P();
  ch.rect(chX - 60, chY - 70, 120, 72);
  polyP([[chX - 70, chY - 68], [chX, chY - 120], [chX + 70, chY - 68]], true, ch);
  ch.rect(chX + 34, chY - 150, 30, 90);
  polyP([[chX + 30, chY - 148], [chX + 49, chY - 205], [chX + 68, chY - 148]], true, ch);
  ch.rect(chX + 47, chY - 225, 4, 22);
  ch.rect(chX + 41, chY - 217, 16, 4);
  fillP(ctx, ch, '#1c1429');
  strokeP(ctx, ch, 1.4, '#0e0916');
  const cw = P();
  cw.moveTo(chX - 30, chY - 20); cw.lineTo(chX - 30, chY - 42); cw.arc(chX - 24, chY - 42, 6, Math.PI, 0); cw.lineTo(chX - 18, chY - 20); cw.closePath();
  cw.moveTo(chX + 8, chY - 20); cw.lineTo(chX + 8, chY - 42); cw.arc(chX + 14, chY - 42, 6, Math.PI, 0); cw.lineTo(chX + 20, chY - 20); cw.closePath();
  circP(chX + 49, chY - 125, 7, cw);
  fillP(ctx, cw, '#d9e07a');
  for (let i = 0; i < 3; i++) {
    const tx = R() * w;
    if (Math.abs(tx - chX) < 110) continue;
    deadTree(ctx, R, tx, hillY + 10, R.r(80, 140), '#1c1429', { depth: 4 });
  }
  // distant tombstones on the hill
  const far = P();
  for (let x = R.r(0, 40); x < w; x += R.r(28, 60)) tombSil(ctx, x, hillY + 30 + R.r(0, 30), R.r(12, 20), R.r(18, 34), R.i(0, 3), '#3b2e52', 0, R);
  void far;

  // mid ground: rolling mound + tombstones with ink
  const midY = groundY - R.r(110, 140);
  const mpts = [];
  for (let i = 0; i <= 6; i++) mpts.push([(i / 6) * w * 1.1 - w * 0.05, midY + R.r(-18, 18)]);
  const mound = hillPath(mpts, h + 10);
  fillP(ctx, mound, '#3a2f4a');
  strokeP(ctx, mound, 2);
  dotFade(ctx, 0, w, groundY, midY - 10, '#2c2338', 7);

  // iron fence behind the graves
  ironFence(ctx, -10, w + 10, midY + 12, 70, '#1b1424', { spacing: 15, bar: 3, posts: R.r(180, 260) });

  // big gnarled tree to one side
  const side = R.chance(0.5) ? R.r(0.04, 0.2) : R.r(0.8, 0.96);
  deadTree(ctx, R, side * w, midY + 26, Math.min(h * 0.75, 560), '#1a1224', { ink: INK, inkW: 3, depth: 6, trunk: 22 });

  // tombstones row
  const tc = '#77708a';
  for (let x = R.r(20, 80); x < w - 20; x += R.r(70, 150)) {
    const tw = R.r(30, 48), th = R.r(44, 72), kind = R.i(0, 3);
    const base = midY + R.r(40, 62);
    const t = tombSil(ctx, x, base, tw, th, kind, tc, 0, R);
    crescent(ctx, t, -5, -4, '#5b5470');
    clipped(ctx, t, () => {
      const cr = P();
      cr.moveTo(x - tw * 0.3, base - th * 0.5); cr.lineTo(x - tw * 0.1, base - th * 0.4); cr.lineTo(x - tw * 0.18, base - th * 0.25);
      strokeP(ctx, cr, 1.2);
      if (kind === 0 || kind === 3) {
        const rip = P();
        rip.rect(x - tw * 0.25, base - th * 0.66, tw * 0.5, 2);
        rip.rect(x - tw * 0.2, base - th * 0.56, tw * 0.4, 2);
        fillP(ctx, rip, '#4d4760');
      }
    });
    strokeP(ctx, t, 2);
  }


  // fog rolling over the ground
  fogBand(ctx, R, 0, groundY - 34, w, 36, '#b7b0cc', { alpha: 0.22, step: 70 });
  fogBand(ctx, R, 0, groundY - 14, w, 30, '#c9c3da', { alpha: 0.28, step: 60 });
  // ground
  const g = rectP(-5, groundY, w + 10, h - groundY + 5);
  fillP(ctx, g, '#3f3449');
  strokeP(ctx, lineP(-5, groundY, w + 5, groundY), 2);
  dotFade(ctx, 0, w, groundY, groundY + 24, '#31283a', 6);
}

// ------------------------------------------------------------------ street

export function street(ctx, w, h, R) {
  const groundY = h - 44;
  bandSky(ctx, 0, w, [
    { c: '#3b0c14', y: 0 },
    { c: '#741820', y: h * 0.2 },
    { c: '#b8352a', y: h * 0.42 },
    { c: '#e5813e', y: h * 0.62, blend: 90 },
  ], 110, 10);
  // big sick sun / blood moon
  const sx = R.r(0.15, 0.85) * w, sy = h * R.r(0.2, 0.3), sr = Math.max(40, Math.min(90, w * 0.06));
  glow(ctx, sx, sy, sr * 2.4, '#f0a060', { from: 0.35, spacing: 8 });
  inked(ctx, circP(sx, sy, sr), '#f4c070', 2.2);
  dotsIn(ctx, circP(sx, sy, sr), '#e39a55', 5, 1.2);

  // smoke plumes
  const nplume = Math.max(2, Math.round(w / 450));
  const plumeXs = [];
  for (let i = 0; i < nplume; i++) {
    const px = ((i + R.r(0.2, 0.8)) / nplume) * w;
    plumeXs.push(px);
    const sm = smoke(ctx, R, px, h * 0.62, { r: R.r(28, 40), n: 8, drift: R.r(10, 40), grow: 1.2, fill: '#3a1a22', lw: 2.2 });
    // fire-lit undersides + dotted shadow tops
    crescent(ctx, sm, 0, -16, '#6a2224');
    crescent(ctx, sm, 0, -7, '#b04a2c');
    ctx.save(); ctx.clip(sm);
    const top = P(); top.rect(-1e4, -1e4, 2e4, 2e4); top.addPath(sm, new DOMMatrix().translate(-10, 14));
    ctx.fillStyle = halftone(ctx, '#1f0b10', 6, 1.8); ctx.fill(top, 'evenodd');
    ctx.restore();
  }

  // far ruined skyline
  skyline(ctx, R, {
    x0: -20, x1: w + 20, base: groundY - 40, hMin: h * 0.2, hMax: h * 0.5, wMin: 60, wMax: 130, peak: 1.3,
    kinds: ['broken', 'broken', 'flat', 'step', 'antenna', 'broken'],
    fill: '#5e1e24', lw: 1.3, ink: '#3a1016',
    onBuilding: (b) => windows(ctx, R, b, { ww: 4, wh: 6, gx: 6, gy: 7, litP: 0.1, lit: '#f0a050', dark: '#4a151b', pad: 6, padTop: 26 }),
  });
  // tilted, snapped skyscraper
  const tx = R.r(0.2, 0.8) * w;
  ctx.save();
  ctx.translate(tx, groundY - 40);
  ctx.rotate(R.sign() * R.r(0.12, 0.2));
  const tower = P();
  polyP([[-45, 20], [-45, -h * 0.55], [-20, -h * 0.58], [-5, -h * 0.52], [12, -h * 0.6], [30, -h * 0.5], [45, -h * 0.54], [45, 20]], true, tower);
  fillP(ctx, tower, '#3e1117');
  strokeP(ctx, tower, 2);
  const wn = P();
  for (let y = -h * 0.48; y < -20; y += 16) for (let x = -36; x < 36; x += 14) if (R() < 0.8) wn.rect(x, y, 7, 9);
  fillP(ctx, wn, '#1f070b');
  fire(ctx, R, 0, -h * 0.52, 70, 70, { colors: ['#e0401f', '#ff9a1f', '#ffe26a'], lw: 2 });
  ctx.restore();

  // near burning buildings (big dark silhouettes)
  skyline(ctx, R, {
    x0: -40, x1: w + 40, base: groundY + 4, hMin: h * 0.18, hMax: h * 0.4, wMin: 130, wMax: 240,
    kinds: ['broken', 'flat', 'broken', 'step'],
    fill: '#2a0f14', lw: 2.4, ink: INK,
    onBuilding: (b) => {
      const holes = P(), lit = P();
      const cols = Math.floor((b.w - 20) / 34);
      for (let y = b.top + 30; y < groundY - 140; y += 52) {
        for (let c = 0; c < cols; c++) {
          const x = b.x + 14 + c * 34;
          if (R() < 0.25) continue;
          (R() < 0.12 ? lit : holes).rect(x, y, 18, 28);
        }
      }
      fillP(ctx, holes, '#12060a');
      fillP(ctx, lit, '#f08a3a');
      strokeP(ctx, lit, 1.4);
      if (R() < 0.55) fire(ctx, R, b.x + b.w * R.r(0.25, 0.75), b.top + 6, R.r(50, 90), R.r(50, 110), { lw: 2 });
    },
  });

  // wrecked car + overturned bus silhouettes on the street
  const wrecks = Math.max(1, Math.round(w / 500));
  for (let i = 0; i < wrecks; i++) {
    const cx = ((i + R.r(0.2, 0.8)) / wrecks) * w;
    ctx.save();
    ctx.translate(cx, groundY - 2);
    ctx.rotate(R.r(-0.08, 0.08));
    const car = P();
    if (R.chance(0.5)) {
      // flipped car
      car.moveTo(-70, -8); car.lineTo(-64, -34); car.lineTo(-30, -38); car.lineTo(-16, -62); car.lineTo(30, -62); car.lineTo(46, -38); car.lineTo(72, -34); car.lineTo(74, -8); car.closePath();
      circP(-40, -44, 12, car); circP(44, -44, 12, car);
    } else {
      // bus on its side
      car.rect(-110, -70, 220, 66);
      car.rect(-116, -60, 8, 30);
    }
    fillP(ctx, car, '#3a1519');
    strokeP(ctx, car, 2);
    const wl = P();
    for (let x = -90; x < 90; x += 34) wl.rect(x, -60, 22, 18);
    clipped(ctx, car, () => fillP(ctx, wl, '#1d0a0d'));
    fire(ctx, R, R.r(-30, 30), -40, 60, R.r(40, 80), { lw: 2 });
    ctx.restore();
  }
  // leaning lamp posts
  for (let i = 0; i < 2; i++) {
    const lx = R() * w;
    ctx.save();
    ctx.translate(lx, groundY);
    ctx.rotate(R.r(-0.35, 0.35));
    const lp = P();
    lp.rect(-3, -200, 6, 200);
    lp.moveTo(-3, -200); lp.quadraticCurveTo(-3, -222, 26, -220); lp.lineTo(26, -214); lp.quadraticCurveTo(3, -214, 3, -200);
    lp.rect(20, -216, 20, 8);
    fillP(ctx, lp, '#1a0a0e');
    strokeP(ctx, lp, 1.4);
    ctx.restore();
  }

  // embers
  const emb = P();
  for (let i = 0; i < w / 18; i++) {
    const ex = R() * w, ey = R() * groundY;
    ellP(ex, ey, 1.5 + R() * 1.5, 0.8 + R(), R() * 3, emb);
  }
  fillP(ctx, emb, '#ffc36a');

  // ground: cracked asphalt
  const g = rectP(-5, groundY, w + 10, h - groundY + 5);
  fillP(ctx, g, '#4b3035');
  strokeP(ctx, lineP(-5, groundY, w + 5, groundY), 2);
  dotFade(ctx, 0, w, groundY, groundY + 22, '#3a2227', 6);
}

// ------------------------------------------------------------------ hospital

export function hospital(ctx, w, h, R) {
  const floorY = h - 38;
  const railY = floorY - 118;
  const ceilH = 46;
  // tiled wall: grimy and dim, with pools of sick fluorescent light
  fillP(ctx, rectP(0, 0, w, railY), '#a3ae8c');
  const nf = Math.max(2, Math.round(w / 300));
  const broken = R.i(0, nf - 1);
  const pools = P();
  for (let i = 0; i < nf; i++) {
    if (i === broken) continue;
    const fx = ((i + 0.5) / nf) * w;
    polyP([[fx - 70, ceilH], [fx + 70, ceilH], [fx + 70 + (floorY - ceilH) * 0.4, floorY], [fx - 70 - (floorY - ceilH) * 0.4, floorY]], true, pools);
  }
  fillP(ctx, pools, '#cbd4b4');
  const tiles = P();
  for (let y = ceilH; y < railY; y += 22) { tiles.moveTo(0, y); tiles.lineTo(w, y); }
  for (let x = 0; x < w; x += 22) { tiles.moveTo(x, ceilH); tiles.lineTo(x, railY); }
  strokeP(ctx, tiles, 1, '#8f9a7a');
  // grime creeping up from the rail and down from the ceiling
  halftoneGradient(ctx, 0, ceilH, w, railY - ceilH, '#858c68', { spacing: 8, dir: 'down', from: 0.55, maxR: 3.4 });
  halftoneGradient(ctx, 0, ceilH, w, 120, '#858c68', { spacing: 8, dir: 'up', from: 0.4, maxR: 3.4 });
  // grime streaks
  const streaks = P();
  for (let i = 0; i < w / 70; i++) {
    const sx = R() * w, sl = R.r(40, 160);
    streaks.moveTo(sx, ceilH); streaks.quadraticCurveTo(sx + R.r(-4, 4), ceilH + sl * 0.5, sx + R.r(-3, 3), ceilH + sl);
  }
  ctx.save(); ctx.globalAlpha = 0.5; strokeP(ctx, streaks, 3, '#8a916c'); ctx.restore();
  // broken tiles: dark holes with cracks
  const holes = P(), cr = P();
  for (let i = 0; i < w / 110; i++) {
    const tx = Math.floor(R() * w / 22) * 22, ty = ceilH + 22 + Math.floor(R() * (railY - ceilH - 66) / 22) * 22;
    holes.rect(tx + 1, ty + 1, 20, 20);
    if (R() < 0.5) holes.rect(tx + 23, ty + 1, 20, 20);
    for (let k = 0; k < 3; k++) { const a = R() * TAU; cr.moveTo(tx + 11, ty + 11); cr.lineTo(tx + 11 + Math.cos(a) * R.r(18, 36), ty + 11 + Math.sin(a) * R.r(18, 36)); }
  }
  fillP(ctx, holes, '#4e5444');
  strokeP(ctx, cr, 1.1, '#5d6450');
  // wainscot
  const wain = rectP(-5, railY, w + 10, floorY - railY);
  fillP(ctx, wain, '#5a7a70');
  dotFade(ctx, 0, w, floorY, railY + 20, '#4a665d', 7);
  inked(ctx, rectP(-5, railY - 6, w + 10, 10), '#7e9b8f', 2);
  drips(ctx, R, 0, w, railY + 4, 40, '#4c5f4f', { p: 0.25 });

  const slots = spans(20, w - 20);
  { const bfx = ((broken + 0.5) / nf) * w; slots.mark(bfx - 70, bfx + 60); }

  // ward doors
  const dw = 150, dh = 210;
  const dxs = slots.take(R, dw + 30, 20);
  const dx = dxs != null ? dxs + 15 : w / 2 - dw / 2;
  inked(ctx, rectP(dx - 12, floorY - dh - 12, dw + 24, dh + 12), '#7c8a80', 2);
  inked(ctx, rectP(dx, floorY - dh, dw, dh), '#8fa39b', 2);
  strokeP(ctx, lineP(dx + dw / 2, floorY - dh, dx + dw / 2, floorY), 2);
  for (const ox of [dw * 0.25, dw * 0.75]) {
    inked(ctx, circP(dx + ox, floorY - dh + 60, 27), '#b6c2bc', 1.8);
    inked(ctx, circP(dx + ox, floorY - dh + 60, 22), '#1b2420', 2);
    fillP(ctx, polyP([[dx + ox - 12, floorY - dh + 50], [dx + ox - 4, floorY - dh + 44], [dx + ox + 8, floorY - dh + 74], [dx + ox, floorY - dh + 78]]), 'rgba(255,255,255,0.25)');
    inked(ctx, rectP(dx + ox - 20, floorY - dh + 110, 40, 8), '#b6c2bc', 1.4);
  }
  // glowing eyes behind one porthole
  const eyes = P(); circP(dx + dw * 0.75 - 6, floorY - dh + 62, 2.6, eyes); circP(dx + dw * 0.75 + 6, floorY - dh + 62, 2.6, eyes);
  fillP(ctx, eyes, '#d6ff5c');
  const plate = rectP(dx + dw / 2 - 60, floorY - dh - 56, 120, 32);
  inked(ctx, plate, '#e8e4cc', 2);
  letters(ctx, 'WARD ' + R.pick(['13', 'B', '6', 'X', '9']), dx + dw / 2, floorY - dh - 39, 24, '#3a4a42');
  const hp = P();
  handPath(dx + dw * 0.3, floorY - dh + 150, 14, 0.2, hp);
  handPath(dx + dw * 0.62, floorY - dh + 135, 13, -0.1, hp);
  fillP(ctx, hp, '#8e1c1c');
  const smear = P();
  smear.moveTo(dx + dw * 0.26, floorY - dh + 160); smear.lineTo(dx + dw * 0.22, floorY - 40);
  smear.moveTo(dx + dw * 0.33, floorY - dh + 160); smear.lineTo(dx + dw * 0.3, floorY - 50);
  smear.moveTo(dx + dw * 0.6, floorY - dh + 145); smear.lineTo(dx + dw * 0.64, floorY - 60);
  ctx.save(); ctx.globalAlpha = 0.75; strokeP(ctx, smear, 6, '#8e1c1c'); ctx.restore();
  // EXIT sign over the door
  inked(ctx, rrectP(dx + dw / 2 - 38, ceilH + 14, 76, 28, 4), '#2b2b2b', 2);
  letters(ctx, 'EXIT', dx + dw / 2, ceilH + 29, 22, '#ff5a4a');

  // blood scrawl
  const sw = Math.min(300, w * 0.4);
  const sx = slots.take(R, sw, 10);
  if (sx != null) {
    const sy = ceilH + R.r(70, 120);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-0.06);
    letters(ctx, R.pick(["THEY'RE INSIDE", "DON'T OPEN", 'NO ESCAPE', 'RUN!!']), 0, 0, 40, '#8e1c1c', { align: 'left', maxW: sw });
    ctx.restore();
    drips(ctx, R, sx + 6, sx + sw * 0.8, sy + 14, 36, '#8e1c1c', { p: 0.2, up: 0 });
    const hp2 = P(); handPath(sx + sw * R.r(0.2, 0.8), sy + 90, 15, R.r(-0.4, 0.4), hp2); fillP(ctx, hp2, '#8e1c1c');
  }

  // x-ray lightbox
  const lx = slots.take(R, 140, 20);
  if (lx != null) {
    const ly = ceilH + 150;
    const lb = rectP(lx + 10, ly, 120, 90);
    inked(ctx, rectP(lx + 2, ly - 8, 136, 106), '#5d6760', 2);
    fillP(ctx, lb, '#dff2f0');
    glowRect(ctx, lx + 10, ly, 120, 90, '#9fc9c8', { spacing: 5, dir: 'radial', from: 0.4 });
    const ribs = P(), c = lx + 70;
    for (let i = 0; i < 6; i++) { ribs.moveTo(c, ly + 18 + i * 10); ribs.quadraticCurveTo(c - 30, ly + 14 + i * 10, c - 34, ly + 26 + i * 10); ribs.moveTo(c, ly + 18 + i * 10); ribs.quadraticCurveTo(c + 30, ly + 14 + i * 10, c + 34, ly + 26 + i * 10); }
    ribs.moveTo(c, ly + 10); ribs.lineTo(c, ly + 84);
    strokeP(ctx, ribs, 2.2, '#3c4a4c');
    strokeP(ctx, lb, 1.6);
  }

  // privacy curtain on a ceiling track
  const cwid = R.r(170, 230);
  const cx0 = slots.take(R, cwid + 20, 10);
  const cy0 = ceilH + 8;
  if (cx0 != null) {
    const x0 = cx0 + 10, bot = floorY - R.r(40, 70);
    inked(ctx, rectP(x0 - 20, cy0, cwid + 40, 6), '#9aa39c', 1.6);
    const cur = P();
    cur.moveTo(x0, cy0 + 6);
    const folds = Math.round(cwid / 22);
    cur.lineTo(x0 + cwid, cy0 + 6);
    cur.lineTo(x0 + cwid + 6, bot);
    for (let k = folds; k >= 0; k--) {
      const fx = x0 + (k / folds) * cwid;
      cur.quadraticCurveTo(fx + cwid / folds / 2 + 3, bot + (k % 2 ? 10 : -4), fx - 3, bot);
    }
    cur.closePath();
    fillP(ctx, cur, '#a4c2bb');
    clipped(ctx, cur, () => {
      const f = P();
      for (let k = 0; k < folds; k += 1) f.rect(x0 + (k / folds) * cwid + 8, cy0, 7, bot - cy0 + 20);
      fillP(ctx, f, '#86a69f');
      halftoneGradient(ctx, x0, cy0, cwid + 10, bot - cy0 + 20, '#6f8f88', { spacing: 6, dir: 'down', from: 0.5, maxR: 2.6 });
      // silhouette of something shambling behind it
      const sil = P();
      const scx = x0 + cwid * R.r(0.3, 0.7), sb = bot;
      circP(scx + 8, sb - 150, 15, sil);
      sil.moveTo(scx - 20, sb); sil.lineTo(scx - 16, sb - 80); sil.lineTo(scx - 8, sb - 130); sil.lineTo(scx + 20, sb - 132); sil.lineTo(scx + 60, sb - 118); sil.lineTo(scx + 62, sb - 108); sil.lineTo(scx + 24, sb - 110); sil.lineTo(scx + 20, sb - 70); sil.lineTo(scx + 24, sb); sil.closePath();
      fillP(ctx, sil, 'rgba(40,60,56,0.55)');
      const b = P();
      b.moveTo(x0 + cwid * 0.2, bot + 20);
      b.quadraticCurveTo(x0 + cwid * 0.3, bot - 70, x0 + cwid * 0.5, bot - 20);
      b.quadraticCurveTo(x0 + cwid * 0.6, bot - 50, x0 + cwid * 0.8, bot + 20);
      b.closePath();
      fillP(ctx, b, '#8e1c1c');
    });
    strokeP(ctx, cur, 2);
    const rings = P();
    for (let k = 0; k <= folds; k++) circP(x0 + (k / folds) * cwid, cy0 + 8, 3, rings);
    strokeP(ctx, rings, 1.4);
  }

  // ceiling + fluorescent fixtures
  fillP(ctx, rectP(-5, -5, w + 10, ceilH + 5), '#3a443e');
  strokeP(ctx, lineP(-5, ceilH, w + 5, ceilH), 2);
  for (let i = 0; i < nf; i++) {
    const fx = ((i + 0.5) / nf) * w;
    if (i === broken) {
      ctx.save();
      ctx.translate(fx - 60, ceilH);
      strokeP(ctx, lineP(0, 0, 0, 30), 1.4);
      ctx.translate(0, 30);
      ctx.rotate(0.5);
      inked(ctx, rrectP(-4, -6, 124, 14, 3), '#8a948c', 2);
      fillP(ctx, rectP(4, 8, 108, 5), '#6f7a73');
      ctx.restore();
      const spk = P();
      const sx2 = fx - 60 + Math.cos(0.5) * 120, sy2 = ceilH + 30 + Math.sin(0.5) * 120;
      for (let k = 0; k < 7; k++) { const a = R() * TAU; spk.moveTo(sx2, sy2); spk.lineTo(sx2 + Math.cos(a) * R.r(8, 22), sy2 + Math.sin(a) * R.r(8, 22)); }
      strokeP(ctx, spk, 3.4, INK);
      strokeP(ctx, spk, 1.8, '#fff3a0');
    } else {
      inked(ctx, rrectP(fx - 64, ceilH - 4, 128, 16, 3), '#8a948c', 2);
      inked(ctx, rrectP(fx - 58, ceilH + 8, 116, 7, 3), '#f4ffe6', 1.4);
    }
  }
  // floor
  const fl = rectP(-5, floorY, w + 10, h - floorY + 5);
  fillP(ctx, fl, '#8b907c');
  clipped(ctx, fl, () => {
    const ch = P();
    for (let x = 0; x < w; x += 36) ch.rect(x, floorY + ((Math.floor(x / 36) % 2) ? 0 : 19), 36, 19);
    fillP(ctx, ch, '#767b68');
  });
  strokeP(ctx, lineP(-5, floorY, w + 5, floorY), 2);
  vignette(ctx, w, h, '#26302b', { spacing: 10 });
}

// ------------------------------------------------------------------ mall

export function mall(ctx, w, h, R) {
  const floorY = h - 40;
  const upperY = Math.round(h * R.r(0.44, 0.5));
  const wall = '#3b3752';
  fillP(ctx, rectP(0, 0, w, h), wall);

  // skylight roof
  const skyH = Math.max(80, h * 0.14);
  const sky = rectP(-5, -5, w + 10, skyH + 5);
  fillP(ctx, sky, '#20284a');
  clipped(ctx, sky, () => {
    stars(ctx, R, 0, 0, w, skyH, w / 12, '#9fb0e8', { r: 0.8, twinkles: 2 });
    const cr = P();
    for (let i = 0; i < 4; i++) {
      const cx = R() * w, cy = R() * skyH;
      for (let k = 0; k < 5; k++) { const a = R() * TAU; cr.moveTo(cx, cy); cr.lineTo(cx + Math.cos(a) * R.r(20, 60), cy + Math.sin(a) * R.r(20, 60)); }
    }
    strokeP(ctx, cr, 1, '#9fb0e8');
  });
  const grid = P();
  for (let x = 0; x < w; x += 70) grid.rect(x - 3, 0, 6, skyH);
  grid.rect(0, skyH / 2 - 3, w, 6);
  inked(ctx, grid, '#4b4668', 1.2);
  inked(ctx, rectP(-5, skyH, w + 10, 16), '#5a5478', 2);

  // moonlight shafts
  for (let i = 0; i < Math.max(2, Math.round(w / 380)); i++) {
    const bx = R() * w;
    beam(ctx, bx, skyH, Math.PI / 2 + R.r(0.25, 0.4), h * 1.2, 0.09, '#c9d6ff', { alpha: 0.1, w0: 40, core: true });
  }

  // upper storefronts
  const sfTop = skyH + 70;
  const shops = ['SHOES', 'PIZZA', 'ARCADE', 'VIDEO', 'RECORDS', 'CANDY', 'TOYS', 'GAMES', 'CAFE', 'SALON'];
  const neonCols = ['#ff5fa2', '#6ee07a', '#5fd8ff', '#ffd34a', '#c77dff'];
  let x = R.r(-60, 0);
  while (x < w) {
    const sw = R.r(170, 260);
    const f = rectP(x + 8, sfTop, sw - 16, upperY - sfTop);
    fillP(ctx, f, '#2a2640');
    const win = rectP(x + 20, sfTop + 50, sw - 40, upperY - sfTop - 50);
    fillP(ctx, win, '#1b1830');
    clipped(ctx, win, () => {
      // broken glass shards
      const sh = P();
      const cx = x + 20 + R() * (sw - 40), cy = sfTop + 60 + R() * 40;
      for (let k = 0; k < 7; k++) { const a = R() * TAU; sh.moveTo(cx, cy); sh.lineTo(cx + Math.cos(a) * 90, cy + Math.sin(a) * 90); }
      strokeP(ctx, sh, 1.2, '#5a5578');
      fillP(ctx, polyP([[x + 30, upperY], [x + 50, upperY], [x + 110, sfTop + 50], [x + 90, sfTop + 50]]), 'rgba(160,170,230,0.14)');
    });
    strokeP(ctx, win, 1.8);
    strokeP(ctx, f, 2);
    const col = R.pick(neonCols);
    const on = R() < 0.6;
    neon(ctx, R.pick(shops), x + sw / 2, sfTop + 26, 30, col, { off: !on, offColor: '#524c6e', haloAlpha: 0.16 });
    x += sw;
  }

  // big broken MEGA MALL sign on the upper wall
  const title = R.pick(['MEGA MALL', 'GALLERIA', 'PLAZA', 'SUPERMALL']);
  const tx = R.r(0.3, 0.7) * w, ty = skyH + 36;
  inked(ctx, rrectP(tx - title.length * 16, ty - 26, title.length * 32, 52, 8), '#221e36', 2);
  // draw letters individually; some dead
  ctx.save();
  ctx.font = '44px Bangers, Impact, sans-serif';
  const tw = ctx.measureText(title).width;
  ctx.restore();
  let lx = tx - tw / 2;
  for (const ch of title) {
    ctx.save();
    ctx.font = '44px Bangers, Impact, sans-serif';
    const cw = ctx.measureText(ch).width;
    ctx.restore();
    const dead = ch !== ' ' && R() < 0.25;
    neon(ctx, ch, lx + cw / 2, ty + 2, 44, '#ff5fa2', { off: dead, offColor: '#5a3a58', haloAlpha: 0.2 });
    lx += cw;
  }

  // upper walkway slab + glass balustrade
  const slab = rectP(-5, upperY, w + 10, 28);
  inked(ctx, slab, '#56507a', 2);
  fillP(ctx, rectP(-5, upperY + 20, w + 10, 8), '#433e62');
  const bal = rectP(-5, upperY - 46, w + 10, 46);
  ctx.save(); ctx.globalAlpha = 0.28; fillP(ctx, bal, '#8fa0d8'); ctx.restore();
  const posts = P();
  for (let px = 0; px < w; px += 90) posts.rect(px - 2, upperY - 46, 4, 46);
  fillP(ctx, posts, '#8a86a8');
  inked(ctx, rectP(-5, upperY - 50, w + 10, 6), '#a9a5c4', 1.6);
  // broken balustrade section
  const bx0 = R.r(0.1, 0.8) * w;
  fillP(ctx, rectP(bx0, upperY - 44, 80, 44), wall);
  fillP(ctx, polyP([[bx0, upperY - 44], [bx0 + 14, upperY - 30], [bx0 + 4, upperY - 12], [bx0 + 18, upperY]]), 'rgba(143,160,216,0.28)');

  // lower level: storefront gates
  const lowTop = upperY + 28;
  x = R.r(-80, 0);
  while (x < w) {
    const sw = R.r(200, 300);
    const open = R.r(0.25, 0.7);
    const f = rectP(x + 10, lowTop + 40, sw - 20, floorY - lowTop - 40);
    fillP(ctx, f, '#25203a');
    clipped(ctx, f, () => {
      const sh = P();
      for (let y = lowTop + 70; y < floorY; y += 34) sh.rect(x + 16, y, sw - 32, 4);
      fillP(ctx, sh, '#35304e');
      const junk = P();
      for (let i = 0; i < 6; i++) junk.rect(x + 20 + R() * (sw - 50), lowTop + 70 + Math.floor(R() * 4) * 34 - 14, R.r(8, 20), 14);
      fillP(ctx, junk, '#3e3858');
    });
    const gate = rectP(x + 10, lowTop + 40, sw - 20, (floorY - lowTop - 40) * open);
    fillP(ctx, gate, '#6d6888');
    clipped(ctx, gate, () => {
      const sl = P();
      for (let y = lowTop + 40; y < floorY; y += 7) sl.rect(x, y, sw, 2);
      fillP(ctx, sl, '#524d6e');
      // dent
      fillP(ctx, ellP(x + sw * R.r(0.3, 0.7), lowTop + 40 + (floorY - lowTop - 40) * open * 0.7, 26, 16), '#57526f');
    });
    strokeP(ctx, gate, 1.8);
    strokeP(ctx, f, 2);
    const col = R.pick(neonCols);
    neon(ctx, R.pick(shops), x + sw / 2, lowTop + 20, 24, col, { off: R() < 0.5, offColor: '#524c6e', haloAlpha: 0.14 });
    x += sw;
  }

  // dead escalator
  const eDir = R.sign();
  const eW = Math.min(w * 0.4, 380);
  const ex = eDir > 0 ? R.r(0.05, 0.2) * w : w - R.r(0.05, 0.2) * w - eW;
  const e0x = eDir > 0 ? ex : ex + eW, e1x = eDir > 0 ? ex + eW : ex;
  const esc = polyP([[e0x, floorY], [e0x + eDir * 50, floorY], [e1x, upperY + 30], [e1x, upperY - 2], [e1x - eDir * 36, upperY - 2], [e0x, floorY - 40]]);
  fillP(ctx, esc, '#4f4a6c');
  clipped(ctx, esc, () => {
    const st = P();
    for (let t = 0; t < 1; t += 0.05) {
      const sx = e0x + (e1x - e0x) * t, sy = floorY - 20 + (upperY - floorY + 20) * t;
      st.moveTo(sx, sy); st.lineTo(sx + eDir * 30, sy);
    }
    strokeP(ctx, st, 1.2, '#35314c');
  });
  strokeP(ctx, esc, 2);
  const rail = P();
  rail.moveTo(e0x - eDir * 10, floorY - 70);
  rail.lineTo(e1x - eDir * 24, upperY - 60);
  ctx.save(); ctx.lineCap = 'round';
  strokeP(ctx, rail, 12, INK);
  strokeP(ctx, rail, 7, '#2a2638');
  ctx.restore();
  const side2 = polyP([[e0x, floorY], [e0x, floorY - 70], [e1x - eDir * 24, upperY - 60], [e1x - eDir * 24, upperY - 2]]);
  ctx.save(); ctx.globalAlpha = 0.3; fillP(ctx, side2, '#8fa0d8'); ctx.restore();
  strokeP(ctx, side2, 1.6);

  // columns
  for (let cx = R.r(120, 260); cx < w; cx += R.r(320, 460)) {
    if (Math.abs(cx - (ex + eW / 2)) < eW / 2 + 30) continue;
    const col = rectP(cx - 18, upperY + 28, 36, floorY - upperY - 28);
    solid(ctx, col, '#6a6590', { lx: -6, ly: 0, lw: 2 });
    inked(ctx, rectP(cx - 24, upperY + 28, 48, 12), '#7a75a0', 2);
    inked(ctx, rectP(cx - 24, floorY - 12, 48, 12), '#7a75a0', 2);
  }
  // floor
  const fl = rectP(-5, floorY, w + 10, h - floorY + 5);
  fillP(ctx, fl, '#5c5778');
  clipped(ctx, fl, () => {
    const tl = P();
    for (let x2 = 0; x2 < w; x2 += 50) { tl.moveTo(x2, floorY); tl.lineTo(x2 - 14, h); }
    tl.moveTo(0, floorY + 18); tl.lineTo(w, floorY + 18);
    strokeP(ctx, tl, 1, '#4b4666');
    const refl = P();
    for (let i = 0; i < w / 120; i++) refl.rect(R() * w, floorY + 4, R.r(4, 10), 34);
    fillP(ctx, refl, 'rgba(255,95,162,0.25)');
  });
  strokeP(ctx, lineP(-5, floorY, w + 5, floorY), 2);
  // trash
  speckle(ctx, R, 0, floorY - 6, w, 8, w / 20, '#2a2638', 3);
  vignette(ctx, w, h, '#1b1828', { from: 0.6, spacing: 10 });
}
