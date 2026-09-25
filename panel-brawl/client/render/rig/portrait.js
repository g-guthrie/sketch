// Heroic 3/4 bust for the HUD card and the hero-select screen.
// Chest out, chin up, square shoulders, fists on the hips, cape behind.

import { makeAnim, updateAnim } from './anim.js';
import { drawHumanoid } from './body.js';
import { shoulderOfT } from './pose.js';

const ents = new WeakMap();

function heroPose(T, C) {
  const B = C.B;
  const t = C.t;
  const br = Math.sin(t * 1.7);
  T.br = br;
  T.px = 0; T.py = -B.hipH; T.pel = 0.02;
  T.lean = -0.1 + br * 0.012;
  T.tw = -0.3;
  T.sw = 0;
  T.shx = 0.4 + br * 0.3;
  T.hd = -0.16 + Math.sin(t * 0.6) * 0.03;
  T.rot = 0;
  T.sqx = T.sqy = 1;
  T.a0x = -8; T.a0y = -B.ank; T.a1x = 9; T.a1y = -B.ank;
  // fists on the hips, elbows out
  const sN = shoulderOfT(T, B, 1), sF = shoulderOfT(T, B, 0);
  T.h0x = sN[0] - 2.5; T.h0y = sN[1] + 25; T.r0 = 1.9; T.hs0 = 'fist';
  T.h1x = sF[0] + 3; T.h1y = sF[1] + 25; T.r1 = 1.3; T.hs1 = 'fist';
  T.e0x = -1; T.e0y = 0.15; T.e1x = 1; T.e1y = 0.25;
  T.fk0 = T.fk1 = 1;
  // signature poses
  const head = C.look.head;
  if (head === 'bubble') {
    // thumbs up
    T.h0x = sN[0] - 6; T.h0y = sN[1] - 4 + br * 0.4; T.r0 = 0; T.hs0 = 'thumb'; T.e0x = -1; T.e0y = 0.6; T.fk0 = 1.2;
  } else if (head === 'goggles') {
    // one fist up by the shoulder, ready to zip off
    T.h1x = sF[0] + 7; T.h1y = sF[1] - 2 + br * 0.4; T.r1 = -1.3; T.hs1 = 'fist'; T.e1x = 0.9; T.e1y = 1; T.fk1 = 1.1;
  } else if (head === 'fedora') {
    // hands in the coat pockets
    T.h0y += 3; T.h1y += 3; T.hs0 = T.hs1 = 'none';
  }
  T.sup = 0; T.wv = 0;
  T.ex = C.ent.pex || (C.look.head === 'bubble' ? 'smile' : 'det');
  T.mouth = 0;
  T.fx = 0; T.mag = 0;
}

// (x, y) = frame centre, size ~ half the frame height
export function drawPortrait(ctx, look, x, y, size, o = {}) {
  const A = o.anim || (o.anim = makeAnim(3));
  let ent = ents.get(A);
  if (!ent) { ent = { x: 0, y: 0, vx: 0, vy: 0, facing: 1, aim: -0.2, h: 92, w: 36, onGround: true, look }; ents.set(A, ent); }
  ent.look = look;
  // the caller advances A.t; integrate the rest of the anim from that
  const t = A.t;
  const dt = A._pt == null ? 1 / 60 : Math.max(0, Math.min(0.1, t - A._pt));
  A._pt = t;
  updateAnim(A, ent, dt);
  A.t = t;
  // a steady breeze for the cape / scarf
  A.svx = 0;
  A.windX = -500 - Math.sin(t * 0.9) * 250;
  A.svy = 0;
  A.speed = 0; A.runK = 0; A.engage = 0;
  A.flash = 0;
  ctx.save();
  ctx.translate(x, y);
  const k = size / 27.5;
  ctx.scale(k, k);
  ctx.translate(-2, 81.5);
  drawHumanoid(ctx, ent, A, {
    weapon: null, noShadow: true, flash: o.flash || 0, hurt: o.hurt || 0,
    lw: 1.9, pose: heroPose, lightFront: true,
  }, 'bust');
  ctx.restore();
}
