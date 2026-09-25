// A room = one Game + the clients connected to it. Transport-agnostic:
// the Node server wraps it with WebSockets, solo play runs it in the browser.

import { Game } from './game.js';
import { SNAP_EVERY, MODES } from './constants.js';
import { HERO_KEYS } from './themes.js';

const BOT_NAMES = ['SCRIBBLE', 'SMUDGE', 'DOODLE', 'CROSSHATCH', 'BLOTTER', 'SKETCHY', 'HALFTONE', 'SQUIGGLE', 'INKBLOT'];

export class RoomCore {
  constructor({ code = 'SOLO', mode = MODES.STORY, chaos = false, botFill = 0, seed, theme, startSpread } = {}) {
    this.code = code;
    this.game = new Game({ mode, chaos, seed, theme, startSpread });
    this.clients = new Map();
    this.nextPid = 1;
    this.botFill = mode === MODES.BRAWL ? Math.max(0, Math.min(7, botFill | 0)) : 0;
    this.sentLevel = this.game.levelVersion;
    this.eventBuf = [];
    this.rosterDirty = false;
    this.emptySince = Date.now();
  }

  get size() { return this.clients.size; }

  join(cid, send, name, hero) {
    const pid = this.nextPid++;
    this.game.addPlayer(pid, name, hero);
    this.clients.set(cid, { cid, send, pid });
    send({ type: 'joined', code: this.code, you: pid, mode: this.game.mode, chaos: this.game.chaos });
    send({ type: 'roster', players: this.game.roster() });
    send({ type: 'level', ...this.game.levelData() });
    this.syncBots();
    this.rosterDirty = true;
    return pid;
  }

  leave(cid) {
    const c = this.clients.get(cid);
    if (!c) return;
    this.clients.delete(cid);
    this.game.removePlayer(c.pid);
    this.syncBots();
    this.rosterDirty = true;
    if (this.clients.size === 0) this.emptySince = Date.now();
  }

  input(cid, cmds) {
    const c = this.clients.get(cid);
    if (!c || !Array.isArray(cmds)) return;
    this.game.queueInput(c.pid, cmds.slice(0, 20));
  }

  syncBots() {
    const g = this.game;
    const bots = [...g.players.values()].filter((p) => p.bot);
    const humans = g.players.size - bots.length;
    const want = humans === 0 ? 0 : Math.max(0, this.botFill - humans);
    while (bots.length > want) {
      const b = bots.pop();
      g.removePlayer(b.id);
    }
    let n = bots.length;
    while (n < want) {
      const pid = this.nextPid++;
      const name = BOT_NAMES[(pid * 7) % BOT_NAMES.length];
      g.addPlayer(pid, name, HERO_KEYS[(pid * 5) % HERO_KEYS.length], true);
      n++;
    }
  }

  broadcast(msg) {
    for (const c of this.clients.values()) c.send(msg);
  }

  tick() {
    const g = this.game;
    g.step();
    if (g.events.length) {
      for (const e of g.events) this.eventBuf.push(e);
      g.events.length = 0;
    }
    if (g.levelVersion !== this.sentLevel) {
      this.sentLevel = g.levelVersion;
      this.broadcast({ type: 'level', ...g.levelData() });
    }
    if (this.rosterDirty) {
      this.rosterDirty = false;
      this.broadcast({ type: 'roster', players: g.roster() });
    }
    if (g.tick % SNAP_EVERY === 0) {
      const snap = g.snapshot();
      snap.ev = this.eventBuf;
      this.eventBuf = [];
      for (const c of this.clients.values()) {
        c.send({ type: 'snap', ...snap, me: g.meSnap(c.pid) });
      }
    }
  }
}
