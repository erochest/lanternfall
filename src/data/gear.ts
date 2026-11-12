/** Weapons, armor, trinkets and permanent forge upgrades. */

export interface Cost {
  embers: number;
  starglass?: number;
}

// ---------------------------------------------------------------- Weapons

export interface AttackStep {
  shape: 'arc' | 'thrust' | 'slam' | 'bolt';
  damage: number;
  /** Arc radius, thrust length, slam radius, or bolt travel distance. */
  range: number;
  spread?: number;
  width?: number;
  /** Forward offset of a slam's centre. */
  offset?: number;
  windup: number;
  active: number;
  recovery: number;
  /** Forward step at the start of the active window. */
  lunge: number;
  knock: number;
  moveMult: number;
  projSpeed?: number;
  pierce?: number;
}

export type SpecialKind = 'whirl' | 'harpoon' | 'burst' | 'shockwave';

export interface SpecialDef {
  kind: SpecialKind;
  name: string;
  damage: number;
  cooldown: number;
  range: number;
  windup: number;
  recovery: number;
  knock: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  kind: string;
  desc: string;
  color: string;
  combo: AttackStep[];
  dashAttack: AttackStep;
  special: SpecialDef;
  /** How far aim-assist looks for targets. */
  assistRange: number;
  unlock: Cost | null;
  unlockHint?: string;
}

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: 'cutlass',
    name: 'Tidecutter',
    kind: 'Cutlass',
    desc: 'Quick slashing combo. Special: a whirling spin that hits all around you.',
    color: '#9ff3e4',
    assistRange: 190,
    unlock: null,
    combo: [
      { shape: 'arc', damage: 14, range: 74, spread: 2.0, windup: 0.06, active: 0.08, recovery: 0.14, lunge: 18, knock: 160, moveMult: 0.35 },
      { shape: 'arc', damage: 14, range: 74, spread: 2.0, windup: 0.06, active: 0.08, recovery: 0.14, lunge: 18, knock: 160, moveMult: 0.35 },
      { shape: 'arc', damage: 26, range: 86, spread: 3.2, windup: 0.12, active: 0.1, recovery: 0.3, lunge: 30, knock: 380, moveMult: 0.2 },
    ],
    dashAttack: { shape: 'thrust', damage: 22, range: 110, width: 36, windup: 0.02, active: 0.1, recovery: 0.2, lunge: 60, knock: 260, moveMult: 0.2 },
    special: { kind: 'whirl', name: 'Maelstrom Spin', damage: 30, cooldown: 2.6, range: 104, windup: 0.08, recovery: 0.22, knock: 340 },
  },
  {
    id: 'harpoon',
    name: 'Brinepiercer',
    kind: 'Harpoon',
    desc: 'Long reaching thrusts. Special: hurl the harpoon to pierce a line of foes.',
    color: '#ffd28a',
    assistRange: 230,
    unlock: { embers: 90 },
    combo: [
      { shape: 'thrust', damage: 17, range: 128, width: 30, windup: 0.09, active: 0.08, recovery: 0.16, lunge: 14, knock: 150, moveMult: 0.3 },
      { shape: 'thrust', damage: 17, range: 128, width: 30, windup: 0.09, active: 0.08, recovery: 0.16, lunge: 14, knock: 150, moveMult: 0.3 },
      { shape: 'arc', damage: 24, range: 120, spread: 3.0, windup: 0.14, active: 0.1, recovery: 0.32, lunge: 10, knock: 320, moveMult: 0.2 },
    ],
    dashAttack: { shape: 'thrust', damage: 30, range: 160, width: 34, windup: 0.03, active: 0.1, recovery: 0.24, lunge: 70, knock: 300, moveMult: 0.2 },
    special: { kind: 'harpoon', name: 'Harpoon Throw', damage: 38, cooldown: 2.2, range: 420, windup: 0.12, recovery: 0.16, knock: 260 },
  },
  {
    id: 'staff',
    name: 'Lumen Staff',
    kind: 'Staff',
    desc: 'Fires bolts of light from range — forgiving on small screens. Special: a radiant cone blast.',
    color: '#fff1a8',
    assistRange: 460,
    unlock: { embers: 140 },
    combo: [
      { shape: 'bolt', damage: 9, range: 440, width: 12, windup: 0.03, active: 0.02, recovery: 0.21, lunge: 0, knock: 70, moveMult: 0.6, projSpeed: 780, pierce: 0 },
    ],
    dashAttack: { shape: 'bolt', damage: 18, range: 480, width: 18, windup: 0.02, active: 0.02, recovery: 0.2, lunge: 0, knock: 180, moveMult: 0.5, projSpeed: 900, pierce: 2 },
    special: { kind: 'burst', name: 'Radiant Burst', damage: 30, cooldown: 3.0, range: 170, windup: 0.14, recovery: 0.25, knock: 420 },
  },
  {
    id: 'anchor',
    name: 'Deepweight',
    kind: 'Anchor',
    desc: 'Slow, crushing blows. Special: a shockwave that rolls outward from you.',
    color: '#c2b6ff',
    assistRange: 170,
    unlock: { embers: 160, starglass: 1 },
    unlockHint: 'Requires Starglass from a guardian.',
    combo: [
      { shape: 'slam', damage: 34, range: 64, offset: 46, windup: 0.22, active: 0.1, recovery: 0.26, lunge: 16, knock: 420, moveMult: 0.15 },
      { shape: 'arc', damage: 46, range: 100, spread: 4.2, windup: 0.28, active: 0.12, recovery: 0.38, lunge: 24, knock: 540, moveMult: 0.1 },
    ],
    dashAttack: { shape: 'slam', damage: 44, range: 82, offset: 40, windup: 0.08, active: 0.1, recovery: 0.3, lunge: 50, knock: 500, moveMult: 0.1 },
    special: { kind: 'shockwave', name: 'Undertow Slam', damage: 48, cooldown: 3.6, range: 210, windup: 0.22, recovery: 0.3, knock: 480 },
  },
];

