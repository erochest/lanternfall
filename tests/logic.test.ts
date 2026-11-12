import { describe, expect, it } from 'vitest';
import { circleIntersectsRect, pushCircleOutOfRect, shapeHitsCircle } from '../src/core/math';
import { Rng } from '../src/core/rng';
import { ROOMS_PER_BIOME, SHOP_ROOM } from '../src/data/biomes';
import { getWeapon, weaponUpgradeCost } from '../src/data/gear';
import { GLYPHS, getGlyph, glyphPower } from '../src/data/glyphs';
import {
  buyForge,
  equipWeapon,
  newProfile,
  sanitizeProfile,
  toggleTrinket,
  trinketSlots,
  unlockArmor,
  unlockTrinket,
  unlockWeapon,
  unlockedCurrents,
  upgradeWeapon,
} from '../src/game/profile';
import {
  MAX_GLYPH_LEVEL,
  advanceRoom,
  buyShopItem,
  computeMods,
  generateShop,
  newRun,
  offerGlyphs,
  rollDoors,
  sanitizeRun,
  takeGlyph,
} from '../src/game/run';
import { SAVE_KEY, defaultSettings, loadSave, parseSave, sanitizeSettings, writeSave } from '../src/game/save';
import { computeStats } from '../src/game/stats';

describe('rng', () => {
  it('is deterministic for a seed and resumable from its state', () => {
    const a = new Rng(42);
    const seq = [a.next(), a.next(), a.next()];
    const b = new Rng(42);
    expect([b.next(), b.next(), b.next()]).toEqual(seq);
    const c = new Rng(a.state);
    expect(c.next()).toBe(a.next());
  });

  it('int stays within inclusive bounds', () => {
    const r = new Rng(7);
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
    }
  });
});

describe('hit shapes', () => {
  it('arc only hits targets inside its spread', () => {
    const arc = { kind: 'arc' as const, x: 0, y: 0, r: 100, angle: 0, spread: Math.PI / 2 };
    expect(shapeHitsCircle(arc, 60, 0, 10)).toBe(true);
    expect(shapeHitsCircle(arc, -60, 0, 10)).toBe(false);
    expect(shapeHitsCircle(arc, 0, 60, 10)).toBe(false);
    expect(shapeHitsCircle(arc, 115, 0, 10)).toBe(false);
  });

  it('line respects its length and width', () => {
    const line = { kind: 'line' as const, x: 0, y: 0, angle: 0, length: 200, width: 20 };
    expect(shapeHitsCircle(line, 150, 12, 5)).toBe(true);
    expect(shapeHitsCircle(line, 150, 30, 5)).toBe(false);
    expect(shapeHitsCircle(line, 220, 0, 5)).toBe(false);
  });

  it('ring misses its safe centre', () => {
    const ring = { kind: 'ring' as const, x: 0, y: 0, r: 100, thickness: 20 };
    expect(shapeHitsCircle(ring, 100, 0, 5)).toBe(true);
    expect(shapeHitsCircle(ring, 0, 0, 5)).toBe(false);
  });

  it('pushes circles out of rectangles', () => {
    const rect = { x: 0, y: 0, w: 100, h: 100 };
    const p = { x: -5, y: 50 };
    pushCircleOutOfRect(p, 10, rect);
    expect(p.x).toBeCloseTo(-10);
    expect(circleIntersectsRect(p.x, p.y, 10, rect)).toBe(false);
    const inside = { x: 50, y: 95 };
    pushCircleOutOfRect(inside, 10, rect);
    expect(inside.y).toBeCloseTo(110);
  });
});

