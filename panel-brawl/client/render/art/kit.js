// Shared "brushes" for the environment art: seeded rng, path builders,
// halftone/hatch fills, skies, skylines, moons, beams, bricks, rain, fog,
// flames, pipes, glows and other comic-print building blocks.
// Everything draws in the caller's current transform; nothing leaks state.

import {
  INK, PAPER, FONT, rand, shade, mix, rgba, desat, hexToRgb,
  halftone, hatchPattern, halftoneGradient, cloudPath, starburstPath,
} from '../ink.js';

export { INK, PAPER, FONT, shade, mix, rgba, desat, halftone, hatchPattern, halftoneGradient, cloudPath, starburstPath };

export const TAU = Math.PI * 2;
export const NW = '#f2efe6'; // noir paper-white
export const NB = '#0b0b0b'; // noir black
export const NR = '#d7141a'; // noir spot red

// ------------------------------------------------------------------ rng

export function mkR(seed) {
  const r = rand((seed >>> 0) || 1);
  const f = () => r();
  f.r = (a, b) => a + (b - a) * r();
  f.i = (a, b) => a + Math.floor(r() * (b - a + 1));
  f.pick = (arr) => arr[Math.floor(r() * arr.length)];
  f.chance = (p) => r() < p;
  f.sign = () => (r() < 0.5 ? -1 : 1);
  return f;
}

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------------------------------------------------------------- paths

export function P() { return new Path2D(); }
export function rectP(x, y, w, h, p = new Path2D()) { p.rect(x, y, w, h); return p; }
export function circP(cx, cy, r, p = new Path2D()) { p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, TAU); return p; }
export function ellP(cx, cy, rx, ry, rot = 0, p = new Path2D()) { p.moveTo(cx + Math.cos(rot) * rx, cy + Math.sin(rot) * rx); p.ellipse(cx, cy, rx, ry, rot, 0, TAU); return p; }
export function polyP(pts, close = true, p = new Path2D()) {
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  if (close) p.closePath();
  return p;
}
export function rrectP(x, y, w, h, r, p = new Path2D()) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.arcTo(x + w, y, x + w, y + r, r);
  p.lineTo(x + w, y + h - r);
  p.arcTo(x + w, y + h, x + w - r, y + h, r);
  p.lineTo(x + r, y + h);
  p.arcTo(x, y + h, x, y + h - r, r);
  p.lineTo(x, y + r);
  p.arcTo(x, y, x + r, y, r);
  p.closePath();
  return p;
}
export function lineP(x1, y1, x2, y2, p = new Path2D()) { p.moveTo(x1, y1); p.lineTo(x2, y2); return p; }

// ------------------------------------------------------------ painting

export function fillP(ctx, path, style) { ctx.fillStyle = style; ctx.fill(path); }
export function strokeP(ctx, path, lw, color = INK) {
  ctx.lineWidth = lw;
  ctx.strokeStyle = color;
  ctx.stroke(path);
}
export function inked(ctx, path, fill, lw, ink = INK) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(path); }
  if (lw > 0) strokeP(ctx, path, lw, ink);
}
export function dotsIn(ctx, path, color, spacing = 5, radius = 1.2) {
  ctx.fillStyle = halftone(ctx, color, spacing, Math.round(radius * 10) / 10);
  ctx.fill(path);
}
export function hatchIn(ctx, path, color, spacing = 6, width = 1.2, cross = false) {
  ctx.fillStyle = hatchPattern(ctx, color, spacing, width, cross);
  ctx.fill(path);
}
export function clipped(ctx, path, fn) {
  ctx.save();
  ctx.clip(path);
  fn();
  ctx.restore();
}
// Halftone gradient restricted to a path.
export function gradIn(ctx, path, x, y, w, h, color, o) {
  ctx.save();
  if (path) ctx.clip(path);
  halftoneGradient(ctx, x, y, w, h, color, o);
  ctx.restore();
}
// Region of `path` NOT covered by `path` shifted by (dx,dy). With (dx,dy)
// pointing toward the light you get the shadow crescent; the opposite
// direction gives a rim highlight.
export function crescent(ctx, path, dx, dy, style) {
  ctx.save();
  ctx.clip(path);
  const p = new Path2D();
  p.rect(-1e5, -1e5, 2e5, 2e5);
  p.addPath(path, new DOMMatrix().translate(dx, dy));
  ctx.fillStyle = style;
  ctx.fill(p, 'evenodd');
  ctx.restore();
}

// Hand-inked parallel hatching lines inside a path (any angle).
export function hatchLines(ctx, path, bx, by, bw, bh, o = {}) {
  const sp = o.spacing || 6, ang = o.angle != null ? o.angle : -Math.PI / 4;
  const R = o.R || mkR(o.seed || 7);
  ctx.save();
  if (path) ctx.clip(path);
  ctx.strokeStyle = o.color || INK;
  ctx.lineWidth = o.lw || 1.1;
  ctx.lineCap = 'round';
  const cx = bx + bw / 2, cy = by + bh / 2;
  const rad = Math.hypot(bw, bh) / 2 + 4;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const nx = -sa, ny = ca;
  const p = new Path2D();
  const jit = o.jitter != null ? o.jitter : 0.25;
  for (let d = -rad; d <= rad; d += sp) {
    const l0 = -rad * (1 - R() * jit), l1 = rad * (1 - R() * jit);
    const ox = cx + nx * d, oy = cy + ny * d;
    p.moveTo(ox + ca * l0, oy + sa * l0);
    p.lineTo(ox + ca * l1, oy + sa * l1);
  }
  ctx.stroke(p);
  ctx.restore();
}

