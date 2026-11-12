import { BIOMES, ROOMS_PER_BIOME, SHOP_ROOM } from '../data/biomes';
import {
  GLYPHS,
  RARITIES,
  getGlyph,
  glyphPower,
  hasGlyph,
  type Current,
  type GlyphDef,
  type Rarity,
} from '../data/glyphs';
import { Rng } from '../core/rng';
import { createMods, type Mods } from './mods';
import { forgeRank, unlockedCurrents, type Profile } from './profile';

export type RewardKind =
  | 'glyph'
  | 'pearls'
  | 'embers'
  | 'heart'
  | 'whetstone'
  | 'restore'
  | 'shop'
  | 'boss'
  | 'none';

export interface Reward {
  kind: RewardKind;
  current?: Current;
}

export interface OwnedGlyph {
  id: string;
  rarity: Rarity;
  level: number;
}

export interface ShopItem {
  kind: 'glyph' | 'heart' | 'restore' | 'whetstone';
  current?: Current;
  price: number;
  sold: boolean;
}

export interface RunState {
  version: 1;
  seed: number;
  rngState: number;
  weapon: string;
  armor: string;
  trinkets: string[];
  tide: number;
  biome: number;
  /** Room index within the biome; ROOMS_PER_BIOME is the guardian. */
  room: number;
  roomReward: Reward;
  hp: number;
  heartBonus: number;
  whetstones: number;
  glyphs: OwnedGlyph[];
  pearls: number;
  embers: number;
  starglass: number;
  rekindles: number;
  kills: number;
  time: number;
  shop: ShopItem[] | null;
  bossesDefeated: string[];
  /** Seed for the current room's layout so a resumed room looks the same. */
  roomSeed: number;
  /** Exits rolled for the current room (null until the room is entered). */
  doors: Reward[] | null;
  /** The current room has been cleared and its reward claimed. */
  cleared: boolean;
}

export const MAX_GLYPH_LEVEL = 4;
export const HEART_BONUS = 15;
export const WHETSTONE_BONUS = 0.08;
export const RESTORE_FRACTION = 0.4;

export function newRun(profile: Profile, seed: number = (Math.random() * 2 ** 32) >>> 0): RunState {
  const rng = new Rng(seed);
  const currents = unlockedCurrents(profile);
  const rekindles =
    (profile.equipped.trinkets.includes('lantern_spark') ? 1 : 0) + forgeRank(profile, 'wick');
  const firstCurrent = rng.pick(currents);
  return {
    version: 1,
    seed,
    rngState: rng.state,
    weapon: profile.equipped.weapon,
    armor: profile.equipped.armor,
    trinkets: [...profile.equipped.trinkets],
    tide: profile.tide,
    biome: 0,
    room: 0,
    roomReward: { kind: 'glyph', current: firstCurrent },
    hp: -1, // filled in from computed max HP at first room start
    heartBonus: 0,
    whetstones: 0,
    glyphs: [],
    pearls: 0,
    embers: 0,
    starglass: 0,
    rekindles,
    kills: 0,
    time: 0,
    shop: null,
    bossesDefeated: [],
    roomSeed: rng.int(1, 2 ** 31 - 1),
    doors: null,
    cleared: false,
  };
}

export const isBossRoom = (run: RunState): boolean => run.room === ROOMS_PER_BIOME;
export const isShopRoom = (run: RunState): boolean => run.roomReward.kind === 'shop';
export const isFinalBiome = (run: RunState): boolean => run.biome === BIOMES.length - 1;

/** Overall depth counter (rooms entered), used for stats and scaling. */
export const depthOf = (run: RunState): number => run.biome * (ROOMS_PER_BIOME + 1) + run.room + 1;

export function computeMods(run: RunState): Mods {
  const m = createMods();
  for (const g of run.glyphs) {
    if (!hasGlyph(g.id)) continue;
    const def = getGlyph(g.id);
    def.apply(m, def.legendary ? 1 : glyphPower(g.rarity, g.level));
  }
  return m;
}

// ---------------------------------------------------------------- multipliers

export function emberMultiplier(run: RunState, profile: Profile): number {
  const locket = run.trinkets.includes('ember_locket') ? 0.2 : 0;
  return (1 + forgeRank(profile, 'harvest') * 0.1 + locket) * (1 + run.tide * 0.15);
}

export function pearlMultiplier(run: RunState): number {
  return run.trinkets.includes('pearl_purse') ? 1.3 : 1;
}

export function shopDiscount(profile: Profile): number {
  return 1 - 0.1 * forgeRank(profile, 'haggler');
}

// ---------------------------------------------------------------- doors

