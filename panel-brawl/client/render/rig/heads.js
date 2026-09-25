// Heads and faces. Drawn in a head frame: origin at the centre of the
// cranium, the face looks toward +x (3/4 view, turned toward the reader),
// crown at y ~ -9, chin at y ~ +8. Static shapes are built once and cached;
// faces are cached per (style, expression, blink).

import { circle, ellipse, rrect, poly, TAU, PI } from './util.js';
import { halftone, INK } from '../ink.js';

const cache = new Map();
function once(key, f) {
  let v = cache.get(key);
  if (!v) { v = f(); cache.set(key, v); }
  return v;
}
const P2 = () => new Path2D();

// ------------------------------------------------------------ skulls

function skull(kind) {
  return once('skull' + kind, () => {
    const p = P2();
    if (kind === 'fem') {
      p.moveTo(-5.2, 4.0);
      p.quadraticCurveTo(-8.2, 0.4, -7.2, -4.4);
      p.quadraticCurveTo(-5.6, -9.0, -0.2, -8.9);
      p.quadraticCurveTo(5.2, -8.7, 6.6, -4.6);
      p.lineTo(7.0, -2.4);
      p.quadraticCurveTo(6.9, -1.4, 6.8, -0.8);
      p.lineTo(8.1, 1.4);
      p.quadraticCurveTo(7.7, 2.1, 6.8, 2.2);
      p.lineTo(7.1, 3.2); p.lineTo(6.75, 4.0); p.lineTo(7.0, 4.9);
      p.quadraticCurveTo(6.9, 6.3, 5.4, 7.0);
      p.quadraticCurveTo(3.4, 7.8, 1.2, 7.0);
      p.quadraticCurveTo(-2.2, 5.6, -5.2, 4.0);
    } else if (kind === 'kid') {
      p.moveTo(-5.6, 3.8);
      p.quadraticCurveTo(-9.0, 0, -7.8, -4.8);
      p.quadraticCurveTo(-6.0, -9.8, 0, -9.6);
      p.quadraticCurveTo(6.0, -9.3, 7.2, -4.2);
      p.quadraticCurveTo(7.6, -1.6, 7.3, -0.4);
      p.quadraticCurveTo(8.6, 1.0, 7.4, 2.2);
      p.quadraticCurveTo(7.4, 5.4, 5.2, 6.6);
      p.quadraticCurveTo(2.4, 7.8, -0.6, 6.4);
      p.quadraticCurveTo(-3.6, 5.2, -5.6, 3.8);
    } else if (kind === 'goon') {
      // heavier brow, bigger nose and jaw: henchmen
      p.moveTo(-5.4, 4.2);
      p.quadraticCurveTo(-8.4, 0.4, -7.4, -4.4);
      p.quadraticCurveTo(-5.8, -9.0, -0.2, -8.8);
      p.quadraticCurveTo(5.0, -8.6, 6.6, -4.4);
      p.lineTo(7.8, -2.2);
      p.lineTo(7.0, -0.6);
      p.quadraticCurveTo(10.2, 0.2, 9.6, 2.2);
      p.quadraticCurveTo(8.6, 2.9, 7.2, 2.5);
      p.lineTo(7.6, 3.6); p.lineTo(7.2, 4.4);
      p.quadraticCurveTo(8.0, 6.2, 7.2, 7.6);
      p.quadraticCurveTo(6.2, 8.8, 3.8, 8.6);
      p.quadraticCurveTo(0.4, 8.2, -2.0, 6.6);
      p.quadraticCurveTo(-3.8, 5.4, -5.4, 4.2);
    } else {
      // heroic: square chin, strong brow
      p.moveTo(-5.3, 4.3);
      p.quadraticCurveTo(-8.4, 0.6, -7.4, -4.4);
      p.quadraticCurveTo(-5.8, -9.3, -0.2, -9.1);
      p.quadraticCurveTo(5.4, -8.9, 6.9, -4.6);
      p.lineTo(7.5, -2.5);
      p.quadraticCurveTo(7.3, -1.4, 7.1, -0.9);
      p.lineTo(8.9, 1.3);
      p.quadraticCurveTo(8.4, 2.2, 7.0, 2.3);
      p.lineTo(7.35, 3.3); p.lineTo(7.0, 4.1); p.lineTo(7.35, 5.1);
      p.quadraticCurveTo(7.5, 6.4, 7.0, 7.2);
      p.quadraticCurveTo(6.3, 8.3, 4.4, 8.2);
      p.quadraticCurveTo(0.8, 8.0, -1.8, 6.4);
      p.quadraticCurveTo(-3.6, 5.3, -5.3, 4.3);
    }
    p.closePath();
    return p;
  });
}

function ear() {
  return once('ear', () => {
    const p = P2();
    p.moveTo(-1.2, -1.6);
    p.quadraticCurveTo(-3.8, -2.6, -4.0, 0.2);
    p.quadraticCurveTo(-4.0, 2.8, -1.4, 2.6);
    p.quadraticCurveTo(-0.6, 0.6, -1.2, -1.6);
    p.closePath();
    const d = P2();
    d.moveTo(-1.8, -0.6); d.quadraticCurveTo(-3.2, -0.6, -2.8, 1.2);
    return { p, d };
  });
}

function jawLine(kind) {
  return once('jaw' + kind, () => {
    const p = P2();
    if (kind === 'fem') { p.moveTo(-1.6, 3.4); p.quadraticCurveTo(0.8, 6.4, 4.2, 6.9); }
    else { p.moveTo(-1.4, 3.6); p.quadraticCurveTo(0.4, 7.2, 4.0, 7.7); }
    return p;
  });
}

// ------------------------------------------------------------- faces

// eye/brow/mouth landmarks
const FACE = {
  hero: { ne: [3.5, -0.9, 1.45, 1.1], fe: [6.95, -0.95, 0.72, 1.0], by: -2.9, m: [4.5, 4.2, 7.0, 4.0] },
  fem: { ne: [3.3, -0.8, 1.45, 1.15], fe: [6.6, -0.85, 0.7, 1.0], by: -2.8, m: [4.4, 4.1, 6.8, 3.9] },
  kid: { ne: [3.6, -0.6, 1.8, 1.55], fe: [7.0, -0.6, 0.8, 1.35], by: -3.1, m: [4.4, 4.0, 6.8, 3.8] },
  goon: { ne: [3.4, -0.8, 1.3, 1.0], fe: [6.8, -0.8, 0.65, 0.9], by: -2.6, m: [4.4, 4.7, 7.3, 4.5] },
};

// Returns cached face parts: { whites, pupils, lines, lw, mouthDark, teeth, mouthLine, tongue }
function face(style, ex, blink, kind) {
  const key = style + '|' + ex + '|' + (blink ? 1 : 0) + '|' + kind;
  return once(key, () => buildFace(style, ex, blink, FACE[kind] || FACE.hero, kind));
}