// Flat fill + comic form shading (shadow crescent w/ halftone) + optional rim light.
export function solid(ctx, path, color, o = {}) {
  const lx = o.lx != null ? o.lx : -5, ly = o.ly != null ? o.ly : -5;
  ctx.fillStyle = color;
  ctx.fill(path);
  if (o.shadow !== false) {
    crescent(ctx, path, lx, ly, o.shadowColor || shade(color, -0.22));
    ctx.save();
    ctx.clip(path);
    const p = new Path2D();
    p.rect(-1e5, -1e5, 2e5, 2e5);
    p.addPath(path, new DOMMatrix().translate(lx * 1.9, ly * 1.9));
    ctx.fillStyle = halftone(ctx, o.dots || shade(color, -0.42), o.spacing || 4, o.radius || 0.95);
    ctx.fill(p, 'evenodd');
    ctx.restore();
  }
  if (o.rim) crescent(ctx, path, -lx * 0.5, -ly * 0.5, o.rim);
  if (o.lw !== 0) strokeP(ctx, path, o.lw || 3, o.ink || INK);
}

// ----------------------------------------------------------------- mono

export function lum(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (r * 0.3 + g * 0.59 + b * 0.11) / 255;
}
export function isSpotRed(hex) {
  const [r, g, b] = hexToRgb(hex);
  return r > 140 && g < 90 && b < 90 && r - g > 90;
}
// Noir tone fill: black / paper / red only; mid tones via halftone or hatching.
export function monoFill(ctx, path, hex, o = {}) {
  if (isSpotRed(hex)) { fillP(ctx, path, NR); return 'red'; }
  const L = o.lum != null ? o.lum : lum(hex);
  if (L < 0.2) { fillP(ctx, path, NB); return 'black'; }
  fillP(ctx, path, NW);
  if (L < 0.34) hatchIn(ctx, path, NB, 3.6, 1.25, true);
  else if (L < 0.48) dotsIn(ctx, path, NB, 4.5, 1.55);
  else if (L < 0.64) dotsIn(ctx, path, NB, 4.5, 1.1);
  else if (L < 0.8) dotsIn(ctx, path, NB, 4.5, 0.7);
  return L < 0.34 ? 'dark' : L < 0.64 ? 'mid' : 'light';
}

// --------------------------------------------------------------- skies

// Paint a band of `color` as halftone that is solid at yA and fades out at yB.
export function dotFade(ctx, x, w, yA, yB, color, spacing = 10, o = {}) {
  const top = Math.min(yA, yB), bot = Math.max(yA, yB);
  halftoneGradient(ctx, x, top, w, bot - top, color, {
    spacing, dir: yA < yB ? 'up' : 'down', maxR: spacing * 0.64, from: o.from || 0, to: o.to || 1,
  });
}

// Stacked flat bands joined by dot transitions (the classic printed sky).
// stops: [{c: color, y: startY}] top -> bottom; transition of `blend` px.
export function bandSky(ctx, x, w, stops, blend = 120, spacing = 10) {
  for (let i = stops.length - 1; i >= 0; i--) {
    const s = stops[i];
    const next = stops[i + 1];
    const y0 = i === 0 ? s.y - 10 : s.y;
    const y1 = next ? next.y : s.y2;
    fillP(ctx, rectP(x, y0, w, (y1 != null ? y1 : y0 + 5000) - y0), s.c);
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const s = stops[i], n = stops[i + 1];
    const b = s.blend != null ? s.blend : blend;
    dotFade(ctx, x - 6, w + 12, n.y - 2, n.y + b, s.c, s.sp || spacing);
  }
}

export function stars(ctx, R, x, y, w, h, n, color, o = {}) {
  ctx.fillStyle = color;
  const p = new Path2D();
  for (let i = 0; i < n; i++) {
    const sx = x + R() * w, sy = y + Math.pow(R(), o.pow || 1) * h;
    const r = (o.r || 1.2) * (0.5 + R());
    p.moveTo(sx + r, sy);
    p.arc(sx, sy, r, 0, TAU);
  }
  ctx.fill(p);
  const big = o.twinkles != null ? o.twinkles : Math.round(n / 14);
  for (let i = 0; i < big; i++) {
    const sx = x + R() * w, sy = y + R() * h * 0.8, s = (o.big || 6) * (0.6 + R() * 0.8);
    const q = new Path2D();
    q.moveTo(sx, sy - s); q.quadraticCurveTo(sx, sy, sx + s * 0.7, sy);
    q.quadraticCurveTo(sx, sy, sx, sy + s); q.quadraticCurveTo(sx, sy, sx - s * 0.7, sy);
    q.quadraticCurveTo(sx, sy, sx, sy - s);
    ctx.fill(q);
  }
}

// Big comic moon: halo rings, flat disc, halftone terminator, craters, ink rim.
export function moon(ctx, R, cx, cy, r, o = {}) {
  const c = o.color || '#f6e9b2';
  if (o.halo) {
    o.halo.forEach((hc, i) => fillP(ctx, circP(cx, cy, r * (1 + (o.halo.length - i) * (o.haloStep || 0.22))), hc));
  }
  const disc = circP(cx, cy, r);
  fillP(ctx, disc, c);
  clipped(ctx, disc, () => {
    const sh = new Path2D();
    sh.rect(cx - r * 2, cy - r * 2, r * 4, r * 4);
    const off = o.phase != null ? o.phase : 0.42;
    circP(cx - r * off, cy - r * off * 0.6, r * 1.02, sh);
    ctx.fillStyle = o.shade || shade(c, -0.14);
    ctx.fill(sh, 'evenodd');
    halftoneGradient(ctx, cx - r, cy - r, r * 2, r * 2, o.dots || shade(c, -0.3), {
      spacing: Math.max(4, r / 13), dir: 'radial', cx: cx - r * 0.35, cy: cy - r * 0.3, from: 0.28, to: 1.05, maxR: Math.max(4, r / 13) * 0.5,
    });
    // craters
    const cr = new Path2D();
    const n = o.craters != null ? o.craters : 7;
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * r * 0.78;
      const rr = r * (0.06 + R() * 0.14);
      ellP(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, rr * 0.8, R() * 0.5, cr);
    }
    ctx.fillStyle = o.crater || shade(c, -0.1);
    ctx.fill(cr);
    strokeP(ctx, cr, Math.max(1, r / 70), rgba(o.ink || INK, 0.55));
  });
  strokeP(ctx, disc, o.lw || 2.2, o.ink || INK);
}

