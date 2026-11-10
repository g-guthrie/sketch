"""lightbox: the light table. One self-contained HTML page with every drawn
frame, the animations playing at game speed, the assembled boss in its states,
and the scorecard. For reviewing the art the way it will be seen.

    python3 studio/lightbox.py        -> out/lightbox.html
"""
import os, sys, io, base64
sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'art'))
import numpy as np
from PIL import Image
import style, contracts, guardian, critic, bar
from px import Sheet
from pixelstudio import T, Canvas, rgb24

ROOT = os.path.join(os.path.dirname(__file__), '..')


def rgba(cv):
    h, w = cv.a.shape
    o = np.zeros((h, w, 4), np.uint8)
    for c in set(cv.a.flatten().tolist()) - {T}:
        o[cv.a == c] = (*rgb24(c), 255)
    return Image.fromarray(o)


def uri(im, fmt='PNG', **kw):
    b = io.BytesIO()
    im.save(b, fmt, **kw)
    return f"data:image/{fmt.lower()};base64," + base64.b64encode(b.getvalue()).decode()


def img(cv, scale=3, title=''):
    im = rgba(cv)
    return f'<img src="{uri(im)}" width="{im.width * scale}" height="{im.height * scale}" title="{title}">'


def gif(cvs, ms, scale=3, bg=(88, 48, 136)):
    w, h = max(c.w for c in cvs), max(c.h for c in cvs)
    ims = []
    for c in cvs:
        base = Image.new('RGBA', (w, h), (*bg, 255))
        base.alpha_composite(rgba(c))
        ims.append(base.convert('P', palette=Image.ADAPTIVE, colors=64).resize((w * scale, h * scale), Image.NEAREST))
    b = io.BytesIO()
    ims[0].save(b, 'GIF', save_all=True, append_images=ims[1:], duration=ms, loop=0)
    return f'<img src="data:image/gif;base64,{base64.b64encode(b.getvalue()).decode()}" width="{w * scale}" height="{h * scale}">'


def load(name):
    p = os.path.join(contracts.SHEETS, name + '.px')
    try:
        return Sheet(p) if os.path.exists(p) else None
    except SyntaxError:
        return None


def frames_of(name, names):
    s = load(name)
    if not s:
        return []
    pal = style.PALETTES[s.palette]
    return [s.canvas(n, pal) for n in names if n in s]


def flipped(cv, hflip, vflip):
    c = cv.copy()
    if hflip: c.a = c.a[:, ::-1].copy()
    if vflip: c.a = c.a[::-1].copy()
    return c


def ace(top, legs):
    import anims
    try:
        return anims.ace(top, legs, w=56, h=72, ox=16, oy=66)
    except Exception:
        return None


