import { angleDiff, len } from '../core/math';
import { CURRENT_INFO } from '../data/glyphs';
import type { AttackStep } from '../data/gear';
import { hitEnemy, strike } from './combat';
import type { Controls, Player, PlayerAction } from './entities';
import type { World } from './world';

export const DASH_TIME = 0.16;
export const DASH_SPEED = 880;
export const FLARE_RADIUS = 76;
export const FLARE_DAMAGE = 30;

/**
 * Pick an attack direction. Explicit aim wins; otherwise aim-assist snaps to
 * the best enemy roughly in the direction the player is moving or facing.
 */
export function resolveAim(w: World, c: Controls, range: number): number {
  const p = w.player;
  if (c.aimActive && (c.aimX !== 0 || c.aimY !== 0)) return Math.atan2(c.aimY, c.aimX);
  const moving = len(c.moveX, c.moveY) > 0.2;
  const ref = moving ? Math.atan2(c.moveY, c.moveX) : p.facing;
  const assist = w.cfg.aimAssist;
  if (assist <= 0) return ref;
  const cone = moving ? 0.6 + 0.9 * assist : Math.PI;
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (const e of w.targetable()) {
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy) - e.r;
    if (d > range) continue;
    const diff = Math.abs(angleDiff(ref, Math.atan2(dy, dx)));
    if (diff > cone) continue;
    const score = d * (1 + diff * 1.2);
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best ? Math.atan2(best.y - p.y, best.x - p.x) : ref;
}

function consumeShade(p: Player): boolean {
  if (p.shadeT > 0) {
    p.shadeT = 0;
    return true;
  }
  return false;
}

function startAttack(w: World, p: Player, c: Controls): void {
  const wp = w.weapon;
  const dashAttack = p.postDash > 0;
  if (p.comboT > 0.5) p.combo = 0;
  const step = dashAttack ? wp.dashAttack : wp.combo[p.combo % wp.combo.length];
  p.combo = dashAttack ? 0 : (p.combo + 1) % wp.combo.length;
  const as = w.stats.attackSpeed;
  const range = step.shape === 'bolt' ? wp.assistRange : step.range + wp.assistRange * 0.6;
  const dir = resolveAim(w, c, range);
  p.action = {
    kind: 'attack',
    step,
    special: null,
    t: 0,
    windup: step.windup / as,
    active: step.active / as,
    recovery: step.recovery / as,
    dir,
    fired: false,
    dashAttack,
    moveMult: step.moveMult,
  };
  p.facing = dir;
  p.attackBuffer = 0;
  p.postDash = 0;
}

function startSpecial(w: World, p: Player, c: Controls): void {
  const sp = w.weapon.special;
  const range = sp.kind === 'harpoon' ? sp.range * 0.8 : sp.range + 140;
  const dir = resolveAim(w, c, range);
  p.action = {
    kind: 'special',
    step: null,
    special: sp,
    t: 0,
    windup: sp.windup,
    active: 0.12,
    recovery: sp.recovery,
    dir,
    fired: false,
    dashAttack: false,
    moveMult: 0.25,
  };
  p.facing = dir;
  p.specialBuffer = 0;
  p.specialCd = p.specialCdMax;
}

