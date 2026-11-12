// End-to-end smoke test: serves the production build, plays it in headless
// Chromium at phone and desktop sizes, and fails on any page error.
// Usage: npm run build && node scripts/smoke.mjs [--shots]
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdirSync } from 'node:fs';

const shots = process.argv.includes('--shots');
const outDir = 'screenshots';
if (shots) mkdirSync(outDir, { recursive: true });

const server = await preview({ preview: { port: 4179, strictPort: true, host: '127.0.0.1' }, logLevel: 'silent' });
const url = 'http://127.0.0.1:4179/';
// Prefer Playwright's own browser; fall back to any cached headless shell.
async function launch() {
  try {
    return await chromium.launch();
  } catch (e) {
    const { readdirSync, existsSync } = await import('node:fs');
    const { homedir } = await import('node:os');
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? `${homedir()}/Library/Caches/ms-playwright`;
    for (const dir of existsSync(root) ? readdirSync(root).filter((d) => d.startsWith('chromium_headless_shell')).sort().reverse() : []) {
      for (const sub of readdirSync(`${root}/${dir}`)) {
        const exe = `${root}/${dir}/${sub}/chrome-headless-shell`;
        if (existsSync(exe)) return chromium.launch({ executablePath: exe });
      }
    }
    throw e;
  }
}
const browser = await launch();
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  if (shots) await page.screenshot({ path: `${outDir}/${name}.png` });
}

