// Props: background decor (muted, baked into the backdrop) and foreground
// geometry (blocks, platforms, stairs, ladders: full saturation, fat ink).
// A small "material" layer makes every item work in every theme, including
// noir, where colors collapse to black / paper / red + dot or hatch greys.

import {
  INK, NW, NB, NR, TAU, shade, mix, rgba, desat, halftone, hatchPattern, halftoneGradient, cloudPath,
  P, rectP, circP, ellP, polyP, rrectP, lineP, fillP, strokeP, inked, dotsIn, hatchIn, clipped, crescent,
  lum, isSpotRed, monoFill, glow, letters, neon, arcLine, deadTree, hatchLines, mkR, rivetRow, hazardStripes,
  fire, dial, waterTowerPath, bricksFull, handPath,
} from './kit.js';

// ------------------------------------------------------------ materials

const AIR = { hero: '#8391b8', zombie: '#6f6488', space: '#62728f', noir: '#888888' };

const PAL = {
  hero: { metal: '#9aa6b4', metalD: '#5f6b7a', wood: '#b57f4c', woodD: '#7a4f2c', stone: '#b8b0a4', a1: '#e8262b', a2: '#1f5fd1', a3: '#ffd23f', glow: '#7fe8f4', glass: '#9fd8e8', cloth: '#e8e0c8' },
  zombie: { metal: '#8f929c', metalD: '#555866', wood: '#8a6a48', woodD: '#5a4230', stone: '#a4a0ac', a1: '#7fd13b', a2: '#6b2fa0', a3: '#ff8a1f', glow: '#b8f07a', glass: '#b8e0b0', cloth: '#d8d4bc' },
  space: { metal: '#c3ccd8', metalD: '#56637a', wood: '#a88a6a', woodD: '#6a5440', stone: '#9a8aa8', a1: '#23d5e8', a2: '#ff3fa4', a3: '#ffe14a', glow: '#7ff4ff', glass: '#a8f0ff', cloth: '#dfe6ee' },
  noir: { metal: '#8a8a8a', metalD: '#2a2a2a', wood: '#6a6a6a', woodD: '#2a2a2a', stone: '#b0b0b0', a1: '#d7141a', a2: '#2a2a2a', a3: '#f2efe6', glow: '#f2efe6', glass: '#d8d8d8', cloth: '#e8e8e8' },
};

function material(theme, fg) {
  const mono = !!theme.mono;
  const key = theme.key || 'hero';
  const air = AIR[key] || '#888888';
  const pal = PAL[key] || PAL.hero;
  const lw = fg ? 3.4 : 2.2;
  const ink = mono ? NB : INK;
  const col = (hex) => {
    if (mono) return isSpotRed(hex) ? NR : lum(hex) < 0.42 ? NB : NW;
    return fg ? hex : mix(desat(hex, 0.22), air, 0.14);
  };
  const M = {
    mono, fg, lw, ink, pal, key, thin: fg ? 1.8 : 1.3,
    col,
    fill(ctx, path, hex) {
      if (mono) monoFill(ctx, path, hex); else fillP(ctx, path, col(hex));
    },
    // Flat color + form shadow + (fg) rim highlight + ink outline.
    solid(ctx, path, hex, o = {}) {
      const lx = o.lx != null ? o.lx : -5, ly = o.ly != null ? o.ly : -5;
      const w = o.lw != null ? o.lw : lw;
      if (mono) {
        const k = monoFill(ctx, path, hex);
        if (o.shadow !== false) {
          if (k === 'black') { if (o.rim !== false) crescent(ctx, path, -lx * 0.45, -ly * 0.45, NW); }
          else if (k === 'red') crescent(ctx, path, lx, ly, NB);
          else crescent(ctx, path, lx * 1.3, ly * 1.3, hatchPattern(ctx, NB, 3.6, 1.2));
        }
        if (w) strokeP(ctx, path, w, NB);
        return;
      }
      const c = col(hex);
      ctx.fillStyle = c;
      ctx.fill(path);
      if (o.shadow !== false) {
        crescent(ctx, path, lx, ly, shade(c, -0.2));
        ctx.save();
        ctx.clip(path);
        const q = new Path2D();
        q.rect(-1e5, -1e5, 2e5, 2e5);
        q.addPath(path, new DOMMatrix().translate(lx * 2, ly * 2));
        ctx.fillStyle = halftone(ctx, shade(c, -0.45), fg ? 4 : 4.5, fg ? 1.05 : 0.95);
        ctx.fill(q, 'evenodd');
        ctx.restore();
      }
      if (fg && o.rim !== false) crescent(ctx, path, -lx * 0.4, -ly * 0.4, shade(c, 0.4));
      if (w) strokeP(ctx, path, w, INK);
    },
    stroke(ctx, path, w, hex) { strokeP(ctx, path, w != null ? w : lw, hex ? col(hex) : ink); },
    line(ctx, path, w) { strokeP(ctx, path, w != null ? w : M.thin, ink); },
    // A light source (lamp bulb, screen) — in noir: white.
    light(hex) { return mono ? NW : fg ? hex : mix(hex, '#ffffff', 0.1); },
    glow(ctx, x, y, r, hex) {
      if (mono) {
        ctx.save(); ctx.clip(circP(x, y, r));
        halftoneGradient(ctx, x - r, y - r, r * 2, r * 2, NW, { spacing: 5, dir: 'center', cx: x, cy: y, from: 0.3, maxR: 3 });
        ctx.restore();
      } else glow(ctx, x, y, r, hex, { spacing: Math.max(4, r / 9), from: 0.25 });
    },
  };
  return M;
}

// ------------------------------------------------------------------ DECOR

