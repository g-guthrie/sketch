# HAYMAKER

Online 1v1 arcade boxing. One player creates a match and gets a 4-letter code,
the other types it in (or opens the invite link), and you fight.

Every exchange is a **beat**: both fighters secretly pick a move before the
timer runs out, then both moves fire at once. It plays like rock-paper-scissors
with a dozen options, tells, counters, stamina and knockdowns.

## Run it

```sh
cd haymaker
npm install
npm start          # http://localhost:8080
```

Open two browser windows (or send the link to a friend on the same network)
to play against yourself, or pick **PRACTICE VS CPU**.

## Put it online

It's a single Node process (static files + WebSocket), so any host that runs
Node and supports WebSockets works. On [Render](https://render.com):

1. New → **Blueprint** → pick this repo (it uses `render.yaml` at the repo root), or
   New → **Web Service** with root directory `haymaker`, build `npm install`,
   start `npm start`.
2. Share the `https://…onrender.com` URL. Invite links look like `/?code=ABCD`.

Other hosts (Fly.io, Railway, a VPS) work the same way: `npm install && npm start`,
and the server honours `PORT`.

## Controls

| Key | Move | Key | Move |
| --- | --- | --- | --- |
| `J` | Jab | `W` / `↑` | Guard |
| `U` | Left hook | `S` | Low guard |
| `O` | Right hook | `A` / `←` | Slip left |
| `K` | Body shot | `D` / `→` | Slip right |
| `I` | Wind up → Uppercut | `X` / `↓` | Duck |
| `L` | Star punch | any key / tap | Get up after a knockdown |

On phones, tap the on-screen move buttons (landscape). `M` mutes, `F2` toggles
the CRT scanlines.

## How the rules work

All the numbers live in `shared/rules.js`, which both the server and the client
import. The server is authoritative: it holds both picks until the beat
resolves, so a client can't peek at the other player's choice.

- **Jab** is fastest and interrupts body shots and wind-ups.
- **Hooks** hit hard and plow through jabs. Slipping the same side as the hand
  dodges them, and slipping the wrong way takes 1.5×.
- **Body shots** beat guard, slips and ducks, and drain stamina. Low guard
  stops them.
- **Wind up** loads an uppercut for the next beat, and your rival sees it.
  The uppercut stuns, and you can feint by throwing something else instead.
- Dodging anything gives you a **counter**: your next punch is faster, hits
  1.5×, and earns a **star** if it lands. Getting hit clean costs a star.
- Zero health means a knockdown. Mash to beat the count. Three knockdowns in a
  round is a T.K.O. After three rounds the judges decide.

## Code map

```
server.js            HTTP + WebSocket rooms, match flow, CPU opponent
shared/rules.js      moves, resolution, constants (shared with the client)
shared/bot.js        practice CPU
public/js/gfx/       sprite renderer, fighters, poses, arena, font, effects
public/js/scenes/    title, join/lobby, select, VS, fight, how-to
tests/               rules tests (npm test)
tools/               headless screenshot/e2e scripts used during development
```

The boxers aren't drawn by hand. `gfx/sprite.js` poses a small 3D skeleton of
capsules and ellipsoids, then rasterizes it at native resolution (384×216) with
cel-shaded colour ramps, hard outlines and pixel-map faces. One set of poses
renders both the opponent (front view) and your fighter (back view).
