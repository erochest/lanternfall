import { emptyControls, type Controls } from '../game/entities';
import { TouchControls } from './touch';

export type Device = 'touch' | 'keyboard' | 'gamepad';
export type NavAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause' | 'tabPrev' | 'tabNext';

// Standard gamepad mapping indices.
const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const NAV_KEYS: Record<string, NavAction> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Enter: 'confirm',
  Space: 'confirm',
  NumpadEnter: 'confirm',
  Escape: 'back',
  Backspace: 'back',
  KeyQ: 'tabPrev',
  KeyE: 'tabNext',
};

function deadzone(x: number, y: number, dz: number): [number, number] {
  const m = Math.hypot(x, y);
  if (m < dz) return [0, 0];
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return [x * k, y * k];
}

export class Input {
  device: Device;
  onDevice: ((d: Device) => void) | null = null;
  readonly touch: TouchControls;

  private keys = new Set<string>();
  private keyEdges = new Set<string>();
  private nav: NavAction[] = [];
  private mouse = { x: 0, y: 0, buttons: [false, false, false], edges: [false, false, false], lastMove: -1e9 };
  private padPrev: boolean[] = [];
  private padNow: boolean[] = [];
  private padAxes: number[] = [0, 0, 0, 0];
  private padIndex: number | null = null;
  private navRepeat = 0;
  private navDir: NavAction | null = null;

