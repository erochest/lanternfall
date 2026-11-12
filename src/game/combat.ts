import { CURRENT_INFO } from '../data/glyphs';
import type { Enemy } from './entities';
import type { ActionSlot } from './mods';
import type { World } from './world';

export interface HitOpts {
  slot: ActionSlot | null;
  /** Direction for knockback (radians). */
  dir?: number;
  knock?: number;
  forceCrit?: boolean;
  /** Skip on-hit effects (used by chains, DoTs, explosions). */
  noProc?: boolean;
  burn?: number;
  chill?: number;
  source?: 'chain' | 'dot' | 'thorns' | 'explosion' | 'slam' | 'strike';
}

export const BURN_DPS_PER_STACK = 2.5;
export const BURN_DURATION = 3;
export const BURN_TICK = 0.4;
export const CHILL_DURATION = 3;
export const FREEZE_THRESHOLD = 5;
export const BOSS_FREEZE_THRESHOLD = 12;
export const FREEZE_DURATION = 1.6;

const EMBER = CURRENT_INFO.ember.color;
const FROST = CURRENT_INFO.frost.color;
const STORM = CURRENT_INFO.storm.color;

export function applyBurn(w: World, e: Enemy, stacks: number): void {
  if (stacks <= 0 || e.dead || e.armor > 0) return;
  e.burn = Math.min(w.mods.burnMax, e.burn + stacks);
  e.burnT = BURN_DURATION;
  if (e.burnTick <= 0) e.burnTick = BURN_TICK;
}

export function applyChill(w: World, e: Enemy, stacks: number): void {
  if (stacks <= 0 || e.dead || e.armor > 0 || e.freeze > 0) return;
  e.chill += stacks;
  e.chillT = CHILL_DURATION;
  const threshold = e.boss ? BOSS_FREEZE_THRESHOLD : FREEZE_THRESHOLD;
  if (e.chill >= threshold) {
    e.freeze = (e.boss ? 0.6 : FREEZE_DURATION) * w.mods.freezeDurMult;
    e.chill = 0;
    e.charging = null;
    w.text(e.x, e.y - e.r - 10, 'FROZEN', FROST, 13);
    w.burst(e.x, e.y, FROST, 14, 160, 3, 0.5, 'shard');
    w.sfx('freeze', 0.7);
  }
}

/**
 * Deal player-sourced damage to an enemy, running every modifier. Returns
 * the damage dealt (0 if the enemy could not be hit).
 */
export function hitEnemy(w: World, e: Enemy, base: number, o: HitOpts): number {
  if (e.dead || e.invuln || e.spawnT > 0 || base <= 0) return 0;
  const m = w.mods;
  const fx = o.slot ? m.slot[o.slot] : null;
  const isDot = o.source === 'dot';

  let dmg = base * w.stats.damageMult * (1 + (fx?.dmg ?? 0));
  let critChance = m.critAll + (fx?.crit ?? 0);
  if (m.abyssalChill && e.freeze > 0) critChance += 0.3;
  let crit = !!o.forceCrit || (critChance > 0 && w.rng.chance(critChance));
  if (isDot && !m.blackFlame) crit = false;
  if (o.source === 'thorns') crit = false;
  if (crit) dmg *= 2 + m.critDmg;
  if (e.freeze > 0) dmg *= 1 + m.frozenVuln;
  if (e.hp / e.maxHp < 0.3) dmg *= 1 + m.executeBonus;
  if (e.boss || e.elite) dmg *= w.stats.bossDamageMult;
  dmg = Math.max(1, Math.round(dmg));

  let toHp = dmg;
  if (e.armor > 0) {
    const a = Math.min(e.armor, dmg);
    e.armor -= a;
    toHp = dmg - a;
    if (e.armor <= 0) {
      e.armor = 0;
      if (!e.boss) {
        e.stun = 1.2;
        e.charging = null;
      }
      w.text(e.x, e.y - e.r - 14, 'BREAK', '#e6e6ff', 15);
      w.burst(e.x, e.y, '#d6d6e6', 16, 220, 3, 0.5, 'shard');
      w.sfx('break');
      w.shake(5);
    }
  }
  e.hp -= toHp;
  e.flash = 0.09;

  // Damage number
  const color = isDot ? EMBER : crit ? '#ffef5c' : o.source === 'chain' || o.source === 'strike' ? STORM : '#ffffff';
  w.text(e.x, e.y - e.r - 6, crit ? `${dmg}!` : `${dmg}`, color, crit ? 18 : isDot ? 11 : 14);

  if (!o.noProc && !isDot) {
    let burn = (fx?.burn ?? 0) + (o.burn ?? 0);
    let chill = (fx?.chill ?? 0) + (o.chill ?? 0);
    if (crit && m.abyssalChill) chill += 2;
    const armored = e.armor > 0;

    const knock = (o.knock ?? 0) * (1 + (fx?.knock ?? 0));
    if (knock > 0 && !e.boss && !armored && o.dir !== undefined) {
      const mass = Math.max(0.7, e.r / 15);
      e.vx += (Math.cos(o.dir) * knock) / mass;
      e.vy += (Math.sin(o.dir) * knock) / mass;
      if (m.scaldingSurf && knock > 150) burn += 2;
    }
    applyBurn(w, e, burn);
    applyChill(w, e, chill);
    if (!e.boss && !armored && o.slot) e.hitstun = Math.max(e.hitstun, 0.12);

    if (fx && fx.strike > 0) strike(w, e, fx.strike);
    if (fx && fx.chain > 0) chainLightning(w, e, fx.chain, fx.chainDmg);
    if (m.staticChance > 0 && w.rng.chance(m.staticChance)) chainLightning(w, e, 1, m.staticDmg);
    if (m.thermalShock > 0 && !e.dead && e.burn > 0 && (e.chill > 0 || e.freeze > 0) && e.thermalCd <= 0) {
      e.thermalCd = 1;
      explosion(w, e.x, e.y, 70, m.thermalShock, '#ffb0e0', {});
    }
  } else if (o.burn || o.chill) {
    applyBurn(w, e, o.burn ?? 0);
    applyChill(w, e, o.chill ?? 0);
  }

  if (o.slot === 'attack' || o.slot === 'special') {
    const heavy = base >= 30;
    w.hitstop = Math.max(w.hitstop, crit ? 0.055 : heavy ? 0.045 : 0.025);
    w.emit({ type: 'haptic', ms: heavy || crit ? 18 : 8, strength: heavy ? 0.6 : 0.3 });
  }
  if (o.slot) w.sfx(crit ? 'crit' : 'hit', 0.8);

  if (e.hp <= 0) killEnemy(w, e);
  return dmg;
}