function fireAttack(w: World, p: Player, a: PlayerAction, step: AttackStep): void {
  const wp = w.weapon;
  const forceCrit = consumeShade(p);
  const dir = a.dir;
  const cos = Math.cos(dir);
  const sin = Math.sin(dir);
  const color = wp.color;
  switch (step.shape) {
    case 'arc':
      w.addHazard({
        shape: { kind: 'arc', x: p.x, y: p.y, r: step.range, angle: dir, spread: step.spread ?? 2 },
        team: 'player',
        dmg: step.damage,
        duration: a.active,
        followPlayer: true,
        slot: 'attack',
        knock: step.knock,
        forceCrit,
      });
      w.slash({ x: p.x, y: p.y, r: step.range, angle: dir, spread: step.spread ?? 2, life: 0.16, color, kind: 'arc', width: 18, followPlayer: true });
      break;
    case 'thrust':
      w.addHazard({
        shape: { kind: 'line', x: p.x - cos * 8, y: p.y - sin * 8, angle: dir, length: step.range + 8, width: step.width ?? 30 },
        team: 'player',
        dmg: step.damage,
        duration: a.active,
        slot: 'attack',
        knock: step.knock,
        forceCrit,
        onUpdate: null,
      });
      w.slash({ x: p.x, y: p.y, r: step.range, angle: dir, spread: 0, life: 0.14, color, kind: 'thrust', width: step.width ?? 30, followPlayer: true });
      break;
    case 'slam': {
      const off = step.offset ?? 40;
      const x = p.x + cos * off;
      const y = p.y + sin * off;
      w.addHazard({
        shape: { kind: 'circle', x, y, r: step.range },
        team: 'player',
        dmg: step.damage,
        duration: a.active,
        slot: 'attack',
        knock: step.knock,
        forceCrit,
      });
      w.slash({ x, y, r: step.range, angle: 0, spread: 0, life: 0.25, color, kind: 'ring', width: 14, followPlayer: false });
      w.burst(x, y, color, 12, 200, 3, 0.4);
      w.shake(4);
      break;
    }
    case 'bolt': {
      const speed = step.projSpeed ?? 700;
      w.fire({
        x: p.x + cos * 18,
        y: p.y + sin * 18,
        vx: cos * speed,
        vy: sin * speed,
        team: 'player',
        dmg: step.damage,
        r: (step.width ?? 12) / 2,
        life: step.range / speed,
        pierce: step.pierce ?? 0,
        color,
        slot: 'attack',
        knock: step.knock,
        kind: 'bolt',
        forceCrit,
      });
      break;
    }
  }
  if (step.lunge > 0) {
    p.vx += cos * step.lunge * 14;
    p.vy += sin * step.lunge * 14;
  }
  w.sfx(step.shape === 'bolt' ? 'shoot' : step.damage >= 30 ? 'heavy' : 'swing', 0.7);
}

function fireSpecial(w: World, p: Player, a: PlayerAction): void {
  const sp = a.special;
  if (!sp) return;
  const wp = w.weapon;
  const forceCrit = consumeShade(p);
  const dir = a.dir;
  const cos = Math.cos(dir);
  const sin = Math.sin(dir);
  switch (sp.kind) {
    case 'whirl':
      w.addHazard({
        shape: { kind: 'circle', x: p.x, y: p.y, r: sp.range },
        team: 'player',
        dmg: sp.damage,
        duration: 0.16,
        followPlayer: true,
        slot: 'special',
        knock: sp.knock,
        forceCrit,
      });
      w.slash({ x: p.x, y: p.y, r: sp.range, angle: dir, spread: Math.PI * 2, life: 0.26, color: wp.color, kind: 'arc', width: 26, followPlayer: true });
      break;
    case 'harpoon':
      w.fire({
        x: p.x + cos * 20,
        y: p.y + sin * 20,
        vx: cos * 950,
        vy: sin * 950,
        team: 'player',
        dmg: sp.damage,
        r: 13,
        life: sp.range / 950,
        pierce: 99,
        color: wp.color,
        slot: 'special',
        knock: sp.knock,
        kind: 'harpoon',
        forceCrit,
      });
      break;
    case 'burst':
      w.addHazard({
        shape: { kind: 'arc', x: p.x, y: p.y, r: sp.range, angle: dir, spread: 1.5 },
        team: 'player',
        dmg: sp.damage,
        duration: 0.1,
        slot: 'special',
        knock: sp.knock,
        forceCrit,
      });
      w.slash({ x: p.x, y: p.y, r: sp.range, angle: dir, spread: 1.5, life: 0.22, color: wp.color, kind: 'cone', width: 0, followPlayer: false });
      break;
    case 'shockwave':
      w.addHazard({
        shape: { kind: 'ring', x: p.x, y: p.y, r: 20, thickness: 36 },
        team: 'player',
        dmg: sp.damage,
        grow: 620,
        maxR: sp.range,
        slot: 'special',
        knock: sp.knock,
        forceCrit,
        visual: 'shock',
        color: wp.color,
      });
      w.shake(6);
      break;
  }
  if (w.mods.waveOnSpecial > 0) {
    w.fire({
      x: p.x + cos * 20,
      y: p.y + sin * 20,
      vx: cos * 560,
      vy: sin * 560,
      team: 'player',
      dmg: w.mods.waveOnSpecial,
      r: 26,
      life: 0.75,
      pierce: 99,
      color: CURRENT_INFO.tide.color,
      knock: 520,
      kind: 'wave',
      ghost: true,
    });
  }
  w.sfx('special');
}

