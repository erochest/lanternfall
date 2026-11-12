import { newProfile, sanitizeProfile, type Profile } from './profile';
import { sanitizeRun, type RunState } from './run';

export interface Settings {
  sfx: number;
  ambient: number;
  shake: boolean;
  haptics: boolean;
  damageNumbers: boolean;
  /** 0 = off, 0.5 = light, 1 = strong */
  aimAssist: number;
  leftHanded: boolean;
  controlScale: number;
  dragAim: boolean;
  reducedFlashes: boolean;
}

export const defaultSettings = (): Settings => ({
  sfx: 0.7,
  ambient: 0.4,
  shake: true,
  haptics: true,
  damageNumbers: true,
  aimAssist: 1,
  leftHanded: false,
  controlScale: 1,
  dragAim: true,
  reducedFlashes: false,
});

export interface SaveData {
  profile: Profile;
  settings: Settings;
  run: RunState | null;
}

export const SAVE_KEY = 'lanternfall.save.v1';

export interface Storage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Record<string, unknown>;
  const num = (k: keyof Settings, lo: number, hi: number): number => {
    const v = r[k];
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : (d[k] as number);
  };
  const bool = (k: keyof Settings): boolean => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (d[k] as boolean));
  return {
    sfx: num('sfx', 0, 1),
    ambient: num('ambient', 0, 1),
    shake: bool('shake'),
    haptics: bool('haptics'),
    damageNumbers: bool('damageNumbers'),
    aimAssist: num('aimAssist', 0, 1),
    leftHanded: bool('leftHanded'),
    controlScale: num('controlScale', 0.75, 1.4),
    dragAim: bool('dragAim'),
    reducedFlashes: bool('reducedFlashes'),
  };
}

export function parseSave(text: string | null): SaveData {
  if (!text) return { profile: newProfile(), settings: defaultSettings(), run: null };
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    return {
      profile: sanitizeProfile(raw.profile),
      settings: sanitizeSettings(raw.settings),
      run: sanitizeRun(raw.run),
    };
  } catch {
    return { profile: newProfile(), settings: defaultSettings(), run: null };
  }
}

export function loadSave(store: Storage | null = storage()): SaveData {
  let text: string | null = null;
  try {
    text = store?.getItem(SAVE_KEY) ?? null;
  } catch {
    text = null;
  }
  return parseSave(text);
}

export function writeSave(data: SaveData, store: Storage | null = storage()): boolean {
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
