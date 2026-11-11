"""Build step: slice the rooms into BG tiles, cut every drawn sheet into
hardware sprites, lay out OBJ VRAM, and write game/gen/gfx.[ch].

OBJ VRAM (1024 tiles):
  0..63      hero, streamed: only the frames on screen are in VRAM (top slot, legs slot)
  common     shots, explosions, pickups, troopers, lettering: always loaded
  stage      the boss and hardware of the current stage: swapped on room load
"""
import os, sys
os.environ['ASTRO_BUILD'] = '1'
from style import *
import sheetlib, guardian
from contracts import CONTRACTS
from cutter import Bank, metasprite, cut, SHAPES, ATTR0, ATTR1
import panel, foundry, cards

root = os.path.join(os.path.dirname(__file__), '..')
PALS = {'ace': ACE, 'guard': GUARD, 'mech': MECH, 'fx': FX}

# ------------------------------------------------------------------ rooms (BG layers)
ROOMS = [panel.ROOM, foundry.ROOM, cards.TITLE, cards.END, panel.DUSK]
STAGE_OF = {'landing': 1, 'foundry': 1, 'dusk': 2}
OBJ_TYPES = ['NONE', 'RUNNER', 'SNIPER', 'TURRET', 'SAUCER', 'DRUM', 'POD', 'PICKUP', 'FIRE', 'BOSS', 'SLED']
arrays, room_rows = {}, []
for i, r in enumerate(ROOMS):
    A = TileBank(r['pals'], 880, f"{r['name']} bankA")
    B = TileBank(r['pals'], 512, f"{r['name']} bankB")
    mf, mp = A.add(r['frame'], 'frame', 0), A.add(r['play'], 'play', 1)
    mm, mr = B.add(r['mid'], 'mid', 2), B.add(r['far'], 'far', 3)
    print(A.check(), '|', B.check())
    pal = sum((p.words(r['backdrop']) for p in r.get('out_pals', r['pals'])), [])
    objs = sum(([OBJ_TYPES.index(t), x, y, a] for t, x, y, a in r['objects']), [])
    n = f'r{i}_'
    arrays.update({n + 'pal': ('unsigned short', pal), n + 'ta': ('unsigned int', A.words()), n + 'tb': ('unsigned int', B.words()),
                   n + 'mf': ('unsigned short', mf.flatten()), n + 'mp': ('unsigned short', mp.flatten()),
                   n + 'mm': ('unsigned short', mm.flatten()), n + 'mr': ('unsigned short', mr.flatten()),
                   n + 'solid': ('unsigned char', r['solid'].flatten()), n + 'objs': ('short', objs or [0])})
    room_rows.append(f"  {{ {n}pal, {n}ta, {n}ta_len, {n}tb, {n}tb_len, {n}mf, {n}mp, {n}mm, {n}mr, {n}solid, {n}objs, "
                     f"{len(r['objects'])}, {r['cycle']}, {r['start'][0]}, {r['start'][1]}, {STAGE_OF.get(r['name'], 0)} }},")

# ------------------------------------------------------------------ sprites (OBJ)
# Two kinds of source: drawn .px sheets (one palette each) and painted frames
# from art/paint.py (hero: reduced to one palette; boss: every OBJ picks one of
# four palettes fitted to the painting).
import numpy as np
import paint, palettes
from cutter import KIND

COMMON = ['hud', 'shots', 'boom', 'sfx', 'items', 'pod', 'trooper']
CUT = {'boom': dict(waste=0.5), 'trooper': dict(waste=0.4)}                 # tighter cuts where VRAM matters more than OBJ count
TANK_PX = ['sled', 'turret']
PODB = ['g_head', 'g_eye', 'g_dish', 'g_pod', 'g_link', 'g_claw', 'saucer']
PAL_OF = {'ace': 14, 'mech': 1, 'fx': 2, 'guard': 13}        # OBJ palette slot of each drawn-sheet palette
PAL_BOSS, PAL_BOSS_HOT, PAL_FLASH = 4, 8, 12

ms, blobs, hdr, body = {}, {}, [], []                        # ms[(sheet, frame)] = ([(dx, dy, kind, tile, palette offset)], stream offset, tiles)
FRAMES, POINTS = {}, {}                                      # per sheet: frame names; {point: [(dx, dy) per frame]}

