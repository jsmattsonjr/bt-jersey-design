# Chrono jersey: every element redrawn from its PSD layer

One-off scripts (2026-10-18) that turned `design/jerseys/chrono.png` and
`chrono.psd` into `chrono-warped.png`. The atlas is repainted from scratch:
flat navy, the yellow cuffs and hem as 3D bands, then each art layer projected
flat onto the body (bind pose, `assets/rider_m.glb`), so it shows on the rider
undistorted, as drawn in the PSD. Layer names, colours and the island split
are specific to this design.

```zsh
./run.sh            # chrono.png + chrono.psd -> chrono-warped.png
./run.sh IN.png IN.psd OUT.png WORKDIR    # explicit paths; WORKDIR keeps the stages
```

Needs node and the shared venv (`psd-tools`, Pillow). Rerunning on the
unchanged inputs reproduces the saved PNG pixel for pixel.

## Stages

| Script | What it does |
|---|---|
| `extract.py` | Exports the art layers (cropped) with their atlas offsets to `layers.json`, and the yellow stripe layer as `yellow.png` for measuring. |
| `sleeves.mjs` | Navy, with a yellow cuff where the upper-arm bone distance exceeds `CUFF` (0.186 m, where the old cuff began). Roundels (Layer 5 left, Layer 4 right) are projected flat, square to the arm, at about 7.8 cm. By default each is moved round the arm, at the same bone distance, to where the surface faces straight out to the side (16° and 21° forward of the old spots); `OUTSIDE=0` keeps the old centres. Slivers and seams are handled as in `irn-bru-2/build.mjs`. |
| `torso.mjs` | Navy, with yellow within `W` of the hem edge in 3D (default measured from the old stripe: 1.88 cm). Then Layers 3, 3 copy, 1, 2, 6, 6 copy, 7 in PSD order, each projected flat at its old centre, upright (world up), at its old 3D width, and confined to its own island (back x < 295, front beyond). |
| `decal.mjs` | Shared helpers: the decal frame, premultiplied sampling, compositing, the 4 px seam bleed. |

`posmap.mjs` and `torsomap.mjs` are copies of the IRN-BRU position maps.

## Findings

- **Decal frame.** The image's down axis is whichever of ±up/±right (up = world
  up on the torso, toward the shoulder on a sleeve) is nearest the atlas +y
  there, and its x axis keeps the atlas handedness. So art keeps the
  orientation it had on the body but is squared to the reference. On Chrono
  the atlas axes were within 0–13° of the frame.
- **Size** comes from chords across the layer's box on the body: the long
  axis for elongated art, the geometric mean for square art. The old roundels
  were 7.2 × 8.6 cm ovals, and the torso art was squashed 5–10% vertically.
- **Side text** (AGAINST THE CLOCK) slanted along the flank in the original;
  projected upright, it now runs straight up.
- The PSD's navy layer carries faint ghost marks; the flat repaint drops them.
- The original had 4 near-black texels at the front neckline V; they come
  out navy now.
