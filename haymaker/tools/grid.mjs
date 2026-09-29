// Screenshot several dev-scene URLs into one contact sheet.
import { chromium } from 'playwright';
const [out, cols, ...urls] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 768, height: 432 } });
p.on('pageerror', (e) => console.log('pageerror:', e.stack || e.message));
const shots = [];
for (const u of urls) { await p.goto(u); await p.waitForTimeout(400); shots.push((await p.screenshot()).toString('base64')); }
const C = +cols, R = Math.ceil(shots.length / C);
await p.setViewportSize({ width: 768 * C, height: 432 * R });
await p.setContent(`<body style="margin:0;display:grid;grid-template-columns:repeat(${C},768px);gap:0">${shots.map((s) => `<img src="data:image/png;base64,${s}">`).join('')}</body>`);
await p.screenshot({ path: out });
await b.close();
