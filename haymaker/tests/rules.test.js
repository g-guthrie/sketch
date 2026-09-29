import test from 'node:test';
import assert from 'node:assert/strict';
import { newFighterState, resolveBeat, allowed } from '../shared/rules.js';

const fresh = () => [newFighterState(), newFighterState()];
const beat = (a, b, st = fresh()) => resolveBeat(st, [a, b]);

test('slipping the same side as a hook dodges it and earns a counter', () => {
  const { result, states } = beat('HOOK_L', 'SLIP_L');
  assert.equal(result[0].outcome, 'evade');
  assert.equal(result[1].took, 0);
  assert.equal(states[1].counter, true);
});

test('slipping into a hook takes 1.5x', () => {
  const { result } = beat('HOOK_L', 'SLIP_R');
  assert.equal(result[1].took, 17);
});

test('jab interrupts a body shot', () => {
  const { result } = beat('JAB', 'BODY');
  assert.equal(result[0].outcome, 'hit');
  assert.equal(result[1].outcome, 'stuffed');
  assert.equal(result[0].took, 0);
});

test('hooks plow through jabs at reduced force', () => {
  const { result } = beat('HOOK_R', 'JAB');
  assert.equal(result[0].took, 5);
  assert.equal(result[1].took, 7);
});

test('uppercut needs a wind-up, which the opponent can see', () => {
  const st = fresh();
  assert.equal(allowed(st[0], 'UPPER'), false);
  const { states } = beat('WINDUP', 'GUARD', st);
  assert.equal(states[0].loaded, true);
  assert.equal(allowed(states[0], 'UPPER'), true);
  const r = resolveBeat(states, ['UPPER', 'DUCK']);
  assert.equal(r.result[1].took, 36);
  assert.equal(r.states[1].stunned, true);
});

test('getting hit while winding up loses the load', () => {
  const { states, result } = beat('WINDUP', 'HOOK_L');
  assert.equal(result[0].took, 17);
  assert.equal(states[0].loaded, false);
});

test('a counter-boosted hit earns a star; a clean hit costs one', () => {
  const st = beat('JAB', 'SLIP_L').states; // player 1 now has a counter
  st[0].stars = 1;
  const r = resolveBeat(st, ['LOW', 'HOOK_L']);
  assert.equal(r.result[1].counterHit, true);
  assert.equal(r.result[0].took, 17); // 11 * 1.5
  assert.equal(r.states[1].stars, 1);
  assert.equal(r.states[0].stars, 0);
});

test('blocked counter hooks only chip', () => {
  const st = beat('JAB', 'SLIP_L').states;
  const r = resolveBeat(st, ['GUARD', 'HOOK_L']);
  assert.equal(r.result[0].took, 3); // 11 * 0.2 * 1.5
  assert.equal(r.result[1].counterHit, false);
});

test('low guard stops body shots and earns a counter', () => {
  const { result, states } = beat('BODY', 'LOW');
  assert.equal(result[1].took, 0);
  assert.equal(states[1].counter, true);
});

test('stamina gates attacks', () => {
  const st = fresh();
  st[0].stamina = 1;
  assert.equal(allowed(st[0], 'HOOK_L'), false);
  assert.equal(allowed(st[0], 'JAB'), true);
  const { acts } = resolveBeat(st, ['HOOK_L', 'GUARD']);
  assert.equal(acts[0], 'GUARD');
});

test('stunned fighters cannot act', () => {
  const st = fresh();
  st[1].stunned = true;
  const { acts, result } = resolveBeat(st, ['HOOK_L', 'SLIP_L']);
  assert.equal(acts[1], 'STUNNED');
  assert.equal(result[1].took, 11);
});
