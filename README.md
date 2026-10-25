# Jersey Projector

Turns a front/back jersey mockup (the usual product render: two views side by
side on a dark backdrop) into a Biketerra jersey UV map, by projecting each
view onto the rider model and baking it into the atlas.

```bash
cd jersey-projector
python3 -m http.server 8000      # then open http://localhost:8000
```

Open one side-by-side image (front on the left), or two images (front first).
The page finds both jerseys, fits the rider's arm angle to the mockup, aligns
and bakes in about two seconds, and shows the result on the rider as the game
draws it: riding pose, 512² texture, nearest filtering. **Download 512 PNG**
is the file to upload on the settings Avatar tab.

## What to check, and the controls

- **Alignment panel.** The cyan line is the model's outline, carried into the
  mockup by the warp; it should hug the jersey. The darkened area is what the
  page took for backdrop.
- **Landmarks (1–9)**: neck, sleeve hem corners, armpits, hem corners. Drag
  one to the right spot and it snaps to the outline. *Reset points* undoes them.
- **Add / Erase** brush the jersey mask. Use them where the jersey is the colour
  of the backdrop: on the Chrono mockup a near-black panel and a cuff fade into
  a backdrop within 8 levels, which no tolerance separates.
- **Background tolerance** re-segments, discarding brush edits. PNGs with
  transparency use their alpha instead.
- **Arm angle / Fit to mockup**: the pose the rider is projected in. Fitting
  runs on open and picks the angle whose landmarks best match (Procrustes).
  **Arm twist** rolls the sleeves if their art lands rotated.
- **Flatten shading** divides out the mockup's large-scale lighting (0 = off).
- **Min facing**: surface turned more than this from a view (cosine) takes
  no colour from it and is filled from its neighbours instead of smeared. The
  *show unseen texels* box on the atlas marks those areas.

## How it works

All of the core runs on the CPU in plain ES modules (`src/`), so it runs
unchanged in node for the tests. WebGL is only used for the preview.

1. `glb.js`, `rig.js`: parse `assets/rider_m.glb`, re-pose the arms from the
   riding bind pose into an A-pose, skin it (linear blend) on the CPU.
   Jersey triangles are those whose UVs reach below the 32 px palette row.
2. `view.js`: orthographic front (+x) and back (−x) views, rasterising a
   silhouette and a depth buffer.
3. `segment.js`: backdrop flood fill from the image border against a local
   mean of the backdrop, which follows vignettes and glows; splits the views.
4. `contour.js`: outline, landmarks (convexity defects for the armpits, sharpest
   outboard turns for the sleeve hems) and arc-length correspondences between
   landmarks.
5. `tps.js`: a thin-plate spline from model-view pixels to mockup pixels, fitted
   to those correspondences and tabulated on a 4 px grid.
6. `pipeline.js`: the bake. Every jersey texel of a 1024² atlas is located on
   the posed surface, and takes its colour from whichever view it faces and is
   visible in. Each template island's unseen texels are then push-pull filled
   from that island's seen ones. The result is halved to 512 and masked to
   `assets/jersey-mask.png` (= `design/templates/jersey.png`, whose islands are
   white *at alpha 0*: a canvas reads them as transparent black).

## Tests

```bash
npm test     # node test/roundtrip.js
```

The round trip textures the rider with `design/jerseys/uv-straightness-guide.png`,
renders it front and back as a "mockup", runs the whole pipeline on that, and
compares with the guide: 0.67 levels mean error, nothing over 40 levels.
`IDENTITY=1` replaces the warp with the exact map, to separate bake error from
alignment error; `VIEW_WIDTH` sets the render size. Pass an output directory as
the second argument to keep the renders and atlases.

`?mockup=URL` (repeatable) on the page URL loads images at start, and `?arm=N`
fixes the arm angle; the page state is `window.__jp`.

## Requirements

First fetch the rider models (they are not in the repo; see Model):

```zsh
./fetch-assets.zsh
```

- **node** 20 or later, for the scripts and tests (no npm packages; three.js is in `vendor/`).
- **Google Chrome**, for `render.zsh` (headless). It defaults to the macOS app
  path; set `CHROME` to the binary elsewhere.