def cut_sheet(name, bank, base):
    s = sheetlib.get(name)
    pal = PALS[s.palette]
    FRAMES[name] = CONTRACTS[name][3]
    for fr in FRAMES[name]:
        f = s[fr]
        ms[(name, fr)] = ([(dx, dy, k, t + base, 0) for dx, dy, k, t in metasprite(s.canvas(f, pal), pal, s.anchor_of(f), bank, **CUT.get(name, {}))], 0, 0)
    pts = sorted(set(CONTRACTS[name][4]) | {q for v in CONTRACTS[name][5].values() for q in v})
    POINTS[name] = {}
    for q in pts:
        POINTS[name][q] = []
        for fr in FRAMES[name]:
            f = s[fr]
            ax, ay = s.anchor_of(f)
            x, y = f.points.get(q, (ax, ay))
            POINTS[name][q].append((x - ax, y - ay))

def rgba_block(a, r):
    x, y, w, h = r
    o = np.zeros((h, w, 4), np.uint8)
    H, W = a.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if x1 > x0 and y1 > y0:
        o[y0 - y:y1 - y, x0 - x:x1 - x] = a[y0:y1, x0:x1]
    return o

def index_block(b, pal):
    """RGBA block -> palette indices 1..15 (0 transparent), nearest colour."""
    lut = {}
    out = np.zeros(b.shape[:2], np.uint8)
    for y in range(b.shape[0]):
        for x in range(b.shape[1]):
            if b[y, x, 3]:
                c = tuple(int(v) for v in b[y, x, :3])
                if c not in lut:
                    lut[c] = palettes.nearest(c, pal) + 1
                out[y, x] = lut[c]
    return out

# --- hero: streamed, one palette
hero_frames = paint.hero()
hero_map = palettes.merge_colours(palettes.colours_of([f[1] for f in hero_frames]), 15)
hero_pal = sorted(set(hero_map.values()), key=lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2])
HERO_SLOT = 80
blob = []
FRAMES['ace'], POINTS['ace'] = [f[0] for f in hero_frames], {'muzzle': []}
for name, a, anchor, pts in hero_frames:
    a = palettes.apply_map(a, hero_map)
    b = Bank('ace:' + name, HERO_SLOT)
    objs = []
    for r in cut(a[..., 3] > 0, waste=0.4):
        objs.append((r[0] - anchor[0], r[1] - anchor[1], KIND[(r[2], r[3])], b.add(index_block(rgba_block(a, r), hero_pal)), 0))
    b.check()
    ms[('ace', name)] = (objs, len(blob), len(b.tiles))
    blob += b.tiles
    mz = pts.get('muzzle', anchor)
    POINTS['ace']['muzzle'].append((mz[0] - anchor[0], mz[1] - anchor[1]))
blobs['ace'] = blob

OBJ_COMMON_BASE = HERO_SLOT
common = Bank('obj common', 1024)
for n in COMMON:
    cut_sheet(n, common, OBJ_COMMON_BASE)
OBJ_STAGE_BASE = OBJ_COMMON_BASE + len(common.tiles)
tank, podb = Bank('obj stage tank', 1024 - OBJ_STAGE_BASE), Bank('obj stage pod', 1024 - OBJ_STAGE_BASE)

# --- the Guardian: one painting in parts, four fitted palettes
boss = paint.boss()
bl = []                                                      # (sheet, frame, anchor, rect, rgba block)
for sheet, frames in boss.items():
    FRAMES[sheet] = [f[0] for f in frames]
    for fr, a, anchor, pts in frames:
        rects = [(0, 0, 64, 32)] if sheet == 'gb_cannon' else cut(a[..., 3] > 0, waste=0.45)
        for r in rects:
            bl.append((sheet, fr, anchor, r, rgba_block(a, r)))
boss_pals, where = palettes.fit_lossy([palettes.colours_of([x[4]]) for x in bl], 4)
for (sheet, fr, anchor, r, b), w in zip(bl, where):
    o = ms.setdefault((sheet, fr), ([], 0, 0))[0]
    o.append((r[0] - anchor[0], r[1] - anchor[1], KIND[(r[2], r[3])], tank.add(index_block(b, boss_pals[w])) + OBJ_STAGE_BASE, w))
TANK_BOSS = len(tank.tiles)                                 # the foundry also loads the sled and turret after the boss
for n in TANK_PX:
    cut_sheet(n, tank, OBJ_STAGE_BASE)
for n in PODB:
    cut_sheet(n, podb, OBJ_STAGE_BASE)
print(f'obj: hero stream {HERO_SLOT} | {common.check()} | boss {TANK_BOSS}, with foundry hardware {tank.check()} | {podb.check()} | boss sprites: '
      + ' '.join(f"{k[0][3:]}:{k[1]}={len(v[0])}" for k, v in ms.items() if k[0].startswith('gb_')))

