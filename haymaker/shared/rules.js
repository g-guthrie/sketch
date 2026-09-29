// Haymaker rules: simultaneous secret picks resolved into one exchange.
// Shared by the server (authoritative) and the client (UI hints).

export const CONFIG = {
  pickMs: 6000,          // time to lock a pick each beat
  resolveMs: 1900,       // exchange animation before the next beat
  beatsPerRound: 18,     // each beat is 10 seconds on the fight clock
  rounds: 3,
  maxHealth: 100,
  maxStamina: 10,
  maxStars: 3,
  knockdownsForTKO: 3,
  countMs: 900,          // one referee count
  roundBreakMs: 4200,
};

// kind: atk | load | def
export const ACTIONS = {
  JAB:    { kind: 'atk', target: 'head', speed: 3, dmg: 5, cost: 1, label: 'JAB', key: 'J' },
  HOOK_L: { kind: 'atk', target: 'head', side: 'L', speed: 2, dmg: 11, cost: 2, label: 'L HOOK', key: 'U', armor: { JAB: 0.6 } },
  HOOK_R: { kind: 'atk', target: 'head', side: 'R', speed: 2, dmg: 11, cost: 2, label: 'R HOOK', key: 'O', armor: { JAB: 0.6 } },
  BODY:   { kind: 'atk', target: 'body', speed: 2, dmg: 6, drain: 3, cost: 2, label: 'BODY', key: 'K' },
  WINDUP: { kind: 'load', cost: 1, label: 'WIND UP', key: 'I' },
  UPPER:  { kind: 'atk', target: 'head', speed: 1, dmg: 24, cost: 2, label: 'UPPERCUT', key: 'I', needsLoad: true, armor: { JAB: 1 }, stun: true },
  STAR:   { kind: 'atk', target: 'head', speed: 3, dmg: 12, perStar: 10, cost: 0, label: 'STAR', key: 'L', needsStar: true },
  GUARD:  { kind: 'def', label: 'GUARD', key: 'W' },
  LOW:    { kind: 'def', label: 'LOW GUARD', key: 'S' },
  SLIP_L: { kind: 'def', cost: 1, label: 'SLIP', key: 'A' },
  SLIP_R: { kind: 'def', cost: 1, label: 'SLIP', key: 'D' },
  DUCK:   { kind: 'def', cost: 1, label: 'DUCK', key: 'X' },
};

export const PICKABLE = ['JAB', 'HOOK_L', 'HOOK_R', 'BODY', 'WINDUP', 'UPPER', 'STAR', 'GUARD', 'LOW', 'SLIP_L', 'SLIP_R', 'DUCK'];

export function newFighterState() {
  return {
    hp: CONFIG.maxHealth,
    stamina: CONFIG.maxStamina,
    stars: 0,
    loaded: false,      // wound up last beat: may throw UPPER now
    counter: false,     // evaded last beat: next attack is faster and harder
    stunned: false,     // cannot act this beat
    guardBroken: false, // cannot GUARD this beat
    knockdowns: 0,      // this round
    totalKnockdowns: 0,
    points: 0,
  };
}

export function allowed(st, action) {
  const a = ACTIONS[action];
  if (!a) return false;
  if (st.stunned) return false;
  if (action === 'UPPER') return st.loaded && st.stamina >= a.cost;
  if (action === 'WINDUP') return !st.loaded && st.stamina >= a.cost;
  if (action === 'STAR') return st.stars > 0;
  if (action === 'GUARD' && st.guardBroken) return false;
  if (a.cost && st.stamina < a.cost) return false;
  return true;
}

// What a player gets if their pick is missing or illegal.
export function fallback(st) {
  if (st.stunned) return 'STUNNED';
  return st.guardBroken ? 'LOW' : 'GUARD';
}

