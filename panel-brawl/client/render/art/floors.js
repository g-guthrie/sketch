// Thin ground detail right at/above the floor line (y in [h-40, h]).

import {
  INK, NW, NB, NR, TAU, shade, rgba, cloudPath,
  P, rectP, circP, ellP, polyP, lineP, fillP, strokeP, inked, dotsIn, clipped, halftone,
} from './kit.js';

function pebbles(R, x0, x1, y0, y1, n, rmin = 1, rmax = 3, p = P()) {
  for (let i = 0; i < n; i++) ellP(x0 + R() * (x1 - x0), y0 + R() * (y1 - y0), rmin + R() * (rmax - rmin), (rmin + R() * (rmax - rmin)) * 0.6, 0, p);
  return p;
}

function cracks(R, w, h, n, p = P()) {
  for (let i = 0; i < n; i++) {
    let x = R() * w, y = h - R() * 28;
    p.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 40; y += (R() - 0.3) * 8; y = Math.min(h - 1, Math.max(h - 38, y)); p.lineTo(x, y); }
  }
  return p;
}

function tufts(R, w, y, n, hmax = 14, p = P()) {
  for (let i = 0; i < n; i++) {
    const x = R() * w;
    const k = 3 + Math.floor(R() * 4);
    for (let j = 0; j < k; j++) { p.moveTo(x + j * 3, y); p.quadraticCurveTo(x + j * 3 + (R() - 0.5) * 6, y - hmax * 0.6, x + j * 3 + (R() - 0.5) * 10, y - hmax * (0.4 + R() * 0.6)); }
  }
  return p;
}

function puddle(ctx, R, cx, y, rx, fill, hi) {
  const p = ellP(cx, y, rx, rx * 0.12);
  fillP(ctx, p, fill);
  const s = P();
  for (let i = 0; i < 3; i++) s.rect(cx - rx * 0.6 + R() * rx * 0.9, y - 2 + i * 2.5, rx * (0.2 + R() * 0.4), 1.4);
  fillP(ctx, s, hi);
  return p;
}