// Soft "printed" glow: dots growing toward the center + flat core discs.
export function glow(ctx, cx, cy, r, color, o = {}) {
  const sp = o.spacing || Math.max(5, r / 11);
  ctx.save();
  ctx.clip(circP(cx, cy, r));
  halftoneGradient(ctx, cx - r, cy - r, r * 2, r * 2, color, { spacing: sp, dir: 'center', cx, cy, maxR: sp * 0.62, from: o.from != null ? o.from : 0.1, to: o.to || 0.95 });
  ctx.restore();
  if (o.core) {
    fillP(ctx, circP(cx, cy, r * (o.coreR || 0.3)), o.core);
    if (o.core2) fillP(ctx, circP(cx, cy, r * (o.coreR || 0.3) * 0.55), o.core2);
  }
}

// Glow shaped to any rect/path via radial dot gradient.
export function glowRect(ctx, x, y, w, h, color, o = {}) {
  const sp = o.spacing || 7;
  ctx.save();
  ctx.clip(rectP(x, y, w, h));
  halftoneGradient(ctx, x, y, w, h, color, { spacing: sp, dir: o.dir || 'center', cx: o.cx, cy: o.cy, maxR: sp * 0.62, from: o.from != null ? o.from : 0.2, to: o.to || 1 });
  ctx.restore();
}

// Searchlight / spotlight wedge.
export function beam(ctx, x0, y0, ang, len, spread, color, o = {}) {
  const w0 = o.w0 || 6;
  const a1 = ang - spread, a2 = ang + spread;
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  const pts = [
    [x0 + nx * w0, y0 + ny * w0],
    [x0 + Math.cos(a2) * len, y0 + Math.sin(a2) * len],
    [x0 + Math.cos(a1) * len, y0 + Math.sin(a1) * len],
    [x0 - nx * w0, y0 - ny * w0],
  ];
  const p = polyP(pts);
  ctx.save();
  ctx.globalAlpha = o.alpha != null ? o.alpha : 0.22;
  fillP(ctx, p, color);
  if (o.core) {
    const q = polyP([
      [x0 + nx * w0 * 0.5, y0 + ny * w0 * 0.5],
      [x0 + Math.cos(ang + spread * 0.45) * len, y0 + Math.sin(ang + spread * 0.45) * len],
      [x0 + Math.cos(ang - spread * 0.45) * len, y0 + Math.sin(ang - spread * 0.45) * len],
      [x0 - nx * w0 * 0.5, y0 - ny * w0 * 0.5],
    ]);
    fillP(ctx, q, color);
  }
  ctx.restore();
  if (o.dots) {
    ctx.save();
    ctx.globalAlpha = o.dotAlpha || 0.5;
    dotsIn(ctx, p, o.dots, o.dotSp || 6, o.dotR || 1.1);
    ctx.restore();
  }
  if (o.edge) {
    ctx.save();
    ctx.globalAlpha = o.edgeAlpha || 0.6;
    const e = new Path2D();
    e.moveTo(pts[0][0], pts[0][1]); e.lineTo(pts[1][0], pts[1][1]);
    e.moveTo(pts[3][0], pts[3][1]); e.lineTo(pts[2][0], pts[2][1]);
    strokeP(ctx, e, o.edgeW || 1.4, o.edge);
    ctx.restore();
  }
  return p;
}

export function cloudBank(ctx, R, cx, cy, rx, ry, o = {}) {
  const p = new Path2D();
  const n = o.puffs || 3;
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0.5;
    const px = cx + (t - 0.5) * rx * 1.4 * (n > 1 ? 1 : 0) + (R() - 0.5) * rx * 0.25;
    const py = cy + (R() - 0.5) * ry * 0.3 - Math.sin(t * Math.PI) * ry * 0.3;
    cloudPath(px, py, rx * (0.42 + R() * 0.2), ry * (0.62 + R() * 0.25), o.bumps || 8, (R() * 1e6) | 0, p);
  }
  // union outline: fat stroke underneath, fill on top hides the interior seams
  if (o.lw) strokeP(ctx, p, o.lw * 2, o.ink || INK);
  fillP(ctx, p, o.fill || '#ffffff');
  if (o.shadow) {
    crescent(ctx, p, 0, -ry * (o.shadowDepth || 0.38), o.shadow);
    if (o.dots) {
      ctx.save();
      ctx.clip(p);
      const q = new Path2D();
      q.rect(-1e5, -1e5, 2e5, 2e5);
      q.addPath(p, new DOMMatrix().translate(0, -ry * (o.shadowDepth || 0.38) * 2.1));
      ctx.fillStyle = halftone(ctx, o.shadow, o.dotSp || 6, o.dotR || 1.4);
      ctx.fill(q, 'evenodd');
      ctx.restore();
    }
  }
  if (o.hi) crescent(ctx, p, 0, ry * 0.18, o.hi);
  return p;
}

// ------------------------------------------------------------ buildings

