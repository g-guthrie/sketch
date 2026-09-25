// Procedural comic issues.
//   generateComic(seed)            -> cover/meta for a whole issue
//   generateSpread(comic, i, mode) -> one playable two-page spread (a "level")
//
// A spread is two pages side by side. Each page is a grid of panels (rows are
// shared across the spread so floors line up). Panels are rooms walled by
// their ink borders; doors cut through side borders + gutters, and holes with
// ladders connect rows. Story mode threads a "reading path" through every
// panel in a snake and gates each step until the previous panel is cleared.

import { RNG } from './rng.js';
import { THEMES, THEME_KEYS } from './themes.js';
import { LAYOUT as L, MODES } from './constants.js';
import { HEAVY_KEYS } from './weapons.js';
import { SOLID, ONEWAY } from './physics.js';

export const SPREADS_PER_ISSUE = 3;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const PUBLISHERS = ['PANEL COMICS GROUP', 'INKWELL PRESS', 'KAPOW PUBLICATIONS', 'GUTTER COMICS', 'HALFTONE HOUSE'];

export function generateComic(seed, opts = {}) {
  const rng = new RNG(seed);
  const theme = opts.theme && THEMES[opts.theme] ? opts.theme : rng.pick(THEME_KEYS);
  const th = THEMES[theme];
  let title;
  if (theme === 'noir' && rng.chance(0.3)) title = 'DETECTIVE TALES OF THE ' + rng.pick(['NAKED CITY', 'CRIMSON RAIN', 'COLD ALIBI']);
  else title = rng.pick(th.titleA) + ' ' + rng.pick(th.titleB);
  const chapters = rng.shuffle(th.chapters.slice()).slice(0, SPREADS_PER_ISSUE);
  return {
    seed,
    theme,
    title,
    issue: rng.int(1, 499),
    price: rng.pick(['10¢', '12¢', '15¢', '20¢', '25¢', '35¢']),
    month: rng.pick(MONTHS),
    year: rng.int(1954, 1989),
    publisher: rng.pick(PUBLISHERS),
    blurb: rng.pick(th.blurbs),
    spreads: SPREADS_PER_ISSUE,
    chapters,
    villain: th.enemies.boss.name,
    coverSeed: rng.int(1, 1e9),
  };
}

function splitSizes(rng, total, n, min) {
  const extra = Math.max(0, total - n * min);
  const ws = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.range(0.5, 1.5);
    ws.push(w);
    sum += w;
  }
  const out = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const s = i === n - 1 ? total - acc : Math.round(min + (extra * ws[i]) / sum);
    out.push(s);
    acc += s;
  }
  return out;
}

const overlap = (a, b, pad = 0) =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

export function findPanel(level, x, y, margin = 0) {
  for (const p of level.panels) {
    if (x >= p.x1 - margin && x <= p.x2 + margin && y >= p.y1 - margin && y <= p.y2 + margin) return p;
  }
  return null;
}

