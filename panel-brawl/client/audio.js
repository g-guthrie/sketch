// PANEL BRAWL — procedural audio.
//
// There are no audio files: every sound is synthesized on the fly with the
// Web Audio API from a handful of primitives (noise buffers, oscillators with
// fast pitch envelopes, FM pairs, resonant filters, waveshaper drive and a
// tiny feedback-comb "room"). Each sound is a builder `fn(kit, t) => seconds`
// that only talks to a `Kit`, so the same builder can render into the live
// game context or into an OfflineAudioContext for analysis (see renderSound).
//
// Signal flow (live):
//   kit -> trim + soft knee -> voice gain -> [distance lowpass] -> panner -> sfx bus ─┐
//   music session -> music bus -> duck ───────────────────────────┤
//                                            master gain (vol/mute)
//                                 -> glue compressor -> limiter -> soft clip -> out

const EPS = 0.0001;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- tunables

const NEAR = 500; // world units at full volume (at gameplay zoom)
const FAR = 2500; // world units where important sounds bottom out
const FLOOR = 0.15; // gain floor for important sounds
const MAX_VOICES = 48; // global cap on simultaneous sfx voices
const MUSIC_LEVEL = 0.5; // music bus trim (music always sits under SFX)
const MASTER_TRIM = 0.7; // pre-compressor trim (Chrome's compressor adds makeup gain)
const LOOKAHEAD = 0.2; // music scheduler lookahead (seconds)
const TICK_MS = 25; // music scheduler wake-up interval

// ---------------------------------------------------------------- shared buffers / curves

const BANKS = new Map(); // sampleRate -> { white, pink, brown }

function getBank(ctx) {
  let bank = BANKS.get(ctx.sampleRate);
  if (!bank) {
    bank = makeBank(ctx);
    BANKS.set(ctx.sampleRate, bank);
  }
  return bank;
}

function makeBank(ctx) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 2);
  const white = ctx.createBuffer(1, len, sr);
  const pink = ctx.createBuffer(1, len, sr);
  const brown = ctx.createBuffer(1, len, sr);
  const w = white.getChannelData(0);
  const p = pink.getChannelData(0);
  const br = brown.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;
    // Paul Kellet's pink filter
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362;
    b6 = x * 0.115926;
    // leaky-integrated (brown / red) noise
    last = (last + 0.02 * x) / 1.02;
    br[i] = last;
  }
  seamless(p);
  seamless(br);
  normalize(p, 0.95);
  normalize(br, 0.95);
  return { white, pink, brown };
}

// remove DC + make the loop point continuous (brown noise would click otherwise)
function seamless(d) {
  const n = d.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += d[i];
  mean /= n;
  const step = d[n - 1] - d[0];
  for (let i = 0; i < n; i++) d[i] = d[i] - mean - step * (i / (n - 1) - 0.5);
}

function normalize(d, target) {
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const s = peak > 0 ? target / peak : 1;
  for (let i = 0; i < d.length; i++) d[i] *= s;
}

const CURVES = new Map();
// tanh drive, normalised so a full-scale input maps to +-1
function driveCurve(k) {
  const key = Math.round(k * 10);
  let c = CURVES.get(key);
  if (!c) {
    const n = 1024;
    c = new Float32Array(n);
    const norm = Math.tanh(k);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(k * x) / norm;
    }
    CURVES.set(key, c);
  }
  return c;
}

// Soft-knee clip curves. The input is pre-scaled by 0.5 so the curve covers
// +-2 of real signal: unity below `knee`, smooth tanh knee above, hard `ceil`.
const SOFTCLIPS = new Map();
function softClipCurve(knee = 0.85, ceil = 0.98) {
  const key = knee + ':' + ceil;
  let c = SOFTCLIPS.get(key);
  if (c) return c;
  const n = 4096, span = ceil - knee;
  c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = ((i / (n - 1)) * 2 - 1) * 2;
    const a = Math.abs(u);
    const y = a <= knee ? a : knee + span * Math.tanh((a - knee) / span);
    c[i] = Math.sign(u) * Math.min(y, ceil);
  }
  SOFTCLIPS.set(key, c);
  return c;
}

// Per-voice input: trim (def.vol) -> soft knee (unity < 0.75, ceiling 0.95).
// Keeps a single voice from ever exceeding full scale while leaving normal
// levels untouched; loud transients get a little welcome saturation.
function voiceInput(ctx, def, dest, clip = true) {
  const trim = ctx.createGain();
  if (!clip) {
    trim.gain.value = def.vol ?? 1;
    trim.connect(dest);
    return { input: trim, nodes: [trim] };
  }
  trim.gain.value = (def.vol ?? 1) * 0.5;
  const sh = ctx.createWaveShaper();
  sh.curve = softClipCurve(0.75, 0.95);
  sh.oversample = 'none';
  trim.connect(sh);
  sh.connect(dest);
  return { input: trim, nodes: [trim, sh] };
}

/** Build the master chain on any context. Returns its input buses. */
export function buildMaster(ctx, dest = ctx.destination) {
  const sfx = ctx.createGain();
  const music = ctx.createGain();
  const duck = ctx.createGain();
  const master = ctx.createGain();
  const trim = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  const lim = ctx.createDynamicsCompressor();
  const pre = ctx.createGain();
  const clip = ctx.createWaveShaper();
  music.gain.value = MUSIC_LEVEL * 0.6;
  trim.gain.value = MASTER_TRIM;
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.22;
  lim.threshold.value = -3;
  lim.knee.value = 0;
  lim.ratio.value = 20;
  lim.attack.value = 0.001;
  lim.release.value = 0.09;
  pre.gain.value = 0.5;
  clip.curve = softClipCurve(0.85, 0.98);
  clip.oversample = 'none'; // oversampling filters could overshoot the ceiling
  sfx.connect(master);
  music.connect(duck);
  duck.connect(master);
  master.connect(trim);
  trim.connect(comp);
  comp.connect(lim);
  lim.connect(pre);
  pre.connect(clip);
  clip.connect(dest);
  return { sfx, music, duck, master, comp, lim, clip, nodes: [sfx, music, duck, master, trim, comp, lim, pre, clip] };
}

// ---------------------------------------------------------------- Kit: synthesis primitives

// A Kit belongs to one voice. Every node it creates is tracked so the voice
// can be stopped early (voice stealing) and disconnected when it is done.
export class Kit {
  constructor(ctx, out, p = 1) {
    this.ctx = ctx;
    this.out = out;
    this.p = p; // pitch multiplier applied to every frequency
    this.bank = getBank(ctx);
    this.nodes = [];
    this.srcs = [];
    this.end = 0;
    this.tail = 0;
    this.nyq = ctx.sampleRate * 0.45;
  }

  hz(f) {
    return clamp(f * this.p, 1, this.nyq);
  }

  track(n) {
    this.nodes.push(n);
    return n;
  }

  _run(s, t, dur, offset) {
    this.srcs.push(s);
    this.nodes.push(s);
    if (offset === undefined) s.start(t);
    else s.start(t, offset);
    s.stop(t + dur);
    if (t + dur > this.end) this.end = t + dur;
    return s;
  }

  gain(v = 1, dest = this.out) {
    const g = this.track(this.ctx.createGain());
    g.gain.value = v;
    if (dest) g.connect(dest);
    return g;
  }

  // attack / hold / exponential-decay amplitude envelope
  env(t, peak, a, d, dest = this.out, hold = 0) {
    const g = this.gain(0, dest);
    const gp = g.gain;
    peak = Math.max(peak, EPS * 2);
    a = Math.max(a, 0.0005);
    gp.setValueAtTime(0, t);
    gp.linearRampToValueAtTime(peak, t + a);
    if (hold > 0) gp.setValueAtTime(peak, t + a + hold);
    gp.exponentialRampToValueAtTime(EPS, t + a + hold + Math.max(d, 0.002));
    return g;
  }

  filter(type, f, q = 0.7, dest = this.out) {
    const b = this.track(this.ctx.createBiquadFilter());
    b.type = type;
    b.frequency.value = this.hz(f);
    b.Q.value = q;
    if (dest) b.connect(dest);
    return b;
  }

  fsweep(param, t, f0, f1, dur, linear = false) {
    param.setValueAtTime(this.hz(f0), t);
    if (linear) param.linearRampToValueAtTime(this.hz(f1), t + dur);
    else param.exponentialRampToValueAtTime(this.hz(f1), t + dur);
  }

  shaper(k, dest = this.out, post = 1) {
    const w = this.track(this.ctx.createWaveShaper());
    w.curve = driveCurve(k);
    w.oversample = 'none';
    if (post !== 1) w.connect(this.gain(post, dest));
    else w.connect(dest);
    return w;
  }

