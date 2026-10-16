# Console interactions and cursor verification

Earlier verification on 16 October 2026. See [the 0.5.0 setup and resize review](setup-resize-review.md) for the final packaged checks and additional cursor fix.

## Behavior

- All eight panel edges/corners resize by pointer and snap to the 3×3 grid. Top/left resizing changes the anchor correctly. Preview calls do not save or change sessions. Escape cancels; invalid layouts preserve the original arrangement. Focused handles also accept arrow keys.
- Dragging carries a frozen terminal view. Neighbors slide to their proposed positions; the copy expands into the final panel on drop. The live terminal remains unique. A keyboard move immediately after a drop waits for settlement instead of being lost. Reduced motion skips these animations.
- Results has red icon badges with white batch counts, in the sidebar and title bar. Completed consoles have matching badges on their panel icon, fullscreen tab and HUD slot; the Consoles navigation icon counts ready consoles. Opening a console acknowledges its completion.
- Top-right controls are HUD, minimize, fullscreen/restore and close to tray. Existing close/collapse behavior preserves sessions.
- Cursor blinking defaults off and can be changed in Appearance. The steady style overrides xterm blink animation even when an application requests blinking through DECSCUSR. Short PTY fragments are combined over 16 ms without changing ANSI bytes; larger output flushes promptly. Terminal fitting skips unchanged dimensions and stays suspended during a layout preview.

## Cursor investigation and limits

The installed Codex is 0.156.1. Local xterm source confirms that terminal programs can request cursor blinking independently of the initial terminal option; Dock previously also enabled blinking when expanding a console. The new steady style handles both sources of blink animation. Tests include an explicit CLI blink request and fragmented hide/show sequences.

The reported intermittent flicker in a separate CMD window was not reproduced under the user's exact workload. This update does not change CMD or Codex's global configuration, and it does not suppress deliberate cursor hide/show commands. No paid model request was made to reproduce it.

For comparison outside Dock, `codex -c tui.animations=false` disables Codex's ASCII animations and shimmer for that run. `--no-alt-screen` changes its screen mode. These are documented troubleshooting controls, not a verified cure for this report: [Codex TUI options](https://learn.chatgpt.com/docs/config-file/config-advanced#tui-options), [CLI options](https://learn.chatgpt.com/docs/cli/reference).

## Verification

| Check | Result |
| --- | --- |
| `npm run build` | Passed. |
| `npm test` | 57 passed; one WSL-specific test skipped because that installation is absent. |
| `npm run test:desktop` | All three scripts passed with isolated profiles and real Windows PTYs. Covers resize, invalid/cancel behavior, swap/drop, immediate keyboard movement, process/output preservation, badges, acknowledgments, cursor setting, fullscreen, tray, nine consoles, restoration, Results and Inbox. |
| Four browser profiles | Passed, using the real renderer with mocked IPC. No renderer errors or horizontal page/content overflow. |
| Selected axe checks | No violations for color contrast, button names, labels or dialog names in the captured states. This is not a complete accessibility audit. |

| Profile | Engine / viewport | Coverage |
| --- | --- | --- |
| Windows PC | Chromium 156; 1440×1000 | Native Windows browser plus Electron/ConPTY checks. |
| Mac Safari | WebKit 27.2; 1440×1000 | Emulated on Windows. |
| Android Chrome | Chromium 156, Pixel 7; 412×839 | Emulated. |
| iPhone Safari | WebKit 27.2, iPhone 13; 390×664 | Emulated. |

Each profile captures Consoles, chooser, Results, Inbox, Website review, Usage, API, Keys, Tools, Instructions, Settings and fullscreen terminal. PC and Mac also capture a hovered resize edge. Screenshots were inspected for icon/badge alignment, spacing, wrapping, overflow and focus. Settings and terminal cursor rendering were checked in all four profiles. Real macOS/iOS font rendering, physical-device input and a complete assistive-technology audit remain manual checks.

Screenshots and `browser-report.json` are in [artifacts/console-layout](../artifacts/console-layout). Native evidence is `desktop-grid.png`, `drag-preview.png`, `fullscreen.png` and `results.png`. The current evidence archive includes the 50 browser captures and four native captures, excluding older size-picker screenshots. Run the build, desktop tests and `node scripts/visual-layout-check.cjs` to repeat.

## Page checklist

Reviewed for Consoles/fullscreen, Results, Inbox, Website review, Usage, API, Keys, Tools, Instructions and Settings. These are local desktop views. Each status below applies to all ten views unless its reason identifies a specific control; it does not certify external websites or connected providers.

| # | Item | Status and reason |
| --- | --- | --- |
| 1 | Privacy information | Checked for this change. Layout and cursor preferences stay local; the README explains local storage and provider sharing. No new remote collection. |
| 2 | Terms of service | Not applicable: no hosted account, contract or purchase flow was added. |
| 3 | Refund policy | Not applicable: no checkout or sale in these views. |
| 4 | Cookie/storage information | Checked. The cursor setting joins existing local preferences; no new web tracking storage. |
| 5 | Cookie consent | Not applicable: no tracking or consent-dependent SDK introduced. |
| 6 | Form consents | Checked for scope. Settings and layout changes are local, explicit actions; no new marketing or personal-data form. |
| 7 | Unnecessary data | Checked. Previews are ephemeral, ANSI output is not newly persisted and no credential data reaches the renderer. |
| 8 | Third-party SDKs | Checked. Existing xterm and browser tooling only; no new production package, remote asset or tracking. |
| 9 | Dark patterns | Checked. Escape cancels resizing, invalid layouts preserve work, and blinking remains optional. |
| 10 | Hidden fees | Checked for scope. These controls make no model requests; existing usage estimates and paid-tool explanations remain. |
| 11 | Fake reviews | Not applicable: no testimonials. Test fixtures are labeled. |
| 12 | Unsupported claims | Checked. CMD flicker remains an unconfirmed cause; automated checks are not described as certification. |
| 13 | Alt text/names | Checked. Resize controls and window buttons have accessible names; badges have counts/context; drag copies are inert and hidden from accessibility. |
| 14 | Contrast | Checked in captured states with selected axe rules. Red badges use white numbers; ready state also has labels and counts. [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). |
| 15 | Keyboard navigation | Checked for handles, moves, immediate post-drop movement, Escape, chooser, fullscreen, settings and existing Vim controls. Reduced motion disables the new motion. [W3C interaction animation guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html). Full assistive-technology coverage remains manual. |
| 16 | Business details | Not applicable: local controls introduce no seller or commercial landing page. |
| 17 | Children's data | Not applicable: no age collection or child-directed flow added. |
| 18 | Email unsubscribe | Not applicable: Inbox remains local alerts, not marketing email. |
| 19 | Asset licenses | Checked. Existing OS fonts and original vector icons; no added third-party art. |
| 20 | Data deletion | Checked. Existing Results deletion and Inbox clearing still pass; project originals and running consoles remain intact. |