  constructor(uiRoot: HTMLElement, canvas: HTMLCanvasElement) {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.device = coarse || 'ontouchstart' in window ? 'touch' : 'keyboard';
    this.touch = new TouchControls(uiRoot);
    this.touch.onTouch = () => this.setDevice('touch');

    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (NAV_KEYS[e.code] && ['up', 'down', 'left', 'right'].includes(NAV_KEYS[e.code])) this.pushNav(NAV_KEYS[e.code]);
        return;
      }
      this.setDevice('keyboard');
      this.keys.add(e.code);
      this.keyEdges.add(e.code);
      const nav = NAV_KEYS[e.code];
      if (nav) this.pushNav(nav);
      if (e.code === 'Escape' || e.code === 'KeyP') this.pushNav('pause');
      // Enter/Space would also natively "click" a focused button, double-firing
      // with our own nav confirm, so the nav layer owns them exclusively.
      if (['Space', 'Enter', 'NumpadEnter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.buttons = [false, false, false];
      this.touch.reset();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.lastMove = performance.now();
      this.setDevice('keyboard');
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.setDevice('keyboard');
      if (e.button <= 2) {
        this.mouse.buttons[e.button] = true;
        this.mouse.edges[e.button] = true;
      }
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.lastMove = performance.now();
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' && e.button <= 2) this.mouse.buttons[e.button] = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('gamepadconnected', (e) => {
      this.padIndex = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (this.padIndex === e.gamepad.index) this.padIndex = null;
    });
  }

  private setDevice(d: Device): void {
    if (this.device === d) return;
    this.device = d;
    this.onDevice?.(d);
  }

  private pushNav(a: NavAction): void {
    if (this.nav.length < 8) this.nav.push(a);
  }

  /** Read the gamepad. Call once per animation frame before polling. */
  update(dt: number): void {
    const pads = navigator.getGamepads?.() ?? [];
    let pad: Gamepad | null = null;
    if (this.padIndex !== null) pad = pads[this.padIndex] ?? null;
    if (!pad) for (const p of pads) if (p && p.connected) { pad = p; this.padIndex = p.index; break; }

    this.padPrev = this.padNow;
    if (!pad) {
      this.padNow = [];
      this.padAxes = [0, 0, 0, 0];
      return;
    }
    this.padNow = pad.buttons.map((b) => b.pressed || b.value > 0.5);
    this.padAxes = [pad.axes[0] ?? 0, pad.axes[1] ?? 0, pad.axes[2] ?? 0, pad.axes[3] ?? 0];
    const activity = this.padNow.some(Boolean) || this.padAxes.some((a) => Math.abs(a) > 0.4);
    if (activity) this.setDevice('gamepad');

    // Menu navigation from the pad, with key-repeat on held directions.
    const edge = (i: number): boolean => !!this.padNow[i] && !this.padPrev[i];
    if (edge(PAD.A)) this.pushNav('confirm');
    if (edge(PAD.B)) this.pushNav('back');
    if (edge(PAD.START) || edge(PAD.BACK)) this.pushNav('pause');
    if (edge(PAD.LB)) this.pushNav('tabPrev');
    if (edge(PAD.RB)) this.pushNav('tabNext');
    const [lx, ly] = this.padAxes;
    let dir: NavAction | null = null;
    if (this.padNow[PAD.UP] || ly < -0.6) dir = 'up';
    else if (this.padNow[PAD.DOWN] || ly > 0.6) dir = 'down';
    else if (this.padNow[PAD.LEFT] || lx < -0.6) dir = 'left';
    else if (this.padNow[PAD.RIGHT] || lx > 0.6) dir = 'right';
    if (dir !== this.navDir) {
      this.navDir = dir;
      this.navRepeat = 0.38;
      if (dir) this.pushNav(dir);
    } else if (dir) {
      this.navRepeat -= dt;
      if (this.navRepeat <= 0) {
        this.navRepeat = 0.13;
        this.pushNav(dir);
      }
    }
  }

  /** Drain queued menu navigation actions. */
  takeNav(): NavAction[] {
    const n = this.nav;
    this.nav = [];
    return n;
  }

  /** Build this frame's gameplay controls. `player` is the player's screen position. */
  pollGame(player: { x: number; y: number }): Controls {
    const c = emptyControls();
    const pad = this.padNow;
    const pPrev = this.padPrev;
    const padEdge = (i: number): boolean => !!pad[i] && !pPrev[i];
    const key = (k: string): boolean => this.keys.has(k);
    const keyEdge = (...ks: string[]): boolean => ks.some((k) => this.keyEdges.has(k));

    // Movement: keyboard, then gamepad stick/dpad, then touch stick.
    let mx = 0;
    let my = 0;
    for (const [k, [dx, dy]] of Object.entries(MOVE_KEYS)) {
      if (this.keys.has(k)) {
        mx += dx;
        my += dy;
      }
    }
    if (mx || my) {
      const l = Math.hypot(mx, my);
      mx /= l;
      my /= l;
    } else {
      const [lx, ly] = deadzone(this.padAxes[0], this.padAxes[1], 0.2);
      mx = lx + (pad[PAD.RIGHT] ? 1 : 0) - (pad[PAD.LEFT] ? 1 : 0);
      my = ly + (pad[PAD.DOWN] ? 1 : 0) - (pad[PAD.UP] ? 1 : 0);
      if (!mx && !my) {
        mx = this.touch.moveX;
        my = this.touch.moveY;
      }
    }
    c.moveX = Math.max(-1, Math.min(1, mx));
    c.moveY = Math.max(-1, Math.min(1, my));

    // Aim
    const [rx, ry] = deadzone(this.padAxes[2], this.padAxes[3], 0.35);
    const touchAim = this.touch.aim();
    if (rx || ry) {
      c.aimX = rx;
      c.aimY = ry;
      c.aimActive = true;
    } else if (touchAim) {
      c.aimX = touchAim.x;
      c.aimY = touchAim.y;
      c.aimActive = true;
    } else if (this.device === 'keyboard' && performance.now() - this.mouse.lastMove < 4000) {
      c.aimX = this.mouse.x - player.x;
      c.aimY = this.mouse.y - player.y;
      c.aimActive = Math.hypot(c.aimX, c.aimY) > 8;
    }

    c.attack = key('KeyJ') || this.mouse.buttons[0] || !!pad[PAD.X] || !!pad[PAD.RT] || this.touch.held('attack');
    c.attackPressed = keyEdge('KeyJ') || this.mouse.edges[0] || padEdge(PAD.X) || padEdge(PAD.RT) || this.touch.take('attack');
    c.specialPressed = keyEdge('KeyK') || this.mouse.edges[2] || padEdge(PAD.Y) || padEdge(PAD.LT) || this.touch.take('special');
    c.dashPressed = keyEdge('Space', 'ShiftLeft', 'ShiftRight') || padEdge(PAD.A) || padEdge(PAD.RB) || this.touch.take('dash');
    c.flarePressed = keyEdge('KeyE', 'KeyL', 'KeyQ') || padEdge(PAD.B) || padEdge(PAD.LB) || this.touch.take('flare');

    this.keyEdges.clear();
    this.mouse.edges = [false, false, false];
    return c;
  }

  /** Drop any stale edges (e.g. when a menu closes) so they don't leak into gameplay. */
  flush(): void {
    this.keyEdges.clear();
    this.mouse.edges = [false, false, false];
    this.nav = [];
    for (const b of ['attack', 'special', 'dash', 'flare'] as const) this.touch.take(b);
  }

  rumble(ms: number, strength: number): void {
    if (this.device === 'gamepad' && this.padIndex !== null) {
      const pad = navigator.getGamepads?.()[this.padIndex];
      const act = (pad as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } }) | null)?.vibrationActuator;
      act?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: Math.min(1, strength * 1.2) }).catch(() => {});
    } else if (this.device === 'touch' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(Math.round(ms * 0.6));
      } catch {
        /* unsupported */
      }
    }
  }
}
