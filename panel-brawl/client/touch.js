// Touch controls: floating twin sticks + action buttons.
//  - Left half: movement stick. Flick up = jump (again mid-air = double jump),
//    hold down = crouch / climb down, up on a ladder = climb.
//  - Right half: aim stick. Pushing past the inner ring fires continuously.
//  - Buttons: dash, punch, bomb, swap, use, super.

const BUTTONS = [
  { k: 'dashP', label: 'DASH' },
  { k: 'meleeP', label: 'POW!' },
  { k: 'bombP', label: 'BOMB' },
  { k: 'swapP', label: 'SWAP' },
  { k: 'interactP', label: 'USE' },
  { k: 'superP', label: 'SUPER', cls: 'super' },
];

export class TouchControls {
  constructor(root, onPause) {
    this.active = false;
    this.state = { mx: 0, up: false, down: false, jump: false, jumpP: false, fire: false, aim: null };
    this.edges = {};
    this.move = null;
    this.aimT = null;
    this.root = root;
    this.onPause = onPause;
    this.build();
    addEventListener('touchstart', () => this.enable(), { once: true, passive: true });
  }

  build() {
    const el = document.createElement('div');
    el.id = 'touch';
    el.className = 'hidden';
    el.innerHTML = `
      <div class="tzone left"></div><div class="tzone right"></div>
      <div class="stick" id="stickL"><div class="knob"></div></div>
      <div class="stick" id="stickR"><div class="knob"></div></div>
      <div class="tbtns">${BUTTONS.map((b) => `<button data-k="${b.k}" class="${b.cls || ''}">${b.label}</button>`).join('')}</div>
      <button class="tpause">II</button>`;
    this.root.appendChild(el);
    this.el = el;
    this.stickL = el.querySelector('#stickL');
    this.stickR = el.querySelector('#stickR');
    for (const b of el.querySelectorAll('.tbtns button')) {
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.edges[b.dataset.k] = true;
        b.classList.add('down');
      }, { passive: false });
      b.addEventListener('touchend', (e) => { e.preventDefault(); b.classList.remove('down'); }, { passive: false });
    }
    el.querySelector('.tpause').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.onPause && this.onPause(); }, { passive: false });
    const zoneL = el.querySelector('.tzone.left');
    const zoneR = el.querySelector('.tzone.right');
    zoneL.addEventListener('touchstart', (e) => this.start(e, 'move'), { passive: false });
    zoneR.addEventListener('touchstart', (e) => this.start(e, 'aim'), { passive: false });
    addEventListener('touchmove', (e) => this.moveEv(e), { passive: false });
    addEventListener('touchend', (e) => this.end(e), { passive: false });
    addEventListener('touchcancel', (e) => this.end(e), { passive: false });
  }

  enable() {
    this.active = true;
    document.body.classList.add('touch');
  }

  show(on) {
    this.el.classList.toggle('hidden', !on || !this.active);
  }

  start(e, kind) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const s = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
      if (kind === 'move' && !this.move) { this.move = s; this.place(this.stickL, s); }
      if (kind === 'aim' && !this.aimT) { this.aimT = s; this.place(this.stickR, s); }
    }
  }

  place(stick, s) {
    stick.style.left = s.ox + 'px';
    stick.style.top = s.oy + 'px';
    stick.classList.add('on');
    stick.firstElementChild.style.transform = 'translate(-50%,-50%)';
  }

  moveEv(e) {
    for (const t of e.changedTouches) {
      for (const [s, stick] of [[this.move, this.stickL], [this.aimT, this.stickR]]) {
        if (!s || s.id !== t.identifier) continue;
        e.preventDefault();
        s.x = t.clientX;
        s.y = t.clientY;
        const R = 60;
        let dx = s.x - s.ox, dy = s.y - s.oy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        stick.firstElementChild.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }
    }
  }

  end(e) {
    for (const t of e.changedTouches) {
      if (this.move && this.move.id === t.identifier) { this.move = null; this.stickL.classList.remove('on'); }
      if (this.aimT && this.aimT.id === t.identifier) { this.aimT = null; this.stickR.classList.remove('on'); }
    }
  }

  // Called once per simulation tick; returns raw input like Input.sample().
  sample() {
    const out = { mx: 0, up: false, down: false, jump: false, jumpP: false, fire: false };
    if (this.move) {
      const dx = (this.move.x - this.move.ox) / 60, dy = (this.move.y - this.move.oy) / 60;
      out.mx = Math.abs(dx) > 0.3 ? Math.sign(dx) : 0;
      const upNow = dy < -0.55;
      out.up = upNow;
      out.down = dy > 0.55;
      out.jump = upNow;
      out.jumpP = upNow && !this.wasUp;
      this.wasUp = upNow;
    } else this.wasUp = false;
    if (this.aimT) {
      const dx = this.aimT.x - this.aimT.ox, dy = this.aimT.y - this.aimT.oy;
      const d = Math.hypot(dx, dy);
      if (d > 8) this.state.aim = Math.atan2(dy, dx);
      out.fire = d > 28;
    }
    for (const k in this.edges) out[k] = true;
    this.edges = {};
    return out;
  }
}
