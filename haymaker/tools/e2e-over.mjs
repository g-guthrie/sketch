// Low-HP practice match where we never mash: capture round intro, KO and results.
import { chromium } from 'playwright';
const base = process.env.URL || 'http://localhost:8124/';
const out = process.env.OUT || '/tmp';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1152, height: 648 } });
p.on('pageerror', (e) => console.log('pageerror:', e.stack || e.message));
const room = () => p.evaluate(() => { const r = window.__hm?.net.room; return r && { phase: r.phase, you: r.you, hp: r.state?.map((s) => s.hp), result: r.result }; });
await p.goto(base);
await p.waitForTimeout(400);
await p.keyboard.press('Enter'); await p.waitForTimeout(200);
await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
await p.waitForTimeout(1500);
await p.keyboard.press('Enter');
let t0 = Date.now(), shots = {};
while (Date.now() - t0 < 100000) {
  const r = await room();
  const ph = r?.phase;
  if (ph === 'round' && !shots.round) { shots.round = 1; await p.waitForTimeout(500); await p.screenshot({ path: `${out}/round-a.png` }); await p.waitForTimeout(1200); await p.screenshot({ path: `${out}/round-b.png` }); }
  if (ph === 'pick') { await p.waitForTimeout(200); await p.keyboard.press('W'); await p.waitForTimeout(500); }
  if (ph === 'down') { const k = (shots.down = (shots.down || 0) + 1); if (k % 6 === 1) await p.screenshot({ path: `${out}/down-${k}.png` }); await p.waitForTimeout(400); }
  if (ph === 'over') { await p.waitForTimeout(300); await p.screenshot({ path: `${out}/over-a.png` }); await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/over-b.png` }); console.log(JSON.stringify(r)); break; }
  await p.waitForTimeout(80);
}
await b.close();
