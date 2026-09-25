// HORROR backdrops: graveyard, street, hospital, mall.

import {
  INK, TAU, shade, mix, rgba, halftoneGradient, cloudPath, halftone,
  P, rectP, circP, ellP, polyP, rrectP, lineP, fillP, strokeP, inked, dotsIn, clipped, crescent,
  bandSky, dotFade, stars, moon, glow, glowRect, beam, cloudBank, skyline, windows,
  letters, neon, solid, fire, smoke, fogBand, deadTree, ironFence, drips, batPath, hillPath, handPath, spans, ringGlow,
} from './kit.js';

// ---------------------------------------------------------------- graveyard

function tombSil(ctx, x, base, w, h, kind, fill, lw, R) {
  const p = P();
  const tilt = (R() - 0.5) * 0.16;
  if (kind === 0) {
    p.moveTo(x - w / 2, base);
    p.lineTo(x - w / 2, base - h + w / 2);
    p.arc(x, base - h + w / 2, w / 2, Math.PI, 0);
    p.lineTo(x + w / 2, base);
    p.closePath();
  } else if (kind === 1) {
    const t = w * 0.28;
    polyP([[x - t / 2, base], [x - t / 2, base - h * 0.62], [x - w / 2, base - h * 0.62], [x - w / 2, base - h * 0.62 - t], [x - t / 2, base - h * 0.62 - t], [x - t / 2, base - h], [x + t / 2, base - h], [x + t / 2, base - h * 0.62 - t], [x + w / 2, base - h * 0.62 - t], [x + w / 2, base - h * 0.62], [x + t / 2, base - h * 0.62], [x + t / 2, base]], true, p);
  } else if (kind === 2) {
    polyP([[x - w * 0.32, base], [x - w * 0.22, base - h * 0.85], [x, base - h], [x + w * 0.22, base - h * 0.85], [x + w * 0.32, base]], true, p);
    p.rect(x - w * 0.45, base - h * 0.12, w * 0.9, h * 0.12);
  } else {
    polyP([[x - w / 2, base], [x - w / 2, base - h * 0.8], [x - w * 0.3, base - h * 0.8], [x - w * 0.3, base - h * 0.92], [x, base - h], [x + w * 0.3, base - h * 0.92], [x + w * 0.3, base - h * 0.8], [x + w / 2, base - h * 0.8], [x + w / 2, base]], true, p);
  }
  const q = P();
  q.addPath(p, new DOMMatrix().translate(x, base).rotate((tilt * 180) / Math.PI).translate(-x, -base));
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
  stars(ctx, R, 0, 0, w, h * 0.4, Math.round(w * h / 16000), '#cbbde6', { r: 0.9, pow: 1.5, big: 5, twinkles: 3 });

  // focal: the huge full moon with a cloud streak and a few bats
  const mr = Math.max(80, Math.min(190, Math.min(w, h) * R.r(0.17, 0.23)));
  const mx = R.r(0.25, 0.75) * w, my = Math.max(mr + 20, h * R.r(0.24, 0.3));
  moon(ctx, R, mx, my, mr, { color: '#ecefc4', dots: '#b9c28e', shade: '#d7dcae', crater: '#dde2b4', halo: ['#2f2049', '#3b2a58', '#48366a'], haloStep: 0.16, lw: 2.4, phase: 0.3 });
  // a thin wisp of cloud across the lower moon
  const cy = my + mr * R.r(0.45, 0.62), cx = mx + R.r(-0.3, 0.3) * mr;
  const st = P();
  st.moveTo(cx - mr * 1.5, cy + 2);
  st.quadraticCurveTo(cx - mr * 0.4, cy - 9, cx + mr * 0.6, cy - 4);
  st.quadraticCurveTo(cx + mr * 1.1, cy - 2, cx + mr * 1.4, cy + 3);
  st.quadraticCurveTo(cx + mr * 0.3, cy + 5, cx - mr * 1.5, cy + 2);
  st.moveTo(cx - mr * 0.6, cy + 16);
  st.quadraticCurveTo(cx + mr * 0.2, cy + 8, cx + mr * 1.0, cy + 14);
  st.quadraticCurveTo(cx + mr * 0.2, cy + 19, cx - mr * 0.6, cy + 16);
  strokeP(ctx, st, 2.4, INK);
  fillP(ctx, st, '#3a2a55');
  const bats = P();
  for (let i = 0; i < R.i(2, 4); i++) {
    const a = R() * TAU, d = R.r(0.3, 1.3) * mr;
    batPath(mx + Math.cos(a) * d, my + Math.sin(a) * d * 0.7, R.r(18, 34), R(), bats);
  }
  fillP(ctx, bats, '#140d1f');

  // far hill with chapel, flat silhouette
  const hillY = h * R.r(0.6, 0.66);
  const hpts = [];
  for (let i = 0; i <= 5; i++) hpts.push([(i / 5) * w * 1.1 - w * 0.05, hillY + R.r(-50, 30)]);
  const hill = hillPath(hpts, h + 10);
  fillP(ctx, hill, '#2c2140');
  strokeP(ctx, hill, 1.4, '#1a1226');
  const chX = Math.abs(R.r(0.12, 0.88) * w - mx) < mr ? (mx > w / 2 ? w * 0.2 : w * 0.8) : R.r(0.12, 0.88) * w;
  const chY = hillY + 12;
  const ch = P();
  ch.rect(chX - 60, chY - 70, 120, 72);
  polyP([[chX - 70, chY - 68], [chX, chY - 120], [chX + 70, chY - 68]], true, ch);
  ch.rect(chX + 34, chY - 150, 30, 90);
  polyP([[chX + 30, chY - 148], [chX + 49, chY - 205], [chX + 68, chY - 148]], true, ch);
  ch.rect(chX + 47, chY - 225, 4, 22);
  ch.rect(chX + 41, chY - 217, 16, 4);
  fillP(ctx, ch, '#1c1429');
  const cw = P();
  cw.moveTo(chX - 30, chY - 20); cw.lineTo(chX - 30, chY - 42); cw.arc(chX - 24, chY - 42, 6, Math.PI, 0); cw.lineTo(chX - 18, chY - 20); cw.closePath();
  circP(chX + 49, chY - 125, 7, cw);
  fillP(ctx, cw, '#c9cf78');
  for (let i = 0; i < 2; i++) {
    const tx = R() * w;
    if (Math.abs(tx - chX) < 110) continue;
    deadTree(ctx, R, tx, hillY + 10, R.r(80, 130), '#221832', { depth: 4 });
  }

  // mid mound: tombstones spaced out, fence pushed back and toned down
  const midY = groundY - R.r(110, 140);
  const mpts = [];
  for (let i = 0; i <= 5; i++) mpts.push([(i / 5) * w * 1.1 - w * 0.05, midY + R.r(-16, 16)]);
  const mound = hillPath(mpts, h + 10);
  fillP(ctx, mound, '#3a2f4a');
  strokeP(ctx, mound, 1.8);
  dotFade(ctx, 0, w, groundY, midY + 20, '#332a42', 7);
  ironFence(ctx, -10, w + 10, midY + 10, 58, '#2c2338', { spacing: 20, bar: 2.6, posts: R.r(260, 360) });

  const side = R.chance(0.5) ? R.r(0.04, 0.16) : R.r(0.84, 0.96);
  deadTree(ctx, R, side * w, midY + 26, Math.min(h * 0.72, 540), '#1c1426', { ink: INK, inkW: 3, depth: 6, trunk: 22 });

  const tc = '#6a6380';
  for (let x = R.r(40, 120); x < w - 30; x += R.r(130, 220)) {
    const tw = R.r(32, 46), th = R.r(46, 70), kind = R.i(0, 3);
    const base = midY + R.r(44, 62);
    const t = tombSil(ctx, x, base, tw, th, kind, tc, 0, R);
    crescent(ctx, t, -5, -4, '#5a5470');
    strokeP(ctx, t, 1.8);
  }
  // low fog
  fogBand(ctx, R, 0, groundY - 30, w, 34, '#b7b0cc', { alpha: 0.2, step: 80 });
  // ground
  fillP(ctx, rectP(-5, groundY, w + 10, h - groundY + 5), '#3f3449');
  strokeP(ctx, lineP(-5, groundY, w + 5, groundY), 2);
  dotFade(ctx, 0, w, groundY, groundY + 22, '#352c3f', 6);
  return { air: '#54476e', light: mx < w / 2 ? -1 : 1 };
}

