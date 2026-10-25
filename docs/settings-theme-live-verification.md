# Settings backgrounds, motion and theme isolation

24 October 2026. Prompt 1, including the reported background reset and RGB leakage. Branch `main`; existing staged, unstaged and untracked work is preserved. Changed `src/app.js`, `src/console-sky.js`, `src/console-themes.css`, `src/theme-system.css`, `scripts/settings-theme-live-check.cjs` and this note. No mobile changes, installation, deployment, commit or paid model requests.

The original fix remains: `receive()` updates the existing Settings overlay's `data-frame`. The sky observes theme changes and redraws its colors and particle style before the next paint, including paused and reduced-motion skies. The production color parser accepts shorthand hex colors such as Cyber's minified `#c5f`.

The moving-background reset was reproduced against the saved renderer containing that first fix. After 2.4 seconds of movement, a density change moved surviving particles back by up to 8.57 CSS pixels. `Sky.measure()` rebuilt the particle array on density, particle-style and measured-size changes. It now retains a bounded particle pool, changes the visible count, scales existing positions on layout resize and ignores transform-only size changes. Drift, twinkle and shooting stars use active elapsed time, preserving phase through pauses, density Off/on and recoloring.

`lightingChanged()` also reassigned `startTime = 0` on every settings publication, overriding paused CSS animation timing. Existing clocks now keep their phase, speed changes preserve normalized progress, and new layers join an existing clock once browser animation initialization completes. The wave pause rule put pseudo-elements inside `:is()`, missing the animated `::before` layers; those selectors now address the pseudo-elements directly.

RGB leakage came from `[data-frame=gamer] .theme-chip` and `[data-frame=gamer] .theme-wave::before` in `theme-system.css`, plus `[data-frame=gamer] .console-color-button .frame-swatch` in `console-themes.css`. An RGB Settings/page ancestor matched other themes' descendants. Decorations now belong to their immediate theme frame; a per-frame `--frame-swatch` supplies button and chooser colors. Equivalent active trace/halo rules and Redline name coloring were scoped to their owners. The shared `body[data-rgb]` clock remains; named themes reset their own palette variables.

Spectrum is a separate, intentional global lighting effect. Its former `body[data-lighting=spectrum] [data-frame]` rule overwrote named palette samples. It now changes live Settings/page/console surfaces; named Appearance cards and chooser samples retain their literal colors. Selecting RGB alone preserves explicit per-slot themes. Use default follows the global selection.

Evidence is under [`.build/settings-theme-live-20261024/`](../.build/settings-theme-live-20261024/); final follow-up logs and captures are in [`followup/`](../.build/settings-theme-live-20261024/followup/).

| Check | Final outcome / evidence |
| --- | --- |
| `npm run build` | Passed; existing warning about a bundle exceeding 500 kB. `followup/build.log` |
| `npm test` | 224 passed, 1 skipped, 0 failed. `followup/test.log` |
| `npm run test:desktop` | Passed all four suites on the final run. `followup/desktop.log` |
| Real renderer, four profiles | Passed: 80 immediate updates, 156 motion/timing checks, 88 color-isolation checks, 64 screenshots; zero page errors or external requests. `followup/visual.log`, `followup/visual/checks.json` |
| Scoped axe checks | No violations for contrast, labels, button names or dialog names on Appearance and the chooser in all profiles. Gradient contrast has incomplete results requiring manual assessment; this is not an accessibility-conformance claim. See `checks.json`. |
| Regression sensitivity | Original renderer fails overlay synchronization; overlay-only fix fails immediate canvas redraw (`baseline-before.log`, `baseline-stale-sky.log`). First-fix renderer reproduces moving-sky/paused-phase resets and RGB/Spectrum leakage (`followup/baseline-motion.log`, `followup/baseline-rgb.log`). |
| Source/work preservation | Compared with saved sources and the 439-entry follow-up manifest; index unchanged, no unrelated changes. `followup/task-source.diff`, `followup/preservation.json` |

The first prompt-1 desktop run failed at the existing Vim focus assertion in `scripts/vim-check.cjs:78` (`normal` versus `insert`); its unchanged rerun passed. Original logs remain at `desktop.log` and `desktop-retry.log`. A process-local preload routes the existing suites' hard-coded `artifacts/` and `test-data/` paths into `.build`; assertions and application behavior are unchanged. Tests use synthetic renderer state, fake CLIs/mocked HTTP and isolated data. No real-account login or token contents were needed.

The renderer regression freezes time during theme publications and compares actual canvas paint colors, primitives, pixels, `data-frame`, texture and node identity. It preserves focus and scroll. It then advances the sky for seconds before changing unrelated toggles, density, themes with matching and different particle styles, viewport size, ambient motion and reduced motion. Surviving particle positions and twinkle alpha are compared across transitions. Wave, Breathe and Spectrum checks inspect live CSS animation times, paused/resumed phase, speed changes and shared clocks.