// A row of building silhouettes. Returns array of building boxes.
export function skyline(ctx, R, o) {
  const out = [];
  let x = o.x0 - R.r(0, o.wMax * 0.6);
  while (x < o.x1) {
    const bw = R.r(o.wMin, o.wMax);
    let bh = R.r(o.hMin, o.hMax);
    if (o.peak && R.chance(o.peakP || 0.15)) bh *= o.peak;
    const top = o.base - bh;
    const kind = R.pick(o.kinds || ['flat', 'flat', 'step', 'step', 'spire', 'gable', 'tank', 'antenna']);
    const p = new Path2D();
    const pts = [[x, o.base + 4], [x, top]];
    const deco = [];
    if (kind === 'step' || kind === 'spire') {
      const s1 = bw * R.r(0.12, 0.2), h1 = bh * R.r(0.08, 0.14);
      pts.push([x + s1, top], [x + s1, top - h1]);
      const s2 = bw * R.r(0.3, 0.38), h2 = h1 * R.r(0.7, 1.1);
      pts.push([x + s2, top - h1], [x + s2, top - h1 - h2]);
      if (kind === 'spire') {
        const sh = bh * R.r(0.18, 0.3);
        pts.push([x + bw / 2 - bw * 0.06, top - h1 - h2], [x + bw / 2, top - h1 - h2 - sh], [x + bw / 2 + bw * 0.06, top - h1 - h2]);
      }
      pts.push([x + bw - s2, top - h1 - h2], [x + bw - s2, top - h1], [x + bw - s1, top - h1], [x + bw - s1, top]);
    } else if (kind === 'gable') {
      pts.push([x + bw / 2, top - bw * R.r(0.2, 0.45)]);
    } else if (kind === 'dome') {
      pts.push([x + bw * 0.2, top]);
      deco.push({ t: 'dome', x: x + bw / 2, y: top, r: bw * 0.3 });
      pts.push([x + bw * 0.8, top]);
    } else if (kind === 'tank') {
      deco.push({ t: 'tank', x: x + bw * R.r(0.25, 0.7), y: top, s: Math.min(bw * 0.4, 44) * R.r(0.8, 1.1) });
    } else if (kind === 'antenna') {
      deco.push({ t: 'ant', x: x + bw * R.r(0.3, 0.7), y: top, hh: R.r(30, 80) });
    } else if (kind === 'broken') {
      const n = R.i(3, 6);
      for (let i = 1; i < n; i++) pts.push([x + (bw * i) / n, top + R.r(-bh * 0.12, bh * 0.2)]);
    }
    pts.push([x + bw, top], [x + bw, o.base + 4]);
    polyP(pts, true, p);
    for (const d of deco) {
      if (d.t === 'dome') { p.moveTo(d.x + d.r, d.y); p.arc(d.x, d.y, d.r, 0, Math.PI, true); p.closePath(); }
      if (d.t === 'tank') waterTowerPath(d.x, d.y, d.s, p);
      if (d.t === 'ant') {
        p.rect(d.x - 1.5, d.y - d.hh, 3, d.hh);
        p.rect(d.x - 8, d.y - d.hh * 0.6, 16, 2.5);
      }
    }
    const b = { x, w: bw, top, h: bh, kind, path: p, deco };
    out.push(b);
    fillP(ctx, p, typeof o.fill === 'function' ? o.fill(R, b) : o.fill);
    if (o.lw) strokeP(ctx, p, o.lw, o.ink || INK);
    if (o.onBuilding) o.onBuilding(b);
    x += bw + R.r(o.gapMin || -bw * 0.15, o.gapMax || 0);
  }
  return out;
}

export function waterTowerPath(cx, base, s, p = new Path2D()) {
  const legH = s * 0.55, tw = s * 0.9, th = s * 0.75;
  p.rect(cx - tw * 0.42, base - legH, 2.5, legH);
  p.rect(cx + tw * 0.42 - 2.5, base - legH, 2.5, legH);
  p.rect(cx - 1.2, base - legH, 2.4, legH);
  p.moveTo(cx - tw / 2, base - legH);
  p.lineTo(cx - tw / 2, base - legH - th);
  p.lineTo(cx, base - legH - th - s * 0.38);
  p.lineTo(cx + tw / 2, base - legH - th);
  p.lineTo(cx + tw / 2, base - legH);
  p.closePath();
  return p;
}

// Windows for a building box. style: 'grid' | 'strips' | 'dots'
export function windows(ctx, R, b, o) {
  const lit = new Path2D(), dark = new Path2D();
  const ww = o.ww || 6, wh = o.wh || 9, gx = o.gx || 6, gy = o.gy || 8;
  const x0 = b.x + (o.pad || 6), x1 = b.x + b.w - (o.pad || 6);
  const top = b.top + (o.padTop || 10), bot = (o.bottom != null ? o.bottom : b.top + b.h) - 6;
  const cols = Math.max(1, Math.floor((x1 - x0 + gx) / (ww + gx)));
  const off = (x1 - x0 - (cols * (ww + gx) - gx)) / 2;
  const litP = o.litP != null ? o.litP : 0.3;
  // lit windows come in clusters (floors / offices)
  for (let y = top; y + wh < bot; y += wh + gy) {
    const floorLit = R() < 0.35;
    for (let c = 0; c < cols; c++) {
      const x = x0 + off + c * (ww + gx);
      const on = R() < (floorLit ? litP * 2.2 : litP * 0.6);
      (on ? lit : dark).rect(x, y, ww, wh);
    }
  }
  if (o.dark) fillP(ctx, dark, o.dark);
  if (o.lit) fillP(ctx, lit, o.lit);
  if (o.litInk) strokeP(ctx, lit, o.litInk, o.ink || INK);
  return { lit, dark };
}

// Brick shorthand: bricks drawn only in a few patches (like an inker would).
export function brickPatches(ctx, R, x, y, w, h, o = {}) {
  const bw = o.bw || 30, bh = o.bh || 13;
  const n = o.patches != null ? o.patches : Math.max(2, Math.round((w * h) / 60000));
  const p = new Path2D();
  const fillB = new Path2D();
  for (let k = 0; k < n; k++) {
    const pcx = x + R() * w, pcy = y + R() * h;
    const rx = (o.rx || 90) * (0.6 + R() * 0.8), ry = (o.ry || 50) * (0.6 + R() * 0.8);
    const r0 = Math.floor((pcy - ry - y) / bh), r1 = Math.ceil((pcy + ry - y) / bh);
    for (let row = r0; row <= r1; row++) {
      const yy = y + row * bh;
      const off = row % 2 ? bw / 2 : 0;
      const c0 = Math.floor((pcx - rx - x - off) / bw), c1 = Math.ceil((pcx + rx - x - off) / bw);
      for (let c = c0; c <= c1; c++) {
        const xx = x + off + c * bw;
        const dx = (xx + bw / 2 - pcx) / rx, dy = (yy + bh / 2 - pcy) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1 - R() * 0.35) continue;
        if (xx < x - 1 || xx + bw > x + w + 1 || yy < y - 1 || yy + bh > y + h + 1) continue;
        p.rect(xx + 1, yy + 1, bw - 2, bh - 2);
        if (o.fillVar && R() < 0.25) fillB.rect(xx + 1, yy + 1, bw - 2, bh - 2);
      }
    }
  }
  if (o.fillVar) fillP(ctx, fillB, o.fillVar);
  if (o.brickFill) fillP(ctx, p, o.brickFill);
  strokeP(ctx, p, o.lw || 1.2, o.color || INK);
  return p;
}

