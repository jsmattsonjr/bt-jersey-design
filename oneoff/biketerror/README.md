# BikeTERROR jersey: every element redrawn from its PSD layer

One-off scripts (2026-10-18) that turned `design/jerseys/biketerror.png` and
`biketerror.psd` into `biketerror-warped.png`, the same way as `../chrono`:
flat purple, the orange cuffs and hem as 3D bands, then each art layer
projected flat onto the body in the settings page's **stopped** pose. The
position maps, pose, decal frame and bleed are Chrono's (`../chrono/*.mjs`);
only the layer names, colours and band measurements are specific to this design.
`POSE=bind|seated|standing` (and `T=`) measures in another pose instead.

```zsh
./run.sh            # biketerror.png + biketerror.psd -> biketerror-warped.png
./run.sh IN.png IN.psd OUT.png WORKDIR    # explicit paths; WORKDIR keeps the stages
```

Needs node and the shared venv (`psd-tools`, Pillow). Rerunning on the
unchanged inputs reproduces the saved PNG pixel for pixel.

## Stages

| Script | What it does |
|---|---|
| `extract.py` | Exports the art layers (cropped) with their atlas offsets to `layers.json`, the hem stripe (Layer 4) as `hem.png` and the cuff stripes (Layers 5, 6) as `cuff.png`, for measuring. |
| `sleeves.mjs` | Purple (83,54,102), with an orange (245,119,19) cuff where the upper-arm bone distance exceeds `CUFF` (default measured from `cuff.png`: 0.180 m). The ghost (Layer 7, left) and pumpkin (Layer 3, right) are projected flat, square to the arm, and by default moved round the arm at the same bone distance to where the surface faces straight out to the side (10° and 22° from the old spots); `OUTSIDE=0` keeps the old centres. Each keeps its own old size (ghost 7.3 cm wide, pumpkin 8.2 cm), since they are different art. |
| `torso.mjs` | Purple, with orange within `W` of the hem edge in 3D (default measured from `hem.png`: 1.64 cm). Then Layers 2, 9, 10, 11, 12, 14 in PSD order, each projected flat at its old centre, square to the torso axis (`TORSO_UP=world` for world up), at its old 3D size, confined to its own island. |

## Findings

- **Side text** (BIKETERRA, Layers 11 and 12) slanted along the left flank in
  stopped; projected square to the torso it now runs straight.
- **The back art** is Layer 14, which replaced Layers 8 and 13 (both now
  hidden in the PSD). It is 16.0 × 21.9 cm on the body, and mirrored left to
  right (`FLIP` in `extract.py`) so the cyclist faces right; the PSD layer
  itself faces left.
- The pose is asymmetric, so the two BIKETERRA layers measure 18.8 and 18.3 cm
  long; each keeps its own length.
