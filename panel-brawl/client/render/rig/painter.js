// Display-list painter for inked comic characters.
//
// Parts are grouped into layers. When a layer is played back every part is
// first stroked with thick ink, then every part is filled: overlapping parts
// of one layer melt into a single silhouette with one clean outer contour
// (the "unified outline" trick). Fills are flat colour + one cel-shadow tone:
// the whole part is filled with the shadow colour, then a shrunken copy
// nudged toward the light is filled with the base colour, leaving a crescent
// of shadow on the side away from the light. The lit copy also slightly eats
// the inner half of the outline on the lit side, which gives a cheap
// thick/thin line weight.
//
// All drawing is deferred so that the noir "rim" pass can run under every
// layer before anything else is inked.

import { INK, halftone } from '../ink.js';
import { shadowOf, skinShadow, lightOf, cmix, asleepOf, clamp } from './util.js';

const FLASH_WHITE = '#ffffff';

export class Painter {
  constructor() {
    this.ops = [];
    this.layerParts = null;
    this.ctx = null;
    this.o = null;
  }

  // o: draw opts. lw: outline width (local units). facing: to put the light
  // in the upper-left of the *world*.
  begin(ctx, o, lw, facing) {
    this.ctx = ctx;
    this.o = o;
    this.ops.length = 0;
    this.layerParts = null;
    this.lw = lw;
    this.ink = o.ink || INK;
    const lx = o.lightFront ? (facing || 1) * 0.9 : -(facing || 1), ly = -1.15;
    const l = Math.hypot(lx, ly);
    this.lx = lx / l;
    this.ly = ly / l;
    this.flat = !!(o.asleep || o.ghost || (o.flash || 0) > 0.45 || o.noShade);
    this.mode = (o.ghost ? 'g' : '') + (o.asleep ? 'a' : '') + '|' + Math.round((o.flash || 0) * 10) + '|' + Math.round((o.hurt || 0) * 10) + '|' + (o.tint || '') + Math.round((o.tintAmt || 0) * 10);
    this.plain = this.mode === '||0|0|0';
    return this;
  }

  // colour after flash / hurt / sleep / tint modifiers
  col(c) {
    if (!c) return c;
    if (this.plain) return c;
    const o = this.o;
    if (o.ghost) return o.tint || '#23d5e8';
    let r = c;
    if (o.asleep) r = asleepOf(r);
    if (o.tint) r = cmix(r, o.tint, clamp(o.tintAmt || 0.3, 0, 1));
    if (o.hurt > 0) r = cmix(r, '#ff2a1a', clamp(o.hurt, 0, 1) * 0.5);
    if (o.flash > 0) r = cmix(r, FLASH_WHITE, clamp(o.flash * 1.4, 0, 1));
    return r;
  }

  layer(lw) {
    this.layerParts = [];
    this.ops.push({ t: 0, parts: this.layerParts, lw: lw || this.lw });
    return this;
  }

  // Add a shaded part to the current layer.
  // opt: { m: frame [a,b,c,d,e,f], lit: Path2D (analytic lit copy),
  //        c: [cx, cy, r] (shrink centre + radius for the automatic lit copy),
  //        skin: bool, hi: bool (rim highlight), dots: bool (halftone in shadow),
  //        flat: bool, back: bool (darker, no shading), thin: w (thin stroke after fill),
  //        sh: explicit shadow colour }
  part(path, color, opt) {
    if (!this.layerParts) this.layer();
    this.layerParts.push({ path, color, opt: opt || EMPTY });
    return this;
  }

  // Thin interior ink line (after the current layer)
  line(path, w = 1.2, color = null, m = null) {
    this.ops.push({ t: 1, path, w, color, m });
    this.layerParts = null;
    return this;
  }

  // Flat fill detail
  fill(path, color, m = null, raw = false) {
    this.ops.push({ t: 2, path, color, m, raw });
    this.layerParts = null;
    return this;
  }

  // Custom callback, run in character-local space (with optional frame m)
  fn(f, m = null) {
    this.ops.push({ t: 3, f, m });
    this.layerParts = null;
    return this;
  }

  setM(m, force) {
    m = m || null;
    if (m === this.curM && !force) return;
    this.curM = m;
    const b = this.b;
    if (!m) { this.ctx.setTransform(b[0], b[1], b[2], b[3], b[4], b[5]); return; }
    // base * m, composed on the CPU (one setTransform call)
    this.ctx.setTransform(
      b[0] * m[0] + b[2] * m[1], b[1] * m[0] + b[3] * m[1],
      b[0] * m[2] + b[2] * m[3], b[1] * m[2] + b[3] * m[3],
      b[0] * m[4] + b[2] * m[5] + b[4], b[1] * m[4] + b[3] * m[5] + b[5],
    );
  }

