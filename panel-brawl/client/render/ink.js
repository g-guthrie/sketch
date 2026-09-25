// Comic-print drawing toolkit: halftone dots, hatching, wobbly ink lines,
// starbursts, puffy clouds, SFX lettering, caption boxes and speech bubbles.

import { mulberry32 } from '../../shared/rng.js';

export const INK = '#141414';
export const PAPER = '#f3ead3';
export const FONT = "'Bangers', 'Impact', 'Arial Black', sans-serif";
export const HAND = "'Comic Neue', 'Bangers', 'Comic Sans MS', sans-serif";

export const rand = (seed) => mulberry32(seed >>> 0);

// ------------------------------------------------------------------ color

export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

// amt < 0 darkens toward black, amt > 0 lightens toward white
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  if (amt < 0) return rgbToHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
  return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}

export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// Desaturate toward grey (used for sleeping "uninked" characters)
export function desat(hex, t = 1) {
  const [r, g, b] = hexToRgb(hex);
  const l = r * 0.3 + g * 0.59 + b * 0.11;
  return rgbToHex(r + (l - r) * t, g + (l - g) * t, b + (l - b) * t);
}

// --------------------------------------------------------------- patterns

const patCache = new Map();
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
export { makeCanvas };

// Classic 45-degree Ben-Day dot screen.
export function halftone(ctx, color, spacing = 6, radius = 1.5, bg = null) {
  const key = color + '|' + spacing + '|' + radius + '|' + bg;
  let pat = patCache.get(key);
  if (pat) return pat;
  const s = Math.max(2, Math.round(spacing * 2));
  const c = makeCanvas(s, s);
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, s, s); }
  g.fillStyle = color;
  const dot = (x, y) => { g.beginPath(); g.arc(x, y, radius * 2, 0, Math.PI * 2); g.fill(); };
  const h = s / 2;
  dot(0, 0); dot(s, 0); dot(0, s); dot(s, s); dot(h, h);
  pat = ctx.createPattern(c, 'repeat');
  // pattern tile is drawn at 2x; scale it back so dot spacing == spacing
  if (pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().scale(0.5, 0.5));
  patCache.set(key, pat);
  return pat;
}

export function hatchPattern(ctx, color, spacing = 6, width = 1.2, cross = false) {
  const key = 'h|' + color + '|' + spacing + '|' + width + '|' + cross;
  let pat = patCache.get(key);
  if (pat) return pat;
  const s = Math.round(spacing * 2);
  const c = makeCanvas(s, s);
  const g = c.getContext('2d');
  g.strokeStyle = color;
  g.lineWidth = width * 2;
  g.beginPath();
  for (let i = -1; i <= 1; i++) { g.moveTo(i * s, s); g.lineTo(i * s + s, 0); }
  if (cross) for (let i = -1; i <= 1; i++) { g.moveTo(i * s, 0); g.lineTo(i * s + s, s); }
  g.stroke();
  pat = ctx.createPattern(c, 'repeat');
  if (pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().scale(0.5, 0.5));
  patCache.set(key, pat);
  return pat;
}

