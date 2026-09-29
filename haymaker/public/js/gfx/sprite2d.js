// 2D cel-shaded fighter sprites.
//
// The pose skeleton from sprite.js only supplies joint positions. Every body
// part is drawn as a flat 2D illustration (solid ramps, crescent cel shadows,
// ink outlines, drawn muscle lines and faces) at 4x resolution, then sampled
// down to native pixels and snapped to the fighter's palette.

import { buildSkeleton, project } from './sprite.js';

const K = 4;              // supersampling factor for drawing
const LW = 5;             // ink line width at 4x (~1 native px)

const T = (p, dx, dy) => { const q = new Path2D(); q.addPath(p, new DOMMatrix([1, 0, 0, 1, dx, dy])); return q; };

// Fill a shape with flat cel shading: light rim top-left, base, shadow
// crescent bottom-right, then ink.
function cel(ctx, path, pal, o = {}) {
  const sh = o.sh ?? 7, hl = o.hl ?? 3;
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = pal[o.light === false ? 2 : 3];
  ctx.fill(path);
  ctx.fillStyle = pal[2];
  ctx.fill(T(path, hl * (o.lx ?? 1), hl * (o.ly ?? 1)));
  if (sh) {
    const inv = new Path2D();
    inv.rect(-1e5, -1e5, 2e5, 2e5);
    inv.addPath(path, new DOMMatrix([1, 0, 0, 1, -sh * (o.sx ?? 1), -sh * (o.sy ?? 1)]));
    ctx.fillStyle = pal[1];
    ctx.fill(inv, 'evenodd');
  }
  ctx.restore();
  if (o.ink !== false) ink(ctx, path, o.inkColor || INK, o.lw);
}

let INK = '#140a10';
function ink(ctx, path, color = INK, lw = LW) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw ?? LW;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(path);
}

function line(ctx, pts, color = INK, lw = LW, curve = true) {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 3 && curve) p.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
  else for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  ink(ctx, p, color, lw);
}

// Tapered limb with an optional muscle bulge on both sides.
function limbPath(a, b, ra, rb, bulge = 0) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const ang = Math.atan2(dy, dx);
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, rm = (ra + rb) / 2 + bulge;
  const p = new Path2D();
  p.moveTo(a[0] + nx * ra, a[1] + ny * ra);
  p.quadraticCurveTo(mx + nx * rm * 1.08, my + ny * rm * 1.08, b[0] + nx * rb, b[1] + ny * rb);
  p.arc(b[0], b[1], rb, ang + Math.PI / 2, ang - Math.PI / 2, true);
  p.quadraticCurveTo(mx - nx * rm * 1.08, my - ny * rm * 1.08, a[0] - nx * ra, a[1] - ny * ra);
  p.arc(a[0], a[1], ra, ang - Math.PI / 2, ang + Math.PI / 2, true);
  p.closePath();
  return p;
}

function ellipse(cx, cy, rx, ry, rot = 0) {
  const p = new Path2D();
  p.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
  return p;
}

// Smooth closed shape through points (Catmull-Rom -> Bezier).
function blob(pts, tension = 0.5) {
  const p = new Path2D();
  const n = pts.length;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const t = tension / 3;
    p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t, p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t, p2[0], p2[1]);
  }
  p.closePath();
  return p;
}

// Open smooth curve through points.
function curve(pts, tension = 0.5) {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = tension / 3;
    p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t, p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t, p2[0], p2[1]);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Gloves

