"""ASTRO ACE hero, v2. 42px tall, split into LEGS and TORSO sprites so he can
run and aim independently (the classic run-and-gun build).

Composite space is 32x48, body centre x=13, soles on row 47.
TORSO sprite = composite rows 4..35.  LEGS sprite = composite rows 16..47."""
from style import *
import math

CX, HIP_Y = 13, 30.5
HELMET = """
....kkkk....
..kkcccckk..
.kcwchhhhck.
.kwchhhhhhk.
kcwhhhsssssk
kcchhsssksck
kgchssssssck
kgCchsssssck
.kCcssssSCk.
.kCCcSSSCCk.
..kkCCCCkk..
....kkkk....
"""
TORSO = """
...kkkkkk...
..kggwwwgk..
.kkoorrrrkk.
koorrrrrrrrk
korrrrryyrrk
korrrrrryrrk
kRrrrrrrrrRk
kRrrrrrrrRRk
.kRrrrrrrRk.
.kRRrrrrRRk.
.kRRrrrrRk..
.kyyyywyyk..
.kYYYYYYYk..
..kkkkkkk...
"""

def d(a):
    a = math.radians(a)
    return math.sin(a), math.cos(a)

def leg(hip, thigh, bend, near):
    cs = dict(t='r', th='o', ts='R', b='w', bs='g', sole='G', pad='y') if near else \
         dict(t='R', th='R', ts='R', b='g', bs='G', sole='G', pad='Y')
    hx, hy = hip
    kx, ky = hx + 7.3 * d(thigh)[0], hy + 7.3 * d(thigh)[1]
    ax, ay = kx + 6.3 * d(thigh - bend)[0], ky + 6.3 * d(thigh - bend)[1]
    fx, fy = d(thigh - bend + 90)
    def draw(c):
        c.capsule(hx, hy, kx, ky, 2.9, 2.3, cs['t'])
        c.edge(cs['t'], cs['th'], 1, 0)
        c.edge(cs['t'], cs['ts'], -1, 0)
        c.capsule(kx, ky, ax, ay, 2.3, 2.0, cs['b'])
        c.capsule(ax, ay, ax + 3.2 * fx, ay + 3.2 * fy, 1.7, 1.4, cs['b'])
        c.edge(cs['b'], cs['bs'], -1, 0)
        c.edge(cs['b'], cs['sole'], 0, 1)
        c.circle(kx + 0.6 * d(thigh)[1], ky - 0.6 * d(thigh)[0], 1.7, cs['pad'])
    return part(48, 64, HERO, draw)

def legs(near, far, drop=0):
    """Legs sprite (32x32). drop lowers the hips (crouch)."""
    c = Canvas(48, 64, HERO)
    ox, oy = 8, 8
    hip = (ox + CX, oy + HIP_Y + drop)
    lg = Canvas(48, 64, HERO)
    lg.stamp(leg((hip[0] - 1.2, hip[1]), *far, near=False))
    lg.stamp(part(48, 64, HERO, lambda p: p.ellipse(hip[0], hip[1] - 0.5, 4.6, 2.8, 'R')))
    lg.stamp(leg((hip[0] + 1.2, hip[1]), *near, near=True))
    c.stamp(lg, 0, min(0, oy + 48 - lg.bbox()[3]))
    return c.crop(ox, oy + 16, 32, 32)

def rifle(c, f):
    f.rect(c, -3, -0.6, 0, 2.0, 'Y')            # stock
    f.rect(c, -0.5, -1.8, 6.5, 1.6, 'y')        # body
    f.rect(c, -0.5, 0.5, 6.5, 1.6, 'Y')
    f.rect(c, 6, -0.9, 10, 0.7, 'g')            # barrel
    f.rect(c, 9.6, -1.5, 11, 1.3, 'r')          # muzzle ring

AIMS = {'fwd': (18, 23, 0), 'upfwd': (17.5, 20.5, 45), 'up': (20.5, 18.5, 90), 'dnfwd': (17, 25, -45)}

def torso(aimname):
    """Torso sprite (32x32) for one aim direction."""
    ox, oy, ang = AIMS[aimname]
    c = Canvas(48, 64, HERO)
    X, Y = 8, 8
    f = Frame(X + ox, Y + oy, ang)
    # backpack
    def pack(p):
        p.rect(X + 4, Y + 20, 4, 9, 'g').rect(X + 4, Y + 20, 4, 2, 'w').rect(X + 4, Y + 26, 4, 3, 'G')
        p.rect(X + 5, Y + 23, 2, 1, 'y')
    c.stamp(part(48, 64, HERO, pack))
    c.line(X + 6, Y + 19, X + 8, Y + 15, 'k')
    c.stamp(from_grid(TORSO, HERO), X + 7, Y + 17)
    c.stamp(from_grid(HELMET, HERO), X + 8, Y + 5)
    # rifle, then far glove on the fore-grip
    c.stamp(part(48, 64, HERO, lambda p: rifle(p, f)))
    h2 = f.pt(5.5, 1.6)
    c.stamp(part(48, 64, HERO, lambda p: p.circle(*h2, 1.5, 'g')))
    # near arm: shoulder -> grip
    s1 = (X + 12, Y + 21.5)
    h1 = f.pt(0.5, 1.4)
    e1 = ik2(*s1, *h1, 4.6, 4.6, 1)
    def arm(p):
        p.capsule(*s1, *e1, 2.1, 1.8, 'r')
        p.capsule(*e1, *h1, 1.8, 1.5, 'r')
        p.edge('r', 'o', 0, -1)
        p.edge('r', 'R', 0, 1)
    c.stamp(part(48, 64, HERO, arm))
    c.stamp(part(48, 64, HERO, lambda p: p.circle(*h1, 1.7, 'w').edge('w', 'g', 0, 1)))
    return c.crop(X, Y + 4, 32, 32)