// Dots that grow along a direction: the signature comic sky gradient.
// dir: 'down' (bigger toward bottom), 'up', 'radial' (bigger toward edges), 'center' (bigger toward center)
export function halftoneGradient(ctx, x, y, w, h, color, o = {}) {
  const spacing = o.spacing || 9;
  const maxR = o.maxR || spacing * 0.62;
  const minR = o.minR || 0;
  const dir = o.dir || 'down';
  const from = o.from != null ? o.from : 0;
  const to = o.to != null ? o.to : 1;
  const cx = o.cx != null ? o.cx : x + w / 2, cy = o.cy != null ? o.cy : y + h / 2;
  const maxD = Math.hypot(w, h) / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  let row = 0;
  for (let yy = y; yy <= y + h + spacing; yy += spacing * 0.5, row++) {
    const off = row % 2 ? spacing / 2 : 0;
    for (let xx = x + off; xx <= x + w + spacing; xx += spacing) {
      let t;
      if (dir === 'down') t = (yy - y) / h;
      else if (dir === 'up') t = 1 - (yy - y) / h;
      else if (dir === 'right') t = (xx - x) / w;
      else if (dir === 'left') t = 1 - (xx - x) / w;
      else if (dir === 'radial') t = Math.hypot(xx - cx, yy - cy) / maxD;
      else t = 1 - Math.hypot(xx - cx, yy - cy) / maxD;
      t = (t - from) / (to - from);
      if (t <= 0) continue;
      if (t > 1) t = 1;
      const r = minR + (maxR - minR) * t;
      if (r < 0.35) continue;
      ctx.moveTo(xx + r, yy);
      ctx.arc(xx, yy, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

let paperCanvas = null;
export function paperTexture() {
  if (paperCanvas) return paperCanvas;
  const s = 512;
  const c = makeCanvas(s, s);
  const g = c.getContext('2d');
  g.fillStyle = PAPER;
  g.fillRect(0, 0, s, s);
  const r = rand(1234);
  const img = g.getImageData(0, 0, s, s);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 14;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8;
  }
  g.putImageData(img, 0, 0);
  g.globalAlpha = 0.06;
  g.strokeStyle = '#8a7a5a';
  for (let i = 0; i < 260; i++) {
    const x = r() * s, y = r() * s, a = r() * Math.PI, l = 4 + r() * 18;
    g.lineWidth = 0.5 + r();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  g.globalAlpha = 1;
  paperCanvas = c;
  return c;
}

// ------------------------------------------------------------------ paths

export function wobblyRectPath(x, y, w, h, amp = 1.2, seed = 1, path = new Path2D()) {
  const r = rand(seed);
  const pts = [];
  const edge = (x1, y1, x2, y2) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(2, Math.ceil(len / 40));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push([x1 + (x2 - x1) * t + (r() - 0.5) * amp * 2 * (i ? 1 : 0.3), y1 + (y2 - y1) * t + (r() - 0.5) * amp * 2 * (i ? 1 : 0.3)]);
    }
  };
  edge(x, y, x + w, y);
  edge(x + w, y, x + w, y + h);
  edge(x + w, y + h, x, y + h);
  edge(x, y + h, x, y);
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
  path.closePath();
  return path;
}

export function wobblyLine(path, x1, y1, x2, y2, amp = 1, seed = 1) {
  const r = rand(seed);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(2, Math.ceil(len / 30));
  const nx = -(y2 - y1) / (len || 1), ny = (x2 - x1) / (len || 1);
  path.moveTo(x1, y1);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const o = i === n ? 0 : (r() - 0.5) * amp * 2;
    path.lineTo(x1 + (x2 - x1) * t + nx * o, y1 + (y2 - y1) * t + ny * o);
  }
  return path;
}

export function starburstPath(cx, cy, r1, r2, spikes, seed = 1, rot = 0, path = new Path2D()) {
  const r = rand(seed);
  const n = spikes * 2;
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2 + (r() - 0.5) * (Math.PI / n) * 0.8;
    const rad = i % 2 === 0 ? r2 * (0.78 + r() * 0.42) : r1 * (0.85 + r() * 0.3);
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

// Puffy comic cloud / smoke puff made of arcs around an ellipse.
export function cloudPath(cx, cy, rx, ry, bumps = 9, seed = 1, path = new Path2D()) {
  const r = rand(seed);
  const pts = [];
  for (let i = 0; i < bumps; i++) {
    const a = (i / bumps) * Math.PI * 2 + (r() - 0.5) * 0.25;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  for (let i = 0; i < bumps; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % bumps];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = mx - cx, dy = my - cy;
    const dl = Math.hypot(dx, dy) || 1;
    const bulge = Math.hypot(x2 - x1, y2 - y1) * (0.45 + r() * 0.25);
    if (i === 0) path.moveTo(x1, y1);
    path.quadraticCurveTo(mx + (dx / dl) * bulge, my + (dy / dl) * bulge, x2, y2);
  }
  path.closePath();
  return path;
}

export function inkFill(ctx, path, fill, lw = 3, stroke = INK) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill(path);
  }
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(path);
  }
}

// Fill a path with flat color, then a halftone "shadow" crescent away from the light.
export function shadedFill(ctx, path, color, o = {}) {
  const lx = o.lx != null ? o.lx : -4, ly = o.ly != null ? o.ly : -4;
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  const shadow = new Path2D();
  shadow.rect(-5000, -5000, 10000, 10000);
  shadow.addPath(path, new DOMMatrix().translate(lx, ly));
  ctx.fillStyle = o.shadow || shade(color, -0.22);
  ctx.fill(shadow, 'evenodd');
  ctx.fillStyle = halftone(ctx, o.dots || shade(color, -0.45), o.spacing || 4, o.radius || 0.9);
  ctx.fill(shadow, 'evenodd');
  ctx.restore();
}

