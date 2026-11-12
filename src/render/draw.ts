import { TAU } from '../core/math';
import type { Enemy, Player } from '../game/entities';
import type { World } from '../game/world';
import { drawGlow, glowSprite, haloSprite, hexA, shade } from './glow';

type Ctx = CanvasRenderingContext2D;

const LANTERN = '#ffd27a';

export function drawShadow(ctx: Ctx, x: number, y: number, r: number, alpha = 0.35): void {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.55, r * 1.05, r * 0.45, 0, 0, TAU);
  ctx.fill();
}

// ------------------------------------------------------------------ player

export function drawPlayer(ctx: Ctx, w: World, p: Player, time: number): void {
  const flicker = p.iframes > 0 && p.iframes < 0.85 && !p.dashing && Math.floor(time * 20) % 2 === 0;
  if (p.down) ctx.globalAlpha = 0.5;
  else if (flicker) ctx.globalAlpha = 0.45;

  drawShadow(ctx, p.x, p.y, p.r);
  const f = p.facing;
  const bob = p.moving ? Math.sin(p.walk) * 1.5 : 0;

  ctx.save();
  ctx.translate(p.x, p.y + bob * 0.3);

  // Weapon (drawn behind body when facing up)
  const weaponColor = w.weapon.color;
  const drawWeapon = (): void => {
    ctx.save();
    ctx.rotate(f);
    ctx.strokeStyle = weaponColor;
    ctx.lineCap = 'round';
    const a = p.action;
    const swing = a && a.kind === 'attack' && a.fired ? Math.min(1, (a.t - a.windup) / Math.max(0.01, a.active)) : 0;
    switch (w.weapon.id) {
      case 'cutlass':
        ctx.lineWidth = 3.5;
        ctx.rotate(-0.9 + swing * 1.8);
        ctx.beginPath();
        ctx.moveTo(8, 6);
        ctx.quadraticCurveTo(22, 10, 30, 2);
        ctx.stroke();
        break;
      case 'harpoon':
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-10, 8);
        ctx.lineTo(30 + swing * 10, 8);
        ctx.stroke();
        ctx.fillStyle = weaponColor;
        ctx.beginPath();
        ctx.moveTo(36 + swing * 10, 8);
        ctx.lineTo(27 + swing * 10, 3);
        ctx.lineTo(27 + swing * 10, 13);
        ctx.fill();
        break;
      case 'staff':
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-6, 9);
        ctx.lineTo(24, 9);
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, glowSprite(weaponColor), 26, 9, 12 + (a ? 6 : 0), 0.9);
        ctx.globalCompositeOperation = 'source-over';
        break;
      case 'anchor':
        ctx.lineWidth = 4;
        ctx.rotate(-0.6 + swing * 1.4);
        ctx.beginPath();
        ctx.moveTo(6, 6);
        ctx.lineTo(28, 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(30, 6, 8, -1.6, 1.6);
        ctx.stroke();
        break;
    }
    ctx.restore();
  };
  if (Math.sin(f) < 0) drawWeapon();

  // Cloak
  const cloak = '#26485a';
  ctx.save();
  ctx.rotate(f + Math.PI / 2);
  ctx.fillStyle = p.flash > 0 ? '#ffffff' : cloak;
  ctx.beginPath();
  ctx.moveTo(0, -p.r * 1.05);
  ctx.quadraticCurveTo(p.r * 1.25, p.r * 0.2, p.r * 0.8, p.r * 1.0);
  ctx.quadraticCurveTo(0, p.r * 1.3, -p.r * 0.8, p.r * 1.0);
  ctx.quadraticCurveTo(-p.r * 1.25, p.r * 0.2, 0, -p.r * 1.05);
  ctx.fill();
  ctx.strokeStyle = '#7fc9d6';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Hood / head
  ctx.fillStyle = p.flash > 0 ? '#ffffff' : '#1a2f3b';
  ctx.beginPath();
  ctx.arc(Math.cos(f) * 3, Math.sin(f) * 3 - 3, p.r * 0.62, 0, TAU);
  ctx.fill();
  // Face glint
  ctx.fillStyle = '#ffe9b8';
  ctx.beginPath();
  ctx.arc(Math.cos(f) * 7, Math.sin(f) * 7 - 3, 2.2, 0, TAU);
  ctx.fill();

  if (Math.sin(f) >= 0) drawWeapon();

  // Lantern, held on the side opposite the weapon.
  const la = f - Math.PI / 2;
  const lx = Math.cos(la) * (p.r + 2);
  const ly = Math.sin(la) * (p.r + 2) + 4;
  ctx.fillStyle = '#3a2a14';
  ctx.fillRect(lx - 3.5, ly - 4.5, 7, 9);
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 1 + Math.sin(time * 6) * 0.08;
  drawGlow(ctx, glowSprite(LANTERN), lx, ly, 16 * pulse, 0.9);
  ctx.globalCompositeOperation = 'source-over';

  ctx.restore();

  // Shield indicator
  if (p.shield > 0) {
    ctx.strokeStyle = 'rgba(156,200,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 8 + Math.sin(time * 4), 0, TAU);
    ctx.stroke();
  }
  if (p.shadeT > 0) {
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, haloSprite('#b77bff'), p.x, p.y, 34, 0.8);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ enemies

