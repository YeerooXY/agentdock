# Console theme effects

25 October 2026. Prompt 4. Branch `main`; existing staged, unstaged and untracked work is preserved. No commit, app installation, deployment, real CLI/model request, or live Paddock process inspection was performed.

## Changes

- Inferno openings add heat shimmer and embers that settle near the header; Thinking adds a lava glow on the lower trim.
- Arctic keeps faint corner frost and shows a short mist reaction when a console becomes Ready.
- Blue shows one trim lightning arc on Ready. Its opening keeps at most two panel flashes.
- Hot pink flickers its neon tube once during its opening and shows hearts on Ready.
- Void bends stars around a dim lens in empty panels.
- Redline sweeps light along its slash trims and adds corner sparks during its opening.
- Cyber glitches the header on a new live output burst.
- RGB adds a small sparkle that follows the shared Wave lighting phase and speed.
- Existing openings for Plain, Paddock and Violet remain distinct. Desktop and Flutter share the new state reactions and keep effects behind console content.

Effects respond to observed session transitions. Ready and Error reactions require a real change into that state; attention is not treated as Ready. Cyber reacts to a live output burst, not initial history, Settings updates or continuous output packets. Flutter carries stable console identity, connection generation and output sequence through the actual `DockApp` path. Reconnects, history checkpoints, page revisits, density changes and ordinary rebuilds do not replay effects. A new console gets one opening; resizing or revisiting an existing console does not. Settings Replay remains available.

The existing Console animations setting and reduced-motion preference suppress openings and state effects. Ambient motion remains independently controlled. Covered, hidden, offscreen or disconnected surfaces stop or cancel visual work. Each console owns at most one short state layer. Effects do not receive pointer input or send terminal input. The Settings heading in `src/theme-system.css` now reads “Settings”, as corrected in Prompt 3.

## Verification

### Desktop capture matrix

[`scripts/appearance-effects.cjs`](../scripts/appearance-effects.cjs) captures the built renderer with a synthetic local dock and blocks external requests. It covers all 11 themes across Windows Chromium, Desktop Safari WebKit emulation, Pixel 7 Chromium emulation and iPhone 13 WebKit emulation. The final run saved 174 captures under `.build/codex-prompt-runs/2026-10-24/4/verification/appearance-effects/`; [`checks.json`](../.build/codex-prompt-runs/2026-10-24/4/verification/appearance-effects/checks.json) records timings and assertions. All four profiles had zero page errors. Opening metadata asserts duration below 1,800 ms and no more than two flashes. The maximum difference between a timed screenshot and its requested capture time was 101 ms. First live Cyber output was observed by 935 ms at the latest across the four profiles. Canvas pixel checks confirm painted effects, not only canvas creation. Tests cover click-through, state edges, Settings Replay, cancellation, reduced motion, disabled animations, lifecycle cleanup, stable RGB phase and output cooldown.

The profiles all ran on Windows. Mac WebKit, Android Chromium and iPhone WebKit are browser/device emulations, not native macOS or physical phone results. The captures do not establish native fonts, touch, virtual keyboards, assistive technology, battery use or phone GPU performance.

The final Flutter painter run passed and saved 33 captures under `.build/codex-prompt-runs/2026-10-24/4/verification/flutter-final/`, with file hashes in `captures.json` and the run log in `verification/flutter-final-capture.log`. The fixture loads SDK Roboto and uses ordinary light text at a logical size of 360 × 540. Representative Inferno, Redline, Hot pink, Arctic, Blue, Cyber and RGB images were inspected for effect placement and readable fixture text. These supersede the earlier debug-font captures in `verification/flutter/`. They verify painter output on Windows, not a complete phone UI or physical-device typography. The temporary golden test source and its generated source-directory images were removed after verified copies were saved.

### Nine-console CPU measurement

[`scripts/appearance-cpu-bench.cjs`](../scripts/appearance-cpu-bench.cjs) loaded the stable `dist` build into an isolated Electron fixture with nine synthetic sessions, nine mounted xterm instances and nine sky canvases in a 3×3 grid. Redline intentionally hides its sky, leaving eight visible moving skies. No active Paddock process or CLI was sampled. The fixture starts with a hidden window and uses `showInactive()` so it does not take focus.

On Windows (`win32`), Electron 44.7.2, with 32 logical processors, the build hash was `a1669883298b30e978449f3b6fa4dcb266ef20d3e29f6c6738e0b575ce1cb73c`. The benchmark started after the browser captures and required suites had finished; no other browser or Electron suite ran alongside it. Each phase ran for about 12 seconds with 12 one-second samples. `app.getAppMetrics()` cumulative CPU-time deltas were keyed by PID and process creation time and included the fixture's Browser, GPU, Utility and Tab processes. The first sample established the baseline. The fixture also wrapped canvas `clearRect` calls to count drawing; wrapper and once-per-second sampling overhead were not separately calibrated.

