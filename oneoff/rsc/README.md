# RSC Lüneburg jersey: painted from a MAKO mockup PDF

One-off scripts (2026-10-24) that turn `design/jerseys/rsc-luneburg.pdf` (MAKO
TEAM JERSEY CYCLING 02057 PBS, V1, 28/12/23) into `rsc-luneburg.png`. There
is no source atlas. Every texel is painted from its 3D position in the
settings page's **stopped** pose (`../chrono/pose.mjs`; `POSE=` for another),
and the art is cut out of the PDF and projected flat onto the body.

```zsh
./run.sh                          # rsc-luneburg.pdf -> rsc-luneburg.png
./run.sh IN.pdf OUT.png WORKDIR   # WORKDIR keeps the art PNGs
```

Needs node, `pdftoppm` and the shared venv (Pillow). Rerunning reproduces the
saved PNG pixel for pixel.

## Stages

| Script | What it does |
|---|---|
| `extract.py` | Renders the PDF at 600 dpi and cuts out RSC (from the side-panel flat, turned to read left to right), the chest and neck MAKO logos, RADSPORTCLUB LÜNEBURG and the three circles as RGBA: ink colour, with alpha from the contrast with the ground. |
| `paint.mjs` | Paints the whole atlas from a colour function of 3D position (both sleeves and the torso). Handles sleeve UV votes, slivers and the 4 px seam bleed as in `../chrono/sleeves.mjs`. |
| `frame.mjs` | Torso frame: spine.1 origin, up the torso axis (spine.1 to neck), forward, left. |
| `design.mjs` | The design. Settings are env vars, in cm. |
| `diag.mjs` | Diagnostic atlas: torso hue by normal azimuth in 30° bands, sleeves by angle around the bone, with 5 cm and 2 cm shade bands. |

## The design, as built

Colours are the PDF's swatches: plum 2623Q (75,21,65), magenta 240Q
(152,23,136), pink 219Q (239,50,108), purple 2592Q (94,37,144), black
(35,31,32).

- **Yoke** (plum): the sleeves, plus the torso beyond a raglan plane through
  the side of the neck (front `NECKF` 6.5, back `NECKB` 5 out) and the
  armpit. It is bowed by `BOW` -1.5 cm, so the seam hugs the shoulder as in
  the mockup.
- **Side panel** (magenta, `PANEL` 8.5 wide): within PANEL/2 of the side
  line from the hem to the armpit, then along the underside of the sleeve
  (an arc of PANEL around the upper-arm bone, centred on the armpit's angle).
  The side line is the mean of the points whose normal faces straight out to
  the side in each 5 mm of height, smoothed over ±2 cm. **Slash**: white
  within `SLASH` 1.2 of the armhole seam, on the torso side only. On the
  sleeve side the UVs scattered it into flecks.
- **Cuffs** (pink): within `CUFF` 3 of the sleeve end.
- **Back pocket** (purple): 2.9 to 14.5 cm from the hem (`POCKET0`,
  `POCKET1`), between the side panels, with a pink `PINK` 0.6 line on top.
- **Art**: front MAKO 4 cm wide (rider's right chest, 38 cm up the torso);
  club name 9.5 cm (rider's left chest, 34.5 up); back MAKO 4 cm at the neck;
  circles 6.5 × 20 cm (rider's right of the spine, centred 34.8 up).
- **RSC**: 9 × 4.1 cm. The mockup notes it "must be seen in bent cycling
  position". On each flank it runs along the torso, centred on the side line
  21 cm up, with its top toward the back, so it reads upright from either
  side when the rider is bent over. On each shoulder it sits on the crest
  (the most upward-facing point 15 cm out), reading from the rider's right
  to left with its top toward the back, so it reads from in front, as in the
  mockup. Checked in the seated pose.

## Findings

- The sleeve islands are raglan-cut in the mesh and reach the collar. Their
  neck edge is an open boundary, so cuff edges must be filtered by height
  (u < 42 cm), or the cuff paints a pink fleck at the neck.
- In `rider_m`'s stopped pose the torso is only 25 × 18 cm in section, hem to
  back collar 47 cm. That matches the mockup's scale of about 0.1 cm per px
  at 150 dpi, which is how the art sizes were set.
- The club name (two lines about 1 cm tall) is at the 5.5 texel/cm limit and
  only just legible.
- Not drawn: the zip, the collar outline, the hem gripper.
