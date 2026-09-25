// NOIR backdrops (Sin City rules): pure black, paper white, the red spot
// color, and greys ONLY via halftone dots or hatching.

import {
  NW, NB, NR, TAU, halftoneGradient, cloudPath,
  P, rectP, circP, ellP, polyP, rrectP, lineP, fillP, strokeP, inked, dotsIn, hatchIn, clipped, gradIn, crescent,
  dotFade, bricksFull, brickPatches, rain, letters, neon, skyline, windows, hatchLines, beam, mkR, ringGlow, halftone,
} from './kit.js';

const W = NW, B = NB, RED = NR;

// White rain over dark areas, black rain over the lit areas.
function noirRain(ctx, R, w, h, lit, n = 1, o = {}) {
  const cnt = Math.round((w * h) / 4200 * n);
  const seed = (R() * 1e6) | 0;
  rain(ctx, mkR(seed), 0, 0, w, h, cnt, { angle: o.angle || 1.38, len: o.len || 34, color: W, lw: 1.2 });
  if (lit) {
    ctx.save();
    ctx.clip(lit);
    rain(ctx, mkR(seed), 0, 0, w, h, cnt, { angle: o.angle || 1.38, len: o.len || 34, color: B, lw: 1.3 });
    ctx.restore();
  }
}

// Light cone (trapezoid) from a lamp at (x,y) down to groundY.
function coneP(x, y, groundY, spread, topW = 16) {
  const dy = groundY - y;
  const hw = dy * Math.tan(spread);
  return polyP([[x - topW, y], [x + topW, y], [x + hw, groundY], [x - hw, groundY]]);
}

// Soften a light shape's edges with black dots (falloff toward the rim).
function falloff(ctx, path, x, y, w, h, cx, cy, o = {}) {
  ctx.save();
  ctx.clip(path);
  halftoneGradient(ctx, x, y, w, h, B, { spacing: o.spacing || 6, dir: 'radial', cx, cy, from: o.from || 0.35, to: o.to || 0.95, maxR: (o.spacing || 6) * 0.62 });
  ctx.restore();
}

function wallLamp(ctx, x, y, side = 1) {
  const arm = P();
  arm.moveTo(x - side * 30, y - 34);
  arm.quadraticCurveTo(x - side * 2, y - 40, x, y - 14);
  ctx.save(); ctx.lineCap = 'round';
  strokeP(ctx, arm, 6, W);
  strokeP(ctx, arm, 3.5, B);
  ctx.restore();
  inked(ctx, rectP(x - side * 34 - 4, y - 44, 8, 22), B, 1.6, W);
  const shadeP = polyP([[x - 8, y - 16], [x + 8, y - 16], [x + 20, y], [x - 20, y]]);
  inked(ctx, shadeP, B, 1.8, W);
  fillP(ctx, ellP(x, y + 1, 12, 4), W);
}

// ------------------------------------------------------------------ alley