RGB checks inspect every named chip's computed `border-image-source`, palette and background at multiple elapsed hue phases, verify that the RGB hue actually advances, and compare explicit console skins, waves, traces and button swatches. They cover the chooser preview, RGB on one slot, Use default, other ancestor themes and visible Spectrum-lit consoles. Finite control transitions are settled for palette comparisons; infinite hue/lighting animations continue. Hidden WebKit consoles are made visible before checking their animated colors. The script uses the built renderer and existing local Playwright package, with external HTTP blocked.

| Profile | Engine and CSS viewport | Visual inspection |
| --- | --- | --- |
| Windows PC | Chromium 156.0.8078.4, 1440 × 900 | Distinct named cards, RGB selection, Blue/Inferno overrides, chooser preview and paused sky controls |
| Mac emulation | WebKit 27.2, Desktop Safari profile, 1440 × 900 | Same affected views; engine controls and clock initialization checked |
| Android emulation | Chromium 156.0.8078.4, Pixel 7, 412 × 839 | Two-column cards, selected RGB card, stacked consoles, chooser actions, motion controls and wrapping |
| iPhone emulation | WebKit 27.2, iPhone 13, 390 × 664 | Same phone views; scrollable chooser/category rail, selected state and control alignment |

Twenty-two representative `*-rgb-appearance`, `*-rgb-selected` (phones), `*-rgb-consoles`, `*-rgb-chooser`, `*-motion-controls-paused` and `*-spectrum-appearance` captures were inspected. Chips retain distinct borders and textures under RGB and Spectrum; explicit Blue/Inferno consoles and their button swatches retain their colors under RGB. Labels wrap within cards, controls remain aligned and the document has no horizontal overflow. The phone category rail scrolls horizontally. Original live-refresh captures remain in `visual/` at the evidence root.

All profiles ran on Windows. Mac/phone profiles do not establish native macOS/iOS fonts, scrollbars, virtual keyboards, VoiceOver, physical touch or GPU performance. These are checks of the desktop renderer; the Flutter application was not changed or tested.

The shared guide's complete page/security checklist is retained by reference for unchanged flows, with this prompt's evidence below. This does not claim a fresh audit of unrelated product features.

| Checklist items | Status / applicable evidence |
| --- | --- |
| Page 1–8, 10–13, 16–19 | Unchanged; retain each status/reason in the [existing page review](console-themes-review.md#page-review). No new collection, consent, payment, SDK, remote asset or public page. |
| Page 9, 20 | Checked here: independent slot selection, named samples, motion controls and Use default work in the fixture. Persistence/error/retry behavior is unchanged; see the existing page review. |
| Page 14 | Scoped automated checks and screenshot inspection above; gradient contrast remains partly manual. Existing text styles are retained. |
| Page 15 | Controls, selects, toggles, Escape, focus/scroll retention and reduced motion exercised here. Existing keyboard/focus-return coverage remains in the page review; physical assistive-technology checks remain manual. |
| Security 21–29, 32–48, 50–54, 59–69 | Unchanged; retain each status/reason in the [existing security review](console-themes-review.md#security-review). Main-process validation, IPC authorization, vault encryption, CSP, persistence and process lifecycle are unchanged. No external service, credential or AI tool permission is added. |
| Security 30, 31, 49, 55, 56, 70 | Checked in scope: loopback fixture, isolated data, reviewed logs/source and production output. Verification code is outside the renderer bundle; no production source maps or `.env` files. No login token read, copy, request or logging. |
| Security 57–58 | No dependency changes or new audit. The [dependency review](dependency-security-review.md#applying-to-the-running-source-copy) records pending activation. Installed `node_modules/electron/package.json` still reports 44.7.2 while the source manifest requests 44.9.3. Follow that existing activation runbook and rerun its checks; this prompt does not install or stop the user's app. |

Remaining manual checks: in the rebuilt Windows app with an ordinary local shell, leave Appearance open for several seconds, toggle textures/cursor blink, change Stars, pause/resume motion and switch Blue → Violet → Arctic → RGB. Confirm particles continue from current positions, named cards remain distinct, explicit console themes stay selected and Use default follows the global theme. Repeat in native Safari and on physical Android/iPhone devices when available, including scrolling, touch, assistive technology and sustained motion performance. No model prompt or account token is required. Gradient contrast and broader 200% text/320px/landscape coverage remain covered by prior reviews or pending manual assessment; this prompt claims no fresh results for those cases.

Previously flagged wording: `.settings-rail-title` in `src/theme-system.css` produces decorative uppercase “SETTINGS”. The user reserved that correction for prompt 3 or 4; it remains unchanged here. Prompt 2 was not started.
