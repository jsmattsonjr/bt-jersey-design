#!/bin/zsh
# Rebuild irn-bru-2-sleeves.png from irn-bru-2.png and irn-bru-2.psd.
#   ./run.sh [IN.png] [IN.psd] [OUT.png] [WORKDIR]
set -e
here=${0:A:h}
J=$here/../../design/jerseys
source $here/../../python.zsh
in=${1:-$J/irn-bru-2.png} psd=${2:-$J/irn-bru-2.psd} out=${3:-$J/irn-bru-2-sleeves.png} w=${4:-$(mktemp -d)}
$py $here/extract.py $psd $w
LOGO_CM=6.075 BOOST=1.7 DIL=0.6 node $here/build.mjs $in $w/1-sleeves.png $w/Layer17.png
node $here/torso.mjs $w/1-sleeves.png $w/2-chest.png $w/torso_art2.png $w/text.png
node $here/hem.mjs $w/2-chest.png $w/3-hem.png $w/torso_art3.png
node $here/side.mjs $w/3-hem.png $w/4-side.png $w
SCALE=0.9 node $here/emblem.mjs $w/4-side.png $out $w
print "wrote $out (intermediates in $w)"
