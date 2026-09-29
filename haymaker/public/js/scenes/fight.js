import { W, H, engine, setScene, shake, flash } from '../engine.js';
import { drawText, textWidth, STYLE } from '../gfx/font.js';
import { FIGHTER_BY_ID, REFEREE } from '../gfx/fighters.js';
import { FighterView, prewarm } from '../gfx/view.js';
import { FX, drawStar } from '../gfx/fx.js';
import { Button, panel, blink } from '../ui.js';
import { sfx, music } from '../audio.js';
import { net } from '../net.js';
import { backdrop, logo, flashes } from './common.js';
import { app } from '../app.js';
import { ACTIONS, CONFIG, allowed, clockText } from '/shared/rules.js';

const OPP_X = 192, OPP_Y = 262, OPP_S = 1.25;
const ME_X = 192, ME_Y = 300, ME_S = 1;
const REF_X = 316, REF_Y = 246, REF_S = 1.05;

const ATTACK_ANIM = {
  JAB: ['jabWind', 'jab'],
  HOOK_L: ['hookLWind', 'hookL'],
  HOOK_R: ['hookRWind', 'hookR'],
  BODY: ['bodyWind', 'body'],
  UPPER: ['windup', 'upper'],
  STAR: ['starWind', 'star'],
};
const FALL_KEYS = (isMe) => isMe
  ? [{ p: 'fall1', d: 0.16, dy: 14 }, { p: 'fall2', d: 0.2, dy: 50 }, { p: 'down', d: 9, dy: 140, hold: true }]
  : [{ p: 'fall1', d: 0.16, dy: 0 }, { p: 'fall2', d: 0.22, dy: -40, tween: true }, { p: 'down', d: 9, dy: -96, hold: true }];
const DEF_ANIM = { GUARD: 'guard', LOW: 'low', SLIP_L: 'slipL', SLIP_R: 'slipR', DUCK: 'duck', WINDUP: 'windup' };
// Sprite offsets while striking, from behind (me) and in front (opponent).
const STRIKE_OFF_ME = { JAB: [-8, -40], HOOK_L: [12, -38], HOOK_R: [-12, -38], BODY: [0, -16], UPPER: [0, -44], STAR: [0, -42] };
const STRIKE_OFF_OPP = { JAB: [4, 8], HOOK_L: [-6, 8], HOOK_R: [6, 8], BODY: [0, 10], UPPER: [0, 2], STAR: [0, 12] };

const TIPS = {
  JAB: 'FAST + CHEAP. STOPS BODY SHOTS AND WIND-UPS. SLIPS MAKE IT WHIFF.',
  HOOK_L: 'HEAVY. PLOWS THROUGH JABS. SLIP LEFT DODGES IT, SLIP RIGHT EATS 1.5X.',
  HOOK_R: 'HEAVY. PLOWS THROUGH JABS. SLIP RIGHT DODGES IT, SLIP LEFT EATS 1.5X.',
  BODY: 'BEATS GUARD, SLIPS AND DUCKS. DRAINS STAMINA. LOW GUARD STOPS IT.',
  WINDUP: 'LOAD AN UPPERCUT FOR NEXT BEAT. YOUR RIVAL WILL SEE IT COMING.',
  UPPER: 'HUGE HIT + STUN. SHRUGS OFF JABS. SLIPS DODGE IT, DUCKS EAT 1.5X.',
  STAR: 'SPENDS ALL STARS. FAST AND HEAVY. ONLY SLIPS AND DUCKS AVOID IT.',
  GUARD: 'BLOCKS HEAD SHOTS AND TIRES THE PUNCHER. BODY SHOTS GO THROUGH.',
  LOW: 'STOPS BODY SHOTS COLD AND EARNS A COUNTER. HEAD IS WIDE OPEN.',
  SLIP_L: 'DODGE LEFT: BEATS JABS, UPPERCUTS, LEFT HOOKS. EARNS A COUNTER.',
  SLIP_R: 'DODGE RIGHT: BEATS JABS, UPPERCUTS, RIGHT HOOKS. EARNS A COUNTER.',
  DUCK: 'UNDER JABS AND HOOKS - COUNTERS HOOKS. BODY SHOTS PUNISH IT 1.5X.',
};

const LABEL = {
  JAB: 'JAB', HOOK_L: 'L HOOK', HOOK_R: 'R HOOK', BODY: 'BODY', WINDUP: 'WIND UP', UPPER: 'UPPERCUT', STAR: 'STAR PUNCH',
  GUARD: 'GUARD', LOW: 'LOW GUARD', SLIP_L: 'SLIP LEFT', SLIP_R: 'SLIP RIGHT', DUCK: 'DUCK', STUNNED: 'STUNNED',
};

// Command chips, laid out like the keyboard.
const CHIP_W = 41, CHIP_H = 12;
function chipLayout() {
  const L = 4, R = W - 4 - (CHIP_W * 3 + 4);
  const col = (x0, c) => x0 + c * (CHIP_W + 2);
  return [
    { a: 'GUARD', key: 'W', x: col(L, 1), y: 174, label: 'GUARD' },
    { a: 'SLIP_L', key: 'A', x: col(L, 0), y: 188, label: '[ SLIP' },
    { a: 'LOW', key: 'S', x: col(L, 1), y: 188, label: 'LOW' },
    { a: 'SLIP_R', key: 'D', x: col(L, 2), y: 188, label: 'SLIP ]' },
    { a: 'DUCK', key: 'X', x: col(L, 1), y: 202, label: 'DUCK' },
    { a: 'HOOK_L', key: 'U', x: col(R, 0), y: 188, label: 'L HOOK' },
    { a: 'WINDUP', key: 'I', x: col(R, 1), y: 188, label: 'WIND UP' },
    { a: 'HOOK_R', key: 'O', x: col(R, 2), y: 188, label: 'R HOOK' },
    { a: 'JAB', key: 'J', x: col(R, 0), y: 202, label: 'JAB' },
    { a: 'BODY', key: 'K', x: col(R, 1), y: 202, label: 'BODY' },
    { a: 'STAR', key: 'L', x: col(R, 2), y: 202, label: 'STAR' },
  ];
}
const KEYMAP = {
  W: 'GUARD', ArrowUp: 'GUARD', A: 'SLIP_L', ArrowLeft: 'SLIP_L', S: 'LOW', D: 'SLIP_R', ArrowRight: 'SLIP_R',
  X: 'DUCK', ArrowDown: 'DUCK', U: 'HOOK_L', I: 'WINDUP', O: 'HOOK_R', J: 'JAB', K: 'BODY', L: 'STAR',
};