function throwFlare(w: World, p: Player, c: Controls): void {
  const dir = resolveAim(w, c, 320);
  // Land on the enemy nearest the aim ray, or a fixed distance ahead.
  let tx = p.x + Math.cos(dir) * 170;
  let ty = p.y + Math.sin(dir) * 170;
  let best = Infinity;
  for (const e of w.targetable()) {
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 330) continue;
    const off = Math.abs(angleDiff(dir, Math.atan2(dy, dx)));
    if (off > 0.45) continue;
    if (d * (1 + off) < best) {
      best = d * (1 + off);
      tx = e.x;
      ty = e.y;
    }
  }
  const pt = w.clampToArena(tx, ty, 20);
  p.flareCharges -= 1;
  p.flareBuffer = 0;
  w.sfx('throw', 0.6);
  const m = w.mods;
  w.lobs.push({
    x0: p.x,
    y0: p.y,
    x1: pt.x,
    y1: pt.y,
    t: 0,
    dur: 0.32,
    color: '#ffe9a8',
    onLand: () => {
      const detonate = (): void => {
        w.addHazard({
          shape: { kind: 'circle', x: pt.x, y: pt.y, r: FLARE_RADIUS },
          team: 'player',
          dmg: FLARE_DAMAGE,
          slot: 'flare',
          knock: 220,
          visual: 'none',
        });
        w.slash({ x: pt.x, y: pt.y, r: FLARE_RADIUS, angle: 0, spread: 0, life: 0.3, color: '#ffe9a8', kind: 'ring', width: 14, followPlayer: false });
        w.burst(pt.x, pt.y, '#ffd27a', 22, 260, 3.5, 0.5);
        w.sfx('boom', 0.8);
        w.shake(5);
        if (m.flarePool > 0) {
          w.addHazard({
            shape: { kind: 'circle', x: pt.x, y: pt.y, r: 70 },
            team: 'player',
            dmg: 3,
            duration: 3,
            tickEvery: 0.4,
            burn: m.flarePool,
            visual: 'fire',
            color: CURRENT_INFO.ember.color,
          });
        }
        if (m.flareStorm > 0) {
          let zapT = 0;
          w.addHazard({
            shape: { kind: 'circle', x: pt.x, y: pt.y, r: 170 },
            team: 'player',
            harmless: true,
            duration: 3,
            visual: 'storm',
            color: CURRENT_INFO.storm.color,
            onUpdate: (dt) => {
              zapT -= dt;
              if (zapT > 0) return;
              zapT = 0.42;
              const e = w.nearestEnemy(pt.x, pt.y, 170);
              if (e) strike(w, e, m.flareStorm);
            },
          });
        }
      };
      if (m.flarePull) {
        for (const e of w.living()) {
          const d = Math.hypot(e.x - pt.x, e.y - pt.y);
          if (d < 180 && d > 10 && !e.boss && e.armor <= 0) {
            const a = Math.atan2(pt.y - e.y, pt.x - e.x);
            e.vx += Math.cos(a) * Math.min(520, d * 4);
            e.vy += Math.sin(a) * Math.min(520, d * 4);
          }
        }
        w.slash({ x: pt.x, y: pt.y, r: 180, angle: 0, spread: 0, life: 0.2, color: CURRENT_INFO.tide.color, kind: 'ring', width: 6, followPlayer: false });
        w.schedule(0.18, detonate);
      } else {
        detonate();
      }
    },
  });
}

