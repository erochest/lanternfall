import type { ActionSlot, Mods } from '../game/mods';

export type Current = 'ember' | 'frost' | 'storm' | 'tide' | 'gloom';
export const CURRENTS: readonly Current[] = ['ember', 'frost', 'storm', 'tide', 'gloom'];

export type GlyphSlot = ActionSlot | 'passive';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export const RARITY_POWER: Record<Rarity, number> = {
  common: 1,
  rare: 1.4,
  epic: 1.8,
  legendary: 2.2,
};

export const CURRENT_INFO: Record<Current, { name: string; color: string; blurb: string }> = {
  ember: { name: 'Ember', color: '#ff8a3d', blurb: 'Burn foes over time.' },
  frost: { name: 'Frost', color: '#8fe8ff', blurb: 'Chill, freeze and shatter.' },
  storm: { name: 'Storm', color: '#ffe45c', blurb: 'Lightning that leaps between foes.' },
  tide: { name: 'Tide', color: '#4f8dff', blurb: 'Knockback, waves and walls.' },
  gloom: { name: 'Gloom', color: '#b77bff', blurb: 'Critical hits and executions.' },
};

export const SLOT_LABEL: Record<GlyphSlot, string> = {
  attack: 'Attack',
  special: 'Special',
  dash: 'Dash',
  flare: 'Flare',
  passive: 'Passive',
};

export interface GlyphDef {
  id: string;
  name: string;
  current: Current;
  /** Confluences require a glyph of this current too. */
  secondary?: Current;
  slot: GlyphSlot;
  /** Confluences are always legendary. */
  legendary?: boolean;
  desc: (p: number) => string;
  apply: (m: Mods, p: number) => void;
}