// Full brick coverage (for small areas).
export function bricksFull(ctx, x, y, w, h, o = {}) {
  const bw = o.bw || 30, bh = o.bh || 13;
  const p = new Path2D();
  let row = 0;
  for (let yy = y; yy < y + h - 0.1; yy += bh, row++) {
    p.moveTo(x, yy); p.lineTo(x + w, yy);
    const off = row % 2 ? bw / 2 : 0;
    for (let xx = x + off; xx < x + w; xx += bw) {
      if (xx <= x) continue;
      p.moveTo(xx, yy); p.lineTo(xx, Math.min(y + h, yy + bh));
    }
  }
  strokeP(ctx, p, o.lw || 1, o.color || INK);
}

// ------------------------------------------------------------ weather

export function rain(ctx, R, x, y, w, h, n, o = {}) {
  const ang = o.angle != null ? o.angle : 1.35; // radians from +x
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const p = new Path2D();
  for (let i = 0; i < n; i++) {
    const len = (o.len || 30) * (0.5 + R());
    const sx = x - ca * len + R() * (w + Math.abs(ca) * h), sy = y + R() * h;
    p.moveTo(sx, sy);
    p.lineTo(sx + ca * len, sy + sa * len);
  }
  ctx.save();
  if (o.alpha) ctx.globalAlpha = o.alpha;
  ctx.lineCap = 'round';
  strokeP(ctx, p, o.lw || 1.2, o.color || '#ffffff');
  ctx.restore();
}

// Fog band built from overlapping cloud puffs.
export function fogBand(ctx, R, x, y, w, thick, color, o = {}) {
  const p = new Path2D();
  const step = o.step || thick * 1.3;
  for (let xx = x - step; xx < x + w + step; xx += step * (0.6 + R() * 0.5)) {
    cloudPath(xx, y + (R() - 0.5) * thick * 0.4, step * (0.7 + R() * 0.4), thick * (0.45 + R() * 0.3), 7, (R() * 1e6) | 0, p);
  }
  p.rect(x - 10, y, w + 20, o.down != null ? o.down : thick);
  ctx.save();
  ctx.globalAlpha = o.alpha != null ? o.alpha : 0.5;
  fillP(ctx, p, color);
  ctx.restore();
  if (o.edge) {
    ctx.save();
    ctx.globalAlpha = o.edgeAlpha || 0.5;
    strokeP(ctx, p, o.edgeW || 1.2, o.edge);
    ctx.restore();
  }
  return p;
}

// ------------------------------------------------------------ fire etc

export function flamePath(R, cx, base, w, h, p = new Path2D()) {
  const n = R.i(3, 5);
  const pts = [[cx - w / 2, base]];
  for (let i = 0; i < n; i++) {
    const t0 = (i + 0.5) / n;
    const tipX = cx - w / 2 + w * t0 + (R() - 0.5) * w * 0.15;
    const tipH = h * (0.45 + R() * 0.55) * (1 - Math.abs(t0 - 0.5) * 0.9);
    const valX = cx - w / 2 + (w * (i + 1)) / n;
    const valH = h * (0.12 + R() * 0.18);
    pts.push([tipX - w * 0.08, base - tipH * 0.55], [tipX + (R() - 0.3) * w * 0.12, base - tipH]);
    if (i < n - 1) pts.push([valX, base - valH]);
  }
  pts.push([cx + w / 2, base]);
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    p.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2);
  }
  p.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  p.closePath();
  return p;
}

export function fire(ctx, R, cx, base, w, h, o = {}) {
  const seed = (R() * 1e6) | 0;
  const cols = o.colors || ['#e8401c', '#ff9a1f', '#ffe26a'];
  const lw = o.lw != null ? o.lw : 2;
  const r1 = mkR(seed);
  const outer = flamePath(r1, cx, base, w, h);
  fillP(ctx, outer, cols[0]);
  if (lw) strokeP(ctx, outer, lw, o.ink || INK);
  const r2 = mkR(seed + 1);
  fillP(ctx, flamePath(r2, cx, base, w * 0.7, h * 0.72), cols[1]);
  const r3 = mkR(seed + 2);
  fillP(ctx, flamePath(r3, cx, base, w * 0.4, h * 0.42), cols[2]);
}

export function smoke(ctx, R, x, y, o = {}) {
  const n = o.n || 6;
  const p = new Path2D();
  let cx = x, cy = y, r = o.r || 30;
  for (let i = 0; i < n; i++) {
    cloudPath(cx, cy, r * 1.2, r, 8, (R() * 1e6) | 0, p);
    cx += (o.drift || 20) + (R() - 0.5) * r * 0.6;
    cy -= r * (0.9 + R() * 0.4);
    r *= o.grow || 1.18;
  }
  if (o.lw) strokeP(ctx, p, o.lw * 2, o.ink || INK);
  fillP(ctx, p, o.fill || '#3a2a3a');
  if (o.shade) crescent(ctx, p, -(o.r || 30) * 0.25, -(o.r || 30) * 0.3, o.shade);
  if (o.dots) {
    ctx.save(); ctx.clip(p);
    dotsIn(ctx, rectP(x - 2000, y - 3000, 4000, 3000), o.dots, o.sp || 7, o.dr || 1.5);
    ctx.restore();
  }
  return p;
}

export function boltPath(R, x0, y0, x1, y1, width, segs = 7, p = new Path2D()) {
  const pts = [];
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const off = i === 0 || i === segs ? 0 : (R() - 0.5) * len * 0.22;
    pts.push([x0 + dx * t + nx * off, y0 + dy * t + ny * off]);
  }
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const wv = width * (1 - i / pts.length) + 0.8;
    left.push([pts[i][0] + nx * wv, pts[i][1] + ny * wv]);
    right.push([pts[i][0] - nx * wv * 0.4, pts[i][1] - ny * wv * 0.4]);
  }
  polyP(left.concat(right.reverse()), true, p);
  return p;
}

