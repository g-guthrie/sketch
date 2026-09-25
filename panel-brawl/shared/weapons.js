// Weapon definitions. Players always carry the PEACEMAKER (sidearm) plus one
// heavy slot filled from pickups. Punches, INK BOMBS and the SPLASH PAGE
// super are available to everyone.

export const WEAPONS = {
  pistol: {
    key: 'pistol', name: 'PEACEMAKER', rate: 0.17, mag: 12, reload: 0.85,
    dmg: 17, speed: 2100, spread: 0.02, pellets: 1, proj: 'bullet', knock: 150,
    life: 1.2, len: 30, twoHand: false, recoil: 0,
    words: ['BANG!', 'PEW!', 'BLAM!'], color: '#ffe14a', shake: 0.08,
  },
  shotgun: {
    key: 'shotgun', name: 'KA-BLAMMER', rate: 0.8, ammo: 14,
    dmg: 12, speed: 1750, speedVar: 0.3, spread: 0.2, pellets: 8, proj: 'pellet', knock: 95,
    life: 0.32, len: 44, twoHand: true, recoil: 360,
    words: ['KA-BLAM!', 'BLAMM!', 'KRA-KOOM!'], color: '#ff9a1f', shake: 0.35,
  },
  smg: {
    key: 'smg', name: 'RAT-A-TAT', rate: 0.07, ammo: 90,
    dmg: 9, speed: 2250, spread: 0.09, pellets: 1, proj: 'bullet', knock: 70,
    life: 0.9, len: 42, twoHand: true, recoil: 0,
    words: ['RAT-TAT!', 'TAT-TAT-TAT!', 'BRRRAP!'], color: '#ffe14a', shake: 0.1,
  },
  launcher: {
    key: 'launcher', name: 'ONOMATO-CANNON', rate: 0.95, ammo: 7,
    dmg: 95, radius: 190, speed: 1150, grav: 900, spread: 0, pellets: 1, proj: 'word', knock: 950,
    life: 3, len: 50, twoHand: true, recoil: 200,
    words: ['THOOMP!', 'FWOOMP!'], boomWords: ['KA-BOOOM!', 'KRAKOOOM!', 'BADABOOM!', 'KA-BLOOEY!'],
    ammoWords: ['BOOM', 'POW', 'WHAM', 'BLAM', 'KRAK', 'ZAP'], color: '#ff4d2b', shake: 0.3,
  },
  rail: {
    key: 'rail', name: 'INK RAILGUN', rate: 1.25, ammo: 8,
    dmg: 70, hitscan: true, range: 2800, knock: 700, pierceFalloff: 0.8,
    len: 56, twoHand: true, recoil: 280,
    words: ['ZZAKK!', 'SHRAKOOM!', 'VWSSSH!'], color: '#23d5e8', shake: 0.4,
  },
  blade: {
    key: 'blade', name: 'PANEL CUTTER', rate: 0.36, ammo: -1, melee: true,
    dmg: 42, range: 138, arc: 1.15, knock: 620, lunge: 380,
    len: 60, twoHand: false,
    words: ['SHING!', 'SLASH!', 'SHNNK!', 'SWISH!'], color: '#ff3fa4', shake: 0.15,
  },
};

export const HEAVY_KEYS = ['shotgun', 'smg', 'launcher', 'rail', 'blade'];

export const PUNCH = {
  rate: 0.42, dmg: 20, reach: 50, radius: 46, knock: 480, lift: 220,
  comboWindow: 0.8, comboDmg: 34, comboKnock: 900, comboLift: 620,
  words: ['POW!', 'WHAM!', 'BIFF!', 'SOCK!', 'BOP!'], comboWords: ['KA-POW!!', 'WHAMMO!!', 'KER-SMASH!!'],
};

export const BOMB = {
  speed: 820, grav: 1700, fuse: 1.5, radius: 175, dmg: 80, knock: 950, bounce: 0.45,
  words: ['KA-BOOM!', 'BOOOM!', 'KRA-KA-BOOM!'],
};

export const SUPER = {
  windup: 0.6, radius: 430, dmg: 115, knock: 1250, chargePerDmg: 1 / 4.6, chargePerKO: 10,
};

export const EXPLOSION_SELF = 0.35;

// Enemy projectiles
export const ENEMY_SHOTS = {
  ebullet: { speed: 950, dmg: 9, life: 1.6, r: 5, knock: 120 },
  orb: { speed: 430, dmg: 12, life: 3.2, r: 11, knock: 220 },
  acid: { speed: 720, dmg: 11, life: 2.4, r: 9, grav: 1100, knock: 160 },
  bossorb: { speed: 360, dmg: 15, life: 4, r: 14, knock: 320 },
};

export const PROJ_RADIUS = { bullet: 5, pellet: 4, word: 18, bomb: 11, ebullet: 5, orb: 11, acid: 9, bossorb: 14 };

export function weaponOf(p) {
  return p.slot === 1 && p.heavy ? p.heavy : 'pistol';
}

// Velocity impulse from firing (recoil / blade lunge). Applied identically by
// the server and by client-side prediction.
export function applyRecoil(p, wk) {
  const W = WEAPONS[wk];
  const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
  if (W.melee) {
    p.vx += ca * W.lunge * (p.onGround ? 0.7 : 1);
    if (!p.onGround && sa < 0.3) p.vy = Math.min(p.vy, -160);
    return;
  }
  if (W.recoil) {
    p.vx -= ca * W.recoil;
    if (!p.onGround || sa > 0.35) p.vy = Math.min(p.vy, 0) - sa * W.recoil * 0.9;
  }
}

// Where the gun arm pivots. Shared so client-predicted shots line up.
export function shoulderOf(p) {
  return { x: p.x + p.facing * 2, y: p.y - p.h + 22 };
}
