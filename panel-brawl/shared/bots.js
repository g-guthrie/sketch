// Bot players ("INK-BOTS"). They produce the same input commands a human
// would, so they exercise exactly the same movement/combat code paths.
// Navigation: BFS over the panel graph, then walk to the door / ladder.

import { DT, emptyCmd, PLAYER } from './constants.js';
import { raycast } from './physics.js';
import { findPanel, nearestPanel } from './comicgen.js';
import { WEAPONS, weaponOf, shoulderOf } from './weapons.js';

const PREF_DIST = { pistol: 380, shotgun: 170, smg: 320, launcher: 460, rail: 700, blade: 70 };
const MAX_RANGE = { pistol: 950, shotgun: 420, smg: 760, launcher: 950, rail: 1800, blade: 150 };

function graph(g) {
  if (g._botGraph && g._botGraph.v === g.levelVersion) return g._botGraph;
  const adj = new Map(g.level.panels.map((p) => [p.id, []]));
  for (const l of g.level.links) {
    adj.get(l.a).push({ to: l.b, link: l });
    adj.get(l.b).push({ to: l.a, link: l });
  }
  g._botGraph = { v: g.levelVersion, adj };
  return g._botGraph;
}

function gateOpen(g, link) {
  if (!link.gate) return true;
  const gate = g.level.gates.find((x) => x.link === link.id);
  return !gate || g.gatesOpen.has(gate.id);
}

