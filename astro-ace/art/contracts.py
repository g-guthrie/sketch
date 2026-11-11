"""Contracts: what every sheet must contain for the game to build.

The engine and the boss assembly are written against these names. `check()`
tells an artist exactly what is still missing or mis-sized; `python3
art/contracts.py` prints the production board.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'studio'))
from px import Sheet

SHEETS = os.path.join(os.path.dirname(__file__), 'sheets')
R = lambda p, n: [f'{p}{i}' for i in range(n)]

# sheet: (palette, cell, anchor, frames, points required on every frame, {frame: extra points})
CONTRACTS = {
    'g_head':    ('guard', (56, 40), (28, 39), ['head'], ['eye', 'dish'], {}),
    'g_eye':     ('guard', (20, 20), (10, 10), ['shut', 'half', 'open', 'dead'], [], {}),
    'g_dish':    ('guard', (20, 20), (10, 19), R('spin', 4) + ['wreck'], [], {}),
    'g_pod':     ('guard', (56, 24), (28, 0), ['thrust0', 'thrust1'], ['arm_l', 'arm_r', 'gun'], {}),
    'g_link':    ('guard', (8, 8), (4, 4), ['link'], [], {}),
    'g_claw':    ('guard', (16, 16), (8, 3), ['claw'], ['muzzle'], {}),
    'trooper':   ('mech', (32, 40), (16, 39), R('run', 6) + ['aim', 'aim_fire'], [], {'aim': ['muzzle'], 'aim_fire': ['muzzle']}),
    'turret':    ('mech', (32, 32), (16, 31), ['a0', 'a45', 'a90', 'am30'], ['muzzle'], {}),
    'saucer':    ('mech', (32, 16), (16, 15), ['fly0', 'fly1'], [], {}),
    'pod':       ('mech', (16, 16), (8, 15), ['pod0', 'pod1'], [], {}),
    'sled':      ('ace', (64, 32), (32, 31), ['hover0', 'hover1'], ['seat'], {}),
    'items':     ('fx', (16, 16), (8, 15), ['drum', 'badge_s', 'badge_m', 'badge_l', 'fire0', 'fire1'], [], {}),
    'boom':      ('fx', (64, 64), (32, 32), R('boom', 5), [], {}),
    'shots':     ('fx', (16, 16), (8, 8), ['pea0', 'pea1', 'pellet', 'ebul0', 'ebul1', 'laser_h', 'laser_v', 'laser_d', 'flash', 'spark'], [], {}),
    'hud':       ('ace', (8, 8), (0, 0), ['life'], [], {}),
    'sfx':       ('fx', (32, 16), (16, 8), ['pow', 'boom'], [], {}),
}


def check(name, sheets=SHEETS):
    """-> list of problems for one sheet (empty = meets its contract)."""
    pal, cell, anchor, frames, pts, extra = CONTRACTS[name]
    p = os.path.join(sheets, name + '.px')
    if not os.path.exists(p):
        return ['not started']
    try:
        s = Sheet(p)
    except SyntaxError as e:
        return [str(e)]
    out = []
    if s.palette != pal: out.append(f'palette {s.palette}, contract says {pal}')
    if s.cell != cell: out.append(f'cell {s.cell}, contract says {cell}')
    if s.anchor != anchor: out.append(f'anchor {s.anchor}, contract says {anchor}')
    for f in frames:
        if f not in s:
            out.append(f'frame {f} missing')
            continue
        for q in pts + extra.get(f, []):
            if q not in s[f].points:
                out.append(f'frame {f}: point {q} missing')
        if not any(ch != '.' for r in s[f].rows for ch in r):
            out.append(f'frame {f} is blank')
    return out


if __name__ == '__main__':
    done = 0
    for n, c in CONTRACTS.items():
        pr = check(n)
        done += not pr
        print(f"{n:<11} {len(c[3]):>2} frames  " + ('ok' if not pr else '; '.join(pr[:4]) + (f' (+{len(pr) - 4} more)' if len(pr) > 4 else '')))
    print(f'{done}/{len(CONTRACTS)} sheets meet their contract')