export class FightScene {
  constructor() {
    const r = net.room;
    this.me = FIGHTER_BY_ID[r.fighters[net.you]];
    this.opp = FIGHTER_BY_ID[r.fighters[1 - net.you]];
    this.vMe = new FighterView(this.me, 'back', ME_S, ME_X, ME_Y);
    this.vOpp = new FighterView(this.opp, 'front', OPP_S, OPP_X, OPP_Y);
    this.vRef = new FighterView(REFEREE, 'front', REF_S, REF_X, REF_Y);
    this.vRef.visible = false;
    this.vRef.setBase('ref');
    prewarm(this.opp, 'front', OPP_S);
    setTimeout(() => prewarm(REFEREE, 'front', REF_S), 200);
    prewarm(this.me, 'back', ME_S);
    this.fx = new FX();
    this.chips = chipLayout();
    this.events = [];
    this.clock = 0;
    this.phase = null;
    this.banner = null;
    this.disp = null;
    this.reveal = null;
    this.hover = null;
    this.myPick = null;
    this.oppLocked = false;
    this.down = null;
    this.count = 0;
    this.mashP = [0, 0];
    this.overBtns = [];
    this.off = net.on((m) => this.onMsg(m));
  }

  enter() {
    this.syncFromRoom(net.room, true);
  }
  exit() { this.off(); }

  // --- helpers --------------------------------------------------------------
  st(side) { const s = net.room?.state; return s ? s[side === 'me' ? net.you : 1 - net.you] : null; }
  view(side) { return side === 'me' ? this.vMe : this.vOpp; }
  at(ms, fn) { this.events.push({ at: this.clock + ms / 1000, fn }); }
  showBanner(text, style = STYLE.gold, dur = 1.1, scale = 4, y = 76) { this.banner = { text, style, t: 0, dur, scale, y }; }

  syncDisp(force) {
    const me = this.st('me'), opp = this.st('opp');
    if (!me) return;
    const mk = (s, d) => ({ ...s, lag: d && !force ? d.lag : s.hp });
    this.disp = { me: mk(me, this.disp?.me), opp: mk(opp, this.disp?.opp) };
  }

  basePose(side) {
    const s = this.st(side);
    if (!s) return 'idle';
    if (s.hp <= 0) return 'down';
    if (s.stunned) return 'stun';
    if (s.loaded) return 'loaded';
    if (s.stamina <= 2) return 'tired';
    return 'idle';
  }

  syncFromRoom(r, first = false) {
    if (!r) return;
    const prev = this.phase;
    this.phase = r.phase;
    if (first || !this.disp) this.syncDisp(true);
    if (r.phase === prev && !first) {
      if (r.phase === 'over' || r.phase === 'select') this.onPhase(r, prev);
      return;
    }
    this.onPhase(r, prev);
  }

  onPhase(r, prev) {
    switch (r.phase) {
      case 'round':
        this.syncDisp(true);
        this.reveal = null;
        this.down = null;
        this.vMe.setBase('idle'); this.vOpp.setBase('idle');
        this.vMe.track = this.vOpp.track = null;
        this.vRef.visible = false;
        music(null);
        this.showBanner(r.round === CONFIG.rounds ? 'FINAL ROUND' : `ROUND ${r.round}`, STYLE.white, 1.3, 3);
        this.at(1350, () => { this.showBanner('FIGHT!', STYLE.gold, 1.0, 5); sfx('bell'); sfx('cheer', 0, true); flashes.rate = 6; });
        this.at(2300, () => { music('fight'); flashes.rate = 1.5; });
        break;
      case 'pick':
        this.syncDisp(false);
        this.pickStart = engine.time;
        this.deadline = engine.time + (r.deadline || CONFIG.pickMs) / 1000;
        this.myPick = r.myPick && r.myPick !== 'STUNNED' ? r.myPick : null;
        this.oppLocked = !!r.locked?.[1 - net.you];
        this.lastTick = null;
        if (!this.vMe.busy()) this.vMe.setBase(this.basePose('me'));
        if (!this.vOpp.busy()) this.vOpp.setBase(this.basePose('opp'));
        if (this.st('me')?.stunned) this.fx.text('STUNNED!', ME_X, 120, STYLE.red, { life: 1.4 });
        if (this.st('opp')?.loaded && prev !== 'pick') this.fx.text('WIND UP!', OPP_X, 44, STYLE.red, { life: 1.2 });
        if (this.st('opp')?.stunned && prev !== 'pick') this.fx.text('FREE SHOT!', OPP_X, 44, STYLE.gold, { life: 1.2 });
        break;
      case 'break':
        music(null);
        sfx('bell');
        this.syncDisp(true);
        this.showBanner(`END OF ROUND ${r.round - 1}`, STYLE.white, 3.6, 2, 60);
        break;
      case 'over':
        this.onOver(r, prev);
        break;
      case 'paused':
        break;
    }
  }

