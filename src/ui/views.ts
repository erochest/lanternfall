import { BIOMES } from '../data/biomes';
import { getBoss } from '../data/enemies';
import {
  ARMORS,
  ARMOR_MAX_LEVEL,
  FORGE,
  TRINKETS,
  WEAPONS,
  WEAPON_MAX_LEVEL,
  armorUpgradeCost,
  getArmor,
  getTrinket,
  getWeapon,
  weaponUpgradeCost,
  type Cost,
} from '../data/gear';
import { CURRENT_INFO, SLOT_LABEL, getGlyph, glyphPower, type Current, type Rarity } from '../data/glyphs';
import type { Device } from '../input/input';
import { MAX_TIDE, canAfford, forgeRank, requirementMet, trinketSlots, unlockedCurrents, type Profile } from '../game/profile';
import { HEART_BONUS, RESTORE_FRACTION, WHETSTONE_BONUS, type GlyphOffer, type RunState, type ShopItem } from '../game/run';
import type { Settings } from '../game/save';
import type { ViewSpec } from './dom';

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#cfd8dc',
  rare: '#4fc3f7',
  epic: '#d59cff',
  legendary: '#ffd54f',
};

const RARITY_NAME: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

export function costHtml(c: Cost): string {
  const parts = [`<span class="cost-e">${c.embers}</span>`];
  if (c.starglass) parts.push(`<span class="cost-s">${c.starglass}</span>`);
  return parts.join(' ');
}