describe('profile purchases', () => {
  it('unlocks and upgrades weapons only when affordable', () => {
    const p = newProfile();
    expect(unlockWeapon(p, 'harpoon')).toEqual({ ok: false, reason: 'cost' });
    p.embers = getWeapon('harpoon').unlock!.embers;
    expect(unlockWeapon(p, 'harpoon')).toEqual({ ok: true });
    expect(p.embers).toBe(0);
    expect(unlockWeapon(p, 'harpoon')).toEqual({ ok: false, reason: 'owned' });

    p.embers = 10_000;
    p.starglass = 100;
    for (let lvl = 1; lvl < 5; lvl++) {
      const cost = weaponUpgradeCost(lvl);
      const before = p.embers;
      expect(upgradeWeapon(p, 'cutlass').ok).toBe(true);
      expect(before - p.embers).toBe(cost.embers);
    }
    expect(upgradeWeapon(p, 'cutlass')).toEqual({ ok: false, reason: 'max' });
    expect(upgradeWeapon(p, 'staff')).toEqual({ ok: false, reason: 'locked' });
  });

  it('gates boss-locked gear behind guardian kills', () => {
    const p = newProfile();
    p.embers = 10_000;
    p.starglass = 10;
    expect(unlockArmor(p, 'abyssal')).toEqual({ ok: false, reason: 'locked' });
    p.bossKills.matriarch = 1;
    expect(unlockArmor(p, 'abyssal')).toEqual({ ok: true });
  });

  it('only equips owned weapons', () => {
    const p = newProfile();
    equipWeapon(p, 'anchor');
    expect(p.equipped.weapon).toBe('cutlass');
  });

  it('trinket slots grow with the forge and cap equips', () => {
    const p = newProfile();
    p.embers = 10_000;
    unlockTrinket(p, 'pearl_purse');
    toggleTrinket(p, 'pearl_purse');
    expect(p.equipped.trinkets).toEqual(['pearl_purse']);
    expect(buyForge(p, 'trinket_slot').ok).toBe(true);
    expect(trinketSlots(p)).toBe(2);
    toggleTrinket(p, 'lantern_spark');
    expect(p.equipped.trinkets).toEqual(['pearl_purse', 'lantern_spark']);
    toggleTrinket(p, 'pearl_purse');
    expect(p.equipped.trinkets).toEqual(['lantern_spark']);
  });

  it('forge unlocks new currents and respects max rank', () => {
    const p = newProfile();
    p.embers = 10_000;
    expect(unlockedCurrents(p)).toEqual(['ember', 'frost', 'storm']);
    buyForge(p, 'current_tide');
    expect(unlockedCurrents(p)).toContain('tide');
    expect(buyForge(p, 'current_tide')).toEqual({ ok: false, reason: 'max' });
  });

  it('forge upgrades feed into player stats', () => {
    const p = newProfile();
    const run = newRun(p, 1);
    const base = computeStats(p, run, computeMods(run));
    p.embers = 10_000;
    buyForge(p, 'vitality');
    buyForge(p, 'fleet');
    const after = computeStats(p, newRun(p, 1), computeMods(run));
    expect(after.maxHp).toBe(base.maxHp + 8);
    expect(after.dashCharges).toBe(base.dashCharges + 1);
  });
});

describe('profile sanitising', () => {
  it('survives garbage and hostile input', () => {
    for (const raw of [null, 42, 'x', [], { embers: 'lots' }]) {
      const p = sanitizeProfile(raw);
      expect(p.equipped.weapon).toBe('cutlass');
      expect(p.embers).toBe(0);
    }
  });

  it('drops unknown ids, clamps levels and keeps valid data', () => {
    const p = sanitizeProfile({
      embers: 123.7,
      starglass: -5,
      weapons: { cutlass: 99, harpoon: 2, laser: 3 },
      trinkets: ['pearl_purse', 'bogus'],
      equipped: { weapon: 'harpoon', armor: 'nope', trinkets: ['pearl_purse', 'lantern_spark'] },
      forge: { vitality: 50, hacks: 3 },
      tide: 9,
      maxTide: 3,
      tutorialDone: true,
    });
    expect(p.embers).toBe(123);
    expect(p.starglass).toBe(0);
    expect(p.weapons).toEqual({ cutlass: 5, harpoon: 2 });
    expect(p.trinkets).toEqual(['lantern_spark', 'pearl_purse']);
    expect(p.equipped.weapon).toBe('harpoon');
    expect(p.equipped.armor).toBe('driftwood');
    expect(p.equipped.trinkets).toEqual(['pearl_purse']); // only one slot
    expect(p.forge).toEqual({ vitality: 5 });
    expect(p.tide).toBe(3);
    expect(p.tutorialDone).toBe(true);
  });
});

