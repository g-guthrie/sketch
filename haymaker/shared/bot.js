// Practice-mode CPU: weighted random picks that react to visible state.

import { allowed } from './rules.js';

export function botPick(me, them) {
  const w = {
    JAB: 3, HOOK_L: 2.2, HOOK_R: 2.2, BODY: 2, WINDUP: 1.1,
    GUARD: 2, LOW: 1.2, SLIP_L: 1.6, SLIP_R: 1.6, DUCK: 1.3,
  };
  if (them.loaded) Object.assign(w, { SLIP_L: 4, SLIP_R: 4, LOW: 2.5, JAB: 3, GUARD: 1, DUCK: 0.3 });
  if (me.loaded) Object.assign(w, { UPPER: 6, BODY: 2.5, HOOK_L: 1.5, HOOK_R: 1.5 });
  if (me.counter) { w.HOOK_L += 3; w.HOOK_R += 3; w.JAB += 2; w.BODY += 2; }
  if (them.stunned) { w.WINDUP = 0; w.HOOK_L += 4; w.HOOK_R += 4; w.BODY += 2; if (me.loaded) w.UPPER += 6; }
  if (me.stars > 0) w.STAR = me.stars * 1.6 + (them.stunned ? 6 : 0);
  if (me.stamina <= 3) { w.GUARD += 3; w.LOW += 2; }
  if (them.counter) { w.GUARD += 2; w.JAB += 1; }
  const opts = Object.entries(w).filter(([a, v]) => v > 0 && allowed(me, a));
  const total = opts.reduce((s, [, v]) => s + v, 0);
  let r = Math.random() * total;
  for (const [a, v] of opts) if ((r -= v) <= 0) return a;
  return 'GUARD';
}
