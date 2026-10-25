#!/bin/zsh
# Build chasing-the-sun.png from the Gemini mockup.
#   ./run.sh [IN.jpg] [IN2.jpg] [OUT.png] [WORKDIR]   (IN2: the mockup with the snowy shoulder)
set -e
here=${0:A:h}
J=$here/../../design/jerseys
source $here/../../python.zsh
in=${1:-$J/chasing-the-sun.jpg} in2=${2:-$J/chasing-the-sun-2.jpg} out=${3:-$J/chasing-the-sun.png} w=${4:-$(mktemp -d)}
mkdir -p $w
$py $here/extract.py $in $in2 $w
node $here/design.mjs $w $out
print "wrote $out (pieces in $w)"