/** A lightning bolt from the sky onto one enemy. */
export function strike(w: World, e: Enemy, dmg: number): void {
  w.bolt([{ x: e.x + w.rng.range(-20, 20), y: e.y - 220 }, { x: e.x, y: e.y }], STORM);
  hitEnemy(w, e, dmg, { slot: null, source: 'strike', noProc: true });
  w.sfx('zap', 0.6);
}

export function chainLightning(w: World, from: Enemy, jumps: number, dmg: number): void {
  const m = w.mods;
  const total = jumps + m.chainBonusJumps;
  const d0 = dmg * m.chainDmgMult;
  const hit = new Set<number>([from.id]);
  const pts = [{ x: from.x, y: from.y }];
  let cur: { x: number; y: number } = from;
  for (let i = 0; i < total; i++) {
    const next = w.nearestEnemy(cur.x, cur.y, 190, hit);
    if (!next) break;
    hit.add(next.id);
    const chilled = next.chill > 0 || next.freeze > 0;
    hitEnemy(w, next, d0 * (m.superconductor && chilled ? 2 : 1), { slot: null, source: 'chain', noProc: true });
    if (m.superconductor) applyChill(w, next, 1);
    pts.push({ x: next.x, y: next.y });
    cur = next;
  }
  if (pts.length === 1 && !from.dead) {
    // Nothing to leap to: ground the bolt into the original target.
    const chilled = from.chill > 0 || from.freeze > 0;
    w.bolt([{ x: from.x, y: from.y - 120 }, { x: from.x, y: from.y }], STORM);
    hitEnemy(w, from, d0 * 0.6 * (m.superconductor && chilled ? 2 : 1), { slot: null, source: 'chain', noProc: true });
    if (m.superconductor) applyChill(w, from, 1);
  } else if (pts.length > 1) {
    w.bolt(pts, STORM);
  }
  w.sfx('zap', 0.5);
}

export function explosion(
  w: World,
  x: number,
  y: number,
  r: number,
  dmg: number,
  color: string,
  o: { burn?: number; chill?: number; knock?: number },
): void {
  w.slash({ x, y, r, angle: 0, spread: 0, life: 0.3, color, kind: 'ring', width: 10, followPlayer: false });
  w.burst(x, y, color, 18, 240, 3.5, 0.5);
  for (const e of w.enemies) {
    if (e.dead || e.invuln || e.spawnT > 0) continue;
    if (Math.hypot(e.x - x, e.y - y) <= r + e.r) {
      const dir = Math.atan2(e.y - y, e.x - x);
      hitEnemy(w, e, dmg, { slot: null, source: 'explosion', noProc: true, burn: o.burn, chill: o.chill });
      if (o.knock && !e.boss && e.armor <= 0) {
        e.vx += Math.cos(dir) * o.knock;
        e.vy += Math.sin(dir) * o.knock;
      }
    }
  }
  w.sfx('boom', 0.6);
  w.shake(4);
}

