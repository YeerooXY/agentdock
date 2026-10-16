# Console notification review

16 October 2026. Applies to the console grid, fullscreen terminal and their shared notification counts. Supplements the [setup and console review](setup-resize-review.md).

Clicking inside a terminal, typing, inserting composed text, or pasting acknowledges that console's ready/attention state. Its ready badge disappears and related completion/question entries become read in Inbox. Opening fullscreen also acknowledges them. Other consoles, errors and unread Results retain their notifications. Inbox history is preserved. A later completion creates a new notification, even when the console already has focus.

Only user interaction triggers acknowledgment. Ordinary focus, incoming output and automatic terminal protocol replies do not. No terminal input is intercepted or changed. Repeated input does not rewrite an already-read Inbox.

## Verification

- `npm run build`: passed.
- `npm test`: 66 passed, one WSL installation check skipped.
- `npm run test:desktop`: all four scripts passed with temporary profiles and real Windows PTYs. Added checks cover clicking and typing in the grid/fullscreen, text insertion, paste, an already-focused console completing again, automatic cursor-position replies, per-console Inbox scope and independent Results counts.
- `node scripts/visual-layout-check.cjs`: all four profiles passed. Grid clicks, typed/composed input and fullscreen typing clear only the selected console's badge. No renderer errors, horizontal page/content overflow or selected axe contrast/name/label violations.
- Persistence checks confirm read flags survive a new Inbox instance, unrelated errors/alerts stay unread, repeated acknowledgment does not save again, and later completions remain unread.
- No paid model requests. The user's running Dock and consoles were left running; the updated main process loads on the next app restart.

| Profile | Coverage | Status |
| --- | --- | --- |
| Windows PC | Chromium, 1440 x 1000; native Electron as well | Passed |
| Mac Safari | WebKit, 1440 x 1000, emulated on Windows | Passed in emulation |
| Android Chrome | Chromium, Pixel 7, 412 x 839 | Passed in emulation |
| iPhone Safari | WebKit, iPhone 13, 390 x 664 | Passed in emulation |

Inspected grid and fullscreen screenshots from all four profiles: the interacted terminal loses its red badge/green ready outline, the other terminal keeps its badge, and Results still shows two batches. Icon alignment, spacing, wrapping and the terminal's bottom gap remain intact. Native fonts, physical mobile keyboards/IME and real macOS/iOS behavior remain manual checks; these browser profiles do not establish native-device support.

Screenshots are in `artifacts/console-layout/*notification*.png`; browser versions and scan results are in `artifacts/console-layout/browser-report.json`. The report and screenshot archive are also saved together in Results.

## Required page review

These entries apply to both affected terminal views and the shared Inbox count. There are no new forms, network calls, dependencies or visual styles. Unchanged policy context and primary accessibility references are recorded in the linked earlier review. This is a local interaction check, not a legal or accessibility certification.

| # | Item | Status and reason |
| --- | --- | --- |
| 1 | Privacy information | Checked: only existing local read flags change; no new collection or sharing. |
| 2 | Terms | Not applicable: no new service or transaction. |
| 3 | Refunds | Not applicable: no sale. |
| 4 | Cookies/storage | Checked: read flags persist in the existing local Inbox file. |
| 5 | Consent banner | Not applicable: no tracking technologies added. |
| 6 | Form consents | Not applicable: no new forms or consent flow. |
| 7 | Unnecessary data | Checked: no additional data; raw input is not saved by the acknowledgment handler. |
| 8 | Third-party SDKs | Checked: no added SDK or network flow. |
| 9 | Dark patterns | Checked: interaction clears the relevant alert; history and unrelated alerts remain. |
| 10 | Hidden fees | Not applicable: no billing or paid request. |
| 11 | Fake reviews | Not applicable: no testimonials. |
| 12 | Unsupported claims | Checked: documented behavior matches tests; emulation limits are explicit. |
| 13 | Accessible names | Checked: existing labels remain; hidden badges are removed from display. |
| 14 | Contrast | Checked: unchanged colors; selected axe checks passed in captured states. |
| 15 | Keyboard navigation | Checked: typing/insertion acknowledges without consuming input; existing Vim and focus tests passed. |
| 16 | Business details | Not applicable: no new commercial page or seller information. |
| 17 | Children's data | Not applicable: no audience/data collection change. |
| 18 | Email unsubscribe | Not applicable: notifications are local, not email. |
| 19 | Asset licenses | Checked: no new visual assets, fonts or dependencies. |
| 20 | Deletion | Checked: Inbox clear/dismiss and Results deletion still pass; acknowledgment preserves history. |
