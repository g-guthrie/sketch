"""cutter: from a drawn frame to hardware sprites.

A frame of any size is covered with the rectangles the GBA can display
(8x8 .. 64x64), each becoming one OBJ. The list of OBJs with their offsets from
the frame's anchor is the "metasprite": the same way the arcade and console
teams pinned a character together out of hardware sprites.

A Bank is a run of OBJ VRAM. Identical OBJ images are stored once.
"""
import numpy as np
from pixelstudio import T, TileError

# (w, h): GBA OBJ shape/size bits, in the order of the engine's kind table
SHAPES = [(8, 8), (16, 16), (32, 32), (64, 64), (16, 8), (32, 8), (32, 16), (64, 32), (8, 16), (8, 32), (16, 32), (32, 64)]
KIND = {s: i for i, s in enumerate(SHAPES)}
ATTR0 = [0, 0, 0, 0, 0x4000, 0x4000, 0x4000, 0x4000, 0x8000, 0x8000, 0x8000, 0x8000]
ATTR1 = [0, 0x4000, 0x8000, 0xC000, 0, 0x4000, 0x8000, 0xC000, 0, 0x4000, 0x8000, 0xC000]


def cut(mask, waste=0.42, grid=None, single=None):
    """Cover the opaque pixels of mask (bool h x w). -> [(x, y, w, h)].
    waste: how much empty area a bigger rectangle may carry before smaller
    ones are preferred. grid=(w,h): fixed tiling (lets identical blocks of an
    animation be stored once). single=(w,h): one OBJ holding the whole frame."""
    h, w = mask.shape
    if not mask.any():
        return []
    ys, xs = np.nonzero(mask)
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    if single:
        sw, sh = single
        assert bx1 - bx0 <= sw and by1 - by0 <= sh, f'frame content {bx1 - bx0}x{by1 - by0} does not fit one {sw}x{sh} sprite'
        return [(0, 0, sw, sh)] if (w <= sw and h <= sh) else [(min(bx0, w - sw) if w >= sw else 0, min(by0, h - sh) if h >= sh else 0, sw, sh)]
    if grid:
        gw, gh = grid
        return [(x, y, gw, gh) for y in range(by0, by1, gh) for x in range(bx0, bx1, gw)
                if mask[y:y + gh, x:x + gw].any()]
    left = mask.copy()
    out = []
    while left.any():
        y0 = int(np.nonzero(left.any(1))[0][0])
        best = None
        for sw, sh in SHAPES:
            band = left[y0:y0 + sh]
            x0 = int(np.nonzero(band.any(0))[0][0])
            x0 = max(min(x0, bx1 - sw), min(x0, bx0)) if bx1 - bx0 >= sw else x0
            yy = min(y0, max(by0, by1 - sh))
            cov = int(left[max(0, yy):yy + sh, max(0, x0):x0 + sw].sum())
            score = cov - waste * sw * sh
            if best is None or score > best[0]:
                best = (score, x0, yy, sw, sh)
        _, x0, yy, sw, sh = best
        out.append((x0, yy, sw, sh))
        left[max(0, yy):yy + sh, max(0, x0):x0 + sw] = False
    return out


def block(idx, x, y, w, h):
    """Palette-index pixels of a rectangle, padded with transparent outside the frame."""
    H, W = idx.shape
    b = np.zeros((h, w), np.uint8)
    xs0, ys0, xs1, ys1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if xs1 > xs0 and ys1 > ys0:
        b[ys0 - y:ys1 - y, xs0 - x:xs1 - x] = idx[ys0:ys1, xs0:xs1]
    return b


def indexed(cv, pal):
    lut = {T: 0, **{c: i + 1 for i, c in reversed(list(enumerate(pal.colors)))}}
    bad = set(cv.colors()) - set(pal.colors)
    if bad:
        raise TileError(f'frame uses {len(bad)} colours not in palette {pal.name}')
    return np.vectorize(lut.get)(cv.a).astype(np.uint8)


class Bank:
    """A run of OBJ tiles. add() returns the first tile of the OBJ image."""

    def __init__(self, name, budget):
        self.name, self.budget, self.tiles, self.seen = name, budget, [], {}

    def add(self, b):
        key = (b.shape, b.tobytes())
        if key not in self.seen:
            self.seen[key] = len(self.tiles)
            h, w = b.shape
            self.tiles += [b[y:y + 8, x:x + 8] for y in range(0, h, 8) for x in range(0, w, 8)]
        return self.seen[key]

    def check(self):
        if len(self.tiles) > self.budget:
            raise TileError(f'{self.name}: {len(self.tiles)} tiles > budget {self.budget}')
        return f'{self.name}: {len(self.tiles)}/{self.budget} tiles'


def metasprite(cv, pal, anchor, bank, **kw):
    """-> [(dx, dy, kind, tile)] with offsets from the anchor pixel, tiles in bank."""
    idx = indexed(cv, pal)
    out = []
    for x, y, w, h in cut(idx != 0, **kw):
        out.append((x - anchor[0], y - anchor[1], KIND[(w, h)], bank.add(block(idx, x, y, w, h))))
    return out
