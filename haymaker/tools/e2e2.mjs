// Practice match: capture frames across each exchange.
import { chromium } from 'playwright';
const base = process.env.URL || 'http://localhost:8123/';
const out = process.env.OUT || '/tmp';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1152, height: 648 } });
p.on('pageerror', (e) => console.log('pageerror:', e.stack || e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
const phase = () => p.evaluate(() => window.__hm?.net.room?.phase);
const waitPhase = async (ph, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const cur = await phase(); if ((Array.isArray(ph) ? ph : [ph]).includes(cur)) return cur; await p.waitForTimeout(50); } console.log('timeout', ph, await phase()); return null; };
let results = [];
await p.exposeFunction('logResult', (r) => results.push(r));
await p.goto(base);
await p.waitForTimeout(500);
await p.evaluate(() => window.__hm.net.on((m) => { if (m.t === 'result') window.logResult(JSON.stringify({ acts: m.acts, you: m.you, res: m.result.map((r) => [r.outcome, r.reaction, r.took, r.tags.join('/')]) })); }));
await p.keyboard.press('Enter'); await p.waitForTimeout(300);
await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
await waitPhase('select'); await p.waitForTimeout(900);
await p.keyboard.press('Enter');
await waitPhase('pick', 20000);
const moves = (process.env.MOVES || 'J,U,I,I,K,W').split(',');
const times = (process.env.TIMES || '150,300,500,800').split(',').map(Number);
let i = 0;
for (const mv of moves) {
  const ph = await waitPhase(['pick', 'over'], 20000);
  if (ph === 'over') break;
  await p.waitForTimeout(400);
  await p.keyboard.press(mv);
  await waitPhase('resolve', 8000);
  let last = 0;
  for (const t of times) { await p.waitForTimeout(t - last); last = t; await p.screenshot({ path: `${out}/x${i}-${mv}-${t}.png` }); }
  i++;
}
console.log(results.join('\n'));
await b.close();
