@ Minimal GBA startup: header, stacks, .data/.bss, IRQ handler.
    .section .init, "ax"
    .arm
    .global _start
_start:
    b       start_real
    .space  156                     @ boot logo area (left blank; see README)
    .ascii  "ASTRO ACE\0\0\0"       @ title, 12 bytes
    .ascii  "AACE"                  @ game code
    .ascii  "00"                    @ maker
    .byte   0x96, 0x00, 0x00
    .space  7
    .byte   0x00                    @ version
    .byte   0x00                    @ header checksum (patched by build)
    .space  2
start_real:
    mov     r0, #0xD2               @ IRQ mode
    msr     cpsr_c, r0
    ldr     sp, =0x03007FA0
    mov     r0, #0x1F               @ system mode, IRQs on
    msr     cpsr_c, r0
    ldr     sp, =0x03007F00
    ldr     r0, =__data_lma
    ldr     r1, =__data_start
    ldr     r2, =__data_end
1:  cmp     r1, r2
    ldrlo   r3, [r0], #4
    strlo   r3, [r1], #4
    blo     1b
    ldr     r1, =__bss_start
    ldr     r2, =__bss_end
    mov     r3, #0
2:  cmp     r1, r2
    strlo   r3, [r1], #4
    blo     2b
    ldr     r0, =irq_handler
    ldr     r1, =0x03007FFC
    str     r0, [r1]
    ldr     r0, =main
    mov     lr, pc
    bx      r0
    b       start_real

irq_handler:
    mov     r0, #0x04000000
    add     r0, r0, #0x200
    ldrh    r1, [r0, #0]
    ldrh    r2, [r0, #2]
    and     r1, r1, r2
    strh    r1, [r0, #2]
    ldr     r0, =0x03007FF8
    ldrh    r2, [r0]
    orr     r2, r2, r1
    strh    r2, [r0]
    bx      lr
    .pool
