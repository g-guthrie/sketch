// PANEL BRAWL client entry: menus, transports and the main loop.

import { ClientWorld } from './world.js';
import { Renderer } from './render/renderer.js';
import { FX } from './render/fx.js';
import { HUD } from './render/hud.js';
import { Input } from './input.js';
import { TouchControls } from './touch.js';
import { LocalTransport, NetTransport, serverUrl } from './net.js';
import { GameAudio } from './audio.js';
import { HEROES, HERO_KEYS } from '../shared/themes.js';
import { drawPortrait, makeAnim } from './render/characters.js';
import { DT } from '../shared/constants.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
// storage can be unavailable (private windows, sandboxed frames); never let it break the menu
const setUrl = (u) => { try { history.replaceState(null, '', u); } catch { /* sandboxed frame */ } };
const store = {
  get(k) { try { return store.get(k); } catch { return null; } },
  set(k, v) { try { store.set(k, v); } catch { /* ignore */ } },
};

const canvas = $('#game');
const fx = new FX();
const hud = new HUD();
const audio = new GameAudio();
const world = new ClientWorld({ fx, audio, hud });
const renderer = new Renderer(canvas, world, fx, hud);
const input = new Input(canvas);
const touch = new TouchControls(document.body, () => setPaused(!paused));
input.touch = touch;

let transport = null;
let running = false;
let paused = false;
let hero = store.get('pb.hero') || HERO_KEYS[0];
if (!HEROES[hero]) hero = HERO_KEYS[0];

world.onLevel = (msg, prev) => {
  renderer.onLevel(msg, prev);
  audio.music(msg.comic.theme);
  audio.play('pageTurn');
  hud.hintT = msg.transition === 'cover' ? 12 : hud.hintT;
  $('#loading').classList.add('hidden');
};
world.onError = (m) => {
  showError(m);
  leave();
};

// ------------------------------------------------------------------- menu

const nameInput = $('#name');
nameInput.value = store.get('pb.name') || randomName();
$('#theme').value = params.get('theme') || store.get('pb.theme') || '';
if (params.get('room')) $('#code').value = params.get('room').toUpperCase();

function randomName() {
  const a = ['CAPTAIN', 'DOCTOR', 'MIGHTY', 'KID', 'AGENT', 'THE AMAZING', 'MISTER', 'LADY'];
  const b = ['KAPOW', 'SPLAT', 'INKWELL', 'BLAMMO', 'ZAP', 'GUTTER', 'SMASH', 'HALFTONE'];
  return (a[Math.floor(Math.random() * a.length)] + ' ' + b[Math.floor(Math.random() * b.length)]).slice(0, 14);
}

const heroBox = $('#heroes');
const heroAnims = new Map();
for (const key of HERO_KEYS) {
  const card = document.createElement('button');
  card.className = 'hero-card' + (key === hero ? ' selected' : '');
  card.dataset.hero = key;
  card.title = HEROES[key].tag;
  const c = document.createElement('canvas');
  c.width = 180;
  c.height = 180;
  card.appendChild(c);
  const n = document.createElement('div');
  n.className = 'hn';
  n.textContent = HEROES[key].name;
  card.appendChild(n);
  heroBox.appendChild(card);
  heroAnims.set(key, { canvas: c, anim: makeAnim(HERO_KEYS.indexOf(key) + 1) });
  card.addEventListener('click', () => {
    hero = key;
    store.set('pb.hero', key);
    for (const el of heroBox.children) el.classList.toggle('selected', el.dataset.hero === key);
    audio.unlock();
    audio.play('uiClick');
  });
  card.addEventListener('mouseenter', () => audio.play('uiHover', { vol: 0.4 }));
}

