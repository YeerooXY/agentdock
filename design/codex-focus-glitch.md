# Codex console focus glitch

**Cause.** Paddock forwarded focus reports into Codex's PTY independently of resizing. This verified input path fits the owner's double-height redraw report. Codex's redraw and its height dependency remain unverified visually.

**Evidence.** Installed xterm source (`node_modules/@xterm/xterm/src/browser/CoreBrowserTerminal.ts`, `_handleTextAreaFocus`, `_handleTextAreaBlur`) emits `CSI I` / `CSI O` when DEC mode 1004 is enabled. `InputHandler.ts` enables that mode; `CoreService.triggerDataEvent` fires `onData`. The route is `src/app.js:mountTerminal` → `session.input` → `electron/main.cjs` → `Sessions.write` → PTY. Regression tests confirmed both reports reached the process before the fix.

`src/app.js:fitVisible` keys dimensions by `clientWidth:clientHeight:fontSize:devicePixelRatio`, skips unchanged dimensions, and caches columns and rows. PTY resizes require a changed size and settle for 250 ms; `Sessions.resize` also skips identical sizes. Grid tracks can be fractional; two rows include their intervening gap. Mocked tests of the actual fit loop retain row counts at fractional heights through repaint and cache reuse. Console focus CSS changes colors, shadows and outlines; no focus-dependent size rule was found.

The Electron focus handler refreshes screenshots; a changed screenshot publishes state and schedules guarded fits. `console-layout-ui.js` cancels an active resize gesture on blur and otherwise returns immediately. No focus handler directly sends `session.resize`.

**Fix.** `Sessions.write` drops whole `CSI I` / `CSI O` events for provider `codex`. Other providers, keystrokes, replies and pasted contents pass unchanged. Codex loses terminal focus notifications. Geometry and session lifetimes remain unchanged.

**Validation.** All 16 related mocked tests pass with `node --test --test-isolation=none tests/terminal-focus.test.cjs tests/terminal-output.test.cjs tests/terminal-environment.test.cjs tests/console-appearance.test.cjs`. Standard `npm test` and `npm run build` stop at `spawn EPERM` in this environment.

**Unverified.** No browser, Electron, Codex process or paid request was launched. Installed Codex mode activation, redraw and Windows focus-time geometry need confirmation. In the owner's Docker checks, compare slots 1+5 on a four-column grid, single-row Codex and equal-size Claude/shell consoles; check appearance and stable rows/columns across focus changes.
