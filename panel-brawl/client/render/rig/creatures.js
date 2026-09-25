// Non-humanoid bodies: ghoul bat / noir crow, saucer bot, the Overmind jar.

import { Painter, frame } from './painter.js';
import { circle, ellipse, rrect, clamp, lerp, TAU, PI, sat } from './util.js';
import { ACT } from '../../../shared/ai.js';

const P2 = () => new Path2D();
const cp = new Painter();

// ------------------------------------------------------------------ bat

export function drawBat(ctx, ent, A, opts) {
  const look = ent.look;
  const s = (look.scale || 1) * (ent.renderScale || 1);
  const f = ent.facing < 0 ? -1 : 1;
  const crow = !!look.crow;
  const dive = ent.act === ACT.dive;
  const wind = ent.act === ACT.windup;
  ctx.save();
  ctx.translate(ent.x, ent.y - (ent.h || 42) / 2 - 2);
  const tilt = dive ? Math.atan2(ent.vy || 0, Math.abs(ent.vx || 1)) * 0.8 : clamp((ent.vx || 0) * f / 900, -0.3, 0.3);
  ctx.scale(f * s, s);
  ctx.rotate(tilt);
  const P = cp.begin(ctx, opts, 2.2, f);
  const rate = dive ? 26 : wind ? 22 : 13;
  const ph = opts.asleep ? 0.6 : A.t * rate;
  const flap = Math.sin(ph);
  const bob = opts.asleep ? 0 : Math.cos(ph) * 2.2;
  const fold = dive ? 0.75 : 0;
  const body = look.suit;
  const wingPath = (dir) => {
    const p = P2();
    const up = lerp(flap, -0.2, fold);
    const tipX = dir * lerp(34, 18, fold), tipY = -26 * up - 2;
    const elbX = dir * 16, elbY = -12 * up - 5;
    p.moveTo(dir * 4, -5 + bob);
    p.quadraticCurveTo(elbX * 0.6, elbY - 4 + bob, elbX, elbY + bob);
    p.lineTo(tipX, tipY + bob);
    if (crow) {
      // feathered trailing edge
      const n = 5;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const x = lerp(tipX, dir * 6, t), y = lerp(tipY, 6, t) + bob;
        p.lineTo(x + dir * 3.2, y + 5.5);
        p.lineTo(x, y + 1.5);
      }
    } else {
      // membrane scallops between finger bones
      const fingers = [[tipX, tipY], [dir * 27, tipY * 0.35 + 10], [dir * 17, 9], [dir * 6, 6]];
      for (let i = 1; i < fingers.length; i++) {
        const [x0, y0] = fingers[i - 1], [x1, y1] = fingers[i];
        p.quadraticCurveTo((x0 + x1) / 2 - dir * 1, (y0 + y1) / 2 - 3.5 + bob, x1, y1 + bob);
      }
    }
    p.closePath();
    const bones = P2();
    if (!crow) {
      bones.moveTo(elbX, elbY + bob); bones.lineTo(dir * 27, tipY * 0.35 + 10 + bob);
      bones.moveTo(elbX, elbY + bob); bones.lineTo(dir * 17, 9 + bob);
    }
    return { p, bones };
  };
  const wb = wingPath(-1);
  P.layer();
  P.part(wb.p, crow ? body : look.suit, { back: true, flat: true });
  P.line(wb.bones, 0.8);
  P.layer();
  const b = P2(); ellipse(b, 0, 2 + bob, 10, 12);
  P.part(b, body, { c: [0, 2 + bob, 10], hi: true });
  const head = P2();
  ellipse(head, 6, -8 + bob, 8.2, 7.2);
  if (!crow) {
    head.moveTo(1.4, -12 + bob); head.quadraticCurveTo(-1, -21 + bob, 2.4, -24 + bob); head.quadraticCurveTo(5, -18 + bob, 5.6, -14 + bob); head.closePath();
    head.moveTo(7.4, -14 + bob); head.quadraticCurveTo(10.6, -22 + bob, 13.8, -21 + bob); head.quadraticCurveTo(13.4, -15 + bob, 12.4, -11 + bob); head.closePath();
  } else {
    head.moveTo(-1, -12 + bob); head.lineTo(-4, -15 + bob); head.lineTo(1, -14 + bob); head.closePath();
  }
  P.part(head, body, { c: [6, -8 + bob, 7], hi: true });
  // feet / tail
  const ft = P2();
  if (crow) { ft.moveTo(-6, 11 + bob); ft.lineTo(-14, 16 + bob); ft.lineTo(-11, 11 + bob); ft.lineTo(-15, 11 + bob); ft.lineTo(-7, 7 + bob); ft.closePath(); }
  else { ft.moveTo(-2, 13 + bob); ft.lineTo(-3, 17 + bob); ft.moveTo(3, 13 + bob); ft.lineTo(3.4, 17 + bob); }
  if (crow) P.part(ft, body, { flat: true }); else P.line(ft, 1.2);
  if (crow) {
    const beak = P2(); beak.moveTo(11.5, -10.5 + bob); beak.lineTo(22, -7 + bob); beak.lineTo(11.5, -5 + bob); beak.closePath();
    P.layer(1.4);
    P.part(beak, '#ffd23f', { c: [15, -7.5 + bob, 3] });
  } else {
    const mouth = P2(); mouth.moveTo(7.5, -4.4 + bob); mouth.quadraticCurveTo(10.5, -2.4 + bob, 13.2, -4.8 + bob);
    const fangs = P2(); fangs.moveTo(8.6, -3.8 + bob); fangs.lineTo(9.3, -1.2 + bob); fangs.lineTo(10.1, -3.4 + bob); fangs.closePath();
    fangs.moveTo(11.2, -3.6 + bob); fangs.lineTo(11.9, -1.2 + bob); fangs.lineTo(12.5, -3.9 + bob); fangs.closePath();
    P.fill(fangs, '#ffffff'); P.line(fangs, 0.6); P.line(mouth, 0.9);
    const nose = P2(); nose.moveTo(12.6, -8.6 + bob); nose.lineTo(14.6, -7.6 + bob); nose.lineTo(12.8, -6.4 + bob);
    P.line(nose, 0.9);
    const belly = P2(); ellipse(belly, 2, 5 + bob, 5, 6.5);
    P.fill(belly, look.suit2 || '#b33a3a');
  }
  // eye
  const eye = P2(); ellipse(eye, 9, -9.6 + bob, 2.4, 1.9, -0.25);
  const ec = opts.asleep ? '#bbbbbb' : look.eye || '#ffe14a';
  if (!opts.asleep && !opts.noFill) {
    P.fn((c) => { c.save(); c.globalAlpha *= 0.4; c.fillStyle = ec; c.beginPath(); c.arc(9, -9.6 + bob, 5, 0, TAU); c.fill(); c.restore(); });
  }
  P.fill(eye, ec); P.line(eye, 0.7);
  const pup = P2(); ellipse(pup, 9.8, -9.6 + bob, 0.7, 1.4); P.fill(pup, '#141414');
  const brow = P2(); brow.moveTo(5.4, -12.4 + bob); brow.lineTo(12, -10 + bob); P.line(brow, 1.2);
  const wf = wingPath(1);
  P.layer();
  P.part(wf.p, body, { c: [16, -6, 12] });
  P.line(wf.bones, 0.8);
  P.run();
  ctx.restore();
}

