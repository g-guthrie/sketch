# ASTRO ACE No.1: a comic-book boss fight for the Game Boy Advance

Each issue is one boss fight told across comic panels: story panels with typed
captions, a loadout pick, then three boss stages, each in its own panel, with
a caption between stages.

Controls: D-pad move/aim (8 directions), A jump, B shoot, R hold position
while aiming, Down crouch, Down+A drop through a platform. On the sled: A jumps off.

## The art studio

Every sprite in the game is drawn by hand, one pixel at a time, the way the
arcade studios did it, and the tools in `studio/` are that desk rebuilt:

| | |
|---|---|
| `art/sheets/*.px` | The drawings. Text grids, one character per pixel, one 15-colour palette per sheet. Anchors and named points (muzzles, joints) live on the frames. |
| `studio/desk.py` | The drawing desk: enlarge a frame with numbered margins and true-size proofs, onion-skin, flip-book, and the editing commands (copy, shift, paste, rows, plot, rot, flip). |
| `studio/critic.py` | The art director: tones per ramp, detail, flat areas, outline, noise. Faults are printed with coordinates. |
| `studio/cutter.py` | Cuts a frame of any size into GBA hardware sprites (a metasprite) and packs OBJ VRAM. |
| `art/guardian.py` | The boss assembly sheet: which separately drawn part hangs off which point, draw order, hit points. |
| `art/contracts.py` | What every sheet must contain for the game to build; prints the production board. |
| `studio/bar.py` | The scorecard: what is drawn, against the house bar. |
| `studio/lightbox.py` | The light table: one HTML page with every frame, the animations playing, the assembled boss. |
| `art/BIBLE.md` | House style, the drawing loop, and every sheet's contract. |

```
python3 studio/desk.py view art/sheets/ace_top.px fwd -s 10   # look at a frame
python3 studio/desk.py critic art/sheets/ace_top.px           # craft check
python3 art/contracts.py                                      # production board
python3 art/guardian.py                                       # assembled boss preview
python3 studio/bar.py                                         # scorecard
python3 studio/lightbox.py                                    # out/lightbox.html
```

Backgrounds (`art/panel.py`, `art/foundry.py`, `art/cards.py`) are still built
by the first-generation scenery code on top of `studio/pixelstudio.py`.

## The game

- `game/main.c`: the engine. Sprites are metasprites; the hero's frames are
  streamed into two VRAM slots as he animates; the Guardian is a set of parts
  with their own hit points (rotating cannon, missile rack, radar dish, armour
  plate over the core, eye), and in the last stage a flying head with chain arms.
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