  onOver(r, prev) {
    if (prev === 'over' && this.overShown) { this.updateOverBtns(); return; }
    this.overShown = true;
    music(null);
    const res = r.result;
    const iWin = res.winner === net.you, draw = res.winner == null;
    const title = res.method === 'KO' ? 'K.O.!' : res.method === 'TKO' ? 'T.K.O.!' : res.method === 'FORFEIT' ? 'FORFEIT' : draw ? 'DRAW' : 'DECISION';
    this.showBanner(title, res.method === 'KO' || res.method === 'TKO' ? STYLE.red : STYLE.gold, 99, 4, 40);
    if (res.method === 'KO' || res.method === 'TKO') {
      flash('#ffffff', 0.2); shake(6, 0.5); sfx('ko');
      if (!this.vRef.visible) this.refIn('refWave'); else { this.vRef.track = null; this.vRef.setBase('refWave'); }
    }
    this.down = null;
    sfx('bell', 0.2); sfx('cheer', 0.1, true);
    flashes.rate = 8;
    if (!draw) {
      const w = iWin ? this.vMe : this.vOpp, l = iWin ? this.vOpp : this.vMe;
      w.track = null; w.setBase('win');
      // Keep the winner's raised gloves on screen under the banner.
      if (!iWin) w.off = { x: 0, y: 34 };
      if (l.base !== 'down' && !(l.track && l.track.keys.at(-1).p === 'down')) l.setBase('tired');
    }
    this.overText = draw ? "IT'S A DRAW" : iWin ? 'YOU WIN!' : 'YOU LOSE...';
    this.overBtns = [
      new Button('REMATCH', W / 2 - 92, 176, 88, 16, () => { net.send({ t: 'rematch' }); sfx('lock'); }),
      new Button('MAIN MENU', W / 2 + 4, 176, 88, 16, () => { net.leave(); setScene(new app.scenes.TitleScene({ attract: false })); }, { color: '#4a4468', shade: '#1a1630' }),
    ];
    this.updateOverBtns();
  }

  updateOverBtns() {
    const r = net.room;
    if (!r || !this.overBtns.length) return;
    this.overBtns[0].label = r.rematch?.[net.you] ? 'WAITING...' : 'REMATCH';
    this.overBtns[0].active = !!r.rematch?.[net.you];
  }

  // --- network --------------------------------------------------------------
  onMsg(m) {
    switch (m.t) {
      case 'room': this.syncFromRoom(m); break;
      case 'locked':
        if (m.who === 'opp') { this.oppLocked = true; sfx('oppLock'); }
        break;
      case 'result': this.playResult(m); break;
      case 'knockdown': this.onKnockdown(m); break;
      case 'count':
        this.count = m.n;
        this.countT = 0;
        sfx('count');
        if (this.vRef.visible) this.vRef.play([{ p: 'refCount', d: 0.22 }, { p: 'refCount2', d: 0.26 }, { p: 'refLook', d: 0.2, tween: true }], () => this.vRef.setBase('refLook'));
        break;
      case 'mash': {
        const side = m.who === net.you ? 'me' : 'opp';
        this.mashP[side === 'me' ? 0 : 1] = m.progress;
        if (side === 'opp' && Math.random() < 0.4) this.vOpp.jolt.y = -2;
        break;
      }
      case 'getup': this.onGetUp(m); break;
      case 'presence':
        if (m.who !== net.you) app.toast(m.connected ? 'RIVAL RECONNECTED' : 'RIVAL DISCONNECTED');
        break;
      case 'net':
        if (!m.connected) app.toast('CONNECTION LOST - RETRYING', 4);
        break;
    }
  }

  // --- exchange animation ----------------------------------------------------
  playResult(m) {
    const you = net.you;
    const acts = { me: m.acts[you], opp: m.acts[1 - you] };
    const res = { me: m.result[you], opp: m.result[1 - you] };
    this.reveal = { me: acts.me, opp: acts.opp, t: 0 };
    this.myPick = null;
    this.pendingState = m.state;
    const other = (s) => (s === 'me' ? 'opp' : 'me');
    for (const side of ['me', 'opp']) this.animAction(side, acts[side], res[side], res[other(side)]);
    for (const side of ['me', 'opp']) this.animReaction(side, acts, res);
    // Update HUD and base poses after the exchange.
    this.at(1500, () => {
      const s = m.state;
      const me = s[you], opp = s[1 - you];
      for (const [side, st] of [['me', me], ['opp', opp]]) {
        const v = this.view(side);
        if (st.hp <= 0) return;
        const base = st.stunned ? 'stun' : st.loaded ? 'loaded' : st.stamina <= 2 ? 'tired' : 'idle';
        if (!v.busy()) v.setBase(base);
        else v.track.onDone = () => v.setBase(base);
      }
    });
  }

  animAction(side, act, r, otherRes) {
    const v = this.view(side);
    const isMe = side === 'me';
    v.setBase('idle');
    const A = ACTIONS[act];
    if (A?.kind === 'atk') {
      const [wind, strike] = ATTACK_ANIM[act];
      const contact = r.at || 240;
      const off = (isMe ? STRIKE_OFF_ME : STRIKE_OFF_OPP)[act];
      const windD = Math.max(0.05, (contact - 60) / 1000);
      const keys = [
        { p: wind, d: windD, tween: act !== 'UPPER' && act !== 'JAB' },
        { p: strike, d: 0.08, dx: off[0] * 0.6, dy: off[1] * 0.6 },
      ];
      if (r.outcome === 'stuffed') {
        v.play([{ p: wind, d: 2, hold: true }]);
        return;
      }
      const whiff = r.outcome === 'evade';
      keys.push({ p: strike, d: whiff ? 0.36 : 0.26, dx: off[0], dy: off[1] + (whiff && isMe ? -4 : 0) });
      keys.push({ p: 'idle', d: 0.22, tween: true });
      v.play(keys);
      this.at(contact - 70, () => sfx(act === 'JAB' ? 'swing' : 'whoosh'));
      if (act === 'STAR') { sfx('star'); this.fx.stars(v.point('gloveR').x, v.point('gloveR').y, 8); }
      if (act === 'UPPER') sfx('windup');
      if (whiff) this.at(contact + 20, () => {
        const p = isMe ? { x: ME_X + off[0], y: 110 } : this.vOpp.point(act === 'HOOK_L' ? 'gloveL' : 'gloveR');
        this.fx.whiff(p.x, p.y, act === 'HOOK_L' ? 1 : -1);
      });
      return;
    }
    if (act === 'WINDUP') {
      v.play([{ p: 'windup', d: 0.16, tween: true }, { p: 'windup', d: 1.2 }], () => v.setBase('loaded'));
      sfx('windup');
      if (r.reaction === 'none') this.at(200, () => this.fx.text(isMe ? 'LOADED!' : 'WINDING UP!', isMe ? 104 : OPP_X, isMe ? 150 : 44, STYLE.red, { life: 1 }));
      return;
    }
    if (act === 'STUNNED') {
      v.setBase('stun');
      return;
    }
    const pose = DEF_ANIM[act] || 'guard';
    const slipOff = isMe ? { SLIP_L: -18, SLIP_R: 18 }[act] || 0 : 0;
    const duckOff = isMe && act === 'DUCK' ? 14 : 0;
    v.play([
      { p: pose, d: 0.07, tween: true, dx: slipOff, dy: duckOff },
      { p: pose, d: 0.75, dx: slipOff, dy: duckOff },
      { p: 'idle', d: 0.2, tween: true },
    ]);
  }

