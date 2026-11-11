# ASTRO ACE No.1: a comic-book boss fight for the Game Boy Advance

Each issue is one boss fight told across comic panels: story panels with typed
captions, a loadout pick, then three boss stages, each in its own panel, with
a caption between stages.

Controls: D-pad move/aim (8 directions), A jump, B shoot, R hold position
while aiming, Down crouch, Down+A drop through a platform. On the sled: A jumps off.

## Where the art comes from

The hero, the Guardian boss and the explosion are generated with Retro Diffusion
(a pixel-art model) and assembled by code. The process, in `studio/rd.py`,
`art/paint.py` and `art/export.py`:

- **Hero.** One character is generated, then *edited* into each pose (aim up,
  crouch) or *inpainted* (only the arms and rifle repainted, so the body stays
  pixel-identical), and each pose is *animated* into its run cycle. 43 frames.
- **Boss.** One painting. Each destructible component is then inpainted in a
  copy of that painting (rack wrecked, rack shut, dish snapped off, hatch blown
  open to the core, eye shuttered), and the barrel is extended by outpainting.
  Because every copy is identical outside the edited region, the boss is a base
  with a hole per component plus the matching rectangle from whichever copy
  shows that component's state. Any combination of states is seamless.
- **GBA limits.** The hero is reduced to one 15-colour palette. The boss is cut
  into hardware sprites and each sprite picks one of four fitted palettes
  (`studio/palettes.py`), so the painting keeps about 60 colours.
- `art/gen/raw/` holds every generated image; `art/gen/ledger.jsonl` records
  the prompt, style, seed and cost of each call. The API key is read from
  `$RD_API_KEY` or `$RD_KEY_FILE` and is never stored in the repository.

Still from earlier pipelines: the trooper is hand-drawn on a `.px` sheet;
bullets, pickups, saucer, turret and sled are the first-generation small
sprites carried onto sheets; backgrounds are the generated scenery code. The
last stage's flying pod boss is not painted yet and shows stand-in boxes for
some parts.

```
python3 art/paint.py                                          # preview hero frames and boss states -> out/desk/
python3 studio/desk.py view art/sheets/trooper.px -s 8        # look at a drawn sheet
python3 art/contracts.py                                      # which drawn sheets are complete
```

## The game

- `game/main.c`: the engine. Sprites are metasprites; the hero's frames are
  streamed into VRAM as he animates; the Guardian is a set of parts with their
  own hit points (hardware-rotated cannon, missile rack, radar dish, hatch over
  the core, eye), and in the last stage a flying head with chain arms.
- `game/build.sh` builds `out/astro_ace.gba`. `art/export.py` runs first and
  writes `game/gen/`.
  - `DEFS="-DQUICK -DSTART_STEP=5" OUT=test ./build.sh`: test ROM (invulnerable
    hero, weak boss, starts at a given script step).
  - `ASTRO_DRAFT=1 ./build.sh`: builds with labelled stand-in boxes for any
    frame that is not drawn yet. A normal build refuses stand-ins.
- `tools/shot.c` + `tools/record.py`: headless mGBA recorder for scripted-input GIFs.

Needs arm-none-eabi-gcc, Python 3 with Pillow and numpy, libmgba for the recorder
(`gcc -O2 tools/shot.c -o tools/shot -lmgba`).
The header's boot-logo area is blank: fine for emulators; real hardware needs
the standard logo bytes patched in. No sound yet.