async function phone() {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[phone] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[phone console] ${m.text()}`));
  await page.goto(url);
  await sleep(600);
  await shot(page, 'phone-1-title');
  await page.tap('[data-act=play]');
  await sleep(400);
  await shot(page, 'phone-2-hub');
  await page.tap('[data-act=descend]');
  await sleep(500);
  await shot(page, 'phone-3-tutorial');
  await page.tap('.help [data-act=close]');
  await sleep(1800);
  await shot(page, 'phone-4-fight');

  // Drive the touch controls: hold the stick up-right and tap attack.
  const stick = { x: 180, y: 260 };
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const atk = await page.locator('.tb-attack').boundingBox();
  const ax = atk.x + atk.width / 2;
  const ay = atk.y + atk.height / 2;
  await touch('touchStart', [{ x: stick.x, y: stick.y, id: 1 }]);
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    await touch('touchMove', [{ x: stick.x + 40 * Math.cos(t * 6), y: stick.y - 40 * Math.sin(t * 6), id: 1 }]);
    if (i % 4 === 0) {
      await touch('touchStart', [{ x: stick.x + 40 * Math.cos(t * 6), y: stick.y - 40 * Math.sin(t * 6), id: 1 }, { x: ax, y: ay, id: 2 }]);
    } else if (i % 4 === 2) {
      await touch('touchEnd', [{ x: stick.x + 40 * Math.cos(t * 6), y: stick.y - 40 * Math.sin(t * 6), id: 1 }]);
    }
    await sleep(60);
  }
  await touch('touchEnd', []);
  await shot(page, 'phone-5-touch-combat');

  // Let the built-in debug hook fast-forward the room to check rewards & doors.
  const state = await page.evaluate(() => {
    const app = window.lanternfall;
    return { mode: app.mode, hp: app.world?.player.hp, enemies: app.world?.enemies.length };
  });
  if (state.mode !== 'run') errors.push(`[phone] expected run mode, got ${state.mode}`);

  // Pause menu
  await page.tap('.pause-btn');
  await sleep(300);
  await shot(page, 'phone-6-pause');
  await page.tap('[data-act=resume]');
  await sleep(200);

  // Fast-forward: clear every wave so the reward appears.
  for (let i = 0; i < 40; i++) {
    const st = await page.evaluate(() => {
      const w = window.lanternfall.world;
      for (const e of w.enemies) { e.dead = true; }
      w.spawnMarkers.length = 0;
      return w.state;
    });
    if (st === 'reward') break;
    await sleep(150);
  }
  // Walk onto the reward orb (teleport next to it).
  await page.evaluate(() => {
    const w = window.lanternfall.world;
    const orb = w.pickups.find((k) => k.kind === 'reward');
    w.player.x = orb.x;
    w.player.y = orb.y + 4;
  });
  await sleep(700);
  await shot(page, 'phone-7-glyph-choice');
  const cards = await page.locator('.gcard').count();
  if (cards < 1) errors.push('[phone] glyph choice did not appear');
  await page.tap('.gcard >> nth=0');
  await sleep(300);
  const after = await page.evaluate(() => ({ glyphs: window.lanternfall.data.run.glyphs.length, state: window.lanternfall.world.state }));
  if (after.glyphs !== 1) errors.push(`[phone] expected 1 glyph after choosing, got ${after.glyphs}`);
  if (after.state !== 'exit') errors.push(`[phone] expected doors open, got ${after.state}`);
  await shot(page, 'phone-8-doors');

  // Walk through the first door.
  await page.evaluate(() => {
    const w = window.lanternfall.world;
    const d = w.doors[0];
    w.player.x = d.x;
    w.player.y = 40;
  });
  const cdp2 = await ctx.newCDPSession(page);
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 260, id: 7 }] });
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: 200, id: 7 }] });
  await sleep(900);
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(500);
  const room = await page.evaluate(() => window.lanternfall.data.run?.room);
  if (room !== 1) errors.push(`[phone] expected to be in room 1 after the door, got ${room}`);
  await shot(page, 'phone-9-room2');

  // Saved mid-run: a reload should offer "Continue".
  await page.reload();
  await sleep(600);
  if ((await page.locator('[data-act=continue]').count()) !== 1) errors.push('[phone] no Continue button after reload');
  await page.tap('[data-act=continue]');
  await sleep(500);
  const resumed = await page.evaluate(() => ({ mode: window.lanternfall.mode, room: window.lanternfall.data.run?.room }));
  if (resumed.mode !== 'run' || resumed.room !== 1) errors.push(`[phone] resume failed: ${JSON.stringify(resumed)}`);

  // Die with no rekindles: summary screen, embers banked, back to hub.
  await page.evaluate(() => {
    const app = window.lanternfall;
    app.data.run.rekindles = 0;
    app.data.run.embers = 37;
    const p = app.world.player;
    p.hp = 0;
    p.down = true;
    app.world.emit({ type: 'playerDown' });
  });
  await sleep(2600);
  await shot(page, 'phone-10-summary');
  if ((await page.locator('.summary').count()) !== 1) errors.push('[phone] summary did not appear after death');
  await page.tap('[data-act=done]');
  await sleep(400);
  const prof = await page.evaluate(() => ({ embers: window.lanternfall.data.profile.embers, run: window.lanternfall.data.run, mode: window.lanternfall.mode }));
  if (prof.embers !== 37 || prof.run !== null || prof.mode !== 'hub') errors.push(`[phone] bad state after run end: ${JSON.stringify(prof)}`);

  // Spend embers in the Forge.
  await page.tap('[data-tab=forge]');
  await sleep(200);
  await page.tap('[data-act=buy][data-id=vitality]');
  await sleep(200);
  const rank = await page.evaluate(() => window.lanternfall.data.profile.forge.vitality);
  if (rank !== 1) errors.push(`[phone] forge purchase failed (rank ${rank})`);
  await shot(page, 'phone-11-forge');
  await ctx.close();
}

async function desktop() {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[desktop] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[desktop console] ${m.text()}`));
  await page.goto(url);
  await sleep(400);
  await page.keyboard.press('Enter'); // title -> hub
  await sleep(300);
  for (const tab of ['arsenal', 'armor', 'trinkets', 'forge', 'records', 'descend']) {
    await page.click(`[data-tab=${tab}]`);
    await sleep(120);
    if (tab === 'arsenal' || tab === 'forge') await shot(page, `desktop-hub-${tab}`);
  }
  await page.click('[data-act=descend]');
  await sleep(300);
  await page.keyboard.press('Enter'); // dismiss tutorial
  await sleep(900);
  // Fight with keyboard + mouse for a few seconds.
  await page.mouse.move(800, 300);
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 30; i++) {
    await page.mouse.down();
    await sleep(50);
    await page.mouse.up();
    if (i === 10) await page.keyboard.press('Space');
    if (i === 15) await page.keyboard.press('KeyK');
    if (i === 20) await page.keyboard.press('KeyE');
    await sleep(40);
  }
  await page.keyboard.up('KeyW');
  await shot(page, 'desktop-fight');

  // Jump straight into each boss arena to check they render.
  for (let b = 0; b < 4; b++) {
    await page.evaluate((biome) => {
      const app = window.lanternfall;
      app.data.run.biome = biome;
      app.data.run.room = 5;
      app.data.run.roomReward = { kind: 'boss' };
      app.data.run.doors = null;
      app.enterRoom(true);
    }, b);
    await sleep(3200);
    await shot(page, `desktop-boss-${b}`);
  }
  await ctx.close();
}