export function drawEnemy(ctx: Ctx, w: World, e: Enemy, time: number): void {
  const def = e.def;
  const boss = e.boss;
  const color = def?.color ?? boss?.color ?? '#fff';
  const accent = def?.accent ?? boss?.accent ?? '#fff';
  const spawnScale = e.spawnT > 0 ? 1 - e.spawnT / 0.35 : 1;
  const scale = Math.max(0.05, Math.min(1, spawnScale));
  const r = e.r;

  ctx.globalAlpha = e.alpha * (e.spawnT > 0 ? scale : 1);
  drawShadow(ctx, e.x, e.y, r * scale);

  // Wind-up glow: the universal "something is coming" tell.
  if (e.windup > 0 && e.windupMax > 0) {
    const k = 1 - e.windup / e.windupMax;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, haloSprite('#ff4d4d'), e.x, e.y, r * (1.6 + k * 1.2), 0.5 + k * 0.5);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (e.elite) {
    ctx.strokeStyle = hexA('#ffd76a', 0.75);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 6 + Math.sin(time * 5) * 1.5, 0, TAU);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(scale, scale);
  const fill = e.flash > 0 ? '#ffffff' : e.freeze > 0 ? '#bdefff' : color;
  const acc = e.flash > 0 ? '#ffffff' : accent;
  const shape = def?.shape ?? 'boss';
  switch (shape) {
    case 'crab':
      drawCrab(ctx, r, e.facing, fill, acc, e.anim, e.mx !== 0 || e.my !== 0);
      break;
    case 'jelly':
      drawJelly(ctx, r, fill, acc, e.anim);
      break;
    case 'spitter':
      drawSpitter(ctx, r, e.facing, fill, acc);
      break;
    case 'wisp':
      drawWisp(ctx, r, fill, acc, e.anim);
      break;
    case 'tome':
      drawTome(ctx, r, e.facing, fill, acc);
      break;
    case 'moth':
      drawMoth(ctx, r, e.facing, fill, acc, e.anim);
      break;
    case 'sentry':
      drawSentry(ctx, r, fill, acc, e.facing);
      break;
    case 'puff':
      drawPuff(ctx, r, fill, acc, e.anim, e.windup > 0 ? 1 - e.windup / Math.max(0.01, e.windupMax) : 0);
      break;
    case 'lancer':
      drawLancer(ctx, r, e.facing, fill, acc);
      break;
    case 'priest':
      drawPriest(ctx, r, fill, acc, e.anim);
      break;
    case 'eye':
      drawEye(ctx, r, fill, acc, Math.atan2(w.player.y - e.y, w.player.x - e.x));
      break;
    case 'hound':
      drawHound(ctx, r, e.facing, fill, acc, e.anim);
      break;
    case 'leech':
      drawLeech(ctx, r, e.facing, fill, acc, e.anim);
      break;
    case 'boss':
      drawBoss(ctx, w, e, fill, acc, time);
      break;
  }
  ctx.restore();

  // Frozen block
  if (e.freeze > 0) {
    ctx.fillStyle = 'rgba(190,240,255,0.35)';
    ctx.strokeStyle = 'rgba(230,250,255,0.85)';
    ctx.lineWidth = 1.5;
    const s = r * 1.25;
    ctx.beginPath();
    ctx.moveTo(e.x - s, e.y - s * 0.6);
    ctx.lineTo(e.x - s * 0.4, e.y - s);
    ctx.lineTo(e.x + s, e.y - s * 0.7);
    ctx.lineTo(e.x + s * 0.8, e.y + s * 0.8);
    ctx.lineTo(e.x - s * 0.7, e.y + s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (e.chill > 0) {
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, haloSprite('#8fe8ff'), e.x, e.y, r * 1.5, Math.min(0.8, e.chill * 0.18));
    ctx.globalCompositeOperation = 'source-over';
  }
  if (e.burn > 0) {
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, haloSprite('#ff8a3d'), e.x, e.y - 2, r * (1.3 + Math.sin(time * 18 + e.id) * 0.1), Math.min(0.9, 0.3 + e.burn * 0.08));
    ctx.globalCompositeOperation = 'source-over';
  }
  if (e.stun > 0) {
    ctx.fillStyle = '#ffe45c';
    for (let i = 0; i < 3; i++) {
      const a = time * 5 + (i * TAU) / 3;
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(a) * r * 0.8, e.y - r - 6 + Math.sin(a) * 3, 2.5, 0, TAU);
      ctx.fill();
    }
  }

  // Health bar (regular enemies only, once damaged)
  if (!boss && (e.hp < e.maxHp || e.armor < e.maxArmor) && e.spawnT <= 0) {
    const bw = Math.max(24, r * 2);
    const bx = e.x - bw / 2;
    const by = e.y - r - 11;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
    ctx.fillStyle = '#ff5a5a';
    ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 3);
    if (e.maxArmor > 0 && e.armor > 0) {
      ctx.fillStyle = '#d6d6e6';
      ctx.fillRect(bx, by - 4, bw * (e.armor / e.maxArmor), 3);
    }
  }
  ctx.globalAlpha = 1;
}

