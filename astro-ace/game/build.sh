#!/bin/sh
# usage: ./build.sh            -> out/astro_ace.gba
#        DEFS="-DQUICK" OUT=quick ./build.sh   (test build: invulnerable, weak bosses)
set -e
cd "$(dirname "$0")"
OUT="${OUT:-astro_ace}"
python3 ../art/export.py
CF="-mthumb -mthumb-interwork -mcpu=arm7tdmi -O2 -ffreestanding -fno-builtin -Wall -Wno-unused-variable -std=gnu99"
arm-none-eabi-gcc $CF $DEFS -c main.c -o main.o
arm-none-eabi-gcc $CF -c gen/gfx.c -o gfx.o
arm-none-eabi-gcc -mcpu=arm7tdmi -c crt0.s -o crt0.o
arm-none-eabi-gcc -nostdlib -T gba.ld crt0.o main.o gfx.o -lgcc -mthumb -mcpu=arm7tdmi -o game.elf
arm-none-eabi-objcopy -O binary game.elf "../out/$OUT.gba"
python3 - "../out/$OUT.gba" <<'PY'
import sys
p=sys.argv[1]; d=bytearray(open(p,'rb').read())
d[0xBD]=(-(sum(d[0xA0:0xBD])+0x19))&0xFF
open(p,'wb').write(d); print('rom bytes',len(d))
PY
