// Weapons, shields and gear. Every weapon is drawn with its origin at the
// grip (where the fist closes) pointing +x.

import { Painter, frame } from './painter.js';
import { limbPath, circle, ellipse, rrect, poly, smoothPoly, TAU, PI, clamp } from './util.js';

// hold: how the rig carries it. ay: barrel axis y (relative to the grip) so
// aimed guns put the barrel on the aim line. fore: support-hand point.
export const WMETA = {
  pistol: { hs: 0.8, hold: 'pistol', ay: -5, muzzle: [24, -5], mag: [-1.5, 7], kickBack: 4.5, kickUp: 0.45, heavy: 0.3 },
  shotgun: { hs: 0.9, hold: 'rifle', ay: -3.2, fore: [23, 1.8], muzzle: [43, -3.3], mag: [9, 1], kickBack: 8, kickUp: 0.6, heavy: 0.9 },
  smg: { hs: 0.9, hold: 'rifle', ay: -2.6, fore: [24, 4.5], muzzle: [43, -2.6], mag: [7, 5], kickBack: 2.2, kickUp: 0.16, heavy: 0.3 },
  tommy: { hs: 0.9, hold: 'rifle', ay: -2.6, fore: [24, 4.5], muzzle: [43, -2.6], mag: [7, 5], kickBack: 2.2, kickUp: 0.16, heavy: 0.3 },
  launcher: { hs: 0.92, hold: 'heavy', ay: -8, fore: [22, 2], muzzle: [49, -8], mag: [-12, -8], kickBack: 6, kickUp: 0.4, heavy: 1 },
  rail: { hs: 0.9, hold: 'rifle', ay: -3, fore: [27, 4.5], muzzle: [54, -3], mag: [12, -9], kickBack: 6.5, kickUp: 0.35, heavy: 0.8 },
  blade: { hs: 0.95, hold: 'blade' },
  raygun: { hs: 0.82, hold: 'pistol', ay: -4.5, muzzle: [31, -4], mag: [-1, 7], kickBack: 3, kickUp: 0.3, heavy: 0.2 },
  blaster: { hs: 0.84, hold: 'pistol', ay: -4, muzzle: [27, -4], mag: [-1, 7], kickBack: 3, kickUp: 0.3, heavy: 0.2 },
  crowbar: { hold: 'club' },
  bat: { hold: 'club' },
  baton: { hold: 'club' },
  grenade: { hold: 'throw' },
  molotov: { hold: 'throw' },
  pencil: { hold: 'pencil' },
  claws: { hold: 'claws' },
  none: { hold: 'none' },
};

const GUNMETAL = '#4a4f5a', STEEL = '#c3cad4', DARK = '#2a2d34', WOOD = '#9a6230', WOOD2 = '#7a4a22', RED = '#e8262b', GOLD = '#ffd23f';

function P2() { return new Path2D(); }
function R(x, y, w, h, r = 0) { const p = P2(); return r ? rrect(p, x, y, w, h, r) : (p.rect(x, y, w, h), p); }

