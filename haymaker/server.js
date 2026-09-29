// Haymaker server: static files + WebSocket match rooms keyed by 4-letter codes.
// The server is authoritative: it holds both secret picks until the beat
// resolves, so neither client can peek at the other's choice.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  CONFIG, ACTIONS, PICKABLE, newFighterState, allowed, resolveBeat,
  getUpHealth, mashNeeded,
} from './shared/rules.js';
import { botPick } from './shared/bot.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const FIGHTER_IDS = ['rico', 'bruno', 'volt', 'duke'];
const TIMING = { ...CONFIG, ...(process.env.HAYMAKER_FAST ? { pickMs: 1500, resolveMs: 600, countMs: 200, roundBreakMs: 800 } : {}) };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  let rel = decodeURIComponent(url.pathname);
  let base = path.join(ROOT, 'public');
  if (rel.startsWith('/shared/')) { base = path.join(ROOT, 'shared'); rel = rel.slice('/shared'.length); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------------------------------------------------------------------------
// Rooms

const rooms = new Map();
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function makeCode() {
  for (let n = 0; n < 1000; n++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += LETTERS[(Math.random() * LETTERS.length) | 0];
    if (!rooms.has(c)) return c;
  }
  throw new Error('no codes left');
}

const token = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

class Room {
  constructor(code) {
    this.code = code;
    this.players = [null, null];
    this.fighters = [null, null];
    this.ready = [false, false];
    this.phase = 'lobby';
    this.timers = new Set();
    this.rematch = [false, false];
    this.touched = Date.now();
  }

  later(ms, fn) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
    return t;
  }
  clearTimers() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); }

  send(i, msg) {
    const p = this.players[i];
    if (p && p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
  }
  broadcast(fn) { for (const i of [0, 1]) this.send(i, typeof fn === 'function' ? fn(i) : fn); }

  snapshot(i) {
    const o = 1 - i;
    return {
      t: 'room',
      code: this.code,
      you: i,
      phase: this.phase,
      players: this.players.map((p) => (p ? { name: p.name, connected: p.connected, bot: !!p.bot } : null)),
      fighters: this.fighters,
      ready: this.ready,
      rematch: this.rematch,
      round: this.round, beat: this.beat,
      state: this.state,
      locked: this.picks ? [!!this.picks[0], !!this.picks[1]] : [false, false],
      myPick: this.picks ? this.picks[i] : null,
      deadline: this.deadline ? this.deadline - Date.now() : 0,
      result: this.result || null,
      opp: o,
    };
  }
  sync() { this.broadcast((i) => this.snapshot(i)); }

  join(ws, name, bot = false) {
    const i = this.players[0] ? 1 : 0;
    const p = { ws, name: (name || (bot ? 'CPU' : `PLAYER ${i + 1}`)).slice(0, 10).toUpperCase(), token: token(), connected: true, bot };
    this.players[i] = p;
    if (ws) { ws.room = this; ws.slot = i; }
    return { i, p };
  }

  full() { return this.players[0] && this.players[1]; }

  toSelect() {
    this.clearTimers();
    this.phase = 'select';
    this.ready = [false, false];
    this.rematch = [false, false];
    this.result = null;
    for (const i of [0, 1]) if (this.players[i]?.bot) this.botSelect(i);
    this.sync();
  }

  botSelect(i) {
    this.later(700, () => {
      const other = this.fighters[1 - i];
      const pool = FIGHTER_IDS.filter((f) => f !== other);
      this.fighters[i] = pool[(Math.random() * pool.length) | 0];
      this.ready[i] = true;
      this.sync();
      this.checkStart();
    });
  }

  checkStart() {
    if (this.phase === 'select' && this.ready[0] && this.ready[1]) this.startMatch();
  }

  startMatch() {
    this.clearTimers();
    this.state = [newFighterState(), newFighterState()];
    if (process.env.HAYMAKER_START_HP) for (const s of this.state) s.hp = +process.env.HAYMAKER_START_HP;
    this.round = 1;
    this.beat = 0;
    this.result = null;
    this.phase = 'intro';
    this.sync();
    this.later(4200, () => this.roundIntro());
  }

  roundIntro() {
    this.phase = 'round';
    this.sync();
    this.later(2600, () => this.startPick());
  }

  startPick() {
    if (this.players.some((p) => !p || (!p.connected && !p.bot))) {
      this.phase = 'paused';
      this.sync();
      return;
    }
    this.phase = 'pick';
    this.picks = [null, null];
    // A stunned fighter has no choice to make this beat.
    for (const i of [0, 1]) if (this.state[i].stunned) this.picks[i] = 'STUNNED';
    this.deadline = Date.now() + TIMING.pickMs;
    this.sync();
    for (const i of [0, 1]) {
      if (this.players[i].bot && !this.picks[i]) {
        this.later(500 + Math.random() * 1600, () => this.pick(i, botPick(this.state[i], this.state[1 - i])));
      }
    }
    if (this.picks[0] && this.picks[1]) this.later(900, () => this.resolve());
    else this.pickTimer = this.later(TIMING.pickMs + 150, () => this.resolve());
  }

  pick(i, action) {
    if (this.phase !== 'pick' || this.picks[i] === 'STUNNED') return;
    if (!PICKABLE.includes(action) || !allowed(this.state[i], action)) return;
    const first = !this.picks[i];
    this.picks[i] = action;
    if (first) this.broadcast((k) => ({ t: 'locked', who: i === k ? 'you' : 'opp' }));
    if (this.picks[0] && this.picks[1]) {
      // Both locked: short grace period so a last-second change still counts.
      if (this.pickTimer) { clearTimeout(this.pickTimer); this.timers.delete(this.pickTimer); }
      this.pickTimer = this.later(350, () => this.resolve());
    }
  }

  resolve() {
    if (this.phase !== 'pick') return;
    this.clearTimers();
    const { states, result, acts } = resolveBeat(this.state, this.picks);
    this.state = states;
    this.phase = 'resolve';
    this.deadline = 0;
    this.lastResult = { acts, result, beat: this.beat, round: this.round };
    this.broadcast((i) => ({ t: 'result', acts, result, state: this.state, you: i }));
    this.sync();
    this.later(TIMING.resolveMs, () => this.afterResolve(result));
  }

  afterResolve(result) {
    const down = [0, 1].filter((i) => result[i].down);
    this.beat += 1;
    if (down.length) return this.knockdown(down);
    this.nextBeat();
  }

  nextBeat() {
    if (this.beat >= TIMING.beatsPerRound) return this.endRound();
    this.startPick();
  }

  knockdown(down) {
    this.phase = 'down';
    for (const i of down) {
      this.state[i].knockdowns += 1;
      this.state[i].totalKnockdowns += 1;
    }
    const tko = down.filter((i) => this.state[i].knockdowns >= TIMING.knockdownsForTKO);
    if (tko.length) {
      this.sync();
      this.broadcast({ t: 'knockdown', down, tko: true });
      return this.later(3200, () => this.finish(tko.length === 2 ? null : 1 - tko[0], 'TKO'));
    }
    this.down = down;
    this.mash = [0, 0];
    this.need = down.map((i) => mashNeeded(this.state[i].totalKnockdowns - 1));
    this.up = [!down.includes(0), !down.includes(1)];
    this.count = 0;
    this.sync();
    this.broadcast((k) => ({ t: 'knockdown', down, need: this.need[down.indexOf(k)] ?? 0 }));
    for (const i of down) if (this.players[i].bot) this.botMash(i);
    this.later(1400, () => this.tickCount());
  }

  botMash(i) {
    const tick = () => {
      if (this.phase !== 'down' || this.up[i]) return;
      if (Math.random() < 0.7) this.onMash(i);
      this.later(110, tick);
    };
    this.later(600, tick);
  }

  onMash(i) {
    if (this.phase !== 'down' || this.up[i] || !this.down.includes(i)) return;
    const now = Date.now();
    const p = this.players[i];
    if (p.lastMash && now - p.lastMash < 45) return; // ~20 presses/s cap
    p.lastMash = now;
    this.mash[i] += 1;
    const need = this.need[this.down.indexOf(i)];
    this.broadcast({ t: 'mash', who: i, progress: Math.min(1, this.mash[i] / need) });
    if (this.mash[i] >= need && this.count >= 3) this.getUp(i);
  }

  getUp(i) {
    this.up[i] = true;
    const s = this.state[i];
    s.hp = getUpHealth(s.knockdowns);
    s.stamina = CONFIG.maxStamina;
    s.stunned = s.loaded = s.counter = s.guardBroken = false;
    this.broadcast({ t: 'getup', who: i, count: this.count, hp: s.hp });
    if (this.up[0] && this.up[1]) {
      this.clearTimers();
      this.later(1600, () => { this.sync(); this.nextBeat(); });
    }
  }

  tickCount() {
    if (this.phase !== 'down' || (this.up[0] && this.up[1])) return;
    this.count += 1;
    this.broadcast({ t: 'count', n: this.count });
    for (const i of this.down) {
      const need = this.need[this.down.indexOf(i)];
      if (!this.up[i] && this.mash[i] >= need && this.count >= 3) this.getUp(i);
    }
    if (this.up[0] && this.up[1]) return;
    if (this.count >= 10) {
      const out = this.down.filter((i) => !this.up[i]);
      return this.later(1400, () => this.finish(out.length === 2 ? null : 1 - out[0], 'KO'));
    }
    this.later(TIMING.countMs, () => this.tickCount());
  }

  endRound() {
    if (this.round >= TIMING.rounds) return this.decision();
    this.phase = 'break';
    this.round += 1;
    this.beat = 0;
    for (const s of this.state) {
      s.hp = Math.min(CONFIG.maxHealth, s.hp + 20);
      s.stamina = CONFIG.maxStamina;
      s.knockdowns = 0;
      s.stunned = s.loaded = s.counter = s.guardBroken = false;
    }
    this.sync();
    this.later(TIMING.roundBreakMs, () => this.roundIntro());
  }

  decision() {
    const score = (i) => this.state[i].points + this.state[1 - i].totalKnockdowns * 20;
    const a = score(0), b = score(1);
    this.finish(a === b ? null : a > b ? 0 : 1, 'DECISION', [a, b]);
  }

  finish(winner, method, scores) {
    this.clearTimers();
    this.phase = 'over';
    this.result = { winner, method, scores: scores || null };
    this.sync();
    for (const i of [0, 1]) if (this.players[i]?.bot) this.later(2500, () => { this.rematch[i] = true; this.sync(); });
  }

  onRematch(i) {
    if (this.phase !== 'over') return;
    this.rematch[i] = true;
    if (this.rematch[0] && this.rematch[1]) this.toSelect();
    else this.sync();
  }

  leave(i) {
    const p = this.players[i];
    if (!p) return;
    p.connected = false;
    p.ws = null;
    this.broadcast({ t: 'presence', who: i, connected: false });
    this.sync();
    this.later(90_000, () => {
      if (!this.players[i] || this.players[i].connected) return;
      if (['lobby', 'select'].includes(this.phase) || this.phase === 'over') return this.destroy();
      this.finish(1 - i, 'FORFEIT');
      this.later(30_000, () => this.destroy());
    });
  }

  destroy() {
    this.clearTimers();
    rooms.delete(this.code);
  }
}