function buildFace(style, ex, blink, F, kind) {
  const out = { whites: null, pupils: null, lines: P2(), heavy: P2(), mouthDark: null, teeth: null, mouthLine: P2(), tongue: null, glow: null };
  const [nx, ny, nrx, nry] = F.ne;
  const [fx, fy, frx, fry] = F.fe;
  const closed = blink || ex === 'sleep' || ex === 'pain';
  // --- eyes
  if (style === 'eye' || style === 'lens' || style === 'glow') {
    const whites = P2(), pupils = P2();
    const lens = style === 'lens';
    const glow = style === 'glow';
    let open = 1, lidTilt = 0.3, look = 0.55, pr = 0.72;
    switch (ex) {
      case 'det': lidTilt = 0.45; open = lens ? 0.85 : 0.95; break;
      case 'grit': lidTilt = 0.6; open = 0.6; break;
      case 'mean': lidTilt = 0.5; open = 0.8; break;
      case 'surp': lidTilt = -0.1; open = 1.45; pr = 0.5; break;
      case 'scared': lidTilt = -0.35; open = 1.3; pr = 0.5; look = 0.1; break;
      case 'shout': lidTilt = 0.55; open = 1.1; break;
      case 'focus': lidTilt = 0.15; open = 0.6; break;
      case 'calm': lidTilt = 0.05; open = 0.75; look = 0.3; break;
      case 'smile': lidTilt = -0.05; open = 0.8; look = 0.45; break;
      case 'daze': lidTilt = -0.1; open = 1.0; break;
      default: break;
    }
    if (closed) {
      // shut: curved lids (sleep) or squeezed >< (pain)
      if (ex === 'pain') {
        out.heavy.moveTo(nx - nrx, ny - 0.9); out.heavy.lineTo(nx + nrx * 0.8, ny); out.heavy.lineTo(nx - nrx * 0.9, ny + 0.9);
        out.heavy.moveTo(fx + frx, fy - 0.9); out.heavy.lineTo(fx - frx * 0.6, fy); out.heavy.lineTo(fx + frx, fy + 0.8);
      } else {
        out.heavy.moveTo(nx - nrx, ny); out.heavy.quadraticCurveTo(nx, ny + nry * 1.1, nx + nrx, ny - 0.1);
        out.heavy.moveTo(fx - frx, fy); out.heavy.quadraticCurveTo(fx, fy + fry, fx + frx, fy - 0.1);
      }
    } else if (lens) {
      // superhero mask lenses: angled almonds, no pupils
      const lensShape = (cx, cy, rx, ry, far) => {
        const t = lidTilt * (far ? 0.6 : 1) * ry;
        const top = ry * open;
        whites.moveTo(cx - rx * 1.05, cy - top * 0.6 - t);
        whites.quadraticCurveTo(cx, cy - top * 1.25, cx + rx * 1.05, cy - top * 0.45 + t);
        whites.quadraticCurveTo(cx + rx * 0.7, cy + ry * 0.95, cx, cy + ry * 0.8);
        whites.quadraticCurveTo(cx - rx * 0.9, cy + ry * 0.7, cx - rx * 1.05, cy - top * 0.6 - t);
        whites.closePath();
      };
      if (ex === 'daze') {
        spiral(out.heavy, nx, ny, 1.4); spiral(out.heavy, fx, fy, 0.8);
      } else {
        lensShape(nx, ny, nrx * 1.08, nry * 1.05, false);
        lensShape(fx, fy, frx * 1.1, fry, true);
      }
    } else {
      // round-ish whites, heavy upper lid, pupil looking forward
      const eyeShape = (cx, cy, rx, ry) => {
        const r = ry * open;
        whites.moveTo(cx + rx, cy);
        whites.ellipse(cx, cy + (1 - open) * ry * 0.4, rx, r, 0, 0, TAU);
      };
      if (ex === 'daze') {
        eyeShape(nx, ny, nrx, nry); eyeShape(fx, fy, frx, fry);
        spiral(out.lines, nx, ny, nrx * 0.8); spiral(out.lines, fx, fy, frx * 0.8);
      } else {
        eyeShape(nx, ny, nrx, nry); eyeShape(fx, fy, frx, fry);
        if (!glow) {
          circle(pupils, nx + nrx * look, ny + 0.1, pr * (kind === 'kid' ? 1.25 : 1));
          circle(pupils, fx + frx * look * 0.6, fy + 0.1, pr * 0.8 * (kind === 'kid' ? 1.2 : 1));
        }
        // upper lid (tilted down toward the nose when determined)
        const lt = lidTilt;
        const ly = (1 - open) * 0.5;
        out.heavy.moveTo(nx - nrx * 1.1, ny - nry * open * 0.7 - lt * 0.5 + ly);
        out.heavy.quadraticCurveTo(nx, ny - nry * open * 1.15 + ly, nx + nrx * 1.05, ny - nry * open * 0.55 + lt * 0.7 + ly);
        out.heavy.moveTo(fx - frx, fy - fry * open * 0.8 + ly);
        out.heavy.quadraticCurveTo(fx, fy - fry * open * 1.1 + ly, fx + frx * 1.1, fy - fry * open * 0.5 + lt * 0.5 + ly);
      }
    }
    out.whites = whites;
    out.pupils = pupils;
    out.glow = glow;
    // brows (not on masked lenses: the mask edge is the brow)
    if (!lens && !glow) {
      const by = F.by;
      let inner = 0, outer = 0, arch = 0;
      switch (ex) {
        case 'det': inner = 0.7; outer = -0.2; break;
        case 'grit': case 'shout': inner = 1.2; outer = -0.4; break;
        case 'mean': inner = 0.9; outer = -0.6; arch = 0.2; break;
        case 'pain': inner = -1.0; outer = 0.5; break;
        case 'surp': inner = -1.1; outer = -0.8; arch = 0.5; break;
        case 'scared': inner = -1.2; outer = 0.2; arch = 0.2; break;
        case 'daze': inner = -0.3; outer = 0.6; break;
        case 'focus': inner = 0.4; outer = -0.8; break;
        case 'sleep': inner = -0.1; outer = 0.2; break;
        case 'smile': inner = -0.4; outer = -0.3; arch = 0.3; break;
        default: break;
      }
      const b = out.heavy;
      b.moveTo(nx - nrx * 1.2, by + outer);
      b.quadraticCurveTo(nx, by - 0.6 - arch + (inner + outer) * 0.3, nx + nrx * 1.25, by + inner);
      b.moveTo(fx - frx * 0.9, by + inner * 0.9 + 0.1);
      b.quadraticCurveTo(fx + frx * 0.3, by - 0.3 - arch, fx + frx * 1.3, by + outer * 0.6 - 0.1);
    }
  }
  // --- mouth
  const [m0x, m0y, m1x, m1y] = F.m;
  const ml = out.mouthLine;
  switch (ex) {
    case 'grit': {
      const t = P2(); rrect(t, m0x - 0.4, m0y - 1.1, m1x - m0x + 0.6, 2.4, 0.7);
      out.teeth = t;
      ml.moveTo(m0x - 0.2, m0y + 0.1); ml.lineTo(m1x + 0.1, m1y + 0.1);
      ml.moveTo(m0x + 1.1, m0y - 1); ml.lineTo(m0x + 1.1, m0y + 1.2);
      ml.moveTo(m0x + 2.3, m0y - 1.1); ml.lineTo(m0x + 2.3, m0y + 1.1);
      break;
    }
    case 'shout': case 'scared': {
      const d = P2();
      const big = ex === 'shout' ? 1 : 0.7;
      d.moveTo(m0x - 0.5, m0y - 0.6);
      d.lineTo(m1x + 0.3, m1y - 0.8);
      d.quadraticCurveTo(m1x + 0.2, m1y + 3.6 * big, m1x - 1, m1y + 3.8 * big);
      d.quadraticCurveTo(m0x + 0.2, m0y + 3.4 * big, m0x - 0.5, m0y - 0.6);
      d.closePath();
      out.mouthDark = d;
      const t = P2(); t.rect(m0x - 0.2, m0y - 0.6, m1x - m0x + 0.3, 0.9);
      out.teeth = t;
      const tg = P2(); ellipse(tg, (m0x + m1x) / 2, m0y + 2.8 * big, 1.4, 0.8 * big);
      out.tongue = tg;
      break;
    }
    case 'pain': {
      const d = P2();
      d.moveTo(m0x - 0.3, m0y + 0.4); d.lineTo(m0x + 0.9, m0y - 0.5); d.lineTo(m0x + 1.9, m0y + 0.2); d.lineTo(m1x, m1y - 0.7);
      d.lineTo(m1x - 0.2, m1y + 1.8); d.lineTo(m0x + 0.4, m0y + 1.6); d.closePath();
      out.mouthDark = d;
      break;
    }
    case 'surp': {
      const d = P2(); ellipse(d, (m0x + m1x) / 2 + 0.4, m0y + 0.4, 0.95, 1.3);
      out.mouthDark = d;
      break;
    }
    case 'daze': {
      ml.moveTo(m0x, m0y); ml.quadraticCurveTo(m0x + 1, m0y + 0.8, m0x + 1.8, m0y + 0.1); ml.quadraticCurveTo(m1x - 0.5, m1y - 0.6, m1x, m1y + 0.3);
      const tg = P2(); ellipse(tg, m0x + 1.6, m0y + 1.1, 0.9, 1.1, 0.3);
      out.tongue = tg;
      break;
    }
    case 'focus': {
      ml.moveTo(m0x, m0y); ml.lineTo(m1x, m1y);
      const tg = P2(); ellipse(tg, m0x + 0.5, m0y + 0.9, 0.8, 1.0, -0.4);
      out.tongue = tg;
      break;
    }
    case 'smile': {
      const d = P2();
      d.moveTo(m0x - 0.6, m0y - 0.9); d.quadraticCurveTo((m0x + m1x) / 2, m0y - 0.2, m1x + 0.2, m1y - 1.0);
      d.quadraticCurveTo(m1x - 0.2, m1y + 2.6, (m0x + m1x) / 2, m0y + 2.4); d.quadraticCurveTo(m0x - 0.2, m0y + 1.4, m0x - 0.6, m0y - 0.9); d.closePath();
      out.mouthDark = d;
      const t = P2(); t.moveTo(m0x - 0.3, m0y - 0.8); t.quadraticCurveTo((m0x + m1x) / 2, m0y - 0.2, m1x, m1y - 0.9); t.lineTo(m1x - 0.2, m1y); t.quadraticCurveTo((m0x + m1x) / 2, m0y + 0.7, m0x, m0y); t.closePath();
      out.teeth = t;
      ml.moveTo(m0x - 1.2, m0y - 1.4); ml.quadraticCurveTo(m0x - 0.8, m0y - 0.6, m0x - 0.4, m0y - 0.8);
      break;
    }
    case 'sleep': ml.moveTo(m0x + 0.6, m0y); ml.quadraticCurveTo((m0x + m1x) / 2, m0y + 0.5, m1x, m1y); break;
    case 'calm': ml.moveTo(m0x, m0y - 0.3); ml.quadraticCurveTo((m0x + m1x) / 2, m0y + 0.6, m1x, m1y - 0.1); break;
    case 'mean': {
      ml.moveTo(m0x - 0.2, m0y - 0.7); ml.quadraticCurveTo(m0x + 1.4, m0y + 0.3, m1x, m1y + 0.2);
      ml.moveTo(m0x - 0.2, m0y - 0.7); ml.lineTo(m0x - 0.6, m0y - 1.2);
      break;
    }
    default: // det: confident set mouth with a smirking corner, lower-lip shadow
      ml.moveTo(m0x - 0.2, m0y - 0.2); ml.quadraticCurveTo((m0x + m1x) / 2, m0y + 0.5, m1x, m1y);
      ml.moveTo(m0x - 0.2, m0y - 0.2); ml.lineTo(m0x - 0.6, m0y - 0.7);
      ml.moveTo(m0x + 1.3, m0y + 1.7); ml.lineTo(m1x - 0.7, m1y + 1.6);
  }
  return out;
}

