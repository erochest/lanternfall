import { WEAPON_LEVEL_DAMAGE, getArmor } from '../data/gear';
import type { Mods } from './mods';
import { forgeRank, type Profile } from './profile';
import { WHETSTONE_BONUS, type RunState } from './run';

export interface PlayerStats {
  maxHp: number;
  damageMult: number;
  /** Fraction of incoming damage ignored (0..0.75). */
  dr: number;
  /** Multiplier on incoming damage applied after DR (e.g. Glass Heart). */
  damageTakenMult: number;
  moveSpeed: number;
  dashCharges: number;
  dashRecharge: number;
  flareCharges: number;
  flareRecharge: number;
  specialCdMult: number;
  attackSpeed: number;
  bossDamageMult: number;
  thorns: number;
  aegis: boolean;
  healOnClear: number;
}

export const BASE_HP = 80;
export const BASE_SPEED = 235;
export const BASE_DASH_RECHARGE = 0.75;
export const BASE_FLARE_RECHARGE = 6;

export function computeStats(profile: Profile, run: RunState, mods: Mods): PlayerStats {
  const armor = getArmor(run.armor);
  const armorLevel = profile.armors[run.armor] ?? 1;
  const weaponLevel = profile.weapons[run.weapon] ?? 1;
  const has = (t: string): boolean => run.trinkets.includes(t);

  const maxHp = Math.round(
    BASE_HP +
      forgeRank(profile, 'vitality') * 8 +
      armor.maxHp +
      armor.maxHpPerLevel * (armorLevel - 1) +
      run.heartBonus +
      mods.maxHp,
  );

  const damageMult =
    (1 +
      forgeRank(profile, 'might') * 0.05 +
      (weaponLevel - 1) * WEAPON_LEVEL_DAMAGE +
      run.whetstones * WHETSTONE_BONUS) *
    (has('glass_heart') ? 1.25 : 1);

  return {
    maxHp,
    damageMult,
    dr: Math.min(0.75, armor.dr + mods.dr),
    damageTakenMult: has('glass_heart') ? 1.15 : 1,
    moveSpeed: BASE_SPEED * (1 + armor.speed + mods.moveSpeed),
    dashCharges: 1 + forgeRank(profile, 'fleet') + armor.dashCharges,
    dashRecharge: BASE_DASH_RECHARGE / (1 + mods.dashRecharge),
    flareCharges: 2 + armor.flareCharges + forgeRank(profile, 'flare_cap'),
    flareRecharge: BASE_FLARE_RECHARGE / (1 + armor.flareRegen),
    specialCdMult: has('quick_wick') ? 0.8 : 1,
    attackSpeed: 1 + mods.attackSpeed,
    bossDamageMult: has('hunters_eye') ? 1.15 : 1,
    thorns: armor.thorns,
    aegis: armor.aegis,
    healOnClear: has('tide_charm') ? 6 : 0,
  };
}