  osc(type, f, t, dur, dest = this.out, raw = false) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(raw ? f : this.hz(f), t);
    if (dest) o.connect(dest);
    return this._run(o, t, dur);
  }

  noise(color, t, dur, dest = this.out, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.bank[color] || this.bank.white;
    s.loop = true;
    s.playbackRate.value = rate;
    if (dest) s.connect(dest);
    return this._run(s, t, dur, Math.random() * 1.8);
  }

  // low-frequency modulator added onto `param`
  lfo(t, len, rate, depth, param, { decay = 0, rise = 0, type = 'sine' } = {}) {
    const o = this.osc(type, rate, t, len, null, true);
    const g = this.gain(depth, param);
    if (rise) {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(depth, t + rise);
    } else if (decay) {
      g.gain.setValueAtTime(depth, t);
      g.gain.exponentialRampToValueAtTime(Math.max(Math.abs(depth) * 0.01, EPS), t + decay);
    }
    o.connect(g);
    return o;
  }

  // ---- instruments -------------------------------------------------------

  // pitched body: oscillator sweeping f0 -> f1 (kick / thump / boom)
  thump(t, { f0 = 150, f1 = 45, drop = 0.08, a = 0.002, d = 0.25, vol = 0.8, type = 'sine', drive = 0, dest = this.out } = {}) {
    let out = dest, peak = vol;
    if (drive) { out = this.shaper(drive, dest, vol); peak = 1; }
    const e = this.env(t, peak, a, d, out);
    const o = this.osc(type, f0, t, a + d + 0.02, e);
    o.frequency.exponentialRampToValueAtTime(this.hz(f1), t + drop);
    return o;
  }

  // filtered noise burst
  hiss(t, { color = 'white', type = 'bandpass', f = 1000, f1 = 0, glide = 0, q = 1, a = 0.001, hold = 0, d = 0.1, vol = 0.5, rate = 1, drive = 0, dest = this.out } = {}) {
    let out = dest, peak = vol;
    if (drive) { out = this.shaper(drive, dest, vol); peak = 1; }
    const e = this.env(t, peak, a, d, out, hold);
    let into = e;
    if (type) {
      const fl = this.filter(type, f, q, e);
      if (f1) this.fsweep(fl.frequency, t, f, f1, glide || a + hold + d);
      into = fl;
    }
    this.noise(color, t, a + hold + d + 0.02, into, rate);
    return e;
  }

  // enveloped oscillator with optional glide / vibrato / lowpass / drive
  tone(t, { type = 'sine', f = 440, f1 = 0, glide = 0, linear = false, a = 0.004, hold = 0, d = 0.2, vol = 0.3, vib = 0, vibRate = 6, vibDecay = 0, vibRise = 0, lp = 0, q = 0.7, drive = 0, detune = 0, dest = this.out } = {}) {
    let out = dest, peak = vol;
    if (drive) { out = this.shaper(drive, dest, vol); peak = 1; }
    const e = this.env(t, peak, a, d, out, hold);
    const into = lp ? this.filter('lowpass', lp, q, e) : e;
    const len = a + hold + d + 0.02;
    const o = this.osc(type, f, t, len, into);
    if (detune) o.detune.value = detune;
    if (f1) {
      const T = t + (glide || a + hold + d);
      if (linear) o.frequency.linearRampToValueAtTime(this.hz(f1), T);
      else o.frequency.exponentialRampToValueAtTime(this.hz(f1), T);
    }
    if (vib) this.lfo(t, len, vibRate, vib * this.p, o.frequency, { decay: vibDecay, rise: vibRise });
    return o;
  }

  // inharmonic sine partials: dings, chimes, sparkles
  bell(t, f, { d = 0.6, vol = 0.2, partials = BELL, dest = this.out } = {}) {
    for (const [r, amp, dm] of partials) this.tone(t, { f: f * r, a: 0.0015, d: d * dm, vol: vol * amp, dest });
  }

  // two-operator FM: metallic clangs, gongs, rings
  fm(t, { f = 600, ratio = 1.41, index = 3, idxEnd = 0.3, a = 0.001, d = 0.5, vol = 0.3, dest = this.out } = {}) {
    const e = this.env(t, vol, a, d, dest);
    const len = a + d + 0.02;
    const car = this.osc('sine', f, t, len, e);
    const mod = this.osc('sine', f * ratio, t, len, null);
    const fc = this.hz(f);
    const mg = this.gain(fc * index, car.frequency);
    mg.gain.setValueAtTime(fc * index, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(fc * idxEnd, 1), t + a + d);
    mod.connect(mg);
  }

  // band-passed noise swelling up and away, filter sweeping f0 -> f1 (-> f2)
  whoosh(t, { f0 = 500, f1 = 2000, f2 = 0, dur = 0.3, q = 1.5, vol = 0.3, peak = 0.5, color = 'pink', type = 'bandpass', dest = this.out } = {}) {
    const g = this.gain(0, dest), gp = g.gain;
    const tp = t + dur * clamp(peak, 0.05, 0.9);
    gp.setValueAtTime(0, t);
    gp.linearRampToValueAtTime(vol, tp);
    gp.exponentialRampToValueAtTime(EPS, t + dur);
    const fl = this.filter(type, f0, q, g);
    fl.frequency.setValueAtTime(this.hz(f0), t);
    fl.frequency.exponentialRampToValueAtTime(this.hz(f1), tp);
    if (f2) fl.frequency.exponentialRampToValueAtTime(this.hz(f2), t + dur);
    this.noise(color, t, dur + 0.02, fl);
  }

  // random tiny noise bursts: debris, sizzle, paper crinkle, tearing
  crackle(t, dur, { n = 12, vol = 0.3, f = 3000, f1 = 0, q = 1, color = 'white', shape = 1.5, fade = 0.6, tau = [0.002, 0.008], dest = this.out } = {}) {
    const g = this.gain(0, dest), gp = g.gain;
    const fl = this.filter('bandpass', f, q, g);
    if (f1) this.fsweep(fl.frequency, t, f, f1, dur);
    this.noise(color, t, dur + 0.06, fl);
    const times = [];
    for (let i = 0; i < n; i++) times.push(Math.pow(Math.random(), shape) * dur);
    times.sort((x, y) => x - y);
    gp.setValueAtTime(0, t);
    for (const dt of times) {
      const tt = t + dt;
      gp.setValueAtTime(vol * rnd(0.35, 1) * (1 - fade * (dt / dur)), tt);
      gp.setTargetAtTime(0, tt, rnd(tau[0], tau[1]));
    }
  }

  // parallel feedback combs with lowpass in the loop: cheap "room"
  room(dest = this.out, { time = 0.05, fb = 0.45, lp = 1800, wet = 0.4, dry = 1 } = {}) {
    const inp = this.gain(1, null);
    if (dry) inp.connect(dry === 1 ? dest : this.gain(dry, dest));
    const wetG = this.gain(wet / 3, dest);
    for (const m of [1, 1.37, 1.79]) {
      const dl = this.track(this.ctx.createDelay(1));
      dl.delayTime.value = time * m;
      const f = this.filter('lowpass', lp, 0.3, null);
      const g = this.gain(fb, dl);
      inp.connect(dl);
      dl.connect(f);
      f.connect(g);
      f.connect(wetG);
    }
    this.tail = Math.max(this.tail, (time * 1.79 * Math.log(0.001)) / Math.log(fb));
    return inp;
  }

  // subtractive voice: stacked oscillators -> lowpass with envelope
  synth(t, f, dur, { types = ['sawtooth'], spread = 0, a = 0.005, r = 0.1, vol = 0.2, sus = 1, cut = null, ca = 0.03, q = 1, from = 0, glide = 0.05, vib = 0, vibRate = 5.5, vibRise = 0.15, dest = this.out } = {}) {
    const e = this.gain(0, dest), gp = e.gain;
    const end = t + Math.max(dur, a + 0.001);
    gp.setValueAtTime(0, t);
    gp.linearRampToValueAtTime(vol, t + a);
    gp.linearRampToValueAtTime(Math.max(vol * sus, EPS * 2), end);
    gp.exponentialRampToValueAtTime(EPS, end + r);
    let into = e;
    if (cut) {
      const lp = this.filter('lowpass', cut[0], q, e);
      const fp = lp.frequency;
      fp.setValueAtTime(this.hz(cut[0]), t);
      fp.exponentialRampToValueAtTime(this.hz(cut[1]), t + Math.min(a + ca, end + r - t - 0.001));
      fp.exponentialRampToValueAtTime(this.hz(cut[2]), end + r);
      into = lp;
    }
    const n = types.length;
    if (n > 1) into = this.gain(1 / n, into);
    const len = end - t + r + 0.02;
    types.forEach((ty, i) => {
      const o = this.osc(ty, from || f, t, len, into);
      if (from) o.frequency.exponentialRampToValueAtTime(this.hz(f), t + glide);
      if (spread && n > 1) o.detune.value = (i / (n - 1) - 0.5) * 2 * spread;
      if (vib) this.lfo(t, len, vibRate, vib, o.detune, { rise: vibRise });
    });
    return e;
  }

  brass(t, f, dur, { vol = 0.15, bright = 5, a = 0.02, r = 0.12, spread = 9, vib = 0, dest = this.out } = {}) {
    return this.synth(t, f, dur, {
      types: ['sawtooth', 'sawtooth', 'square'], spread, a, r, vol, sus: 0.8, q: 1.4,
      cut: [f * 1.2, clamp(f * bright, 650, 9000), Math.max(f * 1.8, 260)], ca: 0.035, vib, dest,
    });
  }

  // source -> parallel formant band-passes: grunts, taunts, growls, trombones
  vox(t, { type = 'sawtooth', f0 = 150, f1 = 0, glide = 0, dur = 0.2, a = 0.01, r = 0.06, vol = 0.3, formants = VOWEL_UH, vib = 0, vibRate = 6, vibRise = 0, drive = 0, lp = null, dest = this.out } = {}) {
    let out = dest, peak = vol;
    if (drive) { out = this.shaper(drive, dest, vol); peak = 1; }
    const e = this.gain(0, out), gp = e.gain;
    gp.setValueAtTime(0, t);
    gp.linearRampToValueAtTime(peak, t + a);
    gp.setValueAtTime(peak, t + Math.max(dur, a + 0.001));
    gp.exponentialRampToValueAtTime(EPS, t + dur + r);
    let sum = e;
    if (lp) {
      const l = this.filter('lowpass', lp[0], 1.2, e);
      l.frequency.setValueAtTime(this.hz(lp[0]), t);
      l.frequency.exponentialRampToValueAtTime(this.hz(lp[1]), t + a + 0.05);
      l.frequency.exponentialRampToValueAtTime(this.hz(lp[2]), t + dur + r);
      sum = l;
    }
    const len = dur + r + 0.02;
    const o = this.osc(type, f0, t, len, null);
    if (f1) o.frequency.exponentialRampToValueAtTime(this.hz(f1), t + (glide || dur));
    if (vib) this.lfo(t, len, vibRate, vib, o.detune, { rise: vibRise });
    for (const [ff, g, q, ff1] of formants) {
      const bp = this.filter('bandpass', ff, q, null);
      if (ff1) this.fsweep(bp.frequency, t, ff, ff1, dur * 0.6);
      bp.connect(this.gain(g, sum));
      o.connect(bp);
    }
  }

  // ---- composite helpers ------------------------------------------------

  // transient "snap": highpassed noise, lightly driven so its peak is bounded by vol
  click(t, vol = 0.4, f = 2500) {
    this.hiss(t, { type: 'highpass', f, d: 0.009, vol, drive: 1.5 });
  }

  clack(t, f, v) {
    this.hiss(t, { type: 'bandpass', f, q: 2.5, d: 0.028, vol: v });
    this.hiss(t, { type: 'highpass', f: f * 1.6, d: 0.006, vol: v * 0.5 });
    this.tone(t, { type: 'square', f: f * 0.3, f1: f * 0.14, glide: 0.02, d: 0.03, vol: v * 0.15, lp: 3500 });
  }

  timp(t, f = 90, vol = 0.4, d = 0.6, dest = this.out) {
    this.thump(t, { f0: f * 1.5, f1: f, drop: 0.05, d, vol, dest });
    this.hiss(t, { color: 'pink', type: 'lowpass', f: 900, d: 0.07, vol: vol * 0.5, dest });
  }

  crash(t, vol = 0.15, d = 1.0, dest = this.out) {
    this.hiss(t, { type: 'highpass', f: 5200, a: 0.002, d, vol, dest });
    this.hiss(t, { type: 'bandpass', f: 3300, q: 0.6, d: d * 0.35, vol: vol * 0.7, dest });
    this.fm(t, { f: 3900, ratio: 1.47, index: 2.5, idxEnd: 1, d: d * 0.6, vol: vol * 0.25, dest });
  }

  snare(t, vol = 0.3, d = 0.14, dest = this.out) {
    this.hiss(t, { type: 'bandpass', f: 2000, q: 0.6, d, vol, dest });
    this.hiss(t, { type: 'highpass', f: 5000, d: d * 0.6, vol: vol * 0.35, dest });
    this.tone(t, { type: 'triangle', f: 200, f1: 160, glide: 0.04, d: 0.08, vol: vol * 0.6, dest });
  }
}

const BELL = [[1, 1, 1], [2.76, 0.45, 0.6], [5.4, 0.25, 0.35], [8.93, 0.12, 0.2]];
const SPARK = [[1, 1, 1], [2, 0.35, 0.6], [4.2, 0.15, 0.3]];
const VOWEL_UH = [[600, 3.2, 5], [1000, 1.8, 6], [2400, 0.7, 8]];
const VOWEL_AH = [[800, 3.2, 5], [1250, 2.2, 6], [2700, 0.8, 8]];

// ---------------------------------------------------------------- sound definitions
//
// fn(k, t) builds the sound at time t into kit k and returns its duration.
// max: simultaneous instances (oldest gets stolen) · gap: min retrigger interval
// vol: trim · pv: random pitch variation (default +-4%) · minor: may fade to
// silence with distance · duck: [music gain, seconds] · len: render budget.