/** Steam Deck resolution, driven entirely by a virtual standard-mapping gamepad. */
async function gamepad() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    const state = { buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })), axes: [0, 0, 0, 0] };
    window.__pad = state;
    const pad = { id: 'Virtual Xbox Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, buttons: state.buttons, axes: state.axes, vibrationActuator: null };
    navigator.getGamepads = () => [pad];
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[gamepad] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[gamepad console] ${m.text()}`));
  const press = async (i, hold = 90) => {
    await page.evaluate((b) => { window.__pad.buttons[b].pressed = true; window.__pad.buttons[b].value = 1; }, i);
    await sleep(hold);
    await page.evaluate((b) => { window.__pad.buttons[b].pressed = false; window.__pad.buttons[b].value = 0; }, i);
    await sleep(120);
  };
  const A = 0, B = 1, X = 2, RB = 5, LB = 4, START = 9;
  await page.goto(url);
  await sleep(500);
  await press(A); // Begin -> hub
  const mode1 = await page.evaluate(() => window.lanternfall.mode);
  if (mode1 !== 'hub') errors.push(`[gamepad] A on title should open hub, got ${mode1}`);
  const device = await page.evaluate(() => document.body.dataset.device);
  if (device !== 'gamepad') errors.push(`[gamepad] device not detected as gamepad (${device})`);
  await press(RB);
  const tab = await page.evaluate(() => window.lanternfall.hubTab);
  if (tab !== 'arsenal') errors.push(`[gamepad] RB should switch to arsenal, got ${tab}`);
  await shot(page, 'deck-hub-arsenal');
  await press(LB);
  await press(A); // Descend
  await sleep(300);
  await press(A); // close tutorial
  await sleep(900);
  // Move with the left stick and attack with X.
  await page.evaluate(() => { window.__pad.axes[1] = -0.9; });
  for (let i = 0; i < 8; i++) await press(X, 60);
  await page.evaluate(() => { window.__pad.axes[1] = 0; });
  const moved = await page.evaluate(() => window.lanternfall.world.player.y < window.lanternfall.world.h - 80);
  if (!moved) errors.push('[gamepad] left stick did not move the player');
  await shot(page, 'deck-fight');
  await press(START);
  const paused = await page.evaluate(() => window.lanternfall.ui.hasModal);
  if (!paused) errors.push('[gamepad] Start did not pause');
  await press(B);
  const resumed = await page.evaluate(() => !window.lanternfall.ui.hasModal);
  if (!resumed) errors.push('[gamepad] B did not resume from pause');
  await ctx.close();
}

try {
  await phone();
  await desktop();
  await gamepad();
} catch (e) {
  errors.push(`[runner] ${e.stack ?? e}`);
} finally {
  await browser.close();
  server.httpServer.close();
}

if (errors.length) {
  console.error(`Smoke test FAILED with ${errors.length} error(s):`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('Smoke test passed' + (shots ? ` — screenshots in ${outDir}/` : ''));
