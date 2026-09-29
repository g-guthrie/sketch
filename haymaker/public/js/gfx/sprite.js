// Fighter sprite renderer.
//
// Boxers are built from tapered capsules and ellipsoids posed on a small 3D
// skeleton, then rasterized at native resolution into a cel-shaded, hard-
// outlined pixel sprite. One pose set serves both camera views: the opponent
// seen from the front and the player seen from behind.
//
// Model space: +x is the fighter's own LEFT, +y up, +z the direction the
// fighter faces. Feet rest on y = 0.

const F = 300;          // perspective camera distance (model units)
const EYE_Y = 110;      // camera height; perspective scales about this line
const LIGHT = norm([-0.45, 0.8, 0.55]);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a, b, t) => a + (b - a) * t;

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Rotate a torso-local point: pitch (lean forward), roll (lean to own left), yaw (twist).
function rotate(p, pitch, roll, yaw) {
  let [x, y, z] = p;
  let c = Math.cos(pitch), s = Math.sin(pitch);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(roll); s = Math.sin(roll);
  [x, y] = [x * c + y * s, -x * s + y * c];
  c = Math.cos(yaw); s = Math.sin(yaw);
  [x, z] = [x * c + z * s, -x * s + z * c];
  return [x, y, z];
}

// Two-bone IK: returns [joint, end] given root, target, bone lengths and a bend hint.
function ik(root, target, l1, l2, hint) {
  let d = sub(target, root);
  let dist = len(d);
  const max = (l1 + l2) * 0.999;
  if (dist > max) {
    d = mul(d, max / dist);
    target = add(root, d);
    dist = max;
  }
  const dir = mul(d, 1 / (dist || 1));
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist || 1);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let perp = sub(hint, mul(dir, dot(hint, dir)));
  perp = len(perp) < 1e-4 ? [0, -1, 0] : norm(perp);
  return [add(add(root, mul(dir, a)), mul(perp, h)), target];
}

// ---------------------------------------------------------------------------
// Skeleton

export const REST = {
  root: [0, 0, 0], crouch: 0, pitch: 0, roll: 0, yaw: 0, fall: 0,
  head: [0, 0, 0], headRoll: 0,
  gL: [15, 4, 26], gR: [-15, 2, 24],
  eL: [1, -1, -0.2], eR: [-1, -1, -0.2],
  stance: 0, face: 'normal', glow: 0, hurtFlash: 0,
};

export function buildSkeleton(body, pose) {
  const P = { ...REST, ...pose };
  const b = body;
  const pelvis = [P.root[0], 88 * b.legScale - P.crouch + P.root[1], P.root[2]];
  const T = (p) => add(pelvis, rotate(p, P.pitch, P.roll, P.yaw));
  const chestLocal = [0, 37, 0];
  const j = {};
  j.pelvis = pelvis;
  j.waist = T([0, 13, 1]);
  j.chest = T(chestLocal);
  j.shL = T([b.shoulder, 49, -2]);
  j.shR = T([-b.shoulder, 49, -2]);
  j.neck = T([0, 54, 0]);
  const hd = P.head;
  j.head = T([hd[0], 72 + b.neck + hd[1], 3 + hd[2]]);
  j.headRoll = P.roll + P.headRoll;
  j.yaw = P.yaw;

  const glove = (g) => T(add(chestLocal, g));
  const hintT = (h) => rotate(h, P.pitch, P.roll, P.yaw);
  const armL = ik(j.shL, glove(P.gL), b.upperArm, b.foreArm, hintT(P.eL));
  const armR = ik(j.shR, glove(P.gR), b.upperArm, b.foreArm, hintT(P.eR));
  j.elL = armL[0]; j.glL = armL[1];
  j.elR = armR[0]; j.glR = armR[1];

  const hipYaw = P.yaw * 0.35;
  const hipT = (p) => add(pelvis, rotate(p, 0, P.roll * 0.3, hipYaw));
  j.hipL = hipT([12, -5, 0]);
  j.hipR = hipT([-12, -5, 0]);
  const st = P.stance;
  const ankL = [16 + st * 3, 6, 3 + st * 6];
  const ankR = [-16 - st * 3, 6, -3 - st * 6];
  const thigh = 42 * b.legScale, shin = 40 * b.legScale;
  const legL = ik(j.hipL, ankL, thigh, shin, [0.35, 0, 1]);
  const legR = ik(j.hipR, ankR, thigh, shin, [-0.35, 0, 1]);
  j.knL = legL[0]; j.anL = legL[1];
  j.knR = legR[0]; j.anR = legR[1];

  if (P.fall) {
    // Topple backward about the ankles.
    const c = Math.cos(P.fall), s = Math.sin(P.fall);
    for (const k of Object.keys(j)) {
      const v = j[k];
      if (!Array.isArray(v)) continue;
      const y = v[1] - 4, z = v[2];
      j[k] = [v[0], 4 + y * c + z * s, -y * s + z * c];
    }
    j.fall = P.fall;
  }
  return { j, P };
}

