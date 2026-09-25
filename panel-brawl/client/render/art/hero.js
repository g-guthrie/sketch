// SUPERHERO backdrops: rooftop, street, lab, lair.
// Composition rule for every scene: one focal element up high, a quiet far
// layer, a modest mid layer, and a calm, low-contrast band where fighters
// stand. Each painter returns { air, light } for decor/props on the canvas.

import {
  INK, TAU, shade, mix, rgba, halftoneGradient, cloudPath,
  P, rectP, circP, ellP, polyP, rrectP, lineP, fillP, strokeP, inked, dotsIn, clipped, gradIn, crescent,
  bandSky, dotFade, stars, moon, glow, beam, cloudBank, skyline, windows, brickPatches,
  pipe, hazardStripes, rivetRow, letters, boltPath, arcLine, hatchLines, solid, spans, rain, ringGlow, dotRing,
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
  stars(ctx, R, 0, 0, w, h * 0.36, Math.round(w * h / 16000), '#c9d0f2', { r: 0.9, pow: 1.5, big: 5, twinkles: 3 });

  // focal: moon + hero signal on a cloud
  const mr = Math.max(46, Math.min(115, Math.min(w, h) * R.r(0.085, 0.12)));
  const mx = R.r(0.14, 0.86) * w, my = R.r(0.12, 0.22) * h + mr * 0.2;
  moon(ctx, R, mx, my, mr, { color: '#f5e7ae', halo: [mix(skyA, '#f5e7ae', 0.1), mix(skyA, '#f5e7ae', 0.18)], haloStep: 0.28, lw: 2.2 });
  const sigX = Math.max(w * 0.14, Math.min(w * 0.86, (mx > w / 2 ? R.r(0.15, 0.38) : R.r(0.62, 0.85)) * w));
  const sigY = R.r(0.1, 0.18) * h + 30;
  const cloudC = mix(skyB, '#8c95d6', 0.35);
  cloudBank(ctx, R, sigX + R.r(-30, 30), sigY + 16, 150, 46, { fill: cloudC, shadow: shade(cloudC, -0.18), dots: true, lw: 1.6, puffs: 3 });
  const cx2 = (mx + sigX) / 2 + R.r(-80, 80);
  cloudBank(ctx, R, cx2, h * R.r(0.32, 0.4), R.r(130, 190), 26, { fill: mix(skyC, '#b9bde6', 0.18), shadow: shade(skyC, -0.1), lw: 1.4, puffs: 4, bumps: 9 });

  // far skyline: flat, atmospheric, a sprinkle of windows
  const farC = dusk ? '#544d8c' : '#42508c';
  skyline(ctx, R, {
    x0: -20, x1: w + 20, base: roofY, hMin: h * 0.2, hMax: h * 0.4, wMin: 60, wMax: 130, peak: 1.3, peakP: 0.2,
    fill: farC, lw: 1.2, ink: shade(farC, -0.3),
    onBuilding: (b) => windows(ctx, R, b, { ww: 3, wh: 5, gx: 6, gy: 7, litP: 0.08, lit: mix('#e8c475', farC, 0.3), pad: 6, padTop: 14 }),
  });

  // searchlights: one free beam + the signal beam
  const beamC = '#fff4c2';
  const ox = sigX + (sigX > w / 2 ? -1 : 1) * R.r(90, 220), oy = roofY - h * 0.16;
  const bx = Math.max(w * 0.1, Math.min(w * 0.9, ox + (sigX > w / 2 ? -1 : 1) * R.r(160, 320)));
  beam(ctx, bx, roofY - h * 0.18, -Math.PI / 2 + (sigX > w / 2 ? -1 : 1) * R.r(0.15, 0.45), h * 1.4, 0.045, beamC, { alpha: 0.11, core: true, edge: beamC, edgeAlpha: 0.3 });
  const ang = Math.atan2(sigY - oy, sigX - ox), dist = Math.hypot(sigX - ox, sigY - oy);
  beam(ctx, ox, oy, ang, dist, Math.atan2(46, dist), beamC, { alpha: 0.18, core: true, edge: beamC, edgeAlpha: 0.45 });
  const sig = ellP(sigX, sigY, 74, 44, (ang + Math.PI / 2) * 0.6);
  fillP(ctx, sig, '#f9efbd');
  gradIn(ctx, sig, sigX - 76, sigY - 48, 152, 96, '#e8c86a', { spacing: 6, dir: 'radial', cx: sigX, cy: sigY, from: 0.45, to: 1, maxR: 3.4 });
  const star = P();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 14 : 34;
    const px = sigX + Math.cos(a) * rr * 1.1, py = sigY + 3 + Math.sin(a) * rr * 0.92;
    i ? star.lineTo(px, py) : star.moveTo(px, py);
  }
  star.closePath();
  fillP(ctx, star, skyA);
  strokeP(ctx, sig, 1.6, rgba(INK, 0.6));

  // mid skyline: dark, simple, few lit windows in clusters (sits behind fighters)
  const midC = '#2a2852';
  skyline(ctx, R, {
    x0: -30, x1: w + 30, base: parTop + 6, hMin: h * 0.1, hMax: h * 0.28, wMin: 110, wMax: 210,
    kinds: ['flat', 'flat', 'tank', 'tank', 'step', 'antenna'],
    fill: midC, lw: 2, ink: INK,
    onBuilding: (b) => {
      clipped(ctx, b.path, () => fillP(ctx, rectP(b.x + b.w * 0.78, b.top - 200, b.w, b.h + 400), shade(midC, -0.18)));
      // one or two lit window clusters
      const lit = P();
      const n = R.i(0, 2);
      for (let k = 0; k < n; k++) {
        const cx = b.x + 14 + Math.floor(R() * Math.max(1, (b.w - 40) / 18)) * 18;
        const cy = b.top + 16 + Math.floor(R() * Math.max(1, (b.h - 60) / 22)) * 22;
        for (let i = 0; i < R.i(1, 3); i++) lit.rect(cx + i * 18, cy, 9, 12);
      }
      fillP(ctx, lit, '#d8b865');
      inked(ctx, rectP(b.x - 3, b.top, b.w + 6, 5), shade(midC, 0.14), 1.4);
    },
  });
  // searchlight housing
  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(ang + Math.PI / 2);
  inked(ctx, rrectP(-11, -10, 22, 24, 4), '#3b3a66', 1.6);
  inked(ctx, ellP(0, -10, 11, 4), '#fff4c2', 1.6);
  ctx.restore();
  inked(ctx, polyP([[ox - 10, oy + 22], [ox, oy + 4], [ox + 10, oy + 22]]), '#3b3a66', 1.6);

  // parapet (low contrast) + tar roof
  const par = rectP(-5, parTop, w + 10, roofY - parTop);
  fillP(ctx, par, '#6e5468');
  brickPatches(ctx, R, 0, parTop + 8, w, roofY - parTop - 8, { bw: 26, bh: 9, color: '#5e4659', lw: 1, patches: Math.ceil(w / 420), rx: 60, ry: 16 });
  crescent(ctx, par, 0, -6, '#604859');
  inked(ctx, rectP(-5, parTop - 7, w + 10, 9), '#94808e', 1.8);
  strokeP(ctx, lineP(-5, roofY, w + 5, roofY), 1.8);
  fillP(ctx, rectP(-5, roofY, w + 10, h - roofY + 5), '#4a4460');
  dotFade(ctx, 0, w, roofY, roofY + 26, '#3e3854', 7);
  return { air: dusk ? '#5b5188' : '#46508a', light: mx < w / 2 ? -1 : 1 };
}

