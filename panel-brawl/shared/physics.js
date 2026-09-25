// Axis-aligned collision world backed by a uniform grid.
// Rect types: t=1 solid (blocks everything), t=2 one-way platform (top only).
// Bodies use center-x / feet-y coordinates: x = center, y = bottom edge.

import { PHYS } from './constants.js';

const EPS = 1e-4;
export const SOLID = 1;
export const ONEWAY = 2;

export class Physics {
  constructor(cell = 128) {
    this.cell = cell;
    this.cells = new Map();
    this.rects = new Map();
    this.ladders = [];
    this._q = 1;
    this._nid = 1;
  }

  _key(cx, cy) { return (cx + 256) * 4096 + (cy + 256); }

  _cellsOf(r, fn) {
    const c = this.cell;
    const cx1 = Math.floor(r.x / c), cy1 = Math.floor(r.y / c);
    const cx2 = Math.floor((r.x + r.w) / c), cy2 = Math.floor((r.y + r.h) / c);
    for (let cx = cx1; cx <= cx2; cx++) for (let cy = cy1; cy <= cy2; cy++) fn(this._key(cx, cy));
  }

  add(r) {
    if (r.id == null) r.id = 'r' + this._nid++;
    r._q = 0;
    this.rects.set(r.id, r);
    this._cellsOf(r, (k) => {
      let list = this.cells.get(k);
      if (!list) this.cells.set(k, (list = []));
      list.push(r);
    });
    return r.id;
  }

  remove(id) {
    const r = this.rects.get(id);
    if (!r) return;
    this.rects.delete(id);
    this._cellsOf(r, (k) => {
      const list = this.cells.get(k);
      if (!list) return;
      const i = list.indexOf(r);
      if (i >= 0) list.splice(i, 1);
    });
  }

  has(id) { return this.rects.has(id); }

  query(x1, y1, x2, y2, out) {
    out.length = 0;
    const q = ++this._q;
    const c = this.cell;
    const cx1 = Math.floor(x1 / c), cy1 = Math.floor(y1 / c);
    const cx2 = Math.floor(x2 / c), cy2 = Math.floor(y2 / c);
    for (let cx = cx1; cx <= cx2; cx++) {
      for (let cy = cy1; cy <= cy2; cy++) {
        const list = this.cells.get(this._key(cx, cy));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const r = list[i];
          if (r._q === q) continue;
          r._q = q;
          if (r.x < x2 && r.x + r.w > x1 && r.y < y2 && r.y + r.h > y1) out.push(r);
        }
      }
    }
    return out;
  }

  solidIn(x1, y1, x2, y2) {
    const list = this.query(x1, y1, x2, y2, TMP_B);
    for (const r of list) {
      if (r.t !== SOLID) continue;
      if (r.x < x2 - EPS && r.x + r.w > x1 + EPS && r.y < y2 - EPS && r.y + r.h > y1 + EPS) return r;
    }
    return null;
  }

  findLadder(b) {
    for (const l of this.ladders) {
      if (b.x >= l.x && b.x <= l.x + l.w && b.y > l.y && b.y - b.h < l.y + l.h) return l;
    }
    return null;
  }
}

const TMP_A = [];
const TMP_B = [];
const RES = { hitX: false, wall: 0, ground: false, ceil: false, stepped: false, groundRect: null };

// Move an AABB body through the world with sub-stepping.
// opts: { drop: ignore one-ways, step: allow step-up, noOneway }
export function moveBody(phys, b, dx, dy, opts) {
  const res = RES;
  res.hitX = false; res.wall = 0; res.ground = false; res.ceil = false; res.stepped = false; res.groundRect = null;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 7));
  const sx = dx / n, sy = dy / n;
  for (let i = 0; i < n; i++) {
    if (sx !== 0) moveX(phys, b, sx, opts, res);
    if (sy !== 0) moveY(phys, b, sy, opts, res);
  }
  return res;
}

function moveX(phys, b, sx, opts, res) {
  const hw = b.w / 2;
  let nx = b.x + sx;
  const prevL = b.x - hw, prevR = b.x + hw;
  for (let pass = 0; pass < 3; pass++) {
    const top = b.y - b.h, bot = b.y;
    const list = phys.query(nx - hw, top, nx + hw, bot, TMP_A);
    let stepTo = null;
    let blocked = false;
    let clampX = nx;
    for (const r of list) {
      if (r.t !== SOLID) continue;
      if (!(nx - hw < r.x + r.w - EPS && nx + hw > r.x + EPS && top < r.y + r.h - EPS && bot > r.y + EPS)) continue;
      // Only rects we moved into can block. A rect we were already embedded
      // in must never "resolve" us out of its far side (that teleports
      // bodies through walls).
      if (sx > 0 ? r.x < prevR - 0.5 : r.x + r.w > prevL + 0.5) {
        const rise = bot - r.y;
        if (rise > 0 && rise <= PHYS.stepHeight && opts && opts.step) { if (stepTo === null || r.y < stepTo) stepTo = r.y; }
        continue;
      }
      const rise = bot - r.y;
      if (opts && opts.step && rise > 0 && rise <= PHYS.stepHeight) {
        if (stepTo === null || r.y < stepTo) stepTo = r.y;
        continue;
      }
      blocked = true;
      if (sx > 0) clampX = Math.min(clampX, r.x - hw);
      else clampX = Math.max(clampX, r.x + r.w + hw);
    }
    if (!blocked && stepTo !== null) {
      // verify headroom at the stepped height
      if (!phys.solidIn(nx - hw, stepTo - b.h, nx + hw, stepTo - EPS * 10)) {
        b.y = stepTo;
        res.stepped = true;
        continue; // re-test at new height
      }
      blocked = true;
      clampX = sx > 0 ? Math.min(clampX, b.x) : Math.max(clampX, b.x);
    }
    if (blocked) {
      nx = clampX;
      res.hitX = true;
      res.wall = sx > 0 ? 1 : -1;
    }
    break;
  }
  b.x = nx;
}