const DECOR = {
  antenna(ctx, x, y, M, R) {
    const hh = R.r(170, 230);
    const base = rectP(x - 14, y - 16, 28, 16);
    M.solid(ctx, base, M.pal.metalD, { lx: -3, ly: -3 });
    const p = P();
    p.moveTo(x, y - 16); p.lineTo(x, y - hh);
    const bars = [0.45, 0.6, 0.72, 0.83, 0.92];
    bars.forEach((t, i) => {
      const bw = 60 - i * 9;
      p.moveTo(x - bw / 2, y - hh * t - 6); p.lineTo(x, y - hh * t); p.lineTo(x + bw / 2, y - hh * t - 6);
    });
    p.moveTo(x - 90, y); p.lineTo(x, y - hh * 0.5); p.lineTo(x + 90, y);
    strokeP(ctx, p, M.lw + 2, M.ink);
    strokeP(ctx, p, M.lw - 0.6, M.col(M.pal.metal));
    const tip = circP(x, y - hh - 4, 5);
    M.solid(ctx, tip, M.pal.a1, { lx: -2, ly: -2, lw: 1.8 });
    if (!M.mono) M.glow(ctx, x, y - hh - 4, 16, M.pal.a1);
  },

  watertower(ctx, x, y, M, R) {
    const s = R.r(0.9, 1.1);
    const legH = 90 * s, tw = 110 * s, th = 90 * s;
    const legs = P();
    legs.moveTo(x - tw * 0.4, y); legs.lineTo(x - tw * 0.32, y - legH);
    legs.moveTo(x + tw * 0.4, y); legs.lineTo(x + tw * 0.32, y - legH);
    legs.moveTo(x - tw * 0.12, y); legs.lineTo(x - tw * 0.1, y - legH);
    legs.moveTo(x + tw * 0.12, y); legs.lineTo(x + tw * 0.1, y - legH);
    legs.moveTo(x - tw * 0.38, y - legH * 0.3); legs.lineTo(x + tw * 0.36, y - legH * 0.7);
    legs.moveTo(x + tw * 0.38, y - legH * 0.3); legs.lineTo(x - tw * 0.36, y - legH * 0.7);
    legs.moveTo(x - tw * 0.36, y - legH * 0.5); legs.lineTo(x + tw * 0.36, y - legH * 0.5);
    strokeP(ctx, legs, 7, M.ink);
    strokeP(ctx, legs, 3.5, M.col(M.pal.metalD));
    inked(ctx, rectP(x - tw * 0.46, y - legH - 8, tw * 0.92, 8), M.col(M.pal.metalD), M.thin, M.ink);
    const tank = P();
    tank.moveTo(x - tw / 2, y - legH - 8);
    tank.lineTo(x - tw / 2, y - legH - 8 - th);
    tank.lineTo(x + tw / 2, y - legH - 8 - th);
    tank.lineTo(x + tw / 2, y - legH - 8);
    tank.closePath();
    M.solid(ctx, tank, M.pal.wood, { lx: -8, ly: 0 });
    clipped(ctx, tank, () => {
      const st = P();
      for (let px = x - tw / 2 + 11; px < x + tw / 2; px += 11) { st.moveTo(px, y - legH - 8 - th); st.lineTo(px, y - legH - 8); }
      M.line(ctx, st, 1.1);
    });
    const bands = P();
    bands.rect(x - tw / 2 - 3, y - legH - 8 - th * 0.25, tw + 6, 5);
    bands.rect(x - tw / 2 - 3, y - legH - 8 - th * 0.7, tw + 6, 5);
    inked(ctx, bands, M.col(M.pal.metalD), 1.4, M.ink);
    const roof = polyP([[x - tw / 2 - 8, y - legH - 8 - th], [x, y - legH - 8 - th - 50 * s], [x + tw / 2 + 8, y - legH - 8 - th]]);
    M.solid(ctx, roof, M.pal.woodD, { lx: -6, ly: 0 });
    const fin = lineP(x, y - legH - 8 - th - 50 * s, x, y - legH - 8 - th - 64 * s);
    M.stroke(ctx, fin, 3);
    if (!M.mono && R.chance(0.6)) letters(ctx, R.pick(['CITY', 'H2O', 'ACME']), x, y - legH - 8 - th / 2, 26, M.col('#f2e6c8'), { outline: 4, ink: M.ink });
  },

  chimney(ctx, x, y, M, R) {
    const cw = R.r(46, 60), ch = R.r(120, 160);
    const body = rectP(x - cw / 2, y - ch, cw, ch);
    M.solid(ctx, body, M.mono ? '#777777' : '#b0584a', { lx: -6, ly: 0 });
    clipped(ctx, body, () => {
      const b = P();
      for (let yy = y - ch, r = 0; yy < y; yy += 11, r++) {
        b.moveTo(x - cw / 2, yy); b.lineTo(x + cw / 2, yy);
        for (let xx = x - cw / 2 + (r % 2 ? 11 : 0); xx < x + cw / 2; xx += 22) { b.moveTo(xx, yy); b.lineTo(xx, yy + 11); }
      }
      strokeP(ctx, b, 1, M.mono ? NB : rgba(INK, 0.45));
    });
    M.solid(ctx, rectP(x - cw / 2 - 7, y - ch - 12, cw + 14, 14), M.pal.stone, { lx: 0, ly: -4 });
    const pots = P();
    pots.rect(x - cw * 0.3, y - ch - 30, 12, 18);
    pots.rect(x + cw * 0.3 - 12, y - ch - 26, 12, 14);
    M.solid(ctx, pots, '#c8764a', { lx: -3, ly: 0 });
    const sm = P();
    let sx = x - cw * 0.3 + 6, sy = y - ch - 44;
    for (let i = 0; i < 4; i++) { cloudPath(sx, sy, 12 + i * 5, 9 + i * 4, 7, (R() * 1e6) | 0, sm); sx += 14 + i * 4; sy -= 18 + i * 3; }
    strokeP(ctx, sm, M.thin * 2, M.ink);
    fillP(ctx, sm, M.mono ? NW : M.col('#d8d4dc'));
    if (M.mono) dotsIn(ctx, sm, NB, 4.5, 1.1);
  },

  billboard(ctx, x, y, M, R) {
    const bw = R.r(190, 230), bh = 104, legH = R.r(90, 120);
    const top = y - legH - bh;
    const legs = P(), braces = P();
    for (const lx of [-bw * 0.35, 0, bw * 0.35]) { legs.rect(x + lx - 3, y - legH, 6, legH); }
    braces.moveTo(x - bw * 0.35, y); braces.lineTo(x, y - legH); braces.lineTo(x + bw * 0.35, y);
    strokeP(ctx, braces, 6, M.ink); strokeP(ctx, braces, 2.6, M.col(M.pal.metalD));
    strokeP(ctx, legs, M.lw + 1.4, M.ink);
    fillP(ctx, legs, M.col(M.pal.metalD));
    const walk = rectP(x - bw / 2 - 6, y - legH, bw + 12, 6);
    inked(ctx, walk, M.col(M.pal.metalD), 1.4, M.ink);
    const board = rectP(x - bw / 2, top, bw, bh);
    const ad = R.i(0, 2);
    M.fill(ctx, board, ['#f2d24a', '#e86a5a', '#8fd0e8'][ad]);
    clipped(ctx, board, () => {
      if (M.mono) {
        dotsIn(ctx, rectP(x - bw / 2, top, bw * 0.4, bh), NB, 4.5, 1.4);
        letters(ctx, R.pick(['LUCKY', 'SMOKE', 'GIN']), x + bw * 0.18, top + bh * 0.45, 40, NB, { maxW: bw * 0.55 });
        fillP(ctx, rectP(x - bw / 2, top + bh * 0.72, bw, bh * 0.28), NR);
      } else {
        // pop-art ad: face + slogan
        const fx = x - bw * 0.3, fy = top + bh * 0.55;
        fillP(ctx, circP(fx, fy, 34), M.col('#ffffff'));
        dotsIn(ctx, circP(fx, fy, 34), M.col('#f09a8a'), 5, 1.6);
        const face = P();
        circP(fx, fy + 4, 20, face);
        inked(ctx, face, M.col('#f6c7a0'), 2, M.ink);
        fillP(ctx, ellP(fx, fy + 14, 7, 5), M.col('#d23a3a'));
        const hair = P(); hair.moveTo(fx - 22, fy); hair.quadraticCurveTo(fx - 20, fy - 26, fx + 4, fy - 18); hair.quadraticCurveTo(fx + 24, fy - 22, fx + 22, fy); hair.quadraticCurveTo(fx, fy - 10, fx - 22, fy); inked(ctx, hair, M.col('#2a2a44'), 1.6, M.ink);
        letters(ctx, R.pick(['FIZZ-O!', 'ZAP COLA', 'ATOMIC!', 'BUY BONDS']), x + bw * 0.18, top + bh * 0.4, 30, M.col('#ffffff'), { outline: 5, ink: M.ink, maxW: bw * 0.56 });
        letters(ctx, R.pick(["IT'S SWELL!", 'NEW!', '5¢']), x + bw * 0.18, top + bh * 0.74, 18, M.col('#1b1b1b'), { maxW: bw * 0.5 });
      }
    });
    M.stroke(ctx, board, M.lw);
    inked(ctx, rectP(x - bw / 2 - 5, top - 6, bw + 10, 6), M.col(M.pal.metalD), 1.4, M.ink);
    // lamps on arms
    for (const lx of [-bw * 0.3, bw * 0.3]) {
      const arm = P(); arm.moveTo(x + lx, top - 6); arm.lineTo(x + lx, top - 22); arm.lineTo(x + lx + 12, top - 22);
      M.stroke(ctx, arm, 2.4);
      inked(ctx, polyP([[x + lx + 6, top - 28], [x + lx + 20, top - 28], [x + lx + 24, top - 18], [x + lx + 2, top - 18]]), M.col(M.pal.metalD), 1.4, M.ink);
    }
  },

  lamp(ctx, x, y, M, R) {
    const hh = R.r(200, 240);
    const style = M.key === 'noir' || M.key === 'zombie' ? 'gas' : 'modern';
    const base = P();
    base.moveTo(x - 16, y); base.lineTo(x - 10, y - 30); base.lineTo(x + 10, y - 30); base.lineTo(x + 16, y); base.closePath();
    M.solid(ctx, base, M.pal.metalD, { lx: -4, ly: 0 });
    const pole = rectP(x - 4, y - hh, 8, hh - 30);
    M.solid(ctx, pole, M.pal.metalD, { lx: -3, ly: 0, lw: M.thin + 0.6 });
    const lampY = y - hh;
    const on = M.key !== 'zombie' || R.chance(0.6);
    if (on) M.glow(ctx, style === 'gas' ? x : x + 30, lampY + (style === 'gas' ? -10 : 8), style === 'gas' ? 70 : 60, M.pal.a3 === '#ffe14a' ? '#fff3a8' : '#fff0b0');
    if (style === 'gas') {
      const cage = polyP([[x - 16, lampY - 30], [x + 16, lampY - 30], [x + 11, lampY], [x - 11, lampY]]);
      fillP(ctx, cage, on ? M.light('#fff6c8') : M.col('#4a4a52'));
      const frame = P();
      frame.moveTo(x, lampY - 30); frame.lineTo(x, lampY);
      M.line(ctx, frame, 1.4);
      M.stroke(ctx, cage, M.thin + 0.6);
      const cap = polyP([[x - 22, lampY - 30], [x, lampY - 46], [x + 22, lampY - 30]]);
      M.solid(ctx, cap, M.pal.metalD, { lx: -3, ly: 0 });
      inked(ctx, rectP(x - 12, lampY, 24, 6), M.col(M.pal.metalD), 1.4, M.ink);
      const arm = P(); arm.moveTo(x - 18, lampY + 24); arm.lineTo(x + 18, lampY + 24);
      M.stroke(ctx, arm, 3);
    } else {
      const arm = P(); arm.moveTo(x, lampY + 20); arm.quadraticCurveTo(x, lampY - 4, x + 24, lampY - 2);
      strokeP(ctx, arm, 7, M.ink); strokeP(ctx, arm, 3.6, M.col(M.pal.metalD));
      const head = P(); head.moveTo(x + 10, lampY - 6); head.lineTo(x + 50, lampY - 6); head.quadraticCurveTo(x + 52, lampY + 8, x + 44, lampY + 8); head.lineTo(x + 16, lampY + 8); head.quadraticCurveTo(x + 8, lampY + 8, x + 10, lampY - 6);
      M.solid(ctx, head, M.pal.metalD, { lx: 0, ly: -3 });
      fillP(ctx, ellP(x + 30, lampY + 8, 14, 3.5), M.light('#fff6c8'));
    }
  },

  hydrant(ctx, x, y, M, R) {
    const c = M.mono ? NR : M.pal.a1 === '#e8262b' ? '#e8262b' : '#d8402f';
    const b = P();
    b.moveTo(x - 14, y); b.lineTo(x - 12, y - 36); b.quadraticCurveTo(x - 13, y - 52, x, y - 54); b.quadraticCurveTo(x + 13, y - 52, x + 12, y - 36); b.lineTo(x + 14, y); b.closePath();
    M.solid(ctx, b, c, { lx: -4, ly: 0 });
    M.solid(ctx, rectP(x - 18, y - 8, 36, 8), c, { lx: 0, ly: -2 });
    M.solid(ctx, rrectP(x - 22, y - 36, 44, 10, 3), c, { lx: 0, ly: -2 });
    M.solid(ctx, circP(x, y - 22, 5), '#c8c8c8', { lx: -1, ly: -1, lw: 1.4 });
    M.solid(ctx, rectP(x - 4, y - 62, 8, 8), c, { lx: -1, ly: 0, lw: 1.6 });
  },

  fireplug(ctx, x, y, M, R) { DECOR.hydrant(ctx, x, y, M, R); },

  mailbox(ctx, x, y, M, R) {
    const c = M.mono ? '#2a2a2a' : '#2a5ab8';
    const legs = P(); legs.rect(x - 20, y - 26, 6, 26); legs.rect(x + 14, y - 26, 6, 26);
    M.solid(ctx, legs, c, { lx: -2, ly: 0, lw: M.thin + 0.4 });
    const body = P();
    body.moveTo(x - 26, y - 26); body.lineTo(x - 26, y - 70); body.arc(x, y - 70, 26, Math.PI, 0); body.lineTo(x + 26, y - 26); body.closePath();
    M.solid(ctx, body, c, { lx: -6, ly: 0 });
    const slot = rrectP(x - 14, y - 78, 28, 7, 3);
    fillP(ctx, slot, M.mono ? NW : INK);
    M.line(ctx, lineP(x - 26, y - 62, x + 26, y - 62), 1.4);
    if (!M.mono) letters(ctx, 'U.S. MAIL', x, y - 44, 11, M.col('#f2efe6'));
    else { fillP(ctx, rectP(x - 20, y - 50, 40, 12), NW); letters(ctx, 'MAIL', x, y - 44, 11, NB); }
  },

  newsstand(ctx, x, y, M, R) {
    const w = 130, hh = 150;
    const body = rectP(x - w / 2, y - hh + 34, w, hh - 34);
    M.solid(ctx, body, M.mono ? '#555555' : '#3f7a54', { lx: -6, ly: 0 });
    const counter = rectP(x - w / 2 - 6, y - 60, w + 12, 10);
    M.solid(ctx, counter, M.pal.wood, { lx: 0, ly: -3 });
    // papers & mags in the window
    const win = rectP(x - w / 2 + 10, y - hh + 50, w - 20, 44);
    fillP(ctx, win, M.mono ? NB : M.col('#1f2a26'));
    const mags = ['#e8c040', '#e8604a', '#5aa0e0', '#f2efe6', '#b060c0'];
    for (let i = 0; i < 5; i++) {
      const m = rectP(x - w / 2 + 14 + i * 21, y - hh + 56 + (i % 2) * 4, 17, 34);
      M.solid(ctx, m, mags[i], { lx: -2, ly: 0, lw: 1.4 });
      M.line(ctx, lineP(x - w / 2 + 16 + i * 21, y - hh + 64 + (i % 2) * 4, x - w / 2 + 28 + i * 21, y - hh + 64 + (i % 2) * 4), 1.2);
    }
    // stacked papers on the counter
    const stack = P();
    for (let k = 0; k < 3; k++) stack.rect(x - 40 + k * 26, y - 72, 22, 12);
    M.solid(ctx, stack, '#e8e4d4', { lx: 0, ly: -2, lw: 1.4 });
    const headline = rectP(x - w / 2 + 8, y - 44, w - 16, 32);
    M.solid(ctx, headline, '#f2efe6', { lx: 0, ly: 0, lw: 1.8, shadow: false });
    letters(ctx, R.pick(['EXTRA!', 'HERO SAVES CITY!', 'MONSTER LOOSE!', 'EXTRA! EXTRA!']), x, y - 28, 15, M.mono ? NB : M.col('#1b1b1b'), { maxW: w - 24 });
    // awning
    const aw = polyP([[x - w / 2 - 10, y - hh + 34], [x + w / 2 + 10, y - hh + 34], [x + w / 2, y - hh + 8], [x - w / 2, y - hh + 8]]);
    M.fill(ctx, aw, M.mono ? '#f2efe6' : '#d8a040');
    clipped(ctx, aw, () => {
      const st = P();
      for (let sx = x - w / 2 - 10; sx < x + w / 2 + 10; sx += 20) st.rect(sx, y - hh, 10, 40);
      fillP(ctx, st, M.mono ? NR : M.col('#c8403a'));
    });
    M.stroke(ctx, aw, M.lw);
    inked(ctx, rrectP(x - 34, y - hh - 18, 68, 26, 4), M.mono ? NB : M.col('#1b1b1b'), 1.4, M.ink);
    letters(ctx, 'NEWS', x, y - hh - 5, 20, M.mono ? NW : M.col('#ffe14a'));
  },

  tesla(ctx, x, y, M, R) {
    const hh = R.r(190, 240);
    const base = polyP([[x - 38, y], [x - 30, y - 30], [x + 30, y - 30], [x + 38, y]]);
    M.solid(ctx, base, M.pal.metalD, { lx: 0, ly: -5 });
    const col = rectP(x - 12, y - hh + 40, 24, hh - 70);
    M.solid(ctx, col, '#c8804a', { lx: -4, ly: 0 });
    clipped(ctx, col, () => {
      const coil = P();
      for (let yy = y - hh + 44; yy < y - 30; yy += 5) { coil.moveTo(x - 12, yy); coil.lineTo(x + 12, yy + 2); }
      M.line(ctx, coil, 1);
    });
    for (const t of [0.3, 0.55, 0.8]) M.solid(ctx, ellP(x, y - 30 - (hh - 70) * t, 22, 6), M.pal.metal, { lx: 0, ly: -2, lw: M.thin + 0.2 });
    const tor = ellP(x, y - hh + 34, 42, 16);
    // electricity
    const arcs = P();
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + R.r(-1.4, 1.4);
      arcLine(R, x + Math.cos(a) * 40, y - hh + 34 + Math.sin(a) * 14, x + Math.cos(a) * R.r(80, 130), y - hh + 34 + Math.sin(a) * R.r(50, 110), 6, 0.35, arcs);
    }
    if (!M.mono) M.glow(ctx, x, y - hh + 34, 90, M.pal.glow);
    strokeP(ctx, arcs, 4.5, M.mono ? NB : rgba(INK, 0.5));
    strokeP(ctx, arcs, 2, M.light('#ffffff'));
    M.solid(ctx, tor, M.pal.metal, { lx: 0, ly: -6 });
    fillP(ctx, circP(x, y - hh + 20, 5), M.light('#ffffff'));
  },

  tank(ctx, x, y, M, R) {
    const w = R.r(64, 80), hh = R.r(170, 200);
    const glass = rrectP(x - w / 2, y - hh + 16, w, hh - 36, 12);
    const liquid = M.key === 'space' ? '#7ff4ff' : M.key === 'zombie' ? '#b8f07a' : '#8fe08a';
    M.fill(ctx, glass, M.mono ? '#dddddd' : mix(liquid, '#ffffff', 0.4));
    clipped(ctx, glass, () => {
      const lq = rectP(x - w / 2, y - hh + 40, w, hh);
      M.fill(ctx, lq, liquid);
      if (!M.mono) halftoneGradient(ctx, x - w / 2, y - hh, w, hh, shade(M.col(liquid), -0.25), { spacing: 5, dir: 'right', from: 0.45, maxR: 2.9 });
      const sp = P();
      if (R.chance(0.5)) {
        const br = cloudPath(x, y - hh * 0.55, w * 0.3, w * 0.22, 8, (R() * 1e6) | 0);
        inked(ctx, br, M.mono ? NW : M.col('#e89aa8'), 1.6, M.ink);
      } else {
        circP(x, y - hh * 0.62, 10, sp);
        sp.moveTo(x - 12, y - hh * 0.55); sp.lineTo(x + 12, y - hh * 0.55); sp.lineTo(x + 8, y - hh * 0.3); sp.lineTo(x - 8, y - hh * 0.3); sp.closePath();
        fillP(ctx, sp, M.mono ? NB : rgba(INK, 0.45));
      }
      const bub = P();
      for (let i = 0; i < 9; i++) circP(x - w / 2 + 8 + R() * (w - 16), y - hh + 50 + R() * (hh - 90), 1.5 + R() * 3.5, bub);
      fillP(ctx, bub, M.mono ? NW : M.col('#f0fff0'));
      M.line(ctx, bub, 1);
      fillP(ctx, rectP(x - w / 2 + 7, y - hh + 24, 6, hh - 60), M.mono ? NW : 'rgba(255,255,255,0.5)');
    });
    M.stroke(ctx, glass, M.lw);
    M.solid(ctx, rrectP(x - w / 2 - 6, y - hh, w + 12, 20, 4), M.pal.metal, { lx: 0, ly: -4 });
    M.solid(ctx, rrectP(x - w / 2 - 6, y - 22, w + 12, 22, 4), M.pal.metal, { lx: 0, ly: -4 });
    const hose = P(); hose.moveTo(x, y - hh); hose.quadraticCurveTo(x + 10, y - hh - 30, x + 40, y - hh - 20);
    strokeP(ctx, hose, 7, M.ink); strokeP(ctx, hose, 4, M.col(M.pal.metalD));
  },

  screen(ctx, x, y, M, R) {
    const sw = R.r(120, 150), sh = sw * 0.66, standH = R.r(70, 100);
    const stand = P(); stand.rect(x - 5, y - standH, 10, standH);
    stand.moveTo(x - 30, y); stand.lineTo(x - 18, y - 12); stand.lineTo(x + 18, y - 12); stand.lineTo(x + 30, y); stand.closePath();
    M.solid(ctx, stand, M.pal.metalD, { lx: -3, ly: 0 });
    const frame = rrectP(x - sw / 2 - 8, y - standH - sh - 8, sw + 16, sh + 16, 8);
    M.solid(ctx, frame, M.pal.metalD, { lx: -4, ly: -4 });
    const sc = rrectP(x - sw / 2, y - standH - sh, sw, sh, 5);
    const glowC = M.key === 'hero' ? '#62d6de' : M.key === 'zombie' ? '#9fe070' : M.key === 'space' ? '#7ff4ff' : '#f2efe6';
    fillP(ctx, sc, M.mono ? NB : M.col(shade(glowC, -0.72)));
    clipped(ctx, sc, () => {
      const g = P();
      const top = y - standH - sh;
      const kind = R.i(0, 2);
      if (kind === 0) {
        g.moveTo(x - sw / 2 + 6, top + sh * 0.6);
        for (let k = 0; k <= 16; k++) g.lineTo(x - sw / 2 + 6 + k * (sw - 12) / 16, top + sh * 0.55 + Math.sin(k * 0.9 + R() * 3) * sh * 0.25);
        strokeP(ctx, g, 2.2, M.light(glowC));
      } else if (kind === 1) {
        const cx = x, cy = top + sh / 2, r = sh * 0.38;
        circP(cx, cy, r, g); circP(cx, cy, r * 0.6, g); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r);
        strokeP(ctx, g, 1.2, M.light(glowC));
        const sw2 = P(); sw2.moveTo(cx, cy); sw2.arc(cx, cy, r, R() * 6, R() * 6 + 0.9); sw2.closePath();
        fillP(ctx, sw2, M.light(glowC));
      } else {
        for (let k = 0; k < 6; k++) g.rect(x - sw / 2 + 10 + k * (sw - 20) / 6, top + sh - 8 - (sh - 20) * R.r(0.2, 1), (sw - 20) / 6 - 5, sh);
        fillP(ctx, g, M.light(glowC));
      }
      const sl = P();
      for (let sy = top; sy < top + sh; sy += 4) sl.rect(x - sw / 2, sy, sw, 1.3);
      fillP(ctx, sl, M.mono ? halftone(ctx, NB, 4, 0.8) : 'rgba(0,0,0,0.2)');
    });
    M.stroke(ctx, sc, M.thin + 0.6);
    fillP(ctx, circP(x + sw / 2 - 2, y - standH + 2, 3), M.light('#ff5a4a'));
  },

  pipes(ctx, x, y, M, R) {
    const n = R.i(2, 3), hh = R.r(170, 230);
    const cols = [M.pal.metal, '#c8804a', M.key === 'space' ? M.pal.a2 : '#6fa36a'];
    for (let i = 0; i < n; i++) {
      const px = x - (n - 1) * 14 + i * 28, r = R.r(8, 11);
      const ph = hh - i * 20;
      const p = rectP(px - r, y - ph, r * 2, ph);
      M.solid(ctx, p, cols[i % cols.length], { lx: -r * 0.6, ly: 0 });
      for (let fy = y - ph + 30; fy < y - 10; fy += R.r(50, 80)) M.solid(ctx, rectP(px - r - 3, fy, r * 2 + 6, 7), M.pal.metalD, { lx: 0, ly: -2, lw: M.thin + 0.4 });
      const elbow = P();
      elbow.moveTo(px - r, y - ph); elbow.arc(px + r * 1.6, y - ph, r * 2.6, Math.PI, Math.PI * 1.5); elbow.lineTo(px + r * 1.6, y - ph - r * 0.6); elbow.arc(px + r * 1.6, y - ph, r * 0.6, Math.PI * 1.5, Math.PI, true); elbow.closePath();
      M.solid(ctx, elbow, cols[i % cols.length], { lx: 0, ly: -3 });
    }
    // valve wheel + gauge
    const vy = y - hh * 0.45;
    const wheel = P(); circP(x - (n - 1) * 14, vy, 16, wheel); circP(x - (n - 1) * 14, vy, 12, wheel);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; wheel.moveTo(x - (n - 1) * 14 + Math.cos(a) * 12, vy + Math.sin(a) * 12); wheel.lineTo(x - (n - 1) * 14 - Math.cos(a) * 12, vy - Math.sin(a) * 12); }
    strokeP(ctx, wheel, 6, M.ink);
    strokeP(ctx, wheel, 3, M.col(M.pal.a1));
    if (M.mono) dial(ctx, R, x + (n - 1) * 14, y - hh * 0.7, 13, { face: NW, rim: NB, red: true, redColor: NR, ink: NB, lw: 1.6 });
    else dial(ctx, R, x + (n - 1) * 14, y - hh * 0.7, 13, { face: M.col('#efe8cf'), rim: M.col('#8a8f96'), lw: 1.6 });
  },

  statue(ctx, x, y, M, R) {
    const stone = M.key === 'hero' ? '#c8b060' : M.pal.stone;
    const ped = P();
    ped.rect(x - 44, y - 26, 88, 26);
    ped.rect(x - 36, y - 90, 72, 64);
    ped.rect(x - 44, y - 100, 88, 12);
    M.solid(ctx, ped, M.pal.stone, { lx: -6, ly: 0 });
    M.line(ctx, lineP(x - 44, y - 26, x + 44, y - 26), M.thin);
    letters(ctx, R.pick(['THE DOCTOR', 'OUR LEADER', 'GLORY']), x, y - 58, 13, M.mono ? NB : M.col('#3a3a3a'), { maxW: 64 });
    // heroic villain figure, fist raised
    const f = P();
    const b = y - 100;
    f.moveTo(x - 16, b); f.lineTo(x - 12, b - 44); f.lineTo(x - 20, b - 70); f.lineTo(x - 24, b - 104); f.lineTo(x + 22, b - 104); f.lineTo(x + 18, b - 70); f.lineTo(x + 12, b - 44); f.lineTo(x + 18, b); f.lineTo(x + 4, b); f.lineTo(x, b - 40); f.lineTo(x - 4, b); f.closePath();
    // cape
    f.moveTo(x - 22, b - 100); f.quadraticCurveTo(x - 50, b - 50, x - 40, b); f.lineTo(x - 16, b); f.lineTo(x - 18, b - 70); f.closePath();
    // raised arm + fist
    f.moveTo(x + 18, b - 100); f.lineTo(x + 36, b - 128); f.lineTo(x + 30, b - 150); f.lineTo(x + 42, b - 152); f.lineTo(x + 46, b - 128); f.lineTo(x + 24, b - 90); f.closePath();
    circP(x + 37, b - 156, 8, f);
    // big domed head
    circP(x, b - 118, 16, f);
    M.solid(ctx, f, stone, { lx: -6, ly: -4 });
    M.line(ctx, lineP(x - 12, b - 44, x + 12, b - 44), M.thin);
    if (!M.mono && M.key === 'hero') { fillP(ctx, ellP(x - 5, b - 118, 3, 2), M.col('#ff4a3a')); fillP(ctx, ellP(x + 5, b - 118, 3, 2), M.col('#ff4a3a')); }
  },

  tombstone(ctx, x, y, M, R) {
    const w = R.r(52, 70), hh = R.r(80, 110);
    const kind = R.i(0, 2);
    const t = P();
    if (kind === 0) { t.moveTo(x - w / 2, y); t.lineTo(x - w / 2, y - hh + w / 2); t.arc(x, y - hh + w / 2, w / 2, Math.PI, 0); t.lineTo(x + w / 2, y); t.closePath(); }
    else if (kind === 1) { polyP([[x - w / 2, y], [x - w / 2, y - hh * 0.82], [x - w * 0.3, y - hh * 0.82], [x - w * 0.3, y - hh * 0.95], [x, y - hh], [x + w * 0.3, y - hh * 0.95], [x + w * 0.3, y - hh * 0.82], [x + w / 2, y - hh * 0.82], [x + w / 2, y]], true, t); }
    else { t.moveTo(x - w / 2, y); t.lineTo(x - w / 2, y - hh * 0.8); t.quadraticCurveTo(x - w / 2, y - hh, x, y - hh); t.quadraticCurveTo(x + w / 2, y - hh, x + w / 2, y - hh * 0.8); t.lineTo(x + w / 2, y); t.closePath(); }
    const m = new DOMMatrix().translate(x, y).rotate(R.r(-6, 6)).translate(-x, -y);
    const tt = P(); tt.addPath(t, m);
    M.solid(ctx, tt, M.pal.stone, { lx: -7, ly: -3 });
    ctx.save();
    ctx.setTransform(ctx.getTransform().multiply(m));
    letters(ctx, 'R.I.P.', x, y - hh * 0.62, 18, M.mono ? NB : M.col('#4a4658'));
    const cr = P(); cr.moveTo(x + w * 0.3, y - hh * 0.9); cr.lineTo(x + w * 0.12, y - hh * 0.72); cr.lineTo(x + w * 0.22, y - hh * 0.6); cr.lineTo(x + w * 0.05, y - hh * 0.45);
    M.line(ctx, cr, 1.4);
    const ln = P(); ln.rect(x - w * 0.3, y - hh * 0.42, w * 0.6, 2.5); ln.rect(x - w * 0.24, y - hh * 0.32, w * 0.48, 2.5);
    fillP(ctx, ln, M.mono ? NB : M.col('#6a6678'));
    ctx.restore();
    // moss & grass
    const g = P();
    for (let gx = x - w / 2 - 10; gx < x + w / 2 + 10; gx += 6) { g.moveTo(gx, y); g.lineTo(gx + R.r(-4, 4), y - R.r(6, 16)); }
    strokeP(ctx, g, 2, M.mono ? NB : M.col('#4a6a3a'));
  },

  deadtree(ctx, x, y, M, R) {
    deadTree(ctx, R, x, y, R.r(210, 260), M.mono ? NB : M.col('#2a2230'), { ink: M.mono ? NW : INK, inkW: M.mono ? 2 : 3, depth: 5, trunk: 13 });
  },

  cross(ctx, x, y, M, R) {
    const hh = R.r(110, 130);
    const wood = M.key === 'zombie' ? M.pal.wood : M.pal.stone;
    const c = P();
    c.rect(x - 7, y - hh, 14, hh);
    c.rect(x - 34, y - hh * 0.74, 68, 14);
    const m = new DOMMatrix().translate(x, y).rotate(R.r(-9, 9)).translate(-x, -y);
    const cc = P(); cc.addPath(c, m);
    M.solid(ctx, cc, wood, { lx: -4, ly: -3 });
    const mound = P(); mound.moveTo(x - 50, y); mound.quadraticCurveTo(x, y - 30, x + 50, y); mound.closePath();
    M.solid(ctx, mound, M.mono ? '#555555' : '#5a4a44', { lx: 0, ly: -5 });
    // wreath of dead flowers
    const fl = P();
    for (let i = 0; i < 5; i++) circP(x - 18 + i * 9, y - 18 + Math.sin(i) * 3, 4, fl);
    M.solid(ctx, fl, M.mono ? '#d7141a' : '#a04a6a', { lx: -1, ly: -1, lw: 1.2 });
  },

  wreckage(ctx, x, y, M, R) {
    const pile = P();
    pile.moveTo(x - 80, y);
    for (let i = 0; i <= 8; i++) pile.lineTo(x - 80 + i * 20, y - 20 - Math.sin((i / 8) * Math.PI) * 50 - R.r(-8, 12));
    pile.lineTo(x + 80, y);
    pile.closePath();
    M.solid(ctx, pile, M.mono ? '#555555' : '#6a5a58', { lx: -6, ly: -4 });
    clipped(ctx, pile, () => {
      const br = P();
      for (let i = 0; i < 14; i++) br.rect(x - 70 + R() * 140, y - 60 + R() * 60, R.r(14, 22), R.r(7, 10));
      M.solid(ctx, br, '#a0584a', { lx: -2, ly: -2, lw: 1.2 });
    });
    // girder sticking out
    ctx.save();
    ctx.translate(x + R.r(-20, 20), y - 30);
    ctx.rotate(R.r(-1.1, -0.5));
    const g = rectP(-6, -10, 100, 14);
    M.solid(ctx, g, M.key === 'noir' ? '#333333' : '#b8563e', { lx: 0, ly: -3 });
    rivetRow(ctx, 4, -3, 92, -3, 14, 1.6, M.col('#e8c0a0'), 1, M.ink);
    ctx.restore();
    // tire
    const tx = x + R.r(-50, -20);
    const tire = P(); circP(tx, y - 18, 18, tire);
    M.solid(ctx, tire, '#2a2a2a', { lx: -3, ly: -3 });
    M.solid(ctx, circP(tx, y - 18, 7), M.pal.metal, { lx: -1, ly: -1, lw: 1.4 });
    if (M.key === 'zombie') fire(ctx, R, x + R.r(-10, 30), y - 50, 40, R.r(40, 70), { lw: 2 });
    const smoke = P();
    if (M.key !== 'space') { cloudPath(x + 10, y - 90, 18, 12, 7, 5, smoke); cloudPath(x + 22, y - 116, 24, 16, 7, 9, smoke); }
    strokeP(ctx, smoke, M.thin * 2, M.ink);
    fillP(ctx, smoke, M.mono ? halftone(ctx, NB, 4, 1.2) : M.col('#6a5a6a'));
  },

  sign(ctx, x, y, M, R) {
    const texts = {
      hero: ['ONE WAY', 'NO PARKING', 'BUS STOP', 'SLOW'],
      zombie: ['KEEP OUT!', 'QUARANTINE', 'DEAD END', 'NO EXIT', 'SALE 90% OFF'],
      space: ['DOCK 7', 'AIRLOCK', 'SECTOR 9', 'NO GRAVITY'],
      noir: ['NO LOITERING', 'HOTEL', 'BAR', 'PAWN'],
    };
    const txt = R.pick(texts[M.key] || texts.hero);
    const hh = R.r(150, 190), tilt = M.key === 'zombie' ? R.r(-0.18, 0.18) : R.r(-0.03, 0.03);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    const post = rectP(-4, -hh, 8, hh);
    M.solid(ctx, post, M.pal.metalD, { lx: -2, ly: 0, lw: M.thin + 0.6 });
    ctx.font = '22px Bangers, Impact, sans-serif';
    const tw = Math.max(80, ctx.measureText(txt).width + 26);
    const board = rrectP(-tw / 2, -hh - 8, tw, 44, 5);
    const bg = M.key === 'zombie' ? '#e8c040' : M.key === 'space' ? '#e8e8f0' : M.key === 'noir' ? '#f2efe6' : '#f2efe6';
    M.solid(ctx, board, bg, { lx: -4, ly: -4 });
    if (M.key === 'zombie') {
      const b = rectP(-tw / 2 + 4, -hh - 4, tw - 8, 36);
      M.stroke(ctx, b, 2);
    }
    letters(ctx, txt, 0, -hh + 14, 22, M.mono ? (txt === 'HOTEL' || txt === 'BAR' ? NR : NB) : M.col(M.key === 'space' ? '#d02a70' : '#1b1b1b'), { maxW: tw - 16 });
    if (M.key === 'zombie') {
      const bl = P(); handPath(tw * 0.25, -hh + 20, 7, 0.4, bl);
      fillP(ctx, bl, M.col('#8e1c1c'));
      const bh = P(); bh.rect(-8, -hh + 40, 3, 30);
      fillP(ctx, bh, M.col('#8e1c1c'));
    }
    ctx.restore();
  },

  iv(ctx, x, y, M, R) {
    const hh = 180;
    const base = P();
    for (const a of [-1, -0.35, 0.35, 1]) { base.moveTo(x, y - 8); base.lineTo(x + a * 30, y - 2); }
    M.stroke(ctx, base, 4);
    const wh = P(); for (const a of [-1, -0.35, 0.35, 1]) circP(x + a * 30, y - 3, 3, wh);
    fillP(ctx, wh, M.ink);
    const pole = rectP(x - 3, y - hh, 6, hh - 6);
    M.solid(ctx, pole, M.pal.metal, { lx: -2, ly: 0, lw: M.thin + 0.4 });
    const hook = P(); hook.moveTo(x - 24, y - hh + 10); hook.lineTo(x + 24, y - hh + 10);
    hook.moveTo(x - 24, y - hh + 10); hook.arc(x - 24, y - hh + 4, 6, Math.PI / 2, Math.PI * 1.5);
    M.stroke(ctx, hook, 3);
    const bag = P();
    bag.moveTo(x - 38, y - hh + 20); bag.lineTo(x - 10, y - hh + 20); bag.quadraticCurveTo(x - 6, y - hh + 60, x - 18, y - hh + 74); bag.lineTo(x - 30, y - hh + 74); bag.quadraticCurveTo(x - 42, y - hh + 60, x - 38, y - hh + 20);
    M.fill(ctx, bag, M.mono ? '#dddddd' : '#e8f0e8');
    clipped(ctx, bag, () => M.fill(ctx, rectP(x - 44, y - hh + 44, 40, 40), M.key === 'zombie' ? '#c8302a' : '#8fd0e8'));
    M.stroke(ctx, bag, M.thin + 0.6);
    const tube = P(); tube.moveTo(x - 24, y - hh + 74); tube.bezierCurveTo(x - 30, y - 60, x + 30, y - 90, x + 26, y - 30);
    M.stroke(ctx, tube, 1.8);
    if (M.key === 'zombie') { const d = P(); circP(x + 26, y - 26, 3, d); circP(x + 27, y - 14, 2.4, d); fillP(ctx, d, M.col('#8e1c1c')); }
  },

  curtain(ctx, x, y, M, R) {
    const w = R.r(110, 140), hh = 170;
    const frame = P();
    frame.rect(x - w / 2 - 4, y - hh, 8, hh - 8); frame.rect(x + w / 2 - 4, y - hh, 8, hh - 8); frame.rect(x - w / 2 - 4, y - hh - 4, w + 8, 8);
    M.solid(ctx, frame, M.pal.metal, { lx: -2, ly: -2, lw: M.thin + 0.4 });
    const wh = P(); circP(x - w / 2, y - 5, 5, wh); circP(x + w / 2, y - 5, 5, wh);
    inked(ctx, wh, M.col('#3a3a3a'), 1.4, M.ink);
    const cl = P();
    const folds = 6;
    cl.moveTo(x - w / 2 + 4, y - hh + 6);
    cl.lineTo(x + w / 2 - 4, y - hh + 6);
    cl.lineTo(x + w / 2 - 4, y - 30);
    for (let k = folds; k > 0; k--) cl.quadraticCurveTo(x - w / 2 + 4 + ((k - 0.5) / folds) * (w - 8), y - 22 - (k % 2) * 8, x - w / 2 + 4 + ((k - 1) / folds) * (w - 8), y - 30);
    cl.closePath();
    const cc = M.key === 'zombie' ? '#a4c2bb' : M.key === 'space' ? '#c8d8f0' : '#dcd4c0';
    M.fill(ctx, cl, cc);
    clipped(ctx, cl, () => {
      const f = P();
      for (let k = 0; k < folds; k++) f.rect(x - w / 2 + 4 + (k / folds) * (w - 8) + (w - 8) / folds * 0.55, y - hh, (w - 8) / folds * 0.25, hh);
      if (M.mono) fillP(ctx, f, hatchPattern(ctx, NB, 3.6, 1.1)); else fillP(ctx, f, shade(M.col(cc), -0.18));
      if (M.key === 'zombie') {
        const b = P(); b.moveTo(x - w * 0.2, y); b.quadraticCurveTo(x, y - 90, x + w * 0.15, y - 40); b.quadraticCurveTo(x + w * 0.3, y - 60, x + w * 0.4, y); b.closePath();
        fillP(ctx, b, M.col('#8e1c1c'));
        const hp = P(); handPath(x - w * 0.15, y - hh * 0.55, 10, -0.2, hp); fillP(ctx, hp, M.col('#8e1c1c'));
      }
    });
    M.stroke(ctx, cl, M.thin + 0.8);
  },

  cabinet(ctx, x, y, M, R) {
    const w = R.r(56, 70), hh = R.r(120, 140);
    const c = M.key === 'noir' ? '#6a6a6a' : M.key === 'zombie' ? '#9aa89a' : M.key === 'space' ? '#b8c4d4' : '#7a8a78';
    const body = rectP(x - w / 2, y - hh, w, hh);
    M.solid(ctx, body, c, { lx: -6, ly: 0 });
    const n = 4, dh = (hh - 14) / n;
    for (let i = 0; i < n; i++) {
      const d = rectP(x - w / 2 + 6, y - hh + 7 + i * dh, w - 12, dh - 6);
      M.stroke(ctx, d, M.thin);
      const hnd = rrectP(x - 10, y - hh + 7 + i * dh + 8, 20, 5, 2);
      inked(ctx, hnd, M.mono ? NW : M.col('#e8e4d8'), 1.2, M.ink);
      const lbl = rectP(x - 9, y - hh + 7 + i * dh + 18, 18, 8);
      inked(ctx, lbl, M.mono ? NW : M.col('#f2efe6'), 1, M.ink);
    }
    if (R.chance(0.5)) {
      // one drawer hanging open with papers
      const i = R.i(1, 3);
      const d = rectP(x - w / 2 - 10, y - hh + 7 + i * dh, w - 4, dh - 6);
      M.solid(ctx, d, c, { lx: 0, ly: -3 });
      const pp = P(); for (let k = 0; k < 4; k++) pp.rect(x - w / 2 - 4 + k * 10, y - hh + 2 + i * dh, 8, 10);
      M.solid(ctx, pp, '#f2efe6', { shadow: false, lw: 1 });
    }
    if (M.key === 'noir' || M.key === 'hero') {
      // hat & bottle on top
      const b = P(); b.rect(x + w * 0.1, y - hh - 26, 11, 26); b.rect(x + w * 0.1 + 3, y - hh - 36, 5, 10);
      M.solid(ctx, b, M.key === 'noir' ? '#2a2a2a' : '#6a4a2a', { lx: -2, ly: 0, lw: 1.6 });
    }
  },

  plant(ctx, x, y, M, R) {
    const potC = M.key === 'space' ? '#c8d0da' : M.key === 'noir' ? '#2a2a2a' : '#c0704a';
    const pot = polyP([[x - 22, y - 44], [x + 22, y - 44], [x + 16, y], [x - 16, y]]);
    M.solid(ctx, pot, potC, { lx: -4, ly: 0 });
    M.solid(ctx, rectP(x - 26, y - 50, 52, 10), potC, { lx: 0, ly: -3 });
    if (M.key === 'zombie') {
      // dead plant: droopy brown stems
      const st = P();
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + R.r(-0.8, 0.8), l = R.r(40, 80);
        st.moveTo(x + R.r(-8, 8), y - 50);
        st.quadraticCurveTo(x + Math.cos(a) * l, y - 50 + Math.sin(a) * l, x + Math.cos(a) * l * 1.3, y - 50 + Math.sin(a) * l * 0.6 + 20);
      }
      strokeP(ctx, st, 5, M.ink); strokeP(ctx, st, 2.4, M.col('#8a6a3a'));
      const lv = P();
      for (let i = 0; i < 5; i++) ellP(x + R.r(-40, 40), y - R.r(4, 10), 7, 3, R.r(0, 3), lv);
      M.solid(ctx, lv, '#8a6a3a', { shadow: false, lw: 1.2 });
      return;
    }
    if (M.key === 'space') {
      const st = P();
      for (let i = 0; i < 4; i++) { const tx = x + (i - 1.5) * 12, th = R.r(50, 100); st.moveTo(tx, y - 50); st.quadraticCurveTo(tx + R.r(-30, 30), y - 50 - th * 0.6, tx + R.r(-16, 16), y - 50 - th); }
      strokeP(ctx, st, 7, M.ink); strokeP(ctx, st, 4, M.col('#8ad05a'));
      for (let i = 0; i < 4; i++) M.solid(ctx, circP(x + (i - 1.5) * 14 + R.r(-10, 10), y - R.r(100, 150), R.r(7, 12)), M.pal.a2, { lx: -3, ly: -3, lw: 1.8 });
      return;
    }
    // leafy palm / rubber plant
    const leafC = M.key === 'noir' ? '#2a2a2a' : '#3f9a4a';
    const n = R.i(6, 9);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.6 + R.r(-0.1, 0.1);
      const l = R.r(60, 100);
      const bx = x, by = y - 50;
      const tx = bx + Math.cos(a) * l, ty = by + Math.sin(a) * l * 0.9 - 20;
      const nx = -Math.sin(a) * 12, ny = Math.cos(a) * 12;
      const leaf = P();
      leaf.moveTo(bx, by);
      leaf.quadraticCurveTo((bx + tx) / 2 + nx, (by + ty) / 2 + ny - 10, tx, ty + 8);
      leaf.quadraticCurveTo((bx + tx) / 2 - nx, (by + ty) / 2 - ny - 10, bx, by);
      M.solid(ctx, leaf, leafC, { lx: -3, ly: -3, lw: M.thin + 0.4 });
      M.line(ctx, lineP(bx, by, (bx + tx * 2) / 3, (by + ty * 2) / 3 - 4), 1);
    }
  },

  mannequin(ctx, x, y, M, R) {
    const c = M.key === 'noir' ? '#dddddd' : '#e8d8c0';
    const stand = P(); stand.rect(x - 2.5, y - 60, 5, 58); stand.moveTo(x - 20, y); stand.lineTo(x, y - 8); stand.lineTo(x + 20, y); stand.closePath();
    M.solid(ctx, stand, M.pal.metalD, { lx: -2, ly: 0, lw: M.thin + 0.2 });
    const body = P();
    const b = y - 60;
    body.moveTo(x - 14, b); body.quadraticCurveTo(x - 18, b - 30, x - 14, b - 50); body.quadraticCurveTo(x - 24, b - 70, x - 20, b - 92);
    body.lineTo(x + 20, b - 92); body.quadraticCurveTo(x + 24, b - 70, x + 14, b - 50); body.quadraticCurveTo(x + 18, b - 30, x + 14, b); body.closePath();
    const outfit = R.pick(['#c84a6a', '#4a8ac8', '#e8c040', '#6ac08a']);
    M.solid(ctx, body, c, { lx: -5, ly: 0 });
    clipped(ctx, body, () => {
      const dress = rectP(x - 30, b - 60, 60, 70);
      M.fill(ctx, dress, outfit);
      if (!M.mono) dotsIn(ctx, dress, shade(M.col(outfit), -0.3), 5, 1.2);
    });
    M.stroke(ctx, body, M.lw);
    const neck = rectP(x - 4, b - 102, 8, 12);
    M.solid(ctx, neck, c, { lx: -1, ly: 0, lw: M.thin });
    if (R.chance(0.6)) M.solid(ctx, ellP(x, b - 114, 10, 13), c, { lx: -3, ly: -3 });
    // one arm (maybe missing the other)
    const arm = P(); arm.moveTo(x + 18, b - 88); arm.quadraticCurveTo(x + 30, b - 60, x + 24, b - 40);
    strokeP(ctx, arm, 10, M.ink); strokeP(ctx, arm, 5.5, M.col(c));
    if (M.key !== 'zombie') { const a2 = P(); a2.moveTo(x - 18, b - 88); a2.quadraticCurveTo(x - 28, b - 60, x - 24, b - 42); strokeP(ctx, a2, 10, M.ink); strokeP(ctx, a2, 5.5, M.col(c)); }
    else { const bl = P(); handPath(x - 6, b - 40, 6, 0.3, bl); fillP(ctx, bl, M.col('#8e1c1c')); }
  },

  bench(ctx, x, y, M, R) {
    const w = 140;
    const legs = P(); legs.rect(x - w / 2 + 10, y - 34, 8, 34); legs.rect(x + w / 2 - 18, y - 34, 8, 34);
    legs.rect(x - w / 2 + 10, y - 70, 6, 36); legs.rect(x + w / 2 - 16, y - 70, 6, 36);
    M.solid(ctx, legs, M.pal.metalD, { lx: -2, ly: 0 });
    const seat = P(); seat.rect(x - w / 2, y - 38, w, 8); seat.rect(x - w / 2, y - 28, w, 6);
    M.solid(ctx, seat, M.pal.wood, { lx: 0, ly: -2 });
    const back = P(); back.rect(x - w / 2 + 4, y - 72, w - 8, 9); back.rect(x - w / 2 + 4, y - 58, w - 8, 9);
    M.solid(ctx, back, M.pal.wood, { lx: 0, ly: -2 });
    if (M.key === 'zombie') { const t = P(); t.rect(x - 20, y - 50, 20, 12); M.solid(ctx, t, '#e8e4d4', { shadow: false, lw: 1.2 }); }
  },

  terminal(ctx, x, y, M, R) {
    const body = polyP([[x - 40, y], [x - 40, y - 80], [x - 50, y - 90], [x - 36, y - 150], [x + 36, y - 150], [x + 50, y - 90], [x + 40, y - 80], [x + 40, y]]);
    M.solid(ctx, body, M.pal.metal, { lx: -6, ly: -4 });
    const sc = polyP([[x - 32, y - 142], [x + 32, y - 142], [x + 40, y - 96], [x - 40, y - 96]]);
    fillP(ctx, sc, M.mono ? NB : M.col('#123040'));
    clipped(ctx, sc, () => {
      const t = P();
      for (let k = 0; k < 5; k++) t.rect(x - 28 + (k % 2) * 6, y - 134 + k * 8, R.r(20, 50), 3);
      fillP(ctx, t, M.light(M.pal.glow));
    });
    M.stroke(ctx, sc, M.thin + 0.4);
    const keys = P();
    for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) keys.rect(x - 34 + k * 11.5, y - 88 + r * 9, 9, 6);
    fillP(ctx, keys, M.mono ? NW : M.col('#e8ecf0'));
    M.line(ctx, keys, 1);
    const leds = P(), leds2 = P();
    for (let k = 0; k < 6; k++) (R() < 0.5 ? leds : leds2).rect(x - 30 + k * 11, y - 60, 7, 7);
    fillP(ctx, leds, M.light(M.pal.a2)); fillP(ctx, leds2, M.light(M.pal.a3));
    M.line(ctx, leds, 1); M.line(ctx, leds2, 1);
    const vent = P(); for (let k = 0; k < 4; k++) vent.rect(x - 24, y - 40 + k * 8, 48, 3);
    fillP(ctx, vent, M.ink);
  },

  rocket(ctx, x, y, M, R) {
    const hh = R.r(190, 240), bw = hh * 0.28;
    const trim = M.mono ? '#d7141a' : R.pick([M.pal.a1, M.pal.a2, '#c9544d']);
    const stand = P(); stand.moveTo(x - bw, y); stand.lineTo(x - bw * 0.5, y - 40); stand.moveTo(x + bw, y); stand.lineTo(x + bw * 0.5, y - 40);
    M.stroke(ctx, stand, 5);
    const fin = P();
    polyP([[x - bw * 0.45, y - hh * 0.35], [x - bw * 1.05, y - 26], [x - bw * 0.45, y - 40]], true, fin);
    polyP([[x + bw * 0.45, y - hh * 0.35], [x + bw * 1.05, y - 26], [x + bw * 0.45, y - 40]], true, fin);
    M.solid(ctx, fin, trim, { lx: -3, ly: -3 });
    const b = P();
    b.moveTo(x - bw * 0.5, y - 40); b.bezierCurveTo(x - bw * 0.62, y - hh * 0.55, x - bw * 0.4, y - hh * 0.85, x, y - hh);
    b.bezierCurveTo(x + bw * 0.4, y - hh * 0.85, x + bw * 0.62, y - hh * 0.55, x + bw * 0.5, y - 40); b.closePath();
    M.solid(ctx, b, M.mono ? '#dddddd' : '#e0dace', { lx: -6, ly: 0 });
    clipped(ctx, b, () => {
      M.fill(ctx, rectP(x - bw, y - hh, bw * 2, hh * 0.16), trim);
      M.fill(ctx, rectP(x - bw, y - hh * 0.5, bw * 2, hh * 0.05), trim);
    });
    M.stroke(ctx, b, M.lw);
    M.solid(ctx, circP(x, y - hh * 0.65, bw * 0.2), M.pal.glass, { lx: -2, ly: -2, lw: M.thin + 0.4 });
    fillP(ctx, polyP([[x - bw * 0.3, y - 40], [x + bw * 0.3, y - 40], [x + bw * 0.4, y - 26], [x - bw * 0.4, y - 26]]), M.col('#6a6f7a'));
    M.stroke(ctx, polyP([[x - bw * 0.3, y - 40], [x + bw * 0.3, y - 40], [x + bw * 0.4, y - 26], [x - bw * 0.4, y - 26]]), M.thin + 0.4);
  },

  crystal(ctx, x, y, M, R) {
    const col = M.key === 'space' ? M.pal.a1 : M.key === 'zombie' ? M.pal.a1 : M.key === 'noir' ? '#f2efe6' : '#8ad0f0';
    const s = R.r(110, 150);
    if (!M.mono) M.glow(ctx, x, y - s * 0.4, s * 0.9, col);
    const n = R.i(4, 6);
    const shards = [];
    for (let i = 0; i < n; i++) shards.push({ a: -Math.PI / 2 + (i - (n - 1) / 2) * 0.3 + R.r(-0.1, 0.1), len: s * R.r(0.5, 1) * (1 - Math.abs(i - (n - 1) / 2) * 0.15), wid: s * R.r(0.09, 0.14), ox: x + (i - (n - 1) / 2) * 12 });
    shards.sort((p, q) => q.len - p.len);
    for (const sh of shards) {
      const ca = Math.cos(sh.a), sa = Math.sin(sh.a), nx = -sa, ny = ca;
      const bx = sh.ox, by = y + 2, tx = bx + ca * sh.len, ty = by + sa * sh.len;
      const p = polyP([[bx + nx * sh.wid, by + ny * sh.wid], [bx + nx * sh.wid + ca * sh.len * 0.78, by + ny * sh.wid + sa * sh.len * 0.78], [tx, ty], [bx - nx * sh.wid + ca * sh.len * 0.78, by - ny * sh.wid + sa * sh.len * 0.78], [bx - nx * sh.wid, by - ny * sh.wid]]);
      M.fill(ctx, p, col);
      const half = polyP([[bx, by], [tx, ty], [bx - nx * sh.wid + ca * sh.len * 0.78, by - ny * sh.wid + sa * sh.len * 0.78], [bx - nx * sh.wid, by - ny * sh.wid]]);
      if (M.mono) fillP(ctx, half, hatchPattern(ctx, NB, 3.6, 1.1)); else { fillP(ctx, half, shade(M.col(col), -0.25)); dotsIn(ctx, half, shade(M.col(col), -0.5), 4, 0.9); }
      fillP(ctx, polyP([[bx + nx * sh.wid * 0.55, by], [bx + nx * sh.wid * 0.55 + ca * sh.len * 0.7, by + ny * sh.wid * 0.55 + sa * sh.len * 0.7], [bx + nx * sh.wid * 0.25 + ca * sh.len * 0.72, by + ny * sh.wid * 0.25 + sa * sh.len * 0.72], [bx + nx * sh.wid * 0.25, by]]), M.mono ? NW : shade(M.col(col), 0.55));
      M.stroke(ctx, p, M.thin + 0.6);
    }
  },

  rock(ctx, x, y, M, R) {
    const w = R.r(110, 150), hh = R.r(70, 100);
    const p = P();
    p.moveTo(x - w / 2, y);
    p.bezierCurveTo(x - w / 2 - 6, y - hh * 0.7, x - w * 0.2, y - hh * 1.05, x + w * 0.05, y - hh);
    p.bezierCurveTo(x + w * 0.35, y - hh * 0.98, x + w / 2 + 8, y - hh * 0.5, x + w / 2, y);
    p.closePath();
    const c = M.key === 'space' ? '#8a5a8a' : M.pal.stone;
    M.solid(ctx, p, c, { lx: -10, ly: -6 });
    clipped(ctx, p, () => {
      const st = P();
      for (let i = 0; i < 4; i++) { const yy = y - hh * (0.2 + i * 0.18); st.moveTo(x - w / 2, yy + R.r(-6, 6)); st.bezierCurveTo(x - w * 0.1, yy - 10, x + w * 0.1, yy + 10, x + w / 2, yy); }
      M.line(ctx, st, 1.2);
      const cr = P();
      for (let i = 0; i < 3; i++) ellP(x + R.r(-w * 0.3, w * 0.3), y - hh * R.r(0.25, 0.7), R.r(6, 12), R.r(4, 7), 0, cr);
      M.fill(ctx, cr, shade(c, -0.25));
      M.line(ctx, cr, 1.2);
    });
  },

  trash(ctx, x, y, M, R) {
    const cw = 50, ch = 68;
    const can = P(); can.moveTo(x - cw / 2, y - ch); can.lineTo(x + cw / 2, y - ch); can.lineTo(x + cw / 2 - 5, y); can.lineTo(x - cw / 2 + 5, y); can.closePath();
    M.solid(ctx, can, M.key === 'noir' ? '#4a4a4a' : '#8a929a', { lx: -6, ly: 0 });
    clipped(ctx, can, () => { const r = P(); for (let yy = y - ch + 14; yy < y; yy += 16) { r.moveTo(x - cw / 2, yy); r.lineTo(x + cw / 2, yy); } M.line(ctx, r, 1.4); });
    // lid knocked askew
    ctx.save();
    ctx.translate(x + 4, y - ch - 4);
    ctx.rotate(R.r(-0.35, 0.35));
    M.solid(ctx, ellP(0, 0, cw / 2 + 6, 7), M.key === 'noir' ? '#4a4a4a' : '#8a929a', { lx: 0, ly: -2 });
    M.solid(ctx, rrectP(-7, -12, 14, 7, 3), M.pal.metalD, { lx: 0, ly: -1, lw: 1.6 });
    ctx.restore();
    // bag + spilled junk
    const bag = P(); bag.moveTo(x + 24, y); bag.quadraticCurveTo(x + 20, y - 40, x + 44, y - 44); bag.quadraticCurveTo(x + 50, y - 54, x + 56, y - 44); bag.quadraticCurveTo(x + 80, y - 36, x + 72, y); bag.closePath();
    M.solid(ctx, bag, M.key === 'noir' ? '#1a1a1a' : '#3a3a48', { lx: -4, ly: -4 });
    const junk = P(); junk.rect(x - 44, y - 6, 16, 6); ellP(x - 20, y - 3, 7, 3, 0.3, junk);
    M.solid(ctx, junk, '#e8e4d4', { shadow: false, lw: 1.2 });
    if (M.key === 'noir' && R.chance(0.6)) {
      // alley cat eyes in the dark
      fillP(ctx, circP(x - 6, y - ch - 22, 2.4), NW); fillP(ctx, circP(x + 4, y - ch - 22, 2.4), NW);
    }
  },

  coatrack(ctx, x, y, M, R) {
    const hh = 190;
    const legs = P(); for (const a of [-1, 0, 1]) { legs.moveTo(x, y - 20); legs.lineTo(x + a * 26, y); }
    M.stroke(ctx, legs, 4);
    const pole = rectP(x - 3.5, y - hh, 7, hh - 18);
    M.solid(ctx, pole, M.pal.woodD, { lx: -2, ly: 0, lw: M.thin + 0.4 });
    M.solid(ctx, circP(x, y - hh - 4, 6), M.pal.woodD, { lx: -1, ly: -1, lw: M.thin });
    const hooks = P(); hooks.moveTo(x - 20, y - hh + 20); hooks.lineTo(x, y - hh + 8); hooks.lineTo(x + 20, y - hh + 20);
    M.stroke(ctx, hooks, 3);
    // trench coat
    const coat = P();
    coat.moveTo(x - 16, y - hh + 14); coat.quadraticCurveTo(x - 34, y - hh + 60, x - 28, y - 60); coat.lineTo(x - 4, y - 56); coat.lineTo(x - 2, y - hh + 30); coat.closePath();
    M.solid(ctx, coat, M.key === 'noir' ? '#bbbbbb' : '#c9a36b', { lx: -4, ly: 0 });
    M.line(ctx, lineP(x - 24, y - hh + 80, x - 8, y - hh + 80), 2);
    // fedora
    ctx.save(); ctx.translate(x + 20, y - hh + 16); ctx.rotate(0.3);
    const hat = P(); hat.moveTo(-20, 0); hat.quadraticCurveTo(0, 5, 20, 0); hat.lineTo(12, -2); hat.quadraticCurveTo(12, -18, 0, -16); hat.quadraticCurveTo(-12, -18, -12, -2); hat.closePath();
    M.solid(ctx, hat, M.key === 'noir' ? '#1a1a1a' : '#5a4632', { lx: -2, ly: -2 });
    fillP(ctx, rectP(-11, -6, 22, 4), M.mono ? NR : M.col('#b8171b'));
    ctx.restore();
  },

  fan(ctx, x, y, M, R) {
    const hh = 150;
    const base = ellP(x, y - 5, 28, 7);
    M.solid(ctx, base, M.pal.metalD, { lx: 0, ly: -2 });
    const pole = rectP(x - 3, y - hh + 30, 6, hh - 36);
    M.solid(ctx, pole, M.pal.metal, { lx: -2, ly: 0, lw: M.thin + 0.4 });
    const cy = y - hh + 10;
    const cage = circP(x, cy, 34);
    M.fill(ctx, cage, M.mono ? '#f2efe6' : M.col('#e8e4d8'));
    const blades = P();
    const a0 = R() * TAU;
    for (let k = 0; k < 3; k++) { const a = a0 + (k * TAU) / 3; blades.moveTo(x, cy); blades.quadraticCurveTo(x + Math.cos(a - 0.4) * 36, cy + Math.sin(a - 0.4) * 36, x + Math.cos(a + 0.2) * 30, cy + Math.sin(a + 0.2) * 30); blades.closePath(); }
    M.solid(ctx, blades, M.key === 'noir' ? '#4a4a4a' : '#6a8aa0', { lx: -2, ly: -2, lw: 1.6 });
    const g = P(); circP(x, cy, 34, g); circP(x, cy, 22, g); circP(x, cy, 10, g);
    for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8; g.moveTo(x, cy); g.lineTo(x + Math.cos(a) * 34, cy + Math.sin(a) * 34); }
    M.line(ctx, g, 1.2);
    M.stroke(ctx, cage, M.lw);
    M.solid(ctx, circP(x, cy, 6), M.pal.metalD, { lx: -1, ly: -1, lw: 1.4 });
    // spin lines
    const sl = P(); sl.arc(x, cy, 44, -0.6, 0.4); sl.moveTo(x - 44 * Math.cos(0.5), cy + 44 * Math.sin(0.5)); sl.arc(x, cy, 44, Math.PI - 0.5, Math.PI + 0.5);
    M.line(ctx, sl, 1.6);
  },

  piano(ctx, x, y, M, R) {
    const w = 150, hh = 130;
    const body = P(); body.rect(x - w / 2, y - hh, w, hh - 16);
    M.solid(ctx, body, M.key === 'noir' ? '#111111' : '#3a2418', { lx: -6, ly: -4 });
    M.solid(ctx, rectP(x - w / 2 - 6, y - hh - 8, w + 12, 10), M.key === 'noir' ? '#111111' : '#3a2418', { lx: 0, ly: -3 });
    const kb = rectP(x - w / 2 + 4, y - 62, w - 8, 14);
    fillP(ctx, kb, M.mono ? NW : M.col('#f2efe6'));
    const blk = P(); for (let k = 0; k < 18; k++) if (k % 7 !== 2 && k % 7 !== 6) blk.rect(x - w / 2 + 10 + k * 7.6, y - 62, 4, 8);
    fillP(ctx, blk, M.ink);
    M.stroke(ctx, kb, M.thin);
    const lgs = P(); lgs.rect(x - w / 2 + 6, y - 48, 10, 48); lgs.rect(x + w / 2 - 16, y - 48, 10, 48);
    M.solid(ctx, lgs, M.key === 'noir' ? '#111111' : '#3a2418', { lx: -2, ly: 0 });
    const panel = P(); panel.rect(x - w / 2 + 14, y - hh + 12, w / 2 - 20, 44); panel.rect(x + 6, y - hh + 12, w / 2 - 20, 44);
    M.stroke(ctx, panel, M.thin, M.mono ? '#ffffff' : null);
    if (M.mono) strokeP(ctx, panel, 1.2, NW);
    // candle / drink on top
    const g = P(); g.moveTo(x + 30, y - hh - 8); g.lineTo(x + 26, y - hh - 30); g.lineTo(x + 42, y - hh - 30); g.lineTo(x + 38, y - hh - 8); g.closePath();
    M.solid(ctx, g, '#e8e4d4', { shadow: false, lw: 1.4 });
    fillP(ctx, rectP(x + 28, y - hh - 22, 12, 6), M.mono ? NR : M.col('#c8302a'));
    const notes = P(); ellP(x - 40, y - hh - 30, 6, 4.5, -0.4, notes); notes.rect(x - 36, y - hh - 54, 2.4, 24); ellP(x - 18, y - hh - 44, 6, 4.5, -0.4, notes); notes.rect(x - 14, y - hh - 68, 2.4, 24); notes.rect(x - 36, y - hh - 56, 24, 4);
    fillP(ctx, notes, M.ink);
  },

  mic(ctx, x, y, M, R) {
    const hh = 150;
    const legs = P(); for (const a of [-1, 0, 1]) { legs.moveTo(x, y - 14); legs.lineTo(x + a * 22, y); }
    M.stroke(ctx, legs, 3.4);
    const pole = rectP(x - 2.5, y - hh + 20, 5, hh - 34);
    M.solid(ctx, pole, M.pal.metal, { lx: -1, ly: 0, lw: M.thin + 0.2 });
    const head = rrectP(x - 11, y - hh - 14, 22, 36, 11);
    M.solid(ctx, head, M.pal.metal, { lx: -4, ly: -3 });
    clipped(ctx, head, () => { const g = P(); for (let yy = y - hh - 12; yy < y - hh + 22; yy += 4) { g.moveTo(x - 11, yy); g.lineTo(x + 11, yy); } M.line(ctx, g, 1); });
    M.solid(ctx, rrectP(x - 13, y - hh + 2, 26, 6, 2), M.pal.metalD, { lx: 0, ly: -1, lw: 1.4 });
    if (M.mono) {
      // spotlight halo behind the mic
      const s = P(); s.moveTo(x - 30, y); s.quadraticCurveTo(x, y - 10, x + 30, y);
      M.line(ctx, s, 1.4);
    }
  },

  bollard(ctx, x, y, M, R) {
    const c = M.key === 'noir' ? '#1a1a1a' : '#3a3a44';
    const b = P();
    b.moveTo(x - 20, y); b.lineTo(x - 16, y - 36); b.quadraticCurveTo(x - 30, y - 42, x - 26, y - 52); b.lineTo(x + 26, y - 52); b.quadraticCurveTo(x + 30, y - 42, x + 16, y - 36); b.lineTo(x + 20, y); b.closePath();
    M.solid(ctx, b, c, { lx: -5, ly: -3 });
    M.solid(ctx, ellP(x, y - 52, 26, 6), c, { lx: 0, ly: -2 });
    const rope = P(); rope.moveTo(x - 18, y - 30); rope.bezierCurveTo(x - 40, y - 20, x - 60, y - 6, x - 90, y - 4);
    rope.moveTo(x + 16, y - 26); rope.quadraticCurveTo(x, y - 18, x - 16, y - 26);
    strokeP(ctx, rope, 8, M.ink); strokeP(ctx, rope, 4.5, M.mono ? NW : M.col('#d8c08a'));
    ctx.save(); ctx.setLineDash([3, 5]); strokeP(ctx, rope, 1.2, M.ink); ctx.restore();
  },

  crate(ctx, x, y, M, R) {
    const n = R.i(1, 2);
    let top = y;
    for (let i = 0; i < n; i++) {
      const s = R.r(56, 72) - i * 8;
      const ox = x + R.r(-8, 8) - s / 2;
      const c = rectP(ox, top - s, s, s);
      M.solid(ctx, c, M.pal.wood, { lx: -5, ly: -3 });
      const pl = P();
      pl.rect(ox + 5, top - s + 5, s - 10, s - 10);
      pl.moveTo(ox + 5, top - 5); pl.lineTo(ox + s - 5, top - s + 5);
      M.line(ctx, pl, 1.6);
      letters(ctx, R.pick(['FRAGILE', 'ACME', 'NO. 9', 'RUM']), ox + s / 2, top - s / 2, 11, M.mono ? NB : M.col('#4a2a1a'), { rot: -0.2, maxW: s - 12 });
      top -= s;
    }
  },

  rope(ctx, x, y, M, R) {
    const c = M.mono ? NW : M.col('#d8c08a');
    const post = rectP(x + 30, y - 70, 16, 70);
    M.solid(ctx, post, M.key === 'noir' ? '#1a1a1a' : M.pal.woodD, { lx: -3, ly: 0 });
    M.solid(ctx, ellP(x + 38, y - 70, 8, 3), M.key === 'noir' ? '#1a1a1a' : M.pal.woodD, { lx: 0, ly: -1, lw: 1.6 });
    // coil
    for (let i = 0; i < 4; i++) {
      const e = ellP(x - 10, y - 6 - i * 7, 34 - i * 4, 8 - i * 0.8);
      strokeP(ctx, e, 8, M.ink);
      strokeP(ctx, e, 4.5, c);
      ctx.save(); ctx.setLineDash([3, 5]); strokeP(ctx, e, 1.1, M.ink); ctx.restore();
    }
    const tail = P(); tail.moveTo(x - 10, y - 30); tail.bezierCurveTo(x, y - 60, x + 30, y - 66, x + 34, y - 56);
    strokeP(ctx, tail, 8, M.ink); strokeP(ctx, tail, 4.5, c);
    // life ring on the post
    const lr = P(); circP(x + 38, y - 44, 16, lr); circP(x + 38, y - 44, 9, lr);
    ctx.save(); ctx.fillStyle = M.mono ? NW : M.col('#f2efe6'); ctx.fill(lr, 'evenodd'); ctx.restore();
    clipped(ctx, lr, () => { const q = P(); for (let k = 0; k < 4; k++) { q.moveTo(x + 38, y - 44); q.arc(x + 38, y - 44, 18, k * Math.PI / 2, k * Math.PI / 2 + Math.PI / 4); q.closePath(); } fillP(ctx, q, M.mono ? NR : M.col('#d8402f')); });
    M.stroke(ctx, lr, M.thin + 0.4);
  },
};

