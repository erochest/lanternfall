import { TAU } from '../core/math';
import { approach, steer, stop, telegraph, toPlayer, type AI } from './ai';
import type { Enemy, Hazard } from './entities';
import type { World } from './world';

// ------------------------------------------------------------------ helpers

function circle(w: World, e: Enemy, x: number, y: number, r: number, delay: number, dmg: number): Hazard {
  return w.addHazard({ shape: { kind: 'circle', x, y, r }, team: 'enemy', delay, dmg, owner: e });
}

function line(w: World, e: Enemy, x: number, y: number, angle: number, length: number, width: number, delay: number, dmg: number, harmless = false): Hazard {
  return w.addHazard({ shape: { kind: 'line', x, y, angle, length, width }, team: 'enemy', delay, dmg, owner: e, harmless });
}

function* wait(w: World, t: number): AI {
  for (let x = 0; x < t; x += w.dt) yield 0;
}

function* drift(e: Enemy, w: World, t: number, speedMult = 0.5): AI {
  for (let x = 0; x < t; x += w.dt) {
    const tp = toPlayer(e, w);
    if (tp.d > 140) steer(e, w, tp.a, e.speed * speedMult);
    else stop(e);
    yield 0;
  }
  stop(e);
}

function choose(w: World, options: [string, number][], last: string): string {
  const filtered = options.filter(([k]) => k !== last);
  return w.rng.weighted(filtered.length ? filtered : options, ([, wt]) => wt)[0];
}

function minionCount(w: World, e: Enemy): number {
  return w.enemies.filter((m) => !m.dead && m.owner === e).length;
}

function* charge(e: Enemy, w: World, angle: number, speed: number, maxT: number): AI {
  e.charging = { angle, t: maxT, speed, hit: false };
  w.sfx('charge', 0.7);
  while (e.charging) yield 0;
}

// ------------------------------------------------------- The Brine Matriarch

function* matriarch(e: Enemy, w: World): AI {
  let last = '';
  for (;;) {
    const p2 = e.phase >= 1;
    const pick = choose(w, [['sweep', 3], ['charge', 3], ['bubbles', 2], ['summon', p2 ? 1.5 : 1]], last);
    last = pick;
    if (pick === 'sweep') {
      yield* approach(e, w, 130, 2.2);
      for (let i = 0; i < (p2 ? 2 : 1); i++) {
        const a = toPlayer(e, w).a;
        e.facing = a;
        telegraph(e, 0.7);
        w.addHazard({ shape: { kind: 'arc', x: e.x, y: e.y, r: 170, angle: a, spread: 2.4 }, team: 'enemy', delay: 0.7, dmg: e.dmg, owner: e, followOwner: true });
        yield 0.7;
        e.vx += Math.cos(a) * 260;
        e.vy += Math.sin(a) * 260;
        w.shake(4);
        w.sfx('heavy', 0.6);
        yield 0.3;
      }
      yield 0.6;
    } else if (pick === 'charge') {
      const n = p2 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const a = toPlayer(e, w).a;
        e.facing = a;
        const delay = p2 ? 0.55 : 0.8;
        telegraph(e, delay);
        w.addHazard({ shape: { kind: 'line', x: e.x, y: e.y, angle: a, length: 760, width: e.r * 2 + 20 }, team: 'enemy', delay, harmless: true, owner: e, followOwner: true });
        yield delay;
        yield* charge(e, w, a, 820, 1.0);
        w.fireRing(e.x, e.y, 10, a, 150, e.dmg * 0.7, 9);
        yield p2 ? 0.25 : 0.6;
      }
      yield 0.7;
    } else if (pick === 'bubbles') {
      telegraph(e, 0.6);
      yield 0.6;
      const rings = p2 ? 3 : 2;
      for (let i = 0; i < rings; i++) {
        w.fireRing(e.x, e.y, 16, i * 0.2, 170, e.dmg * 0.8, 9);
        w.sfx('enemyShot', 0.6);
        yield 0.45;
      }
      yield 0.7;
    } else {
      if (minionCount(w, e) < 4) {
        telegraph(e, 0.6);
        yield 0.6;
        for (let i = 0; i < (p2 ? 3 : 2); i++) {
          const p = w.randomOpenPoint(16, 120, e, 160);
          w.queueSpawn('scuttler', p.x, p.y, { minion: true, owner: e, delay: 0.7 });
        }
        w.sfx('summon');
      }
      yield 0.6;
    }
    yield* drift(e, w, w.rng.range(0.5, 1.0), 0.6);
  }
}

