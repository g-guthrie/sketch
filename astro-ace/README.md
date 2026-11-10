# ASTRO ACE No.1: a comic-book boss fight for the Game Boy Advance

Each issue is one boss fight told across comic panels: story panels with typed
captions, a loadout pick, then three boss stages, each in its own panel, with
a caption between stages.

Controls: D-pad move/aim (8 directions), A jump, B shoot, R hold position
while aiming, Down crouch, Down+A drop through a platform. On the sled: A jumps off.

- `studio/pixelstudio.py`: the art studio (indexed 15-bit canvases, palettes,
  ink/halftone/dither tools, rig tools with IK and rotated parts, tile slicing
  with budget and palette checks, sprite lint, previews).
- `art/`: style bible and every drawing, as code. `art/export.py` writes `game/gen/`.
- `game/`: C engine. `./build.sh` builds `out/astro_ace.gba`.
  `DEFS="-DQUICK -DSTART_STEP=5" OUT=test ./build.sh` builds a test ROM
  (invulnerable hero, weak bosses, starts at a given script step).
- `tools/shot.c` + `tools/record.py`: headless mGBA recorder for scripted-input GIFs.

Needs arm-none-eabi-gcc, Python 3 with Pillow and numpy, libmgba for the recorder.
The header's boot-logo area is blank: fine for emulators; real hardware needs
the standard logo bytes patched in. No sound yet.
