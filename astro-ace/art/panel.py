"""Issue 1, panel 1: the landing site on Zorb-9. Four hardware layers:
FAR (BG3 sky), MID (BG2 ridges), PLAY (BG1 playfield), FRAME (BG0 gutters,
borders, caption, next-panel teaser)."""
from style import *
import math, random

WORLD_W, SCREEN_H = 512, 160
GROUND_Y = 128
PANEL_L, PANEL_R, PANEL_T, PANEL_B = 8, 432, 8, 152      # interior of panel A
PB_L = 440                                               # interior of panel B starts here

# ============================================================ FAR
def make_far():
    c = Canvas(256, 160, SKY, wrap=True)
    c.rect(0, 0, 256, 160, 'n')
    def t(X, Y):
        s = np.clip((Y - 14) / 122.0, 0, 1) ** 1.15 * 6
        i = np.floor(s)
        f = np.clip((s - i - 0.2) / 0.6, 0, 1)
        return (i + f) / 6
    c.gradient('n', ['n', 'i', 'v', 'm', 'c', 'o', 'y'], t, 'dot', 4)
    rnd = random.Random(7)
    for _ in range(46):
        x, y = rnd.randrange(256), rnd.randrange(9, 62)
        if c.get(x, y) in (SKY['n'], SKY['i']):
            c.px(x, y, 'w' if rnd.random() < .7 else 'y')
    for x, y in ((150, 20), (228, 30), (20, 16), (118, 44)):
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            c.px(x + dx, y + dy, 'w')
    # ringed gas giant
    cx, cy, R = 78, 54, 25
    th = math.radians(-18)
    def ring(X, Y, back):
        u = (X - cx) * math.cos(th) + (Y - cy) * math.sin(th)
        v = -(X - cx) * math.sin(th) + (Y - cy) * math.cos(th)
        q = (u / 44.0) ** 2 + (v / 9.0) ** 2
        m = (q > 0.50) & (q < 1.0) & ~((q > 0.70) & (q < 0.76))
        return m & ((v < 0) if back else (v >= 0))
    c.fn(lambda X, Y: ring(X, Y, True), 'r')
    c.circle(cx, cy, R, 'b')
    disk = c.mask('b')
    lam = lambda X, Y: -((X - cx) * -0.55 + (Y - cy) * -0.83) / R * -1
    c.tone(disk, 'a', lambda X, Y: np.clip((lam(X, Y) - 0.15) / 0.45, 0, 1), 'dot', 4)
    c.tone(disk & ~c.mask('a'), 'd', lambda X, Y: np.clip((-lam(X, Y) - 0.05) / 0.45, 0, 1), 'dot', 4)
    for by, bh in ((cy - 9, 2), (cy + 3, 3), (cy + 12, 2)):
        c.fn(lambda X, Y: (Y >= by) & (Y < by + bh) & ((X + Y) % 2 == 0), 'd', clip=disk)
    c.fn(lambda X, Y: ring(X, Y, False), 'r')
    c.fn(lambda X, Y: ring(X, Y, False) & disk & ((X + Y) % 2 == 0), 'o')
    # small moon
    c.circle(196, 36, 7, 'm')
    c.fn(lambda X, Y: ((X - 194) ** 2 + (Y - 34) ** 2 <= 30), 'c', clip=c.mask('m') & (c._xy()[1] < 46) & (c._xy()[0] > 180))
    return c

