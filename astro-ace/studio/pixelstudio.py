"""pixelstudio: a constraint-enforcing pixel art studio for the Game Boy Advance.

Everything is drawn onto indexed canvases whose colours are real 15-bit GBA
colours. The studio refuses (or reports) anything the hardware could not show:
more than 15 colours per palette, 8x8 tiles that mix palettes, tile budgets.

Sections: colour & palettes / canvas & drawing tools / patterns (halftone,
dither) / fonts / tiles & export / lint / preview rendering.
"""
import math
import numpy as np
from PIL import Image, ImageDraw

T = -1  # transparent


# ---------------------------------------------------------------- colour
def rgb15(c):
    """'#rrggbb' | (r,g,b) | 15-bit int  ->  15-bit GBA colour."""
    if isinstance(c, (int, np.integer)):
        return int(c)
    if isinstance(c, str):
        c = c.lstrip('#')
        r, g, b = (int(c[i:i + 2], 16) for i in (0, 2, 4))
    else:
        r, g, b = c
    q = lambda v: min(31, (v * 31 + 127) // 255)
    return q(r) | (q(g) << 5) | (q(b) << 10)


def rgb24(c15):
    e = lambda v: (v << 3) | (v >> 2)
    return e(c15 & 31), e((c15 >> 5) & 31), e((c15 >> 10) & 31)


def luma(c15):
    r, g, b = rgb24(c15)
    return 0.299 * r + 0.587 * g + 0.114 * b


class Palette:
    """One 16-colour GBA palette. Slot 0 is transparent; 15 usable colours.
    entries: (key, name, '#hex'). key is the single char used in text grids."""

    def __init__(self, name, entries):
        assert len(entries) <= 15, f'{name}: {len(entries)} colours > 15'
        self.name, self.colors, self.key, self.names = name, [], {}, []
        for k, n, h in entries:
            c = rgb15(h)
            assert k not in self.key and n not in self.key, f'{name}: duplicate key {k}/{n}'
            self.key[k] = c
            self.key[n] = c
            self.colors.append(c)
            self.names.append((k, n))

    def __getitem__(self, k):
        return self.key[k]

    def slot(self, c15):
        return self.colors.index(c15) + 1

    def words(self, backdrop=0):
        return [backdrop] + self.colors + [0] * (15 - len(self.colors))


# ---------------------------------------------------------------- patterns
def _dot_rank(p):
    """Rank matrix for a staggered (45 degree) Ben-Day dot screen of period p."""
    pts = []
    for y in range(p):
        for x in range(p):
            d = min(
                min(math.hypot(min(abs(x - cx), p - abs(x - cx)), min(abs(y - cy), p - abs(y - cy)))
                    for cx, cy in ((0, 0), (p / 2, p / 2))),
                99)
            pts.append((round(d, 4), (y * 7 + x * 3) % p, y, x))
    pts.sort()
    r = np.zeros((p, p))
    for i, (_, _, y, x) in enumerate(pts):
        r[y, x] = (i + 0.5) / (p * p)
    return r


def _bayer(n):
    m = np.array([[0]])
    while m.shape[0] < n:
        m = np.block([[4 * m, 4 * m + 2], [4 * m + 3, 4 * m + 1]])
    return (m + 0.5) / (n * n)


def pattern(kind, p=4):
    """Threshold matrix in (0,1). kinds: dot, bayer, hline, vline, diag, check."""
    if kind == 'dot':
        return _dot_rank(p)
    if kind == 'bayer':
        return _bayer(p)
    if kind == 'check':
        return np.array([[0.25, 0.75], [0.75, 0.25]])
    r = np.zeros((p, p))
    for y in range(p):
        for x in range(p):
            v = {'hline': y, 'vline': x, 'diag': (x + y) % p}[kind]
            r[y, x] = (v + 0.5) / p
    return r


# ---------------------------------------------------------------- canvas
class Canvas:
    def __init__(self, w, h, pal=None, wrap=False):
        self.w, self.h, self.pal, self.wrap = w, h, pal, wrap
        self.a = np.full((h, w), T, np.int32)

    # -- colour resolution
    def col(self, c):
        if c is None or (isinstance(c, str) and c in '. '):
            return T
        if isinstance(c, str) and not c.startswith('#'):
            return self.pal[c]
        return rgb15(c)

    def cols(self, cs):
        if isinstance(cs, (list, tuple, set)) or (isinstance(cs, str) and len(cs) > 1 and cs not in self.pal.key):
            return [self.col(c) for c in cs]
        return [self.col(cs)]

    def use(self, pal):
        self.pal = pal
        return self

    def copy(self):
        c = Canvas(self.w, self.h, self.pal, self.wrap)
        c.a = self.a.copy()
        return c

    # -- masks
    def mask(self, cs=None):
        """Boolean mask of pixels with colour(s) cs. None = all opaque."""
        if cs is None:
            return self.a != T
        if isinstance(cs, np.ndarray):
            return cs
        return np.isin(self.a, self.cols(cs))

    def paint(self, m, c):
        self.a[m] = self.col(c)
        return self

    def _xy(self):
        return np.meshgrid(np.arange(self.w), np.arange(self.h))

    # -- primitives
    def px(self, x, y, c):
        x, y = int(x), int(y)
        if self.wrap:
            x %= self.w
        if 0 <= x < self.w and 0 <= y < self.h:
            self.a[y, x] = self.col(c)
        return self

    def get(self, x, y):
        if self.wrap:
            x %= self.w
        return self.a[y, x] if 0 <= x < self.w and 0 <= y < self.h else T

    def line(self, x0, y0, x1, y1, c, w=1):
        x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        e = dx + dy
        while True:
            if w == 1:
                self.px(x0, y0, c)
            else:
                self.rect(x0 - (w - 1) // 2, y0 - (w - 1) // 2, w, w, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * e
            if e2 >= dy:
                e += dy
                x0 += sx
            if e2 <= dx:
                e += dx
                y0 += sy
        return self

    def path(self, pts, c, w=1, close=False):
        pts = list(pts) + ([pts[0]] if close else [])
        for (a, b), (d, e) in zip(pts, pts[1:]):
            self.line(a, b, d, e, c, w)
        return self

    def rect(self, x, y, w, h, c, fill=True):
        c = self.col(c)
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                if fill or yy in (int(y), int(y + h) - 1) or xx in (int(x), int(x + w) - 1):
                    self.px(xx, yy, c)
        return self

    def _apply(self, m, c, clip=None):
        if clip is not None:
            m = m & self.mask(clip)
        self.a[m] = self.col(c)
        return self

    def ellipse(self, cx, cy, rx, ry, c, clip=None):
        """Filled ellipse; centre may be fractional (x.5 for even widths)."""
        X, Y = self._xy()
        if self.wrap:
            X = (X - cx + self.w / 2) % self.w - self.w / 2 + cx
        return self._apply(((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1.0, c, clip)

    def circle(self, cx, cy, r, c, clip=None):
        return self.ellipse(cx, cy, r, r, c, clip)

    def capsule(self, x0, y0, x1, y1, r0, r1, c, clip=None):
        """Tapered thick limb from (x0,y0) radius r0 to (x1,y1) radius r1."""
        X, Y = self._xy()
        dx, dy = x1 - x0, y1 - y0
        L = dx * dx + dy * dy or 1e-9
        t = np.clip(((X - x0) * dx + (Y - y0) * dy) / L, 0, 1)
        d = np.hypot(X - (x0 + t * dx), Y - (y0 + t * dy))
        return self._apply(d <= r0 + (r1 - r0) * t, c, clip)

    def poly(self, pts, c, clip=None):
        im = Image.new('1', (self.w, self.h))
        for off in ((-self.w, 0, self.w) if self.wrap else (0,)):
            ImageDraw.Draw(im).polygon([(float(x) + off, float(y)) for x, y in pts], fill=1, outline=1)
        return self._apply(np.array(im, bool), c, clip)

    def fn(self, f, c, clip=None):
        """Paint where f(X, Y) is true (numpy arrays)."""
        X, Y = self._xy()
        return self._apply(f(X, Y), c, clip)

    def flood(self, x, y, c):
        c, src = self.col(c), self.a[y, x]
        if c == src:
            return self
        st = [(x, y)]
        while st:
            x, y = st.pop()
            if 0 <= x < self.w and 0 <= y < self.h and self.a[y, x] == src:
                self.a[y, x] = c
                st += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
        return self

    def replace(self, a, b):
        return self.paint(self.mask(a), b)

    # -- neighbourhood tools
    def _shift(self, m, dx, dy):
        o = np.zeros_like(m)
        if self.wrap:
            m = np.roll(m, dx, 1)
            dx = 0
        h, w = m.shape
        ys, yd = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
        xs, xd = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
        o[yd, xd] = m[ys, xs]
        return o

    def grow(self, m, diag=False, n=1):
        for _ in range(n):
            g = m.copy()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) + (((1, 1), (-1, 1), (1, -1), (-1, -1)) if diag else ()):
                g |= self._shift(m, dx, dy)
            m = g
        return m

    def outline(self, c, of=None, diag=False, onto=None):
        """Ink line around shapes. of: which colours count as shape (default all
        opaque). onto: only paint over these colours (default transparent)."""
        m = self.mask(of)
        ring = self.grow(m, diag) & ~m
        ring &= (self.a == T) if onto is None else self.mask(onto)
        return self.paint(ring, c)

    def inline(self, c, of=None):
        """Recolour the border pixels of a shape (inside edge)."""
        m = self.mask(of)
        inner = m & self._shift(m, 1, 0) & self._shift(m, -1, 0) & self._shift(m, 0, 1) & self._shift(m, 0, -1)
        return self.paint(m & ~inner, c)

    def edge(self, src, dst, dx, dy, depth=1, against=None):
        """Shade/highlight: recolour src pixels within `depth` of the region's
        boundary on the side (dx,dy). (0,1)=bottom edge, (0,-1)=top edge.
        against: only where the boundary neighbour is one of these colours."""
        m = self.mask(src)
        out = np.zeros_like(m)
        for k in range(1, depth + 1):
            nb = self._shift(m, -dx * k, -dy * k)  # nb[y,x] = m[y+dy*k, x+dx*k]
            hit = m & ~nb
            if against is not None:
                am = self._shift(self.mask(against), -dx * k, -dy * k)
                hit &= am
            out |= hit
        return self.paint(out, dst)

    # -- pattern tools
    def tone(self, target, c, level, kind='dot', p=4, ox=0, oy=0):
        """Halftone/dither colour c over pixels of `target`. level: 0..1 number,
        array, or f(X,Y). This is the comic-printing tool: Ben-Day dots etc."""
        X, Y = self._xy()
        r = pattern(kind, p)
        th = r[(Y + oy) % r.shape[0], (X + ox) % r.shape[1]]
        lv = level(X, Y) if callable(level) else level
        return self.paint(self.mask(target) & (th < lv), c)

    def gradient(self, target, ramp, t, kind='dot', p=4, ox=0, oy=0):
        """Dithered multi-colour gradient across `ramp` (list of colours).
        t: f(X,Y)->0..1 position along the ramp."""
        X, Y = self._xy()
        r = pattern(kind, p)
        th = r[(Y + oy) % r.shape[0], (X + ox) % r.shape[1]]
        cs = [self.col(c) for c in ramp]
        s = np.clip(t(X, Y), 0, 1) * (len(cs) - 1)
        i = np.minimum(s.astype(int), len(cs) - 2)
        pick = i + ((s - i) > th)
        out = np.array(cs)[pick]
        m = self.mask(target)
        self.a[m] = out[m]
        return self

    def hatch(self, target, c, spacing=3, slope=1, phase=0):
        X, Y = self._xy()
        return self.paint(self.mask(target) & ((X * slope + Y + phase) % spacing == 0), c)

    # -- grids & stamps
    def grid(self, text, x=0, y=0, pal=None):
        """Draw a text grid: one char per pixel, keys from the palette."""
        pal = pal or self.pal
        rows = [r for r in text.split('\n') if r.strip()]
        ind = min(len(r) - len(r.lstrip(' ')) for r in rows)
        for j, r in enumerate(rows):
            for i, ch in enumerate(r[ind:].rstrip()):
                if ch not in '. ':
                    self.px(x + i, y + j, pal[ch])
        return self

    def stamp(self, src, x=0, y=0, flipx=False, flipy=False, clip=None):
        a = src.a[:, ::-1] if flipx else src.a
        a = a[::-1] if flipy else a
        for j in range(src.h):
            for i in range(src.w):
                if a[j, i] != T:
                    xx, yy = x + i, y + j
                    if self.wrap:
                        xx %= self.w
                    if 0 <= xx < self.w and 0 <= yy < self.h:
                        if clip is None or self.a[yy, xx] in clip:
                            self.a[yy, xx] = a[j, i]
        return self

    def crop(self, x, y, w, h):
        c = Canvas(w, h, self.pal)
        c.a = self.a[y:y + h, x:x + w].copy()
        return c

    def scaled(self, k):
        c = Canvas(self.w * k, self.h * k, self.pal)
        c.a = np.repeat(np.repeat(self.a, k, 0), k, 1)
        return c

    def flipped(self):
        c = self.copy()
        c.a = c.a[:, ::-1].copy()
        return c

    def text(self, s, x, y, c, font, sp=1):
        c = self.col(c)
        for ch in s:
            g = None if ch == ' ' else font.get(ch, font.get('?'))
            if g is None:
                x += 3
                continue
            for j, r in enumerate(g):
                for i, v in enumerate(r):
                    if v != ' ' and v != '.':
                        self.px(x + i, y + j, c)
            x += max(len(r) for r in g) + sp
        return x

    def bbox(self):
        ys, xs = np.nonzero(self.a != T)
        return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1) if len(xs) else None

    def colors(self):
        return sorted(set(self.a[self.a != T].tolist()))


def from_grid(text, pal):
    rows = [r for r in text.split('\n') if r.strip()]
    ind = min(len(r) - len(r.lstrip(' ')) for r in rows)
    w = max(len(r[ind:].rstrip()) for r in rows)
    return Canvas(w, len(rows), pal).grid(text)


def text_width(s, font, sp=1):
    return sum((max(len(r) for r in font[ch]) + sp) if ch in font else 3 for ch in s) - sp


# ---------------------------------------------------------------- tiles
class TileError(Exception):
    pass


class TileBank:
    """A VRAM character block: deduplicated 8x8 4bpp tiles shared by layers."""

    def __init__(self, palettes, budget=512, name='bank'):
        self.pals, self.budget, self.name = palettes, budget, name
        self.tiles = [np.zeros((8, 8), np.uint8)]
        self.index = {self.tiles[0].tobytes(): (0, 0)}
        self.bad = []

    def _pal_for(self, cols, hint=None):
        order = ([hint] if hint is not None else []) + list(range(len(self.pals)))
        for p in order:
            if self.pals[p] is not None and cols <= set(self.pals[p].colors):
                return p
        return None

    def add(self, cv, name='layer', hint=None):
        """Slice a canvas into tiles. Returns screen-entry map (rows x cols)."""
        assert cv.w % 8 == 0 and cv.h % 8 == 0
        m = np.zeros((cv.h // 8, cv.w // 8), np.uint16)
        for ty in range(cv.h // 8):
            for tx in range(cv.w // 8):
                blk = cv.a[ty * 8:ty * 8 + 8, tx * 8:tx * 8 + 8]
                cols = set(blk[blk != T].tolist())
                if not cols:
                    continue
                p = self._pal_for(cols, hint)
                if p is None:
                    self.bad.append((name, tx, ty, len(cols)))
                    continue
                lut = {T: 0, **{c: i + 1 for i, c in reversed(list(enumerate(self.pals[p].colors)))}}
                t = np.vectorize(lut.get)(blk).astype(np.uint8)
                hit = None
                for f, v in ((0, t), (1, t[:, ::-1]), (2, t[::-1]), (3, t[::-1, ::-1])):
                    if v.tobytes() in self.index:
                        i, _ = self.index[v.tobytes()]
                        hit = (i, f)
                        break
                if hit is None:
                    self.index[t.tobytes()] = (len(self.tiles), 0)
                    hit = (len(self.tiles), 0)
                    self.tiles.append(t)
                m[ty, tx] = hit[0] | (hit[1] << 10) | (p << 12)
        return m

    def check(self):
        msgs = []
        if self.bad:
            msgs.append(f'{self.name}: {len(self.bad)} tiles mix palettes, e.g. {self.bad[:6]}')
        if len(self.tiles) > self.budget:
            msgs.append(f'{self.name}: {len(self.tiles)} tiles > budget {self.budget}')
        if msgs:
            raise TileError('; '.join(msgs))
        return f'{self.name}: {len(self.tiles)}/{self.budget} tiles'

    def words(self):
        return tiles_words(self.tiles)


def tiles_words(tiles):
    out = []
    for t in tiles:
        for row in t:
            v = 0
            for x in range(8):
                v |= int(row[x]) << (4 * x)
            out.append(v)
    return out


def sprite_tiles(cv, pal):
    """Sprite frame -> list of 8x8 index tiles in OBJ 1D order."""
    assert cv.w % 8 == 0 and cv.h % 8 == 0
    lut = {T: 0, **{c: i + 1 for i, c in reversed(list(enumerate(pal.colors)))}}
    bad = set(cv.colors()) - set(pal.colors)
    if bad:
        raise TileError(f'sprite uses {len(bad)} colours not in palette {pal.name}')
    idx = np.vectorize(lut.get)(cv.a).astype(np.uint8)
    return [idx[y:y + 8, x:x + 8] for y in range(0, cv.h, 8) for x in range(0, cv.w, 8)]


def write_c(path, name, arrays):
    """arrays: {symbol: (ctype, [ints])}. Writes path.c and path.h."""
    with open(path + '.c', 'w') as c, open(path + '.h', 'w') as h:
        h.write(f'// generated by pixelstudio\n#ifndef {name.upper()}_H\n#define {name.upper()}_H\n')
        c.write('// generated by pixelstudio\n')
        for sym, (ct, data) in arrays.items():
            data = [int(v) for v in data]
            h.write(f'#define {sym}_len {len(data)}\nextern const {ct} {sym}[{len(data)}];\n')
            c.write(f'const {ct} {sym}[{len(data)}] = {{\n')
            for i in range(0, len(data), 12):
                c.write(' ' + ','.join(f'0x{v:X}' for v in data[i:i + 12]) + ',\n')
            c.write('};\n')
        h.write('#endif\n')


# ---------------------------------------------------------------- lint
def lint_sprite(cv, pal, ink='k', name='sprite', allow_orphans=0):
    """Style-bible checks for a comic-inked sprite."""
    out = []
    cols = cv.colors()
    if len(cols) > 15:
        out.append(f'{name}: {len(cols)} colours')
    extra = set(cols) - set(pal.colors)
    if extra:
        out.append(f'{name}: {len(extra)} off-palette colours')
    m = cv.mask()
    k = cv.mask(ink)
    # every silhouette pixel must be ink (closed outline)
    edge = m & ~(cv._shift(m, 1, 0) & cv._shift(m, -1, 0) & cv._shift(m, 0, 1) & cv._shift(m, 0, -1))
    # pixels on the canvas border count as edge only if opaque
    gaps = edge & ~k
    if gaps.sum():
        ys, xs = np.nonzero(gaps)
        out.append(f'{name}: {gaps.sum()} outline gaps, e.g. {list(zip(xs[:5].tolist(), ys[:5].tolist()))}')
    orph = orphans(cv)
    if len(orph) > allow_orphans:
        out.append(f'{name}: {len(orph)} orphan pixels, e.g. {orph[:6]}')
    return out


def orphans(cv, ignore=()):
    """Opaque pixels with no 8-neighbour of the same colour (noise)."""
    ig = [cv.col(c) for c in ignore]
    res = []
    a = cv.a
    for y in range(cv.h):
        for x in range(cv.w):
            c = a[y, x]
            if c == T or c in ig:
                continue
            same = False
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if (dx or dy) and 0 <= y + dy < cv.h and 0 <= x + dx < cv.w and a[y + dy, x + dx] == c:
                        same = True
            if not same:
                res.append((x, y))
    return res


def lint_palette(pal, ramps=()):
    """ramps: lists of keys dark->light. Checks luminance order and step size."""
    out = []
    for r in ramps:
        ls = [luma(pal[k]) for k in r]
        for a, b, la, lb in zip(r, r[1:], ls, ls[1:]):
            if lb <= la:
                out.append(f'{pal.name}: ramp {r}: {b} not lighter than {a}')
            elif lb - la < 12:
                out.append(f'{pal.name}: ramp {r}: {a}->{b} too close ({lb - la:.0f})')
    if len(set(pal.colors)) != len(pal.colors):
        out.append(f'{pal.name}: duplicate colours after 15-bit snap')
    return out


# ---------------------------------------------------------------- preview
def to_image(cv, scale=1, bg='#404048', grid=0, checker=False):
    h, w = cv.a.shape
    rgb = np.zeros((h, w, 3), np.uint8)
    b = np.array(rgb24(rgb15(bg)), np.uint8)
    rgb[:] = b
    if checker:
        yy, xx = np.mgrid[0:h, 0:w]
        rgb[((xx // 4 + yy // 4) % 2) == 1] = (b * 0.8).astype(np.uint8)
    for c in set(cv.a.flatten().tolist()) - {T}:
        rgb[cv.a == c] = rgb24(c)
    im = Image.fromarray(rgb).resize((w * scale, h * scale), Image.NEAREST)
    if grid and scale >= 3:
        d = ImageDraw.Draw(im)
        for x in range(0, w + 1, grid):
            d.line([(x * scale, 0), (x * scale, h * scale)], fill=(255, 0, 255))
        for y in range(0, h + 1, grid):
            d.line([(0, y * scale), (w * scale, y * scale)], fill=(255, 0, 255))
    return im


def save(cv, path, scale=4, **kw):
    to_image(cv, scale, **kw).save(path)
    return path


def sheet(items, path, scale=4, cols=6, bg='#404048', pad=4, checker=True):
    """Contact sheet of canvases (e.g. animation frames)."""
    ims = [to_image(c, scale, bg, checker=checker) for c in items]
    w = max(i.width for i in ims) + pad
    h = max(i.height for i in ims) + pad
    rows = (len(ims) + cols - 1) // cols
    out = Image.new('RGB', (min(cols, len(ims)) * w + pad, rows * h + pad), (24, 24, 28))
    for n, i in enumerate(ims):
        out.paste(i, (pad + (n % cols) * w, pad + (n // cols) * h))
    out.save(path)
    return path


def onion(frames, path, scale=6):
    """Onion skin: each frame over a ghost of the previous one."""
    outs = []
    for i, f in enumerate(frames):
        im = to_image(f, scale, '#303038').convert('RGBA')
        prev = to_image(frames[i - 1], scale, '#303038').convert('RGBA')
        outs.append(Image.blend(prev, im, 0.65).convert('RGB'))
    w = outs[0].width
    out = Image.new('RGB', (w * len(outs), outs[0].height))
    for i, o in enumerate(outs):
        out.paste(o, (i * w, 0))
    out.save(path)
    return path


def gif(frames, path, ms=100, scale=4, bg='#404048'):
    ims = [f if isinstance(f, Image.Image) else to_image(f, scale, bg) for f in frames]
    ims[0].save(path, save_all=True, append_images=ims[1:], duration=ms, loop=0)
    return path


def compose(w, h, layers, backdrop='#000000'):
    """layers: [(canvas, scroll_x, scroll_y)] back to front -> Canvas (what the
    screen would show). Wrapping canvases repeat."""
    out = Canvas(w, h)
    out.a[:] = rgb15(backdrop)
    for cv, sx, sy in layers:
        ys = (np.arange(h) + sy)
        xs = (np.arange(w) + sx)
        if cv.wrap:
            xs %= cv.w
        ok_y = (ys >= 0) & (ys < cv.h)
        ok_x = (xs >= 0) & (xs < cv.w)
        sub = cv.a[np.clip(ys, 0, cv.h - 1)][:, np.clip(xs, 0, cv.w - 1)]
        m = (sub != T) & ok_y[:, None] & ok_x[None, :]
        out.a[m] = sub[m]
    return out


def swatches(pals, path, cell=22):
    im = Image.new('RGB', (16 * cell + 90, len(pals) * (cell + 4) + 4), (24, 24, 28))
    d = ImageDraw.Draw(im)
    for j, p in enumerate(pals):
        y = 4 + j * (cell + 4)
        d.text((4, y + 4), p.name, fill=(230, 230, 230))
        for i, c in enumerate(p.colors):
            x = 90 + i * cell
            d.rectangle([x, y, x + cell - 2, y + cell - 2], fill=rgb24(c))
            d.text((x + 6, y + 5), p.names[i][0], fill=(0, 0, 0) if luma(c) > 110 else (255, 255, 255))
    im.save(path)
    return path


# ---------------------------------------------------------------- rig tools
def aim(deg):
    """Unit vector for an aim angle on screen: 0 = right, 90 = up."""
    a = math.radians(deg)
    return math.cos(a), -math.sin(a)


class Frame:
    """A local coordinate frame (origin + aim angle) for posing rigid parts
    such as a rifle. Local x runs along the aim, local y is 'below' it."""

    def __init__(self, ox, oy, deg):
        self.o, self.d = (ox, oy), aim(deg)

    def pt(self, lx, ly=0.0):
        dx, dy = self.d
        return self.o[0] + lx * dx - ly * dy, self.o[1] + lx * dy + ly * dx

    def rect(self, cv, x0, y0, x1, y1, c):
        cv.poly([self.pt(x0, y0), self.pt(x1, y0), self.pt(x1, y1), self.pt(x0, y1)], c)

    def circle(self, cv, x, y, r, c):
        cv.circle(*self.pt(x, y), r, c)


def ik2(ax, ay, bx, by, l1, l2, bend=1):
    """Two-bone IK: joint position between a and b. bend=+1/-1 picks the side."""
    dx, dy = bx - ax, by - ay
    d = max(1e-6, min(math.hypot(dx, dy), l1 + l2 - 1e-3))
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, l1 * l1 - a * a))
    ux, uy = dx / math.hypot(dx, dy), dy / math.hypot(dx, dy)
    return ax + a * ux - bend * h * uy, ay + a * uy + bend * h * ux


def rot90(cv, k=1):
    """Lossless quarter-turn rotation (k counter-clockwise turns)."""
    a = np.rot90(cv.a, k)
    c = Canvas(a.shape[1], a.shape[0], cv.pal)
    c.a = a.copy()
    return c


def flash_palette(pal, ink='k', white='#f8f8f0'):
    """Hit-flash palette: every colour white except the ink."""
    return [0] + [c if c == pal[ink] else rgb15(white) for c in pal.colors] + [0] * (15 - len(pal.colors))
