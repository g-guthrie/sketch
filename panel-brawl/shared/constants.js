// Shared tuning constants. Everything here is used by BOTH the authoritative
// server simulation and the client-side prediction, so keep it deterministic.

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const SNAP_EVERY = 2; // snapshots at 30 Hz

export const PHYS = {
  gravity: 2300,
  maxFall: 1350,
  runSpeed: 390,
  crouchSpeed: 170,
  groundAccel: 3600,
  groundFriction: 3000,
  airAccel: 2300,
  airFriction: 600,
  jumpV: 900,          // ~176 units of height
  doubleJumpV: 780,    // +132 units
  jumpCut: 0.45,
  coyote: 0.1,
  jumpBuffer: 0.12,
  stepHeight: 26,
  climbSpeed: 360,
  dashSpeed: 1000,
  dashTime: 0.17,
  dashCooldown: 0.8,
  dashIframes: 0.14,
};

export const BODY = { w: 36, h: 92, crouchH: 56 };

export const PLAYER = {
  hp: 150,
  respawnBrawl: 3,
  respawnStory: 6,
  spawnInvuln: 2,
  bombs: 2,
  bombMax: 3,
  bombRecharge: 10,
  superMax: 100,
  mag: 12,
};

export const LAYOUT = {
  pageW: 1600,
  pageH: 2200,
  marginTop: 110,
  marginBottom: 130,
  marginOuter: 90,
  marginInner: 70,
  gutterX: 36,
  gutterY: 44,
  border: 12,
  doorH: 160,
  holeW: 120,
};

export const MODES = { STORY: 'story', BRAWL: 'brawl' };

export const BRAWL = { killsToWin: 15, matchTime: 300, overTime: 10 };

// Bit flags packed into snapshots.
export const F = {
  GROUND: 1,
  CROUCH: 2,
  CLIMB: 4,
  DASH: 8,
  DEAD: 16,
  INVULN: 32,
  STUN: 64,
  RELOAD: 128,
  SUPER: 256,
  MELEE: 512,
  BOT: 1024,
};

// Input edge flags that must never be dropped when commands are merged.
export const EDGE_KEYS = ['jumpP', 'dashP', 'meleeP', 'bombP', 'swapP', 'interactP', 'superP', 'reloadP', 'tauntP'];

export function emptyCmd(seq = 0, aim = 0) {
  return {
    seq, mx: 0, up: false, down: false, jump: false, fire: false, aim,
    jumpP: false, dashP: false, meleeP: false, bombP: false, swapP: false,
    interactP: false, superP: false, reloadP: false, tauntP: false,
  };
}
