// Two browsers: one creates a match, the other joins by code; play a few beats.
import { chromium } from 'playwright';
const base = process.env.URL || 'http://localhost:8123/';
const out = process.env.OUT || '/tmp';
const b = await chromium.launch();
const mk = async (tag) => {
  const ctx = await b.newContext({ viewport: { width: 1152, height: 648 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(tag, 'pageerror:', e.stack || e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log(tag, 'console:', m.text()); });
  await p.goto(base);
  await p.waitForTimeout(400);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(200);
  return p;
};
const phase = (p) => p.evaluate(() => window.__hm?.net.room?.phase);
const wait = async (p, ph, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await phase(p)) === ph) return true; await p.waitForTimeout(60); } console.log('timeout', ph, await phase(p)); return false; };
const A = await mk('A');
await A.keyboard.press('Enter'); // CREATE MATCH
await wait(A, 'lobby');
await A.waitForTimeout(300);
await A.screenshot({ path: `${out}/pvp-lobby.png` });
const code = await A.evaluate(() => window.__hm.net.room.code);
console.log('code', code);
const B = await mk('B');
await B.keyboard.press('ArrowDown'); await B.keyboard.press('Enter'); // JOIN MATCH
await B.waitForTimeout(300);
for (const ch of code.slice(0, 3)) await B.keyboard.press(ch);
await B.screenshot({ path: `${out}/pvp-join.png` });
await B.keyboard.press(code[3]);
await wait(B, 'select'); await wait(A, 'select');
await A.keyboard.press('ArrowRight'); await A.keyboard.press('ArrowRight');
await B.keyboard.press('ArrowRight');
await A.waitForTimeout(400);
await A.screenshot({ path: `${out}/pvp-select-A.png` });
await A.keyboard.press('Enter'); await B.keyboard.press('Enter');
await wait(A, 'pick', 20000);
const plan = [['J', 'W'], ['U', 'A'], ['K', 'D'], ['I', 'S'], ['I', 'A']];
for (const [ma, mb] of plan) {
  await wait(A, 'pick', 20000);
  await A.waitForTimeout(300);
  await A.keyboard.press(ma);
  await B.waitForTimeout(500);
  await B.screenshot({ path: `${out}/pvp-B-waiting-${ma}${mb}.png` });
  await B.keyboard.press(mb);
  await wait(A, 'resolve', 5000);
  await A.waitForTimeout(350);
  await A.screenshot({ path: `${out}/pvp-A-${ma}${mb}.png` });
  await B.screenshot({ path: `${out}/pvp-B-${ma}${mb}.png` });
}
const st = await A.evaluate(() => window.__hm.net.room.state);
console.log(JSON.stringify(st));
await b.close();
