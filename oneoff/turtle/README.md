# Biketerra turtle: painted from front and back Gemini views

One-off scripts (2026-10-25) that turn `design/jerseys/turtle-front.jpg` and
`turtle-back.jpg` (two Gemini views of a green jersey with teal raglan
sleeves, on grey) into `turtle.png`. Every texel is painted from its 3D
position in the settings page's stopped pose. Painting and position maps are
`../rsc/paint.mjs`, the torso frame `../rsc/frame.mjs`, the raglan seam is
copied from `../rsc/design.mjs` and the arc-length machinery from
`../biketerra/design.mjs`.

```zsh
./run.sh                                      # -> turtle.png
./run.sh FRONT.jpg BACK.jpg OUT.png WORKDIR   # WORKDIR keeps the pieces
```

Needs node and a Python with Pillow, numpy and scipy (`requirements.txt`).
Rerunning reproduces the saved PNG pixel for pixel.

## Stages

| Script | What it does |
|---|---|
| `extract.py` | Cuts the art out of each view: inside a hand-set box per piece, the view's own pixels wherever they differ from the green, dilated 4 px so antialiased edges come along. The art goes back onto the same green, so it needs no matte. The back's turtle on a bicycle and pocket logo go in layers of their own. Writes each piece's tight box (`art.json`) and the green and teal (medians of plain body and sleeve). |
| `design.mjs` | The design (below). Settings are env vars, in cm unless noted. |

## The design, as built

- **Body** green (50,100,70), collar included, as in the views. **Yoke
  and sleeves** teal (34,136,136) beyond a raglan plane through the side of
  the neck (`NECKF` 6.5 front, `NECKB` 5 back) and the armpit, bowed `BOW`
  3.5 out toward the shoulder halfway down. The bow is measured from each
  side's own neck height (the back's is 2 cm higher), so the back seam
  leaves the neckline 5.25 cm either side of centre (the back view's
  collar: 4.4) heading out toward the shoulder. `NECK_OUT` (0) and
  `NECK_TOP` (0.35) can push it further out just below the neck.
- **Art** is laid on the torso by arc length round it from the centre line
  (across) and height along the torso axis (up). Each view is at its own
  scale, collar to hem down the centre line: 31.4 px/cm front, 31.7 back.
- **Front**: the mountain logo, "biketerra" and the turtle with coffee, as in
  the view.
- **Back**: all moved down `BACK_DOWN` 7.9 from the view. The pocket logo is
  then moved back up, so the gap from the bicycle down to the logo matches
  the gap from the lettering down to the shell (77 image px, from
  `art.json`). The turtle on a bicycle is scaled `TURTLE` 0.9 (a ratio)
  about its box's centre, so both gaps grow to about 2.5 cm.
- Not drawn: the seams, cuff and hem stitching, the pocket outlines and the
  reflective strip.

## Findings

- Measured as 3D distance from the hem, rows arched on the back, lifting the
  ends of the lettering into the yoke, because the hem is higher at centre
  back. Height along the torso axis keeps them level.
- With the bow measured from the front neck height, it was zero over the
  top 2 cm of the back, and the back seam ran straight down from the
  neckline: a tab of green with vertical sides. Taking the back's own neck
  height fixed it. The views' collar is sewn on above the neckline, so the
  back panel does reach the neck between the seams; it is the tab's shape,
  not its colour, that was wrong. On the way: pulling the seam in to the
  centre back made a dome (matches neither view nor template); moving the
  plane's back neck point in narrowed the tab and moved the front seam; arc
  length above the armpits (an open section) made the seam jagged.
- Biketerra's template (`biketerra-jersey-template.png`, RAGLAN guides)
  agrees with this seam on the front (neck 6.4 cm out, ours 6.5) and on the
  back from the armpit to the shoulder blade (13.5 vs 13.3). Above that the
  template's back line runs up to the shoulder top 14 cm out, not to the
  neck, and does not meet its front line: a raglan front with a set-in
  back. This follows the views instead.
- With `BOW` 2.5 the yoke clipped the back lettering's "b"; 3.5 clears it and
  is closer to the views' curved seam.
- From back-close, the back lettering still looks slightly arched. That is
  the low camera looking up the back, which leans 24° forward in the stopped
  pose.
- The lettering is near the 5.5 texel/cm limit and renders a little blocky
  up close.
