// Comic "genres". Each issue rolls one of these. A theme drives the title,
// captions, panel scenes, enemy roster, SFX vocabulary and the palette.
// All of it is data, so adding a genre is mostly writing copy + a scene painter.

export const THEMES = {
  hero: {
    key: 'hero',
    label: 'SUPERHERO',
    titleA: ['THE ASTONISHING', 'THE MIGHTY', 'THE SPECTACULAR', 'THE ALL-NEW', 'THE SAVAGE', 'THE UNBEATABLE', 'THE TREMENDOUS'],
    titleB: ['KAPOW SQUAD', 'OMEGA LEAGUE', 'THUNDER CORPS', 'ATOMIC SQUADRON', 'STAR BRIGADE', 'POWER PATROL', 'NIGHT SENTINELS'],
    blurbs: ['THE DOCTOR STRIKES BACK!', 'NOT EVEN THE PAGES ARE SAFE!', 'WHO WILL SURVIVE?!', 'A NEW MENACE RISES!', 'THE BATTLE FOR MEGALOPOLIS!', 'HEROES NO MORE?!'],
    chapters: ['THE DOCTOR WILL SEE YOU NOW!', 'SIEGE OF MEGALOPOLIS!', 'HEROES NO MORE?!', 'LAIR OF LIGHTNING!', 'THE FINAL COUNTDOWN!', 'CRISIS ON PAGE NINE!'],
    captions: [
      'MEANWHILE, HIGH ABOVE MEGALOPOLIS...', 'MOMENTS LATER...', "DEEP IN THE DOCTOR'S LAIR...", 'ACROSS TOWN...',
      'NO TIME TO LOSE!', 'THE CITY SLEEPS... BUT NOT FOR LONG!', 'ELSEWHERE...', 'SUDDENLY--!', 'AT THAT VERY INSTANT...',
      'THE HENCHMEN HAVE BEEN BUSY...', 'ONE ROOFTOP LATER...',
    ],
    scenes: ['rooftop', 'street', 'lab', 'lair'],
    mono: false,
    palette: {
      ink: '#141414', accent: '#e8262b', accent2: '#1f5fd1', accent3: '#ffd23f',
      burst: ['#fff36b', '#ffb21f'], burstEdge: '#e8262b', caption: '#ffe36e',
      splat: '#d11f26', enemySplat: '#d11f26',
    },
    geo: { platform: ['girder', 'ledge', 'catwalk'], block: ['car', 'vent', 'crates', 'console'], table: 'labtable' },
    mix: { grunt: 5, gunner: 3, flyer: 2 },
    enemies: {
      grunt: { name: 'HENCHMAN', look: { body: 'humanoid', skin: '#f0c29a', suit: '#f4f1e8', suit2: '#1b1b1b', pants: '#2d2f3a', boots: '#1b1b1b', gloves: '#1b1b1b', head: 'beanie', hat: '#2d2f3a', torso: 'stripes', weapon: 'crowbar', mask: '#1b1b1b' } },
      gunner: { name: 'RAY GOON', look: { body: 'humanoid', skin: '#f0c29a', suit: '#7b3fb8', suit2: '#ffd23f', pants: '#3b2156', boots: '#1b1b1b', gloves: '#ffd23f', head: 'visor', hat: '#7b3fb8', torso: 'plain', weapon: 'raygun' } },
      flyer: { name: 'JET TROOPER', look: { body: 'humanoid', skin: '#f0c29a', suit: '#5a6b7b', suit2: '#ff7a1a', pants: '#3a4550', boots: '#1b1b1b', gloves: '#1b1b1b', head: 'visor', hat: '#ff7a1a', torso: 'armor', weapon: 'raygun', extra: 'jetpack' } },
      brute: { name: 'ROBO-BRUTE', look: { body: 'robot', suit: '#9aa6b2', suit2: '#e8262b', eye: '#ff2d2d', scale: 1.45, bulk: 1.6 } },
      boss: { name: 'DOCTOR CATACLYSM', look: { body: 'humanoid', skin: '#b8e0b0', suit: '#f4f1e8', suit2: '#1fb4c8', pants: '#1b1b1b', boots: '#1b1b1b', gloves: '#1fb4c8', head: 'brain', torso: 'labcoat', weapon: 'raygun', scale: 2.0, bulk: 1.2, cape: '#1fb4c8' } },
    },
    wakeLines: ["GET 'EM, BOYS!", 'YOU AGAIN?!', 'FOR THE DOCTOR!', 'HAH! FOOLS!', 'INTRUDERS!', 'NOBODY GETS PAST ME!', "OH NO, IT'S THEM!", 'BOSS SAID NO VISITORS!'],
    bossLines: ['WELCOME TO YOUR FINAL PAGE, HEROES!', 'MY GENIUS CANNOT BE CONTAINED BY PANELS!', 'BEHOLD! THE CATACLYSM RAY!'],
    hitWords: ['POW!', 'BAM!', 'WHAM!', 'KRAK!', 'THWACK!', 'SMASH!', 'BIFF!', 'ZOK!'],
    killWords: ['K.O.!', 'DEFEATED!', 'LIGHTS OUT!', 'DOWN FOR THE COUNT!', 'KAPUT!'],
    health: 'MEDKIT',
  },

  zombie: {
    key: 'zombie',
    label: 'HORROR',
    titleA: ['NIGHT OF THE', 'DAWN OF THE', 'RETURN OF THE', 'TALES FROM THE', 'CURSE OF THE', 'REVENGE OF THE', 'ATTACK OF THE'],
    titleB: ['ROTTING HORDE', 'GRAVE WALKERS', 'FLESH EATERS', 'SHAMBLING DEAD', 'BRAIN FEAST', 'GHOUL PATROL', 'UNBURIED'],
    blurbs: ['THEY WANT YOUR BRAINS!', 'NO ONE IS SAFE!', 'READ IT... IF YOU DARE!', 'THE DEAD DO NOT REST!', 'NOT FOR THE FAINT OF HEART!'],
    chapters: ['THE GRAVES OPEN!', 'NO WAY OUT!', 'THE HOSPITAL OF HORRORS!', 'BITTEN!', 'THE ROTTING KING!', 'LAST STAND AT THE MALL!'],
    captions: [
      'THE DEAD WALK AGAIN...', 'MIDNIGHT. THE CEMETERY GATES CREAK OPEN...', 'THERE WAS NO ONE LEFT TO SCREAM...',
      'THE HOSPITAL WAS NEVER THIS QUIET...', 'SOMEWHERE, A DOG HOWLS...', 'THEY CAME FROM THE GROUND...',
      'THE LAST MALL ON EARTH...', 'DAY 43. SUPPLIES RUNNING LOW...', 'DO NOT LOOK BEHIND YOU...',
    ],
    scenes: ['graveyard', 'street', 'hospital', 'mall'],
    mono: false,
    palette: {
      ink: '#121212', accent: '#7fd13b', accent2: '#6b2fa0', accent3: '#ff8a1f',
      burst: ['#d6ff5c', '#7fd13b'], burstEdge: '#6b2fa0', caption: '#e8f29a',
      splat: '#c21818', enemySplat: '#6dbb2a',
    },
    geo: { platform: ['plank', 'ledge', 'scaffold'], block: ['tomb', 'coffin', 'wreck', 'crates'], table: 'gurney' },
    mix: { grunt: 6, gunner: 3, flyer: 2 },
    enemies: {
      grunt: { name: 'SHAMBLER', look: { body: 'humanoid', skin: '#9cc47a', suit: '#b0a48a', suit2: '#6e5a3f', pants: '#4d5566', boots: '#3a2e22', gloves: null, head: 'zombie', hair: '#3a2e22', torso: 'torn', weapon: 'claws', hunch: 0.35, armsForward: true } },
      gunner: { name: 'SPITTER', look: { body: 'humanoid', skin: '#b5c95a', suit: '#8a2a2a', suit2: '#5a1818', pants: '#3f3a33', boots: '#2b2b2b', gloves: null, head: 'zombie', hair: '#2b2b2b', torso: 'torn', weapon: 'none', hunch: 0.2, bloat: true } },
      flyer: { name: 'GHOUL BAT', look: { body: 'bat', suit: '#4a3a5c', suit2: '#b33a3a', eye: '#ffe14a', scale: 1 } },
      brute: { name: 'BLOATER', look: { body: 'humanoid', skin: '#8fb36b', suit: '#c9b999', suit2: '#6e5a3f', pants: '#4d4633', boots: '#3a2e22', head: 'zombie', torso: 'torn', weapon: 'claws', scale: 1.45, bulk: 1.9, hunch: 0.25, armsForward: true, bloat: true } },
      boss: { name: 'THE ROTTING KING', look: { body: 'humanoid', skin: '#86a86a', suit: '#5c2a7a', suit2: '#ffd23f', pants: '#2b1a3a', boots: '#1b1b1b', head: 'crown', hair: '#e8e2c8', torso: 'robe', weapon: 'claws', scale: 2.1, bulk: 1.4, hunch: 0.2, cape: '#7a1b1b', armsForward: false } },
    },
    wakeLines: ['BRAAAINS...', 'GRRRAAHH!', 'HNNNGGH...', 'FRESH... MEAT...', 'URRRGH!', '*GURGLE*', 'HUNGRY...'],
    bossLines: ['KNEEL BEFORE YOUR ROTTING KING!', 'MY KINGDOM HUNGERS!', 'JOIN MY COURT... FOREVER!'],
    hitWords: ['SPLAT!', 'SQUELCH!', 'SPLORCH!', 'THUD!', 'GLORP!', 'CRUNCH!', 'SHLUK!'],
    killWords: ['SPLATTERED!', 'RE-DEAD!', 'ROT IN PEACE!', 'SQUISHED!', 'GIBBED!'],
    health: 'CANNED BEANS',
  },

  space: {
    key: 'space',
    label: 'SCI-FI',
    titleA: ['COSMIC', 'GALACTIC', 'STELLAR', 'ATOMIC', 'INTERPLANETARY', 'ASTOUNDING', 'ROCKET-AGE'],
    titleB: ['RAIDERS', 'ODYSSEY', 'STAR PATROL', 'INVADERS FROM ZORG', 'NEBULA RANGERS', 'ROCKET SQUADRON', 'VOID TROOPERS'],
    blurbs: ['THE ZORGONS ARE COMING!', 'BEYOND THE EDGE OF THE PAGE!', 'EARTH HAS 24 HOURS!', 'A TALE OF TOMORROW... TODAY!', 'IN SPACE, NO ONE HEARS YOU KAPOW!'],
    chapters: ['RED ALERT!', 'THE ZORGON ARMADA!', 'ESCAPE FROM PLANET X!', 'HEART OF THE MACHINE!', 'THE OVERMIND AWAKENS!', 'LOST IN THE NEBULA!'],
    captions: [
      'MEANWHILE, 40,000 LIGHT YEARS AWAY...', 'ABOARD THE STARSHIP VALIANT...', 'THE ZORGONS ATTACK!', 'ON THE DARK SIDE OF PLANET X...',
      'RED ALERT! ALL HANDS!', 'THE STARS BURN COLD HERE...', 'REACTOR AT 300% AND CLIMBING...', 'THE HANGAR BAY. TOO QUIET...',
    ],
    scenes: ['bridge', 'hangar', 'planet', 'reactor'],
    mono: false,
    palette: {
      ink: '#10121a', accent: '#23d5e8', accent2: '#ff3fa4', accent3: '#ffe14a',
      burst: ['#b8fbff', '#23d5e8'], burstEdge: '#ff3fa4', caption: '#b8fbff',
      splat: '#d11f26', enemySplat: '#b44dff',
    },
    geo: { platform: ['catwalk', 'hover', 'girder'], block: ['console', 'reactor', 'crates', 'pod'], table: 'messtable' },
    mix: { grunt: 4, gunner: 4, flyer: 3 },
    enemies: {
      grunt: { name: 'XENO DRONE', look: { body: 'humanoid', skin: '#b44dff', suit: '#3b2a5c', suit2: '#23d5e8', pants: '#2a1d42', boots: '#1b1b1b', gloves: null, head: 'alien', torso: 'armor', weapon: 'claws', hunch: 0.15 } },
      gunner: { name: 'ZORG TROOPER', look: { body: 'humanoid', skin: '#7ad17a', suit: '#e8e8f0', suit2: '#ff3fa4', pants: '#c8c8d8', boots: '#3a3a4a', gloves: '#3a3a4a', head: 'dome', torso: 'armor', weapon: 'blaster' } },
      flyer: { name: 'SAUCER BOT', look: { body: 'saucer', suit: '#b8c2cc', suit2: '#ff3fa4', eye: '#23d5e8', scale: 1 } },
      brute: { name: 'MECHA-GOLEM', look: { body: 'robot', suit: '#e0a02a', suit2: '#3a3a4a', eye: '#23d5e8', scale: 1.5, bulk: 1.6 } },
      boss: { name: 'THE OVERMIND', look: { body: 'brainjar', suit: '#c8d4dc', suit2: '#ff3fa4', eye: '#ffe14a', scale: 2.2 }, flying: true },
    },
    wakeLines: ['PUNY EARTHLINGS!', 'ZORG COMMANDS IT!', 'HUMANS DETECTED!', 'BLEEP-BLOOP! HOSTILES!', 'FOR THE HIVE!', 'TARGET ACQUIRED!', 'ZZZT! INTRUDER!'],
    bossLines: ['I AM THE OVERMIND. I HAVE READ AHEAD.', 'YOUR PAGES END HERE, CARBON-UNITS!', 'RESISTANCE IS... ADORABLE.'],
    hitWords: ['ZAP!', 'ZZT!', 'KZZT!', 'BLORP!', 'VWORP!', 'ZOT!', 'FZZAK!'],
    killWords: ['VAPORIZED!', 'ATOMIZED!', 'DE-REZZED!', 'ZORGED!', 'DISINTEGRATED!'],
    health: 'NANO-PACK',
  },

  noir: {
    key: 'noir',
    label: 'NOIR',
    titleA: ['MIDNIGHT', 'CRIMSON', 'COLD', 'CROOKED', 'NAKED', 'DEAD MAN’S', 'NO-GOOD'],
    titleB: ['CITY', 'ALIBI', 'RAIN', 'KISS', 'STREET', 'CONTRACT', 'DETECTIVE TALES'],
    blurbs: ['EVERYBODY HAS AN ANGLE!', 'THE CITY BLEEDS AT NIGHT!', 'TRUST NO ONE, SHAMUS!', 'A DAME, A GAT, AND A DEAD MAN!', 'CRIME DOES NOT PAY... EXCEPT HERE!'],
    chapters: ['THE DAME WHO KNEW TOO MUCH!', 'WRONG SIDE OF THE DOCKS!', 'A SONG FOR THE DEAD!', 'MR. BIG CALLS IN A FAVOR!', 'NO WAY OUT, SHAMUS!'],
    captions: [
      'THE RAIN NEVER STOPS IN THIS TOWN...', 'SHE HAD TROUBLE WRITTEN ALL OVER HER...', '3 A.M. THE CITY HOLDS ITS BREATH...',
      'THE BOYS AT THE DOCKS WERE EXPECTING ME...', 'EVERY ALLEY HAS A SECRET...', "I SHOULD'VE STAYED IN BED...",
      'THE CLUB WAS JUMPING. SO WAS I...', 'SOMEBODY WANTED ME DEAD. THEY HAD COMPANY.',
    ],
    scenes: ['alley', 'office', 'club', 'docks'],
    mono: true,
    palette: {
      ink: '#0b0b0b', accent: '#d7141a', accent2: '#f2efe6', accent3: '#d7141a',
      burst: ['#ffffff', '#f2efe6'], burstEdge: '#d7141a', caption: '#f2efe6',
      splat: '#d7141a', enemySplat: '#d7141a',
    },
    geo: { platform: ['fireescape', 'ledge', 'plank'], block: ['car', 'crates', 'desk', 'drums'], table: 'desk' },
    mix: { grunt: 5, gunner: 4, flyer: 1 },
    enemies: {
      grunt: { name: 'THUG', look: { body: 'humanoid', skin: '#e8d8c8', suit: '#3a3a3a', suit2: '#d7141a', pants: '#2a2a2a', boots: '#0b0b0b', gloves: null, head: 'flatcap', hat: '#2a2a2a', torso: 'suit', weapon: 'bat' } },
      gunner: { name: 'TOMMY GUNNER', look: { body: 'humanoid', skin: '#e8d8c8', suit: '#1f1f1f', suit2: '#f2efe6', pants: '#1f1f1f', boots: '#0b0b0b', gloves: null, head: 'fedora', hat: '#111111', torso: 'suit', weapon: 'tommy' } },
      flyer: { name: 'CROW', look: { body: 'bat', suit: '#141414', suit2: '#d7141a', eye: '#d7141a', scale: 0.9, crow: true } },
      brute: { name: 'THE BOUNCER', look: { body: 'humanoid', skin: '#e0cbb5', suit: '#2a2a2a', suit2: '#f2efe6', pants: '#1a1a1a', boots: '#0b0b0b', head: 'bald', torso: 'suit', weapon: 'none', scale: 1.45, bulk: 1.9 } },
      boss: { name: 'MR. BIG', look: { body: 'humanoid', skin: '#e8d8c8', suit: '#f2efe6', suit2: '#d7141a', pants: '#f2efe6', boots: '#0b0b0b', head: 'fedora', hat: '#f2efe6', torso: 'suit', weapon: 'tommy', scale: 2.0, bulk: 1.8, extra: 'cigar' } },
    },
    wakeLines: ['WELL, WELL, WELL...', "YOU'RE A DEAD MAN, SHAMUS!", 'THE BOSS SAYS HELLO!', 'WRONG ALLEY, PAL!', "LET'S DANCE, COPPER!", 'SAY YOUR PRAYERS!', 'NOTHIN’ PERSONAL, SEE?'],
    bossLines: ["NOBODY WALKS OUTTA MY CLUB, SEE?", 'YOU SHOULDA TAKEN THE MONEY, SHAMUS.', 'SAY HELLO TO MY GOLDEN FRIEND!'],
    hitWords: ['BANG!', 'CRACK!', 'THUD!', 'WHUMP!', 'SOCK!', 'KRAK!', 'BLAM!'],
    killWords: ['CURTAINS!', 'LIGHTS OUT!', 'CASE CLOSED!', 'SLEEPS WITH THE FISHES!', 'FINITO!'],
    health: 'COFFEE',
  },
};

