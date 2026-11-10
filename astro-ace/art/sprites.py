"""Enemies, vehicle, boss, weapons and effects."""
from style import *
import math

def d(a):
    a = math.radians(a)
    return math.sin(a), math.cos(a)

# ------------------------------------------------------------ robot trooper
R_HEAD = """
......kk......
.....kyyk.....
......kk......
...kkkkkkkk...
..kaaabbbbbkk.
.kaabbbbbbbbck
.kkkkkkkkkkkkk
.kddddddddeEek
.kkkkkkkkkkkkk
..kbbbbbbbbck.
"""
R_BODY = """
.kkkkkkkkkkkk.
kaabbbbbbbbbck
kabbbbbbyybcck
kabbbbbbyybcck
kbbbbbbbbbbcck
kpppppppppppPk
kbbbbbbbbbccck
kcccccccccccdk
.kkkkkkkkkkkk.
"""
def rleg(hip, thigh, bend, near):
    hx, hy = hip
    kx, ky = hx + 3.2 * d(thigh)[0], hy + 3.2 * d(thigh)[1]
    ax, ay = kx + 3.2 * d(thigh - bend)[0], ky + 3.2 * d(thigh - bend)[1]
    t, f, fh = ('c', 'b', 'a') if near else ('d', 'c', 'c')
    def draw(c):
        c.capsule(hx, hy, kx, ky, 1.3, 1.3, t)
        c.capsule(kx, ky, ax, ay, 1.3, 1.3, t)
        c.rect(round(ax) - 2, round(ay), 6, 3, f)
        c.rect(round(ax) - 2, round(ay), 6, 1, fh)
    return part(48, 48, ROBOT, draw)

def robot(near, far, bob=0, arm=0):
    c = Canvas(48, 48, ROBOT)
    ox, oy = 8, 8 + bob
    hip = (ox + 15.5, oy + 20.5)
    legs = Canvas(48, 48, ROBOT)
    legs.stamp(rleg((hip[0] - 3, hip[1]), *far, near=False))
    legs.stamp(rleg((hip[0] + 2.5, hip[1]), *near, near=True))
    c.stamp(legs, 0, min(0, 40 - legs.bbox()[3]))
    c.stamp(from_grid(R_BODY, ROBOT), ox + 9, oy + 11)
    c.stamp(from_grid(R_HEAD, ROBOT), ox + 9, oy + 2)
    sx, sy = ox + 17, oy + 15
    hx, hy = ox + 23, oy + 17 + arm
    def armp(p):
        p.capsule(sx, sy, hx, hy, 1.6, 1.3, 'c')
        p.circle(sx, sy, 1.9, 'p')
        p.rect(hx, hy - 2, 4, 1, 'g').rect(hx, hy + 2, 4, 1, 'g').rect(hx, hy - 2, 1, 5, 'g')
    c.stamp(part(48, 48, ROBOT, armp))
    return c.crop(8, 8, 32, 32)

WALK = [((30, 5), (-30, 15)), ((6, 0), (0, 55)), ((-30, 15), (30, 5)), ((0, 55), (6, 0))]
ROBOT_FRAMES = [robot(n, f, bob=(i % 2), arm=(i % 2)) for i, (n, f) in enumerate(WALK)]

# ------------------------------------------------------------ turret (4 barrel angles)
def turret(deg):
    c = Canvas(32, 32, ROBOT)
    f = Frame(15.5, 19.5, deg)
    def barrel(p):
        f.rect(p, 3, -2.2, 12, 2.2, 'b')
        f.rect(p, 3, 0.6, 12, 2.2, 'c')
        f.rect(p, 3, -2.2, 12, -1.2, 'a')
        f.rect(p, 11, -3.0, 14, 3.0, 'p')
    c.stamp(part(32, 32, ROBOT, barrel))
    def base(p):
        p.rect(4, 27, 24, 4, 'c').rect(4, 27, 24, 1, 'b')
        p.fn(lambda X, Y: ((X - 15.5) ** 2 + (Y - 21) ** 2 <= 64) & (Y <= 27), 'b')
        p.fn(lambda X, Y: ((X - 13.5) ** 2 + (Y - 19) ** 2 <= 16), 'a', clip='b')
        p.fn(lambda X, Y: ((X - 15.5) ** 2 + (Y - 21) ** 2 > 40) & (Y > 22), 'c', clip='b')
        for x in (6, 12, 19, 25):
            p.px(x, 29, 'd')
    c.stamp(part(32, 32, ROBOT, base))
    c.stamp(part(32, 32, ROBOT, lambda p: (p.circle(15.5, 19.5, 3.4, 'd'), p.circle(15.5, 19.5, 2.2, 'e'), p.px(15, 18, 'E'), p.px(16, 18, 'E'))))
    return c
