// Synthesized arcade sound effects and a small chiptune loop.

let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('hm_mute') === '1'; } catch {}

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = muted ? 0 : 0.8;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ac.destination);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  musicBus = ac.createGain(); musicBus.gain.value = 0.28; musicBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('hm_mute', muted ? '1' : '0'); } catch {}
  if (master) master.gain.value = muted ? 0 : 0.8;
  return muted;
}
export const isMuted = () => muted;

function noise(t, dur, { type = 'lowpass', f0 = 1200, f1 = 200, q = 0.8, vol = 0.6, bus = sfxBus } = {}) {
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 0.5, dur + 0.05);
}

function tone(t, dur, { type = 'square', f0 = 440, f1 = null, vol = 0.2, attack = 0.005, bus = sfxBus } = {}) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SFX = {
  hit(t) {
    noise(t, 0.12, { f0: 2400, f1: 300, vol: 0.9 });
    tone(t, 0.14, { type: 'sine', f0: 180, f1: 50, vol: 0.9 });
  },
  heavy(t) {
    noise(t, 0.3, { f0: 3000, f1: 120, vol: 1.1 });
    tone(t, 0.3, { type: 'sine', f0: 140, f1: 34, vol: 1.1 });
    tone(t, 0.08, { type: 'square', f0: 90, f1: 40, vol: 0.4 });
  },
  body(t) {
    noise(t, 0.16, { f0: 900, f1: 120, vol: 0.9 });
    tone(t, 0.18, { type: 'sine', f0: 110, f1: 40, vol: 1 });
  },
  block(t) {
    noise(t, 0.07, { type: 'bandpass', f0: 1400, f1: 900, q: 2, vol: 0.7 });
    tone(t, 0.06, { type: 'triangle', f0: 320, f1: 200, vol: 0.4 });
  },
  whoosh(t) { noise(t, 0.22, { type: 'bandpass', f0: 600, f1: 2800, q: 1.2, vol: 0.45 }); },
  swing(t) { noise(t, 0.12, { type: 'bandpass', f0: 1800, f1: 700, q: 1.5, vol: 0.3 }); },
  bell(t) {
    for (const [f, v] of [[830, 0.35], [1660, 0.14], [2490, 0.09], [620, 0.12]]) tone(t, 1.6, { type: 'sine', f0: f, vol: v, attack: 0.002 });
    for (const [f, v] of [[830, 0.3], [1660, 0.1]]) tone(t + 0.22, 1.4, { type: 'sine', f0: f, vol: v, attack: 0.002 });
  },
  count(t) { tone(t, 0.12, { type: 'square', f0: 660, vol: 0.18 }); tone(t, 0.12, { type: 'square', f0: 990, vol: 0.08 }); },
  tick(t) { tone(t, 0.04, { type: 'square', f0: 1200, vol: 0.08 }); },
  move(t) { tone(t, 0.05, { type: 'square', f0: 880, vol: 0.08 }); },
  select(t) { tone(t, 0.07, { type: 'square', f0: 660, vol: 0.14 }); tone(t + 0.06, 0.1, { type: 'square', f0: 1320, vol: 0.14 }); },
  lock(t) { tone(t, 0.06, { type: 'square', f0: 523, vol: 0.14 }); tone(t + 0.05, 0.06, { type: 'square', f0: 784, vol: 0.14 }); tone(t + 0.1, 0.12, { type: 'square', f0: 1047, vol: 0.14 }); },
  oppLock(t) { tone(t, 0.08, { type: 'triangle', f0: 392, vol: 0.2 }); },
  counter(t) { for (let i = 0; i < 4; i++) tone(t + i * 0.05, 0.08, { type: 'square', f0: 784 * Math.pow(1.26, i), vol: 0.12 }); },
  star(t) { for (let i = 0; i < 6; i++) tone(t + i * 0.04, 0.12, { type: 'triangle', f0: 1046 * Math.pow(1.12, i), vol: 0.14 }); },
  windup(t) { tone(t, 0.35, { type: 'sawtooth', f0: 110, f1: 440, vol: 0.12 }); },
  down(t) {
    noise(t, 0.5, { f0: 800, f1: 60, vol: 1.1 });
    tone(t, 0.5, { type: 'sine', f0: 90, f1: 30, vol: 1.1 });
  },
  cheer(t, big = false) { noise(t, big ? 2.2 : 1.2, { type: 'bandpass', f0: 1100, f1: 1500, q: 0.6, vol: big ? 0.5 : 0.28 }); },
  error(t) { tone(t, 0.12, { type: 'square', f0: 180, vol: 0.14 }); },
  ko(t) {
    for (const [f, d] of [[392, 0], [523, 0.12], [659, 0.24], [784, 0.36]]) tone(t + d, 0.35, { type: 'square', f0: f, vol: 0.14 });
  },
};

