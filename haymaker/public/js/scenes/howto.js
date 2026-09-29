import { W, H, setScene } from '../engine.js';
import { drawText, STYLE } from '../gfx/font.js';
import { Button, panel } from '../ui.js';
import { sfx } from '../audio.js';
import { backdrop, logo, flashes } from './common.js';
import { app } from '../app.js';

const PAGES = [
  {
    title: 'THE BEAT',
    lines: [
      ['EVERY EXCHANGE IS A BEAT.', '#ffffff'],
      ['YOU AND YOUR RIVAL SECRETLY PICK A MOVE', '#ffffff'],
      ['BEFORE THE TIMER RUNS OUT.', '#ffffff'],
      ['', ''],
      ['BOTH MOVES FIRE AT THE SAME TIME.', '#ffd21a'],
      ['READ THEM, BAIT THEM, KNOCK THEM OUT.', '#ffd21a'],
      ['', ''],
      ['YOU CAN CHANGE YOUR PICK UNTIL TIME IS UP.', '#a8a4d0'],
      ['NO PICK = YOU COVER UP WITH A GUARD.', '#a8a4d0'],
    ],
  },
  {
    title: 'ATTACKS',
    lines: [
      ['J  JAB      FASTEST. INTERRUPTS SLOWER PUNCHES.', '#ffffff'],
      ['U/O  HOOKS  BIG DAMAGE. SLIP THE SAME SIDE TO DODGE.', '#ffffff'],
      ['K  BODY     WALKS THROUGH GUARD, SLIPS AND DUCKS.', '#ffffff'],
      ['             DRAINS STAMINA. LOW GUARD STOPS IT.', '#a8a4d0'],
      ['I  WIND UP  LOADS AN UPPERCUT - AND YOUR RIVAL SEES IT.', '#ff8a70'],
      ['I  UPPERCUT NEXT BEAT: HUGE HIT + STUN. ARMORED VS JABS.', '#ff8a70'],
      ['             ...OR FAKE IT OUT AND THROW SOMETHING ELSE.', '#a8a4d0'],
      ['L  STAR     SPENDS ALL STARS. ONLY DODGES AVOID IT.', '#ffd21a'],
    ],
  },
  {
    title: 'DEFENSE',
    lines: [
      ['W  GUARD    BLOCKS HEAD SHOTS. REGAINS STAMINA.', '#ffffff'],
      ['S  LOW      STOPS BODY SHOTS + EARNS A COUNTER.', '#ffffff'],
      ['A/D  SLIP   DODGES JABS, UPPERCUTS, STAR PUNCHES', '#ffffff'],
      ['             AND HOOKS FROM THE SAME SIDE.', '#a8a4d0'],
      ['             WRONG SIDE = YOU EAT 1.5X DAMAGE.', '#ff8a70'],
      ['X  DUCK     DODGES JABS AND HOOKS. UPPERCUTS CRUSH IT.', '#ffffff'],
      ['', ''],
      ['DODGE ANYTHING = COUNTER READY: YOUR NEXT PUNCH IS', '#ffd21a'],
      ['FASTER, HITS 1.5X AND EARNS A STAR IF IT LANDS.', '#ffd21a'],
    ],
  },
  {
    title: 'WINNING',
    lines: [
      ['STAMINA (BLUE PIPS) PAYS FOR MOVES. RUN DRY = GASSED.', '#ffffff'],
      ['GETTING HIT CLEAN LOSES A STAR.', '#ffffff'],
      ['', ''],
      ['HEALTH HITS ZERO = KNOCKDOWN.', '#ffd21a'],
      ['MASH TO BEAT THE COUNT OF 10. IT GETS HARDER.', '#ffd21a'],
      ['3 KNOCKDOWNS IN ONE ROUND = T.K.O.', '#ff8a70'],
      ['', ''],
      ['3 ROUNDS OF 3:00. NO K.O.? THE JUDGES DECIDE.', '#ffffff'],
      ['TAP THE ON-SCREEN BUTTONS ON A PHONE.', '#a8a4d0'],
    ],
  },
];

export class HowToScene {
  constructor() {
    this.page = 0;
    this.prev = new Button('<', 8, 186, 24, 16, () => this.go(-1), { color: '#2a2058', shade: '#120c30' });
    this.next = new Button('>', W - 32, 186, 24, 16, () => this.go(1), { color: '#2a2058', shade: '#120c30' });
    this.back = new Button('BACK', W / 2 - 30, 188, 60, 14, () => setScene(new app.scenes.TitleScene({ attract: false })), { color: '#4a4468', shade: '#1a1630', small: true });
  }
  go(d) {
    this.page = Math.max(0, Math.min(PAGES.length - 1, this.page + d));
    sfx('move');
  }
  onKey(k) {
    if (k === 'ArrowLeft' || k === 'A') this.go(-1);
    else if (k === 'ArrowRight' || k === 'D' || k === 'Enter' || k === ' ') {
      if (this.page === PAGES.length - 1 && (k === 'Enter' || k === ' ')) this.back.onClick();
      else this.go(1);
    } else if (k === 'Escape' || k === 'Backspace') this.back.onClick();
  }
  onPointer(type, x, y) { this.prev.pointer(type, x, y) || this.next.pointer(type, x, y) || this.back.pointer(type, x, y); }
  update(dt) { flashes.update(dt); }
  draw(ctx) {
    backdrop(ctx, 0.78);
    const p = PAGES[this.page];
    logo(ctx, p.title, W / 2, 10, 3);
    panel(ctx, 12, 44, W - 24, 134);
    p.lines.forEach(([t, c], i) => { if (t) drawText(ctx, t, 22, 54 + i * 13, { small: true, color: c }); });
    drawText(ctx, `${this.page + 1}/${PAGES.length}`, W / 2, 180, { small: true, color: '#8a86b0', align: 'center' });
    if (this.page > 0) this.prev.draw(ctx);
    if (this.page < PAGES.length - 1) this.next.draw(ctx);
    this.back.draw(ctx);
  }
}
