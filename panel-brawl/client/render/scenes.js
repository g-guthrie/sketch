// PANEL BRAWL environment art.
//
// All painters draw in the panel's LOCAL space: (0,0) is the top-left of the
// panel interior, (w,h) the bottom-right, and the floor characters stand on
// is the line y = h. Everything is procedural Canvas 2D in a printed-comic
// style (flat color, thick ink, Ben-Day dots, hatching). Each function wraps
// its work in save()/restore() and leaves no state behind.
//
//   paintBackdrop(ctx, { scene, theme, w, h, seed })
//   paintFloor(ctx, { scene, theme, w, h, seed })
//   paintDecor(ctx, { kind, x, y, theme, seed })
//   paintBlock(ctx, { style, x, y, w, h, theme, seed })
//   paintPlatform(ctx, { style, x, y, w, h, theme, seed })
//   paintStairs(ctx, { x, y, w, h, dir, n, theme })
//   paintLadder(ctx, { x, y, w, h, theme })
//   SCENE_LIST: [{ theme, scene }]

import { mkR, hashStr, setAtmo, getAtmo } from './art/kit.js';
import * as HERO from './art/hero.js';
import * as ZOMBIE from './art/zombie.js';
import * as SPACE from './art/space.js';
import * as NOIR from './art/noir.js';
import { floorDetail } from './art/floors.js';
import { decor, block, platform, stairs, ladder } from './art/props.js';

const BACKDROPS = {
  hero: { rooftop: HERO.rooftop, street: HERO.street, lab: HERO.lab, lair: HERO.lair },
  zombie: { graveyard: ZOMBIE.graveyard, street: ZOMBIE.street, hospital: ZOMBIE.hospital, mall: ZOMBIE.mall },
  space: { bridge: SPACE.bridge, hangar: SPACE.hangar, planet: SPACE.planet, reactor: SPACE.reactor },
  noir: { alley: NOIR.alley, office: NOIR.office, club: NOIR.club, docks: NOIR.docks },
};

export const SCENE_LIST = Object.keys(BACKDROPS).flatMap((theme) => Object.keys(BACKDROPS[theme]).map((scene) => ({ theme, scene })));

const themeKey = (theme) => (theme && theme.key) || 'hero';

function prep(ctx) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.setLineDash([]);
}

export function paintBackdrop(ctx, { scene, theme, w, h, seed = 1 }) {
  const key = themeKey(theme);
  const set = BACKDROPS[key] || BACKDROPS.hero;
  const fn = set[scene] || Object.values(set)[0];
  prep(ctx);
  let atmo = null;
  try {
    atmo = fn(ctx, w, h, mkR((seed ^ hashStr(key + ':' + scene)) >>> 0), theme);
  } finally {
    ctx.restore();
  }
  setAtmo(ctx, { key, scene, air: (atmo && atmo.air) || null, light: (atmo && atmo.light) || -1 });
}

export function paintFloor(ctx, { scene, theme, w, h, seed = 1 }) {
  prep(ctx);
  try {
    floorDetail(ctx, themeKey(theme), scene, w, h, mkR((seed * 31 + 7) >>> 0), theme);
  } finally {
    ctx.restore();
  }
}

export function paintDecor(ctx, { kind, x, y, theme, seed = 1 }) {
  prep(ctx);
  try {
    decor(ctx, kind, x, y, theme || { key: 'hero' }, mkR(seed >>> 0), getAtmo(ctx));
  } finally {
    ctx.restore();
  }
}

export function paintBlock(ctx, { style, x, y, w, h, theme, seed = 1 }) {
  prep(ctx);
  try {
    block(ctx, style, x, y, w, h, theme || { key: 'hero' }, mkR(seed >>> 0), getAtmo(ctx));
  } finally {
    ctx.restore();
  }
}

export function paintPlatform(ctx, { style, x, y, w, h = 14, theme, seed = 1 }) {
  prep(ctx);
  try {
    platform(ctx, style, x, y, w, h, theme || { key: 'hero' }, mkR(seed >>> 0), getAtmo(ctx));
  } finally {
    ctx.restore();
  }
}

export function paintStairs(ctx, { x, y, w, h, dir = 1, n = 7, theme }) {
  prep(ctx);
  try {
    stairs(ctx, x, y, w, h, dir, n, theme || { key: 'hero' }, getAtmo(ctx));
  } finally {
    ctx.restore();
  }
}

export function paintLadder(ctx, { x, y, w, h, theme }) {
  prep(ctx);
  try {
    ladder(ctx, x, y, w, h, theme || { key: 'hero' }, getAtmo(ctx));
  } finally {
    ctx.restore();
  }
}