function glove(ctx, g, dirV, R, pal, trim, o) {
  const [dx, dy] = dirV;
  const L = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  const facing = o.facing; // 'side' | 'front' | 'back'
  ctx.save();
  ctx.translate(g[0], g[1]);
  if (facing === 'side') {
    // Profile: knuckles lead along the forearm direction, thumb on top.
    let a = ang;
    const flip = Math.cos(a) < 0;
    ctx.rotate(a);
    if (flip) ctx.scale(1, -1);
    const s = R;
    const cuff = blob([[-1.55 * s, -0.62 * s], [-0.7 * s, -0.72 * s], [-0.62 * s, 0.7 * s], [-1.55 * s, 0.62 * s]], 0.2);
    cel(ctx, cuff, trim, { sh: 0.18 * s, hl: 0.06 * s });
    line(ctx, [[-1.1 * s, -0.5 * s], [-1.12 * s, 0.5 * s]], trim[1], 3);
    const body = blob([
      [-0.8 * s, -0.78 * s], [0.1 * s, -0.95 * s], [0.85 * s, -0.7 * s], [1.08 * s, 0], [0.85 * s, 0.72 * s],
      [0.05 * s, 0.9 * s], [-0.8 * s, 0.72 * s],
    ]);
    cel(ctx, body, pal, { sh: 0.26 * s, hl: 0.08 * s, sy: flip ? -1 : 1, ly: flip ? -1 : 1 });
    const thumb = blob([[-0.55 * s, -0.55 * s], [-0.05 * s, -0.75 * s], [0.35 * s, -0.45 * s], [-0.1 * s, -0.25 * s]]);
    cel(ctx, thumb, pal, { sh: 0.1 * s, hl: 0.05 * s, sy: flip ? -1 : 1 });
    line(ctx, [[0.55 * s, -0.5 * s], [0.75 * s, 0], [0.55 * s, 0.5 * s]], pal[1], 4);
    ctx.fillStyle = pal[4];
    ctx.fill(ellipse(0.2 * s, (flip ? 0.45 : -0.45) * s, 0.26 * s, 0.13 * s, -0.3));
  } else if (facing === 'front') {
    // Knuckles toward the viewer: a big round fist with the thumb across.
    const s = R * 1.05;
    const body = blob([[0, -1 * s], [0.78 * s, -0.7 * s], [1 * s, 0.05 * s], [0.72 * s, 0.8 * s], [0, 1 * s], [-0.75 * s, 0.78 * s], [-1 * s, 0], [-0.75 * s, -0.72 * s]]);
    cel(ctx, body, pal, { sh: 0.3 * s, hl: 0.09 * s });
    const side = o.thumbSide || 1;
    line(ctx, [[-0.7 * s, -0.15 * s], [0, -0.32 * s], [0.7 * s, -0.15 * s]], pal[1], 4);
    const thumb = blob([[side * -0.85 * s, 0.25 * s], [side * -0.2 * s, 0.18 * s], [side * 0.25 * s, 0.42 * s], [side * -0.15 * s, 0.7 * s], [side * -0.7 * s, 0.6 * s]]);
    cel(ctx, thumb, pal, { sh: 0.12 * s, hl: 0.05 * s });
    ctx.fillStyle = pal[4];
    ctx.fill(ellipse(-0.35 * s, -0.55 * s, 0.28 * s, 0.16 * s, -0.5));
    ctx.fillStyle = pal[3];
    ctx.fill(ellipse(-0.62 * s, -0.25 * s, 0.1 * s, 0.07 * s, -0.5));
  } else {
    // Seen from behind while punching away: round glove, cuff ring toward us.
    const s = R;
    const body = blob([[0, -1 * s], [0.8 * s, -0.66 * s], [1 * s, 0.05 * s], [0.72 * s, 0.78 * s], [0, 0.98 * s], [-0.75 * s, 0.76 * s], [-1 * s, 0], [-0.75 * s, -0.7 * s]]);
    cel(ctx, body, pal, { sh: 0.3 * s, hl: 0.09 * s });
    ctx.rotate(ang);
    const cuff = ellipse(-0.35 * s, 0, 0.42 * s, 0.62 * s);
    cel(ctx, cuff, trim, { sh: 0.12 * s, hl: 0.04 * s });
    ctx.fillStyle = pal[4];
    ctx.rotate(-ang);
    ctx.fill(ellipse(-0.4 * s, -0.55 * s, 0.24 * s, 0.13 * s, -0.4));
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Heads

const FACE_FOR = {
  normal: { eyes: 'open', brows: 'angry', mouth: 'smirk' },
  focus: { eyes: 'narrow', brows: 'angry', mouth: 'grit' },
  block: { eyes: 'narrow', brows: 'angry', mouth: 'grit' },
  hurt: { eyes: 'squeeze', brows: 'worry', mouth: 'ow' },
  daze: { eyes: 'spiral', brows: 'worry', mouth: 'wobble' },
  tired: { eyes: 'heavy', brows: 'worry', mouth: 'pant' },
  happy: { eyes: 'happy', brows: 'up', mouth: 'grin' },
  ko: { eyes: 'x', brows: 'worry', mouth: 'ko' },
  shout: { eyes: 'open', brows: 'angry', mouth: 'shout' },
  calm: { eyes: 'open', brows: 'flat', mouth: 'flat' },
};

function headShape(jaw) {
  // Unit head: cranium above, square caricature jaw below.
  const j = jaw;
  return blob([
    [0, -1.02], [0.62, -0.88], [0.93, -0.42], [0.95, 0.12], [0.86 * j, 0.55], [0.6 * j, 0.88], [0.22, 1.02],
    [-0.22, 1.02], [-0.6 * j, 0.88], [-0.86 * j, 0.55], [-0.95, 0.12], [-0.93, -0.42], [-0.62, -0.88],
  ], 0.55);
}

function drawHeadFront(ctx, c, r, tilt, yaw, fighter, faceKey) {
  const b = fighter.body, pal = fighter.palette;
  const skin = pal.skin, hair = pal.hair || pal.skin;
  const lw = LW / r;
  const L = (pts, color = INK, w = 1) => line(ctx, pts, color, lw * w);
  ctx.save();
  ctx.translate(c[0], c[1]);
  ctx.rotate(tilt);
  ctx.scale(r, r);
  const fx = Math.max(-0.3, Math.min(0.3, Math.sin(yaw) * 0.45)); // features slide when the head turns
  // Ears
  for (const sx of [-1, 1]) {
    const e = ellipse(sx * 0.96 + fx * 0.3, 0.06, 0.17, 0.27);
    cel(ctx, e, skin, { sh: 0.07, hl: 0.03, lw });
    L([[sx * 0.95, -0.02], [sx * 1.02, 0.08], [sx * 0.96, 0.18]], skin[1], 0.7);
  }
  // Back hair mass (behind the head) for big styles.
  if (b.hair === 'afro') cel(ctx, ellipse(0, -0.35, 1.25, 1.05), hair, { sh: 0.2, hl: 0.06, lw });
  const head = headShape(b.jaw || 1);
  cel(ctx, head, skin, { sh: 0.22, hl: 0.07, lw });
  // Hair on top
  drawHairFront(ctx, b.hair, hair, skin, lw, fx);
  // Face features
  ctx.translate(fx, 0);
  const f = FACE_FOR[faceKey] || FACE_FOR.normal;
  const W = '#fbf6ee', P = '#1a1020', MOUTH = '#5a0a14', TEETH = '#f4efe4';
  // Brow ridge shade
  ctx.fillStyle = skin[1];
  ctx.globalAlpha = 1;
  // Eyes
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.translate(sx * 0.37, -0.08);
    ctx.scale(sx, 1);
    drawEye(ctx, f.eyes, lw, W, P, skin);
    ctx.restore();
  }
  // Brows
  const bc = pal.brow || (b.hair === 'bald' || b.hair === 'mohawk' ? hair[1] : hair[0]);
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.scale(sx, 1);
    const brow = new Path2D();
    if (f.brows === 'angry') { brow.moveTo(0.62, -0.42); brow.lineTo(0.14, -0.24); brow.lineTo(0.12, -0.13); brow.lineTo(0.64, -0.3); }
    else if (f.brows === 'worry') { brow.moveTo(0.64, -0.26); brow.lineTo(0.14, -0.42); brow.lineTo(0.12, -0.32); brow.lineTo(0.62, -0.16); }
    else if (f.brows === 'up') { brow.moveTo(0.62, -0.38); brow.quadraticCurveTo(0.4, -0.52, 0.14, -0.42); brow.lineTo(0.14, -0.34); brow.quadraticCurveTo(0.4, -0.44, 0.62, -0.3); }
    else { brow.moveTo(0.62, -0.34); brow.lineTo(0.14, -0.32); brow.lineTo(0.14, -0.23); brow.lineTo(0.62, -0.25); }
    brow.closePath();
    ctx.fillStyle = bc;
    ctx.fill(brow);
    ink(ctx, brow, INK, lw * 0.8);
    ctx.restore();
  }
  // Nose: shadow wedge on the right, nostrils, highlight on the bridge.
  const nose = new Path2D();
  nose.moveTo(0.02, -0.12); nose.quadraticCurveTo(0.2, 0.18, 0.2, 0.3); nose.quadraticCurveTo(0.08, 0.36, 0.0, 0.33); nose.closePath();
  ctx.fillStyle = skin[1]; ctx.fill(nose);
  L([[-0.16, 0.26], [-0.02, 0.35], [0.16, 0.28]], INK, 0.8);
  L([[-0.12, 0.3], [-0.08, 0.27]], INK, 0.9);
  L([[0.12, 0.3], [0.08, 0.27]], INK, 0.9);
  ctx.fillStyle = skin[3];
  ctx.fill(ellipse(-0.05, 0.02, 0.04, 0.12));
  // Cheek lines
  L([[-0.45, 0.28], [-0.4, 0.42], [-0.3, 0.52]], skin[1], 0.8);
  L([[0.45, 0.28], [0.4, 0.42], [0.3, 0.52]], skin[0], 0.8);
  // Facial hair
  if (b.beard) {
    const beard = blob([[-0.88, 0.3], [-0.55, 0.5], [0, 0.46], [0.55, 0.5], [0.88, 0.3], [0.82, 0.62], [0.55, 0.95], [0, 1.12], [-0.55, 0.95], [-0.82, 0.62]], 0.5);
    cel(ctx, beard, hair, { sh: 0.14, hl: 0.04, lw });
    for (const [x, y] of [[-0.5, 0.75], [-0.25, 0.9], [0.25, 0.9], [0.5, 0.75], [0, 0.95]]) L([[x, y], [x + 0.03, y + 0.1]], hair[1], 0.8);
  }
  if (b.stache) {
    const st = blob([[-0.46, 0.5], [-0.2, 0.36], [0, 0.4], [0.2, 0.36], [0.46, 0.5], [0.3, 0.52], [0, 0.48], [-0.3, 0.52]], 0.4);
    cel(ctx, st, hair, { sh: 0.05, hl: 0.02, lw: lw * 0.8 });
  }
  drawMouth(ctx, f.mouth, lw, MOUTH, TEETH, skin, b.stache ? 0.07 : 0);
  // Chin cleft
  if ((b.jaw || 1) > 1.05 && !b.beard) L([[0, 0.86], [0, 0.95]], skin[1], 0.8);
  ctx.restore();
}

