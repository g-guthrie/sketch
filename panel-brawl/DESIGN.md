# PANEL BRAWL: design pass 2

This pass turns the first draft into a game. Draft 1 proved the fantasy: a comic held in your hands, fights inside its panels, and loud comic FX. It played like a shooting gallery, though.

What was wrong with draft 1:
- Enemies walked at you and died.
- Heavy weapons wiped whole rooms.
- Every panel had the same beat, and every issue played the same.
- The screen was noisy.

## Pillars

1. **Every panel is an encounter, not a room.** Panels have *beats* the way a comic page does: quiet establishing shots, ambushes, silent stealth panels, last stands, rescues and showdowns. You should be able to read a spread's pacing like a page.
2. **Enemies are a cast, not targets.** Each enemy has a job, a tell and a counter. Squads coordinate, and they say so out loud in speech bubbles. The dialogue *is* the AI telegraph.
3. **Mix your tools.** Guns break armor badly, and fists break it well. Bombs flush cover. Dashing punishes charges. Staggering an enemy opens it up, and a wall splat finishes it. The strongest play is varied play, and the super meter rewards style over spam.
4. **Power weapons are moments, not loadouts.** Heavy weapons are rare pickups with a handful of shots. They solve a situation; they don't replace the core kit.
5. **Readable first, loud second.** The big comic FX are the reward, so they're saved for moments that earn them: heavy hits, staggers, kills and explosions. Everything else stays small and clean.
6. **Every issue is different.** Each genre changes the rules, not just the paint. Between chapters you pick a perk from the comic's mail-order ad page, so runs diverge.

## Core combat kit

| Tool | Role |
|---|---|
| PEACEMAKER pistol (infinite, 12-round mag) | Precision. Headshots do double damage. The main tool. |
| Fists: jab, cross, uppercut | Break shields and poise. The uppercut launches. Punching an enemy into a wall is a WALL SPLAT (bonus damage + stagger). |
| Dash | Invulnerability frames. Dodging a charge makes the brute hit the wall. |
| Ink bomb (2 charges) | Flushes cover and breaks groups. Enemies dodge bombs they can see coming. |
| Heavy pickups | Limited shots; see below. |
| SPLASH PAGE super | Charged by *style*: headshots, staggers, wall splats, takedowns and deflects count for much more than plain hits. |

Heavy weapons after the rework:

| Weapon | Shots | Identity |
|---|---|---|
| KA-BLAMMER shotgun | 6 | Point-blank knockback that sends enemies into walls. |
| RAT-A-TAT tommy gun | 45 | Suppression: enemies under fire duck into cover and shoot worse. |
| ONOMATO-CANNON | 3 | A slow word shell with a small blast. Enemies can see it and dodge. Best on staggered or cornered targets. |
| INK RAILGUN | 4 | Short charge-up, pierces, **breaks shields**. |
| PANEL CUTTER blade | infinite | Deflects projectiles; a strong but committal swing. |

## Poise and stagger

Every enemy has poise. Hits drain it:
- bullets: a little
- punches: more
- the uppercut, shotgun point-blank, explosions and wall splats: a lot

When poise breaks, the enemy is **STAGGERED** for about 1.2 s. During that window it can't act, takes 50% more damage, and flies further. Brutes and bosses have deep poise, and bosses take heavily reduced damage until they're staggered.

## The cast (each genre re-skins these roles)

| Role | Behavior | Tell | Counter |
|---|---|---|---|
| **Brawler** | Closes in along platforms and surrounds you. At most 2 attack at once; the rest circle and taunt. | Arm wind-up | Dash, punch combos |
| **Shield** | Advances behind a frontal shield that blocks bullets and bash-charges. | Shield raised, "HUP!" | Punches or the railgun break the shield; hit it from behind or above; bombs |
| **Gunner** | Moves to cover, peeks, and fires aimed bursts with a laser sight. Reloads ("RELOADING!"). Suppressed by heavy fire. | Laser line | Flank, shoot it during reload, bomb its cover |
| **Grenadier** | Hangs back and lobs bombs that force you to move. | "FIRE IN THE HOLE!" | Close the distance; deflect |
| **Flyer** | Harasses from above and dive-bombs. | Screech + dive line | Punch it out of the dive, headshots |
| **Brute** | High poise; charges and slams. | Steam + "!!" | Dash so it hits a wall, then punish the stun |
| **The Artist** | Support. Hides at the back and **redraws KO'd enemies**. Flees when you close in. | Pencil scribble | Priority target |
| **Boss** | Deep poise; armored until staggered; multi-phase. | Named attacks | Break poise, then dump damage |

