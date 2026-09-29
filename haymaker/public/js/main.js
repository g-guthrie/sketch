import { start, setScene, engine } from './engine.js';
import { net, connect } from './net.js';
import { app } from './app.js';
import { initAudio, sfx } from './audio.js';
import { TitleScene } from './scenes/title.js';
import { JoinScene, LobbyScene } from './scenes/lobby.js';
import { SelectScene, VsScene } from './scenes/select.js';
import { FightScene } from './scenes/fight.js';
import { HowToScene } from './scenes/howto.js';

app.scenes = { TitleScene, JoinScene, LobbyScene, SelectScene, VsScene, FightScene, HowToScene };

const params = new URLSearchParams(location.search);
const code = (params.get('code') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
if (code.length === 4) app.pendingCode = code;

const FIGHT_PHASES = new Set(['round', 'pick', 'resolve', 'down', 'break', 'over', 'paused']);

// Route room snapshots to the right scene.
net.on((m) => {
  if (m.t === 'error') app.status(m.msg, 3);
  if (m.t === 'joined') {
    app.statusText = null;
    if (app.pendingCode) {
      app.pendingCode = null;
      history.replaceState(null, '', location.pathname);
    }
  }
  if (m.t === 'opp_left') {
    app.toast('YOUR RIVAL LEFT THE MATCH', 3);
    app.status('YOUR RIVAL LEFT THE MATCH', 4);
    net.reset();
    setScene(new TitleScene({ attract: false }));
    return;
  }
  if (m.t !== 'room') return;
  const s = engine.scene;
  const ph = m.phase;
  if (ph === 'lobby' && !(s instanceof LobbyScene)) setScene(new LobbyScene());
  else if (ph === 'select' && !(s instanceof SelectScene)) setScene(new SelectScene());
  else if (ph === 'intro' && !(s instanceof VsScene)) setScene(new VsScene());
  else if (FIGHT_PHASES.has(ph) && !(s instanceof FightScene)) setScene(new FightScene());
});

start(document.getElementById('screen'));
connect();

const saved = net.savedSession();
if (saved && !app.pendingCode) {
  // Reloaded mid-match: slip back into our seat.
  net.resume(saved);
}
setScene(new TitleScene({ attract: true }));

// Autoplay policies: unlock audio on the first gesture anywhere.
const unlock = () => { initAudio(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

// Debug/automation hooks.
window.__hm = { net, app, engine, setScene, scenes: app.scenes, sfx };
