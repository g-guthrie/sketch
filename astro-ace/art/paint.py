"""paint: turn generated paintings (art/gen/raw) into the game's sprite frames.

The hero is one character edited into each pose and animated from those poses.
The Guardian is ONE painting, plus inpainted variants of the same painting
with single components changed (wrecked, shut, blown open). Because every
variant is identical outside the edited region, the boss is assembled as:

  base     the painting with a hole where each destructible component sits
  regions  for each component, the same rectangle cut from whichever variant
           shows the state it is in (intact, shut, wrecked ...)
  cannon   the barrel, cut from an outpainted copy, turned by the hardware

so any combination of part states is seamless.

    python3 art/paint.py      -> out/desk/paint_hero.png, paint_boss.png
"""
import os, sys
import numpy as np
from PIL import Image

RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gen', 'raw')
BG = (88, 48, 136)                 # the flat colour the boss was flattened onto for editing


def rgba(name):
    a = np.array(Image.open(os.path.join(RAW, name)).convert('RGBA'))
    a[a[..., 3] < 128] = 0
    a[a[..., 3] >= 128, 3] = 255
    r, g, b = (a[..., i].astype(int) for i in range(3))
    a[(r > 170) & (b > 170) & (g < 110)] = 0             # the animator sometimes leaves pure-magenta specks
    return a