Squad logic:
- An **attack-token** system limits how many enemies commit at once.
- Brawlers pick opposite flanks.
- Gunners claim cover spots.
- Everyone dodges visible bombs and shells.
- Hurt enemies retreat toward the Artist.
- Callout bubbles show squad intent and are rate-limited per panel.

## Panel beats

The generator gives each panel a beat. Story pacing per spread:
- **Establishing**: a quiet "MEANWHILE..." panel with a supply pickup.
- **Brawl**: the printed cast wakes up.
- **Ambush**: the panel looks empty. Once you're in, the door seals and enemies drop in: "IT'S A TRAP!"
- **Silent panel**: no sound effects. Guards patrol with sight cones. A punch from behind or above is an instant takedown. Being spotted or firing a gun raises the alarm.
- **Last stand**: hold out against waves while the artist inks the exit. A timer shows in the caption.
- **Rescue**: a tied-up civilian. Free them with E while enemies try to finish the job. The reward is a perk token and health.
- **Showdown**: a named elite plus adds.
- **Splash page**: the boss.

Puzzle beats (light, 20–60 seconds, never blocking for long):
- **Locked exit**: the way forward needs a key (a keycard, crypt key, access crystal or safe key, depending on genre). It sits somewhere awkward: on the highest ledge, inside a crate, or carried by one particular guard.
- **Switches**: three targets (fuse boxes, bells, power nodes or lamps) have to be lit within 5 seconds of each other. Shots, punches and blasts all count. It's a small positioning and aim puzzle, and enemies make it harder.
- **Cracked wall**: the exit is bricked up. Anything explosive breaks it: an ink bomb (they stick to cracked walls), a barrel, or a launcher shell.
- **Collector's stamp**: every spread hides one golden stamp in a hard-to-reach spot. Each one is worth an extra perk coupon on the ad page.

## Genre rules (not just paint)

- **Superhero:** shields, flyers and villain gadgets. The balanced baseline.
- **Horror:** hordes of weak enemies. Zombies **get back up** unless the killing blow is a headshot, a melee finisher or fire. Fewer ammo drops.
- **Sci-fi:** troopers have **energy shields** that regenerate; melee or the railgun pops them. Planet panels have **low gravity**.
- **Noir:** fewer, deadlier enemies (both ways). Cover-heavy gunfights. Silent panels are common.

## Mail-order ads (perks between chapters)

After each page turn, the comic's back-page ads offer three perks, each written as a vintage mail-order ad. Every player picks one:
- **X-RAY SPECS!**: see what's inside crates and which guard carries the key; +30% damage on staggered foes.
- **BUILD A MIGHTY BODY IN 7 DAYS!**: +40% punch damage and poise damage.
- **GENUINE ROCKET BOOTS**: a third jump and an air dash.
- **SECRET DECODER RING**: 50% faster reloads and +25% headshot damage.
- **SPARE HEART (MAIL-IN!)**: +40 max health and a full heal.
- **HYPNO-COIN**: staggers last longer and staggered foes take extra damage.
- **INK BOTTLE REFILL**: +1 bomb and faster recharge.
- **JOY BUZZER**: punches chain a small shock to nearby enemies.
- **SELF-DEFENSE BY MAIL**: dash through an attack and your next punch is a KNOCKOUT blow.
- **SPEED-READING COURSE**: faster movement and faster super charge.

## FX budget (readability rules)

- Big onomatopoeia words appear only for:
  - your heavy hits (≥25 damage), crits, staggers, wall splats and kills;
  - explosions;
  - boss moments.
- Most regular bullet hits get a clean spark and flash; a small word shows up only occasionally.
- At most **3** big words on screen at once; a new one replaces the oldest.
- Damage numbers show only for damage *you* deal or take. They're small and they merge.
- Impact frames and hit-stop only for your kills and your staggers.
- Decals are subtle and fade over time.
- Nothing gets drawn for bot-vs-bot or enemy-vs-enemy hits away from you.

## Implementation notes

- Beats and puzzles are planned per spread in `shared/comicgen.js` (`planStory`). The first panel of an issue never has a puzzle, and the first real fight is always a plain brawl.
- Squad AI, cover, tokens, callouts and every role live in `shared/ai.js`. Poise, shields, stealth, revives, perks and the puzzle and beat logic live in `shared/game.js`.
- The INK-BOTS (`shared/bots.js`) can play the whole story: they revive, untie hostages, fetch keys, shoot switches and bomb cracked walls. `node tools/simtest.js` runs full bot playthroughs of every genre as a regression test.
