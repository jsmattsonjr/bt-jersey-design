# Biketerra jersey design

Scripts and worked examples for painting a Biketerra jersey UV atlas with
Claude Code. The atlas is distorted, so art drawn straight in it comes out
bent on the rider. Each design is instead repainted from the 3D position of
every texel, then rendered on the rider and looked at. The `jersey-design`
skill (`skill/SKILL.md`) is the workflow, and `oneoff/` holds one script set
per finished jersey to copy from.

## Shared modules

Plain ES modules in `src/`, run in node by the scripts:

- `glb.js`: parses `assets/rider_m.glb` (mesh, UVs, skin, clips).
- `rig.js`: `loadRig` builds the skeleton, poses it from a clip
  (`applyClip`; the site's stopped pose is `mount` at t=0 from
  `rider_low_lod.glb`) and skins it on the CPU. Jersey triangles are those
  whose UVs reach below the 32 px palette row.
- `view.js`: `rasterTriangle`, for rasterising triangles into the atlas.
- `template.js`: `templateMask`, the template islands (`assets/jersey-mask.png`
  = `design/templates/jersey.png`, whose islands are white *at alpha 0*: a
  canvas reads them as transparent black).
- `image.js`: `fillRegion`, a push-pull fill of an island's unpainted texels.
- `png.js`: PNG read and write.
- `pcm.js`: the Pro Cycling Manager rider and its correspondence with
  Biketerra's (see PCM kits).
- `preview.js`: the WebGL rider used by `render.html` / `render.zsh`.

## Requirements

First fetch the rider models (they are not in the repo; see Model):

```zsh
./fetch-assets.zsh
```

- **node** 20 or later, for the scripts (no npm packages; three.js is in `vendor/`).
- **Google Chrome**, for `render.zsh` (headless). It defaults to the macOS app
  path; set `CHROME` to the binary elsewhere.
- **Python 3 with `requirements.txt`** (Pillow, psd-tools), for the contact
  sheet and the one-offs' layer extraction. The zsh scripts use `$PYTHON`,
  else `.venv/bin/python` in the repo root (a venv, or a symlink to one;
  ignored by git), else `python3`:

  ```zsh
  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
  ```
- **curl** and **shasum**, for `fetch-assets.zsh` and `fetch-pcm.zsh`.
  `fetch-pcm.zsh` also needs UnityPy (in `requirements.txt`).
- **poppler** (`pdftoppm`), only for `oneoff/rsc`, which reads a PDF mockup.

## Layout

| Path | What |
|---|---|
| `skill/SKILL.md` | The `jersey-design` Claude Code skill: the whole workflow, the model's distortions, recipes. Link it as `.claude/skills/jersey-design/SKILL.md` in the project you work from. |
| `assets/` | The template mask, and the rider models once `fetch-assets.zsh` has downloaded them (ignored by git). |
| `design/templates/jersey.png` | The jersey template; islands are white at alpha 0. Same file as `assets/jersey-mask.png`. |
| `design/jerseys/` | Inputs and outputs of the one-offs. |
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

## PCM kits

`pcm2bt.mjs` converts a Pro Cycling Manager kit (`<team>_maillot`, the
classic layout: 455×313 up to PCM12, the same map at 910×626 from PCM13) into
a Biketerra jersey atlas, dropping the shorts:

```zsh
./fetch-pcm.zsh                       # once: the PCM rider, into assets/
node pcm2bt.mjs KIT.png OUT.png       # about 20 s
./render.zsh OUT.png
```

Kits for UE5 / modern PCM use another map and are out of scope.

**The PCM rider** is Cyanide's, so the repo does not carry it either.
`fetch-pcm.zsh` downloads PCM.daily's old Unity shirt viewer
(`shirtdb/viewer/Jview_v16.unity3d`, Unity 2.5) from the Wayback Machine
(snapshot 20120505101225), checks its SHA-256, and runs `pcm-extract.py`
(UnityPy; it has no Texture2D class for Unity 2.5, so the DXT textures are
decoded by hand). That writes `assets/pcm_cyclist.json`, the
`cyclist_jersey` skinned mesh (610 vertices, 870 triangles from a strip, 12
biped bones, z up, facing −y, torso leaning ~58°), and
`assets/pcm_default.png`, the 455×313 kit it shipped with. The mesh is
jersey and shorts in one surface, front and back as two UV islands; the hem
is the edge loop at kit row 341.5 of 626. The mesh's x is mirrored (the L
bones are at −x), so every direction is taken from bone names, never a cross
product: the LKHC kit's lettering reads correctly on Biketerra's rider.

**Correspondence** (`src/pcm.js`): the two UV maps are unrelated, so each
rider gets the same normalised coordinates, measured on its own mesh:
θ round the torso centre line (hem centroid to neck centroid) and elevation
angle e from its midpoint, scaled per θ hem 0 to neckline 1; per sleeve, φ
round the joint-to-cuff axis (0 out from the body, + forward) and s along
it, scaled per φ from the sleeve's floor to the cuff. Sleeve and torso are
split the same way on both, where the upper-arm skin weight passes 0.5,
since the UV islands split them in different places. Both riders are then
laid on one canonical body, the torso on a cylinder and the arms held out
sideways, blended by that weight across the armhole, and each Biketerra
subsample takes the UV of the closest point on PCM's (a voxel hash of the
PCM triangles cut 3×3). The kit is sampled bilinearly over the pixels
PCM's triangles touch only, so the gutters between islands never bleed in.
`paint()` (`oneoff/rsc/paint.mjs`) does the supersampling, slivers and
bleed, in the stopped pose. `DEBUG=1` also writes the canonical position as
colour for both riders (`OUT-coords.png`; `OUT-pcmcoords.png` in kit
space); converting the second should reproduce the first.

Earlier tries, for the record: per-part lookup grids with the UV islands as
Biketerra's sleeve split left torso-coloured patches on the underarms; with
the 0.5 contour as the armhole, PCM's contour was too ragged (t swinging
−9 to +6 cm in 20° of φ); and grids with a fallback between parts made
comb-edged shards along the armhole, where PCM's (φ, s) folds.

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
chest patch redrawn flat. `oneoff/turtle/` paints a plain raglan jersey
and lifts only the art off two views, placing each piece by arc length
and height up the torso axis, so pieces can be moved and scaled on their own.
