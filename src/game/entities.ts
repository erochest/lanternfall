import type { Rect, Shape } from '../core/math';
import type { BossDef, EnemyDef } from '../data/enemies';
import type { AttackStep, SpecialDef } from '../data/gear';
import type { ActionSlot } from './mods';
import type { Reward } from './run';

/** Per-frame intent from whatever input device is active. */
export interface Controls {
  moveX: number;
  moveY: number;
  /** Explicit aim (mouse, right stick, or a drag-aimed touch button). */
  aimX: number;
  aimY: number;
  aimActive: boolean;
  attack: boolean;
  attackPressed: boolean;
  specialPressed: boolean;
  dashPressed: boolean;
  flarePressed: boolean;
}

export const emptyControls = (): Controls => ({
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
  aimActive: false,
  attack: false,
  attackPressed: false,
  specialPressed: false,
  dashPressed: false,
  flarePressed: false,
});

export interface PlayerAction {
  kind: 'attack' | 'special';
  step: AttackStep | null;
  special: SpecialDef | null;
  t: number;
  windup: number;
  active: number;
  recovery: number;
  dir: number;
  fired: boolean;
  dashAttack: boolean;
  moveMult: number;
}

export interface Player {
  x: number;
  y: number;
  r: number;
  /** Impulse velocity (lunges, knockback) that decays quickly. */
  vx: number;
  vy: number;
  facing: number;
  moving: boolean;
  hp: number;
  maxHp: number;
  iframes: number;
  flash: number;
  dashCharges: number;
  dashRechargeT: number;
  dashing: number;
  dashDir: number;
  dashTrailX: number;
  dashTrailY: number;
  dashHit: Set<number>;
  postDash: number;
  action: PlayerAction | null;
  combo: number;
  comboT: number;
  attackBuffer: number;
  specialBuffer: number;
  dashBuffer: number;
  flareBuffer: number;
  specialCd: number;
  specialCdMax: number;
  flareCharges: number;
  flareT: number;
  shadeT: number;
  down: boolean;
  walk: number;
  shield: number;
}

export interface Enemy {
  id: number;
  def: EnemyDef | null;
  boss: BossDef | null;
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  mx: number;
  my: number;
  facing: number;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  dmg: number;
  speed: number;
  ai: Generator<number, void, void> | null;
  wait: number;
  hitstun: number;
  stun: number;
  freeze: number;
  burn: number;
  burnT: number;
  burnTick: number;
  chill: number;
  chillT: number;
  flash: number;
  dead: boolean;
  spawnT: number;
  invuln: boolean;
  alpha: number;
  elite: boolean;
  minion: boolean;
  owner: Enemy | null;
  /** Swarmers deal damage on touch. */
  contact: boolean;
  contactCd: number;
  charging: { angle: number; t: number; speed: number; hit: boolean } | null;
  /** Visual 0..1 wind-up glow. */
  windup: number;
  windupMax: number;
  anim: number;
  thermalCd: number;
  slamCd: number;
  phase: number;
  /** Scratch value for AI (e.g. strafe direction). */
  memo: number;
}

export type HazardVisual = 'warn' | 'slash' | 'fire' | 'frost' | 'storm' | 'shock' | 'tide' | 'gloom' | 'light' | 'none';

export interface Hazard {
  id: number;
  shape: Shape;
  team: 'enemy' | 'player';
  /** Seconds before it becomes dangerous. */
  delay: number;
  t: number;
  dmg: number;
  /** After triggering, stays active this long (0 = single frame). */
  duration: number;
  /** For zones: re-hit interval; otherwise each target is hit once. */
  tickEvery: number;
  tickT: number;
  hitIds: Set<number>;
  owner: Enemy | null;
  cancelOnStun: boolean;
  followPlayer: boolean;
  followOwner: boolean;
  /** Ring growth rate (units/s). */
  grow: number;
  maxR: number;
  slot: ActionSlot | null;
  knock: number;
  burn: number;
  chill: number;
  forceCrit: boolean;
  visual: HazardVisual;
  color: string;
  triggered: boolean;
  done: boolean;
  /** Telegraph only: draws but never deals damage. */
  harmless: boolean;
  onTrigger: (() => void) | null;
  onUpdate: ((dt: number) => void) | null;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  team: 'enemy' | 'player';
  dmg: number;
  life: number;
  pierce: number;
  hitIds: Set<number>;
  color: string;
  slot: ActionSlot | null;
  knock: number;
  kind: 'orb' | 'bolt' | 'harpoon' | 'wave';
  returning: boolean;
  dead: boolean;
  /** Passes through obstacles. */
  ghost: boolean;
  forceCrit: boolean;
}

export interface Lob {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  color: string;
  onLand: () => void;
}

export type PickupKind = 'pearl' | 'heal' | 'ember' | 'starglass' | 'reward';

export interface Pickup {
  id: number;
  x: number;
  y: number;
  kind: PickupKind;
  value: number;
  reward: Reward | null;
  t: number;
  dead: boolean;
}

export interface Door {
  x: number;
  y: number;
  reward: Reward;
  open: boolean;
}

export type Obstacle = { kind: 'rect'; rect: Rect } | { kind: 'circle'; x: number; y: number; r: number };

export interface SpawnMarker {
  x: number;
  y: number;
  t: number;
  dur: number;
  enemyId: string;
  elite: boolean;
  minion: boolean;
  owner: Enemy | null;
}

// --------------------------------------------------------------- visual fx

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  additive: boolean;
  drag: number;
  kind: 'dot' | 'spark' | 'ring' | 'shard';
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  size: number;
  vy: number;
}

export interface SlashFx {
  x: number;
  y: number;
  r: number;
  angle: number;
  spread: number;
  life: number;
  max: number;
  color: string;
  kind: 'arc' | 'thrust' | 'ring' | 'cone';
  width: number;
  followPlayer: boolean;
}

export interface BoltFx {
  pts: { x: number; y: number }[];
  life: number;
  max: number;
  color: string;
}

export type GameEvent =
  | { type: 'sfx'; name: string; vol?: number }
  | { type: 'shake'; amount: number }
  | { type: 'haptic'; ms: number; strength: number }
  | { type: 'roomCleared' }
  | { type: 'reward'; reward: Reward }
  | { type: 'pickup'; kind: PickupKind; value: number }
  | { type: 'door'; index: number }
  | { type: 'shop' }
  | { type: 'playerDown' }
  | { type: 'bossDefeated'; bossId: string }
  | { type: 'bossPhase' }
  | { type: 'kill'; elite: boolean; boss: boolean };
