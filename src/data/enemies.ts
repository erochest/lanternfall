export type AIKind =
  | 'chaser'
  | 'charger'
  | 'shooter'
  | 'bomber'
  | 'teleporter'
  | 'summoner'
  | 'swarmer'
  | 'turret';

export type BodyShape =
  | 'crab'
  | 'jelly'
  | 'spitter'
  | 'wisp'
  | 'tome'
  | 'moth'
  | 'sentry'
  | 'puff'
  | 'lancer'
  | 'priest'
  | 'eye'
  | 'hound'
  | 'leech'
  | 'boss';

export interface ProjectileSpec {
  speed: number;
  count: number;
  /** Total spread in radians for fan patterns. */
  spread: number;
  r: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  ai: AIKind;
  shape: BodyShape;
  color: string;
  accent: string;
  hp: number;
  armor?: number;
  r: number;
  speed: number;
  dmg: number;
  /** Spawn budget cost. */
  cost: number;
  /** Attack range or preferred distance. */
  range: number;
  windup: number;
  cooldown: number;
  proj?: ProjectileSpec;
  pattern?: 'aimed' | 'spiral' | 'ring';
  summon?: string;
  /** Spawn this many at once. */
  group?: number;
  /** Earliest room index (within a biome) this can appear. */
  minRoom?: number;
  /** Not chosen for normal waves (summons only). */
  summonOnly?: boolean;
}

export const ENEMIES: readonly EnemyDef[] = [
  // ------------------------------------------------------------ Shallows
  {
    id: 'scuttler', name: 'Scuttler', ai: 'chaser', shape: 'crab', color: '#e0735a', accent: '#ffd0a8',
    hp: 34, r: 15, speed: 118, dmg: 8, cost: 2, range: 46, windup: 0.5, cooldown: 0.7,
  },
  {
    id: 'spitter', name: 'Brine Spitter', ai: 'shooter', shape: 'spitter', color: '#58c7a0', accent: '#e6fff3',
    hp: 28, r: 14, speed: 80, dmg: 7, cost: 2, range: 250, windup: 0.55, cooldown: 2.3,
    proj: { speed: 230, count: 1, spread: 0, r: 7 }, pattern: 'aimed',
  },
  {
    id: 'jelly', name: 'Driftjelly', ai: 'swarmer', shape: 'jelly', color: '#c48cff', accent: '#ffe0ff',
    hp: 16, r: 11, speed: 70, dmg: 6, cost: 1, range: 0, windup: 0, cooldown: 0.9, group: 3,
  },
  {
    id: 'shellback', name: 'Shellback', ai: 'charger', shape: 'crab', color: '#b5603f', accent: '#ffcc8a',
    hp: 60, armor: 30, r: 21, speed: 90, dmg: 12, cost: 5, range: 280, windup: 0.7, cooldown: 1.0, minRoom: 1,
  },

  // ------------------------------------------------------------ Archive
  {
    id: 'inkwisp', name: 'Inkwisp', ai: 'teleporter', shape: 'wisp', color: '#5468ff', accent: '#cfd6ff',
    hp: 44, r: 14, speed: 0, dmg: 9, cost: 3, range: 200, windup: 0.55, cooldown: 1.2,
    proj: { speed: 240, count: 3, spread: 0.5, r: 7 }, pattern: 'aimed',
  },
  {
    id: 'tomeguard', name: 'Tomeguard', ai: 'charger', shape: 'tome', color: '#c99a43', accent: '#fff2c4',
    hp: 80, armor: 40, r: 20, speed: 95, dmg: 13, cost: 5, range: 300, windup: 0.65, cooldown: 1.0,
  },
  {
    id: 'moth', name: 'Lantern Moth', ai: 'swarmer', shape: 'moth', color: '#f2d17a', accent: '#fffbe6',
    hp: 16, r: 10, speed: 170, dmg: 6, cost: 1, range: 0, windup: 0, cooldown: 1.0, group: 4,
  },
  {
    id: 'sentry', name: 'Glyph Sentry', ai: 'turret', shape: 'sentry', color: '#7a5cff', accent: '#e4dcff',
    hp: 70, r: 18, speed: 0, dmg: 8, cost: 4, range: 0, windup: 0.6, cooldown: 1.6,
    proj: { speed: 190, count: 1, spread: 0, r: 7 }, pattern: 'spiral', minRoom: 1,
  },
  {
    id: 'scribe', name: 'Inkscuttler', ai: 'chaser', shape: 'crab', color: '#4a5bd8', accent: '#cfd6ff',
    hp: 48, r: 15, speed: 135, dmg: 10, cost: 2, range: 48, windup: 0.45, cooldown: 0.6,
  },

  // ------------------------------------------------------------ Furnace
  {
    id: 'cinderpuff', name: 'Cinderpuff', ai: 'bomber', shape: 'puff', color: '#ff6a2a', accent: '#ffe27a',
    hp: 30, r: 13, speed: 160, dmg: 18, cost: 2, range: 58, windup: 0.75, cooldown: 0,
  },
  {
    id: 'lancer', name: 'Coral Lancer', ai: 'charger', shape: 'lancer', color: '#ff5470', accent: '#ffd1d9',
    hp: 76, r: 17, speed: 120, dmg: 15, cost: 4, range: 320, windup: 0.55, cooldown: 0.8,
  },
  {
    id: 'magmaspit', name: 'Magma Spitter', ai: 'shooter', shape: 'spitter', color: '#e8452c', accent: '#ffc27a',
    hp: 58, r: 16, speed: 85, dmg: 10, cost: 3, range: 270, windup: 0.6, cooldown: 2.4,
    proj: { speed: 220, count: 5, spread: 0.9, r: 7 }, pattern: 'aimed',
  },
  {
    id: 'priest', name: 'Kiln Priest', ai: 'summoner', shape: 'priest', color: '#ffb347', accent: '#fff0c2',
    hp: 80, r: 17, speed: 90, dmg: 0, cost: 5, range: 320, windup: 0.9, cooldown: 4.5, summon: 'cinderpuff', minRoom: 1,
  },

  // ------------------------------------------------------------ Maw
  {
    id: 'eye', name: 'Abyssal Eye', ai: 'turret', shape: 'eye', color: '#d04cff', accent: '#ffe6ff',
    hp: 120, armor: 40, r: 22, speed: 0, dmg: 12, cost: 5, range: 0, windup: 0.7, cooldown: 2.4,
    proj: { speed: 200, count: 14, spread: 0, r: 8 }, pattern: 'ring',
  },
  {
    id: 'hound', name: 'Maw Hound', ai: 'chaser', shape: 'hound', color: '#7c3cff', accent: '#e8d9ff',
    hp: 92, r: 17, speed: 165, dmg: 15, cost: 3, range: 52, windup: 0.4, cooldown: 0.55,
  },
  {
    id: 'voidwisp', name: 'Void Wisp', ai: 'teleporter', shape: 'wisp', color: '#a23cff', accent: '#f1d9ff',
    hp: 78, r: 15, speed: 0, dmg: 13, cost: 4, range: 220, windup: 0.5, cooldown: 1.0,
    proj: { speed: 260, count: 8, spread: 0, r: 7 }, pattern: 'ring',
  },
  {
    id: 'leech', name: 'Deep Leech', ai: 'swarmer', shape: 'leech', color: '#ff4f9a', accent: '#ffd6e8',
    hp: 34, r: 11, speed: 150, dmg: 10, cost: 1, range: 0, windup: 0, cooldown: 0.8, group: 3,
  },
  {
    id: 'deeplancer', name: 'Deep Lancer', ai: 'charger', shape: 'lancer', color: '#5f3cff', accent: '#dcd4ff',
    hp: 130, armor: 60, r: 19, speed: 125, dmg: 20, cost: 6, range: 340, windup: 0.5, cooldown: 0.7, minRoom: 1,
  },
];

