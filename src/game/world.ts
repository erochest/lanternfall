import { Rng } from '../core/rng';
import {
  TAU,
  circleIntersectsRect,
  clamp,
  dist,
  len,
  pushCircleOutOfRect,
  shapeHitsCircle,
  type Shape,
  type Vec,
} from '../core/math';
import { BIOMES, type BiomeDef } from '../data/biomes';
import { getBoss, getEnemy } from '../data/enemies';
import { getWeapon, type WeaponDef } from '../data/gear';
import { createBossAI } from './bossAI';
import { createAI } from './ai';
import { chainLightning, damagePlayer, hitEnemy, killEnemy, updateStatus } from './combat';
import {
  emptyControls,
  type BoltFx,
  type Controls,
  type Door,
  type Enemy,
  type FloatText,
  type GameEvent,
  type Hazard,
  type Lob,
  type Obstacle,
  type Particle,
  type Pickup,
  type PickupKind,
  type Player,
  type Projectile,
  type SlashFx,
  type SpawnMarker,
} from './entities';
import type { Mods } from './mods';
import { updatePlayer } from './player';
import { tideScaling, type RoomPlan } from './room';
import type { Reward } from './run';
import type { PlayerStats } from './stats';

export interface WorldConfig {
  biomeIndex: number;
  roomIndex: number;
  tide: number;
  kind: 'combat' | 'boss' | 'shop';
  plan: RoomPlan;
  stats: PlayerStats;
  mods: Mods;
  weaponId: string;
  reward: Reward;
  doors: Reward[];
  playerHp: number;
  /** 0 = off, 1 = strong. */
  aimAssist: number;
  seed: number;
  maxParticles?: number;
  /** Resume an already-cleared room: no enemies, exits open. */
  cleared?: boolean;
}

export type RoomState = 'intro' | 'fight' | 'cleared' | 'reward' | 'exit' | 'leaving';

export const FIXED_DT = 1 / 60;
export const ENEMY_PROJECTILE_COLOR = '#ff3d7f';

export class World {
  readonly cfg: WorldConfig;
  readonly rng: Rng;
  readonly biome: BiomeDef;
  readonly w: number;
  readonly h: number;
  readonly obstacles: Obstacle[];
  readonly stats: PlayerStats;
  readonly mods: Mods;
  readonly weapon: WeaponDef;
  readonly dt = FIXED_DT;
  readonly scaling: ReturnType<typeof tideScaling>;

  player: Player;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  hazards: Hazard[] = [];
  pickups: Pickup[] = [];
  lobs: Lob[] = [];
  doors: Door[] = [];
  spawnMarkers: SpawnMarker[] = [];
  altar: { x: number; y: number; armed: boolean } | null = null;
  boss: Enemy | null = null;

  particles: Particle[] = [];
  texts: FloatText[] = [];
  slashes: SlashFx[] = [];
  bolts: BoltFx[] = [];
  events: GameEvent[] = [];

  controls: Controls = emptyControls();
  state: RoomState = 'intro';
  stateT = 0;
  time = 0;
  waveIndex = -1;
  hitstop = 0;
  slowmo = 0;
  kills = 0;
  private nextId = 1;
  private scheduled: { t: number; fn: () => void }[] = [];
  private readonly maxParticles: number;