function legs(ctx: Ctx, r: number, anim: number, moving: boolean): void {
  ctx.lineWidth = 2;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++) {
      const base = (i - 1) * 0.5;
      const wig = moving ? Math.sin(anim * 18 + i * 2 + side) * 0.25 : 0;
      const a = side * (Math.PI / 2) + base + wig;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.4);
      ctx.lineTo(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.05);
      ctx.stroke();
    }
  }
}

function drawCrab(ctx: Ctx, r: number, facing: number, fill: string, acc: string, anim: number, moving: boolean): void {
  ctx.rotate(facing);
  ctx.strokeStyle = shade(fill, -0.35);
  legs(ctx, r, anim, moving);
  // claws
  for (let side = -1; side <= 1; side += 2) {
    const cx = r * 0.95;
    const cy = side * r * 0.62;
    ctx.fillStyle = shade(fill, 0.1);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.42, 0, TAU);
    ctx.fill();
    ctx.fillStyle = shade(fill, -0.3);
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.2, cy);
    ctx.lineTo(cx + r * 0.6, cy - side * r * 0.05);
    ctx.lineTo(cx + r * 0.2, cy + side * r * 0.25);
    ctx.fill();
  }
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.9, r * 0.75, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = shade(fill, 0.25);
  ctx.beginPath();
  ctx.ellipse(-r * 0.15, 0, r * 0.5, r * 0.4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = acc;
  ctx.beginPath();
  ctx.arc(r * 0.55, -r * 0.22, 2.4, 0, TAU);
  ctx.arc(r * 0.55, r * 0.22, 2.4, 0, TAU);
  ctx.fill();
}

