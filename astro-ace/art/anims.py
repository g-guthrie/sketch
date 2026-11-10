"""How drawn frames go together: the hero's split body and every animation's
frame order and timing. The engine tables are exported from here, and the desk
previews (`python3 art/anims.py`) are rendered from the same data."""
from style import *
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'studio'))
from px import Sheet

SHEETS = os.path.join(os.path.dirname(__file__), 'sheets')
_cache = {}
def sheet(name):
    if name not in _cache:
        _cache[name] = Sheet(os.path.join(SHEETS, name + '.px'))
    return _cache[name]

def ace(top, legs, w=48, h=64, ox=14, oy=60):
    """Composite of a legs frame and a top frame: top.anchor sits on legs.waist."""
    L, Tp = sheet('ace_legs'), sheet('ace_top')
    lf, tf = L[legs], Tp[top]
    c = Canvas(w, h, ACE)
    la = L.anchor_of(lf)
    lx, ly = ox - la[0], oy - la[1]
    c.stamp(L.canvas(lf, ACE), lx, ly)
    ta = Tp.anchor_of(tf)
    wx, wy = lf.points['waist']
    c.stamp(Tp.canvas(tf, ACE), lx + wx - ta[0], ly + wy - ta[1])
    return c

if __name__ == '__main__':
    out = os.path.join(os.path.dirname(__file__), '..', 'out', 'desk')
    os.makedirs(out, exist_ok=True)
    L, Tp = sheet('ace_legs'), sheet('ace_top')
    tag = '_' + sys.argv[1] if len(sys.argv) > 1 else ''
    poses = [ace(t, 'idle', h=72, oy=62) for t in Tp.names()] + ([ace('fwd', 'crouch', h=72, oy=62)] if 'crouch' in L else [])
    sheet_img = [to_image(p, 6, '#583088') for p in poses]
    w = sum(i.width for i in sheet_img)
    from PIL import Image
    o = Image.new('RGB', (w, sheet_img[0].height))
    x = 0
    for i in sheet_img:
        o.paste(i, (x, 0)); x += i.width
    o.save(out + f'/ace_poses{tag}.png')
    runs = [n for n in L.names() if n.startswith('run')]
    if runs:
        gif([ace('fwd', n) for n in runs], out + f'/ace_run{tag}.gif', 66, 6, '#583088')
        sheet([ace('fwd', n) for n in runs], out + f'/ace_run{tag}.png', 5, cols=8, bg='#583088', checker=False)
    print(out)