// ------------------------------------------------------------------ street

export function street(ctx, w, h, R) {
  const groundY = h - 44;
  bandSky(ctx, 0, w, [
    { c: '#2a0a14', y: 0 },
    { c: '#561622', y: h * 0.18 },
    { c: '#8e2c2a', y: h * 0.4 },
    { c: '#cf6a3c', y: h * 0.6, blend: 90 },
  ], 110, 10);

  // focal: one burning tower pouring a huge, bending smoke column
  const fx = R.r(0.3, 0.7) * w;
  const lean = R.sign();
  const light = fx < w / 2 ? -1 : 1;
  const sm = smoke(ctx, R, fx, h * 0.34, { r: 38, n: 9, drift: lean * R.r(26, 44), grow: 1.2, fill: '#321519', lw: 2.2 });
  crescent(ctx, sm, 0, -18, '#5e2020');
  crescent(ctx, sm, 0, -8, '#9e3e2a');
  ctx.save(); ctx.clip(sm);
  const top = P(); top.rect(-1e4, -1e4, 2e4, 2e4); top.addPath(sm, new DOMMatrix().translate(-12, 16));
  ctx.fillStyle = halftone(ctx, '#200c10', 6, 1.8); ctx.fill(top, 'evenodd');
  ctx.restore();

  // far city: one flat, hazy tone, broken tops, no windows
  const farC = '#83332f';
  skyline(ctx, R, {
    x0: -20, x1: w + 20, base: groundY - 40, hMin: h * 0.12, hMax: h * 0.3, wMin: 70, wMax: 150,
    kinds: ['broken', 'flat', 'step', 'broken', 'antenna'], fill: farC, lw: 1.1, ink: '#5a1e1e',
  });
  dotFade(ctx, 0, w, groundY - 40, groundY - 40 - h * 0.16, '#6e2a28', 8);
  // the burning tower (mid layer, snapped top)
  const tw = Math.min(120, w * 0.16), th = h * 0.6;
  const tower = P();
  polyP([[fx - tw / 2, groundY], [fx - tw / 2, groundY - th], [fx - tw * 0.2, groundY - th - 18], [fx, groundY - th + 12], [fx + tw * 0.15, groundY - th - 24], [fx + tw / 2, groundY - th + 6], [fx + tw / 2, groundY]], true, tower);
  fillP(ctx, tower, '#3a1418');
  clipped(ctx, tower, () => {
    fillP(ctx, light < 0 ? rectP(fx - tw / 2, 0, tw * 0.25, h) : rectP(fx + tw * 0.25, 0, tw * 0.25, h), '#4e1c1e');
    const wn = P();
    for (let y = groundY - th + 40; y < groundY - 150; y += 34) for (let x = fx - tw / 2 + 14; x < fx + tw / 2 - 16; x += 26) if (R() < 0.7) wn.rect(x, y, 12, 18);
    fillP(ctx, wn, '#220a0d');
  });
  strokeP(ctx, tower, 2);
  fire(ctx, R, fx, groundY - th + 6, tw * 0.9, 80, { lw: 2 });
  const gl = P();
  for (let k = 0; k < 2; k++) { const wy = groundY - th + 50 + k * 68; gl.rect(fx - tw / 2 + 14 + R.i(0, 2) * 26, wy, 12, 18); }
  fillP(ctx, gl, '#e8743a');

  // near ruins: two or three low dark silhouettes, sparse window holes
  const near = P();
  let x = -30;
  while (x < w + 30) {
    const bw = R.r(160, 280), bh = R.r(h * 0.16, h * 0.3);
    if (Math.abs(x + bw / 2 - fx) < tw) { x += bw * 0.6; continue; }
    // blown-out roofline: flat runs broken by collapsed chunks
    const pts = [[x, groundY + 4], [x, groundY - bh]];
    let cx2 = x, cy2 = groundY - bh;
    while (cx2 < x + bw - 20) {
      const run = R.r(30, 70);
      cx2 = Math.min(x + bw, cx2 + run);
      pts.push([cx2, cy2]);
      if (cx2 >= x + bw) break;
      const drop = R.r(-10, 44);
      pts.push([cx2 + R.r(4, 12), cy2 + drop * 0.5 + R.r(-6, 6)]);
      cy2 = Math.max(groundY - bh - 10, Math.min(groundY - 80, cy2 + drop));
      cx2 += R.r(10, 20);
      pts.push([cx2, cy2]);
    }
    pts.push([x + bw, cy2], [x + bw, groundY + 4]);
    polyP(pts, true, near);
    x += bw + R.r(60, 180);
  }
  fillP(ctx, near, '#221013');
  clipped(ctx, near, () => {
    const holes = P();
    for (let y = groundY - h * 0.28; y < groundY - 120; y += 58) for (let x2 = 20; x2 < w; x2 += 48) if (R() < 0.25) holes.rect(x2, y, 20, 30);
    fillP(ctx, holes, '#1a080b');
  });
  strokeP(ctx, near, 2);
  // one far wrecked car
  const cx = R.r(0.15, 0.85) * w;
  if (Math.abs(cx - fx) > tw) {
    const car = P();
    car.moveTo(cx - 60, groundY); car.lineTo(cx - 56, groundY - 22); car.lineTo(cx - 26, groundY - 26); car.lineTo(cx - 14, groundY - 44); car.lineTo(cx + 24, groundY - 44); car.lineTo(cx + 38, groundY - 26); car.lineTo(cx + 60, groundY - 22); car.lineTo(cx + 62, groundY); car.closePath();
    fillP(ctx, car, '#3a1a1e');
    strokeP(ctx, car, 1.6);
  }
  // ground
  fillP(ctx, rectP(-5, groundY, w + 10, h - groundY + 5), '#43302f');
  strokeP(ctx, lineP(-5, groundY, w + 5, groundY), 2);
  dotFade(ctx, 0, w, groundY, groundY + 20, '#382626', 6);
  return { air: '#7a3a36', light };
}