// ------------------------------------------------------ The Drowned Archivist

function* blink(e: Enemy, w: World): AI {
  e.invuln = true;
  for (let t = 0; t < 0.35; t += w.dt) {
    e.alpha = 1 - t / 0.35;
    yield 0;
  }
  const p = w.randomOpenPoint(e.r, 240);
  e.x = p.x;
  e.y = p.y;
  for (let t = 0; t < 0.3; t += w.dt) {
    e.alpha = t / 0.3;
    yield 0;
  }
  e.alpha = 1;
  e.invuln = false;
}

function* archivist(e: Enemy, w: World): AI {
  let last = '';
  for (;;) {
    const p2 = e.phase >= 1;
    const pick = choose(w, [['spiral', 3], ['volley', 3], ['pools', 3], ['summon', p2 ? 2 : 0]], last);
    last = pick;
    if (pick === 'spiral') {
      telegraph(e, 0.6);
      yield 0.6;
      const arms = p2 ? 4 : 3;
      let a = toPlayer(e, w).a;
      const dir = w.rng.chance(0.5) ? 1 : -1;
      for (let i = 0; i < 36; i++) {
        for (let k = 0; k < arms; k++) {
          const ang = a + (k * TAU) / arms;
          w.fire({ x: e.x, y: e.y, vx: Math.cos(ang) * 175, vy: Math.sin(ang) * 175, team: 'enemy', dmg: e.dmg * 0.8, r: 8 });
        }
        a += 0.2 * dir;
        yield 0.09;
      }
      yield 0.6;
    } else if (pick === 'volley') {
      for (let i = 0; i < 3; i++) {
        telegraph(e, 0.35);
        yield 0.35;
        const a = toPlayer(e, w).a;
        w.fireFan(e.x, e.y, a, p2 ? 7 : 5, 0.8, 260, e.dmg, 8);
        w.sfx('enemyShot', 0.6);
        yield 0.3;
      }
      yield 0.5;
    } else if (pick === 'pools') {
      const n = p2 ? 7 : 5;
      telegraph(e, 0.4);
      for (let i = 0; i < n; i++) {
        const p = w.player;
        const off = i === 0 ? 0 : 110;
        const pt = w.clampToArena(p.x + w.rng.range(-off, off), p.y + w.rng.range(-off, off), 40);
        circle(w, e, pt.x, pt.y, 58, 0.95, e.dmg);
        yield 0.16;
      }
      yield 0.9;
    } else {
      if (minionCount(w, e) < 3) {
        telegraph(e, 0.6);
        yield 0.6;
        for (let i = 0; i < 2; i++) {
          const p = w.randomOpenPoint(16, 160);
          w.queueSpawn('inkwisp', p.x, p.y, { minion: true, owner: e, delay: 0.8 });
        }
        w.sfx('summon');
      }
      yield 0.4;
    }
    if (w.rng.chance(0.6)) yield* blink(e, w);
    else yield* wait(w, 0.4);
  }
}

// ----------------------------------------------------------- The Kiln Heart

