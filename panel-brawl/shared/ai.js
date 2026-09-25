// Enemy behaviour. Enemies live inside their panel (they never leave it),
// which keeps navigation simple and makes every panel its own little arena.
//
// Enemies are a CAST, not targets: every role has a job, a tell and a counter
// (see DESIGN.md). A per-panel SQUAD coordinates them: attack tokens limit how
// many brawlers commit at once, gunners claim cover, and everyone announces
// what they're doing in speech bubbles, so the dialogue is the telegraph.

import { PHYS } from './constants.js';
import { moveBody, groundProbe, raycast, ONEWAY, SOLID } from './physics.js';

export const ENEMY_STATS = {
  grunt: { hp: 55, poise: 30, w: 36, h: 90, speed: 215, jumpV: 820, knockMul: 1, score: 10 },
  gunner: { hp: 45, poise: 22, w: 36, h: 90, speed: 180, jumpV: 780, knockMul: 1, score: 15 },
  shield: { hp: 70, poise: 45, w: 40, h: 90, speed: 150, jumpV: 700, knockMul: 0.7, score: 20, shield: 110 },
  grenadier: { hp: 45, poise: 24, w: 36, h: 90, speed: 170, jumpV: 780, knockMul: 1, score: 20 },
  flyer: { hp: 34, poise: 18, w: 46, h: 42, speed: 270, jumpV: 0, knockMul: 1.2, score: 15, flying: true },
  artist: { hp: 40, poise: 18, w: 34, h: 88, speed: 235, jumpV: 860, knockMul: 1.1, score: 30 },
  brute: { hp: 300, poise: 150, w: 62, h: 132, speed: 125, jumpV: 700, knockMul: 0.3, score: 60 },
  boss: { hp: 1300, poise: 320, w: 92, h: 184, speed: 150, jumpV: 900, knockMul: 0.08, score: 500 },
};

// Enemy action states. Sent to clients so the renderer can pose characters.
export const ACT = {
  idle: 0, walk: 1, windup: 2, attack: 3, charge: 4, stunned: 5, aim: 6, fire: 7, recover: 8,
  stagger: 9, slam: 10, spray: 11, summon: 12, leap: 13, dive: 14,
  cover: 15,     // crouched behind cover
  peek: 16,      // rising from cover to shoot
  reload: 17,    // reloading (vulnerable)
  throw: 18,     // grenade wind-up / throw
  shield: 19,    // advancing with shield raised
  bash: 20,      // shield bash lunge
  dodge: 21,     // sidestep / roll away from danger
  callout: 22,   // pointing + shouting an order
  draw: 23,      // the Artist drawing (redrawing a KO'd enemy)
  flee: 24,      // running away
  patrol: 25,    // silent panel: unaware, walking a beat
  alert: 26,     // "!" moment of surprise
  knockdown: 27, // on the ground after being launched
  getup: 28,     // climbing back to its feet
  downed: 29,    // zombie lying down before it rises again
  tied: 30,      // rescue civilian, tied up
};

const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : v > t ? Math.max(v - d, t) : v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const SIGHT = { range: 470, cone: 0.5 };

function setAct(e, act, t) {
  e.act = act;
  e.actT = t;
}

// ------------------------------------------------------------------- squad

export function squadOf(g, panel) {
  let s = g.squads.get(panel);
  if (!s) {
    s = { tokens: new Map(), calloutT: 0, said: new Map(), cover: new Map(), corpses: [], diver: null, coverSpots: null };
    g.squads.set(panel, s);
  }
  return s;
}

function playersInPanel(g, P) {
  let n = 0;
  for (const p of g.players.values()) {
    if (p.alive && !p.downed && p.x > P.x1 - 30 && p.x < P.x2 + 30 && p.y > P.y1 - 20 && p.y < P.y2 + 30) n++;
  }
  return n;
}

function wantToken(g, e, sq, P) {
  const now = g.tick;
  for (const [id, until] of sq.tokens) {
    const o = g.enemies.get(id);
    if (!o || o.st !== 'active' || until < now || o.staggerT > 0) sq.tokens.delete(id);
  }
  if (sq.tokens.has(e.id)) return true;
  const max = Math.min(3, 1 + Math.max(1, playersInPanel(g, P)));
  if (sq.tokens.size >= max) return false;
  sq.tokens.set(e.id, now + 60 * 4);
  return true;
}

function dropToken(g, e) {
  const sq = g.squads.get(e.panel);
  if (sq) sq.tokens.delete(e.id);
}

// Rate-limited speech bubbles: the squad's intent, out loud.
export function callout(g, e, key, force) {
  const sq = squadOf(g, e.panel);
  if (!force && sq.calloutT > g.tick) return false;
  const last = sq.said.has(key) ? sq.said.get(key) : -1e9;
  if (!force && g.tick - last < 60 * 4.5) return false;
  const lines = g.theme.callouts && g.theme.callouts[key];
  if (!lines || !lines.length) return false;
  sq.calloutT = g.tick + 60 * 1.7;
  sq.said.set(key, g.tick);
  g.emit({ t: 'say', id: e.id, k: key, text: lines[Math.floor(g.rng.f() * lines.length)] });
  return true;
}

// ----------------------------------------------------------------- helpers

function pickTarget(g, e, P) {
  let best = null, bd = Infinity;
  for (const p of g.players.values()) {
    if (!p.alive || p.downed) continue;
    const inside = p.x > P.x1 - 30 && p.x < P.x2 + 30 && p.y > P.y1 - 20 && p.y < P.y2 + 30;
    if (!inside) continue;
    const d = Math.hypot(p.x - e.x, p.y - e.y) + (p.invuln > 0 ? 300 : 0);
    if (d < bd) { bd = d; best = p; }
  }
  if (e.job === 'civ') {
    for (const c of g.civs.values()) {
      if (c.panel !== e.panel || c.st !== 'tied') continue;
      if (!best || Math.hypot(best.x - e.x, best.y - e.y) > 170) return c;
    }
  }
  return best;
}

function hasLOS(g, e, t) {
  return !raycast(g.phys, e.x, e.y - e.h * 0.75, t.x, t.y - t.h * 0.6);
}

export function moveGround(g, e, P, targetVx, dt, jump) {
  const flung = e.flungT > 0;
  const accel = flung ? (e.onGround ? 900 : 500) : e.onGround ? 2600 : 1300;
  e.vx = approach(e.vx, targetVx, accel * dt);
  if (jump && e.onGround) {
    e.vy = -e.jumpV;
    e.onGround = false;
    e.jumpCd = 0.6;
  }
  e.vy = Math.min(e.vy + PHYS.gravity * g.phys.gravAt(e.x, e.y) * dt, PHYS.maxFall);
  const wasGround = e.onGround;
  const preVx = e.vx;
  const res = moveBody(g.phys, e, e.vx * dt, e.vy * dt, { step: wasGround, drop: e.dropT > 0 });
  e.blocked = res.hitX;
  if (res.hitX) e.vx = 0;
  if (res.ceil && e.vy < 0) e.vy = 0;
  if (res.ground) {
    e.onGround = true;
    e.vy = 0;
    e.groundOneway = !!(res.groundRect && res.groundRect.t === ONEWAY);
  } else if (wasGround && e.vy >= 0) {
    const gp = groundProbe(g.phys, e, PHYS.stepHeight + 2, e.dropT > 0);
    if (gp) { e.y = gp.y; e.vy = 0; e.onGround = true; e.groundOneway = gp.rect.t === ONEWAY; } else e.onGround = false;
  } else e.onGround = false;
  const hw = e.w / 2;
  let edge = false;
  if (e.x < P.x1 + hw) { e.x = P.x1 + hw; e.vx = Math.max(0, e.vx); e.blocked = targetVx < 0; edge = preVx < 0; }
  if (e.x > P.x2 - hw) { e.x = P.x2 - hw; e.vx = Math.min(0, e.vx); e.blocked = targetVx > 0; edge = preVx > 0; }
  if (e.y > P.y2) e.y = P.y2;
  if ((res.hitX || edge) && flung && Math.abs(preVx) > 400) g.wallSplat(e, preVx);
}