// --------------------------------------------------------------- saucer

export function drawSaucer(ctx, ent, A, opts) {
  const look = ent.look;
  const s = (look.scale || 1) * (ent.renderScale || 1);
  ctx.save();
  const hover = opts.asleep ? 0 : Math.sin(A.t * 3) * 2;
  ctx.translate(ent.x, ent.y - (ent.h || 34) / 2 + hover);
  ctx.rotate(clamp((A.svx || ent.vx || 0) / 1300, -0.3, 0.3));
  ctx.scale(s, s);
  if (!opts.asleep && !opts.noFill && !opts.ghost) {
    const g = ctx.createLinearGradient(0, 8, 0, 64);
    const aimK = ent.act === ACT.aim || ent.act === ACT.windup ? 0.6 : 0.3;
    g.addColorStop(0, `rgba(35,213,232,${aimK})`);
    g.addColorStop(1, 'rgba(35,213,232,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-10, 8); ctx.lineTo(10, 8); ctx.lineTo(26, 64); ctx.lineTo(-26, 64); ctx.closePath(); ctx.fill();
  }
  const P = cp.begin(ctx, opts, 2.2, ent.facing || 1);
  const dome = P2(); dome.moveTo(-14, -3); dome.quadraticCurveTo(-13, -19, 0, -19); dome.quadraticCurveTo(13, -19, 14, -3); dome.closePath();
  P.layer();
  P.part(dome, '#bfeaff', { c: [0, -8, 9], hi: true });
  const disc = P2(); disc.moveTo(-33, 1); disc.quadraticCurveTo(-26, -7, 0, -7.5); disc.quadraticCurveTo(26, -7, 33, 1); disc.quadraticCurveTo(24, 8, 0, 8.5); disc.quadraticCurveTo(-24, 8, -33, 1); disc.closePath();
  P.part(disc, look.suit, { c: [0, 0, 12], hi: true });
  const under = P2(); ellipse(under, 0, 7, 15, 4.6);
  P.part(under, '#5a6470', { c: [0, 7, 4] });
  const band = P2(); band.moveTo(-31, 1.5); band.quadraticCurveTo(0, 6.5, 31, 1.5);
  P.line(band, 1.1);
  // rim lights (only the front half)
  for (let i = 0; i < 6; i++) {
    const a = A.t * 3 + i * (TAU / 6);
    if (Math.sin(a) < 0) continue;
    const l = P2(); circle(l, Math.cos(a) * 25, 2.4 + Math.sin(a) * 2, 2.3);
    P.fill(l, i % 2 ? look.suit2 || '#ff3fa4' : '#ffe14a'); P.line(l, 0.8);
  }
  // cyclops eye in the dome
  const look2 = clamp((ent.aim != null ? Math.cos(ent.aim) : ent.facing || 1) * 3, -3, 3);
  const eye = P2(); circle(eye, look2 * 0.5, -9.5, 6);
  P.fill(eye, '#ffffff'); P.line(eye, 1);
  const iris = P2(); circle(iris, look2 * 0.5 + look2 * 0.6, -9.2, 3.4);
  P.fill(iris, opts.asleep ? '#999999' : look.eye || '#23d5e8');
  const pup = P2(); circle(pup, look2 * 0.5 + look2 * 0.75, -9.2, 1.6); P.fill(pup, '#141414');
  const lid = P2(); lid.moveTo(look2 * 0.5 - 6, -10.4); lid.quadraticCurveTo(look2 * 0.5, -17, look2 * 0.5 + 6, -10.8);
  if (ent.act === ACT.aim || ent.act === ACT.windup) P.line(lid, 1.8);
  const hl = P2(); hl.arc(0, -4, 11, -2.6, -1.9); P.line(hl, 1.6, '#ffffff');
  const ant = P2(); ant.moveTo(0, -19); ant.lineTo(0, -24); P.line(ant, 1.4);
  const bulb = P2(); circle(bulb, 0, -25, 1.8); P.fill(bulb, look.suit2 || '#ff3fa4'); P.line(bulb, 0.7);
  P.run();
  ctx.restore();
}

// --------------------------------------------------------------- brainjar

export function drawBrainJar(ctx, ent, A, opts) {
  const look = ent.look;
  ctx.save();
  const bob = opts.asleep ? 0 : Math.sin(A.t * 1.6) * 4;
  ctx.translate(ent.x, ent.y - (ent.h || 150) / 2 + bob);
  const js = (look.scale || 2.2) / 2.2 * (ent.renderScale || 1);
  ctx.scale(js, js);
  const P = cp.begin(ctx, opts, 3, ent.facing || 1);
  // tentacles (behind)
  P.layer(2.6);
  for (let i = 0; i < 6; i++) {
    const bx = -45 + i * 18;
    const p = P2();
    const pts = [];
    for (let k = 0; k <= 7; k++) {
      const t = k / 7;
      const w = opts.asleep ? 0 : Math.sin(A.t * 2.6 + i * 1.1 + k * 0.7) * (3 + k * 2.4);
      pts.push([bx + w + (i - 2.5) * k * 1.4, 44 + k * 10.5, 5.5 * (1 - t * 0.75)]);
    }
    p.moveTo(pts[0][0] - pts[0][2], pts[0][1]);
    for (const [x, y, r] of pts) p.lineTo(x - r, y);
    const last = pts[pts.length - 1];
    p.arc(last[0], last[1], last[2], PI, 0, true);
    for (let k = pts.length - 1; k >= 0; k--) p.lineTo(pts[k][0] + pts[k][2], pts[k][1]);
    p.closePath();
    P.part(p, '#9a4ad8', { c: [bx, 70, 6], hi: true });
  }
  // base machinery
  P.layer();
  const base = P2(); base.moveTo(-60, 18); base.lineTo(60, 18); base.lineTo(49, 50); base.quadraticCurveTo(0, 56, -49, 50); base.closePath();
  P.part(base, look.suit, { c: [0, 32, 20], hi: true, dots: true });
  const collar = P2(); rrect(collar, -56, 12, 112, 10, 4);
  P.part(collar, '#6a7480', { c: [0, 17, 5] });
  for (let i = 0; i < 5; i++) {
    const l = P2(); circle(l, -32 + i * 16, 34, 4);
    P.fill(l, (Math.floor(A.t * 4) + i) % 2 ? look.suit2 || '#ff3fa4' : '#ffe14a'); P.line(l, 1);
  }
  // liquid
  P.fn((c, Pp) => {
    if (Pp.o.noFill) return;
    c.save();
    c.fillStyle = Pp.o.asleep ? '#dddddd' : 'rgba(120,255,200,0.3)';
    c.beginPath(); c.ellipse(0, -20, 54, 46, 0, 0, TAU); c.fill();
    if (!Pp.o.asleep) {
      c.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < 6; i++) { const y = 10 - ((A.t * 22 + i * 17) % 60); c.beginPath(); c.arc(-30 + i * 12 + Math.sin(A.t + i) * 3, y, 1.6 + (i % 3) * 0.6, 0, TAU); c.fill(); }
    }
    c.restore();
  });
  // brain
  P.layer(2.6);
  const brain = P2();
  brain.moveTo(-38, -14); brain.quadraticCurveTo(-42, -42, -14, -48); brain.quadraticCurveTo(0, -54, 14, -48); brain.quadraticCurveTo(42, -42, 38, -14);
  brain.quadraticCurveTo(36, 8, 0, 10); brain.quadraticCurveTo(-36, 8, -38, -14); brain.closePath();
  P.part(brain, '#f7a8c8', { c: [0, -20, 26], hi: true });
  const folds = P2();
  folds.moveTo(-32, -18); folds.quadraticCurveTo(-24, -38, -12, -24); folds.quadraticCurveTo(-4, -12, 6, -28); folds.quadraticCurveTo(16, -44, 30, -22);
  folds.moveTo(-26, -2); folds.quadraticCurveTo(-14, -10, -4, 0); folds.moveTo(8, 0); folds.quadraticCurveTo(20, -8, 30, -2);
  folds.moveTo(0, -48); folds.quadraticCurveTo(-4, -30, 0, -8);
  folds.moveTo(-22, -40); folds.quadraticCurveTo(-18, -30, -26, -26); folds.moveTo(20, -40); folds.quadraticCurveTo(16, -32, 24, -28);
  P.line(folds, 1.8, '#9a3a5a');
  // eye
  const eyeX = clamp((ent.aim != null ? Math.cos(ent.aim) : ent.facing || 1) * 6, -6, 6);
  const eyeY = clamp(ent.aim != null ? Math.sin(ent.aim) * 4 : 0, -4, 4);
  const blink = A.blink < 0 && !opts.asleep;
  const eye = P2(); ellipse(eye, 0, -14, 14, blink ? 2 : 12);
  P.fill(eye, '#ffffff'); P.line(eye, 2);
  if (!blink) {
    const iris = P2(); circle(iris, eyeX, -14 + eyeY, 6.6);
    P.fill(iris, opts.asleep ? '#999999' : look.eye || '#ffe14a'); P.line(iris, 1.2);
    const pup = P2(); circle(pup, eyeX * 1.15, -14 + eyeY * 1.1, 3); P.fill(pup, '#141414');
    const gl = P2(); circle(gl, eyeX - 2, -17 + eyeY, 1.4); P.fill(gl, '#ffffff');
  }
  const angry = ent.act === ACT.windup || ent.act === ACT.spray || ent.act === ACT.dive;
  if (angry) { const b = P2(); b.moveTo(-16, -30); b.lineTo(10, -24); P.line(b, 3); }
  // glass
  const glass = P2(); ellipse(glass, 0, -20, 54, 46);
  P.line(glass, 3);
  const hl = P2(); hl.ellipse(0, -20, 44, 37, 0, -2.7, -1.9); P.line(hl, 3.2, '#ffffff');
  const hl2 = P2(); hl2.ellipse(0, -20, 44, 37, 0, 0.3, 0.6); P.line(hl2, 2.2, '#ffffff');
  P.run();
  ctx.restore();
}

export { sat, frame };