function startDash(w: World, p: Player, c: Controls): void {
  const moving = len(c.moveX, c.moveY) > 0.2;
  const dir = moving ? Math.atan2(c.moveY, c.moveX) : p.facing;
  p.dashing = DASH_TIME;
  p.dashDir = dir;
  p.dashCharges -= 1;
  p.iframes = Math.max(p.iframes, DASH_TIME + 0.06);
  p.action = null;
  p.dashBuffer = 0;
  p.dashHit.clear();
  p.dashTrailX = p.x;
  p.dashTrailY = p.y;
  p.facing = dir;
  const m = w.mods;
  if (m.dashBolt > 0) {
    w.addHazard({ shape: { kind: 'circle', x: p.x, y: p.y, r: 74 }, team: 'player', dmg: m.dashBolt, slot: 'dash' });
    w.bolt([{ x: p.x, y: p.y - 200 }, { x: p.x, y: p.y }], CURRENT_INFO.storm.color);
    w.slash({ x: p.x, y: p.y, r: 74, angle: 0, spread: 0, life: 0.22, color: CURRENT_INFO.storm.color, kind: 'ring', width: 8, followPlayer: false });
    w.sfx('zap', 0.6);
  }
  if (m.dashShade) p.shadeT = 1.0;
  w.sfx('dash', 0.7);
}

function updateDash(w: World, p: Player, dt: number): void {
  const m = w.mods;
  p.dashing -= dt;
  const cos = Math.cos(p.dashDir);
  const sin = Math.sin(p.dashDir);
  p.x += cos * DASH_SPEED * dt;
  p.y += sin * DASH_SPEED * dt;
  w.collide(p, p.r);
  w.particle({ x: p.x, y: p.y, color: '#bfefff', size: p.r * 0.9, life: 0.18, drag: 0, kind: 'ring', additive: true });

  if (m.dashFireTrail > 0 && Math.hypot(p.x - p.dashTrailX, p.y - p.dashTrailY) > 30) {
    p.dashTrailX = p.x;
    p.dashTrailY = p.y;
    w.addHazard({
      shape: { kind: 'circle', x: p.x, y: p.y, r: 26 },
      team: 'player',
      dmg: m.dashFireTrail,
      duration: 2,
      tickEvery: 0.35,
      burn: m.dashFireBurn,
      slot: null,
      visual: 'fire',
      color: CURRENT_INFO.ember.color,
    });
  }
  if (m.dashRiptide > 0) {
    for (const e of w.targetable()) {
      if (p.dashHit.has(e.id)) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r + 12) {
        p.dashHit.add(e.id);
        const side = angleDiff(p.dashDir, Math.atan2(e.y - p.y, e.x - p.x)) > 0 ? 1 : -1;
        hitEnemy(w, e, m.dashRiptide, { slot: 'dash', dir: p.dashDir + (side * Math.PI) / 2, knock: 380 });
      }
    }
  }
  if (p.dashing <= 0) {
    p.dashing = 0;
    p.postDash = 0.24;
    if (m.dashNova > 0) {
      w.addHazard({ shape: { kind: 'circle', x: p.x, y: p.y, r: 86 }, team: 'player', dmg: m.dashNova, chill: m.dashNovaChill, slot: 'dash' });
      w.slash({ x: p.x, y: p.y, r: 86, angle: 0, spread: 0, life: 0.3, color: CURRENT_INFO.frost.color, kind: 'ring', width: 10, followPlayer: false });
      w.burst(p.x, p.y, CURRENT_INFO.frost.color, 14, 220, 3, 0.4, 'shard');
    }
  }
}

