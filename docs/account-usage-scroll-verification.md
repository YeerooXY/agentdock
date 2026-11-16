# Usage, navigation and Codex scroll checks

Verified 31 October 2026.

## Changes

- Usage circles increased from 84 to 120 CSS pixels on desktop and from 80 to 112 on narrow layouts. Percentage and caption text also increased.
- Paste screenshot sits after the flexible title-bar space and before window controls. Appearing and disappearing leaves navigation and window controls in place.
- The application mark is Pa. SVG, PNG, ICO and Android launcher assets were regenerated.
- Project turns and Image generation were removed from Usage. Existing records remain stored.
- Terminal wheel events are observed during capture because xterm consumes them before bubble listeners run. Scrolling upward immediately disables following; the viewport and history anchor are updated after xterm applies its scroll. New output then preserves the history position, and returning to the bottom resumes following.

## Verification

- `npm run build`: passed.
- `npm test`: 657 passed, one skipped, zero failures.
- `npm run test:linux`: Linux unit tests and all five headless desktop smoke scripts passed.
- `node scripts/account-usage-scroll-check.cjs`: passed on Windows Chromium, desktop WebKit, Pixel 7 Chromium and iPhone 13 WebKit profiles. Uses synthetic accounts, sessions and IPC; no provider requests.
- Regression checks cover upward scrolling during continuous output, stable history position, return to live output, no CLI input from scrolling, fixed navigation positions when screenshot availability changes, removed Usage panels, ring dimensions, caption containment and horizontal overflow. Also checked 320px width.
- Inspected screenshots from all four profiles for alignment, wrapping, spacing, icon weight, contrast and overflow. Mac, Android and iPhone checks were emulated. iPhone scroll uses a synthetic wheel event because Playwright mobile WebKit does not support mouse-wheel input. These checks do not establish native macOS/iOS fonts, physical touch scrolling or device behavior.
- The running desktop app was confirmed to load the tested `index-BNqV4S4f.js` build. Its visible console had insufficient history for a meaningful native wheel regression, so the four-profile regression provides the scroll verification. Existing sessions were preserved. Temporary inspection was detached and closed.

Evidence: `artifacts/account-refresh/visual-checks.json`, profile screenshots, `build.log`, `unit-tests.log` and `desktop-tests.log`.

## Saved project review

| Project | Verified position and updated next step |
| --- | --- |
| Agentdock | Desktop and Android sources, tools, tasks and SSH support exist. Real Linux SSH/tmux, Android reconnect and native-device checks remain. Corrected the project folder and attached current technical references. |
| Playtime | Tracking, study rules, course context, home rings and weather are implemented. Reviewed existing verification records; native course launch, tutoring and hardware checks remain. |
| Nemosite | Portfolio implementation and contact handling exist. Fresh checks passed for 107 HTML pages, 8,403 local references and 18 mocked Worker tests. Launch date and the 1,000-visitor goal still require analytics evidence. |
| Agent workflow | Fresh orchestrator tests (51), client tests (22) and website-study validation passed. The 16-run website benchmark remains to be scheduled. Added the website-study folder and document references. |
| SFDungeon | Simulator, adviser, practice host and pilot configuration exist. Live validation and authorized event testing remain; budgets stay zero. Corrected the simulator and study-setup folders. |
| Robonslaught | Reviewed Mall and Hospital implementation notes on the existing `codex/cache-reveal-polish` branch. Playtesting and documented encounter, art and collection work remain. No Unity build or playtest was claimed. |

Updated all six saved project records with evidence, reference paths and next steps; existing plan approvals and milestone states were preserved. The Agentdock goal's generic phrase "any user can achieve anything" was replaced with the concrete desktop, tools, Android and public-release scope.

Six old tasks were removed from the active list and archived: four accepted tasks, one superseded failed client attempt and one stopped report whose deliverables were subsequently completed. Two recent Playtime tasks awaiting acceptance remain. Existing result reports and project source files were retained.

Recovery copies are under `%APPDATA%/Paddock/recovery/project-review-20261031/projects-before.json` and `%APPDATA%/Paddock/tasks/archive/review-20261031/`. Local audit receipts are `artifacts/account-refresh/project-update-result.json` and `task-cleanup-result.json`.
