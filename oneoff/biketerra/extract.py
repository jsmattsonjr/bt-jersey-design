#!/usr/bin/env python3
"""Cut the Biketerra x TBB mockup (separate front and back views on white)
into the pieces design.mjs paints with, in WORKDIR:
  front.png, back.png   each view as RGBA, alpha 0 off the jersey: the white
                        page, and the grey inside of the jersey seen through
                        the neck and below the front hem. The grey seams, zip,
                        outline and pocket stitching are painted out.
  tbb.png, tbb.json     the front TBB patch, and its centre and width in the view
  sleeve.png            the right sleeve's lettering, reading left to right:
                        the small mountain logo (from the back view's sleeve)
                        and the pocket's "biketerra" in purple, both with a
                        white keyline.
  colours.json          orange, purple
  extract.py FRONT BACK WORKDIR"""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage
srcF, srcB, work = sys.argv[1:4]
load = lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float)
F, B = load(srcF), load(srcB)
disk = lambda r: np.hypot(*np.mgrid[-r:r+1, -r:r+1]) <= r


def clean(A, keep, erase, zip_cols=None):
    """-> (rgb, alpha). The page is the near-white region reached from the
    border. The inside of the jersey (through the neck, below the front hem)
    is the thick low-chroma regions that hold some grey; its gradient runs
    to near white, so white counts there, but the white art is never joined
    to it by a thick path. Lines (seams, zip, outline, stitching) are neutral
    grey; they and their antialiased fringe are filled from their
    surroundings, except in the keep boxes (art with grey line work or
    antialiased edges: the turtle, lettering, the TBB patch). The zip is
    peach on orange, so zip_cols names its columns. The erase boxes (the
    sleeve lettering, which design.mjs redraws) are filled the same way."""
    mx, mn = A.max(2), A.min(2)
    page = ndimage.label(mn > 232)[0]
    edge = np.unique(np.r_[page[0], page[-1], page[:, 0], page[:, -1]])
    page = np.isin(page, edge[edge > 0])
    low = ~page & (mx - mn < 30)
    thick = ndimage.binary_opening(low, disk(5))
    lab, _ = ndimage.label(thick)
    core = ndimage.binary_opening(low & (mn < 225), disk(5))  # thick grey
    big = [i for i in np.unique(lab[core]) if i and (lab == i).sum() > 1500]  # not the zip pull
    inside = np.isin(lab, big)
    cut = ndimage.binary_dilation(inside | page, disk(2))
    # Seams on orange are grey (chroma ~10); stitching on purple is a lilac
    # grey (chroma 25-40, green over 115, where the topo lines are under 100).
    m = A.mean(2)
    seed = (m > 110) & (m < 225) & ((mx - mn < 30) | ((mx - mn < 45) & (A[..., 1] > 115))) & ~inside
    if zip_cols:
        seed[:, zip_cols[0]:zip_cols[1]] = True
    for x0, y0, x1, y1 in keep:
        seed[y0:y1, x0:x1] = False
    line = ndimage.binary_dilation(seed, disk(3)) & ~cut
    for x0, y0, x1, y1 in erase:
        line[y0:y1, x0:x1] |= ~cut[y0:y1, x0:x1]
    # Fill each line pixel with the per-channel median of the clean pixels
    # within R, so it takes the ground or the camo stripe, not a blur of both.
    out, known = A.copy(), ~cut & ~line
    H, W = known.shape
    for R in (5, 8) + (12,) * 20:  # repeat to reach the erase boxes' middles
        ys, xs = np.nonzero(line & ~known)
        if not len(ys): break
        d = np.argwhere(disk(R)) - R
        yy, xx = np.clip(ys[:, None] + d[:, 0], 0, H - 1), np.clip(xs[:, None] + d[:, 1], 0, W - 1)
        v = np.where(known[yy, xx][..., None], out[yy, xx], np.nan)
        ok = ~np.isnan(v[..., 0]).all(1)
        out[ys[ok], xs[ok]] = np.nanmedian(v[ok], axis=1)
        known = known.copy(); known[ys[ok], xs[ok]] = True
    return out, (~cut).astype(float)


