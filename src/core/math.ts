export interface Vec {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const approach = (v: number, target: number, step: number): number =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

export const len = (x: number, y: number): number => Math.hypot(x, y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const distSq = (a: Vec, b: Vec): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};
export const angleTo = (from: Vec, to: Vec): number => Math.atan2(to.y - from.y, to.x - from.x);
export const fromAngle = (a: number, l = 1): Vec => ({ x: Math.cos(a) * l, y: Math.sin(a) * l });

/** Normalise to a unit vector; returns {0,0} for zero-length input. */
export function norm(x: number, y: number): Vec {
  const l = Math.hypot(x, y);
  return l > 1e-9 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}

/** Signed smallest difference b - a, in [-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Rotate angle `a` toward `target` by at most `step` radians. */
export function turnToward(a: number, target: number, step: number): number {
  const d = angleDiff(a, target);
  return Math.abs(d) <= step ? target : a + Math.sign(d) * step;
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number): number => t * t * t;

// ---------------------------------------------------------------------------
// Hit shapes. Used both for player attacks and enemy telegraphs so that what
// the player sees is exactly what hits them.
// ---------------------------------------------------------------------------

export type Shape =
  | { kind: 'circle'; x: number; y: number; r: number }
  /** Sector: centre, radius, facing angle, total spread (radians). */
  | { kind: 'arc'; x: number; y: number; r: number; angle: number; spread: number }
  /** Rectangle starting at (x,y) extending `length` along `angle`, `width` wide. */
  | { kind: 'line'; x: number; y: number; angle: number; length: number; width: number }
  /** Annulus centred on (x,y): radius r, band thickness. */
  | { kind: 'ring'; x: number; y: number; r: number; thickness: number };

export function shapeHitsCircle(s: Shape, cx: number, cy: number, cr: number): boolean {
  switch (s.kind) {
    case 'circle': {
      const rr = s.r + cr;
      return distSq(s, { x: cx, y: cy }) <= rr * rr;
    }
    case 'arc': {
      const dx = cx - s.x;
      const dy = cy - s.y;
      const d = Math.hypot(dx, dy);
      if (d > s.r + cr) return false;
      if (d <= cr) return true; // target overlaps the origin
      const half = s.spread / 2 + Math.asin(Math.min(1, cr / d));
      return Math.abs(angleDiff(s.angle, Math.atan2(dy, dx))) <= half;
    }
    case 'line': {
      const ux = Math.cos(s.angle);
      const uy = Math.sin(s.angle);
      const dx = cx - s.x;
      const dy = cy - s.y;
      const along = dx * ux + dy * uy;
      if (along < -cr || along > s.length + cr) return false;
      const perp = Math.abs(-dx * uy + dy * ux);
      return perp <= s.width / 2 + cr;
    }
    case 'ring': {
      const d = Math.hypot(cx - s.x, cy - s.y);
      return Math.abs(d - s.r) <= s.thickness / 2 + cr;
    }
  }
}

// ---------------------------------------------------------------------------
// Collision helpers
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Push a circle out of an axis-aligned rectangle. Returns the push vector
 * (zero if not overlapping). Mutates `p`.
 */
export function pushCircleOutOfRect(p: Vec, r: number, rect: Rect): Vec {
  const nx = clamp(p.x, rect.x, rect.x + rect.w);
  const ny = clamp(p.y, rect.y, rect.y + rect.h);
  let dx = p.x - nx;
  let dy = p.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return { x: 0, y: 0 };
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    const push = r - d;
    dx = (dx / d) * push;
    dy = (dy / d) * push;
  } else {
    // Centre is inside the rect: push out along the shortest axis.
    const left = p.x - rect.x;
    const right = rect.x + rect.w - p.x;
    const top = p.y - rect.y;
    const bottom = rect.y + rect.h - p.y;
    const m = Math.min(left, right, top, bottom);
    dx = dy = 0;
    if (m === left) dx = -(left + r);
    else if (m === right) dx = right + r;
    else if (m === top) dy = -(top + r);
    else dy = bottom + r;
  }
  p.x += dx;
  p.y += dy;
  return { x: dx, y: dy };
}

export function circleIntersectsRect(cx: number, cy: number, r: number, rect: Rect): boolean {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
