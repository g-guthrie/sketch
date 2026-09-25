// Mail-order ad perks. Between chapters the comic flips to its back-page ads
// and every player clips one coupon. Each perk is a small rule change, so
// runs diverge. Effects are applied in game.js / movement.js by key.

export const PERKS = {
  xray: {
    title: 'X-RAY SPECS!', tag: 'SEE THRU CRATES! SPOT THE KEY-CARRIER!',
    body: 'Amaze your friends! Weak spots glow: +30% damage to staggered foes.', price: '$1.00', icon: 'specs',
  },
  mighty: {
    title: 'BUILD A MIGHTY BODY IN 7 DAYS!', tag: 'NO MORE SAND KICKED IN YOUR FACE!',
    body: 'Fists hit 40% harder and crack guards 40% faster.', price: '$2.98', icon: 'muscle',
  },
  boots: {
    title: 'GENUINE ROCKET BOOTS', tag: 'AS SEEN IN THE FUTURE!',
    body: 'A third jump in mid-air and a faster dash recharge.', price: '$4.95', icon: 'boots',
  },
  decoder: {
    title: 'SECRET DECODER RING', tag: 'JOIN THE CLUB! KNOW THE CODE!',
    body: 'Reload twice as fast. Headshots hit 25% harder.', price: '25¢', icon: 'ring',
  },
  heart: {
    title: 'SPARE HEART (MAIL-IN!)', tag: 'SHIPS IN A PLAIN BROWN WRAPPER',
    body: '+40 max health and a full heal right now.', price: '$0.50', icon: 'heart',
  },
  hypno: {
    title: 'HYPNO-COIN', tag: 'YOU ARE GETTING VERY SLEEPY...',
    body: 'Staggers last 50% longer and staggered foes take extra damage.', price: '$1.25', icon: 'coin',
  },
  ink: {
    title: 'INK BOTTLE REFILL', tag: 'NEVER RUN DRY AGAIN!',
    body: '+1 ink bomb and bombs recharge 40% faster.', price: '39¢', icon: 'bottle',
  },
  buzzer: {
    title: 'JOY BUZZER', tag: 'THE LIFE OF THE PARTY!',
    body: 'Every punch arcs a shock to up to 2 nearby foes.', price: '$1.49', icon: 'buzzer',
  },
  selfdef: {
    title: 'SELF-DEFENSE BY MAIL', tag: 'LEARN THE SECRET JUDO MASTERS FEAR!',
    body: 'Dash through an attack and your next punch is a KNOCKOUT blow.', price: '$3.00', icon: 'judo',
  },
  speed: {
    title: 'SPEED-READING COURSE', tag: 'READ 1,000 PANELS A MINUTE!',
    body: 'Move 12% faster. The super charges 30% faster.', price: '$9.95', icon: 'book',
  },
};

export const PERK_KEYS = Object.keys(PERKS);

// Movement parameters derived from perks (shared with client prediction).
export function applyPerkStats(p) {
  const k = p.perks || {};
  p.airJumps = k.boots ? 2 : 1;
  p.moveMul = k.speed ? 1.12 : 1;
  p.dashCdMul = k.boots ? 0.6 : 1;
}