// Electric arc: jagged polyline (for strokes).
export function arcLine(R, x0, y0, x1, y1, segs = 8, amp = 0.2, p = new Path2D()) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  p.moveTo(x0, y0);
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const off = i === segs ? 0 : (R() - 0.5) * len * amp;
    p.lineTo(x0 + dx * t + nx * off, y0 + dy * t + ny * off);
  }
  return p;
}

// ------------------------------------------------------------ machinery

// Thick pipe along a polyline: ink casing, body, highlight stripe.
export function pipe(ctx, pts, r, color, o = {}) {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = o.cap || 'butt';
  strokeP(ctx, p, r * 2 + (o.lw || 2) * 2, o.ink || INK);
  strokeP(ctx, p, r * 2, color);
  if (o.shadow !== false) {
    ctx.save();
    ctx.translate(r * 0.35, r * 0.35);
    strokeP(ctx, p, r * 0.9, o.shadowColor || shade(color, -0.25));
    ctx.restore();
  }
  ctx.translate(-r * 0.35, -r * 0.35);
  strokeP(ctx, p, Math.max(1, r * 0.35), o.hi || shade(color, 0.45));
  ctx.restore();
  // flanges
  if (o.flanges) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      const n = Math.floor(len / o.flanges);
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        const fx = ax + (bx - ax) * t, fy = ay + (by - ay) * t;
        const vert = Math.abs(bx - ax) < Math.abs(by - ay);
        const f = vert ? rectP(fx - r - 3, fy - 3, r * 2 + 6, 6) : rectP(fx - 3, fy - r - 3, 6, r * 2 + 6);
        inked(ctx, f, o.flangeColor || shade(color, -0.1), o.lw || 2, o.ink || INK);
      }
    }
  }
  return p;
}

export function hazardStripes(ctx, path, x, y, w, h, c1, c2, sw = 18, ang = -1) {
  ctx.save();
  ctx.clip(path);
  fillP(ctx, rectP(x, y, w, h), c1);
  const p = new Path2D();
  for (let xx = x - h - sw * 2; xx < x + w + h; xx += sw * 2) {
    if (ang < 0) polyP([[xx, y + h], [xx + sw, y + h], [xx + sw + h, y], [xx + h, y]], true, p);
    else polyP([[xx, y], [xx + sw, y], [xx + sw + h, y + h], [xx + h, y + h]], true, p);
  }
  fillP(ctx, p, c2);
  ctx.restore();
}

export function rivetRow(ctx, x0, y0, x1, y1, spacing, r, fill, lw = 1, ink = INK) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.floor(len / spacing));
  const p = new Path2D();
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0;
    circP(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, p);
  }
  if (fill) fillP(ctx, p, fill);
  if (lw) strokeP(ctx, p, lw, ink);
}

// Round gauge with needle.
export function dial(ctx, R, cx, cy, r, o = {}) {
  const face = circP(cx, cy, r);
  inked(ctx, circP(cx, cy, r + r * 0.2), o.rim || '#8a8f96', o.lw || 1.5);
  inked(ctx, face, o.face || '#efe8cf', o.lw || 1.5);
  const t = new Path2D();
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI * 0.8 + (i / 6) * Math.PI * 1.4;
    t.moveTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7);
    t.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
  }
  strokeP(ctx, t, Math.max(0.8, r * 0.07), o.ink || INK);
  if (o.red !== false) {
    const rz = new Path2D();
    rz.arc(cx, cy, r * 0.8, Math.PI * 1.85, Math.PI * 2.2);
    strokeP(ctx, rz, r * 0.16, o.redColor || '#d8403a');
  }
  const a = Math.PI * 0.8 + R() * Math.PI * 1.4;
  const n = new Path2D();
  n.moveTo(cx, cy);
  n.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85);
  strokeP(ctx, n, Math.max(1, r * 0.1), o.needle || INK);
  fillP(ctx, circP(cx, cy, r * 0.12), o.ink || INK);
}

// Neon lettering: halo dots, colored tube, white hot core.
export function neon(ctx, text, x, y, size, color, o = {}) {
  ctx.save();
  ctx.font = `${size}px ${o.font || FONT}`;
  ctx.textAlign = o.align || 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (o.rot) { ctx.translate(x, y); ctx.rotate(o.rot); x = 0; y = 0; }
  if (o.off) {
    // unlit tube: dark outline only
    ctx.lineWidth = size * 0.1;
    ctx.strokeStyle = o.offColor || '#3a3a44';
    ctx.strokeText(text, x, y);
    ctx.restore();
    return;
  }
  ctx.globalAlpha = o.haloAlpha != null ? o.haloAlpha : 0.18;
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.55;
  ctx.strokeText(text, x, y);
  ctx.globalAlpha = (o.haloAlpha != null ? o.haloAlpha : 0.18) * 1.6;
  ctx.lineWidth = size * 0.3;
  ctx.strokeText(text, x, y);
  ctx.globalAlpha = 1;
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = o.ink || INK;
  ctx.strokeText(text, x, y);
  ctx.lineWidth = size * 0.1;
  ctx.strokeStyle = color;
  ctx.strokeText(text, x, y);
  ctx.lineWidth = size * 0.035;
  ctx.strokeStyle = o.core || '#ffffff';
  ctx.strokeText(text, x, y);
  ctx.restore();
}