export function alley(ctx, w, h, R) {
  const groundY = h - 42;
  fillP(ctx, rectP(0, 0, w, h), B);
  // night sky slot above the rooftops
  const roofBase = h * R.r(0.2, 0.3);
  fillP(ctx, rectP(0, 0, w, roofBase + 60), W);
  halftoneGradient(ctx, 0, 0, w, roofBase + 60, B, { spacing: 7, dir: 'up', from: 0.15, maxR: 4.4 });
  // distant towers
  skyline(ctx, R, {
    x0: -20, x1: w + 20, base: roofBase + 60, hMin: 60, hMax: roofBase + 20, wMin: 40, wMax: 90,
    kinds: ['flat', 'step', 'spire', 'antenna'], fill: B, lw: 0,
    onBuilding: (b) => windows(ctx, R, b, { ww: 3, wh: 4, gx: 5, gy: 6, litP: 0.15, lit: W, pad: 5 }),
  });
  // near rooflines (black), with cornices catching moonlight
  const roofs = P();
  let x = -20;
  const tops = [];
  while (x < w + 20) {
    const bw = R.r(160, 320);
    const ty = roofBase + R.r(-30, 50);
    roofs.rect(x, ty, bw, h);
    tops.push([x, ty, bw]);
    x += bw;
  }
  fillP(ctx, roofs, B);
  const corn = P();
  for (const [tx, ty, tw] of tops) { corn.rect(tx - 4, ty, tw + 8, 5); corn.rect(tx, ty + 12, tw, 2); }
  fillP(ctx, corn, W);

  // moonlit brick patches on the upper wall (sparse white mortar hints)
  brickPatches(ctx, R, 0, roofBase + 60, w, h * 0.3, { bw: 28, bh: 12, color: W, lw: 1, patches: Math.ceil(w / 300), rx: 60, ry: 26 });

  // windows: some lit, one with a silhouette
  const winY = roofBase + R.r(70, 110);
  const nwin = Math.max(2, Math.round(w / 260));
  for (let i = 0; i < nwin; i++) {
    const wx = ((i + R.r(0.2, 0.8)) / nwin) * w - 30;
    const lit = R() < 0.5;
    const win = rectP(wx, winY, 60, 84);
    inked(ctx, rectP(wx - 6, winY - 6, 72, 96), B, 2, W);
    fillP(ctx, win, lit ? W : B);
    if (lit) {
      if (R() < 0.5) {
        // figure silhouette in the window
        const f = P();
        circP(wx + 30, winY + 36, 9, f);
        f.moveTo(wx + 12, winY + 84); f.quadraticCurveTo(wx + 14, winY + 50, wx + 30, winY + 48); f.quadraticCurveTo(wx + 46, winY + 50, wx + 48, winY + 84); f.closePath();
        f.rect(wx + 16, winY + 24, 28, 5);
        fillP(ctx, f, B);
      } else {
        const bl = P();
        for (let y = winY + 4; y < winY + 60; y += 7) bl.rect(wx, y, 60, 3);
        fillP(ctx, bl, B);
      }
    }
    strokeP(ctx, lineP(wx + 30, winY, wx + 30, winY + 84), 2, lit ? B : W);
    fillP(ctx, rectP(wx - 8, winY + 88, 76, 5), W);
  }

  // fire escape (black iron with moonlit rim)
  const fx = R.r(0.1, 0.55) * w, fw = Math.min(260, w * 0.35);
  const fe = P();
  const levels = [winY + 96, winY + 96 + 150];
  for (const ly of levels) {
    fe.rect(fx, ly, fw, 5);
    fe.rect(fx, ly - 34, fw, 3);
    for (let rx = fx; rx <= fx + fw; rx += 10) fe.rect(rx, ly - 34, 2, 34);
  }
  const lad = P();
  lad.moveTo(fx + fw - 30, levels[0]); lad.lineTo(fx + fw - 90, levels[1]);
  lad.moveTo(fx + fw - 14, levels[0]); lad.lineTo(fx + fw - 74, levels[1]);
  for (let t = 0.1; t < 1; t += 0.1) { lad.moveTo(fx + fw - 30 - 60 * t, levels[0] + 150 * t); lad.lineTo(fx + fw - 14 - 60 * t, levels[0] + 150 * t); }
  lad.moveTo(fx + 20, levels[1]); lad.lineTo(fx + 20, levels[1] + 120);
  lad.moveTo(fx + 40, levels[1]); lad.lineTo(fx + 40, levels[1] + 120);
  for (let y = levels[1] + 10; y < levels[1] + 120; y += 14) { lad.moveTo(fx + 20, y); lad.lineTo(fx + 40, y); }

  // street light washing the lower wall. Its top edge is the hard shadow
  // line thrown by the building across the alley (stepped roofline).
  const yLo = Math.min(groundY - 200, winY + 150), yHi = groundY - 190;
  const edge = [];
  {
    let x = -20, y = R.r(yLo, yHi);
    edge.push([x, y]);
    while (x < w + 20) {
      x += R.r(140, 320);
      edge.push([x, y]);
      const ny2 = Math.max(yLo, Math.min(yHi, y + R.sign() * R.r(40, 90)));
      x += Math.abs(ny2 - y) * R.r(0.3, 0.9);
      y = ny2;
      edge.push([x, y]);
    }
  }
  const lit = polyP(edge.concat([[w + 30, groundY], [-20, groundY]]));
  const edgeLine = polyP(edge, false);
  const sdx = R.sign() * R.r(40, 80), sdy = R.r(50, 80);
  clipped(ctx, lit, () => {
    fillP(ctx, rectP(0, 0, w, h), W);
    bricksFull(ctx, 0, roofBase, w, groundY - roofBase, { bw: 30, bh: 13, color: B, lw: 1.1 });
    // posterized soft edge along the shadow line
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = halftone(ctx, B, 6, 1.2); ctx.lineWidth = 90; ctx.stroke(edgeLine);
    ctx.strokeStyle = halftone(ctx, B, 6, 2.1); ctx.lineWidth = 44; ctx.stroke(edgeLine);
    ctx.strokeStyle = B; ctx.lineWidth = 12; ctx.stroke(edgeLine);
    ctx.restore();
    // hard cast shadows of the fire escape and a drainpipe
    ctx.save();
    ctx.translate(sdx, sdy);
    fillP(ctx, fe, B);
    strokeP(ctx, lad, 3.4, B);
    ctx.restore();
  });
  // drainpipe with its shadow
  const dpx = R.r(0.05, 0.95) * w;
  clipped(ctx, lit, () => fillP(ctx, rectP(dpx + sdx * 0.3, roofBase, 10, groundY - roofBase), B));
  fillP(ctx, rectP(dpx - 6, roofBase + 20, 12, groundY - roofBase - 20), B);
  strokeP(ctx, lineP(dpx - 6, roofBase + 20, dpx - 6, groundY), 1.4, W);
  const brk = P(); for (let y = roofBase + 60; y < groundY; y += 110) brk.rect(dpx - 9, y, 18, 5);
  fillP(ctx, brk, B); strokeP(ctx, brk, 1, W);

  // back door with a caged lamp
  const dlx = Math.max(80, Math.min(w - 80, R.r(0.15, 0.85) * w));
  const lamps = [[dlx, groundY - 176]];
  inked(ctx, rectP(dlx - 44, groundY - 158, 88, 158), B, 0);
  fillP(ctx, rectP(dlx - 36, groundY - 150, 72, 150), B);
  const dk = P();
  dk.rect(dlx - 30, groundY - 140, 60, 3);
  fillP(ctx, dk, W);
  fillP(ctx, circP(dlx + 24, groundY - 72, 3), W);
  inked(ctx, rectP(dlx - 50, groundY - 164, 100, 8), B, 1.2, W);
  fillP(ctx, circP(dlx, groundY - 180, 16), B);
  ringGlow(ctx, dlx, groundY - 180, [{ r: 34, c: B }, { r: 12, c: W }], { spacing: 5, fade: 0.9 });
  inked(ctx, rrectP(dlx - 9, groundY - 192, 18, 20, 5), W, 1.8, B);
  const cage = P(); cage.moveTo(dlx - 9, groundY - 182); cage.lineTo(dlx + 9, groundY - 182); cage.moveTo(dlx, groundY - 192); cage.lineTo(dlx, groundY - 172);
  strokeP(ctx, cage, 1.4, B);

  // fire escape itself: black iron, rimmed where it hangs in the dark
  fillP(ctx, fe, B);
  strokeP(ctx, lad, 3, B);
  ctx.save();
  const notLit = P();
  notLit.rect(-10, -10, w + 20, h + 20);
  notLit.addPath(lit);
  ctx.clip(notLit, 'evenodd');
  strokeP(ctx, fe, 1, W);
  strokeP(ctx, lad, 1, W);
  ctx.restore();

  // RED neon sign
  const nx = fx + fw + 60 < w - 60 ? fx + fw + R.r(40, 100) : Math.max(60, fx - 70);
  const word = R.pick(['HOTEL', 'BAR', 'EAT', 'CLUB', 'GIN']);
  const ny = winY + 10, nh = word.length * 44 + 20;
  ringGlow(ctx, nx, ny + nh / 2, [{ r: nh * 0.75, c: B }, { r: nh * 0.55, c: B }], { spacing: 7 });
  clipped(ctx, rectP(nx - nh, ny - nh * 0.3, nh * 2, nh * 1.6), () => {
    halftoneGradient(ctx, nx - nh * 0.75, ny + nh / 2 - nh * 0.75, nh * 1.5, nh * 1.5, RED, { spacing: 7, dir: 'center', cx: nx, cy: ny + nh / 2, from: 0.3, to: 0.95, maxR: 4.3 });
  });
  inked(ctx, rrectP(nx - 28, ny, 56, nh, 6), B, 2.5, W);
  strokeP(ctx, lineP(nx - 28, ny + 20, nx - 60, ny + 20), 3, W);
  [...word].forEach((ch, i) => neon(ctx, ch, nx, ny + 34 + i * 44, 40, RED, { core: W, ink: B, haloAlpha: 0 }));

  // wet ground with reflections
  const g = rectP(-5, groundY, w + 10, h - groundY + 5);
  fillP(ctx, g, B);
  clipped(ctx, g, () => {
    // the lit wall mirrored in the wet pavement
    const rfl = P();
    for (let y = groundY + 3; y < groundY + 30; y += 3.2) {
      const k = 1 - (y - groundY) / 30;
      for (let x = R() * 30; x < w; x += R.r(20, 60)) rfl.rect(x, y, R.r(8, 40) * k, 1.4);
    }
    fillP(ctx, rfl, W);
    for (const [lx] of lamps) fillP(ctx, ellP(lx, groundY + 12, 60, 5), W);
    const rf = P();
    for (let i = 0; i < 16; i++) rf.rect(nx - 20 + R() * 40, groundY + 4 + i * 2.4, R.r(6, 30), 1.4);
    fillP(ctx, rf, RED);
    const st = P();
    for (let i = 0; i < w / 40; i++) st.rect(R() * w, groundY + 4 + R() * 34, R.r(10, 40), 1.4);
    fillP(ctx, st, W);
  });
  strokeP(ctx, lineP(-5, groundY, w + 5, groundY), 2, W);
  noirRain(ctx, R, w, groundY, lit, 1);
  return { air: '#9a9a9a', light: -1 };
}

