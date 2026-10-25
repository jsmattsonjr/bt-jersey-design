#!/bin/zsh
# Build turtle.png from the turtle mockup's front and back views.
#   ./run.sh [FRONT.jpg] [BACK.jpg] [OUT.png] [WORKDIR]   (WORKDIR keeps the pieces)
set -e
here=${0:A:h}
J=$here/../../design/jerseys
source $here/../../python.zsh
front=${1:-$J/turtle-front.jpg} back=${2:-$J/turtle-back.jpg} out=${3:-$J/turtle.png} w=${4:-$(mktemp -d)}
mkdir -p $w
$py -I $here/extract.py $front $back $w
node $here/design.mjs $w $out
print "wrote $out (pieces in $w)"
