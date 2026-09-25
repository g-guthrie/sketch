// Body builds: proportions per role. All lengths in local units at scale 1
// (a standard hero stands ~95 units tall, ~7 heads).

const HERO = {
  thigh: 23.5, shin: 22.5, ank: 4,
  upper: 16.5, fore: 15,
  waist: 11,          // hip centre -> waist pivot
  chestH: 21,         // waist -> neck base
  shY: -15.2,         // shoulder joints (chest frame, from waist)
  shN: -8.2, shNt: -3.2, // near (gun-arm) shoulder x at twist 0 / 1
  shF: 8.4, shFt: 4.8,   // far shoulder x
  hipX: 3.1,          // hip joints half spacing
  hipH: 48.4,         // standing hip height
  neck: 4.6, neckR: 4.5,
  head: 0.8,          // head scale
  // widths (multipliers of the hero torso shape)
  chest: 1, waistW: 1, hips: 1, belly: 0,
  arm: 1, leg: 1, hand: 1, foot: 1,
  fem: false, hunch: 0, kid: false,
};

export function buildFor(look, k) {
  const B = { ...HERO };
  const bulk = look.bulk || 1;
  const robot = look.body === 'robot';
  if (look.fem || look.ponytail || look.hairStyle === 'bob') {
    B.fem = true;
    B.chest = 0.86; B.waistW = 0.82; B.hips = 1.04; B.arm = 0.78; B.leg = 0.86; B.hand = 0.86; B.foot = 0.9;
    B.neckR = 3.4; B.head = 0.84; B.shN = -6.8; B.shF = 7.2;
  }
  if (look.head === 'bubble') { B.kid = true; B.head = 0.86; B.chest = 0.92; B.arm = 0.9; B.leg = 0.92; }
  switch (k) {
    case 'grunt':
      B.chest = 1.06; B.waistW = 1.06; B.arm = 1.08; B.hand = 1.25; B.leg = 1.02; B.head = 1.0; B.hunch = 0.1;
      B.thigh = 20.5; B.shin = 20; B.hipH = 43; B.belly = 1.5;
      break;
    case 'gunner':
      B.chest = 0.9; B.waistW = 0.88; B.arm = 0.86; B.leg = 0.86; B.head = 0.98; B.hand = 0.95;
      break;
    case 'shield':
      B.chest = 1.08; B.waistW = 1.1; B.arm = 1.05; B.leg = 1.08; B.head = 0.96; B.hand = 1.1;
      B.thigh = 21; B.shin = 20; B.hipH = 43.5;
      break;
    case 'grenadier':
      B.chest = 0.98; B.waistW = 1.12; B.belly = 3; B.arm = 0.95; B.head = 1.02; B.hand = 1.05;
      break;
    case 'artist':
      B.chest = 0.8; B.waistW = 0.8; B.hips = 0.9; B.arm = 0.66; B.leg = 0.66; B.hand = 0.9; B.head = 1.0;
      B.thigh = 23; B.shin = 22.5; B.hipH = 47.5; B.neck = 6.5; B.neckR = 2.8; B.hunch = 0.12;
      B.shN = -5.8; B.shF = 6.2;
      break;
    case 'brute':
      B.chest = 1.25; B.waistW = 1.05; B.arm = 1.35; B.hand = 1.5; B.leg = 1.15; B.head = 0.76;
      B.thigh = 19; B.shin = 18.5; B.hipH = 40; B.upper = 18; B.fore = 16.5; B.neck = 3.5; B.neckR = 6;
      B.chestH = 23; B.shY = -16; B.hunch = 0.12;
      break;
    case 'boss':
      B.chest = 1.08; B.arm = 1.05; B.head = 0.95;
      break;
    case 'flyer':
      B.chest = 0.95; B.arm = 0.92; B.leg = 0.9;
      break;
    default:
      break;
  }
  if (look.head === 'civilian' || k === 'civilian' || k === 'civ') {
    B.chest = Math.min(B.chest, 0.84); B.waistW = 0.92; B.arm = Math.min(B.arm, 0.8); B.leg = Math.min(B.leg, 0.85);
    B.head = 1.02; B.hand = 0.9; B.neckR = 3.4; B.shN = -6.4; B.shF = 6.8;
  }
  if (look.bloat) { B.belly = Math.max(B.belly, 4); B.waistW *= 1.12; }
  if (look.hunch) B.hunch = Math.max(B.hunch, look.hunch * 0.7);
  // bulk widens everything, and big bodies get relatively smaller heads
  const bw = 1 + (bulk - 1) * 0.85;
  B.chest *= bw; B.waistW *= 1 + (bulk - 1) * 0.7; B.hips *= 1 + (bulk - 1) * 0.6;
  B.arm *= 1 + (bulk - 1) * 0.75; B.leg *= 1 + (bulk - 1) * 0.6; B.hand *= 1 + (bulk - 1) * 0.5;
  B.shN *= bw; B.shF *= bw; B.shNt *= bw; B.shFt *= bw;
  B.neckR *= 1 + (bulk - 1) * 0.7;
  if (bulk > 1.3) B.head *= 1 - (bulk - 1.3) * 0.25;
  if (robot) {
    B.robot = true;
    B.head = 1;
    B.neck = 3;
    if (k === 'artist') { B.arm = 0.8; B.leg = 0.8; B.chest = 0.85; }
  }
  B.legLen = B.thigh + B.shin;
  B.armLen = B.upper + B.fore;
  return B;
}