export const WEAPON_MAX_LEVEL = 5;
export const WEAPON_LEVEL_DAMAGE = 0.12;
export function weaponUpgradeCost(level: number): Cost {
  // Cost to go from `level` to `level + 1`.
  const embers = [0, 50, 90, 150, 240][level] ?? 999;
  return level >= 3 ? { embers, starglass: level - 2 } : { embers };
}

// ---------------------------------------------------------------- Armor

export interface ArmorDef {
  id: string;
  name: string;
  desc: string;
  color: string;
  maxHp: number;
  maxHpPerLevel: number;
  dr: number;
  speed: number;
  dashCharges: number;
  flareCharges: number;
  flareRegen: number;
  thorns: number;
  aegis: boolean;
  unlock: Cost | null;
  requires?: { boss: string };
}

export const ARMORS: readonly ArmorDef[] = [
  {
    id: 'driftwood',
    name: 'Driftwood Coat',
    desc: 'A keeper\'s simple coat. Reliable, if unremarkable.',
    color: '#a5865c',
    maxHp: 0, maxHpPerLevel: 6, dr: 0, speed: 0, dashCharges: 0, flareCharges: 0, flareRegen: 0, thorns: 0, aegis: false,
    unlock: null,
  },
  {
    id: 'coral',
    name: 'Coral Mail',
    desc: '+25 max health. Foes that strike you are cut by coral for 15 damage.',
    color: '#ff7f7f',
    maxHp: 25, maxHpPerLevel: 8, dr: 0, speed: 0, dashCharges: 0, flareCharges: 0, flareRegen: 0, thorns: 15, aegis: false,
    unlock: { embers: 70 },
  },
  {
    id: 'stormweave',
    name: 'Stormweave Cloak',
    desc: '+12% move speed and an extra dash charge.',
    color: '#ffe45c',
    maxHp: 0, maxHpPerLevel: 5, dr: 0, speed: 0.12, dashCharges: 1, flareCharges: 0, flareRegen: 0, thorns: 0, aegis: false,
    unlock: { embers: 110 },
  },
  {
    id: 'lumen',
    name: 'Lumen Robe',
    desc: 'An extra Flare charge, and Flares recharge 35% faster.',
    color: '#fff1a8',
    maxHp: 0, maxHpPerLevel: 5, dr: 0, speed: 0, dashCharges: 0, flareCharges: 1, flareRegen: 0.35, thorns: 0, aegis: false,
    unlock: { embers: 120 },
  },
  {
    id: 'abyssal',
    name: 'Abyssal Plate',
    desc: 'Take 22% less damage, but move 8% slower.',
    color: '#8a7bd1',
    maxHp: 10, maxHpPerLevel: 8, dr: 0.22, speed: -0.08, dashCharges: 0, flareCharges: 0, flareRegen: 0, thorns: 0, aegis: false,
    unlock: { embers: 180, starglass: 1 },
    requires: { boss: 'matriarch' },
  },
  {
    id: 'aegis',
    name: 'Tidal Aegis',
    desc: 'The first hit you take in each chamber is negated.',
    color: '#4f8dff',
    maxHp: 0, maxHpPerLevel: 6, dr: 0.05, speed: 0, dashCharges: 0, flareCharges: 0, flareRegen: 0, thorns: 0, aegis: true,
    unlock: { embers: 240, starglass: 2 },
    requires: { boss: 'archivist' },
  },
];

export const ARMOR_MAX_LEVEL = 3;
export function armorUpgradeCost(level: number): Cost {
  const embers = [0, 60, 120][level] ?? 999;
  return level >= 2 ? { embers, starglass: 1 } : { embers };
}

// ---------------------------------------------------------------- Trinkets

export interface TrinketDef {
  id: string;
  name: string;
  desc: string;
  unlock: Cost | null;
  requires?: { boss: string };
}

