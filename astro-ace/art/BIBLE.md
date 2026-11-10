# ASTRO ACE art bible (v2: hand-drawn)

## How the arcade studios did it, and how we do it

The run-and-gun artists of 1987-94 drew every frame one pixel at a time: first on
graph paper, then keyed into an in-house character editor wired to the target
hardware, checking the result on a real screen. A character was a handful of
hardware sprites pinned together (a "metasprite"), each frame a fresh drawing. A
boss was not one picture: it was a body plus separately drawn, separately
animated, separately destructible parts, each with its own damage states.
Palettes were 15 colours plus transparent, chosen as ramps before any drawing.

The studio in `studio/` reproduces that desk:

| Then | Here |
|---|---|
| graph paper, one square per pixel | `.px` sheets: text grids, one character per pixel (`studio/px.py`) |
| character editor on the dev system | `studio/desk.py`: view, onion-skin, flip-book, copy/shift/paste/rows/plot |
| looking at it on the cabinet monitor | 1x and 2x proofs on every plate, then the real ROM in a headless emulator |
| the art director walking past | `studio/critic.py`: measures tones, detail, flat areas, outline, noise |
| sprite cutter / metasprite tables | `studio/cutter.py`: cuts frames into hardware sprites, pins them by anchor |
| boss assembly on the planning sheet | `art/guardian.py`: parts, joints, states, hit boxes |

Nothing in a shipped frame is generated at build time. A scratch script may be
used to block in a big mechanical shape, but the result is written into the
sheet and then finished by hand; after that the sheet is the only source.

## The drawing loop (do this for every frame)

1. Decide the pose and the silhouette before typing. Know where the anchor is.
2. Type the frame into the sheet (`desk.py rows SHEET FRAME Y < rows`, or edit
   the file). For a new animation frame start from the nearest one
   (`desk.py copy`) and redraw what moves; do not just nudge parts.
3. `python3 studio/desk.py view SHEET FRAME -s 10` and LOOK at the PNG
   (`out/desk/<sheet>_view.png`). Check the enlargement for mistakes and the 1x/2x
   proofs for read: is it obvious what this is at true size?
4. Fix what is wrong: rows that sheared, lumpy curves, limbs that do not attach,
   tangents, muddy areas where two same-value colours meet.
5. `python3 studio/desk.py critic SHEET FRAME` until there is no FAULT line.
6. For animation: `desk.py onion` and `desk.py gif`, and look at them. Volume,
   anchor and ground line must hold; only what should move, moves.

Budget three or four look-and-fix passes per frame. A frame that only passes
the critic but reads badly at 1x is not done.

## House style

1. **Ink.** `k` closes every silhouette. Inside the figure, use ink only where
   one big form passes in front of another; smaller separations take the
   darkest tone of the local ramp, so interiors stay colourful, not wiry.
2. **Light** comes from above and from the side the figure faces. Top and front
   planes take the highlight, undersides and backs the shadow, and anything
   that overhangs casts a one- or two-pixel shadow on what is under it.
3. **Ramps.** Every material bigger than about 30 pixels shows at least three
   tones (light, base, shadow); the fourth is for cast shadow and deep
   recesses. Metal gets a hard specular (`w`) on its top edge and a strip of
   reflected light along the bottom. Never shade by tracing the outline inward
   ("pillow shading"): shade by the planes of the form.
4. **Detail.** Any 8x8 area should hold something drawn: a seam, rivet, vent,
   strap, buckle, cable, panel line, hazard stripe, glint. Weapons and vehicles
   show their working parts (cells, vents, pistons, exhausts, sights).
5. **Clusters.** No orphan pixels except glints and eyes. No staircases with
   uneven steps on long lines. No single-pixel dither on sprites.
6. **Animation.** Each frame is a drawing. Keep volume and proportions; use
   overlap and follow-through (pack, rifle, antenna trail the body); contact
   frames put soles on the ground row.
7. **Facing.** Heroes and troopers are drawn facing right, the Guardian facing
   left. The engine mirrors horizontally.
8. **Hardware.** One palette per sheet, 15 colours, keys as in `art/style.py`.
   `.` is transparent.

The reference for the style is `art/sheets/ace_top.px` frame `fwd` over
`art/sheets/ace_legs.px` frame `idle` (`python3 art/anims.py`, then look at
`out/desk/ace_poses.png`).

## The bar (critic defaults)

For any frame over 160 pixels: 9+ colours, 45%+ of pixels on a colour boundary,
no single cluster over 14% of the sprite, 3+ tones on every ramp in real use,
closed outline, almost no orphans. These are floors, not goals.

## Sheets and contracts

A frame's **anchor** is the pixel the engine pins it by. **Points** are named
pixels that other parts attach to or that bullets leave from. Keep them exact:
the assembly reads them from the sheet.

### Hero: Ace (palette `ace`)

