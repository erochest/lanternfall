import type { Current } from '../data/glyphs';
import {
  ARMORS,
  ARMOR_MAX_LEVEL,
  FORGE,
  TRINKETS,
  WEAPONS,
  WEAPON_MAX_LEVEL,
  armorUpgradeCost,
  getArmor,
  getForge,
  getTrinket,
  getWeapon,
  weaponUpgradeCost,
  type Cost,
  type ForgeId,
} from '../data/gear';

export interface Profile {
  version: 1;
  embers: number;
  starglass: number;
  /** Unlocked weapon id -> level (1..WEAPON_MAX_LEVEL). */
  weapons: Record<string, number>;
  armors: Record<string, number>;
  trinkets: string[];
  equipped: { weapon: string; armor: string; trinkets: string[] };
  forge: Partial<Record<ForgeId, number>>;
  bossKills: Record<string, number>;
  /** Selected difficulty ("Tide") and highest unlocked. */
  tide: number;
  maxTide: number;
  stats: {
    runs: number;
    wins: number;
    kills: number;
    bestDepth: number;
    totalEmbers: number;
  };
  tutorialDone: boolean;
}

export const MAX_TIDE = 10;

export function newProfile(): Profile {
  return {
    version: 1,
    embers: 0,
    starglass: 0,
    weapons: { cutlass: 1 },
    armors: { driftwood: 1 },
    trinkets: ['lantern_spark'],
    equipped: { weapon: 'cutlass', armor: 'driftwood', trinkets: ['lantern_spark'] },
    forge: {},
    bossKills: {},
    tide: 0,
    maxTide: 0,
    stats: { runs: 0, wins: 0, kills: 0, bestDepth: 0, totalEmbers: 0 },
    tutorialDone: false,
  };
}

export type PurchaseResult = { ok: true } | { ok: false; reason: 'cost' | 'max' | 'locked' | 'owned' | 'unknown' };

export const forgeRank = (p: Profile, id: ForgeId): number => p.forge[id] ?? 0;
export const trinketSlots = (p: Profile): number => 1 + forgeRank(p, 'trinket_slot');

export function unlockedCurrents(p: Profile): Current[] {
  const list: Current[] = ['ember', 'frost', 'storm'];
  if (forgeRank(p, 'current_tide') > 0) list.push('tide');
  if (forgeRank(p, 'current_gloom') > 0) list.push('gloom');
  return list;
}

export function canAfford(p: Profile, cost: Cost): boolean {
  return p.embers >= cost.embers && p.starglass >= (cost.starglass ?? 0);
}

function pay(p: Profile, cost: Cost): boolean {
  if (!canAfford(p, cost)) return false;
  p.embers -= cost.embers;
  p.starglass -= cost.starglass ?? 0;
  return true;
}

export function requirementMet(p: Profile, req?: { boss: string }): boolean {
  return !req || (p.bossKills[req.boss] ?? 0) > 0;
}

export function unlockWeapon(p: Profile, id: string): PurchaseResult {
  const w = getWeapon(id);
  if (p.weapons[id]) return { ok: false, reason: 'owned' };
  if (!w.unlock) return { ok: false, reason: 'unknown' };
  if (!pay(p, w.unlock)) return { ok: false, reason: 'cost' };
  p.weapons[id] = 1;
  return { ok: true };
}

export function upgradeWeapon(p: Profile, id: string): PurchaseResult {
  const lvl = p.weapons[id];
  if (!lvl) return { ok: false, reason: 'locked' };
  if (lvl >= WEAPON_MAX_LEVEL) return { ok: false, reason: 'max' };
  if (!pay(p, weaponUpgradeCost(lvl))) return { ok: false, reason: 'cost' };
  p.weapons[id] = lvl + 1;
  return { ok: true };
}

export function unlockArmor(p: Profile, id: string): PurchaseResult {
  const a = getArmor(id);
  if (p.armors[id]) return { ok: false, reason: 'owned' };
  if (!a.unlock) return { ok: false, reason: 'unknown' };
  if (!requirementMet(p, a.requires)) return { ok: false, reason: 'locked' };
  if (!pay(p, a.unlock)) return { ok: false, reason: 'cost' };
  p.armors[id] = 1;
  return { ok: true };
}

export function upgradeArmor(p: Profile, id: string): PurchaseResult {
  const lvl = p.armors[id];
  if (!lvl) return { ok: false, reason: 'locked' };
  if (lvl >= ARMOR_MAX_LEVEL) return { ok: false, reason: 'max' };
  if (!pay(p, armorUpgradeCost(lvl))) return { ok: false, reason: 'cost' };
  p.armors[id] = lvl + 1;
  return { ok: true };
}