function drawJelly(ctx: Ctx, r: number, fill: string, acc: string, anim: number): void {
  const pulse = 1 + Math.sin(anim * 4) * 0.08;
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, haloSprite(fill), 0, 0, r * 2.2, 0.6);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = hexA(acc, 0.7);
  ctx.lineWidth = 1.5;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * r * 0.3, r * 0.2);
    for (let s = 1; s <= 4; s++) {
      ctx.lineTo(i * r * 0.3 + Math.sin(anim * 5 + s + i) * 3, r * 0.2 + s * r * 0.3);
    }
    ctx.stroke();
  }
  ctx.fillStyle = hexA(fill, 0.85);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * pulse, r * 0.85 * pulse, 0, Math.PI, 0);
  ctx.quadraticCurveTo(0, r * 0.5, -r * pulse, 0);
  ctx.fill();
  ctx.fillStyle = hexA(acc, 0.7);
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.4, r * 0.25, r * 0.15, -0.5, 0, TAU);
  ctx.fill();
}

function drawSpitter(ctx: Ctx, r: number, facing: number, fill: string, acc: string): void {
  ctx.rotate(facing);
  ctx.fillStyle = shade(fill, -0.25);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
    ctx.lineTo(Math.cos(a + 0.2) * r * 1.3, Math.sin(a + 0.2) * r * 1.3);
    ctx.lineTo(Math.cos(a + 0.4) * r * 0.8, Math.sin(a + 0.4) * r * 0.8);
    ctx.fill();
  }
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = shade(fill, -0.4);
  ctx.fillRect(r * 0.4, -r * 0.3, r * 0.9, r * 0.6);
  ctx.fillStyle = acc;
  ctx.beginPath();
  ctx.arc(r * 0.1, -r * 0.35, 2.6, 0, TAU);
  ctx.arc(r * 0.1, r * 0.35, 2.6, 0, TAU);
  ctx.fill();
}

function drawWisp(ctx: Ctx, r: number, fill: string, acc: string, anim: number): void {
  const fl = Math.sin(anim * 10) * 0.12;
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, haloSprite(fill), 0, 0, r * 2.4, 0.8);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, -r * (1.6 + fl));
  ctx.quadraticCurveTo(r * 1.1, -r * 0.2, r * 0.7, r * 0.6);
  ctx.quadraticCurveTo(0, r * 1.1, -r * 0.7, r * 0.6);
  ctx.quadraticCurveTo(-r * 1.1, -r * 0.2, 0, -r * (1.6 + fl));
  ctx.fill();
  ctx.fillStyle = acc;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.35, r * 0.45, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#0a0a1a';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.18, 0, TAU);
  ctx.fill();
}

function drawTome(ctx: Ctx, r: number, facing: number, fill: string, acc: string): void {
  ctx.rotate(facing);
  ctx.fillStyle = shade(fill, -0.45);
  ctx.fillRect(-r * 0.9, -r * 1.0, r * 1.8, r * 2.0);
  ctx.fillStyle = fill;
  ctx.fillRect(-r * 0.8, -r * 0.92, r * 1.6, r * 1.84);
  ctx.fillStyle = acc;
  ctx.fillRect(r * 0.55, -r * 0.85, r * 0.2, r * 1.7);
  ctx.strokeStyle = shade(fill, -0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-r * 0.1, 0, r * 0.45, 0, TAU);
  ctx.moveTo(-r * 0.1, -r * 0.45);
  ctx.lineTo(-r * 0.1, r * 0.45);
  ctx.stroke();
}

function drawMoth(ctx: Ctx, r: number, facing: number, fill: string, acc: string, anim: number): void {
  ctx.rotate(facing);
  const flap = 0.4 + Math.abs(Math.sin(anim * 22)) * 0.6;
  ctx.fillStyle = hexA(fill, 0.85);
  for (let side = -1; side <= 1; side += 2) {
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, side * r * 0.8 * flap, r * 0.8, r * 0.7 * flap, side * 0.4, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, glowSprite(acc), 0, 0, r * 1.2, 0.6);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = shade(fill, -0.4);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.7, r * 0.3, 0, 0, TAU);
  ctx.fill();
}