export function decor(ctx, kind, x, y, theme, R) {
  const M = material(theme, false);
  const fn = DECOR[kind] || DECOR.crate;
  fn(ctx, x, y, M, R);
}

// ------------------------------------------------------------------ BLOCKS

const BLOCKS = {
  car(ctx, x, y, w, h, M, R, theme) {
    const body = M.mono ? '#161616' : R.pick(['#e8262b', '#1f8fd1', '#2fb88a', '#f0b21f', '#e86aa8', '#7b3fb8', '#23b8c8']);
    const roofC = M.mono ? '#161616' : '#f4efe0';
    const chrome = M.mono ? '#f2efe6' : '#e8eef4';
    const wheelR = h * 0.21;
    const roofL = x + w * 0.27, roofR = x + w * 0.86;
    const belt = y + h * 0.42;
    const bottom = y + h - wheelR * 0.5;
    const flip = R.chance(0.5);
    ctx.save();
    if (flip) { ctx.translate(x * 2 + w, 0); ctx.scale(-1, 1); }
    // cabin: long wagon roof, two-tone
    const cab = P();
    cab.moveTo(roofL - w * 0.09, belt);
    cab.quadraticCurveTo(roofL - w * 0.02, y + 2, roofL + w * 0.03, y);
    cab.lineTo(roofR - w * 0.02, y);
    cab.quadraticCurveTo(roofR + w * 0.01, y, roofR + w * 0.02, y + h * 0.1);
    cab.lineTo(roofR + w * 0.04, belt);
    cab.closePath();
    M.solid(ctx, cab, roofC, { lx: -4, ly: -4 });
    const wy0 = y + h * 0.09, wy1 = belt - 3;
    const wins = P();
    wins.moveTo(roofL - w * 0.06, wy1); wins.quadraticCurveTo(roofL - w * 0.01, wy0 + 2, roofL + w * 0.035, wy0); wins.lineTo(roofL + w * 0.2, wy0); wins.lineTo(roofL + w * 0.2, wy1); wins.closePath();
    wins.rect(roofL + w * 0.225, wy0, w * 0.17, wy1 - wy0);
    wins.moveTo(roofL + w * 0.42, wy0); wins.lineTo(roofR - w * 0.03, wy0); wins.quadraticCurveTo(roofR, wy0, roofR + w * 0.015, wy0 + h * 0.08); wins.lineTo(roofR + w * 0.025, wy1); wins.lineTo(roofL + w * 0.42, wy1); wins.closePath();
    fillP(ctx, wins, M.mono ? NW : '#8fd0e8');
    clipped(ctx, wins, () => {
      if (M.mono) { dotsIn(ctx, wins, NB, 4, 1.2); return; }
      halftoneGradient(ctx, x, wy0, w, wy1 - wy0, '#5aa8c8', { spacing: 4, dir: 'down', from: 0.3, maxR: 2.4 });
      const gl = P();
      for (let gx = x; gx < x + w; gx += 52) polyP([[gx, wy1], [gx + 10, wy1], [gx + 26, wy0], [gx + 16, wy0]], true, gl);
      fillP(ctx, gl, '#ffffff');
    });
    strokeP(ctx, wins, 3, chrome === '#e8eef4' && !M.mono ? INK : NB);
    strokeP(ctx, wins, 1.2, chrome);
    inked(ctx, rrectP(roofL + w * 0.06, y - 2, roofR - roofL - w * 0.1, 5, 2), chrome, 1.8, M.ink);
    // body with rocket tail fin
    const b = P();
    b.moveTo(x + w * 0.015, belt + h * 0.1);
    b.quadraticCurveTo(x + w * 0.02, belt - h * 0.03, x + w * 0.12, belt - h * 0.03);
    b.lineTo(x + w * 0.8, belt - h * 0.03);
    b.quadraticCurveTo(x + w * 0.92, belt - h * 0.06, x + w, y + h * 0.1);
    b.lineTo(x + w, bottom - h * 0.05);
    b.quadraticCurveTo(x + w, bottom, x + w * 0.97, bottom);
    b.lineTo(x + w * 0.03, bottom);
    b.quadraticCurveTo(x, bottom, x, bottom - h * 0.12);
    b.closePath();
    M.solid(ctx, b, body, { lx: 0, ly: -7 });
    clipped(ctx, b, () => {
      // two-tone side sweep in the roof color
      const sp = P();
      sp.moveTo(x + w * 0.34, belt + h * 0.26);
      sp.quadraticCurveTo(x + w * 0.62, belt + h * 0.05, x + w * 1.02, belt - h * 0.02);
      sp.lineTo(x + w * 1.02, belt + h * 0.12);
      sp.quadraticCurveTo(x + w * 0.64, belt + h * 0.16, x + w * 0.34, belt + h * 0.26);
      fillP(ctx, sp, M.mono ? NW : roofC);
      strokeP(ctx, sp, 1.8, M.ink);
      if (!M.mono) {
        halftoneGradient(ctx, x, belt + h * 0.22, w, bottom - belt, shade(body, -0.38), { spacing: 5, dir: 'down', from: 0.25, maxR: 2.7 });
        fillP(ctx, rectP(x, belt - h * 0.03 + 4, w * 0.8, 3.5), rgba('#ffffff', 0.6));
      } else {
        fillP(ctx, rectP(x, belt - h * 0.03 + 3, w * 0.8, 2), NW);
      }
    });
    strokeP(ctx, b, M.lw, M.ink);
    // chrome belt spear
    const spear = P(); spear.moveTo(x + w * 0.1, belt + h * 0.09); spear.lineTo(x + w * 0.5, belt + h * 0.09);
    strokeP(ctx, spear, 4.4, M.ink); strokeP(ctx, spear, 2, chrome);
    // door seams + handle
    const ds = P(); ds.moveTo(roofL + w * 0.21, belt); ds.lineTo(roofL + w * 0.21, bottom - 5); ds.moveTo(roofL + w * 0.4, belt); ds.lineTo(roofL + w * 0.4, bottom - 5);
    strokeP(ctx, ds, 1.6, M.mono ? NW : M.ink);
    inked(ctx, rrectP(roofL + w * 0.16, belt + 6, 12, 4, 2), chrome, 1.2, M.ink);
    // big chrome bumpers
    M.solid(ctx, rrectP(x - 4, bottom - h * 0.16, w * 0.17, h * 0.16, 6), chrome, { lx: 0, ly: -3, lw: 2.6 });
    M.solid(ctx, rrectP(x + w * 0.84, bottom - h * 0.16, w * 0.16 + 4, h * 0.16, 6), chrome, { lx: 0, ly: -3, lw: 2.6 });
    // grille, headlight with chrome ring, jet taillight in the fin
    M.solid(ctx, rrectP(x, belt + h * 0.13, w * 0.045, h * 0.2, 3), chrome, { lx: 0, ly: 0, lw: 2 });
    inked(ctx, circP(x + w * 0.075, belt + h * 0.12, h * 0.135), chrome, 2.2, M.ink);
    inked(ctx, circP(x + w * 0.075, belt + h * 0.12, h * 0.09), M.mono ? NW : '#fff6c8', 1.8, M.ink);
    fillP(ctx, circP(x + w * 0.07, belt + h * 0.1, h * 0.03), '#ffffff');
    const tl = P(); tl.moveTo(x + w - 3, y + h * 0.14); tl.lineTo(x + w - 3, y + h * 0.34); tl.lineTo(x + w - 12, y + h * 0.3); tl.closePath();
    inked(ctx, tl, M.mono ? NR : '#ff3a3a', 1.6, M.ink);
    // wheels: whitewalls under skirted arches
    for (const [wx, skirt] of [[x + w * 0.2, false], [x + w * 0.77, true]]) {
      const arch = P(); arch.moveTo(wx - wheelR * 1.3, bottom); arch.arc(wx, bottom, wheelR * 1.3, Math.PI, 0); arch.closePath();
      fillP(ctx, arch, M.mono ? NB : INK);
      const cy = y + h - wheelR;
      inked(ctx, circP(wx, cy, wheelR), M.mono ? NB : '#1b1b1b', 2.4, M.ink);
      inked(ctx, circP(wx, cy, wheelR * 0.7), M.mono ? NW : '#f2efe6', 1.4, M.ink);
      M.solid(ctx, circP(wx, cy, wheelR * 0.45), chrome, { lx: -2, ly: -2, lw: 1.6 });
      fillP(ctx, circP(wx, cy, wheelR * 0.12), M.ink);
      if (skirt) {
        const sk = P(); sk.moveTo(wx - wheelR * 1.3, bottom - 1); sk.lineTo(wx - wheelR * 1.3, bottom - wheelR * 0.9); sk.quadraticCurveTo(wx, bottom - wheelR * 1.5, wx + wheelR * 1.3, bottom - wheelR * 0.9); sk.lineTo(wx + wheelR * 1.3, bottom - 1); sk.closePath();
        M.solid(ctx, sk, body, { lx: 0, ly: -4, lw: 2.4 });
      }
    }
    ctx.restore();
  },

  vent(ctx, x, y, w, h, M, R) {
    const body = rectP(x, y, w, h);
    M.solid(ctx, body, M.pal.metal, { lx: -6, ly: -6 });
    const lv = P();
    const gx = x + 10, gw = w * 0.55, gy = y + 12, gh = h - 24;
    for (let yy = gy; yy < gy + gh; yy += 7) lv.rect(gx, yy, gw, 3.5);
    fillP(ctx, rectP(gx, gy, gw, gh), M.mono ? NB : shade(M.pal.metal, -0.5));
    fillP(ctx, lv, M.mono ? NW : shade(M.pal.metal, 0.2));
    strokeP(ctx, rectP(gx, gy, gw, gh), 2, M.ink);
    // fan housing on the side
    const fx = x + w * 0.8, fy = y + h * 0.45, fr = Math.min(w * 0.16, h * 0.3);
    const ring = circP(fx, fy, fr);
    M.solid(ctx, ring, M.pal.metalD, { lx: -2, ly: -2, lw: 2.2 });
    const bl = P();
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; bl.moveTo(fx, fy); bl.quadraticCurveTo(fx + Math.cos(a - 0.5) * fr, fy + Math.sin(a - 0.5) * fr, fx + Math.cos(a + 0.2) * fr * 0.9, fy + Math.sin(a + 0.2) * fr * 0.9); bl.closePath(); }
    fillP(ctx, bl, M.mono ? NW : M.pal.metal);
    strokeP(ctx, bl, 1.4, M.ink);
    // top lip (walkable) + rivets + warning label
    M.solid(ctx, rectP(x - 3, y, w + 6, 8), M.pal.metalD, { lx: 0, ly: -3, lw: 2.4 });
    rivetRow(ctx, x + 6, y + h - 6, x + w - 6, y + h - 6, 16, 1.8, M.mono ? NW : shade(M.pal.metal, 0.5), 1, M.ink);
    const lab = rectP(x + w * 0.68, y + h * 0.72, w * 0.26, h * 0.16);
    hazardStripes(ctx, lab, x + w * 0.68, y + h * 0.72, w * 0.26, h * 0.16, M.mono ? NW : '#ffd23f', M.ink, 5);
    strokeP(ctx, lab, 1.6, M.ink);
    const pipeP = P(); pipeP.moveTo(x + w, y + h * 0.3); pipeP.lineTo(x + w + 0.1, y + h * 0.3);
    void pipeP;
  },

  crates(ctx, x, y, w, h, M, R) {
    // two rows: bottom 2 crates, top 1-2 crates; the top edge stays flat
    const topH = h * R.r(0.42, 0.5);
    const botY = y + topH;
    const split = R.r(0.45, 0.58);
    const draw = (cx, cy, cw, chh, seed) => {
      const r = mkR(seed);
      const c = rectP(cx, cy, cw, chh);
      M.solid(ctx, c, r.chance(0.3) ? shade(M.pal.wood, 0.1) : M.pal.wood, { lx: -5, ly: -5 });
      clipped(ctx, c, () => {
        const pl = P();
        for (let px = cx + cw / 3; px < cx + cw - 2; px += cw / 3) { pl.moveTo(px, cy); pl.lineTo(px, cy + chh); }
        strokeP(ctx, pl, 1.3, M.mono ? NB : shade(M.pal.wood, -0.45));
      });
      const fr = P();
      fr.rect(cx + 5, cy + 5, cw - 10, chh - 10);
      strokeP(ctx, fr, 5.5, M.ink);
      strokeP(ctx, fr, 3, M.mono ? NW : shade(M.pal.wood, 0.25));
      const d = P(); d.moveTo(cx + 7, cy + chh - 7); d.lineTo(cx + cw - 7, cy + 7);
      strokeP(ctx, d, 6, M.ink); strokeP(ctx, d, 3.2, M.mono ? NW : shade(M.pal.wood, 0.25));
      const nails = P(); for (const [nx, ny] of [[cx + 8, cy + 8], [cx + cw - 8, cy + 8], [cx + 8, cy + chh - 8], [cx + cw - 8, cy + chh - 8]]) circP(nx, ny, 1.6, nails);
      fillP(ctx, nails, M.ink);
      if (r.chance(0.6) && cw > 40) {
        const t = r.pick(['FRAGILE', 'THIS SIDE UP', 'ACME', 'TNT', 'XXX', 'PROPERTY OF']);
        letters(ctx, t, cx + cw / 2, cy + chh / 2, Math.min(16, chh * 0.24), M.mono ? NR : (t === 'TNT' ? '#d8261e' : shade(M.pal.wood, -0.6)), { rot: -0.12, maxW: cw - 18 });
      }
      strokeP(ctx, c, M.lw, M.ink);
    };
    draw(x, botY, w * split, y + h - botY, R.i(1, 1e6));
    draw(x + w * split, botY, w * (1 - split), y + h - botY, R.i(1, 1e6));
    if (R.chance(0.5)) draw(x, y, w, topH, R.i(1, 1e6));
    else { const s2 = R.r(0.4, 0.6); draw(x, y, w * s2, topH, R.i(1, 1e6)); draw(x + w * s2, y, w * (1 - s2), topH, R.i(1, 1e6)); }
  },

  console(ctx, x, y, w, h, M, R) {
    const space = M.key === 'space';
    const bodyC = space ? '#c3ccd8' : M.key === 'hero' ? '#7e8f9c' : M.pal.metal;
    const body = rectP(x, y + 10, w, h - 10);
    M.solid(ctx, body, bodyC, { lx: -6, ly: -4 });
    const top = rectP(x - 4, y, w + 8, 12);
    M.solid(ctx, top, space ? M.pal.metalD : '#5a6878', { lx: 0, ly: -3 });
    if (space) fillP(ctx, rectP(x - 4, y + 9, w + 8, 3), M.light(M.pal.a1));
    // screen
    const sc = rrectP(x + 10, y + 20, w * 0.55, h * 0.36, 4);
    fillP(ctx, sc, M.mono ? NB : '#123040');
    clipped(ctx, sc, () => {
      const g = P();
      g.moveTo(x + 12, y + 20 + h * 0.2);
      for (let k = 0; k <= 12; k++) g.lineTo(x + 12 + k * (w * 0.55 - 4) / 12, y + 20 + h * 0.18 + Math.sin(k * 1.1 + R() * 2) * h * 0.1);
      strokeP(ctx, g, 2, M.light(M.pal.glow));
      const sl = P(); for (let sy = y + 20; sy < y + 20 + h * 0.36; sy += 4) sl.rect(x, sy, w, 1.3);
      fillP(ctx, sl, M.mono ? halftone(ctx, NB, 4, 0.8) : 'rgba(0,0,0,0.25)');
    });
    strokeP(ctx, sc, 2.2, M.ink);
    // dials & buttons
    const dx = x + w * 0.8;
    if (M.mono) dial(ctx, R, dx, y + 20 + h * 0.16, Math.min(12, w * 0.1), { face: NW, rim: NB, redColor: NR, ink: NB, lw: 1.6 });
    else dial(ctx, R, dx, y + 20 + h * 0.16, Math.min(12, w * 0.1), { face: '#efe8cf', rim: '#9aa3ad', lw: 1.6 });
    const bt = [P(), P(), P()];
    const cols = [M.pal.a1, M.pal.a2, M.pal.a3];
    for (let i = 0; i < 8; i++) {
      const bx = x + 12 + (i % 4) * ((w - 24) / 4), by = y + h * 0.58 + Math.floor(i / 4) * 14;
      rrectP(bx, by, (w - 24) / 4 - 6, 9, 3, bt[i % 3]);
    }
    bt.forEach((p, i) => { fillP(ctx, p, M.light(cols[i])); strokeP(ctx, p, 1.4, M.ink); });
    // levers
    for (let i = 0; i < 2; i++) {
      const lx = x + w * 0.7 + i * 12;
      M.stroke(ctx, lineP(lx, y + h * 0.62, lx - 4 + i * 8, y + h * 0.45), 3);
      M.solid(ctx, circP(lx - 4 + i * 8, y + h * 0.45, 4.5), i ? M.pal.a1 : M.pal.a3, { lx: -1, ly: -1, lw: 1.4 });
    }
    const vent = P(); for (let k = 0; k < 3; k++) vent.rect(x + 12, y + h - 18 + k * 5, w - 24, 2.4);
    fillP(ctx, vent, M.ink);
  },

  tomb(ctx, x, y, w, h, M, R) {
    // flat-topped stone monument / pedestal tomb
    const body = rectP(x + 3, y + 8, w - 6, h - 16);
    M.solid(ctx, body, M.pal.stone, { lx: -6, ly: -4 });
    M.solid(ctx, rectP(x, y, w, 10), shade(M.pal.stone, 0.08), { lx: 0, ly: -3 });
    M.solid(ctx, rectP(x - 2, y + h - 10, w + 4, 10), shade(M.pal.stone, -0.08), { lx: 0, ly: -3 });
    // engraved skull
    const cx = x + w / 2, cy = y + h * 0.42, s = Math.min(w, h) * 0.2;
    const sk = P(); circP(cx, cy, s, sk); sk.rect(cx - s * 0.6, cy + s * 0.6, s * 1.2, s * 0.6);
    fillP(ctx, sk, M.mono ? NW : shade(M.pal.stone, 0.2));
    strokeP(ctx, sk, 1.6, M.ink);
    const eyes = P(); circP(cx - s * 0.38, cy, s * 0.26, eyes); circP(cx + s * 0.38, cy, s * 0.26, eyes);
    fillP(ctx, eyes, M.ink);
    const cr = P(); cr.moveTo(x + w * 0.8, y + 10); cr.lineTo(x + w * 0.66, y + h * 0.3); cr.lineTo(x + w * 0.74, y + h * 0.42); cr.lineTo(x + w * 0.6, y + h * 0.6);
    strokeP(ctx, cr, 1.6, M.ink);
    // moss
    const moss = P();
    for (let i = 0; i < 6; i++) cloudPath(x + 6 + R() * (w - 12), y + h - 12 - R() * 10, 6, 4, 5, (R() * 1e6) | 0, moss);
    fillP(ctx, moss, M.mono ? hatchPattern(ctx, NB, 3.5, 1) : M.col('#6a9a4a'));
    strokeP(ctx, moss, 1, M.ink);
    letters(ctx, 'RIP', cx, y + h * 0.72, Math.min(14, w * 0.26), M.ink);
  },

  coffin(ctx, x, y, w, h, M, R) {
    const body = P();
    body.moveTo(x + w * 0.06, y);
    body.lineTo(x + w * 0.98, y);
    body.lineTo(x + w, y + h * 0.3);
    body.lineTo(x + w * 0.96, y + h);
    body.lineTo(x + w * 0.08, y + h);
    body.lineTo(x, y + h * 0.4);
    body.closePath();
    const wood = M.key === 'noir' ? '#1a1a1a' : '#6a3a2a';
    M.solid(ctx, body, wood, { lx: -5, ly: -5 });
    const lid = P(); lid.moveTo(x + w * 0.06, y); lid.lineTo(x + w * 0.98, y); lid.lineTo(x + w, y + h * 0.3); lid.lineTo(x, y + h * 0.4 - 2); lid.closePath();
    M.solid(ctx, lid, shade(wood, 0.15), { lx: 0, ly: -3 });
    clipped(ctx, body, () => {
      const g = P(); for (let yy = y + h * 0.5; yy < y + h; yy += 8) { g.moveTo(x, yy); g.bezierCurveTo(x + w * 0.3, yy - 3, x + w * 0.6, yy + 3, x + w, yy); }
      strokeP(ctx, g, 1.1, M.mono ? NW : shade(wood, -0.4));
    });
    strokeP(ctx, body, M.lw, M.ink);
    const hd = P(); for (const hx of [0.3, 0.55, 0.8]) hd.rect(x + w * hx - 8, y + h * 0.62, 16, 5);
    M.solid(ctx, hd, '#c8a040', { lx: 0, ly: -1, lw: 1.6 });
    const cr = P(); cr.rect(x + w * 0.14, y + h * 0.5, 4, h * 0.36); cr.rect(x + w * 0.14 - 7, y + h * 0.6, 18, 4);
    M.solid(ctx, cr, '#c8a040', { lx: 0, ly: 0, lw: 1.4, shadow: false });
    if (R.chance(0.6)) {
      // lid pried open a crack: fingers poking out
      const f = P();
      for (let k = 0; k < 4; k++) rrectP(x + w * 0.6 + k * 7, y - 6, 5, 10, 2.5, f);
      M.solid(ctx, f, M.key === 'zombie' ? '#9cc47a' : '#dddddd', { lx: 0, ly: 0, lw: 1.4, shadow: false });
      strokeP(ctx, lineP(x + w * 0.56, y + 1, x + w * 0.9, y + 1), 2.4, M.ink);
    }
  },

  wreck(ctx, x, y, w, h, M, R) {
    // crushed, burnt-out car shell (flat crumpled roof)
    const body = P();
    body.moveTo(x, y + h * 0.35);
    body.lineTo(x + w * 0.1, y + h * 0.2);
    body.lineTo(x + w * 0.26, y + 4);
    body.lineTo(x + w * 0.4, y);
    body.lineTo(x + w * 0.62, y + 2);
    body.lineTo(x + w * 0.8, y);
    body.lineTo(x + w * 0.9, y + h * 0.22);
    body.lineTo(x + w, y + h * 0.3);
    body.lineTo(x + w, y + h * 0.8);
    body.lineTo(x, y + h * 0.82);
    body.closePath();
    const rust = M.key === 'noir' ? '#3a3a3a' : '#8a4a32';
    M.solid(ctx, body, rust, { lx: -5, ly: -6 });
    clipped(ctx, body, () => {
      const burn = P();
      for (let i = 0; i < 5; i++) cloudPath(x + R() * w, y + h * R.r(0.3, 0.7), R.r(14, 30), R.r(8, 14), 7, (R() * 1e6) | 0, burn);
      fillP(ctx, burn, M.mono ? NB : '#2a1a18');
      dotsIn(ctx, rectP(x, y, w, h), M.mono ? NB : shade(rust, -0.5), 5, 1.3);
      const wins = P();
      polyP([[x + w * 0.2, y + h * 0.38], [x + w * 0.28, y + 12], [x + w * 0.46, y + 10], [x + w * 0.46, y + h * 0.38]], true, wins);
      polyP([[x + w * 0.5, y + h * 0.38], [x + w * 0.5, y + 10], [x + w * 0.74, y + 10], [x + w * 0.84, y + h * 0.38]], true, wins);
      fillP(ctx, wins, M.mono ? NB : '#1a1214');
      strokeP(ctx, wins, 2, M.ink);
      const sh = P(); sh.moveTo(x + w * 0.3, y + 14); sh.lineTo(x + w * 0.36, y + h * 0.3); sh.lineTo(x + w * 0.4, y + 12);
      strokeP(ctx, sh, 1.4, M.mono ? NW : '#9aa8b0');
    });
    strokeP(ctx, body, M.lw, M.ink);
    // flat tires / rims
    for (const wx of [x + w * 0.2, x + w * 0.8]) {
      const t = ellP(wx, y + h - h * 0.14, h * 0.2, h * 0.14);
      inked(ctx, t, M.mono ? NB : '#1b1b1b', 2.4, M.ink);
      M.solid(ctx, ellP(wx, y + h - h * 0.16, h * 0.1, h * 0.07), M.pal.metalD, { lx: -1, ly: -1, lw: 1.4 });
    }
    // twisted bumper + smoke wisps
    const bp = P(); bp.moveTo(x - 4, y + h * 0.6); bp.quadraticCurveTo(x + 10, y + h * 0.7, x + 2, y + h * 0.84);
    strokeP(ctx, bp, 7, M.ink); strokeP(ctx, bp, 3.5, M.mono ? NW : '#c8ccd0');
    if (M.key === 'zombie') {
      const sm = P(); cloudPath(x + w * 0.6, y - 12, 14, 9, 7, 3, sm); cloudPath(x + w * 0.66, y - 32, 18, 12, 7, 4, sm);
      ctx.save(); ctx.globalAlpha = 0.85; strokeP(ctx, sm, 3, M.ink); fillP(ctx, sm, '#5a4a52'); ctx.restore();
    }
  },

  reactor(ctx, x, y, w, h, M, R) {
    const capH = 14;
    const body = rectP(x + 6, y + capH, w - 12, h - capH * 2);
    M.solid(ctx, body, M.pal.metal, { lx: -7, ly: 0 });
    // glowing core window
    const win = rrectP(x + w * 0.28, y + capH + 10, w * 0.44, h - capH * 2 - 20, w * 0.2);
    const g = M.mono ? NW : M.pal.a1;
    fillP(ctx, win, M.mono ? NW : shade(M.pal.a1, 0.4));
    clipped(ctx, win, () => {
      fillP(ctx, rectP(x + w * 0.44, y, w * 0.12, h), '#ffffff');
      if (!M.mono) halftoneGradient(ctx, x + w * 0.28, y, w * 0.44, h, g, { spacing: 5, dir: 'center', cx: x + w / 2, cy: y + h / 2, from: 0.5, to: 1.3, maxR: 3.1 });
      else dotsIn(ctx, win, NB, 4, 0.9);
      const a = arcLine(R, x + w * 0.32, y + h * 0.3, x + w * 0.68, y + h * 0.7, 6, 0.3);
      strokeP(ctx, a, 2, M.mono ? NB : '#ffffff');
    });
    strokeP(ctx, win, 2.6, M.ink);
    // cage bars
    const bars = P(); for (let yy = y + capH + 26; yy < y + h - capH - 10; yy += 22) bars.rect(x + w * 0.26, yy, w * 0.48, 4);
    M.solid(ctx, bars, M.pal.metalD, { lx: 0, ly: -1, lw: 1.6, shadow: false });
    // caps
    M.solid(ctx, rrectP(x, y, w, capH + 2, 3), M.pal.metalD, { lx: 0, ly: -4 });
    M.solid(ctx, rrectP(x, y + h - capH - 2, w, capH + 2, 3), M.pal.metalD, { lx: 0, ly: -4 });
    hazardStripes(ctx, rectP(x + 4, y + h - capH, w - 8, capH - 4), x + 4, y + h - capH, w - 8, capH - 4, M.mono ? NW : M.pal.a3, M.ink, 6);
    rivetRow(ctx, x + 8, y + capH / 2 + 1, x + w - 8, y + capH / 2 + 1, 12, 1.8, M.mono ? NW : '#dfe6ee', 1, M.ink);
    // radiation badge
    const bx = x + w * 0.14, by = y + h * 0.5;
    inked(ctx, circP(bx, by, 7), M.mono ? NW : '#ffe14a', 1.4, M.ink);
    const tre = P(); for (let k = 0; k < 3; k++) { const a = k * TAU / 3 - Math.PI / 2; tre.moveTo(bx, by); tre.arc(bx, by, 6, a - 0.5, a + 0.5); tre.closePath(); }
    fillP(ctx, tre, M.ink);
  },

  pod(ctx, x, y, w, h, M, R) {
    const body = P();
    body.moveTo(x + 6, y + 12);
    body.lineTo(x + w - 6, y + 12);
    body.bezierCurveTo(x + w + 4, y + h * 0.4, x + w + 2, y + h * 0.8, x + w - 8, y + h - 10);
    body.lineTo(x + 8, y + h - 10);
    body.bezierCurveTo(x - 2, y + h * 0.8, x - 4, y + h * 0.4, x + 6, y + 12);
    body.closePath();
    M.solid(ctx, body, '#e8ecf2', { lx: -7, ly: -3 });
    // frosted window with sleeper
    const win = rrectP(x + w * 0.2, y + 24, w * 0.6, h * 0.5, w * 0.25);
    fillP(ctx, win, M.mono ? NW : '#9fe0f0');
    clipped(ctx, win, () => {
      const f = P(); circP(x + w / 2, y + 44, w * 0.14, f); f.rect(x + w / 2 - w * 0.18, y + 54, w * 0.36, h);
      fillP(ctx, f, M.mono ? halftone(ctx, NB, 4, 1.3) : '#5a9ab0');
      const fr = P(); for (let i = 0; i < 10; i++) circP(x + w * 0.2 + R() * w * 0.6, y + 24 + R() * h * 0.5, R.r(2, 6), fr);
      fillP(ctx, fr, M.mono ? NW : '#e8fbff');
      if (!M.mono) fillP(ctx, polyP([[x + w * 0.24, y + 24 + h * 0.5], [x + w * 0.32, y + 24 + h * 0.5], [x + w * 0.5, y + 24], [x + w * 0.42, y + 24]]), 'rgba(255,255,255,0.45)');
      if (M.mono) dotsIn(ctx, win, NB, 4, 0.8);
    });
    strokeP(ctx, win, 2.6, M.ink);
    // top cap (flat walkable) + base
    M.solid(ctx, rrectP(x, y, w, 14, 4), M.pal.metalD, { lx: 0, ly: -4 });
    M.solid(ctx, rrectP(x + 2, y + h - 14, w - 4, 14, 4), M.pal.metalD, { lx: 0, ly: -4 });
    const leds = P(); for (let k = 0; k < 4; k++) leds.rect(x + w * 0.25 + k * w * 0.14, y + h * 0.72, w * 0.08, 6);
    fillP(ctx, leds, M.light(M.pal.a2));
    strokeP(ctx, leds, 1.2, M.ink);
    fillP(ctx, rectP(x + w * 0.2, y + h * 0.82, w * 0.6, 4), M.light(M.pal.a1));
  },

  desk(ctx, x, y, w, h, M, R) {
    const wood = M.key === 'noir' ? '#1a1a1a' : '#8a5a34';
    const top = rectP(x - 2, y, w + 4, 12);
    M.solid(ctx, top, shade(wood, 0.12), { lx: 0, ly: -4 });
    const ped = P();
    ped.rect(x + 4, y + 12, w * 0.34, h - 12);
    ped.rect(x + w - 4 - w * 0.34, y + 12, w * 0.34, h - 12);
    M.solid(ctx, ped, wood, { lx: -5, ly: 0 });
    const back = rectP(x + 4 + w * 0.34, y + 12, w - 8 - w * 0.68, h * 0.4);
    M.solid(ctx, back, shade(wood, -0.2), { lx: 0, ly: -3 });
    fillP(ctx, rectP(x + 6 + w * 0.34, y + 12 + h * 0.4, w - 12 - w * 0.68, h * 0.6 - 12), M.mono ? NB : shade(wood, -0.55));
    const dr = P();
    for (const px of [x + 4, x + w - 4 - w * 0.34]) for (let k = 0; k < 2; k++) {
      dr.rect(px + 5, y + 18 + k * ((h - 24) / 2), w * 0.34 - 10, (h - 24) / 2 - 6);
    }
    strokeP(ctx, dr, 1.8, M.mono ? NW : M.ink);
    const kn = P(); for (const px of [x + 4, x + w - 4 - w * 0.34]) for (let k = 0; k < 2; k++) circP(px + w * 0.17, y + 18 + k * ((h - 24) / 2) + (h - 24) / 4 - 3, 2.8, kn);
    fillP(ctx, kn, M.mono ? NW : '#e8c060');
    strokeP(ctx, kn, 1, M.ink);
    // flat papers on top (doesn't break the walkable edge)
    const pp = P(); pp.rect(x + w * 0.1, y - 3, w * 0.22, 4); pp.rect(x + w * 0.58, y - 2, w * 0.18, 3);
    M.solid(ctx, pp, '#f2efe6', { shadow: false, lw: 1.2 });
    if (M.mono) strokeP(ctx, top, 1.4, NW);
  },

  drums(ctx, x, y, w, h, M, R) {
    const n = w > 80 ? 2 : 1;
    const dw = w / n;
    const cols = M.mono ? ['#1a1a1a', '#d7141a'] : [R.pick(['#2f7a4a', '#3a5a9a', '#c8402a']), R.pick(['#e8a02a', '#5a6a7a', '#c8402a'])];
    for (let i = 0; i < n; i++) {
      const dx = x + i * dw;
      const c = cols[i % cols.length];
      const body = rrectP(dx + 1, y + 2, dw - 2, h - 2, 4);
      M.solid(ctx, body, c, { lx: -dw * 0.12, ly: 0 });
      const ribs = P(); ribs.rect(dx - 1, y + h * 0.3, dw + 2 - 2, 5); ribs.rect(dx - 1, y + h * 0.66, dw + 2 - 2, 5);
      M.solid(ctx, ribs, shade(c, -0.15), { lx: 0, ly: -2, lw: 1.8 });
      M.solid(ctx, ellP(dx + dw / 2, y + 4, dw / 2 - 1, 4), shade(c, 0.1), { lx: 0, ly: -2, lw: 2 });
      M.solid(ctx, circP(dx + dw * 0.72, y + 4, 2.6), '#c8c8c8', { shadow: false, lw: 1.2 });
      if (i === 0 || M.mono) {
        const lab = rectP(dx + dw * 0.22, y + h * 0.4, dw * 0.56, h * 0.2);
        inked(ctx, lab, M.mono ? NW : '#f2efe6', 1.4, M.ink);
        const tri = polyP([[dx + dw / 2, y + h * 0.41], [dx + dw / 2 + 6, y + h * 0.58], [dx + dw / 2 - 6, y + h * 0.58]]);
        inked(ctx, tri, M.mono ? NR : '#ffd23f', 1.2, M.ink);
      }
      if (M.key === 'zombie' && i === 1) {
        const ooze = P(); ooze.moveTo(dx + dw * 0.2, y + 4); ooze.quadraticCurveTo(dx + dw * 0.3, y + h * 0.4, dx + dw * 0.36, y + 4); ooze.quadraticCurveTo(dx + dw * 0.5, y + h * 0.25, dx + dw * 0.6, y + 4); ooze.closePath();
        inked(ctx, ooze, '#7fd13b', 1.6, M.ink);
      }
    }
  },
};

