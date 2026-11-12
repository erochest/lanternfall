import { AudioEngine } from './audio/audio';
import { Rng } from './core/rng';
import { BIOMES } from './data/biomes';
import { getBoss } from './data/enemies';
import { CURRENT_INFO, type Current } from './data/glyphs';
import { emptyControls, type Controls, type GameEvent } from './game/entities';
import {
  MAX_TIDE,
  buyForge,
  equipArmor,
  equipWeapon,
  toggleTrinket,
  unlockArmor,
  unlockTrinket,
  unlockWeapon,
  upgradeArmor,
  upgradeWeapon,
  type PurchaseResult,
} from './game/profile';
import { planRoom } from './game/room';
import {
  HEART_BONUS,
  RESTORE_FRACTION,
  advanceRoom,
  bossEmbers,
  bossStarglass,
  buyShopItem,
  computeMods,
  depthOf,
  embersReward,
  generateShop,
  isBossRoom,
  isFinalBiome,
  newRun,
  offerGlyphs,
  pearlsReward,
  rollDoors,
  takeGlyph,
  type Reward,
  type RunState,
} from './game/run';
import { loadSave, writeSave, type SaveData, type Settings } from './game/save';
import { computeStats } from './game/stats';
import { FIXED_DT, World } from './game/world';
import type { Device } from './input/input';
import { Input } from './input/input';
import { Renderer } from './render/renderer';
import { UI } from './ui/dom';
import { Hud } from './ui/hud';
import {
  HUB_TABS,
  choiceView,
  confirmView,
  helpView,
  hubView,
  pauseView,
  settingsView,
  shopView,
  summaryView,
  titleView,
  type HubTab,
  type RunSummary,
} from './ui/views';

type Mode = 'title' | 'hub' | 'run' | 'summary';

export class App {
  readonly data: SaveData;
  readonly renderer: Renderer;
  readonly input: Input;
  readonly audio = new AudioEngine();
  readonly ui: UI;
  readonly hud: Hud;
  world: World | null = null;
  mode: Mode = 'title';
  hubTab: HubTab = 'descend';

