// Phone-sized landscape run: tap through to a practice fight and tap a move.
import { chromium, devices } from 'playwright';
const out = process.env.OUT || '/tmp';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror:', e.stack || e.message));
await p.goto(process.env.URL || 'http://localhost:8123/');
await p.waitForTimeout(500);
const box = await p.locator('#screen').boundingBox();
const tap = async (nx, ny) => { await p.touchscreen.tap(box.x + (nx / 384) * box.width, box.y + (ny / 216) * box.height); await p.waitForTimeout(250); };
console.log('canvas', JSON.stringify(box));
await tap(192, 130);
await p.screenshot({ path: `${out}/m-menu.png` });
await tap(192, 142); // PRACTICE VS CPU (third item)
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/m-select.png` });
await tap(192, 198); // READY
const phase = () => p.evaluate(() => window.__hm?.net.room?.phase);
for (let i = 0; i < 200 && (await phase()) !== 'pick'; i++) await p.waitForTimeout(100);
await p.waitForTimeout(500);
await tap(4 + 43 + 20, 180); // GUARD chip
await p.screenshot({ path: `${out}/m-pick.png` });
console.log('myPick', await p.evaluate(() => window.__hm.engine.scene.myPick));
await b.close();
