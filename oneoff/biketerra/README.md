# Biketerra x TBB: painted from front and back product views

One-off scripts (2026-10-24) that turn `design/jerseys/biketerra-front.webp`
and `biketerra-back.webp` (two separate product renders on white) into
`biketerra.png`. Every texel is painted from its 3D position in the settings
page's stopped pose. Painting and position maps are `../rsc/paint.mjs`, the
torso frame `../rsc/frame.mjs`, and the arc-length machinery is copied from
`../chasing-the-sun/design.mjs`.

```zsh
./run.sh                                      # -> biketerra.png
./run.sh FRONT.webp BACK.webp OUT.png WORKDIR # WORKDIR keeps the pieces
```

Needs node and a Python with Pillow, numpy and scipy (`requirements.txt`).
Rerunning reproduces the saved PNG pixel for pixel.

## Stages

| Script | What it does |
|---|---|
| `extract.py` | Cuts each view off the page and away from the grey inside of the jersey (seen through the neck and below the front hem): the thick low-chroma regions holding some grey. Paints out the seams, outline and pocket stitching (neutral grey on orange, lilac grey on purple) and the zip (peach, by column), each pixel the per-channel median of clean pixels nearby, so the camo stripes stay crisp. Keep boxes protect the art with grey-ish line work (turtle, lettering). Erase boxes paint out the views' own sleeve lettering, the label inside the back collar, and the front TBB patch, which design.mjs redraws. Builds the sleeve lettering from the back sleeve's mountain logo and the pocket's "biketerra" recoloured purple with a white keyline; cuts out the front TBB patch. |
| `design.mjs` | The design (below). Settings are env vars, in cm. |

## The design, as built

- **Torso** comes from the views. The across coordinate is arc length round
  the torso from the centre line; the up coordinate is 3D distance from the
  hem, following the views' curved hems within `HEM_BLEND` (5 cm). Each view
  is at one scale, collar to hem down the centre line: 18.5 px/cm front,
  21.7 back, so its art keeps its proportions.
- **The purple band** is 9.1 cm at the front and 17.3 at the back, as the
  views draw it (the model's back is 9 cm longer than its front). One level
  height squashed the back's pocket logos to 0.67 of their height.
- **Flanks.** The views do not reach round the sides. Where neither covers
  a point it is plain camo above the band's edge and topo below, from
  logo-free patches of the back view (mirror-tiled), with the edge running
  straight from the front's height to the back's. Mirroring the views there
  put reversed copies of the turtle and the R on the sides.
- **Sleeves** are unrolled round the upper-arm bone (distance from the cuff,
  and arc from the outside of the arm, + toward the front) and laid on each
  view's flat sleeve, whose top edge is the outside of the arm. A point
  unrolled past the flat sleeve's underside (cuff corner to armpit) is
  reflected back, or the underarm picks up the torso's mountain.
- **Right sleeve lettering** (logo and "biketerra"): a ring centred
  `SLEEVE_U` 3.9 from the cuff on the outside of the arm, `SLEEVE_L` 13.5
  long, reading round the arm from back to front, tops toward the shoulder,
  as the views show it.
- **Front TBB patch**: flat on the chest at the view's position and width,
  top edge level in the world.
- **Collar** (`COLLAR` 1): plain orange.

## Findings

- The front panel's two collar corners (triangles 841 and 842 of
  `rider_m`) have their UVs at v < 0.45, the position maps' sleeve/torso
  split, so they came as the right sleeve and took its purple lettering.
  `../rsc/paint.mjs` now paints them as torso.
- Wrapped with the view, the front TBB patch came out turned about 10°.
  Squared to the torso axis (spine.1 to neck) it was still 2.2° CCW from
  the front: in the stopped pose the torso leans a little sideways.
- Where the model's neckline is lower than the mockup's, a front point can
  land in the view's neck hole; it is stepped down onto the jersey.
- Not drawn: the seams, zip and pocket stitching. Faint traces of the collar
  seam and cuff stitching are left, under the 5.5 texel/cm resolution.
