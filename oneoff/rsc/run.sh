#!/bin/zsh
# Build rsc-luneburg.png from the MAKO mockup PDF.
#   ./run.sh [IN.pdf] [OUT.png] [WORKDIR]
set -e
here=${0:A:h}
J=$here/../../design/jerseys
source $here/../../python.zsh
pdf=${1:-$J/rsc-luneburg.pdf} out=${2:-$J/rsc-luneburg.png} w=${3:-$(mktemp -d)}
$py $here/extract.py $pdf $w
node $here/design.mjs $w $out
print "wrote $out (art in $w)"