export function block(ctx, style, x, y, w, h, theme, R) {
  const M = material(theme, true);
  const fn = BLOCKS[style] || BLOCKS.crates;
  // ground contact shadow
  ctx.save();
  ctx.globalAlpha = M.mono ? 1 : 0.35;
  fillP(ctx, ellP(x + w / 2, y + h, w * 0.55, 5), M.mono ? NB : INK);
  ctx.restore();
  fn(ctx, x, y, w, h, M, R, theme);
}

// ------------------------------------------------------------------ PLATFORMS

function cable(ctx, M, x, y0, y1, chain) {
  if (y1 <= y0 + 4) return;
  if (chain) {
    const p = P();
    for (let yy = y0; yy < y1 - 6; yy += 11) ellP(x, yy + 5, 3.2, 6, 0, p);
    strokeP(ctx, p, 4.2, M.ink);
    strokeP(ctx, p, 1.8, M.mono ? NW : M.col(M.pal.metal));
  } else {
    strokeP(ctx, lineP(x, y0, x, y1), 4.4, M.ink);
    strokeP(ctx, lineP(x, y0, x, y1), 2, M.mono ? NW : M.col(M.pal.metal));
  }
}

const PLATFORMS = {
  girder(ctx, x, y, w, h, M, R) {
    const red = M.mono ? '#2a2a2a' : M.key === 'space' ? '#e0a02a' : '#c8402a';
    const gh = Math.max(h, 14) + 10;
    // hanging cables to the ceiling
    for (const cx of [x + w * 0.18, x + w * 0.82]) {
      cable(ctx, M, cx, 0, y - 4, false);
      const hk = P(); hk.moveTo(cx - 8, y + 1); hk.lineTo(cx, y - 10); hk.lineTo(cx + 8, y + 1);
      strokeP(ctx, hk, 5, M.ink); strokeP(ctx, hk, 2.2, M.mono ? NW : M.col(M.pal.metal));
    }
    const top = rectP(x, y, w, 6);
    const web = rectP(x + 2, y + 6, w - 4, gh - 12);
    const bot = rectP(x, y + gh - 6, w, 6);
    M.solid(ctx, web, shade(red, -0.12), { lx: 0, ly: -4 });
    clipped(ctx, web, () => {
      const holes = P();
      for (let hx = x + 14; hx < x + w - 10; hx += 26) ellP(hx + 6, y + gh / 2, 6, (gh - 16) / 2, 0, holes);
      fillP(ctx, holes, M.mono ? NW : INK);
      const tr = P(); for (let hx = x; hx < x + w; hx += 26) { tr.moveTo(hx, y + 6); tr.lineTo(hx + 13, y + gh - 6); tr.lineTo(hx + 26, y + 6); }
      strokeP(ctx, tr, 3, M.ink);
    });
    M.solid(ctx, top, red, { lx: 0, ly: -2, lw: 2.6 });
    M.solid(ctx, bot, red, { lx: 0, ly: -2, lw: 2.6 });
    rivetRow(ctx, x + 6, y + 3, x + w - 6, y + 3, 12, 1.7, M.mono ? NW : shade(red, 0.5), 1, M.ink);
    rivetRow(ctx, x + 6, y + gh - 3, x + w - 6, y + gh - 3, 12, 1.7, M.mono ? NW : shade(red, 0.5), 1, M.ink);
    strokeP(ctx, rectP(x, y, w, gh), M.lw, M.ink);
  },

  ledge(ctx, x, y, w, h, M, R) {
    const stone = M.key === 'zombie' ? '#8f8a9c' : M.key === 'noir' ? '#dddddd' : '#c0b4a0';
    const th = Math.max(h, 14);
    // corbels
    const nC = Math.max(2, Math.round(w / 90));
    for (let i = 0; i < nC; i++) {
      const cx = x + 14 + (i * (w - 28)) / (nC - 1);
      const c = P(); c.moveTo(cx - 10, y + th); c.lineTo(cx + 10, y + th); c.lineTo(cx + 10, y + th + 10); c.quadraticCurveTo(cx + 8, y + th + 34, cx - 4, y + th + 38); c.lineTo(cx - 10, y + th + 38); c.closePath();
      M.solid(ctx, c, shade(stone, -0.1), { lx: -3, ly: -4, lw: 2.4 });
    }
    const slab = rectP(x, y, w, th);
    M.solid(ctx, slab, stone, { lx: 0, ly: -5 });
    const mold = rectP(x + 4, y + th, w - 8, 6);
    M.solid(ctx, mold, shade(stone, -0.18), { lx: 0, ly: -2, lw: 2.2 });
    clipped(ctx, slab, () => {
      const cr = P();
      for (let sx = x + R.r(40, 80); sx < x + w - 10; sx += R.r(60, 110)) { cr.moveTo(sx, y); cr.lineTo(sx, y + th); }
      const k = x + R.r(0.2, 0.8) * w; cr.moveTo(k, y + 2); cr.lineTo(k + 8, y + th * 0.5); cr.lineTo(k + 4, y + th);
      strokeP(ctx, cr, 1.4, M.ink);
      speckle(ctx, R, x, y + 2, w, th - 2, w / 8, M.mono ? NB : shade(stone, -0.35), 1.2);
    });
    strokeP(ctx, slab, M.lw, M.ink);
    if (M.key === 'zombie') {
      const moss = P(); for (let i = 0; i < w / 40; i++) cloudPath(x + R() * w, y + 1, R.r(6, 12), 4, 6, (R() * 1e6) | 0, moss);
      fillP(ctx, moss, M.col('#6a9a4a')); strokeP(ctx, moss, 1.2, M.ink);
    }
  },

  catwalk(ctx, x, y, w, h, M, R) {
    const metal = M.key === 'space' ? '#b8c4d4' : M.pal.metal;
    const th = Math.max(h, 12);
    // hanger rods to the ceiling
    for (const cx of [x + 12, x + w - 12]) cable(ctx, M, cx, 0, y - 36, false);
    // railing (behind the walker)
    const rail = P();
    rail.rect(x, y - 38, w, 5);
    rail.rect(x, y - 20, w, 3);
    for (let px = x + 3; px <= x + w - 3; px += Math.max(30, (w - 6) / Math.round((w - 6) / 40))) rail.rect(px - 2.5, y - 38, 5, 38);
    M.solid(ctx, rail, M.key === 'space' ? M.pal.a3 : '#e0b030', { lx: 0, ly: -2, lw: 2.2 });
    // deck grating
    const deck = rectP(x, y, w, th);
    M.fill(ctx, deck, metal);
    clipped(ctx, deck, () => {
      const g = P();
      for (let gx = x - th; gx < x + w + th; gx += 7) { g.moveTo(gx, y); g.lineTo(gx + th, y + th); g.moveTo(gx + th, y); g.lineTo(gx, y + th); }
      strokeP(ctx, g, 1.3, M.mono ? NB : shade(metal, -0.45));
      fillP(ctx, rectP(x, y, w, 3), M.mono ? NW : shade(metal, 0.4));
    });
    strokeP(ctx, deck, M.lw, M.ink);
    // underside truss
    const tr = P();
    for (let tx = x; tx < x + w - 1; tx += 24) { tr.moveTo(tx, y + th); tr.lineTo(tx + 12, y + th + 14); tr.lineTo(Math.min(x + w, tx + 24), y + th); }
    tr.moveTo(x + 4, y + th + 14); tr.lineTo(x + w - 4, y + th + 14);
    strokeP(ctx, tr, 4.4, M.ink);
    strokeP(ctx, tr, 2, M.mono ? NW : M.col(M.pal.metalD));
    if (M.key === 'space') fillP(ctx, rectP(x + 6, y + th - 3, w - 12, 2.4), M.light(M.pal.a1));
  },

  plank(ctx, x, y, w, h, M, R) {
    const wood = M.key === 'noir' ? '#dddddd' : M.key === 'zombie' ? '#9a7450' : '#b8854f';
    const th = Math.max(h, 14);
    // rope hangers
    for (const cx of [x + 16, x + w - 16]) {
      const rp = P(); rp.moveTo(cx - 10, y + th); rp.lineTo(cx, 0); rp.moveTo(cx + 10, y + th); rp.lineTo(cx, 0);
      strokeP(ctx, rp, 4.2, M.ink);
      strokeP(ctx, rp, 2, M.mono ? NW : M.col('#d8c08a'));
    }
    const n = Math.max(1, Math.round(w / 70));
    let px = x;
    for (let i = 0; i < n; i++) {
      const pw = i === n - 1 ? x + w - px : (w / n) * R.r(0.85, 1.15);
      const pl = rectP(px, y + (i % 2 ? 1 : 0), pw, th - (i % 2 ? 1 : 0));
      M.solid(ctx, pl, i % 2 ? shade(wood, -0.08) : wood, { lx: 0, ly: -4 });
      clipped(ctx, pl, () => {
        const gr = P();
        for (let gy = y + 4; gy < y + th; gy += 4) { gr.moveTo(px, gy); gr.bezierCurveTo(px + pw * 0.3, gy - 2, px + pw * 0.6, gy + 2, px + pw, gy); }
        strokeP(ctx, gr, 1, M.mono ? NB : shade(wood, -0.4));
        const knot = ellP(px + pw * R.r(0.2, 0.8), y + th * 0.55, 4, 2.2); strokeP(ctx, knot, 1.2, M.ink);
      });
      strokeP(ctx, pl, M.lw, M.ink);
      const nails = P(); circP(px + 5, y + 4, 1.7, nails); circP(px + pw - 5, y + 4, 1.7, nails); circP(px + 5, y + th - 4, 1.7, nails); circP(px + pw - 5, y + th - 4, 1.7, nails);
      fillP(ctx, nails, M.ink);
      px += pw;
    }
    // cross batten underneath
    const bat = rectP(x + 10, y + th, w - 20, 7);
    M.solid(ctx, bat, shade(wood, -0.2), { lx: 0, ly: -2, lw: 2.2 });
  },

  scaffold(ctx, x, y, w, h, M, R) {
    const wood = M.key === 'noir' ? '#dddddd' : '#b88a50';
    const pole = M.key === 'noir' ? '#1a1a1a' : '#8a6a44';
    const th = Math.max(h, 14);
    // poles rising to the ceiling with cross braces
    const poles = [x + 8, x + w - 8];
    const br = P();
    for (let by = y - 10, k = 0; by > 40; by -= 170, k++) {
      const a = k % 2 ? poles[0] : poles[poles.length - 1], b2 = k % 2 ? poles[poles.length - 1] : poles[0];
      br.moveTo(a, by); br.lineTo(b2, Math.max(0, by - 150));
    }
    strokeP(ctx, br, 5, M.ink); strokeP(ctx, br, 2.4, M.col(pole));
    for (const px of poles) {
      const pr = rectP(px - 4, 0, 8, y + th + 30);
      M.solid(ctx, pr, pole, { lx: -2, ly: 0, lw: 2.4 });
      // rope lashings
      const ls = P(); for (let k = 0; k < 3; k++) ls.rect(px - 6, y + th + 2 + k * 5, 12, 2.5);
      fillP(ctx, ls, M.mono ? NW : M.col('#e0cc90')); strokeP(ctx, ls, 1, M.ink);
    }
    // ledger under the deck
    M.solid(ctx, rectP(x - 4, y + th, w + 8, 8), pole, { lx: 0, ly: -2, lw: 2.2 });
    // deck boards
    const deck = rectP(x - 6, y, w + 12, th);
    M.solid(ctx, deck, wood, { lx: 0, ly: -4 });
    clipped(ctx, deck, () => {
      const s = P(); for (let sx = x + R.r(20, 50); sx < x + w; sx += R.r(40, 70)) { s.moveTo(sx, y); s.lineTo(sx, y + th); }
      strokeP(ctx, s, 1.6, M.ink);
      const gr = P(); for (let gy = y + 5; gy < y + th; gy += 4) { gr.moveTo(x - 6, gy); gr.lineTo(x + w + 6, gy + 1); }
      strokeP(ctx, gr, 0.9, M.mono ? NB : shade(wood, -0.4));
    });
    strokeP(ctx, deck, M.lw, M.ink);
    // toe board / warning tape
    if (M.key === 'zombie') {
      const tape = P(); tape.moveTo(x, y - 30); tape.quadraticCurveTo(x + w / 2, y - 20, x + w, y - 32);
      strokeP(ctx, tape, 9, M.ink); strokeP(ctx, tape, 6, M.col('#e8c040'));
      ctx.save(); ctx.setLineDash([8, 8]); strokeP(ctx, tape, 6, M.ink); ctx.restore();
    }
  },

  hover(ctx, x, y, w, h, M, R) {
    const th = Math.max(h, 14);
    const glowC = M.pal.a1;
    // anti-grav glow beneath
    if (M.mono) {
      const b = polyP([[x + 10, y + th], [x + w - 10, y + th], [x + w - 40, y + th + 60], [x + 40, y + th + 60]]);
      clipped(ctx, b, () => halftoneGradient(ctx, x, y + th, w, 60, NB, { spacing: 5, dir: 'down', maxR: 3 }));
    } else {
      const b = polyP([[x + 14, y + th], [x + w - 14, y + th], [x + w - 34, y + th + 70], [x + 34, y + th + 70]]);
      ctx.save(); ctx.globalAlpha = 0.25; fillP(ctx, b, glowC); ctx.restore();
      clipped(ctx, b, () => halftoneGradient(ctx, x, y + th, w, 70, glowC, { spacing: 6, dir: 'up', maxR: 3.4, from: 0.2 }));
      const rings = P();
      for (let k = 1; k <= 3; k++) ellP(x + w / 2, y + th + k * 16, (w / 2 - 20) * (1 - k * 0.12), 3.5, 0, rings);
      strokeP(ctx, rings, 2, glowC);
    }
    const body = P();
    body.moveTo(x, y + 3);
    body.quadraticCurveTo(x, y, x + 6, y);
    body.lineTo(x + w - 6, y);
    body.quadraticCurveTo(x + w, y, x + w, y + 3);
    body.lineTo(x + w - 16, y + th + 6);
    body.lineTo(x + 16, y + th + 6);
    body.closePath();
    M.solid(ctx, body, M.key === 'space' ? '#dfe6ee' : M.pal.metal, { lx: 0, ly: -5 });
    fillP(ctx, rectP(x + 6, y + th - 2, w - 12, 3), M.light(glowC));
    strokeP(ctx, lineP(x + 8, y + th - 0.5, x + w - 8, y + th - 0.5), 1.2, M.ink);
    // thruster pods
    for (const tx of [x + 22, x + w - 22]) {
      const pod = rrectP(tx - 12, y + th + 2, 24, 12, 5);
      M.solid(ctx, pod, M.pal.metalD, { lx: 0, ly: -2, lw: 2.2 });
      fillP(ctx, ellP(tx, y + th + 14, 8, 3), M.light(M.mono ? NW : '#ffffff'));
    }
    const ls = P(); for (let lx = x + 40; lx < x + w - 40; lx += 18) ls.rect(lx, y + 5, 8, 3);
    fillP(ctx, ls, M.light(M.pal.a2));
  },

  fireescape(ctx, x, y, w, h, M, R) {
    const iron = M.mono ? '#111111' : '#2a2c34';
    const hi = M.mono ? NW : '#6a6e80';
    const th = Math.max(h, 12);
    // railing
    const rail = P();
    rail.rect(x, y - 40, w, 4);
    rail.rect(x, y - 22, w, 2.5);
    for (let px = x + 2; px <= x + w - 2; px += 9) rail.rect(px - 1.2, y - 40, 2.4, 40);
    fillP(ctx, rail, M.col(iron));
    strokeP(ctx, rectP(x, y - 40, w, 4), 1.2, hi);
    // slatted floor
    const deck = rectP(x, y, w, th);
    fillP(ctx, deck, M.col(iron));
    clipped(ctx, deck, () => {
      const sl = P(); for (let sx = x + 4; sx < x + w; sx += 8) sl.rect(sx, y + 3, 4, th - 6);
      fillP(ctx, sl, M.mono ? NW : '#4a4e5c');
    });
    strokeP(ctx, deck, M.lw, M.mono ? NB : INK);
    fillP(ctx, rectP(x, y, w, 2.4), hi);
    // brackets
    for (const bx of [x + 10, x + w - 10]) {
      const br = P(); br.moveTo(bx, y + th); br.lineTo(bx, y + th + 36); br.moveTo(bx, y + th + 34); br.lineTo(bx + (bx < x + w / 2 ? 30 : -30), y + th);
      strokeP(ctx, br, 6, M.mono ? NW : INK);
      strokeP(ctx, br, 3.2, M.col(iron));
    }
    // drop ladder hanging on one side
    const lx = R.chance(0.5) ? x + w * 0.2 : x + w * 0.8 - 26;
    const lad = P(); lad.rect(lx, y + th, 3, 70); lad.rect(lx + 22, y + th, 3, 70);
    for (let ry = y + th + 10; ry < y + th + 70; ry += 12) lad.rect(lx, ry, 25, 2.4);
    fillP(ctx, lad, M.col(iron));
    strokeP(ctx, lad, 1, hi);
  },

  balcony(ctx, x, y, w, h, M, R) {
    const stone = M.key === 'noir' ? '#1a1a1a' : M.key === 'space' ? '#b8c4d4' : M.key === 'zombie' ? '#9a94a8' : '#c8bca8';
    const th = Math.max(h, 14);
    // posts down to the floor (balconies sit at the top of 7x22 stairs)
    const drop = 154 - th;
    for (const px of [x + 12, x + w - 12]) {
      const col = rectP(px - 7, y + th, 14, drop);
      M.solid(ctx, col, shade(stone, -0.1), { lx: -3, ly: 0, lw: 2.4 });
    }
    // balustrade on top
    const bal = P();
    bal.rect(x, y - 34, w, 7);
    const n = Math.max(3, Math.round(w / 18));
    for (let i = 0; i < n; i++) {
      const bx = x + 8 + (i * (w - 16)) / (n - 1);
      bal.moveTo(bx - 3, y); bal.lineTo(bx - 4, y - 6); bal.quadraticCurveTo(bx - 7, y - 16, bx - 3, y - 27); bal.lineTo(bx + 3, y - 27); bal.quadraticCurveTo(bx + 7, y - 16, bx + 4, y - 6); bal.lineTo(bx + 3, y); bal.closePath();
    }
    M.solid(ctx, bal, stone, { lx: -2, ly: -2, lw: 2.2 });
    const slab = rectP(x - 4, y, w + 8, th);
    M.solid(ctx, slab, stone, { lx: 0, ly: -5 });
    const mold = rectP(x, y + th, w, 6);
    M.solid(ctx, mold, shade(stone, -0.2), { lx: 0, ly: -2, lw: 2.2 });
  },
};