// ---------------------------------------------------------------------------
// Primitive list

export function buildPrims(body, j, P) {
  const b = body;
  const ref = b.outfit === 'ref';
  const torso = ref ? 'shirt' : 'skin';
  const prims = [];
  const cap = (a, bb, r1, r2, mat, group = mat, extra = {}) =>
    prims.push({ type: 'cap', a, b: bb, r1, r2, mat, group, ...extra });
  const ell = (c, r, mat, group = mat, extra = {}) =>
    prims.push({ type: 'ell', c, r, mat, group, rot: extra.rot ?? 0, ...extra });

  const roll = j.headRoll || 0;
  const fall = j.fall || 0;
  // Local offset in the torso frame (for small attached shapes).
  const off = (base, o, withHead = false) => {
    let v = rotate(o, P.pitch * (withHead ? 0.6 : 1) - fall, roll, P.yaw);
    return add(base, v);
  };

  // Legs
  for (const side of ['L', 'R']) {
    const hip = j['hip' + side], kn = j['kn' + side], an = j['an' + side];
    const sx = side === 'L' ? 1 : -1;
    const mid = add(hip, mul(sub(kn, hip), 0.42));
    const legMat = ref ? 'trunks' : 'skin';
    cap(hip, mid, b.thigh + 2.5, b.thigh + 1.5, 'trunks', 'trunks', ref ? {} : { band: 'leg' });
    cap(mid, kn, b.thigh, b.calf + 1, legMat, legMat);
    cap(kn, an, b.calf + 0.5, b.calf - 2.5, legMat, legMat);
    const sockTop = add(an, [0, 9, 0]);
    cap(an, sockTop, b.calf - 1.6, b.calf - 1.2, ref ? 'trunks' : 'sock', 'sock');
    ell(add(an, [sx * 1, -1, 4]), [6.5, 5, 10], 'shoe', 'shoe');
  }

  // Trunks + torso
  ell(off(j.pelvis, [0, 4, 0]), [b.hip, 16, 14], 'trunks', 'trunks', { band: 'waist', rot: -roll });
  // Torso as stacked slices from waist to chest for a smooth V-taper.
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    const o = [0, lerp(15, 36, t), lerp(0, -1, t)];
    const rx = lerp(b.waistW, b.chest, t * t);
    ell(off(j.pelvis, o), [rx, lerp(11, 14, t), lerp(10 + b.belly, 11, t)], torso, torso, { rot: -roll });
  }
  if (b.belly > 2) ell(off(j.waist, [0, 0, 4 + b.belly * 0.5]), [b.waistW * 0.85, 12, 7 + b.belly], torso, torso, { rot: -roll });
  // Pecs, back
  if (!ref) {
    ell(off(j.chest, [9, 5, 5]), [11.5, 7, 6.5], torso, 'pecL', { rot: -roll });
    ell(off(j.chest, [-9, 5, 5]), [11.5, 7, 6.5], torso, 'pecR', { rot: -roll });
  }
  ell(off(j.chest, [0, 3, -6]), [b.chest * 1.02, 15, 8], torso, torso, { rot: -roll });
  cap(off(j.neck, [10, -2, -3]), off(j.neck, [-10, -2, -3]), 8.5, 8.5, torso, torso);
  if (ref) {
    // Bow tie.
    ell(off(j.neck, [4.5, -4, 11]), [4.6, 3, 2.5], 'tie', 'tie');
    ell(off(j.neck, [-4.5, -4, 11]), [4.6, 3, 2.5], 'tie', 'tie');
    ell(off(j.neck, [0, -4, 12.5]), [2, 2, 2], 'tie', 'tie');
  }

  // Neck + head
  cap(j.neck, off(j.head, [0, -8, -2], true), b.neckR, b.neckR - 1, 'skin', 'skin');
  const hr = b.headR;
  ell(j.head, [hr * 0.96, hr * 1.0, hr * 0.95], 'skin', 'head', { rot: -roll });
  ell(off(j.head, [0, -hr * 0.52, hr * 0.28], true), [hr * 0.76 * b.jaw, hr * 0.52, hr * 0.62], 'skin', 'head', { rot: -roll });
  ell(off(j.head, [hr * 0.9, -1, -1], true), [3, 4.2, 3], 'skin', 'ear');
  ell(off(j.head, [-hr * 0.9, -1, -1], true), [3, 4.2, 3], 'skin', 'ear');
  ell(off(j.head, [0, -hr * 0.05, hr * 0.93], true), [2.6, 3.4, 3], 'skin', 'head', { rot: -roll });

  // Hair
  const H = (o, r, extra = {}) => ell(off(j.head, o, true), r, 'hair', 'hair', { rot: -roll, ...extra });
  switch (b.hair) {
    case 'buzz': H([0, hr * 0.22, -hr * 0.2], [hr * 0.96, hr * 1.0, hr * 0.97]); break;
    case 'flattop':
      H([0, hr * 0.22, -hr * 0.2], [hr * 0.99, hr * 1.0, hr * 0.97]);
      H([0, hr * 0.92, -hr * 0.1], [hr * 0.88, hr * 0.56, hr * 0.8]);
      break;
    case 'mohawk':
      H([0, hr * 0.1, -hr * 0.2], [hr * 0.95, hr * 1.0, hr * 0.96]);
      H([0, hr * 0.95, -hr * 0.12], [hr * 0.22, hr * 0.62, hr * 1.02]);
      break;
    case 'afro': H([0, hr * 0.5, -hr * 0.35], [hr * 1.32, hr * 1.12, hr * 1.2]); break;
    case 'pomp':
      H([0, hr * 0.24, -hr * 0.2], [hr * 0.99, hr * 1.0, hr * 0.97]);
      H([0, hr * 0.8, hr * 0.3], [hr * 0.72, hr * 0.4, hr * 0.62]);
      H([hr * 0.1, hr * 0.95, hr * 0.05], [hr * 0.6, hr * 0.32, hr * 0.6]);
      break;
    case 'bald': break;
  }
  if (b.hair === 'mohawk') prims[prims.length - 2].mat = 'hairDark';
  if (b.beard) {
    ell(off(j.head, [0, -hr * 0.62, hr * 0.26], true), [hr * 0.86, hr * 0.46, hr * 0.66], 'hair', 'beard', { rot: -roll });
  }
  if (b.stache) {
    ell(off(j.head, [0, -hr * 0.3, hr * 0.9], true), [hr * 0.42, hr * 0.13, 3], 'hair', 'stache', { rot: -roll });
  }

  // Arms + gloves
  for (const side of ['L', 'R']) {
    const sh = j['sh' + side], el = j['el' + side], gl = j['gl' + side];
    const sx = side === 'L' ? 1 : -1;
    ell(sh, [b.delt, b.delt * 0.95, b.delt], torso, torso);
    cap(sh, el, b.arm + 1, b.arm - 0.5, torso, torso);
    const fdir = norm(sub(gl, el));
    if (ref) {
      cap(el, gl, b.arm - 0.5, b.arm - 1.8, 'skin', 'skin');
      ell(gl, [b.glove, b.glove * 1.1, b.glove], 'skin', 'hand' + side);
      continue;
    }
    const wrist = add(gl, mul(fdir, -b.glove * 0.9));
    cap(el, wrist, b.arm - 0.5, b.arm - 1.8, 'skin', 'skin');
    const cuffEnd = add(gl, mul(fdir, -b.glove * 0.35));
    cap(wrist, cuffEnd, b.glove * 0.62, b.glove * 0.7, 'gloveTrim', 'glove' + side);
    const g = P.glow && side === 'R' ? 'gloveGlow' : 'glove';
    ell(gl, [b.glove * 0.98, b.glove, b.glove * 0.98], g, 'glove' + side, { shiny: true });
    // Thumb on the inner-top of the glove.
    const up = [0, 1, 0];
    let across = norm([-sx, 0.15, 0.2]);
    ell(add(add(gl, mul(up, b.glove * 0.35)), mul(across, b.glove * 0.72)), [b.glove * 0.36, b.glove * 0.42, b.glove * 0.36], g, 'glove' + side, { shiny: true });
  }
  return prims;
}

