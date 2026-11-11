"""palettes: fit painted art to GBA sprite palettes.

A GBA sprite (OBJ) shows 15 colours from one of 16 palettes, but every OBJ
picks its own palette. So a big painting can keep far more than 15 colours:
cut it into OBJs and give each the palette that holds its colours.

  merge_colours   reduce a set of images to n colours by merging the nearest pairs
  fit             split blocks until each holds <= 15 colours, then pack their
                  colour sets into as few palettes as possible
"""
import numpy as np


def colours_of(blocks):
    """blocks: list of (h, w, 4) uint8 RGBA arrays -> {rgb: count} over opaque pixels."""
    out = {}
    for b in blocks:
        op = b[..., 3] > 127
        cols, cnt = np.unique(b[op][:, :3].reshape(-1, 3), axis=0, return_counts=True)
        for c, n in zip(cols, cnt):
            t = tuple(int(v) for v in c)
            out[t] = out.get(t, 0) + int(n)
    return out


def _dist(a, b):
    dr, dg, db = a[0] - b[0], a[1] - b[1], a[2] - b[2]
    rm = (a[0] + b[0]) / 2
    return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db      # "redmean" distance


def merge_colours(counts, n):
    """-> {old rgb: new rgb} leaving at most n distinct colours. The rarer colour
    of the closest pair is folded into the commoner one, so the main tones of the
    art never drift."""
    cols = dict(counts)
    remap = {c: c for c in cols}
    while len(cols) > n:
        ks = list(cols)
        best = None
        for i in range(len(ks)):
            for j in range(i + 1, len(ks)):
                d = _dist(ks[i], ks[j]) * min(cols[ks[i]], cols[ks[j]]) ** 0.35
                if best is None or d < best[0]:
                    best = (d, ks[i], ks[j])
        _, a, b = best
        keep, drop = (a, b) if cols[a] >= cols[b] else (b, a)
        cols[keep] += cols.pop(drop)
        for k, v in remap.items():
            if v == drop:
                remap[k] = keep
    return remap


def apply_map(img, remap):
    out = img.copy()
    op = img[..., 3] > 127
    flat = out[op]
    for i in range(len(flat)):
        flat[i, :3] = remap[tuple(int(v) for v in flat[i, :3])]
    out[op] = flat
    out[~op] = 0
    out[op, 3] = 255
    return out


def fit(sets, max_palettes, size=15):
    """sets: list of colour sets (one per OBJ). -> (palettes [list of rgb], index of
    the palette for each set). Raises if they cannot be packed."""
    order = sorted(range(len(sets)), key=lambda i: -len(sets[i]))
    pals, where = [], [None] * len(sets)
    for i in order:
        s = sets[i]
        if len(s) > size:
            raise ValueError(f'a block has {len(s)} colours')
        best = None
        for p, ps in enumerate(pals):
            u = len(ps | s)
            if u <= size and (best is None or u - len(ps) < best[0]):
                best = (u - len(ps), p)
        if best is None:
            pals.append(set(s))
            where[i] = len(pals) - 1
        else:
            pals[best[1]] |= s
            where[i] = best[1]
    if len(pals) > max_palettes:
        raise ValueError(f'{len(pals)} palettes needed, {max_palettes} allowed')
    lum = lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
    return [sorted(p, key=lum) for p in pals], where


def _err(cs, pal):
    return sum(n * min(_dist(c, p) for p in pal) for c, n in cs.items())


def fit_lossy(block_colours, k, size=15, rounds=5):
    """block_colours: list of {rgb: count}, one per OBJ. Builds k palettes of
    `size` colours and gives each block the palette that reproduces it best.
    -> (palettes, palette index per block). Palettes are grown one at a time
    from the blocks the existing ones serve worst, then refined."""
    def build(idx):
        tot = {}
        for i in idx:
            for c, n in block_colours[i].items():
                tot[c] = tot.get(c, 0) + n
        return sorted(set(merge_colours(tot, size).values()))
    n = len(block_colours)
    pals = [build(range(n))]
    where = [0] * n
    while len(pals) < k:
        errs = [_err(block_colours[i], pals[where[i]]) for i in range(n)]
        if max(errs) == 0:
            break
        worst = sorted(range(n), key=lambda i: -errs[i])[:max(1, n // (len(pals) + 3))]
        pals.append(build(worst))
        where = [min(range(len(pals)), key=lambda p: _err(block_colours[i], pals[p])) for i in range(n)]
    for _ in range(rounds):
        pals = [build([i for i in range(n) if where[i] == p]) or pals[p] for p in range(len(pals))]
        where = [min(range(len(pals)), key=lambda p: _err(block_colours[i], pals[p])) for i in range(n)]
    lum = lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
    return [sorted(p, key=lum) for p in pals], where


def nearest(c, pal):
    return min(range(len(pal)), key=lambda i: _dist(c, pal[i]))
