#!/bin/zsh
# Render the rider wearing a jersey atlas, as the game draws it (512², nearest),
# from several views, and tile them into one contact sheet.
#   ./render.zsh ATLAS.png [OUT.png] [VIEW...]
# Views are render.html names (front back left right three front-close
# back-close left-close right-close top) or px,py,pz,tx,ty,tz. Default: the four
# close views. POSE=bind|stopped|seated|standing (default stopped, the settings
# page's static pose) and T=seconds into the pedalling clips; BASIC=1 renders
# unlit; SIZE sets each tile (700). CHROME is the Chrome binary (default: the
# macOS app); PYTHON a Python with Pillow (see python.zsh).
set -e
here=${0:A:h}
atlas=${1:?usage: render.zsh ATLAS.png [OUT.png] [VIEW...]}
out=${2:-${atlas:r}-render.png}
views=(${@[3,-1]})
(( $#views )) || views=(front-close back-close left-close right-close)
size=${SIZE:-700}
chrome=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
source $here/python.zsh

# Serve a temp dir holding the app's files and a copy of the atlas.
w=$(mktemp -d)
trap 'kill $srv 2>/dev/null; rm -rf $w' EXIT
for f in render.html src vendor assets; ln -s $here/$f $w/$f
cp $atlas $w/atlas.png
port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1])')
python3 -m http.server $port -d $w >/dev/null 2>&1 &
srv=$!
for i in {1..50}; do curl -s -o /dev/null localhost:$port/render.html && break; sleep 0.1; done

tiles=()
for v in $views; do
  t=$w/tile-$#tiles.png
  "$chrome" --headless=new --use-angle=metal --hide-scrollbars --window-size=$size,$size \
    --virtual-time-budget=15000 --screenshot=$t \
    "http://localhost:$port/render.html?atlas=atlas.png&view=$v&pose=${POSE:-stopped}&t=${T:-0}${BASIC:+&basic=1}" >/dev/null 2>&1
  tiles+=($t)
done
$py - $out $tiles <<'PY'
import sys
from PIL import Image
out, tiles = sys.argv[1], [Image.open(p) for p in sys.argv[2:]]
cols = min(len(tiles), 4 if len(tiles) != 4 else 2)
rows = -(-len(tiles) // cols)
w, h = tiles[0].size
sheet = Image.new('RGB', (cols * w, rows * h), 'white')
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * w, (i // cols) * h))
sheet.save(out)
PY
print "wrote $out"
