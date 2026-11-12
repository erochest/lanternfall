/**
 * On-screen touch controls: a floating joystick on one half of the screen and
 * a thumb cluster of action buttons on the other.
 *
 * - Attack: tap to auto-aim, hold to keep attacking, drag while holding to aim.
 * - Special / Flare: tap to auto-aim; drag and release to aim manually
 *   (or fire on press if drag-aim is disabled).
 * - Dash: fires on press.
 */

export type TouchButton = 'attack' | 'special' | 'dash' | 'flare';

interface ButtonState {
  el: HTMLElement;
  id: number | null;
  held: boolean;
  pressed: boolean;
  released: boolean;
  sx: number;
  sy: number;
  dx: number;
  dy: number;
  aiming: boolean;
  /** Aim direction captured at release. */
  releaseAim: { x: number; y: number } | null;
}

const AIM_THRESHOLD = 18;
const STICK_RADIUS = 56;

const ICONS: Record<TouchButton, string> = {
  attack: `<svg viewBox="0 0 24 24"><path d="M4 20 L14 10 M14 10 L19 4 L20 5 L15 10 Z M6 14 L10 18" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  special: `<svg viewBox="0 0 24 24"><path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" fill="currentColor"/></svg>`,
  dash: `<svg viewBox="0 0 24 24"><path d="M4 6 L11 12 L4 18 M12 6 L19 12 L12 18" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  flare: `<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="5" fill="currentColor"/><path d="M12 2 V5 M4.5 5.5 L6.6 7.6 M19.5 5.5 L17.4 7.6 M2 13 H5 M19 13 H22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
};

export class TouchControls {
  readonly el: HTMLElement;
  private zone: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private ox = 0;
  private oy = 0;
  private sx = 0;
  private sy = 0;
  private buttons: Record<TouchButton, ButtonState>;
  dragAim = true;
  onTouch: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'touch';
    this.el.innerHTML = `
      <div class="stick-zone"></div>
      <div class="stick-base"><div class="stick-knob"></div></div>
      <div class="tbtns">
        <button class="tbtn tb-attack" data-b="attack" aria-label="Attack">${ICONS.attack}</button>
        <button class="tbtn tb-dash" data-b="dash" aria-label="Dash">${ICONS.dash}<span class="pips"></span></button>
        <button class="tbtn tb-special" data-b="special" aria-label="Special">${ICONS.special}</button>
        <button class="tbtn tb-flare" data-b="flare" aria-label="Flare">${ICONS.flare}<span class="pips"></span></button>
      </div>`;
    parent.appendChild(this.el);
    this.zone = this.el.querySelector('.stick-zone')!;
    this.base = this.el.querySelector('.stick-base')!;
    this.knob = this.el.querySelector('.stick-knob')!;

    const mk = (b: TouchButton): ButtonState => ({
      el: this.el.querySelector(`[data-b="${b}"]`)!,
      id: null,
      held: false,
      pressed: false,
      released: false,
      sx: 0,
      sy: 0,
      dx: 0,
      dy: 0,
      aiming: false,
      releaseAim: null,
    });
    this.buttons = { attack: mk('attack'), special: mk('special'), dash: mk('dash'), flare: mk('flare') };

    this.zone.addEventListener('pointerdown', (e) => this.stickDown(e));
    this.zone.addEventListener('pointermove', (e) => this.stickMove(e));
    this.zone.addEventListener('pointerup', (e) => this.stickUp(e));
    this.zone.addEventListener('pointercancel', (e) => this.stickUp(e));
    for (const [name, st] of Object.entries(this.buttons) as [TouchButton, ButtonState][]) {
      st.el.addEventListener('pointerdown', (e) => this.btnDown(name, st, e));
      st.el.addEventListener('pointermove', (e) => this.btnMove(st, e));
      st.el.addEventListener('pointerup', (e) => this.btnUp(name, st, e, false));
      st.el.addEventListener('pointercancel', (e) => this.btnUp(name, st, e, true));
      st.el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  setVisible(v: boolean): void {
    this.el.classList.toggle('hidden', !v);
    if (!v) this.reset();
  }

  setLayout(leftHanded: boolean, scale: number): void {
    this.el.classList.toggle('lefty', leftHanded);
    this.el.style.setProperty('--tscale', String(scale));
  }

  reset(): void {
    this.stickId = null;
    this.sx = this.sy = 0;
    this.base.classList.remove('on');
    for (const st of Object.values(this.buttons)) {
      st.id = null;
      st.held = st.pressed = st.released = st.aiming = false;
      st.releaseAim = null;
      st.el.classList.remove('down');
    }
  }

  // ------------------------------------------------------------ stick

  private stickDown(e: PointerEvent): void {
    if (this.stickId !== null) return;
    e.preventDefault();
    this.onTouch?.();
    this.zone.setPointerCapture(e.pointerId);
    this.stickId = e.pointerId;
    this.ox = e.clientX;
    this.oy = e.clientY;
    this.sx = this.sy = 0;
    this.base.style.transform = `translate(${this.ox}px, ${this.oy}px)`;
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.base.classList.add('on');
  }

  private stickMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    let dx = e.clientX - this.ox;
    let dy = e.clientY - this.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS) {
      // Drag the base along so reversing direction is instant.
      const over = d - STICK_RADIUS;
      this.ox += (dx / d) * over;
      this.oy += (dy / d) * over;
      dx = e.clientX - this.ox;
      dy = e.clientY - this.oy;
      this.base.style.transform = `translate(${this.ox}px, ${this.oy}px)`;
    }
    this.sx = dx / STICK_RADIUS;
    this.sy = dy / STICK_RADIUS;
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  private stickUp(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.sx = this.sy = 0;
    this.base.classList.remove('on');
  }

