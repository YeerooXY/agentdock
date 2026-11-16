# Header navigation verification

31 October 2026. Current `main` working tree; unrelated edits preserved.

Navigation now shares the title bar. Tasks uses a clipboard, Projects uses stacked folders, and Results uses a checked document. Settings has a divider. Navigation icons use a consistent 1.9 px stroke and light foreground; window controls also use a light foreground. The former bottom reservation is removed. The header keeps its existing drag area, window controls and fullscreen reveal behavior.

The hover scrollbar came from `.sidebar nav { overflow-y:auto }` in `src/workbench.css`. The header overrides both axes to `visible`, so tooltip labels do not create a scrolling container. On narrow widths the navigation occupies a second header row with 44 px buttons; the duplicate home logo is hidden below 401 px.

## Checks

- `npm run build`: passed on the final source.
- `npm test`: 657 passed, 1 skipped, 0 failures on Windows. Log: `artifacts/navigation-unit-tests.log`.
- `npm run test:linux`: passed, including all five `test:desktop` scripts under Docker/Xvfb and the Linux unit suite. Log: `artifacts/navigation-desktop-tests.log`. The existing grid/expanded-console assertions were updated to check the header layout and full bottom extent. The final window-control color adjustment was subsequently checked by build and all four browser profiles.
- `node artifacts/navigation/check.cjs`: passed on Windows Chromium, desktop WebKit with Mac profile, Pixel 7 Chromium and iPhone 13 WebKit. The last three are emulated. State and IPC use local synthetic fixtures; external requests are blocked.
- Inspected screenshots for all four profiles: icon weight/alignment, selected state, hover label placement, keyboard focus, spacing and overflow. All six navigation buttons work; Settings closes with Escape. Enter activates Tasks and Tab moves to Results.
- At 320, 680, 681, 768 and 1440 CSS px: no page overflow or overlapping navigation buttons. Hovered navigation uses visible overflow on both axes. Expanded consoles meet the viewport bottom. F11 top-edge reveal keeps navigation clickable.
- Navigation color pairs: idle 13.89:1, hover 14.08:1, selected 11.28:1. Window controls: 11.88:1. These calculations cover solid foreground/background colors, not antialiased edge pixels or an accessibility certification.
- `git diff --check` for edited tracked files: passed.

Evidence and the local verification script are in `artifacts/navigation/`; `checks.json` records geometry and browser errors. Screenshots are routine verification evidence, not Results deliverables.

## Scoped review

Page checklist 13–15 and 19: checked for this navigation change (named controls, hidden decorative SVGs, measured contrast, focus/keyboard checks, locally authored SVG paths). Items 1–12, 16–18 and 20: no changes to collection, policies, claims, payments, contact details, marketing or retention. Security checklist 21–69: no new backend, remote calls, input or dependency changes; existing protections exercised by the project suite remain in place. Item 70: source and rendered navigation reviewed. This is a toolbar repair, not a fresh whole-application security or policy audit.

Remaining real-device checks: actual Mac/iPhone Safari font rendering, touch and native window controls; physical Android behavior; native Windows frameless-window dragging/fullscreen in the running app. Docker tests establish Linux Electron behavior, and Windows browser checks establish Chromium rendering. No claim of native macOS/iOS or physical-phone verification is made.
