import { TAU, clamp, lerp, type Shape } from '../core/math';
import { CURRENT_INFO } from '../data/glyphs';
import type { Hazard } from '../game/entities';
import type { Reward } from '../game/run';
import type { World } from '../game/world';
import { drawEnemy, drawPlayer, drawShadow } from './draw';
import { drawGlow, glowSprite, haloSprite, hexA, shade } from './glow';

type Ctx = CanvasRenderingContext2D;

export interface RenderOptions {
  shake: boolean;
  damageNumbers: boolean;
  reducedFlashes: boolean;
  /** Touch drag-aim preview direction (radians) or null. */
  aimPreview: { angle: number; kind: 'special' | 'flare' | 'attack' } | null;
}

const WALL = 70;
/** World units visible across the screen's short side: tighter on phones so characters stay readable. */
const ZOOM_MIN_SHORT = 430;
const ZOOM_MAX_SHORT = 660;
const ZOOM_LONG_SIDE = 1500;

export function rewardColor(r: Reward): string {
  switch (r.kind) {
    case 'glyph':
      return r.current ? CURRENT_INFO[r.current].color : '#ffffff';
    case 'pearls':
      return '#e8f4ff';
    case 'embers':
      return '#ff9a4a';
    case 'heart':
      return '#ff5a7a';
    case 'whetstone':
      return '#b8d0e0';
    case 'restore':
      return '#7dff9a';
    case 'shop':
      return '#ffd76a';
    case 'boss':
      return '#ff4d4d';
    default:
      return '#ffffff';
  }
}

