// PANEL BRAWL server: static files + WebSocket rooms, 60 Hz authoritative sim.
//   npm install && npm start   ->   http://localhost:3000

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { WebSocketServer } from 'ws';
import { RoomCore } from '../shared/room.js';
import { TICK_RATE, MODES } from '../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const ALLOWED = ['client', 'shared'];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '/index.html') {
    res.writeHead(302, { Location: '/client/' + url.search });
    return res.end();
  }
  if (p.endsWith('/')) p += 'index.html';
  const rel = path.normalize(p).replace(/^([/\\])+/, '');
  const top = rel.split(/[/\\]/)[0];
  const file = path.join(ROOT, rel);
  if (!ALLOWED.includes(top) || !file.startsWith(ROOT)) {
    res.writeHead(404);
    return res.end('not found');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const rooms = new Map();
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
let nextCid = 1;

function roomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)];
    if (!rooms.has(c)) return c;
  }
}

wss.on('connection', (ws) => {
  const cid = nextCid++;
  let room = null;
  const send = (msg) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  };
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    switch (msg.type) {
      case 'create': {
        if (room) return;
        const code = roomCode();
        room = new RoomCore({
          code,
          mode: msg.mode === MODES.BRAWL ? MODES.BRAWL : MODES.STORY,
          chaos: !!msg.chaos,
          botFill: Math.max(0, Math.min(7, Number(msg.botFill) || 0)),
          theme: msg.theme || undefined,
        });
        rooms.set(code, room);
        room.join(cid, send, msg.name, msg.hero);
        console.log(`[room ${code}] created (${room.game.mode}) by #${cid}`);
        break;
      }
      case 'join': {
        if (room) return;
        const code = String(msg.code || '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) return send({ type: 'error', msg: `No comic found with code ${code}.` });
        if (r.size >= 8) return send({ type: 'error', msg: 'That comic is full (8 heroes max).' });
        room = r;
        room.join(cid, send, msg.name, msg.hero);
        console.log(`[room ${code}] #${cid} joined (${room.size} players)`);
        break;
      }
      case 'input':
        if (room) room.input(cid, msg.cmds);
        break;
      case 'ping':
        send({ type: 'pong', t: msg.t });
        break;
    }
  });
  ws.on('close', () => {
    if (room) room.leave(cid);
  });
});

// Fixed-step loop for every room.
const STEP = 1000 / TICK_RATE;
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += now - last;
  last = now;
  let n = 0;
  while (acc >= STEP && n < 6) {
    for (const r of rooms.values()) if (r.size > 0) r.tick();
    acc -= STEP;
    n++;
  }
  if (n === 6) acc = 0;
}, 4);

// Garbage-collect abandoned rooms.
setInterval(() => {
  for (const [code, r] of rooms) {
    if (r.size === 0 && Date.now() - r.emptySince > 60000) {
      rooms.delete(code);
      console.log(`[room ${code}] closed`);
    }
  }
}, 10000);

server.listen(PORT, () => {
  console.log(`PANEL BRAWL running at http://localhost:${PORT}`);
});
