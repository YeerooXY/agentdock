# Typing freezes and slow message submission: source review

Reviewer: Opus, medium effort, read-only. Date: 8 November 2026. Workspace revision f3fadec plus uncommitted edits; release source `.build/preview37-source`.

Scope: desktop renderer and terminal, Android composer, client and state paths, and the PC main-process boundary they call. No code was run. No profiler, device or synthetic probe was used, so every cost below is a code path, not a measured duration. User frequency is not inferred. Every finding exists at the same lines in frozen preview37 and in current source; none is release-only or current-only.

## Why the UI can freeze before any model answers

Each typed character crosses only local code: the composer or xterm, IPC or the phone socket, the PC main process, then the PTY. The model sees nothing until Enter reaches the CLI. Freezes during typing therefore come from synchronous local work in the UI thread or the PC main thread. Terminal echo returns through the same main thread (`electron/main.cjs:659`), so any main-process stall also delays the character appearing on screen.

## F1. Android: every composer keystroke rebuilds the whole home shell

Confidence: high for the chain; frame cost unmeasured.

Chain: `TextEditingController` change → `ComposerController._draftChanged` (`mobile/lib/features/console/composer_controller.dart:60-68`) → `drafts.set` and `drafts.remember` → `_changed()` → `notifyListeners`. `DockHome` merges the composer into `changes` (`mobile/lib/app/dock_home.dart:78`), and its `AnimatedBuilder` (`dock_home.dart:285-384`) rebuilds the Scaffold, AppBar, `ConsoleTitle`, `ConsoleMoreMenu`, `ConsoleWorkspace` with `ConsoleOverview`, `ConsoleTerminalPane` with `ConsoleSurface` and `TerminalViewport`, `AgentDialogPanel` and `ConsoleChatPanel`, which re-parses `Session.fromJson` (`console_composer.dart:48`). Caret-only moves trigger the same chain because the controller also notifies on selection changes. `drafts.set` also sums every saved draft's length on every key (`mobile/lib/console_drafts.dart:72-77`).

Only two build outputs depend on the text: the send button's enabled state (`console_composer.dart:127-131`) and `EnterChatHandle.hasDraft` (`dock_home.dart:464`). Both change only when the draft switches between empty and non-empty.

Smallest remedy: keep the draft save in `_draftChanged`, and call `_changed()` only when `editor.text.trim().isEmpty` flips. Draft safety, session targeting and focus stay unchanged.

Proof: extend `mobile/test/terminal_notifier_test.dart`, which already asserts `BuildCounts.of('shell')`. Enter chat mode, type several characters with `tester.enterText`, then assert the shell count is unchanged, the send button becomes enabled after the first character, and `drafts.get(key)` holds the text.

## F2. Android: every request reply and state frame rebuilds the whole shell

Confidence: high for the chain; frequency depends on usage.

Chain: `handleMessage` calls `notifyListeners()` on every `reply` (`mobile/lib/dock_client.dart:697-699`) and every `state` frame (`dock_client.dart:700-702`); protocol 2 also notifies through `StateStream(changed: notifyListeners)` (`dock_client.dart:60-65`). `DockHome` listens to the whole client, so each reply repeats the F1 rebuild. Terminal typing mode sends one `input` request per key (`dock_client.dart:763-768` → `input` at `886-891`), so each key causes one full rebuild when its reply arrives. A composer send causes at least two, plus one per state frame from the PC.

The reply notification has no visible effect: it runs synchronously in `handleMessage` before the awaiting `input()` resumes and clears `inputError` (`dock_client.dart:891`).

Smallest remedy: remove `notifyListeners()` from the `reply` case. In `input()`, notify only when a non-empty `inputError` is cleared. Request errors already reach callers through the rejected future.

Proof: widget test that sends ten terminal-typing inputs through a fake socket that replies immediately; assert `BuildCounts.of('shell')` does not grow and a previous `inputError` still clears.

## F3. PC main process: owner-console bookkeeping runs before each keystroke reaches the PTY

Confidence: high for ordering and work; duration unmeasured. Applies to desktop and Android input.

Chain, per printable key: `session.input` (`electron/desktop-session-commands.cjs:102`) or mobile `input` (`electron/mobile-session-commands.cjs:29-33`) → `Sessions.write` → `ownerInteraction(id, 'typing')` at `electron/sessions.cjs:218`, before `item.terminal.write(data)` at line 220. `OwnerConsoles.interaction` (`electron/owner-consoles.cjs:73-80`) → `changed()` (`164-180`): two `JSON.stringify` passes over all records, a synchronous `atomicJson` write when a critical flag changes, then `emit('changed')`. Listeners run synchronously: `Scheduler.drain` (`electron/scheduler.cjs:62`, `95-120`) and `WorkerSessions.reconcile` (`electron/worker-sessions.cjs:21-30`), which walks every task-loop job and subtask. `TaskLoop.jobs` has no delete path in `electron/task-loop.cjs`, so this walk grows with task history (hypothesis on magnitude).