export const SOUNDS = {
  // ======================= weapons
  pistol: {
    max: 3, gap: 0.035, vol: 0.72,
    fn(k, t) {
      k.click(t, 0.4, 2500);
      k.hiss(t, { type: 'bandpass', f: 1900, f1: 650, q: 0.9, d: 0.11, vol: 0.45, drive: 3 });
      k.thump(t, { f0: 230, f1: 58, drop: 0.055, d: 0.21, vol: 0.55, drive: 2.2 });
      k.tone(t, { type: 'square', f: 540, f1: 150, glide: 0.04, d: 0.06, vol: 0.12, lp: 2500 });
      k.hiss(t + 0.008, { color: 'pink', type: 'lowpass', f: 1500, f1: 300, q: 0.5, a: 0.004, d: 0.28, vol: 0.3 });
      return 0.3;
    },
  },
  shotgun: {
    max: 2, gap: 0.06, vol: 0.6, duck: [0.75, 0.25],
    fn(k, t) {
      k.click(t, 0.35, 1800);
      k.thump(t, { f0: 170, f1: 38, drop: 0.12, d: 0.34, vol: 0.62, drive: 2.5 });
      k.hiss(t, { type: 'lowpass', f: 7500, f1: 500, glide: 0.25, q: 0.7, a: 0.002, d: 0.32, vol: 0.5, drive: 2 });
      const r = k.room(k.out, { time: 0.045, fb: 0.4, lp: 1300, wet: 0.5 });
      k.hiss(t, { color: 'brown', type: 'lowpass', f: 1000, f1: 200, d: 0.45, vol: 0.5, dest: r });
      // pump: chk-chk
      k.clack(t + 0.34, 2600, 0.22);
      k.clack(t + 0.46, 1900, 0.28);
      return 0.6;
    },
  },
  smg: {
    max: 3, gap: 0.05, vol: 0.85,
    fn(k, t) {
      k.click(t, 0.3, 3000);
      k.hiss(t, { type: 'bandpass', f: rnd(2000, 2500), f1: 900, q: 1.2, d: 0.065, vol: 0.4, drive: 2.5 });
      k.thump(t, { f0: 270, f1: 85, drop: 0.035, d: 0.1, vol: 0.45, drive: 1.8 });
      k.hiss(t, { color: 'pink', type: 'lowpass', f: 1300, d: 0.09, vol: 0.12 });
      return 0.1;
    },
  },
  launcher: {
    max: 2, gap: 0.08, vol: 0.85,
    fn(k, t) {
      // the "TH": tiny pop chirp
      k.tone(t, { type: 'sine', f: 900, f1: 260, glide: 0.015, d: 0.03, vol: 0.3 });
      // hollow tube "OOMP": resonant triangle falling through a lowpass
      k.tone(t + 0.004, { type: 'triangle', f: 240, f1: 85, glide: 0.2, a: 0.006, d: 0.34, vol: 0.45, lp: 900, q: 4 });
      k.hiss(t, { type: 'bandpass', f: 420, f1: 170, q: 8, a: 0.004, d: 0.3, vol: 1.2 });
      // sub boom
      k.thump(t, { f0: 150, f1: 40, drop: 0.16, d: 0.4, vol: 0.55, drive: 1.6 });
      // projectile air
      k.hiss(t, { type: 'bandpass', f: 1300, f1: 600, q: 1, d: 0.09, vol: 0.4 }); // puff out of the tube
      k.whoosh(t + 0.03, { f0: 1400, f1: 500, dur: 0.4, q: 1.2, vol: 0.22, peak: 0.2 });
      return 0.5;
    },
  },
  rail: {
    max: 2, gap: 0.1, vol: 0.74, duck: [0.8, 0.2],
    fn(k, t) {
      // charge chirp
      k.tone(t, { type: 'sawtooth', f: 500, f1: 3200, glide: 0.05, a: 0.01, d: 0.05, vol: 0.12, lp: 6000 });
      k.tone(t, { type: 'sine', f: 1000, f1: 5000, glide: 0.05, a: 0.01, d: 0.05, vol: 0.12 });
      const tc = t + 0.045;
      // crack
      k.hiss(tc, { type: 'highpass', f: 1400, d: 0.07, vol: 0.45, drive: 3 });
      k.thump(tc, { f0: 150, f1: 35, drop: 0.1, d: 0.32, vol: 0.55, drive: 2 });
      // zap: falling saw
      k.tone(tc, { type: 'sawtooth', f: 2600, f1: 90, glide: 0.26, d: 0.3, vol: 0.2, lp: 5000 });
      k.tone(tc, { type: 'square', f: 1300, f1: 60, glide: 0.2, d: 0.22, vol: 0.06, lp: 3000 });
      // electric ring
      k.fm(tc, { f: 3100, ratio: 0.51, index: 1.2, idxEnd: 0.4, d: 0.5, vol: 0.06 });
      const r = k.room(k.out, { time: 0.05, fb: 0.35, lp: 3000, wet: 0.5, dry: 0 });
      k.hiss(tc, { type: 'bandpass', f: 3000, q: 0.6, d: 0.15, vol: 0.3, dest: r });
      return 0.6;
    },
  },
  blade: {
    max: 2, gap: 0.05, vol: 1.3,
    fn(k, t) {
      k.whoosh(t, { f0: 900, f1: 5200, dur: 0.15, q: 2.2, vol: 0.5, peak: 0.7, color: 'white' });
      const ts = t + 0.06;
      // SHING: detuned high partials beating against each other
      for (const [f, v] of [[2650, 0.1], [2693, 0.09], [3990, 0.08], [5310, 0.05], [7020, 0.035]]) {
        k.tone(ts, { f, f1: f * 1.025, glide: 0.08, a: 0.003, d: 0.55, vol: v });
      }
      k.hiss(ts, { type: 'highpass', f: 6000, d: 0.14, vol: 0.2 });
      k.click(ts, 0.3, 4000);
      return 0.65;
    },
  },
  punch: {
    max: 3, gap: 0.04, vol: 0.66,
    fn(k, t) {
      k.click(t, 0.25, 2000);
      k.hiss(t, { type: 'bandpass', f: 1500, f1: 900, q: 0.8, d: 0.09, vol: 0.55, drive: 2.5 }); // slap
      k.tone(t, { type: 'triangle', f: 620, f1: 260, glide: 0.04, a: 0.001, d: 0.09, vol: 0.4, drive: 1.5 }); // knuckle whump
      k.thump(t, { f0: 180, f1: 55, drop: 0.05, d: 0.14, vol: 0.5, drive: 2.5 });
      return 0.22;
    },
  },
  punchBig: {
    max: 2, gap: 0.08, vol: 0.56, duck: [0.6, 0.35],
    fn(k, t) {
      k.click(t, 0.35, 1800);
      k.hiss(t, { type: 'bandpass', f: 900, f1: 300, q: 0.8, d: 0.2, vol: 0.45, drive: 3 });
      k.thump(t, { f0: 140, f1: 32, drop: 0.2, d: 0.45, vol: 0.62, drive: 3 });
      k.thump(t + 0.004, { f0: 440, f1: 120, drop: 0.05, d: 0.12, vol: 0.4, type: 'triangle', drive: 1.5 });
      k.hiss(t, { type: 'bandpass', f: 1900, f1: 900, q: 0.8, d: 0.16, vol: 0.55, drive: 3 }); // SMACK
      const r = k.room(k.out, { time: 0.06, fb: 0.45, lp: 1500, wet: 0.6, dry: 0 });
      k.hiss(t, { color: 'brown', type: 'lowpass', f: 700, d: 0.35, vol: 0.55, dest: r });
      k.tone(t, { type: 'square', f: 820, f1: 170, glide: 0.12, d: 0.15, vol: 0.05, lp: 2500 });
      return 0.75;
    },
  },
  bombThrow: {
    max: 2, gap: 0.08, vol: 1.5,
    fn(k, t) {
      k.whoosh(t, { f0: 500, f1: 1800, f2: 700, dur: 0.3, q: 1.8, vol: 0.4 });
      k.hiss(t, { type: 'bandpass', f: 3000, q: 4, d: 0.02, vol: 0.3 });
      k.crackle(t + 0.03, 0.42, { n: 24, vol: 0.3, f: 5500, q: 0.8, shape: 1 });
      k.hiss(t + 0.03, { type: 'highpass', f: 6500, a: 0.03, hold: 0.25, d: 0.15, vol: 0.06 });
      return 0.5;
    },
  },
  enemyShot: {
    max: 4, gap: 0.04, vol: 1.1,
    fn(k, t) {
      k.tone(t, { type: 'square', f: 1500, f1: 220, glide: 0.14, d: 0.17, vol: 0.1, lp: 3500 });
      k.tone(t, { type: 'sine', f: 760, f1: 110, glide: 0.14, d: 0.17, vol: 0.3 });
      k.fm(t, { f: 1200, ratio: 0.5, index: 1.5, idxEnd: 0.2, d: 0.12, vol: 0.06 });
      k.click(t, 0.18, 3000);
      return 0.2;
    },
  },
  orb: {
    max: 3, gap: 0.06, vol: 0.85,
    fn(k, t) {
      k.tone(t, { type: 'sine', f: 260, f1: 540, glide: 0.35, a: 0.01, d: 0.45, vol: 0.3, vib: 45, vibRate: 13 });
      k.tone(t, { type: 'triangle', f: 520, f1: 1080, glide: 0.35, a: 0.01, d: 0.38, vol: 0.1, vib: 90, vibRate: 13 });
      k.thump(t, { f0: 210, f1: 70, drop: 0.08, d: 0.2, vol: 0.35 });
      k.hiss(t, { type: 'bandpass', f: 1500, f1: 3600, q: 3, a: 0.02, d: 0.35, vol: 0.35 });
      return 0.5;
    },
  },
  acid: {
    max: 3, gap: 0.06, vol: 1.3,
    fn(k, t) {
      k.hiss(t, { color: 'pink', type: 'bandpass', f: 1500, f1: 500, q: 1.5, a: 0.003, d: 0.13, vol: 0.6 });
      k.thump(t, { f0: 320, f1: 90, drop: 0.05, d: 0.1, vol: 0.25 });
      let tt = t + 0.02;
      for (let i = 0; i < 4; i++) {
        const f = rnd(260, 480);
        k.tone(tt, { f, f1: f * rnd(2, 2.8), glide: 0.05, a: 0.003, d: 0.07, vol: 0.26 });
        tt += rnd(0.035, 0.06);
      }
      return 0.35;
    },
  },
  swipe: {
    max: 3, gap: 0.05, vol: 1.5, minor: true,
    fn(k, t) {
      k.whoosh(t, { f0: 700, f1: 3000, f2: 900, dur: 0.22, q: 2.5, vol: 0.55, peak: 0.4, color: 'white' });
      k.whoosh(t, { f0: 300, f1: 800, dur: 0.2, q: 1, vol: 0.3, peak: 0.4 });
      return 0.25;
    },
  },

  // ======================= impacts
  hit: {
    max: 4, gap: 0.035, vol: 0.84,
    fn(k, t) {
      const v = rnd(0.9, 1.12);
      k.click(t, 0.3, 2500);
      k.hiss(t, { type: 'bandpass', f: 1500 * v, f1: 700, q: 1, d: 0.07, vol: 0.5, drive: 2.5 });
      k.tone(t, { type: 'triangle', f: 540 * v, f1: 220, glide: 0.03, a: 0.001, d: 0.06, vol: 0.3, drive: 1.5 }); // thwack
      k.thump(t, { f0: 210 * v, f1: 70, drop: 0.04, d: 0.11, vol: 0.45, drive: 2 });
      return 0.15;
    },
  },
  hitCrit: {
    max: 2, gap: 0.06, vol: 0.64,
    fn(k, t) {
      k.click(t, 0.22, 2500);
      k.hiss(t, { type: 'bandpass', f: 1200, f1: 500, q: 1, d: 0.08, vol: 0.4, drive: 3 });
      k.hiss(t, { type: 'bandpass', f: 2600, q: 0.7, d: 0.09, vol: 0.3, drive: 6, rate: 0.35 }); // bone crunch
      k.thump(t, { f0: 190, f1: 55, drop: 0.05, d: 0.16, vol: 0.6, drive: 2.5 });
      k.bell(t + 0.012, 2100, { d: 0.35, vol: 0.12 });
      return 0.4;
    },
  },
  hitmarker: {
    max: 2, gap: 0.04, vol: 1.25, pv: 0.02,
    fn(k, t) {
      k.tone(t, { f: 2400, a: 0.001, d: 0.04, vol: 0.2 });
      k.tone(t, { type: 'triangle', f: 3600, a: 0.001, d: 0.025, vol: 0.07 });
      k.hiss(t, { type: 'highpass', f: 5000, d: 0.006, vol: 0.12 });
      return 0.06;
    },
  },
  killmarker: {
    max: 1, gap: 0.12, vol: 1.1, pv: 0.01,
    fn(k, t) {
      k.thump(t, { f0: 190, f1: 60, d: 0.12, vol: 0.28 });
      k.bell(t, 1320, { d: 0.25, vol: 0.15 });
      k.bell(t + 0.075, 1760, { d: 0.5, vol: 0.17 });
      k.hiss(t + 0.075, { type: 'highpass', f: 7000, a: 0.002, d: 0.4, vol: 0.12 });
      k.fm(t + 0.075, { f: 3200, ratio: 1.47, index: 2, idxEnd: 0.5, d: 0.3, vol: 0.035 });
      return 0.6;
    },
  },
  ko: {
    max: 2, gap: 0.12, vol: 0.6, duck: [0.45, 0.6],
    fn(k, t) {
      k.click(t, 0.3, 1500);
      k.thump(t, { f0: 115, f1: 28, drop: 0.35, d: 0.85, vol: 0.62, drive: 2.5 });
      const r = k.room(k.out, { time: 0.07, fb: 0.5, lp: 1100, wet: 0.55 });
      k.hiss(t, { color: 'brown', type: 'lowpass', f: 2500, f1: 150, glide: 0.6, d: 0.8, vol: 0.45, dest: r, drive: 1.5 });
      k.hiss(t, { type: 'lowpass', f: 6000, f1: 800, d: 0.25, vol: 0.28, drive: 1.5 });
      k.fm(t, { f: 110, ratio: 1.4, index: 2.5, idxEnd: 0.3, d: 1.0, vol: 0.16 });
      return 1.15;
    },
  },
  hurt: {
    max: 2, gap: 0.08, vol: 0.9,
    fn(k, t) {
      k.thump(t, { f0: 140, f1: 45, drop: 0.08, d: 0.24, vol: 0.6, drive: 2 });
      k.hiss(t, { type: 'bandpass', f: 800, q: 1, d: 0.06, vol: 0.4 });
      k.vox(t + 0.01, { f0: rnd(140, 160), f1: 95, dur: 0.16, a: 0.012, r: 0.08, vol: 0.3, formants: VOWEL_UH });
      return 0.32;
    },
  },
  wall: {
    max: 4, gap: 0.03, vol: 0.7, minor: true,
    fn(k, t) {
      if (Math.random() < 0.35) {
        // ricochet "pyeew"
        const f = rnd(2200, 3400);
        k.tone(t, { f, f1: f * rnd(0.55, 0.7), glide: 0.22, a: 0.002, d: 0.26, vol: 0.12 });
        k.fm(t, { f: f * 0.5, ratio: 2.3, index: 0.8, idxEnd: 0.2, d: 0.2, vol: 0.05 });
        k.click(t, 0.3, 3500);
        return 0.3;
      }
      k.hiss(t, { type: 'bandpass', f: rnd(700, 1500), q: 1.2, d: 0.05, vol: 0.5 });
      k.thump(t, { f0: 190, f1: 80, drop: 0.03, d: 0.07, vol: 0.3 });
      k.crackle(t + 0.01, 0.12, { n: 5, vol: 0.2, f: 3500 });
      return 0.15;
    },
  },
  deflect: {
    max: 2, gap: 0.05, vol: 0.9,
    fn(k, t) {
      k.click(t, 0.3, 3000);
      k.fm(t, { f: 880, ratio: 1.414, index: 4, idxEnd: 0.4, d: 0.55, vol: 0.22 });
      k.fm(t, { f: 1970, ratio: 1.73, index: 2.5, idxEnd: 0.3, d: 0.38, vol: 0.12 });
      k.bell(t, 3300, { d: 0.5, vol: 0.05 });
      k.thump(t, { f0: 300, f1: 120, d: 0.06, vol: 0.3 });
      return 0.6;
    },
  },
  dodge: {
    max: 2, gap: 0.05, vol: 1.4, minor: true,
    fn(k, t) {
      k.whoosh(t, { f0: 600, f1: 2600, f2: 1200, dur: 0.19, q: 1.6, vol: 0.45, peak: 0.35, color: 'white' });
      return 0.2;
    },
  },
  break: {
    max: 3, gap: 0.05, vol: 0.9,
    fn(k, t) {
      k.thump(t, { f0: 170, f1: 60, drop: 0.05, d: 0.2, vol: 0.5, drive: 1.5 });
      k.hiss(t, { type: 'bandpass', f: 1800, q: 0.8, d: 0.06, vol: 0.45 });
      for (let i = 0; i < 6; i++) {
        const tt = t + Math.pow(Math.random(), 1.5) * 0.2;
        const f = rnd(260, 900);
        k.tone(tt, { type: 'triangle', f, f1: f * 0.9, glide: 0.05, a: 0.001, d: rnd(0.04, 0.09), vol: 0.14 });
        k.hiss(tt, { type: 'bandpass', f: f * 2, q: 3, d: 0.03, vol: 0.3 });
      }
      k.crackle(t, 0.35, { n: 18, vol: 0.3, f: 2500, q: 0.7 });
      return 0.45;
    },
  },
  breakMetal: {
    max: 2, gap: 0.06, vol: 0.9,
    fn(k, t) {
      k.thump(t, { f0: 180, f1: 60, d: 0.22, vol: 0.5, drive: 1.5 });
      k.hiss(t, { type: 'highpass', f: 2500, d: 0.28, vol: 0.3 });
      let tt = t;
      for (let i = 0; i < 4; i++) {
        k.fm(tt, { f: rnd(400, 1400), ratio: rnd(1.3, 2.7), index: rnd(2, 5), idxEnd: 0.3, d: rnd(0.25, 0.6), vol: 0.11 });
        tt += rnd(0.04, 0.09);
      }
      k.crackle(t + 0.05, 0.4, { n: 10, vol: 0.25, f: 4500 });
      return 0.85;
    },
  },
  flip: {
    max: 2, gap: 0.1, vol: 0.9,
    fn(k, t) {
      k.whoosh(t, { f0: 400, f1: 1200, dur: 0.14, q: 1.2, vol: 0.3, peak: 0.8 });
      const tt = t + 0.12;
      k.thump(tt, { f0: 130, f1: 48, drop: 0.07, d: 0.3, vol: 0.65, drive: 1.8 });
      k.hiss(tt, { color: 'pink', type: 'bandpass', f: 350, q: 1.5, d: 0.13, vol: 0.9 });
      k.hiss(tt, { type: 'bandpass', f: 950, q: 4, d: 0.06, vol: 0.8 }); // wood knock
      k.tone(tt, { type: 'triangle', f: 320, f1: 230, glide: 0.05, a: 0.001, d: 0.1, vol: 0.25 });
      k.hiss(tt + 0.07, { type: 'bandpass', f: 600, q: 3, d: 0.05, vol: 0.5 });
      k.thump(tt + 0.09, { f0: 180, f1: 90, d: 0.07, vol: 0.25 });
      return 0.5;
    },
  },
  bonk: {
    max: 2, gap: 0.08, vol: 0.85,
    fn(k, t) {
      k.tone(t, { f: 620, f1: 380, glide: 0.05, a: 0.001, d: 0.13, vol: 0.38 });
      k.hiss(t, { type: 'bandpass', f: 1500, q: 6, d: 0.03, vol: 0.9 });
      k.thump(t, { f0: 230, f1: 110, d: 0.08, vol: 0.3 });
      // boing: rising jaw-harp with decaying wobble
      k.tone(t + 0.04, { type: 'triangle', f: 150, f1: 330, glide: 0.4, a: 0.01, d: 0.55, vol: 0.26, vib: 60, vibRate: 16, vibDecay: 0.5, lp: 2500 });
      return 0.65;
    },
  },
  quake: {
    max: 2, gap: 0.15, vol: 0.82, duck: [0.5, 0.8],
    fn(k, t) {
      k.hiss(t, { type: 'lowpass', f: 3000, d: 0.05, vol: 0.4 });
      k.thump(t, { f0: 95, f1: 26, drop: 0.5, d: 1.0, vol: 0.62, drive: 3 });
      k.hiss(t, { color: 'brown', type: 'lowpass', f: 420, f1: 120, a: 0.01, d: 1.1, vol: 0.5, drive: 1.5 });
      k.crackle(t + 0.05, 0.75, { n: 26, vol: 0.45, f: 1800, q: 0.6, color: 'pink' });
      k.hiss(t + 0.02, { color: 'pink', type: 'bandpass', f: 1400, f1: 600, q: 0.8, a: 0.01, d: 0.6, vol: 0.25 }); // rubble
      return 1.2;
    },
  },

  // ======================= explosions
  explosion: {
    max: 3, gap: 0.05, vol: 0.68, duck: [0.6, 0.45],
    fn(k, t) {
      k.click(t, 0.35, 1200);
      k.thump(t, { f0: 125, f1: 30, drop: 0.3, d: 0.65, vol: 0.6, drive: 2.5 });
      const r = k.room(k.out, { time: 0.055, fb: 0.5, lp: 1400, wet: 0.5 });
      k.hiss(t, { color: 'pink', type: 'lowpass', f: 4500, f1: 250, glide: 0.7, a: 0.003, d: 0.9, vol: 0.5, dest: r, drive: 2 });
      k.hiss(t, { color: 'brown', type: 'lowpass', f: 600, d: 1.1, vol: 0.35, dest: r });
      k.crackle(t + 0.05, 0.7, { n: 16, vol: 0.28, f: 2500, q: 0.6 });
      return 1.3;
    },
  },
  explosionBig: {
    max: 1, gap: 0.3, vol: 0.66, duck: [0.2, 1.4], len: 4,
    fn(k, t) {
      k.click(t, 0.35, 900);
      k.thump(t, { f0: 105, f1: 22, drop: 0.9, d: 1.9, vol: 0.62, drive: 3 });
      const r = k.room(k.out, { time: 0.08, fb: 0.58, lp: 1000, wet: 0.6 });
      k.hiss(t, { color: 'pink', type: 'lowpass', f: 6000, f1: 180, glide: 1.4, a: 0.004, d: 1.9, vol: 0.5, dest: r, drive: 2.5 });
      k.hiss(t, { color: 'brown', type: 'lowpass', f: 500, f1: 90, glide: 2, a: 0.05, d: 2.2, vol: 0.4, dest: r, drive: 1.5 });
      [0.22, 0.52].forEach((dt, i) => {
        k.thump(t + dt, { f0: 95 - i * 12, f1: 30, drop: 0.25, d: 0.65, vol: 0.4 - i * 0.1, drive: 2 });
        k.hiss(t + dt, { color: 'pink', type: 'lowpass', f: 2600, f1: 300, d: 0.55, vol: 0.28, dest: r });
      });
      k.crackle(t + 0.08, 1.6, { n: 40, vol: 0.3, f: 2200, q: 0.5 });
      return 2.5;
    },
  },
  barrel: {
    max: 2, gap: 0.06, vol: 0.74, duck: [0.55, 0.5],
    fn(k, t) {
      k.click(t, 0.35, 1200);
      k.thump(t, { f0: 130, f1: 32, drop: 0.28, d: 0.6, vol: 0.55, drive: 2.5 });
      const r = k.room(k.out, { time: 0.05, fb: 0.5, lp: 1600, wet: 0.5 });
      k.hiss(t, { color: 'pink', type: 'lowpass', f: 5000, f1: 300, glide: 0.6, a: 0.003, d: 0.85, vol: 0.45, dest: r, drive: 2 });
      k.fm(t, { f: 190, ratio: 1.41, index: 5, idxEnd: 0.5, d: 0.8, vol: 0.16 });
      k.fm(t + 0.01, { f: 540, ratio: 2.13, index: 3, idxEnd: 0.3, d: 0.5, vol: 0.08 });
      k.crackle(t + 0.04, 0.8, { n: 24, vol: 0.3, f: 3000, q: 0.6 });
      return 1.25;
    },
  },

  // ======================= movement
  jump: {
    max: 2, gap: 0.06, vol: 0.95, minor: true,
    fn(k, t) {
      k.tone(t, { type: 'square', f: 260, f1: 620, glide: 0.09, a: 0.003, d: 0.1, vol: 0.05, lp: 2000 });
      k.tone(t, { f: 260, f1: 620, glide: 0.09, a: 0.003, d: 0.1, vol: 0.16 });
      k.hiss(t, { type: 'bandpass', f: 900, f1: 2000, q: 1, a: 0.005, d: 0.1, vol: 0.2 });
      k.thump(t, { f0: 120, f1: 70, d: 0.06, vol: 0.18 });
      return 0.15;
    },
  },
  djump: {
    max: 2, gap: 0.06, vol: 1.3, minor: true,
    fn(k, t) {
      k.whoosh(t, { f0: 500, f1: 3200, dur: 0.28, q: 1.8, vol: 0.45, peak: 0.45, color: 'white' });
      k.tone(t, { f: 420, f1: 1100, glide: 0.2, a: 0.01, d: 0.22, vol: 0.13 });
      k.tone(t, { type: 'triangle', f: 840, f1: 2200, glide: 0.2, a: 0.01, d: 0.18, vol: 0.04 });
      return 0.3;
    },
  },
  dash: {
    max: 2, gap: 0.06, vol: 1.5, minor: true,
    fn(k, t) {
      k.whoosh(t, { f0: 2800, f1: 900, f2: 500, dur: 0.2, q: 1.4, vol: 0.55, peak: 0.25, color: 'white' });
      k.whoosh(t, { f0: 400, f1: 250, dur: 0.18, q: 0.8, vol: 0.35, peak: 0.2 });
      return 0.22;
    },
  },
  land: {
    max: 2, gap: 0.06, vol: 0.8, minor: true,
    fn(k, t) {
      k.thump(t, { f0: 120, f1: 50, drop: 0.05, d: 0.13, vol: 0.4 });
      k.hiss(t, { color: 'pink', type: 'lowpass', f: 900, d: 0.08, vol: 0.4 });
      k.hiss(t, { type: 'bandpass', f: 750, q: 1.2, d: 0.06, vol: 0.45 }); // scuff
      return 0.15;
    },
  },
  climb: {
    max: 2, gap: 0.06, vol: 0.7, minor: true,
    fn(k, t) {
      const f = rnd(700, 950);
      k.tone(t, { f, a: 0.001, d: 0.05, vol: 0.12 });
      k.tone(t, { f: f * 2.7, a: 0.001, d: 0.03, vol: 0.04 });
      k.hiss(t, { type: 'bandpass', f: 2500, q: 2, d: 0.012, vol: 0.25 });
      return 0.07;
    },
  },
  step: {
    max: 2, gap: 0.08, vol: 0.45, minor: true, pv: 0.08,
    fn(k, t) {
      k.hiss(t, { color: 'pink', type: 'lowpass', f: rnd(500, 900), d: rnd(0.03, 0.05), vol: 0.35 });
      k.thump(t, { f0: 110, f1: 60, d: 0.05, vol: 0.14 });
      return 0.07;
    },
  },

  // ======================= weapon handling
  reload: {
    max: 1, gap: 0.1, vol: 1.2, minor: true,
    fn(k, t) {
      k.clack(t, 3200, 0.35);
      k.hiss(t + 0.05, { type: 'bandpass', f: 1500, f1: 2500, q: 1.5, a: 0.02, d: 0.07, vol: 0.2 });
      k.clack(t + 0.2, 2200, 0.5);
      k.thump(t + 0.2, { f0: 200, f1: 100, d: 0.05, vol: 0.25 });
      return 0.3;
    },
  },
  reloadDone: {
    max: 1, gap: 0.1, vol: 1.15, minor: true,
    fn(k, t) {
      k.clack(t, 2600, 0.4);
      k.clack(t + 0.09, 1900, 0.55);
      k.fm(t + 0.09, { f: 1400, ratio: 1.6, index: 1.5, idxEnd: 0.2, d: 0.14, vol: 0.05 });
      k.thump(t + 0.09, { f0: 180, f1: 90, d: 0.06, vol: 0.25 });
      return 0.25;
    },
  },
  swap: {
    max: 1, gap: 0.05, vol: 1.1, minor: true,
    fn(k, t) {
      k.whoosh(t, { f0: 800, f1: 2200, dur: 0.1, q: 1.5, vol: 0.25 });
      k.clack(t + 0.08, 2400, 0.4);
      k.thump(t + 0.08, { f0: 200, f1: 100, d: 0.04, vol: 0.2 });
      return 0.15;
    },
  },
  empty: {
    max: 1, gap: 0.08, vol: 1.2, minor: true,
    fn(k, t) {
      k.hiss(t, { type: 'highpass', f: 4000, d: 0.006, vol: 0.3 });
      k.tone(t, { type: 'square', f: 1900, d: 0.012, vol: 0.04 });
      k.tone(t + 0.004, { f: 900, d: 0.02, vol: 0.12 });
      return 0.05;
    },
  },
  pickup: {
    max: 2, gap: 0.05, vol: 1.4, pv: 0.02,
    fn(k, t) {
      [76, 80, 83, 88].forEach((m, i) => k.bell(t + i * 0.045, mtof(m), { d: 0.28, vol: 0.09, partials: SPARK }));
      k.hiss(t, { type: 'highpass', f: 7000, a: 0.02, d: 0.3, vol: 0.06 });
      return 0.45;
    },
  },
  pickupWeapon: {
    max: 1, gap: 0.1, vol: 0.9, pv: 0.02,
    fn(k, t) {
      k.clack(t, 1800, 0.5);
      k.thump(t, { f0: 150, f1: 60, d: 0.12, vol: 0.45, drive: 1.5 });
      k.clack(t + 0.12, 1400, 0.6);
      k.thump(t + 0.12, { f0: 130, f1: 50, d: 0.15, vol: 0.5, drive: 1.5 });
      k.fm(t + 0.12, { f: 700, ratio: 1.41, index: 2, idxEnd: 0.3, d: 0.25, vol: 0.05 });
      [79, 83, 86, 91].forEach((m, i) => k.bell(t + 0.2 + i * 0.04, mtof(m), { d: 0.25, vol: 0.07, partials: SPARK }));
      return 0.6;
    },
  },
  pickupHealth: {
    max: 1, gap: 0.1, vol: 1.25, pv: 0,
    fn(k, t) {
      [60, 64, 67, 72].forEach((m, i) => {
        k.tone(t + i * 0.08, { type: 'triangle', f: mtof(m), a: 0.01, d: 0.6 - i * 0.05, vol: 0.14 });
        k.tone(t + i * 0.08, { f: mtof(m + 12), a: 0.01, d: 0.4, vol: 0.05 });
      });
      k.tone(t, { f: mtof(48), a: 0.15, d: 0.55, vol: 0.12 });
      return 0.9;
    },
  },

  // ======================= game events
  wake: {
    max: 1, gap: 0.35, vol: 0.85, pv: 0.01, duck: [0.6, 0.7],
    fn(k, t) {
      [38, 50, 53, 57].forEach((m) => k.brass(t, mtof(m), 0.09, { vol: 0.12, bright: 4 }));
      k.timp(t, 73, 0.4, 0.35);
      const t2 = t + 0.17;
      [37, 49, 52, 56].forEach((m) => k.brass(t2, mtof(m), 0.5, { vol: 0.12, bright: 3.5, vib: 12, r: 0.25 }));
      k.timp(t2, 69, 0.5, 0.7);
      k.hiss(t2, { type: 'highpass', f: 5000, a: 0.01, d: 0.5, vol: 0.07 });
      return 1.0;
    },
  },
  draw: {
    max: 2, gap: 0.1, vol: 0.85,
    fn(k, t) {
      // pencil strokes: one noise source, amplitude-gated into scribbles
      const g = k.gain(0);
      const grain = k.gain(0.55, g);
      const bp = k.filter('bandpass', 3500, 1.8, grain);
      const hp = k.filter('highpass', 1800, 0.7, bp);
      // paper-tooth grain: slow noise wobbling the amplitude
      k.noise('white', t, 0.8, k.gain(0.45, grain.gain), 0.012);
      let tt = t;
      const n = 6 + ((Math.random() * 3) | 0);
      g.gain.setValueAtTime(0, t);
      for (let i = 0; i < n; i++) {
        const len = rnd(0.04, 0.09), v = rnd(0.5, 0.9);
        g.gain.setValueAtTime(0, tt);
        g.gain.linearRampToValueAtTime(v, tt + len * 0.25);
        g.gain.linearRampToValueAtTime(v * 0.5, tt + len * 0.8);
        g.gain.linearRampToValueAtTime(0, tt + len);
        k.fsweep(bp.frequency, tt, rnd(2500, 4500), rnd(2500, 5200), len, true);
        tt += len + rnd(0.004, 0.02);
      }
      k.noise('white', t, tt - t + 0.02, hp);
      return tt - t + 0.03;
    },
  },
  boss: {
    max: 1, gap: 0.5, vol: 0.9, pv: 0, duck: [0.3, 1.6], len: 3.5,
    fn(k, t) {
      [26, 38, 39, 45].forEach((m) => k.brass(t, mtof(m), 1.1, { vol: 0.13, bright: 3, a: 0.06, r: 0.7 }));
      k.thump(t, { f0: 85, f1: 35, drop: 0.3, d: 1.5, vol: 0.55, drive: 2 });
      k.fm(t, { f: 65, ratio: 1.41, index: 3, idxEnd: 0.3, d: 2.0, vol: 0.18 });
      k.crash(t, 0.12, 1.6);
      const t2 = t + 0.62;
      [25, 37, 40, 44].forEach((m) => k.brass(t2, mtof(m), 0.9, { vol: 0.13, bright: 3.5, a: 0.04, r: 0.8, vib: 14 }));
      k.timp(t2, 55, 0.5, 1.2);
      k.hiss(t, { color: 'pink', type: 'lowpass', f: 300, f1: 2500, glide: 1.2, a: 0.9, d: 0.8, vol: 0.2 });
      return 2.3;
    },
  },
  enrage: {
    max: 1, gap: 0.3, vol: 0.9, duck: [0.55, 0.8],
    fn(k, t) {
      k.vox(t, { f0: 70, f1: 125, dur: 0.75, a: 0.05, r: 0.15, vol: 0.4, formants: VOWEL_AH, vib: 70, vibRate: 9, drive: 3 });
      k.hiss(t, { color: 'brown', type: 'lowpass', f: 300, f1: 900, a: 0.2, d: 0.6, vol: 0.4 });
      k.thump(t, { f0: 90, f1: 40, drop: 0.2, d: 0.5, vol: 0.45, drive: 1.5 });
      return 0.95;
    },
  },
  superCharge: {
    max: 1, gap: 0.2, vol: 0.85, pv: 0.01,
    fn(k, t) {
      const d = 0.6;
      const e = k.gain(0), gp = e.gain;
      gp.setValueAtTime(0, t);
      gp.linearRampToValueAtTime(0.28, t + d * 0.92);
      gp.exponentialRampToValueAtTime(EPS, t + d + 0.06);
      const lp = k.filter('lowpass', 400, 4, e);
      k.fsweep(lp.frequency, t, 400, 7000, d);
      for (const [ty, f, det] of [['sawtooth', 110, -12], ['sawtooth', 110, 12], ['square', 220, 0]]) {
        const o = k.osc(ty, f, t, d + 0.08, lp);
        o.detune.value = det;
        o.frequency.exponentialRampToValueAtTime(k.hz(f * 4), t + d);
        const l = k.lfo(t, d + 0.08, 6, 25, o.detune, { rise: d });
        l.frequency.linearRampToValueAtTime(18, t + d);
      }
      k.hiss(t, { type: 'highpass', f: 1000, f1: 6000, glide: d, a: d * 0.9, d: 0.08, vol: 0.2 });
      return 0.7;
    },
  },
  superReady: {
    max: 1, gap: 0.3, vol: 1.4, pv: 0,
    fn(k, t) {
      [79, 84, 88, 91].forEach((m, i) => k.bell(t + i * 0.035, mtof(m), { d: 0.7, vol: 0.07 }));
      [60, 67, 72, 76].forEach((m) => k.brass(t + 0.05, mtof(m), 0.22, { vol: 0.08, bright: 6 }));
      k.hiss(t, { type: 'highpass', f: 6000, a: 0.005, d: 0.5, vol: 0.08 });
      return 0.8;
    },
  },
  pageTurn: {
    max: 1, gap: 0.2, vol: 1.15,
    fn(k, t) {
      k.whoosh(t + 0.05, { f0: 700, f1: 2400, f2: 900, dur: 0.5, q: 0.9, vol: 0.4, peak: 0.55 });
      k.crackle(t, 0.55, { n: 28, vol: 0.2, f: 4000, q: 0.8, shape: 1.1, fade: 0.2 });
      k.hiss(t + 0.52, { color: 'pink', type: 'lowpass', f: 1400, f1: 400, d: 0.13, vol: 0.5 });
      k.thump(t + 0.52, { f0: 140, f1: 70, d: 0.08, vol: 0.2 });
      return 0.72;
    },
  },
  gateOpen: {
    max: 1, gap: 0.2, vol: 1.35,
    fn(k, t) {
      const d = 0.42;
      k.crackle(t, d, { n: 70, vol: 0.45, f: 1600, f1: 4200, q: 1.2, shape: 1, fade: 0.1, tau: [0.001, 0.004] });
      k.hiss(t, { type: 'bandpass', f: 1200, f1: 3500, q: 0.8, a: 0.05, hold: d * 0.6, d: 0.15, vol: 0.15 });
      k.whoosh(t, { f0: 200, f1: 500, dur: 0.6, q: 0.7, vol: 0.25, peak: 0.5, color: 'brown', type: 'lowpass' });
      k.thump(t + d, { f0: 160, f1: 70, d: 0.1, vol: 0.2 });
      return 0.62;
    },
  },
  panelClear: {
    max: 1, gap: 0.3, vol: 0.85, pv: 0,
    fn(k, t) {
      k.brass(t, mtof(67), 0.07, { vol: 0.16, bright: 5 });
      const t2 = t + 0.12;
      [48, 60, 64, 67, 72].forEach((m) => k.brass(t2, mtof(m), 0.38, { vol: 0.09, bright: 6, r: 0.2 }));
      k.timp(t2, 65, 0.35, 0.4);
      k.crash(t2, 0.1, 0.7);
      return 0.9;
    },
  },
  spreadClear: {
    max: 1, gap: 0.5, vol: 0.9, pv: 0, duck: [0.3, 1.4], len: 3,
    fn(k, t) {
      [[0, 67], [0.1, 69], [0.2, 71]].forEach(([dt, m]) => k.brass(t + dt, mtof(m), 0.07, { vol: 0.14, bright: 5 }));
      const t2 = t + 0.3;
      [48, 55, 60, 64, 67, 72, 76].forEach((m) => k.brass(t2, mtof(m), 0.85, { vol: 0.07, bright: 5, vib: 10, r: 0.2 }));
      for (let i = 0; i < 12; i++) k.timp(t2 + i * 0.07, 65, 0.1 + i * 0.012, 0.15);
      k.crash(t2, 0.1, 1.2);
      const t3 = t + 1.25;
      [48, 60, 67, 72].forEach((m) => k.brass(t3, mtof(m), 0.14, { vol: 0.12, bright: 6, r: 0.15 }));
      k.timp(t3, 65, 0.45, 0.4);
      k.crash(t3, 0.1, 0.4);
      return 1.65;
    },
  },
  victory: {
    max: 1, gap: 1, vol: 0.9, pv: 0, duck: [0.2, 3], len: 4.5,
    fn(k, t) {
      const lead = [[0, 67, 0.1], [0.13, 72, 0.1], [0.26, 76, 0.1], [0.39, 79, 0.33], [0.8, 76, 0.11], [0.95, 79, 0.55]];
      for (const [dt, m, d] of lead) {
        k.brass(t + dt, mtof(m), d, { vol: 0.14, bright: 6, vib: d > 0.3 ? 14 : 0 });
        k.brass(t + dt, mtof(m - 5), d, { vol: 0.07, bright: 4 });
      }
      [[0.39, [48, 55, 64]], [0.95, [45, 57, 64]]].forEach(([dt, ch]) => ch.forEach((m) => k.brass(t + dt, mtof(m), 0.4, { vol: 0.06, bright: 3 })));
      k.timp(t + 0.39, 65, 0.35);
      k.timp(t + 0.95, 55, 0.35);
      for (let i = 0; i < 10; i++) k.snare(t + 1.1 + i * 0.05, 0.05 + i * 0.012, 0.08);
      const t2 = t + 1.6;
      [36, 48, 55, 60, 64, 67, 72, 76, 84].forEach((m) => k.brass(t2, mtof(m), 1.2, { vol: 0.055, bright: 5, vib: 12, r: 0.5 }));
      k.bell(t2, mtof(96), { d: 1.4, vol: 0.05 });
      k.timp(t2, 65, 0.55, 1.0);
      k.crash(t2, 0.14, 1.6);
      return 3.2;
    },
  },
  gameover: {
    max: 1, gap: 1, vol: 1.6, pv: 0, duck: [0.2, 2.5], len: 3.5,
    fn(k, t) {
      // sad trombone: wah wah wah waaaah
      const notes = [[0, 55, 0.3], [0.38, 54, 0.3], [0.76, 53, 0.3], [1.14, 52, 1.0]];
      notes.forEach(([dt, m, d], i) => {
        const last = i === notes.length - 1;
        k.vox(t + dt, {
          type: 'sawtooth', f0: mtof(m) * 1.03, f1: mtof(m) * (last ? 0.97 : 0.99), glide: last ? d : 0.06,
          dur: d, a: 0.03, r: 0.12, vol: 0.2, vib: last ? 35 : 0, vibRate: 5, vibRise: 0.3,
          formants: [[520, 2.2, 2.5], [1100, 1.5, 4], [2500, 0.5, 6]], lp: [350, 1600, 500],
        });
      });
      return 2.35;
    },
  },
  roundOver: {
    max: 1, gap: 0.5, vol: 0.85, pv: 0,
    fn(k, t) {
      // boxing-ring bell x3 + low stab
      for (let i = 0; i < 3; i++) {
        k.fm(t + i * 0.2, { f: 1180, ratio: 2.76, index: 1.2, idxEnd: 0.1, d: 0.9, vol: 0.1 });
        k.bell(t + i * 0.2, 1180, { d: 0.8, vol: 0.09 });
      }
      [43, 55, 62].forEach((m) => k.brass(t, mtof(m), 0.25, { vol: 0.08, bright: 3.5 }));
      k.timp(t, 55, 0.35, 0.5);
      return 1.3;
    },
  },
  respawn: {
    max: 1, gap: 0.2, vol: 0.85, pv: 0.02,
    fn(k, t) {
      k.whoosh(t, { f0: 400, f1: 4000, dur: 0.6, q: 2, vol: 0.4, peak: 0.6, color: 'white' });
      [72, 74, 76, 79, 81, 84, 86, 88].forEach((m, i) => k.bell(t + 0.04 * i, mtof(m), { d: 0.35, vol: 0.05, partials: SPARK }));
      k.tone(t, { f: 200, f1: 800, glide: 0.5, a: 0.3, d: 0.3, vol: 0.12 });
      k.thump(t + 0.3, { f0: 180, f1: 70, d: 0.2, vol: 0.2 });
      return 0.8;
    },
  },
  taunt: {
    max: 1, gap: 0.25, vol: 1.15, pv: 0.06,
    fn(k, t) {
      k.vox(t, { f0: 330, f1: 440, dur: 0.09, a: 0.008, r: 0.04, vol: 0.2, formants: [[750, 3, 5], [2000, 2, 6, 1250], [2700, 0.8, 8]] });
      k.vox(t + 0.13, { f0: 400, f1: 290, dur: 0.13, a: 0.008, r: 0.06, vol: 0.2, formants: [[750, 3, 5], [2000, 2, 6, 1250], [2700, 0.8, 8]] });
      return 0.32;
    },
  },
  lowHp: {
    max: 1, gap: 0.35, vol: 0.8, pv: 0.01,
    fn(k, t) {
      k.thump(t, { f0: 78, f1: 42, drop: 0.06, d: 0.17, vol: 0.55 });
      k.hiss(t, { color: 'brown', type: 'lowpass', f: 200, d: 0.05, vol: 0.2 });
      k.thump(t + 0.17, { f0: 66, f1: 38, drop: 0.06, d: 0.21, vol: 0.42 });
      return 0.45;
    },
  },
  alarm: {
    max: 1, gap: 0.6, vol: 0.8, pv: 0, duck: [0.6, 0.6],
    fn(k, t) {
      // two-tone klaxon + a stinger hit
      for (let i = 0; i < 3; i++) {
        k.tone(t + i * 0.22, { type: 'square', f: 880, a: 0.005, hold: 0.09, d: 0.03, vol: 0.09, lp: 3000 });
        k.tone(t + i * 0.22 + 0.11, { type: 'square', f: 660, a: 0.005, hold: 0.09, d: 0.03, vol: 0.09, lp: 3000 });
      }
      k.brass(t, mtof(62), 0.25, { vol: 0.12 });
      k.crash(t, 0.08, 0.6);
      return 0.8;
    },
  },
  trap: {
    max: 1, gap: 1, vol: 1.0, pv: 0, duck: [0.3, 1.0],
    fn(k, t) {
      k.thump(t, { f0: 120, f1: 35, d: 0.6, vol: 0.9, drive: 2 });
      k.hiss(t, { type: 'lowpass', f: 1200, d: 0.4, vol: 0.4 });
      [50, 53, 56, 59].forEach((m, i) => k.brass(t + 0.08 + i * 0.09, mtof(m), 0.18, { vol: 0.1 }));
      k.crash(t + 0.1, 0.12, 1.2);
      return 1.4;
    },
  },
  stagger: {
    max: 2, gap: 0.08, vol: 0.9, pv: 0.03,
    fn(k, t) {
      k.thump(t, { f0: 200, f1: 60, d: 0.18, vol: 0.6, drive: 1.5 });
      k.tone(t + 0.02, { type: 'triangle', f: 900, f1: 500, glide: 0.25, a: 0.003, d: 0.35, vol: 0.14, vib: 40, vibRate: 22, vibDecay: 0.4 });
      k.bell(t + 0.05, 1320, { d: 0.35, vol: 0.05 });
      return 0.5;
    },
  },
  splat: {
    max: 2, gap: 0.08, vol: 1.1, pv: 0.03,
    fn(k, t) {
      k.thump(t, { f0: 160, f1: 40, d: 0.3, vol: 0.9, drive: 2.5 });
      k.hiss(t, { type: 'lowpass', f: 900, d: 0.18, vol: 0.5 });
      k.crackle(t + 0.01, 0.12, { n: 10, vol: 0.2, f: 1800 });
      return 0.45;
    },
  },
  block: {
    max: 3, gap: 0.05, vol: 0.7, pv: 0.05,
    fn(k, t) {
      k.clack(t, 2400, 0.35);
      k.bell(t, 1850, { d: 0.18, vol: 0.05 });
      k.hiss(t, { type: 'bandpass', f: 4200, q: 4, d: 0.04, vol: 0.2 });
      return 0.2;
    },
  },
  shieldBreak: {
    max: 1, gap: 0.2, vol: 1.1, pv: 0.02,
    fn(k, t) {
      k.crackle(t, 0.3, { n: 26, vol: 0.4, f: 3500, f1: 1200 });
      k.thump(t, { f0: 240, f1: 70, d: 0.2, vol: 0.5, drive: 2 });
      k.bell(t, 980, { d: 0.5, vol: 0.06 });
      return 0.5;
    },
  },
  switchOn: {
    max: 3, gap: 0.05, vol: 0.9, pv: 0.01,
    fn(k, t) {
      k.clack(t, 1600, 0.3);
      k.tone(t + 0.02, { type: 'sine', f: 660, f1: 990, glide: 0.06, a: 0.004, d: 0.25, vol: 0.12 });
      return 0.3;
    },
  },
  solved: {
    max: 1, gap: 0.5, vol: 1.0, pv: 0,
    fn(k, t) {
      [72, 76, 79, 84].forEach((m, i) => k.bell(t + i * 0.08, mtof(m), { d: 0.6, vol: 0.09 }));
      k.brass(t + 0.3, mtof(60), 0.4, { vol: 0.1 });
      return 1.0;
    },
  },
  unlock: {
    max: 1, gap: 0.2, vol: 1.0, pv: 0,
    fn(k, t) {
      k.clack(t, 1200, 0.5);
      k.clack(t + 0.09, 1900, 0.4);
      k.thump(t + 0.12, { f0: 180, f1: 70, d: 0.14, vol: 0.4 });
      return 0.35;
    },
  },
  coupon: {
    max: 1, gap: 0.2, vol: 1.0, pv: 0,
    fn(k, t) {
      [79, 83, 86, 91].forEach((m, i) => k.bell(t + i * 0.06, mtof(m), { d: 0.4, vol: 0.08, partials: SPARK }));
      k.tone(t, { type: 'triangle', f: mtof(67), a: 0.01, hold: 0.2, d: 0.2, vol: 0.08 });
      return 0.6;
    },
  },
  eshield: {
    max: 3, gap: 0.05, vol: 0.6, pv: 0.05,
    fn(k, t) {
      k.tone(t, { type: 'sine', f: 1400, f1: 700, glide: 0.08, a: 0.002, d: 0.12, vol: 0.12, vib: 80, vibRate: 40 });
      k.hiss(t, { type: 'bandpass', f: 5000, q: 3, d: 0.06, vol: 0.12 });
      return 0.15;
    },
  },
  uiClick: {
    max: 2, gap: 0.03, vol: 0.8, pv: 0.02,
    fn(k, t) {
      k.tone(t, { f: 1500, f1: 1000, glide: 0.02, a: 0.001, d: 0.035, vol: 0.22 });
      k.hiss(t, { type: 'highpass', f: 4000, d: 0.008, vol: 0.18 });
      k.tone(t, { type: 'square', f: 3000, a: 0.001, d: 0.008, vol: 0.025 });
      return 0.05;
    },
  },
  uiHover: {
    max: 2, gap: 0.04, vol: 0.9, pv: 0.02,
    fn(k, t) {
      k.tone(t, { f: 1800, a: 0.002, d: 0.03, vol: 0.08 });
      k.tone(t, { type: 'triangle', f: 2700, a: 0.002, d: 0.02, vol: 0.03 });
      return 0.04;
    },
  },
  countdown: {
    max: 1, gap: 0.2, vol: 0.8, pv: 0,
    fn(k, t) {
      k.tone(t, { type: 'square', f: 880, a: 0.003, hold: 0.1, d: 0.09, vol: 0.07, lp: 3000 });
      k.tone(t, { f: 880, a: 0.003, hold: 0.1, d: 0.09, vol: 0.2 });
      return 0.22;
    },
  },
  go: {
    max: 1, gap: 0.2, vol: 0.85, pv: 0,
    fn(k, t) {
      k.tone(t, { type: 'square', f: 1760, a: 0.003, hold: 0.24, d: 0.16, vol: 0.05, lp: 5000 });
      k.tone(t, { f: 1760, a: 0.003, hold: 0.24, d: 0.16, vol: 0.18 });
      k.tone(t, { f: 1318.5, a: 0.003, hold: 0.24, d: 0.16, vol: 0.1 });
      k.tone(t, { f: 880, a: 0.003, hold: 0.2, d: 0.2, vol: 0.08 });
      return 0.45;
    },
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

export const SOUND_GROUPS = {
  weapons: ['pistol', 'shotgun', 'smg', 'launcher', 'rail', 'blade', 'punch', 'punchBig', 'bombThrow', 'enemyShot', 'orb', 'acid', 'swipe'],
  impacts: ['hit', 'hitCrit', 'hitmarker', 'killmarker', 'ko', 'hurt', 'wall', 'deflect', 'dodge', 'break', 'breakMetal', 'flip', 'bonk', 'quake'],
  explosions: ['explosion', 'explosionBig', 'barrel'],
  movement: ['jump', 'djump', 'dash', 'land', 'climb', 'step'],
  handling: ['reload', 'reloadDone', 'swap', 'empty', 'pickup', 'pickupWeapon', 'pickupHealth'],
  events: ['wake', 'draw', 'boss', 'enrage', 'superCharge', 'superReady', 'pageTurn', 'gateOpen', 'panelClear', 'spreadClear', 'victory', 'gameover', 'roundOver', 'respawn', 'taunt', 'lowHp', 'uiClick', 'uiHover', 'countdown', 'go'],
};

// ---------------------------------------------------------------- music

const STRAIGHT = [0, 0.25, 0.5, 0.75];
const SWING = [0, 0.2, 0.64, 0.84]; // triplet-ish swung 8ths
// pattern lookup: 'x' = full, digit = velocity/9, '.' = rest
const hit = (pat, s) => {
  const c = pat[s % pat.length];
  return c === '.' ? 0 : c === 'x' ? 1 : +c / 9;
};

// music instruments (all quiet; the bus trims them further)
const I = {
  kick(k, t, v, f0 = 140, f1 = 45, d = 0.32) {
    k.thump(t, { f0, f1, drop: 0.06, d, vol: v });
    k.hiss(t, { type: 'highpass', f: 2500, d: 0.005, vol: v * 0.15 });
  },
  hat(k, t, v, d = 0.03) {
    k.hiss(t, { type: 'highpass', f: 7500, d, vol: v });
  },
  clap(k, t, v, dest) {
    for (let i = 0; i < 3; i++) k.hiss(t + i * 0.011, { type: 'bandpass', f: 1300, q: 1.1, d: i === 2 ? 0.13 : 0.012, vol: v, dest });
  },
  tick(k, t, v) {
    k.hiss(t, { type: 'bandpass', f: 2300, q: 5, d: 0.02, vol: v * 2 });
    k.tone(t, { f: 1600, a: 0.001, d: 0.015, vol: v * 0.4 });
  },
  tom(k, t, f, v, dest) {
    k.thump(t, { f0: f * 1.6, f1: f, drop: 0.08, d: 0.4, vol: v, dest });
  },
  ride(k, t, v) {
    k.hiss(t, { type: 'bandpass', f: 6800, q: 1.2, d: 0.32, vol: v });
    k.fm(t, { f: 5200, ratio: 1.43, index: 1.2, idxEnd: 0.4, d: 0.35, vol: v * 0.35 });
  },
  brush(k, t, v, len) {
    k.hiss(t, { type: 'bandpass', f: 3800, q: 0.7, a: len * 0.5, d: len * 0.5, vol: v });
  },
  bassSaw(k, t, f, dur, v) {
    k.synth(t, f, dur, { types: ['sawtooth', 'square'], spread: 5, a: 0.003, r: 0.05, vol: v, sus: 0.6, cut: [1500, 900, 220], q: 3 });
  },
  pulseBass(k, t, f, dur, v) {
    k.synth(t, f, dur, { types: ['square'], a: 0.003, r: 0.06, vol: v, sus: 0.5, cut: [1800, 1000, 200], q: 5 });
  },
  pluck(k, t, f, v, dest) {
    k.synth(t, f, 0.02, { types: ['square'], a: 0.002, r: 0.17, vol: v, cut: [4200, 3000, 450], q: 4, dest });
  },
  pad(k, t, freqs, dur, v, dest) {
    for (const f of freqs) k.synth(t, f, dur, { types: ['sawtooth', 'sawtooth'], spread: 12, a: 0.5, r: 0.6, vol: v, sus: 0.9, cut: [500, 1200, 700], ca: 0.4, q: 0.7, dest });
  },
  organ(k, t, freqs, dur, v, dest) {
    const e = k.gain(0, dest), gp = e.gain;
    gp.setValueAtTime(0, t);
    gp.linearRampToValueAtTime(v, t + 0.35);
    gp.setValueAtTime(v, t + dur - 0.1);
    gp.exponentialRampToValueAtTime(EPS, t + dur + 0.5);
    const trem = k.gain(0.75, e);
    const len = dur + 0.55;
    k.lfo(t, len, 4.6, 0.25, trem.gain);
    const lp = k.filter('lowpass', 2200, 0.7, trem);
    for (const f of freqs) {
      for (const [h, amp] of [[1, 1], [2, 0.5], [3, 0.28], [4, 0.14]]) k.osc('sine', f * h, t, len, k.gain(amp * 0.5, lp));
    }
  },
  drone(k, t, f, dur, v) {
    k.synth(t, f, dur, { types: ['sine', 'triangle'], spread: 6, a: 0.8, r: 1, vol: v, cut: [300, 700, 400], ca: 0.8 });
  },
  theremin(k, t, f, dur, v, from, dest) {
    k.synth(t, f, dur, { types: ['sine'], a: 0.12, r: 0.35, vol: v, from, glide: 0.18, vib: 28, vibRate: 6.2, vibRise: 0.3, dest });
  },
  upright(k, t, f, dur, v) {
    k.tone(t, { f: f * 1.025, f1: f, glide: 0.03, a: 0.004, d: dur, vol: v });
    k.tone(t, { type: 'triangle', f: f * 2, a: 0.004, d: dur * 0.35, vol: v * 0.3, lp: 900 });
    k.hiss(t, { color: 'pink', type: 'lowpass', f: 400, d: 0.04, vol: v * 0.4 });
  },
  ep(k, t, freqs, dur, v, dest) {
    for (const f of freqs) {
      k.tone(t, { f, a: 0.004, d: dur, vol: v, dest });
      k.tone(t, { f: f * 2, a: 0.002, d: 0.3, vol: v * 0.3, dest });
      k.tone(t, { f: f * 7.1, a: 0.001, d: 0.05, vol: v * 0.08, dest });
    }
  },
  trumpet(k, t, f, dur, v, dest) {
    k.vox(t, {
      f0: f * 0.97, f1: f, glide: 0.05, dur, a: 0.035, r: 0.09, vol: v, vib: 16, vibRate: 5.5, vibRise: Math.min(dur, 0.35),
      formants: [[1250, 3, 2.5], [2600, 1.2, 4], [700, 0.8, 3]], lp: [900, 3400, 1500], dest,
    });
  },
};

// chord tables: [bass root midi, [voicing midi...]]
export const MUSIC = {
  hero: {
    bpm: 146, sub: STRAIGHT, fx: { time: 0.11, fb: 0.28, lp: 3200, wet: 0.35 },
    bars: [[48, [60, 64, 67]], [44, [60, 63, 68]], [46, [62, 65, 70]], [48, [60, 64, 67]], [41, [60, 65, 69]], [44, [60, 63, 68]], [46, [62, 65, 70]], [43, [62, 67, 71]]],
    lead: [
      [[0, 67, 4], [4, 72, 2], [6, 76, 2], [8, 79, 8]], [[0, 80, 6], [6, 79, 2], [8, 75, 8]],
      [[0, 77, 4], [4, 74, 4], [8, 70, 4], [12, 74, 4]], [[0, 72, 4], [4, 76, 4], [8, 79, 8]],
      [[0, 81, 6], [6, 79, 2], [8, 77, 4], [12, 81, 4]], [[0, 84, 6], [6, 82, 2], [8, 80, 8]],
      [[0, 82, 4], [4, 77, 4], [8, 74, 8]], [[0, 83, 4], [4, 86, 4], [8, 79, 8]],
    ],
    step(k, s, b, t, I_, S) {
      const [root, ch] = this.bars[b % 8];
      const st = S.st;
      const dv = 0.85 + 0.3 * I_;
      if (hit(I_ > 0.6 ? 'x.....x.x.x...x.' : 'x.....x.x.......', s)) I.kick(k, t, 0.55 * dv);
      if (s === 4 || s === 12) k.snare(t, 0.26 * dv, 0.14, S.fx);
      if (I_ > 0.5 && s === 15) k.snare(t, 0.07);
      if (b % 8 === 7 && s >= 12 && I_ > 0.3) I.tom(k, t, [196, 165, 131, 110][s - 12], 0.25, S.dry);
      if (s % 2 === 0) I.hat(k, t, s % 4 === 2 ? 0.07 : 0.045);
      else if (I_ > 0.45) I.hat(k, t, 0.03);
      if (s === 0 && b % 4 === 0 && I_ > 0.4) k.crash(t, 0.07, 1.0);
      if (s % 2 === 0) I.bassSaw(k, t, mtof(root - 12 + (s % 8 === 6 ? 12 : 0)), st * 1.5, 0.2);
      const sv = hit('9..6..7...8.6...', s);
      if (sv) {
        const long = s === 10;
        for (const m of [...ch, ch[0] + 12]) k.brass(t, mtof(m), long ? st * 3 : st * 0.9, { vol: 0.05 * sv, bright: 4 + 2 * I_, dest: S.fx });
      }
      if (I_ > 0.6) {
        for (const [ss, m, len] of this.lead[b % 8]) {
          if (ss === s) k.synth(t, mtof(m), len * st * 0.95, { types: ['sawtooth', 'sawtooth'], spread: 10, a: 0.03, r: 0.12, vol: 0.09, sus: 0.85, cut: [mtof(m) * 1.2, mtof(m) * 5, mtof(m) * 2.5], q: 1.2, vib: 15, vibRise: 0.25, dest: S.fx });
        }
      }
    },
  },

  zombie: {
    bpm: 70, sub: STRAIGHT, fx: { time: 0.43, fb: 0.42, lp: 1400, wet: 0.45 },
    bars: [[38, [50, 53, 57]], [34, [50, 53, 58]], [43, [50, 55, 58]], [45, [49, 52, 57]], [38, [50, 53, 57]], [39, [51, 55, 58]], [38, [50, 53, 57]], [45, [49, 52, 57]]],
    lead: [[74, 73], [74, 77], [74, 70], [73, 76], [81, 77], [79, 75], [74, 72], [73, 69]],
    step(k, s, b, t, I_, S) {
      const [root, ch] = this.bars[b % 8];
      const st = S.st;
      if (s === 0) {
        I.organ(k, t, ch.map(mtof), 16 * st, 0.05, S.dry);
        I.drone(k, t, mtof(root - 12), 16 * st, 0.16);
      }
      if (hit(I_ > 0.6 ? 'x.........x..x..' : 'x.........x.....', s)) I.kick(k, t, 0.6, 100, 36, 0.6);
      if (s === 8) k.snare(t, 0.22, 0.3, S.fx);
      if (I_ > 0.35 && b % 2 === 1 && s >= 13) I.tom(k, t, [110, 92, 82][s - 13], 0.28, S.fx);
      if (I_ > 0.25 && s % 4 === 0) I.tick(k, t, 0.05);
      if (I_ > 0.5 && s % 8 === 0) {
        const m = this.lead[b % 8][s / 8];
        I.theremin(k, t, mtof(m), 7 * st, 0.07, S.prevLead || 0, S.fx);
        S.prevLead = mtof(m);
      }
      if (I_ > 0.75 && s % 2 === 0) k.bell(t, mtof(ch[(s / 2) % 3] + 24), { d: 0.5, vol: 0.022, dest: S.fx });
    },
  },

  space: {
    bpm: 118, sub: STRAIGHT, fx: { time: 0.381, fb: 0.38, lp: 2600, wet: 0.4 },
    bars: [[45, [57, 60, 64]], [41, [57, 60, 65]], [48, [55, 60, 64]], [43, [55, 59, 62]], [45, [57, 60, 64]], [41, [57, 60, 65]], [43, [55, 59, 62]], [40, [56, 59, 64]]],
    arp: [0, 1, 2, 3, 4, 3, 2, 1],
    lead: [
      [[0, 76, 6], [6, 74, 2], [8, 72, 8]], [[0, 69, 4], [4, 72, 4], [8, 77, 8]],
      [[0, 76, 6], [6, 79, 2], [8, 76, 8]], [[0, 74, 8], [8, 71, 8]],
      [[0, 76, 4], [4, 81, 4], [8, 79, 4], [12, 76, 4]], [[0, 77, 8], [8, 76, 4], [12, 72, 4]],
      [[0, 74, 6], [6, 76, 2], [8, 79, 8]], [[0, 80, 8], [8, 76, 8]],
    ],
    step(k, s, b, t, I_, S) {
      const [root, ch] = this.bars[b % 8];
      const st = S.st;
      if (s % 4 === 0) I.kick(k, t, 0.5, 130, 42, 0.28);
      if (s % 4 === 2) I.hat(k, t, 0.065, 0.05);
      else if (I_ > 0.5 && s % 2 === 1) I.hat(k, t, 0.025);
      if (I_ > 0.3 && (s === 4 || s === 12)) I.clap(k, t, 0.22, S.fx);
      if (s % 2 === 0) I.pulseBass(k, t, mtof(root - 12 + (s % 4 === 2 ? 12 : 0)), st * 1.4, 0.2);
      if (I_ > 0.3 || s % 2 === 0) {
        const tones = [ch[0], ch[1], ch[2], ch[0] + 12, ch[1] + 12];
        I.pluck(k, t, mtof(tones[this.arp[s % 8]] + 12), 0.06, S.fx);
      }
      if (s === 0) I.pad(k, t, ch.map(mtof), 16 * st, 0.035, S.dry);
      if (I_ > 0.65) {
        for (const [ss, m, len] of this.lead[b % 8]) {
          if (ss === s) {
            k.synth(t, mtof(m), len * st * 0.95, { types: ['sawtooth', 'square'], spread: 6, a: 0.01, r: 0.12, vol: 0.07, cut: [1800, 3500, 1500], q: 2, from: S.prevLead || 0, glide: 0.06, vib: 18, vibRise: 0.2, dest: S.fx });
            S.prevLead = mtof(m);
          }
        }
      }
    },
  },

  noir: {
    bpm: 92, sub: SWING, fx: { time: 0.09, fb: 0.3, lp: 2500, wet: 0.35 },
    // [root, walking tones (semitones), comp voicing]
    bars: [
      [36, [0, 3, 7, 10], [51, 55, 58, 62]], [41, [0, 3, 7, 10], [51, 56, 60, 63]],
      [38, [0, 3, 6, 10], [50, 53, 56, 60]], [43, [0, 4, 7, 10], [53, 56, 59, 62]],
      [36, [0, 3, 7, 10], [51, 55, 58, 62]], [44, [0, 4, 7, 10], [54, 60, 63, 66]],
      [38, [0, 3, 6, 10], [50, 53, 56, 60]], [43, [0, 4, 7, 10], [53, 56, 59, 62]],
    ],
    phrases: [
      [[0, 67, 3], [4, 70, 2], [6, 72, 6], [12, 70, 2], [14, 67, 2]],
      [[2, 75, 2], [4, 74, 2], [6, 72, 4], [10, 70, 2], [12, 67, 4]],
      [[0, 63, 2], [2, 65, 2], [4, 66, 2], [6, 67, 6], [14, 70, 2]],
      [[0, 72, 8], [8, 70, 2], [10, 67, 2], [12, 63, 4]],
    ],
    step(k, s, b, t, I_, S) {
      const [root, walk, comp] = this.bars[b % 8];
      const st = S.st;
      // walking upright bass on every beat
      if (s % 4 === 0) {
        const beat = s / 4;
        let n;
        if (beat === 0) n = root;
        else if (beat === 1) n = root + pick([walk[1], walk[2]]);
        else if (beat === 2) n = root + pick([walk[2], walk[3], 12]);
        else n = this.bars[(b + 1) % 8][0] + pick([-1, 1, 2]);
        while (n > 50) n -= 12;
        while (n < 33) n += 12;
        I.upright(k, t, mtof(n), S.spb * 0.95, 0.32);
      }
      // brushes + ride
      if (s % 4 === 0) I.brush(k, t, 0.05, S.spb * 0.35);
      if (s === 4 || s === 12) k.snare(t, 0.07, 0.1);
      const rv = hit('7...9.5.7...9.5.', s);
      if (rv) I.ride(k, t, 0.05 * rv);
      if (s === 0) I.kick(k, t, 0.2, 110, 45, 0.25);
      if (I_ > 0.6 && s === 10) I.kick(k, t, 0.14, 110, 45, 0.25);
      // electric piano comping
      if (I_ > 0.3 && (s === 6 || (s === 14 && b % 2 === 1))) I.ep(k, t, comp.map(mtof), s === 6 ? S.spb * 0.9 : S.spb * 1.8, 0.03, S.fx);
      // muted trumpet phrases
      if (b % 2 === 1 || I_ > 0.5) {
        const ph = this.phrases[(I_ > 0.5 ? b : b >> 1) % 4];
        for (const [ss, m, len] of ph) if (ss === s) I.trumpet(k, t, mtof(m), len * st * 0.92, 0.1, S.fx);
      }
    },
  },
};

export const MUSIC_KEYS = Object.keys(MUSIC);

function makeFx(ctx, dest, { time, fb, lp, wet }) {
  const input = ctx.createGain();
  const dl = ctx.createDelay(2);
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  const w = ctx.createGain();
  dl.delayTime.value = time;
  f.type = 'lowpass';
  f.frequency.value = lp;
  g.gain.value = fb;
  w.gain.value = wet;
  input.connect(dest);
  input.connect(dl);
  dl.connect(f);
  f.connect(g);
  g.connect(dl);
  f.connect(w);
  w.connect(dest);
  return { input, nodes: [input, dl, f, g, w] };
}

// finish a kit: a silent keeper source outlives every node (incl. reverb tails)
// and its onended disconnects the whole voice. Returns the keeper.
function finishKit(k, t, dur, extra) {
  const ctx = k.ctx;
  const end = Math.max(t + dur, k.end) + k.tail + 0.05;
  const keeper = ctx.createConstantSource();
  keeper.offset.value = 0;
  keeper.connect(k.out);
  keeper.start(t);
  keeper.stop(end);
  keeper.onended = () => {
    for (const n of k.nodes) {
      try { n.disconnect(); } catch { /* already gone */ }
    }
    try { keeper.disconnect(); } catch { /* ignore */ }
    if (extra) extra();
  };
  return { keeper, end };
}

/** One running backing track. Works on live and offline contexts. */
export class MusicSession {
  constructor(ctx, dest, key, getIntensity = () => 0.5, startAt = ctx.currentTime + 0.06) {
    this.ctx = ctx;
    this.key = key;
    this.th = MUSIC[key];
    this.getI = getIntensity;
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, startAt);
    this.out.gain.linearRampToValueAtTime(1, startAt + 0.9);
    this.out.connect(dest);
    this.fx = this.th.fx ? makeFx(ctx, this.out, this.th.fx) : null;
    this.spb = 60 / this.th.bpm;
    this.S = { spb: this.spb, st: this.spb / 4, dry: this.out, fx: this.fx ? this.fx.input : this.out };
    this.step = 0;
    this.t0 = startAt;
    this.I = getIntensity();
    this.stopped = false;
  }

  timeOf(i) {
    return this.t0 + (Math.floor(i / 4) + this.th.sub[i % 4]) * this.spb;
  }

  schedule(until, silent = false) {
    if (this.stopped) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // fell far behind (tab throttled / suspended): jump ahead by whole bars
    if (this.timeOf(this.step) < now - 0.3) {
      const bar = 4 * this.spb;
      this.t0 += Math.ceil((now - this.timeOf(this.step)) / bar) * bar;
    }
    let guard = 0;
    while (guard++ < 256) {
      const t = this.timeOf(this.step);
      if (t >= until) break;
      this.I += (clamp(this.getI(), 0, 1) - this.I) * 0.25;
      if (!silent && t >= now - 0.01) {
        const k = new Kit(ctx, this.out, 1);
        const s = this.step % 16, b = Math.floor(this.step / 16);
        this.th.step(k, s, b, t, this.I, this.S);
        if (k.nodes.length) finishKit(k, t, 0.1);
      }
      this.step++;
    }
  }

  stop(fade = 0.6) {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    const g = this.out.gain;
    try {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + fade);
    } catch { /* ignore */ }
    const nodes = [this.out, ...(this.fx ? this.fx.nodes : [])];
    // wait for already-scheduled long notes (organ / drone / pad) to finish so
    // their keepers still reach the destination and clean themselves up
    setTimeout(() => nodes.forEach((n) => { try { n.disconnect(); } catch { /* ignore */ } }), (fade + 6) * 1000);
  }
}

