#!/Users/jmattson/Biketerra/.venv/bin/python
"""Export biketerror.psd's art layers (cropped) and their atlas offsets.

    extract.py biketerror.psd WORKDIR

Writes WORKDIR/<name>.png per layer and WORKDIR/layers.json, a list in PSD
stacking order (bottom first) of {name, file, x, y, w, h}. Also writes, on a
512 canvas for measuring, hem.png (the hem stripe, Layer 4) and cuff.png (the
cuff stripes, Layers 5 and 6). Layers in FLIP are mirrored left to right in
place (the PSD itself is left as it is).
"""
import json
import sys
from pathlib import Path
from PIL import Image
from psd_tools import PSDImage

psd, out = PSDImage.open(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
ART = ('Layer 2', 'Layer 9', 'Layer 10', 'Layer 11', 'Layer 12', 'Layer 3', 'Layer 7', 'Layer 14')
FLIP = ('Layer 14',)  # the cyclist faces right
BANDS = {'Layer 4': 'hem.png', 'Layer 5': 'cuff.png', 'Layer 6': 'cuff.png'}
canvas = {}
rows = []
for l in psd.descendants():
    if l.kind != 'pixel':
        continue
    if l.name in BANDS:
        c = canvas.setdefault(BANDS[l.name], Image.new('RGBA', psd.size, (0, 0, 0, 0)))
        c.alpha_composite(l.topil().convert('RGBA'), l.offset)
    if l.name in ART:
        f = l.name.replace(' ', '') + '.png'
        im = l.topil().convert('RGBA')
        if l.name in FLIP:
            im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        im.save(out / f)
        rows.append(dict(name=l.name, file=f, x=l.offset[0], y=l.offset[1], w=im.width, h=im.height))
for f, c in canvas.items():
    c.save(out / f)
(out / 'layers.json').write_text(json.dumps(rows, indent=1))
