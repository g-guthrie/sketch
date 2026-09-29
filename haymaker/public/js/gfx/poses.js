// Keyframe poses. Glove targets (gL/gR) are in the chest frame:
// +x = the fighter's own left, +y up, +z forward.

export const POSES = {
  idle: {},
  idle2: { crouch: 2, gL: [15, 2, 27], gR: [-15, 0, 25], head: [0, -1, 0] },
  guard: { crouch: 3, gL: [8, 30, 27], gR: [-8, 29, 27], eL: [0.6, -1, 0], eR: [-0.6, -1, 0], head: [0, -2, -1], face: 'block' },
  low: { crouch: 7, pitch: 0.16, gL: [9, -6, 25], gR: [-9, -7, 25], eL: [1, -0.4, -0.3], eR: [-1, -0.4, -0.3], face: 'block' },
  slipL: { root: [20, -3, 0], roll: 0.32, head: [4, -2, 0], gL: [14, 14, 24], gR: [-8, 22, 26] },
  slipR: { root: [-20, -3, 0], roll: -0.32, head: [-4, -2, 0], gL: [8, 22, 26], gR: [-14, 14, 24] },
  duck: { crouch: 32, pitch: 0.34, head: [0, -3, 2], gL: [10, 26, 22], gR: [-10, 25, 22] },

  jabWind: { yaw: -0.08, gL: [16, 14, 18], crouch: 2 },
  jab: { yaw: -0.22, root: [0, 0, 6], pitch: 0.08, gL: [6, 22, 66], eL: [1, -0.6, 0], gR: [-12, 18, 22] },

  hookLWind: { yaw: 0.28, gL: [48, 16, 6], eL: [1, 0.2, -0.4], crouch: 3 },
  hookL: { yaw: -0.5, pitch: 0.06, roll: -0.08, gL: [-10, 24, 44], eL: [1, 0.35, 0], gR: [-14, 16, 20] },
  hookRWind: { yaw: -0.28, gR: [-48, 16, 6], eR: [-1, 0.2, -0.4], crouch: 3 },
  hookR: { yaw: 0.5, pitch: 0.06, roll: 0.08, gR: [10, 24, 44], eR: [-1, 0.35, 0], gL: [14, 16, 20] },

  bodyWind: { crouch: 10, yaw: -0.2, gR: [-24, -6, 4], eR: [-1, -0.6, -0.4] },
  body: { crouch: 14, pitch: 0.22, yaw: 0.3, root: [0, 0, 6], gR: [-2, -24, 50], eR: [-1, -0.8, 0], gL: [12, 16, 24] },

  windup: { crouch: 18, pitch: 0.1, yaw: -0.34, roll: -0.1, gR: [-30, -34, -10], eR: [-0.6, -1, -0.2], gL: [10, 22, 26], glow: 1, face: 'focus' },
  upper: { root: [0, 8, 6], pitch: -0.14, yaw: 0.36, roll: 0.08, gR: [0, 52, 34], eR: [-0.3, -1, 0.4], gL: [16, 10, 20], glow: 1, face: 'focus' },

  starWind: { crouch: 8, yaw: -0.4, gR: [-40, 20, -16], eR: [-1, 0, -0.2], gL: [12, 20, 24], face: 'focus' },
  star: { root: [0, 0, 16], pitch: 0.2, yaw: 0.34, gR: [0, 22, 72], eR: [-1, -0.5, 0], gL: [16, 12, 18], face: 'focus' },

  hurtHead: { pitch: -0.24, roll: 0.1, head: [3, 2, -9], headRoll: 0.2, gL: [34, 4, 14], gR: [-30, 10, 12], eL: [1, -0.2, -0.5], eR: [-1, -0.2, -0.5], face: 'hurt' },
  hurtHead2: { pitch: -0.3, roll: -0.12, head: [-3, 2, -10], headRoll: -0.25, gL: [30, 12, 12], gR: [-34, 2, 14], eL: [1, -0.2, -0.5], eR: [-1, -0.2, -0.5], face: 'hurt' },
  hurtBody: { crouch: 12, pitch: 0.4, head: [0, -2, 3], gL: [12, -10, 18], gR: [-12, -12, 18], face: 'hurt' },
  stun: { pitch: -0.06, roll: 0.14, crouch: 6, head: [3, -1, 0], headRoll: 0.18, gL: [24, -26, 14], gR: [-22, -28, 16], eL: [1, -0.3, 0], eR: [-1, -0.3, 0], face: 'daze' },
  stun2: { pitch: -0.06, roll: -0.14, crouch: 6, head: [-3, -1, 0], headRoll: -0.18, gL: [22, -28, 16], gR: [-24, -26, 14], eL: [1, -0.3, 0], eR: [-1, -0.3, 0], face: 'daze' },
  tired: { crouch: 8, pitch: 0.2, head: [0, -3, 2], gL: [18, -8, 22], gR: [-18, -10, 22], face: 'tired' },
  tired2: { crouch: 10, pitch: 0.24, head: [0, -4, 2], gL: [18, -10, 22], gR: [-18, -12, 22], face: 'tired' },
  fall1: { pitch: -0.3, crouch: 6, head: [0, 2, -10], gL: [36, 20, 6], gR: [-36, 18, 6], face: 'ko' },
  fall2: { fall: 0.9, pitch: -0.2, crouch: 18, head: [0, 2, -8], gL: [38, 30, 0], gR: [-38, 30, 0], face: 'ko' },
  down: { fall: 1.5, crouch: 6, head: [0, 4, -4], headRoll: 0.2, gL: [42, 40, 6], gR: [-44, 30, 8], face: 'ko' },
  win: { root: [0, 4, 0], gL: [30, 64, 6], gR: [-30, 64, 6], eL: [1, 0, 0], eR: [-1, 0, 0], face: 'happy' },
  win2: { root: [0, 6, 0], gL: [26, 70, 8], gR: [-34, 58, 4], eL: [1, 0, 0], eR: [-1, 0, 0], face: 'happy' },
  taunt: { yaw: 0.2, gL: [20, 30, 20], gR: [-16, 6, 28], face: 'happy' },
  refIdle: { gL: [22, -34, 8], gR: [-22, -34, 8], eL: [1, 0, -0.6], eR: [-1, 0, -0.6], face: 'calm' },
  refLook: { pitch: 0.18, crouch: 6, gL: [16, -20, 22], gR: [-16, -20, 22], eL: [1, -0.4, -0.3], eR: [-1, -0.4, -0.3], face: 'calm' },
  refCount: { pitch: 0.1, yaw: 0.1, gR: [-10, 52, 22], eR: [-1, 0, 0], gL: [20, -30, 12], face: 'shout' },
  refCount2: { pitch: 0.24, yaw: -0.08, crouch: 4, gR: [-18, 4, 36], eR: [-1, -0.2, 0], gL: [20, -30, 12], face: 'shout' },
  refWave: { gL: [36, 52, 4], gR: [-36, 52, 4], eL: [1, -0.2, 0], eR: [-1, -0.2, 0], face: 'shout' },
  refWave2: { gL: [-6, 6, 30], gR: [6, 4, 30], eL: [1, -0.5, 0], eR: [-1, -0.5, 0], face: 'shout' },
};

const NUM = ['crouch', 'pitch', 'roll', 'yaw', 'fall', 'headRoll', 'glow', 'stance'];
const VEC = ['root', 'head', 'gL', 'gR', 'eL', 'eR'];
const DEF = { root: [0, 0, 0], head: [0, 0, 0], gL: [15, 4, 26], gR: [-15, 2, 24], eL: [1, -1, -0.2], eR: [-1, -1, -0.2] };

export function blend(a, b, t) {
  const out = {};
  for (const k of NUM) out[k] = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * t;
  for (const k of VEC) {
    const va = a[k] ?? DEF[k], vb = b[k] ?? DEF[k];
    out[k] = [0, 1, 2].map((i) => va[i] + (vb[i] - va[i]) * t);
  }
  out.face = t < 0.5 ? a.face ?? 'normal' : b.face ?? 'normal';
  return out;
}