TURRET = [turret(a) for a in (0, 45, 90, -30)]

# ------------------------------------------------------------ saucer (32x16)
def saucer(n):
    c = Canvas(32, 16, ROBOT)
    def body(p):
        p.ellipse(15.5, 5.5, 6, 5, 'E')
        p.fn(lambda X, Y: (X < 14) & (Y < 5), 'w', clip='E')
        p.ellipse(15.5, 9, 14, 4, 'b')
        p.fn(lambda X, Y: Y <= 7, 'a', clip='b')
        p.fn(lambda X, Y: Y >= 11, 'c', clip='b')
        for i, x in enumerate(range(5, 28, 5)):
            p.rect(x, 9, 2, 2, 'y' if (i + n) % 2 else 'e')
        p.rect(13, 13, 6, 1, 'd')
    c.stamp(part(32, 16, ROBOT, body))
    return c
SAUCER = [saucer(0), saucer(1)]

# ------------------------------------------------------------ weapon pod + pickups
def pod(n):
    c = Canvas(16, 16, ROBOT)
    def body(p):
        w = 3 if n else 1
        p.poly([(1, 7 - w), (5, 7), (1, 9)], 'g')
        p.poly([(14, 7 - w), (10, 7), (14, 9)], 'g')
        p.ellipse(7.5, 8, 5, 4, 'b')
        p.fn(lambda X, Y: Y <= 6, 'a', clip='b')
        p.fn(lambda X, Y: Y >= 10, 'c', clip='b')
        p.rect(6, 5, 3, 7, 'y')
        p.rect(6, 10, 3, 2, 'Y')
    c.stamp(part(16, 16, ROBOT, body))
    return c
POD = [pod(0), pod(1)]

LET5 = {
 'S': [".rrr", "r...", ".rr.", "...r", "rrr."],
 'M': ["r...r", "rr.rr", "r.r.r", "r...r", "r...r"],
 'L': ["r...", "r...", "r...", "r...", "rrrr"],
}
def badge(ch):
    c = Canvas(16, 16, FX)
    def body(p):
        p.poly([(0, 5), (4, 6), (4, 9), (1, 9)], 'o')
        p.poly([(15, 5), (11, 6), (11, 9), (14, 9)], 'o')
        p.poly([(3, 3), (12, 3), (12, 10), (7.5, 14), (3, 10)], 'y')
        p.fn(lambda X, Y: Y <= 4, 'w', clip='y')
        p.fn(lambda X, Y: (Y >= 10), 'o', clip='y')
    c.stamp(part(16, 16, FX, body))
    g = LET5[ch]
    x0 = 8 - len(g[0]) // 2 - (len(g[0]) % 2)
    for j, row in enumerate(g):
        for i, v in enumerate(row):
            if v == 'r':
                c.px(x0 + i + (1 if len(g[0]) == 4 else 0), 5 + j, 'R')
    return c
BADGES = [badge(ch) for ch in 'SML']

def drum():
    c = Canvas(16, 16, FX)
    def body(p):
        p.rect(3, 2, 10, 13, 'r')
        p.rect(3, 2, 2, 13, 'o')
        p.rect(11, 2, 2, 13, 'R')
        for y in (5, 11):
            p.rect(3, y, 10, 1, 'R')
        p.rect(4, 1, 8, 1, 'o')
        p.poly([(8, 6), (10, 8), (8, 10), (6, 8)], 'y')
        p.px(8, 8, 'k')
    c.stamp(part(16, 16, FX, body))
    return c
DRUM = drum()

