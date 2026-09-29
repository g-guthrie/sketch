// Fighter roster: body proportions, hair and colour ramps.
// Ramps run [outline, shadow, mid, light, highlight].

const SKIN = {
  peach: ['#3b1712', '#a85a44', '#e39472', '#f9c29c', '#ffe4c8'],
  tan: ['#34150c', '#8e4a2a', '#c97c4c', '#eeaa72', '#ffd6a4'],
  brown: ['#1f0c07', '#5a2e18', '#8c5230', '#b8784a', '#e2a878'],
  deep: ['#140806', '#3c1c10', '#63341e', '#8a5230', '#b8804e'],
  olive: ['#2a1a0c', '#7c5634', '#b08254', '#d4a878', '#f2d4a8'],
};

const base = {
  legScale: 0.92, shoulder: 30, chest: 24, waistW: 17, hip: 20, belly: 0,
  neck: -3, neckR: 9, headR: 19, jaw: 1,
  upperArm: 27, foreArm: 30, arm: 7.5, delt: 10, glove: 13,
  thigh: 10, calf: 8.5,
  hair: 'buzz', beard: false, stache: false,
};

export const FIGHTERS = [
  {
    id: 'rico',
    name: 'RICO BLAZE',
    tag: 'THE SPARK',
    from: 'SAN JUAN',
    body: { ...base, hair: 'pomp', shoulder: 29, chest: 23 },
    palette: {
      outline: ['#170a12'],
      skin: SKIN.tan,
      hair: ['#0c0a14', '#1c1830', '#302a4c', '#4a4270', '#7a72a8'],
      glove: ['#2a0406', '#7a0c12', '#c8161e', '#f2442e', '#ffd2b0'],
      gloveGlow: ['#402000', '#c86a00', '#ffb000', '#ffe860', '#ffffff'],
      gloveTrim: ['#3a3040', '#9a92a4', '#dcd6e0', '#ffffff', '#ffffff'],
      trunks: ['#08122a', '#12306a', '#1c56b8', '#3a86f0', '#a8d0ff'],
      trunksTrim: ['#3a2a04', '#b08010', '#f0c020', '#fff070', '#ffffff'],
      shoe: ['#101018', '#2a2a36', '#4a4a5c', '#70708a', '#a8a8c0'],
      sock: ['#40404c', '#a0a0b0', '#e0e0e8', '#ffffff', '#ffffff'],
    },
  },
  {
    id: 'bruno',
    name: 'BIG BRUNO',
    tag: 'THE MOUNTAIN',
    from: 'NAPLES',
    body: { ...base, hair: 'bald', beard: true, shoulder: 34, chest: 28, waistW: 22, hip: 23, belly: 6, headR: 20, arm: 9, delt: 11, glove: 13, thigh: 10.5, calf: 8.5, neckR: 10, jaw: 1.15 },
    palette: {
      outline: ['#170a0a'],
      skin: SKIN.peach,
      hair: ['#1a0a04', '#5a2a10', '#8c4418', '#b8662a', '#e0a060'],
      glove: ['#0e1a06', '#2a5410', '#3e8a18', '#66c02a', '#d0ffb0'],
      gloveGlow: ['#402000', '#c86a00', '#ffb000', '#ffe860', '#ffffff'],
      gloveTrim: ['#3a3040', '#9a92a4', '#dcd6e0', '#ffffff', '#ffffff'],
      trunks: ['#240408', '#6a0c1c', '#a8182e', '#e03a48', '#ffb0b0'],
      trunksTrim: ['#3a3a44', '#a0a0b0', '#e8e8f0', '#ffffff', '#ffffff'],
      shoe: ['#1a0a04', '#4a2410', '#744020', '#a0643a', '#d09a6a'],
      sock: ['#40404c', '#a0a0b0', '#e0e0e8', '#ffffff', '#ffffff'],
    },
  },
  {
    id: 'volt',
    name: 'VOLT VEGA',
    tag: 'LIGHTNING ROD',
    from: 'LAS VEGAS',
    body: { ...base, hair: 'mohawk', shoulder: 28, chest: 22, waistW: 16, hip: 19, arm: 6.5, delt: 9, headR: 18.5, thigh: 8.5, calf: 7 },
    palette: {
      outline: ['#10081a'],
      skin: SKIN.olive,
      hair: ['#2a0a30', '#8a1a8a', '#d030c0', '#ff70f0', '#ffd0ff'],
      hairDark: ['#0c0a10', '#1a1620', '#2a2430', '#3a3444', '#4a4458'],
      glove: ['#1a1604', '#6a5a08', '#c8a810', '#f8e040', '#ffffc0'],
      gloveGlow: ['#402000', '#c86a00', '#ffb000', '#ffe860', '#ffffff'],
      gloveTrim: ['#10081a', '#2a2040', '#40345c', '#5a4c80', '#8070b0'],
      trunks: ['#140a24', '#3a1a6a', '#6a30b8', '#9a5aec', '#d8b8ff'],
      trunksTrim: ['#1a1604', '#6a5a08', '#c8a810', '#f8e040', '#ffffc0'],
      shoe: ['#1a1604', '#6a5a08', '#c8a810', '#f8e040', '#ffffc0'],
      sock: ['#40404c', '#a0a0b0', '#e0e0e8', '#ffffff', '#ffffff'],
    },
  },
  {
    id: 'duke',
    name: 'DUKE HOLLOWAY',
    tag: 'THE GENTLEMAN',
    from: 'DETROIT',
    body: { ...base, hair: 'flattop', stache: true, shoulder: 31, chest: 25, waistW: 18, hip: 21, arm: 7.5, delt: 10, headR: 19.5, thigh: 9.5, calf: 8, neckR: 9, jaw: 1.08 },
    palette: {
      outline: ['#0e0604'],
      skin: SKIN.brown,
      hair: ['#060404', '#141010', '#241c1a', '#382c28', '#5a4a44'],
      glove: ['#06121e', '#0c3456', '#1a5e96', '#3a92d6', '#b8e4ff'],
      gloveGlow: ['#402000', '#c86a00', '#ffb000', '#ffe860', '#ffffff'],
      gloveTrim: ['#3a2a04', '#b08010', '#f0c020', '#fff070', '#ffffff'],
      trunks: ['#101010', '#262630', '#3e3e4c', '#5c5c70', '#9a9ab0'],
      trunksTrim: ['#3a2a04', '#b08010', '#f0c020', '#fff070', '#ffffff'],
      shoe: ['#101010', '#262630', '#3e3e4c', '#5c5c70', '#9a9ab0'],
      sock: ['#40404c', '#a0a0b0', '#e0e0e8', '#ffffff', '#ffffff'],
    },
  },
];