function moveFly(g, e, P, tx, ty, speed, dt) {
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const want = Math.min(speed, d * 3);
  const acc = e.flungT > 0 ? 500 : 1100;
  e.vx = approach(e.vx, (dx / d) * want, acc * dt);
  e.vy = approach(e.vy, (dy / d) * want, acc * dt);
  const preVx = e.vx;
  const res = moveBody(g.phys, e, e.vx * dt, e.vy * dt, { noOneway: true });
  if (res.hitX) e.vx *= -0.4;
  if (res.ground || res.ceil) e.vy *= -0.4;
  const hw = e.w / 2;
  const ox = e.x;
  e.x = clamp(e.x, P.x1 + hw, P.x2 - hw);
  e.y = clamp(e.y, P.y1 + e.h + 10, P.y2 - 20);
  if ((res.hitX || ox !== e.x) && e.flungT > 0 && Math.abs(preVx) > 400) g.wallSplat(e, preVx);
}

// Physics while launched / staggered / stunned.
function tumble(g, e, P, dt) {
  if (e.flying) { moveFly(g, e, P, e.x + e.vx * 0.2, e.y + 40, 60, dt); e.onGround = false; return; }
  moveGround(g, e, P, 0, dt, false);
}

function faceTo(e, t) {
  if (!t) return;
  e.facing = t.x >= e.x ? 1 : -1;
  e.aim = Math.atan2(t.y - t.h * 0.55 - (e.y - e.h * 0.72), t.x - e.x);
}

// Aim that tracks the target with a lag, so a laser sight can be dodged.
function trackAim(e, t, dt, rate) {
  const want = Math.atan2(t.y - t.h * 0.55 - (e.y - e.h * 0.72), t.x - e.x);
  let d = want - e.aim;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  e.aim += d * Math.min(1, rate * dt);
  e.facing = Math.cos(e.aim) >= 0 ? 1 : -1;
}

function meleeSweep(g, e, reach, height, dmg, knock, lift, stun, weapon) {
  const x1 = e.facing > 0 ? e.x : e.x - e.w / 2 - reach;
  const x2 = e.facing > 0 ? e.x + e.w / 2 + reach : e.x;
  const y1 = e.y - e.h * height, y2 = e.y;
  let hit = false;
  for (const p of g.players.values()) {
    if (!p.alive || p.downed) continue;
    if (p.x + p.w / 2 < x1 || p.x - p.w / 2 > x2 || p.y < y1 || p.y - p.h > y2) continue;
    if (g.hurt(p, dmg * e.dmgMul, { by: e.id, byKind: 'e', w: weapon, x: p.x - e.facing * 8, y: p.y - p.h * 0.6, kx: e.facing * knock, ky: -lift, stun, melee: true })) hit = true;
  }
  for (const c of g.civs.values()) {
    if (c.st !== 'tied' || c.panel !== e.panel) continue;
    if (c.x + 18 < x1 || c.x - 18 > x2 || Math.abs(c.y - e.y) > 80) continue;
    g.hurtCiv(c, dmg, e);
    hit = true;
  }
  return hit;
}

function nearestPlayer(g, e) {
  let bd = Infinity, best = null;
  for (const p of g.players.values()) {
    if (!p.alive || p.downed) continue;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d < bd) { bd = d; best = p; }
  }
  return { d: bd, p: best };
}

// Drop through a one-way platform when the target is below.
function maybeDrop(e, t) {
  if (e.onGround && e.groundOneway && t && t.y > e.y + 60 && Math.abs(t.x - e.x) < 260 && e.dropT <= 0) {
    e.dropT = 0.25;
    e.y += 2;
    e.onGround = false;
  }
}

function chaseJump(e, t) {
  if (!t || e.jumpCd > 0 || !e.onGround) return false;
  const dx = t.x - e.x, dy = t.y - e.y;
  return e.blocked || (dy < -110 && Math.abs(dx) < 260);
}

// ------------------------------------------------------------- cover spots

// Cover = a spot on the ground right beside something chest-high.
function coverSpots(g, P, sq) {
  if (sq.coverSpots && sq.coverVer === g.coverVer) return sq.coverSpots;
  const out = [];
  const tmp = [];
  g.phys.query(P.x1, P.y1, P.x2, P.y2, tmp);
  for (const r of tmp) {
    if (r.t !== SOLID) continue;
    if (!(r.k === 'block' || r.prop)) continue;
    // chest-high only: low enough to shoot over standing, tall enough to hide a crouch
    if (r.h < 46 || r.h > 64 || r.w > 260) continue;
    const y = r.y + r.h;
    for (const side of [-1, 1]) {
      const x = side < 0 ? r.x - 22 : r.x + r.w + 22;
      if (x < P.x1 + 24 || x > P.x2 - 24) continue;
      if (g.phys.solidIn(x - 16, y - 58, x + 16, y - 1)) continue;
      const gp = groundProbe(g.phys, { x, y: y - 4, w: 28 }, 12, false);
      if (!gp || Math.abs(gp.y - y) > 6) continue;
      out.push({ x, y, dir: -side, top: r.y, key: Math.round(x) + ':' + Math.round(y) });
    }
  }
  sq.coverSpots = out;
  sq.coverVer = g.coverVer;
  return out;
}

function findCover(g, e, P, t, sq) {
  let best = null, bs = Infinity;
  for (const c of coverSpots(g, P, sq)) {
    const owner = sq.cover.get(c.key);
    if (owner != null && owner !== e.id && g.enemies.has(owner)) continue;
    const tdx = t.x - c.x;
    if (Math.sign(tdx) !== c.dir) continue;
    const ad = Math.abs(tdx);
    if (ad < 200 || ad > 900) continue;
    if (t.y < c.top - 40 && ad < 520) continue; // they'd see over it
    const blocked = raycast(g.phys, t.x, t.y - 70, c.x, c.y - 40);
    if (!blocked) continue;
    const score = Math.abs(c.x - e.x) + Math.abs(c.y - e.y) * 2 + Math.abs(ad - 480) * 0.5;
    if (score < bs) { bs = score; best = c; }
  }
  return best;
}

export function releaseCover(g, e) {
  const sq = g.squads.get(e.panel);
  if (sq && e.coverKey && sq.cover.get(e.coverKey) === e.id) sq.cover.delete(e.coverKey);
  e.coverKey = null;
  e.cover = null;
  e.h = e.baseH;
}

// --------------------------------------------------------------- dodging

