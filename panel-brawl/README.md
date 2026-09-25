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
| **STORY** (1–8 co-op) | The X-Men arcade idea. Panels follow the reading order, and every panel after the first starts as an uninked pencil sketch. Step into a panel and the characters printed in it **wake up** and attack. Every panel is a different *beat* (see below), and some exits are small puzzles. Between spreads the comic flips to its **mail-order ad page**, where you clip a coupon for a perk. The last spread ends in a boss fight (Doctor Cataclysm, the Rotting King, the Overmind, Mr. Big). In co-op, a fallen hero goes down and can be revived. |
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
| Right click / V | punch: jab, cross, then an uppercut that launches. Fists wreck shields and guards |
| G | throw an ink bomb |
| Q / wheel | swap between the sidearm and your heavy weapon |
| E | revive a downed friend · untie a hostage · swap for a weapon on the ground · flip a table for cover |
| F | **SPLASH PAGE** super (charges from *style*: headshots, staggers, wall splats, takedowns, deflects) |
| 1–5 / click | clip a coupon on the mail-order ad page |
| R / T / Tab / M / Esc | reload / taunt / scores / mute / menu |

Gamepads work (twin-stick). On phones, touch controls appear automatically: a floating move stick, an aim-and-fire stick, and buttons.

## Story beats and puzzles

Each panel on a spread's reading path gets a beat, so a spread reads like a comic page:

| Beat | What happens |
|---|---|
| **Establishing** | A quiet "MEANWHILE..." panel with a supply pickup. |
| **Brawl** | The printed cast wakes up. |
| **Ambush** | The panel looks empty. Walk in and the doors slam shut: "IT'S A TRAP!" |
| **Silent** | Guards patrol with sight cones. A punch from behind or above is a silent takedown. Gunfire raises the alarm, and a clean ghost run pays out super. |
| **Last stand** | The doors seal. Hold out until the ink dries, then the page erases whoever is left. |
| **Rescue** | A tied-up hostage whom some thugs are trying to finish off. Untie them for health and a coupon. |
| **Showdown** | A named elite plus adds. |

Light puzzles sit on some exits:
- a **locked door** whose key is on a high ledge, in a crate, or carried by a guard;
- **three switches** to light within 5 seconds;
- a **bricked-up wall** that only something explosive opens.

Each spread also hides one **collector's stamp**, and each stamp is worth an extra coupon.

## The cast

Enemies work as a squad: an attack-token system limits how many rush you at once, brawlers take opposite flanks, gunners claim cover, peek out with a laser sight and yell "RELOADING!", and everyone dodges bombs they can see coming. Every enemy has a guard (poise). Break it and they're **staggered**, taking extra damage, and a punch into a wall is a **WALL SPLAT**.

| Role | Counter |
|---|---|
| Brawler | Dash, punch combos |
| Shield | Punch it or use the railgun; get behind or above it |
| Gunner | Flank it, or hit it while it reloads or when its cover gets bombed |
| Grenadier | Close in, or punch its grenade back |
| Flyer | Punch it out of its dive |
| Brute | Dash so it charges into a wall, then punish it |
| The Artist | Kill it first: it redraws your KOs |
| Boss | Break its guard, then dump damage |

Genres change the rules:
- **Horror**: zombies get back up unless finished with a headshot, fists or fire.
- **Sci-fi**: troopers have energy shields, and planet panels have low gravity.
- **Noir**: fewer, deadlier enemies, and cover-heavy rooms.

## Weapons

- **PEACEMAKER**: the infinite sidearm and your main tool. Headshots do double damage.
- **KA-BLAMMER** (6 shots): point-blank knockback that splats enemies into walls.
- **RAT-A-TAT** (45): suppression; gunners under fire duck and miss.
- **ONOMATO-CANNON** (3): fires the actual sound-effect words, slow enough to dodge.
- **INK RAILGUN** (4): a short charge-up, pierces a line of enemies, and breaks shields.
- **PANEL CUTTER**: a blade that **deflects bullets** back at whoever fired them.
- Plus punch strings, ink bombs (they stick to cracked walls), exploding barrels and the SPLASH PAGE super.

## Mail-order perks

X-Ray Specs, Build a Mighty Body, Genuine Rocket Boots, Secret Decoder Ring, Spare Heart, Hypno-Coin, Ink Bottle Refill, Joy Buzzer, Self-Defense by Mail, Speed-Reading Course. See `DESIGN.md` for the full design.

## Hit feedback

The loud FX are saved for moments that earn them. Big words appear only for your heavy hits, crits, staggers, splats, kills, explosions and boss moments, and there are never more than three on screen. Damage numbers show only for damage you deal or take.

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
  ai.js        the cast (brawler, shield, gunner, grenadier, flyer, artist, brute, boss) + squad tactics
  bots.js      ink-bots: panel-graph navigation, combat, and story objectives (revives, keys, switches...)
  perks.js     mail-order ad perks
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

- `npm test` runs a headless sim. It:
  - generates 720 spreads and checks that every panel is reachable;
  - runs story and brawl matches;
  - has two INK-BOTS play full issues of every genre through every beat, puzzle, ad page and boss.
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

Fonts: Bangers and Comic Neue, both under the SIL Open Font License (see `client/fonts/`).