// ------------------------------------------------------------------ street

const SHOPS = ['DINER', 'PAWN', 'BANK', 'HOTEL', 'BOOKS', 'RADIO', 'BARBER', 'CAFE', 'TOYS', 'SHOES'];

function decoTower(ctx, R, cx, base, tw, th, fill, ink, light) {
  const p = P();
  const s1 = tw * 0.16, s2 = tw * 0.3;
  const t0 = base - th * 0.74, t1 = t0 - th * 0.07, t2 = t1 - th * 0.06;
  polyP([
    [cx - tw / 2, base + 4], [cx - tw / 2, t0], [cx - tw / 2 + s1, t0], [cx - tw / 2 + s1, t1], [cx - tw / 2 + s2, t1], [cx - tw / 2 + s2, t2],
    [cx + tw / 2 - s2, t2], [cx + tw / 2 - s2, t1], [cx + tw / 2 - s1, t1], [cx + tw / 2 - s1, t0], [cx + tw / 2, t0], [cx + tw / 2, base + 4],
  ], true, p);
  // stacked-arch crown + needle
  const cw = tw - s2 * 2;
  const crown = P();
  crown.moveTo(cx - cw / 2, t2);
  crown.lineTo(cx - cw / 2, t2 - cw * 0.35);
  crown.quadraticCurveTo(cx - cw / 2, t2 - cw * 1.05, cx, t2 - cw * 1.2);
  crown.quadraticCurveTo(cx + cw / 2, t2 - cw * 1.05, cx + cw / 2, t2 - cw * 0.35);
  crown.lineTo(cx + cw / 2, t2);
  crown.closePath();
  const needle = polyP([[cx - 3, t2 - cw * 1.15], [cx, t2 - cw * 1.2 - th * 0.14], [cx + 3, t2 - cw * 1.15]]);
  fillP(ctx, needle, fill);
  strokeP(ctx, needle, 1.2, ink);
  fillP(ctx, p, fill);
  fillP(ctx, crown, fill);
  // sunlit side
  const lit = light < 0 ? rectP(cx - tw / 2, t0 - 400, tw * 0.3, th + 400) : rectP(cx + tw * 0.2, t0 - 400, tw * 0.3, th + 400);
  clipped(ctx, p, () => fillP(ctx, lit, shade(fill, 0.25)));
  clipped(ctx, crown, () => {
    fillP(ctx, light < 0 ? rectP(cx - cw, t2 - cw * 2, cw * 0.8, cw * 3) : rectP(cx + cw * 0.2, t2 - cw * 2, cw, cw * 3), shade(fill, 0.25));
    // sunburst arches with triangular windows
    const arc = P();
    for (let k = 0; k < 3; k++) {
      const r = cw * (0.5 - k * 0.13);
      arc.moveTo(cx - r, t2 - cw * 0.3 - k * cw * 0.2);
      arc.quadraticCurveTo(cx, t2 - cw * 0.3 - k * cw * 0.2 - r * 1.3, cx + r, t2 - cw * 0.3 - k * cw * 0.2);
    }
    strokeP(ctx, arc, 1.4, ink);
  });
  // pilaster lines
  const pl = P();
  for (let x = cx - tw / 2 + tw / 6; x < cx + tw / 2 - 2; x += tw / 6) { pl.moveTo(x, t0 + 10); pl.lineTo(x, base); }
  clipped(ctx, p, () => strokeP(ctx, pl, 1, shade(fill, -0.1)));
  strokeP(ctx, p, 1.4, ink);
  strokeP(ctx, crown, 1.4, ink);
}