// ---------------------------------------------------------------------------
// Rasterizer

function project(p, view, S, ox, oy) {
  const cx = view === 'back' ? -p[0] : p[0];
  const cz = view === 'back' ? -p[2] : p[2];
  const s = F / (F - cz);
  return { x: ox + cx * s * S, y: oy - (EYE_Y + (p[1] - EYE_Y) * s) * S, z: cz, s: s * S };
}

function buildMaterials(fighter) {
  const m = {};
  for (const [k, ramp] of Object.entries(fighter.palette)) m[k] = ramp.map(hexToRgb);
  return m;
}

export function renderFighter(fighter, pose, view = 'front', S = 1) {
  const body = fighter.body;
  const { j, P } = buildSkeleton(body, pose);
  const prims = buildPrims(body, j, P);

  // Project everything to find bounds.
  const pj = [];
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const pr of prims) {
    if (pr.type === 'cap') {
      const a = project(pr.a, view, S, 0, 0), bb = project(pr.b, view, S, 0, 0);
      const q = { ...pr, pa: a, pb: bb, ra: pr.r1 * a.s, rb: pr.r2 * bb.s };
      pj.push(q);
      minX = Math.min(minX, a.x - q.ra, bb.x - q.rb); maxX = Math.max(maxX, a.x + q.ra, bb.x + q.rb);
      minY = Math.min(minY, a.y - q.ra, bb.y - q.rb); maxY = Math.max(maxY, a.y + q.ra, bb.y + q.rb);
    } else {
      const c = project(pr.c, view, S, 0, 0);
      const q = { ...pr, pc: c, rx: pr.r[0] * c.s, ry: pr.r[1] * c.s, rz: pr.r[2] * c.s };
      pj.push(q);
      const R = Math.max(q.rx, q.ry);
      minX = Math.min(minX, c.x - R); maxX = Math.max(maxX, c.x + R);
      minY = Math.min(minY, c.y - R); maxY = Math.max(maxY, c.y + R);
    }
  }
  const pad = 3;
  const x0 = Math.floor(minX) - pad, y0 = Math.floor(minY) - pad;
  const W = Math.ceil(maxX) + pad - x0, Hh = Math.ceil(maxY) + pad - y0;
  const N = W * Hh;
  const depth = new Float32Array(N).fill(-1e9);
  const matBuf = new Array(N).fill(null);
  const groupBuf = new Array(N).fill(null);
  const shadeBuf = new Uint8Array(N);
  const shinyBuf = new Uint8Array(N);
  const nBuf = new Float32Array(N * 3);

  const band = (pr, u, v) => {
    if (pr.band === 'waist' && v < -0.5) return 'trunksTrim';
    return pr.mat;
  };

  for (const q of pj) {
    if (q.type === 'cap') {
      const ax = q.pa.x - x0, ay = q.pa.y - y0, bx = q.pb.x - x0, by = q.pb.y - y0;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6;
      const rmax = Math.max(q.ra, q.rb);
      const ix0 = Math.max(0, Math.floor(Math.min(ax, bx) - rmax)), ix1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + rmax));
      const iy0 = Math.max(0, Math.floor(Math.min(ay, by) - rmax)), iy1 = Math.min(Hh - 1, Math.ceil(Math.max(ay, by) + rmax));
      for (let y = iy0; y <= iy1; y++) {
        for (let x = ix0; x <= ix1; x++) {
          const px = x + 0.5, py = y + 0.5;
          let t = ((px - ax) * dx + (py - ay) * dy) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const cx = ax + dx * t, cy = ay + dy * t;
          const r = q.ra + (q.rb - q.ra) * t;
          const ex = px - cx, ey = py - cy;
          const d2 = ex * ex + ey * ey;
          if (d2 > r * r) continue;
          const nz = Math.sqrt(r * r - d2);
          // Depth in model units: convert the pixel-space bulge back.
          const z = q.pa.z + (q.pb.z - q.pa.z) * t + nz / (q.pa.s + (q.pb.s - q.pa.s) * t);
          const i = y * W + x;
          if (z <= depth[i]) continue;
          depth[i] = z;
          matBuf[i] = q.mat === 'trunks' && q.band === 'leg' && t > 0.86 ? 'trunksTrim' : q.mat;
          groupBuf[i] = q.group;
          nBuf[i * 3] = ex / r; nBuf[i * 3 + 1] = -ey / r; nBuf[i * 3 + 2] = nz / r;
          shinyBuf[i] = q.shiny ? 1 : 0;
        }
      }
    } else {
      const cx = q.pc.x - x0, cy = q.pc.y - y0;
      const cr = Math.cos(q.rot), sr = Math.sin(q.rot);
      const R = Math.max(q.rx, q.ry);
      const ix0 = Math.max(0, Math.floor(cx - R)), ix1 = Math.min(W - 1, Math.ceil(cx + R));
      const iy0 = Math.max(0, Math.floor(cy - R)), iy1 = Math.min(Hh - 1, Math.ceil(cy + R));
      for (let y = iy0; y <= iy1; y++) {
        for (let x = ix0; x <= ix1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          const lx = dx * cr + dy * sr, ly = -dx * sr + dy * cr;
          const u = lx / q.rx, v = ly / q.ry;
          const qq = u * u + v * v;
          if (qq > 1) continue;
          const w = Math.sqrt(1 - qq);
          const z = q.pc.z + q.r[2] * w;
          const i = y * W + x;
          if (z <= depth[i]) continue;
          depth[i] = z;
          matBuf[i] = band(q, u, v);
          groupBuf[i] = q.group;
          // Normal in local then rotate back.
          let nx = u / q.rx, ny = -v / q.ry, nz = w / q.rz;
          const l = Math.hypot(nx, ny, nz) || 1;
          nx /= l; ny /= l; nz /= l;
          const rx = nx * cr + ny * sr, ry = -nx * sr + ny * cr;
          nBuf[i * 3] = rx; nBuf[i * 3 + 1] = ry; nBuf[i * 3 + 2] = nz;
          shinyBuf[i] = q.shiny ? 1 : 0;
        }
      }
    }
  }

  // Smooth normals across touching primitives of the same material so the
  // body reads as one surface instead of a stack of balls.
  const sm = new Float32Array(N * 3);
  const R = Math.max(1, Math.round(1.6 * S));
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const m = matBuf[i];
      if (!m) continue;
      let ax = 0, ay = 0, az = 0;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= Hh) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const k = yy * W + xx;
          if (matBuf[k] !== m || Math.abs(depth[k] - depth[i]) > 2.5) continue;
          ax += nBuf[k * 3]; ay += nBuf[k * 3 + 1]; az += nBuf[k * 3 + 2];
        }
      }
      const l = Math.hypot(ax, ay, az) || 1;
      sm[i * 3] = ax / l; sm[i * 3 + 1] = ay / l; sm[i * 3 + 2] = az / l;
    }
  }

  // Shade into ramp indices.
  const light = view === 'back' ? norm([0.35, 0.85, 0.4]) : LIGHT;
  for (let i = 0; i < N; i++) {
    if (!matBuf[i]) continue;
    const nx = sm[i * 3], ny = sm[i * 3 + 1], nz = sm[i * 3 + 2];
    const ndl = nx * light[0] + ny * light[1] + nz * light[2];
    let I = 0.3 + 0.75 * Math.max(0, ndl);
    // Rim light from the arena behind.
    I += 0.12 * Math.pow(Math.max(0, 1 - nz), 3);
    const x = i % W, y = (i / W) | 0;
    I += BAYER[(y & 3) * 4 + (x & 3)] * 0.035;
    let s = I < 0.48 ? 1 : I < 0.78 ? 2 : 3;
    if (shinyBuf[i] || matBuf[i] === 'hair' || matBuf[i] === 'skin') {
      // Specular: reflect the light about the normal, compare to view (0,0,1).
      const rz = 2 * ndl * nz - light[2];
      const pw = shinyBuf[i] ? 14 : 30;
      const sp = Math.pow(Math.max(0, rz), pw);
      if (sp > (shinyBuf[i] ? 0.5 : 0.75) && s === 3) s = 4;
    }
    shadeBuf[i] = s;
  }

  // Inner lines where a surface passes in front of another.
  const line = new Uint8Array(N);
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!matBuf[i]) continue;
      const z = depth[i];
      const g = groupBuf[i];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [ox, oy] of nb) {
        const xx = x + ox, yy = y + oy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= Hh) continue;
        const k = yy * W + xx;
        if (!matBuf[k]) continue;
        const gap = depth[k] - z;
        const sameGroup = groupBuf[k] === g;
        const thresh = sameGroup ? 7 : groupBuf[k] && groupBuf[k].startsWith('pec') && g === 'skin' ? 2.2 : 3.2;
        if (gap > thresh) { line[i] = 1; break; }
      }
    }
  }

  const mats = buildMaterials(fighter);
  const canvas = makeCanvas(W, Hh);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, Hh);
  const d = img.data;
  const put = (i, rgb, a = 255) => { d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = a; };

  for (let i = 0; i < N; i++) {
    const m = matBuf[i];
    if (!m) continue;
    const ramp = mats[m] || mats.skin;
    put(i, line[i] ? ramp[0] : ramp[Math.min(shadeBuf[i], ramp.length - 1)]);
  }
  // Outer outline.
  const outline = mats.outline ? mats.outline[0] : [20, 10, 16];
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (matBuf[i]) continue;
      let near = null;
      if (x > 0 && matBuf[i - 1]) near = matBuf[i - 1];
      else if (x < W - 1 && matBuf[i + 1]) near = matBuf[i + 1];
      else if (y > 0 && matBuf[i - W]) near = matBuf[i - W];
      else if (y < Hh - 1 && matBuf[i + W]) near = matBuf[i + W];
      if (near) put(i, outline);
    }
  }

  // Face (front view only).
  const headP = project(j.head, view, S, -x0, -y0);
  if (view === 'front') {
    drawFace(d, W, Hh, groupBuf, depth, headP, body.headR * headP.s, fighter, P, j, mats);
  }

  ctx.putImageData(img, 0, 0);
  const at = (p) => { const q = project(p, view, S, -x0, -y0); return { x: q.x, y: q.y, s: q.s }; };
  return {
    canvas, w: W, h: Hh,
    ax: -x0, ay: -y0, // origin (feet center on floor) inside the canvas
    head: at(j.head), chest: at(j.chest), gloveL: at(j.glL), gloveR: at(j.glR), waist: at(j.waist),
  };
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// ---------------------------------------------------------------------------
// Face features: small hand-drawn pixel maps placed on the head.