function drawEye(ctx, kind, lw, W, P, skin) {
  // Drawn for the eye on the viewer's right (x toward the temple).
  const L = (pts, w = 1, c = INK) => line(ctx, pts, c, lw * w);
  if (kind === 'open' || kind === 'narrow' || kind === 'heavy') {
    const h = kind === 'open' ? 0.12 : kind === 'narrow' ? 0.07 : 0.06;
    const eye = new Path2D();
    eye.moveTo(-0.2, 0.02); eye.quadraticCurveTo(0, -h * 1.5, 0.22, 0.0); eye.quadraticCurveTo(0, h * 1.1, -0.2, 0.02); eye.closePath();
    ctx.fillStyle = W; ctx.fill(eye);
    ctx.save(); ctx.clip(eye);
    ctx.fillStyle = P; ctx.fill(ellipse(-0.04, 0.0, 0.08, 0.11));
    ctx.fillStyle = W; ctx.fill(ellipse(-0.07, -0.04, 0.025, 0.025));
    if (kind === 'heavy') { ctx.fillStyle = skin[1]; ctx.fillRect(-0.3, -0.2, 0.6, 0.18); }
    ctx.restore();
    ink(ctx, eye, INK, lw);
    L([[-0.22, -0.02], [0, -h * 1.5 - 0.02], [0.24, -0.01]], 1.4);
    if (kind === 'heavy') L([[-0.2, -0.01], [0.22, -0.01]], 1.2);
  } else if (kind === 'squeeze') {
    L([[0.22, -0.1], [-0.02, 0.0], [0.2, 0.08]], 1.4, INK);
  } else if (kind === 'happy') {
    L([[-0.18, 0.04], [0.02, -0.12], [0.22, 0.04]], 1.4);
  } else if (kind === 'x') {
    L([[-0.14, -0.1], [0.16, 0.1]], 1.4); L([[-0.14, 0.1], [0.16, -0.1]], 1.4);
  } else if (kind === 'spiral') {
    const s = new Path2D();
    for (let i = 0; i <= 40; i++) { const a = i * 0.45, rr = 0.012 + i * 0.0035; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? s.lineTo(x, y) : s.moveTo(x, y); }
    ctx.fillStyle = W; ctx.fill(ellipse(0, 0, 0.17, 0.15));
    ink(ctx, ellipse(0, 0, 0.17, 0.15), INK, lw);
    ink(ctx, s, INK, lw * 0.8);
  }
}