function moveY(phys, b, sy, opts, res) {
  const hw = b.w / 2;
  const x1 = b.x - hw, x2 = b.x + hw;
  let ny = b.y + sy;
  if (sy > 0) {
    const list = phys.query(x1, b.y - b.h, x2, ny + 1, TMP_A);
    for (const r of list) {
      if (!(x1 < r.x + r.w - EPS && x2 > r.x + EPS)) continue;
      if (r.t === SOLID) {
        if (b.y <= r.y + 0.5 && ny > r.y) { ny = r.y; res.ground = true; res.groundRect = r; }
      } else if (r.t === ONEWAY && !(opts && (opts.drop || opts.noOneway))) {
        if (b.y <= r.y + 0.5 && ny > r.y) { ny = r.y; res.ground = true; res.groundRect = r; }
      }
    }
  } else {
    const list = phys.query(x1, ny - b.h - 1, x2, b.y, TMP_A);
    for (const r of list) {
      if (r.t !== SOLID) continue;
      if (!(x1 < r.x + r.w - EPS && x2 > r.x + EPS)) continue;
      const bottom = r.y + r.h;
      if (b.y - b.h >= bottom - 0.5 && ny - b.h < bottom) { ny = bottom + b.h; res.ceil = true; }
    }
  }
  b.y = ny;
}

// Find the nearest walkable surface under the feet within maxDist.
export function groundProbe(phys, b, maxDist, ignoreOneway) {
  const hw = b.w / 2 - 0.5;
  const list = phys.query(b.x - hw, b.y - 1, b.x + hw, b.y + maxDist, TMP_A);
  let best = null, bestR = null;
  for (const r of list) {
    if (r.t === ONEWAY && ignoreOneway) continue;
    if (!(b.x - hw < r.x + r.w && b.x + hw > r.x)) continue;
    if (r.y >= b.y - 0.5 && r.y <= b.y + maxDist) {
      if (best === null || r.y < best) { best = r.y; bestR = r; }
    }
  }
  return bestR ? { y: best, rect: bestR } : null;
}

// Segment vs world solids. Returns nearest hit {t, x, y, nx, ny, rect} or null.
export function raycast(phys, x0, y0, x1, y1, filter) {
  const minx = Math.min(x0, x1) - 1, maxx = Math.max(x0, x1) + 1;
  const miny = Math.min(y0, y1) - 1, maxy = Math.max(y0, y1) + 1;
  const list = phys.query(minx, miny, maxx, maxy, TMP_B);
  const dx = x1 - x0, dy = y1 - y0;
  let bestT = Infinity, best = null, bnx = 0, bny = 0;
  for (const r of list) {
    if (r.t !== SOLID) continue;
    if (filter && !filter(r)) continue;
    const h = segRect(x0, y0, dx, dy, r.x, r.y, r.w, r.h);
    if (h && h.t < bestT) { bestT = h.t; best = r; bnx = h.nx; bny = h.ny; }
  }
  if (!best) return null;
  return { t: bestT, x: x0 + dx * bestT, y: y0 + dy * bestT, nx: bnx, ny: bny, rect: best };
}

const SEG = { t: 0, nx: 0, ny: 0 };
// Slab test for segment p0 + d*t, t in [0,1] vs rect. Returns shared object or null.
export function segRect(x0, y0, dx, dy, rx, ry, rw, rh) {
  let tmin = -Infinity, tmax = Infinity, nx = 0, ny = 0;
  if (dx !== 0) {
    const inv = 1 / dx;
    let t1 = (rx - x0) * inv, t2 = (rx + rw - x0) * inv;
    let n = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; n = 1; }
    if (t1 > tmin) { tmin = t1; nx = n; ny = 0; }
    if (t2 < tmax) tmax = t2;
  } else if (x0 <= rx || x0 >= rx + rw) return null;
  if (dy !== 0) {
    const inv = 1 / dy;
    let t1 = (ry - y0) * inv, t2 = (ry + rh - y0) * inv;
    let n = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; n = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = n; }
    if (t2 < tmax) tmax = t2;
  } else if (y0 <= ry || y0 >= ry + rh) return null;
  if (tmax < tmin || tmax < 0 || tmin > 1) return null;
  if (tmin < 0) { SEG.t = 0; SEG.nx = -Math.sign(dx) || 0; SEG.ny = -Math.sign(dy) || 0; return SEG; }
  SEG.t = tmin; SEG.nx = nx; SEG.ny = ny;
  return SEG;
}
