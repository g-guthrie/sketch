// World-space drawing for the pass-2 systems: puzzle switches, locked /
// cracked / sealed exits, keys and collector's stamps, hostages, and the
// enemy telegraphs that make the AI readable (sight cones, laser sights,
// grenade danger rings, dive lines, the Artist's pencil line).

import { INK, FONT, rand, shade, rgba, halftone, starburstPath, comicText, captionBox } from './ink.js';
import { raycast } from '../../shared/physics.js';
import { ACT, SIGHT } from '../../shared/ai.js';
import { ENEMY_SHOTS } from '../../shared/weapons.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- switches

export function drawSwitch(ctx, sw, theme, time, hinted) {
  const on = sw.on || sw.done;
  const k = theme.key;
  ctx.save();
  ctx.translate(sw.x, sw.y);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  if (on) {
    // light burst behind a lit switch
    const b = starburstPath(0, 0, 22, 34 + Math.sin(time * 10) * 3, 10, sw.id + 2, time * 0.6);
    ctx.fillStyle = k === 'space' ? 'rgba(35,213,232,0.55)' : 'rgba(255,236,110,0.6)';
    ctx.fill(b);
  }
  if (k === 'zombie') {
    // church bell on a bracket
    const sw2 = on ? Math.sin(time * 9) * 0.35 : 0;
    ctx.fillStyle = '#5a4a3a';
    ctx.fillRect(-16, -26, 32, 6);
    ctx.strokeRect(-16, -26, 32, 6);
    ctx.rotate(sw2);
    ctx.beginPath();
    ctx.moveTo(-6, -20);
    ctx.quadraticCurveTo(-14, -2, -18, 14);
    ctx.lineTo(18, 14);
    ctx.quadraticCurveTo(14, -2, 6, -20);
    ctx.closePath();
    ctx.fillStyle = on ? '#ffd23f' : '#8a7a4a';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 16, 4, 0, TAU);
    ctx.fillStyle = INK;
    ctx.fill();
  } else if (k === 'space') {
    // power node crystal
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(14, -4);
    ctx.lineTo(0, 20);
    ctx.lineTo(-14, -4);
    ctx.closePath();
    ctx.fillStyle = on ? '#b8fbff' : '#3b2a5c';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(0, 20);
    ctx.moveTo(-14, -4);
    ctx.lineTo(14, -4);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#6a6a7a';
    ctx.fillRect(-10, 20, 20, 7);
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-10, 20, 20, 7);
  } else if (k === 'noir') {
    // wall lamp
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(-3, -24, 6, 12);
    ctx.beginPath();
    ctx.moveTo(-16, -12);
    ctx.lineTo(16, -12);
    ctx.lineTo(9, 6);
    ctx.lineTo(-9, 6);
    ctx.closePath();
    ctx.fillStyle = '#3a3a3a';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 8, 6, 0, TAU);
    ctx.fillStyle = on ? '#fffbe0' : '#555555';
    ctx.fill();
    ctx.stroke();
    if (on) {
      ctx.fillStyle = 'rgba(255,250,220,0.35)';
      ctx.beginPath();
      ctx.moveTo(-9, 8);
      ctx.lineTo(9, 8);
      ctx.lineTo(40, 120);
      ctx.lineTo(-40, 120);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // fuse box with a bulb
    ctx.fillStyle = '#7a8a96';
    ctx.fillRect(-15, -14, 30, 34);
    ctx.strokeRect(-15, -14, 30, 34);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-15, 8, 30, 5);
    ctx.fillStyle = INK;
    for (let i = 0; i < 4; i++) ctx.fillRect(-12 + i * 8, 8, 4, 5);
    ctx.fillStyle = '#5a6670';
    ctx.fillRect(-4, -8, 8, 12);
    ctx.beginPath();
    ctx.arc(0, -20, 7, 0, TAU);
    ctx.fillStyle = on ? '#fff36b' : '#7a1a1a';
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  if (sw.litT > 0 && !sw.done) {
    // countdown arc
    ctx.save();
    ctx.strokeStyle = '#ffe14a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, 30, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(sw.litT / 5, 0, 1));
    ctx.stroke();
    ctx.restore();
  } else if (hinted && !on) {
    // pulsing target so players find them
    const r = 30 + Math.sin(time * 6) * 4;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,60,40,0.9)';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(sw.x - r - 8, sw.y); ctx.lineTo(sw.x - r + 6, sw.y);
    ctx.moveTo(sw.x + r - 6, sw.y); ctx.lineTo(sw.x + r + 8, sw.y);
    ctx.moveTo(sw.x, sw.y - r - 8); ctx.lineTo(sw.x, sw.y - r + 6);
    ctx.stroke();
    ctx.restore();
  }
}

