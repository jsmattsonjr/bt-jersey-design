#!/bin/zsh
# Build biketerra.png from the front and back mockup views.
#   ./run.sh [FRONT.webp] [BACK.webp] [OUT.png] [WORKDIR]   (WORKDIR keeps the pieces)
set -e
here=${0:A:h}
J=$here/../../design/jerseys
source $here/../../python.zsh
front=${1:-$J/biketerra-front.webp} back=${2:-$J/biketerra-back.webp} out=${3:-$J/biketerra.png} w=${4:-$(mktemp -d)}
mkdir -p $w
$py $here/extract.py $front $back $w
node $here/design.mjs $w $out
print "wrote $out (pieces in $w)"
