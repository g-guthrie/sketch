// Comic FX: onomatopoeia starbursts, merged damage numbers, ink droplets,
// paper shreds, smoke puffs, rail beams, sword arcs, shockwave rings,
// speech bubbles, screen shake, hit-stop and "impact frames".

import {
  INK, FONT, rand, shade, mix, rgba, makeCanvas, starburstPath, cloudPath, comicText, speechBubble, speedLines, halftone,
} from './ink.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeOutBack = (t) => {
  const c1 = 1.9, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// ------------------------------------------------------------ sprite cache

const spriteCache = new Map();
function cached(key, build) {
  let s = spriteCache.get(key);
  if (s) {
    spriteCache.delete(key);
    spriteCache.set(key, s);
    return s;
  }
  s = build();
  spriteCache.set(key, s);
  if (spriteCache.size > 260) spriteCache.delete(spriteCache.keys().next().value);
  return s;
}

// Render a starburst + SFX word into an offscreen canvas.
// Returns { img, w, h } in world units.
function burstSprite(text, size, style, res, seed) {
  const key = `b|${text}|${size}|${style.fill}|${style.fill2}|${style.burst}|${style.edge}|${style.shape}|${res.toFixed(2)}|${seed % 7}`;
  return cached(key, () => {
    const probe = makeCanvas(4, 4).getContext('2d');
    probe.font = `${size}px ${FONT}`;
    const tw = probe.measureText(text).width * 1.08 + size * 0.3;
    const noBurst = style.shape === 'none';
    const rx = noBurst ? tw / 2 + size * 0.3 : Math.max(tw * 0.62, size * 1.1);
    const ry = noBurst ? size * 0.8 : Math.max(size * 1.05, rx * 0.62);
    const W = rx * 2 + size * 0.8, H = ry * 2 + size * 0.8;
    const c = makeCanvas(Math.ceil(W * res), Math.ceil(H * res));
    const g = c.getContext('2d');
    g.scale(res, res);
    g.translate(W / 2, H / 2);
    if (!noBurst) {
      g.save();
      g.scale(1, ry / rx);
      const outer = starburstPath(0, 0, rx * 0.72, rx * 1.02, style.spikes || 12, seed, 0.2);
      g.lineJoin = 'round';
      g.fillStyle = style.edge || INK;
      g.fill(outer);
      g.lineWidth = Math.max(3, size * 0.09);
      g.strokeStyle = INK;
      g.stroke(outer);
      const inner = starburstPath(0, 0, rx * 0.6, rx * 0.86, style.spikes || 12, seed + 3, 0.45);
      g.fillStyle = style.burst || '#ffe14a';
      g.fill(inner);
      g.lineWidth = Math.max(2, size * 0.06);
      g.stroke(inner);
      // halftone in the burst
      g.save();
      g.clip(inner);
      g.fillStyle = halftone(g, rgba(shade(style.burst || '#ffe14a', -0.25), 0.8), Math.max(3, size * 0.14), Math.max(0.7, size * 0.035));
      g.fillRect(-rx, -rx, rx * 2, rx * 2);
      g.restore();
      g.restore();
    }
    comicText(g, text, 0, size * 0.04, size, {
      fill: style.fill || '#ffffff', fill2: style.fill2 || '#ffe14a', seed, extrude: size * 0.11, outline: Math.max(2, size * 0.1),
      jitter: 0.14, rot: -0.06,
    });
    return { img: c, w: W, h: H };
  });
}

function numberSprite(text, size, style, res) {
  const key = `n|${text}|${size}|${style.fill}|${style.fill2}|${res.toFixed(2)}`;
  return cached(key, () => {
    const probe = makeCanvas(4, 4).getContext('2d');
    probe.font = `${size}px ${FONT}`;
    const tw = probe.measureText(text).width + size * 0.6;
    const W = tw + size * 0.4, H = size * 1.7;
    const c = makeCanvas(Math.ceil(W * res), Math.ceil(H * res));
    const g = c.getContext('2d');
    g.scale(res, res);
    comicText(g, text, W / 2, H / 2, size, { fill: style.fill, fill2: style.fill2, extrude: size * 0.12, outline: Math.max(2, size * 0.12), jitter: 0.05, seed: 3, skew: -0.18 });
    return { img: c, w: W, h: H };
  });
}