- **Python 3 with `requirements.txt`** (Pillow, psd-tools), for the contact
  sheet and the one-offs' layer extraction. The zsh scripts use `$PYTHON`,
  else `.venv/bin/python` in the repo root (a venv, or a symlink to one;
  ignored by git), else `python3`:

  ```zsh
  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
  ```
- **curl** and **shasum**, for `fetch-assets.zsh`.
- **poppler** (`pdftoppm`), only for `oneoff/rsc`, which reads a PDF mockup.

## Layout

| Path | What |
|---|---|
| `skill/SKILL.md` | The `jersey-design` Claude Code skill: the whole workflow, the model's distortions, recipes. Link it as `.claude/skills/jersey-design/SKILL.md` in the project you work from. |
| `assets/` | The template mask, and the rider models once `fetch-assets.zsh` has downloaded them (ignored by git). |
| `design/templates/jersey.png` | The jersey template; islands are white at alpha 0. Same file as `assets/jersey-mask.png`. |
| `design/jerseys/` | Inputs and outputs of the one-offs, and the test's UV guide. |
| `oneoff/<name>/` | One script set per finished jersey; each `run.sh` rebuilds its PNG from `design/jerseys/` pixel for pixel. |

## Model

Both GLBs are the site's own, so the repo does not carry them.
`fetch-assets.zsh` downloads them from `https://biketerra.com/_app/immutable/assets/`
(referenced from bundle chunk `chunks/DqME4VGv.js` on 2026-10-24) and checks
each against the SHA-256 it had when the tools were measured on it:

- `assets/rider_m.glb` is `rider_m.rb1Dgf6L.glb`, the mesh and UVs.
- `assets/rider_low_lod.glb` is `rider_low_lod.Ct7jtfaL.glb`. The settings
  page rebinds `rider_m` to its skeleton and poses it with its clips: stopped
  (`mount` at t=0), seated and standing.

`rider_f` (`rider_f.BP7jrp9H.glb`), `rider_n` (`rider_n.DZTihLVo.glb`) and
`rider_low_lod` share the atlas. If the site ships a new hash, re-check the
UVs against the template, then update the names and hashes in
`fetch-assets.zsh`. To find the current names,
fetch `https://biketerra.com/`, follow the `_app/immutable/` imports, and grep
for `rider_[a-z_]*\.[A-Za-z0-9_-]+\.glb`.

## Render and check from the command line

```zsh
./render.zsh ATLAS.png [OUT.png] [VIEW...]   # contact sheet of the rider wearing it
node check.mjs ATLAS.png [--map OUT.png]     # size, alpha, drawn texels outside the template
```

`render.zsh` screenshots `render.html` in headless Chrome (no puppeteer), one
tile per view: `front back left right three top`, the `-close` variants of the
first four, or `px,py,pz,tx,ty,tz`. The default is the four close views, and
`BASIC=1` renders unlit. The rider faces +x, with the left arm at −z.
`check.mjs` exits 1 on a warning: drawn texels with alpha under 255, or
near-black texels outside the template (the front neckline V). The
`jersey-design` skill (`skill/SKILL.md`) covers the whole workflow.

## One-offs

`oneoff/irn-bru-2/` redraws parts of a finished atlas from the model's 3D
surface (straight sleeve and hem stripes, round logos, sliver triangles); its
README covers what the UV map does to stripes and logos, which applies to any
design.

The others repaint the whole atlas in the settings page's stopped pose:
`oneoff/chrono/` and `oneoff/biketerror/` redraw every PSD layer flat on the
body. `oneoff/rsc/` paints a jersey with no atlas at all, from a PDF
mockup's panels and art. `oneoff/chasing-the-sun/` does the same from a
raster image mockup (front and back views, side and shoulder flats),
mapping the views by arc length and scattering the flats' leaves and
snowflakes as sprites. `oneoff/biketerra/` works from just a front and a
back product view: seams painted out, the views wrapped by arc length, the
flanks filled with their ground patterns, and the sleeve lettering and
chest patch redrawn flat.
