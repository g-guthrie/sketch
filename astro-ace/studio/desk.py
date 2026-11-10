"""desk: the drawing desk. View, compare and edit hand-drawn .px sheets.

    desk.py view  SHEET [FRAME ...] [-s 8] [--bg '#583088'] [--cols 4] [-o out.png]
    desk.py onion SHEET FRAME FRAME ... [-s 6]         each frame over a ghost of the one before
    desk.py gif   SHEET FRAME,FRAME,... [--ms 66] [-s 4]
    desk.py critic SHEET [FRAME ...]                   craft check against the house bar
    desk.py copy  SHEET SRC DST                        new frame starting as a copy (then redraw it)
    desk.py shift SHEET FRAME DX DY [X0 Y0 X1 Y1]      nudge a frame or a region of it
    desk.py paste SHEET SRC X0 Y0 X1 Y1 DST DX DY      lift a region from one frame onto another
    desk.py rows  SHEET FRAME Y  < rows                redraw rows Y.. from stdin (bare pixels or NN|..|)
    desk.py plot  SHEET FRAME X Y KEY [X Y KEY ...]    set single pixels
    desk.py rot   SHEET SRC DST [QUARTERS]             new frame = SRC turned clockwise by quarter turns
    desk.py flip  SHEET FRAME                          mirror left-right
    desk.py new   SHEET FRAME [W H]                    blank frame
    desk.py fmt   SHEET                                rewrite rulers and row numbers

`view` draws every pixel as a square with row/column numbers on the margins,
so what is seen can be traced straight back to a row of the sheet, and puts
1x and 2x proofs beside the enlargement because a sprite is judged at the size
it is played.
"""
import sys, os, argparse
sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'art'))
import numpy as np
from PIL import Image, ImageDraw
from pixelstudio import T, rgb15, rgb24, luma
from px import Sheet, blank

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'out', 'desk')


def palette(name):
    import style
    return style.PALETTES[name]


def frame_rgb(cv, bg):
    h, w = cv.a.shape
    rgb = np.zeros((h, w, 3), np.uint8)
    rgb[:] = np.array(rgb24(rgb15(bg)), np.uint8)
    for c in set(cv.a.flatten().tolist()) - {T}:
        rgb[cv.a == c] = rgb24(c)
    return rgb


