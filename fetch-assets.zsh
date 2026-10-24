#!/bin/zsh
# Download the rider models from biketerra.com into assets/. They are the
# site's own files, so the repo links to them rather than carrying them.
# Each is checked against the hash it had when the tools were measured on it;
# a 404 or a mismatch means the site has shipped a new model (see README, Model).
set -e
here=${0:A:h}
base=https://biketerra.com/_app/immutable/assets
for name file sha in \
  rider_m rider_m.rb1Dgf6L.glb 419822964fb1b7c57ac2caed5e6e1e9ff30d795babb3f9a9a4d4c8bb8a7f45a7 \
  rider_low_lod rider_low_lod.Ct7jtfaL.glb 08b551317e16a6cefd054e3c5e940b18c46d1de84a11f0957601615c24dd81e5
do
  out=$here/assets/$name.glb
  if [[ ! -s $out ]]; then
    curl -fsSL $base/$file -o $out.part
    mv $out.part $out
    print "fetched $base/$file -> assets/$name.glb"
  fi
  got=$(shasum -a 256 $out | cut -d' ' -f1)
  [[ $got == $sha ]] || { print -u2 "assets/$name.glb: sha256 $got, expected $sha"; exit 1; }
done