  animReaction(side, acts, res) {
    const r = res[side];
    const other = side === 'me' ? 'opp' : 'me';
    const ro = res[other];
    const v = this.view(side);
    const isMe = side === 'me';
    const oAct = acts[other];
    const t = ro.at || r.at || 240;
    const textPos = () => {
      if (isMe) return { x: 104, y: 150 };
      const h = this.vOpp.point('head');
      return { x: Math.min(W - 56, h.x + 62), y: Math.max(44, h.y - 8) };
    };
    const tags = r.tags || [];
    const say = (text, style, delay = 0) => this.at(t + delay, () => { const p = textPos(); this.fx.text(text, p.x, p.y, style, { life: 0.9 }); });

    if (ro.counterHit) this.at(t, () => { this.fx.text('COUNTER!', W / 2, 42, isMe ? STYLE.red : STYLE.gold, { life: 1, scale: 2 }); sfx('counter'); });

    switch (r.reaction) {
      case 'head':
      case 'stun':
      case 'guardbreak':
      case 'body': {
        const body = r.reaction === 'body';
        const heavy = r.took >= 18 || r.reaction === 'stun';
        this.at(t, () => {
          const hurt = body ? 'hurtBody' : oAct === 'HOOK_L' || Math.random() < 0.5 ? 'hurtHead' : 'hurtHead2';
          const hurtDx = isMe ? (oAct === 'HOOK_L' ? 8 : oAct === 'HOOK_R' ? -8 : 0) : 0;
          const hurtDy = isMe ? 8 : -4;
          const keys = [{ p: hurt, d: heavy ? 0.45 : 0.3, dx: hurtDx, dy: hurtDy }];
          if (r.down) {
            keys.push(...FALL_KEYS(isMe));
          } else if (r.reaction === 'stun') {
            keys.push({ p: 'stun', d: 0.4 });
          } else keys.push({ p: 'idle', d: 0.25, tween: true });
          v.play(keys, () => { if (r.reaction === 'stun') v.setBase('stun'); });
          v.hit(isMe ? '#ff6040' : heavy ? '#ffffff' : '#fff0d0', heavy ? 0.12 : 0.07);
          v.jolt.x = (Math.random() - 0.5) * 6;
          v.jolt.y = isMe ? 6 : -4;
          const p = isMe ? { x: ME_X + hurtDx, y: body ? 150 : 104 } : this.vOpp.point(body ? 'waist' : 'head');
          this.fx.burst(p.x, p.y + (body ? 0 : isMe ? 0 : 4), heavy ? 1.6 : 1);
          this.fx.sweat(p.x, p.y, heavy ? 10 : 5);
          if (r.reaction === 'stun' || oAct === 'STAR') this.fx.stars(p.x, p.y, 6);
          const tp = textPos();
          this.fx.text(`-${r.took}`, tp.x, tp.y + 12, STYLE.red, { life: 0.8, rise: 10 });
          sfx(heavy ? 'heavy' : body ? 'body' : 'hit');
          if (heavy) { flash(isMe ? '#ff2020' : '#ffffff', 0.12); sfx('cheer', 0.05, true); flashes.rate = 10; setTimeout(() => (flashes.rate = 1.5), 900); }
          shake(heavy ? 6 : isMe ? 4 : 2.5, heavy ? 0.4 : 0.22);
          if (isMe) this.redEdge = 0.35;
          this.applyDamage(side, r.took);
          if (r.lostStar) this.starLoss = { side, t: 0 };
        });
        if (tags.includes('WRONG WAY')) say('WRONG WAY!', STYLE.red, 60);
        else if (tags.includes('CAUGHT')) say('CAUGHT!', STYLE.red, 60);
        else if (tags.includes('GUARD BREAK')) say('GUARD BREAK!', STYLE.red, 60);
        else if (tags.includes('INTERRUPT') && ACTIONS[acts[side]]?.kind === 'atk') say('STUFFED!', STYLE.red, 60);
        else if (tags.includes('TRADE') && !isMe) this.at(t + 60, () => this.fx.text('TRADE!', W / 2, 42, STYLE.white, { life: 0.9, scale: 2 }));
        break;
      }
      case 'block':
        this.at(t, () => {
          const p = isMe ? { x: ME_X, y: 120 } : this.vOpp.point('gloveL');
          this.fx.burst(p.x, p.y, 0.7, 'block');
          this.fx.block(p.x, p.y);
          v.jolt.y = isMe ? 4 : -3;
          sfx('block');
          shake(1.5, 0.12);
          this.applyDamage(side, r.took);
          if (tags.includes('PERFECT')) { this.fx.text('PERFECT BLOCK!', textPos().x, textPos().y, STYLE.blue, { life: 1 }); const p = textPos(); if (isMe) this.at(350, () => { this.fx.text('COUNTER READY', p.x, p.y + 12, STYLE.gold, { life: 1.1 }); sfx('counter'); }); }
          else this.fx.text('BLOCKED', textPos().x, textPos().y, STYLE.blue, { life: 0.7 });
        });
        break;
      case 'dodge':
        this.at(t, () => {
          const p = textPos();
          this.fx.text(tags.includes('DUCKED') ? 'DUCKED!' : 'SLIPPED!', p.x, p.y, STYLE.blue, { life: 0.8 });
          sfx('whoosh');
        });
        this.at(t + 380, () => {
          const p = textPos();
          if (isMe) { this.fx.text('COUNTER READY', p.x, p.y + 12, STYLE.gold, { life: 1.1 }); sfx('counter'); }
          else this.fx.text('COUNTER READY', p.x, p.y + 12, STYLE.red, { life: 1 });
        });
        break;
    }
  }