export function drawRewardIcon(ctx: Ctx, r: Reward, x: number, y: number, s: number, time: number): void {
  const color = rewardColor(r);
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, haloSprite(color), 0, 0, s * 2.2, 0.9);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, s * 0.14);
  switch (r.kind) {
    case 'glyph': {
      ctx.rotate(time * 0.8);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const rr = i % 2 === 0 ? s : s * 0.55;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.3, 0, TAU);
      ctx.fill();
      break;
    }
    case 'pearls':
      ctx.beginPath();
      ctx.arc(-s * 0.35, s * 0.2, s * 0.38, 0, TAU);
      ctx.arc(s * 0.35, s * 0.2, s * 0.38, 0, TAU);
      ctx.arc(0, -s * 0.35, s * 0.38, 0, TAU);
      ctx.fill();
      break;
    case 'embers':
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.9, 0, s * 0.5, s * 0.7);
      ctx.quadraticCurveTo(0, s, -s * 0.5, s * 0.7);
      ctx.quadraticCurveTo(-s * 0.9, 0, 0, -s);
      ctx.fill();
      break;
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(0, s * 0.8);
      ctx.bezierCurveTo(-s * 1.2, 0, -s * 0.6, -s * 0.9, 0, -s * 0.3);
      ctx.bezierCurveTo(s * 0.6, -s * 0.9, s * 1.2, 0, 0, s * 0.8);
      ctx.fill();
      break;
    case 'whetstone':
      ctx.rotate(-0.6);
      ctx.fillRect(-s * 0.15, -s, s * 0.3, s * 1.5);
      ctx.fillRect(-s * 0.5, s * 0.35, s, s * 0.2);
      break;
    case 'restore':
      ctx.fillRect(-s * 0.2, -s * 0.75, s * 0.4, s * 1.5);
      ctx.fillRect(-s * 0.75, -s * 0.2, s * 1.5, s * 0.4);
      break;
    case 'shop':
      ctx.beginPath();
      ctx.arc(0, s * 0.15, s * 0.7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#5a3a00';
      ctx.font = `bold ${Math.round(s)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, s * 0.2);
      break;
    case 'boss':
      ctx.beginPath();
      ctx.arc(0, -s * 0.15, s * 0.7, 0, TAU);
      ctx.fill();
      ctx.fillRect(-s * 0.4, s * 0.3, s * 0.8, s * 0.45);
      ctx.fillStyle = '#1a0000';
      ctx.beginPath();
      ctx.arc(-s * 0.28, -s * 0.15, s * 0.18, 0, TAU);
      ctx.arc(s * 0.28, -s * 0.15, s * 0.18, 0, TAU);
      ctx.fill();
      break;
    default:
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.5, 0, TAU);
      ctx.fill();
  }
  ctx.restore();
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: Ctx;
  viewW = 1;
  viewH = 1;
  dpr = 1;
  scale = 1;
  camX = 0;
  camY = 0;
  private shakeAmt = 0;
  private shakeX = 0;
  private shakeY = 0;
  private floor: HTMLCanvasElement | null = null;
  private floorFor: World | null = null;
  private floorRes = 1;
  private hurtFlash = 0;
  private lastHp = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewW = w;
    this.viewH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const short = Math.min(w, h);
    const visible = Math.max(ZOOM_MIN_SHORT, Math.min(ZOOM_MAX_SHORT, short * 0.75));
    this.scale = Math.max(short / visible, Math.max(w, h) / ZOOM_LONG_SIDE);
    this.floorFor = null;
  }

  addShake(amount: number): void {
    this.shakeAmt = Math.min(22, this.shakeAmt + amount);
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.camX) * this.scale + this.viewW / 2, y: (y - this.camY) * this.scale + this.viewH / 2 };
  }

  /** Snap the camera to the player (on room entry). */
  snapCamera(w: World): void {
    const t = this.cameraTarget(w);
    this.camX = t.x;
    this.camY = t.y;
  }

  private cameraTarget(w: World): { x: number; y: number } {
    const halfW = this.viewW / 2 / this.scale;
    const halfH = this.viewH / 2 / this.scale;
    // Let the camera overscroll the arena a little so the player is never
    // pinned in a corner under the thumb controls.
    const mx = 40 + halfW * 0.22;
    const my = 40 + halfH * 0.22;
    const minX = halfW - mx;
    const maxX = w.w - halfW + mx;
    const minY = halfH - my - 30;
    const maxY = w.h - halfH + my;
    let tx = w.player.x;
    let ty = w.player.y;
    // In guardian fights, lean toward the boss so its attacks stay in view.
    const b = w.boss;
    if (b && !b.dead) {
      tx += (b.x - tx) * 0.35;
      ty += (b.y - ty) * 0.35;
    }
    const x = minX > maxX ? w.w / 2 : clamp(tx, minX, maxX);
    const y = minY > maxY ? w.h / 2 : clamp(ty, minY, maxY);
    return { x, y };
  }

  render(w: World, realDt: number, opt: RenderOptions): void {
    const ctx = this.ctx;
    const time = w.time;
    if (this.floorFor !== w) this.buildFloor(w);

    // Camera follow
    const t = this.cameraTarget(w);
    const k = 1 - Math.exp(-8 * realDt);
    this.camX = lerp(this.camX, t.x, k);
    this.camY = lerp(this.camY, t.y, k);
    if (opt.shake && this.shakeAmt > 0.1) {
      this.shakeX = (Math.random() * 2 - 1) * this.shakeAmt;
      this.shakeY = (Math.random() * 2 - 1) * this.shakeAmt;
    } else {
      this.shakeX = this.shakeY = 0;
    }
    this.shakeAmt *= Math.exp(-10 * realDt);

    if (this.lastHp >= 0 && w.player.hp < this.lastHp) this.hurtFlash = opt.reducedFlashes ? 0.25 : 0.5;
    this.lastHp = w.player.hp;
    this.hurtFlash = Math.max(0, this.hurtFlash - realDt * 2.5);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = w.biome.wall;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const s = this.scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, (this.viewW / 2 - this.camX * this.scale + this.shakeX) * this.dpr, (this.viewH / 2 - this.camY * this.scale + this.shakeY) * this.dpr);

    // Floor + walls, then the lantern-light falloff (floor only, so foes,
    // telegraphs and projectiles always stay fully readable).
    if (this.floor) ctx.drawImage(this.floor, -WALL, -WALL, w.w + WALL * 2, w.h + WALL * 2);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawLighting(ctx, w);
    ctx.setTransform(s, 0, 0, s, (this.viewW / 2 - this.camX * this.scale + this.shakeX) * this.dpr, (this.viewH / 2 - this.camY * this.scale + this.shakeY) * this.dpr);

    this.drawDoors(ctx, w, time);
    this.drawHazards(ctx, w, time, false);
    this.drawSpawnMarkers(ctx, w, time);
    this.drawPickups(ctx, w, time);
    if (w.altar) this.drawAltar(ctx, w, time);

    // Entities, depth sorted
    const list: { y: number; draw: () => void }[] = [];
    for (const e of w.enemies) if (!e.dead) list.push({ y: e.y, draw: () => drawEnemy(ctx, w, e, time) });
    list.push({ y: w.player.y, draw: () => drawPlayer(ctx, w, w.player, time) });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.draw();

    this.drawHazards(ctx, w, time, true);
    this.drawObstacleTops(ctx, w);
    this.drawProjectiles(ctx, w, time);
    this.drawLobs(ctx, w);
    this.drawSlashes(ctx, w);
    this.drawBolts(ctx, w);
    this.drawParticles(ctx, w);
    if (opt.aimPreview) this.drawAimPreview(ctx, w, opt.aimPreview);
    if (opt.damageNumbers) this.drawTexts(ctx, w);

    // Screen-space: hurt / low-health vignette.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawOffscreenHints(ctx, w, time);
    if (this.hurtFlash > 0 || w.player.hp / w.player.maxHp < 0.3) {
      const low = w.player.hp / w.player.maxHp < 0.3 ? 0.25 + Math.sin(time * 5) * 0.08 : 0;
      const a = Math.max(this.hurtFlash, low);
      const g = ctx.createRadialGradient(this.viewW / 2, this.viewH / 2, Math.min(this.viewW, this.viewH) * 0.3, this.viewW / 2, this.viewH / 2, Math.max(this.viewW, this.viewH) * 0.75);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(200,10,30,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
  }

  // ---------------------------------------------------------------- floor

  private buildFloor(w: World): void {
    const res = Math.min(1.5, this.scale * this.dpr);
    this.floorRes = res;
    const W = w.w + WALL * 2;
    const H = w.h + WALL * 2;
    const c = document.createElement('canvas');
    c.width = Math.ceil(W * res);
    c.height = Math.ceil(H * res);
    const g = c.getContext('2d')!;
    g.scale(res, res);
    const b = w.biome;
    const rng = mulberry(w.cfg.seed);

    // Walls
    g.fillStyle = b.wall;
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(WALL, WALL);

    // Floor tiles (clipped to the arena)
    g.save();
    g.beginPath();
    g.rect(0, 0, w.w, w.h);
    g.clip();
    g.fillStyle = b.floor;
    g.fillRect(0, 0, w.w, w.h);
    const tile = 48;
    for (let y = 0; y < w.h; y += tile) {
      for (let x = 0; x < w.w; x += tile) {
        const v = rng();
        if (v < 0.3) {
          g.globalAlpha = 0.35 + rng() * 0.45;
          g.fillStyle = b.floorAlt;
          g.fillRect(x + 1, y + 1, tile - 2, tile - 2);
          g.globalAlpha = 1;
        }
        if (v > 0.93) {
          g.strokeStyle = 'rgba(0,0,0,0.25)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(x + rng() * tile, y + rng() * tile);
          g.lineTo(x + rng() * tile, y + rng() * tile);
          g.lineTo(x + rng() * tile, y + rng() * tile);
          g.stroke();
        }
      }
    }
    g.strokeStyle = 'rgba(0,0,0,0.11)';
    g.lineWidth = 1;
    for (let x = 0; x <= w.w; x += tile) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, w.h);
      g.stroke();
    }
    for (let y = 0; y <= w.h; y += tile) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w.w, y);
      g.stroke();
    }
    // Biome detail: soft glowing patches plus a per-biome motif.
    for (let i = 0; i < 26; i++) {
      const x = rng() * w.w;
      const y = rng() * w.h;
      const r = 30 + rng() * 90;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, hexA(b.accent, 0.06));
      grad.addColorStop(1, hexA(b.accent, 0));
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    this.floorMotif(g, w, rng);
    g.restore();
    // Edge shading
    const edge = g.createLinearGradient(0, 0, 0, 60);
    edge.addColorStop(0, 'rgba(0,0,0,0.45)');
    edge.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = edge;
    g.fillRect(0, 0, w.w, 60);
    // Wall lip
    g.strokeStyle = b.wallTop;
    g.lineWidth = 6;
    g.strokeRect(-3, -3, w.w + 6, w.h + 6);
    g.strokeStyle = shade(b.wallTop, 0.25);
    g.lineWidth = 1.5;
    g.strokeRect(-6, -6, w.w + 12, w.h + 12);

    // Obstacle bases (shadows); tops are drawn over entities.
    for (const o of w.obstacles) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      if (o.kind === 'circle') {
        g.beginPath();
        g.ellipse(o.x + 6, o.y + 10, o.r * 1.05, o.r * 0.9, 0, 0, TAU);
        g.fill();
      } else {
        g.fillRect(o.rect.x + 6, o.rect.y + 10, o.rect.w, o.rect.h);
      }
    }
    g.restore();
    this.floor = c;
    this.floorFor = w;
  }

  /** Edge-of-screen arrows toward open exits (and the reward) when they're out of view. */
  private drawOffscreenHints(ctx: Ctx, w: World, time: number): void {
    const targets: { x: number; y: number; reward: Reward }[] = [];
    if (w.state === 'exit') for (const d of w.doors) if (d.open) targets.push({ x: d.x, y: -20, reward: d.reward });
    if (w.state === 'reward') for (const k of w.pickups) if (k.kind === 'reward' && k.reward) targets.push({ x: k.x, y: k.y, reward: k.reward });
    const pad = 56;
    for (const t of targets) {
      const sp = this.worldToScreen(t.x, t.y);
      if (sp.x > pad && sp.x < this.viewW - pad && sp.y > pad + 20 && sp.y < this.viewH - pad) continue;
      const cx = this.viewW / 2;
      const cy = this.viewH / 2;
      const a = Math.atan2(sp.y - cy, sp.x - cx);
      const x = clamp(sp.x, pad, this.viewW - pad);
      const y = clamp(sp.y, pad + 30, this.viewH - pad);
      const bob = Math.sin(time * 5) * 4;
      ctx.save();
      ctx.translate(x + Math.cos(a) * bob, y + Math.sin(a) * bob);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rewardColor(t.reward);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.rotate(a);
      ctx.fillStyle = rewardColor(t.reward);
      ctx.beginPath();
      ctx.moveTo(32, 0);
      ctx.lineTo(24, -7);
      ctx.lineTo(24, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      drawRewardIcon(ctx, t.reward, x + Math.cos(a) * bob, y + Math.sin(a) * bob, 10, time);
    }
  }

  /** Per-biome floor decoration baked into the floor cache. */
  private floorMotif(g: Ctx, w: World, rng: () => number): void {
    const b = w.biome;
    switch (b.id) {
      case 'shallows': {
        // Caustic light ripples
        g.strokeStyle = hexA(b.accent, 0.07);
        g.lineWidth = 2;
        for (let i = 0; i < 34; i++) {
          const x = rng() * w.w;
          const y = rng() * w.h;
          const r = 14 + rng() * 30;
          g.beginPath();
          g.ellipse(x, y, r, r * 0.6, rng() * Math.PI, 0, Math.PI * (1 + rng()));
          g.stroke();
        }
        // Sand drifts
        for (let i = 0; i < 10; i++) {
          const x = rng() * w.w;
          const y = rng() * w.h;
          g.fillStyle = 'rgba(214,190,140,0.03)';
          g.beginPath();
          g.ellipse(x, y, 40 + rng() * 50, 14 + rng() * 18, rng() * Math.PI, 0, TAU);
          g.fill();
        }
        break;
      }
      case 'archive': {
        // Scattered drowned pages and a faint inlaid circle
        for (let i = 0; i < 24; i++) {
          g.save();
          g.translate(rng() * w.w, rng() * w.h);
          g.rotate(rng() * Math.PI);
          g.fillStyle = 'rgba(242,230,184,0.07)';
          g.fillRect(-8, -11, 16, 22);
          g.restore();
        }
        g.strokeStyle = hexA(b.accent, 0.08);
        g.lineWidth = 3;
        g.beginPath();
        g.arc(w.w / 2, w.h / 2, Math.min(w.w, w.h) * 0.33, 0, TAU);
        g.stroke();
        g.beginPath();
        g.arc(w.w / 2, w.h / 2, Math.min(w.w, w.h) * 0.28, 0, TAU);
        g.stroke();
        break;
      }
      case 'furnace': {
        // Glowing magma cracks
        g.lineCap = 'round';
        for (let i = 0; i < 16; i++) {
          let x = rng() * w.w;
          let y = rng() * w.h;
          g.strokeStyle = `rgba(255,${100 + Math.floor(rng() * 60)},40,${0.12 + rng() * 0.1})`;
          g.lineWidth = 2 + rng() * 2;
          g.beginPath();
          g.moveTo(x, y);
          for (let k = 0; k < 5; k++) {
            x += (rng() - 0.5) * 60;
            y += (rng() - 0.5) * 60;
            g.lineTo(x, y);
          }
          g.stroke();
        }
        break;
      }
      case 'maw': {
        // Veins radiating from the centre
        g.strokeStyle = hexA(b.accent, 0.06);
        g.lineWidth = 3;
        for (let i = 0; i < 18; i++) {
          const a = rng() * TAU;
          let x = w.w / 2;
          let y = w.h / 2;
          g.beginPath();
          g.moveTo(x, y);
          for (let k = 0; k < 8; k++) {
            x += Math.cos(a + (rng() - 0.5) * 0.8) * 50;
            y += Math.sin(a + (rng() - 0.5) * 0.8) * 50;
            g.lineTo(x, y);
          }
          g.stroke();
        }
        break;
      }
    }
  }

  private drawObstacleTops(ctx: Ctx, w: World): void {
    const b = w.biome;
    for (const o of w.obstacles) {
      if (o.kind === 'circle') {
        const grad = ctx.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.4, o.r * 0.1, o.x, o.y, o.r);
        grad.addColorStop(0, shade(b.pillar, 0.25));
        grad.addColorStop(1, shade(b.pillar, -0.25));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = shade(b.pillar, 0.4);
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        const r = o.rect;
        ctx.fillStyle = shade(b.pillar, -0.3);
        ctx.fillRect(r.x, r.y + 8, r.w, r.h - 8);
        ctx.fillStyle = b.pillar;
        ctx.fillRect(r.x, r.y, r.w, r.h - 10);
        ctx.strokeStyle = shade(b.pillar, 0.35);
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 12);
      }
    }
  }

  // ---------------------------------------------------------------- world bits

  private drawDoors(ctx: Ctx, w: World, time: number): void {
    for (const d of w.doors) {
      const color = rewardColor(d.reward);
      ctx.fillStyle = d.open ? '#05080c' : shade(w.biome.wall, 0.1);
      ctx.fillRect(d.x - 44, -WALL + 6, 88, WALL - 4);
      ctx.strokeStyle = d.open ? color : shade(w.biome.wallTop, -0.2);
      ctx.lineWidth = 3;
      ctx.strokeRect(d.x - 44, -WALL + 6, 88, WALL - 4);
      if (d.open) {
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, haloSprite(color), d.x, -8, 70, 0.6 + Math.sin(time * 3) * 0.15);
        ctx.globalCompositeOperation = 'source-over';
        drawRewardIcon(ctx, d.reward, d.x, -WALL / 2 + 4, 13, time);
      } else {
        // Sealed bars
        ctx.strokeStyle = shade(w.biome.wallTop, 0.1);
        ctx.lineWidth = 4;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(d.x + i * 16, -WALL + 8);
          ctx.lineTo(d.x + i * 16, 0);
          ctx.stroke();
        }
      }
    }
  }

  private drawAltar(ctx: Ctx, w: World, time: number): void {
    const a = w.altar!;
    drawShadow(ctx, a.x, a.y, 28, 0.4);
    ctx.fillStyle = '#5a4630';
    ctx.fillRect(a.x - 30, a.y - 14, 60, 26);
    ctx.fillStyle = '#7a6040';
    ctx.fillRect(a.x - 34, a.y - 20, 68, 10);
    drawRewardIcon(ctx, { kind: 'shop' }, a.x, a.y - 40 + Math.sin(time * 2) * 3, 14, time);
  }

  private drawSpawnMarkers(ctx: Ctx, w: World, time: number): void {
    for (const m of w.spawnMarkers) {
      const k = m.t / m.dur;
      const r = 26 * (0.4 + k * 0.6);
      ctx.strokeStyle = hexA(m.minion ? '#ff9a6a' : '#ff5a8a', 0.4 + k * 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, r, time * 4, time * 4 + TAU * 0.75);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, haloSprite('#ff5a8a'), m.x, m.y, r * 1.6, k * 0.8);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private drawPickups(ctx: Ctx, w: World, time: number): void {
    for (const k of w.pickups) {
      const bob = Math.sin(time * 3 + k.id) * 3;
      if (k.kind === 'reward' && k.reward) {
        drawShadow(ctx, k.x, k.y + 10, 14, 0.3);
        drawRewardIcon(ctx, k.reward, k.x, k.y - 6 + bob, 16, time);
        continue;
      }
      const color = k.kind === 'pearl' ? '#e8f4ff' : k.kind === 'heal' ? '#7dff9a' : k.kind === 'ember' ? '#ff9a4a' : '#9ad8ff';
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glowSprite(color), k.x, k.y + bob * 0.5, k.kind === 'pearl' ? 9 : 12, 0.95);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private hazardPath(ctx: Ctx, s: Shape, progress = 1): void {
    ctx.beginPath();
    switch (s.kind) {
      case 'circle':
        ctx.arc(s.x, s.y, s.r * progress, 0, TAU);
        break;
      case 'arc':
        ctx.moveTo(s.x, s.y);
        ctx.arc(s.x, s.y, s.r * progress, s.angle - s.spread / 2, s.angle + s.spread / 2);
        ctx.closePath();
        break;
      case 'line': {
        const c = Math.cos(s.angle);
        const n = Math.sin(s.angle);
        const L = s.length * progress;
        const hw = s.width / 2;
        ctx.moveTo(s.x - n * hw, s.y + c * hw);
        ctx.lineTo(s.x - n * hw + c * L, s.y + c * hw + n * L);
        ctx.lineTo(s.x + n * hw + c * L, s.y - c * hw + n * L);
        ctx.lineTo(s.x + n * hw, s.y - c * hw);
        ctx.closePath();
        break;
      }
      case 'ring':
        ctx.arc(s.x, s.y, s.r + s.thickness / 2, 0, TAU);
        ctx.arc(s.x, s.y, Math.max(0, s.r - s.thickness / 2), 0, TAU, true);
        break;
    }
  }

  /** Ground-level hazards first (zones, telegraphs); `top` draws rings/beams above entities. */
  private drawHazards(ctx: Ctx, w: World, time: number, top: boolean): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w.w, w.h);
    ctx.clip();
    for (const h of w.hazards) {
      const isTop = h.shape.kind === 'ring' || h.visual === 'gloom';
      if (isTop !== top) continue;
      if (h.team === 'enemy') this.drawEnemyHazard(ctx, h, time);
      else this.drawPlayerHazard(ctx, h, time);
    }
    ctx.restore();
  }

  private drawEnemyHazard(ctx: Ctx, h: Hazard, time: number): void {
    const color = h.visual === 'warn' ? '#ff3b3b' : h.color;
    if (h.shape.kind === 'ring') {
      this.hazardPath(ctx, h.shape);
      ctx.fillStyle = hexA(color, h.harmless ? 0.25 : 0.55);
      ctx.fill();
      ctx.strokeStyle = hexA('#ffffff', h.harmless ? 0.2 : 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(h.shape.x, h.shape.y, h.shape.r, 0, TAU);
      ctx.stroke();
      return;
    }
    if (!h.triggered) {
      const k = h.delay > 0 ? Math.min(1, h.t / h.delay) : 1;
      // Outline + fill that grows to the edge at the moment of impact.
      this.hazardPath(ctx, h.shape);
      ctx.fillStyle = hexA(color, 0.1 + k * 0.08);
      ctx.fill();
      ctx.strokeStyle = hexA(color, 0.45 + k * 0.4);
      ctx.lineWidth = 2;
      ctx.stroke();
      if (!h.harmless || h.shape.kind === 'line') {
        this.hazardPath(ctx, h.shape, h.shape.kind === 'line' ? 1 : k);
        ctx.fillStyle = hexA(color, h.harmless ? 0.12 * k : 0.28 * k);
        ctx.fill();
      }
    } else if (h.duration > 0) {
      // Active persistent hazard (e.g. beam).
      this.hazardPath(ctx, h.shape);
      ctx.fillStyle = hexA(color, 0.5 + Math.sin(time * 30) * 0.1);
      ctx.fill();
      if (h.shape.kind === 'line') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = hexA('#ffffff', 0.6);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(h.shape.x, h.shape.y);
        ctx.lineTo(h.shape.x + Math.cos(h.shape.angle) * h.shape.length, h.shape.y + Math.sin(h.shape.angle) * h.shape.length);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    } else {
      // Impact flash for the frame it lands.
      this.hazardPath(ctx, h.shape);
      ctx.fillStyle = hexA('#ffd0d0', 0.6);
      ctx.fill();
    }
  }

  private drawPlayerHazard(ctx: Ctx, h: Hazard, time: number): void {
    switch (h.visual) {
      case 'fire': {
        if (h.shape.kind !== 'circle') return;
        const fade = Math.min(1, (h.delay + h.duration - h.t) * 2);
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, haloSprite(h.color), h.shape.x, h.shape.y, h.shape.r * (1.1 + Math.sin(time * 14 + h.id) * 0.06), 0.8 * fade);
        ctx.globalCompositeOperation = 'source-over';
        return;
      }
      case 'storm': {
        if (h.shape.kind !== 'circle') return;
        const fade = Math.min(1, (h.duration - h.t) * 2);
        ctx.strokeStyle = hexA(h.color, 0.35 * fade);
        ctx.setLineDash([8, 10]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.shape.x, h.shape.y, h.shape.r, time, time + TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = hexA('#3a3a50', 0.5 * fade);
        ctx.beginPath();
        ctx.ellipse(h.shape.x, h.shape.y - 40, 46, 20, 0, 0, TAU);
        ctx.fill();
        return;
      }
      case 'shock':
        if (h.shape.kind !== 'ring') return;
        this.hazardPath(ctx, h.shape);
        ctx.fillStyle = hexA(h.color, 0.45);
        ctx.fill();
        return;
      case 'light':
        if (h.shape.kind !== 'circle') return;
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, haloSprite(h.color), h.shape.x, h.shape.y, h.shape.r, 0.9);
        ctx.globalCompositeOperation = 'source-over';
        return;
      default:
        return;
    }
  }

  private drawProjectiles(ctx: Ctx, w: World, time: number): void {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of w.projectiles) {
      if (p.kind === 'wave') {
        const a = Math.atan2(p.vy, p.vx);
        ctx.strokeStyle = hexA(p.color, 0.8);
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(p.x - Math.cos(a) * 10, p.y - Math.sin(a) * 10, p.r, a - 1.1, a + 1.1);
        ctx.stroke();
        continue;
      }
      if (p.kind === 'harpoon') {
        const a = Math.atan2(p.vy, p.vx);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(p.x - Math.cos(a) * 30, p.y - Math.sin(a) * 30);
        ctx.lineTo(p.x + Math.cos(a) * 10, p.y + Math.sin(a) * 10);
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, glowSprite(p.color), p.x, p.y, 18, 0.8);
        continue;
      }
      if (p.team === 'enemy') {
        drawGlow(ctx, glowSprite(p.color), p.x, p.y, p.r * 2.6, 1);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.55, 0, TAU);
        ctx.fill();
      } else {
        const a = Math.atan2(p.vy, p.vx);
        drawGlow(ctx, glowSprite(p.color), p.x, p.y, p.r * 2.4, 1);
        ctx.strokeStyle = hexA(p.color, 0.7);
        ctx.lineWidth = p.r;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(a) * 22, p.y - Math.sin(a) * 22);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    void time;
  }

  private drawLobs(ctx: Ctx, w: World): void {
    for (const l of w.lobs) {
      const k = l.t / l.dur;
      const x = lerp(l.x0, l.x1, k);
      const y = lerp(l.y0, l.y1, k) - Math.sin(k * Math.PI) * 60;
      drawShadow(ctx, lerp(l.x0, l.x1, k), lerp(l.y0, l.y1, k), 6, 0.3);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glowSprite(l.color), x, y, 14, 1);
      ctx.globalCompositeOperation = 'source-over';
      // Landing marker
      ctx.strokeStyle = hexA(l.color, 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(l.x1, l.y1, 76 * (0.5 + k * 0.5), 0, TAU);
      ctx.stroke();
    }
  }

  private drawSlashes(ctx: Ctx, w: World): void {
    ctx.globalCompositeOperation = 'lighter';
    for (const s of w.slashes) {
      const k = 1 - s.life / s.max; // 0 -> 1
      const fade = 1 - k;
      switch (s.kind) {
        case 'arc': {
          const sweep = Math.min(1, k * 3);
          const start = s.angle - s.spread / 2;
          const end = start + s.spread * sweep;
          ctx.strokeStyle = hexA(s.color, 0.85 * fade);
          ctx.lineWidth = s.width * (0.5 + fade * 0.5);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 0.78, start, end);
          ctx.stroke();
          ctx.strokeStyle = hexA('#ffffff', 0.9 * fade);
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 0.92, start, end);
          ctx.stroke();
          ctx.lineCap = 'butt';
          break;
        }
        case 'thrust': {
          const c = Math.cos(s.angle);
          const n = Math.sin(s.angle);
          const L = s.r * Math.min(1, k * 4);
          const hw = (s.width / 2) * fade;
          ctx.fillStyle = hexA(s.color, 0.7 * fade);
          ctx.beginPath();
          ctx.moveTo(s.x - n * hw, s.y + c * hw);
          ctx.lineTo(s.x + c * L, s.y + n * L);
          ctx.lineTo(s.x + n * hw, s.y - c * hw);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'ring':
          ctx.strokeStyle = hexA(s.color, 0.8 * fade);
          ctx.lineWidth = s.width * fade + 1;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * (0.55 + k * 0.45), 0, TAU);
          ctx.stroke();
          break;
        case 'cone': {
          ctx.fillStyle = hexA(s.color, 0.45 * fade);
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.arc(s.x, s.y, s.r * (0.6 + k * 0.4), s.angle - s.spread / 2, s.angle + s.spread / 2);
          ctx.closePath();
          ctx.fill();
          break;
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawBolts(ctx: Ctx, w: World): void {
    if (!w.bolts.length) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    for (const b of w.bolts) {
      const a = b.life / b.max;
      for (const [width, color] of [[6, hexA(b.color, 0.5 * a)], [2, hexA('#ffffff', a)]] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        b.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawParticles(ctx: Ctx, w: World): void {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of w.particles) {
      const a = Math.max(0, p.life / p.max);
      switch (p.kind) {
        case 'dot':
          drawGlow(ctx, glowSprite(p.color), p.x, p.y, p.size * 2.2, a);
          break;
        case 'spark':
          ctx.strokeStyle = hexA(p.color, a);
          ctx.lineWidth = p.size * 0.6;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
          ctx.stroke();
          break;
        case 'ring':
          ctx.strokeStyle = hexA(p.color, a * 0.5);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.stroke();
          break;
        case 'shard':
          ctx.fillStyle = hexA(p.color, a);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.life * 12);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6);
          ctx.restore();
          break;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  private drawAimPreview(ctx: Ctx, w: World, a: NonNullable<RenderOptions['aimPreview']>): void {
    const p = w.player;
    const len = a.kind === 'flare' ? 170 : 140;
    ctx.strokeStyle = 'rgba(255,240,200,0.65)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(a.angle) * len, p.y + Math.sin(a.angle) * len);
    ctx.stroke();
    ctx.setLineDash([]);
    if (a.kind === 'flare') {
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a.angle) * len, p.y + Math.sin(a.angle) * len, 20, 0, TAU);
      ctx.stroke();
    }
  }

  private drawTexts(ctx: Ctx, w: World): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of w.texts) {
      const a = Math.min(1, t.life / (t.max * 0.5));
      const pop = t.life > t.max - 0.1 ? 1.25 : 1;
      ctx.globalAlpha = a;
      ctx.font = `800 ${Math.round(t.size * pop)}px system-ui, -apple-system, sans-serif`;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 3.5;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawLighting(ctx: Ctx, w: World): void {
    const p = this.worldToScreen(w.player.x, w.player.y);
    const inner = 150 * this.scale;
    const outer = Math.max(this.viewW, this.viewH) * 0.85;
    const g = ctx.createRadialGradient(p.x, p.y, inner * 0.3, p.x, p.y, outer);
    g.addColorStop(0, 'rgba(255,210,140,0.05)');
    g.addColorStop(0.25, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,8,${w.biome.dark})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
  }

  get floorResolution(): number {
    return this.floorRes;
  }

  /** Animated backdrop behind menus: a lighthouse beam sweeping a dark sea. */
  renderBackdrop(time: number): void {
    const ctx = this.ctx;
    const W = this.viewW;
    const H = this.viewH;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#060b16');
    sky.addColorStop(0.55, '#0b1a2a');
    sky.addColorStop(1, '#03070d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Beam
    const lx = W * 0.5;
    const ly = H * 0.36;
    const a = Math.sin(time * 0.35) * 1.2;
    ctx.globalCompositeOperation = 'lighter';
    for (const side of [0, Math.PI]) {
      const ang = a + side;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(W, H));
      g.addColorStop(0, 'rgba(255,220,150,0.22)');
      g.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.arc(lx, ly, Math.max(W, H) * 1.2, ang - 0.13, ang + 0.13);
      ctx.closePath();
      ctx.fill();
    }
    drawGlow(ctx, glowSprite('#ffd27a'), lx, ly, 26 + Math.sin(time * 3) * 2, 1);

    // Water shimmer + motes
    for (let i = 0; i < 46; i++) {
      const seed = i * 97.31;
      const x = ((seed * 13.7 + time * (8 + (i % 5) * 3)) % (W + 40)) - 20;
      const y = H * 0.6 + ((seed * 7.1) % (H * 0.4)) + Math.sin(time + i) * 4;
      drawGlow(ctx, haloSprite(i % 3 ? '#4fc3f7' : '#ffd27a'), x, y, 6 + (i % 4) * 2, 0.35 + 0.25 * Math.sin(time * 2 + i));
    }
    ctx.globalCompositeOperation = 'source-over';

    // Lighthouse silhouette
    ctx.fillStyle = '#02050a';
    ctx.beginPath();
    ctx.moveTo(lx - 14, ly + 6);
    ctx.lineTo(lx + 14, ly + 6);
    ctx.lineTo(lx + 26, H * 0.66);
    ctx.lineTo(lx - 26, H * 0.66);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(lx - 18, ly - 10, 36, 8);
    ctx.beginPath();
    ctx.moveTo(lx - 120, H * 0.7);
    ctx.quadraticCurveTo(lx, H * 0.6, lx + 140, H * 0.7);
    ctx.lineTo(lx + 140, H * 0.72);
    ctx.lineTo(lx - 120, H * 0.72);
    ctx.fill();
  }
}

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