describe('run structure', () => {
  it('offers a shop before room SHOP_ROOM and a single boss door before the guardian', () => {
    const p = newProfile();
    const rng = new Rng(5);
    for (let i = 0; i < 20; i++) {
      const run = newRun(p, i + 1);
      run.room = SHOP_ROOM - 1;
      expect(rollDoors(run, p, rng).map((d) => d.kind)).toContain('shop');
      run.room = ROOMS_PER_BIOME - 1;
      expect(rollDoors(run, p, rng)).toEqual([{ kind: 'boss' }]);
    }
  });

  it('never offers two doors with the same reward', () => {
    const p = newProfile();
    const rng = new Rng(9);
    for (let i = 0; i < 200; i++) {
      const run = newRun(p, i + 1);
      run.room = i % (ROOMS_PER_BIOME - 1);
      const doors = rollDoors(run, p, rng);
      const keys = doors.map((d) => `${d.kind}:${d.current ?? ''}`);
      expect(new Set(keys).size).toBe(keys.length);
      expect(doors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('advances through biomes after the guardian', () => {
    const run = newRun(newProfile(), 3);
    run.room = ROOMS_PER_BIOME;
    run.cleared = true;
    advanceRoom(run, { kind: 'glyph', current: 'ember' });
    expect(run.biome).toBe(1);
    expect(run.room).toBe(0);
    expect(run.cleared).toBe(false);
    expect(run.doors).toBeNull();
  });

  it('glyph offers match the current, replace occupied slots and level up owned glyphs', () => {
    const p = newProfile();
    const run = newRun(p, 11);
    const rng = new Rng(11);
    const offers = offerGlyphs(run, p, 'frost', rng);
    expect(offers).toHaveLength(3);
    for (const o of offers) expect(getGlyph(o.id).current).toBe('frost');

    const first = offers[0];
    takeGlyph(run, first);
    expect(run.glyphs).toHaveLength(1);

    // Offer again many times: an owned glyph comes back as an upgrade, never a duplicate.
    let sawUpgrade = false;
    for (let i = 0; i < 40; i++) {
      for (const o of offerGlyphs(run, p, 'frost', rng)) {
        if (o.id === first.id) {
          expect(o.level).toBe(2);
          sawUpgrade = true;
        }
        if (o.replaces) expect(getGlyph(o.replaces).slot).toBe(getGlyph(o.id).slot);
      }
    }
    expect(sawUpgrade).toBe(true);

    takeGlyph(run, { ...first, level: 99 });
    expect(run.glyphs.find((g) => g.id === first.id)!.level).toBe(MAX_GLYPH_LEVEL);
  });

  it('confluences only appear once both currents are in the build', () => {
    const p = newProfile();
    const confluence = GLYPHS.find((g) => g.legendary && g.current === 'ember' && g.secondary === 'frost');
    expect(confluence).toBeDefined();
    const run = newRun(p, 2);
    const rng = new Rng(2);
    const seen = (): boolean => {
      for (let i = 0; i < 60; i++) if (offerGlyphs(run, p, 'ember', rng).some((o) => o.id === confluence!.id)) return true;
      return false;
    };
    expect(seen()).toBe(false);
    const frostGlyph = GLYPHS.find((g) => !g.legendary && g.current === 'frost')!;
    takeGlyph(run, { id: frostGlyph.id, rarity: 'common', level: 1 });
    expect(seen()).toBe(true);
  });

  it('glyph power scales with rarity and level', () => {
    expect(glyphPower('rare', 1)).toBeGreaterThan(glyphPower('common', 1));
    expect(glyphPower('common', 3)).toBeCloseTo(glyphPower('common', 1) * 2);
  });

  it('shop items cost pearls and sell once', () => {
    const p = newProfile();
    const run = newRun(p, 4);
    run.shop = generateShop(run, p, new Rng(4));
    expect(buyShopItem(run, 2)).toBeNull();
    run.pearls = 1000;
    const item = buyShopItem(run, 2);
    expect(item?.kind).toBe('heart');
    expect(run.pearls).toBe(1000 - item!.price);
    expect(buyShopItem(run, 2)).toBeNull();
  });
});

describe('saves', () => {
  it('round-trips through storage', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const data = loadSave(store);
    data.profile.embers = 77;
    data.settings.leftHanded = true;
    data.run = newRun(data.profile, 99);
    data.run.glyphs.push({ id: GLYPHS[0].id, rarity: 'epic', level: 2 });
    expect(writeSave(data, store)).toBe(true);
    expect(mem.has(SAVE_KEY)).toBe(true);

    const back = loadSave(store);
    expect(back.profile.embers).toBe(77);
    expect(back.settings.leftHanded).toBe(true);
    expect(back.run?.seed).toBe(99);
    expect(back.run?.glyphs).toEqual(data.run.glyphs);
  });

  it('recovers from corrupt JSON and broken storage', () => {
    expect(parseSave('{not json').profile.embers).toBe(0);
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadSave(broken).run).toBeNull();
    expect(writeSave(parseSave(null), broken)).toBe(false);
  });

  it('rejects unrecoverable runs and filters unknown glyphs', () => {
    expect(sanitizeRun({ version: 2 })).toBeNull();
    expect(sanitizeRun({ ...newRun(newProfile(), 1), biome: 17 })).toBeNull();
    const run = sanitizeRun({ ...newRun(newProfile(), 1), glyphs: [{ id: 'gone', rarity: 'rare', level: 1 }] });
    expect(run?.glyphs).toEqual([]);
  });

  it('clamps settings', () => {
    const s = sanitizeSettings({ sfx: 5, controlScale: 0.1, haptics: 'yes' });
    expect(s.sfx).toBe(1);
    expect(s.controlScale).toBe(0.75);
    expect(s.haptics).toBe(defaultSettings().haptics);
  });
});
