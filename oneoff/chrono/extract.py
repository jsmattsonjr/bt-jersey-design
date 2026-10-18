#!/Users/jmattson/Biketerra/.venv/bin/python
"""Export chrono.psd's art layers (cropped) and their atlas offsets.

    extract.py chrono.psd WORKDIR

Writes WORKDIR/<name>.png per layer and WORKDIR/layers.json, a list in PSD
stacking order (bottom first) of {name, file, x, y, w, h}. Also writes
yellow.png, the cuff/hem stripe layer on a 512 canvas, for measuring.
"""
import json
import sys
from pathlib import Path
from PIL import Image
from psd_tools import PSDImage

psd, out = PSDImage.open(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
ART = ('Layer 4', 'Layer 5', 'Layer 3', 'Layer 3 copy', 'Layer 1', 'Layer 2', 'Layer 6', 'Layer 6 copy', 'Layer 7')
rows = []
for l in psd.descendants():
    if l.kind != 'pixel':
        continue
    if l.name == 'template-with-margin copy 2':
        c = Image.new('RGBA', psd.size, (0, 0, 0, 0))
        c.alpha_composite(l.topil().convert('RGBA'), l.offset)
        c.save(out / 'yellow.png')
    if l.name in ART:
        f = l.name.replace(' ', '') + '.png'
        im = l.topil().convert('RGBA')
        im.save(out / f)
        rows.append(dict(name=l.name, file=f, x=l.offset[0], y=l.offset[1], w=im.width, h=im.height))
(out / 'layers.json').write_text(json.dumps(rows, indent=1))
