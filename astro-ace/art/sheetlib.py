"""Sheet loading for the build. With ASTRO_DRAFT=1 any frame that is not drawn
yet is replaced by a labelled stand-in box so the game can be built and played
while the art is still on the desk. A release build refuses stand-ins."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'studio'))
from px import Sheet, Frame
from contracts import CONTRACTS, SHEETS

DRAFT = os.environ.get('ASTRO_DRAFT') == '1'
STANDIN_POINTS = {
    'g_treads': {'deck': (62, 10)},
    'g_hull': {'core': (22, 38), 'shoulder': (14, 18), 'head': (36, 6), 'rack': (68, 8), 'stack_a': (82, 16), 'stack_b': (74, 12)},
    'g_head': {'eye': (12, 20), 'dish': (36, 3)},
    'g_cannon': {'muzzle': (2, 12)}, 'g_rack': {'launch': (6, 8)},
    'g_pod': {'arm_l': (10, 18), 'arm_r': (46, 18), 'gun': (28, 22)}, 'g_claw': {'muzzle': (8, 14)},
    'ace_top': {'muzzle': (35, 34)}, 'ace_legs': {'waist': (14, 3)}, 'sled': {'seat': (28, 12)},
    'trooper': {'muzzle': (30, 16)}, 'turret': {'muzzle': (30, 16)},
}
_cache, standins = {}, []


def _standin(s, name, sheet_name, pal_keys):
    w, h = s.cell
    f = Frame(name, w, h)
    m = 1 if min(w, h) <= 16 else max(2, min(w, h) // 8)
    a, b = pal_keys
    f.rows = [''.join('.' if (x < m or x >= w - m or y < m or y >= h - m) else
                      ('k' if (x in (m, w - m - 1) or y in (m, h - m - 1)) else (a if (x + y) % 6 < 3 else b))
                      for x in range(w)) for y in range(h)]
    f.points = dict(STANDIN_POINTS.get(sheet_name, {}))
    return f


def get(name):
    if name in _cache:
        return _cache[name]
    pal, cell, anchor, frames, pts, extra = CONTRACTS[name]
    p = os.path.join(SHEETS, name + '.px')
    s = None
    if os.path.exists(p):
        try:
            s = Sheet(p)
        except SyntaxError:
            if not DRAFT:
                raise
    if s is None:
        s = Sheet()
        s.name, s.palette, s.cell, s.anchor = name, pal, cell, anchor
    keys = {'ace': 'rR', 'guard': 'bc', 'mech': 'bc', 'fx': 'oy'}[pal]
    for fr in frames:
        ok = fr in s and any(ch != '.' for r in s[fr].rows for ch in r)
        need = pts + extra.get(fr, [])
        if ok and all(q in s[fr].points for q in need):
            continue
        if not DRAFT:
            raise SystemExit(f'{name}:{fr} is not drawn (or lacks a point). `python3 art/contracts.py` shows the board; '
                             f'ASTRO_DRAFT=1 builds with stand-ins.')
        standins.append(f'{name}:{fr}')
        if ok:                                               # drawn, but a point is missing
            for q in need:
                s[fr].points.setdefault(q, STANDIN_POINTS.get(name, {}).get(q, (cell[0] // 2, cell[1] // 2)))
        else:
            f = _standin(s, fr, name, keys)
            if fr in s:
                s.frames[s.names().index(fr)] = f
            else:
                s.frames.append(f)
    _cache[name] = s
    return s