def fireball(n):
    c = Canvas(16, 16, FX)
    c.circle(7.5, 8.5, 5.5, 'r')
    c.poly([(3, 7), (5 + n, 0), (8, 5), (10 - n, 1), (12, 7)], 'r')
    c.circle(7.5, 9, 4, 'o')
    c.poly([(5, 8), (6 + n, 3), (8, 7), (9, 4), (10, 8)], 'o')
    c.circle(7.5, 9.5, 2.4, 'y')
    c.px(7, 9, 'w').px(8, 9, 'w').px(7, 10, 'w').px(8, 10, 'w')
    c.outline('k')
    return c
FIREBALL = [fireball(0), fireball(1)]

# ------------------------------------------------------------ bullets
def orb(core, mid, r=2.6):
    c = Canvas(8, 8, FX)
    c.circle(3.5, 3.5, r, mid)
    c.circle(3.5, 3.5, r - 1.3, core)
    c.outline('k')
    return c
PEA = [orb('w', 'c'), orb('c', 'C')]
PELLET = orb('y', 'o', 2.2)
EBULLET = [orb('w', 'm'), orb('p', 'r')]
def laser(w, h, pts):
    c = Canvas(w, h, FX)
    c.capsule(*pts, 1.6, 1.6, 'c')
    c.capsule(*pts, 0.7, 0.7, 'w')
    c.outline('C')
    return c
LASER_H = laser(16, 8, (3, 3.5, 12, 3.5))
LASER_V = laser(8, 16, (3.5, 3, 3.5, 12))
LASER_D = laser(16, 16, (3, 12, 12, 3))          # "/" diagonal (up-right)

# ------------------------------------------------------------ explosions and lettering
def star(c, cx, cy, n, r_out, r_in, col, rot=0.0, jit=0.0):
    pts = []
    for i in range(n * 2):
        r = (r_out if i % 2 == 0 else r_in) * (1 + jit * math.sin(i * 2.4))
        a = rot + i * math.pi / n
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    c.poly(pts, col)

def burst(r_out, r_in, hollow=False, rot=0.2):
    c = Canvas(32, 32, FX)
    star(c, 15.5, 15.5, 9, r_out, r_in, 'o', rot, 0.08)
    star(c, 15.5, 15.5, 9, r_out * 0.78, r_in * 0.7, 'y', rot, 0.08)
    if not hollow:
        star(c, 15.5, 15.5, 9, r_out * 0.45, r_in * 0.4, 'w', rot, 0.08)
    else:
        c.circle(15.5, 15.5, r_in * 0.75, None)
        c.tone('y', None, 0.5, 'check')
    c.outline('k')
    return c
BURST = [burst(8, 4), burst(13.5, 7), burst(14, 9, hollow=True, rot=0.5)]

LET = {
 'P': ["rrrrr.", "rr..rr", "rr..rr", "rrrrr.", "rr....", "rr....", "rr...."],
 'O': [".rrrr.", "rr..rr", "rr..rr", "rr..rr", "rr..rr", "rr..rr", ".rrrr."],
 'W': ["rr...rr", "rr...rr", "rr.r.rr", "rr.r.rr", "rrrrrrr", "rrr.rrr", "rr...rr"],
 '!': ["rr", "rr", "rr", "rr", "rr", "..", "rr"],
 'B': ["rrrrr.", "rr..rr", "rr..rr", "rrrrr.", "rr..rr", "rr..rr", "rrrrr."],
 'M': ["rr...rr", "rrr.rrr", "rrrrrrr", "rr.r.rr", "rr...rr", "rr...rr", "rr...rr"],
}
def sfx(word, w=32, h=16):
    c = Canvas(w, h, FX)
    tw = sum(len(LET[ch][0]) + 1 for ch in word) - 1
    x = (w - tw) // 2
    for i, ch in enumerate(word):
        y = 4 + (-(i % 2))
        for j, row in enumerate(LET[ch]):
            for k, v in enumerate(row):
                if v == 'r':
                    c.px(x + k, y + j, 'y' if j > 1 else 'w')
        x += len(LET[ch][0]) + 1
    sh = c._shift(c.mask(), 1, 1) & ~c.mask()
    c.paint(sh, 'r')
    c.outline('k')
    return c
POW = sfx('POW!')
BOOM = sfx('BOOM')

