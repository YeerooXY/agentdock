# Windows typing, startup and effects review

8 November 2026. Read-only investigation of the current workspace and frozen preview.37 source. Application code and user settings were not changed.

The user reports slow submission, intermittent typing freezes, roughly ten seconds to open a console on another PC, slow console/window closing and Codex redraws after using the Windows key. The affected PC, exact CLI version and live event-loop trace were not captured. These observations are not yet reproduced end to end.

## Review coverage

One included Claude Code Opus worker ran at medium effort (job 927b51e0-ed40-4ea7-81ce-27b1bfb60240). Its report is typing-send-latency-opus-2026-11-08.md. The user subsequently clarified Windows desktop, so that report's Android findings F1/F2/F5 are outside the current complaint. Its desktop F3/F4 remain relevant. Astra qualifies the proposed write-first/activity-sampling remedy: preserve immediate owner protection and exact timestamps.

The requested Astra review was initially blocked by exhausted Codex allowance. A fresh native account/rateLimits/read after the scheduled reset confirmed available included allowance. Astra (codex:default, gpt-6-astra, medium; job 2f0df534-8115-4336-8a39-ab13892b4f29) completed independent review of the unresolved Windows paths in desktop-latency-astra-2026-11-08.md. The coordinator performed the source checks and cleanup probe below. No paid API route or substitute model was used.

## Findings and evidence

### 1. Typing performs unrelated synchronous work before PTY delivery

Sessions.write calls ownerInteraction before terminal.write (electron/sessions.cjs:209-223). OwnerConsoles.changed serializes the records twice, sometimes persists synchronously, and emits changed (owner-consoles.cjs:164-189). Synchronous listeners include Scheduler.drain and WorkerSessions.reconcile; the latter walks all retained task jobs/subtasks (worker-sessions.cjs:21-30).

This is a confirmed call chain, not a measured typing duration. It is a poor latency boundary even when individual operations are cheap. Preserve immediate owner protection and exact activity timestamps while coalescing noncritical persistence/reconciliation work. Do not remove protection or merely move the same full work into another wrapper.

### 2. State updates repeat whole-state work and terminal layout work

Protocol 2 rebuilds and structuredClones the desktop snapshot (src/state-client.js:160). The app then compares broad legacy fields through JSON serialization and renders the console grid (app.js:192-275). The grid rewrites the expand icon even when unchanged (console/grid.js:149), and layout reads/fits follow writes (console/terminal-fit.js:48-100).

The source establishes redundant work; its share of the reported stalls is unmeasured. Reuse the existing changed-slice information, skip unaffected console DOM/layout work, and batch repeated publication. Keep caret, scrollback, focus and resize guards intact.

Production also calls RecentCodex.scan synchronously every 12 seconds (main.cjs:756). It lists/stats recent files and reparses changed logs among the latest 64, reading up to 64 KiB of head plus 512 KiB of tail per changed file (adapters.cjs:138-187). This is another possible main-thread pause as activity/history grows; its duration was not measured. The production recent/usage background intervals are skipped in test mode, so functional test passes do not cover that workload.

### 3. Temporary effect nodes cleaned up; an empty ambient loop remained

The coordinator ran frozen release37 procedural effects and ambient skies in headless Chrome: five cycles, nine panels per cycle, 1.85 seconds allowed after closing each batch. Every sample had zero panels, canvases and closing overlays remaining, with zero page errors. One requestAnimationFrame remained pending after each cycle; disabling ambient motion reduced it to zero. After forced collection between cycles, DOM nodes rose from 7 at baseline to 10 after the first cycle and stayed at 10 for all five; JavaScript event listeners stayed at 5. These bounded fixture counts show no growing detached-DOM/listener accumulation in this run. Results: .build/typing-latency/effects-cleanup.json; harness: .build/latency-effects-probe.cjs.

The matching defect is console-sky.js:190-203: tick schedules another frame while motion is enabled without checking whether any skies remain. Stop the global loop when there are no connected drawable skies, and wake it when one is mounted. This is unnecessary background activity, not proof of a growing canvas leak or the severe freeze's root cause.

Particle pools are deliberately retained while a live sky's density is reduced, including Off (console-sky.js:54-63). The pool is bounded per sky; retention alone is not an unbounded leak. The probe does not establish JS heap, detached-node or GPU-texture behavior over hours with real xterm output.

### 4. Effects also have sustained layout and paint costs

The ambient loop rebalances visible canvases about every 42 ms and reads layout/style before drawing (console-sky.js:163-203). Spectrum lighting animates CSS color properties used across live surfaces (theme-system.css:15-16), while glass styles use blur/shadows. Finite opening effects also allocate full-panel canvases at up to devicePixelRatio 2 (console-effects.js:51-89).

