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
- **curl** and **shasum**, for `fetch-assets.zsh`.
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

The Pro Cycling Manager kit converter now lives in its own repo,
[pcm2bt](https://github.com/jsmattsonjr/pcm2bt) (`../pcm2bt` locally).
It carries copies of the modules it shares with this one (`src/glb.js`,
`rig.js`, `view.js`, `template.js`, `image.js`, `png.js`, `preview.js`, the
position maps from `oneoff/chrono/` and `paint()` from `oneoff/rsc/`), so a fix
to one of them here has to be carried over by hand.

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
