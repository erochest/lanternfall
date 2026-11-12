export interface BiomeDef {
  id: string;
  name: string;
  subtitle: string;
  floor: string;
  floorAlt: string;
  wall: string;
  wallTop: string;
  pillar: string;
  accent: string;
  /** Ambient darkness strength 0..1. */
  dark: number;
  ambient: { base: number; type: OscillatorType };
  enemies: string[];
  boss: string;
  hpScale: number;
  dmgScale: number;
  arena: { w: number; h: number };
}

/** Rooms before the guardian in each biome. Room index ROOMS_PER_BIOME is the boss. */
export const ROOMS_PER_BIOME = 5;
/** Index within a biome where a shop door is always offered. */
export const SHOP_ROOM = 3;

export const BIOMES: readonly BiomeDef[] = [
  {
    id: 'shallows',
    name: 'The Shallows',
    subtitle: 'Where the tide first pulls you under',
    floor: '#1c3a3f',
    floorAlt: '#21454a',
    wall: '#0d1f23',
    wallTop: '#2f5d5f',
    pillar: '#3b6b6a',
    accent: '#7fe8d0',
    dark: 0.5,
    ambient: { base: 55, type: 'sine' },
    enemies: ['scuttler', 'spitter', 'jelly', 'shellback'],
    boss: 'matriarch',
    hpScale: 1,
    dmgScale: 1,
    arena: { w: 900, h: 640 },
  },
  {
    id: 'archive',
    name: 'The Sunken Archive',
    subtitle: 'Drowned libraries of a forgotten age',
    floor: '#1d1d3d',
    floorAlt: '#25244a',
    wall: '#0c0b1f',
    wallTop: '#3d3a6b',
    pillar: '#4a4580',
    accent: '#f2d17a',
    dark: 0.58,
    ambient: { base: 49, type: 'triangle' },
    enemies: ['inkwisp', 'tomeguard', 'moth', 'sentry', 'scribe'],
    boss: 'archivist',
    hpScale: 1.25,
    dmgScale: 1.15,
    arena: { w: 960, h: 680 },
  },
  {
    id: 'furnace',
    name: 'The Coral Furnace',
    subtitle: 'Volcanic reefs that never cool',
    floor: '#3a1a1a',
    floorAlt: '#45201d',
    wall: '#1a0a0a',
    wallTop: '#6b2e24',
    pillar: '#7a3a2a',
    accent: '#ffb347',
    dark: 0.52,
    ambient: { base: 44, type: 'sawtooth' },
    enemies: ['cinderpuff', 'lancer', 'magmaspit', 'priest'],
    boss: 'kiln',
    hpScale: 1.55,
    dmgScale: 1.3,
    arena: { w: 980, h: 700 },
  },
  {
    id: 'maw',
    name: 'The Maw',
    subtitle: 'The lightless throat of the deep',
    floor: '#17112a',
    floorAlt: '#1e1636',
    wall: '#07040f',
    wallTop: '#3a2563',
    pillar: '#4b2e7a',
    accent: '#d9a6ff',
    dark: 0.66,
    ambient: { base: 37, type: 'sine' },
    enemies: ['eye', 'hound', 'voidwisp', 'leech', 'deeplancer'],
    boss: 'maw',
    hpScale: 1.9,
    dmgScale: 1.45,
    arena: { w: 1000, h: 720 },
  },
];
