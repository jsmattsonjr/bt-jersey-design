---
name: jersey-design
description: Make or fix a Biketerra custom jersey - the 512x512 PNG UV atlas uploaded on the settings Avatar tab. Use when asked to design a jersey, put a mockup or logo onto the jersey map, or fix how one looks on the rider (jagged or wavy stripes, oval or stretched logos, text that bends, specks at seams, art that should be centred, rotated, resized or recoloured).
---

# Designing a Biketerra jersey

A jersey is a 512² PNG UV atlas for the rider model. The job is almost never
"paint the atlas". It is "make it look right on the rider". The atlas is
distorted, so anything drawn straight in it comes out bent on the body. The
method that worked (IRN-BRU, 2026-10-16) is to **repaint each element from the
3D position of every texel**, then render the rider and look.

Everything here lives in the `jersey-projector` repo, and paths below are
relative to its root. This file is `skill/SKILL.md` there, and is linked into
`.claude/skills/jersey-design/`. Commit tested, approved work there; never
push. Designs live in `design/jerseys/` and the template is
`design/templates/jersey.png`. See the README for requirements (node, headless
Chrome, a Python with `requirements.txt`).

## What the game does with the PNG

- The site draws the PNG onto a 512² canvas (`drawImage(img,0,0,512,512)`), so
  a non-square file is squashed. It then repaints the top 32 px row with the
  palette cells: skin, hair, pants, socks, helmet, shoes. Nothing in rows 0–31
  survives.
- Sampling is **nearest, no mipmaps**. Every texel shows as a hard-edged facet.
  Antialias by supersampling (4×4 per texel) when painting, never by blurring
  afterwards.
- One atlas serves `rider_m`, `rider_f`, `rider_n` and the low-LOD rider.
  `assets/rider_m.glb` is the model all the tools use (`./fetch-assets.zsh`
  downloads it and `rider_low_lod.glb` from biketerra.com). **Its bind pose is not
  what the user sees.** The settings page rebinds `rider_m` to the skeleton of
  `assets/rider_low_lod.glb` and drives it with that file's clips. **Stopped**
  is `mount` held at t=0 and is static. **Seated** and **standing** play
  `pedal.seated` and `pedal.standing`. In stopped the torso leans 24° forward
  (5° in bind) and bends, so the flanks change shape: art that is upright in
  bind pose curves there. **Measure in the stopped pose** (`oneoff/chrono/pose.mjs`,
  `POSE=`), and say which pose a check used.
- Axes: y up, the rider faces **+x**, and their **left arm is at −z**.
- Islands: the two sleeves across the top (the left sleeve is the island at
  u < 0.31), the back panel bottom-left (wide, wrapping onto the flanks), and the
  front panel bottom-right. The torso is about 5.5 texels/cm. The template marks
  the islands as **alpha-0 white over opaque black**, so treat
  "transparent or bright" as island.

## The model's distortions (measured, all designs)

- **Sleeve UVs wander.** A straight line in the atlas drifts 1.6 cm along the arm
  in steps, so a thin stripe comes out jagged. Sleeve bands must be rings at a
  fixed distance along the upperArm bone.
- **Torso rows curve.** They are smooth (<1 mm wobble), but the chest-stripe row
  humps 1.5 cm at centre front and back. Level a horizontal stripe at one
  height along the torso axis (spine.1 to spine.3). That is world y in bind pose
  only.
- **The hem is not level.** The back hem is 3.3 cm higher at centre than at the
  sides. Make a hem stripe "within W of the hem edge" in 3D, not a height.
  Measure "centred between the stripes" separately in each column.
- **Slivers.** 8 sleeve triangles are under 2.5 texels wide in UV. A texel a
  sliver touches is stretched across the sliver's whole 3D width. Colour those
  texels from the sliver's own 3D position (`build.mjs`). A two-texel notch on
  the left sleeve can't be fixed: one texel can't be right for both triangles.