export function updatePlayer(w: World, dt: number, c: Controls): void {
  const p = w.player;
  const st = w.stats;

  if (p.iframes > 0) p.iframes -= dt;
  if (p.flash > 0) p.flash -= dt;
  if (p.postDash > 0) p.postDash -= dt;
  if (p.shadeT > 0) p.shadeT -= dt;
  if (p.specialCd > 0) p.specialCd -= dt;
  p.comboT += dt;
  p.attackBuffer -= dt;
  p.specialBuffer -= dt;
  p.dashBuffer -= dt;
  p.flareBuffer -= dt;

  if (p.flareCharges < st.flareCharges) {
    p.flareT += dt;
    if (p.flareT >= st.flareRecharge) {
      p.flareCharges++;
      p.flareT = 0;
    }
  }
  if (p.dashCharges < st.dashCharges) {
    p.dashRechargeT += dt;
    if (p.dashRechargeT >= st.dashRecharge) {
      p.dashCharges++;
      p.dashRechargeT = 0;
    }
  }

  const impulseDecay = Math.exp(-14 * dt);
  if (p.down || w.state === 'leaving') {
    p.vx *= impulseDecay;
    p.vy *= impulseDecay;
    p.moving = false;
    return;
  }

  if (c.attackPressed) p.attackBuffer = 0.22;
  if (c.specialPressed) p.specialBuffer = 0.25;
  if (c.dashPressed) p.dashBuffer = 0.15;
  if (c.flarePressed) p.flareBuffer = 0.2;
  if (c.attack) p.attackBuffer = Math.max(p.attackBuffer, 0.02);

  const mlen = Math.min(1, len(c.moveX, c.moveY));
  const deadzone = 0.15;
  p.moving = mlen > deadzone;
  const mx = p.moving ? (c.moveX / Math.max(1e-6, len(c.moveX, c.moveY))) * mlen : 0;
  const my = p.moving ? (c.moveY / Math.max(1e-6, len(c.moveX, c.moveY))) * mlen : 0;

  if (p.dashBuffer > 0 && p.dashing <= 0 && p.dashCharges >= 1) startDash(w, p, c);

  if (p.dashing > 0) {
    updateDash(w, p, dt);
    return;
  }

  // Actions
  const a = p.action;
  if (a) {
    a.t += dt;
    if (!a.fired && a.t >= a.windup) {
      a.fired = true;
      if (a.kind === 'attack' && a.step) fireAttack(w, p, a, a.step);
      else fireSpecial(w, p, a);
    }
    const end = a.windup + a.active + a.recovery;
    const cancelable = a.fired && a.t >= a.windup + a.active + a.recovery * 0.4;
    if (a.t >= end) {
      p.action = null;
      p.comboT = 0;
    } else if (cancelable && p.specialBuffer > 0 && p.specialCd <= 0) {
      p.action = null;
    } else if (cancelable && a.kind === 'attack' && p.attackBuffer > 0) {
      p.action = null;
      p.comboT = 0;
    }
  }
  if (!p.action) {
    if (p.specialBuffer > 0 && p.specialCd <= 0) startSpecial(w, p, c);
    else if (p.attackBuffer > 0) startAttack(w, p, c);
  }
  if (p.flareBuffer > 0 && p.flareCharges >= 1 && (!p.action || p.action.fired)) throwFlare(w, p, c);

  // Movement
  const speed = st.moveSpeed * (p.action ? p.action.moveMult : 1);
  p.x += (mx * speed + p.vx) * dt;
  p.y += (my * speed + p.vy) * dt;
  w.collide(p, p.r);
  p.vx *= impulseDecay;
  p.vy *= impulseDecay;

  if (p.action) p.facing = p.action.dir;
  else if (p.moving) p.facing = Math.atan2(my, mx);
  if (p.moving) p.walk += dt * speed * 0.05;
}