# ============================================================ MID
def make_mid():
    c = Canvas(256, 160, MID, wrap=True)
    # far plane: mesas and the robot city
    for x0, x1, top in ((-6, 44, 92), (36, 70, 100), (150, 196, 88), (188, 232, 98), (226, 262, 94)):
        c.poly([(x0, 160), (x0 + 5, top + 6), (x0 + 9, top), (x1 - 9, top), (x1 - 4, top + 7), (x1, 160)], '4')
    c.rect(0, 108, 256, 52, '4')
    # city: towers with spheres and domes
    c.ellipse(108, 104, 22, 14, '4')
    for x, top, r in ((92, 70, 4), (104, 56, 5), (118, 64, 3), (128, 78, 4)):
        c.rect(x - 1, top, 3, 110 - top, '4')
        c.circle(x, top, r, '4')
        c.rect(x - r - 2, top + r + 2, 2 * r + 5, 2, '4')
    c.line(104, 51, 104, 42, '4')
    c.edge('4', '5', 0, -1)
    for x, y in ((92, 70), (104, 55), (104, 57), (118, 64), (128, 78), (100, 98), (106, 96), (112, 99), (118, 97), (96, 101)):
        c.px(x, y, 'y')
    c.tone('4', '5', lambda X, Y: np.clip((Y - 104) / 40.0, 0, 0.5), 'dot', 4)
    # near plane: rock spires and an arch
    def spire(x, top, w, lean=0):
        c.poly([(x - w, 160), (x - w * 0.7, top + 30), (x - w * 0.35 + lean, top + 10), (x + lean, top),
                (x + w * 0.3 + lean, top + 6), (x + w * 0.45, top + 22), (x + w * 0.8, top + 34), (x + w, 160)], '2')
    spire(20, 84, 16, 2); spire(40, 100, 12, -1)
    spire(84, 110, 14); spire(142, 76, 18, -3); spire(164, 96, 13, 2)
    spire(214, 90, 15, 1); spire(238, 106, 12)
    c.rect(0, 126, 256, 34, '2')
    c.fn(lambda X, Y: ((X - 153) / 7.0) ** 2 + ((Y - 112) / 11.0) ** 2 <= 1, None, clip='2')   # arch hole
    c.ellipse(153, 112, 7, 11, '4', clip=None) if False else None
    near = c.mask('2')
    c.a[(c.a == T) & (c._xy()[1] > 100) & (np.abs(c._xy()[0] - 153) < 8)] = MID['4']
    c.edge('2', '3', 0, -1, depth=2, against=['4', '5', None])
    sky_above = c._shift(c.a == T, 0, 1) | c._shift(c.a == T, 0, 2)
    c.paint(c.mask('2') & sky_above, '3')
    c.tone('2', '1', lambda X, Y: np.clip((Y - 96) / 50.0, 0, 0.75) * (((X // 6) % 3) != 0), 'dot', 4)
    for x in range(6, 256, 23):
        c.fn(lambda X, Y: (X == x + (Y // 9) % 2) & (Y % 13 < 8), '1', clip='2')
    return c

# ============================================================ PLAY
SOLID = np.zeros((20, 64), np.uint8)       # 0 empty, 1 solid, 2 one-way platform

def crystal(c, x, base, h, w, lean=0):
    tip = (x + lean, base - h)
    c.poly([(x - w, base), (x - w + 1, base - h * 0.55), tip, (x + w - 1, base - h * 0.45), (x + w, base)], 't')
    c.poly([(x - w, base), (x - w + 1, base - h * 0.55), tip, (x - 0.5 + lean * 0.3, base)], 'x')
    c.poly([(x + w * 0.4, base), (x + w - 1, base - h * 0.45), (x + w, base)], 'T')

def platform(c, tx, ty, n):
    x, y, w = tx * 8, ty * 8, n * 8
    p = Canvas(c.w, c.h, GROUND)
    p.rect(x, y, w, 7, 'b').rect(x, y, w, 2, 'a').rect(x, y + 5, w, 2, 'c')
    for i in range(x + 3, x + w - 2, 8):
        p.px(i, y + 3, 'd').px(i + 1, y + 3, 'd')
    for ex in (x + 4, x + w - 10):
        p.poly([(ex, y + 7), (ex + 5, y + 7), (ex + 4, y + 10), (ex + 1, y + 10)], 'c')
        p.rect(ex + 1, y + 10, 4, 1, 'y')
    p.rect(x + 1, y + 7, 1, 1, 'c')
    p.outline('k')
    for ex in (x + 4, x + w - 10):
        for j, lv in enumerate((0.9, 0.6, 0.4, 0.2)):
            for i in range(4):
                if pattern('check')[(j) % 2, (i) % 2] < lv:
                    p.px(ex + 1 + i, y + 12 + j, 'x' if j < 2 else 't')
    c.stamp(p)
    SOLID[ty, tx:tx + n] = 2

def rocket():
    c = Canvas(56, 92, GROUND)
    cx = 27.5
    def prof(y):
        t = (y - 2) / 78.0
        w = 11.5 * math.sin(math.pi * min(t, 1) ** 0.62) ** 0.85
        return max(w, 4.5) if t > 0.55 else w
    L = [(cx - prof(y), y) for y in range(2, 81)]
    Rr = [(cx + prof(y), y) for y in range(80, 1, -1)]
    # back fins
    for s in (-1, 1):
        c.poly([(cx + s * 8, 50), (cx + s * 23, 76), (cx + s * 24, 90), (cx + s * 18, 90), (cx + s * 7, 72)], 'e')
    c.fn(lambda X, Y: (X > cx + 12) & ((X + Y) % 2 == 0), '4', clip='e')
    c.edge('e', '4', 0, 1, depth=2)
    c.outline('k')
    body = Canvas(56, 92, GROUND)
    body.poly(L + Rr, 'w')
    hull = body.mask('w')
    body.gradient(hull, ['w', 'a', 'b'], lambda X, Y: np.clip((X - cx - 1) / 11.0, 0, 1), 'dot', 4)
    nose = hull & (body._xy()[1] < 22)
    body.paint(nose, 'e')
    body.tone(nose, '4', lambda X, Y: np.clip((X - cx) / 7.0, 0, 0.8), 'dot', 4)
    body.paint(hull & (body._xy()[1] >= 22) & (body._xy()[1] < 24), 'k')
    X, Y = body._xy()
    chk = hull & (Y >= 48) & (Y < 54)
    body.paint(chk & (((X // 3) + (Y - 48) // 3) % 2 == 0), 'k')
    body.paint(chk & (((X // 3) + (Y - 48) // 3) % 2 == 1), 'w')
    body.circle(cx, 35, 5.2, 'k').circle(cx, 35, 4.2, 'b').circle(cx, 35, 2.9, 'T').circle(cx - 0.5, 34.5, 2.0, 't')
    body.px(26, 33, 'x').px(27, 33, 'x').px(26, 34, 'x')
    body.poly([(cx - 4.5, 80), (cx + 4.5, 80), (cx + 6.5, 86), (cx - 6.5, 86)], 'c')
    body.rect(22, 84, 12, 2, 'd')
    body.outline('k')
    c.stamp(body)
    fin = Canvas(56, 92, GROUND)
    fin.poly([(cx - 1.5, 58), (cx + 1.5, 58), (cx + 2.5, 90), (cx - 2.5, 90)], 'e')
    fin.rect(28, 60, 2, 30, '4')
    fin.outline('k')
    c.stamp(fin)
    return c

def make_play():
    c = Canvas(WORLD_W, 160, GROUND)
    rnd = random.Random(3)
    blocks = [(0, 18, 16), (18, 26, 14), (29, 42, 16), (42, 55, 14)]       # tile cols x0..x1, top tile row
    for x0, x1, top in blocks:
        px0, px1, py = x0 * 8, x1 * 8, top * 8
        c.rect(px0, py, px1 - px0, 160 - py, '2')
        m = np.zeros_like(c.a, bool)
        m[py:, px0:px1] = True
        c.paint(m & (c._xy()[1] < py + 3), '1')
        c.tone(m & c.mask('2'), '1', lambda X, Y: np.clip(0.55 - (Y - py - 3) / 8.0, 0, 1), 'dot', 4)
        c.tone(m & c.mask('2'), '3', lambda X, Y: np.clip((Y - py - 8) / 22.0, 0, 0.9), 'dot', 4)
        SOLID[top:, x0:x1] = 1
        # strata dashes and pebbles
        for _ in range((x1 - x0) // 2):
            x, y, l = rnd.randrange(px0 + 2, px1 - 12), py + rnd.choice((7, 11, 15, 19)), rnd.randrange(4, 10)
            c.rect(x, y, l, 1, '3')
        for _ in range((x1 - x0) // 3):
            x, y = rnd.randrange(px0 + 3, px1 - 6), py + rnd.randrange(6, 20)
            c.rect(x, y, 3, 2, '1').rect(x, y + 1, 3, 1, '3').px(x + 3, y + 1, 'k')
        # cracks from the surface
        for _ in range((x1 - x0) // 5):
            x = rnd.randrange(px0 + 4, px1 - 4)
            c.path([(x, py), (x + 1, py + 2), (x - 1, py + 4), (x, py + 6)], 'k')
    # cliff faces where a block is higher than its neighbour
    for x, top, bot, side in ((18 * 8, 112, 128, 1), (26 * 8 - 3, 112, 160, 1), (29 * 8, 128, 160, -1), (42 * 8, 112, 128, 1)):
        c.rect(x, top + 1, 3, bot - top - 1, '3')
        c.hatch(c.mask('3') & (np.abs(c._xy()[0] - x - 1) <= 1) & (c._xy()[1] > top), '4', 3, 1)
    # pit: dark chasm with crystal spikes
    pit = np.zeros_like(c.a, bool)
    pit[128:, 26 * 8:29 * 8] = True
    c.paint(pit, '4')
    c.tone(pit, 'k', lambda X, Y: np.clip((Y - 130) / 22.0, 0, 0.8), 'dot', 4)
    for x, h in ((213, 14), (220, 20), (227, 13)):
        crystal(c, x, 153, h, 4, 0)
    # rocks on the surface
    for x, w, h, gy in ((120, 9, 6, 128), (296, 7, 5, 128), (384, 10, 7, 112)):
        r = Canvas(c.w, c.h, GROUND)
        r.ellipse(x, gy, w, h, '2')
        r.a[gy:, :] = T
        r.edge('2', '1', 0, -1, depth=2)
        r.fn(lambda X, Y: (X > x + 2) & ((X + Y) % 2 == 0), '3', clip='2')
        c.stamp(r)
    for x, gy, hs in ((166, 112, (10, 16, 8)), (252, 128, (9, 13)), (360, 112, (12, 18, 9)), (406, 112, (8, 11))):
        for i, h in enumerate(hs):
            crystal(c, x + i * 6 - 6, gy, h, 4, (i - 1) * 2)
    c.outline('k')
    c.stamp(rocket(), 22, GROUND_Y - 92)
    platform(c, 31, 12, 5)
    platform(c, 37, 9, 5)
    platform(c, 12, 11, 4)
    return c

# ============================================================ FRAME
def make_frame():
    c = Canvas(WORLD_W, 160, FRAME)
    X, Y = c._xy()
    inA = (X >= PANEL_L) & (X < PANEL_R) & (Y >= PANEL_T) & (Y < PANEL_B)
    c.paint(~inA, 'p')
    ring = c.grow(inA, diag=True, n=2) & ~inA
    c.paint(ring, 'k')
    return c

FAR, MID_L, PLAY, FRAME_L = make_far(), make_mid(), make_play(), make_frame()

OBJECTS = [('BOSS', 392, 112, 0), ('DRUM', 190, 112, 0), ('DRUM', 286, 128, 0), ('DRUM', 346, 112, 0), ('POD', 230, 52, 1)]
ROOM = dict(name='landing', far=FAR, mid=MID_L, play=PLAY, frame=FRAME_L, pals=[FRAME, GROUND, MID, SKY],
            solid=SOLID, objects=OBJECTS, backdrop=SKY['n'], cycle=0, start=(100, 128))
DUSK = dict(ROOM, name='dusk', out_pals=[FRAME, GROUND_DUSK, MID_DUSK, SKY_DUSK], backdrop=SKY_DUSK['n'],
            objects=[('BOSS', 300, 60, 2), ('DRUM', 286, 128, 0), ('POD', 330, 50, 0), ('POD', 420, 40, 2)], start=(100, 128))