function drawHeroCards(dt) {
  // Each card is a little comic panel: paper, a sunburst in the hero's colours,
  // a halftone fade and the heroic bust. Rendered at device resolution.
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const hexA = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  for (const [key, h] of heroAnims) {
    const c = h.canvas;
    const look = HEROES[key].look;
    const sel = key === hero;
    const px = Math.max(180, Math.round((c.clientWidth || 180) * dpr));
    if (c.width !== px) { c.width = px; c.height = px; }
    const g = c.getContext('2d');
    g.setTransform(px / 180, 0, 0, px / 180, 0, 0);
    const accent = look.suit2 && look.suit2 !== '#1b1b1b' ? look.suit2 : look.cape || look.suit;
    g.fillStyle = sel ? '#ffe14a' : '#fff4d6';
    g.fillRect(0, 0, 180, 180);
    // sunburst behind the head
    g.save();
    g.translate(92, 62);
    g.rotate(h.anim.t * (sel ? 0.12 : 0.04));
    g.fillStyle = sel ? 'rgba(255,255,255,0.6)' : hexA(accent, 0.13);
    g.beginPath();
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      g.moveTo(0, 0);
      g.arc(0, 0, 190, a, a + Math.PI / 18);
      g.closePath();
    }
    g.fill();
    g.restore();
    // halftone fade rising from the bottom in the hero's suit colour
    g.fillStyle = hexA(look.suit, sel ? 0.4 : 0.28);
    g.beginPath();
    for (let y = 60, row = 0; y <= 186; y += 7, row++) {
      const r = ((y - 60) / 126) * 3.4;
      if (r < 0.3) continue;
      for (let x = row % 2 ? 3.5 : 0; x <= 184; x += 7) { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); }
    }
    g.fill();
    h.anim.t += dt;
    drawPortrait(g, look, 90, 99, 78, { anim: h.anim });
    // inner panel keyline
    g.strokeStyle = 'rgba(20,20,20,0.9)';
    g.lineWidth = 2;
    g.strokeRect(5, 5, 170, 170);
  }
}

const onlinePossible = location.protocol.startsWith('http') && !params.has('offline') && !window.PB_STATIC;
if (!onlinePossible) {
  for (const el of document.querySelectorAll('.online .btn, .online input')) el.disabled = true;
  $('#online-note').textContent = 'Online rooms need the game server. Run "npm start" in the panel-brawl folder, then open http://localhost:3000.';
} else {
  $('#online-note').textContent = 'Host a room, then send friends the 4-letter code (or the link).';
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  audio.unlock();
  audio.play('uiClick');
  const a = b.dataset.action;
  const common = { name: nameInput.value.trim() || randomName(), hero, theme: $('#theme').value || undefined };
  store.set('pb.name', common.name);
  store.set('pb.theme', $('#theme').value);
  const chaos = $('#chaos').checked;
  if (a === 'solo-story') start({ ...common, local: true, mode: 'story' });
  else if (a === 'solo-brawl') start({ ...common, local: true, mode: 'brawl', chaos, botFill: 6 });
  else if (a === 'host-story') start({ ...common, online: 'create', mode: 'story' });
  else if (a === 'host-brawl') start({ ...common, online: 'create', mode: 'brawl', chaos, botFill: 4 });
  else if (a === 'join') {
    const code = $('#code').value.trim().toUpperCase();
    if (code.length !== 4) return showError('Room codes are 4 letters.');
    start({ ...common, online: 'join', code });
  } else if (a === 'resume') setPaused(false);
  else if (a === 'leave') leave();
  else if (a === 'mute') toggleMute();
});

function showError(m) {
  $('#error').textContent = m || '';
}

// ------------------------------------------------------------------ game

async function start(opts) {
  showError('');
  $('#menu').classList.add('hidden');
  $('#loading').classList.remove('hidden');
  world.reset();
  fx.clear();
  try {
    await document.fonts.load('40px Bangers').catch(() => {});
    if (opts.local) {
      transport = new LocalTransport({
        mode: opts.mode, chaos: !!opts.chaos, botFill: opts.botFill || 0, theme: opts.theme,
        seed: params.get('seed') ? Number(params.get('seed')) : undefined,
        lag: Number(params.get('lag')) || 0,
        startSpread: Number(params.get('spread')) || 0,
      });
      world.interpTicks = transport.lag ? 6 : 4;
      transport.onmessage = (m) => world.handle(m);
      await transport.connect(opts.name, opts.hero);
    } else {
      transport = new NetTransport(serverUrl());
      transport.onmessage = (m) => world.handle(m);
      transport.onclose = () => {
        if (running) {
          showError('Lost connection to the server.');
          leave();
        }
      };
      await transport.connect();
      world.interpTicks = 6;
      if (opts.online === 'create') transport.send({ type: 'create', mode: opts.mode, chaos: !!opts.chaos, botFill: opts.botFill || 0, name: opts.name, hero: opts.hero, theme: opts.theme });
      else transport.send({ type: 'join', code: opts.code, name: opts.name, hero: opts.hero });
    }
    running = true;
    setPaused(false);
    if (opts.online === 'create') {
      const wait = setInterval(() => {
        if (world.code) {
          clearInterval(wait);
          setUrl(`?room=${world.code}`);
        }
      }, 200);
    }
  } catch (e) {
    console.error(e);
    showError(e.message || String(e));
    leave();
  }
}