export function sfx(name, delay = 0, ...args) {
  if (!ac || muted) return;
  const f = SFX[name];
  if (f) f(ac.currentTime + delay, ...args);
}

// ---------------------------------------------------------------------------
// Music: a looping arcade theme built from a tiny pattern table.

let musicTimer = null, musicStep = 0, musicNext = 0, currentSong = null;
const N = (s) => (s ? 440 * Math.pow(2, (s - 69) / 12) : 0);

const SONGS = {
  title: {
    bpm: 150,
    lead: [76, 0, 76, 79, 0, 76, 74, 72, 74, 0, 74, 76, 0, 74, 72, 71, 72, 0, 72, 76, 0, 79, 81, 79, 76, 0, 74, 72, 74, 0, 0, 0,
      76, 0, 76, 79, 0, 76, 74, 72, 74, 0, 74, 76, 0, 74, 72, 71, 72, 0, 76, 79, 84, 83, 81, 79, 81, 0, 83, 0, 84, 0, 0, 0],
    bass: [45, 45, 57, 45, 45, 57, 45, 57, 43, 43, 55, 43, 43, 55, 43, 55, 41, 41, 53, 41, 41, 53, 41, 53, 43, 43, 55, 43, 47, 47, 50, 55],
    drum: 'k.h.s.h.k.k.s.h.k.h.s.h.k.khs.hh',
  },
  fight: {
    bpm: 164,
    lead: [69, 0, 72, 0, 74, 0, 72, 69, 0, 67, 69, 0, 0, 0, 0, 0, 69, 0, 72, 0, 74, 0, 76, 77, 76, 74, 72, 0, 0, 0, 0, 0,
      69, 0, 72, 0, 74, 0, 72, 69, 0, 67, 69, 0, 64, 0, 67, 0, 69, 0, 0, 72, 0, 0, 71, 0, 0, 67, 0, 0, 69, 0, 0, 0],
    bass: [33, 45, 33, 45, 33, 45, 33, 45, 31, 43, 31, 43, 31, 43, 31, 43, 29, 41, 29, 41, 29, 41, 29, 41, 31, 43, 31, 43, 28, 40, 31, 43],
    drum: 'k.hsk.hsk.hsk.hsk.hsk.hsk.hskshs',
  },
};

function scheduleMusic() {
  if (!ac || !currentSong) return;
  const song = SONGS[currentSong];
  const step = 60 / song.bpm / 2;
  while (musicNext < ac.currentTime + 0.25) {
    const t = musicNext;
    const i = musicStep;
    const lead = song.lead[i % song.lead.length];
    if (lead) tone(t, step * 0.9, { type: 'square', f0: N(lead), vol: 0.1, bus: musicBus });
    const bass = song.bass[Math.floor(i / 2) % song.bass.length];
    if (i % 2 === 0 && bass) tone(t, step * 1.7, { type: 'triangle', f0: N(bass), vol: 0.35, bus: musicBus });
    const dr = song.drum[i % song.drum.length];
    if (dr === 'k') tone(t, 0.12, { type: 'sine', f0: 120, f1: 40, vol: 0.5, bus: musicBus });
    if (dr === 's') noise(t, 0.1, { type: 'highpass', f0: 1800, f1: 1500, vol: 0.25, bus: musicBus });
    if (dr === 'h') noise(t, 0.03, { type: 'highpass', f0: 7000, f1: 6000, vol: 0.12, bus: musicBus });
    musicStep++;
    musicNext += step;
  }
}

export function music(name) {
  if (!ac) return;
  if (currentSong === name) return;
  currentSong = name;
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  if (!name) return;
  musicStep = 0;
  musicNext = ac.currentTime + 0.05;
  musicTimer = setInterval(scheduleMusic, 60);
}