// ---------------------------------------------------------------------------
// Socket handling

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const room = ws.room;
    const i = ws.slot;
    switch (m.t) {
      case 'create': {
        const r = new Room(makeCode());
        rooms.set(r.code, r);
        const { i: slot, p } = r.join(ws, m.name);
        ws.send(JSON.stringify({ t: 'joined', code: r.code, you: slot, token: p.token }));
        if (m.cpu) {
          r.join(null, 'CPU', true);
          r.toSelect();
        } else r.sync();
        break;
      }
      case 'join': {
        const code = String(m.code || '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) return ws.send(JSON.stringify({ t: 'error', msg: 'NO MATCH WITH THAT CODE' }));
        if (r.full()) return ws.send(JSON.stringify({ t: 'error', msg: 'THAT MATCH IS FULL' }));
        const { i: slot, p } = r.join(ws, m.name);
        ws.send(JSON.stringify({ t: 'joined', code: r.code, you: slot, token: p.token }));
        r.toSelect();
        break;
      }
      case 'resume': {
        const r = rooms.get(String(m.code || '').toUpperCase());
        const slot = r?.players.findIndex((p) => p && p.token === m.token);
        if (!r || slot < 0) return ws.send(JSON.stringify({ t: 'resume_failed' }));
        const p = r.players[slot];
        if (p.ws && p.ws !== ws) try { p.ws.close(); } catch {}
        p.ws = ws; p.connected = true;
        ws.room = r; ws.slot = slot;
        ws.send(JSON.stringify({ t: 'joined', code: r.code, you: slot, token: p.token, resumed: true }));
        r.broadcast({ t: 'presence', who: slot, connected: true });
        if (r.phase === 'paused') r.startPick();
        else r.sync();
        break;
      }
      case 'fighter':
        if (room && room.phase === 'select' && !room.ready[i] && ['rico', 'bruno', 'volt', 'duke'].includes(m.id)) {
          room.fighters[i] = m.id;
          room.sync();
        }
        break;
      case 'ready':
        if (room && room.phase === 'select' && room.fighters[i]) {
          room.ready[i] = !!m.v;
          room.sync();
          room.checkStart();
        }
        break;
      case 'pick': room?.pick(i, m.a); break;
      case 'mash': room?.onMash(i); break;
      case 'rematch': room?.onRematch(i); break;
      case 'leave':
        if (room) { room.leave(i); ws.room = null; }
        break;
      case 'ping': ws.send(JSON.stringify({ t: 'pong', at: m.at })); break;
    }
    if (ws.room) ws.room.touched = Date.now();
  });
  ws.on('close', () => { if (ws.room) ws.room.leave(ws.slot); });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const r of rooms.values()) if (now - r.touched > 60 * 60 * 1000) r.destroy();
}, 20_000);

server.listen(PORT, () => console.log(`Haymaker running on http://localhost:${PORT}`));