export function rollDoors(run: RunState, profile: Profile, rng: Rng): Reward[] {
  const next = run.room + 1;
  if (run.room === ROOMS_PER_BIOME) {
    // Leaving the guardian: on to the next biome (first chamber always a glyph).
    return [{ kind: 'glyph', current: rng.pick(unlockedCurrents(profile)) }];
  }
  if (next === ROOMS_PER_BIOME) return [{ kind: 'boss' }];

  const currents = rng.shuffle([...unlockedCurrents(profile)]);
  const doors: Reward[] = [];
  if (next === SHOP_ROOM) doors.push({ kind: 'shop' });

  const count = next === SHOP_ROOM ? 2 : rng.chance(0.3) ? 3 : 2;
  const pool: { kind: RewardKind; w: number }[] = [
    { kind: 'glyph', w: 46 },
    { kind: 'pearls', w: 14 },
    { kind: 'embers', w: 16 },
    { kind: 'heart', w: 9 },
    { kind: 'whetstone', w: 8 },
    { kind: 'restore', w: 7 },
  ];
  let guard = 0;
  while (doors.length < count && guard++ < 50) {
    const pick = rng.weighted(pool, (p) => p.w).kind;
    if (pick === 'glyph') {
      const usedCurrents = doors.filter((d) => d.kind === 'glyph').map((d) => d.current);
      const c = currents.find((x) => !usedCurrents.includes(x));
      if (!c) continue;
      doors.push({ kind: 'glyph', current: c });
    } else {
      if (doors.some((d) => d.kind === pick)) continue;
      doors.push({ kind: pick });
    }
  }
  return doors;
}

/** Move to the next room, which will grant `reward` when cleared. */
export function advanceRoom(run: RunState, reward: Reward): void {
  if (run.room === ROOMS_PER_BIOME) {
    run.biome += 1;
    run.room = 0;
  } else {
    run.room += 1;
  }
  run.roomReward = reward;
  run.shop = null;
  run.doors = null;
  run.cleared = false;
}

// ---------------------------------------------------------------- simple rewards

export function pearlsReward(run: RunState, rng: Rng): number {
  return Math.round(rng.int(26, 40) * (1 + run.biome * 0.3) * pearlMultiplier(run));
}

export function embersReward(run: RunState, profile: Profile, rng: Rng): number {
  return Math.round(rng.int(12, 20) * (1 + run.biome * 0.5) * emberMultiplier(run, profile));
}

export function bossEmbers(run: RunState, profile: Profile): number {
  return Math.round(40 * (run.biome + 1) * emberMultiplier(run, profile));
}

/** Starglass for a guardian: 1, plus 1 for a first-ever kill. */
export function bossStarglass(profile: Profile, bossId: string): number {
  return 1 + ((profile.bossKills[bossId] ?? 0) === 0 ? 1 : 0);
}

// ---------------------------------------------------------------- glyph offers

export interface GlyphOffer {
  id: string;
  rarity: Rarity;
  /** Level the glyph will be after taking this offer. */
  level: number;
  /** Glyph in the same slot that this would replace. */
  replaces?: string;
}

export function rarityWeights(run: RunState, profile: Profile): Record<Rarity, number> {
  const fortune = forgeRank(profile, 'fortune');
  const compass = run.trinkets.includes('old_compass') ? 1 : 0;
  return {
    common: Math.max(20, 70 - fortune * 10 - compass * 15),
    rare: 22 + fortune * 6 + compass * 9,
    epic: 8 + fortune * 4 + compass * 6,
    legendary: 0,
  };
}

export function rollRarity(run: RunState, profile: Profile, rng: Rng): Rarity {
  const w = rarityWeights(run, profile);
  return rng.weighted(RARITIES, (r) => w[r]);
}

const currentsOwned = (run: RunState): Set<Current> => {
  const s = new Set<Current>();
  for (const g of run.glyphs) {
    if (!hasGlyph(g.id)) continue;
    const d = getGlyph(g.id);
    s.add(d.current);
    if (d.secondary) s.add(d.secondary);
  }
  return s;
};

