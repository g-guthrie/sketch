// Animated fighter on screen: pose tracks, sprite caching and hit flashes.

import { renderFighter } from './sprite.js';
import { POSES, blend } from './poses.js';

const cache = new Map();

// From behind, punches must travel up the screen to reach the opponent's
// face, and a relaxed guard shows the gloves beside the head.
const BACK = {
  jab: { gL: [16, 58, 6], eL: [1, -0.3, -0.4] },
  hookL: { gL: [-2, 56, 4], eL: [1, 0.3, -0.2] },
  hookR: { gR: [2, 56, 4], eR: [-1, 0.3, -0.2] },
  body: { gR: [-8, 22, 18] },
  upper: { gR: [-4, 64, 4] },
  star: { gR: [-12, 60, 4] },
  hookLWind: { gL: [44, 30, 0] },
  hookRWind: { gR: [-44, 30, 0] },
}
function backAdjust(p, name) {
  const q = { ...p, ...(BACK[name] || {}) };
  if (BACK[name]) return q;
  for (const k of ['gL', 'gR']) {
    const side = k === 'gL' ? 1 : -1;
    const g = q[k] || (k === 'gL' ? [15, 4, 26] : [-15, 2, 24]);
    let [x, y, z] = g;
    if (z <= 30 && y > -8) {
      x = side * Math.max(Math.abs(x) * 1.2, 24);
      y += 14;
    }
    q[k] = [x, y, z];
  }
  return q;
}

export function sprite(fighter, view, scale, name, pose) {
  const key = `${fighter.id}|${view}|${scale}|${name}`;
  let s = cache.get(key);
  if (!s) {
    let p = pose || POSES[name] || POSES.idle;
    if (view === 'back') p = backAdjust(p, name.split('@')[0].split('>').pop());
    s = renderFighter(fighter, p, view, scale);
    if (cache.size > 900) cache.clear();
    cache.set(key, s);
  }
  return s;
}

function silhouette(s, color) {
  const k = '_sil' + color;
  if (s[k]) return s[k];
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  const x = c.getContext('2d');
  x.drawImage(s.canvas, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, s.w, s.h);
  s[k] = c;
  return c;
}

const IDLE_LOOPS = {
  idle: [['idle', 0.42], ['idle2', 0.42]],
  loaded: [['windup', 0.12], ['windupB', 0.12]],
  stun: [['stun', 0.34], ['stun2', 0.34]],
  tired: [['tired', 0.5], ['tired2', 0.5]],
  down: [['down', 1]],
  win: [['win', 0.4], ['win2', 0.4]],
  taunt: [['taunt', 0.5], ['idle', 0.5]],
  guard: [['guard', 1]],
};
POSES.windupB = { ...POSES.windup, glow: 0 };

export class FighterView {
  constructor(fighter, view, scale, x, y) {
    this.f = fighter;
    this.view = view;
    this.scale = scale;
    this.x = x; this.y = y;
    this.base = 'idle';
    this.track = null;
    this.t = 0;
    this.flashT = 0;
    this.flashColor = '#ffffff';
    this.jolt = { x: 0, y: 0 };
    this.alpha = 1;
    this.visible = true;
  }

  setBase(b) {
    if (this.base !== b) { this.base = b; this.baseT = 0; }
  }

  // keys: [{ p: poseName, d: seconds, dx, dy, tween }]
  play(keys, onDone) {
    // Remember where we are so a leading tween starts from the current frame.
    const cur = this.current();
    const from = { p: POSES[cur.name] ? cur.name : 'idle', dx: cur.dx, dy: cur.dy, d: 0 };
    this.track = { keys, t: 0, total: keys.reduce((s, k) => s + k.d, 0), onDone, from };
  }

  busy() { return !!this.track; }

  hit(color = '#ffffff', t = 0.07) { this.flashT = t; this.flashColor = color; }

  update(dt) {
    this.t += dt;
    this.baseT = (this.baseT || 0) + dt;
    if (this.flashT > 0) this.flashT -= dt;
    this.jolt.x *= 0.7; this.jolt.y *= 0.7;
    if (this.track) {
      this.track.t += dt;
      if (this.track.t >= this.track.total && !this.track.keys[this.track.keys.length - 1].hold) {
        const done = this.track.onDone;
        this.track = null;
        done?.();
      }
    }
  }

  current() {
    if (this.track) {
      const { keys } = this.track;
      let t = this.track.t, prev = this.track.from || null;
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (t < k.d || i === keys.length - 1) {
          const dx = k.dx ?? 0, dy = k.dy ?? 0;
          if (k.tween && prev) {
            const u = Math.min(1, t / k.d);
            const q = Math.min(2, Math.floor(u * 3)) / 3 + 1 / 3; // 3 held steps
            if (q >= 1) return { name: k.p, dx, dy };
            const name = `${prev.p}>${k.p}@${q.toFixed(2)}`;
            const pose = blend(POSES[prev.p] || POSES.idle, POSES[k.p] || POSES.idle, q);
            return { name, pose, dx: (prev.dx ?? 0) + (dx - (prev.dx ?? 0)) * q, dy: (prev.dy ?? 0) + (dy - (prev.dy ?? 0)) * q };
          }
          return { name: k.p, dx, dy };
        }
        t -= k.d;
        prev = k;
      }
    }
    const loop = IDLE_LOOPS[this.base] || IDLE_LOOPS.idle;
    const total = loop.reduce((s, l) => s + l[1], 0);
    let u = (this.baseT || 0) % total;
    for (const [n, d] of loop) {
      if (u < d) return { name: n, dx: 0, dy: 0 };
      u -= d;
    }
    return { name: loop[0][0], dx: 0, dy: 0 };
  }

  spriteNow() {
    const c = this.current();
    return { s: sprite(this.f, this.view, this.scale, c.name, c.pose), c };
  }

  // Screen position of a body point in the current frame.
  point(which) {
    const { s, c } = this.spriteNow();
    const p = s[which] || s.head;
    return { x: this.x + c.dx + this.jolt.x - s.ax + p.x, y: this.y + c.dy + this.jolt.y - s.ay + p.y };
  }

  draw(ctx, ox = 0, oy = 0) {
    if (!this.visible) return;
    const { s, c } = this.spriteNow();
    const x = Math.round(this.x + c.dx + this.jolt.x - s.ax + ox);
    const y = Math.round(this.y + c.dy + this.jolt.y - s.ay + oy);
    if (this.alpha < 1) ctx.globalAlpha = this.alpha;
    ctx.drawImage(s.canvas, x, y);
    if (this.flashT > 0) {
      ctx.globalAlpha = Math.min(1, this.flashT / 0.05) * 0.85;
      ctx.drawImage(silhouette(s, this.flashColor), x, y);
    }
    ctx.globalAlpha = 1;
  }
}

// Warm the cache for a fighter so the first exchange never hitches.
export function prewarm(fighter, view, scale) {
  for (const n of Object.keys(POSES)) sprite(fighter, view, scale, n);
}
