#!/Users/jmattson/Biketerra/.venv/bin/python
"""Export the PSD layers the IRN-BRU scripts read, as 512x512 or layer-size PNGs.

    extract.py irn-bru-2.psd WORKDIR

Layer names are irn-bru-2.psd's own (Layer 8 = back emblem, 16 = front
emblem, 10/13 = IRN-BRU lettering, 11/12 = ORIGINAL & BEST, 17 = sleeve logo,
21/22 = old hem stripe).
"""
import sys
from pathlib import Path
from PIL import Image
from psd_tools import PSDImage

psd, out = PSDImage.open(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
layers = {l.name: l for l in psd.descendants() if l.kind == 'pixel'}


def composite(names, path):
    """Layers placed on a 512 canvas, in PSD order."""
    art = Image.new('RGBA', psd.size, (0, 0, 0, 0))
    for l in psd.descendants():
        if l.kind == 'pixel' and l.visible and l.name in names:
            x0, y0 = l.offset
            art.alpha_composite(l.topil().convert('RGBA'), (max(x0, 0), max(y0, 0)), (max(-x0, 0), max(-y0, 0)))
    art.save(out / path)


# Cropped single layers (positions are hard-coded in the scripts).
for name in ('Layer 17', 'Layer 11', 'Layer 12', 'Layer 8', 'Layer 16'):
    layers[name].topil().convert('RGBA').save(out / (name.replace(' ', '') + '.png'))
composite(('Layer 10', 'Layer 13'), 'text.png')                                   # IRN-BRU
composite(('Layer 8', 'Layer 16', 'Layer 11', 'Layer 12', 'Layer 21', 'Layer 22'), 'torso_art2.png')
composite(('Layer 8', 'Layer 16', 'Layer 11', 'Layer 12'), 'torso_art3.png')    # no hem stripe