function drawSentry(ctx: Ctx, r: number, fill: string, acc: string, facing: number): void {
  ctx.rotate(facing);
  ctx.fillStyle = shade(fill, -0.35);
  ctx.beginPath();
  ctx.moveTo(r * 1.2, 0);
  ctx.lineTo(0, r * 1.2);
  ctx.lineTo(-r * 1.2, 0);
  ctx.lineTo(0, -r * 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(r * 0.85, 0);
  ctx.lineTo(0, r * 0.85);
  ctx.lineTo(-r * 0.85, 0);
  ctx.lineTo(0, -r * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, glowSprite(acc), 0, 0, r * 0.9, 0.9);
  ctx.globalCompositeOperation = 'source-over';
}

function drawPuff(ctx: Ctx, r: number, fill: string, acc: string, anim: number, charge: number): void {
  const swell = 1 + charge * 0.35 + Math.sin(anim * 30) * 0.04 * charge;
  ctx.scale(swell, swell);
  ctx.fillStyle = charge > 0 && Math.floor(anim * (8 + charge * 20)) % 2 === 0 ? '#fff4d6' : fill;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = shade(fill, -0.35);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.18, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = '#3a2010';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(r * 0.3, -r * 1.4, r * 0.1, -r * 1.6);
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, glowSprite(acc), r * 0.1, -r * 1.6, 6 + Math.sin(anim * 20) * 2, 1);
  ctx.globalCompositeOperation = 'source-over';
}