function leave() {
  running = false;
  if (transport) transport.close();
  transport = null;
  world.reset();
  fx.clear();
  audio.music(null);
  $('#pause').classList.add('hidden');
  $('#loading').classList.add('hidden');
  $('#menu').classList.remove('hidden');
  touch.show(false);
  document.body.classList.remove('playing');
  canvas.style.cursor = 'default';
  if (params.get('room') == null && !window.PB_STATIC) setUrl(location.pathname);
}

function setPaused(p) {
  paused = p;
  document.body.classList.toggle('playing', running);
  touch.show(running && !p);
  $('#pause').classList.toggle('hidden', !p);
  $('#pause-code').textContent = world.code && world.code !== 'SOLO' ? `ROOM CODE: ${world.code} — share it with friends!` : 'SOLO GAME';
  input.enabled = !p;
  canvas.style.cursor = p ? 'default' : 'none';
}

function toggleMute() {
  audio.setMuted(!audio.muted);
  document.querySelector('[data-action="mute"]').textContent = `SOUND: ${audio.muted ? 'OFF' : 'ON'}`;
}

function pickPerk(key) {
  if (!transport || !key) return;
  transport.send({ type: 'pick', perk: key });
  audio.play('uiClick');
}

// Mail-order ad page: click an ad (or press its number) to clip the coupon.
addEventListener('pointerdown', (e) => {
  if (!running || world.phase !== 'ads' || !hud.adRects.length) return;
  const x = e.clientX * renderer.cam.dpr, y = e.clientY * renderer.cam.dpr;
  const hit = hud.adRects.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  if (hit) pickPerk(hit.key);
}, { capture: true });

input.onKey = (code, down) => {
  if (!running) return;
  if (code === 'Tab') hud.showScores = down;
  if (!down) return;
  if (world.phase === 'ads' && world.ads && /^Digit[1-5]$/.test(code)) {
    const key = world.ads.o[Number(code.slice(5)) - 1];
    const me = world.meState;
    if (key && me && me.picks > 0 && !(me.perks || []).includes(key)) pickPerk(key);
  }
  if (code === 'Escape') setPaused(!paused);
  if (code === 'KeyM') toggleMute();
};

// ------------------------------------------------------------------- loop

let last = performance.now();
let acc = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const localPaused = paused && transport instanceof LocalTransport;
  if (transport && !localPaused) transport.update(now);
  else if (transport) transport.last = now;
  if (transport && transport.lockstep && !world.level && !localPaused) transport.step();
  if (running && world.level && !localPaused) {
    world.aim = renderer.aimFrom(input);
    acc += dt;
    const cmds = [];
    let n = 0;
    while (acc >= DT && n < 6) {
      acc -= DT;
      n++;
      const raw = paused ? { mx: 0 } : input.sample();
      const cmd = world.localTick(raw);
      if (transport.lockstep) {
        if (cmd) transport.send({ type: 'input', cmds: [cmd] });
        transport.step();
        transport.update(now);
      } else if (cmd) cmds.push(cmd);
    }
    if (n === 6) acc = 0;
    if (cmds.length && transport) transport.send({ type: 'input', cmds });
  }
  if (!localPaused) {
    world.update(dt);
    fx.update(dt);
    hud.update(dt);
  }
  audio.setListener(renderer.cam.x, renderer.cam.y, renderer.cam.zoom);
  if (running) audio.setIntensity(world.intensity || 0);
  hud.compact = touch.active;
  if (running && !paused) canvas.style.cursor = world.phase === 'ads' ? 'pointer' : 'none';
  if (running) renderer.frame(localPaused ? 0 : dt, input, audio);
  else {
    const ctx = renderer.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1e120b';
    ctx.fillRect(0, 0, renderer.W, renderer.H);
    drawHeroCards(dt);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// dev hooks: ?solo=story|brawl auto-starts (handy for screenshots / testing)
if (params.get('solo')) {
  const mode = params.get('solo') === 'brawl' ? 'brawl' : 'story';
  start({ name: nameInput.value || 'TESTER', hero, theme: params.get('theme') || undefined, local: true, mode, chaos: params.has('chaos'), botFill: params.has('bots') ? Number(params.get('bots')) || 0 : mode === 'brawl' ? 6 : 0 });
}
window.__pb = { world, renderer, fx, hud, audio, get transport() { return transport; } };