// ------------------------------------------------------------------ office

export function office(ctx, w, h, R) {
  const floorY = h - 40;
  fillP(ctx, rectP(0, 0, w, h), B);
  const winLeft = R.chance(0.5);
  const ww = Math.min(Math.max(220, w * 0.3), 420), wh = Math.min(h * 0.5, 420);
  const wx = winLeft ? Math.max(40, w * 0.06) : w - Math.max(40, w * 0.06) - ww, wy = h * 0.1;

  // lower wall: mid grey (dot screen) so fighters read against it
  const railY = Math.round(h * 0.42);
  const low = rectP(-5, railY, w + 10, floorY - railY);
  fillP(ctx, low, W);
  dotsIn(ctx, low, B, 5, 1.55);
  fillP(ctx, rectP(-5, railY - 6, w + 10, 6), B);
  strokeP(ctx, lineP(-5, railY, w + 5, railY), 1.4, W);

  // --- light through the venetian blinds: a lit wedge crossed by slat shadows
  const dir = winLeft ? 1 : -1;
  const lightArea = polyP(winLeft
    ? [[wx + ww, wy + wh * 0.35], [w + 40, wy + wh * 0.6], [w + 40, h + 40], [wx + ww * 0.2, h + 40]]
    : [[wx, wy + wh * 0.35], [-40, wy + wh * 0.6], [-40, h + 40], [wx + ww * 0.8, h + 40]]);
  const shadows = P();
  const sx0 = winLeft ? wx + ww * 0.5 : wx + ww * 0.5;
  const period = 58;
  for (let i = -2; i < 26; i++) {
    const y0 = wy + wh * 0.3 + i * period;
    if (y0 > h + 60) break;
    const len = w * 1.3;
    shadows.moveTo(sx0, y0);
    shadows.lineTo(sx0 + dir * len, y0 + len * 0.3);
    shadows.lineTo(sx0 + dir * len, y0 + len * 0.3 + 15);
    shadows.lineTo(sx0, y0 + 7);
    shadows.closePath();
  }
  ctx.save();
  ctx.clip(lightArea);
  fillP(ctx, rectP(0, 0, w, h), W);
  fillP(ctx, shadows, B);
  // the light falls off with distance from the window
  halftoneGradient(ctx, 0, 0, w, h, B, { spacing: 7, dir: winLeft ? 'right' : 'left', from: 0.4, to: 1.3, maxR: 4.3 });
  ctx.restore();

  // --- the window & city
  const win = rectP(wx, wy, ww, wh);
  clipped(ctx, win, () => {
    fillP(ctx, win, W);
    halftoneGradient(ctx, wx, wy, ww, wh, B, { spacing: 6, dir: 'up', from: 0.2, maxR: 3.6 });
    skyline(ctx, R, { x0: wx - 10, x1: wx + ww + 10, base: wy + wh + 4, hMin: wh * 0.3, hMax: wh * 0.8, wMin: 30, wMax: 70, fill: B, lw: 0, kinds: ['flat', 'step', 'spire', 'antenna', 'tank'],
      onBuilding: (b) => windows(ctx, R, b, { ww: 3, wh: 5, gx: 5, gy: 6, litP: 0.2, lit: W, pad: 4 }) });
    // red neon outside
    const nx = wx + ww * R.r(0.3, 0.7), ny = wy + wh * R.r(0.45, 0.6);
    fillP(ctx, circP(nx, ny, 90), B);
    halftoneGradient(ctx, nx - 90, ny - 90, 180, 180, RED, { spacing: 6, dir: 'center', cx: nx, cy: ny, from: 0.3, maxR: 3.7 });
    neon(ctx, R.pick(['HOTEL', 'BAR', 'ROOMS']), nx, ny, 36, RED, { core: W, ink: B, haloAlpha: 0 });
    rain(ctx, R, wx, wy, ww, wh, 90, { angle: 1.4, len: 26, color: W, lw: 1 });
  });
  // half-raised blinds
  const blindH = wh * R.r(0.3, 0.55);
  const bl = P();
  for (let y = wy; y < wy + blindH; y += 9) bl.rect(wx, y, ww, 5.5);
  fillP(ctx, rectP(wx, wy, ww, blindH), B);
  fillP(ctx, bl, W);
  hatchIn(ctx, rectP(wx, wy, ww, blindH), B, 5, 1.1);
  fillP(ctx, rectP(wx, wy + blindH - 4, ww, 8), W);
  strokeP(ctx, rectP(wx, wy + blindH - 4, ww, 8), 2, B);
  const cord = lineP(wx + ww - 20, wy + blindH, wx + ww - 20, wy + blindH + 90);
  strokeP(ctx, cord, 1.6, W);
  // frame + mullions
  const fr = P();
  fr.rect(wx - 10, wy - 10, ww + 20, 10);
  fr.rect(wx - 10, wy + wh, ww + 20, 14);
  fr.rect(wx - 10, wy, 10, wh);
  fr.rect(wx + ww, wy, 10, wh);
  fr.rect(wx + ww / 2 - 4, wy, 8, wh);
  fr.rect(wx, wy + wh * 0.55, ww, 7);
  fillP(ctx, fr, B);
  strokeP(ctx, fr, 1.4, W);

  // --- door with frosted glass on the far side
  const dx = winLeft ? w - Math.max(60, w * 0.08) - 150 : Math.max(60, w * 0.08);
  const dy = floorY - 250;
  if (Math.abs(dx + 75 - (wx + ww / 2)) > ww / 2 + 110) {
    const door = rectP(dx, dy, 150, 250);
    fillP(ctx, door, B);
    strokeP(ctx, rectP(dx - 8, dy - 8, 166, 258), 2, W);
    const glass = rectP(dx + 16, dy + 16, 118, 110);
    fillP(ctx, glass, W);
    dotsIn(ctx, glass, B, 4.5, 0.8);
    ctx.save();
    ctx.translate(dx + 75, dy + 60);
    ctx.scale(-1, 1);
    letters(ctx, 'PRIVATE', 0, -18, 20, B);
    letters(ctx, 'INVESTIGATOR', 0, 6, 15, B);
    letters(ctx, R.pick(['S. SPADE', 'M. HAMMER', 'J. GUMSHOE', 'P. MARLOW']), 0, 30, 14, B);
    ctx.restore();
    strokeP(ctx, glass, 2, B);
    fillP(ctx, circP(dx + 130, dy + 140, 5), W);
  }

  // --- filing cabinet + coat rack silhouettes with blind stripes playing over them
  const objs = P();
  const cabX = winLeft ? wx + ww + R.r(40, 120) : wx - R.r(40, 120) - 70;
  objs.rect(cabX, floorY - 160, 70, 160);
  const rackX = winLeft ? Math.min(w - 60, cabX + R.r(150, 260)) : Math.max(60, cabX - R.r(110, 200));
  objs.rect(rackX - 3, floorY - 200, 6, 200);
  objs.rect(rackX - 26, floorY - 6, 52, 6);
  objs.moveTo(rackX - 22, floorY - 190); objs.quadraticCurveTo(rackX - 30, floorY - 150, rackX - 18, floorY - 120); objs.lineTo(rackX + 18, floorY - 120); objs.quadraticCurveTo(rackX + 30, floorY - 150, rackX + 22, floorY - 190); objs.closePath();
  objs.moveTo(rackX - 22, floorY - 200); objs.quadraticCurveTo(rackX, floorY - 222, rackX + 22, floorY - 200); objs.closePath();
  objs.rect(rackX - 30, floorY - 204, 60, 5);
  fillP(ctx, objs, B);
  crescent(ctx, objs, winLeft ? 3 : -3, 2, W);
  strokeP(ctx, objs, 1.2, W);
  const drawers = P();
  for (let k = 0; k < 3; k++) { drawers.rect(cabX + 8, floorY - 150 + k * 50, 54, 40); drawers.rect(cabX + 25, floorY - 134 + k * 50, 20, 5); }
  strokeP(ctx, drawers, 1.4, W);

  // --- ceiling fan
  const fanX = w * R.r(0.3, 0.7);
  const fan = P();
  fan.rect(fanX - 2, 0, 4, 40);
  ellP(fanX, 46, 16, 8, 0, fan);
  ellP(fanX - 60, 50, 50, 6, 0.08, fan);
  ellP(fanX + 60, 50, 50, 6, -0.08, fan);
  fillP(ctx, fan, B);
  strokeP(ctx, fan, 1.4, W);

  // --- desk silhouette with a lamp pool (behind the fight, at the back wall)
  const deskX = winLeft ? Math.min(w - 280, wx + ww * 0.2) : Math.max(20, wx + ww * 0.8 - 260);
  const deskTop = floorY - 64;
  const lampX = deskX + 60;
  const pool = coneP(lampX, deskTop - 58, deskTop + 4, 0.75, 10);
  fillP(ctx, pool, W);
  falloff(ctx, pool, lampX - 100, deskTop - 60, 200, 70, lampX, deskTop - 58, { from: 0.55 });
  const desk = P();
  desk.rect(deskX, deskTop, 260, 12);
  desk.rect(deskX + 8, deskTop + 12, 70, floorY - deskTop - 12);
  desk.rect(deskX + 182, deskTop + 12, 70, floorY - deskTop - 12);
  fillP(ctx, desk, B);
  strokeP(ctx, desk, 1.6, W);
  const lamp = P();
  lamp.moveTo(lampX - 30, deskTop - 58); lamp.lineTo(lampX + 30, deskTop - 58); lamp.lineTo(lampX + 16, deskTop - 76); lamp.lineTo(lampX - 16, deskTop - 76); lamp.closePath();
  lamp.rect(lampX - 2, deskTop - 58, 4, 58);
  ellP(lampX, deskTop - 2, 14, 4, 0, lamp);
  inked(ctx, lamp, RED, 1.6, B);
  // bottle + glass on the desk
  const btl = P();
  btl.rect(deskX + 200, deskTop - 40, 16, 40); btl.rect(deskX + 205, deskTop - 54, 6, 14);
  btl.rect(deskX + 224, deskTop - 16, 12, 16);
  fillP(ctx, btl, B);
  strokeP(ctx, btl, 1.2, W);

  // floor boards
  const fl = rectP(-5, floorY, w + 10, h - floorY + 5);
  fillP(ctx, fl, W);
  dotsIn(ctx, fl, B, 5, 1.1);
  clipped(ctx, fl, () => {
    const b = P();
    for (let y = floorY + 13; y < h; y += 13) { b.moveTo(0, y); b.lineTo(w, y); }
    strokeP(ctx, b, 1.1, B);
  });
  strokeP(ctx, lineP(-5, floorY, w + 5, floorY), 3, B);
  fillP(ctx, rectP(-5, floorY - 12, w + 10, 12), B);
  strokeP(ctx, lineP(-5, floorY - 12, w + 5, floorY - 12), 1.4, W);
  return { air: '#9a9a9a', light: winLeft ? -1 : 1 };
}

