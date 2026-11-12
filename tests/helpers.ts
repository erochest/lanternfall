import { Rng } from '../src/core/rng';
import { emptyControls, type Controls } from '../src/game/entities';
import { createMods, type Mods } from '../src/game/mods';
import { newProfile, type Profile } from '../src/game/profile';
import { planRoom } from '../src/game/room';
import { computeMods, newRun, type Reward, type RunState } from '../src/game/run';
import { computeStats, type PlayerStats } from '../src/game/stats';
import { FIXED_DT, World } from '../src/game/world';

export interface MakeWorldOpts {
  biome?: number;
  room?: number;
  kind?: 'combat' | 'boss' | 'shop';
  weapon?: string;
  seed?: number;
  tide?: number;
  mods?: Mods;
  stats?: Partial<PlayerStats>;
  reward?: Reward;
  doors?: Reward[];
}

export function makeWorld(o: MakeWorldOpts = {}): { world: World; run: RunState; profile: Profile } {
  const profile = newProfile();
  const weapon = o.weapon ?? 'cutlass';
  profile.weapons[weapon] = 1;
  profile.equipped.weapon = weapon;
  const run = newRun(profile, o.seed ?? 1234);
  run.biome = o.biome ?? 0;
  run.room = o.room ?? 0;
  const mods = o.mods ?? computeMods(run);
  const stats = { ...computeStats(profile, run, mods), ...(o.stats ?? {}) };
  const rng = new Rng(o.seed ?? 1234);
  const kind = o.kind ?? 'combat';
  const plan = planRoom(run.biome, run.room, o.tide ?? 0, kind, rng);
  const world = new World({
    biomeIndex: run.biome,
    roomIndex: run.room,
    tide: o.tide ?? 0,
    kind,
    plan,
    stats,
    mods,
    weaponId: weapon,
    reward: o.reward ?? { kind: 'pearls' },
    doors: o.doors ?? [{ kind: 'glyph', current: 'ember' }, { kind: 'pearls' }],
    playerHp: stats.maxHp,
    aimAssist: 1,
    seed: o.seed ?? 1234,
  });
  return { world, run, profile };
}

/** A simple bot: chase the nearest enemy, attack, use specials, dodge occasionally. */
export function botControls(w: World, t: number): Controls {
  const c = emptyControls();
  const p = w.player;
  const target = w.nearestEnemy(p.x, p.y, 9999);
  if (target) {
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 70) {
      c.moveX = dx / d;
      c.moveY = dy / d;
    } else {
      // strafe
      c.moveX = -dy / d;
      c.moveY = dx / d;
    }
    c.attack = true;
    c.attackPressed = Math.floor(t * 10) % 2 === 0;
    c.specialPressed = Math.floor(t * 2) % 5 === 0;
    c.flarePressed = Math.floor(t * 3) % 11 === 0;
    c.dashPressed = Math.floor(t * 4) % 13 === 0;
  } else {
    // Head to reward / doors.
    const orb = w.pickups.find((k) => k.kind === 'reward');
    const goal = orb ? orb : w.doors.find((d) => d.open) ?? null;
    if (goal) {
      const dx = goal.x - p.x;
      const dy = goal.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      c.moveX = dx / d;
      c.moveY = dy / d;
    }
  }
  return c;
}

/** Step the world with the bot until `until` returns true or time runs out. */
export function simulate(w: World, seconds: number, until?: (w: World) => boolean, onEvents?: (w: World) => void): number {
  let t = 0;
  while (t < seconds) {
    w.step(FIXED_DT, botControls(w, t));
    if (onEvents) onEvents(w);
    w.events.length = 0;
    t += FIXED_DT;
    if (until && until(w)) break;
  }
  return t;
}

export { createMods };