// Outcome of an attack `a` (by attacker state `as`) against defender action `d`.
function versus(a, d) {
  const A = ACTIONS[a];
  if (d === 'STUNNED' || d === 'WINDUP' || !ACTIONS[d] || ACTIONS[d].kind === 'atk') {
    return { res: 'hit', mult: d === 'WINDUP' ? 1.5 : 1, tag: d === 'WINDUP' ? 'CAUGHT' : null };
  }
  if (A.target === 'body') {
    if (d === 'LOW') return { res: 'blocked', mult: 0, tag: 'BLOCKED', perfect: true };
    if (d === 'DUCK') return { res: 'hit', mult: 1.5, tag: 'CAUGHT' };
    return { res: 'hit', mult: 1 };
  }
  // Head attacks.
  switch (d) {
    case 'GUARD':
      if (a === 'JAB') return { res: 'blocked', mult: 0, tag: 'BLOCKED' };
      if (a === 'UPPER') return { res: 'guardbreak', mult: 0.5, tag: 'GUARD BREAK' };
      if (a === 'STAR') return { res: 'chip', mult: 0.5, tag: 'BLOCKED' };
      return { res: 'blocked', mult: 0.2, tag: 'BLOCKED' };
    case 'LOW':
      return { res: 'hit', mult: 1 };
    case 'SLIP_L':
    case 'SLIP_R': {
      const side = d === 'SLIP_L' ? 'L' : 'R';
      if (a === 'HOOK_L' || a === 'HOOK_R') {
        return A.side === side ? { res: 'evade', mult: 0, tag: 'SLIPPED' } : { res: 'hit', mult: 1.5, tag: 'WRONG WAY' };
      }
      return { res: 'evade', mult: 0, tag: 'SLIPPED' };
    }
    case 'DUCK':
      if (a === 'UPPER') return { res: 'hit', mult: 1.5, tag: 'CAUGHT' };
      // Ducking a jab is safe but too late to counter off.
      if (a === 'JAB') return { res: 'evade', mult: 0, tag: 'DUCKED', noCounter: true };
      return { res: 'evade', mult: 0, tag: 'DUCKED' };
  }
  return { res: 'hit', mult: 1 };
}

