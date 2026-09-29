// Balance check: neutral-state payoff matrix (damage dealt - taken, plus
// rough value for counters/stun/stamina), and bot-vs-bot match stats.
import { PICKABLE, newFighterState, resolveBeat, allowed } from '../shared/rules.js';
const base = newFighterState();
const acts = PICKABLE.filter((a) => allowed(base, a));
const val = (st, res, i) => {
  const j = 1 - i;
  let v = res[j].took - res[i].took;
  v += (st[i].counter ? 6 : 0) - (st[j].counter ? 6 : 0);
  v += (st[i].stunned ? -14 : 0) + (st[j].stunned ? 14 : 0);
  v += (st[i].stamina - st[j].stamina) * 0.8;
  v += (st[i].loaded ? 4 : 0) - (st[j].loaded ? 4 : 0);
  return v;
};
const M = {};
for (const a of acts) { M[a] = {}; for (const b of acts) { const { states, result } = resolveBeat([base, base], [a, b]); M[a][b] = val(states, result, 0); } }
const pad = (s, n) => String(s).padStart(n);
console.log(pad('', 8) + acts.map((a) => pad(a.slice(0, 6), 7)).join(''));
for (const a of acts) console.log(pad(a.slice(0, 7), 8) + acts.map((b) => pad(M[a][b].toFixed(0), 7)).join('') + '   avg ' + (acts.reduce((s, b) => s + M[a][b], 0) / acts.length).toFixed(1));
// Loaded attacker vs defender options.
const loaded = { ...base, loaded: true };
const la = ['UPPER', 'BODY', 'HOOK_L', 'HOOK_R', 'JAB'];
const ld = ['GUARD', 'LOW', 'SLIP_L', 'SLIP_R', 'DUCK', 'JAB'];
console.log('\nloaded attacker (rows) vs defender');
console.log(pad('', 8) + ld.map((a) => pad(a.slice(0, 6), 7)).join(''));
for (const a of la) console.log(pad(a.slice(0, 7), 8) + ld.map((b) => { const { states, result } = resolveBeat([loaded, base], [a, b]); return pad(val(states, result, 0).toFixed(0), 7); }).join(''));

// Equilibrium mix of the neutral game via fictitious play.
const n = acts.length;
const cnt = new Array(n).fill(1);
for (let it = 0; it < 200000; it++) {
  const tot = cnt.reduce((a, b) => a + b, 0);
  let best = 0, bv = -1e9;
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let j = 0; j < n; j++) v += M[acts[i]][acts[j]] * cnt[j] / tot;
    if (v > bv) { bv = v; best = i; }
  }
  cnt[best]++;
}
const tot = cnt.reduce((a, b) => a + b, 0);
console.log('\nneutral equilibrium mix:');
acts.forEach((a, i) => console.log(a.padEnd(8), (100 * cnt[i] / tot).toFixed(1) + '%'));