// ---------------------------------------------------------------- offline rendering (analysis / tests)

/**
 * Render one sound into an OfflineAudioContext.
 * `master: true` routes it through the full master chain (compressor / limiter / clip).
 */
export async function renderSound(name, { sampleRate = 44100, seconds = 0, pitch = 1, master = false, clip = true } = {}) {
  const def = SOUNDS[name];
  if (!def) throw new Error(`unknown sound ${name}`);
  const len = seconds || def.len || 2.5;
  // Chrome's DynamicsCompressor starts "cold" in a fresh context and swallows
  // the first few hundred ms, so master renders start the sound at 0.6s.
  const t0 = master ? 0.6 : 0;
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * (len + t0)), sampleRate);
  const dest = master ? buildMaster(ctx).sfx : ctx.destination;
  const k = new Kit(ctx, voiceInput(ctx, def, dest, clip).input, pitch);
  const dur = def.fn(k, t0);
  const buffer = await ctx.startRendering();
  return { buffer, nominal: dur, tail: k.tail, nodes: k.nodes.length, budget: len };
}

/** Render a list of events [{name, t, vol, pan, pitch}] through the master chain. */
export async function renderScene(events, { seconds = 3, sampleRate = 44100, music = null, intensity = 1 } = {}) {
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * seconds), sampleRate);
  const m = buildMaster(ctx);
  for (const ev of events) {
    const def = SOUNDS[ev.name];
    if (!def) continue;
    const vg = ctx.createGain();
    vg.gain.value = ev.vol ?? 1;
    const pn = ctx.createStereoPanner();
    pn.pan.value = ev.pan || 0;
    vg.connect(pn);
    pn.connect(m.sfx);
    const k = new Kit(ctx, voiceInput(ctx, def, vg).input, ev.pitch || 1);
    def.fn(k, ev.t || 0);
  }
  if (music) {
    const ms = new MusicSession(ctx, m.music, music, () => intensity, 0);
    ms.schedule(seconds);
  }
  return ctx.startRendering();
}

