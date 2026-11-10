"""Render every hero frame from the 3D model into the .px sheets the game builds from."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ace3d as A
from mathutils import Vector
from px import Sheet

SHEETS = os.path.join(A.ROOT, 'art', 'sheets')
A.reset(); A.build(); cam, clay, lights = A.setup_scene()
P = A.PPU
ALL = set(A.GROUPS)

def new(name, cell, anchor, opens=()):
    s = Sheet(); s.name, s.palette, s.cell, s.anchor, s.open = name, 'ace', cell, anchor, list(opens)
    return s

RUN = [(38, 8, -12), (22, 38, 0), (0, 18, 0), (-24, 8, 10), (-42, 32, 30), (-12, 100, 30), (28, 100, 10), (50, 45, -5)]
LEGS = {'idle': ((12, 8, 0), (-12, 6, 0))}
LEGS.update({f'run{i}': (RUN[i], RUN[(i + 4) % 8]) for i in range(8)})
LEGS['crouch'] = ((78, 100, 0), (-5, 105, 55))

legs = new('ace_legs', (32, 24), (14, 23), ['top'])
for n, lg in LEGS.items():
    J, pts = A.pose(legs=lg)
    rows, proj = A.sprite(cam, clay, lights, J, pts, A.LOWER, 32, 24, (14, 23), (0, -1), 'l_' + n)
    f = legs.put(n, rows)
    wx, wy = proj(pts['waist'])
    f.points['waist'] = (wx, wy - 1)
legs.save(os.path.join(SHEETS, 'ace_legs.px'))

top = new('ace_top', (40, 40), (14, 39), ['bottom'])
for n, aim in (('fwd', 0), ('upfwd', 45), ('up', 90), ('dnfwd', -45)):
    for suf, rec, lean in (('', 0.0, 4), ('_fire', 0.07, 1)):
        J, pts = A.pose(lean=lean, aim=aim, recoil=rec)
        W = pts['waist']
        h = 48 if n == 'dnfwd' else 40
        at = (int(math.floor(W.x * P)), int(math.floor(-W.z * P)) - 1)
        rows, proj = A.sprite(cam, clay, lights, J, pts, A.UPPER, 40, h, (14, 39), at, 't_' + n + suf)
        f = top.put(n + suf, rows)
        f.points['muzzle'] = proj(pts['muzzle'])
top.save(os.path.join(SHEETS, 'ace_top.px'))

def placed(rows, w, h, ax, ay, mode):
    """Crop a big render into a w x h cell: 'centre' keeps the render's centre on
    the anchor; 'floor' rests the drawing on the anchor row, centred."""
    H, W = len(rows), len(rows[0])
    ys = [y for y in range(H) if rows[y].strip('.')]
    xs = [x for x in range(W) if any(r[x] != '.' for r in rows)]
    if mode == 'centre':
        x0, y0 = W // 2 - ax, H // 2 - ay
    else:
        x0, y0 = (xs[0] + xs[-1] + 1) // 2 - ax, ys[-1] - ay
    return [''.join(rows[y][x] if 0 <= y < H and 0 <= x < W else '.' for x in range(x0, x0 + w)) for y in range(y0, y0 + h)]

air = new('ace_air', (32, 32), (16, 16))
TUCK = dict(legs=((118, 128, 15), (108, 122, 15)), curl=38, lean=6, lift=0.62, aim=-20)
for i in range(4):
    J, pts = A.pose(spin=45 * i, **TUCK)
    c = pts['centre']
    rows, _ = A.sprite(cam, clay, lights, J, pts, ALL, 72, 72, (36, 36), (int(c.x * P), int(-c.z * P)), f'a_tuck{i}')
    air.put(f'tuck{i}', placed(rows, 32, 32, 16, 16, 'centre'))
J, pts = A.pose(legs=((48, 20, 20), (62, 35, 20)), lean=-28, spin=-32, lift=0.75, head=-15, aim=40)
c = pts['centre']
rows, _ = A.sprite(cam, clay, lights, J, pts, ALL, 72, 72, (36, 36), (int(c.x * P), int(-c.z * P)), 'a_hit')
air.put('hit', placed(rows, 32, 32, 16, 16, 'centre'))
J, pts = A.pose(legs=((8, 6, 20), (-4, 14, 20)), lean=-4, spin=-90, lift=0.8, aim=25)
c = pts['centre']
rows, _ = A.sprite(cam, clay, lights, J, pts, ALL, 80, 80, (40, 40), (int(c.x * P), int(-c.z * P)), 'a_down')
f = air.put('down', placed(rows, 48, 16, 24, 15, 'floor'))
f.anchor = (24, 15)
air.save(os.path.join(SHEETS, 'ace_air.px'))
print('rendered', len(legs.frames) + len(top.frames) + len(air.frames), 'frames')
