# Chasing the Sun 2026: painted from a Gemini mockup

One-off scripts (2026-10-24) that turn `design/jerseys/chasing-the-sun.jpg`
(and the snowy shoulder flat of a second version, `chasing-the-sun-2.jpg`)
into `chasing-the-sun.png`. The mockup is one image holding a front view, a
back view, two side flats and two shoulder flats. The flats are not to scale
with the views, and the views disagree with each other about which side is
orange. Every texel is painted from its 3D position in the settings page's
stopped pose. Painting, position maps and the torso frame are
`../rsc/paint.mjs` and `../rsc/frame.mjs`.

```zsh
./run.sh                                  # -> chasing-the-sun.png
./run.sh IN.jpg IN2.jpg OUT.png WORKDIR   # WORKDIR keeps the cut-out pieces
```

Needs node and a Python with Pillow, numpy and scipy (`requirements.txt`).
Rerunning reproduces the saved PNG pixel for pixel; the leaf scatter is
seeded (`SEED`).

## Stages

| Script | What it does |
|---|---|
| `extract.py` | Cuts the pieces out. On the back view, the small AUTUMNAL EQUINOX and WINTER SOLSTICE labels are painted out: each label's box, including its drop shadow, is filled harmonically from its edge. Side flats: the text and logo are painted out of the background, and below the leaves the background is a straight-line fit across each row, smoothed. The side text is keyed out and refilled as solid off-white (the autumn text fades to peach, so it keys on the blue channel), turned to read left to right. Also extracts the side logos, 23 whole leaves from the shoulder flats, and the navy, collar and cuff colours. From the second mockup's snowy shoulder flat: the nebula with everything white painted out (normalised convolution) as a tile, and its 4 whole snowflakes and 206 stars. The shoulder flats' "2026" is not used. The WINTER SOLSTICE flat's autumn leaves are painted out too (it is all gradient), since they sat under the snowy shoulder. |
| `design.mjs` | The design (below). Settings are env vars, in cm. |

## The design, as built

- **Front and back** come from the views. The across coordinate is arc
  length round the torso from the centre line. The cross-section is binned
  every 5 mm, with its radius per degree. Above the armpits the section is
  open, so its centre is held at the last closed one; otherwise the rows
  shear. The up coordinate is 3D distance from the hem. It follows the
  views' curved hems only within `HEM_BLEND` (5 cm) of the hem; following
  them all the way up arched the lower-back lettering by 1 cm. The scale is the
  views' own, collar to hem: 22.1 px/cm front, 22.6 back. The hem curves
  (`hem`), raglan seams (`seam`) and side-panel edges (`edge`) are
  half-widths read off the image, in `VIEW`. The mockup's seams meet its
  armpits 14 cm out, which on the model is the arm crease, so the art also
  stops `ARM_YOKE` (3 cm) short of each armhole, leaving shoulder pattern
  there.
- **Side panels** run between the front view's edge and the back view's, so
  each is about 6 cm wide at the armpit and 12 cm at the hem. The rider's
  left is AUTUMNAL EQUINOX and the right is WINTER SOLSTICE, as on the back
  view; the front view has them the other way round. The left panel's
  background is its flat's, stretched to fit. The right panel continues the
  snowy shoulder pattern, with the stars and flakes scattered over the
  shoulder and panel together (`SNOW_PANEL=0` for the flat's gradient). The text (`TEXT_L` 15 long, centred `TEXT_V` 14 up)
  and logo (`LOGO_W` 4.5, `LOGO_V` 3.2 up) keep their proportions and are
  placed in panel coordinates. The text reads up the right flank (hem to
  armpit, as on the flats) and down the left, with its tops toward the back.
  Turning the left one round from the flat makes both read upright from
  their own side when the rider is bent over.
- **Yoke and sleeves.** The rider's left is navy (26,38,65) with leaves,
  and the right is the snowy nebula with stars and snowflakes. All are
  scattered by Poisson disc, with a random turn and flip:
  - leaves: `LEAF_GAP` 2.9, `LEAF` 3.2 ± 20%
  - stars: `STAR_GAP` 1.1, at their drawn size, which is `SNOW_PX` 22 px/cm,
    the views' scale
  - flakes: `FLAKE_GAP` 4.5, the largest `FLAKE` 3.5

  The nebula is tiled mirrored and blended across three planar projections.
  Each sprite is projected flat at its point and clipped to the yoke, so
  sprites stop at the seams. A side panel stops at the model's armpit; above
  it is yoke. The mockup draws its armpits higher up the torso than the
  model has them.
- **Collar** (`COLLAR` 1.5) is the views' orange. **Cuffs** (`CUFF` 2.8) are
  orange on the left and blue on the right, as on the back view.

## Findings

- Measure a view's panel edges from the pixels, not by eye. The first
  guess was the jersey's outer outline, and the art then sampled the white
  page as a light streak along each panel.
- The mockup's own white lettering (BIKETERRA, CHASING) is at the 5.5
  texel/cm limit, so it renders blocky up close.