// Maps are drawn for the screen-left eye/brow (inner corner on the right)
// and mirrored for the other side. o = outline, w = white, p = pupil,
// s = skin shadow, h = hair (brows), r = mouth interior, t = teeth.
const EYES = {
  angry: [
    '.ooooooo.',
    'owwwwpppo',
    'owwwwpppo',
    '.ooooooo.',
  ],
  hurt: [
    '.........',
    'ooo......',
    '...oooo..',
    '.......oo',
  ],
  daze: [
    '.ooooooo.',
    'owo.o.owo',
    'oo.o.o.oo',
    '.ooooooo.',
  ],
  shut: [
    '.........',
    '.........',
    'ooooooooo',
    '.sssssss.',
  ],
  happy: [
    '.........',
    '..ooooo..',
    '.o.....o.',
    'o.......o',
  ],
  ko: [
    'oo.....oo',
    '..oo.oo..',
    '....o....',
    '..oo.oo..',
    'oo.....oo',
  ],
};
const BROWS = {
  angry: [
    'hhhh.......',
    'hhhhhhhh...',
    '..hhhhhhhhh',
    '......hhhhh',
  ],
  worry: [
    '.......hhhh',
    '...hhhhhhhh',
    'hhhhhhhh...',
  ],
  normal: [
    '.hhhhhhhhh.',
    'hhhhhhhhhhh',
  ],
};
const MOUTHS = {
  smirk: [
    '...........oo',
    '.ooooooooooo.',
    '....sssss....',
  ],
  grit: [
    '.ooooooooooo.',
    'otttotttottto',
    'otttotttottto',
    '.ooooooooooo.',
  ],
  hurt: [
    '....ooooo....',
    '..oorrrrroo..',
    '.orrtttttrro.',
    '.orrrrrrrrro.',
    '..ooooooooo..',
  ],
  tired: [
    '....ooooo....',
    '...orrrrro...',
    '...orrrrro...',
    '....ooooo....',
  ],
  smile: [
    'oo.........oo',
    '.ooooooooooo.',
    '.ottttttttto.',
    '..orrrrrrro..',
    '...ooooooo...',
  ],
  ko: [
    '.....ooo.....',
    '....orrro....',
    '....orrro....',
    '.....ooo.....',
  ],
};
const FACE_FOR = {
  normal: { eyes: 'angry', brows: 'angry', mouth: 'smirk' },
  focus: { eyes: 'angry', brows: 'angry', mouth: 'grit' },
  hurt: { eyes: 'hurt', brows: 'worry', mouth: 'hurt' },
  daze: { eyes: 'daze', brows: 'worry', mouth: 'tired' },
  tired: { eyes: 'shut', brows: 'worry', mouth: 'tired' },
  happy: { eyes: 'happy', brows: 'normal', mouth: 'smile' },
  ko: { eyes: 'ko', brows: 'worry', mouth: 'ko' },
  block: { eyes: 'angry', brows: 'angry', mouth: 'grit' },
  shout: { eyes: 'angry', brows: 'angry', mouth: 'tired' },
  calm: { eyes: 'angry', brows: 'normal', mouth: 'smirk' },
};