A three-second observation of the project Electron process tree showed the renderer using approximately 50% of one CPU core, its GPU process 19.8%, and its main process 5.2%. This was an active investigation, not an idle baseline or an effects-on/off comparison. It supports investigating renderer work but does not attribute it exclusively to effects. The cleanup fixture omitted full theme CSS, real PTYs and GPU tracing.

### 5. Codex startup contains a pre-terminal eight-second gate

SessionLaunch.createOne awaits prepareTracking before pty.spawn (electron/session-launch.cjs:143-150). The Codex strategy starts a separate app-server to initialize and request hooks/list, with an 8,000 ms timeout (electron/codex-session.cjs:14-48). On failure it continues with a tracking warning.

A slow or stalled metadata handshake can therefore consume about eight seconds before the real Codex terminal starts. This is an asynchronous wait, which delays creation but does not itself block the Electron event loop or explain freezes in other consoles. This fits the reported order of magnitude but was not observed on the other PC. It does not explain ordinary-shell startup, which takes a different path; Windows shellLaunch already uses -NoProfile. Time metadata startup separately from PTY creation and first prompt. Preserve owned-hook validation and show useful loading state before changing the handshake design.

### 6. Windows-key focus changes can trigger nonvisual background work

Window focus triggers task verification and screenshot refresh (electron/main.cjs:722-723). Screenshot refresh copies/hashes clipboard bitmap data and synchronously scans screenshot directories even before determining whether the item changed (screenshots.cjs:37-67). Task verification is throttled separately. These are plausible focus-related stalls, not measured causes.

Codex focus-report escape sequences are deliberately filtered (providers/codex.cjs:5; sessions.cjs:216), so a generic focus-report explanation is unsupported. The terminal fitter also suppresses unchanged PTY sizes and intentionally refreshes moved xterms (console/terminal-fit.js; console/terminals.js:179-181). Effects pause/cancel on document visibility changes, but the ambient pause predicate does not check document.hasFocus (console-sky.js:159-162). Opening Start can blur a visible window without hiding it, so blur alone does not guarantee the effects stop. Trace real resize calls, buffer resets and renderer refreshes to distinguish a Codex redraw from a Paddock replay. Do not disable those guards blindly.

Closing a console calls native terminal.kill on the main-process path before the renderer can animate its inert snapshot (sessions.cjs:323-337; console-effects.js:118). Its elapsed time was not measured. Closing the application window normally hides it to the tray (main.cjs:721), which is another path; the exact closing action needs confirmation during reproduction.

## Independent Astra qualifications

Astra confirmed the major source chains and byte-matched 20 scoped files against frozen preview37. Its report adds important limits:

- Paused animation returns before pruning disconnected skies; child removals are not observed. Detached hosts may remain referenced until another rebalance or theme event. The original running-motion fixture does not cover this path.
- The module-lifetime color-sprite cache has no eviction. Spectrum uses repeating stepped colors, so unbounded growth is unproven; measure distinct retained colors and long-run plateau. Fixed-color fixture counts do not cover it.
- The active particle budget is not a total retained-array bound. Different skies can each retain their prior high-water allocation, capped per sky.
- Actual application skies also occupy empty grid slots and the content background. Closing the final process does not necessarily empty the sky set; the empty-RAF fix may therefore have a limited production benefit.
- Application Quit waits for process exits with a five-second fallback, independently of console closing effects. Window close normally hides to tray.
- Astra attempted the mocked Codex-session test, but the worker sandbox rejected the test runner child process with spawn EPERM before tests executed. Saved cleanup-artifact consistency assertions passed. This was not a handshake test failure.

Both reviewers agree these are investigation targets, not measured root causes. No test establishes full effect disposal or long-run memory/GPU safety.

## Recommended next work

1. Capture local timestamps for input receipt, owner bookkeeping, PTY write, state publication, renderer receive and first paint; record durations/counters rather than message contents.
2. Remove whole-state work from unchanged console updates and coalesce bookkeeping while preserving immediate protection.
3. Stop empty ambient loops and compare all motion/effects enabled versus disabled under the same console/output load. Check frame times, input latency, resize/reset counts and retained resources.
4. Time the Codex metadata startup and focus callbacks independently on the slower PC.
5. Add richer effects after these checks establish headroom. Share clocks/resources, keep effects out of the input path, and verify disposal on close, hidden state and reduced motion.

No production fix, live setting toggle, user-console input, restart, model request test, or effects redesign was performed. Existing source findings require runtime confirmation before promising a particular latency improvement.