// Adds the weapon's parts to painter P in frame m. v: variant flags.
export function weaponParts(P, key, m, v = {}) {
  const lw = v.lw || 1.75;
  const sh = (c, r = 4) => ({ m, c: [c[0], c[1], r] });
  switch (key) {
    case 'pistol': {
      P.layer(lw);
      const grip = P2();
      grip.moveTo(-3.8, -3); grip.lineTo(3.6, -3); grip.lineTo(2.6, 3); grip.quadraticCurveTo(2.2, 9.5, -1.2, 10);
      grip.lineTo(-6.8, 9.6); grip.quadraticCurveTo(-5.6, 3, -3.8, -3); grip.closePath();
      P.part(grip, '#b8171b', sh([-2, 4], 5));
      const guard = P2(); guard.moveTo(2.5, -1); guard.quadraticCurveTo(3, 4, 8.5, 3.6); guard.lineTo(9.5, -1.5);
      guard.lineTo(8, -1.5); guard.quadraticCurveTo(7.2, 2.2, 4.4, 2); guard.lineTo(4.2, -1); guard.closePath();
      P.part(guard, DARK, { m });
      const frameP = R(-4.5, -3.8, 17.5, 4.2, 1.2);
      P.part(frameP, GUNMETAL, sh([4, -1.8], 3));
      const slide = P2();
      slide.moveTo(-6, -9); slide.lineTo(19.5, -9.2); slide.quadraticCurveTo(21.5, -9, 21.5, -7);
      slide.lineTo(21.5, -3.6); slide.lineTo(-5.5, -3.2); slide.quadraticCurveTo(-7, -5, -6, -9); slide.closePath();
      P.part(slide, STEEL, { m, c: [7, -6, 7], hi: true });
      const muzzle = R(20.5, -8.4, 3.6, 4.2, 1);
      P.part(muzzle, GUNMETAL, { m });
      const ham = P2(); ham.moveTo(-6, -8); ham.lineTo(-8.8, -10.6); ham.lineTo(-7.2, -11.6); ham.lineTo(-4.5, -9); ham.closePath();
      P.part(ham, DARK, { m });
      const sight = R(16.5, -10.8, 2.6, 2, 0.6);
      P.part(sight, DARK, { m });
      const det = P2();
      for (let i = 0; i < 3; i++) { det.moveTo(-3.5 + i * 1.8, -8.2); det.lineTo(-3.8 + i * 1.8, -4.2); }
      det.moveTo(5, -6.4); det.lineTo(15, -6.5);
      P.line(det, 0.8, null, m);
      const star = P2(); starPath(star, -2.1, 3.8, 2.2, 1);
      P.fill(star, GOLD, m);
      break;
    }
    case 'raygun': {
      P.layer(lw);
      const grip = P2(); grip.moveTo(-3.5, -2); grip.lineTo(3.4, -2); grip.lineTo(1.8, 9); grip.quadraticCurveTo(-2, 11, -6, 9.4); grip.closePath();
      P.part(grip, v.grip || '#7b3fb8', sh([-1.5, 4], 5));
      const body = P2();
      body.moveTo(-7, -8); body.quadraticCurveTo(0, -12, 12, -9); body.quadraticCurveTo(18, -8, 19, -4);
      body.quadraticCurveTo(18, 0, 12, 1); body.quadraticCurveTo(0, 3, -7, -1); body.quadraticCurveTo(-10, -4.5, -7, -8); body.closePath();
      P.part(body, STEEL, { m, c: [5, -4, 8], hi: true });
      const fin = P2(); fin.moveTo(-5, -8.5); fin.lineTo(-9, -13); fin.lineTo(-2, -10.5); fin.closePath();
      fin.moveTo(-5, 0.5); fin.lineTo(-9.5, 4); fin.lineTo(-2, 2); fin.closePath();
      P.part(fin, RED, { m });
      const bar = R(18, -6, 8, 4, 1);
      P.part(bar, GUNMETAL, { m });
      P.layer(lw);
      for (let i = 0; i < 3; i++) { const r = R(20 + i * 2.6 - 16 + 6, -8.6 + i * 0.4, 1.8, 9.2 - i * 0.8, 0.8); P.part(r, GOLD, { m }); }
      const bulb = P2(); circle(bulb, 28.5, -4, 3.4);
      P.part(bulb, v.glow || '#7fffd4', { m, c: [28.5, -4, 3.4], hi: true });
      break;
    }
    case 'blaster': {
      P.layer(lw);
      const grip = P2(); grip.moveTo(-3, -2); grip.lineTo(3.4, -2); grip.lineTo(2.2, 9); grip.lineTo(-4.4, 9.6); grip.closePath();
      P.part(grip, '#3a3a4a', sh([-1, 4], 5));
      const body = P2(); body.moveTo(-6, -9); body.lineTo(16, -9); body.lineTo(22, -6.5); body.lineTo(22, -2.5); body.lineTo(14, -0.5); body.lineTo(-5, -0.5); body.lineTo(-7.5, -4.5); body.closePath();
      P.part(body, '#eceef4', { m, c: [7, -5, 7], hi: true });
      const em = R(21, -7, 6, 5, 1.2);
      P.part(em, '#ff3fa4', { m });
      const vent = P2(); vent.moveTo(2, -6.5); vent.lineTo(12, -6.5); vent.moveTo(2, -3.5); vent.lineTo(10, -3.5);
      P.line(vent, 0.9, null, m);
      break;
    }
    case 'shotgun': {
      P.layer(lw);
      const stock = P2();
      stock.moveTo(-1, -5.5); stock.lineTo(-21, -6.5); stock.quadraticCurveTo(-24, -1, -22, 5); stock.lineTo(-4, 3.5); stock.lineTo(0, 7); stock.lineTo(4, 7); stock.lineTo(3, 0); stock.closePath();
      P.part(stock, WOOD, { m, c: [-9, 0, 7] });
      const butt = R(-24.5, -6.8, 3.2, 12, 1); P.part(butt, DARK, { m });
      const rec = R(-2, -7.2, 13, 8, 1.5); P.part(rec, GUNMETAL, sh([4, -3], 4));
      const b1 = R(10, -7.2, 33, 3.6, 1.2); P.part(b1, '#5a606c', { m, c: [26, -5.4, 3], hi: true });
      const b2 = R(10, -3.6, 33, 3.6, 1.2); P.part(b2, GUNMETAL, { m, c: [26, -1.8, 3] });
      const fore = P2(); rrect(fore, 15, -0.5, 17, 5.4, 2.2);
      P.part(fore, WOOD, { m, c: [23, 2, 3] });
      const d = P2();
      for (let i = 0; i < 4; i++) { d.moveTo(18 + i * 3.4, 0.4); d.lineTo(18 + i * 3.4, 4); }
      d.moveTo(-18, -2); d.quadraticCurveTo(-10, -3, -4, -1.5);
      P.line(d, 0.8, null, m);
      const bead = P2(); circle(bead, 41.5, -7.8, 1); P.fill(bead, GOLD, m);
      break;
    }
    case 'smg':
    case 'tommy': {
      const gold = v.gold;
      const metal = gold ? '#e0b83a' : GUNMETAL;
      P.layer(lw);
      const stock = P2();
      stock.moveTo(-2, -4.5); stock.lineTo(-21, -5); stock.quadraticCurveTo(-23.5, 0, -21.5, 5.5); stock.lineTo(-3, 2.5); stock.closePath();
      P.part(stock, WOOD, { m, c: [-11, 0, 6] });
      const grip = P2(); grip.moveTo(-2.5, -1); grip.lineTo(3, -1); grip.lineTo(2, 9); grip.lineTo(-3.5, 8.5); grip.closePath();
      P.part(grip, WOOD2, { m });
      const fgrip = P2(); fgrip.moveTo(21, 0); fgrip.lineTo(26.5, 0); fgrip.lineTo(26, 9); fgrip.quadraticCurveTo(23.5, 10.5, 21.5, 9); fgrip.closePath();
      P.part(fgrip, WOOD, { m });
      const rec = R(-3, -6.6, 18, 7.6, 1.6); P.part(rec, metal, { m, c: [6, -3, 4], hi: true });
      const barrel = R(15, -5, 23, 4.8, 1.2); P.part(barrel, gold ? '#c99a28' : '#3b3f48', { m, c: [26, -2.6, 2.5] });
      const comp = R(37.5, -6, 6, 6.8, 1.4); P.part(comp, metal, { m });
      const drum = P2(); circle(drum, 7, 6.5, 7.4);
      P.part(drum, metal, { m, c: [7, 6.5, 7.4], hi: true });
      const d = P2();
      for (let i = 0; i < 6; i++) { d.moveTo(17 + i * 3.4, -4.6); d.lineTo(17 + i * 3.4, -0.6); }
      P.line(d, 0.8, null, m);
      const hub = P2(); circle(hub, 7, 6.5, 2.4); P.fill(hub, gold ? '#fff2a8' : '#9aa2ae', m); P.line(hub, 0.8, null, m);
      break;
    }
    case 'launcher': {
      P.layer(lw);
      const grip = P2(); grip.moveTo(-3, -2.5); grip.lineTo(3.5, -2.5); grip.lineTo(2.5, 8.5); grip.lineTo(-4, 8); grip.closePath();
      P.part(grip, DARK, { m });
      const fg = P2(); fg.moveTo(19.5, -2.5); fg.lineTo(24.5, -2.5); fg.lineTo(24, 6); fg.lineTo(20, 6); fg.closePath();
      P.part(fg, DARK, { m });
      const tube = P2();
      tube.moveTo(-17, -13.6); tube.lineTo(34, -13.6); tube.quadraticCurveTo(40, -15, 48.5, -18); tube.lineTo(49.5, 2); tube.quadraticCurveTo(40, -1, 34, -2.4);
      tube.lineTo(-17, -2.4); tube.quadraticCurveTo(-19.5, -8, -17, -13.6); tube.closePath();
      P.part(tube, RED, { m, c: [15, -8, 9], hi: true, dots: true });
      const sight = R(-2, -19, 8, 5.5, 1.4); P.part(sight, DARK, { m });
      const lens = R(4.5, -18.2, 2.2, 3.8, 0.6); P.fill(lens, '#23d5e8', m);
      const bands = P2();
      for (const x of [-11, 3, 29]) { bands.rect(x, -13.6, 3.2, 11.2); }
      P.fill(bands, GOLD, m);
      P.line(bands, 0.9, null, m);
      const st = P2(); starPath(st, 16, -8, 4.2, 5); P.fill(st, GOLD, m); P.line(st, 0.9, null, m);
      const bell = P2(); bell.moveTo(48.5, -18); bell.lineTo(49.5, 2); P.line(bell, 2.2, null, m);
      break;
    }
    case 'rail': {
      P.layer(lw);
      const body = P2();
      body.moveTo(-19, -7); body.lineTo(9, -8); body.lineTo(11, 3); body.lineTo(-4, 3.5); body.lineTo(-18, 5); body.quadraticCurveTo(-21, -1, -19, -7); body.closePath();
      P.part(body, '#2d3040', { m, c: [-4, -1, 7] });
      const grip = P2(); grip.moveTo(-3, 1); grip.lineTo(3, 1); grip.lineTo(2, 9); grip.lineTo(-4, 8.6); grip.closePath();
      P.part(grip, '#1d1f2a', { m });
      const r1 = R(8, -9, 46, 3.4, 1.4); P.part(r1, '#e9eef4', { m, c: [30, -7.3, 2.5], hi: true });
      const r2 = R(8, 1.2, 43, 3.2, 1.4); P.part(r2, '#aab3c0', { m, c: [30, 2.8, 2.5] });
      const fg = R(25, 3.5, 5, 6, 1.5); P.part(fg, '#1d1f2a', { m });
      const vial = P2(); rrect(vial, 9, -15.5, 14, 6, 3);
      P.part(vial, '#dff6ff', { m, c: [16, -12.5, 3], hi: true });
      const ink = R(10.5, -13.2, 11, 2.6, 1.3); P.fill(ink, '#141414', m);
      P.fn((ctx, Pp) => {
        if (Pp.o.asleep || Pp.o.noFill) return;
        ctx.fillStyle = Pp.col('#23d5e8');
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(16 + i * 7.5, -2.9, 1.8, 4.4, 0, 0, TAU); ctx.fill(); }
      }, m);
      const coil = P2();
      for (let i = 0; i < 5; i++) { coil.moveTo(17.8 + i * 7.5, -2.9); coil.ellipse(16 + i * 7.5, -2.9, 1.8, 4.4, 0, 0, TAU); }
      P.line(coil, 0.9, null, m);
      break;
    }
    case 'blade': {
      // PANEL CUTTER: a giant hobby knife with a glowing edge
      P.layer(lw);
      const handle = P2(); rrect(handle, -12, -3.2, 21, 6.4, 3);
      P.part(handle, '#b9c1cc', { m, c: [-1.5, 0, 3.2], hi: true });
      const collet = P2(); collet.moveTo(9, -3.6); collet.lineTo(14.5, -2.4); collet.lineTo(14.5, 2.4); collet.lineTo(9, 3.6); collet.closePath();
      P.part(collet, GOLD, { m });
      const blade = P2();
      blade.moveTo(14, -2.6); blade.lineTo(56, -2.6); blade.lineTo(68, -2.6); blade.lineTo(57, 3.4); blade.lineTo(14, 3.2); blade.closePath();
      P.part(blade, '#eef3f7', { m, c: [40, 0.3, 3], hi: true });
      const knurl = P2();
      for (let i = 0; i < 6; i++) { knurl.moveTo(-9 + i * 2.8, -2.6); knurl.lineTo(-8 + i * 2.8, 2.6); }
      P.line(knurl, 0.7, null, m);
      P.fn((ctx, Pp) => {
        if (Pp.o.noFill || Pp.o.asleep) return;
        ctx.strokeStyle = Pp.col('#ff3fa4');
        ctx.lineWidth = 2.2;
        ctx.globalAlpha *= 0.9;
        ctx.beginPath(); ctx.moveTo(16, 2.3); ctx.lineTo(57, 2.4); ctx.lineTo(66, -2); ctx.stroke();
        ctx.globalAlpha /= 0.9;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(18, 2.2); ctx.lineTo(56, 2.3); ctx.stroke();
      }, m);
      break;
    }
    case 'crowbar': {
      P.layer(lw);
      const bar = P2();
      bar.moveTo(-8, -2.4); bar.lineTo(33, -2.2); bar.quadraticCurveTo(41, -2.6, 41, -9); bar.quadraticCurveTo(40.5, -13, 37, -13.8);
      bar.lineTo(36.2, -11.4); bar.quadraticCurveTo(37.6, -10.2, 37.2, -7.8); bar.quadraticCurveTo(36.6, 2.4, 31, 2.2);
      bar.lineTo(-7, 2.2); bar.lineTo(-11, 3.6); bar.lineTo(-11.5, 1); bar.closePath();
      P.part(bar, v.color || '#c81e22', { m, flat: true });
      const hl = P2(); hl.moveTo(-6, -0.9); hl.lineTo(31, -0.9); hl.quadraticCurveTo(38.6, -1.4, 38.8, -8.4);
      P.line(hl, 0.9, '#ff7a6a', m);
      break;
    }
    case 'bat': {
      P.layer(lw);
      const b = P2();
      b.moveTo(-9, -1.8); b.lineTo(7, -1.9); b.quadraticCurveTo(24, -3, 38, -4.4); b.quadraticCurveTo(44, -4.6, 44, 0);
      b.quadraticCurveTo(44, 4.6, 38, 4.4); b.quadraticCurveTo(24, 3, 7, 1.9); b.lineTo(-9, 1.8); b.closePath();
      P.part(b, '#d4a262', { m, c: [22, 0, 3], hi: true });
      const knob = P2(); ellipse(knob, -9.5, 0, 1.8, 3.1); P.part(knob, '#b8823f', { m });
      const tape = P2(); tape.rect(-8, -2.1, 11, 4.2); P.fill(tape, '#2a2a2a', m);
      const tl = P2(); for (let i = 0; i < 4; i++) { tl.moveTo(-7 + i * 2.6, -2); tl.lineTo(-5.6 + i * 2.6, 2); } P.line(tl, 0.6, '#555555', m);
      const grain = P2(); grain.moveTo(14, -0.4); grain.quadraticCurveTo(26, -1.8, 38, -1.2); P.line(grain, 0.7, '#9a6a30', m);
      break;
    }
    case 'baton': {
      P.layer(lw);
      const b = P2(); rrect(b, -9, -2.4, 40, 4.8, 2.4);
      P.part(b, '#26282e', { m, c: [11, 0, 2.4], hi: true });
      const side = P2(); rrect(side, 1, 1.5, 3.4, 9, 1.4); P.part(side, '#26282e', { m });
      const band = P2(); band.rect(-7, -2.4, 3, 4.8); P.fill(band, '#555a66', m);
      break;
    }
    case 'grenade': {
      const plasma = v.plasma;
      P.layer(lw);
      if (plasma) {
        const o = P2(); circle(o, 0, -6, 5.6);
        P.part(o, v.glow || '#ff3fa4', { m, c: [0, -6, 5.6], hi: true });
        const ring = P2(); ellipse(ring, 0, -6, 7.6, 2.4, -0.3); P.line(ring, 1.1, '#23d5e8', m);
      } else {
        const bomb = P2(); circle(bomb, 0, -6, 5.8);
        P.part(bomb, '#2a2b33', { m, c: [0, -6, 5.8], hi: true });
        const cap = R(-2.2, -13.4, 4.4, 2.6, 0.8); P.part(cap, '#6a6f7c', { m });
        const fuse = P2(); fuse.moveTo(0, -13); fuse.quadraticCurveTo(2.5, -16.5, 5, -15.5); P.line(fuse, 1.3, '#8a6a3a', m);
        const shine = P2(); shine.arc(0, -6, 3.8, -2.6, -1.8); P.line(shine, 1.1, '#ffffff', m);
        P.fn((ctx, Pp) => {
          if (Pp.o.asleep || Pp.o.noFill) return;
          const t = performance.now() / 1000;
          ctx.fillStyle = '#ffd23f';
          ctx.beginPath();
          for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + t * 9, r = i % 2 ? 1.2 : 3.2; ctx.lineTo(5.5 + Math.cos(a) * r, -16 + Math.sin(a) * r); }
          ctx.fill();
        }, m);
      }
      break;
    }
    case 'molotov': {
      P.layer(lw);
      const b = P2();
      b.moveTo(-3.6, -1); b.lineTo(3.6, -1); b.lineTo(3.8, -8); b.quadraticCurveTo(3.6, -10, 1.6, -11); b.lineTo(1.4, -15); b.lineTo(-1.4, -15); b.lineTo(-1.6, -11); b.quadraticCurveTo(-3.6, -10, -3.8, -8); b.closePath();
      P.part(b, '#4f8a3a', { m, c: [0, -6, 3.5], hi: true });
      const lab = R(-3.7, -7.4, 7.4, 3.4); P.fill(lab, '#e8dcc0', m);
      const rag = P2(); rag.moveTo(-1.5, -15); rag.quadraticCurveTo(-3, -19, 0.5, -20); rag.quadraticCurveTo(3, -18, 1.4, -15); rag.closePath();
      P.part(rag, '#e8dcc0', { m });
      P.fn((ctx, Pp) => {
        if (Pp.o.asleep || Pp.o.noFill) return;
        const t = performance.now() / 1000;
        const f = 1 + Math.sin(t * 23) * 0.15;
        ctx.fillStyle = '#ff7a1a';
        ctx.beginPath(); ctx.moveTo(-2.5, -20); ctx.quadraticCurveTo(-3, -26 * f, 1, -29 * f); ctx.quadraticCurveTo(4, -24 * f, 3, -20); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.moveTo(-1.2, -20.5); ctx.quadraticCurveTo(-1, -24 * f, 0.8, -25.5 * f); ctx.quadraticCurveTo(2.2, -23 * f, 1.8, -20.5); ctx.closePath(); ctx.fill();
      }, m);
      break;
    }
    case 'pencil': {
      P.layer(lw);
      const body = P2(); body.moveTo(-17, -3.6); body.lineTo(26, -3.6); body.lineTo(26, 3.6); body.lineTo(-17, 3.6); body.closePath();
      P.part(body, v.color || '#ffc928', { m, c: [4, 0, 3.6], hi: true });
      const facet = P2(); facet.moveTo(-17, -1.1); facet.lineTo(26, -1.1); P.line(facet, 0.8, '#c8901a', m);
      const cone = P2(); cone.moveTo(26, -3.6); cone.lineTo(37, -0.6); cone.lineTo(37, 0.6); cone.lineTo(26, 3.6); cone.closePath();
      P.part(cone, '#f2d2a2', { m, c: [30, 0, 2.4] });
      const lead = P2(); lead.moveTo(34, -1.3); lead.lineTo(39, 0); lead.lineTo(34, 1.3); lead.closePath();
      P.fill(lead, v.lead || '#2a2a2a', m);
      const fer = R(-21, -3.9, 4.4, 7.8, 0.6); P.part(fer, '#c9ced6', { m });
      const fl = P2(); fl.moveTo(-19.6, -3.8); fl.lineTo(-19.6, 3.8); fl.moveTo(-18.2, -3.8); fl.lineTo(-18.2, 3.8); P.line(fl, 0.6, null, m);
      const er = P2(); er.moveTo(-21, -3.6); er.lineTo(-24, -3.6); er.quadraticCurveTo(-26, -3.4, -26, 0); er.quadraticCurveTo(-26, 3.4, -24, 3.6); er.lineTo(-21, 3.6); er.closePath();
      P.part(er, '#ff8fa8', { m });
      break;
    }
    case 'mag': {
      P.layer(1.3);
      const g = R(-2, -1, 4, 8, 0.8); P.part(g, DARK, { m });
      break;
    }
    default:
      break;
  }
}