  run() {
    const ctx = this.ctx, o = this.o;
    const t = ctx.getTransform();
    const b = this.b || (this.b = new Float64Array(6));
    b[0] = t.a; b[1] = t.b; b[2] = t.c; b[3] = t.d; b[4] = t.e; b[5] = t.f;
    this.pxs = Math.hypot(t.a, t.b);
    this.curM = DIRTY;
    const ops = this.ops;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // noir rim: a light halo under the whole silhouette
    if (o.rim && !o.noInk && !o.ghost) {
      ctx.strokeStyle = o.rim;
      for (const op of ops) {
        if (op.t !== 0) continue;
        ctx.lineWidth = op.lw * 2 + 3.4;
        for (const p of op.parts) {
          this.setM(p.opt.m);
          ctx.stroke(p.path);
        }
      }
    }
    for (const op of ops) {
      if (op.t === 0) this.runLayer(op.parts, op.lw);
      else if (op.t === 1) {
        if (o.noInk || o.ghost) continue;
        if (o.noFill && op.color && op.color !== INK) continue;
        this.setM(op.m);
        ctx.lineWidth = op.w;
        ctx.strokeStyle = op.color ? (op.color === INK ? this.ink : this.col(op.color)) : this.ink;
        ctx.stroke(op.path);
      } else if (op.t === 2) {
        if (o.noFill || o.ghost) continue;
        this.setM(op.m);
        ctx.fillStyle = op.raw ? op.color : this.col(op.color);
        ctx.fill(op.path);
      } else if (op.t === 3) {
        this.setM(op.m);
        op.f(ctx, this);
        this.curM = DIRTY;
      }
    }
    ctx.setTransform(b[0], b[1], b[2], b[3], b[4], b[5]);
  }

  runLayer(parts, lw) {
    const ctx = this.ctx, o = this.o;
    if (!o.noInk && !o.ghost) {
      ctx.strokeStyle = this.ink;
      ctx.lineWidth = (lw || this.lw) * 2;
      for (const p of parts) {
        this.setM(p.opt.m);
        ctx.stroke(p.path);
      }
    }
    if (o.noFill) return;
    for (const p of parts) this.fillPart(p);
    if (!o.noInk && !o.ghost) {
      for (const p of parts) {
        if (!p.opt.thin) continue;
        this.setM(p.opt.m);
        ctx.lineWidth = p.opt.thin;
        ctx.strokeStyle = this.ink;
        ctx.stroke(p.path);
      }
    }
  }

  fillPart(p) {
    const ctx = this.ctx;
    const opt = p.opt;
    const base = this.col(p.color);
    this.setM(opt.m);
    const tiny = opt.c ? opt.c[2] * this.pxs * (m0s(opt.m)) < 4.2 : opt.lr ? opt.lr * this.pxs < 2.6 : false;
    if (this.flat || opt.flat || tiny || (!opt.lit && !opt.c)) {
      ctx.fillStyle = opt.back && !this.flat ? shadowOf(base) : base;
      ctx.fill(p.path);
      return;
    }
    const sh = opt.sh ? this.col(opt.sh) : opt.skin ? skinShadow(base) : shadowOf(base);
    ctx.fillStyle = sh;
    ctx.fill(p.path);
    if (opt.dots) {
      ctx.fillStyle = halftone(ctx, 'rgba(20,14,40,0.28)', 3.2, 0.62);
      ctx.fill(p.path);
    }
    if (opt.lit) {
      if (opt.hi && opt.lit2) {
        ctx.fillStyle = lightOf(base);
        ctx.fill(opt.lit);
        ctx.fillStyle = base;
        ctx.fill(opt.lit2);
      } else {
        ctx.fillStyle = base;
        ctx.fill(opt.lit);
      }
      return;
    }
    // automatic lit copy: shrink around the centre and push toward the light
    const [cx, cy, r] = opt.c;
    let lx = this.lx, ly = this.ly;
    const m = opt.m;
    if (m) {
      // light direction into the part's frame (inverse of its rotation)
      const sc = Math.hypot(m[0], m[1]) || 1;
      const a = m[0] / sc, b = m[1] / sc;
      const tx = lx * a + ly * b, ty = -lx * b + ly * a;
      lx = tx; ly = ty;
    }
    this.curM = DIRTY;
    const d = clamp(r * (opt.depth || 0.22), 0.9, 4.2);
    const k = 1 - d / r;
    const push = d * 1.05;
    if (opt.hi) {
      ctx.fillStyle = lightOf(base);
      ctx.translate(cx + lx * push, cy + ly * push);
      ctx.scale(k, k);
      ctx.translate(-cx, -cy);
      ctx.fill(p.path);
      this.setM(m, true);
      this.curM = DIRTY;
      const k2 = k * (1 - 0.7 / r);
      const push2 = push - 0.55;
      ctx.translate(cx + lx * push2 - lx * 0.2, cy + ly * push2 - ly * 0.2);
      ctx.scale(k2, k2);
      ctx.translate(-cx, -cy);
      ctx.fillStyle = base;
      ctx.fill(p.path);
      return;
    }
    ctx.fillStyle = base;
    ctx.translate(cx + lx * push, cy + ly * push);
    ctx.scale(k, k);
    ctx.translate(-cx, -cy);
    ctx.fill(p.path);
  }
}

const EMPTY = {};
const DIRTY = [];
const m0s = (m) => (m ? Math.hypot(m[0], m[1]) : 1);
const _mats = new WeakMap();
function matOf(m) {
  let d = _mats.get(m);
  if (!d) { d = new DOMMatrix([m[0], m[1], m[2], m[3], m[4], m[5]]); _mats.set(m, d); }
  return d;
}

// Frame matrix helper: translate(x,y) rotate(a) scale(s)
export function frame(x, y, a, s = 1) {
  const c = Math.cos(a) * s, n = Math.sin(a) * s;
  return [c, n, -n, c, x, y];
}
