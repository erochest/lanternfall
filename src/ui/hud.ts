import { BIOMES, ROOMS_PER_BIOME } from '../data/biomes';
import type { RunState } from '../game/run';
import type { World } from '../game/world';

/** In-run heads-up display. Only touches the DOM when a value changes. */
export class Hud {
  readonly el: HTMLElement;
  private hpFill: HTMLElement;
  private hpLag: HTMLElement;
  private hpText: HTMLElement;
  private pearls: HTMLElement;
  private embers: HTMLElement;
  private wicks: HTMLElement;
  private room: HTMLElement;
  private boss: HTMLElement;
  private bossName: HTMLElement;
  private bossFill: HTMLElement;
  private bossArmor: HTMLElement;
  private pips: HTMLElement;
  private cache = new Map<string, string>();
  private lagHp = 1;
  onPause: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud hidden';
    this.el.innerHTML = `
      <div class="hud-tl">
        <div class="hpbar"><div class="hp-lag"></div><div class="hp-fill"></div><div class="hp-text"></div></div>
        <div class="hud-row">
          <span class="chip pearl" title="Pearls"><i></i><b class="v-pearls">0</b></span>
          <span class="chip ember" title="Embers"><i></i><b class="v-embers">0</b></span>
          <span class="chip wick" title="Rekindles"><i></i><b class="v-wicks">0</b></span>
        </div>
        <div class="pad-pips"></div>
      </div>
      <div class="hud-tc">
        <div class="room-label"></div>
        <div class="bossbar hidden"><div class="boss-name"></div><div class="boss-track"><div class="boss-fill"></div><div class="boss-armor"></div></div></div>
      </div>
      <div class="hud-tr"><button class="pause-btn" aria-label="Pause"><span></span><span></span></button></div>`;
    parent.appendChild(this.el);
    const q = (s: string): HTMLElement => this.el.querySelector(s)!;
    this.hpFill = q('.hp-fill');
    this.hpLag = q('.hp-lag');
    this.hpText = q('.hp-text');
    this.pearls = q('.v-pearls');
    this.embers = q('.v-embers');
    this.wicks = q('.v-wicks');
    this.room = q('.room-label');
    this.boss = q('.bossbar');
    this.bossName = q('.boss-name');
    this.bossFill = q('.boss-fill');
    this.bossArmor = q('.boss-armor');
    this.pips = q('.pad-pips');
    q('.pause-btn').addEventListener('click', () => this.onPause?.());
  }

  setVisible(v: boolean): void {
    this.el.classList.toggle('hidden', !v);
  }

  private set(key: string, value: string, apply: (v: string) => void): void {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply(value);
  }

  update(w: World, run: RunState, dt: number, showPips: boolean): void {
    const p = w.player;
    const frac = Math.max(0, p.hp / p.maxHp);
    this.lagHp = frac > this.lagHp ? frac : Math.max(frac, this.lagHp - dt * 0.6);
    this.set('hp', frac.toFixed(3), (v) => (this.hpFill.style.transform = `scaleX(${v})`));
    this.set('hplag', this.lagHp.toFixed(3), (v) => (this.hpLag.style.transform = `scaleX(${v})`));
    this.set('hpt', `${Math.ceil(p.hp)} / ${p.maxHp}`, (v) => (this.hpText.textContent = v));
    this.set('low', frac < 0.3 ? '1' : '0', (v) => this.el.classList.toggle('low', v === '1'));
    this.set('pearls', String(run.pearls), (v) => (this.pearls.textContent = v));
    this.set('embers', String(run.embers), (v) => (this.embers.textContent = v));
    this.set('wicks', String(run.rekindles), (v) => (this.wicks.textContent = v));

    const biome = BIOMES[run.biome];
    const label = run.room === ROOMS_PER_BIOME ? `${biome.name} · Guardian` : `${biome.name} · ${run.room + 1}/${ROOMS_PER_BIOME}`;
    this.set('room', label, (v) => (this.room.textContent = v));

    const b = w.boss;
    const showBoss = !!b && !b.dead && b.spawnT <= 0.9;
    this.set('bossOn', showBoss ? '1' : '0', (v) => this.boss.classList.toggle('hidden', v === '0'));
    if (b && showBoss) {
      this.set('bossName', b.boss?.name ?? '', (v) => (this.bossName.textContent = v));
      this.set('bossHp', (b.hp / b.maxHp).toFixed(3), (v) => (this.bossFill.style.transform = `scaleX(${v})`));
      this.set('bossArm', b.maxArmor > 0 ? (b.armor / b.maxArmor).toFixed(3) : '0', (v) => (this.bossArmor.style.transform = `scaleX(${v})`));
    }

    if (showPips) {
      const key = `${p.dashCharges}/${w.stats.dashCharges}|${p.flareCharges}/${w.stats.flareCharges}|${p.specialCd > 0 ? 1 : 0}`;
      this.set('pips', key, () => {
        const dash = Array.from({ length: w.stats.dashCharges }, (_, i) => `<i class="${i < p.dashCharges ? 'on' : ''}"></i>`).join('');
        const flare = Array.from({ length: w.stats.flareCharges }, (_, i) => `<i class="${i < p.flareCharges ? 'on' : ''}"></i>`).join('');
        this.pips.innerHTML = `<span class="pp dash">Dash ${dash}</span><span class="pp flare">Flare ${flare}</span><span class="pp sp ${p.specialCd > 0 ? '' : 'ready'}">Special</span>`;
      });
    } else {
      this.set('pips', '', () => (this.pips.innerHTML = ''));
    }
  }
}