const BY_ID = new Map(ENEMIES.map((e) => [e.id, e]));
export function getEnemy(id: string): EnemyDef {
  const e = BY_ID.get(id);
  if (!e) throw new Error(`Unknown enemy: ${id}`);
  return e;
}

// ---------------------------------------------------------------- Bosses

export interface BossDef {
  id: string;
  name: string;
  title: string;
  hp: number;
  r: number;
  color: string;
  accent: string;
  dmg: number;
  speed: number;
  /** HP fractions at which the boss enters its next phase. */
  phases: number[];
}

export const BOSSES: readonly BossDef[] = [
  { id: 'matriarch', name: 'The Brine Matriarch', title: 'Guardian of the Shallows', hp: 1100, r: 46, color: '#d2553d', accent: '#ffd0a8', dmg: 14, speed: 120, phases: [0.5] },
  { id: 'archivist', name: 'The Drowned Archivist', title: 'Keeper of Sunken Words', hp: 1500, r: 34, color: '#5468ff', accent: '#f2e6b8', dmg: 16, speed: 0, phases: [0.5] },
  { id: 'kiln', name: 'The Kiln Heart', title: 'Furnace Beneath the Sea', hp: 2000, r: 56, color: '#ff6a2a', accent: '#ffe27a', dmg: 18, speed: 0, phases: [0.6, 0.3] },
  { id: 'maw', name: 'The Maw', title: 'That Which Swallows Light', hp: 2800, r: 60, color: '#8a3cff', accent: '#ffd6ff', dmg: 20, speed: 140, phases: [0.6, 0.25] },
];

export function getBoss(id: string): BossDef {
  const b = BOSSES.find((x) => x.id === id);
  if (!b) throw new Error(`Unknown boss: ${id}`);
  return b;
}
