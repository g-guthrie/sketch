"""Cover and end-of-issue cards: full-screen comic pages built from the same layers."""
from style import *
import math
import anims, guardian

def blank(pal, wrap=False):
    return Canvas(256 if wrap else 512, 160, pal, wrap=wrap)

def big_text(c, s, x, y, k, fill, shadow=None):
    w = text_width(s, FONT)
    t = Canvas(w + 2, 9, c.pal)
    t.text(s, 1, 1, fill, FONT)
    t = t.scaled(k)
    if shadow:
        sh = t.copy(); sh.a[sh.a != T] = c.col(shadow)
        c.stamp(sh, x + k - 1, y + k - 1)
    o = t.copy(); o.outline('k', diag=True)
    c.stamp(o, x, y)
    return w * k

def caption(c, lines, bx, by, pad=4):
    bw = max(text_width(l, FONT) for l in lines) + 2 * pad
    bh = 8 * len(lines) + 5
    c.rect(bx + 2, by + 2, bw, bh, 'k')
    c.rect(bx, by, bw, bh, 'k').rect(bx + 1, by + 1, bw - 2, bh - 2, 'y')
    c.rect(bx + 1, by + bh - 3, bw - 2, 2, 'Y')
    for i, l in enumerate(lines):
        c.text(l, bx + pad, by + 3 + i * 8, 'k', FONT)

def page_frame(c):
    X, Y = c._xy()
    inA = (X >= 8) & (X < 232) & (Y >= 8) & (Y < 152)
    c.paint(~inA, 'p')
    c.paint(c.grow(inA, diag=True, n=2) & ~inA, 'k')

def make_title():
    far = blank(SKY, True)
    far.rect(0, 0, 256, 160, 'o')
    X, Y = far._xy()
    ang = np.arctan2(Y - 150, X - 120)
    far.paint(((ang * 14 / math.pi).astype(int) % 2 == 0), 'y')
    far.tone('o', 'c', lambda X, Y: np.clip((np.hypot(X - 120, Y - 150) - 70) / 120.0, 0, 0.8), 'dot', 4)
    mid = blank(GUARD, True)
    mid.stamp(guardian.render(guardian.TANK, {'eye': 'open'}, w=160, h=128, ox=80, oy=124), 84, 26)
    play = blank(ACE)
    play.stamp(anims.ace('upfwd', 'idle', w=48, h=64, ox=14, oy=60).scaled(2), 10, 24)
    fr = blank(FRAME)
    page_frame(fr)
    big_text(fr, "ASTRO ACE", 16, 13, 3, 'r', shadow='k')
    fr.circle(212, 30, 13, 'k'); fr.circle(212, 30, 12, 'w')
    fr.text("NO.1", 201, 27, 'r', FONT)
    caption(fr, ["PRESS START"], 82, 134)
    return dict(name='title', far=far, mid=mid, play=play, frame=fr, pals=[FRAME, ACE, GUARD, SKY],
                solid=np.zeros((20, 64), np.uint8), objects=[], backdrop=SKY['o'], cycle=0, start=(0, 0))

def make_end():
    fr = blank(FRAME)
    X, Y = fr._xy()
    inA = (X >= 8) & (X < 232) & (Y >= 8) & (Y < 152)
    ex, ey = 120, 88
    fr.paint(inA, '3')
    fr.gradient(inA, ['1', '2', '3'], lambda X, Y: np.clip((np.hypot(X - ex, (Y - ey) * 0.9) - 34) / 90.0, 0, 1), 'dot', 4)
    head = Canvas(512, 160, FRAME)
    head.ellipse(ex, ey - 8, 40, 44, 'k')
    head.rect(ex - 30, ey + 12, 60, 80, 'k')
    head.poly([(ex - 70, 152), (ex - 44, ey + 40), (ex + 44, ey + 40), (ex + 70, 152)], 'k')
    fr.stamp(head, clip=[FRAME['1'], FRAME['2'], FRAME['3']])
    for s in (-1, 1):
        fr.poly([(ex + s * 7, ey), (ex + s * 26, ey - 9), (ex + s * 27, ey + 2), (ex + s * 10, ey + 8)], 'e')
        fr.poly([(ex + s * 13, ey + 1), (ex + s * 23, ey - 3), (ex + s * 23, ey + 1), (ex + s * 15, ey + 4)], 'w')
        fr.line(ex + s * 7, ey - 3, ex + s * 27, ey - 13, 'E')
        fr.line(ex + s * 7, ey - 4, ex + s * 27, ey - 14, 'E')
    fr.fn(lambda X, Y: (np.hypot(X - ex, (Y - ey + 24) / 0.8) < 33) & (Y < ey - 18) & ((X + Y) % 3 == 0), '2', clip='k')
    for i in range(7):
        fr.rect(ex - 13 + i * 4, ey + 24, 2, 9, '2')
    fr.a[~inA] = T
    page_frame_only = Canvas(512, 160, FRAME)
    page_frame(page_frame_only)
    fr.stamp(page_frame_only)
    return dict(name='end', far=blank(SKY, True), mid=blank(MID, True), play=blank(GROUND), frame=fr,
                pals=[FRAME, GROUND, MID, SKY], solid=np.zeros((20, 64), np.uint8), objects=[],
                backdrop=FRAME['3'], cycle=0, start=(0, 0))

TITLE, END = make_title(), make_end()

if __name__ == '__main__':
    out = os.path.join(os.path.dirname(__file__), '..', 'out')
    for r in (TITLE, END):
        s = compose(240, 160, [(r['far'], 0, 0), (r['mid'], 0, 0), (r['play'], 0, 0), (r['frame'], 0, 0)], backdrop=r['backdrop'])
        save(s, out + f"/card_{r['name']}.png", 4)