function* kiln(e: Enemy, w: World): AI {
  let last = '';
  for (;;) {
    const ph = e.phase;
    const pick = choose(w, [['arms', 3], ['shock', 2.5], ['erupt', 2.5], ['summon', 1.2]], last);
    last = pick;
    if (pick === 'arms') {
      const arms = ph >= 2 ? 5 : ph >= 1 ? 4 : 3;
      const dir = w.rng.chance(0.5) ? 1 : -1;
      let a = toPlayer(e, w).a + Math.PI / arms;
      telegraph(e, 0.8);
      // Show where each arm starts.
      for (let k = 0; k < arms; k++) line(w, e, e.x, e.y, a + (k * TAU) / arms, 260, 14, 0.8, 0, true);
      yield 0.8;
      let fireT = 0;
      let eruptT = 1;
      for (let t = 0; t < 3.6; t += w.dt) {
        a += dir * 0.85 * w.dt;
        fireT -= w.dt;
        if (fireT <= 0) {
          fireT = 0.09;
          for (let k = 0; k < arms; k++) {
            const ang = a + (k * TAU) / arms;
            w.fire({ x: e.x + Math.cos(ang) * e.r, y: e.y + Math.sin(ang) * e.r, vx: Math.cos(ang) * 230, vy: Math.sin(ang) * 230, team: 'enemy', dmg: e.dmg * 0.7, r: 8, color: '#ff8a3d' });
          }
        }
        if (ph >= 1) {
          eruptT -= w.dt;
          if (eruptT <= 0) {
            eruptT = 1.1;
            circle(w, e, w.player.x, w.player.y, 52, 0.9, e.dmg);
          }
        }
        yield 0;
      }
      yield 0.8;
    } else if (pick === 'shock') {
      const n = ph >= 1 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        telegraph(e, 0.6);
        yield 0.6;
        w.addHazard({ shape: { kind: 'ring', x: e.x, y: e.y, r: e.r, thickness: 28 }, team: 'enemy', dmg: e.dmg, grow: 250, maxR: 1000, owner: e, visual: 'shock', color: '#ff8a3d' });
        w.shake(6);
        w.sfx('heavy', 0.8);
        yield 0.8;
      }
      yield 0.8;
    } else if (pick === 'erupt') {
      telegraph(e, 0.5);
      const n = 6 + ph * 2;
      for (let i = 0; i < n; i++) {
        const p = w.player;
        const off = i === 0 ? 0 : 220;
        const pt = w.clampToArena(p.x + w.rng.range(-off, off), p.y + w.rng.range(-off, off), 40);
        circle(w, e, pt.x, pt.y, 54, 1.0, e.dmg);
        yield 0.08;
      }
      yield 1.2;
    } else {
      if (minionCount(w, e) < 5) {
        telegraph(e, 0.6);
        yield 0.6;
        for (let i = 0; i < 3; i++) {
          const p = w.randomOpenPoint(14, 160, e, 220);
          w.queueSpawn('cinderpuff', p.x, p.y, { minion: true, owner: e, delay: 0.7 });
        }
        w.sfx('summon');
      }
      yield 0.8;
    }
    yield* wait(w, 0.3);
  }
}

// ----------------------------------------------------------------- The Maw

