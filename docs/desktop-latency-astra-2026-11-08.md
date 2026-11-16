# Windows console latency and effects disposal review

8 November 2026. Independent review for the assigned Astra escalation. Source baseline supplied: `f3fadec67553d7dbf3df256836ccd536fae90b44`; findings below use current workspace files and frozen `.build/preview37-source`, not the older committed tree. No application changes were made.

## Verdict

There is confirmed avoidable work on both the main-process input path and renderer state-update path. Codex also has a separate pre-PTY metadata handshake with an eight-second timeout. These are credible investigation targets, but none has been measured as the cause of the owner's Windows freezes.

The supplied effects fixture supports cleanup of its temporary effects and panels. It does not establish complete memory safety. An empty ambient animation loop persists, and the source has retention paths the fixture does not exercise. There is no evidence here that an accumulating effects leak causes the reported ten-second startup or typing stalls.

Priorities below rank relevance and confidence in the code finding, not measured latency contribution. Android findings in the Opus report are outside this review.

## 1. High priority: owner bookkeeping precedes ordinary PTY input

Confirmed chain: xterm calls `session.input` at `src/console/terminals.js:129`; `electron/sessions.cjs:209-223` validates the write, records ordinary typing through `ownerInteraction`, then calls `terminal.write`. Escape-prefixed input has explicit exceptions; this is not literally every terminal byte.

`electron/owner-consoles.cjs:73-79` updates ownership, exact interaction time and reservation flags, then calls `changed`. At lines 164-179, that serializes all records twice and emits synchronously. Critical changes or expired persistence intervals call `flush`, adding serialization and the configured synchronous storage write at lines 181-187. Recency-only persistence is already delayed for up to two seconds; the listeners and serialization are not delayed. `electron/scheduler.cjs:62` drains on this event, and `electron/worker-sessions.cjs:21-30` scans retained jobs and their subtasks on it. Enter can additionally touch the project and publish session state after the PTY write (`sessions.cjs:222-223`, `main.cjs:657`).

User impact: local bookkeeping can postpone input delivery and later output forwarding on the same main event loop. Cost depends on records, jobs, disk and queued scheduling work. No duration or growth rate was measured.

Smallest safe direction: remove redundant reconciliation for recency-only changes and reuse the existing persistence batching. Keep exact activity updates and immediate ownership/demand protection in the canonical owner registry. Do not adopt Opus F3's proposed write-first/one-second activity sampling as a proven safe fix: the source explicitly preserves exact scheduling timestamps and immediate durability of critical flags. Moving PTY delivery ahead of that boundary changes failure and protection ordering. Verify reservation transitions, persistence failure behavior and typing-to-PTY timing before changing it.

## 2. High priority: protocol 2 reconstructs state and then rediscovers changes

`src/state-client.js:160` reconstructs and clones the full legacy-shaped snapshot after an applied batch (`:192-200`). `src/app.js:220` passes it to `setLegacy`, which compares top-level fields by JSON serialization (`state-client.js:9,38-42`). `app.js:266` renders the console page even with no changed fields. Grid rendering rewrites expand icons at `src/console/grid.js:54,113,149`; `syncExpanded` invokes `applySidebar` at line 58, and `app.js:261` invokes it again. `applySidebar` reads `titlebar.offsetHeight` (`app.js:278`) among DOM updates. Fits subsequently read terminal dimensions (`src/console/terminal-fit.js:55-58`).

This establishes repeated work and opportunities for forced layout, not a measured count of forced layouts per update. Fits already coalesce through one RAF (`src/console/terminals.js:41-43`) and skip unchanged dimensions; recommendations should preserve those guards.

Smallest safe direction: skip unchanged icon assignments in all relevant grid branches, remove duplicate sidebar application where ordering permits, and use the existing protocol changes to avoid unrelated console rendering. Protocol slice names are not automatically legacy field names: retain reset/fallback behavior, pairing-code refreshes and the view-copy isolation documented at `state-client.js:158-160`. Simply deleting `structuredClone` would remove that isolation. Preserve focus restoration, terminal identity, scroll anchors and settled-size suppression.

User impact: less renderer work can improve responsiveness during state updates. Output-heavy xterm parsing and GPU paint costs remain separate unknowns; no latency reduction can yet be quantified.

## 3. High priority for startup: Codex waits before creating its PTY