export function nearestPanel(level, x, y) {
  let best = null, bd = Infinity;
  for (const p of level.panels) {
    const dx = x < p.x1 ? p.x1 - x : x > p.x2 ? x - p.x2 : 0;
    const dy = y < p.y1 ? p.y1 - y : y > p.y2 ? y - p.y2 : 0;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

export function generateSpread(comic, index, mode, opts = {}) {
  const th = THEMES[comic.theme];
  const story = mode === MODES.STORY;
  const withEnemies = story || !!opts.chaos;
  const final = story && index === comic.spreads - 1;
  const rng = new RNG((comic.seed ^ Math.imul(index + 1, 0x9e3779b1) ^ (story ? 0 : 0x5bd1e995)) >>> 0);
  const B = L.border;

  const level = {
    index, mode, theme: comic.theme, final,
    width: L.pageW * 2, height: L.pageH,
    chapter: comic.chapters[index % comic.chapters.length],
    pages: [], panels: [], path: [],
    solids: [], oneways: [], ladders: [], stairs: [], links: [], gates: [],
    props: [], pickups: [], spawns: [], enemies: [], decor: [],
  };
  let uid = 1;
  const nextId = () => uid++;

  // ---------- Page grid ----------
  const rowCount = rng.chance(0.3) ? 2 : 3;
  const contentH = L.pageH - L.marginTop - L.marginBottom;
  const heights = splitSizes(rng, contentH - (rowCount - 1) * L.gutterY, rowCount, rowCount === 2 ? 800 : 560);
  const rows = [];
  let yy = L.marginTop;
  for (const h of heights) { rows.push({ y1: yy, y2: yy + h }); yy += h + L.gutterY; }
  const rowScenes = rows.map(() => rng.pick(th.scenes));

  for (let page = 0; page < 2; page++) {
    const ox = page * L.pageW;
    level.pages.push({ x: ox, y: 0, w: L.pageW, h: L.pageH, num: index * 2 + page + 1 });
    const cx1 = ox + (page === 0 ? L.marginOuter : L.marginInner);
    const cx2 = ox + L.pageW - (page === 0 ? L.marginInner : L.marginOuter);
    const cw = cx2 - cx1;
    for (let r = 0; r < rowCount; r++) {
      let cols;
      if (final && page === 1 && r === 0) cols = 1;
      else cols = +rng.weighted({ 1: 0.18, 2: 0.55, 3: 0.27 });
      const widths = splitSizes(rng, cw - (cols - 1) * L.gutterX, cols, cols === 3 ? 420 : 480);
      let x = cx1;
      for (let c = 0; c < cols; c++) {
        const scene = rng.chance(0.75) ? rowScenes[r] : rng.pick(th.scenes);
        level.panels.push({
          id: level.panels.length, page, row: r, col: c, cols,
          x1: x, y1: rows[r].y1, x2: x + widths[c], y2: rows[r].y2,
          scene, seed: rng.int(1, 1e9), caption: null, order: -1,
        });
        x += widths[c] + L.gutterX;
      }
    }
  }

  const rowPanels = (page, r) => level.panels.filter((p) => p.page === page && p.row === r).sort((a, b) => a.col - b.col);

  // ---------- Reading path (snake) ----------
  const path = [];
  let dir = rowCount % 2 === 1 ? 1 : -1;
  for (let r = 0; r < rowCount; r++) {
    const row = rowPanels(0, r);
    if (dir < 0) row.reverse();
    path.push(...row);
    dir = -dir;
  }
  dir = 1;
  for (let r = rowCount - 1; r >= 0; r--) {
    const row = rowPanels(1, r);
    if (dir < 0) row.reverse();
    path.push(...row);
    dir = -dir;
  }
  path.forEach((p, i) => { p.order = i; });
  level.path = path.map((p) => p.id);
  const last = path[path.length - 1];
  if (final) last.boss = true;

  // captions
  for (const p of level.panels) {
    if (p.order === 0 || rng.chance(0.55)) p.caption = rng.pick(th.captions);
  }

  // ---------- Links ----------
  const linkKey = new Set();
  function addDoor(A, Bp, pathFrom) {
    // A is left of Bp in the same row
    const k = 'd' + A.id + ':' + Bp.id;
    if (linkKey.has(k)) return;
    linkKey.add(k);
    const floor = A.y2;
    level.links.push({
      id: level.links.length, kind: 'door', a: A.id, b: Bp.id,
      x1: A.x2, x2: Bp.x1, y1: floor - L.doorH, y2: floor,
      path: pathFrom != null, from: pathFrom, gate: story && pathFrom != null,
    });
  }
  function addHole(U, D, side, pathFrom) {
    const k = 'h' + U.id + ':' + D.id;
    if (linkKey.has(k)) return;
    linkKey.add(k);
    const ox1 = Math.max(U.x1, D.x1), ox2 = Math.min(U.x2, D.x2);
    let hx;
    if (side > 0) hx = ox2 - 160 - L.holeW;
    else if (side < 0) hx = ox1 + 160;
    else hx = rng.range(ox1 + 150, ox2 - 150 - L.holeW);
    hx = Math.round(Math.max(ox1 + 40, Math.min(ox2 - 40 - L.holeW, hx)));
    level.links.push({
      id: level.links.length, kind: 'hole', a: U.id, b: D.id,
      x1: hx, x2: hx + L.holeW, y1: U.y2, y2: D.y1,
      path: pathFrom != null, from: pathFrom, gate: story && pathFrom != null,
    });
  }

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    if (a.page === b.page && a.row === b.row) {
      if (a.x1 < b.x1) addDoor(a, b, a.id); else addDoor(b, a, a.id);
    } else if (a.page === b.page) {
      const upper = a.row < b.row ? a : b;
      const lower = a.row < b.row ? b : a;
      const side = a.col === a.cols - 1 ? 1 : a.col === 0 ? -1 : 0;
      addHole(upper, lower, side, a.id);
    } else {
      addDoor(a, b, a.id); // spine crossing, a is on the left page
    }
  }

  if (!story) {
    // extra loops for brawl: cross the spine on every row, extra vertical shafts
    for (let r = 0; r < rowCount; r++) {
      const L0 = rowPanels(0, r), R0 = rowPanels(1, r);
      addDoor(L0[L0.length - 1], R0[0], null);
    }
    for (let page = 0; page < 2; page++) {
      for (let r = 0; r < rowCount - 1; r++) {
        const ups = rowPanels(page, r), downs = rowPanels(page, r + 1);
        const pairs = [];
        for (const u of ups) for (const d of downs) {
          const ov = Math.min(u.x2, d.x2) - Math.max(u.x1, d.x1);
          if (ov >= 420) pairs.push([u, d]);
        }
        rng.shuffle(pairs);
        const existing = level.links.filter((l) => l.kind === 'hole' && pairs.some(([u, d]) => u.id === l.a && d.id === l.b));
        const want = existing.length ? 1 : 2;
        let added = 0;
        for (const [u, d] of pairs) {
          if (added >= want) break;
          if (level.links.some((l) => l.kind === 'hole' && l.a === u.id && l.b === d.id)) continue;
          addHole(u, d, 0, null);
          added++;
        }
      }
    }
  }

  // ---------- Borders, passages, ladders ----------
  const addSolid = (x, y, w, h, k, extra) => {
    if (w <= 0.5 || h <= 0.5) return null;
    const r = { x, y, w, h, t: SOLID, k, ...extra };
    level.solids.push(r);
    return r;
  };
  const addHSeg = (x1, x2, y, h, gaps, k) => {
    gaps.sort((a, b) => a[0] - b[0]);
    let cur = x1;
    for (const [g1, g2] of gaps) {
      addSolid(cur, y, g1 - cur, h, k);
      cur = g2;
    }
    addSolid(cur, y, x2 - cur, h, k);
  };

  const reserved = new Map(level.panels.map((p) => [p.id, []]));
  for (const P of level.panels) {
    const doorL = level.links.some((l) => l.kind === 'door' && l.b === P.id);
    const doorR = level.links.some((l) => l.kind === 'door' && l.a === P.id);
    const floorHoles = level.links.filter((l) => l.kind === 'hole' && l.a === P.id);
    const ceilHoles = level.links.filter((l) => l.kind === 'hole' && l.b === P.id);
    const res = reserved.get(P.id);
    addHSeg(P.x1 - B, P.x2 + B, P.y1 - B, B, ceilHoles.map((h) => [h.x1, h.x2]), 'border');
    addHSeg(P.x1 - B, P.x2 + B, P.y2, B, floorHoles.map((h) => [h.x1, h.x2]), 'border');
    const h = P.y2 - P.y1;
    if (doorL) {
      addSolid(P.x1 - B, P.y1 - B, B, P.y2 - L.doorH - (P.y1 - B), 'border');
      res.push({ x: P.x1, y: P.y2 - 180, w: 140, h: 180, why: 'door' });
    } else addSolid(P.x1 - B, P.y1 - B, B, h + 2 * B, 'border');
    if (doorR) {
      addSolid(P.x2, P.y1 - B, B, P.y2 - L.doorH - (P.y1 - B), 'border');
      res.push({ x: P.x2 - 140, y: P.y2 - 180, w: 140, h: 180, why: 'door' });
    } else addSolid(P.x2, P.y1 - B, B, h + 2 * B, 'border');
    for (const fh of floorHoles) res.push({ x: fh.x1 - 40, y: P.y2 - 130, w: L.holeW + 80, h: 130, why: 'hole' });
    for (const ch of ceilHoles) res.push({ x: ch.x1 - 24, y: P.y1, w: L.holeW + 48, h: P.y2 - P.y1, why: 'ladder' });
  }

  for (const l of level.links) {
    if (l.kind === 'door') {
      addSolid(l.x1, l.y2, l.x2 - l.x1, B, 'bridge');
      addSolid(l.x1, l.y1 - B, l.x2 - l.x1, B, 'lintel');
      if (l.gate) level.gates.push({ id: level.gates.length, link: l.id, x: l.x1, y: l.y1, w: l.x2 - l.x1, h: l.y2 - l.y1 });
    } else {
      const U = level.panels[l.a], D = level.panels[l.b];
      addSolid(l.x1 - B, l.y1, B, l.y2 - l.y1, 'shaft');
      addSolid(l.x2, l.y1, B, l.y2 - l.y1, 'shaft');
      level.oneways.push({ x: l.x1, y: U.y2, w: L.holeW, h: 8, t: ONEWAY, k: 'cover' });
      level.ladders.push({ id: level.ladders.length, x: l.x1 + L.holeW / 2 - 26, y: U.y2 - 8, w: 52, h: D.y2 - (U.y2 - 8), link: l.id });
      if (l.gate) level.gates.push({ id: level.gates.length, link: l.id, x: l.x1, y: U.y2, w: L.holeW, h: B });
    }
  }

  // ---------- Furnish every panel ----------
  const chapterStart = path[0];
  for (const P of level.panels) {
    furnish(rng, P, th, reserved.get(P.id), level, nextId, {
      story, withEnemies, final, first: index === 0 && P === chapterStart, isLast: P === last,
    });
  }

  return level;
}

// ---------------------------------------------------------------------------

const BLOCK_SIZES = {
  car: [[190, 230], [70, 78]],
  vent: [[90, 130], [66, 90]],
  crates: [[100, 124], [96, 104]],
  console: [[100, 140], [80, 96]],
  tomb: [[52, 66], [70, 86]],
  coffin: [[120, 136], [46, 52]],
  wreck: [[150, 190], [64, 76]],
  reactor: [[86, 104], [104, 118]],
  pod: [[76, 90], [96, 110]],
  desk: [[130, 160], [66, 74]],
  drums: [[86, 100], [62, 70]],
};

const DECOR = {
  hero: { rooftop: ['antenna', 'watertower', 'chimney', 'billboard'], street: ['lamp', 'hydrant', 'mailbox', 'newsstand'], lab: ['tesla', 'tank', 'screen', 'pipes'], lair: ['tesla', 'screen', 'tank', 'statue'] },
  zombie: { graveyard: ['tombstone', 'deadtree', 'cross', 'lamp'], street: ['lamp', 'hydrant', 'wreckage', 'sign'], hospital: ['iv', 'curtain', 'cabinet', 'sign'], mall: ['plant', 'mannequin', 'sign', 'bench'] },
  space: { bridge: ['screen', 'terminal', 'antenna', 'pipes'], hangar: ['pipes', 'rocket', 'terminal', 'antenna'], planet: ['crystal', 'rock', 'antenna', 'plant'], reactor: ['pipes', 'tesla', 'tank', 'screen'] },
  noir: { alley: ['lamp', 'trash', 'fireplug', 'sign'], office: ['cabinet', 'plant', 'coatrack', 'fan'], club: ['piano', 'mic', 'plant', 'lamp'], docks: ['bollard', 'crate', 'lamp', 'rope'] },
};

function furnish(rng, P, th, reserved, level, nextId, o) {
  const W = P.x2 - P.x1, H = P.y2 - P.y1, floor = P.y2;
  const solids = [];
  const plats = [];
  const props = [];
  const isFree = (r, pad = 0) =>
    !reserved.some((z) => overlap(r, z, pad)) && !solids.some((s) => overlap(r, s, pad)) && !props.some((s) => overlap(r, s, pad));

  // --- Stairs up to a balcony ---
  if (W >= 640 && rng.chance(0.5)) {
    const n = 7, sw = 28, sh = 22, sH = n * sh, sW = n * sw;
    const balW = rng.int(140, 230);
    const d = rng.sign();
    for (let t = 0; t < 12; t++) {
      const gx = Math.round(rng.range(P.x1 + 150, P.x2 - 150 - sW - balW));
      const area = { x: gx, y: floor - sH - 110, w: sW + balW, h: sH + 110 };
      if (!isFree(area, 10)) continue;
      const stairX = d > 0 ? gx : gx + balW;
      const balX = d > 0 ? gx + sW : gx;
      for (let i = 0; i < n; i++) {
        const hgt = d > 0 ? (i + 1) * sh : (n - i) * sh;
        const r = { x: stairX + i * sw, y: floor - hgt, w: sw, h: hgt, t: SOLID, k: 'step', hidden: true };
        level.solids.push(r);
      }
      solids.push({ x: stairX, y: floor - sH, w: sW, h: sH });
      level.stairs.push({ x: stairX, y: floor - sH, w: sW, h: sH, dir: d, n, panel: P.id, s: th.geo.platform[0] });
      const bal = { x: balX, y: floor - sH, w: balW, h: 14, t: ONEWAY, k: 'platform', s: 'balcony', panel: P.id };
      level.oneways.push(bal);
      plats.push(bal);
      break;
    }
  }

  // --- Cover blocks ---
  const nBlocks = rng.int(W > 700 ? 1 : 0, W > 700 ? 2 : 1);
  for (let i = 0; i < nBlocks; i++) {
    for (let t = 0; t < 14; t++) {
      const s = rng.pick(th.geo.block);
      const [[wa, wb], [ha, hb]] = BLOCK_SIZES[s] || [[80, 120], [60, 90]];
      const w = rng.int(wa, wb), h = rng.int(ha, hb);
      const x = Math.round(rng.range(P.x1 + 50, P.x2 - 50 - w));
      const r = { x, y: floor - h, w, h };
      if (!isFree(r, 40)) continue;
      if (plats.some((p) => overlap({ x, y: floor - h - 100, w, h: 100 }, p, 0))) continue;
      solids.push(r);
      level.solids.push({ ...r, t: SOLID, k: 'block', s, panel: P.id });
      break;
    }
  }

  // --- Floating platforms ---
  const tierY = [0, floor - rng.int(128, 156), floor - rng.int(250, 276), floor - rng.int(376, 400)];
  const nPlat = Math.max(1, Math.min(5, Math.floor(W / 300) + rng.int(0, 1)));
  let placed = 0;
  for (let t = 0; t < 40 && placed < nPlat; t++) {
    const tier = +rng.weighted({ 1: 4, 2: 4, 3: H >= 630 ? 3 : 0 });
    const py = tierY[tier];
    if (py - P.y1 < 125) continue;
    const w = rng.int(140, Math.min(300, W - 90));
    const px = Math.round(rng.range(P.x1 + 12, P.x2 - 12 - w));
    const r = { x: px, y: py, w, h: 14 };
    if (plats.some((p) => Math.abs(p.y - py) < 110 && overlap(r, { x: p.x, y: py, w: p.w, h: 14 }, 60))) continue;
    if (solids.some((s) => overlap({ x: px, y: py - 104, w, h: 118 }, s, 8))) continue;
    if (reserved.some((z) => z.why === 'ladder' && overlap(r, z, 10))) continue;
    if (tier === 3) {
      const supported = plats.some((p) => p.y > py + 90 && p.y < py + 300 && (Math.abs(p.x + p.w / 2 - (px + w / 2)) < (p.w + w) / 2 + 170));
      if (!supported) continue;
    }
    const plat = { ...r, t: ONEWAY, k: 'platform', s: rng.pick(th.geo.platform), panel: P.id };
    level.oneways.push(plat);
    plats.push(plat);
    placed++;
  }

  // --- Props: crates, barrels, tables ---
  const placeProp = (k, w, h, onPlat) => {
    for (let t = 0; t < 14; t++) {
      let x, y;
      if (onPlat && plats.length) {
        const p = rng.pick(plats);
        if (p.w < w + 30) continue;
        x = Math.round(rng.range(p.x + 10, p.x + p.w - 10 - w));
        y = p.y - h;
      } else {
        x = Math.round(rng.range(P.x1 + 60, P.x2 - 60 - w));
        y = floor - h;
      }
      const r = { x, y, w, h };
      if (!isFree(r, 16)) continue;
      if (!onPlat && plats.some((p) => overlap(r, p, 0))) continue;
      const prop = { id: nextId(), k, x, y, w, h, panel: P.id };
      props.push(r);
      level.props.push(prop);
      return prop;
    }
    return null;
  };
  const nCrates = rng.int(0, W > 600 ? 3 : 2);
  for (let i = 0; i < nCrates; i++) {
    const c = placeProp('crate', 56, 56, rng.chance(0.25));
    if (c && rng.chance(0.3)) {
      const r = { x: c.x + rng.int(-6, 6), y: c.y - 56, w: 56, h: 56 };
      if (isFree(r, 0) && !plats.some((p) => overlap(r, p, 0))) {
        props.push(r);
        level.props.push({ id: nextId(), k: 'crate', ...r, panel: P.id });
      }
    }
  }
  const nBarrels = rng.int(0, 2);
  for (let i = 0; i < nBarrels; i++) placeProp('barrel', 44, 62, false);
  if (rng.chance(0.4)) placeProp('table', 128, 62, false);

  // --- Standing spots ---
  const blockers = level.solids.filter((s) => s.k === 'block' || s.k === 'step');
  const holes = level.links.filter((l) => l.kind === 'hole' && l.a === P.id);
  const standFree = (x, y) => {
    const r = { x: x - 22, y: y - 96, w: 44, h: 94 };
    if (blockers.some((s) => overlap(r, s, 2))) return false;
    if (props.some((s) => overlap(r, s, 4))) return false;
    return true;
  };
  const floorSpots = [];
  const doorSpots = [];
  for (let x = P.x1 + 40; x <= P.x2 - 40; x += 32) {
    if (holes.some((h) => x > h.x1 - 30 && x < h.x2 + 30)) continue;
    if (!standFree(x, floor)) continue;
    if (reserved.some((z) => z.why === 'door' && x > z.x && x < z.x + z.w)) doorSpots.push({ x, y: floor });
    else floorSpots.push({ x, y: floor });
  }
  const platSpots = [];
  for (const p of plats) {
    for (let x = p.x + 26; x <= p.x + p.w - 26; x += 32) if (standFree(x, p.y)) platSpots.push({ x, y: p.y, plat: true });
  }
  for (const s of level.solids) {
    if (s.panel !== P.id || s.k !== 'block' || s.w < 60) continue;
    platSpots.push({ x: s.x + s.w / 2, y: s.y, plat: true });
  }
  const pickSpread = (list, n, minGap) => {
    const out = [];
    const pool = rng.shuffle(list.slice());
    for (const s of pool) {
      if (out.length >= n) break;
      if (out.some((o) => Math.abs(o.x - s.x) < minGap && Math.abs(o.y - s.y) < 60)) continue;
      out.push(s);
    }
    return out;
  };

  const spawnPool = floorSpots.length ? floorSpots : platSpots.length ? platSpots : doorSpots.length ? doorSpots : [{ x: (P.x1 + P.x2) / 2, y: floor }];
  for (const s of pickSpread(spawnPool, 3, 150)) level.spawns.push({ x: s.x, y: s.y, panel: P.id });

  // --- Background decor (purely visual) ---
  const decorKinds = (DECOR[th.key] && DECOR[th.key][P.scene]) || ['lamp'];
  for (const s of pickSpread(floorSpots, rng.int(1, 2), 220)) level.decor.push({ k: rng.pick(decorKinds), x: s.x, y: floor, panel: P.id, seed: rng.int(1, 1e6) });

  // --- Pickups ---
  const pickupSpot = () => (platSpots.length && rng.chance(0.75) ? rng.pick(platSpots) : floorSpots.length ? rng.pick(floorSpots) : null);
  if (!o.story) {
    const s = pickupSpot();
    if (s) {
      const weapon = rng.chance(0.65);
      level.pickups.push({ id: nextId(), k: weapon ? 'weapon' : 'health', w: weapon ? rng.pick(HEAVY_KEYS) : null, x: s.x, y: s.y - 34, panel: P.id, respawn: weapon ? 14 : 18 });
    }
    if (rng.chance(0.25)) {
      const s2 = pickupSpot();
      if (s2 && !level.pickups.some((p) => Math.abs(p.x - s2.x) < 80 && Math.abs(p.y - (s2.y - 34)) < 60)) {
        level.pickups.push({ id: nextId(), k: 'bomb', w: null, x: s2.x, y: s2.y - 34, panel: P.id, respawn: 20 });
      }
    }
  } else {
    const roll = rng.f();
    const s = pickupSpot();
    if (s && (o.first || roll < 0.5)) {
      level.pickups.push({ id: nextId(), k: 'weapon', w: rng.pick(HEAVY_KEYS), x: s.x, y: s.y - 34, panel: P.id, respawn: 0 });
    } else if (s && roll < 0.8) {
      level.pickups.push({ id: nextId(), k: rng.chance(0.7) ? 'health' : 'bomb', w: null, x: s.x, y: s.y - 34, panel: P.id, respawn: 0 });
    }
  }

  // --- Enemies ---
  if (o.withEnemies) {
    const area = W * H;
    let count = Math.max(2, Math.min(6, Math.round(area / 115000)));
    if (o.first) count = 2;
    const waves = [count];
    if (o.story && !o.first && area > 470000 && rng.chance(0.55)) waves.push(Math.max(2, count - 1));
    if (o.story && P.boss) waves.length = 1;
    const allSpots = floorSpots.concat(platSpots).concat(floorSpots.length + platSpots.length < 4 ? doorSpots : []);
    const mix = { ...th.mix };
    waves.forEach((n, wave) => {
      const spots = pickSpread(allSpots, n, 90);
      for (const s of spots) {
        const k = rng.weighted(mix);
        const flying = k === 'flyer';
        level.enemies.push({
          id: nextId(), k, x: s.x, y: flying ? s.y - rng.int(140, 220) : s.y, panel: P.id, wave,
          facing: rng.sign(),
        });
      }
    });
    if (o.story && o.isLast) {
      const s = floorSpots.length ? floorSpots[Math.floor(floorSpots.length / 2)] : { x: (P.x1 + P.x2) / 2, y: floor };
      const bossFlies = !!th.enemies.boss.flying;
      level.enemies.push({
        id: nextId(), k: o.final ? 'boss' : 'brute', x: s.x, y: o.final && bossFlies ? floor - 260 : s.y,
        panel: P.id, wave: waves.length - 1, facing: -1,
      });
    }
  }
}