function* maw(e: Enemy, w: World): AI {
  let last = '';
  for (;;) {
    const ph = e.phase;
    const pick = choose(
      w,
      [['bite', 3], ['tentacles', 3], ['abyss', 2.5], ['gaze', ph >= 1 ? 2.5 : 0], ['summon', 1.2]],
      last,
    );
    last = pick;
    if (pick === 'bite') {
      const n = ph >= 2 ? 3 : ph >= 1 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a = toPlayer(e, w).a;
        e.facing = a;
        const delay = i === 0 ? 0.75 : 0.5;
        telegraph(e, delay);
        w.addHazard({ shape: { kind: 'line', x: e.x, y: e.y, angle: a, length: 600, width: e.r * 2 }, team: 'enemy', delay, harmless: true, owner: e, followOwner: true });
        yield delay;
        yield* charge(e, w, a, 960, 0.65);
        yield 0.25;
      }
      yield 0.6;
    } else if (pick === 'tentacles') {
      const n = 3 + ph;
      telegraph(e, 0.4);
      for (let i = 0; i < n; i++) {
        const p = w.player;
        const a = w.rng.range(0, Math.PI);
        const cx = p.x + w.rng.range(-70, 70);
        const cy = p.y + w.rng.range(-70, 70);
        line(w, e, cx - Math.cos(a) * 600, cy - Math.sin(a) * 600, a, 1200, 46, 1.0, e.dmg);
        yield 0.14;
      }
      yield 1.1;
    } else if (pick === 'abyss') {
      telegraph(e, 0.6);
      yield 0.6;
      w.fireRing(e.x, e.y, 20, 0, 180, e.dmg * 0.8, 9);
      yield 0.35;
      w.fireRing(e.x, e.y, 20, TAU / 40, 180, e.dmg * 0.8, 9);
      if (ph >= 1) {
        let a = 0;
        for (let i = 0; i < 24; i++) {
          w.fire({ x: e.x, y: e.y, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, team: 'enemy', dmg: e.dmg * 0.7, r: 8 });
          w.fire({ x: e.x, y: e.y, vx: -Math.cos(a) * 210, vy: -Math.sin(a) * 210, team: 'enemy', dmg: e.dmg * 0.7, r: 8 });
          a += 0.26;
          yield 0.08;
        }
      }
      yield 0.8;
    } else if (pick === 'gaze') {
      const dir = w.rng.chance(0.5) ? 1 : -1;
      const start = toPlayer(e, w).a - dir * 1.1;
      telegraph(e, 0.9);
      const beam = w.addHazard({
        shape: { kind: 'line', x: e.x, y: e.y, angle: start, length: 900, width: 34 },
        team: 'enemy',
        delay: 0.9,
        dmg: e.dmg,
        duration: 2.2,
        tickEvery: 0.5,
        owner: e,
        followOwner: true,
        visual: 'gloom',
        color: '#d9a6ff',
      });
      beam.onUpdate = (dt) => {
        if (beam.t > beam.delay && beam.shape.kind === 'line') beam.shape.angle += dir * 1.05 * dt;
      };
      yield 3.1;
      yield 0.5;
    } else {
      if (minionCount(w, e) < 4) {
        telegraph(e, 0.6);
        yield 0.6;
        const kind = w.rng.chance(0.5) ? 'hound' : 'leech';
        const n = kind === 'hound' ? 2 : 3;
        for (let i = 0; i < n; i++) {
          const p = w.randomOpenPoint(16, 180);
          w.queueSpawn(kind, p.x, p.y, { minion: true, owner: e, delay: 0.8 });
        }
        w.sfx('summon');
      }
      yield 0.5;
    }
    yield* drift(e, w, w.rng.range(0.4, 0.9), 0.5);
  }
}

const PATTERNS: Record<string, (e: Enemy, w: World) => AI> = { matriarch, archivist, kiln, maw };

/**
 * Wraps a boss pattern so HP thresholds interrupt whatever it is doing and
 * restart it in the next phase.
 */
function* bossMain(e: Enemy, w: World): AI {
  const def = e.boss!;
  const make = PATTERNS[def.id];
  yield 0.8;
  let gen = make(e, w);
  for (;;) {
    const threshold = def.phases[e.phase];
    if (threshold !== undefined && e.hp / e.maxHp <= threshold) {
      e.phase++;
      for (const h of w.hazards) if (h.owner === e) h.done = true;
      e.charging = null;
      stop(e);
      e.invuln = true;
      e.alpha = 1;
      w.emit({ type: 'bossPhase' });
      w.sfx('roar');
      w.shake(12);
      w.text(e.x, e.y - e.r - 20, 'ENRAGED', '#ff6a6a', 18);
      // Push the player back so the transition is a breather, not a trap.
      const tp = toPlayer(e, w);
      if (tp.d < 220) {
        w.player.vx += Math.cos(tp.a) * 700;
        w.player.vy += Math.sin(tp.a) * 700;
      }
      w.addHazard({ shape: { kind: 'ring', x: e.x, y: e.y, r: e.r, thickness: 20 }, team: 'enemy', harmless: true, grow: 600, maxR: 400, visual: 'shock', color: def.accent });
      telegraph(e, 1.2);
      yield* wait(w, 1.2);
      e.invuln = false;
      gen = make(e, w);
    }
    const r = gen.next();
    if (r.done) gen = make(e, w);
    else yield r.value;
  }
}

export function createBossAI(e: Enemy, w: World): AI {
  return bossMain(e, w);
}
