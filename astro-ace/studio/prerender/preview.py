"""Quick look at the 3D hero: big render through the same palette pipeline."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ace3d as A
from mathutils import Vector
import style
from pixelstudio import Canvas, to_image
from px import Sheet
ppu = float(sys.argv[1]) if len(sys.argv) > 1 else 100
A.PPU, A.SS = ppu, (2 if ppu > 50 else 6)
A.reset(); A.build(); cam, clay, lights = A.setup_scene()
poses = {'idle': dict(), 'run': dict(legs=((35, 10, -10), (-40, 30, 25)), lean=8), 'dn': dict(aim=-45), 'pass': dict(legs=((0, 20, 0), (25, 100, 20)), lean=8), 'up': dict(aim=90), 'upfwd': dict(aim=45)}
names = sys.argv[2].split(',') if len(sys.argv) > 2 else ['idle']
ims = []
for n in names:
    J, pts = A.pose(**poses[n])
    w, h = int(2.4 * ppu), int(2.6 * ppu)
    w -= w % 2; h -= h % 2
    rows, proj = A.sprite(cam, clay, lights, J, pts, set(A.GROUPS), w, h, (int(0.9 * ppu), h - 4), (0, 0), 'pv_' + n)
    s = Sheet(); f = s.put(n, rows)
    ims.append(to_image(s.canvas(f, style.ACE), max(1, int(400 // h)) if ppu <= 50 else 1, '#583088'))
from PIL import Image
o = Image.new('RGB', (sum(i.width for i in ims), ims[0].height))
x = 0
for i in ims:
    o.paste(i, (x, 0)); x += i.width
o.save(A.TMP + '/preview.png'); print(A.TMP + '/preview.png', o.size)