export const FIGHTER_BY_ID = Object.fromEntries(FIGHTERS.map((f) => [f.id, f]));

// The referee is built with the same renderer.
export const REFEREE = {
  id: 'ref',
  name: 'REF',
  body: { ...base, outfit: 'ref', hair: 'buzz', stache: true, shoulder: 27, chest: 22, waistW: 18, hip: 20, belly: 3, headR: 17.5, arm: 6.5, delt: 8, glove: 5.5, thigh: 9, calf: 7.5, legScale: 0.98, jaw: 1.05 },
  palette: {
    outline: ['#10101a'],
    skin: SKIN.peach,
    hair: ['#303038', '#6a6a78', '#9a9aa8', '#c8c8d4', '#ffffff'],
    shirt: ['#2a3040', '#8a98b8', '#d0d8ec', '#ffffff', '#ffffff'],
    tie: ['#000000', '#0a0a10', '#1a1a24', '#34344a', '#5a5a78'],
    trunks: ['#08080c', '#16161e', '#262634', '#3a3a4c', '#5a5a70'],
    trunksTrim: ['#000000', '#0a0a0a', '#141414', '#2a2a2a', '#c0a040'],
    shoe: ['#000000', '#0a0a10', '#1a1a24', '#3a3a4c', '#8a8aa0'],
    sock: ['#08080c', '#16161e', '#262634', '#3a3a4c', '#5a5a70'],
    glove: SKIN.peach,
    gloveTrim: SKIN.peach,
  },
};