`electron/session-launch.cjs:143-149` awaits tracking preparation before `pty.spawn`. For normal Codex agent launches, `electron/providers/strategies/codex.cjs:40-47` reserves the slot, awaits metadata and releases the slot in `finally`; setup/login paths skip this handshake. `electron/codex-session.cjs:14-27` launches a hidden app-server and arms an 8,000 ms timeout. It sends `initialize`, then `hooks/list`, validates the exact owned hook, and kills the helper on settlement (`:20-22,41-60`). Failure becomes a warning and launch continues.

This is an asynchronous pre-PTY wait, not eight seconds of synchronous event-loop blocking. Its order of magnitude fits the other PC's report only if that PC was opening Codex and the handshake was slow. The timer is not a hard wall-clock ceiling when the event loop is delayed. Ordinary shell launch uses `-NoProfile` (`electron/platform.cjs:21-22`) and does not establish the same explanation.

Smallest safe next action: time preparation, helper settlement, PTY spawn, first output and renderer readiness independently. If the metadata wait dominates, change that design with explicit hook-trust and failure-path checks. Do not remove owned-hook validation, silently reuse a launch-specific trusted hash, or promise that disabling visual effects will fix this wait.

## 4. Confirmed effects lifecycle defect, limited severity evidence

The supplied `.build/typing-latency/effects-cleanup.json` records five cycles of nine panels. Each settled sample reports zero panels, canvases and exit overlays; DOM counters settle at 10 nodes and 5 listeners after GC, versus 7 nodes and 5 listeners initially. One RAF remains, and disabling motion reduces it to zero. There are no recorded page errors.

The harness imports frozen effects/sky modules, closes panels after 70 ms, waits 1,850 ms and collects garbage. It uses fixed colors and simplified HTML/CSS. It does not mount real xterm, load the complete theme, exercise PTYs, measure GPU resources or reproduce the affected PC. Its exit condition checks errors and remaining DOM effects, not the RAF or memory counters. I inspected the harness and asserted the saved result's values; I did not rerun the browser or overwrite its artifact.

Source agrees with its result: `src/console-sky.js:190-201` reschedules RAF while motion is enabled even after `rebalance` removes the last detached sky. The 42 ms check throttles drawing, not RAF callback frequency. `wake` already checks `skies.size` (`:203`). The smallest fix is to stop rescheduling when the set becomes empty and retain mount-time wakeup. Avoid adding another timer or manager.

Impact is unnecessary callbacks after all skies disappear. Actual app skies also exist outside occupied console panels; grid rendering mounts skies even on empty slots (`src/console/grid.js:121-123`), and the content background is intentionally retained (`src/app.js:174-177`). Closing the last process does not necessarily produce an empty sky set in production. This limits the likely benefit of the empty-loop fix.

Finite effects have concrete cleanup: `src/console-effects.js:62-73` cancels RAF, timeout and shake, removes the canvas and deletes its map entries. The close snapshot uses a 320 ms animation with a 520 ms removal fallback and a separate 1,100 ms dust removal (`:118-161`). Cloning the panel, copying canvases and walking cloned nodes still happens synchronously on receipt of the close state. Cleanup success does not make that work free.

### Retention qualifications missing from the short fixture

- Detached ambient skies are removed by `rebalance` or the frame-theme observer (`src/console-sky.js:168-171,228-232`). A paused `tick` returns before pruning (`:192`), `syncMotion` only cancels/wakes (`:205-207`), and the observer does not observe child removal (`:236`). A detached host can therefore remain referenced until another rebalance/theme event. This is a conditional retention path, not proof of indefinite growth in the app, where mounting or refreshing can prune it. Check removal after motion has already stopped. If confirmed in the real lifecycle, prune at the existing removal boundary without introducing another perpetual observer/loop.
- `sprites` is a module-lifetime map of detached 32-by-32 canvases keyed by color and softness (`src/console-sky.js:12-23`), with no eviction. Computed frame colors feed it (`:69-71,117`), including spectrum CSS colors (`src/theme-system.css:15-24`). A fixed-color fixture cannot establish its long-run plateau. Spectrum is stepped and repeating, so this is not proof of unbounded per-frame growth; quantify distinct retained colors before adding a cap or deleting stale cache entries.
- Per-sky particle arrays retain their high-water count (`src/console-sky.js:57-63`). Allocation demand is capped at 700 per sky and active draw demand is budgeted across skies (`:174-188`). The 1,450 active-particle budget is not a bound on the sum of retained arrays after different skies have grown at different times.

These distinctions prevent both an unsupported leak diagnosis and an unsupported complete-disposal claim.

## 5. Focus, background polling and close need separate traces

