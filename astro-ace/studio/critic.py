"""critic: the art director's eye, as numbers.

Measures a drawn frame against the house bar: the craft level of a 16-bit
arcade run-and-gun sprite. A frame that fails here looks cheap next to that
bar no matter what it depicts, so faults block export.

What it measures
  tones     how many steps of each colour ramp are used (form needs light, base, shadow)
  detail    share of pixels that sit on a colour boundary (busy = drawn, low = blobby)
  flat      the largest single-colour cluster as a share of the sprite
  outline   silhouette pixels that are not ink or the frame's darkest tones
  orphans   lone pixels with no same-colour neighbour (noise, unless it is a glint)
  blocks    2x2 squares of pure ink inside the line work (a line that got fat)
"""
import numpy as np
from pixelstudio import T, luma

BAR = dict(min_colors=9, min_detail=0.45, max_flat=0.14, min_tones=3, max_orphans=6, max_blocks=4,
           small_area=160)


def _clusters(a):
    """Connected same-colour regions (4-neighbour): list of (colour, [(x,y)...])."""
    h, w = a.shape
    seen = np.zeros((h, w), bool)
    out = []
    for y in range(h):
        for x in range(w):
            if seen[y, x] or a[y, x] == T:
                continue
            c, st, pts = a[y, x], [(x, y)], []
            seen[y, x] = True
            while st:
                px, py = st.pop()
                pts.append((px, py))
                for nx, ny in ((px + 1, py), (px - 1, py), (px, py + 1), (px, py - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny, nx] and a[ny, nx] == c:
                        seen[ny, nx] = True
                        st.append((nx, ny))
            out.append((int(c), pts))
    return out


def review(cv, pal, name='frame', ramps=None, ink='k', glints=('w', 'c', 'y', 'e', 'k'), open_edges=(), seam_rows=()):
    a = cv.a
    h, w = a.shape
    op = a != T
    area = int(op.sum())
    rep = dict(name=name, area=area, faults=[], notes=[])
    if not area:
        rep['faults'].append('empty frame')
        return rep
    ys, xs = np.nonzero(op)
    rep['bbox'] = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    cols = sorted(set(a[op].tolist()))
    rep['colors'] = len(cols)
    key = {c: k for (k, _), c in zip(pal.names, pal.colors)}
    small = area < BAR['small_area']

    # detail: colour boundaries between opaque neighbours
    e = np.zeros((h, w), bool)
    e[:, :-1] |= op[:, :-1] & op[:, 1:] & (a[:, :-1] != a[:, 1:])
    e[:-1, :] |= op[:-1, :] & op[1:, :] & (a[:-1, :] != a[1:, :])
    rep['detail'] = round(float(e.sum()) / area, 2)

    # flat: biggest cluster
    cl = _clusters(a)
    big = max(cl, key=lambda c: len(c[1]))
    rep['flat'] = round(len(big[1]) / area, 2)
    rep['flat_at'] = (key.get(big[0], '?'), big[1][0])

    # tones per ramp
    import style
    ramps = ramps if ramps is not None else style.RAMPS.get(pal, [])
    tones = {}
    for r in ramps:
        used = [k for k in r if pal[k] in cols]
        px = int(np.isin(a, [pal[k] for k in r]).sum())
        if px >= 30:
            tones[''.join(r)] = (len(used), px)
    rep['tones'] = tones

    # outline: silhouette pixels must be ink (or the two darkest colours used)
    dark = sorted(pal.colors, key=luma)[:3]
    pad = np.pad(op, 1)
    inner = pad[1:-1, 2:] & pad[1:-1, :-2] & pad[2:, 1:-1] & pad[:-2, 1:-1]
    gaps = op & ~inner & ~np.isin(a, dark)
    x0, y0, x1, y1 = rep['bbox']
    for y in seam_rows:
        if 0 <= y < h: gaps[y, :] = False
    if 'top' in open_edges: gaps[y0, :] = False
    if 'bottom' in open_edges: gaps[y1 - 1, :] = False
    if 'left' in open_edges: gaps[:, x0] = False
    if 'right' in open_edges: gaps[:, x1 - 1] = False
    rep['outline_gaps'] = [(int(x), int(y)) for y, x in zip(*np.nonzero(gaps))]

    # orphans
    orph = []
    gl = [pal[g] for g in glints if g in pal.key]
    for c, pts in cl:
        if len(pts) == 1 and c not in gl:
            x, y = pts[0]
            n = a[max(0, y - 1):y + 2, max(0, x - 1):x + 2]
            if (n == c).sum() == 1:
                orph.append((x, y))
    rep['orphans'] = orph

    # ink blocks
    k = a == pal[ink]
    blk = k[:-1, :-1] & k[1:, :-1] & k[:-1, 1:] & k[1:, 1:]
    rep['blocks'] = [(int(x), int(y)) for y, x in zip(*np.nonzero(blk))]

    f = rep['faults']
    if not small:
        if rep['colors'] < BAR['min_colors']:
            f.append(f"thin palette: {rep['colors']} colours, bar is {BAR['min_colors']}+")
        if rep['detail'] < BAR['min_detail']:
            f.append(f"low detail: {rep['detail']} of pixels on a colour boundary, bar is {BAR['min_detail']}+")
        if rep['flat'] > BAR['max_flat']:
            f.append(f"flat area: one '{rep['flat_at'][0]}' cluster is {int(rep['flat'] * 100)}% of the sprite "
                     f"(near {rep['flat_at'][1]}), bar is {int(BAR['max_flat'] * 100)}%")
        for r, (n, px) in tones.items():
            if n < min(BAR['min_tones'], len(r)) and px >= 60:
                f.append(f"ramp {r}: only {n} tone(s) over {px}px, form needs {min(BAR['min_tones'], len(r))}")
    if rep['outline_gaps']:
        f.append(f"outline: {len(rep['outline_gaps'])} silhouette pixels are not ink/dark, e.g. {rep['outline_gaps'][:6]}")
    if len(orph) > max(BAR['max_orphans'], area // 20):
        f.append(f"noise: {len(orph)} orphan pixels, e.g. {orph[:6]}")
    if len(rep['blocks']) > BAR['max_blocks'] and not small:
        rep['notes'].append(f"{len(rep['blocks'])} 2x2 ink blocks (fat line work?), e.g. {rep['blocks'][:4]}")
    return rep


def format_report(r):
    if 'bbox' not in r:
        return f"{r['name']}: EMPTY"
    x0, y0, x1, y1 = r['bbox']
    t = ' '.join(f"{k}:{n}" for k, (n, _) in r['tones'].items())
    head = (f"{r['name']:<14} {x1 - x0}x{y1 - y0} {r['area']}px  colours {r['colors']}  detail {r['detail']}  "
            f"flat {r['flat']}  tones[{t}]")
    lines = [head + ('  OK' if not r['faults'] else '')]
    lines += [f"    FAULT {x}" for x in r['faults']] + [f"    note  {x}" for x in r['notes']]
    return '\n'.join(lines)


def volume_drift(canvases):
    """Animation check: opaque area of each frame relative to the mean. Hand-drawn
    cycles keep volume; a frame far off the mean pops when played."""
    ar = [int((c.a != T).sum()) for c in canvases]
    m = sum(ar) / len(ar)
    return [round(a / m - 1, 2) for a in ar]
