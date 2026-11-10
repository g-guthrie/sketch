"""Slice all rooms and sprites into GBA data, enforce budgets, write game/gen/gfx.[ch]."""
from style import *
import panel, foundry, cards, hero, sprites

root = os.path.join(os.path.dirname(__file__), '..')
ROOMS = [panel.ROOM, foundry.ROOM, cards.TITLE, cards.END, panel.DUSK]
OBJ_TYPES = ['NONE', 'RUNNER', 'SNIPER', 'TURRET', 'SAUCER', 'DRUM', 'POD', 'PICKUP', 'FIRE', 'BOSS', 'SLED']
arrays, room_rows = {}, []
for i, r in enumerate(ROOMS):
    A = TileBank(r['pals'], 1024, f"{r['name']} bankA")
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
                     f"{len(r['objects'])}, {r['cycle']}, {r['start'][0]}, {r['start'][1]} }},")

obj, offs = [], {}
def add(name, frames, pal):
    offs[name] = len(obj)
    for f in frames:
        obj.extend(sprite_tiles(f, pal))
add('LEGS', hero.LEGS, HERO); add('TORSO', hero.TORSOS, HERO); add('BALL', hero.BALLS, HERO)
add('LYING', [hero.LYING], HERO); add('LIFE', [sprites.LIFE], HERO); add('SLED', sprites.SLED, HERO)
add('ROBOT', sprites.ROBOT_FRAMES, ROBOT); add('TURRET', sprites.TURRET, ROBOT)
add('SAUCER', sprites.SAUCER, ROBOT); add('POD', sprites.POD, ROBOT)
add('BADGE', sprites.BADGES, FX); add('DRUM', [sprites.DRUM], FX); add('FIRE', sprites.FIREBALL, FX)
add('PEA', sprites.PEA, FX); add('PELLET', [sprites.PELLET], FX); add('EBUL', sprites.EBULLET, FX)
add('LASER_H', [sprites.LASER_H], FX); add('LASER_V', [sprites.LASER_V], FX); add('LASER_D', [sprites.LASER_D], FX)
add('BURST', sprites.BURST, FX); add('POW', [sprites.POW], FX); add('BOOM', [sprites.BOOM], FX)
add('FLASH', [sprites.FLASH], FX); add('BOSS', sprites.BOSS_F, BOSS); add('PODBOSS', sprites.PODBOSS, BOSS)
assert len(obj) <= 1024, len(obj)
print(f'obj: {len(obj)}/1024 tiles')
objpal = HERO.words() + ROBOT.words() + FX.words() + ROBOT_RED.words() + BOSS.words() + flash_palette(HERO) + BOSS_HOT.words()
arrays.update({'obj_pal': ('unsigned short', objpal), 'obj_tiles': ('unsigned int', tiles_words(obj))})

fw, fr = [], []
for code in range(32, 96):
    g = FONT.get(chr(code))
    if g is None:
        fw.append(3); fr += [0] * 7
    else:
        w = max(len(r) for r in g)
        fw.append(w)
        fr += [sum(1 << i for i, v in enumerate(r) if v == '#') for r in g]
arrays.update({'font_w': ('unsigned char', fw), 'font_rows': ('unsigned char', fr)})
os.makedirs(root + '/game/gen', exist_ok=True)
write_c(root + '/game/gen/gfx', 'gfx', arrays)
STRUCT = """typedef struct { const unsigned short* pal; const unsigned int* ta; int ta_len; const unsigned int* tb; int tb_len;
  const unsigned short *mf, *mp, *mm, *mr; const unsigned char* solid; const short* objs; int nobj, cycle, sx, sy; } Room;
extern const Room rooms[];
"""
h = open(root + '/game/gen/gfx.h').read().replace('#endif\n', '')
h += STRUCT + ''.join(f'#define T_{k} {v}\n' for k, v in offs.items())
h += ''.join(f'#define O_{t} {i}\n' for i, t in enumerate(OBJ_TYPES))
h += f'#define PANEL_L {panel.PANEL_L}\n#define PANEL_R {panel.PANEL_R}\n#define ROOM_W 448\n'
h += f'#define CYC_A {FOUNDRY.slot(FOUNDRY["m"])}\n#define CYC_B {FOUNDRY.slot(FOUNDRY["n"])}\n'
for a in hero.AIM_ORDER:
    mx, my = hero.muzzle(a)
    h += f'#define MUZ_{a.upper()}_X {mx}\n#define MUZ_{a.upper()}_Y {my}\n'
h += '#endif\n'
open(root + '/game/gen/gfx.h', 'w').write(h)
with open(root + '/game/gen/gfx.c', 'a') as c:
    c.write('#include "gfx.h"\nconst Room rooms[] = {\n' + '\n'.join(room_rows) + '\n};\n')