export const THEME_KEYS = Object.keys(THEMES);

// Playable heroes. Purely cosmetic; everyone shares the same stats.
export const HEROES = {
  kapow: {
    name: 'CAPTAIN KAPOW',
    tag: 'Punches first. Monologues later.',
    look: { body: 'humanoid', suit: '#1f5fd1', suit2: '#e8262b', skin: '#f2c49b', cape: '#e8262b', head: 'mask', hair: '#f5c542', mask: '#1f5fd1', emblem: 'star', boots: '#e8262b', gloves: '#e8262b', belt: '#ffd23f', pants: '#1f5fd1', torso: 'hero', trunks: '#e8262b' },
  },
  nightink: {
    name: 'NIGHT INK',
    tag: 'Born in the gutter between panels.',
    look: { body: 'humanoid', suit: '#2e3170', suit2: '#23d5e8', skin: '#e9b48a', cape: '#161843', head: 'hood', mask: '#161843', emblem: 'drop', boots: '#161843', gloves: '#161843', belt: '#c9ced6', pants: '#23265a', torso: 'hero' },
  },
  voltvixen: {
    name: 'VOLT VIXEN',
    tag: 'Faster than a speech bubble.',
    look: { body: 'humanoid', suit: '#ffd23f', suit2: '#1b1b1b', skin: '#e9b48a', head: 'goggles', hair: '#e8262b', ponytail: true, emblem: 'bolt', boots: '#1b1b1b', gloves: '#1b1b1b', belt: '#1b1b1b', pants: '#1b1b1b', torso: 'hero' },
  },
  ronin: {
    name: 'RADIUM RONIN',
    tag: 'Glows in the dark. Cuts in the light.',
    look: { body: 'humanoid', suit: '#2fa84f', suit2: '#b8171b', skin: '#d9a077', head: 'helmet', visor: '#ffe14a', scarf: '#b8171b', emblem: 'circle', boots: '#1b1b1b', gloves: '#1b1b1b', belt: '#b8171b', pants: '#1c5c31', torso: 'hero' },
  },
  gumshoe: {
    name: 'THE GUMSHOE',
    tag: 'Trench coat. Bad attitude. Worse coffee.',
    look: { body: 'humanoid', suit: '#c9a36b', suit2: '#7a5a36', skin: '#f0c29a', head: 'fedora', hat: '#5a4632', tie: '#b8171b', boots: '#3a2a1b', gloves: null, pants: '#4a4a55', torso: 'trench' },
  },
  cosmo: {
    name: 'COSMO KID',
    tag: 'One small step for a kid. One giant KAPOW.',
    look: { body: 'humanoid', suit: '#f4f1e8', suit2: '#ff7a1a', skin: '#f2c49b', head: 'bubble', hair: '#6b3b1f', emblem: 'planet', boots: '#ff7a1a', gloves: '#ff7a1a', belt: '#ff7a1a', pants: '#f4f1e8', torso: 'hero', extra: 'airtank' },
  },
};

export const HERO_KEYS = Object.keys(HEROES);

// Nametag / minimap colors so two players on the same hero stay readable.
export const PLAYER_COLORS = ['#ffd23f', '#23d5e8', '#ff3fa4', '#7fd13b', '#ff7a1a', '#b44dff', '#ffffff', '#ff4d4d'];

export const TAUNTS = [
  'TAKE THAT!', 'IS THAT ALL YOU GOT?', 'EXCELSIOR-ISH!', 'HAH!', 'NEXT PANEL, PLEASE!', 'TOO SLOW!',
  "I'M THE MAIN CHARACTER!", 'KAPOW, BABY!', 'READ IT AND WEEP!', 'TO BE CONTINUED... FOR YOU!',
];
