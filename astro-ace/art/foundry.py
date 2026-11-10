"""Issue 1, panel 2: the robot foundry. Indoor, molten light from below."""
from style import *
import math, random
from panel import PANEL_L, PANEL_R, PANEL_T, PANEL_B

SOLID = np.zeros((20, 64), np.uint8)   # 1 solid, 2 one-way, 3 lava, 4 conveyor (pushes left)

def make_far():
    c = Canvas(256, 160, F_FAR, wrap=True)
    c.rect(0, 0, 256, 160, 'n')
    def t(X, Y):
        s = np.clip((Y - 30) / 118.0, 0, 1) ** 1.3 * 5
        i = np.floor(s)
        f = np.clip((s - i - 0.2) / 0.6, 0, 1)
        return (i + f) / 5
    c.gradient('n', ['n', 'i', 'v', 'm', 'c', 'o'], t, 'dot', 4)
    # distant vats and chimneys
    s = Canvas(256, 160, F_FAR, wrap=True)
    for x, w, top in ((30, 26, 70), (96, 34, 54), (170, 22, 80), (220, 30, 62)):
        s.rect(x - w // 2, top + 8, w, 160, 'g')
        s.ellipse(x, top + 8, w / 2, 8, 'g')
        s.rect(x - w // 2 - 2, top + 22, w + 4, 3, 'g')
        s.rect(x - 2, top - 30, 5, 34, 'g')
    for y in (40, 46):
        s.rect(0, y, 256, 2, 'g')
    s.edge('g', 'h', 0, -1)
    s.tone('g', 'h', lambda X, Y: np.clip((Y - 90) / 80.0, 0, 0.6), 'dot', 4)
    c.stamp(s)
    return c

def gear(c, cx, cy, r, teeth, col, hole=True):
    for i in range(teeth):
        a = i * 2 * math.pi / teeth
        x, y = cx + (r + 1) * math.cos(a), cy + (r + 1) * math.sin(a)
        c.circle(x, y, max(2.2, r * 0.16), col)
    c.circle(cx, cy, r, col)
    if hole:
        c.circle(cx, cy, r * 0.28, None)
        for i in range(4):
            a = i * math.pi / 2 + 0.6
            c.circle(cx + r * 0.6 * math.cos(a), cy + r * 0.6 * math.sin(a), r * 0.16, None)

def make_mid():
    c = Canvas(256, 160, F_MID, wrap=True)
    f = Canvas(256, 160, F_MID, wrap=True)                 # far plane
    gear(f, 60, 70, 30, 14, '4'); gear(f, 108, 96, 18, 10, '4'); gear(f, 200, 60, 24, 12, '4')
    for x in (10, 150, 240):
        f.rect(x, 0, 8, 160, '4')
    f.rect(0, 118, 256, 42, '4')
    f.edge('4', '5', 0, -1)
    for x, y in ((14, 60), (14, 90), (154, 50), (154, 84), (244, 70)):
        f.rect(x - 2, y, 4, 6, 'o'); f.rect(x - 2, y, 4, 2, 'y')
    c.stamp(f)
    n = Canvas(256, 160, F_MID, wrap=True)                 # near plane: columns, beams, a press
    for x in (34, 128, 222):
        n.rect(x, 0, 14, 160, '2')
        n.rect(x - 4, 28, 22, 5, '2'); n.rect(x - 4, 100, 22, 5, '2')
        n.rect(x, 0, 2, 160, '3')
        for y in range(8, 160, 12):
            n.px(x + 6, y, '1').px(x + 7, y, '1')
    n.rect(0, 14, 256, 7, '2'); n.rect(0, 14, 256, 1, '3')
    for x in range(0, 256, 16):                            # truss diagonals under the beam
        n.line(x, 21, x + 8, 28, '2'); n.line(x + 8, 28, x + 16, 21, '2')
    n.rect(0, 28, 256, 2, '2')
    n.poly([(70, 30), (100, 30), (96, 56), (74, 56)], '2')  # hanging crucible
    n.rect(72, 56, 26, 4, '3')
    n.rect(76, 60, 18, 3, 'o'); n.rect(78, 60, 14, 1, 'y')
    n.rect(84, 63, 3, 97, 'o'); n.rect(85, 63, 1, 97, 'y')
    n.rect(0, 132, 256, 28, '2'); n.rect(0, 132, 256, 1, '3')
    n.tone('2', '1', lambda X, Y: np.clip((Y - 60) / 120.0, 0, 0.6), 'dot', 4)
    for x in (170, 186):
        n.rect(x, 116, 10, 16, '1'); n.rect(x + 2, 120, 6, 8, 'r'); n.rect(x + 2, 124, 6, 4, 'o')
    c.stamp(n)
    return c

def floor(c, x0, x1, top, conveyor=False):
    px0, px1, py = x0 * 8, x1 * 8, top * 8
    c.rect(px0, py, px1 - px0, 160 - py, 'c')
    if conveyor:
        c.rect(px0, py, px1 - px0, 3, 'd')
        for x in range(px0, px1, 8):
            c.path([(x + 5, py), (x + 3, py + 1), (x + 5, py + 2)], 'y')
        c.rect(px0, py + 3, px1 - px0, 9, 'c')
        for x in range(px0 + 4, px1, 8):
            c.circle(x - 0.5, py + 7.5, 3.4, 'b'); c.circle(x - 0.5, py + 7.5, 1.4, 'd'); c.px(x - 2, py + 6, 'a')
        c.rect(px0, py + 12, px1 - px0, 2, 'd')
        SOLID[top:, x0:x1] = 4
        SOLID[top + 1:, x0:x1] = 1
    else:
        c.rect(px0, py, px1 - px0, 8, 'b'); c.rect(px0, py, px1 - px0, 2, 'a'); c.rect(px0, py + 6, px1 - px0, 2, 'c')
        for x in range(px0, px1, 16):
            c.rect(x, py + 2, 1, 4, 'c'); c.px(x + 3, py + 4, 'd'); c.px(x + 12, py + 4, 'd')
        SOLID[top:, x0:x1] = 1
    # girder truss below
    by = py + (14 if conveyor else 8)
    c.rect(px0, by, px1 - px0, 160 - by, 'd')
    for x in range(px0, px1, 16):
        c.line(x, by, x + 15, by + 15, 'c'); c.line(x + 15, by, x, by + 15, 'c')
        c.rect(x, by, 1, 160 - by, 'c')
    c.rect(px0, by + 16, px1 - px0, 2, 'c')

def hazard(c, x, y, w, h):
    X, Y = c._xy()
    m = (X >= x) & (X < x + w) & (Y >= y) & (Y < y + h)
    c.paint(m, 'y')
    c.paint(m & ((X + Y) % 6 < 3), 'k')

def make_play():
    c = Canvas(512, 160, FOUNDRY)
    X, Y = c._xy()
    # floors: entry, conveyor, sled bay, [lava], boss arena
    floor(c, 0, 10, 16); floor(c, 10, 18, 16, conveyor=True); floor(c, 18, 21, 16); floor(c, 34, 56, 16)
    c.outline('k')
    hazard(c, 18 * 8, 128, 24, 2); hazard(c, 34 * 8, 128, 40, 2)
    # lava channel
    lx0, lx1 = 21 * 8, 34 * 8
    lava = (X >= lx0) & (X < lx1) & (Y >= 138 + np.round(1.5 * np.sin(X / 5.0)).astype(int))
    c.paint(lava, '2')
    band = ((X + (Y - 138) * 2) // 5) % 3
    deep = np.clip((Y - 140) / 16.0, 0, 1)
    bi = (X + (Y - 138) * 2) // 5
    c.paint(lava & (bi % 3 == 0) & (Y < 147) & ((bi // 3) % 2 == 0), 'm')
    c.paint(lava & (bi % 3 == 0) & (Y < 147) & ((bi // 3) % 2 == 1), 'n')
    c.tone(lava & (c.a == FOUNDRY['2']), '3', lambda X, Y: np.clip((Y - 142) / 14.0, 0, 0.95), 'dot', 4)
    c.tone(lava & (c.a == FOUNDRY['3']), '4', lambda X, Y: np.clip((Y - 150) / 10.0, 0, 0.8), 'dot', 4)
    crest = lava & ~c._shift(lava, 0, 1)
    c.paint(crest & ((X // 4) % 2 == 0), 'm')
    c.paint(crest & ((X // 4) % 2 == 1), 'n')
    for bx, by in ((184, 143), (222, 146), (250, 142)):
        c.circle(bx, by, 2.2, '1'); c.circle(bx, by, 1.0, '2')
    SOLID[17:, 21:34] = 3
    # channel walls
    for x in (lx0 - 3, lx1):
        c.rect(x, 128, 3, 32, 'c'); c.rect(x, 128, 1, 32, 'a')
    # hanging platforms over the lava (chains to the ceiling)
    for tx, ty in ((24, 13), (29, 12)):
        x, y = tx * 8, ty * 8
        p = Canvas(512, 160, FOUNDRY)
        p.rect(x, y, 16, 6, 'b').rect(x, y, 16, 2, 'a').rect(x, y + 4, 16, 2, 'c')
        hazard(p, x + 2, y + 2, 12, 2)
        p.outline('k')
        for cx in (x + 2, x + 13):
            for yy in range(24, y - 1, 3):
                p.rect(cx, yy, 1, 2, 'c' if (yy // 3) % 2 else 'b')
        c.stamp(p)
        SOLID[ty, tx:tx + 2] = 2
    # catwalk for the sniper
    p = Canvas(512, 160, FOUNDRY)
    p.rect(32, 80, 40, 4, 'b').rect(32, 80, 40, 1, 'a').rect(32, 83, 40, 1, 'c')
    for x in range(34, 72, 6):
        p.rect(x, 84, 1, 4, 'c')
    p.rect(32, 88, 40, 1, 'c')
    p.outline('k')
    c.stamp(p)
    SOLID[10, 4:9] = 2
    # ceiling girder with lamps
    cg = Canvas(512, 160, FOUNDRY)
    cg.rect(0, 8, 448, 12, 'c'); cg.rect(0, 8, 448, 2, 'd'); cg.rect(0, 18, 448, 2, 'b')
    for x in range(4, 448, 12):
        cg.px(x, 13, 'd'); cg.px(x + 1, 13, 'a')
    hazard(cg, 0, 20, 448, 3)
    for x in (60, 150, 310, 390):
        cg.rect(x, 23, 2, 6, 'c')
        cg.poly([(x - 5, 33), (x - 2, 29), (x + 3, 29), (x + 6, 33)], 'b')
        cg.rect(x - 3, 33, 8, 2, 'w')
    cg.outline('k')
    c.stamp(cg)
    for x in (60, 150, 310, 390):                           # light cones in halftone
        cone = (Y > 35) & (Y < 100) & (np.abs(X - x - 0.5) < 4 + (Y - 35) * 0.35) & (c.a == T)
        c.tone(cone, 'y', lambda X, Y: np.clip(0.34 - (Y - 35) / 240.0, 0, 1), 'dot', 4)
    # copper pipes along the back wall
    pp = Canvas(512, 160, FOUNDRY)
    pp.rect(0, 44, 130, 5, 'p'); pp.rect(0, 44, 130, 1, 'w'); pp.rect(0, 47, 130, 2, 'P')
    pp.rect(126, 44, 5, 84, 'p'); pp.rect(129, 44, 2, 84, 'P')
    for x in (20, 70, 110):
        pp.rect(x, 43, 3, 7, 'P')
    pp.circle(96, 46, 4.5, 'c'); pp.circle(96, 46, 2.5, 'b'); pp.rect(95, 38, 2, 5, 'c'); pp.rect(92, 37, 8, 2, 'y')
    pp.outline('k')
    c.stamp(pp, clip=[T])
    # vault door behind the boss
    vd = Canvas(512, 160, FOUNDRY)
    vd.rect(408, 64, 24, 64, 'c'); vd.rect(408, 64, 24, 2, 'b'); vd.rect(408, 64, 2, 64, 'b')
    vd.circle(422, 98, 9, 'd'); vd.circle(422, 98, 6, 'c'); vd.circle(422, 98, 2, 'y')
    hazard(vd, 408, 60, 24, 4)
    for y in (70, 122):
        for x in (411, 427):
            vd.px(x, y, 'a')
    vd.outline('k')
    c.stamp(vd, clip=[T])
    return c

def make_frame(caption=("DEEP IN THE ROBOT", "FOUNDRY...")):
    c = Canvas(512, 160, FRAME)
    X, Y = c._xy()
    inA = (X >= PANEL_L) & (X < PANEL_R) & (Y >= PANEL_T) & (Y < PANEL_B)
    c.paint(~inA, 'p')
    c.paint(c.grow(inA, diag=True, n=2) & ~inA, 'k')
    return c

FAR, MID_L, PLAY, FRAME_L = make_far(), make_mid(), make_play(), make_frame()
OBJECTS = [('BOSS', 384, 128, 1), ('SLED', 156, 128, 0), ('FIRE', 196, 150, 0), ('FIRE', 226, 150, 50),
           ('FIRE', 260, 150, 100), ('TURRET', 240, 96, 0), ('DRUM', 300, 128, 0), ('POD', 150, 60, 2)]
ROOM = dict(name='foundry', far=FAR, mid=MID_L, play=PLAY, frame=FRAME_L, pals=[FRAME, FOUNDRY, F_MID, F_FAR],
            solid=SOLID, objects=OBJECTS, backdrop=F_FAR['n'], cycle=1, start=(56, 128))

if __name__ == '__main__':
    out = os.path.join(os.path.dirname(__file__), '..', 'out')
    for cam in (0, 208):
        s = compose(240, 160, [(FAR, cam // 4, 0), (MID_L, cam // 2, 0), (PLAY, cam, 0), (FRAME_L, cam, 0)], backdrop=F_FAR['n'])
        save(s, out + f'/foundry_{cam}.png', 4)