export const TRINKETS: readonly TrinketDef[] = [
  { id: 'lantern_spark', name: 'Lantern Spark', desc: 'Once per run, rekindle at 40% health when you would fall.', unlock: null },
  { id: 'pearl_purse', name: 'Pearl Purse', desc: 'Gain 30% more Pearls.', unlock: { embers: 40 } },
  { id: 'ember_locket', name: 'Ember Locket', desc: 'Gain 20% more Embers.', unlock: { embers: 60 } },
  { id: 'old_compass', name: 'Old Compass', desc: 'Glyphs are more likely to be rare or better.', unlock: { embers: 80 } },
  { id: 'tide_charm', name: 'Tide Charm', desc: 'Restore 6 health after clearing each chamber.', unlock: { embers: 70 } },
  { id: 'hunters_eye', name: "Hunter's Eye", desc: 'Deal 15% more damage to guardians and elites.', unlock: { embers: 90 }, requires: { boss: 'matriarch' } },
  { id: 'quick_wick', name: 'Quick Wick', desc: 'Your Special recharges 20% faster.', unlock: { embers: 100 } },
  { id: 'glass_heart', name: 'Glass Heart', desc: 'Deal 25% more damage, but take 15% more.', unlock: { embers: 120, starglass: 1 }, requires: { boss: 'kiln' } },
];

// ---------------------------------------------------------------- Forge

export type ForgeId =
  | 'vitality'
  | 'might'
  | 'fleet'
  | 'wick'
  | 'fortune'
  | 'haggler'
  | 'harvest'
  | 'current_tide'
  | 'current_gloom'
  | 'trinket_slot'
  | 'flare_cap';

export interface ForgeDef {
  id: ForgeId;
  name: string;
  desc: (rank: number) => string;
  maxRank: number;
  cost: (rank: number) => Cost;
}

export const FORGE: readonly ForgeDef[] = [
  {
    id: 'vitality',
    name: 'Tempered Heart',
    desc: (r) => `+8 max health per rank. (Now +${r * 8})`,
    maxRank: 5,
    cost: (r) => ({ embers: 25 + r * 25 }),
  },
  {
    id: 'might',
    name: 'Keeper\'s Might',
    desc: (r) => `+5% damage per rank. (Now +${r * 5}%)`,
    maxRank: 5,
    cost: (r) => ({ embers: 30 + r * 30 }),
  },
  {
    id: 'current_tide',
    name: 'Call of the Tide',
    desc: () => 'Tide glyphs can appear in your descents.',
    maxRank: 1,
    cost: () => ({ embers: 60 }),
  },
  {
    id: 'current_gloom',
    name: 'Whisper of Gloom',
    desc: () => 'Gloom glyphs can appear in your descents.',
    maxRank: 1,
    cost: () => ({ embers: 80 }),
  },
  {
    id: 'fleet',
    name: 'Fleet Step',
    desc: () => '+1 dash charge.',
    maxRank: 1,
    cost: () => ({ embers: 120 }),
  },
  {
    id: 'flare_cap',
    name: 'Deep Pockets',
    desc: () => '+1 Flare charge.',
    maxRank: 1,
    cost: () => ({ embers: 100 }),
  },
  {
    id: 'fortune',
    name: 'Star Reading',
    desc: (r) => `Better odds of rare glyphs. (Rank ${r}/3)`,
    maxRank: 3,
    cost: (r) => ({ embers: 50 + r * 50 }),
  },
  {
    id: 'harvest',
    name: 'Ember Harvest',
    desc: (r) => `+10% Embers per rank. (Now +${r * 10}%)`,
    maxRank: 3,
    cost: (r) => ({ embers: 40 + r * 40 }),
  },
  {
    id: 'haggler',
    name: 'Silver Tongue',
    desc: (r) => `Shop prices 10% lower per rank. (Now -${r * 10}%)`,
    maxRank: 2,
    cost: (r) => ({ embers: 50 + r * 50 }),
  },
  {
    id: 'wick',
    name: 'Spare Wick',
    desc: (r) => `+1 rekindle per run. (Now ${r})`,
    maxRank: 2,
    cost: (r) => ({ embers: 150 + r * 100, starglass: 1 + r }),
  },
  {
    id: 'trinket_slot',
    name: 'Second Chain',
    desc: () => 'Equip a second trinket.',
    maxRank: 1,
    cost: () => ({ embers: 90 }),
  },
];

const find = <T extends { id: string }>(list: readonly T[], id: string, kind: string): T => {
  const v = list.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown ${kind}: ${id}`);
  return v;
};

export const getWeapon = (id: string): WeaponDef => find(WEAPONS, id, 'weapon');
export const getArmor = (id: string): ArmorDef => find(ARMORS, id, 'armor');
export const getTrinket = (id: string): TrinketDef => find(TRINKETS, id, 'trinket');
export const getForge = (id: ForgeId): ForgeDef => find(FORGE, id, 'forge upgrade');