  applyDamage(side, took) {
    if (!this.disp) return;
    const d = this.disp[side];
    d.hp = Math.max(0, d.hp - took);
    d.hitT = 0.3;
  }

  onKnockdown(m) {
    music(null);
    const downSides = m.down.map((i) => (i === net.you ? 'me' : 'opp'));
    this.down = { sides: downSides, tko: !!m.tko, need: m.need, t: 0 };
    this.count = 0;
    this.mashP = [0, 0];
    this.syncDisp(true);
    sfx('down');
    sfx('cheer', 0.1, true);
    flashes.rate = 9;
    shake(5, 0.4);
    for (const s of downSides) {
      const v = this.view(s);
      if (!v.busy() || v.track.keys[v.track.keys.length - 1].p !== 'down') v.play(FALL_KEYS(s === 'me').slice(-1));
    }
    // The one still standing heads for a neutral corner.
    if (downSides.length === 1 && !m.tko) {
      if (downSides[0] === 'opp') this.vMe.play([{ p: 'idle', d: 0.6, dx: -104, dy: 8, tween: true }, { p: 'idle', d: 99, dx: -104, dy: 8, hold: true }]);
      else { this.vOpp.track = null; this.vOpp.setBase('taunt'); }
    }
    this.showBanner(m.tko ? 'T.K.O.!' : 'DOWN!', STYLE.red, 1.4, 5, 64);
    this.refIn(m.tko ? 'refWave' : 'refLook');
  }

  refIn(base = 'refLook') {
    const r = this.vRef;
    r.visible = true;
    r.setBase(base);
    r.play([{ p: 'refIdle', d: 0.01, dx: 140 }, { p: 'refIdle', d: 0.45, dx: 0, tween: true }], () => r.setBase(base));
  }

  refOut() {
    const r = this.vRef;
    if (!r.visible) return;
    r.play([{ p: 'refWave2', d: 0.35 }, { p: 'refIdle', d: 0.5, dx: 150, tween: true }, { p: 'refIdle', d: 5, dx: 150, hold: true }]);
    setTimeout(() => { if (!this.down) r.visible = false; }, 1100);
  }

  onGetUp(m) {
    const side = m.who === net.you ? 'me' : 'opp';
    const v = this.view(side);
    v.play([
      { p: 'fall2', d: 0.18, dy: side === 'me' ? 40 : -40 },
      { p: 'fall1', d: 0.18, dy: side === 'me' ? 12 : -8 },
      { p: 'idle', d: 0.22, tween: true },
    ], () => v.setBase('idle'));
    const other = side === 'me' ? this.vOpp : this.vMe;
    if (side === 'opp') this.vMe.play([{ p: 'idle', d: 0.5, tween: true }], () => this.vMe.setBase('idle'));
    else { other.setBase('idle'); }
    if (this.disp) this.disp[side].hp = this.disp[side].lag = m.hp;
    const st = this.st(side);
    if (st) st.hp = m.hp;
    this.fx.text(side === 'me' ? 'BACK UP!' : 'UP AT ' + m.count + '!', W / 2, 96, STYLE.gold, { life: 1.3, scale: 2 });
    sfx('cheer', 0, true);
    flashes.rate = 1.5;
    if (!this.down) return;
    this.down.sides = this.down.sides.filter((s) => s !== side);
    if (!this.down.sides.length) { this.down = null; this.refOut(); setTimeout(() => music('fight'), 1500); }
  }

  // --- input ----------------------------------------------------------------
  canPick() {
    const me = this.st('me');
    return this.phase === 'pick' && me && !me.stunned;
  }

  chipAction(c) {
    // The wind-up chip turns into the uppercut once loaded.
    if (c.a === 'WINDUP' && this.st('me')?.loaded) return 'UPPER';
    return c.a;
  }

  choose(a) {
    if (!this.canPick()) return;
    const me = this.st('me');
    if (a === 'WINDUP' && me.loaded) a = 'UPPER';
    if (!allowed(me, a)) { sfx('error'); this.denied = { a, t: 0.3 }; return; }
    this.myPick = a;
    sfx('lock');
    net.send({ t: 'pick', a });
  }

  mash() {
    if (!this.down || !this.down.sides.includes('me') || this.down.tko) return;
    net.send({ t: 'mash' });
    this.vMe.jolt.y = -3;
    sfx('tick');
  }

  onKey(k, { repeat } = {}) {
    if (this.phase === 'over') {
      if (k === 'Enter' || k === 'R') this.overBtns[0]?.onClick();
      if (k === 'Escape') this.overBtns[1]?.onClick();
      return;
    }
    if (this.down && this.down.sides.includes('me')) {
      if (!repeat) this.mash();
      return;
    }
    if (repeat) return;
    const a = KEYMAP[k];
    if (a) this.choose(a);
  }

  onPointer(type, x, y) {
    if (this.phase === 'over') { for (const b of this.overBtns) b.pointer(type, x, y); return; }
    if (this.down && this.down.sides.includes('me')) { if (type === 'down') this.mash(); return; }
    this.hover = null;
    for (const c of this.chips) {
      if (x >= c.x && x < c.x + CHIP_W && y >= c.y && y < c.y + CHIP_H) {
        this.hover = this.chipAction(c);
        if (type === 'down') this.choose(this.chipAction(c));
      }
    }
  }

  // --- update ---------------------------------------------------------------
  update(dt) {
    this.clock += dt;
    const due = this.events.filter((e) => e.at <= this.clock);
    this.events = this.events.filter((e) => e.at > this.clock);
    for (const e of due) e.fn();
    this.vMe.update(dt);
    this.vOpp.update(dt);
    this.vRef.update(dt);
    this.fx.update(dt);
    flashes.update(dt);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
    if (this.reveal) this.reveal.t += dt;
    if (this.redEdge > 0) this.redEdge -= dt;
    if (this.denied) { this.denied.t -= dt; if (this.denied.t <= 0) this.denied = null; }
    if (this.down) this.down.t += dt;
    if (this.countT !== undefined) this.countT += dt;
    if (this.starLoss) { this.starLoss.t += dt; if (this.starLoss.t > 0.6) this.starLoss = null; }
    if (this.disp) {
      for (const d of [this.disp.me, this.disp.opp]) {
        if (d.lag > d.hp) d.lag = Math.max(d.hp, d.lag - dt * 30);
        else d.lag = d.hp;
        if (d.hitT > 0) d.hitT -= dt;
      }
    }
    // Countdown ticks in the last seconds.
    if (this.phase === 'pick') {
      const left = Math.ceil(this.deadline - engine.time);
      if (left <= 3 && left >= 1 && left !== this.lastTick) { this.lastTick = left; sfx('tick'); }
    }
  }

