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
  if (g.mode === 'story') for (const e of g.enemies.values()) if (e.st === 'active' && !e.aware && Math.hypot(e.x - p.x, e.y - p.y) < 900) {
    // sneak up on unaware guards from behind and punch
    const P = panelOf(g, e.x, e.y);
    if (P.id === myP0(g, p).id) { b.targetId = e.id; b.targetKind = 'e'; b.sneak = true; }
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
    if (target.kind === 'e' && !target.aware && tP.id === myP.id) {
      // stealth: creep up behind and punch
      goal = { x: target.x - target.facing * 30, y: target.y };
      b.sneaking = true;
    } else if (tP.id === myP.id || (visible && dist < 700)) {
      b.sneaking = false;
      combat = true;
      const pref = PREF_DIST[wk] || 350;
      const dx = target.x - p.x;
      if (b.strafeT <= 0) {
        b.strafeT = 0.5 + rng.f() * 1.2;
        b.strafe = rng.f() < 0.5 ? -1 : 1;
      }
      let gx;
      if (target.shieldUp && Math.sign(p.x - target.x) === target.facing) {
        // don't plink a riot shield: get in close, punch it or hop over it
        gx = target.x - target.facing * 20;
        if (Math.abs(dx) < 110 && p.onGround && rng.f() < 0.04) { cmd.jumpP = true; b.jumpHold = 0.35; }
      } else if (Math.abs(dx) > pref + 120) gx = target.x - Math.sign(dx) * pref;
      else if (Math.abs(dx) < pref - 120) gx = p.x - Math.sign(dx || 1) * 200;
      else gx = p.x + b.strafe * 160;
      goal = { x: gx, y: target.y };
    } else {
      const link = nextLink(g, myP.id, tP.id);
      goal = linkGoal(link, myP, p);
    }
  }
  if (pickupGoal && (!combat || pickupGoal.d < 260)) goal = { x: pickupGoal.x, y: pickupGoal.y };
  let objective = null;
  if (g.mode === 'story' && (!combat || !target)) {
    objective = storyObjective(g, p, myP, sh, b);
    // an objective we can't seem to reach gets shelved for a while
    if (objective && objective.key) {
      if (b.objKey !== objective.key) { b.objKey = objective.key; b.objT = 0; }
      b.objT += DT;
      if (b.objT > 9) { (b.skip ||= {})[objective.key] = b.t + 25; b.objKey = null; }
    }
    if (objective) {
      goal = objective.goal;
      if (objective.cmd) Object.assign(cmd, objective.cmd);
    }
  }
  if (!goal) {
    // wander toward the middle of a random panel
    if (b.wander == null || b.t > b.wanderUntil || b.wanderV !== g.levelVersion || !g.level.panels[b.wander]) {
      b.wanderV = g.levelVersion;
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
    if (p.climb && !goal.climb) {
      if (goal.y < p.y - 30) cmd.up = true;
      else if (goal.y > p.y + 30) cmd.down = true;
      else { cmd.jumpP = true; b.jumpHold = 0.2; }
    }
    // goal far below but we're parked on something solid: walk off the edge
    if (!p.climb && !goal.climb && goal.y > p.y + 80 && Math.abs(dx) <= 24 && p.onGround && !p.groundOneway) {
      if (!b.edgeDir) b.edgeDir = rng.f() < 0.5 ? -1 : 1;
      cmd.mx = b.edgeDir;
    } else b.edgeDir = 0;

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
  if (b.stuckT > 1.2) { b.unstickT = 0.5 + rng.f() * 0.6; b.unstickDir = -cmd.mx || 1; b.stuckT = 0; b.runJump = 0; }
  if (b.unstickT > 0) {
    b.unstickT -= DT;
    cmd.mx = b.unstickDir;
    if (b.unstickT <= 0) b.runJump = 0.15 + rng.f() * 0.35;
  } else if (b.runJump > 0) {
    // take a running jump at whatever stopped us
    b.runJump -= DT;
    if (b.runJump <= 0 && p.onGround) { cmd.jumpP = true; b.jumpHold = 0.4; }
  }

  if (b.jumpHold > 0) { b.jumpHold -= DT; cmd.jump = true; }

  // ---- aiming & attacking ----
  if (target && b.sneaking && !target.aware) {
    const dist = Math.hypot(target.x - p.x, target.y - p.y);
    cmd.aim = Math.atan2(target.y - target.h * 0.5 - sh.y, target.x - sh.x);
    if (dist < 330 && p.onGround && Math.abs(target.y - p.y) < 20 && !cmd.jumpP) cmd.down = true;
    if (dist < 64) cmd.meleeP = true;
  } else if (target) {
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
    if (target.shieldUp && Math.sign(p.x - target.x) === target.facing) { cmd.fire = false; if (dist < 80) cmd.meleeP = true; }
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
  } else if (objective && objective.aimAt) {
    const o = objective.aimAt;
    cmd.aim = Math.atan2(o.y - sh.y, o.x - sh.x);
    if (objective.fire) {
      if (WEAPONS[wk].melee) { if (p.slot === 1 && p.cd <= 0) cmd.swapP = true; }
      else cmd.fire = true;
    }
    if (objective.bomb && p.bombs > 0 && rng.f() < 0.2) cmd.bombP = true;
    if (objective.punch) cmd.meleeP = rng.f() < 0.3;
  } else {
    const want = cmd.mx !== 0 ? (cmd.mx > 0 ? 0 : Math.PI) : p.aim;
    cmd.aim = want;
    if (wk === 'pistol' && p.mag < PLAYER.mag && p.rl <= 0) cmd.reloadP = true;
    if (p.heavy && p.slot === 0) cmd.swapP = true;
  }
  return cmd;
}

function myP0(g, p) { return panelOf(g, p.x, p.y); }

// Story mode: what should a helpful bot be doing when nothing needs shooting?
export function storyObjective(g, p, myP, sh, b) {
  const skip = (k) => b.skip && b.skip[k] > b.t;
  // pick up a downed buddy
  for (const o of g.players.values()) {
    if (o === p || !o.downed) continue;
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d < 70) return { goal: null, cmd: { interactP: !p.revTarget } };
    if (panelOf(g, o.x, o.y).id === myP.id || d < 700) return { goal: { x: o.x, y: o.y } };
  }
  if (p.revTarget != null) return { goal: null };
  // untie hostages
  for (const c of g.civs.values()) {
    if (c.st !== 'tied' || c.panel !== myP.id || skip('civ' + c.id)) continue;
    if (Math.abs(c.x - p.x) < 50 && Math.abs(c.y - p.y) < 60) return { goal: null, cmd: { interactP: c.by !== p.id } };
    return { goal: { x: c.x, y: c.y }, key: 'civ' + c.id };
  }
  const lv = g.level;
  // stamps are always worth a detour inside the current panel
  for (const pk of g.pickups.values()) {
    if (pk.active && (pk.k === 'stamp' || (pk.k === 'key' && !p.hasKey)) && !skip('pk' + pk.id) && panelOf(g, pk.x, pk.y + 30).id === myP.id) return { goal: { x: pk.x, y: pk.y + 34 }, key: 'pk' + pk.id };
  }
  const frontierId = lv.path.find((id) => g.panelState[id] !== 'cleared');
  // locked exit out of the panel we're in?
  for (const gate of lv.gates) {
    if (gate.panel !== myP.id || g.gatesOpen.has(gate.id) || !gate.lock || g.panelState[myP.id] !== 'cleared') continue;
    const gx = gate.x + gate.w / 2, gy = gate.y + gate.h;
    if (gate.lock === 'key') {
      if (p.hasKey) return { goal: { x: gx + (gate.kind === 'door' ? (gx > myP.x2 - 5 ? -40 : 40) : 0), y: gate.kind === 'door' ? gy : gate.y } };
      for (const pk of g.pickups.values()) if (pk.active && pk.k === 'key') return { goal: { x: pk.x, y: pk.y + 34 } };
      for (const pr of g.props.values()) if (pr.contains === 'key') {
        // bust the crate open: shoot it if we can see it, else walk up and punch
        const cx = pr.x + pr.w / 2, cy = pr.y + pr.h / 2;
        const hit = raycast(g.phys, sh.x, sh.y, cx, cy);
        if (hit && hit.rect.prop === pr.id && Math.hypot(cx - sh.x, cy - sh.y) < 700) return { goal: null, aimAt: { x: cx, y: cy }, fire: true };
        return { goal: { x: cx - Math.sign(cx - p.x) * 90, y: pr.y + pr.h }, aimAt: { x: cx, y: cy }, punch: true, key: 'crate' + pr.id };
      }
      for (const o of g.players.values()) if (o.hasKey && o !== p) return { goal: { x: gx, y: gy } };
    } else if (gate.lock === 'switch') {
      let near = null, nd = Infinity;
      for (const sw of g.switches) {
        if (sw.panel !== myP.id || sw.done || sw.t > 1.2) continue;
        const d = Math.hypot(sw.x - sh.x, sw.y - sh.y);
        if (los(g, sh.x, sh.y, sw.x, sw.y) && d < 900) return { goal: null, aimAt: sw, fire: true };
        if (d < nd) { nd = d; near = sw; }
      }
      if (near) return { goal: { x: near.x, y: near.y + 70 } };
    } else if (gate.lock === 'crack') {
      const d = Math.hypot(gx - p.x, gate.y + gate.h / 2 - p.y);
      for (const pr of g.props.values()) {
        if (pr.k !== 'barrel' || pr.panel !== myP.id || Math.hypot(pr.x - gx, pr.y - gy) > 240) continue;
        const bx = pr.x + pr.w / 2, by = pr.y + pr.h / 2;
        const bd = Math.hypot(bx - p.x, by - p.y);
        const hit = raycast(g.phys, sh.x, sh.y, bx, by);
        const see = !hit || hit.rect.prop === pr.id;
        // shoot the barrel from a safe distance
        if (bd > 250 && see) return { goal: null, aimAt: { x: bx, y: by }, fire: true };
      }
      if (d < 300) return { goal: d < 150 ? { x: p.x - Math.sign(gx - p.x) * 80, y: p.y } : null, aimAt: { x: gx, y: gate.y + gate.h / 2 - 40 }, bomb: true };
      return { goal: { x: gx - Math.sign(gx - p.x) * 200, y: gate.kind === 'door' ? gate.y + gate.h : myP.y2 } };
    }
  }
  if (frontierId == null) return null;
  let F = lv.panels[frontierId];
  // a shut puzzle exit on the way? head for that panel first
  for (const id of lv.path) {
    if (id === frontierId) break;
    const gate = lv.gates.find((gt) => gt.panel === id);
    if (gate && !g.gatesOpen.has(gate.id)) { F = lv.panels[id]; break; }
  }
  if (F.id === myP.id) return { goal: { x: (F.x1 + F.x2) / 2 + Math.sin(g.tick / 90) * 120, y: F.y2 } };
  const link = nextLink(g, myP.id, F.id);
  if (link) return { goal: linkGoal(link, myP, p) };
  return null;
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