export function unlockTrinket(p: Profile, id: string): PurchaseResult {
  const t = getTrinket(id);
  if (p.trinkets.includes(id)) return { ok: false, reason: 'owned' };
  if (!t.unlock) return { ok: false, reason: 'unknown' };
  if (!requirementMet(p, t.requires)) return { ok: false, reason: 'locked' };
  if (!pay(p, t.unlock)) return { ok: false, reason: 'cost' };
  p.trinkets.push(id);
  return { ok: true };
}

/** Equip or unequip a trinket. When slots are full, the oldest is replaced. */
export function toggleTrinket(p: Profile, id: string): void {
  if (!p.trinkets.includes(id)) return;
  const eq = p.equipped.trinkets;
  const i = eq.indexOf(id);
  if (i >= 0) {
    eq.splice(i, 1);
    return;
  }
  eq.push(id);
  while (eq.length > trinketSlots(p)) eq.shift();
}

export function buyForge(p: Profile, id: ForgeId): PurchaseResult {
  const f = getForge(id);
  const rank = forgeRank(p, id);
  if (rank >= f.maxRank) return { ok: false, reason: 'max' };
  if (!pay(p, f.cost(rank))) return { ok: false, reason: 'cost' };
  p.forge[id] = rank + 1;
  return { ok: true };
}

export function equipWeapon(p: Profile, id: string): void {
  if (p.weapons[id]) p.equipped.weapon = id;
}

export function equipArmor(p: Profile, id: string): void {
  if (p.armors[id]) p.equipped.armor = id;
}

// ---------------------------------------------------------------------------
// Sanitising loaded data: never trust localStorage. Unknown ids are dropped
// and every missing field falls back to a fresh profile's value.
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number, lo = 0, hi = 1e9): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

function levels(raw: unknown, valid: Set<string>, max: number, base: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...base };
  if (isObj(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (valid.has(k)) out[k] = Math.round(num(v, 1, 1, max));
    }
  }
  return out;
}

export function sanitizeProfile(raw: unknown): Profile {
  const d = newProfile();
  if (!isObj(raw)) return d;

  const weaponIds = new Set(WEAPONS.map((w) => w.id));
  const armorIds = new Set(ARMORS.map((a) => a.id));
  const trinketIds = new Set(TRINKETS.map((t) => t.id));
  const forgeIds = new Set<string>(FORGE.map((f) => f.id));

  const p: Profile = {
    version: 1,
    embers: Math.floor(num(raw.embers, 0)),
    starglass: Math.floor(num(raw.starglass, 0)),
    weapons: levels(raw.weapons, weaponIds, WEAPON_MAX_LEVEL, d.weapons),
    armors: levels(raw.armors, armorIds, ARMOR_MAX_LEVEL, d.armors),
    trinkets: Array.from(
      new Set([...d.trinkets, ...(Array.isArray(raw.trinkets) ? raw.trinkets : [])].filter((t): t is string => typeof t === 'string' && trinketIds.has(t))),
    ),
    equipped: { ...d.equipped, trinkets: [...d.equipped.trinkets] },
    forge: {},
    bossKills: {},
    tide: 0,
    maxTide: Math.round(num(raw.maxTide, 0, 0, MAX_TIDE)),
    stats: { ...d.stats },
    tutorialDone: raw.tutorialDone === true,
  };
  p.tide = Math.round(num(raw.tide, 0, 0, p.maxTide));

  if (isObj(raw.forge)) {
    for (const [k, v] of Object.entries(raw.forge)) {
      if (forgeIds.has(k)) {
        const def = getForge(k as ForgeId);
        p.forge[k as ForgeId] = Math.round(num(v, 0, 0, def.maxRank));
      }
    }
  }
  if (isObj(raw.bossKills)) {
    for (const [k, v] of Object.entries(raw.bossKills)) p.bossKills[k] = Math.floor(num(v, 0));
  }
  if (isObj(raw.stats)) {
    for (const k of Object.keys(p.stats) as (keyof Profile['stats'])[]) {
      p.stats[k] = Math.floor(num(raw.stats[k], 0));
    }
  }
  if (isObj(raw.equipped)) {
    const e = raw.equipped;
    if (typeof e.weapon === 'string' && p.weapons[e.weapon]) p.equipped.weapon = e.weapon;
    if (typeof e.armor === 'string' && p.armors[e.armor]) p.equipped.armor = e.armor;
    if (Array.isArray(e.trinkets)) {
      p.equipped.trinkets = e.trinkets
        .filter((t): t is string => typeof t === 'string' && p.trinkets.includes(t))
        .slice(0, trinketSlots(p));
    }
  }
  return p;
}
