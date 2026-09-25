// Screenshot + smoke harness (dev only).
//   node tools/shoot.mjs <url-query> <outPrefix> [seconds] [script]
// Script actions (comma separated): "hold:KeyD:1.5", "click:0.5", "wait:1", "key:Space", "shot"
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const globalRoot = execSync('npm root -g').toString().trim();
const { chromium } = require(process.env.PW_PATH || globalRoot + '/playwright');

const [, , query = 'solo=story', out = '/tmp/pb', secs = '8', script = ''] = process.argv;
const base = process.env.PB_URL || 'http://localhost:3000/';

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.goto(base + '?' + query, { waitUntil: 'load' });
await page.mouse.move(1100, 420);
let shot = 0;
const snap = async () => { await page.screenshot({ path: `${out}-${shot++}.png` }); };
const wait = (s) => page.waitForTimeout(s * 1000);
if (script) {
  for (const step of script.split(',')) {
    const [a, b, c] = step.split(':');
    if (a === 'wait') await wait(Number(b));
    else if (a === 'shot') await snap();
    else if (a === 'hold') { await page.keyboard.down(b); await wait(Number(c)); await page.keyboard.up(b); }
    else if (a === 'key') await page.keyboard.press(b);
    else if (a === 'mouse') await page.mouse.move(Number(b), Number(c));
    else if (a === 'fire') { await page.mouse.down(); await wait(Number(b)); await page.mouse.up(); }
    else if (a === 'rclick') { await page.mouse.click(Number(b) || 1100, Number(c) || 420, { button: 'right' }); }
    else if (a === 'eval') console.log(await page.evaluate(b));
    else if (a === 'probe') console.log(await page.evaluate(() => {
      const w = window.__pb.world, p = w.pred.p;
      return JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx), phase: w.phase, alive: p.alive, seq: w.seq, pending: w.pred.pending.length, hp: w.meState && w.meState.hp, onGround: p.onGround });
    }));
  }
} else {
  const n = Number(secs);
  for (let i = 0; i < n; i += 2) { await wait(2); await snap(); }
}
const stats = await page.evaluate(() => {
  const pb = window.__pb;
  if (!pb) return null;
  const w = pb.world;
  return { phase: w.phase, players: w.players.size, enemies: w.enemies.size, projectiles: w.projectiles.size, me: w.meState && { alive: w.meState.alive, hp: w.meState.hp, x: Math.round(w.pred.p.x), y: Math.round(w.pred.p.y) }, theme: w.comic && w.comic.theme };
}).catch(() => null);
console.log(JSON.stringify(stats));
console.log(errors.slice(0, 30).join('\n') || 'no console errors');
await browser.close();
