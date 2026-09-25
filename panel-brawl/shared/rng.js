// Seeded randomness. Level generation must be reproducible from a seed, and
// weapon spread uses a stateless hash so client prediction matches the server.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }
  f() { return this.next(); }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  // weighted pick from {key: weight}
  weighted(obj) {
    let total = 0;
    for (const k in obj) total += obj[k];
    let r = this.next() * total;
    for (const k in obj) {
      r -= obj[k];
      if (r <= 0) return k;
    }
    return Object.keys(obj)[0];
  }
}

// Stateless hash -> [0,1). Same inputs give the same output everywhere.
export function hash01(a, b = 0, c = 0, d = 0) {
  let h = 2166136261 >>> 0;
  const mix = (n) => {
    n = n | 0;
    h ^= n & 0xffff;
    h = Math.imul(h, 16777619);
    h ^= n >>> 16;
    h = Math.imul(h, 16777619);
  };
  mix(a); mix(b); mix(c); mix(d);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}