  constructor(cfg: WorldConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.biome = BIOMES[cfg.biomeIndex];
    this.w = cfg.plan.w;
    this.h = cfg.plan.h;
    this.obstacles = cfg.plan.obstacles;
    this.stats = cfg.stats;
    this.mods = cfg.mods;
    this.weapon = getWeapon(cfg.weaponId);
    this.scaling = tideScaling(cfg.tide);
    this.maxParticles = cfg.maxParticles ?? 600;

    const hp = cfg.playerHp > 0 ? Math.min(cfg.playerHp, cfg.stats.maxHp) : cfg.stats.maxHp;
    this.player = {
      x: this.w / 2,
      y: this.h - 60,
      r: 14,
      vx: 0,
      vy: 0,
      facing: -Math.PI / 2,
      moving: false,
      hp,
      maxHp: cfg.stats.maxHp,
      iframes: 1.0,
      flash: 0,
      dashCharges: cfg.stats.dashCharges,
      dashRechargeT: 0,
      dashing: 0,
      dashDir: 0,
      dashTrailX: 0,
      dashTrailY: 0,
      dashHit: new Set(),
      postDash: 0,
      action: null,
      combo: 0,
      comboT: 0,
      attackBuffer: 0,
      specialBuffer: 0,
      dashBuffer: 0,
      flareBuffer: 0,
      specialCd: 0,
      specialCdMax: this.weapon.special.cooldown * cfg.stats.specialCdMult,
      flareCharges: cfg.stats.flareCharges,
      flareT: 0,
      shadeT: 0,
      down: false,
      walk: 0,
      shield: (cfg.stats.aegis ? 1 : 0) + (cfg.mods.seaWall > 0 ? 1 : 0),
    };

    const n = cfg.doors.length;
    this.doors = cfg.doors.map((reward, i) => ({
      x: (this.w * (i + 1)) / (n + 1),
      y: 0,
      reward,
      open: false,
    }));

    if (cfg.kind === 'shop') {
      this.altar = { x: this.w / 2, y: this.h / 2 - 20, armed: true };
      this.state = 'exit';
      this.openDoors();
    } else if (cfg.cleared) {
      this.state = 'exit';
      this.openDoors();
    }
  }

  // ------------------------------------------------------------------ util

  id(): number {
    return this.nextId++;
  }

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  sfx(name: string, vol = 1): void {
    this.emit({ type: 'sfx', name, vol });
  }

  shake(amount: number): void {
    this.emit({ type: 'shake', amount });
  }

  schedule(delay: number, fn: () => void): void {
    this.scheduled.push({ t: delay, fn });
  }

  living(): Enemy[] {
    return this.enemies.filter((e) => !e.dead);
  }

  /** Enemies that can currently be hit/targeted. */
  targetable(): Enemy[] {
    return this.enemies.filter((e) => !e.dead && !e.invuln && e.spawnT <= 0);
  }

