/**
 * Enemy behaviours as generators. Each `yield n` waits n seconds (0 = one
 * frame). While frozen/stunned the generator simply isn't advanced, and any
 * telegraphed attack it owns is cancelled — rewarding crowd control.
 */
import { TAU } from '../core/math';
import type { Enemy } from './entities';
import type { World } from './world';

export type AI = Generator<number, void, void>;

export function toPlayer(e: Enemy, w: World): { dx: number; dy: number; d: number; a: number } {
  const dx = w.player.x - e.x;
  const dy = w.player.y - e.y;
  return { dx, dy, d: Math.hypot(dx, dy), a: Math.atan2(dy, dx) };
}

export function stop(e: Enemy): void {
  e.mx = 0;
  e.my = 0;
}

/** Move along `angle`, sidestepping obstacles by probing ahead. */
export function steer(e: Enemy, w: World, angle: number, speed: number): void {
  let a = angle;
  const probe = e.r + 22;
  if (w.blocked(e.x + Math.cos(a) * probe, e.y + Math.sin(a) * probe, e.r * 0.8)) {
    const alt = a + e.memo * 0.9;
    if (!w.blocked(e.x + Math.cos(alt) * probe, e.y + Math.sin(alt) * probe, e.r * 0.8)) a = alt;
    else {
      e.memo = -e.memo;
      a = a + e.memo * 1.4;
    }
  }
  e.mx = Math.cos(a) * speed;
  e.my = Math.sin(a) * speed;
  e.facing = angle;
}

export function telegraph(e: Enemy, t: number): void {
  e.windup = t;
  e.windupMax = t;
}

export function* approach(e: Enemy, w: World, range: number, maxT: number): AI {
  let t = 0;
  while (t < maxT) {
    const tp = toPlayer(e, w);
    if (tp.d <= range) break;
    steer(e, w, tp.a, e.speed);
    yield 0;
    t += w.dt;
  }
  stop(e);
}

function* chaser(e: Enemy, w: World): AI {
  const def = e.def!;
  yield w.rng.range(0.1, 0.6);
  for (;;) {
    yield* approach(e, w, def.range + e.r, 4);
    const a = toPlayer(e, w).a;
    e.facing = a;
    telegraph(e, def.windup);
    w.addHazard({
      shape: { kind: 'arc', x: e.x, y: e.y, r: def.range + e.r + 12, angle: a, spread: 1.7 },
      team: 'enemy',
      delay: def.windup,
      dmg: e.dmg,
      owner: e,
      cancelOnStun: true,
      followOwner: true,
    });
    yield def.windup;
    e.vx += Math.cos(a) * 160;
    e.vy += Math.sin(a) * 160;
    yield def.cooldown + w.rng.range(0, 0.35);
  }
}

function* charger(e: Enemy, w: World): AI {
  const def = e.def!;
  yield w.rng.range(0.3, 0.9);
  for (;;) {
    // Close in, but stop at charge range.
    let t = 0;
    while (t < 3) {
      const tp = toPlayer(e, w);
      if (tp.d < def.range * 0.85) break;
      steer(e, w, tp.a, e.speed);
      yield 0;
      t += w.dt;
    }
    stop(e);
    const a = toPlayer(e, w).a;
    e.facing = a;
    telegraph(e, def.windup);
    const length = def.range + 60;
    w.addHazard({
      shape: { kind: 'line', x: e.x, y: e.y, angle: a, length, width: e.r * 2 + 12 },
      team: 'enemy',
      delay: def.windup,
      harmless: true,
      owner: e,
      cancelOnStun: true,
      followOwner: true,
    });
    yield def.windup;
    const speed = 720;
    e.charging = { angle: a, t: length / speed, speed, hit: false };
    w.sfx('charge', 0.5);
    while (e.charging) yield 0;
    yield def.cooldown + w.rng.range(0, 0.4);
  }
}

function* shooter(e: Enemy, w: World): AI {
  const def = e.def!;
  const proj = def.proj!;
  yield w.rng.range(0.3, 1.2);
  for (;;) {
    let t = def.cooldown * w.rng.range(0.8, 1.2);
    let strafeT = 0;
    while (t > 0) {
      const tp = toPlayer(e, w);
      strafeT -= w.dt;
      if (strafeT <= 0) {
        strafeT = w.rng.range(0.8, 1.6);
        e.memo = w.rng.chance(0.5) ? 1 : -1;
      }
      if (tp.d > def.range + 70) steer(e, w, tp.a, e.speed);
      else if (tp.d < def.range - 90) steer(e, w, tp.a + Math.PI, e.speed);
      else steer(e, w, tp.a + (e.memo * Math.PI) / 2, e.speed * 0.6);
      e.facing = tp.a;
      yield 0;
      t -= w.dt;
    }
    stop(e);
    telegraph(e, def.windup);
    const aim0 = toPlayer(e, w).a;
    const tele = w.addHazard({
      shape: { kind: 'line', x: e.x, y: e.y, angle: aim0, length: 90, width: 6 },
      team: 'enemy',
      delay: def.windup,
      harmless: true,
      owner: e,
      cancelOnStun: true,
      followOwner: true,
    });
    let wt = 0;
    while (wt < def.windup) {
      const aim = toPlayer(e, w).a;
      e.facing = aim;
      if (tele.shape.kind === 'line') tele.shape.angle = aim;
      yield 0;
      wt += w.dt;
    }
    const a = toPlayer(e, w).a;
    w.fireFan(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, a, proj.count, proj.spread, proj.speed, e.dmg, proj.r);
    w.sfx('enemyShot', 0.5);
    yield 0.3;
  }
}

