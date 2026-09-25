// Keyboard + mouse (+ basic gamepad) input. Produces raw per-tick state;
// the world turns it into a command (it knows about ladders, aim origin...).

const BINDS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown', 'ControlLeft'],
  jump: ['Space'],
  dash: ['ShiftLeft', 'ShiftRight'],
  swap: ['KeyQ'],
  bomb: ['KeyG'],
  interact: ['KeyE'],
  super: ['KeyF'],
  reload: ['KeyR'],
  taunt: ['KeyT'],
  melee: ['KeyV'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.edges = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, left: false, right: false };
    this.mouseEdges = { left: false, right: false };
    this.wheel = 0;
    this.enabled = true;
    this.onKey = null;
    this.usingPad = false;
    this.padAim = null;

    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.edges.add(e.code);
      this.keys.add(e.code);
      this.usingPad = false;
      if (this.onKey && !e.repeat) this.onKey(e.code, true);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (this.onKey) this.onKey(e.code, false);
    });
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.usingPad = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.left = true; this.mouseEdges.left = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouseEdges.right = true; }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
  }

  down(action) {
    return BINDS[action].some((k) => this.keys.has(k));
  }

  pressed(action) {
    return BINDS[action].some((k) => this.edges.has(k));
  }

  // Sample and consume edges for one simulation tick.
  sample() {
    const pad = this.readPad();
    const s = {
      mx: (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0),
      up: this.down('up'),
      down: this.down('down'),
      jump: this.down('jump'),
      upP: this.pressed('up'),
      jumpP: this.pressed('jump'),
      fire: this.mouse.left,
      meleeP: this.mouseEdges.right || this.pressed('melee'),
      dashP: this.pressed('dash'),
      swapP: this.pressed('swap') || this.wheel !== 0,
      bombP: this.pressed('bomb'),
      interactP: this.pressed('interact'),
      superP: this.pressed('super'),
      reloadP: this.pressed('reload'),
      tauntP: this.pressed('taunt'),
    };
    if (pad) {
      if (Math.abs(pad.lx) > 0.3) s.mx = Math.sign(pad.lx);
      s.up = s.up || pad.ly < -0.6;
      s.down = s.down || pad.ly > 0.6;
      s.jump = s.jump || pad.a;
      s.jumpP = s.jumpP || pad.aP;
      s.fire = s.fire || pad.rt;
      s.meleeP = s.meleeP || pad.xP;
      s.dashP = s.dashP || pad.bP;
      s.swapP = s.swapP || pad.yP;
      s.bombP = s.bombP || pad.lbP;
      s.superP = s.superP || pad.rbP;
      s.interactP = s.interactP || pad.dpadUpP;
      s.reloadP = s.reloadP || pad.dpadDownP;
    }
    this.edges.clear();
    this.mouseEdges.left = this.mouseEdges.right = false;
    this.wheel = 0;
    return this.enabled ? s : { mx: 0 };
  }

  readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    if (!gp) return null;
    const prev = this._padPrev || {};
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const cur = { a: b(0), b: b(1), x: b(2), y: b(3), lb: b(4), rb: b(5), rt: b(7) || (gp.buttons[7] && gp.buttons[7].value > 0.3), up: b(12), dn: b(13) };
    const res = {
      lx: gp.axes[0] || 0, ly: gp.axes[1] || 0, rx: gp.axes[2] || 0, ry: gp.axes[3] || 0,
      a: cur.a, aP: cur.a && !prev.a, bP: cur.b && !prev.b, xP: cur.x && !prev.x, yP: cur.y && !prev.y,
      lbP: cur.lb && !prev.lb, rbP: cur.rb && !prev.rb, rt: cur.rt, dpadUpP: cur.up && !prev.up, dpadDownP: cur.dn && !prev.dn,
    };
    this._padPrev = cur;
    if (Math.hypot(res.rx, res.ry) > 0.35) {
      this.padAim = Math.atan2(res.ry, res.rx);
      this.usingPad = true;
    }
    if (Object.values(cur).some(Boolean) || Math.abs(res.lx) > 0.3) this.usingPad = this.usingPad || Math.hypot(res.rx, res.ry) > 0.35;
    return res;
  }
}
