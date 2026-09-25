// Headless smoke test for the shared simulation.
//   node tools/simtest.js
// Generates many comics, checks level sanity, then runs story + brawl
// matches with bots for a few simulated minutes each.

import { Game } from '../shared/game.js';
import { RoomCore } from '../shared/room.js';
import { generateComic, generateSpread } from '../shared/comicgen.js';
import { THEME_KEYS } from '../shared/themes.js';
import { TICK_RATE } from '../shared/constants.js';

let failures = 0;
const fail = (msg) => { failures++; console.error('FAIL:', msg); };

// ---------- level generation sanity ----------
let levels = 0;
for (let s = 1; s <= 120; s++) {
  for (const mode of ['story', 'brawl']) {
    const comic = generateComic(s * 7919, { theme: THEME_KEYS[s % THEME_KEYS.length] });
    for (let i = 0; i < comic.spreads; i++) {
      const lv = generateSpread(comic, i, mode, { chaos: mode === 'brawl' && s % 2 === 0 });
      levels++;
      if (lv.path.length !== lv.panels.length) fail(`path misses panels seed=${s}`);
      // connectivity over links (ignoring gates)
      const adj = new Map(lv.panels.map((p) => [p.id, []]));
      for (const l of lv.links) { adj.get(l.a).push(l.b); adj.get(l.b).push(l.a); }
      const seen = new Set([lv.path[0]]);
      const q = [lv.path[0]];
      while (q.length) for (const n of adj.get(q.shift())) if (!seen.has(n)) { seen.add(n); q.push(n); }
      if (seen.size !== lv.panels.length) fail(`disconnected spread seed=${s} mode=${mode} idx=${i}`);
      if (!lv.spawns.length) fail(`no spawns seed=${s}`);
      for (const P of lv.panels) {
        if (!lv.spawns.some((sp) => sp.panel === P.id)) fail(`panel without spawn seed=${s} panel=${P.id} w=${P.x2 - P.x1}`);
      }
      if (mode === 'story' && i === comic.spreads - 1 && !lv.enemies.some((e) => e.k === 'boss')) fail(`no boss seed=${s}`);
    }
  }
}
console.log(`generated ${levels} spreads`);

// ---------- run matches ----------
function run(mode, seconds, opts = {}) {
  const room = new RoomCore({ code: 'TEST', mode, botFill: opts.botFill || 0, chaos: !!opts.chaos, seed: opts.seed, theme: opts.theme });
  const msgs = [];
  room.join(1, (m) => msgs.push(m), 'TESTER', 'kapow');
  const g = room.game;
  const me = [...g.players.values()].find((p) => !p.bot);
  let seq = 0;
  const t0 = Date.now();
  let kills = 0, hits = 0, shots = 0, levelsSeen = new Set([g.levelVersion]);
  for (let t = 0; t < seconds * TICK_RATE; t++) {
    // a dumb human: runs back and forth, jumps, shoots
    const phase = Math.floor(t / 90) % 4;
    room.input(1, [{
      seq: ++seq, mx: phase < 2 ? 1 : -1, up: false, down: false, jump: t % 40 < 10, fire: true, aim: Math.sin(t / 30) * 0.4,
      jumpP: t % 40 === 0, dashP: t % 150 === 0, meleeP: t % 25 === 0, bombP: t % 400 === 0, swapP: false, interactP: t % 90 === 0,
      superP: true, reloadP: false, tauntP: t % 600 === 0,
    }]);
    room.tick();
    levelsSeen.add(g.levelVersion);
  }
  for (const m of msgs) {
    if (m.type !== 'snap') continue;
    for (const e of m.ev) {
      if (e.t === 'kill') kills++;
      if (e.t === 'hit') hits++;
      if (e.t === 'shot') shots++;
    }
  }
  const ms = Date.now() - t0;
  const bots = [...g.players.values()].filter((p) => p.bot);
  console.log(`${mode}${opts.chaos ? '+chaos' : ''} ${opts.theme || ''}: ${seconds}s sim in ${ms}ms | phase=${g.phase} spread=${g.spreadIndex} levels=${levelsSeen.size} shots=${shots} hits=${hits} kills=${kills} | me k/d ${me.kills}/${me.deaths} | bots ${bots.map((b) => b.kills + '/' + b.deaths).join(' ')}`);
  const bytes = msgs.filter((m) => m.type === 'snap').slice(-50).reduce((a, m) => a + JSON.stringify(m).length, 0) / 50;
  console.log(`   avg snapshot ${Math.round(bytes)} bytes, level msg ${JSON.stringify(msgs.find((m) => m.type === 'level')).length} bytes`);
  return { g, kills, hits, shots, bots };
}

