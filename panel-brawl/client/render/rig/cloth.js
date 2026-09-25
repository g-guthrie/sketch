// Verlet cloth chains (capes, scarves, ponytails, coat tails) simulated in
// world space so they trail behind motion. Pinned at an anchor that comes
// from the solved pose; kept behind the body and above the floor; reset on
// teleports. Fixed 60 Hz sub-steps -> frame-rate independent.

import { lerp, clamp } from './util.js';

// ch: Float64Array [x, y, px, py] * n
export function simChain(ch, n, seg, ax, ay, dt, o) {
  if (!ch || ch.length !== n * 4 || !isFinite(ch[0]) || Math.hypot(ch[0] - ax, ch[1] - ay) > 140) {
    ch = new Float64Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = ax - o.back * i * seg * 0.35, y = ay + i * seg * 0.94;
      ch[i * 4] = x; ch[i * 4 + 1] = y; ch[i * 4 + 2] = x; ch[i * 4 + 3] = y;
    }
  }
  if (!(dt > 0)) { ch[0] = ax; ch[1] = ay; ch[2] = ax; ch[3] = ay; return ch; }
  // fixed sub-steps; excess time (hitches, first frame) is dropped
  const steps = Math.min(4, Math.max(1, Math.round(dt * 60)));
  const h = Math.min(dt / steps, 1 / 45);
  // world-space air drag: cloth trails behind motion at a speed-dependent angle
  const damp = Math.exp(-(o.drag || 5) * h);
  const g = (o.grav || 1500) * h * h;
  const wind = (o.wind || 0) * h * h;
  for (let s = 0; s < steps; s++) {
    const t = o.t + s * h;
    for (let i = 1; i < n; i++) {
      const k = i * 4;
      const x = ch[k], y = ch[k + 1];
      const vx = (x - ch[k + 2]) * damp, vy = (y - ch[k + 3]) * damp;
      ch[k + 2] = x; ch[k + 3] = y;
      // flutter: small waves travelling down the cloth, perpendicular-ish
      const fl = Math.sin(t * o.flutterF - i * 1.1) * o.flutter * (i / n) * h * h;
      ch[k] = x + vx + wind + fl * 0.25;
      ch[k + 1] = y + vy + g + fl;
    }
    // pin
    ch[0] = ax; ch[1] = ay; ch[2] = ax; ch[3] = ay;
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < n; i++) {
        const a = (i - 1) * 4, b = i * 4;
        const dx = ch[b] - ch[a], dy = ch[b + 1] - ch[a + 1];
        const d = Math.hypot(dx, dy) || 1e-3;
        const diff = (d - seg) / d;
        if (i === 1) { ch[b] -= dx * diff; ch[b + 1] -= dy * diff; }
        else { ch[a] += dx * diff * 0.5; ch[a + 1] += dy * diff * 0.5; ch[b] -= dx * diff * 0.5; ch[b + 1] -= dy * diff * 0.5; }
      }
      // keep behind the body: local x = (wx - ax) * facing <= slack
      for (let i = 1; i < n; i++) {
        const b = i * 4;
        const lx = (ch[b] - ax) * o.facing;
        const lim = o.slack + i * 0.6;
        if (lx > lim) ch[b] = ax + lim * o.facing;
        if (o.floor != null && ch[b + 1] > o.floor) ch[b + 1] = o.floor;
      }
    }
  }
  return ch;
}

// Tapered ribbon path along a chain. hem: 'flat' | 'scallop' | 'jag' | 'point' | 'round'
export function ribbonPath(p, ch, n, w0, w1, hem, k = 1, ox = 0, oy = 0) {
  const L = new Float64Array(n * 2), Rr = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1) * 4, b = Math.min(n - 1, i + 1) * 4;
    const dx = ch[b] - ch[a], dy = ch[b + 1] - ch[a + 1];
    const d = Math.hypot(dx, dy) || 1;
    const t = i / (n - 1);
    const w = lerp(w0, w1, t * t * 0.4 + t * 0.6) * 0.5 * k;
    const nx = -dy / d, ny = dx / d;
    const x = ch[i * 4] + ox, y = ch[i * 4 + 1] + oy;
    L[i * 2] = x + nx * w; L[i * 2 + 1] = y + ny * w;
    Rr[i * 2] = x - nx * w; Rr[i * 2 + 1] = y - ny * w;
  }
  p.moveTo(L[0], L[1]);
  for (let i = 1; i < n - 1; i++) {
    p.quadraticCurveTo(L[i * 2], L[i * 2 + 1], (L[i * 2] + L[i * 2 + 2]) / 2, (L[i * 2 + 1] + L[i * 2 + 3]) / 2);
  }
  p.lineTo(L[(n - 1) * 2], L[(n - 1) * 2 + 1]);
  // hem from L end to R end
  const lx = L[(n - 1) * 2], ly = L[(n - 1) * 2 + 1], rx = Rr[(n - 1) * 2], ry = Rr[(n - 1) * 2 + 1];
  const ex = ch[(n - 1) * 4] - ch[(n - 2) * 4], ey = ch[(n - 1) * 4 + 1] - ch[(n - 2) * 4 + 1];
  const ed = Math.hypot(ex, ey) || 1;
  const ux = ex / ed, uy = ey / ed;
  const segs = hem === 'scallop' ? 3 : hem === 'jag' ? 4 : 1;
  if (hem === 'point' || hem === 'round') {
    const mx = (lx + rx) / 2 + ux * w1 * 0.5 * k, my = (ly + ry) / 2 + uy * w1 * 0.5 * k;
    if (hem === 'round') p.quadraticCurveTo(mx + ux * 2, my + uy * 2, rx, ry);
    else { p.lineTo(mx, my); p.lineTo(rx, ry); }
  } else {
    for (let s = 1; s <= segs; s++) {
      const t0 = (s - 1) / segs, t1 = s / segs;
      const x1 = lerp(lx, rx, t1), y1 = lerp(ly, ry, t1);
      const mx = lerp(lx, rx, (t0 + t1) / 2), my = lerp(ly, ry, (t0 + t1) / 2);
      if (hem === 'scallop') p.quadraticCurveTo(mx + ux * 6 * k, my + uy * 6 * k, x1, y1);
      else if (hem === 'jag') { p.lineTo(mx + ux * 7 * k, my + uy * 7 * k); p.lineTo(x1, y1); }
      else p.lineTo(x1, y1);
    }
  }
  for (let i = n - 2; i >= 1; i--) {
    p.quadraticCurveTo(Rr[i * 2], Rr[i * 2 + 1], (Rr[i * 2] + Rr[i * 2 - 2]) / 2, (Rr[i * 2 + 1] + Rr[i * 2 - 1]) / 2);
  }
  p.lineTo(Rr[0], Rr[1]);
  p.closePath();
  return p;
}

export function foldLines(p, ch, n, w0, w1, from = 0.35) {
  for (const side of [-0.22, 0.2]) {
    let started = false;
    for (let i = Math.floor(n * from); i < n; i++) {
      const a = Math.max(0, i - 1) * 4, b = Math.min(n - 1, i + 1) * 4;
      const dx = ch[b] - ch[a], dy = ch[b + 1] - ch[a + 1];
      const d = Math.hypot(dx, dy) || 1;
      const t = i / (n - 1);
      const w = lerp(w0, w1, t) * side;
      const x = ch[i * 4] - dy / d * w, y = ch[i * 4 + 1] + dx / d * w;
      if (!started) { p.moveTo(x, y); started = true; } else p.lineTo(x, y);
    }
  }
  return p;
}

export { clamp };