function bubbleSprite(text, kind, res, size) {
  const key = `s|${text}|${kind}|${size}|${res.toFixed(2)}`;
  return cached(key, () => {
    const probe = makeCanvas(4, 4).getContext('2d');
    probe.font = `${size}px ${FONT}`;
    const W = Math.min(260, probe.measureText(text).width + size * 3) + 40;
    const H = size * 5 + 50;
    const c = makeCanvas(Math.ceil(W * res), Math.ceil(H * res));
    const g = c.getContext('2d');
    g.scale(res, res);
    speechBubble(g, W / 2, H / 2 - 8, text, { size, kind, maxW: 200, tx: W / 2 - 14, ty: H - 6, fill: kind === 'shout' ? '#fff36b' : '#ffffff' });
    return { img: c, w: W, h: H };
  });
}

// ------------------------------------------------------------------- FX

export class FX {
  constructor() {
    this.parts = [];
    this.sprites = [];
    this.numbers = new Map();
    this.retired = [];
    this.bubbles = [];
    this.beams = [];
    this.arcs = [];
    this.rings = [];
    this.flashes = [];
    this.lineBursts = [];
    this.trauma = 0;
    this.impact = 0;
    this.impactX = 0;
    this.impactY = 0;
    this.hitstop = 0;
    this.vignette = 0;
    this.heal = 0;
    this.dmgDirs = [];
    this.hitmarker = 0;
    this.hitmarkerCrit = false;
    this.killmarker = 0;
    this.res = 1.3;
    this.theme = null;
    this.onDecal = null;
    this.wordGate = new Map();
    this.time = 0;
  }

  setRes(r) { this.res = clamp(Math.round(r * 4) / 4, 0.5, 2.5); }

  clear() {
    this.parts.length = 0;
    this.sprites.length = 0;
    this.numbers.clear();
    this.retired.length = 0;
    this.bubbles.length = 0;
    this.beams.length = 0;
    this.arcs.length = 0;
    this.rings.length = 0;
    this.flashes.length = 0;
    this.lineBursts.length = 0;
  }

  palette() {
    return (this.theme && this.theme.palette) || { burst: ['#fff36b', '#ffb21f'], burstEdge: '#e8262b', splat: '#d11f26', enemySplat: '#d11f26', accent: '#e8262b' };
  }

  // ---------------------------------------------------------------- spawners

  burst(x, y, text, o = {}) {
    const pal = this.palette();
    const size = o.size || 34;
    const seed = o.seed || ((Math.random() * 1e6) | 0);
    const style = {
      fill: o.fill || '#ffffff',
      fill2: o.fill2 || pal.burst[0],
      burst: o.burst || pal.burst[1],
      edge: o.edge || pal.burstEdge,
      shape: o.shape || 'burst',
      spikes: o.spikes || 12,
    };
    const spr = burstSprite(text, size, style, this.res, seed);
    // readability budget: at most 3 big words on screen, the oldest bows out
    const big = !!o.big || (size >= 40 && style.shape !== 'none');
    if (big) {
      let n = 0, oldest = null;
      for (const sp of this.sprites) {
        if (!sp.big || sp.t >= sp.dur - 0.12) continue;
        n++;
        if (!oldest || sp.t / sp.dur > oldest.t / oldest.dur) oldest = sp;
      }
      if (n >= 3 && oldest) oldest.t = Math.max(oldest.t, oldest.dur - 0.12);
    }
    this.sprites.push({
      big,
      spr, x, y, t: 0, dur: o.dur || 0.75, rot: o.rot != null ? o.rot : (Math.random() - 0.5) * 0.5,
      vx: o.vx || 0, vy: o.vy != null ? o.vy : -30, scale: o.scale || 1, pop: o.pop || 1, layer: o.layer || 0,
    });
  }

