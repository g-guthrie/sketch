"""Record the ROM with scripted input. usage: record.py rom script.txt out.gif [sheet.png] [every]
Script lines: 'N KEYS' = hold KEYS (e.g. RIGHT+B, or - for none) for N frames."""
import sys, os, subprocess, glob, tempfile
from PIL import Image
rom, script, out = sys.argv[1:4]
sheet = sys.argv[4] if len(sys.argv) > 4 else None
every = int(sys.argv[5]) if len(sys.argv) > 5 else 2
tmp = tempfile.mkdtemp()
lines = []
for i, l in enumerate(open(script)):
    l = l.split('#')[0].split()
    if not l: continue
    n, k = int(l[0]), (l[1] if len(l) > 1 and l[1] != '-' else '')
    lines.append(f'rec {tmp}/{i:04d}_ {n} {every} {k}'.rstrip())
open(tmp + '/s.txt', 'w').write('\n'.join(lines) + '\n')
subprocess.run([os.path.join(os.path.dirname(__file__), 'shot'), rom, tmp + '/s.txt'], check=True)
fs = sorted(glob.glob(tmp + '/*.ppm'))
ims = [Image.open(f).convert('RGB') for f in fs]
big = [i.resize((480, 320), Image.NEAREST) for i in ims]
big[0].save(out, save_all=True, append_images=big[1:], duration=int(1000 / 60 * every), loop=0)
if sheet:
    n = 12
    pick = [ims[int(j * (len(ims) - 1) / (n - 1))] for j in range(n)]
    o = Image.new('RGB', (244 * 4, 164 * 3), (24, 24, 28))
    for i, im in enumerate(pick):
        o.paste(im, ((i % 4) * 244 + 2, (i // 4) * 164 + 2))
    o.resize((o.width * 2, o.height * 2), Image.NEAREST).save(sheet)
print(len(ims), 'frames')
