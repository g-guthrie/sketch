"""The Guardian's flying pod form (last stage): head on a thruster pod with chain
arms, pinned together from drawn sheets by named points. The tank form is
painted and assembled in art/paint.py. PARTS holds every part's hit points.

A part's `at` is (parent part, point on the parent's frame). The part's own
anchor pixel is pinned to that point.
"""
from style import *
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'studio'))
from px import Sheet

SHEETS = os.path.join(os.path.dirname(__file__), 'sheets')

# name: (sheet, default frame, parent, point on parent)      draw order = list order (back to front)
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
    if os.environ.get('ASTRO_BUILD') == '1':
        import sheetlib
        return sheetlib.get(name)
    p = os.path.join(SHEETS, name + '.px')
    if name not in _cache:
        try:
            _cache[name] = Sheet(p) if os.path.exists(p) else None
        except SyntaxError as e:                     # someone is mid-edit on this sheet
            print('skipping', e)
            _cache[name] = None
    return _cache[name]


def layout(parts, frames=None, missing=None):
    """Resolve every part's top-left position relative to the root's anchor.
    Returns [(name, sheet, frame, x, y)] in draw order. frames overrides the
    default frame per part (a state). Parents may come later in the list than
    their children (draw order is not attachment order)."""
    frames = frames or {}
    pos, out, todo = {}, {}, list(parts)
    while todo:
        rest = []
        for part in todo:
            name, sh, frame, parent, point = part
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
                rest.append(part)
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
        if len(rest) == len(todo):
            break                                    # parents missing: leave their children out
        todo = rest
    return [out[p[0]] for p in parts if p[0] in out]


def render(parts, frames=None, w=160, h=128, ox=80, oy=124, pal=None):
    c = Canvas(w, h, pal or GUARD)
    for name, s, f, x, y in layout(parts, frames):
        c.stamp(s.canvas(f, GUARD), ox + x, oy + y)
    return c


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(__file__), '..', 'out', 'desk')
    os.makedirs(out, exist_ok=True)
    miss = []
    layout(POD, {'eye': 'open'}, miss)
    save(render(POD, {'eye': 'open'}, oy=40), out + '/guardian_pod.png', 4)
    print(out + '/guardian_pod.png')
    if miss:
        print('not drawn yet:', ', '.join(sorted(set(miss))))