def build():
    R = lambda p, n: [f'{p}{i}' for i in range(n)]
    H = ['<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
         '<title>Astro Ace light table</title>',
         '<style>:root{--bg:#17131f;--fg:#ece6d8;--mut:#9a92a8;--card:#231d30;--line:#3a3150;--ok:#7ad6a0;--bad:#f08a6a}'
         '@media (prefers-color-scheme: light){:root{--bg:#f6f0df;--fg:#1c1626;--mut:#6a6278;--card:#fffaf0;--line:#d8cfb8;--ok:#1f8a52;--bad:#b8401c}}'
         'body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;margin:0;padding:16px;max-width:1100px;margin:auto}'
         'h1{font-size:22px;margin:8px 0}h2{font-size:17px;margin:28px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}'
         'h3{font-size:13px;margin:0 0 6px;color:var(--mut);font-weight:600}'
         '.row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px}'
         'img{image-rendering:pixelated;display:block;max-width:100%;height:auto}.stage{background:#583088;border-radius:4px;padding:6px;display:inline-flex;flex-wrap:wrap;gap:6px;align-items:flex-end}'
         'table{border-collapse:collapse;width:100%}td,th{padding:4px 10px;border-bottom:1px solid var(--line);text-align:left;font-variant-numeric:tabular-nums}'
         '.ok{color:var(--ok)}.bad{color:var(--bad)}p{color:var(--mut);margin:4px 0 10px}small{color:var(--mut)}</style>',
         '<h1>Astro Ace: light table</h1><p>Every frame here was typed pixel by pixel into a sheet in <code>art/sheets/</code>. '
         'Animations play at game speed.</p>']

    # ---- animations
    H.append('<h2>In motion</h2><div class="row">')
    def card(title, html):
        if html:
            H.append(f'<div class="card"><h3>{title}</h3>{html}</div>')
    legs = load('ace_legs'); top = load('ace_top')
    if legs and top:
        run = [ace('fwd', n) for n in R('run', 8) if n in legs]
        if len(run) >= 2: card(f'Ace: run ({len(run)} drawn frames)', gif(run, 50))
        aims = [ace(t, 'idle') for t in ['fwd', 'upfwd', 'up', 'upfwd', 'fwd', 'dnfwd'] if t in top]
        if len(aims) >= 2: card('Ace: aiming', gif(aims, 350))
        if 'fwd_fire' in top: card('Ace: firing', gif([ace('fwd', 'idle'), ace('fwd_fire', 'idle')], 80))
        if 'crouch' in legs: card('Ace: crouch', gif([ace('fwd', 'idle'), ace('fwd', 'crouch')], 500))
    tk = frames_of('ace_air', R('tuck', 4))
    if len(tk) == 4:
        card('Ace: somersault (4 drawn, 8 shown)', gif(tk + [flipped(c, True, True) for c in tk], 66, 4))
    tr = frames_of('trooper', R('run', 6))
    if len(tr) >= 2: card(f'Trooper: run ({len(tr)} frames)', gif(tr, 83, 4))
    bm = frames_of('boom', R('boom', 5))
    if len(bm) >= 2: card(f'Explosion ({len(bm)} frames)', gif(bm, 83, 4))
    rl = frames_of('g_treads', R('roll', 3))
    if len(rl) >= 2: card('Guardian: tracks rolling', gif(rl, 100, 2))
    ey = frames_of('g_eye', ['shut', 'half', 'open', 'open', 'open', 'half'])
    if len(ey) >= 3: card('Guardian: eye', gif(ey, 200, 5))
    ds = frames_of('g_dish', R('spin', 4))
    if len(ds) >= 2: card('Guardian: radar dish', gif(ds, 133, 5))
    H.append('</div>')

    # ---- boss assembly
    H.append('<h2>The Foundry Guardian, assembled</h2><p>One boss, pinned together from separately drawn parts '
             '(<code>art/guardian.py</code>). Each state below is the same parts in different frames.</p><div class="row">')
    for name, parts, fr in guardian.STATES:
        lay = guardian.layout(parts, fr)
        if not lay:
            continue
        cv = guardian.render(parts, fr, w=168, h=140, ox=84, oy=136 if parts is guardian.TANK else 60)
        bb = cv.bbox()
        cv = cv.crop(bb[0] - 2, bb[1] - 2, bb[2] - bb[0] + 4, bb[3] - bb[1] + 4)
        card(f'{name} ({len(lay)} parts)', f'<div class="stage">{img(cv, 3)}</div>')
    H.append('</div>')

    # ---- scorecard
    H.append('<h2>Scorecard</h2><table><tr><th>Measure</th><th>House bar</th><th>Drawn</th></tr>')
    for what, b, ours, ok in bar.rows():
        H.append(f'<tr><td>{what}</td><td>{b}</td><td class="{"ok" if ok else "bad"}">{ours}</td></tr>')
    H.append('</table><p>The bar figures are targets set from knowledge of 16-bit run-and-guns, not measured from any ROM.</p>')

    # ---- every sheet
    H.append('<h2>Every sheet</h2>')
    for name, c in contracts.CONTRACTS.items():
        s = load(name)
        if not s:
            H.append(f'<div class="card" style="margin-bottom:10px"><h3>{name}: not started</h3></div>')
            continue
        pal = style.PALETTES[s.palette]
        scale = 2 if s.cell[0] > 64 else 3 if s.cell[0] > 24 else 4
        cells, faults = [], 0
        for f in s.frames:
            cv = s.canvas(f, pal)
            rep = critic.review(cv, pal, f.name, open_edges=s.open,
                                seam_rows=([s.anchor_of(f)[1]] if 'bottom' in s.open else []) +
                                ([f.points['waist'][1] + 1] if 'top' in s.open and 'waist' in f.points else []))
            faults += len(rep['faults'])
            cells.append(f'<div>{img(cv, scale, f.name)}<small>{f.name}</small></div>')
        st = f'<span class="ok">critic clean</span>' if not faults else f'<span class="bad">{faults} critic faults</span>'
        miss = contracts.check(name)
        H.append(f'<div class="card" style="margin-bottom:10px"><h3>{name} &middot; palette {s.palette} &middot; '
                 f'{len(s.frames)} frames &middot; {st}{" &middot; " + str(len(miss)) + " contract gaps" if miss else ""}</h3>'
                 f'<div class="stage">{"".join(cells)}</div></div>')
    out = os.path.join(ROOT, 'out', 'lightbox.html')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w').write('\n'.join(H))
    return out


if __name__ == '__main__':
    print(build())