- `ace_top.px`, cell 40x40, anchor (14,39), `open bottom`. Helmet, torso, arms,
  rifle. Belt is row 39: ink at x=9 and x=19, gold between. Head and torso stay
  put in the cell from frame to frame. Every frame has `point muzzle` on the
  centre pixel of the muzzle tip.
  Frames: `fwd` `fwd_fire` `upfwd` `upfwd_fire` `up` `up_fire` `dnfwd` `dnfwd_fire`.
  The `_fire` frame is the recoil drawing: rifle driven 1-2 px back along its
  axis, shoulder taking it, not just a shifted copy.
- `ace_legs.px`, cell 32x24, anchor (14,23) on the ground row, `open top`. Hips
  start one row under `point waist` (ink at x=9 and x=19 in the idle). The
  waist point carries the body bob.
  Frames: `idle`, `run0`..`run7` (contact, down, passing, up, then the same with
  the legs swapped; the leg nearer the viewer is lit, the far one is in the
  `D`/`R` and `g`/`G` tones), `crouch` (kneeling, waist about 8 px lower).
- `ace_air.px`, cell 32x32, anchor (16,16). `tuck0`..`tuck3`: the somersault
  ball at 0, 45, 90, 135 degrees clockwise (the engine flips for the other
  four). `hit`: knocked back off his feet. `down` (size 48 16, anchor 24 15):
  laid out on his back.

### The Foundry Guardian (palette `guard`, faces left)

Body:
- `g_treads.px`, cell 120x32, anchor (60,31). Frames `roll0` `roll1` `roll2`
  (links and wheels advance a third of a link each). `point deck`: where the
  hull's anchor sits.
- `g_hull.px`, cell 88x64, anchor (44,63). Frame `hull`. Points: `core` (centre
  of the 22x22 core recess on the front slope), `shoulder` (cannon pivot, on
  the front upper corner), `head` (bottom-centre of the head mount ring on
  top), `rack` (bottom-centre of the missile rack mount, top rear), `stack_a`
  `stack_b` (bottom-centres of two smokestacks at the rear).
- `g_plate.px`, cell 28x28, anchor (14,14): armour door over the core. Frames
  `intact` `cracked` `broken` (jagged remains round the rim, centre open).
- `g_core.px`, cell 20x20, anchor (10,10): `glow0` `glow1` `glow2` `dead`.
- `g_shoulder.px`, cell 24x24, anchor (12,12): `joint`, `stump` (torn off).
- `g_stack.px`, cell 14x28, anchor (7,27): `stack`.
- `g_scar.px`, cell 16x16, anchor (8,8): `scar0` `scar1` `scar2` battle damage
  decals (blackened dents, torn plating, sparking cable).

Appendages:
- `g_head.px`, cell 56x40, anchor (28,39). Frame `head`. Points: `eye` (centre
  of the 18 px eye socket at the front), `dish` (bottom-centre mount on top).
  The bottom edge is a neck ring about 24 px wide centred on the anchor.
- `g_eye.px`, cell 20x20, anchor (10,10): `shut` `half` `open` `dead`.
- `g_cannon.px`, cell 64x24, anchor (56,12) = pivot at its right end, barrel
  pointing left. Frames `cannon`, `fire` (recoil sleeve back). `point muzzle`.
  The engine rotates this part about the anchor.
- `g_rack.px`, cell 36x32, anchor (18,31): `closed` `open` `wreck`. `point launch`.
- `g_dish.px`, cell 20x20, anchor (10,19): `spin0`..`spin3`, `wreck`.
- `g_pod.px`, cell 56x24, anchor (28,0): the flight undercarriage that carries
  the head in the last stage. `thrust0` `thrust1`. Points `arm_l` `arm_r`
  (chain arms hang here), `gun`.
- `g_link.px`, cell 8x8, anchor (4,4): `link`, one chain segment.
- `g_claw.px`, cell 16x16, anchor (8,3): `claw`, the blaster on the chain end. `point muzzle`.

### Robot army and hardware (palette `mech` unless noted)

- `trooper.px`, cell 32x40, anchor (16,39): `run0`..`run5`, `aim`, `aim_fire`.
  `point muzzle` on the aim frames.
- `turret.px`, cell 32x32, anchor (16,31): `a0` `a45` `a90` `am30` (barrel level,
  up 45, straight up, down 30). `point muzzle`.
- `saucer.px`, cell 32x16, anchor (16,15): `fly0` `fly1`.
- `pod.px`, cell 16x16, anchor (8,15): `pod0` `pod1` (weapon carrier).
- `sled.px` (palette `ace`), cell 64x32, anchor (32,31): `hover0` `hover1`.
  `point seat`: where the rider's waist sits.
- `items.px` (palette `fx`), cell 16x16, anchor (8,15): `drum` `badge_s` `badge_m`
  `badge_l` `fire0` `fire1`.
- `boom.px` (palette `fx`), cell 32x32, anchor (16,16): `boom0`..`boom4`, a
  drawn five-frame explosion (flash, fireball, breakup, smoke ring, wisps).
- `shots.px` (palette `fx`), cell 16x16, anchor (8,8): `pea0` `pea1` `pellet`
  `ebul0` `ebul1` `laser_h` `laser_v` `laser_d` `flash` (muzzle flash) `spark`.
