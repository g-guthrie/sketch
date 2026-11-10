"""bar: the production scorecard.

Counts what is actually drawn on the sheets and sets it against the house bar
for a 16-bit arcade run-and-gun. The bar figures are targets set from
knowledge of that era's games (frame counts, part counts, palette depth); they
are not measured from any ROM.

    python3 studio/bar.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'art'))
import numpy as np
import style, contracts, guardian, critic
from px import Sheet
from pixelstudio import T


def load(name):
    p = os.path.join(contracts.SHEETS, name + '.px')
    try:
        return Sheet(p) if os.path.exists(p) else None
    except SyntaxError:
        return None


def drawn(name, frames=None):
    """Distinct drawn frames of a sheet (identical copies count once)."""
    s = load(name)
    if not s:
        return []
    seen, out = set(), []
    for f in s.frames:
        if frames and f.name not in frames:
            continue
        key = '\n'.join(f.rows)
        if key.strip('.\n') and key not in seen:
            seen.add(key)
            out.append(f)
    return out


def canv(name, f):
    s = load(name)
    return s.canvas(f, style.PALETTES[s.palette])


def stats(name, frames=None):
    fs = drawn(name, frames)
    if not fs:
        return None
    cs = [canv(name, f) for f in fs]
    s = load(name)
    pal = style.PALETTES[s.palette]
    reps = [critic.review(c, pal, f.name, open_edges=s.open) for c, f in zip(cs, fs)]
    cols = set()
    for c in cs:
        cols |= set(c.colors())
    return dict(n=len(fs), colors=len(cols), detail=round(float(np.mean([r['detail'] for r in reps])), 2),
                faults=sum(len(r['faults']) for r in reps), h=max(r['bbox'][3] - r['bbox'][1] for r in reps),
                w=max(r['bbox'][2] - r['bbox'][0] for r in reps))


def rows():
    R = lambda p, n: [f'{p}{i}' for i in range(n)]
    out = []
    def add(what, bar, ours, ok):
        out.append((what, bar, ours, ok))
    top, legs, air = stats('ace_top'), stats('ace_legs'), stats('ace_air')
    if top and legs:
        hh = top['h'] + legs['h']
        add('hero: standing height', '40+ px', f'{hh} px', hh >= 40)
        add('hero: colours on the sprite', '12+', str(max(top['colors'], legs['colors'])), max(top['colors'], legs['colors']) >= 12)
        run = stats('ace_legs', R('run', 8))
        add('hero: run cycle, drawn frames', '6+', str(run['n'] if run else 0), bool(run) and run['n'] >= 6)
        aims = stats('ace_top', ['fwd', 'upfwd', 'up', 'dnfwd'])
        fire = stats('ace_top', ['fwd_fire', 'upfwd_fire', 'up_fire', 'dnfwd_fire'])
        add('hero: aim directions drawn', '4+', f"{aims['n']} (+{fire['n'] if fire else 0} recoil)", aims['n'] >= 4)
        tk = stats('ace_air', R('tuck', 4))
        add('hero: somersault, drawn frames', '4+', f"{tk['n'] if tk else 0} (8 with mirroring)", bool(tk) and tk['n'] >= 4)
        tot = top['n'] + legs['n'] + (air['n'] if air else 0)
        add('hero: total drawn frames', '20+', str(tot), tot >= 20)
    parts = [p[0] for p in guardian.TANK]
    done = [p for p in guardian.TANK if drawn(p[1])]
    add('boss: separately drawn parts', '8+', str(len(done)), len(done) >= 8)
    dest = [n for n, d in guardian.PARTS.items() if d.get('hp')]
    weak = [n for n, d in guardian.PARTS.items() if d.get('weak')]
    add('boss: destructible parts', '3+', f'{len(dest)} + {len(weak)} weak points', len(dest) >= 3)
    bf = sum(len(drawn(sh)) for sh in sorted({p[1] for p in guardian.TANK + guardian.POD} | {'g_scar', 'g_link', 'g_claw'}))
    add('boss: drawn frames over all parts and states', '20+', str(bf), bf >= 20)
    lay = guardian.layout(guardian.TANK)
    if lay:
        x0 = min(x for _, s, f, x, y in lay); x1 = max(x + f.w for _, s, f, x, y in lay)
        y0 = min(y for _, s, f, x, y in lay); y1 = max(y + f.h for _, s, f, x, y in lay)
        add('boss: assembled size', '96+ px wide', f'{x1 - x0}x{y1 - y0} px', x1 - x0 >= 96)
    tr = stats('trooper', R('run', 6))
    add('trooper: run cycle, drawn frames', '4+', str(tr['n'] if tr else 0), bool(tr) and tr['n'] >= 4)
    bm = stats('boom')
    add('explosion: drawn frames', '4+', str(bm['n'] if bm else 0), bool(bm) and bm['n'] >= 4)
    allf = flt = 0
    for n in contracts.CONTRACTS:
        st = stats(n)
        if st:
            allf += st['n']; flt += st['faults']
    add('all sheets: drawn frames', '', str(allf), True)
    add('all sheets: open critic faults', '0', str(flt), flt == 0)
    return out


if __name__ == '__main__':
    rs = rows()
    w = max(len(r[0]) for r in rs)
    print(f"{'measure':<{w}}  {'bar':<12} {'ours':<22}")
    for what, bar, ours, ok in rs:
        print(f"{what:<{w}}  {bar:<12} {ours:<22} {'' if ok else '<-- below the bar'}")