up = lambda s: s.upper()
body.append('#include "gfx.h"')
for name, frames in FRAMES.items():
    hdr.append('enum { ' + ', '.join(f'{up(name)}_{up(f)}' for f in frames) + f', {up(name)}_N }};')
    for i, fr in enumerate(frames):
        o = ms[(name, fr)][0]
        body.append(f'static const MsObj mo_{name}_{i}[] = {{ ' + ', '.join(f'{{{dx},{dy},{t | (p << 10) | (k << 12)}}}' for dx, dy, k, t, p in o) + ' };')
    body.append(f'const Ms ms_{name}[] = {{\n' + '\n'.join(
        f'  {{ mo_{name}_{i}, {len(ms[(name, fr)][0])}, {ms[(name, fr)][2]}, {ms[(name, fr)][1]} }},' for i, fr in enumerate(frames)) + '\n};')
    hdr.append(f'extern const Ms ms_{name}[];')
    for q, rows in POINTS.get(name, {}).items():
        body.append(f'const signed char pt_{name}_{q}[][2] = {{ ' + ', '.join(f'{{{x},{y}}}' for x, y in rows) + ' };')
        hdr.append(f'extern const signed char pt_{name}_{q}[][2];')

arrays.update({f'tl_{n}': ('unsigned int', tiles_words(b)) for n, b in blobs.items()})
arrays.update({'objbank_common': ('unsigned int', tiles_words(common.tiles)),
               'objbank_tank': ('unsigned int', tiles_words(tank.tiles)),
               'objbank_pod': ('unsigned int', tiles_words(podb.tiles))})
def words(cols):
    return [0] + [rgb15(c) for c in cols] + [0] * (15 - len(cols))
def hot(c):                                                  # the Guardian reforged: steel glows, brass goes white-hot
    l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
    h = (min(255, l * 1.5 + 50), min(255, l * 0.95), l * 0.42)
    return tuple(int(0.35 * a + 0.65 * b) for a, b in zip(c, h))
boss_pals += [[(0, 0, 0)]] * (4 - len(boss_pals))
ink = rgb15(INK)
objpal = [words(hero_pal), MECH.words(), FX.words(), MECH_RED.words()] + [words(p) for p in boss_pals] + \
         [words([hot(c) for c in p]) for p in boss_pals] + [[0, ink] + [rgb15('#f8f8f0')] * 14, GUARD.words(), ACE.words(), [0] * 16]
arrays['obj_pal'] = ('unsigned short', sum(objpal, []))

# ------------------------------------------------------------------ boss geometry -> engine constants
defs = [f'#define OBJ_COMMON_BASE {OBJ_COMMON_BASE}', f'#define OBJ_STAGE_BASE {OBJ_STAGE_BASE}', '#define ACE_SLOT 0',
        f'#define PAL_BOSS {PAL_BOSS}', f'#define PAL_BOSS_HOT {PAL_BOSS_HOT}', f'#define PAL_FLASH {PAL_FLASH}', f"#define PAL_GUARD {PAL_OF['guard']}", f"#define PAL_ACE {PAL_OF['ace']}"]
RX, RY = paint.ROOT
def rect(name, x0, y0, x1, y1):
    defs.append(f'#define GT_{name}_L {x0 - RX}\n#define GT_{name}_T {y0 - RY}\n#define GT_{name}_R {x1 - RX}\n#define GT_{name}_B {y1 - RY}\n'
                f'#define GT_{name}_X {(x0 + x1) // 2 - RX}\n#define GT_{name}_Y {(y0 + y1) // 2 - RY}')
