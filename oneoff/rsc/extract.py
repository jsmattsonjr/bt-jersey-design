#!/usr/bin/env python3
"""Cut the art out of the MAKO mockup PDF as RGBA PNGs (ink colour, alpha
from the contrast with the ground it sits on), at 600 dpi.
  extract.py IN.pdf WORKDIR"""
import subprocess, sys
from PIL import Image
pdf, work = sys.argv[1:3]
subprocess.run(['pdftoppm', '-r', '600', '-png', '-singlefile', pdf, f'{work}/page'], check=True)
page = Image.open(f'{work}/page.png').convert('RGB')
# name: box at 600 dpi, ink colour, ground green level, rotation (deg CCW)
ART = {
    'rsc':     ((895, 2605, 1060, 2955), (255, 255, 255), 23, -90),  # side-panel flat; reads upward, so turn it
    'mako':    ((1840, 1760, 2000, 1830), (35, 31, 32), 255, 0),     # front chest
    'makob':   ((4360, 1460, 4520, 1530), (35, 31, 32), 255, 0),     # back neck
    'club':    ((2230, 1860, 2600, 1980), (75, 21, 65), 255, 0),     # RADSPORTCLUB LÜNEBURG
    'circles': ((4500, 1700, 4820, 2560), (152, 23, 136), 255, 0),   # back
}
for name, (box, ink, ground, rot) in ART.items():
    im = page.crop(box)
    a = im.getchannel('G').point(lambda g: max(0, min(255, round(255 * (g - ground) / (ink[1] - ground)))))
    out = Image.new('RGBA', im.size, ink + (0,)); out.putalpha(a)
    out = out.crop(out.getbbox())
    if rot: out = out.rotate(rot, expand=True)
    out.save(f'{work}/{name}.png'); print(name, out.size)