function starPath(p, x, y, r, rot = 0) {
  for (let i = 0; i < 10; i++) {
    const a = -PI / 2 + rot * 0 + (i / 10) * TAU;
    const rr = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) p.moveTo(px, py); else p.lineTo(px, py);
  }
  p.closePath();
  return p;
}
export { starPath };

const _wp = new Painter();
// Standalone weapon icon (HUD, pickups). Origin at the grip, pointing +x.
export function drawWeapon(ctx, key, o = {}) {
  ctx.save();
  const P = _wp.begin(ctx, o, 1.75, 1);
  weaponParts(P, key, null, { lw: 1.9, gold: o.gold });
  P.run();
  ctx.restore();
}

// ------------------------------------------------------------- shields

// Drawn in the shield's frame m: origin at the holding fist.
export function shieldParts(P, sh, m, t) {
  const kind = sh.kind || 'riot';
  const col = sh.color || '#9fc4dc';
  if (kind === 'energy') {
    P.fn((ctx, Pp) => {
      if (Pp.o.noFill) return;
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      const c = Pp.col(col);
      ctx.save();
      ctx.globalAlpha *= 0.28 + pulse * 0.1;
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(8, -8, 7.5, 34, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha /= 0.28 + pulse * 0.1;
      ctx.globalAlpha *= 0.9;
      ctx.strokeStyle = c; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(8, -8, 7.5, 34, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = -3; i <= 3; i++) { const y = -8 + i * 9; const w = Math.sqrt(Math.max(0, 1 - (i * 9 / 34) ** 2)) * 7; ctx.moveTo(8 - w, y); ctx.lineTo(8 + w, y + 3); }
      ctx.stroke();
      ctx.restore();
    }, m);
    P.layer(1.6);
    const em = P2(); rrect(em, -3.5, -4, 7, 8, 2);
    P.part(em, '#3a3a4a', { m });
    return;
  }
  if (kind === 'door') {
    P.layer(2.2);
    const d = P2();
    d.moveTo(-2, -30); d.quadraticCurveTo(4, -40, 16, -40); d.lineTo(19, -40); d.lineTo(19, 20); d.quadraticCurveTo(19, 24, 15, 24); d.lineTo(-1, 24); d.quadraticCurveTo(-4, 24, -4, 20); d.closePath();
    P.part(d, col, { m, c: [8, -8, 16], hi: true });
    const win = P2(); win.moveTo(1, -29); win.quadraticCurveTo(6, -36.5, 15.5, -36.5); win.lineTo(16, -14); win.lineTo(1, -14); win.closePath();
    P.part(win, '#a9bcc8', { m, c: [9, -24, 7] });
    const gl = P2(); gl.moveTo(5, -30); gl.lineTo(12, -17); gl.moveTo(9, -33); gl.lineTo(14, -24); P.line(gl, 1.2, '#ffffff', m);
    const h = R(9, -9, 7, 2.4, 1); P.fill(h, '#d8dde2', m); P.line(h, 0.8, null, m);
    const seam = P2(); seam.moveTo(-3, 6); seam.lineTo(18, 6); P.line(seam, 1, null, m);
    const holes = P2(); for (const [x, y] of [[4, 12], [11, 15], [7, -4]]) circle(holes, x, y, 1.2);
    P.fill(holes, '#141414', m);
    return;
  }
  // riot: tall slab turned toward the viewer, thick visible edge
  P.layer(2.2);
  const edge = P2(); rrect(edge, 5, -38, 9, 70, 4);
  P.part(edge, col, { m, flat: true, back: true });
  const slab = P2(); rrect(slab, -3, -39, 15, 70, 4);
  P.part(slab, col, { m, c: [4.5, -4, 8], hi: true });
  const slot = R(0.5, -30, 8, 3.4, 1.4); P.fill(slot, '#1d2530', m);
  const hl = P2(); hl.moveTo(1, -22); hl.lineTo(1, 20); hl.moveTo(3.2, -24); hl.lineTo(3.2, -8); P.line(hl, 1.3, '#ffffff', m);
  const band = R(-3, 9, 15, 4); P.fill(band, '#ffd23f', m); P.line(band, 0.8, null, m);
}

// ---------------------------------------------------------------- gear

// Jetpack / air tank on the back: frame m = torso chest frame.
export function backpackParts(P, kind, m, B) {
  P.layer(1.9);
  const x = -11.5 * B.chest;
  if (kind === 'jetpack') {
    const tank = P2(); rrect(tank, x - 9, -20, 9, 24, 4);
    P.part(tank, '#6f7f90', { m, c: [x - 4.5, -8, 4.5], hi: true });
    const tank2 = P2(); rrect(tank2, x - 5, -21, 7, 25, 3.5);
    P.part(tank2, '#8595a6', { m, c: [x - 1.5, -8, 3.5], hi: true });
    const noz = P2(); noz.moveTo(x - 8, 4); noz.lineTo(x - 1, 4); noz.lineTo(x, 8); noz.lineTo(x - 9, 8); noz.closePath();
    P.part(noz, '#2a2d34', { m });
  } else {
    const tank = P2(); rrect(tank, x - 6, -19, 8, 22, 4);
    P.part(tank, '#e6ebf0', { m, c: [x - 2, -8, 4], hi: true });
    const band = R(x - 6, -12, 8, 3); P.fill(band, '#ff7a1a', m);
    const hose = P2(); hose.moveTo(x - 1, -18); hose.quadraticCurveTo(x + 2, -26, x + 9, -22);
    P.line(hose, 2.2, null, m); P.line(hose, 1, '#9aa2ae', m);
  }
}

export function jetFlame(ctx, x, y, s, t, col = '#ffb21f') {
  const len = (12 + Math.sin(t * 40) * 3 + Math.sin(t * 23) * 2) * s;
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(x - 4 * s, y); ctx.quadraticCurveTo(x - 1 * s, y + len * 0.8, x, y + len); ctx.quadraticCurveTo(x + 1 * s, y + len * 0.8, x + 4 * s, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff6c8';
  ctx.beginPath(); ctx.moveTo(x - 2 * s, y); ctx.quadraticCurveTo(x, y + len * 0.55, x, y + len * 0.6); ctx.quadraticCurveTo(x, y + len * 0.55, x + 2 * s, y); ctx.closePath(); ctx.fill();
}

export { clamp, limbPath, poly, smoothPoly, frame };