function drawFace(d, W, H, groupBuf, depth, hp, r, fighter, P, j, mats) {
  const f = FACE_FOR[P.face] || FACE_FOR.normal;
  const skin = mats.skin, hair = mats.hair || mats.skin;
  const col = {
    o: mats.outline ? mats.outline[0] : [20, 10, 16],
    w: [250, 246, 236],
    p: [28, 22, 40],
    s: skin[1],
    h: fighter.body.hair === 'bald' || fighter.body.hair === 'mohawk' ? hair[1] : hair[1],
    r: [110, 16, 28],
    t: [244, 240, 230],
  };
  const yawShift = Math.sin(j.yaw || 0) * r * 0.55 + (P.head[0] || 0) * 0.25;
  const cx = Math.round(hp.x + yawShift), cy = hp.y;
  let mouthPass = false;
  const canPaint = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const g = groupBuf[y * W + x];
    return g === 'head' || g === 'stache' || (mouthPass && g === 'beard');
  };
  const stamp = (map, px, py, mirror = false) => {
    const h = map.length, w = map[0].length;
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const ch = map[yy][mirror ? w - 1 - xx : xx];
        if (ch === '.') continue;
        const X = Math.round(px + xx), Y = Math.round(py + yy);
        if (!canPaint(X, Y)) continue;
        const c = col[ch];
        if (!c) continue;
        const i = (Y * W + X) * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    }
  };
  const eye = EYES[f.eyes];
  const ew = eye[0].length;
  const gap = Math.max(2, Math.round(r * 0.12));
  const eyY = Math.round(cy - r * 0.1 - eye.length / 2);
  stamp(eye, cx - gap - ew, eyY, false);
  stamp(eye, cx + gap, eyY, true);
  const brow = BROWS[f.brows];
  const bw = brow[0].length;
  const brY = eyY - brow.length + (f.brows === 'angry' ? 2 : -1);
  stamp(brow, cx - gap - bw + 1, brY, false);
  stamp(brow, cx + gap - 1, brY, true);
  mouthPass = true;
  const mouth = MOUTHS[f.mouth];
  const mw = mouth[0].length;
  stamp(mouth, Math.round(cx - mw / 2), Math.round(cy + r * 0.5), false);
}