  // --- drawing --------------------------------------------------------------
  draw(ctx, ox, oy) {
    backdrop(ctx, 0, ox, oy);
    this.vOpp.draw(ctx, ox, oy);
    this.vRef.draw(ctx, ox, oy);
    this.drawTells(ctx, ox, oy);
    this.vMe.draw(ctx, ox, oy);
    this.fx.draw(ctx);
    if (this.redEdge > 0) {
      ctx.fillStyle = `rgba(255,0,0,${0.5 * this.redEdge})`;
      ctx.fillRect(0, 0, W, 4); ctx.fillRect(0, H - 4, W, 4); ctx.fillRect(0, 0, 4, H); ctx.fillRect(W - 4, 0, 4, H);
    }
    this.drawHUD(ctx);
    if (this.phase === 'pick') this.drawPickUI(ctx);
    if (this.reveal && this.reveal.t < 2.2 && this.phase !== 'pick') this.drawReveal(ctx);
    if (this.down) this.drawDown(ctx);
    if (this.phase === 'break') this.drawBreak(ctx);
    if (this.phase === 'paused') this.drawPaused(ctx);
    if (this.banner) this.drawBanner(ctx);
    if (this.phase === 'over') this.drawOver(ctx);
    if (app.toastText) {
      const w = textWidth(app.toastText, { small: true }) + 12;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(W / 2 - w / 2, 40, w, 11);
      drawText(ctx, app.toastText, W / 2, 43, { small: true, color: '#ffd21a', align: 'center' });
    }
  }

  drawTells(ctx, ox, oy) {
    const s = this.st('opp');
    if (!s || this.phase !== 'pick') return;
    const hp = this.vOpp.point('head');
    const y = Math.round(hp.y - 36 + oy);
    if (s.loaded && blink(4)) {
      // Punch-Out style warning flash over the head.
      drawText(ctx, '!', Math.round(hp.x + ox), y, { ...STYLE.red, align: 'center', scale: 2 });
    }
    if (s.stunned) {
      const t = engine.time * 5;
      for (let i = 0; i < 3; i++) {
        const a = t + (i * Math.PI * 2) / 3;
        drawStar(ctx, Math.round(hp.x + Math.cos(a) * 18 + ox), Math.round(hp.y - 22 + Math.sin(a) * 5 + oy), true);
      }
    }
    if (s.counter && blink(3)) {
      for (const g of ['gloveL', 'gloveR']) {
        const p = this.vOpp.point(g);
        drawStar(ctx, Math.round(p.x + ox), Math.round(p.y - 14 + oy), true);
      }
    }
    const me = this.st('me');
    if (me?.stunned) {
      const t = engine.time * 5;
      for (let i = 0; i < 3; i++) {
        const a = t + (i * Math.PI * 2) / 3;
        drawStar(ctx, Math.round(ME_X + Math.cos(a) * 18 + ox), Math.round(106 + Math.sin(a) * 5 + oy), true);
      }
    }
  }

