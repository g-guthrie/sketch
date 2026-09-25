# PANEL BRAWL (working title)

An online multiplayer 2D comic-book shooter. Every match, somebody opens a **brand-new comic**: a random genre (superhero, horror, sci-fi or noir), a generated title and cover, and a two-page spread held in a reader's hands. You fight *inside the panels*. Each panel is its own little arena with platforms, stairs, crates, explosive barrels and tables you can flip for cover. You move between panels through doors cut into the gutters and ladders between rows.

Everything is procedural: no image or audio files. The characters, the 16 panel scenes, the onomatopoeia and the music are all drawn or synthesized in code.

## Run it

```bash
cd panel-brawl
npm install
npm start          # → http://localhost:3000
```

- **Solo:** pick STORY or BRAWL (vs ink-bots). Solo runs entirely in the browser; the server only serves the files.
- **Online:** one player clicks HOST, and the room code shows up in the pause menu (Esc) and in the URL (`?room=ABCD`). Friends enter the code or open the link. For LAN play, friends open `http://<your-ip>:3000`. For internet play, deploy to any Node host that supports WebSockets (Render, Fly.io, Railway, a VPS). `PORT` is read from the environment.

## Modes (both are in, so you can playtest which one is more fun)

| Mode | What it is |
|---|---|
| **STORY** (1–8 co-op) | The X-Men arcade idea. Panels follow the reading order, and every panel after the first starts as an uninked pencil sketch. Step into a panel and the characters printed in it **wake up**: color floods into them, they shout a speech bubble, and they attack. Clear a panel to open the gutter into the next one. Clearing the whole spread turns the page, and the last spread ends in a boss fight (Doctor Cataclysm, the Rotting King, the Overmind, Mr. Big). Some panels send in a second wave that gets drawn in live by an unseen pencil. |
| **BRAWL** (free-for-all) | Everyone vs everyone across the spread. First to 15 KOs or best score after 5 minutes. Weapon pickups respawn. Bots fill empty slots. |
| **BRAWL + WAKE THE INK** | A hybrid: the comic's villains wake up while you brawl and attack whoever is closest. |

**My take:** make STORY the headline mode. "The comic's characters wake up and come after you" is the unique hook, and PvP-only wastes it. Keep BRAWL (or the Wake the Ink hybrid) as the quick-match mode. They share every system, so you don't have to choose now.

## Controls

| Input | Action |
|---|---|
| A / D | move |
| Space / W | jump (press again in mid-air to double jump) |
| S | crouch · S + Space drops through platforms · W/S climbs ladders |
| Shift | dash (brief invulnerability) |
| Mouse | aim; left click fires |
| Right click / V | punch (the 3rd punch in a row is a KA-POW finisher that launches enemies) |
| G | throw an ink bomb |
| Q / wheel | swap between the sidearm and your heavy weapon |
| E | swap for a weapon on the ground · flip a table for cover |
| F | **SPLASH PAGE** super (charges as you deal damage) |
| R / T / Tab / M / Esc | reload / taunt / scores / mute / menu |

Gamepads work (twin-stick). On phones, touch controls appear automatically: a floating move stick, an aim-and-fire stick, and buttons.

## Weapons

- **PEACEMAKER**: the infinite sidearm. Headshots crit.
- **KA-BLAMMER**: shotgun with a spread. The recoil can launch you ("shotgun jumping").
- **RAT-A-TAT**: tommy gun.
- **ONOMATO-CANNON**: fires the actual sound-effect words ("BOOM", "WHAM"). They arc, explode, and scatter their letters.
- **INK RAILGUN**: pierces a whole line of enemies and leaves a permanent ink streak on the page.
- **PANEL CUTTER**: blade that lunges forward and **deflects bullets** back at whoever fired them.
- Plus punch combos, ink bombs, exploding barrels (chain reactions), and the SPLASH PAGE super.

## Hit feedback

- Starburst sound-effect words (POW!, SPLAT!, ZZAKK!), picked by genre and weapon.
- Damage numbers that merge and punch up when hits land in quick succession.
- Crit bursts.
- Ink droplets flying in the direction of the knockback.
- A white hit flash, then a red tint.
- Dizzy stars after big hits.
- Speed lines on heavy hits.
- A one-frame black-and-white "impact frame" on kills, with a little hit-stop.
- Kills explode into torn paper shreds and leave a cartoon person-shaped hole ripped in the page.
- Bullet holes, scorch marks and splats stay on the panels, so the comic gets messier as the fight goes on.

## Architecture

```
shared/      authoritative simulation, used by the server, solo mode and client prediction
  game.js      players, weapons, projectiles, damage, props, pickups, story/brawl rules
  comicgen.js  issue + spread generation (page grid, reading path, doors/ladders, furnishing)
  physics.js   AABB grid world, swept movement, one-way platforms, ladders, raycasts
  movement.js  run/jump/double-jump/dash/crouch/climb (shared with client prediction)
  ai.js        enemy archetypes (grunt, gunner, flyer, brute, boss) with telegraphed attacks
  bots.js      ink-bots: panel-graph navigation + combat
  room.js      transport-agnostic room (join/leave, input queues, snapshots)
  themes.js    genres, enemy rosters, heroes, all the copy
server/index.js  static files + WebSocket rooms, 60 Hz fixed step
client/
  world.js     snapshot interpolation, prediction/reconciliation, event → FX + sound
  predict.js   local-player prediction mirroring Game.updatePlayer
  net.js       LocalTransport (in-browser room, lockstep) and NetTransport (WebSocket)
  render/      renderer, book/cover/hands/page-flip, panel art + decals, characters, FX, HUD
  render/scenes.js + art/   the 16 procedural panel backdrops, props, platforms
  audio.js     WebAudio-synthesized SFX + per-genre adaptive music
```

The netcode is server-authoritative. The server simulates at 60 Hz and sends snapshots at 30 Hz. Clients predict their own movement and weapon fire, reconcile against the server, interpolate everyone else, and simulate projectiles cosmetically. Hits are decided only by the server.

## Dev tools

- `npm test` runs a headless sim: it generates 720 spreads, checks that every panel is reachable, runs story and brawl matches with bots, and plays through to the boss victory.
- `client/dev/characters.html` is a sheet of every hero and enemy in every pose.
- `client/dev/scenes.html` shows every panel scene and prop.
- `client/dev/audio.html` has a button for every sound, plus the music.
- URL parameters: `?solo=story|brawl`, `&theme=hero|zombie|space|noir`, `&seed=123`, `&spread=2` (starts at the boss spread), `&bots=5`, `&chaos`, `&lag=150` (simulated round trip, for testing netcode).

## Ideas for next steps

- More genres (western, pirates, kaiju, fantasy).
- Hand-drawn art passes on top of the procedural rig.
- Unlockable hero costumes.
- Panel-specific hazards (falling rain gutters, train panels, zero-G panels).
- Destructible panel borders.
- Player-drawn graffiti decals.
- Matchmaking and room browser.
- Revive-your-teammate in co-op.

Fonts: Bangers and Comic Neue, both under the SIL Open Font License (see `client/fonts/`).