for (const theme of THEME_KEYS) {
  const r = run('story', 90, { theme, seed: 1000 + theme.length });
  if (r.hits === 0 && r.g.level.panels[r.g.level.path[0]].beat !== 'establish') fail('story: no hits at all for ' + theme);
}
const b = run('brawl', 120, { botFill: 6, seed: 42 });
if (b.kills < 3) fail('brawl: bots barely kill anyone (' + b.kills + ')');
const moved = b.bots.filter((p) => p.brain && p.brain.t > 0);
if (!moved.length) fail('bots never thought');
run('brawl', 60, { botFill: 4, chaos: true, seed: 7 });

// long story run to exercise page turns / boss / victory
{
  const room = new RoomCore({ code: 'X', mode: 'story', seed: 99 });
  room.join(1, () => {}, 'A', 'kapow');
  const g = room.game;
  // cheat: kill enemies as panels activate by teleporting the player through the path
  let ticks = 0;
  const seenPhases = new Set();
  while (ticks < TICK_RATE * 600) {
    const me = g.players.get(1);
    if (g.phase === 'play' && me.alive) {
      const idx = g.level.path.find((id) => g.panelState[id] !== 'cleared');
      if (idx != null) {
        const P = g.level.panels[idx];
        me.x = (P.x1 + P.x2) / 2; me.y = P.y2; me.invuln = 1;
        for (const e of g.enemies.values()) if (e.panel === P.id && e.st === 'active') g.hurt(e, 9999, { by: 1, byKind: 'p', w: 'pistol', x: e.x, y: e.y, kx: 0, ky: 0 });
      }
    }
    room.input(1, []);
    room.tick();
    seenPhases.add(g.phase);
    ticks++;
    if (g.phase === 'victory') break;
  }
  console.log('story progression phases:', [...seenPhases].join(','), 'final spread', g.spreadIndex);
  if (!seenPhases.has('victory')) fail('story never reached victory');
}

// ---------- INK-BOTS play the whole story: beats, puzzles, ad page, boss ----------
for (const theme of THEME_KEYS) {
  for (const seed of [44, 45]) {
    const g = new Game({ mode: 'story', seed, theme });
    g.addPlayer(1, 'BOT A', 'kapow', true);
    g.addPlayer(2, 'BOT B', 'voltvixen', true);
    const seen = new Set();
    let t = 0;
    for (; t < 60 * 60 * 15 && g.phase !== 'victory'; t++) {
      g.step();
      for (const e of g.events) seen.add(e.t === 'gate' ? 'gate:' + e.how : e.t === 'panel' && e.beat ? 'beat:' + e.beat : e.t);
      g.events.length = 0;
    }
    const got = [...seen].filter((k) => k.startsWith('beat:') || k.startsWith('gate:')).sort().join(' ');
    console.log(`playthrough ${theme} seed ${seed}: ${g.phase} in ${(t / 60) | 0}s | ${got}`);
    if (g.phase !== 'victory') fail(`bots could not finish ${theme} seed ${seed} (stuck on spread ${g.spreadIndex})`);
    if (!seen.has('ads') || !seen.has('perk')) fail('no mail-order ad page in ' + theme);
  }
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nALL OK');
