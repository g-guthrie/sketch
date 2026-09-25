// Pre-renders each panel's static art (backdrop, decor, platforms, blocks,
// stairs, caption) into an offscreen canvas, and stamps persistent decals
// onto it during play so the page gets messier as the fight goes on.

import { paintBackdrop, paintDecor, paintBlock, paintPlatform, paintStairs, paintFloor } from './scenes.js';
import { INK, rand, makeCanvas, captionBox, halftoneGradient, rgba, shade } from './ink.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class PanelArt {
  constructor(level, comic, theme) {
    this.level = level;
    this.comic = comic;
    this.theme = theme;
    this.res = 0;
    this.items = new Map();
    this.pencil = new Map();
  }

  build(res) {
    res = clamp(Math.round(res * 4) / 4, 0.5, 2);
    if (res === this.res && this.items.size) return;
    const old = this.items;
    this.res = res;
    this.items = new Map();
    this.pencil.clear();
    for (const P of this.level.panels) {
      const prev = old.get(P.id);
      const item = this.renderPanel(P, res);
      if (prev) {
        // carry decals across a resolution change by re-applying the log
        item.log = prev.log;
        for (const d of item.log) this.applyDecal(item, d);
      }
      this.items.set(P.id, item);
    }
  }

  renderPanel(P, res) {
    const w = P.x2 - P.x1, h = P.y2 - P.y1;
    const c = makeCanvas(Math.ceil(w * res), Math.ceil(h * res));
    const g = c.getContext('2d');
    g.scale(res, res);
    const th = this.theme;
    const lv = this.level;
    g.save();
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    try {
      paintBackdrop(g, { scene: P.scene, theme: th, w, h, seed: P.seed });
    } catch (e) {
      console.error('backdrop failed', P.scene, e);
      g.fillStyle = '#e8dcc0';
      g.fillRect(0, 0, w, h);
    }
    for (const d of lv.decor) {
      if (d.panel !== P.id) continue;
      safe(() => paintDecor(g, { kind: d.k, x: d.x - P.x1, y: d.y - P.y1, theme: th, seed: d.seed }));
    }
    safe(() => paintFloor(g, { scene: P.scene, theme: th, w, h, seed: P.seed }));
    // soft vignette so the play area pops
    const vg = g.createRadialGradient(w / 2, h * 0.6, Math.min(w, h) * 0.3, w / 2, h * 0.6, Math.max(w, h) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, th.mono ? 'rgba(0,0,0,0.25)' : 'rgba(20,10,40,0.16)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    for (const st of lv.stairs) {
      if (st.panel !== P.id) continue;
      safe(() => paintStairs(g, { x: st.x - P.x1, y: st.y - P.y1, w: st.w, h: st.h, dir: st.dir, n: st.n, theme: th }));
    }
    for (const s of lv.solids) {
      if (s.k !== 'block' || s.panel !== P.id) continue;
      safe(() => paintBlock(g, { style: s.s, x: s.x - P.x1, y: s.y - P.y1, w: s.w, h: s.h, theme: th, seed: Math.floor(s.x * 7 + s.y) }));
    }
    for (const o of lv.oneways) {
      if (o.k !== 'platform' || o.panel !== P.id) continue;
      safe(() => paintPlatform(g, { style: o.s, x: o.x - P.x1, y: o.y - P.y1, w: o.w, h: o.h, theme: th, seed: Math.floor(o.x * 3 + o.y) }));
    }
    if (P.caption) {
      captionBox(g, 14, 12, P.caption, {
        size: 17, maxW: Math.min(330, w * 0.55), fill: th.palette.caption || '#ffe36e', seed: P.seed,
      });
    }
    g.restore();
    return { P, canvas: c, ctx: g, w, h, res, log: [] };
  }

  pencilVersion(item) {
    let pc = this.pencil.get(item.P.id);
    if (pc) return pc;
    pc = makeCanvas(item.canvas.width, item.canvas.height);
    const g = pc.getContext('2d');
    g.filter = 'grayscale(1) brightness(1.35) contrast(0.55)';
    g.drawImage(item.canvas, 0, 0);
    g.filter = 'none';
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = '#cfe0f5';
    g.fillRect(0, 0, pc.width, pc.height);
    g.globalCompositeOperation = 'source-over';
    // blue-pencil construction lines
    const r = rand(item.P.seed);
    g.strokeStyle = 'rgba(70,120,200,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
      g.beginPath();
      const x = r() * pc.width, y = r() * pc.height;
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * pc.width * 0.8, y + (r() - 0.5) * pc.height * 0.3);
      g.stroke();
    }
    this.pencil.set(item.P.id, pc);
    return pc;
  }

  // ----------------------------------------------------------------- decals

  panelAt(x, y) {
    for (const item of this.items.values()) {
      const P = item.P;
      if (x >= P.x1 && x <= P.x2 && y >= P.y1 && y <= P.y2) return item;
    }
    return null;
  }

  stamp(kind, x, y, params = {}) {
    if (kind === 'streak') {
      for (const item of this.items.values()) {
        const P = item.P;
        const minx = Math.min(x, params.x1), maxx = Math.max(x, params.x1);
        const miny = Math.min(y, params.y1), maxy = Math.max(y, params.y1);
        if (maxx < P.x1 || minx > P.x2 || maxy < P.y1 || miny > P.y2) continue;
        const d = { kind, x, y, ...params };
        item.log.push(d);
        this.applyDecal(item, d);
      }
      return;
    }
    const item = this.panelAt(x, y);
    if (!item) return;
    const d = { kind, x, y, ...params, seed: params.seed != null ? params.seed : (Math.random() * 1e6) | 0 };
    item.log.push(d);
    if (item.log.length > 400) item.log.splice(0, 50);
    this.applyDecal(item, d);
  }

  applyDecal(item, d) {
    const g = item.ctx;
    const P = item.P;
    const x = d.x - P.x1, y = d.y - P.y1;
    g.save();
    g.beginPath();
    g.rect(0, 0, item.w, item.h);
    g.clip();
    const r = rand(d.seed || 1);
    switch (d.kind) {
      case 'hole': {
        g.fillStyle = '#141414';
        g.beginPath();
        g.arc(x, y, 2.4, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(20,20,20,0.6)';
        g.lineWidth = 0.8;
        g.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = r() * Math.PI * 2, l = 3 + r() * 5;
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        }
        g.stroke();
        break;
      }
      case 'drop': {
        g.fillStyle = rgba(d.color || '#141414', 0.85);
        g.beginPath();
        g.ellipse(x, y, d.r * 1.3, d.r, 0, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'splat': {
        const rad = d.r || 10;
        g.fillStyle = rgba(d.color || '#141414', 0.82);
        g.beginPath();
        for (let i = 0; i < 7; i++) {
          const a = r() * Math.PI * 2, dd = r() * rad * 0.6;
          const rr = rad * (0.35 + r() * 0.4);
          g.moveTo(x + Math.cos(a) * dd + rr, y + Math.sin(a) * dd);
          g.arc(x + Math.cos(a) * dd, y + Math.sin(a) * dd, rr, 0, Math.PI * 2);
        }
        for (let i = 0; i < 9; i++) {
          const a = r() * Math.PI * 2, dd = rad * (1 + r() * 1.3);
          const rr = 1 + r() * 2.5;
          g.moveTo(x + Math.cos(a) * dd + rr, y + Math.sin(a) * dd);
          g.arc(x + Math.cos(a) * dd, y + Math.sin(a) * dd, rr, 0, Math.PI * 2);
        }
        g.fill();
        // drip
        if (r() < 0.6) {
          g.fillRect(x - 1.5, y, 3, rad * (0.8 + r() * 1.5));
        }
        break;
      }
      case 'scorch': {
        const rad = d.r || 60;
        halftoneGradient(g, x - rad, y - rad, rad * 2, rad * 2, 'rgba(20,20,20,0.75)', { dir: 'center', spacing: 7, maxR: 3.6, cx: x, cy: y });
        g.fillStyle = 'rgba(20,20,20,0.35)';
        g.beginPath();
        g.arc(x, y, rad * 0.35, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'streak': {
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(15,40,60,0.55)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(d.x1 - P.x1, d.y1 - P.y1);
        g.stroke();
        g.strokeStyle = 'rgba(35,213,232,0.35)';
        g.lineWidth = 1.2;
        g.stroke();
        break;
      }
      case 'rip': {
        const s = (d.h || 90) / 92;
        const pts = d.flying ? blobShape(r, s) : holeShape(s);
        // jagged ring
        const poly = [];
        for (let i = 0; i < pts.length; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
          const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 5));
          for (let k = 0; k < n; k++) {
            const t = k / n;
            poly.push([ax + (bx - ax) * t + (r() - 0.5) * 3.2, ay + (by - ay) * t + (r() - 0.5) * 3.2]);
          }
        }
        const oy = d.flying ? -(d.h || 40) / 2 : 0;
        const path = new Path2D();
        poly.forEach(([px, py], i) => (i ? path.lineTo(x + px, y + py + oy) : path.moveTo(x + px, y + py + oy)));
        path.closePath();
        // torn paper fibres / shadow
        g.save();
        g.translate(3, 3);
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.fill(path);
        g.restore();
        g.fillStyle = '#f7f1df';
        g.fill(path);
        g.save();
        g.clip(path);
        g.translate(-5, -5);
        g.lineWidth = 6;
        g.strokeStyle = 'rgba(80,60,30,0.28)';
        g.stroke(path);
        g.restore();
        g.lineWidth = 1.2;
        g.strokeStyle = '#8a7a5a';
        g.stroke(path);
        break;
      }
    }
    g.restore();
  }
}

function safe(fn) {
  try { fn(); } catch (e) { console.error(e); }
}

// cartoon "person-shaped hole", arms and legs flung out (feet at 0,0)
function holeShape(s) {
  const pts = [
    [-17, 0], [-11, -2], [-5, -34], [5, -34], [11, -2], [17, 0], [12, -40], [13, -58], [30, -78], [26, -84], [10, -70],
    [8, -74], [11, -82], [9, -92], [0, -96], [-9, -92], [-11, -82], [-8, -74], [-10, -70], [-26, -84], [-30, -78], [-13, -58], [-12, -40],
  ];
  return pts.map(([x, y]) => [x * s, y * s]);
}

function blobShape(r, s) {
  const pts = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = (i % 2 ? 14 : 26) * s * (0.8 + r() * 0.4);
    pts.push([Math.cos(a) * rad * 1.3, Math.sin(a) * rad]);
  }
  return pts;
}