const FLOORS = {
  hero: {
    rooftop(ctx, w, h, R) {
      const p = P();
      for (let x = R.r(0, 120); x < w; x += R.r(120, 220)) { p.moveTo(x, h - 38); p.lineTo(x - 12, h); }
      strokeP(ctx, p, 1.4, '#3a3450');
      fillP(ctx, pebbles(R, 0, w, h - 34, h - 2, w / 16, 0.8, 2), '#5e5874');
      const tar = P(); for (let i = 0; i < w / 300; i++) ellP(R() * w, h - R.r(6, 26), R.r(20, 50), R.r(3, 6), 0, tar);
      fillP(ctx, tar, '#3f3a52');
    },
    street(ctx, w, h, R) {
      const p = P();
      for (let x = R.r(0, 90); x < w; x += 90) { p.moveTo(x, h - 44); p.lineTo(x - 16, h); }
      strokeP(ctx, p, 1.4, '#8f887a');
      const gum = P(); for (let i = 0; i < w / 160; i++) circP(R() * w, h - R() * 36, 1.5 + R() * 1.5, gum);
      fillP(ctx, gum, '#a39c8c');
      // curb edge
      fillP(ctx, rectP(0, h - 7, w, 7), '#aaa292');
      strokeP(ctx, lineP(0, h - 7, w, h - 7), 1.6);
      // litter: a crumpled newspaper or two
      for (let i = 0; i < Math.ceil(w / 700); i++) {
        const x = R() * w;
        inked(ctx, polyP([[x, h - 10], [x + 18, h - 16], [x + 30, h - 9], [x + 12, h - 5]]), '#ece6d2', 1.2);
      }
    },
    lab(ctx, w, h, R) {
      const p = P();
      for (let i = 0; i < w / 160; i++) ellP(R() * w, h - R.r(6, 30), R.r(14, 34), R.r(2, 4), 0, p);
      fillP(ctx, p, rgba('#8fe08a', 0.45));
      fillP(ctx, pebbles(R, 0, w, h - 36, h - 2, w / 40, 1, 2), '#3d5052');
    },
    lair(ctx, w, h, R) {
      const p = P();
      for (let x = 30; x < w; x += 120) p.rect(x, h - 22, 40, 3);
      fillP(ctx, p, '#57c8d4');
      strokeP(ctx, p, 1, INK);
    },
  },
  zombie: {
    graveyard(ctx, w, h, R) {
      const t = tufts(R, w, h - 34, w / 45, 14);
      strokeP(ctx, t, 1.8, '#26302a');
      const clods = pebbles(R, 0, w, h - 30, h - 3, w / 26, 1.2, 3);
      fillP(ctx, clods, '#2e2638');
      const bones = P();
      for (let i = 0; i < Math.ceil(w / 600); i++) {
        const x = R() * w, y = h - R.r(8, 24);
        bones.rect(x, y - 1.5, 20, 3); circP(x, y - 2, 3, bones); circP(x, y + 2, 3, bones); circP(x + 20, y - 2, 3, bones); circP(x + 20, y + 2, 3, bones);
      }
      inked(ctx, bones, '#cfc8b4', 1.2);
      const t2 = tufts(R, w, h - 1, w / 60, 10);
      strokeP(ctx, t2, 1.8, '#3e4a36');
    },
    street(ctx, w, h, R) {
      strokeP(ctx, cracks(R, w, h, Math.ceil(w / 120)), 1.4, '#2a1a1c');
      fillP(ctx, pebbles(R, 0, w, h - 30, h - 2, w / 24, 1, 3), '#553e40');
      for (let i = 0; i < Math.ceil(w / 900); i++) puddle(ctx, R, R() * w, h - R.r(8, 22), R.r(30, 50), '#5a1a1a', '#8a3a32');
      const glass = P(); for (let i = 0; i < w / 110; i++) { const x = R() * w, y = h - R() * 30; polyP([[x, y], [x + 4, y - 3], [x + 6, y + 1]], true, glass); }
      fillP(ctx, glass, '#a89890');
    },
    hospital(ctx, w, h, R) {
      for (let i = 0; i < Math.ceil(w / 450); i++) {
        const x = R() * w, y = h - R.r(10, 26);
        const b = cloudPath(x, y, R.r(24, 44), R.r(4, 7), 9, (R() * 1e6) | 0);
        fillP(ctx, b, '#8e1c1c');
        const d = P(); for (let k = 0; k < 4; k++) circP(x + R.r(-60, 60), y + R.r(-8, 6), R.r(1.5, 3), d);
        fillP(ctx, d, '#8e1c1c');
      }
      const papers = P(); for (let i = 0; i < w / 250; i++) { const x = R() * w, y = h - R.r(6, 30); polyP([[x, y], [x + 22, y - 3], [x + 24, y + 4], [x + 2, y + 6]], true, papers); }
      inked(ctx, papers, '#eeeadc', 1.1);
      const g = P(); for (let x = 0; x < w; x += 36) { g.moveTo(x, h - 38); g.lineTo(x, h); }
      strokeP(ctx, g, 1, '#6f7462');
    },
    mall(ctx, w, h, R) {
      const glass = P(); for (let i = 0; i < w / 90; i++) { const x = R() * w, y = h - R() * 34; polyP([[x, y], [x + 5, y - 3], [x + 8, y + 1], [x + 3, y + 3]], true, glass); }
      fillP(ctx, glass, '#8a92b8');
      const trash = P(); for (let i = 0; i < w / 300; i++) { const x = R() * w; trash.rect(x, h - 12, 14, 10); ellP(x + 30, h - 6, 8, 5, 0.3, trash); }
      inked(ctx, trash, '#8a84a8', 1.2);
      
    },
  },
  space: {
    bridge(ctx, w, h, R) {
      const p = P(); for (let x = 60; x < w; x += 120) { p.moveTo(x, h - 32); p.lineTo(x, h); }
      strokeP(ctx, p, 1.4, '#39445a');
      const l = P(); for (let x = 20; x < w; x += 60) l.rect(x, h - 18, 16, 3);
      fillP(ctx, l, '#7fe6f0');
    },
    hangar(ctx, w, h, R) {
      const oil = P(); for (let i = 0; i < w / 400; i++) oil.addPath(cloudPath(R() * w, h - R.r(10, 26), R.r(30, 60), R.r(4, 7), 9, (R() * 1e6) | 0));
      fillP(ctx, oil, '#3e4552');
      const bolts = P(); for (let x = 30; x < w; x += 60) circP(x, h - 30, 2, bolts);
      fillP(ctx, bolts, '#8a94a4');
    },
    planet(ctx, w, h, R) {
      const cr = P();
      for (let i = 0; i < Math.ceil(w / 260); i++) { const x = R() * w, y = h - R.r(12, 28), r = R.r(14, 30); ellP(x, y, r, r * 0.22, 0, cr); }
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill(cr); ctx.restore();
      strokeP(ctx, cr, 1.4, INK);
      fillP(ctx, pebbles(R, 0, w, h - 34, h - 2, w / 24, 1, 3), 'rgba(40,20,40,0.35)');
      const cry = P(); for (let i = 0; i < w / 400; i++) { const x = R() * w, y = h - R.r(2, 20); polyP([[x - 3, y], [x, y - 10], [x + 3, y]], true, cry); }
      inked(ctx, cry, '#8ff4ff', 1);
    },
    reactor(ctx, w, h, R) {
      const p = P(); for (let x = 0; x < w; x += 70) p.rect(x, h - 40, 2, 40);
      fillP(ctx, p, '#1c2530');
      const drip = P(); for (let i = 0; i < w / 300; i++) ellP(R() * w, h - R.r(8, 26), R.r(16, 30), 3, 0, drip);
      fillP(ctx, drip, 'rgba(127,232,244,0.4)');
    },
  },
  noir: {
    alley(ctx, w, h, R) {
      for (let i = 0; i < Math.ceil(w / 380); i++) {
        const cx = R() * w, y = h - R.r(10, 26), rx = R.r(40, 80);
        const p = ellP(cx, y, rx, rx * 0.12);
        fillP(ctx, p, NW);
        const s = P(); for (let k = 0; k < 4; k++) s.rect(cx - rx * 0.7 + R() * rx * 1.2, y - 2 + k * 1.6, R.r(8, 26), 1.2);
        fillP(ctx, s, NB);
        const rip = P(); ellP(cx + R.r(-20, 20), y, 8, 1.6, 0, rip); ellP(cx + R.r(-20, 20), y, 14, 2.6, 0, rip);
        strokeP(ctx, rip, 1, NB);
      }
      const sp = P(); for (let i = 0; i < w / 40; i++) { const x = R() * w, y = h - R() * 36; sp.moveTo(x - 3, y); sp.lineTo(x, y - 4); sp.lineTo(x + 3, y); }
      strokeP(ctx, sp, 1, NW);
    },
    office(ctx, w, h, R) {
      // rug edge with fringe
      const rx0 = R.r(0.2, 0.4) * w, rx1 = rx0 + R.r(0.3, 0.45) * w;
      const rug = rectP(rx0, h - 30, rx1 - rx0, 30);
      fillP(ctx, rug, NB);
      clipped(ctx, rug, () => { const d = P(); for (let x = rx0; x < rx1; x += 16) polyP([[x, h - 22], [x + 8, h - 30], [x + 16, h - 22], [x + 8, h - 14]], true, d); fillP(ctx, d, NR); });
      const fr = P(); for (let x = rx0; x < rx1; x += 5) { fr.moveTo(x, h - 30); fr.lineTo(x, h - 36); }
      strokeP(ctx, fr, 1.2, NW);
      strokeP(ctx, rug, 1.4, NW);
    },
    club(ctx, w, h, R) {
      const conf = P(); for (let i = 0; i < w / 90; i++) { const x = R() * w, y = h - R() * 30; ellP(x, y, 3, 1.4, R() * 3, conf); }
      fillP(ctx, conf, NR);
    },
    docks(ctx, w, h, R) {
      const nails = P(); for (let x = R.r(20, 60); x < w; x += R.r(80, 160)) for (let y = h - 36; y < h; y += 9) circP(x + 4, y + 4, 1.3, nails);
      fillP(ctx, nails, NB);
      // coiled rope + a fish
      const x = R() * w;
      const f = P(); f.moveTo(x, h - 8); f.quadraticCurveTo(x + 14, h - 16, x + 28, h - 8); f.quadraticCurveTo(x + 14, h, x, h - 8); polyP([[x + 28, h - 8], [x + 36, h - 14], [x + 36, h - 2]], true, f);
      inked(ctx, f, NW, 1.4, NB);
      dotsIn(ctx, f, NB, 3.5, 0.8);
    },
  },
};

export function floorDetail(ctx, key, scene, w, h, R) {
  const set = FLOORS[key] || FLOORS.hero;
  const fn = set[scene];
  if (!fn) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-5, h - 40, w + 10, 40);
  ctx.clip();
  fn(ctx, w, h, R);
  ctx.restore();
}
