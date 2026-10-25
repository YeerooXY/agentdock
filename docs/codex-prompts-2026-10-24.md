# Prompts for Codex, 24 October 2026

Run these in order, one Codex chat per prompt. Each one is self-contained. Context for all of them: Paddock lives in `C:\Users\7yeer\Projects\agent-dock`, on branch `main`, with uncommitted work. Don't reset, stash or commit. Read `AGENTS.md` first. After every prompt, run `npm run build`, `npm test` and `npm run test:desktop`. If you touch `mobile/`, also run `flutter analyze` and `flutter test`; the Flutter SDK is in `.build/mobile-tools/flutter`. Tests must make no paid model calls.

---

## 1. Fix: theme changes don't update the backgrounds right away

> In Paddock, changing the theme in Settings → Appearance updates the consoles but not the Settings backdrop (texture and star sky). It only refreshes after reopening Settings. The backdrop's colours come from `data-frame` on `.settings-overlay`, set in `settingsShell()` (`src/settings-ui.js`). The star canvas reads `--frame-a`/`--frame-b` from its host every 400 ms and its particle style from `consoleTheme(host.dataset.frame).sky` (`src/console-sky.js`, `Sky.measure`). In `receive()` in `src/app.js`, update `data-frame` on `.settings-overlay` whenever `state.settings.trimStyle` changes, as is already done for `#consoles-page`. Make the sky pick up the new colours and particle style immediately instead of waiting up to 400 ms. Add a check to `scripts/appearance-shots.cjs`, or a new script, that switches themes while Settings is open and confirms the backdrop's `data-frame` and canvas colours change without a re-render.

## 2. Fix: shooting stars don't fly straight

> In `src/console-sky.js` the shooting star moves by `(w * .5, h * .3)` over its life, but its trail is drawn along a fixed `(70, 42)` vector. In tall or wide panels the trail points a different way from the motion, so the comet looks crooked. Store one angle and speed per shooting star, then move it and draw its trail along that same direction vector. Give it a bright head and a fading tail. Vary the angle between about 20° and 35° below horizontal and keep the speed independent of the panel's aspect ratio. Apply the same fix to the Flutter version in `mobile/lib/console_surface.dart` (`_sky`, the shooting-star block). Verify with screenshots of a wide and a tall panel.

## 3. Themed backgrounds on the sidebar and every page

> Paddock already draws a themed backdrop around the consoles: `.page-backdrop` plus a star canvas mounted on `#consoles-page` (see the end of `src/theme-system.css` and `receive()` in `src/app.js`). Extend this to the left sidebar (`#sidebar`) and to the Projects, Results, Usage and API pages that render into `#content`. Mount one sky per region with `mountSky`, keep `data-frame` in sync with `state.settings.trimStyle`, and use the theme texture with a dark veil so text stays readable (WCAG AA contrast). Cards and surfaces stay solid. Honour the Theme textures switch, the star level, Ambient motion and reduced motion. The star loop in `console-sky.js` already pauses when the window is hidden or a dialog is open; keep total particles under about 1,500 across all canvases. Check the Windows Chromium, Mac WebKit, Android Chrome and iPhone Safari profiles, with no horizontal overflow.

## 4. Bigger, more personal effects

> Make Paddock's theme effects more cinematic and more distinct per theme without hurting readability or CPU. The current openings are canvas effects in `src/console-effects.js` (desktop) and `ConsoleOpeningPainter` in `mobile/lib/console_surface.dart` (Android). The ambient skies are in `src/console-sky.js` and `ConsoleAtmospherePainter`. The themes are listed in `src/console-themes.js`. Ideas to implement, one theme at a time, keeping each opening under 1.8 s with at most two flashes:
>
> - **Inferno:** a heat-haze ripple after the fireball and glowing embers that settle on the header; a lava glow along the bottom trim while the console is Thinking.
> - **Arctic:** frost that stays faintly in the corners, plus breath-like mist when a console finishes.
> - **Blue:** a small lightning arc along the trim when a console becomes Ready.
> - **Hot pink:** heart-shaped bursts when a console becomes Ready, and the neon tube flickers on once at launch.
> - **Void:** stars bend slightly around a dim black hole in empty panels.
> - **Redline:** a red light sweeps along the slash trims at launch, like a skin inspect animation, with sparks at the cut corners.
> - **Cyber:** a scanline glitch on the header when output starts.
> - **RGB:** the wave lighting gains a sparkle that travels with it.
>
> Tie the state effects (Thinking, Ready, error) to the existing session states. Make each one switchable with the existing Console animations setting, and turn them off under reduced motion. Mirror the effects in the Android app. Add frame captures to `scripts/appearance-effects.cjs` and to the Flutter capture approach used before (a temporary golden test, then deleted). Measure CPU with nine consoles open and keep idle CPU low; the user runs other heavy jobs, so leave headroom.

## 5. One-click subscription account switching (Codex first, then Claude Code)

> Add account switching for agent subscriptions, so a user with two Codex Pro accounts can move a console from account 1 to account 2 in one click when the first runs low and keep working in the same conversation.
>
> **Research first,** using the current official docs, and record the sources and date in `docs/account-switching.md`:
> - Codex CLI keeps its sign-in and sessions under `CODEX_HOME` (default `~/.codex`; `auth.json` and `sessions/`). Check that a second `CODEX_HOME` can hold a separate login, and how `codex resume <id>` finds sessions.
> - Claude Code has `CLAUDE_CONFIG_DIR`. Check the equivalent behaviour.
> - Check each provider's terms on using several personal subscriptions. Show the user a short, neutral note; don't encourage breaking terms.
>
> **Design:**
> - Each account is a named profile: provider, label and its own config directory under Paddock's data folder.
> - Adding an account opens a console that runs the CLI's own login with that directory (`codex login`, or Claude's login). Paddock never reads, copies, logs or sends token files. It only sets the environment variable when launching.
> - Conversations must survive a switch. Share the session history between profiles, for example by linking the profile's `sessions` folder to the default one, if the docs confirm this is safe. Otherwise copy only the one session file being resumed.
> - Each console shows its account in the header. The account menu offers "Switch to <account>", which ends the CLI process and relaunches it with the other directory and `resume <session id>`, in the same panel, folder and model. Unsent drafts are kept. Nothing is replayed automatically.
> - When the existing usage limits (`state.limits`, `src/account-identity.js`, `src/project-usage.js`) show an account at or above a threshold the user sets (default 90%), offer the switch in the console and on the phone. Never switch automatically unless the user turns that on.
> - The Usage page lists accounts separately. Don't add percentages across accounts.
> - The Android app gets the same Switch action, pinned to the console it was opened for.
>
> **Tests:** use a fake CLI that records its environment and arguments. Cover switching, resume, drafts kept, no token values in state or logs, a missing login handled gracefully, and the threshold prompt. Verify once by hand with two real Codex accounts; the user will do the logins.
