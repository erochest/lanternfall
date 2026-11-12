import type { NavAction } from '../input/input';

export type Handlers = Record<string, (el: HTMLElement) => void>;

export interface ViewSpec {
  html: string;
  handlers?: Handlers;
  onBack?: () => void;
  onTab?: (dir: -1 | 1) => void;
  /** CSS selector of the element to focus first. */
  focus?: string;
  className?: string;
}

const FOCUSABLE = '[data-act]:not([disabled]):not(.hidden)';

/**
 * Hosts one full-screen view and an optional modal on top. Clicks are routed
 * through `data-act` attributes; gamepad/keyboard input moves focus spatially.
 */
export class UI {
  readonly root: HTMLElement;
  readonly screenEl: HTMLElement;
  readonly modalEl: HTMLElement;
  readonly toastEl: HTMLElement;
  readonly bannerEl: HTMLElement;
  readonly fadeEl: HTMLElement;
  private screen: ViewSpec | null = null;
  private modals: ViewSpec[] = [];
  private guardUntil = 0;
  onSound: ((name: string) => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.screenEl = this.mk('screen');
    this.modalEl = this.mk('modal hidden');
    this.toastEl = this.mk('toasts');
    this.bannerEl = this.mk('banner');
    this.fadeEl = this.mk('fade');
    for (const el of [this.screenEl, this.modalEl]) {
      el.addEventListener('click', (e) => this.route(e, el === this.modalEl));
    }
  }

  private mk(cls: string): HTMLElement {
    const el = document.createElement('div');
    el.className = cls;
    this.root.appendChild(el);
    return el;
  }