// ------------------------------------------------------------------ hospital

export function hospital(ctx, w, h, R) {
  const floorY = h - 38;
  const railY = floorY - 118;
  const ceilH = 46;
  const nf = Math.max(2, Math.round(w / 320));
  const broken = R.i(0, nf - 1);
  // dim grimy tile wall with pools of sick fluorescent light
  fillP(ctx, rectP(0, 0, w, railY), '#a4ae8e');
  const pools = P();
  for (let i = 0; i < nf; i++) {
    if (i === broken) continue;
    const fx = ((i + 0.5) / nf) * w;
    polyP([[fx - 70, ceilH], [fx + 70, ceilH], [fx + 70 + (floorY - ceilH) * 0.4, floorY], [fx - 70 - (floorY - ceilH) * 0.4, floorY]], true, pools);
  }
  fillP(ctx, pools, '#c6cfb0');
  const tiles = P();
  for (let y = ceilH; y < railY; y += 26) { tiles.moveTo(0, y); tiles.lineTo(w, y); }
  for (let x = 0; x < w; x += 26) { tiles.moveTo(x, ceilH); tiles.lineTo(x, railY); }
  strokeP(ctx, tiles, 1, 'rgba(90,100,70,0.28)');
  halftoneGradient(ctx, 0, ceilH, w, 110, '#8a9170', { spacing: 8, dir: 'up', from: 0.4, maxR: 3.4 });
  // a few broken tiles
  const holes = P();
  for (let i = 0; i < w / 260; i++) {
    const tx = Math.floor(R() * w / 26) * 26, ty = ceilH + 26 + Math.floor(R() * (railY - ceilH - 120) / 26) * 26;
    holes.rect(tx + 1, ty + 1, 24, 24);
    if (R() < 0.5) holes.rect(tx + 27, ty + 1, 24, 24);
  }
  fillP(ctx, holes, '#6e765c');
  // wainscot
  fillP(ctx, rectP(-5, railY, w + 10, floorY - railY), '#62807a');
  inked(ctx, rectP(-5, railY - 6, w + 10, 10), '#809a92', 1.8);
  drips(ctx, R, 0, w, railY + 4, 30, '#566f68', { p: 0.18 });

  const slots = spans(20, w - 20);
  { const bfx = ((broken + 0.5) / nf) * w; slots.mark(bfx - 70, bfx + 60); }

  // focal: WARD doors with something watching through the porthole
  const dw = 150, dh = 210;
  const dxs = slots.take(R, dw + 30, 20);
  const dx = dxs != null ? dxs + 15 : w / 2 - dw / 2;
  inked(ctx, rectP(dx - 12, floorY - dh - 12, dw + 24, dh + 12), '#7c8a80', 2);
  inked(ctx, rectP(dx, floorY - dh, dw, dh), '#8fa39b', 2);
  strokeP(ctx, lineP(dx + dw / 2, floorY - dh, dx + dw / 2, floorY), 2);
  for (const ox of [dw * 0.25, dw * 0.75]) {
    inked(ctx, circP(dx + ox, floorY - dh + 60, 26), '#b6c2bc', 1.8);
    inked(ctx, circP(dx + ox, floorY - dh + 60, 21), '#1b2420', 2);
  }
  const eyes = P(); circP(dx + dw * 0.75 - 6, floorY - dh + 62, 2.6, eyes); circP(dx + dw * 0.75 + 6, floorY - dh + 62, 2.6, eyes);
  fillP(ctx, eyes, '#d6ff5c');
  inked(ctx, rectP(dx + dw / 2 - 58, floorY - dh - 52, 116, 30), '#e8e4cc', 2);
  letters(ctx, 'WARD ' + R.pick(['13', 'B', '6', 'X', '9']), dx + dw / 2, floorY - dh - 36, 22, '#3a4a42');
  const hp = P();
  handPath(dx + dw * 0.3, floorY - dh + 140, 13, 0.2, hp);
  fillP(ctx, hp, '#8e1c1c');
  const smear = P();
  smear.moveTo(dx + dw * 0.27, floorY - dh + 150); smear.lineTo(dx + dw * 0.23, floorY - 50);
  smear.moveTo(dx + dw * 0.34, floorY - dh + 150); smear.lineTo(dx + dw * 0.31, floorY - 60);
  ctx.save(); ctx.globalAlpha = 0.7; strokeP(ctx, smear, 6, '#8e1c1c'); ctx.restore();
  inked(ctx, rrectP(dx + dw / 2 - 34, ceilH + 12, 68, 26, 4), '#2b2b2b', 2);
  letters(ctx, 'EXIT', dx + dw / 2, ceilH + 26, 20, '#e8584a');

  // blood scrawl (up high, out of the fight)
  const sw = Math.min(290, w * 0.36);
  const sx = slots.take(R, sw, 20);
  if (sx != null) {
    const sy = ceilH + R.r(64, 100);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-0.05);
    letters(ctx, R.pick(["THEY'RE INSIDE", "DON'T OPEN", 'NO ESCAPE', 'RUN!!']), 0, 0, 38, '#8e1c1c', { align: 'left', maxW: sw });
    ctx.restore();
    drips(ctx, R, sx + 6, sx + sw * 0.7, sy + 13, 30, '#8e1c1c', { p: 0.18, up: 0 });
  }
  // privacy curtain with a shape behind it (wide rooms only)
  const cwid = R.r(170, 220);
  const cx0 = w > 700 ? slots.take(R, cwid + 20, 20) : null;
  if (cx0 != null) {
    const x0 = cx0 + 10, cy0 = ceilH + 8, bot = floorY - R.r(40, 60);
    inked(ctx, rectP(x0 - 20, cy0, cwid + 40, 6), '#9aa39c', 1.6);
    const cur = P();
    const folds = Math.round(cwid / 26);
    cur.moveTo(x0, cy0 + 6);
    cur.lineTo(x0 + cwid, cy0 + 6);
    cur.lineTo(x0 + cwid + 6, bot);
    for (let k = folds; k >= 0; k--) {
      const fx = x0 + (k / folds) * cwid;
      cur.quadraticCurveTo(fx + cwid / folds / 2 + 3, bot + (k % 2 ? 10 : -4), fx - 3, bot);
    }
    cur.closePath();
    fillP(ctx, cur, '#a8c2bc');
    clipped(ctx, cur, () => {
      const f = P();
      for (let k = 0; k < folds; k++) f.rect(x0 + (k / folds) * cwid + 10, cy0, 8, bot - cy0 + 20);
      fillP(ctx, f, '#95b1aa');
      const sil = P();
      const scx = x0 + cwid * R.r(0.3, 0.6), sb = bot;
      circP(scx + 8, sb - 150, 15, sil);
      sil.moveTo(scx - 20, sb); sil.lineTo(scx - 16, sb - 80); sil.lineTo(scx - 8, sb - 130); sil.lineTo(scx + 20, sb - 132); sil.lineTo(scx + 60, sb - 118); sil.lineTo(scx + 62, sb - 108); sil.lineTo(scx + 24, sb - 110); sil.lineTo(scx + 20, sb - 70); sil.lineTo(scx + 24, sb); sil.closePath();
      fillP(ctx, sil, 'rgba(60,84,78,0.5)');
    });
    strokeP(ctx, cur, 1.8);
  }

  // ceiling + fixtures
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
      ctx.restore();
      const spk = P();
      const sx2 = fx - 60 + Math.cos(0.5) * 120, sy2 = ceilH + 30 + Math.sin(0.5) * 120;
      for (let k = 0; k < 6; k++) { const a = R() * TAU; spk.moveTo(sx2, sy2); spk.lineTo(sx2 + Math.cos(a) * R.r(8, 20), sy2 + Math.sin(a) * R.r(8, 20)); }
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
    const chk = P();
    for (let x = 0; x < w; x += 40) chk.rect(x, floorY + ((Math.floor(x / 40) % 2) ? 0 : 19), 40, 19);
    fillP(ctx, chk, '#7e836f');
  });
  strokeP(ctx, lineP(-5, floorY, w + 5, floorY), 2);
  return { air: '#9ca690', light: -1 };
}