// ------------------------------------------------------------------- exits

const BRICK = { hero: ['#b04a32', '#8a3522'], zombie: ['#8a8a80', '#6a6a60'], space: ['#9aa6b2', '#6a7682'], noir: ['#5a5a5a', '#3a3a3a'] };

// A shut story gate. Plain gates are an "un-inked" curtain; puzzle gates
// say what opens them.
export function drawGate(ctx, g, theme, time, solved) {
  const horiz = g.w > g.h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(g.x - 2, g.y - 2, g.w + 4, g.h + 4);
  ctx.clip();
  if (g.lock === 'crack') {
    const [c1, c2] = BRICK[theme.key] || BRICK.hero;
    ctx.fillStyle = c1;
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.strokeStyle = c2;
    ctx.lineWidth = 2;
    const bw = horiz ? 30 : 18, bh = horiz ? 6 : 12;
    ctx.beginPath();
    for (let y = g.y, row = 0; y < g.y + g.h; y += bh, row++) {
      ctx.moveTo(g.x, y);
      ctx.lineTo(g.x + g.w, y);
      for (let x = g.x + (row % 2 ? bw / 2 : 0); x < g.x + g.w; x += bw) { ctx.moveTo(x, y); ctx.lineTo(x, y + bh); }
    }
    ctx.stroke();
    // the crack
    const r = rand(g.id * 13 + 7);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    let cx = g.x + g.w * 0.5, cy = g.y;
    ctx.moveTo(cx, cy);
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      if (horiz) { cx = g.x + (i / steps) * g.w; cy = g.y + g.h * (0.2 + r() * 0.6); } else { cy = g.y + (i / steps) * g.h; cx = g.x + g.w * (0.15 + r() * 0.7); }
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  } else if (g.lock === 'key' || g.lock === 'switch') {
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.fillStyle = halftone(ctx, 'rgba(0,0,0,0.35)', 5, 1.2);
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.strokeStyle = '#8a929c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (horiz) for (let x = g.x + 10; x < g.x + g.w; x += 16) { ctx.moveTo(x, g.y); ctx.lineTo(x, g.y + g.h); }
    else for (let y = g.y + 12; y < g.y + g.h; y += 18) { ctx.moveTo(g.x, y); ctx.lineTo(g.x + g.w, y); }
    ctx.stroke();
  } else {
    ctx.fillStyle = '#141414';
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.strokeStyle = '#f3ead3';
    ctx.lineWidth = 2;
    const r = rand(g.id + 5);
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      ctx.moveTo(g.x + r() * g.w, g.y + r() * g.h);
      ctx.lineTo(g.x + r() * g.w, g.y + r() * g.h);
    }
    ctx.stroke();
  }
  ctx.restore();
  // the badge that says what opens it
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  if (g.lock === 'key') drawPadlock(ctx, cx, horiz ? cy - 26 : cy, 1);
  else if (g.lock === 'switch') {
    ctx.save();
    ctx.translate(cx, horiz ? cy - 26 : cy);
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, TAU);
    ctx.fillStyle = solved ? '#35c24a' : Math.floor(time * 3) % 2 ? '#e8262b' : '#8a1010';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }
}