  // throttled per-key SFX word (so an SMG doesn't spam a wall of text)
  gatedBurst(key, gap, x, y, text, o) {
    const last = this.wordGate.get(key) || -1;
    if (this.time - last < gap) return false;
    this.wordGate.set(key, this.time);
    this.burst(x, y, text, o);
    return true;
  }

  number(key, x, y, value, o = {}) {
    const n = this.numbers.get(key);
    if (n && n.t < 0.45 && !o.fresh) {
      n.value += value;
      n.t = Math.min(n.t, 0.08);
      n.punch = 1;
      n.crit = n.crit || !!o.crit;
      n.x += (x - n.x) * 0.3;
      n.y = Math.min(n.y, y);
      n.vy = -120;
      return;
    }
    if (n) this.retired.push(n);
    this.numbers.set(key, {
      x: x + (Math.random() - 0.5) * 14, y, vx: (Math.random() - 0.5) * 70, vy: -260, t: 0, value, punch: 1, crit: !!o.crit,
      mine: !!o.mine, hurtMe: !!o.hurtMe,
    });
  }

  bubble(getPos, text, kind = 'speech', dur = 2.4, size = 17) {
    // one bubble per speaker
    this.bubbles = this.bubbles.filter((b) => b.getPos !== getPos);
    this.bubbles.push({ getPos, text, kind, t: 0, dur, size, spr: bubbleSprite(text, kind, this.res, size) });
  }

  particle(p) {
    if (this.parts.length > 1400) this.parts.shift();
    p.t = 0;
    this.parts.push(p);
    return p;
  }

