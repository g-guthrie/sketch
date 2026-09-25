// PANEL BRAWL client entry: menus, transports and the main loop.

import { ClientWorld } from './world.js';
import { Renderer } from './render/renderer.js';
import { FX } from './render/fx.js';
import { HUD } from './render/hud.js';
import { Input } from './input.js';
import { LocalTransport, NetTransport, serverUrl } from './net.js';
import { GameAudio } from './audio.js';
import { HEROES, HERO_KEYS } from '../shared/themes.js';
import { drawPortrait, makeAnim } from './render/characters.js';
import { DT } from '../shared/constants.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

const canvas = $('#game');
const fx = new FX();
const hud = new HUD();
const audio = new GameAudio();
const world = new ClientWorld({ fx, audio, hud });
const renderer = new Renderer(canvas, world, fx, hud);
const input = new Input(canvas);

let transport = null;
let running = false;
let paused = false;
let hero = localStorage.getItem('pb.hero') || HERO_KEYS[0];
if (!HEROES[hero]) hero = HERO_KEYS[0];

world.onLevel = (msg, prev) => {
  renderer.onLevel(msg, prev);
  audio.music(msg.comic.theme);
  audio.play('pageTurn');
  hud.hintT = msg.transition === 'cover' ? 18 : hud.hintT;
  $('#loading').classList.add('hidden');
};
world.onError = (m) => {
  showError(m);
  leave();
};

// ------------------------------------------------------------------- menu

const nameInput = $('#name');
nameInput.value = localStorage.getItem('pb.name') || randomName();
$('#theme').value = params.get('theme') || localStorage.getItem('pb.theme') || '';
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
    localStorage.setItem('pb.hero', key);
    for (const el of heroBox.children) el.classList.toggle('selected', el.dataset.hero === key);
    audio.unlock();
    audio.play('uiClick');
  });
  card.addEventListener('mouseenter', () => audio.play('uiHover', { vol: 0.4 }));
}

function drawHeroCards(dt) {
  for (const [key, h] of heroAnims) {
    const g = h.canvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, 180, 180);
    g.fillStyle = key === hero ? '#ffe14a' : '#fff7dc';
    g.fillRect(0, 0, 180, 180);
    g.fillStyle = 'rgba(232,38,43,0.25)';
    for (let y = 0; y < 180; y += 9) for (let x = (y / 9) % 2 ? 4.5 : 0; x < 180; x += 9) {
      g.beginPath();
      g.arc(x, y, 2.2 * (y / 180), 0, Math.PI * 2);
      g.fill();
    }
    h.anim.t += dt;
    drawPortrait(g, HEROES[key].look, 88, 96, 74, { anim: h.anim });
  }
}

const onlinePossible = location.protocol.startsWith('http') && !params.has('offline');
if (!onlinePossible) {
  for (const b of document.querySelectorAll('.online .btn')) b.disabled = true;
  $('#online-note').textContent = 'Online play needs the game server: run "npm start" and open http://localhost:3000';
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
  localStorage.setItem('pb.name', common.name);
  localStorage.setItem('pb.theme', $('#theme').value);
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
          history.replaceState(null, '', `?room=${world.code}`);
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
  canvas.style.cursor = 'default';
  if (params.get('room') == null) history.replaceState(null, '', location.pathname);
}

function setPaused(p) {
  paused = p;
  $('#pause').classList.toggle('hidden', !p);
  $('#pause-code').textContent = world.code && world.code !== 'SOLO' ? `ROOM CODE: ${world.code} — share it with friends!` : 'SOLO GAME';
  input.enabled = !p;
  canvas.style.cursor = p ? 'default' : 'none';
}

function toggleMute() {
  audio.setMuted(!audio.muted);
  document.querySelector('[data-action="mute"]').textContent = `SOUND: ${audio.muted ? 'OFF' : 'ON'}`;
}

input.onKey = (code, down) => {
  if (!running) return;
  if (code === 'Tab') hud.showScores = down;
  if (!down) return;
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
  start({ name: nameInput.value || 'TESTER', hero, theme: params.get('theme') || undefined, local: true, mode, chaos: params.has('chaos'), botFill: Number(params.get('bots')) || (mode === 'brawl' ? 6 : 0) });
}
window.__pb = { world, renderer, fx, hud, audio, get transport() { return transport; } };