/** Render a music theme (music bus only, before master) for analysis. */
export async function renderMusic(key, { seconds = 6, sampleRate = 44100, intensity = 0.5 } = {}) {
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * seconds), sampleRate);
  const ms = new MusicSession(ctx, ctx.destination, key, () => intensity, 0);
  ms.I = intensity;
  ms.schedule(seconds - 0.5);
  return ctx.startRendering();
}

/**
 * Stats for an AudioBuffer: peak, RMS over the audible part, `loud` = the
 * loudest 50 ms RMS window (a rough short-term loudness), and the audible
 * duration (last sample above -60 dBFS).
 */
export function analyze(buffer, threshold = 0.001) {
  let peak = 0, sum = 0, n = 0, last = 0, bad = 0;
  const sr = buffer.sampleRate;
  const win = Math.max(1, Math.round(sr * 0.05));
  let loud = 0;
  {
    const d = buffer.getChannelData(0);
    let acc = 0;
    for (let i = 0; i < d.length; i++) {
      const v = Number.isFinite(d[i]) ? d[i] : 0;
      acc += v * v;
      if (i >= win) { const o = Number.isFinite(d[i - win]) ? d[i - win] : 0; acc -= o * o; }
      if (i >= win - 1) loud = Math.max(loud, acc / win);
    }
    loud = Math.sqrt(Math.max(loud, 0));
  }
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) { bad++; continue; }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a > threshold && i > last) last = i;
    }
  }
  const end = last + 1;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < end; i++) { sum += d[i] * d[i]; n++; }
  }
  return { peak, rms: n ? Math.sqrt(sum / n) : 0, loud, duration: end / sr, nonFinite: bad };
}