export function street(ctx, w, h, R) {
  const walkY = h - 44;
  const sunL = R.chance(0.5);
  const light = sunL ? -1 : 1;
  // sky: pale paper with a fine blue dot screen thickening upward
  fillP(ctx, rectP(0, 0, w, walkY), '#e7efe6');
  fillP(ctx, rectP(0, 0, w, h * 0.06), '#8cc4e2');
  halftoneGradient(ctx, 0, h * 0.06 - 2, w, h * 0.62, '#8cc4e2', { spacing: 7, dir: 'up', maxR: 4.4, from: 0 });
  // sun
  const sx = sunL ? R.r(0.06, 0.2) * w : R.r(0.8, 0.94) * w, sy = h * R.r(0.08, 0.14);
  fillP(ctx, circP(sx, sy, 62), '#f4f3dc');
  dotRing(ctx, sx, sy, 60, 110, '#f4f3dc', 7, { maxR: 4.4 });
  inked(ctx, circP(sx, sy, 32), '#fff7d6', 1.8);
  // one big clean cloud (two on wide panels)
  const nc = w > 1000 ? 2 : 1;
  for (let i = 0; i < nc; i++) {
    const cx = ((i + 0.5) / nc) * w + R.r(-80, 80), cy = h * R.r(0.14, 0.24);
    if (Math.abs(cx - sx) < 200) continue;
    cloudBank(ctx, R, cx, cy, R.r(110, 150), R.r(40, 52), { fill: '#fbfbf4', shadow: '#cfe0ea', lw: 2, puffs: 3 });
  }
  // far skyline: one pale tone
  const farC = '#c2d3de';
  skyline(ctx, R, {
    x0: -20, x1: w + 20, base: walkY - 60, hMin: h * 0.28, hMax: h * 0.48, wMin: 70, wMax: 150,
    kinds: ['flat', 'step', 'step', 'antenna', 'flat'], fill: farC, lw: 1.1, ink: '#a7bccb',
  });
  // focal: art-deco tower in the sun
  const tx = R.r(0.3, 0.7) * w, tw = Math.min(150, Math.max(100, w * 0.12)), th = Math.min(h * 0.8, walkY - 40);
  decoTower(ctx, R, tx, walkY - 60, tw, th, '#aebfd0', '#7f95ad', light);

  // street row: few, big, simple facades
  const facades = ['#c98b70', '#dccaa0', '#a5bba6', '#c3aac0', '#d8b87a'];
  let fi = R.i(0, facades.length - 1);
  const n = Math.max(2, Math.round(w / 330));
  const bws = [];
  let tot = 0;
  for (let i = 0; i < n; i++) { const v = R.r(0.8, 1.2); bws.push(v); tot += v; }
  let x = -10;
  const signAt = R.i(0, n - 1), signAt2 = n > 3 ? (signAt + 2) % n : -1;
  for (let i = 0; i < n; i++) {
    const bw = (bws[i] / tot) * (w + 20);
    const col = facades[fi++ % facades.length];
    const top = walkY - Math.max(240, R.r(h * 0.4, h * 0.56));
    const f = rectP(x, top, bw, walkY - top + 2);
    fillP(ctx, f, col);
    fillP(ctx, light < 0 ? rectP(x + bw - 12, top, 12, walkY - top) : rectP(x, top, 12, walkY - top), shade(col, -0.12));
    strokeP(ctx, f, 2);
    inked(ctx, rectP(x - 5, top - 4, bw + 10, 14), shade(col, 0.22), 1.8);
    // windows: plain flat glass, a couple of shades pulled
    const shopTop = walkY - 124;
    const rows = Math.max(0, Math.floor((shopTop - top - 44) / 72));
    const cols = Math.max(2, Math.floor(bw / 76));
    const ww = 32, wh = 44, gap = (bw - cols * ww) / (cols + 1);
    const frames = P(), glass = P(), shades = P();
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const wx = x + gap + c * (ww + gap), wy = top + 34 + r * 72;
      frames.rect(wx - 3, wy - 3, ww + 6, wh + 6);
      glass.rect(wx, wy, ww, wh);
      if (R() < 0.3) shades.rect(wx, wy, ww, wh * R.r(0.3, 0.6));
    }
    fillP(ctx, frames, shade(col, 0.3));
    fillP(ctx, glass, mix('#56708c', col, 0.2));
    fillP(ctx, shades, mix('#e6d59b', col, 0.2));
    strokeP(ctx, glass, 1.2, rgba(INK, 0.7));
    // shop front: one awning, big quiet window, door
    const sf = rectP(x + 8, shopTop, bw - 16, walkY - shopTop);
    fillP(ctx, sf, shade(col, -0.22));
    const disp = rectP(x + 22, shopTop + 30, bw * 0.46, walkY - shopTop - 50);
    fillP(ctx, disp, mix('#7890a6', col, 0.4));
    strokeP(ctx, disp, 1.4);
    const dw = Math.min(50, bw * 0.18);
    inked(ctx, rectP(x + bw * 0.7, shopTop + 22, dw, walkY - shopTop - 22), shade(col, -0.42), 1.4);
    const ac = mix(R.pick(['#c96a5e', '#5b86b8', '#5a9a7a']), col, 0.3);
    const aw = polyP([[x + 6, shopTop - 12], [x + bw - 6, shopTop - 12], [x + bw + 2, shopTop + 14], [x - 2, shopTop + 14]]);
    clipped(ctx, aw, () => {
      fillP(ctx, rectP(x - 10, shopTop - 14, bw + 20, 34), mix('#efe8d6', col, 0.25));
      const vs = P();
      for (let sx2 = x - 4; sx2 < x + bw + 10; sx2 += 36) vs.rect(sx2, shopTop - 14, 18, 34);
      fillP(ctx, vs, ac);
    });
    strokeP(ctx, aw, 1.8);
    if (i === signAt || i === signAt2) {
      const sg = rrectP(x + bw * 0.2, shopTop - 50, bw * 0.6, 30, 3);
      inked(ctx, sg, shade(ac, -0.35), 1.8);
      letters(ctx, R.pick(SHOPS), x + bw / 2, shopTop - 34, 22, '#f4e2a4', { maxW: bw * 0.52 });
    }
    x += bw;
  }
  // sidewalk
  fillP(ctx, rectP(-5, walkY, w + 10, h - walkY + 5), '#cdc6b4');
  strokeP(ctx, lineP(-5, walkY, w + 5, walkY), 2);
  dotFade(ctx, 0, w, walkY, walkY + 14, '#aba392', 6);
  return { air: '#b3c6d4', light };
}