// ------------------------------------------------------------------ club

function drapePath(x0, x1, top, bot, folds, sway = 0) {
  const p = P();
  p.moveTo(x0, top);
  p.lineTo(x1, top);
  p.quadraticCurveTo(x1 + sway, (top + bot) / 2, x1, bot);
  const n = folds;
  for (let i = n; i > 0; i--) {
    const xa = x0 + ((i - 0.5) / n) * (x1 - x0), xb = x0 + ((i - 1) / n) * (x1 - x0);
    p.quadraticCurveTo(xa, bot + 12, xb, bot);
  }
  p.quadraticCurveTo(x0 - sway, (top + bot) / 2, x0, top);
  p.closePath();
  return p;
}

function foldStripes(ctx, clip, x0, x1, top, bot, n, R) {
  ctx.save();
  ctx.clip(clip);
  const f = P();
  const dw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const fx = x0 + i * dw + dw * 0.55;
    const fw = dw * R.r(0.22, 0.34);
    f.moveTo(fx, top);
    f.bezierCurveTo(fx - fw * 0.3, top + (bot - top) * 0.4, fx + fw * 0.4, top + (bot - top) * 0.7, fx - fw * 0.2, bot + 20);
    f.lineTo(fx + fw, bot + 20);
    f.bezierCurveTo(fx + fw * 1.2, top + (bot - top) * 0.7, fx + fw * 0.5, top + (bot - top) * 0.4, fx + fw * 0.6, top);
    f.closePath();
  }
  fillP(ctx, f, B);
  // hatched half-tones beside each fold
  const hf = P();
  for (let i = 0; i < n; i++) hf.rect(x0 + i * dw + dw * 0.2, top, dw * 0.28, bot - top + 20);
  ctx.fillStyle = hatchPatternFor(ctx);
  ctx.fill(hf);
  ctx.restore();
}
function hatchPatternFor(ctx) {
  // vertical-ish hatch: reuse the diagonal hatch pattern rotated via transform-free trick
  return halftone(ctx, B, 4, 1.1);
}