  // ------------------------------------------------------------ buttons

  private btnDown(name: TouchButton, st: ButtonState, e: PointerEvent): void {
    e.preventDefault();
    this.onTouch?.();
    if (st.id !== null) return;
    st.el.setPointerCapture(e.pointerId);
    st.id = e.pointerId;
    st.held = true;
    st.sx = e.clientX;
    st.sy = e.clientY;
    st.dx = st.dy = 0;
    st.aiming = false;
    st.el.classList.add('down');
    const deferred = (name === 'special' || name === 'flare') && this.dragAim;
    if (!deferred) st.pressed = true;
  }

  private btnMove(st: ButtonState, e: PointerEvent): void {
    if (e.pointerId !== st.id) return;
    st.dx = e.clientX - st.sx;
    st.dy = e.clientY - st.sy;
    if (Math.hypot(st.dx, st.dy) > AIM_THRESHOLD) st.aiming = true;
  }

  private btnUp(name: TouchButton, st: ButtonState, e: PointerEvent, cancel: boolean): void {
    if (e.pointerId !== st.id) return;
    st.id = null;
    st.held = false;
    st.el.classList.remove('down');
    const deferred = (name === 'special' || name === 'flare') && this.dragAim;
    if (deferred && !cancel) {
      st.pressed = true;
      st.releaseAim = st.aiming ? { x: st.dx, y: st.dy } : null;
    }
    st.aiming = false;
  }

  // ------------------------------------------------------------ reading

  get moveX(): number {
    return this.sx;
  }
  get moveY(): number {
    return this.sy;
  }

  held(b: TouchButton): boolean {
    return this.buttons[b].held;
  }

  /** Returns true once per press. */
  take(b: TouchButton): boolean {
    const st = this.buttons[b];
    if (st.pressed) {
      st.pressed = false;
      return true;
    }
    return false;
  }

  /** Aim vector for this frame: release-aim of special/flare, else live attack drag. */
  aim(): { x: number; y: number } | null {
    for (const b of ['special', 'flare'] as const) {
      const st = this.buttons[b];
      if (st.pressed && st.releaseAim) return st.releaseAim;
    }
    const a = this.buttons.attack;
    if (a.held && a.aiming) return { x: a.dx, y: a.dy };
    return null;
  }

  aimPreview(): { angle: number; kind: TouchButton } | null {
    for (const b of ['special', 'flare', 'attack'] as const) {
      const st = this.buttons[b];
      if (st.held && st.aiming) return { angle: Math.atan2(st.dy, st.dx), kind: b };
    }
    return null;
  }

  setStatus(s: { specialCd: number; dash: number; dashMax: number; flare: number; flareMax: number; flareCd: number }): void {
    const sp = this.buttons.special.el;
    sp.style.setProperty('--cd', s.specialCd.toFixed(3));
    sp.classList.toggle('cooling', s.specialCd > 0);
    const fl = this.buttons.flare.el;
    fl.style.setProperty('--cd', s.flare > 0 ? '0' : s.flareCd.toFixed(3));
    fl.classList.toggle('cooling', s.flare <= 0);
    setPips(this.buttons.flare.el, s.flare, s.flareMax);
    setPips(this.buttons.dash.el, s.dash, s.dashMax);
    this.buttons.dash.el.classList.toggle('cooling', s.dash <= 0);
  }
}

function setPips(el: HTMLElement, n: number, max: number): void {
  const pips = el.querySelector('.pips') as HTMLElement | null;
  if (!pips) return;
  const key = `${n}/${max}`;
  if (pips.dataset.k === key) return;
  pips.dataset.k = key;
  pips.innerHTML = Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
}