export function offerGlyphs(
  run: RunState,
  profile: Profile,
  current: Current,
  rng: Rng,
  count = 3,
): GlyphOffer[] {
  const owned = new Map(run.glyphs.map((g) => [g.id, g]));
  const have = currentsOwned(run);
  const allowed = new Set(unlockedCurrents(profile));

  const bySlot = new Map<string, string>();
  for (const g of run.glyphs) {
    if (!hasGlyph(g.id)) continue;
    const d = getGlyph(g.id);
    if (d.slot !== 'passive') bySlot.set(d.slot, g.id);
  }

  const toOffer = (d: GlyphDef): GlyphOffer | null => {
    const mine = owned.get(d.id);
    if (mine) {
      if (d.legendary || mine.level >= MAX_GLYPH_LEVEL) return null;
      return { id: d.id, rarity: mine.rarity, level: mine.level + 1 };
    }
    const offer: GlyphOffer = {
      id: d.id,
      rarity: d.legendary ? 'legendary' : rollRarity(run, profile, rng),
      level: 1,
    };
    if (d.slot !== 'passive') {
      const occupant = bySlot.get(d.slot);
      if (occupant) offer.replaces = occupant;
    }
    return offer;
  };

  // Confluences: legendary, need the other current already in the build.
  const confluences = GLYPHS.filter(
    (g) =>
      g.legendary &&
      !owned.has(g.id) &&
      (g.current === current || g.secondary === current) &&
      allowed.has(g.current) &&
      (!g.secondary || allowed.has(g.secondary)) &&
      have.has(g.current === current ? (g.secondary as Current) : g.current),
  );

  const normal = GLYPHS.filter((g) => !g.legendary && g.current === current);
  const candidates = normal
    .map(toOffer)
    .filter((o): o is GlyphOffer => o !== null);

  // Prefer fresh glyphs for empty slots, then upgrades, then replacements.
  const score = (o: GlyphOffer): number => {
    if (o.level > 1) return 2.0;
    if (o.replaces) return 0.6;
    return 3.0;
  };
  const picks: GlyphOffer[] = [];
  if (confluences.length > 0 && rng.chance(0.35)) {
    const c = toOffer(rng.pick(confluences));
    if (c) picks.push(c);
  }
  const pool = [...candidates];
  while (picks.length < count && pool.length > 0) {
    const o = rng.weighted(pool, score);
    pool.splice(pool.indexOf(o), 1);
    picks.push(o);
  }
  return picks;
}

export function takeGlyph(run: RunState, offer: GlyphOffer): void {
  if (offer.replaces) run.glyphs = run.glyphs.filter((g) => g.id !== offer.replaces);
  const existing = run.glyphs.find((g) => g.id === offer.id);
  if (existing) {
    existing.level = Math.min(MAX_GLYPH_LEVEL, offer.level);
  } else {
    run.glyphs.push({ id: offer.id, rarity: offer.rarity, level: offer.level });
  }
}

// ---------------------------------------------------------------- shop

export function generateShop(run: RunState, profile: Profile, rng: Rng): ShopItem[] {
  const scale = shopDiscount(profile) * (1 + run.biome * 0.15);
  const price = (base: number): number => Math.round(base * scale);
  const currents = rng.shuffle([...unlockedCurrents(profile)]);
  return [
    { kind: 'glyph', current: currents[0], price: price(70), sold: false },
    { kind: 'glyph', current: currents[1 % currents.length], price: price(70), sold: false },
    { kind: 'heart', price: price(55), sold: false },
    { kind: 'restore', price: price(40), sold: false },
    { kind: 'whetstone', price: price(85), sold: false },
  ];
}

export function buyShopItem(run: RunState, index: number): ShopItem | null {
  const item = run.shop?.[index];
  if (!item || item.sold || run.pearls < item.price) return null;
  run.pearls -= item.price;
  item.sold = true;
  return item;
}

// ---------------------------------------------------------------- sanitising

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Returns a usable RunState or null if the saved run is unrecoverable. */
export function sanitizeRun(raw: unknown): RunState | null {
  if (!isObj(raw) || raw.version !== 1) return null;
  const r = raw as unknown as RunState;
  const okNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!okNum(r.seed) || !okNum(r.biome) || !okNum(r.room) || !okNum(r.hp)) return null;
  if (r.biome < 0 || r.biome >= BIOMES.length || r.room < 0 || r.room > ROOMS_PER_BIOME) return null;
  if (!Array.isArray(r.glyphs) || !isObj(r.roomReward)) return null;
  r.glyphs = r.glyphs.filter(
    (g) => isObj(g) && typeof g.id === 'string' && hasGlyph(g.id) && RARITIES.includes(g.rarity),
  );
  r.bossesDefeated = Array.isArray(r.bossesDefeated) ? r.bossesDefeated : [];
  r.trinkets = Array.isArray(r.trinkets) ? r.trinkets : [];
  r.doors = Array.isArray(r.doors) ? r.doors : null;
  r.cleared = r.cleared === true;
  r.roomSeed = okNum(r.roomSeed) ? r.roomSeed : 1;
  r.shop = Array.isArray(r.shop) ? r.shop : null;
  return r;
}