export function drawPadlock(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(0, -8, 9, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(-13, -8, 26, 22);
  ctx.lineWidth = 3;
  ctx.strokeRect(-13, -8, 26, 22);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0, 1, 3.5, 0, TAU);
  ctx.fill();
  ctx.fillRect(-1.5, 2, 3, 7);
  ctx.restore();
}

// Ambush / last-stand shutters
export function drawSeal(ctx, r, t, time) {
  const k = clamp(t, 0, 1);
  const horiz = r.w > r.h;
  ctx.save();
  const h = horiz ? r.h : r.h * k;
  ctx.fillStyle = '#141414';
  ctx.fillRect(r.x - 3, r.y - 2, r.w + 6, h + 4);
  ctx.strokeStyle = '#e8262b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.rect(r.x - 3, r.y - 2, r.w + 6, h + 4);
  ctx.clip();
  // hazard stripes
  for (let i = -r.h; i < r.w + r.h; i += 18) {
    ctx.moveTo(r.x + i, r.y);
    ctx.lineTo(r.x + i + 20, r.y + r.h);
  }
  ctx.stroke();
  ctx.restore();
}

// --------------------------------------------------------------- pickups

export function drawKeyIcon(ctx, theme, s = 1) {
  ctx.save();
  ctx.scale(s, s);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  const k = theme.key;
  if (k === 'hero') {
    // keycard
    ctx.rotate(-0.2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-16, -11, 32, 22);
    ctx.strokeRect(-16, -11, 32, 22);
    ctx.fillStyle = '#e8262b';
    ctx.fillRect(-16, -4, 32, 6);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-11, 5, 8, 4);
  } else if (k === 'space') {
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(9, -2);
    ctx.lineTo(0, 16);
    ctx.lineTo(-9, -2);
    ctx.closePath();
    ctx.fillStyle = '#23d5e8';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-2, -10, 3, 8);
  } else {
    // skeleton / brass key
    const col = k === 'zombie' ? '#b8b0a0' : '#d9a441';
    ctx.rotate(-0.6);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(-10, 0, 7, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-3, -2.5, 22, 5);
    ctx.strokeRect(-3, -2.5, 22, 5);
    ctx.fillRect(12, 2, 4, 6);
    ctx.fillRect(17, 2, 3, 5);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(-10, 0, 2.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export function drawStampIcon(ctx, time) {
  ctx.save();
  ctx.rotate(Math.sin(time * 2) * 0.12);
  // perforated postage stamp
  const w = 30, h = 36;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) ctx.arc(-w / 2 + (i * w) / 6, -h / 2, 2.5, Math.PI, 0);
  ctx.lineTo(w / 2, h / 2);
  for (let i = 6; i >= 0; i--) ctx.arc(-w / 2 + (i * w) / 6, h / 2, 2.5, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = '#e8262b';
  ctx.fillRect(-10, -12, 20, 20);
  const st = starburstPath(0, -2, 4, 9, 5, 1, -Math.PI / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill(st);
  ctx.font = `8px ${FONT}`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.fillText('10¢', 0, 15);
  ctx.restore();
}

// ------------------------------------------------------------ telegraphs

// Sight cone of an unaware guard, clipped against walls.
export function drawSightCone(ctx, phys, e, time) {
  const ex = e.x, ey = e.y - e.h * 0.8;
  const dir = e.facing > 0 ? 0 : Math.PI;
  const n = 14;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  for (let i = 0; i <= n; i++) {
    const a = dir - SIGHT.cone + (i / n) * SIGHT.cone * 2;
    const x2 = ex + Math.cos(a) * SIGHT.range, y2 = ey + Math.sin(a) * SIGHT.range;
    const hit = raycast(phys, ex, ey, x2, y2);
    const t = hit ? hit.t : 1;
    ctx.lineTo(ex + (x2 - ex) * t, ey + (y2 - ey) * t);
  }
  ctx.closePath();
  const s = clamp(e.susp || 0, 0, 1);
  const g = ctx.createRadialGradient(ex, ey, 10, ex, ey, SIGHT.range);
  const col = s > 0.5 ? '255,70,40' : '255,236,120';
  g.addColorStop(0, `rgba(${col},${0.32 + s * 0.3})`);
  g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -time * 20;
  ctx.strokeStyle = `rgba(${col},${0.5 + s * 0.4})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  if (s > 0.08) {
    // "?" filling up as they get suspicious
    const qx = e.x, qy = e.y - e.h - 34;
    ctx.save();
    ctx.font = `34px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.strokeText('?', qx, qy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(qx - 20, qy - 30 * s, 40, 40);
    ctx.clip();
    ctx.fillStyle = s > 0.6 ? '#ff3a1a' : '#ffe14a';
    ctx.fillText('?', qx, qy);
    ctx.restore();
    ctx.restore();
  }
}

// Gunner laser: thin and dashed while tracking, solid red when locked on.
export function drawLaser(ctx, phys, e, time) {
  const sx = e.x + e.facing * 12, sy = e.y - e.h * 0.72;
  const x2 = sx + Math.cos(e.aim) * 1400, y2 = sy + Math.sin(e.aim) * 1400;
  const hit = raycast(phys, sx, sy, x2, y2);
  const t = hit ? hit.t : 1;
  const ex = sx + (x2 - sx) * t, ey = sy + (y2 - sy) * t;
  const locked = e.at < 0.2;
  ctx.save();
  ctx.lineCap = 'round';
  if (locked) {
    ctx.strokeStyle = 'rgba(255,30,30,0.35)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  ctx.strokeStyle = locked ? '#ff2020' : 'rgba(255,40,40,0.75)';
  ctx.lineWidth = locked ? 3 : 2;
  if (!locked) { ctx.setLineDash([10, 8]); ctx.lineDashOffset = -time * 60; }
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ff2020';
  ctx.beginPath();
  ctx.arc(ex, ey, locked ? 6 : 4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawDiveLine(ctx, e, time) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,58,26,0.85)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.lineDashOffset = -time * 80;
  ctx.beginPath();
  ctx.moveTo(e.x, e.y - e.h / 2);
  ctx.lineTo(e.telX, e.telY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(e.telX, e.telY, 26 + Math.sin(time * 12) * 3, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

// The Artist sketching a KO'd enemy back in: a blue-pencil ghost appears.
export function drawRedrawSketch(ctx, e, time) {
  const k = clamp(1 - e.at / 2.1, 0, 1);
  const tx = e.telX, ty = e.telY;
  ctx.save();
  ctx.strokeStyle = 'rgba(60,110,200,0.8)';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(e.x + e.facing * 30, e.y - e.h * 0.6);
  ctx.lineTo(tx, ty - 50);
  ctx.stroke();
  ctx.setLineDash([]);
  // scribbled silhouette building up
  const r = rand(Math.floor(time * 12));
  ctx.strokeStyle = `rgba(60,110,200,${0.35 + k * 0.5})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const n = Math.floor(6 + k * 26);
  for (let i = 0; i < n; i++) {
    const yy = ty - r() * 90 * k;
    const w = 14 + (1 - Math.abs((ty - yy) / 90 - 0.5)) * 12;
    ctx.moveTo(tx - w + r() * 6, yy);
    ctx.lineTo(tx + w - r() * 6, yy - 6 + r() * 12);
  }
  ctx.stroke();
  ctx.restore();
  comicText(ctx, 'SCRIBBLE...', tx, ty - 110 * k - 20, 18, { fill: '#ffffff', fill2: '#8ab4f0', extrude: 2, outline: 2.5, seed: 3 });
}

// Where a grenade will go off.
export function drawGrenadeWarning(ctx, pr, time) {
  const sp = Math.hypot(pr.vx, pr.vy);
  const r = ENEMY_SHOTS.egren.radius;
  const urgent = pr.fuse != null && pr.fuse - pr.age < 0.6;
  ctx.save();
  ctx.strokeStyle = urgent ? 'rgba(255,40,20,0.9)' : 'rgba(255,120,40,0.6)';
  ctx.lineWidth = urgent ? 4 : 3;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = time * 40;
  ctx.beginPath();
  ctx.arc(pr.x, pr.y, sp < 80 ? r : r * 0.5, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

export function drawGrenade(ctx, pr, time) {
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.rotate(pr.age * 8 * Math.sign(pr.vx || 1) * (Math.hypot(pr.vx, pr.vy) > 60 ? 1 : 0));
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  if (pr.w === 'molotov') {
    ctx.fillStyle = '#5a7a3a';
    ctx.fillRect(-5, -8, 10, 18);
    ctx.strokeRect(-5, -8, 10, 18);
    ctx.fillStyle = '#ffb21f';
    const f = starburstPath(0, -12, 3, 8, 5, 2, time * 20);
    ctx.fill(f);
  } else if (pr.w === 'plasma') {
    ctx.fillStyle = 'rgba(255,63,164,0.4)';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff3fa4';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, TAU);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = '#4a5a2a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 11, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-9, 0); ctx.lineTo(9, 0);
    ctx.moveTo(0, -11); ctx.lineTo(0, 11);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(-3, -15, 6, 5);
  }
  ctx.restore();
  // blinking fuse light
  if (Math.floor(time * (pr.fuse - pr.age < 0.6 ? 16 : 6)) % 2) {
    ctx.fillStyle = '#ff2020';
    ctx.beginPath();
    ctx.arc(pr.x, pr.y - 14, 3.5, 0, TAU);
    ctx.fill();
  }
}

// ------------------------------------------------------------------ people

// Ring over a downed hero: bleed-out time, or revive progress.
export function drawDownedRing(ctx, p, time, bleedMax) {
  const x = p.x, y = p.y - 70;
  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, TAU);
  ctx.stroke();
  if (p.rev > 0) {
    ctx.strokeStyle = '#7fd13b';
    ctx.beginPath();
    ctx.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(p.rev, 0, 1));
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#e8262b';
    ctx.beginPath();
    ctx.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * clamp((p.bleed || 0) / bleedMax, 0, 1));
    ctx.stroke();
  }
  ctx.font = `16px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeText(p.rev > 0 ? '+' : 'E', x, y + 1);
  ctx.fillText(p.rev > 0 ? '+' : 'E', x, y + 1);
  ctx.restore();
  if (Math.floor(time * 2) % 2 === 0 && !(p.rev > 0)) comicText(ctx, 'HELP!', x, y - 38, 20, { fill: '#ffffff', fill2: '#ff7a1a', extrude: 2, outline: 3, seed: 2 });
}

export function drawUntieRing(ctx, c) {
  const x = c.x, y = c.y - 100;
  ctx.save();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(x, y, 16, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(c.u, 0, 1));
  ctx.stroke();
  ctx.restore();
}

// Big last-stand countdown across the top of the panel.
export function drawStandTimer(ctx, P, t, dur, time) {
  const cx = (P.x1 + P.x2) / 2, y = P.y1 + 50;
  const k = clamp(1 - t / dur, 0, 1);
  const bw = Math.min(500, (P.x2 - P.x1) * 0.6);
  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(cx - bw / 2 - 4, y + 34, bw + 8, 16);
  ctx.fillStyle = '#f3ead3';
  ctx.fillRect(cx - bw / 2, y + 38, bw, 8);
  ctx.fillStyle = '#141414';
  ctx.fillRect(cx - bw / 2, y + 38, bw * k, 8);
  ctx.restore();
  const secs = Math.ceil(t);
  const pulse = t < 5 ? 1 + Math.sin(time * 14) * 0.06 : 1;
  ctx.save();
  ctx.translate(cx, y);
  ctx.scale(pulse, pulse);
  comicText(ctx, `INK DRIES IN ${secs}`, 0, 0, 38, { fill: '#ffffff', fill2: t < 5 ? '#ff7a1a' : '#ffe14a', extrude: 4, outline: 4.5, seed: 6 });
  ctx.restore();
}