| Phase | Elapsed | Process CPU time | Average core equivalents | Of 32 logical processors | Renderer activity |
| --- | ---: | ---: | ---: | ---: | --- |
| Idle, Ambient on | 12.004 s | 6.6499 s | 0.554 | 1.7312% | 9 sessions/xterms, 8 moving skies, 0 state-effect frames |
| Bounded Ready/Error effects | 12.019 s | 7.1393 s | 0.594 | 1.8562% | 9 sessions/xterms, 8 moving skies, 189 state-effect frame calls |
| Console animations and Ambient off; stars Off | 12.006 s | 0.4873 s | 0.0406 | 0.1268% | No sky draw or state-effect frames |
| Window hidden | 12.014 s | 0.0299 s | 0.0025 | 0.0078% | Page hidden; no sky draw or state-effect frames |

Average core equivalents equal process CPU seconds divided by elapsed seconds. The capacity column divides that value by the host's 32 logical processors; it is a normalization, not Electron's `percentCPUUsage`. This records the isolated app process tree, not total system CPU or browser frame time. The fixture's instrumentation overhead is included. The run does not establish performance on another host or physical phone. Raw metrics and the fixture are under `.build/codex-prompt-runs/2026-10-24/4/verification/cpu-bench/`.

### Build and suites

- `npm run build`: passed. Vite reports the existing JavaScript chunk size warning above 500 kB.
- `npm test`: 224 passed, 0 failed, 1 skipped (225 total).
- `npm run test:desktop`: passed, including the paid-call guard; no paid request was made.
- `.build/mobile-tools/flutter/bin/flutter analyze`: no issues.
- `.build/mobile-tools/flutter/bin/flutter test`: all 155 tests passed, including the actual DockApp state-flow regression.
- `scripts/settings-theme-live-check.cjs`: passed in the four browser profiles after the shared sky/theme changes; the Prompt 1 verification note records its focused coverage and evidence.
- Final build and suite logs are in `.build/codex-prompt-runs/2026-10-24/4/verification/`.

## Page and security checklist scope

This is a focused review of the effect changes, not a new product-wide audit. For unchanged checklist rows, retain the statuses and reasons in the [desktop console theme review](console-themes-review.md#page-review) and its [security review](console-themes-review.md#security-review), and the [native console review](mobile-console-fx-review.md#page-review) and its [security review](mobile-console-fx-review.md#security-review-of-the-change).

| Checklist item | Prompt 4 evidence / reason |
| --- | --- |
| Page 1–12, 16–18 | No new data collection, account flow, commercial claim, fee, marketing, or external service. See the linked reviews for unchanged rows. |
| Page 13: alternatives and accessible names | Effects are decorative canvas/CSS/Flutter painting; no new focusable control. Existing Settings Replay remains the user action. |
| Page 14: readability | Desktop screenshots were inspected across the four profiles; text and controls remain legible in the inspected captures. The final Flutter painter captures use readable Roboto fixture labels; actual phone UI, native fonts and physical-device checks remain manual. Finite captures do not certify every animation position. |
| Page 15: keyboard and motion | Opening layers allow pointer input; flow regression verifies no terminal input is submitted by the effects. Reduced motion, Console animations, covered surfaces and lifecycle behavior are checked in the browser capture and Flutter tests. Native assistive-technology checks remain manual. |
| Page 19: assets | Effects use existing canvas/CSS and Flutter canvas drawing. No image, font or package dependency was added for this prompt. |
| Page 20: deletion | No new persisted user data or record was added. |
| Security 21–24, 26–29, 32–34, 37–38, 40–48, 50–54, 56, 59, 61–69 | No backend, credential, authentication, session authorization, upload, AI, network or storage boundary changed. Refer to the linked reviews for each unchanged row. |
| Security 23, 25, 35–36 | No key or credential was added. State effects use in-memory session identity/state and do not change permissions or send RPC/input. |
| Security 30–31, 49, 55 | Browser and Electron fixtures use synthetic console data and isolated profiles; external requests and renderer errors were empty. Logs and captures contain no account credentials. No token was read, copied, requested or logged. |
| Security 39 | Desktop effects draw to canvases and Flutter uses native canvas widgets; terminal strings are not inserted as new HTML by this feature. |
| Security 45 | Opening, hide, cover and effect cleanup preserve the live terminal. The actual Flutter flow test covers history, output bursts and reconnects without replay or submitted input. |
| Security 57–58 | No dependency change or new audit was made for this prompt. The known Electron runtime activation limitation remains documented in the [dependency review](dependency-security-review.md#applying-to-the-running-source-copy); this task did not install or restart the app. |
| Security 60, 70 | No model requests or new tool permissions. Renderer and Flutter changes, fixture code and required suite results are recorded above; temporary golden capture source was removed. |

## Remaining manual checks

Check native macOS rendering and physical Android/iPhone font, touch, keyboard, VoiceOver/TalkBack, GPU and sustained-motion behavior when those devices are available. No paid model request or real-account login is needed to verify these effects. The desktop browser profiles are Windows emulations, and CPU measurements are from one 32-logical-processor Windows host.
