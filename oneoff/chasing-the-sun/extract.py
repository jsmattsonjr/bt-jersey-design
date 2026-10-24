#!/usr/bin/env python3
"""Cut the Chasing the Sun mockup (a Gemini image) into the pieces design.mjs
paints with, in WORKDIR:
  sheet.png                     the whole image as PNG (front and back views), with
                                the back's equinox and solstice labels painted out
  {autumn,winter}-bg.png        side flats, text and logo painted out
  {autumn,winter}-text.png      side text in solid off-white, turned to read left to right
  {autumn,winter}-logo.png      side logo
  leaf-N.png, leaves.json       whole leaves from the shoulder flats
  colours.json                  navy, collar and cuff colours
  snow-bg.png                   from the second mockup's snowy shoulder flat:
                                the nebula with flakes, stars and "2026" painted out
  snow-N.png, snow.json         its snowflakes and stars
  extract.py IN.jpg IN2.jpg WORKDIR"""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage
src, src2, work = sys.argv[1:4]
im = Image.open(src).convert('RGB')
A = np.asarray(im).astype(float)

def median(box):
    x0, y0, x1, y1 = box
    return [int(v) for v in np.median(A[y0:y1, x0:x1].reshape(-1, 3), axis=0)]

def whiteness(a, lo, hi):  # alpha from the darkest channel: white text on colour
    return np.clip((a.min(axis=2) - lo) / (hi - lo), 0, 1)

def rgba(rgb, alpha):
    return Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')

OFFWHITE = (242, 238, 226)

# The back view's AUTUMNAL EQUINOX (peach on an orange glow, keyed on blue)
# and WINTER SOLSTICE (pale blue on navy, keyed on red) are painted out:
# the text's bounding box (with 6 px for its drop shadow) is filled
# harmonically (each texel the mean of its neighbours, the box's edge held
# to the image), so the fill meets the surroundings without a seam. Box,
# channel, lo, hi.
sheet = A.copy()
for (x0, y0, x1, y1), ch, lo, hi in [((1440, 470, 1565, 540), 2, 25, 75), ((1907, 833, 2005, 895), 0, 70, 130)]:
    m = np.zeros(A.shape[:2], bool)
    m[y0:y1, x0:x1] = (A[y0:y1, x0:x1, ch] - lo) / (hi - lo) > 0.05
    ys, xs = np.nonzero(m)
    X0, Y0, X1, Y1 = xs.min() - 26, ys.min() - 26, xs.max() + 27, ys.max() + 27
    mm = np.zeros((Y1 - Y0, X1 - X0), bool); mm[20:-20, 20:-20] = True
    a, known = A[Y0:Y1, X0:X1], ~mm
    num = np.stack([ndimage.gaussian_filter(a[..., c] * known, 14) for c in range(3)], -1)
    fill = np.where(mm[..., None], num / np.maximum(ndimage.gaussian_filter(known * 1.0, 14), 1e-6)[..., None], a)
    for _ in range(3000):
        avg = (np.roll(fill, 1, 0) + np.roll(fill, -1, 0) + np.roll(fill, 1, 1) + np.roll(fill, -1, 1)) / 4
        fill[mm] = avg[mm]
    sheet[Y0:Y1, X0:X1][mm] = fill[mm]
Image.fromarray(sheet.round().astype(np.uint8)).save(f'{work}/sheet.png')

def art(box, lo, hi, rot, ink=None, gain=1, chan=None):
    """White art in box as RGBA, cropped and turned: in its own colour where
    opaque, or flat ink with the alpha raised by gain (a solid fill). Alpha
    comes from the darkest channel, or from channel chan."""
    x0, y0, x1, y1 = box
    a = A[y0:y1, x0:x1]
    al = np.clip((whiteness(a, lo, hi) if chan is None else np.clip((a[..., chan] - lo) / (hi - lo), 0, 1)) * gain, 0, 1)
    col = np.broadcast_to(ink, a.shape) if ink else np.where(al[..., None] > 0.5, a, 255)  # keep the art's own tint
    out = rgba(col, al)
    out = out.crop(out.getbbox())
    return out.rotate(rot, expand=True) if rot else out

# Side flats: box, text box, logo box, whiteness thresholds, and how to
# key the text: (lo, hi, channel). The autumn text fades from cream to peach
# on orange, which has almost no blue, so it keys on blue.
SIDES = {
    'autumn': ((80, 316, 214, 1282), (100, 690, 190, 1165), (82, 1165, 212, 1268), 120, 185, (40, 130, 2)),
    'winter': ((2248, 314, 2388, 1282), (2270, 690, 2370, 1100), (2260, 1160, 2380, 1265), 120, 185, (120, 185, None)),
}
meta = {}
for name, (box, tbox, lbox, lo, hi, (tlo, thi, tch)) in SIDES.items():
    x0, y0, x1, y1 = box
    flat = A[y0:y1, x0:x1].copy()
    # Paint the text and logo out. Below the leaves (row LEAVES on) the flat
    # is a gradient, so replace it with a straight-line fit across each row
    # to the texels away from the art, smoothed down the flat; blend over 40
    # rows into the original leaves above.
    mask = ndimage.binary_dilation(whiteness(flat, lo - 40, hi) > 0.05, iterations=9)
    mask[:, :5] = mask[:, -5:] = True  # the outline
    xs = np.arange(flat.shape[1]); fit = np.zeros_like(flat)
    for y in range(flat.shape[0]):
        k = ~mask[y]
        if k.sum() < 10: k = ~mask.any(axis=0) | True; k[:5] = k[-5:] = False
        for c in range(3): fit[y, :, c] = np.polyval(np.polyfit(xs[k], flat[y, k, c], 1), xs)
    fit = ndimage.gaussian_filter1d(fit, 12, axis=0)
    LEAVES = 315 if name == 'autumn' else -40  # winter: no autumn leaves under the snowy shoulder
    w = np.clip((np.arange(flat.shape[0]) - LEAVES) / 40, 0, 1)[:, None, None]
    flat = flat * (1 - w) + fit * w
    Image.fromarray(flat.astype(np.uint8)).save(f'{work}/{name}-bg.png')
    art(tbox, tlo, thi, -90, OFFWHITE, 1.6, tch).save(f'{work}/{name}-text.png')
    art(lbox, lo, hi, 0).save(f'{work}/{name}-logo.png')