function drawLancer(ctx: Ctx, r: number, facing: number, fill: string, acc: string): void {
  ctx.rotate(facing);
  ctx.fillStyle = shade(fill, -0.3);
  ctx.beginPath();
  ctx.moveTo(r * 1.8, 0);
  ctx.lineTo(-r * 0.8, r * 0.9);
  ctx.lineTo(-r * 0.4, 0);
  ctx.lineTo(-r * 0.8, -r * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(r * 1.4, 0);
  ctx.lineTo(-r * 0.5, r * 0.6);
  ctx.lineTo(-r * 0.2, 0);
  ctx.lineTo(-r * 0.5, -r * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = acc;
  ctx.beginPath();
  ctx.arc(r * 0.3, 0, 2.5, 0, TAU);
  ctx.fill();
}

function drawPriest(ctx: Ctx, r: number, fill: string, acc: string, anim: number): void {
  ctx.fillStyle = shade(fill, -0.4);
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.1);
  ctx.lineTo(r * 0.95, r * 1.0);
  ctx.lineTo(-r * 0.95, r * 1.0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(0, -r * 0.6, r * 0.45, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = acc;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -r * 1.25 + Math.sin(anim * 3) * 2, r * 0.5, 0, TAU);
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, glowSprite(acc), -r * 0.7, r * 0.1, 7, 0.8);
  drawGlow(ctx, glowSprite(acc), r * 0.7, r * 0.1, 7, 0.8);
  ctx.globalCompositeOperation = 'source-over';
}

function drawEye(ctx: Ctx, r: number, fill: string, acc: string, look: number): void {
  ctx.fillStyle = shade(fill, -0.5);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * r, Math.sin(a) * r, r * 0.35, r * 0.15, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = acc;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  const ix = Math.cos(look) * r * 0.35;
  const iy = Math.sin(look) * r * 0.35;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(ix, iy, r * 0.55, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#0a0014';
  ctx.beginPath();
  ctx.arc(ix * 1.2, iy * 1.2, r * 0.25, 0, TAU);
  ctx.fill();
}

function drawHound(ctx: Ctx, r: number, facing: number, fill: string, acc: string, anim: number): void {
  ctx.rotate(facing);
  const stride = Math.sin(anim * 14) * 0.15;
  ctx.fillStyle = shade(fill, -0.35);
  ctx.beginPath();
  ctx.ellipse(-r * 0.6, 0, r * 0.7, r * 0.55 + stride * r, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(r * 1.4, 0);
  ctx.lineTo(r * 0.1, r * 0.75);
  ctx.lineTo(-r * 0.7, r * 0.4);
  ctx.lineTo(-r * 0.7, -r * 0.4);
  ctx.lineTo(r * 0.1, -r * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = acc;
  ctx.beginPath();
  ctx.arc(r * 0.7, -r * 0.25, 2.4, 0, TAU);
  ctx.arc(r * 0.7, r * 0.25, 2.4, 0, TAU);
  ctx.fill();
}

function drawLeech(ctx: Ctx, r: number, facing: number, fill: string, acc: string, anim: number): void {
  ctx.rotate(facing);
  for (let i = 3; i >= 0; i--) {
    const off = -i * r * 0.75;
    const wob = Math.sin(anim * 10 - i) * r * 0.25;
    ctx.fillStyle = i === 0 ? fill : shade(fill, -0.15 * i);
    ctx.beginPath();
    ctx.arc(off, wob, r * (1 - i * 0.15), 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = acc;
  ctx.beginPath();
  ctx.arc(r * 0.5, 0, r * 0.35, 0, TAU);
  ctx.fill();
}

// ------------------------------------------------------------------ bosses

function drawBoss(ctx: Ctx, w: World, e: Enemy, fill: string, acc: string, time: number): void {
  const r = e.r;
  const id = e.boss?.id;
  if (id === 'matriarch') {
    drawCrab(ctx, r, e.facing, fill, acc, e.anim, e.mx !== 0 || e.my !== 0 || !!e.charging);
    // Crown of barnacles
    ctx.rotate(0);
    ctx.fillStyle = acc;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.35 + e.facing + Math.PI / 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.4 - Math.cos(e.facing) * r * 0.2, Math.sin(a) * r * 0.4 - Math.sin(e.facing) * r * 0.2, 4, 0, TAU);
      ctx.fill();
    }
  } else if (id === 'archivist') {
    // Orbiting pages
    for (let i = 0; i < 6; i++) {
      const a = time * 1.2 + (i * TAU) / 6;
      ctx.save();
      ctx.translate(Math.cos(a) * r * 1.8, Math.sin(a) * r * 1.2 - r * 0.2);
      ctx.rotate(a);
      ctx.fillStyle = '#f2e6b8';
      ctx.fillRect(-6, -8, 12, 16);
      ctx.fillStyle = '#5468ff';
      ctx.fillRect(-4, -4, 8, 1.5);
      ctx.fillRect(-4, 0, 8, 1.5);
      ctx.restore();
    }
    ctx.fillStyle = shade(fill, -0.5);
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.3);
    ctx.lineTo(r * 1.0, r * 1.2);
    ctx.quadraticCurveTo(0, r * 0.9, -r * 1.0, r * 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(0, -r * 0.7, r * 0.55, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glowSprite(acc), -r * 0.2, -r * 0.7, 8, 1);
    drawGlow(ctx, glowSprite(acc), r * 0.2, -r * 0.7, 8, 1);
    drawGlow(ctx, haloSprite(fill), 0, 0, r * 2.5, 0.7);
    ctx.globalCompositeOperation = 'source-over';
  } else if (id === 'kiln') {
    const pulse = 1 + Math.sin(time * 3) * 0.05;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, haloSprite(fill), 0, 0, r * 3, 0.9);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#3a1410';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.05, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = shade(fill, -0.2);
    ctx.lineWidth = 8;
    for (let i = 0; i < 6; i++) {
      const a = time * 0.6 + (i * TAU) / 6;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.92, a, a + 0.6);
      ctx.stroke();
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62 * pulse, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glowSprite(acc), 0, 0, r * 0.7 * pulse, 1);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    // The Maw
    const open = 0.75 + Math.sin(time * 2) * 0.1 + (e.charging ? 0.2 : 0);
    ctx.fillStyle = shade(fill, -0.55);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.1, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#05010c';
    ctx.beginPath();
    ctx.arc(0, 0, r * open, 0, TAU);
    ctx.fill();
    ctx.fillStyle = acc;
    const teeth = 14;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * TAU + time * 0.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.12) * r * open, Math.sin(a - 0.12) * r * open);
      ctx.lineTo(Math.cos(a) * r * (open - 0.28), Math.sin(a) * r * (open - 0.28));
      ctx.lineTo(Math.cos(a + 0.12) * r * open, Math.sin(a + 0.12) * r * open);
      ctx.fill();
    }
    const look = Math.atan2(w.player.y - e.y, w.player.x - e.x);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glowSprite(fill), Math.cos(look) * r * 0.2, Math.sin(look) * r * 0.2, r * 0.45, 1);
    ctx.globalCompositeOperation = 'source-over';
  }
}