// ------------------------------------------------------------------ lab

export function lab(ctx, w, h, R) {
  const floorY = h - 40;
  const wall = '#3a5a5e', wallD = '#314f53';
  fillP(ctx, rectP(0, 0, w, h), wall);
  const panels = P();
  const pw = 180, ph = 150;
  for (let y = 0; y < floorY; y += ph) for (let x = (y / ph) % 2 ? -pw / 2 : 0; x < w; x += pw) panels.rect(x, y, pw, ph);
  strokeP(ctx, panels, 1.2, wallD);
  dotFade(ctx, 0, w, 0, h * 0.34, '#2b474b', 9);

  // focal: tall arched storm window
  const ww = Math.min(w * 0.36, 330), wh = Math.min(h * 0.56, 470), wy = h * 0.07;
  const wx = Math.max(40, Math.min(w - ww - 40, R.r(0.3, 0.7) * w - ww / 2));
  const light = wx + ww / 2 < w / 2 ? -1 : 1;
  // cold light falling from the window onto the floor
  const spill = polyP([[wx + ww * 0.15, wy + wh], [wx + ww * 0.85, wy + wh], [wx + ww * 1.05 - light * 90, floorY], [wx - ww * 0.05 - light * 90, floorY]]);
  fillP(ctx, spill, '#44686c');
  const arch = P();
  arch.moveTo(wx, wy + wh);
  arch.lineTo(wx, wy + ww / 2);
  arch.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0);
  arch.lineTo(wx + ww, wy + wh);
  arch.closePath();
  clipped(ctx, arch, () => {
    bandSky(ctx, wx, ww, [{ c: '#17132e', y: wy - 10 }, { c: '#2e2656', y: wy + wh * 0.42 }, { c: '#4a3c7a', y: wy + wh * 0.78 }], 50, 5);
    for (let i = 0; i < 2; i++) cloudBank(ctx, R, wx + (i + 0.3) * ww * 0.5, wy + wh * R.r(0.15, 0.4), 90, 26, { fill: '#2a2250', shadow: '#1d1840', lw: 1.2, puffs: 3 });
    const bx = wx + ww * R.r(0.35, 0.65);
    glow(ctx, bx, wy + wh * 0.4, ww * 0.75, '#9d8cf0', { from: 0.3, spacing: 5 });
    const b = boltPath(R, bx, wy - 10, bx + R.r(-60, 60), wy + wh * 0.9, 10, 8);
    inked(ctx, b, '#fffbe0', 2);
    skyline(ctx, R, { x0: wx - 10, x1: wx + ww + 10, base: wy + wh + 4, hMin: 24, hMax: 80, wMin: 22, wMax: 48, fill: '#15122a', lw: 0, kinds: ['flat', 'gable', 'step'] });
  });
  const mul = P();
  mul.rect(wx + ww / 2 - 3, wy, 6, wh);
  for (let y = wy + ww * 0.5; y < wy + wh - 20; y += 90) mul.rect(wx, y, ww, 5);
  clipped(ctx, arch, () => inked(ctx, mul, '#27303a', 1.2));
  strokeP(ctx, arch, 16, '#27303a');
  strokeP(ctx, arch, 2.4);
  inked(ctx, rectP(wx - 18, wy + wh, ww + 36, 12), '#4b6064', 2);

  // one copper pipe along the ceiling with a drop to a valve
  const py1 = R.r(26, 40);
  pipe(ctx, [[-20, py1], [w + 20, py1]], 8, '#a8764c', { flanges: 240, lw: 2 });

  // background apparatus kept to the side away from the window: tanks
  const slots = spans(20, w - 20);
  slots.mark(wx - 40, wx + ww + 40);
  const nt = w > 900 ? 2 : 1;
  for (let i = 0; i < nt; i++) {
    const tw = 74, th = Math.min(250, h * 0.34);
    const tx = slots.take(R, tw + 30, 30);
    if (tx == null) continue;
    labTank(ctx, R, tx + 15, floorY - 16 - th, tw, th);
  }
  // Jacob's ladder on wide panels only
  const jx = w > 1000 ? slots.take(R, 120, 40) : null;
  if (jx != null) {
    const cx = jx + 60, base = floorY - 16, top = base - Math.min(220, h * 0.32);
    const rods = P(); rods.moveTo(cx - 12, base - 30); rods.lineTo(cx - 40, top); rods.moveTo(cx + 12, base - 30); rods.lineTo(cx + 40, top);
    strokeP(ctx, rods, 7, INK); strokeP(ctx, rods, 3.5, '#b8bec6');
    const a = arcLine(R, cx - 30, top + 40, cx + 30, top + 36, 6, 0.3);
    strokeP(ctx, a, 5, rgba('#8ad8ff', 0.5)); strokeP(ctx, a, 2, '#ffffff');
    solid(ctx, rrectP(cx - 34, base - 34, 68, 34, 4), '#56666a', { lw: 2, lx: 0, ly: -4, shadow: false });
  }

  // floor
  const fl = rectP(-5, floorY, w + 10, h - floorY + 5);
  fillP(ctx, fl, '#50625f');
  clipped(ctx, fl, () => {
    const tiles = P();
    const vx = w / 2, vy = floorY - 500;
    for (let i = -30; i <= 30; i++) {
      const bx = w / 2 + i * 70;
      const t0 = (floorY - vy) / (h + 10 - vy);
      tiles.moveTo(vx + (bx - vx) * t0, floorY);
      tiles.lineTo(bx, h + 10);
    }
    strokeP(ctx, tiles, 1.1, '#465855');
    fillP(ctx, polyP([[wx - ww * 0.05 - light * 90, floorY], [wx + ww * 1.05 - light * 90, floorY], [wx + ww * 1.1 - light * 110, h], [wx - ww * 0.1 - light * 110, h]]), '#5a6e6b');
  });
  strokeP(ctx, lineP(-5, floorY, w + 5, floorY), 2);
  fillP(ctx, rectP(-5, floorY - 12, w + 10, 12), '#33504f');
  strokeP(ctx, lineP(-5, floorY - 12, w + 5, floorY - 12), 1.4);
  return { air: '#56706f', light };
}