function speckle(ctx, R, x, y, w, h, n, color, rmax = 2) {
  const p = P();
  for (let i = 0; i < n; i++) circP(x + R() * w, y + R() * h, 0.4 + R() * rmax, p);
  fillP(ctx, p, color);
}

export function platform(ctx, style, x, y, w, h, theme, R) {
  const M = material(theme, true);
  const fn = PLATFORMS[style] || PLATFORMS.ledge;
  fn(ctx, x, y, w, h, M, R);
}

// ------------------------------------------------------------------ STAIRS / LADDER

export function stairs(ctx, x, y, w, h, dir, n, theme) {
  const M = material(theme, true);
  const key = theme.key || 'hero';
  const sw = w / n, sh = h / n;
  const stepTop = (i) => y + h - (dir > 0 ? (i + 1) : (n - i)) * sh; // top y of step i (from left)
  const mat = key === 'zombie' ? '#9a7450' : key === 'space' ? '#b8c4d4' : key === 'noir' ? '#1a1a1a' : '#b8b0a4';
  // mass
  const mass = P();
  mass.moveTo(x, y + h);
  for (let i = 0; i < n; i++) { mass.lineTo(x + i * sw, stepTop(i)); mass.lineTo(x + (i + 1) * sw, stepTop(i)); }
  mass.lineTo(x + w, y + h);
  mass.closePath();
  M.solid(ctx, mass, shade(mat, -0.15), { lx: dir > 0 ? 6 : -6, ly: 0 });
  // treads & risers
  for (let i = 0; i < n; i++) {
    const tx = x + i * sw, ty = stepTop(i);
    const tread = rectP(tx - (dir > 0 ? 0 : 3), ty, sw + 3, 7);
    M.solid(ctx, tread, key === 'space' ? '#dfe6ee' : shade(mat, 0.12), { lx: 0, ly: -2, lw: 2.2 });
    if (key === 'space') fillP(ctx, rectP(tx + 2, ty + 5, sw - 1, 2), M.light(M.pal.a1));
    if (key === 'noir') fillP(ctx, rectP(tx, ty, sw, 2), NW);
    if (key === 'zombie') { const nl = P(); circP(tx + 4, ty + 3.5, 1.4, nl); circP(tx + sw - 3, ty + 3.5, 1.4, nl); fillP(ctx, nl, INK); }
  }
  // side panel texture
  clipped(ctx, mass, () => {
    if (key === 'zombie') {
      const g = P(); for (let gy = y + 8; gy < y + h; gy += 9) { g.moveTo(x, gy); g.lineTo(x + w, gy + 2); }
      strokeP(ctx, g, 1, M.col(shade(mat, -0.5)));
    } else if (key === 'hero') {
      bricksFull(ctx, x, y, w, h, { bw: 24, bh: 11, color: rgba(INK, 0.35), lw: 1 });
    } else if (key === 'space') {
      rivetRow(ctx, x + 6, y + h - 8, x + w - 6, y + h - 8, 14, 1.8, '#e8eef4', 1);
      hazardStripes(ctx, rectP(x, y + h - 16, w, 16), x, y + h - 16, w, 16, M.pal.a3, INK, 7);
    } else {
      hatchIn(ctx, rectP(x, y, w, h), NW, 5, 0.9);
    }
  });
  strokeP(ctx, mass, M.lw, M.ink);
  // handrail following the slope
  const rail = P();
  const top0 = dir > 0 ? [x + sw * 0.5, stepTop(0) - 40] : [x + w - sw * 0.5, stepTop(n - 1) - 40];
  const top1 = dir > 0 ? [x + w - sw * 0.5, stepTop(n - 1) - 40] : [x + sw * 0.5, stepTop(0) - 40];
  rail.moveTo(top0[0], top0[1]); rail.lineTo(top1[0], top1[1]);
  const posts = P();
  for (let i = 0; i < n; i += 2) {
    const px = x + i * sw + sw * 0.5;
    posts.moveTo(px, stepTop(i)); posts.lineTo(px, stepTop(i) - 40 + (dir > 0 ? 0 : 0));
  }
  const pc = key === 'noir' ? NB : key === 'space' ? M.pal.a3 : key === 'zombie' ? '#6a4a30' : '#5a6878';
  strokeP(ctx, posts, 6, M.mono ? NW : INK);
  strokeP(ctx, posts, 3, M.mono ? NB : pc);
  strokeP(ctx, rail, 8, M.mono ? NW : INK);
  strokeP(ctx, rail, 4.4, M.mono ? NB : pc);
}