// ---------------------------------------------------------------- letters

// Big onomatopoeia lettering: skewed, jittered letters with 3D extrusion,
// thick outline and a two-tone gradient fill.
export function comicText(ctx, text, x, y, size, o = {}) {
  const fill = o.fill || '#ffe14a';
  const fill2 = o.fill2 || '#ff7a1a';
  const stroke = o.stroke || INK;
  const extrude = o.extrude != null ? o.extrude : size * 0.1;
  const extrudeColor = o.extrudeColor || INK;
  const outline = o.outline != null ? o.outline : Math.max(2, size * 0.1);
  const jitter = o.jitter != null ? o.jitter : 0.12;
  const skew = o.skew != null ? o.skew : -0.15;
  const r = rand(o.seed || 7);
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  ctx.transform(1, 0, skew, 1, 0, 0);
  ctx.font = `${size}px ${o.font || FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  const spacing = size * (o.tracking != null ? o.tracking : 0.02);
  const letters = [];
  let total = 0;
  for (const ch of text) {
    const w = ctx.measureText(ch).width;
    letters.push({ ch, w, rot: (r() - 0.5) * jitter * 2, dy: (r() - 0.5) * size * jitter * 0.6, sc: 1 + (r() - 0.5) * jitter });
    total += w + spacing;
  }
  total -= spacing;
  let cx = o.align === 'left' ? 0 : o.align === 'right' ? -total : -total / 2;
  const grad = ctx.createLinearGradient(0, -size * 0.45, 0, size * 0.45);
  grad.addColorStop(0, fill);
  grad.addColorStop(0.55, fill);
  grad.addColorStop(1, fill2);
  const steps = Math.max(1, Math.round(extrude / 1.6));
  for (const L of letters) {
    ctx.save();
    ctx.translate(cx + L.w / 2, L.dy);
    ctx.rotate(L.rot);
    ctx.scale(L.sc, L.sc);
    const lx = -L.w / 2;
    // extrusion (down-right)
    if (extrude > 0) {
      ctx.fillStyle = extrudeColor;
      ctx.strokeStyle = extrudeColor;
      ctx.lineWidth = outline * 2;
      for (let k = steps; k >= 1; k--) {
        const e = (k / steps) * extrude;
        ctx.strokeText(L.ch, lx + e * 0.8, e);
      }
    }
    ctx.lineWidth = outline * 2;
    ctx.strokeStyle = stroke;
    ctx.strokeText(L.ch, lx, 0);
    ctx.fillStyle = grad;
    ctx.fillText(L.ch, lx, 0);
    if (o.shine !== false) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.rect(lx - 4, -size * 0.6, L.w + 8, size * 0.28);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(L.ch, lx, 0);
      ctx.restore();
    }
    ctx.restore();
    cx += L.w + spacing;
  }
  ctx.restore();
  return total;
}

// Same as comicText but rendered once into an offscreen canvas and reused.
// Use for screen-space text that repeats every frame (HUD).
const textCache = new Map();
export function comicTextCached(ctx, text, x, y, size, o = {}) {
  const key = `${text}|${size.toFixed(1)}|${o.fill}|${o.fill2}|${o.extrude}|${o.outline}|${o.seed}|${o.jitter}|${o.skew}`;
  let e = textCache.get(key);
  if (!e) {
    const probe = makeCanvas(4, 4).getContext('2d');
    probe.font = `${size}px ${o.font || FONT}`;
    const tw = probe.measureText(text).width * 1.12;
    const pad = size * 0.5;
    const W = Math.ceil(tw + pad * 2), H = Math.ceil(size * 1.8);
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const width = comicText(g, text, pad, H / 2, size, { ...o, rot: 0, align: 'left' });
    e = { c, pad, W, H, width };
    textCache.set(key, e);
    if (textCache.size > 300) textCache.delete(textCache.keys().next().value);
  }
  const ox = o.align === 'left' ? 0 : o.align === 'right' ? -e.width : -e.width / 2;
  if (o.rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(o.rot);
    ctx.drawImage(e.c, ox - e.pad, -e.H / 2);
    ctx.restore();
  } else ctx.drawImage(e.c, x + ox - e.pad, y - e.H / 2);
}

export function measureComic(ctx, text, size, font = FONT) {
  ctx.save();
  ctx.font = `${size}px ${font}`;
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

export function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Rectangular narration caption (yellow box).
export function captionBox(ctx, x, y, text, o = {}) {
  const size = o.size || 20;
  const pad = o.pad != null ? o.pad : size * 0.5;
  const maxW = o.maxW || 360;
  ctx.save();
  ctx.font = `${size}px ${o.font || FONT}`;
  const lines = wrapText(ctx, text, maxW - pad * 2);
  let w = 0;
  for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
  w += pad * 2;
  const lh = size * 1.08;
  const h = lines.length * lh + pad * 1.3;
  let bx = x;
  if (o.align === 'right') bx = x - w;
  else if (o.align === 'center') bx = x - w / 2;
  if (o.shadow !== false) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(bx + 4, y + 4, w, h);
  }
  const path = wobblyRectPath(bx, y, w, h, o.wobble != null ? o.wobble : 0.8, o.seed || 3);
  inkFill(ctx, path, o.fill || '#ffe36e', o.lw || Math.max(2, size * 0.12));
  ctx.fillStyle = o.color || INK;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  lines.forEach((l, i) => ctx.fillText(l, bx + pad, y + pad * 0.7 + i * lh));
  ctx.restore();
  return { x: bx, y, w, h };
}

// Speech / shout / thought bubble with a tail pointing at (tx, ty).
export function speechBubble(ctx, x, y, text, o = {}) {
  const size = o.size || 18;
  const kind = o.kind || 'speech';
  ctx.save();
  ctx.font = `${size}px ${o.font || FONT}`;
  const lines = wrapText(ctx, text, o.maxW || 220);
  let w = 0;
  for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
  const lh = size * 1.05;
  const tw = w + size * 1.4, th = lines.length * lh + size * 0.9;
  const cx = x, cy = y - th / 2;
  const tx = o.tx != null ? o.tx : x, ty = o.ty != null ? o.ty : y + 30;
  const lw = o.lw || Math.max(2, size * 0.12);
  let path;
  if (kind === 'shout') {
    path = starburstPath(cx, cy, Math.max(tw, th) * 0.52, Math.max(tw, th) * 0.66, 11, o.seed || 5);
    const sx = tw / Math.max(tw, th), sy = th / Math.max(tw, th);
    const p2 = new Path2D();
    p2.addPath(path, new DOMMatrix().translate(cx, cy).scale(sx * 1.08, sy * 1.25).translate(-cx, -cy));
    path = p2;
  } else if (kind === 'thought') {
    path = cloudPath(cx, cy, tw * 0.6, th * 0.62, 10, o.seed || 5);
  } else {
    path = new Path2D();
    path.ellipse(cx, cy, tw * 0.58, th * 0.62, 0, 0, Math.PI * 2);
  }
  // tail
  const tail = new Path2D();
  if (kind === 'thought') {
    const n = 3;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const px = cx + (tx - cx) * (0.55 + t * 0.45), py = cy + th * 0.4 + (ty - cy - th * 0.4) * t;
      tail.ellipse(px, py, size * 0.28 * (1 - t * 0.5), size * 0.22 * (1 - t * 0.5), 0, 0, Math.PI * 2);
    }
  } else {
    const bx = cx + (tx - cx) * 0.25;
    tail.moveTo(bx - size * 0.45, cy + th * 0.35);
    tail.quadraticCurveTo(bx, cy + th * 0.8, tx, ty);
    tail.quadraticCurveTo(bx + size * 0.1, cy + th * 0.7, bx + size * 0.45, cy + th * 0.35);
    tail.closePath();
  }
  const fill = o.fill || '#ffffff';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = o.stroke || INK;
  ctx.stroke(path);
  ctx.stroke(tail);
  ctx.fillStyle = fill;
  ctx.fill(path);
  ctx.fill(tail);
  ctx.fillStyle = o.color || INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, cx, cy - ((lines.length - 1) * lh) / 2 + i * lh));
  ctx.restore();
  return { w: tw, h: th };
}

// Radiating action lines (for impact frames, dashes and the splash page).
export function speedLines(ctx, cx, cy, r0, r1, count, seed = 1, color = INK, width = 3) {
  const r = rand(seed);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const w = (0.004 + r() * 0.014) * width;
    const inner = r0 * (0.8 + r() * 0.5);
    ctx.moveTo(cx + Math.cos(a - w) * r1, cy + Math.sin(a - w) * r1);
    ctx.lineTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a + w) * r1, cy + Math.sin(a + w) * r1);
  }
  ctx.fill();
}
