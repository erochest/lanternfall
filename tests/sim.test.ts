import { describe, expect, it } from 'vitest';
import { BIOMES } from '../src/data/biomes';
import { GLYPHS, getGlyph } from '../src/data/glyphs';
import { WEAPONS } from '../src/data/gear';
import { createMods } from '../src/game/mods';
import { emptyControls } from '../src/game/entities';
import { FIXED_DT } from '../src/game/world';
import { makeWorld, simulate } from './helpers';

const GOD = { maxHp: 99999 };

describe('headless combat simulation', () => {
  it.each(WEAPONS.map((w) => w.id))('a bot can clear a Shallows room with the %s', (weapon) => {
    const { world } = makeWorld({ weapon, seed: 7, stats: GOD });
    world.player.hp = 99999;
    simulate(world, 120, (w) => w.state === 'reward' || w.state === 'exit');
    expect(world.kills).toBeGreaterThan(0);
    expect(['reward', 'exit']).toContain(world.state);
  });

  it.each(BIOMES.map((b, i) => [b.name, i] as const))('every biome room is clearable: %s', (_name, biome) => {
    const { world } = makeWorld({ biome, room: 3, seed: 99 + biome, stats: { ...GOD, damageMult: 2 } });
    world.player.hp = 99999;
    simulate(world, 180, (w) => w.state === 'reward' || w.state === 'exit');
    expect(['reward', 'exit']).toContain(world.state);
  });

  it.each(BIOMES.map((b, i) => [b.boss, i] as const))('boss %s can be defeated and drops a reward', (bossId, biome) => {
    const { world } = makeWorld({ biome, room: 5, kind: 'boss', seed: 5, stats: { ...GOD, damageMult: 4 }, reward: { kind: 'boss' }, doors: [] });
    world.player.hp = 99999;
    let defeated = '';
    let phases = 0;
    simulate(
      world,
      240,
      (w) => w.state === 'reward',
      (w) => {
        for (const e of w.events) {
          if (e.type === 'bossDefeated') defeated = e.bossId;
          if (e.type === 'bossPhase') phases++;
        }
      },
    );
    expect(defeated).toBe(bossId);
    expect(phases).toBeGreaterThan(0);
    expect(world.state).toBe('reward');
    expect(world.pickups.some((p) => p.kind === 'reward')).toBe(true);
  });

  it('runs with every glyph active at once without throwing', () => {
    const mods = createMods();
    for (const g of GLYPHS) getGlyph(g.id).apply(mods, 1.4);
    for (const weapon of WEAPONS) {
      const { world } = makeWorld({ weapon: weapon.id, biome: 2, room: 2, seed: 3, mods, stats: GOD });
      world.player.hp = 99999;
      simulate(world, 60, (w) => w.state === 'reward');
      expect(world.kills).toBeGreaterThan(0);
    }
  });

  it('an idle player eventually takes damage and goes down', () => {
    const { world } = makeWorld({ biome: 1, room: 4, seed: 11 });
    let down = false;
    for (let t = 0; t < 120 && !down; t += FIXED_DT) {
      world.step(FIXED_DT, emptyControls());
      down = world.events.some((e) => e.type === 'playerDown');
      world.events.length = 0;
    }
    expect(down).toBe(true);
    expect(world.player.hp).toBe(0);
  });

  it('walking into an open door emits a door event', () => {
    const { world } = makeWorld({ kind: 'shop', reward: { kind: 'shop' } });
    expect(world.state).toBe('exit');
    let door = -1;
    for (let t = 0; t < 10 && door < 0; t += FIXED_DT) {
      const c = emptyControls();
      const d = world.doors[0];
      const dx = d.x - world.player.x;
      const dy = d.y - world.player.y;
      const l = Math.hypot(dx, dy) || 1;
      c.moveX = dx / l;
      c.moveY = dy / l;
      world.step(FIXED_DT, c);
      for (const e of world.events) if (e.type === 'door') door = e.index;
      world.events.length = 0;
    }
    expect(door).toBe(0);
  });
});
