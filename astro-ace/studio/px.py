"""px: hand-drawn pixel sheets.

A .px file is the studio's graph paper. Every frame is a text grid, one
character per pixel, each character a key of the sheet's 15-colour palette.
Nothing in a sheet is generated at build time: what is typed is what ships.

    sheet hero_top
    palette hero
    cell 40 40                # default frame size
    anchor 16 39              # default anchor (where the engine pins the frame)

    frame fwd
      point muzzle 38 17      # named points travel with the frame (bullet spawns, joints)
      box hurt 9 6 14 30      # named boxes: x y w h
      dur 6                   # ticks at 60 Hz when the frame is used in an animation
    (sheet level)  open bottom  # this edge joins another sprite, so it carries no outline
      00|........kkkk........|
      01|.......kcwwck.......|

Rows are `NN|pixels|`. The bars make a short or long row a parse error, so a
slipped column can never silently shear a drawing. Ruler lines are ignored and
are rewritten by `save`.
"""
import os, re
import numpy as np
from pixelstudio import Canvas, T

ROW = re.compile(r'^\s*\d*\|(.*)\|\s*$')


class Frame:
    def __init__(self, name, w, h):
        self.name, self.w, self.h = name, w, h
        self.rows, self.points, self.boxes = [], {}, {}
        self.anchor, self.dur, self.note = None, None, None

    def grid(self):
        return [list(r) for r in self.rows]


class Sheet:
    def __init__(self, path=None):
        self.path, self.name, self.palette = path, None, None
        self.cell, self.anchor, self.frames, self.open = (32, 32), (0, 0), [], []
        if path and os.path.exists(path):
            self._parse(open(path).read())

    # ------------------------------------------------------------ parse
    def _parse(self, text):
        f = None
        for n, line in enumerate(text.split('\n'), 1):
            m = ROW.match(line)
            if m:
                if f is None:
                    raise SyntaxError(f'{self.path}:{n}: pixel row outside a frame')
                if len(m.group(1)) != f.w:
                    raise SyntaxError(f'{self.path}:{n}: frame {f.name} row {len(f.rows)} is '
                                      f'{len(m.group(1))} wide, expected {f.w}')
                f.rows.append(m.group(1))
                continue
            s = line.split('#')[0].split()
            if not s:
                continue
            k = s[0]
            if k == 'frame':
                f = Frame(s[1], *self.cell)
                self.frames.append(f)
            elif k == 'size' and f:
                f.w, f.h = int(s[1]), int(s[2])
            elif k == 'anchor':
                v = (int(s[1]), int(s[2]))
                if f: f.anchor = v
                else: self.anchor = v
            elif k == 'point' and f:
                f.points[s[1]] = (int(s[2]), int(s[3]))
            elif k == 'box' and f:
                f.boxes[s[1]] = tuple(int(v) for v in s[2:6])
            elif k == 'dur' and f:
                f.dur = int(s[1])
            elif k == 'open':
                self.open = s[1:]                           # edges that join another sprite: top bottom left right
            elif k == 'sheet':
                self.name = s[1]
            elif k == 'palette':
                self.palette = s[1]
            elif k == 'cell':
                self.cell = (int(s[1]), int(s[2]))
            elif re.match(r'^[\d\s]+$', line):
                continue                                    # ruler
            else:
                raise SyntaxError(f'{self.path}:{n}: cannot read "{line.strip()}"')
        for f in self.frames:
            if len(f.rows) != f.h:
                raise SyntaxError(f'{self.path}: frame {f.name} has {len(f.rows)} rows, expected {f.h}')

    # ------------------------------------------------------------ access
    def __getitem__(self, name):
        for f in self.frames:
            if f.name == name:
                return f
        raise KeyError(f'{self.path}: no frame {name}')

    def __contains__(self, name):
        return any(f.name == name for f in self.frames)

    def names(self):
        return [f.name for f in self.frames]

    def anchor_of(self, f):
        return f.anchor or self.anchor

    def canvas(self, name, pal):
        """Frame -> studio Canvas in real 15-bit colours."""
        f = self[name] if isinstance(name, str) else name
        c = Canvas(f.w, f.h, pal)
        for y, r in enumerate(f.rows):
            for x, ch in enumerate(r):
                if ch != '.':
                    if ch not in pal.key:
                        raise KeyError(f'{self.path}: frame {f.name} ({x},{y}): "{ch}" is not in palette {pal.name}')
                    c.a[y, x] = pal[ch]
        return c

    # ------------------------------------------------------------ write
    def put(self, name, canvas_or_rows, pal=None, after=None):
        """Store a frame from a Canvas (colours mapped back to keys) or rows."""
        if isinstance(canvas_or_rows, Canvas):
            cv = canvas_or_rows
            inv = {c: k for (k, _), c in zip(pal.names, pal.colors)}
            rows = [''.join('.' if v == T else inv[int(v)] for v in r) for r in cv.a]
        else:
            rows = list(canvas_or_rows)
        if name in self:
            f = self[name]
        else:
            f = Frame(name, len(rows[0]), len(rows))
            i = self.names().index(after) + 1 if after else len(self.frames)
            self.frames.insert(i, f)
        f.w, f.h, f.rows = len(rows[0]), len(rows), rows
        return f

    def save(self, path=None):
        path = path or self.path
        o = [f'sheet {self.name}', f'palette {self.palette}', f'cell {self.cell[0]} {self.cell[1]}',
             f'anchor {self.anchor[0]} {self.anchor[1]}'] + ([f"open {' '.join(self.open)}"] if self.open else []) + ['']
        for f in self.frames:
            o.append(f'frame {f.name}')
            if (f.w, f.h) != self.cell:
                o.append(f'  size {f.w} {f.h}')
            if f.anchor:
                o.append(f'  anchor {f.anchor[0]} {f.anchor[1]}')
            for k, v in f.points.items():
                o.append(f'  point {k} {v[0]} {v[1]}')
            for k, v in f.boxes.items():
                o.append(f'  box {k} {v[0]} {v[1]} {v[2]} {v[3]}')
            if f.dur:
                o.append(f'  dur {f.dur}')
            if f.w >= 10:
                o.append('     ' + ''.join(str(x // 10 % 10) if x % 10 == 0 else ' ' for x in range(f.w)))
            o.append('     ' + ''.join(str(x % 10) for x in range(f.w)))
            for y, r in enumerate(f.rows):
                o.append(f'  {y:02d}|{r}|')
            o.append('')
        open(path, 'w').write('\n'.join(o))


def blank(w, h):
    return ['.' * w for _ in range(h)]