function drawMouth(ctx, kind, lw, MOUTH, TEETH, skin, drop) {
  const y = 0.62 + drop;
  const L = (pts, w = 1, c = INK) => line(ctx, pts, c, lw * w);
  const shape = (pts) => { const p = blob(pts, 0.5); return p; };
  switch (kind) {
    case 'smirk':
      L([[-0.3, y], [0.02, y + 0.04], [0.3, y - 0.05]], 1.3);
      L([[0.3, y - 0.05], [0.36, y - 0.1]], 1.1);
      L([[-0.1, y + 0.13], [0.12, y + 0.12]], 0.8, skin[1]);
      break;
    case 'flat':
      L([[-0.26, y], [0, y + 0.02], [0.26, y]], 1.2);
      break;
    case 'grit': {
      const m = shape([[-0.34, y - 0.06], [0.34, y - 0.06], [0.3, y + 0.1], [-0.3, y + 0.1]]);
      ctx.fillStyle = TEETH; ctx.fill(m); ink(ctx, m, INK, lw);
      L([[-0.32, y + 0.02], [0.32, y + 0.02]], 0.7);
      for (const x of [-0.18, 0, 0.18]) L([[x, y - 0.06], [x, y + 0.1]], 0.6);
      break;
    }
    case 'ow': {
      const m = shape([[-0.26, y - 0.04], [0, y - 0.1], [0.26, y - 0.04], [0.18, y + 0.2], [0, y + 0.26], [-0.18, y + 0.2]]);
      ctx.fillStyle = MOUTH; ctx.fill(m);
      ctx.save(); ctx.clip(m); ctx.fillStyle = TEETH; ctx.fillRect(-0.3, y - 0.12, 0.6, 0.08); ctx.restore();
      ink(ctx, m, INK, lw);
      break;
    }
    case 'pant':
    case 'ko': {
      const m = ellipse(0, y + 0.06, 0.13, kind === 'ko' ? 0.14 : 0.1);
      ctx.fillStyle = MOUTH; ctx.fill(m); ink(ctx, m, INK, lw);
      if (kind === 'ko') { ctx.fillStyle = '#e0506a'; ctx.fill(ellipse(0.03, y + 0.15, 0.07, 0.05)); }
      break;
    }
    case 'wobble':
      L([[-0.28, y + 0.02], [-0.14, y - 0.04], [0, y + 0.04], [0.14, y - 0.04], [0.28, y + 0.02]], 1.2);
      break;
    case 'grin': {
      const m = new Path2D();
      m.moveTo(-0.4, y - 0.08); m.quadraticCurveTo(0, y + 0.04, 0.4, y - 0.08); m.quadraticCurveTo(0, y + 0.38, -0.4, y - 0.08); m.closePath();
      ctx.fillStyle = MOUTH; ctx.fill(m);
      ctx.save(); ctx.clip(m); ctx.fillStyle = TEETH; ctx.fillRect(-0.5, y - 0.1, 1, 0.13); ctx.restore();
      ink(ctx, m, INK, lw);
      break;
    }
    case 'shout': {
      const m = ellipse(0, y + 0.06, 0.16, 0.14);
      ctx.fillStyle = MOUTH; ctx.fill(m);
      ctx.save(); ctx.clip(m); ctx.fillStyle = TEETH; ctx.fillRect(-0.2, y - 0.1, 0.4, 0.07); ctx.restore();
      ink(ctx, m, INK, lw);
      break;
    }
  }
}

function drawHairFront(ctx, style, hair, skin, lw, fx) {
  const H = (pts, t = 0.5, o = {}) => cel(ctx, blob(pts, t), hair, { sh: 0.12, hl: 0.05, lw, ...o });
  switch (style) {
    case 'pomp':
      H([[-0.95, -0.2], [-0.92, -0.62], [-0.55, -0.98], [0.1, -1.18], [0.72, -1.2], [1.02, -0.95], [0.98, -0.62], [0.9, -0.3], [0.62, -0.62], [0.1, -0.7], [-0.5, -0.62], [-0.85, -0.3]]);
      line(ctx, [[-0.4, -0.95], [0.2, -1.05], [0.7, -1.02]], hair[3], lw * 0.9);
      line(ctx, [[-0.2, -0.8], [0.3, -0.88], [0.75, -0.85]], hair[1], lw * 0.8);
      break;
    case 'flattop':
      H([[-0.95, -0.25], [-0.98, -0.95], [-0.7, -1.3], [0.7, -1.3], [0.98, -0.95], [0.95, -0.25], [0.8, -0.55], [0.4, -0.66], [-0.4, -0.66], [-0.8, -0.55]], 0.25);
      line(ctx, [[-0.75, -1.2], [0.75, -1.2]], hair[3], lw * 0.9, false);
      break;
    case 'mohawk': {
      // Shaved sides: darker stubble cap, then the fin.
      const cap = blob([[-0.92, -0.35], [-0.72, -0.8], [0, -1.02], [0.72, -0.8], [0.92, -0.35], [0.6, -0.58], [0, -0.66], [-0.6, -0.58]], 0.5);
      ctx.fillStyle = skin[1]; ctx.fill(cap);
      const fin = blob([[-0.2, -0.62], [-0.28, -1.05], [-0.12, -1.5], [0.12, -1.55], [0.3, -1.1], [0.2, -0.62]], 0.5);
      cel(ctx, fin, hair, { sh: 0.1, hl: 0.05, lw });
      line(ctx, [[-0.08, -1.4], [-0.1, -0.8]], hair[3], lw * 0.9);
      break;
    }
    case 'buzz':
      H([[-0.95, -0.2], [-0.9, -0.66], [-0.5, -1.0], [0, -1.07], [0.5, -1.0], [0.9, -0.66], [0.95, -0.2], [0.82, -0.45], [0.4, -0.62], [0, -0.66], [-0.4, -0.62], [-0.82, -0.45]]);
      break;
    case 'bald':
      ctx.fillStyle = skin[4];
      ctx.fill(ellipse(-0.35, -0.72, 0.22, 0.1, -0.5));
      ctx.fill(ellipse(-0.62, -0.5, 0.06, 0.05));
      break;
  }
}