// Plain painted/printed sign lettering.
export function letters(ctx, text, x, y, size, color, o = {}) {
  ctx.save();
  ctx.font = `${size}px ${o.font || FONT}`;
  ctx.textAlign = o.align || 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (o.rot) { ctx.translate(x, y); ctx.rotate(o.rot); x = 0; y = 0; }
  if (o.sx) { ctx.translate(x, y); ctx.scale(o.sx, 1); x = 0; y = 0; }
  if (o.outline) {
    ctx.lineWidth = o.outline;
    ctx.strokeStyle = o.ink || INK;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  if (o.maxW) ctx.fillText(text, x, y, o.maxW); else ctx.fillText(text, x, y);
  ctx.restore();
}

// Recursive gnarly dead tree as tapered strokes.
export function deadTree(ctx, R, x, base, h, color, o = {}) {
  const segs = [];
  const grow = (x0, y0, ang, len, wid, depth) => {
    const bend = (R() - 0.5) * 0.5;
    const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
    const mx = x0 + Math.cos(ang + bend) * len * 0.55, my = y0 + Math.sin(ang + bend) * len * 0.55;
    segs.push({ x0, y0, mx, my, x1, y1, wid });
    if (depth <= 0 || wid < 1.2) return;
    const nb = depth > 3 ? 2 : R.i(2, 3);
    for (let i = 0; i < nb; i++) {
      const na = ang + (i - (nb - 1) / 2) * R.r(0.45, 0.9) + (R() - 0.5) * 0.3;
      grow(x1, y1, na, len * R.r(0.6, 0.8), wid * R.r(0.55, 0.7), depth - 1);
    }
    if (R() < 0.4) grow(mx, my, ang + R.sign() * R.r(0.7, 1.2), len * 0.45, wid * 0.4, depth - 2);
  };
  const trunkW = o.trunk || h * 0.07;
  grow(x, base, -Math.PI / 2 + (R() - 0.5) * 0.25, h * 0.36, trunkW, o.depth || 5);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const draw = (extra, col) => {
    ctx.strokeStyle = col;
    for (const s of segs) {
      ctx.lineWidth = s.wid + extra;
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.quadraticCurveTo(s.mx, s.my, s.x1, s.y1);
      ctx.stroke();
    }
  };
  if (o.ink) draw(o.inkW || 3, o.ink);
  draw(0, color);
  // roots / base flare
  const b = new Path2D();
  b.moveTo(x - trunkW * 1.6, base + 2);
  b.quadraticCurveTo(x - trunkW * 0.4, base - trunkW * 0.8, x - trunkW * 0.45, base - trunkW * 2.2);
  b.lineTo(x + trunkW * 0.45, base - trunkW * 2.2);
  b.quadraticCurveTo(x + trunkW * 0.4, base - trunkW * 0.8, x + trunkW * 1.7, base + 2);
  b.closePath();
  fillP(ctx, b, color);
  ctx.restore();
  return segs;
}

// Iron fence with spear tips.
export function ironFence(ctx, x0, x1, base, h, color, o = {}) {
  const sp = o.spacing || 16;
  const p = new Path2D();
  const bar = o.bar || 3;
  for (let x = x0; x <= x1; x += sp) {
    p.rect(x - bar / 2, base - h, bar, h);
    p.moveTo(x - bar * 1.6, base - h);
    p.lineTo(x, base - h - bar * 4);
    p.lineTo(x + bar * 1.6, base - h);
    p.closePath();
  }
  p.rect(x0 - 4, base - h * 0.85, x1 - x0 + 8, bar);
  p.rect(x0 - 4, base - h * 0.22, x1 - x0 + 8, bar);
  if (o.posts) {
    for (let x = x0; x <= x1; x += o.posts) {
      p.rect(x - 5, base - h - 6, 10, h + 6);
      p.rect(x - 7, base - h - 10, 14, 5);
      circP(x, base - h - 14, 5, p);
    }
  }
  fillP(ctx, p, color);
  if (o.lw) strokeP(ctx, p, o.lw, o.ink || INK);
}

// Dot vignette creeping in from the edges / corners.
export function vignette(ctx, w, h, color, o = {}) {
  const sp = o.spacing || 9;
  halftoneGradient(ctx, 0, 0, w, h, color, { spacing: sp, dir: 'radial', cx: o.cx != null ? o.cx : w / 2, cy: o.cy != null ? o.cy : h / 2, from: o.from || 0.72, to: o.to || 1.5, maxR: sp * 0.62 });
}

// Speckle / grime.
export function speckle(ctx, R, x, y, w, h, n, color, rmax = 2) {
  const p = new Path2D();
  for (let i = 0; i < n; i++) {
    const px = x + R() * w, py = y + R() * h, r = 0.4 + R() * rmax;
    p.moveTo(px + r, py);
    p.arc(px, py, r, 0, TAU);
  }
  fillP(ctx, p, color);
}

// Drips hanging from a line (grime, blood, slime).
export function drips(ctx, R, x0, x1, y, maxLen, color, o = {}) {
  const p = new Path2D();
  p.moveTo(x0, y - (o.up || 4));
  let x = x0;
  p.lineTo(x0, y);
  while (x < x1) {
    const dw = R.r(6, 16);
    const len = R() < (o.p || 0.5) ? R.r(maxLen * 0.2, maxLen) : R.r(0, 4);
    p.lineTo(x + dw * 0.2, y);
    p.quadraticCurveTo(x + dw * 0.25, y + len, x + dw * 0.5, y + len + dw * 0.2);
    p.quadraticCurveTo(x + dw * 0.75, y + len, x + dw * 0.8, y);
    x += dw;
  }
  p.lineTo(x1, y);
  p.lineTo(x1, y - (o.up || 4));
  p.closePath();
  fillP(ctx, p, color);
  if (o.lw) strokeP(ctx, p, o.lw, o.ink || INK);
  return p;
}

// Classic comic sky: light paper-ish base with sky-colored dots growing to a
// solid band at the top.
export function dotSky(ctx, x, y, w, h, base, dotColor, o = {}) {
  const sp = o.spacing || 10;
  fillP(ctx, rectP(x, y, w, h), base);
  const solidH = h * (o.solid != null ? o.solid : 0.25);
  if (solidH > 0) fillP(ctx, rectP(x, y - 5, w, solidH + 5), dotColor);
  halftoneGradient(ctx, x - 5, y + solidH - 2, w + 10, h - solidH, dotColor, { spacing: sp, dir: 'up', maxR: sp * 0.64, from: o.from || 0, to: o.to || 1 });
}

// Bat silhouette centered at (x,y), span s.
export function batPath(x, y, s, flap = 0, p = new Path2D()) {
  const w = s / 2, up = s * (0.18 + flap * 0.2);
  p.moveTo(x, y - s * 0.05);
  p.quadraticCurveTo(x + w * 0.4, y - up * 1.2, x + w, y - up);
  p.quadraticCurveTo(x + w * 0.85, y + s * 0.02, x + w * 0.72, y + s * 0.1);
  p.quadraticCurveTo(x + w * 0.62, y + s * 0.02, x + w * 0.5, y + s * 0.09);
  p.quadraticCurveTo(x + w * 0.38, y + s * 0.01, x + w * 0.24, y + s * 0.08);
  p.quadraticCurveTo(x + w * 0.12, y + s * 0.02, x, y + s * 0.1);
  p.quadraticCurveTo(x - w * 0.12, y + s * 0.02, x - w * 0.24, y + s * 0.08);
  p.quadraticCurveTo(x - w * 0.38, y + s * 0.01, x - w * 0.5, y + s * 0.09);
  p.quadraticCurveTo(x - w * 0.62, y + s * 0.02, x - w * 0.72, y + s * 0.1);
  p.quadraticCurveTo(x - w * 0.85, y + s * 0.02, x - w, y - up);
  p.quadraticCurveTo(x - w * 0.4, y - up * 1.2, x, y - s * 0.05);
  p.closePath();
  p.moveTo(x - s * 0.04, y - s * 0.05);
  p.lineTo(x - s * 0.05, y - s * 0.12);
  p.lineTo(x, y - s * 0.07);
  p.lineTo(x + s * 0.05, y - s * 0.12);
  p.lineTo(x + s * 0.04, y - s * 0.05);
  p.closePath();
  return p;
}

// Smooth rolling ground/hill silhouette through points; closed to `bottom`.
export function hillPath(pts, bottom, p = new Path2D()) {
  p.moveTo(pts[0][0], bottom);
  p.lineTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    p.bezierCurveTo((ax + bx) / 2, ay, (ax + bx) / 2, by, bx, by);
  }
  p.lineTo(pts[pts.length - 1][0], bottom);
  p.closePath();
  return p;
}

