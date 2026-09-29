// Combine PNG files into one contact sheet: node tools/sheet.mjs out.png cols width files...
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out, cols, w, ...files] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage();
const C = +cols, W = +w, R = Math.ceil(files.length / C), H = Math.round(W * 9 / 16);
await p.setViewportSize({ width: W * C, height: (H + 14) * R });
await p.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${C},${W}px)">${files.map((f) => `<div><div style="font:11px monospace;color:#fff;height:14px">${f.split('/').pop()}</div><img width=${W} height=${H} style="image-rendering:pixelated" src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"></div>`).join('')}</body>`);
await p.screenshot({ path: out });
await b.close();
