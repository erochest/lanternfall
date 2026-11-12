/**
 * Tiny procedural sound engine. Every effect is synthesised on the fly so
 * the game ships with zero audio assets.
 */
type Recipe = (a: AudioEngine, t: number, v: number) => void;

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private noise!: AudioBuffer;
  private last = new Map<string, number>();
  private ambient: { oscs: OscillatorNode[]; gain: GainNode; lfo: OscillatorNode } | null = null;
  private sfxVol = 0.7;
  private ambVol = 0.4;

  /** Must be called from a user gesture (browsers block autoplay). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVol;
      this.sfxBus.connect(this.master);
      this.ambBus = this.ctx.createGain();
      this.ambBus.gain.value = this.ambVol;
      this.ambBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(sfx: number, amb: number): void {
    this.sfxVol = sfx;
    this.ambVol = amb;
    if (this.ctx) {
      this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
      this.ambBus.gain.setTargetAtTime(amb, this.ctx.currentTime, 0.05);
    }
  }

  play(name: string, vol = 1): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.sfxVol <= 0) return;
    const now = ctx.currentTime;
    const prev = this.last.get(name) ?? -1;
    if (now - prev < 0.035) return; // rate-limit identical sounds
    this.last.set(name, now);
    const r = RECIPES[name];
    if (r) r(this, now, vol);
  }

  // ------------------------------------------------------------ primitives

  tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, attack = 0.005): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hiss(t: number, type: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, q = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------ ambient

  setAmbient(base: number | null, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (this.ambient) {
      const old = this.ambient;
      old.gain.gain.setTargetAtTime(0.0001, now, 0.6);
      setTimeout(() => {
        old.oscs.forEach((o) => o.stop());
        old.lfo.stop();
      }, 3000);
      this.ambient = null;
    }
    if (base === null) return;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(0.09, now, 1.2);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 3;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(filter.frequency);
    const oscs = [base, base * 1.5, base * 2.01].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? type : 'sine';
      o.frequency.value = f;
      o.detune.value = (i - 1) * 6;
      const og = ctx.createGain();
      og.gain.value = i === 0 ? 0.6 : 0.25;
      o.connect(og).connect(filter);
      o.start();
      return o;
    });
    filter.connect(gain).connect(this.ambBus);
    lfo.start();
    this.ambient = { oscs, gain, lfo };
  }
}

const RECIPES: Record<string, Recipe> = {
  swing: (a, t, v) => a.hiss(t, 'bandpass', 2400, 700, 0.1, 0.22 * v, 1.2),
  heavy: (a, t, v) => {
    a.hiss(t, 'lowpass', 1400, 200, 0.2, 0.3 * v);
    a.tone(t, 'sine', 120, 45, 0.22, 0.35 * v);
  },
  shoot: (a, t, v) => a.tone(t, 'triangle', 1300, 500, 0.07, 0.12 * v),
  hit: (a, t, v) => {
    a.tone(t, 'triangle', 240, 90, 0.08, 0.28 * v);
    a.hiss(t, 'highpass', 3000, 1500, 0.04, 0.12 * v);
  },
  crit: (a, t, v) => {
    a.tone(t, 'triangle', 300, 90, 0.1, 0.32 * v);
    a.tone(t, 'sine', 1800, 1200, 0.12, 0.12 * v);
  },
  kill: (a, t, v) => {
    a.hiss(t, 'lowpass', 2000, 120, 0.22, 0.22 * v);
    a.tone(t, 'sine', 320, 70, 0.2, 0.2 * v);
  },
  dash: (a, t, v) => a.hiss(t, 'highpass', 800, 4000, 0.13, 0.16 * v),
  hurt: (a, t, v) => {
    a.tone(t, 'sawtooth', 220, 80, 0.28, 0.22 * v);
    a.hiss(t, 'lowpass', 1200, 200, 0.18, 0.2 * v);
  },
  boom: (a, t, v) => {
    a.hiss(t, 'lowpass', 900, 60, 0.4, 0.4 * v);
    a.tone(t, 'sine', 90, 30, 0.4, 0.4 * v);
  },
  zap: (a, t, v) => {
    a.tone(t, 'square', 1600 + Math.random() * 600, 300, 0.06, 0.06 * v);
    a.tone(t + 0.03, 'square', 900 + Math.random() * 600, 200, 0.06, 0.05 * v);
  },
  freeze: (a, t, v) => {
    a.tone(t, 'sine', 1800, 2600, 0.18, 0.1 * v);
    a.tone(t + 0.04, 'sine', 2400, 3200, 0.16, 0.07 * v);
  },
  pickup: (a, t, v) => {
    a.tone(t, 'sine', 880, 880, 0.08, 0.12 * v);
    a.tone(t + 0.06, 'sine', 1320, 1320, 0.1, 0.12 * v);
  },
  reward: (a, t, v) => {
    [523, 659, 784, 1046].forEach((f, i) => a.tone(t + i * 0.07, 'triangle', f, f, 0.25, 0.14 * v));
  },
  clear: (a, t, v) => {
    [392, 494, 587].forEach((f) => a.tone(t, 'sine', f, f, 0.9, 0.08 * v, 0.08));
  },
  doors: (a, t, v) => a.tone(t, 'sine', 70, 50, 0.5, 0.25 * v, 0.02),
  door: (a, t, v) => a.hiss(t, 'bandpass', 300, 1800, 0.5, 0.2 * v, 0.8),
  spawn: (a, t, v) => a.tone(t, 'sine', 90, 260, 0.45, 0.08 * v, 0.2),
  roar: (a, t, v) => {
    a.tone(t, 'sawtooth', 70, 45, 1.1, 0.25 * v, 0.1);
    a.hiss(t, 'lowpass', 600, 100, 1.0, 0.25 * v);
  },
  bossdie: (a, t, v) => {
    a.hiss(t, 'lowpass', 1500, 40, 1.4, 0.5 * v);
    a.tone(t, 'sine', 140, 25, 1.4, 0.4 * v);
  },
  enemyShot: (a, t, v) => a.tone(t, 'sine', 520, 260, 0.1, 0.09 * v),
  charge: (a, t, v) => a.hiss(t, 'bandpass', 300, 1400, 0.3, 0.16 * v, 2),
  summon: (a, t, v) => a.tone(t, 'triangle', 180, 620, 0.45, 0.1 * v, 0.1),
  special: (a, t, v) => {
    a.hiss(t, 'bandpass', 600, 3000, 0.2, 0.22 * v, 1.5);
    a.tone(t, 'triangle', 200, 600, 0.18, 0.14 * v);
  },
  throw: (a, t, v) => a.hiss(t, 'bandpass', 1200, 400, 0.12, 0.12 * v, 2),
  block: (a, t, v) => {
    a.tone(t, 'triangle', 1200, 1100, 0.25, 0.15 * v);
    a.tone(t, 'triangle', 1810, 1700, 0.25, 0.1 * v);
  },
  break: (a, t, v) => {
    a.hiss(t, 'highpass', 2500, 800, 0.25, 0.25 * v);
    a.tone(t, 'square', 320, 120, 0.15, 0.1 * v);
  },
  slam: (a, t, v) => a.tone(t, 'sine', 150, 50, 0.15, 0.3 * v),
  rekindle: (a, t, v) => {
    [262, 392, 523, 784].forEach((f, i) => a.tone(t + i * 0.1, 'sine', f, f, 0.6, 0.12 * v, 0.05));
  },
  ui: (a, t, v) => a.tone(t, 'sine', 660, 660, 0.04, 0.08 * v),
  uiMove: (a, t, v) => a.tone(t, 'sine', 520, 520, 0.03, 0.05 * v),
  uiBack: (a, t, v) => a.tone(t, 'sine', 440, 330, 0.06, 0.08 * v),
  buy: (a, t, v) => {
    a.tone(t, 'triangle', 988, 988, 0.08, 0.12 * v);
    a.tone(t + 0.07, 'triangle', 1318, 1318, 0.16, 0.12 * v);
  },
  deny: (a, t, v) => a.tone(t, 'square', 180, 140, 0.12, 0.08 * v),
};