- **Seams read the padding.** Texels just outside an island get sampled at its
  edges. Fill them by copying the nearest covered texel 4 px outward. Do not use
  a blurred fill, because blurred stale paint shows as specks.
- **Neckline spill.** A few texels at the front neckline V lie outside the
  template but are drawn. Paint them the neighbouring colour; never leave them
  black. `check.mjs` lists them.

## Tools

```zsh
cd jersey-projector
./render.zsh ATLAS.png [OUT.png] [VIEW...]     # rider wearing it, as the game draws it
node check.mjs ATLAS.png [--map OUT.png]       # size, alpha, drawn texels outside the template
```

- **`render.zsh`** uses headless Chrome with no puppeteer. It writes a contact
  sheet. `POSE=stopped` is the default (`bind`, `seated`, `standing`; `T=`
  seconds into the pedalling clips). Named views follow the chest, though the
  close side views crop the head in stopped. The default views are `front-close back-close left-close right-close`;
  `front back left right three top` and `px,py,pz,tx,ty,tz` also work. Use
  `BASIC=1` for unlit colours. **Render after every change and look at the
  sheet with Read** before reporting. Close views catch the 1–2 texel problems
  the user will point at.
- **`check.mjs`** exits 1 on warnings. The 7 translucent texels near (393–400,
  273) came with the IRN-BRU source.

## Workflow

1. **Inputs.** Get the atlas PNG, and if there is a PSD, its layers. Each piece
   of art (logo, lettering, emblem, stripe) on its own layer is what makes
   redrawing possible. Export the layers with psd-tools
   (`oneoff/irn-bru-2/extract.py` is the template; `oneoff/rsc/extract.py`
   cuts art out of a PDF mockup instead). Run Python through `python.zsh`'s
   `$py`, as the `run.sh` scripts do.
   Record each layer's bbox (atlas position) and its colours. **Never modify the
   source PNG or PSD.** Write to a new name such as `<name>-<variant>.png`.
2. **Render the starting point** and agree with the user on what is wrong.
3. **One stage per element**, each a script reading PNG in and writing PNG out:
   sleeves, chest stripe, hem, side text, emblems. Chain them in a work
   directory. Settings go in env vars (`LOGO_CM=6.075 node build.mjs …`), so a
   tweak is a rerun and not an edit.
4. **After each request:** rerun, render, look, then send the user the sheet.
   Keep each change to exactly what was asked. When the user then reverses a
   change ("drop the flag"), take it out completely: code, the `run.sh` step,
   the README, and any unpushed commit.
5. **When the design is accepted**, save the scripts as
   `oneoff/<name>/` with `run.sh [IN.png] [IN.psd] [OUT.png] [WORKDIR]` and a
   README listing stages, settings and findings. Its inputs and output go in
   `design/jerseys/`, and `run.sh` defaults to them there. Check that `run.sh`
   reproduces the saved PNG **pixel for pixel**, then commit the scripts with
   the inputs and output. Tell the user nothing has been
   checked in-game; uploading it on the settings Avatar tab is their test.

## Recipes (copy from `oneoff/chrono/` for posing and generic decals, `oneoff/irn-bru-2/` for the rest)

All of them start from a **texel position map**: rasterise every jersey
triangle into UV space at 4×4 subsamples per texel, and store each subsample's
posed world position and normal (stopped; IRN-BRU's copies predate this and
use bind pose). `posmap.mjs` builds it for the sleeves (it
also stores the position in the upperArm bone frame); `torsomap.mjs` builds it
for the torso. Paint each subsample from its 3D point and average the 16 per
texel. That average is the antialiasing.

- **Stripe or band**: make it a level set of a 3D function, with colour
  depending on which interval the subsample falls in.
  - Sleeve: distance along the bone axis. IRN-BRU stripe centre 0.153 m,
    half-width 4 mm.
  - Chest: world y. IRN-BRU `YC=1.2933`, half-width 5.9 mm.
  - Hem: 3D distance to the hem boundary edges. Those are the torso edges used by
    exactly one triangle, keyed by position, since UV seams split vertices.
  - To make two stripes "appear the same width", give both the same 3D width.