function labTank(ctx, R, x, y, w, h) {
  const glass = rrectP(x, y + 18, w, h - 36, 14);
  fillP(ctx, glass, '#9cc7a0');
  clipped(ctx, glass, () => {
    fillP(ctx, rectP(x, y + 18 + h * 0.14, w, h), '#76b07a');
    fillP(ctx, rectP(x + w * 0.62, y, w, h), '#679e6c');
    const cx = x + w / 2, cy = y + h * 0.36;
    const body = P();
    circP(cx, cy, 11, body);
    body.moveTo(cx - 13, cy + 14); body.lineTo(cx + 13, cy + 14); body.lineTo(cx + 9, cy + 62); body.lineTo(cx + 12, cy + 110); body.lineTo(cx + 3, cy + 110); body.lineTo(cx, cy + 70); body.lineTo(cx - 3, cy + 110); body.lineTo(cx - 12, cy + 110); body.lineTo(cx - 9, cy + 62); body.closePath();
    fillP(ctx, body, '#4a7a58');
    const bub = P();
    for (let i = 0; i < 5; i++) circP(x + 10 + R() * (w - 20), y + 40 + R() * (h - 80), 2 + R() * 3, bub);
    fillP(ctx, bub, '#cfeec6');
    fillP(ctx, rectP(x + 8, y + 26, 6, h - 60), 'rgba(255,255,255,0.4)');
  });
  strokeP(ctx, glass, 2);
  solid(ctx, rrectP(x - 6, y, w + 12, 22, 4), '#7f8d92', { lw: 2, shadow: false });
  solid(ctx, rrectP(x - 6, y + h - 22, w + 12, 22, 4), '#7f8d92', { lw: 2, shadow: false });
}