# Shoulder flats: the leaves (their "2026" is left out). Leaves are what is far from the navy
# and not white; whole ones only (not touching the flat's outline or the text).
NAVY = np.array(median((2560, 560, 2600, 590)))
leaves = []
for box in [(2400, 215, 2700, 720), (2400, 740, 2700, 1290)]:
    x0, y0, x1, y1 = box
    a = A[y0:y1, x0:x1]
    far = np.linalg.norm(a - NAVY, axis=2)
    inside = ndimage.binary_fill_holes(a.min(axis=2) < 200)  # the flat, not the white page
    text = ndimage.binary_dilation((whiteness(a, 150, 230) > 0.3) & ndimage.binary_erosion(inside, iterations=8), iterations=6)
    leaf = (far > 100) & inside & ~text & (a.min(axis=2) < 200)
    lab, n = ndimage.label(leaf)
    edge = ~ndimage.binary_erosion(inside, iterations=2)
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        comp = ndimage.binary_fill_holes(lab[sl] == i)
        if comp.sum() < 600 or (edge[sl] & comp).any() or (text[sl] & ndimage.binary_dilation(comp, iterations=2)).any(): continue
        al = np.clip((far[sl] - 40) / 50, 0, 1) * ndimage.binary_dilation(comp, iterations=1)
        al = np.maximum(al, comp * 1.0)  # dark veins inside the leaf stay opaque
        f = f'leaf-{len(leaves)}.png'
        rgba(a[sl], al).save(f'{work}/{f}')
        leaves.append({'file': f, 'w': int(comp.shape[1]), 'h': int(comp.shape[0])})
json.dump(leaves, open(f'{work}/leaves.json', 'w'))
cols = {'navy': NAVY.astype(int).tolist(), 'collar': median((700, 290, 770, 310)),
        'cuffl': median((1300, 655, 1380, 685)), 'cuffr': median((2100, 645, 2180, 675))}
json.dump(cols, open(f'{work}/colours.json', 'w'))

# Second mockup: its snowy shoulder flat, for the rider's right shoulder.
# White things (flakes, stars, glints, the "2026") key on the darkest
# channel; the nebula under them is filled by normalised convolution.
B = np.asarray(Image.open(src2).convert('RGB')).astype(float)
x0, y0, x1, y1 = 2420, 760, 2675, 1282
a = B[y0:y1, x0:x1]
inside = ndimage.binary_erosion(ndimage.binary_fill_holes(a.min(axis=2) < 200), iterations=4)
al = whiteness(a, 120, 200)
year = np.zeros(al.shape, bool); year[960 - y0:1140 - y0, 2495 - x0:2568 - x0] = True
known = inside & ~ndimage.binary_dilation((al > 0.08) | year, iterations=3)
num = np.stack([ndimage.gaussian_filter(a[..., c] * known, 25) for c in range(3)], -1)
den = ndimage.gaussian_filter(known * 1.0, 25)[..., None]
bg = np.where(known[..., None], a, num / np.maximum(den, 1e-6))
bg = ndimage.gaussian_filter(bg, (3, 3, 0))
# The tile is the flat's wide lower part, clear of its outline.
Image.fromarray(bg[960 - y0:1240 - y0, 2450 - x0:2640 - x0].clip(0, 255).astype(np.uint8)).save(f'{work}/snow-bg.png')
lab, n = ndimage.label((al > 0.25) & inside & ~year)
snow = []
for i, sl in enumerate(ndimage.find_objects(lab), 1):
    comp = lab[sl] == i
    cut = sl[0].start == 0 or sl[1].start == 0 or sl[0].stop == a.shape[0] or sl[1].stop == a.shape[1]
    if comp.sum() < 3 or cut or (~ndimage.binary_erosion(inside, iterations=1))[sl][comp].mean() > 0.08: continue  # (nearly) whole ones only
    if 20 <= max(comp.shape) < 30: continue  # neither star nor flake: broken-off flake arms
    pad = tuple(slice(max(0, q.start - 2), q.stop + 2) for q in sl)
    m = ndimage.binary_dilation(lab[pad] == i, iterations=2)
    f = f'snow-{len(snow)}.png'
    rgba(np.where(al[pad][..., None] > 0.5, a[pad], 255), al[pad] * m).save(f'{work}/{f}')
    snow.append({'file': f, 'w': int(m.shape[1]), 'h': int(m.shape[0]), 'big': bool(max(m.shape) >= 30)})
json.dump(snow, open(f'{work}/snow.json', 'w'))
print(len(leaves), 'leaves;', sum(q['big'] for q in snow), 'flakes,', sum(not q['big'] for q in snow), 'stars;', cols)