base_a = boss['gb_base'][0][1]
ys, xs = np.nonzero(base_a[..., 3])
rect('HULL', xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
for n, rname in (('rack', 'RACK'), ('dish', 'DISH'), ('hatch', 'PLATE'), ('eye', 'EYE')):
    x0, y0, x1, y1, _ = paint.REGIONS[n]
    rect(rname, x0, y0, x1, y1)
x0, y0, x1, y1, _ = paint.REGIONS['hatch']
rect('CORE', x0 + 4, y0 + 4, x1 - 4, y1 - 4)
for q, (x, y) in paint.POINTS.items():
    defs.append(f'#define GT_{up(q)}_X {x - RX}\n#define GT_{up(q)}_Y {y - RY}')
cf = boss['gb_cannon'][0]
defs += [f'#define GT_CANNON_X {paint.PIVOT[0] - RX}', f'#define GT_CANNON_Y {paint.PIVOT[1] - RY}',
         f'#define G_CANNON_CX {32 - cf[2][0]}', f'#define G_CANNON_CY {16 - cf[2][1]}', f'#define G_CANNON_LEN {cf[2][0] - 3}']
# which 8x8 cells of the painting stop a shot: the body, but not the head (the eye, dish and rack behind it are targets)
solid = []
for cy in range(16):
    row = 0
    for cx in range(20):
        cell = base_a[cy * 8:cy * 8 + 8, cx * 8:cx * 8 + 8, 3]
        head = cy * 8 < 38 and 48 <= cx * 8 < 96
        if (cell > 0).mean() > 0.5 and not head:
            row |= 1 << cx
    solid.append(row)
arrays['boss_solid'] = ('unsigned int', solid)
defs += [f'#define GT_ROOT_X {RX}', f'#define GT_ROOT_Y {RY}']
def assembly(prefix, parts):
    for name, s, f, x, y in guardian.layout(parts):
        ax, ay = s.anchor_of(f)
        cv = s.canvas(f, GUARD)
        bx0, by0, bx1, by1 = cv.bbox()
        defs.append(f'#define {prefix}_{up(name)}_X {x + ax}\n#define {prefix}_{up(name)}_Y {y + ay}')
        defs.append(f'#define {prefix}_{up(name)}_L {x + bx0}\n#define {prefix}_{up(name)}_T {y + by0}\n'
                    f'#define {prefix}_{up(name)}_R {x + bx1}\n#define {prefix}_{up(name)}_B {y + by1}')
        for q, (px, py) in f.points.items():
            defs.append(f'#define {prefix}_{up(name)}_{up(q)}_X {x + px}\n#define {prefix}_{up(name)}_{up(q)}_Y {y + py}')
assembly('GP', guardian.POD)
for n, d in guardian.PARTS.items():
    defs.append(f"#define G_{up(n)}_HP {d['hp']}")

fw, fr_ = [], []
for code in range(32, 96):
    g = FONT.get(chr(code))
    if g is None:
        fw.append(3); fr_ += [0] * 7
    else:
        fw.append(max(len(r) for r in g))
        fr_ += [sum(1 << i for i, v in enumerate(r) if v == '#') for r in g]
arrays.update({'font_w': ('unsigned char', fw), 'font_rows': ('unsigned char', fr_)})
import math
arrays['sin_lut'] = ('short', [int(round(256 * math.sin(i * math.pi / 128))) for i in range(256)])

os.makedirs(root + '/game/gen', exist_ok=True)
write_c(root + '/game/gen/gfx', 'gfx', arrays)
STRUCT = """typedef struct { const unsigned short* pal; const unsigned int* ta; int ta_len; const unsigned int* tb; int tb_len;
  const unsigned short *mf, *mp, *mm, *mr; const unsigned char* solid; const short* objs; int nobj, cycle, sx, sy, stage; } Room;
extern const Room rooms[];
typedef struct { signed char dx, dy; unsigned short tk; } MsObj;          /* tk = tile | kind << 12 */
typedef struct { const MsObj* o; unsigned char n, ntiles; unsigned short toff; } Ms;
"""
h = open(root + '/game/gen/gfx.h').read().replace('#endif\n', '')
h += STRUCT + '\n'.join(hdr) + '\n' + '\n'.join(defs) + '\n'
h += ''.join(f'#define O_{t} {i}\n' for i, t in enumerate(OBJ_TYPES))
h += f'#define PANEL_L {panel.PANEL_L}\n#define PANEL_R {panel.PANEL_R}\n#define ROOM_W 448\n'
h += f'#define CYC_A {FOUNDRY.slot(FOUNDRY["m"])}\n#define CYC_B {FOUNDRY.slot(FOUNDRY["n"])}\n'
h += 'static const unsigned short k_attr0[12] = {' + ','.join(map(str, ATTR0)) + '};\n'
h += 'static const unsigned short k_attr1[12] = {' + ','.join(map(str, ATTR1)) + '};\n'
h += 'static const unsigned char k_w[12] = {' + ','.join(str(w) for w, _ in SHAPES) + '}, k_h[12] = {' + ','.join(str(v) for _, v in SHAPES) + '};\n'
h += '#endif\n'
open(root + '/game/gen/gfx.h', 'w').write(h)
with open(root + '/game/gen/gfx.c', 'a') as c:
    c.write('\n'.join(body) + '\nconst Room rooms[] = {\n' + '\n'.join(room_rows) + '\n};\n')
if sheetlib.standins:
    print(f'DRAFT BUILD: {len(sheetlib.standins)} stand-in frames:', ' '.join(sheetlib.standins[:12]), '...' if len(sheetlib.standins) > 12 else '')