  private route(e: MouseEvent, modal: boolean): void {
    if (performance.now() < this.guardUntil) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!target || target.hasAttribute('disabled')) return;
    const spec = modal ? this.modals[this.modals.length - 1] : this.screen;
    if (!spec) return;
    const fn = spec.handlers?.[target.dataset.act!];
    if (fn) {
      this.onSound?.(target.dataset.act === 'back' ? 'uiBack' : 'ui');
      fn(target);
    }
  }

  get hasModal(): boolean {
    return this.modals.length > 0;
  }

  showScreen(spec: ViewSpec | null): void {
    this.screen = spec;
    this.screenEl.className = `screen ${spec?.className ?? ''}`;
    this.screenEl.innerHTML = spec?.html ?? '';
    this.screenEl.classList.toggle('hidden', !spec);
    if (spec && !this.hasModal) this.focusFirst(this.screenEl, spec.focus);
  }

  /** Re-render the current screen, keeping focus on the same action if possible. */
  refreshScreen(spec: ViewSpec): void {
    const active = document.activeElement as HTMLElement | null;
    const key = active && this.screenEl.contains(active) ? active.dataset.key ?? null : null;
    const scrollers = Array.from(this.screenEl.querySelectorAll<HTMLElement>('[data-scroll]')).map((el) => [el.dataset.scroll, el.scrollTop, el.scrollLeft] as const);
    this.screen = spec;
    this.screenEl.innerHTML = spec.html;
    for (const [k, top, left] of scrollers) {
      const el = this.screenEl.querySelector<HTMLElement>(`[data-scroll="${k}"]`);
      if (el) {
        el.scrollTop = top;
        el.scrollLeft = left;
      }
    }
    if (this.hasModal) return;
    const again = key ? this.screenEl.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) : null;
    if (again && !again.hasAttribute('disabled')) again.focus({ preventScroll: true });
    else this.focusFirst(this.screenEl, spec.focus);
  }

  pushModal(spec: ViewSpec, guardMs = 0): void {
    this.modals.push(spec);
    this.renderModal(spec);
    if (guardMs > 0) this.guardUntil = performance.now() + guardMs;
  }

  replaceModal(spec: ViewSpec): void {
    this.modals[this.modals.length - 1] = spec;
    this.renderModal(spec);
  }

  private renderModal(spec: ViewSpec): void {
    this.modalEl.className = `modal ${spec.className ?? ''}`;
    this.modalEl.innerHTML = spec.html;
    this.focusFirst(this.modalEl, spec.focus);
  }

  popModal(): void {
    this.modals.pop();
    const top = this.modals[this.modals.length - 1];
    if (top) this.renderModal(top);
    else {
      this.modalEl.className = 'modal hidden';
      this.modalEl.innerHTML = '';
      if (this.screen) this.focusFirst(this.screenEl, this.screen.focus);
    }
  }

  clearModals(): void {
    this.modals = [];
    this.modalEl.className = 'modal hidden';
    this.modalEl.innerHTML = '';
  }

  private focusFirst(container: HTMLElement, selector?: string): void {
    const el = (selector && container.querySelector<HTMLElement>(selector)) || container.querySelector<HTMLElement>(FOCUSABLE);
    el?.focus({ preventScroll: true });
  }

  /** Apply gamepad / keyboard navigation to the topmost view. */
  handleNav(actions: NavAction[]): void {
    for (const a of actions) {
      const container = this.hasModal ? this.modalEl : this.screenEl;
      const spec = this.hasModal ? this.modals[this.modals.length - 1] : this.screen;
      if (!spec) return;
      if (a === 'back' || a === 'pause') {
        if (spec.onBack) {
          this.onSound?.('uiBack');
          spec.onBack();
        }
        return; // view probably changed; drop the rest
      }
      if (a === 'tabPrev' || a === 'tabNext') {
        spec.onTab?.(a === 'tabPrev' ? -1 : 1);
        continue;
      }
      if (a === 'confirm') {
        const el = document.activeElement as HTMLElement | null;
        if (el && container.contains(el) && el.matches(FOCUSABLE)) {
          el.click();
          return;
        }
        this.focusFirst(container, spec.focus);
        continue;
      }
      this.moveFocus(container, a);
    }
  }

  private moveFocus(container: HTMLElement, dir: 'up' | 'down' | 'left' | 'right'): void {
    const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const cur = document.activeElement as HTMLElement | null;
    if (!cur || !items.includes(cur)) {
      items[0].focus({ preventScroll: true });
      items[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }
    const cr = cur.getBoundingClientRect();
    const cx = cr.left + cr.width / 2;
    const cy = cr.top + cr.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      let primary: number;
      let secondary: number;
      switch (dir) {
        case 'up':
          primary = -dy;
          secondary = Math.abs(dx);
          break;
        case 'down':
          primary = dy;
          secondary = Math.abs(dx);
          break;
        case 'left':
          primary = -dx;
          secondary = Math.abs(dy);
          break;
        case 'right':
          primary = dx;
          secondary = Math.abs(dy);
          break;
      }
      if (primary <= 4) continue;
      const score = primary + secondary * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) {
      best.focus({ preventScroll: true });
      best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      this.onSound?.('uiMove');
    }
  }

  toast(text: string, color = '#fff3c4'): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.setProperty('--c', color);
    el.textContent = text;
    this.toastEl.appendChild(el);
    while (this.toastEl.children.length > 4) this.toastEl.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 1700);
    setTimeout(() => el.remove(), 2200);
  }

  banner(title: string, sub = '', kind: 'room' | 'boss' = 'room'): void {
    this.bannerEl.innerHTML = `<div class="banner-in ${kind}"><div class="b-title">${title}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}</div>`;
    const inner = this.bannerEl.firstElementChild as HTMLElement;
    setTimeout(() => inner.classList.add('out'), kind === 'boss' ? 2300 : 1600);
    setTimeout(() => {
      if (this.bannerEl.firstElementChild === inner) this.bannerEl.innerHTML = '';
    }, 3000);
  }

  /** Fade to black, run `mid`, then fade back in. */
  fade(mid: () => void, ms = 260): void {
    this.fadeEl.classList.add('on');
    setTimeout(() => {
      mid();
      requestAnimationFrame(() => this.fadeEl.classList.remove('on'));
    }, ms);
  }
}
