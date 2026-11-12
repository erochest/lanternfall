import { BIOMES, type BiomeDef } from '../data/biomes';
import { ENEMIES, getEnemy } from '../data/enemies';
import type { Rng } from '../core/rng';
import type { Obstacle } from './entities';

export interface WaveSpawn {
  enemyId: string;
  elite: boolean;
}

export interface RoomPlan {
  w: number;
  h: number;
  layout: string;
  obstacles: Obstacle[];
  waves: WaveSpawn[][];
}

export const LAYOUTS = ['open', 'pillars', 'blocks', 'center', 'scatter', 'cross'] as const;
export type Layout = (typeof LAYOUTS)[number];

/** Difficulty scaling from the selected Tide level. */
export function tideScaling(tide: number): { hp: number; dmg: number; elite: number; speed: number } {
  return { hp: 1 + 0.15 * tide, dmg: 1 + 0.1 * tide, elite: 0.04 * tide, speed: 1 + 0.02 * tide };
}

export function buildLayout(layout: Layout, w: number, h: number, rng: Rng): Obstacle[] {
  const cx = w / 2;
  const cy = h / 2;
  const out: Obstacle[] = [];
  const circle = (x: number, y: number, r: number): void => {
    out.push({ kind: 'circle', x, y, r });
  };
  const rect = (x: number, y: number, rw: number, rh: number): void => {
    out.push({ kind: 'rect', rect: { x: x - rw / 2, y: y - rh / 2, w: rw, h: rh } });
  };
  switch (layout) {
    case 'open':
      break;
    case 'pillars': {
      const ox = w * 0.24;
      const oy = h * 0.2;
      const r = rng.range(24, 32);
      circle(cx - ox, cy - oy, r);
      circle(cx + ox, cy - oy, r);
      circle(cx - ox, cy + oy, r);
      circle(cx + ox, cy + oy, r);
      break;
    }
    case 'blocks': {
      const bw = rng.range(60, 90);
      const bh = rng.range(110, 160);
      rect(cx - w * 0.27, cy, bw, bh);
      rect(cx + w * 0.27, cy, bw, bh);
      break;
    }
    case 'center':
      circle(cx, cy - 10, rng.range(52, 66));
      break;
    case 'scatter': {
      const pairs = rng.int(2, 3);
      for (let i = 0; i < pairs; i++) {
        const x = rng.range(w * 0.12, w * 0.38);
        const y = rng.range(h * 0.2, h * 0.7);
        const r = rng.range(16, 26);
        circle(x, y, r);
        circle(w - x, y, r);
      }
      break;
    }
    case 'cross': {
      const s = rng.range(50, 70);
      rect(cx - 120, cy - 70, s, s);
      rect(cx + 120, cy - 70, s, s);
      rect(cx - 120, cy + 70, s, s);
      rect(cx + 120, cy + 70, s, s);
      break;
    }
  }
  return out;
}

export function planWaves(biome: BiomeDef, biomeIndex: number, roomIndex: number, tide: number, rng: Rng): WaveSpawn[][] {
  const scaling = tideScaling(tide);
  const budget = 7 + roomIndex * 2.4 + biomeIndex * 1.2 + tide * 0.6;
  const waveCount = roomIndex < 1 ? 2 : 3;
  const eliteChance = 0.04 + roomIndex * 0.04 + scaling.elite;
  const pool = biome.enemies
    .map(getEnemy)
    .filter((e) => !e.summonOnly && (e.minRoom ?? 0) <= roomIndex);

  const waves: WaveSpawn[][] = [];
  for (let wv = 0; wv < waveCount; wv++) {
    let remaining = (budget / waveCount) * (1 + 0.2 * wv);
    const wave: WaveSpawn[] = [];
    let guard = 0;
    while (remaining > 0.5 && wave.length < 9 && guard++ < 40) {
      const affordable = pool.filter((e) => e.cost * (e.group ?? 1) <= remaining + 1);
      if (affordable.length === 0) break;
      const def = rng.pick(affordable);
      const group = def.group ?? 1;
      for (let i = 0; i < group && wave.length < 9; i++) {
        const elite = def.cost >= 2 && rng.chance(eliteChance);
        wave.push({ enemyId: def.id, elite });
      }
      remaining -= def.cost * group;
    }
    if (wave.length === 0) wave.push({ enemyId: pool[0].id, elite: false });
    waves.push(wave);
  }
  return waves;
}

export function planRoom(
  biomeIndex: number,
  roomIndex: number,
  tide: number,
  kind: 'combat' | 'boss' | 'shop',
  rng: Rng,
): RoomPlan {
  const biome = BIOMES[biomeIndex];
  const w = biome.arena.w + rng.int(-2, 2) * 20;
  const h = biome.arena.h + rng.int(-2, 2) * 16;
  let layout: Layout;
  if (kind === 'shop') layout = 'open';
  else if (kind === 'boss') layout = biome.boss === 'kiln' || biome.boss === 'archivist' ? 'open' : 'pillars';
  else layout = roomIndex === 0 && biomeIndex === 0 ? 'open' : rng.pick(LAYOUTS);
  const bw = kind === 'boss' ? biome.arena.w + 120 : w;
  const bh = kind === 'boss' ? biome.arena.h + 80 : h;
  return {
    w: bw,
    h: bh,
    layout,
    obstacles: buildLayout(layout, bw, bh, rng),
    waves: kind === 'combat' ? planWaves(biome, biomeIndex, roomIndex, tide, rng) : [],
  };
}

/** Sanity helper used by tests: every enemy referenced by a biome exists. */
export function allBiomeEnemiesExist(): boolean {
  const ids = new Set(ENEMIES.map((e) => e.id));
  return BIOMES.every((b) => b.enemies.every((id) => ids.has(id)));
}