def flash():
    c = Canvas(16, 16, FX)
    star(c, 7.5, 7.5, 6, 6.5, 2.8, 'y', 0.0)
    star(c, 7.5, 7.5, 6, 3.6, 1.8, 'w', 0.0)
    c.outline('k')
    return c
FLASH = flash()

LIFE = from_grid("""
..kkkk..
.kchhck.
kcwhsssk
kcchsksk
kcCsssck
.kCCCCk.
..kkkk..
........
""", HERO)

# ------------------------------------------------------------ hover sled (64x32, hero palette)
def sled(n):
    c = Canvas(64, 32, HERO)
    def fin(p):
        p.poly([(6, 18), (2, 4), (9, 4), (18, 18)], 'r')
        p.fn(lambda X, Y: (Y <= 6), 'o', clip='r')
        p.poly([(8, 16), (6, 9), (9, 9), (13, 16)], 'w')
    c.stamp(part(64, 32, HERO, fin))
    def body(p):
        p.poly([(4, 15), (44, 13), (56, 15), (62, 19), (56, 23), (8, 24), (4, 21)], 'r')
        p.fn(lambda X, Y: Y <= 15, 'o', clip='r')
        p.fn(lambda X, Y: Y >= 22, 'R', clip='r')
        p.rect(8, 18, 46, 2, 'w')
        p.rect(8, 19, 46, 1, 'g')
        p.poly([(56, 16), (61, 19), (56, 21)], 'y')
        p.rect(20, 13, 16, 2, 'G')                      # seat
    c.stamp(part(64, 32, HERO, body))
    def shield(p):
        p.poly([(38, 14), (41, 5), (44, 5), (47, 14)], 'c')
        p.poly([(38, 14), (41, 5), (42, 5), (40, 14)], 'w')
        p.fn(lambda X, Y: X >= 44, 'C', clip='c')
    c.stamp(part(64, 32, HERO, shield))
    def pods(p):
        for x in (12, 42):
            p.rect(x, 23, 9, 3, 'g').rect(x, 23, 9, 1, 'w').rect(x + 1, 26, 7, 1, 'G')
    c.stamp(part(64, 32, HERO, pods))
    for x in (13, 43):
        L = 4 if n else 2
        for j in range(L):
            for i in range(7 - j * 2 if 7 - j * 2 > 0 else 1):
                c.px(x + j + i, 27 + j, 'c' if j < 2 else 'C')
        c.px(x + 3, 27, 'w')
    return c
SLED = [sled(0), sled(1)]

