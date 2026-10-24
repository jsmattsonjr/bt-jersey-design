#!/bin/zsh
# Rebuild chrono-warped.png from chrono.png and chrono.psd.
#   ./run.sh [IN.png] [IN.psd] [OUT.png] [WORKDIR]
set -e
here=${0:A:h}
J=$here/../../design/jerseys
source $here/../../python.zsh
in=${1:-$J/chrono.png} psd=${2:-$J/chrono.psd} out=${3:-$J/chrono-warped.png} w=${4:-$(mktemp -d)}
$py $here/extract.py $psd $w
node $here/sleeves.mjs $in $w/1-sleeves.png $w
node $here/torso.mjs $w/1-sleeves.png $out $w
print "wrote $out (intermediates in $w)"