  inkSplat(x, y, color, n = 8, dx = 0, dy = 0, spread = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 2.2 * spread;
      const sp = 120 + Math.random() * 380;
      const big = Math.random() < 0.3;
      this.particle({
        k: 'ink', x, y, vx: Math.cos(a) * sp + dx * 0.15, vy: Math.sin(a) * sp - 120 + dy * 0.15, g: 1300, drag: 0.6,
        r: big ? 3.5 + Math.random() * 3 : 1.5 + Math.random() * 2, life: 0.5 + Math.random() * 0.5, color,
      });
    }
  }

  sparks(x, y, color = '#ffe14a', n = 6, dx = 0, dy = 0, spread = 1.4) {
    for (let i = 0; i < n; i++) {
      const base = dx || dy ? Math.atan2(dy, dx) : Math.random() * TAU;
      const a = base + (Math.random() - 0.5) * 2 * spread;
      const sp = 250 + Math.random() * 500;
      this.particle({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 900, drag: 2.5, life: 0.18 + Math.random() * 0.2, color, w: 2 + Math.random() * 1.5 });
    }
  }

  shreds(x, y, colors, n = 22, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = (160 + Math.random() * 520) * power;
      this.particle({
        k: 'shred', x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 40, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 260,
        g: 700, drag: 1.8, life: 1.1 + Math.random() * 0.9, color: colors[i % colors.length],
        w: 6 + Math.random() * 12, h: 5 + Math.random() * 9, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 18, seed: (Math.random() * 1e5) | 0,
      });
    }
  }

  smoke(x, y, n = 6, color = '#f4f1e8', size = 1, rise = 60) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = (40 + Math.random() * 160) * size;
      this.particle({
        k: 'smoke', x: x + Math.cos(a) * 10 * size, y: y + Math.sin(a) * 10 * size, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - rise,
        g: -40, drag: 2.6, life: 0.6 + Math.random() * 0.6, color, r: (10 + Math.random() * 14) * size, seed: (Math.random() * 1e5) | 0,
      });
    }
  }

  debris(x, y, color = '#a86b35', n = 10, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const sp = (200 + Math.random() * 450) * power;
      this.particle({ k: 'debris', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 1600, drag: 0.4, life: 0.8 + Math.random() * 0.6, color, w: 4 + Math.random() * 10, h: 3 + Math.random() * 4, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 20 });
    }
  }

  dust(x, y, n = 4, dir = 0) {
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? -1 : 1;
      this.particle({ k: 'smoke', x: x + s * 8, y: y - 4, vx: (s * (60 + Math.random() * 90)) + dir * 60, vy: -20 - Math.random() * 40, g: 0, drag: 4, life: 0.35 + Math.random() * 0.2, color: '#f4f1e8', r: 5 + Math.random() * 5, seed: (Math.random() * 1e5) | 0 });
    }
  }

  letters(x, y, word, color) {
    for (let i = 0; i < word.length; i++) {
      const a = Math.random() * TAU;
      const sp = 250 + Math.random() * 380;
      this.particle({ k: 'letter', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, g: 1300, drag: 0.5, life: 0.9 + Math.random() * 0.4, color, ch: word[i], rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 16, size: 20 + Math.random() * 10 });
    }
  }

  casing(x, y, facing) {
    this.particle({ k: 'debris', x, y, vx: -facing * (80 + Math.random() * 120), vy: -220 - Math.random() * 120, g: 1600, drag: 0.3, life: 0.6, color: '#e0b23a', w: 5, h: 2.5, rot: 0, vr: (Math.random() - 0.5) * 30 });
  }

  muzzle(x, y, a, weapon, color = '#ffe14a') {
    const big = weapon === 'shotgun' || weapon === 'launcher' || weapon === 'rail';
    this.flashes.push({ x, y, a, t: 0, dur: big ? 0.09 : 0.06, r: big ? 26 : 15, color, seed: (Math.random() * 1e5) | 0 });
  }

  beam(x0, y0, x1, y1, color = '#23d5e8') {
    this.beams.push({ x0, y0, x1, y1, t: 0, dur: 0.32, color, seed: (Math.random() * 1e5) | 0 });
  }

  slashArc(x, y, a, r = 120, color = '#ff3fa4') {
    this.arcs.push({ x, y, a, r, t: 0, dur: 0.16, color });
  }

  ring(x, y, r, color = '#ffffff', dur = 0.45, width = 10) {
    this.rings.push({ x, y, r, t: 0, dur, color, width });
  }

  lines(x, y, r0, r1, dur = 0.25, color = INK) {
    this.lineBursts.push({ x, y, r0, r1, t: 0, dur, color, seed: (Math.random() * 1e5) | 0 });
  }

  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }

  impactFrame(x, y, dur = 0.07) {
    this.impact = Math.max(this.impact, dur);
    this.impactX = x;
    this.impactY = y;
  }

  explosion(x, y, r, word, o = {}) {
    const pal = this.palette();
    this.burst(x, y - 10, word, { size: o.size || Math.min(58, 30 + r * 0.14), dur: 0.85, fill: '#fffbe0', fill2: '#ffd23f', burst: o.burst || '#ff7a1a', edge: o.edge || '#e8262b', spikes: 16, vy: -40, pop: 1.2, layer: 1, big: true });
    // fireball layers
    this.particle({ k: 'fireball', x, y, vx: 0, vy: 0, g: 0, drag: 0, life: 0.42, r: r * 0.75, seed: (Math.random() * 1e5) | 0 });
    this.smoke(x, y, 10, '#f4f1e8', r / 110, 80);
    this.smoke(x, y, 5, '#8a8a8a', r / 130, 120);
    this.sparks(x, y, '#ffb21f', 14, 0, 0, Math.PI);
    this.debris(x, y, '#3a3a3a', 8, r / 170);
    this.ring(x, y, r * 1.1, '#fff36b', 0.35, 14);
    this.lines(x, y, r * 0.5, r * 1.6, 0.22);
    if (this.onDecal) this.onDecal('scorch', x, y, { r: r * 0.55 });
    void pal;
  }

  // ------------------------------------------------------------------ update

  update(dt) {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    this.impact = Math.max(0, this.impact - dt);
    this.vignette = Math.max(0, this.vignette - dt * 1.6);
    this.heal = Math.max(0, this.heal - dt * 1.5);
    this.hitmarker = Math.max(0, this.hitmarker - dt);
    this.killmarker = Math.max(0, this.killmarker - dt);
    this.dmgDirs = this.dmgDirs.filter((d) => (d.t += dt) < 0.9);
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    const parts = this.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) {
        if (p.k === 'ink' && p.r > 3.4 && this.onDecal && Math.random() < 0.5) this.onDecal('drop', p.x, p.y, { r: p.r, color: p.color });
        parts.splice(i, 1);
        continue;
      }
      p.vy += (p.g || 0) * dt;
      const d = Math.exp(-(p.drag || 0) * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.vr) p.rot += p.vr * dt;
    }
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i];
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.t >= s.dur) this.sprites.splice(i, 1);
    }
    const stepNum = (n) => {
      n.t += dt;
      n.vy += 520 * dt;
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.punch = Math.max(0, n.punch - dt * 6);
    };
    for (const [k, n] of this.numbers) {
      stepNum(n);
      if (n.t > 1.0) this.numbers.delete(k);
    }
    for (const n of this.retired) stepNum(n);
    this.retired = this.retired.filter((n) => n.t <= 1.0);
    this.bubbles = this.bubbles.filter((b) => (b.t += dt) < b.dur);
    for (const list of [this.beams, this.arcs, this.rings, this.flashes, this.lineBursts]) {
      for (let i = list.length - 1; i >= 0; i--) if ((list[i].t += dt) >= list[i].dur) list.splice(i, 1);
    }
  }

  // shake offset in screen px
  shakeOffset(px) {
    const tr = this.trauma * this.trauma;
    const t = this.time * 40;
    return [Math.sin(t * 1.3 + 1) * tr * px + Math.sin(t * 2.9) * tr * px * 0.4, Math.cos(t * 1.1 + 2) * tr * px + Math.sin(t * 3.3) * tr * px * 0.4];
  }

  // ------------------------------------------------------------------- draw

  drawBack(ctx) {
    // things that sit behind characters: rings, speed-line bursts
    for (const L of this.lineBursts) {
      const k = L.t / L.dur;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      speedLines(ctx, L.x, L.y, L.r0 * (1 + k * 0.5), L.r1, 26, L.seed, L.color, 3);
      ctx.restore();
    }
  }

  drawWorld(ctx) {
    // shockwave rings
    for (const r of this.rings) {
      const k = r.t / r.dur;
      const rad = r.r * (0.2 + easeOutBack(Math.min(1, k * 1.3)) * 0.8);
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.lineWidth = r.width * (1 - k) + 2;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = r.width * (1 - k) * 0.55 + 1;
      ctx.strokeStyle = r.color;
      ctx.stroke();
      ctx.restore();
    }

    // particles
    for (const p of this.parts) {
      const k = p.t / p.life;
      switch (p.k) {
        case 'ink': {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          const sp = Math.hypot(p.vx, p.vy);
          const st = Math.min(3, 1 + sp / 400);
          const a = Math.atan2(p.vy, p.vx);
          ctx.ellipse(p.x, p.y, p.r * st * (1 - k * 0.3), p.r * (1 - k * 0.3), a, 0, TAU);
          ctx.fill();
          if (p.r > 3) {
            ctx.strokeStyle = INK;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          break;
        }
        case 'spark': {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.w * (1 - k);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.stroke();
          break;
        }
        case 'shred': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.cos(p.rot * 1.7));
          ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
          const r = rand(p.seed);
          ctx.beginPath();
          ctx.moveTo(-p.w / 2, -p.h / 2);
          ctx.lineTo(p.w / 2 * (0.7 + r() * 0.3), -p.h / 2 + r() * 2);
          ctx.lineTo(p.w / 2, p.h / 2 * (0.6 + r() * 0.4));
          ctx.lineTo(-p.w / 2 + r() * 3, p.h / 2);
          ctx.closePath();
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'smoke': {
          const r = p.r * (0.6 + k * 0.9);
          ctx.save();
          ctx.globalAlpha = 1 - k;
          const path = cloudPath(p.x, p.y, r, r * 0.85, 7, p.seed);
          ctx.fillStyle = p.color;
          ctx.fill(path);
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1.8;
          ctx.stroke(path);
          ctx.restore();
          break;
        }
        case 'debris': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
          break;
        }
        case 'letter': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
          ctx.font = `${p.size}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 5;
          ctx.strokeStyle = INK;
          ctx.strokeText(p.ch, 0, 0);
          ctx.fillStyle = p.color;
          ctx.fillText(p.ch, 0, 0);
          ctx.restore();
          break;
        }
        case 'fireball': {
          const r = p.r * (0.55 + easeOutBack(Math.min(1, k * 2.2)) * 0.5) * (k > 0.6 ? 1 - (k - 0.6) * 1.8 : 1);
          if (r <= 1) break;
          ctx.save();
          const outer = starburstPath(p.x, p.y, r * 0.8, r * 1.08, 14, p.seed, k * 2);
          ctx.fillStyle = '#e8262b';
          ctx.fill(outer);
          ctx.lineWidth = 4;
          ctx.strokeStyle = INK;
          ctx.stroke(outer);
          const mid = starburstPath(p.x, p.y, r * 0.55, r * 0.82, 12, p.seed + 1, -k);
          ctx.fillStyle = '#ff9a1f';
          ctx.fill(mid);
          const core = cloudPath(p.x, p.y, r * 0.45, r * 0.4, 8, p.seed + 2);
          ctx.fillStyle = '#fff36b';
          ctx.fill(core);
          ctx.restore();
          break;
        }
        case 'glow': {
          ctx.save();
          ctx.globalAlpha = (1 - k) * 0.8;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * (1 + k), 0, TAU);
          ctx.fill();
          ctx.restore();
          break;
        }
      }
    }

    // muzzle flashes
    for (const f of this.flashes) {
      const k = f.t / f.dur;
      const r = f.r * (1.2 - k * 0.5);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.a);
      ctx.scale(1.5, 0.8);
      const p = starburstPath(r * 0.35, 0, r * 0.35, r, 8, f.seed);
      ctx.fillStyle = '#fffbe0';
      ctx.fill(p);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = INK;
      ctx.stroke(p);
      const p2 = starburstPath(r * 0.35, 0, r * 0.2, r * 0.6, 6, f.seed + 1);
      ctx.fillStyle = f.color;
      ctx.fill(p2);
      ctx.restore();
    }

    // rail beams
    for (const b of this.beams) {
      const k = b.t / b.dur;
      const w = 16 * (1 - k) + 2;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK;
      ctx.lineWidth = w + 6;
      ctx.beginPath();
      ctx.moveTo(b.x0, b.y0);
      ctx.lineTo(b.x1, b.y1);
      ctx.stroke();
      ctx.strokeStyle = b.color;
      ctx.lineWidth = w;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = w * 0.35;
      ctx.stroke();
      // crackling zigzag
      const r = rand(b.seed + Math.floor(b.t * 30));
      const len = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
      const nx = -(b.y1 - b.y0) / len, ny = (b.x1 - b.x0) / len;
      ctx.beginPath();
      ctx.moveTo(b.x0, b.y0);
      const n = Math.max(3, Math.floor(len / 40));
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const o = (r() - 0.5) * 30 * (1 - k);
        ctx.lineTo(b.x0 + (b.x1 - b.x0) * t + nx * o, b.y0 + (b.y1 - b.y0) * t + ny * o);
      }
      ctx.lineTo(b.x1, b.y1);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1 - k;
      ctx.stroke();
      ctx.restore();
    }

    // blade arcs
    for (const a of this.arcs) {
      const k = a.t / a.dur;
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.a);
      ctx.globalAlpha = 1 - k * 0.6;
      const sweep = 2.4;
      const start = -sweep / 2 - 0.3 + k * 0.6;
      const p = new Path2D();
      p.arc(0, 0, a.r, start, start + sweep);
      p.arc(0, 0, a.r * 0.62, start + sweep - 0.2, start + 0.25, true);
      p.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill(p);
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke(p);
      const p2 = new Path2D();
      p2.arc(0, 0, a.r * 0.92, start + 0.2, start + sweep - 0.1);
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 6;
      ctx.stroke(p2);
      ctx.restore();
    }
  }

  drawTop(ctx) {
    // onomatopoeia sprites (sorted so big layer-1 bursts are under hit bursts)
    const list = this.sprites.slice().sort((a, b) => b.layer - a.layer);
    for (const s of list) {
      const k = s.t / s.dur;
      const popIn = Math.min(1, s.t / 0.14);
      let sc = easeOutBack(popIn) * s.scale;
      if (k > 0.72) sc *= 1 - ((k - 0.72) / 0.28) * 0.5;
      const alpha = k > 0.72 ? 1 - (k - 0.72) / 0.28 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot + Math.sin(s.t * 18) * 0.03 * (1 - popIn * 0.5));
      ctx.scale(sc * (s.pop > 1 && popIn < 1 ? s.pop - (s.pop - 1) * popIn : 1), sc);
      ctx.drawImage(s.spr.img, -s.spr.w / 2, -s.spr.h / 2, s.spr.w, s.spr.h);
      ctx.restore();
    }

    // damage numbers
    for (const n of [...this.retired, ...this.numbers.values()]) {
      const dmg = Math.round(n.value);
      const size = Math.round(clamp(20 + dmg * 0.32, 20, 58) + (n.crit ? 6 : 0));
      const style = n.hurtMe ? { fill: '#ffffff', fill2: '#ff4040' }
        : n.crit ? { fill: '#fff36b', fill2: '#ff3a1a' }
        : dmg >= 60 ? { fill: '#ffe14a', fill2: '#ff7a1a' }
        : { fill: '#ffffff', fill2: '#ffe9a8' };
      const spr = numberSprite(dmg + (n.crit ? '!' : ''), size, style, this.res);
      const k = n.t / 1.0;
      const pop = Math.min(1, n.t / 0.1);
      const sc = (0.4 + 0.6 * easeOutBack(pop)) * (1 + n.punch * 0.35) * (k > 0.75 ? 1 - (k - 0.75) * 2 : 1);
      ctx.save();
      ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      ctx.translate(n.x, n.y);
      ctx.rotate(-0.08);
      ctx.scale(sc, sc);
      ctx.drawImage(spr.img, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      ctx.restore();
    }

    // speech bubbles
    for (const b of this.bubbles) {
      const pos = b.getPos();
      if (!pos) continue;
      const pop = easeOutBack(Math.min(1, b.t / 0.18));
      const out = b.t > b.dur - 0.2 ? (b.dur - b.t) / 0.2 : 1;
      ctx.save();
      ctx.globalAlpha = out;
      ctx.translate(pos.x + 26, pos.y - 8);
      ctx.scale(pop, pop);
      ctx.drawImage(b.spr.img, -b.spr.w / 2 + 14, -b.spr.h + 6, b.spr.w, b.spr.h);
      ctx.restore();
    }
  }
}
