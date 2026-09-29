// Practice match with low starting HP: capture knockdowns, counts and the result.
import { chromium } from 'playwright';
const base = process.env.URL || 'http://localhost:8124/';
const out = process.env.OUT || '/tmp';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1152, height: 648 } });
p.on('pageerror', (e) => console.log('pageerror:', e.stack || e.message));
const room = () => p.evaluate(() => { const r = window.__hm?.net.room; return r && { phase: r.phase, you: r.you, hp: r.state?.map((s) => s.hp), kd: r.state?.map((s) => s.knockdowns), result: r.result }; });
await p.goto(base);
await p.waitForTimeout(400);
await p.keyboard.press('Enter'); await p.waitForTimeout(200);
await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
await p.waitForTimeout(1500);
await p.keyboard.press('Enter');
let n = 0, lastPhase = null, t0 = Date.now(), downShots = 0;
while (Date.now() - t0 < 110000) {
  const r = await room();
  if (!r) { await p.waitForTimeout(100); continue; }
  if (r.phase !== lastPhase) { console.log('phase', r.phase, JSON.stringify(r.hp), JSON.stringify(r.kd)); lastPhase = r.phase; }
  if (r.phase === 'pick') { await p.waitForTimeout(300); await p.keyboard.press(['U', 'O', 'J', 'K'][n++ % 4]); await p.waitForTimeout(600); }
  else if (r.phase === 'down') {
    if (downShots < 14) { await p.screenshot({ path: `${out}/down-${String(downShots).padStart(2,"0")}-${n}.png` }); downShots++; }
    for (let k = 0; k < 6; k++) { await p.keyboard.press('Space'); await p.waitForTimeout(60); }
    await p.waitForTimeout(250);
  } else if (r.phase === 'over') {
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${out}/over.png` });
    console.log('result', JSON.stringify(r.result));
    break;
  } else if (r.phase === 'break') {
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/break.png` });
    await p.waitForTimeout(3000);
  } else await p.waitForTimeout(100);
}
await b.close();
