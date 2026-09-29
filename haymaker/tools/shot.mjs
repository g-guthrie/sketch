// Usage: node tools/shot.mjs <url> <out.png> [width] [height]
import { chromium } from 'playwright';
const [url, out, w = 1600, h = 1000] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('console', (m) => console.log('console:', m.text()));
p.on('pageerror', (e) => console.log('pageerror:', e.stack || e.message));
await p.goto(url);
await p.waitForTimeout(+(process.env.WAIT || 800));
await p.screenshot({ path: out, fullPage: true });
await b.close();