export function club(ctx, w, h, R) {
  const floorY = h - 40;
  const stageY = Math.round(floorY - R.r(150, 190));
  fillP(ctx, rectP(0, 0, w, h), B);

  // back curtain (red with black folds)
  const bc = rectP(0, 0, w, stageY);
  fillP(ctx, bc, RED);
  foldStripes(ctx, bc, 0, w, 0, stageY, Math.max(6, Math.round(w / 70)), R);

  const singerX = R.r(0.35, 0.65) * w;
  // band silhouettes: grand piano & a sax player, rim-lit in white
  const pianoX = singerX < w / 2 ? w * R.r(0.68, 0.8) : w * R.r(0.2, 0.32);
  const pn = P();
  pn.moveTo(pianoX - 110, stageY - 60); pn.lineTo(pianoX + 60, stageY - 60);
  pn.bezierCurveTo(pianoX + 120, stageY - 60, pianoX + 100, stageY - 100, pianoX + 130, stageY - 90);
  pn.lineTo(pianoX + 130, stageY - 48); pn.lineTo(pianoX - 110, stageY - 48); pn.closePath();
  polyP([[pianoX - 100, stageY - 60], [pianoX - 60, stageY - 150], [pianoX - 52, stageY - 146], [pianoX - 86, stageY - 60]], true, pn);
  pn.rect(pianoX - 100, stageY - 48, 8, 48); pn.rect(pianoX + 110, stageY - 48, 8, 48);
  circP(pianoX - 150, stageY - 92, 11, pn);
  pn.moveTo(pianoX - 166, stageY - 80); pn.lineTo(pianoX - 134, stageY - 80); pn.lineTo(pianoX - 124, stageY - 40); pn.lineTo(pianoX - 170, stageY - 40); pn.closePath();
  pn.rect(pianoX - 166, stageY - 40, 10, 40); pn.rect(pianoX - 140, stageY - 40, 10, 40);
  fillP(ctx, pn, B);
  strokeP(ctx, pn, 1.6, W);
  const kx = P();
  for (let k = 0; k < 10; k++) kx.rect(pianoX - 108 + k * 6, stageY - 58, 3, 6);
  fillP(ctx, kx, W);
  const saxX = singerX < w / 2 ? Math.max(40, singerX - R.r(160, 240)) : Math.min(w - 40, singerX + R.r(160, 240));
  const sp = P();
  circP(saxX, stageY - 150, 12, sp);
  sp.rect(saxX - 14, stageY - 164, 28, 5);
  sp.moveTo(saxX - 18, stageY - 136); sp.lineTo(saxX + 18, stageY - 136); sp.lineTo(saxX + 14, stageY - 70); sp.lineTo(saxX + 16, stageY); sp.lineTo(saxX + 4, stageY); sp.lineTo(saxX, stageY - 60); sp.lineTo(saxX - 4, stageY); sp.lineTo(saxX - 16, stageY); sp.lineTo(saxX - 14, stageY - 70); sp.closePath();
  fillP(ctx, sp, B);
  strokeP(ctx, sp, 1.6, W);
  const sax = P();
  sax.moveTo(saxX + 4, stageY - 140); sax.quadraticCurveTo(saxX + 26, stageY - 120, saxX + 22, stageY - 84); sax.quadraticCurveTo(saxX + 18, stageY - 70, saxX + 32, stageY - 72);
  ctx.save(); ctx.lineCap = 'round';
  strokeP(ctx, sax, 7, W); strokeP(ctx, sax, 4, B);
  ctx.restore();
  const notes = P();
  for (let i = 0; i < 3; i++) {
    const nx = saxX + 40 + i * 24, ny = stageY - 110 - i * 26;
    ellP(nx, ny, 6, 4.5, -0.4, notes); notes.rect(nx + 4, ny - 26, 2.5, 26);
  }
  fillP(ctx, notes, W);

  // side drapes + valance
  const dw = Math.min(w * 0.14, 180);
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -20 : w - dw, x1 = side < 0 ? dw : w + 20;
    const d = drapePath(x0, x1, 0, stageY + 30, 5, side * 20);
    fillP(ctx, d, RED);
    foldStripes(ctx, d, x0, x1, 0, stageY + 30, 5, R);
    strokeP(ctx, d, 2.4, B);
    // tie-back
    const ty = stageY * 0.6;
    inked(ctx, rrectP(side < 0 ? dw - 30 : w - dw - 10, ty, 40, 14, 6), W, 2, B);
  }
  const val = P();
  const nv = Math.max(4, Math.round(w / 180));
  val.moveTo(-10, 0);
  for (let i = 0; i < nv; i++) {
    const xa = (i / nv) * w, xb = ((i + 1) / nv) * w;
    val.lineTo(xa, 40);
    val.quadraticCurveTo((xa + xb) / 2, 110, xb, 40);
  }
  val.lineTo(w + 10, 0);
  val.closePath();
  fillP(ctx, val, RED);
  clipped(ctx, val, () => {
    const vf = P();
    for (let i = 0; i < nv; i++) {
      const xa = (i / nv) * w, xb = ((i + 1) / nv) * w;
      vf.moveTo(xa + 10, 50); vf.quadraticCurveTo((xa + xb) / 2, 100, xb - 10, 50);
      vf.moveTo(xa + 20, 64); vf.quadraticCurveTo((xa + xb) / 2, 96, xb - 20, 64);
    }
    strokeP(ctx, vf, 5, B);
    fillP(ctx, rectP(0, 0, w, 30), B);
    fillP(ctx, rectP(0, 26, w, 4), W);
  });
  strokeP(ctx, val, 2.4, B);

  // spotlight from the top corner onto the singer
  const from = R.chance(0.5) ? -40 : w + 40;
  const spot = polyP([[from - 30, -20], [from + 30, -20], [singerX + 90, stageY + 10], [singerX - 90, stageY + 10]]);
  fillP(ctx, spot, W);
  falloff(ctx, spot, Math.min(from, singerX) - 120, -20, Math.abs(from - singerX) + 240, stageY + 40, singerX, stageY - 60, { from: 0.4, to: 1.05, spacing: 7 });
  const pool = ellP(singerX, stageY + 4, 120, 16);
  fillP(ctx, pool, W);

  // singer silhouette at the mic, rim-lit
  const s = P();
  const sx = singerX, sb = stageY + 4;
  circP(sx, sb - 150, 13, s);
  s.moveTo(sx - 8, sb - 138); s.lineTo(sx + 8, sb - 138); s.lineTo(sx + 16, sb - 120); s.lineTo(sx + 10, sb - 88);
  s.quadraticCurveTo(sx + 18, sb - 60, sx + 34, sb); s.lineTo(sx - 30, sb); s.quadraticCurveTo(sx - 14, sb - 60, sx - 10, sb - 88);
  s.lineTo(sx - 16, sb - 120); s.closePath();
  s.moveTo(sx - 12, sb - 160); s.quadraticCurveTo(sx - 26, sb - 130, sx - 18, sb - 110); s.lineTo(sx - 8, sb - 140); s.closePath();
  const mic = P();
  mic.rect(sx + 26, sb - 128, 3, 128);
  mic.rect(sx + 14, sb - 3, 28, 3);
  ellP(sx + 27, sb - 134, 5, 8, 0, mic);
  fillP(ctx, s, B);
  fillP(ctx, mic, B);
  fillP(ctx, circP(sx + 7, sb - 118, 3), RED); // a red flower
  strokeP(ctx, lineP(sx + 12, sb - 122, sx + 24, sb - 132), 3, B);

  // stage front
  const apron = rectP(-5, stageY + 4, w + 10, 34);
  fillP(ctx, apron, B);
  fillP(ctx, rectP(-5, stageY + 30, w + 10, 8), W);
  hatchIn(ctx, rectP(-5, stageY + 30, w + 10, 8), B, 3.6, 1.1, true);
  strokeP(ctx, lineP(-5, stageY + 4, w + 5, stageY + 4), 3, W);
  const bulbs = P();
  for (let x = 20; x < w; x += 40) circP(x, stageY + 20, 4, bulbs);
  fillP(ctx, bulbs, W);

  // the room in front of the stage: smoky, lit by the stage (mid-light)
  const at = stageY + 38;
  const room = rectP(-5, at, w + 10, h - at + 5);
  fillP(ctx, room, W);
  clipped(ctx, room, () => halftoneGradient(ctx, 0, at, w, floorY - at, B, { spacing: 6, dir: 'down', from: 0, to: 1.6, maxR: 3.8 }));
  // a few café tables: black pedestals, white cloths, red lamps
  const nt = Math.max(1, Math.round(w / 420));
  for (let i = 0; i < nt; i++) {
    const tx = ((i + R.r(0.25, 0.75)) / nt) * w, ty = floorY - 56;
    const t = P();
    t.rect(tx - 4, ty, 8, floorY - ty);
    ellP(tx, floorY - 2, 22, 4, 0, t);
    fillP(ctx, t, B);
    inked(ctx, polyP([[tx - 34, ty], [tx + 34, ty], [tx + 30, ty + 14], [tx - 30, ty + 14]]), W, 1.8, B);
    inked(ctx, polyP([[tx - 8, ty - 18], [tx + 8, ty - 18], [tx + 11, ty - 4], [tx - 11, ty - 4]]), RED, 1.4, B);
    fillP(ctx, rectP(tx - 1.5, ty - 4, 3, 4), B);
  }
  // floor: plain boards
  strokeP(ctx, lineP(-5, floorY, w + 5, floorY), 2.4, B);
  const fl = rectP(-5, floorY, w + 10, h - floorY + 5);
  fillP(ctx, fl, W);
  dotsIn(ctx, fl, B, 5, 1.2);
  return { air: '#9a9a9a', light: from < 0 ? -1 : 1 };
}