function nextLink(g, from, to) {
  if (from === to) return null;
  const { adj } = graph(g);
  const prev = new Map([[from, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur === to) break;
    for (const e of adj.get(cur)) {
      if (prev.has(e.to) || !gateOpen(g, e.link)) continue;
      prev.set(e.to, { from: cur, link: e.link });
      q.push(e.to);
    }
  }
  if (!prev.has(to)) return null;
  let cur = to, step = prev.get(cur);
  while (step && step.from !== from) {
    cur = step.from;
    step = prev.get(cur);
  }
  return step ? step.link : null;
}

function panelOf(g, x, y) {
  return findPanel(g.level, x, y - 30, 4) || nearestPanel(g.level, x, y - 30);
}

function los(g, ax, ay, bx, by) {
  return !raycast(g.phys, ax, ay, bx, by);
}

export function botThink(g, p) {
  const rng = g.rng;
  const b = p.brain || (p.brain = {
    t: 0, targetId: null, targetKind: null, retarget: 0, stuckT: 0, lastX: p.x, aimErr: 0, aimErrT: 0,
    strafe: 1, strafeT: 0, dashT: 1 + rng.f() * 2, bombT: 3 + rng.f() * 4, unstickT: 0, unstickDir: 1,
    jumpHold: 0, skill: 0.6 + rng.f() * 0.4, burstT: 0, tauntT: 6,
  });
  const cmd = emptyCmd(0, p.aim);
  b.t += DT;
  b.retarget -= DT;
  b.strafeT -= DT;
  b.dashT -= DT;
  b.bombT -= DT;
  b.aimErrT -= DT;
  b.tauntT -= DT;

  const sh = shoulderOf(p);
  const wk = weaponOf(p);

  // ---- choose a target ----
  if (b.retarget <= 0) {
    b.retarget = 0.4 + rng.f() * 0.3;
    let best = null, bestScore = Infinity;
    const consider = (t, kind) => {
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      const visible = los(g, sh.x, sh.y, t.x, t.y - t.h * 0.6);
      const score = d + (visible ? 0 : 700) + (t.invuln > 0 ? 500 : 0) + (kind === 'e' ? 150 : 0);
      if (score < bestScore) { bestScore = score; best = { id: t.id, kind }; }
    };
    for (const o of g.players.values()) if (o !== p && o.alive && g.isHostile('p', p.id, o)) consider(o, 'p');
    for (const e of g.enemies.values()) if (e.st === 'active') consider(e, 'e');
    b.targetId = best ? best.id : null;
    b.targetKind = best ? best.kind : null;
  }
  const t = b.targetId == null ? null : b.targetKind === 'p' ? g.players.get(b.targetId) : g.enemies.get(b.targetId);
  const target = t && (t.kind === 'p' ? t.alive : t.st === 'active') ? t : null;

  const myP = panelOf(g, p.x, p.y);

  // ---- pickups worth grabbing ----
  let goal = null;
  let pickupGoal = null;
  for (const pk of g.pickups.values()) {
    if (!pk.active) continue;
    const want = (pk.k === 'weapon' && !p.heavy) || (pk.k === 'health' && p.hp < 90) || (pk.k === 'bomb' && p.bombs < 2);
    if (!want) continue;
    const d = Math.hypot(pk.x - p.x, pk.y - p.y);
    if (d > 650) continue;
    const pp = panelOf(g, pk.x, pk.y + 30);
    if (pp.id !== myP.id) continue;
    if (!pickupGoal || d < pickupGoal.d) pickupGoal = { x: pk.x, y: pk.y + 34, d };
  }

  let combat = false;
  if (target) {
    const tP = panelOf(g, target.x, target.y);
    const visible = los(g, sh.x, sh.y, target.x, target.y - target.h * 0.6);
    const dist = Math.hypot(target.x - p.x, target.y - p.y);
    if (tP.id === myP.id || (visible && dist < 700)) {
      combat = true;
      const pref = PREF_DIST[wk] || 350;
      const dx = target.x - p.x;
      if (b.strafeT <= 0) {
        b.strafeT = 0.5 + rng.f() * 1.2;
        b.strafe = rng.f() < 0.5 ? -1 : 1;
      }
      let gx;
      if (Math.abs(dx) > pref + 120) gx = target.x - Math.sign(dx) * pref;
      else if (Math.abs(dx) < pref - 120) gx = p.x - Math.sign(dx || 1) * 200;
      else gx = p.x + b.strafe * 160;
      goal = { x: gx, y: target.y };
    } else {
      const link = nextLink(g, myP.id, tP.id);
      goal = linkGoal(link, myP, p);
    }
  }
  if (pickupGoal && (!combat || pickupGoal.d < 260)) goal = { x: pickupGoal.x, y: pickupGoal.y };
  if (!goal) {
    // wander toward the middle of a random panel
    if (!b.wander || b.t > b.wanderUntil) {
      const P = g.level.panels[Math.floor(rng.f() * g.level.panels.length)];
      b.wander = P.id;
      b.wanderUntil = b.t + 8;
    }
    const P = g.level.panels[b.wander];
    if (P.id === myP.id) goal = { x: (P.x1 + P.x2) / 2 + Math.sin(b.t) * 200, y: P.y2 };
    else goal = linkGoal(nextLink(g, myP.id, P.id), myP, p);
  }

  // ---- steering ----
  if (goal) {
    const dx = goal.x - p.x;
    if (goal.climb) {
      if (Math.abs(dx) < 14 || p.climb) {
        cmd.mx = 0;
        if (goal.climb < 0) cmd.up = true; else cmd.down = true;
      } else cmd.mx = Math.sign(dx);
    } else if (Math.abs(dx) > 24) cmd.mx = Math.sign(dx);
    if (p.climb && !goal.climb) cmd.up = goal.y < p.y;

    if (!p.climb) {
      const above = goal.y < p.y - 90;
      const below = goal.y > p.y + 60;
      if (above && p.onGround && Math.abs(dx) < 220) { cmd.jumpP = true; b.jumpHold = 0.3; }
      else if (above && !p.onGround && p.vy > -80 && p.jumps > 0 && goal.y < p.y - 40) { cmd.jumpP = true; b.jumpHold = 0.25; }
      if (below && p.onGround && p.groundOneway && Math.abs(dx) < 140) { cmd.down = true; cmd.jumpP = true; }
    }
  }

  // stuck detection
  if (cmd.mx !== 0 && Math.abs(p.x - b.lastX) < 1.2 && !p.climb) b.stuckT += DT; else b.stuckT = Math.max(0, b.stuckT - DT * 2);
  b.lastX = p.x;
  if (b.stuckT > 0.25 && p.onGround) { cmd.jumpP = true; b.jumpHold = 0.35; }
  if (b.stuckT > 1.2) { b.unstickT = 0.7; b.unstickDir = -cmd.mx || 1; b.stuckT = 0; }
  if (b.unstickT > 0) { b.unstickT -= DT; cmd.mx = b.unstickDir; }

  if (b.jumpHold > 0) { b.jumpHold -= DT; cmd.jump = true; }

  // ---- aiming & attacking ----
  if (target) {
    const tx = target.x, ty = target.y - target.h * 0.55;
    const W = WEAPONS[wk];
    const spd = W.speed || 3000;
    const dist = Math.hypot(tx - sh.x, ty - sh.y);
    const lead = Math.min(0.5, dist / spd) * (0.5 + b.skill * 0.5);
    let ax = tx + (target.vx || 0) * lead, ay = ty + (target.vy || 0) * lead * 0.4;
    if (wk === 'launcher') ay += dist * dist * 0.00032; // gravity arc
    if (b.aimErrT <= 0) {
      b.aimErrT = 0.25 + rng.f() * 0.35;
      b.aimErr = (rng.f() - 0.5) * (0.28 - b.skill * 0.18);
    }
    const want = Math.atan2(ay - sh.y, ax - sh.x) + b.aimErr;
    let d = want - p.aim;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    cmd.aim = p.aim + d * Math.min(1, 12 * DT * (0.8 + b.skill));
    const visible = los(g, sh.x, sh.y, tx, ty);
    if (visible && dist < (MAX_RANGE[wk] || 900) && Math.abs(d) < 0.35) {
      if (wk === 'pistol' && p.mag === 0) cmd.reloadP = true;
      else cmd.fire = true;
      if (wk === 'smg') {
        b.burstT += DT;
        if (b.burstT > 0.8) { cmd.fire = false; if (b.burstT > 1.1) b.burstT = 0; }
      }
    }
    if (dist < 75 && wk !== 'blade' && rng.f() < 0.25) cmd.meleeP = true;
    if (p.heavy && p.slot === 0 && rng.f() < 0.05) cmd.swapP = true;
    if (visible && p.bombs > 0 && b.bombT <= 0 && dist < 520 && dist > 150) {
      cmd.bombP = true;
      cmd.aim = Math.atan2(ty - sh.y - dist * 0.35, tx - sh.x);
      b.bombT = 5 + rng.f() * 5;
    }
    if (p.super >= PLAYER.superMax && dist < 360 && visible) cmd.superP = true;
    if (combat && b.dashT <= 0 && p.onGround) {
      cmd.dashP = true;
      b.dashT = 2 + rng.f() * 3;
    }
  } else {
    const want = cmd.mx !== 0 ? (cmd.mx > 0 ? 0 : Math.PI) : p.aim;
    cmd.aim = want;
    if (wk === 'pistol' && p.mag < PLAYER.mag && p.rl <= 0) cmd.reloadP = true;
    if (p.heavy && p.slot === 0) cmd.swapP = true;
  }
  return cmd;
}

function linkGoal(link, myP, p) {
  if (!link) return null;
  if (link.kind === 'door') {
    if (link.a === myP.id) return { x: link.x2 + 70, y: link.y2 };
    return { x: link.x1 - 70, y: link.y2 };
  }
  const cx = (link.x1 + link.x2) / 2;
  if (link.a === myP.id) return { x: cx, y: link.y2 + 200, climb: 1 }; // go down
  return { x: cx, y: link.y1 - 20, climb: -1 }; // go up
}
