"""importer: bring a painted or generated RGBA image onto a drawn .px sheet by
mapping every pixel to the nearest colour of a fixed palette. For small things
(explosions, bullets, pickups) that should sit in a shared 15-colour palette."""
import numpy as np
from pixelstudio import Canvas, T, rgb24
import palettes


def to_canvas(a, pal):
    """a: (h, w, 4) uint8 RGBA -> Canvas in pal's colours (alpha < 128 = transparent)."""
    cols = [rgb24(c) for c in pal.colors]
    c = Canvas(a.shape[1], a.shape[0], pal)
    lut = {}
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3] >= 128:
                k = tuple(int(v) for v in a[y, x, :3])
                if k not in lut:
                    lut[k] = pal.colors[palettes.nearest(k, cols)]
                c.a[y, x] = lut[k]
    return c