def muzzle(aimname):
    """Muzzle tip relative to (body centre x, soles): for bullet spawns."""
    ox, oy, ang = AIMS[aimname]
    x, y = Frame(ox, oy, ang).pt(12, 0)
    return round(x - CX), round(y - 48)

RUN = [(35, 5), (20, 30), (-5, 20), (-26, 10), (-26, 78), (-5, 110), (30, 90), (45, 40)]
BOB = [0, 1, 0, -1, 0, 1, 0, -1]
LEGS = [legs((12, 10), (-12, 4))] + [legs(RUN[i], RUN[(i + 4) % 8]) for i in range(8)] + \
       [legs((75, 100), (-20, 95), drop=8)]
L_IDLE, L_RUN, L_CROUCH = 0, 1, 9
CROUCH_DROP = 8
AIM_ORDER = ['fwd', 'upfwd', 'up', 'dnfwd']
TORSOS = [torso(a) for a in AIM_ORDER]

def composite(t, l, tdy=0):
    c = Canvas(32, 48, HERO)
    c.stamp(l, 0, 16)
    c.stamp(t, 0, 4 + tdy)
    return c

def ball():
    c = Canvas(32, 32, HERO)
    hip = (13, 21)
    sh = (16, 12)
    c.stamp(part(32, 32, HERO, lambda p: (p.rect(8, 11, 4, 7, 'g'), p.rect(8, 11, 4, 2, 'w'))))
    def far(p):
        k = (hip[0] + 6.5, hip[1] - 4.5)
        p.capsule(*hip, *k, 2.6, 2.2, 'R')
        p.capsule(*k, k[0] - 1.5, k[1] + 6.5, 2.1, 1.9, 'g')
    c.stamp(part(32, 32, HERO, far), -1, -2)
    def body(p):
        p.capsule(*hip, *sh, 4.6, 4.4, 'r')
        p.edge('r', 'o', 0, -1)
        p.edge('r', 'R', 0, 1, depth=2)
    c.stamp(part(32, 32, HERO, body))
    c.stamp(from_grid(HELMET, HERO), 13, 3)
    def near(p):
        k = (hip[0] + 7.5, hip[1] - 3)
        a = (k[0] - 2.5, k[1] + 6.5)
        p.capsule(*hip, *k, 2.8, 2.3, 'r')
        p.edge('r', 'o', 0, -1)
        p.capsule(*k, *a, 2.2, 2.0, 'w')
        p.capsule(*a, a[0] + 3, a[1] + 0.5, 1.7, 1.4, 'w')
        p.edge('w', 'g', 0, 1)
        p.circle(k[0] + 0.5, k[1] - 0.5, 1.7, 'y')
    c.stamp(part(32, 32, HERO, near))
    def arm(p):
        p.capsule(sh[0], sh[1] + 2, 20, 19, 1.9, 1.6, 'r')
        p.circle(20.5, 19.5, 1.7, 'w')
    c.stamp(part(32, 32, HERO, arm))
    return c

BALL0 = ball()
BALLS = [BALL0, rot90(BALL0, 3)]              # 0 and 90 degrees clockwise; 180/270 are HV flips
def lying():
    r = rot90(composite(TORSOS[0], LEGS[0]), 1)
    c = Canvas(64, 32, HERO)
    x0, y0, x1, y1 = r.bbox()
    c.stamp(r.crop(x0, y0, x1 - x0, y1 - y0), 8, 32 - (y1 - y0))
    return c
LYING = lying()

if __name__ == '__main__':
    out = os.path.join(os.path.dirname(__file__), '..', 'out')
    comps = [composite(TORSOS[0], LEGS[0])] + [composite(TORSOS[0], LEGS[1 + i], BOB[i]) for i in range(8)]
    aims = [composite(TORSOS[i], LEGS[0]) for i in range(0, 4)] + [composite(TORSOS[0], LEGS[9], CROUCH_DROP)]
    sheet(comps, out + '/hero_run.png', 6, cols=9)
    sheet(aims + BALLS, out + '/hero_aim.png', 7, cols=7)
    gif([composite(TORSOS[0], LEGS[1 + i], BOB[i]) for i in range(8)], out + '/hero_run.gif', 70, 8)
    for i, f in enumerate(LEGS + TORSOS + BALLS):
        for m in lint_sprite(f, HERO, name=f'hero{i}', allow_orphans=12):
            print(m)
    print({a: muzzle(a) for a in AIM_ORDER})
