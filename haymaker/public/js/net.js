// WebSocket client with automatic resume after a dropped connection.

const listeners = new Set();
let ws = null;
let queue = [];
let session = null; // { code, token }
let wantOpen = false;
let retry = 0;

export const net = {
  connected: false,
  room: null, // latest room snapshot
  you: 0,

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  send(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
    else { queue.push(msg); open(); }
  },

  create(name, cpu = false) { this.reset(); this.send({ t: 'create', name, cpu }); },
  join(code, name) { this.reset(); this.send({ t: 'join', code, name }); },
  leave() {
    if (session) this.send({ t: 'leave' });
    this.reset();
  },
  reset() {
    session = null;
    this.room = null;
    try { sessionStorage.removeItem('hm_session'); } catch {}
  },
  savedSession() {
    try { return JSON.parse(sessionStorage.getItem('hm_session') || 'null'); } catch { return null; }
  },
  resume(s) { session = s; this.send({ t: 'resume', code: s.code, token: s.token }); },
};

function emit(m) { for (const fn of listeners) fn(m); }

function open() {
  wantOpen = true;
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    net.connected = true;
    retry = 0;
    const q = queue;
    queue = [];
    // Re-attach to our seat before anything else after a reconnect.
    if (session && !q.some((m) => m.t === 'resume' || m.t === 'create' || m.t === 'join')) {
      ws.send(JSON.stringify({ t: 'resume', code: session.code, token: session.token }));
    }
    for (const m of q) ws.send(JSON.stringify(m));
    emit({ t: 'net', connected: true });
  };
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === 'joined') {
      session = { code: m.code, token: m.token };
      net.you = m.you;
      try { sessionStorage.setItem('hm_session', JSON.stringify(session)); } catch {}
    }
    if (m.t === 'room') { net.room = m; net.you = m.you; }
    if (m.t === 'resume_failed') { session = null; try { sessionStorage.removeItem('hm_session'); } catch {} }
    emit(m);
  };
  ws.onclose = () => {
    net.connected = false;
    emit({ t: 'net', connected: false });
    if (!wantOpen || !session) return;
    retry = Math.min(retry + 1, 6);
    setTimeout(open, 300 * retry);
  };
}

export function connect() { open(); }