function spiral(p, x, y, r) {
  p.moveTo(x, y);
  for (let i = 1; i <= 14; i++) {
    const a = i * 0.9, rr = (i / 14) * r;
    p.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
}

function drawFace(P, m, look, style, ex, blink, kind, opt = {}) {
  const f = face(style, ex, blink, kind);
  if (f.whites) {
    const wc = opt.eyeCol || '#ffffff';
    P.fill(f.whites, wc, m);
    if (f.glow && !P.o.asleep && !P.o.noFill) {
      P.fn((ctx) => {
        ctx.save();
        ctx.globalAlpha *= 0.35;
        ctx.fillStyle = wc;
        ctx.beginPath();
        ctx.ellipse(FACE.hero.ne[0], FACE.hero.ne[1], 3.4, 2.4, 0, 0, TAU);
        ctx.ellipse(FACE.hero.fe[0], FACE.hero.fe[1], 1.8, 2.2, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }, m);
    }
    if (!f.glow) P.line(f.whites, 0.55, null, m);
  }
  if (f.pupils) P.fill(f.pupils, opt.pupil || INK, m);
  P.line(f.heavy, opt.browW || 1.05, opt.browCol || null, m);
  P.line(f.lines, 0.6, null, m);
  if (!opt.noMouth) {
    if (f.mouthDark) { P.fill(f.mouthDark, '#5a1414', m); P.line(f.mouthDark, 0.7, null, m); }
    if (f.tongue) { P.fill(f.tongue, '#e8506a', m); P.line(f.tongue, 0.5, null, m); }
    if (f.teeth) { P.fill(f.teeth, '#ffffff', m); P.line(f.teeth, 0.6, null, m); }
    P.line(f.mouthLine, 0.75, null, m);
  }
}

// ------------------------------------------------------ hair / hats

function heroHair() {
  return once('hair.hero', () => {
    const p = P2();
    p.moveTo(-6.0, 4.4);
    p.quadraticCurveTo(-9.4, 1.2, -9.1, -4.2);
    p.quadraticCurveTo(-8.8, -9.6, -3.6, -12.2);
    p.quadraticCurveTo(1.0, -14.9, 5.6, -14.4);
    p.quadraticCurveTo(9.6, -13.6, 9.9, -10.8);
    p.quadraticCurveTo(9.4, -8.6, 7.4, -8.6);
    p.quadraticCurveTo(6.4, -8.2, 5.4, -7.6);
    p.quadraticCurveTo(3.4, -6.6, 1.6, -6.4);
    p.quadraticCurveTo(0.2, -5.6, 0.2, -3.4);
    p.lineTo(-0.3, 1.2);
    p.lineTo(-1.2, 1.4);
    p.lineTo(-1.4, -1.9);
    p.quadraticCurveTo(-3.2, -2.9, -4.4, -1.4);
    p.quadraticCurveTo(-4.8, 1.8, -4.4, 3.4);
    p.quadraticCurveTo(-5.2, 4.4, -6.0, 4.4);
    p.closePath();
    const d = P2();
    d.moveTo(-7.4, -6.2); d.quadraticCurveTo(-3.6, -11.6, 3.2, -12.6);
    d.moveTo(-8.2, -1.8); d.quadraticCurveTo(-6.4, -8.2, -0.6, -10.2);
    d.moveTo(4.2, -12.0); d.quadraticCurveTo(7.8, -12.4, 8.6, -10.2);
    d.moveTo(1.2, -9.4); d.quadraticCurveTo(3.6, -10.2, 5.2, -9.0);
    return { p, d };
  });
}

function drawEar(P, m, skin) {
  const e = ear();
  P.layer(1.3);
  P.part(e.p, skin, { m, flat: true });
  P.line(e.d, 0.6, null, m);
}

// ------------------------------------------------------------- entry

// hf: head frame [a,b,c,d,e,f]. st: { ex, blink, asleep, t, detail }
export function drawHead(P, look, m, st, B) {
  const type = look.head || (look.body === 'robot' ? 'robot' : 'plain');
  const skin = look.skin || '#f0c29a';
  const ex = st.ex;
  const blink = st.blink;
  const lw = st.lw;
  const fem = B && B.fem;
  const kind = fem ? 'fem' : 'hero';
  const skinOpt = { m, c: [0.5, -0.5, 8.2], skin: true, hi: true, depth: 0.15 };
  switch (type) {
    case 'mask': {
      const h = heroHair();
      P.layer(lw);
      P.part(skull(kind), skin, skinOpt);
      P.part(h.p, look.hair || '#f5c542', { m, c: [0, -6, 8], hi: true });
      P.line(h.d, 0.7, null, m);
      drawEar(P, m, skin);
      // domino mask
      const mk = once('dom', () => {
        const p = P2();
        p.moveTo(-1.8, -3.5);
        p.quadraticCurveTo(0.8, -4.9, 3.4, -4.4);
        p.quadraticCurveTo(5.9, -3.9, 7.8, -2.5);
        p.lineTo(7.3, -1.2);
        p.quadraticCurveTo(8.0, -0.2, 7.9, 0.7);
        p.quadraticCurveTo(6.6, 1.3, 5.4, 0.5);
        p.quadraticCurveTo(4.6, 1.5, 3.0, 1.4);
        p.quadraticCurveTo(0.6, 1.3, -1.4, 0.2);
        p.lineTo(-1.6, -0.6);
        p.lineTo(-0.6, -1.9);
        p.lineTo(-1.8, -3.5);
        p.closePath();
        return p;
      });
      P.layer(1.1);
      P.part(mk, look.mask || '#1f5fd1', { m, c: [2.5, -1.5, 4] });
      drawFace(P, m, look, 'lens', ex, blink, kind);
      break;
    }
    case 'cowl': {
      P.layer(lw);
      P.part(skull(kind), look.mask || '#1b1d2a', skinOpt);
      const ears = once('cowlears', () => { const p = P2(); poly(p, [-5.6, -7.2, -5.2, -15.5, -2.2, -8.8]); poly(p, [1.2, -8.8, 3.6, -15.2, 5.2, -7.6]); return p; });
      P.part(ears, look.mask || '#1b1d2a', { m });
      const jaw = once('cowljaw', () => { const p = P2(); p.moveTo(1.2, 2.6); p.lineTo(7.0, 2.3); p.lineTo(7.35, 3.3); p.lineTo(7.0, 4.1); p.lineTo(7.35, 5.1); p.quadraticCurveTo(7.5, 6.4, 7.0, 7.2); p.quadraticCurveTo(6.3, 8.3, 4.4, 8.2); p.quadraticCurveTo(1.4, 7.9, -0.4, 6.4); p.closePath(); return p; });
      P.fill(jaw, skin, m); P.line(jaw, 0.8, null, m);
      drawFace(P, m, look, 'lens', ex, blink, kind);
      break;
    }
    case 'hood': {
      const hood = once('hood', () => {
        const p = P2();
        p.moveTo(3.6, 9.2);
        p.quadraticCurveTo(-4, 10.8, -8.4, 6.4);
        p.quadraticCurveTo(-11.2, 1.0, -10.2, -5.6);
        p.quadraticCurveTo(-12.6, -9.6, -17.5, -10.8);
        p.quadraticCurveTo(-11.6, -13.2, -6.6, -11.6);
        p.quadraticCurveTo(0.8, -15.4, 6.6, -9.8);
        p.quadraticCurveTo(9.8, -6.4, 9.4, -1.6);
        p.lineTo(7.4, -2.4);
        p.quadraticCurveTo(7.0, -6.6, 3.2, -7.2);
        p.quadraticCurveTo(-0.6, -7.2, -0.8, -2.6);
        p.quadraticCurveTo(-1.2, 3.8, 3.6, 9.2);
        p.closePath();
        const shadowFace = P2();
        shadowFace.moveTo(-0.6, -2.2); shadowFace.quadraticCurveTo(-0.6, -7.0, 3.2, -7.0); shadowFace.quadraticCurveTo(7.0, -6.4, 7.6, -2.2);
        shadowFace.lineTo(7.2, -0.9); shadowFace.lineTo(8.9, 1.3); shadowFace.lineTo(7.8, 1.9);
        shadowFace.quadraticCurveTo(4.0, 1.2, 0.2, 2.6); shadowFace.closePath();
        const d = P2(); d.moveTo(-9.6, -4.6); d.quadraticCurveTo(-7.8, 2.8, -3.4, 7.8); d.moveTo(-6, -11); d.quadraticCurveTo(-2, -12.6, 2.6, -11.4);
        return { p, shadowFace, d };
      });
      P.layer(lw);
      P.part(skull(kind), skin, skinOpt);
      P.fill(hood.shadowFace, look.mask === '#2b1a3a' ? '#140a1c' : '#0d0f2a', m);
      drawFace(P, m, look, 'glow', ex, blink, kind, { eyeCol: look.suit2 || '#23d5e8', noMouth: false });
      P.layer(lw);
      P.part(hood.p, look.mask || '#161843', { m, c: [-2, -2, 10], hi: true });
      P.line(hood.d, 0.8, null, m);
      break;
    }
    case 'goggles': {
      const hair = once('hair.vix', () => {
        const p = P2();
        p.moveTo(-6.6, 6.4);
        p.quadraticCurveTo(-11.2, 1.6, -9.6, -6.4);
        p.lineTo(-11.6, -9.2); p.lineTo(-8.2, -9.4);
        p.quadraticCurveTo(-4.8, -13.8, 1.0, -13.0);
        p.quadraticCurveTo(7.4, -12.2, 9.2, -6.8);
        p.lineTo(7.4, -6.8); p.lineTo(8.6, -3.6);
        p.lineTo(6.0, -5.2); p.lineTo(5.8, -2.6);
        p.lineTo(3.8, -5.0); p.lineTo(2.2, -3.4);
        p.lineTo(1.4, -5.4);
        p.quadraticCurveTo(-0.4, -3.4, -0.4, 0.2);
        p.quadraticCurveTo(-1.6, 3.6, -2.4, 6.8);
        p.quadraticCurveTo(-4.4, 7.4, -6.6, 6.4);
        p.closePath();
        const d = P2();
        d.moveTo(-7.4, -5.8); d.quadraticCurveTo(-2.6, -10.8, 3.6, -9.8);
        d.moveTo(-9.0, -0.8); d.quadraticCurveTo(-7.6, -7.2, -2.0, -9.2);
        d.moveTo(-6.4, 4.4); d.quadraticCurveTo(-8.2, -0.6, -5.4, -4.8);
        return { p, d };
      });
      const gg = once('goggles.up', () => {
        const strap = P2(); strap.moveTo(-9.2, -8.6); strap.quadraticCurveTo(-2, -12.2, 3.6, -11.2); strap.lineTo(3.8, -8.8); strap.quadraticCurveTo(-2, -9.8, -9.4, -6.2); strap.closePath();
        const l1 = P2(); ellipse(l1, 4.6, -10.2, 2.7, 2.3, -0.3);
        const l2 = P2(); ellipse(l2, 8.2, -9.6, 1.3, 2.0, -0.3);
        const rim = P2(); ellipse(rim, 4.6, -10.2, 2.7, 2.3, -0.3); ellipse(rim, 8.2, -9.6, 1.3, 2.0, -0.3);
        const gl = P2(); gl.moveTo(3.4, -11.4); gl.lineTo(4.6, -11.9); gl.moveTo(7.8, -11.0); gl.lineTo(8.3, -11.2);
        const lash = P2(); lash.moveTo(1.8, -1.8); lash.lineTo(1.1, -2.6); lash.moveTo(2.4, -2.2); lash.lineTo(2.0, -3.0);
        return { strap, l1, l2, rim, gl, lash };
      });
      P.layer(lw);
      P.part(skull('fem'), skin, skinOpt);
      drawFace(P, m, look, 'eye', ex, blink, 'fem', { noMouth: false });
      if (!blink && ex !== 'pain' && ex !== 'sleep') P.line(gg.lash, 0.7, null, m);
      if (ex === 'det' || ex === 'calm' || ex === 'mean' || ex === 'focus') {
        const lips = once('lips', () => { const p = P2(); p.moveTo(4.8, 4.1); p.quadraticCurveTo(5.9, 3.6, 6.7, 3.9); p.quadraticCurveTo(6.5, 4.8, 5.6, 4.8); p.quadraticCurveTo(5.0, 4.7, 4.8, 4.1); p.closePath(); return p; });
        P.fill(lips, '#c8283a', m);
      }
      P.layer(lw);
      P.part(hair.p, look.hair || '#e8262b', { m, c: [-1, -4, 8], hi: true });
      P.line(hair.d, 0.7, null, m);
      P.fill(gg.strap, '#1b1b1b', m);
      P.layer(1.3);
      P.part(gg.l1, '#9fe8f2', { m, c: [4.6, -10.2, 2.5], hi: true });
      P.part(gg.l2, '#9fe8f2', { m });
      P.line(gg.rim, 0.9, '#ffd23f', m);
      P.line(gg.gl, 0.8, '#ffffff', m);
      break;
    }
    case 'helmet': {
      const hel = once('helmet', () => {
        const p = P2();
        p.moveTo(-6.4, 6.0);
        p.quadraticCurveTo(-9.6, 1.0, -8.2, -5.6);
        p.quadraticCurveTo(-6.2, -11.4, 0.4, -11.0);
        p.quadraticCurveTo(7.6, -10.6, 8.8, -4.0);
        p.lineTo(9.2, 0.8);
        p.lineTo(7.6, 1.8);
        p.lineTo(3.2, 2.2);
        p.quadraticCurveTo(0.8, 4.6, 1.4, 8.4);
        p.lineTo(-2.4, 8.2);
        p.quadraticCurveTo(-4.8, 7.6, -6.4, 6.0);
        p.closePath();
        const vis = P2(); vis.moveTo(0.4, -4.2); vis.quadraticCurveTo(5, -5.2, 9.2, -4.0); vis.lineTo(9.3, -0.4); vis.quadraticCurveTo(5, -0.6, 0.8, 0.2); vis.closePath();
        const crest = P2();
        // kuwagata: two horns sweeping up and out from a forehead plate
        crest.moveTo(1.2, -9.6); crest.quadraticCurveTo(-3.6, -13, -5.2, -19.6); crest.quadraticCurveTo(-1.4, -15.6, 2.4, -12.4);
        crest.quadraticCurveTo(7.4, -15.4, 11.8, -18.2); crest.quadraticCurveTo(9.6, -12.4, 4.4, -9.4); crest.closePath();
        const plate = P2(); ellipse(plate, 2.8, -10.2, 2.6, 1.9, -0.2);
        const d = P2(); d.moveTo(-7.6, -2.2); d.quadraticCurveTo(-4, -2.8, 0.2, -2.2); d.moveTo(-2, 1.2); d.quadraticCurveTo(-4, 4.6, -3.4, 7.8);
        d.moveTo(-5.2, -8.0); d.quadraticCurveTo(-1.6, -10.4, 3.6, -10.0);
        return { p, vis, crest, plate, d };
      });
      P.layer(lw);
      P.part(skull(kind), skin, skinOpt);
      P.part(hel.p, look.suit || '#2fa84f', { m, c: [0, -2, 9], hi: true });
      P.part(hel.crest, '#ffd23f', { m, c: [3, -14, 5], hi: true });
      P.fill(hel.plate, look.suit2 || '#b8171b', m); P.line(hel.plate, 0.7, null, m);
      P.line(hel.d, 0.8, null, m);
      P.layer(1.2);
      P.part(hel.vis, look.visor || '#ffe14a', { m, c: [5, -2, 3], hi: true });
      if (!P.o.asleep && !P.o.noFill) {
        P.fn((ctx, Pp) => {
          ctx.save();
          ctx.globalAlpha *= 0.3 + 0.1 * Math.sin(st.t * 5);
          ctx.fillStyle = Pp.col(look.visor || '#ffe14a');
          ctx.beginPath(); ctx.ellipse(5.5, -2.2, 7, 3.6, 0, 0, TAU); ctx.fill();
          ctx.restore();
        }, m);
      }
      // mouth below the helmet
      const f = face('none', ex, blink, kind);
      if (f.mouthDark) { P.fill(f.mouthDark, '#5a1414', m); P.line(f.mouthDark, 0.7, null, m); }
      if (f.teeth) { P.fill(f.teeth, '#ffffff', m); P.line(f.teeth, 0.6, null, m); }
      P.line(f.mouthLine, 0.75, null, m);
      const gl = once('helgl', () => { const p = P2(); p.moveTo(2.4, -3.2); p.lineTo(6.2, -3.6); return p; });
      P.line(gl, 0.9, '#ffffff', m);
      break;
    }
    case 'fedora': {
      const hat = once('fedora', () => {
        const brim = P2();
        brim.moveTo(-10.6, -4.8); brim.quadraticCurveTo(0, -7.2, 13.2, -5.6); brim.quadraticCurveTo(12.4, -3.4, 8.4, -3.6);
        brim.quadraticCurveTo(0, -4.2, -10.6, -4.8); brim.closePath();
        const crown = P2();
        crown.moveTo(-7.4, -5.6); crown.quadraticCurveTo(-8.4, -13.2, -3.0, -13.6); crown.lineTo(0.2, -11.6); crown.lineTo(3.4, -13.8);
        crown.quadraticCurveTo(8.6, -13.2, 7.8, -5.6); crown.closePath();
        const band = P2(); band.moveTo(-7.6, -6.2); band.quadraticCurveTo(0, -8.4, 7.9, -6.6); band.lineTo(7.8, -8.4); band.quadraticCurveTo(0, -10, -7.8, -8.2); band.closePath();
        const shade = P2(); shade.moveTo(-0.6, -4.2); shade.quadraticCurveTo(4, -4.8, 8.4, -3.8); shade.lineTo(8.2, -0.2); shade.quadraticCurveTo(4, 0.4, 0.2, 0.6); shade.closePath();
        const crease = P2(); crease.moveTo(-3, -13.2); crease.quadraticCurveTo(0, -10.6, 3.2, -13.4);
        return { brim, crown, band, shade, crease };
      });
      P.layer(lw);
      P.part(skull('goon'), skin, skinOpt);
      drawEar(P, m, skin);
      stubble(P, m);
      drawFace(P, m, look, 'eye', ex, blink, 'goon');
      P.fill(hat.shade, '#141414', m, true);
      if (!blink && ex !== 'pain' && ex !== 'sleep') {
        const gl = once('fedgl', () => { const p = P2(); p.moveTo(2.8, -1.5); p.lineTo(4.8, -1.8); p.moveTo(6.6, -1.7); p.lineTo(7.4, -1.8); return p; });
        P.line(gl, 1.1, '#ffffff', m);
      }
      if (look.extra === 'cigar' && !P.o.asleep) cigar(P, m, st.t);
      P.layer(lw);
      P.part(hat.brim, look.hat || '#5a4632', { m, c: [1, -5, 5] });
      P.part(hat.crown, look.hat || '#5a4632', { m, c: [0, -9, 6], hi: true });
      P.fill(hat.band, look.torso === 'suit' && look.suit2 ? look.suit2 : '#1b1b1b', m);
      P.line(hat.band, 0.7, null, m);
      P.line(hat.crease, 0.7, null, m);
      break;
    }
    case 'bubble': {
      const hair = once('hair.kid', () => {
        const p = P2();
        p.moveTo(-6.4, 2.6);
        p.quadraticCurveTo(-10, -4, -6.8, -9);
        p.quadraticCurveTo(-2, -12.8, 4, -10.8);
        p.quadraticCurveTo(8.6, -9.2, 7.8, -5);
        p.lineTo(5.8, -6.6); p.lineTo(5.0, -4.6); p.lineTo(3.4, -6.8); p.lineTo(1.4, -4.6); p.lineTo(0.4, -6.4);
        p.quadraticCurveTo(-1.2, -3, -1.6, 1.4);
        p.quadraticCurveTo(-4, 3.6, -6.4, 2.6);
        p.closePath();
        const tuft = P2(); tuft.moveTo(-1, -10.8); tuft.quadraticCurveTo(-1.6, -14.6, 2.6, -15.2); tuft.quadraticCurveTo(0.6, -13.4, 1.8, -11.2); tuft.closePath();
        return { p, tuft };
      });
      P.layer(lw);
      P.part(skull('kid'), skin, skinOpt);
      P.part(hair.p, look.hair || '#6b3b1f', { m, c: [0, -5, 7], hi: true });
      P.part(hair.tuft, look.hair || '#6b3b1f', { m });
      drawEar(P, m, skin);
      drawFace(P, m, look, 'eye', ex, blink, 'kid');
      const fr = once('freck', () => { const p = P2(); for (const [x, y] of [[2.6, 1.8], [3.6, 2.4], [4.6, 1.9], [7.2, 1.6]]) circle(p, x, y, 0.35); return p; });
      P.fill(fr, '#c0703a', m);
      // collar + glass bowl
      const bowl = once('bowl', () => {
        const g = P2(); circle(g, 0.6, -1.2, 13.4);
        const hl = P2(); hl.arc(0.6, -1.2, 11, -2.7, -1.75);
        const hl2 = P2(); hl2.arc(0.6, -1.2, 11, 0.5, 0.75);
        const ring = P2(); rrect(ring, -9.5, 9.8, 20, 4.6, 2);
        return { g, hl, hl2, ring };
      });
      P.fn((ctx, Pp) => {
        if (Pp.o.noFill) return;
        ctx.save(); ctx.globalAlpha *= 0.22; ctx.fillStyle = Pp.col('#bfeaff'); ctx.fill(bowl.g); ctx.restore();
      }, m);
      P.line(bowl.g, 1.6, null, m);
      P.line(bowl.hl, 1.6, '#ffffff', m);
      P.line(bowl.hl2, 1.2, '#ffffff', m);
      P.layer(1.5);
      P.part(bowl.ring, look.suit2 || '#ff7a1a', { m, c: [0.5, 12, 3], hi: true });
      break;
    }
    case 'beanie': {
      const cap = once('beanie', () => {
        const p = P2(); p.moveTo(-8.2, -2.6); p.quadraticCurveTo(-9.4, -12.8, -0.6, -13.2); p.quadraticCurveTo(8.2, -13, 8.0, -4.6); p.closePath();
        const cuff = P2(); cuff.moveTo(-8.6, -5.8); cuff.quadraticCurveTo(0, -7.6, 8.4, -6.2); cuff.lineTo(8.2, -3.4); cuff.quadraticCurveTo(0, -4.6, -8.4, -2.6); cuff.closePath();
        const rib = P2(); for (let i = -3; i <= 3; i++) { rib.moveTo(i * 2.2 + 0.4, -6.4); rib.lineTo(i * 2.2 + 0.2, -3.8); }
        const pom = P2(); circle(pom, -1.5, -13.6, 2.4);
        return { p, cuff, rib, pom };
      });
      P.layer(lw);
      P.part(skull('goon'), skin, skinOpt);
      drawEar(P, m, skin);
      stubble(P, m);
      const mk = once('dom.goon', () => {
        const p = P2(); p.moveTo(-1.4, -2.8); p.quadraticCurveTo(3, -3.6, 8.0, -2.6); p.lineTo(7.4, 0.6); p.quadraticCurveTo(4, 1.2, 0.6, 0.6); p.lineTo(-2.4, -0.8); p.closePath(); return p;
      });
      P.fill(mk, look.mask || '#141414', m);
      drawFace(P, m, look, 'eye', ex, blink, 'goon');
      P.layer(lw);
      P.part(cap.p, look.hat || '#2d2f3a', { m, c: [0, -8, 7], hi: true });
      P.part(cap.pom, look.hat || '#2d2f3a', { m });
      P.part(cap.cuff, look.hat || '#2d2f3a', { m, sh: '#000000', c: [0, -4.8, 3], thin: 0.7 });
      P.line(cap.rib, 0.6, null, m);
      break;
    }
    case 'visor': {
      const hel = once('visor', () => {
        const p = P2(); p.moveTo(-7.6, 5.4); p.quadraticCurveTo(-9.8, -4, -6, -9.4); p.quadraticCurveTo(0, -12.6, 6.6, -8.6); p.quadraticCurveTo(9.6, -5.4, 9.4, 0.6); p.lineTo(8.8, 2.6); p.lineTo(2.4, 3.0); p.quadraticCurveTo(0.2, 5.6, 0.4, 8.6); p.lineTo(-3.4, 8.2); p.closePath();
        const vis = P2(); vis.moveTo(0.6, -4.8); vis.quadraticCurveTo(5.4, -6.0, 9.5, -4.2); vis.lineTo(9.4, 0.4); vis.quadraticCurveTo(5, 0.0, 1.0, 0.8); vis.closePath();
        const strap = P2(); strap.moveTo(0.8, 3.2); strap.quadraticCurveTo(1.6, 7, 4.8, 8.2);
        const ridge = P2(); ridge.moveTo(-7.4, -2); ridge.quadraticCurveTo(-3, -9.8, 4.4, -9.6);
        return { p, vis, strap, ridge };
      });
      P.layer(lw);
      P.part(skull('hero'), skin, skinOpt);
      P.part(hel.p, look.hat || look.suit || '#7b3fb8', { m, c: [0, -2, 9], hi: true });
      P.line(hel.ridge, 0.8, null, m);
      P.layer(1.2);
      P.part(hel.vis, '#16161e', { m, flat: true });
      P.fn((ctx, Pp) => {
        if (Pp.o.noFill) return;
        ctx.strokeStyle = Pp.o.asleep ? '#bbbbbb' : Pp.col(look.suit2 || '#ff7a1a');
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(2.6, -2.4); ctx.quadraticCurveTo(6, -3, 8.8, -2.2); ctx.stroke();
      }, m);
      const f = face('none', ex, blink, 'hero');
      if (f.mouthDark) { P.fill(f.mouthDark, '#5a1414', m); P.line(f.mouthDark, 0.7, null, m); }
      if (f.teeth) { P.fill(f.teeth, '#ffffff', m); P.line(f.teeth, 0.6, null, m); }
      P.line(f.mouthLine, 0.75, null, m);
      P.line(hel.strap, 0.9, null, m);
      break;
    }
    case 'zombie': {
      const z = once('zombie', () => {
        const hair = P2(); hair.moveTo(-7.2, -2); hair.lineTo(-9.8, -6.6); hair.lineTo(-6.6, -6.2); hair.lineTo(-7.4, -11); hair.lineTo(-3.6, -8.2); hair.lineTo(-1.6, -12.2); hair.lineTo(0.6, -8.6); hair.lineTo(3.6, -10.8); hair.lineTo(3.4, -7.6); hair.quadraticCurveTo(-2, -8.6, -7.2, -2); hair.closePath();
        const socket = P2(); ellipse(socket, 3.4, -0.9, 2.3, 2.0, 0.2);
        const stitch = P2(); stitch.moveTo(-5, -6.4); stitch.lineTo(-0.6, -4.2); for (let i = 0; i < 3; i++) { stitch.moveTo(-4.4 + i * 1.5, -6.9 + i * 0.7); stitch.lineTo(-3.6 + i * 1.5, -4.8 + i * 0.7); }
        const jaw = P2(); jaw.moveTo(4.2, 3.4); jaw.lineTo(8.4, 2.6); jaw.lineTo(8.0, 7.4); jaw.lineTo(4.6, 6.8); jaw.closePath();
        const teeth = P2(); for (let i = 0; i < 3; i++) { teeth.rect(4.8 + i * 1.2, 3.3 - i * 0.2, 0.9, 1.4); teeth.rect(5.0 + i * 1.1, 5.8 - i * 0.1, 0.8, 1.2); }
        return { hair, socket, stitch, jaw, teeth };
      });
      P.layer(lw);
      P.part(skull('goon'), skin, skinOpt);
      P.part(z.hair, look.hair || '#3a2e22', { m });
      drawEar(P, m, skin);
      P.fill(z.socket, '#2a3320', m, true);
      if (!P.o.asleep && !blink) {
        const pu = once('zpu', () => { const p = P2(); circle(p, 3.9, -0.8, 0.9); circle(p, 7.2, -0.9, 0.55); return p; });
        P.fill(pu, '#fff36b', m);
      }
      const brow = once('zbrow', () => { const p = P2(); p.moveTo(1.2, -3.4); p.lineTo(5.6, -2.2); p.moveTo(6.2, -2.4); p.lineTo(7.8, -3.2); return p; });
      P.line(brow, 1.1, null, m);
      P.fill(z.jaw, '#3a0d0d', m); P.line(z.jaw, 0.8, null, m);
      P.fill(z.teeth, '#f0ead0', m);
      P.line(z.stitch, 0.7, null, m);
      break;
    }
    case 'crown': {
      const k = once('crownk', () => {
        const beard = P2(); beard.moveTo(-2.2, 3.6); beard.quadraticCurveTo(3, 4.6, 8.4, 3.4); beard.lineTo(7.4, 10); beard.lineTo(5.4, 8.2); beard.lineTo(3.8, 14.2); beard.lineTo(1.8, 9.4); beard.lineTo(-0.6, 11.6); beard.quadraticCurveTo(-1.4, 7, -2.2, 3.6); beard.closePath();
        const crown = P2(); crown.moveTo(-7.6, -6.6); crown.lineTo(-8.6, -15.4); crown.lineTo(-4.8, -11.2); crown.lineTo(-1.8, -18.4); crown.lineTo(1.4, -11.4); crown.lineTo(4.8, -17.0); crown.lineTo(6.2, -10.4); crown.lineTo(8.6, -14.6); crown.lineTo(8.2, -5.8); crown.quadraticCurveTo(0, -8.4, -7.6, -6.6); crown.closePath();
        const gems = P2(); circle(gems, -1.4, -9.2, 1.4); circle(gems, 4.6, -8.6, 1.1); circle(gems, -5.6, -8.8, 1.0);
        const sockets = P2(); ellipse(sockets, 3.4, -0.9, 2.0, 1.7); ellipse(sockets, 7.0, -1.0, 0.9, 1.5);
        const eyes = P2(); circle(eyes, 3.9, -0.9, 0.8); circle(eyes, 7.2, -1.0, 0.55);
        const mo = P2(); mo.moveTo(4.2, 4.4); mo.lineTo(7.4, 4.0);
        return { beard, crown, gems, sockets, eyes, mo };
      });
      P.layer(lw);
      P.part(skull('goon'), skin, skinOpt);
      drawEar(P, m, skin);
      P.fill(k.sockets, '#1b1b1b', m, true);
      if (!P.o.asleep) P.fill(k.eyes, '#ff3030', m, true);
      const brow = once('kbrow', () => { const p = P2(); p.moveTo(1.2, -3.2); p.lineTo(5.4, -2.2); p.moveTo(6.2, -2.3); p.lineTo(8, -3.3); return p; });
      P.line(brow, 1.2, null, m);
      P.layer(lw);
      P.part(k.beard, look.hair || '#e8e2c8', { m, c: [3, 7, 5], hi: true });
      P.line(k.mo, 0.9, null, m);
      P.layer(lw);
      P.part(k.crown, '#ffd23f', { m, c: [0, -10, 7], hi: true });
      P.fill(k.gems, '#e8262b', m); P.line(k.gems, 0.6, null, m);
      break;
    }
    case 'alien': {
      const a = once('alien', () => {
        const h = P2(); h.moveTo(-5.2, 6.2); h.quadraticCurveTo(-11.6, 0, -10.4, -9); h.quadraticCurveTo(-7.6, -17.4, 1.6, -16.6); h.quadraticCurveTo(10.6, -15, 10.4, -5.6); h.quadraticCurveTo(10.2, 1.4, 7.2, 5.4); h.quadraticCurveTo(4.6, 8.6, 1.2, 8.4); h.quadraticCurveTo(-2.4, 8.2, -5.2, 6.2); h.closePath();
        const ant = P2(); ant.moveTo(-3.8, -15.8); ant.quadraticCurveTo(-7.4, -21.6, -4.2, -24.4); ant.moveTo(3.6, -16); ant.quadraticCurveTo(6.4, -22.4, 10.8, -22.6);
        const bulbs = P2(); circle(bulbs, -4.2, -24.4, 1.9); circle(bulbs, 10.8, -22.6, 1.9);
        const eyes = P2(); ellipse(eyes, 3.2, -4.8, 3.2, 3.9, 0.35); ellipse(eyes, 8.6, -4.6, 1.6, 3.4, 0.25); ellipse(eyes, 5.6, -11.2, 1.8, 1.6, 0);
        const glints = P2(); circle(glints, 4.2, -6.2, 1.0); circle(glints, 9.0, -6.0, 0.6); circle(glints, 6.2, -11.8, 0.55);
        const mo = P2(); mo.moveTo(3.6, 3.8); mo.quadraticCurveTo(6, 5.2, 8.4, 3.2);
        const fangs = P2(); poly(fangs, [4.4, 4.3, 5.1, 6.0, 5.6, 4.7]); poly(fangs, [6.6, 4.5, 7.2, 5.8, 7.6, 4.2]);
        return { h, ant, bulbs, eyes, glints, mo, fangs };
      });
      P.layer(lw);
      P.part(a.h, skin, { m, c: [0, -4, 10], skin: true, hi: true });
      P.line(a.ant, 1.4, null, m);
      P.fill(a.bulbs, look.suit2 || '#23d5e8', m); P.line(a.bulbs, 0.8, null, m);
      P.fill(a.eyes, '#141414', m, true);
      if (!blink) P.fill(a.glints, '#ffffff', m, true);
      P.fill(a.fangs, '#ffffff', m); P.line(a.fangs, 0.5, null, m);
      P.line(a.mo, 0.9, null, m);
      break;
    }
    case 'dome': {
      const d = once('dome', () => {
        const h = P2(); h.moveTo(-5.4, 6.6); h.quadraticCurveTo(-8.8, -1, -6.6, -7); h.quadraticCurveTo(-3, -12, 2.6, -10.6); h.quadraticCurveTo(8.4, -8.6, 8.2, -1.6); h.quadraticCurveTo(7.8, 5.4, 2.4, 7.4); h.quadraticCurveTo(-1.8, 8.4, -5.4, 6.6); h.closePath();
        const eyes = P2(); ellipse(eyes, 2.6, -2.2, 2.4, 3.2, 0.25); ellipse(eyes, 7.0, -2.0, 1.2, 2.8, 0.2);
        const gl = P2(); circle(gl, 3.2, -3.6, 0.8); circle(gl, 7.2, -3.4, 0.45);
        const mo = P2(); mo.moveTo(3.2, 3.6); mo.quadraticCurveTo(5.4, 4.8, 7.2, 3.2);
        const glass = P2(); circle(glass, 0.8, -2.4, 12.6);
        const hl = P2(); hl.arc(0.8, -2.4, 10.2, -2.7, -1.8);
        const ring = P2(); rrect(ring, -9.6, 8.6, 21, 4.4, 2);
        return { h, eyes, gl, mo, glass, hl, ring };
      });
      P.layer(lw);
      P.part(d.h, skin, { m, c: [1, -2, 8], skin: true, hi: true });
      P.fill(d.eyes, '#141414', m, true);
      if (!blink) P.fill(d.gl, '#ffffff', m, true);
      P.line(d.mo, 0.9, null, m);
      P.fn((ctx, Pp) => { if (Pp.o.noFill) return; ctx.save(); ctx.globalAlpha *= 0.25; ctx.fillStyle = Pp.col('#c8f0ff'); ctx.fill(d.glass); ctx.restore(); }, m);
      P.line(d.glass, 1.5, null, m);
      P.line(d.hl, 1.5, '#ffffff', m);
      P.layer(1.5);
      P.part(d.ring, look.suit2 || '#ff3fa4', { m, c: [1, 10.8, 3], hi: true });
      break;
    }
    case 'flatcap': {
      const c = once('flatcap', () => {
        const p = P2(); p.moveTo(-8.4, -3.4); p.quadraticCurveTo(-8.8, -11.4, -0.4, -11.4); p.quadraticCurveTo(7.4, -11.2, 12.4, -5.4); p.quadraticCurveTo(10.4, -3.8, 7.6, -4.2); p.quadraticCurveTo(0, -5.4, -8.4, -3.4); p.closePath();
        const seam = P2(); seam.moveTo(-2, -11.2); seam.quadraticCurveTo(4, -8.6, 7.8, -4.6);
        const scar = P2(); scar.moveTo(1.8, -4.0); scar.lineTo(4.4, 1.0); scar.moveTo(2.2, -2.6); scar.lineTo(3.6, -3.0); scar.moveTo(3.0, -0.8); scar.lineTo(4.2, -1.2);
        return { p, seam, scar };
      });
      P.layer(lw);
      P.part(skull('goon'), skin, skinOpt);
      drawEar(P, m, skin);
      stubble(P, m);
      drawFace(P, m, look, 'eye', ex, blink, 'goon');
      P.line(c.scar, 0.7, '#9a2020', m);
      P.layer(lw);
      P.part(c.p, look.hat || '#2a2a2a', { m, c: [1, -7, 6], hi: true });
      P.line(c.seam, 0.7, null, m);
      break;
    }
    case 'bald': {
      const b = once('bald', () => {
        const sh = P2(); sh.moveTo(0.2, -2.8); sh.lineTo(9.2, -2.6); sh.lineTo(8.8, -0.2); sh.quadraticCurveTo(6.4, 0.8, 5.2, -0.8); sh.quadraticCurveTo(3.6, 0.8, 1.2, -0.2); sh.closePath();
        const gl = P2(); gl.moveTo(2.2, -1.8); gl.lineTo(4, -1.8);
        const shine = P2(); shine.arc(-0.6, -2.4, 5.8, -2.5, -1.7);
        const mo = P2(); mo.moveTo(4.4, 4.6); mo.lineTo(7.6, 4.2);
        return { sh, gl, shine, mo };
      });
      P.layer(lw);
      P.part(skull('goon'), skin, skinOpt);
      drawEar(P, m, skin);
      stubble(P, m);
      P.fill(b.sh, '#141414', m, true);
      P.line(b.gl, 0.9, '#ffffff', m);
      P.line(b.shine, 1.2, '#ffffff', m);
      if (ex === 'grit' || ex === 'shout' || ex === 'pain' || ex === 'daze') drawFace(P, m, look, 'none', ex, blink, 'goon');
      else P.line(b.mo, 0.9, null, m);
      break;
    }
    case 'brain': {
      const b = once('brain', () => {
        const br = P2(); br.moveTo(-8.4, -4.2); br.quadraticCurveTo(-11, -12.4, -3.6, -15.4); br.quadraticCurveTo(0, -18.2, 4.4, -15.8); br.quadraticCurveTo(10.8, -14.2, 8.8, -5.4); br.quadraticCurveTo(0, -3.4, -8.4, -4.2); br.closePath();
        const folds = P2(); folds.moveTo(-8, -9.4); folds.quadraticCurveTo(-5, -13.6, -2.4, -9.6); folds.quadraticCurveTo(0.4, -6.6, 2.6, -11); folds.quadraticCurveTo(4.8, -14.6, 7.8, -10);
        folds.moveTo(-5, -14.6); folds.quadraticCurveTo(-2.4, -12.4, 0, -15.6); folds.moveTo(-6, -6.4); folds.quadraticCurveTo(-3, -8, -1, -5.6);
        const glass = P2(); ellipse(glass, 0.2, -9.6, 12.2, 9.4);
        const hl = P2(); hl.ellipse(0.2, -9.6, 9.6, 7, 0, -2.7, -1.8);
        const mono = P2(); circle(mono, 3.5, -0.9, 2.4);
        return { br, folds, glass, hl, mono };
      });
      P.layer(lw);
      P.part(skull('goon'), skin, skinOpt);
      drawEar(P, m, skin);
      drawFace(P, m, look, 'eye', ex === 'det' ? 'mean' : ex, blink, 'goon');
      P.line(b.mono, 1.1, look.suit2 || '#1fb4c8', m);
      P.layer(lw);
      P.part(b.br, '#f7a8c8', { m, c: [0, -10, 7], hi: true });
      P.line(b.folds, 0.8, '#9a3a5a', m);
      P.fn((ctx, Pp) => { if (Pp.o.noFill) return; ctx.save(); ctx.globalAlpha *= 0.22; ctx.fillStyle = Pp.col('#c8f0ff'); ctx.fill(b.glass); ctx.restore(); }, m);
      P.line(b.glass, 1.4, null, m);
      P.line(b.hl, 1.4, '#ffffff', m);
      break;
    }
    case 'beret': {
      const b = once('beret', () => {
        const p = P2(); p.moveTo(-8.8, -5.2); p.quadraticCurveTo(-10.8, -12.6, -2.4, -13.6); p.quadraticCurveTo(7.6, -14.2, 9.4, -8.2); p.quadraticCurveTo(8, -5.6, 3.6, -6.2); p.quadraticCurveTo(-3, -6.8, -8.8, -5.2); p.closePath();
        const stem = P2(); stem.moveTo(-1.6, -13.4); stem.lineTo(-1.2, -16);
        const stache = P2(); stache.moveTo(5.8, 2.8); stache.quadraticCurveTo(3.4, 2.4, 2.4, 3.8); stache.quadraticCurveTo(1.6, 2.2, 3.2, 1.8); stache.quadraticCurveTo(5.6, 1.4, 7.8, 2.4); stache.quadraticCurveTo(8.4, 3.2, 7.6, 3.4); stache.closePath();
        return { p, stem, stache };
      });
      P.layer(lw);
      P.part(skull('hero'), skin, skinOpt);
      drawEar(P, m, skin);
      drawFace(P, m, look, 'eye', ex, blink, 'hero');
      P.fill(b.stache, '#1b1b1b', m);
      P.layer(lw);
      P.part(b.p, look.hat || '#1b1b1b', { m, c: [0, -9, 6], hi: true });
      P.line(b.stem, 1.3, null, m);
      break;
    }
    case 'civilian': {
      civilianHead(P, look, m, st, lw, ex, blink);
      break;
    }
    case 'robot': {
      const r = once('robothead', () => {
        const h = P2(); rrect(h, -8, -10, 17, 17, 3.4);
        const vis = P2(); rrect(vis, 0.5, -6, 9.4, 5.6, 2);
        const ant = P2(); ant.moveTo(-2, -10); ant.lineTo(-3, -16);
        const bulb = P2(); circle(bulb, -3.1, -16.8, 1.8);
        const grill = P2(); for (let i = 0; i < 3; i++) { grill.moveTo(2, 1.6 + i * 1.7); grill.lineTo(8.4, 1.6 + i * 1.7); }
        const bolt = P2(); circle(bolt, -5, -1.5, 1.8);
        return { h, vis, ant, bulb, grill, bolt };
      });
      P.layer(lw);
      P.part(r.h, look.suit || '#9aa6b2', { m, c: [0.5, -1.5, 8.5], hi: true });
      P.line(r.ant, 1.4, null, m);
      P.fill(r.bulb, look.suit2 || '#e8262b', m); P.line(r.bulb, 0.8, null, m);
      P.fill(r.vis, '#141414', m, true);
      P.fn((ctx, Pp) => {
        const c = Pp.o.asleep ? '#bbbbbb' : Pp.col(look.eye || '#ff2d2d');
        const blinkK = blink ? 0.25 : 1;
        if (!Pp.o.noFill && !Pp.o.asleep) { ctx.save(); ctx.globalAlpha *= 0.35; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(6.2, -3.2, 4.8, 0, TAU); ctx.fill(); ctx.restore(); }
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.ellipse(6.2, -3.2, 2.2, 2.2 * blinkK, 0, 0, TAU); ctx.fill();
        if (ex === 'grit' || ex === 'mean' || ex === 'det') { ctx.strokeStyle = Pp.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(2.6, -6.2); ctx.lineTo(9.4, -4.4); ctx.stroke(); }
      }, m);
      P.line(r.grill, 0.8, null, m);
      P.line(r.bolt, 0.8, null, m);
      break;
    }
    default: {
      P.layer(lw);
      P.part(skull('hero'), skin, skinOpt);
      if (look.hair) {
        const h = heroHair();
        P.part(h.p, look.hair, { m, c: [0, -6, 8], hi: true });
      }
      drawEar(P, m, skin);
      drawFace(P, m, look, 'eye', ex, blink, 'hero');
    }
  }
}

function civilianHead(P, look, m, st, lw, ex, blink) {
  const skin = look.skin || '#f0c29a';
  const hc = look.hair || '#3a2416';
  let style = look.hairStyle;
  if (!style) {
    const n = parseInt(hc.replace('#', ''), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (r > 180 && g > 180 && b > 180) style = 'prof';
    else if (r > 180 && g < 150) style = 'cowlick';
    else style = 'bob';
  }
  const fem = style === 'bob';
  const kind = fem ? 'fem' : style === 'cowlick' ? 'kid' : 'hero';
  const hs = once('civ.' + style, () => {
    const back = P2(), front = P2(), d = P2();
    if (style === 'bob') {
      back.moveTo(-8.6, 7.4); back.quadraticCurveTo(-11.2, -2, -7.6, -8.6); back.quadraticCurveTo(-2.4, -13.2, 3.8, -11); back.quadraticCurveTo(9.2, -8.6, 8.6, -3.2);
      back.lineTo(7.2, -4.4); back.quadraticCurveTo(4.4, -7.4, 1.2, -5.6); back.quadraticCurveTo(-1.6, -3.4, -1.2, 1.2); back.quadraticCurveTo(-1.6, 5.4, -0.6, 8.2); back.quadraticCurveTo(-4.6, 9.4, -8.6, 7.4); back.closePath();
      front.moveTo(-1.6, -9.4); front.quadraticCurveTo(4.8, -10.8, 8.8, -4.6); front.quadraticCurveTo(6, -6.6, 2.8, -5.4); front.quadraticCurveTo(0.6, -4.8, -1.2, -6.2); front.closePath();
      d.moveTo(-6.6, -6.2); d.quadraticCurveTo(-8.4, 0, -6.4, 6.4); d.moveTo(-3.6, -9.4); d.quadraticCurveTo(-5.4, -2, -3.8, 5.6);
    } else if (style === 'prof') {
      back.moveTo(-7.4, 2.4); back.quadraticCurveTo(-10.4, -1.2, -8.4, -5.2); back.lineTo(-6.6, -3.2); back.lineTo(-5.4, -6.2); back.lineTo(-4.8, -2.6); back.quadraticCurveTo(-4.4, 1.4, -7.4, 2.4); back.closePath();
      front.moveTo(-1.4, -5.6); front.lineTo(-2.2, -8.2); front.lineTo(0.2, -6.8); front.lineTo(1.2, -9.2); front.lineTo(2.2, -6.6); front.closePath();
      d.moveTo(-3.4, -8.8); d.arc(-0.6, -2.4, 6.6, -2.3, -1.6);
    } else {
      back.moveTo(-6.6, 3.2); back.quadraticCurveTo(-10, -3.8, -6.8, -9.2); back.quadraticCurveTo(-1.4, -13, 4.8, -10.6); back.quadraticCurveTo(8.8, -8.6, 7.6, -4.8);
      back.lineTo(5.4, -6.4); back.lineTo(4, -4.8); back.lineTo(2.6, -6.6); back.lineTo(0.6, -4.4); back.quadraticCurveTo(-1.4, -2, -1.6, 1.6); back.quadraticCurveTo(-4, 3.8, -6.6, 3.2); back.closePath();
      front.moveTo(-0.6, -11.4); front.quadraticCurveTo(-2.4, -16, 3.2, -16.4); front.quadraticCurveTo(0.8, -14.6, 2.4, -11.6); front.closePath();
    }
    const glasses = P2(); circle(glasses, 3.6, -0.9, 2.1); ellipse(glasses, 7.1, -1.0, 1.0, 1.9); glasses.moveTo(5.7, -1.2); glasses.lineTo(6.1, -1.2); glasses.moveTo(1.5, -1.2); glasses.lineTo(-1.6, -1.8);
    const stache = P2(); stache.moveTo(4.4, 3.0); stache.quadraticCurveTo(6, 1.6, 8.2, 2.6); stache.quadraticCurveTo(6.4, 3.6, 4.4, 3.0); stache.closePath();
    const fr = P2(); for (const [x, y] of [[2.4, 1.8], [3.4, 2.4], [4.4, 1.8], [7.0, 1.5], [3.0, 1.2]]) circle(fr, x, y, 0.33);
    return { back, front, d, glasses, stache, fr };
  });
  P.layer(lw);
  P.part(skull(kind === 'kid' ? 'kid' : kind), skin, { m, c: [0.5, -0.5, 8.2], skin: true, hi: true });
  P.part(hs.back, hc, { m, c: [-2, -3, 8], hi: true });
  P.part(hs.front, hc, { m });
  P.line(hs.d, 0.7, null, m);
  if (!fem) drawEar(P, m, skin);
  drawFace(P, m, look, 'eye', ex, blink, kind === 'kid' ? 'kid' : kind);
  if (style === 'prof') {
    P.fill(hs.stache, hc, m); P.line(hs.stache, 0.6, null, m);
    P.line(hs.glasses, 0.8, null, m);
  }
  if (style === 'cowlick') P.fill(hs.fr, '#c0703a', m);
  if (fem && (ex === 'calm' || ex === 'det')) {
    const lips = once('lips', () => { const p = P2(); p.moveTo(4.6, 4.0); p.quadraticCurveTo(5.8, 3.3, 6.9, 3.7); p.quadraticCurveTo(6.8, 4.9, 5.6, 4.9); p.quadraticCurveTo(4.8, 4.8, 4.6, 4.0); p.closePath(); return p; });
    P.fill(lips, '#d8263a', m);
  }
}

function stubble(P, m) {
  if (P.o.asleep || P.o.noFill || P.o.ghost) return;
  const s = once('stubble', () => { const p = P2(); p.moveTo(-2.2, 3.8); p.quadraticCurveTo(0.6, 7.6, 4.4, 8.0); p.lineTo(7.0, 7.0); p.lineTo(7.3, 5.1); p.lineTo(6.6, 3.6); p.quadraticCurveTo(3, 5.4, 0.2, 2.8); p.closePath(); return p; });
  P.fn((ctx) => {
    ctx.fillStyle = halftone(ctx, 'rgba(20,20,30,0.5)', 1.8, 0.36);
    ctx.fill(s);
  }, m);
}

function cigar(P, m, t) {
  const c = once('cigar', () => { const p = P2(); rrect(p, 6.4, 3.8, 8.4, 2.4, 1); const ash = P2(); ash.rect(13.6, 3.8, 1.4, 2.4); return { p, ash }; });
  P.layer(1);
  P.part(c.p, '#7a4a2a', { m });
  P.fn((ctx, Pp) => {
    if (Pp.o.noFill) return;
    ctx.fillStyle = Pp.col('#ff5a1a');
    ctx.fill(c.ash);
    ctx.strokeStyle = 'rgba(200,200,200,0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    const w = Math.sin(t * 2) * 1.5;
    ctx.moveTo(15, 3.6); ctx.quadraticCurveTo(16 + w, 0, 15, -3); ctx.quadraticCurveTo(14 - w, -6, 16, -9);
    ctx.stroke();
  }, m);
}

export { skull, FACE };