function* bomber(e: Enemy, w: World): AI {
  const def = e.def!;
  yield w.rng.range(0, 0.4);
  for (;;) {
    yield* approach(e, w, def.range, 5);
    telegraph(e, def.windup);
    const r = 82;
    let exploded = false;
    w.addHazard({
      shape: { kind: 'circle', x: e.x, y: e.y, r },
      team: 'enemy',
      delay: def.windup,
      dmg: e.dmg,
      owner: e,
      cancelOnStun: true,
      followOwner: true,
      onTrigger: () => {
        exploded = true;
        w.burst(e.x, e.y, def.color, 26, 280, 4, 0.5);
        w.slash({ x: e.x, y: e.y, r, angle: 0, spread: 0, life: 0.3, color: def.accent, kind: 'ring', width: 12, followPlayer: false });
        w.sfx('boom');
        w.shake(5);
        e.dead = true;
        e.hp = 0;
      },
    });
    let t = 0;
    while (t < def.windup + 0.05) {
      yield 0;
      t += w.dt;
    }
    if (exploded) return;
  }
}

function* teleporter(e: Enemy, w: World): AI {
  const def = e.def!;
  const proj = def.proj!;
  yield w.rng.range(0.4, 1.0);
  for (;;) {
    yield def.cooldown * w.rng.range(0.8, 1.3);
    // Fade out
    e.invuln = true;
    for (let t = 0; t < 0.3; t += w.dt) {
      e.alpha = 1 - t / 0.3;
      yield 0;
    }
    const pt = w.randomOpenPoint(e.r, 150, w.player, def.range + 60);
    e.x = pt.x;
    e.y = pt.y;
    for (let t = 0; t < 0.25; t += w.dt) {
      e.alpha = t / 0.25;
      yield 0;
    }
    e.alpha = 1;
    e.invuln = false;
    telegraph(e, def.windup);
    yield def.windup;
    const a = toPlayer(e, w).a;
    if (def.pattern === 'ring') w.fireRing(e.x, e.y, proj.count, a, proj.speed, e.dmg, proj.r);
    else w.fireFan(e.x, e.y, a, proj.count, proj.spread, proj.speed, e.dmg, proj.r);
    w.sfx('enemyShot', 0.5);
    yield 0.5;
  }
}

function* summoner(e: Enemy, w: World): AI {
  const def = e.def!;
  yield w.rng.range(0.5, 1.2);
  for (;;) {
    let t = def.cooldown * w.rng.range(0.8, 1.1);
    while (t > 0) {
      const tp = toPlayer(e, w);
      if (tp.d < def.range) steer(e, w, tp.a + Math.PI + e.memo * 0.5, e.speed);
      else if (tp.d > def.range + 120) steer(e, w, tp.a, e.speed * 0.6);
      else stop(e);
      e.facing = tp.a;
      yield 0;
      t -= w.dt;
    }
    stop(e);
    const minions = w.enemies.filter((m) => !m.dead && m.owner === e).length;
    if (minions >= 3 || !def.summon) continue;
    telegraph(e, def.windup);
    yield def.windup;
    for (let i = 0; i < 2; i++) {
      const p = w.randomOpenPoint(14, 90, e, 90);
      w.queueSpawn(def.summon, p.x, p.y, { minion: true, owner: e, delay: 0.6 });
    }
    w.sfx('summon', 0.6);
  }
}

function* swarmer(e: Enemy, w: World): AI {
  let t = w.rng.range(0, 10);
  for (;;) {
    const tp = toPlayer(e, w);
    t += w.dt;
    const wobble = Math.sin(t * 3 + e.id) * 0.6;
    steer(e, w, tp.a + wobble, e.speed);
    yield 0;
  }
}

function* turret(e: Enemy, w: World): AI {
  const def = e.def!;
  const proj = def.proj!;
  yield w.rng.range(0.6, 1.4);
  let offset = 0;
  for (;;) {
    telegraph(e, def.windup);
    yield def.windup;
    if (def.pattern === 'spiral') {
      let a = toPlayer(e, w).a;
      for (let i = 0; i < 22; i++) {
        w.fireFan(e.x, e.y, a, 1, 0, proj.speed, e.dmg, proj.r);
        w.fireFan(e.x, e.y, a + Math.PI, 1, 0, proj.speed, e.dmg, proj.r);
        a += 0.32 * e.memo;
        e.facing = a;
        yield 0.1;
      }
    } else {
      w.fireRing(e.x, e.y, proj.count, offset, proj.speed, e.dmg, proj.r);
      offset += TAU / proj.count / 2;
      w.sfx('enemyShot', 0.5);
    }
    yield def.cooldown;
  }
}

export function createAI(e: Enemy, w: World): AI | null {
  if (!e.def) return null;
  switch (e.def.ai) {
    case 'chaser':
      return chaser(e, w);
    case 'charger':
      return charger(e, w);
    case 'shooter':
      return shooter(e, w);
    case 'bomber':
      return bomber(e, w);
    case 'teleporter':
      return teleporter(e, w);
    case 'summoner':
      return summoner(e, w);
    case 'swarmer':
      return swarmer(e, w);
    case 'turret':
      return turret(e, w);
  }
}