def plate(cv, name, scale, bg, marks=None, proofs=True):
    """One frame, enlarged, with numbered margins, tile grid and true-size proofs."""
    h, w = cv.a.shape
    rgb = frame_rgb(cv, bg)
    big = Image.fromarray(rgb).resize((w * scale, h * scale), Image.NEAREST)
    d = ImageDraw.Draw(big)
    if scale >= 5:
        for x in range(0, w + 1):
            if x % 8 == 0:
                d.line([(x * scale, 0), (x * scale, h * scale)], fill=(255, 0, 255) if x % 8 == 0 else (0, 0, 0))
        for y in range(0, h + 1):
            if y % 8 == 0:
                d.line([(0, y * scale), (w * scale, y * scale)], fill=(255, 0, 255))
    for k, (x, y) in (marks or {}).items():
        cx, cy = x * scale + scale // 2, y * scale + scale // 2
        d.line([(cx - scale, cy), (cx + scale, cy)], fill=(0, 255, 0))
        d.line([(cx, cy - scale), (cx, cy + scale)], fill=(0, 255, 0))
        d.text((cx + 3, cy + 2), k, fill=(0, 255, 0))
    ml, mt = 22, 26
    pw = (w * 2 + 8) if proofs else 0
    im = Image.new('RGB', (ml + w * scale + 6 + pw, mt + h * scale + 14), (24, 24, 28))
    im.paste(big, (ml, mt))
    d = ImageDraw.Draw(im)
    d.text((ml, 1), name, fill=(255, 255, 255))
    step = 2 if scale >= 10 else 4
    for x in range(0, w, step):
        d.text((ml + x * scale + 1, 14), str(x), fill=(170, 170, 180))
    for y in range(0, h, 2 if scale >= 8 else 4):
        d.text((2, mt + y * scale + (scale - 10) // 2), f'{y:2d}', fill=(170, 170, 180))
    if proofs:
        x0 = ml + w * scale + 6
        im.paste(Image.fromarray(rgb), (x0, mt))
        im.paste(Image.fromarray(rgb).resize((w * 2, h * 2), Image.NEAREST), (x0, mt + h + 6))
    return im


def tile(ims, cols, pad=6):
    w, h = max(i.width for i in ims), max(i.height for i in ims)
    rows = (len(ims) + cols - 1) // cols
    out = Image.new('RGB', (min(cols, len(ims)) * (w + pad) + pad, rows * (h + pad) + pad), (12, 12, 16))
    for n, i in enumerate(ims):
        out.paste(i, (pad + (n % cols) * (w + pad), pad + (n // cols) * (h + pad)))
    return out


def out_path(a, sh, tag):
    os.makedirs(OUT, exist_ok=True)
    return a.o or os.path.join(OUT, f'{sh.name}_{tag}.png')


def cmd_view(a):
    sh = Sheet(a.sheet)
    pal = palette(sh.palette)
    names = a.frames or sh.names()
    ims = []
    for n in names:
        f = sh[n]
        marks = dict(f.points)
        marks['+'] = sh.anchor_of(f)
        ims.append(plate(sh.canvas(f, pal), n, a.s, a.bg, marks if not a.clean else None))
    p = out_path(a, sh, 'view')
    tile(ims, a.cols).save(p)
    print(p)


def cmd_onion(a):
    sh = Sheet(a.sheet)
    pal = palette(sh.palette)
    names = a.frames or sh.names()
    ims = []
    for i, n in enumerate(names):
        cur = frame_rgb(sh.canvas(n, pal), a.bg).astype(float)
        prev_c = sh.canvas(names[i - 1], pal)
        prev = frame_rgb(prev_c, a.bg).astype(float)
        ghost = prev * 0.35 + np.array([40, 90, 200]) * 0.65
        cur_c = sh.canvas(n, pal)
        mix = np.where((cur_c.a != T)[..., None], cur, np.where((prev_c.a != T)[..., None], ghost, cur))
        im = Image.fromarray(mix.astype(np.uint8)).resize((cur.shape[1] * a.s, cur.shape[0] * a.s), Image.NEAREST)
        ImageDraw.Draw(im).text((2, 1), f'{names[i - 1]}>{n}', fill=(255, 255, 255))
        ims.append(im)
    p = out_path(a, sh, 'onion')
    tile(ims, a.cols).save(p)
    print(p)


def cmd_gif(a):
    sh = Sheet(a.sheet)
    pal = palette(sh.palette)
    names = a.frames[0].split(',')
    ims = [Image.fromarray(frame_rgb(sh.canvas(n, pal), a.bg)) for n in names]
    ims = [i.resize((i.width * a.s, i.height * a.s), Image.NEAREST) for i in ims]
    p = (a.o or os.path.join(OUT, f'{sh.name}.gif'))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    ims[0].save(p, save_all=True, append_images=ims[1:], duration=a.ms, loop=0)
    print(p)


def cmd_critic(a):
    import critic
    sh = Sheet(a.sheet)
    pal = palette(sh.palette)
    bad = 0
    for n in (a.frames or sh.names()):
        f = sh[n]
        seams = ([sh.anchor_of(f)[1]] if 'bottom' in sh.open else []) + \
                ([f.points['waist'][1] + 1] if 'top' in sh.open and 'waist' in f.points else [])
        rep = critic.review(sh.canvas(f, pal), pal, n, open_edges=sh.open, seam_rows=seams)
        print(critic.format_report(rep))
        bad += len(rep['faults'])
    sys.exit(1 if bad and a.strict else 0)


def cmd_copy(a):
    sh = Sheet(a.sheet)
    src, dst = a.frames
    f = sh.put(dst, list(sh[src].rows), after=src if dst not in sh else None)
    s = sh[src]
    f.points, f.boxes, f.anchor, f.dur = dict(s.points), dict(s.boxes), s.anchor, s.dur
    sh.save()


def _region(f, r):
    return (0, 0, f.w - 1, f.h - 1) if not r else tuple(int(v) for v in r)


def cmd_shift(a):
    sh = Sheet(a.sheet)
    f = sh[a.frames[0]]
    dx, dy = int(a.frames[1]), int(a.frames[2])
    x0, y0, x1, y1 = _region(f, a.frames[3:7])
    g = f.grid()
    cut = [[g[y][x] for x in range(x0, x1 + 1)] for y in range(y0, y1 + 1)]
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            g[y][x] = '.'
    for j, row in enumerate(cut):
        for i, ch in enumerate(row):
            x, y = x0 + i + dx, y0 + j + dy
            if ch != '.' and 0 <= x < f.w and 0 <= y < f.h:
                g[y][x] = ch
    f.rows = [''.join(r) for r in g]
    sh.save()


def cmd_paste(a):
    sh = Sheet(a.sheet)
    src = sh[a.frames[0]]
    x0, y0, x1, y1 = (int(v) for v in a.frames[1:5])
    dst = sh[a.frames[5]]
    dx, dy = int(a.frames[6]), int(a.frames[7])
    g = dst.grid()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            ch = src.rows[y][x]
            xx, yy = x - x0 + dx, y - y0 + dy
            if ch != '.' and 0 <= xx < dst.w and 0 <= yy < dst.h:
                g[yy][xx] = ch
    dst.rows = [''.join(r) for r in g]
    sh.save()


def cmd_rows(a):
    """Replace a run of rows, read from stdin, starting at row Y. Lines may be
    bare pixels or `NN|pixels|`. The pencil for redrawing part of a frame."""
    sh = Sheet(a.sheet)
    f = sh[a.frames[0]]
    y = int(a.frames[1])
    for line in sys.stdin.read().split('\n'):
        if not line.strip():
            continue
        px = line.strip()
        if '|' in px:
            px = px.split('|')[1]
        if len(px) != f.w:
            sys.exit(f'row {y}: {len(px)} wide, frame is {f.w}; nothing written')
        f.rows[y] = px
        y += 1
    sh.save()


def cmd_plot(a):
    """Set single pixels: plot SHEET FRAME X Y KEY [X Y KEY ...]"""
    sh = Sheet(a.sheet)
    f = sh[a.frames[0]]
    g = f.grid()
    v = a.frames[1:]
    for i in range(0, len(v), 3):
        g[int(v[i + 1])][int(v[i])] = v[i + 2]
    f.rows = [''.join(r) for r in g]
    sh.save()


def cmd_rot(a):
    """rot SHEET SRC DST [QUARTERS]: DST = SRC turned by quarter turns clockwise
    (lossless). A starting point for a turned pose; relight it by hand after."""
    sh = Sheet(a.sheet)
    k = int(a.frames[2]) if len(a.frames) > 2 else 1
    g = np.array(sh[a.frames[0]].grid())
    g = np.rot90(g, -k)
    sh.put(a.frames[1], [''.join(r) for r in g], after=a.frames[0] if a.frames[1] not in sh else None)
    sh.save()


def cmd_flip(a):
    sh = Sheet(a.sheet)
    f = sh[a.frames[0]]
    f.rows = [r[::-1] for r in f.rows]
    sh.save()


def cmd_new(a):
    sh = Sheet(a.sheet)
    w, h = (int(a.frames[1]), int(a.frames[2])) if len(a.frames) > 2 else sh.cell
    sh.put(a.frames[0], blank(w, h))
    sh.save()


def cmd_fmt(a):
    Sheet(a.sheet).save()


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd')
    ap.add_argument('sheet')
    ap.add_argument('frames', nargs='*')
    ap.add_argument('-s', type=int, default=8)
    ap.add_argument('-o')
    ap.add_argument('--bg', default='#583088')
    ap.add_argument('--cols', type=int, default=4)
    ap.add_argument('--ms', type=int, default=66)
    ap.add_argument('--clean', action='store_true')
    ap.add_argument('--strict', action='store_true')
    a = ap.parse_args()
    globals()['cmd_' + a.cmd](a)