function drawHeadBack(ctx, c, r, tilt, fighter) {
  const b = fighter.body, pal = fighter.palette;
  const skin = pal.skin, hair = pal.hair || pal.skin;
  const lw = LW / r;
  ctx.save();
  ctx.translate(c[0], c[1]);
  ctx.rotate(tilt);
  ctx.scale(r, r);
  for (const sx of [-1, 1]) cel(ctx, ellipse(sx * 0.96, 0.08, 0.17, 0.27), skin, { sh: 0.07, hl: 0.03, lw });
  const head = headShape((b.jaw || 1) * 0.95);
  cel(ctx, head, skin, { sh: 0.22, hl: 0.07, lw });
  if (b.hair === 'bald') {
    ctx.fillStyle = skin[4];
    ctx.fill(ellipse(-0.3, -0.6, 0.24, 0.12, -0.4));
  } else if (b.hair === 'mohawk') {
    const cap = blob([[-0.92, 0.2], [-0.9, -0.5], [0, -1.02], [0.9, -0.5], [0.92, 0.2], [0.5, 0.45], [-0.5, 0.45]], 0.5);
    ctx.fillStyle = skin[1]; ctx.fill(cap);
    cel(ctx, blob([[-0.2, 0.5], [-0.24, -0.6], [-0.1, -1.35], [0.1, -1.35], [0.24, -0.6], [0.2, 0.5]], 0.5), hair, { sh: 0.1, hl: 0.05, lw });
  } else {
    const top = b.hair === 'flattop' ? -1.3 : b.hair === 'pomp' ? -1.15 : -1.06;
    const cap = blob([[-0.97, 0.25], [-0.98, -0.5], [-0.6, top * 0.95], [0, top], [0.6, top * 0.95], [0.98, -0.5], [0.97, 0.25], [0.6, 0.55], [0, 0.62], [-0.6, 0.55]], b.hair === 'flattop' ? 0.3 : 0.5);
    cel(ctx, cap, hair, { sh: 0.16, hl: 0.06, lw });
    line(ctx, [[-0.5, 0.35], [0, 0.45], [0.5, 0.35]], hair[1], lw * 0.8);
    line(ctx, [[-0.4, -0.6], [-0.1, -0.85]], hair[3], lw * 0.8);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Torso, trunks, legs

function torsoOutline(a, b, N, C, Wt, Pv, dims, back) {
  // a = screen-left shoulder, b = screen-right shoulder.
  const { neckW, delt, waistW, hipW, belly } = dims;
  const mid = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const pts = [
    [N[0] - neckW, N[1] - delt * 0.3],
    [a[0] + delt * 0.3, a[1] - delt * 0.55],
    [a[0] - delt * 0.2, a[1] + delt * 0.25],
    [a[0] + delt * 0.35, C[1] + delt * 0.6],
    [Wt[0] - waistW - belly * 0.6, Wt[1] - belly * 0.2],
    [Pv[0] - hipW, Pv[1] + delt * 0.2],
    [Pv[0] + hipW, Pv[1] + delt * 0.2],
    [Wt[0] + waistW + belly * 0.6, Wt[1] - belly * 0.2],
    [b[0] - delt * 0.35, C[1] + delt * 0.6],
    [b[0] + delt * 0.2, b[1] + delt * 0.25],
    [b[0] - delt * 0.3, b[1] - delt * 0.55],
    [N[0] + neckW, N[1] - delt * 0.3],
  ];
  void mid; void back;
  return blob(pts, 0.45);
}

function drawTorsoFront(ctx, J, dims, pal, body) {
  const skin = pal.skin;
  const { a, b, N, C, Wt, Pv } = J;
  const path = torsoOutline(a, b, N, C, Wt, Pv, dims, false);
  cel(ctx, path, skin, { sh: dims.delt * 0.5, hl: dims.delt * 0.12 });
  const w = Math.abs(b[0] - a[0]) / 2;
  const cx = C[0];
  ctx.save();
  ctx.clip(path);
  // Pecs: shadow under each pec, ink along the bottom edge.
  const pecY = C[1] + w * 0.22;
  for (const sx of [-1, 1]) {
    const outer = [cx + sx * w * 0.78, C[1] - w * 0.2];
    const low = [cx + sx * w * 0.62, pecY + w * 0.2];
    const inner = [cx + sx * w * 0.04, pecY + w * 0.14];
    const under = new Path2D();
    under.moveTo(outer[0], outer[1]);
    under.quadraticCurveTo(low[0], low[1] + w * 0.08, inner[0], inner[1]);
    under.lineTo(inner[0], inner[1] + w * 0.12);
    under.quadraticCurveTo(low[0], low[1] + w * 0.22, outer[0], outer[1] + w * 0.2);
    under.closePath();
    ctx.fillStyle = skin[1];
    ctx.fill(under);
    line(ctx, [outer, [low[0], low[1] + w * 0.08], inner], INK, LW);
    // Pec highlight (lit side only)
    if (sx < 0) { ctx.fillStyle = skin[3]; ctx.fill(ellipse(cx + sx * w * 0.5, C[1] - w * 0.08, w * 0.16, w * 0.05, -0.15)); }
  }
  // Sternum + abs
  line(ctx, [[cx, C[1] - w * 0.2], [cx, pecY + w * 0.1]], skin[1], LW);
  if ((body.belly || 0) < 3) {
    line(ctx, [[cx, pecY + w * 0.2], [(cx + Wt[0]) / 2, (pecY + Wt[1]) / 2], [Wt[0], Wt[1] + w * 0.1]], skin[1], LW);
    for (let i = 0; i < 3; i++) {
      const y = pecY + w * (0.42 + i * 0.24);
      const x = cx + (Wt[0] - cx) * (0.3 + i * 0.25);
      for (const sx of [-1, 1]) line(ctx, [[x + sx * w * 0.05, y], [x + sx * w * 0.2, y - w * 0.03], [x + sx * w * 0.32, y + w * 0.02]], skin[1], LW);
    }
    // Obliques
    for (const sx of [-1, 1]) line(ctx, [[Wt[0] + sx * dims.waistW * 0.95, pecY + w * 0.4], [Wt[0] + sx * dims.waistW * 0.75, Wt[1] - w * 0.1], [Wt[0] + sx * dims.waistW * 0.45, Wt[1] + w * 0.25]], skin[1], LW);
  } else {
    // Belly: big curve and a navel.
    line(ctx, [[Wt[0] - dims.waistW * 0.9, Wt[1] - w * 0.1], [Wt[0], Wt[1] + w * 0.45], [Wt[0] + dims.waistW * 0.9, Wt[1] - w * 0.1]], skin[1], LW);
    ctx.fillStyle = skin[3];
    ctx.fill(ellipse(Wt[0] - w * 0.2, Wt[1] - w * 0.3, w * 0.3, w * 0.12, -0.2));
  }
  ctx.fillStyle = INK;
  ctx.fill(ellipse(Wt[0], Wt[1] + w * 0.18, w * 0.035, w * 0.05));
  ctx.restore();
}

function drawTorsoBack(ctx, J, dims, pal) {
  const skin = pal.skin;
  const { a, b, N, C, Wt, Pv } = J;
  const path = torsoOutline(a, b, N, C, Wt, Pv, dims, true);
  cel(ctx, path, skin, { sh: dims.delt * 0.5, hl: dims.delt * 0.12 });
  const w = Math.abs(b[0] - a[0]) / 2;
  const cx = C[0];
  ctx.save();
  ctx.clip(path);
  // Spine groove
  line(ctx, [[N[0], N[1] + w * 0.1], [(cx + Wt[0]) / 2, C[1] + w * 0.3], [Wt[0], Wt[1] + w * 0.2]], skin[1], LW);
  // Shoulder blades
  for (const sx of [-1, 1]) {
    const top = [cx + sx * w * 0.2, C[1] - w * 0.45];
    const out = [cx + sx * w * 0.62, C[1] - w * 0.1];
    const bot = [cx + sx * w * 0.3, C[1] + w * 0.3];
    const blade = new Path2D();
    blade.moveTo(top[0], top[1]);
    blade.quadraticCurveTo(out[0], out[1] - w * 0.2, out[0], out[1]);
    blade.quadraticCurveTo(out[0] - sx * w * 0.05, bot[1], bot[0], bot[1]);
    ink(ctx, blade, skin[1], LW);
    ctx.fillStyle = skin[3];
    ctx.fill(ellipse(cx + sx * w * 0.38 - w * 0.05, C[1] - w * 0.22, w * 0.14, w * 0.07, -0.3));
    // Lats
    line(ctx, [[cx + sx * w * 0.75, C[1] + w * 0.15], [cx + sx * w * 0.55, C[1] + w * 0.65], [Wt[0] + sx * dims.waistW * 0.5, Wt[1] - w * 0.05]], skin[1], LW);
  }
  ctx.restore();
}

function drawTrunks(ctx, J, dims, pal, back) {
  const { Wt, Pv, hipL, hipR, knL, knR } = J;
  const trunks = pal.trunks, trim = pal.trunksTrim || pal.trunks;
  const legOpen = (hip, kn, t) => [hip[0] + (kn[0] - hip[0]) * t, hip[1] + (kn[1] - hip[1]) * t];
  const oL = legOpen(hipL, knL, 0.5), oR = legOpen(hipR, knR, 0.5);
  const [l, r] = oL[0] < oR[0] ? [oL, oR] : [oR, oL];
  const tw = dims.thigh * 1.25;
  const top = Wt[1] + dims.delt * 0.35;
  const pts = [
    [Wt[0] - dims.waistW * 1.02, top],
    [Wt[0] + dims.waistW * 1.02, top],
    [Pv[0] + dims.hipW * 1.08, Pv[1] + dims.delt * 0.3],
    [r[0] + tw, r[1]],
    [r[0] - tw * 0.9, r[1] + tw * 0.2],
    [Pv[0], Pv[1] + dims.delt * 1.1],
    [l[0] + tw * 0.9, l[1] + tw * 0.2],
    [l[0] - tw, l[1]],
    [Pv[0] - dims.hipW * 1.08, Pv[1] + dims.delt * 0.3],
  ];
  const path = blob(pts, 0.25);
  cel(ctx, path, trunks, { sh: dims.delt * 0.5, hl: dims.delt * 0.12 });
  ctx.save();
  ctx.clip(path);
  // Waistband
  const band = new Path2D();
  band.rect(Wt[0] - dims.waistW * 1.3, top - 20, dims.waistW * 2.6, 20 + dims.delt * 0.55);
  cel(ctx, band, trim, { sh: dims.delt * 0.2, hl: dims.delt * 0.08 });
  // Side stripes and hems
  for (const [p, sx] of [[l, -1], [r, 1]]) {
    line(ctx, [[Wt[0] + sx * dims.waistW * 0.95, top + dims.delt * 0.6], [p[0] + sx * tw * 0.92, p[1] - 4]], trim[2], LW * 1.6, false);
  }
  if (!back) line(ctx, [[Pv[0], top + dims.delt * 0.6], [Pv[0], Pv[1] + dims.delt * 0.9]], trunks[1], LW);
  else line(ctx, [[Pv[0], Pv[1] - dims.delt * 0.2], [Pv[0], Pv[1] + dims.delt * 1.0]], trunks[0], LW);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Main entry

export function renderFighter(fighter, pose, view = 'front', S = 1) {
  const body = fighter.body, pal = fighter.palette;
  INK = (pal.outline && pal.outline[0]) || '#140a10';
  const { j, P } = buildSkeleton(body, pose);
  const pr = {};
  for (const [k, v] of Object.entries(j)) if (Array.isArray(v)) pr[k] = project(v, view, S, 0, 0);
  // Bounds
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  const grow = (p, r) => { minX = Math.min(minX, p.x - r); maxX = Math.max(maxX, p.x + r); minY = Math.min(minY, p.y - r); maxY = Math.max(maxY, p.y + r); };
  for (const [k, p] of Object.entries(pr)) grow(p, (k === 'head' ? body.headR * 1.7 : k.startsWith('gl') ? body.glove * 1.8 : 26) * p.s);
  const pad = 4;
  const x0 = Math.floor(minX) - pad, y0 = Math.floor(minY) - pad;
  const W = Math.ceil(maxX) + pad - x0, H = Math.ceil(maxY) + pad - y0;
  const hi = makeCanvas(W * K, H * K);
  const ctx = hi.getContext('2d');
  const q = (k) => [(pr[k].x - x0) * K, (pr[k].y - y0) * K];
  const sc = (k) => pr[k].s * K;
  const back = view === 'back';

  // Screen-left / screen-right shoulder.
  const [sa, sb] = pr.shL.x < pr.shR.x ? ['shL', 'shR'] : ['shR', 'shL'];
  const J = { a: q(sa), b: q(sb), N: q('neck'), C: q('chest'), Wt: q('waist'), Pv: q('pelvis'), hipL: q('hipL'), hipR: q('hipR'), knL: q('knL'), knR: q('knR') };
  const s0 = sc('chest');
  const dims = {
    neckW: body.neckR * s0 * 1.05, delt: body.delt * s0, waistW: body.waistW * s0 * 1.05, hipW: body.hip * s0 * 0.98,
    belly: (body.belly || 0) * s0, thigh: body.thigh * s0,
  };
  const ref = body.outfit === 'ref';

  // Paint list sorted far-to-near.
  const items = [];
  const add = (z, fn) => items.push({ z, fn });
  const z = (k) => pr[k].z;

  // Legs
  for (const side of ['L', 'R']) {
    const hip = q('hip' + side), kn = q('kn' + side), an = q('an' + side);
    const legPal = ref ? pal.trunks : pal.skin;
    add(z('kn' + side) - 30, () => {
      cel(ctx, limbPath(kn, an, body.calf * sc('kn' + side) * 1.05, body.calf * sc('an' + side) * 0.7, body.calf * 0.15 * K), legPal, { sh: 6, hl: 3 });
      const cs = body.calf * sc('an' + side);
      if (!ref) cel(ctx, limbPath([an[0], an[1] - cs * 1.1], [an[0], an[1] + cs * 0.2], cs * 0.66, cs * 0.62), pal.sock, { sh: 4, hl: 2 });
      const shoe = blob([[an[0] - cs * 0.85, an[1] + cs * 0.1], [an[0] + cs * 0.85, an[1] + cs * 0.1], [an[0] + cs * 1.05, an[1] + cs * 0.9], [an[0] - cs * 1.05, an[1] + cs * 0.9]], 0.4);
      cel(ctx, shoe, pal.shoe, { sh: 5, hl: 3 });
      cel(ctx, limbPath(hip, kn, body.thigh * sc('hip' + side) * 1.05, body.calf * sc('kn' + side) * 1.1, body.thigh * 0.2 * K), legPal, { sh: 7, hl: 3 });
    });
  }
  // Trunks + torso
  const zTorso = Math.min(z('pelvis'), z('chest')) - 4;
  add(zTorso, () => {
    if (!back) drawTorsoFront(ctx, J, dims, ref ? { skin: pal.shirt } : pal, body);
    else drawTorsoBack(ctx, J, dims, ref ? { skin: pal.shirt } : pal);
    drawTrunks(ctx, J, dims, ref ? { trunks: pal.trunks, trunksTrim: pal.trunksTrim } : pal, back);
    if (ref && !back) {
      // Bow tie at the collar.
      const n = J.N, s = s0 * 1.2;
      for (const sx of [-1, 1]) {
        const t = new Path2D();
        t.moveTo(n[0], n[1] + 2 * s); t.lineTo(n[0] + sx * 5 * s, n[1] - 1 * s); t.lineTo(n[0] + sx * 5 * s, n[1] + 5 * s); t.closePath();
        cel(ctx, t, pal.tie, { sh: 2, hl: 1 });
      }
      line(ctx, [[n[0] - dims.neckW * 1.1, n[1] - 3 * s], [n[0], n[1] + 3 * s], [n[0] + dims.neckW * 1.1, n[1] - 3 * s]], pal.shirt[1], LW);
    }
  });
  // Neck + head
  const headR = body.headR * sc('head');
  add(Math.max(z('neck'), zTorso + 1), () => {
    const nb = J.N, hc = q('head');
    const neck = limbPath(nb, [hc[0], hc[1] + headR * 0.5], body.neckR * s0 * 1.05, body.neckR * s0 * 0.95);
    cel(ctx, neck, pal.skin, { sh: 7, hl: 3 });
    if (!back) line(ctx, [[nb[0] - body.neckR * s0 * 0.5, nb[1] - body.neckR * s0 * 0.3], [nb[0], nb[1] + body.neckR * s0 * 0.2], [nb[0] + body.neckR * s0 * 0.5, nb[1] - body.neckR * s0 * 0.3]], pal.skin[1], LW);
  });
  add(Math.max(z('head') + 3, zTorso + 2), () => {
    const hc = q('head');
    if (back) drawHeadBack(ctx, hc, headR, j.headRoll || 0, fighter);
    else drawHeadFront(ctx, hc, headR, j.headRoll || 0, j.yaw || 0, fighter, P.face);
  });
  // Arms
  for (const side of ['L', 'R']) {
    const sh = q('sh' + side), el = q('el' + side), gl = q('gl' + side);
    const armPal = ref ? pal.shirt : pal.skin;
    const rUpper = body.arm * sc('sh' + side), rFore = body.arm * sc('el' + side) * 0.92;
    const gR = body.glove * sc('gl' + side);
    // Wrist sits back from the glove centre along the forearm.
    const fd = [gl[0] - el[0], gl[1] - el[1]];
    const fl = Math.hypot(fd[0], fd[1]) || 1;
    const wrist = [gl[0] - (fd[0] / fl) * Math.min(fl * 0.6, gR * 0.9), gl[1] - (fd[1] / fl) * Math.min(fl * 0.6, gR * 0.9)];
    const trueLen = Math.hypot(j['gl' + side][0] - j['el' + side][0], j['gl' + side][1] - j['el' + side][1], j['gl' + side][2] - j['el' + side][2]) * sc('el' + side);
    const fore = fl / (trueLen || 1);
    const toward = (pr['gl' + side].z - pr['el' + side].z) > 0; // glove closer to camera than elbow
    let facing = fore < 0.55 ? (toward ? 'front' : 'back') : 'side';
    if (ref) facing = 'hand';
    const zUpper = (z('sh' + side) + z('el' + side)) / 2;
    const zFore = (z('el' + side) + z('gl' + side)) / 2;
    add(zUpper, () => {
      cel(ctx, ellipse(sh[0], sh[1], body.delt * sc('sh' + side) * 1.05, body.delt * sc('sh' + side) * 0.95), armPal, { sh: 7, hl: 3 });
      cel(ctx, limbPath(sh, el, rUpper * 1.05, rUpper * 0.85, rUpper * 0.25), armPal, { sh: 7, hl: 3 });
    });
    add(zFore, () => {
      cel(ctx, limbPath(el, wrist, rFore, rFore * 0.8, rFore * 0.15), ref ? pal.skin : pal.skin, { sh: 6, hl: 3 });
    });
    add(z('gl' + side) + body.glove * 0.5, () => {
      if (facing === 'hand') {
        cel(ctx, ellipse(gl[0], gl[1], gR * 1.1, gR * 1.25, Math.atan2(fd[1], fd[0]) + Math.PI / 2), pal.skin, { sh: 4, hl: 2 });
        return;
      }
      const g = P.glow && side === 'R' ? pal.gloveGlow : pal.glove;
      // Thumb sits on the inner side of each glove.
      const thumbSide = (view === 'front' ? (side === 'L' ? -1 : 1) : (side === 'L' ? 1 : -1));
      glove(ctx, gl, fd, gR, g, pal.gloveTrim, { facing, thumbSide });
    });
  }
  items.sort((u, v) => u.z - v.z);
  for (const it of items) it.fn();

  // Sample down to native pixels and snap to the palette.
  const out = makeCanvas(W, H);
  const octx = out.getContext('2d');
  const src = ctx.getImageData(0, 0, W * K, H * K).data;
  const img = octx.createImageData(W, H);
  const d = img.data;
  const palette = paletteOf(fighter);
  const solid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const si = ((y * K + (K >> 1)) * W * K + (x * K + (K >> 1))) * 4;
      const a = src[si + 3];
      if (a < 120) continue;
      const c = nearest(palette, src[si] * 255 / a, src[si + 1] * 255 / a, src[si + 2] * 255 / a);
      const i = (y * W + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      solid[y * W + x] = 1;
    }
  }
  // Outer ink so the silhouette always reads.
  const inkRgb = hexRgb(INK);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (solid[y * W + x]) continue;
      if ((x > 0 && solid[y * W + x - 1]) || (x < W - 1 && solid[y * W + x + 1]) || (y > 0 && solid[(y - 1) * W + x]) || (y < H - 1 && solid[(y + 1) * W + x])) {
        const i = (y * W + x) * 4;
        d[i] = inkRgb[0]; d[i + 1] = inkRgb[1]; d[i + 2] = inkRgb[2]; d[i + 3] = 255;
      }
    }
  }
  octx.putImageData(img, 0, 0);
  const at = (k) => ({ x: pr[k].x - x0, y: pr[k].y - y0, s: pr[k].s });
  return {
    canvas: out, w: W, h: H, ax: -x0, ay: -y0,
    head: at('head'), chest: at('chest'), gloveL: at('glL'), gloveR: at('glR'), waist: at('waist'),
  };
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const palCache = new Map();
function paletteOf(f) {
  let p = palCache.get(f.id);
  if (!p) {
    const set = new Set(['#fbf6ee', '#1a1020', '#5a0a14', '#f4efe4', '#e0506a']);
    for (const ramp of Object.values(f.palette)) for (const c of ramp) set.add(c);
    p = [...set].map(hexRgb);
    palCache.set(f.id, p);
  }
  return p;
}
function nearest(pal, r, g, b) {
  let best = pal[0], bd = 1e9;
  for (const c of pal) {
    const d = (c[0] - r) ** 2 * 0.3 + (c[1] - g) ** 2 * 0.59 + (c[2] - b) ** 2 * 0.11;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