def despeckle(a, keep=5):
    """Drop stray specks: opaque blobs smaller than `keep` pixels."""
    h, w = a.shape[:2]
    op = a[..., 3] > 0
    seen = np.zeros((h, w), bool)
    for y in range(h):
        for x in range(w):
            if not op[y, x] or seen[y, x]:
                continue
            st, pts = [(x, y)], []
            seen[y, x] = True
            while st:
                px, py = st.pop()
                pts.append((px, py))
                for nx in (px - 1, px, px + 1):
                    for ny in (py - 1, py, py + 1):
                        if 0 <= nx < w and 0 <= ny < h and op[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            st.append((nx, ny))
            if len(pts) < keep:
                for px, py in pts:
                    a[py, px] = 0
    return a


def keyed(name, tol=30):
    """A flattened edit result: pixels close to the flat background become transparent."""
    a = np.array(Image.open(os.path.join(RAW, name)).convert('RGBA'))
    d = np.abs(a[..., :3].astype(int) - np.array(BG)).sum(-1)
    a[d < tol] = 0
    return a


# ================================================================ hero
CANVAS, ANCHOR = 96, (36, 79)       # every hero frame is a 96x96 canvas; anchor = between the feet, on the sole row

def sheet_frames(name, n):
    """Animation sheets come back as a grid of 96x96 cells."""
    a = rgba(name)
    cols = a.shape[1] // CANVAS
    return [a[(i // cols) * CANVAS:(i // cols + 1) * CANVAS, (i % cols) * CANVAS:(i % cols + 1) * CANVAS].copy() for i in range(n)]


def glow_tip(a, aim):
    """Muzzle = the far end of the rifle's green glow along the aim direction."""
    r, g, b = (a[..., i].astype(int) for i in range(3))
    m = (a[..., 3] > 0) & (g > r + 50) & (g > b + 30)
    ys, xs = np.nonzero(m)
    if not len(xs):
        return None
    s = xs * aim[0] + ys * aim[1]
    k = s >= s.max() - 2
    return int(round(xs[k].mean())), int(round(ys[k].mean()))


def largest(a):
    """Keep only the biggest connected blob (drops baked ground shadows and loose effects)."""
    h, w = a.shape[:2]
    op = a[..., 3] > 0
    lab = np.zeros((h, w), int)
    best, n = (0, 0), 0
    for y in range(h):
        for x in range(w):
            if op[y, x] and not lab[y, x]:
                n += 1
                st, cnt = [(x, y)], 0
                lab[y, x] = n
                while st:
                    px, py = st.pop()
                    cnt += 1
                    for nx in (px - 1, px, px + 1):
                        for ny in (py - 1, py, py + 1):
                            if 0 <= nx < w and 0 <= ny < h and op[ny, nx] and not lab[ny, nx]:
                                lab[ny, nx] = n
                                st.append((nx, ny))
                if cnt > best[0]:
                    best = (cnt, n)
    a = a.copy()
    a[lab != best[1]] = 0
    return a


def centre(a):
    ys, xs = np.nonzero(a[..., 3])
    return (int(xs.min() + xs.max() + 1) // 2, int(ys.min() + ys.max() + 1) // 2)


# Where each frame comes from. Stills marked `keyed` are inpaints of the idle
# frame (only the arms and rifle repainted, so the body stays pixel-identical).
AIMS = {'idle': (1, 0), 'upfwd': (0.7, -0.7), 'up': (0, -1), 'dnfwd': (0.7, 0.7), 'crouch': (1, 0)}

def hero():
    """-> [(frame name, RGBA array, anchor, {point: (x, y)})]"""
    out = []
    def add(n, a, anchor=ANCHOR, aim=None):
        a = despeckle(a)
        pts = {}
        if aim:
            t = glow_tip(a, aim)
            if t:
                pts['muzzle'] = t
        out.append((n, a, anchor, pts))
    stills = {'idle': rgba('hero_start.png'), 'upfwd': despeckle(keyed('hero_upfwd4.png')), 'up': rgba('hero_up_0.png'),
              'dnfwd': despeckle(keyed('hero_dnfwd4.png')), 'crouch': rgba('hero_crouch.png')}
    for n in ('idle', 'upfwd', 'up', 'dnfwd', 'crouch'):
        add(n, stills[n], aim=AIMS[n])
    runs = {'run': 'hero_run.png', 'runuf': 'hero_run_uf4.png', 'runup': 'hero_run_up.png', 'rundf': 'hero_run_df5.png'}
    for base, fn in runs.items():
        have = os.path.exists(os.path.join(RAW, fn))
        for i, f in enumerate(sheet_frames(fn if have else runs['run'], 8)):
            if base == 'runup':
                f[:20] = 0                              # the animator added muzzle sparks above the barrel on some frames
            add(f'{base}{i}', largest(f))
    # jump: rise, two tucked frames at the top, fall. Anchored on the body's middle.
    fl = sheet_frames('hero_flip.png', 8)
    for i, k in enumerate((2, 3, 4, 5)):
        f = largest(fl[k])
        add(f'jump{i}', f, centre(f))
    ko = sheet_frames('hero_ko.png', 8)
    f = largest(ko[5])
    add('hit', f, centre(f))
    d = largest(ko[7])
    ys, xs = np.nonzero(d[..., 3])
    add('down', d, (int(xs.min() + xs.max()) // 2, int(ys.max())))
    return out


# ================================================================ the Guardian
ROOT = (80, 121)                    # master pixel pinned to the boss's ground point
REGIONS = {                         # name: (x0, y0, x1, y1 exclusive, {state: source painting})
    'rack':  (97, 16, 132, 44, {'open': 'boss_master.png', 'shut': 'boss_rack_shut.png', 'wreck': 'boss_rack_wreck.png'}),
    'dish':  (64, 0, 95, 16, {'ok': 'boss_master.png', 'wreck': 'boss_dish_wreck.png'}),
    'hatch': (28, 50, 62, 84, {'shut': 'boss_master.png', 'open': 'boss_hatch_open.png'}),
    'eye':   (54, 20, 70, 35, {'open': 'boss_master.png', 'shut': 'boss_eye_shut.png'}),
}
BARREL_X = 15                       # the barrel is cut from the master left of this column
PIVOT = (23, 54)                    # cannon pivot inside the shoulder collar
POINTS = {'stack_a': (139, 17), 'stack_b': (151, 19), 'launch': (104, 28), 'head_top': (74, 14)}

def boss():
    """-> {sheet: [(frame, RGBA, anchor, points)]}, all anchored on the same ground point."""
    master = rgba('boss_master.png')
    inreg = np.zeros(master.shape[:2], bool)
    out = {}
    for name, (x0, y0, x1, y1, states) in REGIONS.items():
        inreg[y0:y1, x0:x1] = True
        fr = []
        for st, src in states.items():
            a = master if src == 'boss_master.png' else keyed(src)
            cell = np.zeros_like(master)
            cell[y0:y1, x0:x1] = a[y0:y1, x0:x1]
            if src != 'boss_master.png':                # outside the painted change, keep the master's own edge
                keep = master[y0:y1, x0:x1, 3] > 0
                c = cell[y0:y1, x0:x1]
                near_bg = c[..., 3] == 0
                c[near_bg & keep & _unchanged(master[y0:y1, x0:x1], a[y0:y1, x0:x1])] = master[y0:y1, x0:x1][near_bg & keep & _unchanged(master[y0:y1, x0:x1], a[y0:y1, x0:x1])]
            fr.append((st, cell, ROOT, {}))
        out['gb_' + name] = fr
    base = master.copy()
    base[inreg] = 0
    barrel = (np.arange(base.shape[1])[None, :] < BARREL_X) & (np.arange(base.shape[0])[:, None] >= 40) & (np.arange(base.shape[0])[:, None] < 68)
    base[barrel] = 0
    base[46:63, BARREL_X:BARREL_X + 2] = (24, 16, 32, 255)          # the open mouth of the collar when the barrel is gone
    out['gb_base'] = [('base', base, ROOT, {})]
    wide = keyed('boss_wide.png')                                   # master shifted right by 32 with the full barrel
    cw = np.zeros((32, 64, 4), np.uint8)
    x0, y0 = 0, 38                                                  # 64x32 window of the wide painting holding the barrel
    win = wide[y0:y0 + 32, x0:x0 + 64].copy()
    win[:, 32 + BARREL_X + 6:] = 0                                  # keep a little of the barrel under the collar
    win[:6] = 0; win[27:] = 0
    cw[:] = win
    out['gb_cannon'] = [('cannon', despeckle(cw, 12), (PIVOT[0] + 32 - x0, PIVOT[1] - y0), {})]
    return out

def _unchanged(m, a):
    return (np.abs(m[..., :3].astype(int) - a[..., :3].astype(int)).sum(-1) < 12)


def assembled(states=None, angle=0):
    """Preview: the boss with each region in a given state."""
    states = states or {}
    b = boss()
    canvas = np.zeros((128, 192, 4), np.uint8)
    def put(a, dx=32):
        op = a[..., 3] > 0
        canvas[:a.shape[0], dx:dx + a.shape[1]][op] = a[op]
    if states.get('cannon', True):
        c, anc = b['gb_cannon'][0][1], b['gb_cannon'][0][2]
        im = Image.fromarray(c).rotate(angle, resample=Image.NEAREST, center=anc)
        a = np.array(im)
        op = a[..., 3] > 0
        ox, oy = 32 + PIVOT[0] - anc[0], PIVOT[1] - anc[1]
        canvas[oy:oy + 32, ox:ox + 64][op] = a[op]
    put(b['gb_base'][0][1])
    for name in REGIONS:
        fr = dict((f[0], f[1]) for f in b['gb_' + name])
        put(fr[states.get(name, list(fr)[0])])
    return canvas


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out', 'desk')
    os.makedirs(out, exist_ok=True)
    fr = hero()
    k = 3
    o = Image.new('RGBA', (CANVAS * k * 10, CANVAS * k * ((len(fr) + 9) // 10)), (*BG, 255))
    for i, (n, a, anc, pts) in enumerate(fr):
        a = a.copy()
        for p in pts.values():
            a[p[1], p[0]] = (255, 0, 255, 255)
        im = Image.fromarray(a).resize((a.shape[1] * k, a.shape[0] * k), Image.NEAREST)
        o.alpha_composite(im, ((i % 10) * CANVAS * k, (i // 10) * CANVAS * k))
    o.convert('RGB').save(out + '/paint_hero.png')
    sts = [{}, {'rack': 'shut', 'eye': 'shut'}, {'rack': 'wreck', 'dish': 'wreck', 'cannon': False}, {'rack': 'wreck', 'dish': 'wreck', 'hatch': 'open', 'cannon': False, 'eye': 'shut'}]
    o = Image.new('RGBA', (192 * 3 * 2, 128 * 3 * 2), (*BG, 255))
    for i, s in enumerate(sts):
        im = Image.fromarray(assembled(s, angle=(-25 if i == 1 else 0))).resize((192 * 3, 128 * 3), Image.NEAREST)
        o.alpha_composite(im, ((i % 2) * 192 * 3, (i // 2) * 128 * 3))
    o.convert('RGB').save(out + '/paint_boss.png')
    print(len(fr), 'hero frames;', {k: len(v) for k, v in boss().items()})
    for n, a, anc, pts in fr:
        if pts: print(n, pts)
