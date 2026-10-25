#!/usr/bin/env python3
"""The latitude in degrees, minutes and seconds: paint the back view's
51.81°N out of WORKDIR/sheet.png and set 51°48'36"N in its place (the font has no primes), in DIN
Condensed Bold at the old cap height and ink, with the same soft drop shadow.
  dms.py IN.jpg WORKDIR   (after extract.py)
Settings (env): LAT (51.81), LAT_H (cap height, px), LAT_MAXW (widest the
text may be, px: the back pocket's stitching is 192 px apart)."""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
src, work = sys.argv[1:3]
A = np.asarray(Image.open(src).convert('RGB')).astype(float)
sheet = np.asarray(Image.open(f'{work}/sheet.png').convert('RGB')).astype(float)
LAT = float(os.environ.get('LAT', 51.81))
FONT = os.environ.get('LAT_FONT', '/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf')
INK, SHADOW = (237, 142, 95), (20, 12, 24)

# The old text: orange on dark, keyed on green. Its box with 26 px round it
# (the drop shadow) is filled harmonically, as extract.py does the labels.
x0, y0, x1, y1 = 1670, 1005, 1830, 1070
m = np.zeros(A.shape[:2], bool)
m[y0:y1, x0:x1] = A[y0:y1, x0:x1, 1] > 80
ys, xs = np.nonzero(m)
bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1  # 1685,1017 - 1814,1056
X0, Y0, X1, Y1 = bx0 - 26, by0 - 26, bx1 + 26, by1 + 26
mm = np.zeros((Y1 - Y0, X1 - X0), bool); mm[20:-20, 20:-20] = True
a, known = sheet[Y0:Y1, X0:X1], ~mm
num = np.stack([ndimage.gaussian_filter(a[..., c] * known, 14) for c in range(3)], -1)
fill = np.where(mm[..., None], num / np.maximum(ndimage.gaussian_filter(known * 1.0, 14), 1e-6)[..., None], a)
for _ in range(3000):
    avg = (np.roll(fill, 1, 0) + np.roll(fill, -1, 0) + np.roll(fill, 1, 1) + np.roll(fill, -1, 1)) / 4
    fill[mm] = avg[mm]
sheet[Y0:Y1, X0:X1][mm] = fill[mm]

# 51.81 -> 51°48′36″, rounded to the second.
s = round(abs(LAT) * 3600)
text = f'''{s // 3600}°{s % 3600 // 60:02d}'{s % 60:02d}"{'N' if LAT >= 0 else 'S'}'''
H = float(os.environ.get('LAT_H', by1 - by0)); MAXW = float(os.environ.get('LAT_MAXW', 160))

def mask(size):  # the text's alpha at 4x, cropped to its ink
    f = ImageFont.truetype(FONT, size)
    im = Image.new('L', (size * len(text), size * 2)); ImageDraw.Draw(im).text((size // 2, size // 2), text, 255, font=f)
    return im.crop(im.getbbox())
f = ImageFont.truetype(FONT, 400); five = f.getbbox('5'); k = 4 * H / (five[3] - five[1])
big = mask(round(400 * k))
w = big.width / 4
if w > MAXW: big = big.resize((round(MAXW * 4), big.height), Image.LANCZOS); w = MAXW  # narrow it, keep the height
al = np.asarray(big.resize((round(big.width / 4), round(big.height / 4)), Image.BOX)).astype(float) / 255
cx, top = (bx0 + bx1) / 2, by0  # centred on the old text, tops level
px, py = round(cx - al.shape[1] / 2), round(top)
h_, w_ = al.shape
sh = np.zeros(sheet.shape[:2]); sh[py:py + h_, px:px + w_] = al
sh = np.clip(ndimage.gaussian_filter(np.roll(sh, (2, 2), (0, 1)), 3) * 1.4, 0, 1) * 0.7
out = sheet * (1 - sh[..., None]) + np.array(SHADOW) * sh[..., None]
ink = np.zeros(sheet.shape[:2]); ink[py:py + h_, px:px + w_] = al
out = out * (1 - ink[..., None]) + np.array(INK) * ink[..., None]
Image.fromarray(out.round().clip(0, 255).astype(np.uint8)).save(f'{work}/sheet.png')
print(f'{text}: {w:.0f} x {h_} px at ({px},{py}); old {bx1 - bx0} x {by1 - by0}')