Returning from Start can focus a still-visible window. `electron/main.cjs:722-723` invokes task verification and screenshot refresh. Screenshot refresh queues async updates, but its bitmap conversion/hash and directory enumeration/stat calls are synchronous work (`electron/screenshots.cjs:36-67`). Equality is checked after this work. Rapid focus events can queue multiple refreshes (`:57`). If timings show repeated refreshes matter, coalesce pending refresh requests using the existing queue/schedule path while ensuring the latest clipboard is checked. No clipboard or screenshot data was read in this review.

Production also scans recent Codex logs every 12 seconds (`electron/main.cjs:754-756`). `electron/adapters.cjs:170-186` synchronously enumerates/stats two dated directories, then reparses changed files among the newest 64. Changed files read up to 64 KiB of head and 512 KiB of tail (`:138-149`). The 64-file cap limits parsing, not directory enumeration/stat work. Cache hits avoid reparsing. This can delay main-process input/output forwarding; periodic freezes require timing correlation before attribution.

The Codex policy disables focus reports (`electron/providers/codex.cjs:5`), and `sessions.cjs:216` filters the exact focus escape sequences. There is no verified direct Start-key-to-buffer-reset chain here. A moved xterm deliberately requests repaint (`src/console/terminals.js:179-181`); `terminal-fit.js:88-99` refreshes it and reports only changed settled dimensions after 250 ms. Main also rejects unchanged dimensions (`sessions.cjs:234-242`). Reset/replay is a different path (`terminals.js:59-71,199-205`). Trace resize IPC, repaint and reset packets separately; do not delete repaint or resize guards based on a visual redraw report.

Closing has three distinct paths:

| Action | Confirmed path | Meaning for diagnosis |
| --- | --- | --- |
| End local console | `sessions.cjs:323-336` calls native `kill` before emitting changed | Native-call duration and subsequent state/clone/render work need separate timing. |
| Window close button | `main.cjs:721` prevents close and hides to tray | Sessions intentionally remain alive. |
| Quit application | `main.cjs:825-846` sequentially stops services; `sessions.cjs:340-358` waits for exits with a 5,000 ms fallback | This can explain a quit delay independently of a visual closing effect. Do not parallelize teardown without checking dependencies. |

The prior report's short process-CPU observation is not an effects-on/off experiment or a latency trace. I did not repeat it or use it to select a culprit.

## Verification and next steps

Read both prior reports, the probe and saved results; traced the current input, publication, renderer, effects, startup, focus and shutdown paths. Byte comparisons found these 20 inspected files identical to their preview37 counterparts: `electron/{sessions,owner-consoles,worker-sessions,scheduler,main,session-launch,codex-session,screenshots,adapters,platform}.cjs`, `electron/providers/codex.cjs`, `electron/providers/strategies/codex.cjs`, `src/{app,state-client,console-sky,console-effects}.js`, `src/theme-system.css`, and `src/console/{grid,terminals,terminal-fit}.js`. Line references therefore apply to both source trees for these files. This is not a claim that the entire trees match.

The saved cleanup-artifact assertions passed. Attempted `node --test tests/codex-session.test.cjs` after inspecting its mocked child-process fixture; the test runner failed to spawn with `EPERM` before tests executed. This is a permission blocker, not a test failure in the handshake logic. No alternative test command or permission escalation was attempted.

Capture durations and counters, without input contents, on the affected Windows machine: renderer input to main receipt; owner bookkeeping to PTY write; output receipt to paint; state publication/receive; Codex preparation to first prompt; focus callbacks; kill/state update/close rendering. Compare the same workload with ambient, opening/state effects and spectrum lighting separately controlled. Record p50/p95/max latency, long tasks, resize/reset counts and post-GC retained resources. Keep user-visible testing and live setting changes under the owner's control.

Start fixes with redundant state/DOM work and the empty-loop termination. Preserve owner safety and collect startup/focus timings before larger changes. Existing module boundaries are adequate for these small changes; `main.cjs` (848 lines) and `app.js` (541 lines, newline-split counts) warrant responsibility review, but splitting them alone removes no work and would expand this fix. No inspected production module exceeded 1,000 lines.

Only this report was written. No delegation, provider calls, installs, live console input, settings changes, foreground windows, restarts or commits were performed. Local worker execution was skipped because this assignment explicitly requires direct independent review and forbids nested workers.

Not checked: rendered keyboard journeys, full build/test/desktop suites, real Windows latency, real xterm/GPU retention or hours-long effects behavior. No production fix or root-cause claim is made; the remaining risk is attributing a multi-path responsiveness problem to the small cleanup fixture.