export function killEnemy(w: World, e: Enemy, silent = false): void {
  if (e.dead) return;
  e.dead = true;
  e.hp = 0;
  const color = e.def?.color ?? e.boss?.color ?? '#fff';
  w.burst(e.x, e.y, color, silent ? 8 : e.boss ? 80 : 22, e.boss ? 380 : 220, e.boss ? 5 : 3.5, e.boss ? 1.2 : 0.55);
  if (silent) return;

  const m = w.mods;
  w.kills++;
  w.emit({ type: 'kill', elite: e.elite, boss: !!e.boss });
  w.sfx(e.boss ? 'bossdie' : 'kill', 0.8);
  w.shake(e.boss ? 16 : e.elite ? 6 : 2);

  if (e.boss) {
    w.slowmo = 1.2;
    w.hitstop = 0.12;
    w.emit({ type: 'bossDefeated', bossId: e.boss.id });
    w.emit({ type: 'haptic', ms: 120, strength: 1 });
    for (const o of w.enemies) if (!o.dead && o !== e) killEnemy(w, o, true);
    return;
  }

  if (m.wildfire > 0 && e.burn > 0) {
    w.schedule(0.05, () => explosion(w, e.x, e.y, 80, m.wildfire, EMBER, { burn: 2 }));
  }
  if (m.shatter > 0 && (e.chill > 0 || e.freeze > 0)) {
    w.burst(e.x, e.y, FROST, 12, 240, 3, 0.5, 'shard');
    w.schedule(0.05, () => explosion(w, e.x, e.y, 76, m.shatter, FROST, { chill: 1.5 }));
  }
  if (m.healOnKill > 0 && !e.minion) w.healPlayer(m.healOnKill);

  if (!e.minion) {
    if (e.elite) {
      w.addPickup('pearl', e.x, e.y, w.rng.int(8, 14));
    } else if (w.rng.chance(0.2)) {
      w.addPickup('pearl', e.x, e.y, w.rng.int(2, 4));
    }
    if (w.rng.chance(0.04)) w.addPickup('heal', e.x, e.y, 8);
  }
}

/** Per-frame status effect upkeep. */
export function updateStatus(w: World, e: Enemy, dt: number): void {
  if (e.burnT > 0) {
    e.burnT -= dt;
    e.burnTick -= dt;
    if (e.burnTick <= 0) {
      e.burnTick = BURN_TICK;
      const dmg = e.burn * BURN_DPS_PER_STACK * BURN_TICK * w.mods.burnDpsMult;
      hitEnemy(w, e, dmg, { slot: null, source: 'dot', noProc: true });
      if (!e.dead) w.particle({ x: e.x + w.rng.range(-e.r, e.r) * 0.6, y: e.y, vy: -70, color: EMBER, size: 3, life: 0.5, drag: 1 });
    }
    if (e.burnT <= 0) e.burn = 0;
  }
  if (e.chillT > 0) {
    e.chillT -= dt;
    if (e.chillT <= 0) e.chill = 0;
  }
  if (e.freeze > 0) e.freeze -= dt;
  if (e.stun > 0) e.stun -= dt;
  if (e.hitstun > 0) e.hitstun -= dt;
  if (e.thermalCd > 0) e.thermalCd -= dt;
  if (e.slamCd > 0) e.slamCd -= dt;
}

/** Enemy-sourced damage to the player. Returns true if damage landed. */
export function damagePlayer(w: World, amount: number, source: Enemy | null): boolean {
  const p = w.player;
  if (p.down || p.iframes > 0 || p.dashing > 0 || amount <= 0) return false;
  if (w.state === 'leaving') return false;
  if (p.shield > 0) {
    p.shield--;
    p.iframes = 0.6;
    w.text(p.x, p.y - 26, 'BLOCKED', '#9cc8ff', 14);
    w.sfx('block');
    w.slash({ x: p.x, y: p.y, r: 40, angle: 0, spread: 0, life: 0.3, color: '#9cc8ff', kind: 'ring', width: 8, followPlayer: true });
    if (w.mods.seaWall > 0) {
      explosion(w, p.x, p.y, 130, w.mods.seaWall, CURRENT_INFO.tide.color, { knock: 500 });
    }
    return true;
  }
  const dmg = Math.max(1, Math.round(amount * (1 - w.stats.dr) * w.stats.damageTakenMult));
  p.hp -= dmg;
  p.iframes = 0.85;
  p.flash = 0.25;
  w.hitstop = Math.max(w.hitstop, 0.07);
  w.shake(7);
  w.text(p.x, p.y - 26, `-${dmg}`, '#ff5a5a', 16);
  w.burst(p.x, p.y, '#ff5a5a', 12, 200, 3, 0.4);
  w.sfx('hurt');
  w.emit({ type: 'haptic', ms: 60, strength: 0.9 });

  if (source && w.stats.thorns > 0 && !source.dead && Math.hypot(source.x - p.x, source.y - p.y) < 160) {
    hitEnemy(w, source, w.stats.thorns, { slot: null, source: 'thorns', noProc: true });
  }
  if (p.hp <= 0) {
    p.hp = 0;
    p.down = true;
    p.action = null;
    w.slowmo = 1.0;
    w.emit({ type: 'playerDown' });
  }
  return true;
}