  drawHUD(ctx) {
    const d = this.disp;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, 30);
    ctx.fillStyle = '#ffd21a'; ctx.fillRect(0, 30, W, 1);
    ctx.fillStyle = '#6a3a00'; ctx.fillRect(0, 31, W, 1);
    if (!d) return;
    const r = net.room;
    this.drawSide(ctx, 'me', d.me, 4, false);
    this.drawSide(ctx, 'opp', d.opp, W - 4, true);
    // Clock
    const beat = this.phase === 'pick' ? r.beat : Math.min(r.beat ?? 0, CONFIG.beatsPerRound);
    drawText(ctx, clockText(beat), W / 2, 2, { ...STYLE.gold, align: 'center', scale: 2 });
    drawText(ctx, `ROUND ${r.round || 1}`, W / 2, 20, { small: true, color: '#ffffff', align: 'center' });
  }

  drawSide(ctx, side, s, x, right) {
    const f = side === 'me' ? this.me : this.opp;
    const sgn = right ? -1 : 1;
    const nameStyle = side === 'me' ? { color: '#ffffff', shadow: '#402000' } : { color: '#ffffff', shadow: '#001040' };
    drawText(ctx, f.name, x, 2, { ...nameStyle, align: right ? 'right' : 'left' });
    // Health bar
    const bw = 124, bh = 7, by = 11;
    const bx = right ? x - bw : x;
    ctx.fillStyle = '#3a0a10';
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = '#1a0408';
    ctx.fillRect(bx, by, bw, bh);
    const pct = s.hp / CONFIG.maxHealth, lagPct = (s.lag ?? s.hp) / CONFIG.maxHealth;
    const fillW = Math.round(bw * pct), lagW = Math.round(bw * lagPct);
    const lx = right ? bx + bw - lagW : bx;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(lx, by, lagW, bh);
    const col = pct > 0.5 ? ['#aaff8a', '#3ae05a', '#1a9a3a'] : pct > 0.25 ? ['#fff0a0', '#ffd21a', '#c08a00'] : ['#ffb0a0', '#ff3a2a', '#a01010'];
    const fx = right ? bx + bw - fillW : bx;
    const flashOn = s.hitT > 0 && Math.floor(s.hitT * 30) % 2;
    ctx.fillStyle = flashOn ? '#ffffff' : col[1];
    ctx.fillRect(fx, by, fillW, bh);
    if (!flashOn) {
      ctx.fillStyle = col[0]; ctx.fillRect(fx, by, fillW, 2);
      ctx.fillStyle = col[2]; ctx.fillRect(fx, by + bh - 2, fillW, 2);
    }
    // Segment ticks
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 1; i < 10; i++) ctx.fillRect(bx + Math.round((bw * i) / 10), by, 1, bh);
    // Stamina pips
    const py = 21;
    for (let i = 0; i < CONFIG.maxStamina; i++) {
      const px = right ? x - 5 - i * 5 : x + i * 5;
      const on = i < s.stamina;
      ctx.fillStyle = on ? (s.stamina <= 2 ? (blink(4) ? '#ff5a4a' : '#a02020') : '#5ac8ff') : '#1a2040';
      ctx.fillRect(px, py, 4, 5);
      if (on) { ctx.fillStyle = '#d8f4ff'; ctx.fillRect(px, py, 4, 1); }
    }
    // Stars
    for (let i = 0; i < CONFIG.maxStars; i++) {
      const sx = right ? x - 58 - i * 9 : x + 58 + i * 9;
      const lost = this.starLoss && this.starLoss.side === side && i === s.stars;
      if (i < s.stars || (lost && blink(8))) drawStar(ctx, sx, py + 2, true);
      else { ctx.fillStyle = '#2a2448'; ctx.fillRect(sx - 1, py + 1, 3, 3); }
    }
    // Status badges
    const badges = [];
    if (s.loaded) badges.push(['LOADED', '#ff3a2a']);
    if (s.counter) badges.push(['COUNTER', '#ffd21a']);
    if (s.stunned) badges.push(['STUNNED', '#ff8a00']);
    if (s.guardBroken) badges.push(['NO GUARD', '#a0a0c0']);
    if (s.stamina <= 2 && s.hp > 0) badges.push(['GASSED', '#5ac8ff']);
    let bxp = right ? x - 90 : x + 90;
    for (const [t, c] of badges.slice(0, 2)) {
      const w = t.length * 4 + 3;
      const px = right ? bxp - w : bxp;
      ctx.fillStyle = c;
      ctx.fillRect(px, py - 1, w, 7);
      drawText(ctx, t, px + 2, py, { small: true, color: '#000' });
      bxp += sgn * (w + 2);
    }
  }

  drawPickUI(ctx) {
    const me = this.st('me');
    if (!me) return;
    // Timer bar
    const total = CONFIG.pickMs / 1000;
    const left = Math.max(0, this.deadline - engine.time);
    const pct = Math.min(1, left / total);
    ctx.fillStyle = '#1a0a20';
    ctx.fillRect(0, 32, W, 3);
    ctx.fillStyle = pct > 0.4 ? '#ffd21a' : blink(6) ? '#ff3a2a' : '#ff8a00';
    const bw = Math.round(W * pct);
    ctx.fillRect(Math.round((W - bw) / 2), 32, bw, 3);
    const secs = Math.ceil(left);
    if (secs <= 3 && secs > 0 && !this.myPick) {
      drawText(ctx, String(secs), W / 2, 40, { ...STYLE.red, align: 'center', scale: 3 });
    }
    // Lock status
    const oppBot = net.room?.players?.[1 - net.you]?.bot;
    const oppName = oppBot ? 'CPU' : 'RIVAL';
    const oppTxt = this.oppLocked ? `${oppName} LOCKED IN` : `${oppName} THINKING${'.'.repeat(1 + (Math.floor(engine.time * 3) % 3))}`;
    drawText(ctx, oppTxt, W - 4, 38, { small: true, color: this.oppLocked ? '#7ac8ff' : '#8a86b0', align: 'right' });

    if (me.stunned) {
      if (blink(2)) drawText(ctx, 'STUNNED - BRACE YOURSELF!', W / 2, 190, { ...STYLE.red, align: 'center' });
      return;
    }
    drawText(ctx, this.myPick ? `LOCKED: ${LABEL[this.myPick]}` : 'PICK YOUR MOVE!', 4, 38, { small: true, color: this.myPick ? '#ffd21a' : blink(2) ? '#ffffff' : '#8a86b0' });

    // Tooltip for hovered/selected move.
    const tipA = this.hover || this.myPick;
    if (tipA && TIPS[tipA]) {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 162, W, 9);
      drawText(ctx, `${LABEL[tipA]}: ${TIPS[tipA]}`, W / 2, 164, { small: true, color: '#ffffff', align: 'center' });
    }
    for (const c of this.chips) this.drawChip(ctx, c, me);
  }

  drawChip(ctx, c, me) {
    const a = this.chipAction(c);
    const ok = allowed(me, a);
    const sel = this.myPick === a;
    const hov = this.hover === a;
    const denied = this.denied && this.denied.a === a;
    const x = c.x, y = c.y;
    const isAtk = ACTIONS[a].kind !== 'def';
    let bg = isAtk ? '#3a0a14' : '#0a1a3a', edge = isAtk ? '#c8161e' : '#2a6ad8', txt = '#ffffff';
    if (!ok) { bg = '#141224'; edge = '#2a2640'; txt = '#4a4668'; }
    if (hov && ok) { bg = isAtk ? '#6a1020' : '#123a78'; }
    if (sel) { bg = blink(4) ? '#ffd21a' : '#ffb000'; edge = '#ffffff'; txt = '#2a0a00'; }
    if (denied) { bg = '#ff2020'; }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x + 1, y + 1, CHIP_W, CHIP_H);
    ctx.fillStyle = edge;
    ctx.fillRect(x, y, CHIP_W, CHIP_H);
    ctx.fillStyle = bg;
    ctx.fillRect(x + 1, y + 1, CHIP_W - 2, CHIP_H - 2);
    // Key cap
    ctx.fillStyle = sel ? '#2a0a00' : ok ? '#000' : '#0a0818';
    ctx.fillRect(x + 1, y + 1, 9, CHIP_H - 2);
    drawText(ctx, c.key, x + 4, y + 3, { small: true, color: sel ? '#ffd21a' : ok ? '#ffd21a' : '#3a3658' });
    let label = c.label;
    if (a === 'UPPER') label = 'UPPER!';
    if (a === 'STAR' && me.stars > 0) label = `STAR*${me.stars}`;
    drawText(ctx, label, x + 12, y + 3, { small: true, color: txt });
    if (a === 'UPPER' && !sel && blink(3)) { ctx.fillStyle = 'rgba(255,60,40,0.35)'; ctx.fillRect(x + 1, y + 1, CHIP_W - 2, CHIP_H - 2); }
    if (me.counter && isAtk && ok && !sel && blink(3)) { ctx.fillStyle = 'rgba(255,210,26,0.25)'; ctx.fillRect(x + 1, y + 1, CHIP_W - 2, CHIP_H - 2); }
  }

  drawReveal(ctx) {
    const r = this.reveal;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 32, W, 10);
    drawText(ctx, `YOU: ${LABEL[r.me] || r.me}`, 4, 34, { small: true, color: '#ffd21a' });
    drawText(ctx, `${net.room?.players?.[1 - net.you]?.bot ? 'CPU' : 'RIVAL'}: ${LABEL[r.opp] || r.opp}`, W - 4, 34, { small: true, color: '#7ac8ff', align: 'right' });
  }

  drawDown(ctx) {
    const d = this.down;
    const meDown = d.sides.includes('me');
    if (meDown) {
      ctx.fillStyle = 'rgba(40,0,0,0.35)';
      ctx.fillRect(0, 32, W, H - 32);
    }
    if (this.count > 0) {
      const pop = this.countT < 0.08 ? 1 : 0;
      drawText(ctx, String(this.count), 64, 56 - pop * 4, { ...STYLE.white, align: 'center', scale: 5 + pop });
    }
    if (meDown && !d.tko) {
      const p = this.mashP[0];
      if (blink(4)) drawText(ctx, 'GET UP! MASH ANY KEY OR TAP!', W / 2, 150, { ...STYLE.gold, align: 'center' });
      const bw = 160, bx = W / 2 - bw / 2, by = 164;
      panel(ctx, bx - 3, by - 3, bw + 6, 12);
      ctx.fillStyle = '#2a0a10'; ctx.fillRect(bx, by, bw, 6);
      ctx.fillStyle = p >= 1 ? '#7aff7a' : '#ffd21a';
      ctx.fillRect(bx, by, Math.round(bw * p), 6);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, Math.round(bw * p), 1);
    } else if (!meDown && !d.tko && d.t > 1.2) {
      const p = this.mashP[1];
      drawText(ctx, 'STAY DOWN!', 318, 150, { ...STYLE.blue, align: 'center' });
      const bw = 80, bx = 318 - bw / 2;
      ctx.fillStyle = '#10102a'; ctx.fillRect(bx, 162, bw, 4);
      ctx.fillStyle = '#7ac8ff'; ctx.fillRect(bx, 162, Math.round(bw * p), 4);
    }
  }

  drawBreak(ctx) {
    const r = net.room;
    const me = this.st('me'), opp = this.st('opp');
    if (!me) return;
    panel(ctx, W / 2 - 100, 84, 200, 58);
    drawText(ctx, 'SCORECARD', W / 2, 90, { small: true, color: '#ffd21a', align: 'center' });
    drawText(ctx, 'YOU', W / 2 - 50, 102, { small: true, color: '#ffffff', align: 'center' });
    drawText(ctx, net.room?.players?.[1 - net.you]?.bot ? 'CPU' : 'RIVAL', W / 2 + 50, 102, { small: true, color: '#ffffff', align: 'center' });
    drawText(ctx, 'DAMAGE', W / 2, 112, { small: true, color: '#8a86b0', align: 'center' });
    drawText(ctx, String(me.points), W / 2 - 50, 111, { ...STYLE.gold, align: 'center' });
    drawText(ctx, String(opp.points), W / 2 + 50, 111, { ...STYLE.blue, align: 'center' });
    drawText(ctx, 'KNOCKDOWNS', W / 2, 126, { small: true, color: '#8a86b0', align: 'center' });
    drawText(ctx, String(opp.totalKnockdowns), W / 2 - 50, 125, { ...STYLE.gold, align: 'center' });
    drawText(ctx, String(me.totalKnockdowns), W / 2 + 50, 125, { ...STYLE.blue, align: 'center' });
    drawText(ctx, `ROUND ${r.round} COMING UP`, W / 2, 148, { small: true, color: '#ffffff', align: 'center' });
  }

  drawPaused(ctx) {
    panel(ctx, W / 2 - 110, 90, 220, 30);
    drawText(ctx, 'RIVAL DISCONNECTED', W / 2, 96, { ...STYLE.red, align: 'center' });
    drawText(ctx, 'WAITING FOR THEM TO COME BACK' + '.'.repeat(1 + (Math.floor(engine.time * 3) % 3)), W / 2, 108, { small: true, color: '#ffffff', align: 'center' });
  }

  drawBanner(ctx) {
    const b = this.banner;
    const grow = Math.min(1, b.t / 0.12);
    const sc = b.t < 0.12 ? b.scale + 2 : b.scale;
    if (b.dur < 50 && b.t > b.dur - 0.25 && blink(10)) return;
    const h = 7 * sc;
    ctx.fillStyle = `rgba(0,0,0,${0.45 * grow})`;
    ctx.fillRect(0, b.y - 6, W, h + 12);
    logo(ctx, b.text, W / 2, b.y - (sc - b.scale) * 3, sc, b.style.color.length ? b.style.color : undefined);
  }

  drawOver(ctx) {
    const r = net.room;
    if (!r?.result) return;
    const iWin = r.result.winner === net.you;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 146, W, 24);
    drawText(ctx, this.overText, W / 2, 150, { ...(iWin ? STYLE.gold : r.result.winner == null ? STYLE.white : STYLE.blue), align: 'center', scale: 2 });
    if (r.result.scores) {
      const [a, b] = [r.result.scores[net.you], r.result.scores[1 - net.you]];
      drawText(ctx, `JUDGES: ${a} - ${b}`, W / 2, 80, { small: true, color: '#ffffff', align: 'center' });
    }
    const oppWants = r.rematch?.[1 - net.you];
    if (oppWants && !r.rematch?.[net.you]) {
      if (blink(2)) drawText(ctx, `${r.players?.[1 - net.you]?.bot ? 'CPU' : 'RIVAL'} WANTS A REMATCH!`, W / 2, 196, { small: true, color: '#7ac8ff', align: 'center' });
    }
    for (const b of this.overBtns) b.draw(ctx);
  }
}