const stars = (n: number, max: number): string =>
  `<span class="stars">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

const bossName = (id: string): string => getBoss(id).name;

// ---------------------------------------------------------------- title

export function titleView(o: { hasRun: boolean; onContinue: () => void; onPlay: () => void; onSettings: () => void; device: Device }): ViewSpec {
  const hint = o.device === 'gamepad' ? 'Press Ⓐ' : o.device === 'keyboard' ? 'Press Enter' : 'Tap to begin';
  return {
    className: 'title-screen',
    html: `
      <div class="title-wrap">
        <div class="logo"><span class="logo-l">LANTERN</span><span class="logo-r">FALL</span></div>
        <div class="tagline">Carry the last light into the drowned deep.</div>
        <div class="title-btns">
          ${o.hasRun ? `<button class="btn primary big" data-act="continue" data-key="continue">Continue Descent</button>` : ''}
          <button class="btn ${o.hasRun ? '' : 'primary big'}" data-act="play" data-key="play">${o.hasRun ? 'The Lighthouse' : 'Begin'}</button>
          <button class="btn ghost" data-act="settings" data-key="settings">Settings</button>
        </div>
        <div class="title-hint">${hint}</div>
      </div>`,
    handlers: { continue: o.onContinue, play: o.onPlay, settings: o.onSettings },
    focus: o.hasRun ? '[data-act=continue]' : '[data-act=play]',
  };
}

// ---------------------------------------------------------------- hub

export type HubTab = 'descend' | 'arsenal' | 'armor' | 'trinkets' | 'forge' | 'records';
export const HUB_TABS: { id: HubTab; label: string }[] = [
  { id: 'descend', label: 'Descend' },
  { id: 'arsenal', label: 'Arsenal' },
  { id: 'armor', label: 'Armor' },
  { id: 'trinkets', label: 'Trinkets' },
  { id: 'forge', label: 'Forge' },
  { id: 'records', label: 'Records' },
];

export interface HubCallbacks {
  onTab: (t: HubTab) => void;
  onTabStep: (d: -1 | 1) => void;
  onDescend: () => void;
  onContinue: () => void;
  onAbandon: () => void;
  onSettings: () => void;
  onTide: (d: -1 | 1) => void;
  onBack: () => void;
  onBuy: (kind: string, id: string) => void;
}

function btn(act: string, key: string, label: string, opts: { disabled?: boolean; cls?: string; data?: Record<string, string> } = {}): string {
  const data = Object.entries(opts.data ?? {})
    .map(([k, v]) => ` data-${k}="${v}"`)
    .join('');
  return `<button class="btn ${opts.cls ?? ''}" data-act="${act}" data-key="${key}"${data}${opts.disabled ? ' disabled' : ''}>${label}</button>`;
}

function purchaseBtn(p: Profile, kind: string, id: string, label: string, cost: Cost, locked = false): string {
  const afford = canAfford(p, cost);
  return btn('buy', `${kind}:${id}`, `${label} ${costHtml(cost)}`, {
    disabled: locked || !afford,
    cls: afford && !locked ? 'buy' : 'buy dim',
    data: { kind, id },
  });
}

function descendTab(p: Profile, run: RunState | null): string {
  const w = getWeapon(p.equipped.weapon);
  const a = getArmor(p.equipped.armor);
  const ts = p.equipped.trinkets.map((t) => getTrinket(t).name);
  const tide =
    p.maxTide > 0
      ? `<div class="tide-row">
          <div class="tide-label"><b>Tide ${p.tide}</b><span>${p.tide === 0 ? 'Calm waters' : `Foes +${p.tide * 15}% health, +${p.tide * 10}% damage · Embers +${p.tide * 15}%`}</span></div>
          ${btn('tide', 'tide-', '−', { cls: 'sq', disabled: p.tide <= 0, data: { d: '-1' } })}
          ${btn('tide', 'tide+', '+', { cls: 'sq', disabled: p.tide >= Math.min(MAX_TIDE, p.maxTide), data: { d: '1' } })}
        </div>`
      : `<div class="muted small">Defeat The Maw to unlock rising Tides — harder foes, richer rewards.</div>`;
  const runBlock = run
    ? `<div class="run-card">
        <div class="rc-title">A descent is underway</div>
        <div class="muted small">${BIOMES[run.biome].name} · ${run.glyphs.length} glyphs · ${run.embers} embers carried</div>
        <div class="row">${btn('continue', 'continue', 'Continue Descent', { cls: 'primary big' })}${btn('abandon', 'abandon', 'Abandon', { cls: 'ghost' })}</div>
      </div>`
    : `${btn('descend', 'descend', 'Descend', { cls: 'primary huge' })}`;
  return `
    <div class="descend">
      ${runBlock}
      <div class="loadout">
        <div class="lo"><span>Weapon</span><b style="color:${w.color}">${w.name}</b><em>${w.kind} · Lv ${p.weapons[w.id]}</em></div>
        <div class="lo"><span>Armor</span><b style="color:${a.color}">${a.name}</b><em>Lv ${p.armors[a.id]}</em></div>
        <div class="lo"><span>Trinkets</span><b>${ts.length ? ts.join(', ') : '—'}</b><em>${p.equipped.trinkets.length}/${trinketSlots(p)} slots</em></div>
        <div class="lo"><span>Currents</span><b>${unlockedCurrents(p).map((c) => `<i class="dot" style="background:${CURRENT_INFO[c].color}"></i>${CURRENT_INFO[c].name}`).join(' ')}</b></div>
      </div>
      ${run ? '' : tide}
    </div>`;
}

function arsenalTab(p: Profile): string {
  return WEAPONS.map((w) => {
    const lvl = p.weapons[w.id] ?? 0;
    const equipped = p.equipped.weapon === w.id;
    let actions = '';
    if (!lvl) {
      actions = w.unlock ? purchaseBtn(p, 'weapon', w.id, 'Unlock', w.unlock) : '';
    } else {
      actions = equipped ? `<span class="tag on">Equipped</span>` : btn('buy', `equip-w:${w.id}`, 'Equip', { data: { kind: 'equip-weapon', id: w.id } });
      actions += lvl < WEAPON_MAX_LEVEL ? purchaseBtn(p, 'weapon-up', w.id, 'Temper', weaponUpgradeCost(lvl)) : `<span class="tag">Max</span>`;
    }
    return `<div class="card ${lvl ? '' : 'locked'} ${equipped ? 'equipped' : ''}" style="--c:${w.color}">
      <div class="card-head"><b>${w.name}</b><span class="muted">${w.kind}</span>${lvl ? stars(lvl, WEAPON_MAX_LEVEL) : ''}</div>
      <div class="card-desc">${w.desc}${lvl > 1 ? ` <span class="muted">Damage +${Math.round((lvl - 1) * 12)}%.</span>` : ''}${!lvl && w.unlockHint ? ` <span class="muted">${w.unlockHint}</span>` : ''}</div>
      <div class="card-actions">${actions}</div>
    </div>`;
  }).join('');
}

function armorTab(p: Profile): string {
  return ARMORS.map((a) => {
    const lvl = p.armors[a.id] ?? 0;
    const equipped = p.equipped.armor === a.id;
    const reqOk = requirementMet(p, a.requires);
    let actions = '';
    if (!lvl) {
      actions = a.unlock ? purchaseBtn(p, 'armor', a.id, 'Unlock', a.unlock, !reqOk) : '';
    } else {
      actions = equipped ? `<span class="tag on">Equipped</span>` : btn('buy', `equip-a:${a.id}`, 'Equip', { data: { kind: 'equip-armor', id: a.id } });
      actions += lvl < ARMOR_MAX_LEVEL ? purchaseBtn(p, 'armor-up', a.id, 'Reinforce', armorUpgradeCost(lvl)) : `<span class="tag">Max</span>`;
    }
    const req = !lvl && a.requires && !reqOk ? `<span class="req">Defeat ${bossName(a.requires.boss)} to unlock.</span>` : '';
    return `<div class="card ${lvl ? '' : 'locked'} ${equipped ? 'equipped' : ''}" style="--c:${a.color}">
      <div class="card-head"><b>${a.name}</b>${lvl ? stars(lvl, ARMOR_MAX_LEVEL) : ''}</div>
      <div class="card-desc">${a.desc}${lvl > 1 ? ` <span class="muted">+${(lvl - 1) * a.maxHpPerLevel} max health from reinforcement.</span>` : ''} ${req}</div>
      <div class="card-actions">${actions}</div>
    </div>`;
  }).join('');
}

function trinketsTab(p: Profile): string {
  const slots = trinketSlots(p);
  const head = `<div class="muted small pad">Equipped ${p.equipped.trinkets.length}/${slots}. ${slots < 2 ? 'Buy “Second Chain” at the Forge for another slot.' : ''}</div>`;
  return (
    head +
    TRINKETS.map((t) => {
      const owned = p.trinkets.includes(t.id);
      const on = p.equipped.trinkets.includes(t.id);
      const reqOk = requirementMet(p, t.requires);
      const actions = owned
        ? btn('buy', `trinket:${t.id}`, on ? 'Unequip' : 'Equip', { cls: on ? 'on' : '', data: { kind: 'toggle-trinket', id: t.id } })
        : t.unlock
          ? purchaseBtn(p, 'trinket', t.id, 'Acquire', t.unlock, !reqOk)
          : '';
      const req = !owned && t.requires && !reqOk ? `<span class="req">Defeat ${bossName(t.requires.boss)} to unlock.</span>` : '';
      return `<div class="card ${owned ? '' : 'locked'} ${on ? 'equipped' : ''}" style="--c:#ffd27a">
        <div class="card-head"><b>${t.name}</b>${on ? '<span class="tag on">Equipped</span>' : ''}</div>
        <div class="card-desc">${t.desc} ${req}</div>
        <div class="card-actions">${actions}</div>
      </div>`;
    }).join('')
  );
}

function forgeTab(p: Profile): string {
  return FORGE.map((f) => {
    const rank = forgeRank(p, f.id);
    const maxed = rank >= f.maxRank;
    return `<div class="card ${maxed ? 'equipped' : ''}" style="--c:#ff9a4a">
      <div class="card-head"><b>${f.name}</b>${f.maxRank > 1 ? stars(rank, f.maxRank) : maxed ? '<span class="tag on">Owned</span>' : ''}</div>
      <div class="card-desc">${f.desc(rank)}</div>
      <div class="card-actions">${maxed ? '<span class="tag">Complete</span>' : purchaseBtn(p, 'forge', f.id, rank ? 'Improve' : 'Build', f.cost(rank))}</div>
    </div>`;
  }).join('');
}

function recordsTab(p: Profile): string {
  const s = p.stats;
  const bosses = BIOMES.map((b) => {
    const k = p.bossKills[b.boss] ?? 0;
    return `<div class="rec"><span>${bossName(b.boss)}</span><b>${k ? `Defeated ×${k}` : 'Undefeated'}</b></div>`;
  }).join('');
  return `<div class="records">
    <div class="rec"><span>Descents</span><b>${s.runs}</b></div>
    <div class="rec"><span>Dawns reached</span><b>${s.wins}</b></div>
    <div class="rec"><span>Deepest chamber</span><b>${s.bestDepth}</b></div>
    <div class="rec"><span>Foes vanquished</span><b>${s.kills}</b></div>
    <div class="rec"><span>Embers gathered</span><b>${s.totalEmbers}</b></div>
    <div class="rec"><span>Highest Tide</span><b>${p.maxTide}</b></div>
    ${bosses}
  </div>`;
}

export function hubView(p: Profile, run: RunState | null, tab: HubTab, cb: HubCallbacks): ViewSpec {
  const tabs = HUB_TABS.map((t) => `<button class="tab ${t.id === tab ? 'on' : ''}" data-act="tab" data-key="tab:${t.id}" data-tab="${t.id}">${t.label}</button>`).join('');
  let body = '';
  switch (tab) {
    case 'descend':
      body = descendTab(p, run);
      break;
    case 'arsenal':
      body = arsenalTab(p);
      break;
    case 'armor':
      body = armorTab(p);
      break;
    case 'trinkets':
      body = trinketsTab(p);
      break;
    case 'forge':
      body = forgeTab(p);
      break;
    case 'records':
      body = recordsTab(p);
      break;
  }
  return {
    className: 'hub-screen',
    html: `
      <div class="hub">
        <header class="hub-head">
          <div class="hub-title">The Lighthouse</div>
          <div class="wallet"><span class="cost-e">${p.embers}</span><span class="cost-s">${p.starglass}</span></div>
          <button class="btn icon" data-act="settings" data-key="settings" aria-label="Settings">⚙</button>
        </header>
        <nav class="tabs" data-scroll="tabs">${tabs}</nav>
        <div class="hub-body" data-scroll="body">${body}</div>
      </div>`,
    handlers: {
      tab: (el) => cb.onTab(el.dataset.tab as HubTab),
      descend: () => cb.onDescend(),
      continue: () => cb.onContinue(),
      abandon: () => cb.onAbandon(),
      settings: () => cb.onSettings(),
      tide: (el) => cb.onTide(Number(el.dataset.d) as -1 | 1),
      buy: (el) => cb.onBuy(el.dataset.kind!, el.dataset.id!),
    },
    onBack: cb.onBack,
    onTab: cb.onTabStep,
    focus: tab === 'descend' ? '[data-act=descend],[data-act=continue]' : `.hub-body [data-act]`,
  };
}

// ---------------------------------------------------------------- summary

export interface RunSummary {
  victory: boolean;
  depth: number;
  biome: string;
  kills: number;
  time: number;
  embers: number;
  starglass: number;
  glyphs: number;
  newTide: boolean;
}

export function summaryView(s: RunSummary, onDone: () => void): ViewSpec {
  const mins = Math.floor(s.time / 60);
  const secs = Math.floor(s.time % 60).toString().padStart(2, '0');
  return {
    className: 'summary-screen',
    html: `
      <div class="summary ${s.victory ? 'win' : 'loss'}">
        <div class="sum-title">${s.victory ? 'Dawn Returns' : 'The Light Fades'}</div>
        <div class="sum-sub">${s.victory ? 'The Maw is silenced. The lighthouse burns bright.' : `You fell in ${s.biome}. The tide carries you home.`}</div>
        <div class="sum-grid">
          <div><span>Chambers</span><b>${s.depth}</b></div>
          <div><span>Foes</span><b>${s.kills}</b></div>
          <div><span>Time</span><b>${mins}:${secs}</b></div>
          <div><span>Glyphs</span><b>${s.glyphs}</b></div>
        </div>
        <div class="sum-loot">
          <div class="loot"><span class="cost-e big">${s.embers}</span><em>Embers banked</em></div>
          ${s.starglass ? `<div class="loot"><span class="cost-s big">${s.starglass}</span><em>Starglass</em></div>` : ''}
        </div>
        ${s.newTide ? `<div class="sum-unlock">A higher Tide is now available at the Lighthouse.</div>` : ''}
        <button class="btn primary big" data-act="done" data-key="done">Return to the Lighthouse</button>
      </div>`,
    handlers: { done: onDone },
    onBack: onDone,
  };
}

// ---------------------------------------------------------------- glyph choice

export function glyphCardHtml(id: string, rarity: Rarity, level: number, extra = ''): string {
  const g = getGlyph(id);
  const color = CURRENT_INFO[g.current].color;
  const color2 = g.secondary ? CURRENT_INFO[g.secondary].color : color;
  const power = g.legendary ? 1 : glyphPower(rarity, level);
  return `
    <div class="gtags"><span class="slot">${SLOT_LABEL[g.slot]}</span><span class="rar" style="color:${RARITY_COLOR[rarity]}">${RARITY_NAME[rarity]}${level > 1 ? ` · Lv ${level}` : ''}</span></div>
    <div class="gname" style="--c:${color};--c2:${color2}">${g.name}</div>
    <div class="gdesc">${g.desc(power)}</div>
    ${extra}`;
}

export function choiceView(current: Current, offers: GlyphOffer[], run: RunState, onPick: (i: number) => void): ViewSpec {
  const info = CURRENT_INFO[current];
  const cards = offers
    .map((o, i) => {
      let note = '';
      if (o.level > 1) note = `<div class="gnote up">Upgrade: Level ${o.level - 1} → ${o.level}</div>`;
      else if (o.replaces) note = `<div class="gnote warn">Replaces ${getGlyph(o.replaces).name}</div>`;
      else if (getGlyph(o.id).secondary) note = `<div class="gnote leg">Confluence</div>`;
      const g = getGlyph(o.id);
      return `<button class="gcard r-${o.rarity}" data-act="pick" data-key="pick:${i}" data-i="${i}" style="--c:${CURRENT_INFO[g.current].color}">${glyphCardHtml(o.id, o.rarity, o.level, note)}</button>`;
    })
    .join('');
  void run;
  return {
    className: 'choice-modal',
    html: `<div class="panel choice" style="--c:${info.color}">
      <div class="panel-title"><i class="dot big" style="background:${info.color}"></i>${info.name} Glyph</div>
      <div class="panel-sub">${info.blurb} Choose one.</div>
      <div class="gcards">${cards}</div>
    </div>`,
    handlers: { pick: (el) => onPick(Number(el.dataset.i)) },
    // No back: a choice must be made.
  };
}

// ---------------------------------------------------------------- shop

function shopItemLabel(it: ShopItem): { name: string; desc: string; color: string } {
  switch (it.kind) {
    case 'glyph':
      return { name: `${CURRENT_INFO[it.current!].name} Glyph`, desc: 'Choose one of three glyphs.', color: CURRENT_INFO[it.current!].color };
    case 'heart':
      return { name: 'Heart of the Deep', desc: `+${HEART_BONUS} max health.`, color: '#ff5a7a' };
    case 'restore':
      return { name: 'Tidewater Draught', desc: `Restore ${Math.round(RESTORE_FRACTION * 100)}% health.`, color: '#7dff9a' };
    case 'whetstone':
      return { name: 'Whetstone', desc: `+${Math.round(WHETSTONE_BONUS * 100)}% damage this descent.`, color: '#b8d0e0' };
  }
}

export function shopView(run: RunState, onBuy: (i: number) => void, onLeave: () => void): ViewSpec {
  const items = (run.shop ?? [])
    .map((it, i) => {
      const l = shopItemLabel(it);
      const can = !it.sold && run.pearls >= it.price;
      return `<button class="shop-item ${it.sold ? 'sold' : ''}" data-act="buy" data-key="shop:${i}" data-i="${i}" ${it.sold || !can ? 'disabled' : ''} style="--c:${l.color}">
        <b>${l.name}</b><span>${l.desc}</span><em class="price">${it.sold ? 'Sold' : `<span class="cost-p">${it.price}</span>`}</em>
      </button>`;
    })
    .join('');
  return {
    className: 'shop-modal',
    html: `<div class="panel shop">
      <div class="panel-title">The Drowned Merchant</div>
      <div class="panel-sub">"Pearls for power, keeper." You have <span class="cost-p">${run.pearls}</span></div>
      <div class="shop-items">${items}</div>
      <button class="btn" data-act="leave" data-key="leave">Leave</button>
    </div>`,
    handlers: { buy: (el) => onBuy(Number(el.dataset.i)), leave: onLeave },
    onBack: onLeave,
  };
}

// ---------------------------------------------------------------- pause

export function buildListHtml(run: RunState): string {
  if (!run.glyphs.length) return `<div class="muted small">No glyphs yet. Clear chambers to earn them.</div>`;
  return run.glyphs
    .map((g) => {
      const d = getGlyph(g.id);
      return `<div class="build-item" style="--c:${CURRENT_INFO[d.current].color}">${glyphCardHtml(g.id, g.rarity, g.level)}</div>`;
    })
    .join('');
}

export function pauseView(run: RunState, cb: { resume: () => void; settings: () => void; abandon: () => void; help: () => void }): ViewSpec {
  return {
    className: 'pause-modal',
    html: `<div class="panel pause">
      <div class="panel-title">Paused</div>
      <div class="pause-cols">
        <div class="pause-menu">
          ${btn('resume', 'resume', 'Resume', { cls: 'primary' })}
          ${btn('help', 'help', 'Controls')}
          ${btn('settings', 'settings', 'Settings')}
          ${btn('abandon', 'abandon', 'Abandon Descent', { cls: 'ghost danger' })}
          <div class="muted small">Progress saves at the start of each chamber.</div>
        </div>
        <div class="pause-build" data-scroll="build"><div class="build-title">Your Glyphs</div>${buildListHtml(run)}</div>
      </div>
    </div>`,
    handlers: { resume: cb.resume, settings: cb.settings, abandon: cb.abandon, help: cb.help },
    onBack: cb.resume,
  };
}

// ---------------------------------------------------------------- settings

export function settingsView(s: Settings, onChange: (k: keyof Settings, v: number | boolean) => void, onClose: () => void): ViewSpec {
  const toggle = (k: keyof Settings, label: string, sub = ''): string =>
    `<button class="set-row" data-act="toggle" data-key="set:${k}" data-k="${k}"><span><b>${label}</b>${sub ? `<em>${sub}</em>` : ''}</span><i class="switch ${s[k] ? 'on' : ''}"></i></button>`;
  const stepper = (k: keyof Settings, label: string, values: number[], names: string[]): string => {
    const i = Math.max(0, values.findIndex((v) => Math.abs(v - (s[k] as number)) < 0.01));
    return `<button class="set-row" data-act="cycle" data-key="set:${k}" data-k="${k}" data-values="${values.join(',')}"><span><b>${label}</b></span><i class="val">${names[i] ?? names[0]}</i></button>`;
  };
  return {
    className: 'settings-modal',
    html: `<div class="panel settings">
      <div class="panel-title">Settings</div>
      <div class="set-list" data-scroll="settings">
        ${stepper('sfx', 'Sound effects', [0, 0.35, 0.7, 1], ['Off', 'Low', 'Medium', 'High'])}
        ${stepper('ambient', 'Ambience', [0, 0.2, 0.4, 0.7], ['Off', 'Low', 'Medium', 'High'])}
        ${stepper('aimAssist', 'Aim assist', [0, 0.5, 1], ['Off', 'Light', 'Strong'])}
        ${toggle('dragAim', 'Drag to aim (touch)', 'Hold Special/Flare and drag to aim; tap to auto-aim')}
        ${stepper('controlScale', 'Touch button size', [0.85, 1, 1.2, 1.35], ['Small', 'Normal', 'Large', 'Huge'])}
        ${toggle('leftHanded', 'Left-handed touch layout')}
        ${toggle('shake', 'Screen shake')}
        ${toggle('haptics', 'Vibration / rumble')}
        ${toggle('damageNumbers', 'Damage numbers')}
        ${toggle('reducedFlashes', 'Reduce flashing')}
      </div>
      <button class="btn primary" data-act="close" data-key="close">Done</button>
    </div>`,
    handlers: {
      toggle: (el) => {
        const k = el.dataset.k as keyof Settings;
        onChange(k, !s[k]);
      },
      cycle: (el) => {
        const k = el.dataset.k as keyof Settings;
        const values = el.dataset.values!.split(',').map(Number);
        const i = values.findIndex((v) => Math.abs(v - (s[k] as number)) < 0.01);
        onChange(k, values[(i + 1) % values.length]);
      },
      close: onClose,
    },
    onBack: onClose,
  };
}

// ---------------------------------------------------------------- help / confirm

export function helpView(device: Device, onClose: () => void, first = false): ViewSpec {
  const rows: [string, string][] =
    device === 'touch'
      ? [
          ['Move', 'Drag anywhere on the left side'],
          ['Attack', 'Tap ⚔ to strike · hold to keep swinging · drag to aim'],
          ['Dash', 'Tap » — you are invulnerable while dashing'],
          ['Special', 'Tap ✦ (auto-aims) · or hold & drag to aim, release to fire'],
          ['Flare', 'Tap ✺ to lob an exploding flare · recharges over time'],
        ]
      : device === 'gamepad'
        ? [
            ['Move', 'Left stick · Aim with right stick (optional)'],
            ['Attack', 'Ⓧ or RT — hold to keep attacking'],
            ['Dash', 'Ⓐ or RB'],
            ['Special', 'Ⓨ or LT'],
            ['Flare', 'Ⓑ or LB'],
            ['Pause', 'Start / Menu'],
          ]
        : [
            ['Move', 'W A S D or arrow keys'],
            ['Aim', 'Mouse (optional — attacks auto-aim otherwise)'],
            ['Attack', 'Left click or J — hold to keep attacking'],
            ['Dash', 'Space or Shift'],
            ['Special', 'Right click or K'],
            ['Flare', 'E, Q or L'],
            ['Pause', 'Esc or P'],
          ];
  return {
    className: 'help-modal',
    html: `<div class="panel help">
      <div class="panel-title">${first ? 'Keeper, the light is yours' : 'Controls'}</div>
      ${first ? `<div class="panel-sub">Fight through each chamber, claim its reward, then choose your next door. Red zones show where foes will strike — dash through danger.</div>` : ''}
      <div class="help-rows">${rows.map(([a, b]) => `<div class="hr"><b>${a}</b><span>${b}</span></div>`).join('')}</div>
      <button class="btn primary" data-act="close" data-key="close">${first ? 'Descend' : 'Got it'}</button>
    </div>`,
    handlers: { close: onClose },
    onBack: onClose,
  };
}

export function confirmView(title: string, text: string, yes: string, onYes: () => void, onNo: () => void): ViewSpec {
  return {
    className: 'confirm-modal',
    html: `<div class="panel confirm">
      <div class="panel-title">${title}</div>
      <div class="panel-sub">${text}</div>
      <div class="row">${btn('no', 'no', 'Cancel', { cls: 'primary' })}${btn('yes', 'yes', yes, { cls: 'ghost danger' })}</div>
    </div>`,
    handlers: { yes: onYes, no: onNo },
    onBack: onNo,
    focus: '[data-act=no]',
  };
}
