// Native-resolution renderer, input routing and scene switching.

export const W = 384, H = 216;

export const engine = {
  native: null, ctx: null, display: null, dctx: null,
  scene: null, time: 0, scale: 1, crt: true,
  keysDown: new Set(),
  shake: { t: 0, mag: 0 },
  flash: { t: 0, color: '#fff', dur: 0.1 },
};

export function setScene(scene) {
  engine.scene?.exit?.();
  engine.scene = scene;
  scene.enter?.();
}

export function shake(mag = 3, t = 0.25) {
  if (mag >= engine.shake.mag || engine.shake.t <= 0) { engine.shake.mag = mag; engine.shake.t = t; }
}
export function flash(color = '#fff', dur = 0.08) {
  engine.flash = { t: dur, color, dur };
}

function resize() {
  const d = engine.display;
  const vw = window.innerWidth, vh = window.innerHeight;
  let s = Math.min(vw / W, vh / H);
  if (s >= 2) s = Math.floor(s);
  engine.scale = s;
  const dpr = window.devicePixelRatio || 1;
  const cw = Math.round(W * s), ch = Math.round(H * s);
  d.style.width = cw + 'px';
  d.style.height = ch + 'px';
  d.width = Math.round(cw * dpr);
  d.height = Math.round(ch * dpr);
  engine.dctx = d.getContext('2d');
  engine.dctx.imageSmoothingEnabled = false;
  engine.scan = null;
}

function scanlines(w, h) {
  // One darkened line per native row, sized to the display.
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const rowH = h / H;
  if (rowH >= 3) {
    x.fillStyle = 'rgba(0,0,0,0.22)';
    for (let r = 0; r < H; r++) x.fillRect(0, Math.round(r * rowH + rowH * 0.66), w, Math.max(1, Math.round(rowH * 0.34)));
  }
  const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.38)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  return c;
}

function toNative(e) {
  const r = engine.display.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

export function start(canvas) {
  engine.display = canvas;
  engine.native = document.createElement('canvas');
  engine.native.width = W;
  engine.native.height = H;
  engine.ctx = engine.native.getContext('2d');
  engine.ctx.imageSmoothingEnabled = false;
  resize();
  window.addEventListener('resize', resize);
  try { engine.crt = localStorage.getItem('hm_crt') !== '0'; } catch {}

  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    const k = normKey(e);
    if (!k) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab', 'Backspace'].includes(e.key)) e.preventDefault();
    if (k === 'F2' || (k === 'C' && e.shiftKey)) {
      engine.crt = !engine.crt;
      try { localStorage.setItem('hm_crt', engine.crt ? '1' : '0'); } catch {}
      return;
    }
    const repeat = engine.keysDown.has(k);
    engine.keysDown.add(k);
    engine.scene?.onKey?.(k, { repeat, raw: e });
  });
  window.addEventListener('keyup', (e) => { engine.keysDown.delete(normKey(e)); });
  window.addEventListener('blur', () => engine.keysDown.clear());

  const ptr = (type) => (e) => {
    const p = toNative(e);
    engine.pointer = p;
    engine.scene?.onPointer?.(type, p.x, p.y, e);
  };
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); ptr('down')(e); });
  canvas.addEventListener('pointermove', ptr('move'));
  canvas.addEventListener('pointerup', ptr('up'));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  let last = performance.now();
  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    try { step(dt); } catch (err) { console.error(err); }
  };
  const step = (dt) => {
    engine.time += dt;
    const ctx = engine.ctx;
    engine.scene?.update?.(dt);
    ctx.save();
    let ox = 0, oy = 0;
    if (engine.shake.t > 0) {
      engine.shake.t -= dt;
      const m = engine.shake.mag * Math.max(0, Math.min(1, engine.shake.t / 0.25));
      ox = Math.round((Math.random() * 2 - 1) * m);
      oy = Math.round((Math.random() * 2 - 1) * m);
    }
    engine.offset = { x: ox, y: oy };
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    engine.scene?.draw?.(ctx, ox, oy);
    ctx.restore();
    if (engine.flash.t > 0) {
      engine.flash.t -= dt;
      ctx.globalAlpha = Math.max(0, engine.flash.t / engine.flash.dur);
      ctx.fillStyle = engine.flash.color;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    const d = engine.dctx, dw = engine.display.width, dh = engine.display.height;
    d.imageSmoothingEnabled = false;
    d.drawImage(engine.native, 0, 0, dw, dh);
    if (engine.crt) {
      if (!engine.scan || engine.scan.width !== dw || engine.scan.height !== dh) engine.scan = scanlines(dw, dh);
      d.drawImage(engine.scan, 0, 0);
    }
  };
  requestAnimationFrame(frame);
}

function normKey(e) {
  const k = e.key;
  if (!k) return null;
  if (k.length === 1) return k.toUpperCase();
  return k;
}