- **Decal (logo, emblem, flag)**: project it flat along the surface normal `n0`
  at its centre `P0`. Do not wrap it by surface distance; on the shoulder cap a
  wrap looks compressed, and the user chose flat. Build a tangent frame:
  `up` = the reference direction (bone −y toward the shoulder, or the torso
  axis spine.1→spine.3 on the torso) projected into the tangent plane, and `R = cross(up, n0)`. Then
  artwork pixel = centre + (dot(p−P0, eu), dot(p−P0, ev)) × px/m. Rotating and
  mirroring are just choices of `eu`/`ev`: swap them, or negate one.
  - Paint only where `dot(n, n0) > 0.2` and `|dot(p−P0, n0)| < 4 cm`, so the
    decal never reaches around the far side.
  - Size it in centimetres (sleeve roundel 6.075 cm).
  - Thin line art vanishes at 5.5 texels/cm. Thicken it with `DIL` (max alpha
    over a ring, in source px) and `BOOST` (alpha gain).
  - Rotation words are ambiguous, so render after each one and state in the
    reply what is now up.
- **Every layer as it was, undistorted** (`oneoff/chrono/decal.mjs` `frame`):
  centre from the layer's bbox, the axis nearest the atlas +y as down, atlas
  handedness kept, size from chords across the box. The stopped pose is
  asymmetric, so give a left/right pair one size (the mean).
- **Outside of the arm** (`sleeves.mjs`): at the same bone distance, the point
  whose normal faces from the right shoulder joint (upperArm.r head) to the
  left. The shoulder bones share one head, so their difference has no direction.
- **Mirrored pair** (left and right sleeves): the right side's `ev` is the
  negated left `ev`, which mirrors the art. Whether a mirrored logo is wanted is
  the user's call; IRN-BRU's right roundel ended up mirrored.
- **Lettering that follows a stripe** (constant 3D gap): sample the source
  layer at a row given by the 3D height above the stripe, divided by metres per
  source row (`torso.mjs`, `PER_ROW = 0.00182`), and the column as it was.
- **Text upright on a curved flank** (`side.mjs`): erase the old layer
  (dilated 1 px) to the background colour, then decal-project with the torso
  axis as `up`. Centre it vertically between the stripes **in that column** (hem top +
  stripe bottom) / 2. Keep the old 3D size by measuring the old layer's chords.
- **Centre between the stripes** (`emblem.mjs`): measure in the column
  through the art's centre, not as a global height.
- **Colours**: take them from the PSD layers, not by eye from a render. Lit
  renders shade them. Match a new element to an existing one by sampling that
  layer, as with IRN-BRU's navy 20,22,41.
- **Composite order**: repaint the background and stripes, then composite the
  untouched PSD art layers back on top, leaving out the layers a stage
  replaced, then the redrawn decals. Bleed the islands 4 px with the nearest
  covered texel at the end.

## Pitfalls

- Chrome renders in its own time, so `render.zsh` waits for the page
  (`--virtual-time-budget`). A blank tile means the atlas failed to load. Check
  the path, since only the copy in the temp dir is served.
- Nearest sampling plus a white stripe 2 texels wide means a one-texel error
  is 50% of the stripe. Look at the close views at full size before calling a
  stripe straight.
- A decal centre taken from the PSD bbox is in atlas px. Convert it through the
  position map; never place it by guessing a 3D point.
- GLTFLoader drops the dots from bone names (`spine.3` is `spine3`); the
  rig and `parseGLB` keep them.
- Everything above is about `rider_m`. Female and non-binary riders share the
  atlas but not the mesh. `rider_n` spills 76 px at the neckline. If a design
  is for them, extract that GLB and swap it into `assets/` for the check.