  private acc = 0;
  private lastTs = 0;
  private menuTime = 0;
  private pendingEnd = -1;
  private pendingVictory = false;
  private bossLoot: { starglass: number; embers: number } | null = null;
  private transitioning = false;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.data = loadSave();
    this.renderer = new Renderer(canvas);
    this.ui = new UI(uiRoot);
    this.hud = new Hud(uiRoot);
    this.input = new Input(uiRoot, canvas);
    this.ui.onSound = (n) => this.audio.play(n);
    this.hud.onPause = () => this.openPause();
    this.input.onDevice = (d) => this.onDevice(d);
    this.applySettings();
    this.onDevice(this.input.device);

    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.renderer.resize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.mode === 'run' && !this.ui.hasModal && this.world && !this.transitioning) this.openPause();
        this.audio.suspend();
        this.save();
      } else {
        this.audio.resume();
      }
    });
    // Audio can only start after a gesture.
    const unlock = (): void => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('gamepadconnected', unlock);
  }

  get run(): RunState | null {
    return this.data.run;
  }

  get settings(): Settings {
    return this.data.settings;
  }

  start(): void {
    this.showTitle();
    requestAnimationFrame((t) => this.frame(t));
  }

  save(): void {
    writeSave(this.data);
  }

  // ---------------------------------------------------------------- devices & settings

  private onDevice(d: Device): void {
    document.body.dataset.device = d;
    this.input.touch.setVisible(d === 'touch' && this.mode === 'run');
  }

  private applySettings(): void {
    const s = this.settings;
    this.audio.setVolumes(s.sfx, s.ambient);
    this.input.touch.dragAim = s.dragAim;
    this.input.touch.setLayout(s.leftHanded, s.controlScale);
    if (this.world) this.world.cfg.aimAssist = s.aimAssist;
  }

  private openSettings(): void {
    const render = (): ReturnType<typeof settingsView> =>
      settingsView(
        this.settings,
        (k, v) => {
          (this.settings as unknown as Record<string, number | boolean>)[k] = v;
          this.applySettings();
          this.save();
          this.ui.replaceModal(render());
          const el = this.ui.modalEl.querySelector<HTMLElement>(`[data-key="set:${k}"]`);
          el?.focus({ preventScroll: true });
        },
        () => this.ui.popModal(),
      );
    this.ui.pushModal(render());
  }

  // ---------------------------------------------------------------- screens

  private showTitle(): void {
    this.mode = 'title';
    this.hud.setVisible(false);
    this.input.touch.setVisible(false);
    this.ui.showScreen(
      titleView({
        hasRun: !!this.run,
        device: this.input.device,
        onContinue: () => this.continueRun(),
        onPlay: () => this.showHub(),
        onSettings: () => this.openSettings(),
      }),
    );
  }

  private showHub(tab: HubTab = this.hubTab): void {
    this.mode = 'hub';
    this.hubTab = tab;
    this.hud.setVisible(false);
    this.input.touch.setVisible(false);
    this.world = null;
    this.audio.setAmbient(null);
    this.ui.showScreen(this.hubSpec());
  }

  private hubSpec(): ReturnType<typeof hubView> {
    return hubView(this.data.profile, this.run, this.hubTab, {
      onTab: (t) => {
        this.hubTab = t;
        this.ui.showScreen(this.hubSpec());
        this.ui.screenEl.querySelector<HTMLElement>(`[data-key="tab:${t}"]`)?.focus({ preventScroll: true });
      },
      onTabStep: (d) => {
        const i = HUB_TABS.findIndex((t) => t.id === this.hubTab);
        const next = HUB_TABS[(i + d + HUB_TABS.length) % HUB_TABS.length].id;
        this.hubTab = next;
        this.audio.play('uiMove');
        this.ui.showScreen(this.hubSpec());
      },
      onDescend: () => this.startRun(),
      onContinue: () => this.continueRun(),
      onAbandon: () =>
        this.ui.pushModal(
          confirmView(
            'Abandon descent?',
            'You keep the embers you carried, but your glyphs and progress are lost.',
            'Abandon',
            () => {
              this.ui.popModal();
              this.endRun(false, true);
            },
            () => this.ui.popModal(),
          ),
        ),
      onSettings: () => this.openSettings(),
      onTide: (d) => {
        const p = this.data.profile;
        p.tide = Math.max(0, Math.min(Math.min(MAX_TIDE, p.maxTide), p.tide + d));
        this.save();
        this.ui.refreshScreen(this.hubSpec());
      },
      onBack: () => this.showTitle(),
      onBuy: (kind, id) => this.hubPurchase(kind, id),
    });
  }

  private hubPurchase(kind: string, id: string): void {
    const p = this.data.profile;
    let r: PurchaseResult = { ok: true };
    switch (kind) {
      case 'weapon':
        r = unlockWeapon(p, id);
        if (r.ok) equipWeapon(p, id);
        break;
      case 'weapon-up':
        r = upgradeWeapon(p, id);
        break;
      case 'equip-weapon':
        equipWeapon(p, id);
        break;
      case 'armor':
        r = unlockArmor(p, id);
        if (r.ok) equipArmor(p, id);
        break;
      case 'armor-up':
        r = upgradeArmor(p, id);
        break;
      case 'equip-armor':
        equipArmor(p, id);
        break;
      case 'trinket':
        r = unlockTrinket(p, id);
        if (r.ok) toggleTrinket(p, id);
        break;
      case 'toggle-trinket':
        toggleTrinket(p, id);
        break;
      case 'forge':
        r = buyForge(p, id as Parameters<typeof buyForge>[1]);
        break;
    }
    this.audio.play(r.ok ? 'buy' : 'deny');
    this.save();
    this.ui.refreshScreen(this.hubSpec());
  }

  // ---------------------------------------------------------------- run lifecycle

  private startRun(): void {
    const p = this.data.profile;
    this.data.run = newRun(p);
    p.stats.runs++;
    this.save();
    this.enterRun(true);
  }

  private continueRun(): void {
    if (!this.run) return this.showHub();
    this.enterRun(false);
  }

  private enterRun(fresh: boolean): void {
    this.mode = 'run';
    this.ui.showScreen(null);
    this.ui.clearModals();
    this.hud.setVisible(true);
    this.input.touch.setVisible(this.input.device === 'touch');
    this.pendingEnd = -1;
    this.pendingVictory = false;
    this.enterRoom(fresh);
    if (!this.data.profile.tutorialDone) {
      this.ui.pushModal(
        helpView(this.input.device, () => {
          this.data.profile.tutorialDone = true;
          this.save();
          this.ui.popModal();
          this.input.flush();
        }, true),
      );
    }
  }

  private roomKind(run: RunState): 'combat' | 'boss' | 'shop' {
    if (isBossRoom(run)) return 'boss';
    if (run.roomReward.kind === 'shop') return 'shop';
    return 'combat';
  }

  private withRng<T>(fn: (rng: Rng) => T): T {
    const run = this.run!;
    const rng = new Rng(run.rngState);
    const v = fn(rng);
    run.rngState = rng.state;
    return v;
  }

  private enterRoom(fresh: boolean): void {
    const run = this.run!;
    const profile = this.data.profile;
    const kind = this.roomKind(run);
    if (fresh || !run.doors) {
      this.withRng((rng) => {
        run.roomSeed = rng.int(1, 2 ** 31 - 2);
        run.doors = isBossRoom(run) && isFinalBiome(run) ? [] : rollDoors(run, profile, rng);
        if (kind === 'shop') run.shop = generateShop(run, profile, rng);
      });
      run.cleared = false;
    }
    const mods = computeMods(run);
    const stats = computeStats(profile, run, mods);
    if (run.hp < 0) run.hp = stats.maxHp;
    run.hp = Math.min(run.hp, stats.maxHp);
    const plan = planRoom(run.biome, run.room, run.tide, kind, new Rng(run.roomSeed));
    const touch = this.input.device === 'touch';
    this.world = new World({
      biomeIndex: run.biome,
      roomIndex: run.room,
      tide: run.tide,
      kind,
      plan,
      stats,
      mods,
      weaponId: run.weapon,
      reward: kind === 'boss' ? { kind: 'boss' } : run.roomReward,
      doors: run.doors ?? [],
      playerHp: run.hp,
      aimAssist: this.settings.aimAssist,
      seed: run.roomSeed,
      maxParticles: touch ? 360 : 650,
      cleared: run.cleared,
    });
    this.renderer.snapCamera(this.world);
    this.acc = 0;
    const biome = BIOMES[run.biome];
    this.audio.setAmbient(biome.ambient.base, biome.ambient.type);
    this.save();

    if (kind === 'boss' && !run.cleared) {
      const b = getBoss(biome.boss);
      setTimeout(() => this.ui.banner(b.name, b.title, 'boss'), 700);
    } else if (run.room === 0 && !run.cleared) {
      this.ui.banner(biome.name, biome.subtitle);
    } else if (kind === 'shop') {
      this.ui.banner('A Quiet Grotto', 'The merchant waits by the altar');
    }
  }

  private refreshStats(): void {
    const w = this.world;
    const run = this.run;
    if (!w || !run) return;
    const mods = computeMods(run);
    const stats = computeStats(this.data.profile, run, mods);
    Object.assign(w.mods, mods);
    Object.assign(w.stats, stats);
    const p = w.player;
    const diff = stats.maxHp - p.maxHp;
    p.maxHp = stats.maxHp;
    if (diff > 0) p.hp += diff;
    p.hp = Math.min(p.hp, p.maxHp);
    p.specialCdMax = w.weapon.special.cooldown * stats.specialCdMult;
  }

  private finishRoomReward(): void {
    const w = this.world;
    const run = this.run;
    if (!w || !run) return;
    w.finishReward();
    if (w.doors.length) this.ui.toast('The way onward opens ↑', '#ffe9a8');
    run.cleared = true;
    run.hp = Math.ceil(w.player.hp);
    this.save();
    this.input.flush();
  }

  private endRun(victory: boolean, abandoned = false): void {
    const run = this.run;
    if (!run) return;
    const p = this.data.profile;
    p.embers += run.embers;
    p.starglass += run.starglass;
    p.stats.totalEmbers += run.embers;
    p.stats.kills += run.kills;
    p.stats.bestDepth = Math.max(p.stats.bestDepth, depthOf(run));
    let newTide = false;
    if (victory) {
      p.stats.wins++;
      if (run.tide + 1 > p.maxTide && p.maxTide < MAX_TIDE) {
        p.maxTide = Math.min(MAX_TIDE, run.tide + 1);
        newTide = true;
      }
    }
    const summary: RunSummary = {
      victory,
      depth: depthOf(run),
      biome: BIOMES[run.biome].name,
      kills: run.kills,
      time: run.time,
      embers: run.embers,
      starglass: run.starglass,
      glyphs: run.glyphs.length,
      newTide,
    };
    this.data.run = null;
    this.save();
    this.world = null;
    this.ui.clearModals();
    this.audio.setAmbient(null);
    if (abandoned) {
      this.ui.toast(`Banked ${summary.embers} embers`);
      this.showHub('descend');
      return;
    }
    this.mode = 'summary';
    this.hud.setVisible(false);
    this.input.touch.setVisible(false);
    this.ui.fade(() => this.ui.showScreen(summaryView(summary, () => this.showHub('descend'))), 400);
  }

  // ---------------------------------------------------------------- modals in run

  private openPause(): void {
    if (!this.run || this.ui.hasModal || this.mode !== 'run') return;
    const run = this.run;
    this.input.touch.reset();
    this.ui.pushModal(
      pauseView(run, {
        resume: () => {
          this.ui.popModal();
          this.input.flush();
        },
        settings: () => this.openSettings(),
        help: () => this.ui.pushModal(helpView(this.input.device, () => this.ui.popModal())),
        abandon: () =>
          this.ui.pushModal(
            confirmView(
              'Abandon descent?',
              'You keep the embers you carried, but this descent ends.',
              'Abandon',
              () => {
                this.ui.clearModals();
                this.endRun(false);
              },
              () => this.ui.popModal(),
            ),
          ),
      }),
    );
  }

  private openGlyphChoice(current: Current, after: () => void): void {
    const run = this.run!;
    const offers = this.withRng((rng) => offerGlyphs(run, this.data.profile, current, rng));
    if (!offers.length) {
      const v = this.withRng((rng) => pearlsReward(run, rng));
      run.pearls += v;
      this.ui.toast(`Glyphs exhausted · +${v} Pearls`);
      after();
      return;
    }
    this.input.touch.reset();
    this.ui.pushModal(
      choiceView(current, offers, run, (i) => {
        takeGlyph(run, offers[i]);
        this.refreshStats();
        this.ui.popModal();
        this.audio.play('reward');
        this.ui.toast(`Glyph claimed`, CURRENT_INFO[current].color);
        after();
      }),
      350, // guard against a stray attack tap selecting a card
    );
  }

  private openShop(): void {
    const run = this.run!;
    const render = (): ReturnType<typeof shopView> =>
      shopView(
        run,
        (i) => {
          const item = buyShopItem(run, i);
          if (!item) {
            this.audio.play('deny');
            return;
          }
          this.audio.play('buy');
          const done = (): void => {
            this.save();
            this.ui.replaceModal(render());
          };
          switch (item.kind) {
            case 'glyph':
              this.openGlyphChoice(item.current!, done);
              return;
            case 'heart':
              run.heartBonus += HEART_BONUS;
              this.refreshStats();
              this.ui.toast(`+${HEART_BONUS} max health`, '#ff5a7a');
              break;
            case 'restore':
              this.world?.healPlayer(this.world.player.maxHp * RESTORE_FRACTION);
              this.ui.toast('Health restored', '#7dff9a');
              break;
            case 'whetstone':
              run.whetstones++;
              this.refreshStats();
              this.ui.toast('Damage increased', '#b8d0e0');
              break;
          }
          if (this.world) run.hp = Math.ceil(this.world.player.hp);
          done();
        },
        () => {
          this.ui.popModal();
          this.input.flush();
        },
      );
    this.input.touch.reset();
    this.ui.pushModal(render(), 250);
  }

  // ---------------------------------------------------------------- events

  private handleEvents(w: World): void {
    if (!w.events.length) return;
    const events = w.events;
    w.events = [];
    for (const e of events) this.handleEvent(w, e);
  }

  private handleEvent(w: World, e: GameEvent): void {
    const run = this.run;
    if (!run) return;
    switch (e.type) {
      case 'sfx':
        this.audio.play(e.name, e.vol);
        break;
      case 'shake':
        if (this.settings.shake) this.renderer.addShake(e.amount);
        break;
      case 'haptic':
        if (this.settings.haptics) this.input.rumble(e.ms, e.strength);
        break;
      case 'kill':
        run.kills++;
        break;
      case 'pickup':
        if (e.kind === 'pearl') run.pearls += e.value;
        else if (e.kind === 'ember') run.embers += e.value;
        break;
      case 'roomCleared':
        if (!isBossRoom(run)) this.ui.toast(run.roomReward.kind === 'none' ? 'Chamber cleared · choose a door' : 'Chamber cleared');
        break;
      case 'reward':
        this.onReward(w, e.reward);
        break;
      case 'shop':
        this.openShop();
        break;
      case 'door':
        this.onDoor(w, e.index);
        break;
      case 'bossDefeated': {
        const p = this.data.profile;
        this.bossLoot = { starglass: bossStarglass(p, e.bossId), embers: bossEmbers(run, p) };
        p.bossKills[e.bossId] = (p.bossKills[e.bossId] ?? 0) + 1;
        if (!run.bossesDefeated.includes(e.bossId)) run.bossesDefeated.push(e.bossId);
        this.ui.banner('Guardian Vanquished', getBoss(e.bossId).name, 'boss');
        this.save();
        break;
      }
      case 'bossPhase':
        break;
      case 'playerDown':
        if (run.rekindles > 0) {
          run.rekindles--;
          w.schedule(0.5, () => {
            w.revivePlayer(0.4);
            this.ui.toast('Your lantern rekindles!', '#ffe9a8');
          });
        } else {
          this.pendingEnd = 1.8;
        }
        break;
    }
  }

  private onReward(w: World, r: Reward): void {
    const run = this.run!;
    const profile = this.data.profile;
    switch (r.kind) {
      case 'glyph':
        this.openGlyphChoice(r.current ?? 'ember', () => this.finishRoomReward());
        return;
      case 'pearls': {
        const v = this.withRng((rng) => pearlsReward(run, rng));
        run.pearls += v;
        this.ui.toast(`+${v} Pearls`, '#e8f4ff');
        break;
      }
      case 'embers': {
        const v = this.withRng((rng) => embersReward(run, profile, rng));
        run.embers += v;
        this.ui.toast(`+${v} Embers`, '#ff9a4a');
        break;
      }
      case 'heart':
        run.heartBonus += HEART_BONUS;
        this.refreshStats();
        this.ui.toast(`+${HEART_BONUS} max health`, '#ff5a7a');
        break;
      case 'whetstone':
        run.whetstones++;
        this.refreshStats();
        this.ui.toast('Whetstone: damage increased', '#b8d0e0');
        break;
      case 'restore':
        w.healPlayer(w.player.maxHp * RESTORE_FRACTION);
        this.ui.toast('Health restored', '#7dff9a');
        break;
      case 'boss': {
        const loot = this.bossLoot ?? { starglass: 1, embers: bossEmbers(run, profile) };
        this.bossLoot = null;
        run.starglass += loot.starglass;
        run.embers += loot.embers;
        w.healPlayer(w.player.maxHp * 0.35);
        this.ui.toast(`+${loot.embers} Embers · +${loot.starglass} Starglass`, '#9ad8ff');
        if (isFinalBiome(run)) {
          this.pendingVictory = true;
          this.pendingEnd = 2.2;
          run.hp = Math.ceil(w.player.hp);
          this.save();
          return;
        }
        break;
      }
      default:
        break;
    }
    this.finishRoomReward();
  }

  private onDoor(w: World, index: number): void {
    const run = this.run!;
    const reward = run.doors?.[index];
    if (!reward) return;
    run.hp = Math.ceil(w.player.hp);
    this.transitioning = true;
    this.ui.fade(() => {
      advanceRoom(run, reward);
      this.enterRoom(true);
      this.transitioning = false;
      this.input.flush();
    });
  }

  // ---------------------------------------------------------------- frame loop

  private frame(ts: number): void {
    const dt = this.lastTs ? Math.min(0.1, (ts - this.lastTs) / 1000) : 1 / 60;
    this.lastTs = ts;
    this.input.update(dt);
    const nav = this.input.takeNav();

    if (this.mode === 'run' && this.world && this.run) {
      this.runFrame(dt, nav);
    } else {
      this.menuTime += dt;
      this.renderer.renderBackdrop(this.menuTime);
      this.ui.handleNav(nav);
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  private runFrame(dt: number, nav: ReturnType<Input['takeNav']>): void {
    const w = this.world!;
    const run = this.run!;
    if (this.ui.hasModal) {
      this.ui.handleNav(nav);
      this.input.pollGame({ x: 0, y: 0 }); // discard
      this.acc = 0;
    } else {
      if (nav.includes('pause') && !this.transitioning) {
        this.openPause();
      } else if (!this.transitioning) {
        const ps = this.renderer.worldToScreen(w.player.x, w.player.y);
        const controls = this.input.pollGame(ps);
        this.acc += dt;
        let steps = 0;
        let c: Controls = controls;
        while (this.acc >= FIXED_DT && steps < 4) {
          w.step(FIXED_DT, c);
          this.handleEvents(w);
          this.acc -= FIXED_DT;
          steps++;
          // Edges only on the first sub-step.
          c = { ...emptyControls(), moveX: controls.moveX, moveY: controls.moveY, aimX: controls.aimX, aimY: controls.aimY, aimActive: controls.aimActive, attack: controls.attack };
          if (this.ui.hasModal || this.world !== w) break;
        }
        if (steps >= 4) this.acc = 0;
        run.time += dt;
      }
    }

    if (this.pendingEnd > 0) {
      this.pendingEnd -= dt;
      if (this.pendingEnd <= 0) {
        this.pendingEnd = -1;
        this.endRun(this.pendingVictory);
        return;
      }
    }

    if (!this.world) return;
    const preview = this.input.device === 'touch' ? this.input.touch.aimPreview() : null;
    this.renderer.render(this.world, dt, {
      shake: this.settings.shake,
      damageNumbers: this.settings.damageNumbers,
      reducedFlashes: this.settings.reducedFlashes,
      aimPreview: preview ? { angle: preview.angle, kind: preview.kind === 'dash' ? 'attack' : preview.kind } : null,
    });
    const p = this.world.player;
    const st = this.world.stats;
    this.hud.update(this.world, run, dt, this.input.device !== 'touch');
    if (this.input.device === 'touch') {
      this.input.touch.setStatus({
        specialCd: p.specialCdMax > 0 ? Math.max(0, p.specialCd / p.specialCdMax) : 0,
        dash: p.dashCharges,
        dashMax: st.dashCharges,
        flare: p.flareCharges,
        flareMax: st.flareCharges,
        flareCd: p.flareCharges < st.flareCharges ? 1 - p.flareT / st.flareRecharge : 0,
      });
    }
  }
}