// ---------------------------------------------------------------- GameAudio

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.bus = null;
    this._vol = 0.8;
    this._musicVol = 0.6;
    this._muted = false;
    this._lx = 0;
    this._ly = 0;
    this._zoom = 1.3;
    this._voices = [];
    this._last = Object.create(null);
    this._warned = new Set();
    this._intensity = 0.3;
    this._wantTheme = null;
    this._music = null;
    this._timer = null;
    this._panner = false;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get muted() {
    return this._muted;
  }

  get volume() {
    return this._vol;
  }

  get musicVolume() {
    return this._musicVol;
  }

  get theme() {
    return this._music ? this._music.key : null;
  }

  /** Create / resume the AudioContext. Call from a user gesture; safe to repeat. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) return;
        const ctx = new AC({ latencyHint: 'interactive' });
        this.ctx = ctx;
        this.bus = buildMaster(ctx);
        this._panner = typeof ctx.createStereoPanner === 'function';
        this._applyVolumes(0);
        getBank(ctx);
        // iOS: a silent one-sample buffer inside the gesture fully unlocks output
        const b = ctx.createBufferSource();
        b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        b.connect(ctx.destination);
        b.start(0);
        ctx.addEventListener?.('statechange', () => {
          if (this.ctx === ctx && ctx.state === 'running') this._syncMusic();
        });
      }
      if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') {
        const p = this.ctx.resume();
        if (p && p.then) p.then(() => this._syncMusic(), () => {});
      }
      this._syncMusic();
    } catch (e) {
      this._warnOnce('unlock', e);
    }
  }

  /** Listener = camera center (world units) and camera zoom (world -> screen scale). */
  setListener(x, y, zoom) {
    if (Number.isFinite(x)) this._lx = x;
    if (Number.isFinite(y)) this._ly = y;
    if (Number.isFinite(zoom) && zoom > 0) this._zoom = zoom;
  }

  setVolume(v) {
    this._vol = clamp(Number(v) || 0, 0, 1);
    this._applyVolumes();
  }

  setMuted(m) {
    this._muted = !!m;
    this._applyVolumes();
    if (this._muted) this.stopAll();
  }

  setMusicVolume(v) {
    this._musicVol = clamp(Number(v) || 0, 0, 1);
    this._applyVolumes();
  }

  setIntensity(v) {
    this._intensity = clamp(Number(v) || 0, 0, 1);
  }

  _applyVolumes(tc = 0.03) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const set = (p, v) => (tc ? p.setTargetAtTime(v, now, tc) : p.setValueAtTime(v, now));
    set(this.bus.master.gain, this._muted ? 0 : this._vol);
    set(this.bus.music.gain, this._musicVol * MUSIC_LEVEL);
  }

  _warnOnce(key, e) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(`[GameAudio] ${key}`, e || '');
  }

  // distance attenuation / pan / air-absorption lowpass for a world position
  _spatial(def, x, y) {
    const dx = x - this._lx, dy = y - this._ly;
    // zoomed out -> the whole page is on screen -> hear further
    const s = clamp(Math.pow(this._zoom / 1.3, 0.75), 0.25, 1.25);
    const d = Math.hypot(dx, dy) * s;
    let g = 1, lp = 0;
    if (d > NEAR) {
      const u = (d - NEAR) / (FAR - NEAR);
      g = Math.pow(FLOOR, u);
      if (!def.minor) g = Math.max(g, FLOOR);
      lp = clamp(16000 * Math.pow(0.2, u), 2500, 16000);
      if (lp > 14000) lp = 0;
    }
    const pan = clamp((dx * this._zoom) / 1100, -1, 1) * 0.8;
    return { g, pan, lp };
  }

  /**
   * Play a sound. opts: { x, y, vol = 1, pitch = 1, pan }.
   * Returns true when a voice was started.
   */
  play(name, opts = {}) {
    const def = SOUNDS[name];
    if (!def) {
      this._warnOnce(`unknown sound "${name}"`);
      return false;
    }
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this._muted) return false;
    try {
      opts = opts || {};
      const now = ctx.currentTime;
      const last = this._last[name];
      if (def.gap && last !== undefined && now - last < def.gap && now >= last) return false;

      let gain = (Number.isFinite(opts.vol) ? Math.max(0, opts.vol) : 1) * (def.vol ?? 1);
      let pan = 0, lp = 0;
      if (Number.isFinite(opts.x) && Number.isFinite(opts.y)) {
        const sp = this._spatial(def, opts.x, opts.y);
        gain *= sp.g;
        pan = sp.pan;
        lp = sp.lp;
      }
      if (Number.isFinite(opts.pan)) pan = clamp(opts.pan, -1, 1);
      if (gain < 0.02) return false; // inaudible: don't spend nodes on it
      gain = Math.min(gain, 1.5);
      this._last[name] = now;

      // voice limiting: per-name first, then global
      this._voices = this._voices.filter((v) => !v.reaped);
      const live = this._voices.filter((v) => !v.dead && v.mainEnd > now);
      const mine = live.filter((v) => v.name === name);
      const max = def.max || 4;
      for (let i = 0; i <= mine.length - max; i++) this._kill(mine[i], now);
      const alive = live.filter((v) => !v.dead);
      for (let i = 0; i <= alive.length - MAX_VOICES; i++) this._kill(alive[i], now);

      const p = clamp(Number.isFinite(opts.pitch) ? opts.pitch : 1, 0.25, 4) * (1 + (Math.random() * 2 - 1) * (def.pv ?? 0.04));
      this._spawn(name, def, now, p, gain, pan, lp);
      if (def.duck) this._duck(def.duck[0], def.duck[1]);
      return true;
    } catch (e) {
      this._warnOnce(`play("${name}") failed`, e);
      return false;
    }
  }

  _spawn(name, def, t, p, gain, pan, lp) {
    const ctx = this.ctx;
    const vg = ctx.createGain();
    vg.gain.value = gain;
    const chain = [vg];
    let head = vg;
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      head.connect(f);
      head = f;
      chain.push(f);
    }
    if (pan && this._panner) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      head.connect(pn);
      head = pn;
      chain.push(pn);
    }
    head.connect(this.bus.sfx);
    const vin = voiceInput(ctx, def, vg);
    chain.push(...vin.nodes);
    const k = new Kit(ctx, vin.input, p);
    const voice = { name, t, mainEnd: t, k, vg, chain, keeper: null, dead: false, reaped: false };
    let dur = 0.5;
    try {
      dur = def.fn(k, t) || 0.5;
    } catch (e) {
      this._warnOnce(`sound "${name}" failed to build`, e);
    }
    voice.mainEnd = t + dur;
    const fin = finishKit(k, t, dur, () => {
      voice.reaped = true;
      for (const n of chain) {
        try { n.disconnect(); } catch { /* ignore */ }
      }
    });
    voice.keeper = fin.keeper;
    this._voices.push(voice);
    return voice;
  }

  _kill(v, now) {
    if (v.dead) return;
    v.dead = true;
    try {
      const g = v.vg.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.02);
      for (const s of v.k.srcs) {
        try { s.stop(now + 0.03); } catch { /* ignore */ }
      }
      v.keeper.stop(now + 0.05);
    } catch { /* ignore */ }
  }

  /** Fade out every playing sound effect (music keeps going). */
  stopAll() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const v of this._voices) this._kill(v, now);
  }

  _duck(amount, hold) {
    if (!this.bus) return;
    const g = this.bus.duck.gain;
    const now = this.ctx.currentTime;
    try {
      g.cancelScheduledValues(now);
      g.setTargetAtTime(Math.min(amount, g.value), now, 0.02);
      g.setTargetAtTime(1, now + hold, 0.35);
    } catch { /* ignore */ }
  }

  // ------------------------------------------------------------ music

  /** Start a looping genre track ('hero' | 'zombie' | 'space' | 'noir'), or null to stop. */
  music(key) {
    if (key && !MUSIC[key]) {
      this._warnOnce(`unknown music theme "${key}"`);
      key = null;
    }
    this._wantTheme = key || null;
    this._syncMusic();
  }

  _syncMusic() {
    const ctx = this.ctx;
    if (!ctx) return;
    const want = this._wantTheme;
    if (this._music && this._music.key === want) return;
    if (this._music) {
      this._music.stop();
      this._music = null;
    }
    if (want && ctx.state === 'running') {
      this._music = new MusicSession(ctx, this.bus.music, want, () => this._intensity);
      this._music.I = this._intensity;
    }
    if (this._music && !this._timer) {
      this._timer = setInterval(() => this._tick(), TICK_MS);
      this._tick();
    } else if (!this._music && this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  _tick() {
    const m = this._music;
    const ctx = this.ctx;
    if (!m || !ctx || ctx.state !== 'running') return;
    try {
      const hidden = typeof document !== 'undefined' && document.hidden;
      m.schedule(ctx.currentTime + (hidden ? 1.5 : LOOKAHEAD), this._muted);
    } catch (e) {
      this._warnOnce('music scheduler failed', e);
    }
  }

  /** Number of sfx voices currently alive (for debugging / tests). */
  get voiceCount() {
    return this._voices.filter((v) => !v.reaped).length;
  }
}

export default GameAudio;
