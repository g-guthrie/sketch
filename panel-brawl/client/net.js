// Transports. Both expose: connect(), send(msg), update(now), onmessage, close().
//  - LocalTransport runs the whole authoritative room inside the browser (solo).
//  - NetTransport talks to the Node server over a WebSocket (online).

import { RoomCore } from '../shared/room.js';
import { TICK_RATE } from '../shared/constants.js';

const TICK_MS = 1000 / TICK_RATE;

export class LocalTransport {
  constructor(opts) {
    this.room = new RoomCore({ code: 'SOLO', ...opts });
    this.inbox = [];
    this.outbox = [];
    this.lag = opts.lag || 0; // simulated round-trip ms, for netcode testing
    this.onmessage = null;
    this.acc = 0;
    this.last = performance.now();
    this.cid = 1;
    this.online = false;
    this.rtt = this.lag;
  }

  connect(name, hero) {
    this.room.join(this.cid, (m) => this.deliver(m), name, hero);
    return Promise.resolve();
  }

  deliver(m) {
    const msg = structuredClone(m);
    this.inbox.push({ at: this.lag ? performance.now() + this.lag / 2 : 0, msg });
  }

  send(msg) {
    if (msg.type !== 'input') return;
    if (this.lag) this.outbox.push({ at: performance.now() + this.lag / 2, msg });
    else this.room.input(this.cid, msg.cmds);
  }

  // With no simulated lag the room runs in lockstep with the client's fixed
  // tick (main.js calls step() right after each input), so solo play has zero
  // input latency. With ?lag=N it free-runs on its own clock like a server.
  get lockstep() { return !this.lag; }

  step() {
    this.room.tick();
  }

  update(now) {
    while (this.outbox.length && this.outbox[0].at <= now) this.room.input(this.cid, this.outbox.shift().msg.cmds);
    if (!this.lockstep) {
      this.acc += now - this.last;
      this.last = now;
      if (this.acc > 250) this.acc = TICK_MS; // tab was hidden
      while (this.acc >= TICK_MS) {
        this.room.tick();
        this.acc -= TICK_MS;
      }
    }
    while (this.inbox.length && this.inbox[0].at <= now) {
      const { msg } = this.inbox.shift();
      if (this.onmessage) this.onmessage(msg);
    }
  }

  close() {}
}

export class NetTransport {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.onmessage = null;
    this.onclose = null;
    this.online = true;
    this.rtt = 80;
    this.pingT = 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Could not reach the server.'));
      ws.onclose = () => { if (this.onclose) this.onclose(); };
      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.type === 'pong') {
          const r = performance.now() - msg.t;
          this.rtt = this.rtt * 0.8 + r * 0.2;
          return;
        }
        if (this.onmessage) this.onmessage(msg);
      };
    });
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  get lockstep() { return false; }

  update(now) {
    if (now - this.pingT > 1000) {
      this.pingT = now;
      this.send({ type: 'ping', t: now });
    }
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

export function serverUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}
