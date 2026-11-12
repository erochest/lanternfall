/**
 * Pre-rendered radial glow sprites. Drawing these with 'lighter' compositing
 * is far cheaper than canvas shadowBlur, which matters a lot on phones.
 */
const cache = new Map<string, HTMLCanvasElement>();
const SIZE = 64;

export function glowSprite(color: string): HTMLCanvasElement {
  let c = cache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.18, hexA(color, 0.9));
  grad.addColorStop(0.5, hexA(color, 0.3));
  grad.addColorStop(1, hexA(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, SIZE, SIZE);
  cache.set(color, c);
  return c;
}

/** Soft colour-only halo (no white core). */
export function haloSprite(color: string): HTMLCanvasElement {
  const key = `halo:${color}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  grad.addColorStop(0, hexA(color, 0.55));
  grad.addColorStop(0.5, hexA(color, 0.18));
  grad.addColorStop(1, hexA(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, SIZE, SIZE);
  cache.set(key, c);
  return c;
}

export function drawGlow(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, x: number, y: number, radius: number, alpha = 1): void {
  if (radius <= 0 || alpha <= 0) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

const rgbCache = new Map<string, [number, number, number]>();

export function hexToRgb(hex: string): [number, number, number] {
  let v = rgbCache.get(hex);
  if (v) return v;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const n = parseInt(h, 16);
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  rgbCache.set(hex, v);
  return v;
}

export function hexA(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  const m = (c: number): number => Math.max(0, Math.min(255, Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f))));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