KEEP = {  # x0, y0, x1, y1 in image px
    'front': [],
    'back': [(685, 355, 785, 455), (488, 1015, 615, 1095),  # TBB, turtle
             (645, 1030, 830, 1085), (875, 1020, 970, 1092)],  # biketerra, THE BLACK BIBS
}
# The sleeve lettering, and the label inside the back collar (seen through
# the front's neck; the model's front shoulders reach up into it).
# The front TBB patch is redrawn flat by design.mjs (the view's own comes
# out turned by the wrap round the chest).
ERASE = {'front': [(178, 350, 252, 540), (660, 212, 790, 248), (750, 380, 840, 470)], 'back': [(1158, 378, 1252, 568)]}
for name, A, z in (('front', F, (712, 720)), ('back', B, None)):
    rgb, alpha = clean(A, KEEP[name], ERASE[name], z)
    Image.fromarray(np.dstack([rgb, alpha * 255]).round().astype(np.uint8), 'RGBA').save(f'{work}/{name}.png')

# Front TBB patch: the purple square's box, as it is.
a = F[375:475, 745:845]
sq = (a[..., 2] > a[..., 1] + 25) & (a[..., 0] < 190) | (a.min(2) > 200)
sq = ndimage.binary_fill_holes(ndimage.binary_opening(sq, disk(2)))
ys, xs = np.nonzero(sq)
Image.fromarray(a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].round().astype(np.uint8)).save(f'{work}/tbb.png')
json.dump({'x': 745 + (xs.min() + xs.max() + 1) / 2, 'y': 375 + (ys.min() + ys.max() + 1) / 2, 'w': int(xs.max() - xs.min() + 1)}, open(f'{work}/tbb.json', 'w'))
print('tbb box', 745 + xs.min(), 375 + ys.min(), 745 + xs.max(), 375 + ys.max())

PURPLE = [int(v) for v in np.median(B[1150:1170, 500:620].reshape(-1, 3), axis=0)]
ORANGE = [int(v) for v in np.median(B[600:640, 960:990].reshape(-1, 3), axis=0)]
json.dump({'orange': ORANGE, 'purple': PURPLE}, open(f'{work}/colours.json', 'w'))

# Sleeve logo: the back view's small mountain, purple with a white keyline
# on the orange camo (whose light stripes are peach: blue under 200). The
# logo is the connected purple-or-white blob with its holes filled; turned
# clockwise to stand upright.
a = B[470:575, 1150:1250]
ink = (a[..., 2] > a[..., 1] + 25) & (a[..., 0] < 190)
white = a.min(2) > 200
lab, _ = ndimage.label(ndimage.binary_closing(ink | white, disk(1)))
sizes = ndimage.sum(np.ones_like(lab), lab, range(1, lab.max() + 1))
blob = ndimage.binary_fill_holes(lab == 1 + int(np.argmax(sizes)))
# purple at full strength, white where not purple; alpha soft at the rim
alpha = ndimage.gaussian_filter(blob * 1.0, 0.7)
t = np.clip((a[..., 1] - 60) / 150, 0, 1)[..., None]  # 0 purple .. 1 white
rgb = np.array(PURPLE) * (1 - t) + 255 * t
ys, xs = np.nonzero(alpha > 0.02)
logo = np.dstack([rgb, alpha * 255])[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
logo = np.rot90(logo, -1)

# Wordmark: the pocket's white "biketerra" on purple topo, keyed on the
# darkest channel (the topo lines are under 150), recoloured purple with a
# white keyline of KEY x its height.
a = B[1025:1090, 640:830]
w = np.clip((a.min(2) - 150) / 80, 0, 1)
ys, xs = np.nonzero(w > 0.05)
w = w[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
KEY = 0.085
k = max(1, round(KEY * w.shape[0]))
w = np.pad(w, k + 1)
key = ndimage.grey_dilation(w, footprint=disk(k))
rgb = np.array(PURPLE) * w[..., None] + 255 * (1 - w[..., None])
word = np.dstack([rgb, key * 255])

# Lay out: logo then word, word baseline on the logo's foot, logo LOGO_H x
# the word's height (both with keylines), gap GAP x the word's height. As
# measured on the back view's sleeve.
LOGO_H, GAP = 1.55, 0.08
h = word.shape[0]
L = Image.fromarray(logo.round().astype(np.uint8), 'RGBA')
L = L.resize((round(L.width * LOGO_H * h / L.height), round(LOGO_H * h)), Image.LANCZOS)
gap = round(GAP * h)
W = Image.fromarray(word.round().astype(np.uint8), 'RGBA')
out = Image.new('RGBA', (L.width + gap + W.width, L.height), (255, 255, 255, 0))
out.alpha_composite(L, (0, 0))
out.alpha_composite(W, (L.width + gap, L.height - W.height))
out.save(f'{work}/sleeve.png')
print('sleeve art', out.size, 'logo', L.size, 'word', W.size, 'colours', ORANGE, PURPLE)
