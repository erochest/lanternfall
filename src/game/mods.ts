/**
 * Modifiers are the flattened result of every Glyph the player holds during a
 * run. Combat code only ever reads this structure, so new glyphs are data.
 */

export type ActionSlot = 'attack' | 'special' | 'dash' | 'flare';
export const ACTION_SLOTS: readonly ActionSlot[] = ['attack', 'special', 'dash', 'flare'];

export interface SlotFx {
  /** Additive damage bonus (0.2 = +20%). */
  dmg: number;
  /** Burn stacks applied per hit. */
  burn: number;
  /** Chill stacks applied per hit. */
  chill: number;
  /** Chain-lightning jumps per hit (0 = none). */
  chain: number;
  chainDmg: number;
  /** Knockback multiplier bonus (additive). */
  knock: number;
  /** Additive crit chance. */
  crit: number;
  /** Extra lightning strike damage on every hit. */
  strike: number;
}

export interface Mods {
  slot: Record<ActionSlot, SlotFx>;

  // Dash behaviours
  dashFireTrail: number; // damage per tick of the cinder trail, 0 = off
  dashFireBurn: number;
  dashNova: number; // frost nova damage at dash end, 0 = off
  dashNovaChill: number;
  dashBolt: number; // lightning at dash origin
  dashRiptide: number; // damage to enemies dashed through
  dashShade: boolean; // next attack after a dash is a guaranteed crit

  // Flare behaviours
  flarePool: number; // burn stacks per tick from a lingering fire pool
  flareStorm: number; // storm cloud zap damage
  flarePull: boolean;

  // Ember
  burnDpsMult: number;
  burnMax: number;
  wildfire: number;

  // Frost
  freezeDurMult: number;
  frozenVuln: number;
  shatter: number;

  // Storm
  staticChance: number;
  staticDmg: number;
  chainBonusJumps: number;
  chainDmgMult: number;

  // Tide
  wallSlam: number;
  seaWall: number; // wave damage when the per-room shield pops, 0 = no shield
  attackSpeed: number;
  waveOnSpecial: number;

  // Gloom
  executeBonus: number;
  healOnKill: number;
  critDmg: number;
  critAll: number;

  // Passive stats
  maxHp: number;
  dr: number;
  moveSpeed: number;
  dashRecharge: number;

  // Confluences
  thermalShock: number;
  superconductor: boolean;
  scaldingSurf: boolean;
  thunderhead: number;
  blackFlame: boolean;
  abyssalChill: boolean;
}

export function emptySlotFx(): SlotFx {
  return { dmg: 0, burn: 0, chill: 0, chain: 0, chainDmg: 0, knock: 0, crit: 0, strike: 0 };
}

export function createMods(): Mods {
  return {
    slot: {
      attack: emptySlotFx(),
      special: emptySlotFx(),
      dash: emptySlotFx(),
      flare: emptySlotFx(),
    },
    dashFireTrail: 0,
    dashFireBurn: 0,
    dashNova: 0,
    dashNovaChill: 0,
    dashBolt: 0,
    dashRiptide: 0,
    dashShade: false,
    flarePool: 0,
    flareStorm: 0,
    flarePull: false,
    burnDpsMult: 1,
    burnMax: 10,
    wildfire: 0,
    freezeDurMult: 1,
    frozenVuln: 0,
    shatter: 0,
    staticChance: 0,
    staticDmg: 0,
    chainBonusJumps: 0,
    chainDmgMult: 1,
    wallSlam: 0,
    seaWall: 0,
    attackSpeed: 0,
    waveOnSpecial: 0,
    executeBonus: 0,
    healOnKill: 0,
    critDmg: 0,
    critAll: 0,
    maxHp: 0,
    dr: 0,
    moveSpeed: 0,
    dashRecharge: 0,
    thermalShock: 0,
    superconductor: false,
    scaldingSurf: false,
    thunderhead: 0,
    blackFlame: false,
    abyssalChill: false,
  };
}