  nearestEnemy(x: number, y: number, maxDist: number, exclude?: Set<number>): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxDist * maxDist;
    for (const e of this.enemies) {
      if (e.dead || e.invuln || e.spawnT > 0 || exclude?.has(e.id)) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  // ------------------------------------------------------------- collision

  /** Keep a circle inside the arena and out of obstacles. Returns true if it hit something. */
  collide(p: Vec, r: number): boolean {
    let hit = false;
    const minX = r;
    const maxX = this.w - r;
    const minY = r;
    const maxY = this.h - r;
    if (p.x < minX) { p.x = minX; hit = true; }
    if (p.x > maxX) { p.x = maxX; hit = true; }
    if (p.y < minY) { p.y = minY; hit = true; }
    if (p.y > maxY) { p.y = maxY; hit = true; }
    for (const o of this.obstacles) {
      if (o.kind === 'rect') {
        const push = pushCircleOutOfRect(p, r, o.rect);
        if (push.x !== 0 || push.y !== 0) hit = true;
      } else {
        const dx = p.x - o.x;
        const dy = p.y - o.y;
        const d = Math.hypot(dx, dy);
        const min = o.r + r;
        if (d < min) {
          const nx = d > 1e-6 ? dx / d : 1;
          const ny = d > 1e-6 ? dy / d : 0;
          p.x = o.x + nx * min;
          p.y = o.y + ny * min;
          hit = true;
        }
      }
    }
    return hit;
  }

  blocked(x: number, y: number, r: number): boolean {
    if (x < r || y < r || x > this.w - r || y > this.h - r) return true;
    for (const o of this.obstacles) {
      if (o.kind === 'rect' ? circleIntersectsRect(x, y, r, o.rect) : Math.hypot(x - o.x, y - o.y) < o.r + r) return true;
    }
    return false;
  }

  /** A random open point at least `minFromPlayer` away from the player. */
  randomOpenPoint(r: number, minFromPlayer: number, near?: Vec, nearR?: number): Vec {
    for (let i = 0; i < 60; i++) {
      let x: number;
      let y: number;
      if (near && nearR) {
        const a = this.rng.range(0, TAU);
        const d = this.rng.range(nearR * 0.4, nearR);
        x = near.x + Math.cos(a) * d;
        y = near.y + Math.sin(a) * d;
      } else {
        x = this.rng.range(r + 30, this.w - r - 30);
        y = this.rng.range(r + 30, this.h - r - 30);
      }
      if (this.blocked(x, y, r + 6)) continue;
      if (Math.hypot(x - this.player.x, y - this.player.y) < minFromPlayer) continue;
      return { x, y };
    }
    return { x: this.w / 2, y: this.h * 0.3 };
  }

  // ------------------------------------------------------------- spawning

  spawnEnemy(id: string, x: number, y: number, opts: { elite?: boolean; minion?: boolean; owner?: Enemy | null } = {}): Enemy {
    const def = getEnemy(id);
    const s = this.scaling;
    const roomScale = 1 + 0.08 * this.cfg.roomIndex;
    const elite = !!opts.elite;
    const hp = def.hp * this.biome.hpScale * s.hp * roomScale * (elite ? 2.2 : 1);
    const armor = ((def.armor ?? 0) * this.biome.hpScale * s.hp + (elite ? hp * 0.4 : 0)) | 0;
    const e: Enemy = {
      id: this.id(),
      def,
      boss: null,
      x,
      y,
      r: def.r * (elite ? 1.2 : 1),
      vx: 0,
      vy: 0,
      mx: 0,
      my: 0,
      facing: Math.atan2(this.player.y - y, this.player.x - x),
      hp,
      maxHp: hp,
      armor,
      maxArmor: armor,
      dmg: def.dmg * this.biome.dmgScale * s.dmg * (elite ? 1.2 : 1),
      speed: def.speed * s.speed,
      ai: null,
      wait: 0,
      hitstun: 0,
      stun: 0,
      freeze: 0,
      burn: 0,
      burnT: 0,
      burnTick: 0,
      chill: 0,
      chillT: 0,
      flash: 0,
      dead: false,
      spawnT: 0.35,
      invuln: false,
      alpha: 1,
      elite,
      minion: !!opts.minion,
      owner: opts.owner ?? null,
      contact: def.ai === 'swarmer',
      contactCd: 0.6,
      charging: null,
      windup: 0,
      windupMax: 0,
      anim: this.rng.range(0, 10),
      thermalCd: 0,
      slamCd: 0,
      phase: 0,
      memo: this.rng.chance(0.5) ? 1 : -1,
    };
    e.ai = createAI(e, this);
    this.enemies.push(e);
    return e;
  }

  spawnBoss(id: string): Enemy {
    const def = getBoss(id);
    const s = this.scaling;
    const hp = def.hp * s.hp;
    const e: Enemy = {
      id: this.id(),
      def: null,
      boss: def,
      x: this.w / 2,
      y: id === 'kiln' ? this.h / 2 - 30 : this.h * 0.3,
      r: def.r,
      vx: 0,
      vy: 0,
      mx: 0,
      my: 0,
      facing: Math.PI / 2,
      hp,
      maxHp: hp,
      armor: 0,
      maxArmor: 0,
      dmg: def.dmg * s.dmg,
      speed: def.speed * s.speed,
      ai: null,
      wait: 0,
      hitstun: 0,
      stun: 0,
      freeze: 0,
      burn: 0,
      burnT: 0,
      burnTick: 0,
      chill: 0,
      chillT: 0,
      flash: 0,
      dead: false,
      spawnT: 1.0,
      invuln: false,
      alpha: 1,
      elite: false,
      minion: false,
      owner: null,
      contact: false,
      contactCd: 0,
      charging: null,
      windup: 0,
      windupMax: 0,
      anim: 0,
      thermalCd: 0,
      slamCd: 0,
      phase: 0,
      memo: 1,
    };
    e.ai = createBossAI(e, this);
    this.enemies.push(e);
    this.boss = e;
    return e;
  }

  /** Telegraphed spawn: shows a marker, then the enemy appears. */
  queueSpawn(enemyId: string, x: number, y: number, opts: { elite?: boolean; minion?: boolean; owner?: Enemy | null; delay?: number } = {}): void {
    this.spawnMarkers.push({
      x,
      y,
      t: 0,
      dur: opts.delay ?? 0.9,
      enemyId,
      elite: !!opts.elite,
      minion: !!opts.minion,
      owner: opts.owner ?? null,
    });
  }

  addHazard(h: Partial<Hazard> & { shape: Shape; team: Hazard['team'] }): Hazard {
    const hz: Hazard = {
      id: this.id(),
      delay: 0,
      t: 0,
      dmg: 0,
      duration: 0,
      tickEvery: 0,
      tickT: 0,
      hitIds: new Set(),
      owner: null,
      cancelOnStun: false,
      followPlayer: false,
      followOwner: false,
      grow: 0,
      maxR: 0,
      slot: null,
      knock: 0,
      burn: 0,
      chill: 0,
      forceCrit: false,
      visual: h.team === 'enemy' ? 'warn' : 'none',
      color: h.team === 'enemy' ? '#ff4d4d' : '#ffffff',
      triggered: false,
      done: false,
      harmless: false,
      onTrigger: null,
      onUpdate: null,
      ...h,
    };
    this.hazards.push(hz);
    return hz;
  }

  fire(p: Partial<Projectile> & { x: number; y: number; vx: number; vy: number; team: Projectile['team']; dmg: number }): Projectile {
    const pr: Projectile = {
      id: this.id(),
      r: 7,
      life: 4,
      pierce: 0,
      hitIds: new Set(),
      color: p.team === 'enemy' ? ENEMY_PROJECTILE_COLOR : '#ffffff',
      slot: null,
      knock: 0,
      kind: 'orb',
      returning: false,
      dead: false,
      ghost: false,
      forceCrit: false,
      ...p,
    };
    this.projectiles.push(pr);
    return pr;
  }

  /** Enemy volley helper: `count` shots fanned over `spread` radians. */
  fireFan(x: number, y: number, angle: number, count: number, spread: number, speed: number, dmg: number, r = 7): void {
    for (let i = 0; i < count; i++) {
      const a = count === 1 ? angle : angle - spread / 2 + (spread * i) / (count - 1);
      this.fire({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, team: 'enemy', dmg, r });
    }
  }

  fireRing(x: number, y: number, count: number, offset: number, speed: number, dmg: number, r = 7): void {
    for (let i = 0; i < count; i++) {
      const a = offset + (TAU * i) / count;
      this.fire({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, team: 'enemy', dmg, r });
    }
  }

  addPickup(kind: PickupKind, x: number, y: number, value: number, reward: Reward | null = null): Pickup {
    const p: Pickup = { id: this.id(), x, y, kind, value, reward, t: 0, dead: false };
    this.pickups.push(p);
    return p;
  }

  // ---------------------------------------------------------------- fx

  particle(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.particles.length >= this.maxParticles) this.particles.shift();
    const life = p.life ?? 0.5;
    this.particles.push({ vx: 0, vy: 0, size: 3, color: '#fff', additive: true, drag: 3, kind: 'dot', ...p, life, max: life });
  }