Enter adds `ownerTurn: true` (a critical change, so a synchronous file write), then `emit('changed')` at `sessions.cjs:223`. That runs `publish()` → `syncState()` → a full synchronous `serviceSnapshot()` (`electron/main.cjs:199-228`, `241-245`, `657`), plus capacity, power, workspace, mobile and owner-sync listeners (`main.cjs:628-672`, `owner-consoles.cjs:142-161`).

Smallest remedy: in `Sessions.write`, write to the PTY first. Record a `typing` interaction only when the data contains a newline, or when the console's last recorded interaction is more than one second old. Scheduling reads exact times and only needs recency at that resolution. The newline path keeps `ownerTurn` immediate, so reservation safety is unchanged.

Proof: unit test with a fake terminal and an `OwnerConsoles` that counts `changed` emissions. Write 50 characters, then `\r`. Assert the terminal received each write before any emission, emissions are at most 2, and `ownerTurn` and `lastInteractionAt` match today's values after Enter. Timing proof needs a main-process trace while typing with a realistic task history.

## F4. Desktop renderer: each state publish repeats full snapshot work and grid layout reads

Confidence: high for the chain; cost depends on snapshot size and publish rate, both unmeasured here.

Chain: each applied protocol 2 batch → `emit()` builds the full snapshot and `structuredClone`s it (`src/state-client.js:160`) → `receive` (`src/app.js:192-275`) → `store.setLegacy` (`app.js:220`) runs `JSON.stringify` on both old and new values for every top-level key (`state-client.js:9`, `38-43`), including ledger, usage history and results that did not change. Protocol 2 already knows which slices changed; this work rediscovers it. Then, on the consoles page, `renderPage()` always runs (`app.js:266`) → `grid.render()` (`src/console/grid.js:76-170`), rewriting each console's expand-button `innerHTML` (`grid.js:149`) and calling `applySidebar`, which reads `titlebar.offsetHeight` (`app.js:278`) after DOM writes. It is reached three times per receive (`grid.js:58`, `app.js:138`, `app.js:261`), and `fitRecords` reads `clientWidth`/`clientHeight` per visible terminal (`src/console/terminal-fit.js:58`). Each read can force a synchronous layout. Keystrokes in the focused xterm wait for this task to finish.

Smallest remedy: forward the batch's changed slice names from `connectStateV2` to `receive` and skip the `setLegacy` deep comparison for protocol 2 updates, keeping it for the legacy `dock:state` fallback. In `grid.js:149`, assign `innerHTML` only when the icon changes, as `grid.js:133-136` already does for state.

Proof: a Node benchmark that feeds a captured, redacted snapshot through `createStateClient().setLegacy` and `structuredClone`, then records the time per call. For the layout work, use a headless Chromium performance trace of `receive` on the consoles page, counting forced layouts before and after.

## F5. Android send: two sequential round trips and a fixed 150 ms floor

Confidence: high for the sequence (read from code); real round-trip time unmeasured.

Chain: `ComposerController.send` sets `sending` and disables the composer controls (`composer_controller.dart:165-166`, `console_composer.dart:62-74`) → `ConsoleSubmission.submit` (`mobile/lib/core/terminal/console_submission.dart:76-97`): `input(text)` round trip, a fixed 150 ms delay, a re-check, then `input('\r')` round trip. Each round trip includes the F3 main-process work, and Enter adds the full publish. Each reply and the resulting state frame trigger F2 rebuilds. The PC already implements the same write, wait 150 ms and write sequence with a launch check in `MessageQueue.send` (`electron/message-queue.cjs:116-122`).

Smallest remedy: measure first. Log timestamps around both requests and the delay on a real phone. If round trips dominate, apply F2 and F3 before changing the protocol. The 150 ms delay protects CLI paste handling and should stay.

Proof: client-side timing log in debug builds, plus a fake-socket test that asserts exactly two `input` requests and an unchanged refusal when the console changes during the delay.

## Not covered

Not covered here: backend polling, the scheduler's 1 s interval and the publish rate during agent output (the coordinator is checking these), xterm.js parse cost, mobile `TerminalViewport` painting, and secure-storage write latency for drafts. Rendered and real-device timing remain unverified.

## Scope update from the user

The user clarified Windows desktop after dispatch. Android findings F1, F2 and F5 are retained as separate observations and do not explain this reported desktop issue. See desktop-latency-effects-review-2026-11-08.md for the coordinator's desktop/effects follow-up and probe limitations.
