#!/bin/zsh
# Download PCM.daily's old Unity shirt viewer (Pro Cycling Manager's rider,
# Cyanide's asset) from the Wayback Machine into assets/, check it against the
# hash it had when pcm2bt was measured on it, and extract the rider mesh and
# default kit (pcm-extract.py) to assets/pcm_cyclist.json and pcm_default.png.
set -e
here=${0:A:h}
source $here/python.zsh
url=https://web.archive.org/web/20120505101225id_/http://pcmdaily.com/shirtdb/viewer/Jview_v16.unity3d
sha=ade91cc2fe22311331819bbce73940e1416c3eb42a03c49d91751340b21d12b3
out=$here/assets/pcm_jview_v16.unity3d
if [[ ! -s $out ]]; then
  curl -fsSL $url -o $out.part
  mv $out.part $out
  print "fetched $url -> assets/pcm_jview_v16.unity3d"
fi
got=$(shasum -a 256 $out | cut -d' ' -f1)
[[ $got == $sha ]] || { print -u2 "assets/pcm_jview_v16.unity3d: sha256 $got, expected $sha"; exit 1; }
$py -I $here/pcm-extract.py $out $here/assets
