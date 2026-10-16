# Console layout and theme verification

Reviewed 16 October 2026. This covers the current source build; the published 0.4.0 installer has not been replaced.

Follow-up: [edge resizing, motion, badges and cursor verification](console-interaction-review.md) replaces the size picker described below and records the latest checks.

## Changes checked

- Drag previews contain a frozen copy of the terminal. Moving and resizing reuse the live process and its output.
- Panels occupy rectangular areas of the 3 × 3 workspace. Sizes, positions and console identities survive restoration. Invalid layouts leave the existing layout intact.
- A normal plus click and Ctrl+Shift+N launch immediately. Right-clicking plus exposes the optional name, agent, model and folder. One-time choices leave defaults unchanged.
- Names remain on closed slots. Results retain their console names and are grouped by console and task. Two batches containing three and five files produce a badge of two; viewing or deleting a batch updates it.
- Clear inbox removes alerts without affecting results or consoles. Individual and batch result deletion preserve project originals.
- The refined emblem, pink-blue icons and accents, distinct black surfaces, colored names, ready pulse and fullscreen bottom spacing render correctly. Reduced motion disables the pulse.
- Requested helper text was removed. Add files aligns with the filters; pagination is centered at the bottom of the Results content.

## Automated and visual evidence

| Check | Outcome |
| --- | --- |
| `npm run build` | Passed on the final source. |
| `npm test` | 55 passed; one WSL-specific test skipped because the required installation is unavailable. |
| `npm run test:desktop` | Passed all three scripts: existing desktop coverage, workbench, and console layout. Uses isolated profiles and real Windows terminals. |
| `node scripts/visual-layout-check.cjs` | Passed all four profiles on the final build. No horizontal page/content overflow or renderer exceptions. |
| Selected axe rules | No violations across 13 captured states per profile: text contrast, button names, labels and dialog names. This is a limited scan, not full accessibility certification. |
| Paid requests | None. Provider calls are mocked or disabled in tests. |

The desktop tests cover drag contents, keyboard launching, right-click naming, 3 × 1 and 2 × 2 resizing, process/output preservation, disabled sizes, Escape and focus return, fullscreen persistence, batch counts, deletion, inbox clearing, names and theme persistence. Existing tests also exercise nine consoles, Vim navigation, restoration, draft retention, encrypted credentials and shared tools.

| Profile | Engine and viewport | Coverage |
| --- | --- | --- |
| PC | Chromium 156 on Windows; 1440 × 1000 | Native browser rendering plus separate Electron/ConPTY tests. |
| Mac | WebKit 27.2, Desktop Safari profile; 1440 × 1000 | Emulated on Windows. |
| Android | Chromium 156, Pixel 7 profile; 412 × 839 | Emulated. |
| iPhone | WebKit 27.2, iPhone 13 profile; 390 × 664 | Emulated. |

Screenshots were inspected for icon weight, alignment, wrapping, spacing, overflow, focus and disabled states. Fixes from this inspection include narrow Inbox wrapping, the narrow Usage grid, WebKit select sizing and icon contrast on primary buttons. Browser fixtures use the real UI with mocked IPC; they do not establish native Mac or phone app support.

Screenshots and machine reports are in [artifacts/console-layout](../artifacts/console-layout/), including `browser-report.json`. `desktop-grid.png`, `drag-preview.png`, `fullscreen.png` and `results.png` show the native Electron checks. Each browser profile has captures for Consoles, sizes, chooser, Results, Inbox, Website review, Usage, API, Keys, Tools, Instructions, Settings and fullscreen terminal. The evidence archive and representative images are saved together in Dock Results under one verification batch.

To repeat: run the build and desktop tests, then `node scripts/visual-layout-check.cjs`. Playwright Chromium and WebKit must be installed. Generated screenshots are local artifacts and excluded from Git.

Remaining manual coverage: real macOS/iOS font rendering, physical Android/iPhone touch and software keyboards, and a complete assistive-technology audit. These were not claimed as passed. The running user session was left open; quit and reopen Dock when ready to load this source build.

## Page checklist

Every row below was considered for **Consoles/fullscreen, Results, Inbox, Website review, Usage, API, Keys, Tools, Instructions and Settings**. The status applies to each of those views; view-specific details are identified in the reason. This is a local desktop UI review, not a review of websites opened in Website review, connected providers, or a legal certification.

| # | Item | Status and reason |
| --- | --- | --- |
| 1 | Privacy information | Checked for changed data flows. Console names, stable console IDs and viewed timestamps stay in local storage. The README describes local files, provider sharing and deletion. No new remote collection was introduced. |
| 2 | Terms of service | Not applicable to this UI change: no hosted service terms, purchase contract or account agreement was added. Connected providers retain their own terms. |
| 3 | Refund policy | Not applicable: these views have no checkout, subscription sale or refund flow. |
| 4 | Cookie/storage information | Checked. Layout, names, theme and viewed state are local preferences/records. No new cookies, analytics or advertising storage were added. |
| 5 | Cookie consent banner | Not applicable to this change: no nonessential web tracking or consent-dependent SDK was introduced. |
| 6 | Form consents | Checked for scope. Naming and settings are local actions; existing API/tool forms keep their explicit action and credential binding. No marketing consent or new personal-data field was added. |
| 7 | Unnecessary data | Checked. Only layout, console attribution and viewed state were added; drag previews exist only during dragging. No terminal transcript persistence or credential exposure was added. |
| 8 | Third-party SDKs | Checked. No new production SDK or remote font/image dependency. Browser automation uses existing development tooling. |
| 9 | Dark patterns | Checked. Naming is optional, launch remains instant, settings remain changeable, and clear/delete actions are directly available. |
| 10 | Hidden fees | Checked for scope. API estimates remain in Usage; existing provider/credit explanations remain. Moving, resizing, viewing and clearing do not trigger paid requests. |
| 11 | Fake reviews | Not applicable: no testimonials or customer reviews appear in these views. Verification fixtures are explicitly labeled. |
| 12 | Unsupported claims | Checked. Missing usage remains unknown, costs remain estimates, and automated website review is not presented as certification. |
| 13 | Alt text and names | Checked. Decorative SVGs are hidden from assistive technology; icon buttons have names and result previews use their saved titles. The decorative drag copy is inert and aria-hidden. |
| 14 | Color contrast | Checked within the captured states. Selected axe contrast checks passed in all four profiles; primary-button icon contrast was corrected. Ready state and unread results also have labels/counts. See [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). |
| 15 | Keyboard navigation | Checked for affected flows: launch shortcut, size selection, chooser, Escape/focus return, keyboard panel moves and existing Vim navigation. Dialog behavior follows the [WAI dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Reduced motion is respected, as discussed in [W3C animation guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html). Full screen-reader and physical-device checks remain manual. |
| 16 | Business details | Not applicable to these local controls: no seller identity or commercial landing page was introduced. No business facts were invented. |
| 17 | Children's data | Not applicable to this change: no child-directed flow, age collection or child account service was added. |
| 18 | Email unsubscribe | Not applicable: Inbox is local app notifications, not a marketing email service. |
| 19 | Font/image licenses | Checked. The new emblem is original vector geometry in `assets/icon.svg`, reproduced by `scripts/make-icon.ps1`; existing OS fonts are retained. No third-party art was added. |
| 20 | Data deletion | Checked for affected records. Individual/batch Results deletion and persistent Inbox clearing passed. Results deletion recycles Dock's copy; project originals remain. Provider histories are outside Dock's local deletion controls. |
