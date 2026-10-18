# IRN-BRU jersey: redraw the art from 3D

One-off scripts (2026-10-16) that turned `design/jerseys/irn-bru-2.png` into
`irn-bru-2-sleeves.png`. Each repaints one part of the atlas from where its
texels sit on the rider model (bind pose, `assets/rider_m.glb`), so stripes are
straight and logos round on the body rather than in the UV map. They are
specific to this design: layer names, positions and colours are hard-coded.

```zsh
./run.sh            # irn-bru-2.png + irn-bru-2.psd -> irn-bru-2-sleeves.png
./run.sh IN.png IN.psd OUT.png WORKDIR    # explicit paths; WORKDIR keeps the stages
```

The other stages still measure in bind pose (`rider_m`'s own), which is not
what the settings preview shows; see `../chrono/README.md`.

Needs node and the shared venv (`psd-tools`, Pillow). Rerunning on the
unchanged inputs reproduces the saved PNG pixel for pixel.

## Stages

| Script | What it does |
|---|---|
| `extract.py` | Exports the PSD layers the stages read into the work directory. |
| `build.mjs` | Sleeves. Orange/white/blue bands are rings at fixed distances along the upper-arm bone (stripe centre 15.3 cm, `STRIPE`; half-width 4 mm, `HALF`). The logo (Layer 17) is projected flat along the surface normal at its centre: `LOGO_CM` diameter, `BOOST` alpha gain, `DIL` line thickening in logo pixels. Each logo's orientation is set in the `frames` block. |
| `torso.mjs` | Chest stripe levelled at one bind-pose height (old stripe's mean, 1.2933 m, 11.8 mm wide). The IRN-BRU lettering keeps a constant 3D gap above it. |
| `hem.mjs` | Hem stripe: white within 11.8 mm (`W`) of the hem edge, measured in 3D from the mesh's bottom boundary. The hem is not level, so the stripe follows it rather than a height. |
| `side.mjs` | ORIGINAL & BEST: old text erased, reprojected on each flank, centred between the stripes, in the emblem's navy (20, 22, 41). Centre and size are found in bind pose; the projection is made in the settings page's stopped pose (`../chrono/pose.mjs`, `POSE=`), square to the torso axis, so the text runs straight there. Projected upright in bind pose, it curved on the right flank in the preview. |
| `emblem.mjs` | Front and back roundels: old ones erased, reprojected round and centred between the stripes, `SCALE=0.9` of the old size. |

`posmap.mjs` and `torsomap.mjs` rasterise the sleeve and torso triangles into
per-texel 3D positions (4×4 subsamples per texel).

## What the model does to texture

- **The sleeve UVs wander.** A straight vertical line in the sleeve island drifts
  1.6 cm along the arm, in steps at triangle edges, so an 8 mm stripe painted
  straight in the atlas looks jagged. The torso rows are smooth (<1 mm), but
  curved: the chest stripe row humps 1.5 cm at centre back and front.
- **Slivers.** The sleeves have 8 triangles under 2.5 texels wide in UV. With
  nearest sampling a sliver reads every texel it touches, stretched across its
  3D width, so `build.mjs` colours those texels from the sliver itself (the
  left-sleeve "tick" at the back of the arm). A two-texel notch remains there;
  one texel can't be right for both the sliver and its neighbour.
- **Seams read the padding.** Texels just outside an island are sampled at
  its edges; stale paint there shows as specks. The sleeve stage copies the
  nearest covered texel 4 px out instead of a blurred fill.
- **The hem is curved**: the back hem rides 3.3 cm higher at centre than at the
  sides, so "centred between the stripes" is measured per emblem/text column.
- **Neckline spill.** 19 px of the front neckline V lie outside the template
  but are drawn; they are painted blue, not left black.
