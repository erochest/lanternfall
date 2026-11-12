# Lanternfall

A fast, pick-up-and-put-down action roguelite. You're the last lighthouse keeper, carrying a lantern
down through drowned ruins. You fight in chambers, bind elemental **Glyphs** to your moves, beat a
guardian at the bottom of each depth, and spend what you bring back to grow stronger for the next
descent.

It's built for a phone in landscape, and it also plays well with a controller on desktop or Steam Deck.

## How a run works

- **4 depths**: the Shallows, the Sunken Archive, the Coral Furnace and the Maw. Each depth has 5
  chambers and then a guardian. Every depth has harder enemies, and the guardians fight in phases.
- **Each chamber is quick**, roughly 20–60 seconds. Your progress saves when you enter a chamber.
  Close the tab, take a call, or put the phone away, and **Continue** brings you back to the same
  chamber.
- **Doors show what's behind them.** After a clear, choose your next reward:
  - a Glyph of a given Current
  - Pearls, the in-run money
  - Embers, the permanent money
  - max health
  - a damage whetstone
  - healing
  - the shop, which is always offered before chamber 4
- **Glyphs** are your in-run mods. There are five Currents:
  - **Ember**: burn
  - **Frost**: chill, then freeze
  - **Storm**: chain lightning
  - **Tide**: knockback and wall slams
  - **Gloom**: critical hits, executes, and healing on kills

  Glyphs attach to your Attack, Special, Dash or Flare, or work as passives. Each has a rarity, and you
  can upgrade it up to level 4. Hold glyphs of two Currents and a legendary **Confluence** can show up.
- **Enemy armor**: some enemies have a shield bar. Break it to stun them.
- **Between runs** you spend Embers and Starglass at the Lighthouse:
  - **Arsenal**: 4 weapons, each upgradable to level 5. The Tidecutter is a fast cutlass, the
    Brinepiercer a reach harpoon, the Lumen Staff a ranged caster, and Deepweight a slow, heavy anchor.
  - **Armor**: 6 coats with different playstyles, upgradable to level 3.
  - **Trinkets**: 8 passive charms.
  - **The Forge**: permanent upgrades, plus unlocks for the Tide and Gloom Currents.
  - **Tide**: difficulty levels 1–10. Each win unlocks the next level. Higher levels give more Embers.

## Controls

| Action  | Touch | Gamepad | Keyboard / mouse |
| ------- | ----- | ------- | ---------------- |
| Move    | Floating stick: press anywhere on the left half | Left stick / D-pad | WASD / arrows |
| Aim     | Automatic, with aim assist. Drag Special/Flare to aim by hand | Right stick (optional) | Mouse (optional) |
| Attack  | Big button. Hold it to keep combo-ing | X or RT | Left click / J |
| Special | ✦ button (drag to aim) | Y or LT | Right click / K |
| Dash    | » button. You're invulnerable during the dash | A or RB | Space / Shift |
| Flare   | ☀ button (drag to aim) | B or LB | E / L / Q |
| Pause   | ❚❚ (top right) | Start / Select | Esc / P |
| Menus   | Tap | D-pad/stick, A confirm, B back, LB/RB switch tabs | Arrows, Enter, Esc, Q/E tabs |

Settings let you change:

- sound and ambience volume
- screen shake
- haptics
- damage numbers
- aim assist strength
- **left-handed layout**
- **touch control size**
- drag-to-aim
- reduced flashes

## Play on your phone

The game is a Progressive Web App: install it once and it runs fullscreen and offline.

1. Deploy it somewhere with HTTPS. The easiest option is GitHub Pages, described below.
2. Open the URL on your phone.
   - **iPhone (Safari):** Share → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ → **Install app** (or **Add to Home screen**).
3. Launch it from the home-screen icon. Turn the phone sideways.

To try it from your dev machine without deploying, run `npm run dev` and open the **Network** URL it
prints (for example `http://192.168.1.20:5173`) on a phone on the same Wi-Fi. Offline caching and
installing need HTTPS, so for those use the deployed build.

## Play on Steam Deck

The simplest approach is a web shortcut in Game Mode:

1. In Desktop Mode, install a browser such as Chrome or Firefox from Discover.
2. In Steam, choose **Add a Non-Steam Game**, pick the browser, and then edit the shortcut's launch
   options. For Chrome, for example:
   `--kiosk --start-fullscreen https://<your-pages-url>/`
3. Switch back to Game Mode and launch it.

Set the controller layout to **Gamepad** (not "Web Browser") so the Deck's buttons reach the game as a
standard controller. Rumble works where the browser supports it.

On a desktop, open the URL in any modern browser. Plug in or pair a controller and press any button.
The on-screen prompts switch to match the device you used last.

## Development

```sh
npm install
npm run dev         # dev server (also on your LAN, for phone testing)
npm run build       # typecheck + production build into dist/
npm run preview     # serve the production build
npm test            # unit + headless simulation tests (Vitest)
npm run test:e2e    # Playwright smoke test of the built game (run `npm run build` first)
npm run icons       # regenerate PNG icons from scripts/gen-icons.mjs
```

`npm run test:e2e -- --shots` also writes screenshots to `screenshots/`. The smoke test drives the real
build three ways:

- a touch phone: a full run loop, saving and resuming, death, and a Forge purchase
- keyboard and mouse at desktop size: every guardian arena
- a virtual standard gamepad at Steam Deck size

### Deploying to GitHub Pages

`.github/workflows/pages.yml` runs the tests, builds, and publishes `dist/` on every push to `main`.
In the repo settings, set **Pages → Source** to **GitHub Actions**. The build uses relative paths
(`base: './'`), so it works under any sub-path. Any other static host works too: upload `dist/`.

### Stack and layout

TypeScript, Vite, and plain Canvas 2D. There is no game engine and there are no runtime dependencies,
so the whole game is about 50 KB gzipped and loads instantly on mobile data.

```
src/
  core/     math (hit shapes, collision), seeded RNG
  data/     content: weapons, armor, trinkets, forge, glyphs, enemies, bosses, biomes
  game/     simulation: World (fixed 60 Hz step), combat, player, enemy/boss AI,
            run + profile progression, saving (localStorage, sanitised on load)
  render/   camera, floor cache, lighting, glow sprites, entity drawing
  input/    keyboard/mouse/gamepad/touch → one Controls struct; touch overlay
  audio/    procedural WebAudio sound effects and per-depth ambience
  ui/       DOM menus and HUD with spatial navigation for controllers
  app.ts    ties it together: modes, run lifecycle, rewards, save on hide
tests/      Vitest: pure logic tests and bot-driven simulation of rooms and bosses
scripts/    Playwright smoke test, icon generator
```

The simulation in `src/game` never touches the DOM. Tests can therefore run whole chambers and
guardian fights headlessly with a simple bot, which keeps every weapon, depth and boss clearable as
content changes.

Content lives in `src/data`:

- **Enemies**: add a new enemy in `enemies.ts` with an `ai` kind.
- **Glyphs**: add a new glyph in `glyphs.ts` with an `apply(mods, power)` function.
- **Bosses**: boss patterns are generator functions in `game/bossAI.ts`, so each attack reads top to
  bottom as "telegraph, wait, strike".
