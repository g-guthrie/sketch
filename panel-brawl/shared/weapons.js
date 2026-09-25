// Weapon definitions. Players always carry the PEACEMAKER (sidearm) plus one
// heavy slot filled from pickups. Heavy weapons carry only a handful of shots:
// they solve a situation, they don't replace the core kit. Punches, INK BOMBS
// and the SPLASH PAGE super are available to everyone.
//
// poise: how hard a hit breaks an enemy's guard (see Game.hurt).

export const WEAPONS = {
  pistol: {
    key: 'pistol', name: 'PEACEMAKER', rate: 0.17, mag: 12, reload: 0.85,
    dmg: 17, speed: 2100, spread: 0.015, pellets: 1, proj: 'bullet', knock: 150, poise: 7, crit: 2,
    life: 1.2, len: 30, twoHand: false, recoil: 0,
    words: ['BANG!', 'PEW!', 'BLAM!'], color: '#ffe14a', shake: 0.08,
  },
  shotgun: {
    key: 'shotgun', name: 'KA-BLAMMER', rate: 0.75, ammo: 6,
    dmg: 11, speed: 1750, speedVar: 0.3, spread: 0.19, pellets: 8, proj: 'pellet', knock: 170, poise: 9, crit: 1.25,
    life: 0.3, len: 44, twoHand: true, recoil: 380,
    words: ['KA-BLAM!', 'BLAMM!', 'KRA-KOOM!'], color: '#ff9a1f', shake: 0.35,
  },
  smg: {
    key: 'smg', name: 'RAT-A-TAT', rate: 0.075, ammo: 45,
    dmg: 8, speed: 2250, spread: 0.08, pellets: 1, proj: 'bullet', knock: 60, poise: 4, crit: 1.5, suppress: 1,
    life: 0.9, len: 42, twoHand: true, recoil: 0,
    words: ['RAT-TAT!', 'TAT-TAT-TAT!', 'BRRRAP!'], color: '#ffe14a', shake: 0.1,
  },
  launcher: {
    key: 'launcher', name: 'ONOMATO-CANNON', rate: 1.1, ammo: 3,
    dmg: 70, radius: 125, speed: 760, grav: 520, spread: 0, pellets: 1, proj: 'word', knock: 820, poise: 80,
    life: 3, len: 50, twoHand: true, recoil: 220,
    words: ['THOOMP!', 'FWOOMP!'], boomWords: ['KA-BOOOM!', 'KRAKOOOM!', 'BADABOOM!', 'KA-BLOOEY!'],
    ammoWords: ['BOOM', 'POW', 'WHAM', 'BLAM', 'KRAK', 'ZAP'], color: '#ff4d2b', shake: 0.3,
  },
  rail: {
    key: 'rail', name: 'INK RAILGUN', rate: 1.2, ammo: 4, charge: 0.32,
    dmg: 60, hitscan: true, range: 2800, knock: 650, pierceFalloff: 0.8, poise: 60, crit: 1.5, breaksShields: true,
    len: 56, twoHand: true, recoil: 280,
    words: ['ZZAKK!', 'SHRAKOOM!', 'VWSSSH!'], color: '#23d5e8', shake: 0.4,
  },
  blade: {
    key: 'blade', name: 'PANEL CUTTER', rate: 0.42, ammo: -1, melee: true,
    dmg: 36, range: 132, arc: 1.1, knock: 560, lunge: 360, poise: 30,
    len: 60, twoHand: false,
    words: ['SHING!', 'SLASH!', 'SHNNK!', 'SWISH!'], color: '#ff3fa4', shake: 0.15,
  },
};

export const HEAVY_KEYS = ['shotgun', 'smg', 'launcher', 'rail', 'blade'];

// Punch string: JAB, CROSS, UPPERCUT (launches). Fists wreck shields and poise.
export const PUNCH = {
  rate: 0.26, reach: 50, radius: 46, comboWindow: 0.75,
  steps: [
    null,
    { dmg: 13, poise: 16, knock: 300, lift: 120, stun: 0.16, shield: 30 },
    { dmg: 17, poise: 22, knock: 460, lift: 160, stun: 0.2, shield: 40 },
    { dmg: 26, poise: 48, knock: 380, lift: 820, stun: 0.3, shield: 70 },
  ],
  words: ['POW!', 'WHAM!', 'BIFF!', 'SOCK!', 'BOP!'], comboWords: ['KA-POW!!', 'WHAMMO!!', 'KER-SMASH!!'],
};

export const BOMB = {
  speed: 820, grav: 1700, fuse: 1.4, radius: 160, dmg: 60, knock: 900, bounce: 0.45, poise: 70,
  words: ['KA-BOOM!', 'BOOOM!', 'KRA-KA-BOOM!'],
};

// The super charges from STYLE, not spam: plain damage barely moves it.
export const SUPER = {
  windup: 0.6, radius: 400, dmg: 90, knock: 1150, chargePerDmg: 1 / 14,
  style: { headshot: 2.5, stagger: 8, splat: 10, takedown: 12, deflect: 6, kill: 3, meleeKill: 5, launch: 3 },
};

export const EXPLOSION_SELF = 0.35;

// Enemy projectiles
export const ENEMY_SHOTS = {
  ebullet: { speed: 900, dmg: 8, life: 1.6, r: 5, knock: 120 },
  orb: { speed: 430, dmg: 11, life: 3.2, r: 11, knock: 220, slow: true },
  acid: { speed: 720, dmg: 10, life: 2.4, r: 9, grav: 1100, knock: 160, slow: true },
  bossorb: { speed: 360, dmg: 14, life: 4, r: 14, knock: 320, slow: true },
  egren: { speed: 0, dmg: 26, life: 3, r: 10, grav: 1500, knock: 700, fuse: 1.6, bounce: 0.35, radius: 125, slow: true },
};

export const PROJ_RADIUS = { bullet: 5, pellet: 4, word: 18, bomb: 11, ebullet: 5, orb: 11, acid: 9, bossorb: 14, egren: 10 };

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

// Perk-adjusted numbers shared by server + prediction.
export function reloadTime(p) {
  return WEAPONS.pistol.reload * (p.perks && p.perks.decoder ? 0.5 : 1);
}
export function bombMax(p, PLAYER) {
  return PLAYER.bombs + (p.perks && p.perks.ink ? 1 : 0);
}
export function bombRecharge(p, PLAYER) {
  return PLAYER.bombRecharge * (p.perks && p.perks.ink ? 0.6 : 1);
}
