"""The Foundry Guardian: boss assembly sheet.

The boss is not one picture. It is a set of separately drawn parts pinned
together by named points, each with its own frames, hit box and hit points.
This file is the planning sheet: which part hangs off which point, in what
order they are drawn, and which states exist. The desk preview
(`python3 art/guardian.py`) and the engine tables are both made from it.

A part's `at` is (parent part, point on the parent's frame). The part's own
anchor pixel is pinned to that point.
"""
from style import *
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'studio'))
from px import Sheet

SHEETS = os.path.join(os.path.dirname(__file__), 'sheets')

# name: (sheet, default frame, parent, point on parent)      draw order = list order (back to front)
TANK = [
    ('stack_a',  'g_stack',    'stack',  'hull',   'stack_a'),
    ('stack_b',  'g_stack',    'stack',  'hull',   'stack_b'),
    ('rack',     'g_rack',     'closed', 'hull',   'rack'),
    ('treads',   'g_treads',   'roll0',  None,     None),
    ('hull',     'g_hull',     'hull',   'treads', 'deck'),
    ('core',     'g_core',     'glow0',  'hull',   'core'),
    ('plate',    'g_plate',    'intact', 'hull',   'core'),
    ('head',     'g_head',     'head',   'hull',   'head'),
    ('eye',      'g_eye',      'shut',   'head',   'eye'),
    ('dish',     'g_dish',     'spin0',  'head',   'dish'),
    ('cannon',   'g_cannon',   'cannon', 'hull',   'shoulder'),
    ('shoulder', 'g_shoulder', 'joint',  'hull',   'shoulder'),
]
POD = [
    ('pod',  'g_pod',  'thrust0', None,   None),
    ('head', 'g_head', 'head',    'pod',  None),         # head anchor sits on the pod anchor
    ('eye',  'g_eye',  'shut',    'head', 'eye'),
    ('dish', 'g_dish', 'spin0',   'head', 'dish'),
]

# hit points and what each part is in the fight (engine reads this)
PARTS = {
    'cannon': dict(hp=14, wreck='stump'),
    'rack':   dict(hp=10, wreck='wreck'),
    'dish':   dict(hp=6,  wreck='wreck'),
    'plate':  dict(hp=12, wreck='broken'),
    'eye':    dict(hp=0,  weak=True),      # hurts the Guardian itself, only while open
    'core':   dict(hp=0,  weak=True),      # hurts the Guardian itself, once the plate is gone
}

_cache = {}
def sheet(name):
    p = os.path.join(SHEETS, name + '.px')
    if name not in _cache:
        _cache[name] = Sheet(p) if os.path.exists(p) else None
    return _cache[name]


def layout(parts, frames=None, missing=None):
    """Resolve every part's top-left position relative to the root's anchor.
    Returns [(name, sheet, frame, x, y)] in draw order. frames overrides the
    default frame per part (a state)."""
    frames = frames or {}
    pos, out = {}, {}
    for name, sh, frame, parent, point in parts:
        s = sheet(sh)
        fr = frames.get(name, frame)
        if fr is None:
            continue
        if s is None or fr not in s:
            if missing is not None:
                missing.append(f'{sh}:{fr}')
            continue
        f = s[fr]
        ax, ay = s.anchor_of(f)
        if parent is None:
            px, py = 0, 0
        elif parent not in pos:
            continue
        else:
            ps, pf, ox, oy = pos[parent]
            if point is None:
                px, py = ps.anchor_of(pf)
            elif point not in pf.points:
                if missing is not None:
                    missing.append(f'{ps.name}:{pf.name} point {point}')
                continue
            else:
                px, py = pf.points[point]
            px, py = ox + px, oy + py
        pos[name] = (s, f, px - ax, py - ay)
        out[name] = (name, s, f, px - ax, py - ay)
    return [out[p[0]] for p in parts if p[0] in out]


def render(parts, frames=None, w=160, h=128, ox=80, oy=124, pal=None):
    c = Canvas(w, h, pal or GUARD)
    for name, s, f, x, y in layout(parts, frames):
        c.stamp(s.canvas(f, GUARD), ox + x, oy + y)
    return c


STATES = [
    ('fresh', TANK, {}),
    ('attacking', TANK, {'eye': 'open', 'rack': 'open', 'cannon': 'fire', 'treads': 'roll1', 'dish': 'spin1'}),
    ('stripped', TANK, {'eye': 'half', 'rack': 'wreck', 'cannon': None, 'shoulder': 'stump', 'plate': 'broken',
                        'core': 'glow2', 'dish': 'wreck', 'treads': 'roll2'}),
    ('pod', POD, {'eye': 'open'}),
]

if __name__ == '__main__':
    from PIL import Image
    out = os.path.join(os.path.dirname(__file__), '..', 'out', 'desk')
    os.makedirs(out, exist_ok=True)
    miss = []
    ims = []
    for name, parts, fr in STATES:
        layout(parts, fr, miss)
        ims.append(to_image(render(parts, fr, oy=124 if parts is TANK else 40), 4, '#583088'))
    o = Image.new('RGB', (sum(i.width for i in ims[:2]), sum(i.height for i in ims[::2])))
    for n, i in enumerate(ims):
        o.paste(i, ((n % 2) * i.width, (n // 2) * i.height))
    o.save(out + '/guardian.png')
    print(out + '/guardian.png')
    if miss:
        print('not drawn yet:', ', '.join(sorted(set(miss))))