// Resolve one beat. `st` is [state0, state1] (mutated copies returned),
// `picks` is [action0, action1]. Returns { states, events }.
export function resolveBeat(stIn, picks) {
  const st = stIn.map((s) => ({ ...s }));
  const acts = picks.map((p, i) => (p && allowed(st[i], p) ? p : fallback(st[i])));
  const out = [0, 1].map((i) => ({
    action: acts[i],
    lands: false,       // this player's attack connected (hit/blocked/chip)
    outcome: null,      // outcome of this player's attack: hit | blocked | chip | guardbreak | evade | stuffed | trade
    took: 0,            // damage taken
    reaction: null,     // head | body | block | dodge | stun | caught | none
    tags: [],
    counterHit: false,
    at: 0,              // contact time (ms) for animation
  }));

  const spd = (i) => {
    const A = ACTIONS[acts[i]];
    return A && A.kind === 'atk' ? A.speed + (st[i].counter ? 1 : 0) : 0;
  };
  const contact = { 4: 90, 3: 140, 2: 240, 1: 420 };

  // Pay costs.
  for (const i of [0, 1]) {
    const A = ACTIONS[acts[i]];
    if (A && A.cost) st[i].stamina -= A.cost;
    if (acts[i] === 'STAR') st[i].starsSpent = st[i].stars;
  }

  const isAtk = (i) => ACTIONS[acts[i]]?.kind === 'atk';
  const hits = []; // [attacker, defender, info]

  if (isAtk(0) && isAtk(1)) {
    const s0 = spd(0), s1 = spd(1);
    // Armor lets a slower punch plough through a faster one, sometimes at reduced force.
    const armor = (i, j) => ACTIONS[acts[i]].armor?.[acts[j]];
    if (s0 === s1 || armor(0, 1) || armor(1, 0)) {
      const m = (i) => (armor(i, 1 - i) && spd(1 - i) > spd(i) ? armor(i, 1 - i) : 1);
      hits.push([0, 1, { res: 'hit', mult: m(0), tag: 'TRADE' }]);
      hits.push([1, 0, { res: 'hit', mult: m(1), tag: 'TRADE' }]);
      out[0].outcome = out[1].outcome = 'trade';
    } else {
      const f = s0 > s1 ? 0 : 1, s = 1 - f;
      hits.push([f, s, { res: 'hit', mult: 1, tag: 'INTERRUPT' }]);
      out[f].outcome = 'hit';
      out[s].outcome = 'stuffed';
    }
  } else {
    for (const i of [0, 1]) {
      if (!isAtk(i)) continue;
      const v = versus(acts[i], acts[1 - i]);
      hits.push([i, 1 - i, v]);
      out[i].outcome = v.res;
    }
  }

  const events = [];
  for (const [i, j, v] of hits) {
    const A = ACTIONS[acts[i]];
    let dmg = A.dmg;
    if (acts[i] === 'STAR') dmg = A.dmg + A.perStar * (st[i].starsSpent || 1);
    const countered = st[i].counter;
    let mult = v.mult * (countered ? 1.5 : 1);
    const took = Math.round(dmg * mult);
    out[i].at = contact[Math.min(4, spd(i))] || 240;
    out[j].at = Math.max(out[j].at, out[i].at);
    if (v.tag) out[j].tags.push(v.tag);
    if (v.res === 'evade') {
      out[j].reaction = 'dodge';
      st[i].stamina -= 1; // whiff
      if (!v.noCounter) { st[j].earnedCounter = true; out[j].earnedCounter = true; }
      continue;
    }
    if (v.res === 'blocked' || v.res === 'chip' || v.res === 'guardbreak') {
      out[i].lands = true;
      if (v.res === 'blocked') st[i].stamina -= 1; // punching into a guard wears you out
      out[j].took += took;
      st[j].hp -= took;
      st[i].points += took;
      out[j].reaction = v.res === 'guardbreak' ? 'guardbreak' : 'block';
      if (v.res === 'guardbreak') st[j].nextGuardBroken = true;
      if (v.perfect) { st[j].earnedCounter = true; out[j].earnedCounter = true; out[j].tags.push('PERFECT'); }
      continue;
    }
    // Clean hit.
    out[i].lands = true;
    out[j].took += took;
    st[j].hp -= took;
    st[i].points += took;
    out[j].reaction = A.target === 'body' ? 'body' : 'head';
    if (A.drain) st[j].stamina -= A.drain;
    if (A.stun) { st[j].nextStunned = true; out[j].reaction = 'stun'; }
    if (countered) { out[i].counterHit = true; st[i].stars = Math.min(CONFIG.maxStars, st[i].stars + 1); out[i].tags.push('COUNTER'); }
    if (st[j].stars > 0 && acts[j] !== 'STAR') { st[j].stars -= 1; out[j].lostStar = true; }
    if (acts[j] === 'WINDUP') st[j].loadInterrupted = true;
    if (acts[i] === 'STAR') out[i].tags.push('STAR PUNCH');
  }

  // End-of-beat bookkeeping.
  for (const i of [0, 1]) {
    const s = st[i];
    if (acts[i] === 'STAR') s.stars = 0;
    // Counter lasts one beat: keep it only if earned this beat.
    s.counter = !!s.earnedCounter;
    delete s.earnedCounter;
    s.loaded = acts[i] === 'WINDUP' && !s.loadInterrupted;
    delete s.loadInterrupted;
    s.stunned = !!s.nextStunned; delete s.nextStunned;
    s.guardBroken = !!s.nextGuardBroken; delete s.nextGuardBroken;
    delete s.starsSpent;
    let regen = 1;
    if (acts[i] === 'GUARD' || acts[i] === 'LOW') regen += 1;
    s.stamina = Math.max(0, Math.min(CONFIG.maxStamina, s.stamina + regen));
    s.hp = Math.max(0, s.hp);
    if (out[i].reaction == null) out[i].reaction = 'none';
  }
  for (const i of [0, 1]) {
    if (st[i].hp <= 0) out[i].down = true;
  }
  events.push(...out);
  return { states: st, result: out, acts };
}

// Health restored when getting up, by knockdown count this round.
export function getUpHealth(knockdowns) {
  return [0, 55, 38, 22][Math.min(3, knockdowns)] || 20;
}

// Button presses needed to beat the count, by total knockdowns this match.
export function mashNeeded(totalKnockdowns) {
  return 12 + totalKnockdowns * 7;
}

export function clockText(beat) {
  const secs = Math.max(0, CONFIG.beatsPerRound * 10 - beat * 10);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}
