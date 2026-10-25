# Console expansion and project links

25 October 2026. Prompt 7. Existing uncommitted work on `main` was preserved. No running Paddock window, real console or real project binding was changed.

## Changes

- The expand control enlarges the selected grid card in place. It retains the card header, project control, appearance, xterm instance and grid slot. The same control restores the grid; `Ctrl+Shift+Enter` is the keyboard restore action. Plain Escape remains available to the terminal, and Escape closes a nested dialog or popover before restoring the grid.
- Expansion keeps other consoles alive but removes covered surfaces from focus and pauses their decorative rendering. Resize and fit apply to the visible console. Scrollback anchors survive width changes; consoles already following output return to the bottom. Saved consoles with restore errors keep their retry action.
- The ended-console tabs came from the old standalone terminal page, which rendered all saved sessions. The grid now excludes dismissed sessions from opening and selection. An empty console preview says “No console selected.”
- A console has no project link when `projectId` is null. Paddock does not infer one from the chat title or working folder. The project picker explains how to choose a saved project; its folder control operates on the console that opened it.
- Settings now has **Confirm before ending a console**, default on for existing and new settings. Turning it off skips Paddock’s `session.end` confirmation. It does not change Windows UAC or quit, update and tool-permission dialogs.

## Verification

| Check | Result |
| --- | --- |
| `npm run build` | Passed. Vite reports the existing JavaScript chunk-size advisory above 500 kB. |
| `npm test` | 267 passed, 1 WSL-specific skip, 0 failed. Includes end confirmation, cancellation, stale-target and settings validation coverage. |
| Expansion browser fixture | Passed in Windows Chromium, desktop WebKit, Pixel 7 Chromium and iPhone 13 WebKit profiles. Checks same terminal node, buffer-read/input counts, restore and slot retention, wrapped scrollback, delayed selection/state responses, stale sessions, Settings updates while expanded, Escape/focus, reduced motion, sky/Wave pause and 2×2, 3×3 and 4×2 grids. Results: [`checks.json`](../.build/prompt7-console-expansion/checks.json). Captures are in the same directory. |
| Settings live regression | All four browser profiles passed: 20 live updates, 39 motion checks and 22 color-isolation checks per profile. Copied reports and captures: [`verification/settings`](../.build/codex-prompt-runs/2026-10-24/7/verification/settings). |
| Manual capture review | Inspected expanded captures for all four profiles, restored captures for all four, and the Windows 320 px expansion. The card fills the content area below the title bar; the normal header and controls remain and no tab strip appears. |

The desktop WebKit emulation reported `document.hidden=false` and `visibilityState=visible`, but its animation frames advanced slowly: the first deferred scroll restore began about 1.2 seconds after scheduling, and the bounded rendered-anchor wait completed in about 1.25 seconds. The [recorded trace](../.build/prompt7-console-expansion/desktop-webkit-mac-emulation-scroll-restore-trace.json) contains the frame and rendered-row evidence. The fixture now waits for the actual restored content. No visibility override was used. This is headless WebKit timing evidence, not a physical Safari timing claim.

The iPhone 13 profile used xterm’s `Shift+PageUp` scroll path because Playwright mobile WebKit does not support `mouse.wheel`. Physical iPhone touch scrolling, virtual-keyboard behavior, native macOS fonts and assistive-technology use remain unverified. Pixel 7 and iPhone 13 results are device emulations.

## Project-link evidence

The available `dock_context` reported `chatTitle: Agentdock`, `launchDirectory: C:/Users/7yeer/Projects` and `projectId: null`. This establishes that the console was unlinked; the title and parent folder do not identify a saved project. The expansion fixture opens the picker from its selected console and verifies the unlinked state. Unit tests cover explicit project-ID routing and project/title persistence rules. The full UI attach/unlink/reopen sequence passed in the isolated Electron check on 25 October 2026.

The separate account sign-in review has been deferred by the user. `node scripts/project-link-smoke.cjs` passed creation/linking from a live console, title choices, unlinking, persistence and reopening while retaining the original console process. `node scripts/project-link-visual-check.cjs` passed Windows Chromium, desktop WebKit, Android Chromium and iPhone WebKit profiles. Evidence: [native checks](../.build/prompt7-project-link/native-checks.json) and [visual checks](../.build/prompt7-project-link/visual-checks.json). Captures for each profile were inspected; iPhone Settings scroll placement was a fixture scroll position, and the project picker and primary actions fit the viewport. `npm run test:desktop` passed all four suites against Electron 44.9.3 and the final source. No paid model request or credential-file access was used.

## Review scope

This note records the paths changed by prompt 7; it is not a new product-wide 20-page/50-security-item audit. Existing console interaction, layout, appearance, notification and project reviews remain the evidence for unchanged surfaces: [console interactions](console-interaction-review.md), [console layout](console-layout-review.md), [current motion and effect scope](console-effects-review.md), [themes](console-themes-review.md) and [project linking](projects-previews-review.md). Prompt 7’s scoped checks covered keyboard focus and dialog order, retry and cancel behavior, explicit project choice, persisted setting defaults/validation, and the existing local-only session/credential boundary. No account credential or login token was read or exposed.
