#!/bin/zsh
# Build chasing-the-sun.png from the Gemini mockup.
#   ./run.sh [IN.jpg] [IN2.jpg] [OUT.png] [WORKDIR]   (IN2: the mockup with the snowy shoulder)
#   DMS=1 ./run.sh ...   latitude as 51°48'36"N, not 51.81°N -> chasing-the-sun-dms.png
set -e
here=${0:A:h}
J=$here/../../design/jerseys
source $here/../../python.zsh
in=${1:-$J/chasing-the-sun.jpg} in2=${2:-$J/chasing-the-sun-2.jpg} out=${3:-$J/chasing-the-sun${DMS:+-dms}.png} w=${4:-$(mktemp -d)}
mkdir -p $w
$py $here/extract.py $in $in2 $w
[[ -z $DMS ]] || $py $here/dms.py $in $w
node $here/design.mjs $w $out
print "wrote $out (pieces in $w)"