// ------------------------------------------------------------------ lair

export function lair(ctx, w, h, R) {
  const floorY = h - 40;
  const wall = '#2b2640';
  fillP(ctx, rectP(0, 0, w, h), wall);
  // broad bulkhead ribs, low contrast
  const rib = P();
  const ribSp = R.r(220, 280);
  for (let x = R.r(40, ribSp); x < w; x += ribSp) rib.rect(x - 16, 0, 32, floorY);
  fillP(ctx, rib, '#322c4a');
  strokeP(ctx, rib, 1.4, '#221d33');
  // cavern roof silhouette
  const rock = P();
  rock.moveTo(-10, -10);
  let x = -10;
  while (x < w + 10) {
    const nx = x + R.r(60, 130);
    rock.lineTo((x + nx) / 2, R.chance(0.3) ? R.r(40, 80) : R.r(12, 30));
    rock.lineTo(nx, R.r(4, 12));
    x = nx;
  }
  rock.lineTo(w + 10, -10);
  rock.closePath();
  fillP(ctx, rock, '#18121f');
  strokeP(ctx, rock, 2);

  // focal: the Doctor on the giant screen
  const sw = Math.min(w * 0.56, 560), sh = Math.min(h * 0.44, 380);
  const sx = (w - sw) / 2, sy = Math.max(70, h * 0.1);
  ringGlow(ctx, w / 2, sy + sh / 2, [{ r: Math.max(sw, sh) * 0.9, c: wall }, { r: Math.max(sw, sh) * 0.66, c: '#2f3a52' }], { spacing: 9, fade: 0.8, bounds: [0, 0, w, h] });
  const frame = rrectP(sx - 20, sy - 20, sw + 40, sh + 40, 12);
  solid(ctx, frame, '#48415f', { lw: 2.6, lx: 0, ly: -6 });
  rivetRow(ctx, sx - 4, sy - 10, sx + sw + 4, sy - 10, 40, 2.2, '#6d6590', 1);
  const scr = rrectP(sx, sy, sw, sh, 8);
  fillP(ctx, scr, '#1a4650');
  clipped(ctx, scr, () => {
    halftoneGradient(ctx, sx, sy, sw, sh, '#2a7078', { spacing: 8, dir: 'center', cx: sx + sw / 2, cy: sy + sh * 0.55, from: 0.25, maxR: 5 });
    const cx = sx + sw / 2, cy = sy + sh * 0.56, s = Math.min(sw, sh) * 0.36;
    const head = P();
    head.moveTo(cx - s * 0.8, sy + sh + 4);
    head.quadraticCurveTo(cx - s * 0.9, cy + s * 0.6, cx - s * 0.55, cy + s * 0.3);
    head.lineTo(cx + s * 0.55, cy + s * 0.3);
    head.quadraticCurveTo(cx + s * 0.9, cy + s * 0.6, cx + s * 0.8, sy + sh + 4);
    head.closePath();
    fillP(ctx, head, '#0e272c');
    const brain = cloudPath(cx, cy - s * 0.05, s * 0.72, s * 0.52, 10, 77);
    inked(ctx, brain, '#e39aa6', 2.4);
    crescent(ctx, brain, -8, -8, '#c47888');
    const folds = P();
    folds.moveTo(cx, cy - s * 0.5); folds.quadraticCurveTo(cx - 8, cy - s * 0.1, cx, cy + s * 0.3);
    folds.moveTo(cx - s * 0.4, cy - s * 0.3); folds.quadraticCurveTo(cx - s * 0.2, cy - s * 0.1, cx - s * 0.45, cy + s * 0.15);
    folds.moveTo(cx + s * 0.4, cy - s * 0.3); folds.quadraticCurveTo(cx + s * 0.2, cy - s * 0.1, cx + s * 0.45, cy + s * 0.15);
    strokeP(ctx, folds, 2, '#9a4a5e');
    const eyes = P();
    ellP(cx - s * 0.28, cy + s * 0.62, s * 0.16, s * 0.08, 0.2, eyes);
    ellP(cx + s * 0.28, cy + s * 0.62, s * 0.16, s * 0.08, -0.2, eyes);
    fillP(ctx, eyes, '#ffe14a');
    strokeP(ctx, ellP(cx, cy, s * 0.95, s * 0.78), 2, '#9ff4f8');
    const sl = P();
    for (let y2 = sy; y2 < sy + sh; y2 += 5) sl.rect(sx, y2, sw, 1.6);
    fillP(ctx, sl, 'rgba(0,0,0,0.16)');
  });
  strokeP(ctx, scr, 2.6);
  // two quiet side panels on wide rooms
  if (w > 760) {
    for (const side of [-1, 1]) {
      const pw = Math.min(150, (w - sw) / 2 - 90), ph = sh * 0.5;
      if (pw < 80) continue;
      const px = side < 0 ? sx - 50 - pw : sx + sw + 50, py = sy + sh * 0.12;
      inked(ctx, rrectP(px - 10, py - 10, pw + 20, ph + 20, 8), '#3e3856', 2);
      const p2 = rrectP(px, py, pw, ph, 5);
      fillP(ctx, p2, '#193c44');
      clipped(ctx, p2, () => {
        const g = P();
        if (side < 0) { const c2 = [px + pw / 2, py + ph / 2]; circP(c2[0], c2[1], ph * 0.36, g); circP(c2[0], c2[1], ph * 0.2, g); g.moveTo(c2[0] - ph * 0.4, c2[1]); g.lineTo(c2[0] + ph * 0.4, c2[1]); }
        else { for (let k = 0; k < 5; k++) g.rect(px + 12 + k * (pw - 24) / 5, py + ph - 10 - (ph - 24) * R.r(0.3, 1), (pw - 24) / 5 - 6, ph); }
        if (side < 0) strokeP(ctx, g, 1.4, '#3f9aa2'); else fillP(ctx, g, '#3f9aa2');
      });
      strokeP(ctx, p2, 2);
    }
  }
  // two red alarm domes (small accent, no beams)
  for (const ax of [sx - 10, sx + sw + 10]) {
    const ay = sy + sh + 56;
    const dome = P(); dome.moveTo(ax - 13, ay + 6); dome.arc(ax, ay + 6, 13, Math.PI, 0); dome.closePath();
    inked(ctx, dome, '#e0503f', 1.8);
    inked(ctx, rectP(ax - 17, ay + 6, 34, 6), '#48415f', 1.4);
  }
  // hazard band + floor (thin, muted)
  const hz = rectP(-5, floorY - 58, w + 10, 14);
  hazardStripes(ctx, hz, -5, floorY - 58, w + 10, 14, '#9c8746', '#2a2438', 14);
  strokeP(ctx, hz, 1.6);
  fillP(ctx, rectP(-5, floorY - 44, w + 10, 44), '#352f4a');
  strokeP(ctx, lineP(-5, floorY - 44, w + 5, floorY - 44), 1.4);
  fillP(ctx, rectP(-5, floorY, w + 10, h - floorY + 5), '#403a58');
  strokeP(ctx, lineP(-5, floorY, w + 5, floorY), 2);
  return { air: '#3e3860', light: -1 };
}