// ------------------------------------------------------------------ docks

export function docks(ctx, w, h, R) {
  const pierY = h - 46;
  const waterY = Math.round(h * R.r(0.62, 0.7));
  // foggy night sky: paper with ink dots thickening upward
  fillP(ctx, rectP(0, 0, w, h), W);
  halftoneGradient(ctx, 0, 0, w, waterY, B, { spacing: 7, dir: 'up', from: 0.2, maxR: 4.4 });
  // hazy moon: clear the sky screen around it, dots shrinking toward the disc
  const mx = R.r(0.15, 0.85) * w, my = h * R.r(0.14, 0.24), mr = Math.max(40, Math.min(80, w * 0.05));
  const hr = mr * 2.4;
  fillP(ctx, circP(mx, my, hr), W);
  {
    const sp = 7, halo = P();
    const y0 = Math.floor((my - hr) / (sp * 0.5)) * sp * 0.5;
    for (let yy = y0, row = Math.round(y0 / (sp * 0.5)); yy <= my + hr; yy += sp * 0.5, row++) {
      let t = 1 - yy / waterY; t = (t - 0.2) / 0.8; if (t <= 0) continue; if (t > 1) t = 1;
      const rs = 4.4 * t;
      const off = row % 2 ? sp / 2 : 0;
      for (let xx = Math.floor((mx - hr) / sp) * sp + off; xx <= mx + hr; xx += sp) {
        const d = Math.hypot(xx - mx, yy - my);
        if (d > hr) continue;
        const k = Math.max(0, Math.min(1, (d - mr * 1.15) / (hr - mr * 1.15)));
        const r = rs * k * k;
        if (r < 0.35) continue;
        halo.moveTo(xx + r, yy); halo.arc(xx, yy, r, 0, TAU);
      }
    }
    fillP(ctx, halo, B);
  }
  fillP(ctx, circP(mx, my, mr), W);
  strokeP(ctx, circP(mx, my, mr), 2.4, B);
  dotsIn(ctx, ellP(mx + mr * 0.25, my + mr * 0.2, mr * 0.5, mr * 0.35, 0.4), B, 5, 1.3);
  dotsIn(ctx, ellP(mx - mr * 0.35, my - mr * 0.3, mr * 0.2, mr * 0.15, 0.2), B, 5, 1.1);

  // far cranes (grey via dots = lost in the fog)
  const crane = (x, base, s, style, dir = 1) => {
    const legH = s * 0.62, beamY = base - legH, span = s * 0.42;
    const thick = P(), thin = P(), solidP = P();
    thick.moveTo(x - span / 2, base); thick.lineTo(x - span / 2, beamY);
    thick.moveTo(x + span / 2, base); thick.lineTo(x + span / 2, beamY);
    for (let k = 0; k < legH - 20; k += 28) { thin.moveTo(x - span / 2, base - k); thin.lineTo(x + span / 2, base - k - 28); thin.moveTo(x - span / 2, base - k - 28); thin.lineTo(x + span / 2, base - k); }
    const b0 = x - dir * s * 0.38, b1 = x + dir * s * 1.05;
    thick.moveTo(b0, beamY); thick.lineTo(b1, beamY);
    thick.moveTo(b0, beamY - 16); thick.lineTo(b1 - dir * 24, beamY - 16);
    const n = Math.round(Math.abs(b1 - b0) / 18);
    for (let i = 0; i < n; i++) {
      const xa = b0 + ((b1 - dir * 24 - b0) * i) / n, xb = b0 + ((b1 - dir * 24 - b0) * (i + 1)) / n;
      thin.moveTo(xa, beamY - 16); thin.lineTo((xa + xb) / 2, beamY); thin.lineTo(xb, beamY - 16);
    }
    const ax = x - dir * span * 0.1, ay = beamY - s * 0.4;
    thick.moveTo(x - span * 0.4, beamY - 16); thick.lineTo(ax, ay); thick.lineTo(x + span * 0.4, beamY - 16);
    thin.moveTo(ax, ay); thin.lineTo(b1 - dir * 24, beamY - 16);
    thin.moveTo(ax, ay); thin.lineTo(x + dir * s * 0.55, beamY - 16);
    thin.moveTo(ax, ay); thin.lineTo(b0, beamY - 16);
    solidP.rect(Math.min(b0, b0 + dir * 50), beamY - 42, 50, 26);
    solidP.rect(x - span / 2 - 8, base - 10, 16, 10); solidP.rect(x + span / 2 - 8, base - 10, 16, 10);
    const tx = x + dir * s * R.r(0.45, 0.9);
    solidP.rect(tx - 12, beamY, 24, 12);
    const drop = s * R.r(0.2, 0.35);
    thin.moveTo(tx - 6, beamY + 12); thin.lineTo(tx - 12, beamY + drop);
    thin.moveTo(tx + 6, beamY + 12); thin.lineTo(tx + 12, beamY + drop);
    solidP.rect(tx - 26, beamY + drop, 52, 7);
    if (style === 'grey') {
      const g = halftone(ctx, B, 4, 1.4);
      ctx.save();
      ctx.strokeStyle = g; ctx.lineWidth = 5; ctx.stroke(thick);
      ctx.lineWidth = 2; ctx.stroke(thin);
      ctx.fillStyle = g; ctx.fill(solidP);
      ctx.restore();
    } else {
      strokeP(ctx, thick, 6, B);
      strokeP(ctx, thin, 2.2, B);
      fillP(ctx, solidP, B);
      fillP(ctx, circP(ax, ay - 4, 4), RED);
    }
  };
  const ncr = Math.max(1, Math.round(w / 500));
  for (let i = 0; i < ncr; i++) crane(((i + R.r(0.2, 0.8)) / ncr) * w, waterY, R.r(200, 280), 'grey', R.sign());

  // warehouses on the far quay
  const wh = P();
  let x = -20;
  while (x < w + 20) {
    const bw = R.r(120, 240), bh = R.r(50, 110);
    wh.moveTo(x, waterY); wh.lineTo(x, waterY - bh); wh.lineTo(x + bw / 2, waterY - bh - R.r(10, 30)); wh.lineTo(x + bw, waterY - bh); wh.lineTo(x + bw, waterY); wh.closePath();
    x += bw + R.r(0, 40);
  }
  fillP(ctx, wh, halftone(ctx, B, 4.5, 1.9));

  // fog bank over the far quay
  const fog = P();
  for (let fx = -60; fx < w + 60; fx += R.r(60, 110)) cloudPath(fx, waterY - R.r(0, 20), R.r(60, 110), R.r(18, 32), 7, (R() * 1e6) | 0, fog);
  fillP(ctx, fog, W);

  // the big ship: black hull, red waterline, rim-lit
  const shipLeft = R.chance(0.5);
  const sw2 = Math.min(w * 0.75, 900), shipX = shipLeft ? -sw2 * 0.25 : w - sw2 * 0.75;
  const deckY = waterY - R.r(170, 230);
  const hull = P();
  const bowX = shipLeft ? shipX + sw2 : shipX;
  const sternX = shipLeft ? shipX : shipX + sw2;
  const bowDir = shipLeft ? 1 : -1;
  hull.moveTo(sternX, deckY + 10);
  hull.lineTo(bowX + bowDir * 20, deckY - 16);
  hull.quadraticCurveTo(bowX - bowDir * 10, waterY - 40, bowX - bowDir * 70, waterY + 6);
  hull.lineTo(sternX, waterY + 6);
  hull.closePath();
  // superstructure
  const sup = P();
  const sx = sternX + bowDir * sw2 * 0.18;
  sup.rect(Math.min(sx, sx + bowDir * 180), deckY - 70, 180, 80);
  sup.rect(Math.min(sx, sx + bowDir * 130) + bowDir * 20, deckY - 110, 130, 40);
  const fX = sx + bowDir * 70;
  sup.rect(fX - 22, deckY - 190, 44, 90);
  // mast + rigging
  const mastX = sternX + bowDir * sw2 * 0.62;
  sup.rect(mastX - 3, deckY - 200, 6, 200);
  sup.rect(mastX - 40, deckY - 170, 80, 5);
  fillP(ctx, sup, B);
  fillP(ctx, rectP(fX - 22, deckY - 170, 44, 20), RED);
  const rig = P();
  rig.moveTo(mastX, deckY - 200); rig.lineTo(bowX + bowDir * 10, deckY - 16);
  rig.moveTo(mastX, deckY - 200); rig.lineTo(fX, deckY - 190);
  strokeP(ctx, rig, 1.4, B);
  const swin = P();
  for (let k = 0; k < 7; k++) swin.rect(Math.min(sx, sx + bowDir * 180) + 12 + k * 23, deckY - 58, 12, 12);
  fillP(ctx, swin, W);
  fillP(ctx, hull, B);
  clipped(ctx, hull, () => {
    fillP(ctx, rectP(shipX - 50, waterY - 30, sw2 + 100, 26), RED);
    const ports = P();
    for (let k = 0; k < 14; k++) circP(sternX + bowDir * (60 + k * 46), deckY + 40, 5, ports);
    fillP(ctx, ports, W);
    const rv = P();
    for (let y = deckY + 64; y < waterY - 40; y += 24) for (let k = 0; k < 40; k++) circP(sternX + bowDir * (20 + k * 22), y, 1.3, rv);
    fillP(ctx, rv, halftone(ctx, W, 4, 1.2));
  });
  strokeP(ctx, hull, 2, W);
  letters(ctx, 'S.S. ' + R.pick(['MIDNIGHT', 'COLDWATER', 'VERONICA', 'LADY LUCK', 'NIGHTJAR']), sternX + bowDir * sw2 * 0.45, deckY + 18, 22, W, { maxW: sw2 * 0.4 });
  // anchor chain
  const ch = P();
  const ax2 = bowX - bowDir * 60, ay = deckY + 20;
  for (let t = 0; t < 1; t += 0.06) ellP(ax2 - bowDir * t * 30, ay + t * (waterY - ay), 4, 6, 0.3, ch);
  strokeP(ctx, ch, 2, W);


  // water: black, with sparse moon glints
  const water = rectP(-5, waterY, w + 10, pierY - waterY + 5);
  fillP(ctx, water, B);
  clipped(ctx, water, () => {
    const rf = P();
    for (let y = waterY + 6; y < pierY; y += 9) {
      for (let i = 0; i < w / 170; i++) rf.rect(R() * w, y, R.r(12, 44), 1.5);
    }
    fillP(ctx, rf, W);
    const mrf = P();
    for (let y = waterY + 4; y < pierY; y += 6) mrf.rect(mx - R.r(10, 40), y, R.r(20, 80), 2);
    fillP(ctx, mrf, W);
    const red = P();
    for (let y = waterY + 4; y < waterY + 30; y += 6) red.rect(shipX + R() * sw2, y, R.r(10, 30), 1.6);
    fillP(ctx, red, RED);
  });
  // a thick bank of fog rolling in over the lower water: the fight happens in front of it
  const fogTop = Math.max(waterY + 24, pierY - 96);
  const lf = P();
  for (let fx = -80; fx < w + 80; fx += R.r(80, 130)) cloudPath(fx, fogTop + R.r(4, 16), R.r(70, 120), R.r(16, 26), 7, (R() * 1e6) | 0, lf);
  lf.rect(-10, fogTop + 12, w + 20, pierY - fogTop);
  fillP(ctx, lf, W);
  clipped(ctx, lf, () => halftoneGradient(ctx, 0, fogTop - 30, w, pierY - fogTop + 30, B, { spacing: 6, dir: 'up', from: 0.25, to: 1.4, maxR: 3.6 }));

  // pier: planks (paper white w/ ink lines, calm behind the fight)
  const pier = rectP(-5, pierY, w + 10, h - pierY + 5);
  fillP(ctx, pier, W);
  clipped(ctx, pier, () => {
    const pl = P();
    for (let y = pierY + 9; y < h; y += 9) { pl.moveTo(0, y); pl.lineTo(w, y); }
    for (let px = R.r(0, 90); px < w; px += R.r(80, 160)) { pl.moveTo(px, pierY); pl.lineTo(px, h); }
    strokeP(ctx, pl, 1.2, B);
    dotFade(ctx, 0, w, h, pierY + 10, B, 5);
  });
  fillP(ctx, rectP(-5, pierY - 8, w + 10, 10), B);
  const piles = P();
  for (let px = R.r(20, 60); px < w; px += R.r(150, 230)) { piles.rect(px - 9, pierY - 34, 18, 34); ellP(px, pierY - 34, 9, 3, 0, piles); }
  fillP(ctx, piles, B);
  strokeP(ctx, piles, 1.2, W);
  return { air: '#9a9a9a', light: mx < w / 2 ? -1 : 1 };
}
