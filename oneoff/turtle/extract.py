#!/usr/bin/env python3
"""Cut the art out of the turtle mockup (separate front and back views of a
green jersey with teal raglan sleeves, on grey) into WORKDIR:
  front.png, back.png   each view as RGBA: the view's pixels inside the art
                        boxes where they differ from the green (dilated
                        ART_PAD px, so antialiased edges come along), alpha 0
                        elsewhere. The art sits on the same green design.mjs
                        paints, so the edges need no matte.
  back-turtle.png,      the back's turtle on a bicycle and pocket logo the
  back-logo.png         same way, left out of back.png, since design.mjs
                        scales and moves them on their own
  art.json              each piece's tight box (x0, y0, x1, y1, exclusive)
  colours.json          green and teal: medians of plain body below the art
                        and of the left sleeve, averaged over the views
  extract.py FRONT BACK WORKDIR"""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage
srcF, srcB, work = sys.argv[1:4]
ART_PAD = 4
# layer: piece: x0, y0, x1, y1 in image px
BOXES = {
    'front': {'logo': (905, 433, 1104, 601),
              'lettering': (838, 674, 1563, 833),
              'turtle': (1140, 860, 1530, 1321)},  # with coffee, steam included
    'back': {'lettering': (883, 356, 1517, 498)},
    'back-turtle': {'turtle': (898, 515, 1587, 1152)},  # on a bicycle
    'back-logo': {'logo': (1092, 1246, 1309, 1430)},
}
col, art = {}, {}
for name, src in (('front', srcF), ('back', srcB), ('back-turtle', srcB), ('back-logo', srcB)):
    A = np.asarray(Image.open(src).convert('RGB')).astype(float)
    # Green: the body down the centre column between the art; teal: the sleeves.
    green = np.median(A[1440:1490, 1150:1250].reshape(-1, 3), 0)
    teal = np.median(A[450:550, 450:550].reshape(-1, 3), 0)
    far = np.abs(A - green).sum(2) > 45
    mask = np.zeros(far.shape, bool)
    for piece, (x0, y0, x1, y1) in BOXES[name].items():
        m = np.zeros_like(mask); m[y0:y1, x0:x1] = far[y0:y1, x0:x1]
        mask |= ndimage.binary_dilation(m, iterations=ART_PAD)
        ys, xs = np.nonzero(m)
        art[f'{name.split("-")[0]}.{piece}'] = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    out = np.dstack([A, mask * 255.0]).round().astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(f'{work}/{name}.png')
    if name != 'front' and name != 'back':
        continue
    col[name + 'Green'], col[name + 'Teal'] = green.round().tolist(), teal.round().tolist()
    print(name, 'green', col[name + 'Green'], 'teal', col[name + 'Teal'], 'art px', int(mask.sum()))
col['green'] = np.round((np.array(col['frontGreen']) + col['backGreen']) / 2).tolist()
col['teal'] = np.round((np.array(col['frontTeal']) + col['backTeal']) / 2).tolist()
json.dump(col, open(f'{work}/colours.json', 'w'), indent=1)
json.dump(art, open(f'{work}/art.json', 'w'), indent=1)
print(art)