// Handprint (palm + fingers) at x,y pointing up, size s.
export function handPath(x, y, s, rot = 0, p = new Path2D()) {
  const m = new DOMMatrix().translate(x, y).rotate((rot * 180) / Math.PI);
  const q = new Path2D();
  q.ellipse(0, 0, s * 0.42, s * 0.5, 0, 0, TAU);
  const fingers = [[-0.34, -0.72, 0.1, 0.3, -0.25], [-0.13, -0.92, 0.1, 0.36, -0.08], [0.1, -0.94, 0.1, 0.36, 0.06], [0.32, -0.76, 0.09, 0.3, 0.22], [0.52, -0.08, 0.09, 0.26, 0.9]];
  for (const [fx, fy, rx, ry, a] of fingers) { q.moveTo(fx * s + rx * s, fy * s); q.ellipse(fx * s, fy * s, rx * s, ry * s, a, 0, TAU); }
  p.addPath(q, m);
  return p;
}

// Dots on a GLOBAL 45-degree lattice (anchored at 0,0) inside an annulus,
// shrinking from full size at rIn to nothing at rOut. Iterates only the ring
// (fast for huge radii) and, being globally aligned, never moires with itself.
export function dotRing(ctx, cx, cy, rIn, rOut, color, sp = 8, o = {}) {
  const maxR = o.maxR || sp * 0.64;
  const b = o.bounds || [-1e9, -1e9, 1e9, 1e9];
  const p = new Path2D();
  const half = sp / 2;
  const yStart = Math.max(cy - rOut, b[1] - sp), yEnd = Math.min(cy + rOut, b[3] + sp);
  let row = Math.floor(yStart / half);
  for (let yy = row * half; yy <= yEnd; yy += half, row++) {
    const dy = yy - cy;
    if (Math.abs(dy) > rOut) continue;
    const xo = Math.sqrt(rOut * rOut - dy * dy);
    const xi = Math.abs(dy) < rIn ? Math.sqrt(rIn * rIn - dy * dy) : 0;
    const off = (row & 1) ? half : 0;
    const segs = xi > 0 ? [[cx - xo, cx - xi], [cx + xi, cx + xo]] : [[cx - xo, cx + xo]];
    for (const [a0, a1] of segs) {
      const lo = Math.max(a0, b[0] - sp), hi = Math.min(a1, b[2] + sp);
      for (let xx = Math.ceil((lo - off) / sp) * sp + off; xx <= hi; xx += sp) {
        const d = Math.hypot(xx - cx, dy);
        let t = 1 - (d - rIn) / (rOut - rIn);
        if (t <= 0) continue;
        if (t > 1) t = 1;
        const r = maxR * (o.ease ? t * t : t);
        if (r < 0.35) continue;
        p.moveTo(xx + r, yy);
        p.arc(xx, yy, r, 0, TAU);
      }
    }
  }
  fillP(ctx, p, color);
}

// Posterized radial glow: flat rings from outside in, each edge softened by a
// ring of dots of the inner color.
// stops: [{ r, c }] ordered from the OUTERMOST ring to the innermost.
export function ringGlow(ctx, cx, cy, stops, o = {}) {
  const sp = o.spacing || 8;
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const next = stops[i + 1];
    fillP(ctx, circP(cx, cy, s.r), s.c);
    if (next) {
      const ro = next.r + (s.r - next.r) * (o.fade != null ? o.fade : 0.7);
      dotRing(ctx, cx, cy, next.r - 1, ro, next.c, sp, { bounds: o.bounds });
    }
  }
}

// Horizontal layout slots so big backdrop features don't pile on each other.
export function spans(x0, x1) {
  const used = [];
  return {
    take(R, width, pad = 20, tries = 24) {
      if (width > x1 - x0) return null;
      for (let t = 0; t < tries; t++) {
        const x = x0 + R() * (x1 - x0 - width);
        if (used.some(([a, b]) => x < b + pad && x + width + pad > a)) continue;
        used.push([x, x + width]);
        return x;
      }
      return null;
    },
    mark(a, b) { used.push([a, b]); },
  };
}