function maybeDodge(g, e, P) {
  if ((g.tick + e.id) % 6 !== 0 || e.dodgeCd > 0 || !e.onGround) return false;
  const chance = { grunt: 0.45, gunner: 0.75, grenadier: 0.7, artist: 0.85, shield: 0.25 }[e.k];
  if (!chance) return false;
  const ecx = e.x, ecy = e.y - e.h / 2;
  for (const pr of g.projectiles.values()) {
    if (pr.ok !== 'p' || (pr.k !== 'bomb' && pr.k !== 'word')) continue;
    const dx = ecx - pr.x, dy = ecy - pr.y;
    const d = Math.hypot(dx, dy);
    if (d > 300) continue;
    let danger = false;
    if (pr.k === 'bomb') danger = pr.fuse < 1.1 && d < 190;
    else {
      const sp = Math.hypot(pr.vx, pr.vy) || 1;
      const along = (dx * pr.vx + dy * pr.vy) / sp;
      if (along > 0) danger = Math.abs(dx * pr.vy - dy * pr.vx) / sp < 110;
    }
    if (!danger) continue;
    e.dodgeCd = 2.4;
    if (g.rng.f() > chance) return false;
    let dir = Math.sign(dx) || -e.facing;
    if ((dir < 0 && e.x < P.x1 + 90) || (dir > 0 && e.x > P.x2 - 90)) dir = -dir;
    releaseCover(g, e);
    setAct(e, ACT.dodge, 0.42);
    e.vx = dir * 560;
    e.vy = -380;
    e.onGround = false;
    g.emit({ t: 'edodge', id: e.id, dir });
    if (g.rng.f() < 0.5) callout(g, e, 'cover');
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------

export function updateEnemy(g, e, dt) {
  const P = g.level.panels[e.panel];
  e.t += dt;
  if (e.cd > 0) e.cd -= dt;
  if (e.jumpCd > 0) e.jumpCd -= dt;
  if (e.hurtT > 0) e.hurtT -= dt;
  if (e.dropT > 0) e.dropT -= dt;

  if (e.st === 'waking') {
    e.wakeT -= dt;
    if (e.wakeT <= 0) g.activateEnemy(e);
    return;
  }
  if (e.st === 'drawing') {
    e.drawT -= dt;
    if (e.drop) moveGround(g, e, P, 0, dt, false);
    if (e.drawT <= 0) { e.st = 'active'; e.cd = 0.5 + g.rng.f() * 0.6; }
    return;
  }
  if (e.st !== 'active') return;

  // guard (poise) and energy shields regenerate when left alone
  e.poiseT += dt;
  if (e.poiseT > 1.6 && e.poise < e.maxPoise && e.staggerT <= 0) e.poise = Math.min(e.maxPoise, e.poise + e.maxPoise * 0.4 * dt);
  if (e.eshMax) {
    e.eshT += dt;
    if (e.eshT > 3 && e.esh < e.eshMax) e.esh = Math.min(e.eshMax, e.esh + 16 * dt);
  }
  if (e.shieldKind === 'energy' && e.shieldMax && !e.shieldUp) {
    e.shieldT += dt;
    if (e.shieldT > 6) { e.shieldUp = true; e.shieldHp = e.shieldMax * 0.6; g.emit({ t: 'shieldup', id: e.id }); }
  }
  if (e.supp > 0) e.supp = Math.max(0, e.supp - dt * 0.7);
  if (e.dodgeCd > 0) e.dodgeCd -= dt;
  if (e.flungT > 0) e.flungT -= dt;

  // ---- disabled states ----
  if (e.downedZ) {
    e.riseT -= dt;
    setAct(e, ACT.downed, e.riseT);
    moveGround(g, e, P, 0, dt, false);
    if (e.riseT <= 0) g.zombieRise(e);
    return;
  }
  if (e.staggerT > 0) {
    e.staggerT -= dt;
    if (e.launched) { e.airT += dt; if (e.onGround && e.vy >= 0 && e.airT > 0.1) e.launched = false; }
    setAct(e, e.launched ? ACT.knockdown : ACT.stagger, e.staggerT);
    tumble(g, e, P, dt);
    if (e.staggerT <= 0) { e.poise = e.maxPoise; e.launched = false; setAct(e, ACT.getup, 0.3); }
    return;
  }
  if (e.launched) {
    e.airT += dt;
    setAct(e, ACT.knockdown, 0);
    tumble(g, e, P, dt);
    if ((e.onGround && e.vy >= 0 && e.airT > 0.08) || e.flying) {
      e.launched = false;
      e.downT = e.flying ? 0.3 : 0.55;
    }
    return;
  }
  if (e.downT > 0) {
    e.downT -= dt;
    setAct(e, ACT.knockdown, e.downT);
    tumble(g, e, P, dt);
    if (e.downT <= 0) setAct(e, ACT.getup, 0.35);
    return;
  }
  if (e.act === ACT.getup) {
    e.actT -= dt;
    tumble(g, e, P, dt);
    if (e.actT <= 0) setAct(e, ACT.idle, 0);
    return;
  }
  if (e.stunT > 0) {
    e.stunT -= dt;
    setAct(e, ACT.stunned, e.stunT);
    tumble(g, e, P, dt);
    if (e.stunT <= 0) setAct(e, ACT.idle, 0);
    return;
  }
  if (e.act === ACT.dodge) {
    e.actT -= dt;
    moveGround(g, e, P, Math.sign(e.vx) * 300, dt, false);
    if (e.actT <= 0 && e.onGround) setAct(e, ACT.idle, 0);
    return;
  }

  if (!e.aware) return unaware(g, e, P, dt);
  if (e.act === ACT.alert) {
    e.actT -= dt;
    moveGround(g, e, P, 0, dt, false);
    if (e.actT <= 0) setAct(e, ACT.idle, 0);
    return;
  }
  if (maybeDodge(g, e, P)) return;

  const t = pickTarget(g, e, P);
  e.target = t ? t.id : null;
  switch (e.k) {
    case 'grunt': return brawler(g, e, P, t, dt);
    case 'gunner': return gunner(g, e, P, t, dt);
    case 'shield': return e.shieldUp ? shieldman(g, e, P, t, dt) : brawler(g, e, P, t, dt);
    case 'grenadier': return grenadier(g, e, P, t, dt);
    case 'flyer': return flyer(g, e, P, t, dt);
    case 'artist': return artist(g, e, P, t, dt);
    case 'brute': return brute(g, e, P, t, dt);
    case 'boss': return e.flying ? flyingBoss(g, e, P, t, dt) : boss(g, e, P, t, dt);
  }
}

// ------------------------------------------------- silent panels (stealth)

function unaware(g, e, P, dt) {
  // walk a beat around the post, pause, look around
  if (e.postX == null) { e.postX = e.x; e.patrolDir = e.facing || 1; e.pauseT = 0; }
  if (e.flying) { moveFly(g, e, P, e.postX + Math.sin(e.t * 0.7) * 120, e.y, 80, dt); }
  else if (e.pauseT > 0) {
    e.pauseT -= dt;
    setAct(e, ACT.idle, 0);
    moveGround(g, e, P, 0, dt, false);
    if (e.pauseT <= 0) { e.patrolDir = -e.patrolDir; e.facing = e.patrolDir; }
  } else {
    const span = e.k === 'gunner' ? 150 : 210;
    const out = (e.x - e.postX) * e.patrolDir > span;
    if (out || e.blocked || e.x <= P.x1 + e.w || e.x >= P.x2 - e.w) e.pauseT = 1.1 + g.rng.f() * 0.9;
    e.facing = e.patrolDir;
    moveGround(g, e, P, e.patrolDir * e.speed * 0.3, dt, false);
    setAct(e, ACT.patrol, 0);
  }
  e.aim = e.facing > 0 ? 0.15 : Math.PI - 0.15;

  // sight cone
  let seen = 0;
  for (const p of g.players.values()) {
    if (!p.alive || p.downed) continue;
    const dx = p.x - e.x, dy = (p.y - p.h * 0.6) - (e.y - e.h * 0.8);
    const d = Math.hypot(dx, dy);
    if (d > SIGHT.range) continue;
    if (Math.sign(dx) !== e.facing && Math.abs(dx) > 26) continue;
    if (Math.abs(Math.atan2(dy, Math.abs(dx))) > SIGHT.cone) continue;
    if (raycast(g.phys, e.x, e.y - e.h * 0.8, p.x, p.y - p.h * 0.6)) continue;
    const rate = (d < 190 ? 3.2 : 1.5) * (p.crouch ? 0.45 : 1);
    seen = Math.max(seen, rate);
  }
  if (seen > 0) e.susp = Math.min(1, e.susp + seen * dt);
  else e.susp = Math.max(0, e.susp - dt * 0.35);
  if (e.susp >= 1) g.alarm(e.panel, e);
}

// ------------------------------------------------------------- the brawler

function brawler(g, e, P, t, dt) {
  const sq = squadOf(g, e.panel);
  if (e.act === ACT.windup) {
    e.actT -= dt;
    moveGround(g, e, P, 0, dt, false);
    if (e.actT <= 0) {
      setAct(e, ACT.attack, 0.18);
      const hit = meleeSweep(g, e, 46, 0.9, e.k === 'shield' ? 12 : 14, 400, 190, 0.18, e.look && e.look.weapon === 'claws' ? 'claw' : 'swipe');
      g.emit({ t: 'eatk', id: e.id, k: 'swipe', hit });
      e.swings = (e.swings || 0) + 1;
    }
    return;
  }
  if (e.act === ACT.attack || e.act === ACT.recover || e.act === ACT.callout) {
    e.actT -= dt;
    moveGround(g, e, P, 0, dt, false);
    if (e.actT <= 0) {
      if (e.act === ACT.attack) setAct(e, ACT.recover, 0.42);
      else {
        setAct(e, ACT.idle, 0);
        if (e.swings >= 2) { dropToken(g, e); e.swings = 0; e.restT = 1.2 + g.rng.f(); }
      }
    }
    return;
  }
  if (e.act === ACT.leap) {
    e.actT -= dt;
    moveGround(g, e, P, e.leapVx, dt, false);
    if (e.onGround && e.actT < 0.5) setAct(e, ACT.idle, 0);
    return;
  }
  if (!t) return idleAbout(g, e, P, dt);
  faceTo(e, t);
  if (e.restT > 0) e.restT -= dt;

  // hurt enemies fall back toward the Artist, if there is one
  if (e.hp < e.maxHp * 0.3 && !e.retreated) {
    let art = null;
    for (const o of g.enemies.values()) if (o.k === 'artist' && o.panel === e.panel && o.st === 'active') art = o;
    if (art) {
      e.retreated = true;
      e.retreatT = 2.5;
      callout(g, e, 'retreat');
      dropToken(g, e);
    }
  }
  if (e.retreatT > 0) {
    e.retreatT -= dt;
    const away = Math.sign(e.x - t.x) || 1;
    e.facing = away;
    moveGround(g, e, P, away * e.speed * 0.9, dt, e.blocked && e.jumpCd <= 0 && e.onGround);
    setAct(e, ACT.flee, 0);
    return;
  }

  const dx = t.x - e.x, dy = t.y - e.y;
  const adx = Math.abs(dx);
  const reach = 64 + e.w / 2;
  const close = adx < reach && Math.abs(dy) < 80;
  const civ = t.kind === 'c';

  // whoever is right in your face gets hit back, token or not
  if (close && e.cd <= 0 && (civ || (e.restT || 0) <= 0 || e.hurtT > 0)) {
    const hasTok = civ || wantToken(g, e, sq, P);
    setAct(e, ACT.windup, hasTok ? 0.36 : 0.5);
    e.cd = 1.0 + g.rng.f() * 0.5;
    g.emit({ t: 'etel', id: e.id, k: 'swipe' });
    moveGround(g, e, P, 0, dt, false);
    return;
  }

  // pick a flank: brawlers spread to both sides of the target
  if (e.sideFor !== t.id) {
    let l = 0, r = 0;
    for (const o of g.enemies.values()) {
      if (o === e || o.panel !== e.panel || o.sideFor !== t.id) continue;
      if (o.side < 0) l++; else r++;
    }
    const natural = Math.sign(e.x - t.x) || 1;
    e.side = l === r ? natural : l < r ? -1 : 1;
    e.sideFor = t.id;
  }

  const engaged = civ || ((e.restT || 0) <= 0 && wantToken(g, e, sq, P));
  let goal;
  if (engaged) {
    goal = t.x + e.side * (reach - 14);
    // wrong side of the target? hop over it
    const onWrongSide = Math.sign(e.x - t.x) !== e.side && adx < 230 && adx > 40;
    if (onWrongSide && e.onGround && e.jumpCd <= 0 && Math.abs(dy) < 60 && !civ && g.rng.f() < 0.03) {
      callout(g, e, 'flank');
      setAct(e, ACT.leap, 0.9);
      e.vy = -e.jumpV * 1.02;
      e.onGround = false;
      e.jumpCd = 1.4;
      e.leapVx = Math.sign(dx) * Math.max(380, adx * 2.2);
      e.vx = e.leapVx;
      return;
    }
  } else {
    // circle at a distance and heckle
    const ring = 190 + (e.id % 3) * 40;
    goal = t.x + e.side * ring + Math.sin(e.t * 1.3 + e.id) * 50;
    if (e.cd <= 0 && g.rng.f() < 0.004 && adx > 150) {
      if (callout(g, e, 'taunt')) { setAct(e, ACT.callout, 0.8); e.cd = 1.2; moveGround(g, e, P, 0, dt, false); return; }
    }
  }
  goal = clamp(goal, P.x1 + e.w, P.x2 - e.w);
  const gdx = goal - e.x;
  maybeDrop(e, t);
  const sp = Math.abs(gdx) < 14 ? 0 : Math.sign(gdx) * e.speed * (engaged ? 1 : 0.7);
  moveGround(g, e, P, sp, dt, chaseJump(e, t) && (engaged || dy < -110));
  setAct(e, ACT.walk, 0);
}

function idleAbout(g, e, P, dt) {
  if (!e.patrolDir) e.patrolDir = e.facing || 1;
  if (e.blocked || e.x <= P.x1 + e.w || e.x >= P.x2 - e.w) e.patrolDir = e.x < (P.x1 + P.x2) / 2 ? 1 : -1;
  e.facing = e.patrolDir;
  e.aim = e.facing > 0 ? 0 : Math.PI;
  if (e.flying) { moveFly(g, e, P, e.x + e.patrolDir * 60, e.y + Math.sin(e.t * 2) * 20, 90, dt); return; }
  moveGround(g, e, P, e.patrolDir * e.speed * 0.3, dt, false);
  setAct(e, ACT.walk, 0);
}

// --------------------------------------------------------------- the gunner

function gunner(g, e, P, t, dt) {
  const sq = squadOf(g, e.panel);
  switch (e.act) {
    case ACT.aim: {
      e.actT -= dt;
      if (t && e.actT > 0.18) trackAim(e, t, dt, 5.5); // locks for the last beat
      moveGround(g, e, P, 0, dt, false);
      if (e.actT <= 0) { setAct(e, ACT.fire, 0.32); e.burst = 3; e.burstT = 0; }
      return;
    }
    case ACT.fire: {
      e.actT -= dt;
      e.burstT -= dt;
      moveGround(g, e, P, 0, dt, false);
      if (e.burst > 0 && e.burstT <= 0) {
        e.burst--;
        e.burstT = 0.1;
        const kind = e.look && e.look.bloat ? 'acid' : 'ebullet';
        const spread = (g.rng.f() - 0.5) * (e.supp > 1.2 ? 0.34 : 0.1);
        const ang = kind === 'acid' ? e.aim - 0.3 * (Math.sign(Math.cos(e.aim)) || 1) + spread : e.aim + spread;
        g.enemyShot(e, kind, ang);
      }
      if (e.actT <= 0) {
        e.mag--;
        if (e.mag <= 0) {
          setAct(e, ACT.reload, 1.5);
          e.h = e.baseH;
          callout(g, e, 'reload');
        } else if (e.cover) { setAct(e, ACT.cover, 0.9 + g.rng.f() * 0.8); e.h = e.baseH * 0.62; }
        else setAct(e, ACT.recover, 0.35);
      }
      return;
    }
    case ACT.reload: {
      e.actT -= dt;
      moveGround(g, e, P, 0, dt, false);
      if (e.actT <= 0) {
        e.mag = 3;
        if (e.cover) { setAct(e, ACT.cover, 0.4); e.h = e.baseH * 0.62; } else setAct(e, ACT.idle, 0);
      }
      return;
    }
    case ACT.recover: {
      e.actT -= dt;
      moveGround(g, e, P, 0, dt, false);
      if (e.actT <= 0) setAct(e, ACT.idle, 0);
      return;
    }
    case ACT.attack: {
      e.actT -= dt;
      moveGround(g, e, P, 0, dt, false);
      if (e.actT <= 0) setAct(e, ACT.recover, 0.3);
      return;
    }
  }
  if (!t) { if (e.cover) releaseCover(g, e); return idleAbout(g, e, P, dt); }
  const dx = t.x - e.x, dist = Math.abs(dx);

  // someone in your face: shove them off
  if (dist < 70 && Math.abs(t.y - e.y) < 80 && e.cd <= 0 && t.kind === 'p') {
    releaseCover(g, e);
    faceTo(e, t);
    setAct(e, ACT.attack, 0.2);
    meleeSweep(g, e, 36, 0.9, 9, 520, 160, 0.15, 'shove');
    g.emit({ t: 'eatk', id: e.id, k: 'shove' });
    e.cd = 0.9;
    return;
  }

  // in cover: wait, then peek
  if (e.act === ACT.cover && e.cover) {
    e.actT -= dt;
    faceTo(e, t);
    moveGround(g, e, P, 0, dt, false);
    const flanked = Math.sign(t.x - e.cover.x) !== e.cover.dir || Math.abs(t.x - e.cover.x) < 150;
    if (flanked) { releaseCover(g, e); callout(g, e, 'flank'); setAct(e, ACT.idle, 0); e.coverCd = 0.6; return; }
    if (e.actT <= 0) {
      if (e.supp > 1.4 && g.rng.f() < 0.7) { e.actT = 0.6; if (g.rng.f() < 0.2) callout(g, e, 'cover'); return; }
      e.h = e.baseH;
      if (!hasLOS(g, e, t)) { releaseCover(g, e); e.coverCd = 3; setAct(e, ACT.idle, 0); return; }
      setAct(e, ACT.aim, 0.62);
      g.emit({ t: 'etel', id: e.id, k: 'aim' });
    }
    return;
  }

  // look for cover
  e.coverCd = (e.coverCd || 0) - dt;
  if (!e.cover && e.coverCd <= 0) {
    e.coverCd = 1.5;
    const c = findCover(g, e, P, t, sq);
    if (c) { e.cover = c; e.coverKey = c.key; sq.cover.set(c.key, e.id); e.coverWalk = 0; }
  }
  if (e.cover) {
    const cdx = e.cover.x - e.x;
    e.coverWalk += dt;
    if (Math.abs(cdx) < 10 && Math.abs(e.cover.y - e.y) < 20) {
      e.x = e.cover.x;
      faceTo(e, t);
      setAct(e, ACT.cover, 0.3 + g.rng.f() * 0.5);
      e.h = e.baseH * 0.62;
      e.vx = 0;
      return;
    }
    if (e.coverWalk > 3.5 || Math.sign(t.x - e.cover.x) !== e.cover.dir) { releaseCover(g, e); e.coverCd = 2.5; }
    else {
      e.facing = Math.sign(cdx) || e.facing;
      e.aim = e.facing > 0 ? 0 : Math.PI;
      maybeDrop(e, e.cover);
      moveGround(g, e, P, Math.sign(cdx) * e.speed * 1.1, dt, chaseJump(e, { x: e.cover.x, y: e.cover.y }));
      setAct(e, ACT.walk, 0);
      return;
    }
  }

  // no cover: keep a range, strafe, shoot
  faceTo(e, t);
  let sp = 0;
  if (dist < 260) sp = -Math.sign(dx) * e.speed;
  else if (dist > 520) sp = Math.sign(dx) * e.speed;
  else sp = Math.sin(e.t * 1.7 + e.id) * e.speed * 0.4;
  moveGround(g, e, P, sp, dt, e.blocked && e.jumpCd <= 0 && e.onGround);
  setAct(e, ACT.walk, 0);
  if (e.cd <= 0 && hasLOS(g, e, t) && dist < 950) {
    setAct(e, ACT.aim, 0.62);
    e.cd = 1.8 + g.rng.f() * 0.8;
    g.emit({ t: 'etel', id: e.id, k: 'aim' });
  }
}

// ----------------------------------------------------------- the shieldman

function shieldman(g, e, P, t, dt) {
  if (e.act === ACT.windup) {
    e.actT -= dt;
    moveGround(g, e, P, 0, dt, false);
    if (e.actT <= 0) { setAct(e, ACT.bash, 0.32); e.hitIds = []; }
    return;
  }
  if (e.act === ACT.bash) {
    e.actT -= dt;
    moveGround(g, e, P, e.facing * 640, dt, false);
    for (const p of g.players.values()) {
      if (!p.alive || p.downed || e.hitIds.includes(p.id)) continue;
      if (Math.abs(p.x - e.x) < (p.w + e.w) / 2 + 14 && p.y > e.y - e.h && p.y - p.h < e.y) {
        if (g.hurt(p, 15 * e.dmgMul, { by: e.id, byKind: 'e', w: 'bash', x: p.x, y: p.y - p.h * 0.55, kx: e.facing * 760, ky: -300, stun: 0.35, melee: true })) e.hitIds.push(p.id);
      }
    }
    if (e.actT <= 0 || e.blocked) setAct(e, ACT.recover, 0.5);
    return;
  }
  if (e.act === ACT.recover) {
    e.actT -= dt;
    moveGround(g, e, P, 0, dt, false);
    if (e.actT <= 0) setAct(e, ACT.idle, 0);
    return;
  }
  if (!t) return idleAbout(g, e, P, dt);
  // big shield, slow to turn: get behind it!
  const want = t.x >= e.x ? 1 : -1;
  if (want !== e.facing) {
    e.turnT = (e.turnT || 0) + dt;
    if (e.turnT > 0.6) { e.facing = want; e.turnT = 0; }
  } else e.turnT = 0;
  e.aim = e.facing > 0 ? 0 : Math.PI;
  const dx = t.x - e.x, adx = Math.abs(dx);
  if (adx < 150 && Math.abs(t.y - e.y) < 70 && e.cd <= 0 && want === e.facing) {
    setAct(e, ACT.windup, 0.38);
    e.cd = 2.2;
    g.emit({ t: 'etel', id: e.id, k: 'bash' });
    if (g.rng.f() < 0.5) callout(g, e, 'shield');
    return;
  }
  maybeDrop(e, t);
  const goal = adx > 90 ? Math.sign(dx) * e.speed * (want === e.facing ? 0.75 : 0.3) : 0;
  moveGround(g, e, P, goal, dt, chaseJump(e, t));
  setAct(e, ACT.shield, 0);
}

// ---------------------------------------------------------- the grenadier

function grenadier(g, e, P, t, dt) {
  const sq = squadOf(g, e.panel);
  if (e.act === ACT.throw) {
    e.actT -= dt;
    if (t) faceTo(e, t);
    moveGround(g, e, P, 0, dt, false);
    if (e.actT <= 0) {
      if (t) g.lobGrenade(e, t);
      setAct(e, ACT.recover, 0.5);
    }
    return;
  }
  if (e.act === ACT.recover) {
    e.actT -= dt;
    moveGround(g, e, P, 0, dt, false);
    if (e.actT <= 0) setAct(e, ACT.idle, 0);
    return;
  }
  if (!t) { if (e.cover) releaseCover(g, e); return idleAbout(g, e, P, dt); }
  faceTo(e, t);
  const dx = t.x - e.x, dist = Math.abs(dx);
  if (e.cd <= 0 && dist < 900 && dist > 120) {
    releaseCover(g, e);
    setAct(e, ACT.throw, 0.7);
    e.cd = 3.4 + g.rng.f() * 1.4;
    g.emit({ t: 'etel', id: e.id, k: 'grenade' });
    callout(g, e, 'grenade', g.rng.f() < 0.6);
    return;
  }
  // hang back, behind cover if there is some
  e.coverCd = (e.coverCd || 0) - dt;
  if (!e.cover && e.coverCd <= 0) {
    e.coverCd = 2;
    const c = findCover(g, e, P, t, sq);
    if (c && Math.abs(c.x - t.x) > 320) { e.cover = c; e.coverKey = c.key; sq.cover.set(c.key, e.id); }
  }
  let goalX;
  if (e.cover) {
    goalX = e.cover.x;
    if (Math.sign(t.x - e.cover.x) !== e.cover.dir || Math.abs(t.x - e.cover.x) < 220) { releaseCover(g, e); e.coverCd = 2; goalX = e.x - Math.sign(dx) * 200; }
  } else if (dist < 380) goalX = e.x - Math.sign(dx || 1) * 200;
  else if (dist > 700) goalX = e.x + Math.sign(dx) * 150;
  else goalX = e.x + Math.sin(e.t + e.id) * 60;
  goalX = clamp(goalX, P.x1 + e.w, P.x2 - e.w);
  const gdx = goalX - e.x;
  const cornered = dist < 200 && (e.x < P.x1 + 80 || e.x > P.x2 - 80);
  if (cornered && e.dodgeCd <= 0 && e.onGround) {
    // roll past the target
    e.dodgeCd = 2.5;
    setAct(e, ACT.dodge, 0.5);
    e.vx = Math.sign(dx) * 620;
    e.vy = -520;
    e.onGround = false;
    return;
  }
  const inCover = e.cover && Math.abs(gdx) < 10;
  moveGround(g, e, P, inCover || Math.abs(gdx) < 14 ? 0 : Math.sign(gdx) * e.speed, dt, e.blocked && e.jumpCd <= 0 && e.onGround);
  setAct(e, inCover ? ACT.cover : ACT.walk, 0);
  e.h = inCover ? e.baseH * 0.62 : e.baseH;
}

// ------------------------------------------------------------- the flyer

function flyer(g, e, P, t, dt) {
  const sq = squadOf(g, e.panel);
  e.hover = (e.hover || 0) + dt;
  if (e.act === ACT.dive) {
    e.actT -= dt;
    moveFly(g, e, P, e.diveX, e.diveY, 640, dt);
    if (!e.diveHit) {
      for (const p of g.players.values()) {
        if (!p.alive || p.downed) continue;
        if (Math.abs(p.x - e.x) < (p.w + e.w) / 2 && p.y > e.y - e.h && p.y - p.h < e.y) {
          if (g.hurt(p, 14 * e.dmgMul, { by: e.id, byKind: 'e', w: 'dive', x: p.x, y: p.y - p.h * 0.6, kx: Math.sign(e.vx || 1) * 320, ky: -200, melee: true })) e.diveHit = true;
        }
      }
    }
    if (e.actT <= 0 || Math.hypot(e.diveX - e.x, e.diveY - e.y) < 20) {
      // a missed dive leaves it low and open
      setAct(e, ACT.recover, e.diveHit ? 0.4 : 0.9);
      if (sq.diver === e.id) sq.diver = null;
    }
    return;
  }
  if (e.act === ACT.windup) {
    e.actT -= dt;
    if (t) faceTo(e, t);
    moveFly(g, e, P, e.x, e.y - 20, 60, dt);
    if (e.actT <= 0) {
      if (e.nextIsDive && t) {
        setAct(e, ACT.dive, 0.75);
        e.diveHit = false;
      } else {
        setAct(e, ACT.fire, 0.25);
        g.enemyShot(e, 'orb', e.aim);
        if (sq.diver === e.id) sq.diver = null;
      }
    }
    return;
  }
  if (e.act === ACT.fire || e.act === ACT.recover) {
    e.actT -= dt;
    moveFly(g, e, P, e.x, e.act === ACT.recover ? e.y + 10 : e.y, 70, dt);
    if (e.actT <= 0) setAct(e, ACT.idle, 0);
    return;
  }
  if (!t) {
    moveFly(g, e, P, e.x + Math.sin(e.hover * 0.9 + e.id) * 120, e.y + Math.sin(e.hover * 2.1) * 30, 120, dt);
    setAct(e, ACT.walk, 0);
    return;
  }
  faceTo(e, t);
  if (!e.hoverSide || g.rng.f() < 0.003) e.hoverSide = g.rng.f() < 0.5 ? -1 : 1;
  const tx = t.x + e.hoverSide * 200 + Math.sin(e.hover * 0.8 + e.id) * 60;
  const ty = t.y - 240 + Math.sin(e.hover * 2.3 + e.id) * 40;
  moveFly(g, e, P, tx, ty, e.speed, dt);
  setAct(e, ACT.walk, 0);
  if (e.cd <= 0) {
    const canDive = sq.diver == null || !g.enemies.has(sq.diver);
    e.nextIsDive = canDive && g.rng.f() < 0.45;
    if (e.nextIsDive) {
      sq.diver = e.id;
      e.diveX = t.x;
      e.diveY = t.y - 12;
    }
    setAct(e, ACT.windup, e.nextIsDive ? 0.6 : 0.42);
    e.cd = 2.2 + g.rng.f() * 1.0;
    g.emit({ t: 'etel', id: e.id, k: e.nextIsDive ? 'dive' : 'orb', tx: e.nextIsDive ? Math.round(e.diveX) : undefined, ty: e.nextIsDive ? Math.round(e.diveY) : undefined });
  }
}

// ------------------------------------------------------------- the artist

function artist(g, e, P, t, dt) {
  const sq = squadOf(g, e.panel);
  const near = nearestPlayer(g, e);
  if (e.act === ACT.draw) {
    e.actT -= dt;
    moveGround(g, e, P, 0, dt, false);
    if (e.hurtT > 0 || near.d < 150) {
      // interrupted!
      setAct(e, ACT.flee, 0.6);
      g.emit({ t: 'drawfail', id: e.id });
      return;
    }
    if (e.actT <= 0) {
      const i = sq.corpses.indexOf(e.drawing);
      if (i >= 0) g.redraw(e, sq.corpses.splice(i, 1)[0]);
      e.redraws = (e.redraws || 0) + 1;
      e.cd = 3.5;
      setAct(e, ACT.idle, 0);
    }
    return;
  }
  if (near.p && near.d < 300) {
    // run for the far side, jump for ledges
    const away = Math.sign(e.x - near.p.x) || 1;
    const wall = (away < 0 && e.x < P.x1 + 70) || (away > 0 && e.x > P.x2 - 70);
    if (e.act !== ACT.flee && g.rng.f() < 0.5) callout(g, e, 'retreat');
    if (wall) {
      // cornered: panic, try to leap over
      if (e.onGround && e.jumpCd <= 0 && near.d < 180) {
        e.vy = -e.jumpV;
        e.onGround = false;
        e.jumpCd = 1.2;
        e.vx = -away * 480;
      }
      e.facing = -away;
      moveGround(g, e, P, e.onGround ? 0 : -away * e.speed, dt, false);
      setAct(e, ACT.flee, 0);
      return;
    }
    e.facing = away;
    moveGround(g, e, P, away * e.speed * 1.15, dt, (e.blocked || g.rng.f() < 0.01) && e.jumpCd <= 0 && e.onGround);
    setAct(e, ACT.flee, 0);
    return;
  }
  if (t) faceTo(e, t);
  // redraw a fallen friend
  if (e.cd <= 0 && sq.corpses.length && (e.redraws || 0) < 3) {
    const c = sq.corpses[sq.corpses.length - 1];
    e.drawing = c;
    e.facing = c.x >= e.x ? 1 : -1;
    e.aim = Math.atan2(c.y - 50 - (e.y - e.h * 0.7), c.x - e.x);
    setAct(e, ACT.draw, 2.1);
    g.emit({ t: 'etel', id: e.id, k: 'draw', tx: Math.round(c.x), ty: Math.round(c.y) });
    callout(g, e, 'redraw', true);
    return;
  }
  // skulk at the back, as far from the fight as the panel allows
  const fx = near.p ? (near.p.x < (P.x1 + P.x2) / 2 ? P.x2 - 80 : P.x1 + 80) : e.x;
  const gdx = fx - e.x;
  moveGround(g, e, P, Math.abs(gdx) < 20 ? 0 : Math.sign(gdx) * e.speed * 0.6, dt, e.blocked && e.jumpCd <= 0 && e.onGround);
  setAct(e, Math.abs(gdx) < 20 ? ACT.idle : ACT.walk, 0);
}

// ------------------------------------------------------------- the brute

function brute(g, e, P, t, dt) {
  if (e.act === ACT.windup) {
    e.actT -= dt;
    if (t) faceTo(e, t);
    moveGround(g, e, P, 0, dt, false);
    if (e.actT <= 0) {
      if (e.nextAttack === 'slam') {
        setAct(e, ACT.slam, 0.45);
        g.shockwave(e, 170, 22 * e.dmgMul, 520);
      } else {
        setAct(e, ACT.charge, 0.95);
        e.chargeDir = e.facing;
        e.hitIds = [];
      }
    }
    return;
  }
  if (e.act === ACT.charge) {
    e.actT -= dt;
    moveGround(g, e, P, e.chargeDir * 760, dt, false);
    for (const p of g.players.values()) {
      if (!p.alive || p.downed || e.hitIds.includes(p.id)) continue;
      if (Math.abs(p.x - e.x) < (p.w + e.w) / 2 + 6 && p.y > e.y - e.h && p.y - p.h < e.y) {
        if (g.hurt(p, 28 * e.dmgMul, { by: e.id, byKind: 'e', w: 'charge', x: p.x, y: p.y - p.h * 0.5, kx: e.chargeDir * 900, ky: -420, stun: 0.3, melee: true })) e.hitIds.push(p.id);
      }
    }
    if (e.blocked) {
      // ran into a wall: dazed and wide open
      g.emit({ t: 'bonk', id: e.id, x: e.x + e.chargeDir * e.w / 2, y: e.y - e.h * 0.6 });
      g.stagger(e, 1.9, null);
    } else if (e.actT <= 0) setAct(e, ACT.recover, 0.6);
    return;
  }
  if (e.act === ACT.slam || e.act === ACT.recover) {
    e.actT -= dt;
    moveGround(g, e, P, 0, dt, false);
    if (e.actT <= 0) setAct(e, ACT.idle, 0);
    return;
  }
  if (!t) return idleAbout(g, e, P, dt);
  faceTo(e, t);
  const dx = t.x - e.x, dy = t.y - e.y;
  maybeDrop(e, t);
  moveGround(g, e, P, Math.abs(dx) < 50 ? 0 : Math.sign(dx) * e.speed, dt, e.blocked && e.jumpCd <= 0 && e.onGround);
  setAct(e, ACT.walk, 0);
  if (e.cd <= 0) {
    if (Math.abs(dx) < 120 && Math.abs(dy) < 90) {
      e.nextAttack = 'slam';
      setAct(e, ACT.windup, 0.55);
      e.cd = 1.7;
      g.emit({ t: 'etel', id: e.id, k: 'slam' });
    } else if (Math.abs(dy) < 70 && Math.abs(dx) < 640) {
      e.nextAttack = 'charge';
      setAct(e, ACT.windup, 0.75);
      e.cd = 2.8;
      g.emit({ t: 'etel', id: e.id, k: 'charge' });
    }
  }
}

// -------------------------------------------------------------- the bosses

function boss(g, e, P, t, dt) {
  const enraged = e.hp < e.maxHp * 0.5;
  if (enraged && !e.enraged) {
    e.enraged = true;
    g.emit({ t: 'enrage', id: e.id });
  }
  const spd = enraged ? 1.3 : 1;
  switch (e.act) {
    case ACT.windup: {
      e.actT -= dt;
      if (t) faceTo(e, t);
      moveGround(g, e, P, 0, dt, false);
      if (e.actT <= 0) {
        const a = e.nextAttack;
        if (a === 'spray') { setAct(e, ACT.spray, 1.3); e.sprayN = enraged ? 4 : 3; e.sprayT = 0; }
        else if (a === 'charge') { setAct(e, ACT.charge, 1.1); e.chargeDir = e.facing; e.hitIds = []; }
        else if (a === 'summon') { setAct(e, ACT.summon, 0.8); g.summon(e, enraged ? 3 : 2); }
        else if (a === 'leap' && t) {
          setAct(e, ACT.leap, 1.2);
          e.vy = -1150;
          e.vx = clamp((t.x - e.x) * 1.15, -700, 700);
          e.onGround = false;
          e.leapT = 0.15;
        } else setAct(e, ACT.idle, 0);
      }
      return;
    }
    case ACT.spray: {
      e.actT -= dt;
      e.sprayT -= dt;
      moveGround(g, e, P, 0, dt, false);
      if (e.sprayN > 0 && e.sprayT <= 0) {
        e.sprayN--;
        e.sprayT = 0.34;
        const n = enraged ? 13 : 10;
        const off = g.rng.f() * Math.PI;
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * Math.PI * 2;
          if (Math.sin(a) > 0.55) continue; // not straight into the floor
          g.enemyShot(e, 'bossorb', a, e.h * 0.5);
        }
      }
      if (e.actT <= 0) setAct(e, ACT.recover, 0.7);
      return;
    }
    case ACT.charge: {
      e.actT -= dt;
      moveGround(g, e, P, e.chargeDir * 820 * spd, dt, false);
      for (const p of g.players.values()) {
        if (!p.alive || p.downed || e.hitIds.includes(p.id)) continue;
        if (Math.abs(p.x - e.x) < (p.w + e.w) / 2 + 6 && p.y > e.y - e.h && p.y - p.h < e.y) {
          if (g.hurt(p, 32 * e.dmgMul, { by: e.id, byKind: 'e', w: 'charge', x: p.x, y: p.y - p.h * 0.5, kx: e.chargeDir * 1000, ky: -500, stun: 0.35, melee: true })) e.hitIds.push(p.id);
        }
      }
      if (e.blocked) {
        g.emit({ t: 'bonk', id: e.id, x: e.x + e.chargeDir * e.w / 2, y: e.y - e.h * 0.6 });
        g.stagger(e, 1.6, null);
      } else if (e.actT <= 0) setAct(e, ACT.recover, 0.6);
      return;
    }
    case ACT.leap: {
      e.actT -= dt;
      e.leapT -= dt;
      const wasAir = !e.onGround;
      e.vy = Math.min(e.vy + PHYS.gravity * 0.9 * g.phys.gravAt(e.x, e.y) * dt, PHYS.maxFall);
      const res = moveBody(g.phys, e, e.vx * dt, e.vy * dt, {});
      if (res.hitX) e.vx = 0;
      if (res.ceil && e.vy < 0) e.vy = 0;
      e.x = clamp(e.x, P.x1 + e.w / 2, P.x2 - e.w / 2);
      if (res.ground) {
        e.onGround = true;
        e.vy = 0;
        e.vx = 0;
        if (wasAir && e.leapT <= 0) {
          g.shockwave(e, 260, 26 * e.dmgMul, 700);
          setAct(e, ACT.recover, 0.8);
        }
      } else e.onGround = false;
      if (e.actT <= 0 && e.onGround) setAct(e, ACT.recover, 0.5);
      return;
    }
    case ACT.summon:
    case ACT.recover:
    case ACT.slam: {
      e.actT -= dt;
      moveGround(g, e, P, 0, dt, false);
      if (e.actT <= 0) setAct(e, ACT.idle, 0);
      return;
    }
  }
  if (!t) return idleAbout(g, e, P, dt);
  faceTo(e, t);
  const dx = t.x - e.x;
  moveGround(g, e, P, Math.abs(dx) < 120 ? 0 : Math.sign(dx) * e.speed * spd, dt, false);
  setAct(e, ACT.walk, 0);
  if (e.cd <= 0) {
    const order = ['spray', 'charge', 'leap', 'spray', 'summon', 'charge', 'leap'];
    e.nextAttack = order[e.pattern++ % order.length];
    setAct(e, ACT.windup, enraged ? 0.55 : 0.8);
    e.cd = (enraged ? 1.7 : 2.4) + g.rng.f() * 0.6;
    g.emit({ t: 'etel', id: e.id, k: e.nextAttack });
  }
}

function flyingBoss(g, e, P, t, dt) {
  const enraged = e.hp < e.maxHp * 0.5;
  if (enraged && !e.enraged) {
    e.enraged = true;
    g.emit({ t: 'enrage', id: e.id });
  }
  e.hover = (e.hover || 0) + dt;
  const cxp = (P.x1 + P.x2) / 2;
  switch (e.act) {
    case ACT.windup:
      e.actT -= dt;
      moveFly(g, e, P, e.x, e.y, 40, dt);
      if (t) faceTo(e, t);
      if (e.actT <= 0) {
        const a = e.nextAttack;
        if (a === 'spray') { setAct(e, ACT.spray, 1.5); e.sprayN = enraged ? 5 : 4; e.sprayT = 0; }
        else if (a === 'summon') { setAct(e, ACT.summon, 0.8); g.summon(e, enraged ? 3 : 2); }
        else if (a === 'dive' && t) { setAct(e, ACT.dive, 1.0); e.diveX = t.x; e.diveY = t.y - 20; e.hitIds = []; }
        else setAct(e, ACT.idle, 0);
      }
      return;
    case ACT.spray:
      e.actT -= dt;
      e.sprayT -= dt;
      moveFly(g, e, P, e.x, e.y, 40, dt);
      if (e.sprayN > 0 && e.sprayT <= 0) {
        e.sprayN--;
        e.sprayT = 0.3;
        const n = enraged ? 14 : 11;
        const off = e.hover * 1.7;
        for (let i = 0; i < n; i++) g.enemyShot(e, 'bossorb', off + (i / n) * Math.PI * 2, e.h * 0.5);
      }
      if (e.actT <= 0) setAct(e, ACT.recover, 0.6);
      return;
    case ACT.dive:
      e.actT -= dt;
      moveFly(g, e, P, e.diveX, e.diveY, 700, dt);
      for (const p of g.players.values()) {
        if (!p.alive || p.downed || e.hitIds.includes(p.id)) continue;
        if (Math.abs(p.x - e.x) < (p.w + e.w) / 2 && p.y > e.y - e.h && p.y - p.h < e.y) {
          if (g.hurt(p, 28 * e.dmgMul, { by: e.id, byKind: 'e', w: 'dive', x: p.x, y: p.y - p.h * 0.5, kx: Math.sign(p.x - e.x || 1) * 800, ky: -500, stun: 0.3, melee: true })) e.hitIds.push(p.id);
        }
      }
      if (e.actT <= 0) setAct(e, ACT.recover, 0.9); // low and open after a dive
      return;
    case ACT.summon:
    case ACT.recover:
      e.actT -= dt;
      moveFly(g, e, P, e.x, e.act === ACT.recover ? e.y + 20 : e.y - 30, 90, dt);
      if (e.actT <= 0) setAct(e, ACT.idle, 0);
      return;
  }
  const tx = t ? t.x + Math.sin(e.hover * 0.6) * 260 : cxp + Math.sin(e.hover * 0.5) * 300;
  const ty = P.y1 + e.h + 70 + Math.sin(e.hover * 1.3) * 40;
  moveFly(g, e, P, tx, ty, e.speed, dt);
  if (t) faceTo(e, t);
  setAct(e, ACT.walk, 0);
  if (t && e.cd <= 0) {
    const order = ['spray', 'dive', 'spray', 'summon', 'dive'];
    e.nextAttack = order[e.pattern++ % order.length];
    setAct(e, ACT.windup, enraged ? 0.55 : 0.8);
    e.cd = (enraged ? 1.6 : 2.3) + g.rng.f() * 0.6;
    g.emit({ t: 'etel', id: e.id, k: e.nextAttack, tx: e.nextAttack === 'dive' ? Math.round(t.x) : undefined, ty: e.nextAttack === 'dive' ? Math.round(t.y - 20) : undefined });
  }
}