# ------------------------------------------------------------ boss: the Foundry Guardian (64x64)
def boss(open_eye):
    c = Canvas(64, 64, BOSS)
    def pipes(p):
        for x in (9, 16):
            p.rect(x, 12, 4, 16, 'c').rect(x, 12, 1, 16, 'b')
            p.rect(x - 1, 10, 6, 3, 'r').rect(x - 1, 10, 6, 1, '1')
    c.stamp(part(64, 64, BOSS, pipes))
    def treads(p):
        p.fn(lambda X, Y: (X >= 5) & (X <= 58) & (Y >= 50) & (Y <= 62) &
             ~(((X < 9) | (X > 54)) & ((Y < 52) | (Y > 60))), 'd')
        for x in range(9, 56, 9):
            p.circle(x + 2.5, 56, 3.4, 'c')
            p.circle(x + 2.5, 56, 1.6, 'b')
        for x in range(6, 58, 4):
            p.px(x, 50, 'b').px(x + 1, 50, 'b').px(x, 62, 'c').px(x + 1, 62, 'c')
    c.stamp(part(64, 64, BOSS, treads))
    def torso(p):
        p.poly([(8, 49), (11, 26), (50, 26), (55, 49)], 'b')
        p.fn(lambda X, Y: Y <= 28, 'a', clip='b')
        p.fn(lambda X, Y: (Y >= 45) | (X <= 12), 'c', clip='b')
        p.tone('b', 'c', lambda X, Y: np.clip((Y - 36) / 14.0, 0, 0.6), 'dot', 4)
        p.rect(16, 34, 16, 11, 'd')                      # furnace grate
        for x in range(17, 31, 3):
            p.rect(x, 35, 2, 9, 'o')
            p.rect(x, 35, 2, 3, 'e')
        p.rect(10, 46, 44, 2, 'y')
        p.fn(lambda X, Y: (Y >= 46) & (Y <= 47) & ((X + Y) % 4 < 2), 'k', clip='y')
        for x, y in ((13, 30), (48, 30), (36, 31), (36, 42), (50, 42)):
            p.px(x, y, 'd').px(x + 1, y, 'a')
    c.stamp(part(64, 64, BOSS, torso))
    def head(p):
        p.fn(lambda X, Y: ((X - 33) ** 2 + (Y - 20) ** 2 <= 196) & (Y <= 27), 'b')
        p.fn(lambda X, Y: ((X - 29) ** 2 + (Y - 15) ** 2 <= 60), 'a', clip='b')
        p.fn(lambda X, Y: (Y >= 24), 'c', clip='b')
        p.rect(20, 23, 27, 2, 'R')
        p.poly([(24, 8), (22, 1), (26, 6)], 'r')
        p.poly([(40, 8), (44, 1), (40, 6)], 'r')
    c.stamp(part(64, 64, BOSS, head))
    def eye(p):
        p.circle(40.5, 17.5, 6.6, 'd')
        if open_eye:
            p.circle(40.5, 17.5, 5.0, 'r')
            p.circle(41, 17.5, 3.2, 'o')
            p.circle(41.5, 17.5, 1.7, 'e')
            p.px(38, 15, 'w').px(39, 14, 'w')
        else:
            p.circle(40.5, 17.5, 5.0, 'c')
            for y in (14, 17, 20):
                p.rect(36, y, 10, 1, 'd')
            p.rect(36, 13, 9, 1, 'b')
    c.stamp(part(64, 64, BOSS, eye))
    def cannon(p):
        p.rect(40, 32, 21, 9, 'b').rect(40, 32, 21, 2, 'a').rect(40, 38, 21, 3, 'c')
        p.rect(56, 30, 5, 13, 'r').rect(56, 30, 5, 2, '1').rect(56, 40, 5, 3, 'R')
        p.rect(44, 32, 2, 9, 'd')
        p.circle(40, 36.5, 5.5, 'c')
        p.circle(39.5, 35.5, 3, 'b')
    c.stamp(part(64, 64, BOSS, cannon))
    return c
BOSS_F = [boss(True), boss(False)]

def podboss(i):
    src = BOSS_F[i]
    c = Canvas(64, 32, BOSS)
    head = src.crop(6, 0, 52, 27)
    c.stamp(head, 6, 0)
    def under(p):
        p.poly([(18, 27), (48, 27), (44, 30), (22, 30)], 'c')
        p.rect(22, 27, 22, 1, 'b')
        for x in (24, 32, 40):
            p.rect(x, 30, 3, 1, 'o')
    c.stamp(part(64, 32, BOSS, under))
    for x, y in ((11, 28), (12, 30), (17, 29)):
        c.px(x, y, 'k')
    return c
PODBOSS = [podboss(0), podboss(1)]

if __name__ == '__main__':
    out = os.path.join(os.path.dirname(__file__), '..', 'out')
    sheet(ROBOT_FRAMES + TURRET + SAUCER + POD + BADGES + [DRUM] + FIREBALL + PEA + [PELLET] + EBULLET +
          [LASER_H, LASER_V, LASER_D, LIFE, FLASH] + BURST + [POW, BOOM], out + '/sprites_sheet.png', 6, cols=8)
    sheet(SLED + BOSS_F + PODBOSS, out + '/big_sheet.png', 6, cols=2)
    for n, f, pal in [('robot', ROBOT_FRAMES[0], ROBOT), ('turret', TURRET[1], ROBOT), ('saucer', SAUCER[0], ROBOT),
                      ('pod', POD[0], ROBOT), ('badge', BADGES[0], FX), ('drum', DRUM, FX), ('sled', SLED[0], HERO),
                      ('boss', BOSS_F[0], BOSS), ('boss2', BOSS_F[1], BOSS), ('pow', POW, FX), ('boom', BOOM, FX)]:
        for m in lint_sprite(f, pal, name=n, allow_orphans=40):
            print(m)