  burst(x: number, y: number, color: string, count: number, speed = 160, size = 3, life = 0.45, kind: Particle['kind'] = 'dot'): void {
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, TAU);
      const s = speed * this.rng.range(0.3, 1);
      this.particle({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, size: size * this.rng.range(0.6, 1.3), life: life * this.rng.range(0.6, 1.2), kind });
    }
  }

  text(x: number, y: number, text: string, color: string, size = 14): void {
    if (this.texts.length > 60) this.texts.shift();
    this.texts.push({ x: x + this.rng.range(-8, 8), y, text, color, life: 0.8, max: 0.8, size, vy: -60 });
  }

  slash(s: Omit<SlashFx, 'max'>): void {
    this.slashes.push({ ...s, max: s.life });
  }

  bolt(pts: Vec[], color: string): void {
    // Jagged polyline between points.
    const out: Vec[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const segs = Math.max(2, Math.round(dist(a, b) / 22));
      for (let s = 0; s < segs; s++) {
        const t = s / segs;
        const j = s === 0 ? 0 : 9;
        out.push({ x: a.x + (b.x - a.x) * t + this.rng.range(-j, j), y: a.y + (b.y - a.y) * t + this.rng.range(-j, j) });
      }
    }
    out.push(pts[pts.length - 1]);
    this.bolts.push({ pts: out, life: 0.18, max: 0.18, color });
  }

  // ---------------------------------------------------------- room flow

  openDoors(): void {
    for (const d of this.doors) d.open = true;
  }

  /** Called by the app after it has handled a collected reward. */
  finishReward(): void {
    if (this.state === 'reward' || this.state === 'cleared') {
      this.state = 'exit';
      this.openDoors();
      this.sfx('doors');
    }
  }

  private startWave(i: number): void {
    this.waveIndex = i;
    const wave = this.cfg.plan.waves[i];
    const minDist = 220;
    for (const s of wave) {
      const def = getEnemy(s.enemyId);
      const p = this.randomOpenPoint(def.r * 1.3, minDist);
      this.queueSpawn(s.enemyId, p.x, p.y, { elite: s.elite, delay: 0.8 + this.rng.range(0, 0.4) });
    }
    this.sfx('spawn', 0.6);
  }

  private clearRoom(): void {
    this.state = 'cleared';
    this.stateT = 0;
    this.slowmo = 0.7;
    for (const e of this.enemies) if (!e.dead) killEnemy(this, e, true);
    this.hazards = this.hazards.filter((h) => h.team === 'player');
    this.projectiles = this.projectiles.filter((p) => p.team === 'player');
    if (this.stats.healOnClear > 0) this.healPlayer(this.stats.healOnClear);
    this.emit({ type: 'roomCleared' });
    this.sfx('clear');
    const r = this.cfg.reward;
    if (r.kind === 'none' || r.kind === 'shop') {
      this.finishReward();
    } else if (r.kind === 'boss') {
      // Boss reward orb appears after the death throes.
      this.schedule(1.4, () => this.spawnRewardOrb());
    } else {
      this.spawnRewardOrb();
    }
  }

  private spawnRewardOrb(): void {
    let x = this.w / 2;
    let y = this.h / 2;
    if (this.blocked(x, y, 30)) y = this.h * 0.72;
    if (this.blocked(x, y, 30)) {
      const p = this.randomOpenPoint(30, 0);
      x = p.x;
      y = p.y;
    }
    this.addPickup('reward', x, y, 0, this.cfg.reward);
    this.state = 'reward';
  }

  healPlayer(amount: number): void {
    const p = this.player;
    if (p.down) return;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    const gained = Math.round(p.hp - before);
    if (gained > 0) this.text(p.x, p.y - 24, `+${gained}`, '#7dff9a', 13);
  }

  revivePlayer(fraction: number): void {
    const p = this.player;
    p.down = false;
    p.hp = Math.max(1, Math.round(p.maxHp * fraction));
    p.iframes = 2;
    this.slowmo = 0;
    this.burst(p.x, p.y, '#ffe9a8', 40, 260, 4, 0.8);
    this.addHazard({ shape: { kind: 'circle', x: p.x, y: p.y, r: 160 }, team: 'player', dmg: 0, knock: 600, visual: 'light', color: '#ffe9a8' });
    // Shove enemies back so the rekindle isn't instantly punished.
    for (const e of this.living()) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 220 && !e.boss) {
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        e.vx += Math.cos(a) * 600;
        e.vy += Math.sin(a) * 600;
      }
    }
    this.projectiles = this.projectiles.filter((pr) => pr.team === 'player');
    this.sfx('rekindle');
  }

  // ---------------------------------------------------------------- step

  step(dt: number, controls: Controls): void {
    this.controls = controls;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    if (this.slowmo > 0) {
      this.slowmo -= dt;
      dt *= 0.35;
    }
    this.time += dt;
    this.stateT += dt;

    // scheduled callbacks
    if (this.scheduled.length) {
      const due: (() => void)[] = [];
      this.scheduled = this.scheduled.filter((s) => {
        s.t -= dt;
        if (s.t <= 0) {
          due.push(s.fn);
          return false;
        }
        return true;
      });
      for (const fn of due) fn();
    }

    this.updateRoomFlow();
    updatePlayer(this, dt, controls);
    this.updateSpawnMarkers(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateHazards(dt);
    this.updateLobs(dt);
    this.updatePickups(dt);
    this.updateDoors();
    this.updateFx(dt);

    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  private updateRoomFlow(): void {
    const kind = this.cfg.kind;
    if (this.state === 'intro') {
      if (kind === 'boss' && this.stateT >= 1.0) {
        this.spawnBoss(this.biome.boss);
        this.state = 'fight';
        this.sfx('roar');
        this.shake(10);
      } else if (kind === 'combat' && this.stateT >= 0.6) {
        this.state = 'fight';
        this.startWave(0);
      }
      return;
    }
    if (this.state !== 'fight') return;
    if (kind === 'boss') {
      if (this.boss && this.boss.dead && this.living().length === 0) this.clearRoom();
      return;
    }
    const waves = this.cfg.plan.waves;
    const alive = this.enemies.filter((e) => !e.dead && !e.minion).length;
    if (this.spawnMarkers.length > 0) return;
    const prevSize = this.waveIndex >= 0 ? waves[this.waveIndex].length : 0;
    if (this.waveIndex < waves.length - 1) {
      if (alive <= Math.floor(prevSize * 0.25)) this.startWave(this.waveIndex + 1);
    } else if (this.living().length === 0) {
      this.clearRoom();
    }
  }

  private updateSpawnMarkers(dt: number): void {
    for (const m of this.spawnMarkers) {
      m.t += dt;
      if (m.t >= m.dur) {
        const e = this.spawnEnemy(m.enemyId, m.x, m.y, { elite: m.elite, minion: m.minion, owner: m.owner });
        this.burst(e.x, e.y, e.def?.color ?? '#fff', 14, 140, 3, 0.4);
      }
    }
    this.spawnMarkers = this.spawnMarkers.filter((m) => m.t < m.dur);
  }

  private updateEnemies(dt: number): void {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.anim += dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.spawnT > 0) {
        e.spawnT -= dt;
        continue;
      }
      updateStatus(this, e, dt);
      if (e.dead) continue;

      const disabled = e.freeze > 0 || e.stun > 0;
      if (disabled) {
        e.mx = e.my = 0;
        e.charging = null;
        e.windup = 0;
      } else if (e.hitstun <= 0 && e.ai) {
        e.wait -= dt;
        if (e.wait <= 0) {
          const r = e.ai.next();
          if (r.done) {
            e.ai = null;
          } else {
            const v = r.value;
            e.wait = v === 0 ? 0 : Math.max(e.wait, -dt) + v;
          }
        }
      }
      if (e.windup > 0) e.windup = Math.max(0, e.windup - dt);

      // Movement
      const slow = e.freeze > 0 ? 0 : 1 - Math.min(0.5, e.chill * 0.1);
      let vx = e.mx * slow + e.vx;
      let vy = e.my * slow + e.vy;
      if (e.charging && !disabled) {
        const c = e.charging;
        vx = Math.cos(c.angle) * c.speed * slow + e.vx;
        vy = Math.sin(c.angle) * c.speed * slow + e.vy;
        c.t -= dt;
        if (!c.hit && Math.hypot(p.x - e.x, p.y - e.y) < p.r + e.r + 4) {
          if (damagePlayer(this, e.dmg * 1.2, e)) c.hit = true;
        }
      }
      e.x += vx * dt;
      e.y += vy * dt;
      const kbSpeed = len(e.vx, e.vy);
      const hitWall = this.collide(e, e.r);
      if (hitWall) {
        if (e.charging) {
          if (e.boss) this.shake(8);
          e.charging.t = 0;
        }
        if (kbSpeed > 260 && e.slamCd <= 0 && this.mods.wallSlam > 0 && !e.boss) {
          e.slamCd = 0.5;
          const mult = this.mods.scaldingSurf ? 2 : 1;
          hitEnemy(this, e, this.mods.wallSlam * mult, { slot: null, source: 'slam', noProc: true });
          this.burst(e.x, e.y, '#9cc8ff', 10, 180, 3);
          this.shake(4);
          this.sfx('slam', 0.7);
          if (this.mods.thunderhead > 0 && !e.dead) {
            chainLightning(this, e, 3, this.mods.thunderhead);
          }
        }
        e.vx *= 0.3;
        e.vy *= 0.3;
      }
      if (e.charging && e.charging.t <= 0) e.charging = null;
      const decay = Math.exp(-8 * dt);
      e.vx *= decay;
      e.vy *= decay;

      // Contact damage (swarmers).
      if (e.contact) {
        e.contactCd -= dt;
        if (e.contactCd <= 0 && !disabled && Math.hypot(p.x - e.x, p.y - e.y) < p.r + e.r) {
          if (damagePlayer(this, e.dmg, e)) e.contactCd = e.def?.cooldown ?? 1;
        }
      }
    }

    // Separation between enemies, and between enemies and the player.
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.spawnT > 0) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.spawnT > 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          const wa = a.boss ? 0 : b.boss ? 1 : 0.5;
          const wb = 1 - wa;
          a.x -= nx * push * 2 * wa;
          a.y -= ny * push * 2 * wa;
          b.x += nx * push * 2 * wb;
          b.y += ny * push * 2 * wb;
        }
      }
      if (!p.down && p.dashing <= 0) {
        const dx = a.x - p.x;
        const dy = a.y - p.y;
        const min = a.r + p.r - 2;
        const d2 = dx * dx + dy * dy;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = min - d;
          if (a.boss) {
            p.x -= (dx / d) * push;
            p.y -= (dy / d) * push;
            this.collide(p, p.r);
          } else {
            a.x += (dx / d) * push;
            a.y += (dy / d) * push;
          }
        }
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const p = this.player;
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      if (pr.returning) {
        const a = Math.atan2(p.y - pr.y, p.x - pr.x);
        pr.vx = Math.cos(a) * 1000;
        pr.vy = Math.sin(a) * 1000;
        if (Math.hypot(p.x - pr.x, p.y - pr.y) < 26) {
          pr.dead = true;
          continue;
        }
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      if (pr.life <= 0 && !pr.returning) {
        if (pr.kind === 'harpoon') {
          pr.returning = true;
          pr.hitIds.clear();
        } else {
          pr.dead = true;
          continue;
        }
      }
      if (!pr.ghost && !pr.returning && this.blocked(pr.x, pr.y, pr.r * 0.6)) {
        if (pr.kind === 'harpoon') {
          pr.returning = true;
          pr.hitIds.clear();
          this.burst(pr.x, pr.y, pr.color, 6, 120, 2);
        } else {
          pr.dead = true;
          this.burst(pr.x, pr.y, pr.color, 5, 90, 2, 0.25);
          continue;
        }
      }
      if (pr.team === 'enemy') {
        if (!p.down && Math.hypot(p.x - pr.x, p.y - pr.y) < p.r + pr.r - 2) {
          if (damagePlayer(this, pr.dmg, null)) {
            pr.dead = true;
            this.burst(pr.x, pr.y, pr.color, 8, 120, 2);
          }
        }
      } else {
        for (const e of this.enemies) {
          if (e.dead || e.invuln || e.spawnT > 0 || pr.hitIds.has(e.id)) continue;
          if (Math.hypot(e.x - pr.x, e.y - pr.y) < e.r + pr.r) {
            pr.hitIds.add(e.id);
            const dir = Math.atan2(pr.vy, pr.vx);
            hitEnemy(this, e, pr.dmg, { slot: pr.slot, dir, knock: pr.knock, forceCrit: pr.forceCrit });
            this.burst(pr.x, pr.y, pr.color, 6, 140, 2, 0.3);
            if (pr.pierce <= 0) {
              pr.dead = true;
              break;
            }
            pr.pierce--;
          }
        }
      }
    }
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);
  }

  private updateHazards(dt: number): void {
    const p = this.player;
    for (const h of this.hazards) {
      if (h.done) continue;
      h.t += dt;
      if (h.followOwner && h.owner) {
        h.shape.x = h.owner.x;
        h.shape.y = h.owner.y;
      }
      if (h.followPlayer) {
        h.shape.x = p.x;
        h.shape.y = p.y;
      }
      if (h.onUpdate) h.onUpdate(dt);
      if (h.cancelOnStun && h.owner && (h.owner.dead || h.owner.stun > 0 || h.owner.freeze > 0)) {
        h.done = true;
        continue;
      }
      if (h.grow && h.shape.kind === 'ring') {
        if (h.t >= h.delay) h.shape.r += h.grow * dt;
        if (h.shape.r >= h.maxR) h.done = true;
      }
      if (!h.triggered && h.t >= h.delay) {
        h.triggered = true;
        if (h.onTrigger) h.onTrigger();
      }
      if (h.triggered && !h.harmless && !h.done) {
        let tick = false;
        if (h.tickEvery > 0) {
          h.tickT -= dt;
          if (h.tickT <= 0) {
            h.tickT = h.tickEvery;
            tick = true;
            h.hitIds.clear();
          }
        } else {
          tick = true;
        }
        if (tick) {
          if (h.team === 'enemy') {
            if (!p.down && !h.hitIds.has(0) && shapeHitsCircle(h.shape, p.x, p.y, p.r - 3)) {
              if (damagePlayer(this, h.dmg, h.owner)) h.hitIds.add(0);
            }
          } else {
            for (const e of this.enemies) {
              if (e.dead || e.invuln || e.spawnT > 0 || h.hitIds.has(e.id)) continue;
              if (shapeHitsCircle(h.shape, e.x, e.y, e.r)) {
                h.hitIds.add(e.id);
                const dir = Math.atan2(e.y - h.shape.y, e.x - h.shape.x);
                const kdir = h.shape.kind === 'line' ? h.shape.angle : dir;
                if (h.dmg > 0) {
                  hitEnemy(this, e, h.dmg, { slot: h.slot, dir: kdir, knock: h.knock, burn: h.burn, chill: h.chill, forceCrit: h.forceCrit });
                } else if (h.knock > 0 && !e.boss && e.armor <= 0) {
                  e.vx += Math.cos(kdir) * h.knock;
                  e.vy += Math.sin(kdir) * h.knock;
                }
              }
            }
          }
        }
      }
      if (h.triggered && h.t >= h.delay + h.duration && !(h.grow > 0)) h.done = true;
    }
    this.hazards = this.hazards.filter((h) => !h.done);
  }

  private updateLobs(dt: number): void {
    if (!this.lobs.length) return;
    const landed: Lob[] = [];
    for (const l of this.lobs) {
      l.t += dt;
      if (l.t >= l.dur) landed.push(l);
    }
    this.lobs = this.lobs.filter((l) => l.t < l.dur);
    for (const l of landed) l.onLand();
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    for (const k of this.pickups) {
      if (k.dead) continue;
      k.t += dt;
      const d = Math.hypot(p.x - k.x, p.y - k.y);
      const magnet = k.kind === 'reward' ? 0 : 140;
      if (d < magnet && k.t > 0.4) {
        const a = Math.atan2(p.y - k.y, p.x - k.x);
        const s = 420 * (1 - d / (magnet + 1)) + 120;
        k.x += Math.cos(a) * s * dt;
        k.y += Math.sin(a) * s * dt;
      }
      if (!p.down && d < p.r + (k.kind === 'reward' ? 26 : 12)) {
        k.dead = true;
        if (k.kind === 'heal') this.healPlayer(k.value);
        if (k.kind === 'reward' && k.reward) {
          this.emit({ type: 'reward', reward: k.reward });
          this.burst(k.x, k.y, '#fff3c4', 30, 220, 3, 0.6);
          this.sfx('reward');
        } else {
          this.emit({ type: 'pickup', kind: k.kind, value: k.value });
          this.sfx('pickup', 0.6);
        }
      }
    }
    this.pickups = this.pickups.filter((k) => !k.dead);

    if (this.altar) {
      const d = Math.hypot(p.x - this.altar.x, p.y - this.altar.y);
      if (d < 46 && this.altar.armed) {
        this.altar.armed = false;
        this.emit({ type: 'shop' });
      } else if (d > 80) {
        this.altar.armed = true;
      }
    }
  }

  private updateDoors(): void {
    if (this.state !== 'exit') return;
    const p = this.player;
    for (let i = 0; i < this.doors.length; i++) {
      const d = this.doors[i];
      if (d.open && p.y < p.r + 10 && Math.abs(p.x - d.x) < 44) {
        this.state = 'leaving';
        this.emit({ type: 'door', index: i });
        this.sfx('door');
        return;
      }
    }
  }

  private updateFx(dt: number): void {
    for (const pt of this.particles) {
      pt.life -= dt;
      const dr = Math.exp(-pt.drag * dt);
      pt.vx *= dr;
      pt.vy *= dr;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-3 * dt);
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const s of this.slashes) {
      s.life -= dt;
      if (s.followPlayer) {
        s.x = this.player.x;
        s.y = this.player.y;
      }
    }
    this.slashes = this.slashes.filter((s) => s.life > 0);
    for (const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }

  /** Clamp helper for AI targeting. */
  clampToArena(x: number, y: number, margin: number): Vec {
    return { x: clamp(x, margin, this.w - margin), y: clamp(y, margin, this.h - margin) };
  }
}