export function ladder(ctx, x, y, w, h, theme) {
  const M = material(theme, true);
  const key = theme.key || 'hero';
  const c = key === 'zombie' ? '#a07a50' : key === 'space' ? '#e0b030' : key === 'noir' ? '#1a1a1a' : '#c8402a';
  const rw = 7;
  const rungs = P();
  for (let ry = y + 14; ry < y + h - 4; ry += 22) rungs.rect(x + rw - 1, ry, w - rw * 2 + 2, 5);
  M.solid(ctx, rungs, key === 'noir' ? '#1a1a1a' : shade(c, -0.1), { lx: 0, ly: -2, lw: 2.2 });
  const rails = P();
  rails.rect(x, y, rw, h);
  rails.rect(x + w - rw, y, rw, h);
  M.solid(ctx, rails, c, { lx: -3, ly: 0, lw: 2.6 });
  if (key === 'noir') { fillP(ctx, rectP(x + 1.5, y, 1.8, h), NW); fillP(ctx, rectP(x + w - rw + 1.5, y, 1.8, h), NW); }
  if (key !== 'zombie') rivetRow(ctx, x + rw / 2, y + 16.5, x + rw / 2, y + h - 8, 22, 1.4, M.mono ? NW : shade(c, 0.5), 0.8, M.ink);
  else { const nl = P(); for (let ry = y + 16.5; ry < y + h - 4; ry += 22) { circP(x + rw / 2, ry, 1.3, nl); circP(x + w - rw / 2, ry, 1.3, nl); } fillP(ctx, nl, INK); }
}