// ------------------------------------------------------------------ mall

export function mall(ctx, w, h, R) {
  const floorY = h - 40;
  const upperY = Math.round(h * R.r(0.42, 0.48));
  const wall = '#343650', wallL = '#44466a', wallD = '#282a40';
  fillP(ctx, rectP(0, 0, w, h), wall);

  // skylight: night sky through a simple grid, one crack
  const skyH = Math.max(80, h * 0.14);
  const sky = rectP(-5, -5, w + 10, skyH + 5);
  fillP(ctx, sky, '#1e2646');
  clipped(ctx, sky, () => stars(ctx, R, 0, 0, w, skyH, w / 18, '#8fa0d8', { r: 0.8, twinkles: 1 }));
  const grid = P();
  for (let x = 0; x < w; x += 110) grid.rect(x - 3, 0, 6, skyH);
  inked(ctx, grid, '#46486c', 1.2);
  const crk = P();
  { const cx = R() * w, cy = skyH * R.r(0.2, 0.8); for (let k = 0; k < 5; k++) { const a = R() * TAU; crk.moveTo(cx, cy); crk.lineTo(cx + Math.cos(a) * R.r(24, 60), cy + Math.sin(a) * R.r(16, 40)); } }
  strokeP(ctx, crk, 1, '#8fa0d8');
  inked(ctx, rectP(-5, skyH, w + 10, 14), '#4e5074', 2);

  // moonlight shafts, landing as pale patches on the floor
  const ang = Math.PI / 2 + R.r(0.22, 0.35) * R.sign();
  const shafts = [];
  for (let i = 0; i < Math.max(1, Math.round(w / 600)); i++) {
    const bx = R.r(0.2, 0.8) * w;
    shafts.push(bx);
    beam(ctx, bx, skyH, ang, h * 1.2, 0.08, '#c9d6ff', { alpha: 0.1, w0: 50, core: true });
  }

  // focal: the big broken neon sign
  const title = R.pick(['MEGA MALL', 'GALLERIA', 'PLAZA', 'SUPERMALL']);
  const tx = w / 2 + R.r(-0.15, 0.15) * w, ty = skyH + 64, size = Math.min(64, w * 0.07);
  ctx.save();
  ctx.font = `${size}px Bangers, Impact, sans-serif`;
  const tw = ctx.measureText(title).width;
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.rect(-5, skyH + 14, w + 10, h); ctx.clip();
  ringGlow(ctx, tx, ty + size * 0.8, [{ r: tw * 0.85, c: wall }, { r: tw * 0.62, c: '#3a3554' }, { r: tw * 0.38, c: '#443a5c' }], { spacing: 8, fade: 0.8, bounds: [0, 0, w, h] });
  ctx.restore();
  inked(ctx, rrectP(tx - tw / 2 - 22, ty - size * 0.62, tw + 44, size * 1.24, 10), '#20213a', 2.4);
  let lx = tx - tw / 2;
  const dead = R.i(1, title.length - 2);
  for (let i = 0; i < title.length; i++) {
    const chr = title[i];
    ctx.save();
    ctx.font = `${size}px Bangers, Impact, sans-serif`;
    const cw = ctx.measureText(chr).width;
    ctx.restore();
    neon(ctx, chr, lx + cw / 2, ty + 2, size, '#ff5fa2', { off: chr !== ' ' && i === dead, offColor: '#5a3a58', haloAlpha: 0.16 });
    lx += cw;
  }

  // upper storefronts: dark glass, no signage clutter
  const sfTop = ty + size * 0.9;
  const shopH = upperY - sfTop - 50;
  let x = R.r(-60, 0);
  const lit = R.i(0, 3);
  let k = 0;
  while (x < w && shopH > 60) {
    const sw = R.r(220, 300);
    const win = rectP(x + 18, sfTop + 30, sw - 36, shopH - 30);
    fillP(ctx, win, wallD);
    strokeP(ctx, win, 1.6);
    if (k === lit) neon(ctx, R.pick(['ARCADE', 'VIDEO', 'RECORDS']), x + sw / 2, sfTop + 12, 24, '#5fd8d0', { haloAlpha: 0.12 });
    x += sw; k++;
  }

  // upper walkway slab + glass balustrade
  inked(ctx, rectP(-5, upperY, w + 10, 26), wallL, 2);
  ctx.save(); ctx.globalAlpha = 0.18; fillP(ctx, rectP(-5, upperY - 44, w + 10, 44), '#8fa0d8'); ctx.restore();
  inked(ctx, rectP(-5, upperY - 48, w + 10, 6), '#7a7ca0', 1.6);
  const posts = P();
  for (let px = 40; px < w; px += 160) posts.rect(px - 2, upperY - 44, 4, 44);
  fillP(ctx, posts, '#6a6c90');

  // lower level: big quiet shutters
  const lowTop = upperY + 26;
  x = R.r(-80, 0);
  while (x < w) {
    const sw = R.r(240, 340);
    const open = R.r(0.35, 0.75);
    const f = rectP(x + 14, lowTop + 36, sw - 28, floorY - lowTop - 36);
    fillP(ctx, f, '#26283e');
    const gate = rectP(x + 14, lowTop + 36, sw - 28, (floorY - lowTop - 36) * open);
    fillP(ctx, gate, '#48496a');
    clipped(ctx, gate, () => {
      const sl = P();
      for (let y = lowTop + 50; y < floorY; y += 16) sl.rect(x, y, sw, 1.6);
      fillP(ctx, sl, '#3e3f5e');
    });
    strokeP(ctx, gate, 1.6);
    strokeP(ctx, f, 1.8);
    x += sw;
  }
  // dead escalator (the one strong diagonal)
  const eDir = R.sign();
  const eW = Math.min(w * 0.38, 360);
  const ex = eDir > 0 ? R.r(0.05, 0.18) * w : w - R.r(0.05, 0.18) * w - eW;
  const e0x = eDir > 0 ? ex : ex + eW, e1x = eDir > 0 ? ex + eW : ex;
  const esc = polyP([[e0x, floorY], [e0x + eDir * 50, floorY], [e1x, upperY + 30], [e1x, upperY - 2], [e1x - eDir * 36, upperY - 2], [e0x, floorY - 40]]);
  fillP(ctx, esc, '#4a4c6e');
  crescent(ctx, esc, 0, -10, '#3e4060');
  strokeP(ctx, esc, 2);
  const rail = P();
  rail.moveTo(e0x - eDir * 10, floorY - 70);
  rail.lineTo(e1x - eDir * 24, upperY - 60);
  ctx.save(); ctx.lineCap = 'round';
  strokeP(ctx, rail, 11, INK);
  strokeP(ctx, rail, 6, '#2a2a40');
  ctx.restore();
  // floor
  const fl = rectP(-5, floorY, w + 10, h - floorY + 5);
  fillP(ctx, fl, '#4c4e6c');
  clipped(ctx, fl, () => {
    for (const bx of shafts) {
      const fx = bx + Math.cos(ang) / Math.sin(ang) * (floorY - skyH);
      fillP(ctx, ellP(fx, floorY + 16, 110, 12), '#5c5f84');
    }
    const refl = P();
    refl.rect(tx - tw * 0.4, floorY + 4, tw * 0.8, 3);
    refl.rect(tx - tw * 0.25, floorY + 12, tw * 0.5, 2.4);
    fillP(ctx, refl, 'rgba(255,95,162,0.35)');
  });
  strokeP(ctx, lineP(-5, floorY, w + 5, floorY), 2);
  return { air: '#4c4e72', light: -1 };
}
