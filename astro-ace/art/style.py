"""STYLE BIBLE: ASTRO ACE No.1 (pulp sci-fi comic).

Rules every asset follows:
 1. INK: one ink colour (#181020) outlines every sprite and every playfield
    object. Silhouettes are fully closed. No pure black anywhere.
 2. PRINT LOOK: shading is flat colour + ONE shadow tone. Soft transitions
    are made with Ben-Day dots (tone/gradient tools), never smooth blends.
 3. LIGHT comes from above, so sprites can be mirrored without the light
    flipping. Highlights on top edges, shadow tone on bottom edges.
 4. DEPTH: far layer = cool, low contrast, no ink. Mid layer = two flat
    purple planes. Playfield = warm, full ink. Sprites = most saturated.
 5. PAPER: gutters are warm paper (#f8f0d8), panel borders are 2px ink.
 6. HARDWARE: 15 colours per palette, each 8x8 tile uses one palette.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'studio'))
from pixelstudio import *

INK = '#181020'
PAPER = '#f8f0d8'

HERO = Palette('hero', [
    ('k', 'ink', INK),
    ('w', 'white', '#f8f8f0'), ('g', 'grey', '#a8b0c8'), ('G', 'dgrey', '#606888'),
    ('o', 'suit_hi', '#f87050'), ('r', 'suit', '#e02828'), ('R', 'suit_sh', '#901038'),
    ('s', 'skin', '#f8c090'), ('S', 'skin_sh', '#d07850'), ('h', 'hair', '#783818'),
    ('c', 'glass', '#b0f0f0'), ('C', 'glass_sh', '#50b0d8'),
    ('y', 'gold', '#f8d828'), ('Y', 'gold_sh', '#d08010'),
])

# v2 hero: four-step suit ramp, four-step armour ramp, hand-pixelled sheets
ACE = Palette('ace', [
    ('k', 'ink', INK),
    ('o', 'suit_hi', '#f88058'), ('r', 'suit', '#e02c30'), ('R', 'suit_sh', '#a01838'), ('D', 'deep', '#58182c'),
    ('w', 'white', '#f8f8f0'), ('g', 'grey', '#b0b8d8'), ('G', 'dgrey', '#6870a0'), ('d', 'slate', '#343058'),
    ('s', 'skin', '#f8c898'), ('S', 'skin_sh', '#d08058'),
    ('c', 'glass', '#b8f4f0'), ('C', 'glass_sh', '#58b8e0'),
    ('y', 'gold', '#f8d838'), ('Y', 'gold_sh', '#d08818'),
])

ROBOT = Palette('robot', [
    ('k', 'ink', INK),
    ('a', 'metal_hi', '#b0e8c8'), ('b', 'metal', '#58b898'), ('c', 'metal_sh', '#287870'), ('d', 'metal_dk', '#184858'),
    ('p', 'purple', '#9858c8'), ('P', 'purple_sh', '#582888'),
    ('e', 'eye', '#f83030'), ('E', 'eye_hi', '#f8b8a0'),
    ('y', 'gold', '#f8d828'), ('Y', 'gold_sh', '#d08010'),
    ('w', 'white', '#f8f8f0'), ('g', 'grey', '#8890a8'),
])

ROBOT_RED = Palette('robot_red', [
    ('k', 'ink', INK),
    ('a', 'metal_hi', '#f8b8a0'), ('b', 'metal', '#e05048'), ('c', 'metal_sh', '#a02040'), ('d', 'metal_dk', '#601030'),
    ('p', 'purple', '#98a8c0'), ('P', 'purple_sh', '#586890'),
    ('e', 'eye', '#f8e040'), ('E', 'eye_hi', '#f8f8b0'),
    ('y', 'gold', '#f8d828'), ('Y', 'gold_sh', '#d08010'),
    ('w', 'white', '#f8f8f0'), ('g', 'grey', '#8890a8'),
])

BOSS = Palette('boss', [
    ('k', 'ink', INK),
    ('a', 'steel_hi', '#d0c8e8'), ('b', 'steel', '#8880c0'), ('c', 'steel_sh', '#504890'), ('d', 'steel_dk', '#282058'),
    ('1', 'red_hi', '#f87058'), ('r', 'red', '#d02038'), ('R', 'red_sh', '#801038'),
    ('y', 'gold', '#f8d828'), ('Y', 'gold_sh', '#d08010'),
    ('e', 'hot', '#f8f8b0'), ('o', 'orange', '#f89020'),
    ('t', 'teal', '#40d0c0'), ('w', 'white', '#f8f8f0'),
])

BOSS_HOT = Palette('boss_hot', [
    ('k', 'ink', INK),
    ('a', 'steel_hi', '#f8e0a0'), ('b', 'steel', '#f08840'), ('c', 'steel_sh', '#b83030'), ('d', 'steel_dk', '#601830'),
    ('1', 'red_hi', '#f8f8b0'), ('r', 'red', '#f8c038'), ('R', 'red_sh', '#d06018'),
    ('y', 'gold', '#f8f0a0'), ('Y', 'gold_sh', '#f8a828'),
    ('e', 'hot', '#f8f8f0'), ('o', 'orange', '#f8e040'),
    ('t', 'teal', '#40d0c0'), ('w', 'white', '#f8f8f0'),
])

FX = Palette('fx', [
    ('k', 'ink', INK),
    ('w', 'white', '#f8f8f0'), ('y', 'yellow', '#f8e040'), ('o', 'orange', '#f89020'),
    ('r', 'red', '#e02828'), ('R', 'dred', '#901038'),
    ('c', 'cyan', '#90f0f8'), ('C', 'blue', '#30a0e8'),
    ('p', 'paper', PAPER), ('m', 'magenta', '#e040a0'),
    ('e', 'pale', '#f8f8b0'), ('Y', 'amber', '#d08010'),
    ('g', 'smoke', '#b0a8a0'), ('G', 'smoke_sh', '#685c70'), ('d', 'soot', '#3c3048'),
])

SKY = Palette('sky', [
    ('n', 'navy', '#101848'), ('i', 'indigo', '#282878'), ('v', 'violet', '#5830a0'),
    ('m', 'magenta', '#a03898'), ('c', 'coral', '#e85870'), ('o', 'orange', '#f89850'),
    ('y', 'yellow', '#f8d878'),
    ('a', 'planet_hi', '#90e0d0'), ('b', 'planet', '#40a8b0'), ('d', 'planet_sh', '#206888'),
    ('r', 'ring', '#f8e8b8'), ('w', 'star', '#f8f8f0'),
])

MID = Palette('mid', [
    ('1', 'near_sh', '#382060'), ('2', 'near', '#583088'), ('3', 'near_hi', '#8048a0'),
    ('4', 'far', '#9050a0'), ('5', 'far_hi', '#c070a8'),
    ('y', 'lamp', '#f8d878'), ('o', 'lamp_sh', '#f89850'),
    ('c', 'glow', '#90e0d0'),
])

GROUND = Palette('ground', [
    ('k', 'ink', INK),
    ('1', 'sand_hi', '#f8c878'), ('2', 'sand', '#e08840'), ('3', 'rust', '#b04830'), ('4', 'maroon', '#702840'),
    ('a', 'steel_hi', '#d8e0e8'), ('b', 'steel', '#98a8c0'), ('c', 'steel_sh', '#586890'), ('d', 'steel_dk', '#303860'),
    ('x', 'crystal_hi', '#b0f8e8'), ('t', 'crystal', '#40d0c0'), ('T', 'crystal_sh', '#189090'),
    ('w', 'white', '#f8f8f0'), ('e', 'red', '#e02828'), ('y', 'gold', '#f8d828'),
])

FRAME = Palette('frame', [
    ('p', 'paper', PAPER), ('k', 'ink', INK),
    ('y', 'caption', '#f8e070'), ('Y', 'caption_sh', '#d8a838'),
    ('r', 'red', '#e02828'), ('w', 'white', '#f8f8f0'), ('g', 'grey', '#a8a090'),
    ('1', 'b_hi', '#f85840'), ('2', 'b_mid', '#b01840'), ('3', 'b_dk', '#600830'),
    ('e', 'b_eye', '#b0f860'), ('E', 'b_eye_sh', '#38b048'),
])

FOUNDRY = Palette('foundry', [
    ('k', 'ink', INK),
    ('1', 'molten_hi', '#f8f0a0'), ('2', 'molten', '#f8a828'), ('3', 'molten_sh', '#e05018'), ('4', 'ember', '#902030'),
    ('a', 'steel_hi', '#d8e0e8'), ('b', 'steel', '#98a8c0'), ('c', 'steel_sh', '#586890'), ('d', 'steel_dk', '#303860'),
    ('p', 'copper', '#d08848'), ('P', 'copper_sh', '#804030'),
    ('y', 'hazard', '#f8d828'), ('w', 'white', '#f8f8f0'),
    ('m', 'streak_a', '#f8e890'), ('n', 'streak_b', '#f8b838'),
])
F_MID = Palette('f_mid', [
    ('1', 'near_sh', '#141030'), ('2', 'near', '#241c48'), ('3', 'near_hi', '#403870'),
    ('4', 'far', '#382850'), ('5', 'far_hi', '#583860'),
    ('y', 'glow', '#f8d878'), ('o', 'glow_sh', '#f88838'), ('r', 'glow_dk', '#b03828'),
])
F_FAR = Palette('f_far', [
    ('n', 'black', '#100c20'), ('i', 'indigo', '#201030'), ('v', 'wine', '#401838'),
    ('m', 'maroon', '#702030'), ('c', 'red', '#a83028'), ('o', 'orange', '#e06020'),
    ('g', 'shape', '#2c1c40'), ('h', 'shape_hi', '#48284c'),
])

# v2 boss: every Guardian part shares this palette so one swap reforges the whole machine
GUARD = Palette('guard', [
    ('k', 'ink', INK),
    ('a', 'steel_hi', '#d8d4f0'), ('b', 'steel', '#9890c8'), ('c', 'steel_sh', '#5c5498'), ('d', 'steel_dk', '#302860'),
    ('1', 'red_hi', '#f87058'), ('r', 'red', '#d02038'), ('R', 'red_sh', '#801038'),
    ('y', 'gold', '#f8d828'), ('Y', 'gold_sh', '#d08010'),
    ('e', 'hot', '#f8f8b0'), ('o', 'orange', '#f89020'),
    ('t', 'teal', '#40d0c0'), ('T', 'teal_sh', '#187880'), ('w', 'white', '#f8f8f0'),
])
GUARD_HOT = Palette('guard_hot', [
    ('k', 'ink', INK),
    ('a', 'steel_hi', '#f8e0a0'), ('b', 'steel', '#f08840'), ('c', 'steel_sh', '#b83030'), ('d', 'steel_dk', '#601830'),
    ('1', 'red_hi', '#f8f8b0'), ('r', 'red', '#f8c038'), ('R', 'red_sh', '#d06018'),
    ('y', 'gold', '#f8f0a0'), ('Y', 'gold_sh', '#f8a828'),
    ('e', 'hot', '#f8f8f0'), ('o', 'orange', '#f8e040'),
    ('t', 'teal', '#f8f8b0'), ('T', 'teal_sh', '#f89020'), ('w', 'white', '#f8f8f0'),
])
# v2 troopers and machines of the robot army
MECH = Palette('mech', [
    ('k', 'ink', INK),
    ('a', 'metal_hi', '#c0f0d0'), ('b', 'metal', '#60c0a0'), ('c', 'metal_sh', '#2c8078'), ('d', 'metal_dk', '#184858'),
    ('p', 'purple', '#a060d0'), ('P', 'purple_sh', '#5c2c90'),
    ('e', 'eye', '#f83030'), ('E', 'eye_hi', '#f8b8a0'),
    ('y', 'gold', '#f8d828'), ('Y', 'gold_sh', '#d08010'),
    ('w', 'white', '#f8f8f0'), ('g', 'grey', '#98a0b8'), ('G', 'dgrey', '#505878'), ('o', 'orange', '#f89020'),
])
MECH_RED = Palette('mech_red', [
    ('k', 'ink', INK),
    ('a', 'metal_hi', '#f8c0a8'), ('b', 'metal', '#e05848'), ('c', 'metal_sh', '#a02440'), ('d', 'metal_dk', '#601030'),
    ('p', 'purple', '#a0b0c8'), ('P', 'purple_sh', '#586890'),
    ('e', 'eye', '#f8e040'), ('E', 'eye_hi', '#f8f8b0'),
    ('y', 'gold', '#f8d828'), ('Y', 'gold_sh', '#d08010'),
    ('w', 'white', '#f8f8f0'), ('g', 'grey', '#98a0b8'), ('G', 'dgrey', '#505878'), ('o', 'orange', '#f89020'),
])

PALETTES = {}
def register(*pals):
    for p in pals:
        PALETTES[p.name] = p

def recolor(pal, name, table):
    """Same slots and keys, new colours: a palette-swap variant of a scene."""
    return Palette(name, [(k, n, table.get(k, '#%02x%02x%02x' % rgb24(pal[k]))) for (k, n) in pal.names])

SKY_DUSK = recolor(SKY, 'sky_dusk', dict(n='#180818', i='#381028', v='#681830', m='#a02828', c='#d84820', o='#f88020',
                                         y='#f8c850', a='#f8a878', b='#c05048', d='#702038', r='#f8d8a0'))
MID_DUSK = recolor(MID, 'mid_dusk', {'1': '#200818', '2': '#401028', '3': '#782030', '4': '#702838', '5': '#b04038', 'c': '#f8a070'})
GROUND_DUSK = recolor(GROUND, 'ground_dusk', {'1': '#f8a060', '2': '#d05830', '3': '#902830', '4': '#501028',
                                              'a': '#f0d0c0', 'b': '#b89098', 'c': '#785070', 'd': '#402048'})

register(GUARD, GUARD_HOT, MECH, MECH_RED)
register(ACE, HERO, ROBOT, ROBOT_RED, BOSS, BOSS_HOT, FX, SKY, MID, GROUND, FRAME, FOUNDRY, F_MID, F_FAR)

RAMPS = {
    ACE: [('D', 'R', 'r', 'o'), ('d', 'G', 'g', 'w'), ('S', 's'), ('Y', 'y'), ('C', 'c')],
    GUARD: [('d', 'c', 'b', 'a'), ('R', 'r', '1'), ('Y', 'y'), ('o', 'e'), ('T', 't')],
    MECH: [('d', 'c', 'b', 'a'), ('P', 'p'), ('Y', 'y'), ('G', 'g', 'w')],
    FX: [('R', 'r', 'o', 'y', 'e'), ('d', 'G', 'g'), ('C', 'c')],
    HERO: [('R', 'r', 'o'), ('G', 'g', 'w'), ('S', 's'), ('Y', 'y'), ('C', 'c')],
    ROBOT: [('d', 'c', 'b', 'a'), ('P', 'p'), ('Y', 'y')],
    SKY: [('n', 'i', 'v', 'm', 'c', 'o', 'y'), ('d', 'b', 'a')],
    MID: [('1', '2', '3'), ('4', '5')],
    GROUND: [('4', '3', '2', '1'), ('d', 'c', 'b', 'a'), ('T', 't', 'x')],
    FRAME: [('3', '2', '1'), ('Y', 'y')],
}

# 5x7 comic caps
_F = """
A .###. #...# #...# ##### #...# #...# #...#
B ####. #...# #...# ####. #...# #...# ####.
C .#### #.... #.... #.... #.... #.... .####
D ####. #...# #...# #...# #...# #...# ####.
E ##### #.... #.... ####. #.... #.... #####
F ##### #.... #.... ####. #.... #.... #....
G .#### #.... #.... #..## #...# #...# .####
H #...# #...# #...# ##### #...# #...# #...#
I ### .#. .#. .#. .#. .#. ###
J ..### ...#. ...#. ...#. ...#. #..#. .##..
K #...# #..#. #.#.. ##... #.#.. #..#. #...#
L #.... #.... #.... #.... #.... #.... #####
M #...# ##.## #.#.# #.#.# #...# #...# #...#
N #...# ##..# #.#.# #.#.# #..## #...# #...#
O .###. #...# #...# #...# #...# #...# .###.
P ####. #...# #...# ####. #.... #.... #....
Q .###. #...# #...# #...# #.#.# #..#. .##.#
R ####. #...# #...# ####. #.#.. #..#. #...#
S .#### #.... #.... .###. ....# ....# ####.
T ##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..
U #...# #...# #...# #...# #...# #...# .###.
V #...# #...# #...# #...# .#.#. .#.#. ..#..
W #...# #...# #...# #.#.# #.#.# ##.## #...#
X #...# #...# .#.#. ..#.. .#.#. #...# #...#
Y #...# #...# .#.#. ..#.. ..#.. ..#.. ..#..
Z ##### ....# ...#. ..#.. .#... #.... #####
0 .###. #...# #..## #.#.# ##..# #...# .###.
1 .#. ##. .#. .#. .#. .#. ###
2 .###. #...# ....# ..##. .#... #.... #####
3 ####. ....# ....# .###. ....# ....# ####.
4 #..#. #..#. #..#. ##### ...#. ...#. ...#.
5 ##### #.... ####. ....# ....# #...# .###.
6 .###. #.... #.... ####. #...# #...# .###.
7 ##### ....# ...#. ..#.. ..#.. ..#.. ..#..
8 .###. #...# #...# .###. #...# #...# .###.
9 .###. #...# #...# .#### ....# ....# .###.
! # # # # # . #
. . . . . . . #
, .. .. .. .. .. .# #.
- .... .... .... #### .... .... ....
' # # . . . . .
< ... ..# .#. #.. .#. ..# ...
> ... #.. .#. ..# .#. #.. ...
/ ....# ....# ...#. ..#.. .#... #.... #....
" #.# #.# ... ... ... ... ...
? .###. #...# ....# ..##. ..#.. ..... ..#..
# .#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.
: . . # . . # .
"""
FONT = {}
for _l in _F.strip().split('\n'):
    _p = _l.split()
    FONT[_p[0]] = _p[1:]


def part(w, h, pal, draw, ink='k'):
    """Rig part: draw on a scratch canvas, close it with an ink outline."""
    c = Canvas(w, h, pal)
    draw(c)
    c.outline(ink)
    return c


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(__file__), '..', 'out')
    probs = []
    for p, r in RAMPS.items():
        probs += lint_palette(p, r)
    print('\n'.join(probs) or 'palettes ok')
    swatches([HERO, ROBOT, FX, SKY, MID, GROUND, FRAME], out + '/palettes.png')
    c = Canvas(200, 24, FRAME)
    c.rect(0, 0, 200, 24, 'y')
    c.text("MEANWHILE, ON PLANET ZORB-9!", 3, 3, 'k', FONT)
    c.text("0123456789 #1 ACE'S QUEST?", 3, 13, 'k', FONT)
    save(c, out + '/font.png', 4)