/** Effect strength for a glyph of given rarity and level. */
export function glyphPower(rarity: Rarity, level: number): number {
  return RARITY_POWER[rarity] * (1 + 0.5 * (Math.max(1, level) - 1));
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const n = (x: number): string => `${Math.round(x)}`;
const n1 = (x: number): string => `${Math.round(x * 10) / 10}`;

export const GLYPHS: readonly GlyphDef[] = [
  // ------------------------------------------------------------------ Ember
  {
    id: 'ember_attack',
    name: 'Searing Strikes',
    current: 'ember',
    slot: 'attack',
    desc: (p) => `Attack deals +${pct(0.2 * p)} damage and applies ${n1(1 * p)} Burn.`,
    apply: (m, p) => {
      m.slot.attack.dmg += 0.2 * p;
      m.slot.attack.burn += 1 * p;
    },
  },
  {
    id: 'ember_special',
    name: 'Flame Lash',
    current: 'ember',
    slot: 'special',
    desc: (p) => `Special deals +${pct(0.4 * p)} damage and applies ${n1(3 * p)} Burn.`,
    apply: (m, p) => {
      m.slot.special.dmg += 0.4 * p;
      m.slot.special.burn += 3 * p;
    },
  },
  {
    id: 'ember_dash',
    name: 'Cinder Step',
    current: 'ember',
    slot: 'dash',
    desc: (p) => `Dash leaves a trail of cinders dealing ${n(6 * p)} damage and applying Burn.`,
    apply: (m, p) => {
      m.dashFireTrail += 6 * p;
      m.dashFireBurn += 1 * p;
    },
  },
  {
    id: 'ember_flare',
    name: 'Napalm Flare',
    current: 'ember',
    slot: 'flare',
    desc: (p) => `Flare applies ${n1(3 * p)} Burn and leaves a fire pool for 3s.`,
    apply: (m, p) => {
      m.slot.flare.burn += 3 * p;
      m.flarePool += 1 * p;
    },
  },
  {
    id: 'ember_kindling',
    name: 'Kindling',
    current: 'ember',
    slot: 'passive',
    desc: (p) => `Burn deals +${pct(0.5 * p)} damage.`,
    apply: (m, p) => {
      m.burnDpsMult += 0.5 * p;
    },
  },
  {
    id: 'ember_wildfire',
    name: 'Wildfire',
    current: 'ember',
    slot: 'passive',
    desc: (p) => `Burning foes explode on death for ${n(20 * p)} damage, spreading Burn.`,
    apply: (m, p) => {
      m.wildfire += 20 * p;
    },
  },
  {
    id: 'ember_hearth',
    name: 'Hearthblood',
    current: 'ember',
    slot: 'passive',
    desc: (p) => `+${n(20 * p)} max health.`,
    apply: (m, p) => {
      m.maxHp += 20 * p;
    },
  },

  // ------------------------------------------------------------------ Frost
  {
    id: 'frost_attack',
    name: 'Rime Edge',
    current: 'frost',
    slot: 'attack',
    desc: (p) => `Attack deals +${pct(0.15 * p)} damage and applies ${n1(1 * p)} Chill.`,
    apply: (m, p) => {
      m.slot.attack.dmg += 0.15 * p;
      m.slot.attack.chill += 1 * p;
    },
  },
  {
    id: 'frost_special',
    name: 'Glacial Crash',
    current: 'frost',
    slot: 'special',
    desc: (p) => `Special deals +${pct(0.35 * p)} damage and applies ${n1(2 * p)} Chill.`,
    apply: (m, p) => {
      m.slot.special.dmg += 0.35 * p;
      m.slot.special.chill += 2 * p;
    },
  },
  {
    id: 'frost_dash',
    name: 'Frost Step',
    current: 'frost',
    slot: 'dash',
    desc: (p) => `Dash ends in a frost nova dealing ${n(10 * p)} damage and applying ${n1(1.5 * p)} Chill.`,
    apply: (m, p) => {
      m.dashNova += 10 * p;
      m.dashNovaChill += 1.5 * p;
    },
  },
  {
    id: 'frost_flare',
    name: 'Hailstone Flare',
    current: 'frost',
    slot: 'flare',
    desc: (p) => `Flare deals +${pct(0.5 * p)} damage and applies ${n1(3 * p)} Chill.`,
    apply: (m, p) => {
      m.slot.flare.dmg += 0.5 * p;
      m.slot.flare.chill += 3 * p;
    },
  },
  {
    id: 'frost_permafrost',
    name: 'Permafrost',
    current: 'frost',
    slot: 'passive',
    desc: (p) => `Freeze lasts ${pct(0.6 * p)} longer; frozen foes take +${pct(0.25 * p)} damage.`,
    apply: (m, p) => {
      m.freezeDurMult += 0.6 * p;
      m.frozenVuln += 0.25 * p;
    },
  },
  {
    id: 'frost_shatter',
    name: 'Shatter',
    current: 'frost',
    slot: 'passive',
    desc: (p) => `Chilled or frozen foes burst on death for ${n(25 * p)} damage.`,
    apply: (m, p) => {
      m.shatter += 25 * p;
    },
  },
  {
    id: 'frost_ward',
    name: 'Glacial Ward',
    current: 'frost',
    slot: 'passive',
    desc: (p) => `Take ${pct(Math.min(0.3, 0.08 * p))} less damage.`,
    apply: (m, p) => {
      m.dr += Math.min(0.3, 0.08 * p);
    },
  },

  // ------------------------------------------------------------------ Storm
  {
    id: 'storm_attack',
    name: 'Thunder Strikes',
    current: 'storm',
    slot: 'attack',
    desc: (p) => `Attack hits arc lightning to 2 nearby foes for ${n(6 * p)} damage.`,
    apply: (m, p) => {
      m.slot.attack.dmg += 0.05 * p;
      m.slot.attack.chain = Math.max(m.slot.attack.chain, 2);
      m.slot.attack.chainDmg += 6 * p;
    },
  },
  {
    id: 'storm_special',
    name: 'Thunderclap',
    current: 'storm',
    slot: 'special',
    desc: (p) => `Special calls lightning on each foe hit for ${n(18 * p)} damage, chaining 3 times.`,
    apply: (m, p) => {
      m.slot.special.strike += 18 * p;
      m.slot.special.chain = Math.max(m.slot.special.chain, 3);
      m.slot.special.chainDmg += 8 * p;
    },
  },
  {
    id: 'storm_dash',
    name: 'Bolt Step',
    current: 'storm',
    slot: 'dash',
    desc: (p) => `Dashing strikes lightning where you stood for ${n(16 * p)} damage.`,
    apply: (m, p) => {
      m.dashBolt += 16 * p;
    },
  },
  {
    id: 'storm_flare',
    name: 'Storm Flare',
    current: 'storm',
    slot: 'flare',
    desc: (p) => `Flare leaves a storm cloud that zaps foes for ${n(9 * p)} damage for 3s.`,
    apply: (m, p) => {
      m.flareStorm += 9 * p;
    },
  },
  {
    id: 'storm_static',
    name: 'Static Charge',
    current: 'storm',
    slot: 'passive',
    desc: (p) => `Hits have a ${pct(Math.min(0.5, 0.15 * p))} chance to arc lightning for ${n(10 * p)} damage.`,
    apply: (m, p) => {
      m.staticChance = Math.min(0.5, m.staticChance + 0.15 * p);
      m.staticDmg += 10 * p;
    },
  },
  {
    id: 'storm_overcharge',
    name: 'Overcharge',
    current: 'storm',
    slot: 'passive',
    desc: (p) => `Lightning chains +1 time and deals +${pct(0.3 * p)} damage.`,
    apply: (m, p) => {
      m.chainBonusJumps += 1;
      m.chainDmgMult += 0.3 * p;
    },
  },
  {
    id: 'storm_gale',
    name: 'Galeborn',
    current: 'storm',
    slot: 'passive',
    desc: (p) => `+${pct(0.1 * p)} move speed; dash recharges ${pct(0.15 * p)} faster.`,
    apply: (m, p) => {
      m.moveSpeed += 0.1 * p;
      m.dashRecharge += 0.15 * p;
    },
  },

  // ------------------------------------------------------------------ Tide
  {
    id: 'tide_attack',
    name: 'Breaker Strikes',
    current: 'tide',
    slot: 'attack',
    desc: (p) => `Attack deals +${pct(0.15 * p)} damage with much stronger knockback.`,
    apply: (m, p) => {
      m.slot.attack.dmg += 0.15 * p;
      m.slot.attack.knock += 1.2;
    },
  },
  {
    id: 'tide_special',
    name: 'Crashing Wave',
    current: 'tide',
    slot: 'special',
    desc: (p) => `Special also sends a wave forward dealing ${n(22 * p)} damage.`,
    apply: (m, p) => {
      m.waveOnSpecial += 22 * p;
      m.slot.special.knock += 0.8;
    },
  },
  {
    id: 'tide_dash',
    name: 'Riptide',
    current: 'tide',
    slot: 'dash',
    desc: (p) => `Dashing through foes deals ${n(12 * p)} damage and shoves them aside.`,
    apply: (m, p) => {
      m.dashRiptide += 12 * p;
    },
  },
  {
    id: 'tide_flare',
    name: 'Maelstrom Flare',
    current: 'tide',
    slot: 'flare',
    desc: (p) => `Flare pulls foes in before it bursts and deals +${pct(0.3 * p)} damage.`,
    apply: (m, p) => {
      m.flarePull = true;
      m.slot.flare.dmg += 0.3 * p;
    },
  },
  {
    id: 'tide_undertow',
    name: 'Undertow',
    current: 'tide',
    slot: 'passive',
    desc: (p) => `Foes knocked into walls take ${n(25 * p)} damage.`,
    apply: (m, p) => {
      m.wallSlam += 25 * p;
    },
  },
  {
    id: 'tide_seawall',
    name: 'Sea Wall',
    current: 'tide',
    slot: 'passive',
    desc: (p) => `Block the first hit in each chamber, releasing a wave for ${n(20 * p)} damage.`,
    apply: (m, p) => {
      m.seaWall += 20 * p;
    },
  },
  {
    id: 'tide_flow',
    name: 'Flowstate',
    current: 'tide',
    slot: 'passive',
    desc: (p) => `Attack ${pct(Math.min(0.45, 0.12 * p))} faster.`,
    apply: (m, p) => {
      m.attackSpeed = Math.min(0.45, m.attackSpeed + 0.12 * p);
    },
  },

  // ------------------------------------------------------------------ Gloom
  {
    id: 'gloom_attack',
    name: 'Umbral Strikes',
    current: 'gloom',
    slot: 'attack',
    desc: (p) => `Attack deals +${pct(0.1 * p)} damage with +${pct(0.12 * p)} crit chance.`,
    apply: (m, p) => {
      m.slot.attack.dmg += 0.1 * p;
      m.slot.attack.crit += 0.12 * p;
    },
  },
  {
    id: 'gloom_special',
    name: "Reaper's Mark",
    current: 'gloom',
    slot: 'special',
    desc: (p) => `Special deals +${pct(0.3 * p)} damage with +${pct(0.2 * p)} crit chance.`,
    apply: (m, p) => {
      m.slot.special.dmg += 0.3 * p;
      m.slot.special.crit += 0.2 * p;
    },
  },
  {
    id: 'gloom_dash',
    name: 'Shade Step',
    current: 'gloom',
    slot: 'dash',
    desc: (p) => `After dashing, your next hit within 1s is a critical hit dealing +${pct(0.2 * p)}.`,
    apply: (m, p) => {
      m.dashShade = true;
      m.slot.dash.dmg += 0.2 * p;
    },
  },
  {
    id: 'gloom_flare',
    name: 'Void Flare',
    current: 'gloom',
    slot: 'flare',
    desc: (p) => `Flare deals +${pct(0.4 * p)} damage with +${pct(0.25 * p)} crit chance.`,
    apply: (m, p) => {
      m.slot.flare.dmg += 0.4 * p;
      m.slot.flare.crit += 0.25 * p;
    },
  },
  {
    id: 'gloom_twilight',
    name: 'Twilight Edge',
    current: 'gloom',
    slot: 'passive',
    desc: (p) => `Deal +${pct(0.4 * p)} damage to foes below 30% health.`,
    apply: (m, p) => {
      m.executeBonus += 0.4 * p;
    },
  },
  {
    id: 'gloom_hunger',
    name: 'Hunger',
    current: 'gloom',
    slot: 'passive',
    desc: (p) => `Restore ${n1(2 * p)} health whenever you slay a foe.`,
    apply: (m, p) => {
      m.healOnKill += 2 * p;
    },
  },
  {
    id: 'gloom_focus',
    name: 'Deep Focus',
    current: 'gloom',
    slot: 'passive',
    desc: (p) => `Critical hits deal +${pct(0.5 * p)} damage; +5% crit chance.`,
    apply: (m, p) => {
      m.critDmg += 0.5 * p;
      m.critAll += 0.05;
    },
  },

  // -------------------------------------------------------------- Confluences
  {
    id: 'conf_thermal',
    name: 'Thermal Shock',
    current: 'ember',
    secondary: 'frost',
    slot: 'passive',
    legendary: true,
    desc: () => `Hitting a foe that is both Burning and Chilled detonates it for 40 damage.`,
    apply: (m) => {
      m.thermalShock += 40;
    },
  },
  {
    id: 'conf_supercond',
    name: 'Superconductor',
    current: 'storm',
    secondary: 'frost',
    slot: 'passive',
    legendary: true,
    desc: () => `Lightning deals double damage to Chilled foes and applies Chill.`,
    apply: (m) => {
      m.superconductor = true;
    },
  },
  {
    id: 'conf_scald',
    name: 'Scalding Surf',
    current: 'tide',
    secondary: 'ember',
    slot: 'passive',
    legendary: true,
    desc: () => `Knockback applies 2 Burn. Wall slams deal double damage.`,
    apply: (m) => {
      m.scaldingSurf = true;
    },
  },
  {
    id: 'conf_thunderhead',
    name: 'Thunderhead',
    current: 'storm',
    secondary: 'tide',
    slot: 'passive',
    legendary: true,
    desc: () => `Foes knocked into walls release lightning that chains 3 times for 20 damage.`,
    apply: (m) => {
      m.thunderhead += 20;
      m.wallSlam = Math.max(m.wallSlam, 10);
    },
  },
  {
    id: 'conf_blackflame',
    name: 'Black Flame',
    current: 'gloom',
    secondary: 'ember',
    slot: 'passive',
    legendary: true,
    desc: () => `Burn can critically hit, and stacks up to 15.`,
    apply: (m) => {
      m.blackFlame = true;
      m.burnMax = Math.max(m.burnMax, 15);
    },
  },
  {
    id: 'conf_abyssal',
    name: 'Abyssal Chill',
    current: 'gloom',
    secondary: 'frost',
    slot: 'passive',
    legendary: true,
    desc: () => `Critical hits apply 2 Chill. +30% crit chance against frozen foes.`,
    apply: (m) => {
      m.abyssalChill = true;
    },
  },
];

const BY_ID = new Map(GLYPHS.map((g) => [g.id, g]));

export function getGlyph(id: string): GlyphDef {
  const g = BY_ID.get(id);
  if (!g) throw new Error(`Unknown glyph: ${id}`);
  return g;
}

export function hasGlyph(id: string): boolean {
  return BY_ID.has(id);
}
