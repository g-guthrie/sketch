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
import sheetlib, guardian, anims
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
STREAM = {'ace_top': (0, 40), 'ace_legs': (40, 24), 'ace_air': (0, 40)}          # sheet: (slot base, slot tiles)
COMMON = ['hud', 'shots', 'boom', 'sfx', 'items', 'pod', 'trooper']
SHARED = ['g_head', 'g_eye', 'g_dish']                                             # same place in both stage banks
TANK = ['g_treads', 'g_hull', 'g_plate', 'g_core', 'g_shoulder', 'g_stack', 'g_scar', 'g_cannon', 'g_rack', 'sled', 'turret']
PODB = ['g_pod', 'g_link', 'g_claw', 'saucer']
CUT = {'g_cannon': dict(single=(64, 32)), 'g_treads': dict(grid=(32, 8))}          # cannon is one rotating OBJ; treads share static strips

ms, blobs, hdr, body = {}, {}, [], []
def cut_sheet(name, bank, base):
    s = sheetlib.get(name)
    pal = PALS[s.palette]
    for fr in CONTRACTS[name][3]:
        f = s[fr]
        ms[(name, fr)] = ([(dx, dy, k, t + base) for dx, dy, k, t in
                           metasprite(s.canvas(f, pal), pal, s.anchor_of(f), bank, **CUT.get(name, {}))], 0, 0)

for name, (slot, room) in STREAM.items():
    s = sheetlib.get(name)
    pal = PALS[s.palette]
    blob = []
    for fr in CONTRACTS[name][3]:
        f = s[fr]
        b = Bank(f'{name}:{fr}', room)
        o = metasprite(s.canvas(f, pal), pal, s.anchor_of(f), b)
        b.check()
        ms[(name, fr)] = (o, len(blob), len(b.tiles))
        blob += b.tiles
    blobs[name] = blob

OBJ_COMMON_BASE = 64
common = Bank('obj common', 1024)
for n in COMMON:
    cut_sheet(n, common, OBJ_COMMON_BASE)
OBJ_STAGE_BASE = OBJ_COMMON_BASE + len(common.tiles)
tank, podb = Bank('obj stage tank', 1024 - OBJ_STAGE_BASE), Bank('obj stage pod', 1024 - OBJ_STAGE_BASE)
for n in SHARED:
    cut_sheet(n, podb, OBJ_STAGE_BASE)
    keep = {k: v for k, v in ms.items() if k[0] == n}
    cut_sheet(n, tank, OBJ_STAGE_BASE)
    assert all(ms[k] == v for k, v in keep.items()), 'shared boss parts must land on the same tiles in both stage banks'
for n in TANK:
    cut_sheet(n, tank, OBJ_STAGE_BASE)
for n in PODB:
    cut_sheet(n, podb, OBJ_STAGE_BASE)
print(f'obj: hero stream 64 | {common.check()} | {tank.check()} | {podb.check()}')

up = lambda s: s.upper()
body.append('#include "gfx.h"')
for name in CONTRACTS:
    frames = CONTRACTS[name][3]
    hdr.append('enum { ' + ', '.join(f'{up(name)}_{up(f)}' for f in frames) + f', {up(name)}_N }};')
    for i, fr in enumerate(frames):
        o = ms[(name, fr)][0]
        body.append(f'static const MsObj mo_{name}_{i}[] = {{ ' + ', '.join(f'{{{dx},{dy},{t | (k << 12)}}}' for dx, dy, k, t in o) + ' };')
    body.append(f'const Ms ms_{name}[] = {{\n' + '\n'.join(
        f'  {{ mo_{name}_{i}, {len(ms[(name, fr)][0])}, {ms[(name, fr)][2]}, {ms[(name, fr)][1]} }},' for i, fr in enumerate(frames)) + '\n};')
    hdr.append(f'extern const Ms ms_{name}[];')
    s = sheetlib.get(name)
    pts = sorted(set(CONTRACTS[name][4]) | {q for v in CONTRACTS[name][5].values() for q in v})
    for q in pts:
        rows = []
        for fr in frames:
            f = s[fr]
            ax, ay = s.anchor_of(f)
            x, y = f.points.get(q, (ax, ay))
            rows.append(f'{{{x - ax},{y - ay}}}')
        body.append(f'const signed char pt_{name}_{q}[][2] = {{ ' + ', '.join(rows) + ' };')
        hdr.append(f'extern const signed char pt_{name}_{q}[][2];')

arrays.update({f'tl_{n}': ('unsigned int', tiles_words(b)) for n, b in blobs.items()})
arrays.update({'objbank_common': ('unsigned int', tiles_words(common.tiles)),
               'objbank_tank': ('unsigned int', tiles_words(tank.tiles)),
               'objbank_pod': ('unsigned int', tiles_words(podb.tiles))})
objpal = ACE.words() + MECH.words() + FX.words() + MECH_RED.words() + GUARD.words() + flash_palette(ACE) + GUARD_HOT.words()
arrays['obj_pal'] = ('unsigned short', objpal)

# ------------------------------------------------------------------ boss assembly -> engine constants
defs = [f'#define OBJ_COMMON_BASE {OBJ_COMMON_BASE}', f'#define OBJ_STAGE_BASE {OBJ_STAGE_BASE}']
defs += [f'#define {up(n)}_SLOT {slot}' for n, (slot, _) in STREAM.items()]
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
assembly('GT', guardian.TANK)
assembly('GP', guardian.POD)
s = sheetlib.get('g_cannon'); f = s['cannon']; ax, ay = s.anchor_of(f)
cx, cy, cw, ch = cut(s.canvas(f, GUARD).a != T, single=(64, 32))[0]
defs += [f'#define G_CANNON_CX {cx + 32 - ax}', f'#define G_CANNON_CY {cy + 16 - ay}',
         f"#define G_CANNON_LEN {ax - f.points['muzzle'][0]}"]
for i, (fr, x, y) in enumerate(guardian.SCARS):
    hull = [p for p in guardian.layout(guardian.TANK) if p[0] == 'hull'][0]
    defs.append(f'#define GT_SCAR{i}_X {hull[3] + x}\n#define GT_SCAR{i}_Y {hull[4] + y}')
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
